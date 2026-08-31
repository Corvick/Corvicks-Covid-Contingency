/**
 * Headless check on the police station, asked for as *"lets get a police
 * station that spawns somewhat randomly (it will always be on the opposite half
 * of the map away from the initial zombie dog and zombies, and more often than
 * not the opposite end of that half) … 3 parking spots that will be randomly
 * filled 0-3 with cop cars with their sirens off … a lobby and a glass window
 * that is like the clerks desk … a simple jail cell in the back and a room 2-6
 * spawns for guns and 1-3 spawns for utility (and with a 30% chance to spawn a
 * radio that is excluded from the map limits) … manned by 1-6 grey officers
 * depending on map size (have a couple civilians spawn in here to act as staff
 * too) … the office area have a cubicle like layout but not too crowded"*.
 *
 * No socket, no port, so it leaves a game on 8080 alone.
 *   npx tsx policestation.ts
 *   CITIES=40 npx tsx policestation.ts
 *   POP=100 npx tsx policestation.ts
 *
 * Not typechecked by `npx tsc --noEmit` in `server/`, which only includes
 * `src`. Check it explicitly:
 *   npx tsc --noEmit --target ES2022 --module ESNext --moduleResolution Bundler
 *     --strict --skipLibCheck --types node policestation.ts
 *
 * **The rig has to walk the finished walls rather than trust the plan**, which
 * is the same argument `rooms.ts` and `roomfit.ts` both rest on: the plan is a
 * list of tile lines and the claim is about a body being able to get about, so
 * what is measured is the geometry that actually got pushed.
 */
import { createWorld, buildingIndexAt, setStationHasNoStaff, type World } from './src/world.js';

/** Kept in step with `inventory.ts`; the ids are what the armoury is counted by. */
const ARMOURY_PREFIX = 'loot-armoury-';
const STATION_RADIO_ID = 'loot-armoury-radio';
import { ITEMS } from '../shared/items.js';
import {
  WORLD_WIDTH,
  WORLD_HEIGHT,
  TILE,
  ENTITY_RADIUS,
  ITEM_CITY_CAP,
  POLICE_STATION_PARKING,
  POLICE_STATION_W_TILES,
  POLICE_STATION_H_TILES,
  POLICE_STATION_GUNS_MIN,
  POLICE_STATION_GUNS_MAX,
  POLICE_STATION_UTILITIES_MIN,
  POLICE_STATION_UTILITIES_MAX,
  POLICE_STATION_OFFICERS_MIN,
  POLICE_STATION_OFFICERS_MAX,
  POLICE_STATION_STAFF_MIN,
  POLICE_STATION_STAFF_MAX,
  POLICE_STATION_RADIO_CHANCE,
  CAR_LENGTH,
  CAR_WIDTH,
  setCityPopulation,
} from '../shared/constants.js';

const CITIES = Number(process.env.CITIES ?? 40);
setCityPopulation(Number(process.env.POP ?? 500));

