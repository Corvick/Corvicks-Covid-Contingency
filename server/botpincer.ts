/**
 * Headless check on *"bot officers are indecisive when two or more large groups
 * of zombies are converging on them, we need to allow them to pick a path to
 * thread between these groups or pick a safe path instead of jumping back and
 * forth until the last second or until it is too late"*.
 *
 * No socket, no port, so it leaves a game on 8080 alone.
 *   npx tsx botpincer.ts
 *   RUNS=48 npx tsx botpincer.ts
 *   PER=1 npx tsx botpincer.ts              # every city, every arm
 *   TRACE=5655 ARM=NEW npx tsx botpincer.ts # tick by tick, one city, one arm
 *
 * **Two gates, and they are kept.** `setBotIgnoresPincer` puts back the line a
 * bot gave ground along ("away from the one I am shooting"), and
 * `setOfficerTargetStickBroken` puts back the target stick that could never
 * hold a target. They are separate because one is where the legs go and the
 * other is where the gun points, and the arm with only the stick fixed is what
 * says how much of the result is which.
 *
 * **Every arm runs the same seeded city from the same start**, and the whole
 * run is inside the seed rather than only the staging — `botindoors.ts` records
 * what an unseeded tick loop does to a paired comparison.
 *
 * The staging is the report: a bot out in the street with a clear lane in some
 * third direction, and two packs of eight walking in on it from two others. The
 * packs **chase and cannot be shot down**, which is what makes the run about
 * where the bot went rather than how many it killed.
 *
 * Not typechecked by `npx tsc --noEmit` in `server/`, which only includes
 * `src`. Check it explicitly:
 *   npx tsc --noEmit --target ES2022 --module ESNext --moduleResolution Bundler
 *     --strict --skipLibCheck --types node botpincer.ts
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
import {
  computeFrozen,
  updateAi,
  setBotIgnoresPincer,
  setOfficerTargetStickBroken,
} from './src/ai.js';
import {
  TICK_RATE,
  setCityPopulation,
  PATH_NODE_BUDGET_PER_TICK,
  ZOMBIE_RADIUS,
} from '../shared/constants.js';
import type { ItemId } from '../shared/items.js';

const TICK_MS = 1000 / TICK_RATE;
const RUNS = Number(process.env.RUNS ?? 32);
const TICKS = Number(process.env.TICKS ?? 450); // 15s
const PER = process.env.PER === '1';
const TRACE = Number(process.env.TRACE ?? -1);
const TRACE_ARM = process.env.ARM ?? 'NEW';

/** How far out the packs start, and how many in each. */
const GAP = 440;
const PACK = 8;
/**
 * Inside this of both packs, with them on different sides, the bot is *between*
 * them — which is the only time turning round is the fault being reported. Out
 * past it, a bot kiting one pursuer at the edge of its own sight turns round
 * whenever the pursuer drops out of view, and that is a different behaviour
 * with nothing to do with two groups.
 */
const JAWS = 400;

const f1 = (n: number): string => n.toFixed(1);

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

/**
 * One bot, an empty city, one known gun and nothing else.
 *
 * The gun decides the band: a rifle's ideal range is its reach, so a bot holding
 * one never walks in and gives ground inside 360; a shotgun's is 170, so a bot
 * holding one walks *at* a pack and only gives ground once it is on it. Left to
 * `giveStartingItem`, the draw would decide which branch the run measured. The
 * vest comes off too, or "was it grabbed" reads as "did the vest have a charge
 * left".
 */
function stagedWorld(gun: ItemId): { world: World; bot: Entity } {
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
  const inv = world.inventories.get('bot-0');
  if (!inv) throw new Error('bot-0 has no inventory');
  for (let i = 0; i < inv.guns.length; i++) inv.guns[i] = null;
  inv.guns[1] = { item: gun, ammo: 400 };
  inv.activeSlot = 1;
  inv.utilities.length = 0;
  inv.kevlarUses.length = 0;
  rebuildEntityGrid(world);
  return { world, bot };
}

