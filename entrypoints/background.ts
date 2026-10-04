import { streamChat } from '@/lib/llm';
import { findElement } from '@/lib/macros';
import { ACT_SYSTEM, ASK_SYSTEM, DEV_SYSTEM } from '@/lib/prompts';
import { loadConfig, PROVIDERS, resolveLlm } from '@/lib/settings';
import type {
  ActionResult,
  BgToPanel,
  ChatMsg,
  ContentRequest,
  Config,
  LlmSettings,
  LogEntry,
  Macro,
  MacroStep,
  Mode,
  PageAction,
  PanelToBg,
  Snapshot,
} from '@/lib/types';

type Port = ReturnType<typeof browser.runtime.connect>;

const RESTRICTED = /^(chrome|edge|brave|about|moz-extension|chrome-extension|view-source|devtools):/i;
const RESTRICTED_HOSTS = /^https:\/\/(chromewebstore\.google\.com|chrome\.google\.com\/webstore|addons\.mozilla\.org)/i;
const RISKY = /\b(pay|purchase|buy|order|checkout|delete|remove|confirm|submit|send|transfer|subscribe|unsubscribe|sign ?out|log ?out|post|publish)\b/i;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** CSS applied via the "Apply" button, kept so it can be undone. */
const appliedCss = new Map<string, { tabId: number; css: string }>();

export default defineBackground(() => {
  // Open the UI when the toolbar icon is clicked.
  const sp = (globalThis as { chrome?: { sidePanel?: { setPanelBehavior?: (o: object) => Promise<void> } } })
    .chrome?.sidePanel;
  if (sp?.setPanelBehavior) {
    sp.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  } else {
    const sidebar = (browser as unknown as { sidebarAction?: { toggle: () => Promise<void> } })
      .sidebarAction;
    if (sidebar) browser.action.onClicked.addListener(() => void sidebar.toggle());
  }

  browser.runtime.onConnect.addListener((port) => {
    if (port.name !== 'webpilot') return;
    new Session(port);
  });
});

class Session {
  private abort: AbortController | null = null;
  private approvals = new Map<number, (ok: boolean) => void>();
  private nextId = 1;
  private paused = false;

  constructor(private port: Port) {
    port.onMessage.addListener((m) => void this.onMessage(m as PanelToBg));
    port.onDisconnect.addListener(() => {
      this.abort?.abort();
      this.approvals.forEach((r) => r(false));
    });
  }

  private send(m: BgToPanel) {
    try {
      this.port.postMessage(m);
    } catch {
      /* panel closed */
    }
  }

  private async onMessage(m: PanelToBg) {
    switch (m.type) {
      case 'run':
        await this.run(m.mode, m.prompt, m.history, m.tabId);
        break;
      case 'replay':
        await this.replay(m.macro, m.tabId);
        break;
      case 'tables':
        await this.exportTables(m.tabId);
        break;
      case 'stop':
        this.paused = false;
        this.abort?.abort();
        this.approvals.forEach((r) => r(false));
        break;
      case 'pause':
        this.paused = true;
        break;
      case 'resume':
        this.paused = false;
        break;
      case 'approve':
        this.approvals.get(m.id)?.(m.ok);
        this.approvals.delete(m.id);
        break;
      case 'apply':
        await this.apply(m.key, m.tabId, m.lang, m.code);
        break;
      case 'undo':
        await this.undo(m.key);
        break;
    }
  }

  // ----- Run ---------------------------------------------------------------

  private async run(mode: Mode, prompt: string, history: ChatMsg[], tabId: number) {
    this.paused = false;
    this.abort?.abort();
    const abort = (this.abort = new AbortController());
    try {
      const config = await loadConfig();
      const llm = resolveLlm(config);
      const preset = PROVIDERS[llm.provider];
      if (preset.needsKey && !llm.apiKey) {
        throw new Error(`Add your ${preset.label} API key in Settings (gear icon) first.`);
      }
      await this.ensureContent(tabId);
      if (mode === 'act') await this.actLoop(config, llm, prompt, tabId, abort.signal);
      else await this.answer(mode, llm, prompt, history, tabId, abort.signal);
      this.send({ type: 'done' });
    } catch (e) {
      if ((e as Error).name === 'AbortError' || abort.signal.aborted) {
        this.send({ type: 'done' });
      } else {
        this.send({ type: 'error', message: (e as Error).message });
      }
    }
  }

