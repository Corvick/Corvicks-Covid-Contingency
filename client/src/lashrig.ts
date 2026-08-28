/**
 * Tentacle-strike rig.
 *
 * Drives the real `drawTentacles` (through `drawEntity`), `drawLashWarnings`,
 * `drawLashes`, `drawLashScars` and `drawLashChips` by hand, because none of
 * this can be seen in a live round from here: rAF is throttled to nothing while
 * the browser pane is not compositing, so no frame is ever put on screen.
 * Reading the canvas back with `getImageData` needs no compositing at all,
 * which is what makes this measurable rather than merely lookable-at.
 *
 * It answers what the server-side harness cannot, and every one of these is a
 * claim about pixels that a screenshot could not settle:
 *
 *   - **do the arms actually come off the animal's back**, and do the three
 *     that strike reach out along the line to the landing point while the other
 *     five stay home — the whole ask was that the limbs already on its back are
 *     the ones that go, rather than a line drawn from the middle of it
 *   - **does the coil go the wrong way first**, which is what makes a throw
 *     read as a throw rather than as the arm growing
 *   - does the warning ring put ink down at the impact radius, and does it
 *     visibly fill as the tell runs out
 *   - does a miss leave a mark and throw chips, and do the chips move
 *   - and does any of it throw
 *
 * Results go on `window.rigResult` for `javascript_tool` to read.
 */
import type { EntityState, LashState } from '../../shared/types.js';
import {
  DOG_LASH_IMPACT_RADIUS,
  DOG_MORPH_ART_MUL,
  DOG_ART_RADIUS,
} from '../../shared/constants.js';
import {
  clearLashScars,
  drawEntity,
  drawLashChips,
  drawLashScars,
  drawLashWarnings,
  drawLashes,
  setLashes,
  takeLashImpacts,
} from './render.js';

const canvas = document.getElementById('rig') as HTMLCanvasElement;
const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

const view = { x: 0, y: 0, w: canvas.width, h: canvas.height };

interface Result {
  errors: string[];
  /**
   * How far ink reaches from the dog's centre toward the landing point, as a
   * fraction of the *span* to it, at each phase. Idle is the control.
   */
  reachIdle: number;
  reachCoiling: number;
  reachOut: number;
  reachHome: number;
  /**
   * Where the mass of the drawing sits along the target axis, against idle.
   * Negative is gathered back, positive is thrown forward.
   */
  centroidCoiling: number;
  centroidOut: number;
  coilsBackThenLaunches: boolean;
  /** The five arms that are not striking are still drawn at their idle length. */
  restStayHome: boolean;
  /** Lowest arm-ring ink across eight strike ids, against the idle figure. */
  rearInk: number;
  rearInkIdle: number;
  /** Distinct drawings across those eight — a fixed three would be 1. */
  armSetsSeen: number;
  /** The ring: ink at the rim, and how much brighter it is late in the tell. */
  ringInkAtRim: boolean;
  ringFillsUp: boolean;
  ringInkOutside: boolean;
  /** The impact flash after the arms have landed. */
  flashInk: boolean;
  deflectInk: boolean;
  /** A miss: a mark on the road and chips that move. */
  scarInk: boolean;
  chipInk: boolean;
  chipsMove: boolean;
  /** And the strike is only resolved once, however many frames it is drawn for. */
  resolvedOnce: boolean;
}

const result: Result = {
  errors: [],
  reachIdle: 0,
  reachCoiling: 0,
  reachOut: 0,
  reachHome: 0,
  centroidCoiling: 0,
  centroidOut: 0,
  coilsBackThenLaunches: false,
  restStayHome: false,
  rearInk: 0,
  rearInkIdle: 0,
  armSetsSeen: 0,
  ringInkAtRim: false,
  ringFillsUp: false,
  ringInkOutside: false,
  flashInk: false,
  deflectInk: false,
  scarInk: false,
  chipInk: false,
  chipsMove: false,
  resolvedOnce: false,
};

function px(x: number, y: number): [number, number, number, number] {
  const d = ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data;
  return [d[0], d[1], d[2], d[3]];
}

/** True when this pixel is not the rig's own background. */
function ink(x: number, y: number): boolean {
  const d = px(x, y);
  return d[0] !== 17 || d[1] !== 17 || d[2] !== 17;
}

