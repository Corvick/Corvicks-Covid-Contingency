import type { MapData, Wall } from '../../shared/types.js';
import { NAV_CELL, NAV_INFLATE, PATH_MAX_NODES } from '../../shared/constants.js';

export interface Waypoint {
  x: number;
  y: number;
}

/** Binary min-heap over cell indices keyed by f-score. */
class MinHeap {
  private cells: number[] = [];
  private keys: number[] = [];

  get size(): number {
    return this.cells.length;
  }

  clear(): void {
    this.cells.length = 0;
    this.keys.length = 0;
  }

  push(cell: number, key: number): void {
    this.cells.push(cell);
    this.keys.push(key);
    let i = this.cells.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.keys[parent] <= this.keys[i]) break;
      this.swap(i, parent);
      i = parent;
    }
  }

  pop(): number {
    const top = this.cells[0];
    const lastCell = this.cells.pop()!;
    const lastKey = this.keys.pop()!;
    if (this.cells.length > 0) {
      this.cells[0] = lastCell;
      this.keys[0] = lastKey;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let best = i;
        if (l < this.keys.length && this.keys[l] < this.keys[best]) best = l;
        if (r < this.keys.length && this.keys[r] < this.keys[best]) best = r;
        if (best === i) break;
        this.swap(i, best);
        i = best;
      }
    }
    return top;
  }

  private swap(a: number, b: number): void {
    [this.cells[a], this.cells[b]] = [this.cells[b], this.cells[a]];
    [this.keys[a], this.keys[b]] = [this.keys[b], this.keys[a]];
  }
}

const SQRT2 = Math.SQRT2;

/**
 * Coarse A* navigation grid built from the map's walls. Scratch arrays are
 * reused across searches and validated by a generation stamp, so a search
 * never pays to clear ~60k cells.
 */
export class NavGrid {
  readonly cols: number;
  readonly rows: number;
  private blocked: Uint8Array;
  private gScore: Float64Array;
  private cameFrom: Int32Array;
  private stamp: Int32Array;
  private generation = 0;
  private heap = new MinHeap();

  constructor(map: MapData) {
    this.cols = Math.ceil(map.width / NAV_CELL);
    this.rows = Math.ceil(map.height / NAV_CELL);
    const count = this.cols * this.rows;

    this.blocked = new Uint8Array(count);
    this.gScore = new Float64Array(count);
    this.cameFrom = new Int32Array(count);
    this.stamp = new Int32Array(count);

    for (const wall of map.walls) this.markWall(wall);
    this.component = new Int32Array(count).fill(-1);
    this.labelComponents();
  }

  private component: Int32Array;
  private mainComponent = -1;

  /**
   * Flood-fill open cells into connected regions and remember the biggest.
   * Anything walled off from it — a room whose doorway got covered by a
   * partition, say — is somewhere nobody should ever be spawned.
   */
  private labelComponents(): void {
    const { cols, rows, blocked, component } = this;
    const stack: number[] = [];
    let label = 0;
    let bestLabel = -1;
    let bestSize = 0;

    for (let start = 0; start < component.length; start++) {
      if (blocked[start] === 1 || component[start] !== -1) continue;

      let size = 0;
      stack.length = 0;
      stack.push(start);
      component[start] = label;

      while (stack.length > 0) {
        const cell = stack.pop()!;
        size++;
        const c = cell % cols;
        const r = (cell / cols) | 0;

        for (let i = 0; i < 4; i++) {
          const nc = c + (i === 0 ? 1 : i === 1 ? -1 : 0);
          const nr = r + (i === 2 ? 1 : i === 3 ? -1 : 0);
          if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
          const next = nr * cols + nc;
          if (blocked[next] === 1 || component[next] !== -1) continue;
          component[next] = label;
          stack.push(next);
        }
      }

      if (size > bestSize) {
        bestSize = size;
        bestLabel = label;
      }
      label++;
    }
    this.mainComponent = bestLabel;
  }

  /** True when this point is part of the map's main walkable region. */
  isReachable(x: number, y: number): boolean {
    return this.component[this.cellAt(x, y)] === this.mainComponent;
  }

  private markWall(wall: Wall): void {
    const minX = wall.x - NAV_INFLATE;
    const maxX = wall.x + wall.w + NAV_INFLATE;
    const minY = wall.y - NAV_INFLATE;
    const maxY = wall.y + wall.h + NAV_INFLATE;

    const c0 = Math.max(0, Math.floor(minX / NAV_CELL));
    const c1 = Math.min(this.cols - 1, Math.floor(maxX / NAV_CELL));
    const r0 = Math.max(0, Math.floor(minY / NAV_CELL));
    const r1 = Math.min(this.rows - 1, Math.floor(maxY / NAV_CELL));

    for (let r = r0; r <= r1; r++) {
      const cy = r * NAV_CELL + NAV_CELL / 2;
      if (cy < minY || cy > maxY) continue;
      for (let c = c0; c <= c1; c++) {
        const cx = c * NAV_CELL + NAV_CELL / 2;
        if (cx < minX || cx > maxX) continue;
        this.blocked[r * this.cols + c] = 1;
      }
    }
  }

