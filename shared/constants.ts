import type { EntityType } from './types.js';

// ---------------------------------------------------------------- world
export const WORLD_WIDTH = 4600;
export const WORLD_HEIGHT = 3400;
export const VIEWPORT_WIDTH = 960;
export const VIEWPORT_HEIGHT = 600;
export const TICK_RATE = 30;

// ---------------------------------------------------------------- map gen
export const TILE = 28;
export const WALL_THICKNESS = 10;
export const BOUNDARY_THICKNESS = 40;
export const BLOCK_SIZE = 300;
export const ROAD_SIZE = 88;
/** Flush with the boundary wall, so the city reaches the edges of the map. */
export const MAP_MARGIN = BOUNDARY_THICKNESS;
/** Plain rectangular blocks built straight onto the perimeter wall. */
export const EDGE_BUILDING_COUNT = 18;
export const EDGE_BUILDING_MIN_TILES = 5;
export const EDGE_BUILDING_MAX_TILES = 11;
export const EMPTY_LOT_CHANCE = 0.07;
/**
 * Rows and columns are each nudged sideways by up to this much, so streets
 * stagger and jog instead of running dead straight across the whole map.
 */
export const BLOCK_STAGGER = 96;

// ---------------------------------------------------------------- windows
/** Chance a long enough wall run gets a pane set into it. Kept low. */
export const WINDOW_CHANCE = 0.16;
/** Length of a pane, in tiles. */
export const WINDOW_TILES = 2;
export const WINDOW_HEALTH = 100;
export const WINDOW_ZOMBIE_DAMAGE = 5;
export const WINDOW_BULLET_DAMAGE = 25;
/** How often a zombie can claw at a pane. */
export const WINDOW_ATTACK_INTERVAL_MS = 600;
/** The park is the one dense thicket; everywhere else bushes stay sparse. */
export const PARK_BUSHES_PER_BLOCK = 34;
export const SCATTER_BUSH_COUNT = 16;

// ---------------------------------------------------------------- entities
export const PLAYER_RADIUS = 14;
/**
 * Everything that moves — players, civilians, zombies — has been scaled by a
 * further 0.8 here. Sprint, flee bursts, lunges and the escape boost are all
 * multipliers on these, so every relative pace is untouched.
 */
export const PLAYER_SPEED = 160;
/** Big enough to cover the viewport — fog is about occlusion, not range. */
export const PLAYER_SIGHT_RADIUS = 640;

// ---------------------------------------------------------------- fog of war
/** Visibility is recomputed on this cadence rather than every frame. */
export const FOG_UPDATE_MS = 80; // ~12.5Hz
/**
 * ...or sooner, once the viewer has moved this far. Large enough that walking
 * no longer outpaces FOG_UPDATE_MS, so the time-based cadence governs instead
 * of movement. The cost is that shadows are cast from a position up to this
 * many pixels stale — mostly hidden by the penumbra, but raise it further and
 * shadow edges start visibly lagging near walls.
 */
export const FOG_MOVE_EPSILON = TILE * 0.75;
/** The mask is rasterised at this fraction of viewport size, then upscaled. */
export const FOG_MASK_SCALE = 0.5;
/** Penumbra width in screen pixels. */
export const FOG_BLUR_PX = 9;
/** Entities ease in and out instead of snapping at the fog boundary. */
export const ENTITY_FADE_MS = 160;

export const HUMAN_RADIUS = 13;
export const HUMAN_COUNT = 400;
/**
 * NPC footspeeds are scaled down together by 0.8 from their original values,
 * so every human/zombie ratio — chase closing rate, escape bursts, lunges —
 * is unchanged. Player speed is deliberately left alone.
 */
export const HUMAN_WALK_SPEED = 35;
export const HUMAN_FLEE_SPEED = 83; // deliberately slower than a zombie
export const HUMAN_SIGHT_RADIUS = 300;
export const HUMAN_TURN_RATE = 8; // rad/s — caps how fast a human can swing its heading
export const HUMAN_PAUSE_MIN_MS = 700;
export const HUMAN_PAUSE_MAX_MS = 3200;
export const HUMAN_WANDER_RADIUS = 420;
/** Just enough spread that a crowd doesn't move in lockstep. */
export const HUMAN_SPEED_MUL_MIN = 0.97;
export const HUMAN_SPEED_MUL_MAX = 1.03;

export const ZOMBIE_RADIUS = 14;
export const ZOMBIE_SPEED = 102;
export const ZOMBIE_SEARCH_SPEED = 48;
export const ZOMBIE_SIGHT_RADIUS = 420;
export const ZOMBIE_MAX_HEALTH = 100;
export const ZOMBIE_TURN_RATE = 10;
/**
 * Noticeably uneven — some shamble, some are quick — but the floor is kept
 * above HUMAN_FLEE_SPEED so even a slow one eventually runs its victim down.
 * Yields roughly 147-208 px/s against a 130 px/s sprinting civilian.
 */
export const ZOMBIE_SPEED_MUL_MIN = 0.92;
export const ZOMBIE_SPEED_MUL_MAX = 1.3;

/** Short burst to close the last few metres onto a victim. */
export const ZOMBIE_LUNGE_RANGE = 150;
export const ZOMBIE_LUNGE_MULTIPLIER = 1.5;
export const ZOMBIE_LUNGE_MS = 850;
export const ZOMBIE_LUNGE_COOLDOWN_MS = 2600;

