/**
 * Pixel-art people, generated rather than drawn.
 *
 * **The variety is the whole reason this exists.** A city holds hundreds of
 * civilians and the ask was that they not all be the same person; hand-drawing
 * or buying two hundred sprites is not a thing anybody does, and one generated
 * image is one character. So nothing here is authored per citizen — only the
 * *ranges* each field draws from, and `look()` picks from them off a seed. Skin,
 * hair, hairstyle, hat, shirt, trousers, shoes, build, lean, where the clothing
 * is torn and where the blood landed are all independent, which is tens of
 * thousands of distinct bodies out of about three hundred lines.
 *
 * **It is authored in normalised [0,1] space and rasterised by testing pixel
 * CENTRES, with no antialiasing anywhere.** That is what lets one definition
 * serve both 32x32 and 64x64: detail that is sub-pixel at 32 simply drops out
 * rather than turning to mush. It is also what makes `rot` worth having —
 * the angle is applied to the coordinates *before* rasterising, so a baked
 * frame at 23 degrees is exactly as crisp as the front view. Rotating a
 * finished bitmap is the thing this avoids, and it is the reason a generator
 * beats a sprite sheet for a game that turns bodies freely.
 *
 * No DOM and no node here on purpose: `charbake.ts` turns these into canvases
 * for the game and `spritesheet.ts` turns them into PNGs for looking at, and
 * neither of those is a fact about how a person is drawn.
 */

// ---------------------------------------------------------------- colour ----
export type RGBA = [number, number, number, number];

export const hex = (h: string): RGBA => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
  255,
];
const mix = (a: RGBA, b: RGBA, t: number): RGBA => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
  a[3],
];
const dark = (c: RGBA, t: number): RGBA => mix(c, [16, 13, 16, 255], t);
const lite = (c: RGBA, t: number): RGBA => mix(c, [255, 246, 232, 255], t);
const alpha = (c: RGBA, a: number): RGBA => [c[0], c[1], c[2], Math.round(a * 255)];
const desat = (c: RGBA, t: number): RGBA => {
  const g = c[0] * 0.34 + c[1] * 0.5 + c[2] * 0.16;
  return mix(c, [g, g, g, c[3]], t);
};

/** mulberry32. Seeded, so the same person is the same person every frame. */
export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = <T>(r: () => number, a: readonly T[]): T => a[Math.floor(r() * a.length) % a.length];

// -------------------------------------------------------------- the buffer --
/**
 * A plain RGBA buffer with src-over compositing and no antialiasing.
 *
 * `Uint8ClampedArray` rather than `Uint8Array` so the browser side can hand
 * `d` straight to `new ImageData(...)` with no copy.
 */
export class Pix {
  readonly w: number;
  readonly h: number;
  readonly d: Uint8ClampedArray;
  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.d = new Uint8ClampedArray(w * h * 4);
  }
  set(x: number, y: number, c: RGBA): void {
    x |= 0;
    y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    const d = this.d;
    const a = c[3] / 255;
    if (a >= 1) {
      d[i] = c[0];
      d[i + 1] = c[1];
      d[i + 2] = c[2];
      d[i + 3] = 255;
      return;
    }
    if (a <= 0) return;
    const da = d[i + 3] / 255;
    const oa = a + da * (1 - a);
    if (oa <= 0) return;
    d[i] = (c[0] * a + d[i] * da * (1 - a)) / oa;
    d[i + 1] = (c[1] * a + d[i + 1] * da * (1 - a)) / oa;
    d[i + 2] = (c[2] * a + d[i + 2] * da * (1 - a)) / oa;
    d[i + 3] = oa * 255;
  }
  alpha(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
    return this.d[(y * this.w + x) * 4 + 3];
  }
}

export function blit(dst: Pix, src: Pix, dx = 0, dy = 0, scale = 1): void {
  for (let y = 0; y < src.h; y++)
    for (let x = 0; x < src.w; x++) {
      const i = (y * src.w + x) * 4;
      if (src.d[i + 3] === 0) continue;
      const c: RGBA = [src.d[i], src.d[i + 1], src.d[i + 2], src.d[i + 3]];
      for (let sy = 0; sy < scale; sy++)
        for (let sx = 0; sx < scale; sx++) dst.set(dx + x * scale + sx, dy + y * scale + sy, c);
    }
}