  /** Ask & Dev: gather page context, then stream the answer token by token. */
  private async answer(
    mode: Mode,
    llm: LlmSettings,
    prompt: string,
    history: ChatMsg[],
    tabId: number,
    signal: AbortSignal,
  ) {
    let context: string;
    if (mode === 'dev') {
      const d = await this.tab<{
        url: string;
        title: string;
        html: string;
        elements: string;
        logs: LogEntry[];
      }>(tabId, { kind: 'dev', max: 14000 });
      const logs = d.logs.length
        ? d.logs.map((l) => `- [${l.kind}] ${l.text}`).join('\n')
        : '(none captured since the page loaded)';
      context = `PAGE: ${d.title}\nURL: ${d.url}\n\nCONSOLE / NETWORK ISSUES:\n${logs}\n\nVISIBLE INTERACTIVE ELEMENTS:\n${d.elements}\n\nHTML (stripped):\n${d.html}`;
    } else {
      const p = await this.tab<{ url: string; title: string; selection: string; text: string }>(
        tabId,
        { kind: 'page', max: 24000 },
      );
      context =
        `PAGE: ${p.title}\nURL: ${p.url}\n` +
        (p.selection ? `\nUSER SELECTION:\n${p.selection}\n` : '') +
        `\nPAGE TEXT:\n${p.text}`;
    }
    const messages: ChatMsg[] = [
      ...history.slice(-8),
      { role: 'user', content: `${context}\n\n---\n${prompt}` },
    ];
    await streamChat(
      llm,
      mode === 'dev' ? DEV_SYSTEM : ASK_SYSTEM,
      messages,
      (text) => this.send({ type: 'token', text }),
      signal,
    );
  }

  // ----- Act loop ----------------------------------------------------------

  private async actLoop(
    config: Config,
    llm: LlmSettings,
    goal: string,
    tabId: number,
    signal: AbortSignal,
  ) {
    const trail: string[] = [];
    const recorded: MacroStep[] = [];
    const startUrl = (await browser.tabs.get(tabId)).url ?? '';
    let parseFails = 0;
    let lastKey = '';
    let repeats = 0;

    for (let step = 1; step <= config.maxSteps; step++) {
      if (signal.aborted) return;
      while (this.paused && !signal.aborted) {
        await sleep(200);
      }
      if (signal.aborted) return;
      const snap = await this.tab<Snapshot>(tabId, { kind: 'snapshot' });

      // Stateless per step: the trail replaces chat history, which keeps prompts small.
      const user =
        `GOAL: ${goal}\n\nPAGE: ${snap.title}\nURL: ${snap.url}\n` +
        `SCROLL: ${snap.scrollY}/${snap.scrollMax}px\n\nVISIBLE TEXT:\n${snap.text}\n\n` +
        `INTERACTIVE ELEMENTS:\n${snap.lines || '(none visible)'}\n\n` +
        `PREVIOUS ACTIONS:\n${trail.slice(-8).join('\n') || '(none yet)'}\n\nReply with JSON only.`;

      const id = this.nextId++;
      this.send({ type: 'step', id, text: 'Thinking…', status: 'running', timestamp: Date.now() });
      const raw = await streamChat(llm, ACT_SYSTEM, [{ role: 'user', content: user }], () => {}, signal);

      const parsed = parseJson(raw) as {
        thought?: string;
        action?: Record<string, unknown> & { type?: string };
      } | null;
      if (!parsed?.action?.type) {
        this.send({ type: 'step', id, text: 'Model returned invalid JSON, retrying', status: 'error' });
        if (++parseFails >= 3) throw new Error('The model keeps returning invalid JSON. Try a stronger model.');
        continue;
      }
      parseFails = 0;
      const action = parsed.action;

      if (action.type === 'done') {
        this.send({ type: 'step', id, text: 'Done', status: 'ok', thought: parsed.thought, timestamp: Date.now() });
        this.send({ type: 'token', text: String(action.message ?? parsed.thought ?? 'Done.') });
        if (recorded.length) this.send({ type: 'macro', goal, startUrl, steps: recorded });
        return;
      }

      const label = this.describeAction(action, snap);
      // Scroll position is part of the key so repeated scrolling isn't mistaken for being stuck.
      const key = JSON.stringify(action) + snap.url + snap.scrollY;
      repeats = key === lastKey ? repeats + 1 : 0;
      lastKey = key;
      if (repeats >= 2) {
        this.send({ type: 'step', id, text: `Stuck repeating: ${label}`, status: 'error', thought: parsed.thought });
        this.send({ type: 'token', text: 'I got stuck repeating the same action, so I stopped. Try rephrasing the goal.' });
        return;
      }

      // Permission gate for potentially irreversible actions.
      if (config.requireApproval && this.isRisky(action, snap)) {
        const ok = await this.askApproval(`${parsed.thought ?? ''}\n${label}`.trim());
        if (!ok) {
          this.send({ type: 'step', id, text: `Denied: ${label}`, status: 'denied', thought: parsed.thought });
          this.send({ type: 'token', text: 'Stopped: you denied a sensitive action.' });
          return;
        }
      }

      const el = typeof action.index === 'number' ? snap.elements.find((e) => e.i === action.index) : undefined;
      const targetDesc = el ? `${el.role} "${el.label || el.value || ''}"` : undefined;
      const actType = String(action.type || '');
      const stepStart = Date.now();

      this.send({
        type: 'step',
        id,
        text: label,
        status: 'running',
        thought: parsed.thought,
        action: actType,
        target: targetDesc,
        timestamp: stepStart,
      });
      const result = await this.execute(action, tabId);
      this.send({
        type: 'step',
        id,
        text: label,
        status: result.ok ? 'ok' : 'error',
        thought: parsed.thought,
        action: actType,
        target: targetDesc,
        timestamp: Date.now(),
      });
      trail.push(
        `${step}. ${label} -> ${result.ok ? 'ok' : 'FAILED: ' + result.error}${result.note ? ' (' + result.note + ')' : ''}`,
      );
      if (result.ok) {
        const rec = this.toMacroStep(action, snap);
        if (rec) recorded.push(rec);
      }

      await sleep(500);
      await this.waitForLoad(tabId);
      await this.ensureContent(tabId);
    }
    this.send({ type: 'token', text: `Reached the step limit (${config.maxSteps}) without finishing. Raise it in Settings or break the task into smaller parts.` });
  }

