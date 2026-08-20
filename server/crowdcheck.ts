/**
 * Headless checks on two reported crowd faults, both staged.
 *
 * No socket, no port, so it leaves a game on 8080 alone.
 *
 * Three things make the numbers mean anything, and the first two versions of
 * this file got each of them wrong in turn:
 *
 * - **Both modes run on the same city, back to back.** The map is not seeded,
 *   so a fresh one per mode compares two different buildings: an unpaired run
 *   put 31 people in the old mode's rooms and 7 in the new one's.
 * - **The zombies are pinned.** Left free they close on whoever they can see,
 *   the geometry stops holding, and a civilian simply chased out of the room
 *   looks exactly like the fix working.
 * - **It is staged, not live.** Measured in a real city, "walked toward a
 *   zombie it could see" is swamped by the flight itself — skirting a wall,
 *   going round a doorway, being unstuck — which flips toward and away several
 *   times a second under a signal of a few events a minute.
 *
 *   npx tsx crowdcheck.ts
 */
import {
  createWorld,
  resetWorld,
  rebuildNav,
  rebuildEntityGrid,
  resolveCollisions,
  buildingIndexAt,
  hasLineOfSight,
  makeEntity,
  newAiState,
  type World,
  type Entity,
  type AiState,
} from './src/world.js';
import { computeFrozen, updateAi, setNoDodge, setNoDoorwayMob } from './src/ai.js';
import { OUTSIDE } from './src/rooms.js';
import { initDoors, openDoor } from './src/doors.js';
import {
  TICK_RATE,
  PATH_NODE_BUDGET_PER_TICK,
  HUMAN_SIGHT_RADIUS,
  ENTITY_RADIUS,
} from '../shared/constants.js';

const TICK_MS = 1000 / TICK_RATE;
const CITIES = Number(process.env.CITIES ?? 10);

