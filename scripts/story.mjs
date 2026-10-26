// Walks the story beat by beat and screenshots each one.
// Usage: node scripts/story.mjs [url] [w] [h] [prefix]
import { chromium } from 'playwright';
const [url = 'http://localhost:4322/', w = 1440, h = 900, prefix = 'desktop'] = process.argv.slice(2);
const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('pageerror:', e.message));
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(7000);
console.log('bubbles at hero:', await page.locator('.bub').count());
await page.screenshot({ path: `screenshots/${prefix}-beat-0.png` });
const n = await page.locator('[data-beat]').count();
for (let i = 1; i < n; i++) {
  await page.evaluate((i) => {
    const b = document.querySelector(`[data-beat="${i}"]`);
    const r = b.getBoundingClientRect();
    window.scrollTo(0, r.top + scrollY + r.height / 2 - innerHeight / 2);
  }, i);
  await page.waitForTimeout(4200);
  await page.screenshot({ path: `screenshots/${prefix}-beat-${i}.png` });
}
await browser.close();
console.log('beats', n);
