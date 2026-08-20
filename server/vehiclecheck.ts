/**
 * Headless check on the vehicles a radio call sends: where they end up, what
 * they drove through to get there, and whether anybody can walk past one.
 *
 * No socket, no port, so it leaves a game on 8080 alone. The clock advances a
 * tick's worth per tick, and the path budget is the *node* budget the real
 * server uses — `PATH_BUDGET_PER_TICK` is 10 and would cap every A* search at
 * ten expansions, which finds nothing at all.
 *
 *   npx tsx vehiclecheck.ts
 *   CITIES=8 npx tsx vehiclecheck.ts
 */
import {
  createWorld,
  resetWorld,
  rebuildNav,
  rebuildEntityGrid,
  resolveCollisions,
  buildingIndexAt,
  makeEntity,
  newAiState,
  type World,
  type Entity,
} from './src/world.js';
import { computeFrozen, updateAi } from './src/ai.js';
import { callBackup, updateBackup, resolveVehicleCollisions, vehicleBox } from './src/backup.js';
import { closestOnBox } from './src/geometry.js';
import {
  TICK_RATE,
  PATH_NODE_BUDGET_PER_TICK,
  VAN_LENGTH,
  VAN_WIDTH,
  CAR_LENGTH,
  CAR_WIDTH,
  ENTITY_RADIUS,
  BOUNDARY_THICKNESS,
} from '../shared/constants.js';

const TICK_MS = 1000 / TICK_RATE;
const CITIES = Number(process.env.CITIES ?? 8);
const CALLS_PER_CITY = Number(process.env.CALLS ?? 8);

/** Share of open ground that is part of the map's main walkable region. */
function walkableShare(world: World): number {
  let open = 0;
  let reachable = 0;
  for (let x = 40; x < world.map.width - 40; x += 28) {
    for (let y = 40; y < world.map.height - 40; y += 28) {
      if (world.nav.isBlocked(x, y)) continue;
      open++;
      if (world.nav.isReachable(x, y)) reachable++;
    }
  }
  return open === 0 ? 1 : reachable / open;
}

/** Anywhere on the map somebody could actually be standing with a handset. */
function somewhereWalkable(world: World): { x: number; y: number } {
  for (let i = 0; i < 400; i++) {
    const x = 80 + Math.random() * (world.map.width - 160);
    const y = 80 + Math.random() * (world.map.height - 160);
    if (world.nav.isBlocked(x, y) || !world.nav.isReachable(x, y)) continue;
    return { x, y };
  }
  return { x: world.map.width / 2, y: world.map.height / 2 };
}

