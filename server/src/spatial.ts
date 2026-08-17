/**
 * Uniform grid broadphase. Keeps neighbour lookups (collision, perception,
 * line-of-sight) from degrading to O(n^2) as the entity count grows.
 */
export class SpatialGrid<T> {
  private cells = new Map<number, T[]>();
  private cols: number;
  private rows: number;

  constructor(
    private cellSize: number,
    width: number,
    height: number,
  ) {
    this.cols = Math.max(1, Math.ceil(width / cellSize));
    this.rows = Math.max(1, Math.ceil(height / cellSize));
  }

  private col(x: number): number {
    return Math.max(0, Math.min(this.cols - 1, Math.floor(x / this.cellSize)));
  }

  private row(y: number): number {
    return Math.max(0, Math.min(this.rows - 1, Math.floor(y / this.cellSize)));
  }

  clear(): void {
    this.cells.clear();
  }

  insertRect(item: T, minX: number, minY: number, maxX: number, maxY: number): void {
    const c0 = this.col(minX);
    const c1 = this.col(maxX);
    const r0 = this.row(minY);
    const r1 = this.row(maxY);

    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const key = r * this.cols + c;
        let bucket = this.cells.get(key);
        if (!bucket) {
          bucket = [];
          this.cells.set(key, bucket);
        }
        bucket.push(item);
      }
    }
  }

  /** Collect every item whose cell overlaps the query rect into `out`. */
  queryRect(minX: number, minY: number, maxX: number, maxY: number, out: Set<T>): Set<T> {
    const c0 = this.col(minX);
    const c1 = this.col(maxX);
    const r0 = this.row(minY);
    const r1 = this.row(maxY);

    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const bucket = this.cells.get(r * this.cols + c);
        if (!bucket) continue;
        for (const item of bucket) out.add(item);
      }
    }
    return out;
  }

  queryCircle(x: number, y: number, radius: number, out: Set<T>): Set<T> {
    return this.queryRect(x - radius, y - radius, x + radius, y + radius, out);
  }

  /**
   * Visit every item in the overlapping cells, allocating nothing.
   *
   * Like `queryRect` without the collection — for callers that want to look at
   * the neighbours rather than keep them. It does **not** deduplicate: an item
   * straddling two cells is visited once per cell, so a caller that cares must
   * say so itself (see `doorsNear`, which stamps by index).
   */
  each(minX: number, minY: number, maxX: number, maxY: number, visit: (item: T) => void): void {
    const c0 = this.col(minX);
    const c1 = this.col(maxX);
    const r0 = this.row(minY);
    const r1 = this.row(maxY);

    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const bucket = this.cells.get(r * this.cols + c);
        if (!bucket) continue;
        for (let i = 0; i < bucket.length; i++) visit(bucket[i]);
      }
    }
  }

  /**
   * True as soon as any item in the overlapping cells satisfies `test`.
   *
   * For a *question* — is anything in the way? — collecting first is pure
   * waste: `queryRect` builds a Set of every wall in the box (a sight line
   * across a city collects well over a hundred) before a single one is tested,
   * when the answer is usually decided by the first or second. This allocates
   * nothing and stops at the first hit.
   *
   * It does **not** deduplicate, deliberately. An item straddling two cells is
   * tested twice, which for a predicate costs one extra test and cannot change
   * the answer — where the Set was paying an identity hash on every item to
   * prevent exactly that.
   */
  some(minX: number, minY: number, maxX: number, maxY: number, test: (item: T) => boolean): boolean {
    const c0 = this.col(minX);
    const c1 = this.col(maxX);
    const r0 = this.row(minY);
    const r1 = this.row(maxY);

    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const bucket = this.cells.get(r * this.cols + c);
        if (!bucket) continue;
        for (let i = 0; i < bucket.length; i++) {
          if (test(bucket[i])) return true;
        }
      }
    }
    return false;
  }
}
