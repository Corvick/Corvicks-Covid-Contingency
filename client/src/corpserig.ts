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
import {
  CORPSE_KNEE,
  clearBlood,
  corpsePose,
  corpseSeed,
  drawZombieCorpses,
  setThreeLimbedCorpse,
  spawnCorpse,
} from './render.js';
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
  /**
   * Where the head ended up, in degrees off the round's own bearing.
   *
   * **Found by colour rather than by shape.** The head is drawn `shade(+8)`
   * against the torso's base and the limbs' `-18`, so it is the lightest thing
   * on the body by a wide margin — which makes "where is the head" one pass
   * over the pixels already read back, and needs no assumption about where it
   * was expected to be.
   */
  headAt: number;
  /** Where each limb's peak reach is, in degrees off the body's facing. */
  peaks: Array<number | null>;
  /** The peak of every run of long reach, the head's own run excluded. */
  runPeaks: number[];
  /** Where the head is from the body's centre, in degrees off the round. */
  headFromCentre: number;
  /**
   * Of the bearings a limb reaches along, the share on whichever side has more
   * of them — the head's own excluded.
   *
   * **This is what says a body is on its side**, and counting runs is not. The
   * head and the nearest arm merge into a single run on a body lying over, so
   * "four limbs, all one sign" cannot be read off the runs at all: it came back
   * as two runs on a drawing doing exactly what it should. A share of the
   * *circle* is immune to whether two limbs happen to touch.
   */
  oneSided: number;
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
  /** Share of bodies falling each way, over a great many seeds. */
  shareDiagonal: number;
  shareSideways: number;
  /** The widest the head ever swings, in degrees. */
  widestTilt: number;
  /** Measured off the pixels: head swung, legs left on the round's bearing. */
  headSwing: number[];
  legHold: number[];
  /** Mean of those, against the arms with the tilt taken back off them. */
  legDrift: number;
  armDrift: number;
  /** A body on its side: are all four limbs out the same way? */
  sidewaysOneSided: number;
  sidewaysTried: number;
  /** What the sweep saw on each of them, so a failure names itself. */
  sidewaysRuns: Array<{ head: number; runs: number[]; oneSided: number }>;
  /** The same reading on the bodies that fell the ordinary way — the control. */
  uprightOneSided: number;
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
  shareDiagonal: 0,
  shareSideways: 0,
  widestTilt: 0,
  headSwing: [],
  legHold: [],
  legDrift: 0,
  armDrift: 0,
  sidewaysOneSided: 0,
  sidewaysTried: 0,
  sidewaysRuns: [],
  uprightOneSided: 0,
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

  const out: Sweep = {
    covered: 0,
    widestGap: 0,
    runs: 0,
    limbs: 0,
    headAt: 0,
    headFromCentre: 0,
    oneSided: 0,
    peaks: [],
    runPeaks: [],
    ink: 0,
  };
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

  // The head: the lightest pixels in the box, and where their centre lies.
  let brightest = 0;
  for (let i = 0; i < w * w; i++) brightest = Math.max(brightest, d[i * 4]);
  let hx = 0;
  let hy = 0;
  let hn = 0;
  for (let j = 0; j < w; j++) {
    for (let i = 0; i < w; i++) {
      if (d[(j * w + i) * 4] < brightest - 4) continue;
      hx += i;
      hy += j;
      hn++;
    }
  }
  /*
   * **Measured from the knees, not from the body's centre**, and that was a
   * fault in this rig before it was anything else.
   *
   * The whole upper body swings *about the pivot*, so from anywhere in front of
   * it the head appears to move further than the tilt — it is on the far end of
   * a lever. Measured from the centre, a 17 degree tilt read as 29, and the rig
   * reported the head "18.8 degrees out" of a drawing that was placing it
   * exactly where the pose said. From the pivot the two agree by construction,
   * which is what makes this a check on the drawing rather than on the
   * arithmetic that was expected of it.
   */
  const px = cx - Math.cos(a) * R * CORPSE_KNEE;
  const py = cy - Math.sin(a) * R * CORPSE_KNEE;
  const headX = hn === 0 ? cx : bx + hx / hn;
  const headY = hn === 0 ? cy : by + hy / hn;
  out.headAt = hn === 0 ? 0 : wrap(((Math.atan2(headY - py, headX - px) - a) * 180) / Math.PI);
  out.headFromCentre = hn === 0 ? 0 : wrap(((Math.atan2(headY - cy, headX - cx) - a) * 180) / Math.PI);

  /*
   * Every limb's peak, run by run, without assuming where the limbs are — a
   * body on its side puts all four out the same way and fits none of the
   * sectors.
   *
   * **The head is dropped by where it actually is, not by a band round the
   * front.** A fixed band works only for a body that fell square: tilt the
   * upper half and lay the head off the centre line, as a body on its side has
   * it, and the head can sit well past 25 degrees — sometimes on the *opposite*
   * side from the limbs, which read as a limb out the other way and failed 1
   * sideways body in 6 on a drawing doing exactly what it should. The head is
   * found by colour a few lines above, so where it is is already known.
   */
  for (let i = 0; i < BEARINGS; i++) {
    if (!has[i] || has[(i + BEARINGS - 1) % BEARINGS]) continue;
    let best = -1;
    let bestAt = 0;
    for (let k = 0; k < BEARINGS; k++) {
      const b = (i + k) % BEARINGS;
      if (!has[b]) break;
      if (reach[b] > best) {
        best = reach[b];
        bestAt = wrap((b / BEARINGS) * 360);
      }
    }
    if (Math.abs(wrap(bestAt - out.headFromCentre)) > HEAD_BAND) out.runPeaks.push(bestAt);
  }

  let plus = 0;
  let minus = 0;
  for (let b = 0; b < BEARINGS; b++) {
    if (!has[b]) continue;
    const deg = wrap((b / BEARINGS) * 360);
    if (Math.abs(wrap(deg - out.headFromCentre)) <= HEAD_BAND) continue;
    if (deg > 0) plus++;
    else minus++;
  }
  out.oneSided = plus + minus === 0 ? 0 : Math.max(plus, minus) / (plus + minus);
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

  /*
   * How they fall, counted rather than squinted at.
   *
   * **Off `corpsePose` rather than off the canvas**, which is why that function
   * is pure and exported: one in five is a claim about a distribution, and a
   * distribution is a thing to count over thousands of draws. The pixels are
   * then asked the separate question of whether the drawing does what the pose
   * says.
   */
  const N = 40_000;
  let diag = 0;
  let side = 0;
  for (let i = 0; i < N; i++) {
    const pose = corpsePose(i / N);
    if (pose.sideways) side++;
    else if (pose.tilt !== 0) diag++;
    result.widestTilt = Math.max(result.widestTilt, Math.abs((pose.tilt * 180) / Math.PI));
  }
  result.shareDiagonal = diag / N;
  result.shareSideways = side / N;

  if (Math.abs(result.shareDiagonal - 0.2) > 0.03) {
    result.errors.push(`diagonal falls are ${(result.shareDiagonal * 100).toFixed(1)}%, not about 20`);
  }
  if (Math.abs(result.shareSideways - 0.04) > 0.012) {
    result.errors.push(`sideways falls are ${(result.shareSideways * 100).toFixed(2)}%, not about 4`);
  }
  if (result.widestTilt > 21 || result.widestTilt < 18) {
    result.errors.push(`the head swings up to ${f1(result.widestTilt)} degrees, not about 20`);
  }

  /*
   * And the drawing does what the pose says: the head swings off the round and
   * the legs stay on it.
   *
   * **The legs are the half that matters.** A body rotated bodily would show the
   * head swung just as well — what says the pivot is at the knees is that the
   * legs did *not* come with it, and they are measured in sectors taken off the
   * round's own bearing rather than off the body's.
   */
  const armCarried: number[] = [];
  for (let born = 1; born < 4000 && result.headSwing.length < 8; born++) {
    const sx = canvas.width / 2 + 11;
    const sy = canvas.height / 2;
    const pose = corpsePose(corpseSeed(sx, sy, born));
    if (pose.sideways || Math.abs(pose.tilt) < 0.2) continue;
    const s = sweep(0, false, 11, born);
    const tiltDeg = (pose.tilt * 180) / Math.PI;
    result.headSwing.push(Number((s.headAt - tiltDeg).toFixed(1)));
    // How far each limb sits from where it would be on a body that fell square,
    // measured against the *round's* bearing. The arms carry the tilt; the legs
    // are not supposed to.
    for (const k of LEGS) {
      const peak = s.peaks[k];
      if (peak !== null) result.legHold.push(Number(wrap(peak - BASES[k]).toFixed(1)));
    }
    for (const k of ARMS) {
      const peak = s.peaks[k];
      if (peak !== null) armCarried.push(Number(wrap(peak - BASES[k] - tiltDeg).toFixed(1)));
    }
  }
  if (result.headSwing.length === 0) {
    result.errors.push('no diagonal body could be staged');
  }
  if (result.headSwing.some((v) => Math.abs(v) > 6)) {
    result.errors.push(
      `the head is not where the pose says: worst ${f1(Math.max(...result.headSwing.map(Math.abs)))} degrees out`,
    );
  }
  /*
   * **The legs are checked against the arms on the same bodies, not against a
   * tolerance**, and that is not a softening — it is the only reading that
   * discriminates.
   *
   * A leg is rooted at the hip, and the hip *does* come round with the torso
   * even though the leg's own bearing does not, so a peak taken from the body's
   * centre carries a few degrees of that however the drawing behaves. An
   * absolute bound would therefore have to be loose enough to be worth little.
   * What cannot be faked is the comparison: subtract the tilt from the arms and
   * they sit as still as the legs do. Rotate the whole body instead and the
   * legs pick up the tilt, and this reading opens by twenty degrees.
   */
  const mean = (xs: number[]): number =>
    xs.length === 0 ? 0 : xs.reduce((s2, v) => s2 + Math.abs(v), 0) / xs.length;
  result.legDrift = Number(mean(result.legHold).toFixed(1));
  result.armDrift = Number(mean(armCarried).toFixed(1));
  if (result.legDrift > result.armDrift + 8) {
    result.errors.push(
      `the legs came round with the body: legs ${f1(result.legDrift)} against arms ${f1(result.armDrift)} degrees`,
    );
  }

  // A body on its side puts all four limbs out the same way.
  for (let born = 1; born < 200_000 && result.sidewaysTried < 6; born++) {
    const sx = canvas.width / 2 + 11;
    const sy = canvas.height / 2;
    const pose = corpsePose(corpseSeed(sx, sy, born));
    if (!pose.sideways) continue;
    result.sidewaysTried++;
    const s = sweep(0, false, 11, born);
    /*
     * **Read off the runs, not off the sectors.** The sectors are where a limb
     * sits on a body that fell square; a body on its side has all four out the
     * same way and fits two of them, so a sector search finds two limbs and two
     * nulls and the check reads 0 of 6 on a drawing doing exactly what it
     * should. Three runs rather than four is expected and is the point: the two
     * legs are drawn stacked, and stacked is what a merged run looks like.
     */
    result.sidewaysRuns.push({
      head: Number(s.headFromCentre.toFixed(0)),
      runs: s.runPeaks.map((v) => Number(v.toFixed(0))),
      oneSided: Number(s.oneSided.toFixed(2)),
    });
    /*
     * **0.9, not 1.0**, and the reason is the head rather than the limbs. It is
     * a disc of 0.44r sitting 1.05r out and laid off the centre line, so it
     * subtends the best part of fifty degrees from the body's middle and its
     * far edge escapes the band that excludes it on some poses. That shows up
     * as a few bearings of "the other side" on a body whose limbs are all one
     * way. The measured separation is enormous either way — 0.95 to 1.00
     * against the ordinary body's 0.54 — so where in that gap the line goes
     * changes nothing.
     */
    if (s.oneSided > 0.9) result.sidewaysOneSided++;
  }
  if (result.sidewaysTried === 0) {
    result.errors.push('no sideways body could be staged');
  }
  if (result.sidewaysOneSided !== result.sidewaysTried) {
    result.errors.push(
      `${result.sidewaysOneSided}/${result.sidewaysTried} sideways bodies have every limb one side`,
    );
  }
  /*
   * **The control, and it is the whole of what the figure above is worth.** An
   * ordinary body has two limbs each way, so this reading sits near a half on
   * one; without it, "every limb is on one side" is satisfied just as well by a
   * measurement that always says so.
   */
  result.uprightOneSided = Number(
    (result.now.reduce((s2, v) => s2 + v.oneSided, 0) / result.now.length).toFixed(2),
  );
  if (result.uprightOneSided > 0.8) {
    result.errors.push(
      `CONTROL: an ordinary body reads ${f1(result.uprightOneSided * 100)}% one-sided too`,
    );
  }
} catch (err) {
  result.errors.push(String(err));
}

