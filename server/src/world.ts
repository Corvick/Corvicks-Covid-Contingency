import type {
  Bush,
  Door,
  DoorPrompt,
  EntityState,
  EntityType,
  InputState,
  MapData,
  PickupState,
  Shot,
  Wall,
} from '../../shared/types.js';
import type { DoorRuntime } from './doors.js';

/** What a player's press or hold of E is doing to a door. */
export type DoorAction = 'open' | 'close' | 'lock' | 'unlock' | 'kick';
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
  SHELTER_SEEK_CHANCE,
  SHELTER_FAR_CHANCE,
  SHELTER_LARGE_CHANCE,
  PANIC_SCALE_MIN,
  PANIC_SCALE_MAX,
  DOOR_CLOSE_BEHIND_CHANCE,
  DOOR_LOCK_BEHIND_CHANCE,
  DOOR_BEG_CHANCE,
  DOOR_BEG_HOLD_CHANCE,
  DOOR_OPENS_FOR_STRANGERS_CHANCE,
  DOOR_SLAM_CHANCE,
  ZOMBIE_SMART_SHARE,
  OFFICER_SEEK_CHANCE,
  RALLY_STARTING_CHARGES,
  PLAYER_ONE_SPAWN_AT_CENTER,
  BOLT_FLEE_CHANCE,
  INDOOR_STAY_CHANCE,
  WITNESS_FOLLOW_CHANCE,
  WITNESS_INVESTIGATE_CHANCE,
  COUPLE_COUNT_MIN,
  COUPLE_COUNT_MAX,
  COUPLE_SPAWN_GAP,
  INDOOR_HOMEBODY_SHARE,
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
import { DangerField } from './danger.js';
import { doorRect, initDoors } from './doors.js';

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
  /** Makes for the inside of a nearby building the instant a zombie is spotted. */
  shelterSeeker: boolean;
  /** Runs for somewhere specific blocks away rather than the nearest door. */
  shelterFar: boolean;
  /** Wants somewhere substantial — a landmark, not the nearest front door. */
  shelterLarge: boolean;
  /**
   * Personal scaling on how long this person keeps running and stays rattled.
   * Most run a long way; a few gather themselves quickly.
   */
  panicScale: number;
  /**
   * Has personally laid eyes on a zombie at some point. Once true this person
   * knows what's going on, and no longer chases after panicking neighbours to
   * find out what they're running from.
   */
  sawZombie: boolean;
  /** 'bolt' runs blindly away instead of picking the roomiest lane. */
  fleeStyle: 'safest' | 'bolt';
  /** Stays put when a zombie is outside the building they're already in. */
  staysIndoors: boolean;
  /** What this person does on seeing someone else run. */
  witness: 'ignore' | 'follow' | 'investigate';
  /** Partner they stroll and panic with, if any. */
  partnerId: string | null;
  /** Still hand in hand. Once let go, they only loosely follow each other. */
  handHeld: boolean;
  /** The half of the pair that decides where they both go. */
  coupleLead: boolean;
  /** Which shoulder the follower walks at: +1 or -1 of the leader's heading. */
  handSide: number;
  /** Edge-detects their partner being seized, so the let-go roll happens once. */
  sawPartnerSeized: boolean;
  /**
   * Building this person lives in and stays inside of, or -1. Set for a share
   * of those who start the round indoors; they potter about their own rooms
   * instead of wandering out into the street.
   */
  homeBuilding: number;
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
  /** Committed flee destination, so they don't dither between equal options. */
  escapeX: number | null;
  escapeY: number | null;
  escapeUntil: number;
  /** Cached cover choice — scanning every bush every tick is far too costly. */
  bushX: number | null;
  bushY: number | null;
  nextBushScanAt: number;
  /** Committed indoor refuge while fleeing, and the building it sits in. */
  shelterX: number | null;
  shelterY: number | null;
  shelterBuilding: number;
  nextShelterScanAt: number;
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

  // ------------------------------------------------------------ doors
  /** Shuts the door behind them when they're only wandering about. */
  closesDoors: boolean;
  /** Shuts *and* locks it when they're getting away from something. */
  locksDoors: boolean;
  /** Begs at a locked door rather than going to find another way in. */
  begsAtDoors: boolean;
  /** Holds their ground at the door even with a zombie on them. */
  begHolds: boolean;
  /** Would let a stranger in. Most people, sensibly, would not. */
  opensForStrangers: boolean;
  /** Working a handle right now: nothing else happens until this passes. */
  doorBusyUntil: number;
  /** Door being worked, and what is being done to it. */
  doorIndex: number;
  doorAction: 'open' | 'close' | 'lock' | 'unlock' | null;
  /** Door to deal with once through it, and whether to lock it too. */
  doorFollowUp: number;
  doorFollowUpLock: boolean;
  /** Which face of the follow-up door they set out from. */
  doorFollowUpSide: number;
  /** Slams doors shut the moment a zombie comes into view. */
  slamsDoors: boolean;
  /** Open door this person is rushing to shut, or -1. */
  doorSlam: number;
  nextSlamCheck: number;
  /** Another door this person is off to bolt as well, or -1. */
  lockAlso: number;
  /** How long they will hold a close waiting for a doorway to clear. */
  doorWaitUntil: number;
  /** Bright enough to leave a room it has cleared. */
  smartZombie: boolean;
  /** When the room it is in last looked empty, or 0. */
  roomClearSince: number;
  /** Runs to whoever has a gun rather than to a door. */
  officerSeeker: boolean;
  /** When this one first noticed it was getting nowhere, or 0. */
  stuckSince: number;
  /** Freshly turned: no interest in doors while there is prey about. */
  freshUntil: number;
  /** Clawing at a door — drives the animation client-side. */
  breakingUntil: number;
  /** Door just dealt with, left alone until this passes. */
  doorIgnore: number;
  doorIgnoreUntil: number;
  /** Doors found locked, so they don't queue at the same one forever. */
  refusedDoors: number[];
  /** Begging to be let in: which door, and until when. */
  begDoor: number;
  begUntil: number;
  nextBegSpeechAt: number;
  /** Answering someone else's plea at this door. */
  answeringDoor: number;
  /** Door this zombie means to break down, and when it forgets about it. */
  doorTarget: number;
  doorTargetUntil: number;
  nextDoorHitAt: number;
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
  /** Shared geodesic distance-to-nearest-zombie field. */
  danger: DangerField;
  nextDangerRebuild: number;
  /** Set when glass breaks; the tick loop rebuilds the nav grid once. */
  navDirty: boolean;
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
  /**
   * Doors, index-aligned with `map.doors`. A null entry is a plain archway
   * with nothing hung in it.
   */
  doors: Array<DoorRuntime | null>;
  doorGrid: SpatialGrid<number>;
  /** Doors a zombie was alerted to, and when that memory lapses. */
  doorAlerts: Map<number, number>;
  /** Doors somebody outside is currently begging at, and when they give up. */
  doorPleas: Map<number, number>;
  /** Doors somebody has called out to have bolted, and when the call lapses. */
  lockRequests: Map<number, number>;
  /** Doors waiting on a blocked doorway to clear before they can shut. */
  doorClearing: Map<number, number>;
  /** When this round began — gates the first-sighting chatter. */
  startedAt: number;
  /** Humans and officers still alive, recomputed once a tick. */
  survivorCount: number;
  /** Per-player door prompt, rebuilt each tick. */
  doorPrompts: Map<string, DoorPrompt>;
  /** Door action a player is part-way through: id -> start time. */
  doorHolds: Map<string, { index: number; startedAt: number; action: DoorAction }>;
  /** Players whose E must be released before it counts again. */
  doorSpent: Set<string>;
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
    shelterSeeker: Math.random() < SHELTER_SEEK_CHANCE,
    shelterFar: Math.random() < SHELTER_FAR_CHANCE,
    shelterLarge: Math.random() < SHELTER_LARGE_CHANCE,
    panicScale: PANIC_SCALE_MIN + Math.random() * (PANIC_SCALE_MAX - PANIC_SCALE_MIN),
    sawZombie: false,
    fleeStyle: Math.random() < BOLT_FLEE_CHANCE ? 'bolt' : 'safest',
    staysIndoors: Math.random() < INDOOR_STAY_CHANCE,
    witness: rollWitness(),
    partnerId: null,
    handHeld: false,
    coupleLead: false,
    handSide: 1,
    sawPartnerSeized: false,
    homeBuilding: -1,
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
    escapeX: null,
    escapeY: null,
    escapeUntil: 0,
    bushX: null,
    bushY: null,
    nextBushScanAt: 0,
    shelterX: null,
    shelterY: null,
    shelterBuilding: -1,
    nextShelterScanAt: 0,
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

    closesDoors: Math.random() < DOOR_CLOSE_BEHIND_CHANCE,
    locksDoors: Math.random() < DOOR_LOCK_BEHIND_CHANCE,
    begsAtDoors: Math.random() < DOOR_BEG_CHANCE,
    begHolds: Math.random() < DOOR_BEG_HOLD_CHANCE,
    opensForStrangers: Math.random() < DOOR_OPENS_FOR_STRANGERS_CHANCE,
    doorBusyUntil: 0,
    doorIndex: -1,
    doorAction: null,
    doorFollowUp: -1,
    doorFollowUpLock: false,
    doorFollowUpSide: 0,
    slamsDoors: Math.random() < DOOR_SLAM_CHANCE,
    doorSlam: -1,
    nextSlamCheck: 0,
    lockAlso: -1,
    doorWaitUntil: 0,
    smartZombie: Math.random() < ZOMBIE_SMART_SHARE,
    roomClearSince: 0,
    officerSeeker: Math.random() < OFFICER_SEEK_CHANCE,
    stuckSince: 0,
    freshUntil: 0,
    breakingUntil: 0,
    doorIgnore: -1,
    doorIgnoreUntil: 0,
    refusedDoors: [],
    begDoor: -1,
    begUntil: 0,
    nextBegSpeechAt: 0,
    answeringDoor: -1,
    doorTarget: -1,
    doorTargetUntil: 0,
    nextDoorHitAt: 0,
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

  // Every doorway goes in the grid; whether its door is shut is checked at
  // query time, exactly as panes are.
  world.doorGrid.clear();
  world.map.doors.forEach((door, i) => {
    const rect = doorRect(door);
    world.doorGrid.insertRect(i, rect.x, rect.y, rect.x + rect.w, rect.y + rect.h);
  });

  world.windowHealth = world.map.windows.map(() => WINDOW_HEALTH);
  world.brokenWindows = [];
  world.map.windows.forEach((pane, i) => {
    world.windowGrid.insertRect(i, pane.x, pane.y, pane.x + pane.w, pane.y + pane.h);
  });
}

