/**
 * Where the fog's per-frame cost actually goes.
 *
 * `fogpoly` on the HUD is the *visibility polygon* only, and it is cached — on
 * a standing-still frame it reads 0. Everything else in `drawFog` is paid on
 * **every** frame whatever the cache says: clearing and refilling the mask,
 * filling the polygon through a `blur()` filter with `destination-out`, and
 * blitting the mask up to the backbuffer with smoothing on. A client reporting
 * `fog 11.0` next to `fogPoly 1.0` is spending it in those three, and no amount
 * of further polygon work will touch it.
 *
 * So this times the three separately, at the real mask size and the real
 * radius, and sweeps the two constants that govern them. Same forcing trick as
 * `paintbench.ts`: `getImageData` makes the rasteriser finish, which is what
 * makes the cost measurable in a pane that never composites, and each
 * configuration is drawn REPEATS times behind one readback so the readback's
 * own fixed cost divides away with everything else.
 *
 * **Run it in the browser the game is actually being played in.** That is most
 * of the point of it: `ctx.filter` and `imageSmoothingQuality` are the two
 * canvas features whose cost differs most between engines, and every figure in
 * CLAUDE.md was taken in Chrome.
 *
 * Open `/fogbench.html`.
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

const screen = document.createElement('canvas');
screen.width = VIEWPORT_WIDTH;
screen.height = VIEWPORT_HEIGHT;
const ctx = screen.getContext('2d')!;

/**
 * A city block's worth of walls around the viewer, so the polygon comes out
 * with the vertex count a real one has. A bare circle would understate the
 * path fill, which is the thing the blur is applied to.
 */
const WORLD_W = 5000;
const WORLD_H = 3700;
const px = WORLD_W / 2;
const py = WORLD_H / 2;
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

/**
 * The dog's camera, because that is the seat the report came from — the widest
 * view and the largest sight radius in the game, so the worst honest case.
 */
const zoom = DOG_CAMERA_ZOOM;
const radius = DOG_SIGHT_RADIUS;
const view = {
  x: px - VIEWPORT_WIDTH / zoom / 2,
  y: py - VIEWPORT_HEIGHT / zoom / 2,
  w: VIEWPORT_WIDTH / zoom,
  h: VIEWPORT_HEIGHT / zoom,
};

// Built once, exactly as the cache builds it. This is the part that is *not*
// the per-frame cost; it is here only so the path being filled below is real.
const clipW = VIEWPORT_WIDTH / (2 * zoom) + 400;
const clipH = VIEWPORT_HEIGHT / (2 * zoom) + 400;
const polyStart = performance.now();
const poly = visibilityPolygon(px, py, radius, walls, [], clipW, clipH, false, []);
const polyMs = performance.now() - polyStart;

interface Opts {
  maskScale: number;
  blurPx: number;
  blur: boolean;
  fillPoly: boolean;
  blit: boolean;
  smoothing: 'high' | 'low' | 'off';
}

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

/** `drawFog`, the same in structure, with each piece switchable. */
function fogFrame(o: Opts): void {
  const { c: fogCanvas, g: fogCtx } = maskFor(o.maskScale);
  const m = o.maskScale;
  const s = o.maskScale * zoom;
  const mw = fogCanvas.width;
  const mh = fogCanvas.height;

  fogCtx.setTransform(1, 0, 0, 1, 0, 0);
  fogCtx.clearRect(0, 0, mw, mh);
  fogCtx.fillStyle = 'rgba(4, 6, 9, 0.92)';
  fogCtx.fillRect(0, 0, mw, mh);

  if (o.fillPoly && poly.length > 2) {
    const cx = (px - view.x) * s;
    const cy = (py - view.y) * s;
    const r = radius * s;

    const gradient = fogCtx.createRadialGradient(cx, cy, 0, cx, cy, r);
    gradient.addColorStop(0, 'rgba(0,0,0,1)');
    gradient.addColorStop(0.88, 'rgba(0,0,0,1)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');

    fogCtx.globalCompositeOperation = 'destination-out';
    fogCtx.fillStyle = gradient;
    if (o.blur) fogCtx.filter = `blur(${o.blurPx * m}px)`;

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
  }

  if (o.blit) {
    ctx.imageSmoothingEnabled = o.smoothing !== 'off';
    if (o.smoothing !== 'off') ctx.imageSmoothingQuality = o.smoothing;
    ctx.drawImage(fogCanvas, 0, 0, VIEWPORT_WIDTH, VIEWPORT_HEIGHT);
  }
}

const REPEATS = 6;
const SAMPLES = 12;
const WARMUP = 4;

interface Sample {
  issues: number[];
  totals: number[];
}

/** One batch of one configuration: issue REPEATS frames, then force the raster. */
function once(o: Opts, into: Sample, keep: boolean): void {
  const t0 = performance.now();
  for (let r = 0; r < REPEATS; r++) fogFrame(o);
  const t1 = performance.now();
  ctx.getImageData(0, 0, 1, 1); // forces the queued drawing to be rasterised
  const t2 = performance.now();
  if (keep) {
    into.issues.push((t1 - t0) / REPEATS);
    into.totals.push((t2 - t0) / REPEATS);
  }
}

