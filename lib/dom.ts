import type { ActionResult, ElementInfo, LogEntry, PageAction, Snapshot } from './types';

const INTERACTIVE = [
  'a[href]',
  'button',
  'input:not([type=hidden])',
  'textarea',
  'select',
  'summary',
  '[role=button]',
  '[role=link]',
  '[role=checkbox]',
  '[role=radio]',
  '[role=switch]',
  '[role=tab]',
  '[role=menuitem]',
  '[role=option]',
  '[role=combobox]',
  '[role=textbox]',
  '[contenteditable=""]',
  '[contenteditable="true"]',
  '.ace_editor',
  '.ace_text-input',
  '.monaco-editor',
  '.cm-content',
  '.cm-editor',
  '[onclick]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/** Elements from the most recent snapshot, indexed from 1. */
let registry: Element[] = [];

const clip = (s: string, n: number): string => {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
};

/** Collects interactive elements, piercing open shadow roots. */
function collect(root: ParentNode, out: Element[]): void {
  root.querySelectorAll('*').forEach((el) => {
    if (el.matches(INTERACTIVE)) out.push(el);
    const sr = (el as HTMLElement).shadowRoot;
    if (sr) collect(sr, out);
  });
}

function isDisabled(el: Element): boolean {
  return (
    (el as HTMLInputElement).disabled === true || el.getAttribute('aria-disabled') === 'true'
  );
}

function inViewport(el: Element): boolean {
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return false;
  if (r.bottom <= 0 || r.top >= innerHeight || r.right <= 0 || r.left >= innerWidth) {
    return false;
  }
  const cs = getComputedStyle(el);
  return cs.visibility !== 'hidden' && cs.display !== 'none';
}

function labelOf(el: Element): string {
  const aria = el.getAttribute('aria-label');
  if (aria) return clip(aria, 80);
  const by = el.getAttribute('aria-labelledby');
  if (by) {
    const t = by
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent ?? '')
      .join(' ');
    if (t.trim()) return clip(t, 80);
  }
  if (
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    el instanceof HTMLSelectElement
  ) {
    const l = el.labels?.[0]?.textContent;
    if (l?.trim()) return clip(l, 80);
    if ('placeholder' in el && el.placeholder) return clip(el.placeholder, 80);
    if (
      el instanceof HTMLInputElement &&
      ['button', 'submit', 'reset'].includes(el.type) &&
      el.value
    ) {
      return clip(el.value, 80);
    }
    return el.name || el.id || '';
  }
  const text = (el as HTMLElement).innerText || el.textContent || '';
  if (text.trim()) return clip(text, 80);
  const alt = el.querySelector('img[alt]')?.getAttribute('alt');
  if (alt) return clip(alt, 80);
  return clip(el.getAttribute('title') || el.getAttribute('alt') || '', 80);
}

function describe(el: Element, i: number): ElementInfo {
  const tag = el.tagName.toLowerCase();
  const isEditor = !!el.closest('.ace_editor, .monaco-editor, .cm-editor, .cm-content, .CodeMirror');
  const info: ElementInfo = {
    i,
    role: isEditor ? 'code-editor' : el.getAttribute('role') || (tag === 'a' ? 'link' : tag),
    label: isEditor ? (labelOf(el) || 'Code Editor') : labelOf(el),
  };
  if (el instanceof HTMLInputElement) {
    info.type = el.type;
    if (el.type === 'checkbox' || el.type === 'radio') {
      info.extra = el.checked ? 'checked' : 'unchecked';
    } else if (el.value && el.type !== 'password' && !['button', 'submit'].includes(el.type)) {
      info.value = clip(el.value, 40);
    }
  } else if (el instanceof HTMLTextAreaElement) {
    if (el.value) info.value = clip(el.value, 40);
  } else if (el instanceof HTMLSelectElement) {
    const opts = Array.from(el.options)
      .slice(0, 8)
      .map((o) => clip(o.text, 24));
    info.value = clip(el.selectedOptions[0]?.text ?? '', 30);
    info.extra = `options: ${opts.join(' | ')}`;
  } else if (el instanceof HTMLAnchorElement) {
    try {
      const u = new URL(el.href, location.href);
      info.href = u.origin === location.origin ? u.pathname + u.search : u.hostname + u.pathname;
      info.href = clip(info.href, 60);
    } catch {
      /* ignore */
    }
  }
  return info;
}

function formatLine(e: ElementInfo): string {
  let s = `[${e.i}] ${e.role}`;
  if (e.type && e.type !== 'text') s += `(${e.type})`;
  if (e.label) s += ` "${e.label}"`;
  if (e.value) s += ` value="${e.value}"`;
  if (e.href) s += ` -> ${e.href}`;
  if (e.extra) s += ` ${e.extra}`;
  return s;
}

