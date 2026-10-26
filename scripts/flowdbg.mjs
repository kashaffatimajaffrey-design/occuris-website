import { chromium } from 'playwright';
const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('http://localhost:4322/', { waitUntil: 'networkidle' });
await page.evaluate(() => { const f = document.querySelector('[data-piece="flow"]'); window.scrollTo(0, f.getBoundingClientRect().top + scrollY - innerHeight - 40); });
await page.waitForTimeout(2000);
console.log(JSON.stringify(await page.evaluate(() => window.__flow?.state)));
await browser.close();
