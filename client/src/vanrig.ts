/**
 * SWAT van arrival rig — an animated demo, because in a live round the whole
 * thing is over in two seconds and easy to miss.
 *
 * Three styles, left or right within each. All of them come in **dead
 * straight**, then turn — and the FISHHOOK, which is the one that was actually
 * asked for, **finishes its turn well before it stops and spends the last third
 * of the manoeuvre running out sideways on the new heading**. That run-out is
 * the hook, and it is the thing two earlier attempts did not have: with the
 * turn instead finishing at the resting spot, the biggest angle is only ever
 * reached at the instant the van stops, so it is never travelled at.
 *
 * Top: a live loop of all six. Below: a filmstrip of each, left → right, so a
 * single frame can be studied.
 *
 * The motion is the real thing: `vanBrakePose` / `vanBrakeSpeed` /
 * `vanPathDisplacement` from `shared/vancurve.ts` are exactly what
 * `server/backup.ts` drives the van with and what `slideFits` checks against.
 * The rig only supplies the tick loop.
 *
 * rAF is throttled to nothing while the browser pane is not compositing, so the
 * loop runs off `setInterval`. `getImageData` needs no compositing.
 */
import {
  BACKUP_ARRIVE_DIST,
  GROUND_COLOR,
  VAN_APPROACH_SPEED,
  VAN_FISHHOOK_BRAKE,
  VAN_FISHHOOK_DONE,
  VAN_FISHHOOK_HOLD,
  VAN_FISHHOOK_SLEW,
  VAN_HOOK_BRAKE,
  VAN_HOOK_SLEW,
  VAN_LEAN_BRAKE,
  VAN_LEAN_SLEW,
} from '../../shared/constants.js';
import {
  VAN_TURN_HOLD,
  VAN_TRAVEL_FOLLOW,
  vanBrakePose,
  vanBrakeSpeed,
  vanPathDisplacement,
  type BrakeParams,
} from '../../shared/vancurve.js';
import { drawBackupVehicles, type Viewport } from './render.js';
import type { BackupVehicleState } from '../../shared/types.js';

const canvas = document.getElementById('rig') as HTMLCanvasElement;
const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
const out = document.getElementById('out') as HTMLPreElement;
const BIG: Viewport = { x: -1e6, y: -1e6, w: 2e6, h: 2e6 };

interface Style {
  label: string;
  slew: number;
  brake: number;
  hold: number;
  done: number;
  driftDir: number;
  heavy: boolean;
}
function pair(
  name: string,
  slew: number,
  brake: number,
  hold: number,
  done: number,
  heavy: boolean,
): Style[] {
  return [-1, 1].map((driftDir) => ({
    label: `${name} · ${driftDir < 0 ? 'left' : 'right'}`,
    slew,
    brake,
    hold,
    done,
    driftDir,
    heavy,
  }));
}
const STYLES: Style[] = [
  ...pair('FISHHOOK', VAN_FISHHOOK_SLEW, VAN_FISHHOOK_BRAKE, VAN_FISHHOOK_HOLD, VAN_FISHHOOK_DONE, true),
  ...pair('HOOK', VAN_HOOK_SLEW, VAN_HOOK_BRAKE, VAN_TURN_HOLD, 1, true),
  ...pair('LEAN', VAN_LEAN_SLEW, VAN_LEAN_BRAKE, VAN_TURN_HOLD, 1, false),
];

const DT = 1 / 60;
const APPROACH_RUN = 200;
const HOLD = 150;

/** The `BrakeParams` for a style: the brake begins on the approach line at
 *  `(bx, by)` and the van comes to rest at `brakeStart + fullPathDisplacement`,
 *  exactly as `callBackup` works it out. */
function paramsFor(s: Style, bx: number, by: number): BrakeParams {
  const partial: BrakeParams = {
    targetX: 0,
    targetY: 0,
    heading: 0,
    slew: s.slew,
    driftDir: s.driftDir,
    turnHold: s.hold,
    turnDone: s.done,
    brake: s.brake,
  };
  const full = vanPathDisplacement(partial, 0, 1);
  return { ...partial, targetX: bx + full.dx, targetY: by + full.dy };
}

/** One full arrival as a list of wire states, driven by the real curve. Each
 *  style gets its own patch of world so their skid clocks never collide. */
