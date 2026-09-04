import {
  VIEWPORT_WIDTH,
  VIEWPORT_HEIGHT,
  WORLD_WIDTH,
  WORLD_HEIGHT,
  setWorldSize,
  TRACER_LIFETIME_MS,
  FLAME_TRACER_MS,
  PLAYER_SIGHT_RADIUS,
  STAMINA_MAX,
  FOG_UPDATE_MS,
  FOG_MOVE_EPSILON,
  FOG_MASK_SCALE,
  FOG_BLUR_PX,
  ENTITY_FADE_MS,
  BIRTH_BURST_AT,
  MATERIALIZE_MS,
  GUN_SLOTS,
  UTILITY_SLOTS,
  SCOPE_PUSH,
  BINOCULAR_PUSH,
  BINOCULAR_SIGHT_RADIUS,
  CAMERA_PAN_X,
  CAMERA_PAN_Y,
  CAMERA_ZOOM,
  DOG_CAMERA_ZOOM,
  DOG_CAMERA_PAN_Y,
  DOG_SIGHT_RADIUS,
  ACID_INSIDE_SIGHT,
  SCOPE_EASE_MS,
  TICK_RATE,
  ENTITY_RADIUS,
  BARRICADE_HALF_WIDTH,
  BARRICADE_HALF_DEPTH,
  SANDBAG_ROTATE_STEP,
} from '../../shared/constants.js';
import { acidLobes, inAcidLobes } from '../../shared/acidshape.js';
import type {
  DoorPrompt,
  DoorState,
  EntityState,
  GrenadeState,
  HelicopterState,
  InventoryState,
  Bush,
  MapData,
  PickupState,
  AcidState,
  TentacleState,
  LashState,
  SmokeState,
  SpitState,
  SpeechState,
  BlastState,
  DuckState,
  EmplacementState,
  BarricadeState,
  BuildSiteState,
  BeaconState,
  FireState,
  MineState,
  BackupVehicleState,
  CorpseState,
  DogHud,
  Wall,
} from '../../shared/types.js';
import { connect, takeNetStats, pingStats } from './net.js';
import { trackInput, spectatorPan } from './input.js';
import {
  playRoar,
  playZombieGroan,
  playZombieAttack,
  playZombieHit,
  occlusion,
  stopAllSounds,
  type Spatial,
} from './sound.js';
import {
  drawBeacons,
  drawBushes,
  drawCrosshair,
  drawReticle,
  drawAimGauge,
  drawChargeBars,
  doorSlab,
  drawDoorPrompt,
  drawDoors,
  drawEntity,
  ENTITY_DETAIL_SCALE,
  drawGrenades,
  drawGround,
  drawParkingBays,
  drawHandLinks,
  drawHelicopters,
  drawInteractPrompt,
  drawInventory,
  drawPickups,
  drawBlasts,
  drawDucks,
  drawEmplacements,
  drawBarricades,
  drawBuildSites,
  drawSandbagWall,
  drawCommandCard,
  commandCardSlots,
  commandCardButtons,
  cardSlotForKey,
  type CardButtonId,
  drawBackupVehicles,
  drawMines,
  drawZaps,
  drawBeaconTowers,
  drawMinimap,
  minimapFrame,
  drawFires,
  drawBurning,
  drawBlood,
  drawBloodSpray,
  drawZombieCorpses,
  spawnBlood,
  spawnCorpse,
  spawnBurst,
  clearBlood,
  clearDogMap,
  clearDogPoses,
  drawDogHud,
  drawCorpses,
  drawDeathFade,
  drawVignette,
  drawPond,
  drawAcid,
  drawAcidMurk,
  drawSmoke,
  drawSpits,
  drawTentacleDebris,
  drawLashes,
  drawLashWarnings,
  drawLashScars,
  drawLashChips,
  takeLashImpacts,
  setLashes,
  clearLashScars,
  drawDogMap,
  drawStamina,
  DOG_HUD_STAMINA_LIFT,
  drawTracers,
  drawTracker,
  drawThermal,
  drawPark,
  drawSelfMarker,
  drawSpeechBubbles,
  drawWalls,
  drawWindows,
  type Tracer,
  type Viewport,
} from './render.js';
import { visibilityPolygon, type Point as FogPoint } from './fog.js';
import { drawTargetCursor, drawWheel, hitTest, newWheelState, wheelOptions } from './wheel.js';
import { setupMenu } from './menu.js';
import { applyRenderScale, settings } from './settings.js';
import { ITEMS, type ItemId } from '../../shared/items.js';
import type { AbilityId } from '../../shared/types.js';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;

// Fog lives on its own layer so we can punch a hole in it without erasing the
// world underneath. The layer is rasterised at a fraction of viewport size and
// upscaled — the bilinear filtering doubles as free edge softening.
const fogCanvas = document.createElement('canvas');
const fogCtx = fogCanvas.getContext('2d')!;

/**
 * Size both backbuffers for the chosen render scale.
 *
 * **The only place in the client that knows a real pixel from a layout one.**
 * Everything else is written against `VIEWPORT_WIDTH`/`HEIGHT` and one
 * `setTransform` at the top of the frame maps between them, which is why a
 * resolution setting needed no arithmetic anywhere else.
 *
 * The fog mask comes with it, and has to: `FOG_MASK_SCALE` is a fraction *of
 * the backbuffer*, so a mask left at full size while the frame halved would be
 * blitted up by half as much and its penumbra would come out half as wide.
 * Sizing it off the same number keeps the blur a fixed share of the picture,
 * and it is also most of what the setting saves — the mask blit was 1.04ms
 * with smoothing on.
 *
 * `applyRenderScale` calls this once at startup as well as on every change, so
 * there is no separate initialisation to get out of step.
 */
applyRenderScale((px) => {
  canvas.width = Math.round(VIEWPORT_WIDTH * px);
  canvas.height = Math.round(VIEWPORT_HEIGHT * px);
  fogCanvas.width = Math.round(VIEWPORT_WIDTH * px * FOG_MASK_SCALE);
  fogCanvas.height = Math.round(VIEWPORT_HEIGHT * px * FOG_MASK_SCALE);
  // Resizing a canvas resets its context, so anything set once at startup has
  // to be set again. This is the flag measured at 1.04ms against 0.25ms — the
  // mask is already blurred before it is blown up, so smoothing it costs a
  // millisecond for 0.28/255 of alpha.
  ctx.imageSmoothingEnabled = false;
});

const pausePanel = document.getElementById('pause') as HTMLDivElement;
const gameOverPanel = document.getElementById('game-over') as HTMLDivElement;
const gameOverRestart = document.getElementById('game-over-restart') as HTMLButtonElement;
const victoryPanel = document.getElementById('victory') as HTMLDivElement;
const victoryRestart = document.getElementById('victory-restart') as HTMLButtonElement;
const dogOutPanel = document.getElementById('dog-out') as HTMLDivElement;
const dogOutRestart = document.getElementById('dog-out-restart') as HTMLButtonElement;
const hud = document.getElementById('hud') as HTMLDivElement;
const perfHud = document.getElementById('perf') as HTMLDivElement;

let selfId: string | null = null;
let map: MapData | null = null;
let tracers: Tracer[] = [];
let spectating = false;
let gameOver = false;
let victory = false;
let survivors = 0;
let infectedCount = 0;
let zombieCount = 0;
let stamina = 100;
let exhausted = false;
let serverTickMs = 0;
let beacons: Array<{ x: number; y: number }> = [];
let brokenWindows = new Set<number>();
/** Door state as last reported, keyed by index into map.doors. */
const doorStates = new Map<number, DoorState>();
let doorPrompt: DoorPrompt | null = null;
/** Bumped whenever a door opens or shuts, to invalidate the fog occluders. */
let doorEpoch = 0;
let rallyCharges = 0;
let followCharges = 0;
/** True while civilians are in tow, so the wheel offers the release order. */
let following = false;
let pickups: PickupState[] = [];
let inventory: InventoryState | null = null;
/** The dog's jaws and bite clock, or null for anyone playing an officer. */
let dogHud: DogHud | null = null;
/** When it last got back up, so the screen can fade in off the black. */
let dogRoseAt = -1;
let grenades: GrenadeState[] = [];
let smokes: SmokeState[] = [];
let acid: AcidState[] = [];
let spits: SpitState[] = [];
let tentacles: TentacleState[] = [];
let lashes: LashState[] = [];
/**
 * Bumped whenever the acid on screen changes shape, so the fog cache knows to
 * throw its polygon away.
 *
 * A cloud is an occluder — it goes into `visibilityPolygon` in the same array
 * as the foliage — so a polygon computed before one boiled out would light
 * ground straight through it. This is exactly what `doorEpoch` does for a door
 * swinging, and it is keyed on the *rounded* radius the server sends rather
 * than on the raw one: a cloud spends most of its life at full width, so the
 * epoch is stable for most of it and the rebuilds are confined to the half
 * second it is growing.
 */
let acidEpoch = 0;
let acidShape = '';
/**
 * Every cloud's lobes, flattened — the occluders the fog is actually built
 * from, and the shape it is actually drawn as.
 *
 * Derived from the seed on the wire by `shared/acidshape.ts`, which is the same
 * function the server's own sight lines go through, so the drawn rim sits
 * exactly where the occluder edge does. Rebuilt only when `acidEpoch` moves,
 * which is once as a cloud boils out and then not again — the fog polygon is
 * rebuilt often enough that deriving this per rebuild would be a real cost for
 * an answer that has not changed.
 */
let acidOccluders: Bush[] = [];
let blasts: BlastState[] = [];
let ducks: DuckState[] = [];
let emplacements: EmplacementState[] = [];
let barricades: BarricadeState[] = [];
/**
 * Walls ordered and not yet standing — the ghosts that stay put while an
 * officer walks to the spot. Empty for anybody who is not spectating; the
 * server does not send them at all.
 */
let buildSites: BuildSiteState[] = [];
let vehicles: BackupVehicleState[] = [];
let mines: MineState[] = [];
let corpses: CorpseState[] = [];
let towers: BeaconState[] = [];
let zaps: Array<{ x: number; y: number; at: number }> = [];
let fires: FireState[] = [];
let helicopters: HelicopterState[] = [];
let speech: SpeechState[] = [];
const wheel = newWheelState();
/** Ability picked from the wheel and waiting for the player to click a spot. */
let armedAbility: AbilityId | null = null;
/**
 * The beacon map, open. Only ever while the handset is the item in hand, which
 * is what makes putting it down cost you the ability to look — the server
 * stops sending `inventory.beacon` at all without one in the bag.
 */
let minimapOpen = false;
/**
 * A spot picked on the map but not yet committed — drawn grey, and purely
 * client-side until the second click sends it.
 *
 * Calling the beacon in is the one decision in the game that cannot be taken
 * back: there is one per city and `requestBeacon` refuses a second. Landing it
 * on a mis-click is a whole round's worth of mistake, so it takes two — one to
 * put the marker down, one to mean it — and a right-click to change your mind.
 */
let beaconPick: { x: number; y: number } | null = null;

/** Shut the map, and drop any marker with it — a pick has no life outside it. */
function closeMinimap(): void {
  minimapOpen = false;
  beaconPick = null;
}

// Frame timing for the perf readout. Smoothed so the number is readable.
let fps = 0;
let lastFrameAt = 0;
let worstFrameMs = 0;
let worstResetAt = 0;
/** The frame gap split into render / network / everything else, smoothed. */
let smoothGap = 0;
let smoothNet = 0;
let smoothElse = 0;
/** Snapshot throughput, accumulated over the same one-second window as `spike`. */
let bytesThisSecond = 0;
let kbPerSec = 0;
/** How often the text readouts are rewritten — see the note where they are. */
const HUD_UPDATE_MS = 200;
let hudWrittenAt = 0;
/** The counts line as last written, so an unchanged one isn't rewritten. */
let lastHudLine = '';

const input = trackInput(canvas);

/**
 * Spectator RTS. A watcher can box-select grey NPC officers and right-click to
 * order them somewhere; the officer paths there, engaging what it passes, then
 * holds and scans the street. All of this is client-side except the one
 * `command` message — selection, the marquee and the rings never leave here.
 */
const selectedOfficers = new Set<string>();
/** The marquee mid-drag, in viewport (layout) pixels, or null. */
let marquee: { x0: number; y0: number; x1: number; y1: number } | null = null;
let dragStart: { x: number; y: number } | null = null;
/** Brief markers where an order was given, in world coordinates. */
const commandFx: Array<{ x: number; y: number; born: number; override?: boolean }> = [];
const COMMAND_FX_MS = 500;
/**
 * How quickly two right-clicks have to land to count as one gesture.
 *
 * **A single right-click may not take an officer off a wall he is walking to
 * build.** That errand is a walk of several seconds, and a stray click anywhere
 * on the map used to throw it away with nothing said — the ghost went out, the
 * sandbag was never spent, and the only sign was a wall that never appeared. So
 * cancelling one is a deliberate gesture, and everybody in the selection who is
 * *not* building moves on the first click either way.
 *
 * Well under the 500ms an operating system calls a double-click, because this
 * has to be a thing you meant rather than a thing two ordinary orders in a hurry
 * can add up to.
 */
const DOUBLE_RIGHT_MS = 280;
let lastRightAt = 0;
const DRAG_THRESHOLD = 5;
/**
 * How much of the gunsight a spectator's pointer is.
 *
 * The full mark spans 42 layout pixels across the brackets, against a command
 * card slot of 46 — so at 1 the pointer very nearly covered whichever button it
 * was over. It is a pointer here rather than a sight, and it wants to be small
 * enough to point *at* something.
 */
const SPECTATE_CURSOR_SCALE = 0.6;

/** Grey AI officers — not blue bots, olive soldiers or black SWAT. */
function isGreyOfficer(s: EntityState): boolean {
  return s.type === 'officer' && s.npc === true && !s.bot && !s.soldier && !s.swat;
}

/** A viewport pixel back to a world coordinate, on the spectator camera. */
function spectatorWorld(sx: number, sy: number): { x: number; y: number } {
  const { view, scale } = cameraFor(undefined);
  return { x: view.x + sx / scale, y: view.y + sy / scale };
}

/**
 * The command card, SC2-style: raised bottom-right whenever grey officers are
 * selected. Which page is showing, and — while a wall is being sited — the
 * ghost of it under the cursor.
 *
 * The ghost holds only its *angle*; its position is wherever the mouse is, so
 * there is no second copy of the cursor to keep in step.
 */
let cardPage: 'root' | 'build' = 'root';
let sandbagGhost: { angle: number } | null = null;

/**
 * How many walls the selection can still order.
 *
 * Counted off the wire's `bag` flag across the selected officers rather than
 * tracked here: the server owns whether a sandbag has been spent, and a client
 * tally would go stale the moment one was built, given up on, or its owner was
 * eaten.
 *
 * **Less anybody already walking to a spot.** A sandbag is only spent when the
 * wall goes up, so a man out on an errand still reads as a holder — and the
 * server will not give him a second one, so counting him here would leave the
 * button lit with an order behind it that cannot land. Off the wire on both
 * counts, so the two halves cannot disagree about who is free.
 */
function selectedSandbags(): number {
  let n = 0;
  for (const id of selectedOfficers) {
    if (!tracked.get(id)?.state.bag) continue;
    if (buildSites.some((b) => b.id === id)) continue;
    n++;
  }
  return n;
}

/** Which card slot the cursor is over, or -1. */
function cardHover(): number {
  if (!spectating || selectedOfficers.size === 0) return -1;
  const { slots } = commandCardSlots(VIEWPORT_WIDTH, VIEWPORT_HEIGHT);
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i];
    if (
      input.mouseX >= s.x &&
      input.mouseX <= s.x + s.w &&
      input.mouseY >= s.y &&
      input.mouseY <= s.y + s.h
    ) {
      return i;
    }
  }
  return -1;
}

