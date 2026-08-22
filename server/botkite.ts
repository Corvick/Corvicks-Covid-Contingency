/**
 * Headless check on the two things that used to stop a bot officer being an
 * officer: turning its back to run, and standing at a door while something ate
 * it. No socket, no port, so it leaves a game on 8080 alone.
 *
 * Both behaviours run in ONE process, alternating city by city, because two
 * `npx tsx` invocations on this box are not comparable and the map is not
 * seeded either. `setBotDropsTheGun` is the gate, and the control is the whole
 * value of the run: "the bot faced the zombie" means nothing without "and it
 * did not before".
 *
 * Everything here is *staged* rather than watched live. A bot deciding to bolt
 * at all needs a zombie inside BOT_BOLT_DIST and a live city hands that over
 * once every few minutes, so the zombie is pinned at a fixed offset each tick
 * and the geometry is made to hold. That is the same trick `targetchurn.ts`
 * uses and for the same reason: left free, the pair drift, the distances change
 * on their own, and a bot that happened to turn round looks exactly like the
 * feature working.
 *
 * **The clock has to start where the world's does, and this is not the usual
 * version of that warning.** `resetWorld` takes no `now` and stamps every fresh
 * AiState with `Date.now()` — so a harness that starts its own clock at 10000
 * and advances a tick at a time leaves `nextSenseAt` about fifty-six years in
 * the future, and the bot never perceives anything at all for the length of the
 * run. Nothing errors and nothing looks wrong: it reads as a bot standing next
 * to a zombie doing nothing, which is indistinguishable from the bug under
 * test. Measured that way this rig reported **0 bolting ticks in both modes**.
 *
 *   npx tsx botkite.ts
 *   RUNS=6 npx tsx botkite.ts
 *
 * Not typechecked by `npx tsc --noEmit` in `server/` — that only includes
 * `src/**`. Check it explicitly:
 *   npx tsc --noEmit --target ES2022 --module ESNext --moduleResolution Bundler \
 *     --strict --skipLibCheck --types node botkite.ts
 */
import {
  createWorld,
  resetWorld,
  rebuildNav,
  rebuildEntityGrid,
  resolveCollisions,
  makeEntity,
  type World,
  type Entity,
} from './src/world.js';
import { computeFrozen, updateAi, setBotDropsTheGun } from './src/ai.js';
import { claimDoor } from './src/doors.js';
import {
  TICK_RATE,
  PATH_NODE_BUDGET_PER_TICK,
  BOT_BOLT_DIST,
  BOT_SAFE_DIST,
  DOOR_KICK_MS,
  ZOMBIE_RADIUS,
} from '../shared/constants.js';

const TICK_MS = 1000 / TICK_RATE;
const RUNS = Number(process.env.RUNS ?? 6);
/** Long enough to cover a whole DOOR_KICK_MS (4.2s) and then some. */
const TICKS = Number(process.env.TICKS ?? 180);

const f1 = (n: number): string => n.toFixed(1);
const f2 = (n: number): string => n.toFixed(2);
function med(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = xs.slice().sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}
function angleDelta(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
const deg = (rad: number): number => (rad * 180) / Math.PI;

function tick(world: World, now: number, dt: number): void {
  world.pathBudget = PATH_NODE_BUDGET_PER_TICK;
  if (world.navDirty) rebuildNav(world);
  rebuildEntityGrid(world);
  updateAi(world, now, dt, computeFrozen(world));
  resolveCollisions(world);
}

/**
 * A world with exactly one bot and nothing else alive in it.
 *
 * `resetWorld` fills a whole city, and a city full of civilians is a city full
 * of things for the bot to do instead of the one thing being measured. The bot
 * itself has to come out of `populate` rather than be built by hand, or it
 * misses its inventory, its stamina, its rally charges and its membership of
 * `world.bots` — which is the set every rule under test is keyed on.
 */
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
  rebuildEntityGrid(world);

  // A rifle with rounds in it, or "did it shoot" is a question about the pistol
  // and the pistol's reach.
  const inv = world.inventories.get('bot-0');
  if (!inv) throw new Error('bot-0 has no inventory');
  inv.guns[1] = { item: 'boltRifle', ammo: 200 };
  inv.activeSlot = 1;

  return { world, bot };
}