function clear(): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#111';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

/** How much ink there is in a box, so "brighter" is a number. */
function inkCount(x: number, y: number, half: number): number {
  const d = ctx.getImageData(x - half, y - half, half * 2, half * 2).data;
  let n = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i] !== 17 || d[i + 1] !== 17 || d[i + 2] !== 17) n++;
  }
  return n;
}

/**
 * The mean x of every inked pixel in a box, which is where the mass of the
 * drawing sits along the axis to the landing point.
 */
function inkCentroidX(x: number, y: number, half: number): number {
  const d = ctx.getImageData(x - half, y - half, half * 2, half * 2).data;
  let sum = 0;
  let n = 0;
  const w = half * 2;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i] === 17 && d[i + 1] === 17 && d[i + 2] === 17) continue;
    sum += (i / 4) % w;
    n++;
  }
  return n === 0 ? half : sum / n;
}

const DOG_X = 300;
const DOG_Y = 360;
const TARGET_X = 620;
const TARGET_Y = 360;
const SPAN = TARGET_X - DOG_X;
/** The transformed body, which is what the arms are scaled off. */
const ART_R = DOG_ART_RADIUS * DOG_MORPH_ART_MUL;

function dog(): EntityState {
  return {
    id: 'rig-dog',
    type: 'zombie',
    x: DOG_X,
    y: DOG_Y,
    facing: 0,
    health: 540,
    maxHealth: 540,
    dog: true,
    morph: 1,
  } as EntityState;
}

function strike(phase: 0 | 1 | 2, t: number, hits: LashState['hits'] = []): LashState {
  return {
    id: 1,
    dogId: 'rig-dog',
    x1: DOG_X,
    y1: DOG_Y,
    x2: TARGET_X,
    y2: TARGET_Y,
    r: DOG_LASH_IMPACT_RADIUS,
    phase,
    t,
    hits,
  };
}

/**
 * How far ink reaches from the dog toward the landing point, as a fraction of
 * the span — walked in from the target so a gap in the middle of the arm cannot
 * be mistaken for the end of it.
 */
function reachTowardTarget(): number {
  // One readback for the whole band, for the reason in `armRingInk`.
  const top = DOG_Y - 26;
  const w = Math.ceil(SPAN * 1.04) + 2;
  const h = 53;
  const d = ctx.getImageData(DOG_X, top, w, h).data;
  for (let f = 1.02; f > 0.02; f -= 0.01) {
    const sx = Math.round(SPAN * f);
    if (sx >= w) continue;
    // A band either side of the line, because an arm curls off it.
    for (let sy = 0; sy < h; sy += 2) {
      const k = (sy * w + sx) * 4;
      if (d[k] !== 17 || d[k + 1] !== 17 || d[k + 2] !== 17) {
        return Math.round(f * 100) / 100;
      }
    }
  }
  return 0;
}

/**
 * Ink in a ring at arm distance round the animal, all bearings.
 *
 * The arms are anchored round the trunk and reach out to about `ART_R * 2`, so
 * a ring there is arms and nothing else — the body itself stops well inside it.
 *
 * **One `getImageData` for the whole box, then sampled out of the buffer.**
 * Written as a `getImageData(x, y, 1, 1)` per sample it is ~2,300 readbacks per
 * ring and nine rings a run, which is 21,000 forced GPU round trips — it hung
 * the page outright. Exactly the trap `paintbench.ts` documents: batch the work
 * behind one readback, or measure the readback.
 */
function armRingInk(): number {
  const half = Math.ceil(ART_R * 2.2);
  const w = half * 2;
  const d = ctx.getImageData(DOG_X - half, DOG_Y - half, w, w).data;
  let n = 0;
  for (let i = 0; i < 180; i++) {
    const a = (i / 180) * Math.PI * 2;
    for (let r = ART_R * 1.2; r < ART_R * 2.1; r += 3) {
      const sx = Math.round(half + Math.cos(a) * r);
      const sy = Math.round(half + Math.sin(a) * r);
      const k = (sy * w + sx) * 4;
      if (d[k] !== 17 || d[k + 1] !== 17 || d[k + 2] !== 17) n++;
    }
  }
  return n;
}

