/**
 * Harness for the lobby's population slider: does a smaller city still hold a
 * city's worth of geometry?
 *
 * Headless, no socket, no port — so it leaves a game on 8080 alone. Run with
 *   cd server && npx tsx citysize.ts
 *
 * The things it actually checks are the two the setting could plausibly break:
 * **the gaps between buildings**, which is what people and vehicles move
 * through, and **room for the van to pull up**, which is the widest body that
 * has to fit down a street.
 */
import {
  CITY_POP_MAX,
  CITY_POP_MIN,
  CITY_POP_BASE,
  VAN_LENGTH,
  VAN_WIDTH,
  BACKUP_LANE_CLEARANCE,
  WORLD_WIDTH,
  WORLD_HEIGHT,
  setCityPopulation,
  HUMAN_COUNT,
  ENTITY_RADIUS,
  TICK_RATE,
} from '../shared/constants.js';
import {
  createWorld,
  resetWorld,
  rebuildNav,
  rebuildEntityGrid,
  resolveCollisions,
  buildingIndexAt,
  countSurvivors,
  type World,
} from './src/world.js';
import { computeFrozen, updateAi } from './src/ai.js';
import { callBackup, updateBackup } from './src/backup.js';
import { generateMap } from './src/mapgen.js';


const CITIES_PER_SETTING = 6;

/**
 * How much room there is to move, sampled over the streets.
 *
 * **Not the minimum gap between two footprints**, which was the first thing
 * tried and measures nothing: over eighty-odd buildings the smallest gap
 * anywhere is an outlier of two rects that happen to nearly touch, and it
 * bounces between 0 and 28px from one seed to the next at *every* setting. The
 * question is whether a smaller city is a *tighter* one, which is a question
 * about the distribution, so this walks the walkable ground and records how far
 * each open spot is from the nearest blocked one.
 */
function clearanceSamples(world: World): number[] {
  const out: number[] = [];
  const step = 20;
  const probe = 90;
  for (let y = 60; y < world.map.height - 60; y += step) {
    for (let x = 60; x < world.map.width - 60; x += step) {
      if (world.nav.isBlocked(x, y)) continue;
      if (buildingIndexAt(world, x, y) >= 0) continue; // streets, not front rooms
      let clear = probe;
      for (let r = 8; r <= probe; r += 6) {
        let hit = false;
        for (let a = 0; a < 8; a++) {
          const th = (a / 8) * Math.PI * 2;
          if (world.nav.isBlocked(x + Math.cos(th) * r, y + Math.sin(th) * r)) {
            hit = true;
            break;
          }
        }
        if (hit) {
          clear = r;
          break;
        }
      }
      out.push(clear);
    }
  }
  return out;
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return NaN;
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}

/** The van's footprint, exactly as `bodyFits` in backup.ts tests it. */
function vanFits(world: World, x: number, y: number, facing: number): boolean {
  const cos = Math.cos(facing);
  const sin = Math.sin(facing);
  const hl = VAN_LENGTH / 2;
  const hw = VAN_WIDTH / 2 + BACKUP_LANE_CLEARANCE / 2;
  for (const along of [-hl, -hl / 2, 0, hl / 2, hl]) {
    for (const across of [-hw, 0, hw]) {
      const px = x + cos * along - sin * across;
      const py = y + sin * along + cos * across;
      if (px < 40 || py < 40 || px > world.map.width - 40 || py > world.map.height - 40) return false;
      if (buildingIndexAt(world, px, py) >= 0) return false;
      if (world.nav.isBlocked(px, py)) return false;
    }
  }
  return true;
}

/** Narrowest doorway in the city. The dog's collision circle is 38px wide. */
function narrowestDoorway(world: World): number {
  let worst = Infinity;
  for (const d of world.map.doors) worst = Math.min(worst, d.halfSpan * 2);
  return worst;
}

type Row = {
  pop: number;
  w: number;
  h: number;
  buildings: number;
  clear: number[];
  doorway: number;
  vanOk: number;
  vanTried: number;
  crewOut: number;
  crewTried: number;
  civilians: number;
  officers: number;
  parkOk: number;
  pondOk: number;
};

const rows: Row[] = [];

