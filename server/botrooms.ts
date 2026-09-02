/**
 * Headless check on *"bot officers are having trouble kiting zombies in
 * buildings… they are dying simply by not knowing how to kite through multiple
 * rooms when zombies are in front of them. A task like that should always lead
 * to survival ( multiple zombies chasing from one direction when in a building
 * ). They need to remember the exit to the building and each room they go to,
 * and that if there are zombies coming in from one entrance to kite away using
 * another one ultimately leading to outside preferably ( and not accidently
 * heading towards a dead end )"*.
 *
 * No socket, no port, so it leaves a game on 8080 alone.
 *   npx tsx botrooms.ts
 *   RUNS=24 npx tsx botrooms.ts
 *   TRACE=1 npx tsx botrooms.ts   # room by room, both modes, first run
 *
 * **Staged the way the report asks for it**: a partitioned building with more
 * than one way out — the corner complex and the police station are the two the
 * city always has, and the big buildings are partitioned too — the officer put
 * inside it, and a wall of zombies coming in through one door. The way out is
 * the other door, several rooms away.
 *
 * `setBotIgnoresRooms` is the gate and it is **kept**. The fix is an absence
 * being filled — nothing indoors ever asked the room graph anything — and an
 * absence has nothing to read wrong: "it got out of the building" means very
 * little without "and it used to stay in there and die".
 *
 * **Paired**: both modes run on the same seeded city, from the same staging,
 * against the same pack. `resetWorld` generates a fresh unseeded map and
 * `populate` rolls fresh traits, so alternating run by run measures the city
 * rather than the code — this project has had that read a working change as a
 * regression twice.
 *
 * **The pack cannot be shot down** (`PACK_HEALTH`), and that is the whole of
 * what makes the run measure kiting. A bolt action against nine shamblers in a
 * front room is a fight a bot sometimes simply wins, and a run that ends with
 * the room cleared has measured the rifle rather than the route — in both
 * modes, since neither touches the shooting.
 *
 * Not typechecked by `npx tsc --noEmit` in `server/`, which only includes
 * `src`. Check it explicitly:
 *   npx tsc --noEmit --target ES2022 --module ESNext --moduleResolution Bundler
 *     --strict --skipLibCheck --types node botrooms.ts
 */
import {
  createWorld,
  resetWorld,
  rebuildNav,
  rebuildEntityGrid,
  resolveCollisions,
  buildingIndexAt,
  makeEntity,
  type World,
  type Entity,
} from './src/world.js';
import { computeFrozen, updateAi, setBotIgnoresRooms } from './src/ai.js';
import { OUTSIDE } from './src/rooms.js';
import {
  TICK_RATE,
  setCityPopulation,
  PATH_NODE_BUDGET_PER_TICK,
  ZOMBIE_RADIUS,
} from '../shared/constants.js';

const TICK_MS = 1000 / TICK_RATE;
const RUNS = Number(process.env.RUNS ?? 48);
const TICKS = Number(process.env.TICKS ?? 900); // 30s
const TRACE = process.env.TRACE === '1';
const TRACE_EVERY = Number(process.env.TRACE_EVERY ?? 15);

/** How many come in through the one door, and how far apart across it. */
const PACK = 9;
const PACK_SPACING = 40;
/**
 * They cannot be killed. See the note above: a run the bot shoots its way out
 * of has measured the bolt action, and both modes carry the same rifle.
 */
const PACK_TOUGH = Number(process.env.TOUGH ?? 1);
/** And how far back in the room the officer stands from the one they come in by. */
const STAND_BACK = 180;
/** And how many doorways apart the two ways out have to be. */
const MIN_HOPS = 2;
/** Where the front rank stands, measured inward off the slab. */
const PACK_FIRST = -110;
/** How far off a slab a face is sampled — past the room map's two cells of bleed. */
const FACE_PROBE = 56;

const f1 = (n: number): string => n.toFixed(1);
function med(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = xs.slice().sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}
function sum(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0);
}

function withSeed<T>(seed: number, fn: () => T): T {
  const real = Math.random;
  let a = seed >>> 0;
  Math.random = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  try {
    return fn();
  } finally {
    Math.random = real;
  }
}

