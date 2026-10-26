// Generates the static fallbacks and the social preview from the live page:
//   public/fallbacks/{map,flowfield,building}.png, public/og.png
// Usage (with pnpm preview running): node scripts/assets.mjs http://localhost:4322/
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'http://localhost:4322/';
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || 'msedge' });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('pageerror:', e.message));
await page.goto(base, { waitUntil: 'networkidle' });
await page.addStyleTag({ content: '.bub{display:none!important}' });
await page.waitForTimeout(3000);
await page.locator('[data-piece="map"] canvas').screenshot({ path: 'public/fallbacks/map.png' });
console.log('map.png');

await page.evaluate(() => {
  const f = document.querySelector('[data-piece="flow"]');
  window.scrollTo(0, f.getBoundingClientRect().top + scrollY - innerHeight + 60);
});
await page.waitForTimeout(3000);
await page.evaluate(() => {
  const f = document.querySelector('[data-piece="flow"]');
  window.scrollTo(0, f.getBoundingClientRect().top + scrollY - 200);
});
await page.waitForTimeout(300);
await page.locator('[data-piece="flow"] canvas').screenshot({ path: 'public/fallbacks/flowfield.png' });
console.log('flowfield.png');

await page.evaluate(() => document.getElementById('private').scrollIntoView());
await page.waitForTimeout(2500);
await page.locator('[data-piece="building"] canvas').screenshot({ path: 'public/fallbacks/building.png' });
console.log('building.png');
await ctx.close();

// Social preview: the map with the tagline, 1200 x 630
const og = await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
const op = await og.newPage();
await op.goto(base, { waitUntil: 'networkidle' });
await op.addStyleTag({
  content: `
    .nav__links, .nav__cta, .skip, .hud, .hero__actions, .hero__hint, .hero__alert, .hero__title { display: none !important; }
    .nav { background: transparent; border: 0; backdrop-filter: none; }
    .story__map { left: 36%; top: 40px; }
    .beat--hero { width: 40%; padding-top: 0; }
    .hero__sub { font-family: var(--font-serif); font-size: 44px; line-height: 1.04; letter-spacing: -0.015em; color: var(--ink); margin: 0; }
  `,
});
await op.evaluate(() => dispatchEvent(new Event('resize')));
await op.waitForTimeout(5200);
await op.screenshot({ path: 'public/og.png' });
console.log('og.png');
await browser.close();
