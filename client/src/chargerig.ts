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
  wallBarBlue: number; // the bold blue bar along the wall face
  wallBarSpan: number; // how far that bar runs along the wall, end to end
  wallCoreWhite: number; // the white core
  wallCorePurple: number; // the purple ring around it
  wallOffWall: number; // solid bar/core ink outside the wall rect — must be ~0
  wallBoltInto: number; // cyan lightning past the bar, into the wall
  wallBoltOut: number; // cyan lightning past the bar, open side
  stoppedBoltInto: number; // the non-pierced mark: must have none of the above
  stoppedFarFaceInk: number; // solid ink near the far face of a thin wall — must be ~0
  piercedFarFaceInk: number; // the same region on a pierced mark — the control, must be > 0
  wallCoreStraightDy: number; // the core's vertical reach, shot square
  wallCoreAngledDy: number; // …shot at -1.0 — must be taller (the core tilted)
  wallAngledCoreShifts: boolean;
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
    wallBarBlue: 0,
    wallBarSpan: 0,
    wallCoreWhite: 0,
    wallCorePurple: 0,
    wallOffWall: 0,
    wallBoltInto: 0,
    wallBoltOut: 0,
    stoppedBoltInto: 0,
    stoppedFarFaceInk: 0,
    piercedFarFaceInk: 0,
    wallCoreStraightDy: 0,
    wallCoreAngledDy: 0,
    wallAngledCoreShifts: false,
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

    // --- the wall scorch, against a real wall it must clip itself to. The wall
    //     is a thin vertical slab whose LEFT face is at x=200; the beam travels
    //     +x into it. The bar runs ±y on the face, the core sits in the wall,
    //     cyan lightning arcs off both faces (±x) — and *nothing solid* renders
    //     outside the slab (dx 0..14), which is the whole of "it colours the
    //     wall".
    {
      const WALL = { x: 200, y: 60, w: 14, h: 180 };
      clear();
      clearBlood();
      spawnPlasmaScorch(200, 150, 0, 4, 1, [WALL]);
      drawBulletHoles(ctx, VIEW);
      const bx = 120;
      const by = 50;
      const w = 220;
      const dat = ctx.getImageData(bx, by, w, 200).data;
      let barBlue = 0;
      let barSpan = 0;
      let coreWhite = 0;
      let corePurple = 0;
      let offWall = 0;
      let boltInto = 0;
      let boltOut = 0;
      for (let i = 0; i < dat.length; i += 4) {
        const p = i / 4;
        const dx = (p % w) + bx - 200; // relative to the impact / face at x=200
        const dy = Math.floor(p / w) + by - 150;
        const r = dat[i];
        const g = dat[i + 1];
        const b = dat[i + 2];
        // purple is the core ring's alone (cyan has |r-b| ~150); bar-blue is the
        // bar body's alone (cyan has g high); cyan is the lightning's alone.
        const purple = r > 90 && b > 110 && r > g + 22 && b > g + 22 && Math.abs(r - b) < 100;
        const barBlueBody = b > 110 && g < 95 && r < 85;
        const white = r > 140 && g > 120 && b > 150;
        const cyan = b > 70 && g > 55 && b >= r && g >= r;
        // solid mark OUTSIDE the slab (with the 1px clip pad) — must be ~0.
        // Only purple/bar-blue count: densely stacked cyan lightning reads as
        // "white" and legitimately arcs out past the slab.
        if ((purple || barBlueBody) && (dx < -3 || dx > 20)) offWall++;
        if (barBlueBody && dx >= -1 && dx <= 18) {
          barBlue++;
          barSpan = Math.max(barSpan, Math.abs(dy));
        }
        if ((white || purple) && dx >= -1 && dx <= 18 && Math.abs(dy) < 18) {
          if (white) coreWhite++;
          else corePurple++;
        }
        if (cyan && Math.abs(dy) < 34) {
          if (dx > 17 && dx < 46) boltInto++;
          else if (dx < -6 && dx > -46) boltOut++;
        }
      }
      result.wallBarBlue = barBlue;
      result.wallBarSpan = barSpan * 2;
      result.wallCoreWhite = coreWhite;
      result.wallCorePurple = corePurple;
      result.wallOffWall = offWall;
      result.wallBoltInto = boltInto;
      result.wallBoltOut = boltOut;
    }

    // --- the wall that actually stops it, `pierced = false`: nothing may read
    //     as though the round came out the other side. No lightning past the
    //     bar into the wall, and the white/purple ink must not reach the far
    //     face of this thin (14px) slab — where the pierced mark legitimately
    //     does, since the beam genuinely went through it.
    {
      const WALL = { x: 200, y: 60, w: 14, h: 180 };
      const measure = (isPierced: boolean): { farFaceInk: number; boltInto: number } => {
        clear();
        clearBlood();
        spawnPlasmaScorch(200, 150, 0, 4, 1, [WALL], isPierced);
        drawBulletHoles(ctx, VIEW);
        const bx = 120;
        const by = 50;
        const w = 220;
        const dat = ctx.getImageData(bx, by, w, 200).data;
        let farFaceInk = 0;
        let boltInto = 0;
        for (let i = 0; i < dat.length; i += 4) {
          const p = i / 4;
          const dx = (p % w) + bx - 200; // relative to the near face at x=200
          const dy = Math.floor(p / w) + by - 150;
          const r = dat[i];
          const g = dat[i + 1];
          const b = dat[i + 2];
          const purple = r > 90 && b > 110 && r > g + 22 && b > g + 22 && Math.abs(r - b) < 100;
          const barBlueBody = b > 110 && g < 95 && r < 85;
          const white = r > 140 && g > 120 && b > 150;
          const cyan = b > 70 && g > 55 && b >= r && g >= r;
          // right at the wall's far face (the slab is 14px thick, dx=14 is it).
          if ((purple || barBlueBody || white) && dx >= 11 && dx <= 16 && Math.abs(dy) < 18) farFaceInk++;
          if (cyan && Math.abs(dy) < 34 && dx > 17 && dx < 46) boltInto++;
        }
        return { farFaceInk, boltInto };
      };
      const stopped = measure(false);
      const throughIt = measure(true);
      result.stoppedBoltInto = stopped.boltInto;
      result.stoppedFarFaceInk = stopped.farFaceInk;
      result.piercedFarFaceInk = throughIt.farFaceInk;
    }

    // --- an angled shot tilts the core. Same left-face wall; fire square and
    //     at -1.0 rad, and the purple ring's vertical reach must grow because
    //     its long axis followed the beam.
    {
      const WALL = { x: 200, y: 60, w: 60, h: 160 };
      const purpleMaxDy = (ang: number): number => {
        clear();
        clearBlood();
        spawnPlasmaScorch(200, 150, ang, 4, 1, [WALL]);
        drawBulletHoles(ctx, VIEW);
        const bx = 190;
        const by = 100;
        const w = 100;
        const dat = ctx.getImageData(bx, by, w, 100).data;
        let mx = 0;
        for (let i = 0; i < dat.length; i += 4) {
          const p = i / 4;
          const dy = Math.floor(p / w) + by - 150;
          const r = dat[i];
          const g = dat[i + 1];
          const b = dat[i + 2];
          if (r > 90 && b > 110 && r > g + 22 && b > g + 22 && Math.abs(r - b) < 100) {
            mx = Math.max(mx, Math.abs(dy));
          }
        }
        return mx;
      };
      result.wallCoreStraightDy = purpleMaxDy(0);
      result.wallCoreAngledDy = purpleMaxDy(-1);
      result.wallAngledCoreShifts =
        result.wallCoreStraightDy > 2 && result.wallCoreAngledDy > result.wallCoreStraightDy + 1.5;
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
      // a blue bar along the wall (clipped to a thin slab, so a modest count)
      result.wallBarBlue > 150 &&
      // a white core ringed in purple
      result.wallCoreWhite > 3 &&
      result.wallCorePurple > 8 &&
      // NOTHING solid renders off the wall — the whole point
      result.wallOffWall < 25 &&
      // cyan lightning arcs off both faces of the wall
      result.wallBoltInto > 4 &&
      result.wallBoltOut > 4 &&
      // the wall that stops it: no lightning through, and the ink stays well
      // short of the far face where the pierced mark legitimately reaches it
      result.stoppedBoltInto === 0 &&
      result.piercedFarFaceInk > 5 &&
      result.stoppedFarFaceInk < result.piercedFarFaceInk * 0.5 &&
      // an angled shot tilts the core
      result.wallAngledCoreShifts &&
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
  // A straight-in scorch against a wall on its right, and an angled one into
  // the SAME wall (so the diagonal core, clipped to the wall, shows), each
  // magnified 2.7x. The scorch is handed the wall and clips itself to it.
  const dW1 = { x: 705, y: 300, w: 16, h: 150 };
  const dW2 = { x: 705, y: 470, w: 90, h: 150 };
  ctx.fillStyle = '#242832';
  ctx.fillRect(dW1.x, dW1.y, dW1.w, dW1.h);
  ctx.fillRect(dW2.x, dW2.y, dW2.w, dW2.h);
  spawnPlasmaScorch(705, 375, 0, 4, 1, [dW1]);
  spawnPlasmaScorch(705, 545, -0.85, 4, 2, [dW2]);
  spawnPlasmaCrater(970, 560, 4, 3);
  drawGroundScorch(ctx, VIEW);
  drawBulletHoles(ctx, VIEW);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(canvas, 625, 300, 170, 170, 950, 300, 250, 250);
  ctx.drawImage(canvas, 625, 470, 170, 170, 950, 570, 250, 250);
  ctx.strokeStyle = '#334';
  ctx.strokeRect(950, 300, 250, 250);
  ctx.strokeRect(950, 570, 250, 250);
  ctx.fillStyle = '#8aa';
  ctx.fillText('scorch straight-in — wall on the RIGHT — 2.7x', 950, 294);
  ctx.fillText('scorch angled ~49° into the same wall — 2.7x', 950, 564);
  // A third: the wall that finally stops it, `pierced = false`. No lightning
  // through to the far side and the white core stops short of it, unlike the
  // two above, which the beam genuinely went through.
  const dW3 = { x: 250, y: 520, w: 16, h: 120 };
  ctx.fillStyle = '#242832';
  ctx.fillRect(dW3.x, dW3.y, dW3.w, dW3.h);
  spawnPlasmaScorch(250, 580, 0, 4, 7, [dW3], false);
  drawBulletHoles(ctx, VIEW);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(canvas, 170, 520, 150, 120, 460, 500, 220, 176);
  ctx.strokeStyle = '#334';
  ctx.strokeRect(460, 500, 220, 176);
  ctx.fillStyle = '#8aa';
  ctx.fillText('scorch, stopped here (pierced = false)', 460, 494);
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
