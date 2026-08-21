/**
 * Harness for the dog's birth — the window between being killed and being back.
 * Headless: no socket, no port, so it leaves a game running on 8080 alone.
 *
 *   npx tsx birthcheck.ts
 *
 * What it is checking is not really "does the dog come back", which it always
 * did. It is that the *host is chosen a birth window early and is watchable* —
 * that the camera has something to be pointed at, that the thing it is pointed
 * at is convulsing on the wire, and that it is still standing there right up to
 * the instant it bursts. Every one of those is a property the old one-instant
 * respawn did not have and could not have been said to fail.
 *
 * The control is the second half of `testWatchable`: with the dog's body left
 * where it fell instead of parked on the host, the host spends its whole
 * convulsion further away than the dog can see, which is where this used to
 * happen.
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
import { dogHudFor, updateDogs } from './src/dog.js';
import {
  DOG_BIRTH_MS,
  DOG_BIRTH_TWIST_FROM,
  DOG_DEATH_MS,
  DOG_SIGHT_RADIUS,
  TICK_RATE,
} from '../shared/constants.js';

const TICK_MS = 1000 / TICK_RATE;
const DOG = 'birth-dog';

let failures = 0;
function check(label: string, ok: boolean, detail = ''): void {
  if (!ok) failures++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
}

interface Rig {
  world: World;
  dog: Entity;
  clock: number;
  tick(): void;
  run(n: number): void;
  shambler(id: string, x: number, y: number): Entity;
  /** What a viewer is told about one body as things stand this tick. */
  wire(id: string): Record<string, unknown> | null;
}

function makeCommand() {
  return {
    input: { up: false, down: false, left: false, right: false },
    aim: 0,
    aimX: 0,
    aimY: 0,
    shooting: false,
    sprint: false,
    interact: false,
    rightDown: false,
  };
}

function rig(withAi = false): Rig {
  const world = createWorld();
  resetWorld(world);
  world.dogs.add(DOG);
  world.playerIds.add(DOG);
  spawnDog(world, DOG);
  const dog = world.entities.get(DOG)!;
  world.commands.set(DOG, makeCommand());

  return {
    world,
    dog,
    clock: Date.now(),
    // A clock that actually advances. Ticks run back to back complete in
    // microseconds, so `Date.now()` barely moves and every time-gated piece of
    // work is skipped — which here would mean the death window never elapsing.
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
    shambler(id: string, x: number, y: number): Entity {
      const e = makeEntity(id, 'zombie', x, y);
      world.entities.set(id, e);
      world.ai.set(id, newAiState(this.clock, x, y));
      return e;
    },
    /**
     * Note the third argument is `revealInfected`, not `now` — passing the
     * clock there leaves `now` defaulting to `Date.now()`, which in a headless
     * harness barely moves. That read the birth as 0.00 on every tick of it and
     * looked exactly like the ramp never starting.
     */
    wire(id: string): Record<string, unknown> | null {
      const e = world.entities.get(id);
      if (!e) return null;
      return toWire(world, e, false, this.clock) as unknown as Record<string, unknown>;
    },
  };
}

/** Clear the city's own outbreak out, so the staged bodies are the only ones. */
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

const deathTicks = Math.ceil(DOG_DEATH_MS / TICK_MS) + 1;
const birthTicks = Math.ceil(DOG_BIRTH_MS / TICK_MS) + 1;

// ------------------------------------------------------- the sequence itself

