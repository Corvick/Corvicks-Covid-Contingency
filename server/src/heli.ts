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
  GRENADE_BOUNCE,
} from '../../shared/constants.js';
import {
  findSpawnNear,
  hasLineOfSight,
  makeEntity,
  newAiState,
  type Entity,
  type World,
} from './world.js';
import { clamp } from './geometry.js';

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

function callHelicopter(world: World, smoke: Smoke, now: number): void {
  const entry = edgePointFor(smoke.x, smoke.y);

  // It flies through rather than turning around: the exit continues along the
  // same bearing it arrived on, out the far side of the map.
  const dx = smoke.x - entry.x;
  const dy = smoke.y - entry.y;
  const len = Math.hypot(dx, dy) || 1;
  const run = WORLD_WIDTH + WORLD_HEIGHT;
  const exit = { x: smoke.x + (dx / len) * run, y: smoke.y + (dy / len) * run };
  world.helicopters.set(nextId('heli'), {
    id: nextId('h'),
    x: entry.x,
    y: entry.y,
    targetX: smoke.x,
    targetY: smoke.y,
    exitX: exit.x,
    exitY: exit.y,
    facing: Math.atan2(smoke.y - entry.y, smoke.x - entry.x),
    phase: 'inbound',
    spawnedAt: now,
    hoverUntil: 0,
    dropped: 0,
    nextDropAt: 0,
    leftAt: 0,
  });
}

function dropSoldier(world: World, heli: Helicopter, now: number): void {
  const spawn = findSpawnNear(world, heli.x, heli.y, ENTITY_RADIUS.officer, 60);
  const id = `soldier-${counter++}`;
  world.entities.set(id, makeEntity(id, 'officer', spawn.x, spawn.y));
  world.ai.set(id, newAiState(now, spawn.x, spawn.y));
  world.soldiers.add(id);
  // Rope down rather than pop in.
  world.materializeUntil.set(id, now + 600);
}

/**
 * A shell going off. Damage falls away from the centre, and a wall between the
 * blast and a body shields it — otherwise a grenade lobbed at a wall would kill
 * the room behind it.
 */
function detonate(world: World, x: number, y: number, now: number): void {
  world.blasts.push({ x: Math.round(x), y: Math.round(y), at: now });

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

export function updateAirSupport(world: World, now: number, dt: number): void {
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
      if (h.dropped < HELI_SOLDIERS && now >= h.nextDropAt) {
        dropSoldier(world, h, now);
        h.dropped++;
        h.nextDropAt = now + HELI_DROP_INTERVAL_MS;
      }
      if (now >= h.hoverUntil && h.dropped >= HELI_SOLDIERS) {
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
