import type { Wall } from '../../shared/types.js';

export interface Circle {
  x: number;
  y: number;
  radius: number;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Shortest signed angular difference from `a` to `b`, in (-PI, PI]. */
export function angleDelta(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Rotate `from` toward `to`, moving at most `maxStep` radians. */
export function turnToward(from: number, to: number, maxStep: number): number {
  const d = angleDelta(from, to);
  if (Math.abs(d) <= maxStep) return to;
  return from + Math.sign(d) * maxStep;
}

/** Push a circle out of an axis-aligned rect. Mutates the circle. */
export function resolveCircleRect(c: Circle, r: Wall): boolean {
  const nearestX = clamp(c.x, r.x, r.x + r.w);
  const nearestY = clamp(c.y, r.y, r.y + r.h);
  const dx = c.x - nearestX;
  const dy = c.y - nearestY;
  const distSq = dx * dx + dy * dy;

  if (distSq > c.radius * c.radius) return false;

  if (distSq > 1e-9) {
    const dist = Math.sqrt(distSq);
    const push = c.radius - dist;
    c.x += (dx / dist) * push;
    c.y += (dy / dist) * push;
    return true;
  }

  // Center is inside the rect — eject along the shallowest face.
  const left = c.x - r.x;
  const right = r.x + r.w - c.x;
  const top = c.y - r.y;
  const bottom = r.y + r.h - c.y;
  const min = Math.min(left, right, top, bottom);
  if (min === left) c.x = r.x - c.radius;
  else if (min === right) c.x = r.x + r.w + c.radius;
  else if (min === top) c.y = r.y - c.radius;
  else c.y = r.y + r.h + c.radius;
  return true;
}

/**
 * A box that isn't axis-aligned: centre, half-extents, and a rotation. The
 * sandbag needs one because it is laid across whatever way an officer happened
 * to be facing, and snapping it to the four compass points would leave it
 * visibly askew from the gun behind it.
 */
export interface OrientedBox {
  x: number;
  y: number;
  /** Half-width across the face, half-depth through it. */
  hw: number;
  hh: number;
  angle: number;
}

/**
 * How near a point comes to a segment.
 *
 * "Is that thing in the way" is a question about the whole walk, not about
 * where it ends — the same reason `escapeDestination` scores its midpoint.
 */
export function pointToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  const t = lenSq > 0 ? clamp(((px - x1) * dx + (py - y1) * dy) / lenSq, 0, 1) : 0;
  return Math.hypot(px - (x1 + dx * t), py - (y1 + dy * t));
}

/** Distance from a point to the box, and the nearest point on it. */
export function closestOnBox(
  box: OrientedBox,
  px: number,
  py: number,
): { x: number; y: number; dist: number } {
  const cos = Math.cos(box.angle);
  const sin = Math.sin(box.angle);
  // Into the box's own frame, where it is an ordinary rect about the origin.
  const dx = px - box.x;
  const dy = py - box.y;
  const lx = dx * cos + dy * sin;
  const ly = -dx * sin + dy * cos;

  const cx = clamp(lx, -box.hw, box.hw);
  const cy = clamp(ly, -box.hh, box.hh);
  // And back out again.
  const wx = box.x + cx * cos - cy * sin;
  const wy = box.y + cx * sin + cy * cos;
  return { x: wx, y: wy, dist: Math.hypot(px - wx, py - wy) };
}

/**
 * Does this segment cross the box?
 *
 * Both ends into the box's own frame, where it is an ordinary rect about the
 * origin and `segmentRectT` answers it — rather than a second implementation
 * of segment-rect clipping that would have to be kept in step with the first.
 */
export function segmentHitsBox(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  box: OrientedBox,
): boolean {
  const cos = Math.cos(box.angle);
  const sin = Math.sin(box.angle);
  const ax = x1 - box.x;
  const ay = y1 - box.y;
  const bx = x2 - box.x;
  const by = y2 - box.y;
  return (
    segmentRectT(
      ax * cos + ay * sin,
      -ax * sin + ay * cos,
      bx * cos + by * sin,
      -bx * sin + by * cos,
      { x: -box.hw, y: -box.hh, w: box.hw * 2, h: box.hh * 2 },
    ) !== null
  );
}

/** Push a circle out of an oriented box. Mutates the circle. */
export function resolveCircleBox(c: Circle, box: OrientedBox): boolean {
  const cos = Math.cos(box.angle);
  const sin = Math.sin(box.angle);
  const dx = c.x - box.x;
  const dy = c.y - box.y;
  const lx = dx * cos + dy * sin;
  const ly = -dx * sin + dy * cos;

  const nx = clamp(lx, -box.hw, box.hw);
  const ny = clamp(ly, -box.hh, box.hh);
  const ox = lx - nx;
  const oy = ly - ny;
  const distSq = ox * ox + oy * oy;

  let pushX: number;
  let pushY: number;
  if (distSq > 1e-9) {
    if (distSq > c.radius * c.radius) return false;
    const dist = Math.sqrt(distSq);
    const push = c.radius - dist;
    pushX = (ox / dist) * push;
    pushY = (oy / dist) * push;
  } else {
    // Centre is inside: out through the shallowest face, as with a plain rect.
    const left = lx + box.hw;
    const right = box.hw - lx;
    const top = ly + box.hh;
    const bottom = box.hh - ly;
    const min = Math.min(left, right, top, bottom);
    if (min === left) {
      pushX = -(left + c.radius);
      pushY = 0;
    } else if (min === right) {
      pushX = right + c.radius;
      pushY = 0;
    } else if (min === top) {
      pushX = 0;
      pushY = -(top + c.radius);
    } else {
      pushX = 0;
      pushY = bottom + c.radius;
    }
  }

  c.x += pushX * cos - pushY * sin;
  c.y += pushX * sin + pushY * cos;
  return true;
}

/**
 * Liang-Barsky clip of a segment against a rect. Returns the entry parameter
 * t in [0,1] along the segment, or null when the segment misses entirely.
 */
export function segmentRectT(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  r: Wall,
): number | null {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const p = [-dx, dx, -dy, dy];
  const q = [x1 - r.x, r.x + r.w - x1, y1 - r.y, r.y + r.h - y1];

  let t0 = 0;
  let t1 = 1;

  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return null; // parallel and outside this slab
      continue;
    }
    const t = q[i] / p[i];
    if (p[i] < 0) {
      if (t > t1) return null;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return null;
      if (t < t1) t1 = t;
    }
  }
  return t0;
}

/** Nearest intersection of a segment with a circle, as a t in [0,1]. */
export function segmentCircleT(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  cx: number,
  cy: number,
  radius: number,
): number | null {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const fx = x1 - cx;
  const fy = y1 - cy;

  const a = dx * dx + dy * dy;
  if (a < 1e-9) return null;
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - radius * radius;

  let disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  disc = Math.sqrt(disc);

  const tA = (-b - disc) / (2 * a);
  if (tA >= 0 && tA <= 1) return tA;
  const tB = (-b + disc) / (2 * a);
  if (tB >= 0 && tB <= 1) return tB;
  return null;
}