function testSequence(): void {
  console.log('\ndeath, then a birth you can watch');
  const r = rig();
  emptyTheHorde(r.world);
  const host = r.shambler('host', 2000, 1500);
  const diedAt = { x: r.dog.x, y: r.dog.y };

  killEntity(r.world, r.dog, r.clock);
  check('killed: down, and no birth yet', r.world.dogDeaths.has(DOG) && !r.world.dogBirths.has(DOG));
  check('the body stays where it fell', r.dog.x === diedAt.x && r.dog.y === diedAt.y);

  // Through the death window. The host must still be an ordinary shambler for
  // all of it — nothing happens to it while the player is watching their own
  // animal go down.
  let convulsedEarly = 0;
  for (let i = 0; i < deathTicks - 2; i++) {
    r.tick();
    if (r.wire('host')?.birthing !== undefined) convulsedEarly++;
  }
  check('nothing happens to the host during the death window', convulsedEarly === 0,
    `${convulsedEarly} ticks`);
  check('still down, still not born', r.world.dogDeaths.has(DOG) && !r.world.dogBirths.has(DOG));

  // Over the line.
  r.run(3);
  check('death window over: the birth has begun', r.world.dogBirths.has(DOG));
  check('the host was chosen and is still alive', r.world.entities.has('host'));
  check('the shambler has not been spent yet', countShamblers(r.world) === 1);
  check('the dog is still dead on the wire', r.wire(DOG)?.dead === true);
  check('and holds no health yet', r.dog.health === 0);

  // The convulsion, sampled the whole way.
  const seen: number[] = [];
  let hostMoved = 0;
  let twistHalf = 0;
  const hostAt = { x: host.x, y: host.y };
  for (let i = 0; i < birthTicks - 2; i++) {
    r.tick();
    const w = r.wire('host');
    const b = w?.birthing as number | undefined;
    if (b !== undefined) seen.push(b);
    if (host.x !== hostAt.x || host.y !== hostAt.y) hostMoved++;
    if ((b ?? 0) > DOG_BIRTH_TWIST_FROM) twistHalf++;
  }
  check('the host convulses on every tick of it', seen.length === birthTicks - 2,
    `${seen.length}/${birthTicks - 2}`);
  check('and it ramps 0 to 1', seen[0] < 0.1 && seen[seen.length - 1] > 0.9,
    `${seen[0]?.toFixed(2)} to ${seen[seen.length - 1]?.toFixed(2)}`);
  check('never going backwards', seen.every((v, i) => i === 0 || v >= seen[i - 1]));
  check('the arms half is reached', twistHalf > 0, `${twistHalf} ticks past ${DOG_BIRTH_TWIST_FROM}`);
  check('the host is frozen for all of it', hostMoved === 0, `${hostMoved} ticks moved`);

  // And the burst.
  r.run(3);
  const gap = Math.hypot(r.dog.x - hostAt.x, r.dog.y - hostAt.y);
  check('the host is gone', !r.world.entities.has('host'));
  check('the birth is over', !r.world.dogBirths.has(DOG));
  check('the horde is one shorter', countShamblers(r.world) === 0);
  check('the dog is up on full health', r.dog.health === r.dog.maxHealth);
  check('it is alive on the wire', r.wire(DOG)?.dead !== true);
  check('and it came up where the host burst', gap < 1, `${gap.toFixed(1)}px`);
  check('a long way from where it died',
    Math.hypot(r.dog.x - diedAt.x, r.dog.y - diedAt.y) > 200,
    `${Math.round(Math.hypot(r.dog.x - diedAt.x, r.dog.y - diedAt.y))}px`);
}

// ------------------------------------------------ the camera has a subject

function testWatchable(): void {
  console.log('\nthe camera is on the host, which is the whole point');
  const r = rig();
  emptyTheHorde(r.world);
  r.shambler('host', 2600, 1900);
  const diedAt = { x: r.dog.x, y: r.dog.y };

  killEntity(r.world, r.dog, r.clock);
  r.run(deathTicks + 1);
  const host = r.world.entities.get('host')!;

  // The client's camera follows the entity you are driving and nothing else,
  // so "the birth is on screen" is exactly "the dog's body is on the host".
  const gap = Math.hypot(r.dog.x - host.x, r.dog.y - host.y);
  check('the dog body is parked on the host', gap < 1, `${gap.toFixed(1)}px apart`);

  // The control: where it *would* have been. The old respawn put the body
  // nowhere until the instant it was needed, so a convulsion staged then would
  // have happened this far outside the frame.
  const wouldHaveBeen = Math.hypot(diedAt.x - host.x, diedAt.y - host.y);
  check('and would not have been, left where it fell',
    wouldHaveBeen > DOG_SIGHT_RADIUS,
    `${Math.round(wouldHaveBeen)}px from the body, against a ${DOG_SIGHT_RADIUS}px view`);

  // Zero distance is also what puts the host inside the dog's own fog without a
  // word about births anywhere in `visibleTo`.
  check('so the host is inside the sight radius', gap < DOG_SIGHT_RADIUS);
}

