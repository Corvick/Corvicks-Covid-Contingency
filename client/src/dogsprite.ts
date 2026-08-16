import {
  DOG_ART_RADIUS,
  DOG_BODY_COLOR,
  DOG_HEAD_COLOR,
  DOG_DECAY_COLOR,
  DOG_BONE_COLOR,
} from '../../shared/constants.js';

/**
 * The dog is *painted once and blitted*, not drawn from scratch every frame.
 *
 * **What baking is for here is not detail — it is craft.** The look stays what
 * the rest of the game already is: bold flat shapes with a strong silhouette,
 * the same family as the officers and the crowd. What a bake buys that a live
 * drawing cannot is the finish on those shapes — supersampled edges, and soft
 * form shading that would be far too expensive per frame. Painted fur and
 * per-pixel grain were tried first and thrown away: they read as a different
 * game pasted into this one.
 *
 * **It is parts, not a picture.** One baked sprite of a whole dog would be a
 * dead sprite: the head has to swing on its own, the halves have to come apart
 * and the legs have to walk. So the body, one head half, one limb segment and
 * one paw are baked, and `render.ts` poses them — ordinary 2D cutout animation,
 * which is what buys finished parts *and* articulation at once.
 *
 * Two things do most of the visible work:
 *
 * - **Supersampling.** Everything is painted at `DOG_SS` times final size and
 *   drawn back down, which is a free high-quality antialias. At a body barely
 *   forty pixels long, clean edges are most of what "looks good" means.
 * - **Mirroring.** One head half and one limb are baked and drawn flipped for
 *   the other side, so a change to a shape cannot leave the two sides
 *   disagreeing with each other.
 *
 * Everything here runs once, lazily, on the first dog anybody sees.
 */

/** Painted at this multiple of final size, then drawn back down. */
const DOG_SS = 6;
/** The contour that every part carries. Dark, and the same dark everywhere. */
const DOG_INK = '#0a0806';

export interface Sprite {
  canvas: HTMLCanvasElement;
  /** Where the sprite's own origin sits inside the canvas, in canvas pixels. */
  ox: number;
  oy: number;
  /** Canvas pixels to world pixels. */
  scale: number;
}

export interface DogSprites {
  /** Torso. Origin at the body centre, +x along the spine. */
  body: Sprite;
  /** One half of the head. Origin at the hinge, +x forward, +y outward. */
  headHide: Sprite;
  headBone: Sprite;
  /** One limb segment, origin at the wide end, running out along +x. */
  limb: Sprite;
  paw: Sprite;
}

let sprites: DogSprites | null = null;

export function dogSprites(): DogSprites {
  if (!sprites) {
    sprites = {
      body: paintBody(),
      headHide: paintHeadHalf(false),
      headBone: paintHeadHalf(true),
      limb: paintLimb(),
      paw: paintPaw(),
    };
  }
  return sprites;
}

/**
 * Blit a baked part. `flip` mirrors it across its own +x axis, which is how one
 * baked head half serves both sides of the face, and `stretch` lengthens a limb
 * along its bone without fattening it.
 */
export function drawSprite(
  ctx: CanvasRenderingContext2D,
  s: Sprite,
  x: number,
  y: number,
  angle: number,
  flip = false,
  stretch = 1,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(s.scale * stretch, s.scale * (flip ? -1 : 1));
  ctx.drawImage(s.canvas, -s.ox, -s.oy);
  ctx.restore();
}

// --------------------------------------------------------------- the paint box

/** A tiny deterministic generator, so a rebuild paints the identical dog. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function shade(hex: string, amount: number): string {
  const num = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, (num >> 16) + amount));
  const g = Math.max(0, Math.min(255, ((num >> 8) & 0xff) + amount));
  const b = Math.max(0, Math.min(255, (num & 0xff) + amount));
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * A canvas set up to be painted in *world* pixels with a chosen origin, at
 * `DOG_SS` times the resolution. Everything below draws at life size and comes
 * out supersampled without a single number being scaled by hand.
 */
function easel(
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
  pad = 3,
): { g: CanvasRenderingContext2D; sprite: Sprite } {
  const w = Math.ceil((maxX - minX + pad * 2) * DOG_SS);
  const h = Math.ceil((maxY - minY + pad * 2) * DOG_SS);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  const ox = (-minX + pad) * DOG_SS;
  const oy = (-minY + pad) * DOG_SS;
  g.setTransform(DOG_SS, 0, 0, DOG_SS, ox, oy);
  return { g, sprite: { canvas: c, ox, oy, scale: 1 / DOG_SS } };
}

