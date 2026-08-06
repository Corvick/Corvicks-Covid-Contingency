import type {
  Bush,
  EntityState,
  EntityType,
  InputState,
  MapData,
  PickupState,
  Shot,
  Wall,
} from '../../shared/types.js';
import type { Inventory } from './inventory.js';
import type { Grenade, Helicopter, Smoke } from './heli.js';
import {
  WORLD_WIDTH,
  WORLD_HEIGHT,
  ENTITY_RADIUS,
  ENTITY_MAX_HEALTH,
  HUMAN_COUNT,
  NPC_OFFICER_MIN,
  NPC_OFFICER_MAX,
  BUSH_SPEED_MULTIPLIER,
  PATH_BUDGET_PER_TICK,
  ZOMBIE_SPEED_MUL_MIN,
  ZOMBIE_SPEED_MUL_MAX,
  HUMAN_SPEED_MUL_MIN,
  HUMAN_SPEED_MUL_MAX,
  STAMINA_MAX,
  PLAYER_ONE_SPAWN_RANGE,
  WINDOW_HEALTH,
  INITIAL_ZOMBIES,
  MATERIALIZE_MS,
  BOUNDARY_THICKNESS,
  BUSH_HIDER_CHANCE,
  RALLY_STARTING_CHARGES,
  PLAYER_ONE_SPAWN_AT_CENTER,
  BOLT_FLEE_CHANCE,
  INDOOR_STAY_CHANCE,
  WITNESS_FOLLOW_CHANCE,
  WITNESS_INVESTIGATE_CHANCE,
  COUPLE_SHARE,
  SOCIAL_GROUP_SHARE,
  SOCIAL_GROUP_MIN,
  SOCIAL_GROUP_MAX,
  SOCIAL_CIRCLE_RADIUS,
  BUILDING_START_SHARE,
  RALLY_CHATTER_MIN_MS,
  RALLY_CHATTER_MAX_MS,
  INITIAL_ZOMBIE_SPREAD,
  ZOMBIE_POST_GRAPPLE_SLOW,
} from '../../shared/constants.js';
import { SpatialGrid } from './spatial.js';
import { clamp, resolveCircleRect, segmentCircleT, segmentRectT } from './geometry.js';
import { generateMap } from './mapgen.js';
import { newInventory, spawnPickups } from './inventory.js';
import { NavGrid, type Waypoint } from './navgrid.js';

export interface Entity extends EntityState {
  radius: number;
  maxHealth: number;
  /** Per-zombie variation so a horde doesn't move as one rigid blob. */
  speedMul: number;
}

/** What a fleeing human is doing once it has broken contact. */
export type HumanMode = 'wander' | 'flee' | 'retreat' | 'panic' | 'seek' | 'settled' | 'rallied';

/** Where a rattled human eventually tries to end up. */
export type SettleTrait = 'officer' | 'building' | 'bush' | 'group' | 'roam';

