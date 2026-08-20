/**
 * Headless check on what people do once they have holed up.
 *
 * No socket, no port, so it leaves a game on 8080 alone. Two halves, and the
 * staged one is the one that means anything: a live city tells you what
 * happens on average, and a rig tells you whether the behaviour actually
 * discriminates. Both run in ONE process so the JIT is warm for every city
 * after the first, and the clock advances a tick's worth per tick — anything
 * measured without that is measuring an AI that is mostly not running.
 *
 * The tick-cost half **alternates the old behaviour in and out every
 * `AB_BLOCK` ticks on the same evolving world**, because two `npx tsx` runs on
 * this box are not comparable and the map is not seeded either.
 *
 *   npx tsx settlecheck.ts
 *   CITIES=3 TICKS=5400 npx tsx settlecheck.ts
 */
import {
  createWorld,
  resetWorld,
  rebuildNav,
  rebuildEntityGrid,
  resolveCollisions,
  newAiState,
  makeEntity,
  countZombies,
  type World,
  type Entity,
  type AiState,
} from './src/world.js';
import { computeFrozen, updateAi, setSettledStandsStill } from './src/ai.js';
import { OUTSIDE } from './src/rooms.js';
import { initDoors, openDoor, shutDoor, unlockDoor, lockDoor } from './src/doors.js';
import { TICK_RATE, PATH_NODE_BUDGET_PER_TICK } from '../shared/constants.js';

const TICK_MS = 1000 / TICK_RATE;
const CITIES = Number(process.env.CITIES ?? 3);
const TICKS = Number(process.env.TICKS ?? 5400); // 180s
const AB_BLOCK = 50;
/**
 * A pacing civilian covers 0.99px in a tick (35px/s x 0.85 x 33.3ms), so a
 * "did they move" threshold of 1px reports every single moving tick as
 * motionless. Measured with that threshold the pacing read 90% still; it is
 * not, and the threshold was the whole of the difference.
 */
const STILL_PX = 0.2;

function med(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = xs.slice().sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}
function pct(xs: number[], p: number): number {
  if (xs.length === 0) return 0;
  const s = xs.slice().sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * p))];
}
const f1 = (n: number): string => n.toFixed(1);
const share = (a: number, b: number): string => `${((100 * a) / Math.max(1, b)).toFixed(1)}%`;

function tick(world: World, now: number, dt: number): number {
  world.pathBudget = PATH_NODE_BUDGET_PER_TICK;
  if (world.navDirty) rebuildNav(world);
  rebuildEntityGrid(world);
  const frozen = computeFrozen(world);
  const t0 = performance.now();
  updateAi(world, now, dt, frozen);
  const cost = performance.now() - t0;
  resolveCollisions(world);
  return cost;
}

// ------------------------------------------------------------ live cities

interface Live {
  pace: number[];
  reach: number[];
  inRoom: number;
  outOfRoom: number;
  stillTicks: number;
  settledTicks: number;
  reshut: number;
  rebolted: number;
  /** Deeper-hiders who settled somewhere that HAD a back to it, and used it. */
  couldGoDeeper: number;
  didGoDeeper: number;
  deepGain: number[];
  costNew: number[];
  costOld: number[];
  settledPeak: number;
  zombies: number;
}

