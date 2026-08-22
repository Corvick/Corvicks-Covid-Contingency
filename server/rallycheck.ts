/**
 * Headless check on what "GET OVER THERE!" pointed at a building actually
 * does. No socket, no port, so it leaves a game on 8080 alone.
 *
 * Reported as *"when civilians are ordered to GET OVER THERE and it's in a
 * building I don't want civilians just pushing themselves against the wall of
 * the building — they need to know they are being asked to go in a building
 * and stay in there"*. So the three figures are how many of a crowd end up
 * **inside** it, how many **hole up** in it, and how much of the round they
 * spend **pressed against its outside wall**.
 *
 * **Paired**: both behaviours run on the *same* city, from the same start
 * positions, with the same rolled traits and the same doors. The map is not
 * seeded, and unpaired this measures the city rather than the code — two runs
 * of it swapped the groups' places on nothing but how many of each city's deep
 * rooms happened to be reachable. `setRallyIgnoresBuildings` is the gate, and
 * it is kept: the control is the whole value of the run.
 *
 *   npx tsx rallycheck.ts
 *   CITIES=12 npx tsx rallycheck.ts
 */
import {
  createWorld,
  resetWorld,
  rebuildNav,
  rebuildEntityGrid,
  resolveCollisions,
  newAiState,
  makeEntity,
  buildingIndexAt,
  type AiState,
  type Entity,
  type World,
} from './src/world.js';
import { computeFrozen, updateAi, rallyHumans, setRallyIgnoresBuildings } from './src/ai.js';
import { OUTSIDE } from './src/rooms.js';
import { initDoors } from './src/doors.js';
import {
  TICK_RATE,
  PATH_NODE_BUDGET_PER_TICK,
  RALLY_RADIUS,
  PATH_MAX_NODES,
  RALLY_ROOM_GIVE_UP_MS,
} from '../shared/constants.js';

const TICK_MS = 1000 / TICK_RATE;
const CITIES = Number(process.env.CITIES ?? 8);
const TICKS = Number(process.env.TICKS ?? 1800); // 60s
const CROWD = 12;
/** Out in the street, but within a body's width of the footprint they were sent into. */
const PRESSED_PX = 26;

function tick(world: World, now: number, dt: number): void {
  world.pathBudget = PATH_NODE_BUDGET_PER_TICK;
  if (world.navDirty) rebuildNav(world);
  rebuildEntityGrid(world);
  updateAi(world, now, dt, computeFrozen(world));
  resolveCollisions(world);
}

/** A world with nothing alive in it but what the rig puts there. */
function bareWorld(): World {
  const world = createWorld();
  resetWorld(world);
  for (const id of [...world.entities.keys()]) {
    world.entities.delete(id);
    world.ai.delete(id);
  }
  world.playerIds.clear();
  world.bots.clear();
  initDoors(world);
  return world;
}

interface Out {
  sent: number;
  inside: number;
  settled: number;
  insideTicks: number;
  pressedTicks: number;
  totalTicks: number;
  /**
   * What happens to the building's *street* doors while the crowd is filing in.
   *
   * Reported as its own row because it is what was reported twice — *"a lot are
   * shutting the door on those trying to get in"* — and it is a different
   * failure from the pathing one. Two thirds of the city rolls `closesDoors`
   * and nearly half rolls `guardsDoors`, so without a rule the first person in
   * shuts it on the eleven behind them and the first person to settle bolts it.
   */
  shuts: number;
  locks: number;
  openTicks: number;
  doorTicks: number;
}
const zero = (): Out => ({
  sent: 0,
  inside: 0,
  settled: 0,
  insideTicks: 0,
  pressedTicks: 0,
  totalTicks: 0,
  shuts: 0,
  locks: 0,
  openTicks: 0,
  doorTicks: 0,
});

interface Staged {
  room: number;
  building: number;
  target: { x: number; y: number };
  crowd: Array<{ e: Entity; state: AiState }>;
  routes: number;
  routesFound: number;
}

