import type {
  Building,
  Bush,
  Door,
  MapData,
  Pond,
  Wall,
  Window as WindowPane,
} from '../../shared/types.js';
import {
  WORLD_WIDTH,
  WORLD_HEIGHT,
  TILE,
  WALL_THICKNESS,
  BOUNDARY_THICKNESS,
  BLOCK_SIZE,
  ROAD_SIZE,
  MAP_MARGIN,
  EMPTY_LOT_CHANCE,
  PARK_BUSHES_PER_BLOCK,
  SCATTER_BUSH_COUNT,
  WINDOW_CHANCE,
  WINDOW_TILES,
  BIG_BUILDING_MIN,
  BIG_BUILDING_MAX,
  BIG_BUILDING_MIN_TILES,
  BIG_BUILDING_MAX_TILES,
  BLOCK_STAGGER,
  EDGE_BUILDING_COUNT,
  EDGE_BUILDING_MIN_TILES,
  EDGE_BUILDING_MAX_TILES,
  ROOM_MIN_TILES,
  INTERIOR_EXTRA_DOOR_CHANCE,
  CORNER_COMPLEX_MIN_TILES,
  CORNER_COMPLEX_MAX_TILES,
  CORNER_COMPLEX_ROOM_MIN,
  CORNER_COMPLEX_MAX_CUTS,
  POND_MIN_RADIUS,
  POND_MAX_RADIUS,
} from '../../shared/constants.js';
import { NavGrid } from './navgrid.js';

type Rng = () => number;

/** Width of every doorway, in tiles. */
const GAP = 2;