function med(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = xs.slice().sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

function tick(world: World, now: number, dt: number): void {
  world.pathBudget = PATH_NODE_BUDGET_PER_TICK;
  if (world.navDirty) rebuildNav(world);
  rebuildEntityGrid(world);
  updateAi(world, now, dt, computeFrozen(world));
  resolveCollisions(world);
  resolveVehicleCollisions(world);
  updateBackup(world, now, dt);
}

/** A bare world: nothing alive but what the rig puts in it. */
function bareWorld(): World {
  const world = createWorld();
  resetWorld(world);
  for (const id of [...world.entities.keys()]) {
    world.entities.delete(id);
    world.ai.delete(id);
  }
  world.playerIds.clear();
  world.bots.clear();
  return world;
}

/** Does the body, where it now stands, overlap a building or blocked ground? */
function bodyClash(world: World, x: number, y: number, facing: number, kind: 'van' | 'car'): number {
  const length = kind === 'van' ? VAN_LENGTH : CAR_LENGTH;
  const width = kind === 'van' ? VAN_WIDTH : CAR_WIDTH;
  const cos = Math.cos(facing);
  const sin = Math.sin(facing);
  let worst = 0;
  for (const along of [-0.5, -0.25, 0, 0.25, 0.5]) {
    for (const across of [-0.5, -0.25, 0, 0.25, 0.5]) {
      const px = x + cos * along * length - sin * across * width;
      const py = y + sin * along * length + cos * across * width;
      if (buildingIndexAt(world, px, py) >= 0) worst++;
      else if (world.nav.isBlocked(px, py)) worst++;
    }
  }
  return worst;
}

// ------------------------------------------------------- where they end up

console.log(`vehiclecheck — ${CITIES} cities\n`);
console.log('--- arriving: does the body ever end up in geometry? ---');
{
  let parked = 0;
  let clashedAtRest = 0;
  let clashedEnRoute = 0;
  let worstEnRoute = 0;
  let never = 0;
  let vans = 0;
  let drifted = 0;
  let pinched = 0;
  const runIn: number[] = [];
  const lost: number[] = [];

  for (let c = 0; c < CITIES; c++) {
    const world = bareWorld();
    // Callers spread over the whole map, not one in the middle. The centre is
    // the easy case — every edge is far off and the nearest one is wide open —
    // and it reports 0 through-geometry however the fallbacks behave.
    for (let call = 0; call < CALLS_PER_CITY; call++) {
      const kind: 'van' | 'car' = call % 2 === 0 ? 'van' : 'car';
      let clock = Date.now();
      // Both, and `navDirty` with them: a parked body lives in `navBlockers`
      // as well as in `vehicles`, and clearing only the one leaves the nav grid
      // holding a van that is no longer there. Measured with the stale boxes
      // left in, this rig reported 5/80 parked in geometry — all of it the
      // ghosts of earlier calls.
      world.vehicles.clear();
      world.navBlockers.length = 0;
      world.navDirty = true;
      rebuildNav(world);
      const spot = somewhereWalkable(world);
      const caller = makeEntity('caller', 'officer', spot.x, spot.y);
      world.entities.set('caller', caller);
      world.ai.set('caller', newAiState(clock, caller.x, caller.y));
      callBackup(world, caller, clock, kind);

      const vehicle = [...world.vehicles.values()][0];
      if (!vehicle) continue;
      if (kind === 'van') {
        vans++;
        // Did it keep its skid? `slideFits` can refuse the drift outright, and
        // a van that always arrives dead straight is the old behaviour back.
        if (vehicle.drift > 0) drifted++;
      }
      // How much of the walkable map is reachable before it lands.
      const reachBefore = walkableShare(world);
      let enRoute = 0;
      let ticks = 0;
      for (let i = 0; i < 2400; i++) {
        clock += TICK_MS;
        tick(world, clock, TICK_MS / 1000);
        ticks++;
        // Only once the whole body is past the cordon. The perimeter wall is
        // in the wall grid and the vehicle is *meant* to come through it — the
        // cordon is not what it has to miss — so counting from the map edge
        // reports 16/16 driving through geometry whatever the code does.
        const edge = Math.min(vehicle.x, vehicle.y, world.map.width - vehicle.x, world.map.height - vehicle.y);
        if (edge > BOUNDARY_THICKNESS + VAN_LENGTH) {
          enRoute = Math.max(enRoute, bodyClash(world, vehicle.x, vehicle.y, vehicle.facing, kind));
        }
        if (vehicle.phase === 'parked') break;
      }
      if (vehicle.phase !== 'parked') {
        never++;
        continue;
      }
      parked++;
      runIn.push((ticks * TICK_MS) / 1000);
      // Where it came to rest, judged *before* the nav grid is told about it —
      // its own box is in `navBlockers` the moment it parks, so a rebuild
      // first has `nav.isBlocked` true across its own footprint and every
      // single arrival reads as parked in geometry.
      const rest = bodyClash(world, vehicle.x, vehicle.y, vehicle.facing, kind);
      if (rest > 0) clashedAtRest++;

      // A body in the nav grid could in principle pinch a street shut and
      // strand part of the city behind it. Rebuild and compare.
      rebuildNav(world);
      const reachAfter = walkableShare(world);
      if (reachAfter < reachBefore - 0.005) pinched++;
      lost.push(reachBefore - reachAfter);
      if (enRoute > 0) clashedEnRoute++;
      worstEnRoute = Math.max(worstEnRoute, enRoute);
      for (const id of [...world.entities.keys()]) {
        if (id === 'caller') continue;
        world.entities.delete(id);
        world.ai.delete(id);
      }
      world.entities.delete('caller');
      world.ai.delete('caller');
      world.dispatched.clear();
    }
  }
  console.log(
    `  ${parked} arrived (${never} never did), median run in ${med(runIn).toFixed(1)}s\n` +
      `  parked with the body in geometry: ${clashedAtRest}/${parked}\n` +
      `  drove through geometry on the way: ${clashedEnRoute}/${parked} (worst ${worstEnRoute} of 25 sample points)\n` +
      `  vans that kept their skid: ${drifted}/${vans}\n` +
      `  parked somewhere that cut the map: ${pinched}/${parked} (worst loss ${(100 * Math.max(0, ...lost)).toFixed(2)}% of walkable ground)`,
  );
}

// ------------------------------------------------------- getting past one

console.log('\n--- an officer with somewhere to be on the far side of a parked vehicle ---');
{
  let arrived = 0;
  let trials = 0;
  const times: number[] = [];
  const bumps: number[] = [];

  for (let c = 0; c < CITIES; c++) {
    const world = bareWorld();
    let clock = Date.now();
    const caller = makeEntity('caller', 'officer', world.map.width * 0.5, world.map.height * 0.5);
    world.entities.set('caller', caller);
    world.ai.set('caller', newAiState(clock, caller.x, caller.y));
    callBackup(world, caller, clock, 'van');
    const vehicle = [...world.vehicles.values()][0];
    if (!vehicle) continue;
    for (let i = 0; i < 2400 && vehicle.phase !== 'parked'; i++) {
      clock += TICK_MS;
      tick(world, clock, TICK_MS / 1000);
    }
    if (vehicle.phase !== 'parked') continue;
    world.entities.delete('caller');
    world.ai.delete('caller');

    // Stand him one side of it and send him to the other, straight through.
    // Several bearings tried, because one happening to point at a wall is not
    // a reason to give the city up.
    const open = (p: { x: number; y: number }): boolean =>
      buildingIndexAt(world, p.x, p.y) < 0 && !world.nav.isBlocked(p.x, p.y) && world.nav.isReachable(p.x, p.y);
    const reach = VAN_WIDTH / 2 + 70;
    let from: { x: number; y: number } | null = null;
    let to: { x: number; y: number } | null = null;
    for (const swing of [0, 0.5, -0.5, 1.0, -1.0]) {
      const across = vehicle.facing + Math.PI / 2 + swing;
      const a = { x: vehicle.x + Math.cos(across) * reach, y: vehicle.y + Math.sin(across) * reach };
      const b = { x: vehicle.x - Math.cos(across) * reach, y: vehicle.y - Math.sin(across) * reach };
      if (!open(a) || !open(b)) continue;
      from = a;
      to = b;
      break;
    }
    if (!from || !to) continue;

    const id = 'walker';
    const e: Entity = makeEntity(id, 'officer', from.x, from.y);
    world.entities.set(id, e);
    const state = newAiState(clock, e.x, e.y);
    world.ai.set(id, state);
    // A grey officer with a post on the far side: `guardX`/`guardY` is the one
    // errand that holds a destination without any fighting or looting on top.
    state.guardX = to.x;
    state.guardY = to.y;
    state.guardRadius = 26;
    trials++;

    let got = -1;
    let touching = 0;
    for (let i = 0; i < 1800; i++) {
      clock += TICK_MS;
      tick(world, clock, TICK_MS / 1000);
      const box = vehicleBox(vehicle);
      const near = closestOnBox(box, e.x, e.y);
      if (near.dist <= ENTITY_RADIUS.officer + 2) touching++;
      if (Math.hypot(e.x - to.x, e.y - to.y) < 40) {
        got = i;
        break;
      }
    }
    if (got >= 0) {
      arrived++;
      times.push((got * TICK_MS) / 1000);
    }
    bumps.push((100 * touching) / 1800);
  }
  console.log(
    `  reached the far side: ${arrived}/${trials}` +
      (times.length ? `, median ${med(times).toFixed(1)}s` : '') +
      `\n  ticks spent pressed against the body: median ${med(bumps).toFixed(1)}%`,
  );
}
