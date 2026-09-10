/**
 * **The crowd, baked once and blitted — the same trick as the dog, aimed at
 * four hundred bodies instead of one.**
 *
 * `drawEntity`'s live path draws a zombie or a civilian as ~40 canvas path
 * operations every frame: a disc, a head, two swung arms, sometimes legs. That
 * is what stalls the endgame — the commands issue in a millisecond, painting
 * them all is the frame. It is also flat: bold shapes with no finish on them,
 * which reads as cartoon rather than as horror.
 *
 * This module paints a short shamble/walk cycle **once**, at `CROWD_SS` times
 * final size, into a set of offscreen canvases — one strip per body variant.
 * Per frame a body is then one `drawImage` of the current cycle frame, rotated
 * to face its heading. The look is the dog's: a dark ink contour, supersampled
 * edges, `roundOff` soft form-shading, and — for the infected — chunks bitten
 * out of the silhouette and gore worked into the hide.
 *
 * **It is the "sprite-sheet path" in the literal sense.** Nothing here needs to
 * be procedural: `buildStrip` could just as well slice a PNG atlas rendered
 * from a 3D model offline (see the `photodog.html` study — that is the honest
 * route to real fidelity). The procedural bake is a stand-in that proves the
 * rendering path and sets a floor on how grim the crowd can look for free.
 *
 * **Scope.** Zombies and civilians only — the bodies there are hundreds of.
 * Officers stay on the live path: there are dozens at most, and the shouldered
 * rifle and the grip poses are their own problem. The special poses
 * (`grappling`, `breaking`, `birthing`, `materializing`, `turning`) also stay
 * live — they already look right and the sprite path would have to reproduce
 * each one.
 */

import { PLAYER_RADIUS, HUMAN_RADIUS, ZOMBIE_RADIUS } from '../../shared/constants.js';
import type { EntityState } from '../../shared/types.js';

// ------------------------------------------------------------------- the gate

/**
 * Off by default. Flipped by the rig, and by a dev hook in `main.ts`, so the
 * new look can be compared against the old in a real round without a rebuild.
 * This is the project's rig-gate pattern — see `setThreeLimbedCorpse`,
 * `setLayerBlitSmoothing`, `setLashes`.
 */
let crowdSprites = false;

export function setCrowdSprites(v: boolean): void {
  crowdSprites = v;
}

export function crowdSpritesOn(): boolean {
  return crowdSprites;
}

// ------------------------------------------------------------------- constants

/** Painted at this multiple of final size, then drawn back down. */
const CROWD_SS = 5;
/** Frames in one shamble/walk cycle. */
const FRAMES = 8;
/** How many baked body variants per kind. Picked by `hashId(e.id) % N`. */
const ZOMBIE_VARIANTS = 3;
const CIVILIAN_VARIANTS = 3;

/** The contour every part carries. Dark, and the same dark everywhere. */
const INK = '#0a0806';

/**
 * **Grim, but tinted — the key call, and the one worth arguing about.**
 *
 * The current game reads friend / enemy / neutral instantly across a chaotic
 * screen because civilians are bright green, zombies bright red, officers blue.
 * A fully desaturated crowd is more cinematic and much harder to parse in a
 * fight. These palettes split the difference: drab, rotten, dark — but a
 * zombie keeps a wound-red accent and a civilian a paler, sicklier tone, so
 * the read survives at a glance. Push `TINT` toward 0 for full grim, toward 1
 * to bring the old saturation back.
 */
const ZOMBIE_FLESH = ['#6f6a58', '#746455', '#5f6656'];
const ZOMBIE_CLOTH = ['#2b2824', '#332c25', '#232a26'];
const CIVILIAN_CLOTH = ['#3f4640', '#4a4038', '#514354'];
const CIVILIAN_SKIN = '#8b7359';

// ------------------------------------------------------------------- utilities

function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** A tiny deterministic generator, so a rebuild paints the identical crowd. */
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

export interface CrowdFrame {
  canvas: HTMLCanvasElement;
  /** Where the body centre sits inside the canvas, in canvas pixels. */
  ox: number;
  oy: number;
  /** Canvas pixels to world pixels. */
  scale: number;
}

export type CrowdStrip = CrowdFrame[];

