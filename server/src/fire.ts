import type { FireState } from '../../shared/types.js';
import {
  BURN_DAMAGE_PER_SEC,
  BURN_SLOW_MUL,
  FIRE_GROUND_MS,
  FIRE_PATCH_RADIUS,
  FIRE_PATCH_SPACING,
  FLAME_BURN_AFTER_MS,
  FLAME_GROUND_BURN_MS,
  HUMAN_BURN_MS,
  HUMAN_BURN_DAMAGE_PER_SEC,
  HUMAN_BURN_FLOOR,
  FLAME_MIN_THROW,
  FLAME_RANGE,
  FLAME_SPLASH_ARC,
  FLAME_SPLASH_COUNT,
  FLAME_SPLASH_SPREAD,
  FLAME_LAND_INSET,
  FLAME_SPREAD,
  FLAME_TRAVEL_MS,
  FLAME_INFECTED_DAMAGE_MUL,
} from '../../shared/constants.js';
import { segmentCircleT, segmentRectT } from './geometry.js';
import { isWindowIntact, killEntity, type Entity, type World } from './world.js';
import type { Wall } from '../../shared/types.js';

/**
 * Napalm. Not a hitscan weapon and not a projectile either — a short thick
 * stream that stops at the first thing solid, sets light to whatever it
 * touches on the way, and leaves the ground burning behind it.
 *
 * The burning is the weapon. A single lick does almost nothing; standing in it
 * is what kills, and everything it touches is slowed while it burns.
 */
export interface FirePatch {
  x: number;
  y: number;
  /** When it goes out. */
  until: number;
}

/**
 * Napalm still in the air. Where the ground will catch, and when the fuel gets
 * there — see `FLAME_TRAVEL_MS`.
 */
export interface PendingPatch {
  x: number;
  y: number;
  /** When it lands. */
  at: number;
}

/** Lay a patch down, unless one is already burning about there. */
function dropPatch(world: World, x: number, y: number, now: number): void {
  for (const patch of world.fires) {
    if (Math.hypot(patch.x - x, patch.y - y) < FIRE_PATCH_SPACING) {
      // Feeding an existing fire keeps it alight rather than stacking patches.
      patch.until = Math.max(patch.until, now + FIRE_GROUND_MS);
      return;
    }
  }
  world.fires.push({ x, y, until: now + FIRE_GROUND_MS });
}

/**
 * Where a patch *will* be, once the stream reaches it.
 *
 * The merge into an existing fire deliberately happens on landing rather than
 * here: what is burning by the time the fuel arrives is not what was burning
 * when the trigger went, and merging early would fold a patch into a fire that
 * has since gone out.
 */
function queuePatch(world: World, x: number, y: number, now: number): void {
  world.pendingFires.push({ x, y, at: now + FLAME_TRAVEL_MS });
}

/**
 * One pull of the trigger: walk the stream out from the muzzle, stopping at
 * the first wall, pane or shut door, and set light to everything it passes.
 */
