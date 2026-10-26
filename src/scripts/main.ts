// Page behaviour. Copy never lives here: strings arrive through data
// attributes rendered from content/copy.ts.

import Lenis from 'lenis';
import { init as initMap, type Message, type Shot, type WorldMap } from '../world/map';
import { init as initDiagram, type FlowDiagram } from '../world/flow';
import { init as initBuilding } from '../world/building';
import { init as initFlow, type Flow, type Target } from '../physics/flowfield';
import type { Piece } from '../physics/verlet';
import { weightOnPointer } from './type';

const html = document.documentElement;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const phone = matchMedia('(max-width: 767px)').matches;
const $ = <T extends Element = HTMLElement>(s: string, root: ParentNode = document) => root.querySelector<T>(s);
const $$ = <T extends Element = HTMLElement>(s: string, root: ParentNode = document) => [...root.querySelectorAll<T>(s)];
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

declare global {
  interface Window {
    __map?: WorldMap;
    __flow?: Flow;
  }
}

// ---------- typing ----------

/** Types text into an element at 40 characters per second. */
function typer(el: HTMLElement, cps = 40) {
  let timer = 0;
  return {
    type(text: string, onDone?: () => void) {
      clearInterval(timer);
      let n = 1;
      el.textContent = text.slice(0, 1);
      timer = window.setInterval(() => {
        el.textContent = text.slice(0, ++n);
        if (n >= text.length) {
          clearInterval(timer);
          onDone?.();
        }
      }, 1000 / cps);
    },
    clear() {
      clearInterval(timer);
      el.textContent = '';
    },
  };
}

// ---------- canvas lifecycle ----------

/**
 * Starts a piece when its stage comes within one viewport of the fold, and
 * pauses it whenever it is off-screen or the tab is hidden.
 */
function lifecycle(stage: HTMLElement, start: () => Piece | Promise<Piece>) {
  let piece: Piece | null = null;
  let visible = false;
  let idle = false;
  const sync = () => {
    if (!piece) return;
    if (visible && !idle && !document.hidden) piece.resume();
    else piece.pause();
  };
  const near = new IntersectionObserver(
    (entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      near.disconnect();
      Promise.resolve()
        .then(start)
        .then((p) => {
          piece = p;
          sync();
        })
        .catch((err) => {
          console.warn(err);
          stage.classList.add('is-fallback');
        });
    },
    { rootMargin: '100% 0px' },
  );
  const on = new IntersectionObserver((entries) => {
    visible = entries[entries.length - 1].isIntersecting;
    sync();
  });
  near.observe(stage);
  on.observe(stage);
  document.addEventListener('visibilitychange', sync);
  return {
    setIdle(v: boolean) {
      idle = v;
      sync();
    },
  };
}

// ---------- smooth scroll and nav ----------

let lenis: Lenis | null = null;
if (!reduce) lenis = new Lenis({ autoRaf: true, lerp: 0.11 });

for (const a of $$<HTMLAnchorElement>('a[data-scroll]')) {
  a.addEventListener('click', (e) => {
    const target = a.hash ? $(a.hash) : null;
    if (!target) return;
    e.preventDefault();
    if (lenis) lenis.scrollTo(target, { duration: 1.2 });
    else target.scrollIntoView({ behavior: 'auto' });
    history.replaceState(null, '', a.hash === '#top' ? location.pathname : a.hash);
    target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
  });
}

const nav = $('.nav')!;
const screens = $$('[data-screen]');
const navLinks = $$<HTMLAnchorElement>('.nav__links a');
let navQueued = false;
function updateNav() {
  navQueued = false;
  const probe = 32;
  const mid = innerHeight * 0.45;
  let current = '';
  for (const s of screens) {
    const r = s.getBoundingClientRect();
    if (r.top <= probe && r.bottom > probe) nav.dataset.theme = s.dataset.screen;
    if (r.top <= mid && r.bottom > mid) current = s.id;
  }
  for (const l of navLinks) l.setAttribute('aria-current', String(l.hash === `#${current}`));
}
const queueNav = () => {
  if (!navQueued) {
    navQueued = true;
    requestAnimationFrame(updateNav);
  }
};
addEventListener('scroll', queueNav, { passive: true });
addEventListener('resize', queueNav);
updateNav();

