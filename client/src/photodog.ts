/**
 * How photoreal can a top-down zombie dog get in Canvas 2D?
 *
 * A **study**, not game code. Nothing here is imported by the game and nothing
 * here is affordable in it: this is a deferred renderer that bakes a height
 * field, differentiates it for normals, lights every pixel by hand and then
 * lays sixty thousand individual hairs over the result. It takes a couple of
 * seconds to produce one frame.
 *
 * The point is to find the ceiling. If the answer is worth having, the way it
 * would reach the game is as a *baked sprite* — the same trick `dogsprite.ts`
 * already uses, just with this in place of the flat shapes.
 */

const SS = 2; // render at twice final size and let the downscale antialias
/** The frame that is shown. */
const W = 780;
const H = 520;
/**
 * The area actually rendered. Deliberately independent of the frame: the animal
 * is laid out in *these* coordinates and what you see is a crop of them, so the
 * composition can be reframed without moving a single bone.
 */
const RW = 1100;
const RH = 740;

const canvas = document.getElementById('out') as HTMLCanvasElement;
const statusEl = document.getElementById('status') as HTMLElement;
const ctx = canvas.getContext('2d')!;

// ---------------------------------------------------------------- noise

/** Value noise with a hashed lattice — deterministic, no tables to ship. */
function hash2(x: number, y: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

function noise(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = smooth(x - xi);
  const yf = smooth(y - yi);
  const a = hash2(xi, yi);
  const b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1);
  const d = hash2(xi + 1, yi + 1);
  return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
}

/** Fractal noise. Skin mottling, fur clumping and decay all come off this. */
function fbm(x: number, y: number, octaves = 5): number {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  for (let i = 0; i < octaves; i++) {
    sum += noise(x * freq, y * freq) * amp;
    freq *= 2.03;
    amp *= 0.5;
  }
  return sum;
}

// ------------------------------------------------------- the animal's volume

/**
 * The body as a chain of ellipsoid blobs, unioned smoothly.
 *
 * This is what buys volume: a *height* at every pixel, which can then be
 * differentiated into a surface normal and lit. Painting shapes and shading
 * them by hand — which is what the game does — can never produce a consistent
 * light across the whole animal, because nothing in it knows which way any
 * given pixel is facing.
 */
interface Lump {
  x: number;
  y: number;
  rx: number;
  ry: number;
  rot: number;
  h: number;
}

const CX = 560;
const CY = 400;

const body: Lump[] = [];
const push = (x: number, y: number, rx: number, ry: number, h: number, rot = 0) =>
  body.push({ x: CX + x, y: CY + y, rx, ry, rot, h });

/**
 * An elongated mass between two points — a bone rather than a bead.
 *
 * Chains of round blobs were the first attempt and they read as a caterpillar:
 * every blob shows as its own dome however smoothly they are unioned, because
 * each one *is* a dome. One stretched ellipsoid along the bone has a single
 * ridge down its length, which is what a limb looks like.
 */
const limb = (x0: number, y0: number, x1: number, y1: number, w: number, h: number) => {
  const len = Math.hypot(x1 - x0, y1 - y0);
  push((x0 + x1) / 2, (y0 + y1) / 2, len / 2 + w * 0.35, w, h, Math.atan2(y1 - y0, x1 - x0));
};

// Spine, nose to tail. Widest at the ribcage and the haunches, pinched hard at
// the waist — that pinch is most of what says "dog" from directly above, and a
// body of even width reads as a sausage.
push(-186, 6, 84, 62, 60); // haunch
push(-130, 2, 78, 56, 58);
push(-66, -2, 58, 40, 48); // waist — narrow
push(-4, -2, 70, 50, 56);
push(58, 0, 82, 60, 64); // ribcage — widest
push(120, -2, 76, 54, 60);
push(174, -6, 58, 42, 50); // shoulder
push(216, -8, 40, 30, 42); // neck