/** Winded after wrestling someone. */
export const ZOMBIE_POST_GRAPPLE_SLOW = 0.5;
export const ZOMBIE_POST_GRAPPLE_MS = 2600;

/**
 * A badly shot zombie drags. Nothing changes above this fraction of health;
 * below it the pace falls off linearly to `ZOMBIE_HURT_SLOWEST` at 1 HP, so
 * emptying a magazine into one is worth doing even when it doesn't drop.
 */
export const ZOMBIE_HURT_THRESHOLD = 0.4;
export const ZOMBIE_HURT_SLOWEST = 0.5;

/**
 * Share of zombies bright enough to leave a room they've cleared, making for a
 * door rather than milling about in it. The rest stay dumb, which is what
 * keeps buildings populated instead of everything draining into the streets.
 */
export const ZOMBIE_SMART_SHARE = 0.45;
export const ZOMBIE_ROOM_CLEAR_MS = 3000;
/** A zombie this close to prey drops whatever door it was working on. */
export const ZOMBIE_ABANDON_DOOR_RANGE = 210;

/**
 * Remarking on the first zombie you ever see. Only worth saying early on —
 * after `FIRST_SIGHT_WINDOW_MS` everyone knows what is going on and nobody
 * comments on it any more.
 */
export const FIRST_SIGHT_WINDOW_MS = 180000;
export const FIRST_SIGHT_CHANCE = 0.22;
export const FIRST_SIGHT_MS = 3000;
/** The one line that needs an audience, and only in the opening minutes. */
export const PJ_WINDOW_MS = 120000;
export const PJ_CHANCE = 0.02;
export const PJ_PLAYER_RANGE = 380;
export const PJ_LINE = 'Ew it looks like PJ!';

export const FIRST_SIGHT_LINES = [
  'What the heck was that!',
  'Was that a real life zombie?',
  'Did anyone else see that?!',
  'That was not a person!',
  "You're joking — a zombie?",
  'Tell me I imagined that.',
  'What in God’s name was that?',
  "That thing wasn't right.",
  'Is this actually happening?',
  'It looked at me!',
];

/**
 * Kevlar denies a grab outright rather than absorbing damage: the grapple
 * lasts a moment, ends with no infection, and costs one of three uses. Spent,
 * the vest is gone from the slot it was taking up.
 */
export const KEVLAR_GRAPPLE_MS = 500;

/**
 * "Follow me" is a shorter shout than the rally — you are asking the people
 * around you, not the whole street.
 */
export const FOLLOW_RADIUS = 340;
export const FOLLOW_ARRIVE_DIST = 62;
export const FOLLOW_SPEED_MUL = 1.5;
export const FOLLOW_STARTING_CHARGES = 1;
export const FOLLOW_SHOUT = "Follow me!";
export const FOLLOW_WAIT_SHOUT = "Wait here!";

/**
 * The launcher is kept out of the loot table and placed by its own roll, so
 * most cities simply don't have one. Finding it should feel like an event.
 */
/**
 * The launcher and the smoke grenade are each placed exactly once, by hand,
 * and kept out of the loot table entirely (rarity 0 leaves them out by
 * construction). One of each per city — finding either should be an event.
 */
export const ONE_OFF_ITEMS = ['grenadeLauncher', 'smokeGrenade'] as const;

/**
 * At least one of each of these exists in every city. Unlike ONE_OFF_ITEMS
 * they are still in the loot table, so this is a floor rather than a quota —
 * at rarity 1 a rare gun could otherwise miss a whole map, and a round where
 * the sniper simply isn't anywhere is a worse kind of rare than a scarce one.
 */
export const GUARANTEED_ITEMS = ['sniper', 'heavyMg', 'chargeRifle', 'flamethrower'] as const;
/** Its shell detonates where it lands, hurting everything close to it. */
export const BLAST_RADIUS = 132;
export const BLAST_DAMAGE_MAX = 140;
export const BLAST_DAMAGE_MIN = 35;
export const BLAST_MS = 520;

/** The pond, its lily pads, and the flock that lives on it. */
export const POND_MIN_RADIUS = 110;
export const POND_MAX_RADIUS = 190;
export const DUCK_COUNT_MIN = 4;
export const DUCK_COUNT_MAX = 9;
export const DUCK_PADDLE_SPEED = 14;
/** Gunfire this near the water puts the whole flock up. */
export const DUCK_SCARE_RADIUS = 260;
export const DUCK_FLY_SPEED = 260;
/** Up and gone: they clear the scene quickly rather than settling again. */
export const DUCK_FLY_MS = 1500;

/** Someone turning in the room with you, and nobody else turned in here yet. */
export const TURNED_REMARK_RANGE = 280;
export const TURNED_REMARK_CHANCE = 0.55;
export const TURNED_LINES = [
  'They are one of them now!',
  'Oh God — she turned!',
  'He is one of them!',
  'It got him. It got him!',
  'That was Michael. That WAS Michael.',
  'No no no, not in here!',
  'They have turned! Get back!',
  'Look at their eyes — they are gone.',
  'It happened. It just happened.',
];

/** A few shelter seekers want the far side of the city, not the near door. */
export const SHELTER_FURTHEST_CHANCE = 0.07;

/**
 * Bot officers: the counter-force. They carry real inventories, go looking
 * for better guns and fire them through the same path a player does.
 */
/** Lobby shape. Five officers against two dogs. */
export const LOBBY_HUMAN_SLOTS = 5;
export const LOBBY_DOG_SLOTS = 2;

