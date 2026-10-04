export default defineContentScript({
  matches: ['<all_urls>'],
  world: 'MAIN',
  runAt: 'document_start',
  main() {
    const w = window as unknown as { __webpilotLogger?: boolean };
    if (w.__webpilotLogger) return;
    w.__webpilotLogger = true;

    const post = (kind: string, text: string) => {
      try {
        window.postMessage(
          { __webpilot: true, entry: { kind, text: text.slice(0, 400), t: Date.now() } },
          '*',
        );
      } catch {
        /* ignore */
      }
    };

    const str = (v: unknown): string => {
      if (v instanceof Error) return v.stack?.split('\n').slice(0, 3).join(' ') || v.message;
      if (typeof v === 'string') return v;
      try {
        return JSON.stringify(v) ?? String(v);
      } catch {
        return String(v);
      }
    };

    (['error', 'warn'] as const).forEach((level) => {
      const orig = console[level];
      console[level] = function (...args: unknown[]) {
        post(`console.${level}`, args.map(str).join(' '));
        return orig.apply(this, args as []);
      };
    });

    window.addEventListener('error', (e) =>
      post('error', `${e.message} (${e.filename}:${e.lineno})`),
    );
    window.addEventListener('unhandledrejection', (e) => post('rejection', str(e.reason)));

    const origFetch = window.fetch;
    window.fetch = async function (...args: Parameters<typeof fetch>) {
      const url = args[0] instanceof Request ? args[0].url : String(args[0]);
      const method = args[1]?.method ?? (args[0] instanceof Request ? args[0].method : 'GET');
      try {
        const res = await origFetch.apply(this, args);
        if (res.status >= 400) post('fetch', `${method} ${url} -> ${res.status}`);
        return res;
      } catch (err) {
        post('fetch', `${method} ${url} failed: ${str(err)}`);
        throw err;
      }
    };

    const origOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (
      this: XMLHttpRequest,
      method: string,
      url: string | URL,
      ...rest: unknown[]
    ) {
      this.addEventListener('loadend', () => {
        if (this.status === 0 || this.status >= 400) {
          post('xhr', `${method} ${url} -> ${this.status || 'failed'}`);
        }
      });
      return (origOpen as (...a: unknown[]) => void).call(this, method, url, ...rest);
    } as typeof XMLHttpRequest.prototype.open;

    // Listen for code injection requests to in-page editors (Ace, Monaco, CodeMirror)
    window.addEventListener('message', (e) => {
      if (e.source !== window || !e.data || e.data.__webpilotEditor !== true) return;
      const { text, mode } = e.data;
      try {
        // 1. Ace Editor (OnlineGDB, etc.)
        const ace = (window as unknown as { ace?: { edit: (el: Element | string) => { setValue: (v: string, p?: number) => void; insert: (v: string) => void } } }).ace;
        if (ace?.edit) {
          const el = document.querySelector('.ace_editor') || 'editor';
          const editor = ace.edit(el);
          if (editor) {
            if (mode === 'append') editor.insert(text);
            else editor.setValue(text, 1);
            return;
          }
        }
        // 2. Monaco Editor (VSCode web)
        const monaco = (window as unknown as { monaco?: { editor?: { getEditors?: () => Array<{ setValue: (v: string) => void }> } } }).monaco;
        if (monaco?.editor?.getEditors) {
          const eds = monaco.editor.getEditors();
          if (eds?.length) {
            eds[0]?.setValue(text);
            return;
          }
        }
        // 3. CodeMirror
        const cmEl = document.querySelector('.CodeMirror') as { CodeMirror?: { setValue: (v: string) => void } } | null;
        if (cmEl?.CodeMirror) {
          cmEl.CodeMirror.setValue(text);
          return;
        }
        const cmContent = document.querySelector('.cm-content');
        if (cmContent) {
          (cmContent as HTMLElement).innerText = text;
          cmContent.dispatchEvent(new InputEvent('input', { bubbles: true, data: text }));
          return;
        }
      } catch (err) {
        console.warn('[WebPilot] Editor injection note:', err);
      }
    });
  },
});