// -------------------------------------------------------------- geometry ----
interface Ctx {
  rot: number;
}

/**
 * Where the body's own middle sits in the box — the point it turns about, and
 * the point `charbake.ts` puts on the entity's position. **Change it in both.**
 *
 * It was 0.44, which is the *head*, and that was a real contributor to the
 * reported "everyone seems to be walking backwards": the crown was pinned on
 * the entity and the torso, hips and feet all hung off the back of it, so the
 * mass a player actually looks at trailed its own coordinate by about four
 * screen pixels at the camera's zoom. 0.49 is the middle of the compressed
 * figure below, so a body now sits *on* where the game says it is.
 */
let PIVOT_Y = 0.49;

function pt(ctx: Ctx, x: number, y: number): [number, number] {
  if (!ctx.rot) return [x, y];
  const c = Math.cos(ctx.rot);
  const s = Math.sin(ctx.rot);
  const dx = x - 0.5;
  const dy = y - PIVOT_Y;
  return [0.5 + dx * c - dy * s, PIVOT_Y + dx * s + dy * c];
}

/** Superellipse. n=2 is an ellipse; n>2 squares the shoulders off. */
export function sup(
  p: Pix, ctx: Ctx, cx: number, cy: number, rx: number, ry: number, n: number, col: RGBA, rot = 0,
): void {
  [cx, cy] = pt(ctx, cx, cy);
  const th = rot + ctx.rot;
  const S = p.w;
  const cs = Math.cos(-th);
  const sn = Math.sin(-th);
  const R = Math.hypot(rx, ry);
  const x0 = Math.max(0, Math.floor((cx - R) * S));
  const x1 = Math.min(S - 1, Math.ceil((cx + R) * S));
  const y0 = Math.max(0, Math.floor((cy - R) * S));
  const y1 = Math.min(S - 1, Math.ceil((cy + R) * S));
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const u = (x + 0.5) / S - cx;
      const v = (y + 0.5) / S - cy;
      const a = u * cs - v * sn;
      const b = u * sn + v * cs;
      const q =
        n === 2
          ? (a / rx) * (a / rx) + (b / ry) * (b / ry)
          : Math.pow(Math.abs(a / rx), n) + Math.pow(Math.abs(b / ry), n);
      if (q <= 1) p.set(x, y, col);
    }
}
export const ell = (
  p: Pix, ctx: Ctx, cx: number, cy: number, rx: number, ry: number, col: RGBA, rot = 0,
): void => sup(p, ctx, cx, cy, rx, ry, 2, col, rot);

export function capsule(
  p: Pix, ctx: Ctx, x0: number, y0: number, x1: number, y1: number, r: number, col: RGBA,
): void {
  [x0, y0] = pt(ctx, x0, y0);
  [x1, y1] = pt(ctx, x1, y1);
  const S = p.w;
  const bx0 = Math.max(0, Math.floor((Math.min(x0, x1) - r) * S));
  const bx1 = Math.min(S - 1, Math.ceil((Math.max(x0, x1) + r) * S));
  const by0 = Math.max(0, Math.floor((Math.min(y0, y1) - r) * S));
  const by1 = Math.min(S - 1, Math.ceil((Math.max(y0, y1) + r) * S));
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len2 = dx * dx + dy * dy || 1e-9;
  for (let y = by0; y <= by1; y++)
    for (let x = bx0; x <= bx1; x++) {
      const px = (x + 0.5) / S;
      const py = (y + 0.5) / S;
      let t = ((px - x0) * dx + (py - y0) * dy) / len2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ex = px - (x0 + dx * t);
      const ey = py - (y0 + dy * t);
      if (ex * ex + ey * ey <= r * r) p.set(x, y, col);
    }
}

interface BlobOpt { n?: number; rot?: number; lift?: number; hi?: number }

/**
 * A rounded mass lit from the upper left. Three passes — a dark base, the body
 * inset toward the light, a small highlight — and it is most of what stops a
 * top-down sprite reading as a flat sticker.
 */
function blob(
  p: Pix, ctx: Ctx, cx: number, cy: number, rx: number, ry: number, col: RGBA, opt: BlobOpt = {},
): void {
  const n = opt.n ?? 2;
  const rot = opt.rot ?? 0;
  const lift = opt.lift ?? 0.3;
  const hi = opt.hi ?? 0.14;
  sup(p, ctx, cx, cy, rx, ry, n, dark(col, 0.38), rot);
  sup(p, ctx, cx - rx * lift * 0.5, cy - ry * lift * 0.5, rx * 0.84, ry * 0.84, n, col, rot);
  if (hi > 0)
    sup(p, ctx, cx - rx * lift * 0.95, cy - ry * lift * 0.95, rx * 0.46, ry * 0.46, n, lite(col, hi), rot);
}