/** Fallback when a round starts without a lobby behind it. */
export const BOT_OFFICER_COUNT = 4;
export const BOT_LOOT_RANGE = 1400;
export const BOT_LOOT_SCAN_MS = 900;

/** Some people run to whoever has a gun rather than to a door. */
export const OFFICER_SEEK_CHANCE = 0.16;
export const OFFICER_REFUGE_RANGE = 900;
export const OFFICER_REFUGE_GAP = 62;

/**
 * Final surge once a zombie is right on someone's heels. Stacks on top of the
 * lunge and stops chasers from trailing a hair behind their victim forever.
 * Measured as the gap between the two bodies, not centre-to-centre.
 */
export const ZOMBIE_CLOSE_RANGE = 12;
export const ZOMBIE_CLOSE_BOOST = 1.3;

/** Slack added to the contact test so grabs land instead of grazing. */
export const GRAPPLE_REACH_BONUS = 5;

/** Effective-distance multiplier for a victim who is already infected. */
export const INFECTED_TARGET_PENALTY = 3;

/** AI perception runs on its own budget rather than every tick. */
export const SENSE_INTERVAL_MS = 100;

export const ENTITY_RADIUS: Record<EntityType, number> = {
  officer: PLAYER_RADIUS,
  human: HUMAN_RADIUS,
  zombie: ZOMBIE_RADIUS,
  zombieMaster: 18,
};

export const ENTITY_COLOR: Record<EntityType, string> = {
  officer: '#3b82f6',
  human: '#22c55e',
  zombie: '#ef4444',
  zombieMaster: '#7f1d1d',
};

export const ENTITY_MAX_HEALTH: Record<EntityType, number> = {
  officer: 100,
  human: 100,
  zombie: ZOMBIE_MAX_HEALTH,
  zombieMaster: 200,
};

// ---------------------------------------------------------------- infection
export const GRAPPLE_MIN_MS = 1000;
export const GRAPPLE_MAX_MS = 2200;
/** Once a victim has this many attackers, other zombies go find their own. */
export const MAX_GRAPPLERS = 3;
/**
 * Held by this many at once and there is no getting away — the escape roll is
 * skipped entirely rather than merely made unlikely.
 */
export const GRAPPLE_NO_ESCAPE_AT = 3;

/** The outbreak arrives as a tight group along one randomly chosen map edge. */
export const INITIAL_ZOMBIES = 5;
export const INITIAL_ZOMBIE_SPREAD = 110;
export const MATERIALIZE_MS = 1400;
/** Rare clean getaway with no infection at all. */
export const BASE_ESCAPE_CHANCE = 0.05;
export const ESCAPE_CHANCE_PER_EXTRA_ZOMBIE = 0;
/** Slight, and gone quickly — just enough to break contact. */
export const ESCAPE_SPEED_MULTIPLIER = 1.5;
export const ESCAPE_BOOST_MS = 1400;

/** The common outcome is a bite that incubates while the victim runs. */
export const INSTANT_INFECT_BASE = 0.05;
export const INSTANT_INFECT_PER_EXTRA_ZOMBIE = 0.07;
export const INSTANT_INFECT_PER_PRIOR_GRAPPLE = 0.1;
export const TURN_DELAY_MIN_MS = 9000;
export const TURN_DELAY_MAX_MS = 45000;

// ---------------------------------------------------------------- flee / settle
export const FLEE_DIRECTIONS = 16; // candidate headings sampled when escaping
export const FLEE_PROBE_DIST = 130;
export const RETREAT_MS = 15000; // keep running after losing sight
export const RETREAT_DISTANCE = 950;
export const PANIC_MS = 16000; // agitated wandering before looking for cover
/**
 * Per-person scaling on both of the above, rolled once. Most people run a long
 * way and stay rattled; a few gather themselves quickly. Widening this spreads
 * the newly bitten much further across the map before they turn.
 */
export const PANIC_SCALE_MIN = 0.65;
export const PANIC_SCALE_MAX = 2.6;
/** Once someone has seen a zombie they never quite stroll again. */
export const SHAKEN_WALK_MULTIPLIER = 1.3;
export const PANIC_SPEED_MULTIPLIER = 1.5;
export const SEEK_TIMEOUT_MS = 20000;
export const ROAM_MS = 120000; // "keep wandering for a couple of minutes"
export const GROUP_RADIUS = 90;
export const GROUP_MIN_PEERS = 2;
/** Share of civilians who dive for the nearest bush the moment they see one. */
export const BUSH_HIDER_CHANCE = 0.1;
/** A hider only counts a bush as cover if it can fit wholly inside it. */
export const BUSH_MIN_FIT_RADIUS = HUMAN_RADIUS + 7;
/** Spacing used to work out how many people one bush can actually hold. */
export const BUSH_OCCUPANT_SPACING = HUMAN_RADIUS * 1.9;
/** Cover choice is re-evaluated on this cadence, not every tick. */
export const BUSH_SCAN_INTERVAL_MS = 500;

/**
 * Some people don't think — they just bolt the other way, which indoors
 * usually means backing themselves into a corner.
 */
export const BOLT_FLEE_CHANCE = 0.12;
/** How far outside a building an escapee aims for once they're through the door. */
export const INDOOR_EXIT_MARGIN = 52;
/** A zombie this near an exit means that way out is not an option. */
export const DOOR_BLOCK_RADIUS = 115;
/**
 * Share of people already indoors who sit tight when the zombie is still
 * outside. Only the remainder panic and run for the door.
 */