function liveCity(): Live {
  const world = createWorld();
  resetWorld(world);

  const out: Live = {
    pace: [], reach: [], inRoom: 0, outOfRoom: 0, stillTicks: 0, settledTicks: 0,
    reshut: 0, rebolted: 0, couldGoDeeper: 0, didGoDeeper: 0, deepGain: [],
    costNew: [], costOld: [], settledPeak: 0, zombies: 0,
  };

  interface Spell {
    x: number; y: number; lastX: number; lastY: number;
    dist: number; ticks: number; reach: number;
    /** Depth of the room they settled in, or -1 if this is not a hider's spell. */
    depth: number;
    /** Was there anywhere deeper in that building at all? */
    hadDeeper: boolean;
  }
  const spells = new Map<string, Spell>();
  const doorWas = world.doors.map((d) => (d ? { open: d.open, locked: d.locked } : null));

  const closeSpell = (id: string, spell: Spell): void => {
    if (spell.ticks <= 30) return;
    out.pace.push((spell.dist / (spell.ticks * TICK_MS)) * 1000);
    out.reach.push(spell.reach);
    if (spell.depth < 0 || !spell.hadDeeper) return;
    out.couldGoDeeper++;
    const to = world.rooms.roomAt(spell.lastX, spell.lastY);
    if (to === OUTSIDE) return;
    const gain = world.rooms.rooms[to].depth - spell.depth;
    out.deepGain.push(gain);
    if (gain > 0) out.didGoDeeper++;
  };

  let clock = Date.now();
  for (let i = 0; i < TICKS; i++) {
    clock += TICK_MS;
    const oldBlock = Math.floor(i / AB_BLOCK) % 2 === 1;
    setSettledStandsStill(oldBlock);
    const cost = tick(world, clock, TICK_MS / 1000);
    (oldBlock ? out.costOld : out.costNew).push(cost);
    // Everything below describes the NEW behaviour only; the old blocks are
    // there to price the tick, not to be measured for movement.
    if (oldBlock) continue;

    let settledNow = 0;
    const roomsSatIn = new Set<number>();

    for (const [id, state] of world.ai) {
      const e = world.entities.get(id);
      if (!e || e.type !== 'human') {
        spells.delete(id);
        continue;
      }
      if (state.mode !== 'settled') {
        const spell = spells.get(id);
        if (spell) closeSpell(id, spell);
        spells.delete(id);
        continue;
      }

      settledNow++;
      out.settledTicks++;
      if (state.settleRoom !== OUTSIDE) {
        roomsSatIn.add(state.settleRoom);
        if (world.rooms.roomAt(e.x, e.y) === state.settleRoom) out.inRoom++;
        else out.outOfRoom++;
      }

      let spell = spells.get(id);
      if (!spell) {
        const room = world.rooms.roomAt(e.x, e.y);
        const hider = state.hidesDeeper && room !== OUTSIDE;
        spell = {
          x: e.x, y: e.y, lastX: e.x, lastY: e.y, dist: 0, ticks: 0, reach: 0,
          depth: hider ? world.rooms.rooms[room].depth : -1,
          hadDeeper:
            hider &&
            world.rooms
              .roomsOf(world.rooms.rooms[room].building)
              .some((rid) => world.rooms.rooms[rid].depth > world.rooms.rooms[room].depth),
        };
        spells.set(id, spell);
      }
      const moved = Math.hypot(e.x - spell.lastX, e.y - spell.lastY);
      spell.dist += moved;
      spell.ticks++;
      spell.lastX = e.x;
      spell.lastY = e.y;
      spell.reach = Math.max(spell.reach, Math.hypot(e.x - spell.x, e.y - spell.y));
      if (moved < STILL_PX) out.stillTicks++;
    }
    out.settledPeak = Math.max(out.settledPeak, settledNow);

    // Doors that came back under control while somebody was sitting in the
    // room. Attributed by the room being occupied by a settled person, which
    // is the claim being made.
    for (let d = 0; d < world.doors.length; d++) {
      const door = world.doors[d];
      const was = doorWas[d];
      if (!door || !was) continue;
      if (!door.broken) {
        const guarded = world.rooms.rooms.some((r) => roomsSatIn.has(r.id) && r.exits.includes(d));
        if (guarded) {
          if (was.open && !door.open) out.reshut++;
          if (!was.locked && door.locked) out.rebolted++;
        }
      }
      was.open = door.open;
      was.locked = door.locked;
    }
  }
  for (const [id, spell] of spells) closeSpell(id, spell);
  out.zombies = countZombies(world);
  setSettledStandsStill(false);
  return out;
}

// ------------------------------------------------------------ staged rigs

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

function planted(
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
  state.mode = 'wander';
  tweak(state);
  world.ai.set(id, state);
  return { e, state };
}

/** A room with a hung door on it, at the given depth, big enough to walk about in. */
function roomWithDoor(world: World, depth: number, minCells = 12): number {
  for (const room of world.rooms.rooms) {
    if (room.depth !== depth || room.size < minCells) continue;
    if (!room.exits.some((i) => world.doors[i])) continue;
    return room.id;
  }
  return -1;
}