function clampTo(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/** Small deterministic PRNG so a seed reproduces an exact city. */
function mulberry32(seed: number): Rng {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Segment {
  horiz: boolean;
  a: number; // start along the run, in tiles
  b: number; // end along the run, in tiles
  line: number; // perpendicular offset, in tiles
}

/**
 * Walk the boundary of a tile footprint and emit one wall segment per run of
 * exposed tile edges. Handles rectangles, L-shapes and T-shapes uniformly
 * because it only ever looks at "is this tile solid and its neighbour not".
 */
function footprintToSegments(tiles: Set<string>, w: number, h: number): Segment[] {
  const solid = (x: number, y: number) => tiles.has(`${x},${y}`);
  const segments: Segment[] = [];

  for (let y = 0; y <= h; y++) {
    let start = -1;
    for (let x = 0; x <= w; x++) {
      const isEdge = x < w && solid(x, y - 1) !== solid(x, y);
      if (isEdge && start < 0) start = x;
      if (!isEdge && start >= 0) {
        segments.push({ horiz: true, a: start, b: x, line: y });
        start = -1;
      }
    }
  }

  for (let x = 0; x <= w; x++) {
    let start = -1;
    for (let y = 0; y <= h; y++) {
      const isEdge = y < h && solid(x - 1, y) !== solid(x, y);
      if (isEdge && start < 0) start = y;
      if (!isEdge && start >= 0) {
        segments.push({ horiz: false, a: start, b: y, line: x });
        start = -1;
      }
    }
  }

  return segments;
}

/**
 * Split 1-2 long wall runs to leave a 2-tile doorway, and report where those
 * openings ended up. Knowing the actual door positions is what lets NPCs
 * reason about a way out instead of guessing at the building's edges.
 */
function punchDoors(segments: Segment[], rand: Rng): { segments: Segment[]; gaps: Segment[] } {
  const candidates = segments.filter((s) => s.b - s.a >= GAP + 2);

  // A building with no way in is a building nobody can shelter in. If no run
  // is long enough to take a doorway with a margin either side, open the
  // longest one that will take a doorway at all.
  if (candidates.length === 0) {
    let longest: Segment | null = null;
    for (const s of segments) {
      if (s.b - s.a >= GAP && (!longest || s.b - s.a > longest.b - longest.a)) longest = s;
    }
    if (!longest) return { segments, gaps: [] };
    const rest = segments.filter((s) => s !== longest);
    return { segments: rest, gaps: [{ ...longest }] };
  }

  const doorCount = Math.min(candidates.length, 1 + Math.floor(rand() * 2));
  const chosen = new Set<Segment>();
  while (chosen.size < doorCount) {
    chosen.add(candidates[Math.floor(rand() * candidates.length)]);
  }

  const out: Segment[] = [];
  const gaps: Segment[] = [];
  for (const seg of segments) {
    if (!chosen.has(seg)) {
      out.push(seg);
      continue;
    }
    const span = seg.b - seg.a;
    const start = seg.a + 1 + Math.floor(rand() * (span - GAP - 1));
    if (start > seg.a) out.push({ ...seg, b: start });
    if (start + GAP < seg.b) out.push({ ...seg, a: start + GAP });
    gaps.push({ ...seg, a: start, b: start + GAP });
  }
  return { segments: out, gaps };
}

/** World-space centre of a doorway gap. */
function gapToDoor(
  gap: Segment,
  originX: number,
  originY: number,
  building: number,
  interior = false,
): Door {
  const mid = (gap.a + gap.b) / 2;
  const halfSpan = ((gap.b - gap.a) * TILE) / 2;
  return gap.horiz
    ? { x: originX + mid * TILE, y: originY + gap.line * TILE, building, halfSpan, horiz: true, interior }
    : { x: originX + gap.line * TILE, y: originY + mid * TILE, building, halfSpan, horiz: false, interior };
}

/**
 * Merge a tile footprint into row rectangles, so point-in-building tests match
 * the real carved shape rather than its bounding box.
 */
function tilesToRects(tiles: Set<string>, w: number, h: number, originX: number, originY: number): Wall[] {
  const rects: Wall[] = [];
  for (let y = 0; y < h; y++) {
    let runStart = -1;
    for (let x = 0; x <= w; x++) {
      const solid = x < w && tiles.has(`${x},${y}`);
      if (solid && runStart < 0) runStart = x;
      if (!solid && runStart >= 0) {
        rects.push({
          x: originX + runStart * TILE,
          y: originY + y * TILE,
          w: (x - runStart) * TILE,
          h: TILE,
        });
        runStart = -1;
      }
    }
  }
  return rects;
}

function buildingAt(
  walls: Wall[],
  windows: WindowPane[],
  buildings: Building[],
  doors: Door[],
  rand: Rng,
  blockX: number,
  blockY: number,
): Building {
  // Vary the footprint across whatever the block allows, rather than keying
  // off a fixed floor that collapses to a single size on smaller blocks.
  const maxTiles = Math.floor(BLOCK_SIZE / TILE);
  const minTiles = Math.min(5, maxTiles - 1);
  const span = Math.max(1, maxTiles - minTiles);
  const w = minTiles + Math.floor(rand() * span);
  const h = minTiles + Math.floor(rand() * span);

  // Stagger and rounding can push a block past the edge — keep the footprint
  // inside the perimeter, flush against it if need be.
  const lo = BOUNDARY_THICKNESS;
  const originX = clampTo(
    blockX + Math.floor(rand() * Math.max(1, BLOCK_SIZE - w * TILE)),
    lo,
    WORLD_WIDTH - lo - w * TILE,
  );
  const originY = clampTo(
    blockY + Math.floor(rand() * Math.max(1, BLOCK_SIZE - h * TILE)),
    lo,
    WORLD_HEIGHT - lo - h * TILE,
  );

  const tiles = new Set<string>();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) tiles.add(`${x},${y}`);
  }

  // Carve the rectangle into an L or T often enough to keep blocks varied.
  const shape = rand();
  if (shape < 0.3) {
    const cw = Math.max(2, Math.floor(w / 2));
    const ch = Math.max(2, Math.floor(h / 2));
    const ox = rand() < 0.5 ? 0 : w - cw;
    const oy = rand() < 0.5 ? 0 : h - ch;
    for (let y = oy; y < oy + ch; y++) {
      for (let x = ox; x < ox + cw; x++) tiles.delete(`${x},${y}`);
    }
  } else if (shape < 0.5) {
    const cw = Math.max(2, Math.floor(w / 3));
    const ch = Math.max(2, Math.floor(h / 2));
    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) tiles.delete(`${x},${y}`);
      for (let x = w - cw; x < w; x++) tiles.delete(`${x},${y}`);
    }
  }

  const punched = punchDoors(footprintToSegments(tiles, w, h), rand);
  const segments = punched.segments;
  const t = WALL_THICKNESS;

  /** Emit a run as solid wall, or split it around a glazed pane. */
  const emit = (seg: Segment) => {
    const span = seg.b - seg.a;
    const glazed = span >= WINDOW_TILES + 2 && rand() < WINDOW_CHANCE;
    if (!glazed) {
      pushRun(walls, seg, seg.a, seg.b, originX, originY, t);
      return;
    }
    // Centre the pane in the run so it never lands on a corner.
    const start = seg.a + 1 + Math.floor(rand() * (span - WINDOW_TILES - 1));
    const end = start + WINDOW_TILES;
    if (start > seg.a) pushRun(walls, seg, seg.a, start, originX, originY, t);
    if (end < seg.b) pushRun(walls, seg, end, seg.b, originX, originY, t);
    pushRun(windows, seg, start, end, originX, originY, t);
  };

  for (const seg of segments) emit(seg);

  const index = buildings.length;
  const doorIds: number[] = [];
  for (const gap of punched.gaps) {
    doorIds.push(doors.length);
    doors.push(gapToDoor(gap, originX, originY, index));
  }

  return {
    x: originX,
    y: originY,
    w: w * TILE,
    h: h * TILE,
    rects: tilesToRects(tiles, w, h, originX, originY),
    doors: doorIds,
  };
}

/** Turn a tile range along a run into one world-space rectangle. */
function pushRun(
  out: Wall[],
  seg: Segment,
  a: number,
  b: number,
  originX: number,
  originY: number,
  t: number,
): void {
  if (b <= a) return;
  if (seg.horiz) {
    const x1 = originX + a * TILE;
    const x2 = originX + b * TILE;
    const y = originY + seg.line * TILE;
    out.push({ x: x1 - t / 2, y: y - t / 2, w: x2 - x1 + t, h: t });
  } else {
    const y1 = originY + a * TILE;
    const y2 = originY + b * TILE;
    const x = originX + seg.line * TILE;
    out.push({ x: x - t / 2, y: y1 - t / 2, w: t, h: y2 - y1 + t });
  }
}

