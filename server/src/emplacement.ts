import type { BarricadeState, BuildSiteState, EmplacementState } from '../../shared/types.js';
import {
  BARRICADE_HALF_DEPTH,
  BARRICADE_HALF_WIDTH,
  BARRICADE_HEALTH,
  EMPLACEMENT_AMMO,
  EMPLACEMENT_ARC,
  EMPLACEMENT_BLOOM,
  EMPLACEMENT_COOLDOWN_MS,
  EMPLACEMENT_DAMAGE_MAX,
  EMPLACEMENT_DAMAGE_MIN,
  EMPLACEMENT_GUN_HEALTH,
  EMPLACEMENT_RANGE,
  EMPLACEMENT_SLOW_MS,
  EMPLACEMENT_SLOW_MUL,
  EMPLACEMENT_TURN_RATE,
  ENTITY_RADIUS,
  SANDBAG_HALF_DEPTH,
  SANDBAG_HALF_WIDTH,
  SANDBAG_HEALTH,
  SANDBAG_HIT_DAMAGE,
  SANDBAG_HIT_INTERVAL_MS,
  SANDBAG_REACH,
  SANDBAG_STANDOFF,
} from '../../shared/constants.js';
import { angleDelta, closestOnBox, resolveCircleBox, turnToward, type OrientedBox } from './geometry.js';
import { fire } from './combat.js';
import {
  findSpawnNear,
  hasLineOfSight,
  makeEntity,
  newAiState,
  type Entity,
  type World,
} from './world.js';

/**
 * A machine gun behind a wall of sandbags, with a grey officer working it.
 *
 * The officer is an ordinary NPC entity — it collides, it can be grabbed, it
 * is drawn like any other. All this holds is what makes it an emplacement,
 * which is why running out of ammunition needs no more than deleting the
 * record: what is left behind is already a grey officer with a pistol.
 *
 * The bags are see-through and rounds pass straight through them. They are
 * only an obstacle to walking, and — like a door — something a zombie will
 * stand and tear at rather than route around. Everything alive goes round; see
 * the note on `Barricade` below.
 */
export interface Emplacement {
  id: string;
  x: number;
  y: number;
  /** Centre of the traverse: the way the officer was facing when it went down. */
  arc: number;
  /** Where the barrel is pointing now. */
  facing: number;
  ammo: number;
  bagHealth: number;
  gunHealth: number;
  /** Null once the bags have been torn down. */
  bags: OrientedBox | null;
  nextShotAt: number;
}

/**
 * A bare sandbag wall, with no gun behind it and nobody manning it.
 *
 * Built to order by a grey officer a spectator sent, one per officer for the
 * whole round. It is the gunner's bags with the gun taken away, and everything
 * about how it behaves is shared with them rather than written twice:
 * `zombieAtSandbag` tears it down, `resolveEmplacementCollisions` pushes bodies
 * out of it, and the client draws it with the same `drawSandbagWall`.
 *
 * **In the nav grid's destructible layer, which a zombie does not read.** The
 * old rule was the doors' — routes planned as though it were not there, and
 * whoever walks into one deals with it — and that is still exactly what a
 * zombie gets, because clawing a wall down rather than strolling round the end
 * is the entire point of building one. Anything alive routes round it instead:
 * it cannot take the thing apart, so pressing on it is nothing but a body stuck
 * against a wall. See `headingToward`.
 */
export interface Barricade {
  id: string;
  box: OrientedBox;
  health: number;
}

let counter = 0;
let barricadeCounter = 0;

/** Where the bags sit for a gun at (x, y) pointing along `angle`. */
function bagsFor(x: number, y: number, angle: number): OrientedBox {
  return {
    x: x + Math.cos(angle) * SANDBAG_STANDOFF,
    y: y + Math.sin(angle) * SANDBAG_STANDOFF,
    hw: SANDBAG_HALF_WIDTH,
    hh: SANDBAG_HALF_DEPTH,
    // The wall lies across the line of fire, not along it.
    angle: angle + Math.PI / 2,
  };
}

/**
 * Put one down in front of `owner`, facing the way they are. Returns false if
 * there is nowhere to stand the gunner, in which case the item is not spent.
 */
export function deployEmplacement(world: World, owner: Entity, now: number): boolean {
  const angle = owner.facing;
  const wantX = owner.x + Math.cos(angle) * 46;
  const wantY = owner.y + Math.sin(angle) * 46;
  const spot = findSpawnNear(world, wantX, wantY, ENTITY_RADIUS.officer, 70);
  if (!spot) return false;

  const id = `gunner-${counter++}`;
  const gunner = makeEntity(id, 'officer', spot.x, spot.y);
  gunner.facing = angle;
  world.entities.set(id, gunner);
  world.ai.set(id, newAiState(now, spot.x, spot.y));

  world.emplacements.set(id, {
    id,
    x: spot.x,
    y: spot.y,
    arc: angle,
    facing: angle,
    ammo: EMPLACEMENT_AMMO,
    bagHealth: SANDBAG_HEALTH,
    gunHealth: EMPLACEMENT_GUN_HEALTH,
    bags: bagsFor(spot.x, spot.y, angle),
    nextShotAt: 0,
  });
  world.navDirty = true;
  return true;
}

