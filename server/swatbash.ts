/**
 * Headless check on one report: *"can we let my swat NPC characters that are
 * called in to use the bash ability with their shield just like their blue bot
 * officer counterparts. except instead of using stamina its on a 5 second
 * cooldown."*
 *
 * No socket, no port, so it leaves a game on 8080 alone.
 *   npx tsx swatbash.ts
 *   RUNS=12 npx tsx swatbash.ts
 *
 * Both behaviours run in ONE process on the same seeded city, and
 * `setSwatNeverBashes` is the gate. It is **kept**: this was an absence rather
 * than a wrong line — the shield went up when it was issued and nothing ever
 * threw it — and an absence has nothing to read wrong. "The operator bashed"
 * means nothing without "and it never did before".
 *
 * Modelled on `botfight.ts`'s bash rig, and it inherits both of that file's
 * traps: the clock is taken fresh per staging rather than once for the whole
 * run (`resetWorld` stamps every fresh AiState with the real `Date.now()`),
 * and the city is pinned with `withSeed` so both modes are handed the same one.
 *
 * **The operator is staged by hand**, because the kit is inline in `unload`
 * rather than in anything else can call — so the rig checks its own staging:
 * an operator that never fires never reached the fight branch, and a run where
 * that happens is reporting the staging rather than the code.
 *
 * Not typechecked by `npx tsc --noEmit` in `server/`, which only includes
 * `src`. Check it explicitly:
 *   npx tsc --noEmit --target ES2022 --module ESNext --moduleResolution Bundler
 *     --strict --skipLibCheck --types node swatbash.ts
 */
import {
  createWorld,
  resetWorld,
  rebuildNav,
  rebuildEntityGrid,
  resolveCollisions,
  makeEntity,
  newAiState,
  type World,
  type Entity,
} from './src/world.js';
import { computeFrozen, updateAi, setSwatNeverBashes, setLegacyBotCombat } from './src/ai.js';
import { processShooting, setPlayerHeldCannotBash } from './src/combat.js';
import { newInventory } from './src/inventory.js';
import {
  TICK_RATE,
  setCityPopulation,
  PATH_NODE_BUDGET_PER_TICK,
  ZOMBIE_RADIUS,
  SHIELD_BASH_RANGE,
  SHIELD_BASH_PUSH,
  SHIELD_POINTS,
  SWAT_BASH_COOLDOWN_MS,
  SHIELD_BASH_COOLDOWN_MS,
  SHIELD_BASH_STAMINA,
  SHIELD_BASH_STAMINA_SHARE,
  STAMINA_MAX,
  SWAT_RIFLE_AMMO,
  GRAPPLE_MAX_MS,
} from '../shared/constants.js';

const TICK_MS = 1000 / TICK_RATE;
const RUNS = Number(process.env.RUNS ?? 12);
const TICKS = Number(process.env.TICKS ?? 600); // 20s
/** Long enough to outlast a grip: `GRAPPLE_MAX_MS` is 2s. */
const PIN_TICKS = Number(process.env.PIN_TICKS ?? 120); // 4s

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

