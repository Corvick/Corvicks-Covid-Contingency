import type { GrenadeState, HelicopterState, SmokeState } from '../../shared/types.js';
import {
  GRENADE_FLIGHT_MS,
  SMOKE_DURATION_MS,
  SMOKE_RADIUS,
  HELI_SPEED,
  HELI_HOVER_MS,
  HELI_MATERIALIZE_MS,
  HELI_DEPART_FADE_MS,
  HELI_SOLDIERS,
  HELI_DROP_INTERVAL_MS,
  WORLD_WIDTH,
  WORLD_HEIGHT,
  ENTITY_RADIUS,
  BLAST_RADIUS,
  BLAST_DAMAGE_MIN,
  BLAST_DAMAGE_MAX,
  BLAST_DOOR_DAMAGE_MIN,
  BLAST_DOOR_DAMAGE_MAX,
  GRENADE_BOUNCE,
  BEACON_INBOUND_LINE,
  BEACON_SHOUT_MS,
  SOLDIER_RIFLE_AMMO,
} from '../../shared/constants.js';
import { newInventory } from './inventory.js';
import {
  findSpawnNear,
  hasLineOfSight,
  makeEntity,
  newAiState,
  type Entity,
  type World,
} from './world.js';
import { clamp } from './geometry.js';
import { blastDoors } from './doors.js';
import { scareDucks } from './ducks.js';

/**
 * A thrown or launched charge, moved as an actual projectile rather than
 * interpolated from thrower to target — it has to be able to hit things and
 * come off them, which a straight line between two points cannot do.
 */
export interface Grenade {
  id: string;
  /** Smoke marks a landing zone; a frag shell goes off. */
  kind: 'smoke' | 'frag';
  x: number;
  y: number;
  vx: number;
  vy: number;
  thrownAt: number;
}

export interface Smoke {
  id: string;
  x: number;
  y: number;
  startedAt: number;
  /** Set once this plume has summoned its helicopter. */
  called: boolean;
}

export interface Helicopter {
  id: string;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  exitX: number;
  exitY: number;
  facing: number;
  phase: 'inbound' | 'hovering' | 'leaving';
  spawnedAt: number;
  hoverUntil: number;
  dropped: number;
  nextDropAt: number;
  /** When the exit run began, or 0 while still inbound/hovering. */
  leftAt: number;
  /** How many it has aboard. Smoke brings a squad; the beacon brings one man. */
  carries: number;
  /**
   * Where the beacon was called for, when this is the beacon flight. The one
   * soldier aboard walks there, puts the mast up and holds it.
   */
  beaconFor?: { x: number; y: number };
}

let counter = 0;
const nextId = (prefix: string) => `${prefix}-${counter++}`;

export function throwGrenade(
  world: World,
  x: number,
  y: number,
  tx: number,
  ty: number,
  now: number,
  kind: 'smoke' | 'frag' = 'smoke',
): void {
  // Velocity is set so that an unobstructed throw lands on the target exactly
  // as its flight time runs out; anything it hits on the way shortens that.
  // The bang of firing is startling in itself, wherever the shell ends up.
  scareDucks(world, x, y, now);
  const flight = GRENADE_FLIGHT_MS / 1000;
  world.grenades.set(nextId('nade'), {
    id: nextId('g'),
    kind,
    x,
    y,
    vx: (tx - x) / flight,
    vy: (ty - y) / flight,
    thrownAt: now,
  });
}

/** Solid to a thrown charge: walls, intact glass, and shut doors. */
function bouncesOff(world: World, x: number, y: number): boolean {
  // The nav grid already carries walls and unbroken panes.
  if (world.nav.isBlocked(x, y)) return true;

  for (const index of world.doorGrid.queryCircle(x, y, 8, new Set<number>())) {
    const door = world.doors[index];
    if (!door || door.open || door.broken) continue;
    const r = door.rect;
    if (x > r.x - 4 && x < r.x + r.w + 4 && y > r.y - 4 && y < r.y + r.h + 4) return true;
  }
  return false;
}

/**
 * Step a grenade along, reflecting it off anything solid. Each axis is tested
 * on its own, which is what makes a charge thrown into a corner come back out
 * of it rather than burying itself in the geometry.
 */
