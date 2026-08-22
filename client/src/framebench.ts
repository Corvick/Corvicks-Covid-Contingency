/**
 * The live frame path, reproduced — an **in-DOM, CSS-scaled, presented** canvas
 * driven off rAF with no readback anywhere.
 *
 * `paintbench.ts` and `fogbench.ts` both draw to a canvas that is never in the
 * document and force the rasteriser with `getImageData`. That is the right
 * shape for asking "what does this drawing cost", and it is the wrong shape for
 * the fault being chased here: a client reporting `fog 12.0` where a bench of
 * the identical `drawFog` reports 2.17ms in the same browser. Four hypotheses
 * died against those benches, and every one of them died because the bench was
 * not drawing to a canvas the compositor was reading.
 *
 * So this one changes exactly that and nothing else: same 1920x1080 backbuffer,
 * same `#stage` CSS the game uses, appended to the document, one configuration
 * per rAF frame, timed with `performance.now()` the way `mark()` times a phase.
 * No `getImageData` — the whole point is to let the frame be presented.
 *
 * **The most informative row is `fillRect fullscreen x1`.** It is one solid
 * fill and nothing else. If that alone costs milliseconds, the canvas is being
 * rasterised on the CPU and the cost is fill rate — in which case no amount of
 * work on the fog will help, and the levers are the backbuffer size and the
 * number of full-screen passes. If it is free and only the fog is dear, the
 * cost is in the fog's own compositing and the levers are the ones fogbench
 * already sweeps.
 *
 * Note every figure is quantised to 1ms in Firefox (`privacy.reduceTimerPrecision`),
 * and unlike the other benches there is no batch to divide that away — one
 * frame does the work once, because being presented once is the thing under
 * test. That is plenty to separate 12ms from 2ms, and useless below ~1ms; rows
 * reading 0 mean "under a millisecond", not "free".
 *
 * Open `/framebench.html`.
 */
import {
  VIEWPORT_WIDTH,
  VIEWPORT_HEIGHT,
  FOG_MASK_SCALE,
  FOG_BLUR_PX,
  DOG_SIGHT_RADIUS,
  DOG_CAMERA_ZOOM,
} from '../../shared/constants.js';
import { visibilityPolygon } from './fog.js';
import type { Wall } from '../../shared/types.js';

const out = document.getElementById('out') as HTMLElement;
const stage = document.getElementById('stage') as HTMLElement;

// The real canvas: real size, real CSS, really in the document.
const canvas = document.createElement('canvas');
canvas.width = VIEWPORT_WIDTH;
canvas.height = VIEWPORT_HEIGHT;
stage.appendChild(canvas);
const ctx = canvas.getContext('2d')!;

const WORLD_W = 5000;
const WORLD_H = 3700;
const px = WORLD_W / 2;
const py = WORLD_H / 2;
const zoom = DOG_CAMERA_ZOOM;
const radius = DOG_SIGHT_RADIUS;
const view = {
  x: px - VIEWPORT_WIDTH / zoom / 2,
  y: py - VIEWPORT_HEIGHT / zoom / 2,
};

let seed = 987654321;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const walls: Wall[] = [];
for (let i = 0; i < 620; i++) {
  const horizontal = rnd() < 0.5;
  walls.push({
    x: rnd() * WORLD_W,
    y: rnd() * WORLD_H,
    w: horizontal ? 60 + rnd() * 260 : 8,
    h: horizontal ? 8 : 60 + rnd() * 260,
  });
}

const clipW = VIEWPORT_WIDTH / (2 * zoom) + 400;
const clipH = VIEWPORT_HEIGHT / (2 * zoom) + 400;
const poly = visibilityPolygon(px, py, radius, walls, [], clipW, clipH, false, []);

/**
 * The grime pattern, rebuilt here rather than imported.
 *
 * `grimeTile` is private to `render.ts`, and `drawGround` reads the live
 * `settings` — which on a machine that has been switched to LOW GRAPHICS would
 * silently skip the pattern and report the ground as free. A bench that depends
 * on the saved settings of the box it runs on is a bench that lies on exactly
 * the box being investigated.
 */
function buildGrime(): CanvasPattern | null {
  const tile = document.createElement('canvas');
  tile.width = 256;
  tile.height = 256;
  const g = tile.getContext('2d')!;
  let s = 12345;
  const r = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let i = 0; i < 260; i++) {
    g.fillStyle = `rgba(${20 + r() * 30 | 0},${20 + r() * 30 | 0},${22 + r() * 30 | 0},${0.05 + r() * 0.06})`;
    g.beginPath();
    g.ellipse(r() * 256, r() * 256, 3 + r() * 22, 2 + r() * 16, r() * Math.PI, 0, Math.PI * 2);
    g.fill();
  }
  return ctx.createPattern(tile, 'repeat');
}
const grime = buildGrime();

