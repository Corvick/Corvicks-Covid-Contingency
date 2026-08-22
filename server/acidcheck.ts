/**
 * Harness for the dog's acid. Headless — no socket, no port — so it leaves a
 * game running on 8080 completely alone.
 *
 *   npx tsx acidcheck.ts
 *
 * Five claims, and each one has a control beside it, because most of them are
 * about something *not* happening and a check that only ever asserts an absence
 * passes just as well when the feature is missing entirely:
 *
 *   - it slows humans inside it, and does not slow the horde or the dog
 *   - **it is a cluster of lobes rather than a disc**, and none of them reaches
 *     past the bounding radius the wire carries
 *   - it blocks a sight line across it, and **blinds whoever is in it outright
 *     while the horde sees straight through** — which is the half that makes it
 *     an ability rather than a liability, so the dog is the control
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
  killEntity,
  makeEntity,
  newAiState,
  hasLineOfSight,
  speedAt,
  type Entity,
  type World,
} from './src/world.js';
import { computeFrozen, setBotIgnoresAcid, updateAi } from './src/ai.js';
import { newInventory } from './src/inventory.js';
import { startDogAbility, updateDogs, dogHudFor } from './src/dog.js';
import { updateAcid } from './src/acid.js';
import { bouncesOff } from './src/heli.js';
import { acidLobes, inAcidLobes } from '../shared/acidshape.js';
import {
  ACID_BLIND_LINE,
  ACID_BLIND_MS,
  ACID_CLOUD_MS,
  ACID_CLOUD_RADIUS,
  ACID_GROW_MS,
  ACID_LOBE_COUNT,
  ACID_IMPACT_RADIUS,
  ACID_SLOW_MUL,
  BOT_ACID_CLEAR,
  DOG_DEATH_MS,
  DOG_BIRTH_MS,
  DOG_SPIT_COOLDOWN_MS,
  DOG_SPIT_RANGE,
  DOG_SPIT_UNLOCK_AT,
  DOG_ROAR_MS,
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

/**
 * Somewhere a gobbet can be thrown `reach` east of without hitting anything.
 *
 * Sampled with **`bouncesOff` itself**, not with `nav.isBlocked`: those are not
 * the same set — a shut door is solid to a thrown thing and is deliberately not
 * in the nav grid — and a lane cleared by the wrong predicate is a lane with a
 * door in it, which is the bounce firing in the one test that assumes it will
 * not.
 */
function openThrow(world: World, reach: number): { x: number; y: number } {
  for (let i = 0; i < 6000; i++) {
    const x = 80 + Math.random() * Math.max(1, world.map.width - reach - 160);
    const y = 80 + Math.random() * (world.map.height - 160);
    if (!world.nav.isReachable(x, y)) continue;
    let clear = true;
    for (let d = 0; d <= reach && clear; d += 6) clear = !bouncesOff(world, x + d, y);
    if (clear) return { x, y };
  }
  return { x: 2000, y: 1500 };
}

/** Somewhere walkable, well clear of a point, for a control that has to walk. */
function walkableNear(
  world: World,
  x: number,
  y: number,
  min: number,
  max: number,
): { x: number; y: number } {
  for (let i = 0; i < 4000; i++) {
    const a = Math.random() * Math.PI * 2;
    const d = min + Math.random() * (max - min);
    const px = x + Math.cos(a) * d;
    const py = y + Math.sin(a) * d;
    if (px < 80 || py < 80 || px > world.map.width - 80 || py > world.map.height - 80) continue;
    if (world.nav.isBlocked(px, py) || !world.nav.isReachable(px, py)) continue;
    return { x: px, y: py };
  }
  return { x: x + max, y };
}

