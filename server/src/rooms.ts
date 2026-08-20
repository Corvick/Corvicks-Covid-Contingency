import type { Door, MapData } from '../../shared/types.js';
import {
  NAV_CELL,
  NAV_INFLATE,
  ROOM_DILATE_CELLS,
  ROOM_DOOR_PLUG,
  ROOM_EXIT_AIM,
  WALL_THICKNESS,
} from '../../shared/constants.js';

/** Not in any room: the street, or solid geometry. */
export const OUTSIDE = -1;

export interface Room {
  id: number;
  /** Index into MapData.buildings. */
  building: number;
  /** Indices into MapData.doors — every doorway on this room's boundary. */
  exits: number[];
  /**
   * At least one exit leads to another room rather than out to the street.
   * Precomputed because it is the first thing anyone thinking about
   * barricading asks, and for most of the city the answer is no — an ordinary
   * block building is a single undivided space. Whether a door is actually
   * *hung* in that opening is runtime state, so callers still check that.
   */
  hasInnerExit: boolean;
  /** Somewhere to aim at that is genuinely inside this room. */
  x: number;
  y: number;
  /** Floor cells, i.e. roughly how big it is. */
  size: number;
  /**
   * Doorways between here and the street. A room with a way straight out is 0,
   * the room behind that one is 1, and so on.
   *
   * This is what "deeper into the building" means, and it is a property of the
   * room *graph* rather than of distance: the far end of a long hall is no
   * deeper than its near end, and a cupboard off it is. Static like the rest of
   * this — doorways don't move — so it costs one BFS per round. A room nothing
   * can reach from the street keeps `Infinity`, which every caller reads as
   * "not somewhere to send anybody".
   */
  depth: number;
}

/** Rings of cells a room's id bleeds into, so a doorway still reads as its room. */
const PROBE_MIN = WALL_THICKNESS / 2 + ROOM_DOOR_PLUG + NAV_CELL;
const PROBE_MAX = 84;

/**
 * Which room of which building every indoor spot belongs to, and how to get
 * out of each one.
 *
 * `mapgen` carves buildings into a grid of rooms joined by a spanning tree of
 * doorways, then throws the room grid away — all that survives is walls and
 * doors. This rebuilds it from the other end: plug every doorway, flood-fill
 * what is left inside each footprint, and each puddle is a room. Reading the
 * finished map rather than the generator is what makes it cover all three
 * kinds of building at once — an ordinary block that was never partitioned
 * (one room), a landmark carved into a dozen, and the openings
 * `repairEnclosures` cut afterwards.
 *
 * It is **static**. Walls and doorways don't move, so unlike the nav grid this
 * is built once with the map and never rebuilt — which also keeps it off the
 * `navDirty` path. Only occupancy changes, and that is two counters refreshed
 * once a tick from the loop that was already counting survivors.
 */
export class RoomMap {
  readonly cols: number;
  readonly rows: number;
  readonly rooms: Room[] = [];

  private readonly doors: Door[];
  /** Strict membership: OUTSIDE for the street, doorways and geometry. */
  private readonly cell: Int16Array;
  /** The same, widened a couple of cells, which is what `roomAt` reads. */
  private readonly near: Int16Array;
  /** Two entries per door: the room on its minus face, then on its plus face. */
  private readonly doorRooms: Int16Array;
  /** Room ids of each building, so a whole building can be judged at once. */
  private readonly byBuilding: number[][];

  /**
   * Every floor cell of every room, grouped by room: room `id` owns
   * `floorCells[floorStart[id] .. floorStart[id + 1])`.
   *
   * One flat pair of arrays rather than an array of arrays per room, because
   * this is built once for the whole city and only ever read at random — which
   * is exactly what `randomPoint` wants and what a rejection sample around the
   * centroid cannot honestly give for an L-shaped room.
   */
  private readonly floorStart: Int32Array;
  private readonly floorCells: Int32Array;

  private readonly preyCount: Int16Array;
  private readonly zombieCount: Int16Array;
  /** When a zombie last had this room to itself and found nothing. */
  private readonly swept: Float64Array;

