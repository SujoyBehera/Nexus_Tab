// End-to-end test: loads the built extension into real Chrome and drives every mode
// against a local test page, using a mock OpenAI-compatible model server.
//
//   npm run build && npm run test:e2e
//
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXT = path.join(root, '.output', 'chrome-mv3');
const SHOTS = path.join(root, 'e2e', 'screenshots');
const CHROME =
  process.env.CHROME_PATH ||
  [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  ].find((p) => fs.existsSync(p));

fs.mkdirSync(SHOTS, { recursive: true });

// ---------------------------------------------------------------- test page
const PAGE = `<!doctype html><html><head><title>WebPilot Test Page</title>
<style>body{font-family:sans-serif;padding:20px} h1{color:#222}</style></head><body>
<h1>Hello from the test page</h1>
<input id="q" placeholder="Search"> <button id="go">Go</button>
<button id="del">Delete account</button>
<div id="out"></div>
<table><tr><th>Name</th><th>Qty</th></tr><tr><td>Apple, red</td><td>3</td></tr><tr><td>Pear</td><td>5</td></tr></table>
<div style="height:3000px"></div>
<script>
 go.onclick=()=>{ out.textContent='Searched: '+q.value; console.error('test-error from page'); fetch('/missing'); };
 del.onclick=()=>{ out.textContent='deleted'; };
</script></body></html>`;

const pageServer = http.createServer((req, res) => {
  if (req.url === '/') {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(PAGE);
  } else {
    res.writeHead(404).end('nope');
  }
});

// ---------------------------------------------------------------- mock LLM
let llmCalls = 0;
const llmServer = http.createServer((req, res) => {
  if (req.method !== 'POST' || !req.url.endsWith('/chat/completions')) {
    res.writeHead(404).end();
    return;
  }
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', async () => {
    llmCalls++;
    const j = JSON.parse(body);
    const system = j.messages[0].content;
    const user = j.messages[j.messages.length - 1].content;
    let reply;

    if (system.includes('ACT mode')) {
      const goal = /GOAL: (.*)/.exec(user)?.[1] ?? '';
      const prev = user.split('PREVIOUS ACTIONS:\n')[1] ?? '';
      const idx = (re) => Number(re.exec(user)?.[1]);
      let action;
      if (goal.includes('delete')) {
        action = prev.includes('Click')
          ? { type: 'done', message: 'Finished delete task.' }
          : { type: 'click', index: idx(/^\[(\d+)\] button "Delete account"/m) };
      } else if (!prev.includes('Type "')) {
        action = { type: 'type', index: idx(/^\[(\d+)\] input "Search"/m), text: 'hello' };
      } else if (!prev.includes('Click')) {
        action = { type: 'click', index: idx(/^\[(\d+)\] button "Go"/m) };
      } else {
        action = { type: 'done', message: 'Searched for hello.' };
      }
      reply = JSON.stringify({ thought: 'mock', action });
    } else if (system.includes('DEV mode')) {
      reply =
        `MOCK-DEV saw-error=${user.includes('test-error from page')} saw-404=${user.includes('/missing')}.\n` +
        '```css\nh1 { color: rgb(255, 0, 0) !important; }\n```\nDone.';
    } else {
      reply = `MOCK-ASK saw-marker=${user.includes('Hello from the test page')}`;
    }

    res.writeHead(200, { 'content-type': 'text/event-stream' });
    for (let i = 0; i < reply.length; i += 12) {
      const chunk = reply.slice(i, i + 12);
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: chunk } }] })}\n\n`);
      await new Promise((r) => setTimeout(r, 15));
    }
    res.write('data: [DONE]\n\n');
    res.end();
  });
});

// ---------------------------------------------------------------- helpers
let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  -> ' + detail}`);
  if (!ok) failures++;
};
const listen = (s) => new Promise((r) => s.listen(0, '127.0.0.1', () => r(s.address().port)));

