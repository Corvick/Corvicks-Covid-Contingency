/**
 * Sprawled-corpse rig. A canvas and nothing else — no socket and no port, so it
 * leaves a game on 8080 alone.
 *
 * Two claims, and neither can be settled by looking: rAF is throttled to
 * nothing while the browser pane is not compositing, so no frame of a real
 * round can be put on screen from here. `getImageData` needs none.
 *
 *  1. **A corpse has four limbs.** Reported as *"zombie corpse missing arm"*,
 *     and the drawing said exactly that — three strokes, at `a + 2.5`,
 *     `a - 1.7` and `a - 2.7`, which is a left leg, a right arm and a right leg
 *     with the whole forward-left quadrant left empty.
 *  2. **They fall differently on every body, and the arms fall further than the
 *     legs.** Hashed off the corpse's own seed rather than rolled, so the same
 *     body draws the same way on every frame and again when it is baked.
 *
 * The reading is **reach per bearing**, the same sweep `acidcheck` walks round
 * a cloud: for each of 360 bearings out of the body's centre, how far out the
 * furthest ink is. A limb is a peak; a quadrant with nothing in it is a run of
 * bearings that stop at the torso. The fault was one such run a quarter of the
 * circle wide.
 *
 * Everything goes through the real `spawnCorpse` and `drawZombieCorpses` — the
 * public path, so nothing had to be exported for the rig to reach it. Results
 * land on `window.rigResult`; open `/corpserig.html` on the dev server to look.
 */
import {
  CORPSE_GREY_MS,
  CORPSE_SLIDE_MS,
  CORPSE_SLIDE_PX,
  ENTITY_RADIUS,
  GROUND_COLOR,
} from '../../shared/constants.js';
import { clearBlood, drawZombieCorpses, setThreeLimbedCorpse, spawnCorpse } from './render.js';
import { settings } from './settings.js';

const canvas = document.getElementById('rig') as HTMLCanvasElement;
const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

const R = ENTITY_RADIUS.zombie;
const BEARINGS = 360;
/**
 * Past the torso, so the reading is limbs rather than the body.
 *
 * The torso ellipse reaches `1.15r` along the body's own axis. Straight ahead
 * the head sits at `1.05r` with a radius of `0.44r` and so reaches `1.49r` on
 * its own — the forward sector is expected to read long in both modes and is
 * not evidence of an arm. What the run is about is the sides and the back.
 */
const LIMB_AT = 1.35;
const OUT_TO = 2.6;
/**
 * Where each limb nominally lies, in degrees off the body's facing, and the
 * sector each one is looked for in.
 *
 * **The sectors are the midpoints between neighbouring limbs, not a fixed
 * window round each**, and that was a fault in this rig before it was anything
 * else. A flat ±42° window overlaps for the two legs — they are only 62° apart
 * across the back — so one leg's search found the *other* leg's tail and the
 * rig reported a leg that had swung 41°, on a drawing whose legs cannot move
 * more than 15. It read the legs as swinging exactly as far as the arms.
 *
 * The forward band is cut out of the left arm's sector for the same class of
 * reason: the head sits at 0° and reaches 1.49r on its own, which clears the
 * limb threshold, so an arm's sector that included it would sometimes measure
 * the head.
 */
const BASES = [71.6, -97.4, 143.2, -154.7];
/** [from, to] going anticlockwise-positive, in degrees off the facing. */
const SECTORS: Array<[number, number]> = [
  [25, 107.4],
  [-126.05, -12.9],
  [107.4, 174.25],
  [174.25, -126.05],
];
const ARMS = [0, 1];
const LEGS = [2, 3];
/** The head reaches past the torso on its own; it is not an arm. */
const HEAD_BAND = 25;
/** Long past `CORPSE_SLIDE_MS + CORPSE_GREY_MS`, so the body has settled. */
const SETTLED = (CORPSE_SLIDE_MS + CORPSE_GREY_MS) * 20;

const f1 = (n: number): string => n.toFixed(1);