/** Somewhere in the open, well clear of geometry, for a scuffle to happen on. */
function openSpot(world: World): { x: number; y: number } | null {
  for (let i = 0; i < 4000; i++) {
    const x = 300 + Math.random() * (world.map.width - 600);
    const y = 300 + Math.random() * (world.map.height - 600);
    let clear = true;
    for (let a = 0; a < 8 && clear; a++) {
      const t = (a / 8) * Math.PI * 2;
      for (let r = 0; r <= 200; r += 25) {
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

type Kind = 'swat' | 'bot';

/**
 * One officer with a shield, alone in an empty city.
 *
 * For SWAT, `world.swat` is what `officerGrade` reads for the tier and
 * `world.dispatched` is what keeps a standing order from being rescanned; the
 * shield and the rifle are the bag `unload` hands out. For a bot, `populate`
 * does all of that — the rig only takes the roll out of the bag, since what
 * `giveStartingItem` happened to hand over would otherwise decide the run.
 *
 * Everybody else is deleted either way, so the only thing in the world that can
 * move the staged zombie is this one man.
 */
function stagedOfficer(kind: Kind): { world: World; op: Entity; id: string } | null {
  const world = createWorld();
  if (kind === 'bot') world.botOfficerCount = 1;
  resetWorld(world);

  const id = kind === 'bot' ? 'bot-0' : 'swat-0';
  const keep = kind === 'bot' ? world.entities.get(id) : undefined;
  if (kind === 'bot' && !keep) return null;
  for (const other of [...world.entities.keys()]) {
    if (other === id) continue;
    world.entities.delete(other);
    world.ai.delete(other);
  }
  world.cityOfficers.clear();

  const spot = openSpot(world);
  if (!spot) return null;

  let op: Entity;
  if (keep) {
    op = keep;
    op.x = spot.x;
    op.y = spot.y;
  } else {
    op = makeEntity(id, 'officer', spot.x, spot.y);
    world.entities.set(id, op);
    const state = newAiState(Date.now(), op.x, op.y);
    state.squadSlot = 0;
    state.sweeps = true;
    world.ai.set(id, state);
    world.dispatched.add(id);
    world.swat.add(id);
  }

  const state = world.ai.get(id);
  if (!state) return null;
  state.lastX = op.x;
  state.lastY = op.y;
  state.wanderX = op.x;
  state.wanderY = op.y;
  state.botStamina = STAMINA_MAX;
  state.botWinded = false;

  const inv = newInventory();
  for (let i = 0; i < inv.guns.length; i++) inv.guns[i] = null;
  inv.guns[0] = { item: 'semiAutoRifle', ammo: SWAT_RIFLE_AMMO };
  inv.activeSlot = 1;
  inv.utilities.push('riotShield');
  inv.shield = SHIELD_POINTS;
  inv.shieldUp = true;
  world.inventories.set(id, inv);

  rebuildEntityGrid(world);
  return { world, op, id };
}

interface Bash {
  /** Separate shoves, counted off the edge of the wire flag. */
  bashes: number;
  /** Furthest the pinned zombie was ever moved off its pin, in px. */
  shoved: number;
  /** Gaps between consecutive shoves, in ms — the cooldown, measured. */
  gaps: number[];
  /** Rounds fired. The control: no shots means the fight branch never ran. */
  shots: number;
}

/**
 * A shield, and something on its chest. The zombie is re-pinned every tick and
 * is unkillable, so the only thing that can move it off its pin is a shove —
 * and the rifle cannot end the run early either, which is the trap
 * `botfight.ts` records for its kite measurement.
 */
function bashRun(seed: number, kind: Kind = 'swat'): Bash | null {
  const staged = withSeed(seed, () => stagedOfficer(kind));
  if (!staged) return null;
  const { world, op, id } = staged;

  const z = makeEntity('chaser', 'zombie', op.x, op.y);
  z.radius = ZOMBIE_RADIUS;
  z.health = 1e9;
  z.maxHealth = 1e9;
  world.entities.set('chaser', z);
  world.ai.delete('chaser');

  const out: Bash = { bashes: 0, shoved: 0, gaps: [], shots: 0 };
  let bearing = Math.random() * Math.PI * 2;
  let now = Date.now();
  let showing = false;
  let lastAt = 0;
  for (let i = 0; i < TICKS; i++) {
    // **He is held out of every grapple, and without this the rig measures the
    // wrong thing.** A zombie pinned on his chest takes hold within a second or
    // two, and what follows is a grapple, a shove out of it, and then the
    // twenty seconds of `OFFICER_FLEE_MS` if the grip was served out instead —
    // so the reading came out at about one shove a run rather than one every
    // cooldown, and it was measuring the grapple cycle rather than the clock.
    // What a pinned officer does is the second staging below, where it is the
    // whole point rather than an interruption.
    world.grappleImmune.set(id, now + 60_000);
    const gap = SHIELD_BASH_RANGE * 0.5;
    const px = op.x + Math.cos(bearing) * gap;
    const py = op.y + Math.sin(bearing) * gap;
    z.x = px;
    z.y = py;
    now += TICK_MS;
    world.shots.length = 0;
    tick(world, now, TICK_MS / 1000);
    out.shots += world.shots.length;
    out.shoved = Math.max(out.shoved, Math.hypot(z.x - px, z.y - py));
    const on = (world.bashUntil.get(id) ?? 0) > now;
    if (on && !showing) {
      out.bashes++;
      if (lastAt !== 0) out.gaps.push(now - lastAt);
      lastAt = now;
    }
    showing = on;
    bearing = Math.atan2(op.y - z.y, op.x - z.x) + Math.PI;
  }
  return out;
}

interface Pinned {
  /** Ticks the grip lasted, in ms, or the whole run if it never ended. */
  heldMs: number;
  /** Did it end before its own deadline — broken rather than served out? */
  broke: boolean;
  /** Shoves thrown while pinned. */
  bashes: number;
  /** What the shove took off the bar. Bots only; a SWAT operator has no bar. */
  staminaSpent: number;
}

/**
 * **Something already has hold of him.**
 *
 * The grip is built by hand rather than walked into, and that is a deliberate
 * trade: a zombie left to take hold on its own arrives at an unpredictable
 * moment, and for SWAT — whose bash is on a five-second clock — a shove thrown
 * a second before the grab would decide the whole run. Staged, the cooldown is
 * clear at the moment the hands go on, which is the case being asked about.
 * The cost is that the session has to match what `attemptGrab` builds; it is
 * three fields, and TypeScript is what keeps them honest.
 *
 * `escapeAt` is null on purpose — the roll that lets a grip break in the
 * victim's own favour would be a second way out, and the reading could not
 * tell the two apart. The only way out of this one is the shield.
 *
 * The zombie has no `AiState`, so it cannot take hold again once it is shoved
 * off: what is measured is the escape, not the next grab.
 */
function pinnedRun(seed: number, kind: Kind): Pinned | null {
  const staged = withSeed(seed, () => stagedOfficer(kind));
  if (!staged) return null;
  const { world, op, id } = staged;

  const z = makeEntity('chaser', 'zombie', op.x + 20, op.y);
  z.radius = ZOMBIE_RADIUS;
  z.health = 1e9;
  z.maxHealth = 1e9;
  world.entities.set('chaser', z);
  world.ai.delete('chaser');
  rebuildEntityGrid(world);

  let now = Date.now();
  const endsAt = now + GRAPPLE_MAX_MS;
  world.grapples.set(id, { zombieIds: new Set(['chaser']), endsAt, escapeAt: null });

  const state = world.ai.get(id);
  const before = state?.botStamina ?? 0;
  const out: Pinned = { heldMs: 0, broke: false, bashes: 0, staminaSpent: 0 };
  let showing = false;
  const start = now;
  for (let i = 0; i < PIN_TICKS; i++) {
    now += TICK_MS;
    tick(world, now, TICK_MS / 1000);
    const on = (world.bashUntil.get(id) ?? 0) > now;
    if (on && !showing) out.bashes++;
    showing = on;
    if (!world.grapples.has(id)) {
      out.heldMs = now - start;
      out.broke = now < endsAt;
      out.staminaSpent = before - (state?.botStamina ?? before);
      return out;
    }
  }
  out.heldMs = now - start;
  out.staminaSpent = before - (state?.botStamina ?? before);
  return out;
}

/**
 * **And a player with the same shield, held the same way.**
 *
 * Driven through the real `processShooting` with a real `Command`, because the
 * player path is a different one end to end: right-click is reported raw and
 * resolved server-side, and what is under test is the gate in front of that
 * resolution. A tap is the button down for one tick and up on the next — 33ms,
 * well inside `TAP_MAX_MS`.
 */
function playerPinnedRun(seed: number): Pinned | null {
  const staged = withSeed(seed, () => stagedOfficer('swat'));
  if (!staged) return null;
  const { world, op, id } = staged;
  // A player rather than an NPC: no AI runs for one, and `processShooting`
  // walks `playerIds`.
  world.playerIds.add(id);

  const z = makeEntity('chaser', 'zombie', op.x + 20, op.y);
  z.radius = ZOMBIE_RADIUS;
  z.health = 1e9;
  z.maxHealth = 1e9;
  world.entities.set('chaser', z);
  world.ai.delete('chaser');
  rebuildEntityGrid(world);

  let now = Date.now();
  const endsAt = now + GRAPPLE_MAX_MS;
  world.grapples.set(id, { zombieIds: new Set(['chaser']), endsAt, escapeAt: null });
  op.facing = Math.atan2(z.y - op.y, z.x - op.x);

  const out: Pinned = { heldMs: 0, broke: false, bashes: 0, staminaSpent: 0 };
  let showing = false;
  const start = now;
  for (let i = 0; i < PIN_TICKS; i++) {
    now += TICK_MS;
    // Down on the first tick, up on the second: one tap, then nothing, so a
    // second shove cannot quietly do the work of the first.
    world.commands.set(id, {
      input: { up: false, down: false, left: false, right: false },
      aim: op.facing,
      aimX: z.x,
      aimY: z.y,
      shooting: false,
      sprint: false,
      interact: false,
      rightDown: i === 0,
    });
    world.pathBudget = PATH_NODE_BUDGET_PER_TICK;
    rebuildEntityGrid(world);
    const frozen = computeFrozen(world);
    updateAi(world, now, TICK_MS / 1000, frozen);
    processShooting(world, now, frozen);
    resolveCollisions(world);
    const on = (world.bashUntil.get(id) ?? 0) > now;
    if (on && !showing) out.bashes++;
    showing = on;
    if (!world.grapples.has(id)) {
      out.heldMs = now - start;
      out.broke = now < endsAt;
      out.staminaSpent = STAMINA_MAX - (world.stamina.get(id) ?? STAMINA_MAX);
      return out;
    }
  }
  out.heldMs = now - start;
  out.staminaSpent = STAMINA_MAX - (world.stamina.get(id) ?? STAMINA_MAX);
  return out;
}

// --------------------------------------------------------------- run

let failed = 0;
function check(ok: boolean, label: string, detail: string): void {
  if (!ok) failed++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}  ${detail}`);
}

setCityPopulation(300);

const modes: { name: string; legacy: boolean }[] = [
  { name: 'OLD (worn, never thrown)', legacy: true },
  { name: 'NEW', legacy: false },
];
const got: Record<string, Bash[]> = {};
type Held = Kind | 'player';
const pinned: Record<string, Record<Held, Pinned[]>> = {};

for (const m of modes) {
  setSwatNeverBashes(m.legacy);
  setLegacyBotCombat(m.legacy);
  const runs: Bash[] = [];
  for (let s = 0; s < RUNS; s++) {
    const r = bashRun(1000 + s);
    if (r) runs.push(r);
  }
  got[m.name] = runs;

  pinned[m.name] = { swat: [], bot: [], player: [] };
  for (const kind of ['swat', 'bot'] as const) {
    for (let s = 0; s < RUNS; s++) {
      const r = pinnedRun(2000 + s, kind);
      if (r) pinned[m.name][kind].push(r);
    }
  }

  // The player path has its own gate, because it is a different one end to
  // end: right-click resolved server-side rather than an AI branch.
  setPlayerHeldCannotBash(m.legacy);
  for (let s = 0; s < RUNS; s++) {
    const r = playerPinnedRun(2000 + s);
    if (r) pinned[m.name].player.push(r);
  }
}
setSwatNeverBashes(false);
setLegacyBotCombat(false);
setPlayerHeldCannotBash(false);

const old = got[modes[0].name];
const fresh = got[modes[1].name];

console.log(
  `\na riot shield and a zombie on its chest  (${RUNS} cities each, ${(TICKS / TICK_RATE) | 0}s)\n`,
);
for (const m of modes) {
  const rs = got[m.name];
  const total = rs.reduce((a, r) => a + r.bashes, 0);
  const gaps = rs.flatMap((r) => r.gaps);
  console.log(
    `  ${m.name.padEnd(26)} bashes ${String(total).padStart(4)}` +
      `   runs that bashed ${rs.filter((r) => r.bashes > 0).length}/${rs.length}` +
      `   furthest shove ${f1(Math.max(0, ...rs.map((r) => r.shoved)))}px` +
      `   gap median ${gaps.length ? med(gaps) | 0 : 0}ms`,
  );
}
console.log('');

const newTotal = fresh.reduce((a, r) => a + r.bashes, 0);
const oldTotal = old.reduce((a, r) => a + r.bashes, 0);
const newGaps = fresh.flatMap((r) => r.gaps);

check(oldTotal === 0, 'the control never bashed', `${oldTotal} shoves`);
// Not zero: two bodies pinned inside each other's radii are pushed apart by
// `resolveCollisions` every tick whatever the shield is doing, and that is a
// few pixels. What a shove is worth is `SHIELD_BASH_PUSH`, so the bar is well
// under it and well over the separation.
check(
  old.every((r) => r.shoved < SHIELD_BASH_PUSH / 2),
  'and never threw it further than collision does',
  `worst ${f1(Math.max(0, ...old.map((r) => r.shoved)))}px against a ${SHIELD_BASH_PUSH}px push`,
);
check(
  fresh.every((r) => r.bashes > 0),
  'an operator with a zombie on it bashes',
  `${fresh.filter((r) => r.bashes > 0).length}/${fresh.length} runs, ${newTotal} shoves`,
);
check(
  Math.max(0, ...fresh.map((r) => r.shoved)) >= SHIELD_BASH_PUSH * 0.8,
  'and the shove lands',
  `furthest ${f1(Math.max(0, ...fresh.map((r) => r.shoved)))}px against a ${SHIELD_BASH_PUSH}px push`,
);
// The whole of what a dispatched officer pays. Measured off the wire flag's
// own edges rather than read out of the constant, and allowed a tick of 30Hz
// granularity either way.
const lo = SWAT_BASH_COOLDOWN_MS - TICK_MS * 2;
check(
  newGaps.length > 0 && newGaps.every((g) => g >= lo),
  'five seconds between shoves, never less',
  `${newGaps.length} gaps, shortest ${Math.min(...newGaps) | 0}ms against ${SWAT_BASH_COOLDOWN_MS}`,
);
check(
  newGaps.length > 0 && med(newGaps) < SWAT_BASH_COOLDOWN_MS + 1000,
  '...and it does come round again',
  `median ${med(newGaps) | 0}ms`,
);
// The control that says the rig staged a fighting SWAT operator rather than a
// statue: no shots means the fight branch never ran, and nothing below it —
// the bash included — was ever reached.
check(
  fresh.every((r) => r.shots > 0),
  'the staged operator is fighting  (control)',
  `${fresh.filter((r) => r.shots > 0).length}/${fresh.length} runs fired`,
);
check(
  SWAT_BASH_COOLDOWN_MS > SHIELD_BASH_COOLDOWN_MS,
  "and it is slower than a player's  (control)",
  `${SWAT_BASH_COOLDOWN_MS}ms against ${SHIELD_BASH_COOLDOWN_MS}`,
);

console.log(`\nsomething already has hold of him  (${RUNS} cities each, grip ${GRAPPLE_MAX_MS}ms)\n`);
for (const kind of ['swat', 'bot', 'player'] as const) {
  for (const m of modes) {
    const rs = pinned[m.name][kind];
    console.log(
      `  ${kind.toUpperCase().padEnd(5)} ${m.name.padEnd(26)}` +
        ` shoves ${String(rs.reduce((a, r) => a + r.bashes, 0)).padStart(3)}` +
        `   broke the grip ${rs.filter((r) => r.broke).length}/${rs.length}` +
        `   held for ${med(rs.map((r) => r.heldMs)) | 0}ms` +
        (kind === 'swat' ? '' : `   bar spent ${f1(med(rs.map((r) => r.staminaSpent)))}`),
    );
  }
}
console.log('');

for (const kind of ['swat', 'bot', 'player'] as const) {
  const before = pinned[modes[0].name][kind];
  const after = pinned[modes[1].name][kind];
  check(
    before.length > 0 && before.every((r) => r.bashes === 0 && !r.broke),
    `${kind}: the control is held for the whole grip`,
    `${before.filter((r) => r.broke).length}/${before.length} broke it, held ${med(before.map((r) => r.heldMs)) | 0}ms`,
  );
  check(
    after.length > 0 && after.every((r) => r.broke),
    `${kind}: pinned, it shoves its way out`,
    `${after.filter((r) => r.broke).length}/${after.length} broke it, held ${med(after.map((r) => r.heldMs)) | 0}ms`,
  );
  check(
    med(after.map((r) => r.heldMs)) < med(before.map((r) => r.heldMs)),
    `${kind}: ...and far sooner than the grip would have ended`,
    `${med(after.map((r) => r.heldMs)) | 0}ms against ${med(before.map((r) => r.heldMs)) | 0}ms`,
  );
}

// A quarter of the bar, which is what was asked for — and read off the bar
// itself rather than off the constant, so a cost that had quietly stopped
// being charged would show up as a zero rather than as agreement with itself.
const bots = pinned[modes[1].name].bot;
check(
  bots.length > 0 &&
    bots.every(
      (r) => Math.abs(r.staminaSpent - r.bashes * STAMINA_MAX * SHIELD_BASH_STAMINA_SHARE) < 0.01,
    ),
  'a bot pays a quarter of its bar a shove',
  `${f1(med(bots.map((r) => r.staminaSpent)))} off ${STAMINA_MAX} for ${med(bots.map((r) => r.bashes))} shove(s)`,
);
check(
  Math.abs(SHIELD_BASH_STAMINA - STAMINA_MAX * 0.25) < 0.01,
  '...which is what SHIELD_BASH_STAMINA is  (control)',
  `${SHIELD_BASH_STAMINA} of ${STAMINA_MAX}`,
);
const players = pinned[modes[1].name].player;
check(
  players.length > 0 &&
    players.every(
      (r) => Math.abs(r.staminaSpent - r.bashes * STAMINA_MAX * SHIELD_BASH_STAMINA_SHARE) < 0.01,
    ),
  'and a player pays it out of the same bar',
  `${f1(med(players.map((r) => r.staminaSpent)))} off ${STAMINA_MAX} for ${med(players.map((r) => r.bashes))} shove(s)`,
);

console.log(`\n${failed} FAILED\n`);
