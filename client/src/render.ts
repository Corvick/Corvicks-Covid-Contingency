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
  PickupState,
  SmokeState,
  SpeechState,
  BlastState,
  Pond,
  DuckState,
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
  SOLDIER_COLOR,
  HELI_RADIUS,
  HELI_SHADOW_ALPHA,
  WALL_THICKNESS,
  GUN_SLOTS,
  BLAST_RADIUS,
  BLAST_MS,
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

function visible(view: Viewport, x: number, y: number, pad: number): boolean {
  return (
    x + pad >= view.x && x - pad <= view.x + view.w && y + pad >= view.y && y - pad <= view.y + view.h
  );
}

export function drawGround(ctx: CanvasRenderingContext2D, map: MapData): void {
  ctx.fillStyle = '#23262b';
  ctx.fillRect(0, 0, map.width, map.height);
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

    if (duck.flying) {
      // Shadow on the ground below, offset so it reads as height.
      ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
      ctx.beginPath();
      ctx.ellipse(duck.x + 7, duck.y + 9, 5, 2.5, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = 'rgba(240, 240, 235, 0.95)';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(duck.x, duck.y);
        ctx.lineTo(duck.x - dirY * 9 * side - dirX * 3, duck.y + dirX * 9 * side - dirY * 3);
        ctx.stroke();
      }
    }

    ctx.beginPath();
    ctx.ellipse(duck.x, duck.y, 5.5, 4, duck.facing, 0, Math.PI * 2);
    ctx.fillStyle = duck.flying ? '#e8e6df' : '#d8d4c8';
    ctx.fill();
    ctx.strokeStyle = 'rgba(40, 38, 32, 0.7)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Head and bill.
    ctx.beginPath();
    ctx.arc(duck.x + dirX * 5, duck.y + dirY * 5, 2.6, 0, Math.PI * 2);
    ctx.fillStyle = '#3f6b3a';
    ctx.fill();
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(duck.x + dirX * 7, duck.y + dirY * 7);
    ctx.lineTo(duck.x + dirX * 10, duck.y + dirY * 10);
    ctx.stroke();
  }
}

/** Bushes draw over entities so anyone standing in one is partly concealed. */
export function drawBushes(ctx: CanvasRenderingContext2D, bushes: Bush[], view: Viewport): void {
  for (const bush of bushes) {
    if (!visible(view, bush.x, bush.y, bush.r + 8)) continue;

    ctx.beginPath();
    ctx.arc(bush.x, bush.y, bush.r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(24, 86, 48, 0.88)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(15, 58, 32, 0.95)';
    ctx.stroke();
  }
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
  const color = e.soldier
    ? SOLDIER_COLOR
    : e.npc && e.type === 'officer'
      ? NPC_OFFICER_COLOR
      : ENTITY_COLOR[e.type];

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
    ctx.lineWidth = radius * 0.5;
    ctx.lineCap = 'round';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(x + perpX * shoulder * side, y + perpY * shoulder * side);
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
  ctx.fillStyle = shade(color, -45);
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

  // Kevlar reads as a grey band inside the body rather than a halo around it,
  // so it never competes with the white self-ring or the infected ring.
  if (e.armour) {
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(203, 213, 225, 0.85)';
    ctx.beginPath();
    ctx.arc(x, y, radius * 0.66, 0, Math.PI * 2);
    ctx.stroke();
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
  hit: boolean;
  born: number;
}

export function drawTracers(
  ctx: CanvasRenderingContext2D,
  tracers: Tracer[],
  now: number,
  lifetime: number,
): void {
  ctx.lineCap = 'butt';
  for (const tracer of tracers) {
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
export function drawSpeechBubbles(
  ctx: CanvasRenderingContext2D,
  lines: SpeechState[],
  view: Viewport,
): void {
  for (const line of lines) {
    if (!visible(view, line.x, line.y, 90)) continue;
    drawBubble(ctx, line.x, line.y, ENTITY_RADIUS.human, line.text);
  }
}

function drawBubble(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  radius: number,
  text: string,
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

  ctx.fillStyle = 'rgba(248, 250, 252, 0.95)';
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.65)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 6);
  ctx.fill();
  ctx.stroke();

  // Tail
  ctx.beginPath();
  ctx.moveTo(px - 5, y + h);
  ctx.lineTo(px + 5, y + h);
  ctx.lineTo(px, y + h + 7);
  ctx.closePath();
  ctx.fillStyle = 'rgba(248, 250, 252, 0.95)';
  ctx.fill();

  ctx.fillStyle = '#0f172a';
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

    ctx.fillStyle = def.color;
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.8)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(-8, -8, 16, 16, 3);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 7px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(def.short.slice(0, 4), 0, 0);
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
): void {
  const cells: Array<{ key: string; item: ItemId | null; ammo: number | null }> = [
    { key: '0', item: 'pistol', ammo: null },
  ];
  for (let i = 0; i < inv.guns.length; i++) {
    const g = inv.guns[i];
    cells.push({ key: String(i + 1), item: g?.item ?? null, ammo: g?.ammo ?? null });
  }
  for (let i = 0; i < 6; i++) {
    cells.push({ key: String(i + 4), item: inv.utilities[i] ?? null, ammo: null });
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
    const isGunSlot = i >= 1 && i <= GUN_SLOTS;
    const isUtilitySlot = i > GUN_SLOTS;
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
