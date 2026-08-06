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
} from '../../shared/constants.js';
import { findSpawnNear, makeEntity, newAiState, type World } from './world.js';

export interface Grenade {
  id: string;
  startX: number;
  startY: number;
  targetX: number;
  targetY: number;
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

export function throwGrenade(world: World, x: number, y: number, tx: number, ty: number, now: number): void {
  world.grenades.set(nextId('nade'), {
    id: nextId('g'),
    startX: x,
    startY: y,
    targetX: tx,
    targetY: ty,
    thrownAt: now,
  });
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

export function updateAirSupport(world: World, now: number, dt: number): void {
  // ---- grenades in flight
  for (const [key, g] of world.grenades) {
    if (now - g.thrownAt < GRENADE_FLIGHT_MS) continue;
    world.grenades.delete(key);
    world.smokes.set(nextId('smoke'), {
      id: nextId('s'),
      x: g.targetX,
      y: g.targetY,
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
      x: Math.round(g.startX + (g.targetX - g.startX) * t),
      y: Math.round(g.startY + (g.targetY - g.startY) * t),
      // Simple arc so it visibly lobs rather than slides.
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
