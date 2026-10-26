// Screenshot one story beat at a given width. Usage: node scripts/beat.mjs <beat> <w> <h> <out>
import { chromium } from 'playwright';
const [beat = 4, w = 1280, h = 800, out = 'screenshots/beat.png'] = process.argv.slice(2);
const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
await page.goto('http://localhost:4322/', { waitUntil: 'networkidle' });
await page.evaluate((i) => {
  const b = document.querySelector(`[data-beat="${i}"]`);
  const r = b.getBoundingClientRect();
  window.scrollTo(0, r.top + scrollY + r.height / 2 - innerHeight / 2);
}, beat);
await page.waitForTimeout(5000);
await page.screenshot({ path: out });
await browser.close();