function limb(
  p: Pix, ctx: Ctx, x0: number, y0: number, x1: number, y1: number, r: number, col: RGBA,
): void {
  capsule(p, ctx, x0, y0, x1, y1, r, dark(col, 0.38));
  capsule(p, ctx, x0 - r * 0.22, y0 - r * 0.22, x1 - r * 0.22, y1 - r * 0.22, r * 0.66, col);
}

/**
 * Upper arm out to the elbow, forearm back in to the hand. A straight line from
 * shoulder to hand is what makes a forward pose read as an arrowhead rather
 * than as a person holding something.
 */
function arm2(
  p: Pix, ctx: Ctx,
  sx: number, sy: number, ex: number, ey: number, hx: number, hy: number,
  r: number, col: RGBA,
): void {
  limb(p, ctx, sx, sy, ex, ey, r, col);
  limb(p, ctx, ex, ey, hx, hy, r * 0.9, col);
}

export function outlineOf(src: Pix, col: RGBA): Pix {
  const out = new Pix(src.w, src.h);
  for (let y = 0; y < src.h; y++)
    for (let x = 0; x < src.w; x++) {
      if (src.alpha(x, y) > 12) continue;
      if (
        src.alpha(x - 1, y) > 40 || src.alpha(x + 1, y) > 40 ||
        src.alpha(x, y - 1) > 40 || src.alpha(x, y + 1) > 40
      )
        out.set(x, y, col);
    }
  return out;
}

// -------------------------------------------------------------- palettes ----
export const SKIN = ['#e8b48c','#d99e75','#c08258','#9c6440','#7a4a2e','#5c3722','#f2cba7','#b07347'].map(hex);
export const HAIR = ['#241c14','#3d2b1c','#5a3f26','#7d5a33','#c2a05c','#8a3b1e','#a9a9a3','#111111','#6b6257'].map(hex);
export const SHIRT = [
  '#8c4040','#3f5f80','#4e6f3c','#6f5c3a','#7a4a6b','#8f8f86','#c6b68e','#3d3d47',
  '#a55f33','#5c7c7c','#94404f','#d2c2aa','#5a4a7a','#2f6b5a','#b8874a','#6e6e78',
].map(hex);
export const PANTS = ['#2f3542','#3d3d34','#4c3c2e','#2b3c4c','#57524c','#3c3131','#5e5245','#22262e'].map(hex);
export const SHOE = ['#1a1614','#241c18','#2e2622','#141414'].map(hex);
export const ZSKIN = ['#7e9070','#8e9880','#6d7c5e','#95a184','#616d54','#8c8674','#77836b','#a0a08a'].map(hex);

/**
 * Three separated values, not one navy. A uniform drawn in a single colour
 * merges the sleeves, the vest and the cap into one silhouette, which is what
 * made the first officers read as a pentagon rather than as a person.
 */
const COP_NAVY = hex('#3a4763'); // shirt and sleeves — the lightest of the three
const COP_VEST = hex('#1e2534'); // the plate over the chest
const COP_TRIM = hex('#12161f'); // belt, holster, cap peak
const BADGE = hex('#c9b45e');
const GUNMETAL = hex('#191b20');
const BLOOD = hex('#6e1616');
const BLOOD_HI = hex('#94241f');
const OUTLINE: RGBA = [10, 8, 10, 235];

// ------------------------------------------------------- the layer stack ----
/**
 * The shoulder line. Every other layer is authored as a distance in front of
 * or behind it, so there is exactly one place to squash the figure from.
 */
const SH_Y = 0.505;

/**
 * How much of a side-on layout survives into the top-down one.
 *
 * A person seen from **directly above** has their head, shoulders, hips and
 * feet stacked almost on top of each other — what pulls those apart on screen
 * is perspective, and there is none here. Authored at 1.0 the layers spread
 * 0.23 of the box along the body axis, which is a three-quarter view wearing a
 * top-down hat: the crown leads, the feet trail well out the back, and the
 * figure reads as somebody leaning into a walk seen from a low camera.
 *
 * Reported as *"I want to push everything (the layers of what makes the
 * people) more on top of each other … closer to a more top down view"*, and it
 * is deliberately a squash rather than a redraw: every layer keeps its shape,
 * its size and its draw order, and only the gaps between them come in. At 64px
 * that is about two pixels off each, which is what was asked for.
 */
