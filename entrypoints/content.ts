import { devContext, extractTables, pageText, runAction, snapshot } from '@/lib/dom';
import type { ContentRequest, LogEntry } from '@/lib/types';

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_start',
  main() {
    const logs: LogEntry[] = [];

    // Entries posted by the MAIN-world logger (console errors, failed requests).
    window.addEventListener('message', (e) => {
      if (e.source !== window || !e.data || e.data.__webpilot !== true) return;
      logs.push(e.data.entry as LogEntry);
      if (logs.length > 200) logs.shift();
    });

    browser.runtime.onMessage.addListener((raw, _sender, sendResponse) => {
      const msg = raw as ContentRequest;
      if (!msg || typeof msg !== 'object' || !('kind' in msg)) return;
      (async () => {
        switch (msg.kind) {
          case 'ping':
            return { ok: true };
          case 'snapshot':
            return snapshot();
          case 'page':
            return pageText(msg.max);
          case 'dev':
            return devContext(msg.max, logs);
          case 'tables':
            return extractTables();
          case 'act':
            return runAction(msg.action);
        }
      })()
        .then(sendResponse)
        .catch((e: Error) => sendResponse({ ok: false, error: e.message }));
      return true; // keep the channel open for the async response
    });
  },
});
