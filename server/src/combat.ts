import type { Wall } from '../../shared/types.js';
import {
  GUN_DAMAGE_MIN,
  GUN_DAMAGE_MAX,
  GUN_BLOOM_RAD,
  GUN_RANGE,
  GUN_COOLDOWN_MS,
  GUNSHOT_ALERT_RADIUS,
  ZOMBIE_LAST_SEEN_MS,
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
  TAP_MAX_MS,
  SHIELD_STOW_HOLD_MS,
  SHIELD_BASH_RANGE,
  SHIELD_BASH_ARC,
  SHIELD_BASH_PUSH,
  SHIELD_BASH_SLOW_MS,
  SHIELD_BASH_SLOW_MUL,
  SHIELD_BASH_COOLDOWN_MS,
  SHIELD_BASH_STAMINA,
  STAMINA_MAX,
  STAMINA_SPRINT_FLOOR,
  CHARGE_BARS,
  CHARGE_BASE_MUL,
  UNDEPLOY_MS,
} from '../../shared/constants.js';
import { throwGrenade } from './heli.js';
import { ITEMS, isGun, type ItemDef } from '../../shared/items.js';
import { angleDelta, segmentCircleT, segmentRectT, turnToward } from './geometry.js';
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
import { deployEmplacement } from './emplacement.js';
import { sprayFlame } from './fire.js';
import { placeMine } from './mines.js';

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
    state.lastSeenUntil = now + ZOMBIE_LAST_SEEN_MS;
    state.path = null;
    state.nextPathAt = 0;
  }
}

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

/**
 * Where this officer is actually pointing, as against where the mouse is.
 *
 * Most weapons snap: the aim is the mouse and that is the end of it. A weapon
 * with a `turnRate` swings at a limited rate instead, and the *body* turns
 * with it — so the crosshair runs ahead and the stream drags round after it.
 * That lag is the whole of the flamethrower's weight; there is no separate
 * "heavy" flag and nothing branches on the item id.
 *
 * Called once per tick from `updatePlayers`, before anything fires, so the
 * facing that gets drawn and the direction that gets fired are the same value.
 */
export function steerAim(world: World, id: string, want: number, dt: number, now: number): number {
  const inv = world.inventories.get(id);
  const held = inv ? heldItem(inv) : null;
  let rate = held ? ITEMS[held]?.turnRate : undefined;

  // A planted bipod traverses freely. The heavy MG is the worst thing in the
  // city to swing from the hip and one of the best once it is down, and that
  // gap is most of the reason to put it down at all.
  if (rate !== undefined && held && ITEMS[held].deployable && isDeployed(world, id, now)) {
    rate = undefined;
  }

  if (rate === undefined) {
    // Snapping weapons still keep the map current, so switching to a heavy one
    // starts from where they were looking rather than from a stale bearing.
    world.aimHeading.set(id, want);
    return want;
  }

  const next = turnToward(world.aimHeading.get(id) ?? want, want, rate * dt);
  world.aimHeading.set(id, next);
  return next;
}

