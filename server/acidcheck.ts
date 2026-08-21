/**
 * Harness for the dog's acid. Headless — no socket, no port — so it leaves a
 * game running on 8080 completely alone.
 *
 *   npx tsx acidcheck.ts
 *
 * Four claims, and each one has a control beside it, because three of the four
 * are about something *not* happening and a check that only ever asserts an
 * absence passes just as well when the feature is missing entirely:
 *
 *   - it slows humans inside it, and does not slow the horde or the dog
 *   - it blocks a sight line across it, and does not blind whoever is in it
 *   - the splash blinds an NPC, who then looks around and does not move
 *   - the splash misses somebody stood in the cloud but outside the impact
 *
 * The staged geometry is pinned throughout. A civilian left to its own devices
 * walks out of a cloud within a second, and "they were slowed" measured against
 * a body that has left is a measurement of nothing.
 */
import {
  createWorld,
  resetWorld,
  rebuildEntityGrid,
  spawnDog,
  makeEntity,
  newAiState,
  hasLineOfSight,
  speedAt,
  type Entity,
  type World,
} from './src/world.js';
import { computeFrozen, updateAi } from './src/ai.js';
import { startDogAbility, updateDogs, dogHudFor } from './src/dog.js';
import { updateAcid } from './src/acid.js';
import {
  ACID_BLIND_LINE,
  ACID_BLIND_MS,
  ACID_CLOUD_MS,
  ACID_CLOUD_RADIUS,
  ACID_IMPACT_RADIUS,
  ACID_SLOW_MUL,
  DOG_SPIT_COOLDOWN_MS,
  DOG_SPIT_RANGE,
  DOG_SPIT_TRAVEL_MS,
  HUMAN_WALK_SPEED,
  TICK_RATE,
} from '../shared/constants.js';

const TICK_MS = 1000 / TICK_RATE;
const DOG = 'acid-dog';

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
  aim(x: number, y: number): void;
  spit(): string;
  body(id: string, type: 'human' | 'officer' | 'zombie', x: number, y: number): Entity;
}

function rig(withAi = false): Rig {
  const world = createWorld();
  resetWorld(world);
  world.dogs.add(DOG);
  world.playerIds.add(DOG);
  spawnDog(world, DOG);
  const dog = world.entities.get(DOG)!;
  // Out of the way of the city's own outbreak, and on ground the staged bodies
  // can be placed around.
  dog.x = 2000;
  dog.y = 1500;
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
  for (const e of [...world.entities.values()]) {
    if (e.id === DOG) continue;
    world.entities.delete(e.id);
    world.ai.delete(e.id);
  }

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
      updateAcid(world, this.clock);
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
    spit(): string {
      return startDogAbility(world, DOG, 1, this.clock);
    },
    body(id, type, x, y): Entity {
      const e = makeEntity(id, type, x, y);
      world.entities.set(id, e);
      world.ai.set(id, newAiState(this.clock, x, y));
      return e;
    },
  };
}

const travelTicks = Math.ceil(DOG_SPIT_TRAVEL_MS / TICK_MS) + 1;

function onlyCloud(world: World) {
  return [...world.acid.values()][0];
}

/**
 * A stretch of open road wide enough to stage a sight line across.
 *
 * **The map is not seeded**, so a spot picked by hand is clear on some cities
 * and inside a shop on others — and a test of "the cloud broke the line" whose
 * *control* fails half the time is a test that reports the city rather than the
 * code. This finds a lane that is actually clear and moves the dog to it.
 *
 * Returns the centre, which is where the cloud goes; the dog stands `half` to
 * the left of it and the two observers sit `half` either side.
 */
