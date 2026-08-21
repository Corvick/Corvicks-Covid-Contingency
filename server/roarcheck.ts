/**
 * Harness for the dog's roar. Headless — no socket, no port — so it leaves a
 * game running on 8080 completely alone.
 *
 *   npx tsx roarcheck.ts
 *
 * It covers the two seconds of being rooted, who answers the roar and who is
 * out of earshot, the bodies walked in at the breach, the tally that pays for
 * them, and every way the tally must *not* be credited.
 *
 * Where it stages a bite rather than driving one, it stages a real
 * `GrappleSession` with the biter's id in it and lets `updateAi` resolve it —
 * the same call the tick makes, so the outcome rolls (clean escape, instant
 * turn, slow turn) are the real ones. The invariant checked is therefore the
 * one that matters: **charges equal bodies this dog turned**, however each roll
 * happened to land. A control run stages the identical bites with an ordinary
 * shambler holding on, which must credit nothing.
 */
import {
  createWorld,
  resetWorld,
  rebuildEntityGrid,
  spawnDog,
  killEntity,
  makeEntity,
  newAiState,
  toWire,
  type Entity,
  type World,
} from './src/world.js';
import { computeFrozen, updateAi } from './src/ai.js';
import { dogHudFor, startDogAbility, updateDogs } from './src/dog.js';
import { fireHeld } from './src/combat.js';
import { gunSlots, newInventory } from './src/inventory.js';
import {
  BASE_ESCAPE_CHANCE,
  DOG_BIRTH_MS,
  DOG_DEATH_MS,
  DOG_ROAR_CALL_COUNT,
  DOG_ROAR_COOLDOWN_MS,
  DOG_ROAR_MS,
  DOG_ROAR_ORDER_MS,
  DOG_ROAR_RANGE,
  TICK_RATE,
  TURN_DELAY_MAX_MS,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from '../shared/constants.js';

const TICK_MS = 1000 / TICK_RATE;
const DOG = 'roar-dog';
const ROAR_TICKS = Math.ceil(DOG_ROAR_MS / TICK_MS) + 2;

let failures = 0;
function check(label: string, ok: boolean, detail = ''): void {
  if (!ok) failures++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
}

interface Rig {
  world: World;
  dog: Entity;
  clock: number;
  /**
   * One tick, with a clock that actually advances. Ticks run back to back
   * complete in microseconds, so `Date.now()` barely moves and every
   * time-gated piece of work is skipped — see the note on headless harnesses.
   */
  tick(): void;
  run(n: number): void;
  aim(x: number, y: number): void;
  press(up: boolean): void;
  /** Put a shambler down somewhere, with a real AiState on it. */
  shambler(id: string, x: number, y: number): Entity;
  human(id: string, x: number, y: number): Entity;
}

function rig(withAi = false): Rig {
  const world = createWorld();
  resetWorld(world);
  world.dogs.add(DOG);
  world.playerIds.add(DOG);
  spawnDog(world, DOG);
  const dog = world.entities.get(DOG)!;
  world.commands.set(DOG, {
    input: { up: false, down: false, left: false, right: false },
    aim: 0,
    aimX: dog.x + 300,
    aimY: dog.y,
    shooting: false,
    sprint: false,
    interact: false,
    rightDown: false,
  });

  return {
    world,
    dog,
    clock: Date.now(),
    tick(): void {
      this.clock += TICK_MS;
      rebuildEntityGrid(world);
      const frozen = computeFrozen(world);
      updateDogs(world, TICK_MS / 1000, this.clock);
      if (withAi) updateAi(world, this.clock, TICK_MS / 1000, frozen);
    },
    run(n: number): void {
      for (let i = 0; i < n; i++) this.tick();
    },
    aim(x: number, y: number): void {
      const c = world.commands.get(DOG)!;
      c.aimX = x;
      c.aimY = y;
      c.aim = Math.atan2(y - dog.y, x - dog.x);
    },
    press(up: boolean): void {
      world.commands.get(DOG)!.input.up = up;
    },
    shambler(id: string, x: number, y: number): Entity {
      const e = makeEntity(id, 'zombie', x, y);
      world.entities.set(id, e);
      world.ai.set(id, newAiState(this.clock, x, y));
      return e;
    },
    human(id: string, x: number, y: number): Entity {
      const e = makeEntity(id, 'human', x, y);
      world.entities.set(id, e);
      world.ai.set(id, newAiState(this.clock, x, y));
      return e;
    },
  };
}

/**
 * The escape roll `attemptGrab` makes, made here instead.
 *
 * **A staged `GrappleSession` has to carry `escapeAt` or nothing ever gets
 * away**, and that is not a detail — it is now the *only* way a grip ends in
 * the victim's favour. Written without it, the field is `undefined`, the tick
 * loop's `now >= session.escapeAt` is false forever, and every staged bite
 * turns somebody. That is what "0 did not turn" was: the control which proves
 * the tally counts bodies rather than bites had quietly stopped being able to
 * fail, because the harness was never typechecked (`server/tsconfig.json`
 * covers `src/**` only — see the note in CLAUDE.md).
 */
function escapeRoll(now: number, endsAt: number): number | null {
  return Math.random() < BASE_ESCAPE_CHANCE ? now + Math.random() * Math.max(1, endsAt - now) : null;
}

/** Clear the city's own outbreak out, so staged geometry is the only geometry. */
function emptyTheHorde(world: World): void {
  for (const e of [...world.entities.values()]) {
    if (e.type !== 'zombie' || world.dogs.has(e.id)) continue;
    world.entities.delete(e.id);
    world.ai.delete(e.id);
  }
}

function countShamblers(world: World): number {
  let n = 0;
  for (const e of world.entities.values()) if (e.type === 'zombie' && !world.dogs.has(e.id)) n++;
  return n;
}

// ---------------------------------------------------------------- the lock

function testLock(): void {
  console.log('\ntwo seconds of standing still');
  const r = rig();

  // It plainly walks when it is not roaring — otherwise "did not move" proves
  // nothing but that it was against a wall.
  r.press(true);
  r.run(4);
  const beforeX = r.dog.x;
  const beforeY = r.dog.y;
  r.run(8);
  const freeWalk = Math.hypot(r.dog.x - beforeX, r.dog.y - beforeY);
  check('walks with W held when not roaring', freeWalk > 1, `${freeWalk.toFixed(1)}px`);

  const started = startDogAbility(r.world, DOG, 0, r.clock + TICK_MS);
  check('Q starts a roar', started === 'roared', started);

  const atX = r.dog.x;
  const atY = r.dog.y;
  let running = 0;
  const ticks = Math.ceil(DOG_ROAR_MS / TICK_MS);
  for (let i = 0; i < ticks; i++) {
    r.tick();
    if (dogHudFor(r.world, DOG, r.clock)!.abilities[0]!.active >= 0) running++;
  }
  const drift = Math.hypot(r.dog.x - atX, r.dog.y - atY);
  check('rooted for the whole of it, W still held', drift === 0, `${drift.toFixed(2)}px`);
  check('the HUD shows it running throughout', running >= ticks - 1, `${running}/${ticks} ticks`);

  const endX = r.dog.x;
  const endY = r.dog.y;
  r.run(8);
  const after = Math.hypot(r.dog.x - endX, r.dog.y - endY);
  check('and walks again the moment it ends', after > 1, `${after.toFixed(1)}px`);

  check('refused while cooling down', startDogAbility(r.world, DOG, 0, r.clock) === 'refused');
  check(
    'allowed again once the cooldown is up',
    startDogAbility(r.world, DOG, 0, r.clock + DOG_ROAR_COOLDOWN_MS + 50) === 'roared',
  );
}

function testTheBar(): void {
  console.log('\nfour hexagons, two of them filled');
  const r = rig();
  const hud = dogHudFor(r.world, DOG, r.clock)!;
  check('the bar is four long', hud.abilities.length === 4, String(hud.abilities.length));
  // Two now: the roar on Q and the acid on E. The empty pair are still drawn,
  // because the whole value of a fixed row is that a key does not move when the
  // one beside it is filled in — which is exactly what happened here.
  check('two are filled', hud.abilities.filter((a) => a !== null).length === 2);
  check('and it is slot 0, ROAR', hud.abilities[0]?.name === 'ROAR');
  check('it starts ready', (hud.abilities[0]?.ready ?? 0) >= 1);
  check('with nothing banked', hud.abilities[0]?.charges === 0);
  // Slot 1 belongs to `acidcheck.ts` and is only established here as *not
  // refused*, so that this file's claim about the empty slots stays honest.
  check('E slot 1 is the acid, and is taken', startDogAbility(r.world, DOG, 1, r.clock) === 'spat');
  for (const slot of [2, 3]) {
    check(`R/F slot ${slot} does nothing`, startDogAbility(r.world, DOG, slot, r.clock) === 'refused');
  }

  r.world.dogConversions.set(DOG, 5);
  check('the badge counts what has been turned', dogHudFor(r.world, DOG, r.clock)!.abilities[0]!.charges === 5);
}

// ------------------------------------------------------------- who answers

function testWhoAnswers(): void {
  console.log('\nwho answers it, and who is too far off');
  const r = rig();
  const world = r.world;
  emptyTheHorde(world);

  const near: string[] = [];
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    const x = Math.min(WORLD_WIDTH - 60, Math.max(60, r.dog.x + Math.cos(a) * 200));
    const y = Math.min(WORLD_HEIGHT - 60, Math.max(60, r.dog.y + Math.sin(a) * 200));
    near.push(`near-${i}`);
    r.shambler(`near-${i}`, x, y);
  }
  const far: string[] = [];
  for (let i = 0; i < 6; i++) {
    const x = r.dog.x < WORLD_WIDTH / 2 ? WORLD_WIDTH - 60 : 60;
    const y = r.dog.y < WORLD_HEIGHT / 2 ? WORLD_HEIGHT - 60 - i * 30 : 60 + i * 30;
    far.push(`far-${i}`);
    r.shambler(`far-${i}`, x, y);
  }
  const farDist = Math.hypot(world.entities.get(far[0])!.x - r.dog.x, world.entities.get(far[0])!.y - r.dog.y);
  check('the far group really is out of earshot', farDist > DOG_ROAR_RANGE, `${farDist | 0}px away`);

  const aimX = Math.min(WORLD_WIDTH - 100, Math.max(100, r.dog.x + 600));
  const aimY = r.dog.y;
  r.aim(aimX, aimY);
  startDogAbility(world, DOG, 0, r.clock + TICK_MS);
  r.run(ROAR_TICKS);

  const sent = near.filter((id) => world.ai.get(id)!.lastSeenX !== null);
  check(`${DOG_ROAR_CALL_COUNT} of the 40 in earshot were sent`, sent.length === DOG_ROAR_CALL_COUNT, `${sent.length}`);
  const sentFar = far.filter((id) => world.ai.get(id)!.lastSeenX !== null);
  check('nobody out of earshot was sent', sentFar.length === 0, `${sentFar.length}`);

  // Nearest first: the twenty that answered are the twenty closest to the dog.
  const byDist = near
    .slice()
    .sort(
      (a, b) =>
        Math.hypot(world.entities.get(a)!.x - r.dog.x, world.entities.get(a)!.y - r.dog.y) -
        Math.hypot(world.entities.get(b)!.x - r.dog.x, world.entities.get(b)!.y - r.dog.y),
    )
    .slice(0, DOG_ROAR_CALL_COUNT);
  check('and they are the nearest twenty', byDist.every((id) => sent.includes(id)));

  const one = world.ai.get(sent[0])!;
  const off = Math.hypot(one.lastSeenX! - aimX, one.lastSeenY! - aimY);
  check('sent to where the cursor was', off < 400, `${off | 0}px off it`);
  check(
    'and to somewhere a body can stand',
    !world.nav.isBlocked(one.lastSeenX!, one.lastSeenY!) && world.nav.isReachable(one.lastSeenX!, one.lastSeenY!),
  );
  const stands = one.lastSeenUntil - r.clock;
  check(
    'the order stands far longer than an ordinary sighting',
    stands > DOG_ROAR_ORDER_MS - 3000 && stands <= DOG_ROAR_ORDER_MS,
    `${(stands / 1000).toFixed(1)}s`,
  );
}

