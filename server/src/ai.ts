import {
  HUMAN_WALK_SPEED,
  HUMAN_FLEE_SPEED,
  HUMAN_SIGHT_RADIUS,
  HUMAN_TURN_RATE,
  HUMAN_PAUSE_MIN_MS,
  HUMAN_PAUSE_MAX_MS,
  HUMAN_WANDER_RADIUS,
  ZOMBIE_SPEED,
  ZOMBIE_SEARCH_SPEED,
  ZOMBIE_SIGHT_RADIUS,
  ZOMBIE_TURN_RATE,
  ZOMBIE_LUNGE_RANGE,
  ZOMBIE_LUNGE_MULTIPLIER,
  ZOMBIE_LUNGE_MS,
  ZOMBIE_LUNGE_COOLDOWN_MS,
  ZOMBIE_POST_GRAPPLE_SLOW,
  ZOMBIE_POST_GRAPPLE_MS,
  ZOMBIE_CLOSE_RANGE,
  ZOMBIE_CLOSE_BOOST,
  GRAPPLE_REACH_BONUS,
  INFECTED_TARGET_PENALTY,
  MAX_GRAPPLERS,
  WINDOW_ATTACK_INTERVAL_MS,
  WINDOW_ZOMBIE_DAMAGE,
  RALLY_RADIUS,
  RALLY_ARRIVE_DIST,
  RALLY_LOOK_MIN_MS,
  RALLY_LOOK_MAX_MS,
  RALLY_LOOK_TURN_RATE,
  RALLY_CHATTER_MIN_MS,
  RALLY_CHATTER_MAX_MS,
  RALLY_CHATTER_CHANCE,
  RALLY_CHATTER_MS,
  RALLY_CHATTER_LINES,
  BUSH_MIN_FIT_RADIUS,
  BUSH_OCCUPANT_SPACING,
  BUSH_SCAN_INTERVAL_MS,
  COUPLE_FOLLOW_DIST,
  HAND_HOLD_DIST,
  HAND_CATCHUP_MULTIPLIER,
  HAND_LEADER_WAIT_MULTIPLIER,
  HAND_RELEASE_ON_SIGHT_CHANCE,
  HAND_RELEASE_ON_GRAPPLE_CHANCE,
  WITNESS_SIGHT_RADIUS,
  BOUNDARY_AVOID_DIST,
  UNSTICK_CHECK_MS,
  UNSTICK_MIN_PROGRESS,
  UNSTICK_COMMIT_MS,
  OFFICER_FLEE_MS,
  INDOOR_EXIT_MARGIN,
  SKIRT_RANGE,
  SKIRT_CONE,
  DOOR_BLOCK_RADIUS,
  REFUGE_CANDIDATES,
  SHELTER_SEARCH_RADIUS,
  SHELTER_FAR_RADIUS,
  SHELTER_LARGE_MIN_AREA,
  SHELTER_LARGE_RADIUS,
  SHELTER_CANDIDATES,
  SHELTER_SCAN_INTERVAL_MS,
  SHAKEN_WALK_MULTIPLIER,
  SOLDIER_BLOOM_RAD,
  SOLDIER_SHOOT_INTERVAL_MS,
  SOLDIER_SIGHT,
  DANGER_REBUILD_MS,
  DANGER_MAX_DISTANCE,
  ESCAPE_SAMPLES,
  ESCAPE_DISTANCE,
  ESCAPE_COMMIT_MS,
  SENSE_INTERVAL_MS,
  GRAPPLE_MIN_MS,
  GRAPPLE_MAX_MS,
  BASE_ESCAPE_CHANCE,
  ESCAPE_CHANCE_PER_EXTRA_ZOMBIE,
  ESCAPE_SPEED_MULTIPLIER,
  ESCAPE_BOOST_MS,
  KEVLAR_GRAPPLE_MS,
  FOLLOW_RADIUS,
  FOLLOW_ARRIVE_DIST,
  FOLLOW_SPEED_MUL,
  INSTANT_INFECT_BASE,
  INSTANT_INFECT_PER_EXTRA_ZOMBIE,
  INSTANT_INFECT_PER_PRIOR_GRAPPLE,
  TURN_DELAY_MIN_MS,
  TURN_DELAY_MAX_MS,
  FLEE_DIRECTIONS,
  FLEE_PROBE_DIST,
  RETREAT_MS,
  RETREAT_DISTANCE,
  PANIC_MS,
  PANIC_SPEED_MULTIPLIER,
  SEEK_TIMEOUT_MS,
  ROAM_MS,
  GROUP_RADIUS,
  GROUP_MIN_PEERS,
  ENTITY_MAX_HEALTH,
  NPC_OFFICER_SHOOT_INTERVAL_MS,
  NPC_OFFICER_BLOOM_RAD,
  NPC_OFFICER_RETREAT_DIST,
  NPC_OFFICER_SIGHT,
  NPC_OFFICER_TURN_RATE,
  BOT_LOOT_RANGE,
  BOT_LOOT_SCAN_MS,
  BOT_WALK_SPEED,
  BOT_SPRINT_SPEED,
  BOT_BOLT_DIST,
  BOT_SAFE_DIST,
  BOT_HUNT_STANDOFF,
  BOT_SMOKE_COOLDOWN_MS,
  BOT_PATROL_SAMPLES,
  BOT_PATROL_MIN,
  BOT_PATROL_MAX,
  STAMINA_MAX,
  STAMINA_DRAIN_PER_SEC,
  STAMINA_REGEN_PER_SEC,
  STAMINA_SPRINT_FLOOR,
  STAMINA_RECOVERY_THRESHOLD,
  GUN_SLOTS,
  UTILITY_SLOTS,
  WALL_TURN_PROBE,
  PICKUP_REACH,
  GUN_RANGE,
  BLAST_RADIUS,
  TARGET_SWITCH_MARGIN,
  FIRST_SIGHT_WINDOW_MS,
  FIRST_SIGHT_CHANCE,
  FIRST_SIGHT_MS,
  FIRST_SIGHT_LINES,
  PJ_WINDOW_MS,
  PJ_CHANCE,
  PJ_PLAYER_RANGE,
  PJ_LINE,
  TURNED_LINES,
  TURNED_REMARK_RANGE,
  TURNED_REMARK_CHANCE,
  REPATH_INTERVAL_MS,
  WORLD_WIDTH,
  WORLD_HEIGHT,
  DOOR_OPEN_MIN_MS,
  DOOR_OPEN_MAX_MS,
  DOOR_CLOSE_MS,
  DOOR_LOCK_MIN_MS,
  DOOR_LOCK_MAX_MS,
  DOOR_BEG_MS,
  DOOR_BEG_LINES,
  DOOR_BEG_SPEECH_MS,
  DOOR_BEG_SPEECH_MIN_MS,
  DOOR_BEG_SPEECH_MAX_MS,
  DOOR_PLEA_HEARING,
  DOOR_ATTACK_INTERVAL_MS,
  DOOR_ZOMBIE_DAMAGE,
  DOOR_NPC_UNLOCK_MS,
  DOOR_KICK_MS,
  DOOR_REENGAGE_MS,
  DOOR_VS_HUMAN_RANGE,
  FRESH_ZOMBIE_MS,
  DOOR_FRENZY_SURVIVORS,
  DOOR_ALSO_LOCK_RANGE,
  DOOR_ASK_OTHERS_CHANCE,
  DOOR_ASK_MS,
  DOOR_ASK_LINES,
  DOOR_BLOCKED_WAIT_MS,
  DOOR_STEP_ASIDE_SPEED,
  ZOMBIE_STUCK_CHECK_MS,
  ZOMBIE_STUCK_MIN_PROGRESS,
  ZOMBIE_STUCK_DOOR_MS,
  ZOMBIE_STUCK_DOOR_RANGE,
  ZOMBIE_HURT_THRESHOLD,
  ZOMBIE_HURT_SLOWEST,
  ZOMBIE_ROOM_CLEAR_MS,
  ZOMBIE_ABANDON_DOOR_RANGE,
  GRAPPLE_NO_ESCAPE_AT,
  OFFICER_REFUGE_RANGE,
  OFFICER_REFUGE_GAP,
  DOOR_SLAM_CHANCE,
  DOOR_SLAM_RANGE,
  DOOR_WARN_CHANCE,
  DOOR_WARN_HEEDED,
  DOOR_WARN_DEFIED_CHANCE,
  DOOR_WARN_MS,
  DOOR_WARN_LINES,
  DOOR_DEFY_LINES,
} from '../../shared/constants.js';
import { angleDelta, clamp, segmentRectT, turnToward } from './geometry.js';
import { collect, dropHeld, heldGunSlot, heldItem, type Inventory } from './inventory.js';
import { ITEMS, type ItemId } from '../../shared/items.js';
import type { PickupState } from '../../shared/types.js';
import {
  addPlea,
  alertZombiesToDoor,
  clearExpiredPleas,
  damageDoor,
  doorsNear,
  doorSide,
  canWorkLockFrom,
  someoneInDoorway,
  doorWantsClearing,
  insideOfDoor,
  isDoorShut,
  lockDoor,
  openDoor,
  shutDoor,
  unlockDoor,
} from './doors.js';
import {
  buildingIndexAt,
  damageWindow,
  doorsOf,
  hasLineOfSight,
  hasWallClearPath,
  isInBush,
  isWindowIntact,
  newAiState,
  rollSpeedMul,
  speedAt,
  type AiState,
  type Entity,
  type World,
} from './world.js';
import { fire, fireHeld } from './combat.js';

function getAi(world: World, e: Entity, now: number): AiState {
  let state = world.ai.get(e.id);
  if (!state) {
    state = newAiState(now, e.x, e.y);
    world.ai.set(e.id, state);
  }
  return state;
}

export function computeFrozen(world: World): Set<string> {
  const frozen = new Set<string>();
  for (const [targetId, session] of world.grapples) {
    frozen.add(targetId);
    for (const zombieId of session.zombieIds) frozen.add(zombieId);
  }
  return frozen;
}

/**
 * Heading toward a goal, routing around buildings when the straight line is
 * blocked. Paths are cached and recomputed on an interval under a global
 * per-tick budget, so a hundred chasers can't stall the loop.
 */
function headingToward(world: World, e: Entity, state: AiState, gx: number, gy: number, now: number): number {
  if (hasWallClearPath(world, e.x, e.y, gx, gy)) {
    state.path = null;
    return Math.atan2(gy - e.y, gx - e.x);
  }

  const goalMoved = Math.hypot(gx - state.pathGoalX, gy - state.pathGoalY) > 60;
  const needsPath = !state.path || state.pathIndex >= state.path.length || goalMoved;

  if (needsPath && now >= state.nextPathAt && world.pathBudget > 0) {
    world.pathBudget--;
    state.nextPathAt = now + REPATH_INTERVAL_MS;
    state.pathGoalX = gx;
    state.pathGoalY = gy;
    state.path = world.nav.findPath(e.x, e.y, gx, gy);
    state.pathIndex = 0;
  }

  const path = state.path;
  if (!path || state.pathIndex >= path.length) return slideToward(world, e, gx, gy);

  let waypoint = path[state.pathIndex];
  while (Math.hypot(waypoint.x - e.x, waypoint.y - e.y) < 22) {
    state.pathIndex++;
    if (state.pathIndex >= path.length) return slideToward(world, e, gx, gy);
    waypoint = path[state.pathIndex];
  }
  return Math.atan2(waypoint.y - e.y, waypoint.x - e.x);
}

/**
 * Fallback for when there's no usable path — either the search failed or we're
 * waiting on the per-tick budget. Walking blindly at the goal just grinds a
 * face into the nearest wall, so fan out until something ahead is walkable.
 */
function slideToward(world: World, e: Entity, gx: number, gy: number): number {
  const direct = Math.atan2(gy - e.y, gx - e.x);
  // The probe has to be reachable in a straight line, not merely empty. Testing
  // only the far end called a direction clear whenever the open ground on the
  // other side of a wall happened to be walkable — which is exactly how people
  // ended up grinding face-first into that wall.
  const clear = (angle: number) => {
    const px = e.x + Math.cos(angle) * 42;
    const py = e.y + Math.sin(angle) * 42;
    return !world.nav.isBlocked(px, py) && world.nav.lineClear(e.x, e.y, px, py);
  };

  if (clear(direct)) return direct;
  for (const offset of [0.55, -0.55, 1.1, -1.1, 1.7, -1.7, 2.4, -2.4]) {
    if (clear(direct + offset)) return direct + offset;
  }
  return direct;
}

function senseThreats(world: World, e: Entity, state: AiState, sight: number): void {
  const nearby = world.entityGrid.queryCircle(e.x, e.y, sight, new Set<Entity>());

  state.threatPoints.length = 0;
  let nearest: Entity | null = null;
  let nearestDist = Infinity;

  for (const other of nearby) {
    if (other.type !== 'zombie') continue;
    const dist = Math.hypot(other.x - e.x, other.y - e.y);
    if (dist > sight) continue;
    if (!hasLineOfSight(world, e.x, e.y, other.x, other.y)) continue;

    state.threatPoints.push({ x: other.x, y: other.y });
    if (dist < nearestDist) {
      nearestDist = dist;
      nearest = other;
    }
  }

  state.threatCount = state.threatPoints.length;

  // Stick with whoever we were already onto unless something is meaningfully
  // closer. Taking the nearest outright made officers flick between two
  // zombies at near-equal range, re-aiming every perception tick and hitting
  // neither of them.
  if (state.targetId !== null && nearest !== null && state.targetId !== nearest.id) {
    const held = world.entities.get(state.targetId);
    if (held && held.type === 'zombie') {
      const heldDist = Math.hypot(held.x - e.x, held.y - e.y);
      if (heldDist <= sight && hasLineOfSight(world, e.x, e.y, held.x, held.y)) {
        if (nearestDist > heldDist * TARGET_SWITCH_MARGIN) {
          nearest = held;
          nearestDist = heldDist;
        }
      }
    }
  }

  state.targetId = nearest ? nearest.id : null;
  if (nearest) {
    state.threatX = nearest.x;
    state.threatY = nearest.y;
  }
}

/**
 * Score candidate headings and take the roomiest one. Sampling directions
 * (rather than summing repulsion vectors) is what lets a human dart *past* a
 * zombie down an open lane instead of stalling on the zero-vector between two
 * of them. The hysteresis term keeps the choice stable frame to frame.
 */
function safestHeading(world: World, e: Entity, state: AiState): number {
  let bestAngle = state.heading;
  let bestScore = -Infinity;

  for (let i = 0; i < FLEE_DIRECTIONS; i++) {
    const angle = (i / FLEE_DIRECTIONS) * Math.PI * 2;
    const px = e.x + Math.cos(angle) * FLEE_PROBE_DIST;
    const py = e.y + Math.sin(angle) * FLEE_PROBE_DIST;

    let clearance = Infinity;
    for (const threat of state.threatPoints) {
      const d = Math.hypot(px - threat.x, py - threat.y);
      if (d < clearance) clearance = d;
    }
    if (clearance === Infinity) clearance = 400;

    let score = Math.min(clearance, 400);
    if (world.nav.isBlocked(px, py) || !world.nav.lineClear(e.x, e.y, px, py)) score -= 500;
    score += Math.cos(angle - state.heading) * 45;

    // Steer off the map edge before they end up grinding along it.
    const edgeGap = Math.min(px, py, WORLD_WIDTH - px, WORLD_HEIGHT - py);
    if (edgeGap < BOUNDARY_AVOID_DIST) score -= (BOUNDARY_AVOID_DIST - edgeGap) * 2.4;

    if (score > bestScore) {
      bestScore = score;
      bestAngle = angle;
    }
  }
  return bestAngle;
}

/**
 * A bearing to break out on after scraping along something. Only directions
 * that are genuinely walkable are considered, and the heading that just failed
 * is penalised — the old random turn was as likely to point back into the wall
 * as away from it, which is what left people grinding there for seconds.
 */