export interface AiState {
  heading: number;
  targetId: string | null;
  /** Cached flee direction, refreshed on the perception interval. */
  fleeX: number;
  fleeY: number;
  threatCount: number;
  /** Positions of visible zombies, cached so steering never holds stale refs. */
  threatPoints: Array<{ x: number; y: number }>;
  mode: HumanMode;
  settleTrait: SettleTrait;
  /** Bolts straight for cover the instant a zombie is spotted. */
  bushHider: boolean;
  /** 'bolt' runs blindly away instead of picking the roomiest lane. */
  fleeStyle: 'safest' | 'bolt';
  /** Stays put when a zombie is outside the building they're already in. */
  staysIndoors: boolean;
  /** What this person does on seeing someone else run. */
  witness: 'ignore' | 'follow' | 'investigate';
  /** Partner they stroll and panic with, if any. */
  partnerId: string | null;
  /**
   * Where in the list of candidate refuges this person reaches for: 0 grabs
   * the closest building, 1 heads for the far side of the district. Fixed per
   * civilian so a crowd fans out instead of all piling into one doorway.
   */
  refugeBias: number;
  refugeX: number | null;
  refugeY: number | null;
  /** Officers keep running for a while after being grabbed. */
  fleeUntil: number;
  /** Temporary heading commitment used to peel off a wall. */
  unstickUntil: number;
  unstickHeading: number;
  lastUnstickCheck: number;
  unstickX: number;
  unstickY: number;
  /** Multiplier applied while `slowUntil` is in the future. */
  slowMul: number;
  /** Where a rally shout sent them, if any. */
  rallyX: number | null;
  rallyY: number | null;
  /** Cached cover choice — scanning every bush every tick is far too costly. */
  bushX: number | null;
  bushY: number | null;
  nextBushScanAt: number;
  /** Idle glancing about while standing at a rally point. */
  lookHeading: number;
  nextLookAt: number;
  nextChatterAt: number;
  threatX: number;
  threatY: number;
  retreatUntil: number;
  panicUntil: number;
  seekUntil: number;
  /** Zombie burst state. */
  lungeUntil: number;
  lungeReadyAt: number;
  /** Winded after a grapple, or otherwise slowed. */
  slowUntil: number;
  lastSeenX: number | null;
  lastSeenY: number | null;
  wanderX: number;
  wanderY: number;
  pauseUntil: number;
  nextSenseAt: number;
  nextTurnAt: number;
  progressCheckAt: number;
  lastX: number;
  lastY: number;
  path: Waypoint[] | null;
  pathIndex: number;
  nextPathAt: number;
  pathGoalX: number;
  pathGoalY: number;
  nextShotAt: number;
  /** Cooldown on clawing at a window pane. */
  nextWindowHitAt: number;
  /** Cooldown on scanning for panicking neighbours. */
  nextWitnessCheck: number;
}

export interface GrappleSession {
  zombieIds: Set<string>;
  endsAt: number;
}

export interface Command {
  input: InputState;
  aim: number;
  shooting: boolean;
  sprint: boolean;
  interact: boolean;
}

export interface World {
  map: MapData;
  nav: NavGrid;
  entities: Map<string, Entity>;
  /** Socket-controlled ids. AI never drives these, whatever their type. */
  playerIds: Set<string>;
  spectators: Set<string>;
  commands: Map<string, Command>;
  ai: Map<string, AiState>;
  grapples: Map<string, GrappleSession>;
  /** Bitten but not yet turned: id -> timestamp when they become a zombie. */
  pendingInfections: Map<string, number>;
  /** How many times each victim has been grappled — raises instant-turn odds. */
  grappleCounts: Map<string, number>;
  speedBoosts: Map<string, number>;
  lastShotAt: Map<string, number>;
  /** Sprint reserve for player officers. */
  stamina: Map<string, number>;
  /** Players who ran the bar dry and haven't recovered enough to sprint again. */
  exhausted: Set<string>;
  shots: Shot[];
  entityGrid: SpatialGrid<Entity>;
  wallGrid: SpatialGrid<Wall>;
  bushGrid: SpatialGrid<Bush>;
  /** Panes are see-through but solid; index matches map.windows. */
  windowGrid: SpatialGrid<number>;
  windowHealth: number[];
  brokenWindows: number[];
  /** id -> when a materialising entity finishes fading in. */
  materializeUntil: Map<string, number>;
  /** id -> active speech bubble. */
  speech: Map<string, { text: string; until: number }>;
  /** Remaining rally shouts per player. */
  rallyCharges: Map<string, number>;
  /** Loot lying on the floor, keyed by pickup id. */
  pickups: Map<string, PickupState>;
  inventories: Map<string, Inventory>;
  /** Entity id -> when a tracker dart mark expires. */
  trackedTargets: Map<string, number>;
  grenades: Map<string, Grenade>;
  smokes: Map<string, Smoke>;
  helicopters: Map<string, Helicopter>;
  /** Ids of helicopter-dropped troops — they aim far better. */
  soldiers: Set<string>;
  pathBudget: number;
  gameOver: boolean;
  victory: boolean;
  /** Where the first zombie appears — player one spawns here for testing. */
  outbreakOrigin: { x: number; y: number };
}