/** The officer stops manning it and goes back to being an ordinary NPC. */
function dismount(world: World, gun: Emplacement, reason: string): void {
  world.emplacements.delete(gun.id);
  console.log(`[server] emplacement ${gun.id} ${reason}`);
}

/**
 * Stand a bare wall up at (x, y), lying along `angle`.
 *
 * `angle` is the wall's own bearing — the direction its long axis runs — which
 * is what the spectator rotated the ghost to, so what is placed is what was
 * shown. Note this differs from `bagsFor`, which is handed the *gun's* facing
 * and turns it a right angle to lay the bags across the line of fire.
 */
export function placeBarricade(world: World, x: number, y: number, angle: number): Barricade {
  const wall: Barricade = {
    id: `barricade-${barricadeCounter++}`,
    box: { x, y, hw: BARRICADE_HALF_WIDTH, hh: BARRICADE_HALF_DEPTH, angle },
    health: BARRICADE_HEALTH,
  };
  world.barricades.set(wall.id, wall);
  // A new thing to walk round. The main loop coalesces this to one rebuild.
  world.navDirty = true;
  return wall;
}

/**
 * Sandbags in reach of a point, for anyone who needs to know they are there —
 * collision, and zombies looking for something to take apart.
 */
export function sandbagAt(world: World, x: number, y: number, reach: number): Emplacement | null {
  for (const gun of world.emplacements.values()) {
    if (!gun.bags) continue;
    if (closestOnBox(gun.bags, x, y).dist <= reach) return gun;
  }
  return null;
}

/** The same question of a bare wall. Kept apart only because the records are. */
export function barricadeAt(world: World, x: number, y: number, reach: number): Barricade | null {
  for (const wall of world.barricades.values()) {
    if (closestOnBox(wall.box, x, y).dist <= reach) return wall;
  }
  return null;
}

/**
 * Push everything out of the bags — the gunners' and the bare walls alike.
 * Cheap: there are almost never many of either.
 */
export function resolveEmplacementCollisions(world: World): void {
  for (const gun of world.emplacements.values()) {
    if (!gun.bags) continue;
    for (const e of world.entities.values()) {
      resolveCircleBox(e, gun.bags);
    }
  }
  for (const wall of world.barricades.values()) {
    for (const e of world.entities.values()) {
      resolveCircleBox(e, wall.box);
    }
  }
}

/** A zombie clawing at the bags, then at the gun behind them. */
export function damageEmplacement(world: World, gun: Emplacement, amount: number): void {
  if (gun.bags) {
    gun.bagHealth -= amount;
    if (gun.bagHealth <= 0) {
      gun.bags = null;
      gun.bagHealth = 0;
      // The street is open again, and every route planned round it is stale.
      world.navDirty = true;
    }
    return;
  }
  gun.gunHealth -= amount;
  if (gun.gunHealth <= 0) {
    gun.gunHealth = 0;
    dismount(world, gun, 'was wrecked');
  }
}

/**
 * A zombie standing at the bags takes a swing at them. Modelled on the way
 * they work at a door: they don't path around it, they take it apart.
 * Returns true when this zombie is busy doing that.
 */
export function zombieAtSandbag(world: World, e: Entity, state: { nextWindowHitAt: number }, now: number): boolean {
  const reach = e.radius + SANDBAG_REACH;
  const gun = sandbagAt(world, e.x, e.y, reach);
  if (gun && gun.bags) {
    e.facing = Math.atan2(gun.y - e.y, gun.x - e.x);
    e.breaking = true;
    if (now >= state.nextWindowHitAt) {
      state.nextWindowHitAt = now + SANDBAG_HIT_INTERVAL_MS;
      damageEmplacement(world, gun, SANDBAG_HIT_DAMAGE);
    }
    return true;
  }

  // A bare wall is torn down the same way, at the same rate. One branch here
  // rather than a second AI behaviour: as far as a zombie is concerned there is
  // no difference between the two, and there should not be.
  const wall = barricadeAt(world, e.x, e.y, reach);
  if (!wall) return false;
  e.facing = Math.atan2(wall.box.y - e.y, wall.box.x - e.x);
  e.breaking = true;
  if (now >= state.nextWindowHitAt) {
    state.nextWindowHitAt = now + SANDBAG_HIT_INTERVAL_MS;
    wall.health -= SANDBAG_HIT_DAMAGE;
    if (wall.health <= 0) {
      world.barricades.delete(wall.id);
      world.navDirty = true;
    }
  }
  return true;
}

/**
 * Work every gun: swing onto whatever is in the arc, fire, and stand the
 * officer down when the belt runs out.
 */
