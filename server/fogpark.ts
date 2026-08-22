/**
 * Does the visibility polygon still tell the truth in the park?
 *
 * Headless — no socket, no port, so it leaves a game on 8080 alone. It builds
 * real cities, stands a dog on the park path and in the thicket, and compares
 * the polygon `drawFog` would actually fill against a brute-force cast over
 * **every** occluder inside the clip.
 *
 * The comparison is per-bearing rather than by eye, because the fault being
 * looked for is not "the fog is missing" — it is "the fog is in the wrong
 * place", and a screenshot cannot tell those apart. Two figures come out of
 * it: ground lit that should be dark (light leaking past an occluder that was
 * dropped), and ground dark that should be lit (a shadow cast by nothing).
 *
 *   npx tsx fogpark.ts
 */
import { generateMap } from './src/mapgen.js';
import { visibilityPolygon } from '../client/src/fog.js';
import {
  VIEWPORT_WIDTH,
  VIEWPORT_HEIGHT,
  DOG_SIGHT_RADIUS,
  DOG_CAMERA_ZOOM,
  DOG_CAMERA_PAN_Y,
  CAMERA_PAN_X,
  FOG_MOVE_EPSILON,
} from '../shared/constants.js';
import type { Bush, Wall, MapData } from '../shared/types.js';

/** `fogRadius` for a dog, replicated exactly — sampled corners, not bounded. */
function dogFogRadius(): number {
  const reach = { x: CAMERA_PAN_X, y: DOG_CAMERA_PAN_Y };
  const zoom = DOG_CAMERA_ZOOM;
  let worst = 0;
  for (let i = 0; i <= 8; i++) {
    const a = (i / 8) * (Math.PI / 2);
    const d = Math.hypot(
      VIEWPORT_WIDTH / (2 * zoom) + Math.cos(a) * reach.x,
      VIEWPORT_HEIGHT / (2 * zoom) + Math.sin(a) * reach.y,
    );
    if (d > worst) worst = d;
  }
  return Math.max(DOG_SIGHT_RADIUS, Math.round(worst) + 24);
}

/** The occluder clip `visibilityFor` builds, for a dog. */
function dogClip(): { w: number; h: number } {
  const slack = FOG_MOVE_EPSILON + 40;
  return {
    w: VIEWPORT_WIDTH / (2 * DOG_CAMERA_ZOOM) + CAMERA_PAN_X + slack,
    h: VIEWPORT_HEIGHT / (2 * DOG_CAMERA_ZOOM) + DOG_CAMERA_PAN_Y + slack,
  };
}

// Same maths as fog.ts. Copied rather than exported because what is under test
// is which occluders the polygon *keeps*, not how a ray meets one.
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

/** What a ray *should* stop at, with nothing dropped. */
function truthAt(
  px: number,
  py: number,
  angle: number,
  radius: number,
  walls: Wall[],
  bushes: Bush[],
): number {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  let best = radius;
  for (const w of walls) {
    const t = rayRect(px, py, dx, dy, w);
    if (t < best) best = t;
  }
  for (const b of bushes) {
    const t = rayCircle(px, py, dx, dy, b);
    if (t < best) best = t;
  }
  return best;
}

interface Poly {
  x: number;
  y: number;
  angle: number;
  atRadius: boolean;
}

function chordRadius(ra: number, aAngle: number, rb: number, bAngle: number, angle: number): number {
  const d = bAngle - aAngle;
  if (Math.abs(d) < 1e-9) return Math.min(ra, rb);
  const den = ra * Math.sin(angle - aAngle) + rb * Math.sin(bAngle - angle);
  if (Math.abs(den) < 1e-9) return Math.min(ra, rb);
  return (ra * rb * Math.sin(d)) / den;
}

/**
 * How far the *filled path* reaches at a bearing.
 *
 * The polygon as `drawFog` actually lays it down, arcs included — a pair of
 * unobstructed neighbours is stitched with a true arc of the sight circle
 * under exactly the conditions in that function, and everything else is a
 * straight chord. Reading the vertices alone would understate the lit area
 * wherever an arc was drawn.
 */
