/**
 * How a generated person walks: which baked pose they are in, which way the
 * sprite faces, and where it is drawn relative to where the game says they are.
 *
 * `charsprite.ts` says what a person looks like and `charbake.ts` gets that to
 * the frame; this is the part that moves. It has no DOM on purpose, so
 * `spritesheet.ts` can drive it headlessly against a simulated 30Hz feed and
 * measure it rather than squint at it.
 *
 * Reported as *"the sprites for the people are jiggling their arms too much.
 * their arms should sway with each step. lets overhaul their movement so its
 * not a constant smooth speed but follows their gait. so at lower speeds their
 * walk shouldn't look like gliding but as they start to run it looks
 * smoother."* Three things, and the first was a fault rather than a taste:
 *
 * **The jiggle was the "is it walking" test flipping at render rate.** It was a
 * per-*frame* step compared against a quarter of a pixel, smoothed per frame —
 * so the same body read as walking at 60Hz and as standing at 144Hz. Worse,
 * positions come down the wire rounded to whole pixels at 30Hz, so a civilian
 * strolling at 35px/s arrives in alternating steps of one and two pixels;
 * interpolated at 144Hz that is 0.15 then 0.29 a frame, either side of the
 * threshold, and the arms snapped between hanging and full swing every snapshot
 * or two. It is a pace in pixels a *second* now, smoothed over a clock rather
 * than over frames, and it fades the stride in and out rather than switching it.
 *
 * **The sway is seven poses rather than three.** The old cycle was pass, full
 * step, pass, full step — the hand teleported the whole length of its swing in
 * two jumps. Seven gait values a third apart cut the biggest jump to a third.
 *
 * **The surge is a drawn offset along the line of travel, never a change to
 * where anybody is.** The simulation owns position and every speed ratio in it
 * is deliberate, so a body that genuinely slowed mid-step would change chases.
 * What is drawn instead is the true position plus a zero-mean offset that goes
 * round once per step, sized so the drawn body nearly stops at the pass and
 * catches up through the stride — a hitch at a stroll, nothing at a run.
 */

/** 22.5 degrees apart. Steppy if you look for it, invisible while anything moves. */
export const CHAR_ANGLES = 16;

/**
 * The gait value each baked pose is drawn at. Index is the atlas frame.
 *
 * **Evenly spaced rather than sampled off a sine**, because what matters on a
 * 64px sprite is the size of the biggest jump, and an even spacing makes every
 * jump the same third of the swing whatever the amplitude a body is walking at.
 * The time spent in each pose still follows the sine — the extremes dwell,
 * which is the pendulum an arm is.
 */
export const POSE_GAIT = [0, 1 / 3, 2 / 3, 1, -1 / 3, -2 / 3, -1] as const;
export const CHAR_FRAMES = POSE_GAIT.length;

/** The nearest baked pose to a gait value in -1..1. */
export function frameForGait(g: number): number {
  const k = Math.max(-3, Math.min(3, Math.round(g * 3)));
  return k >= 0 ? k : 3 - k;
}

// ------------------------------------------------------------ the numbers ---
/**
 * How long, in milliseconds, the pace takes to catch up with the body.
 *
 * Long enough to average away the 30Hz whole-pixel steps described above —
 * those alternate every 33ms — and short enough that a body setting off is
 * visibly stepping inside a quarter of a second.
 */
const PACE_TAU_MS = 160;

/**
 * Below this pace a body is standing; by the second it is fully walking. In
 * pixels a second.
 *
 * A shove from a neighbour in a crowded room is a few pixels back and forth,
 * and the pace is the magnitude of a *smoothed velocity* rather than of a
 * smoothed speed precisely so that a nudge there and back cancels out instead
 * of reading as a stride.
 */
const GAIT_STILL = 8;
const GAIT_MOVING = 24;

/**
 * The stroll and the run the rest of this blends between, in pixels a second.
 *
 * `HUMAN_WALK_SPEED` is 35 and a settled civilian pacing its room walks at 30;
 * `HUMAN_FLEE_SPEED` is 83. So a stroll is full hitch and full stride, and
 * somebody running for their life is already nearly all the way to smooth.
 */
const WALK_REF = 38;
const RUN_REF = 92;

/**
 * How long one step is, from how fast the body is going: a slow walk takes
 * short steps and a run takes long ones, so cadence rises with speed but not in
 * proportion to it — which is what a person does, and what stops a stroll
 * reading as a slow-motion run.
 *
 * World pixels. A drawn body is about 60 across with 24px shoulders, which puts
 * a world pixel at roughly 1.9cm. At 35px/s this is a 23px step, about 44cm,
 * at 1.5 steps a second — a slow adult walk — and at 83px/s a 33px step at 2.5
 * a second, which is a jog. The old fixed stride was 38px, 0.9 steps a second
 * at a stroll: a slow-motion walk, which is part of why the arms read as
 * swinging rather than stepping.
 */
