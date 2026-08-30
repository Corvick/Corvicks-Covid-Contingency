import type { MapData, Wall } from '../../shared/types.js';
import { pondRadiusAt } from '../../shared/pond.js';
import { NAV_CELL, NAV_INFLATE, PATH_MAX_NODES } from '../../shared/constants.js';
import type { OrientedBox } from './geometry.js';

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
 * Gate for `server/circles.ts`: true is the old `findPath`, which answered a
 * search it could not finish with `null` and left the caller to walk blindly at
 * the goal. Off in every real round.
 */
let noPartialPaths = false;
export function setNoPartialPaths(v: boolean): void {
  noPartialPaths = v;
}

/**
 * Coarse A* navigation grid built from the map's walls. Scratch arrays are
 * reused across searches and validated by a generation stamp, so a search
 * never pays to clear ~60k cells.
 */
export class NavGrid {
  readonly cols: number;
  readonly rows: number;
  private blocked: Uint8Array;
  /**
   * Cells blocked by something **destructible**: a sandbag wall, or a pocket
   * gunner's bags.
   *
   * A second layer rather than more entries in `blocked`, because the two are
   * not the same question. A wall is a wall to everybody. A sandbag wall is a
   * thing to *walk round* if you are alive and a thing to *stand and tear at*
   * if you are not — and the whole point of one is that a zombie claws it down
   * rather than strolling past the end. So this layer is consulted by whoever
   * is asking, not by the grid: `findPath` avoids it when told to, and nothing
   * else in the game sees it at all.
   */
  private soft: Uint8Array;
  private gScore: Float64Array;
  private cameFrom: Int32Array;
  private stamp: Int32Array;
  private generation = 0;
  private heap = new MinHeap();