function breakoutHeading(world: World, e: Entity, state: AiState): number {
  let bestAngle = state.heading + Math.PI;
  let bestScore = -Infinity;
  const away = Math.atan2(e.y - state.threatY, e.x - state.threatX);

  for (let i = 0; i < FLEE_DIRECTIONS; i++) {
    const angle = (i / FLEE_DIRECTIONS) * Math.PI * 2;
    const px = e.x + Math.cos(angle) * FLEE_PROBE_DIST;
    const py = e.y + Math.sin(angle) * FLEE_PROBE_DIST;
    if (world.nav.isBlocked(px, py) || !world.nav.lineClear(e.x, e.y, px, py)) continue;

    let score = Math.cos(angle - away) * 120;
    score -= Math.cos(angle - state.heading) * 90;
    score += world.danger.opennessAt(px, py) * 60;

    const edgeGap = Math.min(px, py, WORLD_WIDTH - px, WORLD_HEIGHT - py);
    if (edgeGap < BOUNDARY_AVOID_DIST) score -= (BOUNDARY_AVOID_DIST - edgeGap) * 2;

    if (score > bestScore) {
      bestScore = score;
      bestAngle = angle;
    }
  }
  return bestAngle;
}

/**
 * Notice when someone running for their life is getting nowhere, and commit
 * them to a bearing that actually goes somewhere. Returns true when it has
 * taken the tick over.
 */
function unstickTick(
  world: World,
  e: Entity,
  state: AiState,
  now: number,
  dt: number,
  speed: number,
): boolean {
  if (now >= state.lastUnstickCheck) {
    state.lastUnstickCheck = now + UNSTICK_CHECK_MS;
    const progress = Math.hypot(e.x - state.unstickX, e.y - state.unstickY);
    if (progress < UNSTICK_MIN_PROGRESS && now >= state.unstickUntil) {
      state.unstickHeading = breakoutHeading(world, e, state);
      state.unstickUntil = now + UNSTICK_COMMIT_MS;
      // Whatever they were making for, they couldn't get to it from here.
      state.path = null;
      state.escapeX = null;
      state.escapeY = null;
      state.escapeUntil = 0;
    }
    state.unstickX = e.x;
    state.unstickY = e.y;
  }

  if (now < state.unstickUntil) {
    step(world, e, state, state.unstickHeading, speed, HUMAN_TURN_RATE, dt, now);
    return true;
  }
  return false;
}

/**
 * About to walk into something while merely wandering or searching. There is
 * nothing on the far side worth pressing for, so turn on the spot and go the
 * other way — `unstickTick` gets there eventually, but only after a second of
 * grinding along the wall, which is what it looks like from the outside.
 *
 * Reverse first, then fan out either side of that: a straight reversal in a
 * corner only picks the other wall. Returns true if it turned.
 */
function turnAtWall(world: World, e: Entity, state: AiState): boolean {
  const aheadX = e.x + Math.cos(state.heading) * WALL_TURN_PROBE;
  const aheadY = e.y + Math.sin(state.heading) * WALL_TURN_PROBE;
  if (!world.nav.isBlocked(aheadX, aheadY)) return false;

  const back = state.heading + Math.PI;
  for (const offset of [0, 0.6, -0.6, 1.2, -1.2, 1.8, -1.8, 2.4, -2.4]) {
    const angle = back + offset;
    const px = e.x + Math.cos(angle) * WALL_TURN_PROBE;
    const py = e.y + Math.sin(angle) * WALL_TURN_PROBE;
    if (world.nav.isBlocked(px, py)) continue;
    state.heading = angle;
    e.facing = angle;
    return true;
  }

  // Boxed in on every bearing. Turn round anyway — collision will sort the
  // rest out, and facing the way you came beats facing the wall.
  state.heading = back;
  e.facing = back;
  return true;
}

/**
 * The same thing for anyone steering toward a wander target: turn away, and
 * throw the target away too, or they'd steer straight back into it next tick.
 */
function turnAtWallAndRepick(
  world: World,
  e: Entity,
  state: AiState,
  now: number,
  radius = HUMAN_WANDER_RADIUS,
): boolean {
  if (!turnAtWall(world, e, state)) return false;
  pickWanderTarget(world, e, state, now, false, radius);
  state.path = null;
  state.nextPathAt = 0;
  return true;
}

function pickWanderTarget(
  world: World,
  e: Entity,
  state: AiState,
  now: number,
  pause = true,
  radius = HUMAN_WANDER_RADIUS,
): void {
  const ATTEMPTS = 6;

  // Someone who lives here potters about their own rooms. Picking from the
  // open-world ring instead is what emptied every building within a minute of
  // the round starting.
  const home = state.homeBuilding >= 0 ? world.map.buildings[state.homeBuilding] : undefined;
  if (home) {
    for (let i = 0; i < ATTEMPTS; i++) {
      const r = home.rects[Math.floor(Math.random() * home.rects.length)];
      const x = r.x + 12 + Math.random() * Math.max(1, r.w - 24);
      const y = r.y + r.h / 2;
      if (world.nav.isBlocked(x, y) || !world.nav.isReachable(x, y)) continue;
      state.wanderX = x;
      state.wanderY = y;
      break;
    }
    state.path = null;
    state.nextPathAt = 0;
    state.pauseUntil = pause
      ? now + HUMAN_PAUSE_MIN_MS + Math.random() * (HUMAN_PAUSE_MAX_MS - HUMAN_PAUSE_MIN_MS)
      : 0;
    return;
  }

  for (let i = 0; i < ATTEMPTS; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 80 + Math.random() * radius;
    const x = clamp(e.x + Math.cos(angle) * dist, 60, WORLD_WIDTH - 60);
    const y = clamp(e.y + Math.sin(angle) * dist, 60, WORLD_HEIGHT - 60);
    if (i === ATTEMPTS - 1 || !world.nav.isBlocked(x, y)) {
      state.wanderX = x;
      state.wanderY = y;
      break;
    }
  }
  state.path = null;
  state.nextPathAt = 0;
  state.pauseUntil = pause
    ? now + HUMAN_PAUSE_MIN_MS + Math.random() * (HUMAN_PAUSE_MAX_MS - HUMAN_PAUSE_MIN_MS)
    : 0;
}

function step(
  world: World,
  e: Entity,
  state: AiState,
  desired: number,
  baseSpeed: number,
  turnRate: number,
  dt: number,
  now: number,
): void {
  state.heading = turnToward(state.heading, desired, turnRate * dt);
  let speed = baseSpeed * e.speedMul;
  if (now < state.slowUntil) speed *= state.slowMul;
  // A shot-up zombie drags: nothing until it's badly hurt, then falling off to
  // half pace as it approaches its last point of health.
  if (e.type === 'zombie') {
    const frac = e.health / (e.maxHealth || 1);
    if (frac < ZOMBIE_HURT_THRESHOLD) {
      const t = Math.max(0, frac) / ZOMBIE_HURT_THRESHOLD;
      speed *= ZOMBIE_HURT_SLOWEST + (1 - ZOMBIE_HURT_SLOWEST) * t;
    }
  }
  speed = speedAt(world, e.x, e.y, speed);
  e.x += Math.cos(state.heading) * speed * dt;
  e.y += Math.sin(state.heading) * speed * dt;
  e.facing = state.heading;
}

// ---------------------------------------------------------------- settling

function nearestOfType(world: World, e: Entity, type: Entity['type'], range: number): Entity | null {
  const nearby = world.entityGrid.queryCircle(e.x, e.y, range, new Set<Entity>());
  let best: Entity | null = null;
  let bestDist = Infinity;
  for (const other of nearby) {
    if (other.type !== type || other.id === e.id) continue;
    const d = Math.hypot(other.x - e.x, other.y - e.y);
    if (d < bestDist) {
      bestDist = d;
      best = other;
    }
  }
  return best;
}

function peersNearby(world: World, e: Entity): number {
  const nearby = world.entityGrid.queryCircle(e.x, e.y, GROUP_RADIUS, new Set<Entity>());
  let n = 0;
  for (const other of nearby) {
    if (other.id === e.id || other.type !== 'human') continue;
    if (Math.hypot(other.x - e.x, other.y - e.y) <= GROUP_RADIUS) n++;
  }
  return n;
}

function insideBuilding(world: World, x: number, y: number): boolean {
  return buildingIndexAt(world, x, y) >= 0;
}

/**
 * A reachable spot genuinely inside a building, as far from `awayFromX/Y` as
 * the footprint allows. The bounding-box centre is no good on its own: on an
 * L or T footprint it often lands in the outdoor notch, or on an interior
 * partition of a big building, and people then "settle" out in the street.
 */
function interiorPointOf(
  world: World,
  buildingIndex: number,
  awayFromX: number,
  awayFromY: number,
): { x: number; y: number } | null {
  const b = world.map.buildings[buildingIndex];
  if (!b) return null;

  let best: { x: number; y: number } | null = null;
  let bestDist = -Infinity;

  for (const r of b.rects) {
    // Row rects can span the whole building, so sample along them rather than
    // trusting one midpoint that may sit on a partition wall.
    for (const fx of [0.5, 0.25, 0.75]) {
      // Strictly inside a footprint rect is indoors by construction, so this
      // needs no point-in-building test — only that it's stood on and can be
      // walked to, which rules out interior partitions and sealed-off rooms.
      const x = r.x + r.w * fx;
      const y = r.y + r.h / 2;
      if (world.nav.isBlocked(x, y) || !world.nav.isReachable(x, y)) continue;
      const d = Math.hypot(x - awayFromX, y - awayFromY);
      if (d > bestDist) {
        bestDist = d;
        best = { x, y };
      }
    }
  }
  return best;
}

/** True when every way into this building has something stood in it. */
function entranceHeld(world: World, state: AiState, buildingIndex: number): boolean {
  if (buildingIndex < 0 || state.threatCount === 0) return false;
  const doors = doorsOf(world, buildingIndex);
  if (doors.length === 0) return false;

  for (const door of doors) {
    let held = false;
    for (const threat of state.threatPoints) {
      if (Math.hypot(threat.x - door.x, threat.y - door.y) < DOOR_BLOCK_RADIUS) {
        held = true;
        break;
      }
    }
    if (!held) return false; // this one is clear, so the building is still on
  }
  return true;
}

/**
 * Nearest doorway into a building that no visible zombie is standing in or
 * closer to than we are. Mirrors `exitPointFor`, which does the same test on
 * the way out.
 */
function openDoorInto(world: World, buildingIndex: number, e: Entity, state: AiState): boolean {
  const candidates = doorsOf(world, buildingIndex)
    .map((d) => ({ x: d.x, y: d.y, d: Math.hypot(d.x - e.x, d.y - e.y) }))
    .filter((c) => world.nav.isReachable(c.x, c.y))
    .sort((a, b) => a.d - b.d);

  for (const c of candidates) {
    let covered = false;
    for (const threat of state.threatPoints) {
      const threatDist = Math.hypot(c.x - threat.x, c.y - threat.y);
      if (threatDist < DOOR_BLOCK_RADIUS || threatDist < c.d - 20) {
        covered = true;
        break;
      }
    }
    if (!covered) return true;
  }
  return false;
}

/**
 * Pick a building to run inside of. Candidates are the nearest few that aren't
 * back past the zombie, don't already have one in them, and still have a way
 * in that isn't covered. `refugeBias` decides where in that shortlist this
 * person starts looking, so a crowd scatters into several doorways instead of
 * funnelling into one.
 */
function chooseShelter(world: World, e: Entity, state: AiState): boolean {
  state.shelterBuilding = -1;
  state.shelterX = null;
  state.shelterY = null;

  const awayX = e.x - state.threatX;
  const awayY = e.y - state.threatY;

  // Not everyone makes for the nearest door. Some have somewhere particular in
  // mind blocks away; others want somewhere substantial rather than the
  // nearest terraced house, and will pass a dozen front doors to get to it.
  const radius = state.shelterFar
    ? SHELTER_FAR_RADIUS
    : state.shelterLarge
      ? SHELTER_LARGE_RADIUS
      : SHELTER_SEARCH_RADIUS;

  // A few people don't want anywhere near here at all — they set off for the
  // building furthest from the thing they just saw, whatever the distance.
  if (state.shelterFurthest) {
    let best = -1;
    let bestScore = -Infinity;
    for (let i = 0; i < world.map.buildings.length; i++) {
      const b = world.map.buildings[i];
      const score = Math.hypot(b.x + b.w / 2 - state.threatX, b.y + b.h / 2 - state.threatY);
      if (score <= bestScore) continue;
      const goal = interiorPointOf(world, i, state.threatX, state.threatY);
      if (!goal) continue;
      bestScore = score;
      best = i;
    }
    if (best >= 0) {
      const goal = interiorPointOf(world, best, state.threatX, state.threatY)!;
      state.shelterBuilding = best;
      state.shelterX = goal.x;
      state.shelterY = goal.y;
      return true;
    }
  }

  const list = world.map.buildings;
  const gather = (bigOnly: boolean): Array<{ i: number; d: number }> => {
    const found: Array<{ i: number; d: number }> = [];
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (bigOnly && b.w * b.h < SHELTER_LARGE_MIN_AREA) continue;
      const dx = b.x + b.w / 2 - e.x;
      const dy = b.y + b.h / 2 - e.y;
      const dist = Math.hypot(dx, dy);
      if (dist > radius) continue;
      // Doubling back past the thing chasing us is worse than staying outside.
      if (dist > 90 && dx * awayX + dy * awayY < 0) continue;
      found.push({ i, d: dist });
    }
    return found;
  };

  // Somewhere big if that's what they want, but a door is a door if there's
  // nothing substantial within reach.
  let near = state.shelterLarge ? gather(true) : [];
  if (near.length === 0) near = gather(false);
  if (near.length === 0) return false;

  near.sort((a, b) => a.d - b.d);
  const shortlist = state.shelterFar
    ? near.slice(-SHELTER_CANDIDATES) // the far end of what's in range
    : near.slice(0, SHELTER_CANDIDATES);
  const start = Math.min(shortlist.length - 1, Math.floor(state.refugeBias * shortlist.length));

  // Which buildings the visible zombies are in, resolved once rather than per
  // candidate — this test walks the whole building list.
  const occupiedBy = state.threatPoints.map((t) => buildingIndexAt(world, t.x, t.y));

  for (let k = 0; k < shortlist.length; k++) {
    const index = shortlist[(start + k) % shortlist.length].i;

    if (occupiedBy.includes(index)) continue;
    if (!openDoorInto(world, index, e, state)) continue;

    const goal = interiorPointOf(world, index, state.threatX, state.threatY);
    if (!goal) continue;

    state.shelterBuilding = index;
    state.shelterX = goal.x;
    state.shelterY = goal.y;
    return true;
  }
  return false;
}

/** Choose somewhere to hole up based on this human's trait. */
function chooseSettleGoal(world: World, e: Entity, state: AiState): { x: number; y: number } | null {
  switch (state.settleTrait) {
    case 'officer': {
      const officer = nearestOfType(world, e, 'officer', 1200);
      return officer ? { x: officer.x, y: officer.y } : null;
    }
    case 'group': {
      const peer = nearestOfType(world, e, 'human', 800);
      return peer ? { x: peer.x, y: peer.y } : null;
    }
    case 'building': {
      // Stick with a refuge once chosen, or this turns into a random walk.
      if (state.refugeX !== null && state.refugeY !== null) {
        return { x: state.refugeX, y: state.refugeY };
      }
      const candidates = world.map.buildings
        .map((b, i) => ({ i, d: Math.hypot(b.x + b.w / 2 - e.x, b.y + b.h / 2 - e.y) }))
        .sort((a, b) => a.d - b.d)
        .slice(0, REFUGE_CANDIDATES);
      if (candidates.length === 0) return null;

      // Aim at a spot actually inside the footprint. Aiming at the bounding-box
      // centre left people standing in the notch of L-shaped blocks, never
      // registering as indoors and so never settling.
      const start = Math.min(candidates.length - 1, Math.floor(state.refugeBias * candidates.length));
      for (let k = 0; k < candidates.length; k++) {
        const index = candidates[(start + k) % candidates.length].i;
        const goal = interiorPointOf(world, index, state.threatX, state.threatY);
        if (!goal) continue;
        state.refugeX = goal.x;
        state.refugeY = goal.y;
        return goal;
      }
      return null;
    }
    case 'bush': {
      let best: { x: number; y: number } | null = null;
      let bestDist = Infinity;
      for (const bush of world.map.bushes) {
        const d = Math.hypot(bush.x - e.x, bush.y - e.y);
        if (d < bestDist) {
          bestDist = d;
          best = { x: bush.x, y: bush.y };
        }
      }
      return best;
    }
    default:
      return null; // roamers never settle deliberately
  }
}