const pagePort = await listen(pageServer);
const llmPort = await listen(llmServer);
const PAGE_URL = `http://127.0.0.1:${pagePort}/`;

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'webpilot-e2e-'));
const ctx = await chromium.launchPersistentContext(userDataDir, {
  executablePath: CHROME,
  headless: false,
  viewport: { width: 420, height: 800 },
  args: [
    `--disable-extensions-except=${EXT}`,
    `--load-extension=${EXT}`,
    '--disable-features=DisableLoadExtensionCommandLineSwitch',
  ],
  ignoreDefaultArgs: ['--disable-extensions'],
  acceptDownloads: true,
});

try {
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 15000 });
  const extId = new URL(sw.url()).host;
  console.log(`Extension loaded: ${extId}`);

  await sw.evaluate(
    (cfg) => chrome.storage.local.set({ config: cfg }),
    {
      provider: 'openai',
      profiles: { openai: { model: 'mock', apiKey: 'test-key', baseUrl: `http://127.0.0.1:${llmPort}/v1` } },
      requireApproval: true,
      maxSteps: 8,
    },
  );

  const page = await ctx.newPage();
  await page.goto(PAGE_URL);
  const tabId = await sw.evaluate(async (url) => {
    const [t] = await chrome.tabs.query({ url: url + '*' });
    return t.id;
  }, PAGE_URL);

  // The side panel runs as a normal tab here, so point its "active tab" lookup at the test page.
  const panel = await ctx.newPage();
  await panel.addInitScript((id) => {
    chrome.tabs.query = async () => [{ id }];
  }, tabId);
  await panel.goto(`chrome-extension://${extId}/sidepanel.html`);
  await panel.waitForSelector('.composer textarea');
  await panel.bringToFront();

  const send = async (text) => {
    await panel.fill('.composer textarea', text);
    await panel.press('.composer textarea', 'Enter');
  };
  const waitIdle = () => panel.waitForSelector('button.send:not(.stop)', { timeout: 30000 });
  const lastAssistant = () => panel.locator('.msg.assistant').last();

  // ---- Ask
  await send('what is on this page?');
  await waitIdle();
  await panel.waitForTimeout(600);
  const askText = await lastAssistant().innerText();
  check('Ask: page content reached the model', askText.includes('saw-marker=true'), askText);
  check('Ask: no "[object" / error rendering', !askText.includes('Could not') && !askText.includes('error'), askText);

  // ---- Act (record)
  await panel.click('.composer ~ * , .modes button:has-text("Act")').catch(() => {});
  await panel.locator('.modes button', { hasText: 'Act' }).click();
  await send('fill form with hello');
  await panel.waitForSelector('.save-macro', { timeout: 40000 });
  await waitIdle();
  const out1 = await page.locator('#out').innerText();
  check('Act: typed into input and clicked Go', out1 === 'Searched: hello', out1);
  const stepTexts = await panel.locator('.steps li').allInnerTexts();
  check('Act: step log shows type + click', stepTexts.some((s) => s.includes('Type')) && stepTexts.some((s) => s.includes('Click')), stepTexts.join(' | '));
  await panel.screenshot({ path: path.join(SHOTS, 'act-done.png') });

  // ---- Save macro
  await panel.fill('.save-macro input', 'Search hello');
  await panel.click('.save-macro button.primary');
  const stored = await sw.evaluate(async () => (await chrome.storage.local.get('macros')).macros);
  check('Macro: saved with 2 steps', stored?.length === 1 && stored[0].steps.length === 2, JSON.stringify(stored));

  // ---- Dev (logs seen + code written + Apply/Undo)
  await panel.locator('.modes button', { hasText: 'Dev' }).click();
  await send('make the heading red');
  await panel.waitForSelector('.code', { timeout: 20000 });
  await waitIdle();
  await panel.waitForFunction(() => !document.querySelector('.code .cursor'), null, { timeout: 10000 });
  const devText = await lastAssistant().innerText();
  check('Dev: saw console error from page', devText.includes('saw-error=true'), devText);
  check('Dev: saw failed network request', devText.includes('saw-404=true'), devText);
  const codeText = await panel.locator('.code pre').last().innerText();
  check('Dev: code block typed out fully', codeText.includes('rgb(255, 0, 0)'), codeText);
  await panel.screenshot({ path: path.join(SHOTS, 'dev-code.png') });

  const h1Color = () => page.evaluate(() => getComputedStyle(document.querySelector('h1')).color);
  const before = await h1Color();
  await panel.click('.code button:has-text("Apply to page")');
  await panel.waitForSelector('.code-status.ok');
  const applied = await h1Color();
  check('Apply: CSS changed the live page', applied === 'rgb(255, 0, 0)' && before !== applied, `${before} -> ${applied}`);
  await panel.click('.code button:has-text("Undo")');
  await panel.waitForSelector('.code button:has-text("Apply to page")');
  const undone = await h1Color();
  check('Undo: page restored', undone === before, `${undone} vs ${before}`);

  // ---- Approval gate (deny, then allow)
  await panel.locator('.modes button', { hasText: 'Act' }).click();
  await panel.click('button[title="New chat"]');
  await page.reload();
  await send('delete the account');
  await panel.waitForSelector('.approval', { timeout: 20000 });
  await panel.click('.approval button:has-text("Deny")');
  await waitIdle();
  const afterDeny = await page.locator('#out').innerText();
  check('Approval: denied action did not run', afterDeny === '', afterDeny);

  await panel.click('button[title="New chat"]');
  await send('delete the account');
  await panel.waitForSelector('.approval', { timeout: 20000 });
  await panel.click('.approval button:has-text("Allow")');
  await waitIdle();
  const afterAllow = await page.locator('#out').innerText();
  check('Approval: allowed action ran', afterAllow === 'deleted', afterAllow);

  // ---- Macro replay: 0 model calls
  await panel.click('button[title="New chat"]');
  await page.reload();
  await panel.waitForSelector('.macro button.suggest');
  const callsBefore = llmCalls;
  await panel.click('.macro button.suggest');
  await panel.waitForSelector('text=0 tokens used', { timeout: 30000 });
  await waitIdle();
  const replayOut = await page.locator('#out').innerText();
  check('Macro replay: reproduced the result', replayOut === 'Searched: hello', replayOut);
  check('Macro replay: used zero model calls', llmCalls === callsBefore, `${llmCalls - callsBefore} calls`);

  // ---- CSV export
  await panel.click('button[title="New chat"]');
  await panel.locator('.modes button', { hasText: 'Ask' }).click();
  const [download] = await Promise.all([
    panel.waitForEvent('download', { timeout: 15000 }),
    panel.click('button.suggest:has-text("Export tables")'),
  ]);
  const csvPath = await download.path();
  const csv = fs.readFileSync(csvPath, 'utf8');
  check('Export: CSV is correct and quotes commas', csv.trim() === 'Name,Qty\r\n"Apple, red",3\r\nPear,5', JSON.stringify(csv));

  // ---- Restricted page gives a friendly error
  await panel.click('button[title="New chat"]');
  const restricted = await ctx.newPage();
  await restricted.goto('chrome://version');
  await panel.evaluate((id) => {
    chrome.tabs.query = async () => [{ id }];
  }, (await sw.evaluate(async () => (await chrome.tabs.query({ url: 'chrome://version/*' }))[0]?.id)) ?? tabId);
  await panel.bringToFront();
  await send('hi');
  await waitIdle();
  await panel.waitForTimeout(300);
  const restrictedText = await lastAssistant().innerText();
  check('Restricted page: friendly error', /doesn't allow extensions|Couldn't attach/.test(restrictedText), restrictedText);
} catch (e) {
  failures++;
  console.error('FATAL', e);
} finally {
  await ctx.close();
  pageServer.close();
  llmServer.close();
  fs.rmSync(userDataDir, { recursive: true, force: true });
}

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
