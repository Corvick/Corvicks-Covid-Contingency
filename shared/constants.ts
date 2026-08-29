import type { EntityType } from './types.js';

// ---------------------------------------------------------------- version
/**
 * Which update this is. Shown on the menu, ahead of the commit.
 *
 * **Bumped by hand, and deliberately a constant rather than a git tag.** A tag
 * is the conventional answer and it is the wrong one here: tags need their own
 * `git push --tags`, so the machine that forgot would sit there reporting a
 * stale version with perfectly current code — which is precisely the failure
 * this stamp exists to catch. A constant travels in the commit that changed it
 * and cannot disagree with the code around it.
 *
 * The commit is still printed beside it and is what actually settles whether
 * two boxes match: a version says which update you meant to be on, a hash says
 * which code you are on, and only the second of those can tell you somebody has
 * uncommitted edits.
 *
 * Roughly: patch for a fix or a tuning pass, minor for a new mechanic or
 * anything that changes how a round plays, major when it is a different game.
 */
export const GAME_VERSION = '0.16.4';

// ---------------------------------------------------------------- world
/**
 * The full-size city, and the yardstick everything below is measured against.
 * A round at `CITY_POP_MAX` civilians is played in exactly this.
 */
export const WORLD_BASE_WIDTH = 5000;
export const WORLD_BASE_HEIGHT = 3700;

/**
 * The city this round is actually being played in.
 *
 * **These are `let`, not `const`, and that is the whole of how the lobby's
 * population slider works.** ES module exports are live bindings, so the
 * hundred-odd places that read `WORLD_WIDTH` see whatever `setCityPopulation`
 * last wrote, without any of them having to be handed a size. The cost of that
 * is one rule: **nothing may derive a module-level constant from them.** A
 * value computed at import time freezes the launch size into itself and then
 * quietly disagrees with the map for the rest of the process — which is why
 * `trackerRange()` is a function, and the client's spectator fit is one too.
 *
 * Anything *sized* off the world has to be rebuilt when the world is: the
 * spatial grids, in `resetWorld`, and `NavGrid`/`DangerField`/`RoomMap`/
 * `RumourField`, which already take their dimensions from `map.width`.
 */
export let WORLD_WIDTH = WORLD_BASE_WIDTH;
export let WORLD_HEIGHT = WORLD_BASE_HEIGHT;
/**
 * The backbuffer. The page scales it to fit the window keeping 16:9, so this is
 * how much *world* you see rather than how big the window is.
 *
 * **Raising it is not free and the cost is not the pixels.** Everything derived
 * from the viewport grows with it: `CAMERA_PAN_Y` carries the difference
 * between the axes, and the three sight radii have to cover wherever the camera
 * can put the screen — which at 1920x1080 is 3.1x the ground, so roughly three
 * times as many entities are inside every viewer's fog and get serialised to
 * them every tick. The painting is 3.6x. See the note on `PLAYER_SIGHT_RADIUS`.
 */
export const VIEWPORT_WIDTH = 1920;
export const VIEWPORT_HEIGHT = 1080;
export const TICK_RATE = 30;

/**
 * What the RESOLUTION row on the options screen offers, as a multiple of the
 * viewport above.
 *
 * **It changes how many pixels the frame is painted at, and nothing else.**
 * The viewport stays 1920x1080 in *layout* units — every camera, HUD, fog,
 * pan and mouse figure in the game is written in those, so the amount of world
 * on screen is identical at every setting and no two players can see a
 * different game because of what their machine can afford. That is the same
 * line every other row on that screen holds, and it is the only reading of
 * "resolution" consistent with it: a setting that changed how much city you
 * could see would be a cheat, not a graphics option.
 *
 * **Why it is the most valuable row there.** Everything else on the screen is
 * measured in fractions of a millisecond — the grime tile 0.09ms, the vignette
 * 0.36ms — because they are cached fills. Painting is not cached and it scales
 * with area, so 0.75 is 56% of the pixels and 0.5 is a quarter of them. The
 * fog mask rides `FOG_MASK_SCALE` *of the backbuffer*, so its blit and its
 * blur come down with it too.
 *
 * Above 1 is a supersample: 1.5 paints 2.25x the pixels and the browser scales
 * it back down, which is a free high-quality antialias — the same trick
 * `DOG_SS` uses to bake the dog, and worth having on a machine with frames to
 * spare. It is deliberately not the default: the game is *tuned* at 1.0 and a
 * fresh install should see what it was designed to cost.
 */
export const RENDER_SCALES = [0.5, 2 / 3, 0.75, 1, 1.25, 1.5] as const;
export type RenderScale = (typeof RENDER_SCALES)[number];

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
 * Big enough to cover the viewport — fog is about occlusion, not range.
 *
 * **It is derived from `CAMERA_PAN_X`, not chosen.** A client lighting ground
 * the server never sent entities for is the bug this constant exists to
 * prevent, and the camera pan is what decides how far the screen can reach.
 * Computed the way `fogRadius()` does — the furthest screen corner the push can
 * produce, *sampled* over a quarter turn rather than bounded, since the push
 * follows a unit direction and the two axes cannot both be at maximum at once.
 *
 * At 1920x1080, zoom 2.0 and a pan of 80/194 world px that corner is 704. This
 * is that with a little headroom. Move the pan and this moves with it, or the
 * far half of the screen goes dark.
 */
export const PLAYER_SIGHT_RADIUS = 720;
/**
 * The same figure for the dog, whose camera is pulled out to `DOG_CAMERA_ZOOM`
 * — see the note there for *why* it sees more ground than an officer.
 *
 * Derived the same way and subject to the same rule: the server must send
 * entities as far as the client can light ground, or the dog gets a wider view
 * of an emptier street, which is worse than no change at all. At zoom 1.5 with
 * a pan of 80/259 the furthest corner is 923; this is that with the same 21px
 * of headroom the other three carry. `server/zoomderive.ts` checks it.
 *
 * **It moves whenever `DOG_CAMERA_ZOOM` does, and it is the half that is easy
 * to forget.** Pulling the camera out without this is the dog lighting ground
 * the server sent nobody for — an emptier street, seen further, which is the
 * exact opposite of what widening the view is for and shows up as nothing at
 * all rather than as an error.
 */
export const DOG_SIGHT_RADIUS = 945;
/**
 * How far the camera drifts as the cursor nears the edge of the screen.
 * Nothing to do with scopes or equipment, and it applies to **anything a person
 * drives** — an officer or a dog alike, since it is a property of the camera
 * rather than of what is in your hands.
 *
 * It used to be 60, on the reasoning that the screen is already wide so there
 * is no *awareness* to win sideways. That is true and it was still wrong: at 60
 * against a vertical 240, running the mouse to the left edge moved the camera
 * by a quarter of a body width while running it to the top moved half a screen,
 * and the thing felt broken on one axis. What you feel is the camera moving,
 * not the arithmetic behind it.
 *
 * Raising it is not free — see the note on `PLAYER_SIGHT_RADIUS`. The fog has
 * to reach wherever the camera can put the screen, and the server has to send
 * entities that far, so this number sets the other two. If it goes up again,
 * re-derive them.
 */
export const CAMERA_PAN_X = 80;

/**
 * How far in the player's camera sits. 1 is the old framing; above that you see
 * less ground, larger.
 *
 * **It is the fog lever, not the pan.** Measured across pan 50 to 90 the fog
 * polygon's area moved by three percentage points; going from 1.0 to 1.6 zoom
 * took it to a third. Everything the fog costs is set by how much *world* is on
 * screen, and the zoom is the only thing that changes that.
 *
 * **And it multiplies the pan rather than fighting it.** What you feel is the
 * camera moving in *screen* pixels, and those are world pixels times the zoom —
 * so `CAMERA_PAN_X` came down from 160 to 100 while the felt movement stayed
 * exactly where it was (100 × 1.6 = 160 screen px, as before). The sideways pan
 * is not being given up to pay for this; it is being paid for by the zoom.
 */
export const CAMERA_ZOOM = 2.0;
/**
 * Up and down it carries the difference between the two axes on top of that,
 * which is the whole reason the pan exists: the viewport is 960x600, so
 * without it you are aware of 480px of street to either side and only 300px
 * above and below. Derived rather than written down, so the two stay square
 * with each other if either the pan or the viewport ever changes.
 */
/**
 * How much of the half-screen the *base* pan is allowed to spend.
 *
 * **The pan must never carry you out of the frame.** Equalising awareness on
 * both axes wants a vertical pan of 362 world px, which is 580 screen px
 * against a half-screen of 540 — so at full downward deflection the body you
 * are driving sat 40px above the top edge, everywhere on the map, and the fog
 * hole went off with it. What is left on screen is lit ground and the outer
 * falloff of the fog: no walls, no bodies, nothing. It reads exactly like the
 * renderer giving up, which is how it was reported.
 *
 * This caps the vertical reach so the equal-awareness derivation can ask for
 * whatever it likes and still not lose the player. It deliberately does **not**
 * cap `SCOPE_PUSH`: an officer down a scope leaving the bottom of the screen is
 * the intended Foxhole behaviour, and `drawSelfMarker` exists for exactly that.
 */
const PAN_KEEP_ON_SCREEN = 0.72;

/**
 * The vertical pan a given zoom asks for, capped so it cannot carry whoever is
 * driving off the frame.
 *
 * A function rather than a number because there are two cameras now — an
 * officer's and the dog's — and both halves of this depend on the zoom: the
 * equal-awareness term because it is measured in world pixels, and the cap
 * because it spends a fraction of the half-screen, which the zoom sets. Derived
 * once so the two cameras cannot drift apart.
 */
function panYFor(zoom: number): number {
  return Math.min(
    CAMERA_PAN_X + (VIEWPORT_WIDTH - VIEWPORT_HEIGHT) / (2 * zoom),
    ((VIEWPORT_HEIGHT / 2) * PAN_KEEP_ON_SCREEN) / zoom,
  );
}

export const CAMERA_PAN_Y = panYFor(CAMERA_ZOOM);

/**
 * The dog's camera sits further out than an officer's, and this is a balance
 * fix rather than a rendering one.
 *
 * A dog has no ranged attack and no inventory, so it cannot carry binoculars or
 * a scope: it is pinned at the minimum view while the people shooting it are
 * not. At `CAMERA_ZOOM` the screen holds 540 world px vertically — 270 above
 * you — and `SWAT_SIGHT` is 560. A SWAT team directly above or below could see
 * the dog and open fire from 290px beyond the top of its screen, and even with
 * the mouse pushed fully up they still out-ranged the frame by 96. Being killed
 * by something that was never on screen is not difficulty, it is an unreadable
 * death, and it was reported as one.
 *
 * 1.6 was the loosest zoom that closed it: 675 world px vertically, 337 above
 * you at rest and 580 with the pan, against SWAT's 560. The rule it satisfies
 * is *anything that can shoot you is something you can look at* — deliberately
 * not "see it all without moving the mouse", which would need a zoom below 1.0
 * and hand the dog the whole street for free.
 *
 * **1.5 is that rule with room to spare rather than by 21px.** Clearing SWAT by
 * a hair means a dog that is technically able to look at whatever is shooting
 * it, provided it happens to be pointing the right way at the time; the extra
 * ground is what turns "it was on screen if you were already looking" into
 * seeing it coming. 720 world px vertically, 360 above you at rest and **619
 * with the pan, against the same 560**.
 *
 * It is not free. Ground on screen is what sets both the fog polygon's cost and
 * how many entities are serialised per viewer, and 1.5 is ~113% of 1.6 on both,
 * or ~173% of an officer's 2.0. That is one connection, and the dog is the seat
 * where it buys something. `server/zoomderive.ts` sweeps the candidates and is
 * what says 1.7 is already short of SWAT.
 */
export const DOG_CAMERA_ZOOM = 1.5;
export const DOG_CAMERA_PAN_Y = panYFor(DOG_CAMERA_ZOOM);

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

// ------------------------------------------------------- how big a city is
/**
 * How many civilians a city is built for. The lobby's host sets it; everything
 * else about the round's size is derived from it.
 *
 * `HUMAN_COUNT` is **civilians only**, which is what the slider says: the
 * garrison, the players, their bots and the five zombies that walk in from the
 * edge are all on top of it.
 */
export const CITY_POP_MAX = 500;
export const CITY_POP_MIN = 100;
/** The slider's granularity. Nobody is choosing between 337 and 338 people. */
export const CITY_POP_STEP = 25;

