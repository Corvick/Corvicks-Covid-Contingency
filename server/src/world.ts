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
import {
  WORLD_WIDTH,
  WORLD_HEIGHT,
  ENTITY_RADIUS,
  ENTITY_MAX_HEALTH,
  TURNING_TELL_MS,
  HUMAN_COUNT,
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
  FOLLOW_CROWD_CHANCE,
  RALLY_STARTING_CHARGES,
  FOLLOW_STARTING_CHARGES,
  PLAYER_ONE_SPAWN_AT_CENTER,
  DOG_RADIUS,
  DOG_MAX_HEALTH,
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
import { dropDebugKit, heldItem, newInventory, spawnPickups } from './inventory.js';
import { NavGrid, type Waypoint } from './navgrid.js';
import { DangerField } from './danger.js';
import { OUTSIDE, RoomMap } from './rooms.js';
import { RumourField } from './rumour.js';
import { doorRect, initDoors } from './doors.js';
import { pondRadiusAt } from '../../shared/pond.js';
import { initDucks, type Duck } from './ducks.js';
import type { Emplacement } from './emplacement.js';
import type { BackupVehicle } from './backup.js';
import type { Mine } from './mines.js';
import type { FirePatch, PendingPatch } from './fire.js';
import type { DogState } from './dog.js';

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
  /**
   * Where something worth chasing was last seen or heard, and when the memory
   * of it lapses. Without the clock a zombie that can't get to the spot never
   * arrives, never clears it, and so never reaches the branches below that
   * would have noticed it was getting nowhere.
   */
  lastSeenUntil: number;
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
  /** Committed to going round something, rather than re-aiming into it. */
  squadAvoidUntil: number;
  squadAvoidHeading: number;
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
  /** Remaining follow commands, and who currently has people in tow. */
  followCharges: Map<string, number>;
  followers: Set<string>;
  /** Loot lying on the floor, keyed by pickup id. */
  pickups: Map<string, PickupState>;
  inventories: Map<string, Inventory>;
  grenades: Map<string, Grenade>;
  smokes: Map<string, Smoke>;
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
  /** How many the next round should spawn — the lobby sets this. */
  botOfficerCount: number;
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
  radioReplies: Array<{ id: string; at: number }>;
  /** Next time to check who is holding a radio. Rarely anybody, so it's slow. */
  nextRadioScan: number;
  /** Deployed pocket gunners, keyed by the officer manning each one. */
  emplacements: Map<string, Emplacement>;
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
 */
export function spawnDog(world: World, id: string): void {
  const origin = world.outbreakOrigin;
  const spawn = findSpawnNear(world, origin.x, origin.y, DOG_RADIUS);
  world.entities.set(id, makeDogEntity(id, spawn.x, spawn.y));
  world.dogs.add(id);
  world.dogsOut.delete(id);
  world.dogDeaths.delete(id);
  world.dogState.delete(id);
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
    lastSeenUntil: 0,
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
    doorWatch: -1,
    doorWatchUntil: 0,
    squadSlot: -1,
    sweeps: false,
    squadBearing: 0,
    squadClosing: false,
    squadAvoidUntil: 0,
    squadAvoidHeading: 0,
    guardX: null,
    guardY: null,
    guardRadius: VAN_GUARD_RADIUS,
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
    followCharges: new Map(),
    followers: new Set(),
    pickups: new Map(),
    inventories: new Map(),
    grenades: new Map(),
    smokes: new Map(),
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
    botOfficerCount: BOT_OFFICER_COUNT,
    towers: [],
    beacon: null,
    mines: new Map(),
    zaps: [],
    stunned: new Map(),
    vehicles: new Map(),
    radioReplies: [],
    nextRadioScan: 0,
    emplacements: new Map(),
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
  world.spectators.clear();
  world.gameOver = false;
  world.victory = false;
  world.paused = false;
  world.emplacements.clear();
  world.targetClaims.clear();
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
  world.burning.delete(id);
  world.stunned.delete(id);
  world.materializeUntil.delete(id);
  releaseGrapples(world, id);
}

/**
 * The dog comes back **out of the horde**: a shambler somewhere on the map
 * stops being a shambler and stands up as the dog. That is the whole of its
 * lives system — the outbreak is its health bar, and every zombie the officers
 * put down is one fewer body it can come back in.
 *
 * Never out of another dog, and never out of itself.
 */
export function respawnDogFromHorde(world: World, dog: Entity, now: number): boolean {
  const hosts: Entity[] = [];
  for (const e of world.entities.values()) {
    if (e.type !== 'zombie' || e.id === dog.id || world.dogs.has(e.id)) continue;
    hosts.push(e);
  }
  if (hosts.length === 0) return false;

  const host = hosts[Math.floor(Math.random() * hosts.length)];
  // The dog entity is *moved* rather than rebuilt, so nothing keyed to its id
  // anywhere else has to be rebuilt with it.
  dog.x = host.x;
  dog.y = host.y;
  dog.health = dog.maxHealth;
  removeEntity(world, host.id);

  world.dogState.delete(dog.id);
  world.stamina.set(dog.id, STAMINA_MAX);
  world.exhausted.delete(dog.id);
  // It fades in where the shambler was, so the swap is something you can watch
  // happen rather than a body silently teleporting.
  world.materializeUntil.set(dog.id, now + MATERIALIZE_MS);
  return true;
}

/**
 * One body dying, wherever it died.
 *
 * Bullets, fire and blasts each used to write their own version of this, which
 * is exactly how a grenade came to delete a *player's dog* outright — `heli.ts`
 * removed any zombie it dropped, and a dog is a zombie. Anything that can take
 * an entity's health to zero calls this instead.
 */
export function killEntity(world: World, e: Entity, now: number): void {
  if (world.dogs.has(e.id)) {
    const dog = world.dogState.get(e.id);
    // Already down and waiting to rise. Rounds keep landing on the body — the
    // entity is still here, which is the point — and none of them kill it twice.
    if (world.dogDeaths.has(e.id)) return;

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
  const officerCount =
    NPC_OFFICER_MIN + Math.floor(Math.random() * (NPC_OFFICER_MAX - NPC_OFFICER_MIN + 1));
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

  // Bot officers stand in for the players who aren't here. They get the same
  // starting kit a player does — a pistol and nothing else — and go looking
  // for the rest of it.
  for (let i = 0; i < world.botOfficerCount; i++) {
    const spawn = findSpawn(world, ENTITY_RADIUS.officer);
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

  // The outbreak walks in from one randomly chosen edge, spread along it.
  const side = Math.floor(Math.random() * 4); // 0 N, 1 E, 2 S, 3 W
  // Recorded because backup is not allowed to arrive on it — see `outbreakSide`.
  world.outbreakSide = side;
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
  if (e.type === 'officer' && !world.playerIds.has(e.id)) state.npc = true;
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
    if (world.dogDeaths.has(e.id)) state.dead = true;
  }
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