function testAimIntoAWall(): void {
  console.log('\naiming at somewhere nothing can walk');
  const r = rig();
  const world = r.world;
  emptyTheHorde(world);

  let blockedX = -1;
  let blockedY = -1;
  for (let i = 0; i < 20000 && blockedX < 0; i++) {
    const x = Math.random() * WORLD_WIDTH;
    const y = Math.random() * WORLD_HEIGHT;
    if (world.nav.isBlocked(x, y)) {
      blockedX = x;
      blockedY = y;
    }
  }
  check('found somewhere blocked to aim at', blockedX >= 0);

  r.shambler('aim-z', r.dog.x + 60, r.dog.y);
  r.aim(blockedX, blockedY);
  startDogAbility(world, DOG, 0, r.clock + TICK_MS);
  r.run(ROAR_TICKS);

  const st = world.ai.get('aim-z')!;
  check('an order was still given', st.lastSeenX !== null);
  check('walked out onto open ground', st.lastSeenX !== null && !world.nav.isBlocked(st.lastSeenX, st.lastSeenY!));
  check(
    'and it is part of the map that can be reached',
    st.lastSeenX !== null && world.nav.isReachable(st.lastSeenX, st.lastSeenY!),
  );
  const moved = st.lastSeenX !== null ? Math.hypot(st.lastSeenX - blockedX, st.lastSeenY! - blockedY) : -1;
  check('and not far from where the cursor was', moved >= 0 && moved < 400, `${moved | 0}px`);
}

