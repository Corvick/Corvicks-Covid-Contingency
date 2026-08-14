import type { EntityType } from './types.js';

// ---------------------------------------------------------------- world
export const WORLD_WIDTH = 5000;
export const WORLD_HEIGHT = 3700;
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
/**
 * The park thins out toward its edges rather than stopping dead at a line.
 * `PARK_EDGE_FADE` is how far in the thinning reaches and
 * `PARK_EDGE_DENSITY` is what is left of it right on the boundary, so you can
 * see into the trees from the street instead of meeting a wall of them.
 */
export const PARK_EDGE_FADE = 130;
export const PARK_EDGE_DENSITY = 0.16;
/**
 * A dirt path worn across it. Nothing grows on the path, which makes it the
 * quick way through — bushes slow you down, so a clear line through the
 * thicket is worth taking without any rule saying so.
 */
export const PARK_PATH_WIDTH = 52;
/** Undergrowth is kept this much clear of the path's edge on top of that. */
export const PARK_PATH_CLEARANCE = 12;
/**
 * Things stashed in the park. Not a lot — it is a cache, not a shop — and
 * every one has to be within `PARK_LOOT_COVER` of a bush, so you go into the
 * trees for it rather than spotting it from the road. Kept well off the dirt
 * path, since something lying on the one clear line through is not hidden.
 */
export const PARK_LOOT_COUNT = 5;
/**
 * On top of those, one gun and one utility that are *always* in the park. The
 * random five roll on the shares below and can easily come up all-utility, so
 * without these there is no promise the trees are worth going into for a
 * weapon at all.
 */
export const PARK_LOOT_GUARANTEED_GUNS = 1;
export const PARK_LOOT_GUARANTEED_UTILITIES = 1;
export const PARK_LOOT_GUN_SHARE = 0.45;
export const PARK_LOOT_COVER = 26;
export const PARK_LOOT_PATH_GAP = 70;
/**
 * A pair of good things dropped on the bank of the duck pond — one gun and one
 * utility, both out of the scarcest tier there is (`rarestOf`).
 *
 * The pond is the one landmark with nothing to do in it: ornamental water, a
 * flock of ducks, and no reason to walk over there. This gives it one. They are
 * placed independently rather than side by side, so finding one is not finding
 * both, and you have to work round the water.
 *
 * On the bank rather than in the reeds: `POND_LOOT_GAP` clear of the edge so
 * nothing lands in water you cannot cross, and within `POND_LOOT_BAND` of it so
 * it still reads as *pond* loot rather than as something dropped nearby.
 */
export const POND_LOOT_GAP = 26;
export const POND_LOOT_BAND = 120;

// ---------------------------------------------------------------- entities
export const PLAYER_RADIUS = 14;
/**
 * Everything that moves — players, civilians, zombies — has been scaled by a
 * further 0.8 here. Sprint, flee bursts, lunges and the escape boost are all
 * multipliers on these, so every relative pace is untouched.
 */
export const PLAYER_SPEED = 160;
/**
 * Big enough to cover the viewport — fog is about occlusion, not range. Raised
 * from 640 when the camera pan went in: the far corner of a panned screen is
 * hypot(480, 540) = 722 from the officer, and a client lighting ground the
 * server never sent entities for is the bug this constant exists to prevent.
 */
export const PLAYER_SIGHT_RADIUS = 760;
/**
 * How far the camera drifts as the cursor nears the edge of the screen.
 * Nothing to do with scopes or equipment.
 *
 * Sideways it is a small thing — the screen is already wide and there is no
 * awareness to win there, so this is just the camera answering the mouse.
 */
export const CAMERA_PAN_X = 60;
/**
 * Up and down it carries the difference between the two axes on top of that,
 * which is the whole reason the pan exists: the viewport is 960x600, so
 * without it you are aware of 480px of street to either side and only 300px
 * above and below. Derived rather than written down, so the two stay square
 * with each other if either the pan or the viewport ever changes.
 */
export const CAMERA_PAN_Y = CAMERA_PAN_X + (VIEWPORT_WIDTH - VIEWPORT_HEIGHT) / 2;

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
export const HUMAN_COUNT = 500;
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
 * Share of zombies that are bright about searching. *Every* zombie leaves a
 * room it has emptied now; this decides how quickly and how well. A smart one
 * gives up on an empty room in seconds and picks the way out that leads
 * somewhere nobody has swept; a dull one dawdles for the best part of ten and
 * then takes whatever door is handy. That gap is what keeps buildings
 * populated instead of everything draining into the streets at once.
 */
export const ZOMBIE_SMART_SHARE = 0.45;
export const ZOMBIE_ROOM_CLEAR_MS = 3000;
export const ZOMBIE_ROOM_CLEAR_SLOW_MS = 9500;
/** How long a zombie holds to a chosen way out before reconsidering it. */
export const ZOMBIE_EXIT_COMMIT_MS = 6000;
/**
 * How long "somebody has already been through there" is worth anything. Past
 * this a room is as good as unsearched again, so the horde re-sweeps a city it
 * has been over rather than settling into the last few rooms it hasn't.
 */
export const ZOMBIE_SWEEP_MEMORY_MS = 45000;
/** Milling about the street with nothing to chase before it goes looking. */
export const ZOMBIE_STREET_WANDER_MS = 4500;
export const ZOMBIE_STREET_WANDER_SLOW_MS = 13000;
/** Furthest it will cross to search a building it cannot see into. */
export const ZOMBIE_HUNT_RADIUS = 1100;
/** Close enough to a chosen doorway to start tearing at what's hung in it. */
export const ZOMBIE_EXIT_REACH = 34;
/**
 * How long a zombie keeps making for somewhere it last saw or heard prey.
 *
 * This has to expire. The chase-the-last-sighting branch runs *above* every
 * check that would notice a zombie is getting nowhere, so one making for a
 * spot it can't reach — behind a bolted door, across a wall — used to grind
 * there indefinitely, invisible to the stuck check and the room search alike.
 */
export const ZOMBIE_LAST_SEEN_MS = 9000;
/** How often, and by how much, progress toward a chosen way out is judged. */
export const ZOMBIE_EXIT_PROGRESS_MS = 1600;
export const ZOMBIE_EXIT_PROGRESS_MIN = 12;
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
 * And nothing can lay a hand on you for a beat after shrugging one off.
 *
 * Without it the vest is worth almost nothing in the only situation it exists
 * for: in a crowd the next zombie grabs on the same tick the last one let go,
 * and all three uses are gone inside a second and a half with the wearer never
 * having moved. The window is what turns the vest into a chance to get out.
 */