/** The lagged aim if this officer has one, otherwise wherever they're pointing. */
function aimFor(world: World, id: string, command: { aim: number }): number {
  return world.aimHeading.get(id) ?? command.aim;
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
  /** A round with enough behind it to carry through one wall or door. */
  throughWall = false,
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

  // Everything solid the line meets, nearest first. Walls and shut doors both
  // stop a round; a door also wears down under fire, though chewing one open
  // this way is slow enough that kicking it in is still the sane option.
  const blockers: Array<{ t: number; door: number }> = [];
  const walls = world.wallGrid.queryRect(minX, minY, maxX, maxY, new Set<Wall>());
  for (const wall of walls) {
    const t = segmentRectT(muzzleX, muzzleY, endX, endY, wall);
    if (t !== null) blockers.push({ t, door: -1 });
  }
  const slabs = world.doorGrid.queryRect(minX, minY, maxX, maxY, new Set<number>());
  for (const index of slabs) {
    const door = world.doors[index];
    if (!door || door.open || door.broken) continue;
    const t = segmentRectT(muzzleX, muzzleY, endX, endY, door.rect);
    if (t !== null) blockers.push({ t, door: index });
  }
  blockers.sort((a, b) => a.t - b.t);

  // A fully wound charge round goes through exactly one of them and stops at
  // the next. Everything else stops at the first.
  let wallT = 1;
  let skip = throughWall ? 1 : 0;
  for (const blocker of blockers) {
    if (blocker.door >= 0) damageDoor(world, blocker.door, DOOR_BULLET_DAMAGE);
    if (skip > 0) {
      skip--;
      continue;
    }
    wallT = blocker.t;
    break;
  }

  // Rounds punch through glass: the pane takes damage, the bullet carries on.
  const panes = world.windowGrid.queryRect(minX, minY, maxX, maxY, new Set<number>());
  for (const index of panes) {
    if (!isWindowIntact(world, index)) continue;
    const t = segmentRectT(muzzleX, muzzleY, endX, endY, world.map.windows[index]);
    if (t !== null && t <= wallT) damageWindow(world, index, WINDOW_BULLET_DAMAGE);
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
        state.lastSeenUntil = now + ZOMBIE_LAST_SEEN_MS;
        state.targetId = null;
        state.path = null;
        state.nextPathAt = 0;
        // Commit briefly so the next perception tick doesn't undo it.
        state.nextSenseAt = now + RETALIATE_COMMIT_MS;
      } else if (!state.targetId) {
        state.lastSeenX = shooter.x;
        state.lastSeenY = shooter.y;
        state.lastSeenUntil = now + ZOMBIE_LAST_SEEN_MS;
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
    if (other.id === shooter.id) continue;
    // The cure also takes on someone already bitten but still walking. Healthy
    // bystanders are ignored rather than blocking the shot — a dose spent on
    // somebody who was never infected is a dose wasted.
    const curable =
      kind === 'cure' && other.type === 'human' && world.pendingInfections.has(other.id);
    if (other.type !== 'zombie' && !curable) continue;
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
    if (victim.type === 'human') {
      // Caught in time: the infection simply doesn't take.
      world.pendingInfections.delete(victim.id);
      world.grappleCounts.delete(victim.id);
    } else if (!world.playerIds.has(victim.id)) {
      cure(world, victim, now);
    }
  } else {
    // Tracker dart: marks the target for the zombie-player hunt later on.
    world.trackedTargets.set(victim.id, now + TRACKER_DART_MS);
  }
}

/**
 * Where a lobbed round comes down. With an aim point it lands there, short of
 * the weapon's reach — so a shell drops on the crosshair rather than sailing
 * the full distance past whatever you were pointing at. Without one it falls
 * back to the old fixed-range throw, which is what a bot firing blind gets.
 */
