/**
 * What the client actually spends *painting*, as against issuing commands.
 *
 * `render` on the HUD times the canvas calls. Rasterising them happens after
 * rAF returns, during compositing, so it lands in the frame gap as `elsewhere`
 * and no amount of profiling the render loop will show it. `getImageData`
 * forces the canvas to be rasterised there and then, which is what makes the
 * cost measurable at all — and measurable in a pane that never composites.
 *
 * Open `/paintbench.html`.
 */
import { VIEWPORT_WIDTH, VIEWPORT_HEIGHT, CAMERA_ZOOM } from '../../shared/constants.js';
import { drawGround, drawVignette, drawEntity, drawWalls, drawPickups, ENTITY_DETAIL_SCALE } from './render.js';
import type { EntityState, MapData, Wall, PickupState } from '../../shared/types.js';
import type { Viewport } from './render.js';

const out = document.getElementById('out') as HTMLElement;
const canvas = document.createElement('canvas');
canvas.width = VIEWPORT_WIDTH;
canvas.height = VIEWPORT_HEIGHT;
document.body.appendChild(canvas);
const ctx = canvas.getContext('2d', { willReadFrequently: false })!;

const WORLD_W = 5000;
const WORLD_H = 3700;

/** Enough of a map for the ground and walls to be honest about their cost. */
const walls: Wall[] = [];
let seed = 12345;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
for (let i = 0; i < 620; i++) {
  const horizontal = rnd() < 0.5;
  walls.push({
    x: rnd() * WORLD_W,
    y: rnd() * WORLD_H,
    w: horizontal ? 60 + rnd() * 260 : 8,
    h: horizontal ? 8 : 60 + rnd() * 260,
  });
}
const map = {
  width: WORLD_W,
  height: WORLD_H,
  walls,
  windows: [],
  bushes: [],
  buildings: [],
  doors: [],
  park: null,
  pond: null,
  seed: 1,
} as unknown as MapData;

const entities: EntityState[] = [];
for (let i = 0; i < 500; i++) {
  entities.push({
    id: `human-${i}`,
    type: rnd() < 0.05 ? 'zombie' : 'human',
    x: rnd() * WORLD_W,
    y: rnd() * WORLD_H,
    facing: rnd() * Math.PI * 2,
    health: 100,
  } as EntityState);
}

/** Two cameras: a player at 1:1 zoomed in, and a spectator framing the city. */
const playerScale = CAMERA_ZOOM;
const playerView: Viewport = {
  x: WORLD_W / 2 - VIEWPORT_WIDTH / playerScale / 2,
  y: WORLD_H / 2 - VIEWPORT_HEIGHT / playerScale / 2,
  w: VIEWPORT_WIDTH / playerScale,
  h: VIEWPORT_HEIGHT / playerScale,
};
const specScale = Math.min(VIEWPORT_WIDTH / WORLD_W, VIEWPORT_HEIGHT / WORLD_H);
const specView: Viewport = { x: 0, y: 0, w: VIEWPORT_WIDTH / specScale, h: VIEWPORT_HEIGHT / specScale };

interface Layers {
  groundSolid: boolean;
  grime: boolean;
  walls: boolean;
  entities: boolean;
  vignette: boolean;
}

function frame(view: Viewport, scale: number, L: Layers): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#0b0d10';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  ctx.scale(scale, scale);
  ctx.translate(-view.x, -view.y);

  if (L.groundSolid && !L.grime) {
    // The solid half of drawGround on its own, to separate it from the pattern.
    ctx.fillStyle = '#191b1f';
    ctx.fillRect(0, 0, map.width, map.height);
  } else if (L.grime) {
    drawGround(ctx, map); // solid fill + the grime pattern over it
  }
  if (L.walls) drawWalls(ctx, map.walls, view);
  if (L.entities) {
    const simple = scale < ENTITY_DETAIL_SCALE;
    const cull = 40;
    for (const e of entities) {
      if (e.x + cull < view.x || e.x - cull > view.x + view.w) continue;
      if (e.y + cull < view.y || e.y - cull > view.y + view.h) continue;
      drawEntity(ctx, e, false, 0, simple);
    }
  }
  ctx.restore();

  if (L.vignette) drawVignette(ctx, VIEWPORT_WIDTH, VIEWPORT_HEIGHT);
}

