import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const CHROME =
  process.env.CHROME_PATH ||
  [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  ].find((p) => fs.existsSync(p));

const srcImg = 'C:/Users/sujoy/.gemini/antigravity/brain/fd1e05d7-9c53-472c-81fd-5171315827f6/.user_uploaded/media_1791064077093.png';
const outDir = 'C:/Users/sujoy/.gemini/antigravity/scratch/webpilot/public/icon';

async function main() {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const page = await browser.newPage();

  const b64 = fs.readFileSync(srcImg).toString('base64');
  const dataUrl = `data:image/png;base64,${b64}`;

  // Let's get the original image dimensions
  const dims = await page.evaluate(async (src) => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
      img.src = src;
    });
  }, dataUrl);

  console.log('Original dimensions:', dims);

  // In the image, Ultron's head and chest are centered horizontally.
  // The aspect ratio is wider than tall (landscape).
  // A square crop centered on the character (from top to bottom, or center of height)
  // Let's crop a square:
  // size = Math.min(dims.w, dims.h) = dims.h
  // sx = (dims.w - size) / 2
  // sy = 0
  const sizes = [16, 32, 48, 96, 128];

  for (const s of sizes) {
    const pngBase64 = await page.evaluate(
      ({ src, size, dims }) => {
        return new Promise((resolve) => {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d');

            // High quality image smoothing
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';

            // Center square crop
            const cropSize = dims.h;
            const sx = (dims.w - cropSize) / 2;
            const sy = 0;

            ctx.drawImage(img, sx, sy, cropSize, cropSize, 0, 0, size, size);
            resolve(canvas.toDataURL('image/png').split(',')[1]);
          };
          img.src = src;
        });
      },
      { src: dataUrl, size: s, dims }
    );

    const outPath = path.join(outDir, `${s}.png`);
    fs.writeFileSync(outPath, Buffer.from(pngBase64, 'base64'));
    console.log(`Generated: ${outPath} (${s}x${s})`);
  }

  await browser.close();
  console.log('Done generating all icons!');
}

main().catch(console.error);
