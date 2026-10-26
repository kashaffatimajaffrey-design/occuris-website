// Screenshot every screen at 1440x900 and 390x844 (PRD section 16, "Page").
// Usage: node scripts/shoot.mjs [baseUrl] [only-section-id]
import { chromium } from 'playwright';
const base = process.argv[2] ?? 'http://localhost:4322/';
const only = process.argv[3];
const screens = ['top', 'system', 'occuralog', 'command', 'echo', 'private', 'contact'];
const sizes = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'phone', width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
];
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || 'msedge', args: ['--enable-unsafe-swiftshader'] });
for (const s of sizes) {
  const ctx = await browser.newContext({ viewport: { width: s.width, height: s.height }, isMobile: s.isMobile, hasTouch: s.hasTouch, deviceScaleFactor: s.deviceScaleFactor ?? 1 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(`[${s.name}] pageerror:`, e.message));
  page.on('console', (m) => m.type() === 'error' && console.log(`[${s.name}] console:`, m.text(), m.location().url));
  await page.goto(base, { waitUntil: 'networkidle' });
  for (const id of screens) {
    if (only && id !== only) continue;
    await page.evaluate((id) => window.scrollTo(0, document.getElementById(id).getBoundingClientRect().top + scrollY), id);
    await page.waitForTimeout(id === 'occuralog' ? 3500 : id === 'command' ? 4500 : 1800);
    await page.screenshot({ path: `screenshots/${s.name}-${id}.png` });
  }
  await ctx.close();
}
await browser.close();
console.log('done');
