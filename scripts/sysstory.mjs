// Films the System story: a frame at each stage, desktop then phone.
import { chromium } from 'playwright';
const browser = await chromium.launch({ channel: 'msedge' });
for (const [w, h, name] of [[1440, 900, 'desktop'], [390, 844, 'phone']]) {
  const mobile = w < 600;
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
  page.on('pageerror', (e) => console.log('pageerror:', e.message));
  await page.goto('http://localhost:4322/', { waitUntil: 'networkidle' });
  await page.evaluate(() => { const f = document.querySelector('.sys__figure'); window.scrollTo(0, f.getBoundingClientRect().top + scrollY - (innerWidth < 600 ? 20 : 120)); });
  for (const [ms, tag] of [[1600, '1-message'], [3600, '2-record'], [3600, '3-decision'], [3700, '4-voice'], [3300, '5-done']]) {
    await page.waitForTimeout(ms);
    await page.screenshot({ path: `screenshots/story-${name}-${tag}.png` });
  }
  await page.close();
}
await browser.close();
console.log('done');
