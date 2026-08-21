/**
 * How often a zombie changes its mind, and whether the horde still fans out.
 *
 * `ZOMBIE_SPREAD_PENALTY` scores prey somebody else is already onto as worse,
 * and `world.targetClaims` — the count it reads — is rebuilt every tick from
 * everybody's current `targetId` while every zombie re-picks at 10Hz. That is
 * best-response against a number the neighbours are moving, and it oscillates:
 * A leaves P for Q, P's claim drops, P is attractive again, A comes back. On
 * screen it is a horde changing target several times a second.
 *
 * `ZOMBIE_TARGET_STICK` damps it. This measures both halves of that claim —
 * that the churn went down, and that the fanning-out it exists to protect did
 * not go down with it.
 *
 * Headless: no socket, no port, so it leaves a game on 8080 alone. Both modes
 * run in ONE process, alternating city by city, because this box is noisy
 * enough that two `npx tsx` invocations are not comparable. The map is not
 * seeded, so how far the outbreak got dominates everything — several cities
 * per mode, and quote a range.
 *
 *   npx tsx targetchurn.ts               # 6 cities (3 per mode), 120s each
 *   CITIES=2 SECONDS=30 npx tsx targetchurn.ts
 */
import {
  createWorld,
  resetWorld,
  rebuildNav,
  rebuildEntityGrid,
  resolveCollisions,
  countSurvivors,
  countZombies,
  findSpawn,
  makeEntity,
  hasLineOfSight,
} from './src/world.js';
import { ENTITY_RADIUS } from '../shared/constants.js';
import { computeFrozen, updateAi, setNoTargetStick } from './src/ai.js';
import { updateDogs } from './src/dog.js';
import { processShooting } from './src/combat.js';
import { updateDucks } from './src/ducks.js';
import { updateFires } from './src/fire.js';
import { updateMines } from './src/mines.js';
import { updateBackup, resolveVehicleCollisions } from './src/backup.js';
import { updateAirSupport } from './src/heli.js';
import { updateEmplacements, resolveEmplacementCollisions } from './src/emplacement.js';
import { TICK_RATE, PATH_BUDGET_PER_TICK, ZOMBIE_TARGET_STICK } from '../shared/constants.js';

const TICK_MS = 1000 / TICK_RATE;
const SECONDS = Number(process.env.SECONDS ?? 120);
const TICKS = Math.round((SECONDS * 1000) / TICK_MS);
const CITIES = Number(process.env.CITIES ?? 6);
/** A switch this soon after the last one is the "erratic" the report is about. */
const RAPID_MS = 500;
/** How often to sample the pack's spread. Once a second is plenty. */
const SPREAD_SAMPLE_TICKS = TICK_RATE;

function pct(xs: number[], p: number): number {
  if (xs.length === 0) return 0;
  const s = xs.slice().sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * p))] ?? 0;
}
const med = (xs: number[]): number => pct(xs, 0.5);

interface CityResult {
  stick: boolean;
  switches: number;
  rapid: number;
  withinSec: number;
  targetSeconds: number;
  gaps: number[];
  worstPerSecond: number;
  spreadSamples: number[];
  zombies: number;
  survivors: number;
}

