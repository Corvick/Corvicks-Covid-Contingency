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
  ZOMBIE_ROOM_CLEAR_SLOW_MS,
  ZOMBIE_EXIT_COMMIT_MS,
  ZOMBIE_EXIT_REACH,
  ZOMBIE_SWEEP_MEMORY_MS,
  ZOMBIE_LAST_SEEN_MS,
  ZOMBIE_EXIT_PROGRESS_MS,
  ZOMBIE_EXIT_PROGRESS_MIN,
  ZOMBIE_STREET_WANDER_MS,
  ZOMBIE_STREET_WANDER_SLOW_MS,
  ZOMBIE_HUNT_RADIUS,
  RUMOUR_WANDER_WEIGHT,
  RUMOUR_SHELTER_WEIGHT,
  RUMOUR_ESCAPE_WEIGHT,
  RUMOUR_REFUGE_LIMIT,
  GUNNER_REFUGE_PREFERENCE,
  GUNNER_REFUGE_GAP,
  PROTECTED_DIST,
  PROTECT_CHATTER_MIN_MS,
  PROTECT_CHATTER_MAX_MS,
  PROTECT_CHATTER_CHANCE,
  PROTECT_CHATTER_MS,
  PROTECT_LINES,
  SHELTER_MULTI_EXIT_BONUS,
  ESCAPE_MIDPOINT_WEIGHT,
  BARRICADE_SECOND_EXIT_BONUS,
  FOLLOW_CROWD_CHECK_MS,
  FOLLOW_CROWD_RANGE,
  FOLLOW_CROWD_COMMIT_MS,
  FOLLOW_CROWD_MARGIN,
  GRAPPLE_REACH_BONUS,
  INFECTED_TARGET_PENALTY,
  ZOMBIE_SPREAD_PENALTY,
  CHARGE_BARS,
  CHARGE_INFECTED_SIGHT,
  BOT_CHARGE_BARS,
  BOT_CHARGE_AIM_TOLERANCE,
  BOT_CHARGE_GIVE_UP_MS,
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
  SWAT_SIGHT,
  SWAT_BLOOM_RAD,
  SWAT_SHOOT_INTERVAL_MS,
  RIFLEMAN_SIGHT,
  RIFLEMAN_BLOOM_RAD,
  RIFLEMAN_SHOOT_INTERVAL_MS,
  SQUAD_SPREAD,
  SQUAD_SLACK,
  SQUAD_SWEEP_SAMPLES,
  SQUAD_SWEEP_MIN,
  SQUAD_SWEEP_MAX,
  SQUAD_SWEEP_STANDOFF,
  VAN_GUARD_RADIUS,
  BEACON_PLANT_REACH,
  BEACON_PLANT_GIVE_UP_MS,
  BEACON_PLANT_MS,
  BEACON_PLANTED_LINE,
  BEACON_SHOUT_MS,
  BEACON_GUARD_RADIUS,
  BOT_BEACON_SAMPLES,
  BOT_BEACON_MIN_CLEARANCE,
  BOT_BEACON_WALK_WEIGHT,
  BOT_BEACON_SHOUT_CHECK_MS,
  BOT_BEACON_SHOUT_MIN,
  BEACON_MUSTER_RADIUS,
  BEACON_CALL_RADIUS,
  BEACON_SHOUT,
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
  KEVLAR_IMMUNE_MS,
  SHIELD_FRONT_ARC,
  SHIELD_BACK_ARC,
  RADIO_CALL_RANGE,
  RADIO_CALL_SCAN_MS,
  ESCORT_NEAR,
  ESCORT_FAR,
  THERMAL_RANGE,
  BOT_FRAG_MIN_TARGETS,
  BOT_THROW_INTERVAL_MS,
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
  BOT_LOOT_SNUB_MS,
  BOT_LOOT_MIN_CLEARANCE,
  BOT_SWAP_MARGIN,
  BOT_REFILL_APPETITE,
  BOT_WALK_SPEED,
  BOT_SPRINT_SPEED,
  BOT_BOLT_DIST,
  BOT_SAFE_DIST,
  BOT_SHAKEN_MS,
  BOT_SPRINT_TRIGGER,
  BOT_DODGE_RANGE,
  BOT_DODGE_CONE,
  BOT_DODGE_PROBE,
  BOT_DODGE_SWING_MIN,
  BOT_DODGE_SWING_MAX,
  BOT_GIVE_GROUND_PROBE,
  BOT_GIVE_GROUND_BIAS,
  BOT_DOOR_LISTEN_RANGE,
  BOT_DOOR_STANDOFF,
  BOT_DOOR_WATCH_MS,
  BOT_DOOR_SNUB_MS,
  BOT_KITE_SPEED_MUL,
  BOT_HUNT_STANDOFF,
  BOT_SCOPE_SIGHT,
  BOT_SCOPE_STANDOFF,
  BOT_SMOKE_COOLDOWN_MS,
  BOT_PATROL_SAMPLES,
  BOT_PATROL_MIN,
  BOT_PATROL_MAX,
  STAMINA_MAX,
  STAMINA_DRAIN_PER_SEC,
  STAMINA_REGEN_PER_SEC,
  STAMINA_SPRINT_FLOOR,
  STAMINA_RECOVERY_THRESHOLD,
  BOOTS_SPEED_MUL,
  BOOTS_STAMINA_MUL,
  GUN_SLOTS,
  DOOR_CLAIM_GRACE_MS,
  WALL_TURN_PROBE,
  CORNER_CLEARANCE,
  CORNER_PUSH,
  BOT_TURN_RATE,
  BOT_RANGE_SLACK,
  BOT_DEPLOY_MIN_DIST,
  BOT_BUSH_CLEARANCE,
  BOT_BUSH_PUSH,
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
  TURNING_LINES,
  TURNING_LINE_CHANCE,
  TURNING_TELL_MS,
  FRESH_ZOMBIE_SLOW_MS,
  FRESH_ZOMBIE_SLOW_MUL,
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
import { angleDelta, clamp, segmentCircleT, segmentRectT, turnToward } from './geometry.js';
import {
  collect,
  dropHeld,
  gunSlots,
  heldGunSlot,
  heldItem,
  nearestZombieBearing,
  utilitySlots,
  type Inventory,
} from './inventory.js';
import { zombieAtSandbag } from './emplacement.js';
import { OUTSIDE } from './rooms.js';

import { ITEMS, type ItemDef, type ItemId } from '../../shared/items.js';
import type { Bush, PickupState, Wall } from '../../shared/types.js';
import {
  addPlea,
  alertZombiesToDoor,
  claimDoor,
  clearExpiredPleas,
  damageDoor,
  doorBusyForOthers,
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
  isInGrapple,
  isWindowIntact,
  newAiState,
  rollSpeedMul,
  speedAt,
  type AiState,
  type Entity,
  type World,
} from './world.js';
import { fire, fireHeld } from './combat.js';
import { requestBeacon } from './heli.js';

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
  // A zombie a mine has dropped is going nowhere and grabbing nobody. Folding
  // it in here rather than checking in each branch is what keeps the stun from
  // needing a mention in twenty places.
  const now = Date.now();
  for (const [id, until] of world.stunned) {
    if (now < until) frozen.add(id);
  }
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

/**
 * Is this one visibly going over — the red they turn across `TURNING_TELL_MS`?
 *
 * The same window the client draws, read off the same clock, so what the crowd
 * reacts to is exactly what a player can see on the body.
 */
function isVisiblyTurning(world: World, id: string, now: number): boolean {
  const turnAt = world.pendingInfections.get(id);
  return turnAt !== undefined && turnAt - now <= TURNING_TELL_MS;
}