export function sprayFlame(
  world: World,
  shooter: Entity,
  aim: number,
  now: number,
  /** Where the crosshair is. The throw lands here rather than at full reach. */
  at?: { x: number; y: number },
): void {
  const angle = aim + (Math.random() * 2 - 1) * FLAME_SPREAD;
  const dirX = Math.cos(angle);
  const dirY = Math.sin(angle);
  const muzzleX = shooter.x + dirX * shooter.radius * 1.2;
  const muzzleY = shooter.y + dirY * shooter.radius * 1.2;

  // You throw it where you are pointing. Without this the stream always went
  // its full length, so aiming at something close by put the fire well behind
  // it — the crosshair chose the direction and nothing chose the distance.
  const throwTo = at
    ? Math.max(FLAME_MIN_THROW, Math.min(FLAME_RANGE, Math.hypot(at.x - muzzleX, at.y - muzzleY)))
    : FLAME_RANGE;

  // How far the stream gets before something stops it. Napalm sticks where it
  // lands, so a wall in the way becomes a burning wall rather than a full stop.
  let reach = throwTo;
  const endX = muzzleX + dirX * throwTo;
  const endY = muzzleY + dirY * throwTo;
  const minX = Math.min(muzzleX, endX);
  const maxX = Math.max(muzzleX, endX);
  const minY = Math.min(muzzleY, endY);
  const maxY = Math.max(muzzleY, endY);

  for (const wall of world.wallGrid.queryRect(minX, minY, maxX, maxY, new Set<Wall>())) {
    const t = segmentRectT(muzzleX, muzzleY, endX, endY, wall);
    if (t !== null && t * throwTo < reach) reach = t * throwTo;
  }
  for (const index of world.windowGrid.queryRect(minX, minY, maxX, maxY, new Set<number>())) {
    if (!isWindowIntact(world, index)) continue;
    const t = segmentRectT(muzzleX, muzzleY, endX, endY, world.map.windows[index]);
    if (t !== null && t * throwTo < reach) reach = t * throwTo;
  }
  for (const index of world.doorGrid.queryRect(minX, minY, maxX, maxY, new Set<number>())) {
    const door = world.doors[index];
    if (!door || door.open || door.broken) continue;
    const t = segmentRectT(muzzleX, muzzleY, endX, endY, door.rect);
    if (t !== null && t * throwTo < reach) reach = t * throwTo;
  }

  // Something solid cut the throw short. That changes where the fire ends up:
  // it lands against whatever stopped it and goes no further.
  const blocked = reach < throwTo - 0.5;

  // Anything caught in the stream itself burns for as long as it is being hit,
  // and for a while after the trigger comes off.
  const stopX = muzzleX + dirX * reach;
  const stopY = muzzleY + dirY * reach;
  for (const other of world.entityGrid.queryRect(
    Math.min(muzzleX, stopX) - 20,
    Math.min(muzzleY, stopY) - 20,
    Math.max(muzzleX, stopX) + 20,
    Math.max(muzzleY, stopY) + 20,
    new Set<Entity>(),
  )) {
    if (other.id === shooter.id || other.type === 'officer') continue;
    const t = segmentCircleT(muzzleX, muzzleY, stopX, stopY, other.x, other.y, other.radius + 6);
    if (t === null) continue;
    ignite(world, other, now, FLAME_BURN_AFTER_MS);
  }

  // Nothing burns along the way. Napalm is thrown, and it all comes down in
  // one place: the pavement between you and where you are pointing stays
  // clear. That is what a thrown stream looks like, and it is also what stops
  // a held trigger laying a carpet of fire across the shooter's own feet.
  //
  // And it comes down *late*. Where the fire lands is worked out now, on the
  // tick the trigger went, against the geometry as it stands — but the ground
  // does not catch until the drawn front actually reaches it. Fire blooming
  // under the crosshair while the stream was still halfway across the street
  // was the loudest tell that the travel was a picture over an instant weapon.
  const landX = stopX - dirX * FLAME_LAND_INSET;
  const landY = stopY - dirY * FLAME_LAND_INSET;
  queuePatch(world, landX, landY, now);

  // And a couple more thrown on past it, in a narrow cone — but not when a
  // wall stopped the stream. Then this *is* where it stopped, and throwing
  // burning ground past it would be putting fire through the wall.
  if (!blocked) {
    for (let i = 0; i < FLAME_SPLASH_COUNT; i++) {
      const a = angle + ((i + 0.5) / FLAME_SPLASH_COUNT - 0.5) * FLAME_SPLASH_ARC;
      const d = FLAME_SPLASH_SPREAD * (0.9 + Math.random() * 0.5);
      const sx = landX + Math.cos(a) * d;
      const sy = landY + Math.sin(a) * d;
      // Nothing gets thrown through a wall, even the short way the cone
      // reaches. The nav grid carries walls, intact glass and the pond, which
      // is every solid thing the splash could be flung over.
      if (world.nav.isBlocked(sx, sy)) continue;
      if (!world.nav.lineClear(landX, landY, sx, sy)) continue;
      queuePatch(world, sx, sy, now);
    }
  }

  world.shots.push({
    x1: Math.round(muzzleX),
    y1: Math.round(muzzleY),
    x2: Math.round(stopX),
    y2: Math.round(stopY),
    hit: true,
    kind: 'flame',
    // The client joins one shooter's pulls into a single bending stream, so it
    // has to be able to tell two flamethrowers apart.
    who: shooter.id,
  });
}

/**
 * Set something alight, or top up how long it has left to burn.
 *
 * Civilians catch, yelp and beat it out: their burn is capped hard rather than
 * extended, so standing in a fire can't accumulate into a death sentence. That
 * is a rule about the game and not about fire — without it the flamethrower is
 * a tool for clearing a street of the very people you are there to save, and
 * burning the uninfected becomes a cheaper way to stop an outbreak than
 * fighting it. Officers don't catch at all for the same kind of reason.
 */