// ------------------------------------------------------------- the summons

function testSummons(): void {
  console.log('\nthe summons at the breach');
  const r = rig();
  const world = r.world;
  const before = countShamblers(world);
  world.dogConversions.set(DOG, 7);

  r.aim(Math.min(WORLD_WIDTH - 100, r.dog.x + 400), r.dog.y);
  startDogAbility(world, DOG, 0, r.clock + TICK_MS);
  r.run(ROAR_TICKS);

  check('one body per charge walked in', countShamblers(world) - before === 7, `${countShamblers(world) - before}`);
  check('and the tally is spent', (world.dogConversions.get(DOG) ?? -1) === 0);

  const summoned = [...world.entities.values()].filter((e) => e.id.startsWith('horde-'));
  check('all on the edge the outbreak came in on', summoned.every((e) => onOutbreakEdge(world, e)));
  check('all given the order', summoned.every((e) => (world.ai.get(e.id)?.lastSeenX ?? null) !== null));
  check('none standing in geometry', summoned.every((e) => !world.nav.isBlocked(e.x, e.y)));
  let widest = 0;
  for (const a of summoned) {
    for (const b of summoned) widest = Math.max(widest, Math.hypot(a.x - b.x, a.y - b.y));
  }
  check('spread along the edge rather than stacked', widest > 100, `${widest | 0}px at the widest`);

  const r2 = rig();
  const b2 = countShamblers(r2.world);
  r2.aim(Math.min(WORLD_WIDTH - 100, r2.dog.x + 400), r2.dog.y);
  startDogAbility(r2.world, DOG, 0, r2.clock + TICK_MS);
  r2.run(ROAR_TICKS);
  check('nothing walks in on an empty tally', countShamblers(r2.world) - b2 === 0);
}

