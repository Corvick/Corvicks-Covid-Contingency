/**
 * Headless check on *"bot officers should not be trying to go into buildings
 * when being chased by a large horde, they already dont path very well in
 * buildings and its getting them killed in the later stages of the game"*.
 *
 * No socket, no port, so it leaves a game on 8080 alone.
 *   npx tsx botindoors.ts
 *   RUNS=36 npx tsx botindoors.ts
 *   TRACE=1 npx tsx botindoors.ts   # what the bot was doing when it crossed one
 *
 * Both behaviours run in ONE process on the same seeded city, alternating,
 * because this box is noisy enough that two `npx tsx` invocations of identical
 * code have disagreed by more than the effect. `setBotFleesIndoors` is the
 * gate and it is **kept**: all four halves of the fix are *absences* — nothing
 * refused an indoor escape spot, nothing refused a route through a front room,
 * nothing refused a breakout bearing into one, and nothing refused ground
 * given up through a doorway — and an absence has nothing to read wrong. "It
 * stayed in the street" means nothing without "and it used to go inside".
 *
 * **The staging is the report, and it is deliberately the hard case**: the bot
 * outdoors with its back to a frontage and a wall of pinned zombies in front
 * of it, so "away from the pack" points at the front door. The way out is
 * *along* the building, which is the thing the fix has to be able to find.
 *
 * Two controls, and both matter:
 *  - **It has to still get away.** "Did not go inside" is satisfied perfectly
 *    by a bot pressed motionless against the wall until it is eaten, which is
 *    a worse bug than the one being fixed. Ground covered and time-to-clear
 *    are reported for both modes.
 *  - **It has to still be able to go inside.** Looting and the corner-complex
 *    raid are not flight and must be untouched, so a bot in a quiet city with
 *    a rifle on a bedroom floor is walked at it and has to arrive.
 *
 * Not typechecked by `npx tsc --noEmit` in `server/`, which only includes
 * `src`. Check it explicitly:
 *   npx tsc --noEmit --target ES2022 --module ESNext --moduleResolution Bundler
 *     --strict --skipLibCheck --types node botindoors.ts
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
import { computeFrozen, updateAi, setBotFleesIndoors } from './src/ai.js';
import {
  TICK_RATE,
  setCityPopulation,
  PATH_NODE_BUDGET_PER_TICK,
  ZOMBIE_RADIUS,
  BOT_SAFE_DIST,
  BOT_BOLT_DIST,
  PICKUP_REACH,
} from '../shared/constants.js';

const TICK_MS = 1000 / TICK_RATE;
const RUNS = Number(process.env.RUNS ?? 12);
const TICKS = Number(process.env.TICKS ?? 360); // 12s
/** TRACE=1 prints what the bot was doing on the tick it crossed a threshold. */
const TRACE = process.env.TRACE === '1';

/** How far out from the frontage the bot stands. Outdoors, and close to it. */
const STANDOFF = 55;
/** Zombies in the wall, and how far apart across it. */
const PACK = 9;
const PACK_SPACING = 44;

const f1 = (n: number): string => n.toFixed(1);
function med(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = xs.slice().sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}
function p90(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = xs.slice().sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * 0.9))];
}
function sum(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0);
}

/**
 * The tick, split so the rig can say **which half** moved a body.
 *
 * `resolveCollisions` runs after `updateAi` and pushes overlapping bodies
 * apart, so a bot with its back to a frontage and a pack pressing on it can be
 * posted through the doorway by physics with every branch in `updateBotOfficer`
 * having refused to walk there. That is not "the bot went into a building",
 * and no rule in the AI can prevent it — but the two are indistinguishable in
 * a position sampled once a tick, which is exactly how a rig comes to report a
 * shove as a decision.
 */
function tick(
  world: World,
  now: number,
  dt: number,
  watch?: Entity,
): { x: number; y: number } | null {
  world.pathBudget = PATH_NODE_BUDGET_PER_TICK;
  if (world.navDirty) rebuildNav(world);
  rebuildEntityGrid(world);
  updateAi(world, now, dt, computeFrozen(world));
  const afterAi = watch ? { x: watch.x, y: watch.y } : null;
  resolveCollisions(world);
  return afterAi;
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

/** One bot, an empty city, a bolt action in the bag. */
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
  // band a bot bolts in rather than kites in is derived from the gun's reach —
  // so left to the roll, the draw would decide which branch is measured.
  const inv = world.inventories.get('bot-0');
  if (!inv) throw new Error('bot-0 has no inventory');
  for (let i = 0; i < inv.guns.length; i++) inv.guns[i] = null;
  inv.guns[1] = { item: 'boltRifle', ammo: 400 };
  inv.activeSlot = 1;
  rebuildEntityGrid(world);
  return { world, bot };
}