/**
 * Issue the commands, then force the rasteriser to finish, and time both.
 *
 * `getImageData` carries a fixed readback cost of its own — several
 * milliseconds, which is the same order as the thing being measured and made
 * the first version of this bench report "no grime" as *slower* than "all on".
 * So each configuration is drawn `REPEATS` times behind one readback, and the
 * fixed cost is divided away with everything else.
 */
const REPEATS = 8;
function measure(view: Viewport, scale: number, L: Layers): { issue: number; paint: number } {
  const issues: number[] = [];
  const totals: number[] = [];
  for (let i = 0; i < 20; i++) {
    const t0 = performance.now();
    for (let r = 0; r < REPEATS; r++) frame(view, scale, L);
    const t1 = performance.now();
    ctx.getImageData(0, 0, 1, 1); // forces the queued drawing to be rasterised
    const t2 = performance.now();
    if (i >= 5) {
      issues.push((t1 - t0) / REPEATS);
      totals.push((t2 - t0) / REPEATS);
    }
  }
  issues.sort((a, b) => a - b);
  totals.sort((a, b) => a - b);
  const mid = Math.floor(issues.length / 2);
  return { issue: issues[mid], paint: totals[mid] - issues[mid] };
}

const base: Layers = { groundSolid: false, grime: false, walls: false, entities: false, vignette: false };
const lines: string[] = [];

function run(label: string, view: Viewport, scale: number): void {
  lines.push(`\n=== ${label} — ${VIEWPORT_WIDTH}x${VIEWPORT_HEIGHT} backbuffer ===`);
  lines.push('  layer added                 issue    paint    total');
  const all: Layers = { groundSolid: true, grime: true, walls: true, entities: true, vignette: true };
  const steps: Array<[string, Layers]> = [
    ['clear only (floor)', { ...base }],
    ['ground, solid fill', { ...base, groundSolid: true }],
    ['ground WITH grime', { ...base, grime: true }],
    ['walls only', { ...base, walls: true }],
    ['entities only', { ...base, entities: true }],
    ['vignette only', { ...base, vignette: true }],
    ['-- everything on --', { ...all }],
    ['everything, NO grime', { ...all, grime: false }],
    ['everything, NO vignette', { ...all, vignette: false }],
    ['everything, NO entities', { ...all, entities: false }],
    ['everything, NO walls', { ...all, walls: false }],
  ];
  for (const [label2, L] of steps) {
    const r = measure(view, scale, L);
    lines.push(
      `  ${label2.padEnd(26)} ${r.issue.toFixed(2).padStart(6)}  ${r.paint.toFixed(2).padStart(6)}  ${(r.issue + r.paint).toFixed(2).padStart(6)}`,
    );
  }
  out.textContent = lines.join('\n');
}

/**
 * The other per-frame work that sits outside the timed render block.
 *
 * `render` stops before the HUD is written, and both of these are DOM writes
 * that force style, layout and a paint of the page itself — every frame,
 * whatever the canvas is doing. Anything here lands in `elsewhere` alongside
 * the rasteriser.
 */