function clearLane(world: World, half: number): { x: number; y: number } | null {
  for (let i = 0; i < 4000; i++) {
    const x = half + 60 + Math.random() * (world.map.width - half * 2 - 120);
    const y = 60 + Math.random() * (world.map.height - 120);
    if (!world.nav.isReachable(x, y)) continue;
    // Clear the whole way across, and clear from the dog's own spot to where it
    // is about to throw — otherwise the gobbet is aimed through a wall.
    if (!hasLineOfSight(world, x - half, y, x + half, y)) continue;
    if (!world.nav.isReachable(x - half, y) || !world.nav.isReachable(x + half, y)) continue;
    return { x, y };
  }
  return null;
}

// -------------------------------------------------------- throwing the stuff

function testThrow(): void {
  console.log('\nit lands where the crosshair is');
  const r = rig();

  r.aim(r.dog.x + 300, r.dog.y);
  check('the key is accepted', r.spit() === 'spat');
  check('a gobbet is in the air', r.world.spits.size === 1);
  check('and no cloud yet', r.world.acid.size === 0);

  r.run(travelTicks);
  check('it lands', r.world.acid.size === 1 && r.world.spits.size === 0);
  const c = onlyCloud(r.world);
  check('at the crosshair', Math.hypot(c.x - (r.dog.x + 300), c.y - r.dog.y) < 1,
    `${Math.round(Math.hypot(c.x - (r.dog.x + 300), c.y - r.dog.y))}px off`);

  // Beyond the throw it is clamped rather than refused — the flamethrower's
  // rule, and for the same reason.
  const r2 = rig();
  r2.aim(r2.dog.x + 4000, r2.dog.y);
  r2.spit();
  r2.run(travelTicks);
  const far = onlyCloud(r2.world);
  const reach = Math.hypot(far.x - r2.dog.x, far.y - r2.dog.y);
  check('a crosshair past the range is clamped to it', Math.abs(reach - DOG_SPIT_RANGE) < 1,
    `${Math.round(reach)}px against ${DOG_SPIT_RANGE}`);
  check('and never further than the dog can see',
    DOG_SPIT_RANGE < 945, `${DOG_SPIT_RANGE} against a 945px view`);

  // The cooldown.
  const r3 = rig();
  r3.aim(r3.dog.x + 200, r3.dog.y);
  check('first spit taken', r3.spit() === 'spat');
  check('second refused straight away', r3.spit() === 'refused');
  r3.run(Math.ceil((DOG_SPIT_COOLDOWN_MS - 500) / TICK_MS));
  check('still refused just short of the cooldown', r3.spit() === 'refused');
  r3.run(Math.ceil(1000 / TICK_MS));
  check('and taken past it', r3.spit() === 'spat');
}

// ------------------------------------------------------------------ the slow

function testSlow(): void {
  console.log('\nit slows humans inside it, and nothing else');
  const r = rig();
  r.aim(r.dog.x + 300, r.dog.y);
  r.spit();
  r.run(travelTicks);
  const c = onlyCloud(r.world);

  // Measured through `speedAt`, which is the one function every mover calls.
  // Asking it directly is the honest test: it is what decides the pace, and a
  // rig that instead watched a body walk would be measuring the AI's choice of
  // heading as much as the cloud.
  const inside = speedAt(r.world, c.x, c.y, HUMAN_WALK_SPEED, 'human');
  const outside = speedAt(r.world, c.x + ACID_CLOUD_RADIUS + 200, c.y, HUMAN_WALK_SPEED, 'human');
  check('a human in it is slowed', Math.abs(inside - HUMAN_WALK_SPEED * ACID_SLOW_MUL) < 0.01,
    `${inside.toFixed(1)} against ${HUMAN_WALK_SPEED}`);
  check('and one beside it is not', Math.abs(outside - HUMAN_WALK_SPEED) < 0.01,
    `${outside.toFixed(1)}`);

  const officer = speedAt(r.world, c.x, c.y, HUMAN_WALK_SPEED, 'officer');
  check('the garrison is slowed too', Math.abs(officer - HUMAN_WALK_SPEED * ACID_SLOW_MUL) < 0.01);

  // The control, and the one that matters: it comes out of a zombie.
  const horde = speedAt(r.world, c.x, c.y, HUMAN_WALK_SPEED, 'zombie');
  check('the horde walks through it untouched', Math.abs(horde - HUMAN_WALK_SPEED) < 0.01,
    `${horde.toFixed(1)}`);
  check('and so does the dog, being one', Math.abs(horde - HUMAN_WALK_SPEED) < 0.01);

  // At the rim rather than at the middle, since the radius is what the wire and
  // the fog both key on.
  const rim = speedAt(r.world, c.x + c.r - 2, c.y, HUMAN_WALK_SPEED, 'human');
  const past = speedAt(r.world, c.x + c.r + 4, c.y, HUMAN_WALK_SPEED, 'human');
  check('slowed just inside the rim', rim < HUMAN_WALK_SPEED);
  check('and not just outside it', Math.abs(past - HUMAN_WALK_SPEED) < 0.01);

  // And it lifts when the cloud goes.
  r.run(Math.ceil(ACID_CLOUD_MS / TICK_MS) + 2);
  check('the cloud expires', r.world.acid.size === 0);
  check('and the ground is quick again',
    Math.abs(speedAt(r.world, c.x, c.y, HUMAN_WALK_SPEED, 'human') - HUMAN_WALK_SPEED) < 0.01);
}