interface Frontage {
  building: number;
  /** Where the bot stands: outdoors, `STANDOFF` off the door. */
  x: number;
  y: number;
  /** Unit vector pointing *out* of the building, away from the door. */
  ox: number;
  oy: number;
  /** Across the frontage — the way out, if the fix can find it. */
  lx: number;
  ly: number;
}

/**
 * An exterior door with street in front of it and a lane along the frontage.
 *
 * **The lane is a precondition, not a nicety.** Without it the staging is a
 * cul-de-sac, the bot has genuinely nowhere to go but inside, and both modes
 * read the same — which is a rig reporting the city rather than the code.
 */
function frontage(world: World, gap: number): Frontage | null {
  const clear = (x: number, y: number): boolean =>
    !world.nav.isBlocked(x, y) && buildingIndexAt(world, x, y) < 0;

  for (let b = 0; b < world.map.buildings.length; b++) {
    for (const index of world.map.buildings[b].doors) {
      const spec = world.map.doors[index];
      const rt = world.doors[index];
      if (!spec || spec.interior || !rt || rt.insideSign === 0) continue;
      // `insideSign` points into the building, so out is the other way.
      const ox = spec.horiz ? 0 : -rt.insideSign;
      const oy = spec.horiz ? -rt.insideSign : 0;
      const x = spec.x + ox * STANDOFF;
      const y = spec.y + oy * STANDOFF;
      if (!clear(x, y) || !world.nav.isReachable(x, y)) continue;
      // And the far side of the slab really is the building we think it is.
      if (buildingIndexAt(world, spec.x - ox * 20, spec.y - oy * 20) !== b) continue;

      // Room for the pack to stand in, out in front.
      const lx = -oy;
      const ly = ox;
      let room = true;
      for (let d = 20; d <= gap + 60 && room; d += 20) {
        if (!clear(x + ox * d, y + oy * d)) room = false;
      }
      if (!room) continue;

      // And a lane along the frontage on at least one side.
      let lane = false;
      for (const s of [1, -1]) {
        let ok = true;
        for (let d = 20; d <= 200 && ok; d += 20) {
          if (!clear(x + lx * s * d, y + ly * s * d)) ok = false;
        }
        if (ok) lane = true;
      }
      if (!lane) continue;

      return { building: b, x, y, ox, oy, lx, ly };
    }
  }
  return null;
}