/**
 * Does fire treat this body as one of the dead?
 *
 * Civilians cannot be burned to death, by construction — a flamethrower that
 * clears a street of the people you are there to save is a tool for losing.
 * **Somebody already carrying the infection is not that case.** They are going
 * to turn, everyone can see it coming, and burning them is the crowd-level
 * answer to an outbreak the way the charge rifle is the single-target one and
 * the cure gun is the merciful one. So the protection is a rule about the
 * *uninfected*, and it lifts the moment they are bitten.
 */
function burnsLikeTheDead(world: World, victim: Entity): boolean {
  return victim.type !== 'human' || world.pendingInfections.has(victim.id);
}

export function ignite(world: World, victim: Entity, now: number, ms: number): void {
  if (victim.type === 'officer') return; // officers don't catch, for now

  if (!burnsLikeTheDead(world, victim)) {
    const cap = now + HUMAN_BURN_MS;
    world.burning.set(victim.id, Math.min(cap, Math.max(world.burning.get(victim.id) ?? 0, cap)));
    return;
  }

  const until = Math.max(world.burning.get(victim.id) ?? 0, now + ms);
  world.burning.set(victim.id, until);
}

/**
 * Tick the fires: patches go out, anything standing in one catches, and
 * anything alight takes damage and moves badly while it does.
 */
export function updateFires(world: World, now: number, dt: number): void {
  // Napalm that has finished its flight sets the ground alight now. Done ahead
  // of the sweep below so a patch that lands this tick is one anybody standing
  // in it catches from immediately, rather than a tick late.
  for (let i = world.pendingFires.length - 1; i >= 0; i--) {
    const inFlight = world.pendingFires[i];
    if (now < inFlight.at) continue;
    world.pendingFires.splice(i, 1);
    dropPatch(world, inFlight.x, inFlight.y, now);
  }

  for (let i = world.fires.length - 1; i >= 0; i--) {
    if (now >= world.fires[i].until) world.fires.splice(i, 1);
  }

  if (world.fires.length > 0) {
    for (const patch of world.fires) {
      for (const e of world.entityGrid.queryCircle(
        patch.x,
        patch.y,
        FIRE_PATCH_RADIUS,
        new Set<Entity>(),
      )) {
        if (e.type === 'officer') continue;
        if (Math.hypot(e.x - patch.x, e.y - patch.y) > FIRE_PATCH_RADIUS) continue;
        ignite(world, e, now, FLAME_GROUND_BURN_MS);
      }
    }
  }

  if (world.burning.size === 0) return;
  for (const [id, until] of [...world.burning]) {
    const e = world.entities.get(id);
    if (!e || now >= until) {
      world.burning.delete(id);
      continue;
    }
    // A zombie alight is dying; a clean civilian alight is having a bad moment.
    // Somebody already bitten burns like the dead, and *harder* than the dead —
    // fire is what the flamethrower has that nothing else does against a crowd
    // that is half turned already.
    if (!burnsLikeTheDead(world, e)) {
      // Standing in a fire re-lights them every tick, so the short burn alone
      // still adds up to a kill given a minute. The floor is what makes it
      // properly impossible rather than merely slow.
      e.health = Math.max(HUMAN_BURN_FLOOR, e.health - HUMAN_BURN_DAMAGE_PER_SEC * dt);
    } else {
      const carrying = e.type === 'human' && world.pendingInfections.has(id);
      e.health -= BURN_DAMAGE_PER_SEC * (carrying ? FLAME_INFECTED_DAMAGE_MUL : 1) * dt;
    }
    // Burning is a state of movement as much as of health: they flail.
    const state = world.ai.get(id);
    if (state) {
      state.slowUntil = Math.max(state.slowUntil, now + 200);
      state.slowMul = Math.min(state.slowMul || 1, BURN_SLOW_MUL);
    }
    if (e.health <= 0) {
      world.burning.delete(id);
      // Players used to be skipped outright here, which was harmless while the
      // only ones who could catch were officers — and officers cannot. A dog
      // is a player *and* burns, so it would have sat at zero health forever.
      killEntity(world, e, now);
    }
  }
}

export function firesToWire(world: World, now: number): FireState[] {
  return world.fires.map((patch) => ({
    x: Math.round(patch.x),
    y: Math.round(patch.y),
    // How much life it has left, for the client to fade it out on.
    life: Math.max(0, Math.min(1, (patch.until - now) / FIRE_GROUND_MS)),
  }));
}
