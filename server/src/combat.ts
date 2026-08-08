import type { Wall } from '../../shared/types.js';
import {
  GUN_DAMAGE_MIN,
  GUN_DAMAGE_MAX,
  GUN_BLOOM_RAD,
  GUN_RANGE,
  GUN_COOLDOWN_MS,
  GUNSHOT_ALERT_RADIUS,
  RETALIATE_CHANCE,
  RETALIATE_COMMIT_MS,
  PLAYER_ONE_SHOT_KILL,
  MUZZLE_OFFSET_MUL,
  WINDOW_BULLET_DAMAGE,
  DOOR_BULLET_DAMAGE,
  SHOT_SLOW_MS,
  SHOT_SLOW_MULTIPLIER,
  ENTITY_MAX_HEALTH,
  TRACKER_DART_MS,
  GRENADE_THROW_RANGE,
  GRENADE_COOLDOWN_MS,
  HEADSHOT_ARC,
  DEPLOY_MS,
  CHARGE_MIN_FRACTION,
} from '../../shared/constants.js';
import { throwGrenade } from './heli.js';
import { ITEMS, isGun, type ItemDef } from '../../shared/items.js';
import { segmentCircleT, segmentRectT } from './geometry.js';
import {
  damageWindow,
  isInGrapple,
  isWindowIntact,
  newAiState,
  rollSpeedMul,
  type Entity,
  type World,
} from './world.js';
import { heldGunSlot, heldItem, type Inventory } from './inventory.js';
import { damageDoor } from './doors.js';
import { scareDucks } from './ducks.js';

/**
 * Gunfire is loud: every zombie in earshot investigates the shooter's position
 * whether or not it can see them. This is what stops a bush from being a
 * perfect firing blind.
 */
function alertZombies(world: World, x: number, y: number, now: number): void {
  const heard = world.entityGrid.queryCircle(x, y, GUNSHOT_ALERT_RADIUS, new Set<Entity>());
  for (const zombie of heard) {
    if (zombie.type !== 'zombie') continue;
    if (world.playerIds.has(zombie.id)) continue;
    if (Math.hypot(zombie.x - x, zombie.y - y) > GUNSHOT_ALERT_RADIUS) continue;

    let state = world.ai.get(zombie.id);
    if (!state) {
      state = newAiState(now, zombie.x, zombie.y);
      world.ai.set(zombie.id, state);
    }
    // Don't pull a zombie off a target it can actually see.
    if (state.targetId) continue;
    state.lastSeenX = x;
    state.lastSeenY = y;
    state.path = null;
    state.nextPathAt = 0;
  }
}

/**
 * Hitscan along the muzzle line: nearest zombie, but only if no wall first.
 * `pierce` lets one round carry through several bodies, and `damageMul` is how
 * far a charge weapon wound up before letting go.
 */
export function fire(
  world: World,
  shooter: Entity,
  aim: number,
  bloom: number,
  now: number,
  def?: ItemDef,
  pierce = 1,
  damageMul = 1,
): void {
  const angle = aim + (Math.random() * 2 - 1) * bloom;
  const range = def?.range ?? GUN_RANGE;
  // Start the round at the drawn barrel tip rather than the body centre.
  const muzzleX = shooter.x + Math.cos(angle) * shooter.radius * MUZZLE_OFFSET_MUL;
  const muzzleY = shooter.y + Math.sin(angle) * shooter.radius * MUZZLE_OFFSET_MUL;
  const endX = muzzleX + Math.cos(angle) * range;
  const endY = muzzleY + Math.sin(angle) * range;

  const minX = Math.min(muzzleX, endX);
  const maxX = Math.max(muzzleX, endX);
  const minY = Math.min(muzzleY, endY);
  const maxY = Math.max(muzzleY, endY);

  let wallT = 1;
  const walls = world.wallGrid.queryRect(minX, minY, maxX, maxY, new Set<Wall>());
  for (const wall of walls) {
    const t = segmentRectT(muzzleX, muzzleY, endX, endY, wall);
    if (t !== null && t < wallT) wallT = t;
  }

  // Rounds punch through glass: the pane takes damage, the bullet carries on.
  const panes = world.windowGrid.queryRect(minX, minY, maxX, maxY, new Set<number>());
  for (const index of panes) {
    if (!isWindowIntact(world, index)) continue;
    const t = segmentRectT(muzzleX, muzzleY, endX, endY, world.map.windows[index]);
    if (t !== null && t <= wallT) damageWindow(world, index, WINDOW_BULLET_DAMAGE);
  }

  // A shut door stops the round, and wears down under fire. Chewing one open
  // this way is slow enough that kicking it in is still the sane option.
  const slabs = world.doorGrid.queryRect(minX, minY, maxX, maxY, new Set<number>());
  for (const index of slabs) {
    const door = world.doors[index];
    if (!door || door.open || door.broken) continue;
    const t = segmentRectT(muzzleX, muzzleY, endX, endY, door.rect);
    if (t === null || t > wallT) continue;
    wallT = t;
    damageDoor(world, index, DOOR_BULLET_DAMAGE);
  }

  // Everything the line touches, nearest first. Most rounds stop at the first
  // body; a charged shot walks the list.
  const hits: Array<{ entity: Entity; t: number }> = [];
  const candidates = world.entityGrid.queryRect(minX, minY, maxX, maxY, new Set<Entity>());
  for (const other of candidates) {
    if (other.type !== 'zombie' || other.id === shooter.id) continue;
    const t = segmentCircleT(muzzleX, muzzleY, endX, endY, other.x, other.y, other.radius);
    if (t !== null && t < wallT) hits.push({ entity: other, t });
  }
  hits.sort((a, b) => a.t - b.t);
  const struck = hits.slice(0, Math.max(1, pierce));

  const last = struck[struck.length - 1];
  // A piercing round carries on to the wall behind the last body it passes
  // through; an ordinary one stops in the first.
  const stopT = struck.length === 0 ? wallT : pierce > 1 ? wallT : last.t;
  world.shots.push({
    x1: Math.round(muzzleX),
    y1: Math.round(muzzleY),
    x2: Math.round(muzzleX + (endX - muzzleX) * stopT),
    y2: Math.round(muzzleY + (endY - muzzleY) * stopT),
    hit: struck.length > 0,
  });

  alertZombies(world, shooter.x, shooter.y, now);
  // Anything on the water takes off at the noise, and at the round going past.
  scareDucks(world, shooter.x, shooter.y, now);
  scareDucks(world, endX, endY, now);

  for (const { entity } of struck) hit(world, shooter, entity, angle, now, def, damageMul);
}

