import type { MapData } from '../../shared/types.js';
import { DANGER_CELL, DANGER_MAX_DISTANCE } from '../../shared/constants.js';
import type { NavGrid } from './navgrid.js';

/**
 * A coarse geodesic distance field: for every cell, how far the nearest zombie
 * is *through walkable space*.
 *
 * This is the piece that lets hundreds of entities reason about safety without
 * hundreds of pathfinding calls. One multi-source BFS costs O(cells) — about
 * 20k steps here — and every human then reads its answer in O(1). It also
 * fixes a subtler bug than performance: straight-line distance says a spot is
 * safe when a zombie is stood on the other side of a wall from it, and says a
 * spot is dangerous when the zombie would have to run all the way around.
 * Geodesic distance gets both right.
 */
export class DangerField {
  readonly cols: number;
  readonly rows: number;
  private blocked: Uint8Array;
  /** Distance in cells to the nearest source; 0xffff means unreached. */
  private dist: Uint16Array;
  /** Walkable neighbours within a small radius — a crude "is this a dead end". */
  private openness: Uint8Array;
  private queue: Int32Array;

  constructor(map: MapData, nav: NavGrid) {
    this.cols = Math.ceil(map.width / DANGER_CELL);
    this.rows = Math.ceil(map.height / DANGER_CELL);
    const count = this.cols * this.rows;

    this.blocked = new Uint8Array(count);
    this.dist = new Uint16Array(count);
    this.openness = new Uint8Array(count);
    this.queue = new Int32Array(count);

    // A coarse cell is walkable if its centre is walkable on the nav grid.
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const x = c * DANGER_CELL + DANGER_CELL / 2;
        const y = r * DANGER_CELL + DANGER_CELL / 2;
        this.blocked[r * this.cols + c] = nav.isBlocked(x, y) || !nav.isReachable(x, y) ? 1 : 0;
      }
    }

    // Precompute openness once — the geometry doesn't move.
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const idx = r * this.cols + c;
        if (this.blocked[idx]) continue;
        let free = 0;
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            const nr = r + dr;
            const nc = c + dc;
            if (nr < 0 || nc < 0 || nr >= this.rows || nc >= this.cols) continue;
            if (!this.blocked[nr * this.cols + nc]) free++;
          }
        }
        this.openness[idx] = free; // 0-25
      }
    }
  }

  private cellAt(x: number, y: number): number {
    const c = Math.max(0, Math.min(this.cols - 1, Math.floor(x / DANGER_CELL)));
    const r = Math.max(0, Math.min(this.rows - 1, Math.floor(y / DANGER_CELL)));
    return r * this.cols + c;
  }

  /** Multi-source BFS out from every zombie. Call on a slow cadence. */
  rebuild(sources: Array<{ x: number; y: number }>): void {
    this.dist.fill(0xffff);
    let head = 0;
    let tail = 0;

    for (const s of sources) {
      const idx = this.cellAt(s.x, s.y);
      if (this.blocked[idx] || this.dist[idx] === 0) continue;
      this.dist[idx] = 0;
      this.queue[tail++] = idx;
    }

    const { cols, rows, blocked, dist, queue } = this;
    const limit = Math.ceil(DANGER_MAX_DISTANCE / DANGER_CELL);

    while (head < tail) {
      const cur = queue[head++];
      const d = dist[cur];
      if (d >= limit) continue; // no point mapping distances nobody acts on

      const c = cur % cols;
      const r = (cur / cols) | 0;

      for (let i = 0; i < 4; i++) {
        const nc = c + (i === 0 ? 1 : i === 1 ? -1 : 0);
        const nr = r + (i === 2 ? 1 : i === 3 ? -1 : 0);
        if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
        const next = nr * cols + nc;
        if (blocked[next] || dist[next] !== 0xffff) continue;
        dist[next] = d + 1;
        queue[tail++] = next;
      }
    }
  }

  /** Distance in world units to the nearest zombie, through walkable space. */
  distanceAt(x: number, y: number): number {
    const d = this.dist[this.cellAt(x, y)];
    return d === 0xffff ? Infinity : d * DANGER_CELL;
  }

  /** 0-1: how much open ground surrounds this spot. Low means dead end. */
  opennessAt(x: number, y: number): number {
    return this.openness[this.cellAt(x, y)] / 25;
  }
}