// **An explicit list rather than a sweep**, because the slider reaches 1000
// now and a step of 100 down from there is ten settings at six cities each.
// These are the ones worth a row: both ends, the yardstick, and one either side.
for (const pop of [CITY_POP_MAX, 750, CITY_POP_BASE, 300, CITY_POP_MIN]) {
  setCityPopulation(pop);
  const row: Row = {
    pop: HUMAN_COUNT,
    w: WORLD_WIDTH,
    h: WORLD_HEIGHT,
    buildings: 0,
    clear: [],
    doorway: Infinity,
    vanOk: 0,
    vanTried: 0,
    crewOut: 0,
    crewTried: 0,
    civilians: 0,
    officers: 0,
    parkOk: 0,
    pondOk: 0,
  };

  for (let c = 0; c < CITIES_PER_SETTING; c++) {
    const world = createWorld();
    row.buildings += world.map.buildings.length;
    for (const c2 of clearanceSamples(world)) row.clear.push(c2);
    row.doorway = Math.min(row.doorway, narrowestDoorway(world));

    // Landmarks present and on the map at all.
    const p = world.map.park;
    if (p.x >= 0 && p.y >= 0 && p.x + p.w <= world.map.width && p.y + p.h <= world.map.height) {
      row.parkOk++;
    }
    const pond = world.map.pond;
    if (
      pond.x - pond.r >= 0 &&
      pond.y - pond.r >= 0 &&
      pond.x + pond.r <= world.map.width &&
      pond.y + pond.r <= world.map.height
    ) {
      row.pondOk++;
    }

    let civ = 0;
    let off = 0;
    for (const e of world.entities.values()) {
      if (e.type === 'human') civ++;
      else if (e.type === 'officer') off++;
    }
    row.civilians += civ;
    row.officers += off;

    // Room for the van: call it in from six spots round the city and check
    // where it decided to park, then run the arrival to see the crew out.
    const spots = [
      [0.25, 0.25],
      [0.75, 0.25],
      [0.5, 0.5],
      [0.25, 0.75],
      [0.75, 0.75],
      [0.5, 0.85],
    ];
    for (const [fx, fy] of spots) {
      const caller = {
        id: `probe-${fx}-${fy}`,
        type: 'officer' as const,
        x: world.map.width * fx,
        y: world.map.height * fy,
        facing: 0,
        radius: ENTITY_RADIUS.officer,
        health: 100,
      };
      world.vehicles.clear();
      callBackup(world, caller as never, Date.now());
      row.vanTried++;
      const v = [...world.vehicles.values()][0];
      // The resting pose, not the approach line: with the arc model the body
      // comes to rest turned by `slew * driftDir` off `heading`, and that is
      // the orientation `slideFits` cleared.
      if (v && vanFits(world, v.targetX, v.targetY, v.heading + v.slew * v.driftDir)) row.vanOk++;

      // Drive it in and let the doors open. 30Hz, up to 40 seconds.
      row.crewTried++;
      const before = world.entities.size;
      let t = Date.now();
      for (let i = 0; i < 30 * 40; i++) {
        t += 1000 / 30;
        updateBackup(world, t, 1 / 30);
        if (world.entities.size - before >= 5) break;
      }
      if (world.entities.size - before >= 5) row.crewOut++;
      // Take the crew back out so the next probe starts clean.
      for (const id of [...world.dispatched]) {
        world.entities.delete(id);
        world.dispatched.delete(id);
        world.swat.delete(id);
        world.squadLeads.delete(id);
      }
    }

    void countSurvivors;
  }

  row.buildings = Math.round(row.buildings / CITIES_PER_SETTING);
  row.civilians = Math.round(row.civilians / CITIES_PER_SETTING);
  row.officers = Math.round(row.officers / CITIES_PER_SETTING);
  rows.push(row);
}

const pad = (s: string | number, n: number) => String(s).padStart(n);
console.log(
  `${pad('pop', 4)} ${pad('city', 11)} ${pad('bldgs', 6)} ${pad('street clearance p5/p50', 24)}` +
    ` ${pad('door', 5)} ${pad('van', 7)} ${pad('crew', 7)} ${pad('civ', 5)} ${pad('offr', 5)}` +
    ` ${pad('park', 5)} ${pad('pond', 5)}`,
);
for (const r of rows) {
  const sorted = r.clear.sort((a, b) => a - b);
  const spread = `${percentile(sorted, 0.05)} / ${percentile(sorted, 0.5)} (n=${sorted.length})`;
  console.log(
    `${pad(r.pop, 4)} ${pad(`${r.w}x${r.h}`, 11)} ${pad(r.buildings, 6)} ${pad(spread, 24)}` +
      ` ${pad(Math.round(r.doorway), 5)}` +
      ` ${pad(`${r.vanOk}/${r.vanTried}`, 7)} ${pad(`${r.crewOut}/${r.crewTried}`, 7)}` +
      ` ${pad(r.civilians, 5)} ${pad(r.officers, 5)}` +
      ` ${pad(`${r.parkOk}/${CITIES_PER_SETTING}`, 5)} ${pad(`${r.pondOk}/${CITIES_PER_SETTING}`, 5)}`,
  );
}

// mapgen cost, which is what a smaller city is meant to buy back.
console.log('');
for (const pop of [CITY_POP_MAX, CITY_POP_BASE, CITY_POP_MIN]) {
  setCityPopulation(pop);
  const t0 = performance.now();
  for (let i = 0; i < 10; i++) generateMap();
  console.log(`generateMap at ${pop}: ${((performance.now() - t0) / 10).toFixed(1)}ms`);
}

/**
 * The path the game actually takes: a world that already exists, resized under
 * it. `startLobby` calls `setCityPopulation` and then `resetWorld`, and the
 * dangerous direction is *shrinking* — every broadphase grid takes its column
 * count in its constructor, so one built for the old city would fold everything
 * past the new edge into a single cell.
 */
console.log('\n--- resize a live world, then tick it ---');
console.log('  pop        city  entities  tick p50/p90  worst-cell  out-of-bounds  navcells');