  /** Converts an executed action into a replayable, index-free macro step. */
  private toMacroStep(a: Record<string, unknown>, snap: Snapshot): MacroStep | null {
    const el = typeof a.index === 'number' ? snap.elements.find((e) => e.i === a.index) : undefined;
    switch (a.type) {
      case 'click':
        return el ? { type: 'click', role: el.role, label: el.label } : null;
      case 'type':
        return el
          ? { type: 'type', role: el.role, label: el.label, text: String(a.text ?? ''), submit: !!a.submit }
          : null;
      case 'select':
        return el ? { type: 'select', role: el.role, label: el.label, option: String(a.option ?? '') } : null;
      case 'press':
        return { type: 'press', key: String(a.key ?? 'Enter') };
      case 'scroll':
        return { type: 'scroll', direction: a.direction as MacroStep['direction'] };
      case 'navigate':
        return { type: 'navigate', url: String(a.url ?? '') };
      default:
        return null;
    }
  }

  // ----- Macro replay (zero tokens) ----------------------------------------

  /**
   * Replays a recorded macro without calling any model. Each element is
   * re-located by role + label on the live page, so it survives layout and
   * class-name changes.
   */
  private async replay(macro: Macro, tabId: number) {
    this.abort?.abort();
    const abort = (this.abort = new AbortController());
    try {
      const config = await loadConfig();
      await this.ensureContent(tabId);

      const here = (await browser.tabs.get(tabId)).url ?? '';
      const strip = (u: string) => u.split('#')[0];
      if (macro.startUrl && /^https?:/.test(macro.startUrl) && strip(here) !== strip(macro.startUrl)) {
        const id = this.nextId++;
        this.send({ type: 'step', id, text: `Go to ${macro.startUrl}`, status: 'running' });
        await browser.tabs.update(tabId, { url: macro.startUrl });
        await sleep(400);
        await this.waitForLoad(tabId);
        await this.ensureContent(tabId);
        this.send({ type: 'step', id, text: `Go to ${macro.startUrl}`, status: 'ok' });
      }

      for (const [n, s] of macro.steps.entries()) {
        if (abort.signal.aborted) break;
        const id = this.nextId++;
        const needsEl = s.type === 'click' || s.type === 'type' || s.type === 'select';
        const text = this.describeStep(s, n + 1);
        this.send({ type: 'step', id, text, status: 'running' });

        let action: Record<string, unknown>;
        if (needsEl) {
          let snap = await this.tab<Snapshot>(tabId, { kind: 'snapshot' });
          let el = findElement(snap.elements, s);
          // Not visible yet? Scroll down a few screens looking for it.
          for (let tries = 0; !el && tries < 4; tries++) {
            await this.tab<ActionResult>(tabId, { kind: 'act', action: { type: 'scroll', direction: 'down' } });
            await sleep(300);
            snap = await this.tab<Snapshot>(tabId, { kind: 'snapshot' });
            el = findElement(snap.elements, s);
          }
          if (!el) {
            this.send({ type: 'step', id, text, status: 'error' });
            this.send({
              type: 'token',
              text: `Macro stopped at step ${n + 1}: couldn't find ${s.role} "${s.label}" on the page. The site may have changed. Re-run the task in Act mode to record a fresh macro.`,
            });
            return;
          }
          action = { type: s.type, index: el.i, text: s.text, submit: s.submit, option: s.option };
          if (config.requireApproval && this.isRisky(action, snap)) {
            const ok = await this.askApproval(text);
            if (!ok) {
              this.send({ type: 'step', id, text, status: 'denied' });
              this.send({ type: 'token', text: 'Stopped: you denied a sensitive action.' });
              return;
            }
          }
        } else {
          action = { ...s };
        }

        const result = await this.execute(action, tabId);
        this.send({ type: 'step', id, text, status: result.ok ? 'ok' : 'error' });
        if (!result.ok) {
          this.send({ type: 'token', text: `Macro stopped at step ${n + 1}: ${result.error ?? 'action failed'}` });
          return;
        }
        await sleep(500);
        await this.waitForLoad(tabId);
        await this.ensureContent(tabId);
      }
      if (!abort.signal.aborted) {
        this.send({ type: 'token', text: `Macro "${macro.name}" finished (${macro.steps.length} steps, 0 tokens used).` });
      }
    } catch (e) {
      if (!abort.signal.aborted) this.send({ type: 'error', message: (e as Error).message });
    } finally {
      this.send({ type: 'done' });
    }
  }