function hasSettled(world: World, e: Entity, state: AiState): boolean {
  switch (state.settleTrait) {
    case 'officer': {
      const officer = nearestOfType(world, e, 'officer', 90);
      return officer !== null;
    }
    case 'group':
      return peersNearby(world, e) >= GROUP_MIN_PEERS;
    case 'building':
      return insideBuilding(world, e.x, e.y);
    case 'bush':
      return isInBush(world, e.x, e.y);
    default:
      return false;
  }
}

/**
 * Closest bush that is genuinely usable cover: big enough to swallow a person
 * whole, not already full, and not back past the thing chasing them. Without
 * the capacity check a dozen people pile into the same shrub.
 */
function nearestBushAwayFrom(world: World, e: Entity, state: AiState): { x: number; y: number } | null {
  let best: { x: number; y: number } | null = null;
  let bestDist = Infinity;
  const awayX = e.x - state.threatX;
  const awayY = e.y - state.threatY;

  for (const bush of world.map.bushes) {
    if (bush.r < BUSH_MIN_FIT_RADIUS) continue; // can't hide inside it

    const dx = bush.x - e.x;
    const dy = bush.y - e.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 520 || dist >= bestDist) continue;
    if (dist > 40 && dx * awayX + dy * awayY < 0) continue;

    // How many people this bush can actually swallow, and how many are in it.
    const capacity = Math.max(1, Math.floor((bush.r * bush.r) / (BUSH_OCCUPANT_SPACING * BUSH_OCCUPANT_SPACING)));
    let occupants = 0;
    const nearby = world.entityGrid.queryCircle(bush.x, bush.y, bush.r, new Set<Entity>());
    for (const other of nearby) {
      if (other.id === e.id || other.type !== 'human') continue;
      if (Math.hypot(other.x - bush.x, other.y - bush.y) <= bush.r) occupants++;
    }
    if (occupants >= capacity) continue; // full — keep looking

    bestDist = dist;
    best = { x: bush.x, y: bush.y };
  }
  return best;
}

/**
 * Choose a place to run *to*. Candidates are sampled on a ring, kept only if
 * they're walkable and connected, and scored on how far they are from danger
 * once walls are taken into account. The chosen spot is held for a beat so
 * they commit to it instead of dithering between two equally good options.
 */
function escapeDestination(
  world: World,
  e: Entity,
  state: AiState,
  now: number,
): { x: number; y: number } | null {
  if (state.escapeX !== null && state.escapeY !== null && now < state.escapeUntil) {
    // Drop it early if we've arrived, or if it stopped being safe.
    const reached = Math.hypot(state.escapeX - e.x, state.escapeY - e.y) < 60;
    if (!reached) return { x: state.escapeX, y: state.escapeY };
  }

  let best: { x: number; y: number } | null = null;
  let bestScore = -Infinity;

  for (let i = 0; i < ESCAPE_SAMPLES; i++) {
    const angle = (i / ESCAPE_SAMPLES) * Math.PI * 2;
    const x = clamp(e.x + Math.cos(angle) * ESCAPE_DISTANCE, 70, WORLD_WIDTH - 70);
    const y = clamp(e.y + Math.sin(angle) * ESCAPE_DISTANCE, 70, WORLD_HEIGHT - 70);
    if (world.nav.isBlocked(x, y) || !world.nav.isReachable(x, y)) continue;

    // Geodesic danger: how far this spot is from the nearest zombie *through
    // walkable space*, so cover between us and them actually counts.
    let clearance = world.danger.distanceAt(x, y);
    if (clearance === Infinity) clearance = DANGER_MAX_DISTANCE;

    let score = Math.min(clearance, DANGER_MAX_DISTANCE);
    // Prefer not doubling back past the thing chasing us.
    const away = Math.atan2(e.y - state.threatY, e.x - state.threatX);
    score += Math.cos(angle - away) * 60;
    // And prefer somewhere we can actually keep moving from.
    score += world.danger.opennessAt(x, y) * 40;

    if (score > bestScore) {
      bestScore = score;
      best = { x, y };
    }
  }

  if (!best) return null;
  state.escapeX = best.x;
  state.escapeY = best.y;
  state.escapeUntil = now + ESCAPE_COMMIT_MS;
  return best;
}

/** Index of the building a point genuinely sits inside, or -1. */
function buildingContaining(world: World, x: number, y: number): number {
  return buildingIndexAt(world, x, y);
}

/**
 * Nearest patch of open ground outside the building. Pathfinding to it routes
 * through a doorway on its own, which is what gets people out instead of
 * pressing them into the back wall.
 */
function exitPointFor(
  world: World,
  buildingIndex: number,
  e: Entity,
  state: AiState,
): { x: number; y: number } | null {
  // Aim at the actual doorways now that mapgen records them, rather than
  // guessing at points beyond the building's edges.
  const candidates = doorsOf(world, buildingIndex)
    .map((d) => ({ x: d.x, y: d.y, d: Math.hypot(d.x - e.x, d.y - e.y) }))
    .filter((c) => world.nav.isReachable(c.x, c.y))
    .sort((a, b) => a.d - b.d);

  // Never break for a way out that a zombie is standing in or closer to than
  // we are — that's just running into its arms.
  for (const c of candidates) {
    let covered = false;
    for (const threat of state.threatPoints) {
      const threatDist = Math.hypot(c.x - threat.x, c.y - threat.y);
      if (threatDist < DOOR_BLOCK_RADIUS || threatDist < c.d - 20) {
        covered = true;
        break;
      }
    }
    if (!covered) return { x: c.x, y: c.y };
  }
  return null; // every exit is covered — better to keep our distance inside
}

/**
 * Nudge a heading sideways when it would run straight into the zombie, so
 * people squeeze past it toward the door rather than colliding with it.
 */
function skirtThreat(world: World, e: Entity, state: AiState, desired: number): number {
  const dx = state.threatX - e.x;
  const dy = state.threatY - e.y;
  const dist = Math.hypot(dx, dy);
  if (dist > SKIRT_RANGE) return desired;

  const toThreat = Math.atan2(dy, dx);
  if (Math.abs(angleDelta(desired, toThreat)) > SKIRT_CONE) return desired;

  const clearAt = (angle: number) => {
    const px = e.x + Math.cos(angle) * 90;
    const py = e.y + Math.sin(angle) * 90;
    return !world.nav.isBlocked(px, py) && world.nav.lineClear(e.x, e.y, px, py);
  };

  // Prefer the side that puts more room between us and it.
  const side = angleDelta(desired, toThreat) > 0 ? -1 : 1;
  const swing = Math.PI / 2.6;
  if (clearAt(desired + side * swing)) return desired + side * swing;
  if (clearAt(desired - side * swing)) return desired - side * swing;
  return desired;
}

// ---------------------------------------------------------------- doors

/**
 * The door genuinely standing in this entity's way, or -1.
 *
 * This has to be the door they are walking *into*, not any door they happen to
 * be beside — testing proximity and facing alone had people opening every door
 * they strolled past along a wall, and then never going through to shut it.
 */
function doorInTheWay(world: World, e: Entity, state: AiState, now: number): number {
  const probe = e.radius + 16;
  const aheadX = e.x + Math.cos(state.heading) * probe;
  const aheadY = e.y + Math.sin(state.heading) * probe;

  let best = -1;
  let bestDist = Infinity;

  for (const index of doorsNear(world, e.x, e.y, probe + 24)) {
    if (!isDoorShut(world, index)) continue;
    // A door we just finished working is left alone for a moment. Without
    // this, whoever bolts a door is still stood against it facing it on the
    // next tick, and immediately starts drawing the bolt back again.
    if (index === state.doorIgnore && now < state.doorIgnoreUntil) continue;
    const door = world.doors[index]!;
    // Does the step we're about to take run into the slab?
    if (segmentRectT(e.x, e.y, aheadX, aheadY, door.rect) === null) continue;

    const spec = world.map.doors[index];
    const dist = Math.hypot(spec.x - e.x, spec.y - e.y);
    if (dist < bestDist) {
      bestDist = dist;
      best = index;
    }
  }
  return best;
}

/**
 * Stood in a doorway somebody wants to shut: step clear of the slab, along
 * whichever way out is nearer. Returns true when this took the tick over.
 */
function stepOutOfDoorway(world: World, e: Entity, state: AiState, now: number, dt: number): boolean {
  if (world.doorClearing.size === 0) return false;
  if (state.doorBusyUntil > 0) return false; // busy working a handle themselves

  for (const index of doorsNear(world, e.x, e.y, e.radius + 30)) {
    if (!doorWantsClearing(world, index, now)) continue;
    const door = world.doors[index];
    if (!door) continue;

    const slab = door.rect;
    const nx = clamp(e.x, slab.x, slab.x + slab.w);
    const ny = clamp(e.y, slab.y, slab.y + slab.h);
    if (Math.hypot(e.x - nx, e.y - ny) >= e.radius + 2) continue;

    // Out along the slab's short axis, whichever side is closer to open air.
    const spec = world.map.doors[index];
    const away = spec.horiz
      ? e.y < spec.y
        ? -Math.PI / 2
        : Math.PI / 2
      : e.x < spec.x
        ? Math.PI
        : 0;
    step(world, e, state, away, DOOR_STEP_ASIDE_SPEED, HUMAN_TURN_RATE * 3, dt, now);
    return true;
  }
  return false;
}

/** An open doorway this entity is about to step through, or -1. */
function doorBeingUsed(world: World, e: Entity, state: AiState): number {
  const probe = e.radius + 22;
  const aheadX = e.x + Math.cos(state.heading) * probe;
  const aheadY = e.y + Math.sin(state.heading) * probe;

  for (const index of doorsNear(world, e.x, e.y, probe + 24)) {
    const door = world.doors[index];
    if (!door || door.broken || !door.open) continue;
    // The slab rect doubles as the opening: it's the gap the door fills.
    if (segmentRectT(e.x, e.y, aheadX, aheadY, door.rect) === null) continue;
    return index;
  }
  return -1;
}

/**
 * A doorway with a zombie stood in it. Nobody should be queueing at a door
 * that something is currently eating somebody in — the way in is not worth it
 * while it's held, and there is always another building.
 */
function doorContested(world: World, state: AiState, index: number): boolean {
  const spec = world.map.doors[index];
  for (const threat of state.threatPoints) {
    if (Math.hypot(threat.x - spec.x, threat.y - spec.y) < DOOR_BLOCK_RADIUS) return true;
  }
  return false;
}

/**
 * Is there a zombie shut in here with us? Bolting a door with one of them on
 * your side of it is the one thing nobody should ever do.
 */
function threatSharesBuilding(world: World, e: Entity, state: AiState): boolean {
  const building = buildingIndexAt(world, e.x, e.y);
  if (building < 0) return false;

  // Any zombie in here counts, not only ones currently in view. Strictly they
  // shouldn't know about one two rooms away — but bolting themselves in with
  // it reads as a bug every time it happens, so they get the benefit.
  const b = world.map.buildings[building];
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const reach = Math.hypot(b.w, b.h) / 2 + 20;

  for (const other of world.entityGrid.queryCircle(cx, cy, reach, new Set<Entity>())) {
    if (other.type !== 'zombie') continue;
    if (buildingIndexAt(world, other.x, other.y) === building) return true;
  }
  return false;
}

/** Start working a door. Whatever they were doing is left exactly as it was. */
function beginDoorWork(
  world: World,
  e: Entity,
  state: AiState,
  index: number,
  action: 'open' | 'close' | 'lock' | 'unlock' | 'kick',
  now: number,
): void {
  const door = world.doors[index];
  if (!door) return;

  door.busyBy = e.id;
  state.doorIndex = index;
  state.doorAction = action;
  state.doorBusyUntil =
    now +
    (action === 'open'
      ? DOOR_OPEN_MIN_MS + Math.random() * (DOOR_OPEN_MAX_MS - DOOR_OPEN_MIN_MS)
      : action === 'lock'
        ? DOOR_LOCK_MIN_MS + Math.random() * (DOOR_LOCK_MAX_MS - DOOR_LOCK_MIN_MS)
        : action === 'unlock'
          ? DOOR_NPC_UNLOCK_MS
          : action === 'kick'
            ? DOOR_KICK_MS
            : DOOR_CLOSE_MS);

  const target = world.map.doors[index];
  state.heading = Math.atan2(target.y - e.y, target.x - e.x);
  e.facing = state.heading;
}

/** Finish whatever they were doing to a door. */
function finishDoorWork(world: World, e: Entity, state: AiState, now: number): void {
  const index = state.doorIndex;
  const action = state.doorAction;
  state.doorIndex = -1;
  state.doorAction = null;

  const door = index >= 0 ? world.doors[index] : null;
  if (door && door.busyBy === e.id) door.busyBy = null;
  if (!door || door.broken) return;

  // Done with this door for a beat, whatever we just did to it.
  state.doorIgnore = index;
  state.doorIgnoreUntil = now + DOOR_REENGAGE_MS;

  if (action === 'open') {
    openDoor(world, index);
    // Remember to deal with it once we're through to the other side.
    const frightened = state.mode === 'flee' || state.mode === 'retreat';
    if (frightened ? state.locksDoors : state.closesDoors) {
      state.doorFollowUp = index;
      // Someone getting away from a zombie shuts it *and* throws the bolt.
      state.doorFollowUpLock = frightened;
      state.doorFollowUpSide = doorSide(world, index, e.x, e.y);
    }
  } else if (action === 'close') {
    // Never shut a door on somebody stood in the doorway. Wait for them to
    // clear — they're being nudged out meanwhile — and give up if they don't,
    // rather than cutting a couple in half at the threshold.
    if (someoneInDoorway(world, index, e.id)) {
      world.doorClearing.set(index, now + DOOR_BLOCKED_WAIT_MS);
      if (now < (state.doorWaitUntil || 0)) {
        beginDoorWork(world, e, state, index, 'close', now);
        return;
      }
      if (!state.doorWaitUntil) {
        state.doorWaitUntil = now + DOOR_BLOCKED_WAIT_MS;
        beginDoorWork(world, e, state, index, 'close', now);
        return;
      }
      // Waited long enough; leave it standing open.
      state.doorWaitUntil = 0;
      state.doorFollowUp = -1;
      state.doorFollowUpLock = false;
      return;
    }

    state.doorWaitUntil = 0;
    shutDoor(world, index, now);
    // Never bolt yourself in with one of them.
    if (state.doorFollowUpLock && !threatSharesBuilding(world, e, state)) {
      beginDoorWork(world, e, state, index, 'lock', now);
      return;
    }
    state.doorFollowUp = -1;
    state.doorFollowUpLock = false;
  } else if (action === 'lock') {
    if (threatSharesBuilding(world, e, state)) {
      state.doorFollowUp = -1;
      state.doorFollowUpLock = false;
      return;
    }
    lockDoor(world, index);
    state.doorFollowUp = -1;
    state.doorFollowUpLock = false;
    // Bolting a door is the end of the journey, not a step in it. Without
    // this they carried on with whatever they were walking toward, which for
    // an interior door meant unbolting it again a moment later to get to the
    // next room — having just shut themselves in on purpose.
    state.mode = 'settled';
    state.wanderX = e.x;
    state.wanderY = e.y;
    state.path = null;
    state.shelterBuilding = -1;
    state.shelterX = null;
    state.shelterY = null;
    warnTheRoom(world, e, state, index, now);
  } else if (action === 'kick') {
    // Straight off its hinges, whatever was left in it — the same thing a
    // player's boot does, so a bolted door isn't a wall to an officer.
    damageDoor(world, index, Number.MAX_SAFE_INTEGER);
    // Loud, and alerted *after* rather than before — the opposite of a slam.
    // Shutting a door blocks the very sight line the alert needs, so that has
    // to go first; kicking one opens it, so waiting is what lets the room
    // beyond hear it happen at all.
    alertZombiesToDoor(world, index, now);
  } else if (action === 'unlock') {
    unlockDoor(world, index);
    // Drawn the bolt; now actually open it.
    beginDoorWork(world, e, state, index, 'open', now);
  }
}

/**
 * Having bolted the door, some people turn round and tell the room to stay
 * put. Most of those who hear it take it as settled and stop leaving the
 * building at all; a very few say what they think of being told.
 */
