import type { AcidState, Bush, SpitState } from '../../shared/types.js';
import { acidLobes } from '../../shared/acidshape.js';
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
  WALL_THICKNESS,
  GRENADE_BOUNCE,
  WORLD_WIDTH,
  WORLD_HEIGHT,
} from '../../shared/constants.js';
import { clamp } from './geometry.js';
import { bouncesOff } from './heli.js';
import type { Entity, World } from './world.js';

/**
 * The dog's acid, in two parts: a gobbet in the air and the cloud it leaves.
 *
 * Everything here is deliberately shaped like something that already exists.
 * The cloud is a **cluster of circles**, which is exactly the shape `Bush` has
 * seven of, so it drops into `hasLineOfSight` and into the client's
 * `visibilityPolygon` beside the foliage with no new kind of occluder on either
 * side of the wire — see `shared/acidshape.ts` for why lumpy had to mean *more
 * circles* rather than a new shape. The slow rides `speedAt`, the one function
 * every mover in the game already goes through. The flight is a **grenade**:
 * the same `bouncesOff`, the same `GRENADE_BOUNCE`, the same axis-at-a-time
 * reflection.
 *
 * *It used to be `sprayFlame`'s trick instead* — work out where it lands on the
 * tick the key went down, against the geometry as it stood, then wait for it to
 * get there. That is right for a flamethrower, whose stream is stopped dead by
 * the first wall. A gobbet comes off the wall, so where it ends up cannot be
 * known at launch and the position has to be integrated.
 *
 * What is genuinely new is only the blinding, and even that is a map of
 * deadlines keyed by id, the same as `world.stunned`.
 *
 * **Nothing in this module imports `world.ts` at runtime**, only its types —
 * the world holds acid clouds as plain data, so `hasLineOfSight` and `speedAt`
 * can read them without a cycle between the two files. `heli.ts` is imported
 * for `bouncesOff` and that is not a cycle: `world.ts` type-imports this module
 * and never loads it.
 */

let counter = 0;
const nextId = (prefix: string) => `${prefix}-${counter++}`;

/**
 * A gobbet in the air, and it does **not** know where it is going to land.
 *
 * It used to: `sprayFlame`'s trick is to work the landing point out on the tick
 * the key went down, against the geometry as it stood, and then wait for the
 * fuel to get there. That is right for a flamethrower, whose stream is cut
 * short by the first wall and stops. A gobbet **bounces**, so where it ends up
 * is only known when the flight time runs out — the same as a grenade, which
 * is why the physics is the same `bouncesOff` and the same `GRENADE_BOUNCE`.
 *
 * So the position is integrated rather than interpolated, and `x`/`y` are
 * where it is *now*.
 */
