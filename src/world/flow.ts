// Screen 4: Occuris Command as a living flow diagram. Sources feed your
// data, six agents reason over it, decisions come out the other side.
// Tiny trucks drive along every edge; when an agent raises an alert its
// trucks turn amber. Every part answers the pointer with a card (main.ts). Built as SVG so the labels stay crisp at any size.

import type { Piece } from '../physics/verlet';

export interface FlowOptions {
  sources: string[];
  agents: string[];
  outputs: string[];
  core: string;
  /** For each agent, the index of the output it feeds */
  feeds: number[];
  /** The card key for each part, in the same order as the labels */
  keys: { sources: string[]; core: string; agents: string[]; outputs: string[] };
}

export interface FlowDiagram extends Piece {
  alert(agent: string | null): void;
}

const NS = 'http://www.w3.org/2000/svg';
const el = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}, parent?: Element) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  parent?.appendChild(e);
  return e;
};

interface Edge {
  path: SVGPathElement;
  len: number;
  rate: number;
  clock: number;
  kind: 'in' | 'core' | 'out';
  agent: number;
}

// A truck the size of a grain of rice, nose along +x, centred on its cargo
function truck(parent: Element, cls: string) {
  const g = el('g', { class: `tk ${cls}` }, parent);
  el('rect', { class: 'tk__cargo', x: -6, y: -3.4, width: 8.4, height: 5.4, rx: 0.9 }, g);
  el('path', { class: 'tk__cab', d: 'M2.4 -1.6 H5.2 L7.4 0.6 V2 H2.4 Z' }, g);
  el('circle', { class: 'tk__wheel', cx: -3.6, cy: 2.3, r: 1.2 }, g);
  el('circle', { class: 'tk__wheel', cx: 4.6, cy: 2.3, r: 1.2 }, g);
  return g;
}

interface Packet {
  edge: Edge;
  d: number;
  dot: SVGGElement;
  amber: boolean;
}