// ------------------------------------------------------------ the sight line

function testSight(): void {
  console.log('\nit blocks a sight line, and does not blind whoever is in it');
  const r = rig();
  /*
   * The cloud goes 300px out and the two observers sit 300px either side of
   * *it*, not of the dog.
   *
   * Aiming at the dog's own feet does **not** put a cloud on them:
   * `DOG_SPIT_MIN_THROW` is a floor as well as `DOG_SPIT_RANGE` being a
   * ceiling, so a crosshair on yourself throws it 90px out on whatever bearing
   * you were facing. The first version of this staged its geometry around the
   * dog and was measuring a cloud 90px from where it thought it was.
   */
  const lane = clearLane(r.world, 300);
  if (!lane) {
    check('found a clear lane to stage this on', false, 'no open ground in this city');
    return;
  }
  // The dog stands where the left-hand observer is and throws to the middle.
  r.dog.x = lane.x - 300;
  r.dog.y = lane.y;
  const y = lane.y;
  const landing = lane.x;
  const ax = landing - 300;
  const bx = landing + 300;
  r.aim(landing, y);

  // The control, and it is load-bearing: this is a real city with real
  // buildings in it, so a line being broken says nothing unless it was whole a
  // moment earlier. The *second* control below is the same idea for a line the
  // cloud should not touch — checked before and after rather than asserted
  // clear, because whether a building happens to sit across it is not something
  // this test gets to decide.
  check('clear before there is any acid', hasLineOfSight(r.world, ax, y, bx, y));
  const asideBefore = hasLineOfSight(r.world, ax, y - 600, bx, y - 600);

  r.spit();
  r.run(travelTicks);
  const c = onlyCloud(r.world);
  check('the cloud sits between the two of them',
    Math.abs(c.x - landing) < 1 && c.r > 0 && landing - ax > c.r && bx - landing > c.r,
    `r=${Math.round(c.r)}, ${Math.round(landing - ax)}px to each`);
  check('and the line is broken', !hasLineOfSight(r.world, ax, y, bx, y));

  // Trained eyes do not help. `seeThroughBushes` means foliage does not hide a
  // zombie from an officer, and training is not a defence against a chemical.
  check('an officer cannot see through it either',
    !hasLineOfSight(r.world, ax, y, bx, y, true));

  // The bush rule, deliberately inherited: standing in it you see out. This is
  // what stops the ability blinding the dog that used it.
  check('somebody stood in it can see out', hasLineOfSight(r.world, c.x, c.y, bx, y));
  check('and out the other way as well', hasLineOfSight(r.world, c.x, c.y, ax, y));

  // A line that never goes near it is untouched — whatever it was before.
  check('a line well clear of it is unchanged',
    hasLineOfSight(r.world, ax, y - 600, bx, y - 600) === asideBefore,
    `was ${asideBefore ? 'clear' : 'blocked by the city'}`);

  r.run(Math.ceil(ACID_CLOUD_MS / TICK_MS) + 2);
  check('and the line comes back when it lifts', hasLineOfSight(r.world, ax, y, bx, y));
}

