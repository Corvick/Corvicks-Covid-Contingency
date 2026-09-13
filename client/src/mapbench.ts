/**
 * What the spectator frame's `map` phase is made of, on a real generated city.
 *
 * `paintbench.ts` measures a synthetic scatter of 620 wall rects with no
 * buildings, floors, doors or loot, which was honest when walls were the
 * dearest layer and stopped being honest when floors and door saddles went in.
 * This one builds the city the real way — `createWorld` + `resetWorld`, the
 * same engine the offline worker runs — and times each call in the `map` block
 * of `main.ts`'s frame on its own, at the spectator's whole-city framing.
 *
 * `issue` is what the HUD's `map` figure counts; `paint` is what lands in the
 * frame gap as `else`. The CONTROL row runs one case twice, and anything
 * smaller than it is not a result.
 *
 * Open `/mapbench.html`.
 */
import { VIEWPORT_WIDTH, VIEWPORT_HEIGHT, setWorldSize } from '../../shared/constants.js';
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
} from './render.js';
import type { Viewport } from './render.js';
import { settings } from './settings.js';
import type { DoorState, PickupState } from '../../shared/types.js';

const out = document.getElementById('out') as HTMLElement;
const canvas = document.createElement('canvas');
canvas.width = VIEWPORT_WIDTH;
canvas.height = VIEWPORT_HEIGHT;
document.body.appendChild(canvas);
const ctx = canvas.getContext('2d')!;

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

type Case = [string, () => void];
const now = 1000;

const cases: Case[] = [
  ['CONTROL: clear only', () => {}],
  ['CONTROL: clear only (again)', () => {}],
  ['drawGround', () => drawGround(ctx, map)],
  ['drawPark', () => map.park && drawPark(ctx, map.park, specView)],
  ['drawPond', () => map.pond && drawPond(ctx, map.pond, specView)],
  [
    'drawFloors, per rect (OLD)',
    () => {
      setFloorsDrawnPerRect(true);
      drawFloors(ctx, map, specView);
      setFloorsDrawnPerRect(false);
    },
  ],
  ['drawFloors', () => drawFloors(ctx, map, specView)],
  ['drawParkingBays', () => drawParkingBays(ctx, map.policeStation, specView)],
  ['drawWalls', () => drawWalls(ctx, map.walls, specView)],
  ['drawWindows', () => drawWindows(ctx, map.windows, broken, specView)],
  ['drawDoors', () => drawDoors(ctx, map.doors, doorStates, specView)],
  ['drawPickups', () => drawPickups(ctx, pickups, specView, now, specScale)],
  ['drawBushes', () => drawBushes(ctx, map.bushes, specView, [], now)],
];

function frame(fn: () => void): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#0b0d10';
  ctx.fillRect(0, 0, VIEWPORT_WIDTH, VIEWPORT_HEIGHT);
  ctx.save();
  ctx.scale(specScale, specScale);
  ctx.translate(-specView.x, -specView.y);
  fn();
  ctx.restore();
}

/**
 * Cheapest whole sample of many, in a rotating order — the two traps
 * `layerbench.ts` records (a fixed order penalises whichever case runs last;
 * the median carries one-sided interference).
 */
const REPEATS = 6;
const ROUNDS = 14;
const best = new Map<string, { issue: number; paint: number }>();

function sample(fn: () => void): { issue: number; paint: number } {
  const t0 = performance.now();
  for (let r = 0; r < REPEATS; r++) frame(fn);
  const t1 = performance.now();
  ctx.getImageData(0, 0, 1, 1);
  const t2 = performance.now();
  return { issue: (t1 - t0) / REPEATS, paint: (t2 - t1) / REPEATS };
}

/**
 * The batched floors against the per-rect ones, pixel for pixel — the claim is
 * "same picture", and a claim about pixels is settled by reading them.
 * Ground under both so the pattern's translucency lands on what it lands on in
 * the game. At the whole-city framing, and at a player's zoom over a dozen
 * spots including the station and the corner complex.
 */