function landingSpot(
  shooter: Entity,
  aim: number,
  reach: number,
  at?: { x: number; y: number },
): { x: number; y: number } {
  if (!at) {
    return { x: shooter.x + Math.cos(aim) * reach, y: shooter.y + Math.sin(aim) * reach };
  }
  const dx = at.x - shooter.x;
  const dy = at.y - shooter.y;
  const dist = Math.hypot(dx, dy);
  if (dist <= reach || dist === 0) return { x: at.x, y: at.y };
  // Out of range: as far along that line as the arm will throw.
  return { x: shooter.x + (dx / dist) * reach, y: shooter.y + (dy / dist) * reach };
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
  /**
   * Where a lobbed weapon should land. Hitscan ignores it; the launcher and
   * the smoke grenade land here rather than at a fixed distance along `aim`,
   * which is what makes the shell go where the crosshair is.
   */
  at?: { x: number; y: number },
): boolean {
  const id = shooter.id;
  const held = heldItem(inv);
  if (!held) return false;

  // Sets down a gun crew facing the way you are. Spent only if it actually
  // found room to stand — otherwise you keep the item and can try elsewhere.
  if (held === 'pocketGunner') {
    const last = world.lastShotAt.get(id) ?? 0;
    if (now - last < GRENADE_COOLDOWN_MS) return false;
    if (!deployEmplacement(world, shooter, now)) return false;
    world.lastShotAt.set(id, now);
    const at = inv.utilities.indexOf('pocketGunner');
    if (at >= 0) inv.utilities.splice(at, 1);
    inv.activeSlot = 0;
    return true;
  }

  // A mast goes down where you stand and stays there. The order that points
  // people at it comes off the Q wheel afterwards, so this only plants it.
  if (held === 'survivorBeacon') {
    const last = world.lastShotAt.get(id) ?? 0;
    if (now - last < GRENADE_COOLDOWN_MS) return false;
    world.lastShotAt.set(id, now);
    world.towers.push({ x: shooter.x, y: shooter.y });
    const slotOf = inv.utilities.indexOf('survivorBeacon');
    if (slotOf >= 0) inv.utilities.splice(slotOf, 1);
    inv.activeSlot = 0;
    return true;
  }

  // A mine goes down where you stand, arms after a beat, and is left behind.
  if (held === 'zapMine') {
    const last = world.lastShotAt.get(id) ?? 0;
    if (now - last < GRENADE_COOLDOWN_MS) return false;
    if (inv.mines <= 0) return false;
    world.lastShotAt.set(id, now);
    inv.mines--;
    placeMine(world, shooter, now);
    if (inv.mines <= 0) {
      const slotOf = inv.utilities.indexOf('zapMine');
      if (slotOf >= 0) inv.utilities.splice(slotOf, 1);
      inv.activeSlot = 0;
    }
    return true;
  }

  // A frag goes the same way the smoke does, and detonates like a launcher
  // shell. Three to a bundle, and the slot clears itself when they run out.
  if (held === 'grenade') {
    const last = world.lastShotAt.get(id) ?? 0;
    if (now - last < GRENADE_COOLDOWN_MS) return false;
    if (inv.grenades <= 0) return false;
    world.lastShotAt.set(id, now);
    inv.grenades--;

    const spot = landingSpot(shooter, aim, GRENADE_THROW_RANGE, at);
    throwGrenade(world, shooter.x, shooter.y, spot.x, spot.y, now, 'frag');
    if (inv.grenades <= 0) {
      const slotOf = inv.utilities.indexOf('grenade');
      if (slotOf >= 0) inv.utilities.splice(slotOf, 1);
      inv.activeSlot = 0;
    }
    return true;
  }

  // Smoke goes underarm toward the aim point, then calls in the helicopter.
  if (held === 'smokeGrenade') {
    const last = world.lastShotAt.get(id) ?? 0;
    if (now - last < GRENADE_COOLDOWN_MS) return false;
    world.lastShotAt.set(id, now);

    const spot = landingSpot(shooter, aim, GRENADE_THROW_RANGE, at);
    throwGrenade(world, shooter.x, shooter.y, spot.x, spot.y, now);
    const slotOf = inv.utilities.indexOf('smokeGrenade');
    if (slotOf >= 0) inv.utilities.splice(slotOf, 1);
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
    const spot = landingSpot(shooter, aim, def.range ?? GUN_RANGE, at);
    throwGrenade(world, shooter.x, shooter.y, spot.x, spot.y, now, 'frag');
    return true;
  }

  // Everything but the pistol burns rounds.
  const slot = heldGunSlot(inv);
  if (slot) {
    if (slot.ammo <= 0) return false;
    slot.ammo--;
  }
  world.lastShotAt.set(id, now);

  if (held === 'flamethrower') {
    // Not a hitscan round: a stream that sets light to what it crosses, and
    // one that lands where the crosshair is rather than always at full reach.
    sprayFlame(world, shooter, aim, now, at);
  } else if (held === 'cureGun') {
    fireSpecial(world, shooter, aim, def, 'cure', now);
  } else if (held === 'trackerDart') {
    fireSpecial(world, shooter, aim, def, 'dart', now);
  } else {
    // A planted bipod is the whole reason to carry the heavy MG: from the hip
    // it sprays, off the pegs it is one of the most accurate guns in the city.
    const bloom =
      def.deployable && isDeployed(world, id, now) ? (def.deployedBloom ?? 0.02) : (def.bloom ?? GUN_BLOOM_RAD);

    // The charge rifle winds up in four steps. One bar is one body; each bar
    // after that is one more, and the fourth drives the round through a wall
    // or a door as well. `charge` arrives as a fraction so bots — which fire
    // everything at full — land on the top bar without knowing any of this.
    const level = def.charge ? Math.max(1, Math.min(CHARGE_BARS, Math.round(charge * CHARGE_BARS))) : 0;
    const pierce = def.charge ? level : (def.pierce ?? 1);
    const damageMul = def.charge
      ? CHARGE_BASE_MUL + (1 - CHARGE_BASE_MUL) * ((level - 1) / (CHARGE_BARS - 1))
      : 1;
    const throughWall = def.charge === true && level >= CHARGE_BARS;

    const pellets = def.pellets ?? 1;
    for (let i = 0; i < pellets; i++) {
      fire(world, shooter, aim, bloom, now, def, pierce, damageMul, throughWall);
    }
  }
  return true;
}