/**
 * How far the city shrinks with the crowd.
 *
 * **Area scales with population, so the streets stay as busy as they are now.**
 * A quieter round is meant to be a smaller city, not the same city with the
 * people thinned out of it — walking four blocks to find anybody is not the
 * game, and the point of the setting is to have *less of everything* to
 * simulate and to draw.
 *
 * That is `sqrt(pop / CITY_POP_MAX)` on each axis, and it holds until
 * `CITY_SCALE_MIN`, where it stops. **The floor is not a round number picked by
 * eye — it is what the city needs to still be one.** Blocks, roads and the gaps
 * between buildings keep their absolute sizes at every setting (that is what
 * keeps a van able to drive in and a SWAT team able to get out of it), so
 * shrinking the map removes blocks rather than tightening them. What does *not*
 * shrink on its own is the landmark set — the corner complex, the park, the
 * pond — and below about 0.6 those stop being landmarks in a city and start
 * being the city. At 0.6 the smallest map is 3000x2220, which still holds an
 * 8x6 street grid around all of them.
 *
 * Below the floor the crowd genuinely thins, which is the trade: 100 people in
 * 3000x2220 is a quiet city, and quiet is what was asked for.
 */
export const CITY_SCALE_MIN = 0.6;

/** Civilians in the city. A `let`, and written by `setCityPopulation` alone. */
export let HUMAN_COUNT = CITY_POP_MAX;

/** The slider's value, as the server will read it: on a step, and in range. */
export function clampCityPopulation(pop: number): number {
  const stepped = Math.round(pop / CITY_POP_STEP) * CITY_POP_STEP;
  return Math.max(CITY_POP_MIN, Math.min(CITY_POP_MAX, stepped));
}

/** Linear scale on each axis for a given crowd. See `CITY_SCALE_MIN`. */
export function cityScaleFor(pop: number): number {
  return Math.max(CITY_SCALE_MIN, Math.sqrt(clampCityPopulation(pop) / CITY_POP_MAX));
}

/** The city that crowd gets, without setting it — for the lobby's readout. */
export function citySizeFor(pop: number): { width: number; height: number } {
  const s = cityScaleFor(pop);
  return {
    width: Math.round(WORLD_BASE_WIDTH * s),
    height: Math.round(WORLD_BASE_HEIGHT * s),
  };
}

/**
 * How much smaller this city is than a full one, as an area fraction. What
 * `mapgen` scales its landmark and scatter *counts* by, so a small city gets
 * proportionally as much in it rather than the same amount crammed in.
 */
export function cityAreaScale(): number {
  return (WORLD_WIDTH * WORLD_HEIGHT) / (WORLD_BASE_WIDTH * WORLD_BASE_HEIGHT);
}

/** The same, on one axis — for things that line the perimeter rather than fill. */
export function cityLinearScale(): number {
  return WORLD_WIDTH / WORLD_BASE_WIDTH;
}

/**
 * Set the size of the next city. Called from `startLobby` **before**
 * `resetWorld`, which is what makes a fresh `generateMap` come out at the new
 * size; nothing may call it while a round is running, since the live nav grid,
 * room map and spatial grids are all sized to the city that is already there.
 */
export function setCityPopulation(pop: number): void {
  HUMAN_COUNT = clampCityPopulation(pop);
  const size = citySizeFor(HUMAN_COUNT);
  setWorldSize(size.width, size.height);
}

/**
 * The size on its own, without the crowd that implies it.
 *
 * **This is the client's way in, and it is the only honest one.** The client is
 * never told a population — what it is told is a `MapData`, which carries the
 * width and height the server actually built. Deriving the size from a
 * population on both ends would be the same arithmetic written twice, and the
 * day they disagree the fog, the camera clamp and the minimap all quietly
 * frame a city that is not the one on the wire. So the map is the authority and
 * this takes its word for it.
 */
export function setWorldSize(width: number, height: number): void {
  WORLD_WIDTH = width;
  WORLD_HEIGHT = height;
}
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

// ---------------------------------------------------------------- the dog
/**
 * The zombie dog. A player on the other team, never an NPC — which is why it
 * carries no traits, no perception interval and no search state: everything a
 * shambler needs those for, a person is doing with a mouse.
 *
 * It is a *zombie* everywhere it matters. Bullets find it, the crowd runs from
 * it, the danger field is sourced from it and the victory count includes it,
 * all because it goes into the world as `type: 'zombie'` with a `dog` flag on
 * it — the same shape `bot`, `swat` and `soldier` already use to make four
 * grades of officer out of one type. What is different about it is drawn, not
 * declared.
 */
/**
 * Half again the size of a zombie, and **the city sets the ceiling on this.**
 *
 * The narrowest opening anywhere is `CLEAR` in `mapgen` at 46px — the doorway
 * `repairEnclosures` cuts — and ordinary doorways are `GAP` (2) tiles, 56px. A
 * radius of 19 is a 38px body, which gets through the tightest of those with
 * four pixels either side. Push it much past 20 and the dog starts snagging in
 * doorways, and a hunting animal that cannot follow people indoors is no use
 * at all. Everything drawn is in units of this, so the art scales with it.
 */
export const DOG_RADIUS = 19;
/**
 * The unit everything *drawn* is measured in, as against `DOG_RADIUS`, which is
 * what the world collides against.
 *
 * They are deliberately different. The collision circle is capped by the
 * narrowest doorway in the city and cannot grow; how big the animal *looks* is
 * an art decision and has no business being held hostage to that. A long thin
 * body is the case that makes the split obvious — its collision circle is
 * sized by its width and its picture is sized by its length.
 */
export const DOG_ART_RADIUS = 23;
/**
 * Lower than it was. The dog's real durability is its lives — it comes back out
 * of the horde — so the body itself does not also need to soak a magazine. A
 * dog that can stand in the open trading fire with the garrison is one that
 * never has to think about where it is.
 */
export const DOG_MAX_HEALTH = 90;

/**
 * Rounds knock the dog about, but not the way they knock a shambler about.
 *
 * A shambler taking a rifle round is meant to be stopped in its tracks; a dog
 * is the thing that gets away, and a full stagger on a body that is *driven*
 * reads as the controls being taken off you rather than as being hit. So it
 * takes a shorter stagger at part strength — enough that walking into fire
 * costs you the chase, not enough to pin you while the street reloads.
 *
 * `STRENGTH` is how much of the weapon's own slow it feels: 0 is none, 1 is a
 * shambler's. The stagger a player can *see* is what matters, so both numbers
 * are deliberately generous rather than token.
 *
 * Raised from 0.55/0.5 because a dog in the open was taking fire and simply
 * leaving. A bolt action drops a shambler to 0.35 of pace and now takes the dog
 * to **0.545** — it was 0.675, which was close enough to full speed that being
 * shot was information rather than a cost. Getting away is still the dog's
 * answer to a gun; it just has to be started before the first round lands.
 */
export const DOG_STAGGER_TIME_MUL = 0.75;
export const DOG_STAGGER_STRENGTH = 0.7;

/**
 * How long the dog lies where it fell before it rises again somewhere else.
 *
 * **The body stays on screen for it.** Cutting straight to the new one gives
 * being killed no weight at all — you would simply find yourself elsewhere. The
 * window is long enough to watch your own animal go down and grey out, and then
 * for the screen to go black, which is the only part of a respawn worth
 * dramatising.
 */
export const DOG_DEATH_MS = 2400;
/** How long the screen takes to come back once it has risen. */
export const DOG_RESPAWN_FADE_MS = 520;
/** Where in the death window the fade to black begins, as a fraction of it. */
export const DOG_FADE_FROM = 0.42;
/**
 * And then the screen comes back up on the shambler you are about to come out
 * of, and you watch it happen to them.
 *
 * `DOG_DEATH_MS` is spent on your own body and ends in black. This is the other
 * half: the host is picked the moment the screen is dark, the camera is already
 * on it when the fade lifts, and it spends this window convulsing before it
 * bursts and the dog is standing there. Being killed used to be a wait; it is
 * now two things to watch with a black frame between them, which is the only
 * part of dying that was ever worth the time it took.
 *
 * It costs a second and a half on top of the death window, and that is the
 * whole price. The alternative — folding it *inside* `DOG_DEATH_MS` — buys the
 * time back by cutting short the part where you watch your own animal go down,
 * and that part is why the body stays in the world at all.
 */
export const DOG_BIRTH_MS = 1500;
/**
 * Where in the birth the arms go, as a fraction of it.
 *
 * The two halves are doing different jobs. Before it, the body is vibrating and
 * nothing else — something is wrong with it and you cannot yet see what. After
 * it the arms twist out of their sockets and the thing stops reading as a
 * person at all, which is what makes the burst an ending rather than a
 * surprise. Run them together and the whole window reads as one long shake.
 */
export const DOG_BIRTH_TWIST_FROM = 0.42;
/** What the host's body goes to as the dog comes up through it: raw meat. */
export const BIRTH_COLOR = '#7f1d1d';
/** How far the body buzzes at the very end of the birth, in world pixels. */
export const BIRTH_SHAKE_PX = 4.6;
/**
 * How far the arms come out of their sockets, in radians, at full twist.
 *
 * Past about 2 they wrap round far enough to read as a body with no arms at
 * all, which is a different and much less unpleasant picture — the point is
 * that you can see where they *should* be.
 */
export const BIRTH_ARM_TWIST = 1.7;
/**
 * How many bearings the burst throws blood along.
 *
 * It reuses `spawnBlood`, which is a cone along one angle — that is exactly
 * right for a round passing through somebody and exactly wrong for a body
 * coming apart, which has no direction at all. Six cones round the circle is
 * the whole of the difference, and it means the burst inherits the decals, the
 * droplet physics, the cap and the `settings.blood` switch without one line of
 * any of them being written twice.
 */
export const BIRTH_BURST_SPOKES = 6;
/**
 * How far through a birth a host must be for its disappearance to read as a
 * burst rather than as having simply gone out of somebody's sight.
 *
 * The dog it belongs to cannot lose sight of it — its own body is parked on the
 * thing — but `birthing` goes to everybody who can see it, and a bystander who
 * turns a corner mid-convulsion would otherwise be shown a body exploding that
 * is still standing there.
 */
export const BIRTH_BURST_AT = 0.9;

// ------------------------------------------------------------- the dog's acid
/**
 * The dog spits, and what it spits is *cover*.
 *
 * A dog has no ranged attack and nothing in its hands, so every fight it takes
 * is a fight it has to cross open ground to reach — and the garrison is spread
 * evenly across the city precisely so that crossing open ground is expensive.
 * The roar answers that by bringing the street to you; this answers it by
 * taking the street's line of sight away.
 *
 * How far it can be thrown, and the floor under a crosshair right on top of the
 * animal. Deliberately shorter than `DOG_SIGHT_RADIUS`: it must not be possible
 * to lay a cloud on ground you cannot see, or the ability turns into a way of
 * editing the map at range.
 */
export const DOG_SPIT_RANGE = 380;
export const DOG_SPIT_MIN_THROW = 90;
/** How long the gobbet is in the air. Enough to read as thrown, not as fired. */
export const DOG_SPIT_TRAVEL_MS = 420;
/**
 * Between spits.
 *
 * Long, and for the same reason `DOG_ROAR_COOLDOWN_MS` is: without one, a held
 * key lays a wall of the stuff across the whole map and there is no decision
 * left in it.
 *
 * **Longer than the roar's now**, where it used to be shorter. The three
 * numbers here move together: a cloud that has to be earned over fifteen
 * conversions, thrown a little over a third of the way across your own view,
 * is a thing you place rather than a thing you spam — and twenty-two seconds is
 * what makes the placement the decision.
 *
 * At this length **it has to survive dying**, or the cheapest way to have the
 * acid back is to go and get shot: a death and a birth together are under four
 * seconds. See `World.dogCooldowns`.
 */
export const DOG_SPIT_COOLDOWN_MS = 22000;
/**
 * How many people this dog has turned before the acid is available at all.
 *
 * Counted on `world.dogConversions`, the same tally the roar's summons spends —
 * *turned*, not bitten, banked in `convert` where a body actually becomes a
 * zombie. So both abilities are paid for in the same currency and the dog's
 * whole progression is one number: bite people, and the animal gets more
 * dangerous.
 *
 * **The tally is not spent by unlocking.** The roar spends it a charge at a
 * time; this is a threshold on the running total, so reaching it once opens the
 * ability for the rest of the round however many bodies the roar has since
 * summoned. Two abilities drawing down the same counter would make the roar
 * able to *lock the acid again*, which is nobody's idea of progression.
 */
export const DOG_SPIT_UNLOCK_AT = 15;

