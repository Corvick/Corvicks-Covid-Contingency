/**
 * SWAT-ring rig. A canvas and nothing else — no socket and no port, so it
 * leaves a game on 8080 alone.
 *
 * Two claims, both about *pixels* and so neither settled by looking —
 * especially not from here, where rAF is throttled to nothing while the
 * browser pane is not compositing. `getImageData` needs no compositing at all.
 *
 *  - "A SWAT dot cannot be told from the road it stands on, and a white ring
 *    fixes it."
 *  - "A converted SWAT operator is a zombie, not one of yours, and the ring
 *    has to say so" — `world.swat` is never cleared off a turned id, so only
 *    `e.type` tells the two apart. See the `swat-turned` kind below.
 *
 * Everything is drawn on `GROUND_COLOR`, the real road, at the real fully
 * zoomed-out camera scale, through the real `drawEntity`. Results land on
 * `window.rigResult`.
 */
import type { EntityState } from '../../shared/types.js';
import {
  ENTITY_COLOR,
  ENTITY_RADIUS,
  GROUND_COLOR,
  SWAT_COLOR,
  VIEWPORT_HEIGHT,
  VIEWPORT_WIDTH,
} from '../../shared/constants.js';
import { drawEntity, ENTITY_DETAIL_SCALE } from './render.js';

const canvas = document.getElementById('rig') as HTMLCanvasElement;
const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

const ROAD = [0x1b, 0x1d, 0x20];

/** The two ends of the range this drawing is ever used at. */
const FIT_BIG = Math.min(VIEWPORT_WIDTH / 5000, VIEWPORT_HEIGHT / 3700);
const FIT_SMALL = Math.min(VIEWPORT_WIDTH / 3000, VIEWPORT_HEIGHT / 2220);

interface Reading {
  kind: string;
  /** Furthest channel of the body's own colour from the road, 0-255. */
  bodyVsRoad: number;
  /** Screen pixels that differ from the road by more than SEEN. */
  seenPx: number;
  /** Of those, the ones that are the white mark. */
  whitePx: number;
  /** Of those, the ones that are the ring gone zombie-red instead. */
  redRingPx: number;
  /**
   * Visible pixels *inside the dot* — what the body puts down on its own, and
   * so exactly what this drawing produced before the ring. The ring's own
   * antialiased skirt is not the body and must not be counted as it.
   */
  bodyPx: number;
  /** Outer edge of anything drawn, in *screen* pixels from the centre. */
  outerPx: number;
  /** Inner and outer edge of the white mark, in screen pixels. */
  ringInnerPx: number;
  ringOuterPx: number;
  /** Where the dot's own edge is, for the gap between it and the mark. */
  dotPx: number;
  /** The dot's own centre, which the mark must not have repainted. */
  centre: string;
}

interface Result {
  errors: string[];
  fitBig: number;
  fitSmall: number;
  detailScale: number;
  /** SWAT_COLOR against GROUND_COLOR, per channel. */
  swatVsRoad: number[];
  atFitBig: Reading[];
  atFitSmall: Reading[];
  /** A four-man stack: every dot still its own colour, every ring present. */
  squadRings: number;
  squadCentresIntact: number;
  /**
   * The full drawing must be untouched: a SWAT drawn properly puts down no
   * white mark at all, because the ring lives inside the `simple` branch.
   */
  detailWhitePx: number;
}

const result: Result = {
  errors: [],
  fitBig: FIT_BIG,
  fitSmall: FIT_SMALL,
  detailScale: ENTITY_DETAIL_SCALE,
  swatVsRoad: [],
  atFitBig: [],
  atFitSmall: [],
  squadRings: 0,
  squadCentresIntact: 0,
  detailWhitePx: -1,
};

/** Anything this far off the road in any channel is something you can see. */
const SEEN = 24;

function clear(): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = GROUND_COLOR;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function hex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

function offRoad(r: number, g: number, b: number): number {
  return Math.max(Math.abs(r - ROAD[0]), Math.abs(g - ROAD[1]), Math.abs(b - ROAD[2]));
}

function isWhite(r: number, g: number, b: number): boolean {
  return r > 190 && g > 190 && b > 190;
}

/**
 * `world.swat` is never cleared off a converted id, so a body that has
 * actually turned still carries `e.swat` and the black gear — only `e.type`
 * says it is a zombie now. The ring has to read that rather than "swat", or a
 * dot that is hunting you goes on reading as one of yours.
 */
function isZombieRed(r: number, g: number, b: number): boolean {
  const [rr, gg, bb] = [1, 3, 5].map((i) => parseInt(ENTITY_COLOR.zombie.slice(i, i + 2), 16));
  return Math.abs(r - rr) < 20 && Math.abs(g - gg) < 20 && Math.abs(b - bb) < 20;
}

