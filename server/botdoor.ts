/**
 * Headless check on two reports about bot officers and doors:
 *
 *  - *"bot officers going up to doors and then walking away from them not
 *    opening them"*
 *  - *"he didn't leave through the door when zombies came in, he just stood
 *    next to the door even though he can open it instantly"*
 *
 * No socket, no port, so it leaves a game on 8080 alone.
 *   npx tsx botdoor.ts
 *   RUNS=10 npx tsx botdoor.ts
 *
 * Both behaviours run in ONE process, alternating city by city, on the same
 * staged geometry. `setBotForgetsItsFootsteps` is the gate and it is kept:
 * "the bot got out" means nothing at all without "and it did not before".
 *
 * **The clock has to start where the world's does.** `resetWorld` stamps every
 * fresh AiState with `Date.now()`, so a rig starting its own clock at 10000
 * leaves `nextSenseAt` fifty-six years out and the bot perceives nothing at
 * all — which reads exactly like the bug under test. Same trap as botkite.ts.
 *
 * Not typechecked by `npx tsc --noEmit` in `server/`, which only includes
 * `src`. Check it explicitly:
 *   npx tsc --noEmit --target ES2022 --module ESNext --moduleResolution Bundler
 *     --strict --skipLibCheck --types node botdoor.ts
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
import { computeFrozen, updateAi, setBotForgetsItsFootsteps } from './src/ai.js';
import { doorRect } from './src/doors.js';
import {
  TICK_RATE,
  PATH_NODE_BUDGET_PER_TICK,
  ZOMBIE_RADIUS,
  BOT_BOLT_DIST,
} from '../shared/constants.js';

const TICK_MS = 1000 / TICK_RATE;
const RUNS = Number(process.env.RUNS ?? 10);
const TICKS = Number(process.env.TICKS ?? 400);
/**
 * Where the pinned zombie stands: past BOT_BOLT_DIST (120) so the bot does not
 * turn and run, and inside `backAt` so it gives ground instead. A bolt goes
 * through `step` and was never the broken case.
 */
const KITE_GAP = 230;

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
 * **Both modes get the same city, and this is not optional.**
 *
 * `resetWorld` generates a fresh unseeded map and `populate` rolls a fresh set
 * of traits, so alternating the two behaviours run by run measures the city
 * rather than the code — this rig read OLD at 5/24 on one run and 13/24 on the
 * next with nothing changed in between. Stubbing `Math.random` for the length
 * of the staging is what pins the map, the doors, the traits and the spawn.
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

/** One bot, an empty city, and every door shut. */
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
  // Everything shut, so "did it open one" is a question with one answer.
  for (const d of world.doors) {
    if (!d) continue;
    d.open = false;
    d.locked = false;
  }
  // **One known gun, because the band this is staged in is derived from it.**
  // `backAt` is `min(botIdealRange * 0.8, NPC_OFFICER_RETREAT_DIST)`, so the
  // starting item `populate` rolls decides whether KITE_GAP is a range the bot
  // gives ground at or one it walks *in* from. Left to the roll, most runs had
  // it closing on the zombie and the rig was measuring an advance.
  const inv = world.inventories.get('bot-0');
  if (!inv) throw new Error('bot-0 has no inventory');
  for (let i = 0; i < inv.guns.length; i++) inv.guns[i] = null;
  inv.guns[1] = { item: 'boltRifle', ammo: 200 };
  inv.activeSlot = 1;

  rebuildEntityGrid(world);
  return { world, bot };
}

interface Spot {
  index: number;
  /** Unit normal pointing from the slab into the building. */
  nx: number;
  ny: number;
  x: number;
  y: number;
}

/**
 * An exterior door with room to stand on both sides of it.
 *
 * Found rather than assumed: the map is not seeded, and a rig staged at a fixed
 * spot reports the city rather than the code — the lesson `acidcheck` and
 * `deathcheck` have each already paid for once.
 */
function doorway(world: World, deep: number, out = 90): Spot | null {
  const specs = world.map.doors;
  // In index order rather than shuffled, so the same city hands both modes the
  // same door — see `paired`.
  for (let index = 0; index < specs.length; index++) {
    const spec = specs[index];
    if (spec.interior) continue;
    const runtime = world.doors[index];
    if (!runtime) continue;
    const sign = runtime.insideSign;
    if (sign === 0) continue;
    const nx = spec.horiz ? 0 : sign;
    const ny = spec.horiz ? sign : 0;

    let ok = true;
    for (let d = 30; d <= deep && ok; d += 15) {
      const ix = spec.x + nx * d;
      const iy = spec.y + ny * d;
      if (world.nav.isBlocked(ix, iy) || buildingIndexAt(world, ix, iy) !== spec.building) ok = false;
    }
    for (let d = 30; d <= out && ok; d += 15) {
      const ox = spec.x - nx * d;
      const oy = spec.y - ny * d;
      if (world.nav.isBlocked(ox, oy) || buildingIndexAt(world, ox, oy) >= 0) ok = false;
    }
    if (!ok) continue;
    return { index, nx, ny, x: spec.x, y: spec.y };
  }
  return null;
}

