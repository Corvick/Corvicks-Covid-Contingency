/**
 * Grapple: how long one lasts, and what it ends in.
 *
 * Headless — no socket, no port, so it leaves a game on 8080 alone.
 *
 * It is a *check* rather than a measurement: every line below has an expected
 * answer and the run ends in a verdict. Two of the things it guards are
 * load-bearing and would both break silently.
 *
 *   - **Kevlar is absolute.** It is an early return in `resolveGrapple`, so
 *     anything inserted above it silently turns the vest into a modifier.
 *   - **A pile pulls the deadline in and never pushes it out.** That is a
 *     `Math.min` in `attemptGrab`; written as a plain assignment it reads
 *     identically and quietly hands the victim extra time.
 *
 *   npx tsx grapplecheck.ts
 *   TRIALS=2000 npx tsx grapplecheck.ts
 */
import {
  createWorld, resetWorld, makeEntity, newAiState, findSpawn,
  rebuildEntityGrid, resolveCollisions, countSurvivors, type Entity, type World,
} from './src/world.js';
import { computeFrozen, updateAi, attemptGrab } from './src/ai.js';
import { newInventory } from './src/inventory.js';
import {
  TICK_RATE, ENTITY_RADIUS, PATH_BUDGET_PER_TICK,
  GRAPPLE_MIN_MS, GRAPPLE_MAX_MS, GRAPPLE_NO_ESCAPE_AT, GRAPPLE_PILE_TURN_MS,
  KEVLAR_GRAPPLE_MS, INSTANT_INFECT_BASE, BASE_ESCAPE_CHANCE,
  INSTANT_INFECT_PER_EXTRA_ZOMBIE,
  HUMAN_RADIUS, ZOMBIE_RADIUS, GRAPPLE_REACH_BONUS,
} from '../shared/constants.js';

const TICK_MS = 1000 / TICK_RATE;
const TRIALS = Number(process.env.TRIALS ?? 600);

const world = createWorld();
resetWorld(world);
const spot = findSpawn(world, ENTITY_RADIUS.officer);

interface Outcome { turned: boolean; bitten: boolean; clean: boolean; ms: number }

/** N zombies take hold of one civilian on open ground. What happens? */
function trial(zombies: number, kevlar: boolean): Outcome {
  world.entities.clear();
  world.ai.clear();
  world.grapples.clear();
  world.grappleImmune.clear();
  world.grappleCounts.clear();
  world.pendingInfections.clear();
  world.inventories.clear();

  const victim = makeEntity('vic', 'human', spot.x, spot.y);
  world.entities.set(victim.id, victim);
  world.ai.set(victim.id, newAiState(Date.now(), victim.x, victim.y));
  if (kevlar) {
    const inv = newInventory();
    inv.kevlar = 3;
    inv.utilities.push('kevlar');
    world.inventories.set(victim.id, inv);
  }

  let clock = Date.now();
  const zs: Entity[] = [];
  for (let i = 0; i < zombies; i++) {
    const z = makeEntity('z' + i, 'zombie', spot.x + 12 + i * 4, spot.y);
    world.entities.set(z.id, z);
    world.ai.set(z.id, newAiState(clock, z.x, z.y));
    zs.push(z);
  }

  // The real roll the AI makes: average of two randoms across the window.
  const roll = (Math.random() + Math.random()) / 2;
  const holdMs = GRAPPLE_MIN_MS + roll * (GRAPPLE_MAX_MS - GRAPPLE_MIN_MS);
  const started = clock;
  for (const z of zs) attemptGrab(world, z, victim, clock, holdMs);

  for (let i = 0; i < TICK_RATE * 6; i++) {
    clock += TICK_MS;
    world.pathBudget = PATH_BUDGET_PER_TICK;
    // Pin, so nobody wanders off and re-grabs and muddles the outcome.
    victim.x = spot.x; victim.y = spot.y;
    zs.forEach((z, k) => { z.x = spot.x + 12 + k * 4; z.y = spot.y; });
    rebuildEntityGrid(world);
    updateAi(world, clock, TICK_MS / 1000, computeFrozen(world));
    countSurvivors(world);
    if (!world.grapples.has(victim.id)) {
      const alive = world.entities.get(victim.id);
      const turned = !alive || alive.type === 'zombie';
      return {
        turned,
        bitten: !turned && world.pendingInfections.has(victim.id),
        clean: !turned && !world.pendingInfections.has(victim.id),
        ms: clock - started,
      };
    }
  }
  return { turned: false, bitten: false, clean: false, ms: -1 };
}