export const INDOOR_STAY_CHANCE = 0.85;
/** How many nearby buildings a fleeing civilian will consider hiding in. */
export const REFUGE_CANDIDATES = 16;
/**
 * Share of civilians who make straight for the inside of a nearby building the
 * moment they see a zombie, instead of running for open ground and only
 * looking for cover once they've calmed down.
 */
export const SHELTER_SEEK_CHANCE = 0.88;
/** How far a frightened civilian will look for a building to get inside. */
export const SHELTER_SEARCH_RADIUS = 620;
/**
 * Some people don't make for the nearest door — they have somewhere specific
 * in mind, blocks away, and run the whole distance to get to it.
 */
export const SHELTER_FAR_CHANCE = 0.28;
export const SHELTER_FAR_RADIUS = 1900;
/**
 * Others want somewhere substantial — a landmark or the corner complex rather
 * than the nearest terraced house. Ordinary blocks come in well under this;
 * the big buildings and the complex come in well over.
 */
export const SHELTER_LARGE_CHANCE = 0.3;
export const SHELTER_LARGE_MIN_AREA = 150000;
/** A large building is worth a longer run than the house next door. */
export const SHELTER_LARGE_RADIUS = 1500;
/** Buildings actually examined per scan — the rest is a distance sort. */
export const SHELTER_CANDIDATES = 8;
/** Shelter choice is re-evaluated on this cadence, not every tick. */
export const SHELTER_SCAN_INTERVAL_MS = 600;
/** Sidestep a zombie only when it's this close and roughly in the way. */
export const SKIRT_RANGE = 155;
export const SKIRT_CONE = 0.9; // radians off-heading that still counts as "in the way"
/** Reactions to spotting someone else running for their life. */
export const WITNESS_FOLLOW_CHANCE = 0.18;
export const WITNESS_INVESTIGATE_CHANCE = 0.1;
export const WITNESS_SIGHT_RADIUS = 260;
export const WITNESS_REACT_MS = 5000;

/**
 * Couples hold hands, move as one, and almost never let go — a handful per
 * city rather than a share of the population, so each pair reads as a story
 * rather than as crowd texture.
 */
export const COUPLE_COUNT_MIN = 2;
export const COUPLE_COUNT_MAX = 4;
/** How far apart the two of them start — just touching. */
export const COUPLE_SPAWN_GAP = HUMAN_RADIUS * 2 + 2;
/** The follower closes back to this before falling into step alongside. */
export const HAND_HOLD_DIST = HUMAN_RADIUS * 2 + 1;
/** Extra pace the follower can find to close a gap, and the leader's restraint. */
export const HAND_CATCHUP_MULTIPLIER = 1.55;
export const HAND_LEADER_WAIT_MULTIPLIER = 0.55;
/** Rolled once, the first time this person ever lays eyes on a zombie. */
export const HAND_RELEASE_ON_SIGHT_CHANCE = 0.06;
/** Rolled once, the moment their partner is seized. Most stay and hold on. */
export const HAND_RELEASE_ON_GRAPPLE_CHANCE = 0.1;
/** Follow distance for a pair who have let go of each other. */
export const COUPLE_FOLLOW_DIST = 74;

/**
 * Share of civilians who start the round indoors and simply stay there,
 * pottering about inside rather than strolling out into the street. Only the
 * remainder treat their building as somewhere they were passing through.
 */
export const INDOOR_HOMEBODY_SHARE = 0.88;

/** Clusters of people stood around chatting at the start of a round. */
export const SOCIAL_GROUP_SHARE = 0.22;
export const SOCIAL_GROUP_MIN = 2;
export const SOCIAL_GROUP_MAX = 5;
export const SOCIAL_CIRCLE_RADIUS = 34;
/**
 * Share of civilians who begin the round indoors — raised so the extra 100
 * added to the population all land inside buildings rather than on the street.
 */
export const BUILDING_START_SHARE = 0.48;

/** Being shot staggers a zombie for a moment. */
export const SHOT_SLOW_MS = 500;
export const SHOT_SLOW_MULTIPLIER = 0.36;

// -------------------------------------------------------------- special guns
/**
 * Scoping sees further than the naked eye — without this the sniper could out-
 * range the fog and shoot at ground with nothing drawn on it.
 */
export const SNIPER_SIGHT_RADIUS = 1500;
/** How far the client pulls the camera back while scoped. */
export const SNIPER_ZOOM = 0.58;
/** Seconds of easing in and out of the scope, so it doesn't snap. */
export const SCOPE_EASE_MS = 220;
/**
 * Half-angle of the head, measured off the way a zombie is facing. A round
 * entering inside this arc went in between the arms.
 */
export const HEADSHOT_ARC = 0.5;
/** Planting the bipod. You are immobile for this long before it pays off. */
export const DEPLOY_MS = 1000;
/** A charge shot at nothing still costs you the round. */
export const CHARGE_MIN_FRACTION = 0.25;
/** How long a grey officer keeps running after being grabbed. */
export const OFFICER_FLEE_MS = 20000;

/** Detecting a runner scraping along a wall instead of getting anywhere. */
export const UNSTICK_CHECK_MS = 420;
export const UNSTICK_MIN_PROGRESS = 16;
export const UNSTICK_COMMIT_MS = 1100;
/** Flee scoring pushes away from the map edge before they can hug it. */
export const BOUNDARY_AVOID_DIST = 150;

