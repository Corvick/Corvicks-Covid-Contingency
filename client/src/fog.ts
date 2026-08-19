import type { Bush, Wall } from '../../shared/types.js';

export interface Point {
  x: number;
  y: number;
  /** Bearing from the viewer, so the renderer can stitch arcs. */
  angle: number;
  /** True when the ray hit nothing and stopped at the sight radius. */
  atRadius: boolean;
}

/**
 * Straight-line distance from a point to the nearest edge of a rect, 0 inside.
 *
 * A lower bound on any ray hit: no ray from this point can strike this rect
 * nearer than this. That is what lets the ray loop stop early — see the note
 * beside `wallOrder`.
 */
function rectDistance(px: number, py: number, r: Wall): number {
  const dx = Math.max(r.x - px, 0, px - (r.x + r.w));
  const dy = Math.max(r.y - py, 0, py - (r.y + r.h));
  return Math.hypot(dx, dy);
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
/**
 * Wrap into the same [-PI, PI] range `atan2` returns.
 *
 * The base fan is generated in that range deliberately, but the angles derived
 * from it were not: a corner at `a + EPS` where `a` is just under PI, or a
 * bush tangent at `base + spread`, both land outside it. Sorted, those sit past
 * the ends of the list, and the arc that closes the polygon then sweeps nearly
 * the whole circle the wrong way round — which fills almost everything and
 * reads on screen as the fog switching off. This is the fog dead spot.
 */
/** Bushes that get tangent rays cast at them. The park has far more. */
const MAX_BUSH_OCCLUDERS = 22;

function norm(a: number): number {
  const twoPi = Math.PI * 2;
  let x = (a + Math.PI) % twoPi;
  if (x < 0) x += twoPi;
  return x - Math.PI;
}

export function visibilityPolygon(
  px: number,
  py: number,
  radius: number,
  walls: Wall[],
  bushes: Bush[],
  /**
   * Half-extents of the box that will actually be *drawn* — the viewport, in
   * other words — defaulting to the sight circle, which is what the caller
   * used to get.
   *
   * An occluder wholly outside this box cannot change anything inside it, and
   * that is exact rather than approximate: the box is convex and the viewer is
   * in it, so a ray that leaves it never comes back. Every point in such an
   * occluder's shadow therefore lies outside the box too. Culling on it is
   * what pays for the scope's much wider radius — cost here is roughly the
   * square of the occluder count, since each wall contributes rays *and* is
   * tested by every other wall's rays, so a third fewer walls is half the
   * work.
   */
  clipW = radius,
  clipH = radius,
): Point[] {
  const nearWalls: Wall[] = [];
  for (const w of walls) {
    // A wall you are standing *in* doesn't blind you — the same rule the
    // bushes below already follow, and it was never applied to rects.
    //
    // `rayRect` clamps its near hit to zero for an origin inside the rect, so
    // every ray in every direction comes back at distance 0, the polygon
    // collapses onto the viewer, and the fog is left with no hole at all. The
    // fill is 0.92 rather than opaque, so what is on screen is the whole world
    // at 8% — ground and the faint ghosts of buildings, no walls, no bodies.
    // That is the "everything but the floor and some fog stops rendering" case.
    //
    // Inclusive of the edge, because a centre landing exactly on the boundary
    // collapses it in precisely the same way, and collision permits that.
    if (px >= w.x && px <= w.x + w.w && py >= w.y && py <= w.y + w.h) continue;
    if (
      w.x - clipW <= px &&
      w.x + w.w + clipW >= px &&
      w.y - clipH <= py &&
      w.y + w.h + clipH >= py
    ) {
      nearWalls.push(w);
    }
  }

  // A bush you're standing in doesn't blind you — you see out, others can't see in.
  //
  // Capped to the nearest few. The park is a dense thicket, and every bush
  // costs four rays that are then each tested against every other occluder —
  // standing in it put the ray count into the thousands, which is what made
  // moving through the trees stutter. The ones nearest you shape the
  // silhouette; distant ones inside a thicket are behind those anyway.
  const nearBushes: Bush[] = [];
  for (const b of bushes) {
    const d = Math.hypot(b.x - px, b.y - py);
    if (d <= b.r) continue;
    if (Math.abs(b.x - px) <= clipW + b.r && Math.abs(b.y - py) <= clipH + b.r) nearBushes.push(b);
  }
  if (nearBushes.length > MAX_BUSH_OCCLUDERS) {
    nearBushes.sort(
      (a, b) => Math.hypot(a.x - px, a.y - py) - Math.hypot(b.x - px, b.y - py),
    );
    nearBushes.length = MAX_BUSH_OCCLUDERS;
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
      angles.push(norm(a - EPS), a, norm(a + EPS));
    }
  }

  for (const b of nearBushes) {
    const d = Math.hypot(b.x - px, b.y - py);
    const base = Math.atan2(b.y - py, b.x - px);
    const spread = Math.asin(Math.min(1, b.r / d));
    angles.push(
      norm(base - spread - EPS),
      norm(base - spread),
      norm(base + spread),
      norm(base + spread + EPS),
    );
  }

  angles.sort((a, b) => a - b);

  /**
   * **Nearest first, so a ray can stop looking.**
   *
   * Every wall contributes twelve rays and every ray was then tested against
   * every wall, which is the square in "cost is roughly the square of the
   * occluder count" — a hundred walls is a hundred and twenty thousand
   * ray-rect tests, and that is the 20ms+ tail that blows a frame outright.
   *
   * A wall cannot be hit nearer than its own closest point. So with the walls
   * ordered by that distance, the moment one is further off than the best hit
   * so far, every wall after it is too and the loop is finished. It is exact —
   * the same polygon, and usually after testing a handful of the nearest few,
   * because in a city the first thing a ray meets is close.
   */
  const wallOrder = nearWalls
    .map((w) => ({ w, d: rectDistance(px, py, w) }))
    .sort((a, b) => a.d - b.d);
  const bushOrder = nearBushes
    .map((b) => ({ b, d: Math.hypot(b.x - px, b.y - py) - b.r }))
    .sort((a, b) => a.d - b.d);

  const points: Point[] = [];
  for (const angle of angles) {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);

    let best = radius;
    for (let i = 0; i < wallOrder.length; i++) {
      if (wallOrder[i].d >= best) break;
      const t = rayRect(px, py, dx, dy, wallOrder[i].w);
      if (t < best) best = t;
    }
    for (let i = 0; i < bushOrder.length; i++) {
      if (bushOrder[i].d >= best) break;
      const t = rayCircle(px, py, dx, dy, bushOrder[i].b);
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