let failures = 0;
function check(ok: boolean, what: string): void {
  if (!ok) { failures++; console.log('    FAILED: ' + what); }
}

function run(label: string, zombies: number, kevlar = false): void {
  let turned = 0, bitten = 0, clean = 0, unresolved = 0;
  const times: number[] = [];
  for (let i = 0; i < TRIALS; i++) {
    const o = trial(zombies, kevlar);
    if (o.ms < 0) { unresolved++; continue; }
    times.push(o.ms);
    if (o.turned) turned++;
    else if (o.bitten) bitten++;
    else clean++;
  }
  const t = times.slice().sort((a, b) => a - b);
  const pc = (k: number) => ((100 * k) / TRIALS).toFixed(1).padStart(5) + '%';
  console.log(
    '  ' + label.padEnd(30) +
    'turned ' + pc(turned) + '   bitten ' + pc(bitten) + '   clean ' + pc(clean) +
    '   held ' + (t[0] ?? 0) + '-' + (t[t.length - 1] ?? 0) + 'ms' +
    (unresolved ? '  UNRESOLVED ' + unresolved : ''),
  );
  check(unresolved === 0, label + ': every grab resolves');
  const longest = t[t.length - 1] ?? 0;
  if (kevlar) {
    check(turned === 0 && bitten === 0, 'kevlar denies a pile outright');
    check(longest < KEVLAR_GRAPPLE_MS + 2 * (1000 / TICK_RATE), 'kevlar scuffle stays short');
  } else if (zombies >= GRAPPLE_NO_ESCAPE_AT) {
    check(turned === TRIALS, 'a pile turns every time');
    check(longest < GRAPPLE_PILE_TURN_MS + 2 * (1000 / TICK_RATE), 'a pile ends within its window');
  } else {
    check(longest <= GRAPPLE_MAX_MS + 2 * (1000 / TICK_RATE), label + ': nothing outlasts the ceiling');
    // 0.95 x the instant chance, with a wide band so this is not a flake.
    // The extra-zombie step has to be in here: applying the one-zombie figure
    // to a two-zombie pile failed this check on perfectly correct code, which
    // is the harness being wrong rather than the game.
    const want =
      100 * (1 - BASE_ESCAPE_CHANCE) *
      (INSTANT_INFECT_BASE + (zombies - 1) * INSTANT_INFECT_PER_EXTRA_ZOMBIE);
    const got = (100 * turned) / TRIALS;
    check(Math.abs(got - want) < 8, label + ': turn rate near ' + want.toFixed(1) + '% (got ' + got.toFixed(1) + ')');
  }
}

console.log('GRAPPLE_MIN_MS=' + GRAPPLE_MIN_MS + '  GRAPPLE_MAX_MS=' + GRAPPLE_MAX_MS +
  '  INSTANT_INFECT_BASE=' + INSTANT_INFECT_BASE +
  '  pile at ' + GRAPPLE_NO_ESCAPE_AT + ' -> ' + GRAPPLE_PILE_TURN_MS + 'ms');
console.log('');
console.log(TRIALS + ' staged grabs on open ground, one civilian:');
run('1 zombie', 1);
run('2 zombies', 2);
run('3 zombies (a pile)', 3);
run('3 zombies, victim in kevlar', 3, true);

