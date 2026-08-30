/**
 * Headless check on what a zombie does about being shot. No socket, no port,
 * so it leaves a game on 8080 alone.
 *
 * Both behaviours run in ONE process, alternating run by run, and
 * `setZombieForgetsTheShooter` is the gate — the control is the whole value of
 * this: "it walked to the shooter" means nothing without "and it did not
 * before".
 *
 * Two staged rigs, one per report: a zombie shot with something nearer and
 * plainly visible to be distracted by, and a shooter standing in a bush.
 *
 *   npx tsx provoke.ts
 *   RUNS=12 npx tsx provoke.ts
 *
 * Not typechecked by `npx tsc --noEmit` in `server/`. Check it explicitly:
 *   npx tsc --noEmit --target ES2022 --module ESNext --moduleResolution Bundler \
 *     --strict --skipLibCheck --types node provoke.ts
 *
 * Four things about staging this were the rig lying rather than the code
 * failing, and every one of them made the two modes look alike:
 *
 * - **`fire` reads `world.entityGrid`, and staging entities does not fill it.**
 *   Bodies added since the last `rebuildEntityGrid` are not in it, so the
 *   hitscan found nothing and no round ever landed on anybody. What still ran
 *   was `alertZombies` — which fires on the *shot* rather than on the hit — so
 *   the zombie walked toward the noise and the rig scored that as the grudge
 *   working. Both modes read ~60% committed and neither had executed a line of
 *   the code under test.
 * - **The clock starts at `Date.now()`.** `resetWorld` stamps every fresh
 *   AiState with it, so a rig with a clock of its own leaves `nextSenseAt`
 *   decades out and nothing ever perceives anything. See `botkite.ts`.
 * - **One round, not a burst.** The old behaviour re-rolled and re-paused on
 *   every round that landed, so firing once a second bought 6.4s of an 8s run
 *   and the old code scored 80% committed. What was reported is one shot and
 *   the seconds after it.
 * - **The decoy has to sit in the band the rule is about.** Staged at 150px it
 *   was exactly on `ZOMBIE_LUNGE_RANGE`, the one distance a committed zombie is
 *   deliberately still allowed to turn for, so the rig measured the carve-out
 *   and the new behaviour scored *worse* than the old.
 */
import {
  createWorld,
  resetWorld,
  rebuildNav,
  rebuildEntityGrid,
  resolveCollisions,
  buildStaticGrids,
  makeEntity,
  newAiState,
  type World,
  type Entity,
} from './src/world.js';
import { computeFrozen, updateAi } from './src/ai.js';
import { fire, setZombieAlwaysTakesTheBait, setZombieForgetsTheShooter } from './src/combat.js';
import { ITEMS } from '../shared/items.js';
import {
  TICK_RATE,
  PATH_NODE_BUDGET_PER_TICK,
  ZOMBIE_SIGHT_RADIUS,
  ZOMBIE_LUNGE_RANGE,
  ENTITY_RADIUS,
} from '../shared/constants.js';

const TICK_MS = 1000 / TICK_RATE;
const RUNS = Number(process.env.RUNS ?? 12);
/** 8 seconds — twice what it takes to walk the staged distance. */
const TICKS = Number(process.env.TICKS ?? 240);
/** How far the shooter stands off. Inside sight, so neither mode is blind. */
const SHOT_GAP = 380;
/** Runs for the choice half — it is a coin toss, so a handful says nothing. */
const CHOICE_RUNS = Number(process.env.CHOICE_RUNS ?? 120);
/**
 * Where the decoy stands: half way to the shooter, and this far off to one side.
 *
 * **It has to stay a temptation for the whole walk, and beside the zombie it
 * does not.** Staged 260px off the zombie on the far side it started well
 * inside sight and fell out of it as the zombie advanced — 160px of walking
 * puts it at 420px, which is the sight radius exactly — so the old behaviour
 * was never offered the choice it is supposed to fail, and both modes read
 * 100%/0%. Beside the route it stays 200-280px off the whole way in.
 *
 * That distance is the band the rule is about: outside `ZOMBIE_LUNGE_RANGE`
 * (150), the one range a committed zombie is still allowed to turn for, and
 * well inside `ZOMBIE_SIGHT_RADIUS` (420).
 */
const DECOY_SIDE = 200;
/** Close enough to count as having got there. */
const ARRIVED = ENTITY_RADIUS.officer + ENTITY_RADIUS.zombie + 40;