const STEP_BASE = 16;
const STEP_PER_SPEED = 0.2;
const STEP_MAX = 60;

/**
 * How much of the swing a stroll gets against a run. A slow walk swings the
 * arms less, and a stroller at full swing was the other half of "too much".
 */
const SWING_WALK = 0.72;

/**
 * How hard the drawn body hitches, as a share of its speed, at a stroll and at
 * a run.
 *
 * At `SURGE_WALK` the drawn body's speed goes from 0.3 of its true speed at the
 * pass to about 1.9 of it through the stride — a person stepping rather than a
 * figure on a conveyor. At a run it is a tenth, which is what "as they start to
 * run it looks smoother" asks for. Above 1 the drawn body would briefly walk
 * backwards; that is the ceiling on this, not a taste.
 */
const SURGE_WALK = 0.7;
const SURGE_RUN = 0.1;

/**
 * The shape of one step's surge: 0 is a plain sine, 1 lingers longer at the
 * slow point and pushes harder through the fast one. Half-way reads as a push
 * off rather than as a body bobbing on a spring.
 */
const SURGE_SHAPE = 0.5;

/**
 * Where in the step the drawn body is slowest. At 0 that is the pass — feet
 * together, the moment a walker is on top of the planted leg — which is where a
 * real walk is slowest too: the body vaults over the stance leg and falls into
 * the next step. 0.5 puts the hitch on the stride instead, if that reads better.
 */
const SURGE_PHASE = 0;

/**
 * How far past the halfway line between two baked angles the facing has to go
 * before the sprite turns, in fractions of a step. A civilian's heading wobbles
 * a degree or two walking through a crowd, and on a boundary that flicked the
 * whole sprite 22.5 degrees back and forth.
 */
const ANGLE_HYSTERESIS = 0.2;

/**
 * The same for poses, in gait units: a pose is a third of the swing, so this
 * is a fifth of a pose past the halfway line.
 */
const POSE_HYSTERESIS = 0.07;

/** A step longer than this between two frames is a body re-entering view, not a stride. */
const TELEPORT_PX = 140;

/** Longer than this since a body was last drawn and its last pace means nothing. */
const STALE_MS = 250;

// ------------------------------------------------------------- the tracker ---
interface Walk {
  x: number;
  y: number;
  t: number;
  /** Smoothed velocity, world pixels a second. Its length is the pace. */
  vx: number;
  vy: number;
  /** Through a full cycle — left step and right — as a fraction that only grows. */
  phase: number;
  /** The baked angle last shown, for the hysteresis. */
  angle: number;
  /** Frame counter, for the old behaviour's per-frame pace. */
  legacyPace: number;
  legacyDist: number;
  // What was answered for `t`, so a body drawn twice in one frame agrees with itself.
  frame: number;
  dx: number;
  dy: number;
}

export interface CharGait {
  /** Atlas frame, via `POSE_GAIT`. */
  frame: number;
  /** Baked angle index, 0..CHAR_ANGLES. */
  angle: number;
  /** Where to draw the body relative to where it is, world pixels. */
  dx: number;
  dy: number;
}

const walks = new Map<string, Walk>();
const out: CharGait = { frame: 0, angle: 0, dx: 0, dy: 0 };
let sweptAt = 0;
let legacy = false;

/**
 * Put the old walk back: per-frame pace against a quarter-pixel threshold,
 * pass-step-pass-step off a fixed 19px beat, no surge and no angle hysteresis.
 *
 * **Kept because every figure `spritesheet.ts` prints is a gain against it.**
 * "2.1 pose changes a second" says nothing; "and it was 11, of which 8 undid
 * themselves inside a tenth of a second" is the finding. It covers the tracker
 * only — the arm amplitudes and the head in `charsprite.ts` have their own
 * gate, `setFlatCharacters`, which is older and describes an older layout.
 */
export function setLegacyGait(on: boolean): void {
  legacy = on;
  walks.clear();
}

