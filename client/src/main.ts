import {
  VIEWPORT_WIDTH,
  VIEWPORT_HEIGHT,
  WORLD_WIDTH,
  WORLD_HEIGHT,
  TRACER_LIFETIME_MS,
  FLAME_TRACER_MS,
  PLAYER_SIGHT_RADIUS,
  STAMINA_MAX,
  FOG_UPDATE_MS,
  FOG_MOVE_EPSILON,
  FOG_MASK_SCALE,
  FOG_BLUR_PX,
  ENTITY_FADE_MS,
  MATERIALIZE_MS,
  GUN_SLOTS,
  UTILITY_SLOTS,
  SCOPE_PUSH,
  BINOCULAR_PUSH,
  CAMERA_PAN_X,
  CAMERA_PAN_Y,
  SCOPE_EASE_MS,
  BEACON_CALL_RADIUS,
} from '../../shared/constants.js';
import type {
  DoorPrompt,
  DoorState,
  EntityState,
  GrenadeState,
  HelicopterState,
  InventoryState,
  MapData,
  PickupState,
  SmokeState,
  SpeechState,
  BlastState,
  DuckState,
  EmplacementState,
  BeaconState,
  FireState,
  MineState,
  BackupVehicleState,
  Wall,
} from '../../shared/types.js';
import { connect, takeNetStats } from './net.js';
import { trackInput } from './input.js';
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
  drawHandLinks,
  drawHelicopters,
  drawInteractPrompt,
  drawInventory,
  drawPickups,
  drawBlasts,
  drawDucks,
  drawEmplacements,
  drawBackupVehicles,
  drawMines,
  drawZaps,
  drawBeaconTowers,
  drawFires,
  drawBurning,
  drawPond,
  drawSmoke,
  drawStamina,
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
import { ITEMS, type ItemId } from '../../shared/items.js';
import type { AbilityId } from '../../shared/types.js';

const canvas = document.getElementById('game') as HTMLCanvasElement;
canvas.width = VIEWPORT_WIDTH;
canvas.height = VIEWPORT_HEIGHT;
const ctx = canvas.getContext('2d')!;

// Fog lives on its own layer so we can punch a hole in it without erasing the
// world underneath. The layer is rasterised at a fraction of viewport size and
// upscaled — the bilinear filtering doubles as free edge softening.
const fogCanvas = document.createElement('canvas');
fogCanvas.width = Math.round(VIEWPORT_WIDTH * FOG_MASK_SCALE);
fogCanvas.height = Math.round(VIEWPORT_HEIGHT * FOG_MASK_SCALE);
const fogCtx = fogCanvas.getContext('2d')!;

const pausePanel = document.getElementById('pause') as HTMLDivElement;
const gameOverPanel = document.getElementById('game-over') as HTMLDivElement;
const gameOverRestart = document.getElementById('game-over-restart') as HTMLButtonElement;
const victoryPanel = document.getElementById('victory') as HTMLDivElement;
const victoryRestart = document.getElementById('victory-restart') as HTMLButtonElement;
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
let grenades: GrenadeState[] = [];
let smokes: SmokeState[] = [];
let blasts: BlastState[] = [];
let ducks: DuckState[] = [];
let emplacements: EmplacementState[] = [];
let vehicles: BackupVehicleState[] = [];
let mines: MineState[] = [];
let towers: BeaconState[] = [];
let zaps: Array<{ x: number; y: number; at: number }> = [];
let fires: FireState[] = [];
let helicopters: HelicopterState[] = [];
let speech: SpeechState[] = [];
const wheel = newWheelState();
/** Ability picked from the wheel and waiting for the player to click a spot. */
let armedAbility: AbilityId | null = null;

// Frame timing for the perf readout. Smoothed so the number is readable.
let fps = 0;
let lastFrameAt = 0;
let worstFrameMs = 0;
let worstResetAt = 0;

const input = trackInput(canvas);