  constructor(map: MapData) {
    this.doors = map.doors;
    this.cols = Math.ceil(map.width / NAV_CELL);
    this.rows = Math.ceil(map.height / NAV_CELL);
    const cols = this.cols;
    const rows = this.rows;
    const count = cols * rows;

    const solid = new Uint8Array(count);
    const plug = new Uint8Array(count);
    const owner = new Int16Array(count).fill(-1);

    /**
     * Stamp every cell whose centre falls in the rect. Inflating the way the
     * nav grid does is what makes a ten-pixel wall watertight against a
     * fourteen-pixel cell — without it a partition can fall between two cell
     * centres and two rooms silently merge.
     */
    const stamp = (
      target: Uint8Array | Int16Array,
      value: number,
      x: number,
      y: number,
      w: number,
      h: number,
      inflate: number,
    ): void => {
      const minX = x - inflate;
      const maxX = x + w + inflate;
      const minY = y - inflate;
      const maxY = y + h + inflate;
      const c0 = Math.max(0, Math.floor(minX / NAV_CELL));
      const c1 = Math.min(cols - 1, Math.floor(maxX / NAV_CELL));
      const r0 = Math.max(0, Math.floor(minY / NAV_CELL));
      const r1 = Math.min(rows - 1, Math.floor(maxY / NAV_CELL));
      for (let r = r0; r <= r1; r++) {
        const cy = r * NAV_CELL + NAV_CELL / 2;
        if (cy < minY || cy > maxY) continue;
        for (let c = c0; c <= c1; c++) {
          const cx = c * NAV_CELL + NAV_CELL / 2;
          if (cx < minX || cx > maxX) continue;
          target[r * cols + c] = value;
        }
      }
    };

    for (const wall of map.walls) stamp(solid, 1, wall.x, wall.y, wall.w, wall.h, NAV_INFLATE);
    // Glass bounds a room whether or not somebody smashes it later. Rooms are
    // a fixed partition of the building; a broken pane is a hole in one, not a
    // reason for two rooms to become one.
    for (const pane of map.windows) stamp(solid, 1, pane.x, pane.y, pane.w, pane.h, NAV_INFLATE);

    // Every doorway, door hung in it or not — the gap is what joins two rooms,
    // so the gap is what has to be plugged to tell them apart.
    for (const door of map.doors) {
      const t = WALL_THICKNESS;
      if (door.horiz) {
        stamp(plug, 1, door.x - door.halfSpan, door.y - t / 2, door.halfSpan * 2, t, ROOM_DOOR_PLUG);
      } else {
        stamp(plug, 1, door.x - t / 2, door.y - door.halfSpan, t, door.halfSpan * 2, ROOM_DOOR_PLUG);
      }
    }

    for (let i = 0; i < map.buildings.length; i++) {
      for (const r of map.buildings[i].rects) stamp(owner, i, r.x, r.y, r.w, r.h, 0);
    }

    this.cell = new Int16Array(count).fill(OUTSIDE);
    const queue = new Int32Array(count);

    for (let start = 0; start < count; start++) {
      if (owner[start] < 0 || solid[start] || plug[start]) continue;
      if (this.cell[start] !== OUTSIDE) continue;

      const id = this.rooms.length;
      const room: Room = {
        id,
        building: owner[start],
        exits: [],
        hasInnerExit: false,
        x: 0,
        y: 0,
        size: 0,
        depth: Infinity,
      };
      this.rooms.push(room);

      let head = 0;
      let tail = 0;
      let sumC = 0;
      let sumR = 0;
      queue[tail++] = start;
      this.cell[start] = id;

      while (head < tail) {
        const cur = queue[head++];
        const c = cur % cols;
        const r = (cur / cols) | 0;
        sumC += c;
        sumR += r;
        room.size++;

        for (let i = 0; i < 4; i++) {
          const nc = c + (i === 0 ? 1 : i === 1 ? -1 : 0);
          const nr = r + (i === 2 ? 1 : i === 3 ? -1 : 0);
          if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
          const next = nr * cols + nc;
          if (owner[next] !== room.building || solid[next] || plug[next]) continue;
          if (this.cell[next] !== OUTSIDE) continue;
          this.cell[next] = id;
          queue[tail++] = next;
        }
      }

      room.x = (sumC / room.size) * NAV_CELL + NAV_CELL / 2;
      room.y = (sumR / room.size) * NAV_CELL + NAV_CELL / 2;
    }

    // The centroid of an L-shaped room lands in the notch, which is somebody
    // else's floor. Snap each one to the cell of its own room nearest to it.
    const bestDist = new Float64Array(this.rooms.length).fill(Infinity);
    const bestX = new Float64Array(this.rooms.length);
    const bestY = new Float64Array(this.rooms.length);
    for (let idx = 0; idx < count; idx++) {
      const id = this.cell[idx];
      if (id < 0) continue;
      const room = this.rooms[id];
      const x = (idx % cols) * NAV_CELL + NAV_CELL / 2;
      const y = ((idx / cols) | 0) * NAV_CELL + NAV_CELL / 2;
      const d = (x - room.x) ** 2 + (y - room.y) ** 2;
      if (d >= bestDist[id]) continue;
      bestDist[id] = d;
      bestX[id] = x;
      bestY[id] = y;
    }
    for (const room of this.rooms) {
      room.x = bestX[room.id];
      room.y = bestY[room.id];
    }

    // Bleed each room a couple of cells into the doorways and wall padding
    // around it. Somebody standing in a doorway sits on no room's floor at
    // all, and reading that as "out in the street" makes a zombie halfway
    // through a door change its mind about where it is.
    this.near = Int16Array.from(this.cell);
    {
      const depth = new Uint8Array(count);
      let head = 0;
      let tail = 0;
      for (let idx = 0; idx < count; idx++) {
        if (this.near[idx] >= 0) queue[tail++] = idx;
      }
      while (head < tail) {
        const cur = queue[head++];
        if (depth[cur] >= ROOM_DILATE_CELLS) continue;
        const c = cur % cols;
        const r = (cur / cols) | 0;
        for (let i = 0; i < 4; i++) {
          const nc = c + (i === 0 ? 1 : i === 1 ? -1 : 0);
          const nr = r + (i === 2 ? 1 : i === 3 ? -1 : 0);
          if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
          const next = nr * cols + nc;
          if (this.near[next] !== OUTSIDE) continue;
          this.near[next] = this.near[cur];
          depth[next] = depth[cur] + 1;
          queue[tail++] = next;
        }
      }
    }

    // Which rooms each doorway joins, probed straight out along its normal.
    this.doorRooms = new Int16Array(map.doors.length * 2).fill(OUTSIDE);
    for (let i = 0; i < map.doors.length; i++) {
      const door = map.doors[i];
      for (const sign of [-1, 1]) {
        let found: number = OUTSIDE;
        for (let p = PROBE_MIN; p <= PROBE_MAX; p += NAV_CELL) {
          const x = door.horiz ? door.x : door.x + sign * p;
          const y = door.horiz ? door.y + sign * p : door.y;
          const id = this.cell[this.cellAt(x, y)];
          if (id >= 0) {
            found = id;
            break;
          }
        }
        this.doorRooms[i * 2 + (sign < 0 ? 0 : 1)] = found;
      }
      for (const side of [0, 1]) {
        const id = this.doorRooms[i * 2 + side];
        if (id >= 0 && !this.rooms[id].exits.includes(i)) this.rooms[id].exits.push(i);
      }
    }

    // Only meaningful once every door has been resolved to its two rooms.
    for (const room of this.rooms) {
      room.hasInnerExit = room.exits.some((i) => this.farSideOf(i, room.id) !== OUTSIDE);
    }

    this.byBuilding = map.buildings.map(() => [] as number[]);
    for (const room of this.rooms) this.byBuilding[room.building]?.push(room.id);

    // How many doorways deep each room is. Anything with a way straight out to
    // the street is 0; everything else takes the shortest hop count to one.
    // Doorways rather than doors: whether a slab is hung in the opening is
    // runtime state, and how deep a room is is not.
    {
      let head = 0;
      let tail = 0;
      for (const room of this.rooms) {
        if (!room.exits.some((i) => this.farSideOf(i, room.id) === OUTSIDE)) continue;
        room.depth = 0;
        queue[tail++] = room.id;
      }
      while (head < tail) {
        const room = this.rooms[queue[head++]];
        for (const index of room.exits) {
          const far = this.farSideOf(index, room.id);
          if (far === OUTSIDE) continue;
          const next = this.rooms[far];
          if (next.depth <= room.depth + 1) continue;
          next.depth = room.depth + 1;
          queue[tail++] = far;
        }
      }
    }

    // Floor cells grouped by room, counted first so the run for each is
    // contiguous. `cell` rather than `near`: a spot inside the doorway padding
    // is not somewhere to be sent to stand.
    this.floorStart = new Int32Array(this.rooms.length + 1);
    for (let idx = 0; idx < count; idx++) {
      const id = this.cell[idx];
      if (id >= 0) this.floorStart[id + 1]++;
    }
    for (let i = 0; i < this.rooms.length; i++) this.floorStart[i + 1] += this.floorStart[i];
    this.floorCells = new Int32Array(this.floorStart[this.rooms.length]);
    {
      const fill = Int32Array.from(this.floorStart.subarray(0, this.rooms.length));
      for (let idx = 0; idx < count; idx++) {
        const id = this.cell[idx];
        if (id >= 0) this.floorCells[fill[id]++] = idx;
      }
    }

    this.preyCount = new Int16Array(this.rooms.length);
    this.zombieCount = new Int16Array(this.rooms.length);
    this.swept = new Float64Array(this.rooms.length);
  }