function tick(world: World, now: number, dt: number): void {
  world.pathBudget = PATH_NODE_BUDGET_PER_TICK;
  if (world.navDirty) rebuildNav(world);
  rebuildEntityGrid(world);
  updateAi(world, now, dt, computeFrozen(world));
  resolveCollisions(world);
}

/** One bot in an empty city, with a known gun in the bag. */
function stagedWorld(): { world: World; bot: Entity } {
  const world = createWorld();
  world.botOfficerCount = 1;
  resetWorld(world);
  const bot = world.entities.get('bot-0');
  if (!bot) throw new Error('no bot-0 — did populate change?');
  for (const id of [...world.entities.keys()]) {
    if (id === 'bot-0') continue;
    world.entities.delete(id);
    world.ai.delete(id);
  }
  world.cityOfficers.clear();
  world.pickups.clear();
  // One known gun. `giveStartingItem` rolls off the whole loot table, and the
  // band a bot bolts in rather than kites in is derived from the gun's reach,
  // so left to the roll the draw would decide which branch is measured.
  const inv = world.inventories.get('bot-0');
  if (!inv) throw new Error('bot-0 has no inventory');
  for (let i = 0; i < inv.guns.length; i++) inv.guns[i] = null;
  inv.guns[1] = { item: 'boltRifle', ammo: 400 };
  inv.activeSlot = 1;
  rebuildEntityGrid(world);
  return { world, bot };
}

interface Way {
  /** Index into map.doors. */
  door: number;
  /** The room on its inside. */
  room: number;
  /** A point a little way inside the slab. */
  ix: number;
  iy: number;
  /** Unit vector pointing *into* the building. */
  ix1: number;
  iy1: number;
}

/**
 * A building with more than one way out of it, and the two doors furthest
 * apart on it.
 *
 * **This is a precondition rather than a nicety, and it is scarcer than it
 * sounds.** A partitioned landmark with two street doors turns up in about one
 * city in eight — the corner complex is nine to twenty rooms and usually has a
 * single way in — so the staging takes the building with the most rooms among
 * those that have two, which across a run is a mix of landmarks and ordinary
 * blocks. An ordinary block is one undivided room, and *that is still the
 * report*: zombies in at one door and the officer out of the other is the same
 * question with the room graph at its smallest.
 *
 * The two doors have to be a real choice apart (`DOOR_APART`), or "it left by
 * the other one" is decided by which side of a shared threshold the body
 * happened to be on.
 */
