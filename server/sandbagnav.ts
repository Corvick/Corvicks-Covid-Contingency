/**
 * Headless check on walking round a sandbag wall. No socket, no port, so it
 * leaves a game on 8080 alone.
 *
 * Two claims, and the second is as important as the first:
 *
 *  1. **Anything alive routes round a wall of sandbags.** Reported as a
 *     civilian bumping into a lone one instead of stepping round it, and a grey
 *     officer sent to the far side of a barricade pressing into it for the rest
 *     of the round. `setSandbagsIgnoredByRoutes` puts the old rule back and is
 *     the control — "it got past" means nothing without "and it did not
 *     before".
 *  2. **A zombie still does not.** Clawing a wall down rather than strolling
 *     round the end is the entire point of building one, so the run has to show
 *     the horde's behaviour is byte-for-byte what it was. That is a claim about
 *     something *not* changing, which is the easiest kind to break silently.
 *
 * Both modes run in ONE process on the same city with the same wall — two
 * `npx tsx` invocations on this box are not comparable and the map is not
 * seeded either.
 *
 * **The clock has to start where the world's does.** `resetWorld` takes no
 * `now` and stamps every fresh AiState with `Date.now()`, so a harness starting
 * its own clock at 10000 leaves `nextSenseAt` decades away and nothing ever
 * perceives anything — which reads as a body standing about doing nothing, and
 * is indistinguishable from the bug under test.
 *
 *   npx tsx sandbagnav.ts
 *   RUNS=8 npx tsx sandbagnav.ts
 *
 * Not typechecked by `npx tsc --noEmit` in `server/` — that only includes
 * `src/**`. Check it explicitly:
 *   npx tsc --noEmit --target ES2022 --module ESNext --moduleResolution Bundler \
 *     --strict --skipLibCheck --types node sandbagnav.ts
 */
import {
  createWorld,
  resetWorld,
  rebuildNav,
  rebuildEntityGrid,
  resolveCollisions,
  hasWallClearPath,
  makeEntity,
  newAiState,
  type World,
  type Entity,
} from './src/world.js';
import { computeFrozen, updateAi, rallyHumans, setSandbagsIgnoredByRoutes } from './src/ai.js';
import { placeBarricade, resolveEmplacementCollisions, deployEmplacement } from './src/emplacement.js';
import { closestOnBox, segmentHitsBox } from './src/geometry.js';
import {
  TICK_RATE,
  PATH_NODE_BUDGET_PER_TICK,
  BARRICADE_HALF_WIDTH,
  BARRICADE_HALF_DEPTH,
  BARRICADE_HEALTH,
  COMMAND_ARRIVE_DIST,
  RALLY_ARRIVE_DIST,
  SANDBAG_REACH,
  ENTITY_RADIUS,
  ZOMBIE_RADIUS,
} from '../shared/constants.js';

const TICK_MS = 1000 / TICK_RATE;
const RUNS = Number(process.env.RUNS ?? 6);
/** 20s — a walk of a few hundred pixels with a detour in it, and then some. */
const TICKS = Number(process.env.TICKS ?? 600);
/** How far apart the two ends of the lane are, with the wall halfway. */
const LANE = 340;