  private cellAt(x: number, y: number): number {
    const c = Math.max(0, Math.min(this.cols - 1, Math.floor(x / NAV_CELL)));
    const r = Math.max(0, Math.min(this.rows - 1, Math.floor(y / NAV_CELL)));
    return r * this.cols + c;
  }

  /** Room this point is in, or OUTSIDE. Doorways count as the room they open into. */
  roomAt(x: number, y: number): number {
    return this.near[this.cellAt(x, y)];
  }

  /** The room on the far side of a doorway from `fromRoom`. */
  farSideOf(doorIndex: number, fromRoom: number): number {
    const minus = this.doorRooms[doorIndex * 2];
    const plus = this.doorRooms[doorIndex * 2 + 1];
    if (minus === fromRoom) return plus;
    if (plus === fromRoom) return minus;
    return plus >= 0 ? plus : minus;
  }

  /**
   * A point a short way past a doorway, on the side away from `fromRoom`.
   *
   * Walking at the doorway itself and stopping there is what left the old
   * behaviour turning round in its own threshold: arriving means being in the
   * gap, where the room underfoot hasn't changed yet. Aiming past it means
   * arriving is genuinely being in the next room.
   */
  aimBeyond(doorIndex: number, fromRoom: number): { x: number; y: number } {
    const door = this.doors[doorIndex];
    const sign = this.doorRooms[doorIndex * 2] === fromRoom ? 1 : -1;
    return door.horiz
      ? { x: door.x, y: door.y + sign * ROOM_EXIT_AIM }
      : { x: door.x + sign * ROOM_EXIT_AIM, y: door.y };
  }

