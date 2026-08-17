/**
 * Headless tick profiler. Runs the same tick order as `index.ts` with a player
 * officer attached, and attributes the cost phase by phase.
 *
 * Several cities in ONE process, because the map is not seeded and how far the
 * outbreak got dominates everything — a single run is not evidence. JIT warms
 * up once and every city after the first is measured warm.
 *
 *   npx tsx tickprof.ts            # 3 cities, 400 ticks each
 *   CITIES=5 TICKS=900 npx tsx tickprof.ts
 */
import {
  createWorld,
  resetWorld,
  rebuildNav,
  rebuildEntityGrid,
  resolveCollisions,
  countSurvivors,
  countZombies,
  hasLineOfSight,
  makeEntity,
  findSpawn,
  toWire,
  type World,
  type Entity,
} from './src/world.js';
import { humanPositions } from './src/world.js';
import { computeFrozen, updateAi } from './src/ai.js';
import { dogHudFor, updateDogs } from './src/dog.js';
import { doorsToWire } from './src/doors.js';
import { doorPromptFor } from './src/doorplayer.js';
import { toWireInventory } from './src/inventory.js';
import { ducksToWire } from './src/ducks.js';
import { emplacementsToWire } from './src/emplacement.js';
import { vehiclesToWire } from './src/backup.js';
import { minesToWire } from './src/mines.js';
import { firesToWire } from './src/fire.js';
import { grenadesToWire, smokesToWire, helicoptersToWire } from './src/heli.js';
import { processShooting } from './src/combat.js';
import { updateDucks } from './src/ducks.js';
import { updateFires } from './src/fire.js';
import { updateMines } from './src/mines.js';
import { updateBackup, resolveVehicleCollisions } from './src/backup.js';
import { updateAirSupport } from './src/heli.js';
import { updateEmplacements, resolveEmplacementCollisions } from './src/emplacement.js';
import { newInventory } from './src/inventory.js';
import {
  TICK_RATE,
  ENTITY_RADIUS,
  PATH_BUDGET_PER_TICK,
  STAMINA_MAX,
  PLAYER_SIGHT_RADIUS,
} from '../shared/constants.js';

const TICK_MS = 1000 / TICK_RATE;
const TICKS = Number(process.env.TICKS ?? 400);
const CITIES = Number(process.env.CITIES ?? 3);
const PID = 'prof-player';
/** AB=1 alternates the old threat-perception behaviour back in. */
const AB = process.env.AB === '1';
const AB_BLOCK = 50;
let oldMode = false;

function stat(xs: number[]): { med: number; p90: number } {
  const s = xs.slice().sort((a, b) => a - b);
  return { med: s[Math.floor(s.length / 2)] ?? 0, p90: s[Math.floor(s.length * 0.9)] ?? 0 };
}

/** Exactly what index.ts does per player socket; a spectator does none of it. */
function visibleTo(world: World, viewer: Entity, now: number): unknown[] {
  const out: unknown[] = [];
  for (const other of world.entities.values()) {
    if (other.id === viewer.id) {
      out.push(toWire(world, other, false, now));
      continue;
    }
    const dist = Math.hypot(other.x - viewer.x, other.y - viewer.y);
    if (dist <= PLAYER_SIGHT_RADIUS && hasLineOfSight(world, viewer.x, viewer.y, other.x, other.y)) {
      out.push(toWire(world, other, false, now));
    }
  }
  return out;
}

function visiblePickups(world: World, viewer: Entity): unknown[] {
  const out: unknown[] = [];
  for (const p of world.pickups.values()) {
    if (Math.hypot(p.x - viewer.x, p.y - viewer.y) > PLAYER_SIGHT_RADIUS) continue;
    if (!hasLineOfSight(world, viewer.x, viewer.y, p.x, p.y)) continue;
    out.push(p);
  }
  return out;
}

