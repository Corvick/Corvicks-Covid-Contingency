/**
 * Turning generated people into something the frame can afford to draw.
 *
 * `charsprite.ts` says what a person looks like; this says how that reaches the
 * screen. Two decisions carry it:
 *
 * **Every angle is baked, not rotated.** The whole reason a generator beats a
 * bought sprite sheet for this game is that a body turns freely — and rotating
 * a finished pixel bitmap is what turns pixel art to mush. Here the angle goes
 * into the *coordinates* before rasterising, so the frame at 202.5 degrees is
 * exactly as crisp as the front view. `CHAR_ANGLES` is what that costs.
 *
 * **One atlas per kind, filled lazily.** Not 768 loose canvases — that is 768
 * objects and 768 textures for the compositor to juggle. It is one canvas per
 * kind with a cell per (variant, frame, angle), and `drawImage` takes a
 * sub-rect. A
 * cell is painted the first time anybody needs it and never again. Measured on
 * this box: **0.10ms a cell at 32px and 0.32ms at 64**, so the whole atlas is
 * a quarter of a second spread across a round rather than a stall at startup.
 *
 * The budget below is what stops that becoming a stall anyway. A spectator
 * framing the whole city first-sights hundreds of bodies on one frame, which
 * is this game's known worst case for anything per-entity.
 */
import { characterPivotY, drawCharacter, look, type CharKind, type CharLook } from './charsprite.js';

/**
 * The authored size, and 64 rather than 32 because of the camera.
 *
 * `CAMERA_ZOOM` is 2.0 and a body is drawn about 60 world pixels across, so a
 * 32px source lands on screen at nearly 4x — chunky past the point of reading
 * as a person. A 64px source is under 2x, which is the pixel scale this looks
 * right at. The 32px sprites still exist and are still correct; they are what
 * a smaller camera would want.
 */
export const CHAR_SPRITE_PX = 64;

/** 22.5 degrees apart. Steppy if you look for it, invisible while anything moves. */
export const CHAR_ANGLES = 16;

/**
 * How many distinct people there are per kind.
 *
 * Not a limit on the generator — it can produce tens of thousands — but on how
 * many are *baked at once*, which is memory — and it came down 48 to 32 when
 * the walk arrived, because every variant now costs `CHAR_FRAMES` rows rather
 * than one. 32 x 3 x 16 x 64px is about **25MB** an atlas, against 12.6MB for
 * 48 still poses; holding 48 animated would have been 38MB, which is more than
 * the blood layer at a full city. A crowd of 500 drawn 24px across does not
 * give up anything anybody can see for it, and this is the knob if it does.
 */
export const CHAR_VARIANTS = 32;

/**
 * Distinct baked poses in the walk, and **three is a four-beat cycle** because
 * the pass position is used twice: neutral, left step, neutral, right step.
 * Baking the repeat would cost a third more memory for a cell already in hand.
 *
 * Four beats is the minimum that reads as a walk rather than a shuffle, and at
 * this size more would be spent on nothing — the arms travel about three
 * pixels between the ends of a stride.
 */
export const CHAR_FRAMES = 3;

/** Where in a stride each baked frame sits. Index is the frame. */
const FRAME_GAIT = [0, 1, -1];

/** The cycle, as frame indices. The pass frame appears twice on purpose. */
const CYCLE = [0, 1, 0, 2];

/**
 * Ground covered per beat, so the legs keep up with the body rather than
 * running on a clock of their own — the same rule the dog's gait follows.
 *
 * **It is derived from the body's own scale rather than picked**, because a
 * cadence that does not match the pace is exactly what reads as sliding, and
 * that was half of the reported *"the steps and swinging of the arms [should]
 * match the movement of the NPC"*. A body is drawn `CHAR_BOX_RADII` radii
 * across and its shoulders are 0.40 of that box — about 24 world pixels for a
 * 13px human radius — which against a real adult's 45cm shoulders puts one
 * world pixel at roughly 1.9cm. An adult's walking gait cycle (left step, then
 * right) covers about 1.4m, so a full four-beat cycle is ~74 world pixels and
 * one beat is about 19.
 *
 * At 26 the body covered a third more ground than its own legs accounted for,
 * which is a moonwalk however good the pose is.
 */
const STRIDE_PX = 19;

/**
 * A step longer than this is not walking. Interpolated bodies jump when they
 * re-enter view, and an entity id is reused when somebody turns — either way
 * the distance between two frames is meaningless and must not be banked.
 */
const TELEPORT_PX = 140;

/** Below this much movement a frame, the body is standing and stands square. */
const STILL_PX = 0.25;

/**
 * How big a body is drawn, as a multiple of its collision radius.
 *
 * The shoulders are 0.40 of the sprite box, so at 4.6 a citizen's shoulders
 * come out about 24px against the 26px disc the game drew before — near enough
 * the same footprint, with the arms, legs and head that the disc never had.
 * Tuned by eye against `preview-ingame.png`; it is the one number here worth
 * fiddling with.
 */