export const KEVLAR_IMMUNE_MS = 500;

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
/**
 * Every gun is somewhere in every city, in a building.
 *
 * `GUARANTEED_ITEMS` was a hand-kept list of the rare ones, which meant adding
 * a gun and forgetting to list it produced maps that simply didn't have it.
 * This derives the floor from the item registry instead, so a new gun is
 * covered the moment it exists. The pistol is excluded — you always have one —
 * and so is anything with rarity 0, which is placed by its own roll.
 */
export const GUARANTEE_EVERY_GUN = true;
/**
 * And every utility too, on the same terms.
 *
 * Utilities used to be deliberately *not* guaranteed — the idea being that
 * every city should be missing something — but with fifteen of them on the
 * belt, "missing something" in practice meant the one piece of kit a given
 * round was built around simply wasn't anywhere, and there is no way to tell
 * that from inside the round. The scarcity that is worth keeping is the
 * one-offs, which are still exactly one per city.
 *
 * Rarity 0 stays excluded: the smoke grenade is placed by its own roll.
 */
export const GUARANTEE_EVERY_UTILITY = true;
/** Its shell detonates where it lands, hurting everything close to it. */
export const BLAST_RADIUS = 132;
export const BLAST_DAMAGE_MAX = 140;
export const BLAST_DAMAGE_MIN = 35;
export const BLAST_MS = 520;
/**
 * What a charge does to a door. Rated against DOOR_HEALTH rather than against
 * the figures above: a frag at a body is a wound, a frag at a door is either
 * off its hinges or it isn't, and one that merely scratches a door is one
 * nobody would ever throw at a door. Point blank takes it out; from the far
 * edge of the blast it needs a second one.
 */
export const BLAST_DOOR_DAMAGE_MAX = 2000;
export const BLAST_DOOR_DAMAGE_MIN = 800;

/**
 * The pond, its lily pads, and the flock that lives on it.
 *
 * Grown from 110/190. It is a landmark people are now sent *to* — the one
 * beacon in the city lies on its bank — so it has to read as somewhere rather
 * than as a puddle, and there has to be bank enough to stand a crowd on.
 */
export const POND_MIN_RADIUS = 135;
export const POND_MAX_RADIUS = 225;
export const DUCK_COUNT_MIN = 4;
export const DUCK_COUNT_MAX = 9;
export const DUCK_PADDLE_SPEED = 14;
/** Gunfire this near the water puts the whole flock up. */
export const DUCK_SCARE_RADIUS = 260;
export const DUCK_FLY_SPEED = 260;
/** Up and gone: they clear the scene quickly rather than settling again. */
export const DUCK_FLY_MS = 1500;

/**
 * The last stretch of the incubation, when it starts to show.
 *
 * Turning used to be a single frame: a green body one tick and a red one the
 * next, with nothing in between and no warning to anybody stood next to them.
 * Across this window they redden from human green to zombie red, and most of
 * them say so. Before it the infection is invisible to everyone but a cure
 * gun; during it, anybody looking can see what is about to happen and has this
 * long to get out of reach.
 */
export const TURNING_TELL_MS = 4000;
/** Not all of them say it. A whole street announcing it at once is noise. */
export const TURNING_LINE_CHANCE = 0.7;
export const TURNING_LINES = [
  "I don't feel so good...",
  'Something is wrong. Something is really wrong.',
  "I'm burning up.",
  "My hands — I can't feel my hands.",
  'Stay back. Stay back from me.',
  "It's happening, isn't it?",
  "I can't breathe right.",
  "Don't look at me. Please.",
  'Tell them I was sorry.',
  'Is it cold in here? It is so cold.',
  "I think I've got it. I think I've got it.",
  'Run. Just run, will you?',
  'My head. Oh God, my head.',
  "I don't want to be one of them.",
  'It is in me. I can feel it moving.',
  "Somebody hold my hand. I don't want to be on my own.",
];
/**
 * A body coming up off the floor is not instantly at full pace. It *moves*
 * straight away — a stun read as a bug, a thing standing frozen while you
 * walked round it — but it comes up slow, which is the window whoever was
 * stood next to them gets to use.
 *
 * A slow rather than a freeze also means it goes through the same
 * `slowUntil`/`slowMul` every other stagger in the game uses, so being shot on
 * the way up stacks with it instead of arguing with it.
 */
export const FRESH_ZOMBIE_SLOW_MS = 1000;
export const FRESH_ZOMBIE_SLOW_MUL = 0.65;

/**
 * You can still work a trigger with something on you, but barely: an 80% cut
 * to the rate, which is this multiplier on every cooldown. Applied inside
 * `fireHeld` rather than at the call sites, so a player, a bot and a grey
 * officer all get it from the one place.
 *
 * The point is that being grabbed stops being a death sentence you watch —
 * you get a chance to do something about it, at a price.
 */
export const GRAPPLED_COOLDOWN_MUL = 5;

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
/**
 * How much room a bot wants around a pickup — and around the halfway point on
 * the way to it — before it is worth stopping to take. Shopping means standing
 * still in somebody's front room, and a bot will cross most of the city for a
 * gun; without a floor it does that through whatever is in between.
 */
export const BOT_LOOT_MIN_CLEARANCE = 240;
export const BOT_LOOT_SCAN_MS = 900;
/**
 * How keen a bot is on a duplicate gun, which `collect` strips for its rounds
 * rather than carrying. Scaled by how empty the copy in the bag already is, so
 * a bot with a full rifle ignores one and a bot down to its last few crosses
 * the street for it.
 */
export const BOT_REFILL_APPETITE = 55;
/**
 * How much better a gun has to be before a bot with a full bag will trade one
 * of its own for it. Zero was what let a pile of loot cycle forever: each swap
 * puts a gun back on the floor that is still an upgrade for somebody, so a
 * knot of officers stood at the same heap shuffled the same three rifles
 * between them for the rest of the round.
 */
export const BOT_SWAP_MARGIN = 12;
/**
 * How long a bot leaves a pickup alone after touching it. The other half of
 * the same fix: a swap leaves the gun it gave up under the *same* pickup id,
 * so without this the next scan a fifth of a second later sees a brand new
 * upgrade lying at its feet. It also covers anything `collect` refuses
 * outright, which would otherwise be retried thirty times a second forever.
 *
 * Long, deliberately. Five seconds stopped the tight loop but still let an
 * officer stroll off a heap and turn straight back to it, which from outside
 * is indistinguishable from the loop it replaced. Measured, bots finish
 * shopping a pile well inside twenty seconds, so this costs them nothing.
 */
export const BOT_LOOT_SNUB_MS = 20000;
/**
 * A bot only spends a frag on a crowd. One zombie is a rifle's job, and a bot
 * throwing its last grenade at a straggler has nothing left when the street
 * fills up.
 */