function twoWaysOut(
  world: World,
): { entry: Way; exit: Way; here: { x: number; y: number }; hops: number } | null {
  const rooms = world.rooms;

  const inside = rooms.roomsOf;

  /**
   * The room on the inside of an exterior door, found by looking at both faces
   * and asking which one is a room of this building.
   *
   * **Not off `DoorRuntime.insideSign`, which is `0` on about half of them** —
   * that field resolves once when the door is hung and 0 means it could not
   * tell, and reading it as "no inside" threw away one of the two doors on
   * nearly every landmark: the rig staged 6 cities in 8 and every one of them
   * a single-room block, which is not the report. **Nor off
   * `buildingIndexAt`**, which reads -1 several tiles inside some edge
   * buildings — it walks `rects`, and a door hung on a shared run is not
   * always inside one of them. The room map is the structure this feature is
   * written against, so it is the one to ask.
   */
  const insideOf = (index: number, b: number): Way | null => {
    const spec = world.map.doors[index];
    if (!spec || spec.interior) return null;
    const mine = new Set(inside.call(rooms, b));
    for (const s of [1, -1]) {
      const ix1 = spec.horiz ? 0 : s;
      const iy1 = spec.horiz ? s : 0;
      const ix = spec.x + ix1 * FACE_PROBE;
      const iy = spec.y + iy1 * FACE_PROBE;
      if (world.nav.isBlocked(ix, iy)) continue;
      const room = rooms.roomAt(ix, iy);
      if (!mine.has(room)) continue;
      // …and the other face really is the street, or this is not the outside
      // of anything and the "way out" leads into the next room.
      const ox = spec.x - ix1 * FACE_PROBE;
      const oy = spec.y - iy1 * FACE_PROBE;
      if (rooms.roomAt(ox, oy) !== OUTSIDE) continue;
      return { door: index, room, ix, iy, ix1, iy1 };
    }
    return null;
  };

  let best: {
    entry: Way;
    exit: Way;
    here: { x: number; y: number };
    hops: number;
  } | null = null;

  /** Doorways between two rooms, over the graph. */
  const hopsBetween = (from: number, to: number): number => {
    if (from === to) return 0;
    const seen = new Map<number, number>([[from, 0]]);
    const queue = [from];
    for (let head = 0; head < queue.length; head++) {
      const id = queue[head];
      for (const index of rooms.rooms[id].exits) {
        const far = rooms.farSideOf(index, id);
        if (far === OUTSIDE || seen.has(far)) continue;
        if (far === to) return seen.get(id)! + 1;
        seen.set(far, seen.get(id)! + 1);
        queue.push(far);
      }
    }
    return -1;
  };

  for (let b = 0; b < world.map.buildings.length; b++) {
    const ways: Way[] = [];
    for (const index of world.map.buildings[b].doors) {
      const w = insideOf(index, b);
      if (w) ways.push(w);
    }
    if (ways.length < 2) continue;

    for (const entry of ways) {
      for (const exit of ways) {
        if (exit.door === entry.door) continue;
        const hops = hopsBetween(entry.room, exit.room);
        // **The two ways out have to be rooms apart, and this is the report
        // rather than a nicety.** Both doors on the one room is "turn round and
        // walk out of the other side", which needs no room graph and is not
        // what anybody was dying to. Over twenty cities, 16 have a building
        // whose two street doors are two to nine doorways apart — usually a
        // landmark, and usually nine to twenty rooms.
        if (hops < MIN_HOPS) continue;
        if (best && hops <= best.hops) continue;

        const ed = world.map.doors[entry.door];
        /*
         * Somewhere in the entry room to stand, and the two rules that decide
         * it are both there because the first version of this rig got them
         * wrong and measured its own staging.
         *
         *  - **Back from the door, or he is grabbed inside a second** and the
         *    run has measured the pack. It also has to be far enough that he
         *    is *giving ground* rather than bolting on the first tick, which
         *    is `BOT_BOLT_DIST`.
         *  - **And near the middle of the room, not as far from the door as
         *    the floor allows.** "As far back as possible" is the far corner,
         *    which is the back-against-a-wall case the report explicitly sets
         *    aside — measured, the officer there had open ground in exactly
         *    one direction and it was the one the pack was in, and both modes
         *    walked east into them at a sprint.
         */
        const anchor = { x: ed.x - entry.ix1 * FACE_PROBE, y: ed.y - entry.iy1 * FACE_PROBE };
        const middle = rooms.rooms[entry.room];
        let here: { x: number; y: number } | null = null;
        let nearest = Infinity;
        for (let i = 0; i < 160; i++) {
          const p = rooms.randomPoint(entry.room);
          if (!p || world.nav.isBlocked(p.x, p.y)) continue;
          if (Math.hypot(p.x - ed.x, p.y - ed.y) < STAND_BACK) continue;
          if (!world.nav.lineClear(p.x, p.y, anchor.x, anchor.y)) continue;
          const d = Math.hypot(p.x - middle.x, p.y - middle.y);
          if (d >= nearest) continue;
          nearest = d;
          here = p;
        }
        if (!here) continue;

        best = { entry, exit, here, hops };
      }
    }
  }
  return best;
}

interface Run {
  /** It was outdoors at some point, which is the headline. */
  gotOut: boolean;
  /** …and how long that took, in seconds. */
  outAt: number;
  /** …and by a door other than the one the pack came in through. */
  otherDoor: boolean;
  /** Still an officer at the end. `convert` reuses the id, so type is the test. */
  alive: boolean;
  /** Ticks with a hand on it. */
  grabbed: number;
  /** Ticks in a room with one doorway — the dead end it must not back into. */
  deadEnd: number;
  /** Distinct rooms it was in. Kiting is a walk; standing still is one. */
  rooms: number;
  /** Ground covered, the control against "did not die because it never moved". */
  travelled: number;
  /** Ticks it did not move at all with the pack inside a body's reach. */
  pinned: number;
  /** Closest a zombie ever got. */
  closest: number;
  /** Diagnostics. */
  startGap: number;
  firstGrab: number;
  planned: number;
  roomsSeen: string;
}

