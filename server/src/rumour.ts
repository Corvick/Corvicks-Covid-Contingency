import type { MapData } from '../../shared/types.js';
import { DANGER_CELL, RUMOUR_MEMORY_MS, RUMOUR_SPREAD_CELLS } from '../../shared/constants.js';

/**
 * Where zombies have been *seen*, and how long ago — the crowd's memory,
 * as opposed to the truth.
 *
 * `DangerField` is sourced from every zombie on the map whether or not anybody
 * has laid eyes on it. That is the right answer for the half second of running
 * for your life, and the wrong one for deciding where to stroll: it had people
 * who had never seen a thing quietly routing around a horde two streets away,
 * and — worse the other way round — nothing at all stopping someone settling
 * into the house they had watched a neighbour dragged out of.
 *
 * This is the honest version. Only a human or an officer who actually sees a
 * zombie writes to it, and what they write fades. It is deliberately shared
 * rather than per-person: people shout, so one sighting is a street the whole
 * neighbourhood keeps out of for a while. That also makes it O(1) to read,
 * which is the only reason four hundred of them can afford to consult it.
 *
 * No BFS, unlike the danger field — this is a memory, not a distance. A
 * sighting stamps a small disc so it has some extent, and every read is a
 * single cell.
 */
export class RumourField {
  readonly cols: number;
  readonly rows: number;
  /** When each cell was last vouched for by somebody who saw it. */
  private readonly seenAt: Float64Array;

  constructor(map: MapData) {
    this.cols = Math.ceil(map.width / DANGER_CELL);
    this.rows = Math.ceil(map.height / DANGER_CELL);
    this.seenAt = new Float64Array(this.cols * this.rows);
  }

  /** Somebody just saw one here. Word gets around. */
  stamp(x: number, y: number, now: number): void {
    const c0 = Math.floor(x / DANGER_CELL);
    const r0 = Math.floor(y / DANGER_CELL);
    const spread = RUMOUR_SPREAD_CELLS;

    for (let dr = -spread; dr <= spread; dr++) {
      const r = r0 + dr;
      if (r < 0 || r >= this.rows) continue;
      for (let dc = -spread; dc <= spread; dc++) {
        const c = c0 + dc;
        if (c < 0 || c >= this.cols) continue;
        if (dc * dc + dr * dr > spread * spread) continue;
        const idx = r * this.cols + c;
        if (this.seenAt[idx] < now) this.seenAt[idx] = now;
      }
    }
  }

  /** 0 for somewhere nobody has reported, 1 for somewhere just reported. */
  heatAt(x: number, y: number, now: number): number {
    const c = Math.max(0, Math.min(this.cols - 1, Math.floor(x / DANGER_CELL)));
    const r = Math.max(0, Math.min(this.rows - 1, Math.floor(y / DANGER_CELL)));
    const age = now - this.seenAt[r * this.cols + c];
    if (age >= RUMOUR_MEMORY_MS) return 0;
    return 1 - age / RUMOUR_MEMORY_MS;
  }

  /** A fresh round is a city nobody has heard anything about yet. */
  clear(): void {
    this.seenAt.fill(0);
  }
}
