import type { BackupVehicleState } from '../../shared/types.js';
import {
  BACKUP_ARRIVE_DIST,
  BACKUP_DOOR_INTERVAL_MS,
  BACKUP_ENTRY_OFFSET,
  BACKUP_LANE_CLEARANCE,
  BACKUP_LANE_OFFSETS,
  BACKUP_LANE_STEP,
  BACKUP_PARK_MAX,
  BACKUP_PARK_MIN,
  BACKUP_SPEED,
  BOUNDARY_THICKNESS,
  CAR_LENGTH,
  CAR_WIDTH,
  ENTITY_RADIUS,
  RADIO_BACKUP_COUNT,
  RADIO_CALL_LINE,
  RADIO_CAR_BACKUP_COUNT,
  RADIO_REPLY_DELAY_MS,
  RADIO_REPLY_LINE,
  RADIO_SPEECH_MS,
  SHIELD_POINTS,
  VAN_APPROACH_SPEED,
  VAN_BRAKE_DIST,
  VAN_BRAKE_SPEED_MIN,
  VAN_LENGTH,
  VAN_SLEW_ANGLE,
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
 * Whatever the radio sent.
 *
 * This is the helicopter over again with its feet on the ground: something
 * comes in from off the map, stops, puts people out, and the people are what
 * matter. The differences are that it has to arrive down a street rather than
 * over the rooftops, and that it stays parked afterwards instead of flying off
 * — a vehicle on the corner is free scenery and a landmark for where your
 * backup came from.
 *
 * Two kinds, and which one turns up is the radio's business rather than this
 * module's: a SWAT van with a team in the back for the first call, a patrol
 * car with two riflemen for the two after it.
 */
export interface BackupVehicle {
  id: string;
  kind: 'van' | 'car';
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  /**
   * The way the body is pointing, which during a hard stop is *not* the way it
   * is travelling. `heading` is the line it came in on and the one it keeps
   * sliding down; `facing` swings off it as the back end comes round.
   */
  facing: number;
  heading: number;
  phase: 'inbound' | 'braking' | 'parked';
  /** Where the brakes went on, so the tyre marks have a start. */
  skidX: number | null;
  skidY: number | null;
  /** Who called it, so the crew knows whose shoulder to stand at. */
  callerId: string;
  dropped: number;
  nextDropAt: number;
}

let counter = 0;

/** N, E, S, W — the same numbering the outbreak's breach side uses. */
type Side = 0 | 1 | 2 | 3;

function sizeOf(kind: 'van' | 'car'): { length: number; width: number } {
  return kind === 'van'
    ? { length: VAN_LENGTH, width: VAN_WIDTH }
    : { length: CAR_LENGTH, width: CAR_WIDTH };
}

/**
 * Where it drives in from, given a side and how far along that side.
 *
 * `along` is a world coordinate on the free axis: an x for the north and south
 * edges, a y for the east and west ones.
 */
function entryOn(side: Side, along: number): { x: number; y: number } {
  const x = Math.max(80, Math.min(WORLD_WIDTH - 80, along));
  const y = Math.max(80, Math.min(WORLD_HEIGHT - 80, along));
  if (side === 0) return { x, y: -BACKUP_ENTRY_OFFSET };
  if (side === 1) return { x: WORLD_WIDTH + BACKUP_ENTRY_OFFSET, y };
  if (side === 2) return { x, y: WORLD_HEIGHT + BACKUP_ENTRY_OFFSET };
  return { x: -BACKUP_ENTRY_OFFSET, y };
}

/** How far a point is from a given edge, for ranking which side is nearest. */
function distanceToSide(side: Side, x: number, y: number): number {
  if (side === 0) return y;
  if (side === 1) return WORLD_WIDTH - x;
  if (side === 2) return WORLD_HEIGHT - y;
  return x;
}

/**
 * Is there room for the body, centred here and lying along `facing`?
 *
 * The old patrol car asked `nav.isBlocked` at a single point, which a body 82
 * by 38 walks straight past — half of it can be inside a shop while its centre
 * stands in the street. This tests the corners and the flanks, and
 * `buildingIndexAt` as well as the nav grid, because "not in a building" is
 * the thing actually being asked and a doorway is walkable nav.
 *
 * Always sized off the **van**, whichever is actually coming: the van is the
 * wider of the two and a spot that fits it fits the car, which keeps one lane
 * test honest for both and means the two arrive down the same sort of street.
 */
function bodyFits(world: World, x: number, y: number, facing: number): boolean {
  const cos = Math.cos(facing);
  const sin = Math.sin(facing);
  const hl = VAN_LENGTH / 2;
  const hw = VAN_WIDTH / 2 + BACKUP_LANE_CLEARANCE / 2;

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
 * Can it drive from the edge to this spot without going through anything?
 *
 * Walked in steps rather than trusted to one ray: `hasWallClearPath` down the
 * centre line says nothing about the shoulders, and a lane that threads
 * between two buildings with a metre to spare is one it cannot actually take.
 * Both flanks are swept as well as the middle.
 *
 * **The run is measured from inside the perimeter, not from off the map.** The
 * boundary wall is in the wall grid, so a ray from an off-map entry point to
 * anywhere at all crosses it and `hasWallClearPath` says no — which rejected
 * every candidate on every lane, and quietly dropped the old patrol car onto
 * its unchecked fallback every single time. It comes through the cordon; the
 * cordon is not what it has to miss.
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
  const hw = VAN_WIDTH / 2 + BACKUP_LANE_CLEARANCE / 2;

  // Where the run actually starts: the first point past the perimeter wall.
  const inset = BACKUP_ENTRY_OFFSET + BOUNDARY_THICKNESS + VAN_WIDTH / 2;
  if (inset >= full) return false;
  const fromX = entry.x + ux * inset;
  const fromY = entry.y + uy * inset;
  const len = full - inset;

  for (const across of [-hw, 0, hw]) {
    const ox = -uy * across;
    const oy = ux * across;
    if (!hasWallClearPath(world, fromX + ox, fromY + oy, spot.x + ox, spot.y + oy)) return false;
  }

  for (let d = 0; d <= len; d += BACKUP_LANE_STEP) {
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
 * Where it stops: just inside the map edge, on open ground, on a side it can
 * actually reach the city from.
 *
 * It does **not** drive to you. Anything threading a city to arrive at your
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
    for (const offset of BACKUP_LANE_OFFSETS) {
      const entry = entryOn(side, along + offset);
      const dx = x - entry.x;
      const dy = y - entry.y;
      const len = Math.hypot(dx, dy) || 1;
      const facing = Math.atan2(dy, dx);

      for (
        let d = BACKUP_ENTRY_OFFSET + BACKUP_PARK_MIN;
        d <= BACKUP_ENTRY_OFFSET + BACKUP_PARK_MAX;
        d += 24
      ) {
        const px = entry.x + (dx / len) * d;
        const py = entry.y + (dy / len) * d;
        if (px < 60 || py < 60 || px > WORLD_WIDTH - 60 || py > WORLD_HEIGHT - 60) break;
        if (!world.nav.isReachable(px, py)) continue;
        if (!bodyFits(world, px, py, facing)) continue;
        if (!laneClear(world, entry, { x: px, y: py })) continue;
        return { spot: { x: px, y: py }, entry };
      }

      // Nothing on this lane clears the whole way in, but somewhere on it the
      // body still *fits* — worth remembering, since pulling up short of a
      // blocked street is far better than parking in a shop. The rule it gives
      // up on is the lane, never the footprint.
      if (!fallback) {
        for (
          let d = BACKUP_ENTRY_OFFSET + BACKUP_PARK_MIN;
          d <= BACKUP_ENTRY_OFFSET + BACKUP_PARK_MAX;
          d += 24
        ) {
          const px = entry.x + (dx / len) * d;
          const py = entry.y + (dy / len) * d;
          if (px < 70 || py < 70 || px > WORLD_WIDTH - 70 || py > WORLD_HEIGHT - 70) break;
          if (!bodyFits(world, px, py, facing)) continue;
          fallback = { spot: { x: px, y: py }, entry };
          break;
        }
      }
    }
  }

  if (fallback) return fallback;

  // Nowhere on any allowed side has room for a whole vehicle, which takes a
  // remarkable city. Take the nearest allowed edge and creep in along it until
  // something is at least walkable — the footprint rule is the one that must
  // not be broken, so this walks *outwards* from the kerb rather than dropping
  // it at a fixed distance and hoping.
  const side = sides[0] ?? 0;
  const entry = entryOn(side, side === 0 || side === 2 ? x : y);
  const dx = x - entry.x;
  const dy = y - entry.y;
  const len = Math.hypot(dx, dy) || 1;
  const facing = Math.atan2(dy, dx);
  let best = {
    x: Math.max(
      70,
      Math.min(WORLD_WIDTH - 70, entry.x + (dx / len) * (BACKUP_ENTRY_OFFSET + BACKUP_PARK_MIN)),
    ),
    y: Math.max(
      70,
      Math.min(WORLD_HEIGHT - 70, entry.y + (dy / len) * (BACKUP_ENTRY_OFFSET + BACKUP_PARK_MIN)),
    ),
  };
  for (
    let d = BACKUP_ENTRY_OFFSET + BACKUP_PARK_MIN;
    d <= BACKUP_ENTRY_OFFSET + BACKUP_PARK_MAX;
    d += 24
  ) {
    const px = entry.x + (dx / len) * d;
    const py = entry.y + (dy / len) * d;
    if (px < 70 || py < 70 || px > WORLD_WIDTH - 70 || py > WORLD_HEIGHT - 70) break;
    if (buildingIndexAt(world, px, py) >= 0) continue;
    best = { x: px, y: py };
    if (bodyFits(world, px, py, facing)) break;
  }
  return { spot: best, entry };
}

/**
 * Call it in. The bubble over the caller and the crackle back from their hip
 * are the whole of the feedback: it is a long way off and won't be seen for
 * several seconds, so without them working the handset does nothing at all as
 * far as the player can tell.
 */
export function callBackup(
  world: World,
  caller: Entity,
  now: number,
  kind: 'van' | 'car' = 'van',
): void {
  const { spot, entry } = parkingSpot(world, caller.x, caller.y);
  const heading = Math.atan2(spot.y - entry.y, spot.x - entry.x);

  world.vehicles.set(`backup-${counter}`, {
    id: `backup-${counter++}`,
    kind,
    x: entry.x,
    y: entry.y,
    targetX: spot.x,
    targetY: spot.y,
    facing: heading,
    heading,
    phase: 'inbound',
    skidX: null,
    skidY: null,
    callerId: caller.id,
    dropped: 0,
    nextDropAt: 0,
  });

  world.speech.set(caller.id, { text: RADIO_CALL_LINE, until: now + RADIO_SPEECH_MS });
  world.radioReplies.push({ id: caller.id, at: now + RADIO_REPLY_DELAY_MS });
}

/** How many bodies come out of each kind, the driver included. */
function crewSize(kind: 'van' | 'car'): number {
  return kind === 'van' ? RADIO_BACKUP_COUNT + 1 : RADIO_CAR_BACKUP_COUNT;
}

/**
 * Where the next one out steps down, in the vehicle's own frame: how far along
 * its length, and how far off its centre line.
 *
 * The van empties out of the **back** — that is where the doors are and where
 * a team actually comes from — and the driver gets out last, at the front on
 * the left. That ordering matters more than it looks: the team piling out of
 * the tail while the cab is still shut is the picture, and a driver who
 * appears first is a driver who was never driving.
 */
function seatFor(kind: 'van' | 'car', index: number): { along: number; across: number } {
  if (kind === 'car') {
    // Two doors, one each side, both at the cabin.
    return { along: -2, across: index === 0 ? -1 : 1 };
  }
  if (index >= RADIO_BACKUP_COUNT) return { along: 1, across: -1 }; // the driver
  return { along: -1, across: index % 2 === 0 ? -0.45 : 0.45 };
}

/**
 * One of the crew, out and looking for whoever called.
 *
 * The shield is a real one on a real inventory rather than a drawing: the
 * grab-denial in `updateZombie` and the band on the body in `toWire` both read
 * `inv.shield`, so putting one in the bag is the whole of giving them one.
 */
/**
 * Somewhere to stand at the door you just came out of.
 *
 * `findSpawnNear` is the wrong tool here and was the first thing tried: it
 * scatters in a *random direction* out to its range, so a team meant to be
 * piling out of the back door turned up spread around the whole vehicle and
 * the driver could arrive behind it. This holds the side it was given —
 * nudged outward along the same bearing when the exact spot is blocked, and
 * only widened into a proper search if the whole side is against a wall.
 */
function stepDown(
  world: World,
  vehicle: BackupVehicle,
  x: number,
  y: number,
): { x: number; y: number } {
  const away = Math.atan2(y - vehicle.y, x - vehicle.x);
  for (const out of [0, 12, 24, 36]) {
    for (const swing of [0, 0.4, -0.4, 0.8, -0.8]) {
      const px = x + Math.cos(away + swing) * out;
      const py = y + Math.sin(away + swing) * out;
      if (px < 40 || py < 40 || px > WORLD_WIDTH - 40 || py > WORLD_HEIGHT - 40) continue;
      if (!world.nav.isBlocked(px, py) && world.nav.isReachable(px, py)) return { x: px, y: py };
    }
  }
  return findSpawnNear(world, x, y, ENTITY_RADIUS.officer, 60);
}

function unload(world: World, vehicle: BackupVehicle, now: number): void {
  const { length, width } = sizeOf(vehicle.kind);
  const seat = seatFor(vehicle.kind, vehicle.dropped);
  const cos = Math.cos(vehicle.facing);
  const sin = Math.sin(vehicle.facing);
  const outX = vehicle.x + cos * seat.along * (length / 2 + 22) - sin * seat.across * (width / 2 + 18);
  const outY = vehicle.y + sin * seat.along * (length / 2 + 22) + cos * seat.across * (width / 2 + 18);

  const spawn = stepDown(world, vehicle, outX, outY);
  const id = `backup-${counter++}`;
  world.entities.set(id, makeEntity(id, 'officer', spawn.x, spawn.y));
  const state = newAiState(now, spawn.x, spawn.y);
  // Sent to a specific person, and they stay with them — unlike the grey
  // officers already on the map, who only close in while the radio is out.
  state.escortId = vehicle.callerId;
  world.ai.set(id, state);
  world.dispatched.add(id);
  world.materializeUntil.set(id, now + 400);

  // The one out of the cab is the driver, and a driver is not a SWAT operator
  // — ordinary uniform, ordinary aim. Everyone out of the back is.
  const isDriver = vehicle.kind === 'van' && vehicle.dropped >= RADIO_BACKUP_COUNT;
  if (vehicle.kind === 'car') {
    world.riflemen.add(id);
    return;
  }
  if (isDriver) return;

  world.swat.add(id);
  const inv = newInventory();
  inv.utilities.push('riotShield');
  inv.shield = SHIELD_POINTS;
  inv.shieldUp = true;
  world.inventories.set(id, inv);
}

export function updateBackup(world: World, now: number, dt: number): void {
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

  for (const vehicle of world.vehicles.values()) {
    if (vehicle.phase === 'parked') {
      if (vehicle.dropped >= crewSize(vehicle.kind) || now < vehicle.nextDropAt) continue;
      unload(world, vehicle, now);
      vehicle.dropped++;
      vehicle.nextDropAt = now + BACKUP_DOOR_INTERVAL_MS;
      continue;
    }

    const dx = vehicle.targetX - vehicle.x;
    const dy = vehicle.targetY - vehicle.y;
    const dist = Math.hypot(dx, dy);
    if (dist < BACKUP_ARRIVE_DIST) {
      vehicle.phase = 'parked';
      vehicle.nextDropAt = now + 500;
      continue;
    }

    // A van comes in hot and stops like it. Past VAN_BRAKE_DIST the brakes go
    // on, the speed falls away, and the body swings off the line it is still
    // sliding down — the momentum carries straight on while the back end comes
    // round, which is the whole of what a handbrake stop looks like from
    // above. The car simply drives up and stops; a two-officer patrol arriving
    // is a smaller event than a SWAT team and should read as one.
    let speed = BACKUP_SPEED;
    if (vehicle.kind === 'van') {
      if (dist > VAN_BRAKE_DIST) {
        speed = VAN_APPROACH_SPEED;
      } else {
        if (vehicle.phase !== 'braking') {
          vehicle.phase = 'braking';
          vehicle.skidX = vehicle.x;
          vehicle.skidY = vehicle.y;
        }
        // Eased rather than linear: most of the speed goes early, so it lands
        // on the spot rather than crawling the last stretch.
        const t = Math.max(0, Math.min(1, dist / VAN_BRAKE_DIST));
        speed = VAN_BRAKE_SPEED_MIN + (VAN_APPROACH_SPEED - VAN_BRAKE_SPEED_MIN) * (t * t);
        vehicle.facing = vehicle.heading + VAN_SLEW_ANGLE * (1 - t);
      }
    }

    // The line of travel never bends — that is what makes the slew read as a
    // slide rather than as a turn.
    vehicle.x += Math.cos(vehicle.heading) * speed * dt;
    vehicle.y += Math.sin(vehicle.heading) * speed * dt;
  }
}

/**
 * Solid to bodies but not to sight or gunfire — the same trade the sandbags
 * make, and for the same reason: it is cover you can shoot over, and routes
 * are planned as though it weren't there so whoever walks into one deals with
 * it. Deliberately not in the nav grid, and it can't be destroyed.
 */
export function vehicleBox(vehicle: BackupVehicle): OrientedBox {
  const { length, width } = sizeOf(vehicle.kind);
  return { x: vehicle.x, y: vehicle.y, hw: length / 2, hh: width / 2, angle: vehicle.facing };
}

export function resolveVehicleCollisions(world: World): void {
  if (world.vehicles.size === 0) return;
  for (const vehicle of world.vehicles.values()) {
    if (vehicle.phase !== 'parked') continue; // still driving in; nothing to bump
    const box = vehicleBox(vehicle);
    for (const e of world.entities.values()) resolveCircleBox(e, box);
  }
}

export function vehiclesToWire(world: World): BackupVehicleState[] {
  return [...world.vehicles.values()].map((v) => {
    const state: BackupVehicleState = {
      kind: v.kind,
      x: Math.round(v.x),
      y: Math.round(v.y),
      facing: v.facing,
      parked: v.phase === 'parked',
    };
    if (v.skidX !== null && v.skidY !== null) {
      state.skidX = Math.round(v.skidX);
      state.skidY = Math.round(v.skidY);
    }
    return state;
  });
}