/**
 * Index of the building genuinely containing this point, or -1. Tests the
 * carved footprint, not the bounding box — the notch of an L-shaped building
 * is outdoors, and treating it as inside made people "hide" in the street.
 */
export function buildingIndexAt(world: World, x: number, y: number): number {
  const list = world.map.buildings;
  for (let i = 0; i < list.length; i++) {
    const b = list[i];
    if (x <= b.x || x >= b.x + b.w || y <= b.y || y >= b.y + b.h) continue;
    for (const r of b.rects) {
      if (x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h) return i;
    }
  }
  return -1;
}

export function isIndoors(world: World, x: number, y: number): boolean {
  return buildingIndexAt(world, x, y) >= 0;
}

/** Doors of a building, as world points. */
export function doorsOf(world: World, buildingIndex: number): Door[] {
  const b = world.map.buildings[buildingIndex];
  if (!b) return [];
  return b.doors.map((d) => world.map.doors[d]).filter(Boolean);
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
  // A smashed pane is a new way through — the nav grid has to learn about it.
  world.navDirty = true;
  return true;
}

/**
 * Rebuild the nav grid and the danger field after the map's solid geometry has
 * changed. Cheap enough at the rate glass actually breaks, and the main loop
 * coalesces it to at most one rebuild per tick.
 */
