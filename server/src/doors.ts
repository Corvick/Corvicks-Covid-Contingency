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
  /**
   * When that claim lapses. A claim without a deadline is a claim forever:
   * see `doorBusyForOthers`.
   */
  busyUntil: number;
  /**
   * Which face of the slab the building is on: -1, +1, or 0 when both faces
   * are indoors (a door between rooms) or neither is.
   */
  insideSign: number;
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
      busyUntil: 0,
      insideSign: 0,
    };
  });

  // Which face is the indoor one, sampled once now that every door exists.
  for (let i = 0; i < world.doors.length; i++) {
    const door = world.doors[i];
    if (door) door.insideSign = resolveInsideSign(world, i);
  }

  world.doorAlerts.clear();
  world.doorPleas.clear();
}

/** True when this door currently stops movement, sight and bullets. */
export function isDoorShut(world: World, index: number): boolean {
  const door = world.doors[index];
  return door !== null && door !== undefined && !door.open && !door.broken;
}

/**
 * Is somebody *else* working this door?
 *
 * Only ever ask through here, because a claim has to be able to lapse. Whoever
 * is stood at a handle can be dragged off it, shot, or turned — and turning
 * hands them a brand new AiState with no memory of the door at all — and none
 * of those paths runs `finishDoorWork`, which is the only thing that ever gave
 * the claim back. A door left claimed by a ghost is one nobody may open again:
 * `doorTick` bows out, and since the nav grid plans routes as though every
 * door were open, everyone in that room keeps walking into it for the rest of
 * the round. That is the "officers stuck in a room" case.
 *
 * Two ways out of it, because neither covers the other: the owner no longer
 * exists, or the work they claimed it for should long since have finished.
 */
export function doorBusyForOthers(
  world: World,
  index: number,
  byId: string,
  now: number,
): boolean {
  const door = world.doors[index];
  if (!door || door.busyBy === null || door.busyBy === byId) return false;
  if (now >= door.busyUntil || !world.entities.has(door.busyBy)) {
    door.busyBy = null;
    return false;
  }
  return true;
}

/** Take the door for as long as this piece of work should need. */
export function claimDoor(world: World, index: number, byId: string, until: number): void {
  const door = world.doors[index];
  if (!door) return;
  door.busyBy = byId;
  door.busyUntil = until;
}

/** Every door slab near a point, shut or not. */
/**
 * Dedup by door index rather than by hashing.
 *
 * This runs per entity per tick out of `doorTick`, and it used to build a `Set`
 * and then copy it into an array — two allocations and an identity hash per
 * door, to deduplicate a handful of small integers. A door index is a dense
 * `number`, so a stamp array indexed by it settles the same question with one
 * comparison and no allocation. The generation counter is what saves clearing
 * it: a stamp from a previous call cannot match this call's `gen`.
 */
const doorStamps = { seen: new Int32Array(0), gen: 0 };