export function init(host: HTMLElement, o: FlowOptions): FlowDiagram {
  const svg = el('svg', { class: 'flow', role: 'presentation' });
  host.appendChild(svg);
  const layers = { edges: el('g', {}, svg), packets: el('g', {}, svg), nodes: el('g', {}, svg) };

  let edges: Edge[] = [];
  let packets: Packet[] = [];
  let agentNodes: SVGGElement[] = [];
  let alerting = -1;
  let vertical = false;

  // A part you can point at: it opens the card under the same key
  function part(g: SVGGElement, key: string, label: string) {
    g.dataset.node = key;
    g.setAttribute('tabindex', '0');
    g.setAttribute('role', 'button');
    g.setAttribute('aria-label', label);
    g.setAttribute('aria-expanded', 'false');
    return g;
  }

  function pill(x: number, y: number, text: string, cls: string, key: string, w?: number) {
    const g = part(el('g', { class: `node ${cls}`, transform: `translate(${x} ${y})` }, layers.nodes), key, text);
    const width = w ?? text.length * (vertical ? 7.4 : 8.2) + (cls.includes('agent') ? 44 : 30);
    const h = vertical ? 30 : 36;
    el('rect', { x: -width / 2, y: -h / 2, width, height: h, rx: h / 2 }, g);
    if (cls.includes('agent')) {
      el('circle', { class: 'light', cx: -width / 2 + 17, cy: 0, r: 4 }, g);
      const t = el('text', { x: 8, y: 1 }, g);
      t.textContent = text;
    } else {
      const t = el('text', { x: 0, y: 1 }, g);
      t.textContent = text;
    }
    return g;
  }

  function curve(a: [number, number], b: [number, number], ends: [string, string], kind: Edge['kind'], agent = -1, rate = 0.6) {
    const mx = vertical ? 0 : (b[0] - a[0]) * 0.5;
    const my = vertical ? (b[1] - a[1]) * 0.5 : 0;
    const d = `M${a[0]},${a[1]} C${a[0] + mx},${a[1] + my} ${b[0] - mx},${b[1] - my} ${b[0]},${b[1]}`;
    const path = el('path', { d, class: `edge edge--${kind}`, 'data-a': ends[0], 'data-b': ends[1] }, layers.edges);
    const e: Edge = { path, len: path.getTotalLength(), rate, clock: Math.random(), kind, agent };
    edges.push(e);
    return e;
  }

  function build() {
    for (const l of Object.values(layers)) l.replaceChildren();
    edges = [];
    packets = [];
    const r = host.getBoundingClientRect();
    vertical = r.width < 700;
    const W = vertical ? 360 : 1200;
    const H = vertical ? 640 : 440;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);

    let src: [number, number][];
    let core: [number, number];
    let ag: [number, number][];
    let out: [number, number][];
    if (!vertical) {
      src = o.sources.map((_, i) => [110, 80 + i * 93]);
      core = [400, 220];
      ag = o.agents.map((_, i) => [730, 45 + i * 70]);
      out = o.outputs.map((_, i) => [1080, 110 + i * 110]);
    } else {
      src = o.sources.map((_, i) => [84 + (i % 2) * 192, 30 + Math.floor(i / 2) * 44]);
      core = [180, 186];
      ag = o.agents.map((_, i) => [(i % 2) * 180 + 90, 300 + Math.floor(i / 2) * 64]);
      out = o.outputs.map((_, i) => [62 + i * 118, 600]);
    }
    const k = o.keys;
    src.forEach((p, i) => curve(p, core, [k.sources[i], k.core], 'in', -1, 0.9));
    ag.forEach((p, i) => curve(core, p, [k.core, k.agents[i]], 'core', i, 0.5));
    ag.forEach((p, i) => curve(p, out[o.feeds[i]], [k.agents[i], k.outputs[o.feeds[i]]], 'out', i, 0.35));

    o.sources.forEach((s, i) => pill(src[i][0], src[i][1], s, 'node--src', k.sources[i], vertical ? 150 : undefined));
    // the core: the brand ring, turning slowly
    const c = part(el('g', { class: 'node node--core', transform: `translate(${core[0]} ${core[1]})` }, layers.nodes), k.core, o.core);
    // an invisible disc so the whole ring answers the pointer
    el('circle', { r: vertical ? 40 : 52, class: 'core__hit' }, c);
    el('circle', { r: vertical ? 34 : 46, class: 'core__halo' }, c);
    el('circle', { r: vertical ? 22 : 30, class: 'core__ring' }, c);
    el('circle', { r: vertical ? 22 : 30, class: 'core__arc' }, c);
    const ct = el('text', { y: vertical ? 50 : 66 }, c);
    ct.textContent = o.core;
    agentNodes = o.agents.map((a, i) => pill(ag[i][0], ag[i][1], a, 'node--agent', k.agents[i], vertical ? 164 : 196));
    o.outputs.forEach((s, i) => pill(out[i][0], out[i][1], s, 'node--out', k.outputs[i], vertical ? 108 : undefined));
    agentNodes.forEach((n, i) => n.classList.toggle('is-alert', i === alerting));
  }

  function step(dt: number) {
    for (const e of edges) {
      e.clock += dt * e.rate;
      if (e.clock >= 1) {
        e.clock = 0;
        const amber = e.kind === 'out' && e.agent === alerting;
        const dot = truck(layers.packets, `tk--${e.kind}${amber ? ' tk--amber' : ''}`);
        packets.push({ edge: e, d: 0, dot, amber });
      }
    }
    for (let i = packets.length - 1; i >= 0; i--) {
      const p = packets[i];
      p.d += dt * (vertical ? 120 : 190);
      if (p.d >= p.edge.len) {
        p.dot.remove();
        packets.splice(i, 1);
        continue;
      }
      // face the way the road goes
      const pt = p.edge.path.getPointAtLength(p.d);
      const ahead = p.edge.path.getPointAtLength(Math.min(p.edge.len, p.d + 2));
      const ang = (Math.atan2(ahead.y - pt.y, ahead.x - pt.x) * 180) / Math.PI;
      p.dot.setAttribute('transform', `translate(${pt.x.toFixed(1)} ${pt.y.toFixed(1)}) rotate(${ang.toFixed(1)})`);
    }
  }

  let raf = 0;
  let last = 0;
  const tick = (now: number) => {
    raf = requestAnimationFrame(tick);
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    step(dt);
  };

  build();
  let w0 = host.getBoundingClientRect().width;
  const ro = new ResizeObserver(() => {
    const w = host.getBoundingClientRect().width;
    if ((w < 700) !== (w0 < 700)) build();
    w0 = w;
  });
  ro.observe(host);

  return {
    alert(agent) {
      alerting = agent ? o.agents.indexOf(agent) : -1;
      agentNodes.forEach((n, i) => n.classList.toggle('is-alert', i === alerting));
      for (const e of edges) e.path.classList.toggle('is-alert', e.agent === alerting && e.kind === 'out');
      // a faster stream while an agent is raising something
      for (const e of edges) if (e.kind === 'out') e.rate = e.agent === alerting ? 1.6 : 0.35;
    },
    pause() {
      cancelAnimationFrame(raf);
      raf = 0;
    },
    resume() {
      if (raf) return;
      last = 0;
      raf = requestAnimationFrame(tick);
    },
    destroy() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      svg.remove();
    },
  };
}