export const BOT_FRAG_MIN_TARGETS = 3;
/** One thrown or placed thing at a time, whichever it is. */
export const BOT_THROW_INTERVAL_MS = 5000;

/** Some people run to whoever has a gun rather than to a door. */
export const OFFICER_SEEK_CHANCE = 0.16;
export const OFFICER_REFUGE_RANGE = 900;
export const OFFICER_REFUGE_GAP = 62;
/**
 * A machine gun behind a wall of sandbags is a better bet than one man with a
 * pistol, so an emplacement wins against a lone officer half again as far off.
 * Applied as a discount on the distance rather than a flat bonus, or the
 * nearest officer always wins in a crowd.
 */
export const GUNNER_REFUGE_PREFERENCE = 0.6;
/** How far behind the bags people gather — out of the gun's own way. */
export const GUNNER_REFUGE_GAP = 78;
/** Close enough to a protector to count as being under their wing. */
export const PROTECTED_DIST = 120;

/** Saying so, now and then, to whoever is standing between them and it. */
export const PROTECT_CHATTER_MIN_MS = 9000;
export const PROTECT_CHATTER_MAX_MS = 26000;
export const PROTECT_CHATTER_CHANCE = 0.55;
export const PROTECT_CHATTER_MS = 3400;
export const PROTECT_LINES = [
  'Please keep me safe.',
  "Don't leave me here.",
  "You'll keep them off us, won't you?",
  'Stay close, please.',
  "I'm staying with you.",
  "Don't let them near me.",
  'I feel better with you here.',
  "You won't go anywhere, will you?",
];

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

/**
 * Some of them look at who the pack is already after and go somewhere else.
 *
 * Without this a horde is a conga line: everything in sight scores on distance
 * alone, so twenty zombies standing roughly together all pick the same nearest
 * person and trail after them in single file while the crowd four paces behind
 * that person walks away untouched. `ZOMBIE_SPREAD_SHARE` is how many of them
 * think that way — deliberately not all, because a pack that *never* doubles
 * up also never brings anybody down — and `ZOMBIE_SPREAD_PENALTY` is the
 * effective-distance multiplier each zombie already onto that target adds.
 *
 * It rides on the same score `INFECTED_TARGET_PENALTY` does, so "already
 * bitten" and "already spoken for" compose rather than arguing.
 */
export const ZOMBIE_SPREAD_SHARE = 0.6;
export const ZOMBIE_SPREAD_PENALTY = 0.85;

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
/**
 * Aiming past your own screen, the way Foxhole does it: the camera slides off
 * the officer toward the reticle rather than zooming out.
 *
 * Zooming was the obvious answer and the wrong one. It shrinks the officer,
 * the city and every body in it, so the moment you raise the scope the thing
 * you are trying to look *at* gets smaller — and it re-frames the whole screen
 * to show you ground behind you that you did not ask for. Pushing the camera
 * keeps everything the size it was and spends the whole budget on the
 * direction you are actually pointing.
 *
 * How far the camera may run off the officer, in world pixels. It is measured
 * from the *screen centre* rather than from the officer, who is no longer
 * stood there once the camera has moved — referencing him feeds the push back
 * into itself and it pins to the cap on the first twitch of the mouse. And it
 * is scaled by how far to the edge of the screen the cursor has got, not by
 * raw pixels: the screen is wider than it is tall, so counting pixels gave
 * aiming up and down barely half the reach of aiming along a street.
 *
 * 430 is more than half the viewport's height, so aiming hard up or down takes
 * the officer off the bottom of the screen. That is deliberate and it is what
 * `drawSelfMarker` is for; the alternative is cutting the vertical reach back
 * to the very thing the scope exists to fix.
 *
 * Bots get no camera, obviously. For them a scope is `BOT_SCOPE_SIGHT`.
 */
export const SCOPE_PUSH = 430;
export const BINOCULAR_PUSH = 300;
/** Seconds of easing in and out of the scope, so it doesn't snap. */
export const SCOPE_EASE_MS = 220;
/**
 * Half-angle of the head, measured off the way a zombie is facing. A round
 * entering inside this arc went in between the arms.
 */
export const HEADSHOT_ARC = 0.5;
/** Planting the bipod. You are immobile for this long before it pays off. */
export const DEPLOY_MS = 1000;
/**
 * And packing it up again. Right-click a second time to stow the bipod: it is
 * quicker than planting, but you stay rooted for it, so committing the gun is
 * a decision in both directions rather than only on the way down.
 */
export const UNDEPLOY_MS = 420;
/** A charge shot at nothing still costs you the round. */
/**
 * The charge rifle's four steps.
 *
 * Below the first bar there is not enough in it to fire at all — and letting
 * go early costs nothing, so a mis-click is not a wasted round. Each bar after
 * that is one more body the round carries through, and the fourth drives it
 * through a wall or a door as well.
 */
export const CHARGE_BARS = 4;
/**
 * Damage at the first bar and at the last, as multiples of the gun's figure.
 * The top bar used to be exactly the paper damage, which made a full wind-up
 * worth no more per round than a tap — all you bought was the pierce. It now
 * hits properly hard, which is what the second and a half of standing still is
 * actually for.
 */
export const CHARGE_BASE_MUL = 0.4;
export const CHARGE_TOP_MUL = 2.4;
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
/**
 * Inside this, stop shooting, turn, and run. Deliberately tight: an officer
 * that breaks off at the first sight of one is an officer that never fights,
 * and there is a whole kiting band above this where it gives ground *while*
 * shooting rather than turning its back.
 *
 * There is deliberately **no scaling of it with the size of the pack**, and no
 * "I am surrounded, get out" state above it either. Both were built and both
 * were measured over ten paired seeds, and the result is worth keeping written
 * down: bots alive **23/40 → 22/40**, grabs 66 → 72, and the median city
 * finished with **263 zombies rather than 229** — worse containment in eight of
 * the ten. Breaking off earlier does not save a bot, because what kills one is
 * the state of the city forty seconds later, and four officers who stop
 * fighting are what puts the city in that state. See "Fighting is how a bot
 * survives" in CLAUDE.md.
 */
export const BOT_BOLT_DIST = 120;
/**
 * And keep running until this far clear. The gap between the two is what stops
 * a bot flickering between standing and bolting on the edge of the threshold.
 */
export const BOT_SAFE_DIST = 330;
/**
 * How long a bot stays rattled after being grabbed.
 *
 * Officers run for OFFICER_FLEE_MS (20s) after a grab, which is a grey
 * officer's answer and was killing bots outright: twenty seconds of blind
 * running at HUMAN_FLEE_SPEED — *slower than a zombie* — beginning at the one
 * moment that makes the next grab likelier to turn them
 * (INSTANT_INFECT_PER_PRIOR_GRAPPLE). A bot breaks contact properly instead:
 * sprinting, goal-directed, and only until it is actually clear.
 */