interface CityResult {
  total: { med: number; p90: number };
  phases: Array<{ label: string; med: number; p90: number }>;
  entities: number;
  survivors: number;
  zombies: number;
}

function profileCity(): CityResult {
  const world = createWorld();
  resetWorld(world);

  const spawn = findSpawn(world, ENTITY_RADIUS.officer);
  world.entities.set(PID, makeEntity(PID, 'officer', spawn.x, spawn.y));
  world.playerIds.add(PID);
  world.commands.set(PID, {
    input: { up: false, down: false, left: false, right: false },
    aim: 0,
    aimX: 0,
    aimY: 0,
    shooting: false,
    sprint: false,
    interact: false,
    rightDown: false,
  });
  world.inventories.set(PID, newInventory());
  world.stamina.set(PID, STAMINA_MAX);

  const acc: Record<string, number[]> = {};
  const phase = (label: string, fn: () => void): void => {
    const t0 = performance.now();
    fn();
    (acc[label] ??= []).push(performance.now() - t0);
  };

  const total: number[] = [];
  /**
   * A clock that advances a tick's worth per tick, rather than `Date.now()`.
   *
   * Running ticks back to back means wall time barely moves, so every piece of
   * time-gated work — perception at 10Hz staggered per entity, the danger
   * rebuild, re-picking a wander target — is skipped almost every tick and the
   * AI measures as nearly free. That is what had this harness reporting 1.7ms
   * against a real server's 19.7ms on the same population.
   */
  let clock = Date.now();
  for (let i = 0; i < TICKS; i++) {
    const t0 = performance.now();
    const dt = TICK_MS / 1000;
    clock += TICK_MS;
    const now = clock;
    world.pathBudget = PATH_BUDGET_PER_TICK;

    if (world.navDirty) phase('rebuildNav', () => rebuildNav(world));
    phase('entityGrid', () => rebuildEntityGrid(world));

    /**
     * Put the old behaviour back, to prove the new one.
     *
     * `senseThreats` reads `world.zombieGrid`; filling it with *everybody* is
     * exactly what it used to do when it read `world.entityGrid`, with the
     * queried code path byte-identical. Mode alternates every `AB_BLOCK` ticks
     * on the same evolving world, so map and outbreak state are controlled for.
     * This fill sits outside the `updateAi` phase, which is what is compared.
     */
    if (AB) {
      oldMode = Math.floor(i / AB_BLOCK) % 2 === 1;
      if (oldMode) {
        world.zombieGrid.clear();
        for (const e of world.entities.values()) {
          world.zombieGrid.insertRect(e, e.x - e.radius, e.y - e.radius, e.x + e.radius, e.y + e.radius);
        }
      }
    }
    let frozen = new Set<string>();
    phase('computeFrozen', () => {
      frozen = computeFrozen(world);
    });
    phase('updateDogs', () => updateDogs(world, dt, now));
    phase(AB ? (oldMode ? 'updateAi [OLD]' : 'updateAi [NEW]') : 'updateAi', () =>
      updateAi(world, now, dt, frozen),
    );
    phase('collisions', () => resolveCollisions(world));
    phase('emplacementCollisions', () => resolveEmplacementCollisions(world));
    phase('vehicleCollisions', () => resolveVehicleCollisions(world));
    phase('entityGrid2', () => rebuildEntityGrid(world));
    phase('updateEmplacements', () => updateEmplacements(world, now, dt));
    phase('processShooting', () => processShooting(world, now, frozen));
    phase('airSupport', () => updateAirSupport(world, now, dt));
    phase('backup', () => updateBackup(world, now, dt));
    phase('mines', () => updateMines(world, now));
    phase('ducks', () => updateDucks(world, now, dt));
    phase('fires', () => updateFires(world, now, dt));
    phase('countSurvivors', () => {
      countSurvivors(world);
    });
    phase('toWire-all (spectator)', () => {
      const all: unknown[] = [];
      for (const e of world.entities.values()) all.push(toWire(world, e, true, now));
    });
    const viewer = world.entities.get(PID)!;
    phase('visibleTo (per player)', () => {
      visibleTo(world, viewer, now);
    });
    phase('visiblePickups (per player)', () => {
      visiblePickups(world, viewer);
    });

    // The rest of the per-socket snapshot, and then the stringify — which the
    // real server pays once per client and which nothing above accounts for.
    let msg: unknown = null;
    phase('build snapshot', () => {
      msg = {
        type: 'state',
        entities: visibleTo(world, viewer, now),
        shots: [],
        brokenWindows: world.brokenWindows,
        doors: doorsToWire(world, viewer.x, viewer.y, PLAYER_SIGHT_RADIUS + 220),
        doorPrompt: doorPromptFor(world, PID),
        speech: [],
        rallyCharges: 0,
        followCharges: 0,
        following: false,
        pickups: visiblePickups(world, viewer),
        inventory: toWireInventory(
          world,
          PID,
          world.inventories.get(PID) ?? newInventory(),
          viewer.x,
          viewer.y,
          now,
        ),
        dog: dogHudFor(world, PID, now),
        grenades: grenadesToWire(world, now),
        smokes: smokesToWire(world, now),
        blasts: [],
        ducks: ducksToWire(world),
        emplacements: emplacementsToWire(world),
        vehicles: vehiclesToWire(world),
        mines: minesToWire(world, now),
        corpses: world.corpses,
        towers: world.towers,
        zaps: world.zaps,
        fires: firesToWire(world, now),
        helicopters: helicoptersToWire(world, now),
        spectating: false,
        gameOver: false,
        victory: false,
        survivors: 0,
        infected: 0,
        zombies: 0,
        stamina: 100,
        exhausted: false,
        tickMs: 0,
        beacons: humanPositions(world).slice(0, 0),
      };
    });
    phase('JSON.stringify', () => {
      JSON.stringify(msg);
    });

    total.push(performance.now() - t0);
  }

  const warm = Math.min(50, Math.floor(TICKS / 4));
  return {
    total: stat(total.slice(warm)),
    phases: Object.entries(acc)
      .map(([label, xs]) => ({ label, ...stat(xs.slice(warm)) }))
      .sort((a, b) => b.med - a.med),
    entities: world.entities.size,
    survivors: countSurvivors(world),
    zombies: countZombies(world),
  };
}

