// Screenshot the viewport with a given element at the top.
// Usage: node scripts/at.mjs <selector> <w> <h> <out>
import { chromium } from 'playwright';
const [sel, w = 390, h = 844, out = 'screenshots/at.png'] = process.argv.slice(2);
const browser = await chromium.launch({ channel: 'msedge' });
const mobile = +w < 600;
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
await page.goto('http://localhost:4322/', { waitUntil: 'networkidle' });
await page.evaluate((s) => window.scrollTo(0, document.querySelector(s).getBoundingClientRect().top + scrollY - 70), sel);
await page.waitForTimeout(3500);
await page.screenshot({ path: out });
await browser.close();