/**
 * True once the bipod has finished planting — not merely while it's going
 * down, and not once it has started coming back up.
 */
export function isDeployed(world: World, id: string, now: number): boolean {
  if (world.stowing.has(id)) return false;
  const since = world.deployStart.get(id);
  return since !== undefined && now - since >= DEPLOY_MS;
}

/**
 * 0-1 while the pegs go down, 1 once steady, back down to 0 while it is being
 * packed away, -1 when there's no bipod at all.
 *
 * The way back down matters as much as the way up: the gauge draining is the
 * only thing telling you why you still can't move after right-clicking off.
 */
export function deployProgress(world: World, id: string, inv: Inventory, now: number): number {
  const held = heldItem(inv);
  if (!held || !ITEMS[held]?.deployable) return -1;

  const stow = world.stowing.get(id);
  if (stow !== undefined) {
    return clamp01(stow.from * (1 - (now - stow.at) / UNDEPLOY_MS));
  }

  const since = world.deployStart.get(id);
  if (since === undefined) return 0;
  return clamp01((now - since) / DEPLOY_MS);
}

/** 0-1 while the charge rifle winds up, -1 when it isn't. */
export function chargeProgress(world: World, id: string, inv: Inventory, now: number): number {
  const held = heldItem(inv);
  if (!held || !ITEMS[held]?.charge) return -1;
  const since = world.chargeSince.get(id);
  if (since === undefined) return -1;
  return clamp01((now - since) / (ITEMS[held].chargeMs ?? 1200));
}

/**
 * Shove whatever is in front of you and stagger it. The shield's one active
 * use, and the way out when three of them have you against a wall.
 */
function shieldBash(world: World, shooter: Entity, now: number): void {
  if (now < (world.bashReadyAt.get(shooter.id) ?? 0)) return;

  // Shoving a body off you is work. Without a cost the bash is free crowd
  // control on a cooldown, and the cooldown alone never makes you choose
  // between shoving and running — the same bar pays for both now.
  const stamina = world.stamina.get(shooter.id) ?? STAMINA_MAX;
  if (world.exhausted.has(shooter.id) || stamina < SHIELD_BASH_STAMINA) return;
  const left = stamina - SHIELD_BASH_STAMINA;
  world.stamina.set(shooter.id, left);
  // Bashing yourself to a standstill latches the same exhaustion sprinting
  // does, so it costs you the getaway as well as the shove.
  if (left <= STAMINA_SPRINT_FLOOR) world.exhausted.add(shooter.id);

  world.bashReadyAt.set(shooter.id, now + SHIELD_BASH_COOLDOWN_MS);

  for (const e of world.entityGrid.queryCircle(
    shooter.x,
    shooter.y,
    SHIELD_BASH_RANGE,
    new Set<Entity>(),
  )) {
    if (e.type !== 'zombie') continue;
    const dx = e.x - shooter.x;
    const dy = e.y - shooter.y;
    const dist = Math.hypot(dx, dy);
    if (dist > SHIELD_BASH_RANGE || dist === 0) continue;
    // Only what the shield actually faces. Being flanked is the cost of it.
    if (Math.abs(angleDelta(Math.atan2(dy, dx), shooter.facing)) > SHIELD_BASH_ARC) continue;

    e.x += (dx / dist) * SHIELD_BASH_PUSH;
    e.y += (dy / dist) * SHIELD_BASH_PUSH;
    const state = world.ai.get(e.id);
    if (state) {
      state.slowUntil = Math.max(state.slowUntil, now + SHIELD_BASH_SLOW_MS);
      state.slowMul = Math.min(state.slowMul || 1, SHIELD_BASH_SLOW_MUL);
    }
    // Shoved off a victim as well as backwards.
    for (const session of world.grapples.values()) session.zombieIds.delete(e.id);
  }
}

/**
 * What right-click meant. A tap works the bipod or bashes with the shield; a
 * hold slings the shield round to your back and back again.
 *
 * The button is reported raw and resolved here for the same reason E is: one
 * button has to carry two actions, and only the server knows which of them is
 * available. `spent` latches the hold so it fires once per press rather than
 * every tick the button stays down.
 */
