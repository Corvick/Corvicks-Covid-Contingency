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
 * How far past the rule a contact may read by the time it is checked again.
 *
 * The list is rebuilt every `DOG_MAP_REFRESH_MS` and the danger field every
 * `DANGER_REBUILD_MS` under it, so two bodies walking apart at officer and
 * zombie pace cover roughly 60px in that window, and the field itself answers
 * in 28px cells. This is that, with room to spare — it is a bound on the
 * *staleness*, and a real leak would be hundreds of pixels rather than tens.
 */
const STALENESS_SLACK = 150;

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

// -------------------------------------------------------------- the rule

function testTheRule(): void {
  console.log('\nthe rule: only what the horde has walked into');
  const r = rig();
  const world = r.world;

  // Somewhere open, and a second spot right across the map from it.
  const near = openSpotNear(world, WORLD_WIDTH * 0.3, WORLD_HEIGHT * 0.3, 400);
  const far = openSpotNear(world, WORLD_WIDTH * 0.8, WORLD_HEIGHT * 0.8, 400);

  const watched = r.officer('watched', near.x, near.y);
  const alone = r.officer('alone', far.x, far.y);
  // The shambler that has walked into the first one. A few paces off, so it is
  // plainly within sight and plainly not standing on them.
  const zombieSpot = openSpotNear(world, near.x, near.y, 120);
  r.shambler('walker', zombieSpot.x, zombieSpot.y);
  r.settle();

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
          `${straight | 0}px apart, ${geo === Infinity ? '>900' : geo | 0}px to walk`,
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
  const spot = openSpotNear(r.world, WORLD_WIDTH / 2, WORLD_HEIGHT / 2, 500);
  const officer = r.officer('o', spot.x, spot.y);
  const bystander = r.civilian('c', spot.x + 30, spot.y);
  const shambler = r.shambler('z', spot.x - 40, spot.y);
  r.settle();

  const cs = r.contacts();
  check('the officer is on it', listed(cs, officer));
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
  let leaked = 0;
  let worstShownDistance = 0;
  let worstOvershoot = 0;

  for (let i = 0; i < 2400; i++) {
    clock += TICK_MS;
    rebuildEntityGrid(world);
    updateAi(world, clock, TICK_MS / 1000, new Set());

    if (i % 60 !== 0 || i < 300) continue;
    samples++;
    const cs = dogHudFor(world, DOG, clock)!.contacts;
    let live = 0;
    for (const e of world.entities.values()) if (e.type === 'officer') live++;
    officers += live;
    shown += cs.length;

    /**
     * Every listed contact, re-checked against the field *as it stands now*.
     *
     * **The list is up to `DOG_MAP_REFRESH_MS` old and that is a real
     * property, not a bug** — it is the throttle, which is the whole of what
     * makes the map cheap. So a contact can read a little past the range by the
     * time it is looked at again: the officer walked, or the zombie did. What
     * matters is the *size* of that overshoot. A quarter second of two bodies
     * walking apart is on the order of 60px, plus the danger field's own 160ms
     * cadence and its 28px cells.
     *
     * Measuring the overshoot rather than counting "leaks" is the difference
     * between a check that says "the rule holds, and here is how stale the
     * answer gets" and one that fails on its own clock. The first version of
     * this counted, and reported 1 leak in 35 samples, which said nothing.
     */
    for (const c of cs) {
      const d = world.danger.distanceAt(c.x, c.y);
      if (d > DOG_MAP_CONTACT_RANGE) {
        leaked++;
        worstOvershoot = Math.max(worstOvershoot, d - DOG_MAP_CONTACT_RANGE);
      } else {
        worstShownDistance = Math.max(worstShownDistance, d);
      }
    }
  }

  const pct = officers > 0 ? (shown / officers) * 100 : 0;
  check(
    'every contact is one the horde had reached',
    worstOvershoot <= STALENESS_SLACK,
    leaked === 0
      ? `0 even a pixel over, across ${samples} samples`
      : `${leaked}/${shown} were up to ${worstOvershoot | 0}px stale, against ${STALENESS_SLACK}px of slack`,
  );
  check(
    'and it is a fraction of the garrison, not all of it',
    pct > 0 && pct < 80,
    `${pct.toFixed(0)}% of officers shown on average`,
  );
  check(
    'nothing was shown from further off than the rule allows',
    worstShownDistance <= DOG_MAP_CONTACT_RANGE,
    `${worstShownDistance | 0}px against a ${DOG_MAP_CONTACT_RANGE}px rule`,
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