const smoothstep = (a: number, b: number, v: number): number => {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** The sprite is authored facing NORTH and the game's `facing` 0 is EAST: a quarter turn. */
export function angleIndexFor(facing: number): number {
  const t = (facing + Math.PI / 2) / (Math.PI * 2);
  return ((Math.round(t * CHAR_ANGLES) % CHAR_ANGLES) + CHAR_ANGLES) % CHAR_ANGLES;
}

function turnWithHysteresis(w: Walk, facing: number): number {
  const nearest = angleIndexFor(facing);
  if (nearest === w.angle) return nearest;
  let d = ((facing + Math.PI / 2) / (Math.PI * 2)) * CHAR_ANGLES - w.angle;
  d -= Math.round(d / CHAR_ANGLES) * CHAR_ANGLES;
  if (Math.abs(d) > 0.5 + ANGLE_HYSTERESIS) w.angle = nearest;
  return w.angle;
}

/** Once a step, zero on average: the along-track offset in step lengths. */
function surgeAt(stepPhase: number): number {
  const x = Math.PI * 2 * stepPhase;
  return (-(1 + SURGE_SHAPE / 3) * Math.sin(x) + (SURGE_SHAPE / 6) * Math.sin(2 * x)) / (Math.PI * 2);
}

/**
 * The pose, the angle and the drawn offset for one body this frame.
 *
 * `x`, `y` must be where the body **is** — the interpolated position, before
 * any drawn shake — or the offset feeds back into the pace it is derived from.
 * The answer is written into one shared object, so read it before calling
 * again.
 */
export function charGait(id: string, x: number, y: number, facing: number, now: number): CharGait {
  // Sweeping here rather than on a timer: this is the only thing that runs per
  // body per frame, so it is the only thing that knows the map is filling up.
  // Before the lookup, or a body unseen for four seconds is swept out from
  // under the update about to be written into it.
  if (now - sweptAt > 4000) {
    sweptAt = now;
    for (const [k, v] of walks) if (now - v.t > 4000) walks.delete(k);
  }

  let w = walks.get(id);
  if (!w) {
    w = {
      x, y, t: now, vx: 0, vy: 0, phase: 0, angle: angleIndexFor(facing),
      legacyPace: 0, legacyDist: 0, frame: 0, dx: 0, dy: 0,
    };
    walks.set(id, w);
    out.frame = 0;
    out.angle = w.angle;
    out.dx = 0;
    out.dy = 0;
    return out;
  }

  if (now !== w.t) {
    const mx = x - w.x;
    const my = y - w.y;
    const step = Math.hypot(mx, my);
    const dt = now - w.t;
    w.x = x;
    w.y = y;
    w.t = now;
    if (legacy) legacyStep(w, step, facing);
    else if (dt > STALE_MS || step > TELEPORT_PX || dt <= 0) {
      // Back into view, zoomed back in, or an id reused by somebody who has
      // turned. None of it is a stride, and banking it skips the legs forward.
      w.vx = 0;
      w.vy = 0;
      w.angle = angleIndexFor(facing);
      w.frame = 0;
      w.dx = 0;
      w.dy = 0;
    } else walkStep(w, mx, my, dt, facing);
  }

  out.frame = w.frame;
  out.angle = w.angle;
  out.dx = w.dx;
  out.dy = w.dy;
  return out;
}

function walkStep(w: Walk, mx: number, my: number, dt: number, facing: number): void {
  const k = 1 - Math.exp(-dt / PACE_TAU_MS);
  w.vx += ((mx * 1000) / dt - w.vx) * k;
  w.vy += ((my * 1000) / dt - w.vy) * k;
  const pace = Math.hypot(w.vx, w.vy);

  // Off the smoothed pace, not the raw step. Distance is exact either way over a
  // stride, but a slow walker comes down the wire as a pixel, nothing, nothing,
  // a pixel — and a phase advanced in those hops drags the surge with it, which
  // measured as the drawn body stepping *backwards* at 13px/s.
  const stepLen = Math.min(STEP_MAX, STEP_BASE + pace * STEP_PER_SPEED);
  w.phase += (pace * dt) / 1000 / (2 * stepLen);
  if (w.phase > 1e6) w.phase -= Math.floor(w.phase);

  const moving = smoothstep(GAIT_STILL, GAIT_MOVING, pace);
  const run = smoothstep(WALK_REF, RUN_REF, pace);
  const swing = moving * (SWING_WALK + (1 - SWING_WALK) * run);
  const g = Math.sin(Math.PI * 2 * w.phase) * swing;
  // Held until the gait is clearly past the halfway line to a neighbour. A slow
  // walker's swing can peak right on a boundary and sit there, and the pose
  // then flickers between two frames on the pace's own noise.
  if (Math.abs(g - POSE_GAIT[w.frame]) > 1 / 6 + POSE_HYSTERESIS) w.frame = frameForGait(g);

  const surge = moving * (SURGE_WALK + (SURGE_RUN - SURGE_WALK) * run);
  const stepPhase = (((w.phase * 2 + SURGE_PHASE) % 1) + 1) % 1;
  const along = pace > 1e-3 ? (stepLen * surge * surgeAt(stepPhase)) / pace : 0;
  w.dx = w.vx * along;
  w.dy = w.vy * along;
  w.angle = turnWithHysteresis(w, facing);
}

/** The walk as it was before any of the above. See `setLegacyGait`. */
function legacyStep(w: Walk, step: number, facing: number): void {
  if (step < TELEPORT_PX) {
    w.legacyDist += step;
    w.legacyPace += (step - w.legacyPace) * 0.25;
  }
  const beat = [0, 1, 0, -1][Math.floor(w.legacyDist / 19) % 4];
  w.frame = w.legacyPace < 0.25 ? 0 : frameForGait(beat);
  w.dx = 0;
  w.dy = 0;
  w.angle = angleIndexFor(facing);
}

/** A new round is new bodies, whatever the ids say. */
export function clearCharWalks(): void {
  walks.clear();
}
