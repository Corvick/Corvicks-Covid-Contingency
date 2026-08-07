import {
  VIEWPORT_WIDTH,
  VIEWPORT_HEIGHT,
  WORLD_WIDTH,
  WORLD_HEIGHT,
  TRACER_LIFETIME_MS,
  PLAYER_SIGHT_RADIUS,
  STAMINA_MAX,
  FOG_UPDATE_MS,
  FOG_MOVE_EPSILON,
  FOG_MASK_SCALE,
  FOG_BLUR_PX,
  ENTITY_FADE_MS,
  MATERIALIZE_MS,
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
  Wall,
} from '../../shared/types.js';
import { connect } from './net.js';
import { trackInput } from './input.js';
import {
  drawBeacons,
  drawBushes,
  drawCrosshair,
  doorSlab,
  drawDoorPrompt,
  drawDoors,
  drawEntity,
  drawGrenades,
  drawGround,
  drawHandLinks,
  drawHelicopters,
  drawInteractPrompt,
  drawInventory,
  drawPickups,
  drawSmoke,
  drawStamina,
  drawTracers,
  drawSpeechBubbles,
  drawWalls,
  drawWindows,
  type Tracer,
  type Viewport,
} from './render.js';
import { visibilityPolygon, type Point as FogPoint } from './fog.js';
import { drawTargetCursor, drawWheel, hitTest, newWheelState, WHEEL_OPTIONS } from './wheel.js';
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

const menu = document.getElementById('menu') as HTMLDivElement;
const restartBtn = document.getElementById('restart-btn') as HTMLButtonElement;
const spectateBtn = document.getElementById('spectate-btn') as HTMLButtonElement;
const gameOverPanel = document.getElementById('game-over') as HTMLDivElement;
const gameOverRestart = document.getElementById('game-over-restart') as HTMLButtonElement;
const victoryPanel = document.getElementById('victory') as HTMLDivElement;
const victoryRestart = document.getElementById('victory-restart') as HTMLButtonElement;
const hud = document.getElementById('hud') as HTMLDivElement;
const perfHud = document.getElementById('perf') as HTMLDivElement;

let selfId: string | null = null;
let entities: EntityState[] = [];
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
let pickups: PickupState[] = [];
let inventory: InventoryState | null = null;
let grenades: GrenadeState[] = [];
let smokes: SmokeState[] = [];
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

/**
 * `?spectate` on the URL drops straight into spectator mode on connect,
 * watching the round already in progress. `?spectate=new` starts a fresh one
 * to watch from the beginning.
 */
const spectateParam = new URLSearchParams(location.search).get('spectate');
const startSpectating = spectateParam !== null;