// ---------- text reveal ----------

const reveal = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.classList.add('is-in');
      reveal.unobserve(e.target);
    }
  },
  { rootMargin: '0px 0px -8% 0px' },
);
$$('[data-reveal]').forEach((el) => reveal.observe(el));

if (!reduce) weightOnPointer();

// ---------- screen 1 and the day: the living map ----------

const mapStage = $('[data-piece="map"]');
if (mapStage && !reduce) {
  const canvas = $<HTMLCanvasElement>('canvas', mapStage)!;
  const overlay = $('.story__overlay', mapStage)!;
  const d = mapStage.dataset;
  const messages: Message[] = JSON.parse(d.messages ?? '[]');
  const places: Record<string, string> = JSON.parse(d.places ?? '{}');
  const alerts: string[] = JSON.parse(d.alerts ?? '[]');
  const alertBox = $('.hero__alert');
  const alertText = alertBox ? typer($('[data-alert]', alertBox)!) : null;
  const beats = $$('[data-beat]');
  const clockEl = $('[data-clock]');
  const counts = {
    messages: $('[data-count="messages"]'),
    records: $('[data-count="records"]'),
    decisions: $('[data-count="decisions"]'),
  };
  let map: WorldMap | null = null;
  let current = -1;
  let heroAlert = -1;

  const bump = (el: HTMLElement | null, v: number) => {
    if (!el || el.textContent === String(v)) return;
    el.textContent = String(v);
    el.classList.remove('is-bump');
    void el.offsetWidth;
    el.classList.add('is-bump');
  };

  // Camera for each beat, in map tiles. Phones zoom in a little further.
  const z = phone ? 1.5 : 1;
  const SHOTS: Shot[] = [
    { x: 23, y: 11, zoom: 1 * (phone ? 1.6 : 1) },
    { x: 23, y: 11, zoom: 1.05 * (phone ? 1.6 : 1) },
    { x: 0, y: 0, zoom: 2.4 * z, follow: 'truck-3-0' },
    { x: 15.6, y: 16.2, zoom: 2.6 * z },
    { x: 41.5, y: 3, zoom: 2.4 * z },
    { x: 21.9, y: 19, zoom: 2.8 * z },
    { x: 23.6, y: 16.8, zoom: 2.3 * z },
    { x: 0, y: 0, zoom: 1.6 * z, follow: 'plane' },
    { x: 21.9, y: 19, zoom: 2.8 * z },
    { x: 23, y: 11, zoom: 1 * (phone ? 1.6 : 1) },
  ];
  // On phones the beat card covers the top of the map, so aim lower
  if (phone) SHOTS.forEach((s, i) => i > 1 && (s.ay = 0.66));

  const typers = new Map<HTMLElement, ReturnType<typeof typer>>();

  function enter(i: number) {
    if (!map || i === current) return;
    current = i;
    beats.forEach((b, k) => b.classList.toggle('is-active', k === i));
    const beat = beats[i];
    map.clear();
    map.setStock(27);
    map.shoot(SHOTS[i] ?? SHOTS[0]);
    map.setAmbient(i <= 1 || i === beats.length - 1);
    if (clockEl) clockEl.textContent = beat.querySelector('.beat__time')?.textContent ?? clockEl.textContent;

    // Counters show where in the day we are
    const msgBeats = beats.slice(0, i + 1).filter((b) => b.dataset.msg !== undefined);
    bump(counts.messages, msgBeats.length);
    bump(counts.records, Math.max(0, msgBeats.length - (beat.dataset.msg !== undefined ? 1 : 0)));
    bump(counts.decisions, beats.slice(0, i).filter((b) => b.querySelector('[data-decision]') && !b.querySelector('.beat__decision--ok')).length);

    const msg = beat.dataset.msg;
    if (msg === undefined) return;
    const index = Number(msg);
    if (i === 6) map.block(3, { reroute: true, hold: true });
    if (i === 7) map.launchPlane();
    if (i === 5) map.setStock(3);
    map.say(index, { keep: true });
  }

  lifecycle(mapStage, () => {
    map = initMap(canvas, {
      overlay,
      messages,
      labels: places,
      ambient: true,
      interactive: true,
      onParsed(index) {
        const beat = beats[current];
        if (!beat || Number(beat.dataset.msg) !== index) return;
        bump(counts.records, beats.slice(0, current + 1).filter((b) => b.dataset.msg !== undefined).length);
        const slot = beat.querySelector<HTMLElement>('[data-decision]');
        if (!slot) return;
        beat.classList.add('is-decided');
        if (!beat.querySelector('.beat__decision--ok')) bump(counts.decisions, Number(counts.decisions?.textContent ?? 0) + 1);
        let t = typers.get(slot);
        if (!t) typers.set(slot, (t = typer(slot, 55)));
        t.type(slot.dataset.decision ?? '');
      },
      onBreak(link) {
        if (current > 1 || !alertText || !alertBox) return;
        heroAlert = link;
        alertBox.classList.add('is-on', 'is-typing');
        alertText.type(alerts[link] ?? '', () => alertBox.classList.remove('is-typing'));
      },
      onHeal(link) {
        if (link !== heroAlert || !alertText || !alertBox) return;
        heroAlert = -1;
        alertText.clear();
        alertBox.classList.remove('is-on', 'is-typing');
      },
    });
    window.__map = map;
    enter(0);
    return map;
  });

  // The beat in the middle of the viewport drives the map
  const watch = new IntersectionObserver(
    (entries) => {
      for (const e of entries) if (e.isIntersecting) enter(beats.indexOf(e.target as HTMLElement));
    },
    { rootMargin: '-48% 0px -48% 0px' },
  );
  beats.forEach((b) => watch.observe(b));
}