export const BOT_SHAKEN_MS = 3500;
/**
 * Sprint is two seconds of running and ten of getting it back, so it is spent
 * on the thing it buys — breaking contact with what is actually on top of you.
 * Further out than this a bot jogs, which already outpaces a zombie (115
 * against 102) and leaves the reserve full for when the gap closes. Before
 * this a bolt burned the whole reserve in its first two seconds and then spent
 * a quarter of its ticks winded, at walking pace, with the pack still coming.
 */
export const BOT_SPRINT_TRIGGER = 220;
/**
 * The near field, when running.
 *
 * `escapeDestination` scores the far end of a bearing and its midpoint on the
 * danger field and *nothing in between*, so a zombie sixty pixels along the
 * chosen line costs that bearing nothing at all — and then `headingToward`
 * routes around walls, which a body is not, and walks the bot into it at a
 * sprint. This is the last hundred and fifty pixels, read off real positions
 * rather than off the coarse field, and it is only ever a steer: the bot is
 * still going where it was going.
 */
export const BOT_DODGE_RANGE = 150;
/** How far off the running line something still counts as being in the way. */
export const BOT_DODGE_CONE = 0.8;
/** How far ahead each way round is tested for being walkable. */
export const BOT_DODGE_PROBE = 110;
/**
 * How hard it swings round. Scaled by how close the body is: one at arm's
 * length has to be gone round, one at the edge of the near field only needs
 * leaning away from, and a fixed swing does one of those two badly.
 */
export const BOT_DODGE_SWING_MIN = 0.45;
export const BOT_DODGE_SWING_MAX = 1.3;

/** How far a bot probes when picking a bearing to give ground along. */
export const BOT_GIVE_GROUND_PROBE = 130;
/** How hard it prefers "directly away" over "roomiest" while doing it. */
export const BOT_GIVE_GROUND_BIAS = 110;
/**
 * Backing off with the gun still up. Slower than a walk on purpose — you do
 * not get to retreat at full pace *and* keep shooting, and at three quarters a
 * zombie still closes, so kiting buys time rather than winning outright.
 */
export const BOT_KITE_SPEED_MUL = 0.75;
/**
 * Where a hunting bot wants to be relative to the nearest zombie. Inside
 * NPC_OFFICER_SIGHT (420) on purpose — at the edge of its own vision a bot
 * hovers where it can neither see nor be reached, and never actually fights.
 */
export const BOT_HUNT_STANDOFF = 260;
/**
 * A scope in a bot's hands. It has no camera to push, so the whole of what a
 * scope means to a bot is *seeing further* — and that was the one thing it did
 * not get: `senseThreats` ran on NPC_OFFICER_SIGHT whatever was in the bag, so
 * a bot carrying the sniper stood at 420 with a gun good for 2200 and the
 * scope bought it precisely nothing.
 *
 * Deliberately short of the player's SNIPER_SIGHT_RADIUS (1500). A bot's
 * rounds go through the same `fireHeld` a player's do, so at the sniper's
 * bloom it does not miss; the player keeps the better glass.
 */
export const BOT_SCOPE_SIGHT = 1200;
/**
 * And where it stands with one. Still comfortably inside its own sight — the
 * rule that put BOT_HUNT_STANDOFF at 260 rather than 420 holds here too: a bot
 * loitering at the edge of what it can see never fights.
 */
export const BOT_SCOPE_STANDOFF = 700;
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

/**
 * A shut door is a room you cannot see into, and walking through one is how a
 * bot meets a pack at arm's length with no room to give.
 *
 * So it listens at the handle first. This is deliberately a *short radius
 * around the slab* rather than a look at who is in the room beyond:
 * `rooms.zombiesIn` is exact and omniscient, and would have a bot know about
 * something at the far end of a landmark it has never set foot in. What it
 * hears is only what is right behind the door.
 */
export const BOT_DOOR_LISTEN_RANGE = 140;
/** How far back off the threshold it gets before covering the door. */
export const BOT_DOOR_STANDOFF = 130;
/**
 * And how long it holds there. A doorway is the one place a bot can meet a
 * pack one at a time, so it is worth waiting to be come at — but not for long:
 * whatever it heard may never open the door, and standing at a handle is not a
 * plan.
 */
export const BOT_DOOR_WATCH_MS = 2600;
/** Then leave that door alone. Long enough to have gone somewhere else. */
export const BOT_DOOR_SNUB_MS = 15000;

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
export const FLAME_RANGE = 340;
export const FLAME_SPREAD = 0.06;
/**
 * Napalm leaves the nozzle travelling flat and only comes down further out, so
 * the ground it sets alight starts partway along the throw. Without this the
 * pavement you are standing on catches, which — since officers don't burn —
 * looked less dangerous than it did simply wrong.
 */
/** Shortest throw the stream will make, however close the crosshair is. */
export const FLAME_MIN_THROW = 90;
/**
 * Where it lands it splashes: how many patches, how wide the cone, how far
 * past the landing point they are thrown. Kept beyond FIRE_PATCH_SPACING so
 * they read as separate fires rather than merging back into the one they came
 * from. Suppressed entirely when a wall stopped the throw.
 */
export const FLAME_SPLASH_COUNT = 3;
export const FLAME_SPLASH_ARC = 1.9;
export const FLAME_SPLASH_SPREAD = 40;
/** How far back from the impact point the fire actually settles. */
export const FLAME_LAND_INSET = 8;
/** Napalm hangs far longer than a round's tracer, and dies away rather than off. */
export const FLAME_TRACER_MS = 560;
/**
 * How long the front of the stream takes to reach the far end of the throw.
 *
 * Burning fuel is *thrown*, not fired: it leaves the nozzle and travels, and
 * drawing the whole length in the frame the trigger goes down reads as a
 * laser rather than a liquid. At 55ms between pulls, several of these overlap
 * while the trigger is held, so the composite is a continuous jet with a
 * leading edge that visibly runs out to the target.
 *
 * Slowed from 170: at that speed the front still crossed the whole throw in
 * under a fifth of a second, which is fast enough that the eye reads the jet
 * as arriving everywhere at once and the travel does no work. It has to be
 * comfortably under FLAME_TRACER_MS or the front reaches the far end at the
 * exact moment the tracer dies and the tip is never actually drawn.
 *
 * **The ground fire waits for it.** `sprayFlame` queues its patches for
 * `now + FLAME_TRAVEL_MS` rather than laying them the moment the trigger goes
 * — burning ground appearing before the fuel gets there was the single most
 * obvious tell that the stream was a picture painted over an instant weapon.
 * What is *caught in the stream* still catches on the tick it was fired.
 */