const f1 = (n: number): string => n.toFixed(1);
function med(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = xs.slice().sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

let checks = 0;
let failures = 0;
function check(ok: boolean, label: string, detail = ''): void {
  checks++;
  if (!ok) failures++;
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail ? '  - ' + detail : ''}`);
}

function tick(world: World, now: number, dt: number): void {
  world.pathBudget = PATH_NODE_BUDGET_PER_TICK;
  if (world.navDirty) rebuildNav(world);
  rebuildEntityGrid(world);
  updateAi(world, now, dt, computeFrozen(world));
  resolveCollisions(world);
  // Without this a body walks *through* the bags and the run says nothing about
  // going round them — the wall would be a suggestion rather than an obstacle.
  resolveEmplacementCollisions(world);
}

/**
 * A city with nothing alive in it but what we put there.
 *
 * Stripped for the reason `complexcheck.ts` strips it: a live outbreak turns
 * the run into a measurement of how far the city got rather than of whether one
 * body can get past one wall.
 */
function bareCity(world: World): void {
  resetWorld(world);
  for (const id of [...world.entities.keys()]) {
    world.entities.delete(id);
    world.ai.delete(id);
  }
  world.cityOfficers.clear();
  world.bots.clear();
  world.barricades.clear();
  world.emplacements.clear();
  world.navDirty = true;
  rebuildNav(world);
  rebuildEntityGrid(world);
}

interface Lane {
  x: number;
  y: number;
  tx: number;
  ty: number;
  /** The wall, halfway along and lying across the lane. */
  wallX: number;
  wallY: number;
}

/**
 * Open ground with a clear lane across it, and room to walk round the middle of
 * that lane.
 *
 * The margin is generous on purpose: the whole question is whether a body takes
 * a detour, and a lane with a building against one side of it is a lane where
 * failing to detour is the city's answer rather than the code's.
 */
function openLane(world: World): Lane | null {
  for (let i = 0; i < 6000; i++) {
    const x = 400 + Math.random() * (world.map.width - 800);
    const y = 400 + Math.random() * (world.map.height - 800);
    let clear = true;
    for (let a = 0; a < 16 && clear; a++) {
      const t = (a / 16) * Math.PI * 2;
      for (let r = 0; r <= 260; r += 26) {
        if (world.nav.isBlocked(x + Math.cos(t) * r, y + Math.sin(t) * r)) {
          clear = false;
          break;
        }
      }
    }
    if (!clear) continue;
    return {
      x: x - LANE / 2,
      y,
      tx: x + LANE / 2,
      ty: y,
      wallX: x,
      wallY: y,
    };
  }
  return null;
}

/**
 * Put the wall across the lane and confirm it is actually in the way — and that
 * there is a way round it.
 *
 * Both preconditions are checked rather than assumed. A wall the straight line
 * misses measures nothing, and a wall with no route round it measures the city:
 * pressing on it would then be the correct answer and the run would score the
 * fix as a failure.
 */
function stageWall(world: World, lane: Lane): boolean {
  // `placeBarricade` takes the wall's *own* bearing — the way its long axis
  // runs — so a lane running east wants a wall running north-south.
  placeBarricade(world, lane.wallX, lane.wallY, Math.PI / 2);
  world.navDirty = true;
  rebuildNav(world);

  if (hasWallClearPath(world, lane.x, lane.y, lane.tx, lane.ty, true)) return false;
  const round = world.nav.findPath(lane.x, lane.y, lane.tx, lane.ty, 20000, true);
  return round !== null;
}

interface Walk {
  /** Got within COMMAND_ARRIVE_DIST of the far end. */
  arrived: boolean;
  /** Seconds it took, or -1. */
  secs: number;
  /** Ticks spent pressed against the wall — within a body's width of it. */
  pressed: number;
  /** Closest it ever got to the far end. */
  closest: number;
}

const PRESSED_GAP = 4;

/**
 * **Each kind arrives by its own rule, and using one for both is the rig
 * lying.** `COMMAND_ARRIVE_DIST` is 26 and `RALLY_ARRIVE_DIST` is 46 — so a
 * civilian that had walked all the way round the wall and stopped exactly where
 * a rally order tells it to stop was scored as never having got there, at
 * **0/6** with a closest approach of 44.7px against a 46px rule.
 */
function walkRun(world: World, lane: Lane, e: Entity, radius: number, arrive: number): Walk {
  const wall = [...world.barricades.values()][0];
  const out: Walk = { arrived: false, secs: -1, pressed: 0, closest: Infinity };
  let now = Date.now();
  for (let i = 0; i < TICKS; i++) {
    tick(world, now, TICK_MS / 1000);
    now += TICK_MS;
    const gap = Math.hypot(e.x - lane.tx, e.y - lane.ty);
    out.closest = Math.min(out.closest, gap);
    if (gap <= arrive && !out.arrived) {
      out.arrived = true;
      out.secs = ((i + 1) * TICK_MS) / 1000;
    }
    if (wall && closestOnBox(wall.box, e.x, e.y).dist - radius <= PRESSED_GAP) out.pressed++;
  }
  return out;
}

interface Tally {
  arrived: number;
  n: number;
  secs: number[];
  pressed: number[];
  closest: number[];
}
const blank = (): Tally => ({ arrived: 0, n: 0, secs: [], pressed: [], closest: [] });

function bank(t: Tally, r: Walk): void {
  t.n++;
  if (r.arrived) t.arrived++;
  if (r.secs >= 0) t.secs.push(r.secs);
  t.pressed.push(r.pressed);
  t.closest.push(r.closest);
}

function line(label: string, t: Tally): void {
  console.log(
    `  ${label.padEnd(22)} got there ${t.arrived}/${t.n} - median ${
      t.secs.length ? f1(med(t.secs)) + 's' : '--'
    } - pressed on it ${med(t.pressed)} ticks - closest ${f1(med(t.closest))}px`,
  );
}

// ------------------------------------------------------- the two live walks

function walkSuite(): void {
  console.log('\n=== a wall across the lane ===');
  const modes: Array<{ label: string; old: boolean }> = [
    { label: 'OLD', old: true },
    { label: 'NEW', old: false },
  ];
  const officer = new Map<string, Tally>();
  const civilian = new Map<string, Tally>();
  for (const m of modes) {
    officer.set(m.label, blank());
    civilian.set(m.label, blank());
  }
  let staged = 0;

  for (let run = 0; run < RUNS; run++) {
    const world = createWorld();
    bareCity(world);
    const lane = openLane(world);
    if (!lane) continue;
    if (!stageWall(world, lane)) continue;
    staged++;

    for (const m of modes) {
      setSandbagsIgnoredByRoutes(m.old);

      // A grey officer under a spectator's order — the exact thing reported.
      {
        const e = makeEntity('grey-0', 'officer', lane.x, lane.y);
        world.entities.set('grey-0', e);
        const st = newAiState(Date.now(), lane.x, lane.y);
        st.commandX = lane.tx;
        st.commandY = lane.ty;
        world.ai.set('grey-0', st);
        world.cityOfficers.add('grey-0');
        rebuildEntityGrid(world);
        bank(officer.get(m.label)!, walkRun(world, lane, e, ENTITY_RADIUS.officer, COMMAND_ARRIVE_DIST));
        world.entities.delete('grey-0');
        world.ai.delete('grey-0');
        world.cityOfficers.delete('grey-0');
      }

      // And a civilian, sent by an ordinary rally shout at an outdoor spot —
      // `rallyHumans` with no building under the point sets the target straight
      // and leaves the indoor machinery out of it.
      {
        const e = makeEntity('civ-0', 'human', lane.x, lane.y);
        world.entities.set('civ-0', e);
        world.ai.set('civ-0', newAiState(Date.now(), lane.x, lane.y));
        rebuildEntityGrid(world);
        rallyHumans(world, lane.x, lane.y, lane.tx, lane.ty);
        bank(civilian.get(m.label)!, walkRun(world, lane, e, ENTITY_RADIUS.human, RALLY_ARRIVE_DIST));
        world.entities.delete('civ-0');
        world.ai.delete('civ-0');
      }
    }
  }
  setSandbagsIgnoredByRoutes(false);

  console.log(`  staged ${staged}/${RUNS} cities`);
  for (const m of modes) line(`officer ${m.label}`, officer.get(m.label)!);
  for (const m of modes) line(`civilian ${m.label}`, civilian.get(m.label)!);

  const oldO = officer.get('OLD')!;
  const newO = officer.get('NEW')!;
  const oldC = civilian.get('OLD')!;
  const newC = civilian.get('NEW')!;

  check(staged > 0, 'a lane with a wall across it and room round it was staged');
  check(oldO.arrived === 0, 'CONTROL: a commanded officer never got past before', `${oldO.arrived}/${oldO.n}`);
  check(newO.arrived === newO.n && newO.n > 0, 'a commanded officer walks round it', `${newO.arrived}/${newO.n}`);
  check(
    med(newO.pressed) < med(oldO.pressed) / 4,
    'and stops pressing on it',
    `${med(oldO.pressed)} -> ${med(newO.pressed)} ticks`,
  );
  check(oldC.arrived === 0, 'CONTROL: a civilian never got past before', `${oldC.arrived}/${oldC.n}`);
  check(newC.arrived === newC.n && newC.n > 0, 'a civilian walks round it', `${newC.arrived}/${newC.n}`);
  check(
    med(newC.pressed) < med(oldC.pressed) / 4,
    'and stops bumping into it',
    `${med(oldC.pressed)} -> ${med(newC.pressed)} ticks`,
  );
}

// ----------------------------------------------------------- and the horde

/**
 * The horde's half, and it is asked as two different questions on purpose.
 *
 * **The comparison a first version made was a dice roll.** It stood a zombie
 * behind the wall with prey on the far side, ran both modes, and compared how
 * much of the wall came down: 900 against 816, and 6 of 6 reaching it against
 * 4 of 6 — on code that is *identical* for a zombie, since `avoidSoft` is
 * `e.type !== 'zombie'` and the gate only ever turns it further off. What
 * differs between the two runs is the trait roll, the wander before it senses
 * anything and the swing clock — CLAUDE.md's own rule, that an unpaired run
 * measures the city rather than the code, with the traits standing in for the
 * city.
 *
 * So the *decision* is checked exactly, on the two inputs that make it, and the
 * *behaviour* is checked as "does this still work" rather than as a comparison.
 */
function hordeSuite(): void {
  console.log('\n=== and the horde is untouched ===');
  setSandbagsIgnoredByRoutes(false);

  let staged = 0;
  let zombieStraight = 0;
  let aliveRound = 0;
  let reached = 0;
  const damage: number[] = [];

  for (let run = 0; run < RUNS; run++) {
    const world = createWorld();
    bareCity(world);
    const lane = openLane(world);
    if (!lane) continue;
    if (!stageWall(world, lane)) continue;
    staged++;
    const wall = [...world.barricades.values()][0];

    // The decision itself: the same two ends, asked both ways.
    const zombieLine = hasWallClearPath(world, lane.x, lane.y, lane.tx, lane.ty, false);
    const zombieRoute = world.nav.findPath(lane.x, lane.y, lane.tx, lane.ty, 20000, false);
    const aliveRoute = world.nav.findPath(lane.x, lane.y, lane.tx, lane.ty, 20000, true);
    // A route "goes through the wall" if any leg of the polyline crosses the
    // box — the string-pull collapses an unobstructed one to a single leg, so
    // reading the leg count would say nothing.
    const crosses = (route: { x: number; y: number }[] | null): boolean => {
      if (!route) return false;
      let px = lane.x;
      let py = lane.y;
      for (const w of route) {
        if (segmentHitsBox(px, py, w.x, w.y, wall.box)) return true;
        px = w.x;
        py = w.y;
      }
      return false;
    };
    if (zombieLine) zombieStraight++;
    if (aliveRoute !== null && !crosses(aliveRoute) && crosses(zombieRoute) === false) {
      // The zombie's own route only exists when it is asked for at all — its
      // straight line is clear, so `headingToward` never reaches the router.
      // What matters is that the *alive* one goes round.
      aliveRound++;
    } else if (aliveRoute !== null && !crosses(aliveRoute)) {
      aliveRound++;
    }

    /*
     * And that a zombie in contact with a wall still tears at it.
     *
     * **Pinned against it, which the first version was not.** A barricade is
     * 52px long, so a zombie walking at prey on the far side slides round the
     * end of it in a second or two — correct behaviour, and behaviour it has
     * always had, but it means an unpinned run measures whether the zombie
     * happened to clip the corner. Measured that way the same code read 6 of 6
     * reaching the wall on one run and 2 of 6 on the next, with the median
     * damage swinging between 900 and 0. Pinning is the same trick
     * `botkite.ts` and `provoke.ts` use, and for the same reason.
     */
    const prey = makeEntity('prey', 'human', lane.wallX + 80, lane.wallY);
    prey.health = 1e9;
    prey.maxHealth = 1e9;
    world.entities.set('prey', prey);
    world.ai.set('prey', newAiState(Date.now(), prey.x, prey.y));

    const z = makeEntity('z-0', 'zombie', lane.wallX, lane.wallY);
    z.radius = ZOMBIE_RADIUS;
    // Just off the near face, which is where collision would hold it anyway.
    const standoff = BARRICADE_HALF_DEPTH + z.radius + 1;
    world.entities.set('z-0', z);
    world.ai.set('z-0', newAiState(Date.now(), z.x, z.y));
    rebuildEntityGrid(world);

    let contact = 0;
    let now = Date.now();
    for (let i = 0; i < TICKS; i++) {
      prey.x = lane.wallX + 80;
      prey.y = lane.wallY;
      z.x = lane.wallX - standoff;
      z.y = lane.wallY;
      tick(world, now, TICK_MS / 1000);
      now += TICK_MS;
      // `SANDBAG_REACH`, not a hair's breadth: a zombie claws the bags from
      // arm's length and never actually touches them. A 4px test read *0 of 6
      // reached the wall* on runs that had taken it from 900 health to nothing,
      // which is the rig contradicting itself in the same table.
      if (closestOnBox(wall.box, z.x, z.y).dist - z.radius <= SANDBAG_REACH) contact++;
      if (!world.barricades.has(wall.id)) break;
    }
    if (contact > 0) reached++;
    damage.push(BARRICADE_HEALTH - Math.max(0, wall.health));

    world.entities.delete('prey');
    world.ai.delete('prey');
    world.entities.delete('z-0');
    world.ai.delete('z-0');
  }

  console.log(
    `  staged ${staged} cities - zombie's straight line still clear ${zombieStraight}/${staged} - ` +
      `route for the living goes round ${aliveRound}/${staged}`,
  );
  console.log(`  reached the wall ${reached}/${staged} - median damage ${med(damage)} of ${BARRICADE_HEALTH}`);

  check(staged > 0, 'a lane with a wall across it was staged for the horde');
  check(
    zombieStraight === staged,
    "a zombie's straight walk is still clear through the bags",
    `${zombieStraight}/${staged}`,
  );
  check(aliveRound === staged, 'while the route for anything alive goes round', `${aliveRound}/${staged}`);
  check(reached === staged, 'a zombie held at the wall is still at it', `${reached}/${staged}`);
  check(med(damage) > 0, 'and still tears it down', `${med(damage)} of ${BARRICADE_HEALTH}`);
}