// ---------- screen 3: Occuralog ----------

const toggle = $<HTMLButtonElement>('[data-record-toggle]');
const record = $('#occ-record');
if (toggle && record) {
  toggle.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') !== 'true';
    toggle.setAttribute('aria-expanded', String(open));
    $('[data-label]', toggle)!.textContent = open ? toggle.dataset.close! : toggle.dataset.open!;
    if (open) {
      record.hidden = false;
      requestAnimationFrame(() => requestAnimationFrame(() => record.classList.add('is-open')));
    } else {
      record.classList.remove('is-open');
      record.hidden = true;
    }
  });
}

const flowStage = $('[data-piece="flow"]');
if (flowStage && !reduce) {
  const canvas = $<HTMLCanvasElement>('canvas', flowStage)!;
  const tableWrap = $('[data-table]', flowStage)!;
  const replay = $<HTMLButtonElement>('[data-replay]', flowStage)!;
  let flow: Flow | null = null;

  // Line the particles up on the real text of each table cell, so the
  // rows they form are the rows that appear.
  const targets = (count: number, w: number, h: number): Target[] => {
    const base = canvas.getBoundingClientRect();
    const segs: { x0: number; x1: number; y: number }[] = [];
    const range = document.createRange();
    for (const cell of $$('tbody td, thead th', tableWrap)) {
      const cr = cell.getBoundingClientRect();
      const walk = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
      for (let node = walk.nextNode(); node; node = walk.nextNode()) {
        if (!node.textContent?.trim()) continue;
        range.selectNodeContents(node);
        for (const r of range.getClientRects()) {
          const x0 = Math.max(r.left, cr.left + 6) - base.left;
          const x1 = Math.min(r.right, cr.right - 6) - base.left;
          const y = r.top + r.height / 2 - base.top;
          // Skip lines hidden by the two-line clamp
          if (r.top < cr.top || r.bottom > cr.bottom + 1) continue;
          if (x1 - x0 > 2 && y > 0 && y < h && x0 < w) segs.push({ x0, x1: Math.min(x1, w), y });
        }
      }
    }
    const total = segs.reduce((s, g) => s + (g.x1 - g.x0), 0);
    if (!total) return [];
    const out: Target[] = [];
    for (const g of segs) {
      const n = Math.max(1, Math.round((count * (g.x1 - g.x0)) / total));
      for (let k = 0; k < n; k++)
        out.push({
          x: g.x0 + ((k + 0.5) / n) * (g.x1 - g.x0) + (Math.random() - 0.5) * 4,
          y: g.y + (Math.random() - 0.5) * 6,
        });
    }
    return out;
  };

  flowStage.dataset.cascade = '';
  const life = lifecycle(flowStage, () => {
    flow = initFlow(canvas, {
      count: phone ? 800 : 2000,
      speed: phone ? 1.1 : 1.4,
      targets,
      onFormed() {
        flowStage.classList.add('is-table');
        replay.hidden = false;
        setTimeout(() => life.setIdle(true), 450);
      },
    });
    window.__flow = flow;
    return flow;
  });

  // Triggered when the canvas is 40 % in view. Scrolling back does not reverse it.
  const trigger = new IntersectionObserver(
    (entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      const go = () => (flow ? flow.form() : setTimeout(go, 100));
      setTimeout(go, 400);
      trigger.disconnect();
    },
    { threshold: 0.4 },
  );
  trigger.observe(flowStage);

  replay.addEventListener('click', async () => {
    if (!flow) return;
    replay.hidden = true;
    life.setIdle(false);
    flow.scatter();
    flowStage.classList.remove('is-table');
    await wait(2400);
    flow.form();
  });
}