/** Partition positions along one axis, in tiles, each room at least `minRoom`. */
function roomCuts(extent: number, rand: Rng, minRoom: number, maxCuts: number): number[] {
  const cuts: number[] = [];
  let pos = minRoom + Math.floor(rand() * (minRoom + 1));
  while (pos <= extent - minRoom && cuts.length < maxCuts) {
    cuts.push(pos);
    pos += minRoom + Math.floor(rand() * (minRoom + 2));
  }
  return cuts;
}

/**
 * Carve a rectangular interior into rooms, and connect them.
 *
 * Doorways follow a random spanning tree over the room grid, so every room can
 * be walked to from every other one. Laying each partition as one long wall
 * with a single gap somewhere along it — which is what this replaced — sealed
 * off whole corners of a building whenever a crossing partition happened to
 * land on the wrong side of that gap.
 */
function partitionRooms(
  walls: Wall[],
  doors: Door[],
  doorIds: number[],
  rand: Rng,
  originX: number,
  originY: number,
  w: number,
  h: number,
  index: number,
  minRoom: number,
  maxCuts: number,
): { xs: number[]; ys: number[] } {
  const t = WALL_THICKNESS;
  const xs = [0, ...roomCuts(w, rand, minRoom, maxCuts), w];
  const ys = [0, ...roomCuts(h, rand, minRoom, maxCuts), h];
  const cols = xs.length - 1;
  const rows = ys.length - 1;

  // Randomised depth-first spanning tree over the rooms. `openV` keys a
  // doorway through vertical line i between rooms (i-1,r) and (i,r); `openH`
  // one through horizontal line j between rooms (c,j-1) and (c,j).
  const openV = new Set<string>();
  const openH = new Set<string>();
  const seen = new Set<string>(['0,0']);
  const stack: Array<[number, number]> = [[0, 0]];

  while (stack.length > 0) {
    const [c, r] = stack[stack.length - 1];
    const options: Array<[number, number]> = [];
    if (c > 0 && !seen.has(`${c - 1},${r}`)) options.push([c - 1, r]);
    if (c < cols - 1 && !seen.has(`${c + 1},${r}`)) options.push([c + 1, r]);
    if (r > 0 && !seen.has(`${c},${r - 1}`)) options.push([c, r - 1]);
    if (r < rows - 1 && !seen.has(`${c},${r + 1}`)) options.push([c, r + 1]);

    if (options.length === 0) {
      stack.pop();
      continue;
    }
    const [nc, nr] = options[Math.floor(rand() * options.length)];
    if (nc !== c) openV.add(`${Math.max(c, nc)},${r}`);
    else openH.add(`${c},${Math.max(r, nr)}`);
    seen.add(`${nc},${nr}`);
    stack.push([nc, nr]);
  }

  // A bare spanning tree reads as a maze — a few extra openings give it loops.
  for (let i = 1; i < xs.length - 1; i++) {
    for (let r = 0; r < rows; r++) {
      if (rand() < INTERIOR_EXTRA_DOOR_CHANCE) openV.add(`${i},${r}`);
    }
  }
  for (let j = 1; j < ys.length - 1; j++) {
    for (let c = 0; c < cols; c++) {
      if (rand() < INTERIOR_EXTRA_DOOR_CHANCE) openH.add(`${c},${j}`);
    }
  }

  /** One room's worth of partition wall, with or without a doorway in it. */
  const run = (seg: Segment, lo: number, hi: number, open: boolean) => {
    if (!open || hi - lo < GAP + 2) {
      pushRun(walls, seg, lo, hi, originX, originY, t);
      return;
    }
    const start = lo + 1 + Math.floor(rand() * (hi - lo - GAP - 1));
    pushRun(walls, seg, lo, start, originX, originY, t);
    pushRun(walls, seg, start + GAP, hi, originX, originY, t);
    doorIds.push(doors.length);
    doors.push(gapToDoor({ ...seg, a: start, b: start + GAP }, originX, originY, index, true));
  };

  for (let i = 1; i < xs.length - 1; i++) {
    for (let r = 0; r < rows; r++) {
      const seg: Segment = { horiz: false, a: ys[r], b: ys[r + 1], line: xs[i] };
      run(seg, ys[r], ys[r + 1], openV.has(`${i},${r}`));
    }
  }
  for (let j = 1; j < ys.length - 1; j++) {
    for (let c = 0; c < cols; c++) {
      const seg: Segment = { horiz: true, a: xs[c], b: xs[c + 1], line: ys[j] };
      run(seg, xs[c], xs[c + 1], openH.has(`${c},${j}`));
    }
  }

  return { xs, ys };
}

/**
 * A doorway on one side of a shell, placed inside a single room's span so it
 * never opens onto the edge of a partition wall.
 */
function shellDoorGap(bounds: number[], rand: Rng): { a: number; b: number } | null {
  const rooms: Array<{ lo: number; hi: number }> = [];
  for (let i = 0; i < bounds.length - 1; i++) {
    if (bounds[i + 1] - bounds[i] >= GAP + 2) rooms.push({ lo: bounds[i], hi: bounds[i + 1] });
  }
  if (rooms.length === 0) return null;

  const room = rooms[Math.floor(rand() * rooms.length)];
  const start = room.lo + 1 + Math.floor(rand() * (room.hi - room.lo - GAP - 1));
  return { a: start, b: start + GAP };
}