/**
 * Builds a compact, viewport-only view of the page. Only visible, enabled,
 * interactive elements are listed, each with a short numeric index the model
 * can act on. This keeps prompts far smaller than dumping a full DOM.
 */
export function snapshot(maxElements = 120, textMax = 1500): Snapshot {
  const found: Element[] = [];
  collect(document, found);
  registry = [];
  const elements: ElementInfo[] = [];
  const included = new Set<Element>();

  for (const el of found) {
    if (elements.length >= maxElements) break;
    if (isDisabled(el) || !inViewport(el)) continue;
    const wrapper = el.parentElement?.closest('a[href],button');
    if (wrapper && included.has(wrapper) && !/^(input|select|textarea)$/i.test(el.tagName)) {
      continue;
    }
    included.add(el);
    registry.push(el);
    elements.push(describe(el, registry.length));
  }

  const scrollMax = Math.max(
    0,
    (document.scrollingElement?.scrollHeight ?? 0) - innerHeight,
  );
  return {
    url: location.href,
    title: document.title,
    elements,
    lines: elements.map(formatLine).join('\n'),
    text: clip(document.body?.innerText ?? '', textMax),
    scrollY: Math.round(scrollY),
    scrollMax: Math.round(scrollMax),
  };
}

/** Full readable page text (or the user's selection) for Ask mode. */
export function pageText(max: number): { url: string; title: string; selection: string; text: string } {
  const selection = String(getSelection() ?? '').trim();
  const raw = document.body?.innerText ?? '';
  return {
    url: location.href,
    title: document.title,
    selection: clip(selection, max),
    text: raw.length > max ? raw.slice(0, max) + '\n…[truncated]' : raw,
  };
}

const KEEP_ATTRS = new Set([
  'id',
  'class',
  'href',
  'src',
  'type',
  'name',
  'role',
  'aria-label',
  'placeholder',
  'alt',
  'title',
  'value',
  'for',
]);

/** A stripped-down copy of the page HTML (no scripts/styles/svg) for Dev mode. */
function strippedHtml(max: number): string {
  const clone = document.documentElement.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('script,style,svg,noscript,link,meta,iframe,canvas').forEach((n) => n.remove());
  clone.querySelectorAll('*').forEach((n) => {
    Array.from(n.attributes).forEach((a) => {
      if (!KEEP_ATTRS.has(a.name)) n.removeAttribute(a.name);
    });
  });
  const html = clone.outerHTML.replace(/<!--[\s\S]*?-->/g, '').replace(/\s+/g, ' ');
  return html.length > max ? html.slice(0, max) + '…[truncated]' : html;
}

export function devContext(max: number, logs: LogEntry[]) {
  const snap = snapshot(80, 800);
  return {
    url: location.href,
    title: document.title,
    html: strippedHtml(max),
    elements: snap.lines,
    logs: logs.slice(-40),
  };
}

