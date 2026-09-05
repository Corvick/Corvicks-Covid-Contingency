import type { BackupVehicleState } from '../../shared/types.js';
import {
  BACKUP_ARRIVE_DIST,
  BACKUP_DOOR_INTERVAL_MS,
  BACKUP_DOOR_SWING_MS,
  BACKUP_ENTRY_OFFSET,
  BACKUP_LANE_CLEARANCE,
  BACKUP_LANE_OFFSETS,
  BACKUP_LANE_STEP,
  BACKUP_PARK_MAX,
  BACKUP_PARK_MIN,
  BACKUP_SPEED,
  BOUNDARY_THICKNESS,
  CAR_LENGTH,
  CAR_WIDTH,
  ENTITY_RADIUS,
  RADIO_BACKUP_COUNT,
  RADIO_CALL_LINE,
  RADIO_CAR_BACKUP_COUNT,
  CITY_CAR_SPREAD,
  CITY_CAR_OFFICER_GAP,
  RADIO_REPLY_DELAY_MS,
  RADIO_REPLY_LINE,
  RADIO_SPEECH_MS,
  RIFLEMAN_RIFLE_AMMO,
  SWAT_RIFLE_AMMO,
  SHIELD_POINTS,
  VAN_APPROACH_SPEED,
  VAN_FISHHOOK_BRAKE,
  VAN_FISHHOOK_DONE,
  VAN_FISHHOOK_HOLD,
  VAN_FISHHOOK_SLEW,
  VAN_HOOK_BRAKE,
  VAN_HOOK_SLEW,
  VAN_LEAN_BRAKE,
  VAN_LEAN_SLEW,
  VAN_LENGTH,
  VAN_MIN_TURN_RADIUS,
  VAN_WIDTH,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from '../../shared/constants.js';
import {
  VAN_TURN_HOLD,
  vanBrakePose,
  vanBrakeSpeed,
  vanPathDisplacement,
  type BrakeParams,
} from '../../shared/vancurve.js';
import type { Wall } from '../../shared/types.js';
import { resolveCircleBox, type OrientedBox } from './geometry.js';
import { addKevlarVest, newInventory } from './inventory.js';
import {
  buildingIndexAt,
  findSpawnNear,
  makeEntity,
  newAiState,
  type Entity,
  type World,
} from './world.js';

/**
 * Whatever the radio sent.
 *
 * This is the helicopter over again with its feet on the ground: something
 * comes in from off the map, stops, puts people out, and the people are what
 * matter. The differences are that it has to arrive down a street rather than
 * over the rooftops, and that it stays parked afterwards instead of flying off
 * — a vehicle on the corner is free scenery and a landmark for where your
 * backup came from.
 *
 * Two kinds, and which one turns up is the radio's business rather than this
 * module's: a SWAT van with a team in the back for the first call, a patrol
 * car with two riflemen for the two after it.
 */
export interface BackupVehicle {
  id: string;
  kind: 'van' | 'car';
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  /**
   * The way the body is pointing, which during a hard stop is *not* the way it
   * is travelling. `heading` is the line it came in on and the one it keeps
   * sliding down; `facing` swings off it as the back end comes round.
   */
  facing: number;
  heading: number;
  phase: 'inbound' | 'braking' | 'parked';
  /** Where the brakes went on, so the tyre marks have a start. */
  skidX: number | null;
  skidY: number | null;
  /**
   * The stop. `driftDir` is which way it hooks (+1 / -1); `slew` the body
   * rotation at rest — a HOOK large, a LEAN small, 0 for a dead-straight
   * arrival. Picked at call time and checked then by `slideFits`, so the
   * resting pose has been through `bodyFits` like any other. `heavy` is a
   * FISHHOOK or a HOOK: the client draws it a wider arc of rubber and more
   * smoke. `braked` is how many px of the brake curve have been travelled —
   * integrated forward rather than read off the position, because the path is a
   * curve and its projection onto the approach line is not the true progress.
   *
   * `brake`, `turnHold` and `turnDone` are the style: how long the manoeuvre
   * is, where in it the wheel goes over, and where it comes back straight. A
   * FISHHOOK finishes its turn well before it stops and spends the rest of the
   * brake running out sideways, which is the whole of what makes it one.
   */
  driftDir: number;
  slew: number;
  braked: number;
  brake: number;
  /** Where in the brake the turn begins — raised for a shallow park. */
  turnHold: number;
  turnDone: number;
  heavy: boolean;
  /** Who called it. The crew no longer escort them, but the van remembers. */
  callerId: string;
  dropped: number;
  nextDropAt: number;
  /** How far the back doors and the cab door have swung, 0-1. */
  rearOpen: number;
  cabOpen: number;
  /** The one who leads the squad away, once they are all out. */
  leaderId: string | null;
  /**
   * Parked with the lightbar off.
   *
   * A car that came in on a call keeps flashing afterwards — that is most of
   * what makes an arrival readable from a street away a minute later. One that
   * has been sitting in the station car park since before anybody was infected
   * never had a call to answer, and a yard of cars all flashing at nothing
   * reads as three separate incidents rather than as a car park.
   */
  silent: boolean;
}

let counter = 0;

/** N, E, S, W — the same numbering the outbreak's breach side uses. */
type Side = 0 | 1 | 2 | 3;

function sizeOf(kind: 'van' | 'car'): { length: number; width: number } {
  return kind === 'van'
    ? { length: VAN_LENGTH, width: VAN_WIDTH }
    : { length: CAR_LENGTH, width: CAR_WIDTH };
}

/**
 * Where it drives in from, given a side and how far along that side.
 *
 * `along` is a world coordinate on the free axis: an x for the north and south
 * edges, a y for the east and west ones.
 */
function entryOn(side: Side, along: number): { x: number; y: number } {
  const x = Math.max(80, Math.min(WORLD_WIDTH - 80, along));
  const y = Math.max(80, Math.min(WORLD_HEIGHT - 80, along));
  if (side === 0) return { x, y: -BACKUP_ENTRY_OFFSET };
  if (side === 1) return { x: WORLD_WIDTH + BACKUP_ENTRY_OFFSET, y };
  if (side === 2) return { x, y: WORLD_HEIGHT + BACKUP_ENTRY_OFFSET };
  return { x: -BACKUP_ENTRY_OFFSET, y };
}

/** How far a point is from a given edge, for ranking which side is nearest. */
function distanceToSide(side: Side, x: number, y: number): number {
  if (side === 0) return y;
  if (side === 1) return WORLD_WIDTH - x;
  if (side === 2) return WORLD_HEIGHT - y;
  return x;
}

/**
 * Is there room for the body, centred here and lying along `facing`?
 *
 * The old patrol car asked `nav.isBlocked` at a single point, which a body
 * 152 by 58 walks straight past — half of it can be inside a shop while its
 * centre stands in the street. This tests the corners and the flanks, and
 * `buildingIndexAt` as well as the nav grid, because "not in a building" is
 * the thing actually being asked and a doorway is walkable nav.
 *
 * Always sized off the **van**, whichever is actually coming: the van is the
 * wider of the two and a spot that fits it fits the car, which keeps one lane
 * test honest for both and means the two arrive down the same sort of street.
 *
 * `pad` inflates the tested footprint past its real clearance. `slideFits`
 * passes extra: between two checked poses on the brake curve the body both
 * slides *and* rotates, so the swept region overshoots each pose by more than
 * the straight run's slack covers, and the drift is better refused on a tight
 * street than allowed to clip a corner mid-slew. The resting spot and the
 * straight run in ask with `pad` 0 — `BACKUP_LANE_CLEARANCE` is already the
 * margin there — so a street the van fits on still qualifies.
 */
function bodyFits(world: World, x: number, y: number, facing: number, pad = 0): boolean {
  slideWork++;
  const cos = Math.cos(facing);
  const sin = Math.sin(facing);
  const hl = VAN_LENGTH / 2 + pad;
  const hw = VAN_WIDTH / 2 + BACKUP_LANE_CLEARANCE / 2 + pad;

  // Stepped at ~13px rather than a fixed 5×5. A 3-across sample leaves 34px
  // gaps a building corner sits in; a fixed 5×5 was enough at 82×38 but the
  // longer body took the *along* gap back to 25px and a corner clipped through
  // it again. Deriving the sample count from the size keeps the gap under a
  // wall's inflated width whatever the van measures.
  const nl = Math.max(4, Math.ceil((hl * 2) / 13));
  const nw = Math.max(4, Math.ceil((hw * 2) / 13));

  // **The buildings are filtered once per pose rather than per sample point,
  // and the nav grid is asked first.** This used to run a few dozen times per
  // radio call; a style now gets the run of the parking search, so it runs a
  // couple of thousand times, and at 152 by 58 that is ~120 sample points each.
  // `buildingIndexAt` walks every building in the city on every one of them —
  // 160 bbox tests a point at the top of the population slider — which measured
  // **10.1us per call** and put the worst radio call at 24ms, most of a tick.
  // The van's own bounding box overlaps one or two footprints at most, and
  // `nav.isBlocked` is an array index, so it is asked first and settles nearly
  // every refusal on its own.
  const ex = Math.abs(cos) * hl + Math.abs(sin) * hw;
  const ey = Math.abs(sin) * hl + Math.abs(cos) * hw;
  // **Down to the rectangles, once per pose, into a module-level scratch.**
  // Buildings are kept as a bbox plus a list of row rects, and a landmark has
  // thirty of them; filtering only to the *building* left every one of the
  // hundred-odd sample points walking that list. Filtering to the rects that
  // actually overlap the body turns the inner loop into two or three tests.
  // Measured on the calls that hurt, this is where their milliseconds were: the
  // per-work cost in a dense quarter ran at twice the open-street figure.
  //
  // The scratch is module-level rather than fresh because this runs a couple of
  // thousand times inside one radio call. Safe: nothing here is re-entrant.
  nearRects.length = 0;
  for (const b of world.map.buildings) {
    if (b.x >= x + ex || b.x + b.w <= x - ex || b.y >= y + ey || b.y + b.h <= y - ey) continue;
    for (const r of b.rects) {
      if (r.x >= x + ex || r.x + r.w <= x - ex || r.y >= y + ey || r.y + r.h <= y - ey) continue;
      nearRects.push(r);
    }
  }

  for (let i = 0; i <= nl; i++) {
    const along = -hl + (hl * 2 * i) / nl;
    for (let j = 0; j <= nw; j++) {
      const across = -hw + (hw * 2 * j) / nw;
      const px = x + cos * along - sin * across;
      const py = y + sin * along + cos * across;
      if (px < 40 || py < 40 || px > WORLD_WIDTH - 40 || py > WORLD_HEIGHT - 40) return false;
      if (world.nav.isBlocked(px, py)) return false;
      // "Not in a building" is the thing actually being asked and a doorway is
      // walkable nav, so this is not covered by the line above.
      for (const r of nearRects) {
        if (px > r.x && px < r.x + r.w && py > r.y && py < r.y + r.h) return false;
      }
    }
  }
  return true;
}

/** Scratch for `bodyFits` and `laneReach` — see the notes there. */
const nearRects: Wall[] = [];
const laneRects: Wall[] = [];

/** How much of a lane one building filter covers — see `laneReach`. */
const LANE_CHUNK = 240;

/**
 * How finely the run in is swept, against `BACKUP_LANE_STEP`'s 24px for
 * choosing where to stop. Half, and five samples across rather than three,
 * because a building corner narrower than the step sits between two samples and
 * is driven through — measured, **1 arrival in 720** did exactly that on the
 * dead-straight run in, with the check meant to catch it having stepped over
 * it.
 */
const LANE_PROBE_STEP = BACKUP_LANE_STEP / 2;

/** Where the run in actually begins: the first point with the whole body past the cordon. */
const LANE_START = BACKUP_ENTRY_OFFSET + BOUNDARY_THICKNESS + VAN_LENGTH;

/**
 * How far the body's furthest corner may travel between two poses `slideFits`
 * checks, and how much the checked footprint is inflated to cover what happens
 * in between. Half the step, near enough: the swept region between two poses
 * bulges out by about that much.
 */
const SLIDE_CORNER_PX = 9;
const SLIDE_PAD = 5;

/**
 * How many candidate stopping places one style may try before the next style
 * down is a better answer than a stall. `parkingSpot` would otherwise walk every
 * lane on every side, and each look costs a full walk of that style's braking
 * curve — measured, a radio call is ~1ms with this and several times that
 * without.
 */
const STYLE_SEARCH_LOOKS = 30;

/**
 * **A hard ceiling on the geometry one radio call may check**, counted in
 * `bodyFits` — which is where the time actually goes, at ~10us each.
 *
 * `STYLE_SEARCH_LOOKS` bounds how many *stopping places* are considered and is
 * the right knob for that, but it does not bound the work: a caller whose
 * street takes no fishhook pays every variant, in both directions, at all
 * thirty of them, and that measured **21ms — most of a tick**. This is the
 * backstop. Over budget `slideFits` fails closed, which means a gentler style
 * or a dead-straight arrival: the same answer it gives for a street that is
 * genuinely too tight, and the safe direction.
 *
 * 900 is about 9ms. The median call spends under a tenth of it.
 */
const SLIDE_WORK_BUDGET = 2000;
let slideWork = 0;

/**
 * How far down this lane the body can be driven before something stops it.
 *
 * **A forward sweep, not a yes/no on a chosen spot, and that is the whole of
 * the fix for driving through buildings.** Asked as a question about one spot,
 * a refusal has nowhere to go but a fallback — and `parkingSpot` had two of
 * them, both of which picked a place the body *fitted* without ever asking
 * whether it could be reached. Measured over 80 calls with callers spread
 * across the map: **2 drove through a building** and one **parked inside one**,
 * with up to 11 of 25 footprint samples in geometry. Asked as "how far can it
 * get", there is nothing left to fall back to: it stops where it stops.
 *
 * The cross-section is swept rather than the centre line rayed, because a lane
 * that threads between two buildings with a metre to spare is one a 152-by-58
 * body cannot actually take. Consecutive sections overlap — the step is well
 * under the body length — so everything the body sweeps through is tested.
 *
 * `nav.isBlocked` rather than `hasWallClearPath`: it is strictly the wider
 * test, covering free-standing walls, intact glass and the pond as well as
 * buildings, and it is the same test `bodyFits` uses, so a lane and a place to
 * stop on it cannot disagree.
 *
 * **The run is measured from inside the perimeter.** The boundary wall is in
 * the wall grid and the vehicle is meant to come through it; the cordon is not
 * what it has to miss.
 */
function laneReach(
  world: World,
  entry: { x: number; y: number },
  ux: number,
  uy: number,
  maxD: number,
): number {
  const hw = VAN_WIDTH / 2 + BACKUP_LANE_CLEARANCE / 2;
  let reached = -1;

  // **The buildings are filtered to the corridor once, so the sweep can afford
  // to be fine.** At three cross-samples every 24px this missed a frontage
  // narrow enough to sit between two of them: measured, **1 arrival in 720**
  // drove through a building corner on the dead-straight run in, with the check
  // that was meant to catch it having stepped over it. Five samples every 12px
  // is four times the tests, and cutting `buildingIndexAt` — which walks every
  // building in the city per point — down to the rects that actually overlap
  // this corridor pays for all of it and more.
  // **The buildings are filtered a chunk of the lane at a time.** Per *point*
  // is what `buildingIndexAt` does and it walks every building in the city each
  // time; per *lane* was tried and is worse still, because a 1000px corridor on
  // a diagonal has a bounding box covering most of a quarter of the map and the
  // filtered list comes out longer than the bbox rejection it replaced — that
  // version took a radio call from p90 4.7ms to 12.1ms. A chunk's box catches a
  // handful of footprints, and a lane that is blocked early never builds the
  // filters for the rest of it.
  let chunkEnd = -1;
  for (let d = LANE_START; d <= maxD; d += LANE_PROBE_STEP) {
    if (d > chunkEnd) {
      const c1 = Math.min(maxD, d + LANE_CHUNK);
      const ax = entry.x + ux * d;
      const ay = entry.y + uy * d;
      const bx2 = entry.x + ux * c1;
      const by2 = entry.y + uy * c1;
      const minX = Math.min(ax, bx2) - hw;
      const maxX = Math.max(ax, bx2) + hw;
      const minY = Math.min(ay, by2) - hw;
      const maxY = Math.max(ay, by2) + hw;
      laneRects.length = 0;
      for (const b of world.map.buildings) {
        if (b.x >= maxX || b.x + b.w <= minX || b.y >= maxY || b.y + b.h <= minY) continue;
        for (const r of b.rects) {
          if (r.x >= maxX || r.x + r.w <= minX || r.y >= maxY || r.y + r.h <= minY) continue;
          laneRects.push(r);
        }
      }
      chunkEnd = c1;
    }
    // A handful of point tests against a `bodyFits`'s hundred-odd, so charged a
    // fraction of one — but charged, or a search that never reaches a candidate
    // spends its whole cost outside the ceiling that is supposed to bound it.
    slideWork += 0.03;
    const cx = entry.x + ux * d;
    const cy = entry.y + uy * d;
    let clear = true;
    for (const across of [-hw, -hw / 2, 0, hw / 2, hw]) {
      const px = cx - uy * across;
      const py = cy + ux * across;
      if (px < 40 || py < 40 || px > WORLD_WIDTH - 40 || py > WORLD_HEIGHT - 40) {
        clear = false;
        break;
      }
      if (world.nav.isBlocked(px, py)) {
        clear = false;
        break;
      }
      for (const r of laneRects) {
        if (px > r.x && px < r.x + r.w && py > r.y && py < r.y + r.h) {
          clear = false;
          break;
        }
      }
      if (!clear) break;
    }
    if (!clear) break;
    reached = d;
  }
  return reached;
}

/**
 * A spot the manoeuvre being asked for actually works from, or null.
 *
 * `accept` is how a *style* gets a say in where the van parks, and adding it is
 * what took the fishhook from a thing that fit one street in three to one that
 * fits most of them. The stop and the manoeuvre are not independent: an 80°
 * swing of a 152px body wants a different fifty pixels of street than a lean
 * does, and picking the spot first and then asking what fits there throws away
 * every other spot on a lane that was already swept clear.
 */
type AcceptSpot = (spot: { x: number; y: number }, entry: { x: number; y: number }, stopD: number) => boolean;

/**
 * Where it comes to rest on this lane: the first spot at or past
 * `BACKUP_PARK_MIN` that the body fits on and `accept` is happy with, or failing
 * that the deepest such spot short of it.
 *
 * Pulling up short of a blocked street is the right answer and always was; the
 * old code agreed and then reached for a fallback that skipped the lane test
 * to do it. Nothing here can return a spot the body could not have driven to.
 */
function stopOnLane(
  world: World,
  entry: { x: number; y: number },
  ux: number,
  uy: number,
  facing: number,
  accept?: AcceptSpot,
): { x: number; y: number } | null {
  // **Before `laneReach`, not after.** Checked only inside the candidate loop,
  // a spent budget still paid a full lane sweep for every remaining lane —
  // seventy-odd of them across four sides — for candidates it was then going to
  // refuse anyway. That was most of the tail of a radio call.
  if (accept && slideWork > SLIDE_WORK_BUDGET) return null;
  const reach = laneReach(world, entry, ux, uy, BACKUP_ENTRY_OFFSET + BACKUP_PARK_MAX);
  if (reach < 0) return null;

  let best: { x: number; y: number } | null = null;
  const deep = BACKUP_ENTRY_OFFSET + BACKUP_PARK_MIN;

  /** Offer one candidate; true once the caller has everything it wants. */
  const offer = (d: number): boolean => {
    if (accept && slideWork > SLIDE_WORK_BUDGET) return true;
    const px = entry.x + ux * d;
    const py = entry.y + uy * d;
    if (!bodyFits(world, px, py, facing)) return false;
    if (accept && !accept({ x: px, y: py }, entry, d)) return false;
    best = { x: px, y: py };
    return d >= deep;
  };

  // **Candidates at the preferred depth are offered first, and that ordering is
  // load-bearing rather than tidy.** How deep the van parks *is* how much
  // manoeuvre it is allowed — a shallow stop has too little checkable brake for
  // the ambitious shapes and only the gentlest pass. Walking outward from
  // `LANE_START`, a style therefore takes the first shallow spot that works for
  // *any* of its shapes and stops looking, three steps before the one that
  // would have taken its best: measured, **89 fishhooks in 90 came out as the
  // tamest of the four**, and the full-strength one never appeared at all.
  // Deep first, then inward as a fallback for a lane that runs out early.
  for (let d = Math.max(LANE_START, deep); d <= reach; d += BACKUP_LANE_STEP) {
    if (offer(d)) return best;
  }
  for (let d = LANE_START; d < Math.min(reach + 1, deep); d += BACKUP_LANE_STEP) {
    if (offer(d)) return best;
  }
  return best;
}

/**
 * Where it stops: just inside the map edge, on open ground, on a side it can
 * actually reach the city from.
 *
 * It does **not** drive to you. Anything threading a city to arrive at your
 * shoulder is both a hard pathing problem and the wrong picture — what should
 * happen is that it pulls up at the cordon and the crew come the rest of the
 * way on foot, which is also the bit worth watching.
 *
 * Two rules on top of that. It never comes in **through a building**, checked
 * for the whole body rather than for a point; and it never comes in on the
 * **side the outbreak walked in from**, because backup arriving out of the
 * breach is backup arriving through the horde, and it reads as the game
 * spawning your reinforcements in the worst place on the map on purpose.
 *
 * With an `accept` it is a *style's* search and answers null rather than
 * falling back: "no street on this map takes a fishhook" is a real answer and
 * the caller has a gentler style to try. Without one it is the final search and
 * must produce something, so the fallbacks below stay.
 */
function parkingSpot(
  world: World,
  x: number,
  y: number,
  accept?: AcceptSpot,
): { spot: { x: number; y: number }; entry: { x: number; y: number } } | null {
  const near: Side[] = ([0, 1, 2, 3] as Side[]).sort(
    (a, b) => distanceToSide(a, x, y) - distanceToSide(b, x, y),
  );
  // The breach side is a preference, not a safety rule: backup arriving out of
  // the horde reads as the game putting your reinforcements in the worst place
  // on the map on purpose, but a lane it can actually drive down beats a side
  // it likes. So the allowed sides are tried in full first, and only then the
  // one it would rather avoid.
  const passes: Side[][] = [near.filter((s) => s !== world.outbreakSide), near];

  for (const sides of passes) {
    for (const side of sides) {
      const along = side === 0 || side === 2 ? x : y;
      for (const offset of BACKUP_LANE_OFFSETS) {
        const entry = entryOn(side, along + offset);
        const dx = x - entry.x;
        const dy = y - entry.y;
        const len = Math.hypot(dx, dy) || 1;
        const ux = dx / len;
        const uy = dy / len;
        const spot = stopOnLane(world, entry, ux, uy, Math.atan2(dy, dx), accept);
        if (spot) return { spot, entry };
      }
    }
  }
  if (accept) return null;

  // No side has a lane clear the *whole way* in. Rare, and rarer still that it
  // matters — but the old answer was to plonk the body a van-length inside the
  // edge with no check at all, and a building built onto the perimeter is
  // exactly where that lands it. So sweep for a spot the body actually *fits*
  // on, straight, giving up the clean approach but never the clean rest: a van
  // that scraped something on the way in and then stopped clear is a far better
  // failure than one parked through a wall for the rest of the round.
  for (const side of near) {
    const along = side === 0 || side === 2 ? x : y;
    for (const offset of BACKUP_LANE_OFFSETS) {
      const entry = entryOn(side, along + offset);
      const dx = x - entry.x;
      const dy = y - entry.y;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len;
      const uy = dy / len;
      const facing = Math.atan2(dy, dx);
      for (let d = LANE_START; d <= LANE_START + 460; d += BACKUP_LANE_STEP) {
        const px = entry.x + ux * d;
        const py = entry.y + uy * d;
        if (bodyFits(world, px, py, facing)) return { spot: { x: px, y: py }, entry };
      }
    }
  }

  // Genuinely nowhere. Sit on the cordon strip — body's inner edge at the
  // boundary — which is the shallowest it can be and still be on the map.
  const side = near[0] ?? 0;
  const entry = entryOn(side, side === 0 || side === 2 ? x : y);
  const dx = x - entry.x;
  const dy = y - entry.y;
  const len = Math.hypot(dx, dy) || 1;
  const cordon = BACKUP_ENTRY_OFFSET + BOUNDARY_THICKNESS + VAN_LENGTH / 2;
  return {
    spot: { x: entry.x + (dx / len) * cordon, y: entry.y + (dy / len) * cordon },
    entry,
  };
}

/** The pose `along` px short of the resting spot — `shared/vancurve.ts` owns
 *  the curve, this is just the local alias for it. */
function brakePose(v: BrakeParams, along: number): { x: number; y: number; facing: number } {
  return vanBrakePose(v, along);
}

/**
 * Can it actually perform this stop here?
 *
 * The straight run in is `laneReach`'s business. This is the last `v.brake` of
 * it, where — once `vanTurnEase` lifts off zero — the nose comes round up to
 * `VAN_FISHHOOK_SLEW` and the body curves off the approach line to follow it,
 * and then runs out sideways for the rest of the manoeuvre. That is a long way
 * outside the slack the lane sweep carries, so the lane being clear says
 * nothing about it and this walks the real curve.
 *
 * `stopD` is how far the resting spot is from the entry point, and a pose still
 * short of `LANE_START` is skipped — the boundary wall is there and it is the
 * wall the van is *meant* to come through. `callBackup` raises `turnHold` so
 * the turn itself never begins that shallow.
 */
function slideFits(world: World, v: BrakeParams, stopD: number): boolean {
  // **The step is adaptive, and with a fishhook it has to be.** A uniform step
  // in distance is right for a body that only slides; between two poses of one
  // that is also *rotating*, the far corner moves by the translation **plus**
  // `r · Δθ`, and a fishhook does 80° inside a third of its brake. Stepped at a
  // flat 12px the corner jumped 23px between checks, and a van clipped a
  // frontage the pad had waved through — measured, 1 arrival in 64.
  //
  // So the increment is chosen from the local rate: fine where the wheel is
  // over, coarse where it is running straight, and the total number of checks
  // barely moves. `r` is the corner of the tested footprint, which is what has
  // to clear anything.
  const r = Math.hypot(VAN_LENGTH / 2, VAN_WIDTH / 2 + BACKUP_LANE_CLEARANCE / 2);
  const span = Math.max(0.001, v.turnDone - v.turnHold);
  let checked = 0;
  // **Walked backwards, from the resting spot toward the brake point.** It is
  // the same set of poses either way and the answer is identical, but almost
  // every refusal is at the *end* — that is where the body is deepest into the
  // city and most rotated, and where the brake point is still out near the open
  // cordon. Forwards, a spot that was never going to work paid for the whole
  // curve before finding out: with a style now given the run of the parking
  // search, that is the difference between a ~1ms radio call and a 30ms one.
  let q = 1;
  for (;;) {
    const along = v.brake * (1 - q);
    // Still coming through the cordon — the boundary wall is there and it is
    // the wall the van is meant to come through. `callBackup` raises `turnHold`
    // so the turn itself never begins this shallow, so skipping here is safe.
    if (stopD - along >= LANE_START) {
      if (slideWork > SLIDE_WORK_BUDGET) return false;
      const pose = brakePose(v, along);
      // The end of the curve is the real resting spot and is checked without
      // the pad — refusing the turn for a spot the van genuinely sits on is the
      // wrong call. Everywhere earlier on the slide, pad against the sweep.
      if (!bodyFits(world, pose.x, pose.y, pose.facing, q >= 1 ? 0 : SLIDE_PAD)) return false;
      checked++;
    }
    if (q <= 0) break;
    // Smoothstep's own derivative, so the increment tightens exactly where the
    // body is swinging fastest.
    const u = Math.max(0, Math.min(1, (q - v.turnHold) / span));
    const spin = (v.slew * 6 * u * (1 - u)) / span;
    q = Math.max(0, q - SLIDE_CORNER_PX / (v.brake + r * spin));
  }
  // Every pose was still coming through the cordon — cannot vouch for it, and
  // arriving straight is the safe default.
  return checked > 0;
}

/**
 * Call it in. The bubble over the caller and the crackle back from their hip
 * are the whole of the feedback: it is a long way off and won't be seen for
 * several seconds, so without them working the handset does nothing at all as
 * far as the player can tell.
 */
export function callBackup(
  world: World,
  caller: Entity,
  now: number,
  kind: 'van' | 'car' = 'van',
): void {
  // Three arrival styles, each a different length of manoeuvre — its own brake,
  // its own turn, its own run-out — and each searched against the **whole
  // parking walk**: the stop and the manoeuvre are not independent, and
  // choosing the spot first and then asking what fits there is what kept the
  // big arrival rare. See `AcceptSpot`.
  slideWork = 0;
  interface Shape {
    slew: number;
    brake: number;
    hold: number;
    done: number;
    heavy: boolean;
  }
  /**
   * **A style is a family, not one shape, and the fishhook is why.**
   *
   * An 80° swing of a 152px body wants a wide street, so at full strength it
   * could only be placed for two callers in three where a hook or a lean fit
   * ninety-eight — and "all entrances equally likely" cannot survive that
   * however the choice among them is made. What makes a fishhook a fishhook is
   * the **run-out**: the turn finishing early and the van travelling sideways
   * afterwards (`turnDone < 1`). The angle and the length are free to give. So a
   * spot too tight for 80° over 330px is offered 66°, then 54°, then 46° over
   * 270 — every one of them still a fishhook, and the gentlest still runs out
   * **59px across** the approach line after its turn is done.
   */
  const STYLES: Shape[][] = [
    (
      [
        [1.4, VAN_FISHHOOK_BRAKE],
        [1.15, VAN_FISHHOOK_BRAKE],
        [0.95, 300],
        [0.8, 270],
      ] as const
    ).map(([slew, brake]) => ({
      slew,
      brake,
      hold: VAN_FISHHOOK_HOLD,
      done: VAN_FISHHOOK_DONE,
      heavy: true,
    })),
    [{ slew: VAN_HOOK_SLEW, brake: VAN_HOOK_BRAKE, hold: VAN_TURN_HOLD, done: 1, heavy: true }],
    [{ slew: VAN_LEAN_SLEW, brake: VAN_LEAN_BRAKE, hold: VAN_TURN_HOLD, done: 1, heavy: false }],
  ];

  interface Arrival {
    entry: { x: number; y: number };
    heading: number;
    driftDir: number;
    slew: number;
    brake: number;
    turnHold: number;
    turnDone: number;
    heavy: boolean;
    restX: number;
    restY: number;
  }

  /** Would this shape work from this stopping place? */
  const tryShape = (
    st: Shape,
    spot: { x: number; y: number },
    entry: { x: number; y: number },
    stopD: number,
    first: number,
  ): Arrival | null => {
    const h = Math.atan2(spot.y - entry.y, spot.x - entry.x);
    // Cram the turn into whatever length of the brake is fully on the map to be
    // checked — `slideFits` skips anything shallower than `LANE_START`, the
    // boundary wall being the wall the van is meant to come through.
    const checkable = stopD - LANE_START;
    const hold = Math.max(st.hold, 1 - (checkable - 8) / st.brake);
    // **A crammed turn is a pivot, and a pivot is worse than no turn.** The line
    // above tightens the turn to fit the street; `VAN_MIN_TURN_RADIUS` is how
    // tight it may get before the body is rotating faster than it is travelling
    // and the arrival reads as the animation glitching. Refused rather than
    // squeezed: a spot with no room for this shape is simply not its spot.
    if (st.done - hold < (1.5 * st.slew * VAN_MIN_TURN_RADIUS) / st.brake) return null;
    for (const dir of [first, -first]) {
      const partial: BrakeParams = {
        targetX: 0,
        targetY: 0,
        heading: h,
        slew: st.slew,
        driftDir: dir,
        turnHold: hold,
        turnDone: st.done,
        brake: st.brake,
      };
      const full = vanPathDisplacement(partial, 0, 1);
      // A turning van does not come to rest on `spot`. It rests at
      // `brakeStart + fullPathDisplacement` — `spot` nudged by however far the arc
      // bent off straight — and that real pose is what is checked.
      const p: BrakeParams = {
        ...partial,
        targetX: spot.x - Math.cos(h) * st.brake + full.dx,
        targetY: spot.y - Math.sin(h) * st.brake + full.dy,
      };
      if (!slideFits(world, p, stopD)) continue;
      return {
        entry,
        heading: h,
        driftDir: dir,
        slew: st.slew,
        brake: st.brake,
        turnHold: hold,
        turnDone: st.done,
        heavy: st.heavy,
        restX: p.targetX,
        restY: p.targetY,
      };
    }
    return null;
  };

  /**
   * **One walk of the parking search, with all three styles riding on it.**
   *
   * Each style asked separately was the obvious way to write this and costs
   * three times over: the lane sweep and the `bodyFits` at every candidate stop
   * are the same work whichever manoeuvre is being considered, and only
   * `slideFits` differs. Measured that way a radio call was **median 5.4ms,
   * worst 34ms** — a whole tick. Sharing the walk, each style still takes the
   * first stopping place that works for it, in the same order, for one sweep.
   *
   * The callback answers "stop walking", which is exactly what `stopOnLane`
   * already means by a true: here that is once every style has found somewhere,
   * or once the budget is spent.
   */
  const results: Array<Arrival | null> = STYLES.map(() => null);
  if (kind === 'van') {
    // Which way it hooks is rolled once for the call, so the three candidates
    // differ in shape rather than in which side of the street they end up on.
    const first = Math.random() < 0.5 ? 1 : -1;
    let looks = 0;
    parkingSpot(world, caller.x, caller.y, (spot, entry, stopD) => {
      if (looks++ >= STYLE_SEARCH_LOOKS) return true;
      let outstanding = 0;
      for (let i = 0; i < STYLES.length; i++) {
        if (results[i] !== null) continue;
        for (const st of STYLES[i]) {
          const got = tryShape(st, spot, entry, stopD, first);
          if (got) {
            results[i] = got;
            break;
          }
        }
        if (results[i] === null) outstanding++;
      }
      return outstanding === 0;
    });
  }

  /**
   * **Every style that fits is found, and then one is drawn uniformly.**
   *
   * Asked for as *"I would like all entrances to be equally likely to show
   * up"*, and a weighted roll with a fall-through cannot deliver it: whatever
   * the weights, a style that does not fit hands its turn to the next one down,
   * so the styles that fit most often are the ones seen most often. Weighting
   * *against* the fit rate would need those rates written down as constants,
   * and they are a property of the map generator rather than of this file.
   *
   * So the choice is made among the ones that actually landed. That is equal
   * likelihood **among what this street can take**, which is the only equality
   * available — a fishhook cannot be made to happen where there is no room for
   * one, which is what the gentler shapes above are for.
   */
  const options = results.filter(Boolean) as Arrival[];
  const picked = options.length > 0 ? options[Math.floor(Math.random() * options.length)] : null;

  let driftDir = 1;
  let slew = 0;
  let brake = VAN_LEAN_BRAKE;
  let turnHold = VAN_TURN_HOLD;
  let turnDone = 1;
  let heavy = false;
  let restX = 0;
  let restY = 0;
  let heading = 0;
  let entry: { x: number; y: number };

  if (picked) {
    entry = picked.entry;
    heading = picked.heading;
    driftDir = picked.driftDir;
    slew = picked.slew;
    brake = picked.brake;
    turnHold = picked.turnHold;
    turnDone = picked.turnDone;
    heavy = picked.heavy;
    restX = picked.restX;
    restY = picked.restY;
  } else {
    // Nothing turns here: the plain search, and a dead-straight arrival resting
    // exactly on the spot it picked. Stopping is a perfectly good answer.
    const plain = parkingSpot(world, caller.x, caller.y)!;
    entry = plain.entry;
    heading = Math.atan2(plain.spot.y - entry.y, plain.spot.x - entry.x);
    restX = plain.spot.x;
    restY = plain.spot.y;
  }

  world.vehicles.set(`backup-${counter}`, {
    id: `backup-${counter++}`,
    kind,
    x: entry.x,
    y: entry.y,
    targetX: restX,
    targetY: restY,
    facing: heading,
    heading,
    phase: 'inbound',
    skidX: null,
    skidY: null,
    driftDir,
    slew,
    braked: 0,
    brake,
    turnHold,
    turnDone,
    heavy,
    callerId: caller.id,
    dropped: 0,
    nextDropAt: 0,
    rearOpen: 0,
    cabOpen: 0,
    leaderId: null,
    silent: false,
  });

  world.speech.set(caller.id, { text: RADIO_CALL_LINE, until: now + RADIO_SPEECH_MS });
  world.radioReplies.push({ id: caller.id, at: now + RADIO_REPLY_DELAY_MS });
}

/** How many bodies come out of each kind, the driver included. */
function crewSize(kind: 'van' | 'car'): number {
  return kind === 'van' ? RADIO_BACKUP_COUNT + 1 : RADIO_CAR_BACKUP_COUNT;
}

/**
 * Where the next one out steps down, in the vehicle's own frame: how far along
 * its length, and how far off its centre line.
 *
 * The van empties out of the **back** — that is where the doors are and where
 * a team actually comes from — and the driver gets out last, at the front on
 * the left. That ordering matters more than it looks: the team piling out of
 * the tail while the cab is still shut is the picture, and a driver who
 * appears first is a driver who was never driving.
 */
function seatFor(kind: 'van' | 'car', index: number): { along: number; across: number } {
  if (kind === 'car') {
    // Two doors, one each side, both at the cabin.
    return { along: -2, across: index === 0 ? -1 : 1 };
  }
  if (index >= RADIO_BACKUP_COUNT) return { along: 1, across: -1 }; // the driver
  return { along: -1, across: index % 2 === 0 ? -0.45 : 0.45 };
}

/**
 * One of the crew, out and looking for whoever called.
 *
 * The shield is a real one on a real inventory rather than a drawing: the
 * grab-denial in `updateZombie` and the band on the body in `toWire` both read
 * `inv.shield`, so putting one in the bag is the whole of giving them one.
 */
/**
 * Somewhere to stand at the door you just came out of.
 *
 * `findSpawnNear` is the wrong tool here and was the first thing tried: it
 * scatters in a *random direction* out to its range, so a team meant to be
 * piling out of the back door turned up spread around the whole vehicle and
 * the driver could arrive behind it. This holds the side it was given —
 * nudged outward along the same bearing when the exact spot is blocked, and
 * only widened into a proper search if the whole side is against a wall.
 *
 * `unload` now hands it a point right on the door line rather than a body
 * length clear of it, so the first offer it tries — `out: 0` — is the doorway
 * itself: the officer appears in the open doors and walks off from there,
 * instead of materialising in the street beside the van.
 */
function stepDown(
  world: World,
  vehicle: BackupVehicle,
  x: number,
  y: number,
): { x: number; y: number } {
  const away = Math.atan2(y - vehicle.y, x - vehicle.x);
  for (const out of [0, 12, 24, 36]) {
    for (const swing of [0, 0.4, -0.4, 0.8, -0.8]) {
      const px = x + Math.cos(away + swing) * out;
      const py = y + Math.sin(away + swing) * out;
      if (px < 40 || py < 40 || px > WORLD_WIDTH - 40 || py > WORLD_HEIGHT - 40) continue;
      if (!world.nav.isBlocked(px, py) && world.nav.isReachable(px, py)) return { x: px, y: py };
    }
  }
  return findSpawnNear(world, x, y, ENTITY_RADIUS.officer, 60);
}

function unload(world: World, vehicle: BackupVehicle, now: number): void {
  const { length, width } = sizeOf(vehicle.kind);
  const seat = seatFor(vehicle.kind, vehicle.dropped);
  const cos = Math.cos(vehicle.facing);
  const sin = Math.sin(vehicle.facing);
  // Right on the door line — `+ 6` clears the bodywork and nothing more — so
  // `stepDown` puts the officer in the open doorway and lets him walk out,
  // rather than dropping him a body length into the street.
  const outX = vehicle.x + cos * seat.along * (length / 2 + 6) - sin * seat.across * (width / 2 + 6);
  const outY = vehicle.y + sin * seat.along * (length / 2 + 6) + cos * seat.across * (width / 2 + 6);

  const spawn = stepDown(world, vehicle, outX, outY);
  const id = `backup-${counter++}`;
  world.entities.set(id, makeEntity(id, 'officer', spawn.x, spawn.y));
  const state = newAiState(now, spawn.x, spawn.y);
  world.ai.set(id, state);
  world.dispatched.add(id);
  world.materializeUntil.set(id, now + 400);

  // The one out of the cab is the driver, and a driver is not a SWAT operator
  // — ordinary uniform, ordinary aim. Everyone out of the back is.
  const isDriver = vehicle.kind === 'van' && vehicle.dropped >= RADIO_BACKUP_COUNT;

  // **The driver stays with the van.** He is not a fighting unit and following
  // a squad about is not what a driver does; parked on the corner beside his
  // own vehicle he is a sentry and a landmark at once.
  if (isDriver) {
    state.guardX = vehicle.x;
    state.guardY = vehicle.y;
    return;
  }

  // Everyone else is a sweep team. The first one out leads and the rest keep
  // station on him — they do **not** escort whoever made the call. A squad
  // standing at your shoulder is four rifles doing nothing; a squad walking
  // the city is what you actually asked for when you picked the handset up.
  if (vehicle.leaderId === null) {
    vehicle.leaderId = id;
    state.squadSlot = 0;
    state.sweeps = true;
    // Start the formation's bearing where he is already pointing, or it eases
    // in from zero and the whole squad swings round once on the first corner.
    state.squadBearing = state.heading;
  } else {
    state.squadSlot = vehicle.dropped;
    state.escortId = vehicle.leaderId;
  }

  // A real gun with real rounds in it, in a real gun slot. Everything reads
  // off that afterwards: `officerGrade` takes its damage and reach from the
  // item, the wire takes the shouldered-rifle profile from it, and running dry
  // is the slot emptying rather than a special case anywhere.
  if (vehicle.kind === 'car') {
    // Still tracked, so anything that wants to know where a crew came from
    // still can — but grey is grey now and they shoot like any other grey
    // officer. See `officerGrade`.
    world.riflemen.add(id);
    // No rifle any more: a grey officer carries the sidearm every grey officer
    // carries. Leaving a bolt action in the bag would still put a shouldered
    // rifle on the wire and on the body, which is the drawing claiming
    // something `officerGrade` no longer does.
    world.inventories.set(id, newInventory());
    return;
  }

  world.swat.add(id);
  const inv = newInventory();
  inv.guns[0] = { item: 'semiAutoRifle', ammo: SWAT_RIFLE_AMMO };
  inv.activeSlot = 1;
  inv.utilities.push('riotShield');
  inv.shield = SHIELD_POINTS;
  inv.shieldUp = true;
  // The one leading carries the set that called this in and the vest to go
  // with it. Kevlar is a real three-grab denial in `resolveGrapple`, not a
  // decoration — losing the leader is how a sweep falls apart, so he is the
  // one wearing it.
  if (state.squadSlot === 0) {
    addKevlarVest(inv);
    world.squadLeads.add(id);
  }
  world.inventories.set(id, inv);
}

/**
 * Stop it, and tell the nav grid it is there.
 *
 * **A parked vehicle goes into the nav grid; a driving one does not.** The
 * comment on `vehicleBox` used to say routes are planned as though it weren't
 * there and whoever walks into one deals with it — which is the sandbags' rule,
 * inherited wholesale, and the reason for it does not carry over. A wall of
 * sandbags is *meant* to be stood at and torn down; a van cannot be destroyed,
 * so there is nothing on the far side of walking into one. What it produced was
 * an officer stepping into the body, being pushed out by `resolveCircleBox`,
 * re-aiming at the same waypoint through it and stepping in again — measured,
 * **5 of 8** officers with somewhere to be on the other side of a parked van
 * never got there.
 *
 * It stays out of `hasLineOfSight` and out of `fire`, which is the trade that
 * actually matters: cover you shoot over.
 *
 * Set on arrival rather than at the call, because until then it is somewhere
 * else — and it is at most a handful of rebuilds a round, on the same
 * `navDirty` path a smashed pane already uses.
 */
function park(world: World, vehicle: BackupVehicle, now: number): void {
  vehicle.phase = 'parked';
  vehicle.nextDropAt = now + 500;
  world.navBlockers.push(vehicleBox(vehicle));
  world.navDirty = true;
}

/**
 * A clear spot beside a parked body, tried in the order offered.
 *
 * Deliberately **not** `findSpawnNear`, which scatters at 40px plus a random
 * reach from its origin — it is a spawn spread, not a nudge, and using it put
 * the officer a median of **116px** from the car he was supposed to be
 * standing beside. Offsets are in the body's own frame: `along` down its
 * length, `across` out of its flank.
 */
export function spotBeside(
  world: World,
  x: number,
  y: number,
  facing: number,
  offers: ReadonlyArray<{ along: number; across: number }>,
): { x: number; y: number } | null {
  const cos = Math.cos(facing);
  const sin = Math.sin(facing);
  for (const o of offers) {
    const px = x + cos * o.along - sin * o.across;
    const py = y + sin * o.along + cos * o.across;
    if (px < 40 || py < 40 || px > WORLD_WIDTH - 40 || py > WORLD_HEIGHT - 40) continue;
    if (buildingIndexAt(world, px, py) >= 0) continue;
    if (world.nav.isBlocked(px, py)) continue;
    return { x: px, y: py };
  }

  // **And a ring when none of the offers works**, which is a car parked with a
  // kerb or a frontage down both flanks. Without it the second item simply was
  // not placed — measured, 1 city in 16 came out with one thing on the tarmac
  // instead of two, which reads as the placement being unreliable rather than
  // as the spot being awkward.
  for (let r = 56; r <= 140; r += 28) {
    for (let i = 0; i < 12; i++) {
      const t = (i / 12) * Math.PI * 2;
      const px = x + Math.cos(t) * r;
      const py = y + Math.sin(t) * r;
      if (px < 40 || py < 40 || px > WORLD_WIDTH - 40 || py > WORLD_HEIGHT - 40) continue;
      if (buildingIndexAt(world, px, py) >= 0) continue;
      if (world.nav.isBlocked(px, py)) continue;
      return { x: px, y: py };
    }
  }
  return null;
}
/**
 * **A patrol car the city started with**, parked somewhere near the middle with
 * a grey officer beside it. See `CITY_CAR_SPREAD`.
 *
 * Built as an already-`parked` vehicle rather than driven in: there is no
 * arrival to watch, and `dropped` is set to the car's full crew so
 * `updateBackup` never tries to unload one. Everything else about it is an
 * ordinary parked car — the lightbar goes on flashing, which is most of what
 * makes it findable from a street away, and `park` puts its body into
 * `world.navBlockers` so routes go round it like any other.
 *
 * Returns where it ended up so the caller can lay the two items beside it, or
 * null if nowhere near the middle had room — a city with a very large building
 * across the centre, which is not worth forcing.
 */
export function placeCityCar(
  world: World,
  now: number,
): { x: number; y: number; facing: number } | null {
  for (let attempt = 0; attempt < 240; attempt++) {
    // Toward the middle, but not on the same pixel every round.
    const x = WORLD_WIDTH * (0.5 + (Math.random() - 0.5) * CITY_CAR_SPREAD);
    const y = WORLD_HEIGHT * (0.5 + (Math.random() - 0.5) * CITY_CAR_SPREAD);
    // Streets are axis-aligned, so a car lies along one rather than at some
    // angle across it.
    const facing = Math.floor(Math.random() * 4) * (Math.PI / 2);
    if (!bodyFits(world, x, y, facing)) continue;
    if (!world.nav.isReachable(x, y)) continue;

    const id = 'city-car';
    const vehicle: BackupVehicle = {
      id,
      kind: 'car',
      x,
      y,
      targetX: x,
      targetY: y,
      facing,
      heading: facing,
      phase: 'parked',
      skidX: null,
      skidY: null,
      driftDir: 1,
      slew: 0,
      braked: 0,
      brake: VAN_LEAN_BRAKE,
      turnHold: VAN_TURN_HOLD,
      turnDone: 1,
      heavy: false,
      callerId: '',
      // Its crew got out long before the round started, so there is nobody
      // left in it to unload.
      dropped: crewSize('car'),
      nextDropAt: 0,
      rearOpen: 0,
      cabOpen: 0,
      leaderId: null,
      silent: false,
    };
    world.vehicles.set(id, vehicle);
    park(world, vehicle, now);

    // One grey officer standing by it, off to the side rather than in the road,
    // and posted there — the same `guardX`/`guardY` the van's driver uses, so he
    // is a sentry and a landmark at once instead of wandering off.
    const G = CITY_CAR_OFFICER_GAP;
    const stand =
      spotBeside(world, x, y, facing, [
        { along: 0, across: G },
        { along: 0, across: -G },
        { along: G, across: G },
        { along: -G, across: G },
        { along: G, across: -G },
        { along: -G, across: -G },
        { along: G * 1.6, across: 0 },
        { along: -G * 1.6, across: 0 },
      ]) ?? { x, y };
    const guard = 'city-car-officer';
    world.entities.set(guard, makeEntity(guard, 'officer', stand.x, stand.y));
    const state = newAiState(now, stand.x, stand.y);
    state.guardX = x;
    state.guardY = y;
    world.ai.set(guard, state);
    world.cityOfficers.add(guard);

    return { x, y, facing };
  }
  return null;
}
/**
 * **The station car park: nought to three cars, sirens off.**
 *
 * The bays are laid out by `mapgen` and reserved as part of the landmark box,
 * so a bay is somewhere a car can stand by construction and this does not have
 * to go looking. What is rolled here is only *how many* of them are occupied,
 * and which — shuffled rather than filled left to right, or the third bay would
 * be the empty one every single round and the yard would read as a pattern.
 *
 * They are built already `parked`, with `dropped` at the full crew, exactly as
 * the city car is: `updateBackup` only ever unloads a vehicle that still has
 * somebody in it, so a car that arrived before the round did needs no case of
 * its own anywhere. Nobody gets out of these — the officers who man the station
 * are inside it, which is what a station car park looks like.
 *
 * They are `silent`, which is the one thing that distinguishes them on screen
 * from a car that has just skidded to a halt in front of you.
 */
export function placePoliceCars(world: World, now: number): number {
  const station = world.map.policeStation;
  if (!station) return 0;

  const bays = station.parking.map((_, i) => i);
  for (let i = bays.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [bays[i], bays[j]] = [bays[j], bays[i]];
  }
  const filled = Math.floor(Math.random() * (station.parking.length + 1));

  let made = 0;
  for (let n = 0; n < filled; n++) {
    const bay = station.parking[bays[n]];
    const id = `police-car-${bays[n]}`;
    const vehicle: BackupVehicle = {
      id,
      kind: 'car',
      x: bay.x,
      y: bay.y,
      targetX: bay.x,
      targetY: bay.y,
      facing: bay.facing,
      heading: bay.facing,
      phase: 'parked',
      skidX: null,
      skidY: null,
      driftDir: 1,
      slew: 0,
      braked: 0,
      brake: VAN_LEAN_BRAKE,
      turnHold: VAN_TURN_HOLD,
      turnDone: 1,
      heavy: false,
      callerId: '',
      dropped: crewSize('car'),
      nextDropAt: 0,
      rearOpen: 0,
      cabOpen: 0,
      leaderId: null,
      silent: true,
    };
    world.vehicles.set(id, vehicle);
    // Into `world.navBlockers` like any other parked body, so the crowd walks
    // round the yard rather than into it. See "The radio".
    park(world, vehicle, now);
    made++;
  }
  return made;
}

export function updateBackup(world: World, now: number, dt: number): void {
  // The radio answers a beat after the call, from the caller's own hip.
  for (let i = world.radioReplies.length - 1; i >= 0; i--) {
    const reply = world.radioReplies[i];
    if (now < reply.at) continue;
    world.radioReplies.splice(i, 1);
    const caller = world.entities.get(reply.id);
    if (!caller) continue;
    world.speech.set(reply.id, {
      text: RADIO_REPLY_LINE,
      until: now + RADIO_SPEECH_MS,
      radio: true,
    });
  }

  for (const vehicle of world.vehicles.values()) {
    // Doors swing rather than snap, and they stay open afterwards — an emptied
    // van standing there with its back doors hanging open is the whole story
    // of what happened on that corner, told without anybody watching it.
    const swing = (dt * 1000) / BACKUP_DOOR_SWING_MS;
    if (vehicle.rearOpen > 0) vehicle.rearOpen = Math.min(1, vehicle.rearOpen + swing);
    if (vehicle.cabOpen > 0) vehicle.cabOpen = Math.min(1, vehicle.cabOpen + swing);

    if (vehicle.phase === 'parked') {
      if (vehicle.dropped >= crewSize(vehicle.kind) || now < vehicle.nextDropAt) continue;
      // The door goes first and the body follows, which is the right way round
      // and also gives the swing something to happen during.
      const driver = vehicle.kind === 'van' && vehicle.dropped >= RADIO_BACKUP_COUNT;
      if (vehicle.kind === 'van') {
        if (driver && vehicle.cabOpen === 0) {
          vehicle.cabOpen = 0.001;
          vehicle.nextDropAt = now + BACKUP_DOOR_SWING_MS;
          continue;
        }
        if (!driver && vehicle.rearOpen === 0) {
          vehicle.rearOpen = 0.001;
          vehicle.nextDropAt = now + BACKUP_DOOR_SWING_MS;
          continue;
        }
      } else if (vehicle.cabOpen === 0) {
        // The car's two doors go together — one either side, both at the
        // cabin, which is where `seatFor` puts the pair getting out of it.
        vehicle.cabOpen = 0.001;
        vehicle.nextDropAt = now + BACKUP_DOOR_SWING_MS;
        continue;
      }
      unload(world, vehicle, now);
      vehicle.dropped++;
      vehicle.nextDropAt = now + BACKUP_DOOR_INTERVAL_MS;
      continue;
    }

    const cosH = Math.cos(vehicle.heading);
    const sinH = Math.sin(vehicle.heading);

    // A car simply drives up and stops. A two-officer patrol arriving is a
    // smaller event than a SWAT team and should read as one.
    if (vehicle.kind === 'car') {
      const along = (vehicle.targetX - vehicle.x) * cosH + (vehicle.targetY - vehicle.y) * sinH;
      if (along < BACKUP_ARRIVE_DIST) {
        park(world, vehicle, now);
        continue;
      }
      vehicle.x += cosH * BACKUP_SPEED * dt;
      vehicle.y += sinH * BACKUP_SPEED * dt;
      continue;
    }

    // A van comes in hot: **dead straight** down the approach line until it
    // reaches the point where the brakes bite, then the last stretch is a
    // *curve* — the nose comes round and the body travels the way it points.
    if (vehicle.phase !== 'braking') {
      // Where the curve begins — the whole brake still to go. Recomputed rather
      // than stored: it costs one path integral a tick during a one-to-two-second
      // approach, and stores nothing that could drift.
      const start = vanBrakePose(vehicle, vehicle.brake);
      const toStart = (start.x - vehicle.x) * cosH + (start.y - vehicle.y) * sinH;
      if (toStart > 0) {
        vehicle.x += cosH * VAN_APPROACH_SPEED * dt;
        vehicle.y += sinH * VAN_APPROACH_SPEED * dt;
        continue;
      }
      // **The overshoot is carried, not snapped back.** The van drives the
      // approach in whole ticks of `VAN_APPROACH_SPEED` — 13px each — so it
      // arrives somewhere *past* the brake point rather than on it, and putting
      // it back on the point is a visible jump backwards of up to a whole step
      // on the one frame the manoeuvre begins. Starting `braked` at the
      // overshoot instead keeps the motion continuous, and costs nothing: the
      // first stretch of every curve is dead straight along the same heading
      // the approach was on, so the pose at that distance *is* where the body
      // already is.
      vehicle.phase = 'braking';
      vehicle.skidX = start.x;
      vehicle.skidY = start.y;
      vehicle.braked = Math.min(vehicle.brake, -toStart);
    }

    // `braked` is the curve travelled so far, integrated forward — the
    // projection of a curved path onto the approach line is not its progress.
    const rem = vehicle.brake - vehicle.braked;
    if (rem < BACKUP_ARRIVE_DIST) {
      const rest = brakePose(vehicle, 0);
      vehicle.x = rest.x;
      vehicle.y = rest.y;
      vehicle.facing = rest.facing;
      park(world, vehicle, now);
      continue;
    }
    vehicle.braked = Math.min(
      vehicle.brake,
      vehicle.braked + vanBrakeSpeed(rem, vehicle.brake) * dt,
    );
    const pose = brakePose(vehicle, Math.max(0, vehicle.brake - vehicle.braked));
    vehicle.x = pose.x;
    vehicle.y = pose.y;
    vehicle.facing = pose.facing;
  }
}

/**
 * Solid to bodies but not to sight or gunfire — the same trade the sandbags
 * make, and for the same reason: it is cover you can shoot over, and routes
 * are planned as though it weren't there so whoever walks into one deals with
 * it. Deliberately not in the nav grid, and it can't be destroyed.
 */
export function vehicleBox(vehicle: BackupVehicle): OrientedBox {
  const { length, width } = sizeOf(vehicle.kind);
  return { x: vehicle.x, y: vehicle.y, hw: length / 2, hh: width / 2, angle: vehicle.facing };
}

export function resolveVehicleCollisions(world: World): void {
  if (world.vehicles.size === 0) return;
  for (const vehicle of world.vehicles.values()) {
    if (vehicle.phase !== 'parked') continue; // still driving in; nothing to bump
    const box = vehicleBox(vehicle);
    for (const e of world.entities.values()) resolveCircleBox(e, box);
  }
}

export function vehiclesToWire(world: World): BackupVehicleState[] {
  return [...world.vehicles.values()].map((v) => {
    const state: BackupVehicleState = {
      kind: v.kind,
      // **An eighth of a pixel, where every other body on the wire is rounded
      // whole.** At the end of the brake the van is down to
      // `VAN_BRAKE_SPEED_MIN` — about 2.3px a tick — so whole-pixel rounding
      // moves each step by up to 40% of itself, and the client interpolates
      // *between* the rounded points, which turns that into visible speed
      // wobble on the slowest and most-watched part of the arrival. There are
      // never more than a dozen vehicles in a round, so the extra characters
      // are nothing against four hundred bodies.
      x: Math.round(v.x * 8) / 8,
      y: Math.round(v.y * 8) / 8,
      facing: v.facing,
      parked: v.phase === 'parked',
    };
    if (v.skidX !== null && v.skidY !== null) {
      state.skidX = Math.round(v.skidX);
      state.skidY = Math.round(v.skidY);
      // The tangent it was travelling when the brakes bit, which is the line
      // the marks lie along — *not* the body angle, which has swung off it.
      state.skidAngle = Math.round(v.heading * 100) / 100;
    }
    if (v.silent) state.silent = true;
    if (v.heavy) state.heavy = true;
    if (v.slew !== 0) {
      // The four numbers that rebuild the arc: signed body rotation at rest,
      // where the turn starts, where it finishes, and how long the manoeuvre is.
      // `sl` absent means a dead-straight arrival and the marks are a chord.
      // Four numbers on at most a couple of bodies a round, and the alternative
      // is the client guessing the shape of a curve the server is driving —
      // which is the thing `shared/vancurve.ts` exists to stop.
      state.sl = Math.round(v.slew * v.driftDir * 1000) / 1000;
      state.th = Math.round(v.turnHold * 1000) / 1000;
      state.td = Math.round(v.turnDone * 1000) / 1000;
      state.bk = Math.round(v.brake);
    }
    if (v.phase === 'braking') state.braking = true;
    if (v.rearOpen > 0) state.rearOpen = Math.round(v.rearOpen * 100) / 100;
    if (v.cabOpen > 0) state.cabOpen = Math.round(v.cabOpen * 100) / 100;
    return state;
  });
}
