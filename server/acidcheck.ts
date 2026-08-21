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
testShape();
testSight();
testSplash();
testLine();
testHud();
testRefusals();
console.log(`\n${failures === 0 ? 'all checks passed' : `${failures} FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