function runCity(stick: boolean): CityResult {
  setNoTargetStick(!stick);

  const world = createWorld();
  resetWorld(world);

  /** Per zombie: the target it held last tick, and when it last changed. */
  const held = new Map<string, string | null>();
  const lastSwitchAt = new Map<string, number>();
  /** Switch timestamps, kept per zombie only long enough to window them. */
  const recent = new Map<string, number[]>();

  let switches = 0;
  let rapid = 0;
  let withinSec = 0;
  let targetTicks = 0;
  let worstPerSecond = 0;
  const gaps: number[] = [];
  const spreadSamples: number[] = [];

  // A clock that actually advances, or every time-gated piece of work — the
  // 10Hz perception this whole measurement is about, above all — is skipped
  // almost every tick and the harness measures an AI that is not running.
  let clock = Date.now();
  for (let i = 0; i < TICKS; i++) {
    const dt = TICK_MS / 1000;
    clock += TICK_MS;
    const now = clock;
    world.pathBudget = PATH_BUDGET_PER_TICK;

    if (world.navDirty) rebuildNav(world);
    rebuildEntityGrid(world);
    const frozen = computeFrozen(world);
    updateDogs(world, dt, now);
    updateAi(world, now, dt, frozen);
    resolveCollisions(world);
    resolveEmplacementCollisions(world);
    resolveVehicleCollisions(world);
    rebuildEntityGrid(world);
    updateEmplacements(world, now, dt);
    processShooting(world, now, frozen);
    updateAirSupport(world, now, dt);
    updateBackup(world, now, dt);
    updateMines(world, now);
    updateDucks(world, now, dt);
    updateFires(world, now, dt);
    countSurvivors(world);

    // --- read the targeting off the world the tick just produced
    const claimants = new Map<string, number>();
    for (const e of world.entities.values()) {
      if (e.type !== 'zombie') continue;
      if (world.playerIds.has(e.id)) continue;
      const cur = world.ai.get(e.id)?.targetId ?? null;

      if (cur !== null) {
        targetTicks++;
        claimants.set(cur, (claimants.get(cur) ?? 0) + 1);
      }

      const prev = held.get(e.id);
      // Only a swap between two live targets is churn. Acquiring one (null to
      // an id) and losing one are the AI working, not dithering.
      if (prev !== undefined && prev !== null && cur !== null && cur !== prev) {
        switches++;
        const at = lastSwitchAt.get(e.id);
        if (at !== undefined) {
          const gap = now - at;
          gaps.push(gap);
          if (gap < RAPID_MS) rapid++;
          if (gap < 1000) withinSec++;
        }
        lastSwitchAt.set(e.id, now);

        const list = recent.get(e.id) ?? [];
        list.push(now);
        while (list.length > 0 && now - (list[0] ?? 0) >= 1000) list.shift();
        if (list.length > worstPerSecond) worstPerSecond = list.length;
        recent.set(e.id, list);
      }
      held.set(e.id, cur);
    }

    // The control: how many chasers each distinct target has. This is what
    // `spreadsOut` exists to hold down, and what a stickiness margin could
    // plausibly undo — so it is measured alongside rather than assumed.
    if (i % SPREAD_SAMPLE_TICKS === 0) {
      for (const n of claimants.values()) spreadSamples.push(n);
    }
  }

  return {
    stick,
    switches,
    rapid,
    withinSec,
    targetSeconds: (targetTicks * TICK_MS) / 1000,
    gaps,
    worstPerSecond,
    spreadSamples,
    zombies: countZombies(world),
    survivors: world.survivorCount,
  };
}

function report(label: string, rs: CityResult[]): void {
  if (rs.length === 0) return;
  const rate = rs.map((r) => (r.targetSeconds > 0 ? r.switches / r.targetSeconds : 0));
  const rapidShare = rs.map((r) => (r.switches > 0 ? (100 * r.rapid) / r.switches : 0));
  const secShare = rs.map((r) => (r.switches > 0 ? (100 * r.withinSec) / r.switches : 0));
  const allGaps = rs.flatMap((r) => r.gaps);
  const allSpread = rs.flatMap((r) => r.spreadSamples);
  const range = (xs: number[], d: number): string =>
    Math.min(...xs).toFixed(d) + '-' + Math.max(...xs).toFixed(d);

  console.log('');
  console.log('  ' + label);
  console.log('    switches / zombie-second-with-a-target   ' + range(rate, 3));
  console.log('    switches within ' + RAPID_MS + 'ms of the last     ' + range(rapidShare, 1) + ' %');
  console.log('    switches within 1s of the last           ' + range(secShare, 1) + ' %');
  console.log(
    '    gap between switches  p10/med            ' +
      pct(allGaps, 0.1).toFixed(0) +
      ' / ' +
      med(allGaps).toFixed(0) +
      ' ms',
  );
  console.log(
    '    worst switches by one zombie in 1s       ' +
      Math.max(...rs.map((r) => r.worstPerSecond)),
  );
  console.log(
    '    chasers per distinct target  med/p90     ' +
      med(allSpread).toFixed(2) +
      ' / ' +
      pct(allSpread, 0.9).toFixed(2) +
      '   <- control',
  );
  console.log('    zombies alive at end                     ' + rs.map((r) => r.zombies).join(', '));
  console.log('    survivors alive at end                   ' + rs.map((r) => r.survivors).join(', '));
}

/**
 * The staged half: what the margin refuses, and what it must not refuse.
 *
 * A city run says the churn went down. It cannot say *which* switches went
 * with it, and the whole objection to a margin is that it might swallow the
 * one that mattered — somebody who has walked into your face. So this pins
 * three bodies on open ground and asks directly.
 *
 * Everything is pinned every tick. Left free the zombie closes on its target,
 * the geometry the check is about stops holding, and a switch that happened
 * because the distances changed looks exactly like the feature working.
 */
