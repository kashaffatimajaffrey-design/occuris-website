// The living map: an isometric diorama of the supply chain from Dubai to
// Sukkur, drawn in code. Trucks drive, a ship docks, a plane brings the
// spare in. WhatsApp messages pop out of the world, Occuris scans them into
// records, and a blocked road gets rerouted. The story section moves the
// camera from moment to moment; the hero lets you block a road yourself.

import { along, box, type Camera, ground, palette, pathLength, poly, project, Queue, rbox, roof, shade, smooth, unproject, type Palette } from './iso';
import type { Piece } from '../physics/verlet';

type P2 = [number, number];

export interface Message {
  who: string;
  time: string;
  text: string;
  /** Phrases in `text` Occuris picks out */
  marks: string[];
  /** The record it becomes, as short fields */
  chip: string[];
  /** Where the message comes from (a place or a vehicle key) */
  from: string;
  /** Raised as an amber alert once parsed */
  alert?: string;
}

export interface MapOptions {
  overlay: HTMLElement;
  messages: Message[];
  labels: Record<string, string>;
  ambient?: boolean;
  interactive?: boolean;
  onBreak?: (link: number) => void;
  onHeal?: (link: number) => void;
  onParsed?: (index: number) => void;
}

export interface Shot {
  x: number;
  y: number;
  zoom: number;
  /** Where on the canvas (0..1) the focus point should sit */
  ax?: number;
  ay?: number;
  /** Keep a vehicle (or the plane) in frame */
  follow?: string;
}

export interface WorldMap extends Piece {
  shoot(shot: Shot): void;
  say(index: number, opts?: { keep?: boolean }): void;
  block(link: number, opts?: { reroute?: boolean; hold?: boolean }): void;
  clear(): void;
  setAmbient(on: boolean): void;
  launchPlane(): void;
  setStock(cartons: number): void;
  breakLink(link: number): void;
  readonly links: number;
}

// ---------------- the world, in tiles ----------------

const SX = 46;
const SY = 22;
const SLAB = 1.1;

const LAND: P2[] = [
  [14, 0], [46, 0], [46, 22], [17, 22], [16.2, 19.6], [15.1, 18.3], [15.7, 16.3], [14.3, 15.5], [14.7, 13], [13.3, 11], [13.9, 8], [12.7, 5], [13.5, 2.5],
];
const DUBAI: P2[] = [[0, 0], [6.6, 0], [7.9, 2.6], [7.1, 5.6], [5, 7.6], [2, 8.3], [0, 8.1]];
const RIVER: P2[] = smooth([[46, 1.5], [38, 4.4], [31, 9.6], [27.5, 12.2], [24.8, 16.4], [22.6, 19.4], [21.4, 22]], 3);

const PLACES: Record<string, P2> = {
  dubai: [4.4, 3.2],
  port: [15.3, 16.9],
  customs: [17.9, 14.1],
  warehouse: [21.2, 18.7],
  line: [26.9, 13.6],
  customer: [34.8, 6.6],
  lahore: [42.4, 2.6],
  airport: [19.8, 11.6],
};

// Links of the chain, Supplier -> Customer
const ROUTES: P2[][] = [
  smooth([[7.8, 3.8], [9.6, 7.2], [11.4, 11.6], [13.2, 15], [14.6, 16.7]], 3), // 0 Dubai -> Port, by sea
  smooth([[16.1, 16.7], [17, 15.4], [17.7, 14.7]], 2), // 1 Port -> Customs
  smooth([[17.9, 14.8], [19, 16], [20.3, 17.5]], 2), // 2 Customs -> Warehouse
  smooth([[20.5, 17.5], [22.4, 16.9], [24.3, 15.4], [26.1, 14.5]], 2), // 3 Warehouse -> Line (Hyderabad)
  smooth([[26.6, 13.3], [29, 11], [31.6, 8.6], [34.2, 7.3]], 2), // 4 Line -> Customer (Sukkur)
];
const FEEDER: P2[] = smooth([[41.6, 3.7], [39, 4.7], [36.6, 6], [34.9, 6.9]], 2); // Lahore -> Sukkur
const DETOUR: P2[] = smooth([[21.5, 17.2], [22.4, 19], [24.7, 18.5], [25.8, 16.2], [26.1, 14.7]], 2); // around the Hyderabad bypass
const AIR: P2 = [19.8, 11.6];

// ---------------- helpers ----------------