/**
 * A crowd out in the street, and the deepest room the city has to send them
 * into. The aim point is a spot genuinely on that room's floor, which is the
 * friendliest possible version of what a player does with a mouse — a click is
 * at least as likely to land on a wall slab.
 */
function stage(world: World): Staged | null {
  const now = Date.now();
  const rooms = world.rooms.rooms
    .filter((r) => Number.isFinite(r.depth) && r.size > 14)
    .sort((a, b) => b.depth - a.depth || b.size - a.size);
  const room = rooms[0];
  if (!room) return null;

  const target = world.rooms.randomPoint(room.id) ?? { x: room.x, y: room.y };
  const crowd: Array<{ e: Entity; state: AiState }> = [];
  let routes = 0;
  let routesFound = 0;

  for (let attempt = 0; attempt < 6000 && crowd.length < CROWD; attempt++) {
    const a = Math.random() * Math.PI * 2;
    const r = 200 + Math.random() * (RALLY_RADIUS - 260);
    const x = target.x + Math.cos(a) * r;
    const y = target.y + Math.sin(a) * r;
    if (world.nav.isBlocked(x, y) || !world.nav.isReachable(x, y)) continue;
    if (buildingIndexAt(world, x, y) >= 0) continue; // out in the street
    crowd.push({
      e: makeEntity(`civ-${crowd.length}`, 'human', x, y),
      state: newAiState(now, x, y),
    });
    // What the old behaviour actually asks the router for: one route from the
    // street to a room several partitions in. This is the cause, measured, and
    // it is the same number for both sides because it is the same city.
    routes++;
    if (world.nav.findPath(x, y, target.x, target.y, PATH_MAX_NODES)) routesFound++;
  }
  if (crowd.length === 0) return null;
  return { room: room.id, building: room.building, target, crowd, routes, routesFound };
}

function run(world: World, staged: Staged, doorsAtStart: string, old: boolean, out: Out): void {
  setRallyIgnoresBuildings(old);
  let now = Date.now();

  // The same city, the same doors, the same people with the same traits.
  world.entities.clear();
  world.ai.clear();
  world.speech.clear();
  world.ralliedInto.clear();
  world.doorAlerts.clear();
  world.doorPleas.clear();
  world.doors = JSON.parse(doorsAtStart);
  for (const { e, state } of staged.crowd) {
    world.entities.set(e.id, structuredClone(e));
    world.ai.set(e.id, structuredClone(state));
  }

  rebuildEntityGrid(world);
  rallyHumans(world, staged.target.x, staged.target.y, staged.target.x, staged.target.y);

  const bb = world.map.buildings[staged.building];
  // Its ways in from the street. Interior partitions are left out: shutting one
  // of those is ordinary behaviour and is nobody's way in.
  const ways = (bb.doors ?? []).filter((i) => !world.map.doors[i].interior && world.doors[i]);
  const wasOpen = new Map<number, boolean>();
  const wasLocked = new Map<number, boolean>();
  for (const i of ways) {
    wasOpen.set(i, !!world.doors[i]?.open);
    wasLocked.set(i, !!world.doors[i]?.locked);
  }

  for (let t = 0; t < TICKS; t++) {
    now += TICK_MS;
    tick(world, now, TICK_MS / 1000);
    // **Only while the order could still be being obeyed.** The hold lasts
    // `RALLY_ROOM_GIVE_UP_MS` and the run is half again as long, so counting the
    // whole window folds in the perfectly correct shuts that happen once the
    // order is over and everybody has settled — measured that way NEW read 22
    // shuts and 3 bolts, every one of them after the hold had lapsed.
    const ordersLive = t * TICK_MS < RALLY_ROOM_GIVE_UP_MS;
    for (const i of ways) {
      const d = world.doors[i];
      if (!d) continue;
      if (ordersLive) {
        if (!d.open && wasOpen.get(i)) out.shuts++;
        if (d.locked && !wasLocked.get(i)) out.locks++;
        out.doorTicks++;
        if (d.open) out.openTicks++;
      }
      wasOpen.set(i, d.open);
      wasLocked.set(i, d.locked);
    }
    for (const { e: proto } of staged.crowd) {
      const e = world.entities.get(proto.id);
      if (!e) continue;
      out.totalTicks++;
      if (buildingIndexAt(world, e.x, e.y) === staged.building) {
        out.insideTicks++;
        continue;
      }
      const dx = Math.max(bb.x - e.x, 0, e.x - (bb.x + bb.w));
      const dy = Math.max(bb.y - e.y, 0, e.y - (bb.y + bb.h));
      if (Math.hypot(dx, dy) < PRESSED_PX) out.pressedTicks++;
    }
  }

  out.sent += staged.crowd.length;
  for (const { e: proto } of staged.crowd) {
    const e = world.entities.get(proto.id);
    const st = world.ai.get(proto.id);
    if (!e || !st) continue;
    if (buildingIndexAt(world, e.x, e.y) !== staged.building) continue;
    out.inside++;
    // Holed up in there rather than merely standing in it — which is the half
    // of the order that says "and stay in there".
    if (st.mode === 'settled' && st.settleRoom !== OUTSIDE) out.settled++;
  }
  setRallyIgnoresBuildings(false);
}

