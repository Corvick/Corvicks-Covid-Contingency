import type { DogAbilityHud, DogHud, LashState, TentacleState } from '../../shared/types.js';
import {
  DOG_ABILITY_SLOTS,
  DOG_ART_RADIUS,
  DOG_BITE_ARC,
  DOG_BITE_COOLDOWN_MS,
  DOG_BITE_MIN_MS,
  DOG_BITE_MS,
  DOG_BIRTH_MS,
  DOG_BITE_REACH,
  DOG_BODY_DEADZONE,
  DOG_BODY_TURN_RATE,
  DOG_DEATH_MS,
  DOG_DOOR_DAMAGE,
  DOG_DRAG_PULL,
  DOG_HEAD_MAX_YAW,
  DOG_HEAD_TURN_RATE,
  DOG_LATCHED_TURN_MUL,
  DOG_JAWS_OPEN_MS,
  DOG_MAP_CONTACT_RANGE,
  DOG_MAP_REFRESH_MS,
  DOG_MUZZLE_OUT,
  DOG_ROAR_CALL_COUNT,
  DOG_ROAR_COOLDOWN_MS,
  DOG_ROAR_MS,
  DOG_ROAR_ORDER_MS,
  DOG_ROAR_RANGE,
  DOG_SHAKE_THROW,
  DOG_SPEED,
  DOG_SPIT_COOLDOWN_MS,
  DOG_SPIT_UNLOCK_AT,
  DOG_MAX_HEALTH,
  DOG_RADIUS,
  DOG_MORPH_WINDUP_MS,
  DOG_MORPH_MS,
  DOG_MORPH_COOLDOWN_MS,
  DOG_MORPH_DAMAGE_MUL,
  DOG_MORPH_HEALTH_MUL,
  DOG_MORPH_SPRINT_MUL,
  DOG_MORPH_RADIUS,
  DOG_MORPH_UNLOCK_CONVERTED,
  DOG_LASH_RANGE,
  DOG_LASH_WIDTH,
  DOG_LASH_COOLDOWN_MS,
  DOG_LASH_SHOW_MS,
  DOG_BURST_CLOUD_MUL,
  DOG_BURST_TENTACLES,
  DOG_BURST_THROW,
  DOG_BURST_FLIGHT_MS,
  DOG_BURST_LIE_MS,
  ACID_CLOUD_RADIUS,
  GRENADE_BOUNCE,
  WALL_THICKNESS,
  TURN_DELAY_MIN_MS,
  TURN_DELAY_MAX_MS,
  DOG_SPRINT_MULTIPLIER,
  DOG_STAGGER_STRENGTH,
  DOG_STAGGER_TIME_MUL,
  DOG_STAMINA_DRAIN_PER_SEC,
  DOG_STAMINA_REGEN_PER_SEC,
  DOG_WIGGLE_MIN_RAD,
  DOG_WIGGLE_MS_PER_RAD,
  STAMINA_MAX,
  STAMINA_RECOVERY_THRESHOLD,
  STAMINA_SPRINT_FLOOR,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from '../../shared/constants.js';
import { angleDelta, clamp, turnToward } from './geometry.js';
import { layCloud, spitAcid } from './acid.js';
import { bouncesOff } from './heli.js';
import { attemptGrab } from './ai.js';
import { damageDoor } from './doors.js';
import {
  beginDogBirth,
  finishDogBirth,
  isMorphed,
  killEntity,
  hasLineOfSight,
  hasWallClearPath,
  spawnAtBreach,
  speedAt,
  type Command,
  type Entity,
  type World,
} from './world.js';

/**
 * The zombie dog, as a thing the server owns.
 *
 * It is not an AI at all: there is no perception tick, no path, no traits and
 * no `AiState`. Everything a shambler needs those for, a person is doing with
 * a mouse. What lives here instead is the small amount of state a body with a
 * neck and a set of jaws needs between ticks.
 */
export interface DogState {
  /**
   * Where the head is pointing. It leads the body toward the mouse and the
   * shoulders swing after it, which is the whole feel of driving one —
   * see `DOG_HEAD_TURN_RATE` against `DOG_BODY_TURN_RATE`.
   */
  head: number;
  /** The head last tick, so shaking is *measured* rather than inferred. */
  lastHead: number;
  /** Earliest the jaws may open again. */
  biteReadyAt: number;
  /**
   * When the jaws were opened, or 0 while they are shut.
   *
   * The bite is a *held* thing rather than a snap: the trigger holds the mouth
   * open and the first body to walk into it is taken. That is what a dog
   * charging somebody actually looks like, and it moves the skill from timing a
   * click to putting the animal in the right place.
   */
  jawsOpenedAt: number;
  /** Whoever is in its teeth, or null. */
  victimId: string | null;
  /**
   * When the jaws went in, and how long the bite was going to take before any
   * shaking. The start is what `DOG_BITE_MIN_MS` is measured from — see
   * `creditShake`, where measuring it from *now* is a bug that never resolves.
   */
  biteStartedAt: number;
  biteTotalMs: number;
  /** How much of that the shaking has torn off so far. */
  shakenMs: number;
  /**
   * The shake in progress: which way the head is going, and how far it has
   * gone that way. A shake is a *reversal* — the run is only banked when the
   * head comes back the other way. See `DOG_WIGGLE_MS_PER_RAD`.
   */
  wiggleDir: number;
  wiggleRun: number;
  /**
   * Knocked about by a round: how long it lasts and how hard it bites. The
   * shamblers carry the same pair on their `AiState` and `step` reads it; a dog
   * has no AiState, so its legs read it here instead — see `staggerDog`.
   */
  slowUntil: number;
  slowMul: number;
  /**
   * When the roar began, or 0 while it is not roaring.
   *
   * A clock rather than a flag, because three separate things read it: the legs
   * (rooted), the wire (the mouth is open and the rings are coming off it) and
   * the HUD (how far through the two seconds it is). One timestamp answers all
   * three and cannot fall out of step with itself the way three booleans would.
   */
  roarStartedAt: number;
  /**
   * The transformation: when the wind-up began, and when the form it produces
   * runs out. Both 0 the rest of the time.
   *
   * **Both belong to the body**, unlike the cooldown — a dog shot half way
   * through tearing itself open does not get up two seconds later as the
   * monster, and one killed at second nineteen does not rise still transformed.
   * `killEntity` clears them beside `roarStartedAt` and for the same reason.
   */
  morphStartedAt: number;
  morphedUntil: number;
  /** Between tentacle lashes — see `DOG_LASH_COOLDOWN_MS`. */
  lashReadyAt: number;
  /**
   * **The ability cooldowns are deliberately not here.** They live on
   * `World.dogCooldowns`, keyed by connection and by ability slot, because this
   * state is *deleted* on every respawn — which is right for everything that is
   * in it and wrong for a cooldown. Left here, the cheapest way to have the
   * acid back was to go and get shot: 22s of cooldown against under four
   * seconds of dying and rising again.
   */
}

/** A tentacle thrown out of a burst, on grenade physics until it comes to rest. */
export interface Tentacle {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Which way it is lying. Spun while it flies, held once it lands. */
  a: number;
  spin: number;
  /** How long it has been going, against its flight and then its lie. */
  age: number;
}

/** A lash going out, kept only long enough to be drawn. */
export interface Lash {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  hit: boolean;
  until: number;
}

/**
 * A round landing on the dog. Called from `hit`, which has no idea a dog is
 * different from any other zombie — everything that makes it different is here.
 */
export function staggerDog(
  world: World,
  id: string,
  now: number,
  slowMs: number,
  slowMul: number,
): void {
  const dog = world.dogState.get(id);
  if (!dog) return;
  dog.slowUntil = Math.max(dog.slowUntil, now + slowMs * DOG_STAGGER_TIME_MUL);
  // Part of the weapon's own slow rather than all of it. Taken as the harshest
  // one in force, like the shamblers', so two rifles do not cancel out.
  const eased = 1 - (1 - slowMul) * DOG_STAGGER_STRENGTH;
  dog.slowMul = Math.min(dog.slowMul >= 1 ? eased : dog.slowMul, eased);
}

/**
 * The dog's state, made on first use. Kept here rather than at spawn so there
 * is exactly one place that knows what a fresh one looks like — `spawnDog`
 * deletes the old one and this rebuilds it.
 */
function dogStateFor(world: World, id: string, facing: number): DogState {
  let dog = world.dogState.get(id);
  if (!dog) {
    dog = {
      head: facing,
      lastHead: facing,
      biteReadyAt: 0,
      jawsOpenedAt: 0,
      victimId: null,
      biteStartedAt: 0,
      biteTotalMs: DOG_BITE_MS,
      shakenMs: 0,
      wiggleDir: 0,
      wiggleRun: 0,
      slowUntil: 0,
      slowMul: 1,
      roarStartedAt: 0,
      morphStartedAt: 0,
      morphedUntil: 0,
      lashReadyAt: 0,
    };
    world.dogState.set(id, dog);
  }
  return dog;
}

/**
 * When ability `slot` may be used again, and how it is put on cooldown.
 *
 * Two lines that exist so nothing has to know the shape of the map — and so
 * that "read the deadline" and "set the deadline" cannot end up disagreeing
 * about where it lives, which is exactly how it came to be on `DogState` and
 * therefore refreshed by dying. See `World.dogCooldowns`.
 */
/**
 * And the lash's own short deadline, which lives on  rather than in
 * the slot map — it belongs to the body, the way a bite in progress does.
 * Read through a function of its own so the testing switch has one place to
 * be honoured here too.
 */
function lashReadyAt(world: World, dog: DogState | undefined): number {
  if (free(world)) return 0;
  return dog?.lashReadyAt ?? 0;
}

function readyAt(world: World, id: string, slot: number): number {
  // TESTING: every hexagon comes good at once. Gated on the round actually
  // being offline here rather than where the flag is set — see
  // `World.noDogCooldowns`.
  if (free(world)) return 0;
  return world.dogCooldowns.get(id)?.[slot] ?? 0;
}

function coolDown(world: World, id: string, slot: number, until: number): void {
  let bar = world.dogCooldowns.get(id);
  if (!bar) {
    bar = new Array(DOG_ABILITY_SLOTS).fill(0);
    world.dogCooldowns.set(id, bar);
  }
  bar[slot] = until;
}

// ------------------------------------------------ the transformation (F)

/**
 * Is F available at all — to every dog in the lobby at once.
 *
 * **One global threshold, not a per-dog one.** `world.totalConverted` is the
 * whole outbreak's tally — every human turned, by any zombie, dog or shambler
 * — so this takes no `id` at all: the city crossing `DOG_MORPH_UNLOCK_CONVERTED`
 * opens the ability for everybody driving one, whatever any single animal has
 * personally bitten.
 */
export function morphUnlocked(world: World): boolean {
  if (free(world)) return true;
  return world.totalConverted >= DOG_MORPH_UNLOCK_CONVERTED;
}

/**
 * And the acid's own gate: fifteen people this dog has *turned*.
 *
 * A function of its own rather than the comparison written out at the two
 * places that need it — the refusal in `startDogAbility` and the count on the
 * hexagon — which is the same shape `morphUnlocked` has and for the same
 * reason. Written twice they drift into a key that works beside a hexagon
 * saying it does not, which is precisely the failure the count exists to
 * prevent.
 */
export function spitUnlocked(world: World, id: string): boolean {
  if (free(world)) return true;
  return (world.dogTurned.get(id) ?? 0) >= DOG_SPIT_UNLOCK_AT;
}

/**
 * **TESTING: the dog's abilities with nothing in the way** — no cooldowns, and
 * no unlock requirements either.
 *
 * Read by `readyAt`, `lashReadyAt`, `spitUnlocked` and `morphUnlocked`, which
 * between them are every gate on the bar. That is four lines rather than a
 * branch per ability, and it is the whole reason the cooldowns were moved onto
 * the world and the unlocks were given helpers.
 *
 * **Only ever while the round is genuinely offline**, and the check lives here
 * rather than where the flag is set. A setting the menu declines to offer is
 * still in `localStorage` and would otherwise be carried into an online round
 * without anybody touching anything — the trap `noFog` already documents — and
 * a client that lies about being offline changes nothing, because this reads
 * the server's own `world.offline`.
 */
function free(world: World): boolean {
  return world.dogAbilitiesFree && world.offline;
}


/**
 * What a round does to a dog — a tenth of it while the wind-up is running.
 *
 * Read by `hit`, which knows nothing about dogs beyond `staggerDog`. Two
 * seconds rooted in the open is the whole vulnerability of a four-minute
 * ability, and without this the counter to it is "shoot it while it stands
 * still", which means it never once completes in front of anybody worth using
 * it on. The transformed form that follows takes rounds like anything else —
 * what it got instead is `DOG_MORPH_HEALTH_MUL`.
 */
export function dogDamageMul(world: World, id: string): number {
  const dog = world.dogState.get(id);
  return dog && dog.morphStartedAt > 0 ? DOG_MORPH_DAMAGE_MUL : 1;
}

/**
 * The wind-up finishing, and then the twenty seconds running out.
 *
 * Both ends in one place and called from `dogTick`, so there is nowhere else
 * that knows how the form starts or stops. The ending is `killEntity`: the dog
 * bursts, which is a death — it drops its body, it costs a life, and it rises
 * again out of a shambler like any other. See `World.pendingBursts` for why the
 * cloud and the tentacles are queued rather than thrown from here.
 */
function morphTick(world: World, e: Entity, dog: DogState, now: number): void {
  if (dog.morphStartedAt > 0 && now - dog.morphStartedAt >= DOG_MORPH_WINDUP_MS) {
    dog.morphStartedAt = 0;
    dog.morphedUntil = now + DOG_MORPH_MS;
    // Six times the health, and a body four pixels wider — see
    // `DOG_MORPH_ART_MUL` for why the *drawing* nearly doubles and this does
    // not. Health is set as well as the ceiling, or a dog that transformed at
    // half health would come out of it on a sixth of its new bar.
    e.maxHealth = DOG_MAX_HEALTH * DOG_MORPH_HEALTH_MUL;
    e.health = e.maxHealth;
    e.radius = DOG_MORPH_RADIUS;
    return;
  }

  if (dog.morphedUntil > 0 && now >= dog.morphedUntil) killEntity(world, e, now);
}

/**
 * A tentacle out at the cursor, and whoever it lands on is infected.
 *
 * **It infects rather than damaging**, which is the whole of what the
 * transformed dog is for: it is far too slow to run anybody down, so its work
 * is done at arm's length. A body already incubating is passed over rather than
 * re-bitten — the same rule `resolveGrapple` follows, and for the same reason:
 * the first set of teeth turned them and there is only one body to count.
 *
 * Nearest first along the line, so a lash into a crowd catches the front of it
 * rather than whoever happens to be enumerated first.
 */
function lashOut(world: World, e: Entity, dog: DogState, command: Command, now: number): void {
  const aim = Math.atan2(command.aimY - e.y, command.aimX - e.x);
  const reach = clamp(Math.hypot(command.aimX - e.x, command.aimY - e.y), 40, DOG_LASH_RANGE);
  const tipX = e.x + Math.cos(aim) * reach;
  const tipY = e.y + Math.sin(aim) * reach;

  let best: Entity | null = null;
  let bestAlong = Infinity;
  for (const other of world.entities.values()) {
    if (other.id === e.id || other.type === 'zombie') continue;
    if (world.pendingInfections.has(other.id)) continue;
    // Distance along the lash, and distance off it. A body behind the dog has a
    // negative `along` and is not in front of anything.
    const along = (other.x - e.x) * Math.cos(aim) + (other.y - e.y) * Math.sin(aim);
    if (along < 0 || along > reach) continue;
    const off = Math.abs(-(other.x - e.x) * Math.sin(aim) + (other.y - e.y) * Math.cos(aim));
    if (off > DOG_LASH_WIDTH + other.radius) continue;
    /**
     * **A physical line, not a sight line**, and the difference is not academic
     * in either direction.
     *
     * `hasLineOfSight` waves *glass* through, which is the whole point of glass
     * — and a tentacle does not go through an intact window. It also stops at
     * *foliage*, and a tentacle very much does go through a hedge, exactly as a
     * blast does. So a sight test is wrong on both counts and happens to be
     * wrong in opposite directions.
     *
     * `hasWallClearPath` is the one predicate in the game that asks whether a
     * physical thing can get from here to there: walls, intact glass, shut
     * doors and parked vehicles, with bushes waved through. It is what
     * `headingToward` asks about *walking*, and reaching somebody with a limb
     * is the same question.
     */
    if (!hasWallClearPath(world, e.x, e.y, other.x, other.y)) continue;
    if (along < bestAlong) {
      bestAlong = along;
      best = other;
    }
  }

  dog.lashReadyAt = now + DOG_LASH_COOLDOWN_MS;
  const caught = best !== null;
  if (best) {
    infectByLash(world, e.id, best, now);
  }
  world.lashes.push({
    x1: e.x,
    y1: e.y,
    x2: caught ? best!.x : tipX,
    y2: caught ? best!.y : tipY,
    hit: caught,
    until: now + DOG_LASH_SHOW_MS,
  });
}

/**
 * Infect somebody the lash caught.
 *
 * **Not `markDogBite`**: that one reads a grapple session to find out whose
 * teeth these were, and a lash is not a grapple. What it must share is
 * `infectedByDog`, so the conversion — when it lands, in `convert` — still
 * credits this dog's own roar balance and total, exactly as a bite does.
 */
function infectByLash(world: World, dogId: string, target: Entity, now: number): void {
  if (world.pendingInfections.has(target.id)) return;
  world.infectedByDog.set(target.id, dogId);
  world.pendingInfections.set(
    target.id,
    now + TURN_DELAY_MIN_MS + Math.random() * (TURN_DELAY_MAX_MS - TURN_DELAY_MIN_MS),
  );
}

/**
 * A dog that has burst: a toxic cloud where it stood, and its own tentacles
 * thrown out on grenade physics.
 *
 * Drained here rather than done in `killEntity` because the cloud belongs to
 * `acid.ts` and `world.ts` may not load it — see `World.pendingBursts`. The
 * grey corpse pieces are not here at all: the client throws those itself off
 * the body leaving the snapshot, exactly as it throws the gore when a birth
 * host bursts and exactly as blood is derived from `Shot.hit`.
 */
function drainBursts(world: World, now: number): void {
  for (const at of world.pendingBursts) {
    layCloud(world, at.x, at.y, ACID_CLOUD_RADIUS * DOG_BURST_CLOUD_MUL, now);
    for (let i = 0; i < DOG_BURST_TENTACLES; i++) {
      // Fanned round the whole circle rather than thrown forward: the thing has
      // come apart, and a directed spray would read as an attack.
      const a = (i / DOG_BURST_TENTACLES) * Math.PI * 2 + Math.random() * 0.5;
      const reach = DOG_BURST_THROW * (0.45 + Math.random() * 0.55);
      const flight = DOG_BURST_FLIGHT_MS / 1000;
      const id = `tent-${tentacleCounter++}`;
      world.tentacles.set(id, {
        id,
        x: at.x,
        y: at.y,
        vx: (Math.cos(a) * reach) / flight,
        vy: (Math.sin(a) * reach) / flight,
        a,
        spin: (Math.random() - 0.5) * 9,
        age: 0,
      });
    }
  }
  world.pendingBursts.length = 0;
}

let tentacleCounter = 0;

/**
 * Tentacles in the air and then lying about, and lashes fading off the screen.
 *
 * The flight is the gobbet's, which is the grenades' — substepped against
 * `WALL_THICKNESS / 2` for the same reason and it is not optional here either:
 * a tentacle covers `DOG_BURST_THROW` in `DOG_BURST_FLIGHT_MS`, which is a
 * larger step than a wall is thick.
 */
function updateTentacles(world: World, now: number, dt: number): void {
  for (const [key, t] of world.tentacles) {
    t.age += dt * 1000;
    if (t.age >= DOG_BURST_FLIGHT_MS + DOG_BURST_LIE_MS) {
      world.tentacles.delete(key);
      continue;
    }
    if (t.age >= DOG_BURST_FLIGHT_MS) continue; // landed; it just lies there

    const speed = Math.hypot(t.vx, t.vy);
    const steps = Math.max(1, Math.ceil((speed * dt) / (WALL_THICKNESS / 2)));
    const sub = dt / steps;
    for (let i = 0; i < steps; i++) {
      const nx = t.x + t.vx * sub;
      const ny = t.y + t.vy * sub;
      let bounced = false;
      if (bouncesOff(world, nx, t.y)) {
        t.vx = -t.vx * GRENADE_BOUNCE;
        t.vy *= GRENADE_BOUNCE;
        bounced = true;
      }
      if (bouncesOff(world, t.x, ny)) {
        t.vy = -t.vy * GRENADE_BOUNCE;
        t.vx *= GRENADE_BOUNCE;
        bounced = true;
      }
      if (!bounced && bouncesOff(world, nx, ny)) {
        t.vx = -t.vx * GRENADE_BOUNCE;
        t.vy = -t.vy * GRENADE_BOUNCE;
      }
      t.x = clamp(t.x + t.vx * sub, 4, WORLD_WIDTH - 4);
      t.y = clamp(t.y + t.vy * sub, 4, WORLD_HEIGHT - 4);
      t.a += t.spin * sub;
    }
  }

  for (let i = world.lashes.length - 1; i >= 0; i--) {
    if (now >= world.lashes[i].until) world.lashes.splice(i, 1);
  }
}

export function tentaclesToWire(world: World): TentacleState[] {
  const out: TentacleState[] = [];
  for (const t of world.tentacles) {
    const air = t[1].age < DOG_BURST_FLIGHT_MS;
    // Its own life from 1 down to 0 across the lying-about half, so it can be
    // faded on the client with no per-frame state and no second clock.
    const lie = (t[1].age - DOG_BURST_FLIGHT_MS) / DOG_BURST_LIE_MS;
    out.push({
      x: Math.round(t[1].x),
      y: Math.round(t[1].y),
      a: Math.round(t[1].a * 100) / 100,
      t: air ? 1 : Math.round(clamp(1 - lie, 0, 1) * 100) / 100,
      air,
    });
  }
  return out;
}

export function lashesToWire(world: World, now: number): LashState[] {
  return world.lashes.map((l) => ({
    x1: Math.round(l.x1),
    y1: Math.round(l.y1),
    x2: Math.round(l.x2),
    y2: Math.round(l.y2),
    hit: l.hit,
    t: Math.round(clamp((l.until - now) / DOG_LASH_SHOW_MS, 0, 1) * 100) / 100,
  }));
}

/** Are this dog's teeth still actually in the person it thinks they are? */
function latchedVictim(world: World, id: string, dog: DogState): Entity | null {
  if (!dog.victimId) return null;
  const session = world.grapples.get(dog.victimId);
  if (!session || !session.zombieIds.has(id)) return null;
  return world.entities.get(dog.victimId) ?? null;
}

/**
 * Everything a dog is doing this tick: where it is looking, where it is going,
 * whether it snapped at anybody, and what it is doing to whoever it caught.
 *
 * Called from the tick loop in place of `updatePlayers` for these ids — a dog
 * is a player, but nothing about walking an officer round applies to it, and
 * `processShooting` skips it because it is not an officer.
 */
export function updateDogs(world: World, dt: number, now: number): void {
  for (const id of world.dogs) {
    const e = world.entities.get(id);
    const command = world.commands.get(id);
    if (!e || !command) continue;
    const dog = dogStateFor(world, id, e.facing);

    // Down. It lies where it fell and takes no input at all until the clock is
    // up, and only *then* is it settled whether there is still a horde to rise
    // out of — a shambler can be shot, or turned up, while it is lying there.
    const downAt = world.dogDeaths.get(id);
    if (downAt !== undefined) {
      if (now - downAt < DOG_DEATH_MS) continue;
      world.dogDeaths.delete(id);
      // The screen is fully black by this point, and what it comes back up on
      // is the body this animal is about to tear its way out of. Choosing the
      // host *here* rather than at the moment it is consumed is the whole of
      // the birth: it gives the camera something to be pointed at and gives the
      // player something to watch happen.
      if (!beginDogBirth(world, e, now)) endThisDog(world, id);
      continue;
    }

    // Coming out of one. No input, no legs and no jaws — the animal does not
    // exist yet, and the only thing on screen is the shambler it is doing this
    // to.
    const birth = world.dogBirths.get(id);
    if (birth !== undefined) {
      // The host is an ordinary zombie in an ordinary street and the garrison
      // can shoot it out from under you. That costs a life exactly as any other
      // shambler does, so the answer is to start again on another body rather
      // than to protect the one chosen — and if there is no other body, that
      // was the last of them.
      if (!world.entities.has(birth.hostId)) {
        world.dogBirths.delete(id);
        if (!beginDogBirth(world, e, now)) endThisDog(world, id);
        continue;
      }
      if (now - birth.at < DOG_BIRTH_MS) continue;
      world.dogBirths.delete(id);
      finishDogBirth(world, e, birth, now);
      continue;
    }

    dogTick(world, e, dog, command, dt, now);
  }

  // Anything that burst this tick or last, and everything already in the air.
  // Below the loop rather than inside it: a burst is queued by `killEntity`,
  // which can be reached from a dog's own tick, from a bullet, or from a fire.
  drainBursts(world, now);
  updateTentacles(world, now, dt);
}

/**
 * No horde left to come out of. That is the end of this dog — it holds no seat
 * in the world from here, and `dogHudFor` says so.
 *
 * Its own function because there are two ways to arrive at it now: no body to
 * begin a birth on, and the body a birth had begun on being shot before it
 * could finish.
 */
function endThisDog(world: World, id: string): void {
  world.dogsOut.add(id);
  world.entities.delete(id);
  world.ai.delete(id);
}

function dogTick(
  world: World,
  e: Entity,
  dog: DogState,
  command: Command,
  dt: number,
  now: number,
): void {
  const victim = latchedVictim(world, e.id, dog);
  if (!victim && dog.victimId !== null) {
    // Let go — the clock ran out, they were killed, or they turned under us.
    // A moment before the jaws work again either way, so a finished bite is
    // not immediately followed by another.
    dog.victimId = null;
    dog.shakenMs = 0;
    dog.wiggleRun = 0;
    dog.wiggleDir = 0;
    dog.biteReadyAt = Math.max(dog.biteReadyAt, now + DOG_BITE_COOLDOWN_MS);
  }
  const latched = victim !== null;

  // ---- the roar. Two seconds of standing still with the head still tracking
  // the cursor, and then the street comes. A mine is the one thing that takes
  // it off you: being dropped is meant to stop you doing anything at all, and
  // a roar that carried on out of a body lying stunned in the road would be
  // the loudest possible statement that the stun did nothing.
  if (dog.roarStartedAt > 0 && world.stunned.has(e.id)) dog.roarStartedAt = 0;
  const roaring = dog.roarStartedAt > 0;

  // ---- coming apart. Two seconds of vibrating on the spot, then twenty of
  // being something else, then the burst. A mine takes the wind-up off you the
  // same way it takes the roar — but *not* the transformed form, which is a
  // body rather than an act: being dropped in the road as the thing is being
  // dropped in the road as the thing.
  if (dog.morphStartedAt > 0 && world.stunned.has(e.id)) dog.morphStartedAt = 0;
  morphTick(world, e, dog, now);
  // It may have just burst, which is a death — nothing below applies to a body
  // that is on its way down.
  if (world.dogDeaths.has(e.id)) return;
  const morphing = dog.morphStartedAt > 0;

  // ---- the neck. Both ease toward the mouse; the head simply gets there
  // first, and can only lead the spine by so much before the neck runs out.
  const want = command.aim;
  const bodyRate = DOG_BODY_TURN_RATE * (latched ? DOG_LATCHED_TURN_MUL : 1);
  // **Dead space before the shoulders stir at all.** Inside `DOG_BODY_DEADZONE`
  // the head turns on its own and the body does not move — which is what a dog
  // watching something looks like, and it is the difference between a neck and
  // a swivel mount. Past it the body chases the *edge* of the dead space rather
  // than the mouse, so it comes to rest exactly that far behind and a sweep
  // always leaves the head leading. Chasing the mouse itself would close the
  // last ten degrees and undo the whole thing on arrival.
  const off = angleDelta(e.facing, want);
  if (Math.abs(off) > DOG_BODY_DEADZONE) {
    const edge = want - Math.sign(off) * DOG_BODY_DEADZONE;
    e.facing = turnToward(e.facing, edge, bodyRate * dt);
  }

  dog.lastHead = dog.head;
  const free = turnToward(dog.head, want, DOG_HEAD_TURN_RATE * dt);
  const yaw = clamp(angleDelta(e.facing, free), -DOG_HEAD_MAX_YAW, DOG_HEAD_MAX_YAW);
  dog.head = e.facing + yaw;

  const headStep = angleDelta(dog.lastHead, dog.head);

  // ---- legs
  const stunned = world.stunned.has(e.id);
  // Rooted for the wind-up, exactly like the roar — "vibrate for two seconds"
  // is not something you do while running, and the 90% reduction is what pays
  // for standing still.
  moveDog(world, e, dog, command, dt, now, latched || stunned || roaring || morphing);

  // ---- jaws. Latched, stunned or roaring they are already busy, and a latched
  // dog must not leave them hanging open on the wire while it worries at
  // somebody.
  if (!latched && !stunned && !roaring) jawsTick(world, e, dog, command, now);
  else dog.jawsOpenedAt = 0;

  // The two seconds are up. The aim point is read *now* rather than at the
  // press: the head has been following the cursor the whole way through, so
  // where it is pointing at the end is where it is plainly roaring, and a
  // bearing committed to before anything happened would be a worse ability.
  if (roaring && now - dog.roarStartedAt >= DOG_ROAR_MS) {
    dog.roarStartedAt = 0;
    coolDown(world, e.id, 0, now + DOG_ROAR_COOLDOWN_MS);
    unleashRoar(world, e, command, now);
  }

  if (victim) shakeVictim(world, e, dog, victim, headStep);
}

// ----------------------------------------------------------------- the roar

/**
 * A key on the dog's bar went down.
 *
 * Everything about whether it is *allowed* is here rather than in the message
 * handler, for the same reason `attemptGrab` exists: the client is not to be
 * trusted about it, and a second caller — a bot driving a dog, say — must get
 * exactly the same refusals. It answers with what happened only so the server
 * log can say something useful.
 */
export function startDogAbility(
  world: World,
  id: string,
  slot: number,
  now: number,
): 'roared' | 'spat' | 'morphing' | 'lashed' | 'refused' {
  // Slot 2 is drawn and does nothing: there is nothing in it yet. Said out
  // loud rather than falling through, because "the key did nothing" and "the
  // key was refused" are different things and only the second is a bug.
  if (slot !== 0 && slot !== 1 && slot !== 3) return 'refused';

  const e = world.entities.get(id);
  if (!e || !world.dogs.has(id) || world.dogsOut.has(id)) return 'refused';
  // Lying in the road waiting to rise, part-way out of a shambler, frozen with
  // the round, or dropped by a mine. None of those is a thing you do anything
  // through.
  if (world.dogDeaths.has(id) || world.dogBirths.has(id)) return 'refused';
  if (world.paused || world.stunned.has(id)) return 'refused';

  const dog = dogStateFor(world, id, e.facing);
  // Teeth already in somebody. The head is what does both of these and it is
  // otherwise engaged.
  if (latchedVictim(world, id, dog) !== null) return 'refused';
  // Two seconds of roaring is two seconds of the mouth being busy.
  if (dog.roarStartedAt > 0) return 'refused';

  const command = world.commands.get(id);

  if (slot === 1) {
    // Not until this dog has turned enough people. The gate is on the running
    // total rather than on a spendable charge, so the roar cannot lock the acid
    // back up by summoning bodies with the same tally — see
    // `DOG_SPIT_UNLOCK_AT`. Checked here rather than only on the HUD: the wire
    // carries a slot index and nothing else, so the client's hexagon is a
    // readout and this is the rule.
    if (!spitUnlocked(world, id)) return 'refused';
    if (now < readyAt(world, id, 1)) return 'refused';
    if (!command) return 'refused';
    coolDown(world, id, 1, now + DOG_SPIT_COOLDOWN_MS);
    // The jaws shut to spit, the same as they shut to roar — and for the same
    // reason this must not go through `shutJaws`, which would take a bite out
    // of whatever door happens to be in front of the animal on the way past.
    dog.jawsOpenedAt = 0;
    spitAcid(world, e, command.aimX, command.aimY, now);
    return 'spat';
  }

  /**
   * **F does two things, and which one is not a mode the player sets.**
   *
   * Out in the world as the transformed thing, it lashes. Anything else, it
   * begins the transformation. That is what the spec asks for — *"pressing F
   * during this transformation will have a tentacle lash out"* — and it is
   * better than a second key: the row is Q, E, R, F and W walks the dog, so
   * there is exactly one free key left and this ability wants both halves of
   * it. Nothing has to be learned, either: while you are the monster, F is what
   * the monster does.
   *
   * The lash therefore has to be checked **above** the transformation's own
   * cooldown, or F would be dead for the whole twenty seconds it is most
   * wanted.
   */
  if (slot === 3) {
    if (isMorphed(dog, now)) {
      if (now < lashReadyAt(world, dog) || !command) return 'refused';
      lashOut(world, e, dog, command, now);
      return 'lashed';
    }
    // Not while it is already tearing itself open.
    if (dog.morphStartedAt > 0) return 'refused';
    if (!morphUnlocked(world)) return 'refused';
    if (now < readyAt(world, id, 3)) return 'refused';
    // Charged on the press, like the other two — a wind-up a rifle interrupts
    // has still been spent, which is what makes shooting it worth doing.
    coolDown(world, id, 3, now + DOG_MORPH_COOLDOWN_MS);
    dog.morphStartedAt = now;
    dog.jawsOpenedAt = 0;
    return 'morphing';
  }

  if (now < readyAt(world, id, 0)) return 'refused';
  dog.roarStartedAt = now;
  dog.jawsOpenedAt = 0;
  return 'roared';
}

/**
 * Somewhere a body could actually walk to, near where the cursor was.
 *
 * An order rides `lastSeen`, and that branch sits **above** every check that
 * would notice a zombie getting nowhere — see the note on `ZOMBIE_LAST_SEEN_MS`
 * in the AI. So a roar aimed into a wall, into the pond, or at a spot cut off
 * from the map's main walkable region would be a horde grinding at it for the
 * whole of `DOG_ROAR_ORDER_MS`, which is far longer than the ordinary sighting
 * this shares a field with. Walking the point out to open ground first is what
 * keeps the long order safe.
 *
 * A spiral rather than a single nudge, because the cursor is very often over a
 * building — that is where the people are.
 */
function roarTarget(world: World, aimX: number, aimY: number): { x: number; y: number } {
  const x = clamp(aimX, 0, WORLD_WIDTH);
  const y = clamp(aimY, 0, WORLD_HEIGHT);
  if (!world.nav.isBlocked(x, y) && world.nav.isReachable(x, y)) return { x, y };

  for (let ring = 1; ring <= 14; ring++) {
    const radius = ring * 26;
    const steps = ring * 8;
    for (let i = 0; i < steps; i++) {
      const angle = (i / steps) * Math.PI * 2;
      const px = clamp(x + Math.cos(angle) * radius, 0, WORLD_WIDTH);
      const py = clamp(y + Math.sin(angle) * radius, 0, WORLD_HEIGHT);
      if (!world.nav.isBlocked(px, py) && world.nav.isReachable(px, py)) return { x: px, y: py };
    }
  }
  // Nothing walkable anywhere near it. The order still goes out and still
  // expires on its own; there is nothing better to point them at.
  return { x, y };
}

/**
 * Send one shambler at a place.
 *
 * **It goes into `lastSeen`, and that is the whole of it.** The branch that
 * walks a zombie to somewhere it saw somebody already exists, sits *below* the
 * live chase, and drops the order on arrival — so an order is an attack move
 * for free: anything it meets on the way is chased instead, and nothing about
 * the zombie AI needed a line about roaring. Exactly the trick `followTheChase`
 * uses, with a far longer clock on it.
 *
 * `targetId` is deliberately left alone. Pulling a zombie off prey it can see
 * would be undone by its own next perception tick a tenth of a second later,
 * so it is churn that buys nothing — and a zombie already eating somebody is
 * doing what the roar wanted anyway.
 */
function sendToRoar(world: World, z: Entity, x: number, y: number, now: number): void {
  const state = world.ai.get(z.id);
  if (!state) return;
  state.lastSeenX = x;
  state.lastSeenY = y;
  state.lastSeenUntil = now + DOG_ROAR_ORDER_MS;
  state.path = null;
  state.nextPathAt = 0;
  // Whatever room it was working through, and whatever door it had decided to
  // take apart, it has somewhere to be now.
  state.searchBuilding = -1;
  state.searchExit = -1;
  state.doorTarget = -1;
}

/**
 * The end of the two seconds: everything that heard it goes that way.
 *
 * Two halves, and they are deliberately different things. The **nearest
 * twenty** are bodies already in the city being pointed somewhere, and they
 * cost nothing — the price of that half is the two seconds of standing still.
 * The **summons** is one body per person this dog has personally turned, walked
 * in at the breach, and it spends the lot.
 */
function unleashRoar(world: World, e: Entity, command: Command, now: number): void {
  const target = roarTarget(world, command.aimX, command.aimY);

  // Nearest first, out to earshot. Collected and sorted rather than taken as
  // they come: "the nearest twenty" is the whole rule, and a city has three
  // hundred zombies in it on a bad day.
  const heard: Array<{ z: Entity; d: number }> = [];
  for (const other of world.entities.values()) {
    if (other.type !== 'zombie' || world.dogs.has(other.id)) continue;
    const d = Math.hypot(other.x - e.x, other.y - e.y);
    if (d > DOG_ROAR_RANGE) continue;
    heard.push({ z: other, d });
  }
  heard.sort((a, b) => a.d - b.d);
  const called = Math.min(heard.length, DOG_ROAR_CALL_COUNT);
  for (let i = 0; i < called; i++) sendToRoar(world, heard[i].z, target.x, target.y, now);

  // And the ones it has earned. Spent whole — the tally is what the roar is
  // *for*, and a dog that hoarded half of it would simply be a dog that had
  // not roared yet.
  const charges = world.dogConversions.get(e.id) ?? 0;
  if (charges > 0) {
    world.dogConversions.set(e.id, 0);
    for (const z of spawnAtBreach(world, charges, now)) {
      sendToRoar(world, z, target.x, target.y, now);
    }
  }

  console.log(
    `[server] ${e.id} roared at ${target.x | 0},${target.y | 0} — ` +
      `${called} answered, ${charges} walked in at the breach`,
  );
}

/**
 * WASD, world-relative, exactly as an officer moves — a dog you had to steer
 * like a tank would be unplayable, and the body already faces the mouse
 * independently of where it is going. Being able to back off a wounded officer
 * while still looking at him is most of what makes the head worth having.
 */
function moveDog(
  world: World,
  e: Entity,
  dog: DogState,
  command: Command,
  dt: number,
  now: number,
  rooted: boolean,
): void {
  let dx = 0;
  let dy = 0;
  if (!rooted) {
    if (command.input.up) dy -= 1;
    if (command.input.down) dy += 1;
    if (command.input.left) dx -= 1;
    if (command.input.right) dx += 1;
  }
  const moving = dx !== 0 || dy !== 0;

  // The same reserve an officer has, drained harder and refilled slower: the
  // dog wins a flat-out chase and cannot keep winning one.
  let stamina = world.stamina.get(e.id) ?? STAMINA_MAX;
  const locked = world.exhausted.has(e.id);
  const sprinting = command.sprint && moving && !locked && stamina > STAMINA_SPRINT_FLOOR;
  if (sprinting) {
    stamina = Math.max(0, stamina - DOG_STAMINA_DRAIN_PER_SEC * dt);
    if (stamina <= STAMINA_SPRINT_FLOOR) world.exhausted.add(e.id);
  } else {
    stamina = Math.min(STAMINA_MAX, stamina + DOG_STAMINA_REGEN_PER_SEC * dt);
    if (locked && stamina >= STAMINA_RECOVERY_THRESHOLD) world.exhausted.delete(e.id);
  }
  world.stamina.set(e.id, stamina);

  if (!moving) return;
  const len = Math.hypot(dx, dy);
  // Still limping from the last round that found it. Cleared here rather than
  // on a timer of its own, so nothing else has to know about it.
  if (now >= dog.slowUntil) dog.slowMul = 1;
  const stagger = now < dog.slowUntil ? dog.slowMul : 1;
  // **The sprint is what the transformation costs**, and it is the cost that is
  // actually felt: an ordinary dog's sprint is what wins it every flat-out
  // chase in the game, and at this size it is barely quicker than the walk. The
  // walk is left alone — a monster that could not cross a street would spend
  // its twenty seconds where it stood.
  const rush = sprinting
    ? isMorphed(dog, now)
      ? DOG_MORPH_SPRINT_MUL
      : DOG_SPRINT_MULTIPLIER
    : 1;
  const base = DOG_SPEED * rush * stagger;
  const speed = speedAt(world, e.x, e.y, base, e.type);
  e.x += (dx / len) * speed * dt;
  e.y += (dy / len) * speed * dt;
}

/**
 * A snap of the jaws. It reaches only what is in front of the *muzzle* — not
 * the body — so a dog has to be pointing at somebody rather than merely stood
 * next to them, and a line of sight is required so nobody is bitten through a
 * door they just shut.
 *
 * The trigger works on the hold rather than on the press: closing on somebody
 * with the button down and snapping the moment the cooldown allows is what a
 * dog does, and a per-click rule only adds a way to fumble it.
 */
function jawsTick(world: World, e: Entity, dog: DogState, command: Command, now: number): void {
  // Out at the muzzle, not at the shoulder — and measured in *art* radii, since
  // the muzzle is a thing that is drawn. Taken off the collision radius it lands
  // a good way behind the teeth you can see, which reads as the reach lying.
  const jawX = e.x + Math.cos(dog.head) * DOG_ART_RADIUS * DOG_MUZZLE_OUT;
  const jawY = e.y + Math.sin(dog.head) * DOG_ART_RADIUS * DOG_MUZZLE_OUT;

  if (dog.jawsOpenedAt > 0) {
    // Open, and closing on the first thing to walk into them.
    if (catchInJaws(world, e, dog, jawX, jawY, now)) {
      shutJaws(world, dog, jawX, jawY, now, false);
      return;
    }
    // Let go of the button, or held past the limit. Either way they shut, and
    // whatever they shut *on* takes the bite — which is how a door gets chewed.
    if (!command.shooting || now - dog.jawsOpenedAt >= DOG_JAWS_OPEN_MS) {
      shutJaws(world, dog, jawX, jawY, now, true);
    }
    return;
  }

  // Shut. The trigger opens them again the moment the jaw has recovered — held
  // down, that is a rhythm of open, shut, wait, open, with no clicking.
  if (command.shooting && now >= dog.biteReadyAt) dog.jawsOpenedAt = now;
}

/** Anything standing in the open jaws right now, and can it be taken? */
function catchInJaws(
  world: World,
  e: Entity,
  dog: DogState,
  jawX: number,
  jawY: number,
  now: number,
): boolean {
  let best: Entity | null = null;
  let bestDist = Infinity;
  const candidates = world.entityGrid.queryCircle(
    jawX,
    jawY,
    DOG_BITE_REACH + 24,
    new Set<Entity>(),
  );
  for (const other of candidates) {
    if (other.type !== 'human' && other.type !== 'officer') continue;
    const dist = Math.hypot(other.x - jawX, other.y - jawY) - other.radius;
    if (dist > DOG_BITE_REACH || dist >= bestDist) continue;
    const off = Math.abs(angleDelta(dog.head, Math.atan2(other.y - e.y, other.x - e.x)));
    if (off > DOG_BITE_ARC) continue;
    if (!hasLineOfSight(world, e.x, e.y, other.x, other.y, true, e.type)) continue;
    bestDist = dist;
    best = other;
  }
  if (!best) return false;

  // Everything about whether the grab is *allowed* — kevlar, the riot shield,
  // the immunity window, a victim three zombies already have hold of — is
  // `attemptGrab`'s, shared with the shamblers so none of it can mean one thing
  // to a zombie and another to a dog.
  if (attemptGrab(world, e, best, now, DOG_BITE_MS) !== 'grabbed') return false;
  dog.victimId = best.id;
  dog.biteStartedAt = now;
  dog.biteTotalMs = Math.max(1, (world.grapples.get(best.id)?.endsAt ?? now) - now);
  dog.shakenMs = 0;
  dog.wiggleRun = 0;
  dog.wiggleDir = 0;
  return true;
}

/**
 * The jaws come together. Whatever they close *on* takes the bite.
 *
 * `onDoor` is off when they closed on somebody — a body already has hold of the
 * jaws, and taking a chunk out of the door behind them as well would be one
 * bite doing two things.
 */
function shutJaws(
  world: World,
  dog: DogState,
  jawX: number,
  jawY: number,
  now: number,
  onDoor: boolean,
): void {
  dog.jawsOpenedAt = 0;
  dog.biteReadyAt = now + DOG_BITE_COOLDOWN_MS;
  if (onDoor) biteDoor(world, jawX, jawY, dog.head);
}

/**
 * A snap that caught a door instead of a throat.
 *
 * Rated in its own constant rather than borrowed from the shamblers: a dog
 * worrying at a slab is a slower way through than a pack clawing at it, and it
 * costs the dog the jaw cooldown each time, which a shambler does not pay. What
 * it buys is that shutting a door on a dog *delays* it rather than stopping it.
 *
 * Only a door actually in front of the muzzle, and only one that is shut — an
 * open one is a way through, not an obstacle.
 */
function biteDoor(world: World, jawX: number, jawY: number, head: number): void {
  const slabs = world.doorGrid.queryCircle(jawX, jawY, DOG_BITE_REACH, new Set<number>());
  let best = -1;
  let bestDist = Infinity;
  for (const index of slabs) {
    const door = world.doors[index];
    if (!door || door.open || door.broken) continue;
    const spec = world.map.doors[index];
    const dist = Math.hypot(spec.x - jawX, spec.y - jawY);
    if (dist > DOG_BITE_REACH + spec.halfSpan || dist >= bestDist) continue;
    // In front of the muzzle, the same test a body has to pass.
    if (Math.abs(angleDelta(head, Math.atan2(spec.y - jawY, spec.x - jawX))) > DOG_BITE_ARC) {
      continue;
    }
    bestDist = dist;
    best = index;
  }
  if (best < 0) return;
  damageDoor(world, best, DOG_DOOR_DAMAGE);
}

/**
 * Worrying at somebody. Two things happen at once and they are the same
 * gesture: the victim is dragged about, and the bite lands sooner.
 *
 * **A shake is a reversal, not travel.** Banking raw angular movement would let
 * a player who simply swept the mouse in one direction — or spun in circles —
 * shorten a bite exactly as fast as one worrying at it, and the head is capped
 * at `DOG_HEAD_MAX_YAW` off the spine anyway, so a sustained sweep just drags
 * the whole body round. So the run in one direction is only credited when the
 * head comes back the other way, and a run shorter than `DOG_WIGGLE_MIN_RAD` is
 * a twitch rather than a shake and is thrown away.
 */
function shakeVictim(
  world: World,
  e: Entity,
  dog: DogState,
  victim: Entity,
  headStep: number,
): void {
  const dir = headStep > 0 ? 1 : headStep < 0 ? -1 : 0;
  if (dir !== 0 && dir !== dog.wiggleDir) {
    if (dog.wiggleRun >= DOG_WIGGLE_MIN_RAD) creditShake(world, dog, dog.wiggleRun);
    dog.wiggleDir = dir;
    dog.wiggleRun = 0;
  }
  dog.wiggleRun += Math.abs(headStep);

  // Dragged onto the jaw point, and thrown sideways by however hard the head
  // is moving. The pull is what makes a latched dog something you are attached
  // to rather than something standing next to you; the throw is what makes the
  // shaking visible to everyone watching, not just to whoever is holding the
  // mouse.
  //
  // **The jaw point sits at the two bodies' own separation, not inside it.**
  // Held any closer, this and `resolveCollisions` spend every tick undoing each
  // other — the drag hauls the victim in, collision shoves them both apart, and
  // the pair slides bodily down the street at ninety pixels a second with
  // nobody driving. Measured: 106px of travel over a bite where the mouse never
  // moved at all.
  const hold = e.radius + victim.radius + 1;
  const jawX = e.x + Math.cos(dog.head) * hold;
  const jawY = e.y + Math.sin(dog.head) * hold;
  victim.x += (jawX - victim.x) * DOG_DRAG_PULL;
  victim.y += (jawY - victim.y) * DOG_DRAG_PULL;
  victim.x += -Math.sin(dog.head) * headStep * DOG_SHAKE_THROW;
  victim.y += Math.cos(dog.head) * headStep * DOG_SHAKE_THROW;
  victim.facing = dog.head + Math.PI;
}

/**
 * Take a banked shake off the bite clock, down to the floor and no further.
 *
 * **The floor is measured from when the bite started, not from now.** Written
 * the obvious way — `now + DOG_BITE_MIN_MS` — the deadline is shoved back to
 * three-quarters of a second in the future on *every* credit, so a player who
 * keeps shaking keeps renewing it and the bite never lands at all. Measured
 * from the moment the jaws went in it is what it says it is: the shortest a
 * bite can be made.
 */
function creditShake(world: World, dog: DogState, radians: number): void {
  if (!dog.victimId) return;
  const session = world.grapples.get(dog.victimId);
  if (!session) return;
  const floor = dog.biteStartedAt + DOG_BITE_MIN_MS;
  const before = session.endsAt;
  session.endsAt = Math.max(floor, session.endsAt - radians * DOG_WIGGLE_MS_PER_RAD);
  // Never the other way: a floor above the current deadline would lengthen it.
  if (session.endsAt > before) session.endsAt = before;
  dog.shakenMs += before - session.endsAt;
}

/**
 * Who the horde has walked into, for the dog's corner map.
 *
 * **The whole balance rule is the one `continue` in the middle of it.** An
 * officer further from a zombie than `DOG_MAP_CONTACT_RANGE` is not filtered
 * out on the client or greyed on the map — they are never put on the wire, so
 * the map cannot be made to give them up however it is read. What it shows is
 * where the outbreak is *making contact*, which is a thing the dog earned by
 * sending the horde somewhere.
 *
 * **It reads the danger field rather than querying the grid**, which is the
 * trick this codebase reaches for over and over: one multi-source BFS is
 * already being paid for at 6Hz on behalf of four hundred civilians, so asking
 * it "how far is the nearest zombie from here" is an array lookup. A spatial
 * query per officer would be the obvious way and would cost per officer per
 * scan. It is also *geodesic*, which is the right answer rather than merely the
 * cheap one — a shambler on the far side of a wall has not seen anybody.
 *
 * Rebuilt on `DOG_MAP_REFRESH_MS` and cached on the world, so the per-snapshot
 * cost of the map is copying a short array of integers.
 */
function refreshDogContacts(world: World, now: number): void {
  if (now < world.nextDogContactScan) return;
  world.nextDogContactScan = now + DOG_MAP_REFRESH_MS;

  const found: Array<{ x: number; y: number }> = [];
  for (const e of world.entities.values()) {
    if (e.type !== 'officer') continue;
    if (world.danger.distanceAt(e.x, e.y) > DOG_MAP_CONTACT_RANGE) continue;
    found.push({ x: Math.round(e.x), y: Math.round(e.y) });
  }
  world.dogContacts = found;
}

/**
 * The four hexagons, left to right.
 *
 * Always `DOG_ABILITY_SLOTS` long with a `null` for each empty one, so the
 * client never has to work out which hexagon is which — the row is Q, W, E, R
 * by position and an index is the whole of the mapping. Which key each one is
 * on is deliberately *not* sent: that is the client's own decision and telling
 * it would be the server repeating something it does not own.
 */
function abilityBar(
  world: World,
  id: string,
  dog: DogState | undefined,
  now: number,
): Array<DogAbilityHud | null> {
  const bar: Array<DogAbilityHud | null> = new Array(DOG_ABILITY_SLOTS).fill(null);
  const roaring = dog !== undefined && dog.roarStartedAt > 0;
  const banked = world.dogConversions.get(id) ?? 0;
  const turned = world.dogTurned.get(id) ?? 0;
  bar[0] = {
    name: 'ROAR',
    // `max(1, …)` so a cooldown set to zero reads as permanently ready rather
    // than dividing by it.
    ready: clamp(1 - (readyAt(world, id, 0) - now) / Math.max(1, DOG_ROAR_COOLDOWN_MS), 0, 1),
    // The *balance*, which the roar spends whole — not the running total. The
    // badge says how many bodies the next roar will walk in.
    charges: banked,
    active: roaring ? clamp((now - dog!.roarStartedAt) / DOG_ROAR_MS, 0, 1) : -1,
    locked: 0,
  };
  bar[1] = {
    name: 'SPIT',
    ready: clamp(1 - (readyAt(world, id, 1) - now) / Math.max(1, DOG_SPIT_COOLDOWN_MS), 0, 1),
    // **-1, not 0.** The badge is drawn only for an ability that banks
    // something, and a nought sitting under a hexagon every round is noise —
    // the badge *appearing* is itself the news that the roar now does more.
    // Spitting costs nothing and banks nothing, so it has no badge at all.
    charges: -1,
    // Nothing to run. It is over on the tick the key went down; what happens
    // afterwards belongs to the gobbet and then to the cloud.
    active: -1,
    // **Earned, not given.** The same tally the roar's summons spends, read
    // rather than drawn down — see `DOG_SPIT_UNLOCK_AT`. Reported as what is
    // left to go, because a locked hexagon that says nothing is
    // indistinguishable from a broken one.
    locked: spitUnlocked(world, id) ? 0 : Math.max(1, DOG_SPIT_UNLOCK_AT - turned),
  };
  bar[3] = {
    name: isMorphed(dog, now) ? 'LASH' : 'RIP',
    // **Two different clocks behind one hexagon, and that is the honest
    // reading.** Out in the world as the thing, what F does is lash, and the
    // number that matters is the lash's own short cooldown — the four minutes
    // are not a decision anybody can make until the form is over anyway. Any
    // other arrangement shows a bar that cannot move for twenty seconds beside
    // a key being pressed twice a second.
    ready: isMorphed(dog, now)
      ? clamp(1 - (lashReadyAt(world, dog) - now) / Math.max(1, DOG_LASH_COOLDOWN_MS), 0, 1)
      : clamp(1 - (readyAt(world, id, 3) - now) / Math.max(1, DOG_MORPH_COOLDOWN_MS), 0, 1),
    charges: -1,
    // The wind-up fills; the twenty seconds drain. One reading for the two, so
    // the hexagon runs through the transformation and then empties across the
    // form — which is also the only readout of how long there is left of it.
    active:
      dog && dog.morphStartedAt > 0
        ? clamp((now - dog.morphStartedAt) / DOG_MORPH_WINDUP_MS, 0, 1)
        : isMorphed(dog, now)
          ? clamp((dog!.morphedUntil - now) / DOG_MORPH_MS, 0, 1)
          : -1,
    // How many more conversions the *whole outbreak* needs — the same number
    // on every dog's hexagon, because it is one shared threshold rather than a
    // personal one. `Math.max(1, …)` so a city that has already crossed it,
    // read a tick before `morphUnlocked` agrees, cannot show a stale 0.
    locked: morphUnlocked(world)
      ? 0
      : Math.max(1, DOG_MORPH_UNLOCK_CONVERTED - world.totalConverted),
  };
  return bar;
}

/**
 * What a dog needs on screen. Null for anyone who isn't one, which is what
 * keeps this off every other player's snapshot.
 */
export function dogHudFor(world: World, id: string, now: number): DogHud | null {
  if (!world.dogs.has(id)) return null;

  // What is left of the horde to come back out of. Counted here rather than
  // kept, because zombies are created and killed all round the map by things
  // that have no idea a dog exists.
  let hosts = 0;
  for (const e of world.entities.values()) {
    if (e.type === 'zombie' && !world.dogs.has(e.id)) hosts++;
  }
  const out = world.dogsOut.has(id);

  // Built at most four times a second and shared by every dog in the round,
  // so the per-viewer cost here is handing back the array it already made.
  refreshDogContacts(world, now);
  const contacts = world.dogContacts;

  const dog = world.dogState.get(id);
  const abilities = abilityBar(world, id, dog, now);
  // Down or being born: no jaws, no bar, and one of the two clocks running.
  // They are mutually exclusive by construction — `updateDogs` deletes the
  // death before it begins the birth — so the order here is only about which
  // question is asked first, not about which wins.
  const downAt = world.dogDeaths.get(id);
  const birth = world.dogBirths.get(id);
  if (!dog || downAt !== undefined || birth !== undefined) {
    return {
      bite: downAt !== undefined || birth !== undefined ? 0 : 1,
      jawsOpen: -1,
      latched: false,
      hold: 0,
      shaken: 0,
      abilities,
      contacts,
      hosts,
      out,
      dying: downAt === undefined ? -1 : clamp((now - downAt) / DOG_DEATH_MS, 0, 1),
      birth: birth === undefined ? -1 : clamp((now - birth.at) / DOG_BIRTH_MS, 0, 1),
    };
  }

  const session = dog.victimId ? world.grapples.get(dog.victimId) : undefined;
  const latched = session !== undefined && session.zombieIds.has(id);
  const left = latched ? Math.max(0, session!.endsAt - now) : 0;
  // Against the bite this one *started* as, so shaking visibly eats the bar
  // rather than merely running it down at a faster rate.
  const total = Math.max(1, dog.biteTotalMs);
  return {
    bite: latched ? 0 : clamp(1 - (dog.biteReadyAt - now) / DOG_BITE_COOLDOWN_MS, 0, 1),
    jawsOpen:
      dog.jawsOpenedAt > 0
        ? clamp(1 - (now - dog.jawsOpenedAt) / DOG_JAWS_OPEN_MS, 0, 1)
        : -1,
    latched,
    hold: clamp(left / total, 0, 1),
    shaken: clamp(dog.shakenMs / total, 0, 1),
    abilities,
    contacts,
    hosts,
    out,
    dying: -1,
    birth: -1,
  };
}