const f1 = (n: number): string => n.toFixed(1);
function med(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = xs.slice().sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}
const share = (a: number, b: number): string => `${((100 * a) / Math.max(1, b)).toFixed(0)}%`;

function tick(world: World, now: number, dt: number): void {
  world.pathBudget = PATH_NODE_BUDGET_PER_TICK;
  if (world.navDirty) rebuildNav(world);
  rebuildEntityGrid(world);
  updateAi(world, now, dt, computeFrozen(world));
  resolveCollisions(world);
}

/**
 * A city with nothing alive in it, so the only bodies are the staged ones.
 *
 * A live city is the wrong place to look for this. The signal is one zombie's
 * intent over a few seconds, and a real street supplies a dozen other reasons
 * for it to change — the same reason `crowdcheck.ts` is staged.
 */
function emptyCity(): World {
  const world = createWorld();
  resetWorld(world);
  for (const id of [...world.entities.keys()]) {
    world.entities.delete(id);
    world.ai.delete(id);
  }
  world.pickups.clear();
  return world;
}

/** Open ground with room for the whole staging, clear of geometry. */
function openSpot(world: World, radius: number): { x: number; y: number } | null {
  for (let i = 0; i < 8000; i++) {
    const x = radius + 160 + Math.random() * (world.map.width - 2 * (radius + 160));
    const y = radius + 160 + Math.random() * (world.map.height - 2 * (radius + 160));
    let clear = true;
    for (let a = 0; a < 16 && clear; a++) {
      const t = (a / 16) * Math.PI * 2;
      for (let r = 0; r <= radius; r += 20) {
        if (world.nav.isBlocked(x + Math.cos(t) * r, y + Math.sin(t) * r)) {
          clear = false;
          break;
        }
      }
    }
    if (clear) return { x, y };
  }
  return null;
}

/**
 * Hold the staging still, every tick.
 *
 * The shooter is made ungrabbable as well as immovable. Left mortal it is taken
 * hold of the moment the zombie arrives, and a grapple that turns it changes its
 * entity type — at which point the zombie has no target, walks off to the decoy,
 * and "how close was it at the end" reads 120px against 331px, which looks
 * exactly like the grudge failing.
 */
function pin(world: World, e: Entity, x: number, y: number, now: number): void {
  e.x = x;
  e.y = y;
  e.health = e.maxHealth;
  world.grappleImmune.set(e.id, now + 60_000);
}

interface Grudge {
  /** Did the round actually land? Without this the rest is a rig reporting itself. */
  hit: boolean;
  /** Ticks the zombie spent heading at the shooter rather than the decoy. */
  atShooter: number;
  atDecoy: number;
  /** How many times its intent flipped between the two. */
  flips: number;
  /** Closest it ever got to the shooter, and whether that counts as arriving. */
  closest: number;
  arrived: boolean;
}

/**
 * A zombie, the officer who shoots it, and a decoy civilian standing in plain
 * sight much nearer than the shooter.
 *
 * The decoy is the whole rig. Without something else for the zombie to want,
 * "it went to the shooter" is satisfied by a zombie that had nowhere else to
 * go, and the reported fault is precisely that a nearer, visible body wins.
 */