/**
 * How far clear of a cloud a bot officer wants to be, and how hard it tries.
 *
 * **Standing in one is the worst place an officer can be, and it does not feel
 * like it.** The cloud only slows you; what actually happens is the fog —
 * `hasLineOfSight` fails every line for a viewer inside one, so the bot is
 * blind, while the horde and the dog see straight through it. An officer stood
 * in acid is an officer being shot at by things it cannot see, and it has no
 * way of noticing on its own, because noticing is what the cloud takes away.
 *
 * `BOT_ACID_CLEAR` is measured from the cloud's *centre* against its bounding
 * radius, so it is a margin past the rim rather than a radius of its own — the
 * lumps mean the rim is not where the bounding radius is, and aiming at the
 * bounding radius exactly would leave a bot standing in a notch calling itself
 * clear.
 */
export const BOT_ACID_CLEAR = 60;

// ------------------------------------------------ the dog comes apart (F)
/**
 * The transformation, on F.
 *
 * Two seconds of vibrating on the spot while tentacles tear out of the body,
 * then twenty seconds of something much bigger, much tougher and much slower —
 * and then it bursts, into a toxic cloud and a scatter of its own parts.
 *
 * **The whole ability is a trade of speed for presence.** Everything else the
 * dog has is about arriving somewhere before the street is ready; this is about
 * being somewhere the street cannot deal with, for twenty seconds, and paying
 * for it with a life and four minutes.
 */
export const DOG_MORPH_WINDUP_MS = 2000;
export const DOG_MORPH_MS = 20000;
export const DOG_MORPH_COOLDOWN_MS = 250000;
/**
 * What a round does to it *during the wind-up* — a tenth of the damage.
 *
 * The wind-up is the only genuinely helpless moment the ability has: rooted,
 * vibrating, in the open, and for two full seconds. Without the reduction the
 * counter to a four-minute ability is "shoot it while it stands still", which
 * would mean it never completed in front of anybody worth using it on. The
 * payoff afterwards is the health rather than more armour, so the transformed
 * form takes rounds like anything else.
 */
export const DOG_MORPH_DAMAGE_MUL = 0.1;
/** Six times the health it had. Set on completion and taken back on the burst. */
export const DOG_MORPH_HEALTH_MUL = 6;
/**
 * And much slower on the sprint, which is the cost that is *felt*.
 *
 * A dog's ordinary sprint (`DOG_SPRINT_MULTIPLIER`) is what wins it every
 * flat-out chase in the game. At this size it is a thing that arrives rather
 * than a thing that catches you, so the sprint is barely faster than the walk —
 * you commit to the ground you are on for twenty seconds.
 */
export const DOG_MORPH_SPRINT_MUL = 1.12;
/**
 * How much bigger it *looks*, and how much bigger it actually *is*.
 *
 * **These are deliberately very different numbers**, and it is the same split
 * `DOG_RADIUS` and `DOG_ART_RADIUS` already make. How big it looks is an art
 * decision. How big it collides is capped by the narrowest doorway a city
 * generates — `CLEAR` in `mapgen` is 46px — and a monster that cannot follow
 * anybody indoors is a monster that spends its twenty seconds in the street.
 * Worse, one that transformed *inside* a building would be walled into it for
 * the whole of them.
 *
 * So the drawing nearly doubles and the body grows by four pixels.
 */
export const DOG_MORPH_ART_MUL = 1.85;
/**
 * **21, and it cannot be much more.** `DOG_RADIUS` is 19 — a *radius*, so a
 * 38px body — and the tightest opening a city cuts is 46px. 21 is a 42px body
 * with two pixels either side; 22 does not fit at all.
 *
 * The first value written here was 42, on a misreading of the same figure as a
 * diameter, which would have been an 84px body squeezing through a 46px gap:
 * a monster walled out of every building in the city, and walled *into* one if
 * it transformed indoors. The drawing nearly doubles instead — see
 * `DOG_MORPH_ART_MUL` — and `morphcheck.ts` asserts the doorway sum rather
 * than the number, so the next person to raise this is told why they cannot.
 */
export const DOG_MORPH_RADIUS = 21;
/**
 * How many humans the **whole outbreak** has to have turned before F exists —
 * `world.totalConverted`, one counter shared by every zombie in the city and
 * every dog in the lobby.
 *
 * **Turned, and by anyone**, which is deliberately not a per-dog figure. The
 * acid (`DOG_SPIT_UNLOCK_AT`) is earned by *this* dog's own reach; the
 * transformation is earned by how far the outbreak itself has got — a shambler
 * finishing a bite counts exactly as much as this dog's own jaws do, and
 * "yourself" is already inside "the outbreak" rather than a clause of its own.
 * That is what makes it reachable in a round going badly for one dog in
 * particular: the city crossing the line opens it for everybody, whatever any
 * single animal has personally done.
 *
 * 101 rather than a rounder number, because a round number reads as a target
 * to chase and this is meant to read as a threshold the *city* crosses, almost
 * by accident, partway through an outbreak that is already going hard.
 */
export const DOG_MORPH_UNLOCK_CONVERTED = 101;

/**
 * The tentacle lash: F again while transformed.
 *
 * Medium range, aimed at the cursor, and it **infects** whoever it lands on
 * rather than damaging them — the transformed dog is slow, so its reach is how
 * it does its work. Shorter than the acid's throw and much shorter than a
 * sniper's, so the officers' answer is still distance.
 */
export const DOG_LASH_RANGE = 300;
/**
 * **Not in the spec, and it needs one.** Without a cooldown F is a key you hold
 * to infect everybody in the street inside a second and a half, which is not a
 * lash, it is a hose. Two thirds of a second is a rhythm you can feel and about
 * thirty reaches over the twenty seconds.
 */
export const DOG_LASH_COOLDOWN_MS = 850;
/** How long an impact flash stays on screen after the arms have gone home. */
export const DOG_LASH_SHOW_MS = 220;

/**
 * **The strike is telegraphed, and the telegraph is the whole point.**
 *
 * The tentacles on the thing's back coil for `DOG_LASH_WINDUP_MS`, a red ring
 * grows on the ground where they are going to land, and only then do they go
 * out. That ring is what makes the ability *dodgeable* rather than a hitscan
 * nobody can answer — see `DOG_LASH_IMPACT_RADIUS`.
 *
 * **The aim point is locked when the key goes down and never re-read.** A ring
 * that tracked the cursor would be a warning of nothing: whatever it showed
 * you, the strike would still land wherever the mouse had got to. Locking it is
 * what turns the ring from decoration into information.
 *
 * **420 is derived from the dodge, not picked by eye**, and the first value
 * tried was 340 because 340 *looks* like a telegraph. Getting out of a
 * `DOG_LASH_IMPACT_RADIUS` circle from dead centre means putting your own
 * centre past 48 + a 12px body = **60px**, which at `PLAYER_SPEED` (160) takes
 * **375ms** walking and 221ms sprinting. At 340 a walking player covers 54px —
 * six short — so being caught in the middle of one could only ever be answered
 * by a sprint, which is a telegraph most people cannot answer while they are
 * also being shot at. At 420 a walk clears it with 7px to spare and a sprint is
 * comfortable. A **civilian** covers 15px and cannot dodge at all, which is
 * correct rather than a shortfall: they are the crowd this ability is for, and
 * nothing about the ring was ever meant to save them.
 *
 * The cooldown covers windup + strike + snap-back with room to spare (850
 * against 420 + 110 + 260 = 790), so one strike is fully back on the animal
 * before the next coils. It was 650, which fired again mid-recovery — fine
 * while the lash was an instant line, and wrong now that the limbs are the
 * drawing.
 */
export const DOG_LASH_WINDUP_MS = 420;
/** And how long they take to reach the spot once they let go. */
export const DOG_LASH_STRIKE_MS = 110;
/** Then back onto its back, which is a picture rather than a mechanic. */
export const DOG_LASH_RECOVER_MS = 260;
/**
 * How wide the impact is — **and it is deliberately a circle, not a line.**
 *
 * The old lash swept a 26px corridor down its whole length and took the first
 * body along it, which is a hitscan: there is nowhere to stand that is safe and
 * nothing a warning could usefully have shown. A landing point with a radius is
 * a *place*, and a place can be stepped out of — which is what the ring is
 * drawn around and what the ability was asked to become.
 *
 * 48 against an officer's 12-pixel body: a couple of people caught if they are
 * stood together, one if they are not.
 */
export const DOG_LASH_IMPACT_RADIUS = 48;
/**
 * How many of the back tentacles go out on a strike, of `DOG_MORPH_TENTACLES`.
 *
 * Not all of them, for the same reason `ZOMBIE_SPREAD_SHARE` is not 1: a body
 * that throws its whole silhouette at one spot has no silhouette left, and the
 * thing stops reading as a mass of limbs and starts reading as a firework. The
 * three that go are picked off the strike's own id, so it is a different three
 * each time and the drawing does not develop a favourite side.
 */
export const DOG_LASH_STRIKE_ARMS = 3;
/**
 * How far back an arm draws before it goes, as a share of its idle reach.
 *
 * The recoil is what makes the launch read as a launch. Without it the arms
 * simply lengthen, which is the same picture as the wind-up of the
 * transformation and says nothing about direction — a limb that draws back is a
 * limb about to be thrown, and it is the half of the tell that is legible from
 * behind the animal, where the ground ring may be off the edge of the screen.
 *
 * **0.9 rather than the 0.35 first written, and the rig is what said so.**
 * A *gather* — the arm shortening to a third of itself while turning away — is
 * what a limb loading actually does, and at this size it is invisible: the five
 * arms that are not striking still fan out in every direction and bury it.
 * Measured as the shift in where the mass of the drawing sits along the axis to
 * the landing point, a 0.35 gather moved it **+0.3px** — nothing, and the wrong
 * way. Drawn back to nearly its full length *pointing away from the target*,
 * three arms make a bundle behind the animal that is plainly a thing being
 * loaded.
 */
export const DOG_LASH_COIL = 0.9;
/**
 * The shove. **Everybody the strike catches is pushed, armoured or not** — the
 * armour is about the infection, not about being hit by a limb the width of a
 * leg.
 *
 * Applied as an impulse that decays over `DOG_LASH_PUSH_MS` rather than as a
 * displacement: a body that jumps 30px between two ticks reads as a teleport,
 * and one that covers it over a fifth of a second reads as having been hit.
 * Small on purpose — this is a stagger, not a launcher blast, and the officers'
 * answer to the transformed dog is still distance.
 */
export const DOG_LASH_PUSH = 210;
export const DOG_LASH_PUSH_MS = 220;
/**
 * How fast a shove bleeds off — `e^-rate*t`, so about a tenth of it is left
 * after a quarter of a second. Shared by anything that ever wants to knock a
 * body about; the tentacle strike is the only caller today.
 */
export const KNOCKBACK_DECAY = 9;

/**
 * The burst.
 *
 * A toxic cloud where it stood, and its own tentacles thrown out on grenade
 * physics — the same `bouncesOff` and `GRENADE_BOUNCE` the charges and the
 * gobbet use, so they come off walls rather than through them.
 */
export const DOG_BURST_CLOUD_MUL = 1.6;
export const DOG_BURST_TENTACLES = 8;
/** How far a thrown tentacle travels, and how long it is in the air. */
export const DOG_BURST_THROW = 230;
export const DOG_BURST_FLIGHT_MS = 620;
/** And how long the pieces lie there before they fade. */
export const DOG_BURST_LIE_MS = 4200;
/** How many tentacles a transformed dog is drawn with. Client-side only. */
export const DOG_MORPH_TENTACLES = 8;
/**
 * How long a cloud sits there, and how wide it gets.
 *
 * The radius is set against `DOOR_BLOCK_RADIUS` and the width of a street
 * rather than picked to look right — a cloud that does not span the road it is
 * laid across blocks nothing, and one that spans two of them is a wall.
 */
export const ACID_CLOUD_MS = 9000;
export const ACID_CLOUD_RADIUS = 130;
/** How long it takes to boil out to that from the gobbet that landed. */
export const ACID_GROW_MS = 600;
/**
 * **A cloud is a cluster of overlapping circles, not one disc**, and these are
 * its shape. `shared/acidshape.ts` is the one function that reads them, and the
 * server's sight lines, the client's fog polygon and the client's drawing all
 * go through it — so what looks solid is exactly what occludes.
 *
 * A lobe is a `Bush`: making the cloud lumpy has exactly one honest form, which
 * is *more circles*, because a circle is the only occluder shape both halves of
 * this game already know how to handle. Seven is a core and six petals — fewer
 * and the notches between them are wide enough to see a street through, more
 * and the union closes back up into the disc it was.
 *
 * The distances and radii are fractions of `ACID_CLOUD_RADIUS`, and the jitter
 * is how far off its even bearing each petal is knocked. Left even, the notches
 * are evenly spaced too and the thing reads as a flower — the same lesson the
 * dog's ribs and the park's edge each had to learn.
 */