function onOutbreakEdge(world: World, e: Entity): boolean {
  // The spawn point walks inward off the perimeter until it is clear, so this
  // is "came in on that side", not "is exactly on the boundary".
  const slack = 900;
  const side = world.outbreakSide;
  if (side === 0) return e.y < slack;
  if (side === 1) return e.x > WORLD_WIDTH - slack;
  if (side === 2) return e.y > WORLD_HEIGHT - slack;
  return e.x < slack;
}

// --------------------------------------------------------------- the tally

function stageBites(n: number, byDog: boolean): { turned: number; charged: number } {
  const r = rig(true);
  const world = r.world;
  const biter = byDog ? DOG : 'grabber-z';
  if (!byDog) r.shambler(biter, r.dog.x + 40, r.dog.y);

  const victims: string[] = [];
  for (let i = 0; i < n; i++) {
    const id = `bit-${i}`;
    // Well out of everybody's way, so nothing else in the city touches them.
    r.human(id, 60 + (i % 20) * 12, 60 + Math.floor(i / 20) * 12);
    victims.push(id);
    world.grapples.set(id, { zombieIds: new Set([biter]), endsAt: r.clock, escapeAt: escapeRoll(r.clock, r.clock) });
  }

  // One tick resolves every grapple; then jump the clock past the longest
  // incubation so any *slow* turn has come up as well.
  r.run(2);
  r.clock += TURN_DELAY_MAX_MS + 2000;
  r.run(2);

  let turned = 0;
  for (const id of victims) if (world.entities.get(id)?.type === 'zombie') turned++;
  return { turned, charged: world.dogConversions.get(DOG) ?? 0 };
}

