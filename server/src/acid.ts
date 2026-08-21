import type { AcidState, SpitState } from '../../shared/types.js';
import {
  ACID_BLIND_LINE,
  ACID_BLIND_LINE_CHANCE,
  ACID_BLIND_MS,
  ACID_CLOUD_MS,
  ACID_CLOUD_RADIUS,
  ACID_FADE_FROM,
  ACID_GROW_MS,
  ACID_IMPACT_RADIUS,
  DOG_SPIT_MIN_THROW,
  DOG_SPIT_RANGE,
  DOG_SPIT_TRAVEL_MS,
} from '../../shared/constants.js';
import { clamp } from './geometry.js';
import type { Entity, World } from './world.js';

/**
 * The dog's acid, in two parts: a gobbet in the air and the cloud it leaves.
 *
 * Everything here is deliberately shaped like something that already exists.
 * The cloud is a **circle with a radius**, which is exactly the shape `Bush`
 * has, so it drops into `hasLineOfSight` and into the client's
 * `visibilityPolygon` beside the foliage with no new kind of occluder on either
 * side of the wire. The slow rides `speedAt`, the one function every mover in
 * the game already goes through. The flight is `sprayFlame`'s trick — work out
 * where it lands on the tick the key went down, then wait for it to get there.
 *
 * What is genuinely new is only the blinding, and even that is a map of
 * deadlines keyed by id, the same as `world.stunned`.
 *
 * **Nothing in this module imports `world.ts` at runtime**, only its types.
 * `heli.ts` keeps its own id counter for the same reason and it is worth
 * keeping: the world holds acid clouds as plain data, so `hasLineOfSight` can
 * read them without a cycle between the two files.
 */

let counter = 0;
const nextId = (prefix: string) => `${prefix}-${counter++}`;

/** A gobbet in the air, on its way to a spot already chosen. */
export interface AcidSpit {
  id: string;
  fromX: number;
  fromY: number;
  /** Where it will land. Decided at launch against the geometry as it stood. */
  x: number;
  y: number;
  firedAt: number;
  /** Who spat it, so the splash can never catch its own dog. */
  ownerId: string;
}

/** A cloud on the ground, eating the air. */
export interface AcidCloud {
  id: string;
  x: number;
  y: number;
  startedAt: number;
  /**
   * The radius **as of this tick**, recomputed once in `updateAcid` rather than
   * derived per reader.
   *
   * `hasLineOfSight` is the hottest predicate in the server and takes no clock
   * at all; handing it a growth curve to evaluate would mean either threading
   * `now` through every one of its callers or letting it read a stale one. A
   * number written once a tick is neither, and `speedAt` — which also takes no
   * clock — gets it for free.
   */
  r: number;
}

/**
 * Spit. Called from the ability handler, which has already decided this dog is
 * allowed to.
 *
 * **It lands where the crosshair is**, clamped to the throw — the same rule the
 * flamethrower needed and for the same reason: a direction with no distance
 * puts every cloud at maximum range, and aiming at something close then drops
 * it well behind them.
 */
export function spitAcid(world: World, dog: Entity, aimX: number, aimY: number, now: number): void {
  const dx = aimX - dog.x;
  const dy = aimY - dog.y;
  const dist = clamp(Math.hypot(dx, dy), DOG_SPIT_MIN_THROW, DOG_SPIT_RANGE);
  const angle = Math.atan2(dy, dx);
  const id = nextId('spit');
  world.spits.set(id, {
    id,
    fromX: dog.x,
    fromY: dog.y,
    x: dog.x + Math.cos(angle) * dist,
    y: dog.y + Math.sin(angle) * dist,
    firedAt: now,
    ownerId: dog.id,
  });
}

/**
 * Gobbets landing, and clouds boiling out and thinning away.
 *
 * The slow is not here: it is in `speedAt`, which everything that moves already
 * calls with its own position. Written as a sweep over bodies instead, it would
 * have to be a *second* place that knows what an acid cloud is, and the first
 * mover added afterwards that did not get a line in it would quietly walk
 * through the stuff at full speed.
 */