function warnTheRoom(world: World, e: Entity, state: AiState, index: number, now: number): void {
  const building = buildingIndexAt(world, e.x, e.y);
  if (building < 0) return;

  // Telling the room to stay indoors is absurd with one of them in here. If
  // anything is inside with us, that is not the moment for reassurance.
  if (state.threatCount > 0) return;
  for (const threat of state.threatPoints) {
    if (buildingIndexAt(world, threat.x, threat.y) === building) return;
  }

  // Whichever door is next to this one wants bolting as well.
  askForNeighbourDoor(world, e, state, index, building, now);

  if (Math.random() >= DOOR_WARN_CHANCE) return;

  if (!world.speech.has(e.id)) {
    world.speech.set(e.id, {
      text: DOOR_WARN_LINES[Math.floor(Math.random() * DOOR_WARN_LINES.length)],
      until: now + DOOR_WARN_MS,
    });
  }

  const heard = world.entityGrid.queryCircle(e.x, e.y, DOOR_PLEA_HEARING, new Set<Entity>());
  for (const other of heard) {
    if (other.id === e.id || other.type !== 'human') continue;
    if (buildingIndexAt(world, other.x, other.y) !== building) continue;
    const theirs = world.ai.get(other.id);
    if (!theirs) continue;

    if (Math.random() < DOOR_WARN_HEEDED) {
      // They'll move between rooms, but they're not going out there.
      theirs.homeBuilding = building;
    } else if (Math.random() < DOOR_WARN_DEFIED_CHANCE && !world.speech.has(other.id)) {
      world.speech.set(other.id, {
        text: DOOR_DEFY_LINES[Math.floor(Math.random() * DOOR_DEFY_LINES.length)],
        until: now + DOOR_WARN_MS,
      });
    }
  }
}

/**
 * Deal with the door in front of them, if there is one. Returns true when this
 * has taken the tick over — the caller's goal is untouched either way, so they
 * carry on to wherever they were going the moment the door swings.
 */
function doorTick(world: World, e: Entity, state: AiState, now: number, dt: number): boolean {
  // Mid-handle. Stand there and work it.
  if (state.doorBusyUntil > 0) {
    if (now < state.doorBusyUntil) return true;
    state.doorBusyUntil = 0;
    finishDoorWork(world, e, state, now);
    return true;
  }

  // Through the door we opened: shut it behind us, and lock it if we're
  // getting away from something.
  if (state.doorFollowUp >= 0) {
    const index = state.doorFollowUp;
    const door = world.doors[index];
    const spec = world.map.doors[index];
    const gone = Math.hypot(spec.x - e.x, spec.y - e.y);

    const crossed = doorSide(world, index, e.x, e.y) !== state.doorFollowUpSide;

    // Somebody bolting themselves in will walk back to the door to do it;
    // somebody merely closing up after themselves won't cross a room for it.
    const giveUp = state.doorFollowUpLock ? 300 : 170;
    const reach = state.doorFollowUpLock ? 150 : 64;

    if (!door || door.broken || !door.open || gone > giveUp) {
      // Gone, already shut by someone else, or too far to bother.
      state.doorFollowUp = -1;
      state.doorFollowUpLock = false;
    } else if (crossed && (door.busyBy === null || door.busyBy === e.id)) {
      if (gone < reach) {
        beginDoorWork(world, e, state, index, 'close', now);
        return true;
      }
      // Far enough in that they have to come back and see to it.
      const desired = headingToward(world, e, state, spec.x, spec.y, now);
      step(world, e, state, desired, HUMAN_FLEE_SPEED, HUMAN_TURN_RATE, dt, now);
      return true;
    }
  }

  // A zombie in sight and a door standing open: get it shut. This is the one
  // case where the door *is* the goal rather than something in the way of it.
  if (state.doorSlam >= 0) {
    const index = state.doorSlam;
    const door = world.doors[index];
    const spec = world.map.doors[index];
    const gap = Math.hypot(spec.x - e.x, spec.y - e.y);

    if (!door || door.broken || !door.open || gap > DOOR_SLAM_RANGE * 1.5) {
      state.doorSlam = -1;
    } else if (gap <= e.radius + 26) {
      state.doorSlam = -1;
      if (door.busyBy === null || door.busyBy === e.id) {
        state.doorFollowUpLock = state.locksDoors;
        beginDoorWork(world, e, state, index, 'close', now);
        return true;
      }
    } else {
      const desired = headingToward(world, e, state, spec.x, spec.y, now);
      step(world, e, state, desired, HUMAN_FLEE_SPEED, HUMAN_TURN_RATE, dt, now);
      return true;
    }
  }

  if (state.threatCount > 0 && state.doorSlam < 0 && state.slamsDoors && now >= state.nextSlamCheck) {
    state.nextSlamCheck = now + 900;
    const inside = buildingIndexAt(world, e.x, e.y) >= 0;
    if (inside) {
      let best = -1;
      let bestGap = DOOR_SLAM_RANGE;
      for (const index of doorsNear(world, e.x, e.y, DOOR_SLAM_RANGE)) {
        const door = world.doors[index];
        if (!door || door.broken || !door.open) continue;
        if (door.busyBy !== null && door.busyBy !== e.id) continue;
        const spec = world.map.doors[index];
        const gap = Math.hypot(spec.x - e.x, spec.y - e.y);
        if (gap < bestGap) {
          bestGap = gap;
          best = index;
        }
      }
      if (best >= 0) state.doorSlam = best;
    }
  }

  // Stepping through a doorway that's already standing open. Shutting it is
  // about going through it, not about having been the one to open it —
  // without this, every door drifts open and stays that way.
  if (state.doorFollowUp < 0) {
    const through = doorBeingUsed(world, e, state);
    if (through >= 0) {
      const frightened = state.mode === 'flee' || state.mode === 'retreat';
      if (frightened ? state.locksDoors : state.closesDoors) {
        state.doorFollowUp = through;
        state.doorFollowUpLock = frightened;
        state.doorFollowUpSide = doorSide(world, through, e.x, e.y);
      }
    }
  }

  const ahead = doorInTheWay(world, e, state, now);
  if (ahead < 0) return false;

  const door = world.doors[ahead];
  if (!door || (door.busyBy !== null && door.busyBy !== e.id)) return false;

  // Something is stood in this doorway. Don't crowd in behind whoever it is
  // eating — go and find another way in.
  if (state.threatCount > 0 && doorContested(world, state, ahead)) {
    state.doorIgnore = ahead;
    state.doorIgnoreUntil = now + DOOR_REENGAGE_MS;
    abandonShelter(world, e, state, now);
    return false;
  }

  if (door.locked) {
    // A door an officer bolted is left well alone — including by bot
    // officers, who are on the same side as whoever threw the bolt. They
    // reroute like everyone else rather than undoing a teammate's work.
    if (door.playerLocked) return false;

    // An officer has a boot. Where a civilian hammers on a locked door and
    // hopes, a bot takes it off its hinges — but only from the side it can't
    // simply unbolt, which is the same rule the player's prompt follows.
    if (world.bots.has(e.id) && !canWorkLockFrom(world, ahead, e.x, e.y)) {
      beginDoorWork(world, e, state, ahead, 'kick', now);
      return true;
    }

    // From the inside you can draw the bolt back — but only if you actually
    // mean to go through it. Somebody holed up, or who has been told to stay
    // in, does not unbolt the way out; between rooms is another matter.
    if (canWorkLockFrom(world, ahead, e.x, e.y)) {
      const wayOut = door.insideSign !== 0;
      const stayingPut = state.mode === 'settled' || (wayOut && state.homeBuilding >= 0);
      if (stayingPut) {
        state.doorIgnore = ahead;
        state.doorIgnoreUntil = now + DOOR_REENGAGE_MS;
        return false;
      }
      beginDoorWork(world, e, state, ahead, 'unlock', now);
      return true;
    }

    // Nobody knows a door is locked until they've tried it.
    if (!state.refusedDoors.includes(ahead)) state.refusedDoors.push(ahead);
    if (state.refusedDoors.length > 6) state.refusedDoors.shift();
    handleLockedDoor(world, e, state, ahead, now);
    return state.begDoor === ahead;
  }

  beginDoorWork(world, e, state, ahead, 'open', now);
  return true;
}

/**
 * A locked door, and a zombie somewhere behind. Beg to be let in, or give it up
 * and go and find another way inside.
 */
function handleLockedDoor(world: World, e: Entity, state: AiState, index: number, now: number): void {
  const frightened = state.mode === 'flee' || state.mode === 'retreat' || state.sawZombie;

  if (frightened && state.begsAtDoors) {
    state.begDoor = index;
    state.begUntil = now + DOOR_BEG_MS;
    addPlea(world, index, state.begUntil);
    return;
  }

  // Somewhere else, then. Drop this building and pick another.
  abandonShelter(world, e, state, now);
  if (!frightened) pickWanderTarget(world, e, state, now, false);
}

/** Give up on the building we were making for and look again next scan. */
function abandonShelter(world: World, e: Entity, state: AiState, now: number): void {
  state.shelterBuilding = -1;
  state.shelterX = null;
  state.shelterY = null;
  state.nextShelterScanAt = 0;
  state.refugeX = null;
  state.refugeY = null;
  state.path = null;
  state.escapeX = null;
  state.escapeY = null;
  state.escapeUntil = 0;
}

/** Standing at a locked door shouting to be let in. */
function begTick(world: World, e: Entity, state: AiState, now: number, dt: number): boolean {
  if (state.begDoor < 0) return false;

  const index = state.begDoor;
  const door = world.doors[index];
  const spec = world.map.doors[index];

  // It opened, or it's gone, or they've given up.
  if (!door || door.open || door.broken || !door.locked || now >= state.begUntil) {
    state.begDoor = -1;
    return false;
  }

  // Nobody begs to be let into a room they're already standing in — from this
  // side they can simply work the lock, which `doorTick` will now do.
  if (insideOfDoor(world, index, e.x, e.y)) {
    state.begDoor = -1;
    return false;
  }

  // Most hold their ground even with one on top of them. The rest bolt.
  if (state.threatCount > 0 && !state.begHolds) {
    state.begDoor = -1;
    return false;
  }

  addPlea(world, index, state.begUntil);

  if (now >= state.nextBegSpeechAt) {
    state.nextBegSpeechAt =
      now + DOOR_BEG_SPEECH_MIN_MS + Math.random() * (DOOR_BEG_SPEECH_MAX_MS - DOOR_BEG_SPEECH_MIN_MS);
    if (!world.speech.has(e.id)) {
      world.speech.set(e.id, {
        text: DOOR_BEG_LINES[Math.floor(Math.random() * DOOR_BEG_LINES.length)],
        until: now + DOOR_BEG_SPEECH_MS,
      });
    }
  }

  // Stay at the door, hammering on it.
  const gap = Math.hypot(spec.x - e.x, spec.y - e.y);
  state.heading = Math.atan2(spec.y - e.y, spec.x - e.x);
  e.facing = state.heading;
  if (gap > e.radius + 24) {
    step(world, e, state, state.heading, HUMAN_FLEE_SPEED, HUMAN_TURN_RATE, dt, now);
  }
  return true;
}

/**
 * Someone indoors hearing a stranger at the door. Most leave it shut; the few
 * who don't go and let them in.
 */
function answerPleaTick(world: World, e: Entity, state: AiState, now: number, dt: number): boolean {
  if (state.answeringDoor < 0) {
    if (!state.opensForStrangers || world.doorPleas.size === 0) return false;
    if (state.threatCount > 0) return false; // rather busy

    const building = buildingIndexAt(world, e.x, e.y);
    if (building < 0) return false;

    for (const [index, until] of world.doorPleas) {
      if (now >= until) continue;
      const door = world.doors[index];
      if (!door || !door.locked || door.open) continue;
      const spec = world.map.doors[index];
      if (spec.building !== building && !spec.interior) continue;
      if (Math.hypot(spec.x - e.x, spec.y - e.y) > DOOR_PLEA_HEARING) continue;
      state.answeringDoor = index;
      break;
    }
    if (state.answeringDoor < 0) return false;
  }

  const index = state.answeringDoor;
  const door = world.doors[index];
  const spec = world.map.doors[index];
  if (!door || door.open || door.broken || !door.locked || door.playerLocked) {
    state.answeringDoor = -1;
    return false;
  }

  const gap = Math.hypot(spec.x - e.x, spec.y - e.y);
  if (gap > e.radius + 22) {
    const desired = headingToward(world, e, state, spec.x, spec.y, now);
    step(world, e, state, desired, HUMAN_WALK_SPEED * 1.4, HUMAN_TURN_RATE, dt, now);
    return true;
  }

  if (!canWorkLockFrom(world, index, e.x, e.y)) return true; // still on our way round
  if (door.busyBy !== null && door.busyBy !== e.id) return true; // wait their turn
  beginDoorWork(world, e, state, index, 'unlock', now);
  state.answeringDoor = -1;
  world.doorPleas.delete(index);
  return true;
}

/**
 * Having bolted one door, the other one right there wants doing too. Most go
 * and see to it themselves; a few call out for somebody else to.
 */
function askForNeighbourDoor(
  world: World,
  e: Entity,
  state: AiState,
  justLocked: number,
  building: number,
  now: number,
): void {
  let best = -1;
  let bestGap = DOOR_ALSO_LOCK_RANGE;

  for (const index of doorsNear(world, e.x, e.y, DOOR_ALSO_LOCK_RANGE)) {
    if (index === justLocked) continue;
    const door = world.doors[index];
    if (!door || door.broken || door.locked) continue;
    if (door.busyBy !== null && door.busyBy !== e.id) continue;
    // Only a way into this building is worth bolting behind us.
    if (!canWorkLockFrom(world, index, e.x, e.y)) continue;

    const spec = world.map.doors[index];
    const gap = Math.hypot(spec.x - e.x, spec.y - e.y);
    if (gap < bestGap) {
      bestGap = gap;
      best = index;
    }
  }
  if (best < 0) return;

  if (Math.random() < DOOR_ASK_OTHERS_CHANCE) {
    // Rarely, they'd rather somebody else did it.
    if (!world.speech.has(e.id)) {
      world.speech.set(e.id, {
        text: DOOR_ASK_LINES[Math.floor(Math.random() * DOOR_ASK_LINES.length)],
        until: now + DOOR_ASK_MS,
      });
    }
    world.lockRequests.set(best, now + DOOR_ASK_MS * 4);
    return;
  }

  state.lockAlso = best;
}

/**
 * Going to bolt another door — either the one next to the one we just did, or
 * one somebody called out about.
 */
function lockAlsoTick(world: World, e: Entity, state: AiState, now: number, dt: number): boolean {
  if (state.lockAlso < 0) {
    if (world.lockRequests.size === 0 || state.threatCount > 0) return false;
    // Someone asked. Anyone indoors and near enough may take it on.
    for (const [index, until] of world.lockRequests) {
      if (now >= until) continue;
      const door = world.doors[index];
      if (!door || door.broken || door.locked) continue;
      if (!canWorkLockFrom(world, index, e.x, e.y)) continue;
      const spec = world.map.doors[index];
      if (Math.hypot(spec.x - e.x, spec.y - e.y) > DOOR_PLEA_HEARING) continue;
      state.lockAlso = index;
      world.lockRequests.delete(index);
      break;
    }
    if (state.lockAlso < 0) return false;
  }

  const index = state.lockAlso;
  const door = world.doors[index];
  const spec = world.map.doors[index];
  if (!door || door.broken || door.locked || (door.busyBy !== null && door.busyBy !== e.id)) {
    state.lockAlso = -1;
    return false;
  }

  const gap = Math.hypot(spec.x - e.x, spec.y - e.y);
  if (gap > e.radius + 22) {
    const desired = headingToward(world, e, state, spec.x, spec.y, now);
    step(world, e, state, desired, HUMAN_WALK_SPEED * 1.5, HUMAN_TURN_RATE, dt, now);
    return true;
  }

  state.lockAlso = -1;
  if (door.open) {
    state.doorFollowUpLock = true;
    beginDoorWork(world, e, state, index, 'close', now);
  } else {
    beginDoorWork(world, e, state, index, 'lock', now);
  }
  return true;
}

/** Both halves of a pair let go at once — a hand-hold has two ends. */
function releaseHands(world: World, state: AiState, partnerId: string): void {
  state.handHeld = false;
  const partnerState = world.ai.get(partnerId);
  if (partnerState) partnerState.handHeld = false;
}

/**
 * Everything to do with holding on to someone. Returns true when it has taken
 * this tick over — the follower staying in step, or either half refusing to
 * let go of a partner who has been seized.
 *
 * Letting go is rolled once per moment that would test it, never per tick, so
 * "rare" stays rare rather than compounding to a certainty over a few seconds.
 */
