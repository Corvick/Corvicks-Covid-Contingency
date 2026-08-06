import type { AbilityId } from '../../shared/types.js';

export interface WheelOption {
  id: AbilityId;
  label: string;
}

/** Radial ability menu, held open with Q. */
export const WHEEL_OPTIONS: WheelOption[] = [{ id: 'rally', label: 'GET OVER THERE!' }];

const RADIUS = 118;
const INNER = 46;
/** Cursor must be at least this far from centre to count as a selection. */
const DEAD_ZONE = 34;

export interface WheelState {
  open: boolean;
  /** Screen position of the hub — always the centre of the viewport. */
  cx: number;
  cy: number;
  /** Index of the option the cursor is currently over, or -1. */
  hover: number;
  /** Timestamp of the last rejected click, for the red flash. */
  deniedAt: number;
  deniedIndex: number;
}

export function newWheelState(): WheelState {
  return { open: false, cx: 0, cy: 0, hover: -1, deniedAt: 0, deniedIndex: -1 };
}

/** Which sector the cursor sits in, or -1 when inside the dead zone. */
export function hitTest(wheel: WheelState, mx: number, my: number): number {
  const dx = mx - wheel.cx;
  const dy = my - wheel.cy;
  if (Math.hypot(dx, dy) < DEAD_ZONE) return -1;

  const count = WHEEL_OPTIONS.length;
  if (count === 1) return 0; // a single option owns every direction

  const slice = (Math.PI * 2) / count;
  let angle = Math.atan2(dy, dx) + Math.PI / 2 + slice / 2;
  while (angle < 0) angle += Math.PI * 2;
  return Math.floor((angle % (Math.PI * 2)) / slice);
}

export function drawWheel(
  ctx: CanvasRenderingContext2D,
  wheel: WheelState,
  charges: number,
  now: number,
): void {
  if (!wheel.open) return;

  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.beginPath();
  ctx.arc(wheel.cx, wheel.cy, RADIUS + 16, 0, Math.PI * 2);
  ctx.fill();

  const count = WHEEL_OPTIONS.length;
  const slice = (Math.PI * 2) / count;

  for (let i = 0; i < count; i++) {
    const start = -Math.PI / 2 - slice / 2 + i * slice;
    const end = start + slice;
    const hovered = wheel.hover === i;
    const usable = charges > 0;

    // Flash red briefly when a click is refused for lack of charges.
    const deniedAge = now - wheel.deniedAt;
    const denied = wheel.deniedIndex === i && deniedAge < 450;
    const flash = denied ? 0.5 + 0.5 * Math.cos((deniedAge / 450) * Math.PI * 4) : 0;

    ctx.beginPath();
    ctx.moveTo(wheel.cx, wheel.cy);
    ctx.arc(wheel.cx, wheel.cy, RADIUS, start, end);
    ctx.closePath();

    if (denied) ctx.fillStyle = `rgba(220, 38, 38, ${0.45 + flash * 0.4})`;
    else if (hovered) ctx.fillStyle = usable ? 'rgba(56, 189, 248, 0.5)' : 'rgba(120, 113, 108, 0.5)';
    else ctx.fillStyle = 'rgba(31, 41, 55, 0.82)';
    ctx.fill();

    ctx.strokeStyle = 'rgba(148, 163, 184, 0.6)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    const mid = start + slice / 2;
    const tx = wheel.cx + Math.cos(mid) * (RADIUS * 0.62);
    const ty = wheel.cy + Math.sin(mid) * (RADIUS * 0.62);

    ctx.fillStyle = usable ? '#f8fafc' : '#9ca3af';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(WHEEL_OPTIONS[i].label, tx, ty);

    ctx.fillStyle = usable ? '#7dd3fc' : '#f87171';
    ctx.font = '11px sans-serif';
    ctx.fillText(`${charges} charge${charges === 1 ? '' : 's'}`, tx, ty + 16);
  }

  // Hub
  ctx.beginPath();
  ctx.arc(wheel.cx, wheel.cy, INNER, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.5)';
  ctx.stroke();

  ctx.fillStyle = '#cbd5e1';
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('pick an', wheel.cx, wheel.cy - 7);
  ctx.fillText('order', wheel.cx, wheel.cy + 7);
  ctx.restore();
}

/** Blue arrow shown while an ability is armed and waiting for a target. */
export function drawTargetCursor(ctx: CanvasRenderingContext2D, x: number, y: number, now: number): void {
  const bob = Math.sin(now * 0.006) * 3;

  ctx.save();
  ctx.translate(x, y + bob);

  ctx.fillStyle = '#38bdf8';
  ctx.strokeStyle = '#0c4a6e';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, 14); // tip points at the ground position
  ctx.lineTo(-9, -6);
  ctx.lineTo(0, -1);
  ctx.lineTo(9, -6);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // Ring marking the exact spot the order will land on.
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.8)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(x, y + 18, 13, 5, 0, 0, Math.PI * 2);
  ctx.stroke();
}