function frames(s: Style, si: number): BackupVehicleState[] {
  const bx = 5000 + si * 5000;
  const by = si * 5000;
  const heading = 0;
  const base = paramsFor(s, bx, by);
  const sl = s.slew * s.driftDir;
  const curve = { sl, th: s.hold, td: s.done, bk: s.brake };

  const list: BackupVehicleState[] = [];
  // Approach: dead straight along the line, from `APPROACH_RUN` back to `bx`.
  for (let run = APPROACH_RUN; run > 0; run -= VAN_APPROACH_SPEED * DT) {
    list.push({ kind: 'van', x: bx - run, y: by, facing: heading, parked: false, skidAngle: heading });
  }
  // Brake: the curve, `along` px of it still to run.
  let along = s.brake;
  while (along > BACKUP_ARRIVE_DIST) {
    along -= vanBrakeSpeed(along, s.brake) * DT;
    const p = vanBrakePose(base, Math.max(0, along));
    list.push({
      kind: 'van',
      x: p.x,
      y: p.y,
      facing: p.facing,
      parked: false,
      skidX: bx,
      skidY: by,
      skidAngle: heading,
      braking: true,
      ...curve,
      heavy: s.heavy || undefined,
    });
  }
  const rest = vanBrakePose(base, 0);
  for (let i = 0; i < HOLD; i++) {
    const t = i / HOLD;
    list.push({
      kind: 'van',
      x: rest.x,
      y: rest.y,
      facing: rest.facing,
      parked: true,
      skidX: bx,
      skidY: by,
      skidAngle: heading,
      ...curve,
      heavy: s.heavy || undefined,
      rearOpen: Math.min(1, Math.max(0, (t - 0.12) * 4)),
      cabOpen: Math.min(1, Math.max(0, (t - 0.3) * 4)),
    });
  }
  return list;
}

const SEQ = STYLES.map((s, si) => frames(s, si));

/** Draw wire state `fr` with its van centred at (cx, cy). */
function place(fr: BackupVehicleState, cx: number, cy: number, now: number, scale = 1): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  ctx.translate(-fr.x, -fr.y);
  drawBackupVehicles(ctx, [fr], BIG, now);
  ctx.restore();
}

// ---- layout ---------------------------------------------------------
const LOOP_TOP = 30;
const LOOP_CELL_W = canvas.width / 2;
const LOOP_CELL_H = 206;
const STRIP_TOP = LOOP_TOP + LOOP_CELL_H * 3 + 26;
const STRIP_ROW_H = 244;
const STRIP_N = 8;
const STRIP_SCALE = 0.6;

// static filmstrips — drawn once
ctx.fillStyle = GROUND_COLOR;
ctx.fillRect(0, 0, canvas.width, canvas.height);
STYLES.forEach((s, si) => {
  const f = SEQ[si];
  const brakeStart = Math.max(0, f.findIndex((x) => x.braking) - 3);
  const end = f.length - Math.floor(HOLD * 0.3);
  const y = STRIP_TOP + si * STRIP_ROW_H + STRIP_ROW_H * 0.5;
  ctx.fillStyle = '#94a3b8';
  ctx.font = '12px monospace';
  ctx.fillText(
    `${s.label}   —   nose →,  in straight from the left, then the turn, then the run-out`,
    14,
    STRIP_TOP + si * STRIP_ROW_H + 13,
  );
  // Spread along the strip, but keep each pose's **real** offset across the
  // approach line, so the row traces the path rather than sitting eight vans on
  // one baseline. The marks and smoke are stripped from every frame but the
  // last: eight overlapping copies of the same trail is a smear, where one full
  // trail under the parked van is the trajectory.
  const gap = (canvas.width - 170) / STRIP_N;
  const shots = Array.from({ length: STRIP_N }, (_, j) =>
    f[Math.min(Math.round(brakeStart + ((end - brakeStart) * j) / (STRIP_N - 1)), f.length - 1)],
  );
  // Centre the row on the drift it actually makes, or a fishhook — which is all
  // in one direction by construction — climbs straight out of its own row.
  const drift = shots.map((fr) => fr.y);
  const mid = (Math.min(...drift) + Math.max(...drift)) / 2;
  shots.forEach((fr, j) => {
    const last = j === STRIP_N - 1;
    const shown: BackupVehicleState = last
      ? fr
      : { ...fr, skidX: undefined, skidY: undefined, braking: undefined };
    place(shown, 105 + j * gap, y + (fr.y - mid) * STRIP_SCALE, 900 + j * 260, STRIP_SCALE);
  });
});

