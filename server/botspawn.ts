/**
 * Headless check on where bot officers come into the round.
 *
 *   *"Can we not allow the blue bot officers to spawn in the same area as the
 *   zombies initial spawn. If you were to divide the map into 6 equal squares
 *   have that be the measurement for how far the no-no blue officers spawn is
 *   … take the square of measurement and place it over the initial zombie
 *   spawn and don't allow bot officers to spawn in that area."*
 *
 * No socket, no port, so it leaves a game on 8080 alone.
 *   npx tsx botspawn.ts
 *   RUNS=40 npx tsx botspawn.ts
 *
 * `setBotsIgnoreOutbreakKeepOut` is the gate and it is **kept**. The new figure
 * is a zero, and a zero is exactly what a rig that sampled nothing also reports
 * — so the run is worth nothing without a control that plainly lands bots in
 * the box.
 *
 * **Three controls, and each answers a different way of being wrong:**
 *  - the OLD column, which says the box is somewhere bots would otherwise go;
 *  - the civilians, who are *not* covered by this and must still be found in
 *    there, or the keep-out has been applied to the whole city by accident;
 *  - the spread, which says the survivors were not all shoved into one corner.
 *
 * Both modes run in ONE process on the same cities. Unlike most rigs here the
 * map does **not** need pinning: this measures where a uniform draw lands
 * against a box derived from that same map, so every city is its own trial and
 * the sample is the point. It is seeded anyway, so a failure can be re-run.
 *
 * Not typechecked by `npx tsc --noEmit` in `server/`, which only includes
 * `src`. Check it explicitly:
 *   npx tsc --noEmit --target ES2022 --module ESNext --moduleResolution Bundler
 *     --strict --skipLibCheck --types node botspawn.ts
 */
import {
  createWorld,
  resetWorld,
  outbreakKeepOut,
  inOutbreakKeepOut,
  setBotsIgnoreOutbreakKeepOut,
  type World,
} from './src/world.js';
import { setCityPopulation } from '../shared/constants.js';
import {
  WORLD_WIDTH,
  WORLD_HEIGHT,
  OUTBREAK_KEEP_OUT_COLS,
  OUTBREAK_KEEP_OUT_ROWS,
  CITY_POP_BASE,
} from '../shared/constants.js';

const RUNS = Number(process.env.RUNS ?? 40);
const BOTS = Number(process.env.BOTS ?? 4);