interface Sweep {
  /** Bearings whose reach clears `LIMB_AT`, as a share of the circle. */
  covered: number;
  /** The widest unbroken run of bearings with nothing but torso, in degrees. */
  widestGap: number;
  /**
   * Runs of bearings that clear it, the head's included.
   *
   * Reported rather than checked: the head is one of them, so this is limbs
   * **plus one** and reads as an off-by-one unless you know that. What the
   * claim is made on is `peaks`, which is looked for per limb and comes back
   * null for one that is not there.
   */
  runs: number;
  /** How many of the four limbs were found at all. */
  limbs: number;
  /** Where each limb's peak reach is, in degrees off the body's facing. */
  peaks: Array<number | null>;
  /** Ink anywhere at all, as a floor under everything else. */
  ink: number;
}

interface Result {
  errors: string[];
  old: Sweep[];
  now: Sweep[];
  /** How far each limb strayed from its base across the seeds, in degrees. */
  armSwing: number;
  legSwing: number;
  /** Distinct drawings out of the seeds swept. */
  distinct: number;
  /** Widest bare run, median, old then new. */
  gapMedian: [number, number];
  /** The same seed twice: a corpse must not redraw itself differently. */
  stable: boolean;
}

const result: Result = {
  errors: [],
  old: [],
  now: [],
  armSwing: 0,
  legSwing: 0,
  distinct: 0,
  gapMedian: [0, 0],
  stable: false,
};

function clear(): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = GROUND_COLOR;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function wrap(deg: number): number {
  let d = deg;
  while (d > 180) d -= 360;
  while (d <= -180) d += 360;
  return d;
}

/**
 * Draw one settled corpse and sweep it.
 *
 * **The sweep's origin is where the body ended up, not where it was put.** A
 * corpse slides `CORPSE_SLIDE_PX` along the round before it settles; swept
 * round the spawn point instead, every bearing on one side reads long and every
 * bearing on the other reads short, and the profile is the slide rather than
 * the drawing. `CORPSE_SLIDE_PX` is imported rather than copied so it cannot
 * drift out of step.
 */
