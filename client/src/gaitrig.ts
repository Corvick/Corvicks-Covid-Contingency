/**
 * Civilian gait rig. A canvas and nothing else — no socket and no port, so it
 * leaves a game on 8080 alone. Open `/gaitrig.html` on the dev server.
 *
 * A walk is a thing in motion, and `spritesheet.ts` can only measure one. This
 * puts civilians walking left to right at the speeds the game actually moves
 * them — a body easing into a walk, a settled civilian pacing its room, a
 * stroll, a hurry and a flight — through the real `drawEntity`, fed the way the
 * round feeds it: a 30Hz server tick **rounded to whole pixels**, snapshots
 * arriving a few milliseconds late, and `main.ts`'s own interpolation between
 * them. So what is on screen here is what a round shows, with nothing else in
 * the way of looking at it.
 *
 * `L` swaps between the old walk and the new one (`setLegacyGait`); `T` puts a
 * tick under each body at where the game says it is, which is what makes the
 * surge visible as a surge rather than as a body that is merely moving.
 *
 * Driven off `setInterval` rather than rAF, which is throttled to nothing while
 * the browser pane is not compositing. One reading lands on `window.rigResult`:
 * how far the drawn body's ink moves against its true position over a few
 * seconds of a stroll, which is the offset reaching the screen rather than
 * merely being computed.
 */
import { GROUND_COLOR } from '../../shared/constants.js';
import type { EntityState } from '../../shared/types.js';
import { setLegacyGait } from './chargait.js';
import { drawEntity } from './render.js';

const canvas = document.getElementById('rig') as HTMLCanvasElement;
const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
const modeEl = document.getElementById('mode')!;

const ZOOM = 2; // CAMERA_ZOOM
const TICK = 1000 / 30;
const ROWS = [
  { speed: 13, label: '13 px/s - easing into a walk' },
  { speed: 30, label: '30 px/s - pacing a room' },
  { speed: 35, label: '35 px/s - a stroll (HUMAN_WALK_SPEED)' },
  { speed: 60, label: '60 px/s - hurrying' },
  { speed: 83, label: '83 px/s - running (HUMAN_FLEE_SPEED)' },
];
const WIDTH = canvas.width / ZOOM;
const ROW_H = 88;

interface Walker {
  state: EntityState;
  speed: number;
  serverX: number;
  fromX: number;
  toX: number;
  snapshotAt: number;
  gap: number;
  nextArrival: number;
}

let legacy = false;
let showTruth = true;
const walkers: Walker[] = [];

function reset(): void {
  setLegacyGait(legacy);
  walkers.length = 0;
  const now = performance.now();
  ROWS.forEach((row, r) => {
    for (let i = 0; i < 3; i++) {
      const x = 60 + i * (WIDTH / 3);
      walkers.push({
        state: { id: `walker-${r}-${i}`, type: 'human', x, y: 48 + r * ROW_H + 20, facing: 0, health: 100 },
        speed: row.speed,
        serverX: x,
        fromX: x,
        toX: x,
        snapshotAt: now,
        gap: TICK,
        nextArrival: now + TICK,
      });
    }
  });
  modeEl.textContent = legacy ? 'OLD walk' : 'NEW walk';
}

function step(now: number): void {
  for (const w of walkers) {
    while (w.nextArrival <= now) {
      w.serverX += w.speed / 30;
      if (w.serverX > WIDTH + 30) w.serverX -= WIDTH + 60;
      const gap = w.nextArrival - w.snapshotAt;
      if (gap > 4 && gap < 400) w.gap = w.gap * 0.8 + gap * 0.2;
      w.snapshotAt = w.nextArrival;
      w.fromX = w.state.x;
      w.toX = Math.round(w.serverX);
      if (Math.abs(w.toX - w.fromX) > 140) w.fromX = w.toX;
      w.nextArrival += TICK + Math.random() * 8;
    }
    const t = Math.min(1, Math.max(0, (now - w.snapshotAt) / w.gap));
    w.state.x = w.fromX + (w.toX - w.fromX) * t;
  }
}