function testTally(): void {
  console.log('\nthe tally: turned, not bitten');
  const bites = stageBites(120, true);
  check(
    'a charge for every body the dog turned, and no more',
    bites.charged === bites.turned,
    `${bites.charged} charged against ${bites.turned} turned, of 120 bitten`,
  );
  check('some of them did turn, so the check means something', bites.turned > 0);
  check('and some got away, so it is not counting bites', bites.turned < 120, `${120 - bites.turned} did not turn`);

  const control = stageBites(120, false);
  check('a shambler biting somebody credits the dog nothing', control.charged === 0, `${control.charged}`);
  check('though it turned plenty of them', control.turned > 0, `${control.turned} turned`);
}

function testIncubatingDoesNotCount(): void {
  console.log("\nsomebody incubating is not a charge yet");
  const r = rig(true);
  const world = r.world;
  const victim = r.human('slow-burn', 400, 400);
  world.pendingInfections.set(victim.id, r.clock + 60_000);
  world.infectedByDog.set(victim.id, DOG);
  r.run(2);
  check('nothing banked while they are still on their feet', (world.dogConversions.get(DOG) ?? 0) === 0);
  r.clock += 61_000;
  r.run(2);
  check('and banked the moment they turn', (world.dogConversions.get(DOG) ?? 0) === 1);
  check('the claim is released with it', !world.infectedByDog.has(victim.id));
}

function testCureTakesTheCreditBack(): void {
  console.log('\na cure takes the credit back');
  const r = rig(true);
  const world = r.world;

  // A medic with the gun in hand and a bitten civilian in front of them: the
  // real cure path, not a stand-in for it.
  const medic = makeEntity('medic', 'officer', 400, 400);
  world.entities.set(medic.id, medic);
  world.playerIds.add(medic.id);
  const inv = newInventory();
  inv.utilities.push('cureGun');
  inv.cureDoses = 6;
  inv.activeSlot = gunSlots(inv) + 1; // the first utility slot
  world.inventories.set(medic.id, inv);

  // Close enough that the gun's bloom cannot miss. At 90px it missed roughly
  // one run in five and the check read as the *cure* being broken, which is
  // the harness lying rather than the code failing.
  const patient = r.human('patient', 440, 400);
  world.pendingInfections.set(patient.id, r.clock + 90_000);
  world.infectedByDog.set(patient.id, DOG);

  rebuildEntityGrid(world);
  let fired = false;
  for (let i = 0; i < 6 && world.pendingInfections.has(patient.id); i++) {
    fired = fireHeld(world, medic, inv, 0, r.clock + 5000 + i * 4000) || fired;
  }
  check('the cure gun fired', fired);
  check('the infection is gone', !world.pendingInfections.has(patient.id));
  check("and so is the dog's claim on them", !world.infectedByDog.has(patient.id));

  // Now a shambler finishes the job. The dog gets nothing for it.
  r.shambler('finisher', 490, 400);
  world.grapples.set(patient.id, { zombieIds: new Set(['finisher']), endsAt: r.clock, escapeAt: null });
  r.run(2);
  r.clock += TURN_DELAY_MAX_MS + 2000;
  r.run(2);
  check(
    'a cured victim turned later credits nobody',
    (world.dogConversions.get(DOG) ?? 0) === 0,
    `${world.dogConversions.get(DOG) ?? 0}`,
  );
}

// ----------------------------------------------------------------- the wire

function testWire(): void {
  console.log('\nwhat goes on the wire');
  const r = rig();
  check('not roaring: no flag at all', toWire(r.world, r.dog, true, r.clock).roaring === undefined);

  startDogAbility(r.world, DOG, 0, r.clock + TICK_MS);
  r.run(2);
  const during = toWire(r.world, r.dog, true, r.clock);
  check('roaring: the flag is set', during.roaring === true);
  check('and the jaws are not also claiming to be open', during.lunging === undefined);

  r.run(ROAR_TICKS);
  check('and it clears when the roar ends', toWire(r.world, r.dog, true, r.clock).roaring === undefined);
}

