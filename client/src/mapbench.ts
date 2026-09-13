/**
 * What the `map` phase is made of, on a real generated city — timed on the
 * renderer the game actually uses.
 *
 * `paintbench.ts` measures a synthetic scatter of 620 wall rects with no
 * buildings, floors, doors or loot. This one builds the city the real way —
 * `createWorld` + `resetWorld`, the same engine the offline worker runs — and
 * times the calls in the `map` block of `main.ts`'s frame one at a time, at a
 * spectator's whole-city framing and at a player's zoom.
 *
 * **It forces the rasteriser with a WebGL upload, never with `getImageData`,
 * and that is the most important line in this file.** Chrome moves a 2D canvas
 * that is read back onto the *CPU*, and every earlier bench here reads back —
 * so what they measured was the software rasteriser, on a machine whose game
 * canvas is on the GPU. The same ground fill measured **11-42ms** that way and
 * **~1.5ms** this way on an Intel Iris Xe, and a floor change measured 20x on
 * one and ~1.2x on the other. `texImage2D` of the canvas makes it render and
 * `readPixels` of one texel waits for the GPU, without ever reading the 2D
 * canvas itself. The game never reads back its own canvas, so this is the
 * figure a player gets — unless the browser has no GPU at all, which the
 * renderer line at the top says.
 *
 * Each sample is one frame and one flush — not several frames behind one
 * flush, because a GPU canvas throws away everything under a full-canvas
 * opaque fill and would report the repeats as free. The flush itself costs
 * milliseconds, which is what the CONTROL rows are: the same empty frame
 * twice, so their difference is the noise floor and their value is subtracted.
 *
 * The pixel comparisons run on a separate canvas that *is* read back.
 *
 * Open `/mapbench.html`.
 */
import { VIEWPORT_WIDTH, VIEWPORT_HEIGHT, CAMERA_ZOOM, setWorldSize } from '../../shared/constants.js';
import { createWorld, resetWorld } from '../../server/src/world.js';
import { allDoorsToWire } from '../../server/src/doors.js';
import {
  drawGround,
  drawPark,
  drawPond,
  drawFloors,
  drawParkingBays,
  drawWalls,
  drawWindows,
  drawDoors,
  drawPickups,
  drawBushes,
  setFloorsDrawnPerRect,
  setGroundDrawnInTwoPasses,
} from './render.js';
import type { Viewport } from './render.js';
import { settings } from './settings.js';
import type { DoorState, PickupState } from '../../shared/types.js';

const out = document.getElementById('out') as HTMLElement;

// A bench that reads the saved settings of the box it runs on lies on exactly
// the box being investigated — LOW GRAPHICS would report floors as free.
settings.groundDetail = true;

const world = createWorld();
resetWorld(world);
const map = world.map;
setWorldSize(map.width, map.height);

const doorStates = new Map<number, DoorState>();
for (const d of allDoorsToWire(world)) doorStates.set(d.i, d);
const pickups: PickupState[] = [...world.pickups.values()].map((p) => ({
  id: p.id,
  item: p.item,
  x: p.x,
  y: p.y,
})) as PickupState[];
const broken = new Set<number>();

const specScale = Math.min(VIEWPORT_WIDTH / map.width, VIEWPORT_HEIGHT / map.height);
const specView: Viewport = {
  x: map.width / 2 - VIEWPORT_WIDTH / specScale / 2,
  y: map.height / 2 - VIEWPORT_HEIGHT / specScale / 2,
  w: VIEWPORT_WIDTH / specScale,
  h: VIEWPORT_HEIGHT / specScale,
};
const viewAt = (x: number, y: number, zoom: number): Viewport => ({
  x: x - VIEWPORT_WIDTH / zoom / 2,
  y: y - VIEWPORT_HEIGHT / zoom / 2,
  w: VIEWPORT_WIDTH / zoom,
  h: VIEWPORT_HEIGHT / zoom,
});
// A player in the thick of it: centred on the corner complex, so the floors
// under the camera are as many as a player ever has.
const corner = map.buildings[map.cornerBuilding];
const playerView = viewAt(corner.x + corner.w / 2, corner.y + corner.h / 2, CAMERA_ZOOM);

// ---- the GPU flush