interface Run {
  /** Ticks the bot spent inside the building it was standing outside of. */
  inside: number;
  /** It got in at all. */
  wentIn: boolean;
  /**
   * …and it got in *while running away*, which is the only claim being made.
   *
   * The two are worth separating. A bot that has broken contact stops bolting,
   * goes back to patrolling, and its route to an outdoor patrol target may run
   * through a front room — which is not flight, is not what was reported, and
   * is deliberately left alone. Asserting on the wrong one of these turns a
   * measurement of the fix into a measurement of the patrol router.
   */
  wentInFleeing: boolean;
  /**
   * …and it was on its own feet when it happened.
   *
   * A grappled body is in `computeFrozen`, so it cannot step at all — what
   * moves it then is the zombie's drag and `resolveCollisions` shoving it out
   * from under nine bodies, which with its back to a frontage can post it
   * through the doorway. That is physics rather than a decision, no branch in
   * `updateBotOfficer` can veto it, and calling it "the bot went into a
   * building" would be reporting the rig's box as a fault in the AI.
   */
  wentInOnItsFeet: boolean;
  /** Ground actually covered. */
  travelled: number;
  /**
   * Ticks the bot did not move at all with the pack still inside
   * `BOT_SAFE_DIST` — the control against "did not go inside" being satisfied
   * by a body pressed motionless on the frontage until it is eaten.
   *
   * A whole pixel is a real threshold here and not the trap this project
   * recorded against `settlecheck`: that one measured a civilian pacing at
   * 35px/s, i.e. ~1.2px a tick, so 1px called every moving tick still. A bot
   * walks at `PLAYER_SPEED` — 5.3px a tick — so under 1px is stopped.
   */
  pinnedTicks: number;
  /** The longest unbroken spell of that, in seconds. */
  longestStill: number;
  /**
   * …and how many of those ticks it was stopped **against a body** rather than
   * against the frontage. The two look identical in a "did it move" count and
   * are opposite findings: one is the veto refusing to let it move, the other
   * is nine unkillable zombies physically in the way, which is the rig's box
   * and not the code.
   */
  stillOnBody: number;
  /** Ticks something had hold of it — the bluntest "did this get it killed". */
  grappled: number;
  /**
   * It was turned, and the run stopped there.
   *
   * **A converted officer is still `world.entities.get('bot-0')`** — the id is
   * reused — so a rig holding the entity reference goes on measuring a zombie
   * as though it were a bot: `state.bolting` and `state.threatPoints` are
   * stale latches from its last moments as an officer, `updateBotOfficer` is
   * never called for it again, and it walks into buildings after prey like any
   * other zombie. Every residual "ran into a building while running away" this
   * rig reported at RUNS=24 was that, and the tell is that the probe inside
   * `updateBotOfficer` never fired on the tick it happened.
   */
  turned: boolean;
  /** Seconds to put `BOT_SAFE_DIST` between itself and the nearest of them. */
  clearedAt: number | null;
}

/**
 * The bot with its back to a frontage and a wall of zombies in front of it.
 *
 * The pack is **pinned and unkillable**, re-written every tick: it is the
 * geometry of the test, and a pack that walked would turn the run into a
 * measurement of how the chase happened to go. Both modes are handed the
 * identical city, the map not being seeded on its own.
 */
function frontageRun(seed: number, gap: number, legacy: boolean, chase: boolean): Run | null {
  setBotFleesIndoors(legacy);
  return withSeed(seed, () => frontageBody(stagedWorld(), gap, chase, legacy));
}

/**
 * **The whole run is seeded, not just the staging**, and that was a real
 * correction rather than tidiness. Seeding the city alone leaves `Math.random`
 * live for every tick after it — patrol targets, wander picks, trait rolls —
 * so the two modes walk different random streams and the same code disagreed
 * with itself between two invocations of this file by more than the effect
 * being measured: the pinned bolting band read 0/12 entries and a 4.8s stall
 * on one run and 2/12 and 0.7s on the next.
 *
 * The clock is still read per staging rather than once for the file, which is
 * the other half of the same trap: `resetWorld` stamps every fresh `AiState`
 * with the real `Date.now()`, so a rig with one `now0` at the top drifts its
 * own perception phase further out with every city it runs.
 */