/**
 * Press a card button.
 *
 * One function because a button can be reached two ways now — the mouse and its
 * grid hotkey — and a second copy of "what this button does" is how the two
 * drift into a shovel that opens the build page when clicked and does nothing
 * when typed.
 */
function pressCardButton(id: CardButtonId): void {
  if (id === 'shovel') cardPage = 'build';
  else if (id === 'back') {
    cardPage = 'root';
    sandbagGhost = null;
  } else if (id === 'sandbag') {
    // Pressing it with a wall already in hand keeps the bearing you have
    // dialled in on the wheel rather than snapping it back to zero — the
    // button is "another one of these", not "start again".
    sandbagGhost ??= { angle: 0 };
  }
}

/** Anywhere on the card's panel, buttons or not — the card swallows the click. */
function overCard(): boolean {
  if (!spectating || selectedOfficers.size === 0) return false;
  const { frame } = commandCardSlots(VIEWPORT_WIDTH, VIEWPORT_HEIGHT);
  return (
    input.mouseX >= frame.x &&
    input.mouseX <= frame.x + frame.w &&
    input.mouseY >= frame.y &&
    input.mouseY <= frame.y + frame.h
  );
}

/**
 * Would a wall stood here be inside something?
 *
 * Sampled along the wall's length against the map's walls, which are plain
 * AABBs, so it is a point-in-rect loop and costs nothing — and it only runs
 * while a ghost is actually up. The server will nudge a bad spot to walkable
 * ground rather than refusing outright, but a silently relocated wall is a
 * worse answer than a red ghost saying "not there".
 */
function sandbagFits(x: number, y: number, angle: number): boolean {
  if (!map) return false;
  const ca = Math.cos(angle);
  const sa = Math.sin(angle);
  for (let i = 0; i < 5; i++) {
    const along = (i / 4 - 0.5) * 2 * BARRICADE_HALF_WIDTH;
    const px = x + ca * along;
    const py = y + sa * along;
    for (const w of map.walls) {
      if (px >= w.x - 2 && px <= w.x + w.w + 2 && py >= w.y - 2 && py <= w.y + w.h + 2) return false;
    }
  }
  return true;
}

/**
 * Is there a mast standing anywhere at all?
 *
 * The *only* question the wheel asks about the beacon. There is deliberately
 * no second test for being close enough to it: the order is given to the
 * people around you and points them at a fixed place the whole city knows
 * about, so how far away the mast is has nothing to do with whether you can
 * shout. Gating on that distance meant finding survivors out in the city and
 * having no way to send them anywhere — the one job the beacon exists for.
 */
function beaconExists(): boolean {
  return towers.length > 0;
}

/** Whether the wheel should offer an ability, or grey it out and refuse it. */
function abilityUsable(id: AbilityId): boolean {
  if (id === "rally") return rallyCharges > 0;
  if (id === "follow") return followCharges > 0;
  // The beacon shout is a command like any other, and costs the same charge.
  if (id === "beacon") return rallyCharges > 0;
  return true; // releasing people you already have costs nothing
}

/**
 * `?spectate` on the URL drops straight into spectator mode on connect,
 * watching the round already in progress. `?spectate=new` starts a fresh one
 * to watch from the beginning.
 */
const spectateParam = new URLSearchParams(location.search).get('spectate');
const startSpectating = spectateParam !== null;

/**
 * False while the front end is up. The socket is live either way, but you have
 * no entity in any city until your lobby starts, and nothing is sent or drawn
 * until then — so keys pressed at the menu drive nobody. A spectator link
 * skips the front end entirely.
 */
let started = startSpectating;
/** This round is offline, so it is ours alone to pause. */
let solo = false;
let paused = false;
if (startSpectating) document.getElementById('shell')!.classList.add('hidden');

const { send, goOffline, goOnline, goHost, goGuest } = connect((msg) => {
  // The front end reads the lobby traffic; the game below ignores it.
  frontEnd?.handle(msg);
  if (msg.type === 'welcome') {
    selfId = msg.selfId;
    map = msg.map;
    setWorldSize(map.width, map.height);
    if (startSpectating) send({ type: 'spectate', restart: spectateParam === 'new' });
  } else if (msg.type === 'map') {
    map = msg.map;
    // **Before anything below reads a world dimension.** The city is sized by
    // the host's population slider, so the map that just arrived is the only
    // thing that knows how big this one is — and the spectator camera two
    // dozen lines down recentres on the middle of it.
    setWorldSize(map.width, map.height);
    tracers = [];
    // Drop the old snapshot too: keeping it would compute one frame of fog
    // from stale positions against the new map's walls.
    tracked.clear();
    cachedPoly = [];
    cachedX = Number.NaN;
    cachedY = Number.NaN;
    brokenWindows = new Set();
    doorStates.clear();
    doorPrompt = null;
    doorEpoch++;
    // A fresh city has none of the last one's blood on it, and no dog's legs
    // half way through a stride they took in a street that no longer exists.
    clearBlood();
    clearLashScars();
    clearDogPoses();
    // The corner map is baked from the city it was built for, and the identity
    // check in `dogMapBaseFor` would catch this on its own — dropping it here
    // as well is what stops a whole city's worth of canvas being held alive by
    // a module-level reference for the rest of the session.
    clearDogMap();
    // A new city starts framed on the whole thing again.
    spectateZoom = 1;
    spectateX = WORLD_WIDTH / 2;
    spectateY = WORLD_HEIGHT / 2;
    gameOver = false;
    victory = false;
    gameOverPanel.classList.add('hidden');
    victoryPanel.classList.add('hidden');
  } else if (msg.type === 'state') {
    syncTracked(msg.entities, performance.now());
    // An offline round's worker keeps ticking after `lobbyLeave` — leaving a
    // lobby does not disconnect from it, see `goOffline` in `net.ts` — so
    // without this, a zombie behind the menu would go on groaning and
    // attacking forever after quitting. `started` is exactly "there is a
    // round on screen to make a noise about".
    //
    // `!paused` is a separate condition and not covered by `started` at all:
    // the world freezes but snapshots keep arriving the whole time it's
    // paused (see `world.paused`), and `hearZombies`'s groan clock reads
    // `performance.now()` — real wall time, not game time — so without this a
    // paused round would sit there quietly ticking its own groan timers down
    // and firing new ones on schedule, sound going on entirely on its own
    // while nothing on screen moves.
    if (started && !paused) {
      hearRoars(msg.entities);
      hearZombies(msg.entities, performance.now());
    }
    spectating = msg.spectating;
    survivors = msg.survivors;
    infectedCount = msg.infected;
    zombieCount = msg.zombies;
    stamina = msg.stamina;
    if (msg.brokenWindows.length !== brokenWindows.size) {
      brokenWindows = new Set(msg.brokenWindows);
    }
    // Only doors near the viewer are sent, so this merges rather than replaces
    // — a door left behind keeps whatever state it was last seen in. Anything
    // that changes whether a door blocks sight invalidates the fog occluders.
    for (const door of msg.doors) {
      const had = doorStates.get(door.i);
      if (!had || had.open !== door.open || had.broken !== door.broken) doorEpoch++;
      doorStates.set(door.i, door);
    }
    doorPrompt = msg.doorPrompt;
    rallyCharges = msg.rallyCharges;
    followCharges = msg.followCharges;
    following = msg.following;
    pickups = msg.pickups;
    inventory = msg.inventory;
    // When the black lifts, so the screen can fade back *in*. The server says
    // "dying 0..1" and then simply stops; how long the coming-back takes is a
    // drawing decision and lives here.
    //
    // **What it comes back up on is no longer the animal.** `dying` ending and
    // the birth beginning are the same instant, so this fires exactly where it
    // always did and now reveals the shambler convulsing rather than a dog
    // already on its feet — which is the whole of what the birth changed on
    // this side.
    if ((dogHud?.dying ?? -1) >= 0 && (msg.dog?.dying ?? -1) < 0) {
      dogRoseAt = performance.now();
    }
    dogHud = msg.dog;
    // The dog's own ending, which is nothing to do with the global one — the
    // city carries on and it watches, so this is its panel and not that one.
    dogOutPanel.classList.toggle('hidden', !(dogHud?.out ?? false));
    grenades = msg.grenades;
    smokes = msg.smokes;
    acid = msg.acid;
    spits = msg.spits;
    tentacles = msg.tentacles;
    lashes = msg.lashes;
    // Cheap and exact: the polygon only cares where the circles are and how big
    // they are, and both are already whole numbers on the wire.
    const shape = acid.map((c) => `${c.x},${c.y},${c.r},${c.s}`).join('|');
    if (shape !== acidShape) {
      acidShape = shape;
      acidEpoch++;
      acidOccluders = [];
      for (const c of acid) for (const l of acidLobes(c.s, c.x, c.y, c.r)) acidOccluders.push(l);
    }
    blasts = msg.blasts;
    ducks = msg.ducks;
    emplacements = msg.emplacements;
    barricades = msg.barricades;
    // `?? []` because the two machines can be on different builds — the build
    // stamp on the menu exists precisely because that happens — and a snapshot
    // from a server that predates this field would otherwise take the renderer
    // out on the first frame.
    buildSites = msg.buildSites ?? [];
    vehicles = msg.vehicles;
    syncVehicles(vehicles);
    mines = msg.mines;
    corpses = msg.corpses;
    towers = msg.towers;
    zaps = msg.zaps;
    fires = msg.fires;
    helicopters = msg.helicopters;
    speech = msg.speech;
    exhausted = msg.exhausted;
    serverTickMs = msg.tickMs;
    beacons = msg.beacons;
    if (msg.gameOver !== gameOver) {
      gameOver = msg.gameOver;
      gameOverPanel.classList.toggle('hidden', !gameOver);
    }
    if (msg.victory !== victory) {
      victory = msg.victory;
      victoryPanel.classList.toggle('hidden', !victory);
    }
    if (msg.shots.length > 0) {
      const now = performance.now();
      for (const shot of msg.shots) {
        tracers.push({ ...shot, born: now });
        // A round that found a body, and where it stopped. Nothing about blood
        // is on the wire — `hit` and the endpoint are already here for the
        // tracer, so the splatter is derived from what is being drawn anyway.
        // A cure and a flame both "hit" and neither draws any. `light` marks a
        // pistol round, which leaves a smaller, sparser stain.
        if (shot.hit && shot.kind === undefined) {
          spawnBlood(
            shot.x2,
            shot.y2,
            Math.atan2(shot.y2 - shot.y1, shot.x2 - shot.x1),
            now,
            shot.light === true,
          );
        }
      }
    }
    // Zombies that died this tick — one transient record each, like a shot. The
    // client throws a ragdoll-and-grey corpse and deletes the fade ghost so the
    // two don't both draw. Gated on the setting; off, the kill just fades out.
    if (msg.deaths.length > 0 && settings.corpses && settings.blood) {
      const now = performance.now();
      for (const d of msg.deaths) {
        tracked.delete(d.id);
        spawnCorpse(d.x, d.y, d.a, now);
      }
    }
  }
});

/**
 * Built after the socket because it needs to send on it. Nothing can arrive
 * before this line runs — messages are delivered on a later task — so the
 * handler above is never called with this still unassigned.
 */
const frontEnd = startSpectating
  ? null
  : setupMenu({
      send,
      goOffline,
      goHost,
      goGuest,
      goOnline,
      onStart: (offline) => {
        started = true;
        solo = offline;
        paused = false;
        pausePanel.classList.add('hidden');
        // A digit typed into the chat box latched a slot key on the way past.
        input.slotPressed = -1;
        // `resetWorld` clears the server's copy of this on every fresh round,
        // so a player who left the row set before clicking START has to be
        // told again — the server ignores it outright unless this round is
        // actually offline, so sending it unconditionally costs nothing.
        send({ type: 'testDogAbilities', free: !settings.dogLimits });
      },
      onEnd: standDown,
    });

/** Put the round down. Nothing about it should carry into the next one. */
function standDown(): void {
  started = false;
  solo = false;
  paused = false;
  pausePanel.classList.add('hidden');
  wheel.open = false;
  armedAbility = null;
  closeMinimap();
  input.rightDown = false;
  input.shooting = false;
  input.slotPressed = -1;
  pushX = 0;
  pushY = 0;
  dogHud = null;
  roaringDogs.clear();
  zombieVoices.clear();
  attackingZombies.clear();
  // The offline worker keeps ticking after this — see the note beside
  // `hearRoars`'s call site — so this is what actually silences a round
  // rather than merely stopping new sounds from being scheduled.
  stopAllSounds();
  tracked.clear();
  tracers = [];
  gameOverPanel.classList.add('hidden');
  victoryPanel.classList.add('hidden');
  dogOutPanel.classList.add('hidden');
}

/**
 * Escape leaves the round outright. Leaving the lobby is what takes you out of
 * the world — the server despawns you, and closes the lobby behind you if it
 * was yours — so this is a real exit rather than a screen over a game still
 * being played underneath.
 */
function quitToMenu(): void {
  if (!frontEnd) return; // a spectator link has no menu to go back to
  send({ type: 'lobbyLeave' });
  standDown();
  frontEnd.reopen();
}

/**
 * The dog's four ability slots, left to right.
 *
 * **Q, E, R, F — not Q, W, E, R, and the reason is WASD.** `KeyW` walks the dog
 * north, so a row starting Q/W would fire slot 2 every single time the animal
 * ran forward. It cost nothing while slot 2 was empty and would have been
 * unplayable the day anything went in it, which is exactly the kind of thing
 * that is cheap to move now and expensive to move later.
 *
 * The row moved down one rather than dropping W and closing the gap: the
 * hexagons are a fixed row and the value of one is that a key is always in the
 * same place, so shifting the whole thing keeps left-to-right reading order and
 * keeps the roar on Q where it already was.
 *
 * **`KeyE` is free for a dog, and that is not an accident of layout.**
 * `processInteractions` walks `world.playerIds` and bails on anything without
 * an inventory — a dog has none — so E never reaches a door or a pickup for
 * one. `input.ts` still latches `interact`; nothing on the dog's side reads it.
 */
const DOG_ABILITY_KEYS = ['KeyQ', 'KeyE', 'KeyR', 'KeyF'];

window.addEventListener('keydown', (e) => {
  // The front end has its own back buttons; this all belongs to a round.
  if (!started) return;
  if (e.code === 'Escape') {
    // Back out of an armed order first, rather than pausing or quitting.
    if (armedAbility) armedAbility = null;
    // A solo round can be stopped and thought about. One with other people in
    // it cannot, so Escape there is still the way out.
    else if (solo) setPaused(!paused);
    else quitToMenu();
  }
  // The dog's bar. Fired on the press, once — `e.repeat` is the auto-repeat a
  // held key produces, and without the guard a finger left on Q sends thirty
  // messages a second to be refused thirty times a second.
  //
  // Nothing here decides whether the ability *may* run: the server owns that
  // (`startDogAbility`), and an empty slot is refused there rather than by the
  // client knowing which of the four are filled. All the client honestly knows
  // is which key went down.
  if (dogHud && !e.repeat && !spectating) {
    const slot = DOG_ABILITY_KEYS.indexOf(e.code);
    if (slot >= 0) send({ type: 'dogAbility', slot });
  }
  // Hold Q to open the ability wheel, always centred on the viewport. A dog
  // has nobody to shout at.
  if (e.code === 'KeyQ' && !wheel.open && !spectating && !dogHud) {
    wheel.open = true;
    wheel.cx = VIEWPORT_WIDTH / 2;
    wheel.cy = VIEWPORT_HEIGHT / 2;
    wheel.hover = -1;
    wheel.deniedIndex = -1;
  }
});

window.addEventListener('keyup', (e) => {
  if (e.code === 'KeyQ') wheel.open = false;
});

/**
 * Two-step order flow: the first click picks an ability off the wheel and arms
 * it, the second click out in the world is what actually issues the order.
 * A click with no charges left refuses, keeping the wheel up and flashing red.
 */