/**
 * Soft form shading inside a shape that has already been clipped: a blurred
 * dark stroke laid on the shape's own outline.
 *
 * This one trick is what turns a flat blob into a rounded one, and it is the
 * main thing worth baking for — a blur per part per frame is not affordable and
 * a blur per part *ever* is nothing.
 *
 * **A real normal-mapped relight was tried here and reverted** — see the note
 * on the photoreal study in CLAUDE.md. Deriving a height field from each part's
 * own alpha and lighting every pixel off it is strictly better *when it is the
 * only lighting*, and strictly worse laid on top of gradients that were already
 * hand-painted to look right: the two shade the same form twice and the result
 * comes out flat and grey.
 */
function roundOff(
  g: CanvasRenderingContext2D,
  path: () => void,
  width: number,
  blur: number,
  alpha: number,
): void {
  g.filter = `blur(${blur * DOG_SS}px)`;
  g.strokeStyle = `rgba(0,0,0,${alpha})`;
  g.lineWidth = width;
  path();
  g.stroke();
  g.filter = 'none';
}

/**
 * The torso outline — a real closed shape rather than a heap of ellipses.
 *
 * Written as one flank and mirrored, so the two sides cannot drift apart. Wide
 * at the ribs and haunches, pinched at the waist: that pinch is most of what
 * says "dog" from directly above, and it is exactly what a stack of ellipses
 * cannot produce.
 */
function torsoPath(g: CanvasRenderingContext2D, r: number, grow = 0): void {
  const G = grow;
  g.beginPath();
  g.moveTo(1.3 * r + G, 0);
  g.bezierCurveTo(1.28 * r + G, -0.42 * r, 1.05 * r, -0.62 * r - G, 0.72 * r, -0.6 * r - G);
  g.bezierCurveTo(0.36 * r, -0.58 * r - G, 0.02 * r, -0.4 * r - G, -0.3 * r, -0.46 * r - G);
  g.bezierCurveTo(-0.72 * r, -0.54 * r - G, -1.06 * r, -0.6 * r - G, -1.26 * r, -0.34 * r);
  g.bezierCurveTo(-1.4 * r - G, -0.2 * r, -1.44 * r - G, -0.1 * r, -1.46 * r - G, 0);
  g.bezierCurveTo(-1.44 * r - G, 0.1 * r, -1.4 * r - G, 0.2 * r, -1.26 * r, 0.34 * r);
  g.bezierCurveTo(-1.06 * r, 0.6 * r + G, -0.72 * r, 0.54 * r + G, -0.3 * r, 0.46 * r + G);
  g.bezierCurveTo(0.02 * r, 0.4 * r + G, 0.36 * r, 0.58 * r + G, 0.72 * r, 0.6 * r + G);
  g.bezierCurveTo(1.05 * r, 0.62 * r + G, 1.28 * r + G, 0.42 * r, 1.3 * r + G, 0);
  g.closePath();
}

