import type { Door, DoorState, Wall } from '../../shared/types.js';
import {
  DOOR_ALERT_MS,
  DOOR_ALERT_RADIUS,
  DOOR_HEALTH,
  DOOR_START_OPEN_CHANCE,
  DOOR_USE_RANGE,
  INTERIOR_DOOR_SHARE,
  WALL_THICKNESS,
  ZOMBIE_SIGHT_RADIUS,
} from '../../shared/constants.js';
import { clamp } from './geometry.js';
import { buildingIndexAt, hasLineOfSight, type Entity, type World } from './world.js';

/**
 * A door hung in a doorway. Doorways without one are plain archways and have
 * no runtime state at all.
 *
 * Doors are not part of the nav grid — see the note in constants. They are
 * solid geometry for collision, sight and gunfire, and everything that walks
 * into one has to deal with it.
 */
export interface DoorRuntime {
  /** Closed doors block; open ones are scenery. */
  open: boolean;
  locked: boolean;
  /** Bolted by a player: civilians will not unlock or open it. */
  playerLocked: boolean;
  broken: boolean;
  health: number;
  /** Cached slab rectangle, so collision isn't rebuilding it per query. */
  rect: Wall;
  /** Somebody is working this door right now; nobody else may start. */
  busyBy: string | null;
}

/** The slab that fills a doorway when it's shut. */
export function doorRect(door: Door): Wall {
  const t = WALL_THICKNESS;
  return door.horiz
    ? { x: door.x - door.halfSpan, y: door.y - t / 2, w: door.halfSpan * 2, h: t }
    : { x: door.x - t / 2, y: door.y - door.halfSpan, w: t, h: door.halfSpan * 2 };
}

/** Hang doors in every way in, and in a share of the openings between rooms. */
export function initDoors(world: World): void {
  world.doors = world.map.doors.map((door) => {
    if (door.interior && Math.random() >= INTERIOR_DOOR_SHARE) return null;
    return {
      open: Math.random() < DOOR_START_OPEN_CHANCE,
      locked: false,
      playerLocked: false,
      broken: false,
      health: DOOR_HEALTH,
      rect: doorRect(door),
      busyBy: null,
    };
  });
  world.doorAlerts.clear();
  world.doorPleas.clear();
}

/** True when this door currently stops movement, sight and bullets. */
export function isDoorShut(world: World, index: number): boolean {
  const door = world.doors[index];
  return door !== null && door !== undefined && !door.open && !door.broken;
}

/** Every door slab near a point, shut or not. */
export function doorsNear(world: World, x: number, y: number, radius: number): number[] {
  const found = world.doorGrid.queryCircle(x, y, radius, new Set<number>());
  return Array.from(found);
}

/**
 * The door this entity is stood at — nearest within `range`, measured to the
 * slab rather than to its centre so a wide doorway reads evenly along its span.
 */
export function doorAt(world: World, x: number, y: number, range = DOOR_USE_RANGE): number {
  let best = -1;
  let bestDist = Infinity;

  for (const index of doorsNear(world, x, y, range)) {
    if (!world.doors[index]) continue;
    const door = world.map.doors[index];
    const nx = clamp(x, door.x - door.halfSpan, door.x + door.halfSpan);
    const ny = clamp(y, door.y - door.halfSpan, door.y + door.halfSpan);
    const dist = door.horiz ? Math.hypot(nx - x, door.y - y) : Math.hypot(door.x - x, ny - y);
    if (dist < bestDist && dist <= range) {
      bestDist = dist;
      best = index;
    }
  }
  return best;
}

/**
 * Which face of the slab a point is on, as -1 or +1. Unlike "is it indoors",
 * this works for a door between two rooms, where both sides are indoors.
 */
export function doorSide(world: World, index: number, x: number, y: number): number {
  const door = world.map.doors[index];
  return door.horiz ? (y < door.y ? -1 : 1) : x < door.x ? -1 : 1;
}