// Legs. Two bones each, elongated along their own line, with a paw at the end
// — a dog's legs read as *limbs* from above, not as strings of knuckles.
for (const side of [-1, 1]) {
  // Front: shoulder out and forward.
  limb(168, side * 34, 196, side * 92, 21, 34);
  limb(196, side * 92, 188, side * 142, 15, 22);
  push(186, side * 156, 20, 15, 15, side * 0.2); // paw
  // Rear: haunch out and back, folding the other way.
  limb(-152, side * 40, -186, side * 96, 24, 36);
  limb(-186, side * 96, -164, side * 148, 16, 22);
  push(-160, side * 162, 21, 16, 15, side * -0.2);
}

// Tail: two tapering lengths off the rump rather than a row of beads.
limb(-256, 10, -320, 32, 20, 24);
limb(-320, 32, -378, 68, 12, 13);

// The head, split. Two half-skulls hinged at the neck and swung apart.
const SPLIT = 0.34;
const HINGE_X = 244;
const HINGE_Y = -8;
const headParts: Lump[] = [];
for (const side of [-1, 1]) {
  const a = SPLIT * side;
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  const place = (fx: number, fy: number, rx: number, ry: number, h: number, rot = 0) => {
    const px = HINGE_X + fx * ca - fy * side * sa;
    const py = HINGE_Y + fx * sa + fy * side * ca;
    headParts.push({ x: CX + px, y: CY + py, rx, ry, rot: a + rot * side, h });
  };
  // Chunky: half a skull is a solid piece of bone, and thin halves read as two
  // flaps rather than as a head that has come apart.
  place(26, 26, 52, 32, 54); // cranium half
  place(76, 26, 42, 26, 46); // cheek
  place(124, 20, 32, 18, 36); // muzzle
  place(160, 14, 22, 12, 26); // snout
  place(8, 54, 26, 12, 22, 0.5); // ear, raked back off the skull
}
body.push(...headParts);

/** Smooth union of the blobs — a hard max creases where two meet. */
function heightAt(px: number, py: number): number {
  let acc = 0;
  for (let i = 0; i < body.length; i++) {
    const b = body[i];
    const dx = px - b.x;
    const dy = py - b.y;
    if (dx * dx + dy * dy > (b.rx + b.ry) * (b.rx + b.ry)) continue;
    const c = Math.cos(-b.rot);
    const s = Math.sin(-b.rot);
    const lx = (dx * c - dy * s) / b.rx;
    const ly = (dx * s + dy * c) / b.ry;
    const d2 = lx * lx + ly * ly;
    if (d2 >= 1) continue;
    const h = b.h * Math.sqrt(1 - d2);
    // Soft-max: a p-norm union, which blends the blobs into one creature
    // instead of leaving a seam wherever two of them overlap.
    acc += h * h * h * h;
  }
  return acc > 0 ? Math.pow(acc, 0.25) : 0;
}

// ------------------------------------------------------------ the wound

/** Distance into the open flank, 0 outside it and 1 at its centre. */
function woundAt(px: number, py: number): number {
  const dx = (px - (CX - 40)) / 92;
  const dy = (py - (CY - 26)) / 40;
  const d = Math.sqrt(dx * dx + dy * dy);
  const edge = 1 + (fbm(px * 0.03, py * 0.03) - 0.5) * 0.5; // ragged rim
  return d > edge ? 0 : Math.min(1, (edge - d) * 3);
}

// ---------------------------------------------------------------- shading

const rw = RW * SS;
const rh = RH * SS;
const buf = document.createElement('canvas');
buf.width = rw;
buf.height = rh;
const bctx = buf.getContext('2d')!;

const img = bctx.createImageData(rw, rh);
const data = img.data;

/** Height, cached across the whole frame so normals cost no extra evaluation. */
const height = new Float32Array(rw * rh);

function bake(): void {
  for (let y = 0; y < rh; y++) {
    for (let x = 0; x < rw; x++) {
      height[y * rw + x] = heightAt(x / SS, y / SS);
    }
  }
}

