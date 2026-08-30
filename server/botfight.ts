/**
 * Headless check on three reports about how a bot officer fights:
 *
 *  - *"if a bot officer hears zombies on the other side of the door it should
 *    look for other escape routes"*
 *  - *"officers are too slow when kiting and need to be the same speed as if it
 *    were a player"*
 *  - *"if they have a shield allow them to use shield bash as if they were a
 *    player"*
 *
 * No socket, no port, so it leaves a game on 8080 alone.
 *   npx tsx botfight.ts
 *   RUNS=12 npx tsx botfight.ts
 *
 * Both behaviours run in ONE process on the same seeded city.
 * `setLegacyBotCombat` is the gate and it is kept: all three of these are
 * absences rather than wrong lines, and an absence has nothing to read wrong —
 * "the bot bashed" means nothing without "and it never did before".
 *
 * **The clock is read after each staging, not once for the whole rig**, and
 * both modes are handed the same city by stubbing `Math.random` for the length
 * of the staging. Both traps are written up in `botdoor.ts`.
 *
 * Not typechecked by `npx tsc --noEmit` in `server/`, which only includes
 * `src`. Check it explicitly:
 *   npx tsc --noEmit --target ES2022 --module ESNext --moduleResolution Bundler
 *     --strict --skipLibCheck --types node botfight.ts
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
import { computeFrozen, updateAi, setLegacyBotCombat } from './src/ai.js';
import {
  TICK_RATE,
  PATH_NODE_BUDGET_PER_TICK,
  ZOMBIE_RADIUS,
  BOT_DOOR_LISTEN_RANGE,
  BOT_DOOR_STANDOFF,
  SHIELD_BASH_RANGE,
  SHIELD_POINTS,
} from '../shared/constants.js';

const TICK_MS = 1000 / TICK_RATE;
const RUNS = Number(process.env.RUNS ?? 12);
const TICKS = Number(process.env.TICKS ?? 600); // 20s

/**
 * Where the pinned zombie stands for the kite measurement: past
 * `BOT_BOLT_DIST` (120) so the bot does not turn and run, and inside `backAt`
 * so it gives ground instead. A bolt has never carried the multiplier.
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

/** One bot, an empty city, every door shut, a bolt action in the bag. */
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
  for (const d of world.doors) {
    if (!d) continue;
    d.open = false;
    d.locked = false;
  }
  // One known gun: the band a kite happens in is derived from its reach, so
  // whatever `giveStartingItem` rolled would otherwise decide the staging.
  const inv = world.inventories.get('bot-0');
  if (!inv) throw new Error('bot-0 has no inventory');
  for (let i = 0; i < inv.guns.length; i++) inv.guns[i] = null;
  inv.guns[1] = { item: 'boltRifle', ammo: 200 };
  inv.activeSlot = 1;
  rebuildEntityGrid(world);
  return { world, bot };
}