  private describeStep(s: MacroStep, n: number): string {
    const t = s.label ? `${s.role} "${s.label}"` : (s.role ?? '');
    switch (s.type) {
      case 'click': return `${n}. Click ${t}`;
      case 'type': return `${n}. Type "${(s.text ?? '').slice(0, 40)}" into ${t}${s.submit ? ' + Enter' : ''}`;
      case 'select': return `${n}. Select "${s.option}" in ${t}`;
      case 'press': return `${n}. Press ${s.key}`;
      case 'scroll': return `${n}. Scroll ${s.direction}`;
      case 'navigate': return `${n}. Go to ${s.url}`;
    }
  }

  // ----- Table export ------------------------------------------------------

  private async exportTables(tabId: number) {
    try {
      await this.ensureContent(tabId);
      const tables = await this.tab<string[]>(tabId, { kind: 'tables' });
      const csv =
        tables.length === 1
          ? (tables[0] ?? '')
          : tables.map((t, i) => `# Table ${i + 1}\r\n${t}`).join('\r\n\r\n');
      this.send({ type: 'tables', csv, count: tables.length });
    } catch (e) {
      this.send({ type: 'tables', csv: '', count: 0, error: (e as Error).message });
    }
  }

  private describeAction(a: Record<string, unknown>, snap: Snapshot): string {
    const el = typeof a.index === 'number' ? snap.elements.find((e) => e.i === a.index) : undefined;
    const target = el ? `[${a.index}] ${el.role} "${el.label}"` : `[${a.index}]`;
    switch (a.type) {
      case 'click': return `Click ${target}`;
      case 'type': return `Type "${String(a.text).slice(0, 40)}" into ${target}${a.submit ? ' + Enter' : ''}`;
      case 'select': return `Select "${a.option}" in ${target}`;
      case 'press': return `Press ${a.key}`;
      case 'scroll': return `Scroll ${a.direction}`;
      case 'navigate': return `Go to ${a.url}`;
      case 'wait': return 'Wait';
      default: return `Unknown action: ${String(a.type)}`;
    }
  }

  private isRisky(a: Record<string, unknown>, snap: Snapshot): boolean {
    const el = typeof a.index === 'number' ? snap.elements.find((e) => e.i === a.index) : undefined;
    if (a.type === 'click') return !!el && RISKY.test(el.label);
    if (a.type === 'type' && a.submit) return !!el && RISKY.test(el.label);
    if (a.type === 'press' && a.key === 'Enter') return false;
    return false;
  }

  private askApproval(text: string): Promise<boolean> {
    const id = this.nextId++;
    return new Promise((resolve) => {
      this.approvals.set(id, resolve);
      this.send({ type: 'approval', id, text });
    });
  }

