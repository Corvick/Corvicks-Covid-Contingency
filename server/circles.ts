/**
 * Headless check on *"I see them go in circles sometimes as if they are stuck"*
 * — a bot officer orbiting the corner of a building it was trying to loot, and
 * a grey officer orbiting on the spot after an RTS move order to a far part of
 * the map.
 *
 * No socket, no port, so it leaves a game on 8080 alone.
 *   npx tsx circles.ts
 *   RUNS=12 npx tsx circles.ts
 *
 * Both behaviours run in ONE process on the same seeded city, and
 * `setLegacyRouting` is the gate, kept because the control is the whole value
 * of the run.
 *
 * **What is being measured is travel without progress**, which is not what
 * `unstickTick` measures. That checks displacement over one 420ms window, and a
 * body going round a 15px circle at 115px/s is most of the way round it by then
 * — so an orbit passes the stuck test on every check and runs for the whole
 * round. The reading here is a rolling window: ground covered against ground
 * gained.
 *
 * Not typechecked by `npx tsc --noEmit` in `server/`, which only includes
 * `src`. Check it explicitly:
 *   npx tsc --noEmit --target ES2022 --module ESNext --moduleResolution Bundler
 *     --strict --skipLibCheck --types node circles.ts
 */
import {
  createWorld,
  resetWorld,
  rebuildNav,
  rebuildEntityGrid,
  resolveCollisions,
  buildingIndexAt,
  type World,
  type Entity,
} from './src/world.js';
import { computeFrozen, updateAi, setLegacyRouting } from './src/ai.js';
import {
  TICK_RATE,
  PATH_NODE_BUDGET_PER_TICK,
  COMMAND_ARRIVE_DIST,
  setCityPopulation,
} from '../shared/constants.js';

const TICK_MS = 1000 / TICK_RATE;
const RUNS = Number(process.env.RUNS ?? 12);
const TICKS = Number(process.env.TICKS ?? 1800); // 60s

/**
 * The rolling window a lap is judged over, and what counts as going nowhere.
 *
 * **Relative, not a pixel figure**, and the first version was not: a grey
 * officer walks at 40px/s where a bot walks at 115, so "200px in three seconds"
 * is a threshold the officer cannot reach even at a dead sprint in a straight
 * line — it scored 0 circling ticks on a body doing nothing else. What is being
 * asked is what share of the ground covered actually stuck.
 */
const WINDOW_TICKS = 90; // 3s
/** Below this it is standing still, which is a different complaint. */
const WINDOW_MIN_TRAVEL = 45;
/** Ground kept, as a share of ground covered. A straight line is 1. */
const WINDOW_KEPT = 0.3;