function paint(now: number): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = GROUND_COLOR;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(ZOOM, 0, 0, ZOOM, 0, 0);
  // Floor marks, so movement against the ground is something the eye can judge.
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  for (let y = 24; y < canvas.height / ZOOM; y += 24)
    for (let x = 0; x < WIDTH; x += 24) ctx.fillRect(x, y, 1, 1);
  ctx.font = '8px system-ui, sans-serif';
  ctx.fillStyle = '#8d949c';
  ROWS.forEach((row, r) => ctx.fillText(row.label, 6, 30 + r * ROW_H));
  for (const w of walkers) {
    drawEntity(ctx, w.state, false, now);
    if (showTruth) {
      ctx.fillStyle = '#e02424';
      ctx.fillRect(w.state.x - 0.5, w.state.y + 20, 1, 5);
    }
  }
}

setInterval(() => {
  const now = performance.now();
  step(now);
  paint(now);
}, 1000 / 60);

addEventListener('keydown', (ev) => {
  if (ev.code === 'KeyL') {
    legacy = !legacy;
    reset();
  } else if (ev.code === 'KeyT') showTruth = !showTruth;
});
document.getElementById('toggle')!.addEventListener('click', () => {
  legacy = !legacy;
  reset();
});
document.getElementById('truth')!.addEventListener('click', () => {
  showTruth = !showTruth;
});
reset();

/**
 * The reading: the ink centroid of one strolling body against its true x, over
 * three seconds, in world pixels. Measured on its own canvas so the rig's
 * moving scene does not get in the way, and with the body drawn through the
 * same `drawEntity`.
 */
async function measure(): Promise<{ oldSpan: number; newSpan: number; frames: number }> {
  const probe = document.createElement('canvas');
  probe.width = 200;
  probe.height = 120;
  const pc = probe.getContext('2d', { willReadFrequently: true })!;
  const spanFor = (legacyOn: boolean): number => {
    setLegacyGait(legacyOn);
    let lo = Infinity;
    let hi = -Infinity;
    const e: EntityState = { id: 'probe', type: 'human', x: 50, y: 30, facing: 0, health: 100 };
    let serverX = 50;
    let fromX = 50;
    let toX = 50;
    let at = 0;
    for (let now = 0, next = TICK; now < 5000; now += 1000 / 144) {
      while (next <= now) {
        serverX += 35 / 30;
        fromX = e.x;
        toX = Math.round(serverX);
        at = next;
        next += TICK;
      }
      e.x = fromX + (toX - fromX) * Math.min(1, (now - at) / TICK);
      pc.setTransform(1, 0, 0, 1, 0, 0);
      pc.clearRect(0, 0, probe.width, probe.height);
      // Scrolled with the body, so the probe canvas never runs out of room.
      pc.setTransform(ZOOM, 0, 0, ZOOM, -(e.x - 50) * ZOOM, 0);
      drawEntity(pc, e, false, now + 1e6);
      if (now < 2000) continue;
      const img = pc.getImageData(0, 0, probe.width, probe.height).data;
      let sx = 0;
      let n = 0;
      for (let i = 0; i < img.length; i += 4)
        if (img[i + 3] > 200) {
          sx += (i / 4) % probe.width;
          n++;
        }
      if (!n) continue;
      const off = sx / n / ZOOM - 50;
      lo = Math.min(lo, off);
      hi = Math.max(hi, off);
    }
    return hi - lo;
  };
  const oldSpan = spanFor(true);
  const newSpan = spanFor(false);
  setLegacyGait(legacy);
  return { oldSpan, newSpan, frames: Math.round(3000 / (1000 / 144)) };
}
measure().then((r) => {
  (window as unknown as { rigResult: unknown }).rigResult = r;
  reset();
});