// Light: high and off to one side, the way the rest of the game is lit.
const LX = -0.46;
const LY = -0.62;
const LZ = 0.64;

function shade(): void {
  const maxH = 66;
  for (let y = 1; y < rh - 1; y++) {
    for (let x = 1; x < rw - 1; x++) {
      const i = y * rw + x;
      const h = height[i];
      const o = i * 4;
      if (h <= 0.4) {
        data[o + 3] = 0;
        continue;
      }

      const px = x / SS;
      const py = y / SS;

      // Normal from the height gradient. `SS` cancels: the slope is in the
      // same units either way.
      const dhx = (height[i + 1] - height[i - 1]) * 0.5 * SS;
      const dhy = (height[i + rw] - height[i - rw]) * 0.5 * SS;
      let nx = -dhx;
      let ny = -dhy;
      let nz = 1;
      const nl = Math.hypot(nx, ny, nz);
      nx /= nl;
      ny /= nl;
      nz /= nl;

      // ---- material
      const wound = woundAt(px, py);
      const rot = fbm(px * 0.018, py * 0.018);
      const grime = fbm(px * 0.09 + 40, py * 0.09);
      let cr: number;
      let cg: number;
      let cb: number;
      let rough = 0.86;

      if (wound > 0.02) {
        // Exposed meat: dark, wet, and reddened by what is under it.
        const deep = Math.min(1, wound * 1.3);
        cr = 88 - deep * 44 + grime * 26;
        cg = 22 - deep * 12 + grime * 8;
        cb = 24 - deep * 12 + grime * 8;
        rough = 0.22 - deep * 0.1; // wet: much sharper highlight
      } else {
        // Hide. A dark charcoal-brown coat with the colour going out of it in
        // patches — the decayed areas are paler, greener and drier.
        const dead = Math.min(1, Math.max(0, (rot - 0.5) * 3.2));
        cr = 58 + grime * 20 + dead * 62;
        cg = 50 + grime * 18 + dead * 66;
        cb = 42 + grime * 15 + dead * 48;
        rough = 0.9 - dead * 0.18;
      }

      // ---- lighting
      const ndl = Math.max(0, nx * LX + ny * LY + nz * LZ);
      // Ambient occlusion off the height: creases between the blobs and the
      // ground line under the belly both sit low, so both go dark.
      const ao = Math.min(1, 0.3 + (h / maxH) * 0.85);
      // Wrapped diffuse — light bleeding round the form, which is most of what
      // makes flesh look like flesh rather than like plastic.
      const wrap = Math.max(0, (nx * LX + ny * LY + nz * LZ + 0.45) / 1.45);
      const diff = ndl * 0.75 + wrap * 0.4;

      // Blinn-Phong. The half vector against a viewer straight overhead.
      const hx = LX;
      const hy = LY;
      const hz = LZ + 1;
      const hl = Math.hypot(hx, hy, hz);
      const ndh = Math.max(0, (nx * hx + ny * hy + nz * hz) / hl);
      const shininess = 4 + (1 - rough) * 160;
      const spec = Math.pow(ndh, shininess) * (1 - rough) * 1.5;

      // Rim: the light that skims the very edge of a form, which is the single
      // cheapest thing that reads as three-dimensional.
      const rim = Math.pow(1 - nz, 3.2) * 0.5;

      const amb = 0.2;
      const lit = amb + diff * ao;
      let r = cr * lit + spec * 235 + rim * 96;
      let g = cg * lit + spec * 228 + rim * 92;
      let b = cb * lit + spec * 224 + rim * 104;

      // Subsurface: a little red pushed back out of the thin parts — the ears,
      // the muzzle, the edges of the wound.
      const thin = Math.max(0, 1 - h / 34);
      r += thin * 34 * lit;
      g += thin * 8 * lit;
      b += thin * 9 * lit;

      data[o] = Math.min(255, r);
      data[o + 1] = Math.min(255, g);
      data[o + 2] = Math.min(255, b);
      data[o + 3] = 255;
    }
  }
  bctx.putImageData(img, 0, 0);
}