  private async execute(a: Record<string, unknown>, tabId: number): Promise<ActionResult> {
    if (a.type === 'wait') {
      await sleep(1500);
      return { ok: true };
    }
    if (a.type === 'navigate') {
      let url: URL;
      try {
        url = new URL(String(a.url));
      } catch {
        return { ok: false, error: 'Invalid URL' };
      }
      if (!/^https?:$/.test(url.protocol)) return { ok: false, error: 'Only http(s) URLs are allowed' };
      await browser.tabs.update(tabId, { url: url.href });
      await sleep(400);
      return { ok: true };
    }
    return this.tab<ActionResult>(tabId, { kind: 'act', action: a as unknown as PageAction });
  }

  // ----- Apply / undo code on the page ------------------------------------

  private async apply(key: string, tabId: number, lang: string, code: string) {
    try {
      const l = lang.toLowerCase();
      if (l === 'css') {
        await browser.scripting.insertCSS({ target: { tabId }, css: code });
        appliedCss.set(key, { tabId, css: code });
        this.send({ type: 'applied', key, ok: true, message: 'CSS applied. You can undo it.' });
      } else if (l === 'js' || l === 'javascript') {
        const [res] = await browser.scripting.executeScript({
          target: { tabId },
          world: 'MAIN',
          args: [code],
          func: (src: string) => {
            try {
              // Indirect eval runs in the page's global scope.
              const out = (0, eval)(src);
              return { ok: true, value: out === undefined ? '' : String(out).slice(0, 200) };
            } catch (e) {
              return { ok: false, error: String(e) };
            }
          },
        });
        const r = res?.result as { ok: boolean; value?: string; error?: string } | undefined;
        if (r?.ok) {
          this.send({ type: 'applied', key, ok: true, message: `JS ran${r.value ? ` → ${r.value}` : ''}. (Reload the page to undo.)` });
        } else {
          const csp = /unsafe-eval|Content Security Policy/i.test(r?.error ?? '');
          this.send({
            type: 'applied', key, ok: false,
            message: csp
              ? "This site's Content Security Policy blocks running injected JS. CSS still works."
              : `JS error: ${r?.error ?? 'unknown'}`,
          });
        }
      } else {
        this.send({ type: 'applied', key, ok: false, message: `Can't apply "${lang}" blocks. Only css and js.` });
      }
    } catch (e) {
      this.send({ type: 'applied', key, ok: false, message: (e as Error).message });
    }
  }

  private async undo(key: string) {
    const entry = appliedCss.get(key);
    if (!entry) {
      this.send({ type: 'undone', key, ok: false, message: 'Nothing to undo.' });
      return;
    }
    try {
      await browser.scripting.removeCSS({ target: { tabId: entry.tabId }, css: entry.css });
      appliedCss.delete(key);
      this.send({ type: 'undone', key, ok: true, message: 'Undone.' });
    } catch (e) {
      this.send({ type: 'undone', key, ok: false, message: (e as Error).message });
    }
  }

  // ----- Tab helpers -------------------------------------------------------

  private async ensureContent(tabId: number): Promise<void> {
    const tab = await browser.tabs.get(tabId);
    const url = tab.url ?? '';
    if (RESTRICTED.test(url) || RESTRICTED_HOSTS.test(url)) {
      throw new Error("The browser doesn't allow extensions on this page. Open a normal website tab.");
    }
    try {
      await browser.tabs.sendMessage(tabId, { kind: 'ping' } satisfies ContentRequest);
    } catch {
      // Tab was open before install/reload: inject the content script on demand.
      const files = browser.runtime.getManifest().content_scripts?.find((c) =>
        c.js?.some((f) => /content\.js$/.test(f) && !/logger/.test(f)),
      )?.js?.filter((f) => !/logger/.test(f));
      try {
        await browser.scripting.executeScript({ target: { tabId }, files: (files ?? ['content-scripts/content.js']) as never });
      } catch {
        throw new Error("Couldn't attach to this page. Try reloading the tab. On Firefox, grant WebPilot access to all sites in about:addons → Permissions.");
      }
    }
  }

  private async tab<T>(tabId: number, req: ContentRequest): Promise<T> {
    try {
      return (await browser.tabs.sendMessage(tabId, req)) as T;
    } catch {
      await this.ensureContent(tabId);
      return (await browser.tabs.sendMessage(tabId, req)) as T;
    }
  }

  private async waitForLoad(tabId: number): Promise<void> {
    for (let i = 0; i < 40; i++) {
      const t = await browser.tabs.get(tabId);
      if (t.status !== 'loading') return;
      await sleep(250);
    }
  }
}

/** Extracts the first JSON object from a model reply (tolerates code fences / prose). */
function parseJson(raw: string): unknown {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
}
