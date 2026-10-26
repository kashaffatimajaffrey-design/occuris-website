// Films the Command diagram: the trucks driving, then a few parts hovered
// (desktop) and one tapped (phone), screenshotting each card.
import { chromium } from 'playwright';
const base = process.env.URL || 'http://localhost:4322/';
const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', (e) => console.log('pageerror:', e.message));
await page.goto(base, { waitUntil: 'networkidle' });
const toFig = (off) => page.evaluate((o) => { const f = document.querySelector('.cmd__fig'); window.scrollTo(0, f.getBoundingClientRect().top + scrollY - o); }, off);
await toFig(60);
await page.waitForTimeout(2500);
console.log('trucks on screen:', await page.evaluate(() => document.querySelectorAll('.flow .tk').length));
await page.screenshot({ path: 'screenshots/cmd-trucks.png' });
await page.locator('.cmd__fig').screenshot({ path: 'screenshots/cmd-trucks-zoom.png', scale: 'device' });
for (const k of ['whatsapp', 'data', 'inventory', 'reporting', 'approvals']) {
  await toFig(60);
  await page.locator(`.flow [data-node="${k}"]`).hover();
  await page.waitForTimeout(2200);
  await page.screenshot({ path: `screenshots/cmd-card-${k}.png` });
  await page.mouse.move(5, 5);
  await page.waitForTimeout(400);
}
const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
phone.on('pageerror', (e) => console.log('pageerror:', e.message));
await phone.goto(base, { waitUntil: 'networkidle' });
await phone.evaluate(() => { const f = document.querySelector('.cmd__fig'); window.scrollTo(0, f.getBoundingClientRect().top + scrollY - 40); });
await phone.waitForTimeout(2000);
await phone.evaluate(() => { const f = document.querySelector('.cmd__fig'); window.scrollTo(0, f.getBoundingClientRect().top + scrollY - 40); });
await phone.waitForTimeout(1500);
await phone.screenshot({ path: 'screenshots/cmd-phone-trucks.png' });
await phone.locator('.flow [data-node="risk"]').tap();
await phone.waitForTimeout(2200);
await phone.screenshot({ path: 'screenshots/cmd-phone-card.png' });
console.log('open on phone:', await phone.evaluate(() => [...document.querySelectorAll('.cmd__fig .sys__card')].filter((c) => !c.hidden).map((c) => c.dataset.card).join(',')));
await browser.close();