export function doorsNear(world: World, x: number, y: number, radius: number): number[] {
  if (doorStamps.seen.length < world.doors.length) {
    doorStamps.seen = new Int32Array(world.doors.length);
  }
  const gen = ++doorStamps.gen;
  const seen = doorStamps.seen;
  // Still a fresh array: callers hold the result while iterating, and some of
  // them call back into here from inside that loop, so a shared buffer would
  // have one walk overwrite another's.
  const out: number[] = [];
  world.doorGrid.each(x - radius, y - radius, x + radius, y + radius, (index) => {
    if (seen[index] === gen) return;
    seen[index] = gen;
    out.push(index);
  });
  return out;
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

/**
 * Is this point on the inside face of the door?
 *
 * Answered from the door's own geometry, worked out once when the door is
 * hung, rather than from "is this person standing inside a building" — that
 * test is unreliable at the exact spot someone stands while working a handle,
 * and it had people hammering to be let in while stood in the hallway.
 *
 * `insideSign` of 0 means both faces are indoors (a door between two rooms) or
 * neither is, and either way anyone at it may work the lock.
 */
export function insideOfDoor(world: World, index: number, x: number, y: number): boolean {
  const door = world.doors[index];
  if (!door) return false;
  return door.insideSign === 0 || doorSide(world, index, x, y) === door.insideSign;
}

/**
 * May somebody stood here work this door's lock?
 *
 * Stricter than `insideOfDoor`: where the door knows which of its faces is
 * indoors, that face is the answer and nothing else matters. Where it doesn't
 * — both faces indoors, or the geometry was too odd to tell — the person has
 * to genuinely be inside a building. Without that fallback, an ambiguous door
 * would let somebody stood in the street draw the bolt.
 */
export function canWorkLockFrom(world: World, index: number, x: number, y: number): boolean {
  const door = world.doors[index];
  if (!door) return false;
  if (door.insideSign !== 0) return doorSide(world, index, x, y) === door.insideSign;
  return buildingIndexAt(world, x, y) >= 0;
}

/** Which face of a doorway the building is on: -1, +1, or 0 for both/neither. */
function resolveInsideSign(world: World, index: number): number {
  const door = world.map.doors[index];
  const probe = WALL_THICKNESS / 2 + 22;
  const near = door.horiz
    ? { x: door.x, y: door.y - probe }
    : { x: door.x - probe, y: door.y };
  const far = door.horiz ? { x: door.x, y: door.y + probe } : { x: door.x + probe, y: door.y };

  const nearIn = buildingIndexAt(world, near.x, near.y) >= 0;
  const farIn = buildingIndexAt(world, far.x, far.y) >= 0;
  if (nearIn === farIn) return 0;
  return nearIn ? -1 : 1;
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
  door.busyUntil = 0;
  return true;
}

/**
 * A charge going off beside a door. Blast damage is rated against DOOR_HEALTH
 * rather than against what it does to a body — see BLAST_DOOR_DAMAGE_MAX.
 *
 * Measured to the nearest point on the slab, not to the doorway's centre, so a
 * wide double door reads evenly along its span. There is deliberately no line
 * of sight test: the door is the thing being tested, and a ray to it is
 * blocked by the very slab we are asking about. What keeps a blast from going
 * through a wall to reach one is the check on the *approach* — a point just
 * short of the slab, on the side the charge went off.
 */
export function blastDoors(
  world: World,
  x: number,
  y: number,
  radius: number,
  damageMin: number,
  damageMax: number,
): void {
  for (const index of doorsNear(world, x, y, radius)) {
    const door = world.doors[index];
    if (!door || door.open || door.broken) continue;

    const slab = door.rect;
    const nx = clamp(x, slab.x, slab.x + slab.w);
    const ny = clamp(y, slab.y, slab.y + slab.h);
    const dist = Math.hypot(x - nx, y - ny);
    if (dist > radius) continue;

    // Stand off the face by a hair and check we can actually reach it. A
    // charge round the corner of the building is inside the radius and has no
    // business touching this door.
    const back = dist > 1 ? Math.min(dist, 10) : 0;
    const ax = nx + ((x - nx) / (dist || 1)) * back;
    const ay = ny + ((y - ny) / (dist || 1)) * back;
    // Bushes are waved through — a hedge does not stop a blast wave.
    if (back > 0 && !hasLineOfSight(world, x, y, ax, ay, true)) continue;

    const falloff = 1 - dist / radius;
    damageDoor(world, index, damageMin + (damageMax - damageMin) * falloff);
  }
}

/** Anybody stood in the doorway, other than whoever is working the handle. */
export function someoneInDoorway(world: World, index: number, exceptId: string): boolean {
  const door = world.doors[index];
  if (!door) return false;
  const slab = door.rect;
  const cx = slab.x + slab.w / 2;
  const cy = slab.y + slab.h / 2;
  const reach = Math.max(slab.w, slab.h) / 2 + 16;

  for (const other of world.entityGrid.queryCircle(cx, cy, reach, new Set<Entity>())) {
    if (other.id === exceptId) continue;
    // Only bodies actually overlapping the slab count, not those beside it.
    const nx = clamp(other.x, slab.x, slab.x + slab.w);
    const ny = clamp(other.y, slab.y, slab.y + slab.h);
    if (Math.hypot(other.x - nx, other.y - ny) < other.radius + 2) return true;
  }
  return false;
}

/**
 * A doorway somebody is trying to shut. Anyone stood in one steps clear of it
 * rather than being pinned there while the door waits.
 */
export function doorWantsClearing(world: World, index: number, now: number): boolean {
  const until = world.doorClearing.get(index);
  if (until === undefined) return false;
  if (now >= until) {
    world.doorClearing.delete(index);
    return false;
  }
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