function moveGrenade(world: World, g: Grenade, dt: number): void {
  const nx = g.x + g.vx * dt;
  const ny = g.y + g.vy * dt;

  let bounced = false;
  if (bouncesOff(world, nx, g.y)) {
    g.vx = -g.vx * GRENADE_BOUNCE;
    g.vy *= GRENADE_BOUNCE;
    bounced = true;
  }
  if (bouncesOff(world, g.x, ny)) {
    g.vy = -g.vy * GRENADE_BOUNCE;
    g.vx *= GRENADE_BOUNCE;
    bounced = true;
  }
  // A corner hit that neither axis caught on its own.
  if (!bounced && bouncesOff(world, nx, ny)) {
    g.vx = -g.vx * GRENADE_BOUNCE;
    g.vy = -g.vy * GRENADE_BOUNCE;
    bounced = true;
  }

  g.x = clamp(g.x + g.vx * dt, 4, WORLD_WIDTH - 4);
  g.y = clamp(g.y + g.vy * dt, 4, WORLD_HEIGHT - 4);
}

/** Pick the nearest map edge and return an off-screen point on it. */
function edgePointFor(x: number, y: number): { x: number; y: number } {
  const dists = [y, WORLD_WIDTH - x, WORLD_HEIGHT - y, x];
  const side = dists.indexOf(Math.min(...dists));
  if (side === 0) return { x, y: -260 };
  if (side === 1) return { x: WORLD_WIDTH + 260, y };
  if (side === 2) return { x, y: WORLD_HEIGHT + 260 };
  return { x: -260, y };
}

/**
 * Fly one in to a spot. `carries` is how many rope down when it gets there;
 * `beaconFor` marks the flight that brings the beacon and its one soldier.
 */
function flyTo(
  world: World,
  x: number,
  y: number,
  now: number,
  carries: number,
  beaconFor?: { x: number; y: number },
): void {
  const entry = edgePointFor(x, y);

  // It flies through rather than turning around: the exit continues along the
  // same bearing it arrived on, out the far side of the map.
  const dx = x - entry.x;
  const dy = y - entry.y;
  const len = Math.hypot(dx, dy) || 1;
  const run = WORLD_WIDTH + WORLD_HEIGHT;
  const exit = { x: x + (dx / len) * run, y: y + (dy / len) * run };
  world.helicopters.set(nextId('heli'), {
    id: nextId('h'),
    x: entry.x,
    y: entry.y,
    targetX: x,
    targetY: y,
    exitX: exit.x,
    exitY: exit.y,
    facing: Math.atan2(y - entry.y, x - entry.x),
    phase: 'inbound',
    spawnedAt: now,
    hoverUntil: 0,
    dropped: 0,
    nextDropAt: 0,
    leftAt: 0,
    carries,
    beaconFor,
  });
}

function callHelicopter(world: World, smoke: Smoke, now: number): void {
  flyTo(world, smoke.x, smoke.y, now, HELI_SOLDIERS);
}

/**
 * The beacon flight: one soldier, put down as near the designated spot as the
 * pilot can manage, who then walks the rest and plants the mast himself.
 *
 * Deliberately a *drop* rather than the mast simply appearing where it was
 * asked for. The wait is what makes choosing the spot a decision — and a
 * soldier who has to walk there can be met on the way.
 */
export function callBeaconDrop(world: World, x: number, y: number, now: number): void {
  flyTo(world, x, y, now, 1, { x, y });
}

/**
 * Somebody has picked a spot off the map. Called by a player's `beaconPlace`
 * and by a bot's own choice alike, so neither can get a second beacon and both
 * have to wait out the same flight.
 *
 * Returns false when the call is refused, which is either "there is already
 * one" or "nothing can stand there".
 */
export function requestBeacon(world: World, x: number, y: number, now: number): boolean {
  if (world.beacon) return false; // one to a city, called or standing
  // Somewhere a soldier could actually get to and stand on. A spot picked off
  // a map has had none of the checks clicking the world would have had.
  if (world.nav.isBlocked(x, y) || !world.nav.isReachable(x, y)) return false;
  world.beacon = { x, y, carrierId: null, placed: false };
  callBeaconDrop(world, x, y, now);
  return true;
}