// ------------------------------------------------------------- the sheet
/*
 * Something to look at as well as something to read.
 *
 * Three rows — straight back, diagonal, on its side — several bodies of each,
 * blown up, with the line of the round drawn under each so "the legs kept the
 * bearing they were shot along and the head swung off it" is a thing you can
 * see rather than one you have to take on trust. Then a strip at the size they
 * actually are in a round, which is the reading that decides whether any of it
 * is visible at all.
 *
 * The poses are found by searching `born` values through `corpseSeed`, not by
 * forcing a seed: that is the same path a real death takes, so a pose the sheet
 * cannot find is one a round would never produce either.
 */
function bornFor(x: number, y: number, want: (p: ReturnType<typeof corpsePose>) => boolean): number[] {
  const out: number[] = [];
  for (let n = 1; n < 400_000 && out.length < 7; n++) {
    if (want(corpsePose(corpseSeed(x, y, n)))) out.push(n);
  }
  return out;
}

function sheet(): void {
  clear();
  setThreeLimbedCorpse(false);
  const g = ctx;
  const rows: Array<{ label: string; want: (p: ReturnType<typeof corpsePose>) => boolean }> = [
    { label: 'STRAIGHT BACK — about 4 in 5', want: (p) => !p.sideways && p.tilt === 0 },
    { label: 'DIAGONAL — about 1 in 5, head swung up to 20 degrees off the round', want: (p) => !p.sideways && p.tilt !== 0 },
    { label: 'FLAT ON ITS SIDE — about 1 in 25', want: (p) => p.sideways },
  ];

  const BIG = 4.2;
  let ry = 110;
  for (const row of rows) {
    g.font = 'bold 15px sans-serif';
    g.fillStyle = '#e8a13a';
    g.textAlign = 'left';
    g.textBaseline = 'alphabetic';
    g.fillText(row.label, 24, ry - 78);

    for (let i = 0; i < 7; i++) {
      const bx = 150 + i * 232;
      const a = 0.3 + i * 0.16;
      // **The seed is hashed off where the body was *spawned*, and a corpse
      // slides before it settles — so the search has to run at the spawn point,
      // not at the spot it comes to rest on.** Searched at the resting place,
      // every row drew whatever pose that seed happened to be, and the sheet
      // showed three rows of the same thing with the labels lying about them.
      const sx = bx - Math.cos(a) * CORPSE_SLIDE_PX;
      const sy = ry - Math.sin(a) * CORPSE_SLIDE_PX;
      const borns = bornFor(sx, sy, row.want);
      if (borns.length === 0) continue;
      const born = borns[i % borns.length];

      // The round's own line, so the fall can be read against it.
      g.strokeStyle = 'rgba(232, 161, 58, 0.32)';
      g.setLineDash([5, 5]);
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(bx - Math.cos(a) * 96, ry - Math.sin(a) * 96);
      g.lineTo(bx + Math.cos(a) * 96, ry + Math.sin(a) * 96);
      g.stroke();
      g.setLineDash([]);

      clearBlood();
      g.save();
      g.translate(bx, ry);
      g.scale(BIG, BIG);
      g.translate(-bx, -ry);
      spawnCorpse(sx, sy, a, born);
      drawZombieCorpses(g, { x: -1e4, y: -1e4, w: 1e5, h: 1e5 }, born + SETTLED);
      g.restore();

      const pose = corpsePose(corpseSeed(sx, sy, born));
      g.font = '11px sans-serif';
      g.fillStyle = '#94a3b8';
      g.fillText(
        pose.sideways
          ? `on its side, ${((pose.tilt * 180) / Math.PI).toFixed(0)} deg`
          : `${((pose.tilt * 180) / Math.PI).toFixed(0)} deg off the round`,
        bx - 54,
        ry + 96,
      );
    }
    ry += 244;
  }

  g.font = 'bold 15px sans-serif';
  g.fillStyle = '#e8a13a';
  g.fillText('AND AT THE SIZE THEY ARE IN A ROUND', 24, ry - 52);
  clearBlood();
  for (let i = 0; i < 60; i++) {
    const bx = 52 + (i % 20) * 86;
    const by = ry - 20 + Math.floor(i / 20) * 56;
    spawnCorpse(bx, by, (i * 1.7) % (Math.PI * 2), i * 977 + 13);
  }
  drawZombieCorpses(g, { x: -1e4, y: -1e4, w: 1e5, h: 1e5 }, 1e6);
}

sheet();

(window as unknown as { rigResult: Result }).rigResult = result;
console.log(JSON.stringify(result, null, 1));