/** Draw one body at sx,sy screen and read back everything it put down. */
function read(
  kind: string,
  e: Partial<EntityState>,
  scale: number,
  sx: number,
  sy: number,
  simple = true,
): Reading {
  const body = {
    id: kind,
    type: 'officer',
    facing: 0,
    health: 100,
    maxHealth: 100,
    ...e,
  } as EntityState;
  // The real camera transform: world units scaled down, nothing else.
  ctx.setTransform(scale, 0, 0, scale, sx, sy);
  drawEntity(ctx, { ...body, x: 0, y: 0 }, false, 0, simple, scale);
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  const half = 40;
  const d = ctx.getImageData(sx - half, sy - half, half * 2, half * 2).data;
  const dotPx = ENTITY_RADIUS[body.type] * scale;
  let seenPx = 0;
  let bodyPx = 0;
  let whitePx = 0;
  let redRingPx = 0;
  let outerPx = 0;
  let ringInnerPx = 999;
  let ringOuterPx = 0;
  for (let i = 0; i < d.length; i += 4) {
    const p = i / 4;
    const px = (p % (half * 2)) - half + 0.5;
    const py = Math.floor(p / (half * 2)) - half + 0.5;
    const dist = Math.hypot(px, py);
    if (offRoad(d[i], d[i + 1], d[i + 2]) <= SEEN) continue;
    seenPx++;
    if (dist <= dotPx) bodyPx++;
    if (dist > outerPx) outerPx = dist;
    if (isWhite(d[i], d[i + 1], d[i + 2])) {
      whitePx++;
      if (dist < ringInnerPx) ringInnerPx = dist;
      if (dist > ringOuterPx) ringOuterPx = dist;
    }
    // Only counted outside the dot's own radius: the body itself is drawn in
    // ENTITY_COLOR.zombie's near-neighbourhood for nothing here, but a
    // converted body's *fill* is still SWAT_COLOR (black) — see the comment
    // on `isZombieRed` — so a red pixel this far out can only be the ring.
    if (dist > dotPx && isZombieRed(d[i], d[i + 1], d[i + 2])) {
      redRingPx++;
      if (dist < ringInnerPx) ringInnerPx = dist;
      if (dist > ringOuterPx) ringOuterPx = dist;
    }
  }
  const c = ctx.getImageData(sx, sy, 1, 1).data;
  const r1 = (v: number) => Math.round(v * 10) / 10;
  return {
    kind,
    bodyVsRoad: offRoad(c[0], c[1], c[2]),
    seenPx,
    whitePx,
    redRingPx,
    bodyPx,
    outerPx: r1(outerPx),
    ringInnerPx: whitePx === 0 ? 0 : r1(ringInnerPx),
    ringOuterPx: r1(ringOuterPx),
    dotPx: r1(dotPx),
    centre: hex(c[0], c[1], c[2]),
  };
}

const KINDS: Array<[string, Partial<EntityState>]> = [
  ['swat', { type: 'officer', npc: true, swat: true }],
  ['soldier', { type: 'officer', npc: true, soldier: true }],
  ['bot', { type: 'officer', bot: true }],
  ['npc officer', { type: 'officer', npc: true }],
  ['civilian', { type: 'human' }],
  ['zombie', { type: 'zombie' }],
  // A converted SWAT operator: `e.type` is 'zombie' but `e.swat` never gets
  // cleared, so the ring is the one thing that has to change to say so.
  ['swat-turned', { type: 'zombie', swat: true }],
];

function run(): void {
  try {
    result.swatVsRoad = [0, 2, 4].map((i) =>
      Math.abs(parseInt(SWAT_COLOR.slice(1 + i, 3 + i), 16) - ROAD[i / 2]),
    );

    clear();
    result.atFitBig = KINDS.map(([k, e], i) => read(k, e, FIT_BIG, 130 + i * 150, 110));
    result.atFitSmall = KINDS.map(([k, e], i) => read(k, e, FIT_SMALL, 130 + i * 150, 250));

    // A four-man stack at the spacing they actually keep station at.
    const swat = { type: 'officer', npc: true, swat: true } as Partial<EntityState>;
    let rings = 0;
    let intact = 0;
    for (let i = 0; i < 4; i++) {
      const r = read(`squad${i}`, swat, FIT_BIG, 200 + i * 70 * FIT_BIG, 400);
      if (r.whitePx > 0) rings++;
      if (r.centre === SWAT_COLOR) intact++;
    }
    result.squadRings = rings;
    result.squadCentresIntact = intact;

    // The control on the other side: the full drawing, which the ring must not
    // have reached into.
    result.detailWhitePx = read('swat-detail', swat, 1, 900, 400, false).whitePx;
  } catch (e) {
    result.errors.push(String(e));
  }

  // Leave a frame to look at: the six kinds side by side on the real road at
  // the real fully-zoomed-out scale.
  clear();
  KINDS.forEach(([k, e], i) => {
    ctx.setTransform(FIT_BIG, 0, 0, FIT_BIG, 150 + i * 150, 540);
    drawEntity(
      ctx,
      {
        id: k,
        type: 'officer',
        facing: 0,
        health: 100,
        maxHealth: 100,
        ...e,
        x: 0,
        y: 0,
      } as EntityState,
      false,
      0,
      true,
      FIT_BIG,
    );
  });
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.font = '12px sans-serif';
  ctx.fillStyle = '#888';
  ctx.textAlign = 'center';
  KINDS.forEach(([k], i) => ctx.fillText(k, 150 + i * 150, 580));

  (window as unknown as Record<string, unknown>).rigResult = result;
  console.log('[swatring]', JSON.stringify(result));
}

setInterval(run, 500);
run();