// ---------------------------------------------------------------- terrain
export const BUSH_SPEED_MULTIPLIER = 0.55;

// ---------------------------------------------------------------- stamina
export const STAMINA_MAX = 100;
export const STAMINA_DRAIN_PER_SEC = 46; // a shade over two seconds of sprint
export const STAMINA_REGEN_PER_SEC = 7;
export const STAMINA_SPRINT_FLOOR = 8; // can't start a sprint below this
/** Once fully drained you're locked out until the bar climbs back to here. */
export const STAMINA_RECOVERY_THRESHOLD = 82;
export const SPRINT_MULTIPLIER = 1.7;

// ------------------------------------------------------------- bot officers
/**
 * A bot officer stands in a player's slot, so it moves at a player's pace
 * rather than a civilian's — this is deliberately *not* part of the NPC speed
 * scale, which is tuned so civilians lose races with zombies. A bot is
 * supposed to win them.
 */
export const BOT_WALK_SPEED = PLAYER_SPEED * 0.72;
export const BOT_SPRINT_SPEED = PLAYER_SPEED * SPRINT_MULTIPLIER * 0.85;
/** Inside this, stop shooting, turn, and run. */
export const BOT_BOLT_DIST = 165;
/**
 * And keep running until this far clear. The gap between the two is what stops
 * a bot flickering between standing and bolting on the edge of the threshold.
 */
export const BOT_SAFE_DIST = 400;
/**
 * Where a hunting bot wants to be relative to the nearest zombie. Inside
 * NPC_OFFICER_SIGHT (420) on purpose — at the edge of its own vision a bot
 * hovers where it can neither see nor be reached, and never actually fights.
 */
export const BOT_HUNT_STANDOFF = 260;
/** Swung, not snapped — the NPC officer's rate reads as twitching on a bot. */
export const BOT_TURN_RATE = 7.5;
/**
 * The dead band around a bot's ideal range, as a multiplier. Deciding to
 * advance and to retreat against the same threshold had them flipping between
 * the two every few ticks; holding each until the other side of this is what
 * stops the jitter.
 */
export const BOT_RANGE_SLACK = 1.2;
/** Don't plant a bipod on something already close enough to reach you. */
export const BOT_DEPLOY_MIN_DIST = 260;
/**
 * Bots would rather walk round a hedge than through it — no telling what is
 * standing in there. A preference, blended into the heading, not a rule.
 */
export const BOT_BUSH_CLEARANCE = 34;
export const BOT_BUSH_PUSH = 0.7;

/** Don't pop a second smoke the instant the first one lands. */
export const BOT_SMOKE_COOLDOWN_MS = 9000;
/** How many spots a patrolling bot considers. Cheap: one field read each. */
export const BOT_PATROL_SAMPLES = 14;
export const BOT_PATROL_MIN = 420;
export const BOT_PATROL_MAX = 1100;
// ------------------------------------------------------- the pocket gunner
/**
 * A machine gun on a bipod behind a wall of sandbags, and a grey officer to
 * work it. It barely scratches anything — its job is to hold a street, not to
 * clear one, so what it really does is slow everything that walks into its arc.
 */
export const EMPLACEMENT_AMMO = 500;
export const EMPLACEMENT_COOLDOWN_MS = 85;
export const EMPLACEMENT_DAMAGE_MIN = 2;
export const EMPLACEMENT_DAMAGE_MAX = 5;
export const EMPLACEMENT_BLOOM = 0.05;
export const EMPLACEMENT_RANGE = 620;
/** Longer and heavier than a rifle round: the point of the thing. */
export const EMPLACEMENT_SLOW_MS = 1500;
export const EMPLACEMENT_SLOW_MUL = 0.25;
/** Half-angle of the traverse. A right angle each way is 180 degrees of front. */
export const EMPLACEMENT_ARC = Math.PI / 2;
/** How fast the gun swings across its arc. */
export const EMPLACEMENT_TURN_RATE = 3.2;
/** Where it lands relative to whoever put it down. */
export const EMPLACEMENT_PLACE_DIST = 46;

/** The sandbags: see-through and no obstacle to a bullet, but you can't walk it. */
export const SANDBAG_HALF_WIDTH = 42;
export const SANDBAG_HALF_DEPTH = 9;
/** How far in front of the gunner the bags are stacked. */
export const SANDBAG_STANDOFF = 26;
export const SANDBAG_HEALTH = 1200;
export const EMPLACEMENT_GUN_HEALTH = 700;
/** A zombie's claw at the bags, and how often it lands. */
export const SANDBAG_HIT_DAMAGE = 34;
export const SANDBAG_HIT_INTERVAL_MS = 620;
/** How near a zombie has to be to start tearing at them. */
export const SANDBAG_REACH = 22;

// ------------------------------------------------------------- flamethrower
/**
 * A thin stream of burning napalm. Short reach, sticks to what it touches, and
 * leaves the ground alight behind it — the fire is the weapon, not the lick of
 * flame itself.
 */
export const FLAME_RANGE = 260;
export const FLAME_SPREAD = 0.06;
export const FLAME_COOLDOWN_MS = 55;
/** Fuel. Deliberately generous: a flamethrower with ten shots is a novelty. */
export const FLAME_FUEL = 900;
/** How far apart the patches it lays down are, and how big each one is. */
export const FLAME_STEP = 26;
export const FIRE_PATCH_RADIUS = 30;
export const FIRE_PATCH_SPACING = 22;
/** How long a patch of ground burns for. */
export const FIRE_GROUND_MS = 9000;
/** Caught in the stream: burns for this long after it comes off them. */
export const FLAME_BURN_AFTER_MS = 3000;
/** Walked through burning ground: burns for this long. */
export const FLAME_GROUND_BURN_MS = 2000;
/** What burning does, per second, and what it does to how they move. */
export const BURN_DAMAGE_PER_SEC = 26;
export const BURN_SLOW_MUL = 0.55;