// ---------------------------------------------------------------- the splash

function testSplash(): void {
  console.log('\nthe splash blinds whoever it goes over');
  /*
   * **The horde goes in a rig of its own, and that is not tidiness.**
   *
   * The splash is 62px across, so anything staged inside it is within arm's
   * reach of everything else staged inside it — and the first version put a
   * zombie 22px from the civilian whose stillness it was measuring. `updateAi`
   * ran, the zombie grabbed them, `frozen` swallowed them a branch above the
   * blinded one, and the head stopped sweeping. It read as the sweep barely
   * working (0.28 rad against an expected 1.25) rather than as a rig that had
   * fed one of its subjects to the other.
   */
  const r = rig(true);
  const landing = { x: r.dog.x + 300, y: r.dog.y };
  const hit = r.body('hit', 'human', landing.x + 10, landing.y);
  const near = r.body('near', 'human', landing.x + ACID_CLOUD_RADIUS - 12, landing.y);
  const clear = r.body('clear', 'human', landing.x + 900, landing.y);

  r.aim(landing.x, landing.y);
  r.spit();
  r.run(travelTicks);

  check('the one under it is blinded', r.world.blinded.has('hit'));
  check('the one in the cloud but out of the splash is not', !r.world.blinded.has('near'),
    `${Math.round(Math.hypot(near.x - landing.x, near.y - landing.y))}px out, ` +
      `impact is ${ACID_IMPACT_RADIUS}`);
  check('and nor is somebody across the street', !r.world.blinded.has('clear'));

  const z = rig(true);
  const zLanding = { x: z.dog.x + 300, y: z.dog.y };
  z.body('horde', 'zombie', zLanding.x, zLanding.y);
  z.aim(zLanding.x, zLanding.y);
  z.spit();
  z.run(travelTicks);
  check('a zombie dead under the splash is never blinded', !z.world.blinded.has('horde'));

  // Looks around, does not move.
  const at = { x: hit.x, y: hit.y };
  const bearings: number[] = [];
  let moved = 0;
  for (let i = 0; i < 40; i++) {
    r.run(1);
    if (Math.hypot(hit.x - at.x, hit.y - at.y) > 0.01) moved++;
    bearings.push(hit.facing);
  }
  const spread = Math.max(...bearings) - Math.min(...bearings);
  check('they do not move', moved === 0, `${moved} of 40 ticks`);
  check('and they do look around', spread > 0.5, `${spread.toFixed(2)} rad of sweep`);

  // And it lifts. Measured over a long window on purpose: a civilian with
  // nothing frightening it strolls, pauses and picks a new target, so a short
  // one catches a perfectly ordinary standstill and calls it paralysis.
  r.run(Math.ceil(ACID_BLIND_MS / TICK_MS) + 2);
  check('the blinding runs out', !r.world.blinded.has('hit'));
  const lifted = { x: hit.x, y: hit.y };
  r.run(200);
  check('and they walk again', Math.hypot(hit.x - lifted.x, hit.y - lifted.y) > 1,
    `${Math.round(Math.hypot(hit.x - lifted.x, hit.y - lifted.y))}px`);

  // The control for "they do not move": a civilian nobody has thrown acid at,
  // over the same long window, in the same city.
  const freeAt = { x: clear.x, y: clear.y };
  r.run(200);
  check('a civilian not blinded plainly does move',
    Math.hypot(clear.x - freeAt.x, clear.y - freeAt.y) > 1,
    `${Math.round(Math.hypot(clear.x - freeAt.x, clear.y - freeAt.y))}px`);
}