/** One side of a rectangular shell, split around its doorways, with the odd pane. */
function emitShellSide(
  walls: Wall[],
  windows: WindowPane[],
  seg: Segment,
  gaps: Array<{ a: number; b: number }>,
  originX: number,
  originY: number,
  rand: Rng,
  glazeChance: number,
): void {
  const t = WALL_THICKNESS;
  const runs: Array<{ a: number; b: number }> = [];
  let cursor = seg.a;
  for (const gap of [...gaps].sort((p, q) => p.a - q.a)) {
    if (gap.a > cursor) runs.push({ a: cursor, b: gap.a });
    cursor = Math.max(cursor, gap.b);
  }
  if (cursor < seg.b) runs.push({ a: cursor, b: seg.b });

  for (const piece of runs) {
    const span = piece.b - piece.a;
    if (span >= WINDOW_TILES + 2 && rand() < glazeChance) {
      const start = piece.a + 1 + Math.floor(rand() * (span - WINDOW_TILES - 1));
      const end = start + WINDOW_TILES;
      pushRun(walls, seg, piece.a, start, originX, originY, t);
      pushRun(walls, seg, end, piece.b, originX, originY, t);
      pushRun(windows, seg, start, end, originX, originY, t);
    } else {
      pushRun(walls, seg, piece.a, piece.b, originX, originY, t);
    }
  }
}

type Side = 'north' | 'east' | 'south' | 'west';

/**
 * A rectangular building carved into connected rooms. `buried` names sides
 * that sit inside the map's perimeter wall — those get no doors and no glass,
 * since there's nothing on the far side of them to reach.
 */
function roomedBuildingAt(
  walls: Wall[],
  windows: WindowPane[],
  buildings: Building[],
  doors: Door[],
  rand: Rng,
  originX: number,
  originY: number,
  w: number,
  h: number,
  minRoom: number,
  maxCuts: number,
  buried: Set<Side> = new Set(),
): Building {
  const index = buildings.length;
  const doorIds: number[] = [];
  const { xs, ys } = partitionRooms(
    walls,
    doors,
    doorIds,
    rand,
    originX,
    originY,
    w,
    h,
    index,
    minRoom,
    maxCuts,
  );

  const sides: Array<{ facing: Side; seg: Segment; bounds: number[] }> = [
    { facing: 'north', seg: { horiz: true, a: 0, b: w, line: 0 }, bounds: xs },
    { facing: 'south', seg: { horiz: true, a: 0, b: w, line: h }, bounds: xs },
    { facing: 'west', seg: { horiz: false, a: 0, b: h, line: 0 }, bounds: ys },
    { facing: 'east', seg: { horiz: false, a: 0, b: h, line: w }, bounds: ys },
  ];

  const open = sides.filter((s) => !buried.has(s.facing));
  const wanted = Math.min(open.length, 1 + Math.floor(rand() * 2));
  const chosen = new Set<Side>();
  while (chosen.size < wanted && open.length > 0) {
    chosen.add(open[Math.floor(rand() * open.length)].facing);
  }

  // Pick every doorway before any wall is laid, so the fallback below can
  // still open one rather than recording a door in the middle of solid wall.
  const gapsBySide = new Map<Side, Array<{ a: number; b: number }>>();
  let punched = 0;
  for (const side of sides) {
    const gaps: Array<{ a: number; b: number }> = [];
    if (chosen.has(side.facing)) {
      const gap = shellDoorGap(side.bounds, rand);
      if (gap) {
        gaps.push(gap);
        punched++;
      }
    }
    gapsBySide.set(side.facing, gaps);
  }

  // Should never happen — every room is at least `minRoom` tiles — but a
  // sealed landmark would be far worse than a doorway in an awkward place.
  if (punched === 0 && open.length > 0) {
    const side = open[0];
    const mid = side.seg.a + Math.floor((side.seg.b - side.seg.a - GAP) / 2);
    gapsBySide.get(side.facing)!.push({ a: mid, b: mid + GAP });
  }

  for (const side of sides) {
    const gaps = gapsBySide.get(side.facing)!;
    for (const gap of gaps) {
      doorIds.push(doors.length);
      doors.push(gapToDoor({ ...side.seg, a: gap.a, b: gap.b }, originX, originY, index));
    }
    emitShellSide(
      walls,
      windows,
      side.seg,
      gaps,
      originX,
      originY,
      rand,
      buried.has(side.facing) ? 0 : WINDOW_CHANCE * 1.6,
    );
  }

  const tiles = new Set<string>();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) tiles.add(`${x},${y}`);
  }

  return {
    x: originX,
    y: originY,
    w: w * TILE,
    h: h * TILE,
    rects: tilesToRects(tiles, w, h, originX, originY),
    doors: doorIds,
  };
}

/** An oversized landmark building carved into connected rooms. */
function bigBuildingAt(
  walls: Wall[],
  windows: WindowPane[],
  buildings: Building[],
  doors: Door[],
  rand: Rng,
  originX: number,
  originY: number,
  w: number,
  h: number,
): Building {
  return roomedBuildingAt(
    walls,
    windows,
    buildings,
    doors,
    rand,
    originX,
    originY,
    w,
    h,
    ROOM_MIN_TILES,
    2,
  );
}

/**
 * The corner complex: one oversized, many-roomed building pushed flush into a
 * corner of the map. Its two outer walls sit on the perimeter and read as part
 * of it; the two facing the city carry every door and window.
 */