function rig(withAi = false, unlocked = true): Rig {
  const world = createWorld();
  resetWorld(world);
  world.dogs.add(DOG);
  world.playerIds.add(DOG);
  spawnDog(world, DOG);
  // **The acid is earned now**, so every rig that is about the acid rather than
  // about the gate has to have earned it — otherwise `spit()` is refused and
  // each of those checks passes or fails on the wrong thing entirely.
  // `dogTurned` is the running total and nothing spends it; `dogConversions` is
  // the roar's balance and is deliberately left at nought, so the roar's own
  // checks still see a dog with nothing banked.
  if (unlocked) world.dogTurned.set(DOG, DOG_SPIT_UNLOCK_AT);
  const dog = world.entities.get(DOG)!;
  // **Open ground with a clear throw east of it**, found rather than assumed.
  //
  // This used to be a fixed (2000, 1500), and that was safe only while a gobbet
  // passed through walls: now that it *bounces*, a spot that happens to be in a
  // shop or against a party wall on this city sends the thing back past the dog
  // and every check that stages a body at the crosshair fails. Measured that
  // way the failures moved from run to run — one run lost the splash tests,
  // the next lost "it lands where the crosshair is" with the cloud 465px off —
  // which is the harness reporting the city rather than the code, and is the
  // trap this repo has recorded against a fixed staging spot several times now.
  const spot = openThrow(world, DOG_SPIT_RANGE + 80);
  dog.x = spot.x;
  dog.y = spot.y;
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
      updateAcid(world, this.clock, TICK_MS / 1000);
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

  /*
   * Measured through `speedAt`, which is the one function every mover calls.
   * Asking it directly is the honest test: it is what decides the pace, and a
   * rig that instead watched a body walk would be measuring the AI's choice of
   * heading as much as the cloud.
   *
   * **Every figure here is against the same ground with the cloud taken off it,
   * never against `HUMAN_WALK_SPEED`.** `speedAt` also knows about bushes, and
   * roughly one city in ten puts one under the landing point — measured that
   * way it read **10.6 px/s where 19.3 was wanted, and the horde "slowed" to
   * 19.3 where 35 was wanted**, which is a bush multiplier on top of everything
   * and nothing to do with the acid. Lifting the cloud for a moment leaves the
   * ground as the only thing in the answer.
   */
  const paceFor = (x: number, y: number, type: 'human' | 'officer' | 'zombie'): number =>
    speedAt(r.world, x, y, HUMAN_WALK_SPEED, type);
  /** The same question with no acid anywhere: what this ground alone gives. */
  const bareFor = (x: number, y: number, type: 'human' | 'officer' | 'zombie'): number => {
    const held = new Map(r.world.acid);
    r.world.acid.clear();
    const pace = paceFor(x, y, type);
    for (const [k, v] of held) r.world.acid.set(k, v);
    return pace;
  };

  const inside = paceFor(c.x, c.y, 'human');
  const bareInside = bareFor(c.x, c.y, 'human');
  const outside = paceFor(c.x + ACID_CLOUD_RADIUS + 200, c.y, 'human');
  const bareOutside = bareFor(c.x + ACID_CLOUD_RADIUS + 200, c.y, 'human');
  check('a human in it is slowed', Math.abs(inside - bareInside * ACID_SLOW_MUL) < 0.01,
    `${inside.toFixed(1)} against the ${bareInside.toFixed(1)} this ground gives without it`);
  check('and one beside it is not', Math.abs(outside - bareOutside) < 0.01,
    `${outside.toFixed(1)}`);

  check('the garrison is slowed too',
    Math.abs(paceFor(c.x, c.y, 'officer') - bareFor(c.x, c.y, 'officer') * ACID_SLOW_MUL) < 0.01);

  // The control, and the one that matters: it comes out of a zombie.
  const horde = paceFor(c.x, c.y, 'zombie');
  check('the horde walks through it untouched',
    Math.abs(horde - bareFor(c.x, c.y, 'zombie')) < 0.01, `${horde.toFixed(1)}`);
  check('and so does the dog, being one',
    Math.abs(horde - bareFor(c.x, c.y, 'zombie')) < 0.01);

  /*
   * **Just inside the rim is a bearing question now, not a radius one.**
   *
   * A cloud is a cluster of lobes rather than a disc, so a spot two pixels
   * inside the bounding radius is solid on a bulge and open ground in one of
   * the notches between the lumps — and which one it lands in is the seed's
   * business. The honest claims are that *some* bearing is slowed right out at
   * the rim, and that *no* bearing is slowed past it, since nothing may reach
   * beyond the radius the wire and the fog both key on.
   */
  // Same rule as above: a human against the horde on the *same pixel*, so a
  // bearing that lands in a hedge cannot read as acid. Measured against the
  // flat walking speed instead, this reported **10 of 64 bearings "slowed" past
  // the rim** in a city where nothing whatsoever reaches past it.
  const acidSlowsHere = (x: number, y: number): boolean =>
    paceFor(x, y, 'human') < paceFor(x, y, 'zombie') - 0.01;
  let slowedAtRim = 0;
  let slowedPastRim = 0;
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    if (acidSlowsHere(c.x + Math.cos(a) * (c.r - 2), c.y + Math.sin(a) * (c.r - 2))) slowedAtRim++;
    if (acidSlowsHere(c.x + Math.cos(a) * (c.r + 4), c.y + Math.sin(a) * (c.r + 4))) slowedPastRim++;
  }
  check('some bearings are slowed right out at the rim', slowedAtRim > 0,
    `${slowedAtRim}/64`);
  check('and none at all past it', slowedPastRim === 0, `${slowedPastRim}/64`);

  // And it lifts when the cloud goes.
  r.run(Math.ceil(ACID_CLOUD_MS / TICK_MS) + 2);
  check('the cloud expires', r.world.acid.size === 0);
  check('and the ground is quick again',
    Math.abs(paceFor(c.x, c.y, 'human') - bareInside) < 0.01,
    `${paceFor(c.x, c.y, 'human').toFixed(1)}`);
}