const ENTITY_CELL = 96;
const STATIC_CELL = 160;

/** Zombies vary a lot, humans barely at all, players not at all. */
export function rollSpeedMul(type: EntityType): number {
  if (type === 'zombie') {
    return ZOMBIE_SPEED_MUL_MIN + Math.random() * (ZOMBIE_SPEED_MUL_MAX - ZOMBIE_SPEED_MUL_MIN);
  }
  if (type === 'human') {
    return HUMAN_SPEED_MUL_MIN + Math.random() * (HUMAN_SPEED_MUL_MAX - HUMAN_SPEED_MUL_MIN);
  }
  return 1;
}

export function makeEntity(id: string, type: EntityType, x: number, y: number): Entity {
  return {
    id,
    type,
    x,
    y,
    facing: 0,
    health: ENTITY_MAX_HEALTH[type],
    radius: ENTITY_RADIUS[type],
    maxHealth: ENTITY_MAX_HEALTH[type],
    speedMul: rollSpeedMul(type),
  };
}

/**
 * Weighted draw over where a spooked human tries to hole up. Weighted heavily
 * toward actually taking cover — only a tenth keep wandering indefinitely.
 */
function rollSettleTrait(): SettleTrait {
  const r = Math.random();
  if (r < 0.62) return 'building';
  if (r < 0.72) return 'bush';
  if (r < 0.84) return 'officer';
  if (r < 0.94) return 'group';
  return 'roam';
}

function rollWitness(): 'ignore' | 'follow' | 'investigate' {
  const r = Math.random();
  if (r < WITNESS_FOLLOW_CHANCE) return 'follow';
  if (r < WITNESS_FOLLOW_CHANCE + WITNESS_INVESTIGATE_CHANCE) return 'investigate';
  return 'ignore';
}

export function newAiState(now: number, x: number, y: number): AiState {
  return {
    heading: Math.random() * Math.PI * 2,
    targetId: null,
    fleeX: 0,
    fleeY: 0,
    threatCount: 0,
    threatPoints: [],
    mode: 'wander',
    settleTrait: rollSettleTrait(),
    bushHider: Math.random() < BUSH_HIDER_CHANCE,
    fleeStyle: Math.random() < BOLT_FLEE_CHANCE ? 'bolt' : 'safest',
    staysIndoors: Math.random() < INDOOR_STAY_CHANCE,
    witness: rollWitness(),
    partnerId: null,
    refugeBias: Math.random(),
    refugeX: null,
    refugeY: null,
    fleeUntil: 0,
    unstickUntil: 0,
    unstickHeading: 0,
    lastUnstickCheck: 0,
    unstickX: x,
    unstickY: y,
    slowMul: ZOMBIE_POST_GRAPPLE_SLOW,
    rallyX: null,
    rallyY: null,
    bushX: null,
    bushY: null,
    nextBushScanAt: 0,
    lookHeading: Math.random() * Math.PI * 2,
    nextLookAt: 0,
    nextChatterAt: now + RALLY_CHATTER_MIN_MS + Math.random() * RALLY_CHATTER_MAX_MS,
    threatX: 0,
    threatY: 0,
    retreatUntil: 0,
    panicUntil: 0,
    seekUntil: 0,
    lungeUntil: 0,
    lungeReadyAt: 0,
    slowUntil: 0,
    lastSeenX: null,
    lastSeenY: null,
    wanderX: x,
    wanderY: y,
    pauseUntil: 0,
    // Stagger first perception so the whole crowd never senses on one tick.
    nextSenseAt: now + Math.random() * 100,
    nextTurnAt: 0,
    progressCheckAt: now + 600,
    lastX: x,
    lastY: y,
    path: null,
    pathIndex: 0,
    nextPathAt: 0,
    pathGoalX: 0,
    pathGoalY: 0,
    nextShotAt: now + Math.random() * 2000,
    nextWindowHitAt: 0,
    nextWitnessCheck: now + Math.random() * 500,
  };
}

