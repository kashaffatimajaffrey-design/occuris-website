// Runs the automatable checks against a running server and prints pass / fail.
// Usage: node scripts/check.mjs [url]
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'http://localhost:4322/';
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || 'msedge' });

// ---------------- desktop ----------------
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
      if (/webgl/.test(type)) window.__webgl = true;
      return orig.call(this, type, ...rest);
    };
  });
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  check('map: living map starts on load', await page.evaluate(() => !!window.__map));

  // An ambient message pops out of the map, gets scanned, becomes a record
  await page.waitForSelector('.bub.is-in', { timeout: 8000, state: 'attached' });
  await page.waitForSelector('.bub.is-scan', { timeout: 4000, state: 'attached' });
  await page.waitForSelector('.bub.is-rec', { timeout: 4000, state: 'attached' });
  check('map: a WhatsApp message pops up, is scanned and becomes a record', true);

  // Blocking a road: alert types within 100 ms and clears when it reopens
  const t0 = Date.now();
  await page.evaluate(() => window.__map.breakLink(1));
  await page.waitForFunction(() => document.querySelector('[data-alert]').textContent.length > 0, null, { timeout: 2000 });
  const dt = Date.now() - t0;
  check('hero: blocking a road types its alert within 100 ms', dt <= 150, `${dt} ms incl. round-trip`);
  await page.waitForTimeout(3300);
  const alert = await page.locator('[data-alert]').textContent();
  check('hero: alert text matches section 15', alert.startsWith('Customs hold on 3 containers.'), alert);
  await page.waitForTimeout(3200);
  check('hero: road reopens after 6 s and the alert clears', (await page.locator('[data-alert]').textContent()) === '');

  // Story: the port beat moves the camera, says the message, types the decision
  await page.evaluate(() => {
    const b = document.querySelector('[data-beat="3"]');
    const r = b.getBoundingClientRect();
    window.scrollTo(0, r.top + scrollY + r.height / 2 - innerHeight / 2);
  });
  await page.waitForTimeout(4500);
  const beat = await page.evaluate(() => ({
    active: document.querySelector('[data-beat="3"]').classList.contains('is-active'),
    decision: document.querySelector('[data-beat="3"] [data-decision]').textContent,
    clock: document.querySelector('[data-clock]').textContent,
    counts: [...document.querySelectorAll('[data-count]')].map((e) => e.textContent).join('/'),
  }));
  check('story: port beat becomes active and the clock reads 09:15', beat.active && beat.clock === '09:15', beat.clock);
  check('story: the decision types itself after the message is parsed', beat.decision.startsWith('Customs hold'), beat.decision.slice(0, 40));
  check('story: HUD counts messages, records and decisions', beat.counts === '2/2/1', beat.counts);

  // Occuralog flow field
  await page.evaluate(() => document.getElementById('occuralog').scrollIntoView());
  await page.waitForTimeout(600);
  check('flow: 2,000 particles at 1440 px', (await page.evaluate(() => window.__flow?.count)) === 2000);
  await page.waitForFunction(() => document.querySelector('[data-piece="flow"]').classList.contains('is-table'), null, { timeout: 8000 });
  await page.waitForTimeout(1600);
  const t = await page.evaluate(() => {
    const f = document.querySelector('[data-piece="flow"]');
    return { rows: f.querySelectorAll('tbody tr').length, lang: f.querySelector('tbody td').getAttribute('lang'), canvas: getComputedStyle(f.querySelector('canvas')).opacity };
  });
  check('flow: particles hand off to the 8-row table, Urdu column first', t.rows === 8 && t.lang === 'ur' && t.canvas === '0');

  // Command diagram and building
  await page.evaluate(() => document.getElementById('command').scrollIntoView());
  await page.waitForTimeout(2500);
  const dg = await page.evaluate(() => ({ nodes: document.querySelectorAll('.flow .node--agent').length, packets: document.querySelectorAll('.flow .pk').length, alert: document.querySelectorAll('.flow .node--agent.is-alert').length }));
  check('command: six agents, packets flowing, one agent alerting', dg.nodes === 6 && dg.packets > 5 && dg.alert === 1, JSON.stringify(dg));
  await page.evaluate(() => document.getElementById('private').scrollIntoView());
  await page.waitForTimeout(1500);
  check('no WebGL anywhere (three.js removed)', !(await page.evaluate(() => !!window.__webgl)));

  const links = await page.evaluate(() => {
    const ext = [...document.querySelectorAll('a[href^="http"]')];
    return {
      bad: ext.filter((a) => a.target !== '_blank' || !/noopener/.test(a.rel)).length,
      mail: document.querySelector('a[href^="mailto:"]')?.getAttribute('href'),
      gmail: document.querySelector('a[href^="https://mail.google.com/"]')?.getAttribute('href'),
      dead: [...document.querySelectorAll('a')].filter((a) => !a.getAttribute('href')).length,
      wa: document.querySelectorAll('a[href*="wa.me"]').length + (document.body.textContent.includes('2330298') ? 1 : 0),
      copyButtons: document.querySelectorAll('[data-copy]').length,
      office: document.body.textContent.includes('Bahria University, Karachi'),
    };
  });
  check('links: external links open in a new tab with rel noopener', links.bad === 0);
  check('contact: email opens Gmail compose, mail-app fallback, no WhatsApp number', /to=occurisai%40gmail.com/.test(links.gmail ?? '') && (links.mail ?? '').startsWith('mailto:occurisai@gmail.com') && links.wa === 0 && links.copyButtons === 0);
  check('links: no link without an address', links.dead === 0);
  check('contact: office reads Bahria University, Karachi', links.office);
  check('no page errors on desktop', errors.length === 0, errors.join(' | '));
  await page.close();
}

// ---------------- phone ----------------
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  check('phone: no horizontal page scroll at 390 px', !(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)));
  await page.evaluate(() => document.getElementById('occuralog').scrollIntoView());
  await page.waitForTimeout(800);
  check('phone: 800 particles at 390 px', (await page.evaluate(() => window.__flow?.count)) === 800);
  check('no page errors on phone', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

// ---------------- reduced motion ----------------
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const s = await page.evaluate(async () => {
    const st = document.querySelector('[data-piece="map"]');
    const img = st.querySelector('.fallback');
    img.loading = 'eager';
    if (!img.complete) await new Promise((r) => (img.onload = img.onerror = r));
    return { canvas: getComputedStyle(st.querySelector('canvas')).display, img: getComputedStyle(img).display, w: img.naturalWidth, map: !!window.__map };
  });
  check('reduced motion: static map image, no canvas, nothing animating', s.canvas === 'none' && s.img === 'block' && s.w > 0 && !s.map, JSON.stringify(s));
  await ctx.close();
}

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