/**
 * The line, over enough trials for a chance to mean something.
 *
 * Counted rather than asserted on one run: it is deliberately rare, so a single
 * spit saying nothing is the ordinary case and would fail a check that demanded
 * it. What is worth checking is that it is neither never nor always.
 */
function testLine(): void {
  console.log('\nrarely, they say so');
  let said = 0;
  const trials = 200;
  for (let i = 0; i < trials; i++) {
    const r = rig();
    const landing = { x: r.dog.x + 300, y: r.dog.y };
    r.body('hit', 'human', landing.x, landing.y);
    r.aim(landing.x, landing.y);
    r.spit();
    r.run(travelTicks);
    if (r.world.speech.get('hit')?.text === ACID_BLIND_LINE) said++;
  }
  const share = said / trials;
  check('some of them say it', said > 0, `${said}/${trials}`);
  check('and most of them do not', share < 0.5, `${(share * 100).toFixed(0)}%`);
}

// ----------------------------------------------------------------- the HUD

function testHud(): void {
  console.log('\nthe hexagon');
  const r = rig();
  let bar = dogHudFor(r.world, DOG, r.clock)!.abilities;
  check('there are two abilities now', bar[0] !== null && bar[1] !== null);
  check('the second is the spit', bar[1]?.name === 'SPIT');
  check('ready before it is used', bar[1]?.ready === 1);
  check('no badge, because it banks nothing', bar[1]?.charges === -1);
  check('and nothing to run', bar[1]?.active === -1);

  r.aim(r.dog.x + 200, r.dog.y);
  r.spit();
  bar = dogHudFor(r.world, DOG, r.clock)!.abilities;
  check('spent, and the hexagon empties', (bar[1]?.ready ?? 1) < 0.05, `${bar[1]?.ready}`);

  r.run(Math.ceil(DOG_SPIT_COOLDOWN_MS / 2 / TICK_MS));
  bar = dogHudFor(r.world, DOG, r.clock)!.abilities;
  const half = bar[1]?.ready ?? 0;
  check('and fills back up', half > 0.4 && half < 0.6, half.toFixed(2));

  // The roar is untouched by any of it.
  check('the roar is still ready', bar[0]?.ready === 1);
  check('spitting did not spend a roar charge', bar[0]?.charges === 0);
}

// ------------------------------------------------------- when it is refused

function testRefusals(): void {
  console.log('\nwhen it is refused');
  const r = rig();
  r.aim(r.dog.x + 200, r.dog.y);

  check('slot 2 does nothing, and says so', startDogAbility(r.world, DOG, 2, r.clock) === 'refused');
  check('slot 3 the same', startDogAbility(r.world, DOG, 3, r.clock) === 'refused');

  // Roaring is the mouth being busy.
  const r2 = rig();
  r2.aim(r2.dog.x + 200, r2.dog.y);
  check('roar starts', startDogAbility(r2.world, DOG, 0, r2.clock) === 'roared');
  check('and no spitting through it', r2.spit() === 'refused');

  // Dropped by a mine.
  const r3 = rig();
  r3.aim(r3.dog.x + 200, r3.dog.y);
  r3.world.stunned.set(DOG, r3.clock + 5000);
  check('a stunned dog does not spit', r3.spit() === 'refused');

  // Paused.
  const r4 = rig();
  r4.aim(r4.dog.x + 200, r4.dog.y);
  r4.world.paused = true;
  check('nor does a paused one', r4.spit() === 'refused');
}

console.log('=== the dog spits, and the street stops being one street ===');
testThrow();
testSlow();
testSight();
testSplash();
testLine();
testHud();
testRefusals();
console.log(`\n${failures === 0 ? 'all checks passed' : `${failures} FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