function buildStaticGrids(world: World): void {
  world.wallGrid.clear();
  world.bushGrid.clear();
  world.windowGrid.clear();

  for (const wall of world.map.walls) {
    world.wallGrid.insertRect(wall, wall.x, wall.y, wall.x + wall.w, wall.y + wall.h);
  }
  for (const bush of world.map.bushes) {
    world.bushGrid.insertRect(bush, bush.x - bush.r, bush.y - bush.r, bush.x + bush.r, bush.y + bush.r);
  }

  world.windowHealth = world.map.windows.map(() => WINDOW_HEALTH);
  world.brokenWindows = [];
  world.map.windows.forEach((pane, i) => {
    world.windowGrid.insertRect(i, pane.x, pane.y, pane.x + pane.w, pane.y + pane.h);
  });
}

export function isWindowIntact(world: World, index: number): boolean {
  return (world.windowHealth[index] ?? 0) > 0;
}

/** Applies damage to a pane; returns true when this hit smashed it. */
export function damageWindow(world: World, index: number, amount: number): boolean {
  if (!isWindowIntact(world, index)) return false;
  world.windowHealth[index] -= amount;
  if (world.windowHealth[index] > 0) return false;
  world.windowHealth[index] = 0;
  world.brokenWindows.push(index);
  return true;
}

export function rebuildEntityGrid(world: World): void {
  world.entityGrid.clear();
  for (const e of world.entities.values()) {
    world.entityGrid.insertRect(e, e.x - e.radius, e.y - e.radius, e.x + e.radius, e.y + e.radius);
  }
}

/** True when neither a wall nor a bush sits between the two points. */
export function hasLineOfSight(world: World, x1: number, y1: number, x2: number, y2: number): boolean {
  const minX = Math.min(x1, x2);
  const maxX = Math.max(x1, x2);
  const minY = Math.min(y1, y2);
  const maxY = Math.max(y1, y2);

  const walls = world.wallGrid.queryRect(minX, minY, maxX, maxY, new Set<Wall>());
  for (const wall of walls) {
    if (segmentRectT(x1, y1, x2, y2, wall) !== null) return false;
  }

  const bushes = world.bushGrid.queryRect(minX, minY, maxX, maxY, new Set<Bush>());
  for (const bush of bushes) {
    // The bush you're standing in doesn't block your own view out of it —
    // others still can't see in, which is what makes hiding work.
    if (Math.hypot(bush.x - x1, bush.y - y1) <= bush.r) continue;
    if (segmentCircleT(x1, y1, x2, y2, bush.x, bush.y, bush.r) !== null) return false;
  }

  return true;
}

/** Walls only — bushes are walkable, so they shouldn't veto a route. */
export function hasWallClearPath(world: World, x1: number, y1: number, x2: number, y2: number): boolean {
  const walls = world.wallGrid.queryRect(
    Math.min(x1, x2),
    Math.min(y1, y2),
    Math.max(x1, x2),
    Math.max(y1, y2),
    new Set<Wall>(),
  );
  for (const wall of walls) {
    if (segmentRectT(x1, y1, x2, y2, wall) !== null) return false;
  }
  return true;
}

export function isInBush(world: World, x: number, y: number): boolean {
  const bushes = world.bushGrid.queryCircle(x, y, 1, new Set<Bush>());
  for (const bush of bushes) {
    if (Math.hypot(bush.x - x, bush.y - y) <= bush.r) return true;
  }
  return false;
}

export function speedAt(world: World, x: number, y: number, base: number): number {
  return isInBush(world, x, y) ? base * BUSH_SPEED_MULTIPLIER : base;
}

