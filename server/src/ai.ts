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
import {
  addPlea,
  clearExpiredPleas,
  damageDoor,
  doorsNear,
  doorSide,
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
import { fire } from './combat.js';

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

  // Not everyone makes for the nearest door — some have somewhere particular
  // in mind, blocks away, and will run the whole way to it.
  const radius = state.shelterFar ? SHELTER_FAR_RADIUS : SHELTER_SEARCH_RADIUS;

  const near: Array<{ i: number; d: number }> = [];
  const list = world.map.buildings;
  for (let i = 0; i < list.length; i++) {
    const b = list[i];
    const dx = b.x + b.w / 2 - e.x;
    const dy = b.y + b.h / 2 - e.y;
    const dist = Math.hypot(dx, dy);
    if (dist > radius) continue;
    // Doubling back past the thing chasing us is worse than staying outside.
    if (dist > 90 && dx * awayX + dy * awayY < 0) continue;
    near.push({ i, d: dist });
  }
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
function doorInTheWay(world: World, e: Entity, state: AiState): number {
  const probe = e.radius + 16;
  const aheadX = e.x + Math.cos(state.heading) * probe;
  const aheadY = e.y + Math.sin(state.heading) * probe;

  let best = -1;
  let bestDist = Infinity;

  for (const index of doorsNear(world, e.x, e.y, probe + 24)) {
    if (!isDoorShut(world, index)) continue;
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

/** Start working a door. Whatever they were doing is left exactly as it was. */
function beginDoorWork(
  world: World,
  e: Entity,
  state: AiState,
  index: number,
  action: 'open' | 'close' | 'lock' | 'unlock',
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
    shutDoor(world, index, now);
    if (state.doorFollowUpLock) {
      beginDoorWork(world, e, state, index, 'lock', now);
      return;
    }
    state.doorFollowUp = -1;
  } else if (action === 'lock') {
    lockDoor(world, index);
    state.doorFollowUp = -1;
    state.doorFollowUpLock = false;
    warnTheRoom(world, e, state, index, now);
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
  if (Math.random() >= DOOR_WARN_CHANCE) return;

  const building = buildingIndexAt(world, e.x, e.y);
  if (building < 0) return;

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

    if (!door || door.broken || !door.open || gone > 170) {
      // Gone, already shut by someone else, or we've wandered too far to bother.
      state.doorFollowUp = -1;
      state.doorFollowUpLock = false;
    } else if (crossed && gone < 64 && (door.busyBy === null || door.busyBy === e.id)) {
      beginDoorWork(world, e, state, index, 'close', now);
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

  const ahead = doorInTheWay(world, e, state);
  if (ahead < 0) return false;

  const door = world.doors[ahead];
  if (!door || (door.busyBy !== null && door.busyBy !== e.id)) return false;

  if (door.locked) {
    // A door an officer bolted is left well alone.
    if (door.playerLocked) return false;

    // From the inside you can simply draw the bolt back — it just takes a
    // moment. From the outside, a locked door is a locked door.
    if (insideOfDoor(world, ahead, e.x, e.y)) {
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
  if (!frightened) pickWanderTarget(world, e, state, now, false);
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

  if (door.busyBy !== null && door.busyBy !== e.id) return true; // wait their turn
  beginDoorWork(world, e, state, index, 'unlock', now);
  state.answeringDoor = -1;
  world.doorPleas.delete(index);
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

  // Doors come next. Working a handle takes a second or two and holds them
  // in place, but never touches where they were headed — the moment it opens
  // they carry on to it.
  if (doorTick(world, e, state, now, dt)) return;
  if (begTick(world, e, state, now, dt)) return;
  if (answerPleaTick(world, e, state, now, dt)) return;

  // Seeing a zombie overrides whatever else was happening.
  if (state.threatCount > 0) {
    state.mode = 'flee';
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
          const stale =
            state.shelterBuilding < 0 ||
            state.threatPoints.some((t) => buildingIndexAt(world, t.x, t.y) === state.shelterBuilding);
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
    e.facing = aim;

    if (now >= state.nextShotAt) {
      state.nextShotAt = now + interval;
      fire(world, e, aim, bloom, now);
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
  const desired = headingToward(world, e, state, state.wanderX, state.wanderY, now);
  step(world, e, state, desired, HUMAN_WALK_SPEED * 1.15, HUMAN_TURN_RATE, dt, now);
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
  for (const index of doorsNear(world, e.x, e.y, e.radius + 30)) {
    if (!isDoorShut(world, index)) continue;
    const door = world.map.doors[index];

    const dx = door.x - e.x;
    const dy = door.y - e.y;
    if (Math.hypot(dx, dy) > e.radius + 26 + door.halfSpan * 0.5) continue;

    e.facing = Math.atan2(dy, dx);
    state.heading = e.facing;
    if (now >= state.nextDoorHitAt) {
      state.nextDoorHitAt = now + DOOR_ATTACK_INTERVAL_MS;
      damageDoor(world, index, DOOR_ZOMBIE_DAMAGE);
    }
    return true;
  }
  return false;
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
        session = {
          zombieIds: new Set(),
          endsAt: now + GRAPPLE_MIN_MS + Math.random() * (GRAPPLE_MAX_MS - GRAPPLE_MIN_MS),
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
    const speed = ZOMBIE_SPEED * (lunging ? ZOMBIE_LUNGE_MULTIPLIER : 1) * closing;

    const desired = headingToward(world, e, state, target.x, target.y, now);
    step(world, e, state, desired, speed, ZOMBIE_TURN_RATE, dt, now);
    return;
  }

  // Nothing in sight, but it watched someone pull a door shut. Go and take
  // the door apart — whatever it was closing itself in with is behind it.
  if (state.doorTarget >= 0) {
    if (now >= state.doorTargetUntil || !isDoorShut(world, state.doorTarget)) {
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
      if (attackBlockingDoor(world, e, state, now)) return;
      const desired = headingToward(world, e, state, state.lastSeenX, state.lastSeenY, now);
      step(world, e, state, desired, ZOMBIE_SPEED, ZOMBIE_TURN_RATE, dt, now);
      return;
    }
  }

  if (now >= state.nextTurnAt) {
    state.nextTurnAt = now + 1800 + Math.random() * 2600;
    state.wanderX = Math.random() * Math.PI * 2; // reused as a stashed heading
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
  world.ai.set(target.id, newAiState(now, target.x, target.y));
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

  // An NPC officer who gets grabbed loses their nerve and runs for a while.
  if (target.type === 'officer' && !world.playerIds.has(target.id)) {
    const st = world.ai.get(target.id);
    if (st) st.fleeUntil = now + OFFICER_FLEE_MS;
  }

  const extra = session.zombieIds.size - 1;
  const escapeChance = Math.max(0, BASE_ESCAPE_CHANCE - extra * ESCAPE_CHANCE_PER_EXTRA_ZOMBIE);
  if (Math.random() < escapeChance) {
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

  for (const e of world.entities.values()) {
    // Players keep manual control even after they turn — no AI magnet.
    if (world.playerIds.has(e.id)) continue;
    if (frozen.has(e.id)) continue;

    const state = getAi(world, e, now);
    if (e.type === 'human') updateHuman(world, e, state, now, dt);
    else if (e.type === 'officer') updateNpcOfficer(world, e, state, now, dt);
    else if (e.type === 'zombie') updateZombie(world, e, state, now, dt);
  }
}