/** Body and head of a bot officer: blue with a grey head. */
export const BOT_OFFICER_COLOR = '#2563eb';
export const BOT_OFFICER_HEAD_COLOR = '#9ca3af';
/** A gun on the floor with nothing left in it. */
export const EMPTY_PICKUP_COLOR = '#6b7280';

// ---------------------------------------------------------------- gun
export const GUN_DAMAGE_MIN = 15;
export const GUN_DAMAGE_MAX = 25;
export const GUN_BLOOM_RAD = 0.06; // ~±3.5 degrees of spread
export const GUN_RANGE = 720;
export const GUN_COOLDOWN_MS = 1000;
/**
 * TESTING: player officers drop a zombie in a single hit. Turned off now that
 * the pistol does real damage — flip back to true to restore test-kill mode.
 */
export const PLAYER_ONE_SHOT_KILL = false;
/** Muzzle sits at the drawn barrel tip, not the body centre. */
export const MUZZLE_OFFSET_MUL = 2.2;
/** TESTING: how close player one spawns to their designated start point. */
export const PLAYER_ONE_SPAWN_RANGE = 180;
/**
 * TESTING: drop player one in the middle of town rather than on the outbreak,
 * so there are civilians around to test orders on. Set false to spawn on the
 * incoming horde instead.
 */
export const PLAYER_ONE_SPAWN_AT_CENTER = true;
export const TRACER_LIFETIME_MS = 90;
/** Gunfire carries through walls and bushes — zombies investigate the noise. */
export const GUNSHOT_ALERT_RADIUS = 900;
/** Chance a wounded zombie breaks off and hunts whoever shot it. */
export const RETALIATE_CHANCE = 0.45;
export const RETALIATE_COMMIT_MS = 1600;

// ---------------------------------------------------------------- NPC officers
export const NPC_OFFICER_MIN = 4;
export const NPC_OFFICER_MAX = 7;
export const NPC_OFFICER_SHOOT_INTERVAL_MS = 2000;
export const NPC_OFFICER_BLOOM_RAD = 0.22; // still poor, but less wild
/** They give ground to hold the far edge of their sight line. */
export const NPC_OFFICER_RETREAT_DIST = 360;
export const NPC_OFFICER_TURN_RATE = 13; // quick, but not a turret
/** Another target must be this much closer before an officer swaps to it. */
export const TARGET_SWITCH_MARGIN = 1.35;
export const NPC_OFFICER_SIGHT = 420;
export const NPC_OFFICER_COLOR = '#9ca3af';

// ---------------------------------------------------------------- landmarks
/** One or two oversized buildings partitioned into rooms. */
// ---------------------------------------------------------------- doors
/**
 * Doors hang in every way into a building and in some of the openings between
 * rooms. They are deliberately *not* in the nav grid: routes are planned as
 * though every door were open, and whoever is walking deals with the door when
 * they reach it. That is what makes finding one locked a discovery rather than
 * something the pathfinder quietly routes around.
 */
export const INTERIOR_DOOR_SHARE = 0.55;
export const DOOR_START_OPEN_CHANCE = 0.5;
export const DOOR_HEALTH = 1600;
/** ~33 seconds of work for a single zombie. */
export const DOOR_ZOMBIE_DAMAGE = 18;
export const DOOR_ATTACK_INTERVAL_MS = 600;
export const DOOR_BULLET_DAMAGE = 20;

/** How long working the handle takes. Nobody moves while they're at it. */
export const DOOR_OPEN_MIN_MS = 1100;
export const DOOR_OPEN_MAX_MS = 2000;
export const DOOR_CLOSE_MS = 750;
/** A door will not shut on somebody stood in it; it waits this long for them
 *  to clear, nudging them out, before giving up and staying open. */
export const DOOR_BLOCKED_WAIT_MS = 2500;
export const DOOR_STEP_ASIDE_SPEED = 70;
export const DOOR_LOCK_MIN_MS = 1000;
export const DOOR_LOCK_MAX_MS = 2000;

/** Share of wanderers who shut the door behind them. */
export const DOOR_CLOSE_BEHIND_CHANCE = 0.75;
/** Share of those sheltering from a zombie who shut *and* lock it. */
export const DOOR_LOCK_BEHIND_CHANCE = 0.9;
/** Finding it locked: beg to be let in, or go and find somewhere else. */
export const DOOR_BEG_CHANCE = 0.6;
/** Beggars who hold their ground at the door even with a zombie on them. */
export const DOOR_BEG_HOLD_CHANCE = 0.8;
/** Share of people indoors who would open up for a stranger. Most won't. */
export const DOOR_OPENS_FOR_STRANGERS_CHANCE = 0.2;
export const DOOR_BEG_MS = 22000;
export const DOOR_BEG_SPEECH_MS = 2600;
export const DOOR_BEG_SPEECH_MIN_MS = 2600;
export const DOOR_BEG_SPEECH_MAX_MS = 4800;
/** How near a plea has to be for someone indoors to hear it. */
export const DOOR_PLEA_HEARING = 340;