function updateHandHold(world: World, e: Entity, state: AiState, now: number, dt: number): boolean {
  if (!state.handHeld || !state.partnerId) return false;

  const partner = world.entities.get(state.partnerId);
  if (!partner || partner.type !== 'human') {
    // Dead, or turned. Nothing left to hold.
    state.handHeld = false;
    return false;
  }

  // First sight of a zombie. The follower never reaches the flee branch that
  // normally sets `sawZombie`, so set it here — otherwise this roll comes up
  // again every tick and "rare" becomes a certainty within a second.
  if (state.threatCount > 0 && !state.sawZombie) {
    state.sawZombie = true;
    if (Math.random() < HAND_RELEASE_ON_SIGHT_CHANCE) {
      releaseHands(world, state, partner.id);
      return false;
    }
  }

  const seized = world.grapples.has(partner.id);
  if (seized && !state.sawPartnerSeized) {
    state.sawPartnerSeized = true;
    if (Math.random() < HAND_RELEASE_ON_GRAPPLE_CHANCE) {
      releaseHands(world, state, partner.id);
      return false;
    }
  } else if (!seized) {
    state.sawPartnerSeized = false;
  }

  // Held on through it: they stay at their partner's side while the thing
  // works at them, which is usually the end of them both.
  if (seized) {
    const gap = Math.hypot(partner.x - e.x, partner.y - e.y);
    state.heading = Math.atan2(partner.y - e.y, partner.x - e.x);
    e.facing = state.heading;
    if (gap > HAND_HOLD_DIST) {
      step(world, e, state, state.heading, HUMAN_WALK_SPEED, HUMAN_TURN_RATE * 2, dt, now);
    }
    return true;
  }

  const partnerState = world.ai.get(partner.id);

  if (state.coupleLead) {
    // Don't outrun the person you're holding on to.
    const gap = Math.hypot(partner.x - e.x, partner.y - e.y);
    if (gap > HAND_HOLD_DIST * 1.6) {
      state.slowUntil = now + 100;
      state.slowMul = HAND_LEADER_WAIT_MULTIPLIER;
    }
    return false; // the leader goes on deciding where they both go
  }

  // The follower walks at their partner's shoulder rather than steering for
  // itself, so the pair reads as one thing moving.
  const lead = partnerState ? partnerState.heading : partner.facing;
  const side = lead + (Math.PI / 2) * state.handSide;
  const holdX = partner.x + Math.cos(side) * HAND_HOLD_DIST;
  const holdY = partner.y + Math.sin(side) * HAND_HOLD_DIST;
  const toHold = Math.hypot(holdX - e.x, holdY - e.y);

  if (toHold > 8) {
    const fleeing =
      partnerState !== undefined && (partnerState.mode === 'flee' || partnerState.mode === 'retreat');
    const base = fleeing ? HUMAN_FLEE_SPEED : HUMAN_WALK_SPEED;
    const speed = toHold > HAND_HOLD_DIST ? base * HAND_CATCHUP_MULTIPLIER : base;
    const desired = headingToward(world, e, state, holdX, holdY, now);
    step(world, e, state, desired, speed, HUMAN_TURN_RATE * 2, dt, now);
  } else {
    // In step and level with them — face the way they're both going.
    state.heading = turnToward(state.heading, lead, HUMAN_TURN_RATE * dt);
    e.facing = state.heading;
  }
  return true;
}

/**
 * The first zombie somebody ever sees is worth a remark — but only while it is
 * still news. Once the outbreak has been running a few minutes everybody knows
 * what is about, and a street full of people acting surprised reads as broken.
 */
function remarkOnFirstSight(world: World, e: Entity, now: number): void {
  const age = now - world.startedAt;
  if (age > FIRST_SIGHT_WINDOW_MS) return;
  if (world.speech.has(e.id)) return;

  // One line needs an audience: it is only ever said where a player can
  // actually read it, and only in the opening couple of minutes.
  if (age < PJ_WINDOW_MS && Math.random() < PJ_CHANCE) {
    for (const id of world.playerIds) {
      const player = world.entities.get(id);
      if (!player || player.type !== 'officer') continue;
      if (Math.hypot(player.x - e.x, player.y - e.y) > PJ_PLAYER_RANGE) continue;
      world.speech.set(e.id, { text: PJ_LINE, until: now + FIRST_SIGHT_MS });
      return;
    }
  }

  if (Math.random() >= FIRST_SIGHT_CHANCE) return;
  world.speech.set(e.id, {
    text: FIRST_SIGHT_LINES[Math.floor(Math.random() * FIRST_SIGHT_LINES.length)],
    until: now + FIRST_SIGHT_MS,
  });
}

/** A visible neighbour who is currently running for their life. */
function spotRunner(world: World, e: Entity): Entity | null {
  const nearby = world.entityGrid.queryCircle(e.x, e.y, WITNESS_SIGHT_RADIUS, new Set<Entity>());
  for (const other of nearby) {
    if (other.id === e.id || other.type !== 'human') continue;
    const os = world.ai.get(other.id);
    if (!os || (os.mode !== 'flee' && os.mode !== 'retreat')) continue;
    if (Math.hypot(other.x - e.x, other.y - e.y) > WITNESS_SIGHT_RADIUS) continue;
    if (!hasLineOfSight(world, e.x, e.y, other.x, other.y)) continue;
    return other;
  }
  return null;
}

/**
 * Ask the people immediately around you to come with you. A shorter shout than
 * the rally — you are talking to the ones near you, not the whole street.
 */
export function followMe(world: World, leaderId: string, x: number, y: number): number {
  let count = 0;
  const now = Date.now();
  for (const e of world.entities.values()) {
    if (e.type !== 'human') continue;
    if (Math.hypot(e.x - x, e.y - y) > FOLLOW_RADIUS) continue;

    const state = world.ai.get(e.id) ?? newAiState(now, e.x, e.y);
    world.ai.set(e.id, state);
    state.followingId = leaderId;
    state.mode = 'wander';
    state.rallyX = null;
    state.rallyY = null;
    state.path = null;
    state.nextPathAt = 0;
    state.pauseUntil = 0;
    count++;
  }
  return count;
}

/** Tell whoever is following you to hold where they stand. */
export function holdPosition(world: World, leaderId: string): number {
  let count = 0;
  for (const e of world.entities.values()) {
    const state = world.ai.get(e.id);
    if (!state || state.followingId !== leaderId) continue;
    state.followingId = null;
    state.mode = 'rallied';
    state.rallyX = e.x;
    state.rallyY = e.y;
    state.path = null;
    state.nextPathAt = 0;
    count++;
  }
  return count;
}

/** Send every civilian within earshot to a point, and make them hold it. */
export function rallyHumans(world: World, originX: number, originY: number, x: number, y: number): number {
  let count = 0;
  const now = Date.now();
  for (const e of world.entities.values()) {
    if (e.type !== 'human') continue;
    if (Math.hypot(e.x - originX, e.y - originY) > RALLY_RADIUS) continue;

    const state = world.ai.get(e.id) ?? newAiState(now, e.x, e.y);
    world.ai.set(e.id, state);
    state.mode = 'rallied';
    state.rallyX = x;
    state.rallyY = y;
    state.path = null;
    state.nextPathAt = 0;
    state.pauseUntil = 0;
    count++;
  }
  return count;
}

// ---------------------------------------------------------------- humans

function updateHuman(world: World, e: Entity, state: AiState, now: number, dt: number): void {
  if (now >= state.nextSenseAt) {
    state.nextSenseAt = now + SENSE_INTERVAL_MS;
    senseThreats(world, e, state, HUMAN_SIGHT_RADIUS);
  }

  // Couples move as one and hardly ever let go, so this comes ahead of
  // everything else the follower might otherwise decide to do.
  if (updateHandHold(world, e, state, now, dt)) return;

  // Somebody is trying to shut a door this person is stood in. Get clear of
  // it — a couple pinned across a threshold otherwise holds it open for ever.
  if (stepOutOfDoorway(world, e, state, now, dt)) return;

  // Doors come next. Working a handle takes a second or two and holds them
  // in place, but never touches where they were headed — the moment it opens
  // they carry on to it.
  if (doorTick(world, e, state, now, dt)) return;
  if (lockAlsoTick(world, e, state, now, dt)) return;
  if (begTick(world, e, state, now, dt)) return;
  if (answerPleaTick(world, e, state, now, dt)) return;

  // Seeing a zombie overrides whatever else was happening.
  if (state.threatCount > 0) {
    state.mode = 'flee';
    if (!state.sawZombie) remarkOnFirstSight(world, e, now);
    state.sawZombie = true;
    // Driven out of the house: it stops being somewhere to go back to.
    if (state.homeBuilding >= 0 && buildingIndexAt(world, e.x, e.y) !== state.homeBuilding) {
      state.homeBuilding = -1;
    }
    const boostUntil = world.speedBoosts.get(e.id);
    const boosted = boostUntil !== undefined && now < boostUntil;
    if (boostUntil !== undefined && !boosted) world.speedBoosts.delete(e.id);
    const speed = HUMAN_FLEE_SPEED * (boosted ? ESCAPE_SPEED_MULTIPLIER : 1);

    // Scraping along a wall counts as not escaping. Checked ahead of
    // everything else a frightened person might do, since any of those
    // branches can be the one walking them into the wall.
    if (unstickTick(world, e, state, now, dt, speed)) return;

    // Some people don't run for a building at all — they run to whoever has a
    // gun and stand behind them.
    if (state.officerSeeker) {
      const officer = nearestOfType(world, e, 'officer', OFFICER_REFUGE_RANGE);
      if (officer) {
        const gap = Math.hypot(officer.x - e.x, officer.y - e.y);
        if (gap > OFFICER_REFUGE_GAP) {
          const desired = headingToward(world, e, state, officer.x, officer.y, now);
          step(world, e, state, skirtThreat(world, e, state, desired), speed, HUMAN_TURN_RATE, dt, now);
          return;
        }
        // Close enough to feel safe: hold beside them and watch the street.
        state.heading = Math.atan2(state.threatY - e.y, state.threatX - e.x);
        e.facing = state.heading;
        return;
      }
    }

    // Bush-hiders don't run blindly — they bolt for the nearest cover, so
    // long as it isn't back toward whatever is chasing them.
    if (state.bushHider) {
      // Re-scanning every bush on every tick is the single most expensive
      // thing a fleeing crowd can do — hold the choice between senses.
      if (now >= state.nextBushScanAt) {
        state.nextBushScanAt = now + BUSH_SCAN_INTERVAL_MS;
        const found = nearestBushAwayFrom(world, e, state);
        state.bushX = found ? found.x : null;
        state.bushY = found ? found.y : null;
      }
      const bush = state.bushX !== null && state.bushY !== null ? { x: state.bushX, y: state.bushY } : null;
      if (bush) {
        if (isInBush(world, e.x, e.y)) {
          state.mode = 'settled';
          return;
        }
        const desired = headingToward(world, e, state, bush.x, bush.y, now);
        step(world, e, state, desired, speed, HUMAN_TURN_RATE, dt, now);
        return;
      }
    }

    // Couples run together: the partner steers toward whoever bolted first.
    const partner = state.partnerId ? world.entities.get(state.partnerId) : undefined;
    if (partner && partner.type === 'human') {
      const gap = Math.hypot(partner.x - e.x, partner.y - e.y);
      if (gap > COUPLE_FOLLOW_DIST) {
        const desired = Math.atan2(partner.y - e.y, partner.x - e.x);
        step(world, e, state, desired, speed, HUMAN_TURN_RATE, dt, now);
        return;
      }
    }

    // Panickers keep running dead away and often corner themselves; everyone
    // else caught indoors with a zombie makes for the nearest doorway,
    // squeezing past the zombie rather than backing into a wall.
    if (state.fleeStyle !== 'bolt') {
      const building = buildingContaining(world, e.x, e.y);
      if (building >= 0) {
        const threatIndoors = state.threatPoints.some(
          (t) => buildingIndexAt(world, t.x, t.y) === building,
        );

        // A zombie prowling outside is a reason to stay put, not to run into
        // the street. Only the jumpy minority bolts for the door — and someone
        // who deliberately ran in here isn't about to run back out.
        if (!threatIndoors && (state.staysIndoors || state.shelterSeeker)) {
          // Carry on to the back of the building first. Settling the moment
          // the threshold is crossed leaves people stood in the doorway, in
          // plain view of the thing they just ran from.
          if (
            building === state.shelterBuilding &&
            state.shelterX !== null &&
            state.shelterY !== null &&
            Math.hypot(state.shelterX - e.x, state.shelterY - e.y) > 34
          ) {
            const toShelter = headingToward(world, e, state, state.shelterX, state.shelterY, now);
            step(world, e, state, toShelter, speed, HUMAN_TURN_RATE, dt, now);
            return;
          }
          // Holed up. Somebody who deliberately ran in here to get away from
          // something does not then wander back out into the street — this is
          // where they stay.
          state.shelterBuilding = -1;
          state.shelterX = null;
          state.shelterY = null;
          if (state.shelterSeeker) state.homeBuilding = building;
          state.mode = 'settled';
          return;
        }

        if (threatIndoors) {
          // This place isn't safe after all; look elsewhere once outside.
          state.shelterBuilding = -1;
          state.shelterX = null;
          state.shelterY = null;

          const exit = exitPointFor(world, building, e, state);
          if (exit) {
            const toExit = headingToward(world, e, state, exit.x, exit.y, now);
            step(world, e, state, skirtThreat(world, e, state, toExit), speed, HUMAN_TURN_RATE, dt, now);
            return;
          }
        }
      } else if (state.shelterSeeker) {
        // Most people's first instinct is to get behind a door, not to run
        // down the middle of the street. Hold the choice between scans — this
        // sweeps every building in range, which is far too costly per tick.
        if (now >= state.nextShelterScanAt) {
          state.nextShelterScanAt = now + SHELTER_SCAN_INTERVAL_MS;
          // Drop it if something got inside ahead of us, or is stood in the
          // way in — re-checked as we run, not only when we first chose.
          const stale =
            state.shelterBuilding < 0 ||
            state.threatPoints.some((t) => buildingIndexAt(world, t.x, t.y) === state.shelterBuilding) ||
            entranceHeld(world, state, state.shelterBuilding);
          if (stale) chooseShelter(world, e, state);
        }
        if (state.shelterX !== null && state.shelterY !== null) {
          const toShelter = headingToward(world, e, state, state.shelterX, state.shelterY, now);
          step(world, e, state, skirtThreat(world, e, state, toShelter), speed, HUMAN_TURN_RATE, dt, now);
          return;
        }
      }

      // Out in the open: pick somewhere to run *to* and path there, rather
      // than picking a bearing. Steering by direction alone is what walked
      // people into walls that happened to be away from the zombie.
      const escape = escapeDestination(world, e, state, now);
      if (escape) {
        const toEscape = headingToward(world, e, state, escape.x, escape.y, now);
        step(world, e, state, skirtThreat(world, e, state, toEscape), speed, HUMAN_TURN_RATE, dt, now);
        return;
      }
    }

    const desired =
      state.fleeStyle === 'bolt'
        ? Math.atan2(e.y - state.threatY, e.x - state.threatX) + (Math.random() - 0.5) * 0.25
        : skirtThreat(world, e, state, safestHeading(world, e, state));
    step(world, e, state, desired, speed, HUMAN_TURN_RATE, dt, now);
    return;
  }

  // Following someone outranks wandering, but not running for your life —
  // this sits below the flee branch on purpose.
  if (state.followingId !== null) {
    const leader = world.entities.get(state.followingId);
    if (!leader || leader.type === 'zombie') {
      state.followingId = null;
    } else {
      const gap = Math.hypot(leader.x - e.x, leader.y - e.y);
      if (gap > FOLLOW_ARRIVE_DIST) {
        const desired = headingToward(world, e, state, leader.x, leader.y, now);
        step(world, e, state, desired, HUMAN_WALK_SPEED * FOLLOW_SPEED_MUL, HUMAN_TURN_RATE, dt, now);
      } else {
        // Close enough — face roughly where they're facing and wait on them.
        state.heading = turnToward(state.heading, leader.facing, HUMAN_TURN_RATE * dt);
        e.facing = state.heading;
      }
      return;
    }
  }

  // A rally shout outranks ordinary wandering once the coast is clear.
  if (state.mode === 'rallied' && state.rallyX !== null && state.rallyY !== null) {
    const dist = Math.hypot(state.rallyX - e.x, state.rallyY - e.y);
    if (dist <= RALLY_ARRIVE_DIST) {
      // Holding where told, but glancing about rather than standing like a post.
      if (now >= state.nextLookAt) {
        state.nextLookAt = now + RALLY_LOOK_MIN_MS + Math.random() * (RALLY_LOOK_MAX_MS - RALLY_LOOK_MIN_MS);
        state.lookHeading = Math.random() * Math.PI * 2;
      }
      state.heading = turnToward(state.heading, state.lookHeading, RALLY_LOOK_TURN_RATE * dt);
      e.facing = state.heading;

      // And occasionally griping about it.
      if (now >= state.nextChatterAt) {
        state.nextChatterAt =
          now + RALLY_CHATTER_MIN_MS + Math.random() * (RALLY_CHATTER_MAX_MS - RALLY_CHATTER_MIN_MS);
        if (Math.random() < RALLY_CHATTER_CHANCE && !world.speech.has(e.id)) {
          world.speech.set(e.id, {
            text: RALLY_CHATTER_LINES[Math.floor(Math.random() * RALLY_CHATTER_LINES.length)],
            until: now + RALLY_CHATTER_MS,
          });
        }
      }
      return;
    }
    const desired = headingToward(world, e, state, state.rallyX, state.rallyY, now);
    step(world, e, state, desired, HUMAN_WALK_SPEED * 1.45, HUMAN_TURN_RATE, dt, now);
    return;
  }

  switch (state.mode) {
    case 'flee': {
      // Lost sight of them — keep going, don't just stop dead.
      state.mode = 'retreat';
      state.retreatUntil = now + RETREAT_MS * state.panicScale;
      break;
    }
    case 'retreat': {
      const away = Math.hypot(e.x - state.threatX, e.y - state.threatY);
      if (now >= state.retreatUntil || away >= RETREAT_DISTANCE * state.panicScale) {
        state.mode = 'panic';
        state.panicUntil = now + PANIC_MS * state.panicScale;
        pickWanderTarget(world, e, state, now, false, HUMAN_WANDER_RADIUS * 1.4);
      } else {
        const boostUntil = world.speedBoosts.get(e.id);
        const boosted = boostUntil !== undefined && now < boostUntil;
        const speed = HUMAN_FLEE_SPEED * (boosted ? ESCAPE_SPEED_MULTIPLIER : 1);

        // Retreat runs a long way now, so it can't be a raw bearing away from
        // the threat — that walked people into the first wall behind them and
        // held them there for the whole retreat.
        if (unstickTick(world, e, state, now, dt, speed)) return;

        const away = Math.atan2(e.y - state.threatY, e.x - state.threatX);
        const goalX = clamp(e.x + Math.cos(away) * 320, 70, WORLD_WIDTH - 70);
        const goalY = clamp(e.y + Math.sin(away) * 320, 70, WORLD_HEIGHT - 70);
        const desired = headingToward(world, e, state, goalX, goalY, now);
        step(world, e, state, desired, speed, HUMAN_TURN_RATE, dt, now);
        return;
      }
      break;
    }
    case 'panic': {
      if (now >= state.panicUntil) {
        state.mode = 'seek';
        state.seekUntil = now + (state.settleTrait === 'roam' ? ROAM_MS : SEEK_TIMEOUT_MS);
        const goal = chooseSettleGoal(world, e, state);
        if (goal) {
          state.wanderX = goal.x;
          state.wanderY = goal.y;
          state.path = null;
          state.nextPathAt = 0;
          state.pauseUntil = 0;
        }
      } else {
        // Agitated wandering: quicker, longer legs, no dawdling.
        if (Math.hypot(state.wanderX - e.x, state.wanderY - e.y) < 24) {
          pickWanderTarget(world, e, state, now, false, HUMAN_WANDER_RADIUS * 1.4);
        }
        if (turnAtWallAndRepick(world, e, state, now, HUMAN_WANDER_RADIUS * 1.4)) return;
        const desired = headingToward(world, e, state, state.wanderX, state.wanderY, now);
        step(world, e, state, desired, HUMAN_WALK_SPEED * PANIC_SPEED_MULTIPLIER, HUMAN_TURN_RATE, dt, now);
        return;
      }
      break;
    }
    case 'seek': {
      if (hasSettled(world, e, state)) {
        state.mode = 'settled';
        // Next scare picks a fresh refuge rather than this same one.
        state.refugeX = null;
        state.refugeY = null;
        return;
      }
      if (now >= state.seekUntil) {
        state.mode = 'wander';
        break;
      }
      if (Math.hypot(state.wanderX - e.x, state.wanderY - e.y) < 24) {
        const goal = chooseSettleGoal(world, e, state);
        if (goal) {
          state.wanderX = goal.x;
          state.wanderY = goal.y;
        } else {
          pickWanderTarget(world, e, state, now, false);
        }
      }
      const desired = headingToward(world, e, state, state.wanderX, state.wanderY, now);
      step(world, e, state, desired, HUMAN_WALK_SPEED * 1.2, HUMAN_TURN_RATE, dt, now);
      return;
    }
    case 'settled':
      return; // holed up until something scares them again
    default:
      break;
  }

  // No zombie in view, but a neighbour sprinting past is its own signal — to
  // someone who hasn't seen one yet. Anyone who has already laid eyes on a
  // zombie knows exactly what the running is about and doesn't go and look.
  if (
    !state.sawZombie &&
    state.homeBuilding < 0 &&
    state.witness !== 'ignore' &&
    state.mode === 'wander' &&
    now >= state.nextWitnessCheck
  ) {
    state.nextWitnessCheck = now + 500;
    const runner = spotRunner(world, e);
    if (runner) {
      const rs = world.ai.get(runner.id)!;
      if (state.witness === 'follow') {
        // Go the way they're going.
        state.wanderX = clamp(runner.x + Math.cos(rs.heading) * 260, 60, WORLD_WIDTH - 60);
        state.wanderY = clamp(runner.y + Math.sin(rs.heading) * 260, 60, WORLD_HEIGHT - 60);
      } else {
        // Head toward whatever they're running from. Rarely wise.
        state.wanderX = clamp(rs.threatX, 60, WORLD_WIDTH - 60);
        state.wanderY = clamp(rs.threatY, 60, WORLD_HEIGHT - 60);
      }
      state.path = null;
      state.nextPathAt = 0;
      state.pauseUntil = 0;
    }
  }

  // Couples stroll together.
  const mate = state.partnerId ? world.entities.get(state.partnerId) : undefined;
  if (mate && mate.type === 'human' && Math.hypot(mate.x - e.x, mate.y - e.y) > COUPLE_FOLLOW_DIST) {
    const desired = headingToward(world, e, state, mate.x, mate.y, now);
    step(world, e, state, desired, HUMAN_WALK_SPEED * 1.1, HUMAN_TURN_RATE, dt, now);
    return;
  }

  // Ordinary strolling.
  if (now < state.pauseUntil) return;

  if (Math.hypot(state.wanderX - e.x, state.wanderY - e.y) < 24) {
    pickWanderTarget(world, e, state, now);
    return;
  }

  if (now >= state.progressCheckAt) {
    state.progressCheckAt = now + 900;
    if (Math.hypot(e.x - state.lastX, e.y - state.lastY) < 6) {
      pickWanderTarget(world, e, state, now, false);
    }
    state.lastX = e.x;
    state.lastY = e.y;
  }

  // Nose to the wall: turn away and pick somewhere else to stroll to.
  if (turnAtWallAndRepick(world, e, state, now)) return;

  // Someone who has seen one of those things never quite strolls again.
  const pace = HUMAN_WALK_SPEED * (state.sawZombie ? SHAKEN_WALK_MULTIPLIER : 1);
  const desired = headingToward(world, e, state, state.wanderX, state.wanderY, now);
  step(world, e, state, desired, pace, HUMAN_TURN_RATE, dt, now);
}

