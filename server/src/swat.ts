import type { SwatVanState } from '../../shared/types.js';
import {
  BOUNDARY_THICKNESS,
  ENTITY_RADIUS,
  RADIO_BACKUP_COUNT,
  RADIO_CALL_LINE,
  RADIO_REPLY_DELAY_MS,
  RADIO_REPLY_LINE,
  RADIO_SPEECH_MS,
  SHIELD_POINTS,
  VAN_ARRIVE_DIST,
  VAN_DOOR_INTERVAL_MS,
  VAN_ENTRY_OFFSET,
  VAN_LANE_CLEARANCE,
  VAN_LANE_OFFSETS,
  VAN_LANE_STEP,
  VAN_LENGTH,
  VAN_PARK_MAX,
  VAN_PARK_MIN,
  VAN_SPEED,
  VAN_WIDTH,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from '../../shared/constants.js';
import { resolveCircleBox, type OrientedBox } from './geometry.js';
import { newInventory } from './inventory.js';
import {
  buildingIndexAt,
  findSpawnNear,
  hasWallClearPath,
  makeEntity,
  newAiState,
  type Entity,
  type World,
} from './world.js';

/**
 * A SWAT van answering the radio.
 *
 * This is the helicopter over again with its feet on the ground: something
 * comes in from off the map, stops, puts people out, and the people are what
 * matter. The differences are that a van has to arrive down a street rather
 * than over the rooftops, and that it stays parked afterwards instead of
 * flying off — an armoured box on the corner is free scenery and a landmark
 * for where your backup came from.
 */
export interface SwatVan {
  id: string;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  facing: number;
  phase: 'inbound' | 'parked';
  /** Who called it, so the crew knows whose shoulder to stand at. */
  callerId: string;
  dropped: number;
  nextDropAt: number;
}

let counter = 0;

/** N, E, S, W — the same numbering the outbreak's breach side uses. */
type Side = 0 | 1 | 2 | 3;

/**
 * Where the van drives in from, given a side and how far along that side.
 *
 * `along` is a world coordinate on the free axis: an x for the north and south
 * edges, a y for the east and west ones.
 */
function entryOn(side: Side, along: number): { x: number; y: number } {
  const x = Math.max(80, Math.min(WORLD_WIDTH - 80, along));
  const y = Math.max(80, Math.min(WORLD_HEIGHT - 80, along));
  if (side === 0) return { x, y: -VAN_ENTRY_OFFSET };
  if (side === 1) return { x: WORLD_WIDTH + VAN_ENTRY_OFFSET, y };
  if (side === 2) return { x, y: WORLD_HEIGHT + VAN_ENTRY_OFFSET };
  return { x: -VAN_ENTRY_OFFSET, y };
}

/** How far a point is from a given edge, for ranking which side is nearest. */
function distanceToSide(side: Side, x: number, y: number): number {
  if (side === 0) return y;
  if (side === 1) return WORLD_WIDTH - x;
  if (side === 2) return WORLD_HEIGHT - y;
  return x;
}

/**
 * Is there room for the van, centred here and lying along `facing`?
 *
 * The old patrol car asked `nav.isBlocked` at a single point, which a body
 * 82 by 38 walks straight past — half of it can be inside a shop while its
 * centre stands in the street. This tests the corners and the flanks, and
 * `buildingIndexAt` as well as the nav grid, because "not in a building" is
 * the thing actually being asked and a doorway is walkable nav.
 */
function vanFits(world: World, x: number, y: number, facing: number): boolean {
  const cos = Math.cos(facing);
  const sin = Math.sin(facing);
  const hl = VAN_LENGTH / 2;
  const hw = VAN_WIDTH / 2 + VAN_LANE_CLEARANCE / 2;

  for (const along of [-hl, -hl / 2, 0, hl / 2, hl]) {
    for (const across of [-hw, 0, hw]) {
      const px = x + cos * along - sin * across;
      const py = y + sin * along + cos * across;
      if (px < 40 || py < 40 || px > WORLD_WIDTH - 40 || py > WORLD_HEIGHT - 40) return false;
      if (buildingIndexAt(world, px, py) >= 0) return false;
      if (world.nav.isBlocked(px, py)) return false;
    }
  }
  return true;
}

/**
 * Can the van drive from the edge to this spot without going through anything?
 *
 * Walked in steps rather than trusted to one ray: `hasWallClearPath` down the
 * centre line says nothing about the van's shoulders, and a lane that threads
 * between two buildings with a metre to spare is one it cannot actually take.
 * Both flanks are swept as well as the middle.
 *
 * **The run is measured from inside the perimeter, not from off the map.** The
 * boundary wall is in the wall grid, so a ray from an off-map entry point to
 * anywhere at all crosses it and `hasWallClearPath` says no — which rejected
 * every candidate on every lane, and quietly dropped the old patrol car onto
 * its unchecked fallback every single time. The van comes through the cordon;
 * the cordon is not what it has to miss.
 */
function laneClear(
  world: World,
  entry: { x: number; y: number },
  spot: { x: number; y: number },
): boolean {
  const dx = spot.x - entry.x;
  const dy = spot.y - entry.y;
  const full = Math.hypot(dx, dy);
  if (full < 1) return false;
  const ux = dx / full;
  const uy = dy / full;
  const hw = VAN_WIDTH / 2 + VAN_LANE_CLEARANCE / 2;

  // Where the run actually starts: the first point past the perimeter wall.
  const inset = VAN_ENTRY_OFFSET + BOUNDARY_THICKNESS + VAN_WIDTH / 2;
  if (inset >= full) return false;
  const fromX = entry.x + ux * inset;
  const fromY = entry.y + uy * inset;
  const len = full - inset;

  for (const across of [-hw, 0, hw]) {
    const ox = -uy * across;
    const oy = ux * across;
    if (!hasWallClearPath(world, fromX + ox, fromY + oy, spot.x + ox, spot.y + oy)) return false;
  }

  for (let d = 0; d <= len; d += VAN_LANE_STEP) {
    const cx = fromX + ux * d;
    const cy = fromY + uy * d;
    for (const across of [-hw, 0, hw]) {
      const px = cx - uy * across;
      const py = cy + ux * across;
      if (px < 0 || py < 0 || px > WORLD_WIDTH || py > WORLD_HEIGHT) continue;
      if (buildingIndexAt(world, px, py) >= 0) return false;
    }
  }
  return true;
}

/**
 * Where the van stops: just inside the map edge, on open ground, on a side it
 * can actually reach the city from.
 *
 * It does **not** drive to you. A van threading a city to arrive at your
 * shoulder is both a hard pathing problem and the wrong picture — what should
 * happen is that it pulls up at the cordon and the crew come the rest of the
 * way on foot, which is also the bit worth watching.
 *
 * Two rules on top of that. It never comes in **through a building**, checked
 * for the whole body rather than for a point; and it never comes in on the
 * **side the outbreak walked in from**, because backup arriving out of the
 * breach is backup arriving through the horde, and it reads as the game
 * spawning your reinforcements in the worst place on the map on purpose.
 */
function parkingSpot(
  world: World,
  x: number,
  y: number,
): { spot: { x: number; y: number }; entry: { x: number; y: number } } {
  const sides: Side[] = ([0, 1, 2, 3] as Side[])
    .filter((s) => s !== world.outbreakSide)
    .sort((a, b) => distanceToSide(a, x, y) - distanceToSide(b, x, y));

  let fallback: { spot: { x: number; y: number }; entry: { x: number; y: number } } | null = null;

  for (const side of sides) {
    const along = side === 0 || side === 2 ? x : y;
    for (const offset of VAN_LANE_OFFSETS) {
      const entry = entryOn(side, along + offset);
      const dx = x - entry.x;
      const dy = y - entry.y;
      const len = Math.hypot(dx, dy) || 1;
      const facing = Math.atan2(dy, dx);

      for (let d = VAN_ENTRY_OFFSET + VAN_PARK_MIN; d <= VAN_ENTRY_OFFSET + VAN_PARK_MAX; d += 24) {
        const px = entry.x + (dx / len) * d;
        const py = entry.y + (dy / len) * d;
        if (px < 60 || py < 60 || px > WORLD_WIDTH - 60 || py > WORLD_HEIGHT - 60) break;
        if (!world.nav.isReachable(px, py)) continue;
        if (!vanFits(world, px, py, facing)) continue;
        if (!laneClear(world, entry, { x: px, y: py })) continue;
        return { spot: { x: px, y: py }, entry };
      }

      // Nothing on this lane clears the whole way in, but somewhere on it the
      // van still *fits* — worth remembering, since a van that pulls up short
      // of a blocked street is far better than one that parks in a shop. The
      // rule it gives up on is the lane, never the footprint.
      if (!fallback) {
        for (let d = VAN_ENTRY_OFFSET + VAN_PARK_MIN; d <= VAN_ENTRY_OFFSET + VAN_PARK_MAX; d += 24) {
          const px = entry.x + (dx / len) * d;
          const py = entry.y + (dy / len) * d;
          if (px < 70 || py < 70 || px > WORLD_WIDTH - 70 || py > WORLD_HEIGHT - 70) break;
          if (!vanFits(world, px, py, facing)) continue;
          fallback = { spot: { x: px, y: py }, entry };
          break;
        }
      }
    }
  }

  if (fallback) return fallback;

  // Nowhere on any allowed side has room for the body of the van, which takes
  // a remarkable city. Take the nearest allowed edge and creep in along it
  // until something is at least walkable — the footprint rule is the one that
  // must not be broken, so this walks *outwards* from the kerb rather than
  // dropping it at a fixed distance and hoping.
  const side = sides[0] ?? 0;
  const entry = entryOn(side, side === 0 || side === 2 ? x : y);
  const dx = x - entry.x;
  const dy = y - entry.y;
  const len = Math.hypot(dx, dy) || 1;
  const facing = Math.atan2(dy, dx);
  let best = {
    x: Math.max(70, Math.min(WORLD_WIDTH - 70, entry.x + (dx / len) * (VAN_ENTRY_OFFSET + VAN_PARK_MIN))),
    y: Math.max(70, Math.min(WORLD_HEIGHT - 70, entry.y + (dy / len) * (VAN_ENTRY_OFFSET + VAN_PARK_MIN))),
  };
  for (let d = VAN_ENTRY_OFFSET + VAN_PARK_MIN; d <= VAN_ENTRY_OFFSET + VAN_PARK_MAX; d += 24) {
    const px = entry.x + (dx / len) * d;
    const py = entry.y + (dy / len) * d;
    if (px < 70 || py < 70 || px > WORLD_WIDTH - 70 || py > WORLD_HEIGHT - 70) break;
    if (buildingIndexAt(world, px, py) >= 0) continue;
    best = { x: px, y: py };
    if (vanFits(world, px, py, facing)) break;
  }
  return { spot: best, entry };
}

/**
 * Call it in. The bubble over the caller and the crackle back from their hip
 * are the whole of the feedback: the van is a long way off and won't be seen
 * for several seconds, so without them picking the radio up does nothing at
 * all as far as the player can tell.
 */
export function callBackup(world: World, caller: Entity, now: number): void {
  const { spot, entry } = parkingSpot(world, caller.x, caller.y);

  world.vans.set(`van-${counter}`, {
    id: `van-${counter++}`,
    x: entry.x,
    y: entry.y,
    targetX: spot.x,
    targetY: spot.y,
    facing: Math.atan2(spot.y - entry.y, spot.x - entry.x),
    phase: 'inbound',
    callerId: caller.id,
    dropped: 0,
    nextDropAt: 0,
  });

  world.speech.set(caller.id, { text: RADIO_CALL_LINE, until: now + RADIO_SPEECH_MS });
  world.radioReplies.push({ id: caller.id, at: now + RADIO_REPLY_DELAY_MS });
}

/**
 * One of the crew, out of the van and looking for whoever called.
 *
 * The shield is a real one on a real inventory rather than a drawing: the
 * grab-denial in `updateZombie` and the band on the body in `toWire` both read
 * `inv.shield`, so putting one in the bag is the whole of giving them one.
 */
function unload(world: World, van: SwatVan, now: number): void {
  const spawn = findSpawnNear(world, van.x, van.y, ENTITY_RADIUS.officer, 80);
  const id = `swat-${counter++}`;
  world.entities.set(id, makeEntity(id, 'officer', spawn.x, spawn.y));
  const state = newAiState(now, spawn.x, spawn.y);
  // Sent to a specific person, and they stay with them — unlike the grey
  // officers already on the map, who only close in while the radio is out.
  state.escortId = van.callerId;
  world.ai.set(id, state);

  const inv = newInventory();
  inv.utilities.push('riotShield');
  inv.shield = SHIELD_POINTS;
  inv.shieldUp = true;
  world.inventories.set(id, inv);

  world.swat.add(id);
  world.materializeUntil.set(id, now + 400);
}

export function updateSwatVans(world: World, now: number, dt: number): void {
  // The radio answers a beat after the call, from the caller's own hip.
  for (let i = world.radioReplies.length - 1; i >= 0; i--) {
    const reply = world.radioReplies[i];
    if (now < reply.at) continue;
    world.radioReplies.splice(i, 1);
    const caller = world.entities.get(reply.id);
    if (!caller) continue;
    world.speech.set(reply.id, {
      text: RADIO_REPLY_LINE,
      until: now + RADIO_SPEECH_MS,
      radio: true,
    });
  }

  for (const van of world.vans.values()) {
    if (van.phase === 'parked') {
      if (van.dropped >= RADIO_BACKUP_COUNT || now < van.nextDropAt) continue;
      unload(world, van, now);
      van.dropped++;
      van.nextDropAt = now + VAN_DOOR_INTERVAL_MS;
      continue;
    }

    const dx = van.targetX - van.x;
    const dy = van.targetY - van.y;
    const dist = Math.hypot(dx, dy);
    if (dist < VAN_ARRIVE_DIST) {
      van.phase = 'parked';
      van.nextDropAt = now + 500;
      continue;
    }
    van.facing = Math.atan2(dy, dx);
    van.x += (dx / dist) * VAN_SPEED * dt;
    van.y += (dy / dist) * VAN_SPEED * dt;
  }
}

/**
 * The van is solid to bodies but not to sight or gunfire — the same trade the
 * sandbags make, and for the same reason: it is cover you can shoot over, and
 * routes are planned as though it weren't there so whoever walks into one
 * deals with it. Deliberately not in the nav grid, and it can't be destroyed.
 */
export function vanBox(van: SwatVan): OrientedBox {
  return { x: van.x, y: van.y, hw: VAN_LENGTH / 2, hh: VAN_WIDTH / 2, angle: van.facing };
}

export function resolveVanCollisions(world: World): void {
  if (world.vans.size === 0) return;
  for (const van of world.vans.values()) {
    if (van.phase !== 'parked') continue; // still driving in; nothing to bump
    const box = vanBox(van);
    for (const e of world.entities.values()) resolveCircleBox(e, box);
  }
}

export function vansToWire(world: World): SwatVanState[] {
  return [...world.vans.values()].map((v) => ({
    x: Math.round(v.x),
    y: Math.round(v.y),
    facing: v.facing,
    parked: v.phase === 'parked',
  }));
}
