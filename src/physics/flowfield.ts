// Set piece B: loose messages becoming a table (PRD sections 6B and 14B).
// Particles drift along a Perlin flow field, are pushed away by the cursor,
// then lerp onto the rows of the real HTML table that replaces the canvas.

import { clamp, easeInOutCubic, fit, frameLoop, lerp, tokens, type Piece } from './verlet';

export interface Target {
  x: number;
  y: number;
}

export interface FlowOptions {
  count?: number;
  speed?: number;
  /** Where the particles should line up, in canvas CSS pixels. */
  targets?: (count: number, w: number, h: number) => Target[];
  onFormed?: () => void;
  /** How far toward the rows the particles sit before forming (0 = loose, 1 = rows) */
  base?: number;
  /** How long the final landing takes */
  formMs?: number;
}

export interface Flow extends Piece {
  readonly count: number;
  readonly state: { mode: string; haveTargets: boolean };
  form(): void;
  scatter(): void;
}

const SCALE = 0.0028;
const Z_STEP = 0.0015;
const TRAIL = 0.08;
const PUSH_R = 120;
const PUSH = 2.2;
const FORM_MS = 1500;
// Flow fields have sinks; without respawning, every particle ends up on a few
// dark curves. Each particle gets a fresh random start about every 5 s.
const RESPAWN = 1 / 300;

// Ken Perlin's improved noise, 3D, with a fixed permutation so every visit looks the same.
const perm = new Uint8Array(512);
{
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  let s = 1187;
  for (let i = 255; i > 0; i--) {
    s = (s * 16807) % 2147483647;
    const j = s % (i + 1);
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
}
const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
function grad(h: number, x: number, y: number, z: number) {
  const u = h < 8 ? x : y;
  const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
  return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
}
export function noise(x: number, y: number, z: number): number {
  const X = Math.floor(x) & 255;
  const Y = Math.floor(y) & 255;
  const Z = Math.floor(z) & 255;
  x -= Math.floor(x);
  y -= Math.floor(y);
  z -= Math.floor(z);
  const u = fade(x);
  const v = fade(y);
  const w = fade(z);
  const A = perm[X] + Y;
  const AA = perm[A] + Z;
  const AB = perm[A + 1] + Z;
  const B = perm[X + 1] + Y;
  const BA = perm[B] + Z;
  const BB = perm[B + 1] + Z;
  return lerp(
    lerp(
      lerp(grad(perm[AA] & 15, x, y, z), grad(perm[BA] & 15, x - 1, y, z), u),
      lerp(grad(perm[AB] & 15, x, y - 1, z), grad(perm[BB] & 15, x - 1, y - 1, z), u),
      v,
    ),
    lerp(
      lerp(grad(perm[AA + 1] & 15, x, y, z - 1), grad(perm[BA + 1] & 15, x - 1, y, z - 1), u),
      lerp(grad(perm[AB + 1] & 15, x, y - 1, z - 1), grad(perm[BB + 1] & 15, x - 1, y - 1, z - 1), u),
      v,
    ),
    w,
  );
}

/** The spec's default rows: 8 rows of particles, row y = 24 + i * 40. */
export function defaultTargets(count: number, w: number): Target[] {
  const out: Target[] = [];
  const per = Math.ceil(count / 8);
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / per);
    const k = i % per;
    out.push({ x: ((k + 0.5) / per) * w + (Math.random() - 0.5) * 4, y: 24 + row * 40 + (Math.random() - 0.5) * 4 });
  }
  return out;
}