const open = (world: World, x: number, y: number): boolean =>
  !world.nav.isBlocked(x, y) && buildingIndexAt(world, x, y) < 0;

function laneClear(world: World, x: number, y: number, a: number, len: number): boolean {
  for (let d = 20; d <= len; d += 20) {
    if (!open(world, x + Math.cos(a) * d, y + Math.sin(a) * d)) return false;
  }
  return true;
}

const turn = (a: number, b: number): number => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

interface Spot {
  x: number;
  y: number;
  /** Bearings the packs come in on. */
  bearings: number[];
}

/**
 * A street with a clear lane down each pack's bearing — or the packs cannot see
 * the bot and nothing converges — and **a third clear lane away from both**.
 *
 * The third lane is a precondition rather than a nicety, and it is the same
 * argument `botindoors.ts` makes about its lane along the frontage: without
 * one the staging is a closed ring, the bot has genuinely nowhere to go, and
 * every arm reads the same because the city decided the run.
 */
function findSpot(world: World, spread: number, packs: number): Spot | null {
  for (let k = 0; k < 4000; k++) {
    const x = 300 + Math.random() * (world.map.width - 600);
    const y = 300 + Math.random() * (world.map.height - 600);
    if (!open(world, x, y) || !world.nav.isReachable(x, y)) continue;
    const a = Math.floor(Math.random() * 8) * (Math.PI / 4);
    const bearings = packs === 1 ? [a] : [a, a + spread];
    if (!bearings.every((b) => laneClear(world, x, y, b, GAP + 60))) continue;
    let third = false;
    for (let i = 0; i < 16 && !third; i++) {
      const c = (i / 16) * Math.PI * 2;
      if (bearings.some((b) => turn(c, b) < 0.9)) continue;
      if (laneClear(world, x, y, c, 360)) third = true;
    }
    if (!third) continue;
    return { x, y, bearings };
  }
  return null;
}

interface Run {
  /** Ticks with both packs inside `JAWS` and on different sides of the bot. */
  jaws: number;
  /** Turned round (over 115° in 200ms) while in them. The report, counted. */
  reversals: number;
  grabs: number;
  held: number;
  turned: boolean;
  /** Ended the run out of the jaws and still an officer. */
  gotOut: boolean;
  /** Ground covered, and how much of it was net — dithering covers a lot for nothing. */
  path: number;
  net: number;
  /** Ticks the bot's own latch said it was caught between packs. */
  latched: number;
  /** Furthest the nearest zombie was on any latched tick. */
  latchedFar: number;
  /** Milliseconds spent in the tick, and ticks run, for the cost row. */
  ms: number;
  ticks: number;
  /** Where it ended up, for the single-pack control. */
  endX: number;
  endY: number;
}

interface Arm {
  name: string;
  line: boolean;
  stick: boolean;
}

