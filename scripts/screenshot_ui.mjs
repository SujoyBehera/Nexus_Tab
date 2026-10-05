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

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-shot-'));
const ctx = await chromium.launchPersistentContext(userDataDir, {
  executablePath: CHROME,
  headless: false,
  viewport: { width: 440, height: 750 },
  args: [
    `--disable-extensions-except=${EXT}`,
    `--load-extension=${EXT}`,
    '--disable-features=DisableLoadExtensionCommandLineSwitch',
  ],
  ignoreDefaultArgs: ['--disable-extensions'],
});

try {
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 15000 });
  const extId = new URL(sw.url()).host;

  await sw.evaluate(
    (cfg) => chrome.storage.local.set({ config: cfg }),
    {
      provider: 'gemini',
      profiles: { gemini: { model: 'gemini-1.5-flash', apiKey: 'test-key', baseUrl: '' } },
      requireApproval: true,
      maxSteps: 8,
    },
  );

  const panel = await ctx.newPage();
  await panel.goto(`chrome-extension://${extId}/sidepanel.html`);
  await panel.waitForSelector('.schema-svg');
  await panel.waitForTimeout(1000);

  // Take screenshot of default empty state
  await panel.screenshot({ path: path.join(SHOTS, 'nexus-empty-state.png') });
  console.log('Saved nexus-empty-state.png');

  // Open mode dropdown and take screenshot
  await panel.click('.mode-selector-btn');
  await panel.waitForTimeout(500);
  await panel.screenshot({ path: path.join(SHOTS, 'nexus-mode-popover.png') });
  console.log('Saved nexus-mode-popover.png');
} finally {
  await ctx.close();
  fs.rmSync(userDataDir, { recursive: true, force: true });
}