let fails = 0;
function check(ok: boolean, label: string, detail = ''): void {
  if (!ok) fails++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? '  - ' + detail : ''}`);
}
function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}
function med(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = xs.slice().sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

interface Row {
  placed: boolean;
  /** True when the station's centre is in the half away from the breach. */
  farHalf: boolean;
  /** True when it is also in the far *end* of the free axis. */
  farEnd: boolean;
  /**
   * How far the nearest body of the initial outbreak is, as a share of the
   * map's own diagonal. The half rule is geometry; this is the thing the
   * geometry is for.
   */
  hordeGap: number;
  cars: number;
  silent: number;
  carsInGeometry: number;
  /** Glass panes on the counter line. */
  glass: number;
  guns: number;
  utilities: number;
  radios: number;
  cityRadios: number;
  /** Armoury stock that did not end up in the armoury. */
  strays: number;
  officers: number;
  staff: number;
  /** Rooms the station's footprint holds, per `rooms.ts`. */
  rooms: number;
  /** Rooms with no way out. */
  sealed: number;
  /** Floor cells no body can stand on and reach — the `roomfit` question. */
  dead: number;
  /** How much clear floor the office has, as a share of its own area. */
  officeOpen: number;
  narrowest: number;
}

/**
 * The **`roomfit` question, asked of one building**: floor a body cannot be on,
 * because nothing that fits there can be walked to. A cubicle layout is exactly
 * the shape of thing that gets this wrong — three partitions two tiles apart is
 * a maze if the gaps are a tile — so it is measured rather than eyeballed.
 */
function deadFloor(world: World, b: { x: number; y: number; w: number; h: number }): number {
  const R = ENTITY_RADIUS.human;
  const STEP = 4;
  let dead = 0;
  for (let x = b.x + 2; x < b.x + b.w; x += STEP) {
    for (let y = b.y + 2; y < b.y + b.h; y += STEP) {
      // Skip anything inside a wall: that is not floor.
      if (world.nav.isBlocked(x, y)) continue;
      // Can a body stand somewhere within a radius of here, and walk to it?
      let covered = false;
      for (let a = 0; a < 8 && !covered; a++) {
        for (const r of [0, R * 0.6, R]) {
          const px = x + Math.cos((a * Math.PI) / 4) * r;
          const py = y + Math.sin((a * Math.PI) / 4) * r;
          if (!world.nav.isBlocked(px, py) && world.nav.isReachable(px, py)) {
            covered = true;
            break;
          }
        }
      }
      if (!covered) dead++;
    }
  }
  return dead;
}

function inspect(world: World): Row {
  const row: Row = {
    placed: false,
    farHalf: false,
    farEnd: false,
    hordeGap: 0,
    cars: 0,
    silent: 0,
    carsInGeometry: 0,
    glass: 0,
    guns: 0,
    utilities: 0,
    radios: 0,
    cityRadios: 0,
    strays: 0,
    officers: 0,
    staff: 0,
    rooms: 0,
    sealed: 0,
    dead: 0,
    officeOpen: 0,
    narrowest: Infinity,
  };
  const st = world.map.policeStation;
  if (!st) return row;
  row.placed = true;
  const b = world.map.buildings[st.building];
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;

  /*
   * --- where it landed, against where the outbreak came in.
   *
   * **Asked of the whole footprint, not of its centre.** A building whose
   * middle is on the right side of the line can still have half of itself on
   * the wrong one, and "always" was the word in the request. The apron is left
   * out — it is a car park, not the station.
   */
  const side = world.map.outbreakSide;
  const along = world.map.outbreakAlong;
  if (side === 0) row.farHalf = b.y >= WORLD_HEIGHT / 2;
  else if (side === 2) row.farHalf = b.y + b.h <= WORLD_HEIGHT / 2;
  else if (side === 1) row.farHalf = b.x + b.w <= WORLD_WIDTH / 2;
  else row.farHalf = b.x >= WORLD_WIDTH / 2;
  // The free axis: the one the breach ran *along*.
  const freeHigh = side === 0 || side === 2 ? cx > WORLD_WIDTH / 2 : cy > WORLD_HEIGHT / 2;
  row.farEnd = freeHigh === along < 0.5;

  /*
   * --- and the thing the half rule is actually for: how far the station is
   * from the outbreak that walked in. The rule above is a statement about
   * geometry and this is a statement about the round — a station correctly in
   * the far half but hard against the midline is not "away from" anything.
   */
  const diag = Math.hypot(WORLD_WIDTH, WORLD_HEIGHT);
  let nearest = Infinity;
  for (const e of world.entities.values()) {
    if (e.type !== 'zombie') continue;
    const d = Math.hypot(e.x - cx, e.y - cy);
    if (d < nearest) nearest = d;
  }
  row.hordeGap = Number.isFinite(nearest) ? nearest / diag : 0;

  // --- the yard
  for (const v of world.vehicles.values()) {
    if (!v.id.startsWith('police-car-')) continue;
    row.cars++;
    if (v.silent) row.silent++;
    const cos = Math.cos(v.facing);
    const sin = Math.sin(v.facing);
    for (const a of [-CAR_LENGTH / 2, 0, CAR_LENGTH / 2]) {
      for (const c of [-CAR_WIDTH / 2, 0, CAR_WIDTH / 2]) {
        const px = v.x + cos * a - sin * c;
        const py = v.y + sin * a + cos * c;
        if (buildingIndexAt(world, px, py) >= 0) {
          row.carsInGeometry++;
          break;
        }
      }
    }
  }

  // --- the clerk's window. Glass, on the counter line, inside the footprint.
  for (const w of world.map.windows) {
    const wx = w.x + w.w / 2;
    const wy = w.y + w.h / 2;
    if (wx > b.x && wx < b.x + b.w && wy > b.y && wy < b.y + b.h) row.glass++;
  }

  /*
   * --- the armoury, **counted by id rather than by what is standing in it**.
   *
   * The station is a building like any other, so the ordinary building roll
   * can and does drop a rifle in it — measured, that put "1-3 utilities" at a
   * max of 4 on a room that had placed 2. The claim is about what the armoury
   * stocked, and the ids are what say so.
   */
  for (const p of world.pickups.values()) {
    const mine = p.id === STATION_RADIO_ID || p.id.startsWith(ARMOURY_PREFIX);
    if (mine) {
      if (p.id === STATION_RADIO_ID) row.radios++;
      else if (ITEMS[p.item].kind === 'gun') row.guns++;
      else row.utilities++;
      // And every one of them has to be in the room it is supposed to be in.
      const inRoom =
        p.x > st.armoury.x &&
        p.x < st.armoury.x + st.armoury.w &&
        p.y > st.armoury.y &&
        p.y < st.armoury.y + st.armoury.h;
      if (!inRoom) row.strays++;
      continue;
    }
    // What the ceiling governs is the rest of the city's radios.
    if (p.item === 'radio' && !p.id.startsWith('loot-test-')) row.cityRadios++;
  }

  // --- who is in it
  for (const [id, e] of world.entities) {
    if (buildingIndexAt(world, e.x, e.y) !== st.building) continue;
    if (id.startsWith('station-officer-')) row.officers++;
    else if (e.type === 'human') row.staff++;
  }

  // --- the rooms, off the finished walls
  for (const r of world.rooms.rooms) {
    if (r.building !== st.building) continue;
    row.rooms++;
    if (r.exits.length === 0) row.sealed++;
  }

  row.dead = deadFloor(world, b);

  /*
   * --- how open the office is, and the narrowest gap anywhere in the plan.
   *
   * **Both measured against the finished walls, not against `world.nav`.**
   * The nav grid carries `NAV_INFLATE` (10px a side), so a 10px partition reads
   * as 30 and a 56px doorway reads as 36 — measured that way the office came
   * back 76% clear and the narrowest gap in the building 14px, neither of which
   * is a fact about the geometry. The inflation is there so a *route* keeps its
   * distance from a wall; what a body actually fits down is the wall itself.
   */
  const solidAt = (x: number, y: number): boolean => {
    for (const w of world.map.walls) {
      if (x >= w.x && x <= w.x + w.w && y >= w.y && y <= w.y + w.h) return true;
    }
    for (const w of world.map.windows) {
      if (x >= w.x && x <= w.x + w.w && y >= w.y && y <= w.y + w.h) return true;
    }
    return false;
  };

  let open = 0;
  let total = 0;
  for (let x = st.office.x; x < st.office.x + st.office.w; x += 4) {
    for (let y = st.office.y; y < st.office.y + st.office.h; y += 4) {
      total++;
      if (!solidAt(x, y)) open++;
    }
  }
  row.officeOpen = total ? open / total : 0;

  // Clear runs across the interior, both ways. The shortest is the tightest
  // squeeze the plan leaves anywhere — a doorway, or a slot between cubicles.
  for (const horiz of [true, false]) {
    const outer = horiz ? b.h : b.w;
    const inner = horiz ? b.w : b.h;
    for (let o = 14; o < outer - 14; o += 4) {
      let run = 0;
      for (let i = 0; i <= inner; i += 2) {
        const x = horiz ? b.x + i : b.x + o;
        const y = horiz ? b.y + o : b.y + i;
        const solid = i >= inner || solidAt(x, y);
        if (solid) {
          if (run > 0 && run < row.narrowest) row.narrowest = run;
          run = 0;
        } else {
          run += 2;
        }
      }
    }
  }
  return row;
}

console.log(`police station, ${CITIES} cities at pop ${process.env.POP ?? 500}\n`);

const rows: Row[] = [];
for (let i = 0; i < CITIES; i++) {
  const world = createWorld();
  rows.push(inspect(world));
}

/*
 * **The control for the staff**, and it is the whole value of that row.
 *
 * The station is a building, so the ordinary indoor draw lands people in it
 * whether or not anybody was put there on purpose — a bare count of who is
 * standing in it is satisfied just as well by a station with no staff code at
 * all. What the gate buys is the difference.
 */
setStationHasNoStaff(true);
const bare: Row[] = [];
for (let i = 0; i < CITIES; i++) bare.push(inspect(createWorld()));
setStationHasNoStaff(false);

const made = rows.filter((r) => r.placed);
console.log(`  placed in ${made.length}/${CITIES} cities`);
check(made.length === CITIES, 'a station on every map');

check(
  made.every((r) => r.farHalf),
  'always in the half away from the breach',
  `${made.filter((r) => r.farHalf).length}/${made.length}`,
);
const farEnds = made.filter((r) => r.farEnd).length;
const share = made.length ? farEnds / made.length : 0;
/*
 * The bias is `POLICE_STATION_FAR_END_CHANCE` to the far half plus an even split
 * of the rest, so the expected share is 0.85 — and at n=40 that is +-17% at three
 * standard errors. The claim being made is only "usually, and not always", so that
 * is what is checked; a tighter upper bound failed about one run in fourteen on
 * code that was working.
 */
check(
  share > 0.6 && share < 0.99,
  'and usually — not always — the far end of it',
  `${farEnds}/${made.length} = ${(share * 100).toFixed(0)}%`,
);

const gaps = made.map((r) => r.hordeGap);
check(
  gaps.every((g) => g > 0.3),
  'and a long way from the outbreak that walked in',
  `nearest zombie ${(Math.min(...gaps) * 100).toFixed(0)}%-${(Math.max(...gaps) * 100).toFixed(0)}%` +
    ` of the map diagonal away, median ${(med(gaps) * 100).toFixed(0)}%`,
);

const carCounts = made.map((r) => r.cars);
check(
  carCounts.every((n) => n >= 0 && n <= POLICE_STATION_PARKING),
  `0-${POLICE_STATION_PARKING} cars in the yard`,
  `min ${Math.min(...carCounts)} med ${med(carCounts)} max ${Math.max(...carCounts)}`,
);
check(
  new Set(carCounts).size > 1,
  'and how many is actually rolled',
  `${[...new Set(carCounts)].sort().join(',')}`,
);
check(
  made.every((r) => r.silent === r.cars),
  'every one of them with its siren off',
  `${made.reduce((a, r) => a + r.silent, 0)}/${made.reduce((a, r) => a + r.cars, 0)}`,
);
check(
  made.every((r) => r.carsInGeometry === 0),
  'and none of them parked in a wall',
  `${made.reduce((a, r) => a + r.carsInGeometry, 0)} in geometry`,
);

check(
  made.every((r) => r.glass > 0),
  "the clerk's desk is glass",
  `${med(made.map((r) => r.glass))} panes, median`,
);

const guns = made.map((r) => r.guns);
const utils = made.map((r) => r.utilities);
check(
  guns.every((n) => n >= POLICE_STATION_GUNS_MIN && n <= POLICE_STATION_GUNS_MAX),
  `${POLICE_STATION_GUNS_MIN}-${POLICE_STATION_GUNS_MAX} guns in the armoury`,
  `min ${Math.min(...guns)} med ${med(guns)} max ${Math.max(...guns)}`,
);
check(
  utils.every((n) => n >= POLICE_STATION_UTILITIES_MIN && n <= POLICE_STATION_UTILITIES_MAX),
  `${POLICE_STATION_UTILITIES_MIN}-${POLICE_STATION_UTILITIES_MAX} utilities with them`,
  `min ${Math.min(...utils)} med ${med(utils)} max ${Math.max(...utils)}`,
);

/*
 * **Both runs pooled, and the band sized off the sample rather than picked.**
 *
 * The staff gate does not touch loot, so the control run is another n of the
 * same coin and doubling the sample halves the error. And a fixed +-0.16 on a
 * 0.3 coin is 1.7 standard errors at n=24 — it failed about one run in ten on
 * code that was working, which is a check nobody can act on. Three standard
 * errors is the honest width.
 */
const radioRuns = [...made, ...bare.filter((r) => r.placed)];
const withRadio = radioRuns.filter((r) => r.radios > 0).length;
const rShare = radioRuns.length ? withRadio / radioRuns.length : 0;
const rBand =
  3 *
  Math.sqrt(
    (POLICE_STATION_RADIO_CHANCE * (1 - POLICE_STATION_RADIO_CHANCE)) /
      Math.max(1, radioRuns.length),
  );
check(
  Math.abs(rShare - POLICE_STATION_RADIO_CHANCE) < rBand,
  `a radio about ${(POLICE_STATION_RADIO_CHANCE * 100).toFixed(0)}% of the time`,
  `${withRadio}/${radioRuns.length} = ${(rShare * 100).toFixed(0)}%,` +
    ` band +-${(rBand * 100).toFixed(0)}%`,
);
check(
  made.every((r) => r.radios <= 1),
  'never two of them',
);
/*
 * **The cap is the interesting half.** `ITEM_CITY_CAP.radio` is 2, and the
 * armoury's is outside it in *both* directions: it is not refused when the city
 * already holds two, and it does not cost a house one. So the check is that the
 * rest of the city still reads its own ceiling with the armoury's on top.
 */
const cap = ITEM_CITY_CAP.radio ?? 0;
check(
  made.every((r) => r.cityRadios <= cap),
  `the rest of the city still holds at most ${cap} radios`,
  `max ${Math.max(...made.map((r) => r.cityRadios))}`,
);
check(
  made.some((r) => r.radios > 0 && r.cityRadios === cap),
  'and a full city can still have the armoury one on top',
  `${made.filter((r) => r.radios > 0 && r.cityRadios === cap).length} such cities`,
);

const officers = made.map((r) => r.officers);
check(
  officers.every((n) => n >= 1 && n <= POLICE_STATION_OFFICERS_MAX),
  `manned by ${POLICE_STATION_OFFICERS_MIN}-${POLICE_STATION_OFFICERS_MAX} grey officers`,
  `min ${Math.min(...officers)} med ${med(officers)} max ${Math.max(...officers)}`,
);
const staff = made.map((r) => r.staff);
const bareStaff = bare.filter((r) => r.placed).map((r) => r.staff);
check(
  staff.every((n) => n >= POLICE_STATION_STAFF_MIN),
  `at least ${POLICE_STATION_STAFF_MIN} civilians in it, always`,
  `min ${Math.min(...staff)} med ${med(staff)} max ${Math.max(...staff)}`,
);
/*
 * **Measured on the mean rather than on the floor of the range.** An unlucky
 * city with the staff gated off still draws three ordinary indoor civilians
 * into the station now and then, so comparing minima is a coin toss on twenty
 * cities — it failed one run in three on code that was working. What the staff
 * move is the whole distribution, by about their own number.
 */
const gain = mean(staff) - mean(bareStaff);
check(
  gain > POLICE_STATION_STAFF_MIN - 0.5,
  `and about ${POLICE_STATION_STAFF_MIN}-${POLICE_STATION_STAFF_MAX} of them are staff, not passers-by`,
  `${mean(staff).toFixed(1)} vs ${mean(bareStaff).toFixed(1)} with the staff gated off,` +
    ` so +${gain.toFixed(1)}`,
);
check(
  made.every((r) => r.strays === 0),
  "and the armoury's stock is all in the armoury",
  `${made.reduce((a, r) => a + r.strays, 0)} astray`,
);

check(
  made.every((r) => r.rooms >= 4),
  'a lobby, an office, a cell and an armoury',
  `${med(made.map((r) => r.rooms))} rooms, median`,
);
check(
  made.every((r) => r.sealed === 0),
  'none of them sealed off',
  `${made.reduce((a, r) => a + r.sealed, 0)} without an exit`,
);
check(
  made.every((r) => r.dead === 0),
  'no floor a body cannot get to',
  `${made.reduce((a, r) => a + r.dead, 0)} dead cells`,
);
check(
  made.every((r) => r.narrowest >= TILE),
  'and nothing in it narrower than a tile',
  `narrowest ${Math.min(...made.map((r) => r.narrowest))}px`,
);
check(
  made.every((r) => r.officeOpen > 0.8),
  'the cubicles are a layout, not a maze',
  `${(med(made.map((r) => r.officeOpen)) * 100).toFixed(0)}% of the office is clear floor`,
);

console.log(
  `\n  footprint ${POLICE_STATION_W_TILES * TILE}x${POLICE_STATION_H_TILES * TILE}` +
    `, cars ${med(carCounts)} med, officers ${med(officers)} med, staff ${med(staff)} med` +
    `, armoury ${med(guns)} guns + ${med(utils)} utilities`,
);
console.log(`\n${fails === 0 ? 'all checks passed' : `${fails} checks FAILED`}`);