function rigPacing(): void {
  console.log('\n--- staged: pacing the room you shut yourself into (60s, nothing else alive) ---');
  for (const old of [false, true]) {
    setSettledStandsStill(old);
    const dists: number[] = [];
    const reaches: number[] = [];
    const spots: number[] = [];
    let left = 0;
    let trials = 0;
    for (let city = 0; city < 5; city++) {
      const world = bareWorld();
      const roomId = roomWithDoor(world, 0, 20);
      if (roomId < 0) continue;
      const room = world.rooms.rooms[roomId];
      let clock = Date.now();

      const { e, state } = planted(world, 'pacer', room.x, room.y, clock, (s) => {
        s.hidesDeeper = false;
        s.guardsDoors = false;
      });
      // Straight into the reported state: holed up, door shut and bolted.
      state.mode = 'settled';
      state.settleRoom = roomId;
      state.wanderX = e.x;
      state.wanderY = e.y;
      for (const i of room.exits) {
        if (!world.doors[i]) continue;
        shutDoor(world, i, clock);
        lockDoor(world, i);
      }

      let dist = 0;
      let lastX = e.x;
      let lastY = e.y;
      const startX = e.x;
      const startY = e.y;
      let reach = 0;
      const cells = new Set<number>();
      trials++;
      for (let i = 0; i < 1800; i++) {
        clock += TICK_MS;
        tick(world, clock, TICK_MS / 1000);
        dist += Math.hypot(e.x - lastX, e.y - lastY);
        lastX = e.x;
        lastY = e.y;
        reach = Math.max(reach, Math.hypot(e.x - startX, e.y - startY));
        if (world.rooms.roomAt(e.x, e.y) !== roomId) left++;
        cells.add(Math.floor(e.x / 28) * 10000 + Math.floor(e.y / 28));
      }
      dists.push(dist);
      reaches.push(reach);
      spots.push(cells.size);
    }
    console.log(
      `  ${old ? 'OLD ' : 'NEW '}: over 60s, ${f1(med(dists))}px covered (${dists.map((d) => Math.round(d)).join('/')}), ` +
        `reach ${f1(med(reaches))}px, ${med(spots)} distinct spots, ` +
        `left the room ${left}/${trials * 1800} ticks`,
    );
  }
  setSettledStandsStill(false);
}

function rigDoorGuard(): void {
  console.log('\n--- staged: seeing to the doors of the room you are in ---');
  for (const guards of [true, false]) {
    let shutAgain = 0;
    let boltedAgain = 0;
    let trials = 0;
    const delays: number[] = [];

    for (let city = 0; city < 6; city++) {
      const world = bareWorld();
      const roomId = roomWithDoor(world, 0, 14);
      if (roomId < 0) continue;
      const room = world.rooms.rooms[roomId];
      const doorIndex = room.exits.find((i) => world.doors[i])!;
      let clock = Date.now();

      const { e, state } = planted(world, 'guard', room.x, room.y, clock, (s) => {
        s.guardsDoors = guards;
        s.hidesDeeper = false;
      });
      state.mode = 'settled';
      state.settleRoom = roomId;
      state.wanderX = e.x;
      state.wanderY = e.y;

      // Somebody has left it standing wide open.
      openDoor(world, doorIndex);
      unlockDoor(world, doorIndex);
      trials++;

      let at = -1;
      for (let i = 0; i < 900; i++) {
        clock += TICK_MS;
        tick(world, clock, TICK_MS / 1000);
        const door = world.doors[doorIndex]!;
        if (!door.open && at < 0) at = i;
        if (!door.open && door.locked) break;
      }
      const door = world.doors[doorIndex]!;
      if (!door.open) shutAgain++;
      if (door.locked) boltedAgain++;
      if (at >= 0) delays.push((at * TICK_MS) / 1000);
    }
    console.log(
      `  guardsDoors=${guards}: shut again ${shutAgain}/${trials}, bolted again ${boltedAgain}/${trials}` +
        (delays.length ? `, median ${med(delays).toFixed(1)}s` : ''),
    );
  }
}

