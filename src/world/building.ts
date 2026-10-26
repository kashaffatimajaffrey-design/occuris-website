// Screen 5: your building, cut open. Server racks blink, the local model
// turns, the audit log scrolls, data moves between them. Every so often a
// packet heads for someone else's cloud and bounces off the glass.

import { box, palette, poly, project, Queue, shade, type Camera } from './iso';
import type { Piece } from '../physics/verlet';

type P2 = [number, number];

export interface BuildingOptions {
  labels: { cloud: string; model: string; log: string };
}

const FX = 12; // floor size in tiles
const FY = 9;
const WALL = 3;

interface Packet {
  path: P2[];
  u: number;
  speed: number;
  bounce: boolean;
  back: boolean;
}

export function init(canvas: HTMLCanvasElement, o: BuildingOptions): Piece {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is unavailable');
  const g = ctx;
  const c = palette();
  const cam: Camera = { t: 20, ox: 0, oy: 0 };
  let W = 0;
  let H = 0;
  let ratio = 1;
  let time = 0;

  const RACKS: P2[] = [[1.4, 1.2], [2.8, 1.2], [4.2, 1.2], [1.2, 3.4]];
  const CORE: P2 = [7.2, 4.6];
  const DESK: P2 = [8.6, 6.9];
  const LOG: P2 = [8.5, 0.2];
  const WALL_HIT: P2 = [FX - 0.05, 4.2];
  const CLOUD = { x: 15.3, y: 2.4, z: 3.8 };
  const PLANT: P2 = [10.9, 7.7];

  const routes: P2[][] = [
    [[1.9, 2.3], [1.9, 4.6], CORE],
    [[3.3, 2.3], [3.3, 3.2], [6.4, 3.2], CORE],
    [[4.7, 2.3], [4.7, 4.6], CORE],
    [CORE, [7.2, 6.9], DESK],
    [CORE, [8.5, 4.6], [8.5, 1.2]],
    [[1.7, 4.4], [1.7, 5.8], [7.2, 5.8], CORE],
  ];
  const packets: Packet[] = [];
  const pings: { t0: number }[] = [];
  let spawn = 0;
  let escape = 1.5;

  function size() {
    const r = canvas.getBoundingClientRect();
    ratio = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(1, Math.round(r.width));
    H = Math.max(1, Math.round(r.height));
    canvas.width = Math.round(W * ratio);
    canvas.height = Math.round(H * ratio);
    // Fit the building and the cloud outside it
    const probe: Camera = { t: 1, ox: 0, oy: 0 };
    const pts = [project(probe, 0, 0, WALL + 0.4), project(probe, FX, 0, WALL), project(probe, 0, FY, 0), project(probe, FX, FY, -0.5), project(probe, CLOUD.x + 1.5, CLOUD.y - 1, CLOUD.z + 1), project(probe, CLOUD.x + 1, CLOUD.y + 1, 0)];
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const bw = Math.max(...xs) - Math.min(...xs);
    const bh = Math.max(...ys) - Math.min(...ys);
    cam.t = Math.min((W * 0.96) / bw, (H * 0.9) / bh);
    cam.ox = W / 2 - ((Math.max(...xs) + Math.min(...xs)) / 2) * cam.t;
    cam.oy = H / 2 - ((Math.max(...ys) + Math.min(...ys)) / 2) * cam.t;
  }

  const P = (x: number, y: number, z = 0) => project(cam, x, y, z);
  const glass = 'rgba(201,191,227,0.06)';
  const glassEdge = 'rgba(201,191,227,0.45)';
  const floorTop = shade(c.night, 1.07);

  function along(path: P2[], u: number): P2 {
    const seg: number[] = [];
    let total = 0;
    for (let i = 0; i < path.length - 1; i++) {
      const l = Math.hypot(path[i + 1][0] - path[i][0], path[i + 1][1] - path[i][1]);
      seg.push(l);
      total += l;
    }
    let left = u * total;
    for (let i = 0; i < seg.length; i++) {
      if (left <= seg[i] || i === seg.length - 1) {
        const f = seg[i] ? Math.min(1, left / seg[i]) : 0;
        return [path[i][0] + (path[i + 1][0] - path[i][0]) * f, path[i][1] + (path[i + 1][1] - path[i][1]) * f];
      }
      left -= seg[i];
    }
    return path[0];
  }

  function render() {
    g.setTransform(ratio, 0, 0, ratio, 0, 0);
    g.clearRect(0, 0, W, H);

    // Slab and floor grid
    box(g, cam, 0, 0, -0.5, FX, FY, 0.5, floorTop, { top: floorTop });
    g.strokeStyle = c.mist;
    g.globalAlpha = 0.07;
    g.lineWidth = 1;
    g.beginPath();
    for (let x = 1; x < FX; x++) {
      const [a, b] = [P(x, 0), P(x, FY)];
      g.moveTo(a[0], a[1]);
      g.lineTo(b[0], b[1]);
    }
    for (let y = 1; y < FY; y++) {
      const [a, b] = [P(0, y), P(FX, y)];
      g.moveTo(a[0], a[1]);
      g.lineTo(b[0], b[1]);
    }
    g.stroke();
    g.globalAlpha = 1;

    // Back walls (glass)
    poly(g, [P(0, 0), P(FX, 0), P(FX, 0, WALL), P(0, 0, WALL)], glass, glassEdge);
    poly(g, [P(0, 0), P(0, FY), P(0, FY, WALL), P(0, 0, WALL)], glass, glassEdge);

    // Audit log screen on the back wall, lines scrolling up
    const [lx, ly] = LOG;
    poly(g, [P(lx, ly, 1.1), P(lx + 2.6, ly, 1.1), P(lx + 2.6, ly, 2.5), P(lx, ly, 2.5)], shade(c.night, 1.18), c.mist, 0.75);
    g.save();
    g.beginPath();
    const clip = [P(lx + 0.1, ly, 1.18), P(lx + 2.5, ly, 1.18), P(lx + 2.5, ly, 2.42), P(lx + 0.1, ly, 2.42)];
    g.moveTo(clip[0][0], clip[0][1]);
    clip.slice(1).forEach(([x, y]) => g.lineTo(x, y));
    g.closePath();
    g.clip();
    const scroll = (time * 0.22) % 0.2;
    for (let k = 0; k < 8; k++) {
      const z = 1.22 + k * 0.2 - scroll;
      const len = 0.6 + ((k * 7) % 5) * 0.32;
      const [a, b] = [P(lx + 0.2, ly, z), P(lx + 0.2 + len, ly, z)];
      g.strokeStyle = k % 3 === 0 ? c.violet : c.mist;
      g.globalAlpha = 0.75;
      g.lineWidth = Math.max(1, cam.t * 0.05);
      g.beginPath();
      g.moveTo(a[0], a[1]);
      g.lineTo(b[0], b[1]);
      g.stroke();
    }
    g.restore();
    g.globalAlpha = 1;

    // Paths on the floor
    g.strokeStyle = c.violet;
    g.globalAlpha = 0.28;
    g.lineWidth = Math.max(1, cam.t * 0.05);
    g.setLineDash([cam.t * 0.15, cam.t * 0.2]);
    for (const r of routes) {
      g.beginPath();
      r.forEach(([x, y], i) => {
        const [sx, sy] = P(x, y, 0.02);
        if (i) g.lineTo(sx, sy);
        else g.moveTo(sx, sy);
      });
      g.stroke();
    }
    g.setLineDash([]);
    g.globalAlpha = 1;

    const q = new Queue();
    // Racks with blinking lights
    RACKS.forEach(([x, y], i) =>
      q.add(x + y + 1, () => {
        box(g, cam, x, y, 0, 1, 0.8, 2.2, shade(c.night, 1.3), { top: shade(c.night, 1.5) });
        for (let k = 0; k < 6; k++) {
          const on = Math.sin(time * (2 + ((i + k) % 3)) + k * 1.7 + i) > 0.1;
          const [lx2, ly2] = P(x + 0.18, y + 0.8, 0.35 + k * 0.3);
          g.fillStyle = on ? (k % 3 === 0 ? c.violet : k % 3 === 1 ? c.teal : c.mist) : shade(c.night, 1.6);
          g.fillRect(lx2, ly2 - 2, Math.max(2, cam.t * 0.12), 2.5);
          const [lx3, ly3] = P(x + 0.55, y + 0.8, 0.35 + k * 0.3);
          g.fillStyle = shade(c.night, 1.8);
          g.fillRect(lx3, ly3 - 1.5, Math.max(4, cam.t * 0.3), 1.5);
        }
      }),
    );
    // The local model: a pedestal and the brand ring turning above it
    q.add(CORE[0] + CORE[1] + 1.2, () => {
      box(g, cam, CORE[0] - 0.6, CORE[1] - 0.6, 0, 1.2, 1.2, 0.55, shade(c.night, 1.35), { top: shade(c.violet, 0.75) });
      const bob = Math.sin(time * 1.6) * 0.08;
      const z = 1.45 + bob;
      // ring as a projected circle, drawn in two halves so it passes behind the axis
      const ring = (from: number, to: number, col: string, w: number) => {
        g.strokeStyle = col;
        g.lineWidth = w;
        g.beginPath();
        for (let k = 0; k <= 40; k++) {
          const a = from + ((to - from) * k) / 40;
          const [sx, sy] = P(CORE[0] + Math.cos(a) * 0.75, CORE[1] + Math.sin(a) * 0.75, z + Math.sin(a + time) * 0.18);
          if (k) g.lineTo(sx, sy);
          else g.moveTo(sx, sy);
        }
        g.stroke();
      };
      ring(0, Math.PI * 2, c.violet, Math.max(3, cam.t * 0.22));
      const head = (time * 1.8) % (Math.PI * 2);
      ring(head, head + 0.6, c.paper, Math.max(3, cam.t * 0.22));
      // a beam down to the pedestal
      const [b1, b2] = [P(CORE[0], CORE[1], 0.55), P(CORE[0], CORE[1], z - 0.1)];
      g.strokeStyle = c.violet;
      g.globalAlpha = 0.35;
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(b1[0], b1[1]);
      g.lineTo(b2[0], b2[1]);
      g.stroke();
      g.globalAlpha = 1;
    });
    // A person at a desk, reading the alerts
    q.add(DESK[0] + DESK[1] + 1, () => {
      box(g, cam, DESK[0], DESK[1], 0, 1.5, 0.75, 0.55, shade(c.landDark, 0.75), { top: shade(c.landDark, 0.95) });
      box(g, cam, DESK[0] + 0.5, DESK[1] + 0.1, 0.55, 0.55, 0.38, 0.04, c.steel);
      const scr = [P(DESK[0] + 0.5, DESK[1] + 0.1, 0.59), P(DESK[0] + 1.05, DESK[1] + 0.1, 0.59), P(DESK[0] + 1.05, DESK[1] + 0.1, 0.95), P(DESK[0] + 0.5, DESK[1] + 0.1, 0.95)];
      poly(g, scr, shade(c.violet, 1.15));
      // person: body and head, nodding slightly
      const nod = Math.sin(time * 1.3) * 0.03;
      box(g, cam, DESK[0] + 0.55, DESK[1] + 1.05, 0, 0.45, 0.4, 0.75, c.teal);
      const [hx, hy] = P(DESK[0] + 0.78, DESK[1] + 1.25, 1.02 + nod);
      g.fillStyle = shade(c.brick, 1.3);
      g.beginPath();
      g.arc(hx, hy, cam.t * 0.2, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = c.ink;
      g.beginPath();
      g.arc(hx, hy - cam.t * 0.06, cam.t * 0.2, Math.PI, Math.PI * 2);
      g.fill();
    });
    // A plant by the window, and the door left open for people (not data)
    q.add(PLANT[0] + PLANT[1] + 0.6, () => {
      box(g, cam, PLANT[0], PLANT[1], 0, 0.5, 0.5, 0.4, c.brick);
      const sway = Math.sin(time * 0.8) * cam.t * 0.04;
      for (const [dx, dz, rr, col] of [[0, 0.75, 0.32, c.leafDark], [-0.12, 0.95, 0.26, c.leaf], [0.14, 1.05, 0.22, c.leaf]] as const) {
        const [px, py] = P(PLANT[0] + 0.25 + dx, PLANT[1] + 0.25, dz);
        g.fillStyle = col;
        g.beginPath();
        g.arc(px + sway, py, cam.t * rr, 0, Math.PI * 2);
        g.fill();
      }
    });
    q.flush();

    // Packets
    for (const p of packets) {
      const [x, y] = along(p.path, p.back ? 1 - p.u : p.u);
      const [sx, sy] = P(x, y, 0.25);
      g.fillStyle = p.bounce ? c.amber : c.paper;
      g.beginPath();
      g.arc(sx, sy, Math.max(2.5, cam.t * 0.12), 0, Math.PI * 2);
      g.fill();
    }

    // Front walls: glass edges drawn last, with pings where packets hit them
    poly(g, [P(FX, 0), P(FX, FY), P(FX, FY, WALL), P(FX, 0, WALL)], glass, glassEdge);
    poly(g, [P(0, FY), P(FX, FY), P(FX, FY, WALL), P(0, FY, WALL)], 'rgba(201,191,227,0.03)', glassEdge);
    for (let i = pings.length - 1; i >= 0; i--) {
      const age = time - pings[i].t0;
      if (age > 1) {
        pings.splice(i, 1);
        continue;
      }
      // a ring on the wall plane (x = FX)
      g.strokeStyle = c.amber;
      g.globalAlpha = 1 - age;
      g.lineWidth = 1.5;
      g.beginPath();
      for (let k = 0; k <= 30; k++) {
        const a = (k / 30) * Math.PI * 2;
        const rr = 0.2 + age * 0.9;
        const [sx, sy] = P(FX, WALL_HIT[1] + Math.cos(a) * rr, 0.25 + Math.sin(a) * rr);
        if (k) g.lineTo(sx, sy);
        else g.moveTo(sx, sy);
      }
      g.stroke();
      g.globalAlpha = 1;
    }

    // Someone else's cloud, outside, never connected
    const [cx, cy] = P(CLOUD.x, CLOUD.y, CLOUD.z);
    const s = cam.t * 1.35;
    g.setLineDash([4, 4]);
    g.strokeStyle = c.mist;
    g.globalAlpha = 0.55;
    g.lineWidth = 1.2;
    g.beginPath();
    for (const [dx, dy, rr] of [[-0.75, 0.15, 0.5], [0, -0.15, 0.7], [0.75, 0.15, 0.45]] as const) {
      g.moveTo(cx + dx * s + rr * s, cy + dy * s);
      g.arc(cx + dx * s, cy + dy * s, rr * s, 0, Math.PI * 2);
    }
    g.stroke();
    // the line that stops short of the building
    const [l1, l2] = [P(CLOUD.x - 1.2, CLOUD.y + 0.8, CLOUD.z - 0.8), P(FX + 0.8, WALL_HIT[1] - 0.5, 1.4)];
    g.beginPath();
    g.moveTo(l1[0], l1[1]);
    g.lineTo(l2[0], l2[1]);
    g.stroke();
    g.setLineDash([]);
    g.globalAlpha = 1;
    g.font = `400 ${Math.round(Math.max(11, cam.t * 0.42))}px "JetBrains Mono", monospace`;
    g.fillStyle = c.mist;
    g.textAlign = 'center';
    g.fillText(o.labels.cloud, cx, cy + s * 1.15);

    // Labels inside
    g.fillStyle = c.paper;
    g.globalAlpha = 0.85;
    const [mx, my] = P(CORE[0] + 1.15, CORE[1] + 0.2, 1.5);
    g.textAlign = 'left';
    g.fillText(o.labels.model, mx, my);
    g.textAlign = 'center';
    const [ax, ay] = P(LOG[0] + 1.3, LOG[1], 2.85);
    g.fillText(o.labels.log, ax, ay);
    g.globalAlpha = 1;
  }

  function step(dt: number) {
    time += dt;
    spawn -= dt;
    if (spawn <= 0) {
      spawn = 0.45;
      const r = routes[Math.floor(Math.random() * routes.length)];
      packets.push({ path: r, u: 0, speed: 0.35 + Math.random() * 0.15, bounce: false, back: Math.random() < 0.3 });
    }
    escape -= dt;
    if (escape <= 0) {
      escape = 3.2;
      packets.push({ path: [CORE, [CORE[0] + 1.5, WALL_HIT[1]], WALL_HIT], u: 0, speed: 0.5, bounce: true, back: false });
    }
    for (let i = packets.length - 1; i >= 0; i--) {
      const p = packets[i];
      p.u += dt * p.speed;
      if (p.u >= 1) {
        if (p.bounce && !p.back) {
          // hit the glass: ping, then go home
          pings.push({ t0: time });
          p.back = true;
          p.u = 0;
          continue;
        }
        packets.splice(i, 1);
      }
    }
  }

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
    render();
  });
  size();
  ro.observe(canvas);
  for (let i = 0; i < 90; i++) step(1 / 30);
  render();

  return {
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
    },
  };
}