function dropSoldier(world: World, heli: Helicopter, now: number): void {
  const spawn = findSpawnNear(world, heli.x, heli.y, ENTITY_RADIUS.officer, 60);
  const id = `soldier-${counter++}`;
  world.entities.set(id, makeEntity(id, 'officer', spawn.x, spawn.y));
  const state = newAiState(now, spawn.x, spawn.y);
  if (heli.beaconFor) {
    state.beaconX = heli.beaconFor.x;
    state.beaconY = heli.beaconFor.y;
    if (world.beacon) world.beacon.carrierId = id;
    world.speech.set(id, { text: BEACON_INBOUND_LINE, until: now + BEACON_SHOUT_MS });
    // He has an errand and then a post. `dispatched` is what stops a passing
    // radio holder rescanning him onto an escort and walking the beacon off.
    // Only him: an ordinary smoke drop has no orders to protect.
    world.dispatched.add(id);
  }
  world.ai.set(id, state);
  world.soldiers.add(id);

  // They come off the helicopter with a semi-automatic, the same way the van's
  // crew come out of the back with one: a real gun in a real slot, so `fire`
  // reads its damage and reach off the item, the wire takes the shouldered
  // profile off it, and running dry drops them to a sidearm with no special
  // case anywhere. Before this they shot the unnamed default that grey
  // officers fall back on.
  const inv = newInventory();
  inv.guns[0] = { item: 'semiAutoRifle', ammo: SOLDIER_RIFLE_AMMO };
  inv.activeSlot = 1;
  world.inventories.set(id, inv);

  // Rope down rather than pop in.
  world.materializeUntil.set(id, now + 600);
}

/**
 * A shell going off. Damage falls away from the centre, and a wall between the
 * blast and a body shields it — otherwise a grenade lobbed at a wall would kill
 * the room behind it.
 */
function detonate(world: World, x: number, y: number, now: number): void {
  scareDucks(world, x, y, now);
  world.blasts.push({ x: Math.round(x), y: Math.round(y), at: now });

  // A charge takes a door with it. Both kinds go through here — a frag off the
  // belt and a launcher shell are the same detonation, so blowing a door is a
  // thing either can do.
  blastDoors(world, x, y, BLAST_RADIUS, BLAST_DOOR_DAMAGE_MIN, BLAST_DOOR_DAMAGE_MAX);

  for (const e of world.entityGrid.queryCircle(x, y, BLAST_RADIUS, new Set<Entity>())) {
    if (e.type !== 'zombie') continue;
    const dist = Math.hypot(e.x - x, e.y - y);
    if (dist > BLAST_RADIUS) continue;
    if (!hasLineOfSight(world, x, y, e.x, e.y)) continue;

    const falloff = 1 - dist / BLAST_RADIUS;
    const damage = BLAST_DAMAGE_MIN + (BLAST_DAMAGE_MAX - BLAST_DAMAGE_MIN) * falloff;
    e.health -= damage;
    if (e.health > 0) continue;

    world.entities.delete(e.id);
    world.ai.delete(e.id);
    world.grapples.delete(e.id);
    for (const [targetId, session] of world.grapples) {
      session.zombieIds.delete(e.id);
      if (session.zombieIds.size === 0) world.grapples.delete(targetId);
    }
  }
}

/**
 * The beacon team can be lost on the way in, and if it is, the call has to come
 * back.
 *
 * There is one beacon in the city and `requestBeacon` refuses a second, so a
 * carrier who is caught between the drop and the mast going up would otherwise
 * take the only survivor beacon in the round out of the game with him — a dead
 * end nobody could see the cause of. Clearing the request hands the call back
 * to whoever is holding the handset. Once the mast is *up* this stops caring:
 * the beacon is a place from then on, and the man who planted it is just its
 * guard.
 */
function checkBeaconCarrier(world: World): void {
  const b = world.beacon;
  if (!b || b.placed || b.carrierId === null) return;
  const carrier = world.entities.get(b.carrierId);
  if (carrier && carrier.type === 'officer') return;
  world.beacon = null;
}

