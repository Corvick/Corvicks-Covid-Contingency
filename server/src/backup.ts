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
  CITY_CAR_SPREAD,
  CITY_CAR_OFFICER_GAP,
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
  /**
   * Parked with the lightbar off.
   *
   * A car that came in on a call keeps flashing afterwards — that is most of
   * what makes an arrival readable from a street away a minute later. One that
   * has been sitting in the station car park since before anybody was infected
   * never had a call to answer, and a yard of cars all flashing at nothing
   * reads as three separate incidents rather than as a car park.
   */
  silent: boolean;
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

  // Five by five rather than five by three. The gaps in a three-across sample
  // are 34px wide at the van's clearance, which is enough for the corner of a
  // building to sit between two samples: measured, 1 arrival in 100 came to
  // rest with the body in geometry that this reports as fitting.
  for (const along of [-hl, -hl / 2, 0, hl / 2, hl]) {
    for (const across of [-hw, -hw / 2, 0, hw / 2, hw]) {
      const px = x + cos * along - sin * across;
      const py = y + sin * along + cos * across;
      if (px < 40 || py < 40 || px > WORLD_WIDTH - 40 || py > WORLD_HEIGHT - 40) return false;
      if (buildingIndexAt(world, px, py) >= 0) return false;
      if (world.nav.isBlocked(px, py)) return false;
    }
  }
  return true;
}

/** Where the run in actually begins: the first point with the whole body past the cordon. */
const LANE_START = BACKUP_ENTRY_OFFSET + BOUNDARY_THICKNESS + VAN_LENGTH;

/**
 * How far down this lane the body can be driven before something stops it.
 *
 * **A forward sweep, not a yes/no on a chosen spot, and that is the whole of
 * the fix for driving through buildings.** Asked as a question about one spot,
 * a refusal has nowhere to go but a fallback — and `parkingSpot` had two of
 * them, both of which picked a place the body *fitted* without ever asking
 * whether it could be reached. Measured over 80 calls with callers spread
 * across the map: **2 drove through a building** and one **parked inside one**,
 * with up to 11 of 25 footprint samples in geometry. Asked as "how far can it
 * get", there is nothing left to fall back to: it stops where it stops.
 *
 * The cross-section is swept rather than the centre line rayed, because a lane
 * that threads between two buildings with a metre to spare is one an 82-by-38
 * body cannot actually take. Consecutive sections overlap — the step is well
 * under the body length — so everything the body sweeps through is tested.
 *
 * `nav.isBlocked` rather than `hasWallClearPath`: it is strictly the wider
 * test, covering free-standing walls, intact glass and the pond as well as
 * buildings, and it is the same test `bodyFits` uses, so a lane and a place to
 * stop on it cannot disagree.
 *
 * **The run is measured from inside the perimeter.** The boundary wall is in
 * the wall grid and the vehicle is meant to come through it; the cordon is not
 * what it has to miss.
 */
function laneReach(
  world: World,
  entry: { x: number; y: number },
  ux: number,
  uy: number,
  maxD: number,
): number {
  const hw = VAN_WIDTH / 2 + BACKUP_LANE_CLEARANCE / 2;
  let reached = -1;

  for (let d = LANE_START; d <= maxD; d += BACKUP_LANE_STEP) {
    const cx = entry.x + ux * d;
    const cy = entry.y + uy * d;
    let clear = true;
    for (const across of [-hw, 0, hw]) {
      const px = cx - uy * across;
      const py = cy + ux * across;
      if (px < 40 || py < 40 || px > WORLD_WIDTH - 40 || py > WORLD_HEIGHT - 40) {
        clear = false;
        break;
      }
      if (buildingIndexAt(world, px, py) >= 0 || world.nav.isBlocked(px, py)) {
        clear = false;
        break;
      }
    }
    if (!clear) break;
    reached = d;
  }
  return reached;
}

/**
 * Where it comes to rest on this lane: the first spot at or past
 * `BACKUP_PARK_MIN` that the body fits on, or failing that the deepest spot
 * short of it that it does.
 *
 * Pulling up short of a blocked street is the right answer and always was; the
 * old code agreed and then reached for a fallback that skipped the lane test
 * to do it. Nothing here can return a spot the body could not have driven to.
 */