export const CHAR_BOX_RADII = 4.6;

/**
 * Where the sprite's own centre of rotation sits in its box.
 *
 * **Read from `charsprite.ts` rather than written down again.** The sprite is
 * baked already turned about that point, so putting any other point on the
 * entity makes a body wobble as it turns rather than spin — and this was two
 * copies of one number, which is the arrangement that eventually disagrees.
 */
const PIVOT_Y = characterPivotY();

/**
 * Cells to paint per frame before falling back to an angle already in hand.
 *
 * A wrong angle for one frame is a body facing 22 degrees off; a 20ms hitch is
 * a dropped frame. The first is much the cheaper mistake, and it corrects
 * itself on the next frame.
 */
const BAKE_BUDGET = 24;

interface Atlas {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  /** 1 once a cell has been painted. Indexed row * CHAR_ANGLES + angle. */
  done: Uint8Array;
  /** Any angle known to be painted, per row, or -1. The fallback. */
  anyAngle: Int16Array;
}

const atlases = new Map<CharKind, Atlas>();
let budget = BAKE_BUDGET;
let budgetAt = -1;

function atlasFor(kind: CharKind): Atlas {
  let a = atlases.get(kind);
  if (a) return a;
  const canvas = document.createElement('canvas');
  canvas.width = CHAR_ANGLES * CHAR_SPRITE_PX;
  canvas.height = CHAR_VARIANTS * CHAR_FRAMES * CHAR_SPRITE_PX;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  a = {
    canvas,
    ctx,
    done: new Uint8Array(CHAR_VARIANTS * CHAR_FRAMES * CHAR_ANGLES),
    anyAngle: new Int16Array(CHAR_VARIANTS * CHAR_FRAMES).fill(-1),
  };
  atlases.set(kind, a);
  return a;
}

/** Atlas row for one (variant, frame). Frames of a person sit together. */
const rowOf = (variant: number, frame: number): number => variant * CHAR_FRAMES + frame;

function paint(kind: CharKind, a: Atlas, row: number, angle: number): void {
  const variant = (row / CHAR_FRAMES) | 0;
  const o: CharLook = look(kind, variant + 1);
  o.rot = (angle / CHAR_ANGLES) * Math.PI * 2;
  o.gait = FRAME_GAIT[row % CHAR_FRAMES];
  const pix = drawCharacter(CHAR_SPRITE_PX, o);
  // Via `createImageData` rather than `new ImageData(pix.d, ...)`: the buffer a
  // `Pix` holds is typed `ArrayBufferLike`, which the ImageData constructor
  // will not take. It is a 16KB copy against 0.32ms of drawing.
  const img = a.ctx.createImageData(CHAR_SPRITE_PX, CHAR_SPRITE_PX);
  img.data.set(pix.d);
  a.ctx.putImageData(img, angle * CHAR_SPRITE_PX, row * CHAR_SPRITE_PX);
  a.done[row * CHAR_ANGLES + angle] = 1;
  a.anyAngle[row] = angle;
}

// -------------------------------------------------------------- the cycle ---
interface Walk {
  x: number;
  y: number;
  /** Ground covered, in world pixels, since this body was first seen. */
  dist: number;
  /** Smoothed pace, so a body that has stopped settles onto the pass frame. */
  pace: number;
  seen: number;
}
const walks = new Map<string, Walk>();
let sweptAt = 0;

/**
 * Which frame a body is on, from how far it has actually walked.
 *
 * Driven off ground covered rather than off a clock, which is the rule the
 * dog's gait already follows: a body that has stopped stops stepping, one
 * that is sprinting steps faster, and nothing has to be told which. It is
 * accumulated here from the interpolated positions the renderer is drawing
 * with, so nothing reaches the wire and `main.ts` is untouched.
 */
function frameFor(id: string, x: number, y: number, now: number): number {
  let w = walks.get(id);
  if (!w) {
    w = { x, y, dist: 0, pace: 0, seen: now };
    walks.set(id, w);
    return 0;
  }
  const step = Math.hypot(x - w.x, y - w.y);
  w.x = x;
  w.y = y;
  w.seen = now;
  // A jump is a body coming back into view, or an id reused by somebody who
  // has turned. Neither is a stride, and banking it skips the legs forward.
  if (step < TELEPORT_PX) {
    w.dist += step;
    w.pace += (step - w.pace) * 0.25;
  }
  if (w.pace < STILL_PX) return 0;

  // Sweeping here rather than on a timer of its own: this is the only thing
  // that runs per body per frame, so it is the only thing that knows the map
  // is filling up. A round ends with a few hundred dead ids in it otherwise.
  if (now - sweptAt > 4000) {
    sweptAt = now;
    for (const [k, v] of walks) if (now - v.seen > 4000) walks.delete(k);
  }
  return CYCLE[Math.floor(w.dist / STRIDE_PX) % CYCLE.length];
}

