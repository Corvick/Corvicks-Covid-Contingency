import { VAN_APPROACH_SPEED, VAN_BRAKE_SPEED_MIN } from './constants.js';

/**
 * The stop as a *curve*, and the one definition of it — `server/backup.ts`
 * drives the van with this, `slideFits` checks the geometry against it, and
 * `client/src/render.ts` reconstructs the tyre marks from it. Written more than
 * once, the check and the motion would agree only until someone tuned one copy.
 *
 * Three things happen in order and they are three separate numbers:
 *
 *  - **`turnHold`** — the fraction of the brake driven **dead straight** before
 *    the wheel goes over. The van arrives on a line and commits to it.
 *  - **`turnDone`** — where in the brake the turn is *finished*. At 1 the van is
 *    still coming round as it stops, which is a lean. Below 1 the wheel comes
 *    back straight early and the van **runs out the rest of the brake on its new
 *    heading** — and that last stretch, travelling hard across the original
 *    line, is the hook of a fishhook. Without it the biggest angle is only ever
 *    reached at the instant the van stops, so it is never actually *travelled*
 *    at, and no amount of extra slew buys the sideways run.
 *  - **`VAN_TRAVEL_FOLLOW`** — how much of the body's rotation the *travel*
 *    direction picks up. 1 is a car with the wheel turned; below 1 the back
 *    kicks out and the body over-rotates relative to where it is going, which
 *    is the screech.
 *
 * `brake` is per-style rather than one constant: a fishhook is a longer
 * manoeuvre than a lean and needs a longer run to develop in.
 *
 * `turnHold` is also raised by `callBackup` for a van forced to park close to
 * the map edge, so the turn is crammed into the length of brake that is
 * actually on the map to be checked rather than happening unverified out in the
 * cordon.
 */
export const VAN_TURN_HOLD = 0.4;
export const VAN_TRAVEL_FOLLOW = 0.88;

/** Steps in the path integral. Server and client use the same count so their
 *  reconstructions of the arc line up. */
const ARC_STEPS = 32;

/** 0 before `hold`, smoothstepped to 1 across `[hold, done]`, 1 after. */
export function vanTurnEase(drive: number, hold: number = VAN_TURN_HOLD, done = 1): number {
  const span = Math.max(0.001, done - hold);
  const u = Math.max(0, Math.min(1, (drive - hold) / span));
  return u * u * (3 - 2 * u);
}

export interface BrakeParams {
  targetX: number;
  targetY: number;
  /** The approach line, and the travel direction while the van is still going
   *  straight. The turn bends off it. */
  heading: number;
  /** Body rotation at rest, rad, magnitude only. 0 for a dead-straight arrival. */
  slew: number;
  /** +1 / -1 — which way it hooks. */
  driftDir: number;
  /** Where in the brake the turn begins — see `VAN_TURN_HOLD`. */
  turnHold: number;
  /** Where in the brake the turn is finished — see the note above. */
  turnDone: number;
  /** How long the braking manoeuvre is, px. */
  brake: number;
}

/** Travel direction (radians) at progress `q` (0 at brake point, 1 at rest). */
function travelDirAt(v: BrakeParams, q: number): number {
  return (
    v.heading +
    v.slew * v.driftDir * vanTurnEase(q, v.turnHold, v.turnDone) * VAN_TRAVEL_FOLLOW
  );
}

/** Body angle at progress `q`. */
export function vanBodyAngle(v: BrakeParams, q: number): number {
  return v.heading + v.slew * v.driftDir * vanTurnEase(q, v.turnHold, v.turnDone);
}

/**
 * The displacement (dx, dy) covered over the stretch of path from progress
 * `from` to progress `to` — a midpoint integral of the travel direction.
 */
export function vanPathDisplacement(
  v: BrakeParams,
  from: number,
  to: number,
): { dx: number; dy: number } {
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < ARC_STEPS; i++) {
    const q = from + ((i + 0.5) / ARC_STEPS) * (to - from);
    const dir = travelDirAt(v, q);
    dx += Math.cos(dir);
    dy += Math.sin(dir);
  }
  const step = (v.brake * (to - from)) / ARC_STEPS;
  return { dx: dx * step, dy: dy * step };
}

/**
 * Where the body is and which way it points with `along` px of the *brake*
 * still to run (counts down to 0 at the resting spot). `targetX/targetY` is the
 * resting spot; the position is that minus the displacement still to be
 * travelled along the curve.
 */
export function vanBrakePose(
  v: BrakeParams,
  along: number,
): { x: number; y: number; facing: number } {
  const p = Math.max(0, Math.min(1, 1 - along / v.brake));
  const remaining = vanPathDisplacement(v, p, 1);
  return { x: v.targetX - remaining.dx, y: v.targetY - remaining.dy, facing: vanBodyAngle(v, p) };
}

/**
 * Forward speed with `along` of `brake` still to run — eased so most of the
 * speed is shed early and the van lands on the spot rather than crawling the
 * last stretch. Floored well above zero so the run-out after a fishhook's turn
 * is a van still moving, not one creeping.
 */
export function vanBrakeSpeed(along: number, brake: number): number {
  const t = Math.max(0, Math.min(1, 1 - along / brake));
  return VAN_BRAKE_SPEED_MIN + (VAN_APPROACH_SPEED - VAN_BRAKE_SPEED_MIN) * (1 - t) * (1 - t);
}