export interface AcidSpit {
  id: string;
  x: number;
  y: number;
  /**
   * Set so an unobstructed throw covers the whole distance exactly as the
   * flight time runs out — the same arithmetic `throwCharge` uses. Anything it
   * hits on the way changes where it ends up but not when.
   */
  vx: number;
  vy: number;
  /**
   * How much of the flight it has actually been stepped through, in ms.
   *
   * **Not a `firedAt` compared against the clock**, and the difference is a
   * real one now that the position is integrated. A tick is 33.3ms and the
   * flight is 420, so a spit that ran until its age passed the flight time
   * would take fourteen whole steps for thirteen ticks' worth of travel and
   * land ~3% long — which on a clear throw is the gobbet visibly overshooting
   * the crosshair. Charging the *last* step only for what is left of the
   * flight lands it exactly where it was aimed, and leaves a bounce free to
   * put it somewhere else entirely.
   */
  flownMs: number;
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
   *
   * It is the **bounding** radius now that the cloud is lumpy: no lobe reaches
   * past it, so every cheap rejection in front of the lobe walk still holds.
   */
  r: number;
  /**
   * What `r` grows *to*. Per cloud rather than the constant, because a dog
   * bursting leaves a much bigger one than a gobbet does
   * (`DOG_BURST_CLOUD_MUL`) and the growth curve is shared.
   */
  full: number;
  /** Picks this cloud's own lumps out of every other cloud's. */
  seed: number;
  /**
   * The lobes, in world coordinates, as of this tick.
   *
   * Rewritten in place by `updateAcid` for the same reason `r` is, and *only*
   * there: the array is read by `hasLineOfSight` and `speedAt`, neither of
   * which may allocate. The shape is fixed for the cloud's life and only its
   * scale grows, which is what keeps the client's fog cache from being thrown
   * away thirty times a second for nine seconds — see `acidToWire`.
   */
  lobes: Bush[];
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
  // Velocity, not a destination: it bounces, so where it lands is discovered on
  // the way. Sized so a clear throw arrives exactly as the flight runs out,
  // which is `throwCharge`'s arithmetic and keeps the arc in `spitsToWire`
  // honest whatever the gobbet hits.
  const flight = DOG_SPIT_TRAVEL_MS / 1000;
  const id = nextId('spit');
  world.spits.set(id, {
    id,
    x: dog.x,
    y: dog.y,
    vx: (Math.cos(angle) * dist) / flight,
    vy: (Math.sin(angle) * dist) / flight,
    flownMs: 0,
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
export function updateAcid(world: World, now: number, dt: number): void {
  for (const [key, s] of world.spits) {
    // The last step is charged only for what is left of the flight, so a clear
    // throw lands exactly on the crosshair rather than a tick's travel past it.
    const stepMs = Math.min(dt * 1000, DOG_SPIT_TRAVEL_MS - s.flownMs);
    if (stepMs > 0) moveSpit(world, s, stepMs / 1000);
    s.flownMs += stepMs;
    if (s.flownMs < DOG_SPIT_TRAVEL_MS) continue;
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
    c.r = c.full * clamp(0.3 + (age / ACID_GROW_MS) * 0.7, 0.3, 1);
    acidLobes(c.seed, c.x, c.y, c.r, c.lobes);
  }

  // A blinding that has run out is dropped rather than left to be compared
  // against a clock by everybody who asks — the map is what `updateAi` checks
  // per entity, so it should hold only people who currently cannot see.
  for (const [id, until] of world.blinded) {
    if (now >= until || !world.entities.has(id)) world.blinded.delete(id);
  }
}

/**
 * Step a gobbet along, reflecting it off anything solid.
 *
 * The same shape as `moveGrenade` and deliberately so — each axis tested on its
 * own, then the corner case neither caught, which is what makes a thing thrown
 * into a corner come back out of it rather than burying itself in the geometry.
 * It shares `bouncesOff` and `GRENADE_BOUNCE` with the charges rather than
 * carrying its own: they bounce off the same walls, the same intact glass and
 * the same shut doors, and two copies of that set would drift the first time
 * one of those three changed status.
 *
 * No gravity and no roll: unlike a grenade this is in the air for a fixed
 * `DOG_SPIT_TRAVEL_MS` and then it is on the ground, so the only thing a bounce
 * changes is *where*.
 */
function moveSpit(world: World, s: AcidSpit, dt: number): void {
  /**
   * **Substepped, and it has to be.** A gobbet crosses `DOG_SPIT_RANGE` in
   * `DOG_SPIT_TRAVEL_MS` — 380px in 420ms, so about 30px in a 33ms tick —
   * against a `WALL_THICKNESS` of 10. Stepped whole it jumps clean over an
   * interior wall and lands on the far side of it, which is the one thing this
   * was asked to stop. Measured that way the bounce rig read **1 of 8 landing
   * past the wall**, intermittently, which is exactly what tunnelling looks
   * like: it depends on where in the step the wall happens to fall.
   *
   * Half a wall's thickness is the step, so no wall in the game can sit between
   * two samples. A gobbet is one object living about thirteen ticks, so this is
   * five or six extra point tests per tick and nothing worth measuring.
   *
   * *The grenades have the same shape of risk and are not substepped* — but
   * they travel a comparable distance over `GRENADE_FLIGHT_MS` (850), so their
   * step is less than half of this one's. Worth knowing if either number moves.
   */
  const speed = Math.hypot(s.vx, s.vy);
  const steps = Math.max(1, Math.ceil((speed * dt) / (WALL_THICKNESS / 2)));
  const sub = dt / steps;

  for (let i = 0; i < steps; i++) {
    const nx = s.x + s.vx * sub;
    const ny = s.y + s.vy * sub;

    // Each axis on its own, then the corner neither caught — which is what
    // makes a thing thrown into a corner come back out of it.
    let bounced = false;
    if (bouncesOff(world, nx, s.y)) {
      s.vx = -s.vx * GRENADE_BOUNCE;
      s.vy *= GRENADE_BOUNCE;
      bounced = true;
    }
    if (bouncesOff(world, s.x, ny)) {
      s.vy = -s.vy * GRENADE_BOUNCE;
      s.vx *= GRENADE_BOUNCE;
      bounced = true;
    }
    if (!bounced && bouncesOff(world, nx, ny)) {
      s.vx = -s.vx * GRENADE_BOUNCE;
      s.vy = -s.vy * GRENADE_BOUNCE;
    }

    s.x = clamp(s.x + s.vx * sub, 4, WORLD_WIDTH - 4);
    s.y = clamp(s.y + s.vy * sub, 4, WORLD_HEIGHT - 4);
  }
}

/**
 * Put a cloud on the ground, at whatever width it is to grow to.
 *
 * Exported because a gobbet is no longer the only thing that leaves one: a
 * transformed dog bursting leaves a much bigger one (`DOG_BURST_CLOUD_MUL`),
 * and `dog.ts` has no business knowing what a cloud's seed, lobes or growth
 * curve look like. The splash is deliberately *not* in here — the impact and
 * the cloud are two different events that happen to land on the same tick, and
 * a burst has no splash at all.
 */
export function layCloud(world: World, x: number, y: number, full: number, now: number): void {
  const id = nextId('acid');
  const r = full * 0.3;
  // A whole number, because it goes on the wire and the client derives the same
  // lobes from it. A float would survive `JSON.stringify` intact today and is
  // one rounding away from the two halves drawing different clouds.
  const seed = Math.floor(Math.random() * 10000);
  world.acid.set(id, {
    id,
    x,
    y,
    startedAt: now,
    r,
    full,
    seed,
    lobes: acidLobes(seed, x, y, r),
  });
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
  layCloud(world, s.x, s.y, ACID_CLOUD_RADIUS, now);

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
      // The client derives the lobes rather than being sent them — see
      // `shared/acidshape.ts`. One integer against seven circles on the wire,
      // and the two halves cannot disagree about the shape by construction.
      s: c.seed,
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

export function spitsToWire(world: World): SpitState[] {
  const out: SpitState[] = [];
  for (const s of world.spits.values()) {
    // Off the flight it has actually been stepped through rather than off the
    // clock, so the drawn arc and the position it is drawn at come from the
    // same number and cannot disagree by a tick.
    const t = clamp(s.flownMs / DOG_SPIT_TRAVEL_MS, 0, 1);
    out.push({
      // Where it *is*, not a fraction of the way to where it was going. It
      // bounces, so there is no longer a straight line to interpolate along —
      // and a client drawing the chord would show the gobbet passing through
      // the wall it just came off.
      x: Math.round(s.x),
      y: Math.round(s.y),
      // An arc, so it reads as thrown rather than as a laser — the same sine
      // the grenade's height uses.
      h: Math.round(Math.sin(t * Math.PI) * 26),
      t: Math.round(t * 100) / 100,
    });
  }
  return out;
}
