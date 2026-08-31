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
 * And then, once it existed: *"a thicker wall like a rectangle that the window
 * sits on" … "make the building a
 * little larger … the jail cell locked and can only be kicked down by officers
 * or by zombies or the zombie dog … 0-3 civilians in the jail cell each round …
 * white parking space lanes for the cars … the loot on gun racks (two stalls
 * like a urinal and the loot in between)"*. The teeth on the gate and the paint
 * on the road are claims about pixels, so they are measured in
 * `client/src/stationrig.ts` rather than here.
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
import {
  createWorld,
  resetWorld,
  rebuildEntityGrid,
  rebuildNav,
  buildingIndexAt,
  hasLineOfSight,
  hasWallClearPath,
  setStationHasNoStaff,
  setStationCellEmpty,
  type World,
} from './src/world.js';
import { computeFrozen, updateAi } from './src/ai.js';

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
  POLICE_STATION_CELL_MIN,
  POLICE_STATION_CELL_MAX,
  POLICE_STATION_BAY_TILES,
  POLICE_STATION_BAY_DEPTH,
  POLICE_STATION_APRON,
  POLICE_STATION_RACK_BAY,
  POLICE_STATION_RACK_DEPTH,
  POLICE_STATION_COUNTER_DEPTH,
  POLICE_STATION_RADIO_CHANCE,
  CAR_LENGTH,
  CAR_WIDTH,
  WALL_THICKNESS,
  DOOR_HEALTH,
  DOOR_ZOMBIE_DAMAGE,
  TICK_RATE,
  PATH_NODE_BUDGET_PER_TICK,
  setCityPopulation,
} from '../shared/constants.js';
import { damageDoor } from './src/doors.js';

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
/**
 * The standard error of the difference between two sample means.
 *
 * **Every gate in this file is measured as a gain against a control run, and a
 * gain needs a band sized off its own sample.** Written as a fixed threshold
 * one of them sat on a knife edge — "about 2-3 staff" was checked as
 * `gain > 1.5` and a true gain of 2.5 reads 1.5 at one and a half standard
 * errors, which is a coin toss on code that is working. Two other checks here
 * had already been re-sized for exactly this; this makes it the arithmetic
 * rather than a number somebody picks.
 */
function sem2(a: number[], b: number[]): number {
  const varOf = (xs: number[]): number => {
    if (xs.length < 2) return 0;
    const m = mean(xs);
    return xs.reduce((s, x) => s + (x - m) * (x - m), 0) / (xs.length - 1);
  };
  return Math.sqrt(varOf(a) / Math.max(1, a.length) + varOf(b) / Math.max(1, b.length));
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
  /** Civilians standing inside the cell when the round starts. */
  inmates: number;
  /** Barred cell gates in the whole city — there is exactly one. */
  gates: number;
  /** True when that gate is shut and locked, which is its only resting state. */
  gateHeld: boolean;
  /** Sample points across the clerk's glass you can see through. */
  counterSees: number;
  /** ...and the ones you could *walk* through, which must be none. */
  counterWalks: number;
  /** The control: can you walk lobby-to-office at all, by the doorway. */
  doorWalks: boolean;
  /** How thick the counter slab is — a wall's thickness would be the old one. */
  counterDepth: number;
  /** Armoury stock standing in the mouth of a stall. */
  onRack: number;
  armouryItems: number;
  /** Stalls the plan left, and how many of them are between two dividers. */
  stalls: number;
  stallsFramed: number;
  /** Closest a parking bay's edge comes to the front door's own span, in px. */
  bayDoorGap: number;
  /** Bays whose painted footprint leaves the reserved apron. */
  baysOutside: number;
}

/**
 * The **`roomfit` question, asked of one building**: floor a body cannot be on,
 * because nothing that fits there can be walked to. A cubicle layout is exactly
 * the shape of thing that gets this wrong — three partitions two tiles apart is
 * a maze if the gaps are a tile — so it is measured rather than eyeballed.
 */
