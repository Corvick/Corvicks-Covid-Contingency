import type { PoliceCarState } from '../../shared/types.js';
import {
  CAR_ARRIVE_DIST,
  CAR_DOOR_INTERVAL_MS,
  CAR_PARK_MAX,
  CAR_PARK_MIN,
  CAR_PARK_SAMPLES,
  CAR_SPEED,
  ENTITY_RADIUS,
  RADIO_BACKUP_COUNT,
  RADIO_CALL_LINE,
  RADIO_REPLY_DELAY_MS,
  RADIO_REPLY_LINE,
  RADIO_SPEECH_MS,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from '../../shared/constants.js';
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
  if (side === 0) return { x, y: -200 };
  if (side === 1) return { x: WORLD_WIDTH + 200, y };
  if (side === 2) return { x, y: WORLD_HEIGHT + 200 };
  return { x: -200, y };
}

/**
 * Somewhere near the caller that a car could plausibly have driven to.
 *
 * The test is a clear straight line from off the map, which is a cheap stand-in
 * for "down a street": the city is blocks with roads between them, so the spots
 * with an unobstructed run to the edge are overwhelmingly the roads. It avoids
 * needing a road list the generator doesn't keep, and it fails safe — if
 * nothing has a clear run, the car parks at the edge and the crew walk in.
 */
function parkingSpot(world: World, x: number, y: number): { spot: { x: number; y: number }; entry: { x: number; y: number } } {
  let fallback: { spot: { x: number; y: number }; entry: { x: number; y: number } } | null = null;

  for (let i = 0; i < CAR_PARK_SAMPLES; i++) {
    const angle = (i / CAR_PARK_SAMPLES) * Math.PI * 2;
    const reach = CAR_PARK_MIN + Math.random() * (CAR_PARK_MAX - CAR_PARK_MIN);
    const px = Math.max(60, Math.min(WORLD_WIDTH - 60, x + Math.cos(angle) * reach));
    const py = Math.max(60, Math.min(WORLD_HEIGHT - 60, y + Math.sin(angle) * reach));
    if (world.nav.isBlocked(px, py) || !world.nav.isReachable(px, py)) continue;

    const entry = edgePointFor(px, py);
    const candidate = { spot: { x: px, y: py }, entry };
    fallback ??= candidate;
    if (hasWallClearPath(world, entry.x, entry.y, px, py)) return candidate;
  }

  return fallback ?? { spot: { x, y }, entry: edgePointFor(x, y) };
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

export function carsToWire(world: World): PoliceCarState[] {
  return [...world.cars.values()].map((c) => ({
    x: Math.round(c.x),
    y: Math.round(c.y),
    facing: c.facing,
    parked: c.phase === 'parked',
  }));
}