// --------------------------------------------------- the HUD and the fade

function testHud(): void {
  console.log('\nwhat the HUD says through it');
  const r = rig();
  emptyTheHorde(r.world);
  r.shambler('host', 2000, 1500);

  killEntity(r.world, r.dog, r.clock);
  r.run(4);
  let hud = dogHudFor(r.world, DOG, r.clock)!;
  check('dying is running', hud.dying > 0 && hud.dying < 1, hud.dying.toFixed(2));
  check('birth is not', hud.birth < 0);

  r.run(deathTicks);
  hud = dogHudFor(r.world, DOG, r.clock)!;
  check('birth is running', hud.birth >= 0 && hud.birth < 1, hud.birth.toFixed(2));
  check('dying has stopped', hud.dying < 0);
  check('no jaws to read while there is no animal', hud.jawsOpen < 0 && hud.bite === 0);

  // The two are mutually exclusive, which is what lets the client fade out on
  // one and back in on the other without deciding which half of a single ramp
  // it is looking at.
  let both = 0;
  for (let i = 0; i < birthTicks; i++) {
    r.tick();
    const h = dogHudFor(r.world, DOG, r.clock)!;
    if (h.dying >= 0 && h.birth >= 0) both++;
  }
  check('never both at once', both === 0, `${both} ticks`);

  hud = dogHudFor(r.world, DOG, r.clock)!;
  check('and then neither', hud.dying < 0 && hud.birth < 0);
  check('the dog is not out', !hud.out);
}

// ------------------------------------------- a host shot out from under you

function testHostKilled(): void {
  console.log('\nthe garrison shoots the host mid-birth');
  const r = rig();
  emptyTheHorde(r.world);
  r.shambler('host-a', 2000, 1500);
  r.shambler('host-b', 2600, 1900);

  killEntity(r.world, r.dog, r.clock);
  r.run(deathTicks + 1);
  const first = r.world.dogBirths.get(DOG)!.hostId;
  check('a birth is under way', first !== undefined, first);

  // Halfway through it, kill the body it is coming out of.
  r.run(Math.floor(birthTicks / 2));
  killEntity(r.world, r.world.entities.get(first)!, r.clock);
  r.tick();

  const second = r.world.dogBirths.get(DOG)?.hostId;
  check('it starts again on the other body', second !== undefined && second !== first,
    `${first} then ${second}`);
  check('and the clock restarted with it',
    r.world.dogBirths.get(DOG)!.at >= r.clock - TICK_MS * 2);

  r.run(birthTicks + 2);
  check('it still gets up', r.dog.health === r.dog.maxHealth);
  check('having spent the second body', !r.world.entities.has(second!));

  // And with nothing left at all, that is the end of it.
  console.log('\n  ...and with no horde left');
  const r2 = rig();
  emptyTheHorde(r2.world);
  r2.shambler('only', 2000, 1500);
  killEntity(r2.world, r2.dog, r2.clock);
  r2.run(deathTicks + 1);
  check('a birth began on the last body', r2.world.dogBirths.has(DOG));
  killEntity(r2.world, r2.world.entities.get('only')!, r2.clock);
  r2.run(2);
  check('host killed and nothing to fall back on: the dog is out', r2.world.dogsOut.has(DOG));
  check('and holds no entity', !r2.world.entities.has(DOG));
  check('the HUD says so', dogHudFor(r2.world, DOG, r2.clock)?.out === true);

  // The other way to get there: killed with the map already empty.
  const r3 = rig();
  emptyTheHorde(r3.world);
  killEntity(r3.world, r3.dog, r3.clock);
  r3.run(deathTicks + 2);
  check('no body to be born out of at all: out, with no birth attempted',
    r3.world.dogsOut.has(DOG) && !r3.world.dogBirths.has(DOG));
}

// ------------------------------------------------- two dogs, one shambler