// ------------------------------------------------------------ the sight line

function testSight(): void {
  console.log('\nit blocks a sight line, blinds whoever is in it, and lets the horde see');
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
  check('clear before there is any acid', hasLineOfSight(r.world, ax, y, bx, y, false, 'human'));
  const asideBefore = hasLineOfSight(r.world, ax, y - 600, bx, y - 600, false, 'human');

  /*
   * **The baseline for the sweep below, taken before there is any acid.**
   *
   * This is a real city with real buildings in it and `clearLane` only
   * guarantees the one lane. Asserting the dog sees out on all 32 bearings
   * therefore fails on the geometry rather than on the code — measured that
   * way it reported 10 of 32, every one of the missing 22 a wall. What the
   * control has to say is that the acid changed nothing for the dog, so the
   * comparison is against whatever the city allowed a moment earlier.
   */
  const bearings = 32;
  const baseline: boolean[] = [];
  for (let i = 0; i < bearings; i++) {
    const a = (i / bearings) * Math.PI * 2;
    baseline.push(
      hasLineOfSight(r.world, landing, y, landing + Math.cos(a) * 240, y + Math.sin(a) * 240,
        false, 'human'),
    );
  }
  const clearBearings = baseline.filter(Boolean).length;

  r.spit();
  // Past the travel *and* past `ACID_GROW_MS`, so this is the cloud at full
  // width rather than the 44px gobbet it is on the tick it lands.
  r.run(travelTicks + Math.ceil(ACID_GROW_MS / TICK_MS) + 1);
  const c = onlyCloud(r.world);
  check('the cloud sits between the two of them',
    Math.abs(c.x - landing) < 1 && c.r > 0 && landing - ax > c.r && bx - landing > c.r,
    `r=${Math.round(c.r)}, ${Math.round(landing - ax)}px to each`);
  check('and the line is broken', !hasLineOfSight(r.world, ax, y, bx, y, false, 'human'));

  // Trained eyes do not help. `seeThroughBushes` means foliage does not hide a
  // zombie from an officer, and training is not a defence against a chemical.
  check('an officer cannot see through it either',
    !hasLineOfSight(r.world, ax, y, bx, y, true, 'officer'));

  /*
   * **The horde sees straight through it, and this is the half that makes it an
   * ability rather than a liability.**
   *
   * The dog is a zombie with a flag on it, so one test covers both — and the
   * `eyesOf` parameter is what carries it. The line is the same line an officer
   * was just refused.
   */
  check('a zombie sees straight through it',
    hasLineOfSight(r.world, ax, y, bx, y, false, 'zombie'));

  /*
   * **Standing in it is zero vision**, which is the bush rule deliberately
   * broken. A bush you are inside does not blind you — you see out and others
   * cannot see in, and that is what makes hiding work. A cloud of acid is the
   * opposite of hiding.
   *
   * Swept over the compass rather than checked along the lane, because "zero"
   * is a claim about every direction and a single bearing would pass just as
   * well against a cloud that merely blocked the way it was measured.
   */
  let humanSees = 0;
  let dogSees = 0;
  for (let i = 0; i < bearings; i++) {
    const a = (i / bearings) * Math.PI * 2;
    const tx = c.x + Math.cos(a) * 240;
    const ty = c.y + Math.sin(a) * 240;
    if (hasLineOfSight(r.world, c.x, c.y, tx, ty, false, 'human')) humanSees++;
    if (hasLineOfSight(r.world, c.x, c.y, tx, ty, false, 'zombie')) dogSees++;
  }
  check('somebody stood in it sees nothing at all, any direction', humanSees === 0,
    `0 of ${bearings} bearings, ${clearBearings} of which the city left open`);
  /*
   * **And the control is the dog stood on the same pixel.** Without it, "the
   * human saw nothing" is satisfied just as well by a rig that staged its cloud
   * inside a building — the count would be zero because of the walls. Measured
   * against the baseline rather than against 32, because the walls are real and
   * the claim is that the *acid* changed nothing for the dog.
   */
  check('and a dog on the same pixel sees out, exactly as it did before',
    dogSees === clearBearings && clearBearings > 0,
    `${dogSees}/${clearBearings} against the human's ${humanSees}`);

  // A line that never goes near it is untouched — whatever it was before.
  check('a line well clear of it is unchanged',
    hasLineOfSight(r.world, ax, y - 600, bx, y - 600, false, 'human') === asideBefore,
    `was ${asideBefore ? 'clear' : 'blocked by the city'}`);

  // A blast is not a pair of eyes, and passes none: a grenade thrown into a
  // cloud has to go on working. This is the case that made the default "ignore
  // the acid" rather than "block on it".
  check('a blast reaches through it', hasLineOfSight(r.world, c.x, c.y, ax, y, true));

  r.run(Math.ceil(ACID_CLOUD_MS / TICK_MS) + 2);
  check('and the line comes back when it lifts',
    hasLineOfSight(r.world, ax, y, bx, y, false, 'human'));
}