/** Is the body pressed against the slab it should be opening? */
function onTheSlab(world: World, index: number, e: Entity): boolean {
  const rect = doorRect(world.map.doors[index]);
  const cx = Math.max(rect.x, Math.min(e.x, rect.x + rect.w));
  const cy = Math.max(rect.y, Math.min(e.y, rect.y + rect.h));
  return Math.hypot(e.x - cx, e.y - cy) < e.radius + 6;
}

interface Out {
  /** The door came open at all. */
  opened: boolean;
  /** …and the bot ended up where it was trying to get to. */
  through: boolean;
  /** It got to the door at all — the denominator "opened" means anything against. */
  reached: boolean;
  /** Ticks spent pressed against the slab with it still shut. */
  onSlab: number;
  secs: number;
  /**
   * Degrees between `state.heading` — the field `doorInTheWay` probes along
   * for a slab across the next step — and the direction the body actually
   * moved. Zero is the claim; anything else is a door test looking the wrong
   * way.
   */
  drift: number[];
}

/**
 * **Backed into a door.** A bot in the street with its back to a shut front
 * door and a zombie pressing it from the other side, at a range inside the
 * band where it gives ground and outside the one where it turns and runs.
 *
 * That band is the whole point. A *bolt* goes through `step`, which keeps
 * `state.heading` honest, so the bug never showed there; giving ground moves
 * the body by hand and the fight branch above it was overwriting the same field
 * with where the gun was pointing. The zombie is pinned on the line through the
 * door so "away from it" is "at the door", and unkillable, or the run ends the
 * moment the only mode that can shoot lands enough rounds — which is
 * `botkite.ts`'s lesson, and here it would end the run in the mode under test
 * first.
 */
function giveGroundRun(seed: number): Out | null {
  const { world, bot } = withSeed(seed, stagedWorld);
  const spot = doorway(world, 120, 330);
  if (!spot) return null;

  bot.x = spot.x - spot.nx * 60;
  bot.y = spot.y - spot.ny * 60;
  // **Facing the zombie to start with, which is the case being described.**
  // Left on whatever `populate` rolled, a bot whose heading happened to point
  // at the door opened it on the first tick before it had perceived anything —
  // measured, 14 of 24 of the old behaviour's opens were that, and none of them
  // is the reported moment.
  const toZombie = Math.atan2(-spot.ny, -spot.nx);
  bot.facing = toZombie;
  const state = world.ai.get('bot-0');
  if (state) {
    state.heading = toZombie;
    state.lastX = bot.x;
    state.lastY = bot.y;
    state.wanderX = bot.x;
    state.wanderY = bot.y;
  }

  const z = makeEntity('chaser', 'zombie', bot.x, bot.y);
  z.radius = ZOMBIE_RADIUS;
  z.health = 1e9;
  z.maxHealth = 1e9;
  world.entities.set('chaser', z);
  world.ai.delete('chaser');

  const out: Out = { opened: false, reached: false, through: false, onSlab: 0, secs: 0, drift: [] };
  // **Read the clock after staging, not once for the whole rig.** `resetWorld`
  // stamps every fresh AiState with the real `Date.now()`, and a run takes a
  // second or two of wall time — so a single `now0` taken at the top drifts
  // behind the real clock by more than a run is long, and by the third city the
  // bot's `nextSenseAt` is in the rig's future for the whole run. It perceives
  // nothing, stands there, and that reads exactly like the bug under test.
  // Measured that way: seeds that plainly worked one at a time came back
  // "never reached the door" inside the rig.
  let now = Date.now();
  for (let i = 0; i < TICKS; i++) {
    // Out in the street on the line through the door, far enough not to be
    // bolted from and near enough to be given ground to.
    z.x = bot.x - spot.nx * KITE_GAP;
    z.y = bot.y - spot.ny * KITE_GAP;
    z.facing = Math.atan2(spot.ny, spot.nx);

    const wasX = bot.x;
    const wasY = bot.y;
    now += TICK_MS;
    tick(world, now, TICK_MS / 1000);

    // Where the legs actually went, against the field every door test reads.
    const moved = Math.hypot(bot.x - wasX, bot.y - wasY);
    const st = world.ai.get('bot-0');
    if (moved > 0.5 && st && !st.bolting) {
      const went = Math.atan2(bot.y - wasY, bot.x - wasX);
      let d = st.heading - went;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      out.drift.push((Math.abs(d) * 180) / Math.PI);
    }

    const door = world.doors[spot.index];
    if (door && door.open && !out.opened) {
      out.opened = true;
      out.secs = ((i + 1) * TICK_MS) / 1000;
    }
    if (!out.opened) {
      if (onTheSlab(world, spot.index, bot)) out.onSlab++;
      if (Math.hypot(spot.x - bot.x, spot.y - bot.y) < 46) out.reached = true;
    }
    if (buildingIndexAt(world, bot.x, bot.y) === world.map.doors[spot.index].building) {
      out.through = true;
      break;
    }
  }
  return out;
}

