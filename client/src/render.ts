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
  SmokeState,
  SpeechState,
  BlastState,
  Pond,
  DuckState,
  EmplacementState,
  FireState,
  BeaconState,
  MineState,
  BackupVehicleState,
  ShotKind,
  Wall,
  Window as WindowPane,
} from '../../shared/types.js';
import { ITEMS, type ItemId } from '../../shared/items.js';
import { pondRadiusAt } from '../../shared/pond.js';
import {
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
  VAN_WIDTH,
  RADIO_COOLDOWN_MS,
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
} from '../../shared/constants.js';

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

export function drawGround(ctx: CanvasRenderingContext2D, map: MapData): void {
  ctx.fillStyle = '#23262b';
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
  ctx.lineCap = 'round';
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
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'miter';
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

export function drawEntity(
  ctx: CanvasRenderingContext2D,
  e: EntityState,
  isSelf: boolean,
  now = 0,
  simple = false,
): void {
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
  const color = e.turning ? mix(base, ENTITY_COLOR.zombie, e.turning) : base;
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
    if (isSelf) {
      ctx.lineWidth = 2;
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
    for (const side of [-1, 1]) {
      const sx = x + perpX * shoulder * side;
      const sy = y + perpY * shoulder * side;
      const swing = e.breaking ? 1.62 + Math.sin(now * 0.045 + (side > 0 ? Math.PI : 0)) * 0.42 : reach;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + dirX * radius * swing, sy + dirY * radius * swing);
      ctx.stroke();
    }
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

  if (e.type === 'officer') {
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

export function drawStamina(
  ctx: CanvasRenderingContext2D,
  stamina: number,
  max: number,
  vw: number,
  vh: number,
  exhausted = false,
  recoveryThreshold = 75,
): void {
  const w = 180;
  const h = 8;
  const x = (vw - w) / 2;
  // Just above the inventory row, which occupies vh-46 upward.
  const y = vh - 58;
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
  for (const fx of [-L + 9, L - 11]) {
    for (const fy of [-W - 1, W - 4]) ctx.fillRect(fx, fy, 8, 5);
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
  ctx.roundRect(-5, -W + 3, 15, CAR_WIDTH - 6, 3);
  ctx.fill();
  ctx.fillStyle = 'rgba(148, 197, 253, 0.6)';
  ctx.fillRect(L - 16, -W + 4, 5, CAR_WIDTH - 8);
  ctx.fillRect(-L + 11, -W + 4, 4, CAR_WIDTH - 8);

  ctx.fillStyle = '#fef9c3';
  ctx.fillRect(L - 3, -W + 3, 3, 4);
  ctx.fillRect(L - 3, W - 7, 3, 4);

  const beat = Math.sin(now * 0.012) > 0;
  ctx.fillStyle = beat ? '#ef4444' : 'rgba(120, 30, 30, 0.65)';
  ctx.fillRect(-4, -W + 2, 8, 4);
  ctx.fillStyle = beat ? 'rgba(30, 60, 140, 0.65)' : '#3b82f6';
  ctx.fillRect(-4, W - 6, 8, 4);
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
  ctx.fillStyle = '#e8e4dc';
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
    const bx = wx(marker.x);
    const by = wy(marker.y);
    ctx.strokeStyle = marker.color;
    ctx.lineWidth = 2;
    ctx.strokeRect(bx - 6, by - 6, 12, 12);
    // A dot in the middle, so a small square still has a definite centre at
    // the scale the whole city is drawn at.
    ctx.fillStyle = marker.color;
    ctx.fillRect(bx - 1.5, by - 1.5, 3, 3);
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
export function drawEmplacements(
  ctx: CanvasRenderingContext2D,
  guns: EmplacementState[],
  view: Viewport,
): void {
  for (const gun of guns) {
    if (!visible(view, gun.x, gun.y, 120)) continue;

    // Sandbags. They wear down rather than vanish, so the colour dries out as
    // they take punishment — you can see one is nearly gone before it goes.
    if (gun.bags) {
      const b = gun.bags;
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.angle);
      const worn = 0.35 + 0.65 * b0(gun.bagHp);
      ctx.fillStyle = `rgb(${Math.round(120 + 40 * worn)}, ${Math.round(104 + 30 * worn)}, ${Math.round(72 + 20 * worn)})`;
      ctx.strokeStyle = 'rgba(31, 27, 20, 0.85)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(-b.hw, -b.hh, b.hw * 2, b.hh * 2, 4);
      ctx.fill();
      ctx.stroke();
      // Three bags, so it reads as stacked rather than as a plank.
      ctx.strokeStyle = 'rgba(31, 27, 20, 0.5)';
      ctx.lineWidth = 1;
      for (const t of [-0.34, 0.34]) {
        ctx.beginPath();
        ctx.moveTo(b.hw * t, -b.hh);
        ctx.lineTo(b.hw * t, b.hh);
        ctx.stroke();
      }
      ctx.restore();
    }

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

export function drawPickups(
  ctx: CanvasRenderingContext2D,
  pickups: PickupState[],
  view: Viewport,
  now: number,
): void {
  for (const p of pickups) {
    if (!visible(view, p.x, p.y, 30)) continue;
    const def = ITEMS[p.item];
    const bob = Math.sin(now * 0.004 + p.x * 0.05) * 2;

    ctx.save();
    ctx.translate(p.x, p.y + bob);

    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.beginPath();
    ctx.ellipse(0, 9, 10, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // A gun with nothing left in it goes grey, so it reads as scenery at a
    // glance rather than something worth crossing the street for.
    const spent = p.ammo === 0;
    ctx.fillStyle = spent ? EMPTY_PICKUP_COLOR : def.color;
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.8)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(-8, -8, 16, 16, 3);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = spent ? '#1f2937' : '#0f172a';
    ctx.font = 'bold 7px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(def.short.slice(0, 4), 0, 0);
    if (spent) {
      // A bar through it: colour alone is easy to miss on a dim item.
      ctx.strokeStyle = 'rgba(31, 41, 55, 0.9)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-7, 7);
      ctx.lineTo(7, -7);
      ctx.stroke();
    }
    ctx.restore();
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
 * The scoped reticle: a ranging circle with ticks, rather than the four stubs
 * of the ordinary crosshair. Deliberately larger — you are looking at a lot
 * more ground than usual and a small mark gets lost in it.
 */
export function drawReticle(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.save();
  ctx.strokeStyle = 'rgba(34, 211, 238, 0.85)';
  ctx.lineWidth = 1;

  ctx.beginPath();
  ctx.arc(x, y, 26, 0, Math.PI * 2);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(x, y, 2.2, 0, Math.PI * 2);
  ctx.stroke();

  // Four arms into the ring, with a gap at the middle so the mark stays clear.
  ctx.beginPath();
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

  // Range ticks down the lower arm, the way a real scope carries them.
  ctx.strokeStyle = 'rgba(34, 211, 238, 0.5)';
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

export function drawCrosshair(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x - 8, y);
  ctx.lineTo(x - 3, y);
  ctx.moveTo(x + 3, y);
  ctx.lineTo(x + 8, y);
  ctx.moveTo(x, y - 8);
  ctx.lineTo(x, y - 3);
  ctx.moveTo(x, y + 3);
  ctx.lineTo(x, y + 8);
  ctx.stroke();
}