/**
 * A canvas set up to be painted in *world* pixels with the body centre at a
 * chosen origin, at `CROWD_SS` resolution. Everything below draws at life size
 * and comes out supersampled without a number being scaled by hand.
 */
function easel(
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
  pad = 2,
): { g: CanvasRenderingContext2D; frame: CrowdFrame } {
  const w = Math.ceil((maxX - minX + pad * 2) * CROWD_SS);
  const h = Math.ceil((maxY - minY + pad * 2) * CROWD_SS);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  const ox = (-minX + pad) * CROWD_SS;
  const oy = (-minY + pad) * CROWD_SS;
  g.setTransform(CROWD_SS, 0, 0, CROWD_SS, ox, oy);
  g.lineJoin = 'round';
  return { g, frame: { canvas: c, ox, oy, scale: 1 / CROWD_SS } };
}

/**
 * Soft form shading inside a shape already clipped: a blurred dark stroke on
 * the shape's own outline. The one trick that turns a flat blob into a rounded
 * one — a blur per body per frame is unaffordable, a blur per body *ever* is
 * nothing. Straight out of `dogsprite.ts`.
 */
function roundOff(
  g: CanvasRenderingContext2D,
  path: () => void,
  width: number,
  blur: number,
  alpha: number,
): void {
  g.filter = `blur(${blur * CROWD_SS}px)`;
  g.strokeStyle = `rgba(0,0,0,${alpha})`;
  g.lineWidth = width;
  path();
  g.stroke();
  g.filter = 'none';
}

// ------------------------------------------------------------------- the paint

/**
 * One cycle frame for one variant.
 *
 * `phase` runs 0..1 through the shamble. The whole figure is drawn top-down
 * with +x forward: shoulders lie across ±y, the head is nudged forward, and a
 * "stride" reads as the feet sliding fore and aft past the hips while the arms
 * counter-swing. A zombie also weaves — the torso shifts side to side each step
 * — which is most of what says "shambling" from directly above.
 */