export function init(canvas: HTMLCanvasElement, opts: FlowOptions = {}): Flow {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is unavailable');
  const c = tokens();
  const N = opts.count ?? 2000;
  const speed = opts.speed ?? 1.4;

  let W = 0;
  let H = 0;
  let z = 0;
  // field position, drawn position, target
  const fx = new Float32Array(N);
  const fy = new Float32Array(N);
  const dx = new Float32Array(N);
  const dy = new Float32Array(N);
  const tx = new Float32Array(N);
  const ty = new Float32Array(N);

  let mode: 'field' | 'forming' | 'formed' = 'field';
  const base = opts.base ?? 0;
  const formMs = opts.formMs ?? FORM_MS;
  let haveTargets = false;
  let formStart = 0;
  let mouse = { x: -1e4, y: -1e4 };
  let clock = 0;

  function seed() {
    for (let i = 0; i < N; i++) {
      fx[i] = dx[i] = Math.random() * W;
      fy[i] = dy[i] = Math.random() * H;
    }
  }

  function size(first: boolean) {
    const prevW = W;
    const prevH = H;
    ({ w: W, h: H } = fit(canvas, ctx!));
    if (first) seed();
    else if (prevW && prevH)
      for (let i = 0; i < N; i++) {
        fx[i] *= W / prevW;
        fy[i] *= H / prevH;
      }
  }

  function step(t: number) {
    clock = t * 1000;
    z += Z_STEP;
    const wrap = mode === 'field';
    for (let i = 0; i < N; i++) {
      const a = noise(fx[i] * SCALE, fy[i] * SCALE, z) * Math.PI * 2 * 2;
      let x = fx[i] + Math.cos(a) * speed;
      let y = fy[i] + Math.sin(a) * speed;
      const mx = x - mouse.x;
      const my = y - mouse.y;
      const d2 = mx * mx + my * my;
      if (d2 < PUSH_R * PUSH_R) {
        const d = Math.sqrt(d2) || 1;
        const f = PUSH * (1 - d / PUSH_R);
        x += (mx / d) * f;
        y += (my / d) * f;
      }
      // While forming, positions are left unwrapped so the lerp never jumps.
      if (wrap && Math.random() < RESPAWN) {
        x = Math.random() * W;
        y = Math.random() * H;
      } else if (wrap) {
        if (x < 0) x += W;
        else if (x > W) x -= W;
        if (y < 0) y += H;
        else if (y > H) y -= H;
      }
      fx[i] = x;
      fy[i] = y;
    }

    let e = 0;
    if (mode !== 'field') {
      e = easeInOutCubic(clamp((clock - formStart) / formMs, 0, 1));
      if (mode === 'forming' && e >= 1) {
        mode = 'formed';
        opts.onFormed?.();
      }
    }

    // Half-formed: each particle circles its own spot in the table, pushed by
    // the same noise field, so a still frame already reads as rows. Landing
    // shrinks the circle to nothing.
    if (haveTargets && base > 0) {
      const reach = (1 - base) * 64 * (1 - e);
      for (let i = 0; i < N; i++) {
        const a = noise(tx[i] * 0.011, ty[i] * 0.011, z * 3) * Math.PI * 4;
        const r = reach * (0.35 + 0.65 * Math.abs(noise(ty[i] * 0.02, tx[i] * 0.02, z * 2 + 7)) * 2);
        let x = tx[i] + Math.cos(a) * r;
        let y = ty[i] + Math.sin(a) * r * 0.6;
        const mx = x - mouse.x;
        const my = y - mouse.y;
        const d2 = mx * mx + my * my;
        if (d2 < PUSH_R * PUSH_R) {
          const d = Math.sqrt(d2) || 1;
          const f = 24 * (1 - d / PUSH_R) * (1 - e);
          x += (mx / d) * f;
          y += (my / d) * f;
        }
        dx[i] = x;
        dy[i] = y;
      }
      return;
    }
    for (let i = 0; i < N; i++) {
      dx[i] = lerp(fx[i], tx[i], e);
      dy[i] = lerp(fy[i], ty[i], e);
    }
  }

  let frame = 0;
  function render() {
    const g = ctx!;
    // Trails fade by erasing alpha on a transparent canvas over the paper
    // frame. Painting paper over ink at 8 % stalls on 8-bit rounding and
    // leaves a tinted haze; erasing leaves at most ~2/255 of ink, and a
    // stronger pass every 10th frame clears even that.
    g.globalCompositeOperation = 'destination-out';
    g.globalAlpha = ++frame % 10 === 0 ? 0.25 : TRAIL;
    g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 0.6;
    g.fillStyle = c.ink;
    for (let i = 0; i < N; i++) g.fillRect(dx[i] - 0.75, dy[i] - 0.75, 1.5, 1.5);
    g.globalAlpha = 1;
  }

  function loadTargets() {
    const targets = opts.targets?.(N, W, H) ?? defaultTargets(N, W);
    if (!targets.length) return;
    for (let i = 0; i < N; i++) {
      tx[i] = targets[i % targets.length].x;
      ty[i] = targets[i % targets.length].y;
    }
    haveTargets = true;
  }

  function form() {
    if (mode !== 'field') return;
    loadTargets();
    mode = 'forming';
    formStart = clock;
  }

  function scatter() {
    // Release the particles from their rows back into the field.
    for (let i = 0; i < N; i++) {
      fx[i] = clamp(dx[i], 0, W);
      fy[i] = clamp(dy[i], 0, H);
    }
    mode = 'field';
  }

  const onMove = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    mouse = { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const onLeave = () => (mouse = { x: -1e4, y: -1e4 });
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerleave', onLeave);

  const ro = new ResizeObserver(() => {
    size(false);
    if (haveTargets) loadTargets();
  });
  size(true);
  if (base > 0) loadTargets();
  ro.observe(canvas);

  const loop = frameLoop(step, render);
  loop.start();

  return {
    count: N,
    get state() {
      return { mode, haveTargets };
    },
    form,
    scatter,
    pause: () => loop.stop(),
    resume: () => loop.start(),
    destroy() {
      loop.stop();
      ro.disconnect();
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerleave', onLeave);
    },
  };
}