// ------------------------------------------------------------------ fur

/**
 * Sixty thousand hairs, each lit by the surface underneath it.
 *
 * The direction comes from a flow field — swept back along the spine, fanning
 * out over the flanks, breaking into clumps off the noise — and each strand is
 * darker at the root than at the tip, which is what stops a coat looking like
 * hatching.
 */
function fur(): void {
  const shaded = bctx.getImageData(0, 0, rw, rh).data;
  bctx.lineCap = 'round';
  const rand = (() => {
    let s = 0x1234567;
    return () => {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 4294967296;
    };
  })();

  for (let n = 0; n < 130000; n++) {
    const px = CX - 420 + rand() * 780;
    const py = CY - 200 + rand() * 400;
    const sx = Math.round(px * SS);
    const sy = Math.round(py * SS);
    if (sx < 1 || sy < 1 || sx >= rw - 1 || sy >= rh - 1) continue;
    const i = (sy * rw + sx) * 4;
    if (shaded[i + 3] === 0) continue;
    if (woundAt(px, py) > 0.02) continue; // no fur inside the wound

    // Flow: back along the body, fanning outward, curled by the noise so it
    // clumps rather than combing perfectly.
    const rel = (py - CY) / 90;
    const curl = (fbm(px * 0.035, py * 0.035, 3) - 0.5) * 1.9;
    const a = Math.PI + rel * 0.85 + curl;
    const len = (7 + rand() * 17) * SS;

    // Lit by whatever it is growing out of, so the coat carries the same light
    // as the body — the tip a shade brighter than the root.
    const r0 = shaded[i];
    const g0 = shaded[i + 1];
    const b0 = shaded[i + 2];
    const t = rand();
    const rootMul = 0.5 + t * 0.2;
    const tipMul = 1.05 + t * 0.5;

    const ex = sx + Math.cos(a) * len;
    const ey = sy + Math.sin(a) * len;
    const grad = bctx.createLinearGradient(sx, sy, ex, ey);
    grad.addColorStop(0, `rgba(${r0 * rootMul | 0},${g0 * rootMul | 0},${b0 * rootMul | 0},0.85)`);
    grad.addColorStop(
      1,
      `rgba(${Math.min(255, r0 * tipMul) | 0},${Math.min(255, g0 * tipMul) | 0},${
        Math.min(255, b0 * tipMul) | 0
      },0)`,
    );
    bctx.strokeStyle = grad;
    bctx.lineWidth = (0.5 + rand() * 0.9) * SS;
    bctx.beginPath();
    bctx.moveTo(sx, sy);
    bctx.quadraticCurveTo(
      sx + Math.cos(a - 0.3) * len * 0.55,
      sy + Math.sin(a - 0.3) * len * 0.55,
      ex,
      ey,
    );
    bctx.stroke();
  }
}

// -------------------------------------------------------------- the details

/**
 * Ribs standing *in* the wound.
 *
 * Lit as cylinders — a gradient across each one, dark on both sides and bright
 * along a line that is not quite the middle — rather than drawn as flat bars.
 * The cavity is then laid back over them, which is the whole trick: bone drawn
 * on top of a hole is bone lying on the animal, and bone with the hole's
 * shadow over it is bone *inside* the animal.
 */
