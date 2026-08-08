import type { DuckState } from '../../shared/types.js';
import {
  DUCK_COUNT_MIN,
  DUCK_COUNT_MAX,
  DUCK_PADDLE_SPEED,
  DUCK_SCARE_RADIUS,
  DUCK_FLY_SPEED,
  DUCK_FLY_MS,
  WORLD_WIDTH,
  WORLD_HEIGHT,
} from '../../shared/constants.js';
import type { World } from './world.js';

/**
 * A duck. Deliberately not an entity: they don't collide, can't be infected
 * and nothing hunts them, so making them entities would put them through the
 * whole AI and fog pipeline to no purpose.
 */
export interface Duck {
  x: number;
  y: number;
  facing: number;
  /** Where it's paddling toward while it's still on the water. */
  goalX: number;
  goalY: number;
  /** Set when something startles it; it climbs away and doesn't come back. */
  flyingUntil: number;
  vx: number;
  vy: number;
}

export function initDucks(world: World): void {
  const pond = world.map.pond;
  const count = DUCK_COUNT_MIN + Math.floor(Math.random() * (DUCK_COUNT_MAX - DUCK_COUNT_MIN + 1));
  world.ducks = [];

  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.random() * pond.r * 0.75;
    world.ducks.push({
      x: pond.x + Math.cos(angle) * dist,
      y: pond.y + Math.sin(angle) * dist,
      facing: Math.random() * Math.PI * 2,
      goalX: pond.x,
      goalY: pond.y,
      flyingUntil: 0,
      vx: 0,
      vy: 0,
    });
  }
}

/** A shot near the water puts the flock up. */
export function scareDucks(world: World, x: number, y: number, now: number): void {
  for (const duck of world.ducks) {
    if (duck.flyingUntil > 0) continue;
    if (Math.hypot(duck.x - x, duck.y - y) > DUCK_SCARE_RADIUS) continue;

    duck.flyingUntil = now + DUCK_FLY_MS;
    // Straight away from whatever made the noise, with a little spread so the
    // flock fans out rather than leaving as one rigid block.
    const away = Math.atan2(duck.y - y, duck.x - x) + (Math.random() - 0.5) * 0.8;
    duck.vx = Math.cos(away) * DUCK_FLY_SPEED;
    duck.vy = Math.sin(away) * DUCK_FLY_SPEED;
    duck.facing = away;
  }
}

export function updateDucks(world: World, now: number, dt: number): void {
  const pond = world.map.pond;

  for (let i = world.ducks.length - 1; i >= 0; i--) {
    const duck = world.ducks[i];

    if (duck.flyingUntil > 0) {
      duck.x += duck.vx * dt;
      duck.y += duck.vy * dt;
      // Gone for good once it's clear of the map or the flight has run out.
      const gone =
        now >= duck.flyingUntil ||
        duck.x < -80 ||
        duck.y < -80 ||
        duck.x > WORLD_WIDTH + 80 ||
        duck.y > WORLD_HEIGHT + 80;
      if (gone) world.ducks.splice(i, 1);
      continue;
    }

    // Paddling: pick a new spot on the water whenever the last one is reached.
    if (Math.hypot(duck.goalX - duck.x, duck.goalY - duck.y) < 12) {
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.random() * pond.r * 0.8;
      duck.goalX = pond.x + Math.cos(angle) * dist;
      duck.goalY = pond.y + Math.sin(angle) * dist;
    }

    const toGoal = Math.atan2(duck.goalY - duck.y, duck.goalX - duck.x);
    duck.facing = toGoal;
    duck.x += Math.cos(toGoal) * DUCK_PADDLE_SPEED * dt;
    duck.y += Math.sin(toGoal) * DUCK_PADDLE_SPEED * dt;
  }
}

export function ducksToWire(world: World, now = Date.now()): DuckState[] {
  return world.ducks.map((d) => {
    const wire: DuckState = {
      x: Math.round(d.x),
      y: Math.round(d.y),
      facing: Math.round(d.facing * 100) / 100,
    };
    if (d.flyingUntil > 0) {
      wire.flying = true;
      // Straight from the time it has left, so the fade and the flight end together.
      const left = Math.max(0, d.flyingUntil - now);
      wire.climb = Math.round((1 - left / DUCK_FLY_MS) * 100) / 100;
    }
    return wire;
  });
}
