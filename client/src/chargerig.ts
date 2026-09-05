/**
 * Charge-rifle rig. A canvas and nothing else — no socket, no port, so it
 * leaves a game on 8080 alone.
 *
 * Every claim here is about *pixels*, and none is settled by looking —
 * especially not from here, where rAF is throttled to nothing while the
 * browser pane is not compositing. `getImageData` needs no compositing.
 *
 *  - the plasma chamber on the gun brightens as the charge winds up (measured
 *    as added luminance over the un-charged baseline — the glow is additive);
 *  - it glows a red ember while venting, brighter the fresher the vent;
 *  - the energy beam is blue-dominant and thickens with the bar level;
 *  - the wall scorch and the ground crater both put blue ink where they land;
 *  - the HUD cooldown bar recedes as the vent completes.
 *
 * Results land on `window.rigResult`. Open `/chargerig.html` on the dev server
 * to look at the frame it leaves.
 */
import type { EntityState } from '../../shared/types.js';
import { ENTITY_RADIUS, setWorldSize } from '../../shared/constants.js';
import {
  drawEntity,
  drawPlasmaBeam,
  drawChargeCooldown,
  spawnPlasmaScorch,
  spawnPlasmaCrater,
  drawGroundScorch,
  drawBulletHoles,
  clearBlood,
  type Tracer,
  type Viewport,
} from './render.js';

const canvas = document.getElementById('rig') as HTMLCanvasElement;
const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
const VIEW: Viewport = { x: 0, y: 0, w: canvas.width, h: canvas.height };
const R = ENTITY_RADIUS.officer;
const SCALE = 7;

function clear(): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#101317';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

/** Blue/cyan/white energy ink: blue high and at least as strong as the others. */
function energyBlue(r: number, g: number, b: number): boolean {
  return b > 90 && b >= r && b >= g * 0.75;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
/** Summed luminance (r+g+b) over a screen box. */
function lum(b: Box): number {
  const d = ctx.getImageData(b.x, b.y, b.w, b.h).data;
  let s = 0;
  for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2];
  return s;
}
/** Summed red-channel energy where red is the dominant channel — the ember. */
function redEnergy(b: Box): number {
  const d = ctx.getImageData(b.x, b.y, b.w, b.h).data;
  let s = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i] > d[i + 2] + 15 && d[i] > d[i + 1] + 8) s += d[i];
  }
  return s;
}
function countBlue(b: Box): number {
  const d = ctx.getImageData(b.x, b.y, b.w, b.h).data;
  let n = 0;
  for (let i = 0; i < d.length; i += 4) if (energyBlue(d[i], d[i + 1], d[i + 2])) n++;
  return n;
}
/** Violet/purple: red and blue both well above green, and close to each other. */
function countPurple(b: Box): number {
  const d = ctx.getImageData(b.x, b.y, b.w, b.h).data;
  let n = 0;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i];
    const g = d[i + 1];
    const bl = d[i + 2];
    if (r > g + 14 && bl > g + 14 && Math.abs(r - bl) < Math.max(r, bl) * 0.6 && r > 40) n++;
  }
  return n;
}
/** Non-background pixels that are NOT bright energy-blue — a dark burn. */
function countDark(b: Box): number {
  const d = ctx.getImageData(b.x, b.y, b.w, b.h).data;
  let n = 0;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i];
    const g = d[i + 1];
    const bl = d[i + 2];
    const off = Math.abs(r - 16) + Math.abs(g - 19) + Math.abs(bl - 23);
    if (off > 24 && !(bl > 130 && bl >= r + 20)) n++;
  }
  return n;
}

function officer(extra: Partial<EntityState>): EntityState {
  return {
    id: 'o',
    type: 'officer',
    x: 0,
    y: 0,
    facing: 0,
    health: 100,
    maxHealth: 100,
    held: 'chargeRifle',
    ...extra,
  } as EntityState;
}

/** Draw one officer at a screen anchor; the gun-area box to read it back in. */
function drawAt(extra: Partial<EntityState>, sx: number, sy: number): Box {
  ctx.setTransform(SCALE, 0, 0, SCALE, sx, sy);
  drawEntity(ctx, officer(extra), false, 1000, false, SCALE);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  // The weapon lies to the +x side; the chamber and its bloom sit ~1 radius
  // out along it. Kept fully on-canvas.
  return {
    x: Math.max(0, Math.round(sx - R * SCALE * 0.6)),
    y: Math.max(0, Math.round(sy - R * SCALE * 2)),
    w: Math.round(R * SCALE * 3),
    h: Math.round(R * SCALE * 4),
  };
}

interface Result {
  errors: string[];
  chamberDeltaByCharge: number[];
  chamberBrightens: boolean;
  emberByCool: number[];
  emberFades: boolean;
  beamWidthByLevel: number[];
  beamBlueByLevel: number[];
  beamThickens: boolean;
  beamIsBlue: boolean;
  wallScorchCircleOnWall: number;
  wallScorchCircleOffWall: number;
  wallScorchWhiteEachSide: [number, number];
  wallScorchLongLines: number;
  craterDarkMark: number;
  craterBrightBlue: number;
  cooldownRedByCool: number[];
  cooldownRecedes: boolean;
  ok: boolean;
}