// --- the invariant a plain assignment would have broken
console.log('');
console.log('a third joining a grip already due to end sooner:');
world.entities.clear(); world.ai.clear(); world.grapples.clear();
world.grappleImmune.clear(); world.inventories.clear();
const v = makeEntity('vic2', 'human', spot.x, spot.y);
world.entities.set(v.id, v);
const now = Date.now();
const za = makeEntity('za', 'zombie', spot.x + 12, spot.y);
const zb = makeEntity('zb', 'zombie', spot.x + 16, spot.y);
const zc = makeEntity('zc', 'zombie', spot.x + 20, spot.y);
for (const z of [za, zb, zc]) world.entities.set(z.id, z);
attemptGrab(world, za, v, now, 300); // a scuffle already nearly over
const after1 = world.grapples.get(v.id)!.endsAt - now;
attemptGrab(world, zb, v, now, 300);
const after2 = world.grapples.get(v.id)!.endsAt - now;
attemptGrab(world, zc, v, now, 300);
const after3 = world.grapples.get(v.id)!.endsAt - now;
check(after3 <= after1, 'a pile never lengthens a short grip');
console.log('  one zombie, 300ms hold      endsAt +' + after1 + 'ms');
console.log('  second joins                endsAt +' + after2 + 'ms');
console.log('  third joins (pile)          endsAt +' + after3 + 'ms   ' +
  (after3 <= after1 ? 'ok, not lengthened' : 'FAILED - the pile pushed it back'));

// And the same with a long grip, where the pile should pull it in.
world.grapples.clear();
attemptGrab(world, za, v, now, 1900);
const long1 = world.grapples.get(v.id)!.endsAt - now;
attemptGrab(world, zb, v, now, 1900);
attemptGrab(world, zc, v, now, 1900);
const long3 = world.grapples.get(v.id)!.endsAt - now;
check(long3 === GRAPPLE_PILE_TURN_MS, 'a pile pulls a long grip in');
console.log('  one zombie, 1900ms hold     endsAt +' + long1 + 'ms');
console.log('  third joins (pile)          endsAt +' + long3 + 'ms   ' +
  (long3 === GRAPPLE_PILE_TURN_MS ? 'ok, pulled in to ' + GRAPPLE_PILE_TURN_MS : 'FAILED'));
console.log('');
console.log('  (kevlar scuffle is ' + KEVLAR_GRAPPLE_MS + 'ms and must stay that short;');
console.log('   clean-escape roll above the turn is ' + (100 * BASE_ESCAPE_CHANCE).toFixed(0) + '%)');

// --- when an escape lands, read straight off the session rather than simulated
console.log('');
console.log('when a grip breaks in the victim\'s favour:');
{
  const SAMPLES = 20000;
  let scheduled = 0;
  const at: number[] = [];
  const bucket = [0, 0, 0, 0, 0];
  for (let i = 0; i < SAMPLES; i++) {
    world.grapples.clear();
    const t0 = Date.now();
    attemptGrab(world, za, v, t0, 1500);
    const sess = world.grapples.get(v.id)!;
    if (sess.escapeAt === null) continue;
    scheduled++;
    const frac = (sess.escapeAt - t0) / (sess.endsAt - t0);
    at.push(frac);
    bucket[Math.min(4, Math.floor(frac * 5))]++;
  }
  const rate = (100 * scheduled) / SAMPLES;
  const sorted = at.slice().sort((a, b) => a - b);
  console.log('  grips that will break        ' + rate.toFixed(1) + '%  (want ' +
    (100 * BASE_ESCAPE_CHANCE).toFixed(0) + '%)');
  console.log('  when, as a share of the grip  min ' + (sorted[0] ?? 0).toFixed(3) +
    '  med ' + (sorted[Math.floor(sorted.length / 2)] ?? 0).toFixed(2) +
    '  max ' + (sorted[sorted.length - 1] ?? 0).toFixed(3));
  console.log('  fifths of the window          ' +
    bucket.map((b) => ((100 * b) / scheduled).toFixed(1) + '%').join('  '));
  check(Math.abs(rate - 100 * BASE_ESCAPE_CHANCE) < 1.5, 'escape rate matches BASE_ESCAPE_CHANCE');
  // Uniform across the window is the whole point: an escape that always landed
  // at the deadline is the behaviour this replaced, and one that always landed
  // at the start would be a grab that never happened.
  check(bucket.every((b) => Math.abs((100 * b) / scheduled - 20) < 4), 'escapes spread across the grip');
  check((sorted[0] ?? 1) < 0.05 && (sorted[sorted.length - 1] ?? 0) > 0.95, 'escapes reach both ends');
}