// ---- live loop -------------------------------------------------
let k = 0;
const loopLen = Math.max(...SEQ.map((f) => f.length)) + 20;
function tick(): void {
  ctx.fillStyle = GROUND_COLOR;
  ctx.fillRect(0, 0, canvas.width, STRIP_TOP - 6);
  const now = performance.now();
  STYLES.forEach((s, si) => {
    const col = si % 2;
    const row = Math.floor(si / 2);
    const cx = col * LOOP_CELL_W + LOOP_CELL_W * 0.62;
    const cy = LOOP_TOP + row * LOOP_CELL_H + LOOP_CELL_H / 2 + 4;
    // Clipped to its own cell. A fishhook's trail is ~180px across at world
    // scale, which is most of a cell, and without this it lands in the row
    // above or below and reads as that row's van having done something odd.
    ctx.save();
    ctx.beginPath();
    ctx.rect(col * LOOP_CELL_W, LOOP_TOP + row * LOOP_CELL_H, LOOP_CELL_W, LOOP_CELL_H);
    ctx.clip();
    place(SEQ[si][Math.min(k, SEQ[si].length - 1)], cx, cy, now, 0.82);
    ctx.restore();
    ctx.fillStyle = '#94a3b8';
    ctx.font = '12px monospace';
    ctx.fillText(`${s.label}   (looping)`, col * LOOP_CELL_W + 14, LOOP_TOP + row * LOOP_CELL_H + 14);
  });
  ctx.strokeStyle = 'rgba(148,163,184,0.14)';
  ctx.strokeRect(0.5, LOOP_TOP - 0.5, canvas.width - 1, LOOP_CELL_H * 3);
  ctx.beginPath();
  ctx.moveTo(LOOP_CELL_W, LOOP_TOP);
  ctx.lineTo(LOOP_CELL_W, LOOP_TOP + LOOP_CELL_H * 3);
  for (let r = 1; r < 3; r++) {
    ctx.moveTo(0, LOOP_TOP + LOOP_CELL_H * r);
    ctx.lineTo(canvas.width, LOOP_TOP + LOOP_CELL_H * r);
  }
  ctx.stroke();
  k = (k + 1) % loopLen;
}
setInterval(tick, 1000 / 60);

// ---- assertions --------------------------------------------------
const result: Record<string, unknown> = {};
{
  const f = SEQ[0];
  const approach = f.filter((x) => !x.braking && !x.parked);
  result.approachDeviationPx =
    Math.round((Math.max(...approach.map((x) => x.y)) - Math.min(...approach.map((x) => x.y))) * 1000) / 1000;

  const per: Record<string, Record<string, number>> = {};
  for (const s of STYLES) {
    const base = paramsFor(s, 0, 0);
    const rest = vanBrakePose(base, 0);
    // Where the turn finishes, and what is travelled after it — the hook.
    const atDone = vanBrakePose(base, base.brake * (1 - s.done));
    const travelDeg = ((s.slew * s.driftDir * VAN_TRAVEL_FOLLOW) * 180) / Math.PI;
    per[s.label] = {
      restAngleDeg: Math.round((rest.facing * 180) / Math.PI),
      // How far the resting spot has bent off the approach line (y = 0).
      pathBendPx: Math.round(base.targetY),
      // The run-out: distance covered after the wheel comes back straight, and
      // how much of it is *across* the approach line. That second number is
      // "more travel to the right or left at the end" stated as a measurement.
      runOutPx: Math.round(Math.hypot(rest.x - atDone.x, rest.y - atDone.y)),
      runOutAcrossPx: Math.round(rest.y - atDone.y),
      // The slide: the body points further round than it is actually travelling.
      bodyAheadOfTravelDeg: Math.round(Math.round((rest.facing * 180) / Math.PI) - travelDeg),
    };
  }
  result.perStyle = per;

  // Where in each brake the body is still dead straight, measured off the
  // frames rather than off the constant.
  const straight: Record<string, number> = {};
  STYLES.forEach((s, si) => {
    const motion = SEQ[si].filter((x) => x.braking);
    const turned = motion.findIndex((x) => Math.abs(x.facing) > (2 * Math.PI) / 180);
    straight[s.label] = turned < 0 ? 1 : Math.round((turned / motion.length) * 100) / 100;
  });
  result.straightFractionOfBrakeMotion = straight;

  const mirrored = (a: string, b: string): boolean =>
    per[a].restAngleDeg === -per[b].restAngleDeg &&
    per[a].pathBendPx === -per[b].pathBendPx &&
    per[a].runOutAcrossPx === -per[b].runOutAcrossPx;
  result.leftRightMirror =
    mirrored('FISHHOOK · left', 'FISHHOOK · right') &&
    mirrored('HOOK · left', 'HOOK · right') &&
    mirrored('LEAN · left', 'LEAN · right')
      ? 'yes'
      : 'no';
}
(window as unknown as { vanRig: unknown }).vanRig = result;
out.textContent = JSON.stringify(result, null, 2);
console.log('[vanrig]', JSON.stringify(result));