/**
 * **A door on the way to something.** A bot in the street, a rifle lying in the
 * room behind a shut door, and nothing else alive in the city.
 */
function wayInRun(seed: number): Out | null {
  const { world, bot } = withSeed(seed, stagedWorld);
  const spot = doorway(world, 150);
  if (!spot) return null;

  bot.x = spot.x - spot.nx * 70;
  bot.y = spot.y - spot.ny * 70;
  const state = world.ai.get('bot-0');
  if (state) {
    state.lastX = bot.x;
    state.lastY = bot.y;
    state.wanderX = bot.x;
    state.wanderY = bot.y;
  }

  world.pickups.clear();
  world.pickups.set('bait', {
    id: 'bait',
    item: 'sniper',
    x: spot.x + spot.nx * 120,
    y: spot.y + spot.ny * 120,
  });

  const out: Out = { opened: false, reached: false, through: false, onSlab: 0, secs: 0, drift: [] };
  // **Read the clock after staging, not once for the whole rig.** `resetWorld`
  // stamps every fresh AiState with the real `Date.now()`, and a run takes a
  // second or two of wall time — so a single `now0` taken at the top drifts
  // behind the real clock by more than a run is long, and by the third city the
  // bot's `nextSenseAt` is in the rig's future for the whole run. It perceives
  // nothing, stands there, and that reads exactly like the bug under test.
  // Measured that way: seeds that plainly worked one at a time came back
  // "never reached the door" inside the rig.
  let now = Date.now();
  for (let i = 0; i < TICKS; i++) {
    now += TICK_MS;
    tick(world, now, TICK_MS / 1000);
    const door = world.doors[spot.index];
    if (door && door.open && !out.opened) {
      out.opened = true;
      out.secs = ((i + 1) * TICK_MS) / 1000;
    }
    if (!out.opened) {
      if (onTheSlab(world, spot.index, bot)) out.onSlab++;
      if (Math.hypot(spot.x - bot.x, spot.y - bot.y) < 46) out.reached = true;
    }
    if (buildingIndexAt(world, bot.x, bot.y) === world.map.doors[spot.index].building) {
      out.through = true;
      break;
    }
  }
  return out;
}

function report(label: string, rows: Out[]): void {
  const opened = rows.filter((r) => r.opened).length;
  const through = rows.filter((r) => r.through).length;
  const secs = rows.filter((r) => r.opened).map((r) => r.secs);
  const drift = rows.flatMap((r) => r.drift);
  const reached = rows.filter((r) => r.reached || r.opened).length;
  console.log(
    `  ${label}  reached the door ${reached}/${rows.length}   opened it ${opened}/${rows.length}` +
      `   went through ${through}/${rows.length}` +
      `   median ${f1(med(secs))}s` +
      `   ticks on the slab ${rows.reduce((a, r) => a + r.onSlab, 0)}` +
      (drift.length > 0
        ? `   heading off its own footsteps ${f1(med(drift))}deg (n=${drift.length})`
        : ''),
  );
}

const shutIn: Record<string, Out[]> = { OLD: [], NEW: [] };
const wayIn: Record<string, Out[]> = { OLD: [], NEW: [] };
let skipped = 0;

for (let run = 0; run < RUNS; run++) {
  for (const mode of ['OLD', 'NEW'] as const) {
    setBotForgetsItsFootsteps(mode === 'OLD');
    const a = giveGroundRun(8000 + run);
    if (a) shutIn[mode].push(a);
    else skipped++;
    if (a && process.env.PERRUN) {
      console.log(
        `   seed ${8000 + run} ${mode}  reached=${a.reached} opened=${a.opened}` +
          ` through=${a.through} slab=${a.onSlab}`,
      );
    }
    const b = wayInRun(9000 + run);
    if (b) wayIn[mode].push(b);
    else skipped++;
  }
}

console.log(`
backed into a shut front door by a zombie  (${RUNS} cities each)`);
report('OLD', shutIn.OLD);
report('NEW', shutIn.NEW);
console.log(`
a rifle behind a shut door, nothing else alive (the control)  (${RUNS} cities each)`);
report('OLD', wayIn.OLD);
report('NEW', wayIn.NEW);
if (skipped > 0) console.log(`
(${skipped} stagings skipped: no exterior door with room on both sides)`);