function stopOnLane(
  world: World,
  entry: { x: number; y: number },
  ux: number,
  uy: number,
  facing: number,
): { x: number; y: number } | null {
  const reach = laneReach(world, entry, ux, uy, BACKUP_ENTRY_OFFSET + BACKUP_PARK_MAX);
  if (reach < 0) return null;

  let best: { x: number; y: number } | null = null;
  for (let d = LANE_START; d <= reach; d += BACKUP_LANE_STEP) {
    const px = entry.x + ux * d;
    const py = entry.y + uy * d;
    if (!bodyFits(world, px, py, facing)) continue;
    best = { x: px, y: py };
    if (d >= BACKUP_ENTRY_OFFSET + BACKUP_PARK_MIN) break;
  }
  return best;
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
  const near: Side[] = ([0, 1, 2, 3] as Side[]).sort(
    (a, b) => distanceToSide(a, x, y) - distanceToSide(b, x, y),
  );
  // The breach side is a preference, not a safety rule: backup arriving out of
  // the horde reads as the game putting your reinforcements in the worst place
  // on the map on purpose, but a lane it can actually drive down beats a side
  // it likes. So the allowed sides are tried in full first, and only then the
  // one it would rather avoid.
  const passes: Side[][] = [near.filter((s) => s !== world.outbreakSide), near];

  for (const sides of passes) {
    for (const side of sides) {
      const along = side === 0 || side === 2 ? x : y;
      for (const offset of BACKUP_LANE_OFFSETS) {
        const entry = entryOn(side, along + offset);
        const dx = x - entry.x;
        const dy = y - entry.y;
        const len = Math.hypot(dx, dy) || 1;
        const ux = dx / len;
        const uy = dy / len;
        const spot = stopOnLane(world, entry, ux, uy, Math.atan2(dy, dx));
        if (spot) return { spot, entry };
      }
    }
  }

  // Nowhere on any side of the map has a lane a vehicle could drive down,
  // which takes a remarkable city — measured at 0 in 80 calls. Park it on the
  // cordon itself, on the nearest edge, where by construction there is nothing
  // to be inside of.
  const side = near[0] ?? 0;
  const entry = entryOn(side, side === 0 || side === 2 ? x : y);
  const dx = x - entry.x;
  const dy = y - entry.y;
  const len = Math.hypot(dx, dy) || 1;
  return {
    spot: { x: entry.x + (dx / len) * LANE_START, y: entry.y + (dy / len) * LANE_START },
    entry,
  };
}

/**
 * Where the body is and which way it points with `along` still to run.
 *
 * The stop is three things moving at once — how fast it is going, how far it
 * has slid off the line, and which way it is pointing — and only the last two
 * are position. Both are a pure function of how much of the braking distance
 * is left, so the curve can be evaluated anywhere on it rather than only
 * integrated forward. That is what lets `callBackup` check the whole slide
 * against the geometry it is about to take place in, using the very same
 * formula the van will follow: written twice, the check and the motion would
 * agree until the day somebody tuned one of them.
 */
function brakePose(
  v: Pick<BackupVehicle, 'targetX' | 'targetY' | 'heading' | 'drift' | 'driftDir'>,
  along: number,
): { x: number; y: number; facing: number } {
  const t = Math.max(0, Math.min(1, 1 - along / VAN_BRAKE_DIST));
  // Smoothstep, so the sideways speed is nearly nothing by the time it stops.
  // Not only for smoothness: the drawn angle is the travel tangent plus the
  // slew, and a curve still bending at the stop would leave it resting at some
  // other angle than it does.
  const ease = t * t * (3 - 2 * t);
  const cos = Math.cos(v.heading);
  const sin = Math.sin(v.heading);
  const off = v.drift * v.driftDir * ease;
  return {
    x: v.targetX - cos * along - sin * off,
    y: v.targetY - sin * along + cos * off,
    facing: v.heading + VAN_SLEW_ANGLE * v.driftDir * ease,
  };
}