export const FLAME_TRAVEL_MS = 300;
/**
 * How much wider the stream is at the far end than at the nozzle. A jet
 * spreads as it goes and breaks up as it slows; fattest-in-the-middle read as
 * a thrown blob rather than something under pressure.
 */
// Raised from 0.3 when the stream became one continuous body rather than a
// stack of overlapping ribs: at 0.3 the throat is a 4px thread, which was
// hidden while six pulls were drawn on top of each other and is not now.
export const FLAME_MOUTH_WIDTH = 0.5;
export const FLAME_TIP_WIDTH = 1.55;
/** Screen-space lift at the peak of the arc, at full range. */
export const FLAME_ARC_LIFT = 26;
/**
 * How much of that lift survives when firing straight up or down the screen.
 *
 * The lift is screen-space: it reads as height because it is across the line
 * of travel. Fire north or south and it is *along* the line instead, where it
 * stops looking like an arc and starts looking like the stream mis-aimed.
 */
export const FLAME_ARC_VERTICAL_MIN = 0.28;
/**
 * How long one pull's fuel takes to pass a point — the *length of the slug*,
 * in time.
 *
 * A pull is a parcel of burning fuel, not a line. It has a head and a tail,
 * and the tail is what keeps the stream anchored to the nozzle while the
 * trigger is down: at 30Hz a 55ms cooldown fires every other tick, so parcels
 * leave 67ms apart and anything shorter than that leaves gaps between them.
 * Comfortably longer, so consecutive slugs overlap into one body of fuel.
 */
export const FLAME_SLUG_MS = 150;
/**
 * How far apart the blobs are drawn along the stream, in pixels.
 *
 * This is what continuity now costs: there is one body of fuel rather than six
 * ribs laid over each other, so nothing else is covering the gaps. It has to
 * stay under the *narrowest* blob the stream draws, which is at the throat —
 * `FLAME_BLOB_RADIUS * FLAME_MOUTH_WIDTH`, 6.5px — or the jet reads as dotted
 * where it leaves the nozzle.
 */
export const FLAME_STREAM_STEP = 5;
export const FLAME_BLOB_RADIUS = 13;
export const FLAME_COOLDOWN_MS = 55;
/** Fuel. Deliberately generous: a flamethrower with ten shots is a novelty. */
export const FLAME_FUEL = 900;
/**
 * How big a patch is, and how far apart two of them have to be to count as
 * two. The spacing is what keeps burning ground reading as a scatter of
 * separate fires rather than one continuous orange smear — `dropPatch` merges
 * anything inside it, so a wider spacing means fewer, more distinct fires.
 */
export const FIRE_PATCH_RADIUS = 30;
export const FIRE_PATCH_SPACING = 34;
/** How long a patch of ground burns for. */
export const FIRE_GROUND_MS = 9000;
/**
 * And how much of that life it spends going out. A fire that is still at 45%
 * size and a quarter opaque when its clock runs out doesn't fade — it
 * vanishes. The last stretch has to carry it all the way to nothing.
 */
export const FIRE_FADE_FRACTION = 0.45;
/** Caught in the stream: burns for this long after it comes off them. */
export const FLAME_BURN_AFTER_MS = 3000;
/** Walked through burning ground: burns for this long. */
export const FLAME_GROUND_BURN_MS = 2000;
/** What burning does, per second, and what it does to how they move. */
export const BURN_DAMAGE_PER_SEC = 26;
export const BURN_SLOW_MUL = 0.55;
/**
 * Civilians catch, yelp and beat it out. They take almost nothing and stop
 * burning almost at once.
 *
 * This is a rule about the game, not about fire: without it the flamethrower
 * is a tool for clearing a street of the people you are there to save, and
 * burning the uninfected is a cheaper way to stop an outbreak than fighting
 * it. Officers don't catch at all for the same kind of reason.
 */
export const HUMAN_BURN_MS = 700;
export const HUMAN_BURN_DAMAGE_PER_SEC = 2;
/**
 * And fire will never take a civilian below this, however long they stand in
 * it. A trickle of damage is still a way to kill one given a minute, and the
 * rule has to be absolute to be worth having — the same shape as kevlar's
 * "can't be infected", which is an early return rather than a big number.
 */
export const HUMAN_BURN_FLOOR = 25;

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
/**
 * Slack on a door claim past the moment the work should have finished. The
 * claim has to outlive a hiccup — being shoved off the handle, a tick spent
 * running from a grab — but it must not outlive its owner. See
 * `doorBusyForOthers`.
 */
export const DOOR_CLAIM_GRACE_MS = 2500;
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
/**
 * A building rolls for a gun and, separately, for something to go with it.
 * They used to compete for the one item a house could hold, so a house with a
 * rifle in it never had a vest as well.
 */
export const BUILDING_GUN_CHANCE = 0.58;
export const BUILDING_UTILITY_CHANCE = 0.58;
/** Two items in one house never land on top of each other. */
export const LOOT_MIN_GAP = 44;

/** Utility kit. Deliberately not guaranteed — most cities are missing some. */
export const GRENADE_COUNT = 3;
/** Combat boots: a little quicker, and cheaper on the legs.  */
export const BOOTS_SPEED_MUL = 1.12;
export const BOOTS_STAMINA_MUL = 0.62;
/** Backpack and gunsling: extra slots while you carry them. */
export const BACKPACK_SLOTS = 2;
export const GUNSLING_SLOTS = 1;
/** Binoculars push the camera out too, the way a scope does but gently. */
export const BINOCULAR_SIGHT_RADIUS = 980;
/**
 * How far the zombie tracker will look before it gives up and points nowhere.
 *
 * The whole map, and then some — derived from the diagonal so it cannot fall
 * short if the city ever grows. It used to be 1600, which meant the one tool
 * that sees past the fog went blank in exactly the situation it exists for:
 * out in a quiet quarter with no idea which way the outbreak is. A compass
 * that only works when you can nearly see the thing is not a compass.
 */
export const TRACKER_RANGE = Math.hypot(WORLD_WIDTH, WORLD_HEIGHT) + 100;

/**
 * The charge rifle reads the infected.
 *
 * It is the one gun in the city that can shoot somebody already bitten, and a
 * weapon that can do a job nobody can *see* the need for is a weapon nobody
 * uses. Carrying one picks the incubating out of a crowd inside this range —
 * the same shape of hole in the fog thermal goggles punch for zombies, and
 * kept as narrow: it reveals nothing else about them, and it only reaches ids
 * already in `pendingInfections`.
 *
 * Server-side awareness only, for now: it drives what a bot officer does, and
 * nothing about it reaches the wire.
 */