function run(): void {
  const result: Result = {
    errors: [],
    chamberDeltaByCharge: [],
    chamberBrightens: false,
    emberByCool: [],
    emberFades: false,
    beamWidthByLevel: [],
    beamBlueByLevel: [],
    beamThickens: false,
    beamIsBlue: false,
    wallScorchCircleOnWall: 0,
    wallScorchCircleOffWall: 0,
    wallScorchWhiteEachSide: [0, 0],
    wallScorchLongLines: 0,
    craterDarkMark: 0,
    craterBrightBlue: 0,
    cooldownRedByCool: [],
    cooldownRecedes: false,
    ok: false,
  };

  try {
    setWorldSize(2000, 2000);

    // --- the chamber, brightening with the charge (additive glow over the
    //     un-charged baseline, so the body itself subtracts out).
    clear();
    const base = lum(drawAt({ charging: 0 }, 150, 150));
    const charges = [0.25, 0.5, 0.75, 1];
    result.chamberDeltaByCharge = charges.map((c, i) => {
      clear();
      return lum(drawAt({ charging: c }, 150, 150)) - base;
    });
    result.chamberBrightens =
      result.chamberDeltaByCharge.every((v, i) => i === 0 || v > result.chamberDeltaByCharge[i - 1]) &&
      result.chamberDeltaByCharge[3] > 4000;

    // --- the ember, fresher = brighter (also baseline-subtracted).
    clear();
    const embBase = redEnergy(drawAt({}, 150, 150));
    result.emberByCool = [1, 0.4].map((c) => {
      clear();
      return redEnergy(drawAt({ cooling: c }, 150, 150)) - embBase;
    });
    result.emberFades = result.emberByCool[0] > 1500 && result.emberByCool[0] > result.emberByCool[1];

    // --- the beam, per bar level
    clear();
    for (let lvl = 1; lvl <= 4; lvl++) {
      const y = 260;
      const t: Tracer = { x1: 60, y1: y, x2: 520, y2: y, hit: true, born: 0, plasma: lvl };
      clear();
      drawPlasmaBeam(ctx, t, 40); // mid-life, still bright
      const d = ctx.getImageData(280, y - 40, 1, 80).data;
      let lit = 0;
      let blueLit = 0;
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i];
        const g = d[i + 1];
        const b = d[i + 2];
        if (r + g + b > 60) {
          lit++;
          // Blue the dominant channel (blue, cyan and white all pass; red and
          // yellow do not). The dim edge of the beam is still blue-dominant
          // even where it is too faint for a brightness threshold.
          if (b >= r && b >= g - 8) blueLit++;
        }
      }
      result.beamWidthByLevel.push(lit);
      result.beamBlueByLevel.push(blueLit);
    }
    result.beamThickens =
      result.beamWidthByLevel[3] > result.beamWidthByLevel[0] &&
      result.beamWidthByLevel.every((v, i) => i === 0 || v >= result.beamWidthByLevel[i - 1]);
    result.beamIsBlue = result.beamBlueByLevel.every((b, i) => b >= result.beamWidthByLevel[i] * 0.9);

    // --- the wall scorch. Beam travels +x, so the wall is on the +x side and
    //     the open/ground side is -x; "along the wall" is ±y. The glowing
    //     circle must sit +x of the impact line (on the wall), not -x. The
    //     white streak must reach both ±y. And nothing may be a long line.
    clear();
    clearBlood();
    spawnPlasmaScorch(150, 150, 0, 4, 1);
    drawBulletHoles(ctx, VIEW);
    {
      const bx = 60;
      const by = 60;
      const w = 180;
      const dat = ctx.getImageData(bx, by, w, w).data;
      let onWall = 0; // dense bright ink +x of the impact, near — the circle
      let offWall = 0; // dense bright ink -x of the impact, near — must be ~0
      let whiteUp = 0;
      let whiteDown = 0;
      let longLines = 0;
      for (let i = 0; i < dat.length; i += 4) {
        const p = i / 4;
        const dx = (p % w) - 90;
        const dy = Math.floor(p / w) - 90;
        const dist = Math.hypot(dx, dy);
        const sum = dat[i] + dat[i + 1] + dat[i + 2];
        const dense = sum > 260; // a fill, not a thin bolt line
        // The along-wall streak: white core over a blue middle.
        const brightWhite = dat[i] > 150 && dat[i + 1] > 175 && dat[i + 2] > 205;
        if (dense && dist >= 3 && dist <= 18) {
          if (dx > 2) onWall++;
          else if (dx < -2) offWall++;
        }
        // The streak runs ±y from the inset centre (dx ~ +13), reaching out.
        if (brightWhite && Math.abs(dy) >= 15 && Math.abs(dy) <= 44 && dx > -4 && dx < 30) {
          if (dy < 0) whiteUp++;
          else whiteDown++;
        }
        if (sum > 150 && dist > 58) longLines++;
      }
      result.wallScorchCircleOnWall = onWall;
      result.wallScorchCircleOffWall = offWall;
      result.wallScorchWhiteEachSide = [whiteUp, whiteDown];
      result.wallScorchLongLines = longLines;
    }

    // --- the ground crater: a dark burn now, the bright blue moved to the wall.
    clear();
    clearBlood();
    spawnPlasmaCrater(170, 170, 4, 1);
    drawGroundScorch(ctx, VIEW);
    result.craterDarkMark = countDark({ x: 120, y: 120, w: 100, h: 100 });
    result.craterBrightBlue = countBlue({ x: 120, y: 120, w: 100, h: 100 });

    // --- the HUD cooldown bar, receding
    result.cooldownRedByCool = [1, 0.5, 0.12].map((c, i) => {
      clear();
      drawChargeCooldown(ctx, 200, 200, c);
      const d = ctx.getImageData(166, 237, 68, 1).data; // the bar row
      let redPx = 0;
      for (let j = 0; j < d.length; j += 4) if (d[j] > 150 && d[j] > d[j + 2] + 30) redPx++;
      return redPx;
    });
    result.cooldownRecedes =
      result.cooldownRedByCool[0] > result.cooldownRedByCool[1] &&
      result.cooldownRedByCool[1] > result.cooldownRedByCool[2];

    result.ok =
      result.errors.length === 0 &&
      result.chamberBrightens &&
      result.emberFades &&
      result.beamThickens &&
      result.beamIsBlue &&
      // The circle sits on the wall side, essentially none of it on the open side.
      result.wallScorchCircleOnWall > 40 &&
      result.wallScorchCircleOffWall < result.wallScorchCircleOnWall * 0.15 &&
      // The white streak reaches both ways along the wall.
      result.wallScorchWhiteEachSide[0] > 10 &&
      result.wallScorchWhiteEachSide[1] > 10 &&
      // No long lines.
      result.wallScorchLongLines < 15 &&
      result.craterDarkMark > 200 &&
      result.craterBrightBlue < result.craterDarkMark * 0.25 &&
      result.cooldownRecedes;
  } catch (e) {
    result.errors.push(String(e));
  }

  // Leave something to look at.
  clear();
  clearBlood();
  setWorldSize(2000, 2000);
  ctx.font = '11px sans-serif';
  ctx.fillStyle = '#8aa';
  ctx.fillText('chamber 6x — charge 0 / 0.35 / 0.7 / 1, then venting', 40, 24);
  [0, 0.35, 0.7, 1].forEach((c, i) => {
    ctx.setTransform(6, 0, 0, 6, 150 + i * 250, 130);
    drawEntity(ctx, officer({ charging: c }), false, 1000, false, 6);
  });
  ctx.setTransform(6, 0, 0, 6, 150 + 4 * 250, 130);
  drawEntity(ctx, officer({ cooling: 0.85 }), false, 1000, false, 6);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#8aa';
  ctx.fillText('at the camera zoom (2x) — same sequence', 40, 250);
  [0, 0.35, 0.7, 1, 0].forEach((c, i) => {
    ctx.setTransform(2, 0, 0, 2, 90 + i * 80, 300);
    drawEntity(ctx, officer(i === 4 ? { cooling: 0.85 } : { charging: c }), false, 1000, false, 2);
  });
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#8aa';
  ctx.fillText('beam levels 1–4', 40, 380);
  for (let lvl = 1; lvl <= 4; lvl++) {
    const y = 390 + lvl * 24;
    drawPlasmaBeam(ctx, { x1: 60, y1: y, x2: 640, y2: y, hit: true, born: 0, plasma: lvl }, 40);
  }
  // One clean angle-0 scorch, with a fake wall drawn to its right so the
  // "beam went in from the left / lightning must not cross into the wall" is
  // visible, then magnified.
  ctx.fillStyle = '#242832';
  ctx.fillRect(720, 300, 200, 220);
  spawnPlasmaScorch(720, 410, 0, 4, 1);
  spawnPlasmaCrater(900, 560, 4, 3);
  drawGroundScorch(ctx, VIEW);
  drawBulletHoles(ctx, VIEW);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(canvas, 640, 320, 190, 190, 970, 340, 260, 260);
  ctx.strokeStyle = '#334';
  ctx.strokeRect(970, 340, 260, 260);
  // Redraw the wall edge in the magnified view for reference.
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fillText('scorch (angle 0 → beam hit the wall on the RIGHT), then 2.7x', 640, 315);
  ctx.fillStyle = '#8aa';
  ctx.fillText('scorch / crater; cooldown bar 1.0 / 0.5 / 0.15', 40, 700);
  drawChargeCooldown(ctx, 200, 710, 1);
  drawChargeCooldown(ctx, 340, 710, 0.5);
  drawChargeCooldown(ctx, 480, 710, 0.15);
  ctx.fillStyle = result.ok ? '#6b6' : '#c66';
  ctx.fillText(`ok=${result.ok}  ${JSON.stringify(result.errors)}`, 12, 12);

  (window as unknown as Record<string, unknown>).rigResult = result;
  console.log('[chargerig]', JSON.stringify(result));
}

setInterval(run, 800);
run();