function processRightClick(
  world: World,
  shooter: Entity,
  inv: Inventory,
  down: boolean,
  now: number,
): void {
  const id = shooter.id;
  const pressedAt = world.rightHeld.get(id);

  if (down) {
    if (pressedAt === undefined) {
      world.rightHeld.set(id, now);
      return;
    }
    if (!world.rightSpent.has(id) && now - pressedAt >= SHIELD_STOW_HOLD_MS && inv.shield > 0) {
      inv.shieldUp = !inv.shieldUp;
      world.rightSpent.add(id);
    }
    return;
  }

  if (pressedAt === undefined) return;
  if (!world.rightSpent.has(id) && now - pressedAt < TAP_MAX_MS) {
    if (inv.shield > 0 && inv.shieldUp) shieldBash(world, shooter, now);
    else if (world.deployWanted.has(id)) world.deployWanted.delete(id);
    else world.deployWanted.add(id);
  }
  world.rightHeld.delete(id);
  world.rightSpent.delete(id);
}

/**
 * The bipod, and what invalidates it. Planting takes DEPLOY_MS during which
 * you're already rooted — commit early and you're caught standing still — and
 * a second right-click packs it up again, which takes UNDEPLOY_MS and roots
 * you for that too. Getting up is a decision, not a free cancel.
 */
function updateDeploy(world: World, id: string, inv: Inventory, wants: boolean, now: number): void {
  const held = heldItem(inv);
  const deployable = held !== null && ITEMS[held]?.deployable === true;

  // Switching weapons away from it packs the bipod up there and then — you
  // can't be pinned behind a gun you are no longer holding.
  if (!deployable) {
    world.deployStart.delete(id);
    world.stowing.delete(id);
    return;
  }

  if (wants) {
    world.stowing.delete(id);
    if (!world.deployStart.has(id)) world.deployStart.set(id, now);
    return;
  }

  // Right-clicked off. Nothing to pack up if it was never down.
  if (!world.deployStart.has(id)) {
    world.stowing.delete(id);
    return;
  }

  let stow = world.stowing.get(id);
  if (!stow) {
    // Remember how far up it actually got, so a bipod cancelled halfway
    // through planting drains from halfway rather than snapping to full.
    const planted = Math.min(1, (now - (world.deployStart.get(id) ?? now)) / DEPLOY_MS);
    stow = { at: now, from: planted };
    world.stowing.set(id, stow);
  }
  if (now - stow.at >= UNDEPLOY_MS) {
    world.deployStart.delete(id);
    world.stowing.delete(id);
  }
}

export function processShooting(world: World, now: number, frozen: Set<string>): void {
  for (const id of world.playerIds) {
    const shooter = world.entities.get(id);
    if (!shooter || shooter.type !== 'officer') continue;

    const inv = world.inventories.get(id);
    if (!inv) continue;
    const command = world.commands.get(id);

    // Right-click first: it decides whether the bipod is wanted at all, and a
    // grappled officer has rather more pressing problems than either.
    if (command && !frozen.has(id)) processRightClick(world, shooter, inv, command.rightDown, now);
    else {
      world.rightHeld.delete(id);
      world.rightSpent.delete(id);
    }
    updateDeploy(world, id, inv, !frozen.has(id) && world.deployWanted.has(id), now);
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

      // Below the first bar there is not enough in it to fire at all, and it
      // costs nothing — a mis-click is not a wasted round. Firing on the bar
      // rather than on the raw fraction is what makes the four-segment gauge
      // tell the truth: what you see filled is what you get.
      const wound = Math.min(1, (now - since) / (def.chargeMs ?? 1200));
      const bars = Math.floor(wound * CHARGE_BARS);
      if (bars < 1) continue;

      fireHeld(world, shooter, inv, aimFor(world, id, command), now, bars / CHARGE_BARS, {
        x: command.aimX,
        y: command.aimY,
      });
      continue;
    }
    world.chargeSince.delete(id);

    if (!command.shooting) continue;
    // Fired along where they are actually pointing, not where the mouse is —
    // for a heavy weapon those differ, and the stream has to follow the body.
    fireHeld(world, shooter, inv, aimFor(world, id, command), now, 1, {
      x: command.aimX,
      y: command.aimY,
    });
  }
}