canvas.addEventListener(
  'mousedown',
  (e) => {
    if (e.button !== 0) return;

    // The beacon map. Open it with the handset in hand; while it is up, the
    // first click puts a grey marker down and the second commits it. Once one
    // has been called the map is a readout rather than a decision, and a click
    // just closes it.
    if (minimapOpen) {
      e.stopImmediatePropagation();
      const beacon = inventory?.beacon ?? null;
      if (!beacon || beacon.placed || beacon.pending) {
        closeMinimap();
        return;
      }

      // Layout units, not `canvas.width` — the backbuffer is a different
      // number of real pixels at any render scale but one, and the mouse is
      // reported in the same 1920x1080 space the map was drawn in.
      const frame = minimapFrame(VIEWPORT_WIDTH, VIEWPORT_HEIGHT);
      const inside =
        input.mouseX >= frame.x &&
        input.mouseX <= frame.x + frame.w &&
        input.mouseY >= frame.y &&
        input.mouseY <= frame.y + frame.h;

      // Second click: that is the spot, whatever the cursor is over now. The
      // marker is what is being confirmed, not wherever the mouse has drifted
      // to — moving it is what right-click and a fresh click are for.
      if (beaconPick) {
        send({ type: 'beaconPlace', x: beaconPick.x, y: beaconPick.y });
        closeMinimap();
        return;
      }

      // First click: put the marker down and leave the map up. A click outside
      // the frame with nothing marked closes it, which is the ordinary way out.
      if (inside) {
        beaconPick = {
          x: (input.mouseX - frame.x) / frame.scale,
          y: (input.mouseY - frame.y) / frame.scale,
        };
      } else {
        closeMinimap();
      }
      return;
    }
    if (heldItemId() === 'survivorBeacon' && !wheel.open && !armedAbility) {
      e.stopImmediatePropagation();
      minimapOpen = true;
      // The click that opened it must not also be a trigger pull held down.
      input.shooting = false;
      return;
    }

    if (wheel.open) {
      e.stopImmediatePropagation();
      const options = wheelOptions(following, beaconExists());
      const index = hitTest(wheel, input.mouseX, input.mouseY, options.length);
      if (index < 0) return;

      const picked = options[index];
      if (!abilityUsable(picked.id)) {
        wheel.deniedAt = performance.now();
        wheel.deniedIndex = index;
        send({ type: 'ability', ability: picked.id, x: 0, y: 0 });
        return; // wheel deliberately stays open
      }

      // Only the rally needs somewhere to point at; follow and wait are about
      // the people already around you, so they fire on the spot.
      if (picked.id === 'rally') {
        armedAbility = picked.id;
      } else {
        send({ type: 'ability', ability: picked.id, x: 0, y: 0 });
      }
      wheel.open = false;
      return;
    }

    if (armedAbility) {
      e.stopImmediatePropagation();
      const { view, scale } = cameraFor(self());
      send({
        type: 'ability',
        ability: armedAbility,
        x: view.x + input.mouseX / scale,
        y: view.y + input.mouseY / scale,
      });
      armedAbility = null;
    }
  },
  true,
);

/**
 * Losing the window drops every mode the mouse is in the middle of.
 *
 * `input.ts` already lets go of the keys and buttons on blur, but the wheel and
 * an armed order live up here and did not. Alt-tabbing while holding Q leaves
 * `wheel.open` true for the rest of the round, and the wheel branch swallows
 * every left click from then on — so the beacon map, which is checked *after*
 * it, silently stops opening. Nothing about the symptom points at the wheel,
 * which is what makes it worth closing off rather than leaving to be found.
 */
window.addEventListener('blur', () => {
  wheel.open = false;
  armedAbility = null;
  closeMinimap();
});

// Right-click cancels an armed order instead of firing it off somewhere, and
// on the beacon map it takes back a marker you have put down but not committed.
// With nothing marked it is the way out of the map.
canvas.addEventListener('contextmenu', () => {
  if (minimapOpen) {
    if (beaconPick) beaconPick = null;
    else closeMinimap();
    return;
  }
  armedAbility = null;
});

// ---- spectator RTS: box-select grey officers, right-click to order them ----

canvas.addEventListener('mousedown', (e) => {
  if (!spectating) return;

  if (e.button === 2) {
    // A wall in hand is what right-click is for first — putting it down again
    // rather than issuing a move order at the spot you were about to build on.
    if (sandbagGhost) {
      e.preventDefault();
      sandbagGhost = null;
      return;
    }
    if (selectedOfficers.size === 0) return;
    e.preventDefault();
    const at = spectatorWorld(input.mouseX, input.mouseY);
    const clickedAt = performance.now();
    const override = clickedAt - lastRightAt < DOUBLE_RIGHT_MS;
    // Spent, so a third quick click is a fresh single rather than another
    // override — otherwise holding the button down in a hurry cancels every
    // build in the selection one after another.
    lastRightAt = override ? 0 : clickedAt;
    send({ type: 'command', ids: [...selectedOfficers], x: at.x, y: at.y, override });
    commandFx.push({ x: at.x, y: at.y, born: clickedAt, override });
    return;
  }
  if (e.button !== 0) return;

  // **The card owns its own rectangle.** Checked before anything else, so a
  // click on a button is never also the start of a box-drag through the city
  // behind it — and a press on the panel's empty ground is swallowed too, or
  // dragging off the card marquee-selects whatever is underneath the UI.
  const hit = cardHover();
  if (hit >= 0 || overCard()) {
    const button = commandCardButtons(cardPage, selectedSandbags()).find((b) => b.slot === hit);
    if (button && button.enabled) pressCardButton(button.id);
    return;
  }

  // Siting a wall. One click, one wall — **unless shift is held**, which keeps
  // it in hand for the next one, the way an RTS queues a row of buildings.
  // Without shift the ghost clears, so there is no mode left running that a
  // later click could fall into; the order itself stays visible either way, as
  // a ghost where the officer is walking to.
  //
  // It runs dry rather than repeating forever: the last officer in the
  // selection who has a bag takes the last order, and the next click finds
  // `selectedSandbags` at nought and puts the wall down.
  if (sandbagGhost) {
    const at = spectatorWorld(input.mouseX, input.mouseY);
    send({
      type: 'command',
      ids: [...selectedOfficers],
      x: at.x,
      y: at.y,
      build: 'sandbag',
      angle: sandbagGhost.angle,
    });
    commandFx.push({ x: at.x, y: at.y, born: performance.now() });
    // Counted against the wire's own answer, which is a tick behind — so the
    // one just ordered is still in it. Holding shift with one left over puts
    // the ghost down on its own, which is what the card would say anyway.
    if (!e.shiftKey || selectedSandbags() <= 1) sandbagGhost = null;
    return;
  }

  dragStart = { x: input.mouseX, y: input.mouseY };
  marquee = null;
});

canvas.addEventListener('mousemove', () => {
  if (!spectating || !dragStart) return;
  marquee = { x0: dragStart.x, y0: dragStart.y, x1: input.mouseX, y1: input.mouseY };
});

window.addEventListener('mouseup', (e) => {
  if (e.button !== 0 || !spectating || !dragStart) return;
  const moved = Math.hypot(input.mouseX - dragStart.x, input.mouseY - dragStart.y);
  if (!e.shiftKey) selectedOfficers.clear();

  if (moved < DRAG_THRESHOLD) {
    // A plain click: the nearest grey officer under the cursor, or nothing.
    const at = spectatorWorld(input.mouseX, input.mouseY);
    let best: string | null = null;
    let bestD = 26;
    for (const entry of tracked.values()) {
      const s = entry.state;
      if (!isGreyOfficer(s)) continue;
      const d = Math.hypot(s.x - at.x, s.y - at.y);
      if (d < bestD) {
        bestD = d;
        best = s.id;
      }
    }
    if (best) selectedOfficers.add(best);
  } else {
    // A marquee: every grey officer whose body falls inside it. The spectator
    // camera has no rotation, so screen min/max map straight to world min/max.
    const a = spectatorWorld(Math.min(dragStart.x, input.mouseX), Math.min(dragStart.y, input.mouseY));
    const b = spectatorWorld(Math.max(dragStart.x, input.mouseX), Math.max(dragStart.y, input.mouseY));
    for (const entry of tracked.values()) {
      const s = entry.state;
      if (!isGreyOfficer(s)) continue;
      if (s.x >= a.x && s.x <= b.x && s.y >= a.y && s.y <= b.y) selectedOfficers.add(s.id);
    }
  }
  dragStart = null;
  marquee = null;
});

window.addEventListener('keydown', (e) => {
  if (!spectating || selectedOfficers.size === 0) return;
  // Typing into the lobby's chat or name box is not commanding anybody.
  const target = e.target as HTMLElement | null;
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;

  /*
   * **Grid hotkeys first**, so the card owns its own keys the way it already
   * owns its own rectangle. QWERT / ASDFG / ZXCVB lies over the five columns
   * and three rows exactly as they are drawn, and the letter is printed in each
   * slot — a binding you have to be told about separately is one nobody uses.
   *
   * A key with no enabled button under it falls through, which is what leaves
   * `R` free to hand a selection back today: its slot is empty on both pages.
   * The day something is put there the card takes the key, which is the right
   * way round — the card is the thing with a button on it.
   */
  const slot = cardSlotForKey(e.code);
  if (slot >= 0) {
    const button = commandCardButtons(cardPage, selectedSandbags()).find((b) => b.slot === slot);
    if (button && button.enabled) {
      pressCardButton(button.id);
      e.preventDefault();
      return;
    }
  }

  // H holds the selection where it stands; R hands it back to its own AI.
  if (e.code === 'KeyH') {
    send({ type: 'command', ids: [...selectedOfficers], x: 0, y: 0, stop: true });
  } else if (e.code === 'KeyR') {
    send({ type: 'command', ids: [...selectedOfficers], x: 0, y: 0, release: true });
  }
});

/**
 * Spectator wheel zoom, anchored on the cursor: whatever is under the pointer
 * stays under it, which is what makes zooming into a particular street feel
 * like pulling it closer rather than like the map sliding about.
 */
canvas.addEventListener(
  'wheel',
  (e) => {
    // Playing: the wheel walks the slot bar rather than zooming. A dog has no
    // bar to walk.
    if (!spectating) {
      if (!inventory || dogHud) return;
      e.preventDefault();
      // Grows with a sling or a pack, so the wheel reaches slots the number
      // row runs out of keys for.
      const slots = 1 + inventory.gunSlots + inventory.utilitySlots;
      const step = e.deltaY > 0 ? 1 : -1;
      const next = (inventory.activeSlot + step + slots) % slots;
      inventory.activeSlot = next; // optimistic, the server confirms
      send({ type: 'selectSlot', slot: next });
      return;
    }
    e.preventDefault();

    /*
     * **A wall in hand takes the wheel off the camera.** Checked before the
     * zoom is banked, so siting a barricade is aiming *it* rather than aiming
     * it while the ground slides about underneath. There is nothing else the
     * wheel could mean at that moment, and a camera that moved as well would
     * make a rotation impossible to judge.
     */
    if (sandbagGhost) {
      sandbagGhost.angle += (e.deltaY > 0 ? 1 : -1) * SANDBAG_ROTATE_STEP;
      return;
    }

    // Zoom is applied once per frame rather than per event: a single notch can
    // deliver a burst of wheel events, and re-deriving the camera on each one
    // is what made zooming stutter.
    pendingZoom += e.deltaY;
    pendingZoomAt = { x: input.mouseX, y: input.mouseY };
    return;
  },
  { passive: false },
);

/** Deltas banked since the last frame, applied together in `applyZoom`. */
let pendingZoom = 0;
let pendingZoomAt: { x: number; y: number } | null = null;

function applyZoom(): void {
  if (pendingZoom === 0 || !pendingZoomAt) return;
  const delta = pendingZoom;
  const at = pendingZoomAt;
  pendingZoom = 0;
  pendingZoomAt = null;

  const before = cameraFor(undefined);
  const worldX = before.view.x + at.x / before.scale;
  const worldY = before.view.y + at.y / before.scale;

  const next = clamp(spectateZoom * Math.exp(-delta * 0.0015), SPECTATE_ZOOM_MIN, SPECTATE_ZOOM_MAX);
  if (next === spectateZoom) return;
  spectateZoom = next;

  // Hold whatever was under the cursor where it was.
  const scale = spectateFit() * spectateZoom;
  spectateX = worldX - at.x / scale + VIEWPORT_WIDTH / scale / 2;
  spectateY = worldY - at.y / scale + VIEWPORT_HEIGHT / scale / 2;
}

// Both endings go back to the front end rather than resetting the world where
// everyone stands. A new round is a new lobby now.
gameOverRestart.addEventListener('click', quitToMenu);
victoryRestart.addEventListener('click', quitToMenu);
dogOutRestart.addEventListener('click', quitToMenu);

/**
 * Stop the world, or start it again. The server is what actually freezes —
 * this only asks — but the panel goes up straight away so it doesn't feel
 * like a round trip.
 */
function setPaused(on: boolean): void {
  if (!solo) return;
  paused = on;
  pausePanel.classList.toggle('hidden', !on);
  send({ type: 'lobbyPause', on });
  // The state handler's `!paused` check stops anything *new* from being
  // scheduled, but a groan that was already mid-play when the panel went up
  // would otherwise run out its own two or three seconds over a frozen
  // scene. Cut it off outright instead, the same as quitting does.
  if (on) stopAllSounds();
}

document.getElementById('pause-resume')!.addEventListener('click', () => setPaused(false));
document.getElementById('pause-restart')!.addEventListener('click', () => {
  paused = false;
  pausePanel.classList.add('hidden');
  send({ type: 'lobbyRestart' });
});
document.getElementById('pause-quit')!.addEventListener('click', quitToMenu);

/**
 * Server visibility is binary, so entities would otherwise pop in and out at
 * the fog boundary. Keep a local copy of everything recently seen and ease its
 * opacity, holding the last known pose while it fades out.
 */
interface Tracked {
  /**
   * What is *drawn*. Its position and facing are written by the interpolator
   * below rather than copied from the snapshot — see `ENTITY_FIELDS`.
   */
  state: EntityState;
  alpha: number;
  seen: boolean;
  /** Where the last snapshot put it, and where the newest one does. */
  fromX: number;
  fromY: number;
  fromFacing: number;
  toX: number;
  toY: number;
  toFacing: number;
}
const tracked = new Map<string, Tracked>();

/**
 * **The world simulates at 30Hz and the screen draws at 60.**
 *
 * Without this every body — and the camera, which follows one of them — moved
 * once every second frame and was then shown twice. The frame counter says 60
 * and the motion is 30, which is exactly what "good frames but constant
 * stuttering" is: nothing is dropped, the steps are simply too far apart and
 * too far between. Uneven tick delivery on top of that (see `startClock`) makes
 * the steps different sizes as well.
 *
 * So positions are drawn *between* the last two snapshots rather than at the
 * latest one. The cost is that the world is shown up to one snapshot behind —
 * about 17ms on average — and the benefit is that it moves continuously. The
 * crosshair is client-side and unaffected, so aiming does not feel it.
 */
let snapshotAt = 0;
/**
 * Measured rather than assumed to be `TICK_MS`. Ticks do not arrive evenly, and
 * pacing the interpolation to a cadence the snapshots are not actually keeping
 * is its own stutter — it would arrive early and sit still, or arrive late and
 * jump. Smoothed hard, because one late snapshot should not restretch
 * everything.
 */
let snapshotGap = 1000 / 30;

/**
 * Past this, a body did not walk — it was moved. A dog rising out of a shambler
 * somewhere across the city, or anything respawning, must not be seen to slide
 * there. At 30Hz nothing on foot covers this in one tick.
 */
const TELEPORT_PX = 140;

