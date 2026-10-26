// Captures the hero at the moment the road pulses, and the flow field before it lands.
import { chromium } from 'playwright';
const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('http://localhost:4322/');
await page.waitForFunction(() => !!window.__map);
await page.waitForTimeout(2700);
await page.screenshot({ path: 'screenshots/desktop-hint.png' });
// Flow field: one viewport above, so it runs but has not been triggered
await page.evaluate(() => { const f = document.querySelector('[data-piece="flow"]'); window.scrollTo(0, f.getBoundingClientRect().top + scrollY - innerHeight - 40); });
await page.waitForTimeout(2500);
await page.evaluate(() => { const f = document.querySelector('[data-piece="flow"]'); window.scrollTo(0, f.getBoundingClientRect().top + scrollY - innerHeight + 140); });
await page.waitForTimeout(250);
await page.screenshot({ path: 'screenshots/desktop-flow-early.png' });
await browser.close();