function senseThreats(
  world: World,
  e: Entity,
  state: AiState,
  now: number,
  sight: number,
  /** Officers are looking for these; a hedge doesn't hide one from them. */
  throughBushes = false,
): void {
  const inv0 = world.inventories.get(e.id);
  const reach = inv0?.utilities.includes('thermalGoggles') ? Math.max(sight, THERMAL_RANGE) : sight;
  const nearby = world.entityGrid.queryCircle(e.x, e.y, reach, new Set<Entity>());

  state.threatPoints.length = 0;
  let nearest: Entity | null = null;
  let nearestDist = Infinity;

  // Goggles are the bot's version of the orange blob: inside their range a
  // wall stops mattering, so a goggled bot reacts to the room it is walking
  // into exactly as a player does to a contact they can see through it.
  const inv = world.inventories.get(e.id);
  const thermal = inv?.utilities.includes('thermalGoggles') ? THERMAL_RANGE : 0;

  // Goggles tell you something is *there*. They do not give you a shot at it,
  // so a heat contact is kept out of `nearest` — which is what becomes
  // `targetId`, and what the bot aims and fires along. Let one through and a
  // bot stands in a corridor emptying a magazine into the wall it is behind.
  for (const other of nearby) {
    if (other.id === e.id) continue;
    // Somebody visibly going over counts as a threat to give room to, but
    // never as something to shoot. They are still a person — see below.
    const turning = other.type !== 'zombie' && isVisiblyTurning(world, other.id, now);
    if (other.type !== 'zombie' && !turning) continue;
    const dist = Math.hypot(other.x - e.x, other.y - e.y);
    const seen =
      dist <= sight && hasLineOfSight(world, e.x, e.y, other.x, other.y, throughBushes);
    // Goggles read the dead, not the dying: a body still warm and still human
    // is not a heat contact.
    const felt = !turning && thermal > 0 && dist <= thermal;
    if (!seen && !felt) continue;

    // Awareness either way: this drives bolting, the safest heading and where
    // they choose to stand, all of which should know about something behind a
    // wall if the goggles do.
    state.threatPoints.push({ x: other.x, y: other.y });
    if (!seen) continue;

    // The one thing a turning body is *not* is a target. Kept out of `nearest`
    // — which becomes `targetId`, and is what an officer aims and fires along
    // — exactly as a heat contact is, and for a stronger reason: nobody should
    // be shooting somebody who has not turned yet. The rumour field is left
    // alone too; it holds where *zombies* were seen, and they will stamp it
    // themselves in a moment.
    if (turning) continue;

    // Only what was actually *seen* goes into the crowd's memory. That is what
    // keeps the rumour field honest — it holds what somebody witnessed, and a
    // heat blob through a wall is not a witness account. Stamped here rather
    // than in a second pass so the line-of-sight test is only paid once.
    world.rumour.stamp(other.x, other.y, now);

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
      if (heldDist <= sight && hasLineOfSight(world, e.x, e.y, held.x, held.y, throughBushes)) {
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
 * Lean away from foliage. A bot has no idea what is standing in a hedge, and
 * would rather find out from outside it — but this is a preference, not a
 * rule: it is a blend into the heading, so a bot whose business is in the
 * trees still walks into them.
 */
function avoidBushes(world: World, e: Entity, desired: number): number {
  const r = BOT_BUSH_CLEARANCE;
  let pushX = 0;
  let pushY = 0;
  for (const bush of world.bushGrid.queryRect(e.x - r, e.y - r, e.x + r, e.y + r, new Set<Bush>())) {
    const d = Math.hypot(e.x - bush.x, e.y - bush.y);
    const near = bush.r + r;
    if (d >= near || d === 0) continue;
    const weight = (1 - d / near) * BOT_BUSH_PUSH;
    pushX += ((e.x - bush.x) / d) * weight;
    pushY += ((e.y - bush.y) / d) * weight;
  }
  if (pushX === 0 && pushY === 0) return desired;
  return Math.atan2(Math.sin(desired) + pushY, Math.cos(desired) + pushX);
}

/**
 * Nudge a heading away from whatever wall is nearest, so an officer rounds a
 * corner in an arc rather than scraping the inside of it. Blended as vectors
 * rather than clamped, so open ground is unaffected and the pull grows as the
 * wall closes.
 *
 * Doorways are left alone. Walls stand either side of one, and a steering rule
 * that keeps its distance from walls is a steering rule that cannot walk
 * through a door.
 */
function widenCorners(world: World, e: Entity, desired: number): number {
  // Any doorway at all, hung with a door or not — the gap is the point.
  for (const _ of doorsNear(world, e.x, e.y, CORNER_CLEARANCE + 30)) return desired;

  const r = CORNER_CLEARANCE;
  const walls = world.wallGrid.queryRect(e.x - r, e.y - r, e.x + r, e.y + r, new Set<Wall>());
  let nearestX = 0;
  let nearestY = 0;
  let nearest = Infinity;
  for (const wall of walls) {
    const nx = clamp(e.x, wall.x, wall.x + wall.w);
    const ny = clamp(e.y, wall.y, wall.y + wall.h);
    const d = Math.hypot(e.x - nx, e.y - ny);
    if (d < nearest) {
      nearest = d;
      nearestX = nx;
      nearestY = ny;
    }
  }
  if (nearest >= r || nearest === 0) return desired;

  const away = Math.atan2(e.y - nearestY, e.x - nearestX);
  const weight = (1 - nearest / r) * CORNER_PUSH;
  return Math.atan2(
    Math.sin(desired) + Math.sin(away) * weight,
    Math.cos(desired) + Math.cos(away) * weight,
  );
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

  // Score the candidates rather than taking the first walkable one, so nobody
  // strolls off toward a street somebody has been shouting about. Read from
  // the rumour field, not the danger field: this has to be somewhere the crowd
  // has actually heard is bad, not somewhere a zombie happens to be standing
  // where nobody has ever seen it.
  let bestX = e.x;
  let bestY = e.y;
  let bestScore = -Infinity;

  for (let i = 0; i < ATTEMPTS; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 80 + Math.random() * radius;
    const x = clamp(e.x + Math.cos(angle) * dist, 60, WORLD_WIDTH - 60);
    const y = clamp(e.y + Math.sin(angle) * dist, 60, WORLD_HEIGHT - 60);
    if (world.nav.isBlocked(x, y)) continue;

    const score = -world.rumour.heatAt(x, y, now) * RUMOUR_WANDER_WEIGHT + Math.random() * 60;
    if (score > bestScore) {
      bestScore = score;
      bestX = x;
      bestY = y;
    }
  }

  // Every sample landed in geometry: take a raw one rather than standing still.
  if (bestScore === -Infinity) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 80 + Math.random() * radius;
    bestX = clamp(e.x + Math.cos(angle) * dist, 60, WORLD_WIDTH - 60);
    bestY = clamp(e.y + Math.sin(angle) * dist, 60, WORLD_HEIGHT - 60);
  }
  state.wanderX = bestX;
  state.wanderY = bestY;
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

/** Somewhere to stand and somebody to stand behind. */
interface Protector {
  /** Where to actually stand — behind the bags, or beside the officer. */
  x: number;
  y: number;
  dist: number;
  /** A gun on a mount rather than a man with a pistol. */
  emplaced: boolean;
}

/**
 * The nearest thing worth hiding behind: an officer of any kind — grey NPC,
 * bot or player — or a deployed pocket gunner.
 *
 * An emplacement wins against a lone officer half again as far away, because a
 * machine gun behind a wall of sandbags plainly is the safer bet. The spot
 * offered is *behind* the bags rather than on them, so a crowd gathering at one
 * doesn't wander into its own gun's field of fire.
 */
function nearestProtector(world: World, e: Entity, range: number): Protector | null {
  let best: Protector | null = null;
  let bestScore = Infinity;

  for (const emplacement of world.emplacements.values()) {
    const dist = Math.hypot(emplacement.x - e.x, emplacement.y - e.y);
    if (dist > range) continue;
    const score = dist * GUNNER_REFUGE_PREFERENCE;
    if (score >= bestScore) continue;
    bestScore = score;
    best = {
      x: emplacement.x - Math.cos(emplacement.arc) * GUNNER_REFUGE_GAP,
      y: emplacement.y - Math.sin(emplacement.arc) * GUNNER_REFUGE_GAP,
      dist,
      emplaced: true,
    };
  }

  const officer = nearestOfType(world, e, 'officer', range);
  if (officer) {
    const dist = Math.hypot(officer.x - e.x, officer.y - e.y);
    if (dist < bestScore) best = { x: officer.x, y: officer.y, dist, emplaced: false };
  }
  return best;
}

/**
 * Saying so, now and then, to whoever is standing between them and it. Rolled
 * on its own long interval rather than per tick — a 40% chance re-rolled
 * thirty times a second is a person who never stops talking.
 */
function protectorChatter(world: World, e: Entity, state: AiState, now: number): void {
  if (now < state.nextProtectSpeechAt) return;
  state.nextProtectSpeechAt =
    now + PROTECT_CHATTER_MIN_MS + Math.random() * (PROTECT_CHATTER_MAX_MS - PROTECT_CHATTER_MIN_MS);
  if (Math.random() >= PROTECT_CHATTER_CHANCE || world.speech.has(e.id)) return;
  world.speech.set(e.id, {
    text: PROTECT_LINES[Math.floor(Math.random() * PROTECT_LINES.length)],
    until: now + PROTECT_CHATTER_MS,
  });
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
 * How much this building recommends itself beyond simply being near.
 *
 * Two things only, and neither of them is anything a person outside a building
 * could not see: how many ways in and out it has from the street, and whether
 * anyone has been shouting about the place. **Locks are deliberately not
 * consulted anywhere in choosing a refuge.** Nobody can tell a bolted door
 * from a shut one until they try it, and finding out the hard way — hammering
 * on it, or going round to another one — is the whole of that little drama.
 */
function shelterAppeal(world: World, index: number, x: number, y: number, now: number): number {
  let ways = 0;
  for (const door of world.map.doors) {
    if (door.building === index && !door.interior) ways++;
  }
  const notATrap = ways >= 2 ? SHELTER_MULTI_EXIT_BONUS : 0;
  return notATrap - world.rumour.heatAt(x, y, now) * RUMOUR_SHELTER_WEIGHT;
}

/**
 * Pick a building to run inside of. Candidates are the nearest few that aren't
 * back past the zombie, don't already have one in them, and still have a way
 * in that isn't covered. `refugeBias` decides where in that shortlist this
 * person starts looking, so a crowd scatters into several doorways instead of
 * funnelling into one.
 *
 * "Covered" means a zombie they can *see* is standing in a doorway, or is
 * closer to it than they are and would plainly get there first. It has nothing
 * to do with whether the door is locked — see `shelterAppeal`.
 */
function chooseShelter(world: World, e: Entity, state: AiState, now: number): boolean {
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

  // Walk the shortlist in `refugeBias` order as before, but take the best of
  // what is acceptable rather than the first — a one-door house at the end of
  // a street somebody is screaming about is still a refuge, just the last one
  // anybody should reach for.
  let bestIndex = -1;
  let bestGoal: { x: number; y: number } | null = null;
  let bestScore = -Infinity;

  for (let k = 0; k < shortlist.length; k++) {
    const entry = shortlist[(start + k) % shortlist.length];
    const index = entry.i;

    if (occupiedBy.includes(index)) continue;
    if (!openDoorInto(world, index, e, state)) continue;

    const goal = interiorPointOf(world, index, state.threatX, state.threatY);
    if (!goal) continue;

    // Order in the shortlist is this person's own preference, so it has to
    // keep counting for something — otherwise everyone converges on whichever
    // building happens to score best and the crowd funnels again.
    const score = shelterAppeal(world, index, goal.x, goal.y, now) - k * 40 - entry.d * 0.08;
    if (score <= bestScore) continue;
    bestScore = score;
    bestIndex = index;
    bestGoal = goal;
  }

  if (bestIndex < 0 || !bestGoal) return false;
  state.shelterBuilding = bestIndex;
  state.shelterX = bestGoal.x;
  state.shelterY = bestGoal.y;
  state.shelterVia = -1;
  return true;
}

/**
 * Another way into the building being made for, one this person hasn't already
 * found bolted. Returns -1 when they have tried them all — at which point the
 * building itself is a dead loss and they look elsewhere.
 *
 * This is knowledge they earned: `refusedDoors` only ever records a door they
 * physically walked up to and tried.
 */
function anotherWayIn(world: World, e: Entity, state: AiState, building: number): number {
  let best = -1;
  let bestGap = Infinity;
  for (const index of world.map.buildings[building]?.doors ?? []) {
    if (world.map.doors[index].interior) continue;
    if (state.refusedDoors.includes(index)) continue;
    const spec = world.map.doors[index];
    if (!world.nav.isReachable(spec.x, spec.y)) continue;
    const gap = Math.hypot(spec.x - e.x, spec.y - e.y);
    if (gap < bestGap) {
      bestGap = gap;
      best = index;
    }
  }
  return best;
}

/** Choose somewhere to hole up based on this human's trait. */
function chooseSettleGoal(
  world: World,
  e: Entity,
  state: AiState,
  now: number,
): { x: number; y: number } | null {
  switch (state.settleTrait) {
    case 'officer': {
      const protector = nearestProtector(world, e, 1200);
      return protector ? { x: protector.x, y: protector.y } : null;
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
      //
      // A refuge somebody has been shouting about is skipped outright: this is
      // where a rattled person decides to spend the rest of the round, and
      // walking into the house a neighbour was just dragged out of is the one
      // decision a frightened crowd would never all make.
      const start = Math.min(candidates.length - 1, Math.floor(state.refugeBias * candidates.length));
      let fallback: { x: number; y: number } | null = null;
      for (let k = 0; k < candidates.length; k++) {
        const index = candidates[(start + k) % candidates.length].i;
        const goal = interiorPointOf(world, index, state.threatX, state.threatY);
        if (!goal) continue;
        if (world.rumour.heatAt(goal.x, goal.y, now) > RUMOUR_REFUGE_LIMIT) {
          fallback ??= goal; // nowhere is quiet; better than standing in the road
          continue;
        }
        state.refugeX = goal.x;
        state.refugeY = goal.y;
        return goal;
      }
      if (fallback) {
        state.refugeX = fallback.x;
        state.refugeY = fallback.y;
      }
      return fallback;
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
    case 'officer':
      return nearestProtector(world, e, PROTECTED_DIST) !== null;
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

    // How safe the *way there* is, not only the far end of it. Scoring the
    // destination alone happily picks somewhere lovely on the other side of
    // the zombie, and then the router walks them straight past it.
    const midX = (e.x + x) / 2;
    const midY = (e.y + y) / 2;
    let midClear = world.danger.distanceAt(midX, midY);
    if (midClear === Infinity) midClear = DANGER_MAX_DISTANCE;
    score += Math.min(midClear, DANGER_MAX_DISTANCE) * ESCAPE_MIDPOINT_WEIGHT;

    // Prefer not doubling back past the thing chasing us.
    const away = Math.atan2(e.y - state.threatY, e.x - state.threatX);
    score += Math.cos(angle - away) * 60;
    // And prefer somewhere we can actually keep moving from.
    score += world.danger.opennessAt(x, y) * 40;
    // Word of a sighting counts too, even where nothing is standing now.
    score -= world.rumour.heatAt(x, y, now) * RUMOUR_ESCAPE_WEIGHT;

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
 * Somewhere deeper in this building to shut a door on, for somebody who would
 * rather barricade than sprint past the thing between them and the street.
 *
 * The room graph is what makes this possible: "the zombie is in my building"
 * used to be the whole answer, and it is far too coarse a one — it is the
 * difference between being trapped with it and being two rooms and a bolted
 * door away from it. Prefers a room with a second way out, so the barricade is
 * a delay rather than a coffin.
 */
function barricadeRoom(
  world: World,
  e: Entity,
  state: AiState,
  now: number,
): { x: number; y: number } | null {
  const here = world.rooms.roomAt(e.x, e.y);
  if (here === OUTSIDE) return null;
  // One in this very room already: there is nothing left to shut on it.
  if (world.rooms.zombiesIn(here) > 0) return null;

  const exits = world.rooms.rooms[here].exits;
  let best: { x: number; y: number } | null = null;
  let bestScore = -Infinity;

  for (const index of exits) {
    // It has to be a doorway with something actually hung in it, or there is
    // nothing to shut and the whole plan is just walking into the next room.
    if (!world.doors[index]) continue;
    const far = world.rooms.farSideOf(index, here);
    if (far === OUTSIDE) continue; // that is the street, and this is not that plan
    if (world.rooms.zombiesIn(far) > 0) continue;

    const room = world.rooms.rooms[far];
    const spec = world.map.doors[index];

    // Away from whatever is chasing us, and ideally not into a dead end.
    let score = Math.hypot(room.x - state.threatX, room.y - state.threatY) * 0.5;
    score -= Math.hypot(spec.x - e.x, spec.y - e.y) * 0.4;
    if (room.exits.length >= 2) score += BARRICADE_SECOND_EXIT_BONUS;
    score -= world.rumour.heatAt(room.x, room.y, now) * RUMOUR_SHELTER_WEIGHT * 0.5;

    if (score > bestScore) {
      bestScore = score;
      best = { x: room.x, y: room.y };
    }
  }
  return best;
}

/**
 * Fall in behind a neighbour who is plainly getting away, when there is no
 * better plan of one's own. Crowds develop currents this way rather than four
 * hundred people each solving the same problem alone.
 */
function crowdHeading(world: World, e: Entity, state: AiState, now: number): number | null {
  if (!state.followsCrowd) return null;
  if (now < state.crowdUntil) return state.crowdHeading;
  if (now < state.nextCrowdCheck) return null;
  state.nextCrowdCheck = now + FOLLOW_CROWD_CHECK_MS;

  const mine = world.danger.distanceAt(
    e.x + Math.cos(state.heading) * ESCAPE_DISTANCE * 0.5,
    e.y + Math.sin(state.heading) * ESCAPE_DISTANCE * 0.5,
  );
  const minePeek = mine === Infinity ? DANGER_MAX_DISTANCE : mine;

  let bestHeading: number | null = null;
  let bestClear = minePeek + FOLLOW_CROWD_MARGIN;

  for (const other of world.entityGrid.queryCircle(e.x, e.y, FOLLOW_CROWD_RANGE, new Set<Entity>())) {
    if (other.id === e.id || other.type !== 'human') continue;
    const theirs = world.ai.get(other.id);
    if (!theirs || (theirs.mode !== 'flee' && theirs.mode !== 'retreat')) continue;
    if (Math.hypot(other.x - e.x, other.y - e.y) > FOLLOW_CROWD_RANGE) continue;

    const px = other.x + Math.cos(theirs.heading) * ESCAPE_DISTANCE * 0.5;
    const py = other.y + Math.sin(theirs.heading) * ESCAPE_DISTANCE * 0.5;
    if (world.nav.isBlocked(px, py)) continue;
    let clear = world.danger.distanceAt(px, py);
    if (clear === Infinity) clear = DANGER_MAX_DISTANCE;
    if (clear <= bestClear) continue;

    bestClear = clear;
    bestHeading = Math.atan2(py - e.y, px - e.x);
  }

  if (bestHeading === null) return null;
  state.crowdHeading = bestHeading;
  state.crowdUntil = now + FOLLOW_CROWD_COMMIT_MS;
  return bestHeading;
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
 *
 * "Here" is the **room**, not the building. The building was the only answer
 * available before the room graph existed, and it is far too coarse a one:
 * it is the difference between being locked in with the thing and being two
 * rooms and a bolted door away from it, and taking it as a veto is what made
 * barricading impossible. Outdoors — a front door, say — there is no room to
 * ask about, so the building test stands.
 *
 * Any zombie in the room counts, not only ones currently in view. Strictly
 * they shouldn't know about one behind the sofa, but bolting themselves in
 * with it reads as a bug every time it happens, so they get the benefit.
 */
function threatSharesRefuge(world: World, e: Entity, state: AiState): boolean {
  const room = world.rooms.roomAt(e.x, e.y);
  if (room !== OUTSIDE) return world.rooms.zombiesIn(room) > 0;

  const building = buildingIndexAt(world, e.x, e.y);
  if (building < 0) return false;

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

  state.doorIndex = index;
  state.doorAction = action;
  // A bot stands in a player's slot, so it works a handle the way a player
  // does: opening is a tap, and a tap is instant. The 1.1-2s a civilian takes
  // is fumbling with a door in a panic, which is not what an officer clearing
  // a building is doing. Only opening — bolting one and kicking one down are
  // deliberate acts and take as long for a bot as for anybody.
  const instant = action === 'open' && world.bots.has(e.id);
  state.doorBusyUntil =
    now +
    (instant
      ? 0
      : action === 'open'
      ? DOOR_OPEN_MIN_MS + Math.random() * (DOOR_OPEN_MAX_MS - DOOR_OPEN_MIN_MS)
      : action === 'lock'
        ? DOOR_LOCK_MIN_MS + Math.random() * (DOOR_LOCK_MAX_MS - DOOR_LOCK_MIN_MS)
        : action === 'unlock'
          ? DOOR_NPC_UNLOCK_MS
          : action === 'kick'
            ? DOOR_KICK_MS
            : DOOR_CLOSE_MS);
  // The claim lapses a beat after the work should have finished. `doorTick` is
  // skipped outright while its owner is being dragged about, so the grace is
  // what stops a door being taken off them mid-handle.
  claimDoor(world, index, e.id, state.doorBusyUntil + DOOR_CLAIM_GRACE_MS);

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
    if (frightened ? state.locksDoors || state.barricades : state.closesDoors) {
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
    if (state.doorFollowUpLock && !threatSharesRefuge(world, e, state)) {
      beginDoorWork(world, e, state, index, 'lock', now);
      return;
    }
    state.doorFollowUp = -1;
    state.doorFollowUpLock = false;
  } else if (action === 'lock') {
    if (threatSharesRefuge(world, e, state)) {
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
    } else if (crossed && !doorBusyForOthers(world, index, e.id, now)) {
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
      if (!doorBusyForOthers(world, index, e.id, now)) {
        state.doorFollowUpLock = state.locksDoors || state.barricades;
        beginDoorWork(world, e, state, index, 'close', now);
        return true;
      }
    } else {
      const desired = headingToward(world, e, state, spec.x, spec.y, now);
      step(world, e, state, desired, HUMAN_FLEE_SPEED, HUMAN_TURN_RATE, dt, now);
      return true;
    }
  }

  if (
    state.threatCount > 0 &&
    state.doorSlam < 0 &&
    (state.slamsDoors || state.barricades) &&
    now >= state.nextSlamCheck
  ) {
    state.nextSlamCheck = now + 900;
    const inside = buildingIndexAt(world, e.x, e.y) >= 0;
    if (inside) {
      let best = -1;
      let bestGap = DOOR_SLAM_RANGE;
      for (const index of doorsNear(world, e.x, e.y, DOOR_SLAM_RANGE)) {
        const door = world.doors[index];
        if (!door || door.broken || !door.open) continue;
        if (doorBusyForOthers(world, index, e.id, now)) continue;
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
      if (frightened ? state.locksDoors || state.barricades : state.closesDoors) {
        state.doorFollowUp = through;
        state.doorFollowUpLock = frightened;
        state.doorFollowUpSide = doorSide(world, through, e.x, e.y);
      }
    }
  }

  const ahead = doorInTheWay(world, e, state, now);
  if (ahead < 0) return false;

  const door = world.doors[ahead];
  if (!door || doorBusyForOthers(world, ahead, e.id, now)) return false;

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

  // An officer listens before it pushes a door open. A room you cannot see
  // into is where a bot meets a pack at arm's length with nowhere to give
  // ground to, and opening the door is the one thing it can't take back.
  // Civilians get none of this — hearing it and going in anyway is most of
  // what makes them civilians.
  if (world.bots.has(e.id) && heardBehindDoor(world, e, ahead)) {
    state.doorIgnore = ahead;
    state.doorIgnoreUntil = now + BOT_DOOR_SNUB_MS;
    // Running for it, and this door is not the way. Standing to cover it is
    // for a bot with the time to; one already breaking contact just goes
    // somewhere else, and the snub above is what keeps it from trying again.
    if (!state.bolting && now >= state.fleeUntil) {
      state.doorWatch = ahead;
      state.doorWatchUntil = now + BOT_DOOR_WATCH_MS;
    }
    return false;
  }

  beginDoorWork(world, e, state, ahead, 'open', now);
  // Nothing to wait for: swing it and carry on walking in the same step, which
  // is what "instantly" has to mean or the bot still pauses for a tick at every
  // doorway. Anyone who takes time over it surrenders the tick as before.
  if (state.doorBusyUntil <= now) {
    state.doorBusyUntil = 0;
    finishDoorWork(world, e, state, now);
    return false;
  }
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

  // Round the back, then. A bolted front door says nothing about the side one,
  // and giving up on the whole building over the first handle that wouldn't
  // turn is what made everybody look like they knew which houses were locked.
  const building = state.shelterBuilding >= 0 ? state.shelterBuilding : world.map.doors[index].building;
  const other = anotherWayIn(world, e, state, building);
  if (other >= 0) {
    state.shelterVia = other;
    state.path = null;
    state.nextPathAt = 0;
    return;
  }

  // Every way in tried and refused. Drop this building and pick another.
  abandonShelter(world, e, state, now);
  if (!frightened) pickWanderTarget(world, e, state, now, false);
}

/** Give up on the building we were making for and look again next scan. */
function abandonShelter(world: World, e: Entity, state: AiState, now: number): void {
  state.shelterBuilding = -1;
  state.shelterX = null;
  state.shelterY = null;
  state.shelterVia = -1;
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
  if (doorBusyForOthers(world, index, e.id, now)) return true; // wait their turn
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
    if (doorBusyForOthers(world, index, e.id, now)) continue;
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
  if (!door || door.broken || door.locked || doorBusyForOthers(world, index, e.id, now)) {
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
    senseThreats(world, e, state, now, HUMAN_SIGHT_RADIUS);
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
      const protector = nearestProtector(world, e, OFFICER_REFUGE_RANGE);
      if (protector) {
        const gap = Math.hypot(protector.x - e.x, protector.y - e.y);
        if (gap > OFFICER_REFUGE_GAP) {
          const desired = headingToward(world, e, state, protector.x, protector.y, now);
          step(world, e, state, skirtThreat(world, e, state, desired), speed, HUMAN_TURN_RATE, dt, now);
          return;
        }
        // Close enough to feel safe: hold beside them and watch the street,
        // and say something to the person doing the shooting.
        protectorChatter(world, e, state, now);
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

        // Some people would rather put a door between them and it than run
        // anywhere. This sits ahead of everything else indoors because it
        // applies either way — one prowling outside is as good a reason to get
        // deeper into the house and bolt the inner door as one already in the
        // hall. Not when it is in this very room, though: at that point there
        // is nothing left to shut.
        if (state.barricades && world.rooms.rooms[world.rooms.roomAt(e.x, e.y)]?.hasInnerExit) {
          const deeper = barricadeRoom(world, e, state, now);
          if (deeper) {
            const inward = headingToward(world, e, state, deeper.x, deeper.y, now);
            step(world, e, state, skirtThreat(world, e, state, inward), speed, HUMAN_TURN_RATE, dt, now);
            return;
          }
        }

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
          if (stale) chooseShelter(world, e, state, now);
        }
        // A door round the side, after finding the front one bolted. Aimed at
        // explicitly, because the router has no idea a door is locked and
        // would simply take them back to the nearest one again.
        if (state.shelterVia >= 0) {
          const via = world.map.doors[state.shelterVia];
          if (Math.hypot(via.x - e.x, via.y - e.y) < 30) {
            state.shelterVia = -1;
          } else {
            const toVia = headingToward(world, e, state, via.x, via.y, now);
            step(world, e, state, skirtThreat(world, e, state, toVia), speed, HUMAN_TURN_RATE, dt, now);
            return;
          }
        }
        if (state.shelterX !== null && state.shelterY !== null) {
          const toShelter = headingToward(world, e, state, state.shelterX, state.shelterY, now);
          step(world, e, state, skirtThreat(world, e, state, toShelter), speed, HUMAN_TURN_RATE, dt, now);
          return;
        }
      }

      // No plan of their own, but somebody alongside is plainly getting away.
      // Sits above the solo escape so a crowd develops currents rather than
      // four hundred people each solving the same problem on their own.
      const crowd = crowdHeading(world, e, state, now);
      if (crowd !== null) {
        step(world, e, state, skirtThreat(world, e, state, crowd), speed, HUMAN_TURN_RATE, dt, now);
        return;
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
        const goal = chooseSettleGoal(world, e, state, now);
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
        const goal = chooseSettleGoal(world, e, state, now);
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
      // Holed up until something scares them again — except for anyone who
      // ended up behind somebody with a gun, who would like that somebody to
      // know they are still there. The clock is checked before the lookup so
      // a street full of settled people isn't running a spatial query each a
      // tick to find the officer who isn't there.
      if (now >= state.nextProtectSpeechAt) {
        if (nearestProtector(world, e, PROTECTED_DIST)) protectorChatter(world, e, state, now);
        else state.nextProtectSpeechAt = now + PROTECT_CHATTER_MIN_MS;
      }
      return;
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

/**
 * What kind of shot a grey officer is. Four grades, and the whole of the
 * difference between them is these four values — how far they see, how wide
 * they spray, how often they pull, and what they are pulling.
 *
 * A lookup rather than a chain of ternaries because there are four of them
 * now: ambient officers who were already on the street and can barely hit a
 * wall, the two riflemen out of a patrol car, a SWAT team out of a van, and
 * troops off a helicopter. Anybody the radio sent is better than anybody who
 * was already standing there, which is the point of picking the handset up.
 */
function officerGrade(
  world: World,
  id: string,
): { sight: number; bloom: number; interval: number; gun?: ItemDef } {
  // A real gun rather than a damage number: `fire` takes an ItemDef and reads
  // its damage and reach off it, so a crew's rifle hits exactly as hard as the
  // one a player can pick up off the floor, and carries as far.
  if (world.swat.has(id)) {
    return {
      sight: SWAT_SIGHT,
      bloom: SWAT_BLOOM_RAD,
      interval: SWAT_SHOOT_INTERVAL_MS,
      gun: ITEMS.semiAutoRifle,
    };
  }
  if (world.riflemen.has(id)) {
    return {
      sight: RIFLEMAN_SIGHT,
      bloom: RIFLEMAN_BLOOM_RAD,
      interval: RIFLEMAN_SHOOT_INTERVAL_MS,
      gun: ITEMS.boltRifle,
    };
  }
  if (world.soldiers.has(id)) {
    return { sight: SOLDIER_SIGHT, bloom: SOLDIER_BLOOM_RAD, interval: SOLDIER_SHOOT_INTERVAL_MS };
  }
  return {
    sight: NPC_OFFICER_SIGHT,
    bloom: NPC_OFFICER_BLOOM_RAD,
    interval: NPC_OFFICER_SHOOT_INTERVAL_MS,
  };
}

/**
 * Where in the formation this one belongs, in world coordinates.
 *
 * Behind the leader and fanned out either side of his back, so the group moves
 * as a wedge rather than a queue. Taken off the leader's *facing* rather than
 * being a fixed world offset — that is what makes the shape swing round with
 * him when he turns a corner instead of the squad crabbing sideways.
 */
function squadPost(lead: Entity, state: AiState): { x: number; y: number } {
  if (state.squadSlot <= 0) return { x: lead.x, y: lead.y };
  // Slots 1..n alternate left and right, widening as they go back.
  const side = state.squadSlot % 2 === 1 ? -1 : 1;
  const rank = Math.ceil(state.squadSlot / 2);
  const bearing = lead.facing + Math.PI + side * (0.5 / rank);
  const reach = SQUAD_SPREAD * (0.7 + rank * 0.35);
  return { x: lead.x + Math.cos(bearing) * reach, y: lead.y + Math.sin(bearing) * reach };
}

/**
 * Somewhere to sweep toward: near the trouble rather than at random.
 *
 * The danger field already knows, geodesically, how far every cell is from the
 * nearest zombie, so wanting to be near it costs one lookup per sample instead
 * of a search. Same trick `botPatrolTarget` uses, without the scope and
 * tracker business that only a bot has — and it falls back to an ordinary
 * wander when nothing anywhere is near anything, which is what a quiet city
 * looks like from inside the field.
 */
function sweepTarget(world: World, e: Entity, state: AiState, now: number): void {
  let best: { x: number; y: number } | null = null;
  let bestScore = -Infinity;

  for (let i = 0; i < SQUAD_SWEEP_SAMPLES; i++) {
    const angle = Math.random() * Math.PI * 2;
    const reach = SQUAD_SWEEP_MIN + Math.random() * (SQUAD_SWEEP_MAX - SQUAD_SWEEP_MIN);
    const x = clamp(e.x + Math.cos(angle) * reach, 70, WORLD_WIDTH - 70);
    const y = clamp(e.y + Math.sin(angle) * reach, 70, WORLD_HEIGHT - 70);
    if (world.nav.isBlocked(x, y) || !world.nav.isReachable(x, y)) continue;
    // Streets, not front rooms. A squad sweeping a city walks the roads.
    if (buildingIndexAt(world, x, y) >= 0) continue;

    const danger = Math.min(world.danger.distanceAt(x, y), DANGER_MAX_DISTANCE);
    let score = -Math.abs(danger - SQUAD_SWEEP_STANDOFF);
    score += world.danger.opennessAt(x, y) * 30;
    if (score > bestScore) {
      bestScore = score;
      best = { x, y };
    }
  }

  if (!best) {
    pickWanderTarget(world, e, state, now, false, HUMAN_WANDER_RADIUS * 1.6);
    return;
  }
  state.wanderX = best.x;
  state.wanderY = best.y;
  state.path = null;
  state.nextPathAt = 0;
}

function updateNpcOfficer(world: World, e: Entity, state: AiState, now: number, dt: number): void {
  const { sight, bloom, interval, gun } = officerGrade(world, e.id);

  if (now >= state.nextSenseAt) {
    state.nextSenseAt = now + SENSE_INTERVAL_MS;
    senseThreats(world, e, state, now, sight);
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
      fire(world, e, state.heading, bloom, now, gun);
    }

    // Walk backwards to hold the far edge of their sight line, never turning
    // away from the thing they're shooting at.
    //
    // The retreat bearing is a local, not `state.heading`. Writing it back
    // there pointed them away from the target, so the next tick's turnToward
    // had to swing the whole 180 degrees round again — and since the retreat
    // band is wide, that happened on nearly every tick. The result was an
    // officer who never finished lining up, almost never passed the firing
    // test, and simply backed away: a grey officer that appeared to be fleeing
    // instead of holding ground and shooting.
    if (dist < NPC_OFFICER_RETREAT_DIST) {
      const backward = Math.atan2(-dy, -dx);
      const speed = speedAt(world, e.x, e.y, HUMAN_WALK_SPEED);
      const stepX = Math.cos(backward) * speed * dt;
      const stepY = Math.sin(backward) * speed * dt;
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

  // Carrying the beacon to where it was called for. Above the guard branch
  // below — he has a mast on his back and somewhere to be — and below the
  // fighting above, since walking into a pack with it is how the whole plan
  // ends up lying in the street.
  if (state.beaconX !== null && state.beaconY !== null) {
    // Started walking on the first tick he has the errand, so the give-up
    // below measures the whole trip rather than the last approach.
    if (state.beaconSetOutAt === 0) state.beaconSetOutAt = now;
    const gap = Math.hypot(state.beaconX - e.x, state.beaconY - e.y);
    const gaveUp = now - state.beaconSetOutAt > BEACON_PLANT_GIVE_UP_MS;
    if (gap > BEACON_PLANT_REACH && !gaveUp) {
      state.beaconPlantAt = 0; // knocked off it: the mast goes up from the start
      if (unstickTick(world, e, state, now, dt, HUMAN_WALK_SPEED * 1.15)) return;
      const desired = avoidBushes(
        world,
        e,
        widenCorners(world, e, headingToward(world, e, state, state.beaconX, state.beaconY, now)),
      );
      step(world, e, state, desired, HUMAN_WALK_SPEED * 1.15, HUMAN_TURN_RATE, dt, now);
      return;
    }

    // Stood on the spot. Getting it up takes a moment, and being dragged off
    // mid-way starts it again rather than banking the progress.
    if (state.beaconPlantAt === 0) state.beaconPlantAt = now + BEACON_PLANT_MS;
    if (now < state.beaconPlantAt) {
      e.facing = state.heading;
      return;
    }

    world.towers.push({ x: e.x, y: e.y });
    if (world.beacon) {
      world.beacon.placed = true;
      world.beacon.x = e.x;
      world.beacon.y = e.y;
    }
    world.speech.set(e.id, { text: BEACON_PLANTED_LINE, until: now + BEACON_SHOUT_MS });
    // The errand is over and the post begins: he holds the mast from here,
    // through the guard branch immediately below, which is why this clears
    // itself rather than staying set.
    state.beaconX = null;
    state.beaconY = null;
    state.guardX = e.x;
    state.guardY = e.y;
    state.guardRadius = BEACON_GUARD_RADIUS;
    return;
  }

  // Minding the van, or holding the beacon he just put up. Neither is a
  // fighting unit's errand — they stand by the thing, which makes them a
  // sentry and the corner a landmark at the same time. Above the patrol and
  // below the fight, like every other standing order here.
  if (state.guardX !== null && state.guardY !== null) {
    const gap = Math.hypot(state.guardX - e.x, state.guardY - e.y);
    if (gap > state.guardRadius) {
      const desired = widenCorners(
        world,
        e,
        headingToward(world, e, state, state.guardX, state.guardY, now),
      );
      step(world, e, state, desired, HUMAN_WALK_SPEED * 1.15, HUMAN_TURN_RATE, dt, now);
      return;
    }
    if (now >= state.nextLookAt) {
      state.nextLookAt =
        now + RALLY_LOOK_MIN_MS + Math.random() * (RALLY_LOOK_MAX_MS - RALLY_LOOK_MIN_MS);
      state.lookHeading = Math.random() * Math.PI * 2;
    }
    state.heading = turnToward(state.heading, state.lookHeading, RALLY_LOOK_TURN_RATE * dt);
    e.facing = state.heading;
    return;
  }

  // Somebody with a radio is calling them in, or a squad leader is walking off
  // and the rest are keeping station. This sits *below* the fighting above it
  // on purpose — an escort that breaks off a firefight to close the last twenty
  // pixels is worse than useless — and above the patrol, so with nothing to
  // shoot at they stay together rather than each wandering off.
  if (state.escortId !== null) {
    const lead = world.entities.get(state.escortId);
    if (!lead || lead.type !== 'officer') {
      state.escortId = null;
      // A squad that has lost its leader promotes itself rather than standing
      // about waiting for a body that is now a zombie somewhere.
      if (state.squadSlot > 0) {
        state.squadSlot = 0;
        state.sweeps = true;
      }
    } else {
      // Loose cohesion: a slot bearing off the leader's back rather than the
      // leader's own feet, so four of them arrive as a group instead of
      // stacking on one point and shoving each other off it.
      const post = squadPost(lead, state);
      const gap = Math.hypot(post.x - e.x, post.y - e.y);
      // Held only once they have drifted well off station. Correcting to an
      // exact spot is a squad that marches; the slack is what makes it read as
      // people moving together.
      const slack = state.squadSlot > 0 ? SQUAD_SLACK : ESCORT_NEAR;
      if (gap > slack) {
        const desired = widenCorners(
          world,
          e,
          headingToward(world, e, state, post.x, post.y, now),
        );
        // They hurry when they've fallen behind and stroll when they're close,
        // so a squad doesn't jog on the spot around whoever called them.
        const pace = gap > ESCORT_FAR ? HUMAN_WALK_SPEED * 1.9 : HUMAN_WALK_SPEED * 1.15;
        step(world, e, state, desired, pace, HUMAN_TURN_RATE, dt, now);
        return;
      }
      // Close enough. Watch the street rather than the person.
      if (now >= state.nextLookAt) {
        state.nextLookAt = now + RALLY_LOOK_MIN_MS + Math.random() * (RALLY_LOOK_MAX_MS - RALLY_LOOK_MIN_MS);
        state.lookHeading = Math.random() * Math.PI * 2;
      }
      state.heading = turnToward(state.heading, state.lookHeading, RALLY_LOOK_TURN_RATE * dt);
      e.facing = state.heading;
      return;
    }
  }

  // Off duty they patrol rather than loiter. A dispatched leader *sweeps*:
  // same walk, but the destination is chosen toward the trouble rather than at
  // random, because a squad that was sent for is a squad that came to look.
  if (now < state.pauseUntil) return;
  if (Math.hypot(state.wanderX - e.x, state.wanderY - e.y) < 24) {
    if (state.sweeps) sweepTarget(world, e, state, now);
    else pickWanderTarget(world, e, state, now);
    return;
  }
  if (turnAtWallAndRepick(world, e, state, now)) return;
  const desired = widenCorners(world, e, headingToward(world, e, state, state.wanderX, state.wanderY, now));
  step(world, e, state, desired, HUMAN_WALK_SPEED * 1.15, HUMAN_TURN_RATE, dt, now);
}

// ---------------------------------------------------------------- bot officers

/**
 * Is this gun worth crossing the street for? Bots rank by the damage a trigger
 * pull actually delivers, so a shotgun's eight pellets count for what they are
 * rather than for one pellet's damage.
 */
/**
 * Loot a bot officer walks straight past. Empty as it stands — the riot shield
 * used to be in here on the grounds that a bot can't work right-click, and
 * that was the wrong reason: the shield is **worn**. It goes up the moment it
 * is picked up and turns a grab away from the front arc while the bot gets on
 * with its guns, without anybody ever pressing anything. Bashing and slinging
 * are the parts a bot can't do, and neither is why you carry one.
 */
const BOT_IGNORES = new Set<ItemId>([]);

function gunWorth(item: ItemId | null): number {
  if (!item) return 0;
  const def = ITEMS[item];
  if (!def || def.kind !== 'gun') return 0;
  // Some guns don't carry their damage in a damage figure — the launcher's is
  // all blast — so they say what they're worth outright.
  if (def.botWorth !== undefined) return def.botWorth;
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
    // The cure gun isn't a weapon. Scoring zero, it would otherwise beat the
    // pistol's fallback and leave a bot pointing a syringe at a horde.
    if (w <= 0) continue;
    if (w > worth) {
      worth = w;
      slot = i + 1;
    }
  }
  if (slot < 0) return { slot: 0, worth: gunWorth('pistol') };
  return { slot, worth };
}

/**
 * Is this bot looking down a scope?
 *
 * The scope is the one piece of kit whose whole value to a player is on the
 * *camera*, which a bot does not have. What is left of it is the range, so
 * that is what a bot gets: it sees to `BOT_SCOPE_SIGHT` and stands off at
 * `BOT_SCOPE_STANDOFF` while the thing is in its hands, and goes back to the
 * ordinary officer's eyes the moment it puts it away.
 */
function botScoped(world: World, e: Entity): boolean {
  const inv = world.inventories.get(e.id);
  if (!inv) return false;
  const held = heldItem(inv);
  return held !== null && ITEMS[held]?.scope === true;
}

/**
 * The gun a bot would give up, and what it is worth.
 *
 * This is the one a full bag is measured against, *not* `bestGun`. Ranking a
 * find against the best gun in the bag asks the wrong question twice over: it
 * refuses a rifle that would plainly beat the pea-shooter in slot three, and
 * when it does accept something it hands over the best gun it owns, because
 * `collect` swaps whatever happens to be in hand. Two officers stood at the
 * same heap therefore kept trading their best weapons for marginal upgrades
 * and dropping something the other one then wanted — the loop in the report.
 *
 * Against the worst slot instead, every swap strictly improves the bag and
 * strictly lowers what is left on the floor, so a pile settles.
 */
function worstGun(inv: Inventory): { slot: number; worth: number } {
  let slot = -1;
  let worth = Infinity;
  for (let i = 0; i < inv.guns.length; i++) {
    const g = inv.guns[i];
    if (!g) continue;
    // A dry gun is handled by the free-slot path, which puts it down instead.
    const w = g.ammo > 0 ? gunWorth(g.item) : 0;
    if (w < worth) {
      worth = w;
      slot = i + 1;
    }
  }
  if (slot < 0) return { slot: 0, worth: gunWorth('pistol') };
  return { slot, worth };
}

/** How far a bot will actually shoot this thing. */
function botReach(item: ItemId | null): number {
  const def = item ? ITEMS[item] : undefined;
  if (!def) return GUN_RANGE;
  const range = def.range ?? GUN_RANGE;
  return Math.min(def.botIdealRange ?? range, range);
}

/**
 * Which gun to bring to bear on something this far off.
 *
 * Ordinarily the best one, as before. But `bestGun` ranks on damage per pull
 * alone, and by that measure a shotgun's eight pellets beat a sniper round —
 * so a bot that had crossed the city for the sniper kept it in the bag and
 * plinked at a street it couldn't cover. When the target is out of reach of
 * the good gun, the answer is whatever *does* reach, which is what makes a
 * scope worth carrying to something with no camera to look down.
 */
function longestGun(inv: Inventory): number {
  // Reach first, damage second — an officer reaches for the gun that keeps the
  // fight at arm's length and only takes out a close-quarters weapon when it
  // has to. Ranking on damage per pull alone put a shotgun's eight pellets
  // above a rifle, so a bot carrying both walked into shotgun range to use it.
  //
  // "Has to" is what the loaded check does: when the long gun runs dry it
  // stops being an option and the next longest thing comes out.
  //
  // This deliberately does not depend on how far away the target is, which is
  // what killed the old flip-flop outright: there is no boundary for a drifting
  // target to cross, so there is nothing to latch and nothing to dither over.
  let slot = -1;
  let reach = -Infinity;
  let worth = -Infinity;
  for (let i = 0; i < inv.guns.length; i++) {
    const g = inv.guns[i];
    if (!g || g.ammo <= 0) continue;
    const w = gunWorth(g.item);
    if (w <= 0) continue; // the cure gun isn't a weapon
    const r = botReach(g.item);
    if (r > reach || (r === reach && w > worth)) {
      reach = r;
      worth = w;
      slot = i + 1;
    }
  }
  // Nothing loaded worth firing: fall through to the pistol, which never runs
  // out and is the only reason `bestGun` still exists here.
  return slot < 0 ? bestGun(inv).slot : slot;
}

/** Index into `inv.guns` of a gun that has run dry, or -1. */
function emptyGunSlot(inv: Inventory): number {
  return inv.guns.findIndex((g) => g !== null && g.ammo <= 0);
}

/**
 * The slot an ammo box should go into: the emptiest real gun in the bag.
 *
 * `applyUtility` tops up whatever is *in hand*, and refuses outright when that
 * is the pistol — which has no magazine to fill. A bot whose guns had all run
 * dry is holding the pistol by then (`bestGun` falls through to it), so it
 * would walk to a box, be refused, and be stood on top of the same box a fifth
 * of a second later wanting it just as much. Forever.
 */
function refillSlot(inv: Inventory): number {
  let slot = -1;
  let need = 0;
  for (let i = 0; i < inv.guns.length; i++) {
    const g = inv.guns[i];
    if (!g) continue;
    const full = ITEMS[g.item].ammo ?? 0;
    if (full <= 0) continue; // nothing that takes rounds
    const missing = full - g.ammo;
    if (missing > need) {
      need = missing;
      slot = i + 1;
    }
  }
  return slot;
}

/** The cure gun's slot, if one is carried with a dose left in it. */
/** Which number a utility sits on in this bag, or -1. Numbering is contiguous. */
function utilitySlotOf(inv: Inventory, item: ItemId): number {
  const at = inv.utilities.indexOf(item);
  return at < 0 ? -1 : gunSlots(inv) + 1 + at;
}

function cureGunSlot(inv: Inventory): number {
  if (inv.cureDoses <= 0) return -1;
  return utilitySlotOf(inv, 'cureGun');
}

/**
 * Somebody bitten and still on their feet. A bot carrying the cure treats that
 * as the more urgent job than shooting — a cured neighbour is one fewer zombie
 * in a minute's time, which is worth more than the shot it interrupts.
 *
 * Returns true when it has taken the tick over.
 */
function cureTick(
  world: World,
  e: Entity,
  state: AiState,
  inv: Inventory,
  now: number,
  dt: number,
): boolean {
  const slot = cureGunSlot(inv);
  if (slot < 0 || world.pendingInfections.size === 0) return false;

  const reach = ITEMS.cureGun.range ?? GUN_RANGE;
  let patient: Entity | null = null;
  let best = Infinity;
  for (const id of world.pendingInfections.keys()) {
    const who = world.entities.get(id);
    // A bitten officer is worth a dose as much as a bitten civilian is.
    if (!who || who.type === 'zombie' || who.id === e.id) continue;
    const d = Math.hypot(who.x - e.x, who.y - e.y);
    if (d > reach || d >= best) continue;
    if (!hasLineOfSight(world, e.x, e.y, who.x, who.y, true)) continue;
    best = d;
    patient = who;
  }
  if (!patient) return false;

  inv.activeSlot = slot;
  const aim = Math.atan2(patient.y - e.y, patient.x - e.x);
  state.heading = turnToward(state.heading, aim, NPC_OFFICER_TURN_RATE * dt);
  e.facing = state.heading;
  if (Math.abs(angleDelta(state.heading, aim)) < 0.12) {
    fireHeld(world, e, inv, state.heading, now);
  }
  return true;
}

/** The charge rifle's slot number, with rounds left in it, or -1. */
function chargeRifleSlot(inv: Inventory): number {
  for (let i = 0; i < inv.guns.length; i++) {
    const g = inv.guns[i];
    if (g && g.item === 'chargeRifle' && g.ammo > 0) return i + 1;
  }
  return -1;
}

/**
 * The charge rifle is the one gun in the city that can shoot somebody already
 * bitten, and carrying one is what lets a bot *see* who that is: the infected
 * are otherwise invisible until the last four seconds of the tell, and even
 * then `senseThreats` deliberately keeps them out of `targetId` so nobody
 * shoots a person who has not turned yet. Holding this weapon is the one thing
 * that makes that a decision rather than an accident.
 *
 * It goes off on the top bar, wound up properly rather than fired the instant
 * the trigger is touched — a bot lining a shot up on a civilian with the dead
 * about has no reason to settle for a lesser round.
 *
 * Deliberately **only reached with no zombie being engaged**. Stopping a
 * firefight to spend a second and a third of a second winding up at a
 * bystander is a bot that dies holding a full charge, and the ranking that
 * matters — cure first, because a cured neighbour costs nobody anything — is
 * already made by `cureTick` sitting above this.
 *
 * Civilians only. An infected *officer* is a teammate and the answer there is
 * the cure gun; and a friendly already incubating who wanders into the lane
 * calls the shot off, since a top-bar round pierces four bodies and would go
 * straight through them on its way.
 *
 * Returns true when it has taken the tick over.
 */
function chargeInfectedTick(
  world: World,
  e: Entity,
  state: AiState,
  inv: Inventory,
  now: number,
  dt: number,
): boolean {
  const give = (): boolean => {
    world.chargeSince.delete(e.id);
    return false;
  };
  if (world.pendingInfections.size === 0) return give();
  const slot = chargeRifleSlot(inv);
  if (slot < 0) return give();

  const def = ITEMS.chargeRifle;
  const reach = Math.min(def.range ?? GUN_RANGE, CHARGE_INFECTED_SIGHT);

  let target: Entity | null = null;
  let best = Infinity;
  for (const id of world.pendingInfections.keys()) {
    const who = world.entities.get(id);
    if (!who || who.type !== 'human') continue;
    const d = Math.hypot(who.x - e.x, who.y - e.y);
    if (d > reach || d >= best) continue;
    if (!hasLineOfSight(world, e.x, e.y, who.x, who.y, true)) continue;
    best = d;
    target = who;
  }
  if (!target) return give();

  inv.activeSlot = slot;
  const aim = Math.atan2(target.y - e.y, target.x - e.x);
  state.heading = turnToward(state.heading, aim, NPC_OFFICER_TURN_RATE * dt);
  e.facing = state.heading;

  const since = world.chargeSince.get(e.id);
  if (since === undefined) {
    world.chargeSince.set(e.id, now);
    return true;
  }
  const chargeMs = def.chargeMs ?? 1200;
  // Stood there winding up at something it can no longer get a shot at, or —
  // more usually — a wind-up abandoned to fight something and picked back up
  // much later. Either way the deadline is what ends it: it clears the claim,
  // and the wind-up starts from the top on the next tick. This is also the
  // *only* thing that clears a stale entry, which is deliberate — the branches
  // that interrupt this one shouldn't have to know it exists.
  if (now - since > chargeMs + BOT_CHARGE_GIVE_UP_MS) return give();
  if (now - since < chargeMs * (BOT_CHARGE_BARS / CHARGE_BARS)) return true;
  if (Math.abs(angleDelta(state.heading, aim)) > BOT_CHARGE_AIM_TOLERANCE) return true;

  // A friendly already incubating, stood in the way. The round pierces four
  // bodies at this charge, so "behind the target" is no protection either.
  for (const id of world.pendingInfections.keys()) {
    const who = world.entities.get(id);
    if (!who || who.type !== 'officer') continue;
    if (segmentCircleT(e.x, e.y, target.x, target.y, who.x, who.y, who.radius + 6) !== null) {
      return give();
    }
  }

  world.chargeSince.delete(e.id);
  fireHeld(world, e, inv, state.heading, now, BOT_CHARGE_BARS / CHARGE_BARS);
  return true;
}

/**
 * Loot this bot would cross the map for: a gun better than what it is holding,
 * or a box of ammo when its good gun has run dry. Everything else is left for
 * whoever wants it.
 */
function lootWanted(
  world: World,
  e: Entity,
  state: AiState,
  inv: Inventory,
  range: number,
  now: number,
): PickupState | null {
  const spare = worstGun(inv);
  const dryGun = emptyGunSlot(inv) >= 0;
  // A gun that has run dry is as good as a free slot: they'll ditch it on
  // arrival. Without this a bot with three empty rifles is "full" and walks
  // past every gun in the city.
  const hasRoom = inv.guns.some((g, i) => g === null && i < gunSlots(inv)) || dryGun;
  const utilityRoom = inv.utilities.length < utilitySlots(inv);
  // Somewhere to put rounds. Without one an ammo box is refused at the pickup.
  const canTakeRounds = refillSlot(inv) > 0;

  let best: PickupState | null = null;
  let bestScore = -Infinity;

  for (const p of world.pickups.values()) {
    if (BOT_IGNORES.has(p.item)) continue;
    // Just had a go at this one. Let it lie for a while, whatever came of it.
    const snubbed = state.lootSnub.get(p.id);
    if (snubbed !== undefined) {
      if (now < snubbed) continue;
      state.lootSnub.delete(p.id);
    }
    const dist = Math.hypot(p.x - e.x, p.y - e.y);
    if (dist > range) continue;
    if (!world.nav.isReachable(p.x, p.y)) continue;

    // Nothing lying on a floor is worth walking into a crowd for, and until
    // this went in a bot would cross 1400px of overrun city for a marginally
    // better rifle and be eaten in the front room it was lying in. Measured
    // before it: bots bitten indoors with **35 and 61** zombies in sight.
    //
    // Read the same way `escapeDestination` reads it — geodesically, so cover
    // between here and there counts, and at the midpoint as well as at the far
    // end, because the thing may be somewhere perfectly safe on the other side
    // of a horde. A floor rather than a penalty: this is not a preference.
    const clearThere = world.danger.distanceAt(p.x, p.y);
    const clearHalf = world.danger.distanceAt((e.x + p.x) / 2, (e.y + p.y) / 2);
    if (Math.min(clearThere, clearHalf) < BOT_LOOT_MIN_CLEARANCE) continue;

    let want = 0;
    if (p.item === 'cureGun') {
      // Scored by hand, and this is why they never had one: it is `kind: gun`
      // so it fell down the branch below, where worth is damage per pull and
      // the cure gun's is zero — every bot in the city walked past every cure
      // gun in it, and `cureTick` has been sitting there fully written and
      // never once reached. A cured neighbour is one fewer zombie a minute
      // from now, which is worth more than most of what it could carry.
      if (utilityRoom && !inv.utilities.includes('cureGun')) want = 68;
    } else if (ITEMS[p.item]?.kind === 'gun') {
      // Somebody else's empty gun is a decoration. Walking to one and finding
      // it dry is exactly what the grey marker exists to prevent.
      if (p.ammo === 0) continue;
      // Both want right-click, so `collect` refuses whichever comes second.
      // A shield already up is worth more to a bot than a bipod it has to
      // stand still behind, so the shield keeps the slot.
      if (inv.shield > 0 && ITEMS[p.item]?.deployable === true) continue;
      // A pistol is the other hand, and there is only one other hand.
      if (p.item === 'pistol' && inv.dual) continue;

      // A second of something already in the bag is ammunition — `collect`
      // strips it rather than taking the slot. Worth going for in proportion
      // to how empty the copy they carry is, so a bot with a nearly-full
      // rifle doesn't cross the street for four more rounds.
      const twin = inv.guns.find((g) => g !== null && g.item === p.item);
      if (twin) {
        const full = ITEMS[p.item].ammo ?? 0;
        const room = full > 0 ? Math.max(0, 1 - twin.ammo / full) : 0;
        want = Math.round(gunWorth(p.item) * room * BOT_REFILL_APPETITE);
      } else {
        const worth = gunWorth(p.item);
        // Measured against the gun they'd give up, and it has to be a real
        // upgrade — a couple of points of damage is not worth a shuffle, and
        // shuffling is exactly what a margin of zero produces.
        if (hasRoom) want = worth;
        else if (worth - spare.worth >= BOT_SWAP_MARGIN) want = worth - spare.worth;
      }
    } else if (p.item === 'kevlar' && inv.kevlar <= 0 && utilityRoom) {
      // The two items in the city that stop an infection outright are the vest
      // and the shield, and both were scored as afterthoughts — a vest is three
      // grabs a bot simply walks away from, plus the breather after each one.
      // Nothing else in a utility slot is worth as much to something that is
      // supposed to still be standing at the end.
      want = 72;
    } else if (p.item === 'riotShield' && inv.shield <= 0 && utilityRoom) {
      // Worn, so carrying it is using it. Not while there is a bipod in the
      // bag: `collect` refuses the second of the two, and a bot that walks
      // across the city to be turned away has wasted the walk.
      const bipod = inv.guns.some((g) => g !== null && ITEMS[g.item]?.deployable === true);
      if (!bipod) want = 66;
    } else if (p.item === 'smokeGrenade' && utilityRoom && !inv.utilities.includes('smokeGrenade')) {
      // Smoke is a helicopter and half a squad of soldiers. Bots never used it
      // for the dull reason that nothing here wanted one, so they walked past.
      want = 60;
    } else if (p.item === 'pocketGunner' && utilityRoom && !inv.utilities.includes('pocketGunner')) {
      // A second officer and a machine gun, for the cost of a utility slot.
      want = 70;
    } else if (p.item === 'radio' && utilityRoom && !inv.utilities.includes('radio')) {
      // Four better-aiming officers who then stick with you. The best value in
      // a utility slot there is, and worth crossing a street for.
      want = 85;
    } else if (p.item === 'grenade' && utilityRoom && inv.grenades <= 0) {
      want = 55;
    } else if (p.item === 'zapMine' && utilityRoom && inv.mines <= 0) {
      want = 45;
    } else if (p.item === 'thermalGoggles' && utilityRoom && !inv.utilities.includes('thermalGoggles')) {
      // Seeing them through a wall is worth as much to a bot as to a player:
      // `senseThreats` reads the same range and stops caring about line of
      // sight, so a goggled bot fights the room it is walking into.
      want = 65;
    } else if (p.item === 'gunsling' && !inv.sling) {
      // Worn, so they cost no slot at all — always worth stopping for.
      want = 75;
    } else if (p.item === 'backpack' && !inv.pack) {
      want = 70;
    } else if (p.item === 'zombieTracker' && utilityRoom && !inv.utilities.includes('zombieTracker')) {
      // A compass to the outbreak. Worth a slot for the same reason it is worth
      // one to a player: the danger field only reaches as far as a bot samples
      // it, so without this a bot with nothing in sight is walking at random.
      want = 50;
    } else if (p.item === 'combatBoots' && utilityRoom && !inv.utilities.includes('combatBoots')) {
      // Worth more than they look, and they were worth precisely nothing until
      // `botStaminaTick` started reading them: quicker on the legs *and* two
      // thirds of the drain, which is the difference between two seconds of
      // sprint and three and a half. A bot lives or dies on that reserve.
      want = 58;
    } else if (p.item === 'ammoBox' && canTakeRounds) {
      // Boxes top up the total now rather than only refilling a magazine, so
      // one is worth having whether or not anything has actually run dry —
      // but only with a gun in the bag that can hold the rounds.
      want = dryGun ? 40 : 18;
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

  // A scope means standing further back. It is the same trade the player
  // makes and the only one a bot can make with it.
  const standoff = botScoped(world, e) ? BOT_SCOPE_STANDOFF : BOT_HUNT_STANDOFF;

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
    let score = -Math.abs(danger - standoff);
    score += world.danger.opennessAt(x, y) * 30;
    if (score > bestScore) {
      bestScore = score;
      best = { x, y };
    }
  }

  // Nothing anywhere in the sampled ring is near trouble, and there is a
  // tracker in the bag. This is the case the tracker exists for and the one
  // the danger field cannot cover: the field is read at fourteen points inside
  // `BOT_PATROL_MAX`, so once the nearest zombie is further off than that,
  // every sample reads the same maximum and the choice collapses to random.
  // The tracker points at the nearest one *on the map*, so it turns a random
  // walk into a bearing to walk down.
  //
  // Held, not merely carried, exactly as a player must hold it — a bot with
  // the tracker out is a bot not holding a gun. It costs nothing here because
  // there is nothing to shoot at; the moment `senseThreats` finds something,
  // the fight branch puts a gun back in its hands.
  const bag = world.inventories.get(e.id);
  const trackerSlot = bag ? utilitySlotOf(bag, 'zombieTracker') : -1;
  if (bag && trackerSlot > 0 && bestScore <= -DANGER_MAX_DISTANCE + standoff) {
    const fix = nearestZombieBearing(world, e.x, e.y);
    if (fix) {
      bag.activeSlot = trackerSlot;
      const reach = Math.min(fix.dist, BOT_PATROL_MAX);
      const x = clamp(e.x + Math.cos(fix.bearing) * reach, 70, WORLD_WIDTH - 70);
      const y = clamp(e.y + Math.sin(fix.bearing) * reach, 70, WORLD_HEIGHT - 70);
      if (!world.nav.isBlocked(x, y) && world.nav.isReachable(x, y)) best = { x, y };
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
/**
 * A frag into a crowd. Only when there are enough of them to be worth a
 * grenade — one zombie is a rifle's job, and a bot throwing its last frag at a
 * straggler is a bot that has nothing left when the street fills up.
 */
function lobFrag(world: World, e: Entity, state: AiState, aim: number, now: number): boolean {
  const inv = world.inventories.get(e.id);
  if (!inv || inv.grenades <= 0) return false;
  if (now < state.nextThrowAt) return false;

  let clustered = 0;
  for (const t of state.threatPoints) {
    if (Math.hypot(t.x - state.threatX, t.y - state.threatY) < BLAST_RADIUS) clustered++;
  }
  if (clustered < BOT_FRAG_MIN_TARGETS) return false;
  // Never at their own feet.
  const gap = Math.hypot(state.threatX - e.x, state.threatY - e.y);
  if (gap < BLAST_RADIUS * 1.2) return false;

  state.nextThrowAt = now + BOT_THROW_INTERVAL_MS;
  const slot = inv.activeSlot;
  inv.activeSlot = gunSlots(inv) + 1 + inv.utilities.indexOf('grenade');
  const threw = fireHeld(world, e, inv, aim, now, 1, { x: state.threatX, y: state.threatY });
  if (!inv.utilities.includes('grenade')) inv.activeSlot = 0;
  else inv.activeSlot = slot;
  return threw;
}

/**
 * A mine at their feet while giving ground. Laid *behind* the fight rather
 * than thrown into it — it is a thing you retreat over, not a weapon.
 */
function dropMine(world: World, e: Entity, state: AiState, now: number): boolean {
  const inv = world.inventories.get(e.id);
  if (!inv || inv.mines <= 0) return false;
  if (!state.bolting) return false; // only worth it when they are backing off
  if (now < state.nextThrowAt) return false;

  state.nextThrowAt = now + BOT_THROW_INTERVAL_MS;
  const slot = inv.activeSlot;
  inv.activeSlot = gunSlots(inv) + 1 + inv.utilities.indexOf('zapMine');
  const laid = fireHeld(world, e, inv, state.heading, now);
  if (!inv.utilities.includes('zapMine')) inv.activeSlot = 0;
  else inv.activeSlot = slot;
  return laid;
}

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

/**
 * The heavy MG's bipod. From the hip it sprays; on the pegs it is one of the
 * tightest guns in the city, at the price of being rooted. A bot commits when
 * the target is far enough out that a second of planting isn't fatal, and
 * packs up the moment something is close enough to reach it.
 *
 * Returns true while planted, since a planted bot doesn't move.
 */
function mgTick(
  world: World,
  e: Entity,
  state: AiState,
  inv: Inventory,
  dist: number,
  now: number,
): boolean {
  const held = heldItem(inv);
  const wants =
    held !== null &&
    ITEMS[held]?.deployable === true &&
    !state.bolting &&
    dist > BOT_DEPLOY_MIN_DIST;

  if (!wants) {
    world.deployStart.delete(e.id);
    world.stowing.delete(e.id);
    return false;
  }
  if (!world.deployStart.has(e.id)) world.deployStart.set(e.id, now);
  return true;
}

/**
 * A pocket gunner is a weapon to a bot, not a piece of kit to save for later:
 * the moment it sees something, it puts the crew down facing it. Deploying
 * uses the officer's own facing, so it lines up on the threat first.
 */
function gunnerTick(
  world: World,
  e: Entity,
  state: AiState,
  inv: Inventory,
  aim: number,
  now: number,
): boolean {
  if (!inv.utilities.includes('pocketGunner')) return false;
  // Facing it is the aiming. Wait until the swing has landed, or the crew ends
  // up covering the street they came from.
  if (Math.abs(angleDelta(state.heading, aim)) > 0.3) return false;

  const was = inv.activeSlot;
  inv.activeSlot = GUN_SLOTS + 1 + inv.utilities.indexOf('pocketGunner');
  const placed = fireHeld(world, e, inv, aim, now);
  if (!placed) {
    inv.activeSlot = was;
    return false;
  }
  inv.activeSlot = bestGun(inv).slot;
  return true;
}

/**
 * How near the closest thing it is aware of is. `threatPoints` is already
 * line-of-sight filtered and refreshed on the perception tick, so this is a
 * walk of a short list rather than another spatial query — and it takes in
 * whatever the goggles felt through a wall as well as what was seen.
 */
function nearestThreat(e: Entity, state: AiState): number {
  let closest = Infinity;
  for (const p of state.threatPoints) {
    const d = Math.hypot(p.x - e.x, p.y - e.y);
    if (d < closest) closest = d;
  }
  return closest;
}

/**
 * Steer round whatever is standing in the way of where a bot is running.
 *
 * The route to an escape destination is planned by `headingToward`, which
 * knows about walls and knows nothing about bodies, and the destination itself
 * was scored on the danger field at its far end and its midpoint — so a zombie
 * in the first hundred pixels of the chosen line costs that line nothing and
 * the bot sprints straight into it. That is the "ran at it with somewhere else
 * to go" case, and it is not the cornered one: this returns `desired`
 * unchanged when neither way round is walkable, which is exactly when pressing
 * on is right.
 *
 * `skirtThreat` is the civilian version and reads only `threatX/threatY` — the
 * single tracked threat, which for a bot is routinely not the one it is about
 * to run into. This walks `threatPoints`, already built on the perception tick.
 */
function dodgeThreats(world: World, e: Entity, state: AiState, desired: number): number {
  let blockX = 0;
  let blockY = 0;
  let blockDist = Infinity;

  for (const p of state.threatPoints) {
    const dx = p.x - e.x;
    const dy = p.y - e.y;
    const d = Math.hypot(dx, dy);
    if (d > BOT_DODGE_RANGE || d >= blockDist) continue;
    if (Math.abs(angleDelta(desired, Math.atan2(dy, dx))) > BOT_DODGE_CONE) continue;
    blockDist = d;
    blockX = p.x;
    blockY = p.y;
  }
  if (blockDist === Infinity) return desired;

  // How much room a candidate leaves, or -Infinity for one that isn't walkable.
  const roomAt = (angle: number): number => {
    const px = e.x + Math.cos(angle) * BOT_DODGE_PROBE;
    const py = e.y + Math.sin(angle) * BOT_DODGE_PROBE;
    if (world.nav.isBlocked(px, py) || !world.nav.lineClear(e.x, e.y, px, py)) return -Infinity;
    let clear = Infinity;
    for (const p of state.threatPoints) {
      const d = Math.hypot(px - p.x, py - p.y);
      if (d < clear) clear = d;
    }
    return clear;
  };

  const t = 1 - Math.min(1, blockDist / BOT_DODGE_RANGE);
  const swing = BOT_DODGE_SWING_MIN + (BOT_DODGE_SWING_MAX - BOT_DODGE_SWING_MIN) * t;
  // Both ways round are scored rather than taking the first that is open: the
  // near side is often the one with the rest of the pack standing on it.
  const left = desired + swing;
  const right = desired - swing;
  const roomLeft = roomAt(left);
  const roomRight = roomAt(right);
  if (roomLeft === -Infinity && roomRight === -Infinity) return desired;
  return roomLeft >= roomRight ? left : right;
}

/**
 * A bearing to back off along that accounts for every zombie in sight, not
 * only the one being shot at.
 *
 * Stepping straight away from the target is how a bot backs into the second
 * one, or into the wall behind it — and it is doing this at precisely the
 * moment something has closed on it. Same shape as `safestHeading`, with a
 * strong pull toward "directly away" so it still reads as giving ground rather
 * than wandering off sideways.
 */
function giveGroundHeading(world: World, e: Entity, state: AiState, away: number): number {
  let bestAngle = away;
  let bestScore = -Infinity;

  for (let i = 0; i < FLEE_DIRECTIONS; i++) {
    const angle = (i / FLEE_DIRECTIONS) * Math.PI * 2;
    const px = e.x + Math.cos(angle) * BOT_GIVE_GROUND_PROBE;
    const py = e.y + Math.sin(angle) * BOT_GIVE_GROUND_PROBE;
    if (world.nav.isBlocked(px, py) || !world.nav.lineClear(e.x, e.y, px, py)) continue;

    let clearance = Infinity;
    for (const p of state.threatPoints) {
      const d = Math.hypot(px - p.x, py - p.y);
      if (d < clearance) clearance = d;
    }
    if (clearance === Infinity) clearance = 400;

    let score = Math.min(clearance, 400);
    score += Math.cos(angle - away) * BOT_GIVE_GROUND_BIAS;

    const edgeGap = Math.min(px, py, WORLD_WIDTH - px, WORLD_HEIGHT - py);
    if (edgeGap < BOUNDARY_AVOID_DIST) score -= (BOUNDARY_AVOID_DIST - edgeGap) * 2.4;

    if (score > bestScore) {
      bestScore = score;
      bestAngle = angle;
    }
  }
  // Every direction blocked: back straight off and let collision sort it out.
  return bestScore === -Infinity ? away : bestAngle;
}

/**
 * Something moving on the far side of a shut door, close enough to hear
 * through it.
 *
 * Deliberately a short radius around the slab rather than a look at who is in
 * the room beyond — `rooms.zombiesIn` is exact and omniscient and would have a
 * bot know about something at the far end of a landmark it has never been
 * inside. This is an officer with an ear at the handle: what is right behind
 * the door, on the face it is not standing on.
 */
function heardBehindDoor(world: World, e: Entity, index: number): boolean {
  const spec = world.map.doors[index];
  const mySide = doorSide(world, index, e.x, e.y);
  const near = world.entityGrid.queryCircle(
    spec.x,
    spec.y,
    BOT_DOOR_LISTEN_RANGE,
    new Set<Entity>(),
  );
  for (const other of near) {
    if (other.type !== 'zombie') continue;
    if (Math.hypot(other.x - spec.x, other.y - spec.y) > BOT_DOOR_LISTEN_RANGE) continue;
    if (doorSide(world, index, other.x, other.y) === mySide) continue;
    return true;
  }
  return false;
}

/**
 * Heard something behind a door and did not go in. Back off the threshold,
 * keep the gun on it, and let whatever it is come out — a doorway is the one
 * place a bot can meet a pack one at a time.
 *
 * Gives it up after BOT_DOOR_WATCH_MS: whatever is in there may never open the
 * door, and standing at a handle is not a plan. Returns true when it has taken
 * the tick over. Anything actually in view is handled well above this, so by
 * the time it runs there is nothing to shoot at yet.
 */
function doorWatchTick(
  world: World,
  e: Entity,
  state: AiState,
  inv: Inventory,
  now: number,
  dt: number,
): boolean {
  if (state.doorWatch < 0) return false;

  const index = state.doorWatch;
  const door = world.doors[index];
  const spec = world.map.doors[index];
  // Open, off its hinges, or waited out: back to whatever it was doing, and
  // not to the thing on the other side of that door.
  if (!door || door.broken || door.open || now >= state.doorWatchUntil) {
    state.doorWatch = -1;
    if (state.lootId !== null) {
      state.lootSnub.set(state.lootId, now + BOT_LOOT_SNUB_MS);
      state.lootId = null;
      state.lootItem = null;
    }
    state.nextLootScanAt = now;
    botPatrolTarget(world, e, state, now);
    return false;
  }

  const aim = Math.atan2(spec.y - e.y, spec.x - e.x);
  state.heading = turnToward(state.heading, aim, BOT_TURN_RATE * dt);
  e.facing = state.heading;

  // Off the threshold, facing it the whole way back.
  if (Math.hypot(spec.x - e.x, spec.y - e.y) < BOT_DOOR_STANDOFF) {
    const back = aim + Math.PI;
    const speed = speedAt(world, e.x, e.y, botWalkSpeed(inv) * BOT_KITE_SPEED_MUL);
    const stepX = Math.cos(back) * speed * dt;
    const stepY = Math.sin(back) * speed * dt;
    if (!world.nav.isBlocked(e.x + stepX, e.y + stepY)) {
      e.x += stepX;
      e.y += stepY;
    } else if (!world.nav.isBlocked(e.x + stepX, e.y)) {
      e.x += stepX;
    } else if (!world.nav.isBlocked(e.x, e.y + stepY)) {
      e.y += stepY;
    }
  }
  return true;
}

/**
 * Call it in. A bot has to work the handset the way a player does now — the
 * radio used to fire its one call the instant it was picked up, and moving
 * that to a click would otherwise leave every bot in the city carrying one it
 * never pressed.
 *
 * Held for exactly the moment it takes, like the pocket gunner: a bot with a
 * radio in its hands is a bot not holding a gun, and there is a fight on. The
 * count and the cooldown both live on the bag, so this can be asked every tick
 * something is in sight and will simply refuse until it is ready.
 */
function radioTick(world: World, e: Entity, inv: Inventory, now: number): boolean {
  if (inv.radioUses <= 0 || now < inv.radioReadyAt) return false;
  const slot = utilitySlotOf(inv, 'radio');
  if (slot <= 0) return false;

  inv.activeSlot = slot;
  const called = fireHeld(world, e, inv, e.facing, now);
  // Back to a gun whatever came of it. `bestGun` rather than the slot it was
  // on: a spent radio has just been spliced out and everything after it moved.
  inv.activeSlot = bestGun(inv).slot;
  return called;
}

/**
 * The Q wheel's "GO TO THE BEACON!", worked by a bot.
 *
 * The same order a player gives and on the same terms: a mast standing within
 * `BEACON_CALL_RADIUS`, a rally charge, and the charge is spent. What a bot has
 * to supply that a player supplies by eye is the *judgement* — there is one
 * charge to start with, and shouting it at an empty street throws away the only
 * thing that turns a mast into a muster.
 *
 * So it counts who would actually go: civilians in earshot who are not already
 * on their way there and are not already stood at it. Below
 * `BOT_BEACON_SHOUT_MIN` it holds on to the charge.
 *
 * Costs nothing but the charge and does not take the tick — shouting is not
 * something you stop fighting to do — so it is called inline rather than as
 * one of the `return`ing branches.
 */
function beaconShoutTick(world: World, e: Entity, state: AiState, now: number): void {
  if (now < state.nextBeaconShoutAt) return;
  state.nextBeaconShoutAt = now + BOT_BEACON_SHOUT_CHECK_MS;
  if (world.towers.length === 0) return;
  if ((world.rallyCharges.get(e.id) ?? 0) <= 0) return;

  let tower: { x: number; y: number } | null = null;
  let best = BEACON_CALL_RADIUS;
  for (const t of world.towers) {
    const d = Math.hypot(t.x - e.x, t.y - e.y);
    if (d < best) {
      best = d;
      tower = t;
    }
  }
  if (!tower) return;

  // Worth a charge? Only people who would actually move because of it: not the
  // ones already walking there, and not the ones already stood at the mast.
  let worth = 0;
  for (const other of world.entityGrid.queryCircle(e.x, e.y, RALLY_RADIUS, new Set<Entity>())) {
    if (other.type !== 'human') continue;
    if (Math.hypot(other.x - e.x, other.y - e.y) > RALLY_RADIUS) continue;
    if (Math.hypot(other.x - tower.x, other.y - tower.y) <= BEACON_MUSTER_RADIUS) continue;
    const st = world.ai.get(other.id);
    if (
      st &&
      st.mode === 'rallied' &&
      st.rallyX !== null &&
      st.rallyY !== null &&
      Math.hypot(st.rallyX - tower.x, st.rallyY - tower.y) < 40
    ) {
      continue;
    }
    worth++;
  }
  if (worth < BOT_BEACON_SHOUT_MIN) return;

  world.rallyCharges.set(e.id, (world.rallyCharges.get(e.id) ?? 0) - 1);
  world.speech.set(e.id, { text: BEACON_SHOUT, until: now + BEACON_SHOUT_MS });
  rallyHumans(world, e.x, e.y, tower.x, tower.y);
}

/**
 * A bot picking a spot for the beacon.
 *
 * The handset is the one thing in the bag that can be used from anywhere — the
 * spot is picked off a map, not walked to — so a bot calls it in exactly as a
 * player does, without going near the place. What it costs a bot is the same
 * thing it costs a player: nothing but the choice.
 *
 * The spot is chosen off the danger field, which is the honest tool for it:
 * somewhere geodesically *far* from the nearest zombie, outdoors so there is
 * room to gather, and reachable. It is the reverse of `botPatrolTarget`, which
 * scores toward trouble — a muster point wants the other end of that.
 *
 * Called once and then never again, since `requestBeacon` refuses a second.
 */
function beaconTick(world: World, e: Entity, inv: Inventory, now: number): boolean {
  if (world.beacon) return false; // already called in, by anyone
  if (!inv.utilities.includes('survivorBeacon')) return false;

  let best: { x: number; y: number } | null = null;
  let bestScore = -Infinity;
  for (let i = 0; i < BOT_BEACON_SAMPLES; i++) {
    const x = 90 + Math.random() * (WORLD_WIDTH - 180);
    const y = 90 + Math.random() * (WORLD_HEIGHT - 180);
    if (world.nav.isBlocked(x, y) || !world.nav.isReachable(x, y)) continue;
    // Out in the open. A muster point in somebody's front room holds nobody.
    if (buildingIndexAt(world, x, y) >= 0) continue;
    // Clear of the dead is a *floor*, not something to maximise. Scored as
    // "as far from the zombies as possible" it lands in whichever corner of the
    // map is emptiest, which is also the corner with nobody in it and the
    // longest walk from anywhere — a muster point nobody reaches alive.
    if (world.danger.distanceAt(x, y) < BOT_BEACON_MIN_CLEARANCE) continue;

    // Among the spots that are safe enough, take the one with the most people
    // near it. Somewhere to gather has to be where the crowd already is.
    let nearby = 0;
    for (const other of world.entityGrid.queryCircle(x, y, RALLY_RADIUS, new Set<Entity>())) {
      if (other.type !== 'human') continue;
      if (Math.hypot(other.x - x, other.y - y) <= RALLY_RADIUS) nearby++;
    }
    const score = nearby - Math.hypot(x - e.x, y - e.y) * BOT_BEACON_WALK_WEIGHT;
    if (score > bestScore) {
      bestScore = score;
      best = { x, y };
    }
  }
  if (!best) return false;
  return requestBeacon(world, best.x, best.y, now);
}

/**
 * Sprint reserve: spent while bolting, refilled while doing anything else.
 *
 * Boots are read here because nothing else was reading them. They are applied
 * to a *player* in `updatePlayers`, and a bot's legs never went through that —
 * so a bot that crossed the city for a pair of combat boots got neither the
 * pace nor the cheaper stamina out of them, and was carrying a utility slot of
 * nothing. Worn, not held, exactly as they are for a player.
 */
function botStaminaTick(
  state: AiState,
  sprinting: boolean,
  dt: number,
  inv?: Inventory,
): number {
  const booted = inv !== undefined && inv.utilities.includes('combatBoots');
  if (sprinting && !state.botWinded) {
    const drain = STAMINA_DRAIN_PER_SEC * (booted ? BOOTS_STAMINA_MUL : 1);
    state.botStamina = Math.max(0, state.botStamina - drain * dt);
    if (state.botStamina <= STAMINA_SPRINT_FLOOR) state.botWinded = true;
  } else {
    state.botStamina = Math.min(STAMINA_MAX, state.botStamina + STAMINA_REGEN_PER_SEC * dt);
    if (state.botWinded && state.botStamina >= STAMINA_RECOVERY_THRESHOLD) state.botWinded = false;
  }
  const base = sprinting && !state.botWinded ? BOT_SPRINT_SPEED : BOT_WALK_SPEED;
  return base * (booted ? BOOTS_SPEED_MUL : 1);
}

/** A bot's ordinary pace, boots included. */
function botWalkSpeed(inv: Inventory): number {
  return BOT_WALK_SPEED * (inv.utilities.includes('combatBoots') ? BOOTS_SPEED_MUL : 1);
}

function updateBotOfficer(world: World, e: Entity, state: AiState, now: number, dt: number): void {
  const inv = world.inventories.get(e.id);
  if (!inv) return;

  if (now >= state.nextSenseAt) {
    state.nextSenseAt = now + SENSE_INTERVAL_MS;
    // Bots look through foliage. A civilian loses someone behind a hedge; an
    // officer sweeping for them does not.
    // A scope in hand is a longer look, which is the whole of what one is
    // worth to a bot. Without this it stood at 420 holding a gun good for
    // 2200 and never once used the range it had picked the gun up for.
    const sight = botScoped(world, e) ? BOT_SCOPE_SIGHT : NPC_OFFICER_SIGHT;
    senseThreats(world, e, state, now, sight, true);
  }

  // Calling the beacon in, and then sending people to it. Both are decisions
  // made from wherever the bot is standing rather than errands, so both sit
  // above everything that returns — a bot does not stop fighting, running or
  // looting to pick a spot off a map or to give an order.
  //
  // Deliberately *not* held back until something is in sight, the way the
  // radio is. Backup answers a fight that is happening; a muster point is
  // somewhere to have sent people *before* one is, and a beacon called at the
  // two-minute mark has missed most of the round it was meant to change.
  beaconTick(world, e, inv, now);
  beaconShoutTick(world, e, state, now);

  // Clicking on an empty chamber is checked every tick, not only when there's
  // something to shoot at — walking around holding a gun you can't fire is how
  // a bot gets caught out the moment one appears.
  const inHand = heldGunSlot(inv);
  if (inHand && inHand.ammo <= 0) inv.activeSlot = bestGun(inv).slot;

  // Shaken after being grabbed: get clear before thinking about anything else.
  //
  // This is the most dangerous moment a bot has — every grab it has already
  // survived makes the next one likelier to turn it outright
  // (INSTANT_INFECT_PER_PRIOR_GRAPPLE) — and it used to be the stupidest code
  // it ran: OFFICER_FLEE_MS of blind running on a raw bearing away from where
  // the threat was, at HUMAN_FLEE_SPEED, which is *slower than a zombie*. It
  // could not outrun the thing that had just let go of it, and walked into the
  // first wall behind it while trying. It breaks contact properly now:
  // goal-directed like every other flight here, sprinting, with the escape
  // burst it was already being handed and never spending, and it stops the
  // moment it is genuinely clear rather than at the end of a fixed clock.
  if (now < state.fleeUntil) {
    if (nearestThreat(e, state) > BOT_SAFE_DIST) {
      state.fleeUntil = 0;
    } else {
      const boostUntil = world.speedBoosts.get(e.id);
      const boosted = boostUntil !== undefined && now < boostUntil;
      if (boostUntil !== undefined && !boosted) world.speedBoosts.delete(e.id);
      const speed =
        botStaminaTick(state, true, dt, inv) * (boosted ? ESCAPE_SPEED_MULTIPLIER : 1);

      if (unstickTick(world, e, state, now, dt, speed)) return;
      const to = escapeDestination(world, e, state, now);
      const desired = to
        ? headingToward(world, e, state, to.x, to.y, now)
        : safestHeading(world, e, state);
      step(world, e, state, dodgeThreats(world, e, state, desired), speed, HUMAN_TURN_RATE, dt, now);
      return;
    }
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
    // A frag first if the crowd is worth one, then a mine underfoot if they are
    // about to give ground over it.
    if (lobFrag(world, e, state, aim, now)) return;
    if (dropMine(world, e, state, now)) return;
    // And a gun crew goes down facing whatever it just saw.
    if (gunnerTick(world, e, state, inv, aim, now)) return;
    // Backup takes seconds to arrive, so the moment to ask for it is the
    // moment something is seen rather than the moment things are going badly.
    if (radioTick(world, e, inv, now)) return;

    // Judged on the *nearest* zombie in sight, not the one being shot at —
    // those are often different, and a bot trading fire with something across
    // the street shouldn't ignore the one at its elbow. threatPoints is
    // already line-of-sight filtered and refreshed on the perception tick, so
    // this costs a walk of a short list rather than another query.
    const closest = Math.min(dist, nearestThreat(e, state));

    // Latched with a wide band: too close and they turn and run, and they keep
    // running until they are properly clear rather than the instant they are
    // one pixel past the line.
    //
    // **Running out of breath ends it too**, and that is not a refinement — a
    // winded bot drops to BOT_WALK_SPEED, which is slower than a zombie, so
    // `closest` never grows and it can never satisfy BOT_SAFE_DIST. It would
    // jog away from something faster than it, not firing, for the rest of the
    // round. Out of sprint means turn round and make the fight expensive.
    //
    // **Breaking off sooner was tried, and it is the wrong answer** — see
    // "Fighting is how a bot survives" in CLAUDE.md. Both a bolt distance that
    // grew with the size of the pack and an outright rout when surrounded were
    // measured over ten paired seeds, and neither bought a single extra bot:
    // 23/40 alive against 22/40, while the median city finished with 263
    // zombies in it rather than 229. Four officers who stop fighting are four
    // officers who lose the city, and then die in it anyway.
    if (closest < BOT_BOLT_DIST) state.bolting = true;
    else if (closest > BOT_SAFE_DIST || state.botWinded) state.bolting = false;

    if (state.bolting) {
      // Sprint is two seconds, and ten more to earn it back. Spend it on what
      // it buys — breaking contact with whatever is actually on us — and jog
      // the rest of the time, which already outpaces a zombie. Burning the
      // reserve the instant a bolt starts is what had a quarter of every bolt
      // spent winded and walking with the pack still coming.
      const sprinting = closest < BOT_SPRINT_TRIGGER;
      const speed = botStaminaTick(state, sprinting, dt, inv);
      // Goal-directed, like every other flight in this game. A raw bearing
      // away from the threat parks them on the first wall behind them.
      if (unstickTick(world, e, state, now, dt, speed)) return;
      const to = escapeDestination(world, e, state, now);
      const desired = to
        ? headingToward(world, e, state, to.x, to.y, now)
        : safestHeading(world, e, state);
      // Whatever is stood in the first hundred pixels of that line is gone
      // round rather than run at — the destination was scored on the danger
      // field, which is far too coarse to have noticed it.
      step(world, e, state, dodgeThreats(world, e, state, desired), speed, HUMAN_TURN_RATE, dt, now);
      return;
    }

    // There is a zombie in view, but nothing near enough to be pressing, and
    // somebody in front of us is incubating. Winding up on them is the better
    // use of the second: the one across the street is a fight, and the one at
    // our elbow is a fight in twenty seconds' time that nobody else can even
    // see coming. Gated on `closest` rather than on the target's distance,
    // since those are routinely different — no bot spends a second and a third
    // charging a rifle with something at its shoulder.
    if (closest > BOT_SAFE_DIST && chargeInfectedTick(world, e, state, inv, now, dt)) return;

    // Standing and fighting: face it, hold the best gun, and open up.
    botStaminaTick(state, false, dt, inv);
    // A curable human nearby is worth the cure gun over anything else.
    if (!cureTick(world, e, state, inv, now, dt)) {
      const want = longestGun(inv);
      if (inv.activeSlot !== want) inv.activeSlot = want;
    }

    // Swung rather than snapped. At the NPC officer's rate the barrel jumps
    // between targets, which reads as twitching rather than tracking.
    state.heading = turnToward(state.heading, aim, BOT_TURN_RATE * dt);
    e.facing = state.heading;

    const held = heldItem(inv);
    const def = held ? ITEMS[held] : undefined;
    const reach = def?.range ?? GUN_RANGE;
    // Some guns only bite well inside their paper range — a shotgun at 340 is
    // two pellets on target, and the launcher wants to be out of its own blast.
    const ideal = Math.min(def?.botIdealRange ?? reach, reach);

    // Planting the heavy MG is worth more than anything else it could be
    // doing, and it roots the bot, so it comes before the footwork.
    const planted = mgTick(world, e, state, inv, dist, now);

    if (Math.abs(angleDelta(state.heading, aim)) < 0.2) {
      // Don't waste a launcher shell on something close enough to splash us.
      const tooClose = def?.explosive === true && dist < BLAST_RADIUS * 1.3;
      // The launcher lands its shell on the target rather than at arm's length.
      const at = def?.explosive ? { x: threat.x, y: threat.y } : undefined;
      if (dist <= ideal && !tooClose) fireHeld(world, e, inv, state.heading, now, 1, at);
    }

    if (planted) return; // behind the gun you are an emplacement, not a person

    // Walk in or give ground, latched between two thresholds rather than
    // decided against one. On a single boundary a bot sitting near its ideal
    // range flipped between advancing and retreating every few ticks — which
    // is exactly what "jittery" looks like from outside.
    if (dist > ideal * BOT_RANGE_SLACK) state.botClosing = true;
    else if (dist <= ideal) state.botClosing = false;

    const backAt = Math.min(ideal * 0.8, NPC_OFFICER_RETREAT_DIST);
    if (!state.botClosing && dist < backAt) state.botGiving = true;
    else if (dist > backAt * BOT_RANGE_SLACK) state.botGiving = false;

    if (state.botClosing || state.botGiving) {
      // Giving ground here is *kiting*, not fleeing: the shot above has
      // already gone off this tick and the bot is still facing the thing.
      // Running away is the branch further up, and it only starts inside
      // BOT_BOLT_DIST. Backing off is scored against every zombie it knows of
      // rather than taken straight from the one it is shooting — the bearing
      // directly away from your target is how you walk into the second one.
      const bearing = state.botClosing
        ? aim
        : giveGroundHeading(world, e, state, Math.atan2(-dy, -dx));
      const speed = speedAt(world, e.x, e.y, botWalkSpeed(inv) * BOT_KITE_SPEED_MUL);
      const stepX = Math.cos(bearing) * speed * dt;
      const stepY = Math.sin(bearing) * speed * dt;
      // Slide along whichever axis is open rather than stopping dead.
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

  // No zombie in view, but somebody nearby is turning. Cure them if there is a
  // dose for it — that costs them nothing — and put a charged round through
  // them if there isn't and there is a charge rifle in the bag.
  if (cureTick(world, e, state, inv, now, dt)) return;
  if (chargeInfectedTick(world, e, state, inv, now, dt)) return;

  // Heard something behind a door on the way in and stayed out of the room.
  // Below the fight, deliberately: anything that has come through the door is
  // in view by now and gets shot at instead of watched.
  if (doorWatchTick(world, e, state, inv, now, dt)) return;

  // Nothing in sight: stop running and get the wind back — and pick somewhere
  // new to be while doing it. The patrol target it set out for was chosen
  // before any of this happened, and walking back to it walks straight back
  // into whatever it just ran from.
  if (state.bolting) {
    state.bolting = false;
    botPatrolTarget(world, e, state, now);
  }
  botStaminaTick(state, false, dt, inv);

  // Nothing to shoot: go shopping. Re-checked on a cadence rather than every
  // tick, since it sweeps the loot list.
  if (now >= state.nextLootScanAt) {
    state.nextLootScanAt = now + BOT_LOOT_SCAN_MS;
    // Snubs for loot that has since been taken are never walked past again, so
    // sweep them here rather than letting the map grow all round.
    for (const [id, until] of state.lootSnub) {
      if (now >= until) state.lootSnub.delete(id);
    }
    const want = lootWanted(world, e, state, inv, BOT_LOOT_RANGE, now);
    state.lootId = want ? want.id : null;
    state.lootItem = want ? want.item : null;
  }

  if (state.lootId !== null) {
    const target = world.pickups.get(state.lootId);
    // Gone, or somebody swapped something else in under the same id while we
    // were walking. Either way what is lying there is not what we came for.
    if (!target || target.item !== state.lootItem) {
      state.lootId = null;
      state.lootItem = null;
      state.nextLootScanAt = Math.min(state.nextLootScanAt, now + 250);
    } else {
      const gap = Math.hypot(target.x - e.x, target.y - e.y);
      if (gap <= PICKUP_REACH) {
        // Whatever comes of this, leave the spot alone for a while. A swap
        // puts the gun we gave up back under the *same* id, so without this
        // the next scan finds a brand new upgrade at our own feet.
        state.lootSnub.set(target.id, now + BOT_LOOT_SNUB_MS);

        const isGunPickup = ITEMS[target.item]?.kind === 'gun';
        const spent = emptyGunSlot(inv);
        const full = !inv.guns.some((g, i) => g === null && i < gunSlots(inv));
        if (isGunPickup && spent >= 0 && full) {
          // Bag full but something in it is dry: put the dry one down first,
          // so there's a slot to take this into. It lands here with zero
          // rounds and draws grey, which tells everyone else to leave it
          // alone.
          inv.activeSlot = spent + 1;
          dropHeld(world, inv, e.x, e.y);
        } else if (isGunPickup && full) {
          // A full bag and nothing dry in it means `collect` will swap for
          // whatever is *in hand*, so the worst gun has to be in hand. This is
          // the gun `lootWanted` scored against.
          inv.activeSlot = worstGun(inv).slot;
        } else if (target.item === 'ammoBox') {
          // The box fills the gun you are holding, so hold the emptiest one.
          const refill = refillSlot(inv);
          if (refill > 0) inv.activeSlot = refill;
        }
        // Ask for the thing we walked here for by name — the nearest pickup
        // may well be the empty gun we just put down.
        const result = collect(world, e.id, inv, e.x, e.y, target.id);
        state.lootId = null;
        state.lootItem = null;
        // Bring whatever we just took to hand if it beats what we had.
        inv.activeSlot = bestGun(inv).slot;
        if (result) state.nextLootScanAt = now + 200;
        return;
      }
      // Scraping along something on the way to it counts as not getting there.
      if (unstickTick(world, e, state, now, dt, botWalkSpeed(inv))) return;
      const desired = avoidBushes(world, e, headingToward(world, e, state, target.x, target.y, now));
      step(world, e, state, desired, botWalkSpeed(inv), HUMAN_TURN_RATE, dt, now);
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
  if (unstickTick(world, e, state, now, dt, botWalkSpeed(inv))) return;
  const desired = avoidBushes(
    world,
    e,
    widenCorners(world, e, headingToward(world, e, state, state.wanderX, state.wanderY, now)),
  );
  step(world, e, state, desired, botWalkSpeed(inv), HUMAN_TURN_RATE, dt, now);
}

// ---------------------------------------------------------------- zombies

function senseTarget(world: World, e: Entity, state: AiState, now: number): void {
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
    let score = dist * (world.pendingInfections.has(other.id) ? INFECTED_TARGET_PENALTY : 1);

    // And already-*spoken-for* prey is worth less to the ones that think that
    // way. Without this, twenty zombies stood roughly together all score on
    // distance alone, all pick the same nearest person, and trail after them
    // in single file while the crowd four paces past them walks off untouched.
    // Our own claim doesn't count against us, or a zombie would talk itself
    // out of the target it already has every perception tick.
    if (state.spreadsOut) {
      const claims = (world.targetClaims.get(other.id) ?? 0) - (state.targetId === other.id ? 1 : 0);
      if (claims > 0) score *= 1 + claims * ZOMBIE_SPREAD_PENALTY;
    }
    if (score >= bestScore) continue;
    if (!hasLineOfSight(world, e.x, e.y, other.x, other.y)) continue;

    best = other;
    bestScore = score;
  }

  if (best) {
    state.targetId = best.id;
    state.lastSeenX = best.x;
    state.lastSeenY = best.y;
    state.lastSeenUntil = now + ZOMBIE_LAST_SEEN_MS;
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
    // Same clawing animation a door gets. Glass was the one thing they tore at
    // with their arms by their sides.
    state.breakingUntil = now + 400;
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
 * Walk toward the spot just past the doorway this zombie has settled on, and
 * take the door apart if something is hung in it and shut. Shared by the two
 * halves of the search: on the way out of a cleared room, and on the way into
 * a building across the street.
 */
function pressOnThroughExit(
  world: World,
  e: Entity,
  state: AiState,
  now: number,
  dt: number,
): boolean {
  const spec = world.map.doors[state.searchExit];

  // Shut in its face. This is the way it has chosen, so the door is now the
  // thing in its way — `attackBlockingDoor` still stands aside for anything it
  // could actually reach instead. Clawing counts as progress: it is getting
  // through, just not by walking.
  if (
    Math.hypot(spec.x - e.x, spec.y - e.y) < e.radius + ZOMBIE_EXIT_REACH &&
    isDoorShut(world, state.searchExit) &&
    attackBlockingDoor(world, e, state, now)
  ) {
    state.searchProgressAt = now + ZOMBIE_EXIT_PROGRESS_MS;
    return true;
  }

  // Getting no nearer to a way out it has committed to means that way out is
  // no good from here — something is between it and the door that the router
  // won't go round. Give it up; the next choice penalises this one.
  const gap = Math.hypot(state.searchAimX - e.x, state.searchAimY - e.y);
  if (now >= state.searchProgressAt) {
    if (gap > state.searchGap - ZOMBIE_EXIT_PROGRESS_MIN) {
      state.searchAvoid = state.searchExit;
      state.searchExit = -1;
      state.searchGap = Infinity;
      return false;
    }
    state.searchProgressAt = now + ZOMBIE_EXIT_PROGRESS_MS;
    state.searchGap = gap;
  }

  const desired = headingToward(world, e, state, state.searchAimX, state.searchAimY, now);
  step(world, e, state, desired, ZOMBIE_SEARCH_SPEED, ZOMBIE_TURN_RATE, dt, now);
  return true;
}

/** Settle on a doorway: where past it to aim for, and how long to persist. */
function commitToExit(world: World, state: AiState, index: number, fromRoom: number, now: number): void {
  const aim = world.rooms.aimBeyond(index, fromRoom);
  state.searchExit = index;
  state.searchAimX = aim.x;
  state.searchAimY = aim.y;
  state.searchUntil = now + ZOMBIE_EXIT_COMMIT_MS;
  state.searchGap = Infinity;
  state.searchProgressAt = now + ZOMBIE_EXIT_PROGRESS_MS;
}

/**
 * Which way out of a cleared room to take.
 *
 * A dull zombie only knows not to walk straight back where it came from. A
 * bright one also wants somewhere nobody has swept lately, that the rest of
 * the horde isn't already in, and that it doesn't have to break a door to
 * reach — which is what produces "try the other door first" without anything
 * ever being told to try the other door first.
 */
function chooseExit(world: World, e: Entity, state: AiState, room: number, now: number): number {
  const exits = world.rooms.rooms[room].exits;
  if (exits.length === 0) return -1;

  let best = -1;
  let bestScore = -Infinity;

  for (const index of exits) {
    const far = world.rooms.farSideOf(index, room);
    // Turning straight round is the one thing a search should never do.
    let score = far === state.searchFrom && far !== OUTSIDE ? -260 : 0;
    // Nor is trying again at the one it just failed to get to.
    if (index === state.searchAvoid) score -= 200;
    // A little noise, or a pack that arrived together files out of one door.
    score += Math.random() * 60;

    if (state.smartZombie) {
      // The street is always worth trying; a room is worth it if it has been
      // left alone a while.
      const idle = far === OUTSIDE ? ZOMBIE_SWEEP_MEMORY_MS : now - world.rooms.sweptAt(far);
      score += (Math.min(idle, ZOMBIE_SWEEP_MEMORY_MS) / ZOMBIE_SWEEP_MEMORY_MS) * 200;
      score -= world.rooms.zombiesIn(far) * 70;
      if (isDoorShut(world, index)) score -= 90;
      const spec = world.map.doors[index];
      score -= Math.hypot(spec.x - e.x, spec.y - e.y) * 0.12;
    }

    if (score > bestScore) {
      bestScore = score;
      best = index;
    }
  }
  return best;
}

/** Nothing left in this room: pick a way out and go through it. */
function searchIndoors(
  world: World,
  e: Entity,
  state: AiState,
  room: number,
  now: number,
  dt: number,
): boolean {
  // Somebody is still in here. Room occupancy is geometric, so unlike the old
  // radius test this doesn't count a crowd through the wall of the room next
  // door — and anything it can actually *see* has already been dealt with by
  // the chase branch above.
  if (world.rooms.preyIn(room) > 0) {
    state.roomClearSince = 0;
    state.searchExit = -1;
    return false;
  }

  if (state.roomClearSince === 0) state.roomClearSince = now;
  const dwell = state.smartZombie ? ZOMBIE_ROOM_CLEAR_MS : ZOMBIE_ROOM_CLEAR_SLOW_MS;
  if (now - state.roomClearSince < dwell) return false;

  // Say so, so the rest of the horde spends its time somewhere else.
  world.rooms.markSwept(room, now);

  if (state.searchExit < 0 || now >= state.searchUntil) {
    const exit = chooseExit(world, e, state, room, now);
    // Sealed in with no doorway at all: leave it to the stuck check and the
    // wander, which is what they are for.
    if (exit < 0) return false;
    commitToExit(world, state, exit, room, now);
  }

  return pressOnThroughExit(world, e, state, now, dt);
}

/** A building worth going and looking in, or -1 if none is close enough. */
function chooseBuilding(world: World, e: Entity, state: AiState, now: number): number {
  let best = -1;
  let bestScore = -Infinity;

  for (let i = 0; i < world.map.buildings.length; i++) {
    const b = world.map.buildings[i];
    const dist = Math.hypot(b.x + b.w / 2 - e.x, b.y + b.h / 2 - e.y);
    if (dist > ZOMBIE_HUNT_RADIUS) continue;

    let score = -dist * 0.25 + Math.random() * 120;
    if (state.smartZombie) {
      const idle = now - world.rooms.buildingSweptAt(i);
      score += (Math.min(idle, ZOMBIE_SWEEP_MEMORY_MS) / ZOMBIE_SWEEP_MEMORY_MS) * 260;
      score -= world.rooms.zombiesInBuilding(i) * 60;
    }
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}

/** Nearest way into a building from out here, preferring one standing open. */
function chooseWayIn(world: World, e: Entity, state: AiState, building: number): number {
  let best = -1;
  let bestScore = -Infinity;

  for (const index of world.map.buildings[building].doors) {
    const spec = world.map.doors[index];
    if (spec.interior) continue;
    if (!world.nav.isReachable(spec.x, spec.y)) continue;
    let score = -Math.hypot(spec.x - e.x, spec.y - e.y);
    if (isDoorShut(world, index)) score -= 120;
    if (index === state.searchAvoid) score -= 400;
    if (score > bestScore) {
      bestScore = score;
      best = index;
    }
  }
  return best;
}

/**
 * Out in the street with nothing to chase. Mill about for a while — a horde
 * that beelines from building to building leaves the streets empty — and then
 * go and look inside one.
 */
function searchStreet(world: World, e: Entity, state: AiState, now: number, dt: number): boolean {
  if (state.streetSince === 0) state.streetSince = now;

  if (state.searchBuilding < 0) {
    const settle = state.smartZombie ? ZOMBIE_STREET_WANDER_MS : ZOMBIE_STREET_WANDER_SLOW_MS;
    if (now - state.streetSince < settle) return false;

    state.searchBuilding = chooseBuilding(world, e, state, now);
    state.searchExit = -1;
    if (state.searchBuilding < 0) {
      state.streetSince = now; // nothing in reach; wander on and ask again later
      return false;
    }
  }

  if (state.searchExit < 0 || now >= state.searchUntil) {
    const way = chooseWayIn(world, e, state, state.searchBuilding);
    // Every way in already tried and failed: this building isn't worth it.
    if (way < 0 || way === state.searchAvoid) {
      state.searchBuilding = -1;
      state.streetSince = now;
      return false;
    }
    commitToExit(world, state, way, OUTSIDE, now);
  }

  return pressOnThroughExit(world, e, state, now, dt);
}

/**
 * Empty the room, then go and find another one — the whole of a zombie's
 * behaviour when there is nothing in front of it to chase.
 *
 * The room underfoot is latched rather than read fresh each tick. A doorway
 * belongs to no room's floor, so a zombie halfway through one would otherwise
 * see the room change, throw away the exit it had committed to and pick again
 * from the threshold it was standing in.
 */
function zombieSearchTick(world: World, e: Entity, state: AiState, now: number, dt: number): boolean {
  const room = world.rooms.roomAt(e.x, e.y);

  if (room !== state.searchRoom) {
    // Somewhere new. Whatever it was doing in the last room is finished with,
    // and the last room becomes the one place it won't head straight back to.
    state.searchFrom = state.searchRoom;
    state.searchRoom = room;
    state.roomClearSince = 0;
    state.searchExit = -1;
    state.searchAvoid = -1; // whatever it couldn't reach is behind it now
    state.searchBuilding = -1;
    state.streetSince = room === OUTSIDE ? now : 0;
  }

  if (room !== OUTSIDE) return searchIndoors(world, e, state, room, now, dt);
  return searchStreet(world, e, state, now, dt);
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
    senseTarget(world, e, state, now);
  }

  const target = state.targetId ? world.entities.get(state.targetId) : undefined;

  if (target && (target.type === 'human' || target.type === 'officer')) {
    const dist = Math.hypot(target.x - e.x, target.y - e.y);
    const gap = dist - (e.radius + target.radius);

    // Glass, a door, or a wall of sandbags between us and dinner: work at it
    // until it gives. The bags are see-through, so unlike a door this is a
    // thing they can watch their meal through while they tear it down.
    if (attackBlockingWindow(world, e, state, target, now)) return;
    if (gap < 90 && attackBlockingDoor(world, e, state, now)) return;
    if (zombieAtSandbag(world, e, state, now)) return;

    // Entities are kept apart by collision, so "contact" needs a little slack.
    const immuneUntil = world.grappleImmune.get(target.id);
    if (immuneUntil !== undefined && now >= immuneUntil) world.grappleImmune.delete(target.id);
    const shielded = immuneUntil !== undefined && now < immuneUntil;

    // A riot shield turns a grab away outright from whichever side it happens
    // to be covering — in front while it is up, behind while it is slung. It
    // costs a charge and buys the same breathing space the vest does, and
    // being caught from the *other* side is the whole cost of carrying one.
    if (!shielded && dist <= e.radius + target.radius + GRAPPLE_REACH_BONUS) {
      const inv = world.inventories.get(target.id);
      if (inv && inv.shield > 0) {
        const off = Math.abs(angleDelta(Math.atan2(e.y - target.y, e.x - target.x), target.facing));
        const covered = inv.shieldUp
          ? off <= SHIELD_FRONT_ARC
          : off >= Math.PI - SHIELD_BACK_ARC;
        if (covered) {
          inv.shield--;
          if (inv.shield <= 0) {
            inv.shieldUp = false;
            const at = inv.utilities.indexOf('riotShield');
            if (at >= 0) inv.utilities.splice(at, 1);
          }
          world.grappleImmune.set(target.id, now + KEVLAR_IMMUNE_MS);
          return;
        }
      }
    }

    if (!shielded && dist <= e.radius + target.radius + GRAPPLE_REACH_BONUS) {
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
    // Arrived, or given up on it. The clock matters as much as the arrival:
    // this branch sits above every check that would spot a zombie getting
    // nowhere, so one making for a spot it can never reach used to grind at
    // it for the rest of the round without any of them ever running.
    if (Math.hypot(state.lastSeenX - e.x, state.lastSeenY - e.y) < 30 || now >= state.lastSeenUntil) {
      state.lastSeenX = null;
      state.lastSeenY = null;
      state.path = null;
    } else {
      // Something went this way and a door is in the road. Tear at it —
      // unconditionally, because a door you are stood against is a door in
      // your way. `attackBlockingDoor` already stands aside for prey it can
      // actually reach, which is the only thing that should outrank it.
      if (attackBlockingDoor(world, e, state, now)) return;
      const desired = headingToward(world, e, state, state.lastSeenX, state.lastSeenY, now);
      step(world, e, state, desired, ZOMBIE_SPEED, ZOMBIE_TURN_RATE, dt, now);
      return;
    }
  }

  // Nothing to chase, but there are bags in the way of wherever it was going.
  if (zombieAtSandbag(world, e, state, now)) return;

  // Shut in somewhere with nothing to chase: work out that the door is the
  // problem rather than pacing the room until the round ends.
  if (zombieStuckTick(world, e, state, now, dt)) return;

  // Nothing to chase: empty the room it is in, then leave by a way out it
  // actually knows about and go looking for somewhere nobody has swept.
  if (zombieSearchTick(world, e, state, now, dt)) return;

  // Anything shut it happens to be stood against gets taken apart, whether or
  // not it saw it close and whatever the survivor count. This used to wait for
  // the city to empty out, which is why a zombie could stand nose-to-door for
  // most of a round doing nothing about it.
  if (attackBlockingDoor(world, e, state, now)) return;

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
  // It comes up slow rather than frozen. Set on the fresh state, so nothing
  // it was carrying from its old life follows it over.
  state.slowUntil = now + FRESH_ZOMBIE_SLOW_MS;
  state.slowMul = FRESH_ZOMBIE_SLOW_MUL;
  world.ai.set(target.id, state);

  // Whatever they were saying as it took them, they are not saying it now.
  world.speech.delete(target.id);

  remarkOnTurning(world, target, now);
}

/**
 * The last few seconds before somebody turns. They say something, once, and
 * most of them do — see `TURNING_LINES`.
 *
 * The reddening is not here: that is derived from `pendingInfections` in
 * `toWire`, so it needs no state and cannot get out of step with the clock it
 * is counting down. This only exists because a line has to be said exactly
 * once, and the latch rides on the AiState. Players have none, so a player
 * turning says nothing — which is right; they have the cure gun's readout for
 * that, and nobody narrates their own infection to themselves.
 */
function announceTurning(world: World, e: Entity, turnAt: number, now: number): void {
  if (turnAt - now > TURNING_TELL_MS) return;
  const state = world.ai.get(e.id);
  if (!state || state.saidTurning) return;
  state.saidTurning = true;
  if (Math.random() >= TURNING_LINE_CHANCE) return;
  if (world.speech.has(e.id)) return;

  world.speech.set(e.id, {
    text: TURNING_LINES[Math.floor(Math.random() * TURNING_LINES.length)],
    until: now + Math.min(TURNING_TELL_MS, turnAt - now),
  });
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
    // A moment where nothing can get hold of them again, so the vest buys a
    // chance to run rather than three grabs in the same second.
    world.grappleImmune.set(targetId, now + KEVLAR_IMMUNE_MS);
    world.speedBoosts.set(targetId, now + ESCAPE_BOOST_MS);
    return;
  }

  // An NPC officer who gets grabbed loses their nerve and runs for a while.
  //
  // A bot gets a fraction of that. Twenty seconds is a grey officer's answer
  // and it reads fine on one, because a grey officer is scenery; on a bot —
  // which is standing in a player's slot and is meant to still be alive at the
  // end — it was a third of a minute of not fighting, not looting and not
  // pathing, straight after the event that makes the next grab worse. What
  // ends the bot's version is being clear, not the clock. See BOT_SHAKEN_MS.
  if (target.type === 'officer' && !world.playerIds.has(target.id)) {
    const st = world.ai.get(target.id);
    if (st) st.fleeUntil = now + (world.bots.has(target.id) ? BOT_SHAKEN_MS : OFFICER_FLEE_MS);
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

/**
 * Grey officers hear a radio that is actually out and close on whoever is
 * holding it. Put it away and they go back to their patrol.
 *
 * Deliberately transient, unlike the crew a call dispatches: those were sent
 * to you and stay, these are only answering a handset they can hear. Scanned
 * on a slow cadence — this walks the officers, not the crowd, so it is a
 * handful of entities rather than four hundred.
 */
function updateRadioCalls(world: World, now: number): void {
  if (now < world.nextRadioScan) return;
  world.nextRadioScan = now + RADIO_CALL_SCAN_MS;

  // Who is holding one, if anybody. Almost always nobody, so this is the
  // cheap way out of the whole thing.
  const holders: Entity[] = [];
  for (const id of world.playerIds) {
    const inv = world.inventories.get(id);
    const who = world.entities.get(id);
    if (!inv || !who || heldItem(inv) !== 'radio') continue;
    holders.push(who);
  }

  for (const e of world.entities.values()) {
    if (e.type !== 'officer') continue;
    if (world.playerIds.has(e.id) || world.bots.has(e.id)) continue;
    const state = world.ai.get(e.id);
    if (!state) continue;
    // Anyone a call sent keeps theirs whatever the caller is holding now. That
    // includes the van's *driver*, who is an ordinary grey officer by every
    // other measure and would otherwise be rescanned off your shoulder the
    // moment you put the handset away.
    if (world.dispatched.has(e.id) || world.soldiers.has(e.id)) continue;

    let nearest: Entity | null = null;
    let bestDist = RADIO_CALL_RANGE;
    for (const holder of holders) {
      const d = Math.hypot(holder.x - e.x, holder.y - e.y);
      if (d < bestDist) {
        bestDist = d;
        nearest = holder;
      }
    }
    state.escortId = nearest ? nearest.id : null;
  }
}

export function processPendingInfections(world: World, now: number): void {
  for (const [id, turnAt] of Array.from(world.pendingInfections)) {
    const entity = world.entities.get(id);
    if (!entity || entity.type === 'zombie') {
      world.pendingInfections.delete(id);
      continue;
    }
    if (now < turnAt) {
      announceTurning(world, entity, turnAt, now);
      continue;
    }
    convert(world, entity, now);
  }
}

/**
 * An officer with something on them. They cannot move, path, loot or think —
 * `updateAi` has already skipped all of that — but they can point the gun at
 * whatever has hold of them and pull the trigger, at the rate `fireHeld`
 * allows while grappled.
 *
 * A mine stun freezes them properly: this only runs for a grapple, which is
 * the case the player gets a fighting chance in too.
 */
function pinnedOfficerTick(world: World, e: Entity, state: AiState, now: number): void {
  if (!isInGrapple(world, e.id)) return;
  const inv = world.inventories.get(e.id);
  if (!inv) return;

  // Whatever has hold of us, by preference — otherwise whatever we were on.
  const session = world.grapples.get(e.id);
  let attacker: Entity | undefined;
  if (session) {
    for (const zid of session.zombieIds) {
      const z = world.entities.get(zid);
      if (z) {
        attacker = z;
        break;
      }
    }
  }
  if (!attacker && state.targetId) attacker = world.entities.get(state.targetId);
  if (!attacker || attacker.type !== 'zombie') return;

  // No turn rate: the arm is being held, so it fires where it already points
  // if it can, and the shot goes wide when it cannot.
  const aim = Math.atan2(attacker.y - e.y, attacker.x - e.x);
  e.facing = aim;
  state.heading = aim;
  fireHeld(world, e, inv, aim, now);
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
  updateRadioCalls(world, now);

  // Counted once here rather than per zombie deciding whether to bother with
  // a door. Room occupancy rides along in the same walk: it is what turns "is
  // there anyone left in this room" from a spatial query per zombie into an
  // array lookup, and at 400 entities the walk was already being paid for.
  //
  // Who the pack is already onto rides along too, for the same reason and by
  // the same trick — one map lookup per zombie here, against a spatial query
  // per zombie in `senseTarget` if it had to go and find out for itself.
  let survivors = 0;
  world.rooms.beginCount();
  world.targetClaims.clear();
  for (const e of world.entities.values()) {
    if (e.type === 'human' || e.type === 'officer') {
      survivors++;
      world.rooms.addPrey(e.x, e.y);
    } else if (e.type === 'zombie') {
      world.rooms.addZombie(e.x, e.y);
      const onto = world.ai.get(e.id)?.targetId;
      if (onto) world.targetClaims.set(onto, (world.targetClaims.get(onto) ?? 0) + 1);
    }
  }
  world.survivorCount = survivors;

  for (const e of world.entities.values()) {
    // Players keep manual control even after they turn — no AI magnet.
    if (world.playerIds.has(e.id)) continue;
    if (frozen.has(e.id)) {
      // Pinned, but an officer with a gun is not out of the fight. This is the
      // only thing a frozen entity may do, and it is deliberately its own tiny
      // branch rather than a flag threaded through the whole AI: everything
      // about moving, looting and pathing stays switched off.
      if (e.type === 'officer') pinnedOfficerTick(world, e, getAi(world, e, now), now);
      continue;
    }

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