function run(seed: number, arm: Arm, gun: ItemId, spread: number, packs: number): Run | null {
  setBotIgnoresPincer(!arm.line);
  setOfficerTargetStickBroken(!arm.stick);
  return withSeed(seed, () => {
    const { world, bot } = stagedWorld(gun);
    const spot = findSpot(world, spread, packs);
    if (!spot) return null;
    bot.x = spot.x;
    bot.y = spot.y;
    const state = world.ai.get('bot-0');
    if (!state) throw new Error('bot-0 has no AiState');
    state.lastX = bot.x;
    state.lastY = bot.y;
    state.unstickX = bot.x;
    state.unstickY = bot.y;
    state.pauseUntil = 0;
    // It has seen them. Left to the staggered first perception tick it spends
    // half a second patrolling first, which is the rig's choice and not the bot's.
    state.nextSenseAt = 0;

    const groups: Entity[][] = [];
    let n = 0;
    for (const ang of spot.bearings) {
      const cx = spot.x + Math.cos(ang) * GAP;
      const cy = spot.y + Math.sin(ang) * GAP;
      const group: Entity[] = [];
      for (let i = 0; i < PACK; i++) {
        // A phyllotaxis clump, so every arm is handed the identical pack.
        const r = i === 0 ? 0 : 22 + 20 * Math.sqrt(i);
        const x = cx + Math.cos(i * 2.39996) * r;
        const y = cy + Math.sin(i * 2.39996) * r;
        if (world.nav.isBlocked(x, y)) continue;
        const z = makeEntity(`pack-${n++}`, 'zombie', x, y);
        z.radius = ZOMBIE_RADIUS;
        z.health = 1e9;
        z.maxHealth = 1e9;
        world.entities.set(z.id, z);
        group.push(z);
      }
      if (group.length < PACK - 2) return null;
      groups.push(group);
    }
    rebuildEntityGrid(world);

    // The clock has to start where the world's does — `resetWorld` stamps every
    // fresh AiState with the real `Date.now()`. See `botkite.ts`.
    let now = Date.now();
    const dt = TICK_MS / 1000;
    const out: Run = {
      jaws: 0,
      reversals: 0,
      grabs: 0,
      held: 0,
      turned: false,
      gotOut: false,
      path: 0,
      net: 0,
      latched: 0,
      latchedFar: 0,
      ms: 0,
      ticks: 0,
      endX: 0,
      endY: 0,
    };
    const x0 = bot.x;
    const y0 = bot.y;
    let wx = bot.x;
    let wy = bot.y;
    let windowJaws = false;
    let lastBearing: number | null = null;
    let wasHeld = false;
    let between = false;
    for (let i = 0; i < TICKS; i++) {
      now += TICK_MS;
      // A converted officer is still `bot-0` — see `botindoors.ts`.
      if (bot.type !== 'officer' || !world.entities.has(bot.id)) {
        out.turned = true;
        break;
      }
      const px = bot.x;
      const py = bot.y;
      const t0 = performance.now();
      tick(world, now, dt);
      out.ms += performance.now() - t0;
      out.ticks++;
      out.path += Math.hypot(bot.x - px, bot.y - py);
      const held = world.grapples.has(bot.id);
      if (held) out.held++;
      if (held && !wasHeld) out.grabs++;
      wasHeld = held;

      // Between them: both packs close, and on different sides of the bot.
      const near = groups.map((g) => {
        let best = Infinity;
        let bx = 0;
        let by = 0;
        for (const z of g) {
          const d = Math.hypot(z.x - bot.x, z.y - bot.y);
          if (d < best) {
            best = d;
            bx = z.x;
            by = z.y;
          }
        }
        return { d: best, a: Math.atan2(by - bot.y, bx - bot.x) };
      });
      between =
        near.length === 2 &&
        near[0].d < JAWS &&
        near[1].d < JAWS &&
        turn(near[0].a, near[1].a) > Math.PI / 2;
      if (between) out.jaws++;
      if (state.pincered) {
        out.latched++;
        out.latchedFar = Math.max(out.latchedFar, Math.min(...near.map((p) => p.d)));
      }
      windowJaws = windowJaws || between;

      if (i % 6 === 5) {
        const dx = bot.x - wx;
        const dy = bot.y - wy;
        wx = bot.x;
        wy = bot.y;
        // Only a window it actually walked in counts — standing still, or being
        // shoved a pixel by a grab, has no bearing to have turned from.
        if (Math.hypot(dx, dy) > 12) {
          const b = Math.atan2(dy, dx);
          if (lastBearing !== null && windowJaws && turn(b, lastBearing) > 2.0) out.reversals++;
          lastBearing = b;
        } else {
          lastBearing = null;
        }
        windowJaws = false;
      }

      if (seed === TRACE && arm.name === TRACE_ARM) {
        const target = world.entities.get(state.targetId ?? '');
        console.log(
          `t${i} (${f1(bot.x)},${f1(bot.y)}) between=${between} pin=${state.pincered} ` +
            `line=${state.pincerHeading?.toFixed(2) ?? '-'} bolt=${state.bolting} give=${state.botGiving} ` +
            `close=${state.botClosing} hd=${state.heading.toFixed(2)} threats=${state.threatPoints.length} ` +
            `target=${state.targetId ?? '-'}@${target ? f1(Math.hypot(target.x - bot.x, target.y - bot.y)) : '-'} ` +
            `packs=${near.map((p) => f1(p.d)).join('/')} held=${held}`,
        );
      }
    }
    out.gotOut = !out.turned && !between && !wasHeld;
    out.net = Math.hypot(bot.x - x0, bot.y - y0);
    out.endX = bot.x;
    out.endY = bot.y;
    return out;
  });
}