export const ACID_LOBE_COUNT = 7;
export const ACID_LOBE_CORE = 0.54;
export const ACID_LOBE_DIST_MIN = 0.32;
export const ACID_LOBE_DIST_SPAN = 0.22;
export const ACID_LOBE_R_MIN = 0.44;
export const ACID_LOBE_R_SPAN = 0.22;
export const ACID_LOBE_JITTER = 0.9;
/**
 * **Inside a cloud you see nothing**, and this is how far "nothing" is drawn.
 *
 * The rule itself lives on the server, in `hasLineOfSight`: anybody who is not
 * a zombie and whose own position is inside a cloud fails every sight line they
 * ask about, so they are sent no entities, no loot and no tracers at all. This
 * number is the client's half of saying so — the fog hole is pulled in to about
 * an arm's length rather than being closed outright.
 *
 * **Closing it outright is the one thing not to do.** A visibility polygon with
 * nothing in it collapses onto the viewer, and a collapsed polygon is exactly
 * what the two worst rendering faults in this game's history looked like from
 * the outside: the whole world at 8% through a fog fill that is 0.92 rather
 * than opaque. Leaving a small genuine hole makes being blind read as being
 * blind rather than as the renderer having given up.
 */
export const ACID_INSIDE_SIGHT = 46;
/** Where in its life it starts thinning away, as a fraction. */
export const ACID_FADE_FROM = 0.72;
/**
 * What it does to anyone caught in it, as a multiplier on their pace.
 *
 * Applied in `speedAt`, which is the one function every mover in the game
 * already goes through, and it therefore covers civilians, the garrison, bots
 * and players from a single line. **Zombies and the dog are exempt** — it comes
 * out of one of them, and a weapon that slows your own horde is a weapon
 * nobody spends a cooldown on.
 *
 * Harsher than a bush (0.65) and about what burning costs, because unlike
 * either of those it is aimed.
 */
export const ACID_SLOW_MUL = 0.55;
/**
 * How close to where the gobbet actually lands you have to be for it to go over
 * you rather than merely near you.
 *
 * **Much smaller than the cloud**, and that gap is the whole ability. The cloud
 * is an area everybody works around; the splash is a wet moment that catches
 * whoever was standing exactly there, and only it takes somebody out of the
 * fight. Make them the same number and the ability stops being aimed at
 * anything — it becomes a stun grenade with a nine-second tail.
 */
export const ACID_IMPACT_RADIUS = 62;
/** How long somebody it went over is left rubbing their eyes. */
export const ACID_BLIND_MS = 2600;
/**
 * They look around and they do not move — so, rarely, they say why.
 *
 * Rolled once, at the moment the acid lands, rather than per tick while they
 * are blind. Everything in this game with a chance on it has to be, or a "rare"
 * reaction evaluated thirty times a second is one that always happens.
 */
export const ACID_BLIND_LINE_CHANCE = 0.22;
export const ACID_BLIND_LINE = "I can't see!";
/**
 * How fast a blinded head sweeps, in radians per second, and how far either
 * way.
 *
 * It is the only thing they do, so it has to read as searching rather than as
 * scanning: slow enough to look like somebody who has lost something, and well
 * short of a full turn, because a body spinning on the spot reads as a bug.
 */
export const ACID_BLIND_SWEEP_RATE = 1.15;
export const ACID_BLIND_SWEEP_ARC = 1.25;
/**
 * Quicker than an officer flat out, and that is the whole chase.
 *
 * A dog that cannot run one down never gets to bite anybody; a dog that can do
 * it indefinitely makes running away pointless. So it wins the sprint and pays
 * for it — its reserve empties half again as fast as an officer's and fills
 * more slowly, so a chase is a handful of seconds and then a decision.
 */
export const DOG_SPEED = 182;
export const DOG_SPRINT_MULTIPLIER = 1.8;
export const DOG_STAMINA_DRAIN_PER_SEC = 62;
export const DOG_STAMINA_REGEN_PER_SEC = 8;

/**
 * The body swings after the head, and that gap is the whole feel of the thing.
 *
 * Both ease toward the mouse and the head simply gets there first — it is not
 * a separate input, and there is nothing to aim independently. What stops it
 * being a turret on a chassis is `DOG_HEAD_MAX_YAW`: past that the neck is out
 * of travel and the head can only go where the body takes it, so whipping the
 * mouse round throws the head across, drags the shoulders after it and the
 * back end comes round last.
 */
export const DOG_BODY_TURN_RATE = 6.2; // rad/s
export const DOG_HEAD_TURN_RATE = 13; // rad/s
export const DOG_HEAD_MAX_YAW = 1.05; // ~60° off the spine, either way
/** Anchored by its own teeth, it pivots rather than turns. */
export const DOG_LATCHED_TURN_MUL = 0.55;

/**
 * The jaws are on the head, not on the flanks: a bite only reaches what is in
 * front of the muzzle, inside `DOG_BITE_ARC` of where the head is pointing.
 */
/**
 * How far forward of the body centre the jaws actually are, in radii. It has to
 * match where `render.ts` puts the head, or the bite lands somewhere other than
 * where the teeth are drawn — which is unreadable from the outside and reads as
 * the reach being wrong.
 */
export const DOG_MUZZLE_OUT = 1.25;

/**
 * What the city's standing garrison does to a dog: never misses it, and hits it
 * 84% harder than it hits anything else.
 *
 * A rule about the map rather than about marksmanship. A dog that can outrun
 * everything will always find the quarter with nobody in it and start an
 * outbreak there long before help can cross the city — spreading the garrison
 * evenly is half the answer, and each of them being genuinely dangerous when
 * you get there is the other half. Only the officers the city *started* with:
 * anyone a radio call sent afterwards is the response, not the deterrent.
 *
 * **It went 1.6 → 1.84, which is 15% more damage rather than 15 points of
 * multiplier**, alongside the dog's camera being pulled out to 1.5. Those are
 * one change: the camera hands the dog more warning of the garrison, so the
 * garrison hits harder when it is reached. Widening the view without this is a
 * straight buff to the seat that was already winning every flat-out chase.
 */
export const CITY_OFFICER_DOG_DAMAGE_MUL = 1.84;

/**
 * Fire is the flamethrower's answer to an outbreak, and the infected are what
 * it is for.
 *
 * Somebody already bitten burns *like* the dead — the civilian floor that makes
 * burning the healthy impossible does not cover them — and this much harder
 * than the dead on top. That gives the weapon a job nothing else has: the
 * charge rifle takes one carrier at a time and the cure gun saves one at a
 * time, where a stream across a crowd that is half turned already stops the
 * next thirty seconds happening at all.
 *
 * It comes with the sight to aim it: a flamethrower **in hand** picks the
 * infected out of a crowd, the same narrow hole in the fog the cure gun punches
 * and for the same reason — a weapon that answers a problem nobody can see is a
 * weapon nobody uses.
 */
export const FLAME_INFECTED_DAMAGE_MUL = 1.6;

/**
 * How far the head may swing before the body bothers to follow.
 *
 * The dead space is the whole character of the neck: inside it the head turns
 * on its own and the body does not stir at all, which is what a dog watching
 * something looks like. Past it the shoulders come round, and they come to rest
 * exactly this far behind — so a sweep always leaves the head leading.
 */
export const DOG_BODY_DEADZONE = 0.18; // ~10°
export const DOG_BITE_REACH = 26;
export const DOG_BITE_ARC = 0.95;
/**
 * **The bite is held, not snapped.** The trigger holds the mouth open for up to
 * this long and the first body to walk into it is taken; let go, or run out the
 * clock, and the jaws shut and have to recover.
 *
 * It used to be a snap on the click, which made the whole move a timing test
 * against a 30Hz tick — and reduced the animal to a mouse button. Holding the
 * jaws open moves the skill to where it belongs, which is putting the dog in
 * the right place and pointing its head at somebody, and it is also simply what
 * a dog charging you looks like.
 */
export const DOG_JAWS_OPEN_MS = 2000;
/**
 * And it is a long recovery, because the open window is generous. Two seconds
 * of jaws followed by nearly two of nothing is the rhythm — a dog that misses
 * has to disengage and come round again rather than gnashing on the spot.
 */
export const DOG_BITE_COOLDOWN_MS = 1800;
/**
 * What the jaws take out of a door when they shut on one.
 *
 * **Once per open-and-shut**, not per tick — the mouth is held open now, and
 * chewing continuously while it is would take a door off its hinges in a
 * second. So the efficient way through a door is to tap: open, shut, wait out
 * the recovery, again. Holding is for catching people, tapping is for wood, and
 * the same button does both without a mode.
 *
 * A shut door has to *delay* a dog rather than stop it — one that follows
 * people indoors and then loses them to a door anybody can pull is beaten by a
 * door handle, and the shamblers have been tearing at doors since long before
 * it existed. Sized so `DOOR_HEALTH` 1600 takes four bites, which at the
 * recovery between them is a handful of seconds of standing at it.
 */
export const DOG_DOOR_DAMAGE = 420;
/**
 * How long the jaws have to stay in before the infection takes.
 *
 * Deliberately far longer than a zombie's two seconds, because unlike a
 * shambler the dog has something to *do* about it: shaking is what brings the
 * clock in, down to `DOG_BITE_MIN_MS` at the very fastest. Hang on doing
 * nothing and it is the slowest bite in the game.
 */
export const DOG_BITE_MS = 3600;
export const DOG_BITE_MIN_MS = 900;
/**
 * How much of the clock one radian of shaking takes off.
 *
 * A shake is a *reversal*, not travel: a steady sweep of the mouse credits
 * nothing until it comes back the other way, or a player who simply spun in
 * circles would shorten a bite as fast as one who worried at it. See
 * `DOG_WIGGLE_MIN_RAD` — a run shorter than that is a twitch, not a shake, and
 * it stops a jittering hand earning anything.
 */
export const DOG_WIGGLE_MS_PER_RAD = 620;
export const DOG_WIGGLE_MIN_RAD = 0.12;
/**
 * How hard the victim is dragged onto the jaw point each tick, and how far
 * sideways a shake throws them. The drag is what makes a latched dog a thing
 * you are attached to rather than a thing standing next to you.
 */
export const DOG_DRAG_PULL = 0.5;
export const DOG_SHAKE_THROW = 26;

// ------------------------------------------------------------- the dog's belt

/**
 * How many ability slots the dog's HUD draws, left to right on Q, E, R and F.
 *
 * The number is the *bar*, not how many are filled: three of them are empty
 * outlines today. Drawing the empty ones is the point — a bar that grew a
 * hexagon at a time would shift the ones already on it every time one was
 * added, and the whole value of a fixed row is that a key is always in the
 * same place.
 *
 * **Not Q, W, E, R, because `KeyW` walks the dog north.** The row skips W and
 * takes F on the end instead. Which keys they are is the client's business —
 * `DOG_ABILITY_KEYS` in `main.ts` — and the wire deliberately carries only the
 * slot index, so moving them is a one-line change on one side.
 */
export const DOG_ABILITY_SLOTS = 4;

/**
 * The roar: two seconds of standing still, and then the street comes.
 *
 * Rooted for the whole of it — the head still tracks the cursor, because what
 * is being aimed is the *direction the horde is sent in*, and an ability that
 * made you commit to a bearing before you had seen what happened would be a
 * poor one. The legs are what is given up, and two seconds of a dog not moving
 * in a city with a garrison in it is the whole cost of the nearest-twenty half.
 */
export const DOG_ROAR_MS = 2000;

/**
 * How long before it can be roared again.
 *
 * **Not part of the ability as it was asked for**, and the one thing here that
 * was added rather than specified. Without it the nearest-twenty half is free —
 * it costs no charges — so a dog holding Q would herd the whole horde on a
 * two-second loop, and a hexagon with nothing to fill would have nothing to
 * say. Short enough to be a rhythm rather than a resource; set it to 0 to get
 * the ability exactly as it was described.
 */
export const DOG_ROAR_COOLDOWN_MS = 8000;

/**
 * How many shamblers already on the map answer it, and how far a roar carries.
 *
 * The count is the number that was asked for. The **range** is the other thing
 * added: "the nearest twenty" with no distance on it is a summons the whole
 * city can hear, which makes the horde one object with no geography to it and
 * makes the second half of the ability — walking bodies in from the edge —
 * pointless. It is deliberately generous, well past `DOG_SIGHT_RADIUS`, so
 * what it excludes is the far side of the map rather than the next street.
 */
