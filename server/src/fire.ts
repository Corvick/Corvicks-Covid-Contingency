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
} from '../../shared/constants.js';
import { segmentCircleT, segmentRectT } from './geometry.js';
import { isWindowIntact, type Entity, type World } from './world.js';
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
  const landX = stopX - dirX * FLAME_LAND_INSET;
  const landY = stopY - dirY * FLAME_LAND_INSET;
  dropPatch(world, landX, landY, now);

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
      dropPatch(world, sx, sy, now);
    }
  }

  world.shots.push({
    x1: Math.round(muzzleX),
    y1: Math.round(muzzleY),
    x2: Math.round(stopX),
    y2: Math.round(stopY),
    hit: true,
    kind: 'flame',
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
export function ignite(world: World, victim: Entity, now: number, ms: number): void {
  if (victim.type === 'officer') return; // officers don't catch, for now

  if (victim.type === 'human') {
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
    // A zombie alight is dying; a civilian alight is having a bad moment.
    if (e.type === 'human') {
      // Standing in a fire re-lights them every tick, so the short burn alone
      // still adds up to a kill given a minute. The floor is what makes it
      // properly impossible rather than merely slow.
      e.health = Math.max(HUMAN_BURN_FLOOR, e.health - HUMAN_BURN_DAMAGE_PER_SEC * dt);
    } else {
      e.health -= BURN_DAMAGE_PER_SEC * dt;
    }
    // Burning is a state of movement as much as of health: they flail.
    const state = world.ai.get(id);
    if (state) {
      state.slowUntil = Math.max(state.slowUntil, now + 200);
      state.slowMul = Math.min(state.slowMul || 1, BURN_SLOW_MUL);
    }
    if (e.health <= 0) {
      world.burning.delete(id);
      if (!world.playerIds.has(id)) {
        world.entities.delete(id);
        world.ai.delete(id);
        world.grapples.delete(id);
        for (const session of world.grapples.values()) session.zombieIds.delete(id);
      }
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