/** Rejection-sample a point that clears existing entities and walls. */
export function findSpawn(
  world: World,
  radius: number,
  bounds?: { x: number; y: number; w: number; h: number },
): { x: number; y: number } {
  for (let attempt = 0; attempt < 60; attempt++) {
    const x = bounds
      ? bounds.x + radius + Math.random() * Math.max(1, bounds.w - radius * 2)
      : radius + Math.random() * (WORLD_WIDTH - radius * 2);
    const y = bounds
      ? bounds.y + radius + Math.random() * Math.max(1, bounds.h - radius * 2)
      : radius + Math.random() * (WORLD_HEIGHT - radius * 2);

    // Never drop anyone into a room they could never have walked into.
    if (!world.nav.isReachable(x, y)) continue;

    const probe = { x, y, radius: radius + 6 };
    const walls = world.wallGrid.queryCircle(x, y, radius + 24, new Set<Wall>());
    let blocked = false;
    for (const wall of walls) {
      if (resolveCircleRect({ ...probe }, wall)) {
        blocked = true;
        break;
      }
    }
    if (blocked) continue;

    for (const other of world.entities.values()) {
      if (Math.hypot(other.x - x, other.y - y) < other.radius + radius + 6) {
        blocked = true;
        break;
      }
    }
    if (!blocked) return { x, y };
  }
  return {
    x: radius + Math.random() * (WORLD_WIDTH - radius * 2),
    y: radius + Math.random() * (WORLD_HEIGHT - radius * 2),
  };
}

export function createWorld(): World {
  const map = generateMap();
  const world: World = {
    map,
    nav: new NavGrid(map),
    entities: new Map(),
    playerIds: new Set(),
    spectators: new Set(),
    commands: new Map(),
    ai: new Map(),
    grapples: new Map(),
    pendingInfections: new Map(),
    grappleCounts: new Map(),
    speedBoosts: new Map(),
    lastShotAt: new Map(),
    stamina: new Map(),
    exhausted: new Set(),
    shots: [],
    entityGrid: new SpatialGrid<Entity>(ENTITY_CELL, WORLD_WIDTH, WORLD_HEIGHT),
    wallGrid: new SpatialGrid<Wall>(STATIC_CELL, WORLD_WIDTH, WORLD_HEIGHT),
    bushGrid: new SpatialGrid<Bush>(STATIC_CELL, WORLD_WIDTH, WORLD_HEIGHT),
    windowGrid: new SpatialGrid<number>(STATIC_CELL, WORLD_WIDTH, WORLD_HEIGHT),
    windowHealth: [],
    brokenWindows: [],
    materializeUntil: new Map(),
    speech: new Map(),
    rallyCharges: new Map(),
    pickups: new Map(),
    inventories: new Map(),
    trackedTargets: new Map(),
    grenades: new Map(),
    smokes: new Map(),
    helicopters: new Map(),
    soldiers: new Set(),
    pathBudget: PATH_BUDGET_PER_TICK,
    gameOver: false,
    victory: false,
    outbreakOrigin: { x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2 },
  };
  buildStaticGrids(world);
  populate(world);
  spawnPickups(world, playerOneStart(world));
  return world;
}