export const DOG_ROAR_CALL_COUNT = 20;
export const DOG_ROAR_RANGE = 2000;

/**
 * How long an order given by a roar stands before they go back to their own
 * business.
 *
 * It rides `lastSeen`, which is the field `followTheChase` borrows and the
 * branch that already walks a zombie to a place it saw somebody at — so the
 * order is an *attack move* for free: prey spotted on the way is chased
 * instead, and arriving drops it. `ZOMBIE_LAST_SEEN_MS` (9s) is nowhere near
 * enough for a body summoned at the map edge, which may have four thousand
 * pixels to cover.
 *
 * **The cost of a long one is real and is written down under `lastSeen`**:
 * that branch sits above every check that would notice a zombie getting
 * nowhere, so an order at an unreachable spot is a stall for exactly this long.
 * Which is why `roarTarget` refuses to issue one at a spot off the walkable
 * map and walks it to the nearest place a body could actually stand.
 */
export const DOG_ROAR_ORDER_MS = 30000;

/**
 * Where the summoned come in, along the edge the outbreak walked in from.
 *
 * Spread rather than stacked: a column of bodies arriving on one pixel is a
 * pile collision then spends a second sorting out, and a breach is a breach
 * rather than a door.
 */
export const DOG_ROAR_SUMMON_SPREAD = 260;

/** The rings thrown off the muzzle while it roars, and how far they carry. */
export const DOG_ROAR_RING_MS = 900;
export const DOG_ROAR_RING_REACH = 190;

// ------------------------------------------------------- the dog's minimap

/**
 * The corner map, and what it is allowed to tell you.
 *
 * A dog has no radio, no beacon handset and no binoculars — it is the one seat
 * in the game with nothing in its hands — so it had no way at all to know where
 * the city was defended from. That is a balance problem rather than a comfort
 * one: an animal that outruns everything will always find the empty quarter,
 * and it should be *choosing* to, not stumbling into it.
 *
 * **The rule is that the horde sees for you, and nothing else does.** An
 * officer appears only while a zombie is close enough to have laid eyes on
 * them, which is why the range is `ZOMBIE_SIGHT_RADIUS` and not a number picked
 * for the map. So the map is a picture of where your own outbreak is *making
 * contact* — it rewards having sent the horde somewhere, and it is useless for
 * finding a quiet officer in a quiet street, which is exactly the cheating the
 * map must not enable.
 *
 * It is **geodesic**, off the danger field, not straight-line: an officer stood
 * on the other side of a wall from a shambler has not been seen by it. That is
 * the same reason `danger.ts` exists at all, and it makes the check one array
 * lookup per officer rather than a spatial query per officer.
 */
export const DOG_MAP_CONTACT_RANGE = ZOMBIE_SIGHT_RADIUS;

/**
 * How often the contact list is rebuilt, against the danger field's own 160ms.
 *
 * Deliberately *slower* than the field it reads: recomputing more often than
 * the source changes buys a fresher copy of the same answer. It is also the
 * whole of what makes this cheap — the wire carries the cached list every
 * snapshot because it is a handful of rounded integers, and the walk that
 * builds it happens four times a second.
 */
export const DOG_MAP_REFRESH_MS = 250;

/**
 * How big the map is drawn, on its longer axis, and how far off the corner.
 *
 * One box whatever the city's shape: the aspect is taken from the map the
 * server actually built, so a small city is drawn smaller rather than stretched
 * — see **The city is not one size**.
 */
export const DOG_MAP_SIZE = 190;
export const DOG_MAP_MARGIN = 14;

/**
 * Its coat, and what is left of it.
 *
 * Deliberately close together and all very dark bar two: the eyes and the
 * bone. A body drawn in six colours of similar weight reads as a toy, and the
 * whole point of the animal is that the only things you can pick out of the
 * dark are its teeth and what it is looking at you with.
 */
export const DOG_BODY_COLOR = '#3a342d'; // the back — charcoal with the brown left in
export const DOG_FUR_COLOR = '#4e463a'; // the saddle down the spine, a shade up
export const DOG_HEAD_COLOR = '#5b452f'; // warmer, the way a shepherd's face is
/**
 * The tentacles that come out of a transforming one — raw, and a good deal
 * warmer than the hide. They have just torn their way out of it, so they are
 * the one part of the animal that is *not* shaded well down: the rule about
 * keeping the eye on the head does not apply to a thing that is meant to read
 * as the body failing.
 */
export const DOG_TENTACLE_COLOR = '#7e2c30';
/**
 * The ring on the ground under a coiled strike. **Client-side only.**
 *
 * Red because it is the one colour on this map that already means "the dead",
 * and because the ring has to be read in a fifth of a second by somebody who is
 * also being shot at — a subtle telegraph is not a telegraph. It is drawn on
 * the *ground*, under the bodies, so the officer standing in it is on top of
 * their own warning rather than hidden by it.
 *
 * Two parts and they say different things: the rim is where the edge of the
 * impact is, and the fill sweeping round it is how long there is left. A ring
 * that only pulsed would say "danger here" without ever saying "now", which is
 * the half a dodge actually needs.
 */
export const LASH_WARN_COLOR = '#d4373d';
export const LASH_WARN_RIM = 2.6;
/**
 * A strike that hit nothing still has to have happened.
 *
 * A gouge in the road and two or three chips of it thrown up — the smallest
 * thing that turns a miss from "the ability did nothing" into "it missed", and
 * the reason a dodge is worth making rather than merely surviving. Thrown
 * client-side off the strike landing, exactly as blood is thrown off `Shot.hit`
 * and the gore off a birth host leaving the snapshot.
 */
export const LASH_CHIP_COUNT = 3;
export const LASH_CHIP_MS = 620;
export const LASH_CHIP_SPEED = 130;
/** How long the gouge stays. Shorter than blood: it is a scuff, not a stain. */
export const LASH_GOUGE_MS = 16000;
export const LASH_GOUGE_COLOR = '#15181c';
export const LASH_CHIP_COLOR = '#6a6255';
export const DOG_DECAY_COLOR = '#8b8d74'; // hide gone off: sickly, pale, greenish
export const DOG_ROT_COLOR = '#6d4232';
export const DOG_MAW_COLOR = '#4a1418'; // down its throat, and inside the flank
export const DOG_BONE_COLOR = '#cfc7ad';
export const DOG_EYE_COLOR = '#ffd23d';

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

/**
 * A ceiling on how many of one thing a city may hold — the third of the set,
 * after `ONE_OFF_ITEMS` (a quota, exactly one) and `GUARANTEE_EVERY_*` (a
 * floor, at least one).
 *
 * **The radio is here because rarity is a weight, not a scarcity.** At 2 of 37
 * entries in `UTILITY_LOOT` it takes 5.4% of every utility roll, and a city
 * makes that roll once per building — so the expected number is about three
 * and six is an ordinary run of luck. Measured over ten cities before this
 * existed: min 1, median 3, max 6, with five of the ten holding three or more.
 * Each one is a van, a SWAT team and two patrol cars, and three vans arriving
 * in a round is not a rare event to be enjoyed, it is the garrison's problem
 * being solved from a pocket.
 *
 * **Lowering the rarity would not have done it.** That makes three less
 * likely without making it impossible, and it also makes the radio scarcer in
 * the ordinary case, which is not the complaint — one or two is right. A
 * ceiling leaves the common case exactly as it was and cuts only the tail.
 *
 * It has to cover every way onto the map or it leaks: the building roll, the
 * park stash and the pond bank all draw from a table and are all capped
 * through one `drawItem` in `spawnPickups`. The every-utility floor is safe
 * without being told, since it only ever fires when the city has none at all.
 * The debug heap is deliberately outside it — that is one of everything at a
 * player's feet and is not the city's loot.
 */
export const ITEM_CITY_CAP: Partial<Record<string, number>> = {
  radio: 2,
};

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

/**
 * A lobby's join code. Four letters is the whole of getting into somebody
 * else's game: it is what they read out or paste to you and, since there is no
 * browse list any more, the only way in at all.
 */
export const LOBBY_CODE_LENGTH = 4;
/**
 * Vowels are deliberately left out. Four letters drawn from the whole alphabet
 * spell a word often enough to matter, and the time it does is the time it is a
 * rude one on a stranger's screen — with no vowels it cannot happen. Twenty
 * letters at four places is 160,000 codes against a handful ever live at once,
 * so a collision is a formality to retry rather than a pressure on the length.
 */
export const LOBBY_CODE_ALPHABET = 'BCDFGHJKLMNPQRSTVWXZ';

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

// ------------------------------------------------ raiding the corner complex
/**
 * How near a bot has to come to the corner complex before it knows what is in
 * it, and goes in after it.
 *
 * **Walking past it is the trigger, and the trigger is the design.** A bot
 * that knew about the complex from the moment the round started would set off
 * across the city for it and the landmark would stop being somewhere you come
 * across — every round would open with four officers filing into one corner.
 * So it is knowledge you acquire by being there, which is also the only kind
 * an officer plausibly has: you can see it is a big building from the street.
 *
 * Generous against `BOT_LOOT_RANGE` (1400) on purpose. Loot is scored on what
 * a bot can see lying about; the whole point of the complex is that the good
 * things in it are several partitions in, where nothing is going to turn up in
 * a scan of what is nearby until the bot is already inside.
 */
export const BOT_COMPLEX_NOTICE = 900;
/**
 * How long a raid gets before the bot gives it up and goes back to being an
 * officer, and how long it then leaves the place alone.
 *
 * One budget for the whole raid, never extended — the same shape as
 * `HIDE_DEEPER_GIVE_UP_MS` and `RALLY_ROOM_GIVE_UP_MS`, and for the same
 * reason: what bounds a ping-pong at a doorway is a clock that does not care
 * how the room underfoot is read. Long, because the point of the building is
 * that it takes a while to get through, and a raid that expires in the hallway
 * is a bot that walked in and out of a landmark for nothing.
 */
export const BOT_COMPLEX_RAID_MS = 150000;
/**
 * And how long before it would consider the place again. Long enough that a
 * bot which has stripped it is not straight back in, short enough that a raid
 * broken off by a horde can be resumed later in the round.
 */
export const BOT_COMPLEX_SNUB_MS = 120000;
/** Close enough to a room's own interior point to count as being in it. */
export const BOT_COMPLEX_ROOM_REACH = 40;
/**
 * How much of a raid is spent going in before it turns round and leaves.
 *
 * **Knowing the way out is half of the ask**, and it is deliberately not left
 * to the router: the same one-long-route problem that put a rallied crowd
 * against an outside wall puts a bot in a back room grinding at a partition,
 * and the fix is the same — one doorway at a time, outward down `Room.depth`,
 * until the street door is the next hop. Reserving the last of the budget for
 * it is what stops a raid ending with the bot simply switching off deep inside
 * a landmark when the clock runs out.
 */
export const BOT_COMPLEX_LEAVE_AT = 0.7;
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
/**
 * How much cheaper the target you already have is than a fresh one.
 *
 * **This is the damping on `ZOMBIE_SPREAD_PENALTY`, and without it the two of
 * them are an oscillator.** `world.targetClaims` is rebuilt every tick from
 * everybody's current `targetId` and every zombie re-picks at
 * `SENSE_INTERVAL_MS`, so each one is playing best-response against a count
 * its neighbours are changing underneath it: A leaves P for Q, P's claim drops,
 * P is attractive again, and A comes back. That is the standard congestion-game
 * loop, and on screen it is a horde that cannot make its mind up — several
 * target changes a second, sometimes on consecutive perception ticks.
 *
 * Discounting your own claim (in `senseTarget`) stops you talking yourself off
 * your own target, but it only makes the incumbent *neutral*. Neutral flips on
 * any wobble: two prey drifting past each other in distance, or one neighbour's
 * decision applying or removing a whole `ZOMBIE_SPREAD_PENALTY` on one of
 * them. A margin is what makes it *sticky* — a new target has to be meaningfully
 * better rather than merely better, so claim churn alone stops being enough to
 * move anybody, while somebody walking into your face still is.
 *
 * **A margin rather than a change budget**, which was the other candidate:
 * capping a zombie to N switches and then locking it out for a few seconds
 * leaves the oscillator running — it re-enters the loop the moment the lockout
 * expires — refuses good switches as readily as bad ones, and needs carve-outs
 * for the target dying, leaving sight, or the pack filling up, which is the tell
 * that the rule is fighting the code rather than fixing it. Same shape as
 * `BOT_BOLT_DIST` → `BOT_SAFE_DIST`, as `BOT_SWAP_MARGIN`, and as
 * `longestGun` killing the gun flip-flop: the cure for dithering on a line is
 * a margin, three times now.
 *
 * It applies to every zombie, not only the `spreadsOut` ones — a dull zombie
 * dithering between two equidistant people looks exactly the same on screen.
 */