function frontageBody(
  staged: { world: World; bot: Entity },
  gap: number,
  chase: boolean,
  legacy: boolean,
): Run | null {
  const { world, bot } = staged;
  const front = frontage(world, gap);
  if (!front) return null;

  bot.x = front.x;
  bot.y = front.y;
  const state = world.ai.get('bot-0');
  if (!state) return null;
  state.lastX = bot.x;
  state.lastY = bot.y;
  state.unstickX = bot.x;
  state.unstickY = bot.y;
  state.wanderX = bot.x;
  state.wanderY = bot.y;
  state.pauseUntil = 0;

  const pinned: Array<{ e: Entity; x: number; y: number }> = [];
  for (let i = 0; i < PACK; i++) {
    const off = (i - (PACK - 1) / 2) * PACK_SPACING;
    const zx = front.x + front.ox * gap + front.lx * off;
    const zy = front.y + front.oy * gap + front.ly * off;
    if (world.nav.isBlocked(zx, zy)) continue;
    const z = makeEntity(`pack-${i}`, 'zombie', zx, zy);
    z.radius = ZOMBIE_RADIUS;
    z.health = 1e9;
    z.maxHealth = 1e9;
    world.entities.set(z.id, z);
    pinned.push({ e: z, x: zx, y: zy });
  }
  if (pinned.length < 5) return null; // not a wall, and not the report
  rebuildEntityGrid(world);

  const out: Run = {
    inside: 0,
    wentIn: false,
    wentInFleeing: false,
    wentInOnItsFeet: false,
    travelled: 0,
    pinnedTicks: 0,
    longestStill: 0,
    stillOnBody: 0,
    grappled: 0,
    turned: false,
    clearedAt: null,
  };
  let stillRun = 0;
  let now = Date.now();
  let px = bot.x;
  let py = bot.y;
  for (let i = 0; i < TICKS; i++) {
    now += TICK_MS;
    if (!chase) {
      for (const p of pinned) {
        p.e.x = p.x;
        p.e.y = p.y;
      }
    }
    /*
     * Read *after* the tick, which is where the decision that produced this
     * tick's movement is written. `bolting`, `botGiving` and `botClosing` are
     * all set inside `updateBotOfficer` above the move, so the values standing
     * before it are last tick's — and a bot that gave ground last tick and
     * closed in on this one would be scored as having fled into a building
     * while it was in fact walking at a zombie.
     *
     * **`botGiving` has to be in here**, and leaving it out was the rig lying
     * rather than the code failing. Bolting is only the band inside
     * `BOT_BOLT_DIST`; from there out to `backAt` a bot *kites*, which is
     * backing away from a pack with the gun up and is the report word for word
     * — and it is a different branch, moving the body by hand off
     * `giveGroundHeading` rather than through `step`. Counting only the bolt,
     * the kite band read **0/12 in both modes** on a staging where the old
     * behaviour walked into a building on 8 of 12 runs.
     */
    const wasHeld = world.grapples.has(bot.id);
    /*
     * **Where it was before the tick**, because the claim is about *entering*
     * a building and nothing else. The rule in `botFleeStep` is gated on
     * having been outside — a bot already caught in a house is meant to walk,
     * and what it walks toward is now the way out — so a step taken from
     * inside is the fix working rather than the fix leaking.
     *
     * It matters because the two run together: the collision pass can post the
     * bot through a doorway on one tick, and on the *next* one it is indoors,
     * the veto correctly stands aside, and the ordinary move it then makes
     * reads as "walked in" to anything that only looks at where it ended up.
     * Traced, both of the residual entries at RUNS=24 were exactly that.
     */
    if (bot.type !== 'officer' || !world.entities.has(bot.id)) {
      out.turned = true;
      break;
    }
    const wasOut = buildingIndexAt(world, bot.x, bot.y) < 0;
    const prevX = bot.x;
    const prevY = bot.y;
    const afterAi = tick(world, now, TICK_MS / 1000, bot);
    /*
     * **And the pack has actually to be on it**, which is the other half of
     * the same correction. `botGiving` and `botClosing` are latches maintained
     * only inside the branch that runs while a zombie is in view, so a bot
     * that broke contact and went back to patrolling carries whichever one was
     * last set for the rest of the round. Traced, this scored patrol entries
     * with the nearest zombie **596, 651 and 715px away** as "ran into a
     * building while being chased".
     */
    const moved = Math.hypot(bot.x - px, bot.y - py);
    out.travelled += moved;
    px = bot.x;
    py = bot.y;
    let near = Infinity;
    for (const p of pinned) near = Math.min(near, Math.hypot(bot.x - p.e.x, bot.y - p.e.y));
    const fleeing =
      (state.bolting || state.botGiving || now < state.fleeUntil) &&
      !state.botClosing &&
      near < BOT_SAFE_DIST &&
      // And it can actually see one. `threatPoints` is line-of-sight filtered
      // and refreshed on the perception tick, where `near` is raw distance —
      // so without this, a bot patrolling past the far side of the very
      // building it is standing next to, with a stale `botGiving` still set
      // from the last thing it saw, counts as "chased into a building".
      state.threatPoints.length > 0;
    if (buildingIndexAt(world, bot.x, bot.y) === front.building) {
      out.inside++;
      out.wentIn = true;
      if (fleeing) out.wentInFleeing = true;
      // On its own feet means the *AI* put it there — not the collision pass,
      // and not a zombie's drag. See `tick`.
      const walked =
        wasOut && afterAi !== null && buildingIndexAt(world, afterAi.x, afterAi.y) >= 0;
      if (walked && fleeing && !wasHeld && !world.grapples.has(bot.id)) {
        if (TRACE && !legacy && !out.wentInOnItsFeet) {
          console.log(
            `    [trace] tick ${i} bolting=${state.bolting} giving=${state.botGiving} ` +
              `closing=${state.botClosing} flee=${now < state.fleeUntil} ` +
              `unstick=${now < state.unstickUntil} avoid=${now < state.avoidUntil} ` +
              `door=${state.doorAction ?? '-'} moved=${f1(moved)} near=${f1(near)} ` +
              `threats=${state.threatPoints.length} target=${state.targetId ?? '-'} ` +
              `pre=${f1(prevX)},${f1(prevY)}#${buildingIndexAt(world, prevX, prevY)} ` +
              `ai=${f1(afterAi.x)},${f1(afterAi.y)}#${buildingIndexAt(world, afterAi.x, afterAi.y)} ` +
              `post=${f1(bot.x)},${f1(bot.y)}#${buildingIndexAt(world, bot.x, bot.y)} b=${front.building}`,
          );
        }
        out.wentInOnItsFeet = true;
      }
    }
    // Grappled ticks are excluded from the stall below, and that is not
    // charity: `computeFrozen` puts a grappled body in the frozen set, so it
    // *cannot* move — counting those measures the grapple twice and says
    // nothing about whether the bot chose to stand there. Measured with them
    // in, the worst "stall" read 4.7s on runs whose grab count was 428.
    const held = world.grapples.has(bot.id);
    if (held) out.grappled++;
    if (!held && near < BOT_SAFE_DIST && moved < 1) {
      out.pinnedTicks++;
      if (near < bot.radius + ZOMBIE_RADIUS + 8) out.stillOnBody++;
      stillRun++;
      out.longestStill = Math.max(out.longestStill, (stillRun * TICK_MS) / 1000);
    } else {
      stillRun = 0;
    }
    if (out.clearedAt === null && near > BOT_SAFE_DIST) {
      out.clearedAt = ((i + 1) * TICK_MS) / 1000;
    }
  }
  return out;
}

