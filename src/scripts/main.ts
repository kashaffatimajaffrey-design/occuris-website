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

// ---------- System and Command: every part opens a card that shows what it does ----------

type Side = 'left' | 'right' | 'below';

// Parts are found when used, not up front: the Command drawing is rebuilt
// when the screen turns between wide and narrow.
function wireCards(fig: HTMLElement, side: (node: Element, x: number, width: number) => Side) {
  const cards = new Map($$('[data-card]', fig).map((c) => [c.dataset.card!, c]));
  const nodes = () => [...fig.querySelectorAll<SVGGElement>('[data-node]')];
  const links = () => [...fig.querySelectorAll<SVGPathElement>('[data-a]')];
  const wide = matchMedia('(min-width: 960px)');
  let open: string | null = null;
  let pinned = false;
  let closeT = 0;

  // Parts joined to `key` by a line light up with it
  const near = (key: string) => {
    const s = new Set<string>();
    for (const l of links()) {
      if (l.dataset.a === key) s.add(l.dataset.b!);
      if (l.dataset.b === key) s.add(l.dataset.a!);
    }
    return s;
  };

  const place = (card: HTMLElement, node: Element) => {
    if (!wide.matches) return; // phones: the card is a sheet from the bottom
    const f = fig.getBoundingClientRect();
    const r = node.getBoundingClientRect();
    const w = card.offsetWidth || 320;
    const cx = r.left + r.width / 2 - f.left;
    const where = side(node, cx, f.width);
    let left: number;
    let top: number;
    if (where !== 'below') {
      // open beside the part, level with it
      left = where === 'right' ? r.right - f.left + 16 : r.left - f.left - w - 16;
      top = r.top - f.top - 40;
      card.style.setProperty('--ox', where === 'right' ? '0%' : '100%');
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
    const card = cards.get(key);
    if (!card) return;
    const wasHidden = card.hidden;
    card.hidden = false;
    if (wasHidden) {
      // restart the card's little story each time it opens
      card.style.animation = 'none';
      void card.offsetWidth;
      card.style.animation = '';
    }
    const n = near(key);
    fig.classList.add('is-focus');
    for (const g of nodes()) {
      const k = g.dataset.node!;
      g.classList.toggle('is-on', k === key);
      g.classList.toggle('is-near', n.has(k));
      g.setAttribute('aria-expanded', String(k === key));
    }
    for (const l of links()) l.classList.toggle('is-lit', l.dataset.a === key || l.dataset.b === key);
    place(card, node);
  };

  const hide = () => {
    clearTimeout(closeT);
    if (open) cards.get(open)!.hidden = true;
    open = null;
    pinned = false;
    fig.classList.remove('is-focus');
    for (const g of nodes()) {
      g.classList.remove('is-on', 'is-near');
      g.setAttribute('aria-expanded', 'false');
    }
    for (const l of links()) l.classList.remove('is-lit');
  };
  const later = () => {
    clearTimeout(closeT);
    if (!pinned) closeT = window.setTimeout(hide, 180);
  };
  const toggle = (g: SVGGElement) => {
    const key = g.dataset.node!;
    if (open === key && pinned) hide();
    else show(key, g, true);
  };

  const partOf = (t: EventTarget | null) => (t instanceof Element ? t.closest<SVGGElement>('[data-node]') : null);
  fig.addEventListener('pointerover', (e) => {
    const g = partOf(e.target);
    if (g && e.pointerType === 'mouse' && partOf(e.relatedTarget) !== g) show(g.dataset.node!, g);
  });
  fig.addEventListener('pointerout', (e) => {
    const g = partOf(e.target);
    if (g && e.pointerType === 'mouse' && partOf(e.relatedTarget) !== g) later();
  });
  fig.addEventListener('click', (e) => {
    const g = partOf(e.target);
    if (!g) return;
    e.stopPropagation();
    toggle(g);
  });
  fig.addEventListener('keydown', (e) => {
    const g = partOf(e.target);
    if (g && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      toggle(g);
    }
  });
  fig.addEventListener('focusin', (e) => {
    const g = partOf(e.target);
    if (g) show(g.dataset.node!, g);
  });
  fig.addEventListener('focusout', (e) => partOf(e.target) && later());
  for (const card of cards.values()) {
    card.addEventListener('pointerenter', () => clearTimeout(closeT));
    card.addEventListener('pointerleave', (e) => e.pointerType === 'mouse' && later());
    card.addEventListener('click', (e) => e.stopPropagation());
  }
  $$('[data-card-close]', fig).forEach((b) => b.addEventListener('click', hide));
  document.addEventListener('click', () => open && hide());
  document.addEventListener('keydown', (e) => e.key === 'Escape' && open && hide());
  addEventListener('resize', () => open && hide());
}

const sysFig = $('[data-system]');
// System: inputs open to the right, outputs to the left, the products below
if (sysFig) wireCards(sysFig, (n, x, w) => (!n.classList.contains('sys__pill') ? 'below' : x < w / 2 ? 'right' : 'left'));
// Command: sources open to the right, the core below, agents and outputs to the left
const cmdFig = $('.cmd__fig');
if (cmdFig) wireCards(cmdFig, (n) => (n.classList.contains('node--src') ? 'right' : n.classList.contains('node--core') ? 'below' : 'left'));

// ---------- System story: one message travels the whole system ----------

const storyEl = $('.sys__story');
if (sysFig && storyEl && !reduce) {
  interface Journey {
    time: string;
    from: string;
    input: string;
    record: string[];
    agent: number;
    decision: string;
    voice: string;
    to: string;
    done: string;
    lines: string[];
  }
  const journeys: Journey[] = JSON.parse(storyEl.dataset.story ?? '[]');
  const agentNames: string[] = JSON.parse(storyEl.dataset.agents ?? '[]');
  const stage = $('.sys__stage', sysFig)!;
  const tok = $('.tok', stage)!;
  const tokCard = $('.tok__card', tok)!;
  const scan = $('.sys__scan', stage)!;
  const wave = $('.sys__wave', stage)!;
  const agentTag = $('.sys__agent-name', stage)!;
  const badge = $('.sys__badge', stage)!;
  const timeEl = $('.sys__story-time', storyEl)!;
  const textEl = $('.sys__story-text', storyEl)!;

  let visible = false;
  new IntersectionObserver((e) => (visible = e[e.length - 1].isIntersecting), { threshold: 0.3 }).observe(sysFig);
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  // The story holds while it is off-screen, the tab is hidden or a card is open
  const gate = async () => {
    while (!visible || document.hidden || sysFig.classList.contains('is-focus')) await sleep(200);
  };
  const hold = async (ms: number) => {
    await gate();
    await sleep(ms);
  };

  const svg = () => [...sysFig.querySelectorAll<SVGSVGElement>('svg.sys__svg')].find((s) => s.getBoundingClientRect().width > 0)!;
  const nodeOf = (k: string) => svg().querySelector<SVGGElement>(`[data-node="${k}"]`)!;
  const lineOf = (a: string, b: string) => svg().querySelector<SVGPathElement>(`.sys__link[data-a="${a}"][data-b="${b}"]`)!;
  const box = (el: Element) => {
    const f = sysFig.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return { x: r.left - f.left, y: r.top - f.top, w: r.width, h: r.height };
  };
  // Points along a drawn line, in the figure's own pixels
  const along = (p: SVGPathElement, n = 30): [number, number][] => {
    const f = sysFig.getBoundingClientRect();
    const m = p.getScreenCTM()!;
    const len = p.getTotalLength();
    return Array.from({ length: n + 1 }, (_, i) => {
      const q = p.getPointAtLength((len * i) / n);
      return [q.x * m.a + q.y * m.c + m.e - f.left, q.x * m.b + q.y * m.d + m.f - f.top];
    });
  };
  // The truck's centre sits on the point; the card rides above it
  const at = ([x, y]: [number, number]) => `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
  let here: [number, number] = [0, 0];
  const put = (pt: [number, number]) => {
    here = pt;
    tok.style.transform = at(pt);
  };
  const glide = async (pts: [number, number][], ms: number) => {
    await gate();
    tok.classList.add('is-driving');
    const a = tok.animate(pts.map((p) => ({ transform: at(p) })), { duration: ms, easing: 'cubic-bezier(0.65, 0, 0.35, 1)', fill: 'forwards' });
    await a.finished;
    put(pts[pts.length - 1]);
    a.cancel();
    tok.classList.remove('is-driving');
  };
  const travel = async (line: SVGPathElement, ms: number) => {
    const pts = along(line);
    await glide([here, pts[0]], 260);
    line.classList.add('is-run');
    await glide(pts, ms);
    line.classList.remove('is-run');
  };
  // Hover just above a part, so its name stays readable
  const above = async (k: string) => {
    const b = box(nodeOf(k));
    await glide([here, [b.x + b.w / 2, b.y - 10]], 320);
  };
  const esc = (t: string) => t.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);
  const become = async (kind: string, html: string) => {
    const old = tokCard.querySelector('.tok__in');
    if (old) await old.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, easing: 'ease-in' }).finished;
    tok.className = `tok tok--${kind} is-on`;
    tokCard.innerHTML = `<span class="tok__in">${html}</span>`;
    tokCard.querySelector('.tok__in')!.animate([{ transform: 'translateY(3px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 280, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
  };
  const narrate = (time: string, line: string) => {
    textEl.classList.add('is-swap');
    setTimeout(() => {
      timeEl.textContent = time;
      textEl.textContent = line;
      textEl.classList.remove('is-swap');
    }, 220);
  };
  const lit = (k: string, on: boolean) => nodeOf(k)?.classList.toggle('is-hit', on);
  const cover = (el: HTMLElement, k: string) => {
    const b = box(nodeOf(k));
    Object.assign(el.style, { left: `${b.x}px`, top: `${b.y}px`, width: `${b.w}px`, height: `${b.h}px` });
  };
  const under = (el: HTMLElement, k: string, gap = 10) => {
    const b = box(nodeOf(k));
    Object.assign(el.style, { left: `${b.x + b.w / 2}px`, top: `${b.y + b.h + gap}px` });
  };

  const play = async (j: Journey) => {
    // 1. The message arrives where it was written
    await gate();
    narrate(j.time, j.lines[0]);
    lit(j.from, true);
    const inLine = lineOf(j.from, 'occuralog');
    put(along(inLine)[0]);
    await become('msg', esc(j.input));
    await hold(1500);
    lit(j.from, false);
    await travel(inLine, 1200);

    // 2. Occuralog reads it and writes a record
    lit('occuralog', true);
    await above('occuralog');
    cover(scan, 'occuralog');
    scan.classList.add('is-run');
    narrate(j.time, j.lines[1]);
    await sleep(500);
    await become('rec', j.record.map((r) => `<b>${esc(r)}</b>`).join(''));
    await hold(1800);
    scan.classList.remove('is-run');
    lit('occuralog', false);
    await travel(lineOf('occuralog', 'command'), 1000);

    // 3. Command: one agent takes it and reaches a decision
    lit('command', true);
    await above('command');
    const pip = svg().querySelector(`.sys__agent[data-agent="${j.agent}"]`);
    pip?.classList.add('is-lit');
    agentTag.textContent = agentNames[j.agent] ?? '';
    under(agentTag, 'command');
    agentTag.classList.add('is-on');
    narrate(j.time, j.lines[2]);
    await sleep(600);
    await become('dec', esc(j.decision));
    await hold(2000);
    pip?.classList.remove('is-lit');
    agentTag.classList.remove('is-on');
    lit('command', false);
    await travel(lineOf('command', 'echo'), 1000);

    // 4. Echo: one spoken sentence
    lit('echo', true);
    await above('echo');
    const eb = box(nodeOf('echo'));
    Object.assign(wave.style, { left: `${eb.x + eb.w / 2 - 50}px`, top: `${eb.y + eb.h - 34}px`, width: '100px' });
    wave.classList.add('is-run');
    narrate(j.time, j.lines[3]);
    await sleep(700);
    await become('voice', esc(j.voice));
    await hold(1900);
    wave.classList.remove('is-run');
    lit('echo', false);
    await travel(lineOf('echo', j.to), 1000);

    // 5. It lands: approved or flagged, and the day's report grows by one
    lit(j.to, true);
    await become('done', esc(j.done));
    narrate(j.time, j.lines[4]);
    lit('reports', true);
    badge.textContent = '+1';
    under(badge, 'reports', 6);
    badge.classList.add('is-on');
    await hold(2400);
    badge.classList.remove('is-on');
    lit('reports', false);
    lit(j.to, false);
    await tok.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: 'forwards' }).finished;
    tok.getAnimations().forEach((a) => a.cancel());
    tok.className = 'tok';
    tokCard.replaceChildren();
  };

  (async () => {
    for (let i = 0; ; i++) {
      await play(journeys[i % journeys.length]);
      await hold(700);
    }
  })();
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

