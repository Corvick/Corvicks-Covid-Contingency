import type { Wall, GunVoice } from '../../shared/types.js';
import {
  GUN_DAMAGE_MIN,
  GUN_DAMAGE_MAX,
  GUN_BLOOM_RAD,
  GUN_RANGE,
  GUN_COOLDOWN_MS,
  GUNSHOT_ALERT_RADIUS,
  ZOMBIE_LAST_SEEN_MS,
  ZOMBIE_PROVOKED_MS,
  ZOMBIE_RETALIATE_CHANCE,
  PLAYER_ONE_SHOT_KILL,
  MUZZLE_OFFSET_MUL,
  WINDOW_BULLET_DAMAGE,
  DOOR_BULLET_DAMAGE,
  SHOT_SLOW_MS,
  SHOT_SLOW_MULTIPLIER,
  ZOMBIE_ELITE_STAGGER_TIME_MUL,
  ZOMBIE_ELITE_STAGGER_STRENGTH,
  ENTITY_MAX_HEALTH,
  GRENADE_THROW_RANGE,
  GRENADE_COOLDOWN_MS,
  RADIO_USES,
  RADIO_COOLDOWN_MS,
  RADIO_STATIC_LINE,
  RADIO_SPEECH_MS,
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
  SHIELD_BASH_SHOW_MS,
  SHIELD_BASH_STAMINA,
  STAMINA_MAX,
  STAMINA_SPRINT_FLOOR,
  CHARGE_BARS,
  CHARGE_BASE_MUL,
  CHARGE_TOP_MUL,
  UNDEPLOY_MS,
  GRAPPLED_COOLDOWN_MUL,
} from '../../shared/constants.js';
import { throwGrenade } from './heli.js';
import { dogDamageMul, staggerDog } from './dog.js';
import { ITEMS, isGun, type ItemDef } from '../../shared/items.js';
import { angleDelta, segmentCircleT, segmentRectT, turnToward } from './geometry.js';
import {
  damageWindow,
  isInGrapple,
  letGoOf,
  isWindowIntact,
  killEntity,
  stillAlive,
  newAiState,
  rollSpeedMul,
  type Entity,
  type World,
} from './world.js';
import { heldGunSlot, heldItem, type Inventory } from './inventory.js';
import { damageDoor } from './doors.js';
import { scareDucks } from './ducks.js';
import { deployEmplacement } from './emplacement.js';
import { callBackup } from './backup.js';
import { sprayFlame } from './fire.js';
import { placeMine } from './mines.js';

/**
 * Gunfire is loud: every zombie in earshot investigates the shooter's position
 * whether or not it can see them. This is what stops a bush from being a
 * perfect firing blind.
 *
 * **It is a nudge, not a grudge**, and the difference is deliberate. Anyone in
 * earshot with nothing better to do wanders toward the bang, and a meal in
 * front of them still wins — hearing a shot is not the same as being shot, and
 * a 900px radius that *committed* everything in it would pull whole
 * neighbourhoods onto one officer every time a trigger was pulled. The
 * commitment is in `hit`, on the body that actually took the round.
 *
 * What it must not do is undo one. Somebody already provoked by a different
 * officer keeps that grudge — otherwise a teammate firing nearby quietly
 * re-aims the zombie you are being charged by, which is the same back-and-forth
 * from the other end.
 */
function alertZombies(
  world: World,
  shooterId: string,
  x: number,
  y: number,
  now: number,
): void {
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
    // Nor off somebody else who has already shot it.
    if (
      !zombieForgetsTheShooter &&
      state.provokedBy !== null &&
      state.provokedBy !== shooterId &&
      now < state.provokedUntil
    ) {
      continue;
    }
    state.lastSeenX = x;
    state.lastSeenY = y;
    state.lastSeenUntil = now + ZOMBIE_LAST_SEEN_MS;
    state.path = null;
    state.nextPathAt = 0;
  }
}