function testTwoDogs(): void {
  console.log('\ntwo dogs cannot come out of the same body');
  const world = createWorld();
  resetWorld(world);
  for (const id of ['dog-a', 'dog-b']) {
    world.dogs.add(id);
    world.playerIds.add(id);
    spawnDog(world, id);
    world.commands.set(id, makeCommand());
  }
  for (const e of [...world.entities.values()]) {
    if (e.type !== 'zombie' || world.dogs.has(e.id)) continue;
    world.entities.delete(e.id);
    world.ai.delete(e.id);
  }
  for (let i = 0; i < 2; i++) {
    const e = makeEntity(`h${i}`, 'zombie', 1500 + i * 700, 1200);
    world.entities.set(e.id, e);
    world.ai.set(e.id, newAiState(Date.now(), e.x, e.y));
  }

  let clock = Date.now();
  killEntity(world, world.entities.get('dog-a')!, clock);
  killEntity(world, world.entities.get('dog-b')!, clock);
  for (let i = 0; i < deathTicks + 2; i++) {
    clock += TICK_MS;
    rebuildEntityGrid(world);
    updateDogs(world, TICK_MS / 1000, clock);
  }
  const a = world.dogBirths.get('dog-a')?.hostId;
  const b = world.dogBirths.get('dog-b')?.hostId;
  check('both are being born', a !== undefined && b !== undefined, `${a} / ${b}`);
  check('out of different bodies', a !== b, `${a} vs ${b}`);
}

// -------------------------------------------- and the bodies go with the city

/**
 * A corpse is permanent **for the round**, not across one.
 *
 * The body a killed dog leaves is deliberately never trimmed while the round is
 * up — it is the only lasting mark the officers get for having put the animal
 * down. But what it holds is a *coordinate*, and a coordinate means something
 * only on the map it was made on: `resetWorld` generates a different city, so a
 * corpse carried over is a body lying in a street that no longer exists.
 *
 * `world.corpses` was the one piece of dog state neither reset path caught.
 * `dogsOut`, `dogDeaths`, `dogState` and `dogBirths` are all dropped per id by
 * `spawnDog` — which only runs for a seat somebody is in — and this is a plain
 * array on the world that no seat owns.
 */
function testResetClearsCorpses(): void {
  console.log('\na corpse is permanent for the round, not across one');
  const r = rig();
  emptyTheHorde(r.world);
  r.shambler('host-a', 2000, 1500);
  r.shambler('host-b', 2600, 1900);

  // Two deaths, so the check is about the array being emptied rather than about
  // one entry happening not to be written.
  killEntity(r.world, r.dog, r.clock);
  r.run(deathTicks + birthTicks + 3);
  const afterFirst = r.world.corpses.length;
  killEntity(r.world, r.world.entities.get(DOG)!, r.clock);
  r.run(deathTicks + birthTicks + 3);

  // The control: without bodies actually being left, "none after the reset"
  // would pass just as well with the whole corpse feature deleted.
  check('a killed dog leaves a body', afterFirst === 1, `${afterFirst}`);
  check('and a second death leaves a second', r.world.corpses.length === 2,
    `${r.world.corpses.length}`);
  const oldCity = { w: r.world.map.width, h: r.world.map.height };
  const carried = r.world.corpses.map((c) => `${c.x},${c.y}`);

  resetWorld(r.world);
  check('the reset clears them', r.world.corpses.length === 0,
    `${r.world.corpses.length} left${r.world.corpses.length ? ` at ${carried.join(' ')}` : ''}`);
  void oldCity;

  // And the next round keeps its own count rather than continuing the last.
  const shamblers = countShamblers(r.world);
  if (shamblers > 0) {
    killEntity(r.world, r.world.entities.get(DOG)!, r.clock);
    r.run(deathTicks + birthTicks + 3);
    check('a death in the new round leaves exactly one', r.world.corpses.length === 1,
      `${r.world.corpses.length}`);
  } else {
    check('a death in the new round leaves exactly one', false, 'no horde to be killed by');
  }

  // The dog itself came through the reset as a dog, which is what says the
  // reset ran properly rather than having quietly emptied the round.
  check('and it is still a dog afterwards', r.world.dogs.has(DOG) && r.world.entities.has(DOG));
}

console.log('=== the dog is born out of something, and you watch it happen ===');
testSequence();
testWatchable();
testHud();
testHostKilled();
testTwoDogs();
testResetClearsCorpses();
console.log(`\n${failures === 0 ? 'all checks passed' : `${failures} FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
