import type { Bush, MapData, Wall, Window as WindowPane } from '../../shared/types.js';
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
} from '../../shared/constants.js';

type Rng = () => number;

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

/** Split 1-2 long wall runs to leave a 2-tile doorway. */
function punchDoors(segments: Segment[], rand: Rng): Segment[] {
  const GAP = 2;
  const candidates = segments.filter((s) => s.b - s.a >= GAP + 2);
  if (candidates.length === 0) return segments;

  const doorCount = Math.min(candidates.length, 1 + Math.floor(rand() * 2));
  const chosen = new Set<Segment>();
  while (chosen.size < doorCount) {
    chosen.add(candidates[Math.floor(rand() * candidates.length)]);
  }

  const out: Segment[] = [];
  for (const seg of segments) {
    if (!chosen.has(seg)) {
      out.push(seg);
      continue;
    }
    const span = seg.b - seg.a;
    const start = seg.a + 1 + Math.floor(rand() * (span - GAP - 1));
    if (start > seg.a) out.push({ ...seg, b: start });
    if (start + GAP < seg.b) out.push({ ...seg, a: start + GAP });
  }
  return out;
}

function buildingAt(
  walls: Wall[],
  windows: WindowPane[],
  rand: Rng,
  blockX: number,
  blockY: number,
): Wall {
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

  const segments = punchDoors(footprintToSegments(tiles, w, h), rand);
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

  // Footprint bounds, so bush scattering can steer clear of the interior.
  return { x: originX, y: originY, w: w * TILE, h: h * TILE };
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

/**
 * An oversized landmark building carved into rooms. The shell is generated
 * like any other building; then straight partitions are laid across the
 * interior, each punched with a doorway so every room stays reachable.
 */
function bigBuildingAt(
  walls: Wall[],
  windows: WindowPane[],
  rand: Rng,
  originX: number,
  originY: number,
  w: number,
  h: number,
): Wall {
  const t = WALL_THICKNESS;
  const tiles = new Set<string>();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) tiles.add(`${x},${y}`);
  }

  // Outer shell, with doors and the occasional pane.
  for (const seg of punchDoors(footprintToSegments(tiles, w, h), rand)) {
    const span = seg.b - seg.a;
    if (span >= WINDOW_TILES + 2 && rand() < WINDOW_CHANCE * 1.6) {
      const start = seg.a + 1 + Math.floor(rand() * (span - WINDOW_TILES - 1));
      const end = start + WINDOW_TILES;
      pushRun(walls, seg, seg.a, start, originX, originY, t);
      pushRun(walls, seg, end, seg.b, originX, originY, t);
      pushRun(windows, seg, start, end, originX, originY, t);
    } else {
      pushRun(walls, seg, seg.a, seg.b, originX, originY, t);
    }
  }

  // Interior partitions: 1-2 each way, each with a doorway punched through.
  const partition = (horiz: boolean) => {
    const along = horiz ? w : h;
    const across = horiz ? h : w;
    const line = 4 + Math.floor(rand() * Math.max(1, across - 8));
    const seg: Segment = { horiz, a: 0, b: along, line };
    const gapStart = 1 + Math.floor(rand() * Math.max(1, along - 4));
    pushRun(walls, seg, 0, gapStart, originX, originY, t);
    pushRun(walls, seg, gapStart + 2, along, originX, originY, t);
  };

  const verticals = 1 + Math.floor(rand() * 2);
  const horizontals = 1 + Math.floor(rand() * 2);
  for (let i = 0; i < horizontals; i++) partition(true);
  for (let i = 0; i < verticals; i++) partition(false);

  return { x: originX, y: originY, w: w * TILE, h: h * TILE };
}

/**
 * A plain rectangular building butted straight onto the perimeter wall, which
 * doubles as its outer side. The doorway is always punched on the wall facing
 * into the map, so it can actually be entered.
 */
function edgeBuildingAt(
  walls: Wall[],
  windows: WindowPane[],
  rand: Rng,
  originX: number,
  originY: number,
  w: number,
  h: number,
  inward: 'north' | 'east' | 'south' | 'west',
): Wall {
  const t = WALL_THICKNESS;
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

  return { x: originX, y: originY, w: w * TILE, h: h * TILE };
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

  const buildings: Wall[] = [];

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
      buildings.push(bigBuildingAt(walls, windows, rand, ox, oy, tw, th));
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
      buildings.push(edgeBuildingAt(walls, windows, rand, ox, oy, tw, th, inward));
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
      buildings.push(buildingAt(walls, windows, rand, blockX, blockY));
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

  // Hard playable boundary, thicker than the interior walls.
  const b = BOUNDARY_THICKNESS;
  walls.push({ x: 0, y: 0, w: WORLD_WIDTH, h: b });
  walls.push({ x: 0, y: WORLD_HEIGHT - b, w: WORLD_WIDTH, h: b });
  walls.push({ x: 0, y: 0, w: b, h: WORLD_HEIGHT });
  walls.push({ x: WORLD_WIDTH - b, y: 0, w: b, h: WORLD_HEIGHT });

  return { seed, width: WORLD_WIDTH, height: WORLD_HEIGHT, walls, bushes, windows, buildings };
}