/** The room the bot is in, or `OUTSIDE`. */
function roomOf(world: World, e: Entity): number {
  return world.rooms.roomAt(e.x, e.y);
}

function run(seed: number, ignoreRooms: boolean, trace: boolean): Run | null {
  setBotIgnoresRooms(ignoreRooms);
  return withSeed(seed, () => {
    const { world, bot } = stagedWorld();
    const spot = twoWaysOut(world);
    if (!spot) return null;

    // The officer stands well back in the room the pack is coming into, which
    // is the report: already inside when it arrives, with the rest of the
    // building behind him and another door somewhere in it.
    bot.x = spot.here.x;
    bot.y = spot.here.y;
    bot.facing = Math.atan2(spot.entry.iy - bot.y, spot.entry.ix - bot.x);
    const state = world.ai.get(bot.id);
    if (!state) throw new Error('bot-0 has no AiState');
    state.heading = bot.facing;

    // Their door stands open, or the officer cannot see what is coming and
    // never flees at all — and a shut slab is a fight about a handle rather
    // than the one being measured.
    const theirDoor = world.doors[spot.entry.door];
    if (!theirDoor) return null;
    theirDoor.open = true;
    theirDoor.locked = false;

    // A wall of them filing in through that one door, spread across it and
    // stacked back out into the street. Anything that will not fit is dropped
    // rather than shoved into a wall.
    const across = { x: -spot.entry.iy1, y: spot.entry.ix1 };
    let put = 0;
    for (let rank = 0; rank < 4 && put < PACK; rank++) {
      for (let i = -1; i <= 1 && put < PACK; i++) {
        // Measured off the slab itself: the front rank is in the gap and the
        // rest are backed up out in the street behind it.
        const d = PACK_FIRST - rank * 40;
        const door = world.map.doors[spot.entry.door];
        const x = door.x + spot.entry.ix1 * d + across.x * i * PACK_SPACING;
        const y = door.y + spot.entry.iy1 * d + across.y * i * PACK_SPACING;
        if (world.nav.isBlocked(x, y)) continue;
        if (Math.hypot(x - bot.x, y - bot.y) < 90) continue;
        const z = makeEntity(`pack-${put}`, 'zombie', x, y);
        z.radius = ZOMBIE_RADIUS;
        z.health *= PACK_TOUGH;
        z.maxHealth *= PACK_TOUGH;
        world.entities.set(z.id, z);
        put++;
      }
    }
    if (put < 4) return null; // not a wall, and not the report
    rebuildEntityGrid(world);

    // He has already seen them, which is the report — an officer indoors with a
    // pack coming in at him. Left to the ordinary perception tick he spends the
    // first half second with nothing perceived at all, falls through to patrol,
    // and  picks an *outdoor* spot: which from inside a
    // building is out of the nearest street door, which is the one they are
    // filing through. Measured, that is a bot walking into the pack and being
    // grabbed by tick 16 in both modes, on every city — the rig staging its own
    // subject into a grapple before either behaviour has run.
    state.nextSenseAt = 0;

    // The clock has to start where the world's does. `resetWorld` takes no
    // `now` and stamps every fresh AiState with `Date.now()`, so a rig with a
    // clock of its own leaves `nextSenseAt` decades in the future and the bot
    // perceives nothing at all — which reads exactly like the bug under test.
    let now = Date.now();
    const dt = TICK_MS / 1000;

    const r: Run = {
      gotOut: false,
      outAt: 0,
      otherDoor: false,
      alive: true,
      grabbed: 0,
      deadEnd: 0,
      rooms: 0,
      travelled: 0,
      pinned: 0,
      closest: Infinity,
      startGap: 0,
      firstGrab: -1,
      planned: 0,
      roomsSeen: '',
    };
    const seenRooms = new Set<number>();
    let lastRoom = -2;

    for (let t = 0; t < TICKS; t++) {
      const px = bot.x;
      const py = bot.y;
      tick(world, now, dt);
      now += TICK_MS;

      const live = world.entities.get('bot-0');
      if (!live || live.type !== 'officer') {
        r.alive = false;
        break;
      }
      r.travelled += Math.hypot(bot.x - px, bot.y - py);

      let near = Infinity;
      for (const z of world.entities.values()) {
        if (z.type !== 'zombie') continue;
        const d = Math.hypot(z.x - bot.x, z.y - bot.y);
        if (d < near) near = d;
      }
      if (near < r.closest) r.closest = near;
      if (t === 0) r.startGap = near;
      if (Math.hypot(bot.x - px, bot.y - py) < 1 && near < ZOMBIE_RADIUS * 4) r.pinned++;
      if (world.grapples.has(bot.id)) { r.grabbed++; if (r.firstGrab < 0) r.firstGrab = t; }
      if (state.wayOutAt > now) r.planned++;

      const room = roomOf(world, bot);
      if (room !== lastRoom) {
        if (trace) console.log(`    t=${t} room ${lastRoom} -> ${room}`);
        lastRoom = room;
      }
      if (trace && t % TRACE_EVERY === 0) {
        console.log(
          `    t=${t} room=${room} at ${bot.x.toFixed(0)},${bot.y.toFixed(0)} bolt=${state.bolting} give=${state.botGiving} close=${state.botClosing} threats=${state.threatPoints.length} near=${near.toFixed(0)} wayOut=${state.wayOutRoom}@${state.wayOutX.toFixed(0)},${state.wayOutY.toFixed(0)} grabbed=${world.grapples.has(bot.id)} door=${state.doorAction ?? '-'} unstick=${state.unstickUntil > now}`,
        );
      }
      if (room !== OUTSIDE) {
        seenRooms.add(room);
        // A room with one doorway that *is* the front door is not a cupboard.
        const exits = world.rooms.rooms[room].exits;
        const wayOut = exits.some((i) => world.rooms.farSideOf(i, room) === OUTSIDE);
        if (exits.length < 2 && !wayOut) r.deadEnd++;
      }

      if (!r.gotOut && room === OUTSIDE) {
        r.gotOut = true;
        r.outAt = (t * TICK_MS) / 1000;
        // Which door it came out of. The entry door is the pack's; anything
        // else is the claim.
        let bestDoor = -1;
        let bestD = Infinity;
        for (const index of world.map.buildings[
          world.map.doors[spot.entry.door].building
        ].doors) {
          const s = world.map.doors[index];
          if (s.interior) continue;
          const d = Math.hypot(s.x - bot.x, s.y - bot.y);
          if (d < bestD) {
            bestD = d;
            bestDoor = index;
          }
        }
        r.otherDoor = bestDoor !== spot.entry.door;
      }
    }
    r.rooms = seenRooms.size;
    r.roomsSeen = [...seenRooms].join('/');
    return r;
  });
}