function rng(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

function inside(p: P2, poly: P2[]) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

const near = (p: P2, path: P2[], r: number) => {
  for (let i = 0; i < path.length - 1; i++) {
    const [ax, ay] = path[i];
    const [bx, by] = path[i + 1];
    const dx = bx - ax;
    const dy = by - ay;
    const t = Math.max(0, Math.min(1, ((p[0] - ax) * dx + (p[1] - ay) * dy) / (dx * dx + dy * dy || 1)));
    if (Math.hypot(ax + dx * t - p[0], ay + dy * t - p[1]) < r) return true;
  }
  return false;
};

// ---------------- vehicles ----------------

interface Vehicle {
  kind: 'truck' | 'ship';
  route: number; // -1 = feeder
  u: number;
  speed: number; // tiles per second
  cab: string;
  load: string;
  detour: boolean;
  id: string;
}

export function init(canvas: HTMLCanvasElement, opts: MapOptions): WorldMap {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is unavailable');
  const g = ctx;
  const c: Palette = palette();
  const overlay = opts.overlay;
  const r = rng(2208);

  let W = 0;
  let H = 0;
  let ratio = 1;
  let time = 0;
  let ambient = opts.ambient ?? true;

  // Camera: fitted scale times zoom, eased toward the current shot
  const cam: Camera = { t: 10, ox: 0, oy: 0 };
  let fitT = 10;
  const shot = { x: SX / 2, y: SY / 2, zoom: 1, ax: 0.5, ay: 0.52, follow: '' };
  const view = { x: shot.x, y: shot.y, zoom: shot.zoom, ax: shot.ax, ay: shot.ay };

  // ---------- static scenery, seeded ----------
  const trees: { x: number; y: number; s: number }[] = [];
  while (trees.length < 70) {
    const p: P2 = [14 + r() * 32, r() * 22];
    if (!inside(p, LAND)) continue;
    if (ROUTES.some((rt) => near(p, rt, 0.9)) || near(p, FEEDER, 0.9) || near(p, RIVER, 0.8) || near(p, DETOUR, 0.7)) continue;
    if (Object.values(PLACES).some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 2.4)) continue;
    trees.push({ x: p[0], y: p[1], s: 0.7 + r() * 0.6 });
  }
  const fields: { x: number; y: number; w: number; d: number; tone: number }[] = [];
  while (fields.length < 16) {
    const f = { x: 22 + r() * 22, y: 2 + r() * 18, w: 1.6 + r() * 2.2, d: 1.2 + r() * 1.8, tone: r() };
    const cs: P2[] = [[f.x, f.y], [f.x + f.w, f.y], [f.x + f.w, f.y + f.d], [f.x, f.y + f.d]];
    if (!cs.every((p) => inside(p, LAND))) continue;
    if (cs.some((p) => ROUTES.some((rt) => near(p, rt, 0.5)) || near(p, RIVER, 0.6) || near(p, FEEDER, 0.5))) continue;
    if (Object.values(PLACES).some((q) => Math.hypot(q[0] - f.x - f.w / 2, q[1] - f.y - f.d / 2) < 3)) continue;
    fields.push(f);
  }
  const waves: { x: number; y: number; p: number }[] = [];
  while (waves.length < 60) {
    const p: P2 = [r() * 15, r() * 22];
    if (inside(p, LAND) || inside(p, DUBAI)) continue;
    waves.push({ x: p[0], y: p[1], p: r() * Math.PI * 2 });
  }
  const clouds = [
    { x: 8, y: 13, z: 7, s: 1.2, v: 0.12 },
    { x: 28, y: 4, z: 8, s: 1, v: 0.09 },
    { x: 36, y: 15, z: 7.5, s: 1.4, v: 0.1 },
  ];
  const smoke: { x: number; y: number; z: number; age: number }[] = [];

  // ---------- vehicles ----------
  const cabs = [c.violet, c.brick, c.teal, c.ink];
  const loads = [c.white, c.white, c.steel];
  const vehicles: Vehicle[] = [
    { kind: 'ship', route: 0, u: 0.35, speed: 0.55, cab: c.ink, load: c.white, detour: false, id: 'ship' },
  ];
  ROUTES.slice(1).forEach((_, i) => {
    for (let k = 0; k < 2; k++)
      vehicles.push({ kind: 'truck', route: i + 1, u: k * 0.5 + r() * 0.2, speed: 0.75 + r() * 0.2, cab: cabs[(i + k) % cabs.length], load: loads[(i + k) % 3], detour: false, id: `truck-${i + 1}-${k}` });
  });
  vehicles.push({ kind: 'truck', route: -1, u: 0.2, speed: 0.7, cab: c.brick, load: c.steel, detour: false, id: 'feeder' });
  const plane = { u: -1 };

  // ---------- world state touched by the story ----------
  const flag = { port: 0, warehouse: 0, lahore: 0 };
  const stock = { cartons: 27 };

  // ---------- blocked links ----------
  let hover = -1;
  const blocked = new Map<number, { t0: number; reroute: boolean; hold: boolean }>();
  const pathOf = (v: Vehicle) => (v.route < 0 ? FEEDER : v.detour ? DETOUR : ROUTES[v.route]);
  const BLOCK_AT = 0.5;

  // ---------- layout ----------
  function size() {
    const rect = canvas.getBoundingClientRect();
    ratio = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(1, Math.round(rect.width));
    H = Math.max(1, Math.round(rect.height));
    canvas.width = Math.round(W * ratio);
    canvas.height = Math.round(H * ratio);
    // Fit the whole slab with a margin
    const spanX = (SX + SY) * Math.cos(Math.PI / 6);
    const spanY = (SX + SY) * 0.5 + SLAB;
    fitT = Math.min((W * 0.94) / spanX, (H * 0.9) / spanY);
  }

  function updateCamera(snap = false) {
    if (shot.follow) {
      const [fx, fy] = anchorOf(shot.follow)();
      shot.x = fx;
      shot.y = fy;
    }
    const k = snap ? 1 : 0.06;
    view.x += (shot.x - view.x) * k;
    view.y += (shot.y - view.y) * k;
    view.zoom += (shot.zoom - view.zoom) * k;
    view.ax += (shot.ax - view.ax) * k;
    view.ay += (shot.ay - view.ay) * k;
    cam.t = fitT * view.zoom;
    cam.ox = 0;
    cam.oy = 0;
    const [fx, fy] = project(cam, view.x, view.y, 0);
    cam.ox = W * view.ax - fx;
    cam.oy = H * view.ay - fy;
  }

  // ---------- drawing ----------
  const P = (x: number, y: number, z = 0) => project(cam, x, y, z);
  const shadowCol = 'rgba(43,29,79,0.13)';

  function drawSlab() {
    // Floating shadow under the diorama
    g.save();
    // fades as the camera moves in, so close-ups do not get a grey wedge
    g.globalAlpha = 0.08 / (view.zoom * view.zoom);
    poly(g, [P(1.2, 1.2, -SLAB - 1.4), P(SX + 1.2, 1.2, -SLAB - 1.4), P(SX + 1.2, SY + 1.2, -SLAB - 1.4), P(1.2, SY + 1.2, -SLAB - 1.4)], c.ink);
    g.restore();
    // Sides: earth under land, deep water under sea
    const coastY22 = 17;
    poly(g, [P(0, SY, 0), P(coastY22, SY, 0), P(coastY22, SY, -SLAB), P(0, SY, -SLAB)], c.seaDeep);
    poly(g, [P(coastY22, SY, 0), P(SX, SY, 0), P(SX, SY, -SLAB), P(coastY22, SY, -SLAB)], c.landSide);
    poly(g, [P(SX, 0, 0), P(SX, SY, 0), P(SX, SY, -SLAB), P(SX, 0, -SLAB)], c.landDark);
    // strata line
    g.strokeStyle = shade(c.landDark, 0.9);
    g.lineWidth = 1;
    g.beginPath();
    const [a1, a2] = [P(coastY22, SY, -SLAB * 0.45), P(SX, SY, -SLAB * 0.45)];
    g.moveTo(a1[0], a1[1]);
    g.lineTo(a2[0], a2[1]);
    const a3 = P(SX, 0, -SLAB * 0.45);
    g.lineTo(a3[0], a3[1]);
    g.stroke();
    // Sea and land
    ground(g, cam, [[0, 0], [SX, 0], [SX, SY], [0, SY]], c.sea);
    for (const w of waves) {
      const ph = Math.sin(time * 1.2 + w.p);
      const [x, y] = P(w.x + ph * 0.15, w.y);
      g.strokeStyle = c.seaFoam;
      g.globalAlpha = 0.35 + 0.35 * (ph * 0.5 + 0.5);
      g.lineWidth = 1.2;
      g.beginPath();
      g.moveTo(x - cam.t * 0.35, y);
      g.lineTo(x + cam.t * 0.35, y);
      g.stroke();
    }
    g.globalAlpha = 1;
    // Shallow-water rim, clipped to the slab so it only shows along the coast
    g.save();
    g.beginPath();
    [P(0, 0), P(SX, 0), P(SX, SY), P(0, SY)].forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.closePath();
    g.clip();
    for (const shape of [LAND, DUBAI]) {
      g.save();
      g.globalAlpha = 0.5;
      poly(g, shape.map(([x, y]) => P(x, y)), undefined, c.seaFoam, cam.t * 0.5);
      g.restore();
    }
    g.restore();
    ground(g, cam, LAND, c.land);
    ground(g, cam, DUBAI, c.land);
  }

  function drawGround() {
    for (const f of fields) {
      ground(g, cam, [[f.x, f.y], [f.x + f.w, f.y], [f.x + f.w, f.y + f.d], [f.x, f.y + f.d]], f.tone > 0.5 ? c.field : shade(c.leaf, 1.55));
      g.strokeStyle = shade(c.landDark, 1.1);
      g.globalAlpha = 0.35;
      g.lineWidth = 1;
      g.beginPath();
      for (let k = 0.4; k < f.d; k += 0.4) {
        const [x1, y1] = P(f.x + 0.1, f.y + k);
        const [x2, y2] = P(f.x + f.w - 0.1, f.y + k);
        g.moveTo(x1, y1);
        g.lineTo(x2, y2);
      }
      g.stroke();
      g.globalAlpha = 1;
    }
    // River
    g.strokeStyle = c.sea;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.lineWidth = cam.t * 0.32;
    g.beginPath();
    RIVER.forEach(([x, y], i) => {
      const [sx, sy] = P(x, y);
      if (i) g.lineTo(sx, sy);
      else g.moveTo(sx, sy);
    });
    g.stroke();
    // Roads
    const road = (path: P2[], col: string, w: number, dash?: number[]) => {
      g.strokeStyle = col;
      g.lineWidth = w;
      g.setLineDash(dash ?? []);
      g.beginPath();
      path.forEach(([x, y], i) => {
        const [sx, sy] = P(x, y);
        if (i) g.lineTo(sx, sy);
        else g.moveTo(sx, sy);
      });
      g.stroke();
      g.setLineDash([]);
    };
    for (const pth of [...ROUTES.slice(1), FEEDER]) road(pth, shade(c.road, 0.92), cam.t * 0.62);
    for (const pth of [...ROUTES.slice(1), FEEDER]) road(pth, c.road, cam.t * 0.5);
    for (const pth of [...ROUTES.slice(1), FEEDER]) road(pth, c.white, Math.max(1, cam.t * 0.05), [cam.t * 0.25, cam.t * 0.3]);
    // Sea lane and detour
    road(ROUTES[0], c.white, 1.5, [3, 6]);
    if (blocked.get(3)?.reroute) {
      road(DETOUR, shade(c.road, 0.92), cam.t * 0.62);
      road(DETOUR, c.violetSoft, cam.t * 0.5);
      road(DETOUR, c.violet, Math.max(1.5, cam.t * 0.08), [cam.t * 0.3, cam.t * 0.25]);
    }
    // Hover highlight
    if (hover >= 0 && !blocked.has(hover)) road(ROUTES[hover], c.violet, Math.max(2, cam.t * 0.12), hover === 0 ? [4, 5] : undefined);
    // Blocks
    for (const [l, b] of blocked) {
      const pth = ROUTES[l];
      const m = along(pth, BLOCK_AT);
      const [sx, sy] = P(m.x, m.y);
      const pulse = 1 + 0.15 * Math.sin((time - b.t0) * 6);
      g.strokeStyle = c.amber;
      g.lineWidth = Math.max(2, cam.t * 0.12);
      const s = cam.t * 0.45 * pulse;
      g.beginPath();
      g.moveTo(sx - s, sy - s * 0.6);
      g.lineTo(sx + s, sy + s * 0.6);
      g.moveTo(sx + s, sy - s * 0.6);
      g.lineTo(sx - s, sy + s * 0.6);
      g.stroke();
      g.globalAlpha = 0.25;
      g.beginPath();
      g.ellipse(sx, sy, cam.t * 1.1 * pulse, cam.t * 0.62 * pulse, 0, 0, Math.PI * 2);
      g.fillStyle = c.amber;
      g.fill();
      g.globalAlpha = 1;
    }
    // Port quay and airport runway
    box(g, cam, 14.3, 16.1, 0, 2.3, 2, 0.12, c.steel);
    ground(g, cam, [[18.4, 11], [21.4, 11], [21.4, 12.1], [18.4, 12.1]], shade(c.steel, 1.1));
    g.strokeStyle = c.white;
    g.setLineDash([4, 4]);
    g.lineWidth = 1;
    g.beginPath();
    const [r1, r2] = [P(18.6, 11.55), P(21.2, 11.55)];
    g.moveTo(r1[0], r1[1]);
    g.lineTo(r2[0], r2[1]);
    g.stroke();
    g.setLineDash([]);
  }

  function tree(q: Queue, x: number, y: number, s: number) {
    q.add(x + y, () => {
      ground(g, cam, [[x - 0.1, y + 0.2], [x + 0.55 * s, y + 0.2], [x + 0.55 * s, y + 0.45], [x - 0.1, y + 0.45]], shadowCol);
      const [bx, by] = P(x, y, 0);
      const [tx, ty] = P(x, y, 0.55 * s);
      g.strokeStyle = c.landDark;
      g.lineWidth = Math.max(1, cam.t * 0.08);
      g.beginPath();
      g.moveTo(bx, by);
      g.lineTo(tx, ty);
      g.stroke();
      const rr = cam.t * 0.32 * s;
      g.fillStyle = c.leafDark;
      g.beginPath();
      g.arc(tx + rr * 0.15, ty - rr * 0.35, rr, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = c.leaf;
      g.beginPath();
      g.arc(tx - rr * 0.1, ty - rr * 0.5, rr * 0.82, 0, Math.PI * 2);
      g.fill();
    });
  }

  function buildings(q: Queue) {
    const S = { shadow: shadowCol };
    // Dubai: towers by the water
    const towers: [number, number, number, number][] = [[2.2, 2.2, 3.4, 0.7], [3.4, 1.4, 2.4, 0.8], [1.2, 3.6, 1.8, 0.9], [4.2, 3.4, 1.4, 0.8], [2.6, 5, 1.1, 1.1]];
    for (const [x, y, h, w] of towers)
      q.add(x + y + w, () => {
        box(g, cam, x, y, 0, w, w, h, shade(c.steel, 1.15), S);
        // window bands
        g.strokeStyle = shade(c.steel, 0.8);
        g.lineWidth = 1;
        for (let k = 0.4; k < h; k += 0.45) {
          const [a, b] = [P(x, y + w, k), P(x + w, y + w, k)];
          g.beginPath();
          g.moveTo(a[0], a[1]);
          g.lineTo(b[0], b[1]);
          g.stroke();
        }
      });
    q.add(1.2 + 1.2 + 0.35, () => {
      // the needle
      box(g, cam, 0.9, 1.1, 0, 0.35, 0.35, 4.6, c.white, S);
    });

    // Karachi: port cranes and container stacks
    for (const [x, y] of [[14.5, 16.4], [15.4, 17.5]] as P2[])
      q.add(x + y + 0.5, () => {
        const legs: P2[] = [[x, y], [x + 0.5, y], [x, y + 0.5], [x + 0.5, y + 0.5]];
        g.strokeStyle = c.brick;
        g.lineWidth = Math.max(1, cam.t * 0.09);
        g.beginPath();
        for (const [lx, ly] of legs) {
          const [a, b] = [P(lx, ly, 0.12), P(lx, ly, 2.2)];
          g.moveTo(a[0], a[1]);
          g.lineTo(b[0], b[1]);
        }
        // boom reaching out to sea
        const [b1, b2] = [P(x - 1.6, y + 0.25, 2.2), P(x + 0.9, y + 0.25, 2.2)];
        g.moveTo(b1[0], b1[1]);
        g.lineTo(b2[0], b2[1]);
        g.stroke();
        box(g, cam, x - 0.05, y - 0.05, 2.2, 0.6, 0.6, 0.35, c.brick);
        // hanging cable with a swaying container
        const sway = Math.sin(time * 0.9 + x) * 0.25;
        const [h1, h2] = [P(x - 1 + sway, y + 0.25, 2.2), P(x - 1 + sway, y + 0.25, 1.1)];
        g.strokeStyle = c.ink;
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(h1[0], h1[1]);
        g.lineTo(h2[0], h2[1]);
        g.stroke();
        box(g, cam, x - 1.3 + sway, y + 0.05, 0.75, 0.6, 0.4, 0.35, c.teal);
      });
    const stacks: [number, number, string][] = [[15.9, 16.3, c.violet], [16.3, 16.3, c.teal], [15.9, 16.75, c.brick], [16.3, 16.75, c.violet], [15.9, 16.3, c.steel]];
    q.add(16.3 + 16.8, () => {
      stacks.slice(0, 4).forEach(([x, y, col]) => box(g, cam, x, y, 0.12, 0.38, 0.42, 0.3, col, S));
      box(g, cam, 15.9, 16.3, 0.42, 0.38, 0.42, 0.3, c.brick);
      box(g, cam, 16.3, 16.75, 0.42, 0.38, 0.42, 0.3, c.teal);
      if (flag.port > 0) flagPin(16.3, 16.6, 1.2);
    });
    // Customs house with a flag
    q.add(17.4 + 13.4 + 1, () => {
      box(g, cam, 17.4, 13.4, 0, 1.2, 1, 0.7, c.white, S);
      roof(g, cam, 17.4, 13.4, 0.7, 1.2, 1, 0.4, c.leafDark);
      const [a, b] = [P(18.4, 13.6, 1.1), P(18.4, 13.6, 2)];
      g.strokeStyle = c.ink;
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(a[0], a[1]);
      g.lineTo(b[0], b[1]);
      g.stroke();
      const wave = Math.sin(time * 3) * 0.06;
      poly(g, [P(18.4, 13.6, 2), P(18.4, 14.2 + wave, 1.95), P(18.4, 14.2 - wave, 1.7), P(18.4, 13.6, 1.72)], c.leafDark);
    });
    // City blocks
    const city: [number, number, number, string][] = [[17.2, 18.3, 0.9, c.white], [18.2, 19.2, 1.4, shade(c.brick, 1.3)], [16.9, 19.6, 0.7, c.white], [18.9, 18.1, 0.6, shade(c.violet, 1.75)], [19.4, 20.2, 1.1, c.white], [17.8, 20.6, 0.8, shade(c.teal, 1.6)]];
    for (const [x, y, h, col] of city) q.add(x + y + 0.8, () => box(g, cam, x, y, 0, 0.8, 0.8, h, col, S));
    // Warehouse A: long shed, cartons outside
    q.add(20.6 + 18.6 + 1.6, () => {
      box(g, cam, 20.6, 18.6, 0, 2.6, 1.5, 0.75, c.white, S);
      roof(g, cam, 20.6, 18.6, 0.75, 2.6, 1.5, 0.45, c.brick);
      const [d1, d2, d3, d4] = [P(21.4, 20.1, 0), P(22.2, 20.1, 0), P(22.2, 20.1, 0.55), P(21.4, 20.1, 0.55)];
      poly(g, [d1, d2, d3, d4], shade(c.landDark, 0.8));
      const n = stock.cartons;
      for (let k = 0; k < n; k++) box(g, cam, 23.3 + (k % 3) * 0.32, 19.3 + Math.floor(k / 9) * 0.32, (Math.floor(k / 3) % 3) * 0.26, 0.28, 0.28, 0.26, shade(c.land, 0.82));
      if (flag.warehouse > 0) flagPin(21.9, 19.3, 1.6);
    });
    // Hyderabad: the line, saw-tooth factory and chimney
    q.add(26 + 13.6 + 2, () => {
      box(g, cam, 26, 13.6, 0, 2.2, 1.8, 0.8, c.white, S);
      for (let k = 0; k < 3; k++) {
        const x = 26 + k * 0.73;
        poly(g, [P(x, 13.6, 0.8), P(x + 0.73, 13.6, 0.8), P(x + 0.73, 15.4, 0.8), P(x, 15.4, 0.8)], shade(c.steel, 1.05));
        poly(g, [P(x, 15.4, 0.8), P(x + 0.73, 15.4, 0.8), P(x + 0.73, 15.4, 1.3)], shade(c.violet, 1.4));
        poly(g, [P(x, 13.6, 0.8), P(x, 15.4, 0.8), P(x + 0.73, 15.4, 1.3), P(x + 0.73, 13.6, 1.3)], shade(c.steel, 1.2));
      }
      box(g, cam, 27.9, 13.7, 0, 0.32, 0.32, 2, c.brick);
    });
    // Sukkur: shops
    const shops: [number, number, number, string][] = [[34.2, 7.4, 0.6, c.white], [35.2, 7.1, 0.8, shade(c.brick, 1.35)], [34.9, 8.2, 0.5, c.white], [35.9, 8, 0.7, shade(c.violet, 1.7)]];
    for (const [x, y, h, col] of shops)
      q.add(x + y + 0.8, () => {
        box(g, cam, x, y, 0, 0.8, 0.7, h, col, S);
        // awning
        poly(g, [P(x, y + 0.7, h * 0.65), P(x + 0.8, y + 0.7, h * 0.65), P(x + 0.8, y + 0.95, h * 0.45), P(x, y + 0.95, h * 0.45)], c.teal);
      });
    // Lahore: copper wire works, coils in the yard
    q.add(41.8 + 1.8 + 2, () => {
      box(g, cam, 41.8, 1.4, 0, 2, 1.6, 0.9, c.white, S);
      roof(g, cam, 41.8, 1.4, 0.9, 2, 1.6, 0.4, c.violet);
      for (let k = 0; k < 3; k++) {
        const [cx, cy] = P(42.2 + k * 0.6, 3.6, 0.22);
        g.strokeStyle = c.brick;
        g.lineWidth = Math.max(1.5, cam.t * 0.12);
        g.beginPath();
        g.ellipse(cx, cy, cam.t * 0.24, cam.t * 0.17, 0, 0, Math.PI * 2);
        g.stroke();
      }
      if (flag.lahore > 0) flagPin(42.8, 2.2, 1.9);
    });
  }

  /** An amber flag stuck in the map where Occuris noticed something. */
  function flagPin(x: number, y: number, h: number) {
    const [a, b] = [P(x, y, h), P(x, y, h + 1.1)];
    g.strokeStyle = c.ink;
    g.lineWidth = 1.25;
    g.beginPath();
    g.moveTo(a[0], a[1]);
    g.lineTo(b[0], b[1]);
    g.stroke();
    const flap = Math.sin(time * 5) * cam.t * 0.06;
    g.fillStyle = c.amber;
    g.beginPath();
    g.moveTo(b[0], b[1]);
    g.lineTo(b[0] + cam.t * 0.7, b[1] + cam.t * 0.18 + flap);
    g.lineTo(b[0], b[1] + cam.t * 0.42);
    g.closePath();
    g.fill();
  }

  function truck(q: Queue, v: Vehicle) {
    const p = along(pathOf(v), v.u);
    const fade = Math.min(1, v.u / 0.06, (1 - v.u) / 0.06);
    q.add(p.x + p.y + 0.4, () => {
      g.globalAlpha = Math.max(0, fade);
      const ca = Math.cos(p.ang);
      const sa = Math.sin(p.ang);
      ground(g, cam, [[p.x - 0.6 * ca + 0.15, p.y - 0.6 * sa + 0.25], [p.x + 0.6 * ca + 0.15, p.y + 0.6 * sa + 0.25], [p.x + 0.6 * ca + 0.4, p.y + 0.6 * sa + 0.4], [p.x - 0.6 * ca + 0.4, p.y - 0.6 * sa + 0.4]], shadowCol);
      // trailer behind, cab in front
      rbox(g, cam, p.x - 0.12 * ca, p.y - 0.12 * sa, 0.08, 0.9, 0.42, 0.5, p.ang, v.load);
      rbox(g, cam, p.x + 0.46 * ca, p.y + 0.46 * sa, 0.08, 0.3, 0.42, 0.38, p.ang, v.cab, shade(v.cab, 1.25));
      g.globalAlpha = 1;
    });
  }

  function ship(q: Queue, v: Vehicle) {
    const docked = v.u >= 0.995;
    const p = along(ROUTES[0], Math.min(v.u, 0.995));
    const bob = Math.sin(time * 1.4) * 0.04;
    q.add(p.x + p.y, () => {
      const ca = Math.cos(p.ang);
      const sa = Math.sin(p.ang);
      // wake
      if (!docked) {
        g.strokeStyle = c.white;
        g.globalAlpha = 0.6;
        g.lineWidth = 1.2;
        for (const side of [-1, 1]) {
          const [a, b] = [P(p.x - 1.1 * ca - side * 0.2 * sa, p.y - 1.1 * sa + side * 0.2 * ca), P(p.x - 2.2 * ca - side * 0.55 * sa, p.y - 2.2 * sa + side * 0.55 * ca)];
          g.beginPath();
          g.moveTo(a[0], a[1]);
          g.lineTo(b[0], b[1]);
          g.stroke();
        }
        g.globalAlpha = 1;
      }
      rbox(g, cam, p.x, p.y, bob, 2.4, 0.72, 0.32, p.ang, c.ink, c.white);
      // red stripe
      const cols = [c.violet, c.teal, c.brick, c.steel, c.violet, c.brick];
      for (let k = 0; k < 6; k++) {
        const u = -0.7 + (k % 3) * 0.48;
        const w = k < 3 ? -0.17 : 0.17;
        rbox(g, cam, p.x + u * ca - w * sa, p.y + u * sa + w * ca, bob + 0.32, 0.44, 0.3, 0.26, p.ang, cols[k]);
      }
      rbox(g, cam, p.x + 0.95 * ca, p.y + 0.95 * sa, bob + 0.32, 0.4, 0.5, 0.45, p.ang, c.white);
    });
  }

  function drawPlane() {
    if (plane.u < 0) return;
    const u = plane.u;
    const x = PLACES.dubai[0] + (AIR[0] - PLACES.dubai[0]) * u;
    const y = PLACES.dubai[1] + (AIR[1] - PLACES.dubai[1]) * u;
    const z = Math.sin(u * Math.PI) * 6 + 0.2;
    const ang = Math.atan2(AIR[1] - PLACES.dubai[1], AIR[0] - PLACES.dubai[0]);
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);
    const shapeAt = (zz: number): [number, number][] => {
      const L = (a: number, b: number): [number, number] => P(x + a * ca - b * sa, y + a * sa + b * ca, zz);
      return [L(0.9, 0), L(0.2, 0.12), L(0.05, 0.85), L(-0.15, 0.85), L(-0.25, 0.12), L(-0.7, 0.1), L(-0.85, 0.38), L(-0.95, 0.38), L(-0.9, 0), L(-0.95, -0.38), L(-0.85, -0.38), L(-0.7, -0.1), L(-0.25, -0.12), L(-0.15, -0.85), L(0.05, -0.85), L(0.2, -0.12)];
    };
    g.globalAlpha = 0.18;
    poly(g, shapeAt(0), c.ink);
    g.globalAlpha = 1;
    poly(g, shapeAt(z), c.white, shade(c.steel, 0.85), 1);
  }

  function drawSky() {
    for (const cl of clouds) {
      const [sx, sy] = P(cl.x, cl.y, cl.z);
      const [gx, gy] = P(cl.x + 0.6, cl.y + 0.6, 0);
      const s = cam.t * cl.s;
      g.fillStyle = c.ink;
      g.globalAlpha = 0.06;
      g.beginPath();
      g.ellipse(gx, gy, s * 1.5, s * 0.6, 0, 0, Math.PI * 2);
      g.fill();
      g.globalAlpha = 0.92;
      g.fillStyle = c.white;
      for (const [dx, dy, rr] of [[-0.8, 0.1, 0.55], [0, -0.2, 0.75], [0.8, 0.1, 0.5], [0.3, 0.25, 0.5]] as const) {
        g.beginPath();
        g.arc(sx + dx * s, sy + dy * s, rr * s, 0, Math.PI * 2);
        g.fill();
      }
      g.globalAlpha = 1;
    }
    for (const p of smoke) {
      const [sx, sy] = P(p.x, p.y, p.z);
      g.globalAlpha = Math.max(0, 0.55 - p.age * 0.18);
      g.fillStyle = c.white;
      g.beginPath();
      g.arc(sx, sy, cam.t * (0.18 + p.age * 0.14), 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
  }

  function labels() {
    g.font = `500 ${Math.round(Math.max(11, Math.min(14, cam.t * 0.75)))}px Geist, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const spots: [string, P2, number][] = [
      ['dubai', PLACES.dubai, 5.2],
      ['port', [15.6, 17.2], 2.8],
      ['customs', PLACES.customs, 2.4],
      ['warehouse', PLACES.warehouse, 1.9],
      ['line', PLACES.line, 2.6],
      ['customer', PLACES.customer, 1.6],
      ['lahore', PLACES.lahore, 2.2],
    ];
    for (const [key, [x, y], z] of spots) {
      const text = opts.labels[key];
      if (!text) continue;
      const [sx, sy] = P(x, y, z);
      const w = g.measureText(text).width + 14;
      const h = Math.round(Math.max(11, Math.min(14, cam.t * 0.75))) + 9;
      g.fillStyle = c.paper;
      g.strokeStyle = shade(c.ink, 1.0);
      g.lineWidth = 1;
      g.beginPath();
      g.roundRect(sx - w / 2, sy - h / 2, w, h, h / 2);
      g.fill();
      g.globalAlpha = 0.25;
      g.stroke();
      g.globalAlpha = 1;
      // tick down to the place
      g.beginPath();
      g.moveTo(sx, sy + h / 2);
      g.lineTo(sx, sy + h / 2 + 5);
      g.strokeStyle = c.ink;
      g.globalAlpha = 0.4;
      g.stroke();
      g.globalAlpha = 1;
      g.fillStyle = c.ink;
      g.fillText(text, sx, sy + 0.5);
    }
  }


  function render() {
    g.setTransform(ratio, 0, 0, ratio, 0, 0);
    g.clearRect(0, 0, W, H);
    drawSlab();
    drawGround();
    const q = new Queue();
    for (const t of trees) tree(q, t.x, t.y, t.s);
    buildings(q);
    for (const v of vehicles) v.kind === 'ship' ? ship(q, v) : truck(q, v);
    q.flush();
    drawPlane();
    drawSky();
    labels();
    placeOverlay();
  }

  // ---------- simulation ----------
  function step(dt: number) {
    time += dt;
    for (const v of vehicles) {
      const path = pathOf(v);
      const len = pathLength(path);
      let next = v.u + (v.speed * dt) / len;
      const b = blocked.get(v.route);
      if (b && !b.reroute && v.u < BLOCK_AT) {
        // Queue up before the block, one truck length apart
        const ahead = vehicles.filter((o) => o !== v && o.route === v.route && o.u > v.u && o.u < BLOCK_AT).length;
        const stopAt = BLOCK_AT - (0.05 + ahead * (1.3 / len));
        next = Math.min(next, Math.max(v.u, stopAt));
      }
      if (v.kind === 'ship') {
        // the ship sails, docks for a while, then a new one appears at Dubai
        v.u = Math.min(1.25, next);
        if (v.u >= 1.25) v.u = 0;
        if (b && v.u < 0.5) v.u = Math.min(v.u, 0.5 - 0.05);
        continue;
      }
      v.u = next;
      if (v.u >= 1) {
        v.u = 0;
        v.detour = v.route === 3 && !!blocked.get(3)?.reroute;
      }
    }
    if (plane.u >= 0) {
      plane.u += dt / 9;
      if (plane.u > 1) plane.u = -1;
    }
    for (const cl of clouds) {
      cl.x += cl.v * dt;
      if (cl.x > SX + 4) cl.x = -6;
    }
    if (Math.random() < dt * 2.2) smoke.push({ x: 28.05, y: 13.85, z: 2.05, age: 0 });
    for (let i = smoke.length - 1; i >= 0; i--) {
      const p = smoke[i];
      p.age += dt;
      p.z += dt * 0.7;
      p.x += dt * 0.25;
      if (p.age > 3) smoke.splice(i, 1);
    }
    for (const [l, b] of blocked) {
      if (b.hold) continue;
      if (time - b.t0 > 6) {
        blocked.delete(l);
        opts.onHeal?.(l);
      }
    }
    if (ambient && time - lastAmbient > 4.2 && bubbles.length < 2) {
      lastAmbient = time;
      say(ambientIndex++ % opts.messages.length);
    }
    updateCamera();
  }

  // ---------- speech bubbles: message -> scan -> record ----------
  interface Bubble {
    el: HTMLElement;
    anchor: () => [number, number, number];
    born: number;
    keep: boolean;
    index: number;
    stage: number;
  }
  const bubbles: Bubble[] = [];
  let lastAmbient = -2;
  let ambientIndex = 0;

  const anchorOf = (from: string): (() => [number, number, number]) => {
    const v = vehicles.find((o) => o.id === from);
    if (v) return () => {
      const p = along(pathOf(v), v.kind === 'ship' ? Math.min(v.u, 0.995) : v.u);
      return [p.x, p.y, v.kind === 'ship' ? 1 : 0.9];
    };
    if (from === 'plane') return () => {
      const u = Math.max(0, plane.u);
      return [PLACES.dubai[0] + (AIR[0] - PLACES.dubai[0]) * u, PLACES.dubai[1] + (AIR[1] - PLACES.dubai[1]) * u, Math.sin(u * Math.PI) * 6 + 0.8];
    };
    const p = PLACES[from] ?? PLACES.port;
    return () => [p[0], p[1], 2.2];
  };

  function esc(s: string) {
    return s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);
  }

  function say(index: number, o: { keep?: boolean } = {}) {
    const m = opts.messages[index];
    if (!m) return;
    let html = esc(m.text);
    for (const mk of m.marks) html = html.replace(esc(mk), `<mark>${esc(mk)}</mark>`);
    const el = document.createElement('div');
    el.className = o.keep ? 'bub is-keep' : 'bub';
    el.innerHTML = `<div class="bub__msg"><p class="bub__who"><span class="bub__av">${esc(m.who.slice(0, 1))}</span>${esc(m.who)}<span class="bub__time">${esc(m.time)}</span></p><p class="bub__text" lang="ur">${html}</p><span class="bub__scan" aria-hidden="true"></span></div><div class="bub__rec">${m.chip.map((f) => `<span>${esc(f)}</span>`).join('')}</div>`;
    overlay.appendChild(el);
    const b: Bubble = { el, anchor: anchorOf(m.from), born: performance.now(), keep: !!o.keep, index, stage: 0 };
    bubbles.push(b);
    requestAnimationFrame(() => el.classList.add('is-in'));
    const t1 = setTimeout(() => el.classList.add('is-scan'), o.keep ? 1500 : 1300);
    const t2 = setTimeout(() => {
      el.classList.add('is-rec');
      opts.onParsed?.(index);
      if (m.from === 'port' || m.from === 'ship') flag.port = 1;
      if (m.from === 'warehouse') flag.warehouse = 1;
      if (m.from === 'lahore') flag.lahore = 1;
    }, o.keep ? 2900 : 2500);
    const t3 = b.keep ? 0 : setTimeout(() => drop(b), 6200);
    (el as any)._t = [t1, t2, t3];
  }

  function drop(b: Bubble) {
    b.el.classList.add('is-out');
    ((b.el as any)._t as number[]).forEach(clearTimeout);
    const i = bubbles.indexOf(b);
    if (i >= 0) bubbles.splice(i, 1);
    setTimeout(() => b.el.remove(), 500);
  }

  function placeOverlay() {
    for (const b of bubbles) {
      const [x, y, z] = b.anchor();
      const [sx, sy] = P(x, y, z);
      b.el.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px)`;
    }
  }

  function clear() {
    [...bubbles].forEach(drop);
    flag.port = flag.warehouse = flag.lahore = 0;
  }

  // ---------- interaction: block a road ----------
  function routeAt(e: PointerEvent) {
    const rect = canvas.getBoundingClientRect();
    const [x, y] = unproject(cam, e.clientX - rect.left, e.clientY - rect.top);
    let best = -1;
    let bd = 1.1;
    ROUTES.forEach((rt, i) => {
      for (let k = 0; k <= 30; k++) {
        const p = along(rt, k / 30);
        const d = Math.hypot(p.x - x, p.y - y);
        if (d < bd) {
          bd = d;
          best = i;
        }
      }
    });
    return best;
  }
  function block(link: number, o: { reroute?: boolean; hold?: boolean } = {}) {
    if (blocked.has(link)) return;
    blocked.set(link, { t0: time, reroute: !!o.reroute, hold: !!o.hold });
    opts.onBreak?.(link);
  }
  function breakLink(link: number) {
    // In the hero the Hyderabad road gets rerouted, the rest wait it out
    block(link, { reroute: link === 3 });
  }
  const onMove = (e: PointerEvent) => {
    if (!opts.interactive) return;
    hover = routeAt(e);
    canvas.style.cursor = hover >= 0 && !blocked.has(hover) ? 'pointer' : 'default';
  };
  const onLeave = () => (hover = -1);
  const onClick = (e: PointerEvent) => {
    if (!opts.interactive) return;
    const l = routeAt(e);
    if (l >= 0) breakLink(l);
  };
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerleave', onLeave);
  canvas.addEventListener('click', onClick as EventListener);

  // ---------- loop ----------
  let raf = 0;
  let last = 0;
  const tick = (now: number) => {
    raf = requestAnimationFrame(tick);
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    step(dt);
    render();
  };

  const ro = new ResizeObserver(() => {
    size();
    updateCamera(true);
    render();
  });
  size();
  updateCamera(true);
  ro.observe(canvas);
  render();

  return {
    links: ROUTES.length,
    shoot(s) {
      Object.assign(shot, { ax: 0.5, ay: 0.52, follow: '' }, s);
    },
    say,
    block,
    breakLink,
    clear() {
      clear();
      for (const l of [...blocked.keys()]) {
        blocked.delete(l);
        opts.onHeal?.(l);
      }
      for (const v of vehicles) v.detour = false;
    },
    setAmbient(on) {
      ambient = on;
      lastAmbient = time;
    },
    launchPlane() {
      plane.u = 0;
    },
    setStock(n) {
      stock.cartons = n;
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
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('click', onClick as EventListener);
      clear();
    },
  };
}

export const PLACE_KEYS = Object.keys(PLACES);
