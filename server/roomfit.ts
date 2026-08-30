/**
 * Harness for *"no more buildings generating like this — humans and zombies
 * can't fit in certain spots"*.
 *
 * Headless, no socket, no port, so it leaves a game on 8080 alone. Run with
 *   cd server && npx tsx roomfit.ts
 *
 * What it measures is the complaint stated as a property: **indoor floor a
 * body cannot stand on, or can stand on and cannot walk to.** Both are drawn
 * as a room and neither is one.
 *
 * It is deliberately not a look at the generator's own room grid. `mapgen`
 * throws that away, and half of what is on screen is carved after the fact —
 * so the reading has to come off the finished walls, which is the same
 * argument `rooms.ts` already rests on.
 */
import {
  WORLD_WIDTH,
  WORLD_HEIGHT,
  ZOMBIE_RADIUS,
  TILE,
  setCityPopulation,
} from '../shared/constants.js';
import { generateMap, setNarrowGeometryAllowed } from './src/mapgen.js';
import type { MapData, Wall } from '../shared/types.js';

const CITIES = Number(process.env.CITIES ?? 24);
const STEP = 4; // px, the sampling grid
const R = ZOMBIE_RADIUS; // the widest ordinary body: 14
/** Smallest dead patch worth calling a room. One corner leaves ~42px². */
const DEAD_BLOB = Number(process.env.DEAD_BLOB ?? 1500);

/** Every slab a body cannot walk through: walls, and glass that is still in. */
function solids(map: MapData): Wall[] {
  return [...map.walls, ...map.windows];
}

interface Field {
  cols: number;
  rows: number;
  /** 1 where a slab is. */
  solid: Uint8Array;
  /** 1 where a body of radius R fits. */
  fits: Uint8Array;
  /** 1 where a body of radius R fits *and* can be walked to from the street. */
  reach: Uint8Array;
}

function rasterise(map: MapData): Field {
  const cols = Math.ceil(map.width / STEP);
  const rows = Math.ceil(map.height / STEP);
  const solid = new Uint8Array(cols * rows);

  for (const w of solids(map)) {
    const x0 = Math.max(0, Math.floor(w.x / STEP));
    const x1 = Math.min(cols - 1, Math.ceil((w.x + w.w) / STEP));
    const y0 = Math.max(0, Math.floor(w.y / STEP));
    const y1 = Math.min(rows - 1, Math.ceil((w.y + w.h) / STEP));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) solid[y * cols + x] = 1;
    }
  }

  // Does a disc of radius R centred here clear every slab? Separable: a
  // box-erosion by R in x then in y is a Chebyshev disc, which over-reports a
  // fit at the corners — so it is a true circle, walked once.
  const rad = Math.ceil(R / STEP);
  const offsets: number[] = [];
  for (let dy = -rad; dy <= rad; dy++) {
    for (let dx = -rad; dx <= rad; dx++) {
      if (Math.hypot(dx * STEP, dy * STEP) <= R) offsets.push(dy * cols + dx);
    }
  }
  const fits = new Uint8Array(cols * rows);
  for (let y = rad; y < rows - rad; y++) {
    for (let x = rad; x < cols - rad; x++) {
      const i = y * cols + x;
      let ok = 1;
      for (const o of offsets) {
        if (solid[i + o]) {
          ok = 0;
          break;
        }
      }
      fits[i] = ok;
    }
  }

  // Flood from the middle of the map's largest open run — the street.
  const reach = new Uint8Array(cols * rows);
  const stack: number[] = [];
  let seed = -1;
  for (let i = 0; i < fits.length && seed < 0; i++) {
    // A cell well outside every building: the perimeter road.
    const x = (i % cols) * STEP;
    const y = Math.floor(i / cols) * STEP;
    if (!fits[i]) continue;
    if (buildingAtPoint(map, x, y) >= 0) continue;
    seed = i;
  }
  if (seed >= 0) {
    reach[seed] = 1;
    stack.push(seed);
  }
  while (stack.length > 0) {
    const i = stack.pop()!;
    const x = i % cols;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = x + dx;
      if (nx < 0 || nx >= cols) continue;
      const j = i + dy * cols + dx;
      if (j < 0 || j >= reach.length) continue;
      if (!fits[j] || reach[j]) continue;
      reach[j] = 1;
      stack.push(j);
    }
  }

  return { cols, rows, solid, fits, reach };
}

function buildingAtPoint(map: MapData, x: number, y: number): number {
  for (let i = 0; i < map.buildings.length; i++) {
    const b = map.buildings[i];
    if (x < b.x || y < b.y || x > b.x + b.w || y > b.y + b.h) continue;
    for (const r of b.rects) {
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return i;
    }
  }
  return -1;
}

interface Blob {
  area: number;
  building: number;
  x: number;
  y: number;
  /** True where a body would fit if only it could get there. */
  standable: boolean;
  /** A room, as against a slot of street between two buildings. */
  indoors: boolean;
}

interface Report {
  floor: number;
  blobs: Blob[];
}

/**
 * Floor a body cannot be *on*, which is not the same as floor its centre
 * cannot be *at*.
 *
 * The first version measured the second and reported a quarter of every city's
 * indoor floor dead in both modes — which is the band within one radius of
 * every wall in the game, i.e. the skirting board. So each floor cell is asked
 * whether it lies under a body standing somewhere that both fits and can be
 * walked to.
 *
 * **And the dead cells are then joined up, because there is a noise floor and
 * it is every corner in the city.** A right angle leaves `(1 - PI/4) * R²` of
 * floor no disc covers — about 42px², four times a room — so counting bare area
 * put 679 of 679 buildings in the wrong and told nobody anything.
 * DEAD_BLOB is well above one corner and well below one room.
 */