const f1 = (n: number): string => n.toFixed(1);
const pc = (n: number, d: number): string => (d === 0 ? '--' : ((n / d) * 100).toFixed(1) + '%');
function med(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = xs.slice().sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

let checks = 0;
let failures = 0;
function check(ok: boolean, label: string, detail = ''): void {
  checks++;
  if (!ok) failures++;
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail ? '  - ' + detail : ''}`);
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

interface Out {
  /** Bot spawns that landed inside the box. */
  inBox: number;
  bots: number;
  /** How far each bot came in from where the outbreak did. */
  gaps: number[];
  /** Civilians in the box — the control that says this is not city-wide. */
  civsInBox: number;
  civs: number;
  /** Which of the six map cells the bots landed in, so "not all in one corner". */
  cells: Set<number>;
}

function run(seed: number): Out {
  return withSeed(seed, () => {
    const world = createWorld();
    world.botOfficerCount = BOTS;
    resetWorld(world);

    const out: Out = {
      inBox: 0,
      bots: 0,
      gaps: [],
      civsInBox: 0,
      civs: 0,
      cells: new Set<number>(),
    };
    const o = world.outbreakOrigin;
    for (const [id, e] of world.entities) {
      if (id.startsWith('bot-')) {
        out.bots++;
        if (inOutbreakKeepOut(world, e.x, e.y)) out.inBox++;
        out.gaps.push(Math.hypot(e.x - o.x, e.y - o.y));
        const col = Math.min(
          OUTBREAK_KEEP_OUT_COLS - 1,
          Math.floor((e.x / WORLD_WIDTH) * OUTBREAK_KEEP_OUT_COLS),
        );
        const row = Math.min(
          OUTBREAK_KEEP_OUT_ROWS - 1,
          Math.floor((e.y / WORLD_HEIGHT) * OUTBREAK_KEEP_OUT_ROWS),
        );
        out.cells.add(row * OUTBREAK_KEEP_OUT_COLS + col);
      } else if (e.type === 'human') {
        out.civs++;
        if (inOutbreakKeepOut(world, e.x, e.y)) out.civsInBox++;
      }
    }
    return out;
  });
}

/**
 * **How much of the walkable city the box actually withholds.**
 *
 * Not the box's own area: the breach is on an edge, so about half of it hangs
 * off the map — and the ground bots are drawn from is walkable ground, not
 * area. Sampled the way `findSpawn` draws, so the OLD column can be read
 * against a number rather than against an impression.
 */
function boxShare(world: World): number {
  let hit = 0;
  let seen = 0;
  for (let i = 0; i < 20000; i++) {
    const x = Math.random() * WORLD_WIDTH;
    const y = Math.random() * WORLD_HEIGHT;
    if (!world.nav.isReachable(x, y)) continue;
    seen++;
    if (inOutbreakKeepOut(world, x, y)) hit++;
  }
  return seen === 0 ? 0 : hit / seen;
}

const rows: Record<string, Out[]> = { OLD: [], NEW: [] };
for (let i = 0; i < RUNS; i++) {
  for (const mode of ['OLD', 'NEW'] as const) {
    setBotsIgnoreOutbreakKeepOut(mode === 'OLD');
    rows[mode].push(run(7000 + i));
  }
}
setBotsIgnoreOutbreakKeepOut(false);

// One more city, kept, to measure the box itself and the ground it withholds.
const probe = withSeed(7000, () => {
  const world = createWorld();
  world.botOfficerCount = BOTS;
  resetWorld(world);
  return world;
});
const box = outbreakKeepOut(probe);
const share = boxShare(probe);

const tot = (m: string, k: 'inBox' | 'bots' | 'civsInBox' | 'civs'): number =>
  rows[m].reduce((a, r) => a + r[k], 0);

console.log(`
the box: ${f1(box.w)}x${f1(box.h)} on a ${f1(WORLD_WIDTH)}x${f1(WORLD_HEIGHT)} city` +
  `  (a ${OUTBREAK_KEEP_OUT_COLS}x${OUTBREAK_KEEP_OUT_ROWS} cell)` +
  `   walkable ground it withholds ${pc(share, 1)}`);

console.log(`
bot officers at spawn  (${RUNS} cities, ${BOTS} each)`);
for (const mode of ['OLD', 'NEW'] as const) {
  const r = rows[mode];
  console.log(
    `  ${mode}  inside the box ${tot(mode, 'inBox')}/${tot(mode, 'bots')}` +
      ` (${pc(tot(mode, 'inBox'), tot(mode, 'bots'))})` +
      `   median gap from the breach ${f1(med(r.flatMap((x) => x.gaps)))}px` +
      `   nearest ${f1(Math.min(...r.flatMap((x) => x.gaps)))}px` +
      `   cells used ${new Set(r.flatMap((x) => [...x.cells])).size}/${OUTBREAK_KEEP_OUT_COLS * OUTBREAK_KEEP_OUT_ROWS}`,
  );
}

console.log(`
civilians — the control, they are deliberately not covered`);
for (const mode of ['OLD', 'NEW'] as const) {
  console.log(
    `  ${mode}  inside the box ${tot(mode, 'civsInBox')}/${tot(mode, 'civs')}` +
      ` (${pc(tot(mode, 'civsInBox'), tot(mode, 'civs'))})`,
  );
}

// And that the box is a sixth of whatever city is on the table, not of the one
// the process launched with. `WORLD_WIDTH` is a live binding; a half-extent
// worked out at import would freeze the launch size in.
console.log(`
the box against the population slider`);
const sizes: string[] = [];
for (const pop of [100, CITY_POP_BASE, 1000]) {
  setCityPopulation(pop);
  const w = withSeed(7100 + pop, () => {
    const world = createWorld();
    world.botOfficerCount = BOTS;
    resetWorld(world);
    return world;
  });
  const b = outbreakKeepOut(w);
  const okW = Math.abs(b.w - WORLD_WIDTH / OUTBREAK_KEEP_OUT_COLS) < 0.01;
  const okH = Math.abs(b.h - WORLD_HEIGHT / OUTBREAK_KEEP_OUT_ROWS) < 0.01;
  sizes.push(`${pop}: ${f1(b.w)}x${f1(b.h)} of ${f1(WORLD_WIDTH)}x${f1(WORLD_HEIGHT)}${okW && okH ? '' : ' MISMATCH'}`);
  let botsIn = 0;
  let bots = 0;
  for (const [id, e] of w.entities) {
    if (!id.startsWith('bot-')) continue;
    bots++;
    if (inOutbreakKeepOut(w, e.x, e.y)) botsIn++;
  }
  sizes[sizes.length - 1] += `   bots in it ${botsIn}/${bots}`;
}
setCityPopulation(CITY_POP_BASE);
for (const line of sizes) console.log('  ' + line);

console.log('');
check(
  tot('NEW', 'bots') === RUNS * BOTS,
  'every bot still got a spawn',
  `${tot('NEW', 'bots')} of ${RUNS * BOTS}`,
);
check(
  tot('OLD', 'inBox') > 0,
  'the control lands bots in the box, so the box is somewhere they would go',
  `${tot('OLD', 'inBox')}/${tot('OLD', 'bots')} against ${pc(share, 1)} of the ground`,
);
check(tot('NEW', 'inBox') === 0, 'no bot spawns in it', `${tot('NEW', 'inBox')} did`);
check(
  tot('NEW', 'civsInBox') > 0,
  'the control: civilians are still spawned in there',
  `${tot('NEW', 'civsInBox')}/${tot('NEW', 'civs')}`,
);
check(
  new Set(rows.NEW.flatMap((x) => [...x.cells])).size === OUTBREAK_KEEP_OUT_COLS * OUTBREAK_KEEP_OUT_ROWS,
  'and they are not all shoved into one corner — every map cell still used',
  `${new Set(rows.NEW.flatMap((x) => [...x.cells])).size} cells`,
);
check(
  med(rows.NEW.flatMap((x) => x.gaps)) > med(rows.OLD.flatMap((x) => x.gaps)),
  'the median bot starts further from the breach',
  `${f1(med(rows.OLD.flatMap((x) => x.gaps)))} -> ${f1(med(rows.NEW.flatMap((x) => x.gaps)))}px`,
);
check(!sizes.some((s) => s.includes('MISMATCH')), 'the box is a sixth of whatever city is loaded');

console.log(`
${checks - failures}/${checks} checks passed${failures > 0 ? `, ${failures} FAILED` : ''}`);
