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
import type { ItemId } from '../../shared/items.js';
import type { DoorRuntime } from './doors.js';

/** What a player's press or hold of E is doing to a door. */
export type DoorAction = 'open' | 'close' | 'lock' | 'unlock' | 'kick';
import type { Inventory } from './inventory.js';
import type { Grenade, Helicopter, Smoke } from './heli.js';
import type { AcidCloud, AcidSpit } from './acid.js';
import {
  WORLD_WIDTH,
  WORLD_HEIGHT,
  ENTITY_RADIUS,
  ENTITY_MAX_HEALTH,
  OFFICER_SPACING_PAD,
  TURNING_TELL_MS,
  HUMAN_COUNT,
  cityAreaScale,
  POLICE_STATION_OFFICERS,
  POLICE_STATION_OFFICERS_MIN,
  POLICE_STATION_OFFICERS_MAX,
  POLICE_STATION_GUARD_RADIUS,
  POLICE_STATION_STAFF_MIN,
  POLICE_STATION_STAFF_MAX,
  POLICE_STATION_CELL_MIN,
  POLICE_STATION_CELL_MAX,
  NPC_OFFICER_MIN,
  NPC_OFFICER_MAX,
  BOT_OFFICER_COUNT,
  BUSH_SPEED_MULTIPLIER,
  PATH_NODE_BUDGET_PER_TICK,
  ZOMBIE_SPEED_MUL_MIN,
  ZOMBIE_SPEED_MUL_MAX,
  HUMAN_SPEED_MUL_MIN,
  HUMAN_SPEED_MUL_MAX,
  STAMINA_MAX,
  PLAYER_ONE_SPAWN_RANGE,
  WINDOW_HEALTH,
  INITIAL_ZOMBIES,
  DOG_ROAR_SUMMON_SPREAD,
  MATERIALIZE_MS,
  BOUNDARY_THICKNESS,
  BUSH_HIDER_CHANCE,
  SHELTER_SEEK_CHANCE,
  SHELTER_FAR_CHANCE,
  SHELTER_LARGE_CHANCE,
  SHELTER_FURTHEST_CHANCE,
  PANIC_SCALE_MIN,
  PANIC_SCALE_MAX,
  DOOR_CLOSE_BEHIND_CHANCE,
  DOOR_LOCK_BEHIND_CHANCE,
  DOOR_BEG_CHANCE,
  DOOR_BEG_HOLD_CHANCE,
  DOOR_OPENS_FOR_STRANGERS_CHANCE,
  DOOR_SLAM_CHANCE,
  ZOMBIE_SMART_SHARE,
  VAN_GUARD_RADIUS,
  UNSTICK_CHECK_MS,
  TEST_BEACON_ON_A_BOT,
  ZOMBIE_SPREAD_SHARE,
  OFFICER_SEEK_CHANCE,
  BARRICADE_CHANCE,
  DOOR_GUARD_CHANCE,
  HIDE_DEEPER_CHANCE,
  FOLLOW_CROWD_CHANCE,
  RALLY_STARTING_CHARGES,
  FOLLOW_STARTING_CHARGES,
  PLAYER_ONE_SPAWN_AT_CENTER,
  ACID_SLOW_MUL,
  DOG_BIRTH_MS,
  DOG_RADIUS,
  DOG_MAX_HEALTH,
  DOG_MORPH_WINDUP_MS,
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
  COMPLEX_CROWD_MUL,
  RALLY_CHATTER_MIN_MS,
  RALLY_CHATTER_MAX_MS,
  INITIAL_ZOMBIE_SPREAD,
  NAV_CELL,
  OUTBREAK_KEEP_OUT_COLS,
  OUTBREAK_KEEP_OUT_ROWS,
  ZOMBIE_POST_GRAPPLE_SLOW,
} from '../../shared/constants.js';
import { SpatialGrid } from './spatial.js';
import {
  clamp,
  resolveCircleRect,
  segmentCircleT,
  segmentHitsBox,
  segmentRectT,
  type OrientedBox,
} from './geometry.js';
import { generateMap } from './mapgen.js';
import {
  dropDebugKit,
  giveStartingItem,
  heldItem,
  newInventory,
  spawnPickups,
} from './inventory.js';
import { NavGrid, type Waypoint } from './navgrid.js';
import { DangerField } from './danger.js';
import { OUTSIDE, RoomMap } from './rooms.js';
import { RumourField } from './rumour.js';
import { doorRect, initDoors } from './doors.js';
import { pondRadiusAt } from '../../shared/pond.js';
import { inAcidLobes } from '../../shared/acidshape.js';
import { initDucks, type Duck } from './ducks.js';
import type { Barricade, Emplacement } from './emplacement.js';
import type { BackupVehicle } from './backup.js';
import type { Mine } from './mines.js';
import type { FirePatch, PendingPatch } from './fire.js';
import type { DogState, Knockback, Lash, Tentacle } from './dog.js';

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
  /**
   * The sweep of somebody with acid in their eyes: which deadline it belongs
   * to, which way they were facing when it landed, and when that was.
   *
   * Keyed on the deadline rather than on a boolean so a second gobbet re-centres
   * the sweep by itself — see `blindedTick`. Nothing clears these, and nothing
   * needs to: they mean nothing at all while the id is out of `world.blinded`.
   */
  blindUntil: number;
  blindFrom: number;
  blindAt: number;
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
  /** Wants the far side of the city, whatever the distance. */
  shelterFurthest: boolean;
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
  /** Player this civilian is tagging along behind, or null. */
  followingId: string | null;
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
  /**
   * The building and the room they were shouted *into*, or -1 for a spot out
   * in the street.
   *
   * "GET OVER THERE!" pointed at a building is an order to go inside it and
   * stay inside it, and a raw coordinate cannot carry that. Two separate
   * things go wrong without it, and the second is the reported one: a deep
   * room is a long twisting route and A\* gives it up at `PATH_MAX_NODES`,
   * after which `slideToward` walks blindly at the goal — which is a civilian
   * pressed face-first into the outside of the building they were sent into.
   * Measured before the fix: **4 of 12 found a route at all**, and the ones
   * that did not stood 45-75px off the wall for the rest of the round.
   *
   * So the walk in is done a room at a time off the room graph, exactly as
   * `hidesDeeper` walks a landmark, and arriving means holing up rather than
   * standing on the pixel.
   */
  rallyBuilding: number;
  rallyRoom: number;
  /** When to give the walk in up and hole up wherever they got to. */
  rallyRoomUntil: number;
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
  /**
   * A bot officer working its way through the corner complex: when the raid
   * runs out, and which room it is making for next.
   *
   * `raidUntil` is one budget for the whole thing, never extended — the same
   * shape as `HIDE_DEEPER_GIVE_UP_MS`. `raidSnubUntil` is what stops a bot
   * that has finished walking straight back in. `raidLeaving` is the second
   * half of it and the half that was asked for: past `BOT_COMPLEX_LEAVE_AT` of
   * the budget it turns round and walks *out*, one doorway at a time down
   * `Room.depth`, rather than switching off in a back room when the clock
   * stops.
   */
  raidUntil: number;
  raidSnubUntil: number;
  raidRoom: number;
  raidLeaving: boolean;
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
  /**
   * Where something worth chasing was last seen or heard, and when the memory
   * of it lapses. Without the clock a zombie that can't get to the spot never
   * arrives, never clears it, and so never reaches the branches below that
   * would have noticed it was getting nowhere.
   */
  lastSeenUntil: number;
  lastSeenX: number | null;
  lastSeenY: number | null;
  /**
   * Who shot this zombie, and until when it cares.
   *
   * Latched to the **first** shooter: a second officer opening up on it does
   * not steal the grudge while this stands, which is what "commit to the one
   * that shot at them originally" has to mean when three people are firing.
   * Where to go rides `lastSeen` like everything else that walks a zombie
   * somewhere; what this adds is that `senseTarget` may not stamp over it.
   */
  provokedBy: string | null;
  provokedUntil: number;
  /**
   * Whether it took the bait, decided **once** when the grudge was set.
   *
   * Reported as *"it twitches in my direction but then immediately goes back to
   * chasing the civilian"* — the zombie turned on every shot and was then
   * pulled straight back by the prey at its elbow, which is a decision made and
   * unmade twice a second. Latched here so that a zombie which decided to
   * ignore you goes on ignoring you, and one which decided to come does not get
   * talked out of it. `ZOMBIE_RETALIATE_CHANCE` is the roll.
   */
  provokedTook: boolean;
  /**
   * The prey it walked away from to come for the shooter.
   *
   * A provoked zombie will still take somebody who walks into its face at
   * pouncing distance — that carve-out is why the grudge is not absurd. But the
   * body it just *decided to leave* is exactly the one thing that must not pull
   * it back, and a zombie chasing somebody is by definition right on top of
   * them. Everybody else is still fair game.
   */
  provokedFrom: string | null;
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
  /**
   * They have already said their piece about not feeling well. Once each, or
   * a dying man repeats himself thirty times a second.
   */
  saidTurning: boolean;
  /** Loot a bot officer is walking to, and when it last looked. */
  lootId: string | null;
  /**
   * What was lying there when it set off. A swap leaves a *different* item
   * under the same pickup id, so arriving and taking whatever the id now holds
   * is how a bot trades a rifle for the pistol somebody else just put down.
   */
  lootItem: ItemId | null;
  nextLootScanAt: number;
  /**
   * Pickups this bot has just had a go at, and when it may look at them again.
   * Keyed by pickup id — see BOT_LOOT_SNUB_MS.
   */
  lootSnub: Map<string, number>;
  /**
   * A bot has broken off and is running rather than trading shots. Latched
   * with hysteresis: it goes on inside BOT_BOLT_DIST and only off again past
   * BOT_SAFE_DIST, or they dither on the threshold.
   */
  bolting: boolean;
  /** Bot sprint reserve, spent bolting and refilled while walking. */
  botStamina: number;
  /** Bot has run itself out and must walk until it recovers. */
  botWinded: boolean;
  /** Earliest a bot will pop another smoke. */
  nextSmokeAt: number;
  /** Earliest a bot will throw a frag or lay a mine. Shared between the two. */
  nextThrowAt: number;
  /**
   * Latched: walking in, or giving ground. Held between two thresholds rather
   * than recomputed against one, or a bot sitting near its ideal range flips
   * between the two every few ticks and reads as jittering on the spot.
   */
  botClosing: boolean;
  botGiving: boolean;

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
  doorAction: 'open' | 'close' | 'lock' | 'unlock' | 'kick' | null;
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
  /**
   * Holed up, and keeps seeing to the doors of the room they are in — shuts
   * one that has come open, bolts one somebody unbolted. The noticing only;
   * the walking and the handle work are `lockAlso`'s.
   */
  guardsDoors: boolean;
  nextDoorGuardAt: number;
  /**
   * Bots only: a shut door something was heard behind, which is being covered
   * rather than opened, and how long that patience lasts.
   */
  doorWatch: number;
  doorWatchUntil: number;
  /**
   * Dispatched squads. `squadSlot` 0 leads and `sweeps`; the rest keep station
   * on the leader through `escortId`, at a bearing derived from their slot so
   * the four of them move as a group rather than stacking on one point.
   */
  squadSlot: number;
  sweeps: boolean;
  /**
   * The bearing the *formation* is held on, eased toward where the leader is
   * pointing rather than taken from it. Lives on the leader and is read by
   * everybody keeping station on him.
   */
  squadBearing: number;
  /** Latched station-keeping, so a follower doesn't stutter on the threshold. */
  squadClosing: boolean;
  /**
   * Committed to going round a building, rather than re-aiming into it.
   *
   * Two callers with the same problem: a sweeping squad refused a step into a
   * front room, and a bot officer refused one while running from a pack. Both
   * are "walk along the frontage until you are past it", so they share the one
   * commitment rather than keeping two that would drift — which is also why
   * these lost their `squad` prefix.
   */
  avoidUntil: number;
  avoidHeading: number;
  /**
   * A post to stay near — the van's driver minding the van, or the soldier
   * who put the beacon up holding it. How much ground goes with the post,
   * since a driver stands at his door and a beacon guard has a muster to
   * cover.
   */
  guardX: number | null;
  guardY: number | null;
  guardRadius: number;
  /**
   * A spectator's RTS move-order: go here, then hold and watch the street.
   *
   * Sits above escort/guard/patrol in `updateNpcOfficer` but below the fight,
   * so a commanded officer still defends itself and engages what it passes —
   * an attack-move for free. Only ever set for grey AI officers, and only from
   * a spectating socket; sticky until a new order replaces it. `null` means no
   * order.
   */
  commandX: number | null;
  commandY: number | null;
  /**
   * A sandbag wall this officer has been sent to build, and which way it lies.
   *
   * Read by a branch *above* the move order — a build order supersedes a move —
   * and below the fight, like everything else here. `buildAt` is when the
   * stacking finishes and is only set once he is stood at the spot, so being
   * dragged off it starts the work again rather than banking it.
   * `buildSetOutAt` is the one budget for the whole errand.
   */
  buildX: number | null;
  buildY: number | null;
  buildAngle: number;
  buildAt: number;
  buildSetOutAt: number;
  /**
   * Still carrying his one sandbag.
   *
   * Defaulted true for *everybody* and only ever read for a grey officer, the
   * same trick `guardsDoors` and the rest of the door traits use — nothing has
   * to be told that a civilian does not build sandbags, because nothing asks.
   * `toWire` emits it as `bag` only for grey officers, which is what the
   * spectator's command card counts.
   */
  hasSandbag: boolean;
  /**
   * Carrying the survivor beacon to where it was called for.
   *
   * A separate destination from `guardX`/`guardY` on purpose: he walks to this
   * one, and only once the mast is *up* does it become the post he holds. Both
   * at once and he would settle for standing near the spot rather than
   * reaching it.
   */
  beaconX: number | null;
  beaconY: number | null;
  /** When the mast goes up, or 0 while he is still on his way. */
  beaconPlantAt: number;
  /** When he set out, so a trip he cannot finish can be given up on. */
  beaconSetOutAt: number;
  /**
   * Next time a bot officer bothers to weigh up shouting people to the mast.
   * On an interval because the check walks the crowd in earshot.
   */
  nextBeaconShoutAt: number;
  /** How long they will hold a close waiting for a doorway to clear. */
  doorWaitUntil: number;
  /**
   * Searches well: gives up on an empty room quickly and picks the way out
   * that leads somewhere unswept. A dull one still leaves, just slowly and by
   * whichever door is nearest to hand.
   */
  smartZombie: boolean;
  /**
   * Looks at who the pack is already after and picks somebody else.
   *
   * Not all of them, deliberately — a horde where nothing ever doubles up
   * never brings anybody down. See `ZOMBIE_SPREAD_SHARE`.
   */
  spreadsOut: boolean;
  /** When the room it is in last looked empty, or 0. */
  roomClearSince: number;
  /**
   * Room this zombie reckons it is in, latched rather than read fresh — a
   * doorway belongs to no room's floor, and re-deciding mid-threshold is what
   * had one turning round in its own doorway.
   */
  searchRoom: number;
  /** Room it came out of, so it doesn't immediately go back in. */
  searchFrom: number;
  /** Doorway it is making for, and the spot just past it that counts as through. */
  searchExit: number;
  searchAimX: number;
  searchAimY: number;
  searchUntil: number;
  /** Last exit it gave up on, so the next choice doesn't land on it again. */
  searchAvoid: number;
  /** Closing on the chosen way out, or not — checked on an interval. */
  searchGap: number;
  searchProgressAt: number;
  /** Building it is crossing the street to get into, or -1. */
  searchBuilding: number;
  /** When it started milling about outdoors with nothing to chase, or 0. */
  streetSince: number;
  /** Runs to whoever has a gun rather than to a door. */
  officerSeeker: boolean;
  /**
   * An officer this one is sticking with. Set on the crew a radio call sends,
   * and on any grey officer within earshot while the radio is actually out —
   * the difference being that the crew keep it and the locals don't.
   */
  escortId: string | null;
  /**
   * Caught indoors with one of them, retreats deeper into the building and
   * bolts a door behind rather than running for the street past it.
   */
  barricades: boolean;
  /**
   * Holes up at the back of a building rather than in the first room reached.
   * Only ever fires somewhere partitioned, since `Room.depth` is a hop count
   * through doorways and an ordinary block is one undivided space.
   */
  hidesDeeper: boolean;
  /**
   * The room this one has holed up in, or OUTSIDE for anybody settled in a
   * bush, behind an officer, or otherwise not in a building.
   *
   * Latched when they settle rather than read fresh, because it is what
   * "pace about in *here*" means — reading the room underfoot every tick would
   * have somebody who drifted into a doorway adopt the next room along.
   */
  settleRoom: number;
  /**
   * Settled, but still walking to the spot they mean to settle at: the back of
   * the building for a deeper-hider, or the next leg of ordinary pacing.
   *
   * The distinction matters to doors. Somebody holed up does not open one;
   * somebody still on their way to holing up plainly has to, or a bolted
   * interior door on the route strands them in the hall.
   */
  settleGoalX: number | null;
  settleGoalY: number | null;
  /**
   * Deadline on whatever walk is under way while settled — the move in while
   * `settleGoalX` is set, and the current lap of pacing once it is not.
   *
   * One field, because it answers one question: this walk has taken long
   * enough. A spot that turned out to be behind a piece of geometry is paced
   * at forever without it.
   */
  settleWalkUntil: number;
  /** Standing still between legs, and doing nothing about it. */
  settlePauseUntil: number;
  /** Falls in behind a neighbour who is plainly getting away. */
  followsCrowd: boolean;
  /** The runner being followed right now, and how long that holds. */
  crowdHeading: number;
  crowdUntil: number;
  nextCrowdCheck: number;
  /** Next time this one might say something to whoever is protecting them. */
  nextProtectSpeechAt: number;
  /** A different doorway of the shelter to try first, after one was refused. */
  shelterVia: number;
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
  /**
   * When this grip breaks in the victim's favour, or null if it never does.
   *
   * Rolled once, as the grip is taken, so an escape lands at an unpredictable
   * moment *inside* the struggle rather than always on the deadline. Cleared
   * outright once `GRAPPLE_NO_ESCAPE_AT` of them have hold — being swarmed
   * means there is no getting away, and a pre-rolled escape has to be revoked
   * rather than merely out-voted.
   */
  escapeAt: number | null;
}

