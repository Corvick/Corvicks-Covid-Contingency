import {
  ACID_LOBE_CORE,
  ACID_LOBE_COUNT,
  ACID_LOBE_DIST_MIN,
  ACID_LOBE_DIST_SPAN,
  ACID_LOBE_JITTER,
  ACID_LOBE_R_MIN,
  ACID_LOBE_R_SPAN,
} from './constants.js';
import type { Bush } from './types.js';

/**
 * The shape of an acid cloud: a cluster of overlapping circles, not one disc.
 *
 * **A lobe is a `Bush`, and that is the whole reason this is affordable.** A
 * cloud used to be a single circle precisely because a circle is the shape
 * `Bush` already has — it drops into `hasLineOfSight` beside the foliage on the
 * server and into `visibilityPolygon` on the client with no new occluder kind
 * on either side. Making it lumpy therefore has exactly one honest form: *more
 * circles*. Everything that already knew how to occlude, slow and draw one goes
 * on working, and the silhouette gains bulges and notches that a disc cannot
 * have.
 *
 * **It is derived from a seed rather than sent as geometry**, the way the
 * park's lamp posts come off the path polyline and the dog's saliva comes off
 * its id. Three separate places need the identical shape — the server's sight
 * lines and slow, the client's fog polygon, and the client's drawing — and the
 * drawn rim has to sit exactly where the occluder edge does or there is a ring
 * of ground you can neither see through nor see anything in. A shared pure
 * function is the only arrangement in which those three cannot drift apart.
 *
 * **No lobe reaches past `r`.** That radius is what the wire carries, what the
 * fog cache keys on and what every cheap rejection test in front of this uses,
 * so a lobe bulging beyond it would occlude ground the rest of the code has
 * already decided is outside the cloud. The clamp is on the lobe's own radius,
 * which is what leaves the silhouette short of `r` in places — the notches —
 * rather than pulling it in everywhere.
 */

/** The same sin-fract hash the grime tile and the dog's saliva use. */
function hash(seed: number, salt: number): number {
  const v = Math.sin(seed * 127.1 + salt * 311.7) * 43758.5453;
  return v - Math.floor(v);
}

/**
 * The lobes of one cloud, in world coordinates.
 *
 * `out` is reused when given: the server recomputes these once a tick for every
 * live cloud and `hasLineOfSight` is the hottest predicate it has, so the
 * ordinary case must not allocate. Same reasoning as `AcidCloud.r`.
 */
export function acidLobes(
  seed: number,
  cx: number,
  cy: number,
  r: number,
  out: Bush[] = [],
): Bush[] {
  while (out.length < ACID_LOBE_COUNT) out.push({ x: 0, y: 0, r: 0 });
  out.length = ACID_LOBE_COUNT;

  // The body of it, on the landing point. Everything else hangs off this, which
  // is what keeps the cluster one cloud rather than a ring of puffs.
  out[0].x = cx;
  out[0].y = cy;
  out[0].r = r * ACID_LOBE_CORE;

  const petals = ACID_LOBE_COUNT - 1;
  for (let i = 1; i <= petals; i++) {
    // Evenly spaced and then knocked off it. Left even, the notches between
    // them are evenly spaced too, and a regular scallop reads as a flower —
    // the same mistake the dog's ribs and the park's bushes each had to unlearn.
    const a = ((i - 1) / petals) * Math.PI * 2 + (hash(seed, i) - 0.5) * ACID_LOBE_JITTER;
    const d = r * (ACID_LOBE_DIST_MIN + hash(seed, i + 40) * ACID_LOBE_DIST_SPAN);
    const rr = Math.min(r * (ACID_LOBE_R_MIN + hash(seed, i + 80) * ACID_LOBE_R_SPAN), r - d);
    out[i].x = cx + Math.cos(a) * d;
    out[i].y = cy + Math.sin(a) * d;
    out[i].r = rr;
  }
  return out;
}

/** True when this spot is inside the cloud — inside any one of its lobes. */
export function inAcidLobes(lobes: Bush[], x: number, y: number): boolean {
  for (const l of lobes) {
    if (Math.hypot(x - l.x, y - l.y) <= l.r) return true;
  }
  return false;
}