const { send } = connect((msg) => {
  if (msg.type === 'welcome') {
    selfId = msg.selfId;
    map = msg.map;
    if (startSpectating) send({ type: 'spectate', restart: spectateParam === 'new' });
  } else if (msg.type === 'map') {
    map = msg.map;
    tracers = [];
    // Drop the old snapshot too: keeping it would compute one frame of fog
    // from stale positions against the new map's walls.
    entities = [];
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
    entities = msg.entities;
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
    pickups = msg.pickups;
    inventory = msg.inventory;
    grenades = msg.grenades;
    smokes = msg.smokes;
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

window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape') {
    // Back out of an armed order first, rather than opening the menu.
    if (armedAbility) armedAbility = null;
    else menu.classList.toggle('hidden');
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
      const index = hitTest(wheel, input.mouseX, input.mouseY);
      if (index < 0) return;

      if (rallyCharges <= 0) {
        wheel.deniedAt = performance.now();
        wheel.deniedIndex = index;
        send({ type: 'ability', ability: WHEEL_OPTIONS[index].id, x: 0, y: 0 });
        return; // wheel deliberately stays open
      }

      armedAbility = WHEEL_OPTIONS[index].id;
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
    if (!spectating) return;
    e.preventDefault();

    const before = cameraFor(undefined);
    const worldX = before.view.x + input.mouseX / before.scale;
    const worldY = before.view.y + input.mouseY / before.scale;

    const next = clamp(
      spectateZoom * Math.exp(-e.deltaY * 0.0015),
      SPECTATE_ZOOM_MIN,
      SPECTATE_ZOOM_MAX,
    );
    if (next === spectateZoom) return;
    spectateZoom = next;

    const scale = SPECTATE_FIT * spectateZoom;
    spectateX = worldX - input.mouseX / scale + VIEWPORT_WIDTH / scale / 2;
    spectateY = worldY - input.mouseY / scale + VIEWPORT_HEIGHT / scale / 2;
  },
  { passive: false },
);

restartBtn.addEventListener('click', () => {
  send({ type: 'restart' });
  menu.classList.add('hidden');
});

spectateBtn.addEventListener('click', () => {
  send({ type: 'spectate' });
  menu.classList.add('hidden');
});

gameOverRestart.addEventListener('click', () => {
  send({ type: 'restart' });
  gameOverPanel.classList.add('hidden');
});

victoryRestart.addEventListener('click', () => {
  send({ type: 'restart' });
  victoryPanel.classList.add('hidden');
});

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

function syncTracked(incoming: EntityState[]): void {
  for (const entry of tracked.values()) entry.seen = false;
  for (const e of incoming) {
    const entry = tracked.get(e.id);
    if (entry) {
      entry.state = e;
      entry.seen = true;
    } else {
      tracked.set(e.id, { state: e, alpha: 0, seen: true });
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
  return entities.find((e) => e.id === selfId);
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
  return {
    view: {
      x: clamp(view.x - VIEWPORT_WIDTH / 2, 0, Math.max(0, WORLD_WIDTH - VIEWPORT_WIDTH)),
      y: clamp(view.y - VIEWPORT_HEIGHT / 2, 0, Math.max(0, WORLD_HEIGHT - VIEWPORT_HEIGHT)),
      w: VIEWPORT_WIDTH,
      h: VIEWPORT_HEIGHT,
    },
    scale: 1,
  };
}

function aimAngle(): number {
  const me = self();
  if (!me) return 0;
  const { view, scale } = cameraFor(me);
  return Math.atan2(view.y + input.mouseY / scale - me.y, view.x + input.mouseX / scale - me.x);
}

function sendInputLoop() {
  // Slot keys are edge-triggered, so drain the latch as we send.
  if (input.slotPressed >= 0) {
    send({ type: 'selectSlot', slot: input.slotPressed });
    input.slotPressed = -1;
  }

  send({
    type: 'input',
    input: { ...input.state },
    aim: aimAngle(),
    // Neither the wheel nor an armed order should empty your magazine.
    shooting: input.shooting && !spectating && !wheel.open && !armedAbility,
    sprint: input.sprint,
    interact: input.interact && !spectating,
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
let fogComputeMs = 0;

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
  const moved = Math.hypot(me.x - cachedX, me.y - cachedY);
  if (cachedPoly.length > 0 && moved < FOG_MOVE_EPSILON && now - cachedAt < FOG_UPDATE_MS) {
    return cachedPoly;
  }

  const t0 = performance.now();
  cachedPoly = visibilityPolygon(me.x, me.y, PLAYER_SIGHT_RADIUS, occludersFor(map), map.bushes);
  fogComputeMs = performance.now() - t0;
  cachedAt = now;
  cachedX = me.x;
  cachedY = me.y;

  // Watchdog: if the visible region covers nearly the whole sight circle while
  // walls are standing right next to us, occlusion has failed. Log it with
  // enough detail to reproduce the exact spot.
  let area = 0;
  for (let i = 0, j = cachedPoly.length - 1; i < cachedPoly.length; j = i++) {
    area += (cachedPoly[j].x + cachedPoly[i].x) * (cachedPoly[j].y - cachedPoly[i].y);
  }
  area = Math.abs(area / 2);
  const full = Math.PI * PLAYER_SIGHT_RADIUS * PLAYER_SIGHT_RADIUS;
  if (area > full * 0.93) {
    const R = PLAYER_SIGHT_RADIUS;
    const near = map.walls.filter(
      (w) => w.x - R <= me.x && w.x + w.w + R >= me.x && w.y - R <= me.y && w.y + w.h + R >= me.y,
    ).length;
    if (near > 0) {
      console.warn(
        `[fog] no occlusion at ${Math.round(me.x)},${Math.round(me.y)} — ` +
          `${near} walls in range, ${cachedPoly.length} poly points, ` +
          `${Math.round((area / full) * 100)}% of circle visible, seed ${map.seed}`,
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
    const r = PLAYER_SIGHT_RADIUS * s;

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
      if (prev.atRadius && p.atRadius) {
        fogCtx.arc(cx, cy, r, prev.angle, p.angle);
      } else {
        fogCtx.lineTo((p.x - view.x) * s, (p.y - view.y) * s);
      }
    }
    const last = poly[poly.length - 1];
    if (last.atRadius && poly[0].atRadius) {
      fogCtx.arc(cx, cy, r, last.angle, poly[0].angle + Math.PI * 2);
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
const phases: Array<[string, number]> = [];
let lastSlowReport = 0;

function mark(label: string): void {
  const t = performance.now();
  phases.push([label, t - phaseAt]);
  phaseAt = t;
}

function reportSlowFrame(total: number, now: number, drawn: number): void {
  // At most one report a second, so a bad patch doesn't flood the console.
  if (now - lastSlowReport < 1000) return;
  lastSlowReport = now;
  const parts = phases.map(([label, cost]) => `${label} ${cost.toFixed(1)}`).join(' · ');
  console.warn(
    `[perf] slow frame ${total.toFixed(0)}ms — ${parts} · drawn ${drawn} · fogPoly ${fogComputeMs.toFixed(1)}ms`,
  );
}

function render() {
  const now = performance.now();
  const frameDelta = lastFrameAt > 0 ? Math.min(100, now - lastFrameAt) : 16;
  advanceFades(frameDelta);
  phases.length = 0;
  phaseAt = now;

  const me = self();
  const { view, scale } = cameraFor(me);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#0b0d10';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  ctx.scale(scale, scale);
  ctx.translate(-view.x, -view.y);

  if (map) {
    drawGround(ctx, map);
    drawWalls(ctx, map.walls, view);
    drawWindows(ctx, map.windows, brokenWindows, view);
    drawDoors(ctx, map.doors, doorStates, view);
    drawPickups(ctx, pickups, view, now);
  }
  mark('map');

  drawHandLinks(ctx, Array.from(tracked.values()), view);

  for (const entry of tracked.values()) {
    // Your own character never fades — it's always fully in view.
    const isSelf = entry.state.id === selfId;
    ctx.globalAlpha = isSelf ? 1 : entry.alpha;
    drawEntity(ctx, entry.state, isSelf, now);
  }
  ctx.globalAlpha = 1;
  mark('entities');

  tracers = tracers.filter((t) => now - t.born < TRACER_LIFETIME_MS);
  drawTracers(ctx, tracers, now, TRACER_LIFETIME_MS);

  if (map) drawBushes(ctx, map.bushes, view);

  // Air support sits above the foliage: smoke, then the grenade, then the
  // aircraft itself over everything on the ground.
  drawSmoke(ctx, smokes, now);
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
      drawInventory(ctx, inventory, VIEWPORT_WIDTH, VIEWPORT_HEIGHT);
    }
    drawStamina(ctx, stamina, STAMINA_MAX, VIEWPORT_WIDTH, VIEWPORT_HEIGHT, exhausted);
    if (wheel.open) {
      wheel.hover = hitTest(wheel, input.mouseX, input.mouseY);
      drawWheel(ctx, wheel, rallyCharges, now);
    }
    // An armed order swaps the crosshair for a blue placement arrow.
    if (armedAbility) drawTargetCursor(ctx, input.mouseX, input.mouseY, now);
    else drawCrosshair(ctx, input.mouseX, input.mouseY);
  }


  const counts = `survivors ${survivors} · incubating ${infectedCount} · zombies ${zombieCount}`;
  hud.textContent = spectating ? `SPECTATING — ${counts}` : counts;

  // Perf readout: client frame rate, worst frame in the last second, and the
  // server's tick cost against its 33.3ms budget.
  if (lastFrameAt > 0) {
    const frameMs = now - lastFrameAt;
    fps = fps === 0 ? 1000 / frameMs : fps * 0.92 + (1000 / frameMs) * 0.08;
    if (frameMs > worstFrameMs) worstFrameMs = frameMs;
  }
  lastFrameAt = now;
  if (now - worstResetAt > 1000) {
    worstResetAt = now;
    worstFrameMs = 0;
  }

  mark('hud');
  const frameCost = performance.now() - now;
  if (frameCost >= SLOW_FRAME_MS) reportSlowFrame(frameCost, now, tracked.size);

  const fpsClass = fps >= 55 ? '' : fps >= 40 ? 'warn' : 'bad';
  const tickClass = serverTickMs < 16 ? '' : serverTickMs < 28 ? 'warn' : 'bad';
  perfHud.innerHTML =
    `<span class="${fpsClass}">${Math.round(fps)} fps</span> · spike ${worstFrameMs.toFixed(0)}ms<br>` +
    `<span class="${tickClass}">tick ${serverTickMs.toFixed(2)}ms</span> / 33.3ms<br>` +
    `fog ${fogComputeMs.toFixed(2)}ms · ${tracked.size} drawn`;

  requestAnimationFrame(render);
}
render();