/**
 * Can it actually perform this stop here?
 *
 * The straight run in is `laneReach`'s business. This is the last
 * `VAN_BRAKE_DIST` of it, where the body washes `VAN_DRIFT` (52px) sideways
 * and swings `VAN_SLEW_ANGLE` (24°) across — well outside the 15px of slack
 * the lane sweep carries, so the lane being clear says nothing about it. It
 * was the one thing left driving a van through a building: measured, 1 arrival
 * in 80, with 6 of 25 footprint samples in geometry at the worst of it.
 *
 * `stopD` is how far the resting spot is from the entry point, and the part of
 * the curve still short of `LANE_START` is **not** checked. The brakes bite
 * `VAN_BRAKE_DIST` out and the nearest a van ever parks is
 * `BACKUP_PARK_MIN` in, so braking begins 92px *before* the body is clear of
 * the cordon — which is the wall it is supposed to come through. Checked
 * anyway, the boundary wall refuses every slide on every call: measured,
 * **0 of 50** vans kept their skid, and every one arrived dead straight.
 */
function slideFits(
  world: World,
  v: Pick<BackupVehicle, 'targetX' | 'targetY' | 'heading' | 'drift' | 'driftDir'>,
  stopD: number,
): boolean {
  const steps = Math.ceil(VAN_BRAKE_DIST / BACKUP_LANE_STEP);
  for (let i = 0; i <= steps; i++) {
    // Down to and including zero, which is where it comes to rest — the end of
    // the curve is the one point that must not be missed by a step size that
    // does not divide the distance.
    const along = VAN_BRAKE_DIST * (1 - i / steps);
    if (stopD - along < LANE_START) continue; // still coming through the cordon
    const pose = brakePose(v, along);
    if (!bodyFits(world, pose.x, pose.y, pose.facing)) return false;
  }
  return true;
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
    const base = { targetX: spot.x, targetY: spot.y, heading, drift };
    const stopD = Math.hypot(spot.x - entry.x, spot.y - entry.y);
    // The whole slide, not the two points it used to check — the resting spot
    // and its halfway mark say nothing about the swing the body takes to get
    // there, and the swing is what clips the corner of a shop.
    if (!slideFits(world, { ...base, driftDir }, stopD)) driftDir = -driftDir;
    if (!slideFits(world, { ...base, driftDir }, stopD)) drift = 0;
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
    silent: false,
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

/**
 * Stop it, and tell the nav grid it is there.
 *
 * **A parked vehicle goes into the nav grid; a driving one does not.** The
 * comment on `vehicleBox` used to say routes are planned as though it weren't
 * there and whoever walks into one deals with it — which is the sandbags' rule,
 * inherited wholesale, and the reason for it does not carry over. A wall of
 * sandbags is *meant* to be stood at and torn down; a van cannot be destroyed,
 * so there is nothing on the far side of walking into one. What it produced was
 * an officer stepping into the body, being pushed out by `resolveCircleBox`,
 * re-aiming at the same waypoint through it and stepping in again — measured,
 * **5 of 8** officers with somewhere to be on the other side of a parked van
 * never got there.
 *
 * It stays out of `hasLineOfSight` and out of `fire`, which is the trade that
 * actually matters: cover you shoot over.
 *
 * Set on arrival rather than at the call, because until then it is somewhere
 * else — and it is at most a handful of rebuilds a round, on the same
 * `navDirty` path a smashed pane already uses.
 */
function park(world: World, vehicle: BackupVehicle, now: number): void {
  vehicle.phase = 'parked';
  vehicle.nextDropAt = now + 500;
  world.navBlockers.push(vehicleBox(vehicle));
  world.navDirty = true;
}

/**
 * A clear spot beside a parked body, tried in the order offered.
 *
 * Deliberately **not** `findSpawnNear`, which scatters at 40px plus a random
 * reach from its origin — it is a spawn spread, not a nudge, and using it put
 * the officer a median of **116px** from the car he was supposed to be
 * standing beside. Offsets are in the body's own frame: `along` down its
 * length, `across` out of its flank.
 */
export function spotBeside(
  world: World,
  x: number,
  y: number,
  facing: number,
  offers: ReadonlyArray<{ along: number; across: number }>,
): { x: number; y: number } | null {
  const cos = Math.cos(facing);
  const sin = Math.sin(facing);
  for (const o of offers) {
    const px = x + cos * o.along - sin * o.across;
    const py = y + sin * o.along + cos * o.across;
    if (px < 40 || py < 40 || px > WORLD_WIDTH - 40 || py > WORLD_HEIGHT - 40) continue;
    if (buildingIndexAt(world, px, py) >= 0) continue;
    if (world.nav.isBlocked(px, py)) continue;
    return { x: px, y: py };
  }

  // **And a ring when none of the offers works**, which is a car parked with a
  // kerb or a frontage down both flanks. Without it the second item simply was
  // not placed — measured, 1 city in 16 came out with one thing on the tarmac
  // instead of two, which reads as the placement being unreliable rather than
  // as the spot being awkward.
  for (let r = 56; r <= 140; r += 28) {
    for (let i = 0; i < 12; i++) {
      const t = (i / 12) * Math.PI * 2;
      const px = x + Math.cos(t) * r;
      const py = y + Math.sin(t) * r;
      if (px < 40 || py < 40 || px > WORLD_WIDTH - 40 || py > WORLD_HEIGHT - 40) continue;
      if (buildingIndexAt(world, px, py) >= 0) continue;
      if (world.nav.isBlocked(px, py)) continue;
      return { x: px, y: py };
    }
  }
  return null;
}
/**
 * **A patrol car the city started with**, parked somewhere near the middle with
 * a grey officer beside it. See `CITY_CAR_SPREAD`.
 *
 * Built as an already-`parked` vehicle rather than driven in: there is no
 * arrival to watch, and `dropped` is set to the car's full crew so
 * `updateBackup` never tries to unload one. Everything else about it is an
 * ordinary parked car — the lightbar goes on flashing, which is most of what
 * makes it findable from a street away, and `park` puts its body into
 * `world.navBlockers` so routes go round it like any other.
 *
 * Returns where it ended up so the caller can lay the two items beside it, or
 * null if nowhere near the middle had room — a city with a very large building
 * across the centre, which is not worth forcing.
 */
export function placeCityCar(
  world: World,
  now: number,
): { x: number; y: number; facing: number } | null {
  for (let attempt = 0; attempt < 240; attempt++) {
    // Toward the middle, but not on the same pixel every round.
    const x = WORLD_WIDTH * (0.5 + (Math.random() - 0.5) * CITY_CAR_SPREAD);
    const y = WORLD_HEIGHT * (0.5 + (Math.random() - 0.5) * CITY_CAR_SPREAD);
    // Streets are axis-aligned, so a car lies along one rather than at some
    // angle across it.
    const facing = Math.floor(Math.random() * 4) * (Math.PI / 2);
    if (!bodyFits(world, x, y, facing)) continue;
    if (!world.nav.isReachable(x, y)) continue;

    const id = 'city-car';
    const vehicle: BackupVehicle = {
      id,
      kind: 'car',
      x,
      y,
      targetX: x,
      targetY: y,
      facing,
      heading: facing,
      phase: 'parked',
      skidX: null,
      skidY: null,
      driftDir: 1,
      drift: 0,
      callerId: '',
      // Its crew got out long before the round started, so there is nobody
      // left in it to unload.
      dropped: crewSize('car'),
      nextDropAt: 0,
      rearOpen: 0,
      cabOpen: 0,
      leaderId: null,
      silent: false,
    };
    world.vehicles.set(id, vehicle);
    park(world, vehicle, now);

    // One grey officer standing by it, off to the side rather than in the road,
    // and posted there — the same `guardX`/`guardY` the van's driver uses, so he
    // is a sentry and a landmark at once instead of wandering off.
    const G = CITY_CAR_OFFICER_GAP;
    const stand =
      spotBeside(world, x, y, facing, [
        { along: 0, across: G },
        { along: 0, across: -G },
        { along: G, across: G },
        { along: -G, across: G },
        { along: G, across: -G },
        { along: -G, across: -G },
        { along: G * 1.6, across: 0 },
        { along: -G * 1.6, across: 0 },
      ]) ?? { x, y };
    const guard = 'city-car-officer';
    world.entities.set(guard, makeEntity(guard, 'officer', stand.x, stand.y));
    const state = newAiState(now, stand.x, stand.y);
    state.guardX = x;
    state.guardY = y;
    world.ai.set(guard, state);
    world.cityOfficers.add(guard);

    return { x, y, facing };
  }
  return null;
}
/**
 * **The station car park: nought to three cars, sirens off.**
 *
 * The bays are laid out by `mapgen` and reserved as part of the landmark box,
 * so a bay is somewhere a car can stand by construction and this does not have
 * to go looking. What is rolled here is only *how many* of them are occupied,
 * and which — shuffled rather than filled left to right, or the third bay would
 * be the empty one every single round and the yard would read as a pattern.
 *
 * They are built already `parked`, with `dropped` at the full crew, exactly as
 * the city car is: `updateBackup` only ever unloads a vehicle that still has
 * somebody in it, so a car that arrived before the round did needs no case of
 * its own anywhere. Nobody gets out of these — the officers who man the station
 * are inside it, which is what a station car park looks like.
 *
 * They are `silent`, which is the one thing that distinguishes them on screen
 * from a car that has just skidded to a halt in front of you.
 */
export function placePoliceCars(world: World, now: number): number {
  const station = world.map.policeStation;
  if (!station) return 0;

  const bays = station.parking.map((_, i) => i);
  for (let i = bays.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [bays[i], bays[j]] = [bays[j], bays[i]];
  }
  const filled = Math.floor(Math.random() * (station.parking.length + 1));

  let made = 0;
  for (let n = 0; n < filled; n++) {
    const bay = station.parking[bays[n]];
    const id = `police-car-${bays[n]}`;
    const vehicle: BackupVehicle = {
      id,
      kind: 'car',
      x: bay.x,
      y: bay.y,
      targetX: bay.x,
      targetY: bay.y,
      facing: bay.facing,
      heading: bay.facing,
      phase: 'parked',
      skidX: null,
      skidY: null,
      driftDir: 1,
      drift: 0,
      callerId: '',
      dropped: crewSize('car'),
      nextDropAt: 0,
      rearOpen: 0,
      cabOpen: 0,
      leaderId: null,
      silent: true,
    };
    world.vehicles.set(id, vehicle);
    // Into `world.navBlockers` like any other parked body, so the crowd walks
    // round the yard rather than into it. See "The radio".
    park(world, vehicle, now);
    made++;
  }
  return made;
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
        park(world, vehicle, now);
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
      vehicle.facing = vehicle.heading + VAN_SLEW_ANGLE * vehicle.driftDir;
      park(world, vehicle, now);
      continue;
    }

    // 0 at the moment the brakes bite, 1 at the stop.
    const t = Math.max(0, Math.min(1, 1 - along / VAN_BRAKE_DIST));
    // Eased so most of the speed goes early: it lands on the spot rather than
    // crawling the last stretch.
    const speed =
      VAN_BRAKE_SPEED_MIN + (VAN_APPROACH_SPEED - VAN_BRAKE_SPEED_MIN) * (1 - t) * (1 - t);

    // Only the speed is integrated. Where the body sits and which way it points
    // are read straight off `brakePose` at the new distance-to-run, which is
    // the same curve `callBackup` checked the geometry against — and, being a
    // pure function of `along`, exactly what the old forward-walked version
    // computed. It cannot drift out of step with the check.
    const nextAlong = Math.max(0, along - speed * dt);
    const pose = brakePose(vehicle, nextAlong);
    vehicle.x = pose.x;
    vehicle.y = pose.y;
    vehicle.facing = pose.facing;
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
    if (v.silent) state.silent = true;
    if (v.phase === 'braking') state.braking = true;
    if (v.rearOpen > 0) state.rearOpen = Math.round(v.rearOpen * 100) / 100;
    if (v.cabOpen > 0) state.cabOpen = Math.round(v.cabOpen * 100) / 100;
    return state;
  });
}