function med(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = xs.slice().sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

const pins = new Map<string, { x: number; y: number }>();

function tick(world: World, now: number, dt: number): void {
  world.pathBudget = PATH_NODE_BUDGET_PER_TICK;
  if (world.navDirty) rebuildNav(world);
  rebuildEntityGrid(world);
  updateAi(world, now, dt, computeFrozen(world));
  resolveCollisions(world);
  // Pinned means pinned: `updateAi` and `resolveCollisions` both move them.
  for (const [id, home] of pins) {
    const e = world.entities.get(id);
    if (!e) continue;
    e.x = home.x;
    e.y = home.y;
  }
}

/** A world with nothing alive in it, and doors back to a known state. */
function bareWorld(): World {
  const world = createWorld();
  resetWorld(world);
  clearActors(world);
  return world;
}

/** Everything the rig put in, taken back out, leaving the city untouched. */
function clearActors(world: World): void {
  for (const id of [...world.entities.keys()]) {
    world.entities.delete(id);
    world.ai.delete(id);
  }
  world.playerIds.clear();
  world.bots.clear();
  world.dogs.clear();
  world.grapples.clear();
  world.pendingInfections.clear();
  initDoors(world);
  pins.clear();
}

function addZombie(world: World, id: string, x: number, y: number, now: number): Entity {
  const z = makeEntity(id, 'zombie', x, y);
  world.entities.set(id, z);
  world.ai.set(id, newAiState(now, x, y));
  pins.set(id, { x, y });
  return z;
}

function addHuman(
  world: World,
  id: string,
  x: number,
  y: number,
  now: number,
  tweak: (s: AiState) => void = () => {},
): { e: Entity; state: AiState } {
  const e = makeEntity(id, 'human', x, y);
  world.entities.set(id, e);
  const state = newAiState(now, x, y);
  tweak(state);
  world.ai.set(id, state);
  return { e, state };
}

// ------------------------------------------------- 1. turning back toward one

interface TurnBack {
  returns: number;
  closest: number;
  towardTicks: number;
}

/**
 * Open ground, one pinned zombie, and a civilian whose business is on the far
 * side of it. Does it keep coming back?
 *
 * OLD here is `skirtThreat`, which is what a civilian ran before: one threat,
 * and the first side that was merely walkable rather than the side with room
 * on it.
 */
function runTurnBack(world: World, spot: { x: number; y: number }, old: boolean): TurnBack {
  setNoDodge(old);
  clearActors(world);
  let clock = Date.now();
  const zombie = addZombie(world, 'z', spot.x, spot.y, clock);
  const { e, state } = addHuman(world, 'civ', spot.x - 380, spot.y, clock, (s) => {
    s.settleTrait = 'building';
    s.bushHider = false;
    s.officerSeeker = false;
    s.shelterSeeker = false;
    s.followsCrowd = false;
    s.staysIndoors = false;
  });
  // Somewhere to be, on the other side of it — held as a *latched refuge*,
  // which is the thing that keeps walking them back. `chooseSettleGoal` sticks
  // with one once chosen ("or this turns into a random walk"), and stuck with
  // it whatever had since happened between them and it.
  state.mode = 'seek';
  state.seekUntil = clock + 1e9;
  state.wanderX = spot.x + 380;
  state.wanderY = spot.y;
  state.refugeX = spot.x + 380;
  state.refugeY = spot.y;

  let inSight = true;
  let returns = 0;
  let closest = Infinity;
  let toward = 0;
  let lastX = e.x;
  let lastY = e.y;
  for (let i = 0; i < 2700; i++) {
    clock += TICK_MS;
    tick(world, clock, TICK_MS / 1000);
    const d = Math.hypot(e.x - zombie.x, e.y - zombie.y);
    closest = Math.min(closest, d);
    // Their own step against the bearing to it, which is the honest test: the
    // gap closes on its own while somebody runs, a zombie being the faster of
    // the two by design.
    const mx = e.x - lastX;
    const my = e.y - lastY;
    lastX = e.x;
    lastY = e.y;
    const moved = Math.hypot(mx, my);
    if (moved > 0.4 && (mx * (zombie.x - e.x) + my * (zombie.y - e.y)) / (moved * Math.max(1, d)) > 0.4) {
      toward++;
    }
    // Hysteresis on the measurement too, or somebody hovering on the line
    // counts a hundred times.
    if (inSight && d > HUMAN_SIGHT_RADIUS * 1.35) inSight = false;
    else if (!inSight && d < HUMAN_SIGHT_RADIUS) {
      inSight = true;
      returns++;
    }
  }
  return { returns, closest, towardTicks: toward };
}

function rigTurnBack(): void {
  console.log('\n--- staged: a civilian whose errand is on the far side of a zombie ---');
  const res: Record<string, TurnBack[]> = { OLD: [], NEW: [] };

  for (let c = 0; c < CITIES; c++) {
    const world = bareWorld();
    let spot: { x: number; y: number } | null = null;
    for (let i = 0; i < 4000 && !spot; i++) {
      const x = 400 + Math.random() * (world.map.width - 800);
      const y = 400 + Math.random() * (world.map.height - 800);
      const ok = (px: number, py: number): boolean =>
        buildingIndexAt(world, px, py) < 0 &&
        !world.nav.isBlocked(px, py) &&
        world.nav.isReachable(px, py);
      if (!ok(x, y) || !ok(x - 380, y) || !ok(x + 380, y) || !ok(x - 200, y) || !ok(x + 200, y)) continue;
      spot = { x, y };
    }
    if (!spot) continue;
    // Same city, same spot, both modes back to back.
    res.OLD.push(runTurnBack(world, spot, true));
    res.NEW.push(runTurnBack(world, spot, false));
  }
  setNoDodge(false);

  for (const mode of ['OLD', 'NEW'] as const) {
    const r = res[mode];
    console.log(
      `  ${mode}: came back into sight ${r.reduce((n, v) => n + v.returns, 0)} times over ${r.length} runs ` +
        `(median ${med(r.map((v) => v.returns))}), closest approach median ${med(r.map((v) => v.closest)).toFixed(0)}px, ` +
        `${med(r.map((v) => v.towardTicks))} ticks walking at it`,
    );
  }
}

// ------------------------------------------------- 2. the clogged doorway

interface Doorway {
  people: number;
  /** Came within a body length of the pile. */
  touched: number;
  /** Ticks spent walking AT the pile, per person. */
  charging: number[];
  /** How near each of them ever got. */
  closest: number[];
  /** Reached a way out of the room other than the one the pile is in. */
  otherWay: number;
}

/**
 * A room with a way out to the street, a pile of pinned zombies just inside
 * that way out, and people in the room.
 *
 * **Charging is measured off the civilian's own step, not off contact.** Six
 * people and a pile shut in one room for thirty seconds brush past each other
 * whatever anybody decides — measured that way it reads 41 of 81 at every pile
 * size in both modes, which is the room being small rather than anybody
 * charging. What the complaint is about is walking *at* them.
 *
 * The pile and the crowd are placed in the room's own coordinates —
 * `aimBeyond` from the street side for the zombies, `randomPoint` for the
 * people. An earlier version ran a line from the door to some room of the
 * building instead, and it is worth recording why that said nothing: the line
 * crosses walls, so the "pile in the doorway" was often in the room next door
 * and the measurement came out flat at every pile size.
 */
function runDoorway(
  world: World,
  room: number,
  streetDoor: number,
  spots: Array<{ x: number; y: number }>,
  mobSize: number,
  old: boolean,
): Doorway | null {
  setNoDoorwayMob(old);
  clearActors(world);
  let clock = Date.now();
  openDoor(world, streetDoor);

  const r = world.rooms.rooms[room];
  const mouth = world.rooms.aimBeyond(streetDoor, OUTSIDE);
  const inward = Math.atan2(r.y - mouth.y, r.x - mouth.x);
  const zombies: Entity[] = [];
  for (let i = 0; i < mobSize; i++) {
    const out = (i % 3) * 26;
    const side = ((i / 3) | 0) * 26 - 26;
    const zx = mouth.x + Math.cos(inward) * out - Math.sin(inward) * side;
    const zy = mouth.y + Math.sin(inward) * out + Math.cos(inward) * side;
    if (world.rooms.roomAt(zx, zy) !== room) continue;
    zombies.push(addZombie(world, `z${i}`, zx, zy, clock));
  }
  if (zombies.length === 0) return null;

  const crowd: Entity[] = [];
  for (let i = 0; i < spots.length; i++) {
    crowd.push(
      addHuman(world, `h${i}`, spots[i].x, spots[i].y, clock, (s) => {
        s.fleeStyle = 'safest';
        s.bushHider = false;
        s.officerSeeker = false;
      }).e,
    );
  }

  const touched = new Set<string>();
  const otherWay = new Set<string>();
  const closest = new Map<string, number>();
  const charging = new Map<string, number>();
  const last = new Map<string, { x: number; y: number }>();
  for (const e of crowd) last.set(e.id, { x: e.x, y: e.y });
  const others = r.exits.filter((i) => i !== streetDoor).map((i) => world.map.doors[i]);

  for (let i = 0; i < 900; i++) {
    clock += TICK_MS;
    tick(world, clock, TICK_MS / 1000);
    for (const e of crowd) {
      let d = Infinity;
      let nx = 0;
      let ny = 0;
      for (const z of zombies) {
        const zd = Math.hypot(e.x - z.x, e.y - z.y);
        if (zd >= d) continue;
        d = zd;
        nx = z.x;
        ny = z.y;
      }
      closest.set(e.id, Math.min(closest.get(e.id) ?? Infinity, d));
      if (d < ENTITY_RADIUS.human + ENTITY_RADIUS.zombie + 8) touched.add(e.id);

      const was = last.get(e.id)!;
      const mx = e.x - was.x;
      const my = e.y - was.y;
      was.x = e.x;
      was.y = e.y;
      const moved = Math.hypot(mx, my);
      if (moved > 0.4 && (mx * (nx - e.x) + my * (ny - e.y)) / (moved * Math.max(1, d)) > 0.5) {
        charging.set(e.id, (charging.get(e.id) ?? 0) + 1);
      }
      for (const o of others) {
        if (Math.hypot(e.x - o.x, e.y - o.y) < 40) otherWay.add(e.id);
      }
    }
  }
  return {
    people: crowd.length,
    touched: touched.size,
    charging: crowd.map((e) => charging.get(e.id) ?? 0),
    closest: crowd.map((e) => closest.get(e.id) ?? Infinity),
    otherWay: otherWay.size,
  };
}

/**
 * `onlyExit` picks the case the complaint is really about: an ordinary block
 * with one way in and out, where the old code found the pile "not covering"
 * the door and sent the room at it. With a second way out both modes already
 * used it — 78 of 84 either way — so that case proves nothing either way.
 */
function rigDoorway(onlyExit: boolean): void {
  console.log(
    `\n--- staged: a pile in the way out of a room ${onlyExit ? 'with no other way out' : 'that has another way out'} ---`,
  );
  for (const mobSize of [1, 2, 4, 8]) {
    const tot: Record<string, Doorway> = {
      OLD: { people: 0, touched: 0, charging: [], closest: [], otherWay: 0 },
      NEW: { people: 0, touched: 0, charging: [], closest: [], otherWay: 0 },
    };
    let rooms = 0;

    for (let c = 0; c < CITIES; c++) {
      const world = bareWorld();
      const r = world.rooms.rooms.find(
        (room) =>
          room.size > 150 &&
          (onlyExit ? room.exits.length === 1 : room.exits.length >= 2) &&
          room.exits.some((i) => world.rooms.farSideOf(i, room.id) === OUTSIDE),
      );
      if (!r) continue;
      const streetDoor = r.exits.find((i) => world.rooms.farSideOf(i, r.id) === OUTSIDE)!;

      // One crowd, used by both modes, so the only difference is the code.
      const mouth = world.rooms.aimBeyond(streetDoor, OUTSIDE);
      const spots: Array<{ x: number; y: number }> = [];
      for (let i = 0; i < 60 && spots.length < 6; i++) {
        const spot = world.rooms.randomPoint(r.id);
        if (!spot) break;
        if (Math.hypot(spot.x - mouth.x, spot.y - mouth.y) < 130) continue;
        spots.push(spot);
      }
      if (spots.length === 0) continue;

      const a = runDoorway(world, r.id, streetDoor, spots, mobSize, true);
      const b = runDoorway(world, r.id, streetDoor, spots, mobSize, false);
      if (!a || !b) continue;
      rooms++;
      for (const [k, v] of [
        ['OLD', a],
        ['NEW', b],
      ] as const) {
        tot[k].people += v.people;
        tot[k].touched += v.touched;
        tot[k].otherWay += v.otherWay;
        tot[k].charging.push(...v.charging);
        tot[k].closest.push(...v.closest);
      }
    }
    setNoDoorwayMob(false);
    if (rooms === 0) continue;

    for (const mode of ['OLD', 'NEW'] as const) {
      const v = tot[mode];
      console.log(
        `  ${String(mobSize).padStart(2)} in the doorway, ${mode}: ` +
          `walking at it ${(med(v.charging) / 30).toFixed(1)}s median, ` +
          `${String(v.touched).padStart(3)}/${v.people} reached it, ` +
          `closest median ${med(v.closest).toFixed(0)}px` +
          (onlyExit ? '' : `, ${v.otherWay}/${v.people} used another way out`) +
          (mode === 'NEW' ? `   (${rooms} rooms)` : ''),
      );
    }
  }
}


// ------------------------------------------------- 3. live, in a real city

/**
 * The same question in a whole city rather than on a rig: how much of the time
 * is a civilian that can see a zombie **walking at it**?
 *
 * Measured off their own step, never off the gap between the two bodies. A
 * zombie is faster than a fleeing human by design, so the distance closes
 * while they run for their life — measured that way `flee` reads as "46% of
 * samples spent closing on it", which is the chase working rather than
 * anybody walking the wrong way.
 *
 * And the sight test re-checks the distance. `queryCircle` is a bounding
 * *box*, so it hands back bodies out to 424px on the diagonal against a 300px
 * sight radius, and `senseThreats` re-checks `dist <= sight`. Without that the
 * probe reports people walking at zombies they cannot possibly see: it put the
 * "wander" share at 42% on a sample that turned out to be zombies at 359-384px.
 *
 * ONLY=dodge|shun|door holds the other two changes at their old behaviour so a
 * difference can be attributed rather than merely observed.
 */
const ONLY = process.env.ONLY ?? '';
const alone = (name: string, old: boolean): boolean => (ONLY === '' || ONLY === name ? old : true);
/** Alternated on the same evolving city: two `npx tsx` runs are not comparable. */
const AB_BLOCK = 300;
const TICKS = Number(process.env.TICKS ?? 3600);
/** Below this a sample is standing about, and neither toward nor away. */
const MOVED_MIN = 1.5;

function setOld(old: boolean): void {
    setNoDodge(alone('dodge', old));
  setNoDoorwayMob(alone('door', old));
}

function rigLive(): void {
  console.log(
    `\n--- live: how often does somebody who can see a zombie walk at it? ${ONLY ? `(${ONLY} alone)` : ''} ---`,
  );
  for (let c = 0; c < 3; c++) {
    const world = createWorld();
    resetWorld(world);
    let clock = Date.now();

    const toward: Record<string, number> = { OLD: 0, NEW: 0 };
    const moving: Record<string, number> = { OLD: 0, NEW: 0 };
    const spells: Record<string, number[]> = { OLD: [], NEW: [] };
    const cost: Record<string, number[]> = { OLD: [], NEW: [] };
    const runNow = new Map<string, number>();
    const prev = new Map<string, { x: number; y: number }>();

    for (let i = 0; i < TICKS; i++) {
      clock += TICK_MS;
      const old = Math.floor(i / AB_BLOCK) % 2 === 1;
      setOld(old);
      const t0 = performance.now();
      tick(world, clock, TICK_MS / 1000);
      cost[old ? 'OLD' : 'NEW'].push(performance.now() - t0);
      if (i % 3 !== 0) continue;
      const bucket = old ? 'OLD' : 'NEW';

      for (const [id, state] of world.ai) {
        void state;
        const e = world.entities.get(id);
        if (!e || e.type !== 'human') {
          prev.delete(id);
          continue;
        }
        const was = prev.get(id);
        prev.set(id, { x: e.x, y: e.y });

        let near: { x: number; y: number; d: number } | null = null;
        for (const z of world.zombieGrid.queryCircle(e.x, e.y, HUMAN_SIGHT_RADIUS, new Set())) {
          const d = Math.hypot(z.x - e.x, z.y - e.y);
          if (d > HUMAN_SIGHT_RADIUS) continue;
          if (near && d >= near.d) continue;
          if (!hasLineOfSight(world, e.x, e.y, z.x, z.y)) continue;
          near = { x: z.x, y: z.y, d };
        }
        if (!near || !was) {
          runNow.set(id, 0);
          continue;
        }
        const mx = e.x - was.x;
        const my = e.y - was.y;
        const moved = Math.hypot(mx, my);
        if (moved < MOVED_MIN) continue;
        moving[bucket]++;
        const at = (mx * (near.x - e.x) + my * (near.y - e.y)) / (moved * Math.max(1, near.d)) > 0.4;
        if (at) {
          toward[bucket]++;
          runNow.set(id, (runNow.get(id) ?? 0) + 1);
        } else {
          const run = runNow.get(id) ?? 0;
          if (run > 0) spells[bucket].push(run);
          runNow.set(id, 0);
        }
      }
    }
    setOld(false);

    const line = (mode: 'OLD' | 'NEW'): string => {
      const s = spells[mode].slice().sort((a, b) => a - b);
      const q = (p: number): string =>
        ((s[Math.min(s.length - 1, Math.floor(s.length * p))] ?? 0) * 0.1).toFixed(1);
      return (
        `${((100 * toward[mode]) / Math.max(1, moving[mode])).toFixed(1)}% of moving samples, ` +
        `${String(s.length).padStart(4)} spells, median ${q(0.5)}s p90 ${q(0.9)}s worst ${((s[s.length - 1] ?? 0) * 0.1).toFixed(1)}s, tick ${med(cost[mode]).toFixed(2)}ms`
      );
    };
    console.log(`  city ${c + 1}  OLD: ${line('OLD')}`);
    console.log(`           NEW: ${line('NEW')}`);
  }
}

console.log(`crowdcheck — ${CITIES} cities, both modes on each`);
rigTurnBack();
rigDoorway(true);
rigDoorway(false);
rigLive();
