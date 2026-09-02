import type { MineState } from '../../shared/types.js';
import {
  ZAP_ARM_MS,
  ZAP_MINE_RADIUS,
  ZAP_STUN_MS,
  ZAP_FLASH_MS,
} from '../../shared/constants.js';
import { letGoOf, type Entity, type World } from './world.js';

/**
 * A zap mine. Put down at your feet, arms after a moment, and drops whatever
 * walks over it where it stands.
 *
 * The stun is deliberately enormous — a minute is most of a fight — because a
 * mine is a one-shot you had to carry, place and then leave behind. It buys
 * ground rather than kills, which is the same job the emplacement does and the
 * opposite of what a grenade does with the same slot.
 */
export interface Mine {
  id: string;
  x: number;
  y: number;
  /** Live from this moment; before it, you can still walk off your own mine. */
  armedAt: number;
}

let counter = 0;

export function placeMine(world: World, owner: Entity, now: number): void {
  const id = `mine-${counter++}`;
  world.mines.set(id, { id, x: owner.x, y: owner.y, armedAt: now + ZAP_ARM_MS });
}

/** Is this one stunned right now? Stunned things are skipped by the AI entirely. */
export function isStunned(world: World, id: string, now: number): boolean {
  const until = world.stunned.get(id);
  if (until === undefined) return false;
  if (now >= until) {
    world.stunned.delete(id);
    return false;
  }
  return true;
}

export function updateMines(world: World, now: number): void {
  for (const [key, mine] of world.mines) {
    if (now < mine.armedAt) continue;

    // Everything in the blast at the moment it goes, not just whoever tripped
    // it — a mine in a doorway should take the whole queue coming through.
    let tripped = false;
    for (const e of world.entityGrid.queryCircle(mine.x, mine.y, ZAP_MINE_RADIUS, new Set<Entity>())) {
      if (e.type !== 'zombie') continue;
      if (Math.hypot(e.x - mine.x, e.y - mine.y) > ZAP_MINE_RADIUS) continue;
      tripped = true;
      world.stunned.set(e.id, Math.max(world.stunned.get(e.id) ?? 0, now + ZAP_STUN_MS));
      // Dropped where they stood, including off anyone they had hold of.
      letGoOf(world, e.id);
    }
    if (!tripped) continue;

    world.mines.delete(key);
    world.zaps.push({ x: Math.round(mine.x), y: Math.round(mine.y), at: now });
  }

  // The crackle is drawn for a moment and then forgotten.
  for (let i = world.zaps.length - 1; i >= 0; i--) {
    if (now - world.zaps[i].at > ZAP_FLASH_MS) world.zaps.splice(i, 1);
  }

  // Anything whose stun has run out stops being stunned. Walked here rather
  // than checked per reader so the map doesn't grow for the whole round.
  for (const [id, until] of world.stunned) {
    if (now >= until || !world.entities.has(id)) world.stunned.delete(id);
  }
}

export function minesToWire(world: World, now: number): MineState[] {
  return [...world.mines.values()].map((m) => ({
    x: Math.round(m.x),
    y: Math.round(m.y),
    armed: now >= m.armedAt,
  }));
}