// ----------------------------------------------------------------- the shape

/**
 * **A cloud is a cluster of lobes, not a disc**, and this is the number that
 * says so.
 *
 * The claim has two halves and they pull against each other: the silhouette has
 * to be plainly irregular, and nothing may reach past the bounding radius the
 * wire carries and the fog cache keys on — a lobe bulging past `r` would
 * occlude ground the client has already decided is outside the cloud.
 *
 * So it is measured as a reach per bearing. A disc answers `r` at every one of
 * them; a cluster answers the bounding radius at its bulges and well inside it
 * at the notches, and the spread between the two is how lumpy it is. The
 * covered area is reported alongside because that is the balance figure — what
 * ground the cloud actually takes away, against the disc it replaced.
 */
function testShape(): void {
  console.log('\nthe cloud is lumpy, and stays inside its own radius');
  const seeds = [7, 91, 1234, 4242, 8765, 31337];
  let worstReach = 0;
  let lumpiest = 0;
  let flattest = 1;
  let coverTotal = 0;

  for (const seed of seeds) {
    const lobes = acidLobes(seed, 0, 0, ACID_CLOUD_RADIUS);
    if (lobes.length !== ACID_LOBE_COUNT) check(`seed ${seed} has ${ACID_LOBE_COUNT} lobes`, false);
    for (const l of lobes) {
      worstReach = Math.max(worstReach, (Math.hypot(l.x, l.y) + l.r) / ACID_CLOUD_RADIUS);
    }

    // Reach per bearing, walked in from beyond the rim.
    let lo = 2;
    let hi = 0;
    for (let i = 0; i < 90; i++) {
      const a = (i / 90) * Math.PI * 2;
      for (let f = 1.02; f > 0.1; f -= 0.005) {
        const x = Math.cos(a) * ACID_CLOUD_RADIUS * f;
        const yy = Math.sin(a) * ACID_CLOUD_RADIUS * f;
        if (inAcidLobes(lobes, x, yy)) {
          lo = Math.min(lo, f);
          hi = Math.max(hi, f);
          break;
        }
      }
    }
    lumpiest = Math.max(lumpiest, hi - lo);
    flattest = Math.min(flattest, hi - lo);

    // Covered ground, sampled over the bounding disc — which is what this
    // replaced, so it is the honest denominator.
    let hits = 0;
    let inDisc = 0;
    const N = 140;
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const x = (i / (N - 1) - 0.5) * 2 * ACID_CLOUD_RADIUS;
        const yy = (j / (N - 1) - 0.5) * 2 * ACID_CLOUD_RADIUS;
        if (Math.hypot(x, yy) > ACID_CLOUD_RADIUS) continue;
        inDisc++;
        if (inAcidLobes(lobes, x, yy)) hits++;
      }
    }
    coverTotal += hits / inDisc;
  }

  const cover = coverTotal / seeds.length;
  /*
   * **And it still blocks, which is what it is for.**
   *
   * Coverage is an area figure and occlusion is not: what stops somebody seeing
   * across the road is whether *a* lobe sits on the line, not how much of the
   * disc is filled. So a family of parallel chords is swept over the whole
   * width of the cloud and each asked whether anything is in the way. A disc
   * answers yes for every chord inside `r`; a scalloped one can only lose the
   * chords that thread a notch, and those are at the very edge.
   */
  let chordsBlocked = 0;
  let chords = 0;
  const shape = acidLobes(1234, 0, 0, ACID_CLOUD_RADIUS);
  for (let o = -0.96; o <= 0.96; o += 0.04) {
    chords++;
    const yy = o * ACID_CLOUD_RADIUS;
    for (let t = -1.2; t <= 1.2; t += 0.01) {
      if (inAcidLobes(shape, t * ACID_CLOUD_RADIUS, yy)) {
        chordsBlocked++;
        break;
      }
    }
  }

  check('nothing reaches past the bounding radius', worstReach <= 1.0001,
    `worst lobe reaches ${worstReach.toFixed(3)} of r`);
  check('a line across it is still stopped at nearly every offset',
    chordsBlocked / chords > 0.9, `${chordsBlocked}/${chords} chords`);
  // A disc would answer 0 here. This is the whole of "less of a uniform circle".
  check('every seed is plainly irregular', flattest > 0.12,
    `spread ${flattest.toFixed(2)}-${lumpiest.toFixed(2)} of r between notch and bulge`);
  console.log(
    `  ..    covers ${(cover * 100).toFixed(1)}% of the disc it replaced ` +
      `(equivalent radius ${Math.round(ACID_CLOUD_RADIUS * Math.sqrt(cover))}px ` +
      `against ${ACID_CLOUD_RADIUS})`,
  );

  // Two seeds must not be the same cloud, or it is a texture rather than
  // weather. And the same seed must be the same cloud twice, which is the whole
  // reason this is derived on both sides rather than sent.
  const sig = (s: number) =>
    acidLobes(s, 0, 0, 100).map((l) => `${l.x.toFixed(1)},${l.y.toFixed(1)},${l.r.toFixed(1)}`).join('|');
  check('two seeds are two different clouds', sig(11) !== sig(12));
  check('and the same seed is the same cloud twice', sig(11) === sig(11));
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
  // **The control has to be stood on ground it can actually walk on**, and it
  // used to be dropped at a flat `landing.x + 900`. The rig now stands the dog
  // on open ground it *found*, and clears only the throw east of it — 900px
  // past the cloud is well outside that and lands inside a shop often enough to
  // matter. Measured, one run in three had the control civilian covering 0px
  // and failing, which reads as the blinding leaking onto somebody it never
  // touched rather than as a body parked in a wall.
  const spare = walkableNear(r.world, landing.x, landing.y, 700, 900);
  const clear = r.body('clear', 'human', spare.x, spare.y);

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