/** Every data table on the page as a CSV string (no model involved, so it's free and exact). */
export function extractTables(): string[] {
  const cell = (c: HTMLTableCellElement) => {
    const t = (c.innerText || c.textContent || '').replace(/\s+/g, ' ').trim();
    return /[",\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const out: string[] = [];
  document.querySelectorAll('table').forEach((table) => {
    const rows = Array.from(table.rows).map((r) => Array.from(r.cells).map(cell));
    if (rows.length >= 2 && rows.some((r) => r.length >= 2)) {
      out.push(rows.map((r) => r.join(',')).join('\r\n'));
    }
  });
  return out;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

function highlight(el: Element): void {
  const r = el.getBoundingClientRect();
  const box = document.createElement('div');
  box.style.cssText = [
    'position:fixed',
    `left:${r.left - 3}px`,
    `top:${r.top - 3}px`,
    `width:${r.width + 6}px`,
    `height:${r.height + 6}px`,
    'border:2px solid #7c6cff',
    'border-radius:6px',
    'background:rgba(124,108,255,.12)',
    'pointer-events:none',
    'z-index:2147483647',
    'transition:opacity .4s',
  ].join(';');
  document.documentElement.appendChild(box);
  setTimeout(() => (box.style.opacity = '0'), 500);
  setTimeout(() => box.remove(), 950);
}

function getEl(index: number): Element | string {
  const el = registry[index - 1];
  if (!el || !el.isConnected) {
    return `Element [${index}] is gone or stale; the page changed. Re-read the page.`;
  }
  return el;
}

function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const proto = Object.getPrototypeOf(el);
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
}

function fire(el: Element, type: string, init: Record<string, unknown> = {}): boolean {
  const opts = { bubbles: true, cancelable: true, composed: true, view: window, ...init };
  const ev = type.startsWith('pointer')
    ? new PointerEvent(type, { ...opts, pointerType: 'mouse', isPrimary: true })
    : type.startsWith('key')
      ? new KeyboardEvent(type, opts)
      : new MouseEvent(type, opts);
  return el.dispatchEvent(ev);
}

function clickEl(el: Element): void {
  (el as HTMLElement).scrollIntoView({ block: 'center', inline: 'center' });
  const r = el.getBoundingClientRect();
  const pos = { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, button: 0 };
  ['pointerover', 'mouseover', 'pointerdown', 'mousedown'].forEach((t) => fire(el, t, pos));
  (el as HTMLElement).focus?.();
  ['pointerup', 'mouseup'].forEach((t) => fire(el, t, pos));
  (el as HTMLElement).click();
}

function pressKey(target: Element, key: string): void {
  const codes: Record<string, number> = { Enter: 13, Escape: 27, Tab: 9, Backspace: 8, ArrowDown: 40, ArrowUp: 38 };
  const init = { key, code: key, keyCode: codes[key] ?? 0, which: codes[key] ?? 0 };
  const notPrevented = fire(target, 'keydown', init);
  if (key === 'Enter') fire(target, 'keypress', init);
  fire(target, 'keyup', init);
  if (key === 'Enter' && notPrevented) {
    const form = (target as HTMLInputElement).form;
    if (form && target instanceof HTMLInputElement) form.requestSubmit();
  }
}

export async function runAction(a: PageAction): Promise<ActionResult> {
  try {
    switch (a.type) {
      case 'click': {
        const el = getEl(a.index);
        if (typeof el === 'string') return { ok: false, error: el };
        highlight(el);
        clickEl(el);
        return { ok: true };
      }
      case 'type': {
        const found = getEl(a.index);
        if (typeof found === 'string') return { ok: false, error: found };
        highlight(found);

        // Check if typing into an in-page code editor (Ace / Monaco / CodeMirror)
        if (found.closest('.ace_editor, .monaco-editor, .cm-editor, .cm-content, .CodeMirror') || document.querySelector('.ace_editor, .monaco-editor, .CodeMirror')) {
          try {
            window.postMessage(
              {
                __webpilotEditor: true,
                text: a.text,
                mode: a.clear === false ? 'append' : 'replace',
              },
              '*',
            );
          } catch {
            /* fallback to standard input */
          }
        }

        const el = found.matches('input,textarea,[contenteditable]')
          ? found
          : (found.querySelector('input,textarea,[contenteditable]') ?? found);
        (el as HTMLElement).focus();
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
          const next = a.clear === false ? el.value + a.text : a.text;
          setNativeValue(el, next);
          el.dispatchEvent(
            new InputEvent('input', { bubbles: true, data: a.text, inputType: 'insertText' }),
          );
          el.dispatchEvent(new Event('change', { bubbles: true }));
        } else {
          const h = el as HTMLElement;
          if (a.clear !== false) {
            const range = document.createRange();
            range.selectNodeContents(h);
            const sel = getSelection();
            sel?.removeAllRanges();
            sel?.addRange(range);
          }
          if (!document.execCommand('insertText', false, a.text)) {
            h.textContent = a.text;
            h.dispatchEvent(new InputEvent('input', { bubbles: true, data: a.text }));
          }
        }
        if (a.submit) pressKey(el, 'Enter');
        return { ok: true };
      }
      case 'select': {
        const el = getEl(a.index);
        if (typeof el === 'string') return { ok: false, error: el };
        if (!(el instanceof HTMLSelectElement)) {
          return { ok: false, error: `Element [${a.index}] is not a <select>.` };
        }
        const want = a.option.toLowerCase();
        const opt = Array.from(el.options).find(
          (o) => o.text.toLowerCase() === want || o.value.toLowerCase() === want,
        ) ?? Array.from(el.options).find((o) => o.text.toLowerCase().includes(want));
        if (!opt) return { ok: false, error: `No option matching "${a.option}".` };
        highlight(el);
        el.value = opt.value;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return { ok: true };
      }
      case 'press': {
        let target: Element = document.activeElement ?? document.body;
        if (a.index !== undefined) {
          const el = getEl(a.index);
          if (typeof el === 'string') return { ok: false, error: el };
          target = el;
          (el as HTMLElement).focus?.();
        }
        pressKey(target, a.key);
        return { ok: true };
      }
      case 'scroll': {
        const page = Math.round(innerHeight * 0.8);
        if (a.direction === 'top') scrollTo({ top: 0 });
        else if (a.direction === 'bottom') scrollTo({ top: document.documentElement.scrollHeight });
        else scrollBy({ top: a.direction === 'down' ? page : -page });
        return { ok: true };
      }
    }
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
