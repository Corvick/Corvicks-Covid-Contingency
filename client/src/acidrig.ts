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
 * It answers three questions the server-side harnesses cannot:
 *   - does a cloud actually put ink down, and does it stop at its own radius
 *     (the rim is where the fog stops, so a cloud that faded out early would
 *     leave a ring you can neither see through nor see anything in)
 *   - does a convulsing host actually move and change shape frame to frame
 *   - does any of it throw
 *
 * Results go on `window.rigResult` for `javascript_tool` to read.
 */
import type { AcidState, EntityState, SpitState } from '../../shared/types.js';
import { DOG_BIRTH_TWIST_FROM } from '../../shared/constants.js';
import { drawAcid, drawEntity, drawSpits } from './render.js';

const canvas = document.getElementById('rig') as HTMLCanvasElement;
const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

interface Result {
  errors: string[];
  cloudInkAtCentre: boolean;
  cloudInkInside: boolean;
  cloudInkOutside: boolean;
  cloudIsGreen: boolean;
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
    const cloud: AcidState[] = [{ x: cx, y: cy, r, a: 1, t: 2000 }];
    drawAcid(ctx, cloud);

    const centre = px(cx, cy);
    const inside = px(cx + r - 8, cy);
    const outside = px(cx + r + 20, cy);
    result.cloudInkAtCentre = centre[0] !== 17 || centre[1] !== 17 || centre[2] !== 17;
    result.cloudInkInside = inside[0] !== 17 || inside[1] !== 17 || inside[2] !== 17;
    // Past the rim there must be nothing: the fog stops at exactly `r`, so ink
    // beyond it is a cloud claiming ground it does not occlude.
    result.cloudInkOutside = outside[0] !== 17 || outside[1] !== 17 || outside[2] !== 17;
    // Green, meaning g is the dominant channel — it is acid, not smoke.
    result.cloudIsGreen = centre[1] > centre[0] && centre[1] > centre[2];
  } catch (e) {
    result.errors.push(`drawAcid: ${String(e)}`);
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
  drawAcid(ctx, [{ x: 300, y: 400, r: 130, a: 1, t: 2000 }]);
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
