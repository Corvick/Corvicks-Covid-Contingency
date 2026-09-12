/**
 * Hordes: the outbreak stops drifting and starts moving as several large
 * groups.
 *
 * `HORDE_FORM_AT_MS` into a round the shamblers are clustered into hordes, and
 * each horde walks from one end of the map to the opposite one, picks another
 * opposite end, and goes again — the bounce of a DVD-logo screensaver, at
 * walking pace, made of three hundred bodies.
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
 * each one is, where it is going, and who it tells.
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
  HORDE_FORM_AT_MS,
  HORDE_JOIN_RADIUS,
  HORDE_LEG_GIVE_UP_MS,
  HORDE_MERGE_RADIUS,
  HORDE_MIN_SIZE,
  HORDE_OPPOSITE_MIN_SHARE,
  HORDE_PREY_MS,
  HORDE_STEP_AHEAD,
  HORDE_TICK_MS,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from '../../shared/constants.js';
import type { Entity, World } from './world.js';
import { walkableNear } from './world.js';

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
  /** The end of the map it is walking to, and when it gives that leg up. */
  destX: number;
  destY: number;
  legUntil: number;
  /**
   * The point the members are actually walking at: a bounded step along the way
   * to `destX`/`destY`, kept on walkable ground.
   *
   * **This is a cost decision, and a large one.** Handed the far end of the map
   * directly, every member runs `hasWallClearPath` across four thousand pixels
   * of city and then an A\* to match, every re-path, at three hundred bodies —
   * and A\* is superlinear in the distance. A shared waypoint a thousand pixels
   * out is the same march for a fraction of the search.
   *
   * It also happens to look better: one point everybody is converging on is a
   * column rather than three hundred independent routes that happen to share a
   * destination.
   *
   * Recomputed on the horde tick, so it costs one `walkableNear` per horde per
   * half-second — and being walked out to open ground is what stops a waypoint
   * that has landed in somebody's front room becoming a wall the whole horde
   * presses against.
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
 * A random end of the map that is genuinely the *opposite* one.
 *
 * "Opposite" is a distance rather than a compass bearing: any end at least
 * `HORDE_OPPOSITE_MIN_SHARE` of the map's diagonal away qualifies, and one of
 * those is drawn uniformly. From a corner that is the three far ends and none
 * of the near ones, which is the bounce; allowing only the diagonally opposite
 * end would be a horde ping-ponging between two corners forever, which is not
 * "another random opposite end".
 */
export function pickOppositeEnd(
  world: World,
  fromX: number,
  fromY: number,
): { x: number; y: number } {
  const ends = hordeEnds(world);
  const far = Math.hypot(WORLD_WIDTH, WORLD_HEIGHT) * HORDE_OPPOSITE_MIN_SHARE;

  const opposite = ends.filter((p) => Math.hypot(p.x - fromX, p.y - fromY) >= far);
  if (opposite.length > 0) return opposite[(Math.random() * opposite.length) | 0];

  // Nothing qualifies — a horde stood dead in the middle of a city small enough
  // that no end clears half the diagonal. Take the furthest rather than
  // refusing: a leg somewhere is the whole behaviour, and the furthest end
  // still reads as crossing the map.
  let best = ends[0];
  let bestD = -1;
  for (const p of ends) {
    const d = Math.hypot(p.x - fromX, p.y - fromY);
    if (d > bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
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
 * Only members with no target and no live memory of one, which is the same
 * precondition `followTheChase` applies, and it does two jobs here. It is what
 * stops a member being dragged off prey it can see itself in favour of a
 * second-hand report; and it is what makes re-stamping on every horde tick free
 * rather than a path thrash, since a member already walking to the spot is
 * skipped and only one that has arrived and given up is told again.
 */
function tellTheHorde(world: World, horde: Horde, now: number): void {
  if (horde.preyX === null || horde.preyY === null) return;
  for (const [zombieId, hordeId] of world.hordeOf) {
    if (hordeId !== horde.id) continue;
    const state = world.ai.get(zombieId);
    if (!state) continue;
    if (state.targetId !== null) continue;
    if (state.lastSeenX !== null && now < state.lastSeenUntil) continue;
    state.lastSeenX = horde.preyX;
    state.lastSeenY = horde.preyY;
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
  // centres come out of the same walk.
  for (const e of world.entities.values()) {
    if (e.type !== 'zombie') continue;
    // A player's dog is a zombie with a flag on it and is driven by hand. It has
    // no business being marched anywhere, and a horde formed around one would be
    // a horde whose centre is wherever somebody is steering.
    if (world.dogs.has(e.id)) continue;
    const id = was.get(e.id);
    if (id !== undefined && world.hordes.has(id)) add(id, e);
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

  // The loose ones: join whichever horde's centre is nearest and near enough,
  // or seed a new one.
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
   * Two hordes standing on each other are one horde.
   *
   * Membership is sticky — a zombie stays with the horde it was in — which is
   * what stops a group being torn in half every time another one passes near
   * it. The cost of that is that two masses which genuinely converge would
   * otherwise stay two forever: one blob of sixty bodies with half of them
   * walking north and half walking south, interleaved, which is the one thing
   * on screen that would make the whole feature read as broken.
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
  for (const [zombieId, id] of Array.from(next)) {
    if (!world.hordes.has(id)) next.delete(zombieId);
  }
  world.hordeOf = next;

  for (const horde of world.hordes.values()) {
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
      tellTheHorde(world, horde, now);
    }

    // Arrived, or spent long enough on this leg that it is plainly not
    // happening. Either way: another opposite end.
    const arrived = Math.hypot(horde.destX - horde.x, horde.destY - horde.y) < HORDE_ARRIVE_DIST;
    if (arrived || now >= horde.legUntil) {
      const end = pickOppositeEnd(world, horde.x, horde.y);
      horde.destX = end.x;
      horde.destY = end.y;
      horde.legUntil = now + HORDE_LEG_GIVE_UP_MS;
    }

    // And the point the members actually walk at — see `aimX`.
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
  }
}