function polyRadiusAt(poly: Poly[], px: number, py: number, angle: number, radius: number): number {
  const n = poly.length;
  const rOf = (p: Poly) => Math.hypot(p.x - px, p.y - py);
  if (angle < poly[0].angle || angle >= poly[n - 1].angle) {
    const a = poly[n - 1];
    const b = poly[0];
    const wrap = b.angle + Math.PI * 2 - a.angle;
    if (a.atRadius && b.atRadius && wrap > 0 && wrap < Math.PI / 2) return radius;
    const t = angle < poly[0].angle ? angle + Math.PI * 2 : angle;
    return chordRadius(rOf(a), a.angle, rOf(b), b.angle + Math.PI * 2, t);
  }
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (poly[mid].angle <= angle) lo = mid;
    else hi = mid;
  }
  const a = poly[lo];
  const b = poly[hi];
  const delta = b.angle - a.angle;
  if (a.atRadius && b.atRadius && delta > 0 && delta < Math.PI / 2) return radius;
  return chordRadius(rOf(a), a.angle, rOf(b), b.angle, angle);
}

/** Somewhere on the park's dirt path — where the screenshot was taken. */
function pointOnPath(map: MapData): { x: number; y: number } {
  const p = map.park.path;
  const i = Math.max(1, Math.floor(p.length / 2));
  return { x: (p[i - 1].x + p[i].x) / 2, y: (p[i - 1].y + p[i].y) / 2 };
}

/** The thickest spot in the park: whichever sample has the most foliage on it. */
function deepestThicket(map: MapData): { x: number; y: number } {
  const park = map.park;
  let best = { x: park.x + park.w / 2, y: park.y + park.h / 2 };
  let bestN = -1;
  for (let i = 0; i < 900; i++) {
    const x = park.x + (((i * 37) % 101) / 100) * park.w;
    const y = park.y + (((i * 61) % 103) / 100) * park.h;
    let n = 0;
    let inside = false;
    for (const b of map.bushes) {
      const d = Math.hypot(b.x - x, b.y - y);
      if (d <= b.r) inside = true;
      if (d < 300) n++;
    }
    if (inside) continue;
    if (n > bestN) {
      bestN = n;
      best = { x, y };
    }
  }
  return best;
}

function report(label: string, map: MapData, px: number, py: number): void {
  const radius = dogFogRadius();
  const clip = dogClip();

  // The same clip and the same standing-in-it exemptions the polygon applies,
  // with nothing capped. This is the control.
  const walls = map.walls.filter(
    (w) =>
      !(px >= w.x && px <= w.x + w.w && py >= w.y && py <= w.y + w.h) &&
      w.x - clip.w <= px &&
      w.x + w.w + clip.w >= px &&
      w.y - clip.h <= py &&
      w.y + w.h + clip.h >= py,
  );
  const bushes = map.bushes.filter(
    (b) =>
      Math.hypot(b.x - px, b.y - py) > b.r &&
      Math.abs(b.x - px) <= clip.w + b.r &&
      Math.abs(b.y - py) <= clip.h + b.r,
  );

  const poly = visibilityPolygon(px, py, radius, map.walls, map.bushes, clip.w, clip.h, false, []);

  const N = 3600;
  const dTheta = (Math.PI * 2) / N;
  let leakArea = 0;
  let shadowArea = 0;
  let trueArea = 0;
  let polyArea = 0;
  let leakBearings = 0;
  let worstLeak = 0;
  let worstLeakAngle = 0;
  for (let i = 0; i < N; i++) {
    const a = -Math.PI + (i + 0.5) * dTheta;
    const t = truthAt(px, py, a, radius, walls, bushes);
    const p = polyRadiusAt(poly, px, py, a, radius);
    trueArea += (t * t * dTheta) / 2;
    polyArea += (p * p * dTheta) / 2;
    if (p > t + 1) {
      leakArea += ((p * p - t * t) * dTheta) / 2;
      leakBearings++;
      if (p - t > worstLeak) {
        worstLeak = p - t;
        worstLeakAngle = a;
      }
    } else if (p < t - 1) {
      shadowArea += ((t * t - p * p) * dTheta) / 2;
    }
  }

  const full = Math.PI * radius * radius;
  const pad = ' '.repeat(22);
  console.log(
    label.padEnd(22) +
      `bushes in clip ${String(bushes.length).padStart(3)} · walls ${String(walls.length).padStart(3)}` +
      ` · poly ${String(poly.length).padStart(4)} pts`,
  );
  console.log(
    pad +
      `lit ${((polyArea / full) * 100).toFixed(1)}% of circle · truth ${((trueArea / full) * 100).toFixed(1)}%`,
  );
  console.log(
    pad +
      `LEAK ${((leakArea / Math.max(1, trueArea)) * 100).toFixed(1)}% of true visible area, on ` +
      `${((leakBearings / N) * 100).toFixed(1)}% of bearings, worst ${worstLeak.toFixed(0)}px at ` +
      `${((worstLeakAngle * 180) / Math.PI).toFixed(0)}deg`,
  );
  console.log(pad + `over-shadow ${((shadowArea / Math.max(1, trueArea)) * 100).toFixed(1)}%`);
}