function grudgeRun(): Grudge | null {
  const world = emptyCity();
  const spot = openSpot(world, SHOT_GAP + 120);
  if (!spot) return null;
  const now0 = Date.now();

  const shooter = makeEntity('shooter', 'officer', spot.x - SHOT_GAP, spot.y);
  world.entities.set('shooter', shooter);
  const z = makeEntity('z', 'zombie', spot.x, spot.y);
  world.entities.set('z', z);
  world.ai.set('z', newAiState(now0, z.x, z.y));
  const decoyX = spot.x - SHOT_GAP / 2;
  const decoyY = spot.y + DECOY_SIDE;
  const decoy = makeEntity('decoy', 'human', decoyX, decoyY);
  world.entities.set('decoy', decoy);
  world.ai.set('decoy', newAiState(now0, decoy.x, decoy.y));
  // Without this the hitscan queries a grid these three are not in.
  rebuildEntityGrid(world);

  const out: Grudge = {
    hit: false,
    atShooter: 0,
    atDecoy: 0,
    flips: 0,
    closest: Infinity,
    arrived: false,
  };
  let now = now0;
  let last = '';

  for (let i = 0; i < TICKS; i++) {
    pin(world, shooter, spot.x - SHOT_GAP, spot.y, now);
    pin(world, decoy, decoyX, decoyY, now);

    if (i === 0) {
      const before = z.health;
      fire(world, shooter, Math.atan2(z.y - shooter.y, z.x - shooter.x), 0, now, ITEMS.pistol);
      out.hit = z.health < before;
      z.health = z.maxHealth;
    }

    now += TICK_MS;
    tick(world, now, TICK_MS / 1000);

    const gap = Math.hypot(shooter.x - z.x, shooter.y - z.y);
    if (gap < out.closest) out.closest = gap;
    if (gap <= ARRIVED) out.arrived = true;
    // Once it is standing on the shooter the question is answered; anything
    // after that is the rig's staging rather than the zombie's mind.
    if (out.arrived) break;

    // Which way is it actually going? Intent, not position.
    const st = world.ai.get('z');
    const going = st?.targetId === 'decoy' ? 'decoy' : st?.targetId === 'shooter' ? 'shooter' : '';
    // With no target it is walking to a remembered spot, and whichever body
    // that spot is nearer to is who it is going to.
    const spotFor =
      st?.lastSeenX != null && st.lastSeenY != null
        ? Math.hypot(st.lastSeenX - shooter.x, st.lastSeenY - shooter.y) <
          Math.hypot(st.lastSeenX - decoy.x, st.lastSeenY - decoy.y)
          ? 'shooter'
          : 'decoy'
        : '';
    const intent = going || spotFor;
    if (intent === 'shooter') out.atShooter++;
    else if (intent === 'decoy') out.atDecoy++;
    if (intent && last && intent !== last) out.flips++;
    if (intent) last = intent;
  }
  return out;
}

interface Bush {
  hit: boolean;
  /** Did it get to where the shot came from? */
  arrived: boolean;
  /** …and then find the shooter standing in the foliage? */
  found: boolean;
  closest: number;
}

/**
 * The shooter inside a bush, and one round fired out of it.
 *
 * The thicket is added to the map rather than looked for on it: a rig that
 * hunts for a bush big enough to hide in is a rig that reports the seed.
 */
function bushRun(): Bush | null {
  const world = emptyCity();
  const spot = openSpot(world, SHOT_GAP + 160);
  if (!spot) return null;
  const now0 = Date.now();

  const sx = spot.x - SHOT_GAP;
  const sy = spot.y;
  const shooter = makeEntity('shooter', 'officer', sx, sy);
  world.entities.set('shooter', shooter);

  // `mapgen` rolls each bush 18-34px, so 26 is the middle of what a real one
  // is, and seven of them is a clump you could hide in.
  const BUSH_R = 26;
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const r = i === 0 ? 0 : BUSH_R * 0.7;
    world.map.bushes.push({ x: sx + Math.cos(a) * r, y: sy + Math.sin(a) * r, r: BUSH_R });
  }
  // **`world.bushGrid` is what `hasLineOfSight` reads, not `map.bushes`.**
  // Pushing foliage onto the map and not rebuilding the broadphase leaves it
  // invisible to every sight test in the game: the zombie saw the shooter
  // straight through the thicket at 380px and targeted him on tick one, so the
  // rig reported 7/7 "found the shooter" in *both* modes and had staged no bush
  // at all.
  buildStaticGrids(world);
  world.navDirty = true;

  const z = makeEntity('z', 'zombie', spot.x, spot.y);
  world.entities.set('z', z);
  world.ai.set('z', newAiState(now0, z.x, z.y));
  rebuildEntityGrid(world);

  const out: Bush = { hit: false, arrived: false, found: false, closest: Infinity };
  let now = now0;
  for (let i = 0; i < TICKS; i++) {
    pin(world, shooter, sx, sy, now);
    if (i === 0) {
      const before = z.health;
      fire(world, shooter, Math.atan2(z.y - shooter.y, z.x - shooter.x), 0, now, ITEMS.pistol);
      out.hit = z.health < before;
      z.health = z.maxHealth;
    }
    now += TICK_MS;
    tick(world, now, TICK_MS / 1000);

    const gap = Math.hypot(shooter.x - z.x, shooter.y - z.y);
    if (gap < out.closest) out.closest = gap;
    if (gap <= ARRIVED) out.arrived = true;
    if (world.ai.get('z')?.targetId === 'shooter') out.found = true;
    if (out.found) break;
  }
  return out;
}

// ------------------------------------------------------------------- run

console.log(`provoke: ${RUNS} runs each way, up to ${TICKS} ticks apiece`);
console.log(
  `  shooter ${SHOT_GAP}px out, decoy ${DECOY_SIDE}px off the route, sight ${ZOMBIE_SIGHT_RADIUS}, lunge ${ZOMBIE_LUNGE_RANGE}\n`,
);

