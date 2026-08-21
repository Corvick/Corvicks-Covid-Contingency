/**
 * Acid + birth rig. Temporary — delete after.
 *
 * Drives the real `drawAcid`, `drawSpits` and `drawEntity` by hand, because the
 * two things added on this side cannot be seen in a live round from here: rAF
 * is throttled to nothing while the browser pane is not compositing, so no
 * frame is ever put on screen. Reading the canvas back with `getImageData`
 * needs no compositing at all, which is what makes this measurable rather than
 * merely lookable-at.
 *
 * It answers four questions the server-side harnesses cannot:
 *   - does a cloud actually put ink down, and does it stop at its own radius
 *     (the rim is where the fog stops, so a cloud that faded out early would
 *     leave a ring you can neither see through nor see anything in)
 *   - **is the cloud lumpy** — how far the drawn edge reaches at one bearing
 *     against another, which is the whole of what "less of a uniform circle"
 *     means and the only claim here that a screenshot could not settle
 *   - does a convulsing host actually move and change shape frame to frame
 *   - does any of it throw
 *
 * Results go on `window.rigResult` for `javascript_tool` to read.
 */
import type { AcidState, EntityState, SpitState } from '../../shared/types.js';
import { DOG_BIRTH_TWIST_FROM } from '../../shared/constants.js';
import { drawAcid, drawAcidMurk, drawEntity, drawSpits } from './render.js';

const canvas = document.getElementById('rig') as HTMLCanvasElement;
const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

interface Result {
  errors: string[];
  cloudInkAtCentre: boolean;
  cloudInkInside: boolean;
  cloudInkOutside: boolean;
  cloudIsGreen: boolean;
  /** Furthest drawn ink per bearing, as a fraction of the bounding radius. */
  edgeMin: number;
  edgeMax: number;
  /** Distinct clouds drawn from distinct seeds, by signature. */
  seedsDiffer: boolean;
  murkInk: boolean;
  spitInk: boolean;
  /** Distinct rendered positions of a convulsing host across the birth. */
  birthFrames: number;
  birthMoves: number;
  birthDiffers: boolean;
  plainStill: boolean;
}

const result: Result = {
  errors: [],
  cloudInkAtCentre: false,
  cloudInkInside: false,
  cloudInkOutside: false,
  cloudIsGreen: false,
  edgeMin: 0,
  edgeMax: 0,
  seedsDiffer: false,
  murkInk: false,
  spitInk: false,
  birthFrames: 0,
  birthMoves: 0,
  birthDiffers: false,
  plainStill: true,
};

function px(x: number, y: number): [number, number, number, number] {
  const d = ctx.getImageData(x, y, 1, 1).data;
  return [d[0], d[1], d[2], d[3]];
}

/** True when this pixel is not the rig's own background. */
function ink(x: number, y: number): boolean {
  const d = px(Math.round(x), Math.round(y));
  return d[0] !== 17 || d[1] !== 17 || d[2] !== 17;
}

function clear(): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#111';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

/** Everything a body drawn at this instant puts on the canvas, as a signature. */
function signature(x: number, y: number, half: number): string {
  const d = ctx.getImageData(x - half, y - half, half * 2, half * 2).data;
  let sum = 0;
  let count = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    sum += d[i] * 7 + d[i + 1] * 13 + d[i + 2] * 17 + i;
    count++;
  }
  return `${count}:${sum}`;
}