function rigDeeper(): void {
  console.log('\n--- staged: holing up at the back of the building ---');
  for (const deeper of [true, false]) {
    const gains: number[] = [];
    let trials = 0;
    let moved = 0;
    let outside = 0;
    for (let city = 0; city < 8; city++) {
      const world = bareWorld();
      const shallow = world.rooms.rooms.find(
        (r) =>
          r.depth === 0 &&
          world.rooms.roomsOf(r.building).some((id) => world.rooms.rooms[id].depth >= 1),
      );
      if (!shallow) continue;
      let clock = Date.now();
      const { e, state } = planted(world, 'hider', shallow.x, shallow.y, clock, (s) => {
        s.hidesDeeper = deeper;
        s.guardsDoors = false;
      });
      trials++;
      // The moment they stop running is the moment this decision is taken.
      // Widened so TypeScript does not narrow it here: `updateAi` moves it on,
      // and the whole point of the loop below is to wait for it to.
      state.mode = 'seek' as AiState['mode'];
      state.settleTrait = 'building';
      for (let i = 0; i < 1500; i++) {
        clock += TICK_MS;
        tick(world, clock, TICK_MS / 1000);
        if (state.mode === 'settled' && state.settleGoalX === null) break;
      }
      const endRoom = world.rooms.roomAt(e.x, e.y);
      if (endRoom === OUTSIDE) {
        outside++;
        continue;
      }
      const gain = world.rooms.rooms[endRoom].depth - shallow.depth;
      gains.push(gain);
      if (gain > 0) moved++;
    }
    console.log(
      `  hidesDeeper=${deeper}: ${moved}/${trials} ended deeper in, ` +
        `median gain ${med(gains)} doorways, deepest ${Math.max(0, ...gains)}, ` +
        `ended up outside the building ${outside}/${trials}`,
    );
  }
}

function rigStaysPut(): void {
  console.log('\n--- staged: a holed-up civilian does not open the door ---');
  let opened = 0;
  let trials = 0;
  for (let city = 0; city < 6; city++) {
    const world = bareWorld();
    const roomId = roomWithDoor(world, 0, 14);
    if (roomId < 0) continue;
    const room = world.rooms.rooms[roomId];
    const doorIndex = room.exits.find((i) => world.doors[i])!;
    let clock = Date.now();
    const { state } = planted(world, 'stayer', room.x, room.y, clock, (s) => {
      s.hidesDeeper = false;
      s.guardsDoors = false;
      s.closesDoors = false;
    });
    state.mode = 'settled';
    state.settleRoom = roomId;
    state.wanderX = room.x;
    state.wanderY = room.y;
    shutDoor(world, doorIndex, clock);
    unlockDoor(world, doorIndex);
    trials++;
    for (let i = 0; i < 1800; i++) {
      clock += TICK_MS;
      tick(world, clock, TICK_MS / 1000);
      if (world.doors[doorIndex]!.open) {
        opened++;
        break;
      }
    }
  }
  console.log(`  shut, UNLOCKED door opened by somebody holed up: ${opened}/${trials}`);
}

// ------------------------------------------------------------ run

console.log(`settlecheck — ${CITIES} cities x ${TICKS} ticks, old/new alternating every ${AB_BLOCK}`);

const all: Live[] = [];
for (let c = 0; c < CITIES; c++) {
  const r = liveCity();
  all.push(r);
  console.log(
    `city ${c + 1}: ${r.pace.length} settled spells, peak settled ${r.settledPeak}, ${r.zombies} zombies at the end\n` +
      `  pace while settled   med ${f1(med(r.pace))} px/s   p90 ${f1(pct(r.pace, 0.9))}\n` +
      `  got as far as        med ${f1(med(r.reach))} px from where they settled, p90 ${f1(pct(r.reach, 0.9))}\n` +
      `  motionless ticks     ${share(r.stillTicks, r.settledTicks)}    in their own room ${share(r.inRoom, r.inRoom + r.outOfRoom)}\n` +
      `  doors re-shut ${r.reshut}, re-bolted ${r.rebolted}\n` +
      `  deeper-hiders with somewhere to go: ${r.didGoDeeper}/${r.couldGoDeeper} went, median gain ${med(r.deepGain)}\n` +
      `  updateAi  NEW med ${med(r.costNew).toFixed(2)} p90 ${pct(r.costNew, 0.9).toFixed(2)}   ` +
      `OLD med ${med(r.costOld).toFixed(2)} p90 ${pct(r.costOld, 0.9).toFixed(2)} ms`,
  );
}

const pace = all.flatMap((r) => r.pace);
console.log(
  `\nall cities: pace med ${f1(med(pace))} px/s, ` +
    `motionless ${share(all.reduce((n, r) => n + r.stillTicks, 0), all.reduce((n, r) => n + r.settledTicks, 0))}, ` +
    `in room ${share(all.reduce((n, r) => n + r.inRoom, 0), all.reduce((n, r) => n + r.inRoom + r.outOfRoom, 0))}, ` +
    `deeper ${all.reduce((n, r) => n + r.didGoDeeper, 0)}/${all.reduce((n, r) => n + r.couldGoDeeper, 0)}`,
);

rigPacing();
rigDoorGuard();
rigDeeper();
rigStaysPut();