function staged(): void {
  const world = createWorld();
  resetWorld(world);

  // Open ground with a clear line to two spots on the same bearing.
  let base: { x: number; y: number } | null = null;
  let bearing = 0;
  for (let attempt = 0; attempt < 400 && !base; attempt++) {
    const spot = findSpawn(world, ENTITY_RADIUS.zombie);
    for (let b = 0; b < 16; b++) {
      const th = (b / 16) * Math.PI * 2;
      const far = { x: spot.x + Math.cos(th) * 320, y: spot.y + Math.sin(th) * 320 };
      const near = { x: spot.x + Math.cos(th) * 100, y: spot.y + Math.sin(th) * 100 };
      if (world.nav.isBlocked(far.x, far.y) || world.nav.isBlocked(near.x, near.y)) continue;
      if (!hasLineOfSight(world, spot.x, spot.y, far.x, far.y, false, 'zombie')) continue;
      if (!hasLineOfSight(world, spot.x, spot.y, near.x, near.y, false, 'zombie')) continue;
      base = spot;
      bearing = th;
      break;
    }
  }
  if (!base) {
    console.log('  staged: found no open lane in this city, skipped');
    return;
  }

  const at = (d: number): { x: number; y: number } => ({
    x: base.x + Math.cos(bearing) * d,
    y: base.y + Math.sin(bearing) * d,
  });

  /** Zombie holding P at `dP`, then Q appears at `dQ`. Which does it hold? */
  function trial(stick: boolean, dP: number, dQ: number): string {
    setNoTargetStick(!stick);
    world.entities.clear();
    world.ai.clear();
    world.grapples.clear();
    world.targetClaims.clear();

    const z = makeEntity('stage-z', 'zombie', base.x, base.y);
    const p = makeEntity('stage-p', 'human', at(dP).x, at(dP).y);
    const q = makeEntity('stage-q', 'human', at(dQ).x, at(dQ).y);
    world.entities.set(z.id, z);
    world.entities.set(p.id, p);
    world.entities.set(q.id, q);

    const pin = (): void => {
      z.x = base.x;
      z.y = base.y;
      p.x = at(dP).x;
      p.y = at(dP).y;
      q.x = at(dQ).x;
      q.y = at(dQ).y;
    };

    let clock = Date.now();
    let last = '(none)';
    for (let i = 0; i < 40; i++) {
      clock += TICK_MS;
      pin();
      rebuildEntityGrid(world);
      updateAi(world, clock, TICK_MS / 1000, computeFrozen(world));
      pin();

      const state = world.ai.get(z.id);
      if (!state) continue;
      // Hold P for the first few ticks, then let it look again every tick.
      if (i < 5) {
        state.targetId = p.id;
        state.lastSeenX = p.x;
        state.lastSeenY = p.y;
      } else {
        state.nextSenseAt = 0;
        last = state.targetId === p.id ? 'P' : state.targetId === q.id ? 'Q' : '(none)';
      }
    }
    return last;
  }

  console.log('');
  console.log('  staged: a zombie already holding P, when Q appears');
  console.log('    P at 300px           STICK   OLD    expected');
  const rows: Array<[string, number, string]> = [
    ['Q at 100px  (in your face)', 100, 'Q'],
    ['Q at 200px  (clearly better)', 200, 'Q'],
    ['Q at 280px  (marginal)', 280, 'P'],
  ];
  let bad = 0;
  for (const [label, dQ, want] of rows) {
    const withStick = trial(true, 300, dQ);
    const withOld = trial(false, 300, dQ);
    const ok = withStick === want;
    if (!ok) bad++;
    console.log(
      '    ' +
        label.padEnd(30) +
        withStick.padEnd(8) +
        withOld.padEnd(7) +
        want +
        (ok ? '   ok' : '   FAILED'),
    );
  }
  console.log(
    '    ' + (bad === 0 ? 'all 3 as expected' : bad + ' FAILED') + '  (0.7 x 300 = 210px)',
  );
}

staged();

if (CITIES === 0) process.exit(0);

console.log(
  'target churn: ' +
    CITIES +
    ' cities x ' +
    SECONDS +
    's, alternating in one process. ZOMBIE_TARGET_STICK=' +
    ZOMBIE_TARGET_STICK,
);

const on: CityResult[] = [];
const off: CityResult[] = [];
for (let c = 0; c < CITIES; c++) {
  const stick = c % 2 === 0;
  const t0 = performance.now();
  const r = runCity(stick);
  (stick ? on : off).push(r);
  console.log(
    '  city ' +
      (c + 1) +
      '/' +
      CITIES +
      '  ' +
      (stick ? 'STICK' : ' OLD ') +
      '  ' +
      r.switches +
      ' switches, ' +
      r.zombies +
      ' zombies, ' +
      ((performance.now() - t0) / 1000).toFixed(1) +
      's',
  );
}

report('OLD  (no margin - the behaviour reported)', off);
report('STICK (ZOMBIE_TARGET_STICK)', on);
