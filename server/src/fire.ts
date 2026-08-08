import type { FireState } from '../../shared/types.js';
import {
  BURN_DAMAGE_PER_SEC,
  BURN_SLOW_MUL,
  FIRE_GROUND_MS,
  FIRE_PATCH_RADIUS,
  FIRE_PATCH_SPACING,
  FLAME_BURN_AFTER_MS,
  FLAME_GROUND_BURN_MS,
  FLAME_RANGE,
  FLAME_SPREAD,
  FLAME_STEP,
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
export function sprayFlame(world: World, shooter: Entity, aim: number, now: number): void {
  const angle = aim + (Math.random() * 2 - 1) * FLAME_SPREAD;
  const dirX = Math.cos(angle);
  const dirY = Math.sin(angle);
  const muzzleX = shooter.x + dirX * shooter.radius * 1.2;
  const muzzleY = shooter.y + dirY * shooter.radius * 1.2;

  // How far the stream gets before something stops it. Napalm sticks where it
  // lands, so a wall in the way becomes a burning wall rather than a full stop.
  let reach = FLAME_RANGE;
  const endX = muzzleX + dirX * FLAME_RANGE;
  const endY = muzzleY + dirY * FLAME_RANGE;
  const minX = Math.min(muzzleX, endX);
  const maxX = Math.max(muzzleX, endX);
  const minY = Math.min(muzzleY, endY);
  const maxY = Math.max(muzzleY, endY);

  for (const wall of world.wallGrid.queryRect(minX, minY, maxX, maxY, new Set<Wall>())) {
    const t = segmentRectT(muzzleX, muzzleY, endX, endY, wall);
    if (t !== null && t * FLAME_RANGE < reach) reach = t * FLAME_RANGE;
  }
  for (const index of world.windowGrid.queryRect(minX, minY, maxX, maxY, new Set<number>())) {
    if (!isWindowIntact(world, index)) continue;
    const t = segmentRectT(muzzleX, muzzleY, endX, endY, world.map.windows[index]);
    if (t !== null && t * FLAME_RANGE < reach) reach = t * FLAME_RANGE;
  }
  for (const index of world.doorGrid.queryRect(minX, minY, maxX, maxY, new Set<number>())) {
    const door = world.doors[index];
    if (!door || door.open || door.broken) continue;
    const t = segmentRectT(muzzleX, muzzleY, endX, endY, door.rect);
    if (t !== null && t * FLAME_RANGE < reach) reach = t * FLAME_RANGE;
  }

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

  // And the ground it crossed keeps burning. Patches rather than a continuous
  // line: a handful of overlapping fires reads the same and costs a fraction.
  for (let d = FLAME_STEP; d <= reach; d += FLAME_STEP) {
    dropPatch(world, muzzleX + dirX * d, muzzleY + dirY * d, now);
  }
  // The far end always gets one, so a stream that stops short of a full step
  // still leaves the wall it hit alight.
  dropPatch(world, stopX, stopY, now);

  world.shots.push({
    x1: Math.round(muzzleX),
    y1: Math.round(muzzleY),
    x2: Math.round(stopX),
    y2: Math.round(stopY),
    hit: true,
    kind: 'flame',
  });
}

/** Set something alight, or top up how long it has left to burn. */
export function ignite(world: World, victim: Entity, now: number, ms: number): void {
  if (victim.type === 'officer') return; // officers don't catch, for now
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
    e.health -= BURN_DAMAGE_PER_SEC * dt;
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