function cornerComplexAt(
  walls: Wall[],
  windows: WindowPane[],
  buildings: Building[],
  doors: Door[],
  rand: Rng,
): { building: Building; box: Wall } {
  const span = CORNER_COMPLEX_MAX_TILES - CORNER_COMPLEX_MIN_TILES + 1;
  const w = CORNER_COMPLEX_MIN_TILES + Math.floor(rand() * span);
  const h = CORNER_COMPLEX_MIN_TILES + Math.floor(rand() * span);

  const right = rand() < 0.5;
  const bottom = rand() < 0.5;
  const B = BOUNDARY_THICKNESS;
  const originX = right ? WORLD_WIDTH - B - w * TILE : B;
  const originY = bottom ? WORLD_HEIGHT - B - h * TILE : B;

  // The two sides against the perimeter are buried in it.
  const buried = new Set<Side>([right ? 'east' : 'west', bottom ? 'south' : 'north']);

  const building = roomedBuildingAt(
    walls,
    windows,
    buildings,
    doors,
    rand,
    originX,
    originY,
    w,
    h,
    CORNER_COMPLEX_ROOM_MIN,
    CORNER_COMPLEX_MAX_CUTS,
    buried,
  );
  return { building, box: { x: originX, y: originY, w: w * TILE, h: h * TILE } };
}

/**
 * A plain rectangular building butted straight onto the perimeter wall, which
 * doubles as its outer side. The doorway is always punched on the wall facing
 * into the map, so it can actually be entered.
 */
function edgeBuildingAt(
  walls: Wall[],
  windows: WindowPane[],
  buildings: Building[],
  doors: Door[],
  rand: Rng,
  originX: number,
  originY: number,
  w: number,
  h: number,
  inward: 'north' | 'east' | 'south' | 'west',
): Building {
  const t = WALL_THICKNESS;
  const index = buildings.length;
  const doorIds: number[] = [];
  const runs: Array<{ seg: Segment; facing: 'north' | 'east' | 'south' | 'west' }> = [
    { seg: { horiz: true, a: 0, b: w, line: 0 }, facing: 'north' },
    { seg: { horiz: true, a: 0, b: w, line: h }, facing: 'south' },
    { seg: { horiz: false, a: 0, b: h, line: 0 }, facing: 'west' },
    { seg: { horiz: false, a: 0, b: h, line: w }, facing: 'east' },
  ];

  for (const { seg, facing } of runs) {
    const span = seg.b - seg.a;

    if (facing === inward && span >= 4) {
      // Doorway, centred-ish on the side that faces the city.
      const start = seg.a + 1 + Math.floor(rand() * (span - 3));
      pushRun(walls, seg, seg.a, start, originX, originY, t);
      pushRun(walls, seg, start + 2, seg.b, originX, originY, t);
      doorIds.push(doors.length);
      doors.push(gapToDoor({ ...seg, a: start, b: start + 2 }, originX, originY, index));
      continue;
    }

    // Occasional pane on a side that isn't buried in the perimeter.
    if (facing !== opposite(inward) && span >= WINDOW_TILES + 2 && rand() < WINDOW_CHANCE) {
      const start = seg.a + 1 + Math.floor(rand() * (span - WINDOW_TILES - 1));
      pushRun(walls, seg, seg.a, start, originX, originY, t);
      pushRun(walls, seg, start + WINDOW_TILES, seg.b, originX, originY, t);
      pushRun(windows, seg, start, start + WINDOW_TILES, originX, originY, t);
      continue;
    }

    pushRun(walls, seg, seg.a, seg.b, originX, originY, t);
  }

  // Edge buildings are always a plain filled rectangle.
  const rects: Wall[] = [];
  for (let y = 0; y < h; y++) {
    rects.push({ x: originX, y: originY + y * TILE, w: w * TILE, h: TILE });
  }
  return { x: originX, y: originY, w: w * TILE, h: h * TILE, rects, doors: doorIds };
}

function opposite(side: 'north' | 'east' | 'south' | 'west'): 'north' | 'east' | 'south' | 'west' {
  if (side === 'north') return 'south';
  if (side === 'south') return 'north';
  if (side === 'east') return 'west';
  return 'east';
}

function overlapsAny(x: number, y: number, r: number, boxes: Wall[], pad: number): boolean {
  for (const box of boxes) {
    if (
      x + r > box.x - pad &&
      x - r < box.x + box.w + pad &&
      y + r > box.y - pad &&
      y - r < box.y + box.h + pad
    ) {
      return true;
    }
  }
  return false;
}

/** Places bushes, rejecting any that would land inside or against a building. */
function scatterBushes(
  bushes: Bush[],
  rand: Rng,
  x: number,
  y: number,
  w: number,
  h: number,
  count: number,
  buildings: Wall[],
): void {
  for (let i = 0; i < count; i++) {
    for (let attempt = 0; attempt < 12; attempt++) {
      const r = 18 + rand() * 16;
      const bx = x + rand() * w;
      const by = y + rand() * h;
      if (overlapsAny(bx, by, r, buildings, 12)) continue;
      bushes.push({ x: bx, y: by, r });
      break;
    }
  }
}

/** Index of the building genuinely containing a point, or -1. */
function buildingAtPoint(map: MapData, x: number, y: number): number {
  for (let i = 0; i < map.buildings.length; i++) {
    const b = map.buildings[i];
    if (x <= b.x || x >= b.x + b.w || y <= b.y || y >= b.y + b.h) continue;
    for (const r of b.rects) {
      if (x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h) return i;
    }
  }
  return -1;
}

