// Screenshot the top and a mid-page view of each product page at one size.
// Usage: node scripts/pages.mjs <w> <h> <prefix>
import { chromium } from 'playwright';
const [w = 1440, h = 900, prefix = 'desktop'] = process.argv.slice(2);
const mobile = +w < 600;
const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
page.on('pageerror', (e) => console.log('pageerror:', e.message));
for (const p of ['occuralog', 'command', 'echo']) {
  await page.goto(`http://localhost:4322/${p}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `screenshots/${prefix}-page-${p}-top.png` });
  await page.evaluate(() => document.querySelector('.pp').scrollIntoView());
  await page.waitForTimeout(1600);
  await page.screenshot({ path: `screenshots/${prefix}-page-${p}-detail.png` });
}
await browser.close();
console.log('done');