  /**
   * A random spot on this room's own floor, for somebody pottering about
   * inside it rather than crossing it to get somewhere.
   *
   * Uniform over floor cells, so a long room genuinely gets walked end to end.
   * Jittered inside the cell it lands in, or a room reads as a dozen fixed
   * standing spots that everybody in it shares.
   */
  randomPoint(room: number): { x: number; y: number } | null {
    if (room < 0 || room >= this.rooms.length) return null;
    const from = this.floorStart[room];
    const to = this.floorStart[room + 1];
    if (to <= from) return null;
    const idx = this.floorCells[from + Math.floor(Math.random() * (to - from))];
    const jitter = NAV_CELL * 0.5;
    return {
      x: (idx % this.cols) * NAV_CELL + NAV_CELL / 2 + (Math.random() - 0.5) * jitter,
      y: ((idx / this.cols) | 0) * NAV_CELL + NAV_CELL / 2 + (Math.random() - 0.5) * jitter,
    };
  }

  preyIn(room: number): number {
    return room >= 0 ? this.preyCount[room] : 0;
  }

  zombiesIn(room: number): number {
    return room >= 0 ? this.zombieCount[room] : 0;
  }

  sweptAt(room: number): number {
    return room >= 0 ? this.swept[room] : 0;
  }

  markSwept(room: number, now: number): void {
    if (room >= 0) this.swept[room] = now;
  }

  roomsOf(building: number): readonly number[] {
    return this.byBuilding[building] ?? [];
  }

  /** How long ago the *least* recently searched room in here was searched. */
  buildingSweptAt(building: number): number {
    const rooms = this.byBuilding[building];
    if (!rooms || rooms.length === 0) return 0;
    let oldest = Infinity;
    for (const id of rooms) {
      if (this.swept[id] < oldest) oldest = this.swept[id];
    }
    return oldest;
  }

  zombiesInBuilding(building: number): number {
    let n = 0;
    for (const id of this.byBuilding[building] ?? []) n += this.zombieCount[id];
    return n;
  }

  beginCount(): void {
    this.preyCount.fill(0);
    this.zombieCount.fill(0);
  }

  addPrey(x: number, y: number): void {
    const id = this.roomAt(x, y);
    if (id >= 0) this.preyCount[id]++;
  }

  addZombie(x: number, y: number): void {
    const id = this.roomAt(x, y);
    if (id >= 0) this.zombieCount[id]++;
  }
}
