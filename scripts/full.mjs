import { chromium } from 'playwright';
const [url = 'http://localhost:4322/', w = 1440, h = 900, out = 'screenshots/full.png'] = process.argv.slice(2);
const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
await page.goto(url, { waitUntil: 'networkidle' });
// Walk the page so every lazy piece starts and every reveal fires
for (let y = 0; y < 12000; y += 400) { await page.evaluate((y) => window.scrollTo(0, y), y); await page.waitForTimeout(120); }
await page.waitForTimeout(2500);
await page.evaluate(() => document.getElementById('contact').scrollIntoView());
await page.waitForTimeout(800);
const total = await page.evaluate(() => document.documentElement.scrollHeight);
await page.evaluate((t) => window.scrollTo(0, t), total);
await page.waitForTimeout(800);
await page.screenshot({ path: out });
await browser.close();