export function updateAirSupport(world: World, now: number, dt: number): void {
  checkBeaconCarrier(world);
  // ---- grenades in flight
  for (const [key, g] of world.grenades) {
    if (now - g.thrownAt < GRENADE_FLIGHT_MS) {
      moveGrenade(world, g, dt);
      continue;
    }
    world.grenades.delete(key);

    // Wherever it actually ended up, not where it was aimed.
    if (g.kind === 'frag') {
      detonate(world, g.x, g.y, now);
      continue;
    }

    world.smokes.set(nextId('smoke'), {
      id: nextId('s'),
      x: g.x,
      y: g.y,
      startedAt: now,
      called: false,
    });
  }

  // ---- smoke plumes
  for (const [key, s] of world.smokes) {
    if (!s.called) {
      s.called = true;
      callHelicopter(world, s, now);
    }
    if (now - s.startedAt > SMOKE_DURATION_MS) world.smokes.delete(key);
  }

  // ---- helicopters
  for (const [key, h] of world.helicopters) {
    const goalX = h.phase === 'leaving' ? h.exitX : h.targetX;
    const goalY = h.phase === 'leaving' ? h.exitY : h.targetY;
    const dx = goalX - h.x;
    const dy = goalY - h.y;
    const dist = Math.hypot(dx, dy);

    if (h.phase === 'hovering') {
      if (h.dropped < h.carries && now >= h.nextDropAt) {
        dropSoldier(world, h, now);
        h.dropped++;
        h.nextDropAt = now + HELI_DROP_INTERVAL_MS;
      }
      if (now >= h.hoverUntil && h.dropped >= h.carries) {
        h.phase = 'leaving';
        h.leftAt = now;
      }
      continue;
    }

    // Once it has faded out entirely there's nothing left to draw.
    if (h.phase === 'leaving' && now - h.leftAt > HELI_DEPART_FADE_MS) {
      world.helicopters.delete(key);
      continue;
    }

    if (dist < 20 && h.phase === 'inbound') {
      h.phase = 'hovering';
      h.hoverUntil = now + HELI_HOVER_MS;
      h.nextDropAt = now + 400;
      continue;
    }

    h.facing = Math.atan2(dy, dx);
    h.x += (dx / dist) * HELI_SPEED * dt;
    h.y += (dy / dist) * HELI_SPEED * dt;
  }
}

export function grenadesToWire(world: World, now: number): GrenadeState[] {
  const out: GrenadeState[] = [];
  for (const g of world.grenades.values()) {
    const t = Math.min(1, (now - g.thrownAt) / GRENADE_FLIGHT_MS);
    out.push({
      x: Math.round(g.x),
      y: Math.round(g.y),
      // Arc for the throw, flattening out once it has bounced and is rolling.
      h: Math.round(Math.sin(t * Math.PI) * 34),
    });
  }
  return out;
}

export function smokesToWire(world: World, now: number): SmokeState[] {
  const out: SmokeState[] = [];
  for (const s of world.smokes.values()) {
    const age = (now - s.startedAt) / SMOKE_DURATION_MS;
    out.push({
      x: Math.round(s.x),
      y: Math.round(s.y),
      r: Math.round(SMOKE_RADIUS * (0.35 + Math.min(1, age * 3) * 0.65)),
      a: Math.round((1 - Math.max(0, age - 0.7) / 0.3) * 100) / 100,
    });
  }
  return out;
}

export function helicoptersToWire(world: World, now: number): HelicopterState[] {
  const round2 = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 100) / 100;
  const out: HelicopterState[] = [];

  for (const h of world.helicopters.values()) {
    // Darkens in over the approach, holds while it works, fades on the way out.
    const departing = h.leftAt > 0 ? 1 - (now - h.leftAt) / HELI_DEPART_FADE_MS : 1;
    const arriving = Math.min(1, (now - h.spawnedAt) / HELI_MATERIALIZE_MS);

    out.push({
      x: Math.round(h.x),
      y: Math.round(h.y),
      facing: Math.round(h.facing * 100) / 100,
      alpha: round2(arriving * departing),
    });
  }
  return out;
}