// ------------------------------------------------------------- the unlock

/**
 * **It is earned, and the roar cannot take it back.**
 *
 * That second half is the one worth a rig. Both abilities read a conversion
 * tally, and the roar *spends* its one — so if the gate were on the same
 * counter, a dog would turn fifteen people, open the hexagon, roar, and watch
 * it lock itself again with fifteen to go. `dogTurned` against
 * `dogConversions` is what separates them, and the control is that roaring
 * plainly does empty the roar's own badge in the same run.
 */
function testUnlock(): void {
  console.log('\nthe acid is earned');
  const r = rig(false, false);
  r.aim(r.dog.x + 200, r.dog.y);

  check('a fresh dog cannot spit at all', r.spit() === 'refused');
  let bar = dogHudFor(r.world, DOG, r.clock)!.abilities;
  check('and the hexagon says how many are left', bar[1]?.locked === DOG_SPIT_UNLOCK_AT,
    `${bar[1]?.locked}`);

  r.world.dogTurned.set(DOG, DOG_SPIT_UNLOCK_AT - 1);
  check('one short is still refused', r.spit() === 'refused');
  bar = dogHudFor(r.world, DOG, r.clock)!.abilities;
  check('and the hexagon counts down', bar[1]?.locked === 1, `${bar[1]?.locked}`);

  r.world.dogTurned.set(DOG, DOG_SPIT_UNLOCK_AT);
  bar = dogHudFor(r.world, DOG, r.clock)!.abilities;
  check('at the threshold the hexagon opens', bar[1]?.locked === 0);
  check('and the key is taken', r.spit() === 'spat');

  // The roar must not be able to shut it again.
  const r2 = rig(false, false);
  r2.aim(r2.dog.x + 200, r2.dog.y);
  r2.world.dogTurned.set(DOG, DOG_SPIT_UNLOCK_AT);
  r2.world.dogConversions.set(DOG, DOG_SPIT_UNLOCK_AT);
  check('unlocked before the roar', r2.spit() === 'spat');
  // Past the spit's own cooldown, and then roar the banked charges away.
  r2.run(Math.ceil((DOG_SPIT_COOLDOWN_MS + 200) / TICK_MS));
  check('the roar starts', startDogAbility(r2.world, DOG, 0, r2.clock) === 'roared');
  r2.run(Math.ceil((DOG_ROAR_MS + 200) / TICK_MS));
  const after = dogHudFor(r2.world, DOG, r2.clock)!.abilities;
  check('and spends its own badge', after[0]?.charges === 0, `${after[0]?.charges}`);
  check('but the acid stays unlocked', after[1]?.locked === 0, `${after[1]?.locked}`);
  check('and can still be thrown', r2.spit() === 'spat');
}