export function rebuildNav(world: World): void {
  world.nav = new NavGrid(world.map, new Set(world.brokenWindows));
  world.danger = new DangerField(world.map, world.nav);
  world.nextDangerRebuild = 0;
  world.navDirty = false;
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

  // A shut door is opaque, unlike the glass beside it.
  const slabs = world.doorGrid.queryRect(minX, minY, maxX, maxY, new Set<number>());
  for (const index of slabs) {
    const door = world.doors[index];
    if (!door || door.open || door.broken) continue;
    if (segmentRectT(x1, y1, x2, y2, door.rect) !== null) return false;
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

/**
 * Walls and intact glass — bushes are walkable, so they shouldn't veto a
 * route. Panes count: they're see-through but you still can't walk through
 * one, and treating them as open steered people face-first into them.
 */
export function hasWallClearPath(world: World, x1: number, y1: number, x2: number, y2: number): boolean {
  const minX = Math.min(x1, x2);
  const maxX = Math.max(x1, x2);
  const minY = Math.min(y1, y2);
  const maxY = Math.max(y1, y2);

  const walls = world.wallGrid.queryRect(minX, minY, maxX, maxY, new Set<Wall>());
  for (const wall of walls) {
    if (segmentRectT(x1, y1, x2, y2, wall) !== null) return false;
  }

  const panes = world.windowGrid.queryRect(minX, minY, maxX, maxY, new Set<number>());
  for (const index of panes) {
    if (!isWindowIntact(world, index)) continue;
    if (segmentRectT(x1, y1, x2, y2, world.map.windows[index]) !== null) return false;
  }

  const slabs = world.doorGrid.queryRect(minX, minY, maxX, maxY, new Set<number>());
  for (const index of slabs) {
    const door = world.doors[index];
    if (!door || door.open || door.broken) continue;
    if (segmentRectT(x1, y1, x2, y2, door.rect) !== null) return false;
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
  const nav = new NavGrid(map);
  const world: World = {
    map,
    nav,
    danger: new DangerField(map, nav),
    nextDangerRebuild: 0,
    navDirty: false,
    doors: [],
    doorGrid: new SpatialGrid<number>(STATIC_CELL, WORLD_WIDTH, WORLD_HEIGHT),
    doorAlerts: new Map(),
    doorPleas: new Map(),
    lockRequests: new Map(),
    doorClearing: new Map(),
    survivorCount: 0,
    startedAt: Date.now(),
    doorPrompts: new Map(),
    doorHolds: new Map(),
    doorSpent: new Set(),
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
  initDoors(world);
  populate(world);
  spawnPickups(world, playerOneStart(world));
  return world;
}

/** Fresh map, fresh crowd; connected players are respawned as officers. */
export function resetWorld(world: World): void {
  world.map = generateMap();
  world.nav = new NavGrid(world.map);
  world.danger = new DangerField(world.map, world.nav);
  world.nextDangerRebuild = 0;
  world.navDirty = false;
  // A fresh round is fresh news again — the first-sighting chatter is gated
  // on how long this round has been running, not on process uptime.
  world.startedAt = Date.now();
  buildStaticGrids(world);
  initDoors(world);
  world.doorPrompts.clear();
  world.doorHolds.clear();
  world.doorSpent.clear();

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

  // A few couples, hand in hand. Spawned as actual pairs stood together —
  // pairing off arbitrary ids after the fact left "couples" a block apart.
  const coupleCount =
    COUPLE_COUNT_MIN + Math.floor(Math.random() * (COUPLE_COUNT_MAX - COUPLE_COUNT_MIN + 1));
  for (let i = 0; i < coupleCount && placed + 2 <= HUMAN_COUNT; i++) {
    const centre = findSpawn(world, ENTITY_RADIUS.human + COUPLE_SPAWN_GAP);
    const facing = Math.random() * Math.PI * 2;
    // Side by side, square to the way they're walking.
    const offX = Math.cos(facing + Math.PI / 2) * (COUPLE_SPAWN_GAP / 2);
    const offY = Math.sin(facing + Math.PI / 2) * (COUPLE_SPAWN_GAP / 2);
    const leadId = addHuman(placed, centre.x + offX, centre.y + offY, facing);
    const followId = addHuman(placed + 1, centre.x - offX, centre.y - offY, facing);

    const lead = world.ai.get(leadId)!;
    const follow = world.ai.get(followId)!;
    lead.partnerId = followId;
    follow.partnerId = leadId;
    lead.handHeld = true;
    follow.handHeld = true;
    lead.coupleLead = true;
    // Spawned on the leader's left, and that's the shoulder they walk at.
    follow.handSide = -1;
    // They walk as one, so only the leader's wandering matters.
    follow.wanderX = lead.wanderX;
    follow.wanderY = lead.wanderY;
    placed += 2;
  }

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

  // A share of the rest start indoors — and most of them live there, rather
  // than immediately strolling out of the front door.
  const indoorTarget = placed + Math.floor(HUMAN_COUNT * BUILDING_START_SHARE);
  while (placed < indoorTarget && placed < HUMAN_COUNT) {
    const b = world.map.buildings[Math.floor(Math.random() * world.map.buildings.length)];
    const spawn = findSpawn(world, ENTITY_RADIUS.human, {
      x: b.x + 18,
      y: b.y + 18,
      w: b.w - 36,
      h: b.h - 36,
    });
    const id = addHuman(placed, spawn.x, spawn.y);
    if (Math.random() < INDOOR_HOMEBODY_SHARE) {
      const home = buildingIndexAt(world, spawn.x, spawn.y);
      if (home >= 0) world.ai.get(id)!.homeBuilding = home;
    }
    placed++;
  }

  for (; placed < HUMAN_COUNT; placed++) {
    const spawn = findSpawn(world, ENTITY_RADIUS.human);
    addHuman(placed, spawn.x, spawn.y);
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

    // The perimeter has buildings built onto it, so the breach point can land
    // inside somebody's front room. Walk it in off the edge until it's out in
    // the open — an outbreak starts in the street, not in a bedroom.
    const inward = side === 0 ? [0, 1] : side === 1 ? [-1, 0] : side === 2 ? [0, -1] : [1, 0];
    for (let step = 0; step < 40; step++) {
      if (buildingIndexAt(world, x, y) < 0 && !world.nav.isBlocked(x, y)) break;
      x = clamp(x + inward[0] * 20, inset, WORLD_WIDTH - inset);
      y = clamp(y + inward[1] * 20, inset, WORLD_HEIGHT - inset);
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
  const slabs = new Set<number>();
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

    // A shut door is as solid as the wall it hangs in.
    slabs.clear();
    world.doorGrid.queryCircle(e.x, e.y, e.radius + 4, slabs);
    for (const index of slabs) {
      const door = world.doors[index];
      if (door && !door.open && !door.broken) resolveCircleRect(e, door.rect);
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

  const ai = world.ai.get(e.id);
  if (ai && ai.handHeld && ai.partnerId) state.hand = ai.partnerId;
  if (ai && now < ai.breakingUntil) state.breaking = true;

  const line = world.speech.get(e.id);
  if (line !== undefined) {
    if (now < line.until) state.say = line.text;
    else world.speech.delete(e.id);
  }
  return state;
}