  private cellAt(x: number, y: number): number {
    const c = Math.max(0, Math.min(this.cols - 1, Math.floor(x / NAV_CELL)));
    const r = Math.max(0, Math.min(this.rows - 1, Math.floor(y / NAV_CELL)));
    return r * this.cols + c;
  }

  isBlocked(x: number, y: number): boolean {
    return this.blocked[this.cellAt(x, y)] === 1;
  }

  /** Nearest open cell, spiralling outward — start/goal often sit in geometry. */
  private nearestOpen(cell: number): number {
    if (this.blocked[cell] === 0) return cell;
    const c0 = cell % this.cols;
    const r0 = (cell / this.cols) | 0;

    for (let ring = 1; ring <= 8; ring++) {
      for (let dr = -ring; dr <= ring; dr++) {
        for (let dc = -ring; dc <= ring; dc++) {
          if (Math.abs(dr) !== ring && Math.abs(dc) !== ring) continue;
          const r = r0 + dr;
          const c = c0 + dc;
          if (r < 0 || c < 0 || r >= this.rows || c >= this.cols) continue;
          const idx = r * this.cols + c;
          if (this.blocked[idx] === 0) return idx;
        }
      }
    }
    return -1;
  }

  /** True when a straight line stays on open cells — used to shortcut paths. */
  lineClear(x1: number, y1: number, x2: number, y2: number): boolean {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const steps = Math.ceil(Math.hypot(dx, dy) / (NAV_CELL * 0.5));
    if (steps <= 0) return true;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      if (this.blocked[this.cellAt(x1 + dx * t, y1 + dy * t)] === 1) return false;
    }
    return true;
  }

  findPath(sx: number, sy: number, tx: number, ty: number): Waypoint[] | null {
    const start = this.nearestOpen(this.cellAt(sx, sy));
    const goal = this.nearestOpen(this.cellAt(tx, ty));
    if (start < 0 || goal < 0) return null;
    if (start === goal) return [{ x: tx, y: ty }];

    const generation = ++this.generation;
    const { cols, rows, blocked, gScore, cameFrom, stamp } = this;
    const heap = this.heap;
    heap.clear();

    const goalC = goal % cols;
    const goalR = (goal / cols) | 0;
    const heuristic = (cell: number) => {
      const dc = Math.abs((cell % cols) - goalC);
      const dr = Math.abs(((cell / cols) | 0) - goalR);
      const lo = Math.min(dc, dr);
      return (dc + dr - 2 * lo + SQRT2 * lo) * NAV_CELL;
    };

    stamp[start] = generation;
    gScore[start] = 0;
    cameFrom[start] = -1;
    heap.push(start, heuristic(start));

    let expanded = 0;
    while (heap.size > 0) {
      const current = heap.pop();
      if (current === goal) return this.reconstruct(current, generation, tx, ty);
      if (++expanded > PATH_MAX_NODES) break;

      const cc = current % cols;
      const cr = (current / cols) | 0;
      const baseG = gScore[current];

      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dc === 0 && dr === 0) continue;
          const nc = cc + dc;
          const nr = cr + dr;
          if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;

          const neighbour = nr * cols + nc;
          if (blocked[neighbour] === 1) continue;

          // No cutting diagonally past a corner.
          if (dc !== 0 && dr !== 0) {
            if (blocked[cr * cols + nc] === 1 || blocked[nr * cols + cc] === 1) continue;
          }

          const step = dc !== 0 && dr !== 0 ? SQRT2 * NAV_CELL : NAV_CELL;
          const tentative = baseG + step;

          if (stamp[neighbour] !== generation || tentative < gScore[neighbour]) {
            stamp[neighbour] = generation;
            gScore[neighbour] = tentative;
            cameFrom[neighbour] = current;
            heap.push(neighbour, tentative + heuristic(neighbour));
          }
        }
      }
    }
    return null;
  }

  private reconstruct(goal: number, generation: number, tx: number, ty: number): Waypoint[] {
    const raw: Waypoint[] = [];
    let cell = goal;
    while (cell !== -1 && this.stamp[cell] === generation) {
      raw.push({
        x: (cell % this.cols) * NAV_CELL + NAV_CELL / 2,
        y: ((cell / this.cols) | 0) * NAV_CELL + NAV_CELL / 2,
      });
      cell = this.cameFrom[cell];
    }
    raw.reverse();
    raw[raw.length - 1] = { x: tx, y: ty };

    // String-pull: drop waypoints we can simply walk past.
    const smoothed: Waypoint[] = [];
    let anchor = 0;
    while (anchor < raw.length) {
      let furthest = anchor + 1;
      for (let probe = anchor + 1; probe < raw.length; probe++) {
        if (this.lineClear(raw[anchor].x, raw[anchor].y, raw[probe].x, raw[probe].y)) furthest = probe;
      }
      if (furthest >= raw.length) break;
      smoothed.push(raw[furthest]);
      anchor = furthest;
    }
    return smoothed.length > 0 ? smoothed : [{ x: tx, y: ty }];
  }
}