setCityPopulation(CITY_POP_BASE);
const live = createWorld();

for (const pop of [CITY_POP_MAX, CITY_POP_BASE, CITY_POP_MIN]) {
  setCityPopulation(pop);
  resetWorld(live);

  // 300 ticks with a clock that actually advances — anything measured without
  // one is measuring an AI that is mostly not running. See the note on
  // `tickprof.ts` in CLAUDE.md.
  const times: number[] = [];
  let now = Date.now();
  let outside = 0;
  for (let i = 0; i < 300; i++) {
    now += 1000 / TICK_RATE;
    const t0 = performance.now();
    rebuildNav(live);
    rebuildEntityGrid(live);
    const frozen = computeFrozen(live);
    updateAi(live, now, 1 / 30, frozen);
    resolveCollisions(live);
    times.push(performance.now() - t0);
    for (const e of live.entities.values()) {
      if (e.x < 0 || e.y < 0 || e.x > live.map.width || e.y > live.map.height) outside++;
    }
  }
  times.sort((a, b) => a - b);

  // How lopsided the entity grid is. A grid built for a bigger city would pile
  // everything past its edge into the last row, so the fullest cell is what
  // gives that away — it is a couple of dozen bodies when it is right and
  // hundreds when it is not.
  rebuildEntityGrid(live);
  const worstCell = (live.entityGrid as unknown as { cells: Map<number, unknown[]> }).cells;
  let fullest = 0;
  for (const bucket of worstCell.values()) fullest = Math.max(fullest, bucket.length);

  const nav = live.nav as unknown as { cols: number; rows: number };
  console.log(
    `${pad(pop, 5)} ${pad(`${live.map.width}x${live.map.height}`, 11)}` +
      ` ${pad(live.entities.size, 9)}` +
      ` ${pad(`${times[150].toFixed(2)}/${times[270].toFixed(2)}ms`, 13)}` +
      ` ${pad(fullest, 11)} ${pad(outside, 14)} ${pad(nav.cols * nav.rows, 9)}`,
  );
}

/**
 * The same reading, deterministically: does each grid have the column count
 * the map it indexes asks for? A grid left at the old city's size fails this
 * outright, where the pile-up above is only statistical.
 */
console.log('\n--- grid dimensions against the map they index ---');
const ENTITY_CELL = 96;
const STATIC_CELL = 160;
for (const pop of [CITY_POP_MAX, CITY_POP_MIN, CITY_POP_BASE]) {
  setCityPopulation(pop);
  resetWorld(live);
  const dims = (g: unknown) => g as unknown as { cols: number; rows: number };
  const want = (cell: number) => ({
    cols: Math.max(1, Math.ceil(live.map.width / cell)),
    rows: Math.max(1, Math.ceil(live.map.height / cell)),
  });
  const checks: Array<[string, { cols: number; rows: number }, { cols: number; rows: number }]> = [
    ['entityGrid', dims(live.entityGrid), want(ENTITY_CELL)],
    ['zombieGrid', dims(live.zombieGrid), want(ENTITY_CELL)],
    ['wallGrid', dims(live.wallGrid), want(STATIC_CELL)],
    ['bushGrid', dims(live.bushGrid), want(STATIC_CELL)],
    ['windowGrid', dims(live.windowGrid), want(STATIC_CELL)],
    ['doorGrid', dims(live.doorGrid), want(STATIC_CELL)],
  ];
  const bad = checks.filter(([, got, exp]) => got.cols !== exp.cols || got.rows !== exp.rows);
  console.log(
    `  ${pad(pop, 4)} ${pad(`${live.map.width}x${live.map.height}`, 11)}` +
      ` ${bad.length === 0 ? 'all six grids match' : `WRONG: ${bad.map(([n, g, e]) => `${n} ${g.cols}x${g.rows} want ${e.cols}x${e.rows}`).join(', ')}`}`,
  );
}

/**
 * The dangerous direction, on its own: a world that started **small** and grew.
 *
 * Shrinking leaves an oversized grid, which is merely wasteful — it is a sparse
 * `Map`, so the spare cells cost nothing. Growing is the one that breaks: `col`
 * and `row` clamp to the last index, so every body past the old city's edge
 * lands in one cell and every query out there walks the lot. A host who plays a
 * quiet round and then restarts at full size is exactly this case.
 */
console.log('\n--- a world that started small and grew ---');
setCityPopulation(CITY_POP_MIN);
const grown = createWorld();
setCityPopulation(CITY_POP_MAX);
resetWorld(grown);
rebuildEntityGrid(grown);
{
  const cells = (grown.entityGrid as unknown as { cells: Map<number, unknown[]> }).cells;
  let fullest = 0;
  for (const bucket of cells.values()) fullest = Math.max(fullest, bucket.length);
  const g = grown.entityGrid as unknown as { cols: number; rows: number };
  console.log(
    `  ${CITY_POP_MIN} -> ${CITY_POP_MAX}: city ${grown.map.width}x${grown.map.height}, entityGrid ${g.cols}x${g.rows},` +
      ` ${grown.entities.size} entities, fullest cell ${fullest}`,
  );
}