/** `wall` minus `hole`, as up to four remaining pieces. */
function subtractRect(wall: Wall, hole: Wall): Wall[] {
  const x1 = Math.max(wall.x, hole.x);
  const y1 = Math.max(wall.y, hole.y);
  const x2 = Math.min(wall.x + wall.w, hole.x + hole.w);
  const y2 = Math.min(wall.y + wall.h, hole.y + hole.h);
  if (x2 <= x1 || y2 <= y1) return [wall]; // no overlap

  const out: Wall[] = [];
  if (y1 > wall.y) out.push({ x: wall.x, y: wall.y, w: wall.w, h: y1 - wall.y });
  if (wall.y + wall.h > y2) out.push({ x: wall.x, y: y2, w: wall.w, h: wall.y + wall.h - y2 });
  if (x1 > wall.x) out.push({ x: wall.x, y: y1, w: x1 - wall.x, h: y2 - y1 });
  if (wall.x + wall.w > x2) out.push({ x: x2, y: y1, w: wall.x + wall.w - x2, h: y2 - y1 });
  return out;
}

/**
 * Verify that everywhere indoors can actually be walked to, and open a doorway
 * wherever it can't.
 *
 * Construction gets this right nearly always, but a handful of cases slip
 * through every seed: a block clamped flush against the perimeter with its one
 * doorway opening into it, a door onto a dead pocket too narrow to squeeze
 * along, an L-shaped notch that leads nowhere. Rather than special-case each,
 * this walks the finished map and cuts a way in wherever one is missing.
 */
function repairEnclosures(map: MapData, protectedWalls: number): void {
  const STEP = 14; // nav-grid resolution
  const CLEAR = 46; // width of the opening cut, matching a real doorway
  const MAX_REACH = 84; // furthest a cut will bridge

  for (let pass = 0; pass < 4; pass++) {
    const nav = new NavGrid(map);

    // Every indoor spot that can't be reached from the street.
    const stranded: Array<{ x: number; y: number; building: number }> = [];
    for (let i = 0; i < map.buildings.length; i++) {
      const b = map.buildings[i];
      for (const r of b.rects) {
        for (let x = r.x + STEP / 2; x < r.x + r.w; x += STEP) {
          for (let y = r.y + STEP / 2; y < r.y + r.h; y += STEP) {
            if (nav.isBlocked(x, y) || nav.isReachable(x, y)) continue;
            stranded.push({ x, y, building: i });
          }
        }
      }
    }
    if (stranded.length === 0) return;

    // One opening per cluster of stranded cells, not one per cell.
    const done = new Set<number>();
    let cuts = 0;

    for (let s = 0; s < stranded.length; s++) {
      if (done.has(s)) continue;
      const cell = stranded[s];

      // Nearest reachable ground, probed straight out along each axis.
      let best: { x: number; y: number; dist: number } | null = null;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        for (let d = STEP; d <= MAX_REACH; d += STEP) {
          const px = cell.x + dx * d;
          const py = cell.y + dy * d;
          if (px < BOUNDARY_THICKNESS || py < BOUNDARY_THICKNESS) break;
          if (px > WORLD_WIDTH - BOUNDARY_THICKNESS || py > WORLD_HEIGHT - BOUNDARY_THICKNESS) break;
          if (nav.isBlocked(px, py)) continue;
          if (!nav.isReachable(px, py)) continue;
          if (!best || d < best.dist) best = { x: px, y: py, dist: d };
          break;
        }
      }
      if (!best) continue;

      // Cut a doorway-width slot through whatever stands between the two.
      const horiz = Math.abs(best.x - cell.x) > Math.abs(best.y - cell.y);
      const midX = (cell.x + best.x) / 2;
      const midY = (cell.y + best.y) / 2;
      const along = best.dist + WALL_THICKNESS * 2;
      const hole: Wall = horiz
        ? { x: midX - along / 2, y: midY - CLEAR / 2, w: along, h: CLEAR }
        : { x: midX - CLEAR / 2, y: midY - along / 2, w: CLEAR, h: along };

      // The perimeter is never cut — a hole in it opens the map itself.
      const kept: Wall[] = [];
      for (let w = 0; w < map.walls.length; w++) {
        if (w >= map.walls.length - protectedWalls) {
          kept.push(map.walls[w]);
          continue;
        }
        kept.push(...subtractRect(map.walls[w], hole));
      }
      map.walls = kept;

      // Glass in the way comes out with it, so the room is genuinely open
      // rather than open only to whoever smashes the pane first.
      map.windows = map.windows.filter(
        (p) =>
          !(
            p.x < hole.x + hole.w &&
            p.x + p.w > hole.x &&
            p.y < hole.y + hole.h &&
            p.y + p.h > hole.y
          ),
      );

      const building = buildingAtPoint(map, cell.x, cell.y);
      if (building >= 0) {
        map.buildings[building].doors.push(map.doors.length);
        map.doors.push({
          x: midX,
          y: midY,
          building,
          halfSpan: CLEAR / 2,
          // The slab spans across the direction we cut through.
          horiz: !horiz,
          interior: buildingAtPoint(map, best.x, best.y) === building,
        });
      }
      cuts++;

      // Everything else nearby is very likely the same room.
      for (let o = s + 1; o < stranded.length; o++) {
        if (stranded[o].building !== cell.building) continue;
        if (Math.hypot(stranded[o].x - cell.x, stranded[o].y - cell.y) < 260) done.add(o);
      }
    }

    if (cuts === 0) return; // nothing further this pass could open
  }
}

