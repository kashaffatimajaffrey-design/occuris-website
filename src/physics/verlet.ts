// Shared position-Verlet integrator, distance constraints and the frame loop
// used by the chain and the flow field. Units are CSS pixels; canvases are
// backed at devicePixelRatio, capped at 2.

export interface Point {
  x: number;
  y: number;
  px: number;
  py: number;
  pinned: boolean;
}

export interface Constraint {
  a: Point;
  b: Point;
  rest: number;
}

export interface Piece {
  pause(): void;
  resume(): void;
  destroy(): void;
}

export const point = (x: number, y: number, pinned = false): Point => ({ x, y, px: x, py: y, pinned });

/** next = pos + (pos - prev) * damping + accel * dt² */
export function integrate(points: Point[], damping: number, ax: number, ay: number, dt = 1): void {
  const dt2 = dt * dt;
  for (const p of points) {
    if (p.pinned) continue;
    const vx = (p.x - p.px) * damping;
    const vy = (p.y - p.py) * damping;
    p.px = p.x;
    p.py = p.y;
    p.x += vx + ax * dt2;
    p.y += vy + ay * dt2;
  }
}

export function solve(c: Constraint): void {
  const { a, b } = c;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy);
  if (d < 1e-6) return;
  const diff = (d - c.rest) / d;
  if (a.pinned && b.pinned) return;
  if (a.pinned) {
    b.x -= dx * diff;
    b.y -= dy * diff;
  } else if (b.pinned) {
    a.x += dx * diff;
    a.y += dy * diff;
  } else {
    const h = diff * 0.5;
    a.x += dx * h;
    a.y += dy * h;
    b.x -= dx * h;
    b.y -= dy * h;
  }
}

export function satisfy(constraints: Constraint[], iterations: number, each?: () => void): void {
  for (let i = 0; i < iterations; i++) {
    for (const c of constraints) solve(c);
    each?.();
  }
}

export const pixelRatio = (): number => Math.min(window.devicePixelRatio || 1, 2);

/** Sizes the backing store to the element's CSS box. Returns CSS size. */
export function fit(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) {
  const r = canvas.getBoundingClientRect();
  const ratio = pixelRatio();
  const w = Math.max(1, Math.round(r.width));
  const h = Math.max(1, Math.round(r.height));
  canvas.width = Math.round(w * ratio);
  canvas.height = Math.round(h * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  return { w, h, ratio };
}

/** Reads the colour tokens from tokens.css so no hex lives in the physics. */
export function tokens() {
  const s = getComputedStyle(document.documentElement);
  const get = (n: string) => s.getPropertyValue(`--${n}`).trim();
  return {
    paper: get('paper'),
    ink: get('ink'),
    violet: get('violet'),
    amber: get('amber'),
    night: get('night'),
    mist: get('mist'),
  };
}

export type Tokens = ReturnType<typeof tokens>;

/**
 * requestAnimationFrame loop running a fixed 60 Hz physics step. Frames over
 * 50 ms (a tab switch, a long task) skip physics so nothing explodes. If the
 * device can't hold 60 fps it drops to rendering at 30 fps, two steps a frame.
 */
export function frameLoop(step: (t: number) => void, render: () => void) {
  const STEP = 1000 / 60;
  let raf = 0;
  let last = 0;
  let acc = 0;
  let t = 0;
  let slow = 0;
  let halfRate = false;
  let skip = false;

  const tick = (now: number) => {
    raf = requestAnimationFrame(tick);
    if (!last) last = now;
    const elapsed = now - last;
    if (halfRate && (skip = !skip)) return;
    last = now;
    if (elapsed > 50) {
      acc = 0;
      render();
      return;
    }
    // Adapt: 90 consecutive slow frames means a slow device
    slow = elapsed > 24 ? slow + 1 : Math.max(0, slow - 2);
    if (!halfRate && slow > 90) halfRate = true;
    acc += elapsed;
    let n = 0;
    while (acc >= STEP && n < 3) {
      t += STEP / 1000;
      step(t);
      acc -= STEP;
      n++;
    }
    if (n === 3) acc = 0;
    render();
  };

  return {
    start() {
      if (raf) return;
      last = 0;
      raf = requestAnimationFrame(tick);
    },
    stop() {
      cancelAnimationFrame(raf);
      raf = 0;
    },
    get running() {
      return raf !== 0;
    },
  };
}

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