function ribs(): void {
  bctx.save();
  bctx.scale(SS, SS);
  bctx.lineCap = 'round';

  const set: Array<[number, number, number]> = [
    [-104, 52, 5.5],
    [-72, 60, 7],
    [-40, 58, 6],
    [-8, 44, 4.5], // snapped short
    [22, 54, 6.5],
  ];
  for (const [off, len, wide] of set) {
    const bx = CX + off;
    const top = CY - 26 - len * 0.5;
    const bot = top + len;
    // The shadow each rib throws into the cavity behind it.
    bctx.strokeStyle = 'rgba(10,4,4,0.8)';
    bctx.lineWidth = wide * 1.9;
    bctx.beginPath();
    bctx.moveTo(bx + 3, top + 4);
    bctx.quadraticCurveTo(bx + 15, (top + bot) * 0.5 + 4, bx + 7, bot + 3);
    bctx.stroke();

    const grad = bctx.createLinearGradient(bx - wide, 0, bx + wide, 0);
    grad.addColorStop(0, '#4a4437');
    grad.addColorStop(0.32, '#cdc4a8');
    grad.addColorStop(0.55, '#9d947c');
    grad.addColorStop(1, '#3d382e');
    bctx.strokeStyle = grad;
    bctx.lineWidth = wide;
    bctx.beginPath();
    bctx.moveTo(bx, top);
    bctx.quadraticCurveTo(bx + 12, (top + bot) * 0.5, bx + 4, bot);
    bctx.stroke();
  }

  // The cavity, back over the top. Darkest at the centre and feathered at the
  // rim, so the bone nearest the middle sits deepest.
  const cav = bctx.createRadialGradient(CX - 40, CY - 26, 8, CX - 40, CY - 26, 96);
  cav.addColorStop(0, 'rgba(6,2,3,0.72)');
  cav.addColorStop(0.6, 'rgba(30,6,9,0.34)');
  cav.addColorStop(1, 'rgba(40,8,12,0)');
  bctx.fillStyle = cav;
  bctx.beginPath();
  bctx.ellipse(CX - 40, CY - 26, 96, 44, 0, 0, Math.PI * 2);
  bctx.fill();
  bctx.restore();
}

/** Teeth along both inner edges of the split, and the tongue between them. */
function jaws(): void {
  bctx.save();
  bctx.translate(CX * SS, CY * SS);
  bctx.scale(SS, SS);

  // Tongue, lolling out of the gap.
  bctx.save();
  bctx.translate(HINGE_X, HINGE_Y);
  // Fat and fleshy rather than a spear: it swells past the teeth and only
  // tapers at the very end, which is what a tongue does. Drawn as a body with
  // a rounded back edge, not as a triangle.
  const tg = bctx.createLinearGradient(20, -30, 170, 50);
  tg.addColorStop(0, '#48121c');
  tg.addColorStop(0.45, '#9a3542');
  tg.addColorStop(0.8, '#6d2029');
  tg.addColorStop(1, '#3e0e17');
  bctx.beginPath();
  bctx.moveTo(14, -30);
  bctx.bezierCurveTo(76, -44, 132, -22, 168, 12); // upper edge, swelling out
  bctx.quadraticCurveTo(182, 24, 172, 32); // the blunt tip
  bctx.quadraticCurveTo(160, 40, 150, 30); // notch of the fork
  bctx.quadraticCurveTo(146, 44, 132, 42);
  bctx.bezierCurveTo(88, 36, 46, 26, 14, 24); // lower edge back to the throat
  bctx.closePath();
  bctx.fillStyle = tg;
  bctx.fill();
  bctx.strokeStyle = 'rgba(14,3,7,0.75)';
  bctx.lineWidth = 3.5;
  bctx.stroke();
  // The groove down the middle, and the wet run of light beside it.
  bctx.strokeStyle = 'rgba(30,6,12,0.55)';
  bctx.lineWidth = 5;
  bctx.beginPath();
  bctx.moveTo(28, -2);
  bctx.quadraticCurveTo(100, 2, 162, 24);
  bctx.stroke();
  bctx.strokeStyle = 'rgba(255,214,210,0.32)';
  bctx.lineWidth = 6;
  bctx.beginPath();
  bctx.moveTo(40, -14);
  bctx.quadraticCurveTo(104, -12, 156, 12);
  bctx.stroke();
  bctx.restore();

  for (const side of [-1, 1]) {
    bctx.save();
    bctx.translate(HINGE_X, HINGE_Y);
    bctx.rotate(SPLIT * side);
    bctx.scale(1, side);
    // Gum.
    bctx.strokeStyle = 'rgba(58,14,18,0.95)';
    bctx.lineWidth = 12;
    bctx.beginPath();
    bctx.moveTo(14, 6);
    bctx.lineTo(138, 6);
    bctx.stroke();
    // Teeth, each a little cone with its own highlight.
    // Nine, unevenly spaced, with two that matter. Thirteen even ones is a
    // zipper — and a dog's mouth is mostly small teeth around a pair of fangs.
    for (let t = 0; t < 9; t++) {
      const px = 24 + t * 15.5 + (t % 3) * 2;
      const canine = t === 1 || t === 5;
      // Short. Long even triangles all the way down read as a shark, not a dog
      // — a dog's mouth is mostly small teeth with two that matter.
      const len = canine ? 19 : 9;
      const wide = canine ? 5.5 : 4;
      const g = bctx.createLinearGradient(px - wide, 0, px + wide, 0);
      g.addColorStop(0, '#8d856e');
      g.addColorStop(0.45, '#f2ece0');
      g.addColorStop(1, '#a49b83');
      bctx.fillStyle = g;
      bctx.beginPath();
      bctx.moveTo(px - wide, 8);
      bctx.lineTo(px + wide, 8);
      bctx.lineTo(px + wide * 0.2, 8 - len);
      bctx.closePath();
      bctx.fill();
    }
    bctx.restore();
  }
  bctx.restore();
}

