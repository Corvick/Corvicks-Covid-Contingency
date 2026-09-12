/**
 * Hordes: the outbreak stops drifting and starts moving as several large
 * groups.
 *
 * `HORDE_FORM_AT_MS` into a round the shamblers are clustered into hordes, and
 * each horde walks from one end of the map to the opposite one, picks another
 * opposite end, and goes again — the bounce of a DVD-logo screensaver, at
 * walking pace.
 *
 * **Almost none of what a horde member actually does is in this file, and that
 * is the design.** Two things already in the zombie AI do all of the moving:
 *
 * - **A destination rides `headingToward`**, so the march is pathed round
 *   buildings, past sandbags and through doorways with nothing here knowing
 *   what a wall is.
 * - **A sighting rides `lastSeen`**, which is the roar's trick exactly. That
 *   branch sits *above* the horde branch and *below* the live chase, so an
 *   order is an attack move for free: anything a member meets on the way is
 *   chased instead, and it drops on arrival with no bookkeeping. "The
 *   collective horde chases them" needed no field it did not already own.
 *
 * So what is here is the collective half only — who is in which horde, where
 * each one is, where it is going, where in the group each member stands, and
 * who it tells.
 *
 * **Everything collective runs on `HORDE_TICK_MS` and nothing runs per tick.**
 * One walk of the zombies at 2Hz to rebuild the membership and the centres,
 * then a handful of records deciding where to go — the same trade `danger.ts`
 * and `world.targetClaims` make, and the only reason this is affordable at
 * three hundred zombies. What a *member* pays per tick is one map lookup,
 * behind a guard on `world.hordes.size`, so a round before the six-minute mark
 * pays one integer compare.
 */

