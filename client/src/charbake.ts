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
 * kind with a cell per (variant, angle), and `drawImage` takes a sub-rect. A
 * cell is painted the first time anybody needs it and never again. Measured on
 * this box: **0.10ms a cell at 32px and 0.32ms at 64**, so the whole atlas is
 * a quarter of a second spread across a round rather than a stall at startup.
 *
 * The budget below is what stops that becoming a stall anyway. A spectator
 * framing the whole city first-sights hundreds of bodies on one frame, which
 * is this game's known worst case for anything per-entity.
 */
import { drawCharacter, look, type CharKind, type CharLook } from './charsprite.js';

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
 * many are *baked at once*, which is memory. 48 x 16 x 64px is about 12.6MB an
 * atlas, in the same order as the blood layer. A city of 500 with 48 looks
 * repeats, and at this size nobody will pick two of them out of a crowd.
 */
export const CHAR_VARIANTS = 48;

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
 * Where the sprite's own centre of rotation sits in its box. Must match
 * `PIVOT_Y` in `charsprite.ts` — the sprite is baked already turned about that
 * point, so putting any other point on the entity makes a body wobble as it
 * turns rather than spin.
 */
const PIVOT_Y = 0.44;

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
  /** 1 once a cell has been painted. Indexed variant * CHAR_ANGLES + angle. */
  done: Uint8Array;
  /** Any angle known to be painted, per variant, or -1. The fallback. */
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
  canvas.height = CHAR_VARIANTS * CHAR_SPRITE_PX;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  a = {
    canvas,
    ctx,
    done: new Uint8Array(CHAR_VARIANTS * CHAR_ANGLES),
    anyAngle: new Int16Array(CHAR_VARIANTS).fill(-1),
  };
  atlases.set(kind, a);
  return a;
}

function paint(kind: CharKind, a: Atlas, variant: number, angle: number): void {
  const o: CharLook = look(kind, variant + 1);
  o.rot = (angle / CHAR_ANGLES) * Math.PI * 2;
  const pix = drawCharacter(CHAR_SPRITE_PX, o);
  // Via `createImageData` rather than `new ImageData(pix.d, ...)`: the buffer a
  // `Pix` holds is typed `ArrayBufferLike`, which the ImageData constructor
  // will not take. It is a 16KB copy against 0.32ms of drawing.
  const img = a.ctx.createImageData(CHAR_SPRITE_PX, CHAR_SPRITE_PX);
  img.data.set(pix.d);
  a.ctx.putImageData(img, angle * CHAR_SPRITE_PX, variant * CHAR_SPRITE_PX);
  a.done[variant * CHAR_ANGLES + angle] = 1;
  a.anyAngle[variant] = angle;
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
function tintedCell(a: Atlas, variant: number, angle: number, colour: string, amount: number): HTMLCanvasElement {
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
    angle * CHAR_SPRITE_PX, variant * CHAR_SPRITE_PX, CHAR_SPRITE_PX, CHAR_SPRITE_PX,
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
  const variant = variantForId(id);
  let angle = angleIndexFor(facing);
  if (!a.done[variant * CHAR_ANGLES + angle]) {
    const known = a.anyAngle[variant];
    if (budget > 0 || known < 0) {
      budget--;
      paint(kind, a, variant, angle);
    } else {
      angle = known;
    }
  }

  const size = radius * CHAR_BOX_RADII;
  const dx = x - size * 0.5;
  const dy = y - size * PIVOT_Y;
  const src = tint && tint.amount > 0.01 ? tintedCell(a, variant, angle, tint.colour, tint.amount) : a.canvas;
  const sx = src === a.canvas ? angle * CHAR_SPRITE_PX : 0;
  const sy = src === a.canvas ? variant * CHAR_SPRITE_PX : 0;

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