// ---------------------------------------------------------------- NPC officers

function updateNpcOfficer(world: World, e: Entity, state: AiState, now: number, dt: number): void {
  // Dropped troops see further, fire more often and shoot far straighter.
  const elite = world.soldiers.has(e.id);
  const sight = elite ? SOLDIER_SIGHT : NPC_OFFICER_SIGHT;
  const bloom = elite ? SOLDIER_BLOOM_RAD : NPC_OFFICER_BLOOM_RAD;
  const interval = elite ? SOLDIER_SHOOT_INTERVAL_MS : NPC_OFFICER_SHOOT_INTERVAL_MS;

  if (now >= state.nextSenseAt) {
    state.nextSenseAt = now + SENSE_INTERVAL_MS;
    senseThreats(world, e, state, sight);
  }

  const threat = state.targetId ? world.entities.get(state.targetId) : undefined;

  // Shaken after being grabbed: no shooting, just get clear.
  if (now < state.fleeUntil) {
    if (threat && threat.type === 'zombie') {
      state.threatX = threat.x;
      state.threatY = threat.y;
      e.facing = Math.atan2(threat.y - e.y, threat.x - e.x);
    }
    const away = Math.atan2(e.y - state.threatY, e.x - state.threatX);
    step(world, e, state, away, HUMAN_FLEE_SPEED, HUMAN_TURN_RATE, dt, now);
    return;
  }

  if (threat && threat.type === 'zombie') {
    const dx = threat.x - e.x;
    const dy = threat.y - e.y;
    const dist = Math.hypot(dx, dy);
    const aim = Math.atan2(dy, dx);
    // Quick, but not instantaneous — snapping the barrel around made them look
    // mechanical, and made the flicking between targets far more obvious.
    state.heading = turnToward(state.heading, aim, NPC_OFFICER_TURN_RATE * dt);
    e.facing = state.heading;

    // Don't fire until roughly on target, or they shoot at where they were.
    if (now >= state.nextShotAt && Math.abs(angleDelta(state.heading, aim)) < 0.22) {
      state.nextShotAt = now + interval;
      fire(world, e, state.heading, bloom, now);
    }

    // Walk backwards to hold the far edge of their sight line, never turning
    // away from the thing they're shooting at.
    if (dist < NPC_OFFICER_RETREAT_DIST) {
      state.heading = Math.atan2(-dy, -dx);
      const speed = speedAt(world, e.x, e.y, HUMAN_WALK_SPEED);
      const stepX = Math.cos(state.heading) * speed * dt;
      const stepY = Math.sin(state.heading) * speed * dt;
      // Don't reverse into a wall — slide along it instead.
      if (!world.nav.isBlocked(e.x + stepX, e.y + stepY)) {
        e.x += stepX;
        e.y += stepY;
      } else if (!world.nav.isBlocked(e.x + stepX, e.y)) {
        e.x += stepX;
      } else if (!world.nav.isBlocked(e.x, e.y + stepY)) {
        e.y += stepY;
      }
    }
    return;
  }

  // Off duty they patrol rather than loiter.
  if (now < state.pauseUntil) return;
  if (Math.hypot(state.wanderX - e.x, state.wanderY - e.y) < 24) {
    pickWanderTarget(world, e, state, now);
    return;
  }
  if (turnAtWallAndRepick(world, e, state, now)) return;
  const desired = headingToward(world, e, state, state.wanderX, state.wanderY, now);
  step(world, e, state, desired, HUMAN_WALK_SPEED * 1.15, HUMAN_TURN_RATE, dt, now);
}

// ---------------------------------------------------------------- bot officers

/**
 * Is this gun worth crossing the street for? Bots rank by the damage a trigger
 * pull actually delivers, so a shotgun's eight pellets count for what they are
 * rather than for one pellet's damage.
 */
/**
 * Loot a bot officer walks straight past. The dart marks a target for a hunt
 * nothing consumes yet, and the shield does nothing at all — a bot crossing
 * two blocks for either is a bot not holding a gun. Both scored zero already;
 * this says so out loud, so giving the dart a damage figure later doesn't
 * quietly send every bot after one.
 */
const BOT_IGNORES = new Set<ItemId>(['trackerDart', 'riotShield']);

function gunWorth(item: ItemId | null): number {
  if (!item) return 0;
  const def = ITEMS[item];
  if (!def || def.kind !== 'gun') return 0;
  const perShot = ((def.damageMin ?? 0) + (def.damageMax ?? 0)) / 2;
  return perShot * (def.pellets ?? 1);
}

/**
 * The best *loaded* gun in hand. The pistol is the answer only when nothing
 * else has a round left in it — it never runs dry, so ranking it against the
 * others by damage had bots reaching for it over a loaded machine gun and
 * standing there plinking with a sidearm.
 */
function bestGun(inv: Inventory): { slot: number; worth: number } {
  let slot = -1;
  let worth = -Infinity;
  for (let i = 0; i < inv.guns.length; i++) {
    const g = inv.guns[i];
    if (!g || g.ammo <= 0) continue;
    const w = gunWorth(g.item);
    if (w > worth) {
      worth = w;
      slot = i + 1;
    }
  }
  if (slot < 0) return { slot: 0, worth: gunWorth('pistol') };
  return { slot, worth };
}

/** Index into `inv.guns` of a gun that has run dry, or -1. */
function emptyGunSlot(inv: Inventory): number {
  return inv.guns.findIndex((g) => g !== null && g.ammo <= 0);
}

/**
 * Loot this bot would cross the map for: a gun better than what it is holding,
 * or a box of ammo when its good gun has run dry. Everything else is left for
 * whoever wants it.
 */
function lootWanted(world: World, e: Entity, inv: Inventory, range: number): PickupState | null {
  const held = bestGun(inv);
  const dryGun = emptyGunSlot(inv) >= 0;
  // A gun that has run dry is as good as a free slot: they'll ditch it on
  // arrival. Without this a bot with three empty rifles is "full" and walks
  // past every gun in the city.
  const hasRoom = inv.guns.some((g) => g === null) || dryGun;
  const utilityRoom = inv.utilities.length < UTILITY_SLOTS;

  let best: PickupState | null = null;
  let bestScore = -Infinity;

  for (const p of world.pickups.values()) {
    if (BOT_IGNORES.has(p.item)) continue;
    const dist = Math.hypot(p.x - e.x, p.y - e.y);
    if (dist > range) continue;
    if (!world.nav.isReachable(p.x, p.y)) continue;

    let want = 0;
    if (ITEMS[p.item]?.kind === 'gun') {
      // Somebody else's empty gun is a decoration. Walking to one and finding
      // it dry is exactly what the grey marker exists to prevent.
      if (p.ammo === 0) continue;
      const worth = gunWorth(p.item);
      if (hasRoom) want = worth;
      else if (worth > held.worth) want = worth - held.worth;
    } else if (p.item === 'ammoBox' && dryGun) {
      // The box is used on the spot rather than carried, so a full utility
      // belt is no obstacle to it.
      want = 40;
    } else if (p.item === 'kevlar' && inv.kevlar <= 0 && utilityRoom) {
      want = 30;
    }
    if (want <= 0) continue;

    // Near things first: a marginally better gun across the city isn't worth
    // the walk with the dead coming.
    const score = want - dist * 0.06;
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }
  return best;
}

/**
 * An officer played by the machine. Unlike the grey NPC officers — who patrol
 * with a fixed sidearm — a bot carries a real inventory, goes looking for
 * better guns, and fires them through the same path a player does, so its
 * shotgun behaves exactly like yours.
 */
/**
 * Somewhere out in the street. Bots are meant to be hunting, not sitting in a
 * front room, so their patrol targets have to be outdoors — that is what walks
 * them back out of a house once they've stripped it.
 *
 * Scored toward `BOT_HUNT_STANDOFF` on the danger field rather than away from
 * it: the field already knows, geodesically, how far every cell is from the
 * nearest zombie, so wanting to be near trouble costs one lookup per sample
 * instead of a search.
 */