export interface Command {
  input: InputState;
  aim: number;
  /** Where the crosshair is in the world, for weapons that land somewhere. */
  aimX: number;
  aimY: number;
  shooting: boolean;
  sprint: boolean;
  interact: boolean;
  /** Right mouse, raw. The server works out whether it was a tap or a hold. */
  rightDown: boolean;
}

export interface World {
  map: MapData;
  nav: NavGrid;
  /** Shared geodesic distance-to-nearest-zombie field. */
  danger: DangerField;
  nextDangerRebuild: number;
  /**
   * Which room every indoor spot belongs to, and the way out of each. Static
   * for the round — it is built from walls and doorways, neither of which
   * move — so it deliberately sits outside the `navDirty` rebuild.
   */
  rooms: RoomMap;
  /**
   * Where zombies have been *seen*, decaying. What the crowd knows, as against
   * what `danger` knows, which is everything.
   */
  rumour: RumourField;
  /** Set when glass breaks; the tick loop rebuilds the nav grid once. */
  navDirty: boolean;
  entities: Map<string, Entity>;
  /** Socket-controlled ids. AI never drives these, whatever their type. */
  playerIds: Set<string>;
  spectators: Set<string>;
  commands: Map<string, Command>;
  ai: Map<string, AiState>;
  grapples: Map<string, GrappleSession>;
  /**
   * Shrugged a grab off with kevlar and can't be seized again until this
   * passes. Only the vest ever grants it.
   */
  grappleImmune: Map<string, number>;
  /** Bitten but not yet turned: id -> timestamp when they become a zombie. */
  pendingInfections: Map<string, number>;
  /** How many times each victim has been grappled — raises instant-turn odds. */
  grappleCounts: Map<string, number>;
  speedBoosts: Map<string, number>;
  lastShotAt: Map<string, number>;
  /**
   * Heavy MG bipod: id -> when planting began. Present means deploying or
   * deployed; DEPLOY_MS after that timestamp it is actually steady.
   */
  deployStart: Map<string, number>;
  /**
   * Heavy MG being packed away: when it started, and how far up it had got.
   * Present means still rooted, with the gauge draining from that height.
   */
  stowing: Map<string, { at: number; from: number }>;
  /**
   * Right mouse, resolved server-side into a tap or a hold the way E is at a
   * door. `rightHeld` is when the button went down, `rightSpent` latches a
   * hold so it fires once per press, and `deployWanted` is the bipod toggle
   * that used to live on the client.
   */
  rightHeld: Map<string, number>;
  rightSpent: Set<string>;
  deployWanted: Set<string>;
  /** Earliest each officer may bash again. */
  bashReadyAt: Map<string, number>;
  /** Shoving right now — drives the client animation. */
  bashUntil: Map<string, number>;
  /**
   * Where each officer is actually pointing, as against where their mouse is.
   * A weapon with a turnRate swings at a limited rate and the body follows;
   * everything else keeps this equal to the mouse.
   */
  aimHeading: Map<string, number>;
  /** Charge rifle: id -> when the trigger went down, while winding up. */
  chargeSince: Map<string, number>;
  /** Sprint reserve for player officers. */
  stamina: Map<string, number>;
  /** Players who ran the bar dry and haven't recovered enough to sprint again. */
  exhausted: Set<string>;
  shots: Shot[];
  /**
   * Zombies that died this tick — cleared right after the snapshot goes out,
   * exactly like `shots`. The client turns each into a ragdoll-and-grey corpse;
   * nothing else is sent. Dogs are not in here (they keep `corpses`).
   */
  deaths: Array<{ id: string; x: number; y: number; a: number }>;
  entityGrid: SpatialGrid<Entity>;
  /**
   * Just the zombies, rebuilt beside `entityGrid`.
   *
   * Threat perception asks "what is coming for me", and it used to ask that of
   * the grid holding *everybody* — collecting a couple of dozen neighbours and
   * then rejecting all but the zombies on a type check. In a city of 500
   * civilians and five zombies that is the wrong question by two orders of
   * magnitude, and its cost scaled with how many people were alive rather than
   * with how far the outbreak had got. Same trick as the danger field: build
   * the answer once for everybody instead of letting each of them go and look.
   */
  zombieGrid: SpatialGrid<Entity>;
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
  speech: Map<string, { text: string; until: number; radio?: boolean }>;
  /** Remaining rally shouts per player. */
  rallyCharges: Map<string, number>;
  /**
   * Buildings a crowd has been shouted into, and until when.
   *
   * Read by the settled door-guard, which otherwise bolts the street door on
   * the half of the crowd still walking to it: `guardsDoors` fires on nearly
   * half the city, so the first person in settles, notices the front door
   * standing open, walks back and locks everyone else out. Measured before
   * this, a door held open for the whole walk-in still picked up a bolt on two
   * cities in six.
   *
   * **A deadline rather than a count of who is still coming**, which is the
   * only shape that cannot leak. A counter has to be decremented by everybody
   * who arrives, gives up, is eaten or turns — and the one that gets missed
   * holds the building's doors open for the rest of the round, which is
   * exactly the `busyBy` fault recorded under **Doors**. This expires on its
   * own, is one map lookup to read, and says something true: for as long as an
   * order might still be being obeyed, its building stays open.
   */
  ralliedInto: Map<number, number>;
  /** Remaining follow commands, and who currently has people in tow. */
  followCharges: Map<string, number>;
  followers: Set<string>;
  /** Loot lying on the floor, keyed by pickup id. */
  pickups: Map<string, PickupState>;
  inventories: Map<string, Inventory>;
  grenades: Map<string, Grenade>;
  smokes: Map<string, Smoke>;
  /**
   * The dog's acid: clouds on the ground and gobbets still in the air.
   *
   * Held as plain data on the world rather than reached for through `acid.ts`,
   * so `hasLineOfSight` and `speedAt` — both of which live here and neither of
   * which takes a clock — can read a cloud without this file importing that one
   * at runtime. It is the same shape of arrangement `navBlockers` has with
   * `backup.ts`, and for the same reason.
   */
  acid: Map<string, AcidCloud>;
  spits: Map<string, AcidSpit>;
  /**
   * Who has had a gobbet go over their face, and until when.
   *
   * A map of deadlines exactly like `stunned`, and read in the same place — but
   * deliberately *not* folded into `computeFrozen` beside it. Frozen means an
   * entity is skipped outright; being blinded means the legs stop and the head
   * does not, which is a smaller thing and needs its own branch to have
   * anywhere to put the looking around.
   */
  blinded: Map<string, number>;
  /** The flock on the pond. Scenery that reacts, not entities. */
  ducks: Duck[];
  /** Recent detonations, cleared once they have been drawn out. */
  blasts: Array<{ x: number; y: number; at: number }>;
  helicopters: Map<string, Helicopter>;
  /** Officers played by the machine, standing in for absent players. */
  bots: Set<string>;
  /**
   * The grey officers the city started with, as against anyone a radio call
   * sent afterwards. They are the standing garrison, spread evenly over the
   * map, and they are what stops a dog simply running to an empty corner and
   * starting an outbreak there — see `CITY_OFFICER_DOG_*`.
   */
  cityOfficers: Set<string>;
  /**
   * Connections playing a dog rather than an officer, and the head, jaws and
   * bite clock that go with each.
   *
   * Keyed by connection like `playerIds` rather than rebuilt per round, because
   * which seat somebody took is a lobby fact and survives a restart: a dog
   * player who restarts the round is still a dog player.
   */
  dogs: Set<string>;
  dogState: Map<string, DogState>;
  /**
   * Dogs that have run out of horde to come back out of. They hold no entity
   * from that moment and are out of the round — which is what makes every
   * zombie the officers put down worth something to them.
   */
  dogsOut: Set<string>;
  /**
   * Every dog put down this round, left where it fell. Permanent for the round
   * — the animal rises again out of a shambler somewhere else and the body it
   * left stays exactly where somebody shot it, which is the only lasting mark
   * the officers get for having killed one.
   */
  corpses: Array<{ x: number; y: number; facing: number; head: number }>;
  /**
   * Dogs that are down, and when they went.
   *
   * **On the world rather than on `DogState`**, which is where this started and
   * is a trap: that state is created lazily on the first tick and *deleted* on
   * every respawn, so a dog shot in either of those windows had nowhere to
   * record that it had died — it dropped a body, kept its entity, and could be
   * killed again on the very next round. Keyed by id here, it always exists.
   */
  dogDeaths: Map<string, number>;
  /**
   * Dogs part-way out of a shambler: which body they are coming out of, and
   * when the birth began. Keyed by dog id, because it is the dog's business.
   *
   * **It exists so the birth can be watched.** The host used to be picked and
   * consumed in the same instant, at the end of the death window, with the
   * screen still black — so the one moment that explains where a dog comes from
   * happened where nobody could see it. Choosing it a whole `DOG_BIRTH_MS`
   * early is what puts the camera on the right body before the fade lifts.
   *
   * A birth is *interruptible*: the host is an ordinary zombie standing in an
   * ordinary street, and the garrison can shoot it out from under you. That is
   * deliberately not defended against — the horde is the dog's lives, and a
   * host killed mid-birth costs one exactly as any other shambler does.
   */
  dogBirths: Map<string, DogBirth>;
  /**
   * How many people each dog has *turned*, banked as charges for the roar and
   * spent all at once when it is used.
   *
   * **Turned, not bitten.** Somebody incubating is not a zombie yet and may
   * never be one — the cure gun exists, and a charge rifle takes carriers off
   * the map before they come up. So the credit lands in `convert`, the one
   * place a body actually becomes a zombie, whether that is a grab that turned
   * on the spot or one that took a minute to.
   *
   * On the world rather than on `DogState`, and for the same reason
   * `dogDeaths` is: that state is deleted on every respawn, and a tally that
   * reset itself each time the dog was shot would be a tally of nothing.
   */
  dogConversions: Map<string, number>;
  /**
   * The same tally as a **running total**, which nothing ever spends.
   *
   * `dogConversions` is a balance and the roar sets it to nought; this is what
   * the acid's `DOG_SPIT_UNLOCK_AT` reads. Gating an unlock on a balance would
   * let the roar take the acid *away* again — fifteen turned, hexagon opens,
   * roar, hexagon shuts with fifteen to go — so the two are separate numbers
   * incremented on the same line in `creditConversion`.
   *
   * On the world for the same reason its twin is: `DogState` is deleted on
   * every respawn, and a progression that reset each time the animal was shot
   * would be no progression at all.
   */
  dogTurned: Map<string, number>;
  /**
   * When each of a dog's abilities may be used again, by slot — and **the whole
   * reason it is here rather than on `DogState` is that dying must not refresh
   * them**.
   *
   * `finishDogBirth` *deletes* the dog state, which is right for everything
   * else in it: the neck, the jaws, the bite in progress and the roar in
   * progress all belong to the body that just died. A cooldown does not. Left
   * on that state, the cheapest way to have the acid back was to go and get
   * shot — `DOG_SPIT_COOLDOWN_MS` is 22s against a death and a birth together
   * of under four. Exactly the reason `dogDeaths`, `dogConversions` and
   * `dogTurned` live out here too.
   *
   * An array by slot rather than a field per ability, because the ability bar
   * is a fixed row and the whole value of one is that nothing shifts when a
   * slot is filled in — a third ability should need a constant and a branch in
   * `startDogAbility`, not another map on the world.
   *
   * Cleared by `spawnDog`, which is a *new round* or somebody joining one, and
   * deliberately not by `finishDogBirth`, which is the same dog getting up.
   */
  dogCooldowns: Map<string, number[]>;
  /**
   * How many humans the outbreak has turned, in total — by any zombie, dog or
   * shambler, and the one thing that pays for the transformation.
   *
   * **Deliberately not per-dog.** `dogConversions` and `dogTurned` are a
   * particular dog's own balance and total; this is the city's, shared by
   * every zombie in it, because `DOG_MORPH_UNLOCK_CONVERTED` is a threshold the
   * *outbreak* crosses rather than a thing any one animal earns. Incremented
   * once in `convert`, the single place a body actually becomes a zombie,
   * whichever of its three call sites got it there.
   */
  totalConverted: number;
  /**
   * Dogs that have burst and the clouds and tentacles owed to them.
   *
   * A queue rather than a call, because `killEntity` lives here and **`world.ts`
   * must not import `acid.ts` or `dog.ts` at runtime** — the world holds their
   * data as plain records precisely so `hasLineOfSight` and `speedAt` can read
   * it without a cycle. `updateDogs` drains this on the next tick, which is the
   * same arrangement `pendingFires` already uses and costs one tick nobody can
   * see.
   */
  pendingBursts: Array<{ x: number; y: number; facing: number }>;
  /**
   * Tentacles thrown out of a burst dog: in the air on grenade physics, then
   * lying where they came to rest until they fade.
   */
  tentacles: Map<string, Tentacle>;
  /**
   * Tentacle strikes in flight: coiling, going out, or coming home. Short-lived
   * and there are never many, so a plain array is enough.
   */
  lashes: Lash[];
  /**
   * Bodies that have been shoved, and the impulse still bleeding off them.
   *
   * **On the world rather than on `AiState`**, because the things that can be
   * knocked about are not all AI: a player has no `AiState` at all, and neither
   * does a dog. One map covers every body in the game without any of them being
   * asked to know that a shove exists — `updateKnockback` in `dog.ts` is the
   * only thing that reads it, and it runs above `resolveCollisions` so a body
   * shoved into a wall is pushed back out of it in the same tick.
   *
   * Self-emptying: an entry is dropped the moment its deadline passes or its
   * body leaves the world, so this holds only people currently in the air.
   */
  knockbacks: Map<string, Knockback>;
  /**
   * Officers the horde has made contact with, for the dog's corner map, and
   * when to work the list out again.
   *
   * **Shared rather than per dog**, because the answer does not depend on who
   * is looking: it is a fact about where the outbreak is touching the garrison.
   * Two dogs in a lobby read the same array, and with no dog in the round it is
   * never built at all.
   */
  dogContacts: Array<{ x: number; y: number }>;
  nextDogContactScan: number;
  /**
   * Which dog's teeth started the infection somebody is carrying, victim id to
   * dog id. Only ever written for a bite a dog caused, so it is a handful of
   * entries rather than one per infection.
   *
   * It has to be cleared wherever a pending infection is — a cure gun, most of
   * all. Left behind, somebody a dog bit, a medic saved, and a shambler later
   * finished off would still credit the dog.
   */
  infectedByDog: Map<string, string>;
  /** How many the next round should spawn — the lobby sets this. */
  botOfficerCount: number;
  /**
   * Whether this round is somebody playing on their own.
   *
   * The only thing that reads it is the debug loot ring — see `dropDebugKit`.
   * Set from the lobby beside `botOfficerCount`, which is the other thing the
   * lobby tells the world about the shape of the round rather than about who
   * is in it. Defaults true: a world built without a lobby behind it is a
   * harness or a bare `?spectate`, and neither is a game anybody else is in.
   */
  offline: boolean;
  /**
   * **TESTING: the dog's ability cooldowns are off.**
   *
   * Read in exactly one place — `readyAt` in `dog.ts`, plus the lash's own
   * deadline — which is the whole reason the cooldowns were moved onto the
   * world in the first place: one function answers "when may this fire again"
   * for every hexagon on the bar, so a testing switch needs one line rather
   * than one per ability.
   *
   * **Only ever honoured while `world.offline`**, checked where it is read
   * rather than where it is set. A flag set at the menu is still in
   * `localStorage` when somebody joins an online lobby — the same trap `noFog`
   * documents — so the rule has to live at the point of use, and it has to live
   * on the server: a client that lies about being offline changes nothing.
   *
   * Cleared by `resetWorld` like everything else about a round, and re-sent by
   * the client on `start`.
   */
  dogAbilitiesFree: boolean;
  /**
   * Survivor beacons standing in the city. Placed, then pointed at.
   *
   * A mast only ever appears here once a soldier has actually got to the spot
   * and put it up — which is what gates the Q wheel's "go to the beacon" with
   * no code in the wheel at all, since the option already tests this list.
   */
  towers: Array<{ x: number; y: number }>;
  /**
   * The one beacon call, from the moment it is made. Null until somebody picks
   * a spot off the map. `placed` is the mast standing, as against the soldier
   * still walking to it, and the two are deliberately separate — the wait is
   * the cost of the thing.
   */
  beacon: {
    x: number;
    y: number;
    /** The soldier bringing it, while he is alive to bring it. */
    carrierId: string | null;
    placed: boolean;
  } | null;
  /** Zap mines waiting on the ground, and the crackle when one goes. */
  mines: Map<string, Mine>;
  zaps: Array<{ x: number; y: number; at: number }>;
  /**
   * Zombies a mine has dropped: id -> when they come round. They are folded
   * into the frozen set, so the AI skips them entirely rather than each
   * branch having to remember to check.
   */
  stunned: Map<string, number>;
  /** Whatever the radio sent, and the crackle back from the handset. */
  vehicles: Map<string, BackupVehicle>;
  /**
   * Solid bodies that are not part of the map and are not entities either: a
   * parked vehicle, and nothing else so far.
   *
   * Two readers, and it needs both. `rebuildNav` stamps them into the grid so
   * a route goes round; `hasWallClearPath` refuses the straight line so the
   * route is actually asked for. Either alone does nothing — see the note on
   * `park` in `backup.ts`.
   *
   * Deliberately **not** in `wallGrid`, which is what `hasLineOfSight` and
   * `fire` read: a van is cover you shoot over, and that is the whole trade.
   *
   * A plain array of boxes rather than a reach back into `vehicles`, because
   * `world.ts` holds only a *type* import of `backup.ts` and reading the
   * geometry out of it would make that a runtime cycle. Whoever puts a body
   * down fills this in and sets `navDirty`.
   */
  navBlockers: OrientedBox[];
  radioReplies: Array<{ id: string; at: number }>;
  /** Next time to check who is holding a radio. Rarely anybody, so it's slow. */
  nextRadioScan: number;
  /** Deployed pocket gunners, keyed by the officer manning each one. */
  emplacements: Map<string, Emplacement>;
  /**
   * Bare sandbag walls the garrison built to a spectator's order.
   *
   * Kept beside the emplacements rather than folded into them: an emplacement
   * whose gun is gone is a record that has to be deleted, and a wall is a thing
   * that exists on its own. Everything about how it *behaves* is shared —
   * `zombieAtSandbag`, the collision push-out and the drawing all handle both.
   */
  barricades: Map<string, Barricade>;
  /**
   * How many zombies are currently onto each victim, keyed by victim id.
   *
   * Recounted once a tick off the walk that was already happening, the same
   * trick room occupancy uses: it turns "is the pack already after this one"
   * from a spatial query per zombie into a map lookup. Only zombies that
   * actually care read it — see `spreadsOut`.
   */
  targetClaims: Map<string, number>;
  /** Ground still alight, and who is on fire until when. */
  fires: FirePatch[];
  /**
   * Napalm in the air: where each pull of the flamethrower will set the ground
   * alight once the stream actually gets there. Burning ground appearing under
   * the crosshair before the fuel has crossed the street is the whole reason
   * this exists — see `FLAME_TRAVEL_MS`.
   */
  pendingFires: PendingPatch[];
  burning: Map<string, number>;
  /** Frozen: a solo round with its pause panel up. */
  paused: boolean;
  /** Gamertag per connected player, as given at the front end. */
  names: Map<string, string>;
  /** Ids of helicopter-dropped troops — they aim far better. */
  soldiers: Set<string>;
  /** Ids of the crew out of a SWAT van: black gear, a shield, a rifle. */
  swat: Set<string>;
  /** Ids of the two out of a patrol car: grey, but with bolt action rifles. */
  riflemen: Set<string>;
  /** Ids of whoever is leading a sweep: radio pack on the back, vest on. */
  squadLeads: Set<string>;
  /**
   * Everyone a radio call sent, whatever grade. This is the one that keeps an
   * escort: the van driver is an ordinary grey officer by every other measure
   * and would otherwise be rescanned off your shoulder the moment you put the
   * handset away.
   */
  dispatched: Set<string>;
  pathBudget: number;
  gameOver: boolean;
  victory: boolean;
  /** Where the first zombie appears — player one spawns here for testing. */
  outbreakOrigin: { x: number; y: number };
  /**
   * Which edge the outbreak walked in from: 0 N, 1 E, 2 S, 3 W. Kept because a
   * SWAT van must not arrive on it — backup coming in out of the breach is
   * backup coming in through the horde, and it reads as the game putting your
   * reinforcements in the worst place on the map on purpose.
   */
  outbreakSide: number;
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
 * A dog is an ordinary zombie entity with its own build. `speedMul` is pinned
 * to 1 like any other player's — the shamble variation exists so a horde
 * doesn't move as one blob, and a person driving one should get exactly the
 * pace the constants say.
 */
export function makeDogEntity(id: string, x: number, y: number): Entity {
  const e = makeEntity(id, 'zombie', x, y);
  e.radius = DOG_RADIUS;
  e.maxHealth = DOG_MAX_HEALTH;
  e.health = DOG_MAX_HEALTH;
  e.speedMul = 1;
  return e;
}

/**
 * Put a dog into the world. It comes in at the breach with the rest of the
 * outbreak — it is not a thing that was already standing in the city.
 *
 * The bite state is *deleted* rather than reset here: `dogTick` creates it on
 * first use, so there is one place that knows what a fresh one looks like.
 *
 * **This is a new round, or somebody joining one — it is not a respawn.** A dog
 * rising out of a shambler goes through `finishDogBirth`, which moves the body
 * it already has. That is what makes clearing the ability cooldowns here
 * correct and clearing them there wrong: a fresh round starts with everything
 * ready, and dying is not a way to have it back.
 */
export function spawnDog(world: World, id: string): void {
  const origin = world.outbreakOrigin;
  // **Out in the street, like the rest of the outbreak.** `findSpawnNear` only
  // ever checked geometry and other bodies, and a room's floor is clear of
  // both — so a fifth of all dogs came into the round standing in somebody's
  // front room. See the note in that function.
  const spawn = findSpawnNear(world, origin.x, origin.y, DOG_RADIUS, PLAYER_ONE_SPAWN_RANGE, true);
  world.entities.set(id, makeDogEntity(id, spawn.x, spawn.y));
  world.dogs.add(id);
  world.dogsOut.delete(id);
  world.dogDeaths.delete(id);
  world.dogBirths.delete(id);
  world.dogState.delete(id);
  world.dogCooldowns.delete(id);
  world.stamina.set(id, STAMINA_MAX);
  world.exhausted.delete(id);
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
    blindUntil: 0,
    blindFrom: 0,
    blindAt: 0,
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
    shelterFurthest: Math.random() < SHELTER_FURTHEST_CHANCE,
    panicScale: PANIC_SCALE_MIN + Math.random() * (PANIC_SCALE_MAX - PANIC_SCALE_MIN),
    sawZombie: false,
    fleeStyle: Math.random() < BOLT_FLEE_CHANCE ? 'bolt' : 'safest',
    staysIndoors: Math.random() < INDOOR_STAY_CHANCE,
    witness: rollWitness(),
    followingId: null,
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
    // One full interval of grace. At 0 the very first tick of a fresh state
    // always reports zero progress — it has not had a chance to move yet — so
    // `unstickTick` declared every newly spawned entity stuck and committed it
    // to `UNSTICK_COMMIT_MS` of blind breakout before it had taken a step. It
    // shows up worst on anything spawned *with somewhere to be*: the beacon
    // carrier was dropped 80px from his spot and walked steadily away from it,
    // because the breakout owns the tick and knows nothing about the goal.
    lastUnstickCheck: now + UNSTICK_CHECK_MS,
    unstickX: x,
    unstickY: y,
    slowMul: ZOMBIE_POST_GRAPPLE_SLOW,
    rallyX: null,
    rallyY: null,
    rallyBuilding: -1,
    rallyRoom: -1,
    rallyRoomUntil: 0,
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
    raidUntil: 0,
    raidSnubUntil: 0,
    raidRoom: -1,
    raidLeaving: false,
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
    lastSeenUntil: 0,
    lastSeenX: null,
    lastSeenY: null,
    provokedBy: null,
    provokedUntil: 0,
    provokedTook: false,
    provokedFrom: null,
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
    saidTurning: false,
    lootId: null,
    lootItem: null,
    nextLootScanAt: 0,
    lootSnub: new Map(),
    bolting: false,
    botStamina: STAMINA_MAX,
    botWinded: false,
    nextSmokeAt: 0,
    nextThrowAt: 0,
    botClosing: false,
    botGiving: false,

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
    guardsDoors: Math.random() < DOOR_GUARD_CHANCE,
    nextDoorGuardAt: 0,
    doorWatch: -1,
    doorWatchUntil: 0,
    squadSlot: -1,
    sweeps: false,
    squadBearing: 0,
    squadClosing: false,
    avoidUntil: 0,
    avoidHeading: 0,
    guardX: null,
    guardY: null,
    guardRadius: VAN_GUARD_RADIUS,
    commandX: null,
    commandY: null,
    buildX: null,
    buildY: null,
    buildAngle: 0,
    buildAt: 0,
    buildSetOutAt: 0,
    hasSandbag: true,
    beaconX: null,
    beaconY: null,
    beaconPlantAt: 0,
    beaconSetOutAt: 0,
    nextBeaconShoutAt: 0,
    doorWaitUntil: 0,
    smartZombie: Math.random() < ZOMBIE_SMART_SHARE,
    spreadsOut: Math.random() < ZOMBIE_SPREAD_SHARE,
    roomClearSince: 0,
    searchRoom: OUTSIDE,
    searchFrom: OUTSIDE,
    searchExit: -1,
    searchAimX: 0,
    searchAimY: 0,
    searchUntil: 0,
    searchAvoid: -1,
    searchGap: Infinity,
    searchProgressAt: 0,
    searchBuilding: -1,
    streetSince: 0,
    officerSeeker: Math.random() < OFFICER_SEEK_CHANCE,
    escortId: null,
    barricades: Math.random() < BARRICADE_CHANCE,
    hidesDeeper: Math.random() < HIDE_DEEPER_CHANCE,
    settleRoom: OUTSIDE,
    settleGoalX: null,
    settleGoalY: null,
    settleWalkUntil: 0,
    settlePauseUntil: 0,
    followsCrowd: Math.random() < FOLLOW_CROWD_CHANCE,
    crowdHeading: 0,
    crowdUntil: 0,
    nextCrowdCheck: 0,
    nextProtectSpeechAt: 0,
    shelterVia: -1,
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

/**
 * Give every broadphase grid the dimensions of the map it is about to index.
 *
 * **The city changes size between rounds now** — the lobby's population slider
 * — and a `SpatialGrid` takes its column and row count once, in its
 * constructor. Grown, the old grid is merely wasteful: it is a sparse `Map`, so
 * the extra cells cost nothing and every query still lands in the right one.
 * *Shrunk* is the dangerous direction, and it fails quietly: `col`/`row` clamp
 * to the last index, so everything past the new map's edge would pile into one
 * cell and every query out there would walk the lot. Cheap to rebuild, and only
 * ever once a round.
 *
 * Sized off `map`, not off `WORLD_WIDTH`, so a grid cannot disagree with the
 * geometry it holds even if the two ever drift.
 */
function resizeGrids(world: World): void {
  const { width, height } = world.map;
  world.doorGrid = new SpatialGrid<number>(STATIC_CELL, width, height);
  world.entityGrid = new SpatialGrid<Entity>(ENTITY_CELL, width, height);
  world.zombieGrid = new SpatialGrid<Entity>(ENTITY_CELL, width, height);
  world.wallGrid = new SpatialGrid<Wall>(STATIC_CELL, width, height);
  world.bushGrid = new SpatialGrid<Bush>(STATIC_CELL, width, height);
  world.windowGrid = new SpatialGrid<number>(STATIC_CELL, width, height);
}

export function buildStaticGrids(world: World): void {
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
/**
 * The sandbag walls, as boxes for the nav grid's destructible layer.
 *
 * **Counted off the records rather than kept as a list**, for the reason every
 * other tally here is: a wall arrives when an officer stacks one and leaves
 * when a zombie has finished with it, and a list somebody has to remember to
 * strike from is a list that steers the whole city round a wall that is no
 * longer there. This cannot go stale, because it *is* the walls.
 *
 * Both kinds, because as far as anything walking is concerned there is no
 * difference between a bare wall and the same bags with a gun behind them.
 */
function softNavBoxes(world: World): OrientedBox[] {
  const out: OrientedBox[] = [];
  for (const wall of world.barricades.values()) out.push(wall.box);
  for (const gun of world.emplacements.values()) {
    if (gun.bags) out.push(gun.bags);
    out.push(gunnerBox(gun));
  }
  return out;
}

/**
 * **The gunner's own body, which is scenery rather than a person.**
 *
 * Every other body in the game gets shoved aside, which is why bodies are in no
 * nav layer at all — a route drawn through somebody is a route that works,
 * because they move. This one does not: `updateEmplacements` writes it back
 * onto its mount every tick, so a shove is undone before anybody can use it.
 * And `resolveCollisions` keeps officers `OFFICER_SPACING_PAD` further apart
 * than their circles demand, so what another officer meets is not a 24px body
 * but a **36px plug**. Measured on a 56px doorway with a gunner 26px outside
 * it, bags already torn down: the bot never got past in 20s over 5 cities, and
 * finished 30-37px off him, still wanting what was behind him.
 *
 * That is the report this whole file is about wearing a different hat — a body
 * pressing at something its router does not know about, forever — so it gets
 * the answer the bags already have: the **destructible layer**. Anything alive
 * goes round; a zombie walks at him, which is right, because it can eat him and
 * that is how the emplacement is taken apart. He leaves the layer when the
 * emplacement is dismounted, at which point he stops being pinned and goes back
 * to being an ordinary grey officer.
 *
 * **It only started to matter when the gun began landing where it was aimed.**
 * `deployEmplacement` used to scatter it 40-110px off on a random bearing, so a
 * gunner in a doorway was a coincidence; now it is what a player siting one
 * there gets, every time.
 */
function gunnerBox(gun: Emplacement): OrientedBox {
  const r = ENTITY_RADIUS.officer;
  return { x: gun.x, y: gun.y, hw: r, hh: r, angle: 0 };
}

export function rebuildNav(world: World): void {
  world.nav = new NavGrid(
    world.map,
    new Set(world.brokenWindows),
    world.navBlockers,
    softNavBoxes(world),
  );
  world.danger = new DangerField(world.map, world.nav);
  world.nextDangerRebuild = 0;
  world.navDirty = false;
}

export function rebuildEntityGrid(world: World): void {
  world.entityGrid.clear();
  world.zombieGrid.clear();
  for (const e of world.entities.values()) {
    world.entityGrid.insertRect(e, e.x - e.radius, e.y - e.radius, e.x + e.radius, e.y + e.radius);
    // Filled in the walk that was already being paid for, so the second grid
    // costs an extra branch rather than an extra pass.
    if (e.type === 'zombie') {
      world.zombieGrid.insertRect(e, e.x - e.radius, e.y - e.radius, e.x + e.radius, e.y + e.radius);
    }
  }
}

/** True when neither a wall nor a bush sits between the two points. */
export function hasLineOfSight(
  world: World,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  /** Officers are trained and looking for this; foliage doesn't hide it. */
  seeThroughBushes = false,
  /**
   * **Whose eyes these are**, and it is the acid that needs to know.
   *
   * Walls, doors and bushes are geometry: they stop a sight line whoever is
   * asking, and they stop a blast wave asking whether it reaches. A chemical
   * cloud is not geometry — it is something you cannot *see* through — so it
   * applies only when somebody is actually looking, and only when that somebody
   * is not the thing it came out of.
   *
   * Three cases, and two of them ignore the acid entirely:
   *
   * - a zombie's eyes (`'zombie'`, which is what a dog is) — ignored. The dog
   *   sees in its own cloud and straight through it, and so does the horde. An
   *   ability that blinds your own side is one nobody presses twice.
   * - anybody else's eyes — the cloud occludes, and standing *in* one is zero
   *   vision. See below.
   * - **no eyes at all** (the default) — ignored. A blast asking whether it
   *   reaches a body is not looking at it, and left to the other default a
   *   grenade thrown into a cloud would quietly do nothing at all.
   *
   * Every perception and every fog test must therefore pass one. The list is
   * short and enumerable: `visibleTo`/`visiblePickups`/`visibleShots` in
   * `engine.ts`, `senseThreats`/`senseTarget` and the handful of scans beside
   * them in `ai.ts`, the dog's jaws, the pocket gunner, and the zombies who
   * hear a door.
   */
  eyesOf?: EntityType,
): boolean {
  const minX = Math.min(x1, x2);
  const maxX = Math.max(x1, x2);
  const minY = Math.min(y1, y2);
  const maxY = Math.max(y1, y2);

  // Three questions, not three collections — see `some`. This is the hottest
  // predicate in the server: every viewer's fog and every perception tick runs
  // it, and the sight line's bounding box collects well over a hundred walls.
  if (world.wallGrid.some(minX, minY, maxX, maxY, (wall) => segmentRectT(x1, y1, x2, y2, wall) !== null)) {
    return false;
  }

  // A shut door is opaque, unlike the glass beside it.
  const blockedByDoor = world.doorGrid.some(minX, minY, maxX, maxY, (index) => {
    const door = world.doors[index];
    return !!door && !door.open && !door.broken && segmentRectT(x1, y1, x2, y2, door.rect) !== null;
  });
  if (blockedByDoor) return false;

  if (!seeThroughBushes) {
    const blockedByBush = world.bushGrid.some(
      minX,
      minY,
      maxX,
      maxY,
      // The bush you're standing in doesn't block your own view out of it —
      // others still can't see in, which is what makes hiding work.
      (bush) =>
        Math.hypot(bush.x - x1, bush.y - y1) > bush.r &&
        segmentCircleT(x1, y1, x2, y2, bush.x, bush.y, bush.r) !== null,
    );
    if (blockedByBush) return false;
  }

  /**
   * The dog's acid, which is a thicket that also slows you and expires.
   *
   * **It deliberately breaks the bush's standing-in-it rule.** A bush you are
   * inside does not blind you — you see out, others cannot see in, and that is
   * what makes hiding work. A cloud of acid is the opposite of hiding: you are
   * in the middle of the stuff, your eyes are streaming, and there is nothing
   * to see in any direction. So a viewer inside one fails every sight line they
   * ask about, which is zero vision — no entities, no loot and no tracers sent,
   * and nothing perceived by an NPC standing in it either.
   *
   * **What makes that an ability rather than a liability is `eyesOf`.** Zombies
   * are exempt outright, and the dog is a zombie: it sees in its own cloud and
   * out through everybody else's, which is the whole point of spitting one.
   *
   * Unlike bushes it is not exempted by `seeThroughBushes`. That flag means "an
   * officer is trained and looking for this, so foliage does not hide it", and
   * training is not a defence against a chemical.
   *
   * Not in a grid, and guarded on `size` for the same reasons as `speedAt`:
   * single-figure counts, and this is the hottest predicate the server has. The
   * lobe walk past that guard is seven circles a cloud, written once a tick by
   * `updateAcid` so nothing here allocates or evaluates a growth curve.
   */
  if (world.acid.size > 0 && eyesOf !== undefined && eyesOf !== 'zombie') {
    for (const c of world.acid.values()) {
      // The bounding radius first: one hypot rejects a cloud across the city
      // before any of its lobes are looked at.
      if (Math.hypot(c.x - x1, c.y - y1) > c.r + Math.hypot(x2 - x1, y2 - y1)) continue;
      for (const l of c.lobes) {
        if (Math.hypot(l.x - x1, l.y - y1) <= l.r) return false;
        if (segmentCircleT(x1, y1, x2, y2, l.x, l.y, l.r) !== null) return false;
      }
    }
  }

  return true;
}

/**
 * Walls and intact glass — bushes are walkable, so they shouldn't veto a
 * route. Panes count: they're see-through but you still can't walk through
 * one, and treating them as open steered people face-first into them.
 */
/**
 * Can a body walk from here to there in a straight line?
 *
 * `avoidSoft` adds the sandbag walls, and it is off by default because most
 * callers are not asking about walking at all — a tentacle reaching over a wall
 * of sandbags is not stopped by one. Only `headingToward` passes it, and only
 * for something alive: see the note there.
 */
export function hasWallClearPath(
  world: World,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  avoidSoft = false,
): boolean {
  /*
   * **The nav grid alone would change nothing**, which is the lesson the parked
   * vehicle already paid for and this is the second thing to lean on it.
   * `headingToward` only asks the router when this function says the straight
   * line is blocked — so a wall that is in the grid and not in here is a wall
   * every route is planned around and nobody ever asks for a route past.
   * Measured on the vehicle: 5 of 8 officers still failed to get by.
   */
  // Guarded on `size`, the way `speedAt` and `hasLineOfSight` guard on
  // `world.acid.size`: this runs once per walking body per tick, and the
  // ordinary case is a city with no sandbags anywhere in it. `Map.values()`
  // allocates an iterator whether or not there is anything to iterate, and two
  // of those five hundred times a tick is not nothing.
  if (avoidSoft && world.barricades.size > 0) {
    for (const wall of world.barricades.values()) {
      if (segmentHitsBox(x1, y1, x2, y2, wall.box)) return false;
    }
  }
  if (avoidSoft && world.emplacements.size > 0) {
    for (const gun of world.emplacements.values()) {
      if (gun.bags && segmentHitsBox(x1, y1, x2, y2, gun.bags)) return false;
      // The crew too — see `gunnerBox`. In the grid and not in here is a wall
      // every route is planned around and nobody ever asks for a route past,
      // which is the lesson the parked vehicle and the bags have each paid for.
      if (segmentHitsBox(x1, y1, x2, y2, gunnerBox(gun))) return false;
    }
  }

  // Cheapest and almost always empty, so it goes first. A parked vehicle is
  // not a wall — it must not block sight or gunfire — but it is very much in
  // the way of a straight walk, and this is the only caller that asks about
  // walking. Without it `headingToward` takes its shortcut straight through a
  // van and never asks the router, so putting one in the nav grid changes
  // nothing at all: measured, **5 of 8** officers still failed to get past.
  for (const box of world.navBlockers) {
    if (segmentHitsBox(x1, y1, x2, y2, box)) return false;
  }

  const minX = Math.min(x1, x2);
  const maxX = Math.max(x1, x2);
  const minY = Math.min(y1, y2);
  const maxY = Math.max(y1, y2);

  // Asked as three questions rather than three collections — see `some`.
  if (world.wallGrid.some(minX, minY, maxX, maxY, (wall) => segmentRectT(x1, y1, x2, y2, wall) !== null)) {
    return false;
  }

  const blockedByPane = world.windowGrid.some(
    minX,
    minY,
    maxX,
    maxY,
    (index) =>
      isWindowIntact(world, index) && segmentRectT(x1, y1, x2, y2, world.map.windows[index]) !== null,
  );
  if (blockedByPane) return false;

  const blockedByDoor = world.doorGrid.some(minX, minY, maxX, maxY, (index) => {
    const door = world.doors[index];
    return !!door && !door.open && !door.broken && segmentRectT(x1, y1, x2, y2, door.rect) !== null;
  });
  return !blockedByDoor;
}

export function isInBush(world: World, x: number, y: number): boolean {
  const bushes = world.bushGrid.queryCircle(x, y, 1, new Set<Bush>());
  for (const bush of bushes) {
    if (Math.hypot(bush.x - x, bush.y - y) <= bush.r) return true;
  }
  return false;
}

/**
 * What this spot does to the pace of whoever is standing on it.
 *
 * **The one function every mover in the game goes through** — civilians and
 * zombies through `ai.ts`, the dog through `moveDog`, and a player through
 * `updatePlayers` — which is exactly why the acid's slow is here rather than as
 * a sweep over bodies in `updateAcid`. Written as a sweep it would be a second
 * place that knows what a cloud is, and the first new kind of mover added
 * afterwards would silently walk through the stuff at full speed.
 *
 * `type` is optional so the ground effects that apply to *everything* still
 * work for a caller that has only a position. Anything that can be exempt has
 * to say what it is.
 */
export function speedAt(
  world: World,
  x: number,
  y: number,
  base: number,
  type?: EntityType,
): number {
  let speed = isInBush(world, x, y) ? base * BUSH_SPEED_MULTIPLIER : base;
  // Guarded on `size` so the ordinary case — no acid anywhere in the city —
  // is one integer compare in a function called for every body every tick.
  // Past the guard it is a walk of single figures: clouds are rare and
  // short-lived, so a broadphase for them would cost more to keep than to skip.
  //
  // **Zombies are exempt, and the dog is a zombie.** It comes out of one of
  // them, and an ability that slows your own horde and yourself is one nobody
  // spends a cooldown on.
  if (world.acid.size > 0 && type !== 'zombie') {
    for (const c of world.acid.values()) {
      // Bounding radius first, then the lobes — a cloud is a cluster of circles
      // rather than a disc, so the notches between its lumps are ground you can
      // walk at full pace. See `shared/acidshape.ts`.
      if (Math.hypot(x - c.x, y - c.y) > c.r) continue;
      if (!inAcidLobes(c.lobes, x, y)) continue;
      speed *= ACID_SLOW_MUL;
      break;
    }
  }
  return speed;
}

/**
 * The acid cloud this point is inside, or null.
 *
 * The same two-stage test `speedAt` and `hasLineOfSight` both do — bounding
 * radius, then the lobes, because a cloud is a cluster of circles and the
 * notches between its lumps are ordinary ground. Handed back as the *cloud*
 * rather than a boolean because the one thing anybody standing in one wants to
 * know is which way is out, and that is a bearing off its centre.
 *
 * Guarded on the map being empty, so the ordinary case — no acid anywhere in
 * the city — is one integer compare.
 */
export function acidCloudAt(world: World, x: number, y: number): AcidCloud | null {
  if (world.acid.size === 0) return null;
  for (const c of world.acid.values()) {
    if (Math.hypot(x - c.x, y - c.y) > c.r) continue;
    if (inAcidLobes(c.lobes, x, y)) return c;
  }
  return null;
}

/** Rejection-sample a point that clears existing entities and walls. */
/** Is this spot inside the station's cell — the one room nobody walks into? */
export function inTheCell(world: World, x: number, y: number): boolean {
  const cell = world.map.policeStation?.cell;
  if (!cell) return false;
  return x > cell.x && x < cell.x + cell.w && y > cell.y && y < cell.y + cell.h;
}

/**
 * **A sixth of the map laid over the breach: the ground bot officers do not
 * start on.**
 *
 * Asked for outright, and the reason is the round rather than the geometry. A
 * bot dropped a few hundred pixels from where the outbreak walks in is in a
 * fight before it has taken a step — no loot, no ground, and four officers are
 * most of what holds an outbreak down (see **Fighting is how a bot survives**).
 * It is also simply not a place a player would choose to be standing when the
 * round starts.
 *
 * The half-extents come off `OUTBREAK_KEEP_OUT_COLS`/`ROWS` and are computed
 * here rather than written down, because `WORLD_WIDTH` and `WORLD_HEIGHT` move
 * with the population slider — so this is a sixth of *this* city, not of the
 * one the process launched with.
 *
 * **Centred on `world.outbreakOrigin`, so it means nothing until that is
 * set.** Its default is the middle of the map, which as a keep-out is the
 * worst possible answer; `populate` places the outbreak before the bots for
 * exactly that reason and nothing else calls this.
 */
export function outbreakKeepOut(world: World): { x: number; y: number; w: number; h: number } {
  const w = WORLD_WIDTH / OUTBREAK_KEEP_OUT_COLS;
  const h = WORLD_HEIGHT / OUTBREAK_KEEP_OUT_ROWS;
  const o = world.outbreakOrigin;
  return { x: o.x - w / 2, y: o.y - h / 2, w, h };
}

/** The same question of one point. */
export function inOutbreakKeepOut(world: World, x: number, y: number): boolean {
  const box = outbreakKeepOut(world);
  return x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h;
}

export function findSpawn(
  world: World,
  radius: number,
  bounds?: { x: number; y: number; w: number; h: number },
  /**
   * **Nobody is placed in the locked cell unless they are being locked in it.**
   *
   * `isReachable` waves the cell through — doors are not in the nav grid, so
   * routes are planned as though every one of them were open and the cell's
   * floor is ordinary floor as far as that test is concerned. But it is not a
   * room you can walk into, it is a room somebody put you in, and every path
   * that places a body goes through here: the indoor draw, the general
   * population, a social circle, and `spawnPlayer`. Measured with only the
   * indoor draw excluded, a stray still turned up in there on **5 cities in 30**
   * — and a player who spawns in it is stuck there for the round with nothing
   * on screen to say why.
   *
   * Opt-in rather than opt-out, in the shape `findSpawnNear`'s `outdoors` flag
   * already uses: the one caller that means the cell says so.
   */
  intoTheCell = false,
  /**
   * Keep clear of where the outbreak walked in — see `outbreakKeepOut`. Opt-in
   * like `intoTheCell` above, and asked *inside* the sampling loop rather than
   * by retrying the whole call, because that is where every other reason to
   * reject a spot already lives and because the last-resort return below would
   * otherwise hand back an unchecked point.
   */
  awayFromOutbreak = false,
): { x: number; y: number } {
  const keepOut = awayFromOutbreak && !botsIgnoreOutbreakKeepOut ? outbreakKeepOut(world) : null;
  const outsideKeepOut = (x: number, y: number): boolean =>
    !keepOut || x < keepOut.x || x > keepOut.x + keepOut.w || y < keepOut.y || y > keepOut.y + keepOut.h;

  for (let attempt = 0; attempt < 60; attempt++) {
    const x = bounds
      ? bounds.x + radius + Math.random() * Math.max(1, bounds.w - radius * 2)
      : radius + Math.random() * (WORLD_WIDTH - radius * 2);
    const y = bounds
      ? bounds.y + radius + Math.random() * Math.max(1, bounds.h - radius * 2)
      : radius + Math.random() * (WORLD_HEIGHT - radius * 2);

    // Never drop anyone into a room they could never have walked into.
    if (!world.nav.isReachable(x, y)) continue;
    if (!intoTheCell && inTheCell(world, x, y)) continue;
    if (!outsideKeepOut(x, y)) continue;

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
  /*
   * Sixty tries found nowhere that cleared everything. The fallback is a raw
   * draw, and it has to keep the one rule the caller actually asked for or the
   * feature has a hole in it that fires precisely when the map is crowded.
   * Five-sixths of the city is outside the box, so this lands first go almost
   * always; twenty is generous and the last resort is still a spawn, because a
   * round that will not start is worse than a bot in a bad street.
   */
  for (let attempt = 0; attempt < 20; attempt++) {
    const x = radius + Math.random() * (WORLD_WIDTH - radius * 2);
    const y = radius + Math.random() * (WORLD_HEIGHT - radius * 2);
    if (outsideKeepOut(x, y)) return { x, y };
  }
  return {
    x: radius + Math.random() * (WORLD_WIDTH - radius * 2),
    y: radius + Math.random() * (WORLD_HEIGHT - radius * 2),
  };
}

/**
 * Harness gate: leave the police station empty of people.
 *
 * The control for "a couple of civilians spawn in here as staff". Ordinary
 * indoor spawns land in the station like any other building — it is a building
 * — so a count of who is standing in it is a *superset* and says nothing on its
 * own. What the difference between the two says something about is the two or
 * three who were put there on purpose. See `server/policestation.ts`.
 */
/**
 * Harness gate: leave the cell empty.
 *
 * The control for "nought to three civilians in the jail cell", and it is the
 * whole value of that row for exactly the same reason the staff one is: the
 * cell is part of a building, the ordinary indoor draw samples the building's
 * footprint rows, and it lands people in there whether or not anybody put them
 * there on purpose. A count of who is standing in the cell is a superset. What
 * the difference says something about is the ones who were locked in.
 */
let stationCellOff = false;
export function setStationCellEmpty(v: boolean): void {
  stationCellOff = v;
}

/**
 * True is the spawn as it was: a bot officer dropped anywhere on the map, the
 * ground the outbreak walks in on included.
 *
 * Kept rather than deleted with the measurement, like `setSpawnsIgnoreBuildings`
 * and for the same reason — the new figure is a zero, and a zero is also what a
 * rig that sampled nothing reports. `server/botspawn.ts` reads it.
 */
let botsIgnoreOutbreakKeepOut = false;
export function setBotsIgnoreOutbreakKeepOut(v: boolean): void {
  botsIgnoreOutbreakKeepOut = v;
}

let stationStaffOff = false;
export function setStationHasNoStaff(v: boolean): void {
  stationStaffOff = v;
}

export function createWorld(): World {
  const map = generateMap();
  const nav = new NavGrid(map);
  const world: World = {
    map,
    nav,
    danger: new DangerField(map, nav),
    nextDangerRebuild: 0,
    rooms: new RoomMap(map),
    rumour: new RumourField(map),
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
    grappleImmune: new Map(),
    pendingInfections: new Map(),
    grappleCounts: new Map(),
    speedBoosts: new Map(),
    lastShotAt: new Map(),
    deployStart: new Map(),
    stowing: new Map(),
    rightHeld: new Map(),
    rightSpent: new Set(),
    deployWanted: new Set(),
    bashReadyAt: new Map(),
    bashUntil: new Map(),
    aimHeading: new Map(),
    chargeSince: new Map(),
    stamina: new Map(),
    exhausted: new Set(),
    shots: [],
    deaths: [],
    entityGrid: new SpatialGrid<Entity>(ENTITY_CELL, WORLD_WIDTH, WORLD_HEIGHT),
    zombieGrid: new SpatialGrid<Entity>(ENTITY_CELL, WORLD_WIDTH, WORLD_HEIGHT),
    wallGrid: new SpatialGrid<Wall>(STATIC_CELL, WORLD_WIDTH, WORLD_HEIGHT),
    bushGrid: new SpatialGrid<Bush>(STATIC_CELL, WORLD_WIDTH, WORLD_HEIGHT),
    windowGrid: new SpatialGrid<number>(STATIC_CELL, WORLD_WIDTH, WORLD_HEIGHT),
    windowHealth: [],
    brokenWindows: [],
    materializeUntil: new Map(),
    speech: new Map(),
    rallyCharges: new Map(),
    ralliedInto: new Map(),
    followCharges: new Map(),
    followers: new Set(),
    pickups: new Map(),
    inventories: new Map(),
    grenades: new Map(),
    smokes: new Map(),
    acid: new Map(),
    spits: new Map(),
    blinded: new Map(),
    blasts: [],
    ducks: [],
    helicopters: new Map(),
    soldiers: new Set(),
    swat: new Set(),
    riflemen: new Set(),
    squadLeads: new Set(),
    dispatched: new Set(),
    bots: new Set(),
    cityOfficers: new Set(),
    dogs: new Set(),
    dogState: new Map(),
    dogsOut: new Set(),
    corpses: [],
    dogDeaths: new Map(),
    dogBirths: new Map(),
    dogConversions: new Map(),
    dogTurned: new Map(),
    dogCooldowns: new Map(),
    totalConverted: 0,
    pendingBursts: [],
    tentacles: new Map(),
    lashes: [],
    knockbacks: new Map(),
    dogContacts: [],
    nextDogContactScan: 0,
    infectedByDog: new Map(),
    botOfficerCount: BOT_OFFICER_COUNT,
    offline: true,
    dogAbilitiesFree: false,
    towers: [],
    beacon: null,
    mines: new Map(),
    zaps: [],
    stunned: new Map(),
    vehicles: new Map(),
    navBlockers: [],
    radioReplies: [],
    nextRadioScan: 0,
    emplacements: new Map(),
    barricades: new Map(),
    targetClaims: new Map(),
    fires: [],
    pendingFires: [],
    burning: new Map(),
    paused: false,
    names: new Map(),
    pathBudget: PATH_NODE_BUDGET_PER_TICK,
    gameOver: false,
    victory: false,
    outbreakOrigin: { x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2 },
    outbreakSide: 0,
  };
  buildStaticGrids(world);
  initDoors(world);
  initDucks(world);
  populate(world);
  spawnPickups(world);
  return world;
}

/** Fresh map, fresh crowd; connected players are respawned as officers. */
export function resetWorld(world: World): void {
  world.map = generateMap();
  resizeGrids(world);
  world.nav = new NavGrid(world.map);
  world.danger = new DangerField(world.map, world.nav);
  // Rooms come from walls and doorways, so a fresh city needs a fresh map of
  // them — but nothing short of a fresh city does. `rebuildNav` leaves it be.
  world.rooms = new RoomMap(world.map);
  world.rumour = new RumourField(world.map);
  world.nextDangerRebuild = 0;
  world.navDirty = false;
  // A fresh round is fresh news again — the first-sighting chatter is gated
  // on how long this round has been running, not on process uptime.
  world.startedAt = Date.now();
  buildStaticGrids(world);
  initDoors(world);
  initDucks(world);
  world.doorPrompts.clear();
  world.doorHolds.clear();
  world.doorSpent.clear();
  // These hold indices into the *old* map's door list. Left alone, they point
  // at whatever door happens to share that index in the new city.
  world.lockRequests.clear();
  world.doorClearing.clear();
  // Nobody is following anyone into a fresh round, and a stale flag would
  // leave the wheel offering to release people who no longer exist.
  world.followers.clear();
  world.blasts.length = 0;

  world.entities.clear();
  world.ai.clear();
  world.materializeUntil.clear();
  world.speech.clear();
  world.grenades.clear();
  world.smokes.clear();
  world.acid.clear();
  world.spits.clear();
  world.blinded.clear();
  world.helicopters.clear();
  world.soldiers.clear();
  world.swat.clear();
  world.riflemen.clear();
  world.squadLeads.clear();
  world.dispatched.clear();
  world.bots.clear();
  world.cityOfficers.clear();
  world.grapples.clear();
  world.grappleImmune.clear();
  world.pendingInfections.clear();
  world.infectedByDog.clear();
  // Which *seat* somebody took outlives a restart; what they did with it does
  // not. A fresh city has bitten nobody.
  world.dogConversions.clear();
  world.dogTurned.clear();
  world.dogCooldowns.clear();
  // A testing switch is still a thing about *this* round. The client re-sends
  // it on `start`, so a restart with it on keeps it and one without loses it.
  world.dogAbilitiesFree = false;
  // A fresh city, a fresh outbreak — nobody has turned anybody yet.
  world.totalConverted = 0;
  world.pendingBursts.length = 0;
  world.tentacles.clear();
  world.lashes.length = 0;
  world.knockbacks.clear();
  // Nor has anybody killed a dog in it yet.
  //
  // **"Permanent" means permanent for the round.** A corpse is the lasting mark
  // the officers get for having put the animal down, and it is deliberately
  // never trimmed *within* a round — but the coordinates it holds mean something
  // only on the map it was made on, and `resetWorld` is about to generate a
  // different one. Left here they are bodies lying in a street that no longer
  // exists.
  //
  // It is the one piece of dog state neither path caught: the rest —
  // `dogsOut`, `dogDeaths`, `dogState`, `dogBirths` — is dropped per id by
  // `spawnDog`, which only runs for a seat somebody is actually in, and this is
  // a plain array on the world that no seat owns.
  world.corpses.length = 0;
  world.dogContacts.length = 0;
  world.nextDogContactScan = 0;
  world.grappleCounts.clear();
  world.speedBoosts.clear();
  world.lastShotAt.clear();
  world.deployStart.clear();
  world.stowing.clear();
  world.rightHeld.clear();
  world.rightSpent.clear();
  world.deployWanted.clear();
  world.bashReadyAt.clear();
  world.bashUntil.clear();
  world.vehicles.clear();
  world.navBlockers.length = 0;
  world.towers.length = 0;
  world.beacon = null;
  world.mines.clear();
  world.zaps.length = 0;
  world.stunned.clear();
  world.radioReplies.length = 0;
  world.nextRadioScan = 0;
  world.aimHeading.clear();
  world.chargeSince.clear();
  world.shots.length = 0;
  world.deaths.length = 0;
  world.spectators.clear();
  world.gameOver = false;
  world.victory = false;
  world.paused = false;
  world.emplacements.clear();
  // A wall is a coordinate, and a coordinate means nothing on a fresh map —
  // exactly the trap `world.corpses` fell into.
  world.barricades.clear();
  world.targetClaims.clear();
  // Keyed by building index, which means nothing on a map that no longer has
  // that building in it — the same trap `world.corpses` fell into with its
  // coordinates. It would expire on its own within the walk-in budget, but
  // until it did it would hold some unrelated house's doors open.
  world.ralliedInto.clear();
  world.fires.length = 0;
  world.pendingFires.length = 0;
  world.burning.clear();

  populate(world);
  spawnPickups(world);

  // Player one gets the designated start point; everyone else spawns at random.
  // Which *seat* somebody took decides what they come back as — `world.dogs` is
  // keyed by connection and deliberately outlives a restart, unlike everything
  // else cleared above.
  let first = true;
  for (const id of world.playerIds) {
    if (world.dogs.has(id)) {
      spawnDog(world, id);
      continue;
    }
    world.dogState.delete(id);
    const start = playerOneStart(world);
    const spawn = first
      ? findSpawnNear(world, start.x, start.y, ENTITY_RADIUS.officer)
      : findSpawn(world, ENTITY_RADIUS.officer);
    first = false;
    world.entities.set(id, makeEntity(id, 'officer', spawn.x, spawn.y));
    world.stamina.set(id, STAMINA_MAX);
    world.exhausted.delete(id);
    world.rallyCharges.set(id, RALLY_STARTING_CHARGES);
    world.followCharges.set(id, FOLLOW_STARTING_CHARGES);
    world.inventories.set(id, newInventory());
    giveStartingItem(world, id, spawn.x, spawn.y);
    // A restart is a spawn: the heap comes with them to the new city. After
    // `spawnPickups` above, which clears the table.
    dropDebugKit(world, id, spawn.x, spawn.y);
  }
}

/** Let go of everything: whoever had hold of this id, and whoever it had. */
function releaseGrapples(world: World, id: string): void {
  world.grapples.delete(id);
  for (const [targetId, session] of world.grapples) {
    session.zombieIds.delete(id);
    if (session.zombieIds.size === 0) world.grapples.delete(targetId);
  }
}

/** Take a body out of the world, and everything keyed to it with it. */
function removeEntity(world: World, id: string): void {
  world.entities.delete(id);
  world.ai.delete(id);
  // Shot, burned or blown up before it took. Whoever bit them gets nothing —
  // the tally counts bodies that stood up again, and this one never did.
  world.infectedByDog.delete(id);
  world.burning.delete(id);
  world.stunned.delete(id);
  world.materializeUntil.delete(id);
  releaseGrapples(world, id);
}

/** A dog part-way out of a shambler. See `World.dogBirths`. */
export interface DogBirth {
  /** The body it is coming out of. An ordinary zombie until it bursts. */
  hostId: string;
  /** When the convulsing began, so `DOG_BIRTH_MS` can be measured off it. */
  at: number;
}

/**
 * Pick the shambler this dog will come out of, and get in position to be
 * watched doing it.
 *
 * The dog comes back **out of the horde**: a shambler somewhere on the map
 * stops being a shambler and stands up as the dog. That is the whole of its
 * lives system — the outbreak is its health bar, and every zombie the officers
 * put down is one fewer body it can come back in. Never out of another dog, and
 * never out of itself.
 *
 * **The dog's body is moved onto the host here, a whole birth window before it
 * is needed, and that is what aims the camera.** There is no camera override
 * anywhere on the client: it follows the entity you are driving, so putting
 * that entity on the host's back is the entire mechanism. It costs nothing on
 * screen because the body is still `dead` and the entity loop skips those — the
 * corpse it left behind is a separate record and stays where it fell.
 *
 * It also means the host is at zero distance from the viewer, so the fog sends
 * it without a word said about birth anywhere in `visibleTo`.
 */
export function beginDogBirth(world: World, dog: Entity, now: number): boolean {
  const outside: Entity[] = [];
  const inside: Entity[] = [];
  for (const e of world.entities.values()) {
    if (e.type !== 'zombie' || e.id === dog.id || world.dogs.has(e.id)) continue;
    // Somebody else's birth is not a body to be born out of. Two dogs in a
    // lobby cannot come out of the same shambler.
    if (isBirthHost(world, e.id)) continue;
    (buildingIndexAt(world, e.x, e.y) < 0 ? outside : inside).push(e);
  }

  /*
   * **A dog comes up out in the street where it can.**
   *
   * Two reasons, and the second is the one that bites. A dog is not a thing
   * that was standing in the city — it comes in at the breach, and rising in
   * the middle of somebody's front room is the same wrong note as spawning
   * there. And the shamblers most likely to be *indoors* are the ones pressed
   * against a shut door: a body that rises with its centre inside the slab
   * collapses its own visibility polygon and blacks the screen out, which is
   * the fault this file already records under **Known open issue**.
   *
   * A preference and not a rule. With the whole horde indoors the alternative
   * is refusing the birth, and that costs the player the round rather than a
   * bad camera angle — so an indoor host is still far better than none.
   */
  const hosts = outside.length > 0 && !spawnsIgnoreBuildings ? outside : [...outside, ...inside];
  if (hosts.length === 0) return false;

  const host = hosts[Math.floor(Math.random() * hosts.length)];
  // The dog entity is *moved* rather than rebuilt, so nothing keyed to its id
  // anywhere else has to be rebuilt with it.
  dog.x = host.x;
  dog.y = host.y;
  world.dogBirths.set(dog.id, { hostId: host.id, at: now });
  return true;
}

/**
 * The host bursts and the animal is standing there.
 *
 * Nothing about *this* is new — it is the second half of what used to happen in
 * one instant, and every line of it was already here. What is new is that the
 * fifteen hundred milliseconds before it were spent looking at the body it
 * came out of.
 */
export function finishDogBirth(world: World, dog: Entity, birth: DogBirth, now: number): void {
  const host = world.entities.get(birth.hostId);
  if (host) {
    // Come out where the body actually ended up. It is frozen for the birth so
    // this is almost always where it started, but a shove from a passing crowd
    // is a shove, and a dog rising a body's width from the thing that burst
    // would be the one frame of this anybody noticed.
    dog.x = host.x;
    dog.y = host.y;
    removeEntity(world, birth.hostId);
  }
  dog.health = dog.maxHealth;

  world.dogState.delete(dog.id);
  world.stamina.set(dog.id, STAMINA_MAX);
  world.exhausted.delete(dog.id);
  // It fades in where the shambler was, so the swap is something you can watch
  // happen rather than a body silently teleporting.
  world.materializeUntil.set(dog.id, now + MATERIALIZE_MS);
}

/**
 * Is this body somebody's birth host?
 *
 * Guarded on `size` because it is asked once per entity per viewer in `toWire`,
 * where a map that is empty for all but a second and a half of the round should
 * cost a single integer compare. Past the guard it is a walk of at most two
 * entries — there are two seats on team 2 and a dog can only be born once at a
 * time — which is why this is keyed by dog id rather than carrying a second map
 * keyed the other way round to keep in step with it.
 */
export function isBirthHost(world: World, id: string): boolean {
  if (world.dogBirths.size === 0) return false;
  for (const birth of world.dogBirths.values()) {
    if (birth.hostId === id) return true;
  }
  return false;
}

/**
 * How far through its convulsion a birth host is, 0 to 1, or -1 for a body that
 * is not one. What the client draws the shaking and the twisting off.
 */
export function birthProgress(world: World, id: string, now: number): number {
  if (world.dogBirths.size === 0) return -1;
  for (const birth of world.dogBirths.values()) {
    if (birth.hostId === id) return clamp((now - birth.at) / DOG_BIRTH_MS, 0, 1);
  }
  return -1;
}

/**
 * How much of the transformation is showing: 0 to 1 across the wind-up, then
 * held at 1 for the whole of the form it produces.
 *
 * **Here rather than in `dog.ts`, beside `birthProgress` and for the same
 * reason.** `toWire` needs it, and `dog.ts` already imports this file at
 * runtime — putting it there and importing it back would make that a genuine
 * cycle rather than the one-way edge it is now. Both files can read a
 * `DogState`; only one of them may load the other.
 *
 * One reading rather than a ramp and a flag, so nothing can end up with a ramp
 * saying 1 and a boolean saying false about the same body.
 */
export function morphAmount(dog: DogState | undefined, now: number): number {
  if (!dog) return 0;
  if (dog.morphStartedAt > 0) {
    return clamp((now - dog.morphStartedAt) / DOG_MORPH_WINDUP_MS, 0, 1);
  }
  return dog.morphedUntil > now ? 1 : 0;
}

/** Out in the world as the transformed thing, as against still tearing open. */
export function isMorphed(dog: DogState | undefined, now: number): boolean {
  return dog !== undefined && dog.morphedUntil > now;
}

/**
 * One body dying, wherever it died.
 *
 * Bullets, fire and blasts each used to write their own version of this, which
 * is exactly how a grenade came to delete a *player's dog* outright — `heli.ts`
 * removed any zombie it dropped, and a dog is a zombie. Anything that can take
 * an entity's health to zero calls this instead.
 *
 * `angle` is the direction the killing blow came *from* travelling — i.e. which
 * way to shove a ragdolling body. Only a zombie death records one (for the
 * client's corpse); everything else ignores it. Defaults to the body's facing.
 */
/**
 * True is the world as it was: a body already taken out could be killed again,
 * and every pellet after the fatal one pushed another corpse.
 *
 * Kept rather than deleted with the measurement, like `setSettledStandsStill`:
 * "one death, one corpse" means nothing without "and it was seven".
 * `server/deathcheck.ts` reads it.
 */
let killsCanRepeat = false;

export function setKillsCanRepeat(v: boolean): void {
  killsCanRepeat = v;
}

/** Whether a body is still in the world, for anything that may hit it twice. */
export function stillAlive(world: World, id: string): boolean {
  return killsCanRepeat || world.entities.has(id);
}

export function killEntity(world: World, e: Entity, now: number, angle?: number): void {
  /*
   * **A body can only die once, and a shotgun is what proves it could die
   * eight times.**
   *
   * `world.entityGrid` is rebuilt once a tick, and `removeEntity` takes a body
   * out of `world.entities` without touching it — so every pellet after the one
   * that killed still found the corpse in the broadphase, spent its damage on
   * it, and came back here. Measured: **7 death records for one zombie** off a
   * single eight-pellet shell, which the client turns into seven corpses
   * stacked on the same pixel. Reported as a shotgun producing two.
   *
   * The guard is the *entity list*, not a flag: it is the same question every
   * caller is really asking — is this body still in the world — and it covers
   * the blast, the fire and the lash without any of them learning about it. The
   * two paths that keep an entity in the world after death, the player and the
   * dog, are guarded below by their own state and are unaffected.
   */
  if (!stillAlive(world, e.id)) return;

  if (world.dogs.has(e.id)) {
    const dog = world.dogState.get(e.id);
    // Already down and waiting to rise. Rounds keep landing on the body — the
    // entity is still here, which is the point — and none of them kill it twice.
    if (world.dogDeaths.has(e.id)) return;

    /**
     * **Shot mid-roar: the roar dies with it.**
     *
     * `updateDogs` bails out before `dogTick` for a dog that is down, so
     * nothing was left to notice the two seconds running out — the clock stayed
     * set, the hexagon reported it running for the rest of the round, and the
     * `roaring` flag stayed on the wire. Worse, had the animal risen with its
     * state intact it would have unleashed the roar on the first tick back, at
     * a spot the player picked before they were killed and half a map from
     * where they now stand.
     *
     * Found by driving a real dog over a socket rather than headlessly: the
     * garrison shot it while it was standing still, which is precisely what
     * standing still for two seconds is for.
     */
    if (dog) dog.roarStartedAt = 0;

    /**
     * **And a strike still coming dies with it, for the same reason.**
     *
     * A tentacle strike is 340ms of coiling before it goes out, and that windup
     * is the whole of what the officers are given to answer it — so a strike
     * that landed out of an animal that was shot during its own tell would be
     * the tell doing nothing. It is also what the red ring on the ground is
     * promising: that there is something behind it still able to throw.
     *
     * Filtered rather than flagged, so nothing downstream has to learn that a
     * strike can be orphaned — `updateLashes` only ever sees live ones, and
     * `lashesToWire` only ever sends live ones.
     */
    world.lashes = world.lashes.filter((l) => l.dogId !== e.id);

    /**
     * **A dog that was transformed bursts, whether the twenty seconds ran out
     * or a rifle did it first.**
     *
     * One ending rather than two. The alternative — the timer bursts it and
     * gunfire merely kills it — makes shooting the thing the anticlimax, and
     * leaves the transformed form with a second way to end that has to be
     * written, drawn and remembered. This way `dogTick` simply calls
     * `killEntity` when the clock runs out and there is exactly one place that
     * knows what a burst is.
     *
     * Queued rather than done here: `killEntity` lives in `world.ts`, and the
     * cloud belongs to `acid.ts` and the tentacles to `dog.ts`, neither of
     * which this file may load. See `World.pendingBursts`.
     */
    if (dog && dog.morphedUntil > 0) {
      world.pendingBursts.push({ x: e.x, y: e.y, facing: e.facing });
    }
    // The size and the health go back with the body. `DogState` is deleted on
    // the way up, so the flags clear themselves — `maxHealth` does not, and a
    // dog reborn with six times its health would keep the whole ability.
    if (dog) {
      dog.morphStartedAt = 0;
      dog.morphedUntil = 0;
    }
    e.maxHealth = DOG_MAX_HEALTH;
    e.radius = DOG_RADIUS;

    // It goes down **where it stands and stays there to be looked at**. The
    // body it leaves is permanent; whether it gets back up at all is settled
    // when the clock runs out, in `updateDogs`, because the horde it needs to
    // rise out of can change in the meantime.
    world.corpses.push({
      x: Math.round(e.x),
      y: Math.round(e.y),
      facing: Math.round(e.facing * 100) / 100,
      head: Math.round((dog ? dog.head : e.facing) * 100) / 100,
    });
    releaseGrapples(world, e.id);
    e.health = 0;
    world.dogDeaths.set(e.id, now);
    if (dog) {
      dog.victimId = null;
      dog.jawsOpenedAt = 0;
    }
    return;
  }

  if (world.playerIds.has(e.id)) {
    // Infection is permanent — a downed officer comes back in the middle of
    // town rather than leaving the round.
    e.health = e.maxHealth;
    e.x = world.map.width / 2;
    e.y = world.map.height / 2;
    releaseGrapples(world, e.id);
    return;
  }

  // A shot zombie leaves a corpse: the client ragdolls it a short way along the
  // round, greys it, and — with the setting on — keeps it for the round. One
  // transient record, exactly like a shot; the dog path above never reaches
  // here, so this is shamblers and turned officers-gone-zombie only.
  if (e.type === 'zombie') {
    world.deaths.push({
      id: e.id,
      x: Math.round(e.x),
      y: Math.round(e.y),
      a: Math.round((angle ?? e.facing) * 100) / 100,
    });
  }

  removeEntity(world, e.id);
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
  /*
   * **The station has staff**, and they come out of the civilian count rather
   * than on top of it: the slider promises a number of civilians and a desk
   * clerk is one. They are spawned before the general indoor draw so they get
   * their spots, and given `homeBuilding`, which is the existing trait for
   * somebody who lives somewhere and will not idly wander out of it.
   */
  const station = world.map.policeStation;
  if (station && !stationStaffOff) {
    const staff =
      POLICE_STATION_STAFF_MIN +
      Math.floor(Math.random() * (POLICE_STATION_STAFF_MAX - POLICE_STATION_STAFF_MIN + 1));
    // The lobby for the clerk, the office for the rest.
    for (let i = 0; i < staff && placed < HUMAN_COUNT; i++) {
      const room = i === 0 ? station.lobby : station.office;
      const spawn = findSpawn(world, ENTITY_RADIUS.human, room);
      const id = addHuman(placed, spawn.x, spawn.y);
      world.ai.get(id)!.homeBuilding = station.building;
      placed++;
    }
  }

  /*
   * **And nought to three locked in the cell.**
   *
   * Out of the civilian count like the staff, and for the same reason. `MIN`
   * is 0 deliberately — an empty cell has to be an ordinary sight, or the room
   * stops being a cell and becomes a place three people are always kept.
   *
   * They are given `homeBuilding` like the staff, which is honest rather than
   * load-bearing: what actually keeps them in is the gate. It is `bars`, so
   * nothing in the game unlocks one and they have no way out until an officer
   * takes it off its hinges or something chews through it. A `begsAtDoors` one
   * will hammer on it, which is the whole of what a prisoner can do about the
   * outbreak, and nobody is coming — `answerDoorPlea` skips a barred door.
   */
  if (station && !stationCellOff) {
    const inmates =
      POLICE_STATION_CELL_MIN +
      Math.floor(Math.random() * (POLICE_STATION_CELL_MAX - POLICE_STATION_CELL_MIN + 1));
    for (let i = 0; i < inmates && placed < HUMAN_COUNT; i++) {
      const spawn = findSpawn(world, ENTITY_RADIUS.human, station.cell, true);
      const id = addHuman(placed, spawn.x, spawn.y);
      world.ai.get(id)!.homeBuilding = station.building;
      placed++;
    }
  }

  /**
   * The corner complex is busier than an ordinary block.
   *
   * Drawn uniformly it gets one ticket in ninety, which for twenty rooms and a
   * whole corner of the map reads as a deserted landmark — and it is now the
   * building with the best loot in the city in it, which ought to be somewhere
   * with people in it rather than a quiet warehouse.
   *
   * A thumb on the existing draw rather than a count of its own, deliberately:
   * the indoor share is already sized off `HUMAN_COUNT`, so this scales with
   * the population slider for free and cannot over-fill a small city's complex
   * with a figure that was picked for a full one.
   */
  const complexTickets = world.map.cornerBuilding >= 0 ? COMPLEX_CROWD_MUL - 1 : 0;
  const houseCount = world.map.buildings.length + complexTickets;
  // The station is a building like any other here, so this draw samples the
  // cell's floor along with the rest of it — `findSpawn` is what refuses,
  // because every other path that places a body needs the same refusal.
  while (placed < indoorTarget && placed < HUMAN_COUNT) {
    const draw = Math.floor(Math.random() * houseCount);
    const index = draw < world.map.buildings.length ? draw : world.map.cornerBuilding;
    const b = world.map.buildings[index];
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

  /**
   * The standing garrison, **spread evenly over the map rather than scattered**.
   *
   * Purely random placement clumps — that is what random does — and a clump
   * leaves whole quarters of the city with nobody in uniform in them, which is
   * exactly where a dog goes to start an outbreak nobody can answer. So the map
   * is cut into a grid with one officer to a cell, and each is sampled inside
   * its own cell. Every quarter of the city has somebody in it.
   *
   * The grid is sized to the count rather than the other way round, so changing
   * `NPC_OFFICER_MIN`/`MAX` needs nothing here.
   */
  /*
   * The count scales with the **area** of the city, which is what holds the
   * property the count exists for. The figure that matters is the furthest any
   * spot can be from the nearest officer, and that goes as `sqrt(area / count)`
   * — so keeping officers-per-square-pixel fixed keeps that distance fixed, and
   * a quarter of a small city is no likelier to be unguarded than a quarter of
   * a big one. Scaled linearly instead, a 0.6 city would come out *better*
   * garrisoned than a full one, which is a difficulty change smuggled in under
   * a performance setting.
   *
   * Floored at four, which is what the city had before the count was raised:
   * below that the grid below has more empty cells than filled ones and the
   * spreading stops meaning anything.
   */
  const garrison = cityAreaScale();
  const officerCount = Math.max(
    4,
    Math.round(
      (NPC_OFFICER_MIN + Math.floor(Math.random() * (NPC_OFFICER_MAX - NPC_OFFICER_MIN + 1))) *
        garrison,
    ),
  );
  // Cells shaped to the map rather than square, so a wide city gets a wide
  // grid and no cell is a long thin strip.
  const cols = Math.max(1, Math.round(Math.sqrt((officerCount * WORLD_WIDTH) / WORLD_HEIGHT)));
  const rows = Math.ceil(officerCount / cols);
  const cellW = WORLD_WIDTH / cols;
  const cellH = WORLD_HEIGHT / rows;

  // There are usually more cells than officers, so some go empty — and taken in
  // order they are always the *same* cells, which hands the dog a permanently
  // unguarded bottom corner. Shuffling the cell list moves the gap somewhere
  // different every round, which is the whole point of the exercise.
  const cells = Array.from({ length: cols * rows }, (_, n) => n);
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }

  for (let i = 0; i < officerCount; i++) {
    const cell = cells[i % cells.length];
    const cx = cell % cols;
    const cy = Math.floor(cell / cols);
    const spawn = findSpawn(world, ENTITY_RADIUS.officer, {
      x: cx * cellW,
      y: cy * cellH,
      w: cellW,
      h: cellH,
    });
    const id = `npc-officer-${i}`;
    world.entities.set(id, makeEntity(id, 'officer', spawn.x, spawn.y));
    world.ai.set(id, newAiState(now, spawn.x, spawn.y));
    world.cityOfficers.add(id);
  }

  /*
   * **And the station is manned.**
   *
   * These are ordinary grey officers — `world.cityOfficers`, the same set the
   * spread garrison above goes into, so everything from `officerGrade` to the
   * anti-dog rule treats them identically. What is different is that they are
   * *posted*: `guardX`/`guardY` at the middle of the building, which is the
   * same machinery the van's driver and the city car's officer already use.
   *
   * Posting them is the whole point of the word "manned". Left to patrol they
   * would file out of the front door within a minute and the station would be
   * a building full of guns and nobody, which is the opposite of somewhere to
   * fall back to. The guard branch sits *below* the fight, so a posted officer
   * still shoots what comes to it and still gives ground; it just comes back.
   *
   * Scaled by area like the garrison and then clamped, because 1-6 is what was
   * asked for and a 1000-civilian round would otherwise put eight in it.
   */
  if (station) {
    const manned = Math.max(
      POLICE_STATION_OFFICERS_MIN,
      Math.min(
        POLICE_STATION_OFFICERS_MAX,
        Math.round(POLICE_STATION_OFFICERS * cityAreaScale()),
      ),
    );
    const b = world.map.buildings[station.building];
    const midX = b.x + b.w / 2;
    const midY = b.y + b.h / 2;
    for (let i = 0; i < manned; i++) {
      // Spread over the three rooms worth standing in rather than stacked in
      // one: the lobby, the office, and the armoury they are guarding.
      const room = i % 3 === 0 ? station.lobby : i % 3 === 1 ? station.office : station.armoury;
      const spawn = findSpawn(world, ENTITY_RADIUS.officer, room);
      const id = `station-officer-${i}`;
      world.entities.set(id, makeEntity(id, `officer`, spawn.x, spawn.y));
      const state = newAiState(now, spawn.x, spawn.y);
      state.guardX = midX;
      state.guardY = midY;
      state.guardRadius = POLICE_STATION_GUARD_RADIUS;
      world.ai.set(id, state);
      world.cityOfficers.add(id);
    }
  }

  /*
   * The outbreak walks in from one edge, spread along it — and **which edge
   * is the map's decision, not this one's**.
   *
   * It used to be rolled right here, which was fine while nothing else cared.
   * The police station has to stand in the half away from the breach, and it
   * is laid out inside `generateMap`, long before this runs. So the roll moved
   * there and this reads it back. Everything downstream — `world.outbreakSide`,
   * which is what keeps backup from arriving through the horde — is unchanged.
   *
   * **And it goes down before the bot officers do, which is why it sits here
   * rather than at the end of this function.** They are kept off the ground it
   * walked in on — see `inOutbreakKeepOut` — and that box is centred on
   * `world.outbreakOrigin`, which is set at the bottom of this block and whose
   * default is the *middle of the map*. The other way round it would withhold
   * the centre of the city and leave the breach wide open, which is exactly
   * backwards and would not error. What the move costs is that everybody
   * placed after it clears the initial five by the 6px `findSpawn` already
   * keeps from any body, which is if anything the better answer.
   */
  const side = world.map.outbreakSide;
  world.outbreakSide = side;
  const inset = BOUNDARY_THICKNESS + ENTITY_RADIUS.zombie + 24;
  let originX = 0;
  let originY = 0;

  // One breach point rather than a picket line across the whole edge.
  const breach = world.map.outbreakAlong;
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
    // And the same guarantee under it that `breachSpawnPoint` has, for the
    // same reason: the walk above ends rather than failing.
    ({ x, y } = streetSpotNear(world, x, y));

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

  // Bot officers stand in for the players who aren't here. They get the same
  // starting kit a player does — a pistol and nothing else — and go looking
  // for the rest of it.
  for (let i = 0; i < world.botOfficerCount; i++) {
    // Not on top of the outbreak. See `outbreakKeepOut`; the block above is
    // what makes `world.outbreakOrigin` mean anything by the time we get here.
    const spawn = findSpawn(world, ENTITY_RADIUS.officer, undefined, false, true);
    const id = `bot-${i}`;
    world.entities.set(id, makeEntity(id, 'officer', spawn.x, spawn.y));
    const state = newAiState(now, spawn.x, spawn.y);
    // An officer clearing a building does not stop to tidy up after itself.
    // The door traits are a civilian's business — shutting one behind you,
    // bolting it, running back across a room to see to it — and every one of
    // them is a bot standing still in a doorway instead of fighting. Cleared
    // as data rather than branched on in `doorTick`, so nothing downstream has
    // to know bots are different. Opening a door it needs through is untouched.
    state.closesDoors = false;
    state.locksDoors = false;
    state.slamsDoors = false;
    state.barricades = false;
    // And an officer does not hole up in a back room seeing to its doors.
    state.guardsDoors = false;
    state.hidesDeeper = false;
    world.ai.set(id, state);
    world.inventories.set(id, newInventory());
    world.stamina.set(id, STAMINA_MAX);
    // A bot stands in a player's slot, so it starts with what a player's slot
    // starts with. It had neither before, which meant every order that costs a
    // charge was refused before it was considered — `beaconShoutTick` could
    // never have fired once however good its judgement was.
    world.rallyCharges.set(id, RALLY_STARTING_CHARGES);
    world.followCharges.set(id, FOLLOW_STARTING_CHARGES);
    world.bots.add(id);
    // One random thing in the bag, the same as a player gets. It has to come
    // after `world.bots.add` only in the sense that it must come after the
    // inventory exists; the draw itself knows nothing about bots.
    giveStartingItem(world, id, spawn.x, spawn.y);
  }

  // TESTING: one bot starts with the beacon so the whole sequence — pick a
  // spot, helicopter, soldier, mast, shout — can be watched every round rather
  // than only when a bot happens to walk to the duck pond. `spawnPickups`
  // reads the same condition and leaves the bank one out, so this *moves* the
  // city's beacon rather than adding a second.
  if (TEST_BEACON_ON_A_BOT && world.bots.size > 0) {
    const chosen = [...world.bots][Math.floor(Math.random() * world.bots.size)];
    world.inventories.get(chosen)?.utilities.push('survivorBeacon');
    console.log(`[server] TESTING: ${chosen} starts with the survivor beacon`);
  }

}

/**
 * A spot on the edge the outbreak walked in from, `along` pixels off the
 * breach, walked inward until it is somewhere a body could actually stand.
 *
 * Pulled out of `populate` when the roar needed to put bodies in at the same
 * place. The walk inward is the part worth keeping in one piece: the perimeter
 * has buildings built onto it, so an edge point lands in somebody's front room
 * often enough to matter, and an outbreak — or a summons — starts in the
 * street.
 */
export function breachSpawnPoint(world: World, along: number): { x: number; y: number } {
  const side = world.outbreakSide;
  const inset = BOUNDARY_THICKNESS + ENTITY_RADIUS.zombie + 24;
  const origin = world.outbreakOrigin;
  let x: number;
  let y: number;
  if (side === 0) {
    x = clamp(origin.x + along, inset, WORLD_WIDTH - inset);
    y = inset;
  } else if (side === 1) {
    x = WORLD_WIDTH - inset;
    y = clamp(origin.y + along, inset, WORLD_HEIGHT - inset);
  } else if (side === 2) {
    x = clamp(origin.x + along, inset, WORLD_WIDTH - inset);
    y = WORLD_HEIGHT - inset;
  } else {
    x = inset;
    y = clamp(origin.y + along, inset, WORLD_HEIGHT - inset);
  }

  const inward = side === 0 ? [0, 1] : side === 1 ? [-1, 0] : side === 2 ? [0, -1] : [1, 0];
  for (let step = 0; step < 40; step++) {
    if (buildingIndexAt(world, x, y) < 0 && !world.nav.isBlocked(x, y)) break;
    x = clamp(x + inward[0] * 20, inset, WORLD_WIDTH - inset);
    y = clamp(y + inward[1] * 20, inset, WORLD_HEIGHT - inset);
  }
  // The walk runs out of steps, or clamps against the far inset and burns the
  // rest on the spot — and it *ends* rather than failing, so a body was quietly
  // left wherever it had got to. Measured over 240 breach points, 1 of them was
  // inside a building. Rare is not the same as never, and the one that lands in
  // a front room is a summons arriving in somebody's kitchen.
  return streetSpotNear(world, x, y);
}

/** Ids for anything walked in off the edge afterwards, so nothing collides. */
let hordeCounter = 0;

/**
 * The nearest spot to (x, y) somebody could actually stand on and get to.
 *
 * Spirals out until it finds a cell that is both unblocked *and* in the map's
 * main walkable component — reachable matters as much as clear, or an order can
 * point at the inside of a sealed courtyard. Falls back to the raw point when
 * there is nothing walkable anywhere near, which is the honest answer: the
 * caller's order still goes out and still lapses on its own.
 *
 * Shared by the dog's roar and the spectator's move orders. It was the roar's
 * private `roarTarget` first, and a second copy of it in `engine.ts` is exactly
 * the duplication this file keeps warning about.
 */
export function walkableNear(world: World, x: number, y: number): { x: number; y: number } {
  const px = clamp(x, 0, WORLD_WIDTH);
  const py = clamp(y, 0, WORLD_HEIGHT);
  if (!world.nav.isBlocked(px, py) && world.nav.isReachable(px, py)) return { x: px, y: py };

  for (let ring = 1; ring <= 14; ring++) {
    const radius = ring * 26;
    const steps = ring * 8;
    for (let i = 0; i < steps; i++) {
      const angle = (i / steps) * Math.PI * 2;
      const sx = clamp(px + Math.cos(angle) * radius, 0, WORLD_WIDTH);
      const sy = clamp(py + Math.sin(angle) * radius, 0, WORLD_HEIGHT);
      if (!world.nav.isBlocked(sx, sy) && world.nav.isReachable(sx, sy)) return { x: sx, y: sy };
    }
  }
  return { x: px, y: py };
}

/**
 * The nearest spot to (x, y) that is out in the street.
 *
 * `walkableNear` asks whether a body could stand somewhere; this asks the
 * further question of whether it is *outdoors*, which is a different thing —
 * the inside of a front room is walkable, reachable, and the last place an
 * outbreak should begin.
 *
 * **It is the fallback under a directed walk, not a replacement for one.** The
 * breach walks inward off the edge and almost always clears the frontage on its
 * own; this is what stops the handful that do not from silently spawning a body
 * in somebody's bedroom. Spirals like `walkableNear` and, like it, hands back
 * the raw point when there is nothing better within reach — the honest answer,
 * and one no caller can do anything about anyway.
 */
/**
 * True is the outbreak as it was: nothing checked whether a spawn was indoors,
 * so a fifth of dogs came into the round standing in a front room.
 *
 * Kept rather than deleted with the measurement, like `setSettledStandsStill`
 * and for the same reason: the control is the whole value of the run.
 * `server/spawncheck.ts` reads it.
 */
let spawnsIgnoreBuildings = false;

export function setSpawnsIgnoreBuildings(v: boolean): void {
  spawnsIgnoreBuildings = v;
}

export function streetSpotNear(world: World, x: number, y: number): { x: number; y: number } {
  if (spawnsIgnoreBuildings) return { x: clamp(x, 0, WORLD_WIDTH), y: clamp(y, 0, WORLD_HEIGHT) };
  const px = clamp(x, 0, WORLD_WIDTH);
  const py = clamp(y, 0, WORLD_HEIGHT);
  const outside = (sx: number, sy: number): boolean =>
    buildingIndexAt(world, sx, sy) < 0 && !world.nav.isBlocked(sx, sy) && world.nav.isReachable(sx, sy);
  if (outside(px, py)) return { x: px, y: py };

  for (let ring = 1; ring <= 14; ring++) {
    const radius = ring * 26;
    const steps = ring * 8;
    for (let i = 0; i < steps; i++) {
      const angle = (i / steps) * Math.PI * 2;
      const sx = clamp(px + Math.cos(angle) * radius, 0, WORLD_WIDTH);
      const sy = clamp(py + Math.sin(angle) * radius, 0, WORLD_HEIGHT);
      if (outside(sx, sy)) return { x: sx, y: sy };
    }
  }
  return { x: px, y: py };
}

/**
 * Walk `count` more zombies in at the breach — the roar's second half.
 *
 * They arrive on the same edge the outbreak did, which is the edge the dog
 * itself came in at, spread along it rather than stacked on one pixel: a column
 * of bodies on one spot is a pile collision then spends a second sorting out.
 *
 * Handed back rather than merely made, because the caller has an order to give
 * them and there is no other way to find out which ones are new.
 */
export function spawnAtBreach(world: World, count: number, now: number): Entity[] {
  const made: Entity[] = [];
  for (let i = 0; i < count; i++) {
    // Centred on the breach and fanned either side of it, so a big summons is
    // a wide front rather than a longer queue out of the same doorway.
    const spread = count > 1 ? (i / (count - 1) - 0.5) * DOG_ROAR_SUMMON_SPREAD : 0;
    const spot = breachSpawnPoint(world, spread + (Math.random() - 0.5) * 24);
    const id = `horde-${hordeCounter++}`;
    const e = makeEntity(id, 'zombie', spot.x, spot.y);
    world.entities.set(id, e);
    world.ai.set(id, newAiState(now, spot.x, spot.y));
    world.materializeUntil.set(id, now + MATERIALIZE_MS);
    made.push(e);
  }
  return made;
}

/** Where player one starts: town centre while testing, otherwise the outbreak. */
export function playerOneStart(world: World): { x: number; y: number } {
  return PLAYER_ONE_SPAWN_AT_CENTER
    ? { x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2 }
    : world.outbreakOrigin;
}

/** A clear spot within `range` of a point — used to place player one. */
/**
 * **Geometry and bodies: what a spawn will actually accept.**
 *
 * Pulled out of `findSpawnNear` when `findSpawnAt` needed the same answer, and
 * it is deliberately *only* those two things — no nav grid, so a room's own
 * floor passes, which is right for a SWAT team getting out of a van against a
 * frontage and for a pocket gunner going down in a hallway. Never the cell, for
 * the reason `findSpawn` gives: a van parked against the back of the station
 * could otherwise put an operator inside it and nothing would let them out.
 */
function spawnSpotFits(world: World, x: number, y: number, radius: number): boolean {
  if (inTheCell(world, x, y)) return false;
  for (const wall of world.wallGrid.queryCircle(x, y, radius + 20, new Set<Wall>())) {
    if (resolveCircleRect({ x, y, radius: radius + 4 }, wall)) return false;
  }
  for (const other of world.entities.values()) {
    if (Math.hypot(other.x - x, other.y - y) < other.radius + radius + 4) return false;
  }
  return true;
}

/**
 * **The spot you asked for, or the nearest one to it that a body fits on.**
 *
 * `findSpawnNear` is the other thing entirely and the names now say so: it is a
 * *spread*, `40 + random() * range` on a random bearing, which never returns
 * the point it was given and is exactly right for scattering a crew out of a
 * van. Handed to a caller that meant "here", it is a lottery — measured on
 * `deployEmplacement`, which works out a spot 46px in front of the officer and
 * then threw it away: the gun came down **41 to 106px** from it, on a bearing
 * with nothing to do with where anybody was pointing. Same trap `placeCityCar`
 * records for standing an officer beside a car, which is why `spotBeside`
 * exists — but that one refuses anywhere indoors, and a pocket gunner in a
 * hallway is a thing people do.
 *
 * Rings outward at a nav cell at a time, and each ring is turned a little
 * against the last so a nudge is not always due east. No `Math.random`: the
 * same deploy twice puts the gun in the same place.
 *
 * **Null when nothing within `reach` fits**, which is a real answer rather than
 * a formality — `deployEmplacement` is documented to refuse and leave the item
 * unspent, and with `findSpawnNear` under it that could never happen: its own
 * last resort is `findSpawn`, which would have put the gun anywhere in the
 * city.
 */
export function findSpawnAt(
  world: World,
  x: number,
  y: number,
  radius: number,
  reach: number,
): { x: number; y: number } | null {
  const at = (px: number, py: number) => ({
    x: clamp(px, radius, WORLD_WIDTH - radius),
    y: clamp(py, radius, WORLD_HEIGHT - radius),
  });
  const first = at(x, y);
  if (spawnSpotFits(world, first.x, first.y, radius)) return first;

  const step = NAV_CELL;
  for (let ring = 1; ring * step <= reach; ring++) {
    const r = ring * step;
    const n = Math.max(8, Math.round((2 * Math.PI * r) / step));
    for (let i = 0; i < n; i++) {
      const t = ((i + ring * 0.5) / n) * Math.PI * 2;
      const p = at(x + Math.cos(t) * r, y + Math.sin(t) * r);
      if (spawnSpotFits(world, p.x, p.y, radius)) return p;
    }
  }
  return null;
}

export function findSpawnNear(
  world: World,
  originX: number,
  originY: number,
  radius: number,
  range = PLAYER_ONE_SPAWN_RANGE,
  outdoors = false,
): { x: number; y: number } {
  for (let attempt = 0; attempt < 40; attempt++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 40 + Math.random() * range;
    const x = clamp(originX + Math.cos(angle) * dist, radius, WORLD_WIDTH - radius);
    const y = clamp(originY + Math.sin(angle) * dist, radius, WORLD_HEIGHT - radius);

    /*
     * **A room's floor is clear of wall slabs, so the test below waves it
     * through.** Everything this function checks is geometry and other bodies,
     * which is exactly right for a SWAT team getting out of a van against a
     * frontage or a pocket gunner going down in a hallway — and wrong for the
     * one caller that must come in off the street. Measured before the flag:
     * **20 of 100** dog spawns were inside a building.
     *
     * Off by default, so the answer for everybody else is byte-for-byte what it
     * was.
     */
    if (outdoors && !spawnsIgnoreBuildings && buildingIndexAt(world, x, y) >= 0) continue;

    if (!spawnSpotFits(world, x, y, radius)) continue;
    return { x, y };
  }
  // Forty tries found nowhere. For a caller that insisted on the street, the
  // origin it was given is a far better last resort than a spot anywhere in the
  // city — the outbreak's own origin is out in the open by construction.
  return outdoors ? streetSpotNear(world, originX, originY) : findSpawn(world, radius);
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
/**
 * The `Set` here is load-bearing and was measured, not assumed.
 *
 * Replacing it with an allocation-free walk looked obviously right — no
 * hashing, nothing collected — and was wrong twice over: **3x slower**, because
 * the per-item callback cannot be inlined once the grid's visitor is shared
 * with other call sites, and **not equivalent**, because deduplication matters
 * here. A body straddling two cells is offered twice, and the second offer is
 * not the no-op it looks like: the body has been moved by another neighbour in
 * between, so the pair can overlap again and be pushed a second time. Measured
 * over 11989 body positions, the two versions drifted by up to 17.8px.
 */
/**
 * Whether `e` steps aside for `other` outright rather than sharing the shove.
 *
 * A squad's shape is one man walking a line and the rest holding a bearing off
 * his back, so a follower who ends up in front of him is the one that has to
 * move. Split the overlap evenly and the leader is shoved off his own heading
 * by the very people following him — with four of them leaning on him from
 * behind the sweep wanders, and the formation then swings after a bearing
 * nobody chose.
 *
 * Deliberately `squadSlot > 0` and not `escortId` alone. That field does
 * double duty: a grey officer sticking with whoever has a radio out carries it
 * too, and that is a man tagging along rather than a man under orders — he has
 * no standing to be walked through.
 */
function defersTo(world: World, e: Entity, other: Entity): boolean {
  const state = world.ai.get(e.id);
  return state !== undefined && state.squadSlot > 0 && state.escortId === other.id;
}

export function resolveCollisions(world: World): void {
  const neighbours = new Set<Entity>();

  for (const a of world.entities.values()) {
    neighbours.clear();
    // **The query has to cover the padded distance, not the bare radii.** At
    // `a.radius * 2 + 8` it was exactly `2r + pad` for two officers — the pairs
    // the padding exists to separate would have sat right on the boundary and
    // been offered only by luck.
    world.entityGrid.queryCircle(a.x, a.y, a.radius * 2 + 8 + OFFICER_SPACING_PAD, neighbours);

    for (const b of neighbours) {
      if (b.id <= a.id) continue; // each pair once

      const dx = b.x - a.x;
      const dy = b.y - a.y;
      // Two officers stand a little further apart than their circles demand, so
      // a group that has arrived somewhere reads as several people rather than
      // as one mass. Nothing else in the city is affected.
      const pad = a.type === 'officer' && b.type === 'officer' ? OFFICER_SPACING_PAD : 0;
      const minDist = a.radius + b.radius + pad;
      let dist = Math.hypot(dx, dy);
      if (dist >= minDist) continue;

      dist = dist || 0.001;
      const overlap = minDist - dist;
      const nx = dx / dist;
      const ny = dy / dist;

      // Half each, unless one of them is keeping station on the other — a
      // squad leader does not give way to his own subordinates, so the
      // follower takes the whole of it. The shares still sum to 1, so the pair
      // finish exactly `minDist` apart either way; only *who moved* changes.
      let aShare = 0.5;
      let bShare = 0.5;
      if (defersTo(world, b, a)) {
        aShare = 0;
        bShare = 1;
      } else if (defersTo(world, a, b)) {
        aShare = 1;
        bShare = 0;
      }

      a.x -= nx * overlap * aShare;
      a.y -= ny * overlap * aShare;
      b.x += nx * overlap * bShare;
      b.y += ny * overlap * bShare;
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

    // Out of the water. The edge is a radius per bearing, so pushing clear is
    // a slide back out along the same ray rather than an edge search.
    const pond = world.map.pond;
    if (pond) {
      const dx = e.x - pond.x;
      const dy = e.y - pond.y;
      const dist = Math.hypot(dx, dy);
      if (dist < pond.r * 1.5 + e.radius) {
        const angle = Math.atan2(dy, dx);
        const edge = pondRadiusAt(pond, angle) + e.radius;
        if (dist < edge) {
          // Dead centre has no bearing to push along; any of them will do.
          const out = dist < 0.001 ? Math.random() * Math.PI * 2 : angle;
          e.x = pond.x + Math.cos(out) * edge;
          e.y = pond.y + Math.sin(out) * edge;
        }
      }
    }

    e.x = clamp(e.x, e.radius, WORLD_WIDTH - e.radius);
    e.y = clamp(e.y, e.radius, WORLD_HEIGHT - e.radius);
  }
}

export function toWire(
  world: World,
  e: Entity,
  revealInfected = false,
  now = Date.now(),
): EntityState {
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
  // The zombie side sees who is already carrying it — and so does anyone with
  // a cure gun in the bag, since a cure you can't aim is no use. Merely having
  // it is enough; you don't have to be holding it to spot them.
  if (revealInfected && world.pendingInfections.has(e.id)) state.infected = true;
  // The last few seconds of it, though, are visible to *everyone*. This is
  // deliberately not gated behind `revealInfected`: the point of the tell is
  // that whoever is stood next to them can see it coming and get clear, which
  // a secret would not do. Derived from the clock rather than latched, so it
  // cannot drift out of step with when they actually turn.
  const turnAt = world.pendingInfections.get(e.id);
  if (turnAt !== undefined && turnAt - now <= TURNING_TELL_MS) {
    state.turning = Math.round(Math.max(0, 1 - (turnAt - now) / TURNING_TELL_MS) * 100) / 100;
  }
  if (e.type === 'officer' && !world.playerIds.has(e.id)) {
    state.npc = true;
    // Whether the spectator's command card may still order a wall out of this
    // one. Only grey officers carry a sandbag, so only they ever say so.
    if (world.ai.get(e.id)?.hasSandbag) state.bag = true;
  }
  if (world.bots.has(e.id)) state.bot = true;
  // The head is a second angle, and only a dog has one. Sent rounded like
  // `facing` — a body the client eases toward anyway, at 30Hz.
  if (world.dogs.has(e.id)) {
    state.dog = true;
    // Before its first tick there is no dog state yet, and the honest answer
    // then is that the head is pointing where the body is. Sending nothing
    // would leave the client guessing on the frame a dog appears.
    const dog = world.dogState.get(e.id);
    state.head = Math.round((dog ? dog.head : e.facing) * 100) / 100;
    if (dog && dog.jawsOpenedAt > 0) state.lunging = true;
    // Sent to everyone who can see it, not only to whoever is driving. Two
    // seconds of a rooted animal with its mouth open is the tell the officers
    // across the street are meant to read, and a private one would do nothing.
    if (dog && dog.roarStartedAt > 0) state.roaring = true;
    // Coming apart, and then out in the world as the thing. Sent to everybody
    // for the same reason the roar is — an animal tearing itself into twice the
    // size is the only warning the street gets. The ramp is computed here
    // rather than latched, so it cannot drift out of step with the clock the
    // ability actually runs on.
    const morph = morphAmount(dog, now);
    if (morph > 0) {
      state.morph = Math.round(morph * 100) / 100;
      if (dog!.morphStartedAt > 0) state.morphing = true;
    }
    // Down, or lying on the back of the shambler it is about to come out of.
    // Both are invisible: the entity loop skips anything `dead`, which is what
    // lets the body be parked on the host to aim the camera without a second
    // dog appearing on screen a birth window early.
    if (world.dogDeaths.has(e.id) || world.dogBirths.has(e.id)) state.dead = true;
  }
  // Something is coming out of this one. Sent to everybody who can see it
  // rather than only to the dog it belongs to — a shambler shaking itself apart
  // in the street is a thing the officers across it should get to read, and it
  // is the only warning they get that a dog they killed is about to be back.
  const birth = birthProgress(world, e.id, now);
  if (birth >= 0) state.birthing = Math.round(birth * 100) / 100;
  if (world.burning.has(e.id)) state.burning = true;
  if (world.soldiers.has(e.id)) state.soldier = true;
  if (world.swat.has(e.id)) state.swat = true;
  if (world.squadLeads.has(e.id)) state.squadLead = true;

  const until = world.materializeUntil.get(e.id);
  if (until !== undefined) {
    if (now < until) state.materializing = true;
    else world.materializeUntil.delete(e.id);
  }

  const ai = world.ai.get(e.id);
  if (ai && ai.handHeld && ai.partnerId) state.hand = ai.partnerId;
  if (ai && now < ai.breakingUntil) state.breaking = true;
  const worn = world.inventories.get(e.id);
  if (worn && worn.kevlar > 0) state.armour = true;
  // Which way the shield faces is the whole of how it works, so it has to be
  // visible on the body rather than only in the HUD.
  if (worn && worn.shield > 0) state.shield = worn.shieldUp ? 1 : -1;
  // What is in their hands, so the client can draw the body around the weapon
  // rather than putting a pistol in everybody's fists whatever they carry.
  // Omitted for the pistol, which is the default the drawing already assumes.
  if (worn && e.type === 'officer') {
    const inHand = heldItem(worn);
    if (inHand && inHand !== 'pistol') state.held = inHand;
  }
  if (world.stunned.has(e.id)) state.stunned = true;
  const bashing = world.bashUntil.get(e.id);
  if (bashing !== undefined) {
    if (now < bashing) state.bashing = true;
    else world.bashUntil.delete(e.id);
  }

  const line = world.speech.get(e.id);
  if (line !== undefined) {
    if (now < line.until) state.say = line.text;
    else world.speech.delete(e.id);
  }
  return state;
}