/** One body taking one round. Split out so a piercing shot can reuse it. */
function hit(
  world: World,
  shooter: Entity,
  victim: Entity,
  angle: number,
  now: number,
  def: ItemDef | undefined,
  damageMul: number,
): void {
  const oneShot = PLAYER_ONE_SHOT_KILL && world.playerIds.has(shooter.id);
  const lo = def?.damageMin ?? GUN_DAMAGE_MIN;
  const hi = def?.damageMax ?? GUN_DAMAGE_MAX;

  /**
   * Between the arms. A zombie's arms are drawn out along its facing, so a
   * round arriving inside a narrow arc off the front went past them — which is
   * exactly the shot you get when one is charging you down.
   */
  const incoming = angle + Math.PI; // the direction the round came from
  const off = Math.abs(((incoming - victim.facing + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
  const headshot = def?.headshot === true && off <= HEADSHOT_ARC;

  const rolled = lo + Math.floor(Math.random() * (hi - lo + 1));
  const damage = oneShot || headshot ? victim.health : Math.round(rolled * damageMul);
  victim.health -= damage;

  if (victim.health > 0) {
    // A zombie mid-grapple keeps its grip and its facing — it doesn't look up.
    // Otherwise it spins toward the shot, and may break off to hunt the shooter.
    if (!world.playerIds.has(victim.id) && !isInGrapple(world, victim.id)) {
      let state = world.ai.get(victim.id);
      if (!state) {
        state = newAiState(now, victim.x, victim.y);
        world.ai.set(victim.id, state);
      }
      const toShooter = Math.atan2(shooter.y - victim.y, shooter.x - victim.x);
      state.heading = toShooter;
      victim.facing = toShooter;

      // Taking a round staggers them for a moment. A heavy rifle round puts
      // them down harder and for longer than a pistol does.
      const slowMs = def?.slowMs ?? SHOT_SLOW_MS;
      state.slowUntil = Math.max(state.slowUntil, now + slowMs);
      state.slowMul = Math.min(state.slowMul || 1, def?.slowMul ?? SHOT_SLOW_MULTIPLIER);

      if (Math.random() < RETALIATE_CHANCE) {
        state.lastSeenX = shooter.x;
        state.lastSeenY = shooter.y;
        state.targetId = null;
        state.path = null;
        state.nextPathAt = 0;
        // Commit briefly so the next perception tick doesn't undo it.
        state.nextSenseAt = now + RETALIATE_COMMIT_MS;
      } else if (!state.targetId) {
        state.lastSeenX = shooter.x;
        state.lastSeenY = shooter.y;
        state.path = null;
        state.nextPathAt = 0;
      }
    }
    return;
  }

  if (world.playerIds.has(victim.id)) {
    // Infection is permanent — a downed player comes back as a zombie.
    victim.health = victim.maxHealth;
    victim.x = world.map.width / 2;
    victim.y = world.map.height / 2;
  } else {
    world.entities.delete(victim.id);
    world.ai.delete(victim.id);
  }

  world.grapples.delete(victim.id);
  for (const [targetId, session] of world.grapples) {
    session.zombieIds.delete(victim.id);
    if (session.zombieIds.size === 0) world.grapples.delete(targetId);
  }
}

/** Turns a zombie back into a civilian. */
function cure(world: World, victim: Entity, now: number): void {
  victim.type = 'human';
  victim.health = ENTITY_MAX_HEALTH.human;
  victim.maxHealth = ENTITY_MAX_HEALTH.human;
  victim.speedMul = rollSpeedMul('human');
  world.pendingInfections.delete(victim.id);
  world.grappleCounts.delete(victim.id);
  world.ai.set(victim.id, newAiState(now, victim.x, victim.y));
}

/** Hitscan that heals instead of harming, and darts that only mark. */
function fireSpecial(world: World, shooter: Entity, aim: number, def: ItemDef, kind: 'cure' | 'dart', now: number): void {
  const angle = aim + (Math.random() * 2 - 1) * (def.bloom ?? 0.05);
  const range = def.range ?? GUN_RANGE;
  const muzzleX = shooter.x + Math.cos(angle) * shooter.radius * MUZZLE_OFFSET_MUL;
  const muzzleY = shooter.y + Math.sin(angle) * shooter.radius * MUZZLE_OFFSET_MUL;
  const endX = muzzleX + Math.cos(angle) * range;
  const endY = muzzleY + Math.sin(angle) * range;

  const minX = Math.min(muzzleX, endX);
  const maxX = Math.max(muzzleX, endX);
  const minY = Math.min(muzzleY, endY);
  const maxY = Math.max(muzzleY, endY);

  let wallT = 1;
  for (const wall of world.wallGrid.queryRect(minX, minY, maxX, maxY, new Set<Wall>())) {
    const t = segmentRectT(muzzleX, muzzleY, endX, endY, wall);
    if (t !== null && t < wallT) wallT = t;
  }

  let victim: Entity | null = null;
  let victimT = wallT;
  for (const other of world.entityGrid.queryRect(minX, minY, maxX, maxY, new Set<Entity>())) {
    if (other.type !== 'zombie' || other.id === shooter.id) continue;
    const t = segmentCircleT(muzzleX, muzzleY, endX, endY, other.x, other.y, other.radius);
    if (t !== null && t < victimT) {
      victimT = t;
      victim = other;
    }
  }

  const stopT = victim ? victimT : wallT;
  world.shots.push({
    x1: Math.round(muzzleX),
    y1: Math.round(muzzleY),
    x2: Math.round(muzzleX + (endX - muzzleX) * stopT),
    y2: Math.round(muzzleY + (endY - muzzleY) * stopT),
    hit: victim !== null,
    kind,
  });

  if (!victim) return;
  if (kind === 'cure') {
    if (!world.playerIds.has(victim.id)) cure(world, victim, now);
  } else {
    // Tracker dart: marks the target for the zombie-player hunt later on.
    world.trackedTargets.set(victim.id, now + TRACKER_DART_MS);
  }
}

/**
 * Pull the trigger on whatever is in hand: cooldown, ammo, and the weapon's
 * own behaviour. Shared by players and by bot officers, so a bot's shotgun
 * throws the same pellets and burns the same rounds as yours does.
 *
 * Returns true when a shot actually went off.
 */
export function fireHeld(
  world: World,
  shooter: Entity,
  inv: Inventory,
  aim: number,
  now: number,
  charge = 1,
): boolean {
  const id = shooter.id;
  const held = heldItem(inv);
  if (!held) return false;

  // Smoke goes underarm toward the aim point, then calls in the helicopter.
  if (held === 'smokeGrenade') {
    const last = world.lastShotAt.get(id) ?? 0;
    if (now - last < GRENADE_COOLDOWN_MS) return false;
    world.lastShotAt.set(id, now);

    throwGrenade(
      world,
      shooter.x,
      shooter.y,
      shooter.x + Math.cos(aim) * GRENADE_THROW_RANGE,
      shooter.y + Math.sin(aim) * GRENADE_THROW_RANGE,
      now,
    );
    const at = inv.utilities.indexOf('smokeGrenade');
    if (at >= 0) inv.utilities.splice(at, 1);
    inv.activeSlot = 0;
    return true;
  }

  if (!isGun(held)) return false;

  const def = ITEMS[held];
  const last = world.lastShotAt.get(id) ?? 0;
  if (now - last < (def.cooldownMs ?? GUN_COOLDOWN_MS)) return false;

  // The launcher lobs a shell at wherever you're pointing rather than tracing
  // a line, so it reuses the grenade's flight and detonates there.
  if (def.explosive) {
    const slot = heldGunSlot(inv);
    if (slot) {
      if (slot.ammo <= 0) return false;
      slot.ammo--;
    }
    world.lastShotAt.set(id, now);
    const reach = def.range ?? GUN_RANGE;
    throwGrenade(
      world,
      shooter.x,
      shooter.y,
      shooter.x + Math.cos(aim) * reach,
      shooter.y + Math.sin(aim) * reach,
      now,
      'frag',
    );
    return true;
  }

  // Everything but the pistol burns rounds.
  const slot = heldGunSlot(inv);
  if (slot) {
    if (slot.ammo <= 0) return false;
    slot.ammo--;
  }
  world.lastShotAt.set(id, now);

  if (held === 'cureGun') {
    fireSpecial(world, shooter, aim, def, 'cure', now);
  } else if (held === 'trackerDart') {
    fireSpecial(world, shooter, aim, def, 'dart', now);
  } else {
    // A planted bipod is the whole reason to carry the heavy MG: from the hip
    // it sprays, off the pegs it is one of the most accurate guns in the city.
    const bloom =
      def.deployable && isDeployed(world, id) ? (def.deployedBloom ?? 0.02) : (def.bloom ?? GUN_BLOOM_RAD);
    // Winding the charge rifle all the way up drives the round through a whole
    // queue of them; a snapped-off shot barely gets through one.
    const pierce = def.charge ? Math.max(1, Math.round((def.pierce ?? 1) * charge)) : (def.pierce ?? 1);
    const damageMul = def.charge ? charge : 1;

    const pellets = def.pellets ?? 1;
    for (let i = 0; i < pellets; i++) {
      fire(world, shooter, aim, bloom, now, def, pierce, damageMul);
    }
  }
  return true;
}

/** True once the bipod has finished planting — not merely while it's going down. */
export function isDeployed(world: World, id: string): boolean {
  const since = world.deployStart.get(id);
  return since !== undefined && Date.now() - since >= DEPLOY_MS;
}

/** 0-1 while the pegs go down, 1 once steady, -1 when there's no bipod at all. */
export function deployProgress(world: World, id: string, inv: Inventory): number {
  const held = heldItem(inv);
  if (!held || !ITEMS[held]?.deployable) return -1;
  const since = world.deployStart.get(id);
  if (since === undefined) return 0;
  return Math.min(1, (Date.now() - since) / DEPLOY_MS);
}

/** 0-1 while the charge rifle winds up, -1 when it isn't. */
export function chargeProgress(world: World, id: string, inv: Inventory): number {
  const held = heldItem(inv);
  if (!held || !ITEMS[held]?.charge) return -1;
  const since = world.chargeSince.get(id);
  if (since === undefined) return -1;
  return Math.min(1, (Date.now() - since) / (ITEMS[held].chargeMs ?? 1200));
}

/**
 * The bipod, and what invalidates it. Planting takes DEPLOY_MS during which
 * you're already rooted — commit early and you're caught standing still.
 */
function updateDeploy(world: World, id: string, inv: Inventory, wants: boolean): void {
  const held = heldItem(inv);
  const deployable = held !== null && ITEMS[held]?.deployable === true;
  // Putting the gun away packs the bipod up with it.
  if (!wants || !deployable) {
    world.deployStart.delete(id);
    return;
  }
  if (!world.deployStart.has(id)) world.deployStart.set(id, Date.now());
}

export function processShooting(world: World, now: number, frozen: Set<string>): void {
  for (const id of world.playerIds) {
    const shooter = world.entities.get(id);
    if (!shooter || shooter.type !== 'officer') continue;

    const inv = world.inventories.get(id);
    if (!inv) continue;
    const command = world.commands.get(id);

    // The bipod is worked whether or not the trigger is down, and a grappled
    // officer has rather more pressing problems than their firing position.
    updateDeploy(world, id, inv, !frozen.has(id) && command?.deploy === true);
    if (frozen.has(id)) {
      world.chargeSince.delete(id);
      continue;
    }
    if (!command) continue;

    const held = heldItem(inv);
    const def = held ? ITEMS[held] : null;

    // A charge weapon fires on release, not on press — holding winds it up.
    if (def?.charge) {
      if (command.shooting) {
        if (!world.chargeSince.has(id)) world.chargeSince.set(id, now);
        continue;
      }
      const since = world.chargeSince.get(id);
      if (since === undefined) continue;
      world.chargeSince.delete(id);
      // Letting go the instant you pressed still costs you a round, but it
      // barely leaves the barrel — you have to hold it to get anything.
      const charge = Math.max(
        CHARGE_MIN_FRACTION,
        Math.min(1, (now - since) / (def.chargeMs ?? 1200)),
      );
      fireHeld(world, shooter, inv, command.aim, now, charge);
      continue;
    }
    world.chargeSince.delete(id);

    if (!command.shooting) continue;
    fireHeld(world, shooter, inv, command.aim, now);
  }
}