function botPatrolTarget(world: World, e: Entity, state: AiState, now: number): void {
  let best: { x: number; y: number } | null = null;
  let bestScore = -Infinity;

  for (let i = 0; i < BOT_PATROL_SAMPLES; i++) {
    const angle = Math.random() * Math.PI * 2;
    const reach = BOT_PATROL_MIN + Math.random() * (BOT_PATROL_MAX - BOT_PATROL_MIN);
    const x = clamp(e.x + Math.cos(angle) * reach, 70, WORLD_WIDTH - 70);
    const y = clamp(e.y + Math.sin(angle) * reach, 70, WORLD_HEIGHT - 70);
    if (world.nav.isBlocked(x, y) || !world.nav.isReachable(x, y)) continue;
    // Indoors is where the loot is, not where the work is.
    if (buildingIndexAt(world, x, y) >= 0) continue;

    const danger = Math.min(world.danger.distanceAt(x, y), DANGER_MAX_DISTANCE);
    // Near the trouble, not stood in it.
    let score = -Math.abs(danger - BOT_HUNT_STANDOFF);
    score += world.danger.opennessAt(x, y) * 30;
    if (score > bestScore) {
      bestScore = score;
      best = { x, y };
    }
  }

  if (best) {
    state.wanderX = best.x;
    state.wanderY = best.y;
  } else {
    // Nowhere outdoors came up — fall back rather than stand still.
    pickWanderTarget(world, e, state, now, false, HUMAN_WANDER_RADIUS * 1.6);
  }
  state.path = null;
  state.nextPathAt = 0;
}

/**
 * Smoke is cover, not a weapon. It goes to either side or behind — putting it
 * on the zombie would only blind the bot to the thing it is trying to watch.
 */
function popSmoke(world: World, e: Entity, state: AiState, toThreat: number, now: number): boolean {
  if (now < state.nextSmokeAt) return false;
  const inv = world.inventories.get(e.id);
  if (!inv) return false;
  const at = inv.utilities.indexOf('smokeGrenade');
  if (at < 0) return false;

  // Either flank, or straight behind. Never at the thing they want to keep
  // looking at.
  const options = [toThreat + Math.PI / 2, toThreat - Math.PI / 2, toThreat + Math.PI];
  const angle = options[Math.floor(Math.random() * options.length)];

  // Go through the normal trigger so it burns the grenade and takes the same
  // cooldown a player's would.
  const wasSlot = inv.activeSlot;
  inv.activeSlot = GUN_SLOTS + 1 + at;
  const thrown = fireHeld(world, e, inv, angle, now);
  if (!thrown) {
    inv.activeSlot = wasSlot;
    return false;
  }
  state.nextSmokeAt = now + BOT_SMOKE_COOLDOWN_MS;
  inv.activeSlot = bestGun(inv).slot;
  return true;
}

/** Sprint reserve: spent while bolting, refilled while doing anything else. */
function botStaminaTick(state: AiState, sprinting: boolean, dt: number): number {
  if (sprinting && !state.botWinded) {
    state.botStamina = Math.max(0, state.botStamina - STAMINA_DRAIN_PER_SEC * dt);
    if (state.botStamina <= STAMINA_SPRINT_FLOOR) state.botWinded = true;
  } else {
    state.botStamina = Math.min(STAMINA_MAX, state.botStamina + STAMINA_REGEN_PER_SEC * dt);
    if (state.botWinded && state.botStamina >= STAMINA_RECOVERY_THRESHOLD) state.botWinded = false;
  }
  return sprinting && !state.botWinded ? BOT_SPRINT_SPEED : BOT_WALK_SPEED;
}

function updateBotOfficer(world: World, e: Entity, state: AiState, now: number, dt: number): void {
  const inv = world.inventories.get(e.id);
  if (!inv) return;

  if (now >= state.nextSenseAt) {
    state.nextSenseAt = now + SENSE_INTERVAL_MS;
    senseThreats(world, e, state, NPC_OFFICER_SIGHT);
  }

  // Clicking on an empty chamber is checked every tick, not only when there's
  // something to shoot at — walking around holding a gun you can't fire is how
  // a bot gets caught out the moment one appears.
  const inHand = heldGunSlot(inv);
  if (inHand && inHand.ammo <= 0) inv.activeSlot = bestGun(inv).slot;

  // Shaken after being grabbed: get clear before thinking about anything else.
  if (now < state.fleeUntil) {
    const away = Math.atan2(e.y - state.threatY, e.x - state.threatX);
    step(world, e, state, away, HUMAN_FLEE_SPEED, HUMAN_TURN_RATE, dt, now);
    return;
  }

  // Loot lives indoors, so a bot that can't work a door never finds a gun.
  // Same handling civilians get: opening one takes a moment and leaves
  // whatever it was walking toward untouched.
  if (doorTick(world, e, state, now, dt)) return;

  const threat = state.targetId ? world.entities.get(state.targetId) : undefined;

  if (threat && threat.type === 'zombie') {
    const dx = threat.x - e.x;
    const dy = threat.y - e.y;
    const dist = Math.hypot(dx, dy);
    const aim = Math.atan2(dy, dx);
    state.threatX = threat.x;
    state.threatY = threat.y;

    // Smoke goes up the moment something is seen, before the shooting starts —
    // it is what buys the room to back off through.
    if (popSmoke(world, e, state, aim, now)) return;

    // Judged on the *nearest* zombie in sight, not the one being shot at —
    // those are often different, and a bot trading fire with something across
    // the street shouldn't ignore the one at its elbow. threatPoints is
    // already line-of-sight filtered and refreshed on the perception tick, so
    // this costs a walk of a short list rather than another query.
    let closest = dist;
    for (const p of state.threatPoints) {
      const d = Math.hypot(p.x - e.x, p.y - e.y);
      if (d < closest) closest = d;
    }

    // Latched with a wide band: too close and they turn and run, and they keep
    // running until they are properly clear rather than the instant they are
    // one pixel past the line.
    if (closest < BOT_BOLT_DIST) state.bolting = true;
    else if (closest > BOT_SAFE_DIST) state.bolting = false;

    if (state.bolting) {
      const speed = botStaminaTick(state, true, dt);
      // Goal-directed, like every other flight in this game. A raw bearing
      // away from the threat parks them on the first wall behind them.
      if (unstickTick(world, e, state, now, dt, speed)) return;
      const to = escapeDestination(world, e, state, now);
      const desired = to
        ? headingToward(world, e, state, to.x, to.y, now)
        : safestHeading(world, e, state);
      step(world, e, state, desired, speed, HUMAN_TURN_RATE, dt, now);
      return;
    }

    // Standing and fighting: face it, hold the best gun, and open up.
    botStaminaTick(state, false, dt);
    const best = bestGun(inv);
    if (inv.activeSlot !== best.slot) inv.activeSlot = best.slot;

    state.heading = turnToward(state.heading, aim, NPC_OFFICER_TURN_RATE * dt);
    e.facing = state.heading;

    if (Math.abs(angleDelta(state.heading, aim)) < 0.2) {
      const held = heldItem(inv);
      const reach = held ? ITEMS[held]?.range ?? GUN_RANGE : GUN_RANGE;
      // Don't waste a launcher shell on something close enough to splash us.
      const tooClose = held ? ITEMS[held]?.explosive === true && dist < BLAST_RADIUS * 1.3 : false;
      if (dist <= reach && !tooClose) fireHeld(world, e, inv, state.heading, now);
    }

    // Give ground while still facing it — walking backwards, so the gun stays
    // on target. Slide along whichever axis is open rather than stopping dead.
    if (dist < NPC_OFFICER_RETREAT_DIST) {
      const backward = Math.atan2(-dy, -dx);
      const speed = speedAt(world, e.x, e.y, BOT_WALK_SPEED * 0.7);
      const stepX = Math.cos(backward) * speed * dt;
      const stepY = Math.sin(backward) * speed * dt;
      if (!world.nav.isBlocked(e.x + stepX, e.y + stepY)) {
        e.x += stepX;
        e.y += stepY;
      } else if (!world.nav.isBlocked(e.x + stepX, e.y)) {
        e.x += stepX;
      } else if (!world.nav.isBlocked(e.x, e.y + stepY)) {
        e.y += stepY;
      }
    }
    return;
  }

  // Nothing in sight: stop running and get the wind back.
  state.bolting = false;
  botStaminaTick(state, false, dt);

  // Nothing to shoot: go shopping. Re-checked on a cadence rather than every
  // tick, since it sweeps the loot list.
  if (now >= state.nextLootScanAt) {
    state.nextLootScanAt = now + BOT_LOOT_SCAN_MS;
    const want = lootWanted(world, e, inv, BOT_LOOT_RANGE);
    state.lootId = want ? want.id : null;
  }

  if (state.lootId !== null) {
    const target = world.pickups.get(state.lootId);
    if (!target) {
      state.lootId = null;
    } else {
      const gap = Math.hypot(target.x - e.x, target.y - e.y);
      if (gap <= PICKUP_REACH) {
        // Bag full but something in it is dry: put the dry one down first, so
        // there's a slot to take this into. It lands here with zero rounds and
        // draws grey, which tells everyone else to leave it alone.
        const spent = emptyGunSlot(inv);
        if (
          ITEMS[target.item]?.kind === 'gun' &&
          spent >= 0 &&
          !inv.guns.some((g) => g === null)
        ) {
          inv.activeSlot = spent + 1;
          dropHeld(world, inv, e.x, e.y);
        }
        // Ask for the thing we walked here for by name — the nearest pickup
        // may well be the empty gun we just put down.
        const result = collect(world, e.id, inv, e.x, e.y, target.id);
        state.lootId = null;
        // Bring whatever we just took to hand if it beats what we had.
        inv.activeSlot = bestGun(inv).slot;
        if (result) state.nextLootScanAt = now + 200;
        return;
      }
      // Scraping along something on the way to it counts as not getting there.
      if (unstickTick(world, e, state, now, dt, BOT_WALK_SPEED)) return;
      const desired = headingToward(world, e, state, target.x, target.y, now);
      step(world, e, state, desired, BOT_WALK_SPEED, HUMAN_TURN_RATE, dt, now);
      return;
    }
  }

  // Otherwise patrol. Targets are outdoors by construction, so a bot that has
  // finished stripping a house walks itself back out to the street rather than
  // pottering about in the front room.
  if (now < state.pauseUntil) return;
  const arrived = Math.hypot(state.wanderX - e.x, state.wanderY - e.y) < 24;
  // A destination that is itself indoors isn't a bot's destination. Testing
  // the target rather than where they're standing means this fires once and
  // then holds, instead of re-rolling a patrol every tick they spend inside.
  const targetIndoors = buildingIndexAt(world, state.wanderX, state.wanderY) >= 0;
  if (arrived || targetIndoors) {
    botPatrolTarget(world, e, state, now);
    if (arrived) return;
  }
  if (unstickTick(world, e, state, now, dt, BOT_WALK_SPEED)) return;
  const desired = headingToward(world, e, state, state.wanderX, state.wanderY, now);
  step(world, e, state, desired, BOT_WALK_SPEED, HUMAN_TURN_RATE, dt, now);
}

// ---------------------------------------------------------------- zombies

function senseTarget(world: World, e: Entity, state: AiState): void {
  const nearby = world.entityGrid.queryCircle(e.x, e.y, ZOMBIE_SIGHT_RADIUS, new Set<Entity>());

  let best: Entity | null = null;
  let bestScore = Infinity;

  for (const other of nearby) {
    if (other.type !== 'human' && other.type !== 'officer') continue;
    const dist = Math.hypot(other.x - e.x, other.y - e.y);
    if (dist > ZOMBIE_SIGHT_RADIUS) continue;

    // Someone already swarmed by a full pack isn't worth joining.
    const session = world.grapples.get(other.id);
    if (session && session.zombieIds.size >= MAX_GRAPPLERS && !session.zombieIds.has(e.id)) continue;

    // Already-bitten prey is worth far less than clean prey, so a zombie will
    // walk right past someone incubating to reach an uninfected target.
    const score = dist * (world.pendingInfections.has(other.id) ? INFECTED_TARGET_PENALTY : 1);
    if (score >= bestScore) continue;
    if (!hasLineOfSight(world, e.x, e.y, other.x, other.y)) continue;

    best = other;
    bestScore = score;
  }

  if (best) {
    state.targetId = best.id;
    state.lastSeenX = best.x;
    state.lastSeenY = best.y;
  } else {
    state.targetId = null;
  }
}

/**
 * Zombies can see straight through glass but not walk through it, so a pane
 * between a zombie and its target becomes something to beat on. Returns true
 * when the zombie spent this tick attacking instead of moving.
 */
function attackBlockingWindow(
  world: World,
  e: Entity,
  state: AiState,
  target: Entity,
  now: number,
): boolean {
  const panes = world.windowGrid.queryCircle(e.x, e.y, e.radius + 26, new Set<number>());
  if (panes.size === 0) return false;

  const toTargetX = target.x - e.x;
  const toTargetY = target.y - e.y;
  const len = Math.hypot(toTargetX, toTargetY) || 1;

  for (const index of panes) {
    if (!isWindowIntact(world, index)) continue;
    const pane = world.map.windows[index];

    // Only care about panes that actually sit between us and the target.
    const nearestX = clamp(e.x, pane.x, pane.x + pane.w);
    const nearestY = clamp(e.y, pane.y, pane.y + pane.h);
    const dx = nearestX - e.x;
    const dy = nearestY - e.y;
    if (Math.hypot(dx, dy) > e.radius + 14) continue;
    if ((dx * toTargetX + dy * toTargetY) / len <= 0) continue;

    e.facing = Math.atan2(dy, dx);
    state.heading = e.facing;
    if (now >= state.nextWindowHitAt) {
      state.nextWindowHitAt = now + WINDOW_ATTACK_INTERVAL_MS;
      damageWindow(world, index, WINDOW_ZOMBIE_DAMAGE);
    }
    return true;
  }
  return false;
}

/**
 * A shut door between a zombie and where it wants to be. Returns true when it
 * spent this tick tearing at the door instead of moving.
 */
function attackBlockingDoor(world: World, e: Entity, state: AiState, now: number): boolean {
  // Somebody it can actually get at beats a door it can only hear through.
  // The line-of-sight test is what separates the two: prey behind this very
  // door fails it, so a chase through a doorway still batters the door down.
  if (reachablePrey(world, e, ZOMBIE_ABANDON_DOOR_RANGE)) return false;

  for (const index of doorsNear(world, e.x, e.y, e.radius + 30)) {
    if (!isDoorShut(world, index)) continue;
    const door = world.map.doors[index];

    const dx = door.x - e.x;
    const dy = door.y - e.y;
    if (Math.hypot(dx, dy) > e.radius + 26 + door.halfSpan * 0.5) continue;

    e.facing = Math.atan2(dy, dx);
    state.heading = e.facing;
    state.breakingUntil = now + 400; // drives the clawing animation on the client
    if (now >= state.nextDoorHitAt) {
      state.nextDoorHitAt = now + DOOR_ATTACK_INTERVAL_MS;
      damageDoor(world, index, DOOR_ZOMBIE_DAMAGE);
    }
    return true;
  }
  return false;
}

/**
 * Notice that this zombie is getting nowhere, and take the nearest shut door
 * apart if there is one. This is what gets a zombie out of a room somebody
 * closed it into — it has no target, no scent, and never saw the door shut,
 * so nothing else would ever point it at the way out.
 *
 * Costs one distance comparison per zombie per interval; the door search only
 * runs for one that has actually been stuck a while.
 */
function zombieStuckTick(world: World, e: Entity, state: AiState, now: number, dt: number): boolean {
  if (now >= state.lastUnstickCheck) {
    state.lastUnstickCheck = now + ZOMBIE_STUCK_CHECK_MS;
    const moved = Math.hypot(e.x - state.unstickX, e.y - state.unstickY);
    state.unstickX = e.x;
    state.unstickY = e.y;
    if (moved < ZOMBIE_STUCK_MIN_PROGRESS) {
      if (state.stuckSince === 0) state.stuckSince = now;
    } else {
      state.stuckSince = 0;
    }
  }

  if (state.stuckSince === 0 || now - state.stuckSince < ZOMBIE_STUCK_DOOR_MS) return false;

  // Right up against one: claw at it.
  if (attackBlockingDoor(world, e, state, now)) return true;

  // Otherwise the nearest shut door in this room is the way out.
  let best = -1;
  let bestGap = ZOMBIE_STUCK_DOOR_RANGE;
  for (const index of doorsNear(world, e.x, e.y, ZOMBIE_STUCK_DOOR_RANGE)) {
    if (!isDoorShut(world, index)) continue;
    const spec = world.map.doors[index];
    const gap = Math.hypot(spec.x - e.x, spec.y - e.y);
    if (gap < bestGap) {
      bestGap = gap;
      best = index;
    }
  }
  if (best < 0) {
    // Nothing to break. Stop counting so it goes back to wandering.
    state.stuckSince = 0;
    return false;
  }

  const spec = world.map.doors[best];
  const desired = Math.atan2(spec.y - e.y, spec.x - e.x);
  step(world, e, state, desired, ZOMBIE_SEARCH_SPEED, ZOMBIE_TURN_RATE, dt, now);
  return true;
}