function inspect(map: MapData): Report {
  const f = rasterise(map);
  const cell = STEP * STEP;
  const rep: Report = { floor: 0, blobs: [] };

  const rad = Math.ceil(R / STEP);
  const offsets: number[] = [];
  for (let dy = -rad; dy <= rad; dy++) {
    for (let dx = -rad; dx <= rad; dx++) {
      if (Math.hypot(dx * STEP, dy * STEP) <= R) offsets.push(dy * f.cols + dx);
    }
  }

  // 0 = not dead, 1 = dead and nothing fits near it, 2 = dead but standable.
  const dead = new Uint8Array(f.cols * f.rows);
  for (let y = rad; y < f.rows - rad; y++) {
    for (let x = rad; x < f.cols - rad; x++) {
      const i = y * f.cols + x;
      if (f.solid[i]) continue;
      const inside = buildingAtPoint(map, x * STEP, y * STEP) >= 0;
      if (inside) rep.floor += cell;

      let covered = false;
      let standable = false;
      for (const o of offsets) {
        if (f.reach[i + o]) {
          covered = true;
          break;
        }
        if (f.fits[i + o]) standable = true;
      }
      if (!covered) dead[i] = standable ? 2 : 1;
    }
  }

  const seen = new Uint8Array(dead.length);
  const stack: number[] = [];
  for (let i = 0; i < dead.length; i++) {
    if (!dead[i] || seen[i]) continue;
    seen[i] = 1;
    stack.push(i);
    let area = 0;
    let standable = false;
    const sx = (i % f.cols) * STEP;
    const sy = Math.floor(i / f.cols) * STEP;
    while (stack.length > 0) {
      const j = stack.pop()!;
      area += cell;
      if (dead[j] === 2) standable = true;
      const jx = j % f.cols;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = jx + dx;
        if (nx < 0 || nx >= f.cols) continue;
        const k = j + dy * f.cols + dx;
        if (k < 0 || k >= dead.length || seen[k] || !dead[k]) continue;
        seen[k] = 1;
        stack.push(k);
      }
    }
    if (area < DEAD_BLOB) continue;
    rep.blobs.push({
      area,
      building: buildingAtPoint(map, sx, sy),
      x: sx,
      y: sy,
      standable,
      indoors: buildingAtPoint(map, sx, sy) >= 0,
    });
  }
  return rep;
}

/** Buildings standing inside another building — the second of the two faults. */
function overlaps(map: MapData): Set<number> {
  const out = new Set<number>();
  for (let i = 0; i < map.buildings.length; i++) {
    const a = map.buildings[i];
    for (let j = i + 1; j < map.buildings.length; j++) {
      const b = map.buildings[j];
      if (a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y) {
        out.add(i);
        out.add(j);
      }
    }
  }
  return out;
}

function pct(a: number, b: number): string {
  return b === 0 ? '—' : `${((a / b) * 100).toFixed(2)}%`;
}

function run(label: string, allowNarrow: boolean): void {
  setNarrowGeometryAllowed(allowNarrow);
  let floor = 0;
  let dead = 0;
  let blobs = 0;
  let standable = 0;
  let outdoor = 0;
  let outdoorArea = 0;
  let cities = 0;
  let inOverlap = 0;
  let overlapped = 0;
  let totalBuildings = 0;
  let worst: { area: number; where: string } | null = null;
  const examples: string[] = [];

  for (let i = 0; i < CITIES; i++) {
    const map = generateMap(1000 + i);
    const over = overlaps(map);
    overlapped += over.size;
    totalBuildings += map.buildings.length;
    const rep = inspect(map);
    floor += rep.floor;
    if (rep.blobs.length > 0) cities++;
    for (const b of rep.blobs) {
      blobs++;
      if (b.indoors) dead += b.area;
      else {
        outdoor++;
        outdoorArea += b.area;
      }
      if (b.standable) standable++;
      if (over.has(b.building)) inOverlap++;
      const where = `seed ${map.seed} building ${b.building} at ${b.x | 0},${b.y | 0}`;
      if (!worst || b.area > worst.area) worst = { area: b.area, where };
      if (examples.length < 6) examples.push(`${(b.area / 1000).toFixed(1)}k px² — ${where}`);
    }
  }

  console.log(`
${label}  (${CITIES} cities, body radius ${R}px, ${STEP}px grid)`);
  console.log(`  spots nothing can get into : ${blobs}   (${blobs - outdoor} indoors, ${outdoor} slots of street)`);
  console.log(`  …of which a body would fit : ${standable}   (the rest are too narrow to stand in at all)`);
  console.log(`  indoor floor lost          : ${(dead / 1000).toFixed(0)}k px²  (${pct(dead, floor)})`);
  console.log(`  street lost                : ${(outdoorArea / 1000).toFixed(0)}k px²`);
  console.log(`  …in a building standing in another: ${inOverlap}   (the rest are carved limbs)`);
  console.log(`  buildings standing in another     : ${overlapped} of ${totalBuildings}`);
  console.log(`  cities with any             : ${cities} of ${CITIES}`);
  console.log(`  worst                       : ${worst ? `${(worst.area / 1000).toFixed(1)}k px² — ${worst.where}` : 'none'}`);
  for (const e of examples) console.log(`    · ${e}`);
}

setCityPopulation(Number(process.env.POP ?? 500));
console.log(`city ${WORLD_WIDTH}x${WORLD_HEIGHT}, tile ${TILE}`);
run('OLD — narrow limbs allowed', true);
run('NEW', false);