// ------------------------------------------------------------- the bounce

/**
 * **A gobbet comes off a wall rather than through it.**
 *
 * Staged against a wall the rig *finds* rather than one it assumes: the map is
 * not seeded, and a fixed spot is a corridor on some cities and open road on
 * others. The claim is two things at once and both need saying — that it does
 * not end up on the far side of the wall, and that it does not simply stop
 * dead at it, because "stopped at the wall" would satisfy a naive
 * did-it-get-through check just as well as a bounce does.
 */
function testBounce(): void {
  console.log('\nit bounces off walls');

  let staged = 0;
  let stoppedShort = 0;
  let cameBack = 0;
  let throughIt = 0;

  for (let attempt = 0; attempt < 400 && staged < 8; attempt++) {
    const r = rig();
    // A spot with open ground behind the dog and a wall in front of it, well
    // inside the throw. `isBlocked` carries walls and intact glass, which is
    // exactly the set `bouncesOff` reads.
    let spot: { x: number; y: number; wall: number } | null = null;
    for (let i = 0; i < 3000 && !spot; i++) {
      const x = 100 + Math.random() * (r.world.map.width - 200);
      const y = 100 + Math.random() * (r.world.map.height - 200);
      if (r.world.nav.isBlocked(x, y) || !r.world.nav.isReachable(x, y)) continue;
      // Walk east and find the first wall inside the throw.
      /**
       * **The wall has to be in the first half of the throw**, and that band is
       * not fussiness — it is the difference between measuring the code and
       * measuring the city.
       *
       * A gobbet that hits a wall keeps whatever is left of its 420ms, at
       * `GRENADE_BOUNCE` of its speed. Hit one at 120px of a 380px throw and
       * 68% of the flight remains, which carries it ~142px back — plainly a
       * rebound. Hit one at 340px and 10% remains, which is ~21px: a real
       * bounce that is indistinguishable from stopping dead. So an unbanded
       * rig asks "where did this city put its walls", and `cameBack >
       * stoppedShort` came out a coin toss — measured, it failed 1 run in 8.
       */
      let wall = -1;
      for (let d = 40; d < DOG_SPIT_RANGE - 40; d += 6) {
        if (r.world.nav.isBlocked(x + d, y)) { wall = d; break; }
      }
      if (wall < 120 || wall > DOG_SPIT_RANGE * 0.55) continue;
      spot = { x, y, wall };
    }
    if (!spot) continue;

    staged++;
    r.dog.x = spot.x;
    r.dog.y = spot.y;
    // Aimed at the far side of the wall: without a bounce the gobbet would
    // land inside it or beyond it.
    r.aim(spot.x + DOG_SPIT_RANGE, spot.y);
    r.spit();
    r.run(travelTicks + 2);
    const c = onlyCloud(r.world);
    if (!c) continue;
    const along = c.x - spot.x;
    if (along > spot.wall) throughIt++;
    // Came back toward the dog past where it hit, which only a bounce does.
    else if (along < spot.wall - 60) cameBack++;
    else stoppedShort++;
  }

  check('a wall to throw at was found', staged >= 6, `${staged} cities staged`);
  check('nothing lands past the wall', throughIt === 0, `${throughIt} of ${staged}`);
  // Every one of them, now the wall is staged where a bounce has flight left to
  // spend. "Most of them" was the coin toss the band above replaced.
  check('and every one rebounds rather than sticking to it', stoppedShort === 0,
    `${cameBack} came back, ${stoppedShort} stopped at it`);

  // An unobstructed throw is untouched by any of it: the last step is charged
  // only for what is left of the flight, so it still lands on the crosshair
  // rather than a tick's travel past it.
  const clear = rig();
  clear.aim(clear.dog.x + 200, clear.dog.y);
  clear.spit();
  clear.run(travelTicks + 2);
  const c = onlyCloud(clear.world);
  const off = c ? Math.hypot(c.x - (clear.dog.x + 200), c.y - clear.dog.y) : 999;
  check('a clear throw still lands on the crosshair', off < 1, `${off.toFixed(2)}px off`);
}

// -------------------------------------------------- dying is not a shortcut

/**
 * **The cooldown survives being killed.**
 *
 * At 22 seconds against a death and a birth of under four, the cheapest way to
 * have the acid back was otherwise to go and get shot. It lived on `DogState`,
 * which `finishDogBirth` *deletes* — right for the neck, the jaws and a bite in
 * progress, all of which belong to the body that died, and wrong for a
 * cooldown. `World.dogCooldowns` is where it lives now.
 *
 * The strong form of the check is not "it is still refused" — that would pass
 * for a cooldown that had been reset and merely restarted. It is that the
 * **time remaining matches the clock**: whatever elapsed while the animal was
 * dead has to have come off it.
 */