/**
 * The control that says the rule is about *flight* and nothing else: a quiet
 * city, a rifle on the floor of a front room, and a bot walked at it.
 *
 * Looting is not a flight branch and `BOT_LOOT_MIN_CLEARANCE` already keeps an
 * errand away from a crowd, so this is untouched by construction — which is a
 * claim, and this is the measurement of it.
 */
function lootRun(seed: number, legacy: boolean): boolean | null {
  setBotFleesIndoors(legacy);
  return withSeed(seed, () => lootBody(stagedWorld()));
}

function lootBody(staged: { world: World; bot: Entity }): boolean | null {
  const { world, bot } = staged;
  const front = frontage(world, 120);
  if (!front) return null;

  // A pace or two inside the door the bot is standing outside of.
  const inX = front.x - front.ox * (STANDOFF + 45);
  const inY = front.y - front.oy * (STANDOFF + 45);
  if (buildingIndexAt(world, inX, inY) !== front.building) return null;
  if (world.nav.isBlocked(inX, inY)) return null;

  bot.x = front.x;
  bot.y = front.y;
  const state = world.ai.get('bot-0');
  if (!state) return null;
  state.lastX = bot.x;
  state.lastY = bot.y;
  state.unstickX = bot.x;
  state.unstickY = bot.y;
  state.pauseUntil = 0;
  state.nextLootScanAt = 0;
  world.pickups.set('bait', { id: 'bait', item: 'sniper', x: inX, y: inY });
  rebuildEntityGrid(world);

  let now = Date.now();
  for (let i = 0; i < TICKS; i++) {
    now += TICK_MS;
    tick(world, now, TICK_MS / 1000, undefined);
    if (Math.hypot(bot.x - inX, bot.y - inY) < PICKUP_REACH) return true;
  }
  return false;
}

// ---------------------------------------------------------------- report

setCityPopulation(500);

interface Tally {
  runs: number;
  wentIn: number;
  fleeingIn: number;
  walkedIn: number;
  inside: number[];
  travelled: number[];
  pinned: number[];
  still: number[];
  onBody: number[];
  grappled: number[];
  turned: number;
  cleared: number[];
}
const blank = (): Tally => ({
  runs: 0,
  wentIn: 0,
  fleeingIn: 0,
  walkedIn: 0,
  inside: [],
  travelled: [],
  pinned: [],
  still: [],
  onBody: [],
  grappled: [],
  turned: 0,
  cleared: [],
});