/** Somewhere in the open, well clear of geometry, for a chase to happen on. */
function openSpot(world: World): { x: number; y: number } | null {
  for (let i = 0; i < 4000; i++) {
    const x = 300 + Math.random() * (world.map.width - 600);
    const y = 300 + Math.random() * (world.map.height - 600);
    let clear = true;
    for (let a = 0; a < 8 && clear; a++) {
      const t = (a / 8) * Math.PI * 2;
      for (let r = 0; r <= 240; r += 30) {
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

interface Kite {
  /** Ticks the bot spent bolting, which is the only window any of this is about. */
  ticks: number;
  /** How far off the zombie the gun was pointing, in degrees. */
  offTarget: number[];
  /** …and how far off its own footsteps, which is what it used to be welded to. */
  offFootsteps: number[];
  /** Ticks with the gun within firing tolerance (0.2 rad) of the zombie. */
  onTarget: number;
  shots: number;
  /** It still has to actually run away: ground made from where it started. */
  gained: number;
}

/**
 * A zombie pinned on top of a bot, tick after tick, so the bolt never lapses.
 *
 * Re-placed every tick at BOT_BOLT_DIST * 0.6 on the bearing it already had,
 * which is a perfect chaser: the bot cannot satisfy BOT_SAFE_DIST and stays in
 * the branch under test for the whole run. Its own AI is left out — a chaser
 * that also grapples ends the measurement early with the bot in a grapple,
 * which is a different branch.
 */
function kiteRun(now0: number): Kite | null {
  const { world, bot } = stagedWorld();
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
  // Unkillable on purpose, so both modes run the full `TICKS` and the tick count
  // and the ground made are comparable between them. Left mortal it is shot dead
  // by the only mode that can shoot, that run ends early, and "ground made" then
  // reads 441px against 604px — which looks like the kite escaping *worse* when
  // all it says is that the run was shorter.
  z.health = 1e9;
  z.maxHealth = 1e9;
  world.entities.set('chaser', z);

  const startX = bot.x;
  const startY = bot.y;
  const out: Kite = { ticks: 0, offTarget: [], offFootsteps: [], onTarget: 0, shots: 0, gained: 0 };

  let now = now0;
  let bearing = Math.random() * Math.PI * 2;
  for (let i = 0; i < TICKS; i++) {
    // Pin the chaser on top of it, on whichever side it was last on.
    z.x = bot.x + Math.cos(bearing) * BOT_BOLT_DIST * 0.6;
    z.y = bot.y + Math.sin(bearing) * BOT_BOLT_DIST * 0.6;
    // Its AI never runs, so nothing else will keep its facing honest.
    z.facing = bearing + Math.PI;

    const wasX = bot.x;
    const wasY = bot.y;
    world.shots.length = 0;

    now += TICK_MS;
    tick(world, now, TICK_MS / 1000);

    const st = world.ai.get('bot-0');
    if (!st?.bolting) continue;
    out.ticks++;

    const toZombie = Math.atan2(z.y - bot.y, z.x - bot.x);
    const err = Math.abs(angleDelta(bot.facing, toZombie));
    out.offTarget.push(deg(err));
    if (err < 0.2) out.onTarget++;

    const moved = Math.hypot(bot.x - wasX, bot.y - wasY);
    if (moved > 0.5) {
      out.offFootsteps.push(deg(Math.abs(angleDelta(bot.facing, Math.atan2(bot.y - wasY, bot.x - wasX)))));
    }
    // Nothing else in this world can pull a trigger, so every shot is the bot's.
    out.shots += world.shots.length;
    // Keep the chaser on the side the bot is running away from.
    bearing = Math.atan2(bot.y - z.y, bot.x - z.x) + Math.PI;
  }

  out.gained = Math.hypot(bot.x - startX, bot.y - startY);
  return out;
}

interface Door {
  /**
   * Did it let go *early* — before DOOR_KICK_MS was up?
   *
   * "`doorBusyUntil` reached 0" on its own is not the question and was the first
   * version of it: the kick simply finishing satisfies that just as well, which
   * is why both modes read 6/6 at a median of 4.20s of 4.20s. What is under
   * test is whether anything can interrupt the work, so the reading has to be
   * against the deadline.
   */
  droppedIt: boolean;
  /** How long it held on for, against DOOR_KICK_MS. */
  heldMs: number;
  /** Did the claim go back, so somebody else could work the door? */
  released: boolean;
  /** Did the bot actually see the thing it was supposed to be reacting to? */
  sawIt: boolean;
  /** Shots fired inside the window the old kick would have run for. */
  shots: number;
}

/**
 * A bot mid-kick, and something walking up behind it.
 *
 * The kick is staged directly rather than waited for: a bot choosing to kick a
 * door needs a locked one it cannot unbolt from its side, on a route it wants,
 * and that is the city's decision rather than the rig's. What is under test is
 * what happens *once it has started*, which is exactly the reported case.
 *
 * **The bot stands on open ground, not at the door**, which looks wrong and is
 * not: `doorTick`'s mid-handle branch reads a clock and nothing else, so where
 * the slab is has no bearing on it. Staged the obvious way — bot planted on the
 * door it is kicking — the zombie was put down wherever the far side of that
 * door happened to be, which is as often as not inside the building, and the
 * bot could not see the thing it was supposed to be reacting to. Measured that
 * way it saw it on **4 of 6** runs one way and **0 of 6** the other, which is
 * the city talking rather than the code. `sawIt` is on the report so that can
 * never quietly happen again.
 */
function doorRun(now0: number): Door | null {
  const { world, bot } = stagedWorld();

  // Any door will do — the kick is staged, so the only thing wanted from it is
  // somewhere for the claim to live.
  let index = -1;
  for (let i = 0; i < world.doors.length; i++) {
    const d = world.doors[i];
    if (d && !d.broken) {
      index = i;
      break;
    }
  }
  if (index < 0) return null;

  const spot = openSpot(world);
  if (!spot) return null;
  bot.x = spot.x;
  bot.y = spot.y;
  const state = world.ai.get('bot-0');
  if (!state) return null;
  state.lastX = bot.x;
  state.lastY = bot.y;
  state.wanderX = bot.x;
  state.wanderY = bot.y;
  state.doorIndex = index;
  state.doorAction = 'kick';
  state.doorBusyUntil = now0 + DOOR_KICK_MS;
  claimDoor(world, index, 'bot-0', state.doorBusyUntil + 2500);

  // Close enough to matter and far enough not to grab: the question is whether
  // the bot lets go of the handle, not what happens after it does.
  const z = makeEntity('walker', 'zombie', bot.x + BOT_SAFE_DIST * 0.6, bot.y);
  world.entities.set('walker', z);

  const out: Door = {
    droppedIt: false,
    heldMs: DOOR_KICK_MS,
    released: false,
    sawIt: false,
    shots: 0,
  };
  let now = now0;
  let done = false;
  for (let i = 0; i < TICKS; i++) {
    z.x = bot.x + BOT_SAFE_DIST * 0.6;
    z.y = bot.y;
    world.shots.length = 0;
    now += TICK_MS;
    tick(world, now, TICK_MS / 1000);
    out.shots += world.shots.length;
    if (state.threatCount > 0) out.sawIt = true;
    if (!done && state.doorBusyUntil === 0) {
      done = true;
      out.heldMs = now - now0;
      // Early, or merely finished? Half a tick of slack for the 30Hz grain.
      out.droppedIt = out.heldMs < DOOR_KICK_MS - TICK_MS;
      out.released = world.doors[index]?.busyBy !== 'bot-0';
    }
    if (now - now0 > DOOR_KICK_MS) break;
  }
  return out;
}

// ------------------------------------------------------------------- run

console.log(`botkite: ${RUNS} runs each way, ${TICKS} ticks apiece\n`);

for (const old of [true, false]) {
  setBotDropsTheGun(old);
  const label = old ? 'OLD (turns its back)' : 'NEW (keeps the gun up)';

  const kites: Kite[] = [];
  const doors: Door[] = [];
  for (let r = 0; r < RUNS; r++) {
    const k = kiteRun(Date.now());
    if (k && k.ticks > 0) kites.push(k);
    const d = doorRun(Date.now());
    if (d) doors.push(d);
  }

  const offTarget = kites.flatMap((k) => k.offTarget);
  const offFeet = kites.flatMap((k) => k.offFootsteps);
  const boltTicks = kites.reduce((a, k) => a + k.ticks, 0);
  const onTarget = kites.reduce((a, k) => a + k.onTarget, 0);

  console.log(`--- ${label}`);
  console.log(`  bolting ticks measured   ${boltTicks} over ${kites.length} runs`);
  console.log(`  gun off the zombie       median ${f1(med(offTarget))}deg`);
  console.log(`  gun off its own feet     median ${f1(med(offFeet))}deg`);
  console.log(
    `  gun on target            ${onTarget}/${boltTicks} ticks (${f1((100 * onTarget) / Math.max(1, boltTicks))}%)`,
  );
  console.log(`  shots fired while bolting ${kites.reduce((a, k) => a + k.shots, 0)}`);
  console.log(`  ground made              median ${f1(med(kites.map((k) => k.gained)))}px`);

  const dropped = doors.filter((d) => d.droppedIt);
  console.log(`  door: saw the zombie     ${doors.filter((d) => d.sawIt).length}/${doors.length}`);
  console.log(`  door: let go of it early ${dropped.length}/${doors.length}`);
  console.log(
    `  door: held on for        median ${f2(med(doors.map((d) => d.heldMs)) / 1000)}s of ${f2(DOOR_KICK_MS / 1000)}s`,
  );
  console.log(`  door: claim handed back  ${doors.filter((d) => d.released).length}/${doors.length}`);
  console.log(`  door: shots in that time ${doors.reduce((a, d) => a + d.shots, 0)}\n`);
}

setBotDropsTheGun(false);