for (const old of [true, false]) {
  setZombieForgetsTheShooter(old);
  const label = old ? 'OLD (a coin toss and a pause)' : 'NEW (a grudge)';

  const grudges: Grudge[] = [];
  const bushes: Bush[] = [];
  for (let r = 0; r < RUNS; r++) {
    const g = grudgeRun();
    if (g?.hit) grudges.push(g);
    const b = bushRun();
    if (b?.hit) bushes.push(b);
  }

  const shooterTicks = grudges.reduce((a, g) => a + g.atShooter, 0);
  const decoyTicks = grudges.reduce((a, g) => a + g.atDecoy, 0);
  const both = shooterTicks + decoyTicks;

  console.log(`--- ${label}`);
  console.log(`  rounds that landed       ${grudges.length} and ${bushes.length} of ${RUNS} each`);
  console.log(`  intent on the shooter    ${shooterTicks}/${both} ticks (${share(shooterTicks, both)})`);
  console.log(`  intent on the decoy      ${decoyTicks}/${both} ticks (${share(decoyTicks, both)})`);
  console.log(`  flips between the two    median ${med(grudges.map((g) => g.flips))} per run`);
  console.log(`  reached the shooter      ${grudges.filter((g) => g.arrived).length}/${grudges.length}`);
  console.log(`  closest approach         median ${f1(med(grudges.map((g) => g.closest)))}px of ${SHOT_GAP}`);
  console.log(`  bush: reached the spot   ${bushes.filter((b) => b.arrived).length}/${bushes.length}`);
  console.log(`  bush: found the shooter  ${bushes.filter((b) => b.found).length}/${bushes.length}`);
  console.log(`  bush: closest approach   median ${f1(med(bushes.map((b) => b.closest)))}px\n`);
}

setZombieForgetsTheShooter(false);

// ------------------------------------------------- and it decides just once
/*
 * **A zombie already chasing somebody is the case the grudge did not cover.**
 *
 * Reported as *"it twitches in my direction but then immediately goes back to
 * chasing the civilian"*. The grudge turned it on every shot, and the
 * pouncing-distance carve-out — the thing that stops a provoked zombie walking
 * *through* a body at arm's length — handed its prey straight back, because a
 * zombie chasing somebody is by definition at arm's length from them. Turn,
 * pulled back, turn.
 *
 * Staged differently from the run above on purpose: there the decoy stands well
 * off the route and the question is whether the zombie is tempted away. Here
 * the zombie is **already chasing the prey and right on top of it**, which is
 * the only geometry the report is about.
 */
interface Choice {
  hit: boolean;
  /** Took the bait: ended up facing the shooter rather than the prey. */
  took: boolean;
  /**
   * Times it turned toward the shooter and turned back to the prey.
   *
   * **Read off the body's own heading, not off `targetId`.** The twitch is a
   * single tick in the target — `hit` clears it and the next perception tick
   * hands the prey straight back — so a rig sampling `targetId` between ticks
   * never sees it at all and scored the *old* behaviour 0 twitches out of 7.
   * What is actually on screen is the body: `hit` snapped it a hundred and
   * eighty degrees toward the shot and the chase swung it back over the next
   * few ticks. That is the report, and it is what this counts.
   */
  twitches: number;
  /** Ticks facing the prey, and facing the shooter, after the shot. */
  onPrey: number;
  onShooter: number;
}

/** How near the prey the zombie is staged — inside `ZOMBIE_LUNGE_RANGE`. */
const CHASE_GAP = Math.round(ZOMBIE_LUNGE_RANGE * 0.7);

/**
 * Ground with a clear lane along it, rather than a clear disc around it.
 *
 * All three bodies are pinned on one line, so a disc of `SHOT_GAP + 160` is
 * asking for far more room than the run uses — and most cities do not have one.
 * It staged **6 runs in 40** that way, which for a coin toss is not a sample.
 */
function openLane(world: World, back: number, forward: number): { x: number; y: number } | null {
  for (let i = 0; i < 6000; i++) {
    const x = 400 + Math.random() * (world.map.width - 800);
    const y = 400 + Math.random() * (world.map.height - 800);
    let clear = true;
    for (let d = -back; d <= forward && clear; d += 14) {
      for (const off of [-24, 0, 24]) {
        if (world.nav.isBlocked(x + d, y + off)) {
          clear = false;
          break;
        }
      }
    }
    if (clear) return { x, y };
  }
  return null;
}