/** Which side of the doorway a point is on: true when it's indoors. */
export function insideOfDoor(world: World, index: number, x: number, y: number): boolean {
  const door = world.map.doors[index];
  const building = buildingIndexAt(world, x, y);
  return building >= 0 && (door.interior || building === door.building);
}

/**
 * A door being shut is worth noticing. Any zombie that watched it happen will
 * come and take the door apart rather than wandering off.
 */
export function alertZombiesToDoor(world: World, index: number, now: number): void {
  const door = world.map.doors[index];
  const heard = world.entityGrid.queryCircle(door.x, door.y, DOOR_ALERT_RADIUS, new Set<Entity>());

  for (const zombie of heard) {
    if (zombie.type !== 'zombie' || world.playerIds.has(zombie.id)) continue;
    if (Math.hypot(zombie.x - door.x, zombie.y - door.y) > ZOMBIE_SIGHT_RADIUS) continue;
    if (!hasLineOfSight(world, zombie.x, zombie.y, door.x, door.y)) continue;

    const state = world.ai.get(zombie.id);
    if (!state) continue;
    state.doorTarget = index;
    state.doorTargetUntil = now + DOOR_ALERT_MS;
  }
  world.doorAlerts.set(index, now + DOOR_ALERT_MS);
}

export function openDoor(world: World, index: number): void {
  const door = world.doors[index];
  if (!door) return;
  door.open = true;
  door.locked = false;
}

/** Shutting one is what draws the attention. */
export function shutDoor(world: World, index: number, now: number): void {
  const door = world.doors[index];
  if (!door || door.broken) return;
  // Work out who saw it happen *before* it shuts: line of sight to a door is
  // blocked by that very door the instant it closes, so checking afterwards
  // meant nothing was ever alerted to anything.
  alertZombiesToDoor(world, index, now);
  door.open = false;
}

export function lockDoor(world: World, index: number): void {
  const door = world.doors[index];
  if (!door || door.broken || door.open) return;
  door.locked = true;
}

export function unlockDoor(world: World, index: number): void {
  const door = world.doors[index];
  if (!door) return;
  door.locked = false;
}

/** Returns true when this hit took the door off its hinges. */
export function damageDoor(world: World, index: number, amount: number): boolean {
  const door = world.doors[index];
  if (!door || door.broken || door.open) return false;

  door.health -= amount;
  if (door.health > 0) return false;

  door.health = 0;
  door.broken = true;
  door.open = true;
  door.locked = false;
  door.playerLocked = false;
  door.busyBy = null;
  return true;
}

/** Someone outside is begging to be let in at this door. */
export function addPlea(world: World, index: number, until: number): void {
  const existing = world.doorPleas.get(index) ?? 0;
  if (until > existing) world.doorPleas.set(index, until);
}

export function clearExpiredPleas(world: World, now: number): void {
  for (const [index, until] of world.doorPleas) {
    if (now >= until) world.doorPleas.delete(index);
  }
  for (const [index, until] of world.doorAlerts) {
    if (now >= until) world.doorAlerts.delete(index);
  }
}

/** Door states near a viewer, for the snapshot. */
export function doorsToWire(world: World, x: number, y: number, radius: number): DoorState[] {
  const out: DoorState[] = [];
  for (const index of doorsNear(world, x, y, radius)) {
    const door = world.doors[index];
    if (!door) continue;
    const wire: DoorState = {
      i: index,
      open: door.open,
      locked: door.locked,
      broken: door.broken,
    };
    if (door.health < DOOR_HEALTH) wire.hp = Math.round((door.health / DOOR_HEALTH) * 100) / 100;
    out.push(wire);
  }
  return out;
}

/** Every door on the map, for a spectator. */
export function allDoorsToWire(world: World): DoorState[] {
  const out: DoorState[] = [];
  for (let i = 0; i < world.doors.length; i++) {
    const door = world.doors[i];
    if (!door) continue;
    const wire: DoorState = { i, open: door.open, locked: door.locked, broken: door.broken };
    if (door.health < DOOR_HEALTH) wire.hp = Math.round((door.health / DOOR_HEALTH) * 100) / 100;
    out.push(wire);
  }
  return out;
}