// ---------------------------------------------------------------- report

setCityPopulation(500);

const ARMS: Arm[] = [
  { name: 'OLD', line: false, stick: false },
  { name: 'stick', line: false, stick: true },
  { name: 'NEW', line: true, stick: true },
];

let failures = 0;
function check(ok: boolean, label: string): void {
  if (!ok) failures++;
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}`);
}

const sum = (rows: Run[], f: (r: Run) => number): number => rows.reduce((a, r) => a + f(r), 0);
const count = (rows: Run[], f: (r: Run) => boolean): number => rows.filter(f).length;

function band(name: string, gun: ItemId, spread: number): Run[][] {
  const tallies: Run[][] = ARMS.map(() => []);
  for (let s = 0; s < RUNS; s++) {
    const seed = 5000 + s * 131;
    const rows = ARMS.map((arm) => run(seed, arm, gun, spread, 2));
    if (rows.some((r) => r === null)) continue;
    const got = rows as Run[];
    got.forEach((r, i) => tallies[i].push(r));
    if (PER) {
      console.log(
        `  ${seed}  ` +
          got.map((r, i) => `${ARMS[i].name} rev ${r.reversals} grabs ${r.grabs}${r.turned ? ' TURNED' : ''}`).join('  |  '),
      );
    }
  }
  console.log(`\n=== ${name} — ${tallies[0].length} cities staged ===`);
  console.log(`  ${''.padEnd(34)} ${ARMS.map((a) => a.name.padStart(10)).join('')}`);
  const row = (label: string, f: (rows: Run[]) => string): void =>
    console.log(`  ${label.padEnd(34)} ${tallies.map((t) => f(t).padStart(10)).join('')}`);
  row('turned round while between them', (r) => String(sum(r, (x) => x.reversals)));
  row('...runs that did it at all', (r) => `${count(r, (x) => x.reversals > 0)}/${r.length}`);
  row('seconds spent between them', (r) => f1((sum(r, (x) => x.jaws) * TICK_MS) / 1000));
  row('grabbed', (r) => String(sum(r, (x) => x.grabs)));
  row('ticks with hands on it', (r) => String(sum(r, (x) => x.held)));
  row('turned', (r) => `${count(r, (x) => x.turned)}/${r.length}`);
  row('got out, still an officer', (r) => `${count(r, (x) => x.gotOut)}/${r.length}`);
  row('net ground / ground covered', (r) => (sum(r, (x) => x.net) / Math.max(1, sum(r, (x) => x.path))).toFixed(2));
  row('tick cost, ms (one bot, sixteen zombies)', (r) => (sum(r, (x) => x.ms) / Math.max(1, sum(r, (x) => x.ticks))).toFixed(3));
  row('ticks latched as caught between', (r) => String(sum(r, (x) => x.latched)));
  return tallies;
}

const bands: Array<{ name: string; gun: ItemId; spread: number }> = [
  // Most guns: a rifle's ideal range is its reach, so this is the kite band.
  { name: 'bolt action, two packs 150° apart', gun: 'boltRifle', spread: (150 * Math.PI) / 180 },
  { name: 'bolt action, two packs 180° apart', gun: 'boltRifle', spread: Math.PI },
  { name: 'bolt action, two packs 100° apart', gun: 'boltRifle', spread: (100 * Math.PI) / 180 },
  // A shotgun walks in, so the pincer is met from inside the closing branch.
  { name: 'shotgun, two packs 150° apart', gun: 'shotgun', spread: (150 * Math.PI) / 180 },
];

const all: Run[][] = ARMS.map(() => []);
for (const b of bands) {
  const t = band(b.name, b.gun, b.spread);
  t.forEach((rows, i) => all[i].push(...rows));
}

const oldR = all[0];
const newR = all[2];
console.log(`\n=== all bands — ${oldR.length} runs ===`);
check(
  sum(newR, (r) => r.reversals) * 2 <= sum(oldR, (r) => r.reversals),
  `turning round between the packs at least halved ` +
    `(${sum(oldR, (r) => r.reversals)} -> ${sum(newR, (r) => r.reversals)})`,
);
check(
  count(newR, (r) => r.turned) < count(oldR, (r) => r.turned),
  `fewer turned (${count(oldR, (r) => r.turned)} -> ${count(newR, (r) => r.turned)} of ${oldR.length})`,
);
check(
  sum(newR, (r) => r.grabs) < sum(oldR, (r) => r.grabs),
  `grabbed less often (${sum(oldR, (r) => r.grabs)} -> ${sum(newR, (r) => r.grabs)})`,
);
check(
  count(newR, (r) => r.gotOut) > count(oldR, (r) => r.gotOut),
  `more got out (${count(oldR, (r) => r.gotOut)} -> ${count(newR, (r) => r.gotOut)} of ${oldR.length})`,
);

/*
 * **The control: one pack.** The line is latched on the arc the threats take up,
 * so a single pack walking in from one side must not reach it — only the arc
 * the pack takes up once it has closed round the bot can, and a pack that has
 * surrounded somebody genuinely is on more than one side of them.
 *
 * So the claim is three things. The latch never fires while the pack is still a
 * pack in front of the bot (`LATCH_ONLY_ON_TOP`); the bot goes exactly where it
 * would have in every run where it did not fire, byte for byte, compared with the
 * stick fixed in both so the only difference between the arms is the line; and in
 * the runs where it did fire, the bot is grabbed no more often for it. Measured
 * the first time round: it fired in 2 cities of 32, with the nearest zombie at
 * 30 and 40px — on top of the bot — and grabs went 2 -> 2 and 1 -> 0.
 */
{
  const LATCH_ONLY_ON_TOP = 90;
  let staged = 0;
  let fired = 0;
  let furthest = 0;
  let movedUnlatched = 0;
  let grabsBefore = 0;
  let grabsAfter = 0;
  for (let s = 0; s < RUNS; s++) {
    const seed = 9000 + s * 131;
    const a = run(seed, ARMS[1], 'boltRifle', 0, 1);
    const b = run(seed, ARMS[2], 'boltRifle', 0, 1);
    if (!a || !b) continue;
    staged++;
    if (b.latched > 0) {
      fired++;
      furthest = Math.max(furthest, b.latchedFar);
      grabsBefore += a.grabs;
      grabsAfter += b.grabs;
    } else if (a.endX !== b.endX || a.endY !== b.endY) {
      movedUnlatched++;
    }
  }
  console.log(`
=== the control: one pack of eight — ${staged} cities ===`);
  check(
    furthest <= LATCH_ONLY_ON_TOP,
    `the latch only fired once the pack was on top of the bot ` +
      `(${fired} cities, nearest zombie at most ${f1(furthest)}px)`,
  );
  check(movedUnlatched === 0, `everywhere else the bot went exactly where it would have (${movedUnlatched} runs differ)`);
  check(grabsAfter <= grabsBefore, `and where it fired it cost nothing (grabs ${grabsBefore} -> ${grabsAfter})`);
}

setBotIgnoresPincer(false);
setOfficerTargetStickBroken(false);
console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECKS FAILED`);
