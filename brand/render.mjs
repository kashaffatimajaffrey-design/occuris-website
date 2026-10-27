// Renders the LinkedIn cover and logos to PNG at 2x: node brand/render.mjs
import { chromium } from 'playwright';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
// The scene goes in as a data URL so the page may read its pixels
const port = `data:image/webp;base64,${readFileSync(path.join(here, 'source/port-b.webp')).toString('base64')}`;

const browser = await chromium.launch({ channel: 'msedge' });
const shots = [
  { src: 'banner.html', out: 'linkedin-banner.png', w: 1128, h: 191 },
  { src: 'logo.html', out: 'linkedin-logo.png', w: 400, h: 400 },
  { src: 'logo.html?ink', out: 'linkedin-logo-dark.png', w: 400, h: 400 },
];
for (const s of shots) {
  const page = await browser.newPage({ viewport: { width: s.w, height: s.h }, deviceScaleFactor: 2 });
  await page.addInitScript((p) => (window.PORT = p), port);
  const [file, query = ''] = s.src.split('?');
  await page.goto(pathToFileURL(path.join(here, file)).href + (query ? `?${query}` : ''));
  await page.evaluate(async () => {
    await document.fonts.ready;
    if (window.ready) await window.ready;
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(here, s.out), clip: { x: 0, y: 0, width: s.w, height: s.h } });
  await page.close();
}
await browser.close();
console.log('rendered');