function compareFloors(): string[] {
  const read = (perRect: boolean, view: Viewport, scale: number): Uint8ClampedArray => {
    setFloorsDrawnPerRect(perRect);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0b0d10';
    ctx.fillRect(0, 0, VIEWPORT_WIDTH, VIEWPORT_HEIGHT);
    ctx.save();
    ctx.scale(scale, scale);
    ctx.translate(-view.x, -view.y);
    drawGround(ctx, map);
    drawFloors(ctx, map, view);
    ctx.restore();
    setFloorsDrawnPerRect(false);
    return ctx.getImageData(0, 0, VIEWPORT_WIDTH, VIEWPORT_HEIGHT).data;
  };
  const views: Array<[string, Viewport, number]> = [['whole city', specView, specScale]];
  const zoom = 2;
  const at = (label: string, x: number, y: number) =>
    views.push([
      label,
      { x: x - VIEWPORT_WIDTH / zoom / 2, y: y - VIEWPORT_HEIGHT / zoom / 2, w: VIEWPORT_WIDTH / zoom, h: VIEWPORT_HEIGHT / zoom },
      zoom,
    ]);
  const corner = map.buildings[map.cornerBuilding];
  at('corner complex', corner.x + corner.w / 2, corner.y + corner.h / 2);
  if (map.policeStation) {
    const s = map.buildings[map.policeStation.building];
    at('police station', s.x + s.w / 2, s.y + s.h / 2);
  }
  for (let i = 0; i < 10; i++) {
    const b = map.buildings[(i * 7 + 3) % map.buildings.length];
    at(`building ${(i * 7 + 3) % map.buildings.length}`, b.x + b.w / 2, b.y + b.h / 2);
  }
  /**
   * Every floor rect's outline, 3 screen pixels wide. Footprint rects never
   * overlap but thousands share an edge on non-integer coordinates, and one fill
   * per rect antialiases that edge from both sides — the road shows through as
   * a hairline seam the union path does not have. If that is the whole of the
   * difference, nothing differs off this mask.
   *
   * Measured: 0 off the mask at a player's zoom, in every view of two cities.
   * At the whole-city framing a residue remains that shrinks as the mask widens
   * (1360 px at 3px wide, 258 at 5px) — rects a couple of screen pixels apart,
   * which the mask is too coarse to separate — never more than 8/255.
   * The saddles are drawn per door on both sides for this reason: batched, they
   * moved a few hundred pixels near doors that are not seams.
   */
  const edgeMask = (view: Viewport, scale: number): Uint8ClampedArray => {
    const m = document.createElement('canvas');
    m.width = VIEWPORT_WIDTH;
    m.height = VIEWPORT_HEIGHT;
    const g = m.getContext('2d')!;
    g.scale(scale, scale);
    g.translate(-view.x, -view.y);
    g.strokeStyle = '#fff';
    g.lineWidth = (scale < 1 ? 5 : 3) / scale;
    for (const b of map.buildings) for (const r of b.rects) g.strokeRect(r.x, r.y, r.w, r.h);
    return g.getImageData(0, 0, VIEWPORT_WIDTH, VIEWPORT_HEIGHT).data;
  };

  const lines: string[] = ['\n=== batched floors against per-rect, pixel for pixel ==='];
  let worst = 0;
  let worstOff = 0;
  for (const [label, view, scale] of views) {
    const a = read(true, view, scale);
    const b = read(false, view, scale);
    const mask = edgeMask(view, scale);
    let diff = 0;
    let max = 0;
    let offEdge = 0;
    for (let p = 0; p < a.length; p += 4) {
      let d = 0;
      for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(a[p + c] - b[p + c]));
      if (d === 0) continue;
      diff++;
      if (d > max) max = d;
      if (mask[p + 3] === 0) offEdge++;
    }
    worst = Math.max(worst, max);
    worstOff = Math.max(worstOff, offEdge);
    lines.push(
      `  ${label.padEnd(20)} ${String(diff).padStart(6)} px differ · worst ${max}/255 · ` +
        `${offEdge} of them off a rect edge`,
    );
  }
  lines.push(`  worst anywhere: ${worst}/255 · most off an edge in one view: ${worstOff}`);
  return lines;
}

async function run(): Promise<void> {
  const compared = compareFloors();
  out.textContent = compared.join('\n') + '\n\ntiming…';
  await new Promise((r) => setTimeout(r, 0));
  // Warm every path (patterns, bakes) before anything is timed.
  for (const [, fn] of cases) sample(fn);
  for (let round = 0; round < ROUNDS; round++) {
    const order = cases.map((c, i) => cases[(i + round) % cases.length]);
    for (const [label, fn] of order) {
      const s = sample(fn);
      const prev = best.get(label);
      if (!prev || s.issue + s.paint < prev.issue + prev.paint) best.set(label, s);
    }
    await new Promise((r) => setTimeout(r, 0));
  }

  const ctrl = best.get('CONTROL: clear only')!;
  const ctrl2 = best.get('CONTROL: clear only (again)')!;
  const floor = Math.abs(ctrl.issue + ctrl.paint - (ctrl2.issue + ctrl2.paint));
  const lines: string[] = [];
  lines.push(
    `city ${map.width}x${map.height} · ${map.buildings.length} buildings · ` +
      `${map.buildings.reduce((n, b) => n + b.rects.length, 0)} floor rects · ` +
      `${map.walls.length} walls · ${map.windows.length} windows · ${map.doors.length} doors · ` +
      `${pickups.length} pickups · ${map.bushes.length} bushes`,
  );
  lines.push(`spectator scale ${specScale.toFixed(3)} · noise floor ${floor.toFixed(2)}ms\n`);
  lines.push('  case                          issue   paint   total   (less the clear)');
  const base = ctrl.issue + ctrl.paint;
  for (const [label] of cases) {
    const b = best.get(label)!;
    const total = b.issue + b.paint;
    lines.push(
      `  ${label.padEnd(28)} ${b.issue.toFixed(2).padStart(6)}  ${b.paint.toFixed(2).padStart(6)}  ` +
        `${total.toFixed(2).padStart(6)}   ${(total - base).toFixed(2).padStart(6)}`,
    );
  }
  out.textContent = lines.concat(compared).join('\n');
}

setTimeout(() => void run(), 200);