const glCanvas = document.createElement('canvas');
glCanvas.width = 4;
glCanvas.height = 4;
const gl = (glCanvas.getContext('webgl2') ?? glCanvas.getContext('webgl')) as WebGLRenderingContext | null;
const texel = new Uint8Array(4);
let renderer = 'no WebGL — timings below are not GPU timings';
if (gl) {
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  renderer = String(dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
  gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
}
function flush(c: HTMLCanvasElement): void {
  if (!gl) return;
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
  gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, texel);
}

// Never read back, so it stays wherever the browser would put the game's.
const canvas = document.createElement('canvas');
canvas.width = VIEWPORT_WIDTH;
canvas.height = VIEWPORT_HEIGHT;
const ctx = canvas.getContext('2d')!;

type Case = [string, () => void];
const now = 1000;

function casesFor(view: Viewport, scale: number): Case[] {
  return [
    ['CONTROL: clear only', () => {}],
    ['CONTROL: clear only (again)', () => {}],
    [
      'drawGround, two passes (OLD)',
      () => {
        setGroundDrawnInTwoPasses(true);
        drawGround(ctx, map);
        setGroundDrawnInTwoPasses(false);
      },
    ],
    ['drawGround', () => drawGround(ctx, map)],
    [
      'drawFloors, per rect (OLD)',
      () => {
        setFloorsDrawnPerRect(true);
        drawFloors(ctx, map, view);
        setFloorsDrawnPerRect(false);
      },
    ],
    ['drawFloors', () => drawFloors(ctx, map, view)],
    ['drawPark', () => map.park && drawPark(ctx, map.park, view)],
    ['drawPond', () => map.pond && drawPond(ctx, map.pond, view)],
    ['drawParkingBays', () => drawParkingBays(ctx, map.policeStation, view)],
    ['drawWalls', () => drawWalls(ctx, map.walls, view)],
    ['drawWindows', () => drawWindows(ctx, map.windows, broken, view)],
    ['drawDoors', () => drawDoors(ctx, map.doors, doorStates, view)],
    ['drawPickups', () => drawPickups(ctx, pickups, view, now, scale)],
    ['drawBushes', () => drawBushes(ctx, map.bushes, view, [], now)],
  ];
}

function sample(view: Viewport, scale: number, fn: () => void): { issue: number; total: number } {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#0b0d10';
  ctx.fillRect(0, 0, VIEWPORT_WIDTH, VIEWPORT_HEIGHT);
  flush(canvas);
  const t0 = performance.now();
  ctx.save();
  ctx.scale(scale, scale);
  ctx.translate(-view.x, -view.y);
  fn();
  ctx.restore();
  const t1 = performance.now();
  flush(canvas);
  return { issue: t1 - t0, total: performance.now() - t0 };
}

/**
 * Cheapest sample of many, in a rotating order — the two traps `layerbench.ts`
 * records (a fixed order penalises whichever case runs last; the median carries
 * one-sided interference).
 */
const ROUNDS = 40;

async function timeView(label: string, view: Viewport, scale: number): Promise<string[]> {
  const cases = casesFor(view, scale);
  const best = new Map<string, { issue: number; total: number }>();
  for (const [, fn] of cases) sample(view, scale, fn); // warm patterns and paths
  for (let round = 0; round < ROUNDS; round++) {
    for (let i = 0; i < cases.length; i++) {
      const [name, fn] = cases[(i + round) % cases.length];
      const s = sample(view, scale, fn);
      const prev = best.get(name);
      if (!prev || s.total < prev.total) best.set(name, s);
    }
    if (round % 5 === 4) await new Promise((r) => setTimeout(r, 0));
  }
  const a = best.get('CONTROL: clear only')!.total;
  const b = best.get('CONTROL: clear only (again)')!.total;
  const base = Math.min(a, b);
  const lines = [
    `\n=== ${label} (scale ${scale.toFixed(3)}) · noise floor ${Math.abs(a - b).toFixed(2)}ms ===`,
    '  case                            issue   cost less the clear',
  ];
  for (const [name] of cases) {
    const s = best.get(name)!;
    lines.push(`  ${name.padEnd(30)} ${s.issue.toFixed(2).padStart(6)}   ${(s.total - base).toFixed(2).padStart(6)}`);
  }
  return lines;
}

// ---- pixels, on a canvas that is read back

const readCanvas = document.createElement('canvas');
readCanvas.width = VIEWPORT_WIDTH;
readCanvas.height = VIEWPORT_HEIGHT;
const rctx = readCanvas.getContext('2d', { willReadFrequently: true })!;