/** Fresh map, fresh crowd; connected players are respawned as officers. */
export function resetWorld(world: World): void {
  world.map = generateMap();
  world.nav = new NavGrid(world.map);
  buildStaticGrids(world);

  world.entities.clear();
  world.ai.clear();
  world.materializeUntil.clear();
  world.speech.clear();
  world.grenades.clear();
  world.smokes.clear();
  world.helicopters.clear();
  world.soldiers.clear();
  world.trackedTargets.clear();
  world.grapples.clear();
  world.pendingInfections.clear();
  world.grappleCounts.clear();
  world.speedBoosts.clear();
  world.lastShotAt.clear();
  world.shots.length = 0;
  world.spectators.clear();
  world.gameOver = false;
  world.victory = false;

  populate(world);
  spawnPickups(world, playerOneStart(world));

  // Player one gets the designated start point; everyone else spawns at random.
  let first = true;
  for (const id of world.playerIds) {
    const start = playerOneStart(world);
    const spawn = first
      ? findSpawnNear(world, start.x, start.y, ENTITY_RADIUS.officer)
      : findSpawn(world, ENTITY_RADIUS.officer);
    first = false;
    world.entities.set(id, makeEntity(id, 'officer', spawn.x, spawn.y));
    world.stamina.set(id, STAMINA_MAX);
    world.exhausted.delete(id);
    world.rallyCharges.set(id, RALLY_STARTING_CHARGES);
    world.inventories.set(id, newInventory());
  }
}

/** True when this entity is locked in a grapple, as victim or as attacker. */
export function isInGrapple(world: World, id: string): boolean {
  if (world.grapples.has(id)) return true;
  for (const session of world.grapples.values()) {
    if (session.zombieIds.has(id)) return true;
  }
  return false;
}

export function countZombies(world: World): number {
  let n = 0;
  for (const e of world.entities.values()) {
    if (e.type === 'zombie') n++;
  }
  return n;
}

/** Positions of the last remaining humans, for the on-screen guide arrows. */
export function humanPositions(world: World): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = [];
  for (const e of world.entities.values()) {
    if (e.type === 'human') out.push({ x: Math.round(e.x), y: Math.round(e.y) });
  }
  return out;
}