export const CHARGE_INFECTED_SIGHT = 900;
/**
 * How wound up a bot takes the charge rifle before letting go at somebody
 * incubating. One bar drops a body; the top bar is what puts a round through
 * the wall they are stood behind, and a bot lining up a shot on a civilian
 * with the dead about has no reason to settle for less.
 */
export const BOT_CHARGE_BARS = CHARGE_BARS;
/**
 * How near the aim has to be before it lets go, and how long it will stand
 * there winding up before giving the whole idea up. Without the deadline a
 * bot that loses line of sight mid-wind holds the trigger forever.
 */
export const BOT_CHARGE_AIM_TOLERANCE = 0.1;
export const BOT_CHARGE_GIVE_UP_MS = 3000;

/** Hits a kevlar vest soaks before it's spent. */
export const KEVLAR_POINTS = 3;

/**
 * The riot shield. Worn rather than held: it costs a utility slot and then
 * stays wherever you last put it, front or back, while you get on with your
 * guns. Right-click taps a bash; holding right-click slings it round.
 *
 * That is why the heavy MG and the shield can't be carried together — both
 * want right-click, and the shield's claim on it doesn't depend on what is in
 * your hands. `collect` refuses the second of the two rather than leaving one
 * of them quietly broken.
 */
export const SHIELD_POINTS = 3;
/** Held this long, right-click slings it rather than bashing. */
export const SHIELD_STOW_HOLD_MS = 260;
/** Cover: a wide arc in front while it's up, a narrower one behind when slung. */
export const SHIELD_FRONT_ARC = 1.25;
export const SHIELD_BACK_ARC = 1.0;
/** The bash: reach, arc, shove, and how long it staggers what it catches. */
export const SHIELD_BASH_RANGE = 62;
export const SHIELD_BASH_ARC = 1.1;
export const SHIELD_BASH_PUSH = 46;
export const SHIELD_BASH_SLOW_MS = 1400;
export const SHIELD_BASH_SLOW_MUL = 0.35;
/** How long the shove animation is shown for. */
export const SHIELD_BASH_SHOW_MS = 260;
export const SHIELD_BASH_COOLDOWN_MS = 700;
/**
 * And what it costs. Roughly half a second of sprint per shove, out of the
 * same bar — so a shield is not a way to stand your ground indefinitely, and
 * bashing your way clear leaves you without the legs to use the gap.
 */
export const SHIELD_BASH_STAMINA = 24;
/** TESTING: scatter one of every item around player one's start point. */
export const TEST_DROP_ALL_ITEMS = true;
export const TEST_DROP_RADIUS = 90;
/**
 * TESTING: hand the survivor beacon to a random bot officer at spawn, and
 * leave none on the pond bank.
 *
 * The whole beacon sequence — a spot picked off the map, a helicopter, a
 * soldier walking it in, the mast, the shout — needs a bot to actually *have*
 * one, and in a real round that means a bot walking to the duck pond first.
 * This skips the walk so the rest can be watched every round instead of
 * occasionally.
 *
 * It moves the beacon rather than adding one: the pond placement is skipped, so
 * there is still exactly one in the city. Falls back to the pond when there are
 * no bots at all, or a round of nothing but human players would have no beacon
 * anywhere.
 */
export const TEST_BEACON_ON_A_BOT = true;

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

// ---------------------------------------------------------------- the radio
/**
 * Calling it in. Picking the radio up dispatches a squad car; holding it out
 * also draws in whatever grey officers are already on the street.
 *
 * The bubble and the crackle back matter more than they look: the car enters
 * from off the map and is several seconds away, so without them the radio does
 * nothing at all as far as the player can tell.
 */
export const RADIO_CALL_LINE = 'Requesting backup!';
export const RADIO_REPLY_LINE = 'Sending available unit';
export const RADIO_REPLY_DELAY_MS = 1100;
export const RADIO_SPEECH_MS = 2600;
/**
 * The radio is three calls and then it is gone, and the *first* of those is
 * the one worth having: it sends the van and the SWAT team in it. The second
 * and third get a patrol car and two officers, which is help, but it is not
 * the same help. Spending the good one early is the decision the item exists
 * to pose.
 */
export const RADIO_USES = 3;
export const RADIO_COOLDOWN_MS = 60000;
/**
 * Squeeze the handset before dispatch will talk to you again and all you get
 * is noise. It comes back in the same jagged bubble a real reply does, because
 * it is coming out of the same handset on your own hip — and without it,
 * pressing the button during the minute's wait does nothing whatsoever as far
 * as the player can tell, which is the exact problem the reply bubble was
 * added to fix in the first place.
 */
export const RADIO_STATIC_LINE = 'ssshhhkk—';
/** Four out of the van; two out of the car. */
export const RADIO_BACKUP_COUNT = 4;
export const RADIO_CAR_BACKUP_COUNT = 2;
/** How far a grey officer will hear the radio and come in, while it is out. */
export const RADIO_CALL_RANGE = 1500;
export const RADIO_CALL_SCAN_MS = 700;
/** How close an escort tries to stay, and how far before it breaks off to close up. */
export const ESCORT_NEAR = 90;
export const ESCORT_FAR = 170;

/** Whatever the radio sends: how fast it comes, where it stops, how it empties. */
export const BACKUP_SPEED = 240;
export const BACKUP_ARRIVE_DIST = 16;
/**
 * How far it starts off the map, and how far *in from the boundary* it looks
 * for clear ground to pull up on. Measuring the search from the entry point
 * rather than the boundary is what had it clamped flush against the perimeter
 * wall.
 */
export const BACKUP_ENTRY_OFFSET = 200;
/**
 * How far in it comes before looking for somewhere to stop. Raised from 90:
 * the search takes the *first* clear spot, so a low floor had everything
 * pulling up on the kerb the moment it was through the cordon, close enough to
 * the perimeter that the arrival happened half off the edge of the screen.
 */
export const BACKUP_PARK_MIN = 240;
export const BACKUP_PARK_MAX = 800;
export const BACKUP_DOOR_INTERVAL_MS = 420;
/** How long a door takes to swing open, and how far it swings. */
export const BACKUP_DOOR_SWING_MS = 320;
export const VAN_REAR_DOOR_ARC = 2.1;
export const VAN_CAB_DOOR_ARC = 1.5;
/**
 * Much bigger than the patrol car it replaces (46×22). It is an armoured box
 * with six people in the back, and at the old size the thing that turned up
 * with a SWAT team in it looked like a hatchback.
 */