/** A new round is new bodies, whatever the ids say. */
export function clearCharWalks(): void {
  walks.clear();
}

/** A stable variant for an entity id. The same person all round. */
export function variantForId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % CHAR_VARIANTS) | 0;
}

/**
 * The sprite is authored facing NORTH and the game's `facing` 0 is EAST, which
 * is the quarter turn.
 */
export function angleIndexFor(facing: number): number {
  const t = (facing + Math.PI / 2) / (Math.PI * 2);
  return ((Math.round(t * CHAR_ANGLES) % CHAR_ANGLES) + CHAR_ANGLES) % CHAR_ANGLES;
}

/** One cell of a kind's atlas, tinted. Reused, so do not hold on to it. */
let scratch: HTMLCanvasElement | null = null;
function tintedCell(a: Atlas, row: number, angle: number, colour: string, amount: number): HTMLCanvasElement {
  if (!scratch) {
    scratch = document.createElement('canvas');
    scratch.width = CHAR_SPRITE_PX;
    scratch.height = CHAR_SPRITE_PX;
  }
  const s = scratch.getContext('2d')!;
  s.imageSmoothingEnabled = false;
  s.globalCompositeOperation = 'source-over';
  s.globalAlpha = 1;
  s.clearRect(0, 0, CHAR_SPRITE_PX, CHAR_SPRITE_PX);
  s.drawImage(
    a.canvas,
    angle * CHAR_SPRITE_PX, row * CHAR_SPRITE_PX, CHAR_SPRITE_PX, CHAR_SPRITE_PX,
    0, 0, CHAR_SPRITE_PX, CHAR_SPRITE_PX,
  );
  // `source-atop` so the wash lands on the body and not on the empty corners.
  s.globalCompositeOperation = 'source-atop';
  s.globalAlpha = amount;
  s.fillStyle = colour;
  s.fillRect(0, 0, CHAR_SPRITE_PX, CHAR_SPRITE_PX);
  s.globalCompositeOperation = 'source-over';
  s.globalAlpha = 1;
  return scratch;
}

/**
 * Draw one body, in world units, centred on its own pivot.
 *
 * `tint` is how the turning tell survives: the sprite's colours are baked, so
 * a body reddening toward zombie is washed at draw time rather than being a
 * variant of its own. It is a handful of bodies at a time, so the extra canvas
 * costs nothing worth counting.
 */
export function drawCharBody(
  ctx: CanvasRenderingContext2D,
  kind: CharKind,
  id: string,
  x: number,
  y: number,
  facing: number,
  radius: number,
  now: number,
  tint?: { colour: string; amount: number },
): void {
  if (now !== budgetAt) {
    budgetAt = now;
    budget = BAKE_BUDGET;
  }
  const a = atlasFor(kind);
  const row = rowOf(variantForId(id), frameFor(id, x, y, now));
  let angle = angleIndexFor(facing);
  if (!a.done[row * CHAR_ANGLES + angle]) {
    const known = a.anyAngle[row];
    if (budget > 0 || known < 0) {
      budget--;
      paint(kind, a, row, angle);
    } else {
      angle = known;
    }
  }

  const size = radius * CHAR_BOX_RADII;
  const dx = x - size * 0.5;
  const dy = y - size * PIVOT_Y;
  const src = tint && tint.amount > 0.01 ? tintedCell(a, row, angle, tint.colour, tint.amount) : a.canvas;
  const sx = src === a.canvas ? angle * CHAR_SPRITE_PX : 0;
  const sy = src === a.canvas ? row * CHAR_SPRITE_PX : 0;

  // Nearest-neighbour, or the whole point of pixel art is thrown away on the
  // upscale. Saved and restored because the rest of the frame wants smoothing.
  const wasSmooth = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src, sx, sy, CHAR_SPRITE_PX, CHAR_SPRITE_PX, dx, dy, size, size);
  ctx.imageSmoothingEnabled = wasSmooth;
}

/**
 * Drop every baked atlas.
 *
 * **Deliberately not called on a restart**, unlike `clearBlood`, the lash scars
 * and the dog's corner map. Those all hold something about the city that was —
 * a coordinate, a pose, a baked picture of streets that no longer exist. A
 * variant here is keyed by nothing but its own index, and `look()` derives the
 * person from that alone, so variant 12 is the same person in every round this
 * page ever plays. Clearing it would buy back 12MB and then immediately spend
 * a quarter of a second painting the identical cells again.
 *
 * It exists for the rigs, and for the day a look starts depending on something
 * a round owns.
 */
export function clearCharSprites(): void {
  atlases.clear();
}