/** Somewhere in the open, well clear of geometry, for a scuffle to happen on. */
function openSpot(world: World): { x: number; y: number } | null {
  for (let i = 0; i < 4000; i++) {
    const x = 300 + Math.random() * (world.map.width - 600);
    const y = 300 + Math.random() * (world.map.height - 600);
    let clear = true;
    for (let a = 0; a < 8 && clear; a++) {
      const t = (a / 8) * Math.PI * 2;
      for (let r = 0; r <= 260; r += 30) {
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

// ------------------------------------------------------- another way in

interface Way {
  /** It got out of the building at all. */
  out: boolean;
  /** …and it left by a door other than the one it heard the pack behind. */
  otherDoor: boolean;
  /** Ticks spent inside BOT_DOOR_STANDOFF of the door it heard. */
  loitered: number;
  secs: number;
}

/**
 * **A pack outside the near door, and another door round the side.**
 *
 * Staged as leaving rather than entering, because that is what "escape routes"
 * means and because the entering case cannot be staged honestly: two zombies in
 * the room put the loot inside `BOT_LOOT_MIN_CLEARANCE` of them, so
 * `lootWanted` refuses the errand and the bot never walks at the door at all.
 * Measured that way the rig read 0/8 in both modes and was reporting the loot
 * scan rather than the door.
 *
 * The patrol target is put in the street outside the *near* door, so the
 * ordinary route out is the one with the pack behind it. That is the reported
 * situation rather than a stacked deck: what is being asked is what the bot
 * does when the way it wants is the way it should not take.
 */
function anotherWayRun(seed: number): Way | null {
  const { world, bot } = withSeed(seed, stagedWorld);

  let pick: { building: number; near: number; far: number } | null = null;
  for (let b = 0; b < world.map.buildings.length && !pick; b++) {
    const outside: number[] = [];
    for (const index of world.map.buildings[b].doors) {
      const spec = world.map.doors[index];
      const rt = world.doors[index];
      if (!spec || spec.interior || !rt || rt.insideSign === 0) continue;
      if (!world.nav.isReachable(spec.x, spec.y)) continue;
      outside.push(index);
    }
    for (let i = 0; i < outside.length && !pick; i++) {
      for (let j = i + 1; j < outside.length && !pick; j++) {
        const a2 = world.map.doors[outside[i]];
        const c = world.map.doors[outside[j]];
        if (Math.hypot(a2.x - c.x, a2.y - c.y) < 140) continue;
        pick = { building: b, near: outside[i], far: outside[j] };
      }
    }
  }
  if (!pick) return null;

  const near = world.map.doors[pick.near];
  const rt = world.doors[pick.near];
  if (!rt) return null;
  const nx = near.horiz ? 0 : rt.insideSign;
  const ny = near.horiz ? rt.insideSign : 0;

  // Inside, a little way back from the near door.
  bot.x = near.x + nx * 55;
  bot.y = near.y + ny * 55;
  if (world.nav.isBlocked(bot.x, bot.y)) return null;
  if (buildingIndexAt(world, bot.x, bot.y) !== pick.building) return null;

  // The pack in the street on the far side of that door.
  const packX = near.x - nx * (BOT_DOOR_LISTEN_RANGE * 0.5);
  const packY = near.y - ny * (BOT_DOOR_LISTEN_RANGE * 0.5);
  if (buildingIndexAt(world, packX, packY) >= 0) return null;
  if (world.nav.isBlocked(packX, packY)) return null;
  for (let i = 0; i < 2; i++) {
    const z = makeEntity(`pack-${i}`, 'zombie', packX + i * 10, packY + i * 10);
    z.radius = ZOMBIE_RADIUS;
    z.health = 1e9;
    z.maxHealth = 1e9;
    world.entities.set(z.id, z);
    world.ai.delete(z.id);
  }

  // Somewhere to be, out in the street past the near door.
  const wantX = near.x - nx * 150;
  const wantY = near.y - ny * 150;
  if (world.nav.isBlocked(wantX, wantY) || buildingIndexAt(world, wantX, wantY) >= 0) return null;

  const state = world.ai.get('bot-0');
  if (state) {
    state.lastX = bot.x;
    state.lastY = bot.y;
    state.unstickX = bot.x;
    state.unstickY = bot.y;
    state.wanderX = wantX;
    state.wanderY = wantY;
    state.pauseUntil = 0;
  }
  world.pickups.clear();
  rebuildEntityGrid(world);

  const far = world.map.doors[pick.far];
  const out: Way = { out: false, otherDoor: false, loitered: 0, secs: 0 };
  let now = Date.now();
  for (let i = 0; i < TICKS; i++) {
    now += TICK_MS;
    tick(world, now, TICK_MS / 1000);
    if (Math.hypot(near.x - bot.x, near.y - bot.y) < BOT_DOOR_STANDOFF) out.loitered++;
    if (buildingIndexAt(world, bot.x, bot.y) < 0) {
      out.out = true;
      out.secs = ((i + 1) * TICK_MS) / 1000;
      out.otherDoor =
        Math.hypot(far.x - bot.x, far.y - bot.y) < Math.hypot(near.x - bot.x, near.y - bot.y);
      break;
    }
  }
  return out;
}

// ------------------------------------------------------------ the bash

interface Bash {
  /** Separate shoves, counted off the edge of the wire flag. */
  bashes: number;
  /** Furthest the pinned zombie was ever moved off its pin, in px. */
  shoved: number;
}

/**
 * A shield, and something on its chest. The zombie is re-pinned every tick and
 * is unkillable, so the only thing in the world that can move it is a shove.
 */
function bashRun(seed: number): Bash | null {
  const { world, bot } = withSeed(seed, stagedWorld);
  const inv = world.inventories.get('bot-0');
  if (!inv) return null;
  inv.utilities.push('riotShield');
  inv.shield = SHIELD_POINTS;
  inv.shieldUp = true;

  const spot = openSpot(world);
  if (!spot) return null;
  bot.x = spot.x;
  bot.y = spot.y;
  const state = world.ai.get('bot-0');
  if (state) {
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

  const out: Bash = { bashes: 0, shoved: 0 };
  let bearing = Math.random() * Math.PI * 2;
  let now = Date.now();
  let showing = false;
  for (let i = 0; i < TICKS; i++) {
    const gap = SHIELD_BASH_RANGE * 0.5;
    const px = bot.x + Math.cos(bearing) * gap;
    const py = bot.y + Math.sin(bearing) * gap;
    z.x = px;
    z.y = py;
    now += TICK_MS;
    tick(world, now, TICK_MS / 1000);
    out.shoved = Math.max(out.shoved, Math.hypot(z.x - px, z.y - py));
    const on = (world.bashUntil.get('bot-0') ?? 0) > now;
    if (on && !showing) out.bashes++;
    showing = on;
    bearing = Math.atan2(bot.y - z.y, bot.x - z.x) + Math.PI;
  }
  return out;
}

// ----------------------------------------------------------- the kite

/** Pace while giving ground, in px/s. */
function kiteSpeedRun(seed: number): number | null {
  const { world, bot } = withSeed(seed, stagedWorld);
  const spot = openSpot(world);
  if (!spot) return null;
  bot.x = spot.x;
  bot.y = spot.y;
  const state = world.ai.get('bot-0');
  if (state) {
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

  let now = Date.now();
  let bearing = Math.random() * Math.PI * 2;
  let travelled = 0;
  let moving = 0;
  for (let i = 0; i < 240; i++) {
    z.x = bot.x + Math.cos(bearing) * KITE_GAP;
    z.y = bot.y + Math.sin(bearing) * KITE_GAP;
    const wasX = bot.x;
    const wasY = bot.y;
    now += TICK_MS;
    tick(world, now, TICK_MS / 1000);
    const st = world.ai.get('bot-0');
    // Only the give-ground ticks: a bolt has never carried the multiplier.
    if (st && !st.bolting) {
      const moved = Math.hypot(bot.x - wasX, bot.y - wasY);
      if (moved > 0.5) {
        travelled += moved;
        moving++;
      }
    }
    bearing = Math.atan2(bot.y - z.y, bot.x - z.x) + Math.PI;
  }
  return moving > 0 ? travelled / (moving * (TICK_MS / 1000)) : null;
}

// ------------------------------------------------------------- driver

const ways: Record<string, Way[]> = { OLD: [], NEW: [] };
const bashes: Record<string, Bash[]> = { OLD: [], NEW: [] };
const paces: Record<string, number[]> = { OLD: [], NEW: [] };
let skipped = 0;

for (let run = 0; run < RUNS; run++) {
  for (const mode of ['OLD', 'NEW'] as const) {
    setLegacyBotCombat(mode === 'OLD');
    const a = anotherWayRun(3000 + run);
    if (a) ways[mode].push(a);
    else skipped++;
    const b = bashRun(4000 + run);
    if (b) bashes[mode].push(b);
    else skipped++;
    const c = kiteSpeedRun(5000 + run);
    if (c !== null) paces[mode].push(c);
    else skipped++;
  }
}

console.log(`\na pack outside the near door and another way out  (${RUNS} cities each)`);
for (const mode of ['OLD', 'NEW'] as const) {
  const rows = ways[mode];
  console.log(
    `  ${mode}  got out ${rows.filter((r) => r.out).length}/${rows.length}` +
      `   by the other door ${rows.filter((r) => r.otherDoor).length}/${rows.length}` +
      `   median ${f1(med(rows.filter((r) => r.out).map((r) => r.secs)))}s` +
      `   ticks loitering at the door it heard ${rows.reduce((a, r) => a + r.loitered, 0)}`,
  );
}

console.log(`\na riot shield and a zombie on its chest  (${RUNS} cities each, ${(TICKS / TICK_RATE) | 0}s)`);
for (const mode of ['OLD', 'NEW'] as const) {
  const rows = bashes[mode];
  console.log(
    `  ${mode}  bashes ${rows.reduce((a, r) => a + r.bashes, 0)}` +
      `   runs that bashed at all ${rows.filter((r) => r.bashes > 0).length}/${rows.length}` +
      `   furthest shove ${f1(Math.max(0, ...rows.map((r) => r.shoved)))}px`,
  );
}

console.log(`\npace while giving ground  (${RUNS} cities each)`);
for (const mode of ['OLD', 'NEW'] as const) {
  console.log(`  ${mode}  median ${f1(med(paces[mode]))} px/s   (n=${paces[mode].length})`);
}
if (skipped > 0) console.log(`\n(${skipped} stagings skipped)`);
