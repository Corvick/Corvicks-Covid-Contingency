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
  SOLDIER_BLOOM_RAD,
  SOLDIER_SHOOT_INTERVAL_MS,
  SOLDIER_SIGHT,
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
} from '../../shared/constants.js';
import { angleDelta, clamp, turnToward } from './geometry.js';
import {
  damageWindow,
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
  const clear = (angle: number) =>
    !world.nav.isBlocked(e.x + Math.cos(angle) * 42, e.y + Math.sin(angle) * 42);

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

function pickWanderTarget(
  world: World,
  e: Entity,
  state: AiState,
  now: number,
  pause = true,
  radius = HUMAN_WANDER_RADIUS,
): void {
  const ATTEMPTS = 6;
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
  for (const b of world.map.buildings) {
    if (x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h) return true;
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
        .map((b) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 }))
        .map((c) => ({ ...c, d: Math.hypot(c.x - e.x, c.y - e.y) }))
        .filter((c) => world.nav.isReachable(c.x, c.y))
        .sort((a, b) => a.d - b.d)
        .slice(0, REFUGE_CANDIDATES);
      if (candidates.length === 0) return null;

      const pick = candidates[Math.min(candidates.length - 1, Math.floor(state.refugeBias * candidates.length))];
      state.refugeX = pick.x;
      state.refugeY = pick.y;
      return { x: pick.x, y: pick.y };
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

/** The building footprint a point sits inside, if any. */
function buildingContaining(world: World, x: number, y: number): { x: number; y: number; w: number; h: number } | null {
  for (const b of world.map.buildings) {
    if (x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h) return b;
  }
  return null;
}

/**
 * Nearest patch of open ground outside the building. Pathfinding to it routes
 * through a doorway on its own, which is what gets people out instead of
 * pressing them into the back wall.
 */
function exitPointFor(
  world: World,
  b: { x: number; y: number; w: number; h: number },
  e: Entity,
  state: AiState,
): { x: number; y: number } | null {
  const m = INDOOR_EXIT_MARGIN;
  const candidates = [
    { x: e.x, y: b.y - m },
    { x: e.x, y: b.y + b.h + m },
    { x: b.x - m, y: e.y },
    { x: b.x + b.w + m, y: e.y },
  ]
    .map((c) => ({ x: clamp(c.x, 60, WORLD_WIDTH - 60), y: clamp(c.y, 60, WORLD_HEIGHT - 60) }))
    .filter((c) => !world.nav.isBlocked(c.x, c.y) && world.nav.isReachable(c.x, c.y))
    .map((c) => ({ ...c, d: Math.hypot(c.x - e.x, c.y - e.y) }))
    .sort((a, b2) => a.d - b2.d);

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

  // Seeing a zombie overrides whatever else was happening.
  if (state.threatCount > 0) {
    state.mode = 'flee';
    const boostUntil = world.speedBoosts.get(e.id);
    const boosted = boostUntil !== undefined && now < boostUntil;
    if (boostUntil !== undefined && !boosted) world.speedBoosts.delete(e.id);
    const speed = HUMAN_FLEE_SPEED * (boosted ? ESCAPE_SPEED_MULTIPLIER : 1);

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

    // Scraping along a wall counts as not escaping — commit to a new bearing.
    if (now >= state.lastUnstickCheck) {
      state.lastUnstickCheck = now + UNSTICK_CHECK_MS;
      const progress = Math.hypot(e.x - state.unstickX, e.y - state.unstickY);
      if (progress < UNSTICK_MIN_PROGRESS && now >= state.unstickUntil) {
        const away = Math.atan2(e.y - state.threatY, e.x - state.threatX);
        const turn = (Math.random() < 0.5 ? -1 : 1) * (Math.PI / 3 + Math.random() * (Math.PI / 3));
        state.unstickHeading = away + turn;
        state.unstickUntil = now + UNSTICK_COMMIT_MS;
      }
      state.unstickX = e.x;
      state.unstickY = e.y;
    }

    if (now < state.unstickUntil) {
      step(world, e, state, state.unstickHeading, speed, HUMAN_TURN_RATE, dt, now);
      return;
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
      if (building) {
        const threatIndoors = state.threatPoints.some(
          (t) =>
            t.x > building.x &&
            t.x < building.x + building.w &&
            t.y > building.y &&
            t.y < building.y + building.h,
        );

        // A zombie prowling outside is a reason to stay put, not to run into
        // the street. Only the jumpy minority bolts for the door.
        if (!threatIndoors && state.staysIndoors) {
          state.mode = 'settled';
          return;
        }

        if (threatIndoors) {
          const exit = exitPointFor(world, building, e, state);
          if (exit) {
            const toExit = headingToward(world, e, state, exit.x, exit.y, now);
            step(world, e, state, skirtThreat(world, e, state, toExit), speed, HUMAN_TURN_RATE, dt, now);
            return;
          }
        }
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
      state.retreatUntil = now + RETREAT_MS;
      break;
    }
    case 'retreat': {
      const away = Math.hypot(e.x - state.threatX, e.y - state.threatY);
      if (now >= state.retreatUntil || away >= RETREAT_DISTANCE) {
        state.mode = 'panic';
        state.panicUntil = now + PANIC_MS;
        pickWanderTarget(world, e, state, now, false, HUMAN_WANDER_RADIUS * 1.4);
      } else {
        const desired = Math.atan2(e.y - state.threatY, e.x - state.threatX);
        const boostUntil = world.speedBoosts.get(e.id);
        const boosted = boostUntil !== undefined && now < boostUntil;
        const speed = HUMAN_FLEE_SPEED * (boosted ? ESCAPE_SPEED_MULTIPLIER : 1);
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

  // No zombie in view, but a neighbour sprinting past is its own signal.
  if (state.witness !== 'ignore' && state.mode === 'wander' && now >= state.nextWitnessCheck) {
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

  const desired = headingToward(world, e, state, state.wanderX, state.wanderY, now);
  step(world, e, state, desired, HUMAN_WALK_SPEED, HUMAN_TURN_RATE, dt, now);
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

function updateZombie(world: World, e: Entity, state: AiState, now: number, dt: number): void {
  if (now >= state.nextSenseAt) {
    state.nextSenseAt = now + SENSE_INTERVAL_MS;
    senseTarget(world, e, state);
  }

  const target = state.targetId ? world.entities.get(state.targetId) : undefined;

  if (target && (target.type === 'human' || target.type === 'officer')) {
    const dist = Math.hypot(target.x - e.x, target.y - e.y);
    const gap = dist - (e.radius + target.radius);

    // Glass between us and dinner: claw at it until it gives.
    if (attackBlockingWindow(world, e, state, target, now)) return;

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

  if (state.lastSeenX !== null && state.lastSeenY !== null) {
    if (Math.hypot(state.lastSeenX - e.x, state.lastSeenY - e.y) < 30) {
      state.lastSeenX = null;
      state.lastSeenY = null;
      state.path = null;
    } else {
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
    state.retreatUntil = now + RETREAT_MS;
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
  for (const [targetId, session] of Array.from(world.grapples)) {
    if (now < session.endsAt) continue;
    resolveGrapple(world, targetId, session, now);
    world.grapples.delete(targetId);
  }

  processPendingInfections(world, now);

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