export function updateAcid(world: World, now: number): void {
  for (const [key, s] of world.spits) {
    if (now - s.firedAt < DOG_SPIT_TRAVEL_MS) continue;
    world.spits.delete(key);
    land(world, s, now);
  }

  for (const [key, c] of world.acid) {
    const age = now - c.startedAt;
    if (age > ACID_CLOUD_MS) {
      world.acid.delete(key);
      continue;
    }
    // Boils out fast and then holds. Written once a tick rather than read per
    // caller — see the note on `AcidCloud.r`.
    c.r = ACID_CLOUD_RADIUS * clamp(0.3 + (age / ACID_GROW_MS) * 0.7, 0.3, 1);
  }

  // A blinding that has run out is dropped rather than left to be compared
  // against a clock by everybody who asks — the map is what `updateAi` checks
  // per entity, so it should hold only people who currently cannot see.
  for (const [id, until] of world.blinded) {
    if (now >= until || !world.entities.has(id)) world.blinded.delete(id);
  }
}

/**
 * A gobbet arriving.
 *
 * **The impact and the cloud are two different events on the same tick**, and
 * that split is the whole design of the ability. The cloud is an area everybody
 * has to work around for the next few seconds; the impact is a single wet
 * moment that catches whoever happened to be standing exactly there, and it is
 * the only part that takes somebody out of the fight.
 */
function land(world: World, s: AcidSpit, now: number): void {
  const id = nextId('acid');
  world.acid.set(id, {
    id,
    x: s.x,
    y: s.y,
    startedAt: now,
    r: ACID_CLOUD_RADIUS * 0.3,
  });

  for (const e of world.entities.values()) {
    if (!canBeBlinded(world, e) || e.id === s.ownerId) continue;
    if (Math.hypot(e.x - s.x, e.y - s.y) > ACID_IMPACT_RADIUS) continue;
    world.blinded.set(e.id, now + ACID_BLIND_MS);
    // Rarely, out loud. Rolled once here — at the moment that would test it —
    // rather than per tick while they are blind: a chance re-rolled thirty
    // times a second is not rare, it is certain, which this file is far from
    // the first thing here to have to say.
    if (Math.random() < ACID_BLIND_LINE_CHANCE && !world.speech.has(e.id)) {
      world.speech.set(e.id, { text: ACID_BLIND_LINE, until: now + ACID_BLIND_MS });
    }
  }
}

/**
 * Who the splash can take out of the fight.
 *
 * **Not zombies**, because the acid comes out of one and a weapon that stops
 * your own horde is a weapon with a cost nobody would pay. **Not players**,
 * because "looks around but does not move" is a description of an AI, and the
 * honest translation of it for somebody holding a mouse is having the controls
 * taken away — which is what a mine already does, and what the dog's own
 * stagger was deliberately softened to avoid being. Somebody in the splash who
 * is being driven gets the cloud's slow like everybody else and keeps their
 * legs.
 */
function canBeBlinded(world: World, e: Entity): boolean {
  if (e.type === 'zombie') return false;
  return !world.playerIds.has(e.id);
}

export function acidToWire(world: World, now: number): AcidState[] {
  const out: AcidState[] = [];
  for (const c of world.acid.values()) {
    const age = (now - c.startedAt) / ACID_CLOUD_MS;
    out.push({
      x: Math.round(c.x),
      y: Math.round(c.y),
      // Rounded to whole pixels because the client keys its fog cache on this
      // list: a radius that changed by a hundredth of a pixel every snapshot
      // would throw the visibility polygon away thirty times a second for the
      // whole life of the cloud, which is precisely the cost `FOG_MOVE_EPSILON`
      // exists to avoid paying for the viewer's own position.
      r: Math.round(c.r),
      // Thins away at the end rather than blinking out, the same shape of curve
      // `FIRE_FADE_FRACTION` gives burning ground and for the same reason.
      a: Math.round(clamp(1 - Math.max(0, age - ACID_FADE_FROM) / (1 - ACID_FADE_FROM), 0, 1) * 100) / 100,
      // Its own clock, so the churn can be hashed off it with no per-frame
      // state held anywhere.
      t: Math.round(now - c.startedAt),
    });
  }
  return out;
}

export function spitsToWire(world: World, now: number): SpitState[] {
  const out: SpitState[] = [];
  for (const s of world.spits.values()) {
    const t = clamp((now - s.firedAt) / DOG_SPIT_TRAVEL_MS, 0, 1);
    out.push({
      x: Math.round(s.fromX + (s.x - s.fromX) * t),
      y: Math.round(s.fromY + (s.y - s.fromY) * t),
      // An arc, so it reads as thrown rather than as a laser — the same sine
      // the grenade's height uses.
      h: Math.round(Math.sin(t * Math.PI) * 26),
      t: Math.round(t * 100) / 100,
    });
  }
  return out;
}