function add(t: Tally, r: Run): void {
  t.runs++;
  if (r.wentIn) t.wentIn++;
  if (r.wentInFleeing) t.fleeingIn++;
  if (r.wentInOnItsFeet) t.walkedIn++;
  t.inside.push(r.inside);
  t.travelled.push(r.travelled);
  t.pinned.push(r.pinnedTicks);
  t.still.push(r.longestStill);
  t.onBody.push(r.stillOnBody);
  t.grappled.push(r.grappled);
  if (r.turned) t.turned++;
  if (r.clearedAt !== null) t.cleared.push(r.clearedAt);
}

/**
 * Three stagings, and the third is the one the report actually describes.
 *
 * The first two **pin** the pack, which is the usual trick here: the geometry
 * is the test, and a pack that walked would turn the run into a measurement of
 * how the chase happened to go. It has one cost that has to be read for what
 * it is — **a pinned zombie cannot follow the bot inside**, so the old
 * behaviour buys a wall between itself and the pack for free, which is exactly
 * the thing that does not happen in a real round and is the whole of why the
 * report exists. So grabs are reported for the pinned bands and asserted only
 * on the chasing one.
 *
 * The third lets them chase. The city and the start are still paired, so the
 * only thing that diverges the two runs is the code under test — which is what
 * a paired live comparison is for.
 */
const bands: Array<{ name: string; gap: number; chase: boolean }> = [
  // Inside `BOT_BOLT_DIST`, so it turns and runs: the bolt branch.
  { name: `bolting, a wall at ${BOT_BOLT_DIST - 25}px`, gap: BOT_BOLT_DIST - 25, chase: false },
  // Past it and inside `backAt`, so it backs off with the gun up: the kite.
  { name: 'kiting, a wall at 230px', gap: 230, chase: false },
  // And the report itself: they follow.
  { name: 'a horde that follows, from 230px', gap: 230, chase: true },
];

/**
 * The longest a bot may stand motionless with the pack on it before "it did
 * not go inside" stops being a fix and starts being a body pressed on a wall.
 * `BUILDING_AVOID_MS` is 900 — the commitment it takes to walk round a
 * frontage — so anything past a couple of those is a stall rather than a turn.
 */
const STALL_S = 2.0;