let TOPDOWN = 0.62;

// Layer offsets along the body axis, before `TOPDOWN` squashes them.
/**
 * The crown, in front of the shoulders.
 *
 * 0.080 put the head's centre about half a head radius ahead of the shoulder
 * line even after the squash, and reported as *"push their heads a little more
 * to the center"* it came in to 0.030 — about a pixel and a quarter ahead at
 * 64px rather than three. 0.050 was tried first and could not be told from the
 * old figure at the size the game draws a body. From directly above, somebody
 * standing upright has their head over their shoulders; a crown leading the
 * torso is somebody leaning into a walk. The nose notch still breaks the
 * crown's leading edge, which is what says which way the head is turned.
 */
let HEAD_AHEAD = 0.030;
const HIP_BEHIND = 0.080;
const LEG_BEHIND = 0.107;
const SHOE_BEHIND = 0.147;
const HAIR_BEHIND = 0.048; // long hair, off the back of the head
const ZOMBIE_REACH = 0.260; // a shambler's hands, in front of its shoulders
const AIM_REACH = 0.250; // an officer's hands on a raised weapon

// ------------------------------------------------------------- the walk -----
/**
 * How far a limb travels between the two ends of a stride, and how far the
 * shoulders turn against the hips.
 *
 * **An arm swings well forward of the shoulder and only a little way back**,
 * and that asymmetry is most of what says which end of a top-down body is the
 * front. Hung at the sides and swung evenly they never once cleared the
 * shoulder line, so the only limbs ever visible outside the torso were *behind*
 * it: the eye put the front of the body at the widest, busiest end and the
 * figure read as reversed. Reported as *"swing their arms further forward"* and
 * *"everyone seems to be walking backwards"*, which turned out to be two halves
 * of one thing.
 *
 * `ARM_REST` is where a hand sits standing square — at the hip, so a body that
 * has stopped is still a body with its arms down rather than out.
 *
 * **Then it came back in a little** (0.185/0.062 to 0.150/0.050), reported as
 * *"jiggling their arms too much"*. Most of that was the pose flicker fixed in
 * `chargait.ts`, but three poses had also sent a hand the full length of its
 * swing in one jump. The forward bias is kept; a stroll only ever reaches two
 * thirds of this anyway, and a run the whole of it.
 */
let ARM_REST = 0.105;
let ARM_FWD = 0.150;
let ARM_BACK = 0.050;
/**
 * The feet straddle the hip line rather than trailing behind it. At 0.030 the
 * forward foot never cleared the hips, so only the *back* one was ever visible
 * outside the body — the same mass-at-the-back fault the arms had.
 */
let LEG_SWING = 0.046;
/**
 * Radians. 0.13 was tuned against three baked poses, where the whole stride
 * was two frames; with seven, the shoulders turning that far moves the torso's
 * leading edge a pixel on every pose change, and that edge shimmer is part of
 * what read as the crowd jiggling.
 */
const TWIST = 0.10;

/** The crown's radius. Small in a wide shoulder mass is what top-down looks like. */
let HEAD_R = 0.106;
/** How long the cast shadow runs, and how wide its pool is. */
let SHADOW_END = 0.655;
let SHADOW_R = 0.14;
let SHADOW_POOL = 0.225;

/**
 * Put the figure back the way it was laid out before the top-down pass.
 *
 * **Kept rather than deleted, because the control is the whole value of the
 * measurement.** "The forward hand reaches 20px in front of the shoulders" says
 * nothing on its own; "it was 7px, and that 7px was an *elbow* — no hand ever
 * cleared the shoulder line at all" is the finding. Same for the squash: 38px
 * of spread only means something against the 51px it replaced.
 *
 * It restores the layer stack, the head, the arm swing, the leg swing, the
 * shadow and the pivot. **The elbow is the one thing it does not reproduce
 * exactly** — the old one sat at a fixed offset where this one tracks the
 * hand — so quote it for hands, layers and mass and not for elbows.
 */
