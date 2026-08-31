import type {
  Bush,
  Door,
  DoorPrompt,
  DoorState,
  EntityState,
  GrenadeState,
  HelicopterState,
  InventoryState,
  MapData,
  Park,
  PickupState,
  AcidState,
  SmokeState,
  SpitState,
  SpeechState,
  BlastState,
  TentacleState,
  LashState,
  Pond,
  DuckState,
  EmplacementState,
  BarricadeState,
  BuildSiteState,
  FireState,
  BeaconState,
  MineState,
  BackupVehicleState,
  CorpseState,
  ShotKind,
  Wall,
  Window as WindowPane,
} from '../../shared/types.js';
import { ITEMS, type ItemId } from '../../shared/items.js';
import { pondRadiusAt } from '../../shared/pond.js';
import { acidLobes } from '../../shared/acidshape.js';
import {
  BARRICADE_HALF_DEPTH,
  BARRICADE_HALF_WIDTH,
  ENTITY_COLOR,
  ENTITY_RADIUS,
  ENTITY_MAX_HEALTH,
  NPC_OFFICER_COLOR,
  BOT_OFFICER_COLOR,
  BOT_OFFICER_HEAD_COLOR,
  EMPTY_PICKUP_COLOR,
  EMPLACEMENT_AMMO,
  SOLDIER_COLOR,
  SWAT_COLOR,
  SWAT_HELMET_COLOR,
  HELI_RADIUS,
  HELI_SHADOW_ALPHA,
  WALL_THICKNESS,
  GUN_SLOTS,
  BLAST_RADIUS,
  BLAST_MS,
  FLAME_RANGE,
  FLAME_TRACER_MS,
  FLAME_ARC_LIFT,
  FLAME_TRAVEL_MS,
  FLAME_MOUTH_WIDTH,
  FLAME_TIP_WIDTH,
  FLAME_SLUG_MS,
  FLAME_STREAM_STEP,
  FLAME_BLOB_RADIUS,
  CHARGE_BARS,
  FLAME_ARC_VERTICAL_MIN,
  FIRE_FADE_FRACTION,
  SHIELD_FRONT_ARC,
  VAN_LENGTH,
  CAR_LENGTH,
  CAR_WIDTH,
  CAR_DOOR_ARC,
  VAN_WIDTH,
  RADIO_COOLDOWN_MS,
  PARK_PATH_SPECKS,
  PARK_PATH_END_SPECKS,
  PARK_PATH_END_SCATTER,
  PARK_LAMP_INSET,
  PARK_LAMP_OFFSET,
  PARK_LAMP_GLOW,
  VAN_REAR_DOOR_ARC,
  VAN_CAB_DOOR_ARC,
  TYRE_SMOKE_PUFFS,
  TYRE_SMOKE_LINGER_MS,
  ZAP_FLASH_MS,
  ZAP_MINE_RADIUS,
  WORLD_WIDTH,
  WORLD_HEIGHT,
  MINIMAP_MAX_W,
  MINIMAP_MARGIN,
  BEACON_MUSTER_RADIUS,
  DOG_ART_RADIUS,
  DOG_MORPH_ART_MUL,
  DOG_MORPH_TENTACLES,
  DOG_LASH_STRIKE_ARMS,
  DOG_LASH_COIL,
  LASH_WARN_COLOR,
  LASH_WARN_RIM,
  LASH_CHIP_COUNT,
  LASH_CHIP_MS,
  LASH_CHIP_SPEED,
  LASH_GOUGE_MS,
  LASH_GOUGE_COLOR,
  LASH_CHIP_COLOR,
  DOG_MAP_MARGIN,
  DOG_MAP_SIZE,
  DOG_MAX_HEALTH,
  DOG_ROAR_RING_MS,
  DOG_ROAR_RING_REACH,
  DOG_BODY_COLOR,
  DOG_TENTACLE_COLOR,
  DOG_FUR_COLOR,
  DOG_HEAD_COLOR,
  DOG_DECAY_COLOR,
  DOG_ROT_COLOR,
  DOG_MAW_COLOR,
  DOG_BONE_COLOR,
  DOG_EYE_COLOR,
  GRIME_TILE,
  GRIME_BLOTCHES,
  GRIME_GRIT,
  GRIME_CRACKS,
  GROUND_COLOR,
  BIRTH_ARM_TWIST,
  BIRTH_BURST_SPOKES,
  BIRTH_COLOR,
  BIRTH_SHAKE_PX,
  BLOOD_COLOR,
  BLOOD_DECAL_MAX,
  BLOOD_DECAL_MS,
  BLOOD_BAKE_SCALE,
  BLOOD_SPRAY_MS,
  BLOOD_SPRAY_DROPS,
  BLOOD_SPRAY_SPEED,
  CORPSE_SLIDE_PX,
  CORPSE_SLIDE_MS,
  CORPSE_GREY_MS,
  CORPSE_COLOR,
  DOG_BIRTH_TWIST_FROM,
  DOG_FADE_FROM,
  DOG_RESPAWN_FADE_MS,
  VIGNETTE_ALPHA,
  VIGNETTE_INNER,
} from '../../shared/constants.js';
import type { DogHud } from '../../shared/types.js';
import { dogSprites, drawSprite } from './dogsprite.js';
import { settings } from './settings.js';

const TAU = Math.PI * 2;

/** Shortest signed difference from `a` to `b`. The client's own small copy. */
function angDelta(a: number, b: number): number {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

/**
 * A tiny deterministic generator, so anything hashed out of it — the grime
 * tile, a dog's rot patches — is identical every run and every frame with no
 * state stored per blob. Same trick the park's dirt path uses.
 */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export interface Viewport {
  x: number;
  y: number;
  w: number;
  h: number;
}

function shade(hex: string, amount: number): string {
  const num = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, (num >> 16) + amount));
  const g = Math.max(0, Math.min(255, ((num >> 8) & 0xff) + amount));
  const b = Math.max(0, Math.min(255, (num & 0xff) + amount));
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * Blend two colours. Returns hex rather than `rgb()` so the result can be fed
 * straight back through `shade`, which is how the head is derived from the
 * body.
 */
function mix(from: string, to: string, t: number): string {
  const a = parseInt(from.slice(1), 16);
  const b = parseInt(to.slice(1), 16);
  const k = Math.max(0, Math.min(1, t));
  const lerp = (shift: number) => {
    const av = (a >> shift) & 0xff;
    const bv = (b >> shift) & 0xff;
    return Math.round(av + (bv - av) * k);
  };
  const hex = (v: number) => v.toString(16).padStart(2, '0');
  return `#${hex(lerp(16))}${hex(lerp(8))}${hex(lerp(0))}`;
}

function visible(view: Viewport, x: number, y: number, pad: number): boolean {
  return (
    x + pad >= view.x && x - pad <= view.x + view.w && y + pad >= view.y && y - pad <= view.y + view.h
  );
}

/**
 * The filth on the road, baked into one tile and repeated.
 *
 * Built once and handed to the canvas as a pattern, so a five-thousand-pixel
 * city of grime costs **one fill** at any zoom — the rasteriser only touches
 * the pixels actually on screen. Scattering blobs over the viewport per frame
 * is the obvious way to write this and is the expensive one: that is the same
 * fill-rate trap `drawBushes` fell into, where a hundred overlapping
 * translucent circles cost per pixel per frame and their union costs one.
 *
 * Everything is drawn four times, wrapped by a tile in each direction, so
 * nothing that crosses an edge leaves a seam where the pattern repeats.
 */
let grimePattern: CanvasPattern | null = null;

function grimeTile(ctx: CanvasRenderingContext2D): CanvasPattern | null {
  if (grimePattern) return grimePattern;

  const tile = document.createElement('canvas');
  tile.width = GRIME_TILE;
  tile.height = GRIME_TILE;
  const g = tile.getContext('2d');
  if (!g) return null;
  const rand = rng(0x9e3779b9);

  // Anything crossing an edge has to appear on the far side too, or the repeat
  // shows as a grid of hard lines across the whole city.
  const wrapped = (x: number, y: number, draw: (px: number, py: number) => void) => {
    for (const ox of [0, -GRIME_TILE, GRIME_TILE]) {
      for (const oy of [0, -GRIME_TILE, GRIME_TILE]) draw(x + ox, y + oy);
    }
  };

  // Wet patches and worn tarmac: broad, low-contrast, and the thing that stops
  // the road reading as a flat colour.
  // Kept very low contrast on purpose. At any strength you can actually make
  // out an individual blotch, you can also make out where the tile repeats —
  // the road turns into a grid of identical stains. They are here to break up
  // a flat fill, not to be seen.
  for (let i = 0; i < GRIME_BLOTCHES; i++) {
    const x = rand() * GRIME_TILE;
    const y = rand() * GRIME_TILE;
    const r = 10 + rand() * 30;
    const dark = rand() < 0.62;
    g.fillStyle = dark ? 'rgba(0, 0, 0, 0.05)' : 'rgba(96, 92, 82, 0.022)';
    wrapped(x, y, (px, py) => {
      g.beginPath();
      g.ellipse(px, py, r, r * (0.55 + rand() * 0.5), rand() * TAU, 0, TAU);
      g.fill();
    });
  }

  // Cracks. Short, kinked, and darker than anything else on the tile.
  g.strokeStyle = 'rgba(0, 0, 0, 0.2)';
  g.lineCap = 'round';
  for (let i = 0; i < GRIME_CRACKS; i++) {
    let x = rand() * GRIME_TILE;
    let y = rand() * GRIME_TILE;
    let a = rand() * TAU;
    const pts: Array<[number, number]> = [[x, y]];
    for (let s = 0; s < 5; s++) {
      a += (rand() - 0.5) * 1.2;
      x += Math.cos(a) * (8 + rand() * 16);
      y += Math.sin(a) * (8 + rand() * 16);
      pts.push([x, y]);
    }
    g.lineWidth = 0.6 + rand() * 0.9;
    wrapped(0, 0, (ox, oy) => {
      g.beginPath();
      g.moveTo(pts[0][0] + ox, pts[0][1] + oy);
      for (let p = 1; p < pts.length; p++) g.lineTo(pts[p][0] + ox, pts[p][1] + oy);
      g.stroke();
    });
  }

  // Grit. One path, filled once — a few hundred separate fills would undo the
  // whole point even at build time.
  g.beginPath();
  for (let i = 0; i < GRIME_GRIT; i++) {
    const x = rand() * GRIME_TILE;
    const y = rand() * GRIME_TILE;
    const s = 0.8 + rand() * 1.5;
    wrapped(x, y, (px, py) => g.rect(px, py, s, s));
  }
  g.fillStyle = 'rgba(126, 120, 108, 0.1)';
  g.fill();

  grimePattern = ctx.createPattern(tile, 'repeat');
  return grimePattern;
}

export function drawGround(ctx: CanvasRenderingContext2D, map: MapData): void {
  ctx.fillStyle = GROUND_COLOR;
  ctx.fillRect(0, 0, map.width, map.height);
  if (!settings.groundDetail) return;
  const pattern = grimeTile(ctx);
  if (!pattern) return;
  // The pattern is in user space, so it scales and pans with the world — the
  // grime is *on the road* rather than a screen overlay that slides under it.
  ctx.fillStyle = pattern;
  ctx.fillRect(0, 0, map.width, map.height);
}

/**
 * The park's grass and the dirt path worn across it.
 *
 * One stroked polyline rather than a run of blobs — the path is a shape, not a
 * scatter, and a round cap and join are what stop the kinks reading as a
 * chain of sausages. The soft edge is a second, wider, fainter pass
 * underneath, which is cheaper than any kind of blur and reads as the grass
 * giving way rather than the dirt stopping at a line.
 */
export function drawPark(ctx: CanvasRenderingContext2D, park: Park, view: Viewport): void {
  if (
    park.x > view.x + view.w ||
    park.x + park.w < view.x ||
    park.y > view.y + view.h ||
    park.y + park.h < view.y
  ) {
    return;
  }

  // A shade of green under the trees, so the park reads as ground rather than
  // as street that happens to have bushes on it.
  ctx.fillStyle = '#232c25';
  ctx.fillRect(park.x, park.y, park.w, park.h);

  if (park.path.length < 2) return;

  // The path itself. Ends are **butt**, not round: a track worn through grass
  // stops where people stopped walking, and a domed cap reads as a lozenge
  // lying on the lawn rather than as a way in.
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'round';
  for (const [width, colour] of [
    [park.pathWidth + 14, 'rgba(74, 60, 43, 0.45)'],
    [park.pathWidth, '#4a3c2b'],
  ] as Array<[number, string]>) {
    ctx.strokeStyle = colour;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(park.path[0].x, park.path[0].y);
    for (let i = 1; i < park.path.length; i++) ctx.lineTo(park.path[i].x, park.path[i].y);
    ctx.stroke();
  }

  drawPathDirt(ctx, park);
  ctx.lineJoin = 'miter';

  // A lamp at each end, so the way in is marked after dark and the two ends
  // read as entrances rather than as the track simply running out.
  drawPathLamps(ctx, park);
}

/**
 * Grit and scuffing on the path, and a scatter of loose dirt spilling off each
 * end onto the grass.
 *
 * Everything here is hashed off its own index rather than stored or rolled, so
 * the texture is identical every frame and costs nothing to keep — the park is
 * already the most overdraw-sensitive thing on screen (see the note on
 * `drawBushes`), so this is a fixed number of small opaque blobs and no state.
 */