export function updateEmplacements(world: World, now: number, dt: number): void {
  for (const gun of [...world.emplacements.values()]) {
    const gunner = world.entities.get(gun.id);
    // Officer gone — eaten, or turned. The gun goes with them.
    if (!gunner || gunner.type !== 'officer') {
      dismount(world, gun, 'lost its gunner');
      continue;
    }

    // The officer is rooted to it, so the record stays authoritative on where
    // it is; collision may have shoved the body a pixel or two.
    gunner.x = gun.x;
    gunner.y = gun.y;

    let target: Entity | null = null;
    let best = Infinity;
    for (const other of world.entityGrid.queryCircle(gun.x, gun.y, EMPLACEMENT_RANGE, new Set<Entity>())) {
      if (other.type !== 'zombie') continue;
      const dist = Math.hypot(other.x - gun.x, other.y - gun.y);
      if (dist > EMPLACEMENT_RANGE || dist >= best) continue;
      // A gun on a mount doesn't spin: a right angle either side of where it
      // was planted, and nothing behind it exists as far as it's concerned.
      const bearing = Math.atan2(other.y - gun.y, other.x - gun.x);
      if (Math.abs(angleDelta(gun.arc, bearing)) > EMPLACEMENT_ARC) continue;
      if (!hasLineOfSight(world, gun.x, gun.y, other.x, other.y, true, 'officer')) continue;
      best = dist;
      target = other;
    }

    if (!target) {
      // Idle: drift back to the middle of the arc.
      gun.facing = turnToward(gun.facing, gun.arc, EMPLACEMENT_TURN_RATE * dt * 0.5);
      gunner.facing = gun.facing;
      continue;
    }

    const aim = Math.atan2(target.y - gun.y, target.x - gun.x);
    gun.facing = turnToward(gun.facing, aim, EMPLACEMENT_TURN_RATE * dt);
    gunner.facing = gun.facing;

    if (now < gun.nextShotAt) continue;
    if (Math.abs(angleDelta(gun.facing, aim)) > 0.15) continue;

    gun.nextShotAt = now + EMPLACEMENT_COOLDOWN_MS;
    gun.ammo--;
    // Rounds pass over the bags, so the gun shoots from its own position.
    fire(world, gunner, gun.facing, EMPLACEMENT_BLOOM, now, {
      id: 'machineGun',
      kind: 'gun',
      label: 'Emplacement',
      short: 'EMPL',
      color: '#84cc16',
      rarity: 0,
      damageMin: EMPLACEMENT_DAMAGE_MIN,
      damageMax: EMPLACEMENT_DAMAGE_MAX,
      range: EMPLACEMENT_RANGE,
      slowMs: EMPLACEMENT_SLOW_MS,
      slowMul: EMPLACEMENT_SLOW_MUL,
    });

    if (gun.ammo <= 0) dismount(world, gun, 'ran dry; its gunner walked away');
  }
}

export function emplacementsToWire(world: World): EmplacementState[] {
  const out: EmplacementState[] = [];
  for (const gun of world.emplacements.values()) {
    out.push({
      id: gun.id,
      x: Math.round(gun.x),
      y: Math.round(gun.y),
      facing: Math.round(gun.facing * 100) / 100,
      arc: Math.round(gun.arc * 100) / 100,
      ammo: gun.ammo,
      bagHp: Math.max(0, gun.bagHealth / SANDBAG_HEALTH),
      gunHp: Math.max(0, gun.gunHealth / EMPLACEMENT_GUN_HEALTH),
      ...(gun.bags
        ? {
            bags: {
              x: Math.round(gun.bags.x),
              y: Math.round(gun.bags.y),
              angle: Math.round(gun.bags.angle * 100) / 100,
              hw: gun.bags.hw,
              hh: gun.bags.hh,
            },
          }
        : {}),
    });
  }
  return out;
}

/**
 * The walls that have been ordered and are still being walked to.
 *
 * Counted off `AiState` rather than kept as a list of its own, for the reason
 * every other tally here is: an errand ends four ways — built, given up on, its
 * owner turned, its owner eaten — and a list somebody has to remember to strike
 * from is a list that holds a ghost over an empty street for the rest of the
 * round. This cannot go stale, because it is the errand itself.
 *
 * One walk of the AI map, and only for a round somebody is watching.
 */
export function buildSitesToWire(world: World): BuildSiteState[] {
  const out: BuildSiteState[] = [];
  for (const [id, st] of world.ai) {
    if (st.buildX === null || st.buildY === null) continue;
    out.push({
      id,
      x: Math.round(st.buildX),
      y: Math.round(st.buildY),
      angle: Math.round(st.buildAngle * 100) / 100,
      // `buildAt` is only set once he is within reach and stacking, so it is
      // exactly the line between "on his way" and "putting it up".
      working: st.buildAt > 0 ? true : undefined,
    });
  }
  return out;
}

export function barricadesToWire(world: World): BarricadeState[] {
  const out: BarricadeState[] = [];
  for (const wall of world.barricades.values()) {
    out.push({
      x: Math.round(wall.box.x),
      y: Math.round(wall.box.y),
      angle: Math.round(wall.box.angle * 100) / 100,
      hw: wall.box.hw,
      hh: wall.box.hh,
      hp: Math.max(0, wall.health / BARRICADE_HEALTH),
    });
  }
  return out;
}