export const ZOMBIE_TARGET_STICK = 0.7;


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
/**
 * How long one grab lasts: 1s at the shortest, **2s at the very longest**.
 *
 * The roll is the average of two randoms rather than one, which makes it
 * triangular — mode and mean both land in the middle of the range and the ends
 * are rare. A flat roll would give the same average while making the shortest
 * scuffle and the longest pin equally common, and the whole point of the
 * figure is that a grab has a *typical* length you can learn.
 *
 * The ceiling came down 3s → 2s, so the typical grab is now 1.5s rather than
 * 2.0s. Note what that does to the rest of this block: a grab is half the
 * event it was in duration, so the odds attached to one had to go up or the
 * infection rate would have quietly halved with it.
 */
export const GRAPPLE_MIN_MS = 1000;
export const GRAPPLE_MAX_MS = 2000;
/** Once a victim has this many attackers, other zombies go find their own. */
export const MAX_GRAPPLERS = 3;
/**
 * Held by this many at once and it is over: the escape roll is skipped
 * entirely rather than merely made unlikely, the grip is pulled in to
 * `GRAPPLE_PILE_TURN_MS`, and it ends in a turn rather than in a roll.
 *
 * One threshold for all three deliberately, rather than three numbers that
 * happen to be 3. Being swarmed is a single state — it is the moment the
 * fight stops being a fight — and split across separate constants they would
 * drift apart and leave a pile you cannot escape but can survive, or one that
 * turns you without ever having been unescapable.
 *
 * It is the same figure as `MAX_GRAPPLERS`, so in practice "three or more"
 * is exactly three: nothing lets a fourth get hold.
 */
export const GRAPPLE_NO_ESCAPE_AT = 3;
/**
 * And how long you have once that many have you. A pile is not a longer
 * version of a grab, it is a different outcome arriving sooner.
 *
 * Applied as a **floor pulled in, never a deadline pushed out** — see
 * `attemptGrab`. The rule that a joining zombie cannot lengthen a grip is
 * older than this one and still holds; the third one arriving shortens it, and
 * if the grip was already due to end sooner than a second it is left alone.
 * That also keeps a vest's brief scuffle (`KEVLAR_GRAPPLE_MS`, 500ms) exactly
 * as short as it was.
 */
export const GRAPPLE_PILE_TURN_MS = 1000;

/** The outbreak arrives as a tight group along one randomly chosen map edge. */
export const INITIAL_ZOMBIES = 5;
export const INITIAL_ZOMBIE_SPREAD = 110;
export const MATERIALIZE_MS = 1400;
/**
 * A clean getaway with no infection at all — **and it is rolled when the grip
 * is taken, not when it lets go.**
 *
 * Deciding it up front is what lets the escape land at a *random moment*
 * inside the grapple rather than always on the deadline. Resolved at the end,
 * every escape looked identical: the full struggle, then release. Now the grip
 * simply breaks partway, at a time nobody can predict, which is what being
 * fought off actually looks like.
 *
 * The armoured are deliberately left out of the roll — a vest already
 * guarantees no infection, and spending a charge is the designed cost of one.
 * See `attemptGrab`.
 */
export const BASE_ESCAPE_CHANCE = 0.1;
export const ESCAPE_CHANCE_PER_EXTRA_ZOMBIE = 0;
/**
 * The burst that turns letting go into getting away.
 *
 * **`ESCAPE_IMMUNE_MS` is the one that actually does it, and the speed alone
 * never could.** Nothing used to make a released victim un-grabbable, so the
 * zombie standing on them re-grabbed on the very next tick — measured, 100% of
 * releases were re-taken with a median of 33ms, one tick, and the victim never
 * got further than 31px against a 32px grab reach. At any multiplier a tick is
 * a few pixels, so raising the speed on its own would have moved that 31 to 32
 * and changed nothing anybody could see.
 *
 * With a window to run in, the speed is what decides how much ground it buys.
 * 1.9 puts a fleeing civilian at 158 px/s, which beats even the fastest *fresh*
 * zombie (133) — and the one that just let go is winded to 47-66 by
 * `ZOMBIE_POST_GRAPPLE_SLOW` for longer than the burst lasts, so the gap opens
 * at about 100 px/s and keeps opening after the burst ends.
 *
 * The window is longer than `KEVLAR_IMMUNE_MS` on purpose: a vest buys a
 * breather in a fight that is still going, where this has to break contact.
 */
export const ESCAPE_SPEED_MULTIPLIER = 1.9;
/**
 * And how long it lasts. 1400 was a *sprint* rather than a flight — reported
 * as exactly that — and the cliff at the end of it was the problem: the burst
 * stopped a full second before ZOMBIE_POST_GRAPPLE_MS finished winding the
 * zombie, so the victim dropped to HUMAN_FLEE_SPEED (below every zombie speed)
 * while the chase was still on.
 *
 * 4000 covers the winding and then keeps going, which is the part that turns a
 * delay into an escape: the last 1.4s are spent outrunning a *recovered*
 * zombie rather than a winded one. Measured on open ground with no cover, as
 * the duration was swept: re-grabbed after 4000ms -> 5600 -> 6467 at 1400 /
 * 2600 / 4000, ground made 138 -> 238 -> 269px, and clean getaways 4% -> 1% ->
 * 17%. Past 4000 it goes bimodal — a third get away outright and the rest are
 * caught early against geometry — so the figure stops meaning one thing.
 */
export const ESCAPE_BOOST_MS = 4000;
export const ESCAPE_IMMUNE_MS = 800;

/**
 * The chance a grab turns you **on the spot** rather than leaving you bitten
 * and running. Anything short of it still infects: the victim gets away,
 * carries it, and turns minutes later on `TURN_DELAY_MIN_MS`.
 *
 * It was 0.05, which made turning on the spot a rarity and the incubated bite
 * essentially the only outcome. At 0.5 a grab is a coin toss between the two,
 * which is what makes being caught the event it should be.
 *
 * **The 5% clean getaway sits above this and is rolled first**, so the share
 * of grabs that actually turn somebody is 0.95 x 0.5, not 0.5 — about 47.5%
 * for a first grab by one zombie. The two modifiers below push it up from
 * there, and a pile at `GRAPPLE_NO_ESCAPE_AT` skips both rolls entirely.
 */
export const INSTANT_INFECT_BASE = 0.5;
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
 * How many of them at a doorway stop it being a way out at all.
 *
 * Reported as: *"sometimes 8 zombies will clog the doorway and everyone in the
 * room will charge them"*, alongside a note that going round one or two is
 * good and should stay. So this is a threshold on the **pile**, not on the
 * presence of a zombie — under it a doorway is scored worse and still usable,
 * at it the doorway does not exist.
 *
 * Three, because that is also `MAX_GRAPPLERS` and `GRAPPLE_NO_ESCAPE_AT`: it
 * is already the number at which being taken hold of stops being a fight.
 */
export const DOORWAY_MOB = 3;
/** How much one of them at a doorway, or on the way to it, costs that exit. */
export const DOORWAY_THREAT_COST = 260;
/** And how much it costs to be beaten to the door by one. */
export const DOORWAY_BEATEN_COST = 420;
/** How near the line to an exit a zombie has to be to count as in the way. */
export const EXIT_LANE_WIDTH = 70;
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
export const SNIPER_SIGHT_RADIUS = 1145;
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
 * routes around walls, which a body is not, and walks whoever is running into
 * it at a sprint. This is the last hundred and fifty pixels, read off real
 * positions rather than off the coarse field, and it is only ever a steer:
 * they are still going where they were going.
 *
 * **Everybody gets this, not only bots**, which is why it lost its `BOT_`
 * prefix. The civilian version was `skirtThreat`, and it read `threatX` — the
 * *one* tracked nearest threat — then took the first side that was merely
 * walkable. Two things fall out of that: running from the zombie behind you
 * straight into the one beside it, and, when you get there, turning round and
 * running back at the first. That is the reported *"civilians keep running
 * back towards zombies, see them, run away, and turn around back towards
 * them"*, and it is an oscillation between two threats rather than anything to
 * do with losing sight of one.
 */
export const DODGE_RANGE = 150;
/** How far off the running line something still counts as being in the way. */
export const DODGE_CONE = 0.8;
/** How far ahead each way round is tested for being walkable. */
export const DODGE_PROBE = 110;
/**
 * How hard it swings round. Scaled by how close the body is: one at arm's
 * length has to be gone round, one at the edge of the near field only needs
 * leaning away from, and a fixed swing does one of those two badly.
 */
export const DODGE_SWING_MIN = 0.45;
export const DODGE_SWING_MAX = 1.3;

/** How far a bot probes when picking a bearing to give ground along. */
export const BOT_GIVE_GROUND_PROBE = 130;
/** How hard it prefers "directly away" over "roomiest" while doing it. */
export const BOT_GIVE_GROUND_BIAS = 110;
/**
 * Backing off with the gun still up, *inside the fight branch*. Slower than a
 * walk on purpose — holding a range you have chosen should not also be free —
 * and at three quarters a zombie still closes, so kiting buys time rather than
 * winning outright.
 *
 * **A bolt is deliberately exempt from it, and that is not an oversight.** A
 * bolt keeps the gun on the thing now too, so on the face of it the same rule
 * should apply — but a bolt is the one case where the officer has already lost
 * the argument about range and is trying to break contact outright. Three
 * quarters of a sprint is inside the band a zombie runs at, which is exactly
 * the "a bolt that cannot outrun what it is bolting from" fault already
 * recorded against a winded bot. So the bolt keeps its pace and gains the gun;
 * what it pays instead is the sprint reserve it was already paying.
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

/**
 * A bare sandbag wall, built to order by a grey officer a spectator has told to
 * — the pocket gunner's bags with no gun behind them.
 *
 * Everything about how it *behaves* is the emplacement's: it is see-through and
 * bullets pass over it, it is solid to walking, it is deliberately not in the
 * nav grid so a zombie stands and claws at it rather than routing round, and it
 * goes through the same `zombieAtSandbag` and the same collision push-out. What
 * is different is that it is smaller — a stack of bags rather than a gun
 * position — and that it is not a `nearestProtector`, because that is a
 * judgement about a machine gun and this has none.
 *
 * Every grey officer carries exactly one, which is what bounds the whole
 * feature: a spectator can wall a street, not the city.
 */
export const BARRICADE_HALF_WIDTH = 26;
export const BARRICADE_HALF_DEPTH = 9;
export const BARRICADE_HEALTH = 900;
/** How near the officer has to get before he starts stacking them. */
export const BARRICADE_BUILD_REACH = 34;
export const BARRICADE_BUILD_MS = 2600;
/**
 * One budget for the whole errand, never extended — the same shape as
 * `HIDE_DEEPER_GIVE_UP_MS` and the beacon carrier, and what stops an officer
 * sent at a spot he cannot reach walking at it for the rest of the round.
 * Giving up deliberately does **not** spend the sandbag.
 */
export const BARRICADE_GIVE_UP_MS = 22000;
/** How far one wheel notch turns the ghost while it is being placed. */
export const SANDBAG_ROTATE_STEP = Math.PI / 12;

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
/**
 * How long a zombie hunts whoever shot it, to the exclusion of everybody else.
 *
 * **Being shot is a commitment now, not a coin toss.** It was
 * `RETALIATE_CHANCE` 0.45 rolled *per round that landed*, so a zombie under
 * automatic fire had its mind changed several times a second, and the 55% that
 * lost the roll only got a bare `lastSeen` that the next perception tick
 * overwrote. That is the reported back-and-forth, and it was not one bug: the
 * roll, the missing commitment and `senseTarget` stamping over the memory each
 * did their own part of it.
 *
 * **Longer than `ZOMBIE_LAST_SEEN_MS` (9s) on purpose.** It has to outlast the
 * ordinary memory of a sighting, or a zombie shot from across the street gives
 * up on the way. `GUNSHOT_ALERT_RADIUS` is 900px and a zombie covers about a
 * hundred a second, so this is roughly the walk from the far edge of earshot,
 * and every further round that lands refreshes it.
 *
 * The same caveat `ZOMBIE_LAST_SEEN_MS` carries applies here and is why this is
 * bounded at all: the branch that walks to a remembered spot sits above every
 * check that would notice a zombie getting nowhere. What makes it safe is that
 * a shot came *from* somewhere somebody was standing, so unlike the dog's roar
 * the spot is reachable ground by construction.
 */