function populate(world: World): void {
  const now = Date.now();

  const addHuman = (index: number, x: number, y: number, facing?: number) => {
    const id = `human-${index}`;
    const entity = makeEntity(id, 'human', x, y);
    if (facing !== undefined) entity.facing = facing;
    world.entities.set(id, entity);
    const state = newAiState(now, x, y);
    if (facing !== undefined) state.heading = facing;
    world.ai.set(id, state);
    return id;
  };

  let placed = 0;

  // Clusters stood in a ring facing inward, as if mid-conversation.
  const socialTarget = Math.floor(HUMAN_COUNT * SOCIAL_GROUP_SHARE);
  while (placed < socialTarget && placed < HUMAN_COUNT) {
    const size = Math.min(
      SOCIAL_GROUP_MIN + Math.floor(Math.random() * (SOCIAL_GROUP_MAX - SOCIAL_GROUP_MIN + 1)),
      HUMAN_COUNT - placed,
    );
    const centre = findSpawn(world, ENTITY_RADIUS.human + SOCIAL_CIRCLE_RADIUS);
    const ids: string[] = [];
    for (let k = 0; k < size; k++) {
      const angle = (k / size) * Math.PI * 2;
      const x = clamp(centre.x + Math.cos(angle) * SOCIAL_CIRCLE_RADIUS, 40, WORLD_WIDTH - 40);
      const y = clamp(centre.y + Math.sin(angle) * SOCIAL_CIRCLE_RADIUS, 40, WORLD_HEIGHT - 40);
      ids.push(addHuman(placed + k, x, y, angle + Math.PI)); // face the middle
    }
    // Let them stand and chat a while before drifting off.
    for (const id of ids) {
      const st = world.ai.get(id)!;
      st.pauseUntil = now + 4000 + Math.random() * 9000;
    }
    placed += size;
  }

  // A share of the rest start indoors.
  const indoorTarget = placed + Math.floor(HUMAN_COUNT * BUILDING_START_SHARE);
  while (placed < indoorTarget && placed < HUMAN_COUNT) {
    const b = world.map.buildings[Math.floor(Math.random() * world.map.buildings.length)];
    const spawn = findSpawn(world, ENTITY_RADIUS.human, {
      x: b.x + 18,
      y: b.y + 18,
      w: b.w - 36,
      h: b.h - 36,
    });
    addHuman(placed, spawn.x, spawn.y);
    placed++;
  }

  for (; placed < HUMAN_COUNT; placed++) {
    const spawn = findSpawn(world, ENTITY_RADIUS.human);
    addHuman(placed, spawn.x, spawn.y);
  }

  // Pair off some of them into couples who move and panic together.
  const humanIds = Array.from({ length: HUMAN_COUNT }, (_, i) => `human-${i}`);
  const coupleCount = Math.floor((HUMAN_COUNT * COUPLE_SHARE) / 2);
  for (let i = 0; i < coupleCount; i++) {
    const a = world.ai.get(humanIds[i * 2]);
    const b = world.ai.get(humanIds[i * 2 + 1]);
    if (!a || !b) continue;
    a.partnerId = humanIds[i * 2 + 1];
    b.partnerId = humanIds[i * 2];
  }

  const officerCount =
    NPC_OFFICER_MIN + Math.floor(Math.random() * (NPC_OFFICER_MAX - NPC_OFFICER_MIN + 1));
  for (let i = 0; i < officerCount; i++) {
    const spawn = findSpawn(world, ENTITY_RADIUS.officer);
    const id = `npc-officer-${i}`;
    world.entities.set(id, makeEntity(id, 'officer', spawn.x, spawn.y));
    world.ai.set(id, newAiState(now, spawn.x, spawn.y));
  }

  // The outbreak walks in from one randomly chosen edge, spread along it.
  const side = Math.floor(Math.random() * 4); // 0 N, 1 E, 2 S, 3 W
  const inset = BOUNDARY_THICKNESS + ENTITY_RADIUS.zombie + 24;
  let originX = 0;
  let originY = 0;

  // One breach point rather than a picket line across the whole edge.
  const breach = 0.15 + Math.random() * 0.7;
  for (let i = 0; i < INITIAL_ZOMBIES; i++) {
    const along = breach;
    const jitter = (i - (INITIAL_ZOMBIES - 1) / 2) * (INITIAL_ZOMBIE_SPREAD / INITIAL_ZOMBIES)
      + (Math.random() - 0.5) * 30;
    let x: number;
    let y: number;
    if (side === 0) {
      x = clamp(WORLD_WIDTH * along + jitter, inset, WORLD_WIDTH - inset);
      y = inset;
    } else if (side === 1) {
      x = WORLD_WIDTH - inset;
      y = clamp(WORLD_HEIGHT * along + jitter, inset, WORLD_HEIGHT - inset);
    } else if (side === 2) {
      x = clamp(WORLD_WIDTH * along + jitter, inset, WORLD_WIDTH - inset);
      y = WORLD_HEIGHT - inset;
    } else {
      x = inset;
      y = clamp(WORLD_HEIGHT * along + jitter, inset, WORLD_HEIGHT - inset);
    }

    const id = `zombie-${i}`;
    world.entities.set(id, makeEntity(id, 'zombie', x, y));
    world.ai.set(id, newAiState(now, x, y));
    world.materializeUntil.set(id, now + MATERIALIZE_MS);
    if (i === Math.floor(INITIAL_ZOMBIES / 2)) {
      originX = x;
      originY = y;
    }
  }
  world.outbreakOrigin = { x: originX, y: originY };
}

/** Where player one starts: town centre while testing, otherwise the outbreak. */
export function playerOneStart(world: World): { x: number; y: number } {
  return PLAYER_ONE_SPAWN_AT_CENTER
    ? { x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2 }
    : world.outbreakOrigin;
}