function testDeathCooldown(): void {
  console.log('\ndying does not refresh a cooldown');
  const r = rig();
  // Something to rise back out of. Without a shambler on the map the dog is
  // simply out of the round, and the check would never reach a second life.
  r.body('host', 'zombie', r.dog.x + 260, r.dog.y + 120);

  r.aim(r.dog.x + 200, r.dog.y);
  check('spat once', r.spit() === 'spat');
  const spatAt = r.clock;
  check('and refused straight away', r.spit() === 'refused');

  killEntity(r.world, r.dog, r.clock);
  check('killed: down, and no birth yet',
    r.world.dogDeaths.has(DOG) && !r.world.dogBirths.has(DOG));

  // All the way through dying and being born again.
  const deathTicks = Math.ceil(DOG_DEATH_MS / TICK_MS) + 1;
  const birthTicks = Math.ceil(DOG_BIRTH_MS / TICK_MS) + 2;
  r.run(deathTicks + birthTicks);
  const alive = r.world.entities.get(DOG);
  check('it is back on its feet', alive !== undefined && !r.world.dogsOut.has(DOG));
  check('and its bite state was rebuilt from scratch',
    r.world.dogState.get(DOG) === undefined || r.world.dogState.get(DOG)!.victimId === null);

  // The claim. Elapsed is real wall time on the rig's own clock.
  const gone = r.clock - spatAt;
  const bar = dogHudFor(r.world, DOG, r.clock)!.abilities;
  const left = (1 - (bar[1]?.ready ?? 1)) * DOG_SPIT_COOLDOWN_MS;
  const want = DOG_SPIT_COOLDOWN_MS - gone;
  check('still refused after coming back', r.spit() === 'refused');
  check('and the bar has counted the time it spent dead',
    Math.abs(left - want) < 120,
    `${Math.round(left)}ms left, ${Math.round(want)}ms expected after ${Math.round(gone)}ms dead`);

  // And it does still come good — a cooldown that never expired would pass
  // every check above just as well.
  r.run(Math.ceil((DOG_SPIT_COOLDOWN_MS - gone + 200) / TICK_MS));
  check('and comes good on its own clock', r.spit() === 'spat');
}

// ------------------------------------------------------- bots and the cloud

/**
 * **A blue officer gets out of the acid, and stays out of it.**
 *
 * **The control is the old behaviour, not a bot with no acid on it**, and that
 * distinction cost a measurement to find. "It left the cloud" is satisfied just
 * as well by a bot that was walking somewhere anyway: measured against a bot
 * dropped on the same pixel of the same city with nothing on it, clearing the
 * same 190px took **1.2-1.7s either way**, because a patrolling officer covers
 * that in about a second and a half regardless. `setBotIgnoresAcid` runs both
 * behaviours over the same staged cloud, which is the only comparison that says
 * anything.
 *
 * A civilian on the same pixel is the second control: they are slowed by the
 * stuff and blinded by the splash and have no rule about either, so they should
 * still be standing in it when the bot has gone.
 */