// ---------------------------------------------------- the gunner's own bags

/**
 * The pocket gunner's sandbags go through the identical machinery, so this is
 * one direct reading rather than a second set of walks: they are in the
 * destructible layer, and the straight line is refused for anything alive.
 */
function gunnerSuite(): void {
  console.log("\n=== the gunner's bags, same layer ===");
  const world = createWorld();
  bareCity(world);
  const lane = openLane(world);
  if (!lane) {
    check(false, 'open ground for an emplacement');
    return;
  }

  const owner = makeEntity('gunner-owner', 'officer', lane.wallX - 46, lane.wallY);
  owner.facing = 0;
  world.entities.set('gunner-owner', owner);
  world.ai.set('gunner-owner', newAiState(Date.now(), owner.x, owner.y));
  const ok = deployEmplacement(world, owner, Date.now());
  check(ok, 'an emplacement went down');
  if (!ok) return;
  check(world.navDirty, 'deploying one asks for a nav rebuild');
  rebuildNav(world);

  const gun = [...world.emplacements.values()][0];
  const bags = gun.bags!;
  // Straight through the middle of the bags, along the line they lie across.
  const ax = bags.x - Math.cos(gun.arc) * 70;
  const ay = bags.y - Math.sin(gun.arc) * 70;
  const bx = bags.x + Math.cos(gun.arc) * 70;
  const by = bags.y + Math.sin(gun.arc) * 70;
  check(
    !hasWallClearPath(world, ax, ay, bx, by, true),
    'a straight walk through the bags is refused',
  );
  check(
    hasWallClearPath(world, ax, ay, bx, by),
    'CONTROL: and is not, for anything that is not asking about walking',
  );
  check(world.nav.isBlockedOrSoft(bags.x, bags.y), 'the bags are in the destructible layer');
  check(!world.nav.isBlocked(bags.x, bags.y), 'and not in the hard one');
  check(
    world.nav.isReachable(bags.x, bags.y),
    'a wall does not make the ground under it unreachable',
  );
}

walkSuite();
hordeSuite();
gunnerSuite();

console.log(`\n${checks - failures}/${checks} checks passed${failures ? ` - ${failures} FAILED` : ''}`);
process.exit(failures ? 1 : 0);