const f1 = (n: number): string => n.toFixed(1);
function med(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = xs.slice().sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

function tick(world: World, now: number, dt: number): void {
  world.pathBudget = PATH_NODE_BUDGET_PER_TICK;
  if (world.navDirty) rebuildNav(world);
  rebuildEntityGrid(world);
  updateAi(world, now, dt, computeFrozen(world));
  resolveCollisions(world);
}

/**
 * Both modes get the same city. `resetWorld` generates a fresh unseeded map and
 * `populate` rolls fresh traits, so alternating run by run measures the city and
 * not the code — the trap `botdoor.ts` records.
 */
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

/** A city with nothing alive in it but the officers it started with. */
function stagedWorld(): World {
  const world = createWorld();
  world.botOfficerCount = 0;
  resetWorld(world);
  for (const [id, e] of [...world.entities]) {
    if (e.type === 'officer' && world.cityOfficers.has(id)) continue;
    world.entities.delete(id);
    world.ai.delete(id);
  }
  world.pickups.clear();
  rebuildEntityGrid(world);
  return world;
}

interface Lap {
  /** Ticks inside a window of plenty of walking and almost no progress. */
  circling: number;
  ticks: number;
  /** Ground covered, and how much of it stuck. */
  travelled: number;
  gained: number;
  /** It got where it was sent. */
  arrived: boolean;
  /** Ticks with no route at all, so `slideToward` was steering. */
  pathless: number;
}

function blank(): Lap {
  return { circling: 0, ticks: 0, travelled: 0, gained: 0, arrived: false, pathless: 0 };
}

/** Walk the trail and count the ticks that sit inside a going-nowhere window. */
function scoreTrail(trail: Array<{ x: number; y: number }>, out: Lap): void {
  for (let i = WINDOW_TICKS; i < trail.length; i++) {
    let travel = 0;
    for (let j = i - WINDOW_TICKS + 1; j <= i; j++) {
      travel += Math.hypot(trail[j].x - trail[j - 1].x, trail[j].y - trail[j - 1].y);
    }
    const gained = Math.hypot(trail[i].x - trail[i - WINDOW_TICKS].x, trail[i].y - trail[i - WINDOW_TICKS].y);
    if (travel >= WINDOW_MIN_TRAVEL && gained <= travel * WINDOW_KEPT) out.circling++;
  }
}

/**
 * **A grey officer sent across the city**, which is the reported case: a far
 * target, not an unreachable one. The route is the length of the map and the
 * search runs out of nodes long before it finds the end.
 */
function commandRun(seed: number): Lap | null {
  const world = withSeed(seed, stagedWorld);
  let officer: Entity | null = null;
  for (const [id, e] of world.entities) {
    if (e.type === 'officer' && world.cityOfficers.has(id)) {
      officer = e;
      break;
    }
  }
  if (!officer) return null;
  const state = world.ai.get(officer.id);
  if (!state) return null;

  // The far corner of the map from wherever it happens to be standing, nudged
  // onto ground it could stand on.
  const tx = officer.x < world.map.width / 2 ? world.map.width - 300 : 300;
  const ty = officer.y < world.map.height / 2 ? world.map.height - 300 : 300;
  if (world.nav.isBlocked(tx, ty) || !world.nav.isReachable(tx, ty)) return null;
  state.commandX = tx;
  state.commandY = ty;

  const out = blank();
  const trail: Array<{ x: number; y: number }> = [{ x: officer.x, y: officer.y }];
  const startX = officer.x;
  const startY = officer.y;
  let now = Date.now();
  for (let i = 0; i < TICKS; i++) {
    const wasX = officer.x;
    const wasY = officer.y;
    now += TICK_MS;
    tick(world, now, TICK_MS / 1000);
    out.ticks++;
    out.travelled += Math.hypot(officer.x - wasX, officer.y - wasY);
    trail.push({ x: officer.x, y: officer.y });
    if (state.path === null) out.pathless++;
    if (Math.hypot(tx - officer.x, ty - officer.y) <= COMMAND_ARRIVE_DIST) {
      out.arrived = true;
      break;
    }
  }
  out.gained = Math.hypot(officer.x - startX, officer.y - startY);
  scoreTrail(trail, out);
  return out;
}

/**
 * **A bot walking to a rifle in the deepest room of the corner complex.**
 *
 * Staged there rather than in an ordinary house because that is the route the
 * search cannot finish: a landmark is a dozen-odd rooms of twisting corridor,
 * which is exactly what `PATH_MAX_NODES` was measured to fail at (84.5% of
 * random cross-map routes found), and a failed search is what hands the walk to
 * `slideToward`. An ordinary block is one undivided room and the route to it is
 * a straight line, so it exercises none of this — the first version of this rig
 * staged one and read the two modes identically.
 */
function lootRun(seed: number): Lap | null {
  const world = withSeed(seed, () => {
    const w = createWorld();
    w.botOfficerCount = 1;
    resetWorld(w);
    for (const [id, e] of [...w.entities]) {
      if (id === 'bot-0') continue;
      w.entities.delete(id);
      w.ai.delete(id);
    }
    w.cityOfficers.clear();
    w.pickups.clear();
    rebuildEntityGrid(w);
    return w;
  });
  const bot = world.entities.get('bot-0');
  const state = world.ai.get('bot-0');
  if (!bot || !state) return null;

  const complex = world.map.cornerBuilding;
  let deepest = -1;
  let deepestDepth = -1;
  for (let i = 0; i < world.rooms.rooms.length; i++) {
    const room = world.rooms.rooms[i];
    if (room.building !== complex) continue;
    if (!Number.isFinite(room.depth) || room.depth <= deepestDepth) continue;
    const spot = world.rooms.randomPoint(i);
    if (!spot || !world.nav.isReachable(spot.x, spot.y)) continue;
    deepestDepth = room.depth;
    deepest = i;
  }
  if (deepest < 0) return null;
  const at = world.rooms.randomPoint(deepest);
  if (!at) return null;

  // In the street outside the complex, and inside BOT_LOOT_RANGE of the rifle
  // or the bot will not want it.
  const b = world.map.buildings[complex];
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  let stand: { x: number; y: number } | null = null;
  for (let r = 60; r <= 420 && !stand; r += 30) {
    for (let i = 0; i < 24 && !stand; i++) {
      const t = (i / 24) * Math.PI * 2;
      const x = cx + Math.cos(t) * (b.w / 2 + r);
      const y = cy + Math.sin(t) * (b.h / 2 + r);
      if (x < 60 || y < 60 || x > world.map.width - 60 || y > world.map.height - 60) continue;
      if (world.nav.isBlocked(x, y) || !world.nav.isReachable(x, y)) continue;
      if (buildingIndexAt(world, x, y) >= 0) continue;
      if (Math.hypot(x - at.x, y - at.y) > 1200) continue;
      stand = { x, y };
    }
  }
  if (!stand) return null;
  bot.x = stand.x;
  bot.y = stand.y;
  state.lastX = bot.x;
  state.lastY = bot.y;
  state.unstickX = bot.x;
  state.unstickY = bot.y;
  state.wanderX = bot.x;
  state.wanderY = bot.y;
  world.pickups.set('bait', { id: 'bait', item: 'sniper', x: at.x, y: at.y });
  rebuildEntityGrid(world);

  const out = blank();
  const trail: Array<{ x: number; y: number }> = [{ x: bot.x, y: bot.y }];
  const startX = bot.x;
  const startY = bot.y;
  let now = Date.now();
  for (let i = 0; i < TICKS; i++) {
    const wasX = bot.x;
    const wasY = bot.y;
    now += TICK_MS;
    tick(world, now, TICK_MS / 1000);
    out.ticks++;
    out.travelled += Math.hypot(bot.x - wasX, bot.y - wasY);
    trail.push({ x: bot.x, y: bot.y });
    if (state.path === null) out.pathless++;
    if (!world.pickups.has('bait')) {
      out.arrived = true;
      break;
    }
  }
  out.gained = Math.hypot(bot.x - startX, bot.y - startY);
  scoreTrail(trail, out);
  return out;
}

/**
 * **A whole round, and every officer in it.**
 *
 * The staged runs above pin one body on one errand, which is what makes them
 * decisive and also what makes them narrow — a bot orbiting a corner needs a
 * route that fails, and which routes fail is the city's business. So this one
 * just runs a city and counts, across every officer alive, the ticks each
 * spends inside a window of walking with nothing to show for it.
 *
 * Paired: the same seeded city is built twice and run once in each mode, since
 * how far the outbreak gets dominates everything and two unseeded runs are not
 * comparable.
 */
function liveRun(seed: number): { circling: number; ticks: number; worst: number } {
  const world = withSeed(seed, () => {
    const w = createWorld();
    w.botOfficerCount = 4;
    resetWorld(w);
    return w;
  });

  const trails = new Map<string, Array<{ x: number; y: number }>>();
  let circling = 0;
  let ticks = 0;
  let worst = 0;
  const runs = new Map<string, number>();

  let now = Date.now();
  for (let i = 0; i < LIVE_TICKS; i++) {
    now += TICK_MS;
    tick(world, now, TICK_MS / 1000);

    for (const [id, e] of world.entities) {
      if (e.type !== 'officer') continue;
      let trail = trails.get(id);
      if (!trail) {
        trail = [];
        trails.set(id, trail);
      }
      trail.push({ x: e.x, y: e.y });
      if (trail.length <= WINDOW_TICKS) continue;
      if (trail.length > WINDOW_TICKS + 1) trail.shift();
      ticks++;
      let travel = 0;
      for (let j = 1; j < trail.length; j++) {
        travel += Math.hypot(trail[j].x - trail[j - 1].x, trail[j].y - trail[j - 1].y);
      }
      const gained = Math.hypot(
        trail[trail.length - 1].x - trail[0].x,
        trail[trail.length - 1].y - trail[0].y,
      );
      if (travel >= WINDOW_MIN_TRAVEL && gained <= travel * WINDOW_KEPT) {
        circling++;
        const run = (runs.get(id) ?? 0) + 1;
        runs.set(id, run);
        if (run > worst) worst = run;
      } else {
        runs.set(id, 0);
      }
    }
  }
  return { circling, ticks, worst };
}

function report(label: string, rows: Lap[]): void {
  const ticks = rows.reduce((a, r) => a + r.ticks, 0);
  const circling = rows.reduce((a, r) => a + r.circling, 0);
  const pathless = rows.reduce((a, r) => a + r.pathless, 0);
  const arrived = rows.filter((r) => r.arrived).length;
  const spinners = rows.filter((r) => r.circling > 60).length;
  console.log(
    `  ${label}  arrived ${arrived}/${rows.length}` +
      `   runs that spent >2s going nowhere ${spinners}/${rows.length}` +
      `   ticks going nowhere ${circling} of ${ticks} (${((circling / Math.max(1, ticks)) * 100).toFixed(1)}%)` +
      `   no route ${((pathless / Math.max(1, ticks)) * 100).toFixed(0)}%` +
      `   median ground kept ${f1(med(rows.map((r) => (r.travelled > 0 ? r.gained / r.travelled : 0))))}`,
  );
}

/** Ticks of the live round, and how big a city it runs. */
const LIVE_TICKS = Number(process.env.LIVE_TICKS ?? 2700); // 90s
const LIVE_RUNS = Number(process.env.LIVE_RUNS ?? 4);
const LIVE_POP = Number(process.env.LIVE_POP ?? 200);

const command: Record<string, Lap[]> = { OLD: [], NEW: [] };
const loot: Record<string, Lap[]> = { OLD: [], NEW: [] };
let skipped = 0;

for (let run = 0; run < RUNS; run++) {
  for (const mode of ['OLD', 'NEW'] as const) {
    setLegacyRouting(mode === 'OLD');
    const a = commandRun(5000 + run);
    if (a) command[mode].push(a);
    else skipped++;
    const b = lootRun(6000 + run);
    if (b) loot[mode].push(b);
    else skipped++;
  }
}

console.log(`\na grey officer ordered to the far corner of the map  (${RUNS} cities each)`);
report('OLD', command.OLD);
report('NEW', command.NEW);
console.log(`\na bot after a rifle in the deepest room of the corner complex  (${RUNS} cities each)`);
report('OLD', loot.OLD);
report('NEW', loot.NEW);
if (skipped > 0) console.log(`\n(${skipped} stagings skipped)`);

setCityPopulation(LIVE_POP);
const live: Record<string, { circling: number; ticks: number; worst: number }> = {
  OLD: { circling: 0, ticks: 0, worst: 0 },
  NEW: { circling: 0, ticks: 0, worst: 0 },
};
for (let run = 0; run < LIVE_RUNS; run++) {
  for (const mode of ['OLD', 'NEW'] as const) {
    setLegacyRouting(mode === 'OLD');
    const r = liveRun(7000 + run);
    live[mode].circling += r.circling;
    live[mode].ticks += r.ticks;
    live[mode].worst = Math.max(live[mode].worst, r.worst);
  }
}
console.log(
  `
a live round, every officer in it  (${LIVE_RUNS} cities each, ${LIVE_POP} civilians, ${(LIVE_TICKS / TICK_RATE) | 0}s)`,
);
for (const mode of ['OLD', 'NEW'] as const) {
  const r = live[mode];
  console.log(
    `  ${mode}  officer-ticks going nowhere ${r.circling} of ${r.ticks}` +
      ` (${((r.circling / Math.max(1, r.ticks)) * 100).toFixed(2)}%)` +
      `   longest unbroken spell ${(r.worst / TICK_RATE).toFixed(1)}s`,
  );
}