function choiceRun(): Choice | null {
  const world = emptyCity();
  const spot = openLane(world, SHOT_GAP + 50, CHASE_GAP + 50);
  if (!spot) return null;
  const now0 = Date.now();

  const shooter = makeEntity('shooter', 'officer', spot.x - SHOT_GAP, spot.y);
  world.entities.set('shooter', shooter);
  const z = makeEntity('z', 'zombie', spot.x, spot.y);
  world.entities.set('z', z);
  world.ai.set('z', newAiState(now0, z.x, z.y));
  // Directly away from the shooter, so "went for the prey" and "went for the
  // shooter" are opposite headings and cannot be confused.
  const prey = makeEntity('prey', 'human', spot.x + CHASE_GAP, spot.y);
  world.entities.set('prey', prey);
  world.ai.set('prey', newAiState(now0, prey.x, prey.y));
  rebuildEntityGrid(world);

  const out: Choice = { hit: false, took: false, twitches: 0, onPrey: 0, onShooter: 0 };
  const st = world.ai.get('z')!;
  let now = now0;
  let shotAt = -1;
  let last: string | null = null;
  let leftPrey = false;

  for (let i = 0; i < TICKS; i++) {
    pin(world, shooter, spot.x - SHOT_GAP, spot.y, now);
    pin(world, prey, spot.x + CHASE_GAP, spot.y, now);
    pin(world, z, spot.x, spot.y, now);
    tick(world, now, TICK_MS / 1000);
    now += TICK_MS;

    /*
     * **Fire once it has actually settled onto the prey**, not at a fixed tick.
     * Perception runs at 10Hz staggered per entity, so a fixed tick catches it
     * before it has looked — the rig fired on 7 runs of 40 and reported the
     * other 33 as nothing rather than as unstaged.
     *
     * One round, because a burst is the thing the grudge already fixed and this
     * is about a single shot.
     */
    if (shotAt < 0) {
      if (i > 20 && st.targetId === 'prey') {
        fire(world, shooter, 0, 0, now, ITEMS.boltRifle);
        // `provokedBy` is the honest "the round landed" signal: it is set on
        // every path, whichever way the zombie then decides.
        out.hit = st.provokedBy === 'shooter';
        shotAt = i;
        last = 'prey';
      }
      continue;
    }
    if (!out.hit) break;

    // Which way the body is actually pointing — toward the prey, or back at the
    // shooter. They are opposite by construction, so this cannot be ambiguous.
    const toPrey = Math.abs(wrapPi(z.facing - 0));
    const toShooter = Math.abs(wrapPi(z.facing - Math.PI));
    const facing = toPrey < 0.6 ? 'prey' : toShooter < 0.6 ? 'shooter' : null;
    if (facing === 'prey') out.onPrey++;
    if (facing === 'shooter') out.onShooter++;
    if (facing !== null && facing !== last) {
      if (facing === 'prey' && leftPrey) out.twitches++;
      if (facing === 'shooter') leftPrey = true;
      last = facing;
    }
  }
  out.took = out.onShooter > out.onPrey;
  return out;
}

/** Into -PI..PI. */
function wrapPi(a: number): number {
  let d = a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

console.log('--- a zombie already chasing somebody, shot once');
console.log(
  `  prey ${CHASE_GAP}px from the zombie (lunge range ${ZOMBIE_LUNGE_RANGE}), shooter ${SHOT_GAP}px the other way\n`,
);

for (const old of [true, false]) {
  setZombieAlwaysTakesTheBait(old);
  const label = old ? 'OLD (always turns)' : 'NEW (decides once)';
  const runs: Choice[] = [];
  let staged = 0;
  for (let r = 0; r < CHOICE_RUNS; r++) {
    const c = choiceRun();
    if (c === null) continue;
    staged++;
    if (c.hit) runs.push(c);
  }
  const twitchy = runs.filter((c) => c.twitches > 0).length;
  const took = runs.filter((c) => c.took).length;
  console.log(`  ${label}`);
  console.log(`    staged / landed        ${staged}/${CHOICE_RUNS} cities, ${runs.length} rounds landed`);
  console.log(`    turned and turned back ${twitchy}/${runs.length} runs, median ${med(runs.map((c) => c.twitches))} times`);
  console.log(`    came for the shooter   ${took}/${runs.length}`);
  console.log(`    ticks on the prey      ${runs.reduce((a, c) => a + c.onPrey, 0)}`);
  console.log(`    ticks on the shooter   ${runs.reduce((a, c) => a + c.onShooter, 0)}\n`);
}
setZombieAlwaysTakesTheBait(false);
