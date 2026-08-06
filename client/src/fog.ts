import type { Bush, Wall } from '../../shared/types.js';

export interface Point {
  x: number;
  y: number;
  /** Bearing from the viewer, so the renderer can stitch arcs. */
  angle: number;
  /** True when the ray hit nothing and stopped at the sight radius. */
  atRadius: boolean;
}

/** Distance along a ray to a rect, or Infinity. Slab method. */
function rayRect(ox: number, oy: number, dx: number, dy: number, r: Wall): number {
  let tmin = 0;
  let tmax = Infinity;

  if (Math.abs(dx) < 1e-9) {
    if (ox < r.x || ox > r.x + r.w) return Infinity;
  } else {
    let t1 = (r.x - ox) / dx;
    let t2 = (r.x + r.w - ox) / dx;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
  }

  if (Math.abs(dy) < 1e-9) {
    if (oy < r.y || oy > r.y + r.h) return Infinity;
  } else {
    let t1 = (r.y - oy) / dy;
    let t2 = (r.y + r.h - oy) / dy;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
  }

  return tmax >= tmin && tmax >= 0 ? Math.max(tmin, 0) : Infinity;
}

/**
 * Distance along a ray to the *far* side of a bush. Using the far hit rather
 * than the near one means the bush itself stays lit — it only shadows what
 * lies beyond it.
 */
function rayCircle(ox: number, oy: number, dx: number, dy: number, c: Bush): number {
  const fx = ox - c.x;
  const fy = oy - c.y;
  const b = fx * dx + fy * dy;
  const cc = fx * fx + fy * fy - c.r * c.r;
  const disc = b * b - cc;
  if (disc < 0) return Infinity;
  const t2 = -b + Math.sqrt(disc);
  return t2 >= 0 ? t2 : Infinity;
}

const EPS = 0.0006;
/** Baseline fan so open ground still reaches the sight radius between corners. */
const BASE_RAYS = 120;

/**
 * Visibility polygon around the viewer. Rays are cast at the silhouette edges
 * of every occluder — rect corners for walls, tangent points for bushes — plus
 * a coarse fan so open ground reaches the sight radius. Anything inside or
 * behind an occluder falls outside the returned polygon.
 */
export function visibilityPolygon(
  px: number,
  py: number,
  radius: number,
  walls: Wall[],
  bushes: Bush[],
): Point[] {
  const nearWalls: Wall[] = [];
  for (const w of walls) {
    if (
      w.x - radius <= px &&
      w.x + w.w + radius >= px &&
      w.y - radius <= py &&
      w.y + w.h + radius >= py
    ) {
      nearWalls.push(w);
    }
  }

  // A bush you're standing in doesn't blind you — you see out, others can't see in.
  const nearBushes: Bush[] = [];
  for (const b of bushes) {
    const d = Math.hypot(b.x - px, b.y - py);
    if (d <= b.r) continue;
    if (d <= radius + b.r) nearBushes.push(b);
  }

  // Every other ray angle comes from Math.atan2, so the base fan must live in
  // the same [-PI, PI] range. Generating it over [0, 2PI) instead leaves the
  // sorted list doubling back on itself, and the resulting self-overlapping
  // path fills incorrectly — which is what let sight leak into buildings.
  const angles: number[] = [];
  for (let i = 0; i < BASE_RAYS; i++) {
    angles.push(-Math.PI + (i / BASE_RAYS) * Math.PI * 2);
  }

  for (const w of nearWalls) {
    const corners = [
      [w.x, w.y],
      [w.x + w.w, w.y],
      [w.x, w.y + w.h],
      [w.x + w.w, w.y + w.h],
    ];
    for (const [cx, cy] of corners) {
      const a = Math.atan2(cy - py, cx - px);
      angles.push(a - EPS, a, a + EPS);
    }
  }

  for (const b of nearBushes) {
    const d = Math.hypot(b.x - px, b.y - py);
    const base = Math.atan2(b.y - py, b.x - px);
    const spread = Math.asin(Math.min(1, b.r / d));
    angles.push(base - spread - EPS, base - spread, base + spread, base + spread + EPS);
  }

  angles.sort((a, b) => a - b);

  const points: Point[] = [];
  for (const angle of angles) {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);

    let best = radius;
    for (const w of nearWalls) {
      const t = rayRect(px, py, dx, dy, w);
      if (t < best) best = t;
    }
    for (const b of nearBushes) {
      const t = rayCircle(px, py, dx, dy, b);
      if (t < best) best = t;
    }
    points.push({
      x: px + dx * best,
      y: py + dy * best,
      angle,
      // Unobstructed rays get stitched with a true arc instead of a chord,
      // which is what removes the faceted look in open ground.
      atRadius: best >= radius - 0.5,
    });
  }
  return points;
}
