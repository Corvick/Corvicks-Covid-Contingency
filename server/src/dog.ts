import type { DogAbilityHud, DogHud } from '../../shared/types.js';
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
import { spitAcid } from './acid.js';
import { attemptGrab } from './ai.js';
import { damageDoor } from './doors.js';
import {
  beginDogBirth,
  finishDogBirth,
  hasLineOfSight,
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
  /** Earliest it may be roared again — see `DOG_ROAR_COOLDOWN_MS`. */
  roarReadyAt: number;
  /**
   * Earliest it may spit again — see `DOG_SPIT_COOLDOWN_MS`.
   *
   * A deadline and nothing else, unlike the roar's pair: spitting is over on
   * the tick the key goes down, so there is no "it is happening now" for the
   * legs, the wire or the HUD to read. What happens afterwards belongs to the
   * gobbet and then to the cloud, neither of which is the dog.
   */
  spitReadyAt: number;
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
      roarReadyAt: 0,
      spitReadyAt: 0,
    };
    world.dogState.set(id, dog);
  }
  return dog;
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
  moveDog(world, e, dog, command, dt, now, latched || stunned || roaring);

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
    dog.roarReadyAt = now + DOG_ROAR_COOLDOWN_MS;
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
): 'roared' | 'spat' | 'refused' {
  // Slots 2-3 are drawn and do nothing: there is nothing in them yet. Said out
  // loud rather than falling through, because "the key did nothing" and "the
  // key was refused" are different things and only the second is a bug.
  if (slot !== 0 && slot !== 1) return 'refused';

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
    if (now < dog.spitReadyAt) return 'refused';
    if (!command) return 'refused';
    dog.spitReadyAt = now + DOG_SPIT_COOLDOWN_MS;
    // The jaws shut to spit, the same as they shut to roar — and for the same
    // reason this must not go through `shutJaws`, which would take a bite out
    // of whatever door happens to be in front of the animal on the way past.
    dog.jawsOpenedAt = 0;
    spitAcid(world, e, command.aimX, command.aimY, now);
    return 'spat';
  }

  if (now < dog.roarReadyAt) return 'refused';
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
  const base = DOG_SPEED * (sprinting ? DOG_SPRINT_MULTIPLIER : 1) * stagger;
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
    if (!hasLineOfSight(world, e.x, e.y, other.x, other.y, true)) continue;
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
  bar[0] = {
    name: 'ROAR',
    // `max(1, …)` so a cooldown set to zero reads as permanently ready rather
    // than dividing by it.
    ready: dog
      ? clamp(1 - (dog.roarReadyAt - now) / Math.max(1, DOG_ROAR_COOLDOWN_MS), 0, 1)
      : 1,
    charges: world.dogConversions.get(id) ?? 0,
    active: roaring ? clamp((now - dog!.roarStartedAt) / DOG_ROAR_MS, 0, 1) : -1,
  };
  bar[1] = {
    name: 'SPIT',
    ready: dog
      ? clamp(1 - (dog.spitReadyAt - now) / Math.max(1, DOG_SPIT_COOLDOWN_MS), 0, 1)
      : 1,
    // **-1, not 0.** The badge is drawn only for an ability that banks
    // something, and a nought sitting under a hexagon every round is noise —
    // the badge *appearing* is itself the news that the roar now does more.
    // Spitting costs nothing and banks nothing, so it has no badge at all.
    charges: -1,
    // Nothing to run. It is over on the tick the key went down; what happens
    // afterwards belongs to the gobbet and then to the cloud.
    active: -1,
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