function sweep(a: number, three: boolean, seedX: number, seedT: number): Sweep {
  setThreeLimbedCorpse(three);
  clearBlood();
  clear();

  const spawnX = canvas.width / 2 + seedX;
  const spawnY = canvas.height / 2;
  spawnCorpse(spawnX, spawnY, a, seedT);
  const view = { x: 0, y: 0, w: canvas.width, h: canvas.height };
  drawZombieCorpses(ctx, view, seedT + SETTLED);

  const cx = spawnX + Math.cos(a) * CORPSE_SLIDE_PX;
  const cy = spawnY + Math.sin(a) * CORPSE_SLIDE_PX;

  // **One readback for the whole box, never one per sample.** A per-pixel
  // `getImageData` is a forced round trip each time — the trap `paintbench.ts`
  // documents, and the one that hung an earlier rig outright.
  const half = Math.ceil(R * OUT_TO) + 6;
  const bx = Math.round(cx - half);
  const by = Math.round(cy - half);
  const w = half * 2;
  const d = ctx.getImageData(bx, by, w, w).data;
  const lit = (o: number): boolean =>
    Math.abs(d[o] - 0x1b) + Math.abs(d[o + 1] - 0x1d) + Math.abs(d[o + 2] - 0x20) > 20;
  const inked = (px: number, py: number): boolean => {
    const ix = Math.round(px) - bx;
    const iy = Math.round(py) - by;
    if (ix < 0 || iy < 0 || ix >= w || iy >= w) return false;
    return lit((iy * w + ix) * 4);
  };

  const out: Sweep = { covered: 0, widestGap: 0, runs: 0, limbs: 0, peaks: [], ink: 0 };
  for (let i = 0; i < w * w; i++) if (lit(i * 4)) out.ink++;

  const reach: number[] = [];
  for (let b = 0; b < BEARINGS; b++) {
    // Relative to the body's own facing, so a gap can be named by where it is
    // on the *body* rather than on the screen, and the profile is comparable
    // across the angles this rig sweeps.
    const t = a + (b / BEARINGS) * Math.PI * 2;
    let far = 0;
    for (let rr = 0.2; rr <= OUT_TO; rr += 0.02) {
      if (inked(cx + Math.cos(t) * R * rr, cy + Math.sin(t) * R * rr)) far = rr;
    }
    reach.push(far);
  }

  const has = reach.map((v) => v >= LIMB_AT);
  out.covered = has.filter(Boolean).length / BEARINGS;

  // Runs, walked twice round so one spanning the seam is measured once.
  let run = 0;
  for (let i = 0; i < BEARINGS * 2; i++) {
    if (has[i % BEARINGS]) {
      run = 0;
      continue;
    }
    run++;
    if (i >= BEARINGS) out.widestGap = Math.max(out.widestGap, Math.min(run, BEARINGS));
  }
  for (let i = 0; i < BEARINGS; i++) {
    if (has[i] && !has[(i + BEARINGS - 1) % BEARINGS]) out.runs++;
  }

  // The peak in each limb's own sector. Matched by sector rather than taken in
  // order, so a limb that swung a long way is still recognised as that limb —
  // and a limb that is not there comes back null rather than borrowing its
  // neighbour's.
  for (let k = 0; k < BASES.length; k++) {
    const [from, to] = SECTORS[k];
    let best = -1;
    let bestAt: number | null = null;
    for (let b = 0; b < BEARINGS; b++) {
      const deg = wrap((b / BEARINGS) * 360);
      // The sector may span the seam at ±180.
      const inside = from < to ? deg >= from && deg <= to : deg >= from || deg <= to;
      if (!inside) continue;
      if (Math.abs(deg) < HEAD_BAND) continue;
      if (reach[b] > best) {
        best = reach[b];
        bestAt = deg;
      }
    }
    out.peaks.push(best >= LIMB_AT ? bestAt : null);
  }
  out.limbs = out.peaks.filter((v) => v !== null).length;
  return out;
}

// Corpses only draw at all with both settings on.
settings.blood = true;
settings.corpses = true;