/** Just the thermal contacts, for the pass that draws them over the fog. */
function* thermalContacts(): Generator<EntityState> {
  for (const entry of tracked.values()) {
    if (entry.state.thermal) yield entry.state;
  }
}

/**
 * Fold a freshly parsed snapshot into the objects we already hold, field by
 * field, rather than keeping the parsed ones.
 *
 * Holding them means every entity the server sends — up to the whole map, for
 * a spectator, thirty times a second — is retained by a long-lived map and
 * survives long enough to be promoted. Copying instead lets the parsed objects
 * die young, where collection is nearly free. The optional flags are assigned
 * unconditionally so an absent one clears rather than lingering.
 */
/**
 * **`x`, `y` and `facing` are deliberately absent**, and this is the one
 * omission from this list that is on purpose.
 *
 * Everything else is copied straight off the snapshot, but those three are
 * driven by `advanceInterpolation` between snapshots — copying them here would
 * slam the body onto the newest position the instant it arrived, which is the
 * 30Hz judder this exists to remove. `syncTracked` puts the incoming values on
 * `toX`/`toY`/`toFacing` instead.
 *
 * Anything else added to `EntityState` still belongs in this list. Leaving a
 * field out by accident means it only ever reaches an entity on the frame it is
 * first seen, which has caught three flags already.
 */
const ENTITY_FIELDS = [
  'type',
  'health',
  'grappling',
  'infected',
  'npc',
  // And the fifth. A grey officer has been on screen a long while by the time
  // he spends his sandbag, so left out of this list the flag would arrive once
  // and never clear — the command card would go on offering a wall out of an
  // officer who has already built his.
  'bag',
  'bot',
  'soldier',
  'materializing',
  'say',
  'hand',
  'armour',
  'shield',
  'stunned',
  'turning',
  'bashing',
  'thermal',
  'breaking',
  'burning',
  'dog',
  'head',
  'lunging',
  // A dog is always already tracked by the time it roars — you have been
  // driving it — so left out of this list the flag could never arrive at all
  // and the animal would roar with its mouth shut and no sound. Exactly the
  // shape of the `dead` bug below.
  'roaring',
  // Missing here once already, with exactly the consequence the note below
  // describes: a dog that died had been tracked since it spawned, so `dead`
  // never reached it and it went on drawing as a live animal — eyes lit, health
  // bar up — stood on top of its own corpse.
  'dead',
  // A birth host is a shambler that has been on screen for a while by the time
  // anything starts happening to it — the third body this list has caught in
  // exactly that shape. Left out, it would convulse on one frame and then stand
  // there perfectly still until it vanished.
  'birthing',
  // And the fourth. A dog tearing itself open has been on screen since it
  // spawned, so left out of this list the ramp would arrive once and then stop
  // — the animal would grow for a single frame and stand there at its old size
  // for the whole twenty seconds. Exactly the shape of the three above.
  'morph',
  'morphing',
] as const satisfies ReadonlyArray<keyof EntityState>;

function copyInto(into: EntityState, from: EntityState): void {
  // Driven by the list above rather than a hand-written run of assignments.
  // Two flags were added to EntityState and never copied, so they only ever
  // reached an entity on the frame it was first seen — kevlar's ring and the
  // door-breaking animation were both invisible for exactly that reason.
  const target = into as unknown as Record<string, unknown>;
  const source = from as unknown as Record<string, unknown>;
  for (const key of ENTITY_FIELDS) target[key] = source[key];
}

/**
 * How far a roar carries to the ear, for the drop-off alone.
 *
 * Deliberately *not* `DOG_ROAR_RANGE`: that is how far the sound reaches the
 * horde, which is a rule about the game, and this is how loud it is in your
 * headphones, which is a rule about the mix. Tying them together would mean a
 * balance change to one silently rewriting the other.
 */
const ROAR_EARSHOT = 1400;

/**
 * How loud, which way, and how muffled a world sound should be for whoever is
 * plugged in right now — a player's own body, or a spectator's camera centre.
 *
 * One function for every positional sound in the game, so a zombie's groan and
 * the dog's roar both answer "where is this, and how clear a line does it have
 * to me" the same way. `range` is where it falls to nothing; past that this
 * returns silence outright rather than a number close to it, so a caller never
 * has to ask twice.
 */
function spatialFor(x: number, y: number, range: number): Spatial {
  const me = self();
  const ear = me ?? { x: spectateX, y: spectateY };
  const dx = x - ear.x;
  const dy = y - ear.y;
  const dist = Math.hypot(dx, dy);
  if (dist >= range) return { gain: 0, pan: 0, muffle: 0 };

  // Steeply curved rather than linear or gently curved: most of the range is
  // meant to read as "somewhere out there", with only the last stretch close
  // to the source actually loud. A flatter curve (this was 1.4) kept mid-
  // distance zombies far too present — audible at something close to their
  // point-blank volume from most of the way across the hearing range.
  const distFalloff = Math.pow(Math.max(0, 1 - dist / range), 3);

  // Pulled all the way back as a spectator, the whole mix goes quiet — a wide
  // shot of the city is not somewhere a street should sound like you're
  // standing in it. A player's own camera never drops this low (`cameraZoom`
  // is always >= 1), so `zoomMul` is 1 through ordinary play and this line
  // does nothing until somebody actually zooms out to watch.
  const { scale } = cameraFor(me);
  const zoomMul = Math.pow(Math.max(0, Math.min(1, scale)), 1.6);

  // Reaches hard left/right well inside the hearing range (this was 0.7),
  // because the point of panning is to say which way to look — a sound stayed
  // reads as coming from dead centre, out of both speakers alike, unless it
  // is a long way to one side, which is the opposite of "clear".
  const panRange = Math.max(1, range * 0.4);
  const pan = Math.max(-1, Math.min(1, dx / panRange));

  const hits = map ? occlusion(ear.x, ear.y, x, y, map.walls) : 0;
  const muffle = Math.min(1, hits / 2.5);
  // A wall does not just dull a sound, it takes some of it away too.
  const gain = distFalloff * zoomMul * (1 - muffle * 0.6);

  return { gain, pan, muffle };
}

/**
 * Which dogs were roaring last snapshot.
 *
 * The wire carries a flag that is true for two solid seconds at 30Hz, so the
 * sound has to fire on the *edge* — played off the flag directly it would start
 * sixty overlapping copies of itself.
 */
let roaringDogs = new Set<string>();

/**
 * Hear anything that started roaring since the last snapshot.
 *
 * Driven off the entities rather than off `dogHud`, so somebody else's dog is
 * heard too — which is the point of a two-second tell.
 */
function hearRoars(incoming: EntityState[]): void {
  const started: string[] = [];
  const nowRoaring = new Set<string>();
  for (const e of incoming) {
    if (!e.dog || !e.roaring) continue;
    nowRoaring.add(e.id);
    if (!roaringDogs.has(e.id)) started.push(e.id);
  }
  roaringDogs = nowRoaring;
  if (started.length === 0) return;

  for (const id of started) {
    // Your own animal is in your own head and is not subject to the falloff.
    if (id === selfId) {
      playRoar({ gain: 1, pan: 0, muffle: 0 });
      continue;
    }
    const dog = tracked.get(id)?.state;
    if (!dog) {
      playRoar({ gain: 1, pan: 0, muffle: 0 });
      continue;
    }
    playRoar(spatialFor(dog.x, dog.y, ROAR_EARSHOT));
  }
}

/**
 * A stable 0-1 hash of an id, so a zombie's voice — its rough pitch and
 * timbre — stays the same from one groan to the next without every zombie in
 * the city sounding identical. Everything past this is `Math.random()`; only
 * the part that has to stay recognisable as *this* zombie is hashed.
 */
function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (Math.imul(h, 31) + id.charCodeAt(i)) | 0;
  return ((h >>> 0) % 100000) / 100000;
}

/**
 * How far a zombie's groan or bite carries. Shorter than the dog's roar on
 * purpose — a moan down the street is ambience and is not meant to reach
 * across the whole one.
 */
const ZOMBIE_HEARING_RANGE = 1050;
/**
 * Wide on purpose, and wider than they first were — see the note on
 * `ZOMBIE_VOICE_BUDGET`. A zombie groaning every four to eleven seconds reads
 * as constant chatter once the sounds this engine makes stop being the only
 * thing on the mix; a genuinely intermittent groan is worth more than a
 * frequent one, and this game is not finished adding sounds.
 */
const ZOMBIE_GROAN_MIN_MS = 8000;
const ZOMBIE_GROAN_MAX_MS = 20000;

/** How likely a zombie is to react to being shot, and how long before it may
 *  react again. Most hits pass in silence — a zombie taking a magazine to the
 *  chest is not a magazine's worth of yelps — and the cooldown is what stops
 *  a sustained burst re-asking the question thirty times a second. */
const ZOMBIE_HIT_SOUND_CHANCE = 0.3;
const ZOMBIE_HIT_SOUND_COOLDOWN_MS = 1200;

interface ZombieVoice {
  /** When it's next due to groan, so long as it isn't busy attacking something. */
  nextGroanAt: number;
  /** Its stable timbre — see `hashId`. */
  voice: number;
  /** Health as of the last snapshot, so a drop can be read as "this zombie
   *  was just hit" with no flag of its own on the wire. */
  lastHealth: number;
  /** Earliest the next hit-reaction may be considered, win or lose the roll. */
  nextHitSoundAt: number;
}

/** One entry per zombie currently or recently on screen. */
const zombieVoices = new Map<string, ZombieVoice>();
/** Ids mid-attack last snapshot, for edge-detecting the bite/claw bark. */
let attackingZombies = new Set<string>();

/**
 * How many zombie voices — groans, attacks and hit-reactions together — may
 * start inside one short window.
 *
 * A handful of shamblers groaning nearby is atmosphere; a few hundred in a big
 * city with the camera pulled down into the middle of them is every voice this
 * engine owns firing on the same tick, which stops being audio and starts
 * being noise. This is a ceiling for that case alone — normal play, a handful
 * of zombies in earshot, never comes close to spending it. Tightened
 * alongside the groan interval above for the same reason: this game is not
 * finished adding sounds, and the zombies should not be spending the whole
 * budget on their own.
 */
const ZOMBIE_VOICE_BUDGET = 4;
const ZOMBIE_VOICE_WINDOW_MS = 280;
let voiceBudgetAt = 0;
let voiceBudgetLeft = ZOMBIE_VOICE_BUDGET;

function takeVoiceBudget(now: number): boolean {
  if (now - voiceBudgetAt > ZOMBIE_VOICE_WINDOW_MS) {
    voiceBudgetAt = now;
    voiceBudgetLeft = ZOMBIE_VOICE_BUDGET;
  }
  if (voiceBudgetLeft <= 0) return false;
  voiceBudgetLeft--;
  return true;
}

/**
 * Groan and bite, for every shambler on screen.
 *
 * The dog is left out of this entirely — it has its own roar, and its jaws
 * are a player's own doing rather than an ambient tell. Everything else here
 * is a wandering or grappling zombie, which is most of what a round sounds
 * like once the outbreak has taken hold.
 */
function hearZombies(incoming: EntityState[], now: number): void {
  const attackingNow = new Set<string>();
  for (const e of incoming) {
    if (e.type !== 'zombie' || e.dog) continue;

    let v = zombieVoices.get(e.id);
    if (!v) {
      // A fresh one doesn't groan on the very tick it comes into view — the
      // first wait is staggered, so a horde arriving together doesn't groan
      // as a single chorus. `lastHealth` starts at its current health rather
      // than, say, its max, so a zombie that was already hurt before it came
      // into view doesn't read as having just been shot on its first tick.
      v = {
        nextGroanAt: now + Math.random() * ZOMBIE_GROAN_MAX_MS,
        voice: hashId(e.id),
        lastHealth: e.health,
        nextHitSoundAt: 0,
      };
      zombieVoices.set(e.id, v);
    }

    // A rough "was this zombie just shot" — there's no flag for it on the
    // wire, so a health drop since last snapshot stands in for one. Checked
    // (and the cooldown spent) whether or not the chance roll below actually
    // plays anything, or a sustained burst would re-roll thirty times a
    // second instead of once per cooldown window.
    if (e.health < v.lastHealth && e.health > 0 && now >= v.nextHitSoundAt) {
      v.nextHitSoundAt = now + ZOMBIE_HIT_SOUND_COOLDOWN_MS;
      if (Math.random() < ZOMBIE_HIT_SOUND_CHANCE) {
        const spatial = spatialFor(e.x, e.y, ZOMBIE_HEARING_RANGE);
        if (spatial.gain > 0.012 && takeVoiceBudget(now)) playZombieHit(spatial, v.voice);
      }
    }
    v.lastHealth = e.health;

    // Attacking a person (`grappling`) or a door/wall (`breaking`) is the
    // same bark — both are the zombie actually doing something, as against
    // groaning at nothing in particular.
    const attacking = !!(e.grappling || e.breaking);
    if (attacking) {
      attackingNow.add(e.id);
      // Postpones the next groan, so the two don't talk over each other —
      // but never brings it forward, or a zombie that keeps losing and
      // regaining its grip would never groan at all.
      v.nextGroanAt = Math.max(v.nextGroanAt, now + ZOMBIE_GROAN_MIN_MS);
      if (!attackingZombies.has(e.id)) {
        const spatial = spatialFor(e.x, e.y, ZOMBIE_HEARING_RANGE);
        if (spatial.gain > 0.012 && takeVoiceBudget(now)) playZombieAttack(spatial, v.voice);
      }
      continue;
    }

    if (now >= v.nextGroanAt) {
      const spatial = spatialFor(e.x, e.y, ZOMBIE_HEARING_RANGE);
      if (spatial.gain > 0.015 && takeVoiceBudget(now)) playZombieGroan(spatial, v.voice);
      v.nextGroanAt =
        now + ZOMBIE_GROAN_MIN_MS + Math.random() * (ZOMBIE_GROAN_MAX_MS - ZOMBIE_GROAN_MIN_MS);
    }
  }
  attackingZombies = attackingNow;

  // Forget anything that's left the fog for good, so a long round doesn't
  // grow this forever. Fog already caps how many zombies are visible at once,
  // so this is rarely more than a few dozen entries and checking it often is
  // cheap.
  if (zombieVoices.size > 250) {
    for (const id of zombieVoices.keys()) {
      if (!attackingNow.has(id) && !tracked.has(id)) zombieVoices.delete(id);
    }
  }
}

function syncTracked(incoming: EntityState[], now: number): void {
  // How far apart the snapshots are actually arriving, which is what the
  // interpolation has to be paced to.
  if (snapshotAt > 0) {
    const gap = now - snapshotAt;
    // A pause — tabbed away, a breakpoint — is not a cadence to learn from.
    if (gap > 4 && gap < 400) snapshotGap = snapshotGap * 0.8 + gap * 0.2;
  }
  snapshotAt = now;

  for (const entry of tracked.values()) entry.seen = false;
  for (const e of incoming) {
    const entry = tracked.get(e.id);
    if (entry) {
      copyInto(entry.state, e);
      entry.seen = true;
      // Start the next leg from wherever it is being *drawn*, not from the
      // previous target — otherwise a snapshot that arrives early leaves a
      // visible snap back to a position it had already moved past.
      entry.fromX = entry.state.x;
      entry.fromY = entry.state.y;
      entry.fromFacing = entry.state.facing;
      entry.toX = e.x;
      entry.toY = e.y;
      entry.toFacing = e.facing;
      // Moved rather than walked: put it there outright.
      if (Math.abs(e.x - entry.fromX) > TELEPORT_PX || Math.abs(e.y - entry.fromY) > TELEPORT_PX) {
        entry.fromX = e.x;
        entry.fromY = e.y;
        entry.fromFacing = e.facing;
        entry.state.x = e.x;
        entry.state.y = e.y;
        entry.state.facing = e.facing;
      }
    } else {
      tracked.set(e.id, {
        state: { ...e },
        alpha: 0,
        seen: true,
        fromX: e.x,
        fromY: e.y,
        fromFacing: e.facing,
        toX: e.x,
        toY: e.y,
        toFacing: e.facing,
      });
    }
  }

  /**
   * A birth host that has stopped being sent has burst, and the gore is thrown
   * here rather than sent.
   *
   * Same trick as blood off `Shot.hit`: the client already knows everything it
   * needs — where the body was and how far through its convulsion it had got —
   * so an event on the wire would be a second source of truth for a thing that
   * happens once a death. It is also why the entry is deleted outright instead
   * of being left to `advanceFades`: a body that burst must not then spend
   * `ENTITY_FADE_MS` politely dissolving where it stood.
   *
   * **Gated on it having been nearly finished**, because a host can leave a
   * snapshot for the ordinary reason as well — some *other* viewer across the
   * street loses sight of it half way through. The dog it belongs to cannot,
   * its own body being parked on top of the thing, but the flag is sent to
   * everybody on purpose and this is the cost of that.
   */
  for (const [id, entry] of tracked) {
    if (entry.seen || (entry.state.birthing ?? 0) < BIRTH_BURST_AT) continue;
    spawnBurst(entry.state.x, entry.state.y, now);
    tracked.delete(id);
  }
}