/** Is this exact point inside a wall or a pane? Geometry, not the nav grid. */
function solidAtPoint(world: World, x: number, y: number): boolean {
  for (const w of world.map.walls) {
    if (x >= w.x && x <= w.x + w.w && y >= w.y && y <= w.y + w.h) return true;
  }
  for (const w of world.map.windows) {
    if (x >= w.x && x <= w.x + w.w && y >= w.y && y <= w.y + w.h) return true;
  }
  return false;
}

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
    inmates: 0,
    gates: 0,
    gateHeld: false,
    counterSees: 0,
    counterWalks: 0,
    doorWalks: false,
    counterDepth: 0,
    onRack: 0,
    armouryItems: 0,
    stalls: 0,
    stallsFramed: 0,
    bayDoorGap: Infinity,
    baysOutside: 0,
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
  const inRect = (r: { x: number; y: number; w: number; h: number }, x: number, y: number) =>
    x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h;
  for (const [id, e] of world.entities) {
    if (buildingIndexAt(world, e.x, e.y) !== st.building) continue;
    if (id.startsWith('station-officer-')) row.officers++;
    else if (e.type === 'human') {
      // The cell is part of the office in `staff` terms only if nobody is
      // locked in it, so the two are counted apart rather than one of them
      // being a subset of the other.
      if (inRect(st.cell, e.x, e.y)) row.inmates++;
      else row.staff++;
    }
  }

  /*
   * --- the cell gate.
   *
   * Exactly one in the city, always shut and always locked. `world.doors` is
   * the runtime record and `map.doors` is the plan; both have to agree, or the
   * flag is on a door nobody hung.
   */
  for (let i = 0; i < world.map.doors.length; i++) {
    if (!world.map.doors[i].bars) continue;
    row.gates++;
    const d = world.doors[i];
    if (d && !d.open && !d.broken && d.locked && d.barred) row.gateHeld = true;
  }

  /*
   * --- the clerk's counter: **see, but do not travel**.
   *
   * Sampled across the width of the glass rather than at its middle, because
   * the claim is about the whole frontage — a jut with solid returns and a
   * pane between them can be right at the centre and open at an edge. The
   * probe stands a body's radius either side of the pane, so it is the walk a
   * body would actually make.
   *
   * `doorWalks` is the control and it is load-bearing: "you cannot walk from
   * the lobby into the office here" is satisfied just as well by a plan where
   * you cannot walk from the lobby into the office at all.
   */
  {
    /*
     * **Found by its own flag, not by being the pane inside the footprint.**
     * A zombie smashing a house window is a different pane and the station is
     * a building like any other; `counter` is what says which one this is.
     */
    const pane = world.map.windows.find((w) => w.counter);
    if (pane && inRect(b, pane.x + pane.w / 2, pane.y + pane.h / 2)) {
      row.counterDepth = Math.min(pane.w, pane.h);
      const R = ENTITY_RADIUS.human + 8;
      const horiz = pane.w > pane.h;
      // Probed from clear of the *slab*, not of a wall line — it is 24px deep
      // now, so a body's radius off its centre is still standing on it.
      for (const f of [0.2, 0.5, 0.8]) {
        const px = pane.x + pane.w * (horiz ? f : 0.5);
        const py = pane.y + pane.h * (horiz ? 0.5 : f);
        const ax = horiz ? px : pane.x - R;
        const ay = horiz ? pane.y - R : py;
        const bx = horiz ? px : pane.x + pane.w + R;
        const by = horiz ? pane.y + pane.h + R : py;
        if (hasLineOfSight(world, ax, ay, bx, by)) row.counterSees++;
        if (hasWallClearPath(world, ax, ay, bx, by)) row.counterWalks++;
      }
    }
    /*
     * Lobby to office by the doorway, which is the way through beside it.
     *
     * **The door in it is opened first, and that is not cheating.** Doors are
     * in `hasWallClearPath` — that is what stops a route being drawn through a
     * shut one — so `INTERIOR_DOOR_SHARE` hanging a door there and
     * `DOOR_START_OPEN_CHANCE` leaving it shut refuses the control on about a
     * quarter of cities, which says nothing about the plan. The claim is about
     * the *opening* the walls left beside the glass.
     */
    const doorIndex = world.map.doors.findIndex(
      (d) => d.building === st.building && d.interior && !d.bars && d.horiz &&
        Math.abs(d.y - (st.lobby.y - TILE / 2)) < TILE,
    );
    if (doorIndex >= 0) {
      const doorSpec = world.map.doors[doorIndex];
      const hung = world.doors[doorIndex];
      if (hung) hung.open = true;
      row.doorWalks = hasWallClearPath(
        world,
        doorSpec.x,
        doorSpec.y + TILE,
        doorSpec.x,
        doorSpec.y - TILE,
      );
    }
  }

  /*
   * --- the racks, and whether the stock is actually standing in one.
   *
   * `stallsFramed` is the check that a slot is *between* two things rather
   * than merely inside the room: a spot with nothing either side of it is a
   * gun on the floor whatever the code that put it there was called. Measured
   * off the finished walls, sideways from the slot, at half a bay's reach.
   */
  row.stalls = st.racks.length;
  for (const slot of st.racks) {
    const reach = (POLICE_STATION_RACK_BAY * TILE) / 2 + 2;
    // Which way the wall is, so the probe walks *into* the stall rather than
    // out of it. The slot stands a shade past the dividers' tips — that is
    // what keeps it out of their inflation skirt — so a sideways probe at the
    // slot's own depth finds nothing and would report every stall unframed.
    const toWall =
      Math.abs(slot.y - st.armoury.y) < Math.abs(slot.y - (st.armoury.y + st.armoury.h)) ? -1 : 1;
    for (let k = 1; k <= 4; k++) {
      const y = slot.y + toWall * (k / 5) * POLICE_STATION_RACK_DEPTH * TILE;
      if (solidAtPoint(world, slot.x - reach, y) && solidAtPoint(world, slot.x + reach, y)) {
        row.stallsFramed++;
        break;
      }
    }
  }
  for (const p of world.pickups.values()) {
    if (p.id !== STATION_RADIO_ID && !p.id.startsWith(ARMOURY_PREFIX)) continue;
    row.armouryItems++;
    if (st.racks.some((s) => Math.hypot(s.x - p.x, s.y - p.y) < 1)) row.onRack++;
  }

  /*
   * --- the bays, against the front door and against the ground reserved for
   * them. Both are claims about where the paint goes, and the paint is laid
   * off this same list on the client.
   */
  {
    const front = world.map.doors.find((d) => d.building === st.building && !d.interior);
    const bayW = POLICE_STATION_BAY_TILES * TILE;
    for (const bay of st.parking) {
      if (front) {
        // Both spans are along x; the bays sit clear of the doorway's own.
        const gap = Math.abs(bay.x - front.x) - bayW / 2 - front.halfSpan;
        if (gap < row.bayDoorGap) row.bayDoorGap = gap;
      }
      const nose = bay.y - POLICE_STATION_BAY_DEPTH / 2;
      const tail = bay.y + POLICE_STATION_BAY_DEPTH / 2;
      const apronTop = b.y + b.h;
      if (
        nose < apronTop - 1 ||
        tail > apronTop + POLICE_STATION_APRON + 1 ||
        bay.x - bayW / 2 < b.x - 1 ||
        bay.x + bayW / 2 > b.x + b.w + 1
      ) {
        row.baysOutside++;
      }
    }
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

/*
 * **And the control for the cell**, which is the same argument again: the cell
 * is part of a building, the ordinary indoor draw samples the building's rows,
 * and it lands people in there whether or not anybody locked them in. A count
 * of who is standing in the cell is a superset; the difference is the inmates.
 */
setStationCellEmpty(true);
const noCell: Row[] = [];
for (let i = 0; i < CITIES; i++) noCell.push(inspect(createWorld()));
setStationCellEmpty(false);

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
const staffMid = (POLICE_STATION_STAFF_MIN + POLICE_STATION_STAFF_MAX) / 2;
const staffBand = 3 * sem2(staff, bareStaff);
check(
  Math.abs(gain - staffMid) < staffBand,
  `and about ${POLICE_STATION_STAFF_MIN}-${POLICE_STATION_STAFF_MAX} of them are staff, not passers-by`,
  `${mean(staff).toFixed(1)} vs ${mean(bareStaff).toFixed(1)} with the staff gated off, so` +
    ` +${gain.toFixed(2)} against ${staffMid} expected, band +-${staffBand.toFixed(2)}`,
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

// ---------------------------------------------------------------- the counter
console.log("\n  the clerk's counter");
check(
  made.every((r) => r.counterDepth === POLICE_STATION_COUNTER_DEPTH),
  'it is a slab, not a line in a wall',
  `${med(made.map((r) => r.counterDepth))}px deep against a wall's ${WALL_THICKNESS}`,
);
check(
  made.every((r) => r.counterSees === 3),
  'you can see over it, right across it',
  `${made.reduce((a, r) => a + r.counterSees, 0)}/${made.length * 3} sample lines`,
);
check(
  made.every((r) => r.counterWalks === 0),
  'and you cannot walk through any of it',
  `${made.reduce((a, r) => a + r.counterWalks, 0)}/${made.length * 3} would let a body past`,
);
/*
 * **The control, and it is the whole value of the row above.** "You cannot walk
 * from the lobby into the office at the counter" is satisfied just as well by a
 * plan where you cannot walk from the lobby into the office at all.
 */
check(
  made.every((r) => r.doorWalks),
  'and the way through beside it is open — the control',
  `${made.filter((r) => r.doorWalks).length}/${made.length}`,
);

// ------------------------------------------------------------------- the cell
console.log('\n  the cell');
check(
  made.every((r) => r.gates === 1),
  'exactly one barred gate in the city',
  `${made.reduce((a, r) => a + r.gates, 0)} across ${made.length} cities`,
);
check(
  made.every((r) => r.gateHeld),
  'shut and locked before anybody has touched it',
  `${made.filter((r) => r.gateHeld).length}/${made.length}`,
);
const inmates = made.map((r) => r.inmates);
const bareInmates = noCell.filter((r) => r.placed).map((r) => r.inmates);
/*
 * **The head count is exact, because nothing else can be in there.** The
 * ordinary indoor draw samples a building's own rows and the station is a
 * building, so it used to land people in the cell like anywhere else — and
 * measured with the cell's own spawn gated off it reached **three** on its own,
 * which made "0-3 locked in" a claim about roughly half of who was in there.
 * `populate` redraws a spawn that lands in the cell now, so the tally *is* the
 * roll and the control has to read zero.
 */
const cellGain = mean(inmates) - mean(bareInmates);
check(
  inmates.every((n) => n >= POLICE_STATION_CELL_MIN && n <= POLICE_STATION_CELL_MAX),
  `${POLICE_STATION_CELL_MIN}-${POLICE_STATION_CELL_MAX} civilians locked in it`,
  `min ${Math.min(...inmates)} med ${med(inmates)} max ${Math.max(...inmates)}`,
);
check(
  bareInmates.every((n) => n === 0),
  'and nobody else ever wanders into a locked cell — the control',
  `${bareInmates.filter((n) => n > 0).length}/${bareInmates.length} cities with anyone in it` +
    ` when nobody was put there, mean ${mean(bareInmates).toFixed(2)}`,
);
check(
  Math.min(...inmates) === POLICE_STATION_CELL_MIN &&
    Math.max(...inmates) >= POLICE_STATION_CELL_MAX &&
    new Set(inmates).size >= 3,
  'an empty cell is an ordinary sight, and a full one happens',
  `${[...new Set(inmates)].sort((a, b) => a - b).join(',')} seen,` +
    ` mean ${mean(inmates).toFixed(2)} against ${cellGain.toFixed(2)} of gain`,
);

// ---------------------------------------------------------------- the armoury
console.log('\n  the armoury');
check(
  made.every((r) => r.stalls > 0 && r.stallsFramed === r.stalls),
  'every stall is between two dividers',
  `${made.reduce((a, r) => a + r.stallsFramed, 0)}/${made.reduce((a, r) => a + r.stalls, 0)}`,
);
const racked = made.reduce((a, r) => a + r.onRack, 0);
const stocked = made.reduce((a, r) => a + r.armouryItems, 0);
const overflowed = made.filter((r) => r.armouryItems > r.stalls).length;
check(
  made.every((r) => r.onRack >= Math.min(r.armouryItems, r.stalls)),
  'and the stock stands on them rather than on the floor',
  `${racked}/${stocked} racked; ${overflowed}/${made.length} cities drew more than ${med(
    made.map((r) => r.stalls),
  )} stalls`,
);

// --------------------------------------------------------------- the car park
console.log('\n  the car park');
check(
  made.every((r) => r.bayDoorGap > 0),
  'no bay is painted across the front door',
  `closest ${Math.min(...made.map((r) => r.bayDoorGap)).toFixed(0)}px clear of it`,
);
check(
  made.every((r) => r.baysOutside === 0),
  'and every bay is inside the ground reserved for it',
  `${made.reduce((a, r) => a + r.baysOutside, 0)} outside`,
);

/*
 * ---------------------------------------------------------------- the gate,
 * **staged, because who can open it is the whole of what makes it a cell** and
 * a generated city will not answer that on its own: nothing walks up to the
 * back of a police station in the first tick of a round.
 *
 * Four claims and each has its control, because "the gate did not open" is
 * satisfied just as well by a rig in which nothing opens anything:
 *
 *  - nothing unlocks it, ever          — control: an ordinary locked door in
 *                                        the same building, which the same
 *                                        officer draws the bolt on
 *  - an officer takes it off its hinges — control: a civilian staged on the
 *                                        same pixel, who cannot
 *  - a zombie or the dog chews through  — both go through `damageDoor`, which
 *                                        is what is measured
 */
console.log('\n  who can open the gate');
{
  const R = ENTITY_RADIUS.officer;
  const RIGS = 6;
  const TICKS = 420;
  const TICK_MS = 1000 / TICK_RATE;

  interface DoorRun {
    /** The rig actually got somebody standing nose-to-slab at the door. */
    staged: boolean;
    broke: boolean;
    /** Came unlocked with the slab still on its hinges. Breaking one clears
     *  the lock too, so the two have to be told apart. */
    unlocked: boolean;
    ms: number;
  }

  /**
   * Stand `subject` at `pick`'s slab, nose to it, and let the tick loop run.
   *
   * **Pinned, and that is not optional.** `doorInTheWay` probes along
   * `state.heading` for the step the body is about to take, so a subject left
   * to walk drifts off the one thing being measured within a second — the same
   * pinning `provoke.ts` and `targetchurn.ts` each need, and for the same
   * reason.
   */
  function driveAtDoor(subject: 'bot' | 'human', pick: 'gate' | 'ordinary'): DoorRun {
    const run: DoorRun = { staged: false, broke: false, unlocked: false, ms: 0 };
    const world = createWorld();
    world.botOfficerCount = 1;
    resetWorld(world);
    const st = world.map.policeStation;
    if (!st) return run;

    const gate = world.map.doors.findIndex((d) => d.bars);
    if (gate < 0) return run;

    /*
     * The ordinary door is **bolted by hand**, because `initDoors` starts
     * every door in the city unlocked and a lock only ever appears when
     * somebody throws one. A rig with nothing alive but its subject therefore
     * never meets a locked door at all — the trap `complexcheck.ts` already
     * records, and the reason the control could not otherwise exist.
     */
    let index = gate;
    if (pick === 'ordinary') {
      index = world.map.doors.findIndex(
        (d, i) => i !== gate && d.building === st.building && d.interior && world.doors[i] !== null,
      );
      if (index < 0) return run;
      const d = world.doors[index]!;
      d.open = false;
      d.locked = true;
      d.broken = false;
      d.health = DOOR_HEALTH;
    }
    const spec = world.map.doors[index];

    // Everything else out of the way, so nothing is a threat, an escort, or a
    // reason to be somewhere else.
    const keep =
      subject === 'bot' ? 'bot-0' : [...world.entities.keys()].find((k) => k.startsWith('human-'));
    if (!keep || !world.entities.has(keep)) return run;
    for (const id of [...world.entities.keys()]) {
      if (id === keep) continue;
      world.entities.delete(id);
      world.ai.delete(id);
    }
    world.cityOfficers.clear();
    const e = world.entities.get(keep)!;
    const state = world.ai.get(keep)!;
    if (subject === 'human') world.bots.delete(keep);

    /*
     * Which side to stand on is **found, not assumed.** The gate's office side
     * is the far one from the cell, but the ordinary door is wherever the plan
     * put it and either face of it may be a wall corner. A rig staged on a
     * fixed side reports the city.
     */
    let stand: { x: number; y: number } | null = null;
    let heading = 0;
    for (const side of [1, -1]) {
      const x = spec.horiz ? spec.x : spec.x + side * (R + 8);
      const y = spec.horiz ? spec.y + side * (R + 8) : spec.y;
      if (world.nav.isBlocked(x, y) || !world.nav.isReachable(x, y)) continue;
      stand = { x, y };
      heading = spec.horiz
        ? side > 0
          ? -Math.PI / 2
          : Math.PI / 2
        : side > 0
          ? Math.PI
          : 0;
      break;
    }
    if (!stand) return run;
    run.staged = true;

    let now = 10_000;
    const dt = TICK_MS / 1000;
    for (let t = 0; t < TICKS; t++) {
      e.x = stand.x;
      e.y = stand.y;
      state.heading = heading;
      e.facing = heading;

      world.pathBudget = PATH_NODE_BUDGET_PER_TICK;
      if (world.navDirty) rebuildNav(world);
      rebuildEntityGrid(world);
      updateAi(world, now, dt, computeFrozen(world));

      const d = world.doors[index]!;
      // **While it is still on its hinges.** `damageDoor` clears the lock as
      // it breaks one, so a flag that did not say "unbroken" would read every
      // successful kick as an unlock.
      if (!d.broken && !d.locked) run.unlocked = true;
      if (d.broken && !run.broke) {
        run.broke = true;
        run.ms = now - 10_000;
      }
      now += TICK_MS;
    }
    return run;
  }

  const up = (rs: DoorRun[]) => rs.filter((r) => r.staged);
  const gateBots: DoorRun[] = [];
  const gateCivs: DoorRun[] = [];
  const plainBots: DoorRun[] = [];
  for (let i = 0; i < RIGS; i++) {
    gateBots.push(driveAtDoor('bot', 'gate'));
    gateCivs.push(driveAtDoor('human', 'gate'));
    plainBots.push(driveAtDoor('bot', 'ordinary'));
  }

  check(
    up(gateBots).length === RIGS && up(gateCivs).length === RIGS,
    'the rig stood somebody at the gate',
    `${up(gateBots).length}/${RIGS} officers, ${up(gateCivs).length}/${RIGS} civilians`,
  );
  check(
    up(gateBots).every((r) => r.broke),
    'an officer takes the gate off its hinges',
    `${up(gateBots).filter((r) => r.broke).length}/${up(gateBots).length}, median ${med(
      up(gateBots).filter((r) => r.broke).map((r) => r.ms),
    ).toFixed(0)}ms`,
  );
  check(
    up(gateBots).every((r) => !r.unlocked),
    'and never unlocks it, because there is no key',
    `${up(gateBots).filter((r) => r.unlocked).length} came unlocked on their hinges`,
  );
  /*
   * **The discriminating control.** "The officer did not unlock it" is
   * satisfied just as well by an officer that cannot work a lock at all, which
   * is not the behaviour — see the note beside `openDoorAhead`. So the same
   * officer is stood at an ordinary bolted door in the same building, where it
   * has to draw the bolt rather than kick.
   */
  check(
    up(plainBots).length > 0 && up(plainBots).every((r) => r.unlocked && !r.broke),
    'while still drawing the bolt on an ordinary locked door — the control',
    `${up(plainBots).filter((r) => r.unlocked).length}/${up(plainBots).length} unlocked,` +
      ` ${up(plainBots).filter((r) => r.broke).length} kicked in`,
  );
  check(
    up(gateCivs).every((r) => !r.broke && !r.unlocked),
    'and a civilian on the same pixel can do neither',
    `${up(gateCivs).filter((r) => r.broke).length} broke,` +
      ` ${up(gateCivs).filter((r) => r.unlocked).length} unlocked`,
  );

  /*
   * And the horde, which needs no rule of its own: a barred door is a shut
   * door, so a zombie's claws and the dog's jaws reach it through `damageDoor`
   * exactly as they reach any other. What is checked is that `barred` shields
   * nothing — measured in `DOOR_ZOMBIE_DAMAGE` bites, so the figure is the
   * number of them a cell gate actually costs.
   */
  const chew = createWorld();
  const gateIndex = chew.map.doors.findIndex((d) => d.bars);
  let bites = 0;
  if (gateIndex >= 0) {
    while (!chew.doors[gateIndex]!.broken && bites < 1000) {
      damageDoor(chew, gateIndex, DOOR_ZOMBIE_DAMAGE);
      bites++;
    }
  }
  check(
    gateIndex >= 0 && chew.doors[gateIndex]!.broken,
    'and the horde chews through it like any other shut door',
    `${bites} bites at ${DOOR_ZOMBIE_DAMAGE} against ${DOOR_HEALTH} health`,
  );
}

console.log(
  `\n  footprint ${POLICE_STATION_W_TILES * TILE}x${POLICE_STATION_H_TILES * TILE}` +
    `, cars ${med(carCounts)} med, officers ${med(officers)} med, staff ${med(staff)} med` +
    `, armoury ${med(guns)} guns + ${med(utils)} utilities`,
);
console.log(`\n${fails === 0 ? 'all checks passed' : `${fails} checks FAILED`}`);

