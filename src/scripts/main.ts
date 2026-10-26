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

/**
 * Reveals text already in an element as if typed: the untyped part stays in
 * place but invisible, so the layout never jumps and the text exists once.
 */
function typeIn(el: HTMLElement, cps = 55) {
  const text = el.dataset.decision ?? el.textContent ?? '';
  let timer = 0;
  const paint = (n: number) => {
    const shown = document.createElement('span');
    shown.textContent = text.slice(0, n);
    const ghost = document.createElement('span');
    ghost.className = 'ghost';
    ghost.textContent = text.slice(n);
    el.replaceChildren(shown, ghost);
  };
  return {
    hide: () => paint(0),
    type() {
      clearInterval(timer);
      let n = 0;
      timer = window.setInterval(() => {
        paint(++n);
        if (n >= text.length) {
          clearInterval(timer);
          el.textContent = text;
        }
      }, 1000 / cps);
    },
  };
}

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
    // Only links into this page scroll in place; links to another page navigate
    if (a.pathname !== location.pathname) return;
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
$$('[data-reveal], [data-enter]').forEach((el) => reveal.observe(el));

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
  // hero, the late truck, the port, the stock sheet, the whole day
  const SHOTS: Shot[] = [
    { x: 23, y: 11, zoom: 1 * (phone ? 1.6 : 1) },
    { x: 0, y: 0, zoom: 2.4 * z, follow: 'truck-3-0' },
    { x: 15.6, y: 16.2, zoom: 2.6 * z },
    { x: 21.9, y: 19, zoom: 2.8 * z },
    { x: 23, y: 11, zoom: 1 * (phone ? 1.6 : 1) },
  ];
  // On phones the beat card covers the top of the map, so aim lower
  if (phone) SHOTS.forEach((s, i) => i > 0 && (s.ay = 0.66));

  // Each decision is in the page once; it starts hidden and types in when its message is parsed
  const typers = new Map<HTMLElement, ReturnType<typeof typeIn>>();
  for (const slot of $$('[data-decision]')) {
    const t = typeIn(slot);
    t.hide();
    typers.set(slot, t);
  }

  function enter(i: number) {
    if (!map || i === current) return;
    current = i;
    beats.forEach((b, k) => b.classList.toggle('is-active', k === i));
    const beat = beats[i];
    map.clear();
    map.setStock(27);
    map.shoot(SHOTS[i] ?? SHOTS[0]);
    const final = beat.dataset.final;
    map.setAmbient(i === 0 || !!final);
    if (clockEl) clockEl.textContent = beat.querySelector('.beat__time')?.textContent ?? clockEl.dataset.start ?? '';

    // Counters show where in the day we are
    const msgBeats = beats.slice(0, i + 1).filter((b) => b.dataset.msg !== undefined);
    bump(counts.messages, msgBeats.length);
    bump(counts.records, Math.max(0, msgBeats.length - (beat.dataset.msg !== undefined ? 1 : 0)));
    bump(counts.decisions, beats.slice(0, i).filter((b) => b.querySelector('[data-decision]') && !b.querySelector('.beat__decision--ok')).length);

    // The last beat shows the whole day's totals, not just the three we watched
    if (final) {
      const t = JSON.parse(final);
      bump(counts.messages, t.messages);
      bump(counts.records, t.records);
      bump(counts.decisions, t.decisions);
      return;
    }
    const msg = beat.dataset.msg;
    if (msg === undefined) return;
    if (i === 3) map.setStock(3);
    map.say(Number(msg), { keep: true });
  }

  lifecycle(mapStage, () => {
    map = initMap(canvas, {
      overlay,
      messages,
      labels: places,
      ambient: true,
      interactive: true,
      hint: 4,
      onParsed(index) {
        const beat = beats[current];
        if (!beat || Number(beat.dataset.msg) !== index) return;
        bump(counts.records, beats.slice(0, current + 1).filter((b) => b.dataset.msg !== undefined).length);
        const slot = beat.querySelector<HTMLElement>('[data-decision]');
        if (!slot) return;
        beat.classList.add('is-decided');
        if (!beat.querySelector('.beat__decision--ok')) bump(counts.decisions, Number(counts.decisions?.textContent ?? 0) + 1);
        typers.get(slot)?.type();
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
    // The diorama settles in once it has drawn its first frame
    requestAnimationFrame(() => mapStage.classList.add('is-ready'));
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
      // Start half in their rows, so a still frame already reads as a table forming
      base: 0.72,
      formMs: 900,
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
      go();
      trigger.disconnect();
    },
    { threshold: 0.25 },
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

// ---------- System: every part opens a card that shows what it does ----------

const sysFig = $('[data-system]');
if (sysFig) {
  const cards = new Map($$('[data-card]', sysFig).map((c) => [c.dataset.card!, c]));
  const nodes = [...sysFig.querySelectorAll<SVGGElement>('.sys__node')];
  const links = [...sysFig.querySelectorAll<SVGPathElement>('.sys__link')];
  const wide = matchMedia('(min-width: 960px)');
  let open: string | null = null;
  let pinned = false;
  let closeT = 0;

  // Parts joined to `key` by a line light up with it
  const near = (key: string) => {
    const s = new Set<string>();
    for (const l of links) {
      if (l.dataset.a === key) s.add(l.dataset.b!);
      if (l.dataset.b === key) s.add(l.dataset.a!);
    }
    return s;
  };

  const place = (card: HTMLElement, node: Element) => {
    if (!wide.matches) return; // phones: the card is a sheet from the bottom
    const f = sysFig.getBoundingClientRect();
    const r = node.getBoundingClientRect();
    const w = card.offsetWidth || 320;
    const cx = r.left + r.width / 2 - f.left;
    let left: number;
    let top: number;
    if (node.classList.contains('sys__pill')) {
      // inputs open to the right, outputs to the left, level with the pill
      left = cx < f.width / 2 ? r.right - f.left + 16 : r.left - f.left - w - 16;
      top = r.top - f.top - 40;
      card.style.setProperty('--ox', cx < f.width / 2 ? '0%' : '100%');
      card.style.setProperty('--oy', '20%');
    } else {
      left = cx - w / 2;
      top = r.bottom - f.top + 14;
      card.style.setProperty('--ox', '50%');
      card.style.setProperty('--oy', '0%');
    }
    card.style.left = `${Math.max(-8, Math.min(left, f.width - w + 8))}px`;
    card.style.top = `${Math.max(-60, top)}px`;
  };

  const show = (key: string, node: Element, pin = false) => {
    clearTimeout(closeT);
    if (open && open !== key) cards.get(open)!.hidden = true;
    open = key;
    pinned = pin || pinned;
    const card = cards.get(key)!;
    const wasHidden = card.hidden;
    card.hidden = false;
    if (wasHidden) {
      // restart the card's little story each time it opens
      card.style.animation = 'none';
      void card.offsetWidth;
      card.style.animation = '';
    }
    const n = near(key);
    sysFig.classList.add('is-focus');
    for (const g of nodes) {
      const k = g.dataset.node!;
      g.classList.toggle('is-on', k === key);
      g.classList.toggle('is-near', n.has(k));
      g.setAttribute('aria-expanded', String(k === key));
    }
    for (const l of links) l.classList.toggle('is-lit', l.dataset.a === key || l.dataset.b === key);
    place(card, node);
  };

  const hide = () => {
    clearTimeout(closeT);
    if (open) cards.get(open)!.hidden = true;
    open = null;
    pinned = false;
    sysFig.classList.remove('is-focus');
    for (const g of nodes) {
      g.classList.remove('is-on', 'is-near');
      g.setAttribute('aria-expanded', 'false');
    }
    for (const l of links) l.classList.remove('is-lit');
  };
  const later = () => {
    clearTimeout(closeT);
    if (!pinned) closeT = window.setTimeout(hide, 180);
  };

  for (const g of nodes) {
    const key = g.dataset.node!;
    g.addEventListener('pointerenter', (e) => e.pointerType === 'mouse' && show(key, g));
    g.addEventListener('pointerleave', (e) => e.pointerType === 'mouse' && later());
    g.addEventListener('click', (e) => {
      e.stopPropagation();
      if (open === key && pinned) hide();
      else show(key, g, true);
    });
    g.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (open === key && pinned) hide();
        else show(key, g, true);
      }
    });
    g.addEventListener('focus', () => show(key, g));
    g.addEventListener('blur', later);
  }
  for (const card of cards.values()) {
    card.addEventListener('pointerenter', () => clearTimeout(closeT));
    card.addEventListener('pointerleave', (e) => e.pointerType === 'mouse' && later());
    card.addEventListener('click', (e) => e.stopPropagation());
  }
  $$('[data-card-close]', sysFig).forEach((b) => b.addEventListener('click', hide));
  document.addEventListener('click', () => open && hide());
  document.addEventListener('keydown', (e) => e.key === 'Escape' && open && hide());
  addEventListener('resize', () => open && hide());
}

// ---------- Echo: listen, the sentence lands, then what Echo did ----------

const echoCard = $('[data-echo]');
if (echoCard && !reduce) {
  echoCard.setAttribute('data-armed', '');
  const said = $('.echo__said', echoCard)!;
  const steps = $$('.echo__step', echoCard);
  const play = new IntersectionObserver(
    (entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      play.disconnect();
      echoCard.classList.add('is-listening');
      setTimeout(() => {
        echoCard.classList.remove('is-listening');
        said.classList.add('is-shown');
        const state = $('.echo__state', echoCard);
        if (state?.dataset.heard) state.textContent = state.dataset.heard;
      }, 1600);
      steps.forEach((s, i) => setTimeout(() => s.classList.add('is-shown'), 2300 + i * 750));
      setTimeout(() => echoCard.classList.add('is-done'), 2300 + steps.length * 750);
    },
    { threshold: 0.4 },
  );
  play.observe(echoCard);
} else echoCard?.classList.add('is-done');

// ---------- screen 5: the building ----------

const buildingStage = $('[data-piece="building"]');
if (buildingStage && !reduce) {
  const canvas = $<HTMLCanvasElement>('canvas', buildingStage)!;
  lifecycle(buildingStage, () => initBuilding(canvas, { labels: JSON.parse(buildingStage.dataset.labels ?? '{}') }));
}