import {
  HORDE_ALERT_RANGE,
  HORDE_ARRIVE_DIST,
  HORDE_CROWD_MIN,
  HORDE_CROWD_RADIUS,
  HORDE_END_INSET,
  HORDE_END_SCATTER,
  HORDE_FORM_AT_MS,
  HORDE_JOIN_RADIUS,
  HORDE_LEG_GIVE_UP_MS,
  HORDE_MAX_SIZE,
  HORDE_MERGE_RADIUS,
  HORDE_MIN_SIZE,
  HORDE_OPPOSITE_MIN_SHARE,
  HORDE_PREY_MS,
  HORDE_PREY_SPREAD,
  HORDE_SLOT_SPACING,
  HORDE_STALL_MS,
  HORDE_STALL_PROGRESS,
  HORDE_STEP_AHEAD,
  HORDE_TICK_MS,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from '../../shared/constants.js';
import type { Entity, World } from './world.js';
import { hasWallClearPath, walkableNear } from './world.js';

/**
 * One of the groups.
 *
 * `x`/`y` is the mass's own centre, recomputed from the members every horde
 * tick — never integrated, never remembered. A horde is where its zombies are,
 * and a centre kept as state is a centre that goes on marching across the map
 * after the bodies under it have been shot.
 */
export interface Horde {
  id: number;
  /** The mean of its members, this tick. */
  x: number;
  y: number;
  size: number;
  /**
   * The end of the map it is walking to, and when it gives that leg up.
   * `legUntil` of 0 means no leg has been picked yet, which is also how a fresh
   * horde is told apart from one that has a destination to claim.
   */
  destX: number;
  destY: number;
  legUntil: number;
  /**
   * The closest this leg has got to its end, and when it last got closer — see
   * `HORDE_STALL_MS`. A horde jammed into ground it cannot fit is given another
   * end rather than left churning there for the rest of a two-minute budget.
   */
  bestDist: number;
  bestAt: number;
  /**
   * The point the formation is centred on: a bounded step along the way to
   * `destX`/`destY`, kept on walkable ground.
   *
   * **This is a cost decision, and a large one.** Handed the far end of the map
   * directly, every member runs `hasWallClearPath` across four thousand pixels
   * of city and then an A\* to match, every re-path, at three hundred bodies —
   * and A\* is superlinear in the distance. A shared waypoint a thousand pixels
   * out is the same march for a fraction of the search.
   *
   * **It is the centre of a formation, never a point anybody stands on** — see
   * `HORDE_SLOT_SPACING`. Every member is handed its own place around it.
   */
  aimX: number;
  aimY: number;
  /**
   * Somebody a member laid eyes on, and when the word goes stale.
   *
   * Kept on the horde rather than pushed straight at the members, because two
   * separate judgements are made off it — whether this is a *crowd* worth
   * calling a neighbour in on, and which members still need telling — and both
   * would become per-sighting work on a 10Hz path if they lived in
   * `senseTarget`. Here they are made at 2Hz over a handful of records.
   */
  preyX: number | null;
  preyY: number | null;
  preyUntil: number;
  /**
   * This sighting reached us from another horde, so we do not pass it on.
   *
   * One hop, for the reason `followTheChase` records for individual zombies:
   * word that propagates freely zips the whole map together the instant
   * anybody is seen, and every horde in the city converging on one street is
   * the opposite of several groups moving about it.
   */
  preyRelayed: boolean;
}

// --------------------------------------------------------------- the gates

/** With this on, hordes never form and a round is byte-for-byte what it was. */
let noHordes = false;
export function setNoHordes(v: boolean): void {
  noHordes = v;
}

/**
 * With this on, members walk at the far end of the map directly rather than at
 * the horde's rolling waypoint — see `aimX`. The A/B for `HORDE_STEP_AHEAD`,
 * and kept: what it costs is the whole reason the waypoint exists, and a
 * saving nobody can reproduce is a saving nobody should trust.
 */
let aimAtTheEnd = false;
export function setHordeAimsAtTheEnd(v: boolean): void {
  aimAtTheEnd = v;
}
export function hordeAimsAtTheEnd(): boolean {
  return aimAtTheEnd;
}

/**
 * With this on, every member walks at the one shared point again, at full pace,
 * and a sighting is one spot for all of them — the pile the report was taken
 * off. Kept, because "they no longer jiggle" means nothing without the
 * measurement of them jiggling beside it.
 */
let oneRallyPoint = false;
export function setHordeOneRallyPoint(v: boolean): void {
  oneRallyPoint = v;
}
export function hordeOneRallyPoint(): boolean {
  return oneRallyPoint;
}

/**
 * With this on there is no ceiling on a horde: it recruits and merges without
 * limit and nothing is split off, which is how one of them came to hold five
 * hundred zombies. The control for `HORDE_MAX_SIZE`, kept.
 */
let uncapped = false;
export function setHordesUncapped(v: boolean): void {
  uncapped = v;
}

/**
 * A measurement lever rather than a behaviour: with this on a horde that has
 * picked an end keeps it, whether it has arrived or stalled. It is what lets a
 * harness watch a formation *settle* on a spot, which in play it never does for
 * long — arriving is exactly what sends it somewhere else.
 */
let holdTheirEnd = false;
export function setHordesHoldTheirEnd(v: boolean): void {
  holdTheirEnd = v;
}

// ----------------------------------------------------------------- the ends

/**
 * The ends of the map: four corners and four edge midpoints, each walked out
 * to ground a body can actually stand on.
 *
 * **Computed at the call and never written down**, because `WORLD_WIDTH` and
 * `WORLD_HEIGHT` are `let` and move with the population slider — a module-level
 * table would freeze the launch size in and then quietly send every horde at a
 * corner outside the map for the rest of the round. The same rule that made
 * `TRACKER_RANGE` a function.
 *
 * Eight rather than four, because four corners is a short enough list that the
 * bounce becomes a pattern you can learn; with the midpoints in, a leg can run
 * along an edge as well as across a diagonal.
 */
function hordeEnds(world: World): Array<{ x: number; y: number }> {
  const lo = HORDE_END_INSET;
  const hiX = WORLD_WIDTH - HORDE_END_INSET;
  const hiY = WORLD_HEIGHT - HORDE_END_INSET;
  const midX = WORLD_WIDTH / 2;
  const midY = WORLD_HEIGHT / 2;
  const raw = [
    { x: lo, y: lo },
    { x: midX, y: lo },
    { x: hiX, y: lo },
    { x: hiX, y: midY },
    { x: hiX, y: hiY },
    { x: midX, y: hiY },
    { x: lo, y: hiY },
    { x: lo, y: midY },
  ];
  // The perimeter has buildings built onto it, so a corner is as often as not
  // inside somebody's front room. `walkableNear` also insists on the map's main
  // walkable component, which is what stops a leg being an errand into a sealed
  // pocket the horde would then grind at for the whole of its budget.
  return raw.map((p) => walkableNear(world, p.x, p.y));
}

/**
 * A random end of the map that is genuinely the *opposite* one, and preferably
 * one no other horde is already walking to.
 *
 * "Opposite" is a distance rather than a compass bearing: any end at least
 * `HORDE_OPPOSITE_MIN_SHARE` of the map's diagonal away qualifies. From a corner
 * that is the three far ends and none of the near ones, which is the bounce;
 * allowing only the diagonally opposite end would be a horde ping-ponging
 * between two corners forever, which is not "another random opposite end".
 *
 * **Among those, the least claimed are drawn from**, and `claimed` is where the
 * other hordes are already going. With a ceiling on how big a horde may be, two
 * that arrive on the same ground can no longer merge — they would stand in each
 * other's formation instead, which is the pile the ceiling exists to prevent,
 * arriving by another road. When every opposite end is taken it is still an
 * even draw among the least taken, so a busy city shares ends out rather than
 * refusing to march.
 *
 * **And the point is scattered off the end**, by up to `HORDE_END_SCATTER`, so a
 * shared end is not a shared pixel. A scatter that would carry the point back
 * inside the opposite-end distance is refused and the end itself used instead —
 * "opposite" is the promise, and a scatter is only decoration on it.
 */
export function pickOppositeEnd(
  world: World,
  fromX: number,
  fromY: number,
  claimed: ReadonlyArray<{ x: number; y: number }> = [],
): { x: number; y: number } {
  const ends = hordeEnds(world);
  const far = Math.hypot(WORLD_WIDTH, WORLD_HEIGHT) * HORDE_OPPOSITE_MIN_SHARE;

  let pool = ends.filter((p) => Math.hypot(p.x - fromX, p.y - fromY) >= far);
  if (pool.length === 0) {
    // Nothing qualifies — a horde stood dead in the middle of a city small
    // enough that no end clears half the diagonal. Take the furthest rather
    // than refusing: a leg somewhere is the whole behaviour, and the furthest
    // end still reads as crossing the map.
    let best = ends[0];
    let bestD = -1;
    for (const p of ends) {
      const d = Math.hypot(p.x - fromX, p.y - fromY);
      if (d > bestD) {
        bestD = d;
        best = p;
      }
    }
    pool = [best];
  }

  const claims = (p: { x: number; y: number }) => {
    let n = 0;
    for (const c of claimed) {
      if (Math.hypot(c.x - p.x, c.y - p.y) <= HORDE_END_SCATTER * 2) n++;
    }
    return n;
  };
  const counts = pool.map(claims);
  const least = Math.min(...counts);
  const free = pool.filter((_, i) => counts[i] === least);
  const end = free[(Math.random() * free.length) | 0];

  // Only an end that was opposite to begin with has a promise to keep — the
  // furthest-end fallback above is already short of the line.
  const promised = Math.hypot(end.x - fromX, end.y - fromY) >= far;
  for (let i = 0; i < 6; i++) {
    const t = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * HORDE_END_SCATTER;
    const spot = walkableNear(world, end.x + Math.cos(t) * r, end.y + Math.sin(t) * r);
    if (promised && Math.hypot(spot.x - fromX, spot.y - fromY) < far) continue;
    return spot;
  }
  return end;
}

// ------------------------------------------------------------- formations

/** The golden angle, which is what spreads a phyllotaxis spiral evenly. */
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/**
 * Where slot `i` of a formation sits, relative to its centre.
 *
 * A Vogel spiral, `r = c * sqrt(i + 0.5)` at the golden angle: an even disc that
 * grows outward one body at a time, so slot 0 is always in the middle and the
 * fiftieth is at the rim. The `+ 0.5` is what keeps the first few slots from
 * sitting closer together than a body is wide — at `i` and `i + 1` from zero
 * they would be 22px apart against a 28px body, which is two zombies standing
 * in each other.
 */
function slotOffset(i: number): { dx: number; dy: number } {
  const r = HORDE_SLOT_SPACING * Math.sqrt(i + 0.5);
  const a = i * GOLDEN_ANGLE;
  return { dx: Math.cos(a) * r, dy: Math.sin(a) * r };
}

/**
 * The ground slot `i` works out to around `(cx, cy)`, drawn back toward the
 * centre until it is somewhere a body could stand and could get to from there
 * in a straight line.
 *
 * The straight line is what keeps a formation in one patch of street: a slot
 * that happens to be clear but sits on the far side of a shop front would have
 * a member walk round the block to reach it, which is the horde tearing itself
 * in two at every corner. Same shape as `squadPost`, and for the same reason —
 * a post somebody can never stand on is somebody pressed against a wall.
 */
function slotGoal(
  world: World,
  cx: number,
  cy: number,
  i: number,
  scale: number,
): { x: number; y: number } {
  const o = slotOffset(i);
  for (let t = 1; t > 0.2; t -= 0.25) {
    const x = cx + o.dx * scale * t;
    const y = cy + o.dy * scale * t;
    if (x < 0 || y < 0 || x > WORLD_WIDTH || y > WORLD_HEIGHT) continue;
    if (world.nav.isBlocked(x, y) || !world.nav.isReachable(x, y)) continue;
    if (!hasWallClearPath(world, cx, cy, x, y, false)) continue;
    return { x, y };
  }
  return { x: cx, y: cy };
}

/**
 * Hand out formation slots to a horde's members.
 *
 * **A member keeps its slot for as long as it is a valid one**, and anybody
 * without one — a newcomer, somebody from a horde just merged in, or a member
 * whose index now lies past the end of a group that has shrunk — takes the
 * lowest free. That is what makes the formation shrink *from the outside* as the
 * group takes losses: only the outermost bodies ever move inward to fill a
 * hole, where re-ranking everybody on every tick would send the whole horde
 * shuffling one place along whenever one of them was shot.
 */
function assignSlots(world: World, members: readonly string[]): void {
  const size = members.length;
  const used = new Uint8Array(size);
  const needs: string[] = [];
  for (const id of members) {
    const state = world.ai.get(id);
    if (!state) continue;
    const s = state.hordeSlot;
    if (s >= 0 && s < size && used[s] === 0) used[s] = 1;
    else needs.push(id);
  }
  let free = 0;
  for (const id of needs) {
    while (free < size && used[free] === 1) free++;
    const state = world.ai.get(id)!;
    state.hordeSlot = free < size ? free : 0;
    if (free < size) used[free] = 1;
  }
}

// --------------------------------------------------------------- sightings

/**
 * A member has somebody in sight. Told to the horde, judged later.
 *
 * Called from `senseTarget`, which is a 10Hz-per-zombie path, so it is two
 * number writes and nothing else — no crowd count, no neighbour scan, and no
 * pushing the word out to the members. All three of those are judgements the
 * horde tick makes at 2Hz over a handful of records.
 *
 * The freshest sighting wins outright, including over one that arrived by
 * relay: a horde that can see the crowd itself has better information than the
 * neighbour that sent it.
 */
export function hordeSighting(
  world: World,
  zombieId: string,
  x: number,
  y: number,
  now: number,
): void {
  const id = world.hordeOf.get(zombieId);
  if (id === undefined) return;
  const horde = world.hordes.get(id);
  if (!horde) return;
  horde.preyX = x;
  horde.preyY = y;
  horde.preyUntil = now + HORDE_PREY_MS;
  horde.preyRelayed = false;
}

/**
 * How many people are standing together where somebody was seen.
 *
 * The crowd rather than the one body, because that is the whole of what decides
 * whether another horde is called in — see `HORDE_CROWD_MIN`. Read off the
 * entity grid at 2Hz and at most once per horde, which is what lets it afford
 * to be a spatial query at all.
 *
 * **`queryCircle` rather than `each`, and that is not a style choice.** A body
 * is inserted into the grid over its *bounding box*, so one standing on a cell
 * boundary sits in two buckets and one on a corner in four — and `each`
 * deliberately does not deduplicate. For a predicate that costs one extra test
 * and cannot change the answer, which is what it is written for; for a *count*
 * it is the answer, and four people on the wrong pixels would read as a crowd
 * of seven and call in every horde in earshot.
 *
 * `queryCircle` is a box too, so the radius is re-checked on what comes back —
 * the same rule `senseThreats` follows, and for the same reason: on the
 * diagonal a box hands back bodies half as far again as the radius asked for.
 */
function crowdAt(world: World, x: number, y: number): number {
  let n = 0;
  for (const other of world.entityGrid.queryCircle(x, y, HORDE_CROWD_RADIUS, new Set<Entity>())) {
    if (other.type !== 'human' && other.type !== 'officer') continue;
    if (Math.hypot(other.x - x, other.y - y) > HORDE_CROWD_RADIUS) continue;
    n++;
  }
  return n;
}

/**
 * Word of a crowd, passed to the hordes near enough to hear it.
 *
 * **Only a crowd, and that restriction is the feature rather than a limit on
 * it.** One survivor holed up in a house is one horde's business; if every
 * sighting travelled, two or three hordes would converge on one person behind
 * one door and the rest of the city would be empty. A group of seven is worth
 * everybody's attention and is not something one horde finishes quickly.
 *
 * A horde already onto something of its own is left alone — it has a live
 * sighting and this is at best a second opinion — and a horde that hears this
 * does not pass it on again (`preyRelayed`).
 */
function relayCrowd(world: World, from: Horde, x: number, y: number, now: number): void {
  for (const other of world.hordes.values()) {
    if (other.id === from.id) continue;
    if (other.preyX !== null && now < other.preyUntil) continue;
    if (Math.hypot(other.x - x, other.y - y) > HORDE_ALERT_RANGE) continue;
    other.preyX = x;
    other.preyY = y;
    other.preyUntil = now + HORDE_PREY_MS;
    other.preyRelayed = true;
  }
}

/**
 * Pass the word to the members who have nothing of their own to be getting on
 * with.
 *
 * **It goes into `lastSeen`, and that is the whole of the collective chase.**
 * The branch that walks a zombie to somewhere it saw somebody already exists
 * and already sits above the march, so nothing in `updateZombie` needed a line
 * about hordes for this to work — exactly what `sendToRoar` does with the same
 * field, and for the same reason.
 *
 * **Each member is sent to its own slot around the spot**, at
 * `HORDE_PREY_SPREAD` of the march formation, and not to the spot itself. Fifty
 * bodies told one coordinate arrive on one coordinate, which is the pile and
 * the jiggling over again — and a horde closing round somebody from a spread is
 * also simply what a horde closing round somebody looks like. Whoever gets a
 * look at the person on the way is off `lastSeen` and onto the live chase by
 * itself.
 *
 * Only members with no target and no live memory of one, which is the same
 * precondition `followTheChase` applies, and it does two jobs here. It is what
 * stops a member being dragged off prey it can see itself in favour of a
 * second-hand report; and it is what makes re-stamping on every horde tick free
 * rather than a path thrash, since a member already walking to its spot is
 * skipped and only one that has arrived and given up is told again.
 */
function tellTheHorde(world: World, horde: Horde, members: readonly string[], now: number): void {
  if (horde.preyX === null || horde.preyY === null) return;
  for (const zombieId of members) {
    const state = world.ai.get(zombieId);
    if (!state) continue;
    if (state.targetId !== null) continue;
    if (state.lastSeenX !== null && now < state.lastSeenUntil) continue;
    const spot =
      oneRallyPoint || state.hordeSlot < 0
        ? { x: horde.preyX, y: horde.preyY }
        : slotGoal(world, horde.preyX, horde.preyY, state.hordeSlot, HORDE_PREY_SPREAD);
    state.lastSeenX = spot.x;
    state.lastSeenY = spot.y;
    state.lastSeenUntil = horde.preyUntil;
    state.path = null;
    state.nextPathAt = 0;
    // Whatever room it was working through, and whatever door it had decided to
    // take apart, it has somewhere to be now.
    state.searchBuilding = -1;
    state.searchExit = -1;
    state.doorTarget = -1;
  }
}

// ---------------------------------------------------------------- the tick

/**
 * Re-form the hordes, re-centre them, and give them their orders.
 *
 * Called from `updateAi` beside the danger rebuild, and gated on the round
 * clock: nothing here runs at all until `HORDE_FORM_AT_MS` into the round.
 *
 * Membership is **rebuilt from the live bodies every tick rather than kept as a
 * list**, which is the rule this codebase reaches for wherever something can
 * end four ways — a zombie is shot, burned, blown up, or rises as a dog — and
 * the alternative is a roster somebody has to remember to strike from. Reading
 * last tick's assignment while writing this tick's means a dead id simply never
 * makes it into the new map and nothing has to prune anything.
 */
export function updateHordes(world: World, now: number): void {
  if (noHordes) return;
  if (now - world.startedAt < HORDE_FORM_AT_MS) return;
  if (now < world.nextHordeTick) return;
  world.nextHordeTick = now + HORDE_TICK_MS;

  const cap = uncapped ? Infinity : HORDE_MAX_SIZE;
  const was = world.hordeOf;
  const next = new Map<string, number>();
  const sums = new Map<number, { x: number; y: number; n: number }>();
  const loose: Entity[] = [];

  const add = (id: number, e: Entity) => {
    next.set(e.id, id);
    const acc = sums.get(id);
    if (acc) {
      acc.x += e.x;
      acc.y += e.y;
      acc.n++;
    } else {
      sums.set(id, { x: e.x, y: e.y, n: 1 });
    }
  };

  // Whoever was in a horde last tick and is still standing stays in it, and the
  // centres come out of the same walk — **up to the ceiling**. Anybody past it
  // is loose again, and loose bodies next to a full horde seed a horde of their
  // own below: a group that is over the line splits, and the half that splits
  // off picks its own end and walks away. See `HORDE_MAX_SIZE`.
  for (const e of world.entities.values()) {
    if (e.type !== 'zombie') continue;
    // A player's dog is a zombie with a flag on it and is driven by hand. It has
    // no business being marched anywhere, and a horde formed around one would be
    // a horde whose centre is wherever somebody is steering.
    if (world.dogs.has(e.id)) continue;
    const id = was.get(e.id);
    if (id !== undefined && world.hordes.has(id) && (sums.get(id)?.n ?? 0) < cap) add(id, e);
    else loose.push(e);
  }

  for (const [id, acc] of sums) {
    const horde = world.hordes.get(id);
    if (!horde) continue;
    horde.x = acc.x / acc.n;
    horde.y = acc.y / acc.n;
    horde.size = acc.n;
  }
  // A horde nobody is left in is a horde that was shot.
  for (const id of Array.from(world.hordes.keys())) {
    if (!sums.has(id)) world.hordes.delete(id);
  }

  // The loose ones: join whichever horde's centre is nearest and near enough and
  // that still has room, or seed a new one.
  //
  // Against the *centre* rather than the nearest member, which is what keeps a
  // horde compact — see `HORDE_JOIN_RADIUS`. The centres here are last tick's
  // plus whoever has already joined on this pass, which is close enough at half
  // a second and far cheaper than re-deriving one per join.
  for (const e of loose) {
    let best = -1;
    let bestD = HORDE_JOIN_RADIUS;
    for (const horde of world.hordes.values()) {
      const acc = sums.get(horde.id);
      if (acc && acc.n >= cap) continue;
      const cx = acc ? acc.x / acc.n : horde.x;
      const cy = acc ? acc.y / acc.n : horde.y;
      const d = Math.hypot(e.x - cx, e.y - cy);
      if (d < bestD) {
        bestD = d;
        best = horde.id;
      }
    }
    if (best >= 0) {
      add(best, e);
      continue;
    }
    const horde: Horde = {
      id: world.nextHordeId++,
      x: e.x,
      y: e.y,
      size: 0,
      destX: e.x,
      destY: e.y,
      legUntil: 0,
      bestDist: Infinity,
      bestAt: now,
      aimX: e.x,
      aimY: e.y,
      preyX: null,
      preyY: null,
      preyUntil: 0,
      preyRelayed: false,
    };
    world.hordes.set(horde.id, horde);
    add(horde.id, e);
  }

  // Re-centre with the joiners folded in.
  for (const [id, acc] of sums) {
    const horde = world.hordes.get(id);
    if (!horde) continue;
    horde.x = acc.x / acc.n;
    horde.y = acc.y / acc.n;
    horde.size = acc.n;
  }

  /**
   * Two hordes standing on each other are one horde — if one horde can hold
   * them.
   *
   * Membership is sticky — a zombie stays with the horde it was in — which is
   * what stops a group being torn in half every time another one passes near
   * it. The cost of that is that two masses which genuinely converge would
   * otherwise stay two forever: one blob of sixty bodies with half of them
   * walking north and half walking south, interleaved, which is the one thing
   * on screen that would make the whole feature read as broken.
   *
   * **But never past the ceiling**, because this is where the snowball was:
   * every merge made a bigger horde likelier to meet the next. Two full hordes
   * that meet stay two, and `pickOppositeEnd` keeps them from walking to the
   * same ground in the first place.
   *
   * **Largest first, so the absorber is always the bigger of the pair.** The
   * order is taken before any deletion and every candidate re-checked against
   * the live map, so a horde that has itself been swallowed cannot go on
   * swallowing others. The centre moves to the union's as it goes, weighted.
   *
   * Ahead of the dissolve below rather than after it, so two half-sized groups
   * that have met become one real one instead of both being struck out.
   */
  const order = [...world.hordes.values()].sort((p, q) => q.size - p.size);
  for (const keep of order) {
    if (!world.hordes.has(keep.id)) continue;
    for (const gone of order) {
      if (gone.id === keep.id || !world.hordes.has(gone.id)) continue;
      if (keep.size + gone.size > cap) continue;
      if (Math.hypot(keep.x - gone.x, keep.y - gone.y) > HORDE_MERGE_RADIUS) continue;
      for (const [zombieId, id] of next) {
        if (id === gone.id) next.set(zombieId, keep.id);
      }
      const total = keep.size + gone.size;
      keep.x = (keep.x * keep.size + gone.x * gone.size) / total;
      keep.y = (keep.y * keep.size + gone.y * gone.size) / total;
      keep.size = total;
      // A sighting the absorbed one was onto is worth keeping — the merged
      // horde is the union of them, and word already paid for is not worth
      // throwing away. Never over one of our own, which is the fresher of the
      // two by construction.
      if (keep.preyX === null && gone.preyX !== null) {
        keep.preyX = gone.preyX;
        keep.preyY = gone.preyY;
        keep.preyUntil = gone.preyUntil;
        keep.preyRelayed = gone.preyRelayed;
      }
      world.hordes.delete(gone.id);
    }
  }

  // And dissolve anything that is still not a group. A dissolved horde's
  // members are simply struck out of `next`, so they are loose again and
  // whichever real horde comes past will pick them up — no separate release,
  // and no way for a membership to outlive its record. See `HORDE_MIN_SIZE`.
  for (const horde of [...world.hordes.values()]) {
    if (horde.size < HORDE_MIN_SIZE) world.hordes.delete(horde.id);
  }
  const members = new Map<number, string[]>();
  for (const [zombieId, id] of Array.from(next)) {
    if (!world.hordes.has(id)) {
      next.delete(zombieId);
      continue;
    }
    const list = members.get(id);
    if (list) list.push(zombieId);
    else members.set(id, [zombieId]);
  }
  world.hordeOf = next;

  for (const horde of world.hordes.values()) {
    const list = members.get(horde.id) ?? [];
    assignSlots(world, list);

    if (horde.preyX !== null && now >= horde.preyUntil) {
      horde.preyX = null;
      horde.preyY = null;
      horde.preyRelayed = false;
    }

    if (horde.preyX !== null && horde.preyY !== null) {
      // A crowd is worth telling the neighbours about; one person in a house is
      // not. Only ever off our own sighting — a relayed one is not passed on.
      if (!horde.preyRelayed && crowdAt(world, horde.preyX, horde.preyY) >= HORDE_CROWD_MIN) {
        relayCrowd(world, horde, horde.preyX, horde.preyY, now);
      }
      tellTheHorde(world, horde, list, now);
    }

    // Progress on this leg. A horde onto somebody is not jammed, it is busy, so
    // the clock is held while the chase lasts rather than spent on it.
    const toEnd = Math.hypot(horde.destX - horde.x, horde.destY - horde.y);
    if (horde.preyX !== null) {
      horde.bestDist = toEnd;
      horde.bestAt = now;
    } else if (toEnd < horde.bestDist - HORDE_STALL_PROGRESS) {
      horde.bestDist = toEnd;
      horde.bestAt = now;
    }

    // Arrived, spent long enough on this leg that it is plainly not happening,
    // or stuck where it is. Any of the three: another opposite end.
    const fresh = horde.legUntil === 0;
    const arrived = toEnd < HORDE_ARRIVE_DIST;
    const stalled = now - horde.bestAt > HORDE_STALL_MS;
    if (fresh || (!holdTheirEnd && (arrived || stalled || now >= horde.legUntil))) {
      const claimed: Array<{ x: number; y: number }> = [];
      for (const other of world.hordes.values()) {
        if (other.id === horde.id || other.legUntil === 0) continue;
        claimed.push({ x: other.destX, y: other.destY });
      }
      const end = pickOppositeEnd(world, horde.x, horde.y, claimed);
      horde.destX = end.x;
      horde.destY = end.y;
      horde.legUntil = now + HORDE_LEG_GIVE_UP_MS;
      horde.bestDist = Math.hypot(end.x - horde.x, end.y - horde.y);
      horde.bestAt = now;
    }

    // The centre of the formation — see `aimX`.
    const dx = horde.destX - horde.x;
    const dy = horde.destY - horde.y;
    const d = Math.hypot(dx, dy);
    if (d <= HORDE_STEP_AHEAD) {
      horde.aimX = horde.destX;
      horde.aimY = horde.destY;
    } else {
      const step = walkableNear(
        world,
        horde.x + (dx / d) * HORDE_STEP_AHEAD,
        horde.y + (dy / d) * HORDE_STEP_AHEAD,
      );
      horde.aimX = step.x;
      horde.aimY = step.y;
    }

    // And where in it each member stands. Written at 2Hz because the aim only
    // moves at 2Hz, so a goal worked out per tick would be the same answer
    // thirty times over.
    for (const zombieId of list) {
      const state = world.ai.get(zombieId);
      if (!state || state.hordeSlot < 0) continue;
      const goal = slotGoal(world, horde.aimX, horde.aimY, state.hordeSlot, 1);
      state.hordeGoalX = goal.x;
      state.hordeGoalY = goal.y;
    }
  }
}