/**
 * **Vehicles are interpolated too, and for a long time they were not.**
 *
 * Everything above is about entities; `vehicles` was reassigned straight off the
 * snapshot and drawn where the last tick put it. The world simulates at 30Hz
 * and the screen draws at up to 144, so a van slid in 30Hz steps while every
 * body around it moved continuously — reported as stuttering, and it is exactly
 * the fault the note above `snapshotAt` describes, left un-fixed for the one
 * thing on screen whose whole job is a two-second movement you watch.
 *
 * **Matched by index rather than by an id on the wire.** `vehiclesToWire` maps
 * `world.vehicles.values()` in insertion order and nothing ever removes one
 * (only `resetWorld` clears the lot), so slot *i* is the same vehicle from one
 * snapshot to the next — and it costs no wire bytes for a handful of bodies.
 * The guard below is what makes that safe rather than merely true today: a slot
 * whose kind changed, or that moved further than anything can drive in a tick,
 * is snapped instead of walked. If the assumption ever breaks the worst case is
 * the behaviour this replaced.
 */
interface VehicleLerp {
  kind: 'van' | 'car';
  fromX: number;
  fromY: number;
  fromFacing: number;
  toX: number;
  toY: number;
  toFacing: number;
}
let vehicleLerp: VehicleLerp[] = [];

/** Fold a fresh snapshot's vehicles into the interpolation. */
function syncVehicles(incoming: BackupVehicleState[]): void {
  const next: VehicleLerp[] = [];
  for (let i = 0; i < incoming.length; i++) {
    const v = incoming[i];
    const prev = vehicleLerp[i];
    const same =
      prev !== undefined &&
      prev.kind === v.kind &&
      Math.abs(v.x - prev.toX) < TELEPORT_PX &&
      Math.abs(v.y - prev.toY) < TELEPORT_PX;
    next.push({
      kind: v.kind,
      fromX: same ? prev.toX : v.x,
      fromY: same ? prev.toY : v.y,
      fromFacing: same ? prev.toFacing : v.facing,
      toX: v.x,
      toY: v.y,
      toFacing: v.facing,
    });
  }
  vehicleLerp = next;
}