function read(view: Viewport, scale: number, draw: () => void): Uint8ClampedArray {
  rctx.setTransform(1, 0, 0, 1, 0, 0);
  rctx.fillStyle = '#0b0d10';
  rctx.fillRect(0, 0, VIEWPORT_WIDTH, VIEWPORT_HEIGHT);
  rctx.save();
  rctx.scale(scale, scale);
  rctx.translate(-view.x, -view.y);
  draw();
  rctx.restore();
  return rctx.getImageData(0, 0, VIEWPORT_WIDTH, VIEWPORT_HEIGHT).data;
}

function comparisonViews(): Array<[string, Viewport, number]> {
  const views: Array<[string, Viewport, number]> = [['whole city', specView, specScale]];
  const zoom = CAMERA_ZOOM;
  views.push(['corner complex', playerView, zoom]);
  if (map.policeStation) {
    const s = map.buildings[map.policeStation.building];
    views.push(['police station', viewAt(s.x + s.w / 2, s.y + s.h / 2, zoom), zoom]);
  }
  for (let i = 0; i < 10; i++) {
    const n = (i * 7 + 3) % map.buildings.length;
    const b = map.buildings[n];
    views.push([`building ${n}`, viewAt(b.x + b.w / 2, b.y + b.h / 2, zoom), zoom]);
  }
  return views;
}

/**
 * An old drawing against its replacement, pixel for pixel, at the whole-city
 * framing and at a player's zoom over a dozen spots.
 *
 * Both replacements lay a translucent tile onto an opaque colour once, when the
 * tile is built, instead of on every frame — and compositing before sampling is
 * the same arithmetic as sampling and compositing after, so the only difference
 * allowed is 8-bit rounding. Measured: **worst 2/255** for the ground and
 * **4/255** for the floors, anywhere.
 */
function comparePixels(title: string, old: (view: Viewport) => void, now: (view: Viewport) => void): string[] {
  const lines = [`\n=== ${title}, pixel for pixel ===`];
  let worst = 0;
  for (const [label, view, scale] of comparisonViews()) {
    const a = read(view, scale, () => old(view));
    const b = read(view, scale, () => now(view));
    let diff = 0;
    let max = 0;
    for (let p = 0; p < a.length; p += 4) {
      let d = 0;
      for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(a[p + c] - b[p + c]));
      if (d > 0) diff++;
      if (d > max) max = d;
    }
    worst = Math.max(worst, max);
    lines.push(`  ${label.padEnd(20)} ${String(diff).padStart(7)} px differ · worst ${max}/255`);
  }
  lines.push(`  worst anywhere: ${worst}/255`);
  return lines;
}

const gated = (set: (on: boolean) => void, draw: () => void) => {
  set(true);
  draw();
  set(false);
};

async function run(): Promise<void> {
  const header = [
    `renderer: ${renderer}`,
    `city ${map.width}x${map.height} · ${map.buildings.length} buildings · ` +
      `${map.buildings.reduce((n, b) => n + b.rects.length, 0)} floor rects · ` +
      `${map.walls.length} walls · ${map.windows.length} windows · ${map.doors.length} doors · ` +
      `${pickups.length} pickups · ${map.bushes.length} bushes`,
  ];
  const lines = [...header];
  const show = (note = '') => (out.textContent = lines.join('\n') + note);
  show('\n\ntiming…');
  await new Promise((r) => setTimeout(r, 0));
  lines.push(...(await timeView('SPECTATOR, whole city', specView, specScale)));
  show('\n\ntiming…');
  lines.push(...(await timeView('PLAYER, over the corner complex', playerView, CAMERA_ZOOM)));
  show('\n\ncomparing pixels…');
  await new Promise((r) => setTimeout(r, 0));
  lines.push(
    ...comparePixels(
      'one-pass ground against two-pass',
      () => gated(setGroundDrawnInTwoPasses, () => drawGround(rctx, map)),
      () => drawGround(rctx, map),
    ),
  );
  // Ground under both, so the floors land on what they land on in the game.
  lines.push(
    ...comparePixels(
      'one fill a floor rect against two',
      (view) => {
        drawGround(rctx, map);
        gated(setFloorsDrawnPerRect, () => drawFloors(rctx, map, view));
      },
      (view) => {
        drawGround(rctx, map);
        drawFloors(rctx, map, view);
      },
    ),
  );
  lines.push('\n(done)');
  show();
}

setTimeout(() => void run(), 200);
