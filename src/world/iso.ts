// A small isometric drawing kit on 2D canvas: projection, shaded boxes,
// rotated boxes for vehicles, flat ground shapes and painter's sorting.
// World units are tiles: x runs down-right on screen, y down-left, z up.

export interface Camera {
  /** Pixels per tile */
  t: number;
  /** Screen position of world origin */
  ox: number;
  oy: number;
}

const C30 = Math.cos(Math.PI / 6);
const S30 = 0.5;

export const project = (cam: Camera, x: number, y: number, z = 0): [number, number] => [
  cam.ox + (x - y) * C30 * cam.t,
  cam.oy + (x + y) * S30 * cam.t - z * cam.t,
];

/** Inverse projection onto the ground plane (z = 0). */
export const unproject = (cam: Camera, sx: number, sy: number): [number, number] => {
  const a = (sx - cam.ox) / (C30 * cam.t);
  const b = (sy - cam.oy) / (S30 * cam.t);
  return [(a + b) / 2, (b - a) / 2];
};

export function palette() {
  const s = getComputedStyle(document.documentElement);
  const g = (n: string) => s.getPropertyValue(`--${n}`).trim();
  const names = [
    'paper', 'ink', 'violet', 'amber', 'night', 'mist', 'sea', 'sea-deep', 'sea-foam', 'land', 'land-side',
    'land-dark', 'road', 'field', 'leaf', 'leaf-dark', 'brick', 'steel', 'teal', 'white', 'violet-soft', 'amber-soft',
  ] as const;
  return Object.fromEntries(names.map((n) => [n.replace(/-(\w)/g, (_, c) => c.toUpperCase()), g(n)])) as Record<
    'paper' | 'ink' | 'violet' | 'amber' | 'night' | 'mist' | 'sea' | 'seaDeep' | 'seaFoam' | 'land' | 'landSide' | 'landDark' | 'road' | 'field' | 'leaf' | 'leafDark' | 'brick' | 'steel' | 'teal' | 'white' | 'violetSoft' | 'amberSoft',
    string
  >;
}
export type Palette = ReturnType<typeof palette>;

/** Darken (f < 1) or lighten (f > 1) a #rrggbb colour. */
const cache = new Map<string, string>();
export function shade(hex: string, f: number): string {
  const key = hex + f;
  const hit = cache.get(key);
  if (hit) return hit;
  // Accepts #rrggbb or rgb(r,g,b), so shaded colours can be shaded again
  let rgb: number[];
  if (hex.startsWith('#')) {
    const n = parseInt(hex.slice(1), 16);
    rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  } else rgb = (hex.match(/[\d.]+/g) ?? ['0', '0', '0']).slice(0, 3).map(Number);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(f <= 1 ? v * f : v + (255 - v) * (f - 1))));
  const out = `rgb(${ch(rgb[0])},${ch(rgb[1])},${ch(rgb[2])})`;
  cache.set(key, out);
  return out;
}

export function poly(g: CanvasRenderingContext2D, pts: [number, number][], fill?: string, stroke?: string, lw = 1) {
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  g.closePath();
  if (fill) {
    g.fillStyle = fill;
    g.fill();
  }
  if (stroke) {
    g.strokeStyle = stroke;
    g.lineWidth = lw;
    g.stroke();
  }
}

/** A flat shape on the ground (or at height z). */
export function ground(g: CanvasRenderingContext2D, cam: Camera, pts: [number, number][], fill: string, z = 0, stroke?: string) {
  poly(g, pts.map(([x, y]) => project(cam, x, y, z)), fill, stroke);
}

/** Axis-aligned box. Faces lit from the top-left: top, left (+y face), right (+x face). */
export function box(
  g: CanvasRenderingContext2D,
  cam: Camera,
  x: number,
  y: number,
  z: number,
  w: number,
  d: number,
  h: number,
  color: string,
  opts: { top?: string; edge?: string; shadow?: string } = {},
) {
  const P = (a: number, b: number, c: number) => project(cam, a, b, c);
  if (opts.shadow) {
    const k = h * 0.55;
    ground(g, cam, [
      [x, y + d],
      [x + w, y + d],
      [x + w + k, y + d + k * 0.35],
      [x + w + k, y + k * 0.35],
      [x + w, y],
    ], opts.shadow, 0);
  }
  poly(g, [P(x, y + d, z), P(x + w, y + d, z), P(x + w, y + d, z + h), P(x, y + d, z + h)], shade(color, 0.86), opts.edge, 0.75);
  poly(g, [P(x + w, y, z), P(x + w, y + d, z), P(x + w, y + d, z + h), P(x + w, y, z + h)], shade(color, 0.72), opts.edge, 0.75);
  poly(g, [P(x, y, z + h), P(x + w, y, z + h), P(x + w, y + d, z + h), P(x, y + d, z + h)], opts.top ?? color, opts.edge, 0.75);
}