export function setFlatCharacters(on: boolean): void {
  TOPDOWN = on ? 1 : 0.62;
  HEAD_R = on ? 0.128 : 0.106;
  ARM_REST = on ? 0.150 : 0.105;
  ARM_FWD = on ? 0.088 : 0.150;
  ARM_BACK = on ? 0.088 : 0.050;
  HEAD_AHEAD = on ? 0.080 : 0.030;
  LEG_SWING = on ? 0.030 : 0.046;
  SHADOW_END = on ? 0.80 : 0.655;
  SHADOW_R = on ? 0.15 : 0.14;
  SHADOW_POOL = on ? 0.235 : 0.225;
  PIVOT_Y = on ? 0.44 : 0.49;
}
/** Where `charbake.ts` must put the sprite on the entity, for the mode in force. */
export const characterPivotY = (): number => PIVOT_Y;
/** How far the crown leads the shoulder line, squashed, for the mode in force. */
export const characterHeadAhead = (): number => HEAD_AHEAD * TOPDOWN;

export type CharKind = 'citizen' | 'officer' | 'zombie';

export interface CharLook {
  kind: CharKind;
  seed: number;
  skin: RGBA;
  hair: RGBA;
  /** 0 bald · 1 short · 2 buzz · 3 long · 4 cap · 5 helmet */
  hairStyle: number;
  hatCol: RGBA;
  shirt: RGBA;
  pants: RGBA;
  shoe: RGBA;
  build: number;
  lean: number;
  strap: boolean;
  vest: boolean;
  longGun: boolean;
  pose: 'walk' | 'aim';
  /** -1..1 through a stride. 0 is standing square. */
  gait: number;
  shadow: boolean;
  rot: number;
}

/** One person's whole look, from a seed. */
export function look(kind: CharKind, seed: number): CharLook {
  const r = rng(seed * 2654435761 + 17);
  const cop = kind === 'officer';
  const z = kind === 'zombie';
  const shirt = pick(r, SHIRT);
  const cr = r();
  // Mostly covered heads for an officer. A bare one still turns up — it is
  // what the hair colour is *for* — but a uniform is most of the identity and
  // a row of bare heads reads as civilians in navy.
  const headgear = cop ? (cr < 0.52 ? 4 : cr < 0.8 ? 5 : 1) : Math.floor(r() * 5);
  return {
    kind,
    seed,
    skin: z ? pick(r, ZSKIN) : pick(r, SKIN),
    hair: pick(r, HAIR),
    hairStyle: headgear,
    hatCol: pick(r, SHIRT),
    shirt: cop ? COP_NAVY : z ? desat(dark(shirt, 0.3), 0.35) : shirt,
    pants: cop ? COP_TRIM : z ? desat(dark(pick(r, PANTS), 0.25), 0.3) : pick(r, PANTS),
    shoe: pick(r, SHOE),
    build: 0.9 + r() * 0.26,
    lean: (r() - 0.5) * (z ? 0.055 : 0.018),
    strap: !cop && !z && r() < 0.3,
    vest: cop && r() < 0.6,
    longGun: cop && r() < 0.35,
    pose: 'walk',
    gait: 0,
    shadow: true,
    rot: 0,
  };
}