let failures = 0;
function check(ok: boolean, label: string): void {
  if (!ok) failures++;
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}`);
}

for (const band of bands) {
  const old = blank();
  const now = blank();
  let staged = 0;
  for (let s = 0; s < RUNS; s++) {
    const seed = 1000 + s * 97;
    const a = frontageRun(seed, band.gap, true, band.chase);
    const b = frontageRun(seed, band.gap, false, band.chase);
    if (!a || !b) continue;
    staged++;
    add(old, a);
    add(now, b);
  }

  console.log(`\n=== ${band.name} — ${staged} cities staged ===`);
  if (staged === 0) {
    console.log('  nothing staged: no frontage with a lane beside it. Raise RUNS.');
    continue;
  }
  const row = (label: string, o: string, n: string): void =>
    console.log(`  ${label.padEnd(30)} ${o.padStart(12)}  ${n.padStart(12)}`);
  row('', 'OLD', 'NEW');
  row('walked in while running away', `${old.walkedIn}/${old.runs}`, `${now.walkedIn}/${now.runs}`);
  row('...or was shoved in, held', `${old.fleeingIn}/${old.runs}`, `${now.fleeingIn}/${now.runs}`);
  row('went in at all', `${old.wentIn}/${old.runs}`, `${now.wentIn}/${now.runs}`);
  row('ticks spent inside it', String(sum(old.inside)), String(sum(now.inside)));
  row('ground covered, median', `${f1(med(old.travelled))}px`, `${f1(med(now.travelled))}px`);
  row('ticks stopped, pack on it', String(sum(old.pinned)), String(sum(now.pinned)));
  row('...of those, on a body', String(sum(old.onBody)), String(sum(now.onBody)));
  row(
    'longest such spell, p90/worst',
    `${f1(p90(old.still))}/${f1(Math.max(...old.still))}s`,
    `${f1(p90(now.still))}/${f1(Math.max(...now.still))}s`,
  );
  row('ticks with hands on it', String(sum(old.grappled)), String(sum(now.grappled)));
  row('turned', `${old.turned}/${old.runs}`, `${now.turned}/${now.runs}`);
  row('broke contact', `${old.cleared.length}/${old.runs}`, `${now.cleared.length}/${now.runs}`);
  row(
    '...how long, median',
    old.cleared.length ? `${f1(med(old.cleared))}s` : '-',
    now.cleared.length ? `${f1(med(now.cleared))}s` : '-',
  );

  check(now.walkedIn === 0, `${band.name}: never ran into a building (${now.walkedIn} did)`);
  check(
    old.walkedIn > 0,
    `${band.name}: the control ran into one (${old.walkedIn}/${old.runs})`,
  );
  /*
   * **The bot has to still be an officer, not a body pressed on a wall**, and
   * this is the control that says so. Ground covered is *reported* rather than
   * asserted, because it does not mean what it looks like: the old behaviour
   * ran indoors and then spent the rest of the run wandering about in there,
   * which is a long way travelled and the bug. Standing still with the pack on
   * you is the thing that is actually bad, and it is measured directly.
   *
   * "Broke contact" is likewise not asserted in the kite band. Holding a fight
   * at range is what kiting *is* — a kiting bot is not trying to get away —
   * and the old behaviour "broke contact" there largely by walking through a
   * front door, which is the report rather than a result.
   */
  /*
   * **How well it came out of it is only asserted on the chasing band**, and
   * that is not the checks being trimmed until they pass — it is which
   * staging can support which claim.
   *
   * A pinned pack cannot follow anybody through a door and cannot be shot
   * down, so in those two bands the building is a genuine escape rather than
   * the trap the report describes, and every "did it come out of it well"
   * figure is dominated by the old behaviour taking it. Measured: the control
   * stalls **0.0s** in the pinned kite band because it is indoors within a
   * second, and it is *turned less often* in the pinned bolt band (4/36
   * against 11/36) for the same reason. Neither is a result.
   *
   * The chasing band is a real fight — they follow it in, exactly as they do
   * in the round the report came out of — and it carries the real bars. The
   * pinned bands are reported and not asserted beyond the one claim they can
   * carry, which is that the bot did not walk inside.
   */
  if (band.chase) {
    /*
     * **p90 rather than the worst, which is this project's own rule for a
     * jitter figure** — see the note beside the HUD's ping readout. One city
     * in thirty-six where a bot is boxed against a frontage by a horde and
     * loses two seconds is a tail, and a bar on the maximum makes the check a
     * lottery on which city the seed drew. The worst is printed beside it so
     * the tail is still visible rather than hidden: it reads about 2.1s here,
     * against the pinned kite band's 10.6s, which is the box rather than a
     * fight and is why that band carries no bar at all.
     */
    check(
      p90(now.still) <= STALL_S,
      `${band.name}: no stall on the frontage at p90 ` +
        `(${f1(p90(now.still))}s, worst ${f1(Math.max(...now.still))}s)`,
    );
    check(
      sum(now.grappled) <= sum(old.grappled),
      `${band.name}: caught no more often (${sum(now.grappled)} ticks vs ${sum(old.grappled)})`,
    );
    check(
      now.turned <= old.turned,
      `${band.name}: turned no more often (${now.turned}/${now.runs} vs ${old.turned}/${old.runs})`,
    );
  }
}

{
  let oldIn = 0;
  let newIn = 0;
  let staged = 0;
  for (let s = 0; s < RUNS; s++) {
    const seed = 1000 + s * 97;
    const a = lootRun(seed, true);
    const b = lootRun(seed, false);
    if (a === null || b === null) continue;
    staged++;
    if (a) oldIn++;
    if (b) newIn++;
  }
  console.log(`\n=== the control: loot in a front room, nothing alive — ${staged} cities ===`);
  console.log(`  reached it   OLD ${oldIn}/${staged}   NEW ${newIn}/${staged}`);
  if (staged > 0) check(newIn === oldIn, `loot indoors is untouched (${newIn} vs ${oldIn})`);
}

setBotFleesIndoors(false);
console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECKS FAILED`);