function testBots(): void {
  console.log('\na bot officer gets out of the acid');

  let gotOut = 0;
  let stayed = 0;
  let runs = 0;
  let oldGotOut = 0;
  const botReach: number[] = [];
  const civReach: number[] = [];
  const control: number[] = [];

  for (let attempt = 0; attempt < 60 && runs < 8; attempt++) {
    setBotIgnoresAcid(false);
    const r = rig(true);
    const landing = { x: r.dog.x + 200, y: r.dog.y };

    // **The cloud is laid first and the bodies dropped into it**, rather than
    // staged at the crosshair and thrown at. A bot officer walks — patrolling
    // at ~115px/s it covers 50px during the gobbet's 420ms flight, which is
    // outside the cloud's 39px starting radius — so aiming at where it *was*
    // caught it on 1 attempt in 200, and the run measured the staging rather
    // than the code. The question here is what a bot does once it is in the
    // stuff, so putting it in is the honest staging.
    r.aim(landing.x, landing.y);
    if (r.spit() !== 'spat') continue;
    r.run(travelTicks);
    const c = onlyCloud(r.world);
    if (!c) continue;
    // Grown to full width first, so the bot is genuinely inside rather than
    // inside the seed of one.
    r.run(Math.ceil(ACID_GROW_MS / TICK_MS) + 1);
    const grown = onlyCloud(r.world);
    if (!grown) continue;

    // Both bodies on the same pixel — the middle of the cloud — so the only
    // difference between them is which rules they run.
    const bot = r.body('bot', 'officer', grown.x, grown.y);
    r.world.bots.add('bot');
    r.world.inventories.set('bot', newInventory());
    r.world.stamina.set('bot', 100);
    const civ = r.body('civ', 'human', grown.x + 14, grown.y);
    if (!inAcidLobes(grown.lobes, bot.x, bot.y)) continue;
    runs++;

    // Three seconds. The cloud lasts far longer, so this is "did it leave
    // promptly", not "did it leave eventually".
    //
    // **Measured as how long it takes to be clear of the spot**, not as how far
    // it ends up from it. Net displacement is the wrong figure for the control
    // below: a bot patrolling with nothing on its mind walks a *long* way in
    // three seconds, further than one that bolts 130px out of a cloud and then
    // goes back to patrolling — so distance would say the acid slowed it down.
    // Time to clear the ground the cloud is standing on is the claim.
    const clearOf = ACID_CLOUD_RADIUS + BOT_ACID_CLEAR;
    let out = -1;
    let awayAt = -1;
    for (let t = 0; t < 90; t++) {
      r.run(1);
      const cloud = onlyCloud(r.world);
      if (out < 0 && cloud && !inAcidLobes(cloud.lobes, bot.x, bot.y)) out = t;
      if (awayAt < 0 && Math.hypot(bot.x - grown.x, bot.y - grown.y) > clearOf) awayAt = t;
    }
    if (out >= 0) gotOut++;
    else stayed++;
    botReach.push(awayAt < 0 ? 90 : awayAt);
    civReach.push(Math.hypot(civ.x - grown.x, civ.y - grown.y));

    // The control: **the old behaviour**, over its own staged cloud. A bot with
    // no acid on it at all is not a control — it walks off just as promptly,
    // for reasons that have nothing to do with this.
    setBotIgnoresAcid(true);
    const q = rig(true);
    q.aim(q.dog.x + 200, q.dog.y);
    if (q.spit() === 'spat') {
      q.run(travelTicks + Math.ceil(ACID_GROW_MS / TICK_MS) + 1);
      const old = onlyCloud(q.world);
      if (old) {
        const idle = q.body('bot', 'officer', old.x, old.y);
        q.world.bots.add('bot');
        q.world.inventories.set('bot', newInventory());
        q.world.stamina.set('bot', 100);
        let idleAt = -1;
        let stillIn = true;
        for (let t = 0; t < 90; t++) {
          q.run(1);
          const cloud = onlyCloud(q.world);
          if (cloud && !inAcidLobes(cloud.lobes, idle.x, idle.y)) stillIn = false;
          if (idleAt < 0 && Math.hypot(idle.x - old.x, idle.y - old.y) > clearOf) idleAt = t;
        }
        if (!stillIn) oldGotOut++;
        control.push(idleAt < 0 ? 90 : idleAt);
      }
    }
    setBotIgnoresAcid(false);
  }

  const med = (xs: number[]) =>
    xs.length ? xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)] : 0;

  const secs = (t: number) => (t / TICK_RATE).toFixed(2) + 's';
  check('a bot was caught in one', runs >= 5, `${runs} runs staged`);
  check('and it got clear inside three seconds', stayed === 0, `${gotOut} out, ${stayed} still in it`);
  check('well clear of the ground the cloud is on', med(botReach) < 60,
    `${secs(med(botReach))} to get ${ACID_CLOUD_RADIUS + BOT_ACID_CLEAR}px off it`);
  check('sooner than the old behaviour on its own cloud', med(botReach) < med(control),
    `${secs(med(botReach))} against ${secs(med(control))}`);
  // Reported rather than asserted. "Did it ever leave" does not discriminate:
  // a bot with no rule about clouds still patrols, and often enough it strolls
  // out of one inside three seconds all eight times. **Time to clear is the
  // figure that separates them**, and it is the check above.
  console.log(
    `  ..    the old behaviour left it at all on ${oldGotOut} of ${control.length}, ` +
      `against ${gotOut} of ${runs}`,
  );
  check('and a civilian on the same pixel is still there', med(civReach) < 60,
    `the civilian moved ${Math.round(med(civReach))}px`);
}

console.log('=== the dog spits, and the street stops being one street ===');
testUnlock();
testBounce();
testDeathCooldown();
testBots();
testThrow();
testSlow();
testShape();
testSight();
testSplash();
testLine();
testHud();
testRefusals();
console.log(`\n${failures === 0 ? 'all checks passed' : `${failures} FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
