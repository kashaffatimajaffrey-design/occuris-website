// Headlines get slightly heavier where the pointer is: each word's weight
// rises as the cursor comes within 160 px of it. Fine pointers only.

const RANGE = 160;
const LIFT = 110;

export function weightOnPointer() {
  if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  const heads = [...document.querySelectorAll<HTMLElement>('.weighted')].map((el) => ({
    el,
    words: [...el.querySelectorAll<HTMLElement>('.w')],
    last: [] as number[],
    live: false,
  }));
  let mx = -1e4;
  let my = -1e4;
  let raf = 0;

  const update = () => {
    raf = 0;
    for (const h of heads) {
      const r = h.el.getBoundingClientRect();
      const near =
        r.bottom > 0 && r.top < innerHeight && my > r.top - RANGE && my < r.bottom + RANGE && mx > r.left - RANGE && mx < r.right + RANGE;
      if (!near) {
        if (h.live) {
          h.words.forEach((w) => w.style.removeProperty('--wght'));
          h.last = [];
          h.live = false;
        }
        continue;
      }
      h.live = true;
      const rects = h.words.map((w) => w.getBoundingClientRect());
      rects.forEach((wr, i) => {
        const dx = Math.max(wr.left - mx, 0, mx - wr.right);
        const dy = Math.max(wr.top - my, 0, my - wr.bottom);
        const k = Math.max(0, 1 - Math.hypot(dx, dy) / RANGE);
        const v = Math.round(400 + LIFT * k * k);
        if (h.last[i] !== v) {
          h.last[i] = v;
          h.words[i].style.setProperty('--wght', String(v));
        }
      });
    }
  };
  const queue = () => {
    if (!raf) raf = requestAnimationFrame(update);
  };
  addEventListener(
    'pointermove',
    (e) => {
      mx = e.clientX;
      my = e.clientY;
      queue();
    },
    { passive: true },
  );
  addEventListener('scroll', queue, { passive: true });
  document.addEventListener('pointerleave', () => {
    mx = my = -1e4;
    queue();
  });
}