function paintBody(): Sprite {
  const r = DOG_ART_RADIUS;
  const { g, sprite } = easel(-1.5 * r, -0.66 * r, 1.34 * r, 0.66 * r, 3);
  const rand = rng(0x0d06);
  const path = () => torsoPath(g, r, 0);

  // The contour, laid down fat and dark first. The fill goes over the middle of
  // it, so what survives is a rim of ink all the way round the silhouette.
  torsoPath(g, r, 1.2);
  g.fillStyle = DOG_INK;
  g.fill();

  // Base coat: lit from one flank, shadowed on the other. Two stops and a
  // midpoint — enough to have a top and a pair of sides, no more.
  const base = g.createLinearGradient(0, -0.7 * r, 0, 0.7 * r);
  base.addColorStop(0, shade(DOG_BODY_COLOR, 24));
  base.addColorStop(0.45, DOG_BODY_COLOR);
  base.addColorStop(1, shade(DOG_BODY_COLOR, -20));
  path();
  g.fillStyle = base;
  g.fill();

  g.save();
  path();
  g.clip();

  roundOff(g, path, r * 0.4, 1.5, 0.5);

  // Two soft bands: a dark saddle down the back and a highlight along the lit
  // flank. Blurred, so they are form rather than markings.
  g.filter = `blur(${1.3 * DOG_SS}px)`;
  g.fillStyle = 'rgba(0,0,0,0.2)';
  g.beginPath();
  g.ellipse(-0.1 * r, 0.04 * r, 1.05 * r, 0.28 * r, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = 'rgba(196,184,158,0.11)';
  g.beginPath();
  g.ellipse(0.05 * r, -0.34 * r, 0.95 * r, 0.15 * r, 0, 0, Math.PI * 2);
  g.fill();
  g.filter = 'none';

  // Hide gone off. Soft-edged blobs in the sickly tone — the one place the
  // animal is allowed to be patchy, and it stays in the blob idiom.
  g.filter = `blur(${0.8 * DOG_SS}px)`;
  for (let i = 0; i < 7; i++) {
    const x = (-1.25 + rand() * 2.4) * r;
    const y = (rand() - 0.5) * 1.0 * r;
    g.fillStyle = `rgba(139,141,116,${0.12 + rand() * 0.16})`;
    g.beginPath();
    g.ellipse(x, y, r * (0.14 + rand() * 0.22), r * (0.09 + rand() * 0.15), rand() * 3, 0, Math.PI * 2);
    g.fill();
  }
  g.filter = 'none';

  // The open flank: a hole, with bone in it. Small and dark — five even bright
  // bars over a red panel is a barcode, not a ribcage, and at that weight it
  // becomes the only thing anybody looks at, which is the eyes' job.
  {
    const wx = -0.34 * r;
    const wy = -0.16 * r;
    g.filter = `blur(${0.45 * DOG_SS}px)`;
    g.fillStyle = 'rgba(10,6,5,0.9)';
    g.beginPath();
    g.ellipse(wx, wy, r * 0.44, r * 0.21, 0.2, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(78,20,24,0.5)';
    g.beginPath();
    g.ellipse(wx, wy, r * 0.32, r * 0.14, 0.2, 0, Math.PI * 2);
    g.fill();
    g.filter = 'none';

    // Ribs. Four, and deliberately *uneven* — one snapped short, one bowed
    // further out than its neighbours. Evenly spaced and evenly bright is the
    // barcode; irregular is a ribcage somebody has been at.
    g.lineCap = 'round';
    const ribs: Array<[number, number, number]> = [
      [-0.17, 0.13, 0.04],
      [-0.02, 0.15, 0.055],
      [0.12, 0.07, 0.038], // snapped short
      [0.24, 0.12, 0.042],
    ];
    for (const [off, len, wide] of ribs) {
      const along = wx + off * r;
      g.strokeStyle = `rgba(198,190,166,${0.4 + wide * 3})`;
      g.lineWidth = r * wide;
      g.beginPath();
      g.moveTo(along, wy - len * r);
      g.quadraticCurveTo(along + 0.06 * r, wy, along + 0.03 * r, wy + len * r);
      g.stroke();
    }

    // Things living in it. Half a dozen pale grains against the dark of the
    // cavity — the single cheapest unpleasant detail on the whole animal, and
    // it only reads *because* the wound behind them is nearly black.
    const grub = rng(0x4c17);
    g.fillStyle = 'rgba(212,206,180,0.75)';
    for (let i = 0; i < 7; i++) {
      const gx = wx + (grub() - 0.5) * 0.6 * r;
      const gy = wy + (grub() - 0.5) * 0.26 * r;
      g.beginPath();
      g.ellipse(gx, gy, 0.028 * r, 0.016 * r, grub() * 3, 0, Math.PI * 2);
      g.fill();
    }
  }

  // The spine, pushing up through the hide: a row of knuckles running the
  // length of the back. Low contrast and small — it is a texture that says the
  // animal is starved and coming apart, not a second skeleton to look at.
  {
    const knuckle = rng(0x91b2);
    for (let i = 0; i < 9; i++) {
      const along = (-0.95 + i * 0.24) * r;
      const across = 0.08 * r + (knuckle() - 0.5) * 0.04 * r;
      g.fillStyle = 'rgba(0,0,0,0.3)';
      g.beginPath();
      g.ellipse(along, across + 0.03 * r, 0.055 * r, 0.038 * r, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = `rgba(196,188,164,${0.16 + knuckle() * 0.12})`;
      g.beginPath();
      g.ellipse(along, across, 0.05 * r, 0.032 * r, 0, 0, Math.PI * 2);
      g.fill();
    }
  }

  // Matted, wet-looking streaks running back along the flanks — the coat stuck
  // down with something. Dark, with one thin sheen along each so they read as
  // wet rather than merely as dirt.
  {
    const wet = rng(0x2ea9);
    for (let i = 0; i < 5; i++) {
      const x0 = (-1.1 + wet() * 2.0) * r;
      const y0 = (wet() - 0.5) * 1.0 * r;
      const len = (0.2 + wet() * 0.35) * r;
      g.strokeStyle = 'rgba(24,10,9,0.42)';
      g.lineWidth = 0.075 * r;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(x0, y0);
      g.quadraticCurveTo(x0 - len * 0.5, y0 + 0.04 * r, x0 - len, y0 + 0.02 * r);
      g.stroke();
      g.strokeStyle = 'rgba(188,150,140,0.14)';
      g.lineWidth = 0.022 * r;
      g.beginPath();
      g.moveTo(x0, y0 - 0.02 * r);
      g.quadraticCurveTo(x0 - len * 0.5, y0 + 0.02 * r, x0 - len, y0);
      g.stroke();
    }
  }

  // **Chunks out of the outline.** A smooth silhouette reads as a healthy
  // animal whatever is painted inside it, and this is the one change that makes
  // the shape itself look wrong. Dark bites taken out of the edge from
  // *outside* — the clip keeps only the part that lands on the body, so each
  // one is a piece of the dog that is simply missing.
  {
    const bite = rng(0x6d40);
    for (const [ax, ay, size] of [
      [-0.62, -0.58, 0.15],
      [0.34, 0.6, 0.12],
      [-1.15, 0.42, 0.1],
      [0.86, -0.52, 0.09],
      [-0.1, -0.62, 0.11],
    ] as Array<[number, number, number]>) {
      const cx = ax * r * 1.02;
      const cy = ay * r * 1.05;
      g.fillStyle = 'rgba(9,6,5,0.95)';
      g.beginPath();
      g.ellipse(cx, cy, size * r, size * r * 0.78, bite() * 3, 0, Math.PI * 2);
      g.fill();
      // A rim of raw meat where the hide gave way.
      g.strokeStyle = 'rgba(96,26,28,0.5)';
      g.lineWidth = 0.035 * r;
      g.beginPath();
      g.ellipse(cx, cy, size * r * 0.92, size * r * 0.7, bite() * 3, 0, Math.PI * 2);
      g.stroke();
    }
  }

  // Rim light along the lit edge, last, so nothing lies over it. One thin
  // bright line down one flank does more for the sense of a solid body than any
  // amount of interior shading.
  g.filter = `blur(${0.5 * DOG_SS}px)`;
  g.strokeStyle = 'rgba(212,200,172,0.3)';
  g.lineWidth = r * 0.09;
  g.beginPath();
  g.moveTo(-1.1 * r, -0.5 * r);
  g.bezierCurveTo(-0.6 * r, -0.58 * r, 0.1 * r, -0.44 * r, 0.74 * r, -0.56 * r);
  g.stroke();
  g.filter = 'none';

  g.restore();
  return sprite;
}

/**
 * One half of the head.
 *
 * Painted with its hinge at the origin and its inner edge flat along y=0, so
 * `render.ts` rotates it about that hinge and the two halves meet exactly when
 * shut. `bare` paints the side the hide has come off.
 */
function paintHeadHalf(bare: boolean): Sprite {
  const r = DOG_ART_RADIUS;
  // Tall enough for a raked ear to stand clear of the skull.
  const { g, sprite } = easel(-0.3 * r, -0.06 * r, 0.98 * r, 0.68 * r, 2.5);

  const skull = (grow: number) => {
    const G = grow;
    g.beginPath();
    g.moveTo(-0.14 * r - G, -0.02 * r);
    g.bezierCurveTo(-0.2 * r - G, 0.2 * r, -0.06 * r, 0.38 * r + G, 0.2 * r, 0.36 * r + G);
    g.bezierCurveTo(0.44 * r, 0.34 * r + G, 0.64 * r, 0.27 * r + G, 0.8 * r + G, 0.12 * r);
    g.lineTo(0.9 * r + G, -0.02 * r);
    g.closePath();
  };

  // Ears first, so the skull sits over their roots.
  //
  // **Pointed and ragged, not round.** A soft ear on a round head is the single
  // thing that made the whole animal read as cute — it is the shape a puppy
  // has. A sharp blade of an ear swept back off the skull does the opposite,
  // and one of the two is torn: a notch bitten out of the trailing edge, and
  // the bare side's is half gone. Asymmetry is what stops a pair of ears
  // looking designed.
  const ear = (grow: number) => {
    g.beginPath();
    if (bare) {
      // Torn to a stump on the side the hide has come off.
      g.moveTo(0.06 * r, 0.2 * r);
      g.lineTo(-0.09 * r - grow, 0.24 * r);
      g.lineTo(-0.12 * r - grow, 0.42 * r + grow);
      g.lineTo(-0.01 * r, 0.34 * r);
      g.lineTo(0.02 * r, 0.42 * r + grow);
      g.lineTo(0.08 * r + grow, 0.26 * r);
    } else {
      // Whole, but knife-thin and raked back, with a notch out of the back edge.
      g.moveTo(0.1 * r, 0.2 * r);
      g.lineTo(-0.1 * r - grow, 0.26 * r);
      g.lineTo(-0.19 * r - grow, 0.62 * r + grow);
      g.lineTo(-0.06 * r, 0.44 * r);
      g.lineTo(-0.02 * r, 0.56 * r + grow);
      g.lineTo(0.1 * r + grow, 0.28 * r);
    }
    g.closePath();
  };
  g.fillStyle = DOG_INK;
  ear(1.2);
  g.fill();
  g.fillStyle = shade(DOG_HEAD_COLOR, -38);
  ear(0);
  g.fill();
  // A little light down the front of the ear so it is not a flat black flag.
  g.save();
  ear(0);
  g.clip();
  g.filter = `blur(${0.5 * DOG_SS}px)`;
  g.fillStyle = 'rgba(150,120,86,0.28)';
  g.beginPath();
  g.ellipse(-0.02 * r, 0.3 * r, 0.06 * r, 0.14 * r, 0.35, 0, Math.PI * 2);
  g.fill();
  g.filter = 'none';
  g.restore();

  skull(1.2);
  g.fillStyle = DOG_INK;
  g.fill();

  // Weathered bone, or hide. Bone is shaded well down: at full value the bare
  // half is the lightest thing on screen and the animal reads as wearing a mask.
  const boneTone = '#6a6353';
  const base = g.createLinearGradient(0, -0.05 * r, 0, 0.4 * r);
  base.addColorStop(0, bare ? shade(boneTone, 10) : shade(DOG_HEAD_COLOR, -14));
  base.addColorStop(0.55, bare ? shade(DOG_BONE_COLOR, -70) : DOG_HEAD_COLOR);
  base.addColorStop(1, bare ? shade(boneTone, -24) : shade(DOG_HEAD_COLOR, 14));
  skull(0);
  g.fillStyle = base;
  g.fill();

  g.save();
  skull(0);
  g.clip();

  roundOff(g, () => skull(0), r * 0.22, 1.0, 0.45);

  if (bare) {
    // Cheekbone standing proud, and the socket it lost.
    g.filter = `blur(${0.4 * DOG_SS}px)`;
    g.fillStyle = 'rgba(206,199,173,0.28)';
    g.beginPath();
    g.ellipse(0.34 * r, 0.16 * r, 0.2 * r, 0.1 * r, 0.2, 0, Math.PI * 2);
    g.fill();
    g.filter = 'none';
    g.fillStyle = 'rgba(8,5,4,0.92)';
    g.beginPath();
    g.ellipse(0.27 * r, 0.16 * r, 0.095 * r, 0.082 * r, 0, 0, Math.PI * 2);
    g.fill();
    // A crack running back off the socket — one line, not a web of them.
    g.strokeStyle = 'rgba(18,12,10,0.55)';
    g.lineWidth = r * 0.03;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(0.2 * r, 0.22 * r);
    g.lineTo(0.03 * r, 0.31 * r);
    g.stroke();
  } else {
    // A muzzle darker than the cheek, and a wet nose at the tip.
    g.filter = `blur(${0.7 * DOG_SS}px)`;
    g.fillStyle = shade(DOG_HEAD_COLOR, -26);
    g.beginPath();
    g.ellipse(0.62 * r, 0.12 * r, 0.3 * r, 0.14 * r, 0, 0, Math.PI * 2);
    g.fill();
    g.filter = 'none';
    g.fillStyle = '#141013';
    g.beginPath();
    g.ellipse(0.84 * r, 0.05 * r, 0.085 * r, 0.062 * r, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(190,180,180,0.32)';
    g.beginPath();
    g.ellipse(0.83 * r, 0.034 * r, 0.028 * r, 0.019 * r, 0, 0, Math.PI * 2);
    g.fill();
  }

  // **A torn cheek**, on the bare side: the hide has gone from the jaw line and
  // a few back teeth are on show whether the mouth is open or shut. It is the
  // detail that makes the head look wrong even at rest, when the split is a
  // seam and everything else about the face is intact.
  if (bare) {
    g.fillStyle = 'rgba(12,7,6,0.9)';
    g.beginPath();
    g.ellipse(0.5 * r, 0.13 * r, 0.17 * r, 0.075 * r, -0.12, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(226,220,202,0.9)';
    for (let t = 0; t < 4; t++) {
      const px = (0.38 + t * 0.08) * r;
      g.beginPath();
      g.moveTo(px - 0.022 * r, 0.16 * r);
      g.lineTo(px + 0.022 * r, 0.16 * r);
      g.lineTo(px, 0.1 * r);
      g.closePath();
      g.fill();
    }
    g.strokeStyle = 'rgba(92,26,26,0.55)';
    g.lineWidth = 0.028 * r;
    g.beginPath();
    g.ellipse(0.5 * r, 0.13 * r, 0.17 * r, 0.075 * r, -0.12, 0, Math.PI * 2);
    g.stroke();
  }

  // The gum the teeth stand in, along the split line. Dark: a bright line here
  // paints a red stripe across the middle of the face, open or shut.
  g.strokeStyle = 'rgba(52,15,17,0.9)';
  g.lineWidth = r * 0.06;
  g.beginPath();
  g.moveTo(0.04 * r, 0.028 * r);
  g.lineTo(0.86 * r, 0.028 * r);
  g.stroke();

  // **What it has been eating.** Dark staining worked back from the jaw line
  // into the hide, heaviest at the muzzle and thinning toward the cheek. Drawn
  // last so it lies over the teeth as well — clean white teeth in a bloody
  // mouth are the giveaway that the blood is a decal rather than a mess.
  const gore = rng(bare ? 0x51aa : 0x7d3c);
  g.filter = `blur(${0.35 * DOG_SS}px)`;
  for (let i = 0; i < 7; i++) {
    const px = (0.1 + gore() * 0.78) * r;
    const py = (0.03 + gore() * 0.16) * r;
    g.fillStyle = `rgba(72,14,16,${0.2 + gore() * 0.38})`;
    g.beginPath();
    g.ellipse(px, py, (0.05 + gore() * 0.09) * r, (0.03 + gore() * 0.05) * r, gore() * 3, 0, Math.PI * 2);
    g.fill();
  }
  g.filter = 'none';
  // A couple of runs of it dripping back off the jaw.
  g.strokeStyle = 'rgba(78,14,16,0.5)';
  g.lineWidth = 0.03 * r;
  g.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    const px = (0.2 + gore() * 0.5) * r;
    g.beginPath();
    g.moveTo(px, 0.05 * r);
    g.lineTo(px - 0.05 * r, (0.14 + gore() * 0.1) * r);
    g.stroke();
  }

  // Teeth, standing off the split line into the gap — so opening the head is
  // what puts them on show. Two canines, the rest small.
  for (let t = 0; t < 8; t++) {
    const px = (0.1 + t * 0.1) * r;
    const canine = t === 1 || t === 5;
    const len = (canine ? 0.13 : 0.075) * r;
    const wide = (canine ? 0.042 : 0.032) * r;
    const tooth = g.createLinearGradient(px, 0.02 * r, px, 0.02 * r - len);
    tooth.addColorStop(0, 'rgba(160,150,126,1)');
    tooth.addColorStop(1, 'rgba(238,232,214,1)');
    g.fillStyle = tooth;
    g.beginPath();
    g.moveTo(px - wide, 0.03 * r);
    g.lineTo(px + wide, 0.03 * r);
    g.lineTo(px + wide * 0.15, 0.03 * r - len);
    g.closePath();
    g.fill();
  }

  return sprite;
}

/**
 * One limb segment: a tapered bone, origin at the wide end, running out along
 * +x. Both bones of all four legs are this one sprite at different lengths,
 * which is why a leg can still bend at the knee while being a finished part.
 */
function paintLimb(): Sprite {
  const r = DOG_ART_RADIUS;
  const { g, sprite } = easel(-0.16 * r, -0.15 * r, 0.62 * r, 0.15 * r, 1.6);

  const shape = (grow: number) => {
    g.beginPath();
    g.moveTo(-0.02 * r, -0.12 * r - grow);
    g.quadraticCurveTo(0.32 * r, -0.1 * r - grow, 0.56 * r + grow, -0.06 * r);
    g.quadraticCurveTo(0.62 * r + grow, 0, 0.56 * r + grow, 0.06 * r);
    g.quadraticCurveTo(0.32 * r, 0.1 * r + grow, -0.02 * r, 0.12 * r + grow);
    g.quadraticCurveTo(-0.1 * r - grow, 0, -0.02 * r, -0.12 * r - grow);
    g.closePath();
  };

  shape(1.0);
  g.fillStyle = DOG_INK;
  g.fill();

  const base = g.createLinearGradient(0, -0.14 * r, 0, 0.14 * r);
  base.addColorStop(0, shade(DOG_BODY_COLOR, 18));
  base.addColorStop(0.5, shade(DOG_BODY_COLOR, -6));
  base.addColorStop(1, shade(DOG_BODY_COLOR, -24));
  shape(0);
  g.fillStyle = base;
  g.fill();

  g.save();
  shape(0);
  g.clip();
  // The far end has gone off — but only a shade, and less of one the bigger the
  // animal gets. At anything like the pale hide actually goes, four legs turn
  // into white sticks, or worse into little pale sprouts at each corner, and
  // they take the eye off the head — which is the one place it should be.
  g.filter = `blur(${0.7 * DOG_SS}px)`;
  g.fillStyle = 'rgba(139,141,116,0.15)';
  g.beginPath();
  g.ellipse(0.5 * r, 0, 0.18 * r, 0.12 * r, 0, 0, Math.PI * 2);
  g.fill();
  g.filter = 'none';
  g.restore();

  return sprite;
}

/**
 * A paw.
 *
 * Small, and the toes barely splayed. Fanned wide it stops being a foot seen
 * from above and becomes a hand — four of those on an animal this size read as
 * a starfish at each corner, and they pull the eye straight off the head.
 */
function paintPaw(): Sprite {
  const r = DOG_ART_RADIUS;
  const { g, sprite } = easel(-0.14 * r, -0.16 * r, 0.2 * r, 0.16 * r, 1.4);
  g.lineCap = 'round';

  g.fillStyle = DOG_INK;
  g.beginPath();
  g.ellipse(0.02 * r, 0, 0.13 * r, 0.11 * r, 0, 0, Math.PI * 2);
  g.fill();
  for (const a of [-0.32, 0, 0.32]) {
    g.strokeStyle = DOG_INK;
    g.lineWidth = 0.075 * r;
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(Math.cos(a) * 0.15 * r, Math.sin(a) * 0.15 * r);
    g.stroke();
  }

  g.fillStyle = shade(DOG_BODY_COLOR, -10);
  g.beginPath();
  g.ellipse(0.02 * r, 0, 0.095 * r, 0.075 * r, 0, 0, Math.PI * 2);
  g.fill();
  for (const a of [-0.32, 0, 0.32]) {
    g.strokeStyle = shade(DOG_DECAY_COLOR, -64);
    g.lineWidth = 0.042 * r;
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(Math.cos(a) * 0.12 * r, Math.sin(a) * 0.12 * r);
    g.stroke();
    // A claw at the end of each toe. The one bright thing down here, and it is
    // two pixels long — enough to glint, not enough to notice.
    g.strokeStyle = 'rgba(214,206,184,0.7)';
    g.lineWidth = 0.024 * r;
    g.beginPath();
    g.moveTo(Math.cos(a) * 0.11 * r, Math.sin(a) * 0.11 * r);
    g.lineTo(Math.cos(a) * 0.17 * r, Math.sin(a) * 0.17 * r);
    g.stroke();
  }

  return sprite;
}