/**
 * True is the grudge as it was before the zombie was given a choice: every shot
 * turns it, and the prey it walked away from may pull it straight back.
 *
 * Kept rather than deleted with the measurement, like `setSettledStandsStill`:
 * "it decides once" means nothing without "and it used to decide twice a
 * second". `server/provoke.ts` reads it.
 */
let zombieAlwaysTakesTheBait = false;

export function setZombieAlwaysTakesTheBait(v: boolean): void {
  zombieAlwaysTakesTheBait = v;
}

/**
 * Put back the 45% roll and the 1.6s perception delay that the grudge
 * replaced, so `server/provoke.ts` has something to measure against. Read by
 * `senseTarget` as well, which is why it is exported from here rather than
 * kept in `ai.ts` — `ai.ts` imports this module and not the other way round.
 */
let zombieForgetsTheShooter = false;

export function setZombieForgetsTheShooter(v: boolean): void {
  zombieForgetsTheShooter = v;
}

export function forgetsTheShooter(): boolean {
  return zombieForgetsTheShooter;
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
 * Which recorded gunshot a round should play as — see `Shot.voice` and the
 * pools in `sound.ts`. By weapon *family*: the bolt action, the semi-auto and
 * the charge rifle all fire the same rifle round and share a voice, same as
 * `light` groups the pistol and its two-handed sibling. A grey officer firing
 * with no `def` at all is pistol-grade, exactly as `light` already treats it.
 */
function gunVoice(def: ItemDef | undefined): GunVoice | undefined {
  switch (def?.id) {
    case undefined:
    case 'pistol':
    case 'dualPistols':
      return 'pistol';
    case 'boltRifle':
    case 'semiAutoRifle':
    case 'chargeRifle':
      return 'rifle';
    case 'sniper':
      return 'sniper';
    case 'shotgun':
      return 'shotgun';
    case 'machineGun':
      return 'mg';
    case 'heavyMg':
      return 'heavyMg';
    default:
      // The flamethrower (a continuous stream, not a report) and anything
      // else with no gunshot voice of its own.
      return undefined;
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
  /** A round with enough behind it to carry through one wall or door. */
  throughWall = false,
  /**
   * Sideways offset from the body's centre line. Two pistols fire parallel a
   * hand's width apart rather than from the same muzzle, so the pair reads as
   * two guns instead of one shot drawn twice.
   */
  offset = 0,
): void {
  const angle = aim + (Math.random() * 2 - 1) * bloom;
  const range = def?.range ?? GUN_RANGE;
  // Start the round at the drawn barrel tip rather than the body centre.
  const sideX = -Math.sin(angle) * offset;
  const sideY = Math.cos(angle) * offset;
  const muzzleX = shooter.x + Math.cos(angle) * shooter.radius * MUZZLE_OFFSET_MUL + sideX;
  const muzzleY = shooter.y + Math.sin(angle) * shooter.radius * MUZZLE_OFFSET_MUL + sideY;
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
  // Whether the blocker that actually stopped the round (if any) was a wall
  // rather than a door — a door's own drawing runs after the wall pass, so a
  // mark baked for it would be painted straight over. See `Shot.wall`.
  let stoppedByWall = false;
  let skip = throughWall ? 1 : 0;
  for (const blocker of blockers) {
    if (blocker.door >= 0) damageDoor(world, blocker.door, DOOR_BULLET_DAMAGE);
    if (skip > 0) {
      skip--;
      continue;
    }
    wallT = blocker.t;
    stoppedByWall = blocker.door === -1;
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
    if (other.id === shooter.id) continue;
    // **Already dead and gone this tick.** The broadphase is a tick old, so the
    // body a previous pellet killed is still in it — and left in, the rest of
    // the shell is absorbed by something that is not there any more instead of
    // carrying on to whatever is behind it.
    if (!stillAlive(world, other.id)) continue;
    // Rounds pass through the living, with one exception: the charge rifle
    // will take down somebody already bitten. It is the one gun in the city
    // that can, which is what makes carrying it a decision — everything else
    // leaves you watching a neighbour turn.
    const infectedTarget =
      def?.charge === true && other.type !== 'zombie' && world.pendingInfections.has(other.id);
    if (other.type !== 'zombie' && !infectedTarget) continue;
    const t = segmentCircleT(muzzleX, muzzleY, endX, endY, other.x, other.y, other.radius);
    if (t !== null && t < wallT) hits.push({ entity: other, t });
  }
  hits.sort((a, b) => a.t - b.t);
  const struck = hits.slice(0, Math.max(1, pierce));

  const last = struck[struck.length - 1];
  // A piercing round carries on to the wall behind the last body it passes
  // through; an ordinary one stops in the first.
  const stopT = struck.length === 0 ? wallT : pierce > 1 ? wallT : last.t;
  // A sidearm does not open a body up the way a rifle does, so the client
  // throws a smaller, sparser blood mark for it. By weapon, not by damage: a
  // shotgun pellet is low per hit and still tears. A grey officer firing with
  // no `def` is pistol-grade and counts as light.
  const light = !def || def.id === 'pistol' || def.id === 'dualPistols';
  // The round's final resting point is against a wall only when nothing
  // living stopped it first — a piercing round that spends itself on a body
  // and never reaches the wall behind it leaves no hole, same as an ordinary
  // one that stops in somebody's chest.
  const hitWall = stoppedByWall && (struck.length === 0 || pierce > 1);
  const voice = gunVoice(def);
  world.shots.push({
    x1: Math.round(muzzleX),
    y1: Math.round(muzzleY),
    x2: Math.round(muzzleX + (endX - muzzleX) * stopT),
    y2: Math.round(muzzleY + (endY - muzzleY) * stopT),
    hit: struck.length > 0,
    ...(light ? { light: true } : {}),
    ...(hitWall ? { wall: true } : {}),
    ...(voice ? { voice } : {}),
    ...(def?.id === 'boltRifle' ? { bolt: true } : {}),
  });

  alertZombies(world, shooter.id, shooter.x, shooter.y, now);
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
  // **A dog tearing itself open takes a tenth.** Two seconds rooted in the open
  // is the whole vulnerability of a four-minute ability, and without the
  // reduction the answer to it is "shoot it while it stands still" — it would
  // never once complete in front of anybody worth using it on. Applied to the
  // roll rather than folded into `damageMul`, which is the *weapon's* business
  // and is passed in by the caller. A headshot and the one-shot test still
  // bypass it, exactly as they bypass everything else.
  const armour = dogDamageMul(world, victim.id);
  const damage =
    oneShot || headshot ? victim.health : Math.round(rolled * damageMul * armour);
  victim.health -= damage;

  if (victim.health > 0) {
    // A dog is driven rather than steered, so none of the AI reaction below
    // applies to it — but it still gets knocked about. A shorter stagger at
    // part strength: enough that walking into fire costs it the chase, not
    // enough to pin it while the street reloads. See `DOG_STAGGER_STRENGTH`.
    if (world.dogs.has(victim.id)) {
      staggerDog(
        world,
        victim.id,
        now,
        def?.slowMs ?? SHOT_SLOW_MS,
        def?.slowMul ?? SHOT_SLOW_MULTIPLIER,
      );
      return;
    }

    // A zombie mid-grapple keeps its grip and its facing — it doesn't look up.
    // Otherwise it spins toward the shot, and may break off to hunt the shooter.
    if (!world.playerIds.has(victim.id) && !isInGrapple(world, victim.id)) {
      let state = world.ai.get(victim.id);
      if (!state) {
        state = newAiState(now, victim.x, victim.y);
        world.ai.set(victim.id, state);
      }
      // Taking a round staggers them for a moment. A heavy rifle round puts
      // them down harder and for longer than a pistol does. This happens
      // whatever it decides below — being shot hurts either way.
      const slowMs = def?.slowMs ?? SHOT_SLOW_MS;
      const slowMul = def?.slowMul ?? SHOT_SLOW_MULTIPLIER;
      /**
       * **A converted SWAT operator or soldier shrugs a stagger off faster**,
       * the same trade the dog's own stagger already makes — trained and
       * armoured is what that means here rather than merely tougher. Checked
       * off `world.swat`/`world.soldiers`, which are never cleared off a
       * converted id, so this is exactly the veteran zombie the extra health
       * in `zombieHealthFor` gave to. Eased toward full speed rather than
       * scaled, so a `slowMul` of 1 (no slow at all) is left alone.
       */
      const elite = victim.type === 'zombie' && (world.swat.has(victim.id) || world.soldiers.has(victim.id));
      const easedMs = elite ? slowMs * ZOMBIE_ELITE_STAGGER_TIME_MUL : slowMs;
      const easedMul = elite ? 1 - (1 - slowMul) * ZOMBIE_ELITE_STAGGER_STRENGTH : slowMul;
      state.slowUntil = Math.max(state.slowUntil, now + easedMs);
      state.slowMul = Math.min(state.slowMul || 1, easedMul);

      /**
       * **Being shot is a commitment.**
       *
       * It used to be a 45% roll for a 1.6s delay on the next perception tick,
       * and both halves of that were wrong. The roll was made *per round that
       * landed*, so a burst re-decided the zombie several times a second; and a
       * delayed perception tick is not a decision, it is a pause before the old
       * decision is made again — 1.6s is exactly the "approaches me for one
       * second and then changes its mind" that was reported.
       *
       * The grudge is latched to the **first** shooter. Another officer landing
       * rounds on it meanwhile gets the flinch and the stagger and nothing else
       * — with three people firing, "commit to the one that shot at them
       * originally" is only meaningful if later shooters cannot take it over.
       */
      if (zombieForgetsTheShooter || zombieAlwaysTakesTheBait) {
        // Both controls keep the flinch on every round, which is what they had.
        const spin = Math.atan2(shooter.y - victim.y, shooter.x - victim.x);
        state.heading = spin;
        victim.facing = spin;
      }

      if (zombieForgetsTheShooter) {
        // The old behaviour, for the harness only: a coin toss per round that
        // landed, and a pause rather than a decision.
        const RETALIATE_CHANCE = 0.45;
        const RETALIATE_COMMIT_MS = 1600;
        if (Math.random() < RETALIATE_CHANCE) {
          state.lastSeenX = shooter.x;
          state.lastSeenY = shooter.y;
          state.lastSeenUntil = now + ZOMBIE_LAST_SEEN_MS;
          state.targetId = null;
          state.path = null;
          state.nextPathAt = 0;
          state.nextSenseAt = now + RETALIATE_COMMIT_MS;
        } else if (!state.targetId) {
          state.lastSeenX = shooter.x;
          state.lastSeenY = shooter.y;
          state.lastSeenUntil = now + ZOMBIE_LAST_SEEN_MS;
          state.path = null;
          state.nextPathAt = 0;
        }
        return;
      }

      /*
       * **And being shot is a decision, taken once.**
       *
       * The grudge above fixed a zombie being re-decided by every round in a
       * burst. What it did not fix is the other half of the same complaint,
       * reported later: shoot a zombie that is *chasing somebody* and it turns
       * toward you for a tick and is then pulled straight back, because a
       * zombie chasing somebody is by definition inside the pouncing-distance
       * carve-out that lets a provoked one take a body at its elbow. Turn,
       * pulled back, turn, pulled back.
       *
       * So it decides: come, or carry on. The roll happens **once**, here, when
       * the grudge is set — never per round, which is the trap the grudge
       * itself was written to get out of — and it only happens at all when
       * there is something to weigh the shot against. A zombie with nothing in
       * front of it always turns.
       */
      const held = state.provokedBy !== null && now < state.provokedUntil;
      if (!held) {
        const prey =
          state.targetId !== null && state.targetId !== shooter.id
            ? world.entities.get(state.targetId)
            : undefined;
        const busy = prey !== undefined && (prey.type === 'human' || prey.type === 'officer');
        state.provokedBy = shooter.id;
        // Set here as well as below, so a zombie that decides to carry on is
        // not asked again by the very next round of the same burst.
        state.provokedUntil = now + ZOMBIE_PROVOKED_MS;
        state.provokedTook =
          zombieAlwaysTakesTheBait || !busy || Math.random() < ZOMBIE_RETALIATE_CHANCE;
        state.provokedFrom =
          !zombieAlwaysTakesTheBait && state.provokedTook && busy ? state.targetId : null;
      }
      if (state.provokedBy === shooter.id && state.provokedTook) {
        /*
         * **The spin round is part of the decision, not part of the wound.**
         *
         * It used to happen on every round that landed, above all of this — and
         * on a zombie that then carried on chasing, that spin *is* the reported
         * twitch: the body snaps a hundred and eighty degrees toward the shot
         * and swings back over the next few ticks with nothing having changed.
         * A zombie that has decided to carry on does not look up; one that is
         * coming for you turns to face you, which it was going to do anyway.
         */
        const toShooter = Math.atan2(shooter.y - victim.y, shooter.x - victim.x);
        state.heading = toShooter;
        victim.facing = toShooter;

        state.provokedUntil = now + ZOMBIE_PROVOKED_MS;
        state.lastSeenX = shooter.x;
        state.lastSeenY = shooter.y;
        // The memory has to outlive its usual nine seconds, or the walk to the
        // spot expires under the grudge that is still standing.
        state.lastSeenUntil = state.provokedUntil;
        state.path = null;
        state.nextPathAt = 0;
        if (state.targetId !== shooter.id) state.targetId = null;
        // Look again *now* rather than in a moment. The old code pushed the next
        // perception tick away to protect the decision from being undone;
        // `senseTarget` protects it at the source now, so an immediate look is
        // free and is what lets a zombie shot at arm's length turn and take the
        // shooter on the very next tick.
        state.nextSenseAt = 0;
      }
    }
    return;
  }

  // Whether that is a body removed, an officer put back in the middle of town
  // or a dog standing up out of one of its own is `killEntity`'s business —
  // three copies of this used to disagree about it. `angle` is the round's
  // travel direction, so a shot shambler ragdolls the way it was going.
  killEntity(world, victim, now, angle);
}

/** Turns a zombie back into a civilian. */
function cure(world: World, victim: Entity, now: number): void {
  victim.type = 'human';
  victim.health = ENTITY_MAX_HEALTH.human;
  victim.maxHealth = ENTITY_MAX_HEALTH.human;
  victim.speedMul = rollSpeedMul('human');
  world.pendingInfections.delete(victim.id);
  // And the dog that bit them loses its claim on them. Left behind, somebody a
  // dog bit, a medic saved and a shambler later finished off would still bank a
  // charge for the dog — see `markDogBite`.
  world.infectedByDog.delete(victim.id);
  world.grappleCounts.delete(victim.id);
  world.ai.set(victim.id, newAiState(now, victim.x, victim.y));
}

/** Hitscan that heals instead of harming. */
function fireSpecial(world: World, shooter: Entity, aim: number, def: ItemDef, kind: 'cure', now: number): void {
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
    // Anyone still on their feet, not just civilians. An infected *officer* —
    // grey, bot or player — was being skipped outright here, so the dose went
    // straight through the one person you most wanted to save.
    const curable = other.type !== 'zombie' && world.pendingInfections.has(other.id);
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
  if (victim.type !== 'zombie') {
    // Caught in time: the infection simply doesn't take. Officers count —
    // grey, bot or player. Only an actual zombie needs turning back.
    world.pendingInfections.delete(victim.id);
    world.infectedByDog.delete(victim.id);
    world.grappleCounts.delete(victim.id);
  } else if (!world.playerIds.has(victim.id)) {
    cure(world, victim, now);
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

  // Something has hold of you. You can still work the trigger — that is the
  // whole point, being grabbed should be a fight rather than a cutscene — but
  // barely. Every cooldown below is measured against this.
  const grip = isInGrapple(world, id) ? GRAPPLED_COOLDOWN_MUL : 1;
  const ready = (interval: number) => now - (world.lastShotAt.get(id) ?? 0) >= interval * grip;

  // Sets down a gun crew facing the way you are. Spent only if it actually
  // found room to stand — otherwise you keep the item and can try elsewhere.
  if (held === 'pocketGunner') {
    if (!ready(GRENADE_COOLDOWN_MS)) return false;
    if (!deployEmplacement(world, shooter, now)) return false;
    world.lastShotAt.set(id, now);
    const at = inv.utilities.indexOf('pocketGunner');
    if (at >= 0) inv.utilities.splice(at, 1);
    inv.activeSlot = 0;
    return true;
  }

  // The handset. Three calls in it, a minute between them, and the *first* one
  // is the one worth having — it sends the van and the SWAT team in the back.
  // The two after it get a patrol car and two officers with rifles, which is
  // help, but it is not the same help, and spending the good call early is the
  // decision the item exists to pose.
  //
  // Squeeze it before dispatch will talk to you again and all you get is
  // noise, in the same jagged bubble a real reply comes back in — it is coming
  // out of the same handset on your own hip. Without that, pressing the button
  // during the minute does nothing whatsoever as far as the player can tell,
  // which is the exact problem the reply bubble exists to fix.
  if (held === 'radio') {
    if (!ready(GRENADE_COOLDOWN_MS)) return false;
    world.lastShotAt.set(id, now);

    if (now < inv.radioReadyAt) {
      world.speech.set(id, { text: RADIO_STATIC_LINE, until: now + RADIO_SPEECH_MS, radio: true });
      return true;
    }
    if (inv.radioUses <= 0) return false;

    // The van goes on the first call this radio has ever made, not on the
    // holder's first — which is what makes a radio somebody else has already
    // used worth less than one nobody has touched.
    const kind = inv.radioUses >= RADIO_USES ? 'van' : 'car';
    callBackup(world, shooter, now, kind);
    inv.radioUses--;
    inv.radioReadyAt = now + RADIO_COOLDOWN_MS;

    // Out of calls: the set is dead weight and goes, the way a spent bundle
    // clears its own slot.
    if (inv.radioUses <= 0) {
      const slotOf = inv.utilities.indexOf('radio');
      if (slotOf >= 0) inv.utilities.splice(slotOf, 1);
      inv.radioReadyAt = 0;
      inv.activeSlot = 0;
    }
    return true;
  }

  // The beacon is not fired and not planted where you stand. Left-click opens
  // a map of the city and the spot is picked off that, which arrives as its own
  // `beaconPlace` message — see `requestBeacon`. Nothing happens here, and the
  // item is never consumed: afterwards the same click opens the same map to
  // show how many have actually gathered at it.
  //
  // It is still caught here rather than falling through to `isGun`, because a
  // bot pulls this trigger through the same path a player does and must not be
  // left doing nothing at all with one in its hands.
  if (held === 'survivorBeacon') return false;

  // A mine goes down where you stand, arms after a beat, and is left behind.
  if (held === 'zapMine') {
    if (!ready(GRENADE_COOLDOWN_MS)) return false;
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
    if (!ready(GRENADE_COOLDOWN_MS)) return false;
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
    if (!ready(GRENADE_COOLDOWN_MS)) return false;
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
  if (!ready(def.cooldownMs ?? GUN_COOLDOWN_MS)) return false;

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

  // A gun in a utility slot has no magazine to draw on — its doses count down
  // on the bag, the way grenades and mines do, and the slot clears itself when
  // they run out.
  if (held === 'cureGun') {
    if (inv.cureDoses <= 0) return false;
    inv.cureDoses--;
    if (inv.cureDoses <= 0) {
      const at2 = inv.utilities.indexOf('cureGun');
      if (at2 >= 0) inv.utilities.splice(at2, 1);
      inv.activeSlot = 0;
    }
  } else {
    // Everything but the pistol burns rounds.
    const slot = heldGunSlot(inv);
    if (slot) {
      if (slot.ammo <= 0) return false;
      slot.ammo--;
    }
  }
  world.lastShotAt.set(id, now);

  if (held === 'flamethrower') {
    // Not a hitscan round: a stream that sets light to what it crosses, and
    // one that lands where the crosshair is rather than always at full reach.
    sprayFlame(world, shooter, aim, now, at);
  } else if (held === 'cureGun') {
    fireSpecial(world, shooter, aim, def, 'cure', now);
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
      ? CHARGE_BASE_MUL + (CHARGE_TOP_MUL - CHARGE_BASE_MUL) * ((level - 1) / (CHARGE_BARS - 1))
      : 1;
    const throughWall = def.charge === true && level >= CHARGE_BARS;

    const pellets = def.pellets ?? 1;
    // A shotgun throws its pellets in a cone from one barrel; dual pistols fire
    // theirs down parallel lines from two. `parallel` picks which.
    const gap = def.parallel ?? 0;
    // Parallel means *parallel*: the wobble is rolled once for the pull and
    // both barrels take it, rather than each round drifting on its own — roll
    // it per pellet and the two lines converge or splay and the whole point of
    // firing two guns is lost.
    const shared = gap === 0 ? aim : aim + (Math.random() * 2 - 1) * bloom;
    for (let i = 0; i < pellets; i++) {
      const offset = gap === 0 ? 0 : (i - (pellets - 1) / 2) * gap;
      const angle = gap === 0 ? aim : shared;
      fire(world, shooter, angle, gap === 0 ? bloom : 0, now, def, pierce, damageMul, throughWall, offset);
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
  // Shoving a body off you is work. Without a cost the bash is free crowd
  // control on a cooldown, and the cooldown alone never makes you choose
  // between shoving and running — the same bar pays for both now.
  const stamina = world.stamina.get(shooter.id) ?? STAMINA_MAX;
  if (world.exhausted.has(shooter.id) || stamina < SHIELD_BASH_STAMINA) return;
  if (!shieldShove(world, shooter, now)) return;
  const left = stamina - SHIELD_BASH_STAMINA;
  world.stamina.set(shooter.id, left);
  // Bashing yourself to a standstill latches the same exhaustion sprinting
  // does, so it costs you the getaway as well as the shove.
  if (left <= STAMINA_SPRINT_FLOOR) world.exhausted.add(shooter.id);
}

/**
 * The shove itself, with the cooldown and the animation, and nothing about who
 * paid for it.
 *
 * **Split out because a bot's reserve is not `world.stamina`.** That map is
 * per-connection and is maintained by `updatePlayers`; a bot carries its own
 * `botStamina` on its AiState, and writing a bot's id into the player map
 * would drain a pool nothing refills — three bashes and the bot would be in
 * `world.exhausted` for the rest of the round. So the caller pays in whatever
 * currency it has and this does the shoving. Returns false when the cooldown
 * has not come round.
 *
 * **And `cooldownMs` is part of the bill, not a knob.** A dispatched officer
 * has no stamina of any kind — see `SWAT_BASH_COOLDOWN_MS` — so the wait is
 * the whole of what a shove costs it, and the one caller with nothing else to
 * pay with is the one that passes a longer one.
 */
export function shieldShove(
  world: World,
  shooter: Entity,
  now: number,
  cooldownMs: number = SHIELD_BASH_COOLDOWN_MS,
): boolean {
  if (now < (world.bashReadyAt.get(shooter.id) ?? 0)) return false;

  world.bashReadyAt.set(shooter.id, now + cooldownMs);
  // Drives the shove animation on the client. Set whether or not anything was
  // standing there — a bash into thin air still costs the stamina, so it had
  // better look like it happened.
  world.bashUntil.set(shooter.id, now + SHIELD_BASH_SHOW_MS);

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
    // Shoved off a victim as well as backwards — and the grip ends with the
    // last grabber, or the man just shoved clear stays frozen in it.
    letGoOf(world, e.id);
  }
  return true;
}

/**
 * True is a player's right hand as it was while something had hold of them:
 * nothing at all. `server/swatbash.ts` reads it.
 */
let playerHeldCannotBash = false;

export function setPlayerHeldCannotBash(v: boolean): void {
  playerHeldCannotBash = v;
}

/**
 * What right-click meant. A tap works the bipod or bashes with the shield; a
 * hold slings the shield round to your back and back again.
 *
 * The button is reported raw and resolved here for the same reason E is: one
 * button has to carry two actions, and only the server knows which of them is
 * available. `spent` latches the hold so it fires once per press rather than
 * every tick the button stays down.
 *
 * **`pinned` narrows it to the shield.** A grappled officer is let this far so
 * that the one thing a shield is actually for is available in the one moment
 * it matters — a shove takes whatever it catches off the man it had hold of,
 * so it is the way out of the grip rather than a slower way to lose it. The
 * bipod and the sling are not: planting a machine gun, or swinging a shield
 * round onto your back, with something on your arm is not a thing anybody is
 * doing, which is the same line `processShooting` already draws for the mine.
 */
function processRightClick(
  world: World,
  shooter: Entity,
  inv: Inventory,
  down: boolean,
  now: number,
  pinned = false,
): void {
  const id = shooter.id;
  const pressedAt = world.rightHeld.get(id);

  if (down) {
    if (pressedAt === undefined) {
      world.rightHeld.set(id, now);
      return;
    }
    if (!pinned && !world.rightSpent.has(id) && now - pressedAt >= SHIELD_STOW_HOLD_MS && inv.shield > 0) {
      inv.shieldUp = !inv.shieldUp;
      world.rightSpent.add(id);
    }
    return;
  }

  if (pressedAt === undefined) return;
  if (!world.rightSpent.has(id) && now - pressedAt < TAP_MAX_MS) {
    if (inv.shield > 0 && inv.shieldUp) shieldBash(world, shooter, now);
    else if (pinned) {
      // Nothing else a tap could mean is available with something on your arm.
    } else if (world.deployWanted.has(id)) world.deployWanted.delete(id);
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

    // Right-click first: it decides whether the bipod is wanted at all.
    //
    // **A grappled officer is let through, for the shield alone.** Being
    // grabbed already stopped taking the gun off you; it stopped taking the
    // shield off you too late, and a shove is the one thing that ends a grip
    // from the victim's side — see `letGoOf`. Everything else right-click
    // means is still refused, inside `processRightClick` rather than here,
    // because "may I press the button" and "what does it do while I am held"
    // are two questions. The same exception the NPCs get in
    // `pinnedOfficerTick`, so a player is not the one body in the game that
    // cannot use their own kit.
    const pinned = !playerHeldCannotBash && isInGrapple(world, id);
    if (command && (!frozen.has(id) || pinned)) {
      processRightClick(world, shooter, inv, command.rightDown, now, pinned);
    } else {
      world.rightHeld.delete(id);
      world.rightSpent.delete(id);
    }
    updateDeploy(world, id, inv, !frozen.has(id) && world.deployWanted.has(id), now);
    // Being grabbed no longer takes the gun off you — `fireHeld` charges a
    // heavy cooldown for it instead. Everything *else* frozen still is: a mine
    // is meant to put you out, and planting a bipod with something on your arm
    // is not a thing anybody is doing.
    if (frozen.has(id) && !isInGrapple(world, id)) {
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

