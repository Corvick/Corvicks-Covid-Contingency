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
 * The figure is taller than it is wide and does not sit centred in the frame —
 * a raised weapon reaches y=0.07 and the shoes go to y=0.77. Turning it about
 * the canvas centre therefore swings it out of frame at 45 degrees, so it turns
 * about its own middle instead.
 */
const PIVOT_Y = 0.44;

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
  const shY = 0.505;
  const headR = 0.128 + (b - 1) * 0.03;
  const headY = 0.352; // proud of the shoulders
  const headX = 0.5 + lean;
  const jointX = shW * 0.92;
  const jointY = shY - shD * 0.3;

  if (o.shadow) {
    capsule(shad, flat, 0.515, 0.56, 0.575, 0.855, 0.15 * b, alpha([0, 0, 0, 255], 0.3));
    ell(shad, flat, 0.52, 0.545, 0.235 * b, 0.15 * b, alpha([0, 0, 0, 255], 0.34));
  }

  for (const s of [-1, 1]) {
    const fx = 0.5 + s * 0.07 * b;
    blob(body, ctx, fx, 0.625, 0.058 * b, 0.072 * b, o.pants, { n: 2.4, hi: 0 });
    blob(body, ctx, fx + s * 0.005, 0.712, 0.048 * b, 0.058 * b, o.shoe, { n: 2.6, hi: 0.08 });
  }
  blob(body, ctx, 0.5, 0.596, 0.15 * b, 0.078 * b, o.pants, { n: 2.6, hi: 0.06 });

  blob(body, ctx, 0.5, shY, shW, shD, o.shirt, { n: 2.9, lift: 0.26, hi: 0.13 });

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
    blob(body, ctx, headX, headY + 0.048, headR * 1.16, headR * 1.3, o.hair, { hi: 0.07 });

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
      const ey = jointY - 0.088;
      const hx = 0.5 + s * (0.112 + drift * 0.6);
      const hy = 0.172 + Math.abs(lean) * (s > 0 ? 1.4 : 0);
      arm2(body, ctx, 0.5 + s * jointX, jointY, ex, ey, hx, hy, armR, arm);
      blob(body, ctx, hx, hy - 0.008, armR * 1.04, armR * 1.04, o.skin, { hi: 0.12 });
      if (D) ell(body, ctx, hx, hy - 0.024, armR * 0.55, armR * 0.34, BLOOD_HI);
    }
  } else if (cop && o.pose === 'aim') {
    // Hands go clear ABOVE the crown, never across it. Bracketing the head is
    // what reads as aiming; crossing it just deletes the head.
    const hy = 0.176;
    for (const s of [-1, 1]) {
      const ex = 0.5 + s * (jointX + 0.022);
      const ey = jointY - 0.048;
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
    for (const s of [-1, 1]) {
      const swing = s > 0 ? 0.03 : -0.03;
      const ex = 0.5 + s * (jointX + 0.048);
      const ey = jointY + 0.072 + swing;
      const hx = 0.5 + s * (jointX + 0.04);
      const hy = jointY + 0.155 + swing * 1.6;
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