// ---------- screen 4: the agents as a flow diagram ----------

let diagram: FlowDiagram | null = null;
const diagramHost = $('[data-piece="flow-diagram"]');
if (diagramHost) {
  const cfg = JSON.parse(diagramHost.dataset.flow ?? '{}');
  lifecycle(diagramHost, () => {
    diagram = initDiagram(diagramHost, cfg);
    if (reduce) diagram.pause();
    return reduce ? { pause() {}, resume() {}, destroy() {} } : diagram;
  });
}

const strip = $('[data-strip]');
if (strip) {
  const alerts: { agent: string; text: string }[] = JSON.parse(strip.dataset.alerts ?? '[]');
  const timeEl = $('[data-strip-time]', strip)!;
  const agentEl = $('[data-strip-agent]', strip)!;
  const line = $('[data-strip-text]', strip)!;
  const prev = $('[data-strip-prev]', strip)!;
  const tzLabel = strip.dataset.tzLabel;
  const clock = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: strip.dataset.tz });
  let lastLine = '';

  const show = (n: number, chars: number) => {
    const a = alerts[n];
    const cut = a.text.indexOf(':') + 1;
    const head = a.text.slice(0, Math.min(chars, cut));
    const tail = chars > cut ? a.text.slice(cut, chars) : '';
    line.replaceChildren(Object.assign(document.createElement('span'), { className: 'k', textContent: head }), tail);
  };

  let i = 0;
  let timers: number[] = [];
  let running = false;
  const later = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms));
  const stop = () => {
    timers.forEach(clearTimeout);
    timers = [];
    running = false;
  };

  const cycle = () => {
    const n = i % alerts.length;
    const a = alerts[n];
    line.replaceChildren();
    prev.textContent = lastLine;
    agentEl.textContent = '';
    timeEl.textContent = `${clock.format(new Date())} ${tzLabel}`;
    diagram?.alert(null);
    later(800, () => {
      diagram?.alert(a.agent);
      timeEl.textContent = `${clock.format(new Date())} ${tzLabel}`;
      lastLine = `${timeEl.textContent}  ${a.text}`;
      agentEl.textContent = `· ${a.agent}`;
      let c = 0;
      const typeNext = () => {
        show(n, ++c);
        if (c < a.text.length) later(25, typeNext);
      };
      typeNext();
    });
    later(9000, () => {
      i++;
      cycle();
    });
  };

  if (reduce) {
    show(0, alerts[0].text.length);
  } else {
    const io = new IntersectionObserver((entries) => {
      const vis = entries[entries.length - 1].isIntersecting;
      if (vis && !running) {
        running = true;
        cycle();
      } else if (!vis && running) stop();
    });
    io.observe(strip.closest('section') ?? strip);
  }
}

// ---------- screen 5: the building ----------

const buildingStage = $('[data-piece="building"]');
if (buildingStage && !reduce) {
  const canvas = $<HTMLCanvasElement>('canvas', buildingStage)!;
  lifecycle(buildingStage, () => initBuilding(canvas, { labels: JSON.parse(buildingStage.dataset.labels ?? '{}') }));
}