/** The eyes, and the bloom off them. */
function eyes(): void {
  const glow = document.createElement('canvas');
  glow.width = rw;
  glow.height = rh;
  const g = glow.getContext('2d')!;
  const spots: Array<[number, number, number]> = [];
  for (const side of [-1, 1]) {
    const a = SPLIT * side;
    const fx = 46;
    const fy = 22 * side;
    spots.push([
      CX + HINGE_X + fx * Math.cos(a) - fy * Math.sin(a),
      CY + HINGE_Y + fx * Math.sin(a) + fy * Math.cos(a),
      side < 0 ? 0.6 : 1,
    ]);
  }
  for (const [ex, ey, str] of spots) {
    g.fillStyle = `rgba(255,190,44,${str})`;
    g.beginPath();
    g.arc(ex * SS, ey * SS, 9 * SS * str, 0, Math.PI * 2);
    g.fill();
  }
  // Bloom: three blurs of decreasing weight, which is what a bright thing on a
  // dark ground actually does to a lens.
  bctx.save();
  bctx.globalCompositeOperation = 'lighter';
  for (const [blur, alpha] of [
    [26, 0.5],
    [10, 0.55],
    [3, 0.8],
  ] as Array<[number, number]>) {
    bctx.filter = `blur(${blur * SS}px)`;
    bctx.globalAlpha = alpha;
    bctx.drawImage(glow, 0, 0);
  }
  bctx.filter = 'none';
  bctx.globalAlpha = 1;
  // The hot core.
  for (const [ex, ey, str] of spots) {
    bctx.fillStyle = `rgba(255,246,214,${0.9 * str})`;
    bctx.beginPath();
    bctx.arc(ex * SS, ey * SS, 4.5 * SS * str, 0, Math.PI * 2);
    bctx.fill();
  }
  bctx.restore();
}

