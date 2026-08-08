import type { Pond } from './types.js';

/**
 * The pond's edge as a function of bearing, rather than a polygon.
 *
 * A few summed harmonics give a roundish but plainly hand-drawn outline, and
 * keep every question about the shape to one cheap evaluation: whether a point
 * is in the water is `dist < radiusAt(angle)`, and pushing something out of it
 * is a slide along the same ray. A polygon would need edge tests for both.
 */
export function pondRadiusAt(pond: Pond, angle: number): number {
  let scale = 1;
  for (const w of pond.wobble) scale += w.amp * Math.sin(w.freq * angle + w.phase);
  return pond.r * scale;
}

/** True when this point is in the water. */
export function inPond(pond: Pond, x: number, y: number): boolean {
  const dx = x - pond.x;
  const dy = y - pond.y;
  const dist = Math.hypot(dx, dy);
  // Cheap rejection before the harmonics: nothing beyond the widest possible
  // edge can be inside, and the wobble is bounded by construction.
  if (dist > pond.r * 1.5) return false;
  return dist < pondRadiusAt(pond, Math.atan2(dy, dx));
}
