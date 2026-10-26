// Hovers a few System parts (desktop) and taps one (phone), screenshotting each card.
import { chromium } from 'playwright';
const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', (e) => console.log('pageerror:', e.message));
await page.goto('http://localhost:4322/', { waitUntil: 'networkidle' });
await page.evaluate(() => { const f = document.querySelector('.sys__figure'); window.scrollTo(0, f.getBoundingClientRect().top + scrollY - 120); });
await page.waitForTimeout(1500);
for (const k of ['whatsapp', 'occuralog', 'command', 'approvals']) {
  const node = page.locator(`.sys__svg--wide [data-node="${k}"]`);
  await node.hover();
  await page.waitForTimeout(2200);
  await page.screenshot({ path: `screenshots/card-${k}.png` });
  await page.mouse.move(5, 5);
  await page.waitForTimeout(400);
}
const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await phone.goto('http://localhost:4322/', { waitUntil: 'networkidle' });
await phone.evaluate(() => { const f = document.querySelector('.sys__figure'); window.scrollTo(0, f.getBoundingClientRect().top + scrollY - 80); });
await phone.waitForTimeout(1500);
await phone.locator('.sys__svg--tall [data-node="command"]').tap();
await phone.waitForTimeout(2200);
await phone.screenshot({ path: 'screenshots/card-phone-command.png' });
console.log('open on phone:', await phone.evaluate(() => [...document.querySelectorAll('.sys__card')].filter((c) => !c.hidden).map((c) => c.dataset.card).join(',')));
await browser.close();