function paintFrame(kind: 'zombie' | 'human', variant: number, phase: number): CrowdFrame {
  const r = kind === 'zombie' ? ZOMBIE_RADIUS : HUMAN_RADIUS;
  const rand = rng((kind === 'zombie' ? 0x2000 : 0x1000) + variant * 97 + Math.round(phase * 997));
  const zombie = kind === 'zombie';

  const flesh = zombie ? ZOMBIE_FLESH[variant % ZOMBIE_FLESH.length] : CIVILIAN_SKIN;
  const cloth = zombie
    ? ZOMBIE_CLOTH[variant % ZOMBIE_CLOTH.length]
    : CIVILIAN_CLOTH[variant % CIVILIAN_CLOTH.length];

  // Which limp arm, which way the head lolls — fixed per variant, not rolled,
  // so the figure comes apart the same way every frame.
  const limpArm = zombie ? (variant % 2 === 0 ? -1 : 1) : 0;
  const lollSide = zombie ? (variant % 3 === 0 ? 1 : -1) : 0;

  const leg = phase * Math.PI * 2;
  const stride = (zombie ? 0.62 : 0.5) * r;
  const weave = (zombie ? 0.16 : 0.03) * r * Math.sin(leg);
  const bob = 1 + Math.sin(leg * 2) * (zombie ? 0.026 : 0.016);

  const { g, frame } = easel(-1.3 * r, -1.5 * r, 2.0 * r, 1.5 * r, 2);

  const cx = 0;
  const cy = weave;

  g.save();
  g.scale(bob, bob);

  /**
   * The torso — a **shoulder wedge**, not an ellipse, and that is the whole of
   * why this reads as a person from directly overhead. Broad across the
   * shoulders at the front, tapering back to narrower hips; the head then
   * clears the front of it. An ellipse the same size is a potato with a hole
   * in it — which is exactly what the first pass looked like. Written as one
   * flank and mirrored so the two sides cannot drift.
   */
  const torso = (grow: number) => {
    const G = grow;
    const sh = (zombie ? 0.82 : 0.9) * r + G; // shoulder half-width
    const hip = (zombie ? 0.46 : 0.54) * r + G; // hip half-width
    const front = (zombie ? 0.5 : 0.46) * r + G; // chest reaches this far forward
    const back = -(zombie ? 0.68 : 0.62) * r - G; // and the hips this far back
    g.beginPath();
    g.moveTo(front, 0);
    g.bezierCurveTo(front, -sh * 0.55, front - 0.16 * r, -sh, -0.06 * r, -sh);
    g.bezierCurveTo(-0.3 * r, -sh, back + 0.12 * r, -hip - 0.12 * r, back, -hip);
    g.bezierCurveTo(back - 0.14 * r - G, -hip * 0.4, back - 0.14 * r - G, hip * 0.4, back, hip);
    g.bezierCurveTo(back + 0.12 * r, hip + 0.12 * r, -0.3 * r, sh, -0.06 * r, sh);
    g.bezierCurveTo(front - 0.16 * r, sh, front, sh * 0.55, front, 0);
    g.closePath();
  };

  // Everything below is drawn about the origin; the shamble weave is one
  // translate rather than a term on every coordinate.
  g.translate(0, cy);

  // ---- legs: two short strokes off the hips. Mostly under the torso — what
  //      reads is a foot sliding out past the front and another past the back.
  {
    g.strokeStyle = shade(cloth, -22);
    g.lineWidth = r * 0.32;
    g.lineCap = 'round';
    for (const side of [-1, 1]) {
      const fwd = Math.sin(leg + (side < 0 ? 0 : Math.PI));
      const hx = -0.5 * r;
      const hy = side * 0.3 * r;
      const fx = hx + fwd * stride + 0.1 * r;
      const fy = hy + side * 0.05 * r;
      g.beginPath();
      g.moveTo(hx, hy);
      g.lineTo(fx, fy);
      g.stroke();
      g.fillStyle = INK;
      g.beginPath();
      g.ellipse(fx, fy, 0.16 * r, 0.1 * r, Math.atan2(fy - hy, fx - hx), 0, Math.PI * 2);
      g.fill();
    }
  }

  // ---- torso ---------------------------------------------------------------
  // Contour first, fat and dark; the fill lands over the middle of it, so a rim
  // of ink survives all the way round the silhouette.
  torso(0.6);
  g.fillStyle = INK;
  g.fill();

  const lit = g.createLinearGradient(0, -r, 0, r);
  lit.addColorStop(0, shade(cloth, 20));
  lit.addColorStop(0.5, cloth);
  lit.addColorStop(1, shade(cloth, -22));
  torso(0);
  g.fillStyle = lit;
  g.fill();

  g.save();
  torso(0);
  g.clip();
  roundOff(g, () => torso(0), r * 0.34, 1.0, 0.5);

  // A dark band across the shoulders and down the spine — form, not a marking.
  g.filter = `blur(${1.0 * CROWD_SS}px)`;
  g.fillStyle = 'rgba(0,0,0,0.24)';
  g.beginPath();
  g.ellipse(-0.1 * r, 0, 0.7 * r, 0.28 * r, 0, 0, Math.PI * 2);
  g.fill();
  g.filter = 'none';

  if (zombie) {
    // Gore worked into the hide — dark, blurred, and a knot of exposed spine.
    g.filter = `blur(${0.55 * CROWD_SS}px)`;
    for (let i = 0; i < 5; i++) {
      const gx = (rand() - 0.55) * 1.3 * r;
      const gy = (rand() - 0.5) * 1.3 * r;
      g.fillStyle = `rgba(74,16,16,${0.16 + rand() * 0.3})`;
      g.beginPath();
      g.ellipse(gx, gy, (0.1 + rand() * 0.16) * r, (0.06 + rand() * 0.1) * r, rand() * 3, 0, Math.PI * 2);
      g.fill();
    }
    g.filter = 'none';
    // A knot of exposed vertebrae at the nape — two nubs, not a row across the
    // whole back (which reads as a mouth).
    for (let i = 0; i < 2; i++) {
      const sx = (0.05 - i * 0.16) * r;
      g.fillStyle = 'rgba(0,0,0,0.3)';
      g.beginPath();
      g.ellipse(sx, 0.03 * r, 0.05 * r, 0.036 * r, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(190,182,158,0.16)';
      g.beginPath();
      g.ellipse(sx, 0, 0.042 * r, 0.03 * r, 0, 0, Math.PI * 2);
      g.fill();
    }
  } else {
    // A coat highlight along the lit flank.
    g.filter = `blur(${0.9 * CROWD_SS}px)`;
    g.fillStyle = 'rgba(210,214,224,0.1)';
    g.beginPath();
    g.ellipse(0, -0.45 * r, 0.55 * r, 0.16 * r, 0, 0, Math.PI * 2);
    g.fill();
    g.filter = 'none';
  }
  g.restore();

  // Chunks out of the outline — drawn from outside and clipped to the body, so
  // each is a piece simply missing. On the back half, away from the shoulders.
  if (zombie) {
    g.save();
    torso(0);
    g.clip();
    const bite = rng(0x6d40 + variant * 31);
    for (let i = 0; i < 2; i++) {
      // On the flanks, away from where a face would be.
      const bx = (-0.55 + bite() * 0.5) * r;
      const by = (i === 0 ? -1 : 1) * (0.55 + bite() * 0.3) * r;
      const s = (0.1 + bite() * 0.07) * r;
      g.fillStyle = 'rgba(9,6,5,0.95)';
      g.beginPath();
      g.ellipse(bx, by, s, s * 0.7, bite() * 3, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(96,26,28,0.45)';
      g.lineWidth = 0.028 * r;
      g.beginPath();
      g.ellipse(bx, by, s * 0.9, s * 0.62, bite() * 3, 0, Math.PI * 2);
      g.stroke();
    }
    g.restore();
  }

  // ---- arms: one tapered stroke each. Articulated limbs are mush at this
  //      size — the pose is what reads. A zombie reaches forward (one arm dead
  //      and trailing on some variants); a civilian's are clamped in and back.
  {
    g.lineCap = 'round';
    for (const side of [-1, 1]) {
      const sx = 0.16 * r;
      const sy = side * 0.66 * r;
      const armSwing = Math.sin(leg + (side < 0 ? 0 : Math.PI));
      const dead = zombie && side === limpArm;

      let ang: number;
      let len: number;
      if (dead) {
        ang = Math.PI * 0.78; // straight back, limp
        len = 0.78 * r;
      } else if (zombie) {
        ang = 0.1 + armSwing * 0.18; // both forward, swaying
        len = (0.92 + armSwing * 0.08) * r;
      } else {
        ang = Math.PI * 0.82 + armSwing * 0.12; // clamped back
        len = 0.62 * r;
      }
      const hx = sx + Math.cos(ang) * len;
      const hy = sy + Math.sin(ang) * len * side; // mirror onto this shoulder

      g.strokeStyle = dead ? shade(flesh, -20) : shade(zombie ? flesh : cloth, zombie ? -4 : -6);
      g.lineWidth = (dead ? 0.24 : 0.32) * r;
      g.globalAlpha = dead ? 0.82 : 1;
      g.beginPath();
      g.moveTo(sx, sy);
      g.quadraticCurveTo(sx + Math.cos(ang) * len * 0.5, sy + Math.sin(ang) * len * 0.5 * side + side * 0.06 * r, hx, hy);
      g.stroke();
      g.globalAlpha = 1;
      g.fillStyle = shade(flesh, zombie ? 4 : -4);
      g.beginPath();
      g.ellipse(hx, hy, 0.14 * r, 0.11 * r, 0, 0, Math.PI * 2);
      g.fill();
    }
  }

  // ---- head: well past the front of the chest, so the gap between it and the
  //      shoulders is what says "a person facing this way". Lolled to one side
  //      and sunk closer for a zombie.
  {
    const hx = (zombie ? 1.08 : 1.14) * r;
    const hy = lollSide * 0.24 * r;
    const hr = (zombie ? 0.42 : 0.44) * r;
    g.strokeStyle = shade(flesh, -16);
    g.lineWidth = 0.32 * r;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(0.42 * r, 0);
    g.lineTo(hx - 0.12 * r, hy);
    g.stroke();

    // A heavier ink halo than the body's, so the head separates from the mass
    // behind it rather than merging into one blob.
    g.fillStyle = INK;
    g.beginPath();
    g.arc(hx, hy, hr + 0.12 * r, 0, Math.PI * 2);
    g.fill();
    const hg = g.createRadialGradient(hx - hr * 0.4, hy - hr * 0.4, hr * 0.2, hx, hy, hr * 1.1);
    hg.addColorStop(0, shade(flesh, zombie ? 12 : 26));
    hg.addColorStop(1, shade(flesh, -26));
    g.fillStyle = hg;
    g.beginPath();
    g.arc(hx, hy, hr, 0, Math.PI * 2);
    g.fill();
    if (zombie) {
      // A brow shadow across the front of the skull — a suggestion of a face,
      // not a hole punched in it (which is what reads as an eyeball).
      g.strokeStyle = 'rgba(8,5,4,0.5)';
      g.lineWidth = hr * 0.36;
      g.beginPath();
      g.arc(hx, hy, hr * 0.66, -1.0, 1.0);
      g.stroke();
      g.fillStyle = 'rgba(74,16,16,0.4)';
      g.beginPath();
      g.ellipse(hx + hr * 0.3, hy + hr * 0.4, hr * 0.34, hr * 0.2, 0.2, 0, Math.PI * 2);
      g.fill();
    } else {
      // Hair / a hood at the crown, back from the face.
      g.fillStyle = shade(cloth, -8);
      g.beginPath();
      g.arc(hx - hr * 0.28, hy, hr * 0.82, 0, Math.PI * 2);
      g.fill();
    }
  }

  g.restore();
  return frame;
}

// ------------------------------------------------------------------- the sheet

let zombieStrips: CrowdStrip[] | null = null;
let civilianStrips: CrowdStrip[] | null = null;

function buildStrip(kind: 'zombie' | 'human', variant: number): CrowdStrip {
  const out: CrowdStrip = [];
  for (let f = 0; f < FRAMES; f++) out.push(paintFrame(kind, variant, f / FRAMES));
  return out;
}

function stripsFor(kind: 'zombie' | 'human'): CrowdStrip[] {
  if (kind === 'zombie') {
    if (!zombieStrips) {
      zombieStrips = [];
      for (let v = 0; v < ZOMBIE_VARIANTS; v++) zombieStrips.push(buildStrip('zombie', v));
    }
    return zombieStrips;
  }
  if (!civilianStrips) {
    civilianStrips = [];
    for (let v = 0; v < CIVILIAN_VARIANTS; v++) civilianStrips.push(buildStrip('human', v));
  }
  return civilianStrips;
}

/** For the rig: force the bake now and hand back the raw strips. */
export function crowdStrips(kind: 'zombie' | 'human'): CrowdStrip[] {
  return stripsFor(kind);
}

// ------------------------------------------------------------------- the draw

/**
 * One body, one `drawImage`.
 *
 * `moving` is 0..1 — how much ground the body covered between the last two
 * snapshots, normalised. It only scales the cycle *rate*: a still zombie still
 * shuffles on the spot (0.35 of full), a walking one runs the cycle at speed.
 * A prototype could ignore it and animate flat; it is threaded because it is
 * nearly free — `main.ts` already holds `fromX`/`toX`.
 */
export function drawCrowdBody(
  ctx: CanvasRenderingContext2D,
  e: EntityState,
  now: number,
  moving: number,
): void {
  const kind: 'zombie' | 'human' = e.type === 'zombie' ? 'zombie' : 'human';
  const strips = stripsFor(kind);
  const seed = hashId(e.id);
  const strip = strips[seed % strips.length];

  const rate = (kind === 'zombie' ? 0.0024 : 0.0032) * (0.35 + 0.65 * Math.min(1, Math.max(0, moving)));
  const phase = now * rate + seed * 0.131;
  const idx = Math.floor((phase - Math.floor(phase)) * FRAMES) % FRAMES;
  const fr = strip[idx];

  ctx.save();
  ctx.translate(e.x, e.y);
  ctx.rotate(e.facing);
  ctx.scale(fr.scale, fr.scale);
  ctx.drawImage(fr.canvas, -fr.ox, -fr.oy);
  ctx.restore();
}

/**
 * The overlays the live path draws after the body and that still apply on the
 * sprite path: the incubation ring, and a zombie's health bar. Kept here rather
 * than duplicated inline so the two paths cannot drift.
 */
export function drawCrowdOverlays(ctx: CanvasRenderingContext2D, e: EntityState): void {
  const r = e.type === 'zombie' ? ZOMBIE_RADIUS : e.type === 'human' ? HUMAN_RADIUS : PLAYER_RADIUS;
  if (e.infected) {
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#a3e635';
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.arc(e.x, e.y, r + 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}