/**
 * Every configuration measured in one pass, **round-robin**, not one after
 * another to completion.
 *
 * This is the same rule the server harnesses follow and for the same reason:
 * run to completion in sequence and a busy interval — another tab, a GC, the
 * machine deciding to do something else — lands wholly on whichever
 * configuration happened to be running, and reads exactly like that
 * configuration being slow. Interleaved, a bad patch hits all of them. The
 * first version of this bench did it in sequence and reported one variant at
 * 7.4ms against 3.3ms for the same work with one flag changed, which is not a
 * thing a flag can do.
 */
function measureAll(configs: Array<[string, Opts]>): Map<string, { issue: number; paint: number }> {
  const samples = new Map<string, Sample>();
  for (const [label] of configs) samples.set(label, { issues: [], totals: [] });

  for (let i = 0; i < SAMPLES; i++) {
    for (const [label, o] of configs) once(o, samples.get(label)!, i >= WARMUP);
  }

  const results = new Map<string, { issue: number; paint: number }>();
  for (const [label] of configs) {
    const s = samples.get(label)!;
    s.issues.sort((a, b) => a - b);
    s.totals.sort((a, b) => a - b);
    const mid = Math.floor(s.issues.length / 2);
    results.set(label, { issue: s.issues[mid], paint: s.totals[mid] - s.issues[mid] });
  }
  return results;
}


const live: Opts = {
  maskScale: FOG_MASK_SCALE,
  blurPx: FOG_BLUR_PX,
  blur: true,
  fillPoly: true,
  blit: true,
  smoothing: 'high',
};

const LIVE_LABEL = 'LIVE (blur 9, mask 0.5, high)';
const NO_BLUR = 'no blur filter';
const LOW_SMOOTH = 'smoothing low';

const configs: Array<[string, Opts]> = [
  ['mask clear + refill only', { ...live, fillPoly: false, blit: false }],
  ['  + polygon fill, NO blur', { ...live, blur: false, blit: false }],
  ['  + polygon fill, WITH blur', { ...live, blit: false }],
  ['blit only, smoothing high', { ...live, fillPoly: false }],
  [LIVE_LABEL, { ...live }],
  [NO_BLUR, { ...live, blur: false }],
  [LOW_SMOOTH, { ...live, smoothing: 'low' }],
  ['smoothing off (nearest)', { ...live, smoothing: 'off' }],
  ['blur 4 instead of 9', { ...live, blurPx: 4 }],
  ['mask 0.35 instead of 0.5', { ...live, maskScale: 0.35 }],
  ['mask 0.25 instead of 0.5', { ...live, maskScale: 0.25 }],
  ['no blur + smoothing low', { ...live, blur: false, smoothing: 'low' }],
  ['no blur + mask 0.35 + low', { ...live, blur: false, maskScale: 0.35, smoothing: 'low' }],
];

function run(): void {
  const lines: string[] = [];
  lines.push(navigator.userAgent);
  lines.push(
    `\nbackbuffer ${VIEWPORT_WIDTH}x${VIEWPORT_HEIGHT} · mask ${Math.round(
      VIEWPORT_WIDTH * FOG_MASK_SCALE,
    )}x${Math.round(VIEWPORT_HEIGHT * FOG_MASK_SCALE)} · dog zoom ${zoom} · sight radius ${radius}`,
  );
  lines.push(`polygon: ${poly.length} points, built once in ${polyMs.toFixed(2)}ms (cached in the real client)`);

  const r = measureAll(configs);
  const get = (label: string) => {
    const v = r.get(label)!;
    return v.issue + v.paint;
  };

  lines.push('\n  what is being timed                    issue   paint   total');
  for (const [label] of configs) {
    const v = r.get(label)!;
    lines.push(
      `  ${label.padEnd(36)} ${v.issue.toFixed(2).padStart(6)}  ${v.paint.toFixed(2).padStart(6)}  ${(
        v.issue + v.paint
      )
        .toFixed(2)
        .padStart(6)}`,
    );
  }

  const shipped = get(LIVE_LABEL);
  lines.push(
    `\nThe whole of drawFog, every frame: ${shipped.toFixed(2)}ms.` +
      `\n  of which the blur filter is ${(shipped - get(NO_BLUR)).toFixed(2)}ms` +
      `\n  and high-quality smoothing is ${(shipped - get(LOW_SMOOTH)).toFixed(2)}ms`,
  );
  lines.push(
    '\nNone of this is touched by the polygon cache — `fogpoly` on the HUD can read 0.00\n' +
      'and every millisecond above is still paid. `issue` is what lands in the render\n' +
      'loop as the `fog` phase; `paint` normally lands in the frame gap as `elsewhere`,\n' +
      'and a browser painting canvas on the CPU moves it into `issue` instead.\n' +
      '\nRun this page in the browser you play in and compare. That is the finding.',
  );
  out.textContent = lines.join('\n');
}

setTimeout(run, 50);
