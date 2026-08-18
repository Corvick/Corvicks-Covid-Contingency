/**
 * What one A* search costs, and therefore what a tick's worth of them costs.
 *
 * `PATH_BUDGET_PER_TICK` (10) caps how many searches run in a tick and
 * `PATH_MAX_NODES` (14000) caps how far each may explore — but the two multiply
 * to 140,000 node expansions inside a 33.3ms budget, and nothing checks the
 * product. This measures the cost of the searches the cap actually permits.
 */
import { createWorld, resetWorld } from './src/world.js';
import { NAV_CELL, PATH_MAX_NODES, PATH_BUDGET_PER_TICK, TICK_RATE } from '../shared/constants.js';

const world = createWorld();
resetWorld(world);
const nav = world.nav;

let seed = 20260817;
const rnd = (): number => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

function walkable(): { x: number; y: number } {
  for (let i = 0; i < 4000; i++) {
    const x = rnd() * world.map.width;
    const y = rnd() * world.map.height;
    if (!nav.isBlocked(x, y)) return { x, y };
  }
  return { x: world.map.width / 2, y: world.map.height / 2 };
}

const cells = Math.ceil(world.map.width / NAV_CELL) * Math.ceil(world.map.height / NAV_CELL);
console.log(
  `\nnav grid ${Math.ceil(world.map.width / NAV_CELL)}x${Math.ceil(world.map.height / NAV_CELL)} = ${cells} cells` +
    ` · PATH_MAX_NODES ${PATH_MAX_NODES} (${((PATH_MAX_NODES / cells) * 100).toFixed(0)}% of the grid)` +
    ` · budget ${PATH_BUDGET_PER_TICK} searches/tick · tick ${(1000 / TICK_RATE).toFixed(1)}ms\n`,
);

interface Row {
  label: string;
  times: number[];
  found: number;
}

const allNodes: number[] = [];
const allTimes: number[] = [];

function run(label: string, pick: () => [{ x: number; y: number }, { x: number; y: number }], n: number): Row {
  const times: number[] = [];
  let found = 0;
  for (let i = 0; i < n; i++) {
    const [a, b] = pick();
    const t0 = performance.now();
    const path = nav.findPath(a.x, a.y, b.x, b.y);
    const dt = performance.now() - t0;
    times.push(dt);
    allNodes.push(nav.lastExpanded);
    allTimes.push(dt);
    if (path) found++;
  }
  times.sort((x, y) => x - y);
  return { label, times, found };
}

function show(r: Row): void {
  const n = r.times.length;
  const med = r.times[Math.floor(n / 2)];
  const p90 = r.times[Math.floor(n * 0.9)];
  const worst = r.times[n - 1];
  console.log(
    `  ${r.label.padEnd(30)} median ${med.toFixed(2)}  p90 ${p90.toFixed(2)}  worst ${worst.toFixed(2)}ms` +
      `   (${r.found}/${n} found)`,
  );
}

// Anywhere to anywhere: what an NPC picking a distant goal actually asks for.
const anywhere = run('anywhere → anywhere', () => [walkable(), walkable()], 400);
show(anywhere);

// Corner to corner: the longest honest search on this map.
const far = run(
  'far corner → far corner',
  () => {
    const a = { x: 200 + rnd() * 400, y: 200 + rnd() * 400 };
    const b = { x: world.map.width - 600 + rnd() * 400, y: world.map.height - 600 + rnd() * 400 };
    return [a, b];
  },
  200,
);
show(far);

// Unreachable: the pathological case. A search that cannot succeed explores
// until the node cap stops it, every time.
const indoors = run(
  'into a wall (must fail)',
  () => {
    const a = walkable();
    // A point inside solid geometry — the search exhausts its budget looking.
    for (let i = 0; i < 500; i++) {
      const x = rnd() * world.map.width;
      const y = rnd() * world.map.height;
      if (nav.isBlocked(x, y)) return [a, { x, y }] as [typeof a, typeof a];
    }
    return [a, a] as [typeof a, typeof a];
  },
  120,
);
show(indoors);

const worstOne = Math.max(...anywhere.times, ...far.times, ...indoors.times);
console.log(
  `\n  worst single search ${worstOne.toFixed(2)}ms` +
    ` → a tick may run ${PATH_BUDGET_PER_TICK} of them = ${(worstOne * PATH_BUDGET_PER_TICK).toFixed(0)}ms` +
    ` against a ${(1000 / TICK_RATE).toFixed(1)}ms budget`,
);

// How many nodes a millisecond buys, so the per-tick budget can be derived from
// how much of the tick pathfinding is allowed to have, rather than guessed.
let sumN = 0;
let sumT = 0;
let maxN = 0;
for (let i = 0; i < allNodes.length; i++) {
  sumN += allNodes[i];
  sumT += allTimes[i];
  if (allNodes[i] > maxN) maxN = allNodes[i];
}
const perMs = sumN / sumT;
console.log(
  `\n  ${allNodes.length} searches: ${sumN} nodes in ${sumT.toFixed(0)}ms = ` +
    `${perMs.toFixed(0)} nodes/ms · biggest single search ${maxN} nodes`,
);
for (const share of [2, 4, 6, 8]) {
  console.log(
    `    a ${share}ms slice of the tick = ${Math.round(perMs * share)} nodes` +
      `  (${(share / (1000 / TICK_RATE) * 100).toFixed(0)}% of the budget)`,
  );
}

/**
 * What a tighter node cap actually costs in behaviour.
 *
 * Cheap is no use if it stops people finding their way. A search that gives up
 * returns null and the caller walks straight at the goal instead, so the
 * question is how many routes survive each cap — and, separately, how dear the
 * worst search is once it can no longer run away with the tick.
 */
console.log(`\n  cap    routes found     worst search   median`);
const sample: Array<[{ x: number; y: number }, { x: number; y: number }]> = [];
for (let i = 0; i < 600; i++) sample.push([walkable(), walkable()]);

for (const cap of [14000, 10000, 8000, 6000, 4000, 3000]) {
  const times: number[] = [];
  let found = 0;
  for (const [a, b] of sample) {
    const t0 = performance.now();
    if (nav.findPath(a.x, a.y, b.x, b.y, cap)) found++;
    times.push(performance.now() - t0);
  }
  times.sort((x, y) => x - y);
  console.log(
    `  ${String(cap).padStart(5)}   ${found}/${sample.length} (${((found / sample.length) * 100).toFixed(1)}%)` +
      `     ${times[times.length - 1].toFixed(2)}ms`.padStart(16) +
      `     ${times[Math.floor(times.length / 2)].toFixed(2)}ms`,
  );
}
console.log('');