/** Blood: pooled under the wound, spattered around, wet where it is fresh. */
function blood(): void {
  const rand = (() => {
    let s = 0x77aa33;
    return () => {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 4294967296;
    };
  })();
  bctx.save();
  bctx.scale(SS, SS);
  // **Streaked and matted, not spotted.** Even round dots at even sizes read as
  // measles; blood on a coat runs and mats along the way the fur lies, and what
  // sells it is a few long smears with a scatter of fine flecks round them.
  for (let i = 0; i < 26; i++) {
    const a = rand() * Math.PI * 2;
    const d = 30 + rand() * 190;
    const x = CX - 30 + Math.cos(a) * d;
    const y = CY - 14 + Math.sin(a) * d * 0.5;
    const len = 6 + rand() * 34;
    const dir = Math.PI + (y - CY) / 120 + (rand() - 0.5) * 0.7;
    bctx.strokeStyle = `rgba(${44 + rand() * 26 | 0},6,10,${0.3 + rand() * 0.4})`;
    bctx.lineWidth = 2 + rand() * 7;
    bctx.lineCap = 'round';
    bctx.beginPath();
    bctx.moveTo(x, y);
    bctx.quadraticCurveTo(
      x + Math.cos(dir) * len * 0.5,
      y + Math.sin(dir) * len * 0.5 + 3,
      x + Math.cos(dir) * len,
      y + Math.sin(dir) * len,
    );
    bctx.stroke();
  }
  for (let i = 0; i < 120; i++) {
    const a = rand() * Math.PI * 2;
    const d = 30 + rand() * 230;
    const x = CX - 30 + Math.cos(a) * d;
    const y = CY - 14 + Math.sin(a) * d * 0.5;
    const r = 0.6 + rand() * 2.6;
    bctx.fillStyle = `rgba(${50 + rand() * 30 | 0},7,11,${0.25 + rand() * 0.45})`;
    bctx.beginPath();
    bctx.ellipse(x, y, r, r * (0.4 + rand() * 0.5), rand() * 3, 0, Math.PI * 2);
    bctx.fill();
  }
  bctx.restore();
}

/** A soft contact shadow, so the animal is standing on something. */
function groundShadow(target: CanvasRenderingContext2D): void {
  target.save();
  target.filter = 'blur(26px)';
  target.fillStyle = 'rgba(0,0,0,0.55)';
  target.beginPath();
  target.ellipse(CX + 6, CY + 26, 300, 96, 0, 0, Math.PI * 2);
  target.fill();
  target.filter = 'none';
  target.restore();
}

// ---------------------------------------------------------------- compose

function run(): void {
  const t0 = performance.now();
  bake();
  const t1 = performance.now();
  shade();
  const t2 = performance.now();
  fur();
  ribs();
  jaws();
  blood();
  eyes();
  const t3 = performance.now();

  // Ground first, then the animal over it. Drawn into the *buffer* so the crop
  // below carries it along — a background painted on the output would not pan
  // with the animal.
  bctx.save();
  bctx.globalCompositeOperation = 'destination-over';
  bctx.scale(SS, SS);
  groundShadow(bctx);
  const gr = bctx.createRadialGradient(CX, CY, 40, CX, CY, 620);
  gr.addColorStop(0, 'rgba(48,45,41,0.6)');
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  bctx.fillStyle = gr;
  bctx.fillRect(0, 0, RW, RH);
  bctx.fillStyle = '#141619';
  bctx.fillRect(0, 0, RW, RH);
  bctx.restore();

  ctx.fillStyle = '#141619';
  ctx.fillRect(0, 0, W, H);

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  // Cropped to the animal. Rendering it small in a large frame throws away most
  // of the detail this whole exercise exists to produce.
  // Whole animal: 138 / 110 / 870 / 580. Head close-up below, to judge the
  // part the technique flatters least.
  const closeUp = new URLSearchParams(location.search).has('head');
  const cropX = closeUp ? 640 : 138;
  const cropY = closeUp ? 250 : 110;
  const cropW = closeUp ? 390 : 870;
  const cropH = closeUp ? 260 : 580;
  ctx.drawImage(buf, cropX * SS, cropY * SS, cropW * SS, cropH * SS, 0, 0, W, H);

  statusEl.textContent =
    `height ${(t1 - t0) | 0}ms · shading ${(t2 - t1) | 0}ms · fur and detail ${(t3 - t2) | 0}ms · ` +
    `${(t3 - t0) | 0}ms for one frame at ${rw}x${rh}`;
}

run();