/** Draw the dog alone, with whatever strike is set, at one instant. */
function frame(list: LashState[], now: number): void {
  clear();
  setLashes(list);
  drawEntity(ctx, dog(), false, now, false, 1);
}

function run(): void {
  result.errors.length = 0;

  // ---- the arms, phase by phase
  try {
    /*
     * **Reach along a narrow band, measured beyond where an idle arm can go.**
     *
     * An idle arm reaches at most `r * 1.5` off an anchor `r * 0.55` out, which
     * on this staging is about 0.27 of the span — so anything past that on the
     * line to the landing point is a *striking* arm and nothing else. That
     * separation is what makes `reachIdle` a real control rather than a number
     * beside another number.
     */
    frame([], 1000);
    result.reachIdle = reachTowardTarget();

    frame([strike(0, 0.95)], 1000);
    result.reachCoiling = reachTowardTarget();

    frame([strike(1, 1)], 1000);
    result.reachOut = reachTowardTarget();

    frame([strike(2, 0.6)], 1000);
    result.reachHome = reachTowardTarget();

    /**
     * **Recoil then launch, as one number.**
     *
     * The obvious probe — ink behind the animal — cannot see this, and that was
     * the first version: five of the eight arms are idle and they already fan
     * out in every direction, so whatever the three striking ones do is buried
     * under them. It read `coilsBackward: false` for a coil that is working.
     *
     * What does separate them is where the mass of the drawing *sits*. Every
     * arm is anchored round one trunk, so an animal doing nothing has its ink
     * centred on itself; three arms gathering to the back pull the centroid
     * away from the target, and three thrown at it pull the centroid toward it,
     * hard. One axis, one number, and the sign is the claim.
     */
    frame([], 1000);
    const idleC = inkCentroidX(DOG_X, DOG_Y, 130);
    frame([strike(0, 0.95)], 1000);
    result.centroidCoiling = Math.round((inkCentroidX(DOG_X, DOG_Y, 130) - idleC) * 10) / 10;
    frame([strike(1, 1)], 1000);
    result.centroidOut = Math.round((inkCentroidX(DOG_X, DOG_Y, 130) - idleC) * 10) / 10;
    result.coilsBackThenLaunches =
      result.centroidCoiling < 0 && result.centroidOut > 0;

    /**
     * **Some arms always stay, and which three go varies with the strike.**
     *
     * Both halves need many ids rather than one, and the first version used one
     * — which passed while measuring nothing: the striking set is hashed off
     * `LashState.id`, so a single fixed id picks a single fixed three, and the
     * rear ink came back **identical to the pixel** whether a strike was drawn
     * or not. That is the tell that a probe is looking at ground no arm was ever
     * going to be on.
     *
     * Ink in a ring at arm distance, over eight ids: it must never collapse
     * (all eight arms leaving would empty it) and it must not be the same every
     * time (a fixed favourite three would be a drawing with a bias).
     */
    frame([], 1000);
    const idleRing = armRingInk();
    let lowest = Infinity;
    const shapes = new Set<number>();
    for (let id = 1; id <= 8; id++) {
      frame([{ ...strike(1, 1), id }], 1000);
      const n = armRingInk();
      lowest = Math.min(lowest, n);
      shapes.add(n);
    }
    result.rearInk = lowest;
    result.rearInkIdle = idleRing;
    result.armSetsSeen = shapes.size;
    result.restStayHome = lowest > idleRing * 0.4 && shapes.size >= 3;
  } catch (e) {
    result.errors.push('arms: ' + String(e));
  }

  // ---- the warning ring
  try {
    clear();
    drawLashWarnings(ctx, [strike(0, 0.9)], view, 1000);
    const rim = DOG_LASH_IMPACT_RADIUS;
    result.ringInkAtRim = ink(TARGET_X + rim, TARGET_Y);
    // Nothing much past it: the ring is the impact, and ink well outside it
    // would be promising ground the strike does not reach.
    result.ringInkOutside = ink(TARGET_X + rim + 14, TARGET_Y);

    const late = inkCount(TARGET_X, TARGET_Y, rim + 4);
    clear();
    drawLashWarnings(ctx, [strike(0, 0.05)], view, 1000);
    const early = inkCount(TARGET_X, TARGET_Y, rim + 4);
    result.ringFillsUp = late > early;
  } catch (e) {
    result.errors.push('ring: ' + String(e));
  }

  // ---- the impact, and the deflect ring over armour
  try {
    clear();
    drawLashes(ctx, [strike(2, 0.15)], view);
    result.flashInk = inkCount(TARGET_X, TARGET_Y, DOG_LASH_IMPACT_RADIUS) > 0;

    clear();
    drawLashes(
      ctx,
      [strike(2, 0.15, [{ x: TARGET_X + 120, y: TARGET_Y, blocked: 'shield' }])],
      view,
    );
    result.deflectInk = inkCount(TARGET_X + 120, TARGET_Y, 16) > 0;
  } catch (e) {
    result.errors.push('impact: ' + String(e));
  }

  // ---- a miss: the mark and the chips
  try {
    clearLashScars();
    const t0 = 5000;
    // A strike that caught nobody, taken on the edge into phase 2.
    takeLashImpacts([strike(2, 0.1)], t0);
    // And again, to prove it is taken once rather than per frame.
    takeLashImpacts([strike(2, 0.2)], t0 + 33);

    clear();
    drawLashScars(ctx, view, t0 + 100);
    result.scarInk = inkCount(TARGET_X, TARGET_Y, 26) > 0;
    const scarOnce = inkCount(TARGET_X, TARGET_Y, 26);

    clear();
    drawLashChips(ctx, t0 + 60);
    const chipsEarly = inkCount(TARGET_X, TARGET_Y, 30);
    result.chipInk = chipsEarly > 0;

    clear();
    drawLashChips(ctx, t0 + 300);
    const chipsLate = inkCount(TARGET_X, TARGET_Y, 30);
    // They travel outward and fade, so the box right on the impact empties.
    result.chipsMove = chipsLate !== chipsEarly;

    // Resolving twice would lay a second set of gouges on the same spot, which
    // shows up as more ink. Same strike id, so it must not.
    clearLashScars();
    takeLashImpacts([strike(2, 0.1)], t0);
    clear();
    drawLashScars(ctx, view, t0 + 100);
    result.resolvedOnce = inkCount(TARGET_X, TARGET_Y, 26) === scarOnce;
  } catch (e) {
    result.errors.push('miss: ' + String(e));
  }

  /**
   * And a panel to actually look at, because the numbers above say the ink is
   * where it should be and cannot say whether it reads as a limb being thrown.
   *
   * Four rows, one per phase, all at the same staging so the eye can follow one
   * strike down the page: idle, coiled, out, and the impact with a body caught.
   */
  try {
    clear();
    const rows: Array<[string, LashState | null, boolean]> = [
      ['idle — the arms on its back', null, false],
      ['coiled — three drawn back, ring filling', strike(0, 0.85), true],
      ['out — the same three at the ring', strike(1, 1), true],
      ['home — snapping back, impact flash', strike(2, 0.35), false],
    ];
    ctx.font = '13px monospace';
    ctx.textBaseline = 'top';
    for (let i = 0; i < rows.length; i++) {
      const [label, s, warn] = rows[i];
      const dy = 90 + i * 160;
      const shifted = s
        ? { ...s, y1: dy, y2: dy }
        : null;
      ctx.save();
      ctx.translate(0, dy - DOG_Y);
      if (shifted && warn) drawLashWarnings(ctx, [shifted], view, 1000);
      if (shifted && !warn) drawLashes(ctx, [shifted], view);
      setLashes(shifted ? [shifted] : []);
      drawEntity(ctx, dog(), false, 1000, false, 1);
      ctx.restore();
      ctx.fillStyle = '#8b93a0';
      ctx.fillText(label, 700, dy - 8);
    }
    setLashes([]);
  } catch (e) {
    result.errors.push('panel: ' + String(e));
  }

  (window as unknown as Record<string, unknown>).rigResult = result;
  console.log('[lashrig]', JSON.stringify(result));
}


// `setInterval` rather than rAF, which is throttled to nothing while the
// browser pane is not compositing.
setInterval(run, 3000);
run();