/** A clear spot within `range` of a point — used to place player one. */
export function findSpawnNear(
  world: World,
  originX: number,
  originY: number,
  radius: number,
  range = PLAYER_ONE_SPAWN_RANGE,
): { x: number; y: number } {
  for (let attempt = 0; attempt < 40; attempt++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 40 + Math.random() * range;
    const x = clamp(originX + Math.cos(angle) * dist, radius, WORLD_WIDTH - radius);
    const y = clamp(originY + Math.sin(angle) * dist, radius, WORLD_HEIGHT - radius);

    const probe = { x, y, radius: radius + 4 };
    let blocked = false;
    const walls = world.wallGrid.queryCircle(x, y, radius + 20, new Set<Wall>());
    for (const wall of walls) {
      if (resolveCircleRect({ ...probe }, wall)) {
        blocked = true;
        break;
      }
    }
    if (blocked) continue;

    for (const other of world.entities.values()) {
      if (Math.hypot(other.x - x, other.y - y) < other.radius + radius + 4) {
        blocked = true;
        break;
      }
    }
    if (!blocked) return { x, y };
  }
  return findSpawn(world, radius);
}

/** Everyone still on the human side — humans plus officers, NPC or player. */
export function countSurvivors(world: World): number {
  let n = 0;
  for (const e of world.entities.values()) {
    if (e.type === 'human' || e.type === 'officer') n++;
  }
  return n;
}

/**
 * Separate overlapping entities, then push everything clear of walls. Walls
 * resolve last so no entity can be squeezed inside geometry.
 */
export function resolveCollisions(world: World): void {
  const neighbours = new Set<Entity>();

  for (const a of world.entities.values()) {
    neighbours.clear();
    world.entityGrid.queryCircle(a.x, a.y, a.radius * 2 + 8, neighbours);

    for (const b of neighbours) {
      if (b.id <= a.id) continue; // each pair once

      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const minDist = a.radius + b.radius;
      let dist = Math.hypot(dx, dy);
      if (dist >= minDist) continue;

      dist = dist || 0.001;
      const overlap = minDist - dist;
      const nx = dx / dist;
      const ny = dy / dist;

      a.x -= nx * (overlap / 2);
      a.y -= ny * (overlap / 2);
      b.x += nx * (overlap / 2);
      b.y += ny * (overlap / 2);
    }
  }

  const walls = new Set<Wall>();
  const panes = new Set<number>();
  for (const e of world.entities.values()) {
    walls.clear();
    world.wallGrid.queryCircle(e.x, e.y, e.radius + 4, walls);
    for (const wall of walls) resolveCircleRect(e, wall);

    // Unbroken glass is as solid as wall for movement, just not for sight.
    panes.clear();
    world.windowGrid.queryCircle(e.x, e.y, e.radius + 4, panes);
    for (const index of panes) {
      if (isWindowIntact(world, index)) resolveCircleRect(e, world.map.windows[index]);
    }

    e.x = clamp(e.x, e.radius, WORLD_WIDTH - e.radius);
    e.y = clamp(e.y, e.radius, WORLD_HEIGHT - e.radius);
  }
}

export function toWire(world: World, e: Entity, viewerIsZombie = false, now = Date.now()): EntityState {
  const state: EntityState = {
    id: e.id,
    type: e.type,
    x: Math.round(e.x * 10) / 10,
    y: Math.round(e.y * 10) / 10,
    facing: Math.round(e.facing * 100) / 100,
    health: Math.round(e.health),
  };
  if (world.grapples.has(e.id)) state.grappling = true;
  else {
    for (const session of world.grapples.values()) {
      if (session.zombieIds.has(e.id)) {
        state.grappling = true;
        break;
      }
    }
  }
  // Only the zombie side gets to see who's already carrying the infection.
  if (viewerIsZombie && world.pendingInfections.has(e.id)) state.infected = true;
  if (e.type === 'officer' && !world.playerIds.has(e.id)) state.npc = true;
  if (world.soldiers.has(e.id)) state.soldier = true;

  const until = world.materializeUntil.get(e.id);
  if (until !== undefined) {
    if (now < until) state.materializing = true;
    else world.materializeUntil.delete(e.id);
  }

  const line = world.speech.get(e.id);
  if (line !== undefined) {
    if (now < line.until) state.say = line.text;
    else world.speech.delete(e.id);
  }
  return state;
}