/** Whether the wheel should offer an ability, or grey it out and refuse it. */
/**
 * Is a survivor mast close enough to shout about?
 *
 * The wheel used to offer the order whenever a mast existed *anywhere*, while
 * the server requires one within BEACON_CALL_RADIUS — so out in the city you
 * could pick it, watch nothing happen, and not even be charged for it. Now the
 * option greys out and flashes red instead of lying about what it will do.
 */
function beaconInEarshot(): boolean {
  const me = self();
  if (!me) return false;
  return towers.some((t) => Math.hypot(t.x - me.x, t.y - me.y) <= BEACON_CALL_RADIUS);
}

function abilityUsable(id: AbilityId): boolean {
  if (id === "rally") return rallyCharges > 0;
  if (id === "follow") return followCharges > 0;
  // The beacon shout is a command like any other, and costs the same charge.
  if (id === "beacon") return rallyCharges > 0 && beaconInEarshot();
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

const { send } = connect((msg) => {
  // The front end reads the lobby traffic; the game below ignores it.
  frontEnd?.handle(msg);
  if (msg.type === 'welcome') {
    selfId = msg.selfId;
    map = msg.map;
    if (startSpectating) send({ type: 'spectate', restart: spectateParam === 'new' });
  } else if (msg.type === 'map') {
    map = msg.map;
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
    // A new city starts framed on the whole thing again.
    spectateZoom = 1;
    spectateX = WORLD_WIDTH / 2;
    spectateY = WORLD_HEIGHT / 2;
    gameOver = false;
    victory = false;
    gameOverPanel.classList.add('hidden');
    victoryPanel.classList.add('hidden');
  } else if (msg.type === 'state') {
    syncTracked(msg.entities);
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
    grenades = msg.grenades;
    smokes = msg.smokes;
    blasts = msg.blasts;
    ducks = msg.ducks;
    emplacements = msg.emplacements;
    vehicles = msg.vehicles;
    mines = msg.mines;
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
      for (const shot of msg.shots) tracers.push({ ...shot, born: now });
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
      onStart: (offline) => {
        started = true;
        solo = offline;
        paused = false;
        pausePanel.classList.add('hidden');
        // A digit typed into the chat box latched a slot key on the way past.
        input.slotPressed = -1;
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
  input.rightDown = false;
  input.shooting = false;
  input.slotPressed = -1;
  pushX = 0;
  pushY = 0;
  tracked.clear();
  tracers = [];
  gameOverPanel.classList.add('hidden');
  victoryPanel.classList.add('hidden');
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
  // Hold Q to open the ability wheel, always centred on the viewport.
  if (e.code === 'KeyQ' && !wheel.open && !spectating) {
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

    if (wheel.open) {
      e.stopImmediatePropagation();
      const options = wheelOptions(following, beaconInEarshot());
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

// Right-click cancels an armed order instead of firing it off somewhere.
canvas.addEventListener('contextmenu', () => {
  armedAbility = null;
});

/**
 * Spectator wheel zoom, anchored on the cursor: whatever is under the pointer
 * stays under it, which is what makes zooming into a particular street feel
 * like pulling it closer rather than like the map sliding about.
 */
canvas.addEventListener(
  'wheel',
  (e) => {
    // Playing: the wheel walks the slot bar rather than zooming.
    if (!spectating) {
      if (!inventory) return;
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
  const scale = SPECTATE_FIT * spectateZoom;
  spectateX = worldX - at.x / scale + VIEWPORT_WIDTH / scale / 2;
  spectateY = worldY - at.y / scale + VIEWPORT_HEIGHT / scale / 2;
}

// Both endings go back to the front end rather than resetting the world where
// everyone stands. A new round is a new lobby now.
gameOverRestart.addEventListener('click', quitToMenu);
victoryRestart.addEventListener('click', quitToMenu);

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
  state: EntityState;
  alpha: number;
  seen: boolean;
}
const tracked = new Map<string, Tracked>();

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
const ENTITY_FIELDS = [
  'type',
  'x',
  'y',
  'facing',
  'health',
  'grappling',
  'infected',
  'npc',
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

function syncTracked(incoming: EntityState[]): void {
  for (const entry of tracked.values()) entry.seen = false;
  for (const e of incoming) {
    const entry = tracked.get(e.id);
    if (entry) {
      copyInto(entry.state, e);
      entry.seen = true;
    } else {
      tracked.set(e.id, { state: { ...e }, alpha: 0, seen: true });
    }
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
const SPECTATE_FIT = Math.min(VIEWPORT_WIDTH / WORLD_WIDTH, VIEWPORT_HEIGHT / WORLD_HEIGHT);
let spectateZoom = 1;
let spectateX = WORLD_WIDTH / 2;
let spectateY = WORLD_HEIGHT / 2;

function cameraFor(view: EntityState | undefined): { view: Viewport; scale: number } {
  if (spectating || !view) {
    const scale = SPECTATE_FIT * spectateZoom;
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
  // A player's camera is always 1:1. Down a scope it slides off the officer
  // toward the reticle rather than zooming out — see `updateScope`.
  const w = VIEWPORT_WIDTH;
  const h = VIEWPORT_HEIGHT;
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
    scale: 1,
  };
}

/**
 * How far the camera has run off the officer, in world pixels. Eased, so
 * raising and lowering the scope is a movement rather than a jump — a hard cut
 * re-frames the whole screen in one frame and reads as a glitch.
 */
let pushX = 0;
let pushY = 0;

/** How far a scope lets the camera run: 0 for anything ordinary. */
function scopeReach(): number {
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
 * so without it you are aware of 480px of street to either side and only 300px
 * above and below. `CAMERA_PAN_Y` is derived to carry that 180px difference,
 * so both axes reach the same distance at every zoom level: 540 with nothing
 * in hand, 970 down a scope.
 */
function cameraReach(): { x: number; y: number } {
  const scope = scopeReach();
  return { x: scope + CAMERA_PAN_X, y: scope + CAMERA_PAN_Y };
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
function fogRadius(): number {
  const reach = cameraReach();
  let worst = 0;
  for (let i = 0; i <= 8; i++) {
    const a = (i / 8) * (Math.PI / 2);
    const d = Math.hypot(
      VIEWPORT_WIDTH / 2 + Math.cos(a) * reach.x,
      VIEWPORT_HEIGHT / 2 + Math.sin(a) * reach.y,
    );
    if (d > worst) worst = d;
  }
  return Math.max(PLAYER_SIGHT_RADIUS, Math.round(worst) + 24);
}

/** Whatever is in the active slot, as an item id. */
function heldItemId(): ItemId | null {
  if (!inventory) return null;
  const slot = inventory.activeSlot;
  if (slot === 0) return 'pistol';
  if (slot <= inventory.guns.length) return inventory.guns[slot - 1]?.item ?? null;
  return inventory.utilities[slot - inventory.guns.length - 1] ?? null;
}

/**
 * WASD pans the spectator camera. The speed is in screen pixels per second and
 * divided by the current scale, so a key held for a second slides the view the
 * same distance across the screen whether the whole city is framed or you are
 * zoomed right into one street — panning at 7x zoom in world units would crawl.
 */
const SPECTATE_PAN_SPEED = 700;
const SPECTATE_PAN_SPRINT = 2.5;

function panSpectator(dt: number): void {
  let dx = 0;
  let dy = 0;
  if (input.state.up) dy -= 1;
  if (input.state.down) dy += 1;
  if (input.state.left) dx -= 1;
  if (input.state.right) dx += 1;

  const scale = SPECTATE_FIT * spectateZoom;
  const w = VIEWPORT_WIDTH / scale;
  const h = VIEWPORT_HEIGHT / scale;

  if (dx !== 0 || dy !== 0) {
    const len = Math.hypot(dx, dy);
    const speed = SPECTATE_PAN_SPEED * (input.sprint ? SPECTATE_PAN_SPRINT : 1);
    const step = (speed / scale) * (dt / 1000);
    spectateX += (dx / len) * step;
    spectateY += (dy / len) * step;
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
    shooting: input.shooting && !spectating && !wheel.open && !armedAbility,
    sprint: input.sprint,
    interact: input.interact && !spectating,
    rightDown: input.rightDown && !spectating,
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

function visibilityFor(me: EntityState, now: number): FogPoint[] {
  if (!map) return [];
  const radius = fogRadius();
  const moved = Math.hypot(me.x - cachedX, me.y - cachedY);
  if (
    cachedPoly.length > 0 &&
    radius === cachedRadius &&
    moved < FOG_MOVE_EPSILON &&
    now - cachedAt < FOG_UPDATE_MS
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
  const clipW = VIEWPORT_WIDTH / 2 + reach.x + slack;
  const clipH = VIEWPORT_HEIGHT / 2 + reach.y + slack;
  const t0 = performance.now();
  cachedPoly = visibilityPolygon(me.x, me.y, radius, occludersFor(map), map.bushes, clipW, clipH);
  fogComputeMs = performance.now() - t0;
  cachedAt = now;
  cachedX = me.x;
  cachedY = me.y;
  cachedRadius = radius;

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
  const failed = near > 0 && (fraction > 0.9 || jumped);

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

  const s = FOG_MASK_SCALE;
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
    const r = fogRadius() * s;

    // Fade only the last sliver of range; the blur handles the rest.
    const gradient = fogCtx.createRadialGradient(cx, cy, 0, cx, cy, r);
    gradient.addColorStop(0, 'rgba(0,0,0,1)');
    gradient.addColorStop(0.88, 'rgba(0,0,0,1)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');

    fogCtx.globalCompositeOperation = 'destination-out';
    fogCtx.fillStyle = gradient;
    fogCtx.filter = `blur(${FOG_BLUR_PX * s}px)`;

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

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(fogCanvas, 0, 0, VIEWPORT_WIDTH, VIEWPORT_HEIGHT);
}

/**
 * Frame profiler. Costs a handful of `performance.now()` calls per frame, and
 * prints a phase breakdown to the console whenever a frame blows past
 * `SLOW_FRAME_MS` — which is the only way to tell which part of a frame is
 * responsible for a stutter on someone else's machine.
 */
const SLOW_FRAME_MS = 45;
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
  updateScope(frameDelta);

  // Everything that happened since the last frame started, attributed.
  const gap = lastFrameAt > 0 ? now - lastFrameAt : 0;
  const net = takeNetStats();
  if (gap >= SLOW_FRAME_MS) reportSlowGap(gap, now, tracked.size, net);

  phases = [];
  phaseAt = now;

  const me = self();
  if (spectating) {
    applyZoom();
    panSpectator(frameDelta);
  }
  const { view, scale } = cameraFor(me);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#0b0d10';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  ctx.scale(scale, scale);
  ctx.translate(-view.x, -view.y);

  if (map) {
    drawGround(ctx, map);
    // Under everything else: it is ground, and the bushes stand on it.
    drawPark(ctx, map.park, view);
    drawPond(ctx, map.pond, view);
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
    drawFires(ctx, fires, view, now);
    drawPickups(ctx, pickups, view, now);
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
    // Your own character never fades — it's always fully in view.
    const isSelf = s.id === selfId;
    ctx.globalAlpha = isSelf ? 1 : entry.alpha;
    drawEntity(ctx, s, isSelf, now, simpleEntities);
    // Flame licks over the top of the body, not under it.
    if (s.burning && !simpleEntities) drawBurning(ctx, s, now);
    // The tracker's arrow orbits you, pointing at the nearest one.
    if (isSelf && inventory && inventory.trackBearing !== null) {
      drawTracker(ctx, s.x, s.y, inventory.trackBearing, now);
    }
  }
  ctx.globalAlpha = 1;
  mark('entities');

  // Napalm lingers, so it can't be culled on the round tracer's clock.
  tracers = tracers.filter(
    (t) => now - t.born < (t.kind === 'flame' ? FLAME_TRACER_MS : TRACER_LIFETIME_MS),
  );
  drawTracers(ctx, tracers, now, TRACER_LIFETIME_MS);

  drawZaps(ctx, zaps, view, now);
  drawDucks(ctx, ducks, view);
  if (map) drawBushes(ctx, map.bushes, view);

  // Air support sits above the foliage: smoke, then the grenade, then the
  // aircraft itself over everything on the ground.
  drawSmoke(ctx, smokes, now);
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

  if (!spectating && me) drawFog(me, view, now);
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

  // HUD sits above the fog so guidance stays legible.
  drawBeacons(ctx, beacons, view, scale, VIEWPORT_WIDTH, VIEWPORT_HEIGHT);

  if (!spectating) {
    if (inventory && me) {
      // A door under your nose owns the E key, so it owns the prompt too.
      if (doorPrompt) {
        drawDoorPrompt(ctx, doorPrompt, (me.x - view.x) * scale, (me.y - view.y) * scale);
      } else {
        drawInteractPrompt(ctx, inventory, (me.x - view.x) * scale, (me.y - view.y) * scale);
      }
      drawInventory(ctx, inventory, VIEWPORT_WIDTH, VIEWPORT_HEIGHT, now);
    }
    drawStamina(ctx, stamina, STAMINA_MAX, VIEWPORT_WIDTH, VIEWPORT_HEIGHT, exhausted);
    // Aiming hard up or down runs the camera off a screen that is only 600
    // tall. Rather than shorten the vertical reach to keep the officer in
    // frame — which is the very thing the scope is for — he goes off the edge
    // and this marks where. Over the slot bar, not under it.
    if (me) drawSelfMarker(ctx, me.x - view.x, me.y - view.y, VIEWPORT_WIDTH, VIEWPORT_HEIGHT);
    if (wheel.open) {
      wheel.hover = hitTest(wheel, input.mouseX, input.mouseY, wheelOptions(following, beaconInEarshot()).length);
      drawWheel(
        ctx,
        wheel,
        wheelOptions(following, beaconInEarshot()),
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


  const counts = `survivors ${survivors} · incubating ${infectedCount} · zombies ${zombieCount}`;
  hud.textContent = spectating
    ? `SPECTATING (WASD pan · shift faster · scroll zoom) — ${counts}`
    // The cure gun is the only thing that tells you about yourself. The server
    // sends null unless one is in hand, so there is nothing to read otherwise.
    : inventory?.selfInfected === true
      ? `${counts} · YOU ARE INFECTED`
      : inventory?.selfInfected === false
        ? `${counts} · you are clean`
        : counts;

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
    worstResetAt = now;
    worstFrameMs = 0;
  }

  mark('hud');
  // Hold this frame's cost and breakdown for whoever reports the next gap.
  lastRenderMs = performance.now() - now;
  lastPhases = phases;

  const fpsClass = fps >= 55 ? '' : fps >= 40 ? 'warn' : 'bad';
  const tickClass = serverTickMs < 16 ? '' : serverTickMs < 28 ? 'warn' : 'bad';
  perfHud.innerHTML =
    `<span class="${fpsClass}">${Math.round(fps)} fps</span> · spike ${worstFrameMs.toFixed(0)}ms<br>` +
    `<span class="${tickClass}">tick ${serverTickMs.toFixed(2)}ms</span> / 33.3ms<br>` +
    `fog ${fogComputeMs.toFixed(2)}ms · ${tracked.size} drawn`;

  requestAnimationFrame(render);
}
render();