/** A gabled roof on top of a box footprint, ridge running along x. */
export function roof(g: CanvasRenderingContext2D, cam: Camera, x: number, y: number, z: number, w: number, d: number, rise: number, color: string) {
  const P = (a: number, b: number, c: number) => project(cam, a, b, c);
  const m = y + d / 2;
  poly(g, [P(x + w, y, z), P(x + w, y + d, z), P(x + w, m, z + rise)], shade(color, 0.7));
  poly(g, [P(x, y + d, z), P(x + w, y + d, z), P(x + w, m, z + rise), P(x, m, z + rise)], shade(color, 0.88));
  poly(g, [P(x, y, z), P(x + w, y, z), P(x + w, m, z + rise), P(x, m, z + rise)], color);
}

/**
 * A box rotated about z by `ang` (radians, in tile space), centred on (cx, cy).
 * Only the faces turned toward the viewer are drawn.
 */
export function rbox(
  g: CanvasRenderingContext2D,
  cam: Camera,
  cx: number,
  cy: number,
  z: number,
  len: number,
  wid: number,
  h: number,
  ang: number,
  color: string,
  top?: string,
) {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  const corner = (u: number, v: number): [number, number] => [cx + u * c - v * s, cy + u * s + v * c];
  const k = [corner(-len / 2, -wid / 2), corner(len / 2, -wid / 2), corner(len / 2, wid / 2), corner(-len / 2, wid / 2)];
  const faces: { n: number; pts: [number, number][]; f: number }[] = [];
  for (let i = 0; i < 4; i++) {
    const a = k[i];
    const b = k[(i + 1) % 4];
    // outward normal of edge a->b (corners run clockwise in tile space)
    const nx = b[1] - a[1];
    const ny = -(b[0] - a[0]);
    const facing = nx + ny; // the viewer looks along (-1, -1)
    if (facing <= 0) continue;
    const lit = ny > nx ? 0.86 : 0.72;
    faces.push({ n: facing, pts: [project(cam, a[0], a[1], z), project(cam, b[0], b[1], z), project(cam, b[0], b[1], z + h), project(cam, a[0], a[1], z + h)], f: lit });
  }
  for (const f of faces) poly(g, f.pts, shade(color, f.f));
  poly(g, k.map(([x, y]) => project(cam, x, y, z + h)), top ?? color);
}

/** Painter's queue: everything that stands up is drawn back to front. */
export class Queue {
  private items: { d: number; fn: () => void }[] = [];
  add(depth: number, fn: () => void) {
    this.items.push({ d: depth, fn });
  }
  flush() {
    this.items.sort((a, b) => a.d - b.d);
    for (const it of this.items) it.fn();
    this.items.length = 0;
  }
}

/** Point and heading at distance fraction u along a polyline. */
export function along(path: [number, number][], u: number): { x: number; y: number; ang: number } {
  let total = 0;
  const seg: number[] = [];
  for (let i = 0; i < path.length - 1; i++) {
    const l = Math.hypot(path[i + 1][0] - path[i][0], path[i + 1][1] - path[i][1]);
    seg.push(l);
    total += l;
  }
  let left = Math.max(0, Math.min(1, u)) * total;
  for (let i = 0; i < seg.length; i++) {
    if (left <= seg[i] || i === seg.length - 1) {
      const a = path[i];
      const b = path[i + 1];
      const f = seg[i] ? Math.min(1, left / seg[i]) : 0;
      return { x: a[0] + (b[0] - a[0]) * f, y: a[1] + (b[1] - a[1]) * f, ang: Math.atan2(b[1] - a[1], b[0] - a[0]) };
    }
    left -= seg[i];
  }
  return { x: path[0][0], y: path[0][1], ang: 0 };
}

export const pathLength = (path: [number, number][]) => {
  let t = 0;
  for (let i = 0; i < path.length - 1; i++) t += Math.hypot(path[i + 1][0] - path[i][0], path[i + 1][1] - path[i][1]);
  return t;
};

/** Smooth a coarse polyline with Chaikin corner cutting. */
export function smooth(path: [number, number][], rounds = 2): [number, number][] {
  let p = path;
  for (let r = 0; r < rounds; r++) {
    const out: [number, number][] = [p[0]];
    for (let i = 0; i < p.length - 1; i++) {
      const [ax, ay] = p[i];
      const [bx, by] = p[i + 1];
      out.push([ax * 0.75 + bx * 0.25, ay * 0.75 + by * 0.25], [ax * 0.25 + bx * 0.75, ay * 0.25 + by * 0.75]);
    }
    out.push(p[p.length - 1]);
    p = out;
  }
  return p;
}