export const ZOMBIE_PROVOKED_MS = 12000;
/**
 * How near a provoked zombie has to get before it finds its shooter in cover.
 *
 * **This is the whole of the bush fix.** A bush you are standing in doesn't
 * blind you and does stop anybody seeing in, which is what makes hiding work —
 * and it also meant a zombie could walk to the exact pixel it was shot from,
 * stand on top of the shooter, fail `hasLineOfSight` against the foliage, find
 * nothing, and wander off. Reported as exactly that.
 *
 * Inside this radius the sight test is skipped **for the shooter alone and
 * only while the provocation stands**, so it is not a hole in cover: a zombie
 * strolling past a hedge still cannot see the civilian in it, and `bushHider`
 * is untouched. It is a rule about somebody who has just been shot going to
 * where the shot came from and finding whoever is standing there.
 *
 * Comfortably wider than a grab so it does not depend on landing on the exact
 * remembered pixel — the memory is dropped at 30px of it.
 */
export const ZOMBIE_PROVOKED_SNIFF = 70;

// ---------------------------------------------------------------- NPC officers
/**
 * The city's standing garrison: **more of them, spread evenly, and they can
 * shoot.**
 *
 * The count is not decoration — it is the whole of whether "spread evenly"
 * means anything. Measured as the furthest any spot on the map can be from the
 * nearest officer: at 4-7 it is ~2200px on a map whose diagonal is 6200, so
 * there is always a quarter of the city with nobody in it, which is exactly
 * where a dog goes. At 10-14 that falls to ~1500px.
 */
export const NPC_OFFICER_MIN = 10;
export const NPC_OFFICER_MAX = 14;
/**
 * They used to be deliberately hopeless — 0.22 radians of bloom on a two-second
 * trigger, which is a miss at any range worth caring about. Grey is one grade
 * now and it is a competent one: the same pistol accuracy anyone a radio call
 * sends has, at a slightly slower trigger, because they are the ones who were
 * already standing there rather than the ones who came when you asked.
 */
export const NPC_OFFICER_SHOOT_INTERVAL_MS = 1100;
export const NPC_OFFICER_BLOOM_RAD = 0.07;
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
/**
 * Throwing a bolt across, and drawing it back.
 *
 * **Halved, and the bolt is the one bit of door work that should be quick.**
 * Opening a door is a handle, a hinge and a body going through the gap, and
 * DOOR_OPEN_MIN_MS is a civilian fumbling at it in a panic — that slowness is
 * the drama. A bolt is one movement of one hand, and everything that waits on
 * it is waiting for nothing: a room full of people cannot get out while one of
 * them takes two seconds over the lock, `doorBusyForOthers` holds the door
 * against all of them for the whole of it, and nav plans routes as though the
 * door were open, so the rest of the room walks into it meanwhile.
 */
export const DOOR_LOCK_MIN_MS = 500;
export const DOOR_LOCK_MAX_MS = 1000;

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

/**
 * Somebody indoors can throw the bolt back, and it takes them a moment.
 *
 * This is the one that keeps a locked city from seizing up, so it is also the
 * one that most wanted halving: at two seconds a bolted door was a two-second
 * stop for every single person who wanted through it, one after another.
 */
export const DOOR_NPC_UNLOCK_MS = 1000;
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
/**
 * The player holding E at a bolt. Halved with everybody else's.
 *
 * **`TAP_MAX_MS` (220) is the floor these cannot go under**, and it is nearer
 * than it looks. The press arms the *hold* action and a release inside that
 * window performs the tap instead, so a hold short enough to be mistaken for a
 * tap is a control that does the wrong thing under the fingers. At 500 there
 * is more than twice the tap window to get clear of, which is the margin.
 */
export const DOOR_PLAYER_LOCK_MS = 750;
export const DOOR_PLAYER_UNLOCK_MS = 500;
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

/**
 * The most of the *shorter* side of the map a single landmark may take.
 *
 * The tile counts above are absolute, and on a full-size city they are already
 * well inside these — a 34-tile complex is 952px against a 3700px side, 26% of
 * it, so at `CITY_POP_MAX` these caps change nothing at all. They exist for the
 * small end of the slider, where the same 952px would be 43% of a 2220px side
 * and the corner complex would stop being a landmark in a city and start being
 * the city. Capped as a *share* rather than a second set of numbers, so there
 * is one place the sizes live and the small cities are the big one, scaled.
 */
export const CORNER_COMPLEX_MAX_SHARE = 0.3;
export const BIG_BUILDING_MAX_SHARE = 0.25;

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
/**
 * An order pointed at a building is an order to go *inside* it.
 *
 * A click lands on a wall as often as on a floor — the slabs are most of what
 * a building looks like from above — so the point is snapped to the nearest
 * building within this reach and then resolved to a room. Generous, because
 * being sent to the front step of the house you were plainly being pointed at
 * is a better failure than being sent nowhere.
 */
export const RALLY_BUILDING_SNAP = 90;
/**
 * How long the walk in gets before they hole up wherever they have got to.
 *
 * The same shape as `HIDE_DEEPER_GIVE_UP_MS` and for the same reason: one
 * budget for the whole move in, never extended as they go, which is what
 * bounds a ping-pong at a doorway however the room underfoot is read. Longer
 * than that one because a rallied crowd may be crossing the street to the
 * building first, where a hider is already inside it.
 */
export const RALLY_ROOM_GIVE_UP_MS = 40000;
/**
 * Near enough to a doorway that aiming at it is no longer a bearing.
 *
 * `indoorHeadingToward` sends anybody outside a building at its door first,
 * and a body standing in that doorway would otherwise be handed the bearing to
 * a point under its own feet. One more step puts `roomAt` inside, at which
 * point the room graph takes over, so this only has to cover the threshold
 * itself.
 */
export const INDOOR_ROUTE_DOOR_REACH = 40;
/**
 * How near a spectator's move-order counts as arrived — at which point the
 * officer holds and scans the street rather than pressing on. Same figure as
 * the wander/guard arrival tests around it.
 */
export const COMMAND_ARRIVE_DIST = 26;
/**
 * How wide a commanded group is allowed to arrive, **per square root of its
 * size** — so the cluster grows with the number of bodies in it rather than
 * being one figure that is loose for three and impossible for ten. Same
 * `sqrt(area / count)` reasoning the garrison's spread uses.
 *
 * A move order preserves the selection's *shape*: each officer keeps its offset
 * from the group's centre, scaled down until the whole thing fits inside this.
 * The scale is floored at what `OFFICER_SPACING_PAD` says they can physically
 * stand in — a cap on its own would stack ten officers on one pixel, collision
 * would fling them apart, and the formation this exists to keep would be
 * destroyed on arrival — and ceilinged at 1, which is what makes "already close
 * together" mean *leave it exactly as it is*.
 */
export const COMMAND_FORMATION_SPREAD = 45;
/**
 * Extra clearance between two officers, on top of their radii.
 *
 * Officer-to-officer only. Their circles used to touch exactly, so a group that
 * had arrived somewhere read as one mass rather than as several people standing
 * near each other. Civilians and zombies are untouched, and a squad's own
 * station-keeping runs on `SQUAD_SLACK`, which is far too coarse to notice it.
 */
export const OFFICER_SPACING_PAD = 8;
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

// -------------------------------------------------- what is in the complex
/**
 * The corner complex is stocked, and the scarcity of what is in it goes up
 * with `Room.depth` — doorways between a room and the street.
 *
 * It is the one landmark that claims its ground outright, it is the most
 * heavily partitioned building a city has, and until now it held exactly the
 * one gun and one utility every other house rolls for. A twenty-room block
 * with a shotgun in the front room is not somewhere anybody goes twice.
 *
 * **Depth rather than distance, for the same reason `hidesDeeper` uses it.**
 * The far end of a long hall is no further from the street than its near end,
 * and a cupboard off it is — so a gradient measured in pixels would put the
 * good loot wherever the building happened to be longest rather than wherever
 * it is genuinely hardest to reach.
 */
export const COMPLEX_LOOT_PER_ROOM = 1;
/** An extra draw every this many doorways in, so the back rooms are worth it. */
export const COMPLEX_LOOT_DEPTH_BONUS = 3;
/** Nothing sits at a doorway you have to walk through to reach anything else. */
export const COMPLEX_LOOT_DOOR_GAP = 40;
/**
 * The rarity ceiling at depth 0, and how far it comes down per doorway.
 *
 * 12 is the commonest thing in the game (`boltRifle`), so the front rooms draw
 * from the whole table exactly as any other house does — the complex is not a
 * different kind of loot, it is more of it, getting scarcer as you go in. Four
 * doorways in the ceiling is 1, which is the rarest tier and nothing else.
 */
export const COMPLEX_RARITY_CEILING = 12;
export const COMPLEX_RARITY_PER_DEPTH = 2.8;

/**
 * How much likelier the complex is to be picked as somebody's starting house
 * than its floor area alone would make it.
 *
 * A city block is drawn uniformly from `map.buildings`, which already gives
 * the complex one ticket in ninety for a building that is twenty rooms and a
 * whole corner of the map. This is a thumb on that scale rather than a count
 * of its own, so it scales with the population slider for free and cannot
 * over-fill a small city's complex.
 */
export const COMPLEX_CROWD_MUL = 7;

/** Utility kit. Deliberately not guaranteed — most cities are missing some. */
export const GRENADE_COUNT = 3;
/** Combat boots: a little quicker, and cheaper on the legs.  */
export const BOOTS_SPEED_MUL = 1.12;
export const BOOTS_STAMINA_MUL = 0.62;
/** Backpack and gunsling: extra slots while you carry them. */
export const BACKPACK_SLOTS = 2;
export const GUNSLING_SLOTS = 1;
/**
 * Binoculars push the camera out too, the way a scope does but gently — so
 * this is derived the same way `PLAYER_SIGHT_RADIUS` is, off
 * `BINOCULAR_PUSH + CAMERA_PAN_*`.
 *
 * **It was already short before the pan changed**, which is worth recording: at
 * a pan of 60 the corner was 1036 against this at 980, so the client had been
 * lighting fifty-odd pixels of ground the server was not sending entities for
 * whenever the binoculars came up. Exactly the fault raising the sniper once
 * caused, and invisible unless you go looking, because what it produces is an
 * empty street rather than an error. At 1920x1080, zoom 1.6 and a pan of
 * 80/194 the corner is 996.
 */
export const BINOCULAR_SIGHT_RADIUS = 1015;
/**
 * How far the zombie tracker will look before it gives up and points nowhere.
 *
 * The whole map, and then some — derived from the diagonal so it cannot fall
 * short if the city ever grows. It used to be 1600, which meant the one tool
 * that sees past the fog went blank in exactly the situation it exists for:
 * out in a quiet quarter with no idea which way the outbreak is. A compass
 * that only works when you can nearly see the thing is not a compass.
 *
 * **A function rather than a constant, because the city resizes now.** Computed
 * once at import it would hold the launch size's diagonal forever, which on a
 * *smaller* city is merely generous and on a larger one is short — the exact
 * failure the derivation was written to rule out. See `WORLD_WIDTH`.
 */
export function trackerRange(): number {
  return Math.hypot(WORLD_WIDTH, WORLD_HEIGHT) + 100;
}

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
export const TEST_BEACON_ON_A_BOT = false;

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
/**
 * The patrol car the second and third radio calls send instead. Bigger than
 * the 46×22 it started at — next to an 82×38 van it read as a toy, and two
 * officers have to be able to get out of the thing.
 */
export const CAR_LENGTH = 62;
export const CAR_WIDTH = 28;
/** How far the car's two side doors swing. */
export const CAR_DOOR_ARC = 1.35;
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
 * Rounds a dispatched crew turns up with, and what they fall back to.
 *
 * Deliberately generous — a SWAT team that runs dry in one street fight is not
 * a SWAT team — but *finite*, so a squad left sweeping for ten minutes is
 * spending something. When the rifle is empty they draw a sidearm and keep
 * working: still a far better shot than an ordinary officer, because they are
 * still the people who came when you asked, but a pistol's reach and rate.
 */
export const SWAT_RIFLE_AMMO = 220;
export const RIFLEMAN_RIFLE_AMMO = 90;
export const SOLDIER_RIFLE_AMMO = 140;
export const DISPATCHED_PISTOL_BLOOM_RAD = 0.07;
export const DISPATCHED_PISTOL_INTERVAL_MS = 900;
/**
 * And every one of them hits a little softer than the gun's paper figure.
 * They arrive in numbers, they aim well and they never stop shooting; at the
 * rifle's full damage a single call cleared streets faster than the player
 * could walk down them.
 */