/** The shorter way round the circle, so a body turning past π doesn't spin. */
function shortestTurn(from: number, to: number): number {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/**
 * Walk every body from where the last snapshot put it toward where the newest
 * one does, by however much of the gap between them has elapsed.
 */
function advanceInterpolation(now: number): void {
  /*
   * Always run, even with smoothing off. `x`, `y` and `facing` are no longer
   * copied by `copyInto`, so this is the only thing that writes them — turning
   * it off entirely would leave every body frozen where it first appeared.
   * Off simply means going straight to the newest snapshot instead of walking
   * there, which is exactly what the client did before any of this.
   */
  const t = settings.smoothMotion
    ? Math.min(1, Math.max(0, (now - snapshotAt) / snapshotGap))
    : 1;
  for (const entry of tracked.values()) {
    entry.state.x = entry.fromX + (entry.toX - entry.fromX) * t;
    entry.state.y = entry.fromY + (entry.toY - entry.fromY) * t;
    entry.state.facing = entry.fromFacing + shortestTurn(entry.fromFacing, entry.toFacing) * t;
  }
  // Written into the snapshot objects themselves, which is safe because they
  // are parsed fresh every tick — `vehicleLerp` is what carries the previous
  // pose across, not the array being drawn.
  for (let i = 0; i < vehicles.length && i < vehicleLerp.length; i++) {
    const lerp = vehicleLerp[i];
    vehicles[i].x = lerp.fromX + (lerp.toX - lerp.fromX) * t;
    vehicles[i].y = lerp.fromY + (lerp.toY - lerp.fromY) * t;
    vehicles[i].facing = lerp.fromFacing + shortestTurn(lerp.fromFacing, lerp.toFacing) * t;
  }
}

function advanceFades(dtMs: number): void {
  for (const [id, entry] of tracked) {
    // Zombies arriving at the start of a round ease in far more slowly.
    const duration = entry.state.materializing ? MATERIALIZE_MS : ENTITY_FADE_MS;
    const stepAmount = dtMs / duration;
    entry.alpha = clamp(entry.alpha + (entry.seen ? stepAmount : -stepAmount), 0, 1);
    if (!entry.seen && entry.alpha <= 0) tracked.delete(id);
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function self(): EntityState | undefined {
  return selfId === null ? undefined : tracked.get(selfId)?.state;
}

/** Spectators frame the whole map; players get a follow camera at 1:1. */
/**
 * Spectator zoom. 1 is the whole city on screen and is deliberately the floor
 * — there is nothing to see further out than the map, and letting it go
 * further just shrinks the city into the middle of a black screen.
 */
const SPECTATE_ZOOM_MIN = 1;
const SPECTATE_ZOOM_MAX = 7;
/**
 * A function, not a constant. The city is not one size any more — the lobby's
 * population slider sets it, and `setWorldSize` writes it out of whatever map
 * arrives — so a fit worked out at import time would frame the *launch* size
 * forever and leave a smaller city drawn as a postage stamp in the corner of
 * the screen with no way to zoom in on it.
 */
const spectateFit = () => Math.min(VIEWPORT_WIDTH / WORLD_WIDTH, VIEWPORT_HEIGHT / WORLD_HEIGHT);
let spectateZoom = 1;
let spectateX = WORLD_WIDTH / 2;
let spectateY = WORLD_HEIGHT / 2;

function cameraFor(view: EntityState | undefined): { view: Viewport; scale: number } {
  if (spectating || !view) {
    const scale = spectateFit() * spectateZoom;
    const w = VIEWPORT_WIDTH / scale;
    const h = VIEWPORT_HEIGHT / scale;
    // Centre on wherever they've zoomed to, but never past the map's edges.
    // Once an axis is wider than the world it stays centred on it instead.
    return {
      view: {
        x: w >= WORLD_WIDTH ? (WORLD_WIDTH - w) / 2 : clamp(spectateX - w / 2, 0, WORLD_WIDTH - w),
        y: h >= WORLD_HEIGHT ? (WORLD_HEIGHT - h) / 2 : clamp(spectateY - h / 2, 0, WORLD_HEIGHT - h),
        w,
        h,
      },
      scale,
    };
  }
  // A player's camera is pulled in by `CAMERA_ZOOM` — the backbuffer stays
  // 1920x1080 and you simply see less ground, larger. Down a scope it slides
  // off the officer toward the reticle rather than zooming out; that is
  // `updateScope`, and it rides on top of this.
  const zoom = cameraZoom();
  const w = VIEWPORT_WIDTH / zoom;
  const h = VIEWPORT_HEIGHT / zoom;
  return {
    view: {
      x:
        w >= WORLD_WIDTH
          ? (WORLD_WIDTH - w) / 2
          : clamp(view.x + pushX - w / 2, 0, WORLD_WIDTH - w),
      y:
        h >= WORLD_HEIGHT
          ? (WORLD_HEIGHT - h) / 2
          : clamp(view.y + pushY - h / 2, 0, WORLD_HEIGHT - h),
      w,
      h,
    },
    scale: zoom,
  };
}

/**
 * How far the camera has run off the officer, in world pixels. Eased, so
 * raising and lowering the scope is a movement rather than a jump — a hard cut
 * re-frames the whole screen in one frame and reads as a glitch.
 */
let pushX = 0;
let pushY = 0;

/**
 * How far a scope lets the camera run: 0 for anything ordinary.
 *
 * A dog carries nothing, so it is always 0 — said outright rather than left to
 * fall out of the empty inventory the server sends it, which answers "pistol"
 * and happens to have no scope. That is the right answer by accident, and it
 * would stop being right the day the placeholder bag changes.
 *
 * The *pan* is not part of this and applies to a dog exactly as it does to an
 * officer: it is a property of the camera, not of what is in your hands.
 */
/**
 * How far the camera is pulled in, for whoever is being driven.
 *
 * The dog sees more ground than an officer — see `DOG_CAMERA_ZOOM`, which is
 * where the reasoning lives. **Every use of the zoom has to come through here.**
 * There are five: the camera itself, the pan, the fog radius, the occluder clip
 * and the fog mask's world-to-mask scale. Miss one and the halves disagree about
 * how much world is on screen, which is the shape of every fog bug this file has
 * ever had — ground lit that has nothing sent for it, or a mask drawn at the
 * wrong size over a view drawn at the right one.
 */
function cameraZoom(): number {
  return dogHud ? DOG_CAMERA_ZOOM : CAMERA_ZOOM;
}

/** The vertical pan that goes with it — capped per zoom, so it moves too. */
function cameraPanY(): number {
  return dogHud ? DOG_CAMERA_PAN_Y : CAMERA_PAN_Y;
}

/**
 * The floor under the fog radius: as far as the server will send for us.
 *
 * **Binoculars widen it from the bag, not from the hand.** The server's
 * `sightRadiusFor` reads `inv.utilities` and this has to read the same thing —
 * a fog hole narrower than what the server populates wastes the item entirely,
 * and one wider than it lights ground with nothing on it, which is the fault
 * this file has now recorded three times. The camera *push* is still
 * held-only; that is what `scopeReach` is for.
 */
function baseSightRadius(): number {
  if (dogHud) return DOG_SIGHT_RADIUS;
  if (inventory?.utilities.includes('binoculars')) return BINOCULAR_SIGHT_RADIUS;
  return PLAYER_SIGHT_RADIUS;
}

function scopeReach(): number {
  if (dogHud) return 0;
  const held = heldItemId();
  if (ITEMS[held ?? 'pistol']?.scope) return SCOPE_PUSH;
  if (held === 'binoculars') return BINOCULAR_PUSH;
  return 0;
}

/**
 * How far the camera may run off the officer on each axis.
 *
 * The pan rides on top of whatever the scope gives, and it is not a scope
 * feature at all — it is there because the viewport is wider than it is tall,
 * so without it you are aware of far more street to either side than above and
 * below. `CAMERA_PAN_Y` is derived to carry that difference and even the two
 * axes up.
 *
 * **It no longer evens them up completely, and that is deliberate.** The
 * derivation asks for 362 world px vertically, which at this zoom is 580 screen
 * px against a half-screen of 540 — so at full deflection the body you are
 * driving was pushed clean off the top of the frame, taking the fog hole with
 * it and leaving nothing on screen but lit ground. `PAN_KEEP_ON_SCREEN` caps it
 * at 243, which reaches 580 world px vertically against 700 sideways. Not equal,
 * but on screen.
 *
 * The cap is on the pan only. A scope still slides the officer off the bottom —
 * that is the intended Foxhole behaviour and `drawSelfMarker` is there for it.
 */
function cameraReach(): { x: number; y: number } {
  const scope = scopeReach();
  return { x: scope + CAMERA_PAN_X, y: scope + cameraPanY() };
}

function updateScope(dt: number): void {
  const reach = cameraReach();

  // Off the *middle of the screen*, not off the officer. He is no longer stood
  // in the middle once the camera has moved, so measuring from him feeds the
  // push back into itself and it slams to the cap on the first twitch of the
  // mouse. The screen centre is fixed, so this mapping is stable.
  const dx = input.mouseX - VIEWPORT_WIDTH / 2;
  const dy = input.mouseY - VIEWPORT_HEIGHT / 2;
  const len = Math.hypot(dx, dy);

  // Measured as *how far to the edge of the screen the cursor has got*, not as
  // raw pixels. The screen is half again as wide as it is tall, so counting
  // pixels gave up-and-down barely half the reach of left-and-right and the
  // camera would hardly lift at all when you aimed up the street. Against the
  // edge in whatever direction you are pointing, you get the whole of it.
  const ux = dx / (len || 1);
  const uy = dy / (len || 1);
  const toEdge = Math.min(
    Math.abs(ux) > 1e-4 ? VIEWPORT_WIDTH / 2 / Math.abs(ux) : Infinity,
    Math.abs(uy) > 1e-4 ? VIEWPORT_HEIGHT / 2 / Math.abs(uy) : Infinity,
  );
  const outward = Math.min(1, len / toEdge);
  const wantX = ux * reach.x * outward;
  const wantY = uy * reach.y * outward;

  // Exponential ease toward it, framerate-independent.
  const k = Math.min(1, dt / SCOPE_EASE_MS);
  pushX += (wantX - pushX) * k;
  pushY += (wantY - pushY) * k;
}

/**
 * How far the fog reaches from the officer.
 *
 * It has to cover wherever the camera can put the screen, or the extra ground
 * is drawn and then blacked out again — which is exactly what raising the
 * sniper used to look like: the server was already sending entities out to
 * SNIPER_SIGHT_RADIUS while the client kept punching a PLAYER_SIGHT_RADIUS
 * hole in the fog, so the far half of the new view was solid dark.
 *
 * Taken as the furthest screen corner the push can produce, *sampled* rather
 * than bounded. The push follows a unit direction, so the two axes cannot both
 * be at their maximum at once and the loose bound over-reaches by a fifth —
 * which is a fifth more ground for the polygon to light for no reason.
 */
function fogRadius(me?: EntityState): number {
  // **Inside a cloud you see nothing**, and this is the client's half of it.
  //
  // The rule is the server's — `hasLineOfSight` fails every line for a viewer
  // whose own position is inside one, so nothing is sent — and a dog is exempt
  // there, so it must be exempt here or its screen would go dark over ground
  // the server is still populating for it.
  //
  // Pulled in to an arm's length rather than closed: a polygon with nothing in
  // it collapses onto the viewer, and that collapse is what both of this game's
  // worst rendering faults looked like from the outside.
  if (me && !dogHud && blindInAcid(me)) return ACID_INSIDE_SIGHT;
  const reach = cameraReach();
  const zoom = cameraZoom();
  let worst = 0;
  for (let i = 0; i <= 8; i++) {
    const a = (i / 8) * (Math.PI / 2);
    // Half the screen in *world* units, which the zoom shrinks — that shrinking
    // is the whole reason zooming in is the fog lever.
    const d = Math.hypot(
      VIEWPORT_WIDTH / (2 * zoom) + Math.cos(a) * reach.x,
      VIEWPORT_HEIGHT / (2 * zoom) + Math.sin(a) * reach.y,
    );
    if (d > worst) worst = d;
  }
  return Math.max(baseSightRadius(), Math.round(worst) + 24);
}

/** Whatever is in the active slot, as an item id. */
/**
 * What is actually in hand, by the same arithmetic the HUD numbers the bar
 * with — `inventory.gunSlots`, the count this bag can *use*, not
 * `inventory.guns.length`, which is the array and is always the full
 * `GUN_SLOTS + GUNSLING_SLOTS`.
 *
 * Those two are the same number only while a gunsling is in the bag, and they
 * were being mixed here. Without one the bar numbers the utilities from 4
 * while this read slot 4 as the fourth *gun* slot — the one the sling would
 * have opened up — found it empty, and answered `null`. Everything the client
 * gates on the held item then quietly stopped: no beacon map, no scope
 * reticle, no charge bars, on every bag in the game without a sling in it.
 * The server never had the bug; `heldItem` there has always asked
 * `gunSlots(inv)`.
 */
function heldItemId(): ItemId | null {
  if (!inventory) return null;
  const slot = inventory.activeSlot;
  if (slot === 0) return 'pistol';
  if (slot <= inventory.gunSlots) return inventory.guns[slot - 1]?.item ?? null;
  return inventory.utilities[slot - inventory.gunSlots - 1] ?? null;
}

/**
 * **The arrows pan the spectator camera, not WASD.** W, A, S and D are four of
 * the fifteen grid hotkeys on the command card, and a watcher pressing S to
 * look further down the street would be pressing the second button of the
 * bottom row. `input.arrows` is tracked separately for exactly this; a player
 * still drives a body with WASD, which reads `input.state`.
 *
 * The speed is in screen pixels per second and divided by the current scale, so
 * a key held for a second slides the view the same distance across the screen
 * whether the whole city is framed or you are zoomed right into one street —
 * panning at 7x zoom in world units would crawl.
 */
const SPECTATE_PAN_SPEED = 700;
const SPECTATE_PAN_SPRINT = 2.5;

function panSpectator(dt: number): void {
  /*
   * The arrows, plus the cursor against the edge of the screen the way every
   * RTS does it. The arithmetic is `spectatorPan`, which is pure and exported
   * so it can be measured without a frame — rAF is throttled to nothing in a
   * pane that is not compositing, so the camera cannot be driven and watched.
   *
   * Edge scrolling is off unless the pointer is **actually over the canvas**.
   * `mousemove` is bound to the canvas, so a pointer that has left the window
   * leaves its last position frozen — and having left by an edge, that position
   * is inside the band. Without it the camera would slide for as long as you
   * were away and you would come back to a view nobody asked for.
   *
   * And off over **the command card**, which sits in the bottom-right corner
   * and so lies across both the right and bottom bands. Reaching for a button
   * must not send the city sliding out from under the officers you are about to
   * give an order to. The card already owns its own rectangle for clicks; this
   * is the same rule for a pointer resting on it.
   */
  const pan = spectatorPan(
    input.arrows,
    input.mouseX,
    input.mouseY,
    input.pointerOver && !overCard(),
  );

  const scale = spectateFit() * spectateZoom;
  const w = VIEWPORT_WIDTH / scale;
  const h = VIEWPORT_HEIGHT / scale;

  if (pan.x !== 0 || pan.y !== 0) {
    const speed = SPECTATE_PAN_SPEED * (input.sprint ? SPECTATE_PAN_SPRINT : 1);
    const step = (speed / scale) * (dt / 1000);
    spectateX += pan.x * step;
    spectateY += pan.y * step;
  }

  // Hold the centre to what the camera can actually show. Letting it run past
  // the edge looks identical on screen but banks up slack, so panning back
  // would sit dead for as long as you overshot. An axis wider than the world
  // is centred on it by cameraFor, so park it there rather than drifting.
  spectateX = w >= WORLD_WIDTH ? WORLD_WIDTH / 2 : clamp(spectateX, w / 2, WORLD_WIDTH - w / 2);
  spectateY = h >= WORLD_HEIGHT ? WORLD_HEIGHT / 2 : clamp(spectateY, h / 2, WORLD_HEIGHT - h / 2);
}

/** The crosshair in world coordinates — where a lobbed round should land. */
function aimPoint(): { x: number; y: number } {
  const me = self();
  if (!me) return { x: 0, y: 0 };
  const { view, scale } = cameraFor(me);
  return { x: view.x + input.mouseX / scale, y: view.y + input.mouseY / scale };
}

function aimAngle(): number {
  const me = self();
  if (!me) return 0;
  const at = aimPoint();
  return Math.atan2(at.y - me.y, at.x - me.x);
}

function sendInputLoop() {
  if (!started) {
    setTimeout(sendInputLoop, 1000 / 30);
    return;
  }

  // Slot keys are edge-triggered, so drain the latch as we send.
  if (input.slotPressed >= 0) {
    send({ type: 'selectSlot', slot: input.slotPressed });
    input.slotPressed = -1;
  }

  const crosshair = aimPoint();
  send({
    type: 'input',
    input: { ...input.state },
    aim: aimAngle(),
    aimX: crosshair.x,
    aimY: crosshair.y,
    // Neither the wheel nor an armed order should empty your magazine.
    shooting: input.shooting && !spectating && !wheel.open && !armedAbility && !minimapOpen,
    sprint: input.sprint,
    interact: input.interact && !spectating,
    // Right-click on the map takes a marker back; it must not also plant a
    // bipod or throw a shield bash out in the world behind it.
    rightDown: input.rightDown && !spectating && !minimapOpen,
  });
  setTimeout(sendInputLoop, 1000 / 30);
}
sendInputLoop();

// The visibility polygon is the expensive part, so it is cached and only
// rebuilt on a slow cadence or once the viewer has actually moved. The mask
// itself is cheap to re-rasterise and follows the camera every frame.
let cachedPoly: FogPoint[] = [];
let cachedAt = 0;
let cachedX = Number.NaN;
let cachedY = Number.NaN;
/** Raising a scope changes how far the polygon reaches, so it can't be reused. */
let cachedRadius = -1;
/** The `doorEpoch` the cached polygon was built against — see `visibilityFor`. */
let cachedEpoch = -1;
let cachedAcidEpoch = -1;
let fogComputeMs = 0;
/** Latches the fog fault so only its edges are logged, not every frame. */
let fogFailing = false;
/** Visible fraction at the last computation, for spotting a sudden jump. */
let fogLastFraction = -1;

/**
 * Walls plus every shut door, for the fog to cast shadows from — a closed door
 * occludes exactly as the wall it hangs in does.
 *
 * Rebuilt only when a door actually opens or shuts, not on every recompute:
 * the fog runs at ~12Hz and rebuilding meant copying the whole wall list each
 * time for a handful of slabs that rarely change.
 */
let occluders: Wall[] = [];
let occludersEpoch = -1;

function occludersFor(map: MapData): Wall[] {
  if (occludersEpoch === doorEpoch && occluders.length > 0) return occluders;
  occludersEpoch = doorEpoch;

  occluders = map.walls.slice();
  for (const [index, state] of doorStates) {
    if (state.open || state.broken) continue;
    const door = map.doors[index];
    if (door) occluders.push(doorSlab(door));
  }
  return occluders;
}

/** True when this body is standing in the dog's acid — in any lobe of any cloud. */
function blindInAcid(me: EntityState): boolean {
  return acidOccluders.length > 0 && inAcidLobes(acidOccluders, me.x, me.y);
}

function visibilityFor(me: EntityState, now: number): FogPoint[] {
  if (!map) return [];
  const radius = fogRadius(me);
  const moved = Math.hypot(me.x - cachedX, me.y - cachedY);
  /**
   * **The polygon has exactly three inputs, and the clock is not one of them.**
   *
   * Where the viewer is, how far they see, and what is standing in the way. The
   * occluders are walls plus every shut door, and a door opening or shutting
   * already bumps `doorEpoch` — so those three cover it completely. The old
   * cache threw itself away every `FOG_UPDATE_MS` on top, which bought nothing
   * and cost a full rebuild 12.5 times a second: standing still in a doorway,
   * looking at a scene that could not change, was costing 3ms of median and a
   * 20ms tail for an identical answer.
   *
   * Walking is unaffected — `FOG_MOVE_EPSILON` is 21px and an officer covers
   * that in about 77ms, so a moving player rebuilds at much the cadence they
   * always did. It is standing still that becomes free.
   */
  if (
    cachedPoly.length > 0 &&
    radius === cachedRadius &&
    cachedEpoch === doorEpoch &&
    // A fourth input, and it belongs to the same list: acid is an occluder, so
    // a cloud boiling out is a change to what is standing in the way exactly as
    // a door swinging is. Without this the polygon computed a moment before one
    // landed would go on lighting ground straight through it for as long as the
    // viewer stood still — which, being cached, could be the whole nine
    // seconds.
    cachedAcidEpoch === acidEpoch &&
    /*
     * **What LOW GRAPHICS actually buys on the fog is fewer rebuilds, not
     * cheaper ones**, and that is worth writing down because the obvious lever
     * turned out to be the wrong one. Casting a coarser fan measured only 9%
     * off the median — the early-out means a base ray stops after a handful of
     * walls, so the fan was never where the time went, and the rays that *are*
     * expensive are the ones at wall corners, which cannot be dropped without
     * putting shadow edges in the wrong place.
     *
     * Letting the viewer walk twice as far before the polygon is rebuilt halves
     * how often it runs, which is a real halving of what the fog costs per
     * second. The price is that shadows are cast from a position up to twice as
     * stale, so their edges visibly lag near walls while moving. That is a fair
     * thing to sell as low graphics; a blockier fan for 9% was not.
     */
    moved < (settings.fogDetail === 'low' ? FOG_MOVE_EPSILON * 2 : FOG_MOVE_EPSILON)
  ) {
    return cachedPoly;
  }

  // Nothing outside the frame can shadow anything inside it, so the occluders
  // are culled to what the camera can reach rather than to the sight circle.
  // Sized off the item's *maximum* push, not the live one — the live push moves
  // with the mouse, and a clip that moved with it would throw this cache away
  // every frame. FOG_MOVE_EPSILON of slack covers the walking the cache allows
  // between rebuilds.
  const reach = cameraReach();
  const slack = FOG_MOVE_EPSILON + 40;
  const clipW = VIEWPORT_WIDTH / (2 * cameraZoom()) + reach.x + slack;
  const clipH = VIEWPORT_HEIGHT / (2 * cameraZoom()) + reach.y + slack;
  const t0 = performance.now();
  cachedPoly = visibilityPolygon(
    me.x,
    me.y,
    radius,
    occludersFor(map),
    map.bushes,
    clipW,
    clipH,
    settings.fogDetail === 'low',
    // **A cloud is a thicket that also slows you and expires**, so it goes in as
    // circles — the lobes of `shared/acidshape.ts`, which is the same function
    // the server's sight lines use, so what is drawn solid is exactly what
    // occludes. No new occluder kind and no second code path on this side
    // either, and it inherits the near-first ordering and the viewport clip
    // that make the polygon affordable at all.
    //
    // Its own argument rather than more entries in the bush list, because a
    // bush you are standing in does not blind you and a cloud of acid very much
    // does; see the parameter.
    //
    // **A dog is handed none of it.** It is a zombie, and zombies see through
    // their own acid on the server — lighting less ground here than the server
    // populates is the same fault as lighting more, in the other direction.
    dogHud ? [] : acidOccluders,
  );
  fogComputeMs = performance.now() - t0;
  cachedAt = now;
  cachedX = me.x;
  cachedY = me.y;
  cachedRadius = radius;
  cachedEpoch = doorEpoch;
  cachedAcidEpoch = acidEpoch;

  // Watchdog: if the visible region covers nearly the whole sight circle while
  // walls are standing right next to us, occlusion has failed. Log it with
  // enough detail to reproduce the exact spot.
  let area = 0;
  for (let i = 0, j = cachedPoly.length - 1; i < cachedPoly.length; j = i++) {
    area += (cachedPoly[j].x + cachedPoly[i].x) * (cachedPoly[j].y - cachedPoly[i].y);
  }
  area = Math.abs(area / 2);
  const full = Math.PI * radius * radius;
  // Counted over the *clip*, not the sight circle — those are the occluders
  // the polygon was actually built from. Counting the wider set would have the
  // watchdog cry off in open ground, where the buildings it can see are all
  // beyond the frame and were culled on purpose.
  const occluding = occludersFor(map);
  const near = occluding.filter(
    (w) =>
      w.x - clipW <= me.x &&
      w.x + w.w + clipW >= me.x &&
      w.y - clipH <= me.y &&
      w.y + w.h + clipH >= me.y,
  ).length;
  // Two ways of noticing: occlusion has all but vanished with walls standing
  // right there, or the visible area jumped sharply between two computations a
  // few pixels apart. The second is what "flicking on and off" looks like from
  // the inside, and the first threshold alone was strict enough to miss it.
  const fraction = area / full;
  const jumped = fogLastFraction >= 0 && Math.abs(fraction - fogLastFraction) > 0.3;
  fogLastFraction = fraction;
  // Standing in a cloud is a *deliberate* collapse: the radius is 46px, so
  // open ground fills nearly all of a very small circle and the fraction jumps
  // hard on the way in and out. Both of the watchdog's tests fire on it and
  // both would be crying wolf — see the note on it in CLAUDE.md, which this is
  // now the second known cause of.
  const failed = near > 0 && (fraction > 0.9 || jumped) && !blindInAcid(me);

  // Log the edges of the fault, not every frame inside it: once when occlusion
  // drops out and once when it comes back. Two positions bracketing the spot
  // are far more use than a hundred repeats of the same one.
  if (failed !== fogFailing) {
    fogFailing = failed;
    if (failed) {
      console.warn(
        `[fog] OFF at ${Math.round(me.x)},${Math.round(me.y)} — ` +
          `${near} occluders in range (${occluding.length} total), ${cachedPoly.length} poly points, ` +
          `${Math.round((area / full) * 100)}% of circle visible, seed ${map.seed}`,
      );
    } else {
      console.warn(
        `[fog] back ON at ${Math.round(me.x)},${Math.round(me.y)} — ` +
          `${near} occluders in range, ${Math.round((area / full) * 100)}% visible, seed ${map.seed}`,
      );
    }
  }

  return cachedPoly;
}

function drawFog(me: EntityState, view: Viewport, now: number): void {
  if (!map) return;

  // Two different scales, and mixing them is a real bug. `m` is the mask's own
  // resolution against the viewport — a screen-space number, which is what the
  // blur is measured in. `s` additionally carries the camera zoom, because
  // everything else here is converting *world* coordinates onto that mask.
  //
  // **Both carry the render scale, and this is the one place in the client
  // outside `applyRenderScale` that has to.** The mask canvas is
  // `VIEWPORT * renderScale * FOG_MASK_SCALE` pixels — that is what makes a
  // lower resolution cheaper here rather than only at the blit — while
  // everything fed into it is in world or layout units. Left at bare
  // `FOG_MASK_SCALE` the fog hole is written at twice the mask's size at 0.5
  // and half of it at 1.5: off-centre, clipped, and looking exactly like the
  // polygon collapses this file has had twice before.
  const px = settings.renderScale;
  const m = FOG_MASK_SCALE * px;
  const s = FOG_MASK_SCALE * px * cameraZoom();
  const mw = fogCanvas.width;
  const mh = fogCanvas.height;

  fogCtx.setTransform(1, 0, 0, 1, 0, 0);
  fogCtx.clearRect(0, 0, mw, mh);
  fogCtx.fillStyle = 'rgba(4, 6, 9, 0.92)';
  fogCtx.fillRect(0, 0, mw, mh);

  const poly = visibilityFor(me, now);
  if (poly.length > 2) {
    const cx = (me.x - view.x) * s;
    const cy = (me.y - view.y) * s;
    const r = fogRadius(me) * s;

    // Fade only the last sliver of range; the blur handles the rest.
    const gradient = fogCtx.createRadialGradient(cx, cy, 0, cx, cy, r);
    gradient.addColorStop(0, 'rgba(0,0,0,1)');
    gradient.addColorStop(0.88, 'rgba(0,0,0,1)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');

    fogCtx.globalCompositeOperation = 'destination-out';
    fogCtx.fillStyle = gradient;
    fogCtx.filter = `blur(${FOG_BLUR_PX * m}px)`;

    fogCtx.beginPath();
    fogCtx.moveTo((poly[0].x - view.x) * s, (poly[0].y - view.y) * s);
    for (let i = 1; i < poly.length; i++) {
      const prev = poly[i - 1];
      const p = poly[i];
      // Two unobstructed neighbours bound a true arc of the sight circle —
      // drawing it as an arc rather than a chord is what kills the faceting.
      // Only ever sweep forward, and only a short way. A pair that is out of
      // order — or a whole quadrant apart — would otherwise take the long way
      // round the circle and fill nearly all of it.
      const delta = p.angle - prev.angle;
      if (prev.atRadius && p.atRadius && delta > 0 && delta < Math.PI / 2) {
        fogCtx.arc(cx, cy, r, prev.angle, p.angle);
      } else {
        fogCtx.lineTo((p.x - view.x) * s, (p.y - view.y) * s);
      }
    }
    const last = poly[poly.length - 1];
    // Same guard on the arc that closes the ring back to the first point.
    if (last.atRadius && poly[0].atRadius) {
      const wrap = poly[0].angle + Math.PI * 2 - last.angle;
      if (wrap > 0 && wrap < Math.PI / 2) {
        fogCtx.arc(cx, cy, r, last.angle, poly[0].angle + Math.PI * 2);
      }
    }
    fogCtx.closePath();
    fogCtx.fill();

    fogCtx.filter = 'none';
    fogCtx.globalCompositeOperation = 'source-over';
  }

  /**
   * **Smoothed off, because by this point there is nothing left to smooth.**
   *
   * The mask is filled through `blur(FOG_BLUR_PX * m)` — 4.5px at the half
   * resolution it is held at, unconditionally, with no graphics setting that
   * turns it off. So by the time it is blown up 2x, neighbouring source pixels
   * already differ by almost nothing and a bicubic resample lands where
   * nearest-neighbour does. Measured over a whole 1920x1080 frame of real park
   * fog, `'high'` against off: **0.28/255 of alpha difference on average, 8/255
   * at the very worst, and 0% of pixels differing by more than 8.** That is not
   * a visible change; it is the blur having already done the resampling's job.
   *
   * What it buys is the dearest single operation in `drawFog`. The polygon fill
   * through the blur filter is 0.04ms and does not care how many points the
   * polygon has — 208 or 552, the same figure. This one blit was 1.04ms against
   * 0.25ms smoothed off in Chromium, where the fog was never a problem.
   *
   * **In Firefox, which is where it was, it is worth four milliseconds and
   * eight frames a second.** Measured by flipping the flag live mid-round from
   * one park path — the only honest way, since the map is not seeded and two
   * rounds are not a comparison: `'high'` gives **fog 10.0, render 28.0, 34fps**
   * and off gives **fog 6.0, render 23.0, 42fps**. Chromium's own figures
   * understate this by roughly 4x, which is the general rule for this game's
   * two engines and the reason a frame figure has to say which one it came
   * from.
   *
   * **The `save`/`restore` stays whichever way the flag is set**, and used not
   * to be there at all. `imageSmoothingQuality` is context state, nothing put
   * it back, and every `save`/`restore` pair elsewhere preserved it rather than
   * clearing it — so the first fogged frame set the main context to `'high'`
   * for the session and every `drawImage` after it paid: the dog's ~20 baked
   * sprite parts every frame (`drawSprite`), the corner map, the vignette, the
   * acid murk, the helicopter layer and the grime pattern. The cost of one flag
   * in `drawFog` landed on `map`, `entities` and `hud`, which is why every
   * phase inflated together and why turning the fog off made the *whole* frame
   * cheap rather than just the fog.
   *
   * Same shape as the `ctx.restore()`-without-`save()` in `dogHeadHalves`, and
   * the same lesson: shared context state set and not put back does not fail
   * loudly, and the damage shows up a long way from its cause. **A bench of
   * `drawFog` alone cannot see it at all** — its own cost is ~2ms and always
   * was; what was expensive is everything it drew *before* and *after*.
   */
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(fogCanvas, 0, 0, VIEWPORT_WIDTH, VIEWPORT_HEIGHT);
  ctx.restore();
}

/**
 * Frame profiler. Costs a handful of `performance.now()` calls per frame, and
 * prints a phase breakdown to the console whenever a frame blows past
 * `SLOW_FRAME_MS` — which is the only way to tell which part of a frame is
 * responsible for a stutter on someone else's machine.
 */
// Below a 30fps frame. It was 45, which never fired on a client sitting at 45
// fps — exactly the case worth a breakdown. Rate-limited to one a second.
const SLOW_FRAME_MS = 28;
let phaseAt = 0;
let phases: Array<[string, number]> = [];
/** The previous frame's breakdown — the gap we report on is time since then. */
let lastPhases: Array<[string, number]> = [];
let lastRenderMs = 0;
let lastSlowReport = 0;

function mark(label: string): void {
  const t = performance.now();
  phases.push([label, t - phaseAt]);
  phaseAt = t;
}

/**
 * Report on the gap between frames, not on render alone.
 *
 * `spike` on the HUD is the gap, and the expensive things need not be in the
 * render loop at all: parsing a snapshot, applying it, or the collection that
 * all that garbage eventually provokes. Splitting the gap into rendering,
 * network handling and everything left over says which of the three it is.
 */
function reportSlowGap(gap: number, now: number, drawn: number, net: ReturnType<typeof takeNetStats>): void {
  // At most one report a second, so a bad patch doesn't flood the console.
  if (now - lastSlowReport < 1000) return;
  lastSlowReport = now;

  const netMs = net.parseMs + net.applyMs;
  const unaccounted = gap - lastRenderMs - netMs;
  const parts = lastPhases.map(([label, cost]) => `${label} ${cost.toFixed(1)}`).join(' · ');

  console.warn(
    `[perf] ${gap.toFixed(0)}ms gap — render ${lastRenderMs.toFixed(1)} (${parts}) · ` +
      `net ${netMs.toFixed(1)} (parse ${net.parseMs.toFixed(1)}, apply ${net.applyMs.toFixed(1)}, ` +
      `${net.messages} msg, ${(net.bytes / 1024).toFixed(0)}KB) · ` +
      `elsewhere ${unaccounted.toFixed(1)} · drawn ${drawn} · fogPoly ${fogComputeMs.toFixed(1)}`,
  );
}

function render() {
  // Nothing to draw behind the front end, and no frame timings worth keeping
  // from it either — the first real frame should not be blamed for the menu.
  if (!started) {
    lastFrameAt = 0;
    requestAnimationFrame(render);
    return;
  }

  const now = performance.now();
  const frameDelta = lastFrameAt > 0 ? Math.min(100, now - lastFrameAt) : 16;
  advanceFades(frameDelta);
  // Between snapshots, not on them — see the note above `snapshotAt`.
  advanceInterpolation(now);
  updateScope(frameDelta);

  // Everything that happened since the last frame started, attributed.
  const gap = lastFrameAt > 0 ? now - lastFrameAt : 0;
  const net = takeNetStats();
  if (gap >= SLOW_FRAME_MS) reportSlowGap(gap, now, tracked.size, net);

  // The same split, smoothed and kept on the HUD rather than only logged when
  // a frame blows the budget. `render` alone cannot tell a slow frame from a
  // frame that spent its time between the frames — parsing a snapshot, applying
  // it, or waiting on a browser that never scheduled us. `else` being the big
  // number means the cost is in none of the things this client does.
  const netMs = net.parseMs + net.applyMs;
  const elsewhere = Math.max(0, gap - lastRenderMs - netMs);
  const ease = (prev: number, next: number) => (prev === 0 ? next : prev * 0.9 + next * 0.1);
  smoothGap = ease(smoothGap, gap);
  smoothNet = ease(smoothNet, netMs);
  smoothElse = ease(smoothElse, elsewhere);
  bytesThisSecond += net.bytes;

  phases = [];
  phaseAt = now;

  /**
   * The strikes, handed over before anything draws them.
   *
   * `setLashes` is what lets `drawEntity` pose the dog's own back tentacles as
   * the ones going out, rather than a separate pass drawing a line from the
   * middle of the animal. `takeLashImpacts` throws the blood, the chips and the
   * gouge — once each, on the edge, exactly as the roar's sound and the birth
   * gore are — so it must be called every frame and not only on a snapshot.
   */
  setLashes(lashes);
  takeLashImpacts(lashes, now);

  const me = self();
  if (spectating) {
    applyZoom();
    panSpectator(frameDelta);
    // Drop anything from the selection that has died, turned or otherwise
    // stopped being sent.
    for (const id of selectedOfficers) if (!tracked.has(id)) selectedOfficers.delete(id);
    // With nothing selected the card goes, and anything it had in hand with it
    // — a ghost outliving the officers who would build it is a mode with
    // nobody left to obey it.
    if (selectedOfficers.size === 0) {
      cardPage = 'root';
      sandbagGhost = null;
    }
  } else if (selectedOfficers.size > 0) {
    selectedOfficers.clear();
    cardPage = 'root';
    sandbagGhost = null;
  }
  const { view, scale } = cameraFor(me);
  // **The one place the render scale exists.** Everything below this line —
  // every camera figure, every HUD coordinate, the fog mask, the wheel, the
  // mouse — is written in 1920x1080 layout units and knows nothing about it.
  // The backbuffer is a different number of real pixels, and this is what maps
  // one onto the other. `setTransform` rather than `scale` so it is set from
  // the identity every frame and cannot compound.
  const px = settings.renderScale;
  ctx.setTransform(px, 0, 0, px, 0, 0);
  ctx.fillStyle = '#0b0d10';
  ctx.fillRect(0, 0, VIEWPORT_WIDTH, VIEWPORT_HEIGHT);

  ctx.save();
  ctx.scale(scale, scale);
  ctx.translate(-view.x, -view.y);

  if (map) {
    drawGround(ctx, map);
    // Under everything else: it is ground, and the bushes stand on it.
    drawPark(ctx, map.park, view);
    drawPond(ctx, map.pond, view);
    // Paint on the road, so it goes under the cars standing on it.
    drawParkingBays(ctx, map.policeStation, view);
    // On the road, under the walls and everyone standing on it. `drawBlood`
    // also blits the shared permanent-stain layer, so it comes before anything
    // that reads from it.
    drawBlood(ctx, view, now);
    // Where a strike came down and caught nobody. On the ground with the blood,
    // and for the same reason: it is a mark, not an effect.
    drawLashScars(ctx, view, now);
    /**
     * And the ring where one is *about* to come down.
     *
     * **On the ground rather than over the bodies**, which is the whole reason
     * it is here and not in the effects pass below. The officer standing in it
     * is the one person who most needs to read it, and a ring painted over the
     * top of them would hide the very thing it is warning about.
     */
    drawLashWarnings(ctx, lashes, view, now);
    // Bodies lie on the blood and under everyone still on their feet.
    drawZombieCorpses(ctx, view, now);
    drawCorpses(ctx, corpses, view, now);
    drawWalls(ctx, map.walls, view);
    drawWindows(ctx, map.windows, brokenWindows, view);
    drawDoors(ctx, map.doors, doorStates, view);
    // Under the entities, so the officer stands on his own emplacement rather
    // than behind it.
    // Under the bodies: officers pile out of it and stand in front of it.
    drawBackupVehicles(ctx, vehicles, view, now);
    drawMines(ctx, mines, view, now);
    drawBeaconTowers(ctx, towers, view, now);
    drawEmplacements(ctx, emplacements, view);
    // Beside the emplacements and drawn by the same function — as far as
    // anything on screen goes, a wall is a wall with nobody behind it.
    drawBarricades(ctx, barricades, view);
    // And the ones that have been ordered and are still being walked to. Beside
    // the walls they are about to become, so a ghost and a wall stack in the
    // same place in the scene and neither can hide the other.
    if (buildSites.length > 0) drawBuildSites(ctx, buildSites, view, now);
    drawFires(ctx, fires, view, now);
    drawPickups(ctx, pickups, view, now, scale);
  }
  mark('map');

  drawHandLinks(ctx, tracked, view);

  // Anything off screen still costs a path to set up, and at the end of a
  // round there are four hundred of them.
  const simpleEntities = scale < ENTITY_DETAIL_SCALE;
  const cull = 40;
  for (const entry of tracked.values()) {
    const s = entry.state;
    if (
      s.x + cull < view.x ||
      s.x - cull > view.x + view.w ||
      s.y + cull < view.y ||
      s.y - cull > view.y + view.h
    ) {
      continue;
    }
    // Heat contacts are drawn after the fog instead, so they carry through it.
    if (s.thermal) continue;
    // **A body is drawn once, by `drawCorpses`.** A killed dog keeps its entity
    // for `DOG_DEATH_MS` so there is something to watch lying there, and the
    // corpse goes into `world.corpses` at the same instant and at the same
    // coordinates — so both were drawn, one on top of the other. The corpse is
    // the permanent record and holds the pose it died in, so that is the one
    // that draws, and the moment the entity gets up and leaves nothing on
    // screen changes.
    if (s.dead) continue;
    // Your own character never fades — it's always fully in view.
    const isSelf = s.id === selfId;
    ctx.globalAlpha = isSelf ? 1 : entry.alpha;
    drawEntity(ctx, s, isSelf, now, simpleEntities, scale);
    // A spectator's RTS pick: a green ring outside the body.
    if (spectating && selectedOfficers.has(s.id)) {
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#4ade80';
      ctx.lineWidth = 2 / scale;
      ctx.beginPath();
      ctx.arc(s.x, s.y, ENTITY_RADIUS.officer + 5, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Flame licks over the top of the body, not under it.
    if (s.burning && !simpleEntities) drawBurning(ctx, s, now);
    // The tracker's arrow orbits you, pointing at the nearest one.
    if (isSelf && inventory && inventory.trackBearing !== null) {
      drawTracker(ctx, s.x, s.y, inventory.trackBearing, now);
    }
  }
  ctx.globalAlpha = 1;

  // The wall being sited, under the cursor and in the world it will stand in —
  // at the size and angle it will actually be, so what is shown is what gets
  // built. Amber where it fits, red where it does not.
  //
  // Not while the cursor is over the card: the ghost *is* the cursor, and a
  // wall sitting out in a street under a panel is a wall a click there would
  // not build. The pointer comes back in its place — see `drawCrosshair` below.
  if (sandbagGhost && !overCard()) {
    const at = spectatorWorld(input.mouseX, input.mouseY);
    const fits = sandbagFits(at.x, at.y, sandbagGhost.angle);
    drawSandbagWall(
      ctx,
      {
        x: at.x,
        y: at.y,
        angle: sandbagGhost.angle,
        hw: BARRICADE_HALF_WIDTH,
        hh: BARRICADE_HALF_DEPTH,
      },
      1,
      0.55,
      fits ? '#e8a13a' : '#b91c1c',
    );
  }

  // A ring blooming where a spectator just gave an order — green for a move,
  // amber for the double right-click that also calls a wall off, so taking one
  // back is visibly a different thing from asking for one.
  if (commandFx.length > 0) {
    for (let i = commandFx.length - 1; i >= 0; i--) {
      const fx = commandFx[i];
      const t = (now - fx.born) / COMMAND_FX_MS;
      if (t >= 1) {
        commandFx.splice(i, 1);
        continue;
      }
      ctx.globalAlpha = (1 - t) * 0.9;
      ctx.strokeStyle = fx.override ? '#e8a13a' : '#4ade80';
      ctx.lineWidth = 2 / scale;
      ctx.beginPath();
      ctx.arc(fx.x, fx.y, 4 + t * 22, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  mark('entities');

  // Napalm lingers, so it can't be culled on the round tracer's clock.
  tracers = tracers.filter(
    (t) => now - t.born < (t.kind === 'flame' ? FLAME_TRACER_MS : TRACER_LIFETIME_MS),
  );
  drawTracers(ctx, tracers, now, TRACER_LIFETIME_MS);
  // Over the bodies: it is coming off them.
  drawBloodSpray(ctx, now);
  // And the road thrown up by a strike that hit it, for the same reason.
  drawLashChips(ctx, now);

  drawZaps(ctx, zaps, view, now);
  // The *impact*, over the bodies, because it lands on top of whoever was
  // stood there. The limbs themselves are drawn with the dog by `drawTentacles`
  // — they are the same arms that idle on its back, and two bits of code
  // drawing them would be two bits of code to keep in step.
  drawLashes(ctx, lashes, view);
  drawDucks(ctx, ducks, view);
  if (map) drawBushes(ctx, map.bushes, view);

  // Air support sits above the foliage: smoke, then the grenade, then the
  // aircraft itself over everything on the ground.
  drawSmoke(ctx, smokes, now);
  // Over the smoke and under the aircraft: it is on the ground, and it is the
  // one thing on screen that is deliberately hard to see past.
  drawAcid(ctx, acid);
  drawSpits(ctx, spits);
  // Over the cloud they came out of. A tentacle lying in the middle of the acid
  // is the whole picture of what happened there, and under it it is invisible.
  drawTentacleDebris(ctx, tentacles, view, now);
  drawBlasts(ctx, blasts, view);
  drawGrenades(ctx, grenades);
  if (helicopters.length > 0) drawHelicopters(ctx, helicopters, now);

  // The wheel sits over your character, so hold bubbles back until Q is
  // released rather than drawing them underneath it.
  if (!wheel.open) {
    drawSpeechBubbles(ctx, speech, view);
  }

  ctx.restore();
  mark('effects');

  /**
   * NO FOG is gated on `solo` *here*, at the point of use, rather than by
   * hiding the switch on the options screen.
   *
   * A setting the menu declines to offer is still in localStorage and still
   * read every frame, so anyone who set it offline would carry it into an
   * online round without touching anything. The rule has to live where the
   * decision is made — and the whole polygon is skipped, which is where the
   * saving comes from: it is what a spectator does, and why one is cheaper per
   * frame than a player despite drawing five hundred bodies.
   */
  const fogOff = settings.noFog && solo;
  if (!spectating && me && !fogOff) drawFog(me, view, now);
  mark('fog');

  // Thermal contacts go on *top* of the fog. They are precisely the things you
  // cannot see, so drawing them under it dims the one readout the goggles are
  // for — the whole point is that they cut through it.
  if (!spectating) {
    ctx.save();
    ctx.scale(scale, scale);
    ctx.translate(-view.x, -view.y);
    drawThermal(ctx, thermalContacts(), view, now);
    ctx.restore();
  }

  // Standing in the dog's acid, with the fog already pulled in to an arm's
  // length and the server sending nothing. Over the fog for the same reason
  // the thermal contacts are: it is what is in your eyes, so nothing draws
  // over it and it is not subject to it. A dog is exempt here as everywhere —
  // zombies see through their own acid.
  if (!spectating && me && !dogHud && !fogOff && blindInAcid(me)) {
    drawAcidMurk(ctx, VIEWPORT_WIDTH, VIEWPORT_HEIGHT, now);
  }

  // Over the fog, under the HUD: it frames the world without dimming anything
  // you actually have to read.
  drawVignette(ctx, VIEWPORT_WIDTH, VIEWPORT_HEIGHT);

  // The spectator's selection marquee, in screen space over everything.
  if (spectating && marquee) {
    const x = Math.min(marquee.x0, marquee.x1);
    const y = Math.min(marquee.y0, marquee.y1);
    const w = Math.abs(marquee.x1 - marquee.x0);
    const h = Math.abs(marquee.y1 - marquee.y0);
    ctx.fillStyle = 'rgba(74, 222, 128, 0.12)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#4ade80';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w, h);
  }

  // Going down, and coming back. Over the world and *under* the HUD, so the
  // counts and the panels stay readable through it.
  if (dogHud) {
    drawDeathFade(
      ctx,
      dogHud.dying,
      dogRoseAt >= 0 ? now - dogRoseAt : -1,
      VIEWPORT_WIDTH,
      VIEWPORT_HEIGHT,
    );
  }

  // HUD sits above the fog so guidance stays legible.
  drawBeacons(ctx, beacons, view, scale, VIEWPORT_WIDTH, VIEWPORT_HEIGHT);

  if (!spectating) {
    // A dog carries nothing, opens nothing and picks nothing up, so the slot
    // bar and the E prompt are simply not drawn for one — its jaws and its bite
    // clock go where they were.
    // Nothing to read off a bar while you are lying on the road being greyed
    // out — the jaws and the bite clock belong to a dog that is up.
    if (dogHud && dogHud.dying < 0 && dogHud.birth < 0) {
      drawDogHud(ctx, dogHud, VIEWPORT_WIDTH, VIEWPORT_HEIGHT, now);
      // The corner map, and only for a dog that is up: there is nothing to
      // read off it while you are lying in the road being greyed out, and the
      // `me` it wants does not exist once the animal is out of the round.
      if (map) drawDogMap(ctx, map, me ?? null, dogHud.contacts, VIEWPORT_WIDTH, VIEWPORT_HEIGHT);
    } else if (inventory && me && !dogHud) {
      // A door under your nose owns the E key, so it owns the prompt too.
      if (doorPrompt) {
        drawDoorPrompt(ctx, doorPrompt, (me.x - view.x) * scale, (me.y - view.y) * scale);
      } else {
        drawInteractPrompt(ctx, inventory, (me.x - view.x) * scale, (me.y - view.y) * scale);
      }
      drawInventory(ctx, inventory, VIEWPORT_WIDTH, VIEWPORT_HEIGHT, now);
    }
    drawStamina(
      ctx,
      stamina,
      STAMINA_MAX,
      VIEWPORT_WIDTH,
      VIEWPORT_HEIGHT,
      exhausted,
      // A dog's bar has a row of hexagons under it where an officer's has a
      // row of slots, and the hexagons are taller. Everything moves up
      // together rather than the row being squeezed into the gap.
      dogHud ? DOG_HUD_STAMINA_LIFT : 0,
    );
    // Aiming hard up or down runs the camera off a screen that is only 600
    // tall. Rather than shorten the vertical reach to keep the officer in
    // frame — which is the very thing the scope is for — he goes off the edge
    // and this marks where. Over the slot bar, not under it.
    if (me) {
      drawSelfMarker(
        ctx,
        (me.x - view.x) * scale,
        (me.y - view.y) * scale,
        VIEWPORT_WIDTH,
        VIEWPORT_HEIGHT,
      );
    }
    // The beacon map goes over the HUD — it is a thing you stop and read, and
    // it closes itself the moment the handset leaves your hand.
    if (minimapOpen && map) {
      if (heldItemId() !== 'survivorBeacon') closeMinimap();
      else {
        drawMinimap(
          ctx,
          map,
          minimapFrame(VIEWPORT_WIDTH, VIEWPORT_HEIGHT),
          me ? { x: me.x, y: me.y } : null,
          inventory?.beacon ?? null,
          beaconPick,
          VIEWPORT_WIDTH,
          VIEWPORT_HEIGHT,
        );
      }
    }
    if (wheel.open) {
      wheel.hover = hitTest(wheel, input.mouseX, input.mouseY, wheelOptions(following, beaconExists()).length);
      drawWheel(
        ctx,
        wheel,
        wheelOptions(following, beaconExists()),
        (o) => abilityUsable(o.id),
        (o) =>
          o.id === "rally" || o.id === "beacon"
            ? rallyCharges
            : o.id === "follow"
              ? followCharges
              : null,
        now,
      );
    }
    // An armed order swaps the crosshair for a blue placement arrow, and the
    // sniper swaps it for a reticle.
    if (armedAbility) drawTargetCursor(ctx, input.mouseX, input.mouseY, now);
    else if (ITEMS[heldItemId() ?? 'pistol']?.scope) drawReticle(ctx, input.mouseX, input.mouseY);
    else drawCrosshair(ctx, input.mouseX, input.mouseY);

    // What the gun in hand is busy doing, under the mark you're aiming with.
    if (inventory && inventory.deployProgress >= 0) {
      const steady = inventory.deployProgress >= 1;
      // Right-clicking off drains the bar rather than clearing it, and you
      // stay rooted while it does — so the gauge coming down is the thing
      // telling you why you still can't move.
      const stowing = !inventory.deployWanted && inventory.deployProgress > 0;
      drawAimGauge(
        ctx,
        input.mouseX,
        input.mouseY,
        inventory.deployProgress,
        stowing ? '#fbbf24' : steady ? '#4ade80' : '#fbbf24',
        stowing
          ? 'PACKING UP'
          : steady
            ? 'DEPLOYED — RIGHT-CLICK TO MOVE'
            : inventory.deployWanted
              ? 'PLANTING'
              : 'RIGHT-CLICK TO DEPLOY',
      );
    } else if (inventory && inventory.chargeProgress >= 0) {
      drawChargeBars(ctx, input.mouseX, input.mouseY, inventory.chargeProgress);
    }
  }

  // The command card, over everything. Only while officers are selected: it is
  // the selection's card, and an empty one would be furniture.
  if (spectating && selectedOfficers.size > 0) {
    drawCommandCard(
      ctx,
      cardPage,
      selectedSandbags(),
      selectedOfficers.size,
      cardHover(),
      VIEWPORT_WIDTH,
      VIEWPORT_HEIGHT,
    );
  }

  /*
   * The spectator gets a cursor too — the same amber gunsight, framed with
   * corner brackets while grey officers are selected and a right-click would
   * send them somewhere.
   *
   * **Smaller than the one an officer aims with**, at `SPECTATE_CURSOR_SCALE`.
   * The mark is sized for laying a weapon on a body; a spectator is not aiming
   * at anything, and at full size the ring is wider than a command-card slot,
   * so the pointer covered the button it was over.
   *
   * **And it is drawn over the card**, which it was not: the canvas is
   * `cursor: none`, so hiding it there left a watcher with no pointer at all
   * over the one part of the screen that is made of buttons — which is exactly
   * the fault `drawCrosshair` was added to the spectator view to fix. The card
   * hover highlight is a second reading of the same thing, not a replacement
   * for it.
   *
   * The one place it is still left off is with a wall in hand out in the city:
   * the ghost *is* the cursor then. Over the card it comes back, because the
   * ghost is out in the world and the pointer is on a button.
   */
  if (spectating && (!sandbagGhost || overCard())) {
    drawCrosshair(
      ctx,
      input.mouseX,
      input.mouseY,
      selectedOfficers.size > 0 && !dragStart,
      SPECTATE_CURSOR_SCALE,
    );
  }

  // Only written when it actually changes. Assigning the same string still
  // dirties layout, and these are counts that move a few times a second at most.
  const counts = `survivors ${survivors} · incubating ${infectedCount} · zombies ${zombieCount}`;
  const line = spectating
    ? `SPECTATING — ${counts}` +
      (sandbagGhost
        ? ` · siting a wall · scroll to turn it · click to build · shift-click for several · right-click cancels`
        : selectedOfficers.size > 0
          ? ` · ${selectedOfficers.size} officer${selectedOfficers.size > 1 ? 's' : ''} selected · right-click move · double right-click pulls one off a wall · H hold · R release`
          : ` · arrows or screen edge pan · scroll zoom · drag-select grey officers`)
    // The cure gun is the only thing that tells you about yourself. The server
    // sends null unless one is in hand, so there is nothing to read otherwise.
    : inventory?.selfInfected === true
      ? `${counts} · YOU ARE INFECTED`
      : inventory?.selfInfected === false
        ? `${counts} · you are clean`
        : counts;
  if (line !== lastHudLine) {
    lastHudLine = line;
    hud.textContent = line;
  }

  // Perf readout: client frame rate, worst frame in the last second, and the
  // server's tick cost against its 33.3ms budget.
  if (lastFrameAt > 0) {
    // Two frames can land on the same millisecond, and 1000/0 is Infinity.
    const frameMs = Math.max(0.1, now - lastFrameAt);
    fps = fps === 0 ? 1000 / frameMs : fps * 0.92 + (1000 / frameMs) * 0.08;
    if (frameMs > worstFrameMs) worstFrameMs = frameMs;
  }
  lastFrameAt = now;
  if (now - worstResetAt > 1000) {
    kbPerSec = bytesThisSecond / 1024;
    bytesThisSecond = 0;
    worstResetAt = now;
    worstFrameMs = 0;
  }

  mark('hud');
  // Hold this frame's cost and breakdown for whoever reports the next gap.
  lastRenderMs = performance.now() - now;
  lastPhases = phases;

  // **The readout is written a few times a second, not sixty.**
  //
  // Rewriting `innerHTML` invalidates layout, and anything that then *reads*
  // layout — `getBoundingClientRect` in the mouse handler was the one that
  // mattered — has to force a reflow to answer. Written every frame, the page's
  // layout was never clean. Nobody can read a number that changes sixty times a
  // second anyway, and the values here are already smoothed over far longer
  // than 200ms.
  if (now - hudWrittenAt >= HUD_UPDATE_MS) {
    hudWrittenAt = now;
    const fpsClass = fps >= 55 ? '' : fps >= 40 ? 'warn' : 'bad';
    const tickClass = serverTickMs < 16 ? '' : serverTickMs < 28 ? 'warn' : 'bad';
    // `render` against the frame gap is the fork in the road: a gap far larger
    // than render means the cost is not in drawing at all, and the phase split
    // says which part of drawing it is when it is.
    const renderClass = lastRenderMs < 8 ? '' : lastRenderMs < 14 ? 'warn' : 'bad';

    /**
     * What the round trip costs, and what it costs *you*.
     *
     * `ping` is the wire alone — the server answers a probe in its message
     * handler, nowhere near the tick. But the wire is not what a player feels.
     * Between pressing a key and seeing the officer move there are two waits at
     * 30Hz, one for the next `sendInputLoop` and one for the next server tick,
     * averaging half a period each, so the felt figure is roughly the round
     * trip plus a whole tick period — plus a frame to draw it, which is small
     * next to the rest and left out rather than guessed at.
     *
     * There is no client-side prediction anywhere in this game, which is the
     * whole reason this number matters: nothing hides it. Thresholds are set
     * for driving a body with WASD, which is far less forgiving than the
     * command-a-unit latency an RTS gets away with.
     */
    const rtt = pingStats.median;
    const inputMs = rtt + 1000 / TICK_RATE;
    const pingClass = pingStats.samples === 0 ? '' : inputMs < 70 ? '' : inputMs < 120 ? 'warn' : 'bad';
    const pingText =
      pingStats.samples === 0
        ? 'ping —'
        : `ping ${rtt.toFixed(0)}ms (p90 ${pingStats.p90.toFixed(0)}) · input ~${inputMs.toFixed(0)}ms`;
    perfHud.innerHTML =
      `<span class="${fpsClass}">${Math.round(fps)} fps</span> · spike ${worstFrameMs.toFixed(0)}ms<br>` +
      `<span class="${tickClass}">tick ${serverTickMs.toFixed(2)}ms</span> / 33.3ms<br>` +
      `fogpoly ${fogComputeMs.toFixed(2)}ms · ${tracked.size} drawn<br>` +
      // The frame gap, split. Whichever of these three is large is the one to
      // chase; `else` large means it is not this client's doing at all.
      `gap ${smoothGap.toFixed(1)} = <span class="${renderClass}">render ${lastRenderMs.toFixed(1)}</span>` +
      ` + net ${smoothNet.toFixed(1)} + else ${smoothElse.toFixed(1)}<br>` +
      `<span class="${pingClass}">${pingText}</span><br>` +
      `${kbPerSec.toFixed(0)}KB/s in<br>` +
      phases.map(([l, c]) => `${l} ${c.toFixed(1)}`).join(' · ');
  }

  requestAnimationFrame(render);
}
render();
