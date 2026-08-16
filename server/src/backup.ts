import type { BackupVehicleState } from '../../shared/types.js';
import {
  BACKUP_ARRIVE_DIST,
  BACKUP_DOOR_INTERVAL_MS,
  BACKUP_DOOR_SWING_MS,
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
  KEVLAR_POINTS,
  RADIO_BACKUP_COUNT,
  RADIO_CALL_LINE,
  RADIO_CAR_BACKUP_COUNT,
  RADIO_REPLY_DELAY_MS,
  RADIO_REPLY_LINE,
  RADIO_SPEECH_MS,
  RIFLEMAN_RIFLE_AMMO,
  SWAT_RIFLE_AMMO,
  SHIELD_POINTS,
  VAN_APPROACH_SPEED,
  VAN_BRAKE_DIST,
  VAN_BRAKE_SPEED_MIN,
  VAN_DRIFT,
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
  /**
   * Which way it washes out as it stops, and how far. Picked at call time and
   * checked then, so the spot it actually comes to rest on is one that has
   * been through `bodyFits` like any other.
   */
  driftDir: number;
  drift: number;
  /** Who called it. The crew no longer escort them, but the van remembers. */
  callerId: string;
  dropped: number;
  nextDropAt: number;
  /** How far the back doors and the cab door have swung, 0-1. */
  rearOpen: number;
  cabOpen: number;
  /** The one who leads the squad away, once they are all out. */
  leaderId: string | null;
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

  // Which way it washes out, decided here rather than while it is moving: the
  // spot it comes to rest on is offset from the one that was checked, so it
  // has to be checked too. Either side will do, so try both and only then give
  // the drift up — a van that arrives dead straight is the old behaviour and
  // is exactly what this is for.
  let driftDir = Math.random() < 0.5 ? 1 : -1;
  let drift = kind === 'van' ? VAN_DRIFT : 0;
  if (drift > 0) {
    const nx = -Math.sin(heading);
    const ny = Math.cos(heading);
    const rests = (dir: number): boolean =>
      bodyFits(world, spot.x + nx * drift * dir, spot.y + ny * drift * dir, heading) &&
      bodyFits(world, spot.x + nx * drift * dir * 0.5, spot.y + ny * drift * dir * 0.5, heading);
    if (!rests(driftDir)) driftDir = -driftDir;
    if (!rests(driftDir)) drift = 0;
  }

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
    driftDir,
    drift,
    callerId: caller.id,
    dropped: 0,
    nextDropAt: 0,
    rearOpen: 0,
    cabOpen: 0,
    leaderId: null,
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
  world.ai.set(id, state);
  world.dispatched.add(id);
  world.materializeUntil.set(id, now + 400);

  // The one out of the cab is the driver, and a driver is not a SWAT operator
  // — ordinary uniform, ordinary aim. Everyone out of the back is.
  const isDriver = vehicle.kind === 'van' && vehicle.dropped >= RADIO_BACKUP_COUNT;

  // **The driver stays with the van.** He is not a fighting unit and following
  // a squad about is not what a driver does; parked on the corner beside his
  // own vehicle he is a sentry and a landmark at once.
  if (isDriver) {
    state.guardX = vehicle.x;
    state.guardY = vehicle.y;
    return;
  }

  // Everyone else is a sweep team. The first one out leads and the rest keep
  // station on him — they do **not** escort whoever made the call. A squad
  // standing at your shoulder is four rifles doing nothing; a squad walking
  // the city is what you actually asked for when you picked the handset up.
  if (vehicle.leaderId === null) {
    vehicle.leaderId = id;
    state.squadSlot = 0;
    state.sweeps = true;
    // Start the formation's bearing where he is already pointing, or it eases
    // in from zero and the whole squad swings round once on the first corner.
    state.squadBearing = state.heading;
  } else {
    state.squadSlot = vehicle.dropped;
    state.escortId = vehicle.leaderId;
  }

  // A real gun with real rounds in it, in a real gun slot. Everything reads
  // off that afterwards: `officerGrade` takes its damage and reach from the
  // item, the wire takes the shouldered-rifle profile from it, and running dry
  // is the slot emptying rather than a special case anywhere.
  if (vehicle.kind === 'car') {
    // Still tracked, so anything that wants to know where a crew came from
    // still can — but grey is grey now and they shoot like any other grey
    // officer. See `officerGrade`.
    world.riflemen.add(id);
    // No rifle any more: a grey officer carries the sidearm every grey officer
    // carries. Leaving a bolt action in the bag would still put a shouldered
    // rifle on the wire and on the body, which is the drawing claiming
    // something `officerGrade` no longer does.
    world.inventories.set(id, newInventory());
    return;
  }

  world.swat.add(id);
  const inv = newInventory();
  inv.guns[0] = { item: 'semiAutoRifle', ammo: SWAT_RIFLE_AMMO };
  inv.activeSlot = 1;
  inv.utilities.push('riotShield');
  inv.shield = SHIELD_POINTS;
  inv.shieldUp = true;
  // The one leading carries the set that called this in and the vest to go
  // with it. Kevlar is a real three-grab denial in `resolveGrapple`, not a
  // decoration — losing the leader is how a sweep falls apart, so he is the
  // one wearing it.
  if (state.squadSlot === 0) {
    inv.kevlar = KEVLAR_POINTS;
    inv.utilities.push('kevlar');
    world.squadLeads.add(id);
  }
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
    // Doors swing rather than snap, and they stay open afterwards — an emptied
    // van standing there with its back doors hanging open is the whole story
    // of what happened on that corner, told without anybody watching it.
    const swing = (dt * 1000) / BACKUP_DOOR_SWING_MS;
    if (vehicle.rearOpen > 0) vehicle.rearOpen = Math.min(1, vehicle.rearOpen + swing);
    if (vehicle.cabOpen > 0) vehicle.cabOpen = Math.min(1, vehicle.cabOpen + swing);

    if (vehicle.phase === 'parked') {
      if (vehicle.dropped >= crewSize(vehicle.kind) || now < vehicle.nextDropAt) continue;
      // The door goes first and the body follows, which is the right way round
      // and also gives the swing something to happen during.
      const driver = vehicle.kind === 'van' && vehicle.dropped >= RADIO_BACKUP_COUNT;
      if (vehicle.kind === 'van') {
        if (driver && vehicle.cabOpen === 0) {
          vehicle.cabOpen = 0.001;
          vehicle.nextDropAt = now + BACKUP_DOOR_SWING_MS;
          continue;
        }
        if (!driver && vehicle.rearOpen === 0) {
          vehicle.rearOpen = 0.001;
          vehicle.nextDropAt = now + BACKUP_DOOR_SWING_MS;
          continue;
        }
      } else if (vehicle.cabOpen === 0) {
        // The car's two doors go together — one either side, both at the
        // cabin, which is where `seatFor` puts the pair getting out of it.
        vehicle.cabOpen = 0.001;
        vehicle.nextDropAt = now + BACKUP_DOOR_SWING_MS;
        continue;
      }
      unload(world, vehicle, now);
      vehicle.dropped++;
      vehicle.nextDropAt = now + BACKUP_DOOR_INTERVAL_MS;
      continue;
    }

    // Distance still to run *along the approach line*, which is the thing the
    // whole stop is parameterised on. Measured along the line rather than
    // straight to the target, because once it starts washing sideways the two
    // are different and only the first one is monotonic.
    const along =
      (vehicle.targetX - vehicle.x) * Math.cos(vehicle.heading) +
      (vehicle.targetY - vehicle.y) * Math.sin(vehicle.heading);

    // A car simply drives up and stops. A two-officer patrol arriving is a
    // smaller event than a SWAT team and should read as one.
    if (vehicle.kind === 'car') {
      if (along < BACKUP_ARRIVE_DIST) {
        vehicle.phase = 'parked';
        vehicle.nextDropAt = now + 500;
        continue;
      }
      vehicle.x += Math.cos(vehicle.heading) * BACKUP_SPEED * dt;
      vehicle.y += Math.sin(vehicle.heading) * BACKUP_SPEED * dt;
      continue;
    }

    // A van comes in hot and stops like it: straight in, then the brakes go on
    // `VAN_BRAKE_DIST` out and it washes sideways while the back end comes
    // round, and stops there. Three things are moving at once and they are
    // deliberately separate — how fast it is going, how far it has slid off
    // the line, and which way the body is pointing.
    if (along > VAN_BRAKE_DIST) {
      vehicle.x += Math.cos(vehicle.heading) * VAN_APPROACH_SPEED * dt;
      vehicle.y += Math.sin(vehicle.heading) * VAN_APPROACH_SPEED * dt;
      continue;
    }

    if (vehicle.phase !== 'braking') {
      vehicle.phase = 'braking';
      vehicle.skidX = vehicle.x;
      vehicle.skidY = vehicle.y;
    }

    if (along < BACKUP_ARRIVE_DIST) {
      vehicle.phase = 'parked';
      vehicle.facing = vehicle.heading + VAN_SLEW_ANGLE * vehicle.driftDir;
      vehicle.nextDropAt = now + 500;
      continue;
    }

    // 0 at the moment the brakes bite, 1 at the stop.
    const t = Math.max(0, Math.min(1, 1 - along / VAN_BRAKE_DIST));
    // Eased so most of the speed goes early: it lands on the spot rather than
    // crawling the last stretch.
    const speed =
      VAN_BRAKE_SPEED_MIN + (VAN_APPROACH_SPEED - VAN_BRAKE_SPEED_MIN) * (1 - t) * (1 - t);

    // Smoothstep, so the sideways speed is nearly nothing by the time it
    // stops. That is not only for smoothness: the drawn angle is the travel
    // tangent plus the slew, and a curve still bending at the stop would leave
    // it resting at some other angle than it does now.
    const ease = t * t * (3 - 2 * t);

    // Walk the centre line forward, then place the body that far off it. Doing
    // it this way rather than integrating a turning velocity is what keeps the
    // arrival exactly on the spot that was checked.
    const nx = -Math.sin(vehicle.heading);
    const ny = Math.cos(vehicle.heading);
    const lineX = vehicle.x - nx * vehicle.drift * vehicle.driftDir * ease;
    const lineY = vehicle.y - ny * vehicle.drift * vehicle.driftDir * ease;
    const stepped = speed * dt;
    const nextLineX = lineX + Math.cos(vehicle.heading) * stepped;
    const nextLineY = lineY + Math.sin(vehicle.heading) * stepped;

    const nextAlong = Math.max(0, along - stepped);
    const nt = Math.max(0, Math.min(1, 1 - nextAlong / VAN_BRAKE_DIST));
    const nextEase = nt * nt * (3 - 2 * nt);
    vehicle.x = nextLineX + nx * vehicle.drift * vehicle.driftDir * nextEase;
    vehicle.y = nextLineY + ny * vehicle.drift * vehicle.driftDir * nextEase;

    // The body leads the slide by the slew, swung the way it is washing.
    vehicle.facing = vehicle.heading + VAN_SLEW_ANGLE * vehicle.driftDir * nextEase;
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
      // The tangent it was travelling when the brakes bit, which is the line
      // the marks lie along — *not* the body angle, which has swung off it.
      state.skidAngle = Math.round(v.heading * 100) / 100;
    }
    if (v.phase === 'braking') state.braking = true;
    if (v.rearOpen > 0) state.rearOpen = Math.round(v.rearOpen * 100) / 100;
    if (v.cabOpen > 0) state.cabOpen = Math.round(v.cabOpen * 100) / 100;
    return state;
  });
}