// -------------------------------------------------------------- the sprite --
/** Authored facing NORTH (-y). `look.rot` turns it, in vector space. */
export function drawCharacter(S: number, o: CharLook): Pix {
  const body = new Pix(S, S);
  const shad = new Pix(S, S);
  const ctx: Ctx = { rot: o.rot || 0 };
  const flat: Ctx = { rot: 0 }; // the light does not turn with the body
  const D = S >= 48; // detail tier
  const r = rng((o.seed | 0) * 74019 + 3);
  const b = o.build ?? 1;
  const z = o.kind === 'zombie';
  const cop = o.kind === 'officer';
  const lean = o.lean || 0;

  // A human from directly above is WIDE and SHALLOW — shoulders about 45cm
  // across against a chest about 25cm deep. Authoring the torso taller than it
  // is wide is what makes a top-down figure read as a ball, and it did.
  const shW = 0.2 * b;
  const shD = 0.132 * b;
  const shY = SH_Y;
  const headR = HEAD_R + (b - 1) * 0.03;
  /**
   * The crown sits nearly ON the shoulder line, proud of it by about half a
   * head radius and no more — and `TOPDOWN` then brings even that in.
   *
   * At 0.352 the head centre was a full head radius ahead of the torso centre
   * and barely overlapped it, and the feet trailed to 0.770 — so the figure ran
   * 0.55 of the box long against 0.40 wide. Longer than it is wide is the
   * proportion of somebody **bent over**, and it was reported as exactly that:
   * hunched too far forward. Standing upright and seen from directly above, a
   * person is wider than they are deep and their feet are mostly under them.
   */
  const headY = shY - HEAD_AHEAD * TOPDOWN;
  const headX = 0.5 + lean;
  const jointX = shW * 0.92;
  const jointY = shY - shD * 0.3;

  /**
   * How far through a stride this frame is: 0 stands square, ±1 is a full step
   * with the opposite arm forward. See `chargait.ts` for which of the seven
   * baked values a body is on and how the cycle is driven off ground covered.
   */
  const g = o.gait ?? 0;

  // Shortened with the body. The offset is the city's light and stays; the
  // *length* was sized for a figure that ran to y=0.77, and a shadow reaching
  // a third of the box further back than anything casting it is one more lump
  // of mass behind the body — which is the read this whole pass is about.
  if (o.shadow) {
    capsule(shad, flat, 0.515, 0.545, 0.552, SHADOW_END, SHADOW_R * b, alpha([0, 0, 0, 255], 0.3));
    ell(shad, flat, 0.52, 0.53, SHADOW_POOL * b, 0.145 * b, alpha([0, 0, 0, 255], 0.34));
  }

  // The legs swing opposite to the arms — that is what a walk *is*, and getting
  // it the wrong way round reads as a shuffle however big the swing.
  for (const s of [-1, 1]) {
    const fx = 0.5 + s * 0.07 * b;
    const step = -s * g * LEG_SWING;
    blob(body, ctx, fx, shY + LEG_BEHIND * TOPDOWN + step, 0.058 * b, 0.070 * b, o.pants, { n: 2.4, hi: 0 });
    blob(body, ctx, fx + s * 0.005, shY + SHOE_BEHIND * TOPDOWN + step * 1.35, 0.046 * b, 0.052 * b, o.shoe, { n: 2.6, hi: 0.08 });
  }
  // Hips and shoulders counter-rotate, which from above is most of what says
  // this is a person walking rather than a person sliding.
  blob(body, ctx, 0.5, shY + HIP_BEHIND * TOPDOWN, 0.15 * b, 0.072 * b, o.pants, { n: 2.6, rot: -g * TWIST, hi: 0.06 });

  blob(body, ctx, 0.5, shY, shW, shD, o.shirt, { n: 2.9, rot: g * TWIST, lift: 0.26, hi: 0.13 });

  if (z) {
    const tears = 2 + Math.floor(r() * 3);
    for (let i = 0; i < tears; i++) {
      const a = r() * Math.PI * 2;
      const d = r() * 0.5;
      const tx = 0.5 + Math.cos(a) * shW * d;
      const ty = shY + Math.sin(a) * shD * d;
      const rr = (0.022 + r() * 0.024) * b;
      ell(body, ctx, tx, ty, rr * 1.3, rr * 1.3, dark(o.shirt, 0.55));
      ell(body, ctx, tx, ty, rr, rr, dark(o.skin, 0.18));
      if (D && r() < 0.6) ell(body, ctx, tx + rr * 0.2, ty + rr * 0.2, rr * 0.5, rr * 0.5, BLOOD);
    }
  }

  if (cop) {
    if (o.vest)
      blob(body, ctx, 0.5, shY + 0.01, shW * 0.72, shD * 0.78, COP_VEST, { n: 2.9, lift: 0.22, hi: 0.06 });
    sup(body, ctx, 0.5, shY + shD * 0.88, shW * 0.88, 0.016, 2.6, COP_TRIM);
    if (D) {
      ell(body, ctx, 0.5 - shW * 0.46, shY - shD * 0.34, 0.017, 0.017, BADGE);
      ell(body, ctx, 0.5 + shW * 0.58, shY - shD * 0.3, 0.023, 0.032, COP_TRIM);
      ell(body, ctx, 0.5 + shW * 0.58, shY - shD * 0.82, 0.007, 0.02, lite(COP_TRIM, 0.22));
      sup(body, ctx, 0.5 + shW * 0.66, shY + shD * 0.92, 0.025, 0.03, 2.4, GUNMETAL);
    }
  } else if (o.strap && D) {
    capsule(body, ctx, 0.5 - shW * 0.72, shY - shD * 0.55, 0.5 + shW * 0.6, shY + shD * 1.1, 0.015, dark(o.pants, 0.35));
  }

  if (o.hairStyle === 3)
    blob(body, ctx, headX, headY + HAIR_BEHIND * TOPDOWN, headR * 1.16, headR * 1.3, o.hair, { hi: 0.07 });

  // the neck, so the head reads as sitting on the body rather than in it
  ell(body, ctx, headX, headY + headR * 0.86, headR * 0.62, headR * 0.42, dark(o.skin, 0.42));

  /**
   * The head, and the one thing to get right about it.
   *
   * From directly above you see the **crown** — hair, and a sliver of forehead
   * at the leading edge. The first cut left a wide skin crescent, lit it with a
   * highlight, and put a *lit* bump in the middle of it for the nose; between
   * them that is a forehead, a brow and a nose seen from the front, and the
   * whole row read as people lying on their backs looking at the sky. Reported
   * exactly that way. So: the hair sits further forward, the head's own
   * highlight is weaker, and the nose is a dark notch breaking the silhouette
   * rather than a feature painted on top of it.
   *
   * **And it is only half fixed — this is the open one.** Reported again over a
   * live frame: *"a lot of the sprites have faces that are painted as if they
   * are looking straight up at the sky … his hat at the side of his head and
   * his hair making it look like he is craning his head to look straight up at
   * the camera."* It is the hat and hair *placement on the crown* rather than
   * the layer stack — `hairStyle` 3 and 4 both sit off-centre enough to read as
   * a head tipped back — so it wants its own pass over the block below rather
   * than another number in the stack above.
   */
  blob(body, ctx, headX, headY, headR, headR * 1.06, o.skin, { lift: 0.34, hi: 0.1 });
  if (o.hairStyle === 1 || o.hairStyle === 3) {
    blob(body, ctx, headX, headY + headR * 0.06, headR, headR * 1.0, o.hair, { hi: 0.12 });
  } else if (o.hairStyle === 2) {
    blob(body, ctx, headX, headY + headR * 0.1, headR * 0.95, headR * 0.94, dark(o.hair, 0.18), { hi: 0.06 });
  } else if (o.hairStyle === 4) {
    const cap = cop ? lite(COP_NAVY, 0.12) : o.hatCol;
    blob(body, ctx, headX, headY + headR * 0.04, headR * 1.04, headR * 1.04, cap, { hi: 0.26 });
    ell(body, ctx, headX, headY - headR * 0.92, headR * 0.82, headR * 0.32, COP_TRIM);
    if (cop && D) ell(body, ctx, headX, headY - headR * 0.26, 0.016, 0.016, BADGE);
  } else if (o.hairStyle === 5) {
    blob(body, ctx, headX, headY, headR * 1.1, headR * 1.12, lite(COP_TRIM, 0.16), { hi: 0.3 });
    if (D)
      capsule(body, ctx, headX - headR * 0.9, headY - headR * 0.06, headX + headR * 0.9, headY - headR * 0.06, 0.009, COP_TRIM);
  }
  if (z) {
    const patches = Math.floor(r() * 3);
    for (let i = 0; i < patches; i++) {
      const a = r() * Math.PI * 2;
      const d = r() * headR * 0.55;
      ell(body, ctx, headX + Math.cos(a) * d, headY + Math.sin(a) * d, headR * 0.26, headR * 0.26, dark(o.skin, 0.1));
    }
  }
  // The nose: a dark notch that breaks the crown's outline at the leading edge.
  // It is the one cue that says which way this is facing, and it must not be
  // lit — a highlight here is a face rather than a nose.
  ell(body, ctx, headX, headY - headR * 1.0, headR * 0.17, headR * 0.2, dark(o.skin, 0.34));

  // arms last: extended forward, they pass over the head from this angle
  const arm = z ? o.skin : cop ? lite(COP_NAVY, 0.06) : o.shirt;
  const armR = 0.046 + (b - 1) * 0.028;
  if (z) {
    for (const s of [-1, 1]) {
      const drift = s < 0 ? lean : -lean;
      const ex = 0.5 + s * (jointX + 0.03);
      // Tracks the body back with the head — the reach is measured off the
      // crown, so leaving it where it was would stretch the arms out in front
      // of an animal that is no longer leaning into them.
      // Clear of the crown in BOTH axes. Tracked back with the head at first
      // and only partway, which put the hands level with the top of the skull
      // and inside its width — so the two arms met round it and the whole
      // thing read as a body holding its own head rather than reaching.
      const ey = jointY - 0.075 * TOPDOWN;
      const hx = 0.5 + s * (0.140 + drift * 0.6);
      const hy =
        jointY - ZOMBIE_REACH * TOPDOWN + Math.abs(lean) * (s > 0 ? 1.4 : 0) + s * g * ARM_FWD * 0.3;
      arm2(body, ctx, 0.5 + s * jointX, jointY, ex, ey, hx, hy, armR, arm);
      blob(body, ctx, hx, hy - 0.008, armR * 1.04, armR * 1.04, o.skin, { hi: 0.12 });
      if (D) ell(body, ctx, hx, hy - 0.024, armR * 0.55, armR * 0.34, BLOOD_HI);
    }
  } else if (cop && o.pose === 'aim') {
    // Hands go clear ABOVE the crown, never across it. Bracketing the head is
    // what reads as aiming; crossing it just deletes the head.
    const hy = jointY - AIM_REACH * TOPDOWN;
    for (const s of [-1, 1]) {
      const ex = 0.5 + s * (jointX + 0.022);
      const ey = jointY - 0.048 * TOPDOWN;
      const hx = 0.5 + s * (o.longGun ? 0.04 : 0.05);
      const hyy = o.longGun && s < 0 ? hy + 0.052 : hy;
      arm2(body, ctx, 0.5 + s * jointX, jointY, ex, ey, hx, hyy, armR, arm);
      blob(body, ctx, hx, hyy, armR * 0.88, armR * 0.88, o.skin, { hi: 0.1 });
    }
    // The weapon is the lightest thing on the sprite — it is the one detail
    // that has to survive being three pixels wide at 32.
    if (o.longGun) {
      sup(body, ctx, 0.5, hy + 0.004, 0.034, 0.1, 2.6, lite(GUNMETAL, 0.18));
      sup(body, ctx, 0.5, hy + 0.086, 0.044, 0.038, 2.8, lite(GUNMETAL, 0.3));
      sup(body, ctx, 0.5, hy - 0.086, 0.019, 0.03, 2.4, lite(GUNMETAL, 0.09));
    } else {
      sup(body, ctx, 0.5, hy - 0.02, 0.036, 0.048, 2.6, lite(GUNMETAL, 0.22));
      sup(body, ctx, 0.5, hy - 0.062, 0.019, 0.026, 2.4, lite(GUNMETAL, 0.38));
    }
  } else {
    // At the sides, and swinging *through* the shoulder line rather than
    // behind it. This is the readable half of the walk: the feet are two or
    // three pixels either side of the hips, where a hand out in front of the
    // shoulder is plainly somewhere different from one at the hip.
    for (const s of [-1, 1]) {
      const sw = s * g; // +1 is this arm at the front of its swing
      const reach = ARM_REST * TOPDOWN - sw * (sw > 0 ? ARM_FWD : ARM_BACK);
      // A swung-forward arm comes in toward the centre line as it goes, which
      // is both what one does and what keeps the hand off the shoulder's edge.
      const hx = 0.5 + s * (jointX + 0.04 - Math.max(0, sw) * 0.028);
      const hy = jointY + reach;
      const ex = 0.5 + s * (jointX + 0.052);
      const ey = jointY + reach * 0.45;
      arm2(body, ctx, 0.5 + s * jointX, jointY + 0.012, ex, ey, hx, hy, armR, arm);
      blob(body, ctx, hx, hy, armR * 0.9, armR * 0.9, o.skin, { hi: 0.1 });
    }
  }

  if (z && D) {
    for (let i = 0; i < 4; i++) {
      const a = r() * Math.PI * 2;
      const d = r() * 0.7;
      ell(body, ctx, 0.5 + Math.cos(a) * shW * d, shY - 0.03 + Math.sin(a) * shD * d, 0.011, 0.011, i % 2 ? BLOOD : BLOOD_HI);
    }
  }

  const out = new Pix(S, S);
  blit(out, shad);
  blit(out, outlineOf(body, OUTLINE));
  blit(out, body);
  return out;
}
