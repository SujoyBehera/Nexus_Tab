import type { ActionResult, ElementInfo, LogEntry, PageAction, Snapshot } from './types';

const INTERACTIVE = [
  'a[href]',
  'button',
  'input:not([type=hidden])',
  'textarea',
  'select',
  'summary',
  'label',
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
  '[data-action]',
  '[data-clickable="true"]',
  '[aria-checked]',
  '[aria-selected]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/** Elements from the most recent snapshot, indexed from 1. */
let registry: Element[] = [];

const clip = (s: string, n: number): string => {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
};

/** Collects interactive elements, piercing open shadow roots and detecting custom styled cards. */
function collect(root: ParentNode, out: Element[]): void {
  root.querySelectorAll('*').forEach((el) => {
    let matched = el.matches(INTERACTIVE);
    if (!matched && el instanceof HTMLElement) {
      const tag = el.tagName.toLowerCase();
      if (['div', 'li', 'span', 'article', 'section', 'tr'].includes(tag)) {
        try {
          const cs = getComputedStyle(el);
          if (cs.cursor === 'pointer') {
            const r = el.getBoundingClientRect();
            if (r.width >= 12 && r.height >= 12 && r.width < innerWidth * 0.95) {
              matched = true;
            }
          }
        } catch {
          /* ignore */
        }
      }
    }
    if (matched) out.push(el);
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
  if (aria) return clip(aria, 140);
  const by = el.getAttribute('aria-labelledby');
  if (by) {
    const t = by
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent ?? '')
      .join(' ');
    if (t.trim()) return clip(t, 140);
  }
  if (
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    el instanceof HTMLSelectElement
  ) {
    const l = el.labels?.[0]?.textContent;
    if (l?.trim()) return clip(l, 140);
    if ('placeholder' in el && el.placeholder) return clip(el.placeholder, 140);
    if (
      el instanceof HTMLInputElement &&
      ['button', 'submit', 'reset'].includes(el.type) &&
      el.value
    ) {
      return clip(el.value, 140);
    }
    return el.name || el.id || '';
  }
  const text = (el as HTMLElement).innerText || el.textContent || '';
  if (text.trim()) return clip(text, 140);
  const alt = el.querySelector('img[alt]')?.getAttribute('alt');
  if (alt) return clip(alt, 140);
  return clip(el.getAttribute('title') || el.getAttribute('alt') || '', 140);
}

function describe(el: Element, i: number): ElementInfo {
  const tag = el.tagName.toLowerCase();
  const isEditor = !!el.closest('.ace_editor, .monaco-editor, .cm-editor, .cm-content, .CodeMirror');
  const childRadio = el.querySelector('input[type=radio]') as HTMLInputElement | null;
  const childCheckbox = el.querySelector('input[type=checkbox]') as HTMLInputElement | null;
  const roleAttr = el.getAttribute('role');

  let role = isEditor
    ? 'code-editor'
    : roleAttr ||
      (childRadio
        ? 'radio'
        : childCheckbox
          ? 'checkbox'
          : tag === 'a'
            ? 'link'
            : tag === 'label'
              ? 'label'
              : tag === 'button'
                ? 'button'
                : tag === 'input'
                  ? 'input'
                  : tag === 'textarea'
                    ? 'textarea'
                    : tag === 'select'
                      ? 'select'
                      : 'card');

  if (role === 'card' && !el.matches(INTERACTIVE)) {
    role = 'option';
  }

  const info: ElementInfo = {
    i,
    role,
    label: isEditor ? (labelOf(el) || 'Code Editor') : labelOf(el),
  };

  const isChecked =
    (childRadio && childRadio.checked) ||
    (childCheckbox && childCheckbox.checked) ||
    el.getAttribute('aria-checked') === 'true' ||
    el.getAttribute('aria-selected') === 'true' ||
    /(^|\s)(selected|active|checked)(\s|$)/i.test(el.className);

  if (el instanceof HTMLInputElement) {
    info.type = el.type;
    if (el.type === 'checkbox' || el.type === 'radio') {
      info.extra = el.checked ? 'checked' : 'unchecked';
    } else if (el.value && el.type !== 'password' && !['button', 'submit'].includes(el.type)) {
      info.value = clip(el.value, 40);
    }
  } else if (childRadio || role === 'radio' || childCheckbox || role === 'checkbox') {
    info.extra = isChecked ? 'checked' : 'unchecked';
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
  } else if (isChecked) {
    info.extra = 'selected';
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

    const ancestor = el.parentElement?.closest('a[href],button,label,[role=button],[role=radio],[role=checkbox]');
    if (ancestor && included.has(ancestor) && !/^(input|select|textarea)$/i.test(el.tagName)) {
      continue;
    }

    let isNestedInCard = false;
    for (const inc of included) {
      if (inc !== el && inc.contains(el) && !/^(input|select|textarea)$/i.test(el.tagName)) {
        isNestedInCard = true;
        break;
      }
    }
    if (isNestedInCard) continue;

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
    ? new PointerEvent(type, { ...opts, pointerType: 'mouse', isPrimary: true, pointerId: 1 })
    : type.startsWith('key')
      ? new KeyboardEvent(type, opts)
      : new MouseEvent(type, opts);
  return el.dispatchEvent(ev);
}

function clickEl(el: Element): void {
  try {
    (el as HTMLElement).scrollIntoView({ block: 'center', inline: 'nearest' });
  } catch {
    /* ignore scroll errors */
  }

  const r = el.getBoundingClientRect();
  const clientX = Math.round(r.left + Math.max(1, r.width / 2));
  const clientY = Math.round(r.top + Math.max(1, r.height / 2));
  const screenX = window.screenX + clientX;
  const screenY = window.screenY + clientY;

  const basePos = {
    clientX,
    clientY,
    screenX,
    screenY,
    pageX: clientX + window.scrollX,
    pageY: clientY + window.scrollY,
  };

  const downPos = { ...basePos, button: 0, buttons: 1, detail: 1, pressure: 0.5 };
  const upPos = { ...basePos, button: 0, buttons: 0, detail: 1, pressure: 0 };

  // 1. Pointer & Mouse Hover sequence
  fire(el, 'pointerover', { ...basePos, button: 0, buttons: 0 });
  fire(el, 'mouseover', { ...basePos, button: 0, buttons: 0 });
  fire(el, 'pointerenter', { ...basePos, button: 0, buttons: 0 });
  fire(el, 'mouseenter', { ...basePos, button: 0, buttons: 0 });

  // 2. Mouse/Pointer Down
  fire(el, 'pointerdown', downPos);
  fire(el, 'mousedown', downPos);

  // 3. Focus
  if (el instanceof HTMLElement && typeof el.focus === 'function') {
    try {
      el.focus();
    } catch {
      /* ignore */
    }
  }

  // 4. Mouse/Pointer Up
  fire(el, 'pointerup', upPos);
  fire(el, 'mouseup', upPos);

  // 5. Click Event
  fire(el, 'click', upPos);

  // 6. Native click trigger
  if (el instanceof HTMLElement) {
    try {
      el.click();
    } catch {
      /* ignore */
    }
  }

  // 7. Nested radio / checkbox fallback: if wrapper card clicked, ensure input state activates
  const nestedInput = el.querySelector<HTMLInputElement>(
    'input[type=radio], input[type=checkbox]'
  );
  if (nestedInput && !nestedInput.checked) {
    try {
      nestedInput.focus();
      nestedInput.click();
      nestedInput.dispatchEvent(new Event('input', { bubbles: true }));
      nestedInput.dispatchEvent(new Event('change', { bubbles: true }));
    } catch {
      /* ignore */
    }
  }

  // 8. Label htmlFor association fallback
  if (el instanceof HTMLLabelElement && el.htmlFor) {
    const targetInput = document.getElementById(el.htmlFor);
    if (targetInput instanceof HTMLInputElement && !targetInput.checked) {
      try {
        targetInput.click();
      } catch {
        /* ignore */
      }
    }
  }
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

interface ElementFingerprint {
  inDOM: boolean;
  checked: boolean;
  ariaChecked: string | null;
  ariaSelected: string | null;
  ariaExpanded: string | null;
  value: string | null;
  className: string;
  url: string;
  scrollY: number;
  childCount: number;
}

function captureFingerprint(el?: Element | null): ElementFingerprint {
  const url = location.href;
  const scrollY = window.scrollY;
  if (!el || !el.isConnected) {
    return {
      inDOM: false,
      checked: false,
      ariaChecked: null,
      ariaSelected: null,
      ariaExpanded: null,
      value: null,
      className: '',
      url,
      scrollY,
      childCount: document.body?.children.length ?? 0,
    };
  }

  const childInput = el.querySelector<HTMLInputElement>('input[type=radio], input[type=checkbox]');
  const checked = el instanceof HTMLInputElement
    ? el.checked
    : childInput
      ? childInput.checked
      : el.getAttribute('aria-checked') === 'true';

  const value = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement
    ? el.value
    : null;

  return {
    inDOM: true,
    checked,
    ariaChecked: el.getAttribute('aria-checked'),
    ariaSelected: el.getAttribute('aria-selected'),
    ariaExpanded: el.getAttribute('aria-expanded'),
    value,
    className: el.className || '',
    url,
    scrollY,
    childCount: el.parentElement?.children.length ?? document.body?.children.length ?? 0,
  };
}

async function verifyStateChange(
  pre: ElementFingerprint,
  el: Element | null,
  a: PageAction,
): Promise<{ verified: boolean; note?: string }> {
  // Allow microtask ticks for React / Vue state propagation
  await new Promise((r) => setTimeout(r, 60));

  if (location.href !== pre.url) {
    return { verified: true, note: `Navigated to ${location.pathname}` };
  }

  if (a.type === 'scroll') {
    const diff = Math.abs(window.scrollY - pre.scrollY);
    return diff > 5
      ? { verified: true, note: `Scrolled to ${Math.round(window.scrollY)}px` }
      : { verified: false, note: 'Scroll did not alter page viewport position' };
  }

  if (el && !el.isConnected) {
    return { verified: true, note: 'Element consumed or updated in DOM' };
  }

  if (!el) {
    return { verified: true };
  }

  const post = captureFingerprint(el);

  if (post.checked !== pre.checked) {
    return { verified: true, note: `Checked state toggled to ${post.checked}` };
  }
  if (post.ariaChecked !== pre.ariaChecked) {
    return { verified: true, note: `aria-checked changed to "${post.ariaChecked}"` };
  }
  if (post.ariaSelected !== pre.ariaSelected) {
    return { verified: true, note: `aria-selected changed to "${post.ariaSelected}"` };
  }
  if (post.ariaExpanded !== pre.ariaExpanded) {
    return { verified: true, note: `aria-expanded changed to "${post.ariaExpanded}"` };
  }
  if (post.value !== pre.value) {
    return { verified: true, note: 'Value updated' };
  }
  if (post.className !== pre.className) {
    return { verified: true, note: 'Element style classes mutated' };
  }
  if (post.childCount !== pre.childCount) {
    return { verified: true, note: 'DOM tree mutated' };
  }

  // If action was click, and nothing in DOM, classes or attributes changed:
  if (a.type === 'click') {
    return {
      verified: false,
      note: 'Click dispatched, but no DOM state change (checked/class/DOM) was detected',
    };
  }

  return { verified: true };
}

export async function runAction(a: PageAction): Promise<ActionResult> {
  try {
    let targetEl: Element | null = null;
    if ('index' in a && typeof a.index === 'number') {
      const resolved = getEl(a.index);
      if (typeof resolved === 'string') return { ok: false, error: resolved };
      targetEl = resolved;
    }

    const preState = captureFingerprint(targetEl);

    switch (a.type) {
      case 'click': {
        if (!targetEl) return { ok: false, error: 'Target element missing.' };
        highlight(targetEl);
        clickEl(targetEl);
        const v = await verifyStateChange(preState, targetEl, a);
        return { ok: true, verified: v.verified, note: v.note };
      }
      case 'type': {
        if (!targetEl) return { ok: false, error: 'Target element missing.' };
        highlight(targetEl);

        // Check if typing into an in-page code editor (Ace / Monaco / CodeMirror)
        if (targetEl.closest('.ace_editor, .monaco-editor, .cm-editor, .cm-content, .CodeMirror') || document.querySelector('.ace_editor, .monaco-editor, .CodeMirror')) {
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

        const el = targetEl.matches('input,textarea,[contenteditable]')
          ? targetEl
          : (targetEl.querySelector('input,textarea,[contenteditable]') ?? targetEl);
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
        const v = await verifyStateChange(preState, targetEl, a);
        return { ok: true, verified: v.verified, note: v.note };
      }
      case 'select': {
        if (!targetEl) return { ok: false, error: 'Target element missing.' };
        if (!(targetEl instanceof HTMLSelectElement)) {
          return { ok: false, error: `Element [${a.index}] is not a <select>.` };
        }
        const want = a.option.toLowerCase();
        const opt = Array.from(targetEl.options).find(
          (o) => o.text.toLowerCase() === want || o.value.toLowerCase() === want,
        ) ?? Array.from(targetEl.options).find((o) => o.text.toLowerCase().includes(want));
        if (!opt) return { ok: false, error: `No option matching "${a.option}".` };
        highlight(targetEl);
        targetEl.value = opt.value;
        targetEl.dispatchEvent(new Event('input', { bubbles: true }));
        targetEl.dispatchEvent(new Event('change', { bubbles: true }));
        const v = await verifyStateChange(preState, targetEl, a);
        return { ok: true, verified: v.verified, note: v.note };
      }
      case 'press': {
        let target: Element = document.activeElement ?? document.body;
        if (a.index !== undefined && targetEl) {
          target = targetEl;
          (targetEl as HTMLElement).focus?.();
        }
        pressKey(target, a.key);
        const v = await verifyStateChange(preState, targetEl, a);
        return { ok: true, verified: v.verified, note: v.note };
      }
      case 'scroll': {
        const page = Math.round(innerHeight * 0.8);
        if (a.direction === 'top') scrollTo({ top: 0 });
        else if (a.direction === 'bottom') scrollTo({ top: document.documentElement.scrollHeight });
        else scrollBy({ top: a.direction === 'down' ? page : -page });
        const v = await verifyStateChange(preState, null, a);
        return { ok: true, verified: v.verified, note: v.note };
      }
    }
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