// The fog mask, at whatever scale a configuration asks for.
const masks = new Map<number, { c: HTMLCanvasElement; g: CanvasRenderingContext2D }>();
function maskFor(scale: number) {
  let m = masks.get(scale);
  if (!m) {
    const c = document.createElement('canvas');
    c.width = Math.round(VIEWPORT_WIDTH * scale);
    c.height = Math.round(VIEWPORT_HEIGHT * scale);
    m = { c, g: c.getContext('2d')! };
    masks.set(scale, m);
  }
  return m;
}

/** The mask half of `drawFog` — everything before the blit. */
function fogMask(maskScale: number, blur: boolean, blurPx: number): HTMLCanvasElement {
  const { c: fogCanvas, g: fogCtx } = maskFor(maskScale);
  const m = maskScale;
  const s = maskScale * zoom;
  fogCtx.setTransform(1, 0, 0, 1, 0, 0);
  fogCtx.clearRect(0, 0, fogCanvas.width, fogCanvas.height);
  fogCtx.fillStyle = 'rgba(4, 6, 9, 0.92)';
  fogCtx.fillRect(0, 0, fogCanvas.width, fogCanvas.height);

  const cx = (px - view.x) * s;
  const cy = (py - view.y) * s;
  const r = radius * s;
  const gradient = fogCtx.createRadialGradient(cx, cy, 0, cx, cy, r);
  gradient.addColorStop(0, 'rgba(0,0,0,1)');
  gradient.addColorStop(0.88, 'rgba(0,0,0,1)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  fogCtx.globalCompositeOperation = 'destination-out';
  fogCtx.fillStyle = gradient;
  if (blur) fogCtx.filter = `blur(${blurPx * m}px)`;

  fogCtx.beginPath();
  fogCtx.moveTo((poly[0].x - view.x) * s, (poly[0].y - view.y) * s);
  for (let i = 1; i < poly.length; i++) {
    const prev = poly[i - 1];
    const p = poly[i];
    const delta = p.angle - prev.angle;
    if (prev.atRadius && p.atRadius && delta > 0 && delta < Math.PI / 2) {
      fogCtx.arc(cx, cy, r, prev.angle, p.angle);
    } else {
      fogCtx.lineTo((p.x - view.x) * s, (p.y - view.y) * s);
    }
  }
  const last = poly[poly.length - 1];
  if (last.atRadius && poly[0].atRadius) {
    const wrap = poly[0].angle + Math.PI * 2 - last.angle;
    if (wrap > 0 && wrap < Math.PI / 2) {
      fogCtx.arc(cx, cy, r, last.angle, poly[0].angle + Math.PI * 2);
    }
  }
  fogCtx.closePath();
  fogCtx.fill();
  fogCtx.filter = 'none';
  fogCtx.globalCompositeOperation = 'source-over';
  return fogCanvas;
}

function groundFill(withGrime: boolean): void {
  ctx.save();
  ctx.scale(zoom, zoom);
  ctx.translate(-view.x, -view.y);
  ctx.fillStyle = '#191b1f';
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);
  if (withGrime && grime) {
    ctx.fillStyle = grime;
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);
  }
  ctx.restore();
}

type Job = () => void;

const jobs: Array<[string, Job]> = [
  ['nothing (clear only)', () => {}],

  // Raw fill rate on a presented canvas. THE diagnostic row.
  [
    'fillRect fullscreen x1',
    () => {
      ctx.fillStyle = '#191b1f';
      ctx.fillRect(0, 0, VIEWPORT_WIDTH, VIEWPORT_HEIGHT);
    },
  ],
  [
    'fillRect fullscreen x3',
    () => {
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = i % 2 ? '#191b1f' : '#1b1d21';
        ctx.fillRect(0, 0, VIEWPORT_WIDTH, VIEWPORT_HEIGHT);
      }
    },
  ],

  // What drawGround actually issues: the world rect, under the camera transform.
  ['ground solid (world rect)', () => groundFill(false)],
  ['ground + grime pattern', () => groundFill(true)],

  // The fog, split.
  ['fog: mask work only', () => void fogMask(FOG_MASK_SCALE, true, FOG_BLUR_PX)],
  [
    'fog: blit only (upscale)',
    () => {
      const m = maskFor(FOG_MASK_SCALE).c;
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(m, 0, 0, VIEWPORT_WIDTH, VIEWPORT_HEIGHT);
      ctx.restore();
    },
  ],
  [
    'fog: blit 1:1 (no upscale)',
    () => {
      const m = maskFor(FOG_MASK_SCALE).c;
      ctx.drawImage(m, 0, 0);
    },
  ],
  [
    'fog: WHOLE THING',
    () => {
      const m = fogMask(FOG_MASK_SCALE, true, FOG_BLUR_PX);
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(m, 0, 0, VIEWPORT_WIDTH, VIEWPORT_HEIGHT);
      ctx.restore();
    },
  ],
  [
    'fog: whole, no blur',
    () => {
      const m = fogMask(FOG_MASK_SCALE, false, FOG_BLUR_PX);
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(m, 0, 0, VIEWPORT_WIDTH, VIEWPORT_HEIGHT);
      ctx.restore();
    },
  ],
  [
    'fog: whole, mask 0.25',
    () => {
      const m = fogMask(0.25, true, FOG_BLUR_PX);
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(m, 0, 0, VIEWPORT_WIDTH, VIEWPORT_HEIGHT);
      ctx.restore();
    },
  ],
  [
    'fog: whole, smoothing low',
    () => {
      const m = fogMask(FOG_MASK_SCALE, true, FOG_BLUR_PX);
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'low';
      ctx.drawImage(m, 0, 0, VIEWPORT_WIDTH, VIEWPORT_HEIGHT);
      ctx.restore();
    },
  ],

  // Both together, because back-pressure may only show once a frame is full.
  [
    'ground + grime + fog',
    () => {
      groundFill(true);
      const m = fogMask(FOG_MASK_SCALE, true, FOG_BLUR_PX);
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(m, 0, 0, VIEWPORT_WIDTH, VIEWPORT_HEIGHT);
      ctx.restore();
    },
  ],
];