const SEEDS = [11111, 22222, 33333, 44444];
console.log(
  `dog fog radius ${dogFogRadius()} · clip ${dogClip().w.toFixed(0)}x${dogClip().h.toFixed(0)}\n`,
);
for (const seed of SEEDS) {
  const map = generateMap(seed);
  const park = map.park;
  const inPark = map.bushes.filter(
    (b) => b.x >= park.x && b.x <= park.x + park.w && b.y >= park.y && b.y <= park.y + park.h,
  ).length;
  console.log(
    `--- seed ${seed} · park ${Math.round(park.w)}x${Math.round(park.h)} with ${inPark} bushes, ` +
      `${map.bushes.length} in the city`,
  );
  const onPath = pointOnPath(map);
  report('  on the park path', map, onPath.x, onPath.y);
  const thicket = deepestThicket(map);
  report('  in the thicket', map, thicket.x, thicket.y);
  report('  a street (control)', map, map.width * 0.5, map.height * 0.08);
  console.log('');
}

/**
 * What the two roles cost, in one build, alternating.
 *
 * **The old behaviour is reproduced by pre-filtering the bush list**, not by a
 * second constant: with the silhouette cap applied inside, handing the function
 * only the nearest 22 bushes is exactly the code as it stood — those 22 both
 * occlude and are silhouetted, and nothing else exists. Handing it all of them
 * is the code as it stands now. Same process, same city, alternated, because
 * this box has measured the same code at 1.97 and 4.37ms minutes apart.
 */
function costs(): void {
  console.log('--- cost, one build, alternating (ms per polygon)');
  const radius = dogFogRadius();
  const clip = dogClip();
  const oldMs: number[] = [];
  const newMs: number[] = [];
  for (const seed of SEEDS) {
    const map = generateMap(seed);
    const at = deepestThicket(map);
    const near = map.bushes
      .filter((b) => Math.hypot(b.x - at.x, b.y - at.y) > b.r)
      .sort(
        (a, b) => Math.hypot(a.x - at.x, a.y - at.y) - Math.hypot(b.x - at.x, b.y - at.y),
      )
      .slice(0, 22);
    for (let i = 0; i < 60; i++) {
      let t = performance.now();
      visibilityPolygon(at.x, at.y, radius, map.walls, near, clip.w, clip.h, false, []);
      oldMs.push(performance.now() - t);
      t = performance.now();
      visibilityPolygon(at.x, at.y, radius, map.walls, map.bushes, clip.w, clip.h, false, []);
      newMs.push(performance.now() - t);
    }
  }
  const at = (a: number[], q: number) => a.slice().sort((x, y) => x - y)[Math.floor(a.length * q)];
  console.log(
    '  nearest 22 only (old)  median ' + at(oldMs, 0.5).toFixed(3) +
      'ms · p90 ' + at(oldMs, 0.9).toFixed(3) + 'ms',
  );
  console.log(
    '  all occlude (new)      median ' + at(newMs, 0.5).toFixed(3) +
      'ms · p90 ' + at(newMs, 0.9).toFixed(3) + 'ms',
  );
}
costs();