const share = (a: number, b: number): string => `${((100 * a) / Math.max(1, b)).toFixed(1)}%`;

const oldOut = zero();
const newOut = zero();
let cities = 0;
let routes = 0;
let routesFound = 0;
const depths: number[] = [];

for (let c = 0; c < CITIES; c++) {
  const world = bareWorld();
  const staged = stage(world);
  if (!staged) continue;
  const doorsAtStart = JSON.stringify(world.doors);
  cities++;
  routes += staged.routes;
  routesFound += staged.routesFound;
  depths.push(world.rooms.rooms[staged.room].depth);
  // Alternated so a busy interval on this box hits both.
  if (c % 2 === 0) {
    run(world, staged, doorsAtStart, true, oldOut);
    run(world, staged, doorsAtStart, false, newOut);
  } else {
    run(world, staged, doorsAtStart, false, newOut);
    run(world, staged, doorsAtStart, true, oldOut);
  }
}

console.log(
  `\n--- ${CROWD} civilians shouted into the deepest room of a city, ` +
    `${(TICKS / TICK_RATE) | 0}s, ${cities} cities, both behaviours on each ---`,
);
console.log(`room depths staged: ${depths.sort((a, b) => a - b).join(', ')}`);
console.log(
  `one A* route from the street to that room, found: ${routesFound}/${routes} ` +
    `(${share(routesFound, routes)}) — the cause, and the same city for both sides`,
);
const row = (label: string, a: string, b: string): void =>
  console.log(`${label.padEnd(34)} ${a.padStart(14)} ${b.padStart(14)}`);
console.log('');
row('', 'OLD', 'NEW');
row('ended up inside the building', `${oldOut.inside}/${oldOut.sent}`, `${newOut.inside}/${newOut.sent}`);
row('…and holed up in it', `${oldOut.settled}/${oldOut.sent}`, `${newOut.settled}/${newOut.sent}`);
row(
  'ticks spent inside it',
  share(oldOut.insideTicks, oldOut.totalTicks),
  share(newOut.insideTicks, newOut.totalTicks),
);
row(
  'ticks pressed on its outside wall',
  share(oldOut.pressedTicks, oldOut.totalTicks),
  share(newOut.pressedTicks, newOut.totalTicks),
);
console.log('');
row('its street doors shut on the queue', `${oldOut.shuts}`, `${newOut.shuts}`);
row('…and bolted on it', `${oldOut.locks}`, `${newOut.locks}`);
row(
  'share of the round they stood open',
  share(oldOut.openTicks, oldOut.doorTicks),
  share(newOut.openTicks, newOut.doorTicks),
);