/**
 * Blocks of frames per configuration, cycled — the same interleaving rule the
 * server harnesses follow. Run each to completion once and a busy interval
 * lands wholly on whichever one was up, which reads exactly like that one being
 * slow.
 */
const BLOCK = 20;
const ROUNDS = 6;
const WARMUP_BLOCKS = 1;

const work = new Map<string, number[]>();
const gaps = new Map<string, number[]>();
for (const [label] of jobs) {
  work.set(label, []);
  gaps.set(label, []);
}

let frame = 0;
let lastAt = 0;

function tick(): void {
  const block = Math.floor(frame / BLOCK);
  const round = Math.floor(block / jobs.length);
  if (round >= ROUNDS + WARMUP_BLOCKS) {
    report(true);
    return;
  }
  const [label, job] = jobs[block % jobs.length];

  const now = performance.now();
  const gap = lastAt > 0 ? now - lastAt : 0;
  lastAt = now;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#0b0d10';
  ctx.fillRect(0, 0, VIEWPORT_WIDTH, VIEWPORT_HEIGHT);

  const t0 = performance.now();
  job();
  const t1 = performance.now();

  if (round >= WARMUP_BLOCKS) {
    work.get(label)!.push(t1 - t0);
    if (gap > 0) gaps.get(label)!.push(gap);
  }

  frame++;
  if (frame % 40 === 0) report(false);
  requestAnimationFrame(tick);
}

function med(a: number[]): number {
  if (a.length === 0) return NaN;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
}
function p90(a: number[]): number {
  if (a.length === 0) return NaN;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(s.length * 0.9))];
}

function report(done: boolean): void {
  const lines: string[] = [];
  lines.push(navigator.userAgent);
  lines.push(
    `\nbackbuffer ${VIEWPORT_WIDTH}x${VIEWPORT_HEIGHT}, IN THE DOM and CSS-scaled to ` +
      `${Math.round(canvas.getBoundingClientRect().width)}x${Math.round(
        canvas.getBoundingClientRect().height,
      )} · presented every frame · no getImageData anywhere`,
  );
  lines.push(`polygon ${poly.length} points · mask ${Math.round(VIEWPORT_WIDTH * FOG_MASK_SCALE)}x${Math.round(VIEWPORT_HEIGHT * FOG_MASK_SCALE)}`);
  lines.push(done ? '\n=== DONE ===' : `\n… running, frame ${frame}`);
  lines.push('\n  what one frame did                   work med   work p90   frame gap med');
  for (const [label] of jobs) {
    const w = work.get(label)!;
    const g = gaps.get(label)!;
    if (w.length === 0) continue;
    lines.push(
      `  ${label.padEnd(34)} ${med(w).toFixed(1).padStart(8)}   ${p90(w)
        .toFixed(1)
        .padStart(8)}   ${med(g).toFixed(1).padStart(8)}`,
    );
  }
  lines.push(
    '\n`work` is the same thing the game\'s `mark()` measures — time inside the draw\n' +
      'calls. `frame gap` is what the browser actually delivered. Figures are clamped\n' +
      'to 1ms in Firefox, so a row reading 0.0 means "under a millisecond".\n' +
      '\nRead `fillRect fullscreen x1` first: if one solid full-screen fill already\n' +
      'costs milliseconds, the cost is fill rate on a presented canvas and the fog is\n' +
      'only the biggest of several full-screen passes.',
  );
  out.textContent = lines.join('\n');
}

/**
 * A page that never composites never gets a rAF callback, and this bench is
 * driven entirely by rAF on purpose — being presented is the thing under test,
 * so it cannot fall back to `setInterval` the way `dogpose` and `roarrig` do.
 * Say so rather than sitting on "measuring…" forever.
 */
setTimeout(() => {
  if (frame === 0) {
    out.textContent =
      'requestAnimationFrame never fired.\n\n' +
      'This page has to be visible and compositing — a background tab, or a\n' +
      'browser pane that is not compositing, throttles rAF to nothing. Bring\n' +
      'the window to the front and reload.';
  }
}, 1500);

requestAnimationFrame(tick);