export const VAN_LENGTH = 82;
export const VAN_WIDTH = 38;
/** The patrol car the second and third radio calls send instead. */
export const CAR_LENGTH = 46;
export const CAR_WIDTH = 22;
/**
 * How much room a vehicle needs either side of the lane it drives in down, and
 * how finely that lane is checked. It must not arrive *through* a building —
 * the old car was a point test against the nav grid, which a 38px-wide body
 * with a 20px shoulder either side of it walks straight past. Sized off the
 * van, which is the wider of the two, so one lane test serves both.
 */
export const BACKUP_LANE_CLEARANCE = 30;
export const BACKUP_LANE_STEP = 24;
/**
 * Lanes to try either side of the one lined up with the caller, before giving
 * that edge up. One building across the caller's own line shouldn't rule out
 * a whole side of the map when the street beside it is wide open.
 */
export const BACKUP_LANE_OFFSETS = [0, 150, -150, 300, -300, 460, -460, 620, -620];

/**
 * The van comes in hot and stops like it. It runs at `VAN_APPROACH_SPEED`,
 * starts braking `VAN_BRAKE_DIST` out, and slews up to `VAN_SLEW_ANGLE` off
 * the line it is travelling — the body turns while the momentum doesn't, which
 * is the whole of what a handbrake stop looks like from above. The tyre marks
 * are laid from the moment the brakes go on and stay there afterwards.
 *
 * Deliberately the van only. A two-officer patrol car turning up is a smaller
 * event than a SWAT team arriving, and it should read as one.
 */
export const VAN_APPROACH_SPEED = 400;
export const VAN_BRAKE_DIST = 210;
export const VAN_BRAKE_SPEED_MIN = 70;
export const VAN_SLEW_ANGLE = 0.42;
/**
 * And the stop is a *curve*, not a straight line with the body twisted at the
 * end of it. Straight in, then the brakes go on and it washes `VAN_DRIFT`
 * sideways while the back end comes round, and stops there — which is the
 * whole of what the shot looks like in a film, and what a dead-straight
 * approach with a rotated body conspicuously is not.
 *
 * The sideways offset is eased so its lateral speed is nearly zero by the end.
 * That matters for more than smoothness: the drawn body angle is the travel
 * tangent plus the slew, so a curve still bending at the moment it stops would
 * leave the van resting at some other angle than the one it rests at now.
 * Flattening it out is what keeps the final pose exactly as it was.
 */
export const VAN_DRIFT = 52;
/**
 * Rubber burning off the tyres while it slides. It keeps drifting and thinning
 * for a moment after the van has stopped — smoke that ends the instant the
 * vehicle does reads as a switch being thrown rather than as smoke.
 */
export const TYRE_SMOKE_PUFFS = 22;
export const TYRE_SMOKE_LINGER_MS = 1600;

/**
 * The crew: black gear, a riot shield each, and a semi-automatic rifle they
 * are genuinely good with. Tighter than the dropped soldiers (0.07) because
 * these are the ones who came when you asked, and a slower trigger than the
 * player's own semi-auto (470ms) so a four-man stack doesn't level a street
 * before you have crossed it.
 */
export const SWAT_BLOOM_RAD = 0.045;
export const SWAT_SHOOT_INTERVAL_MS = 620;
export const SWAT_SIGHT = 560;
export const SWAT_COLOR = '#1c1f26';
/** The helmet. Lighter than the gear, or the head vanishes into the body. */
export const SWAT_HELMET_COLOR = '#4b5563';

/**
 * The two officers out of a patrol car. Ordinary grey uniforms — no wire flag,
 * nothing to look at — but they brought bolt action rifles and they can use
 * them: a fifth of the ambient officer's bloom and three times the cadence.
 * They are still nothing like SWAT, which is the point of there being a
 * difference between the call that sends a van and the two that don't.
 */
export const RIFLEMAN_BLOOM_RAD = 0.045;
export const RIFLEMAN_SHOOT_INTERVAL_MS = 1150;
export const RIFLEMAN_SIGHT = 620;

/**
 * A squad sent by radio does not stand at your shoulder — it sweeps.
 *
 * One of them leads and the rest keep station on it, loosely: a slot bearing
 * off the leader's back at `SQUAD_SPREAD`, held only once they have drifted
 * `SQUAD_SLACK` off it. Correcting to an exact spot is a squad that marches;
 * the slack is the whole of what makes it read as people moving together
 * rather than as a formation being drawn.
 */
export const SQUAD_SPREAD = 62;
export const SQUAD_SLACK = 32;
/** How many spots a sweeping leader considers, and how far off it looks. */
export const SQUAD_SWEEP_SAMPLES = 12;
export const SQUAD_SWEEP_MIN = 420;
export const SQUAD_SWEEP_MAX = 1500;
/**
 * Where a sweep wants to be relative to the nearest zombie. The same figure
 * `BOT_HUNT_STANDOFF` uses and for the same reason: at the edge of their own
 * sight they hover where they can neither see nor be reached, and never fight.
 */
export const SQUAD_SWEEP_STANDOFF = 300;
/** How far the driver strays from the van he is minding. */
export const VAN_GUARD_RADIUS = 90;

// ---------------------------------------------------------------- zap mines
/**
 * Put down at your feet and left behind. The stun is enormous on purpose — a
 * minute is most of a fight — because a mine is a one-shot you had to carry,
 * place, and then walk away from. It buys ground rather than killing, which is
 * the emplacement's job rather than the grenade's.
 */
export const ZAP_MINE_COUNT = 3;
export const ZAP_STUN_MS = 60000;
export const ZAP_MINE_RADIUS = 46;
/** A beat before it goes live, so you can step off your own mine. */
export const ZAP_ARM_MS = 900;
export const ZAP_FLASH_MS = 420;

/**
 * Thermal goggles. The one place anything is sent that the viewer cannot see,
 * so the hole is kept as narrow as it can be and still work: zombies only,
 * inside this radius, and flagged so the client draws a heat blob rather than
 * a body. A wallhack for survivors or loot stays impossible by construction.
 */
export const THERMAL_RANGE = 520;

// ------------------------------------------------------------ survivor beacon
/**
 * A little radio mast you put down and then point people at. Unlike the rally
 * shout, which sends them to a spot you clicked and is spent, the beacon is a
 * place on the map — you can call people to it again and again from anywhere
 * within earshot, which is what makes it worth a utility slot.
 */
export const BEACON_SHOUT = 'Go to the survivor beacon!';
export const BEACON_SHOUT_MS = 3400;
/** How far the call carries, and how close counts as arrived. */
export const BEACON_CALL_RADIUS = 900;
/** Shouted when the mast is too far off to be pointed at. */
export const BEACON_TOO_FAR_LINE = 'Too far from the beacon to call it!';
export const BEACON_ARRIVE_DIST = 60;