export const DISPATCHED_DAMAGE_MUL = 0.65;

/**
 * A squad sent by radio does not stand at your shoulder — it sweeps.
 *
 * One of them leads and the rest keep station on it, loosely: a slot bearing
 * off the leader's back at `SQUAD_SPREAD`, held only once they have drifted
 * `SQUAD_SLACK` off it. Correcting to an exact spot is a squad that marches;
 * the slack is the whole of what makes it read as people moving together
 * rather than as a formation being drawn.
 */
export const SQUAD_SPREAD = 96;
export const SQUAD_SLACK = 42;
/**
 * How far round the leader the slots reach. Past a right angle the shape stops
 * being a file behind him and becomes a *line abreast* — some of them out to
 * the side and the outermost pair genuinely ahead, which is what a team
 * sweeping a street actually looks like and what keeps the leader from being
 * the only one who ever finds anything.
 */
export const SQUAD_SLOT_ARC = 2.5;
/** A squad sent to sweep moves like it means it. */
export const SQUAD_PATROL_SPEED_MUL = 1.45;
/**
 * How fast the shape the squad holds is allowed to swing round, in rad/s.
 *
 * The slots used to be taken straight off the leader's `facing`, which is the
 * way he is *aiming* — it snaps to a target the moment he sees one and snaps
 * back when it dies. Every follower's post then whipped through an arc around
 * him and they chased it, which is what the crabbing and doubling back was.
 * The formation now turns on its own slow bearing, eased toward where he is
 * pointing, so it swings round a corner and ignores him twitching at a target.
 */
export const SQUAD_BEARING_RATE = 1.1;
/**
 * Station-keeping is latched, not judged against one distance. At a single
 * threshold a follower steps forward, lands inside it, stops, is left behind a
 * pace later and steps again — a stutter that reads as indecision. They close
 * to this fraction of `SQUAD_SLACK` once they have started moving.
 */
export const SQUAD_CLOSE_TO = 0.4;
/**
 * How long a squad member commits to going *round* something after being
 * refused a step into it. Without it they turn on the spot, re-aim through the
 * same doorway on the next tick and stand there — which is exactly what "stuck
 * facing the door" looks like.
 */
export const SQUAD_AVOID_MS = 900;

/**
 * The dirt path's texture, and the lamps at either end of it.
 *
 * All of it is drawn from the path polyline the client already has, hashed off
 * the speck index rather than rolled or stored — the park is the most
 * overdraw-sensitive thing on screen, so this is a fixed count of small blobs
 * with no per-frame state and nothing on the wire.
 */
export const PARK_PATH_SPECKS = 220;
export const PARK_PATH_END_SPECKS = 26;
export const PARK_PATH_END_SCATTER = 42;
/** How far off the end and off to the side each lamp stands. */
export const PARK_LAMP_INSET = 10;
export const PARK_LAMP_OFFSET = 14;
export const PARK_LAMP_GLOW = 90;
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
/**
 * There is deliberately **no range on the order at all** — no
 * `BEACON_CALL_RADIUS`, and nothing that can refuse it for being too far off.
 *
 * The mast is a fixed place on the map that everybody in the city knows about
 * once it is up, and the order is "go *there*", given to the people standing
 * around **you**. `rallyHumans` reads the shouter's own position for who hears
 * it and the mast's for where they go, so the distance between the two was
 * never the question: gating on it meant an officer who found a dozen
 * survivors across the city could not send them anywhere, which is the exact
 * job the beacon exists to do.
 */
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
/**
 * How much pickier the *last* charge makes it, and the floor it never goes
 * below. With several in hand a handful of people is worth moving now; down to
 * one, it waits for a crowd worth spending it on. `RALLY_STARTING_CHARGES` is
 * 1, so this only ever loosens a bot that has gone and found lozenges.
 */
export const BOT_BEACON_SHOUT_PER_CHARGE = 2;
export const BOT_BEACON_SHOUT_FLOOR = 2;
/**
 * The mast has to be meaningfully safer than where the crowd is standing, and
 * the way there has to be survivable.
 *
 * Sending people somewhere no safer than where they already are spends the
 * charge and moves the problem; somewhere worse is the charge doing harm. The
 * route is read at the midpoint for the same reason `escapeDestination` reads
 * one — somewhere lovely on the far side of a horde is not somewhere to send
 * four dozen civilians walking.
 */
export const BOT_BEACON_SAFER_BY = 120;
export const BOT_BEACON_ROUTE_CLEARANCE = 200;
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
/**
 * Node budget for a whole *tick*, shared by every search in it.
 *
 * **This is the cap that matters, and for a long time nothing enforced it.**
 * `PATH_BUDGET_PER_TICK` caps how many searches may run and `PATH_MAX_NODES`
 * caps how far each may explore, but nothing capped the product — and the
 * product is what the tick actually spends. Ten searches at the node cap is
 * 140,000 expansions inside a 33.3ms budget.
 *
 * Measured on a 358x265 grid: a typical search costs 1.88ms, but the worst
 * costs **20ms**, and ten of those is **200ms** — which is exactly the spike
 * that was being reported. Long routes and searches that cannot succeed are
 * the expensive ones, and a panicking crowd re-plans together, so the bad
 * searches arrive on the same tick rather than spread out.
 *
 * Sized against what a live city actually asks for, not against what the
 * pathfinder can be made to do. Measured over two cities, 2300 ticks each:
 * demand is **median 340-465 nodes a tick** and does nothing at all on a tenth
 * of them — but p99 is 14-15k and the worst tick asks for 28k. It is entirely a
 * tail problem, which is why it shows up as a stutter rather than as a slow
 * game.
 *
 * At 12000 the budget binds on **1.8-2.5%** of ticks and leaves the median
 * untouched. Going to 24000 — the first number tried here — would have bound on
 * 0.0% and fixed nothing at all, which is worth recording: a cap chosen by
 * eye, above the p99 it was meant to catch, is a cap that never fires.
 *
 * Anybody refused waits for the next tick, which `REPATH_INTERVAL_MS` and the
 * fall-back to `slideToward` already handle — being refused a path is a case
 * every call site has always had to cope with.
 */
export const PATH_NODE_BUDGET_PER_TICK = 12000;

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

// ---------------------------------------------------------------- holed up
/**
 * Somebody who has holed up indoors does not stand on the spot for the rest of
 * the round. They potter about the room they shut themselves into — up to the
 * window, back to the far wall — which is what a frightened person waiting
 * something out actually looks like, and it is the whole difference between a
 * room with people in it and a room with mannequins in it.
 *
 * They move slowly and stop for a long time between legs: this is pacing, not
 * strolling, and the pauses are what keep it from reading as ordinary wander.
 * Deliberately *not* a trait — everybody indoors does it. Standing dead still
 * was never anybody's personality, it was the absence of any behaviour at all.
 */
export const SETTLED_ROOM_SPEED_MUL = 0.85;
export const SETTLED_PAUSE_MIN_MS = 2200;
export const SETTLED_PAUSE_MAX_MS = 9000;
/** Close enough to the chosen spot to call it arrived at. */
export const SETTLED_ARRIVE_DIST = 22;
/**
 * How long a leg may take before it is given up on. A room is small and this
 * is generous; what it is really for is the spot that turned out to be behind
 * a piece of geometry, which would otherwise be paced at forever.
 */
export const SETTLED_LEG_GIVE_UP_MS = 9000;

/**
 * Share of people who, having holed up, keep seeing to the doors of the room
 * they are in — shutting one that has come open and bolting one somebody drew
 * the bolt on.
 *
 * This is the other half of locking yourself in: a bolted door that a
 * neighbour walks through an hour later has bought nothing, and until now
 * nobody ever looked at it again. It runs on `lockAlso`, which already knows
 * how to walk to a door and shut and bolt it — so what is added here is only
 * the noticing.
 */
export const DOOR_GUARD_CHANCE = 0.45;
/** How often one of them looks round the room's doors. Not per tick. */
export const DOOR_GUARD_CHECK_MS = 1500;

/**
 * Share of people who, once inside somewhere big enough to have a back to it,
 * go and hole up at the back rather than in the first room they reach.
 *
 * It only ever fires in a partitioned building, because `Room.depth` is a hop
 * count through doorways and an ordinary block is a single undivided space —
 * so "if they are in a corner building or larger building" falls out of the
 * room graph rather than needing a landmark flag to test.
 */
export const HIDE_DEEPER_CHANCE = 0.4;
/** A room has to be this many doorways further in to be worth moving to. */
export const HIDE_DEEPER_MIN_GAIN = 1;
/**
 * The whole move in, however many rooms it takes, before they give it up and
 * hole up where they have got to.
 *
 * It is a budget for the lot rather than a clock per room, so a ping-pong at a
 * doorway cannot run forever however the room underfoot is read, and one
 * bolted door does not cost the whole plan — they simply stop one room short,
 * which is a fine place to be.
 *
 * A landmark is nine rooms deep at the outside and a civilian walks at 35px/s,
 * so this is a handful of rooms and the door work between them, not a crossing
 * of the whole complex.
 */
export const HIDE_DEEPER_GIVE_UP_MS = 20000;

/** Flee destination search. */
export const ESCAPE_SAMPLES = 16;
export const ESCAPE_DISTANCE = 420;
/** Commit to a chosen escape for this long so they don't dither. */
export const ESCAPE_COMMIT_MS = 1200;

// ---------------------------------------------------------------- grime
/**
 * The city is filthy, and that is drawn rather than tinted.
 *
 * One tile is hashed once at startup and repeated across the whole map as a
 * canvas pattern, so the ground costs **one fill** however far the camera is
 * pulled back. That is the same lesson `drawBushes` taught: a hundred separate
 * translucent blobs is fill-rate paid per pixel per frame, and the union of
 * them costs about what one does. A per-frame scatter over the viewport was the
 * obvious way to write this and is the expensive one.
 */
export const GRIME_TILE = 256;
export const GROUND_COLOR = '#1b1d20';
export const GRIME_BLOTCHES = 26;
export const GRIME_GRIT = 260;
export const GRIME_CRACKS = 7;

/**
 * A round finding a body leaves a mark on the ground that stays. Nothing about
 * it reaches the wire — `Shot.hit` already says a round landed and `x2,y2` is
 * exactly where, so blood is derived from what the client is drawing anyway.
 *
 * Capped, and every visible decal of a given age goes into **one path filled
 * once** rather than a fill each. Four hundred separate translucent fills is
 * the park's mistake again, in red.
 *
 * `BLOOD_DECAL_MS` is now the dry-down: a mark spends this long fading from wet
 * to a dull stain, and then — with PERMANENT BLOOD on — it is baked once into a
 * shared, half-resolution offscreen layer and dropped from the live list, so
 * the per-frame cost stays flat however long the round runs. The cap is only
 * the backstop on the still-drying set. With permanence off it fades to nothing
 * and is culled, exactly as before.
 */
export const BLOOD_DECAL_MAX = 320;
export const BLOOD_DECAL_MS = 40000;
/**
 * The persistent stain layer (dried blood, and settled zombie corpses) is a
 * canvas this fraction of the world on each axis. Blood and flat corpses are
 * low-detail, so a 2x upscale on the blit is invisible; at the 5000x3700 max
 * city this is a ~18MB canvas, and less for the smaller ones.
 */
export const BLOOD_BAKE_SCALE = 0.5;
/** The wet part: droplets thrown along the round's line, gone in half a second. */
export const BLOOD_SPRAY_MS = 520;
export const BLOOD_SPRAY_DROPS = 9;
export const BLOOD_SPRAY_SPEED = 190;
export const BLOOD_COLOR = '#5c0d10';

/**
 * A shot zombie ragdolls a short way along the round before it drops, then its
 * green fades to a corpse grey. After that it is a permanent mark for the round
 * (baked into the same layer the dried blood is), unless ZOMBIE CORPSES is off,
 * in which case a kill just fades out over `ENTITY_FADE_MS` as it always did.
 */
export const CORPSE_SLIDE_PX = 18;
export const CORPSE_SLIDE_MS = 320;
export const CORPSE_GREY_MS = 1100;
export const CORPSE_COLOR = '#6b6b6b';

/**
 * How dark the corners of the screen get. Under the HUD and over the fog, so
 * it frames the world without dimming anything you have to read. One cached
 * image drawn once a frame — a gradient rebuilt per frame is a full-screen
 * translucent fill *and* a gradient allocation.
 */
export const VIGNETTE_ALPHA = 0.55;
export const VIGNETTE_INNER = 0.42;
