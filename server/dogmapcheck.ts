/**
 * Harness for the dog's corner map, and mostly for the one rule that matters:
 * **an officer nowhere near a zombie is never put on the wire.**
 *
 *   npx tsx dogmapcheck.ts
 *
 * Headless — no socket, no port — so it leaves a game on 8080 alone.
 *
 * The checks are deliberately about *absence*. A map feature is only as good as
 * what it refuses to show, and "the client does not draw it" is not a rule, it
 * is a decoration. So every check here reads `DogHud.contacts` — what the
 * server actually serialises — rather than anything the drawing does with it.
 */
import {
  createWorld,
  resetWorld,
  rebuildEntityGrid,
  rebuildNav,
  spawnDog,
  makeEntity,
  newAiState,
  type Entity,
  type World,
} from './src/world.js';
import { updateAi } from './src/ai.js';
import { dogHudFor } from './src/dog.js';
import {
  DANGER_REBUILD_MS,
  DOG_MAP_CONTACT_RANGE,
  DOG_MAP_REFRESH_MS,
  TICK_RATE,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from '../shared/constants.js';

const TICK_MS = 1000 / TICK_RATE;
const DOG = 'map-dog';

/**
 * A danger reading, printed honestly.
 *
 * `DangerField.distanceAt` answers `Infinity` for a cell its BFS never reached
 * — one whose centre is blocked, or one past `DANGER_MAX_DISTANCE`. **And
 * `Infinity | 0` is `0` in JavaScript**, so a check that formatted its worst
 * reading that way reported "up to 0px stale" for the one case it most needed
 * to describe: self-contradictory, and it hid the cause for as long as it
 * stood. Nothing here formats a distance by hand.
 */
const px = (v: number): string => (Number.isFinite(v) ? `${Math.round(v)}px` : 'unreachable');

let failures = 0;
function check(label: string, ok: boolean, detail = ''): void {
  if (!ok) failures++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
}

interface Rig {
  world: World;
  clock: number;
  /** Advance far enough that the danger field and the contact scan both run. */
  settle(): void;
  contacts(): Array<{ x: number; y: number }>;
  officer(id: string, x: number, y: number): Entity;
  shambler(id: string, x: number, y: number): Entity;
  civilian(id: string, x: number, y: number): Entity;
}

function rig(): Rig {
  const world = createWorld();
  resetWorld(world);
  world.dogs.add(DOG);
  world.playerIds.add(DOG);
  spawnDog(world, DOG);

  // Clear the city out entirely. Everything this measures is staged, and a
  // round's own five hundred bodies would decide the answers instead.
  for (const e of [...world.entities.values()]) {
    if (e.id === DOG) continue;
    world.entities.delete(e.id);
    world.ai.delete(e.id);
  }

  const r: Rig = {
    world,
    clock: Date.now(),
    settle(): void {
      // The contact scan reads the danger field, which rebuilds on its own
      // slower clock — so both have to have run, or the answer is one cadence
      // stale and the test is measuring the schedule rather than the rule.
      for (let i = 0; i < 30; i++) {
        this.clock += Math.max(TICK_MS, DANGER_REBUILD_MS / 4);
        rebuildEntityGrid(world);
        updateAi(world, this.clock, TICK_MS / 1000, new Set());
      }
      this.clock += DOG_MAP_REFRESH_MS + 10;
    },
    contacts(): Array<{ x: number; y: number }> {
      return dogHudFor(world, DOG, this.clock)?.contacts ?? [];
    },
    officer(id: string, x: number, y: number): Entity {
      const e = makeEntity(id, 'officer', x, y);
      world.entities.set(id, e);
      world.ai.set(id, newAiState(this.clock, x, y));
      return e;
    },
    shambler(id: string, x: number, y: number): Entity {
      const e = makeEntity(id, 'zombie', x, y);
      world.entities.set(id, e);
      world.ai.set(id, newAiState(this.clock, x, y));
      return e;
    },
    civilian(id: string, x: number, y: number): Entity {
      const e = makeEntity(id, 'human', x, y);
      world.entities.set(id, e);
      world.ai.set(id, newAiState(this.clock, x, y));
      return e;
    },
  };
  return r;
}

/** Somewhere out in the open, well clear of geometry, near a given spot. */
function openSpotNear(world: World, x: number, y: number, within: number): { x: number; y: number } {
  for (let i = 0; i < 4000; i++) {
    const a = Math.random() * Math.PI * 2;
    const d = Math.random() * within;
    const px = Math.max(60, Math.min(WORLD_WIDTH - 60, x + Math.cos(a) * d));
    const py = Math.max(60, Math.min(WORLD_HEIGHT - 60, y + Math.sin(a) * d));
    if (!world.nav.isBlocked(px, py) && world.nav.isReachable(px, py)) return { x: px, y: py };
  }
  throw new Error('nowhere open');
}

const listed = (cs: Array<{ x: number; y: number }>, e: Entity): boolean =>
  cs.some((c) => Math.hypot(c.x - e.x, c.y - e.y) < 2);

/**
 * Stage a scene, settle it, and try again until the danger field can actually
 * answer for the officer the check is about.
 *
 * **This is a precondition these checks have always assumed and never stated,
 * not a retry bolted on to make a flaky run go green.** The field is
 * `DANGER_CELL` (28px) cells and a cell counts as blocked when its *centre* is
 * in a wall — so a body standing in the open a few pixels off a frontage can
 * sit in a cell the BFS never reached. `distanceAt` then answers `Infinity`
 * with a shambler 30px away, and `refreshDogContacts` quite correctly declines
 * to list somebody it cannot measure. **It fails closed**, which for a feature
 * defined by what it refuses to show is the safe direction, and it is a
 * property of reading a coarse field rather than of this map or this rule.
 *
 * Measured before it was stated: staged bodies walk ~30px during `settle` and
 * land where they land, so **3 runs in 12** of one check and about **1 in 16**
 * of another settled an officer into such a cell — and both then reported
 * "0 contacts" as though the rule itself had broken.
 *
 * `stage` returns the officer to gate on; `ids` is everything it created, so a
 * failed attempt leaves nothing behind for the next one to trip over.
 */
function stageInContact(
  r: Rig,
  ids: string[],
  stage: () => Entity,
): { officer: Entity; attempts: number; ok: boolean } {
  let officer!: Entity;
  let ok = false;
  let attempts = 0;
  for (; attempts < 30 && !ok; attempts++) {
    for (const id of ids) {
      r.world.entities.delete(id);
      r.world.ai.delete(id);
    }
    officer = stage();
    r.settle();
    // `Infinity` fails this outright, which is the whole point of the gate.
    ok = r.world.danger.distanceAt(officer.x, officer.y) <= DOG_MAP_CONTACT_RANGE;
  }
  return { officer, attempts, ok };
}

// -------------------------------------------------------------- the rule

function testTheRule(): void {
  console.log('\nthe rule: only what the horde has walked into');
  const r = rig();
  const world = r.world;

  // Right across the map from wherever the staged pair end up.
  const far = openSpotNear(world, WORLD_WIDTH * 0.8, WORLD_HEIGHT * 0.8, 400);
  const alone = r.officer('alone', far.x, far.y);

  const staged = stageInContact(r, ['watched', 'walker'], () => {
    const near = openSpotNear(world, WORLD_WIDTH * 0.3, WORLD_HEIGHT * 0.3, 400);
    const w = r.officer('watched', near.x, near.y);
    // The shambler that has walked into them. A few paces off, so it is
    // plainly within sight and plainly not standing on them.
    const zombieSpot = openSpotNear(world, near.x, near.y, 120);
    r.shambler('walker', zombieSpot.x, zombieSpot.y);
    return w;
  });
  check('staged an officer the field can answer for', staged.ok, `${staged.attempts} attempts`);
  if (!staged.ok) return;
  const watched = staged.officer;

  const cs = r.contacts();
  check('an officer the horde is on shows up', listed(cs, watched), `${cs.length} contacts`);
  check('an officer alone in a quiet street does not', !listed(cs, alone));

  // And the moment the horde is gone, so is the contact. This is the check
  // that says it is live rather than latched: a map that remembered where
  // somebody *was* would be the cheating this rule exists to stop.
  world.entities.delete('walker');
  world.ai.delete('walker');
  r.settle();
  const after = r.contacts();
  check('kill the zombie and the contact goes with it', !listed(after, watched), `${after.length} left`);
}

function testGeodesic(): void {
  console.log('\nthrough a wall is not "near"');
  const r = rig();
  const world = r.world;

  // A pair either side of a building wall: close in a straight line, a long
  // way apart through walkable space. Straight-line distance would call this
  // a contact; the danger field does not, which is the whole reason it is the
  // thing being read.
  let found = false;
  let attempts = 0;
  for (const b of world.map.buildings) {
    if (found || attempts > 400) break;
    const rect = b.rects[0];
    for (let i = 0; i < 40 && !found; i++) {
      attempts++;
      // Just inside one wall, and just outside the same wall.
      const inside = { x: rect.x + rect.w / 2, y: rect.y + 30 };
      const outside = { x: rect.x + rect.w / 2, y: rect.y - 30 };
      if (world.nav.isBlocked(inside.x, inside.y) || !world.nav.isReachable(inside.x, inside.y)) break;
      if (world.nav.isBlocked(outside.x, outside.y) || !world.nav.isReachable(outside.x, outside.y)) break;

      const straight = Math.hypot(inside.x - outside.x, inside.y - outside.y);
      const officer = r.officer('split', inside.x, inside.y);
      r.shambler('outsider', outside.x, outside.y);
      r.settle();
      const geo = world.danger.distanceAt(inside.x, inside.y);
      if (geo > DOG_MAP_CONTACT_RANGE && straight < DOG_MAP_CONTACT_RANGE) {
        check(
          'a straight line says near, the walk says far — and it is not listed',
          !listed(r.contacts(), officer),
          `${px(straight)} apart, ${px(geo)} to walk`,
        );
        found = true;
      }
      world.entities.delete('split');
      world.entities.delete('outsider');
      world.ai.delete('split');
      world.ai.delete('outsider');
      break;
    }
  }
  check('found a wall to test it against', found);
}

function testOnlyOfficers(): void {
  console.log('\nofficers, and nothing else');
  const r = rig();

  let bystander!: Entity;
  let shambler!: Entity;
  const staged = stageInContact(r, ['o', 'c', 'z'], () => {
    const spot = openSpotNear(r.world, WORLD_WIDTH / 2, WORLD_HEIGHT / 2, 500);
    const o = r.officer('o', spot.x, spot.y);
    bystander = r.civilian('c', spot.x + 30, spot.y);
    shambler = r.shambler('z', spot.x - 40, spot.y);
    return o;
  });
  check('staged an officer the field can answer for', staged.ok, `${staged.attempts} attempts`);
  if (!staged.ok) return;

  const cs = r.contacts();
  check('the officer is on it', listed(cs, staged.officer));
  check('the civilian standing beside them is not', !listed(cs, bystander));
  check('and neither is the zombie', !listed(cs, shambler));
  check('so the list is exactly one long', cs.length === 1, `${cs.length}`);
}

function testNoDogNoScan(): void {
  console.log('\nnobody looking, nothing built');
  const world = createWorld();
  resetWorld(world);
  let clock = Date.now();
  for (let i = 0; i < 20; i++) {
    clock += TICK_MS;
    rebuildEntityGrid(world);
    updateAi(world, clock, TICK_MS / 1000, new Set());
  }
  check('a round with no dog in it never builds a contact list', world.dogContacts.length === 0);
  check('and an officer asking gets nothing at all', dogHudFor(world, 'some-officer', clock) === null);
}

function testThrottled(): void {
  console.log('\nbuilt four times a second, not thirty');
  const r = rig();
  const spot = openSpotNear(r.world, WORLD_WIDTH / 2, WORLD_HEIGHT / 2, 500);
  r.officer('o', spot.x, spot.y);
  r.shambler('z', spot.x + 60, spot.y);
  r.settle();

  const first = r.contacts();
  // Move the officer and ask again inside the refresh window: the answer must
  // be the *cached* one, which is what says the walk is not being paid for on
  // every snapshot.
  r.world.entities.get('o')!.x += 900;
  const again = dogHudFor(r.world, DOG, r.clock + 10)!.contacts;
  check('a second look inside the window is the same array', again === first);

  const later = dogHudFor(r.world, DOG, r.clock + DOG_MAP_REFRESH_MS + 20)!.contacts;
  check('and past it, a fresh one', later !== first);
}

// ------------------------------------------------------ over a real round

/**
 * How much of a cached list may have gone stale before the next rebuild.
 *
 * Sized against measured demand rather than picked by eye: a real round runs
 * 2-4%, so this has room to spare and still fails loudly for the two ways it
 * could go wrong — a scan that stopped running at all, or a throttle that blew
 * out past its own cadence, both of which drive it toward everything.
 */
const STALE_SHARE_MAX = 0.12;

/**
 * The contact for this officer, matched exactly.
 *
 * The wire rounds to whole pixels, so the offset is at most 0.71px on the
 * diagonal — a tolerance of 1 cannot pick up a neighbour, where `listed`'s 2
 * could in a street with a squad stood in it.
 */
const onTheList = (cs: Array<{ x: number; y: number }>, e: Entity): boolean =>
  cs.some((c) => Math.hypot(c.x - e.x, c.y - e.y) < 1);

/**
 * Over a real round: the rule exactly, and then the staleness the throttle
 * allows — which is a different question and wants a different unit.
 *
 * **It samples every tick rather than every sixtieth, and that is the whole
 * reason it can see the throttle at all.** The list is rebuilt every
 * `DOG_MAP_REFRESH_MS` (250), so a harness looking once every 2000ms rebuilt it
 * on every single look and never once read a cached list. It was measuring the
 * scan and reporting the figure as though it described the cache.
 *
 * So the two halves are split, and neither carries a slack figure:
 *
 * - **On a rebuild tick the rule holds exactly.** The list and the field it was
 *   built from are the same age, so "is this officer in range" has one right
 *   answer, and it is checked in both directions — nothing listed that should
 *   not be, and nothing missing that should. **Read at the officer's own
 *   position, never at the rounded contact coordinate.** The wire rounds to
 *   whole pixels and the field answers in 28px cells, so re-reading the rounded
 *   value asks a *different cell* whenever a coordinate sits within half a
 *   pixel of a cell boundary — and if that neighbouring cell's centre is inside
 *   a wall, the BFS never reached it and the answer is `Infinity`. That is the
 *   check quantising itself, not the rule failing: measured, an officer 112px
 *   from a shambler with another 75px away in a straight line was reported
 *   "stale" because 2127.80 and 2128 are in different rows of the danger grid.
 * - **On a cached tick the list is up to `DOG_MAP_REFRESH_MS` old**, which is
 *   the throttle rather than a bug. What is bounded there is its *age*, in
 *   milliseconds. **Pixels are the wrong unit for it**, and that was the old
 *   check's mistake: it allowed 150px on the reasoning that two bodies walk
 *   about 60px apart in a refresh window. The dominant term is not walking at
 *   all — it is the zombie that made the contact *dying*, which removes a BFS
 *   source and takes the reading to the next-nearest zombie, or to unreachable,
 *   in one rebuild and however far off that happens to be. No bound in pixels
 *   can describe that, and one that tries fails on its own clock.
 */
function testLiveRound(): void {
  console.log('\nover a real round, with a real outbreak');
  const world = createWorld();
  resetWorld(world);
  world.dogs.add(DOG);
  world.playerIds.add(DOG);
  spawnDog(world, DOG);
  rebuildNav(world);

  let clock = Date.now();
  let officers = 0;
  let shown = 0;
  let samples = 0;

  // The rule, on the ticks the list was actually built.
  let rebuilds = 0;
  let wrongOnRebuild = 0;
  let worstShownDistance = 0;

  // The throttle, on every other tick. `listedAt` is where each listed officer
  // stood when the list was made, so a stale contact can say whether it went
  // stale because the officer walked or because the horde left.
  const listedAt = new Map<string, { x: number; y: number }>();
  let builtAt = 0;
  let cachedReadings = 0;
  let staleKilled = 0;
  let staleTurned = 0;
  let staleStanding = 0;
  let worstAgeMs = 0;
  let worstStandingMove = 0;

  for (let i = 0; i < 2400; i++) {
    clock += TICK_MS;
    rebuildEntityGrid(world);
    updateAi(world, clock, TICK_MS / 1000, new Set());
    if (i < 300) continue;
    samples++;

    const due = world.nextDogContactScan;
    const cs = dogHudFor(world, DOG, clock)!.contacts;
    const rebuilt = world.nextDogContactScan !== due;

    let live = 0;
    for (const e of world.entities.values()) if (e.type === 'officer') live++;
    officers += live;
    shown += cs.length;

    if (rebuilt) {
      rebuilds++;
      listedAt.clear();
      builtAt = clock;
      for (const e of world.entities.values()) {
        if (e.type !== 'officer') continue;
        const d = world.danger.distanceAt(e.x, e.y);
        const inRange = d <= DOG_MAP_CONTACT_RANGE;
        if (onTheList(cs, e) !== inRange) wrongOnRebuild++;
        if (inRange) {
          listedAt.set(e.id, { x: e.x, y: e.y });
          worstShownDistance = Math.max(worstShownDistance, d);
        }
      }
      continue;
    }

    if (builtAt === 0) continue;
    worstAgeMs = Math.max(worstAgeMs, clock - builtAt);
    for (const [id, was] of listedAt) {
      cachedReadings++;
      const e = world.entities.get(id);
      // Killed, or turned — the body has left the round inside the window. The
      // turned one is the milder of the two: what the map is pointing at is a
      // spot that now has a zombie standing on it, which is not a way to find
      // a quiet officer.
      if (!e) {
        staleKilled++;
        continue;
      }
      if (e.type !== 'officer') {
        staleTurned++;
        continue;
      }
      if (world.danger.distanceAt(e.x, e.y) <= DOG_MAP_CONTACT_RANGE) continue;
      staleStanding++;
      worstStandingMove = Math.max(worstStandingMove, Math.hypot(e.x - was.x, e.y - was.y));
    }
  }

  const pct = officers > 0 ? (shown / officers) * 100 : 0;
  const stale = staleKilled + staleTurned + staleStanding;

  check(
    'a freshly built list is exactly the rule, both directions',
    wrongOnRebuild === 0,
    `${wrongOnRebuild} wrong across ${rebuilds} rebuilds and ${samples} samples`,
  );
  check(
    'nothing was listed from further off than the rule allows',
    worstShownDistance <= DOG_MAP_CONTACT_RANGE,
    `${px(worstShownDistance)} against a ${DOG_MAP_CONTACT_RANGE}px rule`,
  );
  check(
    'a cached list is never older than the throttle',
    worstAgeMs <= DOG_MAP_REFRESH_MS,
    `${Math.round(worstAgeMs)}ms against ${DOG_MAP_REFRESH_MS}ms`,
  );
  check(
    'and what goes stale inside that window is a fraction of it',
    cachedReadings > 0 && stale <= cachedReadings * STALE_SHARE_MAX,
    `${stale}/${cachedReadings} readings — ${staleKilled} killed, ${staleTurned} turned, ` +
      `${staleStanding} still stood there with the horde gone (having moved ${px(worstStandingMove)})`,
  );
  check(
    'and it is a fraction of the garrison, not all of it',
    pct > 0 && pct < 80,
    `${pct.toFixed(0)}% of officers shown on average`,
  );
}

function testCost(): void {
  console.log('\nwhat it costs the server');
  const world = createWorld();
  resetWorld(world);
  world.dogs.add(DOG);
  world.playerIds.add(DOG);
  spawnDog(world, DOG);

  let clock = Date.now();
  for (let i = 0; i < 400; i++) {
    clock += TICK_MS;
    rebuildEntityGrid(world);
    updateAi(world, clock, TICK_MS / 1000, new Set());
  }

  // The scan itself, forced every time rather than cached, so the figure is
  // the walk and not the throttle.
  const runs = 400;
  const t0 = performance.now();
  for (let i = 0; i < runs; i++) {
    world.nextDogContactScan = 0;
    dogHudFor(world, DOG, clock);
  }
  const each = (performance.now() - t0) / runs;

  // And what a snapshot actually pays, which is the throttled figure.
  const t1 = performance.now();
  for (let i = 0; i < runs; i++) dogHudFor(world, DOG, clock);
  const cached = (performance.now() - t1) / runs;

  let entities = 0;
  for (const _ of world.entities.values()) entities++;
  console.log(`  info  ${entities} entities in the city`);
  check('a forced rebuild is well under a millisecond', each < 1, `${each.toFixed(3)}ms`);
  check(
    'and a snapshot pays essentially nothing for it',
    cached < each,
    `${cached.toFixed(3)}ms cached against ${each.toFixed(3)}ms rebuilt`,
  );
}

console.log('dog map check');
testTheRule();
testGeodesic();
testOnlyOfficers();
testNoDogNoScan();
testThrottled();
testLiveRound();
testCost();
console.log(`\n${failures === 0 ? 'all good' : `${failures} FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