try {
  // Several bearings, because a hole in one quadrant of the *body* has to show
  // wherever on screen the body happens to be pointing — and several seeds,
  // because every limb now moves.
  const seeds: Array<[number, number]> = [
    [0, 0],
    [37, 1234],
    [-52, 9871],
    [91, 55_500],
    [-140, 20_311],
    [166, 78_002],
  ];
  const angles = [0, 0.9, 2.2, -1.4];

  for (let i = 0; i < angles.length; i++) {
    result.old.push(sweep(angles[i], true, seeds[i][0], seeds[i][1]));
  }
  const swings: number[][] = [[], [], [], []];
  const signatures = new Set<string>();
  for (const [sx, st] of seeds) {
    const s = sweep(0, false, sx, st);
    result.now.push(s);
    s.peaks.forEach((peak, k) => {
      if (peak !== null) swings[k].push(wrap(peak - BASES[k]));
    });
    signatures.add(s.peaks.map((v) => (v === null ? 'x' : v.toFixed(0))).join(','));
  }
  // The other bearings, on the new drawing, so the four-limb claim is not made
  // at one facing only.
  for (let i = 1; i < angles.length; i++) {
    result.now.push(sweep(angles[i], false, seeds[i][0], seeds[i][1]));
  }
  result.distinct = signatures.size;

  const spread = (xs: number[]): number => (xs.length ? Math.max(...xs) - Math.min(...xs) : 0);
  result.armSwing = Math.max(...ARMS.map((k) => spread(swings[k])));
  result.legSwing = Math.max(...LEGS.map((k) => spread(swings[k])));

  // The same seed twice has to be the same body: this is drawn every frame and
  // once more when it is baked, so anything rolled here twitches and then pops.
  const twice = [sweep(0.4, false, 21, 4242), sweep(0.4, false, 21, 4242)];
  result.stable =
    twice[0].peaks.every((v, i) => v === twice[1].peaks[i]) && twice[0].ink === twice[1].ink;

  setThreeLimbedCorpse(false);

  const med = (xs: number[]): number => xs.slice().sort((p, q) => p - q)[Math.floor(xs.length / 2)];
  const oldGap = Math.max(...result.old.map((s) => s.widestGap));
  const oldGapMed = med(result.old.map((s) => s.widestGap));
  const newGapMed = med(result.now.map((s) => s.widestGap));
  const oldLimbs = Math.min(...result.old.map((s) => s.limbs));
  const newLimbs = Math.min(...result.now.map((s) => s.limbs));
  result.gapMedian = [oldGapMed, newGapMed];

  if (result.old.some((s) => s.ink === 0) || result.now.some((s) => s.ink === 0)) {
    result.errors.push('a sweep found no ink at all');
  }
  // The control. Without it "no wide bare run" is satisfied just as well by a
  // rig whose threshold cannot tell a limb from a torso.
  if (oldGap < 80) {
    result.errors.push(`CONTROL: the old drawing's widest bare run is only ${f1(oldGap)} degrees`);
  }
  if (oldLimbs !== 3) {
    result.errors.push(`CONTROL: the old drawing shows ${oldLimbs} limbs, not 3`);
  }
  if (result.old.some((s) => s.peaks[0] !== null)) {
    result.errors.push('CONTROL: the old drawing was supposed to be missing its left arm');
  }
  if (newLimbs !== 4) {
    result.errors.push(`the new drawing shows ${newLimbs} limbs, not 4`);
  }
  /*
   * **The bare run is compared on medians, not on the worst case**, and that is
   * not a softening — it is what the reading is worth. The arms swing far
   * enough that one thrown forward leaves a wide span between it and the leg
   * behind it, so the worst new body has a run within a few degrees of the
   * worst old one. That is a limb in an unusual place, not a limb that is
   * missing, and `limbs` above is what says which.
   */
  if (newGapMed > oldGapMed * 0.8) {
    result.errors.push(`the bare run did not close: median ${f1(oldGapMed)} -> ${f1(newGapMed)} degrees`);
  }
  if (result.distinct < 5) {
    result.errors.push(`only ${result.distinct} distinct drawings out of ${seeds.length} seeds`);
  }
  if (!(result.armSwing > result.legSwing * 1.5)) {
    result.errors.push(
      `arms do not swing further than legs: ${f1(result.armSwing)} against ${f1(result.legSwing)} degrees`,
    );
  }
  if (result.legSwing < 4) {
    result.errors.push(`legs barely move at all: ${f1(result.legSwing)} degrees`);
  }
  if (!result.stable) {
    result.errors.push('the same seed drew two different bodies');
  }
} catch (err) {
  result.errors.push(String(err));
}

// Leave something on screen to look at as well as something to read: the old
// drawing down the left, the new one across the rest, blown up.
clear();
ctx.setTransform(5, 0, 0, 5, 0, 0);
clearBlood();
setThreeLimbedCorpse(true);
for (let row = 0; row < 4; row++) spawnCorpse(26, 24 + row * 34, row * 0.9, 0);
drawZombieCorpses(ctx, { x: 0, y: 0, w: canvas.width, h: canvas.height }, SETTLED);
clearBlood();
setThreeLimbedCorpse(false);
for (let col = 0; col < 4; col++) {
  for (let row = 0; row < 4; row++) {
    spawnCorpse(96 + col * 60, 24 + row * 34, row * 0.9, col * 3137 + row * 11);
  }
}
drawZombieCorpses(ctx, { x: 0, y: 0, w: canvas.width, h: canvas.height }, SETTLED);
ctx.setTransform(1, 0, 0, 1, 0, 0);

(window as unknown as { rigResult: Result }).rigResult = result;
console.log(JSON.stringify(result, null, 1));