  /**
   * `broken` names panes that have been smashed out. Intact glass is as solid
   * as wall for movement — leaving it out of the grid had routes drawn
   * straight through windows, and anyone following one pressed into the pane
   * until something ate them.
   */
  constructor(
    map: MapData,
    broken: ReadonlySet<number> = new Set(),
    blockers: readonly OrientedBox[] = [],
    softBlockers: readonly OrientedBox[] = [],
  ) {
    this.cols = Math.ceil(map.width / NAV_CELL);
    this.rows = Math.ceil(map.height / NAV_CELL);
    const count = this.cols * this.rows;

    this.blocked = new Uint8Array(count);
    this.soft = new Uint8Array(count);
    this.gScore = new Float64Array(count);
    this.cameFrom = new Int32Array(count);
    this.stamp = new Int32Array(count);

    for (const wall of map.walls) this.markWall(wall);
    for (let i = 0; i < map.windows.length; i++) {
      if (!broken.has(i)) this.markWall(map.windows[i]);
    }
    this.markPond(map);
    // Solid bodies that are not part of the map: a parked vehicle, in
    // practice. See `World.navBlockers`.
    for (const box of blockers) this.markBox(box, this.blocked);
    // And the ones that can be taken apart. See `soft`.
    for (const box of softBlockers) this.markBox(box, this.soft);
    this.component = new Int32Array(count).fill(-1);
    // **Components are labelled off `blocked` alone**, deliberately. A wall
    // somebody built across a street must not make the ground behind it
    // "unreachable" — `isReachable` is what decides where a body may be spawned
    // and where an order may be sent, and a barricade is not a decision about
    // either. It is also gone the moment a zombie has finished with it.
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

  /** Open water is no more walkable than a wall, and the same to a route. */
  private markPond(map: MapData): void {
    const pond = map.pond;
    if (!pond) return;

    const reach = pond.r * 1.5 + NAV_INFLATE;
    const c0 = Math.max(0, Math.floor((pond.x - reach) / NAV_CELL));
    const c1 = Math.min(this.cols - 1, Math.floor((pond.x + reach) / NAV_CELL));
    const r0 = Math.max(0, Math.floor((pond.y - reach) / NAV_CELL));
    const r1 = Math.min(this.rows - 1, Math.floor((pond.y + reach) / NAV_CELL));

    for (let r = r0; r <= r1; r++) {
      const cy = r * NAV_CELL + NAV_CELL / 2;
      for (let c = c0; c <= c1; c++) {
        const cx = c * NAV_CELL + NAV_CELL / 2;
        // Inflated like walls are, so routes don't shave the waterline.
        const dx = cx - pond.x;
        const dy = cy - pond.y;
        const dist = Math.hypot(dx, dy);
        if (dist >= pondRadiusAt(pond, Math.atan2(dy, dx)) + NAV_INFLATE) continue;
        this.blocked[r * this.cols + c] = 1;
      }
    }
  }

  /**
   * The same for a body that is not axis-aligned — a van comes to rest across
   * whatever bearing it drove in on, and snapping it to the compass would
   * either block a lane it is not in or leave a corner of it walkable.
   *
   * Inflated like a wall is, so a route does not shave the paintwork.
   */
  private markBox(box: OrientedBox, into: Uint8Array): void {
    const cos = Math.cos(box.angle);
    const sin = Math.sin(box.angle);
    const hw = box.hw + NAV_INFLATE;
    const hh = box.hh + NAV_INFLATE;
    // Axis-aligned bounds of the rotated box, to know which cells to test.
    const reach = Math.hypot(hw, hh);
    const c0 = Math.max(0, Math.floor((box.x - reach) / NAV_CELL));
    const c1 = Math.min(this.cols - 1, Math.floor((box.x + reach) / NAV_CELL));
    const r0 = Math.max(0, Math.floor((box.y - reach) / NAV_CELL));
    const r1 = Math.min(this.rows - 1, Math.floor((box.y + reach) / NAV_CELL));

    for (let r = r0; r <= r1; r++) {
      const cy = r * NAV_CELL + NAV_CELL / 2;
      for (let c = c0; c <= c1; c++) {
        const cx = c * NAV_CELL + NAV_CELL / 2;
        const dx = cx - box.x;
        const dy = cy - box.y;
        // Into the box's own frame, where it is an ordinary rect.
        if (Math.abs(dx * cos + dy * sin) > hw) continue;
        if (Math.abs(-dx * sin + dy * cos) > hh) continue;
        into[r * this.cols + c] = 1;
      }
    }
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

  /**
   * The same question with the destructible obstacles counted in.
   *
   * Separate from `isBlocked` rather than a flag on it, because `isBlocked` has
   * a great many callers — spawning, wander sampling, escape scoring, the step
   * itself — and every one of them means "is there ground here", which a
   * sandbag wall does not change. Only somebody deciding where to *walk* wants
   * this one.
   */
  isBlockedOrSoft(x: number, y: number): boolean {
    const cell = this.cellAt(x, y);
    return this.blocked[cell] === 1 || this.soft[cell] === 1;
  }

  /** One cell, with the destructible layer counted in or not. */
  private shut(cell: number, avoidSoft: boolean): boolean {
    return this.blocked[cell] === 1 || (avoidSoft && this.soft[cell] === 1);
  }

  /** Nearest open cell, spiralling outward — start/goal often sit in geometry. */
  private nearestOpen(cell: number, avoidSoft: boolean): number {
    if (!this.shut(cell, avoidSoft)) return cell;
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
          if (!this.shut(idx, avoidSoft)) return idx;
        }
      }
    }
    return -1;
  }

  /** True when a straight line stays on open cells — used to shortcut paths. */
  lineClear(x1: number, y1: number, x2: number, y2: number, avoidSoft = false): boolean {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const steps = Math.ceil(Math.hypot(dx, dy) / (NAV_CELL * 0.5));
    if (steps <= 0) return true;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      if (this.shut(this.cellAt(x1 + dx * t, y1 + dy * t), avoidSoft)) return false;
    }
    return true;
  }

  /**
   * Nodes the last `findPath` expanded.
   *
   * The tick's budget is spent in these rather than in whole searches — see
   * `PATH_NODE_BUDGET_PER_TICK`. Reported on the grid rather than returned
   * alongside the path so that no call site has to change shape; the one
   * caller that keeps a budget reads it straight after the call.
   */
  lastExpanded = 0;

  /**
   * `maxNodes` is how far this one search may look, defaulting to the whole
   * per-search cap. The caller passes what is left of the *tick's* budget, so
   * one awkward route cannot spend the whole frame.
   *
   * **A search that does not reach the goal answers with the best route it
   * did find, rather than with nothing.** It used to return `null`, and the
   * one caller then fell through to `slideToward`, which walks at a fixed
   * angular offset from the *goal bearing* — and a fixed offset from a bearing
   * that rotates as you move is a circle round the goal. Reported as officers
   * going round in small circles: a grey officer ordered across the map (a
   * 5000px route is far past `PATH_MAX_NODES`, so the search never finished
   * and never would) and a bot orbiting the corner of a building it was trying
   * to loot. `unstickTick` cannot see it either — that measures displacement
   * over 420ms, and a body is most of the way round a 15px circle by then.
   *
   * The partial is followed and then re-searched from its far end, which is
   * ordinary time-sliced A*: each search starts closer, and the route is
   * walked in stages. `null` now means only "not one step of progress was
   * found", which is a goal in a sealed component or in geometry — and that is
   * a case every call site already had to handle.
   */
  findPath(
    sx: number,
    sy: number,
    tx: number,
    ty: number,
    maxNodes = PATH_MAX_NODES,
    avoidSoft = false,
  ): Waypoint[] | null {
    this.lastExpanded = 0;
    const start = this.nearestOpen(this.cellAt(sx, sy), avoidSoft);
    const goal = this.nearestOpen(this.cellAt(tx, ty), avoidSoft);
    if (start < 0 || goal < 0) return null;
    if (start === goal) return [{ x: tx, y: ty }];

    const generation = ++this.generation;
    const { cols, rows, blocked, soft, gScore, cameFrom, stamp } = this;
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

    // The nearest the search ever got, so a run that cannot finish still has
    // something to hand back. Ties go to the cheaper route, or a search that
    // fans out sideways picks whichever equally-near cell it happened to touch
    // last and the "partial" wanders.
    let best = start;
    let bestH = heuristic(start);
    let bestG = 0;

    let expanded = 0;
    while (heap.size > 0) {
      const current = heap.pop();
      if (current === goal) {
        this.lastExpanded = expanded;
        return this.reconstruct(current, generation, tx, ty, avoidSoft, true);
      }
      if (++expanded > maxNodes) break;
      this.lastExpanded = expanded;

      const h = heuristic(current);
      if (h < bestH || (h === bestH && gScore[current] < bestG)) {
        best = current;
        bestH = h;
        bestG = gScore[current];
      }

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
          if (blocked[neighbour] === 1 || (avoidSoft && soft[neighbour] === 1)) continue;

          // No cutting diagonally past a corner.
          if (dc !== 0 && dr !== 0) {
            const a = cr * cols + nc;
            const b = nr * cols + cc;
            if (blocked[a] === 1 || blocked[b] === 1) continue;
            if (avoidSoft && (soft[a] === 1 || soft[b] === 1)) continue;
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
    // Out of nodes, or the goal is walled off from here. Either way the best
    // node found is real ground on a real route, and walking to it is progress
    // where walking at the goal is a circle. `best === start` means nothing was
    // found at all, which is the one case still worth answering with nothing.
    if (noPartialPaths || best === start) return null;
    return this.reconstruct(best, generation, tx, ty, avoidSoft, false);
  }

  private reconstruct(
    goal: number,
    generation: number,
    tx: number,
    ty: number,
    avoidSoft: boolean,
    /**
     * The last cell *is* the goal, so it can carry the caller's exact point.
     * False for a partial, where overwriting it would put a waypoint back at
     * the very spot the search could not reach.
     */
    exact: boolean,
  ): Waypoint[] {
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
    if (exact) raw[raw.length - 1] = { x: tx, y: ty };

    // String-pull: drop waypoints we can simply walk past.
    const smoothed: Waypoint[] = [];
    let anchor = 0;
    while (anchor < raw.length) {
      let furthest = anchor + 1;
      for (let probe = anchor + 1; probe < raw.length; probe++) {
        // **The string-pull has to know about the soft layer too.** It is what
        // drops waypoints you can simply walk past, and asked without it the
        // smoothing cheerfully cuts the corner the search had just gone round —
        // giving back a straight line through the very wall being avoided.
        if (this.lineClear(raw[anchor].x, raw[anchor].y, raw[probe].x, raw[probe].y, avoidSoft)) {
          furthest = probe;
        }
      }
      if (furthest >= raw.length) break;
      smoothed.push(raw[furthest]);
      anchor = furthest;
    }
    return smoothed.length > 0 ? smoothed : [raw[raw.length - 1] ?? { x: tx, y: ty }];
  }
}