function testRefusals(): void {
  console.log('\nwhen it is refused');
  const r = rig();
  // `stunned` is id -> when they come round, so a mine is a deadline rather
  // than a flag.
  r.world.stunned.set(DOG, r.clock + 60_000);
  check('a mine on the ground refuses it', startDogAbility(r.world, DOG, 0, r.clock) === 'refused');
  r.world.stunned.delete(DOG);

  check('and it starts once back up', startDogAbility(r.world, DOG, 0, r.clock) === 'roared');
  r.run(6);
  r.world.stunned.set(DOG, r.clock + 60_000);
  r.run(2);
  check('a mine landing mid-roar cancels it', dogHudFor(r.world, DOG, r.clock)!.abilities[0]!.active < 0);

  const paused = rig();
  paused.world.paused = true;
  check('a paused round refuses it', startDogAbility(paused.world, DOG, 0, paused.clock) === 'refused');

  const down = rig();
  down.world.dogDeaths.set(DOG, down.clock);
  check('a dog lying in the road refuses it', startDogAbility(down.world, DOG, 0, down.clock) === 'refused');

  const other = rig();
  check('and somebody who is not a dog refuses it', startDogAbility(other.world, 'nobody', 0, other.clock) === 'refused');

  // Teeth already in somebody: the head is doing something else.
  const busy = rig();
  const bitten = busy.human('in-the-jaws', busy.dog.x + 20, busy.dog.y);
  busy.world.grapples.set(bitten.id, {
    zombieIds: new Set([DOG]),
    endsAt: busy.clock + 5000,
    // Deliberately null: this grip exists to have a mouthful in it when the key
    // is pressed, so it must not break early and let the roar through.
    escapeAt: null,
  });
  const st = busy.world.dogState.get(DOG);
  busy.run(1);
  void st;
  busy.world.dogState.get(DOG)!.victimId = bitten.id;
  check('a mouthful refuses it', startDogAbility(busy.world, DOG, 0, busy.clock) === 'refused');
}

function testShotMidRoar(): void {
  console.log('\nshot while roaring');
  const r = rig();
  const world = r.world;
  emptyTheHorde(world);
  // Something to rise back out of, so it goes down rather than out of the round.
  r.shambler('host', 600, 600);
  r.shambler('listener', r.dog.x + 80, r.dog.y);

  r.aim(Math.min(WORLD_WIDTH - 100, Math.max(100, r.dog.x + 500)), r.dog.y);
  check('it starts', startDogAbility(world, DOG, 0, r.clock + TICK_MS) === 'roared');
  r.run(10);
  check('and is running', dogHudFor(world, DOG, r.clock)!.abilities[0]!.active >= 0);

  killEntity(world, r.dog, r.clock);
  r.run(2);
  check('a round finishes the roar with it', dogHudFor(world, DOG, r.clock)!.abilities[0]!.active < 0);
  check('and the wire stops claiming it', toWire(world, r.dog, true, r.clock).roaring === undefined);

  // Up again on the far side of the death window *and* the birth after it —
  // the roar must not fire from the grave, at a spot picked before it was
  // killed and half a map away.
  //
  // Both windows, because being down is two stages now: the body lying in the
  // road, then the shambler it comes out of convulsing. Advancing only past the
  // first leaves the animal part-way out of a host that has not been spent yet,
  // which reads as risen to `dogsOut` and to `entities` and is not.
  r.clock += DOG_DEATH_MS + 200;
  r.run(4);
  check('a host was chosen', world.dogBirths.has(DOG));
  r.clock += DOG_BIRTH_MS + 200;
  r.run(4);
  check('it rose again', !world.dogsOut.has(DOG) && world.entities.has(DOG) && !world.dogBirths.has(DOG));
  check(
    'and no order was ever given',
    (world.ai.get('listener')?.lastSeenX ?? null) === null,
  );
  check('nothing walked in at the breach', countShamblers(world) <= 1, `${countShamblers(world)} left`);
}

console.log('roar check');
testLock();
testTheBar();
testWhoAnswers();
testAimIntoAWall();
testSummons();
testTally();
testIncubatingDoesNotCount();
testCureTakesTheCreditBack();
testWire();
testRefusals();
testShotMidRoar();
console.log(`\n${failures === 0 ? 'all good' : `${failures} FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