function runDom(): void {
  const perf = document.createElement('div');
  const plain = document.createElement('div');
  perf.style.cssText = 'position:absolute;top:0;right:0;font:12px monospace';
  document.body.append(perf, plain);

  const html =
    `<span class="a">57 fps</span> · spike 19ms<br>` +
    `<span class="b">tick 20.68ms</span> / 33.3ms<br>` +
    `fogpoly 0.00ms · 511 drawn<br>` +
    `gap 29.2 = <span class="c">render 4.5</span> + net 1.0 + else 23.8<br>` +
    `1285KB/s in<br>` +
    `map 2.7 · entities 1.6 · effects 0.1 · fog 0.0 · hud 0.1`;
  const text = 'SPECTATING (WASD pan · shift faster · scroll zoom) — survivors 506 · incubating 4 · zombies 5';

  const time = (label: string, fn: () => void): void => {
    for (let i = 0; i < 40; i++) fn();
    const runs: number[] = [];
    for (let i = 0; i < 60; i++) {
      const t0 = performance.now();
      fn();
      // Reading a layout property forces the style/layout the write queued,
      // which is otherwise deferred to the end of the frame and invisible here.
      void document.body.offsetHeight;
      runs.push(performance.now() - t0);
    }
    runs.sort((a, b) => a - b);
    lines.push(`  ${label.padEnd(34)} ${runs[30].toFixed(3)}ms`);
  };

  lines.push(`\n=== per-frame DOM, outside the render block ===`);
  let n = 0;
  time('perfHud.innerHTML (6 lines, spans)', () => {
    perf.innerHTML = html + (n++ % 2 ? '' : ' ');
  });
  time('hud.textContent (one line)', () => {
    plain.textContent = text + (n++ % 2 ? '' : ' ');
  });
  time('both, as render() does it', () => {
    perf.innerHTML = html + (n % 2 ? '' : ' ');
    plain.textContent = text + (n++ % 2 ? '' : ' ');
  });
  perf.remove();
  plain.remove();
  out.textContent = lines.join('\n');
}

/**
 * `drawPickups` was the dearest function in the client: it set `ctx.font` — a
 * CSS font-string parse — once per item per frame, and drew a 7px label that is
 * about a pixel across once the city is framed. This is the before and after.
 */
function runPickups(): void {
  const items: PickupState[] = [];
  for (let i = 0; i < 120; i++) {
    items.push({
      id: `loot-${i}`,
      item: (['pistol', 'boltRifle', 'kevlar', 'shotgun', 'radio'] as const)[i % 5],
      x: rnd() * WORLD_W,
      y: rnd() * WORLD_H,
    } as PickupState);
  }

  const time = (label: string, fn: () => void): number => {
    for (let i = 0; i < 8; i++) fn();
    const runs: number[] = [];
    for (let i = 0; i < 20; i++) {
      const t0 = performance.now();
      for (let r = 0; r < REPEATS; r++) fn();
      ctx.getImageData(0, 0, 1, 1);
      runs.push((performance.now() - t0) / REPEATS);
    }
    runs.sort((a, b) => a - b);
    lines.push(`  ${label.padEnd(38)} ${runs[10].toFixed(3)}ms`);
    return runs[10];
  };

  const frameWith = (view: Viewport, scale: number, s: number): void => {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0b0d10';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(scale, scale);
    ctx.translate(-view.x, -view.y);
    drawPickups(ctx, items, view, 0, s);
    ctx.restore();
  };

  lines.push(`\n=== ${items.length} pickups, the whole city framed ===`);
  // Forcing the label on at spectator scale is what the old code always did.
  time('with labels (what it used to do)', () => frameWith(specView, specScale, 1));
  time('labels dropped below 0.5 scale', () => frameWith(specView, specScale, specScale));
  lines.push(`\n=== ${items.length} pickups at a player's zoom (labels kept) ===`);
  time('labels drawn', () => frameWith(playerView, playerScale, playerScale));
  out.textContent = lines.join('\n');
}

setTimeout(() => {
  run('SPECTATOR (whole city framed)', specView, specScale);
  run('PLAYER (1:1, CAMERA_ZOOM)', playerView, playerScale);
  runPickups();
  runDom();
  lines.push('\n(paint = time the rasteriser needed once the commands were in;');
  lines.push(' this is the part that lands in the frame gap as `elsewhere`.)');
  out.textContent = lines.join('\n');
}, 200);