/**
 * The beacon is a *handset*, not a mast you drop.
 *
 * Left-click with it in hand opens a map of the city and you pick the spot.
 * A helicopter then brings one soldier in who walks to that spot, plants the
 * mast, and stays to hold it. The item is never consumed: afterwards the same
 * click opens the same map to tell you how many people have actually made it
 * there, which is the only readout in the game for whether the plan worked.
 * Drop it and the mast stays and the order still works — you have simply given
 * away the ability to look.
 *
 * There is exactly one in the city and it is always on the bank of the duck
 * pond. That is the whole of its scarcity, and it is what makes the pond the
 * place everyone ends up.
 */
export const BEACON_ONE_PER_CITY = true;
/** Radius counted as "at the beacon" for the readout on the map. */
export const BEACON_MUSTER_RADIUS = 240;
/** How long the soldier takes to get the mast up once he is stood on the spot. */
export const BEACON_PLANT_MS = 2200;
/**
 * How near the designated spot counts as being on it.
 *
 * Generous on purpose. At 34 he would close to sixty-odd pixels, fail to shave
 * off the last of it against a kerb or a corner, and `unstickTick` — which owns
 * the tick when it fires and knows nothing about the goal — would shove him
 * back out and he would try again, forever. A mast is a metre wide and the spot
 * was picked off a map at a hundredth scale; "there" was never a pixel.
 */
export const BEACON_PLANT_REACH = 80;
/**
 * And if he still cannot get there, he puts it up where he stands.
 *
 * There is one beacon in the city. A spot that passed `requestBeacon`'s checks
 * but that no body can actually walk to — across a kerb, inside a footprint the
 * nav grid calls open — must not cost the round its only muster point. Better a
 * mast in the wrong place, which you can see on the map, than a soldier pacing
 * a wall for the rest of the game.
 */
export const BEACON_PLANT_GIVE_UP_MS = 45000;
/** He holds this much ground around it once it is up. */
export const BEACON_GUARD_RADIUS = 190;
/** Said on the way in, and once it is standing. */
export const BEACON_INBOUND_LINE = 'Beacon team inbound — hold on!';
export const BEACON_PLANTED_LINE = 'Beacon is up! Get to it!';
/** Shouted when the spot picked off the map is one nobody could stand on. */
export const BEACON_REFUSED_LINE = "Can't drop it there!";

/**
 * A bot giving the beacon order. How often it bothers to look, and how many
 * people have to be in earshot and not already going to make it worth the one
 * rally charge it has — shouting at an empty street throws away the only thing
 * that turns a mast into a muster.
 */
export const BOT_BEACON_SHOUT_CHECK_MS = 2500;
export const BOT_BEACON_SHOUT_MIN = 6;
/** How many spots a bot considers before calling the beacon in. */
export const BOT_BEACON_SAMPLES = 40;
/**
 * Clear of the dead is a *floor* rather than something to maximise.
 *
 * Scored as "furthest from any zombie" the beacon lands in whichever corner of
 * the map is emptiest — which is also the corner with nobody in it and the
 * longest walk from anywhere, so nobody arrives alive. Past this floor the spot
 * with the most people near it wins, less a mild pull toward the bot so the
 * carrier is not sent across the whole city on foot.
 */
export const BOT_BEACON_MIN_CLEARANCE = 420;
export const BOT_BEACON_WALK_WEIGHT = 0.01;
/** The map that opens on a click: how big, and how far in from the corner. */
export const MINIMAP_MAX_W = 520;
export const MINIMAP_MARGIN = 28;

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

// ---------------------------------------------------------------- rumour
/**
 * What the crowd *knows*, as opposed to what is true.
 *
 * The danger field is sourced from every zombie on the map whether or not
 * anyone has laid eyes on it, which is fine for the split second of running
 * for your life but wrong for deciding where to stroll. This is the honest
 * version: somewhere a human or an officer actually saw one, decaying with
 * time. It is collective because people shout — one person seeing a zombie is
 * a street that everybody avoids for a while.
 */
export const RUMOUR_MEMORY_MS = 40000;
/** How far word of a sighting spreads on the grid, in cells. */
export const RUMOUR_SPREAD_CELLS = 2;
/** How hard a remembered sighting pushes each kind of choice away. */
export const RUMOUR_WANDER_WEIGHT = 520;
export const RUMOUR_SHELTER_WEIGHT = 900;
export const RUMOUR_ESCAPE_WEIGHT = 260;
/** Above this, a building is somewhere nobody deliberately holes up. */
export const RUMOUR_REFUGE_LIMIT = 0.35;

// ---------------------------------------------------------------- rooms
/**
 * How much thicker than the door slab the plug is that splits two rooms apart
 * in the room map. It has to be wide enough that a solid line of cell centres
 * falls inside it at nav resolution, or the flood fill leaks through the
 * doorway and two rooms silently become one.
 */
export const ROOM_DOOR_PLUG = 12;
/** How far a room's id bleeds past its floor, in cells, so doorways still read. */
export const ROOM_DILATE_CELLS = 2;
/** How far past a doorway an entity leaving through it aims. */
export const ROOM_EXIT_AIM = 46;

// ---------------------------------------------------------------- danger field
/**
 * Coarse grid for the geodesic danger field. One BFS per rebuild serves every
 * entity, which is what keeps hundreds of them affordable.
 */
export const DANGER_CELL = 28;
export const DANGER_REBUILD_MS = 160; // ~6Hz
/** Distances beyond this are treated as "safe" and not mapped. */
export const DANGER_MAX_DISTANCE = 900;

/**
 * How much the halfway point of a flight counts against its destination.
 *
 * Scoring only where they are running *to* picks somewhere lovely and safe on
 * the far side of the zombie, and then the router walks them straight past it.
 */
export const ESCAPE_MIDPOINT_WEIGHT = 0.55;

/** Falling in behind a neighbour who is plainly getting away. */
export const FOLLOW_CROWD_CHANCE = 0.34;
export const FOLLOW_CROWD_CHECK_MS = 700;
export const FOLLOW_CROWD_RANGE = 260;
export const FOLLOW_CROWD_COMMIT_MS = 1600;
/** How much better their line has to be before it's worth joining. */
export const FOLLOW_CROWD_MARGIN = 90;

/** Retreating deeper into a building and bolting a door on the way. */
export const BARRICADE_CHANCE = 0.34;
/** A room with a second way out is a delay; one without is a coffin. */
export const BARRICADE_SECOND_EXIT_BONUS = 240;
/** A building with only one way in is a trap, and two is a way out. */
export const SHELTER_MULTI_EXIT_BONUS = 260;

/** Flee destination search. */
export const ESCAPE_SAMPLES = 16;
export const ESCAPE_DISTANCE = 420;
/** Commit to a chosen escape for this long so they don't dither. */
export const ESCAPE_COMMIT_MS = 1200;