export function generateMap(seed = Math.floor(Math.random() * 1e9)): MapData {
  const rand = mulberry32(seed);
  const walls: Wall[] = [];
  const bushes: Bush[] = [];
  const windows: WindowPane[] = [];

  const stride = BLOCK_SIZE + ROAD_SIZE;
  // Round up so the grid runs all the way out to the boundary rather than
  // leaving a bare strip; buildings get clamped inside the wall below.
  const cols = Math.max(1, Math.ceil((WORLD_WIDTH - MAP_MARGIN * 2 + ROAD_SIZE) / stride));
  const rows = Math.max(1, Math.ceil((WORLD_HEIGHT - MAP_MARGIN * 2 + ROAD_SIZE) / stride));

  const buildings: Building[] = [];
  const doors: Door[] = [];

  // Everything that claims ground before the street grid runs: the park, then
  // landmarks, then perimeter blocks. Ordinary blocks yield to all of it.
  const landmarks: Wall[] = [];

  // The park is staked out first, near the middle of the map, so nothing else
  // can build over it and it never ends up stranded in a corner.
  const parkW = BLOCK_SIZE * 2 + ROAD_SIZE;
  const parkH = BLOCK_SIZE * 2 + ROAD_SIZE;
  const park = {
    x: clampTo(
      WORLD_WIDTH / 2 + (rand() - 0.5) * WORLD_WIDTH * 0.22 - parkW / 2,
      MAP_MARGIN,
      WORLD_WIDTH - MAP_MARGIN - parkW,
    ),
    y: clampTo(
      WORLD_HEIGHT / 2 + (rand() - 0.5) * WORLD_HEIGHT * 0.22 - parkH / 2,
      MAP_MARGIN,
      WORLD_HEIGHT - MAP_MARGIN - parkH,
    ),
    w: parkW,
    h: parkH,
  };
  landmarks.push(park);

  // The corner complex claims its ground before anything but the park, so it
  // always gets the corner it picked rather than losing it to a block.
  const corner = cornerComplexAt(walls, windows, buildings, doors, rand);
  buildings.push(corner.building);
  landmarks.push(corner.box);

  // A pond, somewhere out of the way. Reserved with the landmarks so nothing
  // gets built on the water, and kept off the perimeter so it's approachable
  // from every side.
  const pondR = POND_MIN_RADIUS + rand() * (POND_MAX_RADIUS - POND_MIN_RADIUS);
  // Two or three low harmonics: enough to read as a natural bank, bounded well
  // under 1 so the outline can never fold back through the middle.
  const wobble = [
    { freq: 2 + Math.floor(rand() * 2), amp: 0.1 + rand() * 0.1, phase: rand() * Math.PI * 2 },
    { freq: 3 + Math.floor(rand() * 3), amp: 0.05 + rand() * 0.08, phase: rand() * Math.PI * 2 },
    { freq: 5 + Math.floor(rand() * 3), amp: 0.03 + rand() * 0.05, phase: rand() * Math.PI * 2 },
  ];
  const pond: Pond = { x: 0, y: 0, r: pondR, wobble, pads: [] };
  for (let attempt = 0; attempt < 80; attempt++) {
    const px = MAP_MARGIN + pondR + 80 + rand() * (WORLD_WIDTH - MAP_MARGIN * 2 - pondR * 2 - 160);
    const py = MAP_MARGIN + pondR + 80 + rand() * (WORLD_HEIGHT - MAP_MARGIN * 2 - pondR * 2 - 160);
    const box = { x: px - pondR, y: py - pondR, w: pondR * 2, h: pondR * 2 };
    const clashes = landmarks.some(
      (b) =>
        box.x < b.x + b.w + 90 &&
        box.x + box.w + 90 > b.x &&
        box.y < b.y + b.h + 90 &&
        box.y + box.h + 90 > b.y,
    );
    if (clashes && attempt < 79) continue;
    pond.x = px;
    pond.y = py;
    break;
  }
  landmarks.push({ x: pond.x - pondR, y: pond.y - pondR, w: pondR * 2, h: pondR * 2 });

  const padCount = 2 + Math.floor(rand() * 2);
  for (let i = 0; i < padCount; i++) {
    const angle = rand() * Math.PI * 2;
    const dist = rand() * pondR * 0.55;
    pond.pads.push({
      x: pond.x + Math.cos(angle) * dist,
      y: pond.y + Math.sin(angle) * dist,
      r: 13 + rand() * 8,
    });
  }

  const bigCount = BIG_BUILDING_MIN + Math.floor(rand() * (BIG_BUILDING_MAX - BIG_BUILDING_MIN + 1));
  for (let i = 0; i < bigCount; i++) {
    const tw = BIG_BUILDING_MIN_TILES + Math.floor(rand() * (BIG_BUILDING_MAX_TILES - BIG_BUILDING_MIN_TILES));
    const th = BIG_BUILDING_MIN_TILES + Math.floor(rand() * (BIG_BUILDING_MAX_TILES - BIG_BUILDING_MIN_TILES));
    for (let attempt = 0; attempt < 60; attempt++) {
      const ox = MAP_MARGIN + rand() * (WORLD_WIDTH - MAP_MARGIN * 2 - tw * TILE);
      const oy = MAP_MARGIN + rand() * (WORLD_HEIGHT - MAP_MARGIN * 2 - th * TILE);
      const box = { x: ox, y: oy, w: tw * TILE, h: th * TILE };
      const clashes = landmarks.some(
        (b) =>
          box.x < b.x + b.w + 120 &&
          box.x + box.w + 120 > b.x &&
          box.y < b.y + b.h + 120 &&
          box.y + box.h + 120 > b.y,
      );
      if (clashes) continue;
      landmarks.push(box);
      buildings.push(bigBuildingAt(walls, windows, buildings, doors, rand, ox, oy, tw, th));
      break;
    }
  }

  // Rectangular blocks built onto the perimeter wall, so the map edge reads as
  // more city rather than a bare running track.
  const B = BOUNDARY_THICKNESS;
  for (let i = 0; i < EDGE_BUILDING_COUNT; i++) {
    const tw = EDGE_BUILDING_MIN_TILES + Math.floor(rand() * (EDGE_BUILDING_MAX_TILES - EDGE_BUILDING_MIN_TILES));
    const th = EDGE_BUILDING_MIN_TILES + Math.floor(rand() * (EDGE_BUILDING_MAX_TILES - EDGE_BUILDING_MIN_TILES));

    for (let attempt = 0; attempt < 40; attempt++) {
      const side = Math.floor(rand() * 4);
      let ox: number;
      let oy: number;
      let inward: 'north' | 'east' | 'south' | 'west';

      if (side === 0) {
        ox = B + rand() * (WORLD_WIDTH - B * 2 - tw * TILE);
        oy = B;
        inward = 'south';
      } else if (side === 1) {
        ox = WORLD_WIDTH - B - tw * TILE;
        oy = B + rand() * (WORLD_HEIGHT - B * 2 - th * TILE);
        inward = 'west';
      } else if (side === 2) {
        ox = B + rand() * (WORLD_WIDTH - B * 2 - tw * TILE);
        oy = WORLD_HEIGHT - B - th * TILE;
        inward = 'north';
      } else {
        ox = B;
        oy = B + rand() * (WORLD_HEIGHT - B * 2 - th * TILE);
        inward = 'east';
      }

      const box = { x: ox, y: oy, w: tw * TILE, h: th * TILE };
      const clashes = landmarks.some(
        (b) =>
          box.x < b.x + b.w + 70 &&
          box.x + box.w + 70 > b.x &&
          box.y < b.y + b.h + 70 &&
          box.y + box.h + 70 > b.y,
      );
      if (clashes) continue;

      landmarks.push(box); // reserve it against the street grid too
      buildings.push(edgeBuildingAt(walls, windows, buildings, doors, rand, ox, oy, tw, th, inward));
      break;
    }
  }

  const hitsLandmark = (x: number, y: number, size: number) =>
    landmarks.some(
      (b) => x < b.x + b.w + 40 && x + size + 40 > b.x && y < b.y + b.h + 40 && y + size + 40 > b.y,
    );

  // Jog each row and column sideways so streets stagger instead of running
  // dead straight from one side of the map to the other.
  const rowShift = Array.from({ length: rows }, () => (rand() - 0.5) * BLOCK_STAGGER * 2);
  const colShift = Array.from({ length: cols }, () => (rand() - 0.5) * BLOCK_STAGGER * 2);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const blockX = MAP_MARGIN + c * stride + rowShift[r];
      const blockY = MAP_MARGIN + r * stride + colShift[c];

      // The park and every landmark were reserved before this loop ran.
      if (hitsLandmark(blockX, blockY, BLOCK_SIZE)) continue;
      if (rand() < EMPTY_LOT_CHANCE) continue;
      buildings.push(buildingAt(walls, windows, buildings, doors, rand, blockX, blockY));
    }
  }

  // Fill the reserved park. Nothing was built here, so nothing gets rejected.
  scatterBushes(
    bushes,
    rand,
    park.x,
    park.y,
    park.w,
    park.h,
    PARK_BUSHES_PER_BLOCK * 4,
    buildings,
  );

  scatterBushes(
    bushes,
    rand,
    MAP_MARGIN,
    MAP_MARGIN,
    WORLD_WIDTH - MAP_MARGIN * 2,
    WORLD_HEIGHT - MAP_MARGIN * 2,
    SCATTER_BUSH_COUNT,
    buildings,
  );

  // Hard playable boundary, thicker than the interior walls. Pushed last so
  // the repair pass below can tell it apart from everything it may cut.
  const b = BOUNDARY_THICKNESS;
  walls.push({ x: 0, y: 0, w: WORLD_WIDTH, h: b });
  walls.push({ x: 0, y: WORLD_HEIGHT - b, w: WORLD_WIDTH, h: b });
  walls.push({ x: 0, y: 0, w: b, h: WORLD_HEIGHT });
  walls.push({ x: WORLD_WIDTH - b, y: 0, w: b, h: WORLD_HEIGHT });

  const map: MapData = {
    seed,
    width: WORLD_WIDTH,
    height: WORLD_HEIGHT,
    walls,
    bushes,
    windows,
    buildings,
    doors,
    pond,
  };
  repairEnclosures(map, 4);
  return map;
}