function run(): void {
  // ---- the cloud
  try {
    clear();
    const cx = 300;
    const cy = 300;
    const r = 130;
    const cloud: AcidState[] = [{ x: cx, y: cy, r, s: 1234, a: 1, t: 2000 }];
    drawAcid(ctx, cloud);

    const centre = px(cx, cy);
    const outside = px(cx + r + 20, cy);
    result.cloudInkAtCentre = ink(cx, cy);
    // Past the bounding radius there must be nothing: no lobe reaches beyond
    // it, so the fog stops at exactly `r` and ink out there is a cloud claiming
    // ground it does not occlude.
    result.cloudInkOutside = outside[0] !== 17 || outside[1] !== 17 || outside[2] !== 17;
    // Green, meaning g is the dominant channel — it is acid, not smoke.
    result.cloudIsGreen = centre[1] > centre[0] && centre[1] > centre[2];

    /*
     * **How lumpy it is, as a number.**
     *
     * The whole claim of this change is that a cloud is not a uniform disc, and
     * that is a claim about the *silhouette* — so walk in from beyond the rim
     * along many bearings and record where the ink starts. A disc gives the
     * same answer at every bearing; a cluster of lobes gives bulges out at the
     * bounding radius and notches well inside it, and the gap between the two
     * is the measurement.
     *
     * `cloudInkInside` comes off the same sweep rather than off one sample.
     * Taken at a fixed bearing it says nothing now: 8px inside the rim is solid
     * on a bulge and empty in a notch, and which one it lands in is the seed's
     * business.
     */
    let lo = 2;
    let hi = 0;
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      let reach = 0;
      for (let f = 1.06; f > 0.2; f -= 0.01) {
        if (ink(cx + Math.cos(a) * r * f, cy + Math.sin(a) * r * f)) {
          reach = f;
          break;
        }
      }
      if (reach < lo) lo = reach;
      if (reach > hi) hi = reach;
    }
    result.edgeMin = Math.round(lo * 100) / 100;
    result.edgeMax = Math.round(hi * 100) / 100;
    result.cloudInkInside = hi > 0.5;

    // Two seeds, two shapes. Without this the sweep above would pass just as
    // well on a lumpy cloud that is the *same* lumpy cloud every time, which
    // reads as a texture rather than as weather.
    clear();
    drawAcid(ctx, [{ x: cx, y: cy, r, s: 1234, a: 1, t: 2000 }]);
    const shapeA = signature(cx, cy, 140);
    clear();
    drawAcid(ctx, [{ x: cx, y: cy, r, s: 8765, a: 1, t: 2000 }]);
    result.seedsDiffer = signature(cx, cy, 140) !== shapeA;
  } catch (e) {
    result.errors.push(`drawAcid: ${String(e)}`);
  }

  // ---- standing in it
  try {
    clear();
    drawAcidMurk(ctx, canvas.width, canvas.height, 4000);
    // Green over the whole frame, corner included — it is what is in your eyes
    // rather than something lying on the road.
    const mid = px(canvas.width / 2, canvas.height / 2);
    const corner = px(12, 12);
    result.murkInk =
      mid[1] > mid[0] && mid[1] > mid[2] && corner[1] > corner[0] && corner[1] > corner[2];
  } catch (e) {
    result.errors.push(`drawAcidMurk: ${String(e)}`);
  }

  // ---- the gobbet
  try {
    clear();
    const spit: SpitState[] = [{ x: 700, y: 300, h: 24, t: 0.5 }];
    drawSpits(ctx, spit);
    const blob = px(700, 300 - 24);
    const shadow = px(700, 300);
    result.spitInk =
      (blob[0] !== 17 || blob[1] !== 17 || blob[2] !== 17) &&
      (shadow[0] !== 17 || shadow[1] !== 17 || shadow[2] !== 17);
  } catch (e) {
    result.errors.push(`drawSpits: ${String(e)}`);
  }

  // ---- the convulsion. Sampled across the whole birth: it has to move, and
  // the arms half has to look different from the vibration half.
  try {
    const base: EntityState = {
      id: 'host',
      type: 'zombie',
      x: 1050,
      y: 300,
      facing: 0,
      health: 100,
      maxHealth: 100,
    } as EntityState;

    const sigs: string[] = [];
    for (let i = 0; i <= 10; i++) {
      clear();
      const b = i / 10;
      drawEntity(ctx, { ...base, birthing: b }, false, 1000 + i * 140);
      sigs.push(signature(base.x, base.y, 40));
    }
    result.birthFrames = sigs.length;
    result.birthMoves = new Set(sigs).size;

    // Early (vibration only) against late (arms out) must differ plainly.
    clear();
    drawEntity(ctx, { ...base, birthing: DOG_BIRTH_TWIST_FROM * 0.5 }, false, 5000);
    const early = signature(base.x, base.y, 40);
    clear();
    drawEntity(ctx, { ...base, birthing: 1 }, false, 5000);
    const late = signature(base.x, base.y, 40);
    result.birthDiffers = early !== late;

    // The control: an ordinary zombie, same clock steps, must not move at all.
    const still: string[] = [];
    for (let i = 0; i <= 10; i++) {
      clear();
      drawEntity(ctx, { ...base }, false, 1000 + i * 140);
      still.push(signature(base.x, base.y, 40));
    }
    result.plainStill = new Set(still).size === 1;
  } catch (e) {
    result.errors.push(`drawEntity birthing: ${String(e)}`);
  }

  // Leave the last frame something to look at, if anybody ever can.
  clear();
  drawAcid(ctx, [{ x: 300, y: 400, r: 130, s: 1234, a: 1, t: 2000 }]);
  drawSpits(ctx, [{ x: 700, y: 400, h: 26, t: 0.5 }]);
  drawEntity(ctx, {
    id: 'host',
    type: 'zombie',
    x: 1050,
    y: 400,
    facing: 0,
    health: 100,
    maxHealth: 100,
    birthing: 0.85,
  } as EntityState, false, 5000);

  (window as unknown as Record<string, unknown>).rigResult = result;
  console.log('[acidrig]', JSON.stringify(result));
}

// `setInterval` rather than rAF, which is throttled to nothing while the
// browser pane is not compositing.
setInterval(run, 500);
run();