export const DOOR_BEG_LINES = [
  'Let me in!',
  'Open the door!',
  'Please — open up!',
  'Somebody open this door!',
  "I know you're in there!",
  'Open up, please!',
  "Don't leave me out here!",
  'For the love of God, open it!',
  "There's one behind me!",
  'Please, I can hear you!',
  'Open the door, I beg you!',
  'Let me in, please!',
  "I'm not one of them!",
  'Anybody — open the door!',
  'Unlock it! Hurry!',
  'Please, it’s coming!',
];

/** Somebody indoors can throw the bolt back, but it takes them a moment. */
export const DOOR_NPC_UNLOCK_MS = 2000;
/** Grace period before someone will touch a door they just finished with. */
export const DOOR_REENGAGE_MS = 6000;
/** Seeing a zombie sends most people straight for the nearest door to shut it. */
export const DOOR_SLAM_CHANCE = 0.85;
export const DOOR_SLAM_RANGE = 130;

/** Having bolted the door, some tell the room to stay put. */
export const DOOR_WARN_CHANCE = 0.4;
/** Share of those who hear it and heed it. */
export const DOOR_WARN_HEEDED = 0.96;
/** ...and of the rest, the very few who answer back. */
export const DOOR_WARN_DEFIED_CHANCE = 0.06;
export const DOOR_WARN_MS = 3200;

export const DOOR_WARN_LINES = [
  "Don't go outside.",
  'Nobody goes out there.',
  'Stay inside — all of you.',
  "Don't open that door.",
  'We stay put. Everyone.',
  "Don't go out there, please.",
  'Keep away from the doors.',
  'Nobody leaves. Not now.',
  "It's not safe out there.",
  'Stay in here where it’s safe.',
];

export const DOOR_DEFY_LINES = [
  "You can't tell me what to do.",
  "Don't tell me what to do.",
  "You don't decide that for me.",
  "I'm not staying in here.",
];

/** How near a player has to stand to work a door. */
export const DOOR_USE_RANGE = 54;
export const DOOR_PLAYER_OPEN_MS = 1000;
export const DOOR_PLAYER_CLOSE_MS = 1000;
export const DOOR_PLAYER_LOCK_MS = 1500;
export const DOOR_PLAYER_UNLOCK_MS = 1000;
/** Deliberately slow — kicking one in is a commitment. */
export const DOOR_KICK_MS = 4200;

/** How long a zombie remembers a door it watched someone shut. */
export const DOOR_ALERT_MS = 25000;
export const DOOR_ALERT_RADIUS = 430;
/**
 * Live prey beats a door. A zombie with anyone this close forgets whatever
 * door it was heading for — the door is not going anywhere.
 */
export const DOOR_VS_HUMAN_RANGE = 300;
/**
 * Something that has only just turned is interested in the nearest warm body
 * and nothing else. Doors stop registering at all for this long, so long as
 * there is someone about.
 */
export const FRESH_ZOMBIE_MS = 14000;
/**
 * Once the city is this empty, zombies take out their frustration on any door
 * they happen to walk into rather than only the ones they saw shut.
 */
export const DOOR_FRENZY_SURVIVORS = 89;

/**
 * A zombie shut into a room has no target, no scent and no memory of the door
 * closing — it would mill about in there for ever. Rather than have every
 * zombie reason about enclosure, they notice they are getting nowhere and take
 * it out on the nearest door, which costs one distance check per interval.
 */
export const ZOMBIE_STUCK_CHECK_MS = 900;
export const ZOMBIE_STUCK_MIN_PROGRESS = 14;
/** How long of going nowhere before a door starts looking like the problem. */
export const ZOMBIE_STUCK_DOOR_MS = 2400;
export const ZOMBIE_STUCK_DOOR_RANGE = 120;

/** Having bolted one door, the other one right there wants doing too. */
export const DOOR_ALSO_LOCK_RANGE = 190;
/** ...and it is rare to ask somebody else to see to it rather than going. */
export const DOOR_ASK_OTHERS_CHANCE = 0.12;
export const DOOR_ASK_MS = 3000;
export const DOOR_ASK_LINES = [
  'Someone lock that door too!',
  'Get that other door!',
  'The other door — lock it!',
  "Somebody bolt that one as well!",
  'That door too, quickly!',
];

/** Smallest room a partition is allowed to leave behind, in tiles. */
export const ROOM_MIN_TILES = 4;
/** Rooms are connected by a spanning tree; this adds openings on top of it. */
export const INTERIOR_EXTRA_DOOR_CHANCE = 0.28;

/**
 * The corner complex: one oversized, many-roomed building pushed flush into a
 * randomly chosen corner of the map, so its two outer walls read as part of
 * the perimeter.
 */
export const CORNER_COMPLEX_MIN_TILES = 26;
export const CORNER_COMPLEX_MAX_TILES = 34;
export const CORNER_COMPLEX_ROOM_MIN = 5;
export const CORNER_COMPLEX_MAX_CUTS = 4;

export const BIG_BUILDING_MIN = 2;
export const BIG_BUILDING_MAX = 4;
export const BIG_BUILDING_MIN_TILES = 17;
export const BIG_BUILDING_MAX_TILES = 24;