interface Side {
  runs: Run[];
}

function report(name: string, s: Side): void {
  const n = s.runs.length;
  const out = s.runs.filter((r) => r.gotOut);
  console.log(`  ${name}`);
  console.log(`    got out of the building   ${out.length}/${n}`);
  console.log(`    …by a door other than the pack's  ${out.filter((r) => r.otherDoor).length}/${n}`);
  console.log(`    …after                    ${f1(med(out.map((r) => r.outAt)))}s (median)`);
  console.log(`    still an officer at the end  ${s.runs.filter((r) => r.alive).length}/${n}`);
  console.log(`    ticks with a hand on it   ${sum(s.runs.map((r) => r.grabbed))}`);
  console.log(`    ticks in a dead-end room  ${sum(s.runs.map((r) => r.deadEnd))}`);
  console.log(`    rooms walked through, med ${med(s.runs.map((r) => r.rooms))}`);
  console.log(`    ground covered, median    ${f1(med(s.runs.map((r) => r.travelled)))}px`);
  console.log(`    ticks stopped with them on it  ${sum(s.runs.map((r) => r.pinned))}`);
  console.log(`    closest one ever got, med ${f1(med(s.runs.map((r) => r.closest)))}px`);
}

let failed = 0;
function check(ok: boolean, label: string, detail: string): void {
  if (!ok) failed++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label} — ${detail}`);
}

/**
 * How many cities a gain has to be measured over before it is asserted on.
 *
 * The map is not seeded and roughly a third of them have no building with two
 * ways out at all, so a short run is a lottery: the same code read 3/7 -> 3/7
 * on eight cities and 11/49 -> 19/49 on sixty-four. Below this the table is
 * printed and nothing is claimed, which is the honest answer rather than a
 * pass or a fail on a sample that cannot support either.
 */
const ASSERT_MIN = 30;

setCityPopulation(500);
console.log(`botrooms: ${RUNS} cities, ${TICKS} ticks each, ${PACK} in through one door\n`);

const older: Side = { runs: [] };
const newer: Side = { runs: [] };
let staged = 0;
for (let i = 0; i < RUNS; i++) {
  const seed = 20260901 + i * 7919;
  const trace = TRACE && (process.env.TRACE_RUN === undefined || Number(process.env.TRACE_RUN) === i);
  if (trace) console.log(`  seed ${seed}, old:`);
  const a = run(seed, true, trace);
  if (trace) console.log(`  seed ${seed}, new:`);
  const b = run(seed, false, trace);
  if (!a || !b) continue;
  staged++;
  if (process.env.VERBOSE === '1') {
    const f = (r: Run): string => `out=${r.gotOut?r.outAt.toFixed(1)+'s':'no'} alive=${r.alive} gap0=${r.startGap.toFixed(0)} grab@${r.firstGrab} plan=${r.planned} rooms=${r.roomsSeen} trav=${r.travelled.toFixed(0)}`;
    console.log(`  seed ${seed}
    old ${f(a)}
    new ${f(b)}`);
  }
  older.runs.push(a);
  newer.runs.push(b);
}
setBotIgnoresRooms(false);

console.log(`\nstaged ${staged} of ${RUNS} cities\n`);
report('OLD — no room graph indoors', older);
console.log('');
report('NEW', newer);
console.log('');

const outOld = older.runs.filter((r) => r.gotOut).length;
const outNew = newer.runs.filter((r) => r.gotOut).length;
const doorOld = older.runs.filter((r) => r.otherDoor).length;
const doorNew = newer.runs.filter((r) => r.otherDoor).length;
const aliveOld = older.runs.filter((r) => r.alive).length;
const aliveNew = newer.runs.filter((r) => r.alive).length;

check(
  staged >= Math.floor(RUNS / 2),
  'the staging is the report',
  `${staged}/${RUNS} cities had a building with two ways out, rooms apart`,
);
if (staged < ASSERT_MIN) {
  console.log(
    `  ..   too few cities to claim anything — ${staged} of the ${ASSERT_MIN} a gain is asserted over. Re-run with RUNS=64.`,
  );
} else {
check(outNew > outOld, 'it gets out of the building', `${outOld}/${staged} -> ${outNew}/${staged}`);
check(doorNew > doorOld, 'and by a door the pack is not in', `${doorOld} -> ${doorNew}`);
check(aliveNew >= aliveOld, 'and it is still an officer at the end', `${aliveOld}/${staged} -> ${aliveNew}/${staged}`);
check(
  sum(newer.runs.map((r) => r.deadEnd)) <= sum(older.runs.map((r) => r.deadEnd)),
  'and not by way of a cupboard',
  `${sum(older.runs.map((r) => r.deadEnd))} -> ${sum(newer.runs.map((r) => r.deadEnd))} ticks in a one-door room`,
);
check(
  med(newer.runs.map((r) => r.travelled)) > med(older.runs.map((r) => r.travelled)) * 0.8,
  'the control: it did not simply stop moving',
  `${f1(med(older.runs.map((r) => r.travelled)))} -> ${f1(med(newer.runs.map((r) => r.travelled)))}px`,
);
}

console.log(`\n${failed === 0 ? 'all checks passed' : `${failed} FAILED`}`);