function drawPathDirt(ctx: CanvasRenderingContext2D, park: Park): void {
  const rand = (i: number, salt: number): number => {
    const v = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
    return v - Math.floor(v);
  };

  // Along the path: darker grit and lighter scuffs, so it stops being a flat
  // brown ribbon and starts reading as trodden earth.
  const segments = park.path.length - 1;
  for (let i = 0; i < PARK_PATH_SPECKS; i++) {
    const t = (i + rand(i, 1)) / PARK_PATH_SPECKS;
    const seg = Math.min(segments - 1, Math.floor(t * segments));
    const local = t * segments - seg;
    const a = park.path[seg];
    const b = park.path[seg + 1];
    const across = (rand(i, 2) - 0.5) * park.pathWidth * 0.92;
    const nx = -(b.y - a.y);
    const ny = b.x - a.x;
    const len = Math.hypot(nx, ny) || 1;
    const x = a.x + (b.x - a.x) * local + (nx / len) * across;
    const y = a.y + (b.y - a.y) * local + (ny / len) * across;
    const r = 1.1 + rand(i, 3) * 2.6;
    ctx.fillStyle = rand(i, 4) < 0.5 ? 'rgba(58, 46, 32, 0.75)' : 'rgba(101, 84, 62, 0.6)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // And the ends, where the track frays out into the grass. A flat cap on its
  // own is too clean a line — the spill is what makes it look worn rather than
  // cut.
  for (const [end, inward] of [
    [park.path[0], park.path[1]],
    [park.path[park.path.length - 1], park.path[park.path.length - 2]],
  ] as Array<[{ x: number; y: number }, { x: number; y: number }]>) {
    const dx = end.x - inward.x;
    const dy = end.y - inward.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    for (let i = 0; i < PARK_PATH_END_SPECKS; i++) {
      const out = rand(i, 7) * PARK_PATH_END_SCATTER;
      const across = (rand(i, 8) - 0.5) * (park.pathWidth + PARK_PATH_END_SCATTER * 0.8);
      const x = end.x + ux * out - uy * across;
      const y = end.y + uy * out + ux * across;
      const r = 1 + rand(i, 9) * 2.4;
      // Thinner the further out it has been kicked.
      ctx.fillStyle = `rgba(74, 60, 43, ${(0.62 * (1 - out / PARK_PATH_END_SCATTER)).toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/**
 * A lamp post at either end of the path, throwing a faint pool of yellow.
 *
 * Derived from the path rather than sent: the two ends are the first and last
 * points of a polyline the client already has, so this costs nothing on the
 * wire and cannot drift out of step with where the path actually runs. Set
 * back off the end and to one side, the way a lamp stands beside a gate rather
 * than in the middle of it.
 */
function drawPathLamps(ctx: CanvasRenderingContext2D, park: Park): void {
  const ends: Array<[{ x: number; y: number }, { x: number; y: number }]> = [
    [park.path[0], park.path[1]],
    [park.path[park.path.length - 1], park.path[park.path.length - 2]],
  ];

  for (const [end, inward] of ends) {
    const dx = end.x - inward.x;
    const dy = end.y - inward.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    // Beside the mouth of the path, a little in from the very end.
    const x = end.x - ux * PARK_LAMP_INSET - uy * (park.pathWidth / 2 + PARK_LAMP_OFFSET);
    const y = end.y - uy * PARK_LAMP_INSET + ux * (park.pathWidth / 2 + PARK_LAMP_OFFSET);

    // The pool of light first, under everything.
    const glow = ctx.createRadialGradient(x, y, 0, x, y, PARK_LAMP_GLOW);
    glow.addColorStop(0, 'rgba(255, 226, 148, 0.20)');
    glow.addColorStop(0.5, 'rgba(255, 218, 130, 0.09)');
    glow.addColorStop(1, 'rgba(255, 214, 120, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, PARK_LAMP_GLOW, 0, Math.PI * 2);
    ctx.fill();

    // The post, seen from above: a base, a short shadow cast away from the
    // path, and the lit head.
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.beginPath();
    ctx.ellipse(x + ux * 5, y + uy * 5, 6, 4, Math.atan2(uy, ux), 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3f434a';
    ctx.beginPath();
    ctx.arc(x, y, 3.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffe89a';
    ctx.beginPath();
    ctx.arc(x, y, 2.1, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function drawWalls(ctx: CanvasRenderingContext2D, walls: Wall[], view: Viewport): void {
  ctx.fillStyle = '#4a5260';
  ctx.strokeStyle = '#5f6878';
  ctx.lineWidth = 1;

  for (const wall of walls) {
    if (
      wall.x > view.x + view.w ||
      wall.x + wall.w < view.x ||
      wall.y > view.y + view.h ||
      wall.y + wall.h < view.y
    ) {
      continue;
    }
    ctx.fillRect(wall.x, wall.y, wall.w, wall.h);
    ctx.strokeRect(wall.x + 0.5, wall.y + 0.5, wall.w - 1, wall.h - 1);
  }
}

/** Intact panes read as glass; smashed ones leave an empty gap in the wall. */
export function drawWindows(
  ctx: CanvasRenderingContext2D,
  windows: WindowPane[],
  broken: Set<number>,
  view: Viewport,
): void {
  for (let i = 0; i < windows.length; i++) {
    if (broken.has(i)) continue;
    const p = windows[i];
    if (
      p.x > view.x + view.w ||
      p.x + p.w < view.x ||
      p.y > view.y + view.h ||
      p.y + p.h < view.y
    ) {
      continue;
    }
    ctx.fillStyle = 'rgba(147, 197, 253, 0.34)';
    ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.strokeStyle = 'rgba(191, 219, 254, 0.7)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(p.x + 0.5, p.y + 0.5, p.w - 1, p.h - 1);
  }
}

/** Segments used to trace the bank — enough that it reads as a smooth curve. */
const POND_SEGMENTS = 48;

/** The pond and its lily pads. Drawn with the ground, under everything else. */
export function drawPond(ctx: CanvasRenderingContext2D, pond: Pond, view: Viewport): void {
  // The wobble can push the bank half again past the mean radius.
  if (!visible(view, pond.x, pond.y, pond.r * 1.5 + 20)) return;

  // Traced from the same radius-per-bearing the server collides against, so
  // the drawn bank is exactly the one you can't walk past.
  const outline = (scale: number) => {
    ctx.beginPath();
    for (let i = 0; i <= POND_SEGMENTS; i++) {
      const angle = (i / POND_SEGMENTS) * Math.PI * 2;
      const r = pondRadiusAt(pond, angle) * scale;
      const px = pond.x + Math.cos(angle) * r;
      const py = pond.y + Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
  };

  outline(1);
  ctx.fillStyle = 'rgba(30, 64, 92, 0.92)';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(71, 116, 145, 0.9)';
  ctx.stroke();

  // A lighter shallow rim, so it reads as water rather than a hole.
  outline(0.82);
  ctx.strokeStyle = 'rgba(96, 150, 180, 0.32)';
  ctx.lineWidth = 6;
  ctx.stroke();

  for (const pad of pond.pads) {
    ctx.beginPath();
    ctx.arc(pad.x, pad.y, pad.r, 0.5, Math.PI * 2 + 0.15);
    ctx.closePath();
    ctx.fillStyle = 'rgba(34, 105, 58, 0.95)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(18, 66, 36, 0.9)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}

/** Ducks: a body and a bill, wings out and a shadow beneath once they're up. */
export function drawDucks(ctx: CanvasRenderingContext2D, ducks: DuckState[], view: Viewport): void {
  for (const duck of ducks) {
    if (!visible(view, duck.x, duck.y, 26)) continue;
    const dirX = Math.cos(duck.facing);
    const dirY = Math.sin(duck.facing);

    // Climbing away: the bird shrinks and fades while its shadow spreads and
    // drifts further beneath it, which is what height looks like from above.
    const climb = duck.flying ? Math.max(0, Math.min(1, duck.climb ?? 0)) : 0;
    const size = 1 - climb * 0.62;
    const alpha = 1 - climb * climb; // hangs on, then goes

    if (duck.flying) {
      const drop = 9 + climb * 22;
      ctx.fillStyle = `rgba(0, 0, 0, ${(0.25 * (1 - climb * 0.5)).toFixed(3)})`;
      ctx.beginPath();
      ctx.ellipse(duck.x + 7 + climb * 8, duck.y + drop, 5 + climb * 7, 2.5 + climb * 4, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.save();
    ctx.globalAlpha = alpha;

    if (duck.flying) {
      // Wings beat faster and shorter as it gets away.
      ctx.strokeStyle = 'rgba(240, 240, 235, 0.95)';
      ctx.lineWidth = 2 * size;
      ctx.lineCap = 'round';
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(duck.x, duck.y);
        ctx.lineTo(
          duck.x - dirY * 9 * size * side - dirX * 3 * size,
          duck.y + dirX * 9 * size * side - dirY * 3 * size,
        );
        ctx.stroke();
      }
    }

    ctx.beginPath();
    ctx.ellipse(duck.x, duck.y, 5.5 * size, 4 * size, duck.facing, 0, Math.PI * 2);
    ctx.fillStyle = duck.flying ? '#e8e6df' : '#d8d4c8';
    ctx.fill();
    ctx.strokeStyle = 'rgba(40, 38, 32, 0.7)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Head and bill.
    ctx.beginPath();
    ctx.arc(duck.x + dirX * 5 * size, duck.y + dirY * 5 * size, 2.6 * size, 0, Math.PI * 2);
    ctx.fillStyle = '#3f6b3a';
    ctx.fill();
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 1.4 * size;
    ctx.beginPath();
    ctx.moveTo(duck.x + dirX * 7 * size, duck.y + dirY * 7 * size);
    ctx.lineTo(duck.x + dirX * 10 * size, duck.y + dirY * 10 * size);
    ctx.stroke();
    ctx.restore();
  }
}

/** Bushes draw over entities so anyone standing in one is partly concealed. */
export function drawBushes(ctx: CanvasRenderingContext2D, bushes: Bush[], view: Viewport): void {
  // Every visible bush goes into **one** path, filled once.
  //
  // The park is a hundred-odd overlapping circles, and drawing them separately
  // meant a hundred-odd translucent fills stacked on top of each other — the
  // fill-rate cost of that overdraw is paid per pixel, per frame, and it is
  // what made walking through the trees stutter. One path with nonzero winding
  // fills the union exactly once, so the thicket costs about what a single
  // blob does and stops darkening where bushes overlap.
  ctx.beginPath();
  let any = false;
  for (const bush of bushes) {
    if (!visible(view, bush.x, bush.y, bush.r + 8)) continue;
    ctx.moveTo(bush.x + bush.r, bush.y);
    ctx.arc(bush.x, bush.y, bush.r, 0, Math.PI * 2);
    any = true;
  }
  if (!any) return;

  ctx.fillStyle = 'rgba(24, 86, 48, 0.88)';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(15, 58, 32, 0.95)';
  ctx.stroke();
}

/**
 * Top-down figures per the reference sketch:
 *   zombie  — body with two arms reaching straight forward
 *   officer — body, head, both arms forward gripping a handgun
 *   civilian— plain body and head, no arms
 */
function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/**
 * The slab that fills a doorway when it's shut. Mirrors `doorRect` on the
 * server — both sides derive it from the same door record.
 */
export function doorSlab(door: Door): Wall {
  const t = WALL_THICKNESS;
  return door.horiz
    ? { x: door.x - door.halfSpan, y: door.y - t / 2, w: door.halfSpan * 2, h: t }
    : { x: door.x - t / 2, y: door.y - door.halfSpan, w: t, h: door.halfSpan * 2 };
}

/**
 * Doors, drawn from the map geometry plus whatever state the server last sent.
 * An open one swings back against the jamb; a shut one fills the opening, with
 * a bolt shown when it's locked and splintering as it takes damage.
 */
export function drawDoors(
  ctx: CanvasRenderingContext2D,
  doors: Door[],
  states: Map<number, DoorState>,
  view: Viewport,
): void {
  for (const [index, state] of states) {
    const door = doors[index];
    if (!door) continue;
    if (!visible(view, door.x, door.y, door.halfSpan + 24)) continue;

    const span = door.halfSpan * 2;
    const t = WALL_THICKNESS;

    if (state.broken) {
      // Wreckage: a couple of splinters left hanging in the frame.
      ctx.strokeStyle = 'rgba(120, 84, 52, 0.75)';
      ctx.lineWidth = 3;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        if (door.horiz) {
          ctx.moveTo(door.x + door.halfSpan * side, door.y);
          ctx.lineTo(door.x + door.halfSpan * side * 0.55, door.y + side * 7);
        } else {
          ctx.moveTo(door.x, door.y + door.halfSpan * side);
          ctx.lineTo(door.x + side * 7, door.y + door.halfSpan * side * 0.55);
        }
        ctx.stroke();
      }
      continue;
    }

    if (state.open) {
      // Swung back flat against the wall, on the hinge end.
      ctx.strokeStyle = '#7a5433';
      ctx.lineWidth = 5;
      ctx.lineCap = 'butt';
      ctx.beginPath();
      if (door.horiz) {
        ctx.moveTo(door.x - door.halfSpan, door.y);
        ctx.lineTo(door.x - door.halfSpan, door.y - span * 0.72);
      } else {
        ctx.moveTo(door.x, door.y - door.halfSpan);
        ctx.lineTo(door.x - span * 0.72, door.y - door.halfSpan);
      }
      ctx.stroke();
      continue;
    }

    const slab = doorSlab(door);
    const hp = state.hp ?? 1;
    ctx.fillStyle = state.locked ? '#6d4a2c' : '#8a6039';
    ctx.fillRect(slab.x, slab.y, slab.w, slab.h);
    ctx.strokeStyle = '#4a3120';
    ctx.lineWidth = 1;
    ctx.strokeRect(slab.x + 0.5, slab.y + 0.5, slab.w - 1, slab.h - 1);

    // Panelling, so a door doesn't read as a plain plank of wall.
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.22)';
    ctx.beginPath();
    if (door.horiz) {
      ctx.moveTo(door.x, slab.y + 1);
      ctx.lineTo(door.x, slab.y + slab.h - 1);
    } else {
      ctx.moveTo(slab.x + 1, door.y);
      ctx.lineTo(slab.x + slab.w - 1, door.y);
    }
    ctx.stroke();

    if (state.locked) {
      // Brass bolt across the middle.
      ctx.strokeStyle = '#e0b45c';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      if (door.horiz) {
        ctx.moveTo(door.x - 6, door.y);
        ctx.lineTo(door.x + 6, door.y);
      } else {
        ctx.moveTo(door.x, door.y - 6);
        ctx.lineTo(door.x, door.y + 6);
      }
      ctx.stroke();
    }

    if (hp < 1) {
      // Cracks spreading as it takes a beating.
      ctx.strokeStyle = `rgba(20, 12, 6, ${0.25 + (1 - hp) * 0.6})`;
      ctx.lineWidth = 1.5;
      const cracks = Math.min(5, 1 + Math.floor((1 - hp) * 6));
      for (let i = 0; i < cracks; i++) {
        const along = (-0.5 + (i + 0.5) / cracks) * span * 0.86;
        ctx.beginPath();
        if (door.horiz) {
          ctx.moveTo(door.x + along, slab.y);
          ctx.lineTo(door.x + along + (i % 2 ? 4 : -4), slab.y + t);
        } else {
          ctx.moveTo(slab.x, door.y + along);
          ctx.lineTo(slab.x + t, door.y + along + (i % 2 ? 4 : -4));
        }
        ctx.stroke();
      }
    }
  }
}

/** Ring filling around the E prompt while a door action runs. */
export function drawDoorPrompt(
  ctx: CanvasRenderingContext2D,
  prompt: DoorPrompt,
  screenX: number,
  screenY: number,
): void {
  const y = screenY - 46;

  if (prompt.progress >= 0) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(screenX, y, 15, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(screenX, y, 15, -Math.PI / 2, -Math.PI / 2 + prompt.progress * Math.PI * 2);
    ctx.stroke();
  }

  ctx.fillStyle = 'rgba(15, 23, 42, 0.82)';
  ctx.beginPath();
  ctx.arc(screenX, y, 11, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#e2e8f0';
  ctx.font = 'bold 13px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('E', screenX, y + 0.5);

  ctx.font = '12px sans-serif';
  const width = ctx.measureText(prompt.text).width + 14;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.82)';
  ctx.fillRect(screenX - width / 2, y + 20, width, 19);
  ctx.fillStyle = '#e2e8f0';
  ctx.fillText(prompt.text, screenX, y + 30);
}

/**
 * Joined arms between couples who are holding hands. Drawn under the bodies so
 * the arms read as coming out of the shoulders, and only once per pair.
 */
export function drawHandLinks(
  ctx: CanvasRenderingContext2D,
  byId: ReadonlyMap<string, { state: EntityState; alpha: number }>,
  view: Viewport,
): void {
  // Takes the tracking map as it stands. Copying it into an array and then
  // rebuilding an index from that array — once per frame, for every entity on
  // the map — was generating a great deal of short-lived garbage for nothing.
  const entries = byId.values();

  const radius = ENTITY_RADIUS.human;
  ctx.lineCap = 'round';

  for (const entry of entries) {
    const a = entry.state;
    if (!a.hand || a.hand < a.id) continue; // the other half draws it
    const other = byId.get(a.hand);
    if (!other) continue; // partner isn't in view
    const b = other.state;
    if (!visible(view, (a.x + b.x) / 2, (a.y + b.y) / 2, 60)) continue;

    ctx.globalAlpha = Math.min(entry.alpha, other.alpha);
    ctx.strokeStyle = shade(ENTITY_COLOR.human, -25);
    ctx.lineWidth = radius * 0.36;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();

    // The clasp itself, a shade lighter so it reads as two hands, not one arm.
    ctx.beginPath();
    ctx.arc((a.x + b.x) / 2, (a.y + b.y) / 2, radius * 0.26, 0, Math.PI * 2);
    ctx.fillStyle = shade(ENTITY_COLOR.human, 15);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/**
 * Below this scale a body is a couple of pixels across and the limbs, head and
 * facing are all sub-pixel — so they cost a dozen rasterised paths each to
 * draw something indistinguishable from a dot.
 */
export const ENTITY_DETAIL_SCALE = 0.5;

/**
 * A white ring round SWAT once everybody is a dot.
 *
 * `SWAT_COLOR` is `#1c1f26` against a road barely lighter than it, which is the
 * whole point of them up close and useless at one dot per body: the four people
 * a radio call was spent on are the only thing on screen that cannot be picked
 * out. Every other kind of body is already its own colour — blue, green, red,
 * grey — so this is the one that wants a *mark* rather than a shade.
 *
 * **Both figures are screen pixels, and that is what makes them worth having.**
 * `lineWidth` and the radius are in world units under the camera transform, so a
 * ring written down as 2 lands at 0.58px of screen at the fully zoomed-out 0.29
 * and is a grey smudge on a black dot — the exact fault it exists to fix. They
 * are divided by the scale instead, so the mark is the same size at every zoom
 * this is drawn at, which is what `drawEntity` gained a `scale` for.
 */
const SIMPLE_RING_PX = 2;
/**
 * And a hair of daylight between the dot and the ring, or a white ring against
 * near-black gear reads as one fatter pale dot rather than as a body with a mark
 * on it.
 */
const SIMPLE_RING_GAP_PX = 1;

/** Which shoulder the butt goes into. +1 is the officer's right. */
const RIFLE_SIDE = 1;

/** Is this officer carrying something that gets shouldered rather than aimed? */
function shoulderedRifle(e: EntityState): boolean {
  return e.held !== undefined && ITEMS[e.held]?.grip === 'rifle';
}

/**
 * Where a shouldered rifle and the hands on it sit, in world coordinates.
 *
 * Worked out once and shared by the arms and the weapon, which are drawn in
 * two separate passes either side of the torso — if they each derived their
 * own the hands would drift off the gun the moment a number changed.
 *
 * The butt sits well off the centre line at the shoulder and the muzzle sits
 * much closer to it, so the weapon angles in across the body as it goes
 * forward. That is what a shouldered rifle does, and it is also what keeps the
 * barrel pointing where the rounds actually go.
 */
function riflePose(
  x: number,
  y: number,
  dirX: number,
  dirY: number,
  perpX: number,
  perpY: number,
  radius: number,
): {
  buttX: number;
  buttY: number;
  gripX: number;
  gripY: number;
  foreX: number;
  foreY: number;
  muzzleX: number;
  muzzleY: number;
} {
  // (along the facing, across it) in radii, then rotated out to world space.
  const at = (along: number, across: number): [number, number] => [
    x + dirX * radius * along + perpX * radius * across * RIFLE_SIDE,
    y + dirY * radius * along + perpY * radius * across * RIFLE_SIDE,
  ];
  const [buttX, buttY] = at(-0.5, 0.72);
  const [gripX, gripY] = at(0.35, 0.6);
  const [foreX, foreY] = at(1.5, 0.36);
  const [muzzleX, muzzleY] = at(2.35, 0.22);
  return { buttX, buttY, gripX, gripY, foreX, foreY, muzzleX, muzzleY };
}

export function drawEntity(
  ctx: CanvasRenderingContext2D,
  e: EntityState,
  isSelf: boolean,
  now = 0,
  simple = false,
  /**
   * World-to-screen, so the `simple` path can put a mark on a body in screen
   * pixels rather than world ones. Only the dot branch reads it — everything
   * below is drawn in world units on purpose and must stay that way.
   */
  scale = 1,
): void {
  // A dog is a zombie everywhere in the simulation and nothing like one on
  // screen: four legs, a neck, and a body drawn along its length rather than a
  // disc with arms. It gets its own function rather than a run of branches
  // through this one.
  if (e.dog) {
    drawDog(ctx, e, isSelf, now, simple);
    return;
  }

  const radius = ENTITY_RADIUS[e.type];

  // A bot officer holds a player's slot, so it is picked out from the ambient
  // grey ones rather than lumped in with them. SWAT come first: they are the
  // one kind that is also `npc`, and black gear is the point of them.
  const base = e.swat
    ? SWAT_COLOR
    : e.soldier
      ? SOLDIER_COLOR
      : e.bot
        ? BOT_OFFICER_COLOR
        : e.npc && e.type === 'officer'
          ? NPC_OFFICER_COLOR
          : ENTITY_COLOR[e.type];

  // Turning. The last few seconds of the incubation bleed the body toward
  // zombie red rather than snapping to it, which is the only warning anybody
  // stood next to them gets — see TURNING_TELL_MS. Everything downstream reads
  // `color`, so the head, the limbs and the far-out dot all go with it.
  // A dog is coming out of this one. It goes the rest of the way to raw meat as
  // it does — the same "the body tells you before the thing happens" trick the
  // turning ramp is, an order of magnitude further along, because there is no
  // outcome here to be uncertain about.
  const turned = e.turning ? mix(base, ENTITY_COLOR.zombie, e.turning) : base;
  const color = e.birthing ? mix(turned, BIRTH_COLOR, e.birthing) : turned;
  // SWAT are the one case where shading the body down for the head produces
  // black on black: their gear is already almost the darkest thing on screen.
  // The helmet goes *lighter* instead, which is also what a helmet does.
  const headColor =
    e.bot && !e.turning
      ? BOT_OFFICER_HEAD_COLOR
      : e.swat && !e.turning
        ? SWAT_HELMET_COLOR
        : shade(color, -45);

  // Zoomed far out: one dot instead of forty-odd path operations. With four
  // hundred entities alive at the end of a round, the difference is the whole
  // frame — the commands issue in a millisecond either way, but painting them
  // all is what stalls.
  if (simple) {
    ctx.beginPath();
    ctx.arc(e.x, e.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    // Black gear on a black road, at four pixels across. Ringed rather than
    // recoloured: the colour is what says SWAT the rest of the time, and a dot
    // painted some other shade at this zoom alone would make the one squad you
    // called in the one body that changes colour as you scroll the wheel.
    //
    // The stroke sits wholly *outside* the dot — centred a half-width past the
    // gap — so the body keeps its own size and its own colour, and the mark is
    // read as something around it. Not gated on `e.npc`: SWAT are always the
    // ones a call sent, and there is nothing else wearing that colour.
    //
    // It stays on through a turn, unlike the helmet — one of your own going
    // over is the last body on the map you want to lose track of — but the
    // colour doesn't. `world.swat` is never cleared off a converted id, so
    // the black gear and this ring outlive the man wearing it; once `e.type`
    // actually reads `zombie` the ring turns the same red as the rest of the
    // horde, because a dot that still reads "one of ours" once it is hunting
    // you is the wrong message. `ENTITY_COLOR.zombie` rather than a colour of
    // its own, so it is exactly the red everything else on that side is.
    if (e.swat) {
      const w = SIMPLE_RING_PX / scale;
      ctx.beginPath();
      ctx.arc(e.x, e.y, radius + SIMPLE_RING_GAP_PX / scale + w / 2, 0, Math.PI * 2);
      ctx.lineWidth = w;
      ctx.strokeStyle = e.type === 'zombie' ? ENTITY_COLOR.zombie : '#ffffff';
      ctx.stroke();
    }
    if (isSelf) {
      ctx.beginPath();
      ctx.arc(e.x, e.y, radius, 0, Math.PI * 2);
      ctx.lineWidth = SIMPLE_RING_PX / scale;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
    }
    return;
  }

  // Grappling pairs thrash back and forth so the struggle reads at a glance.
  let x = e.x;
  let y = e.y;
  let facing = e.facing;
  if (e.grappling) {
    const phase = now * 0.028 + hashId(e.id);
    const shake = Math.sin(phase) * 3.2;
    const lurch = Math.sin(phase * 0.5) * 2.2;
    x += -Math.sin(facing) * shake + Math.cos(facing) * lurch;
    y += Math.cos(facing) * shake + Math.sin(facing) * lurch;
    facing += Math.sin(phase * 1.7) * 0.32;
  }
  /**
   * A body with a dog coming out of it.
   *
   * **Vibration, not thrashing**, and the difference is entirely the frequency:
   * a grapple shakes at 0.028 because two people wrestling is something you can
   * follow, where this is far too fast to track and reads as a thing failing
   * rather than a thing struggling. The two axes run at different rates and
   * neither is a multiple of the other, so it never settles into a line —
   * something buzzing on the spot rather than rocking.
   *
   * It ramps on the *square*, so the first half is a body that looks slightly
   * wrong and the last quarter is a body coming apart. Linear reads as fully
   * broken from the first frame and then has nowhere left to go.
   */
  const birthing = e.birthing ?? 0;
  if (birthing > 0) {
    const amp = BIRTH_SHAKE_PX * birthing * birthing;
    x += Math.sin(now * 0.091 + hashId(e.id)) * amp;
    y += Math.cos(now * 0.117 + hashId(e.id)) * amp;
    // And it cannot hold a bearing either. Small, because the arms are what
    // carry the second half and a body spinning under them would fight it.
    facing += Math.sin(now * 0.073) * 0.22 * birthing;
  }

  const dirX = Math.cos(facing);
  const dirY = Math.sin(facing);
  const perpX = -dirY;
  const perpY = dirX;

  const shoulder = radius * 0.62;
  const limbColor = shade(color, -25);

  if (e.type === 'zombie') {
    ctx.strokeStyle = limbColor;
    ctx.lineWidth = radius * 0.5;
    ctx.lineCap = 'round';
    // Arms claw further out mid-grapple. Battering a door is the same motion
    // but faster and rougher — the two arms alternate rather than pumping
    // together, so it reads as hammering rather than grabbing.
    const phase = now * 0.03 + hashId(e.id);
    const reach = e.grappling ? 1.75 + Math.sin(phase) * 0.2 : 1.5;
    /**
     * **The arms go, and that is the half of the birth that says what it is.**
     *
     * Vibration on its own is ambiguous — it could be a fit, a stun, anything.
     * A pair of arms rotating out of the line of the shoulders and folding
     * backwards at an angle no elbow makes is the moment the body stops reading
     * as a person, which is what has to happen before the burst for the burst
     * to be an ending rather than a surprise.
     *
     * The two sides are deliberately *not* mirrored. Equal and opposite reads
     * as a pose being struck; different rates and a different bend on each is
     * something being done *to* somebody. They are drawn as two segments rather
     * than one so there is a joint to put in the wrong place at all — a single
     * stroke can only ever swing, and swinging arms is what the door-battering
     * animation already is.
     */
    const twist = birthing <= DOG_BIRTH_TWIST_FROM
      ? 0
      : (birthing - DOG_BIRTH_TWIST_FROM) / (1 - DOG_BIRTH_TWIST_FROM);
    for (const side of [-1, 1]) {
      const sx = x + perpX * shoulder * side;
      const sy = y + perpY * shoulder * side;
      const swing = e.breaking ? 1.62 + Math.sin(now * 0.045 + (side > 0 ? Math.PI : 0)) * 0.42 : reach;
      if (twist > 0) {
        // Out of the socket: the upper arm rotates away from forward and the
        // forearm carries on round past it, so the limb ends up folded behind
        // the shoulder it grows out of.
        const wrench = twist * BIRTH_ARM_TWIST * (side > 0 ? 1 : -0.78);
        const jitter = Math.sin(now * 0.084 + side * 2.1) * 0.3 * twist;
        const upper = facing + wrench + jitter;
        const lower = upper + wrench * 1.35;
        const uLen = radius * swing * (0.55 + twist * 0.2);
        const ex = sx + Math.cos(upper) * uLen;
        const ey = sy + Math.sin(upper) * uLen;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(ex, ey);
        ctx.lineTo(ex + Math.cos(lower) * uLen * 0.95, ey + Math.sin(lower) * uLen * 0.95);
        ctx.stroke();
        continue;
      }
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + dirX * radius * swing, sy + dirY * radius * swing);
      ctx.stroke();
    }
  } else if (e.type === 'officer' && shoulderedRifle(e)) {
    // A shouldered rifle: butt into the strong-side shoulder, the weapon lying
    // along the aim line but offset to that side, and the other hand reaching
    // across to the forestock. The two arms are doing different jobs and are
    // drawn differently — that asymmetry is what reads as "rifle" from above,
    // where a pair of arms out to a point in front reads as "pistol".
    const g = riflePose(x, y, dirX, dirY, perpX, perpY, radius);
    ctx.strokeStyle = limbColor;
    ctx.lineWidth = radius * 0.62;
    ctx.lineCap = 'round';
    // Strong-side arm: shoulder to the grip, short and tucked in.
    ctx.beginPath();
    ctx.moveTo(x + perpX * shoulder * RIFLE_SIDE, y + perpY * shoulder * RIFLE_SIDE);
    ctx.lineTo(g.gripX, g.gripY);
    ctx.stroke();
    // Support arm: the far shoulder, reaching across and well down the barrel.
    ctx.beginPath();
    ctx.moveTo(x - perpX * shoulder * RIFLE_SIDE, y - perpY * shoulder * RIFLE_SIDE);
    ctx.lineTo(g.foreX, g.foreY);
    ctx.stroke();
  } else if (e.type === 'officer') {
    const gripX = x + dirX * radius * 1.62;
    const gripY = y + dirY * radius * 1.62;
    ctx.strokeStyle = limbColor;
    ctx.lineWidth = radius * 0.72;
    ctx.lineCap = 'round';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(x + perpX * shoulder * 1.25 * side, y + perpY * shoulder * 1.25 * side);
      ctx.lineTo(gripX, gripY);
      ctx.stroke();
    }
  } else if (e.type === 'human') {
    // Two short nubs at the shoulders — just enough to read as arms.
    ctx.strokeStyle = limbColor;
    ctx.lineWidth = radius * 0.4;
    ctx.lineCap = 'round';
    for (const side of [-1, 1]) {
      const sx = x + perpX * shoulder * 0.8 * side;
      const sy = y + perpY * shoulder * 0.8 * side;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + perpX * radius * 0.5 * side, sy + perpY * radius * 0.5 * side);
      ctx.stroke();
    }
  }

  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();

  // Head, nudged forward so facing reads at a glance.
  ctx.beginPath();
  ctx.arc(x + dirX * radius * 0.28, y + dirY * radius * 0.28, radius * 0.5, 0, Math.PI * 2);
  ctx.fillStyle = headColor;
  ctx.fill();

  if (e.type === 'officer' && shoulderedRifle(e)) {
    // The weapon itself: a long body from the butt at the shoulder out past
    // the support hand, with a thinner barrel beyond it. Drawn *after* the
    // torso so it lies over the shoulder rather than disappearing under it.
    const g = riflePose(x, y, dirX, dirY, perpX, perpY, radius);
    ctx.lineCap = 'butt';
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = radius * 0.34;
    ctx.beginPath();
    ctx.moveTo(g.buttX, g.buttY);
    ctx.lineTo(g.foreX, g.foreY);
    ctx.stroke();
    // Barrel: thinner, and carrying on past the hand that is steadying it.
    ctx.lineWidth = radius * 0.2;
    ctx.beginPath();
    ctx.moveTo(g.foreX, g.foreY);
    ctx.lineTo(g.muzzleX, g.muzzleY);
    ctx.stroke();
    // The stock, squared off into the shoulder.
    ctx.lineWidth = radius * 0.46;
    ctx.beginPath();
    ctx.moveTo(g.buttX, g.buttY);
    ctx.lineTo(g.buttX + (g.gripX - g.buttX) * 0.42, g.buttY + (g.gripY - g.buttY) * 0.42);
    ctx.stroke();
  } else if (e.type === 'officer') {
    ctx.save();
    ctx.translate(x + dirX * radius * 1.75, y + dirY * radius * 1.75);
    ctx.rotate(facing);
    ctx.fillStyle = '#111827';
    ctx.fillRect(-radius * 0.42, -radius * 0.2, radius * 0.9, radius * 0.4);
    ctx.restore();
  }

  // Bitten but not yet turned — a sickly ring while the infection incubates.
  if (e.infected) {
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#a3e635';
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.arc(x, y, radius + 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  if (e.type === 'zombie' && e.health < ENTITY_MAX_HEALTH.zombie) {
    const w = radius * 2;
    const pct = Math.max(0, e.health / ENTITY_MAX_HEALTH.zombie);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
    ctx.fillRect(x - w / 2, y - radius - 9, w, 4);
    ctx.fillStyle = '#f87171';
    ctx.fillRect(x - w / 2, y - radius - 9, w * pct, 4);
  }

  // Fading into existence: scatter a few flecks so it reads as assembling
  // rather than simply turning the opacity up.
  if (e.materializing) {
    const seed = hashId(e.id);
    ctx.fillStyle = color;
    for (let i = 0; i < 7; i++) {
      const a = ((seed + i * 97) % 360) * (Math.PI / 180) + now * 0.004;
      const d = radius * (1.2 + ((seed + i * 31) % 100) / 120);
      const size = 1.5 + ((seed + i * 17) % 3);
      ctx.globalAlpha = 0.25 + 0.35 * Math.abs(Math.sin(now * 0.006 + i));
      ctx.fillRect(x + Math.cos(a) * d, y + Math.sin(a) * d, size, size);
    }
    ctx.globalAlpha = 1;
  }

  // The one leading a sweep carries the set on his back. Drawn *behind* the
  // body — a small pack squared off across the shoulders with a whip aerial
  // standing off it — so that at a glance you can tell which of four identical
  // black figures the other three are following.
  if (e.squadLead) {
    const backX = x - dirX * (radius * 0.72);
    const backY = y - dirY * (radius * 0.72);
    ctx.fillStyle = '#39424f';
    ctx.strokeStyle = 'rgba(8, 11, 16, 0.9)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(backX, backY, radius * 0.52, radius * 0.72, facing, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // The aerial, angled back off the pack.
    const tipA = facing + Math.PI - 0.5;
    ctx.strokeStyle = 'rgba(203, 213, 225, 0.85)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(backX, backY);
    ctx.lineTo(backX + Math.cos(tipA) * radius * 1.5, backY + Math.sin(tipA) * radius * 1.5);
    ctx.stroke();
  }

  // Kevlar reads as a grey band inside the body rather than a halo around it,
  // so it never competes with the white self-ring or the infected ring.
  if (e.armour) {
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = 'rgba(214, 222, 233, 0.92)';
    ctx.beginPath();
    ctx.arc(x, y, radius - 2, 0, Math.PI * 2);
    ctx.stroke();
  }

  // The riot shield: a thick arc across whichever side it is covering. Drawn
  // as an arc rather than a badge because which way it faces is the entire
  // mechanic — being caught from the other side is what it costs you.
  // Dropped by a mine: a cyan crackle round the body while it lasts.
  if (e.stunned) {
    ctx.strokeStyle = 'rgba(34, 211, 238, 0.9)';
    ctx.lineWidth = 2;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.arc(x, y, radius + 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  if (e.shield) {
    const facing = e.facing + (e.shield > 0 ? 0 : Math.PI);
    // The shove: the arc is thrown out in front and drawn heavier for the
    // moment it lasts, so a bash reads as a shove rather than as nothing
    // happening. Cheap on purpose — it is one number on the radius.
    const thrust = e.bashing ? 9 : 0;
    ctx.lineWidth = e.bashing ? 6 : 4;
    ctx.strokeStyle = e.bashing
      ? 'rgba(186, 230, 253, 1)'
      : e.shield > 0
        ? 'rgba(56, 189, 248, 0.95)'
        : 'rgba(56, 189, 248, 0.6)';
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(
      x + Math.cos(facing) * thrust,
      y + Math.sin(facing) * thrust,
      radius + 4 + thrust * 0.4,
      facing - SHIELD_FRONT_ARC,
      facing + SHIELD_FRONT_ARC,
    );
    ctx.stroke();

    // A puff of motion lines ahead of it, so the shove has a direction.
    if (e.bashing) {
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(186, 230, 253, 0.55)';
      for (const side of [-0.5, 0, 0.5]) {
        const a = facing + side;
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(a) * (radius + 14), y + Math.sin(a) * (radius + 14));
        ctx.lineTo(x + Math.cos(a) * (radius + 24), y + Math.sin(a) * (radius + 24));
        ctx.stroke();
      }
    }
    ctx.lineCap = 'butt';
  }

  if (isSelf) {
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x, y, radius + 2, 0, Math.PI * 2);
    ctx.stroke();
  }
}

// ------------------------------------------------------------------- the dog
/**
 * A dog drawn from a snapshot alone would be four legs snapping between poses
 * thirty times a second, so the drawing keeps a little state of its own.
 *
 * None of it is authority over anything: the two angles are *eased toward* the
 * server's, which is ordinary interpolation and cannot drift, and the gait is
 * derived from how far the body has actually moved. Driving the legs off a
 * clock instead would have a dog paddling its feet while stood still and
 * sliding along at a walk while sprinting.
 */
interface DogPose {
  facing: number;
  head: number;
  /** Where the legs are in their cycle, in radians. */
  gait: number;
  /**
   * How far the head has actually come apart, easing toward wherever the state
   * says it should be.
   *
   * The state is a flag that flips — lunging or not — and a head that snapped
   * open and shut on it had no *opening* to look at, which is the whole event.
   * Easing it here rather than on the server is right: nothing about the bite
   * depends on how wide the jaws are drawn, and the wire carries a boolean.
   */
  split: number;
  /** Smoothed pace, so the cycle advances evenly between snapshots. */
  speed: number;
  /** The last direction it was actually travelling — the gait swings along it. */
  travel: number;
  x: number;
  y: number;
  at: number;
}
const dogPoses = new Map<string, DogPose>();

/** How quickly the drawn angles catch the server's. Anti-stepping, not lag. */
const DOG_EASE_MS = 45;
/** One full leg cycle per this many pixels of ground covered. */
const DOG_STRIDE = 40;
/**
 * How far out the paws are when the body pivots, as a share of the art radius.
 * It is the arm of the arc they sweep — the only thing turning the gait needs
 * to know to be measured in the same pixels walking is.
 */
const DOG_TURN_ARM = 0.9;
/** A fixed bend in the tail, so a dead weight is not a straight stick. */
const DOG_TAIL_KINK = 0.22;
/** How far a paw swings fore and aft of its hip, in radii. */
const DOG_STEP_REACH = 0.42;
/**
 * How far a paw stands out from its hip.
 *
 * A dog's legs sit *under* it and only just show past the ribs; much more and
 * from directly above it stops being a dog and becomes a spider. This has been
 * wrong in both directions — 0.42 was the spider, 0.3 tucked them so far under
 * that only the paws showed at the corners. The body is 0.6 radii wide, so a
 * hip at 0.36 plus this leaves the paw a little proud of the flank, which is
 * what you actually see looking down at a dog.
 */
const DOG_LEG_REACH = 0.36;
/**
 * The two bones, in radii. Their *sum* is the leg's maximum span and the paw is
 * kept well inside it — at a neutral stance the leg is folded to about half its
 * reach, which is what a dog's leg looks like from directly above and what
 * leaves the joint room to straighten as the paw swings out.
 *
 * The upper is the longer of the two, as a limb is.
 */
const DOG_UPPER_LEN = 0.36;
const DOG_LOWER_LEN = 0.32;

/** Front-left and rear-right together, then the other diagonal: a trot. */
const DOG_LEG_PHASE = [0, Math.PI, Math.PI, 0];
/**
 * Where a dead dog's legs end up, fore and aft in radii. Deliberately at odds
 * with each other — a corpse whose legs are still in a matched pair reads as an
 * animal standing still rather than as one that fell over.
 */
const DOG_DEAD_SPLAY = [0.5, -0.2, 0.34, -0.46];
/** How far a dead head lolls off the spine. */
const DOG_DEAD_LOLL = 0.5;
/** Along the spine, and across it, in radii. Front pair first. */
const DOG_HIPS: Array<[number, number]> = [
  [0.62, -0.36],
  [0.62, 0.36],
  [-0.7, -0.4],
  [-0.7, 0.4],
];

function dogPoseFor(e: EntityState, now: number): DogPose {
  let pose = dogPoses.get(e.id);
  if (!pose) {
    pose = {
      facing: e.facing,
      head: e.head ?? e.facing,
      gait: 0,
      split: 0,
      speed: 0,
      travel: e.facing,
      x: e.x,
      y: e.y,
      at: now,
    };
    dogPoses.set(e.id, pose);
    return pose;
  }

  const dtMs = Math.min(120, Math.max(0, now - pose.at));
  pose.at = now;

  // Exponential ease, framerate-independent.
  const k = 1 - Math.exp(-dtMs / DOG_EASE_MS);
  const wasFacing = pose.facing;
  pose.facing += angDelta(pose.facing, e.facing) * k;
  pose.head += angDelta(pose.head, e.head ?? e.facing) * k;

  // Snapshots land at 30Hz and frames at 60+, so half the frames see no
  // movement at all. Smoothing the *pace* rather than stepping the gait by the
  // raw delta is what keeps the legs from stuttering between packets.
  const walked = Math.hypot(e.x - pose.x, e.y - pose.y);
  if (walked > 0.05) pose.travel = Math.atan2(e.y - pose.y, e.x - pose.x);
  pose.x = e.x;
  pose.y = e.y;

  // **Turning is ground covered too.** A body pivoting on the spot moves no
  // distance at all, so a gait driven by displacement alone leaves the dog
  // rotating with its feet welded to the road. What the paws actually travel is
  // the arc their own radius sweeps, so that arc is simply added to the
  // distance walked and the same gait handles both.
  const turned = Math.abs(angDelta(wasFacing, pose.facing)) * DOG_ART_RADIUS * DOG_TURN_ARM;
  const moved = walked + turned;
  const instant = dtMs > 0 ? (moved / dtMs) * 1000 : pose.speed;

  // **The jaws, eased — and they slam shut far faster than they open.** The
  // state is a flag that flips, so a head driven straight off it was simply
  // open on some frames and shut on others. The mouth is *held* open now, so
  // the opening is a thing you sit inside and the closing is the only beat left
  // with any snap in it.
  // A roaring dog's mouth is open, and it is the same mouth — so the roar
  // rides the split the jaws already use rather than getting a drawing of its
  // own. It works the jaw a little as it goes, because a head held rigidly
  // agape for two full seconds reads as a frozen frame.
  const wantSplit = e.roaring
    ? DOG_SPLIT_ARC * (0.86 + Math.sin(now * 0.017) * 0.14)
    : e.lunging
      ? DOG_SPLIT_ARC
      : e.grappling
        ? DOG_SPLIT_ARC * (0.62 + Math.sin(now * 0.028) * 0.16)
        : 0.04;
  const jawEase = wantSplit > pose.split ? DOG_JAW_OPEN_MS : DOG_JAW_SHUT_MS;
  pose.split += (wantSplit - pose.split) * (1 - Math.exp(-dtMs / jawEase));
  pose.speed += (instant - pose.speed) * 0.2;
  if (pose.speed < 4) pose.speed = 0;
  pose.gait += ((pose.speed * (dtMs / 1000)) / DOG_STRIDE) * TAU;
  if (pose.gait > TAU * 1024) pose.gait -= TAU * 1024;

  return pose;
}

/** Drop the drawing state for anything that has gone. Called on a new city. */
export function clearDogPoses(): void {
  dogPoses.clear();
}
/**
 * Posing the dog.
 *
 * Every solid piece of it is a part baked once by `dogsprite.ts`; nothing here
 * paints, it only decides where the pieces go. That split is what lets the
 * animal be a finished bit of art *and* be articulated — the alternative is
 * one baked picture of a dog, which cannot turn its head.
 *
 * Three things carry the read of it, and each is worth its cost:
 *
 * - **The head is posed off its own angle, not the body's.** That is the one
 *   thing that makes it look like an animal watching you rather than a sprite
 *   pointed at you, and it is the only reason `head` is on the wire.
 * - **The legs swing along the direction of travel**, not along the spine — a
 *   dog backing away from an officer while still facing him has to walk
 *   backwards, and a gait keyed to the facing would have it moonwalking.
 * - **The head comes apart rather than opening.** A dog opening its mouth is a
 *   dog. Two halves peeling off a hinge at the neck, each taking an eye with
 *   it, with the throat open between them, is not.
 */

/** How far each half of the head swings off the centre line, fully open. */
const DOG_SPLIT_ARC = 1.05;
/**
 * How quickly the jaws chase that.
 *
 * **Shutting is the violent one.** The mouth is *held* open now — two full
 * seconds of it — so the opening is a thing you sit inside rather than a beat,
 * and the only moment left with any snap in it is the closing. Easing that shut
 * over a quarter of a second threw the whole event away: the jaws sagged
 * together like a drawbridge. It slams now, and the saliva strung across the
 * gap goes with it in the same frame.
 */
const DOG_JAW_OPEN_MS = 90;
const DOG_JAW_SHUT_MS = 35;
/**
 * How far the two halves also pull *apart* as they swing, in radii.
 *
 * Rotation alone is a jaw on a hinge however wide it goes. A little separation
 * at the hinge itself is what turns it into a head coming apart — the seam
 * opens along its whole length rather than only at the muzzle.
 */
const DOG_SPLIT_SPREAD = 0.12;
/** Strings of saliva across the gap. */
const DOG_DROOL_STRANDS = 7;

function drawDog(
  ctx: CanvasRenderingContext2D,
  e: EntityState,
  isSelf: boolean,
  now: number,
  simple: boolean,
): void {
  /**
   * **Coming apart makes it bigger, and that is one multiplier on `r`.**
   *
   * Every measurement in this function is already in radii — the hips, the
   * legs, the muzzle, the shadow, the health bar — so growing the animal is
   * this line and nothing else. `DOG_MORPH_ART_MUL` is deliberately far larger
   * than what the *body* grows to on the server: how big it looks is an art
   * decision and how big it collides is capped by the narrowest doorway a city
   * generates. See the note on `DOG_MORPH_RADIUS`.
   */
  const morph = e.morph ?? 0;
  const r = DOG_ART_RADIUS * (1 + (DOG_MORPH_ART_MUL - 1) * morph);
  const pose = dogPoseFor(e, now);
  const art = dogSprites();

  // Zoomed far out, before anything else: a body at this size is the same
  // couple of pixels whether it is alive or dead, so there is nothing for the
  // greying below to show. It has to come *first* — taken after it, the dead
  // branch's `save` was left on the stack by this early return and the
  // grayscale filter stayed set on the context for the rest of the frame,
  // which put a three-stage filter chain on every draw after the first corpse.
  if (simple) {
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(pose.facing);
    ctx.fillStyle = DOG_BODY_COLOR;
    ctx.fillRect(-r * 1.4, -r * 0.5, r * 2.8, r);
    ctx.restore();
    return;
  }

  /**
   * **Dead: grey, sprawled, and going nowhere.**
   *
   * One filter on the context does the greying, so a corpse is drawn by exactly
   * the same code as a live dog and cannot drift out of step with it. The
   * sprawl is the other half — a body in a *standing* pose reads as a dog that
   * has simply stopped, so the legs are thrown out, the head lolls off the
   * spine, and the whole thing is squashed a little across its length, which is
   * what something lying down looks like from above.
   *
   * Balanced by the `restore` at the end of this function, so every path out of
   * here below this point must go through it.
   */
  if (e.dead) {
    ctx.save();
    ctx.filter = 'grayscale(1) brightness(0.5) contrast(0.85)';
    ctx.globalAlpha *= 0.95;
    pose.speed = 0;
    pose.gait = hashId(e.id) % 6; // legs frozen somewhere other than neutral
    pose.split = 0.34; // the mouth left half open
  }

  // Latched or being wrestled: the whole animal worries at whatever it has.
  let x = e.x;
  let y = e.y;
  let facing = pose.facing;
  let head = pose.head;
  if (e.grappling) {
    const phase = now * 0.03 + hashId(e.id);
    const thrash = Math.sin(phase * 1.9) * 2.6;
    x += -Math.sin(facing) * thrash;
    y += Math.cos(facing) * thrash;
    head += Math.sin(phase * 2.7) * 0.13;
  }
  /**
   * **Tearing itself open: vibration, not thrashing** — the same distinction
   * the birth already makes, and for the same reason. Two people wrestling is
   * something the eye can follow; this is too fast to track and reads as a body
   * failing rather than struggling. The two axes run at rates that are not
   * multiples of each other so it never settles into a line, and it ramps on
   * the *square* of the progress, because linear reads as fully broken from the
   * first frame and then has nowhere left to go.
   */
  if (e.morphing) {
    const p = morph * morph;
    x += Math.sin(now * 0.061 + hashId(e.id)) * 3.4 * p;
    y += Math.cos(now * 0.047 + hashId(e.id) * 1.7) * 3.4 * p;
  }
  // The head goes over as it falls, and which way is hashed so a row of bodies
  // are not all lolling identically.
  if (e.dead) head += hashId(e.id) % 2 === 0 ? DOG_DEAD_LOLL : -DOG_DEAD_LOLL;

  const dirX = Math.cos(facing);
  const dirY = Math.sin(facing);
  const perpX = -dirY;
  const perpY = dirX;
  /** (along the spine, across it) in radii → world. */
  const at = (along: number, across: number): [number, number] => [
    x + dirX * r * along + perpX * r * across,
    y + dirY * r * along + perpY * r * across,
  ];

  // How far the head has actually come apart — eased in `dogPoseFor`, because
  // the wire only carries a flag and a head that snapped open and shut on it
  // gave the one moment worth watching no screen time at all.
  const split = pose.split;

  // ---- the shadow it casts. Under everything: a body with nothing beneath it
  // floats, and one soft ellipse is the cheapest possible fix for that.
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.beginPath();
  ctx.ellipse(x + 2, y + 3, r * 1.55, r * 0.7, facing, 0, TAU);
  ctx.fill();

  // ---- legs, under the body so the hips disappear into it. Two bones each,
  // with the knee pushed out from the spine so it reads as bent rather than as
  // a stick poking out of the side.
  const travelOff = angDelta(facing, pose.travel);
  const swingX = Math.cos(facing + travelOff);
  const swingY = Math.sin(facing + travelOff);
  for (let i = 0; i < 4; i++) {
    const [along, across] = DOG_HIPS[i];
    const [hx, hy] = at(along, across);
    const side = Math.sign(across);
    const front = along > 0;
    const phase = pose.gait + DOG_LEG_PHASE[i];
    const running = pose.speed > 0 ? 1 : 0;
    // A corpse's legs are thrown out at odds with each other and stay there. A
    // body in a standing pose reads as a dog that has simply stopped.
    const swing = e.dead
      ? DOG_DEAD_SPLAY[i] * r
      : Math.cos(phase) * DOG_STEP_REACH * r * running;
    // **The foot is down for most of the cycle and picked up briefly.** A plain
    // `max(0, sin)` has it in the air half its life, which is a paddle rather
    // than a walk; raising it to a power narrows the lift into a short event and
    // leaves the rest of the stride planted.
    const lift = Math.pow(Math.max(0, Math.sin(phase)), 2.5) * running;
    const reach = r * DOG_LEG_REACH * (1 - 0.3 * lift);

    const pawX = hx + perpX * side * reach + swingX * swing;
    const pawY = hy + perpY * side * reach + swingY * swing;

    /**
     * **Two-bone IK, because the knee was the whole problem.**
     *
     * It used to be the midpoint of hip-to-paw nudged sideways, which means the
     * two bones were always in the same relative pose and the entire leg simply
     * *rotated* about the hip as the paw swung — a stick on a pivot, which is
     * exactly what it looked like. Solving for the joint against two fixed bone
     * lengths makes the leg **fold and extend** instead: the paw swinging out
     * to the front of its stride is further from the hip than the paw underneath
     * it, so the leg straightens and gathers over the cycle on its own.
     *
     * The bones being fixed also means the sprite stretch is now a constant,
     * where before every frame drew a slightly different-length limb.
     */
    const legX = pawX - hx;
    const legY = pawY - hy;
    const rawLen = Math.hypot(legX, legY) || 0.001;
    const ux = legX / rawLen;
    const uy = legY / rawLen;
    const upperLen = DOG_UPPER_LEN * r;
    const lowerLen = DOG_LOWER_LEN * r;
    const span = Math.min(rawLen, upperLen + lowerLen - 0.001);
    const kx = (span * span + upperLen * upperLen - lowerLen * lowerLen) / (2 * span);
    const ky = Math.sqrt(Math.max(0, upperLen * upperLen - kx * kx));
    // Which way the joint folds. A dog's elbow points *back* and its stifle
    // points *forward*, so the front and rear legs bend opposite ways — get
    // this the same on all four and it walks like a table.
    const jointX = -uy;
    const jointY = ux;
    const fold = front ? -1 : 1;
    const bend = (jointX * dirX + jointY * dirY) * fold >= 0 ? 1 : -1;
    const kneeX = hx + ux * kx + jointX * ky * bend;
    const kneeY = hy + uy * kx + jointY * ky * bend;

    const pawAngle = Math.atan2(pawY - kneeY, pawX - kneeX);
    // **Paw first, then the leg over it.** Drawn last it sat on top of the
    // shin like a blob stuck on the end; from above the leg comes down *onto*
    // the foot, so the lower bone should overlap the ankle and leave only the
    // toes showing past it. Upper over lower at the knee, for the same reason.
    drawSprite(ctx, art.paw, pawX, pawY, pawAngle, side < 0);
    drawSprite(ctx, art.limb, kneeX, kneeY, pawAngle, side < 0, lowerLen / (r * 0.56));
    drawSprite(
      ctx,
      art.limb,
      hx,
      hy,
      Math.atan2(kneeY - hy, kneeX - hx),
      side < 0,
      upperLen / (r * 0.56),
    );
  }

  // ---- tail: two tapering segments off the rump.
  //
  // **It does not wag.** A wagging tail is a happy dog, and it was the last
  // thing on the animal still reading as a pet. It trails: a fixed kink so it
  // is not a stick, and it swings out behind a turn because the second segment
  // lags the first, which is a thing a dead weight does rather than a mood.
  //
  // Strokes rather than the baked limb: a limb sprite is a limb, and reusing
  // one here put a fifth leg on the back of the animal. Ink first then fill,
  // which is the same two-pass contour every baked part carries.
  {
    const [rootX, rootY] = at(-1.16, 0);
    const a1 = facing + Math.PI + DOG_TAIL_KINK;
    const midX = rootX + Math.cos(a1) * r * 0.5;
    const midY = rootY + Math.sin(a1) * r * 0.5;
    const a2 = a1 + DOG_TAIL_KINK * 1.6;
    const tipX = midX + Math.cos(a2) * r * 0.46;
    const tipY = midY + Math.sin(a2) * r * 0.46;
    ctx.lineCap = 'round';
    for (const [ink, w1, w2] of [
      [true, 0.24, 0.15],
      [false, 0.17, 0.08],
    ] as Array<[boolean, number, number]>) {
      // **Tip first, then the root over it.** Drawn the other way round the
      // thin bare end sat on top of the thick root at the joint, which reads as
      // a stick laid across the tail rather than as the same tail tapering. A
      // limb always goes over the segment beyond it, the same as the paw.
      //
      // The last third is stripped: bare bone rather than hide. A tail is the
      // one part of the silhouette that sticks out into empty ground with
      // nothing behind it, so a change of colour out there reads instantly.
      ctx.strokeStyle = ink ? '#0a0806' : shade(DOG_BONE_COLOR, -58);
      ctx.lineWidth = r * w2;
      ctx.beginPath();
      ctx.moveTo(midX, midY);
      ctx.lineTo(tipX, tipY);
      ctx.stroke();
      ctx.strokeStyle = ink ? '#0a0806' : shade(DOG_BODY_COLOR, -14);
      ctx.lineWidth = r * w1;
      ctx.beginPath();
      ctx.moveTo(rootX, rootY);
      ctx.lineTo(midX, midY);
      ctx.stroke();
    }
  }

  // ---- neck, before the torso so the shoulders sit over it.
  //
  // The hinge sits well forward of the chest. Tucked back at 0.34 the drawn
  // nose landed at 1.24 radii — *inside* the 1.3-radius front of the torso —
  // so the head was buried in the shoulders and the animal read as a lozenge
  // with a face painted on the end. Out here the whole head clears the body and
  // the neck has something to be.
  const [hingeX, hingeY] = at(0.86, 0);
  const [chestX, chestY] = at(0.5, 0);
  ctx.strokeStyle = '#0a0806';
  ctx.lineCap = 'round';
  ctx.lineWidth = r * 0.68;
  ctx.beginPath();
  ctx.moveTo(chestX, chestY);
  ctx.lineTo(hingeX, hingeY);
  ctx.stroke();
  ctx.strokeStyle = shade(DOG_BODY_COLOR, -8);
  ctx.lineWidth = r * 0.54;
  ctx.beginPath();
  ctx.moveTo(chestX, chestY);
  ctx.lineTo(hingeX, hingeY);
  ctx.stroke();

  drawSprite(ctx, art.body, x, y, facing);

  // ---- the head, as two halves peeling off the hinge at the neck.
  dogHeadHalves(ctx, hingeX, hingeY, head, split, r, hashId(e.id), now, e.dead === true);

  // ---- the roar coming out of it. Over the head rather than under, because
  // it is in front of the muzzle and a ring drawn under the skull is a ring
  // with a bite taken out of it.
  if (e.roaring) drawRoar(ctx, hingeX, hingeY, head, r, hashId(e.id), now);

  // Over the body, because they are coming *out* of it. After the head, so
  // one can cross the muzzle — a tentacle that respected the silhouette would
  // read as decoration painted on rather than as something tearing free.
  if (morph > 0) drawTentacles(ctx, e.id, x, y, facing, r, morph, hashId(e.id), now);

  // **A corpse has no health to report.** The bar is drawn whenever health is
  // under the maximum, and a body is on zero — so every corpse in the city wore
  // an empty bar over it, which reads as a thing still in the fight.
  if (!e.dead && e.health < DOG_MAX_HEALTH) {
    const w = r * 2.4;
    const pct = Math.max(0, e.health / DOG_MAX_HEALTH);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
    ctx.fillRect(x - w / 2, y - r - 13, w, 4);
    ctx.fillStyle = '#f87171';
    ctx.fillRect(x - w / 2, y - r - 13, w * pct, 4);
  }

  if (e.dead) ctx.restore();

  // **No self-ring on a dog.** Every other body gets a white outline when it is
  // yours, and on a dog it was the loudest thing on screen — a bright hard
  // ellipse round the one entity whose whole design is being dark and hard to
  // read. It is also the least necessary one: there are at most two dogs in a
  // round, the camera is on yours, and `drawSelfMarker` already puts a chevron
  // where it went if the pan takes it off screen.
  void isSelf;
}

/**
 * The strikes currently in the air, so the dog's own back tentacles can be the
 * ones that go out.
 *
 * **Module state rather than a parameter**, and that is the cheap seam rather
 * than a shortcut. `drawEntity` is called for every body in the city and for
 * every corpse, so a seventh argument would be threaded through five call sites
 * that have no idea what a tentacle is to reach one branch that does. The file
 * already holds the blood decals and the baked sprites this way.
 *
 * Written once a frame by `main.ts`, before the entity pass, off the same
 * snapshot the separate warning and impact passes read.
 */
let activeLashes: LashState[] = [];
export function setLashes(list: LashState[]): void {
  activeLashes = list;
}

/**
 * The tentacles that come out of a transforming dog, go on writhing for as long
 * as it is one, and are **the same limbs that go out when it strikes**.
 *
 * That last part is the whole reason this function knows about strikes at all.
 * The lash used to be a line drawn from the middle of the animal by a pass of
 * its own — which is a tracer with a curl in it, and reads as something the dog
 * fired rather than as something the dog *did*. Three of the arms already on
 * its back coiling and then throwing themselves at a spot is the ability the
 * silhouette was already promising.
 *
 * **Live rather than baked**, unlike everything else on the animal. The dog's
 * parts are painted once into offscreen canvases because they are rigid shapes
 * that only need posing; a tentacle is a curve whose whole point is that it
 * moves, so there is nothing to bake. Eight of them at four segments each is
 * about thirty line segments on one entity — the cost of a handful of bodies,
 * on the one body in the round that is worth it.
 *
 * **No per-frame state.** Every tentacle's bearing, length and phase come off
 * the dog's own id and the clock, exactly as the saliva strands and the acid
 * churn do, so two dogs transforming side by side do not writhe in lockstep and
 * nothing has to be remembered between frames. Which three arms strike comes
 * off the *strike's* id the same way, so it is a different three each time and
 * the drawing does not develop a favourite side.
 *
 * They grow with `morph` rather than appearing at the end of it: the wind-up is
 * *them ripping out*, so at 0.2 they are stubs and at 1 they are at full reach.
 */
function drawTentacles(
  ctx: CanvasRenderingContext2D,
  id: string,
  x: number,
  y: number,
  facing: number,
  r: number,
  morph: number,
  seed: number,
  now: number,
): void {
  const count = DOG_MORPH_TENTACLES;
  // At most one strike per animal is ever in the air — `DOG_LASH_COOLDOWN_MS`
  // is longer than a whole strike takes — so the first match is the match.
  const strike = activeLashes.find((l) => l.dogId === id) ?? null;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (let i = 0; i < count; i++) {
    // Anchored round the trunk rather than at one point, and jittered off the
    // even spacing — evenly spaced anything reads as designed, which is the
    // lesson the acid's petals and the dog's own ribs both learned.
    const h = hash2(seed, i);
    const base = facing + (i / count) * TAU + (h % 1) * 0.5;
    const anchorAlong = Math.cos(base - facing) * r * 0.55;
    const anchorAcross = Math.sin(base - facing) * r * 0.42;
    const ax = x + Math.cos(facing) * anchorAlong - Math.sin(facing) * anchorAcross;
    const ay = y + Math.sin(facing) * anchorAlong + Math.cos(facing) * anchorAcross;

    const idle = r * (0.75 + ((h * 7) % 0.75)) * morph;
    // Its own clock, so the mass of them churns rather than pulsing together.
    const t = now * 0.004 + h * 6.3;

    // Is this one of the arms that is going out? Hashed off the strike's id so
    // the set changes from throw to throw, and off the arm's index so the same
    // strike picks the same three on every frame of itself.
    const striking =
      strike !== null && hash2(strike.id * 7919, i) < DOG_LASH_STRIKE_ARMS / count;

    if (striking && strike) {
      drawStrikingArm(ctx, ax, ay, base, idle, r, morph, h, t, strike);
      continue;
    }

    const segs = 4;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    let px = ax;
    let py = ay;
    let dir = base;
    for (let s = 1; s <= segs; s++) {
      // The curl builds along the length — a tentacle is stiff where it leaves
      // the body and loose at the tip, and a constant bend per segment reads as
      // an arc of wire.
      dir += Math.sin(t + s * 1.3 + h) * 0.55 * (s / segs);
      const step = (idle / segs) * (1.15 - s * 0.09);
      px += Math.cos(dir) * step;
      py += Math.sin(dir) * step;
      ctx.lineTo(px, py);
    }

    strokeTentacle(ctx, r * 0.3 * morph, r * 0.18 * morph, 1);
    // A wet tip, which is most of what makes it read as flesh rather than rope.
    ctx.beginPath();
    ctx.arc(px, py, r * 0.09 * morph, 0, TAU);
    ctx.fillStyle = 'rgba(196, 72, 78, 0.85)';
    ctx.fill();
  }
  ctx.restore();
}

/**
 * One arm through a strike: coiled back, thrown out, and reeled home.
 *
 * The three phases are three different curves and deliberately not one
 * interpolation between two poses — what makes a throw read as a throw is that
 * the coil goes the *wrong way* first. An arm that simply extended toward the
 * target over the windup would telegraph nothing the ground ring is not already
 * saying, and would look like the arm growing rather than being loaded.
 *
 * - **coiling** (`phase 0`): drawn back along its own bearing to
 *   `DOG_LASH_COIL` of its idle reach, and swung *away* from the target, so the
 *   animal visibly winds up. Eased on the square, so it is slow to start and
 *   snatches back at the end — a linear coil is a limb being pulled by a rope.
 * - **out** (`phase 1`): a straight run at the landing point over 110ms, with
 *   the tip leading and the shaft still lagging behind it. Barely three ticks,
 *   which is the point: the windup is the readable part and the strike itself
 *   is meant to be too quick to answer.
 * - **home** (`phase 2`): the tip walks back down the same line and the curl
 *   comes back into it as it goes slack.
 */
function drawStrikingArm(
  ctx: CanvasRenderingContext2D,
  ax: number,
  ay: number,
  base: number,
  idle: number,
  r: number,
  morph: number,
  h: number,
  t: number,
  strike: LashState,
): void {
  const toTarget = Math.atan2(strike.y2 - ay, strike.x2 - ax);
  const span = Math.hypot(strike.x2 - ax, strike.y2 - ay);

  // How far down the line to the landing point the tip has got, and how much of
  // the arm's own idle curl is still in it. `reach` of 0 is the coil.
  let reach: number;
  let slack: number;
  if (strike.phase === 0) {
    const e = strike.t * strike.t;
    reach = -idle * DOG_LASH_COIL * e;
    slack = 1 - e * 0.7;
  } else if (strike.phase === 1) {
    // Eased out rather than linear: the tip is quickest in the middle of the
    // throw, which is what an arm does and what a lerp does not.
    reach = span * (1 - (1 - strike.t) * (1 - strike.t));
    slack = 0.25;
  } else {
    reach = span * (1 - strike.t) * (1 - strike.t);
    slack = 0.25 + strike.t * 0.75;
  }

  // Which way the shaft leaves the body. Coiling it swings off the target;
  // committed it lies along the line to it.
  const away = base + (base - toTarget) * 0.35;
  const lie =
    strike.phase === 0 ? away + (toTarget - away) * (strike.t * strike.t) : toTarget;

  const segs = 5;
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  let px = ax;
  let py = ay;
  let dir = lie;
  const len = Math.max(idle * DOG_LASH_COIL * 0.6, Math.abs(reach));
  /**
   * **The taper has to be normalised, or the arm never reaches the ring.**
   *
   * Segments get shorter toward the tip, which is what makes a limb read as
   * tapering rather than as a chain of equal links — but the weights
   * (`1.15 - s * 0.09`) sum to 4.40 across five segments, not 5. Divided by
   * `segs` the arm therefore lands at **88% of `len`**, and since `len` at
   * full extension is the whole span to the landing point, the tip came down a
   * ninth of the throw short of the red circle everybody was told to dodge.
   * Measured off the canvas before the fix: ink reached **0.91 of the span**
   * against the 1.00 the ring is drawn at.
   *
   * The idle arms have the same shape and it does not matter there — how long
   * an idle arm looks is an art decision with nothing to agree with — so the
   * normalisation is here rather than shared.
   */
  let taper = 0;
  for (let s = 1; s <= segs; s++) taper += 1.15 - s * 0.09;
  for (let s = 1; s <= segs; s++) {
    // The curl is scaled by how slack the arm is, so a limb under tension is
    // straight and one that has been let go writhes. Same shape as the idle
    // curl building along the length, and for the same reason.
    dir += Math.sin(t + s * 1.3 + h) * 0.5 * (s / segs) * slack;
    const step = (len / taper) * (1.15 - s * 0.09) * (reach < 0 ? -1 : 1);
    px += Math.cos(dir) * step;
    py += Math.sin(dir) * step;
    ctx.lineTo(px, py);
  }

  // A striking arm is drawn thicker than an idle one — it is under load, and
  // the extra weight is what picks the three of them out of the eight without
  // needing a second colour.
  strokeTentacle(ctx, r * 0.38 * morph, r * 0.24 * morph, 1);

  ctx.beginPath();
  ctx.arc(px, py, r * 0.13 * morph, 0, TAU);
  ctx.fillStyle = 'rgba(214, 84, 88, 0.9)';
  ctx.fill();
}

/**
 * Two passes: a dark one wider than the light one, so each arm has a contour
 * and the mass of them does not merge into a single blob at a distance.
 */
function strokeTentacle(
  ctx: CanvasRenderingContext2D,
  dark: number,
  light: number,
  alpha: number,
): void {
  ctx.strokeStyle = 'rgba(24, 10, 12, ' + (0.9 * alpha).toFixed(3) + ')';
  ctx.lineWidth = dark;
  ctx.stroke();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = DOG_TENTACLE_COLOR;
  ctx.lineWidth = light;
  ctx.stroke();
  ctx.globalAlpha = 1;
}

/** Two integers into a stable fraction. Same trick as `hashId`, one more input. */
function hash2(a: number, b: number): number {
  const n = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

/**
 * Tentacles thrown out of a burst dog — in the air, then lying where they fell.
 *
 * **The bouncing is the server's**, which is why these arrive on the wire at
 * all rather than being thrown client-side like the blood and the birth gore:
 * they come off walls, and the client has no business deciding where a wall is.
 * What is left here is the picture — a curl, a shadow while it is up, and a
 * fade once it is down.
 */
export function drawTentacleDebris(
  ctx: CanvasRenderingContext2D,
  list: TentacleState[],
  view: Viewport,
  now: number,
): void {
  if (list.length === 0) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (let i = 0; i < list.length; i++) {
    const t = list[i];
    if (t.x < view.x - 60 || t.x > view.x + view.w + 60) continue;
    if (t.y < view.y - 60 || t.y > view.y + view.h + 60) continue;

    const h = hash2(Math.round(t.x), i);
    const len = DOG_ART_RADIUS * (0.9 + h * 0.7);
    const alpha = t.t;

    // Under it while it is up, so the arc reads as height rather than as the
    // thing being drawn off to one side. The same fix the flamethrower's arc
    // needed.
    if (t.air) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
      ctx.beginPath();
      ctx.ellipse(t.x + 3, t.y + 4, len * 0.4, len * 0.2, t.a, 0, TAU);
      ctx.fill();
    }

    // Airborne it whips; on the ground it lies still, so the churn is gated on
    // `air` rather than always running — a pile of debris quietly writhing in
    // the road is a different and much odder thing to look at.
    const curl = t.air ? Math.sin(now * 0.012 + h * 6.3) * 0.7 : (h - 0.5) * 0.8;
    const lift = t.air ? -6 : 0;

    ctx.beginPath();
    let px = t.x;
    let py = t.y + lift;
    let dir = t.a;
    ctx.moveTo(px, py);
    for (let s = 1; s <= 3; s++) {
      dir += curl * (s / 3);
      px += Math.cos(dir) * (len / 3);
      py += Math.sin(dir) * (len / 3);
      ctx.lineTo(px, py);
    }
    ctx.strokeStyle = 'rgba(24, 10, 12, ' + (0.85 * alpha).toFixed(3) + ')';
    ctx.lineWidth = DOG_ART_RADIUS * 0.26;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(126, 44, 48, ' + (0.9 * alpha).toFixed(3) + ')';
    ctx.lineWidth = DOG_ART_RADIUS * 0.15;
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * The red ring where a strike is about to come down.
 *
 * **This is the ability's one concession to the people it is used on**, and it
 * is drawn on the *ground* — under the bodies, with `drawBlood` and the tyre
 * marks — for a reason that matters: the officer standing in it is the one
 * person who most needs to see it, and a ring painted over the top of them
 * would be a warning that hides the thing being warned.
 *
 * Three readings, and they answer different questions:
 *
 * - the **rim** is where the edge of the impact is, so "am I in it" is a
 *   question about your own feet rather than about judging a distance;
 * - the **sweep** filling round the rim is how long there is left, which is the
 *   half a dodge actually needs — a ring that only pulsed would say "danger
 *   here" and never say "now";
 * - and the **wash** inside comes up as the sweep closes, so the thing reads as
 *   loading even at the edge of vision where the rim is a couple of pixels.
 *
 * It is drawn through the coil and **held for the strike itself**, dimmer: the
 * arms are in the air for 110ms, which is three ticks, and a ring that vanished
 * the instant they let go would blink out before anybody registered it had
 * completed. Gone the moment it lands.
 */
export function drawLashWarnings(
  ctx: CanvasRenderingContext2D,
  list: LashState[],
  view: Viewport,
  now: number,
): void {
  if (list.length === 0) return;
  ctx.save();
  for (let i = 0; i < list.length; i++) {
    const l = list[i];
    if (l.phase === 2) continue; // landed; the flash has it from here
    if (!visible(view, l.x2, l.y2, l.r + 8)) continue;

    // One ramp for the whole tell: 0 as the arms coil, 1 as they arrive.
    const load = l.phase === 0 ? l.t : 1;
    const fading = l.phase === 1 ? 1 - l.t * 0.55 : 1;

    // The wash inside. Deliberately faint — the ground under it has to stay
    // readable, because the answer to the ring is to walk on it.
    ctx.globalAlpha = (0.1 + load * 0.16) * fading;
    ctx.fillStyle = LASH_WARN_COLOR;
    ctx.beginPath();
    ctx.arc(l.x2, l.y2, l.r, 0, TAU);
    ctx.fill();

    // The rim, at the true impact radius.
    ctx.globalAlpha = (0.42 + load * 0.5) * fading;
    ctx.strokeStyle = LASH_WARN_COLOR;
    ctx.lineWidth = LASH_WARN_RIM;
    ctx.stroke();

    // And the sweep closing round it. Starts at the top and goes clockwise,
    // which is the one convention everybody already reads off a clock face.
    ctx.globalAlpha = fading;
    ctx.lineWidth = LASH_WARN_RIM * 1.8;
    ctx.beginPath();
    ctx.arc(l.x2, l.y2, l.r, -Math.PI / 2, -Math.PI / 2 + load * TAU);
    ctx.stroke();

    // A cross at the middle, so the spot is legible when the rim is off screen
    // or under a crowd. Small enough not to be mistaken for a pickup.
    ctx.globalAlpha = (0.3 + load * 0.5) * fading;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(l.x2 - 5, l.y2);
    ctx.lineTo(l.x2 + 5, l.y2);
    ctx.moveTo(l.x2, l.y2 - 5);
    ctx.lineTo(l.x2, l.y2 + 5);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

/**
 * What is left at the landing point once the arms have gone: a flash, and a
 * deflect ring over anybody whose armour ate it.
 *
 * The limbs themselves are **not drawn here** — they are drawn with the dog by
 * `drawTentacles`, because they are the same arms that idle on its back. What
 * this pass is for is the part that belongs to the ground rather than to the
 * animal, and it is over the bodies because an impact lands on top of whoever
 * was standing there.
 *
 * The blood, the chips and the gouge are not here either: those are *thrown*
 * once when a strike lands rather than drawn per frame, exactly as blood is
 * thrown off `Shot.hit`. See `takeLashImpacts`.
 */
export function drawLashes(
  ctx: CanvasRenderingContext2D,
  list: LashState[],
  view: Viewport,
): void {
  if (list.length === 0) return;
  ctx.save();
  for (let i = 0; i < list.length; i++) {
    const l = list[i];
    if (l.phase !== 2) continue;
    if (!visible(view, l.x2, l.y2, l.r + 20)) continue;
    const life = 1 - l.t;
    if (life <= 0) continue;

    // The impact itself: a bright ring thrown outward past the rim, so the
    // spread reads as force rather than as the warning circle fading.
    ctx.globalAlpha = life * life * 0.75;
    ctx.strokeStyle = '#e8656a';
    ctx.lineWidth = 2 + life * 4;
    ctx.beginPath();
    ctx.arc(l.x2, l.y2, l.r * (0.55 + (1 - life) * 0.7), 0, TAU);
    ctx.stroke();

    // And a deflect ring on each body whose armour turned it, which is the
    // whole readout that a charge was spent on something. Bright and cold
    // against the red, because it is the one good thing on screen.
    for (let k = 0; k < l.hits.length; k++) {
      const hit = l.hits[k];
      if (hit.blocked === null) continue;
      ctx.globalAlpha = life * 0.9;
      ctx.strokeStyle = hit.blocked === 'shield' ? '#9fd8ff' : '#cfd6c4';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(hit.x, hit.y, 11 + (1 - life) * 9, 0, TAU);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

/**
 * Everything a landed strike throws that is not on the wire: blood on the
 * people it caught, a gouge and chips where it caught nobody.
 *
 * **Thrown once per strike, never per frame**, which is what `LashState.id` is
 * for. A strike is on the wire for the whole of its snap-back, so anything done
 * off the flag rather than off the transition would be done twenty times — the
 * same trap the roar's sound has, and solved the same way, on the edge.
 *
 * The set is bounded by the ids that are still on screen, so it empties itself
 * as strikes finish rather than growing for the length of the round.
 */
const lashesResolved = new Set<number>();

export function takeLashImpacts(list: LashState[], now: number): void {
  for (let i = 0; i < list.length; i++) {
    const l = list[i];
    if (l.phase !== 2 || lashesResolved.has(l.id)) continue;
    lashesResolved.add(l.id);

    if (l.hits.length === 0) {
      // Nothing there. A gouge in the road and a few chips of it thrown up —
      // the smallest thing that turns "the ability did nothing" into "it
      // missed", and the reason a dodge is worth making.
      spawnLashScar(l.x2, l.y2, now);
      continue;
    }

    for (let k = 0; k < l.hits.length; k++) {
      const hit = l.hits[k];
      // Along the line the limb came in on, so the spray goes on past them the
      // way a round's does rather than fanning off a point.
      spawnBlood(hit.x, hit.y, Math.atan2(hit.y - l.y1, hit.x - l.x1), now + k);
    }
  }

  // Keep only ids still in the round. A strike that has finished cannot come
  // back, so anything not in the list is safe to forget.
  if (lashesResolved.size > 16) {
    const live = new Set(list.map((l) => l.id));
    for (const id of lashesResolved) if (!live.has(id)) lashesResolved.delete(id);
  }
}

/** A new city has none of the old one's marks on it — see `clearBlood`. */
export function clearLashScars(): void {
  lashGouges.length = 0;
  lashChips.length = 0;
  lashesResolved.clear();
}

interface LashGouge {
  x: number;
  y: number;
  r: number;
  born: number;
}
interface LashChip {
  x: number;
  y: number;
  vx: number;
  vy: number;
  born: number;
}
const lashGouges: LashGouge[] = [];
const lashChips: LashChip[] = [];

/**
 * A miss: a scuff in the road, and two or three chips of it thrown up.
 *
 * The chips are drawn with a **rising arc and a shadow under them**, which is
 * the same trick the flamethrower's stream and the thrown tentacles use and for
 * the same reason: on a top-down map, height only reads if something on the
 * ground stays put underneath it. Three of them, small — this is punctuation on
 * a miss, not an explosion.
 */
function spawnLashScar(x: number, y: number, now: number): void {
  const rand = rng((x * 2654435761 + y * 40503 + now) >>> 0);
  for (let i = 0; i < 3; i++) {
    lashGouges.push({
      x: x + (rand() - 0.5) * 16,
      y: y + (rand() - 0.5) * 16,
      r: 3 + rand() * 6,
      born: now,
    });
  }
  for (let i = 0; i < LASH_CHIP_COUNT; i++) {
    const a = rand() * TAU;
    const speed = LASH_CHIP_SPEED * (0.4 + rand() * 0.9);
    lashChips.push({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, born: now });
  }
}

/** The scuff, on the ground with the blood. One path per band, filled once. */
export function drawLashScars(
  ctx: CanvasRenderingContext2D,
  view: Viewport,
  now: number,
): void {
  if (lashGouges.length === 0) return;
  let write = 0;
  for (let i = 0; i < lashGouges.length; i++) {
    if (now - lashGouges[i].born < LASH_GOUGE_MS) lashGouges[write++] = lashGouges[i];
  }
  lashGouges.length = write;

  // Two bands rather than the blood's four: a scuff on tarmac barely changes as
  // it ages, so the fade has almost nothing to describe.
  for (let band = 0; band < 2; band++) {
    let any = false;
    ctx.beginPath();
    for (const g of lashGouges) {
      const age = (now - g.born) / LASH_GOUGE_MS;
      if ((age < 0.5 ? 0 : 1) !== band) continue;
      if (!visible(view, g.x, g.y, g.r + 4)) continue;
      ctx.moveTo(g.x + g.r, g.y);
      ctx.arc(g.x, g.y, g.r, 0, TAU);
      any = true;
    }
    if (!any) continue;
    ctx.globalAlpha = band === 0 ? 0.5 : 0.26;
    ctx.fillStyle = LASH_GOUGE_COLOR;
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/** And the chips, over the bodies, with the blood spray. */
export function drawLashChips(ctx: CanvasRenderingContext2D, now: number): void {
  if (lashChips.length === 0) return;
  let write = 0;
  for (let i = 0; i < lashChips.length; i++) {
    const chip = lashChips[i];
    const age = now - chip.born;
    if (age >= LASH_CHIP_MS) continue;
    lashChips[write++] = chip;

    const life = 1 - age / LASH_CHIP_MS;
    const t = age / 1000;
    const drag = Math.exp(-t * 3.2);
    const px = chip.x + chip.vx * ((1 - drag) / 3.2);
    const py = chip.y + chip.vy * ((1 - drag) / 3.2);
    // Up and back down over its life. Without the shadow this reads as the chip
    // sliding off to one side rather than being thrown.
    const lift = Math.sin((1 - life) * Math.PI) * 9;

    ctx.globalAlpha = life * 0.35;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(px, py, 1.6, 0.9, 0, 0, TAU);
    ctx.fill();

    ctx.globalAlpha = life;
    ctx.fillStyle = LASH_CHIP_COLOR;
    ctx.beginPath();
    ctx.arc(px, py - lift, 1.5, 0, TAU);
    ctx.fill();
  }
  lashChips.length = write;
  ctx.globalAlpha = 1;
}

/**
 * The roar, drawn as arcs coming off the muzzle.
 *
 * **Arcs rather than rings**, and this is the whole of why it reads as a sound
 * rather than as a shockwave: a closed circle expanding out of an animal is a
 * blast, where a nested set of open arcs facing one way is the shape everything
 * from a speaker icon to a comic book uses for a noise going in a direction.
 * The ability is aimed, so the drawing has to be aimed too.
 *
 * There is no per-frame state and nothing is stored: each arc's position is its
 * index plus the clock, modulo its own life, so the same code draws the same
 * thing on a spectator's screen, the roaring player's, and anybody else's, with
 * only the id and the wall clock in common. Hashing the id is what keeps two
 * dogs roaring side by side from pulsing in lockstep.
 */
function drawRoar(
  ctx: CanvasRenderingContext2D,
  hingeX: number,
  hingeY: number,
  head: number,
  r: number,
  seed: number,
  now: number,
): void {
  // Out at the teeth, not at the neck — the same offset the bite is measured
  // from, so what you see and what the jaws reach agree.
  const muzzleX = hingeX + Math.cos(head) * r * 0.9;
  const muzzleY = hingeY + Math.sin(head) * r * 0.9;
  const phase = (seed % 360) / 360;

  ctx.save();
  ctx.lineCap = 'round';
  const rings = 4;
  for (let i = 0; i < rings; i++) {
    // Each arc runs its own life over and over, offset from its neighbours so
    // they leave the mouth one after another rather than all at once.
    const t = (((now / DOG_ROAR_RING_MS) + phase + i / rings) % 1);
    const reach = r * 0.4 + t * DOG_ROAR_RING_REACH;
    // Fades out as it goes, and starts faint too — an arc that snapped into
    // existence at full strength at the teeth would read as a flash.
    const alpha = Math.sin(t * Math.PI) * 0.5;
    if (alpha <= 0.01) continue;
    // The cone widens as it travels, the way a shout does.
    const spread = 0.42 + t * 0.34;
    ctx.strokeStyle = 'rgba(190, 40, 46, ' + alpha.toFixed(3) + ')';
    ctx.lineWidth = r * (0.19 - t * 0.1);
    ctx.beginPath();
    ctx.arc(muzzleX, muzzleY, reach, head - spread, head + spread);
    ctx.stroke();
    // A paler thread inside the red one, so the arc has an edge to it rather
    // than being a soft smear at this size.
    ctx.strokeStyle = 'rgba(255, 214, 170, ' + (alpha * 0.42).toFixed(3) + ')';
    ctx.lineWidth = r * (0.07 - t * 0.04);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * The two halves of the head, and the throat between them.
 *
 * Each half is one baked sprite, hinged at the back of the skull and mirrored
 * for the far side, so the pair meet exactly along the centre line when shut
 * and there is no separate "closed" drawing to keep in step.
 *
 * The eyes are live rather than baked, because they are additive and have to
 * lie over whatever the halves are doing — and because they are the one bright
 * thing on the animal, which is worth keeping under direct control.
 */
function dogHeadHalves(
  ctx: CanvasRenderingContext2D,
  hingeX: number,
  hingeY: number,
  head: number,
  split: number,
  r: number,
  seed: number,
  now: number,
  dead: boolean,
): void {
  const art = dogSprites();

  // The throat, between the halves. Drawn first so they close over it, and only
  // worth anything once there is a gap to see it through.
  if (split > 0.12) {
    const gap = Math.min(1, split / DOG_SPLIT_ARC);
    ctx.save();
    ctx.translate(hingeX, hingeY);
    ctx.rotate(head);
    ctx.scale(r, r);
    // Kept *inside* the jaws. The half-skulls reach 0.9 radii, so a throat any
    // longer than this pokes out past the muzzle tips and stops being a throat
    // — it becomes a red blob stuck on the front of the animal, which is
    // exactly what a wide split made of it.
    ctx.fillStyle = DOG_MAW_COLOR;
    ctx.beginPath();
    ctx.ellipse(0.36, 0, 0.46, 0.3 * gap + 0.04, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(8, 3, 4, 0.75)';
    ctx.beginPath();
    ctx.ellipse(0.26, 0, 0.26, 0.17 * gap + 0.02, 0, 0, TAU);
    ctx.fill();
    // A wet sheen down one side of the throat, so the inside reads as slick
    // rather than as a hole cut in the head.
    ctx.fillStyle = `rgba(226, 182, 176, ${0.1 + 0.1 * gap})`;
    ctx.beginPath();
    ctx.ellipse(0.4, -0.09 * gap, 0.24, 0.045 * gap + 0.01, -0.2, 0, TAU);
    ctx.fill();

    /**
     * **The tongue.** It was two flat ellipses of maw and nothing else, which
     * reads as a hole rather than as the inside of an animal.
     *
     * What makes it unpleasant rather than merely present is that it does not
     * sit still and it does not sit straight: it lolls out to one side, past the
     * teeth, over the jaw line — a tongue that stays politely inside the mouth
     * is a tongue nobody notices. It is split at the tip, it is drawn as a
     * tapering body rather than a stroke so it has a shape, and the wet
     * highlight runs *down its middle* rather than round its edge, which is the
     * difference between wet and outlined.
     */
    // **It has to reach past the teeth.** Kept inside the jaws it is the same
    // colour and roughly the same shape as the throat behind it, so it reads as
    // more maw rather than as a tongue — the muzzle ends at 0.9 radii and this
    // lolls out beyond it, which is the only way the eye picks it out as a
    // separate thing hanging out of the animal.
    const loll = Math.sin(now * 0.0034) * 0.22 + 0.12;
    const lick = 1.05 + Math.sin(now * 0.0021) * 0.16;
    const reach = (0.42 + 0.62 * gap) * lick;
    const tipX = reach;
    const tipY = loll * (0.3 + 0.7 * gap);
    const wide = 0.1 + 0.05 * gap;
    ctx.beginPath();
    ctx.moveTo(0.05, -wide * 0.8);
    // Out along the mouth, swelling at the middle and tapering to the fork.
    ctx.bezierCurveTo(reach * 0.4, -wide - 0.02, reach * 0.72, tipY - wide, tipX, tipY - wide * 0.3);
    // The split: two points with a notch bitten between them.
    ctx.lineTo(tipX + 0.09, tipY - wide * 0.55);
    ctx.lineTo(tipX + 0.02, tipY);
    ctx.lineTo(tipX + 0.09, tipY + wide * 0.55);
    ctx.lineTo(tipX, tipY + wide * 0.3);
    ctx.bezierCurveTo(reach * 0.72, tipY + wide, reach * 0.4, wide + 0.02, 0.05, wide * 0.8);
    ctx.closePath();
    // Lighter than the throat behind it, or the two merge into one red shape.
    const tongue = ctx.createLinearGradient(0.05, 0, tipX, tipY);
    tongue.addColorStop(0, '#48101a');
    tongue.addColorStop(0.5, '#93303a');
    tongue.addColorStop(1, '#5e1622');
    ctx.fillStyle = tongue;
    ctx.fill();
    // Its own dark contour, so it sits *in front of* the jaws rather than
    // looking painted onto them.
    ctx.strokeStyle = 'rgba(14, 4, 7, 0.7)';
    ctx.lineWidth = 0.028;
    ctx.stroke();
    // The groove down the middle, and a sheen along one side of it.
    ctx.strokeStyle = 'rgba(22, 5, 8, 0.55)';
    ctx.lineWidth = 0.03;
    ctx.beginPath();
    ctx.moveTo(0.12, 0);
    ctx.quadraticCurveTo(reach * 0.6, tipY * 0.5, tipX, tipY);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(236, 190, 190, 0.3)';
    ctx.lineWidth = 0.022;
    ctx.beginPath();
    ctx.moveTo(0.16, -wide * 0.35);
    ctx.quadraticCurveTo(reach * 0.6, tipY * 0.5 - wide * 0.35, tipX * 0.92, tipY - wide * 0.3);
    ctx.stroke();

    /**
     * Saliva, and it is most of what sells the head *coming apart* rather than
     * opening.
     *
     * Each strand has its own breaking point: below it the string bridges the
     * gap and bows, past it the thing has given way and hangs off both halves
     * with a bead swinging on each stub. Since the strands are hashed off the
     * dog's id, they break in the same order every time — the mouth comes apart
     * the same way twice, which is what makes it read as anatomy rather than as
     * particles. They also thin as they stretch, because a string being drawn
     * out does.
     */
    const strand = rng(seed ^ 0x77aa);
    for (let i = 0; i < DOG_DROOL_STRANDS; i++) {
      const along = 0.1 + (i / DOG_DROOL_STRANDS) * 0.72;
      const breaks = 0.4 + strand() * 0.62;
      const reach = 0.32 * gap;
      const sag = (strand() - 0.5) * 0.1 + Math.sin(now * 0.005 + i * 1.7) * 0.03;
      ctx.lineCap = 'round';
      ctx.lineWidth = 0.034 * (1 - 0.55 * gap);
      ctx.strokeStyle = `rgba(232, 220, 206, ${0.6 - 0.22 * gap})`;

      if (gap < breaks) {
        ctx.beginPath();
        ctx.moveTo(along, -reach);
        ctx.quadraticCurveTo(along + sag, 0, along, reach);
        ctx.stroke();
        continue;
      }

      // Given way. Two stubs, each with a bead of it on the end.
      const stub = reach * (0.3 + 0.25 * strand());
      ctx.beginPath();
      ctx.moveTo(along, -reach);
      ctx.quadraticCurveTo(along + sag, -reach + stub * 0.5, along + sag * 1.6, -reach + stub);
      ctx.moveTo(along, reach);
      ctx.quadraticCurveTo(along + sag, reach - stub * 0.5, along + sag * 1.6, reach - stub);
      ctx.stroke();
      ctx.fillStyle = `rgba(232, 220, 206, ${0.5 - 0.15 * gap})`;
      ctx.beginPath();
      ctx.arc(along + sag * 1.6, -reach + stub, 0.034, 0, TAU);
      ctx.arc(along + sag * 1.6, reach - stub, 0.034, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  for (const side of [-1, 1]) {
    const a = head + split * side;
    // **The halves pull apart as well as swinging.** Rotation alone is a jaw on
    // a hinge however wide it goes, because the two pieces stay joined at the
    // back. Sliding each one out from the hinge opens the seam along its whole
    // length instead, which is the difference between a mouth and a skull
    // coming apart.
    const spread = r * DOG_SPLIT_SPREAD * split * side;
    const hx = hingeX + Math.cos(a + Math.PI / 2) * spread;
    const hy = hingeY + Math.sin(a + Math.PI / 2) * spread;
    // Which side keeps its hide is fixed rather than hashed — a dog with a bone
    // face on the same side every time is a design; one that changes per animal
    // is noise.
    drawSprite(ctx, side > 0 ? art.headHide : art.headBone, hx, hy, a, side < 0);

    // **A corpse's eyes are out.** The glow is drawn additively, so under the
    // corpse's greyscale filter it would come through as a pale smear rather
    // than as light — and a dead animal whose eyes are still lit is not dead.
    //
    // Skipping the eye is *all* this does. There is no `save` in this loop, so
    // the `restore` that used to sit here popped a state it never pushed —
    // twice per corpse, once per side. The first pop took `drawDog`'s greyscale
    // filter off early; the second took **the world transform** off the stack,
    // and every single thing drawn after that in the frame — walls, doors,
    // bodies, effects, fog — landed in raw canvas pixels instead of world ones.
    // The ground, the park, the pond and the blood are drawn *before* the
    // corpses and so were the only things still in the right place, which is
    // what "everything but the floor stops rendering" was, and drawing the rest
    // at 1:1 world coordinates in the corner of the screen is what "the dog was
    // small and off to the right, like a minimap" was.
    if (dead) continue;

    // The eye, riding this half — so the pair come apart with the head. Drawn
    // additively, and it is the one bright thing on the animal.
    //
    // The soft outer glow is kept small on purpose: at anything like the radius
    // it wants to be, an additive wash covers the whole skull and the head
    // comes out cream-coloured whichever side you are looking at. It is there
    // to say the eye is lit, not to light the animal.
    // Off the *spread* hinge, not the true one — the eye rides its half, so it
    // has to be carried by the pull-apart as well as by the swing.
    const ex = hx + Math.cos(a) * r * 0.3 + Math.cos(a + Math.PI / 2) * r * 0.19 * side;
    const ey = hy + Math.sin(a) * r * 0.3 + Math.sin(a + Math.PI / 2) * r * 0.19 * side;
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(255, 176, 30, 0.1)';
    ctx.beginPath();
    ctx.arc(ex, ey, r * 0.26, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 200, 55, 0.22)';
    ctx.beginPath();
    ctx.arc(ex, ey, r * 0.14, 0, TAU);
    ctx.fill();
    ctx.fillStyle = DOG_EYE_COLOR;
    ctx.beginPath();
    // The bare side's is a smaller, dimmer point down in the socket.
    ctx.arc(ex, ey, r * (side > 0 ? 0.08 : 0.055), 0, TAU);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }
}


/**
 * The bodies. Every dog put down this round, left where it fell.
 *
 * Drawn through `drawEntity` with `dead` set, so a corpse is the same animal
 * the same way round — there is no second drawing of a dog to keep in step with
 * the first. The greying is one `filter` on the context: with a handful of
 * these in a whole round that is far cheaper than baking a second set of grey
 * sprites, and it cannot fall out of step with the live ones.
 */
export function drawCorpses(
  ctx: CanvasRenderingContext2D,
  corpses: CorpseState[],
  view: Viewport,
  now: number,
): void {
  for (let i = 0; i < corpses.length; i++) {
    const c = corpses[i];
    if (!visible(view, c.x, c.y, DOG_ART_RADIUS * 2)) continue;
    drawEntity(
      ctx,
      {
        // Stable per corpse, so the hashed rot and fur stay put on the body.
        id: `corpse-${i}`,
        type: 'zombie',
        x: c.x,
        y: c.y,
        facing: c.facing,
        head: c.head,
        health: 0,
        dog: true,
        dead: true,
      },
      false,
      now,
      false,
    );
  }
}

// ------------------------------------------------------------------- blood
/**
 * Blood is derived, not sent.
 *
 * `Shot.hit` already says a round found a body and `x2,y2` is exactly where it
 * stopped, so the client has everything it needs and the wire carries nothing
 * new. A hit spawns two things with different lifetimes: droplets thrown along
 * the round's line, gone in half a second, and marks on the road.
 *
 * A mark spends `BLOOD_DECAL_MS` fading from wet to a dull stain in the live
 * list. After that, with PERMANENT BLOOD on, it is stamped once into a shared
 * half-resolution offscreen layer (`stainLayer`, which also holds settled
 * zombie corpses) and dropped — so the per-frame cost is one blit plus only the
 * marks that are still drying, however long the round runs. With permanence off
 * it fades to nothing and is culled, exactly as before.
 */
interface BloodDecal {
  x: number;
  y: number;
  /** An ellipse now: rifle marks streak downrange, pools are round. */
  rx: number;
  ry: number;
  rot: number;
  born: number;
}
interface BloodDrop {
  x: number;
  y: number;
  vx: number;
  vy: number;
  born: number;
}
const bloodDecals: BloodDecal[] = [];
const bloodDrops: BloodDrop[] = [];

/** How many alpha steps the decals are drawn in — see `drawBlood`. */
const BLOOD_BANDS = 4;
/** The alpha a mark has dried to by the time it is baked — the last live band. */
const BLOOD_DRIED_ALPHA = 0.2;

/**
 * The shared permanent-stain layer: dried blood and settled corpses both bake
 * here. Sized off the *live* world dimensions, so it is built lazily (never at
 * import — `WORLD_WIDTH` is a `let` that the map sets) and rebuilt whenever the
 * city size changes. Same bake-it-once trick as the grime tile and the minimap.
 */
let stainLayer: HTMLCanvasElement | null = null;
let stainCtx: CanvasRenderingContext2D | null = null;
/** Whether anything has actually been baked, so `drawBlood` knows to blit. */
let stainDirty = false;

function ensureStainLayer(): CanvasRenderingContext2D | null {
  const w = Math.max(1, Math.round(WORLD_WIDTH * BLOOD_BAKE_SCALE));
  const h = Math.max(1, Math.round(WORLD_HEIGHT * BLOOD_BAKE_SCALE));
  if (!stainLayer || stainLayer.width !== w || stainLayer.height !== h) {
    stainLayer = document.createElement('canvas');
    stainLayer.width = w;
    stainLayer.height = h;
    stainCtx = stainLayer.getContext('2d');
    stainDirty = false;
  }
  return stainCtx;
}

function clearStainLayer(): void {
  if (stainLayer && stainCtx) stainCtx.clearRect(0, 0, stainLayer.width, stainLayer.height);
  stainDirty = false;
}

/** Draw into the stain layer at world coordinates, at the layer's scale. */
function bakeInto(sctx: CanvasRenderingContext2D, fn: (g: CanvasRenderingContext2D) => void): void {
  sctx.save();
  sctx.scale(BLOOD_BAKE_SCALE, BLOOD_BAKE_SCALE);
  fn(sctx);
  sctx.restore();
  stainDirty = true;
}

function decalPath(g: CanvasRenderingContext2D, d: BloodDecal): void {
  g.moveTo(d.x + d.rx * Math.cos(d.rot), d.y + d.rx * Math.sin(d.rot));
  g.ellipse(d.x, d.y, d.rx, d.ry, d.rot, 0, TAU);
}

function bakeDecal(sctx: CanvasRenderingContext2D, d: BloodDecal): void {
  bakeInto(sctx, (g) => {
    g.globalAlpha = BLOOD_DRIED_ALPHA;
    g.fillStyle = BLOOD_COLOR;
    g.beginPath();
    decalPath(g, d);
    g.fill();
    g.globalAlpha = 1;
  });
}

export function spawnBlood(
  x: number,
  y: number,
  angle: number,
  now: number,
  light = false,
): void {
  if (!settings.blood) return;
  const rand = rng((x * 2654435761 + y * 40503 + now) >>> 0);

  // Fewer, smaller marks for a sidearm; a varied spread for a rifle.
  const marks = light ? 1 + Math.floor(rand() * 2) : 3 + Math.floor(rand() * 5);
  for (let i = 0; i < marks; i++) {
    const spread = angle + (rand() - 0.5) * 1.4;
    // Squared, so most land near the body and a few carry well downrange.
    const dist = rand() ** 1.4 * (light ? 12 : 32);
    const base = 1.5 + rand() ** 2 * (light ? 2.4 : 8.5);
    const stretch = 1 + rand() * 1.4; // elongated along the round's line
    bloodDecals.push({
      x: x + Math.cos(spread) * dist + (rand() - 0.5) * 8,
      y: y + Math.sin(spread) * dist + (rand() - 0.5) * 8,
      rx: base * stretch,
      ry: base * (0.5 + rand() * 0.35),
      rot: angle + (rand() - 0.5) * 0.6,
      born: now,
    });
  }

  // A rifle wound occasionally pools; a pistol never does.
  if (!light && rand() < 0.16) {
    const r = 8 + rand() * 7;
    bloodDecals.push({
      x: x + (rand() - 0.5) * 10,
      y: y + (rand() - 0.5) * 10,
      rx: r,
      ry: r * (0.8 + rand() * 0.2),
      rot: rand() * TAU,
      born: now,
    });
  }

  // Fine cast-off flung well past the body, rifle only.
  if (!light) {
    const specks = Math.floor(rand() * 4);
    for (let i = 0; i < specks; i++) {
      const spread = angle + (rand() - 0.5) * 0.9;
      const dist = 28 + rand() * 46;
      const r = 0.7 + rand() * 1.5;
      bloodDecals.push({
        x: x + Math.cos(spread) * dist,
        y: y + Math.sin(spread) * dist,
        rx: r,
        ry: r,
        rot: 0,
        born: now,
      });
    }
  }

  if (bloodDecals.length > BLOOD_DECAL_MAX) {
    // Bake the overflow rather than lose it, so permanence still holds under a
    // sustained stream that outpaces the dry-down.
    const overflow = bloodDecals.length - BLOOD_DECAL_MAX;
    if (settings.permanentBlood) {
      const sctx = ensureStainLayer();
      if (sctx) for (let i = 0; i < overflow; i++) bakeDecal(sctx, bloodDecals[i]);
    }
    bloodDecals.splice(0, overflow);
  }

  const drops = light ? Math.round(BLOOD_SPRAY_DROPS * 0.4) : BLOOD_SPRAY_DROPS;
  const speedMul = light ? 0.6 : 1;
  for (let i = 0; i < drops; i++) {
    const spread = angle + (rand() - 0.5) * 1.4;
    const speed = BLOOD_SPRAY_SPEED * speedMul * (0.35 + rand() * 0.9);
    bloodDrops.push({
      x,
      y,
      vx: Math.cos(spread) * speed,
      vy: Math.sin(spread) * speed,
      born: now,
    });
  }
}

// ---------------------------------------------------------------- corpses
/**
 * A shot zombie, thrown a short way along the round and then greyed. After it
 * settles it is baked into `stainLayer` and stays for the round; the transient
 * `deaths` list on the wire is the only thing sent (like `shots`). Dogs keep
 * their own `corpses` — this is shamblers only.
 */
interface ZombieCorpse {
  x0: number;
  y0: number;
  a: number;
  born: number;
  /**
   * Which way this one's limbs fell.
   *
   * **On the record rather than derived from the position it is drawn at**, and
   * that is load-bearing: a corpse *slides* along the round for
   * `CORPSE_SLIDE_MS` before it settles, so limbs hashed off the live `x, y`
   * would rearrange themselves every frame of the slide and then again at the
   * moment it is baked into `stainLayer` — a body twitching its arms while it
   * comes to rest, and a visible pop when it stops.
   */
  seed: number;
}
const zombieCorpses: ZombieCorpse[] = [];

/**
 * The seed a body falling here and now gets.
 *
 * Its own function, and exported, so a rig can ask which pose a given `born`
 * will produce and lay one of each side by side. The alternative was a second
 * spawn that takes a seed, which is a drawing parameter nothing in the game
 * would ever pass.
 */
export function corpseSeed(x: number, y: number, now: number): number {
  return hash2(x * 0.37 + y, now * 0.013);
}

export function spawnCorpse(x: number, y: number, a: number, now: number): void {
  if (!settings.blood || !settings.corpses) return;
  // Hashed off where and when it fell, so it is fixed for the life of the body
  // and no two that fall together land the same way.
  zombieCorpses.push({ x0: x, y0: y, a, born: now, seed: corpseSeed(x, y, now) });
}

/**
 * True is the corpse as it was drawn: three limbs, and a hole where an arm
 * should be.
 *
 * Kept rather than deleted with the measurement, like `setSettledStandsStill`:
 * "it has four limbs now" means nothing without "and it had three before".
 * `client/corpserig.html` reads it.
 */
let threeLimbedCorpse = false;

export function setThreeLimbedCorpse(v: boolean): void {
  threeLimbedCorpse = v;
}

/**
 * How far a limb may fall from where it nominally sits, in radians and in body
 * radii of length.
 *
 * **The arms move about twice as much as the legs**, which is the asymmetry
 * that makes a row of bodies read as bodies. Arms are the loose end of a
 * dropped body — they land wherever they were thrown — where hips are held
 * together by the pelvis, so two legs that fell in wildly different directions
 * read as a doll rather than as a person. Beyond about this much the arms start
 * crossing the head, and the legs start crossing the arms.
 */
const CORPSE_ARM_JITTER = 0.55;
const CORPSE_LEG_JITTER = 0.26;
/**
 * How much longer or shorter than nominal a pair of limbs is, in body radii.
 *
 * **A pair, not a limb.** Both arms take one draw and both legs take another,
 * because a person's arms are the same length as each other — it is the *angle*
 * a fall randomises, not the anatomy. Drawn independently they were 1.45 and
 * 1.7 with a third of a radius either way on top, so one arm could come out at
 * 1.15 and the other at 2.0, and a body reads as deformed rather than sprawled.
 */
const CORPSE_ARM_LEN_JITTER = 0.22;
const CORPSE_LEG_LEN_JITTER = 0.14;
/**
 * How long a limb is before that draw, in body radii.
 *
 * One figure per pair, for the same reason. The arms' was 1.45 and 1.7 and is
 * the average of the two; the far arm on a body lying on its side keeps its own
 * because of where it points — see `corpseLimbs`.
 */
const CORPSE_ARM_LEN = 1.58;
const CORPSE_LEG_LEN = 1.55;
const CORPSE_SIDEWAYS_ARM_LEN = 1.55;

/**
 * How a body went down: mostly straight back along the round, sometimes at an
 * angle to it, rarely flat on its side.
 *
 * **The pivot is the knees.** A body that is shot does not slide backwards
 * flat — the feet stay where they were standing and everything above them goes
 * over, so a fall that is not square to the round is a body that has *twisted*
 * about its own legs. That is why the legs keep the bearing of the round and
 * only the torso, head and arms swing: from above, the give-away that a corpse
 * fell diagonally is exactly that its legs point one way and its head another.
 *
 * `CORPSE_DIAGONAL_ARC` is half the arc, so 0.62 is a head that can land
 * anywhere across about 70 degrees.
 *
 * **It went 1 in 5 across 40 degrees to 2 in 5 across 70**, because at the
 * first figures most of what you saw was a street of bodies lying the same way
 * with the occasional one slightly off — the variation was there and it was not
 * doing any work. A body that fell hard over is now an ordinary sight rather
 * than something to notice.
 */
const CORPSE_DIAGONAL_CHANCE = 0.4;
export const CORPSE_DIAGONAL_ARC = 0.62;
/** Flat on its side. Rare on purpose — it is the one that catches the eye. */
const CORPSE_SIDEWAYS_CHANCE = 0.04;
/**
 * How far behind the body's centre the knees are, in body radii.
 *
 * Exported so a rig can measure the swing from the pivot the swing is about.
 * From anywhere else the head appears to move *further* than the tilt — it is
 * on the far end of a lever — which is right on screen and useless as a
 * reading.
 */
export const CORPSE_KNEE = 0.9;
/** A body seen edge-on is narrower across and its head is off the centre line. */
const CORPSE_SIDEWAYS_NARROW = 0.72;
const CORPSE_SIDEWAYS_HEAD_OFF = 0.2;

/**
 * Which of the three a given corpse is, and how far over it went.
 *
 * **Pure and exported so it can be measured without a canvas** — the same split
 * as `flameStreamSpine` against the flame, and `commandCardSlots` against the
 * card. A share of one in five is a claim about a distribution, which is a
 * thing to count over thousands of seeds rather than to squint at.
 *
 * Three independent draws off the one seed. They have to be independent or the
 * rare sideways fall arrives correlated with the diagonal one and stops being
 * its own event.
 */
export function corpsePose(seed: number): { tilt: number; sideways: boolean; sign: number } {
  const sideways = hash2(seed * 5.91 + 3.7, 2.71) < CORPSE_SIDEWAYS_CHANCE;
  const diagonal = hash2(seed * 13.77 + 1.3, 5.53) < CORPSE_DIAGONAL_CHANCE;
  const swing = hash2(seed * 3.13 + 2.9, 9.21) * 2 - 1;
  /*
   * **The swing is biased away from square, not flat across the arc.**
   *
   * A flat draw puts as many bodies within a couple of degrees of the centre
   * line as at the far edge — and one of those is indistinguishable from a body
   * that fell straight back, so a good share of the falls that were *meant* to
   * read as diagonal read as nothing at all. Cubing pushes the draw toward the
   * ends while leaving the sign alone, so the ones that go over mostly go over
   * far enough to see. A body on its side has gone as far as it can and takes
   * the same arc.
   */
  const swung = Math.sign(swing) * (1 - (1 - Math.abs(swing)) ** 3) * CORPSE_DIAGONAL_ARC;
  return {
    tilt: sideways || diagonal ? swung : 0,
    sideways,
    sign: hash2(seed * 7.77 + 4.2, 1.61) < 0.5 ? -1 : 1,
  };
}

/** The drawing as it was, for `setThreeLimbedCorpse`: bearing, length. */
const LEGACY_LIMBS: Array<[number, number]> = [
  [1.25, 1.45],
  [-1.7, 1.7],
  [2.5, 1.5],
  [-2.7, 1.6],
];

/** One limb, in the body's own frame: off the shoulder or the hip. */
export interface CorpseLimb {
  /** Bearing off `upper` for an arm, off `lower` for a leg. */
  angle: number;
  /** In body radii. */
  length: number;
  hip: boolean;
}

/**
 * Where a given body's four limbs ended up — two arms, then two legs.
 *
 * **Pure and exported so a claim about them can be measured**, the same split
 * as `corpsePose` beside it and `commandCardSlots` against the card. "The two
 * arms are the same length" is an exact statement about two numbers, and
 * reading it back off pixels — where an arm's drawn length has to be recovered
 * from a shoulder position and a bearing — would be answering it the hard way
 * and less certainly.
 *
 * **The lengths are drawn per pair and the angles per limb.** A person's arms
 * are the same length as each other; what a fall randomises is where they end
 * up pointing. Drawn independently, as they were, one arm could come out at
 * 1.15 radii and the other at 2.0 and the body read as deformed rather than
 * sprawled.
 */
export function corpseLimbs(
  seed: number,
  pose: { tilt: number; sideways: boolean; sign: number },
): CorpseLimb[] {
  const jit = (i: number): number => hash2(seed * 97 + i, i * 7.13 + 3.1) * 2 - 1;
  // One draw for both arms, one for both legs.
  const armLen = jit(10) * CORPSE_ARM_LEN_JITTER;
  const legLen = jit(11) * CORPSE_LEG_LEN_JITTER;
  const s = pose.sign;

  if (pose.sideways) {
    return [
      { angle: s * 0.95, length: CORPSE_SIDEWAYS_ARM_LEN + armLen * 0.55, hip: false },
      /*
       * **The far arm keeps its own bearing and takes the same length**, and it
       * is the length that has to be watched here rather than the pair. It
       * comes off the shoulder at a hundred degrees, so most of it is spent
       * going *back* across the body rather than out from it — at the short end
       * of the ordinary draw its tip finished barely past the torso and the arm
       * all but disappeared into it, which is the missing-arm complaint again
       * in a different pose. Measured: 1.03 body radii, against a torso 1.15
       * long. The pair's draw is damped rather than dropped, so the two stay
       * equal to each other and neither tucks away.
       */
      { angle: s * 1.85, length: CORPSE_SIDEWAYS_ARM_LEN + armLen * 0.55, hip: false },
      { angle: s * 2.62, length: CORPSE_LEG_LEN + legLen, hip: true },
      { angle: s * 2.88, length: CORPSE_LEG_LEN + legLen, hip: true },
    ];
  }
  return [
    { angle: 1.25 + jit(0) * CORPSE_ARM_JITTER, length: CORPSE_ARM_LEN + armLen, hip: false },
    { angle: -1.7 + jit(1) * CORPSE_ARM_JITTER, length: CORPSE_ARM_LEN + armLen, hip: false },
    { angle: 2.5 + jit(2) * CORPSE_LEG_JITTER, length: CORPSE_LEG_LEN + legLen, hip: true },
    { angle: -2.7 + jit(3) * CORPSE_LEG_JITTER, length: CORPSE_LEG_LEN + legLen, hip: true },
  ];
}

/**
 * A flat sprawled body — cheap enough to draw live and to bake.
 *
 * **Four limbs, and the fourth was simply missing.** It was written as three
 * strokes at deliberately mismatched angles — `a + 2.5`, `a - 1.7` and
 * `a - 2.7` — which is a left leg, a right arm and a right leg, and leaves the
 * whole forward-left quadrant empty. From above that does not read as a body
 * flung about; it reads as one with an arm torn off, and it was reported as
 * exactly that. The asymmetry that was wanted is in the *lengths and angles*,
 * not in the count.
 *
 * **The arms come off the shoulders and the legs off the hips**, rather than
 * three of the four coming off the middle. It costs nothing and it is what
 * makes an arm reach forward of the torso like an arm instead of coming out
 * level with the hips and reading as a third leg.
 *
 * **Every limb is hashed off the body's own seed, never rolled.** This is
 * called on every frame the corpse is on screen and once more when it is baked
 * into `stainLayer`; a `Math.random()` anywhere in here is a corpse whose arms
 * twitch until it settles and then jump as it is baked. Same rule and same
 * reason as the dog's saliva strands and the acid's churn.
 *
 * **And how it went down comes off the same seed** — see `corpsePose`. One in
 * five falls at an angle to the round, pivoting about the knees so the legs
 * keep the bearing they were shot along and the head swings off it; one in
 * twenty-five lands flat on its side, which from above is both arms out the
 * same side, both legs stacked, and a torso that has gone narrow because you
 * are looking at it edge-on.
 */
function drawSprawled(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  a: number,
  color: string,
  seed = 0,
): void {
  const r = ENTITY_RADIUS.zombie;
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  const pose = threeLimbedCorpse ? { tilt: 0, sideways: false, sign: 1 } : corpsePose(seed);
  // The half of the body that went over, and the half that stayed where it was
  // standing. They are the same bearing on four bodies in five.
  const upper = a + pose.tilt;
  const lower = a;

  /*
   * The knees, and the body swung about them.
   *
   * Everything above the pivot rotates: the torso, the head, the shoulders and
   * so the arms — while the legs keep the bearing of the round. Rotating the
   * *centre* about the pivot is all it takes, because every one of those is
   * placed off the centre along `upper` anyway.
   */
  const kneeX = x - ca * r * CORPSE_KNEE;
  const kneeY = y - sa * r * CORPSE_KNEE;
  const cx = kneeX + Math.cos(upper) * r * CORPSE_KNEE;
  const cy = kneeY + Math.sin(upper) * r * CORPSE_KNEE;
  const cu = Math.cos(upper);
  const su = Math.sin(upper);

  const shoulderX = cx + cu * r * 0.5;
  const shoulderY = cy + su * r * 0.5;
  const hipX = cx - cu * r * 0.42;
  const hipY = cy - su * r * 0.42;

  /*
   * Limbs flung at odd angles — a corpse's are not a matched pair. The base
   * bearings are the three the drawing always had plus the arm it was missing;
   * what each one does around its own is the seed's business.
   *
   * **A body on its side puts them all out the same way**, which is what it
   * looks like from above and is the whole of how that pose reads. The two arms
   * keep well apart from each other so they are plainly two arms rather than
   * one thick one — and the two legs are drawn close together, because a body
   * lying on its side has one leg on top of the other. The angle jitter comes
   * right down with them: at the ordinary spread a "stacked" pair of legs
   * scissors open and it stops reading as sideways.
   */
  const limbs = corpseLimbs(seed, pose);

  g.strokeStyle = shade(color, -18);
  g.lineCap = 'round';
  g.lineWidth = r * 0.36;
  g.beginPath();
  for (let i = 0; i < limbs.length; i++) {
    // The arm that was missing is the first entry, so gating it here is the
    // whole of the control.
    if (threeLimbedCorpse && i === 0) continue;
    const limb = limbs[i];
    const rootX = limb.hip ? hipX : shoulderX;
    const rootY = limb.hip ? hipY : shoulderY;
    // Arms off the half that went over, legs off the half that did not.
    const angle = (limb.hip ? lower : upper) + limb.angle;
    // The three it always had came off the middle; the old drawing is the
    // control, so it keeps its own roots and its own bearings.
    const ox = threeLimbedCorpse ? (i === 3 ? x - ca * r * 0.4 : x) : rootX;
    const oy = threeLimbedCorpse ? (i === 3 ? y - sa * r * 0.4 : y) : rootY;
    const at = threeLimbedCorpse ? a + LEGACY_LIMBS[i][0] : angle;
    const reach = r * (threeLimbedCorpse ? LEGACY_LIMBS[i][1] : limb.length);
    g.moveTo(ox, oy);
    g.lineTo(ox + Math.cos(at) * reach, oy + Math.sin(at) * reach);
  }
  g.stroke();
  // Torso, on the half of the body that went over. **Narrower on its side**:
  // the ellipse is a chest seen from above, and a chest seen edge-on is not as
  // wide. It is a small change and it is most of what tells the two apart at a
  // glance, the limbs being the other half.
  g.fillStyle = color;
  g.beginPath();
  g.ellipse(
    cx,
    cy,
    r * 1.15,
    r * 0.62 * (pose.sideways ? CORPSE_SIDEWAYS_NARROW : 1),
    upper,
    0,
    TAU,
  );
  g.fill();
  g.strokeStyle = shade(color, -28);
  g.lineWidth = 1;
  g.stroke();
  // Head, lolled forward off the shoulders — and off the centre line as well
  // for a body on its side, which is a head lying on its cheek.
  const off = pose.sideways ? pose.sign * CORPSE_SIDEWAYS_HEAD_OFF : 0;
  g.fillStyle = shade(color, 8);
  g.beginPath();
  g.arc(
    cx + cu * r * 1.05 - su * r * off,
    cy + su * r * 1.05 + cu * r * off,
    r * 0.44,
    0,
    TAU,
  );
  g.fill();
}

export function drawZombieCorpses(ctx: CanvasRenderingContext2D, view: Viewport, now: number): void {
  if (zombieCorpses.length === 0) return;
  const settleMs = CORPSE_SLIDE_MS + CORPSE_GREY_MS;
  let write = 0;
  for (let i = 0; i < zombieCorpses.length; i++) {
    const c = zombieCorpses[i];
    const age = now - c.born;
    const slide = Math.min(1, age / CORPSE_SLIDE_MS);
    const ease = 1 - (1 - slide) ** 3;
    const cx = c.x0 + Math.cos(c.a) * CORPSE_SLIDE_PX * ease;
    const cy = c.y0 + Math.sin(c.a) * CORPSE_SLIDE_PX * ease;

    if (age >= settleMs) {
      // Settled and grey: bake once and retire. `drawBlood` blits the layer,
      // and it ran before this — so draw the body one last time here too, an
      // exact match for what the blit will show next frame, or it blinks out
      // for one. Without the setting it just stops being drawn (main gates the
      // spawn, so this branch rarely trips).
      if (settings.corpses) {
        const sctx = ensureStainLayer();
        if (sctx) bakeInto(sctx, (g) => drawSprawled(g, cx, cy, c.a, CORPSE_COLOR, c.seed));
      }
      if (visible(view, cx, cy, ENTITY_RADIUS.zombie * 2)) {
        drawSprawled(ctx, cx, cy, c.a, CORPSE_COLOR, c.seed);
      }
      continue;
    }

    zombieCorpses[write++] = c;
    if (!visible(view, cx, cy, ENTITY_RADIUS.zombie * 2)) continue;
    const grey = Math.min(1, age / CORPSE_GREY_MS);
    drawSprawled(ctx, cx, cy, c.a, mix(ENTITY_COLOR.zombie, CORPSE_COLOR, grey), c.seed);
  }
  zombieCorpses.length = write;
}

/**
 * A body coming apart, rather than a round passing through one.
 *
 * **Nothing about the burst comes down the wire**, the same way nothing about
 * blood does. The host simply stops being in the snapshot, and the client — who
 * has been watching it convulse and knows how far through it was — throws the
 * gore itself. See the note in `syncTracked`.
 */
export function spawnBurst(x: number, y: number, now: number): void {
  for (let i = 0; i < BIRTH_BURST_SPOKES; i++) {
    spawnBlood(x, y, (i / BIRTH_BURST_SPOKES) * Math.PI * 2, now + i);
  }
}

/** A new city has none of the old one's blood, corpses or baked stains on it. */
export function clearBlood(): void {
  bloodDecals.length = 0;
  bloodDrops.length = 0;
  zombieCorpses.length = 0;
  clearStainLayer();
}

/**
 * The dried marks, under the bodies.
 *
 * Every visible *live* decal of a given age goes into **one path, filled
 * once** — two hundred separate translucent fills is the park's mistake again
 * in red. Four bands is enough for the fade to read as continuous. Everything
 * older has already dried into `stainLayer`, which is blitted first as a single
 * image: that is what keeps a whole round's worth of blood flat.
 */
export function drawBlood(ctx: CanvasRenderingContext2D, view: Viewport, now: number): void {
  // Turning permanence *and* corpses off is the cue to wipe the baked layer,
  // so the stains actually clear rather than freezing.
  const wantBake = settings.blood && (settings.permanentBlood || settings.corpses);
  if (!wantBake && stainDirty) clearStainLayer();

  // Retire dried marks *before* the blit, so a mark crossing into the baked
  // layer shows up on the same frame it left the live list rather than
  // flickering out for one. With permanence off they just vanish, as before.
  // Only touch the layer when there is actually something to retire — an
  // 18MB canvas should not be allocated the frame a round starts.
  const sctx = settings.permanentBlood && bloodDecals.length > 0 ? ensureStainLayer() : null;
  let write = 0;
  for (let i = 0; i < bloodDecals.length; i++) {
    const d = bloodDecals[i];
    if (now - d.born < BLOOD_DECAL_MS) {
      bloodDecals[write++] = d;
    } else if (sctx) {
      bakeDecal(sctx, d);
    }
  }
  bloodDecals.length = write;

  // The dried layer, blitted for just the sub-rect on screen. `ctx` is inside
  // the world transform, so the destination is world coordinates.
  if (stainDirty && stainLayer) {
    const s = BLOOD_BAKE_SCALE;
    const sx = Math.max(0, Math.floor(view.x * s));
    const sy = Math.max(0, Math.floor(view.y * s));
    const sw = Math.min(stainLayer.width - sx, Math.ceil(view.w * s) + 2);
    const sh = Math.min(stainLayer.height - sy, Math.ceil(view.h * s) + 2);
    if (sw > 0 && sh > 0) {
      const smooth = ctx.imageSmoothingEnabled;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(stainLayer, sx, sy, sw, sh, sx / s, sy / s, sw / s, sh / s);
      ctx.imageSmoothingEnabled = smooth;
    }
  }

  if (bloodDecals.length === 0) return;

  for (let band = 0; band < BLOOD_BANDS; band++) {
    let any = false;
    ctx.beginPath();
    for (const d of bloodDecals) {
      const age = (now - d.born) / BLOOD_DECAL_MS;
      if (Math.min(BLOOD_BANDS - 1, Math.floor(age * BLOOD_BANDS)) !== band) continue;
      if (!visible(view, d.x, d.y, Math.max(d.rx, d.ry) + 4)) continue;
      decalPath(ctx, d);
      any = true;
    }
    if (!any) continue;
    // Fresh is nearly opaque and wet-looking; old is a stain, ending at the
    // same alpha the baked layer holds it at.
    const t = band / (BLOOD_BANDS - 1);
    ctx.globalAlpha = 0.62 - t * (0.62 - BLOOD_DRIED_ALPHA);
    ctx.fillStyle = BLOOD_COLOR;
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/** The wet part: droplets in the air, over the bodies. */
export function drawBloodSpray(ctx: CanvasRenderingContext2D, now: number): void {
  if (bloodDrops.length === 0) return;

  let write = 0;
  ctx.strokeStyle = '#7f1416';
  ctx.lineCap = 'round';
  for (let i = 0; i < bloodDrops.length; i++) {
    const drop = bloodDrops[i];
    const age = now - drop.born;
    if (age >= BLOOD_SPRAY_MS) continue;
    bloodDrops[write++] = drop;

    // Thrown, and slowing. Drawn as a streak along its own velocity, which is
    // what separates a droplet in flight from a dot.
    const t = age / 1000;
    const drag = Math.exp(-t * 4.5);
    const px = drop.x + drop.vx * ((1 - drag) / 4.5);
    const py = drop.y + drop.vy * ((1 - drag) / 4.5);
    const life = 1 - age / BLOOD_SPRAY_MS;
    ctx.globalAlpha = life * 0.85;
    ctx.lineWidth = 0.8 + life * 1.6;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px - drop.vx * drag * 0.014, py - drop.vy * drag * 0.014);
    ctx.stroke();
  }
  bloodDrops.length = write;
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------- vignette
/**
 * The corners go dark. Built once at viewport size and blitted, rather than
 * rebuilt per frame — a gradient allocation plus a full-screen translucent fill
 * every frame is a real cost for something that never changes.
 */
let vignetteLayer: HTMLCanvasElement | null = null;

/**
 * Going down, and coming back.
 *
 * Deliberately *not* a straight ramp across the death window. You watch your own
 * animal fall and grey out for the first `DOG_FADE_FROM` of it — which is the
 * whole reason the body stays in the world at all — and only then does the
 * screen start to go. Coming back is quicker than going, because waking up
 * somewhere else wants to be abrupt.
 */
export function drawDeathFade(
  ctx: CanvasRenderingContext2D,
  dying: number,
  sinceAlive: number,
  vw: number,
  vh: number,
): void {
  let alpha = 0;
  if (dying >= 0) {
    alpha = Math.max(0, (dying - DOG_FADE_FROM) / (1 - DOG_FADE_FROM));
  } else if (sinceAlive >= 0 && sinceAlive < DOG_RESPAWN_FADE_MS) {
    alpha = 1 - sinceAlive / DOG_RESPAWN_FADE_MS;
  }
  if (alpha <= 0) return;
  ctx.fillStyle = `rgba(0, 0, 0, ${Math.min(1, alpha)})`;
  ctx.fillRect(0, 0, vw, vh);
}

export function drawVignette(ctx: CanvasRenderingContext2D, vw: number, vh: number): void {
  if (!settings.vignette) return;
  if (!vignetteLayer || vignetteLayer.width !== vw || vignetteLayer.height !== vh) {
    const layer = document.createElement('canvas');
    layer.width = vw;
    layer.height = vh;
    const g = layer.getContext('2d');
    if (!g) return;
    const outer = Math.hypot(vw, vh) / 2;
    const gradient = g.createRadialGradient(vw / 2, vh / 2, outer * VIGNETTE_INNER, vw / 2, vh / 2, outer);
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
    gradient.addColorStop(0.7, `rgba(6, 5, 4, ${VIGNETTE_ALPHA * 0.42})`);
    gradient.addColorStop(1, `rgba(6, 5, 4, ${VIGNETTE_ALPHA})`);
    g.fillStyle = gradient;
    g.fillRect(0, 0, vw, vh);
    vignetteLayer = layer;
  }
  ctx.drawImage(vignetteLayer, 0, 0);
}

// ------------------------------------------------------------------ dog HUD
/**
 * What a dog is told, in place of the slot bar it has no use for.
 *
 * Two readouts and they answer different questions: the jaws say *can I bite
 * yet*, and the hold says *how much longer must I stay on this one*. The second
 * one is the whole mechanic — the shaded part of it is what shaking has already
 * torn off, so worrying at somebody visibly eats the bar rather than merely
 * making it run down faster, which nobody could tell apart from waiting.
 */
/**
 * The dog's ability row: four hexagons on Q, E, R and F, left to right.
 *
 * **The empty ones are drawn.** Three of the four have nothing in them today,
 * and a bar that grew a hexagon at a time would shift the keys already on it
 * every time one was filled — the whole value of a fixed row is that a key is
 * always in the same place, and an outline says "there will be something here"
 * where a gap says nothing at all.
 *
 * Each filled one carries three readings and they are deliberately separate:
 * the **key letter** is what you press, the **recharge** fills the hexagon from
 * the bottom, and the **charge count** in the corner is how many bodies the
 * next press is worth. That last one is the only number on a dog's HUD that
 * goes *up*, which is why it is a badge rather than a bar — a bar implies a
 * ceiling and there isn't one.
 */
const DOG_HEX_R = 22;
const DOG_HEX_GAP = 10;
/**
 * Centre of the row, measured up from the bottom of the viewport.
 *
 * Set against the *charge badge*, not the hexagon: the badge hangs below the
 * hexagon's bottom vertex, and at 64 it cleared the jaws bar's backdrop by two
 * pixels — measured, not guessed. The three rows want daylight between them or
 * they read as one block.
 */
const DOG_HEX_UP = 72;
/**
 * How far a dog's stamina bar is raised to clear the row.
 *
 * The one place the dog's HUD stack is decided — `drawStamina` is shared with
 * the officers and has no business knowing about hexagons.
 */
export const DOG_HUD_STAMINA_LIFT = 54;

/** A flat-top hexagon: a row of them reads as a row, where pointy-top does not. */
function hexPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    const px = cx + Math.cos(a) * r;
    const py = cy + Math.sin(a) * r * 0.866;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

/** Kept in step with `DOG_ABILITY_KEYS` in `main.ts` — see the note there. */
const DOG_ABILITY_KEY_CAPS = ['Q', 'E', 'R', 'F'];

function drawDogAbilities(
  ctx: CanvasRenderingContext2D,
  dog: DogHud,
  vw: number,
  vh: number,
  now: number,
): void {
  const slots = dog.abilities.length;
  if (slots === 0) return;
  const pitch = DOG_HEX_R * 2 + DOG_HEX_GAP;
  const cy = vh - DOG_HEX_UP;
  const x0 = vw / 2 - ((slots - 1) * pitch) / 2;
  /** Half the hexagon's height. Flat-top, so it is shorter than it is wide. */
  const half = DOG_HEX_R * 0.866;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (let i = 0; i < slots; i++) {
    const cx = x0 + i * pitch;
    const ability = dog.abilities[i];

    // The well, always. An empty slot is this and an outline, and nothing else.
    hexPath(ctx, cx, cy, DOG_HEX_R);
    ctx.fillStyle = ability ? 'rgba(0, 0, 0, 0.66)' : 'rgba(0, 0, 0, 0.42)';
    ctx.fill();

    if (!ability) {
      // Nothing in it. A dashed outline and a dim letter: the key exists and
      // does nothing, which is a different thing from the key not existing.
      hexPath(ctx, cx, cy, DOG_HEX_R);
      ctx.lineWidth = 1.2;
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = 'rgba(120, 113, 108, 0.7)';
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(120, 113, 108, 0.75)';
      ctx.font = 'bold 12px system-ui, sans-serif';
      ctx.fillText(DOG_ABILITY_KEY_CAPS[i] ?? '', cx, cy);
      continue;
    }

    // **Locked is not the same as recharging**, and it must not look like it.
    // A cooldown fills and comes good on its own; this one only moves when you
    // bite somebody, so it is drawn cold — no amber fill, a dashed outline like
    // an empty slot, and the number of people still to turn where the charge
    // badge goes. That count *is* the instruction: it says the ability exists,
    // that it is earned, and exactly how much further there is to go.
    if (ability.locked > 0) {
      hexPath(ctx, cx, cy, DOG_HEX_R);
      ctx.lineWidth = 1.4;
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = 'rgba(120, 113, 108, 0.85)';
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = 'rgba(168, 162, 158, 0.85)';
      ctx.font = 'bold 14px system-ui, sans-serif';
      ctx.fillText(DOG_ABILITY_KEY_CAPS[i] ?? '', cx, cy - 5);
      ctx.font = 'bold 7px system-ui, sans-serif';
      ctx.fillText(ability.name, cx, cy + 9);

      const bx = cx + DOG_HEX_R * 0.66;
      const by = cy + half - 1;
      ctx.beginPath();
      ctx.arc(bx, by, 8, 0, TAU);
      ctx.fillStyle = '#292524';
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(168, 162, 158, 0.8)';
      ctx.stroke();
      ctx.fillStyle = '#d6d3d1';
      ctx.font = 'bold 9px system-ui, sans-serif';
      ctx.fillText(String(Math.min(99, ability.locked)), bx, by + 0.5);
      continue;
    }

    const ready = ability.ready >= 1;
    const running = ability.active >= 0;

    // Two fills, and they are deliberately different colours running in the
    // same direction: "the two seconds are passing" and "it is recharging" are
    // opposite states, and a single treatment for both would be read wrong in
    // exactly the moment that matters.
    const fill = running
      ? Math.max(0, Math.min(1, ability.active))
      : Math.max(0, Math.min(1, ability.ready));
    if (running || !ready) {
      ctx.save();
      hexPath(ctx, cx, cy, DOG_HEX_R);
      ctx.clip();
      ctx.fillStyle = running ? 'rgba(153, 27, 27, 0.9)' : 'rgba(120, 53, 15, 0.75)';
      ctx.fillRect(cx - DOG_HEX_R, cy + half - half * 2 * fill, DOG_HEX_R * 2, half * 2 * fill);
      ctx.restore();
    }

    hexPath(ctx, cx, cy, DOG_HEX_R);
    ctx.lineWidth = running ? 2.4 : 1.6;
    if (running) {
      const pulse = 0.75 + Math.sin(now * 0.02) * 0.25;
      ctx.strokeStyle = 'rgba(248, 113, 113, ' + pulse.toFixed(2) + ')';
    } else {
      ctx.strokeStyle = ready ? '#f87171' : '#57534e';
    }
    ctx.stroke();

    ctx.fillStyle = running ? '#fff1f2' : ready ? '#fecaca' : '#a8a29e';
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.fillText(DOG_ABILITY_KEY_CAPS[i] ?? '', cx, cy - 5);
    ctx.font = 'bold 7px system-ui, sans-serif';
    ctx.fillText(ability.name, cx, cy + 9);

    // Charges, in the corner the way a magazine count sits on a slot. Only
    // when there are any: a nought on every hexagon every round is noise, and
    // the badge appearing is itself the news that the ability now does more.
    if (ability.charges > 0) {
      const bx = cx + DOG_HEX_R * 0.66;
      const by = cy + half - 1;
      ctx.beginPath();
      ctx.arc(bx, by, 8, 0, TAU);
      ctx.fillStyle = '#7f1d1d';
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = '#fca5a5';
      ctx.stroke();
      ctx.fillStyle = '#fee2e2';
      ctx.font = 'bold 9px system-ui, sans-serif';
      ctx.fillText(String(Math.min(99, ability.charges)), bx, by + 0.5);
    }
  }

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

/**
 * The dog's corner map.
 *
 * **The city is painted once and blitted after that**, which is the whole
 * reason this can sit on screen every frame of a dog's round. Drawn live it is
 * ~90 building footprints, a park, a pond and a border — a couple of hundred
 * `fillRect`s and a 48-segment path — and the animal driving it is the one
 * connection in the game that already pays the most per frame. Baked, the
 * per-frame cost is one `drawImage` and a handful of two-pixel dots. Same trick
 * as `grimeTile` and the vignette, and the same reason: nothing in it moves.
 *
 * Keyed on the `MapData` object itself rather than on its seed or its size. A
 * restart hands the client a brand new object and the identity check catches
 * that for free, where a seed comparison is a thing that can be forgotten.
 */
let dogMapBase: HTMLCanvasElement | null = null;
let dogMapFor: MapData | null = null;
let dogMapScale = 1;

function dogMapBaseFor(map: MapData): HTMLCanvasElement | null {
  if (dogMapBase && dogMapFor === map) return dogMapBase;

  // One box whatever the city's shape — a small city comes out smaller rather
  // than stretched. See **The city is not one size**.
  const scale = DOG_MAP_SIZE / Math.max(map.width, map.height);
  const w = Math.round(map.width * scale);
  const h = Math.round(map.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const c = canvas.getContext('2d');
  if (!c) return null;

  const wx = (v: number): number => v * scale;
  const wy = (v: number): number => v * scale;

  // Ground, then the two landmarks, then the buildings over them — the same
  // order and the same palette the beacon map uses, darkened, because this one
  // is read out of the corner of the eye rather than stopped for.
  c.fillStyle = '#191714';
  c.fillRect(0, 0, w, h);

  c.fillStyle = '#232b1c';
  c.fillRect(wx(map.park.x), wy(map.park.y), map.park.w * scale, map.park.h * scale);

  c.fillStyle = '#17273a';
  c.beginPath();
  for (let i = 0; i <= 48; i++) {
    const a = (i / 48) * TAU;
    const r = pondRadiusAt(map.pond, a) * scale;
    const px = wx(map.pond.x) + Math.cos(a) * r;
    const py = wy(map.pond.y) + Math.sin(a) * r;
    if (i === 0) c.moveTo(px, py);
    else c.lineTo(px, py);
  }
  c.closePath();
  c.fill();

  // Real footprints, not bounding boxes: about one building in three is L or T
  // shaped, and it is the *streets between them* that make a map readable.
  c.fillStyle = '#3b3730';
  for (const b of map.buildings) {
    for (const r of b.rects) c.fillRect(wx(r.x), wy(r.y), r.w * scale, r.h * scale);
  }

  dogMapBase = canvas;
  dogMapFor = map;
  dogMapScale = scale;
  return canvas;
}

/** Drop the baked map. Called on a new city, beside `clearDogPoses`. */
export function clearDogMap(): void {
  dogMapBase = null;
  dogMapFor = null;
}

export function drawDogMap(
  ctx: CanvasRenderingContext2D,
  map: MapData,
  self: { x: number; y: number } | null,
  contacts: Array<{ x: number; y: number }>,
  vw: number,
  vh: number,
): void {
  const base = dogMapBaseFor(map);
  if (!base) return;

  // Bottom left: the counts are top left, the perf readout is top right, and
  // the dog's own bars run up the middle from the bottom.
  const x = DOG_MAP_MARGIN;
  const y = vh - DOG_MAP_MARGIN - base.height;
  const scale = dogMapScale;

  ctx.save();
  ctx.globalAlpha = 0.82;
  ctx.drawImage(base, x, y);
  ctx.globalAlpha = 1;

  ctx.strokeStyle = 'rgba(120, 113, 108, 0.8)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, base.width - 1, base.height - 1);

  // **Contacts, drawn in one path.** A fill and a stroke per dot is two state
  // changes per officer for a mark two pixels across; one path filled once is
  // the same lesson `drawBushes` and the blood decals both learned.
  if (contacts.length > 0) {
    ctx.beginPath();
    for (const c of contacts) {
      const cx = x + c.x * scale;
      const cy = y + c.y * scale;
      ctx.moveTo(cx + 2.6, cy);
      ctx.arc(cx, cy, 2.6, 0, TAU);
    }
    ctx.fillStyle = '#60a5fa';
    ctx.fill();
  }

  // You, last and largest, so the map is read against where you are standing.
  // A ring rather than a dot: at this size a second blue-ish blob among the
  // contacts is one more thing to pick out rather than the thing to pick out.
  if (self) {
    const cx = x + self.x * scale;
    const cy = y + self.y * scale;
    ctx.beginPath();
    ctx.arc(cx, cy, 3.4, 0, TAU);
    ctx.fillStyle = '#ef4444';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy, 5.6, 0, TAU);
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.65)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }

  ctx.restore();
}

export function drawDogHud(
  ctx: CanvasRenderingContext2D,
  dog: DogHud,
  vw: number,
  vh: number,
  now: number,
): void {
  drawDogAbilities(ctx, dog, vw, vh, now);

  const w = 220;
  const h = 12;
  const x = (vw - w) / 2;
  const y = vh - 34;

  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.fillRect(x - 2, y - 2, w + 4, h + 4);

  // What is left of the horde to come back out of — this dog's lives, and the
  // only number on the HUD that only ever goes down. Beside the bar rather than
  // in it: it is not a thing that fills.
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'right';
  ctx.fillStyle = dog.hosts > 6 ? '#94a3b8' : dog.hosts > 0 ? '#fbbf24' : '#ef4444';
  ctx.fillText(`${dog.hosts} LEFT TO RISE FROM`, x - 10, y + h / 2);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  if (dog.latched) {
    // What is left of the bite, and how much of it was shaken off. The shaken
    // part is drawn as ground already taken, beyond the live bar.
    const held = Math.max(0, Math.min(1, dog.hold));
    const shaken = Math.max(0, Math.min(1 - held, dog.shaken));
    ctx.fillStyle = '#7f1d1d';
    ctx.fillRect(x + w * held, y, w * shaken, h);
    ctx.fillStyle = '#dc2626';
    ctx.fillRect(x, y, w * held, h);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.font = 'bold 10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('SHAKE — MOVE THE MOUSE', vw / 2, y + h / 2);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    return;
  }

  // Jaws open: how much of the window is left, draining. Its own reading and
  // its own colour, because "how long can I hold this" and "when may I open it
  // again" are opposite questions and one bar answering both gets read wrong in
  // the half-second that matters.
  if (dog.jawsOpen >= 0) {
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(x, y, w * Math.max(0, Math.min(1, dog.jawsOpen)), h);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
    ctx.font = 'bold 10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('JAWS OPEN — RUN THEM DOWN', vw / 2, y + h / 2);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    return;
  }

  // **Mid-ability, the jaws are not ready whatever the cooldown says.**
  // `jawsTick` does not run during a roar, so left click does nothing — and a
  // bar reading "JAWS READY — HOLD LEFT CLICK" while the button is inert is the
  // HUD telling a lie about the one control it is there to explain.
  const busy = dog.abilities.find((a) => a !== null && a.active >= 0);
  if (busy) {
    ctx.fillStyle = '#57534e';
    ctx.fillRect(x, y, w * Math.max(0, Math.min(1, busy.active)), h);
    ctx.fillStyle = 'rgba(254, 226, 226, 0.9)';
    ctx.font = 'bold 10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${busy.name}…`, vw / 2, y + h / 2);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    return;
  }

  const ready = dog.bite >= 1;
  ctx.fillStyle = ready ? '#ca8a04' : '#57534e';
  ctx.fillRect(x, y, w * Math.max(0, Math.min(1, dog.bite)), h);
  if (ready) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.font = 'bold 10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('JAWS READY — HOLD LEFT CLICK', vw / 2, y + h / 2);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }
}

export interface Tracer {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Flame draws as a thick stream rather than a round's thin line. */
  kind?: ShotKind;
  hit: boolean;
  born: number;
  /** Flame only: which shooter's stream this pull belongs to. */
  who?: string;
}

/**
 * A hose, not a volley.
 *
 * **A pull of the trigger is a parcel of fuel, not a line.** That is the whole
 * of this. Each pull used to draw its own full-length stream from the nozzle to
 * where it landed, so holding the trigger and sweeping put six independent
 * straight streams on screen at six different bearings — a fan of ribs, which
 * is exactly what it looked like. Nothing about it could bend, because every
 * rib was drawn as a straight chord of its own.
 *
 * What is actually in the air at any instant is the fuel from the last few
 * pulls, each at a different distance and each launched on a different bearing.
 * Join those and you get a *curve*: the newest fuel at the nozzle on the
 * current bearing, the oldest out at the far end on the bearing from a third of
 * a second ago. Sweep and the stream trails behind the crosshair and bends,
 * the way water out of a hose does. Hold still and the curve straightens by
 * itself — no special case, the parcels simply line up.
 *
 * One vertex per parcel is only four or five points, so the polyline is
 * resampled through a Catmull-Rom spline before anything is drawn; joining
 * them with straight segments puts a visible kink at every pull.
 */
interface FlameVertex {
  x: number;
  y: number;
  /** Where it is on the ground, before the arc lifts it. For the shadow. */
  gy: number;
  /** This parcel's own fade, so the tip burns out ahead of the throat. */
  fade: number;
}

/** Where one parcel's fuel has got to along its own chord, `t` in 0..1. */
function flameVertex(tracer: Tracer, t: number, now: number): FlameVertex {
  const dx = tracer.x2 - tracer.x1;
  const dy = tracer.y2 - tracer.y1;
  const len = Math.hypot(dx, dy) || 1;

  // The lift is screen-space, so it only reads as *height* when it is across
  // the line of travel. Fired straight up or down the screen it is along that
  // line instead, where the same arc stops looking like height and starts
  // looking like the stream falling short. So most of it comes out.
  const uprightness = Math.abs(dx) / len; // 1 firing sideways, 0 firing up or down
  const lift =
    FLAME_ARC_LIFT *
    Math.min(1, len / FLAME_RANGE) *
    (FLAME_ARC_VERTICAL_MIN + (1 - FLAME_ARC_VERTICAL_MIN) * uprightness);

  const gx = tracer.x1 + dx * t;
  const gy = tracer.y1 + dy * t;
  const age = Math.min(1, (now - tracer.born) / FLAME_TRACER_MS);
  return {
    x: gx,
    // An arc, peaking midway along the parcel's own throw and coming back down.
    y: gy - Math.sin(Math.PI * t) * lift,
    gy,
    fade: (1 - age) ** 1.4,
  };
}

const catmull = (p0: number, p1: number, p2: number, p3: number, t: number): number => {
  const t2 = t * t;
  return (
    0.5 *
    (2 * p1 +
      (p2 - p0) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t2 * t)
  );
};

/** How far along its own chord one parcel's fuel has got, 0..1. */
const flameHead = (tracer: Tracer, now: number): number =>
  Math.min(1, (now - tracer.born) / FLAME_TRAVEL_MS);

/**
 * The spine of one shooter's stream, nozzle first: the fuel from every pull of
 * theirs still in the air, in the order it comes off the nozzle.
 *
 * Exported because it *is* the shape — whether the thing bends and whether it
 * is continuous are both properties of this list, and both are worth being able
 * to measure without a canvas. `group` must arrive newest first.
 */
export function flameStreamSpine(group: Tracer[], now: number): FlameVertex[] {
  // The nozzle end is where the newest slug's *tail* has got to. While the
  // trigger is down that is still at the muzzle, so the stream stays joined to
  // the officer; let go and it advances, and the stream pulls away from the
  // nozzle the way the last of the water does.
  const newest = group[0];
  const tailT = Math.max(0, Math.min(1, (now - newest.born - FLAME_SLUG_MS) / FLAME_TRAVEL_MS));

  const verts: FlameVertex[] = [flameVertex(newest, tailT, now)];
  for (const tracer of group) {
    const head = flameHead(tracer, now);
    const v = flameVertex(tracer, head, now);
    const last = verts[verts.length - 1];
    // A duplicate vertex gives the spline nothing to work with and can send it
    // off sideways, so near-coincident parcels are folded together.
    if (Math.hypot(v.x - last.x, v.y - last.y) > 1.5) verts.push(v);
    // Fuel that has landed is ground fire, not stream. The first one to have
    // arrived anchors the tip at the impact; everything older than it has
    // arrived too, and drops out of the stream entirely — leaving it hanging
    // in the air is what would drag the tip round to wherever you were
    // pointing half a second ago.
    if (head >= 1) break;
  }
  return verts;
}

/**
 * One shooter's stream: every pull of theirs still in the air, joined nozzle to
 * tip. `group` arrives newest first.
 */
function drawFlameStream(ctx: CanvasRenderingContext2D, group: Tracer[], now: number): void {
  const newest = group[0];
  const verts = flameStreamSpine(group, now);

  if (verts.length >= 2) {
    let length = 0;
    for (let i = 1; i < verts.length; i++) {
      length += Math.hypot(verts[i].x - verts[i - 1].x, verts[i].y - verts[i - 1].y);
    }
    const steps = Math.max(6, Math.min(96, Math.round(length / FLAME_STREAM_STEP)));

    // Resample the spline once, then draw every layer off the same points.
    const pts: FlameVertex[] = [];
    const n = verts.length;
    for (let s = 0; s <= steps; s++) {
      const f = (s / steps) * (n - 1);
      const i = Math.min(n - 2, Math.floor(f));
      const t = f - i;
      const p0 = verts[Math.max(0, i - 1)];
      const p1 = verts[i];
      const p2 = verts[i + 1];
      const p3 = verts[Math.min(n - 1, i + 2)];
      pts.push({
        x: catmull(p0.x, p1.x, p2.x, p3.x, t),
        y: catmull(p0.y, p1.y, p2.y, p3.y, t),
        gy: catmull(p0.gy, p1.gy, p2.gy, p3.gy, t),
        fade: p1.fade + (p2.fade - p1.fade) * t,
      });
    }

    const seed = (newest.x1 * 13 + newest.y1 * 7) % 628;
    const churnAt = (i: number) => Math.sin(seed + i * 1.9 + (now / 90) % 628);
    /**
     * How fat the stream is at `u`. Narrow at the nozzle where the fuel is
     * still under pressure, spreading and breaking up as it slows — a cone,
     * not a sausage. Fattest-in-the-middle read as a thrown blob.
     */
    const widthAt = (u: number) => FLAME_MOUTH_WIDTH + FLAME_TIP_WIDTH * u;

    // The shadow first, flat on the ground and directly under the arc, so the
    // lift reads as height rather than as the stream being aimed off to one
    // side.
    ctx.fillStyle = '#000';
    for (let i = 0; i < pts.length; i += 3) {
      const p = pts[i];
      const r = FLAME_BLOB_RADIUS * widthAt(i / steps) * 0.7;
      ctx.globalAlpha = 0.16 * p.fade;
      ctx.beginPath();
      ctx.ellipse(p.x, p.gy, r, r * 0.38, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Then the stream: dull red body, orange middle, near-white core. The core
    // is only near the nozzle — that is where the fuel is freshest and
    // hottest, and letting it run the whole length made this read as a solid
    // bar of light rather than something burning as it travels.
    for (const [scale, colour, reach] of [
      [1, 'rgba(220, 38, 38, 0.5)', 1],
      [0.6, 'rgba(251, 146, 60, 0.72)', 0.78],
      [0.26, 'rgba(254, 240, 138, 0.95)', 0.4],
    ] as Array<[number, string, number]>) {
      ctx.fillStyle = colour;
      for (let i = 0; i < pts.length; i++) {
        const u = i / steps;
        // Each layer stops short of the last, so the tip is red and smoky and
        // the throat is white.
        const within = 1 - Math.min(1, u / reach);
        if (within <= 0) continue;
        const p = pts[i];

        // Wobble across the stream, widening downrange, so the edge is ragged
        // — taken from the local tangent rather than from one fixed bearing,
        // since the stream is a curve now and has no single direction.
        const prev = pts[Math.max(0, i - 1)];
        const next = pts[Math.min(pts.length - 1, i + 1)];
        const tx = next.x - prev.x;
        const ty = next.y - prev.y;
        const tl = Math.hypot(tx, ty) || 1;
        const wob = churnAt(i) * 4.2 * u;

        const r = FLAME_BLOB_RADIUS * widthAt(u) * scale * (0.35 + 0.65 * within);
        ctx.globalAlpha = p.fade * (0.5 + 0.5 * within);
        ctx.beginPath();
        ctx.arc(p.x + (-ty / tl) * wob, p.y + (tx / tl) * wob, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // And the splash where each parcel came down, thrown further out as it ages
  // so it spreads rather than sitting still and fading. Swept, that leaves an
  // arc of impacts along the ground, which is right — it is where the fire
  // actually went.
  //
  // It fans *back* toward the shooter, not on past the impact. The endpoint is
  // already hard against whatever stopped the stream, so anything thrown
  // forward from it is drawn through a wall — and splashback off the thing you
  // just hit is the truer picture anyway.
  for (const tracer of group) {
    if (flameHead(tracer, now) < 1) continue; // nothing splashes before the fuel arrives
    const elapsed = now - tracer.born;
    const fade = (1 - Math.min(1, elapsed / FLAME_TRACER_MS)) ** 1.4;
    const settle = Math.min(
      1,
      (elapsed - FLAME_TRAVEL_MS) / Math.max(1, FLAME_TRACER_MS - FLAME_TRAVEL_MS),
    );
    const seed = (tracer.x1 * 13 + tracer.y1 * 7) % 628;
    const aim = Math.atan2(tracer.y2 - tracer.y1, tracer.x2 - tracer.x1) + Math.PI;
    for (let k = 0; k < 3; k++) {
      const a = aim + ((k + 0.5) / 3 - 0.5) * 1.7;
      const d = 10 + ((seed + k * 37) % 9) + settle * 22;
      ctx.globalAlpha = fade * 0.8;
      ctx.fillStyle = k === 1 ? '#fde047' : '#fb923c';
      ctx.beginPath();
      ctx.arc(
        tracer.x2 + Math.cos(a) * d,
        tracer.y2 + Math.sin(a) * d,
        6 * (1 - settle * 0.45),
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
  }
}

export function drawTracers(
  ctx: CanvasRenderingContext2D,
  tracers: Tracer[],
  now: number,
  lifetime: number,
): void {
  ctx.lineCap = 'butt';

  // Napalm is gathered rather than drawn pull by pull: one shooter's pulls are
  // one stream, and drawing them separately is what put a fan of straight ribs
  // on screen instead of a hose. Keyed by shooter so two flamethrowers side by
  // side don't get spliced into each other's streams; `who` is only sent for
  // flame, and a stream with none falls back to a single shared group, which is
  // the old spectator-replay case and no worse than it was.
  let streams: Map<string, Tracer[]> | null = null;
  for (const tracer of tracers) {
    if (tracer.kind !== 'flame') continue;
    if (now - tracer.born >= FLAME_TRACER_MS) continue;
    streams ??= new Map();
    const key = tracer.who ?? '';
    const group = streams.get(key);
    if (group) group.push(tracer);
    else streams.set(key, [tracer]);
  }
  if (streams) {
    for (const group of streams.values()) {
      // Newest first: that end of the list is the nozzle.
      group.sort((a, b) => b.born - a.born);
      drawFlameStream(ctx, group, now);
    }
  }

  for (const tracer of tracers) {
    if (tracer.kind === 'flame') continue; // gathered into streams above
    const age = (now - tracer.born) / lifetime;
    if (age >= 1) continue;

    ctx.globalAlpha = 1 - age;
    ctx.strokeStyle = '#fde68a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(tracer.x1, tracer.y1);
    ctx.lineTo(tracer.x2, tracer.y2);
    ctx.stroke();

    if (tracer.hit) {
      ctx.fillStyle = '#fca5a5';
      ctx.beginPath();
      ctx.arc(tracer.x2, tracer.y2, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

/**
 * Edge arrows pointing at the last surviving humans. Anything already on
 * screen gets a soft ring instead of an arrow.
 */
export function drawBeacons(
  ctx: CanvasRenderingContext2D,
  beacons: Array<{ x: number; y: number }>,
  view: Viewport,
  scale: number,
  vw: number,
  vh: number,
): void {
  const margin = 26;
  const cx = vw / 2;
  const cy = vh / 2;

  for (const beacon of beacons) {
    const sx = (beacon.x - view.x) * scale;
    const sy = (beacon.y - view.y) * scale;

    if (sx >= 0 && sx <= vw && sy >= 0 && sy <= vh) {
      ctx.strokeStyle = 'rgba(134, 239, 172, 0.7)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sx, sy, 20, 0, Math.PI * 2);
      ctx.stroke();
      continue;
    }

    const angle = Math.atan2(sy - cy, sx - cx);
    // Push out to the viewport edge along that bearing.
    const halfW = cx - margin;
    const halfH = cy - margin;
    const scaleToEdge = Math.min(
      halfW / Math.max(1e-3, Math.abs(Math.cos(angle))),
      halfH / Math.max(1e-3, Math.abs(Math.sin(angle))),
    );
    const ax = cx + Math.cos(angle) * scaleToEdge;
    const ay = cy + Math.sin(angle) * scaleToEdge;

    ctx.save();
    ctx.translate(ax, ay);
    ctx.rotate(angle);
    ctx.fillStyle = '#4ade80';
    ctx.beginPath();
    ctx.moveTo(11, 0);
    ctx.lineTo(-8, -7);
    ctx.lineTo(-8, 7);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

/**
 * `lift` is how far to raise the bar off its usual place, in pixels.
 *
 * A dog has no inventory row under it but it does have a row of ability
 * hexagons, which is taller — so the whole stack sits higher on a dog than on
 * an officer. Passed in rather than worked out here, because this function has
 * no business knowing what is being driven; `DOG_HUD_STAMINA_LIFT` is the one
 * place the dog's layout is decided.
 */
export function drawStamina(
  ctx: CanvasRenderingContext2D,
  stamina: number,
  max: number,
  vw: number,
  vh: number,
  exhausted = false,
  lift = 0,
  recoveryThreshold = 75,
): void {
  const w = 180;
  const h = 8;
  const x = (vw - w) / 2;
  // Just above the inventory row, which occupies vh-46 upward.
  const y = vh - 58 - lift;
  const pct = Math.max(0, Math.min(1, stamina / max));

  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2);

  // Locked out after a full drain: bar goes red until it refills past the mark.
  ctx.fillStyle = exhausted ? '#dc2626' : pct > 0.25 ? '#38bdf8' : '#f59e0b';
  ctx.fillRect(x, y, w * pct, h);

  if (exhausted) {
    const markX = x + w * (recoveryThreshold / max);
    ctx.fillStyle = '#fbbf24';
    ctx.fillRect(markX - 1, y - 2, 2, h + 4);
  }
}

/**
 * Speech bubbles, drawn in world space from the server's list rather than off
 * the entities — a bubble carries through fog even when whoever is shouting
 * doesn't, so you can hear someone hammering on a door you can't see.
 */
/**
 * A SWAT van. An armoured box rather than a car: a long flat roof, a short
 * bonnet at the nose, roof hatches down the spine and rear doors at the tail
 * — which is where the crew actually come out of, so it is worth being able
 * to see which end that is.
 *
 * The lightbar is kept from the patrol car it replaces and is the best thing
 * about it: it goes on flashing after the van parks, so an arrival you didn't
 * watch still reads as "your backup came from over there" a minute later. On
 * something this size there is room to run it as a proper bar across the roof
 * with the two halves alternating, plus grille flashers at the nose.
 */
/**
 * When each skid was last seen still sliding, keyed by where it started.
 *
 * Purely a drawing clock: the smoke has to keep drifting and thinning for a
 * moment *after* the van has stopped, and the server has no reason to carry
 * a fading particle field on the wire for it. The skid's start point is a
 * stable key per vehicle and exists for exactly as long as the marks do.
 */
const skidStopped = new Map<string, number>();

/**
 * Rubber burning off the tyres. Thickest at the wheels, thinning back down the
 * marks, drifting off to the side as it rises — and it keeps going for
 * `TYRE_SMOKE_LINGER_MS` after the van has come to rest, because smoke that
 * stops the instant the vehicle does reads as a switch being thrown.
 *
 * Positions are hashed off the puff index rather than stored, so this is a
 * pure function of the wire state and the clock, with nothing to keep alive
 * between frames but one timestamp.
 */
function drawTyreSmoke(
  ctx: CanvasRenderingContext2D,
  v: BackupVehicleState,
  ux: number,
  uy: number,
  nx: number,
  ny: number,
  along: number,
  off: number,
  now: number,
): void {
  const key = `${v.skidX},${v.skidY}`;
  if (v.braking) skidStopped.set(key, now);
  const stoppedAt = skidStopped.get(key);
  if (stoppedAt === undefined) return;

  const since = now - stoppedAt;
  if (since > TYRE_SMOKE_LINGER_MS) {
    skidStopped.delete(key);
    return;
  }
  // Fades away once the sliding stops rather than being cut off.
  const settling = 1 - since / TYRE_SMOKE_LINGER_MS;

  ctx.save();
  for (let i = 0; i < TYRE_SMOKE_PUFFS; i++) {
    // Where along the marks this puff sits: 0 at the wheels, 1 back at the
    // start. Laid out with a bias toward the wheels, which is where it is
    // actually being made.
    const seed = Math.sin(i * 12.9898) * 43758.5453;
    const jitter = seed - Math.floor(seed);
    const back = (i / TYRE_SMOKE_PUFFS) ** 1.6;
    const t = 1 - back;

    const ease = t * t * (3 - 2 * t);
    const side = i % 2 === 0 ? -1 : 1;
    const lift = back * 26 + jitter * 8;
    const px =
      v.skidX! + ux * along * t + nx * (off * ease + side * (VAN_WIDTH / 2 - 4) + lift * 0.35);
    const py =
      v.skidY! + uy * along * t + ny * (off * ease + side * (VAN_WIDTH / 2 - 4) + lift * 0.35);

    // Older puffs are further back, bigger and fainter — a plume, not a line
    // of identical dots.
    const radius = 5 + back * 16 + jitter * 4;
    const alpha = (1 - back) * 0.3 * settling;
    if (alpha <= 0.01) continue;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#cbd5e1';
    ctx.beginPath();
    ctx.arc(px, py, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

export function drawBackupVehicles(
  ctx: CanvasRenderingContext2D,
  vehicles: BackupVehicleState[],
  view: Viewport,
  now: number,
): void {
  // Tyre marks go down before any of the bodies, so a van parked over the end
  // of its own skid sits on top of it rather than under it.
  for (const v of vehicles) {
    if (v.skidX === undefined || v.skidY === undefined || v.skidAngle === undefined) continue;
    if (!visible(view, v.x, v.y, 500)) continue;

    // The marks follow the *curve* the van actually took, which is a straight
    // run along the braking line with a smoothstepped wash out to one side.
    // Drawing them as a straight chord from the brake point to the van was
    // fine while the path was straight and is plainly wrong now: the rubber
    // would leave the road and rejoin it.
    const ux = Math.cos(v.skidAngle);
    const uy = Math.sin(v.skidAngle);
    const nx = -uy;
    const ny = ux;
    // How far along, and how far off, the van has got.
    const along = (v.x - v.skidX) * ux + (v.y - v.skidY) * uy;
    const off = (v.x - v.skidX) * nx + (v.y - v.skidY) * ny;
    if (along < 4) continue;

    ctx.save();
    ctx.strokeStyle = 'rgba(18, 20, 24, 0.5)';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const side of [-1, 1]) {
      const ox = nx * side * (VAN_WIDTH / 2 - 5);
      const oy = ny * side * (VAN_WIDTH / 2 - 5);
      ctx.beginPath();
      for (let i = 0; i <= 14; i++) {
        const t = i / 14;
        // The same smoothstep the server walks the van along, so the rubber
        // lies exactly where the tyres were.
        const ease = t * t * (3 - 2 * t);
        const px = v.skidX + ux * along * t + nx * off * ease + ox;
        const py = v.skidY + uy * along * t + ny * off * ease + oy;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
    ctx.lineCap = 'butt';
    ctx.restore();

    drawTyreSmoke(ctx, v, ux, uy, nx, ny, along, off, now);
  }

  for (const vehicle of vehicles) {
    if (vehicle.kind === 'car') drawPatrolCar(ctx, vehicle, view, now);
    else drawSwatVan(ctx, vehicle, view, now);
  }
}

/**
 * The patrol car the second and third radio calls send. Kept as it always was
 * — a white shell with a blue flank and a two-tone bar — because the whole
 * point of it is that it is visibly *not* the van: smaller, ordinary, and
 * carrying two officers instead of a team.
 */
function drawPatrolCar(
  ctx: CanvasRenderingContext2D,
  car: BackupVehicleState,
  view: Viewport,
  now: number,
): void {
  const L = CAR_LENGTH / 2;
  const W = CAR_WIDTH / 2;
  if (!visible(view, car.x, car.y, CAR_LENGTH)) return;
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.facing);

  ctx.fillStyle = 'rgba(0, 0, 0, 0.32)';
  ctx.beginPath();
  ctx.roundRect(-L + 3, -W + 4, CAR_LENGTH, CAR_WIDTH, 7);
  ctx.fill();

  ctx.fillStyle = '#111827';
  for (const fx of [-L + 10, L - 14]) {
    for (const fy of [-W - 1, W - 5]) ctx.fillRect(fx, fy, 10, 6);
  }

  ctx.beginPath();
  ctx.roundRect(-L, -W, CAR_LENGTH, CAR_WIDTH, 7);
  ctx.fillStyle = '#f1f5f9';
  ctx.fill();
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // The dark panel down each flank is what makes it read as a squad car.
  ctx.fillStyle = '#1e3a8a';
  ctx.fillRect(-L + 7, -W + 1, CAR_LENGTH - 16, 5);
  ctx.fillRect(-L + 7, W - 6, CAR_LENGTH - 16, 5);

  // Cabin: windscreen, roof, rear window.
  ctx.fillStyle = 'rgba(30, 41, 59, 0.85)';
  ctx.beginPath();
  ctx.roundRect(-8, -W + 3, 22, CAR_WIDTH - 6, 3);
  ctx.fill();
  ctx.fillStyle = 'rgba(148, 197, 253, 0.6)';
  ctx.fillRect(L - 20, -W + 4, 6, CAR_WIDTH - 8);
  ctx.fillRect(-L + 13, -W + 4, 5, CAR_WIDTH - 8);

  ctx.fillStyle = '#fef9c3';
  ctx.fillRect(L - 3, -W + 3, 3, 4);
  ctx.fillRect(L - 3, W - 7, 3, 4);

  // Both doors, one either side at the cabin — the end the pair get out of.
  // They stay open afterwards, like the van's: a car standing on a corner with
  // its doors hanging open says what happened there without anybody watching.
  const open = car.cabOpen ?? 0;
  if (open > 0) {
    const leaf = CAR_LENGTH * 0.34;
    for (const side of [-1, 1]) {
      ctx.save();
      // Hinged at the front edge of the opening, the leaf lying back along the
      // flank. The rotation is **negated against the side**: the leaf points in
      // -x, so swinging it outward on the +y flank needs a negative angle.
      // Signed the other way it swings *inward* and the door is drawn white on
      // the white roof, which is exactly as visible as not drawing it.
      ctx.translate(3, side * W);
      ctx.rotate(-side * CAR_DOOR_ARC * open);
      ctx.fillStyle = '#e2e8f0';
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.rect(-leaf, -1.75, leaf, 3.5);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }

  const beat = Math.sin(now * 0.012) > 0;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
  ctx.fillRect(-7, -W + 1, 13, CAR_WIDTH - 2);
  ctx.fillStyle = beat ? '#ef4444' : 'rgba(120, 30, 30, 0.65)';
  ctx.fillRect(-6, -W + 2, 11, W - 2);
  ctx.fillStyle = beat ? 'rgba(30, 60, 140, 0.65)' : '#3b82f6';
  ctx.fillRect(-6, 1, 11, W - 3);
  ctx.restore();
}

function drawSwatVan(
  ctx: CanvasRenderingContext2D,
  van: BackupVehicleState,
  view: Viewport,
  now: number,
): void {
  const L = VAN_LENGTH / 2;
  const W = VAN_WIDTH / 2;
  {
    if (!visible(view, van.x, van.y, VAN_LENGTH)) return;
    ctx.save();
    ctx.translate(van.x, van.y);
    ctx.rotate(van.facing);

    // The wash of light on the ground goes down *first*, under everything.
    // Drawn over the body it reads as a stain on the paintwork rather than as
    // a light, which is what it looked like the first time.
    const beat = Math.sin(now * 0.012) > 0;
    ctx.globalAlpha = 0.15;
    ctx.fillStyle = beat ? '#ef4444' : '#3b82f6';
    ctx.beginPath();
    ctx.ellipse(-4, 0, VAN_LENGTH * 0.62, VAN_WIDTH * 1.05, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.36)';
    ctx.beginPath();
    ctx.roundRect(-L + 4, -W + 5, VAN_LENGTH, VAN_WIDTH, 6);
    ctx.fill();

    // Wheels first, so the body sits over them the way it does from above.
    // Six of them: a heavy chassis reads as heavy partly through the axles.
    ctx.fillStyle = '#0b0f16';
    for (const fx of [-L + 12, 2, L - 20]) {
      for (const fy of [-W - 2, W - 5]) ctx.fillRect(fx, fy, 11, 7);
    }

    // Body: a slab, near-black, with a slightly narrower bonnet at the nose.
    ctx.beginPath();
    ctx.roundRect(-L, -W, VAN_LENGTH, VAN_WIDTH, 6);
    ctx.fillStyle = '#232a35';
    ctx.fill();
    ctx.strokeStyle = '#080b10';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.beginPath();
    ctx.roundRect(L - 20, -W + 4, 20, VAN_WIDTH - 8, 5);
    ctx.fillStyle = '#2b3340';
    ctx.fill();
    ctx.stroke();

    // Armoured flank plating, and POLICE picked out along it in white.
    ctx.fillStyle = '#171d26';
    ctx.fillRect(-L + 8, -W + 2, VAN_LENGTH - 32, 6);
    ctx.fillRect(-L + 8, W - 8, VAN_LENGTH - 32, 6);
    ctx.fillStyle = 'rgba(226, 232, 240, 0.85)';
    ctx.fillRect(-L + 16, -1.5, 26, 3);

    // Rear doors, at the tail — the end the crew step out of. Shut they are a
    // seam; open they swing out and stay out, and an emptied van standing on a
    // corner with its back doors hanging open is the whole story of what
    // happened there, told to anybody who arrives later.
    const rear = van.rearOpen ?? 0;
    if (rear <= 0) {
      ctx.strokeStyle = '#0b0f16';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-L + 5, -W + 5);
      ctx.lineTo(-L + 5, W - 5);
      ctx.moveTo(-L + 5, 0);
      ctx.lineTo(-L + 1, 0);
      ctx.stroke();
    } else {
      // The dark of the empty load bay behind them.
      ctx.fillStyle = '#0a0d12';
      ctx.fillRect(-L, -W + 4, 9, VAN_WIDTH - 8);
      const leaf = VAN_WIDTH / 2 - 3;
      for (const side of [-1, 1]) {
        ctx.save();
        // Hinged at the outer corner of the tail, swinging back and outward.
        ctx.translate(-L + 2, side * (W - 3));
        ctx.rotate(side * VAN_REAR_DOOR_ARC * rear);
        ctx.fillStyle = '#2b3340';
        ctx.strokeStyle = '#0b0f16';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.rect(-3, side < 0 ? 0 : -leaf, 5, leaf);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
    }

    // The cab door, on the driver's side at the front.
    const cab = van.cabOpen ?? 0;
    if (cab > 0) {
      ctx.save();
      ctx.translate(L - 20, -W + 2);
      ctx.rotate(-VAN_CAB_DOOR_ARC * cab);
      ctx.fillStyle = '#2b3340';
      ctx.strokeStyle = '#0b0f16';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.rect(0, -4, 17, 4);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // Windscreen and the two small armoured side ports.
    ctx.fillStyle = 'rgba(120, 150, 190, 0.5)';
    ctx.fillRect(L - 12, -W + 6, 5, VAN_WIDTH - 12);
    ctx.fillStyle = 'rgba(90, 115, 150, 0.42)';
    ctx.fillRect(6, -W + 3, 9, 4);
    ctx.fillRect(6, W - 7, 9, 4);

    // Roof hatches down the spine.
    ctx.strokeStyle = 'rgba(10, 14, 20, 0.85)';
    ctx.lineWidth = 1;
    for (const hx of [-16, 0]) ctx.strokeRect(hx, -7, 13, 14);

    // Headlights at the nose.
    ctx.fillStyle = '#fef9c3';
    ctx.fillRect(L - 3, -W + 5, 3, 5);
    ctx.fillRect(L - 3, W - 10, 3, 5);

    // The lightbar: a full-width bar across the roof, the two halves
    // alternating rather than blinking together, with grille flashers picking
    // up the opposite beat so the whole vehicle pulses.
    const red = beat ? '#ef4444' : 'rgba(120, 30, 30, 0.6)';
    const blue = beat ? 'rgba(30, 60, 140, 0.6)' : '#3b82f6';
    ctx.fillStyle = 'rgba(12, 16, 22, 0.95)';
    ctx.fillRect(-9, -W + 1, 11, VAN_WIDTH - 2);
    ctx.fillStyle = red;
    ctx.fillRect(-8, -W + 2, 9, W - 2);
    ctx.fillStyle = blue;
    ctx.fillRect(-8, 1, 9, W - 3);
    ctx.fillStyle = blue;
    ctx.fillRect(L - 7, -W + 5, 3, 5);
    ctx.fillStyle = red;
    ctx.fillRect(L - 7, W - 10, 3, 5);
    ctx.restore();
  }
}
/**
 * Zap mines on the ground. Dark and inert while arming, then a slow pulsing
 * ring — you have to be able to see your own minefield to fight in front of it.
 */
export function drawMines(
  ctx: CanvasRenderingContext2D,
  mines: MineState[],
  view: Viewport,
  now: number,
): void {
  for (const mine of mines) {
    if (!visible(view, mine.x, mine.y, 30)) continue;

    ctx.fillStyle = '#0f172a';
    ctx.strokeStyle = mine.armed ? '#22d3ee' : 'rgba(100, 116, 139, 0.8)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(mine.x, mine.y, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    if (!mine.armed) continue;
    const pulse = (Math.sin(now * 0.005) + 1) / 2;
    ctx.globalAlpha = 0.25 + 0.35 * pulse;
    ctx.strokeStyle = '#22d3ee';
    ctx.beginPath();
    ctx.arc(mine.x, mine.y, 11 + pulse * 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

/**
 * A survivor beacon: a little mast with a pulsing ring, so it reads at a
 * glance from across a street as somewhere to head for.
 */
/**
 * Where the beacon map sits on screen, and how world coordinates map onto it.
 *
 * Shared by the drawing and the click handling so the two cannot disagree
 * about which pixel is which street — a map you can misclick by a block is
 * worse than no map.
 */
export interface MinimapFrame {
  x: number;
  y: number;
  w: number;
  h: number;
  scale: number;
}

export function minimapFrame(vw: number, vh: number): MinimapFrame {
  const scale = Math.min(
    MINIMAP_MAX_W / WORLD_WIDTH,
    (vh - MINIMAP_MARGIN * 2 - 46) / WORLD_HEIGHT,
  );
  const w = WORLD_WIDTH * scale;
  const h = WORLD_HEIGHT * scale;
  return { x: (vw - w) / 2, y: (vh - h) / 2 + 12, w, h, scale };
}

/**
 * The city as a map, for placing the beacon and then for reading how many have
 * made it there.
 *
 * **There is not a single NPC on it, and that is the whole design.** It draws
 * the map the client already has — walls, buildings, the park, the pond — plus
 * your own position and the beacon. Nothing about where anybody is comes down
 * the wire for this, so it cannot become a wallhack no matter what is done to
 * it later. The muster is a *number*, not dots.
 */
export function drawMinimap(
  ctx: CanvasRenderingContext2D,
  map: MapData,
  frame: MinimapFrame,
  self: { x: number; y: number } | null,
  beacon: InventoryState['beacon'],
  /** A spot clicked once and not yet committed, in world coordinates. */
  pick: { x: number; y: number } | null,
  vw: number,
  vh: number,
): void {
  ctx.save();
  // Everything behind it goes quiet: this is a thing you stop to read.
  ctx.fillStyle = 'rgba(12, 11, 10, 0.72)';
  ctx.fillRect(0, 0, vw, vh);

  const { x, y, w, h, scale } = frame;
  const wx = (v: number) => x + v * scale;
  const wy = (v: number) => y + v * scale;

  ctx.fillStyle = '#26241f';
  ctx.fillRect(x, y, w, h);

  // The park and the pond first, as ground.
  ctx.fillStyle = '#2f3a26';
  ctx.fillRect(wx(map.park.x), wy(map.park.y), map.park.w * scale, map.park.h * scale);

  ctx.fillStyle = '#1f3550';
  ctx.beginPath();
  for (let i = 0; i <= 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    const r = pondRadiusAt(map.pond, a) * scale;
    const px = wx(map.pond.x) + Math.cos(a) * r;
    const py = wy(map.pond.y) + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();

  // Buildings as their real footprints, so the streets between them read.
  ctx.fillStyle = '#4a4640';
  for (const b of map.buildings) {
    for (const r of b.rects) ctx.fillRect(wx(r.x), wy(r.y), r.w * scale, r.h * scale);
  }

  ctx.strokeStyle = '#6b6558';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, w, h);

  // You, so the map can be read against where you are standing.
  if (self) {
    ctx.fillStyle = '#3b82f6';
    ctx.beginPath();
    ctx.arc(wx(self.x), wy(self.y), 4, 0, Math.PI * 2);
    ctx.fill();
  }

  const title = !beacon
    ? ''
    : beacon.placed
      ? `${beacon.muster} AT THE BEACON`
      : beacon.pending
        ? 'BEACON TEAM INBOUND'
        : pick
          ? 'CLICK AGAIN TO CONFIRM'
          : 'CLICK TO CALL THE BEACON IN';
  // The title takes the marker's colour once there is one, so the state is
  // said twice: what the marker looks like, and what it is waiting for.
  ctx.fillStyle = beacon?.placed
    ? '#22c55e'
    : beacon?.pending
      ? '#facc15'
      : pick
        ? '#e5e7eb'
        : '#e8e4dc';
  ctx.font = 'bold 13px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(title, x + w / 2, y - 12);

  // The marker, and its colour is the whole state of the thing:
  //
  //   grey   — a spot you have clicked once and not committed to
  //   yellow — called in, the team is on its way
  //   green  — the mast is up
  //
  // One shape all the way through, changing colour, so it reads as the same
  // marker progressing rather than as three different things.
  const marker = beacon?.placed
    ? { x: beacon.x, y: beacon.y, color: '#22c55e' }
    : beacon?.pending
      ? { x: beacon.x, y: beacon.y, color: '#facc15' }
      : pick
        ? { x: pick.x, y: pick.y, color: '#a1a1aa' }
        : null;

  if (marker) {
    // Snapped to the pixel grid. A 2px stroke on a fractional centre is spread
    // across three columns at partial alpha and comes out as a grey smudge on
    // a dark map — which is how the first click ended up looking like nothing
    // had happened at all.
    const bx = Math.round(wx(marker.x)) + 0.5;
    const by = Math.round(wy(marker.y)) + 0.5;
    const half = 8;

    // Cross-hairs the width of the panel. The marker is a dozen pixels on a
    // map of a whole city; the lines are what actually catch the eye, and they
    // double as the read-off for where the spot sits against the streets.
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = marker.color;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(x, by);
    ctx.lineTo(x + w, by);
    ctx.moveTo(bx, y);
    ctx.lineTo(bx, y + h);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // The square itself: filled as well as outlined, so it reads as a marker
    // rather than as four thin lines.
    ctx.fillStyle = marker.color;
    ctx.globalAlpha = 0.28;
    ctx.fillRect(bx - half, by - half, half * 2, half * 2);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = marker.color;
    ctx.lineWidth = 2;
    ctx.strokeRect(bx - half, by - half, half * 2, half * 2);
    ctx.fillRect(bx - 2, by - 2, 4, 4);

    if (beacon?.placed) {
      // The ring people are counted inside, so the number has a shape.
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.arc(bx, by, BEACON_MUSTER_RADIUS * scale, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  ctx.font = '11px monospace';
  ctx.fillStyle = '#9a948a';
  const hint =
    !beacon || beacon.placed || beacon.pending
      ? 'click to close'
      : pick
        ? 'click again to lock it in · right-click to take it back'
        : 'click the map to mark a spot · right-click to close';
  ctx.fillText(hint, x + w / 2, y + h + 18);
  ctx.restore();
}

export function drawBeaconTowers(
  ctx: CanvasRenderingContext2D,
  towers: BeaconState[],
  view: Viewport,
  now: number,
): void {
  for (const t of towers) {
    if (!visible(view, t.x, t.y, 60)) continue;

    // The ring travels outward and fades, like something transmitting.
    const wave = ((now % 1800) / 1800);
    ctx.save();
    ctx.globalAlpha = (1 - wave) * 0.45;
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(t.x, t.y, 14 + wave * 34, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.beginPath();
    ctx.ellipse(t.x, t.y + 6, 13, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    // Tripod legs and a mast, drawn small — it is a marker, not a building.
    ctx.strokeStyle = '#a16207';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (const a of [-2.2, -0.94, 0.32]) {
      ctx.moveTo(t.x, t.y - 30);
      ctx.lineTo(t.x + Math.cos(a) * 12, t.y + Math.sin(a) * 12 + 6);
    }
    // The mast itself, above the tripod.
    ctx.moveTo(t.x, t.y - 30);
    ctx.lineTo(t.x, t.y - 44);
    ctx.stroke();

    // Cross-braces, so the height reads as structure rather than a stick.
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(161, 98, 7, 0.7)';
    ctx.beginPath();
    ctx.moveTo(t.x - 6, t.y - 14);
    ctx.lineTo(t.x + 6, t.y - 14);
    ctx.moveTo(t.x - 3, t.y - 24);
    ctx.lineTo(t.x + 3, t.y - 24);
    ctx.stroke();

    ctx.fillStyle = '#facc15';
    ctx.beginPath();
    ctx.arc(t.x, t.y - 47, 5, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** One going off: a short white-blue crackle, gone almost at once. */
export function drawZaps(
  ctx: CanvasRenderingContext2D,
  zaps: Array<{ x: number; y: number; at: number }>,
  view: Viewport,
  now: number,
): void {
  for (const zap of zaps) {
    const age = (now - zap.at) / ZAP_FLASH_MS;
    if (age < 0 || age >= 1) continue;
    if (!visible(view, zap.x, zap.y, ZAP_MINE_RADIUS + 20)) continue;

    ctx.save();
    ctx.globalAlpha = 1 - age;
    ctx.strokeStyle = '#a5f3fc';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(zap.x, zap.y, ZAP_MINE_RADIUS * (0.4 + age * 0.7), 0, Math.PI * 2);
    ctx.stroke();

    // A few forked arcs off the centre, so it reads as electricity.
    const seed = (zap.x * 17 + zap.y * 31) % 360;
    for (let k = 0; k < 6; k++) {
      const a = seed + (k / 6) * Math.PI * 2;
      const r = ZAP_MINE_RADIUS * (0.5 + ((seed + k * 53) % 40) / 80);
      ctx.beginPath();
      ctx.moveTo(zap.x, zap.y);
      ctx.lineTo(zap.x + Math.cos(a) * r * 0.55, zap.y + Math.sin(a) * r * 0.55 - 5);
      ctx.lineTo(zap.x + Math.cos(a) * r, zap.y + Math.sin(a) * r);
      ctx.stroke();
    }
    ctx.restore();
  }
}

export function drawSpeechBubbles(
  ctx: CanvasRenderingContext2D,
  lines: SpeechState[],
  view: Viewport,
): void {
  for (const line of lines) {
    if (!visible(view, line.x, line.y, 90)) continue;
    drawBubble(ctx, line.x, line.y, ENTITY_RADIUS.human, line.text, line.radio === true);
  }
}

function drawBubble(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  radius: number,
  text: string,
  radio = false,
): void {
  ctx.font = 'bold 13px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const padX = 9;
  const padY = 6;
  const w = ctx.measureText(text).width + padX * 2;
  const h = 13 + padY * 2;
  const x = px - w / 2;
  const y = py - radius - 16 - h;

  const fill = radio ? 'rgba(219, 234, 254, 0.95)' : 'rgba(248, 250, 252, 0.95)';
  ctx.fillStyle = fill;
  ctx.strokeStyle = radio ? 'rgba(37, 99, 235, 0.8)' : 'rgba(15, 23, 42, 0.65)';
  ctx.lineWidth = 1.5;

  if (radio) {
    // A handset, not a mouth: a jagged outline rather than a rounded one, so
    // a voice coming out of your hip never reads as somebody standing there.
    const teeth = Math.max(6, Math.round(w / 9));
    ctx.beginPath();
    for (let i = 0; i <= teeth; i++) {
      const t = i / teeth;
      const zig = i % 2 === 0 ? 0 : -3;
      ctx.lineTo(x + w * t, y + zig);
    }
    for (let i = 0; i <= teeth; i++) {
      const t = i / teeth;
      const zig = i % 2 === 0 ? 0 : 3;
      ctx.lineTo(x + w * (1 - t), y + h + zig);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 6);
    ctx.fill();
    ctx.stroke();
  }

  // Tail. The radio's is a lightning kink rather than a speech tail.
  ctx.beginPath();
  if (radio) {
    ctx.moveTo(px - 4, y + h);
    ctx.lineTo(px + 4, y + h);
    ctx.lineTo(px - 1, y + h + 5);
    ctx.lineTo(px + 4, y + h + 5);
    ctx.lineTo(px - 3, y + h + 12);
    ctx.lineTo(px, y + h + 5);
    ctx.lineTo(px - 5, y + h + 5);
  } else {
    ctx.moveTo(px - 5, y + h);
    ctx.lineTo(px + 5, y + h);
    ctx.lineTo(px, y + h + 7);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();

  ctx.fillStyle = radio ? '#1e3a8a' : '#0f172a';
  ctx.fillText(text, px, y + h / 2);
}

/** Grenade mid-flight, with its own little ground shadow for the arc. */
export function drawGrenades(ctx: CanvasRenderingContext2D, grenades: GrenadeState[]): void {
  for (const g of grenades) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.beginPath();
    ctx.ellipse(g.x, g.y, 5, 2.5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#7f1d1d';
    ctx.strokeStyle = '#450a0a';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(g.x, g.y - g.h, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}

/** Shell detonations: a bright ring thrown outward, fading as it widens. */
export function drawBlasts(
  ctx: CanvasRenderingContext2D,
  blasts: BlastState[],
  view: Viewport,
): void {
  for (const b of blasts) {
    if (!visible(view, b.x, b.y, BLAST_RADIUS + 20)) continue;
    const t = Math.min(1, b.age / BLAST_MS);
    const r = BLAST_RADIUS * (0.25 + t * 0.85);

    ctx.globalAlpha = 1 - t;
    ctx.fillStyle = 'rgba(253, 224, 71, 0.35)';
    ctx.beginPath();
    ctx.arc(b.x, b.y, r * 0.7, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(251, 146, 60, 0.9)';
    ctx.lineWidth = 3 * (1 - t) + 1;
    ctx.beginPath();
    ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

/**
 * The dog's acid: a gobbet in the air, then a cloud sat on the road.
 *
 * **A cloud is a cluster of lobes, not a disc**, and the lobes are derived here
 * from the seed on the wire by the same `shared/acidshape.ts` the server's own
 * sight lines go through. That shared function is the whole reason the drawing
 * can be trusted: the fog stops exactly at the occluder edge, so anything drawn
 * past it would be a cloud claiming ground it does not block, and anything that
 * stopped short of it would leave a ring you can neither see through nor see
 * anything in.
 *
 * **Nothing here is clipped, and everything is drawn inside a lobe.** A clip of
 * the union was the obvious way to guarantee the rim and it measured **1.56ms a
 * cloud against 0.54** — the clip itself is nothing (0.006ms), but every fill
 * made through one pays, and a whole scene at 1920x1080 paints in about 4.9ms.
 * Filling each lobe's own arc gets the same guarantee for free: a fill bounded
 * by a circle cannot land outside that circle, and every circle is the cloud by
 * definition. The union `Path2D` went with it — one flat fill of a seven-arc
 * path measured **dearer than all seven gradient fills together** (0.33 against
 * 0.26), because the cost is the path rather than the pixels.
 *
 * Three passes:
 *
 *  1. **The lumps.** One radial gradient per lobe, and the gradients stop at a
 *     substantial alpha rather than at nothing — the rim is where the fog
 *     stops, so a lobe that faded out before its own edge would leave a ring of
 *     ground you can neither see through nor see anything in. Overlaps blend
 *     twice and thrice and that is wanted: the middle of a cloud is thicker
 *     than its edges.
 *  2. **One highlight over the core**, which is what makes it read as a single
 *     mass with lumps in it rather than as seven bubbles stuck together. It is
 *     drawn inside the core lobe alone, so it needs no clip either — the same
 *     mistake as five evenly bright ribs on the dog, and the same fix.
 *  3. **Churn, riding inside the lumps.** Hashed off the cloud's age (`t` on
 *     the wire) and its seed, so there is no per-frame state anywhere and two
 *     clouds side by side do not boil in lockstep. Attached to a lobe and kept
 *     well inside it, which is what lets it move without being clipped.
 */
export function drawAcid(ctx: CanvasRenderingContext2D, clouds: AcidState[]): void {
  for (const c of clouds) {
    const lobes = acidLobes(c.s, c.x, c.y, c.r);

    for (const l of lobes) {
      const grad = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.r);
      grad.addColorStop(0, `rgba(116, 176, 26, ${0.3 * c.a})`);
      grad.addColorStop(0.62, `rgba(96, 150, 20, ${0.27 * c.a})`);
      // Not to nothing — see above.
      grad.addColorStop(1, `rgba(64, 100, 16, ${0.22 * c.a})`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(l.x, l.y, l.r, 0, Math.PI * 2);
      ctx.fill();
    }

    const core = lobes[0];
    const body = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, core.r);
    body.addColorStop(0, `rgba(163, 220, 55, ${0.3 * c.a})`);
    body.addColorStop(0.5, `rgba(132, 195, 30, ${0.14 * c.a})`);
    body.addColorStop(1, 'rgba(101, 163, 13, 0)');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(c.x, c.y, core.r, 0, Math.PI * 2);
    ctx.fill();

    for (let i = 0; i < 5; i++) {
      // One lobe each, so a blob can drift without ever leaving the cloud.
      const l = lobes[1 + (i % (lobes.length - 1))];
      const drift = c.t * 0.0006 + i * 1.7 + c.s;
      const px = l.x + Math.cos(drift) * (l.r * 0.3);
      const py = l.y + Math.sin(drift * 1.27) * (l.r * 0.3);
      const rr = l.r * 0.6;
      const grad = ctx.createRadialGradient(px, py, 0, px, py, rr);
      grad.addColorStop(0, `rgba(190, 242, 100, ${0.16 * c.a})`);
      grad.addColorStop(1, 'rgba(132, 204, 22, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(px, py, rr, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/**
 * Standing in it: the screen full of the stuff.
 *
 * **This is the picture of an effect the server has already applied.** Anybody
 * who is not a zombie and whose own position is inside a cloud fails every
 * sight line in `hasLineOfSight`, so they are sent no bodies, no loot and no
 * tracers — the screen is genuinely empty, and `ACID_INSIDE_SIGHT` leaves a
 * hole barely wider than they are. Without this wash on top, that reads as the
 * renderer having given up, which is exactly what the two worst fog faults in
 * this game's history looked like. With it, it reads as being in the gas.
 *
 * Screen space, because it is what is in your eyes rather than what is on the
 * road. **The still half of it is baked once and blitted**, the same trick and
 * the same reason as the vignette and the grime tile: two full-screen alpha
 * fills at 1920x1080 measured 4.6ms, which is most of a frame for something
 * that never changes. Only the drift is live.
 */
let murkTile: HTMLCanvasElement | null = null;
let murkSize = '';

function murkFor(w: number, h: number): HTMLCanvasElement {
  const key = `${w}x${h}`;
  if (murkTile && murkSize === key) return murkTile;
  murkSize = key;
  murkTile = document.createElement('canvas');
  murkTile.width = w;
  murkTile.height = h;
  const g = murkTile.getContext('2d')!;
  // Thicker toward the edges: inside a cloud there is more of it between you
  // and anything off to the side than between you and your own feet, and a flat
  // wash on its own reads as a colour filter laid over the game. The flat part
  // is folded into the middle stop rather than being a second full-screen fill.
  const grad = g.createRadialGradient(
    w / 2, h / 2, Math.min(w, h) * 0.08,
    w / 2, h / 2, Math.hypot(w, h) * 0.55,
  );
  grad.addColorStop(0, 'rgba(101, 163, 13, 0.3)');
  grad.addColorStop(0.5, 'rgba(70, 108, 18, 0.62)');
  grad.addColorStop(1, 'rgba(32, 51, 11, 0.92)');
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  return murkTile;
}

export function drawAcidMurk(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  now: number,
): void {
  ctx.drawImage(murkFor(w, h), 0, 0);

  // And it moves, because gas does. Three is enough to be plainly churning and
  // few enough that the fill rate stays affordable — the park's translucent
  // overdraw is the standing warning here.
  for (let i = 0; i < 3; i++) {
    const drift = now * 0.00035 + i * 2.1;
    const px = w / 2 + Math.cos(drift) * w * 0.3;
    const py = h / 2 + Math.sin(drift * 1.31) * h * 0.32;
    const rr = Math.min(w, h) * (0.22 + (i % 2) * 0.07);
    const blob = ctx.createRadialGradient(px, py, 0, px, py, rr);
    blob.addColorStop(0, 'rgba(163, 230, 53, 0.2)');
    blob.addColorStop(1, 'rgba(132, 204, 22, 0)');
    ctx.fillStyle = blob;
    ctx.beginPath();
    ctx.arc(px, py, rr, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * A gobbet on its way.
 *
 * The shadow is drawn on the *unlifted* point and the blob on the lifted one —
 * the same pair the flame arc needs, and for the same reason: without a shadow
 * the height reads as the thing being off to one side rather than above the
 * ground.
 */
export function drawSpits(ctx: CanvasRenderingContext2D, spits: SpitState[]): void {
  for (const s of spits) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
    ctx.beginPath();
    ctx.ellipse(s.x, s.y, 7, 3.4, 0, 0, Math.PI * 2);
    ctx.fill();

    const y = s.y - s.h;
    // Stretched along the throw so it reads as travelling rather than falling.
    ctx.fillStyle = 'rgba(163, 230, 53, 0.92)';
    ctx.beginPath();
    ctx.ellipse(s.x, y, 9, 6.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(217, 249, 157, 0.75)';
    ctx.beginPath();
    ctx.arc(s.x - 2, y - 2, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Billowing red plume that marks the landing zone. */
export function drawSmoke(ctx: CanvasRenderingContext2D, smokes: SmokeState[], now: number): void {
  for (const s of smokes) {
    for (let i = 0; i < 5; i++) {
      const drift = now * 0.0004 + i * 1.7;
      const px = s.x + Math.cos(drift) * (s.r * 0.32);
      const py = s.y + Math.sin(drift * 1.3) * (s.r * 0.26);
      const rr = s.r * (0.55 + (i % 3) * 0.18);
      const grad = ctx.createRadialGradient(px, py, 0, px, py, rr);
      grad.addColorStop(0, `rgba(248, 113, 113, ${0.4 * s.a})`);
      grad.addColorStop(0.6, `rgba(220, 38, 38, ${0.22 * s.a})`);
      grad.addColorStop(1, 'rgba(153, 27, 27, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(px, py, rr, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// Scratch layer the helicopter silhouette is composed on. Sized to the widest
// extent of the airframe: nose at +16+HELI_RADIUS, tail rotor at -152-38.
const HELI_LAYER_ORIGIN_X = 200;
const HELI_LAYER_HALF = HELI_RADIUS + 20;
let heliCanvas: HTMLCanvasElement | null = null;
let heliDrawnAt = -1;

/** Redraws the silhouette at most once per frame, shared by every aircraft. */
function helicopterLayer(now: number): HTMLCanvasElement {
  if (!heliCanvas) {
    heliCanvas = document.createElement('canvas');
    heliCanvas.width = HELI_LAYER_ORIGIN_X + HELI_RADIUS + 40;
    heliCanvas.height = HELI_LAYER_HALF * 2;
  }
  // Rotors turn, so the layer is only reusable within a single frame.
  if (heliDrawnAt === now) return heliCanvas;
  heliDrawnAt = now;

  const g = heliCanvas.getContext('2d')!;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, heliCanvas.width, heliCanvas.height);
  g.translate(HELI_LAYER_ORIGIN_X, HELI_LAYER_HALF);

  // Faint swept disc first: this alone gives the middle of the shadow its
  // slightly deeper tone once the opaque airframe lands on top.
  g.fillStyle = 'rgba(0, 0, 0, 0.26)';
  g.beginPath();
  g.arc(16, 0, HELI_RADIUS, 0, Math.PI * 2);
  g.fill();

  // Airframe at full opacity — overlapping opaque fills stay flat.
  g.fillStyle = '#000';
  g.beginPath();
  g.ellipse(22, 0, 84, 42, 0, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.roundRect(-152, -16, 176, 32, 12);
  g.fill();
  g.beginPath();
  g.ellipse(-152, 0, 26, 42, 0, 0, Math.PI * 2);
  g.fill();

  g.strokeStyle = '#000';
  g.lineCap = 'round';

  g.lineWidth = 16;
  const spin = now * 0.018;
  for (let i = 0; i < 2; i++) {
    const a = spin + i * (Math.PI / 2);
    g.beginPath();
    g.moveTo(16 - Math.cos(a) * HELI_RADIUS, -Math.sin(a) * HELI_RADIUS);
    g.lineTo(16 + Math.cos(a) * HELI_RADIUS, Math.sin(a) * HELI_RADIUS);
    g.stroke();
  }

  g.lineWidth = 8;
  const tailSpin = now * 0.05;
  for (let i = 0; i < 2; i++) {
    const a = tailSpin + i * (Math.PI / 2);
    g.beginPath();
    g.moveTo(-152 - Math.cos(a) * 38, -Math.sin(a) * 38);
    g.lineTo(-152 + Math.cos(a) * 38, Math.sin(a) * 38);
    g.stroke();
  }

  return heliCanvas;
}

/**
 * The helicopter is never drawn — only the large shadow it throws across the
 * ground. It darkens in as it arrives and fades away as it leaves.
 */
export function drawHelicopters(
  ctx: CanvasRenderingContext2D,
  helis: HelicopterState[],
  now: number,
): void {
  for (const h of helis) {
    if (h.alpha <= 0.02) continue;

    // The silhouette is composed opaquely on its own layer, then composited
    // once. Drawing the pieces straight onto the world would stack their
    // alphas wherever they overlap — those were the dark seams.
    const layer = helicopterLayer(now);
    ctx.save();
    ctx.globalAlpha = h.alpha * HELI_SHADOW_ALPHA;
    ctx.translate(h.x, h.y);
    ctx.rotate(h.facing);
    ctx.drawImage(layer, -HELI_LAYER_ORIGIN_X, -HELI_LAYER_HALF);
    ctx.restore();
    ctx.globalAlpha = 1;
  }
}

/** Loot crates on the floor, drawn in world space. */
/**
 * A deployed pocket gunner: the sandbags, and the gun on its mount. Drawn
 * under the entities so the officer working it stands on top of his own
 * emplacement rather than behind it.
 */
/**
 * A stack of sandbags, lying along `box.angle`.
 *
 * **One definition, three callers** — the pocket gunner's wall, a barricade the
 * garrison built to a spectator's order, and the translucent ghost of one being
 * placed. Written out three times they would drift, and the ghost's whole job is
 * to show exactly what is about to exist.
 *
 * They wear down rather than vanish, so the colour dries out as they take
 * punishment: you can see one is nearly gone before it goes. `tint` overrides
 * that for the ghost, which is saying "here" or "not here" rather than
 * reporting damage.
 */
export function drawSandbagWall(
  ctx: CanvasRenderingContext2D,
  box: { x: number; y: number; angle: number; hw: number; hh: number },
  hp: number,
  alpha = 1,
  tint?: string,
): void {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(box.x, box.y);
  ctx.rotate(box.angle);
  const worn = 0.35 + 0.65 * b0(hp);
  ctx.fillStyle =
    tint ??
    `rgb(${Math.round(120 + 40 * worn)}, ${Math.round(104 + 30 * worn)}, ${Math.round(72 + 20 * worn)})`;
  ctx.strokeStyle = 'rgba(31, 27, 20, 0.85)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(-box.hw, -box.hh, box.hw * 2, box.hh * 2, 4);
  ctx.fill();
  ctx.stroke();
  // Three bags, so it reads as stacked rather than as a plank.
  ctx.strokeStyle = 'rgba(31, 27, 20, 0.5)';
  ctx.lineWidth = 1;
  for (const t of [-0.34, 0.34]) {
    ctx.beginPath();
    ctx.moveTo(box.hw * t, -box.hh);
    ctx.lineTo(box.hw * t, box.hh);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * The bare walls, with no gun behind them. Drawn with the emplacements and by
 * the same function — as far as anything on screen is concerned the only
 * difference is that nobody is manning this one.
 */
export function drawBarricades(
  ctx: CanvasRenderingContext2D,
  walls: BarricadeState[],
  view: Viewport,
): void {
  for (const wall of walls) {
    if (!visible(view, wall.x, wall.y, wall.hw + 20)) continue;
    drawSandbagWall(ctx, wall, wall.hp);
  }
}

/**
 * The walls that have been ordered and are not there yet.
 *
 * **The one drawing that says an order is still being carried out.** A wall is
 * a walk away, so between the click and the wall there was nothing on screen at
 * all — the ghost cleared with the mouse button and the only way to know the
 * order had landed was to wait and see. This is that ghost, left standing at
 * the spot for as long as somebody is on his way to it.
 *
 * Deliberately `drawSandbagWall` like the built ones and the one in hand, so it
 * is exactly the thing that is about to exist — the same argument that has the
 * in-hand ghost drawn by it. What separates the three is treatment, not shape:
 * faint and dashed while he is walking, filled in and steady once he has
 * arrived and is stacking, and solid once it is a wall.
 */
export function drawBuildSites(
  ctx: CanvasRenderingContext2D,
  sites: BuildSiteState[],
  view: Viewport,
  now: number,
): void {
  for (const site of sites) {
    if (!visible(view, site.x, site.y, BARRICADE_HALF_WIDTH + 24)) continue;
    const box = {
      x: site.x,
      y: site.y,
      angle: site.angle,
      hw: BARRICADE_HALF_WIDTH,
      hh: BARRICADE_HALF_DEPTH,
    };
    // Stacking reads as steady; walking breathes, so a spot nobody has reached
    // yet cannot be mistaken for a wall that is simply pale.
    const pulse = site.working ? 1 : 0.72 + 0.28 * Math.sin(now / 260);
    drawSandbagWall(ctx, box, 1, (site.working ? 0.52 : 0.3) * pulse, '#e8a13a');

    ctx.save();
    ctx.translate(site.x, site.y);
    ctx.rotate(site.angle);
    ctx.strokeStyle = '#e8a13a';
    ctx.globalAlpha = site.working ? 0.85 : 0.55;
    ctx.lineWidth = 1.4;
    if (!site.working) ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.roundRect(-box.hw, -box.hh, box.hw * 2, box.hh * 2, 4);
    ctx.stroke();
    ctx.restore();
  }
}

export function drawEmplacements(
  ctx: CanvasRenderingContext2D,
  guns: EmplacementState[],
  view: Viewport,
): void {
  for (const gun of guns) {
    if (!visible(view, gun.x, gun.y, 120)) continue;

    if (gun.bags) drawSandbagWall(ctx, gun.bags, gun.bagHp);

    // The gun: a squat mount with a barrel along the current traverse.
    ctx.save();
    ctx.translate(gun.x, gun.y);
    ctx.rotate(gun.facing);
    ctx.fillStyle = gun.gunHp > 0 ? '#3f3f46' : '#27272a';
    ctx.beginPath();
    ctx.roundRect(-7, -6, 14, 12, 3);
    ctx.fill();
    ctx.fillStyle = '#18181b';
    ctx.fillRect(4, -2, 22, 4);
    ctx.restore();

    // How much belt is left, as a short bar behind the gun.
    const frac = Math.max(0, Math.min(1, gun.ammo / EMPLACEMENT_AMMO));
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(gun.x - 14, gun.y - 20, 28, 3);
    ctx.fillStyle = frac > 0.25 ? '#84cc16' : '#f87171';
    ctx.fillRect(gun.x - 14, gun.y - 20, 28 * frac, 3);
  }
}

/** Clamp a 0-1 that arrived over the wire. */
function b0(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/**
 * Burning ground. Each patch is a few flickering tongues rather than a disc —
 * a flat circle reads as a stain, and this has to read as something you do not
 * want to walk into.
 */
export function drawFires(
  ctx: CanvasRenderingContext2D,
  fires: FireState[],
  view: Viewport,
  now: number,
): void {
  for (let i = 0; i < fires.length; i++) {
    const f = fires[i];
    if (!visible(view, f.x, f.y, 40)) continue;

    // A fire spends the last stretch of its life going out, and has to reach
    // *nothing* — the old curve bottomed out at 45% size and a quarter opaque
    // and then the patch was simply deleted, which is a fire vanishing rather
    // than a fire dying. `dying` is 1 for most of the life and ramps to 0.
    const life = Math.max(0, Math.min(1, f.life));
    const dying = Math.min(1, life / FIRE_FADE_FRACTION);
    if (dying <= 0) continue;
    const scale = 0.3 + 0.7 * dying;

    ctx.save();
    // A smaller, dimmer scorch than before: with the patches now spaced apart
    // this is what reads as separate fires instead of one continuous smear.
    ctx.globalAlpha = 0.34 * dying;
    ctx.fillStyle = '#7c2d12';
    ctx.beginPath();
    ctx.arc(f.x, f.y, 17 * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Three tongues, each on its own phase so the patch never pulses as one.
    const seed = (f.x * 31 + f.y * 17) % 360;
    for (let k = 0; k < 3; k++) {
      const phase = now * 0.009 + seed + k * 2.1;
      const wob = Math.sin(phase) * 0.5 + 0.5;
      const r = (5 + wob * 6) * scale;
      const ox = Math.cos(seed + k * 2.3) * 7 * scale;
      const oy = Math.sin(seed + k * 2.3) * 7 * scale - wob * 4 * dying;
      ctx.globalAlpha = (0.45 + 0.45 * wob) * dying;
      ctx.fillStyle = k === 0 ? '#fde047' : k === 1 ? '#fb923c' : '#ef4444';
      ctx.beginPath();
      ctx.arc(f.x + ox, f.y + oy, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

/**
 * Thermal contacts — zombies the goggles pick out through a wall or a hedge.
 *
 * Drawn **after** the fog rather than with the bodies, because the whole point
 * is that these are the things you cannot see: put them in the entity pass and
 * the fog lays over them and dims the one readout you bought them for. They
 * are heat, not bodies, so nothing about the figure is drawn — just a bright
 * pulsing blob that sits on top of everything.
 */
export function drawThermal(
  ctx: CanvasRenderingContext2D,
  entities: Iterable<EntityState>,
  view: Viewport,
  now: number,
): void {
  const pulse = 0.75 + Math.sin(now * 0.006) * 0.25;
  for (const e of entities) {
    if (!e.thermal) continue;
    if (!visible(view, e.x, e.y, 40)) continue;
    const radius = ENTITY_RADIUS[e.type];

    // A wide soft halo so it carries through the dark, then a hot core.
    const glow = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, radius * 2.6);
    glow.addColorStop(0, `rgba(255, 237, 213, ${0.95 * pulse})`);
    glow.addColorStop(0.45, `rgba(251, 146, 60, ${0.8 * pulse})`);
    glow.addColorStop(1, 'rgba(234, 88, 12, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(e.x, e.y, radius * 2.6, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#fff7ed';
    ctx.beginPath();
    ctx.arc(e.x, e.y, radius * 0.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(249, 115, 22, 0.95)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(e.x, e.y, radius + 5, 0, Math.PI * 2);
    ctx.stroke();
  }
}

/** Flame licking off something that has caught. Drawn over the body. */
export function drawBurning(
  ctx: CanvasRenderingContext2D,
  e: EntityState,
  now: number,
): void {
  const radius = ENTITY_RADIUS[e.type];
  const seed = hashId(e.id);
  ctx.save();
  for (let k = 0; k < 5; k++) {
    const phase = now * 0.014 + seed + k * 1.7;
    const wob = Math.sin(phase) * 0.5 + 0.5;
    const a = (seed + k * 72) * (Math.PI / 180) + now * 0.002;
    const d = radius * (0.4 + 0.5 * wob);
    ctx.globalAlpha = 0.35 + 0.45 * wob;
    ctx.fillStyle = k % 3 === 0 ? '#fde047' : k % 3 === 1 ? '#fb923c' : '#ef4444';
    ctx.beginPath();
    ctx.arc(e.x + Math.cos(a) * d, e.y + Math.sin(a) * d - wob * 3, 3 + wob * 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * Below this scale a four-character label 7px tall lands on about a pixel of
 * screen, so it is drawn as an unreadable smudge at the cost of a `fillText`
 * each. The same idea as `ENTITY_DETAIL_SCALE`, for the same reason.
 */
export const PICKUP_LABEL_SCALE = 0.5;

export function drawPickups(
  ctx: CanvasRenderingContext2D,
  pickups: PickupState[],
  view: Viewport,
  now: number,
  scale = 1,
): void {
  // **Set once, not once per pickup.** Assigning `ctx.font` parses a CSS font
  // string, and this loop was doing it — along with the two text alignments —
  // for every item on screen, every frame, with the same value each time. A
  // spectator sees the whole city's loot at once, so that was a hundred-odd
  // font parses a frame: `drawPickups` was the dearest function in the client
  // and `fillText` was close behind it.
  // Grouping these into one path per colour was tried and is **2x slower**:
  // the Map and the per-colour arrays are rebuilt every frame, and that
  // allocation costs more than the fill-and-stroke pairs it saves. The batching
  // that works for bushes and blood works because those hold no per-item state
  // to sort into buckets first.
  const labels = scale >= PICKUP_LABEL_SCALE;
  if (labels) {
    ctx.font = 'bold 7px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
  }
  ctx.lineWidth = 1.5;

  for (const p of pickups) {
    if (!visible(view, p.x, p.y, 30)) continue;
    const def = ITEMS[p.item];
    const bob = Math.sin(now * 0.004 + p.x * 0.05) * 2;
    const x = p.x;
    const y = p.y + bob;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.beginPath();
    ctx.ellipse(x, y + 9, 10, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // A gun with nothing left in it goes grey, so it reads as scenery at a
    // glance rather than something worth crossing the street for.
    const spent = p.ammo === 0;
    ctx.fillStyle = spent ? EMPTY_PICKUP_COLOR : def.color;
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.8)';
    ctx.beginPath();
    ctx.roundRect(x - 8, y - 8, 16, 16, 3);
    ctx.fill();
    ctx.stroke();

    if (labels) {
      ctx.fillStyle = spent ? '#1f2937' : '#0f172a';
      ctx.fillText(def.short.slice(0, 4), x, y);
    }
    if (spent) {
      // A bar through it: colour alone is easy to miss on a dim item.
      ctx.strokeStyle = 'rgba(31, 41, 55, 0.9)';
      ctx.beginPath();
      ctx.moveTo(x - 7, y + 7);
      ctx.lineTo(x + 7, y - 7);
      ctx.stroke();
    }
  }
}

/** "E" prompt plus the hold-to-drop ring, both drawn over the player. */
export function drawInteractPrompt(
  ctx: CanvasRenderingContext2D,
  inv: InventoryState,
  screenX: number,
  screenY: number,
): void {
  if (inv.dropProgress >= 0) {
    const r = 26;
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.75)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(screenX, screenY, r, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = inv.dropProgress >= 1 ? '#f87171' : '#38bdf8';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(screenX, screenY, r, -Math.PI / 2, -Math.PI / 2 + inv.dropProgress * Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = '#e2e8f0';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('DROP', screenX, screenY - r - 10);
    return;
  }

  if (!inv.nearbyItem) return;
  const def = ITEMS[inv.nearbyItem];
  ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
  const label = `E  ${def.label}`;
  ctx.font = 'bold 12px sans-serif';
  const w = ctx.measureText(label).width + 16;
  ctx.beginPath();
  ctx.roundRect(screenX - w / 2, screenY - 52, w, 20, 5);
  ctx.fill();
  ctx.fillStyle = def.color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, screenX, screenY - 42);
}

/** Slot bar along the bottom: 0 pistol, 1-3 guns, 4-9 utilities. */
export function drawInventory(
  ctx: CanvasRenderingContext2D,
  inv: InventoryState,
  vw: number,
  vh: number,
  now: number,
): void {
  // Only the slots this bag can actually use are drawn: the fourth gun slot
  // appears with a gunsling, the last two utility slots with a backpack. A
  // greyed-out cell you can never fill is worse than no cell at all.
  const cells: Array<{ key: string; item: ItemId | null; ammo: number | null }> = [
    { key: '0', item: inv.dual ? 'dualPistols' : 'pistol', ammo: null },
  ];
  for (let i = 0; i < inv.gunSlots; i++) {
    const g = inv.guns[i];
    cells.push({ key: String(i + 1), item: g?.item ?? null, ammo: g?.ammo ?? null });
  }
  for (let i = 0; i < inv.utilitySlots; i++) {
    const item = inv.utilities[i] ?? null;
    cells.push({
      key: String(i + 1 + inv.gunSlots),
      item,
      // Bundles count down in the bag the way rounds do in a magazine.
      ammo:
        item === 'grenade'
          ? inv.grenades
          : item === 'zapMine'
            ? inv.mines
            : item === 'cureGun'
              ? inv.cureDoses
              : // Three calls in a radio and a minute between them, and both
                // of those are decisions rather than trivia — the count has to
                // be on the bar the same way a bundle's is.
                item === 'radio'
                ? inv.radioUses
                : null,
    });
  }

  const size = 34;
  const gap = 4;
  const totalW = cells.length * (size + gap) - gap;
  const x0 = (vw - totalW) / 2;
  const y = vh - 46;

  cells.forEach((cell, i) => {
    const x = x0 + i * (size + gap);
    const active = inv.activeSlot === i;

    // Slot 0 is the pistol, 1-3 take guns, 4-9 take utilities. Colouring the
    // two banks differently means you can see at a glance what a slot is for
    // rather than having to remember the numbering.
    const isGunSlot = i >= 1 && i <= inv.gunSlots;
    const isUtilitySlot = i > inv.gunSlots;
    const bank = isGunSlot
      ? { fill: 'rgba(80, 20, 24, 0.62)', edge: 'rgba(248, 113, 113, 0.75)' }
      : isUtilitySlot
        ? { fill: 'rgba(20, 52, 66, 0.62)', edge: 'rgba(45, 212, 191, 0.7)' }
        : { fill: 'rgba(15, 23, 42, 0.66)', edge: 'rgba(100, 116, 139, 0.6)' };

    ctx.fillStyle = active ? 'rgba(56, 189, 248, 0.28)' : bank.fill;
    ctx.strokeStyle = active ? '#38bdf8' : bank.edge;
    ctx.lineWidth = active ? 2 : 1;
    ctx.beginPath();
    ctx.roundRect(x, y, size, size, 4);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = 'rgba(148, 163, 184, 0.85)';
    ctx.font = '8px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(cell.key, x + 3, y + 3);

    if (!cell.item) return;
    const def = ITEMS[cell.item];
    ctx.fillStyle = def.color;
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(def.short, x + size / 2, y + size / 2 + 2);

    if (cell.ammo !== null) {
      ctx.fillStyle = cell.ammo > 0 ? '#e2e8f0' : '#f87171';
      ctx.font = '8px sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillText(String(cell.ammo), x + size - 3, y + size - 2);
    }

    // The radio's minute, as a bar draining across the bottom of its own cell.
    // A number counting down would be read as ammunition; the whole question
    // here is "can I press it yet", and a bar answers that without being read.
    if (cell.item === 'radio' && inv.radioReadyAt > now) {
      const left = Math.max(0, Math.min(1, (inv.radioReadyAt - now) / RADIO_COOLDOWN_MS));
      ctx.fillStyle = 'rgba(15, 23, 42, 0.72)';
      ctx.fillRect(x + 1, y + size - 5, size - 2, 4);
      ctx.fillStyle = 'rgba(251, 191, 36, 0.9)';
      ctx.fillRect(x + 1, y + size - 5, (size - 2) * left, 4);
    }
  });

  // Carried protective gear.
  const badges: string[] = [];
  if (inv.kevlar > 0) badges.push(`KEVLAR ${inv.kevlar}`);
  if (inv.shield) badges.push('SHIELD');
  if (badges.length > 0) {
    ctx.fillStyle = '#93c5fd';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(badges.join('  ·  '), vw / 2, y - 6);
  }
}

/**
 * The aiming marks are warm amber — the colour of a phosphor gunsight, and a
 * deliberate step away from anything that reads as UI green or a sci-fi cyan.
 * Every one is laid down twice: a dark underlay first so it holds on a white
 * wall as readily as on the road, then the amber over it.
 */
const AIM_AMBER = '#e8a13a';
const AIM_AMBER_DIM = 'rgba(232, 161, 58, 0.5)';
const AIM_SHADOW = 'rgba(12, 8, 3, 0.6)';

/**
 * The scoped reticle: a ranging circle with ticks, rather than the four stubs
 * of the ordinary crosshair. Deliberately larger — you are looking at a lot
 * more ground than usual and a small mark gets lost in it.
 */
export function drawReticle(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.save();

  const marks = () => {
    ctx.beginPath();
    ctx.arc(x, y, 26, 0, Math.PI * 2);
    ctx.moveTo(x + 2.2, y);
    ctx.arc(x, y, 2.2, 0, Math.PI * 2);
    // Four arms into the ring, with a gap at the middle so the mark stays clear.
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      ctx.moveTo(x + dx * 7, y + dy * 7);
      ctx.lineTo(x + dx * 26, y + dy * 26);
    }
    ctx.stroke();
  };
  ctx.strokeStyle = AIM_SHADOW;
  ctx.lineWidth = 3;
  marks();
  ctx.strokeStyle = 'rgba(232, 161, 58, 0.9)';
  ctx.lineWidth = 1;
  marks();

  // Range ticks down the lower arm, the way a real scope carries them.
  ctx.strokeStyle = AIM_AMBER_DIM;
  ctx.beginPath();
  for (let i = 1; i <= 3; i++) {
    const ty = y + 10 + i * 5;
    const half = 4 - i;
    ctx.moveTo(x - half, ty);
    ctx.lineTo(x + half, ty);
  }
  ctx.stroke();
  ctx.restore();
}

/**
 * The bipod going down, and the charge rifle winding up. Both sit under the
 * cursor because both are about the shot you are lining up, not your state.
 */
export function drawAimGauge(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  progress: number,
  color: string,
  label: string,
): void {
  const w = 54;
  const h = 4;
  const top = y + 34;

  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.fillRect(x - w / 2, top, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x - w / 2, top, w * Math.max(0, Math.min(1, progress)), h);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x - w / 2 + 0.5, top + 0.5, w - 1, h - 1);

  ctx.fillStyle = color;
  ctx.font = '9px ui-monospace, Consolas, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(label, x, top + h + 3);
  ctx.restore();
}

/**
 * The charge rifle's four steps, as four separate boxes rather than one bar.
 *
 * A continuous bar was a lie about how the gun works: it fires on whole bars,
 * so what you can see filled has to be exactly what you will get. The first
 * box has to fill before it will fire at all, each one after that is another
 * body the round goes through, and the fourth also puts it through a wall.
 */
export function drawChargeBars(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  progress: number,
): void {
  const w = 58;
  const h = 6;
  const gap = 2;
  const top = y + 34;
  const seg = (w - gap * (CHARGE_BARS - 1)) / CHARGE_BARS;
  const level = Math.floor(Math.max(0, Math.min(1, progress)) * CHARGE_BARS);

  ctx.save();
  for (let i = 0; i < CHARGE_BARS; i++) {
    const sx = x - w / 2 + i * (seg + gap);
    const fill = Math.max(0, Math.min(1, progress * CHARGE_BARS - i));

    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fillRect(sx, top, seg, h);
    if (fill > 0) {
      // The last box is the one that punches through a wall, so it lights up
      // differently — it is a different kind of shot, not just a bigger one.
      ctx.fillStyle = i === CHARGE_BARS - 1 && fill >= 1 ? '#f0abfc' : '#c084fc';
      ctx.fillRect(sx, top, seg * fill, h);
    }
    // A full box reads as armed; a partial one as still filling.
    ctx.strokeStyle = fill >= 1 ? 'rgba(255, 255, 255, 0.65)' : 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 1;
    ctx.strokeRect(sx + 0.5, top + 0.5, seg - 1, h - 1);
  }

  ctx.fillStyle = level === 0 ? '#94a3b8' : level >= CHARGE_BARS ? '#f0abfc' : '#c084fc';
  ctx.font = '9px ui-monospace, Consolas, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(
    level === 0 ? 'KEEP HOLDING' : level >= CHARGE_BARS ? 'THROUGH WALL' : `PIERCE ${level}`,
    x,
    top + h + 3,
  );
  ctx.restore();
}

/**
 * The zombie tracker: an arrow orbiting the officer, pointing at the nearest
 * one. It is the only thing in the game that sees past the fog, so it is drawn
 * on the officer rather than out in the world — you are being told a bearing,
 * not shown a zombie.
 */
export function drawTracker(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  bearing: number,
  now: number,
): void {
  const dist = 30 + Math.sin(now * 0.006) * 3; // a slow pulse, so it reads as live
  const cx = x + Math.cos(bearing) * dist;
  const cy = y + Math.sin(bearing) * dist;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(bearing);
  ctx.fillStyle = '#f87171';
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(10, 0);
  ctx.lineTo(-5, -6);
  ctx.lineTo(-2, 0);
  ctx.lineTo(-5, 6);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/**
 * Where you are, when the scope has pushed the camera off you.
 *
 * The screen is wider than it is tall, so aiming up or down a street runs the
 * camera past your own officer long before aiming along one does. Rather than
 * cut the vertical reach down to whatever keeps him in frame — which is the
 * short reach the scope was meant to fix — he goes off the edge and this puts
 * a mark where he went. Nothing is drawn while he is on screen.
 *
 * On *top* of the fog, like the thermal pass: it is the one thing you must
 * never lose track of.
 */
export function drawSelfMarker(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  w: number,
  h: number,
): void {
  // Deeper along the bottom, where the slot bar lives — a marker drawn behind
  // your own inventory is a marker you cannot read.
  const inset = 26;
  const floor = 92;
  if (sx >= inset && sx <= w - inset && sy >= inset && sy <= h - floor) return;

  const cx = Math.max(inset, Math.min(w - inset, sx));
  const cy = Math.max(inset, Math.min(h - floor, sy));
  const angle = Math.atan2(sy - cy, sx - cx);

  ctx.save();
  ctx.strokeStyle = 'rgba(96, 165, 250, 0.9)';
  ctx.fillStyle = 'rgba(96, 165, 250, 0.28)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // A chevron off the ring, pointing the way he actually is.
  ctx.beginPath();
  for (const spread of [-0.6, 0.6]) {
    ctx.moveTo(cx + Math.cos(angle) * 20, cy + Math.sin(angle) * 20);
    ctx.lineTo(cx + Math.cos(angle + spread) * 13, cy + Math.sin(angle + spread) * 13);
  }
  ctx.stroke();
  ctx.restore();
}

/**
 * The ordinary hip-fire mark, and the spectator's pointer. A retro gunsight:
 * four ticks with a centre gap, a broken ranging ring — the targeting-computer
 * look without a full circle — and a centre pip. Amber, double-stroked.
 *
 * `command` is the spectator's variant with grey officers selected: the same
 * mark inside four corner brackets, so it reads as "click sends them here".
 *
 * `scale` shrinks the whole mark. A gunsight is sized for aiming a weapon at a
 * body, and a spectator is not aiming at anything — it is a *pointer*, and one
 * that has to land on a card button a fraction of its own diameter across. The
 * **stroke widths are left alone**: a mark at two thirds the size with two
 * thirds the stroke is a fainter mark rather than a smaller one, and the whole
 * of what makes this legible on a white wall is that it is stroked twice.
 */
export function drawCrosshair(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  command = false,
  scale = 1,
): void {
  ctx.save();
  ctx.lineCap = 'butt';

  const strokes = () => {
    ctx.beginPath();
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      ctx.moveTo(x + dx * 4 * scale, y + dy * 4 * scale);
      ctx.lineTo(x + dx * 10 * scale, y + dy * 10 * scale);
    }
    // The broken ring, four arcs with a gap between each.
    for (let i = 0; i < 4; i++) {
      const a0 = i * (Math.PI / 2) + 0.34;
      const a1 = a0 + Math.PI / 2 - 0.68;
      ctx.moveTo(x + Math.cos(a0) * 13 * scale, y + Math.sin(a0) * 13 * scale);
      ctx.arc(x, y, 13 * scale, a0, a1);
    }
    // Corner brackets, spectator-with-a-selection only.
    if (command) {
      for (const [dx, dy] of [
        [1, 1],
        [-1, 1],
        [1, -1],
        [-1, -1],
      ]) {
        ctx.moveTo(x + dx * 20 * scale, y + dy * 12 * scale);
        ctx.lineTo(x + dx * 20 * scale, y + dy * 20 * scale);
        ctx.lineTo(x + dx * 12 * scale, y + dy * 20 * scale);
      }
    }
    ctx.stroke();
  };

  ctx.strokeStyle = AIM_SHADOW;
  ctx.lineWidth = 3;
  strokes();
  ctx.strokeStyle = AIM_AMBER;
  ctx.lineWidth = 1.3;
  strokes();

  ctx.fillStyle = AIM_AMBER;
  ctx.strokeStyle = AIM_SHADOW;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(x, y, 1.4, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

// -------------------------------------------------------- the command card
/**
 * The spectator's command card: an SC2-shaped grid bottom-right, raised while
 * grey officers are selected.
 *
 * **`commandCardSlots` is the geometry and `drawCommandCard` is the paint**, the
 * same split `minimapFrame` / `drawMinimap` already uses and for the same
 * reason: the hit test and the drawing must be reading the same rectangles, and
 * two copies of that arithmetic is how you get a button you can see and cannot
 * press.
 *
 * Five columns by three rows, like SC2's. It is mostly empty on purpose — there
 * is one order on it — and the shape is fixed rather than packed, so a button
 * stays where it was the last time you looked for it. That is the same argument
 * as the dog's four hexagons, one of which is an empty outline.
 */
export const CARD_COLS = 5;
export const CARD_ROWS = 3;
const CARD_SLOT = 46;
const CARD_GAP = 4;
const CARD_PAD = 8;
const CARD_MARGIN = 18;

export interface CardSlot {
  x: number;
  y: number;
  w: number;
  h: number;
  col: number;
  row: number;
}

export function commandCardSlots(
  vw: number,
  vh: number,
): { frame: { x: number; y: number; w: number; h: number }; slots: CardSlot[] } {
  const w = CARD_COLS * CARD_SLOT + (CARD_COLS - 1) * CARD_GAP + CARD_PAD * 2;
  const h = CARD_ROWS * CARD_SLOT + (CARD_ROWS - 1) * CARD_GAP + CARD_PAD * 2;
  const frame = { x: vw - CARD_MARGIN - w, y: vh - CARD_MARGIN - h, w, h };
  const slots: CardSlot[] = [];
  for (let row = 0; row < CARD_ROWS; row++) {
    for (let col = 0; col < CARD_COLS; col++) {
      slots.push({
        x: frame.x + CARD_PAD + col * (CARD_SLOT + CARD_GAP),
        y: frame.y + CARD_PAD + row * (CARD_SLOT + CARD_GAP),
        w: CARD_SLOT,
        h: CARD_SLOT,
        col,
        row,
      });
    }
  }
  return { frame, slots };
}

/** Index into `slots` for a column and row. */
export function cardIndex(col: number, row: number): number {
  return row * CARD_COLS + col;
}

/**
 * Grid hotkeys: the key under each slot, in reading order.
 *
 * **The keyboard's own layout is the card's layout**, which is the whole idea
 * of a grid binding — you learn one shape and every page of every card obeys
 * it, rather than learning a letter per button. Five columns and three rows is
 * QWERT / ASDFG / ZXCVB, which is SC2's four-wide grid with the natural extra
 * column on each row.
 *
 * A key only does anything when the slot under it holds an *enabled* button, so
 * the fourteen empty ones cost nothing and `R` still hands a selection back to
 * its own AI. The card wins the key the day something is put in that slot,
 * which is the right way round — the card is the thing with a button on it, and
 * the letter is printed on the button where the binding cannot be a secret.
 *
 * **This is what took the spectator's camera off WASD.** W, A, S and D are four
 * of these fifteen, and a watcher pressing S to look down the street would
 * otherwise be pressing the second button of the bottom row.
 */
export const CARD_GRID_KEYS: string[] = [
  'KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT',
  'KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG',
  'KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB',
];

/** Which slot a key code drives, or -1. */
export function cardSlotForKey(code: string): number {
  return CARD_GRID_KEYS.indexOf(code);
}

/** What is actually on the card, per page. */
export type CardButtonId = 'shovel' | 'sandbag' | 'back';
export interface CardButton {
  id: CardButtonId;
  slot: number;
  label: string;
  /** Shown small in the slot's top-right, or -1 for no badge. */
  count: number;
  enabled: boolean;
}

export function commandCardButtons(page: 'root' | 'build', sandbags: number): CardButton[] {
  if (page === 'build') {
    return [
      {
        id: 'sandbag',
        slot: cardIndex(0, 0),
        label: 'SANDBAG WALL',
        count: sandbags,
        enabled: sandbags > 0,
      },
      { id: 'back', slot: cardIndex(CARD_COLS - 1, CARD_ROWS - 1), label: 'BACK', count: -1, enabled: true },
    ];
  }
  return [{ id: 'shovel', slot: cardIndex(0, CARD_ROWS - 1), label: 'BUILD', count: -1, enabled: true }];
}

function shovelIcon(ctx: CanvasRenderingContext2D, cx: number, cy: number, color: string): void {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'round';
  // Shaft, running corner to corner so the tool reads at this size.
  ctx.beginPath();
  ctx.moveTo(cx + 7, cy - 10);
  ctx.lineTo(cx - 2, cy + 1);
  ctx.stroke();
  // The T-grip at the top.
  ctx.beginPath();
  ctx.moveTo(cx + 3, cy - 12);
  ctx.lineTo(cx + 11, cy - 6);
  ctx.stroke();
  // Blade: a spade, point down.
  ctx.beginPath();
  ctx.moveTo(cx - 8, cy - 1);
  ctx.lineTo(cx + 2, cy + 5);
  ctx.lineTo(cx - 2, cy + 12);
  ctx.lineTo(cx - 11, cy + 6);
  ctx.closePath();
  ctx.fill();
}

function sandbagIcon(ctx: CanvasRenderingContext2D, cx: number, cy: number, color: string): void {
  ctx.fillStyle = color;
  ctx.strokeStyle = 'rgba(12, 8, 3, 0.55)';
  ctx.lineWidth = 1;
  // Two courses of three, stacked and offset — a wall rather than a sack.
  for (const [row, n] of [
    [1, 3],
    [-1, 2],
  ] as Array<[number, number]>) {
    for (let i = 0; i < n; i++) {
      const bw = 8;
      const x = cx - ((n * (bw + 2)) / 2 - 1) + i * (bw + 2);
      const y = cy + row * 5 - 3;
      ctx.beginPath();
      ctx.roundRect(x, y, bw, 7, 2.5);
      ctx.fill();
      ctx.stroke();
    }
  }
}

function backIcon(ctx: CanvasRenderingContext2D, cx: number, cy: number, color: string): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.4;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(cx + 9, cy);
  ctx.lineTo(cx - 7, cy);
  ctx.moveTo(cx - 1, cy - 7);
  ctx.lineTo(cx - 8, cy);
  ctx.lineTo(cx - 1, cy + 7);
  ctx.stroke();
}

export function drawCommandCard(
  ctx: CanvasRenderingContext2D,
  page: 'root' | 'build',
  sandbags: number,
  selected: number,
  hover: number,
  vw: number,
  vh: number,
): void {
  const { frame, slots } = commandCardSlots(vw, vh);
  const buttons = commandCardButtons(page, sandbags);

  ctx.save();
  ctx.lineJoin = 'round';

  // The panel. Dark, with the same warm amber edge the cursor family uses, so
  // the RTS furniture reads as one thing.
  ctx.fillStyle = 'rgba(10, 12, 15, 0.86)';
  ctx.strokeStyle = 'rgba(232, 161, 58, 0.45)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(frame.x + 0.5, frame.y + 0.5, frame.w - 1, frame.h - 1, 5);
  ctx.fill();
  ctx.stroke();

  // Every slot is drawn, filled or not. A card that grew a box at a time would
  // move the buttons already on it — the dog's empty fourth hexagon again.
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i];
    const button = buttons.find((b) => b.slot === i);
    const hovered = button !== undefined && button.enabled && hover === i;

    ctx.fillStyle = button ? (hovered ? 'rgba(58, 66, 78, 0.95)' : 'rgba(28, 32, 38, 0.9)') : 'rgba(18, 21, 25, 0.55)';
    ctx.strokeStyle = button
      ? hovered
        ? 'rgba(232, 161, 58, 0.9)'
        : 'rgba(232, 161, 58, 0.35)'
      : 'rgba(90, 100, 115, 0.16)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(s.x + 0.5, s.y + 0.5, s.w - 1, s.h - 1, 3);
    ctx.fill();
    ctx.stroke();
    if (!button) continue;

    const cx = s.x + s.w / 2;
    const cy = s.y + s.h / 2;
    const color = button.enabled ? '#e8a13a' : '#5b6472';
    if (button.id === 'shovel') shovelIcon(ctx, cx, cy, color);
    else if (button.id === 'sandbag') sandbagIcon(ctx, cx, cy, color);
    else backIcon(ctx, cx, cy, color);

    // The grid hotkey, bottom-left. Printed on the button rather than listed
    // somewhere else, because a binding you have to be told about separately is
    // a binding nobody uses — and the letter's *position on the card* is the
    // mnemonic, so seeing it in place is most of how the grid is learned.
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = button.enabled ? 'rgba(232, 161, 58, 0.75)' : 'rgba(91, 100, 114, 0.75)';
    ctx.fillText(CARD_GRID_KEYS[i].slice(3), s.x + 4, s.y + s.h - 4);

    // How many are left to build, in the slot's top-right. A number rather than
    // a bar: this is a stock that only goes down, and a bar implies a ceiling
    // it refills to.
    if (button.count >= 0) {
      ctx.fillStyle = 'rgba(8, 10, 13, 0.85)';
      ctx.beginPath();
      ctx.arc(s.x + s.w - 9, s.y + 9, 8, 0, TAU);
      ctx.fill();
      ctx.fillStyle = button.enabled ? '#e8a13a' : '#5b6472';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(button.count), s.x + s.w - 9, s.y + 9.5);
    }
  }

  // A strip over the card: what is selected, or what the cursor is over.
  const hoveredButton = buttons.find((b) => b.slot === hover);
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.fillStyle = hoveredButton ? '#e8a13a' : '#94a3b8';
  ctx.fillText(
    hoveredButton
      ? `${hoveredButton.label}  [${CARD_GRID_KEYS[hoveredButton.slot].slice(3)}]`
      : `${selected} OFFICER${selected === 1 ? '' : 'S'}`,
    frame.x + 2,
    frame.y - 5,
  );
  ctx.restore();
}
