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
}