console.log(`${CITIES} cities · ${TICKS} ticks each · budget ${TICK_MS.toFixed(1)}ms`);
const results: CityResult[] = [];
for (let c = 0; c < CITIES; c++) {
  const r = profileCity();
  results.push(r);
  console.log(
    `\n── city ${c + 1}: ${r.entities} entities · ${r.survivors} survivors · ${r.zombies} zombies`,
  );
  console.log(`   TOTAL tick  median ${r.total.med.toFixed(2)}ms  p90 ${r.total.p90.toFixed(2)}ms`);
  for (const p of r.phases) {
    if (p.med < 0.05 && p.p90 < 0.2) continue;
    console.log(`     ${p.label.padEnd(28)} median ${p.med.toFixed(2)}  p90 ${p.p90.toFixed(2)}`);
  }
}

// The first city pays for JIT; quote the rest.
if (results.length > 1) {
  const warm = results.slice(1);
  console.log(`\n── across cities 2..${results.length} (warm)`);
  console.log(
    `   TOTAL median ${warm.map((r) => r.total.med.toFixed(1)).join(' / ')}  ` +
      `zombies ${warm.map((r) => r.zombies).join(' / ')}`,
  );
  for (const label of ['updateAi', 'collisions', 'visibleTo (per player)', 'toWire-all (spectator)']) {
    const vals = warm.map((r) => r.phases.find((p) => p.label === label)?.med ?? 0);
    console.log(`   ${label.padEnd(28)} ${vals.map((v) => v.toFixed(2)).join(' / ')}`);
  }
}