/**
 * The dearest viewer this game has, standing in the park: an officer down a
 * scope. `SCOPE_PUSH` pulls the clip out on both axes and the radius with it,
 * so both halves of the quadratic grow at once — if the silhouette cap is
 * affordable to drop anywhere, this is where it has to be shown.
 */
function scopeCost(): void {
  const zoom = 2.0;
  const reach = { x: 430 + 80, y: 430 + 194 };
  let worst = 0;
  for (let i = 0; i <= 8; i++) {
    const a = (i / 8) * (Math.PI / 2);
    worst = Math.max(
      worst,
      Math.hypot(
        VIEWPORT_WIDTH / (2 * zoom) + Math.cos(a) * reach.x,
        VIEWPORT_HEIGHT / (2 * zoom) + Math.sin(a) * reach.y,
      ),
    );
  }
  const radius = Math.max(1145, Math.round(worst) + 24);
  const slack = FOG_MOVE_EPSILON + 40;
  const cw = VIEWPORT_WIDTH / (2 * zoom) + reach.x + slack;
  const ch = VIEWPORT_HEIGHT / (2 * zoom) + reach.y + slack;
  console.log(`\n--- scoped officer in the park · radius ${radius} · clip ${cw.toFixed(0)}x${ch.toFixed(0)}`);
  const oldMs: number[] = [];
  const newMs: number[] = [];
  let pts = 0;
  let inClip = 0;
  for (const seed of SEEDS) {
    const map = generateMap(seed);
    const at = deepestThicket(map);
    const all = map.bushes.filter(
      (b) =>
        Math.hypot(b.x - at.x, b.y - at.y) > b.r &&
        Math.abs(b.x - at.x) <= cw + b.r &&
        Math.abs(b.y - at.y) <= ch + b.r,
    );
    inClip = Math.max(inClip, all.length);
    const near = all
      .slice()
      .sort(
        (a, b) => Math.hypot(a.x - at.x, a.y - at.y) - Math.hypot(b.x - at.x, b.y - at.y),
      )
      .slice(0, 22);
    for (let i = 0; i < 40; i++) {
      let t = performance.now();
      visibilityPolygon(at.x, at.y, radius, map.walls, near, cw, ch, false, []);
      oldMs.push(performance.now() - t);
      t = performance.now();
      const p = visibilityPolygon(at.x, at.y, radius, map.walls, map.bushes, cw, ch, false, []);
      newMs.push(performance.now() - t);
      pts = Math.max(pts, p.length);
    }
  }
  const q = (a: number[], f: number) => a.slice().sort((x, y) => x - y)[Math.floor(a.length * f)];
  console.log(`  up to ${inClip} bushes in the clip · worst polygon ${pts} points`);
  console.log(
    '  nearest 22 only (old)  median ' + q(oldMs, 0.5).toFixed(3) + 'ms · p90 ' +
      q(oldMs, 0.9).toFixed(3) + 'ms · worst ' + q(oldMs, 0.999).toFixed(3) + 'ms',
  );
  console.log(
    '  no cap at all (new)    median ' + q(newMs, 0.5).toFixed(3) + 'ms · p90 ' +
      q(newMs, 0.9).toFixed(3) + 'ms · worst ' + q(newMs, 0.999).toFixed(3) + 'ms',
  );
}
scopeCost();
