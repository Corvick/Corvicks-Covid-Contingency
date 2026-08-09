import type { PoliceCarState } from '../../shared/types.js';
import {
  CAR_ARRIVE_DIST,
  CAR_DOOR_INTERVAL_MS,
  CAR_PARK_MAX,
  CAR_PARK_MIN,
  CAR_ENTRY_OFFSET,
  CAR_SPEED,
  CAR_LENGTH,
  CAR_WIDTH,
  ENTITY_RADIUS,
  RADIO_BACKUP_COUNT,
  RADIO_CALL_LINE,
  RADIO_REPLY_DELAY_MS,
  RADIO_REPLY_LINE,
  RADIO_SPEECH_MS,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from '../../shared/constants.js';
import { resolveCircleBox, type OrientedBox } from './geometry.js';
import {
  findSpawnNear,
  hasWallClearPath,
  makeEntity,
  newAiState,
  type Entity,
  type World,
} from './world.js';

/**
 * A squad car answering the radio.
 *
 * This is the helicopter over again with its feet on the ground: something
 * comes in from off the map, stops, puts people out, and the people are what
 * matter. The differences are that a car has to arrive down a street rather
 * than over the rooftops, and that it stays parked afterwards instead of
 * flying off — a wrecked-looking patrol car on the corner is free scenery and
 * a landmark for where your backup came from.
 */
export interface PoliceCar {
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

/** The nearest point off the edge of the map, to drive in from. */
function edgePointFor(x: number, y: number): { x: number; y: number } {
  const dists = [y, WORLD_WIDTH - x, WORLD_HEIGHT - y, x];
  const side = dists.indexOf(Math.min(...dists));
  if (side === 0) return { x, y: -CAR_ENTRY_OFFSET };
  if (side === 1) return { x: WORLD_WIDTH + CAR_ENTRY_OFFSET, y };
  if (side === 2) return { x, y: WORLD_HEIGHT + CAR_ENTRY_OFFSET };
  return { x: -CAR_ENTRY_OFFSET, y };
}

/**
 * Where the car stops: just inside the map edge on the side nearest whoever
 * called, on open ground.
 *
 * It does **not** drive to you. A squad car threading a city to arrive at your
 * shoulder is both a hard pathing problem and the wrong picture — what should
 * happen is that it pulls up at the cordon and the crew come the rest of the
 * way on foot, which is also the bit worth watching.
 */
function parkingSpot(
  world: World,
  x: number,
  y: number,
): { spot: { x: number; y: number }; entry: { x: number; y: number } } {
  const entry = edgePointFor(x, y);
  // Walk in from the edge along the line to the caller until the ground is
  // clear — the perimeter wall is the first thing in the way, always.
  const dx = x - entry.x;
  const dy = y - entry.y;
  const len = Math.hypot(dx, dy) || 1;

  // Distances are from the boundary, not from the off-map entry point.
  for (let d = CAR_ENTRY_OFFSET + CAR_PARK_MIN; d <= CAR_ENTRY_OFFSET + CAR_PARK_MAX; d += 20) {
    const px = Math.max(60, Math.min(WORLD_WIDTH - 60, entry.x + (dx / len) * d));
    const py = Math.max(60, Math.min(WORLD_HEIGHT - 60, entry.y + (dy / len) * d));
    if (world.nav.isBlocked(px, py) || !world.nav.isReachable(px, py)) continue;
    if (!hasWallClearPath(world, entry.x, entry.y, px, py)) continue;
    return { spot: { x: px, y: py }, entry };
  }

  // Nowhere clear on that bearing: stop at the edge and let them walk it all.
  const back = CAR_ENTRY_OFFSET + CAR_PARK_MIN;
  const px = Math.max(60, Math.min(WORLD_WIDTH - 60, entry.x + (dx / len) * back));
  const py = Math.max(60, Math.min(WORLD_HEIGHT - 60, entry.y + (dy / len) * back));
  return { spot: { x: px, y: py }, entry };
}

/**
 * Call it in. The bubble over the caller and the crackle back from their hip
 * are the whole of the feedback: the car is a long way off and won't be seen
 * for several seconds, so without them picking the radio up does nothing at
 * all as far as the player can tell.
 */
export function callBackup(world: World, caller: Entity, now: number): void {
  const { spot, entry } = parkingSpot(world, caller.x, caller.y);

  world.cars.set(`car-${counter}`, {
    id: `car-${counter++}`,
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

/** One of the crew, out of the car and looking for whoever called. */
function unload(world: World, car: PoliceCar, now: number): void {
  const spawn = findSpawnNear(world, car.x, car.y, ENTITY_RADIUS.officer, 70);
  const id = `backup-${counter++}`;
  world.entities.set(id, makeEntity(id, 'officer', spawn.x, spawn.y));
  const state = newAiState(now, spawn.x, spawn.y);
  // Sent to a specific person, and they stay with them — unlike the grey
  // officers already on the map, who only close in while the radio is out.
  state.escortId = car.callerId;
  world.ai.set(id, state);
  // `soldiers` is already "aims far better", which is exactly what a unit
  // dispatched to you should be against the crowd that made you call.
  world.soldiers.add(id);
  world.materializeUntil.set(id, now + 400);
}

export function updatePoliceCars(world: World, now: number, dt: number): void {
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

  for (const car of world.cars.values()) {
    if (car.phase === 'parked') {
      if (car.dropped >= RADIO_BACKUP_COUNT || now < car.nextDropAt) continue;
      unload(world, car, now);
      car.dropped++;
      car.nextDropAt = now + CAR_DOOR_INTERVAL_MS;
      continue;
    }

    const dx = car.targetX - car.x;
    const dy = car.targetY - car.y;
    const dist = Math.hypot(dx, dy);
    if (dist < CAR_ARRIVE_DIST) {
      car.phase = 'parked';
      car.nextDropAt = now + 500;
      continue;
    }
    car.facing = Math.atan2(dy, dx);
    car.x += (dx / dist) * CAR_SPEED * dt;
    car.y += (dy / dist) * CAR_SPEED * dt;
  }
}

/**
 * The car is solid to bodies but not to sight or gunfire — the same trade the
 * sandbags make, and for the same reason: it is cover you can shoot over, and
 * routes are planned as though it weren't there so whoever walks into one
 * deals with it. Deliberately not in the nav grid, and it can't be destroyed.
 */
export function carBox(car: PoliceCar): OrientedBox {
  return { x: car.x, y: car.y, hw: CAR_LENGTH / 2, hh: CAR_WIDTH / 2, angle: car.facing };
}

export function resolveCarCollisions(world: World): void {
  if (world.cars.size === 0) return;
  for (const car of world.cars.values()) {
    if (car.phase !== 'parked') continue; // still driving in; nothing to bump
    const box = carBox(car);
    for (const e of world.entities.values()) resolveCircleBox(e, box);
  }
}

export function carsToWire(world: World): PoliceCarState[] {
  return [...world.cars.values()].map((c) => ({
    x: Math.round(c.x),
    y: Math.round(c.y),
    facing: c.facing,
    parked: c.phase === 'parked',
  }));
}