// ---------------------------------------------------------------- abilities
/** Everyone on screen hears the shout. */
export const RALLY_RADIUS = 560;
export const RALLY_STARTING_CHARGES = 1;
export const RALLY_SHOUT = 'GET OVER THERE!';
export const RALLY_SHOUT_MS = 3700;
export const RALLY_NO_CHARGE_LINE = "I can't yell right now I need a lozenge";
export const RALLY_NO_CHARGE_MS = 5000;
/** Close enough to the rally point to count as arrived and hold. */
export const RALLY_ARRIVE_DIST = 46;
/** Idle fidgeting so a held crowd doesn't look like a row of statues. */
export const RALLY_LOOK_MIN_MS = 900;
export const RALLY_LOOK_MAX_MS = 3400;
export const RALLY_LOOK_TURN_RATE = 1.6; // rad/s
/** How often someone considers grumbling, and how likely they are to. */
export const RALLY_CHATTER_MIN_MS = 20000;
export const RALLY_CHATTER_MAX_MS = 55000;
export const RALLY_CHATTER_CHANCE = 0.1;
export const RALLY_CHATTER_MS = 3600;
export const RALLY_CHATTER_LINES = [
  "I wonder how long they'll have us stand here",
  "I wonder what's going on…",
  'How long are we meant to wait?',
  'Anyone know what the plan is?',
  'My feet are killing me.',
  "I should've stayed home.",
  'Is somebody coming for us?',
  "It's too quiet.",
];

// ---------------------------------------------------------------- inventory
export const GUN_SLOTS = 3;
export const UTILITY_SLOTS = 6; // keys 4-9
/** How close you must be to a pickup to grab it. */
export const PICKUP_REACH = 46;
/** Hold E this long to drop what you're holding. */
export const DROP_HOLD_MS = 900;
/** Anything shorter than this counts as a tap, not a hold. */
export const TAP_MAX_MS = 220;
/** Most houses are empty — this is the chance a building contains loot. */
export const BUILDING_LOOT_CHANCE = 0.22;
/** Hits a kevlar vest soaks before it's spent. */
export const KEVLAR_POINTS = 3;
/** How long a tracker dart keeps a target lit up. */
export const TRACKER_DART_MS = 30000;
/** TESTING: scatter one of every item around player one's start point. */
export const TEST_DROP_ALL_ITEMS = true;
export const TEST_DROP_RADIUS = 90;

// ---------------------------------------------------------------- air support
export const GRENADE_THROW_RANGE = 400;
export const GRENADE_FLIGHT_MS = 850;
/**
 * Thrown things bounce off whatever they hit rather than passing through it,
 * keeping this share of their speed each time. Low enough that a shell fired
 * into a doorway rattles about in the room instead of pinging back at you.
 */
export const GRENADE_BOUNCE = 0.55;
export const GRENADE_COOLDOWN_MS = 700;
export const SMOKE_DURATION_MS = 9000;
export const SMOKE_RADIUS = 72;

export const HELI_SPEED = 250;
export const HELI_HOVER_MS = 4000;
export const HELI_MATERIALIZE_MS = 1700;
/** Time it takes to fade away completely once it starts its exit run. */
export const HELI_DEPART_FADE_MS = 2400;
/** Rotor-disc radius of the shadow — the aircraft itself is never drawn. */
export const HELI_RADIUS = 205;
export const HELI_SOLDIERS = 4;
export const HELI_DROP_INTERVAL_MS = 520;
/** How dark the shadow lies on the ground at full strength. */
export const HELI_SHADOW_ALPHA = 0.5;

/** Dropped troops shoot far better than the beat officers. */
export const SOLDIER_BLOOM_RAD = 0.07;
export const SOLDIER_SHOOT_INTERVAL_MS = 850;
export const SOLDIER_SIGHT = 520;
export const SOLDIER_COLOR = '#4d7c3f';

// ---------------------------------------------------------------- HUD
/** Once this few humans remain, point the way to each of them. */
export const BEACON_THRESHOLD = 10;

// ---------------------------------------------------------------- pathfinding
/**
 * How far ahead a wandering or searching entity looks for a wall. Comfortably
 * past NAV_INFLATE, so it fires on genuine contact rather than on walking down
 * a corridor with a wall alongside.
 */
export const WALL_TURN_PROBE = 26;

/**
 * How near a wall has to be before an officer starts leaning away from it, and
 * how hard. The push is blended into the desired heading rather than replacing
 * it, so it rounds a corner off instead of steering the walk.
 */
export const CORNER_CLEARANCE = 46;
export const CORNER_PUSH = 0.55;

export const NAV_CELL = 14;
export const NAV_INFLATE = 10; // wall padding; below entity radius so doorways stay open
export const PATH_BUDGET_PER_TICK = 10;
export const REPATH_INTERVAL_MS = 700;
/**
 * Node budget for one A* search. At 14px cells a cross-district route expands
 * a lot of nodes; too low a cap makes findPath give up and the caller fall
 * back to walking straight into whatever wall is in the way.
 */
export const PATH_MAX_NODES = 14000;

// ---------------------------------------------------------------- danger field
/**
 * Coarse grid for the geodesic danger field. One BFS per rebuild serves every
 * entity, which is what keeps hundreds of them affordable.
 */
export const DANGER_CELL = 28;
export const DANGER_REBUILD_MS = 160; // ~6Hz
/** Distances beyond this are treated as "safe" and not mapped. */
export const DANGER_MAX_DISTANCE = 900;

/** Flee destination search. */
export const ESCAPE_SAMPLES = 16;
export const ESCAPE_DISTANCE = 420;
/** Commit to a chosen escape for this long so they don't dither. */
export const ESCAPE_COMMIT_MS = 1200;