/** Anyone alive worth chasing within reach of this zombie. */
function preyNearby(world: World, e: Entity, range: number): boolean {
  const nearby = world.entityGrid.queryCircle(e.x, e.y, range, new Set<Entity>());
  for (const other of nearby) {
    if (other.type !== 'human' && other.type !== 'officer') continue;
    if (Math.hypot(other.x - e.x, other.y - e.y) <= range) return true;
  }
  return false;
}

/** ...and can actually be got at, rather than being behind the thing in the way. */
function reachablePrey(world: World, e: Entity, range: number): boolean {
  const nearby = world.entityGrid.queryCircle(e.x, e.y, range, new Set<Entity>());
  for (const other of nearby) {
    if (other.type !== 'human' && other.type !== 'officer') continue;
    if (Math.hypot(other.x - e.x, other.y - e.y) > range) continue;
    if (hasLineOfSight(world, e.x, e.y, other.x, other.y)) return true;
  }
  return false;
}

/**
 * A zombie that has cleared the room it's in and is bright enough to leave it,
 * rather than pacing an empty building for the rest of the round. Half of them
 * aren't, which is what keeps buildings occupied instead of everything
 * draining out into the streets.
 */
function leaveClearedRoom(world: World, e: Entity, state: AiState, now: number, dt: number): boolean {
  if (!state.smartZombie) return false;

  const building = buildingIndexAt(world, e.x, e.y);
  if (building < 0) {
    state.roomClearSince = 0;
    return false;
  }
  if (preyNearby(world, e, ZOMBIE_SIGHT_RADIUS * 0.6)) {
    state.roomClearSince = 0;
    return false;
  }

  if (state.roomClearSince === 0) {
    state.roomClearSince = now;
    return false;
  }
  if (now - state.roomClearSince < ZOMBIE_ROOM_CLEAR_MS) return false;

  // Nothing left in here. Head for a way out.
  const doors = doorsOf(world, building);
  if (doors.length === 0) return false;

  let best: { x: number; y: number } | null = null;
  let bestGap = Infinity;
  for (const door of doors) {
    const gap = Math.hypot(door.x - e.x, door.y - e.y);
    if (gap < bestGap) {
      bestGap = gap;
      best = { x: door.x, y: door.y };
    }
  }
  if (!best) return false;

  // Close enough to be through it; let the ordinary wander take over again.
  if (bestGap < 30) {
    state.roomClearSince = 0;
    return false;
  }

  const desired = headingToward(world, e, state, best.x, best.y, now);
  step(world, e, state, desired, ZOMBIE_SEARCH_SPEED, ZOMBIE_TURN_RATE, dt, now);
  return true;
}

/**
 * Whether this zombie can be bothered with a door at all. Live prey in the
 * street beats a door every time — the door is not going anywhere — and
 * something that has only just turned doesn't think about doors yet.
 */
function mindsDoors(world: World, e: Entity, state: AiState, now: number): boolean {
  if (now < state.freshUntil) return !preyNearby(world, e, DOOR_VS_HUMAN_RANGE * 1.4);
  return !preyNearby(world, e, DOOR_VS_HUMAN_RANGE);
}

function updateZombie(world: World, e: Entity, state: AiState, now: number, dt: number): void {
  if (now >= state.nextSenseAt) {
    state.nextSenseAt = now + SENSE_INTERVAL_MS;
    senseTarget(world, e, state);
  }

  const target = state.targetId ? world.entities.get(state.targetId) : undefined;

  if (target && (target.type === 'human' || target.type === 'officer')) {
    const dist = Math.hypot(target.x - e.x, target.y - e.y);
    const gap = dist - (e.radius + target.radius);

    // Glass or a door between us and dinner: work at it until it gives.
    if (attackBlockingWindow(world, e, state, target, now)) return;
    if (gap < 90 && attackBlockingDoor(world, e, state, now)) return;

    // Entities are kept apart by collision, so "contact" needs a little slack.
    if (dist <= e.radius + target.radius + GRAPPLE_REACH_BONUS) {
      let session = world.grapples.get(target.id);
      if (session && session.zombieIds.size >= MAX_GRAPPLERS && !session.zombieIds.has(e.id)) {
        // Pack is full. Drop the target *and* the memory of where they were,
        // otherwise the last-seen position drags us straight back to the pile.
        state.targetId = null;
        state.lastSeenX = null;
        state.lastSeenY = null;
        state.path = null;
        state.nextSenseAt = 0;
        // Strike out in a fresh direction rather than milling around the heap.
        state.nextTurnAt = now + 1500 + Math.random() * 2000;
        state.wanderX = Math.atan2(e.y - target.y, e.x - target.x) + (Math.random() - 0.5) * 1.4;
        return;
      }
      if (!session) {
        // A vest turns a grab into a brief scuffle it loses.
        const vest = world.inventories.get(target.id);
        const armoured = vest !== undefined && vest.kevlar > 0;
        session = {
          zombieIds: new Set(),
          endsAt: armoured
            ? now + KEVLAR_GRAPPLE_MS
            : now + GRAPPLE_MIN_MS + Math.random() * (GRAPPLE_MAX_MS - GRAPPLE_MIN_MS),
        };
        world.grapples.set(target.id, session);
      }
      session.zombieIds.add(e.id);
      e.facing = Math.atan2(target.y - e.y, target.x - e.x);
      return;
    }

    // Burst of speed to close the final gap.
    if (dist <= ZOMBIE_LUNGE_RANGE && now >= state.lungeReadyAt) {
      state.lungeUntil = now + ZOMBIE_LUNGE_MS;
      state.lungeReadyAt = now + ZOMBIE_LUNGE_COOLDOWN_MS;
    }
    const lunging = now < state.lungeUntil;

    // Right on their heels: a separate always-on surge so chasers close the
    // last few pixels instead of trailing in a conga line.
    const closing = gap <= ZOMBIE_CLOSE_RANGE ? ZOMBIE_CLOSE_BOOST : 1;
    // A badly hurt one can't throw itself forward the way a whole one can, so
    // the surges are damped too rather than only the base pace. `step` scales
    // the result again, which is what makes a wounded chaser fall behind.
    const hurt = e.health / (e.maxHealth || 1);
    const surge = hurt < ZOMBIE_HURT_THRESHOLD ? 0.5 + 0.5 * (hurt / ZOMBIE_HURT_THRESHOLD) : 1;
    const speed =
      ZOMBIE_SPEED * (lunging ? 1 + (ZOMBIE_LUNGE_MULTIPLIER - 1) * surge : 1) * (1 + (closing - 1) * surge);

    const desired = headingToward(world, e, state, target.x, target.y, now);
    step(world, e, state, desired, speed, ZOMBIE_TURN_RATE, dt, now);
    return;
  }

  // Nothing in sight, but it watched someone pull a door shut. Go and take
  // the door apart — whatever it was closing itself in with is behind it.
  if (state.doorTarget >= 0) {
    if (now >= state.doorTargetUntil || !isDoorShut(world, state.doorTarget) || !mindsDoors(world, e, state, now)) {
      state.doorTarget = -1;
    } else {
      const spec = world.map.doors[state.doorTarget];
      if (attackBlockingDoor(world, e, state, now)) return;
      const desired = headingToward(world, e, state, spec.x, spec.y, now);
      step(world, e, state, desired, ZOMBIE_SPEED, ZOMBIE_TURN_RATE, dt, now);
      return;
    }
  }

  if (state.lastSeenX !== null && state.lastSeenY !== null) {
    if (Math.hypot(state.lastSeenX - e.x, state.lastSeenY - e.y) < 30) {
      state.lastSeenX = null;
      state.lastSeenY = null;
      state.path = null;
    } else {
      // Something went this way and a door is in the road. Tear at it.
      if (mindsDoors(world, e, state, now) && attackBlockingDoor(world, e, state, now)) return;
      const desired = headingToward(world, e, state, state.lastSeenX, state.lastSeenY, now);
      step(world, e, state, desired, ZOMBIE_SPEED, ZOMBIE_TURN_RATE, dt, now);
      return;
    }
  }

  // Shut in somewhere with nothing to chase: work out that the door is the
  // problem rather than pacing the room until the round ends.
  if (zombieStuckTick(world, e, state, now, dt)) return;

  // Room's empty and this one has the wit to go and find another.
  if (leaveClearedRoom(world, e, state, now, dt)) return;

  // With the city all but emptied, anything shut is worth taking apart on the
  // way past, whether or not this one saw it close.
  if (world.survivorCount < DOOR_FRENZY_SURVIVORS && attackBlockingDoor(world, e, state, now)) {
    return;
  }

  if (now >= state.nextTurnAt) {
    state.nextTurnAt = now + 1800 + Math.random() * 2600;
    state.wanderX = Math.random() * Math.PI * 2; // reused as a stashed heading
  }
  // Walked into a wall on the way. Turn round now rather than leaning on it
  // for the up-to-four seconds until the next scheduled turn comes round.
  if (turnAtWall(world, e, state)) {
    state.wanderX = state.heading;
    state.nextTurnAt = now + 1800 + Math.random() * 2600;
  }
  step(world, e, state, state.wanderX, ZOMBIE_SEARCH_SPEED, ZOMBIE_TURN_RATE, dt, now);
}

// ---------------------------------------------------------------- infection

function convert(world: World, target: Entity, now: number): void {
  target.type = 'zombie';
  target.health = ENTITY_MAX_HEALTH.zombie;
  target.maxHealth = ENTITY_MAX_HEALTH.zombie;
  target.speedMul = rollSpeedMul('zombie');
  world.speedBoosts.delete(target.id);
  world.pendingInfections.delete(target.id);

  const state = newAiState(now, target.x, target.y);
  // Newly turned and single-minded: it wants whoever is standing right there,
  // not a door it can hear somebody behind.
  state.freshUntil = now + FRESH_ZOMBIE_MS;
  world.ai.set(target.id, state);

  remarkOnTurning(world, target, now);
}

/**
 * Somebody turning in the room with you is its own kind of horror, and worth a
 * word — but only when they are the only one in here. With a pack already
 * through the door it is not the moment for anyone to be commenting.
 */
function remarkOnTurning(world: World, turned: Entity, now: number): void {
  const building = buildingIndexAt(world, turned.x, turned.y);
  if (building < 0) return;

  // Anyone else already turned in this building means this is not news.
  for (const other of world.entities.values()) {
    if (other.type !== 'zombie' || other.id === turned.id) continue;
    if (buildingIndexAt(world, other.x, other.y) === building) return;
  }

  for (const other of world.entityGrid.queryCircle(turned.x, turned.y, TURNED_REMARK_RANGE, new Set<Entity>())) {
    if (other.type !== 'human' || world.speech.has(other.id)) continue;
    if (buildingIndexAt(world, other.x, other.y) !== building) continue;
    if (Math.random() >= TURNED_REMARK_CHANCE) continue;

    world.speech.set(other.id, {
      text: TURNED_LINES[Math.floor(Math.random() * TURNED_LINES.length)],
      until: now + FIRST_SIGHT_MS,
    });
    return; // one voice, not a chorus
  }
}

interface GrappleLike {
  zombieIds: Set<string>;
}

/**
 * A grapple almost always ends with the victim breaking free while carrying
 * the infection — they run, then turn minutes later. Clean escapes and
 * on-the-spot turns are both uncommon, and pile-ons push toward turning now.
 */
function resolveGrapple(world: World, targetId: string, session: GrappleLike, now: number): void {
  // Whoever was wrestling is winded afterwards.
  for (const zombieId of session.zombieIds) {
    const state = world.ai.get(zombieId);
    if (state) {
      state.slowUntil = now + ZOMBIE_POST_GRAPPLE_MS;
      state.slowMul = ZOMBIE_POST_GRAPPLE_SLOW;
    }
  }

  const target = world.entities.get(targetId);
  if (!target) return;

  // Kevlar denies the grab outright: no infection, one use spent, and the vest
  // is gone once its third use goes. It is the whole outcome, not a modifier
  // on one — nothing below this runs.
  const inv = world.inventories.get(targetId);
  if (inv && inv.kevlar > 0) {
    inv.kevlar--;
    if (inv.kevlar <= 0) {
      const at = inv.utilities.indexOf('kevlar');
      if (at >= 0) inv.utilities.splice(at, 1);
    }
    world.speedBoosts.set(targetId, now + ESCAPE_BOOST_MS);
    return;
  }

  // An NPC officer who gets grabbed loses their nerve and runs for a while.
  if (target.type === 'officer' && !world.playerIds.has(target.id)) {
    const st = world.ai.get(target.id);
    if (st) st.fleeUntil = now + OFFICER_FLEE_MS;
  }

  const extra = session.zombieIds.size - 1;
  // A flat chance of walking away clean, unless three or more have hold of
  // you, in which case there is simply no getting out of it.
  const escapeChance = session.zombieIds.size >= GRAPPLE_NO_ESCAPE_AT ? 0 : BASE_ESCAPE_CHANCE;
  if (escapeChance > 0 && Math.random() < escapeChance) {
    world.speedBoosts.set(target.id, now + ESCAPE_BOOST_MS);
    return;
  }

  const priorGrapples = world.grappleCounts.get(target.id) ?? 0;
  world.grappleCounts.set(target.id, priorGrapples + 1);

  const instantChance =
    INSTANT_INFECT_BASE +
    extra * INSTANT_INFECT_PER_EXTRA_ZOMBIE +
    priorGrapples * INSTANT_INFECT_PER_PRIOR_GRAPPLE;

  if (Math.random() < instantChance) {
    convert(world, target, now);
    return;
  }

  if (!world.pendingInfections.has(target.id)) {
    world.pendingInfections.set(
      target.id,
      now + TURN_DELAY_MIN_MS + Math.random() * (TURN_DELAY_MAX_MS - TURN_DELAY_MIN_MS),
    );
  }

  // Bitten but on their feet: brief burst of speed, then run for it.
  world.speedBoosts.set(target.id, now + ESCAPE_BOOST_MS);
  const state = world.ai.get(target.id);
  if (state) {
    state.mode = 'retreat';
    state.retreatUntil = now + RETREAT_MS * state.panicScale;
  }
}

export function processPendingInfections(world: World, now: number): void {
  for (const [id, turnAt] of Array.from(world.pendingInfections)) {
    if (now < turnAt) continue;
    const entity = world.entities.get(id);
    if (!entity || entity.type === 'zombie') {
      world.pendingInfections.delete(id);
      continue;
    }
    convert(world, entity, now);
  }
}

export function updateAi(world: World, now: number, dt: number, frozen: Set<string>): void {
  // One BFS serves every fleeing human this tick, instead of each of them
  // running its own search.
  if (now >= world.nextDangerRebuild) {
    world.nextDangerRebuild = now + DANGER_REBUILD_MS;
    const sources: Array<{ x: number; y: number }> = [];
    for (const e of world.entities.values()) {
      if (e.type === 'zombie') sources.push({ x: e.x, y: e.y });
    }
    world.danger.rebuild(sources);
  }

  for (const [targetId, session] of Array.from(world.grapples)) {
    if (now < session.endsAt) continue;
    resolveGrapple(world, targetId, session, now);
    world.grapples.delete(targetId);
  }

  processPendingInfections(world, now);
  clearExpiredPleas(world, now);

  // Counted once here rather than per zombie deciding whether to bother with
  // a door.
  let survivors = 0;
  for (const e of world.entities.values()) {
    if (e.type === 'human' || e.type === 'officer') survivors++;
  }
  world.survivorCount = survivors;

  for (const e of world.entities.values()) {
    // Players keep manual control even after they turn — no AI magnet.
    if (world.playerIds.has(e.id)) continue;
    if (frozen.has(e.id)) continue;

    const state = getAi(world, e, now);
    if (e.type === 'human') updateHuman(world, e, state, now, dt);
    else if (e.type === 'officer') {
      // Bots stand in for the human players; grey NPC officers are separate.
      if (world.bots.has(e.id)) updateBotOfficer(world, e, state, now, dt);
      else updateNpcOfficer(world, e, state, now, dt);
    }
    else if (e.type === 'zombie') updateZombie(world, e, state, now, dt);
  }
}