// --- and that letting go actually lets go
//
// This is the one that was broken and the one most likely to break again,
// because it is an absence rather than a line: nothing granted a released
// victim any immunity, so the zombie standing on them re-took hold on the next
// tick — 100% of releases at a median of 33ms, never further than 31px against
// a 32px reach. Speed cannot fix that; only a window can. Anything that ends a
// grip in the victim's favour has to go through `getsClear`.
console.log('');
console.log('after a release, does the victim actually get a run?');
{
  const REACH = HUMAN_RADIUS + ZOMBIE_RADIUS + GRAPPLE_REACH_BONUS;
  const WATCH_MS = 9000;
  let stillFree = 0;
  const regrab: number[] = [];
  const gaps: number[] = [];
  let released = 0;
  let instantRegrab = 0;

  for (let t = 0; t < 200; t++) {
    world.entities.clear(); world.ai.clear(); world.grapples.clear();
    world.grappleImmune.clear(); world.grappleCounts.clear();
    world.pendingInfections.clear(); world.speedBoosts.clear(); world.inventories.clear();

    let clock = Date.now();
    const vic = makeEntity('vic', 'human', spot.x, spot.y);
    const zed = makeEntity('z', 'zombie', spot.x + 20, spot.y);
    world.entities.set(vic.id, vic);
    world.entities.set(zed.id, zed);
    world.ai.set(vic.id, newAiState(clock, vic.x, vic.y));
    world.ai.set(zed.id, newAiState(clock, zed.x, zed.y));
    attemptGrab(world, zed, vic, clock, 1200);

    let letGo = -1;
    let peak = 0;
    // The cap has to clear the grip (up to GRAPPLE_MAX_MS) *plus* the whole
    // watch window, or `stillFree` can never be incremented and the harness
    // reports a confident zero it structurally cannot measure.
    for (let i = 0; i < TICK_RATE * 14; i++) {
      clock += TICK_MS;
      world.pathBudget = PATH_BUDGET_PER_TICK;
      rebuildEntityGrid(world);
      updateAi(world, clock, TICK_MS / 1000, computeFrozen(world));
      resolveCollisions(world);
      countSurvivors(world);
      const v = world.entities.get(vic.id);
      if (!v || v.type === 'zombie') break;
      const held = world.grapples.has(vic.id);
      if (letGo < 0) { if (!held) { letGo = clock; released++; } continue; }
      peak = Math.max(peak, Math.hypot(v.x - zed.x, v.y - zed.y));
      if (held) { regrab.push(clock - letGo); break; }
      if (clock - letGo >= WATCH_MS) { stillFree++; break; }
    }
    if (letGo > 0) {
      gaps.push(peak);
      if (regrab.length > 0 && regrab[regrab.length - 1]! <= 2 * TICK_MS) instantRegrab++;
    }
  }

  const sortN = (xs: number[]) => xs.slice().sort((a, b) => a - b);
  const median = (xs: number[]) => sortN(xs)[Math.floor(xs.length / 2)] ?? 0;
  console.log('  releases sampled              ' + released);
  console.log('  re-grabbed within one tick    ' + instantRegrab + (instantRegrab === 0 ? '   ok' : '   FAILED'));
  // The median is over the ones that were caught, so it means nothing without
  // the share that never was — lengthen the burst and the caught population
  // shrinks to whoever ran into geometry, which drags the median *down*.
  console.log('  still free after ' + WATCH_MS / 1000 + 's         ' + stillFree + ' of ' + released);
  console.log('  time to re-grab, of those caught  med ' + median(regrab).toFixed(0) + 'ms');
  console.log('  furthest they got             med ' + median(gaps).toFixed(0) +
    'px  (grab reach ' + REACH + ')');
  // The bug was a re-grab on the very next tick, so speed was irrelevant. Both
  // halves are asserted: they break contact, and they get real ground with it.
  check(instantRegrab === 0, 'nobody is re-taken on the tick they are released');
  check(median(regrab) > 1000, 'a release buys more than a moment');
  check(median(gaps) > 2 * REACH, 'a release buys real ground');
}

console.log('');
console.log(failures === 0 ? 'ALL CHECKS PASSED' : failures + ' FAILED');
process.exit(failures === 0 ? 0 : 1);
