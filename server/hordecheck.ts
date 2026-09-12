/**
 * Headless check on hordes. No socket, no port, so it leaves a game on 8080
 * alone.
 *
 * Four claims, and they are measured separately because they fail separately:
 *
 *  1. **Nothing at all happens before six minutes.** The control that costs
 *     nothing and is the easiest thing here to break silently — a round that
 *     formed hordes at 30s would still pass every other row below.
 *  2. **Several large groups form**, every one of them a group.
 *  3. **Each one bounces**: it walks to an end of the map, and the end it
 *     picks next is an opposite one. `HORDE_OPPOSITE_MIN_SHARE` of the
 *     diagonal is the claim, and it is checked against where the horde
 *     actually was at the moment it chose.
 *  4. **The word travels, and only for a crowd.** This is the reported
 *     purpose: a lone survivor in a house is one horde's problem, and seven
 *     people together are everybody's. Both halves need measuring, and the
 *     lone-survivor half is the one that matters — "another horde came" is
 *     satisfied just as well by a rule that always relays.
 *  5. **No horde past `HORDE_MAX_SIZE`, and a spot each in it.** One horde
 *     had eaten ~500 of 628 zombies and every member was walking at one
 *     point, jiggling against the rest. Measured against `setHordesUncapped`
 *     and `setHordeOneRallyPoint`, with `setHordesHoldTheirEnd` to watch a
 *     formation settle — plus the stall re-pick and hordes not sharing an end.
 *
 * `setNoHordes` is the gate and it is **kept**. Three of the four rows are a
 * gain against a control, and the collective-chase row is measured entirely
 * against it: a horde converging on somebody is satisfied just as well by
 * ordinary zombies wandering that way, and `followTheChase` already carries
 * word one hop on its own.
 *
 * Both modes run in ONE process on the same staged city — two `npx tsx`
 * invocations on this box are not comparable, and the map is not seeded.
 *
 * **The clock has to start where the world's does.** `resetWorld` takes no
 * `now` and stamps every fresh AiState with `Date.now()`, so a harness running
 * its own clock from zero leaves `nextSenseAt` decades away and nothing ever
 * perceives anything — which reads as bodies standing about, and is
 * indistinguishable from the feature not working. And `world.startedAt` is
 * stamped the same way, which is the whole of how the six minutes are counted:
 * the rig moves *that* backwards rather than ticking for six real minutes.
 *
 *   npx tsx hordecheck.ts
 *   RUNS=6 npx tsx hordecheck.ts
 *
 * Not typechecked by `npx tsc --noEmit` in `server/` — that only includes
 * `src/**`. Check it explicitly:
 *   npx tsc --noEmit --target ES2022 --module ESNext --moduleResolution Bundler \
 *     --strict --skipLibCheck --types node hordecheck.ts
 */
import {
  createWorld,
  resetWorld,
  rebuildNav,
  rebuildEntityGrid,
  resolveCollisions,
  walkableNear,
  hasLineOfSight,
  makeEntity,
  newAiState,
  type World,
  type Entity,
} from './src/world.js';
import { computeFrozen, updateAi } from './src/ai.js';
import {
  setHordeAimsAtTheEnd,
  setHordeOneRallyPoint,
  setHordesHoldTheirEnd,
  setHordesUncapped,
  setNoHordes,
  updateHordes,
} from './src/horde.js';
import {
  TICK_RATE,
  PATH_NODE_BUDGET_PER_TICK,
  HORDE_FORM_AT_MS,
  HORDE_MIN_SIZE,
  HORDE_OPPOSITE_MIN_SHARE,
  HORDE_CROWD_MIN,
  HORDE_ALERT_RANGE,
  HORDE_SPREAD,
  HORDE_JOIN_RADIUS,
  HORDE_MERGE_RADIUS,
  ZOMBIE_SIGHT_RADIUS,
  HORDE_CROWD_RADIUS,
  HORDE_MAX_SIZE,
  HORDE_STALL_MS,
  ZOMBIE_RADIUS,
} from '../shared/constants.js';

const TICK_MS = 1000 / TICK_RATE;
const RUNS = Number(process.env.RUNS ?? 6);

const f1 = (n: number): string => n.toFixed(1);
function med(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = xs.slice().sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

let checks = 0;
let failures = 0;
function check(ok: boolean, label: string, detail = ''): void {
  checks++;
  if (!ok) failures++;
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail ? '  - ' + detail : ''}`);
}

function tick(world: World, now: number, dt: number): void {
  world.pathBudget = PATH_NODE_BUDGET_PER_TICK;
  if (world.navDirty) rebuildNav(world);
  rebuildEntityGrid(world);
  updateAi(world, now, dt, computeFrozen(world));
  resolveCollisions(world);
}

/**
 * A city with nothing alive in it but what we put there.
 *
 * Stripped for the reason `complexcheck.ts` strips it: a live outbreak turns
 * every run into a measurement of how far the city got rather than of what the
 * hordes did, and here it would also feed hundreds of unstaged zombies into the
 * clustering and make the horde count the city's answer instead of the rule's.
 */
function bareCity(world: World): void {
  resetWorld(world);
  for (const id of [...world.entities.keys()]) {
    world.entities.delete(id);
    world.ai.delete(id);
  }
  world.cityOfficers.clear();
  world.bots.clear();
  world.hordes.clear();
  world.hordeOf.clear();
  world.nextHordeTick = 0;
  world.navDirty = true;
  rebuildNav(world);
  rebuildEntityGrid(world);
}

/**
 * Wind the round's own clock back so the six minutes have passed.
 *
 * `world.startedAt` is a plain field stamped with `Date.now()`, and moving it
 * is the only honest way to reach the six-minute mark: ticking there takes
 * 10,800 ticks of a 500-entity city. `back` is how far past the mark to land.
 */
function ageRound(world: World, now: number, back = 1000): void {
  world.startedAt = now - HORDE_FORM_AT_MS - back;
}

/**
 * A clump of zombies around a point, close enough together to be one horde.
 *
 * A phyllotaxis spiral rather than a random scatter, so the same count always
 * stages the same shape — a horde that forms is then the clustering working
 * rather than the draw having been kind, and the figures do not move between
 * runs of the same code. `tight` is the whole difference between a clump that
 * can all see over each other's shoulders and one that cannot.
 */
function clump(
  world: World,
  now: number,
  tag: string,
  cx: number,
  cy: number,
  n: number,
  tight = 46,
): Entity[] {
  const out: Entity[] = [];
  for (let i = 0; i < n; i++) {
    const a = i * 2.399;
    const r = 40 + Math.sqrt(i) * tight;
    const spot = walkableNear(world, cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    const e = makeEntity(`${tag}-${i}`, 'zombie', spot.x, spot.y);
    world.entities.set(e.id, e);
    world.ai.set(e.id, newAiState(now, e.x, e.y));
    out.push(e);
  }
  rebuildEntityGrid(world);
  return out;
}

/** Somebody to be seen. */
function person(world: World, now: number, id: string, x: number, y: number): Entity {
  const spot = walkableNear(world, x, y);
  const e = makeEntity(id, 'human', spot.x, spot.y);
  world.entities.set(e.id, e);
  world.ai.set(e.id, newAiState(now, e.x, e.y));
  return e;
}

/**
 * Everything alive taken out, the city left standing.
 *
 * `resetWorld` generates a fresh map and is far too expensive to run per
 * staging attempt — and both halves of the relay row have to be staged on the
 * *same* city anyway, or the comparison is between two cities rather than
 * between two crowd sizes.
 */
function clearBodies(world: World): void {
  for (const id of [...world.entities.keys()]) {
    world.entities.delete(id);
    world.ai.delete(id);
  }
  world.grapples.clear();
  world.pendingInfections.clear();
  world.hordes.clear();
  world.hordeOf.clear();
  world.nextHordeTick = 0;
  rebuildEntityGrid(world);
}

interface Lane {
  x: number;
  y: number;
  /** Unit vector along the run. */
  dx: number;
  dy: number;
}

/** Open ground out to `r`, and all of it on the map's main walkable region. */
function clearDisc(world: World, x: number, y: number, r: number): boolean {
  for (let a = 0; a < 12; a++) {
    const t = (a / 12) * Math.PI * 2;
    for (let d = 0; d <= r; d += 26) {
      const px = x + Math.cos(t) * d;
      const py = y + Math.sin(t) * d;
      if (world.nav.isBlocked(px, py) || !world.nav.isReachable(px, py)) return false;
    }
  }
  return true;
}

/**
 * Somewhere to stand a clump, with a scout out in front of it and somebody for
 * that scout to see.
 *
 * **The preconditions are checked rather than assumed, and they are the ones
 * the measurement actually needs** — which is much less than it first looks.
 * The obvious staging is a long straight corridor of open ground, and that is a
 * rig that reports the city: a 1000px run clear to a body's width does not
 * exist on most maps, and demanding one staged **nothing at all** on four
 * cities in a row. What this claim rests on is a line of sight from the scout
 * to the prey, room for the clump to stand, and nobody else able to see the
 * scout. Walls between the pack and the prey are fine — the horde paths round
 * them, which is the behaviour rather than an obstacle to measuring it.
 */
function chaseSpot(world: World, lead: number, reach: number): Lane | null {
  for (let i = 0; i < 5000; i++) {
    const x = 300 + Math.random() * (world.map.width - 600);
    const y = 300 + Math.random() * (world.map.height - 600);
    const a = Math.random() * Math.PI * 2;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    // Enough room for the clump to stand as a clump.
    if (!clearDisc(world, x, y, 130)) continue;
    const sx = x + dx * lead;
    const sy = y + dy * lead;
    if (!clearDisc(world, sx, sy, 60)) continue;
    const px = sx + dx * reach;
    const py = sy + dy * reach;
    if (world.nav.isBlocked(px, py) || !world.nav.isReachable(px, py)) continue;
    // The one thing that cannot be worked around: the scout has to see them.
    if (!hasLineOfSight(world, sx, sy, px, py, false, 'zombie')) continue;
    return { x, y, dx, dy };
  }
  return null;
}

/** The rig's own copy of the crowd count, for reporting why a relay did not fire. */
function crowdAtSpot(world: World, x: number, y: number): number {
  let n = 0;
  for (const e of world.entities.values()) {
    if (e.type !== 'human' && e.type !== 'officer') continue;
    if (Math.hypot(e.x - x, e.y - y) <= HORDE_CROWD_RADIUS) n++;
  }
  return n;
}

/** Where a staged group actually is now, by id prefix. */
function liveCentre(world: World, prefix: string): { x: number; y: number } | null {
  let x = 0;
  let y = 0;
  let n = 0;
  for (const e of world.entities.values()) {
    if (!e.id.startsWith(prefix)) continue;
    x += e.x;
    y += e.y;
    n++;
  }
  return n === 0 ? null : { x: x / n, y: y / n };
}

function centreOf(bodies: Entity[]): { x: number; y: number } {
  let x = 0;
  let y = 0;
  for (const e of bodies) {
    x += e.x;
    y += e.y;
  }
  return { x: x / bodies.length, y: y / bodies.length };
}

// ------------------------------------------------------ 1. before six minutes

/**
 * The control, and the cheapest row here to get wrong.
 *
 * A round five minutes in must be byte-for-byte the round it always was: no
 * hordes, nobody in one, and — the part that actually says the guard is the
 * clock rather than luck — the same city one tick later than the mark forms
 * them.
 */
function beforeAndAfter(world: World): void {
  console.log('\n--- the six minutes ---');
  const now0 = Date.now();
  bareCity(world);
  const lane = chaseSpot(world, 0, 0);
  if (!lane) {
    console.log('  (no open ground on this city; skipped)');
    return;
  }
  clump(world, now0, 'z', lane.x, lane.y, 24, 23);

  // Five minutes in. Ticked long enough that a horde tick would certainly have
  // fired if the clock were not holding it off.
  world.startedAt = now0 - (HORDE_FORM_AT_MS - 60_000);
  let now = now0;
  for (let i = 0; i < 60; i++) {
    tick(world, now, TICK_MS / 1000);
    now += TICK_MS;
  }
  check(world.hordes.size === 0, 'five minutes in: no hordes', `${world.hordes.size} hordes`);
  check(world.hordeOf.size === 0, 'five minutes in: nobody in one', `${world.hordeOf.size} members`);

  // Now past it, same city, same bodies.
  ageRound(world, now);
  for (let i = 0; i < 10; i++) {
    tick(world, now, TICK_MS / 1000);
    now += TICK_MS;
  }
  check(world.hordes.size > 0, 'past six minutes: a horde forms', `${world.hordes.size} hordes`);
}

// -------------------------------------------------------------- 2. + 3. form and bounce

/**
 * Several large groups, and each one bouncing off an end of the map.
 *
 * The bounce is checked at the moment of *choosing* rather than afterwards: a
 * destination is opposite relative to where the horde stood when it picked, and
 * comparing it to where the horde has since walked would call every leg a
 * failure the moment it was half done.
 */
function formAndBounce(world: World): void {
  console.log('\n--- forming, and the bounce ---');
  const sizes: number[] = [];
  const counts: number[] = [];
  const formed: number[] = [];
  let sharedEnds = 0;
  let endPairs = 0;
  const spreads: number[] = [];
  let legs = 0;
  let oppositeLegs = 0;
  let repeats = 0;
  let tooSmall = 0;
  let adriftTicks = 0;
  let memberTicks = 0;
  let marched = 0;
  let ran = 0;

  for (let r = 0; r < RUNS; r++) {
    const now0 = Date.now();
    bareCity(world);
    // Four clumps, spread across the city, well outside each other's join
    // radius — so "several groups" is a thing the clustering has to produce
    // rather than a thing the staging guarantees by putting them in one place.
    const w = world.map.width;
    const h = world.map.height;
    const seeds = [
      { x: w * 0.2, y: h * 0.2 },
      { x: w * 0.8, y: h * 0.2 },
      { x: w * 0.2, y: h * 0.8 },
      { x: w * 0.8, y: h * 0.8 },
    ];
    const groups = seeds.map((s, i) => clump(world, now0, `z${i}`, s.x, s.y, 22));
    ageRound(world, now0);

    let now = now0;
    const startSpread = groups.map((g) => {
      const c = centreOf(g);
      return med(g.map((e) => Math.hypot(e.x - c.x, e.y - c.y)));
    });

    // Watch each horde's destination, and score every time it changes.
    const dest = new Map<number, { x: number; y: number }>();
    // 90s. Long enough for several horde ticks and for the mass to get well
    // under way, and nowhere near long enough to walk a whole leg — which is
    // why the bounce is judged on the choice rather than on arrivals.
    const TICKS = 2700;
    for (let i = 0; i < TICKS; i++) {
      tick(world, now, TICK_MS / 1000);
      now += TICK_MS;
      for (const horde of world.hordes.values()) {
        const had = dest.get(horde.id);
        if (had && had.x === horde.destX && had.y === horde.destY) continue;
        if (had) {
          legs++;
          const far = Math.hypot(world.map.width, world.map.height) * HORDE_OPPOSITE_MIN_SHARE;
          if (Math.hypot(horde.destX - horde.x, horde.destY - horde.y) >= far) oppositeLegs++;
          if (Math.hypot(had.x - horde.destX, had.y - horde.destY) < 1) repeats++;
        }
        dest.set(horde.id, { x: horde.destX, y: horde.destY });
      }
      if (i % 15 === 0) {
        for (const [zid, hid] of world.hordeOf) {
          const h = world.hordes.get(hid);
          const z = world.entities.get(zid);
          if (!h || !z) continue;
          memberTicks++;
          if (Math.hypot(z.x - h.x, z.y - h.y) > HORDE_SPREAD) adriftTicks++;
        }
      }
      if (i === 60) formed.push(world.hordes.size);
      if (i === 60) {
        // Two hordes walking at the same end arrive on the same ground, and with a
        // ceiling they can no longer merge there. Two different ends are at least
        // ~1500px apart and one end scattered twice is at most 700, so 800 is a
        // line with daylight either side of it.
        const hs = [...world.hordes.values()];
        for (let a = 0; a < hs.length; a++) {
          for (let b = a + 1; b < hs.length; b++) {
            endPairs++;
            if (Math.hypot(hs[a].destX - hs[b].destX, hs[a].destY - hs[b].destY) < 800) sharedEnds++;
          }
        }
      }
      if (i === 0) {
        for (const horde of world.hordes.values()) {
          const far = Math.hypot(world.map.width, world.map.height) * HORDE_OPPOSITE_MIN_SHARE;
          legs++;
          if (Math.hypot(horde.destX - horde.x, horde.destY - horde.y) >= far) oppositeLegs++;
        }
      }
    }

    ran++;
    counts.push(world.hordes.size);
    for (const horde of world.hordes.values()) {
      sizes.push(horde.size);
      if (horde.size < HORDE_MIN_SIZE) tooSmall++;
    }

    // Did the mass actually go anywhere, and is it still a mass?
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i].filter((e) => world.entities.has(e.id));
      if (g.length === 0) continue;
      const c = centreOf(g);
      const moved = Math.hypot(c.x - seeds[i].x, c.y - seeds[i].y);
      if (moved > 400) marched++;
      spreads.push(med(g.map((e) => Math.hypot(e.x - c.x, e.y - c.y))) - startSpread[i]);
    }
  }

  console.log(
    `  ${ran} cities: ${med(formed)} hordes on forming, ${med(counts)} left after 90s of marching ` +
      `(they merge when they meet), sizes ${Math.min(...sizes)}-${Math.max(...sizes)}`,
  );
  check(med(formed) >= 3, 'several large groups form', `${med(formed)} hordes, median`);
  check(sharedEnds === 0, 'no two hordes sent to the same end', `${sharedEnds} of ${endPairs} pairs`);
  check(tooSmall === 0, 'every one of them a group', `${tooSmall} under HORDE_MIN_SIZE (${HORDE_MIN_SIZE})`);
  check(legs > 0, 'legs chosen', `${legs}`);
  check(
    oppositeLegs === legs,
    'every leg is to an opposite end',
    `${oppositeLegs}/${legs} at least ${HORDE_OPPOSITE_MIN_SHARE} of the diagonal`,
  );
  check(repeats === 0, 'and never the end it just left', `${repeats} repeats`);
  check(marched >= ran * 3, 'the mass actually walks it', `${marched}/${ran * 4} groups moved 400px+`);
  // Informational, and worth knowing before anybody deletes the cohesion
  // branch: how often a member is actually far enough out for it to fire. On
  // open ground with nothing to fight it is rare, which is right — what it is
  // there for is the straggler held up at a door or shot at, and a bare city
  // has neither.
  console.log(
    `  members further than HORDE_SPREAD (${HORDE_SPREAD}) from their own centre: ` +
      `${((adriftTicks / Math.max(1, memberTicks)) * 100).toFixed(2)}% of member-ticks`,
  );
  check(
    med(spreads) < HORDE_SPREAD,
    'and stays a mass while it does',
    `median spread ${med(spreads) >= 0 ? '+' : ''}${f1(med(spreads))}px over 90s`,
  );
}

// -------------------------------------------------------------- 3b. merging

/**
 * Two masses standing on each other become one; two that are plainly apart
 * stay two.
 *
 * Measured directly rather than inferred from a long march, which is what the
 * row above was accidentally doing: staged four clumps, marched them for ninety
 * seconds, and counted two at the end — the merge working, read as the
 * clustering failing. Both halves are needed here, and the *apart* half is the
 * discriminating one: a rule that merged everything would pass the first row
 * perfectly and quietly collapse the whole city into one horde.
 */
function mergeRow(world: World): void {
  console.log('\n--- two that meet become one ---');
  let together = 0;
  let apart = 0;
  let staged = 0;

  for (let r = 0; r < RUNS; r++) {
    bareCity(world);
    const lane = chaseSpot(world, 0, 0);
    if (!lane) continue;
    staged++;
    const now0 = Date.now();

    // Overlapping: two centres well inside the merge radius.
    clearBodies(world);
    clump(world, now0, 'a', lane.x, lane.y, 14, 23);
    clump(world, now0, 'b', lane.x + lane.dx * HORDE_MERGE_RADIUS * 0.5, lane.y + lane.dy * HORDE_MERGE_RADIUS * 0.5, 14, 23);
    ageRound(world, now0);
    let now = now0;
    for (let i = 0; i < 60; i++) {
      tick(world, now, TICK_MS / 1000);
      now += TICK_MS;
    }
    if (world.hordes.size === 1) together++;

    // Apart: two centres well outside it. Read straight after forming, before
    // either has had time to walk into the other.
    clearBodies(world);
    clump(world, now0, 'a', lane.x, lane.y, 14, 23);
    clump(world, now0, 'b', lane.x + lane.dx * HORDE_MERGE_RADIUS * 3, lane.y + lane.dy * HORDE_MERGE_RADIUS * 3, 14, 23);
    ageRound(world, now0);
    now = now0;
    for (let i = 0; i < 60; i++) {
      tick(world, now, TICK_MS / 1000);
      now += TICK_MS;
    }
    if (world.hordes.size === 2) apart++;
  }

  if (staged === 0) {
    console.log('  (nothing staged on these cities; claiming nothing)');
    return;
  }
  check(together === staged, 'two standing on each other are one horde', `${together}/${staged}`);
  check(apart === staged, 'two plainly apart stay two', `${apart}/${staged}`);
}

// ------------------------------------------------------ 4. the collective chase

/**
 * One member sees somebody; the whole horde comes.
 *
 * Measured against the gate, and it has to be: zombies wander, and
 * `followTheChase` already carries word one hop, so "some of them ended up over
 * there" is satisfied by the old behaviour too. What separates them is *how
 * many* of the horde converge.
 *
 * The human is staged so that exactly one member can see them — just inside
 * that one's sight radius and well outside everybody else's, on the far side of
 * the clump — or the run measures a crowd of zombies all spotting somebody
 * independently, which needs no horde at all.
 */
const CHASE_N = 20;
/**
 * How far out in front of the pack the one that spots them stands.
 *
 * **Chosen so nobody else can see the scout either**, which is the whole of
 * what makes the control mean anything: `followTheChase` already carries word
 * one hop off a chaser that is in sight, so a scout standing among its horde
 * would have the old behaviour pull the pack along too and the row would be
 * measuring that instead. At this lead the nearest member is well outside
 * `ZOMBIE_SIGHT_RADIUS` of it, and inside `HORDE_JOIN_RADIUS` of the centre so
 * it is still one of them.
 */
const CHASE_LEAD = 620;

function collectiveChase(world: World, lane: Lane): { came: number; of: number } | null {
  const now0 = Date.now();
  clearBodies(world);

  const cx = lane.x;
  const cy = lane.y;
  const bodies = clump(world, now0, 'z', cx, cy, CHASE_N - 1, 23);
  const sx = cx + lane.dx * CHASE_LEAD;
  const sy = cy + lane.dy * CHASE_LEAD;
  const scout = makeEntity(`z-${CHASE_N - 1}`, 'zombie', sx, sy);
  world.entities.set(scout.id, scout);
  world.ai.set(scout.id, newAiState(now0, scout.x, scout.y));
  bodies.push(scout);

  const prey = person(
    world,
    now0,
    'v',
    sx + lane.dx * ZOMBIE_SIGHT_RADIUS * 0.7,
    sy + lane.dy * ZOMBIE_SIGHT_RADIUS * 0.7,
  );
  rebuildEntityGrid(world);

  // Exactly one of them may be able to see the prey, or this measures twenty
  // independent sightings and needs no horde at all. Sight rather than
  // distance, since a wall would do it too.
  let canSee = 0;
  for (const e of bodies) {
    if (Math.hypot(prey.x - e.x, prey.y - e.y) > ZOMBIE_SIGHT_RADIUS) continue;
    if (!hasLineOfSight(world, e.x, e.y, prey.x, prey.y, false, e.type)) continue;
    canSee++;
  }
  if (canSee !== 1) return null;
  // And nobody may see the scout, or the old behaviour carries the word one hop
  // on its own and the control stops being one.
  for (const e of bodies) {
    if (e.id === scout.id) continue;
    if (Math.hypot(scout.x - e.x, scout.y - e.y) <= ZOMBIE_SIGHT_RADIUS) return null;
  }

  ageRound(world, now0);
  // Pin the human. A body that runs makes this a measurement of the chase
  // rather than of the word going round, and one that is eaten ends the run
  // with most of the horde still walking.
  const px = prey.x;
  const py = prey.y;

  let now = now0;
  const near = new Set<string>();
  for (let i = 0; i < 900; i++) {
    prey.x = px;
    prey.y = py;
    prey.health = prey.maxHealth;
    world.grapples.delete(prey.id);
    world.pendingInfections.delete(prey.id);
    tick(world, now, TICK_MS / 1000);
    now += TICK_MS;
    for (const e of bodies) {
      const live = world.entities.get(e.id);
      if (!live) continue;
      // Closed to within half the sight radius of where the word said to go.
      // "Came" rather than "is standing on them": twenty bodies cannot all
      // stand on one pixel, and collision would decide which of them did.
      if (Math.hypot(live.x - px, live.y - py) < ZOMBIE_SIGHT_RADIUS * 0.5) near.add(e.id);
    }
  }
  return { came: near.size, of: CHASE_N };
}

function chaseRow(world: World): void {
  console.log('\n--- one sees, all come ---');
  const on: number[] = [];
  const offv: number[] = [];
  let staged = 0;
  for (let r = 0; r < RUNS; r++) {
    bareCity(world);
    // The run has to hold the clump, the scout out in front of it and the prey
    // beyond that, with room for the pack to walk it.
    const lane = chaseSpot(world, CHASE_LEAD, ZOMBIE_SIGHT_RADIUS * 0.7);
    if (!lane) continue;
    // Both modes on the same city, the same lane and the same staged shape —
    // unpaired this measures the city, which is the trap `rallycheck` records.
    setNoHordes(true);
    const a = collectiveChase(world, lane);
    setNoHordes(false);
    const b = collectiveChase(world, lane);
    if (!a || !b) continue;
    staged++;
    offv.push(a.came);
    on.push(b.came);
  }
  if (staged === 0) {
    console.log('  (nothing staged on these cities; claiming nothing)');
    return;
  }
  console.log(
    `  ${staged} stagings, of ${CHASE_N} members: OLD ${med(offv)} came, NEW ${med(on)} came`,
  );
  check(
    med(on) > med(offv) * 2,
    'the horde comes, where loose zombies do not',
    `${med(offv)} -> ${med(on)} of ${CHASE_N}`,
  );
}

// --------------------------------------------------------- 5. crowd vs one man

/**
 * The reported purpose, and the half that matters is the refusal.
 *
 * Two hordes, `HORDE_ALERT_RANGE` apart so the word *can* travel. One of them
 * is shown a single survivor, then the same staging is shown a group. The
 * second horde must hear about the group and must not hear about the one man —
 * "this will prevent multiple hordes going after 1 human in a house".
 *
 * The lone-survivor row is the discriminating one: a rule that always relayed
 * would pass the crowd row perfectly.
 */
/** The scout of the near horde stands out in front of it, as in the chase row. */
const RELAY_SCOUT_LEAD = 620;
/** How far off the second horde stands — inside earshot, far outside sight. */
const RELAY_BACK = HORDE_ALERT_RANGE * 0.65;

/**
 * Somewhere within earshot of the crowd to stand the second horde — and far
 * enough from the first to *be* a second horde.
 *
 * **That last clause was missing and it invalidated the whole row.** The spot
 * is picked on a random bearing at `RELAY_BACK` from the crowd, and the crowd
 * is only ~870px beyond the near horde — so a bearing pointing back down the
 * lane put the "other" horde within `HORDE_MERGE_RADIUS` of the first, the
 * clustering quite correctly made them one horde of forty, and the check then
 * reported that nobody was told. Traced: `#21[a20/b20]s40`, one record with
 * every body in it, on 4 stagings in 8.
 *
 * Two merge radii of separation, so neither the greedy join nor the merge pass
 * can fold them together even after both have marched for a few seconds.
 */
function relaySpot(
  world: World,
  x: number,
  y: number,
  awayX: number,
  awayY: number,
): { x: number; y: number } | null {
  for (let i = 0; i < 4000; i++) {
    const t = Math.random() * Math.PI * 2;
    // A band of distances rather than one ring. Pinned to a single radius the
    // search has only a circle of candidates to offer and most of it is inside
    // a building or too near the first horde — it staged 2 runs in 6.
    const d = HORDE_ALERT_RANGE * (0.45 + Math.random() * 0.4);
    const bx = x + Math.cos(t) * d;
    const by = y + Math.sin(t) * d;
    if (bx < 300 || by < 300 || bx > world.map.width - 300 || by > world.map.height - 300) continue;
    if (Math.hypot(bx - awayX, by - awayY) < HORDE_MERGE_RADIUS * 2) continue;
    if (!clearDisc(world, bx, by, 130)) continue;
    return { x: bx, y: by };
  }
  return null;
}

interface RelayOut {
  relayed: boolean;
  saw: boolean;
  /** What the crowd looked like on the first tick the near horde had a sighting. */
  minSeen: number;
  bDist: number;
  firstAt: number;
}

function crowdRelay(world: World, lane: Lane, crowd: number): RelayOut | null {
  const now0 = Date.now();
  clearBodies(world);

  // Horde A, with the one that spots them out in front of it.
  const a = clump(world, now0, 'a', lane.x, lane.y, 19, 23);
  const sx = lane.x + lane.dx * RELAY_SCOUT_LEAD;
  const sy = lane.y + lane.dy * RELAY_SCOUT_LEAD;
  const scout = makeEntity('a-19', 'zombie', sx, sy);
  world.entities.set(scout.id, scout);
  world.ai.set(scout.id, newAiState(now0, scout.x, scout.y));
  a.push(scout);

  const knotX = sx + lane.dx * ZOMBIE_SIGHT_RADIUS * 0.6;
  const knotY = sy + lane.dy * ZOMBIE_SIGHT_RADIUS * 0.6;
  for (let i = 0; i < crowd; i++) {
    // A knot well inside `HORDE_CROWD_RADIUS`, so what `crowdAt` counts is the
    // staged number rather than however a scatter happened to fall.
    const t = (i / Math.max(1, crowd)) * Math.PI * 2;
    person(world, now0, `p${i}`, knotX + Math.cos(t) * 44, knotY + Math.sin(t) * 44);
  }

  // Horde B: inside alert range of the sighting, and far outside its own sight
  // of it — so anything it learns, it learned from A.
  const aCentre = centreOf(a);
  const bSpot = relaySpot(world, knotX, knotY, aCentre.x, aCentre.y);
  if (!bSpot) return null;
  const b = clump(world, now0, 'b', bSpot.x, bSpot.y, 20, 23);
  rebuildEntityGrid(world);

  // **Every one of them where the scout can actually see them.** `person` puts
  // each body through `walkableNear`, which can move it a long way off the spot
  // asked for — so checking the line to the knot's *nominal* centre says
  // nothing about where anybody ended up, and a staging where the scout can see
  // three of nine is a staging that reports the city.
  const pinned: Array<{ e: Entity; x: number; y: number }> = [];
  for (let k = 0; k < crowd; k++) {
    const p = world.entities.get(`p${k}`);
    if (!p) return null;
    if (Math.hypot(p.x - scout.x, p.y - scout.y) > ZOMBIE_SIGHT_RADIUS) return null;
    if (!hasLineOfSight(world, scout.x, scout.y, p.x, p.y, false, 'zombie')) return null;
    // And close enough together to be one group, measured the way `crowdAt`
    // measures it rather than the way they were asked to stand.
    if (Math.hypot(p.x - knotX, p.y - knotY) > HORDE_CROWD_RADIUS * 0.5) return null;
    pinned.push({ e: p, x: p.x, y: p.y });
  }
  for (const e of b) {
    if (Math.hypot(knotX - e.x, knotY - e.y) <= ZOMBIE_SIGHT_RADIUS) return null;
  }
  // And the word has to be able to reach B at all, or "it was not told" is the
  // staging rather than the rule.
  const bc = centreOf(b);
  if (Math.hypot(knotX - bc.x, knotY - bc.y) > HORDE_ALERT_RANGE) return null;

  ageRound(world, now0);
  let now = now0;

  // One tick to let the clustering run, and then the precondition that was
  // missing and cost this row half its stagings: **they have to be two
  // hordes.** Staged too close, the clustering quite correctly makes them one
  // record of forty, and "the other horde was not told" is then a statement
  // about a horde that does not exist.
  tick(world, now, TICK_MS / 1000);
  now += TICK_MS;
  let aHorde = -1;
  let bHorde = -1;
  for (const [id, hid] of world.hordeOf) {
    if (id.startsWith('a-')) aHorde = hid;
    if (id.startsWith('b-')) bHorde = hid;
  }
  if (aHorde < 0 || bHorde < 0 || aHorde === bHorde) return null;

  let saw = false;
  let relayed = false;
  let minSeen = 999;
  let bDist = 0;
  let firstAt = -1;
  // 8s: several horde ticks, and well inside `HORDE_PREY_MS` so nothing lapses
  // out from under the reading.
  for (let i = 0; i < 240; i++) {
    /*
     * **The crowd is pinned where it was staged, and that is not papering over
     * anything.** The claim under test is what one horde tells another about a
     * group; left to themselves these nine see twenty zombies at three hundred
     * pixels and bolt in nine directions, and within a couple of seconds no
     * point on the map has seven of them within `HORDE_CROWD_RADIUS`. Measured
     * that way the rig was asking whether a crowd *stays* a crowd while being
     * walked at, which is a question about flight and has a perfectly good
     * answer of "no" — it failed 2 stagings in 8 with the near horde reading
     * the group as four by the time it was counted.
     *
     * Live, the relay fires off the first sighting, which is inside a second of
     * the crowd being seen and long before it has scattered. A crowd that *has*
     * scattered is not a crowd, and one horde is the right answer for it.
     */
    for (const p of pinned) {
      p.e.x = p.x;
      p.e.y = p.y;
      p.e.health = p.e.maxHealth;
      world.grapples.delete(p.e.id);
      world.pendingInfections.delete(p.e.id);
    }
    tick(world, now, TICK_MS / 1000);
    now += TICK_MS;
    // Which horde is which is read off membership rather than off horde ids,
    // since the clustering hands those out.
    for (const [id, hid] of world.hordeOf) {
      const horde = world.hordes.get(hid);
      if (!horde || horde.preyX === null) continue;
      if (id.startsWith('a-')) {
        saw = true;
        if (firstAt < 0) {
          // The first tick on which the near horde had a sighting at all. What
          // the crowd looked like *then* is what decides the relay; a minimum
          // over the whole window says nothing about it.
          firstAt = i;
          minSeen = crowdAtSpot(world, horde.preyX, horde.preyY as number);
          const bb = liveCentre(world, 'b-');
          bDist = bb ? Math.hypot(horde.preyX - bb.x, (horde.preyY as number) - bb.y) : 0;
        }
      }
      if (id.startsWith('b-') && horde.preyRelayed) relayed = true;
    }
  }
  return { relayed, saw, minSeen, bDist, firstAt };
}

function relayRow(world: World): void {
  console.log('\n--- a crowd travels, one man does not ---');
  let oneSaw = 0;
  let oneRelayed = 0;
  let manySaw = 0;
  let manyRelayed = 0;
  let staged = 0;

  for (let r = 0; r < RUNS; r++) {
    bareCity(world);
    // Several lanes per city rather than one. This staging has to satisfy a
    // long list at once — a scout that can see the crowd, a crowd that is one
    // group, a second horde in earshot and far enough off to *be* a second
    // horde — and one attempt per city landed 2 runs in 6, which is too thin a
    // sample to read anything off. `resetWorld` is the expensive part, and
    // trying more lanes on a city already generated costs almost nothing.
    let one: RelayOut | null = null;
    let many: RelayOut | null = null;
    for (let attempt = 0; attempt < 6 && !many; attempt++) {
      const lane = chaseSpot(world, RELAY_SCOUT_LEAD, ZOMBIE_SIGHT_RADIUS * 0.6);
      if (!lane) continue;
      // Both crowd sizes on the same city and the same lane: unpaired, this
      // compares two cities rather than two crowd sizes.
      one = crowdRelay(world, lane, 1);
      many = one ? crowdRelay(world, lane, HORDE_CROWD_MIN + 2) : null;
    }
    if (!one || !many) continue;
    staged++;
    if (one.saw) oneSaw++;
    if (one.relayed) oneRelayed++;
    if (many.saw) manySaw++;
    if (many.relayed) manyRelayed++;
    if (!many.relayed) {
      console.log(
        `    (a crowd of ${HORDE_CROWD_MIN + 2} was not relayed: it looked like ${many.minSeen} ` +
          `when first seen at tick ${many.firstAt}, and the other horde was ${many.bDist | 0}px off, range ${HORDE_ALERT_RANGE})`,
      );
    }
  }

  if (staged === 0) {
    console.log('  (nothing staged on these cities; claiming nothing)');
    return;
  }
  console.log(`  ${staged} stagings each way`);
  check(oneSaw === staged, 'one survivor: the near horde sees them', `${oneSaw}/${staged}`);
  check(oneRelayed === 0, 'one survivor: and tells nobody', `${oneRelayed}/${staged} relayed`);
  check(
    manySaw === staged,
    `${HORDE_CROWD_MIN + 2} together: the near horde sees them`,
    `${manySaw}/${staged}`,
  );
  check(manyRelayed === staged, 'and the other horde is called in', `${manyRelayed}/${staged} relayed`);
}

// ------------------------------------------------------------------ the cost

function cost(world: World): void {
  console.log('\n--- what it costs ---');
  const timed = (off: boolean): number => {
    setNoHordes(off);
    const now0 = Date.now();
    bareCity(world);
    const w = world.map.width;
    const h = world.map.height;
    for (let i = 0; i < 6; i++) {
      clump(world, now0, `z${i}`, w * (0.2 + 0.3 * (i % 3)), h * (i < 3 ? 0.25 : 0.75), 40);
    }
    ageRound(world, now0);
    let now = now0;
    const ms: number[] = [];
    for (let i = 0; i < 600; i++) {
      const t0 = performance.now();
      tick(world, now, TICK_MS / 1000);
      ms.push(performance.now() - t0);
      now += TICK_MS;
    }
    setNoHordes(false);
    return med(ms);
  };
  // Alternated in one process, which is the only comparison this box supports.
  const a = timed(true);
  const b = timed(false);
  const c = timed(true);
  const d = timed(false);
  console.log(
    `  240 zombies and nothing else alive — the worst case, every one of them marching:`,
  );
  console.log(`    OLD ${f1(a)} / ${f1(c)}ms   NEW ${f1(b)} / ${f1(d)}ms`);
  console.log(
    '    (read the live round below instead for a figure that means anything: here the' +
      ' baseline is 240 bodies doing almost nothing in an empty city)',
  );
}

// ---------------------------------------------------------------- the ceiling

/**
 * No horde past `HORDE_MAX_SIZE`, however many zombies are standing together.
 *
 * Reported off a late round with ~500 of 628 zombies in one red smear. Staged
 * the obvious way: three times a horde's worth of zombies in one clump, which
 * with no ceiling is exactly one horde of all of them. And the merge half of the
 * same fault: two groups whose sum is over the line, standing on each other,
 * must stay two — against `mergeRow`'s control, where a pair that fits does
 * merge.
 */
function capRow(world: World): void {
  console.log('\n--- no horde past the ceiling ---');
  const BIG = HORDE_MAX_SIZE * 3;
  const oldBiggest: number[] = [];
  const newBiggest: number[] = [];
  const newCount: number[] = [];
  let twoFull = 0;
  let staged = 0;

  for (let r = 0; r < RUNS; r++) {
    bareCity(world);
    const lane = chaseSpot(world, 0, 0);
    if (!lane) continue;
    staged++;

    for (const off of [true, false]) {
      setHordesUncapped(off);
      const now0 = Date.now();
      clearBodies(world);
      clump(world, now0, 'z', lane.x, lane.y, BIG, 23);
      ageRound(world, now0);
      let now = now0;
      // Several horde ticks, so a split has had time to settle into its halves.
      for (let i = 0; i < 90; i++) {
        tick(world, now, TICK_MS / 1000);
        now += TICK_MS;
      }
      const sizes = [...world.hordes.values()].map((h) => h.size);
      const biggest = sizes.length ? Math.max(...sizes) : 0;
      if (off) oldBiggest.push(biggest);
      else {
        newBiggest.push(biggest);
        newCount.push(sizes.length);
      }
    }
    setHordesUncapped(false);

    // Two groups of thirty on top of each other: sixty will not fit in one.
    const now0 = Date.now();
    clearBodies(world);
    clump(world, now0, 'a', lane.x, lane.y, 30, 23);
    clump(world, now0, 'b', lane.x + lane.dx * 200, lane.y + lane.dy * 200, 30, 23);
    ageRound(world, now0);
    let now = now0;
    for (let i = 0; i < 60; i++) {
      tick(world, now, TICK_MS / 1000);
      now += TICK_MS;
    }
    if (world.hordes.size >= 2 && [...world.hordes.values()].every((h) => h.size <= HORDE_MAX_SIZE)) twoFull++;
  }
  setHordesUncapped(false);

  if (staged === 0) {
    console.log('  (nothing staged on these cities; claiming nothing)');
    return;
  }
  console.log(
    `  ${BIG} zombies in one clump: biggest horde OLD ${med(oldBiggest)}, ` +
      `NEW ${med(newBiggest)} across ${med(newCount)} hordes`,
  );
  check(med(oldBiggest) > HORDE_MAX_SIZE, 'CONTROL: uncapped, it is all one horde', `${med(oldBiggest)}`);
  check(
    Math.max(...newBiggest) <= HORDE_MAX_SIZE,
    `capped, no horde past ${HORDE_MAX_SIZE}`,
    `biggest ${Math.max(...newBiggest)}`,
  );
  check(med(newCount) >= 3, 'and the rest split off into hordes of their own', `${med(newCount)} hordes`);
  check(twoFull === staged, 'two groups of thirty on each other stay two', `${twoFull}/${staged}`);
}

// ------------------------------------------------------------- the stall

/**
 * A horde that cannot get anywhere gives its end up, and not before it has
 * had `HORDE_STALL_MS` to try.
 *
 * The screenshot this came off was a horde wedged into ground it could not fit,
 * churning there — and `HORDE_LEG_GIVE_UP_MS` would have held it for two and a
 * half minutes. Staged by pinning every member where it stands, which is the
 * cleanest "makes no progress" there is: the horde is given a far end, and
 * nothing it does can bring it closer. Both halves are needed — "it picked a new
 * end" is satisfied just as well by a horde that re-picks every tick.
 */
function stallRow(world: World): void {
  console.log('\n--- a horde that cannot get there picks somewhere else ---');
  let early = 0;
  let late = 0;
  let staged = 0;
  for (let r = 0; r < Math.min(RUNS, 4); r++) {
    bareCity(world);
    const lane = chaseSpot(world, 0, 0);
    if (!lane) continue;
    const now0 = Date.now();
    clearBodies(world);
    const bodies = clump(world, now0, 'z', lane.x, lane.y, 20, 23);
    const pins = bodies.map((b) => ({ b, x: b.x, y: b.y }));
    ageRound(world, now0);
    let now = now0;
    tick(world, now, TICK_MS / 1000);
    now += TICK_MS;
    if (world.hordes.size !== 1) continue;
    staged++;
    const horde = [...world.hordes.values()][0];
    const startDest = { x: horde.destX, y: horde.destY };
    const startAt = now;
    let changedAt = -1;
    for (let i = 0; i < 900 && changedAt < 0; i++) {
      for (const p of pins) {
        p.b.x = p.x;
        p.b.y = p.y;
      }
      tick(world, now, TICK_MS / 1000);
      now += TICK_MS;
      const h = world.hordes.get(horde.id);
      if (!h) break;
      if (h.destX !== startDest.x || h.destY !== startDest.y) changedAt = now - startAt;
    }
    if (changedAt >= 0 && changedAt < HORDE_STALL_MS - 1000) early++;
    if (changedAt >= HORDE_STALL_MS - 1000 && changedAt <= HORDE_STALL_MS + 2000) late++;
    console.log(`    city ${r}: gave the end up after ${changedAt < 0 ? 'never' : f1(changedAt / 1000) + 's'}`);
  }
  if (staged === 0) {
    console.log('  (nothing staged on these cities; claiming nothing)');
    return;
  }
  check(early === 0, 'not before the stall clock', `${early}/${staged} gave up early`);
  check(late === staged, `and at it, around ${HORDE_STALL_MS / 1000}s`, `${late}/${staged}`);
}

// ----------------------------------------------------------- the formation

/**
 * Every member has a spot of its own, and a horde that has got where it is
 * going stands there rather than churning.
 *
 * Reported as *"the zombies are spacing out and phasing through each other
 * trying to get to the rally point once most of them reach it"*. The rig holds
 * a horde on one spot — `setHordesHoldTheirEnd`, since in play arriving is
 * precisely what sends it somewhere else — and watches the last eight seconds of
 * a twenty-five second run, once everybody has had time to get there.
 *
 * Three readings, and the first is the report: **how fast bodies are still
 * moving** once they have arrived, which is the jiggle; **how many pairs are
 * standing in each other**, which is the phasing; and **how many distinct
 * places the members were told to go**, which is the cause. The one-point gate
 * is the control for all three.
 */
function formationRow(world: World): void {
  console.log('\n--- a spot each, and they settle on it ---');
  const N = 40;
  const out = { old: { speed: [] as number[], overlap: [] as number[], goals: [] as number[], off: [] as number[] },
    now: { speed: [] as number[], overlap: [] as number[], goals: [] as number[], off: [] as number[] } };
  let staged = 0;

  for (let r = 0; r < RUNS; r++) {
    bareCity(world);
    // Room for the whole formation to stand: a 40-slot spiral is ~140px across
    // its radius, and the clump starts 250px off the spot so it has to walk in.
    let spot: { x: number; y: number } | null = null;
    for (let i = 0; i < 6000 && !spot; i++) {
      const x = 500 + Math.random() * (world.map.width - 1000);
      const y = 500 + Math.random() * (world.map.height - 1000);
      if (clearDisc(world, x, y, 190) && clearDisc(world, x - 250, y, 110)) spot = { x, y };
    }
    if (!spot) continue;
    staged++;

    for (const one of [true, false]) {
      setHordeOneRallyPoint(one);
      setHordesHoldTheirEnd(true);
      const now0 = Date.now();
      clearBodies(world);
      const bodies = clump(world, now0, 'z', spot.x - 250, spot.y, N, 23);
      ageRound(world, now0);
      let now = now0;
      tick(world, now, TICK_MS / 1000);
      now += TICK_MS;
      if (world.hordes.size !== 1) continue;
      const horde = [...world.hordes.values()][0];
      horde.destX = spot.x;
      horde.destY = spot.y;
      horde.aimX = spot.x;
      horde.aimY = spot.y;
      horde.legUntil = now + 1e9;
      // Make the next horde tick come at once, so the goals are written round
      // the spot rather than round wherever the first tick sent them.
      world.nextHordeTick = 0;

      const prev = new Map<string, { x: number; y: number }>();
      const speeds: number[] = [];
      let overlapTicks = 0;
      let overlapPairs = 0;
      const TICKS = 750;
      for (let i = 0; i < TICKS; i++) {
        tick(world, now, TICK_MS / 1000);
        now += TICK_MS;
        if (i < TICKS - 240) {
          for (const b of bodies) prev.set(b.id, { x: b.x, y: b.y });
          continue;
        }
        const live = bodies.filter((b) => world.entities.has(b.id));
        for (const b of live) {
          const p = prev.get(b.id);
          if (p) speeds.push(Math.hypot(b.x - p.x, b.y - p.y) / (TICK_MS / 1000));
          prev.set(b.id, { x: b.x, y: b.y });
        }
        let pairs = 0;
        for (let a = 0; a < live.length; a++) {
          for (let c = a + 1; c < live.length; c++) {
            if (Math.hypot(live[a].x - live[c].x, live[a].y - live[c].y) < ZOMBIE_RADIUS * 2 - 4) pairs++;
          }
        }
        overlapPairs += pairs;
        overlapTicks++;
      }
      // What each member was told to go to, in the new mode; in the old one it
      // is the aim for every one of them, which is the whole of the fault.
      const goals = new Set<string>();
      for (const b of bodies) {
        const st = world.ai.get(b.id);
        if (!st) continue;
        const gx = one || st.hordeGoalX === null ? horde.aimX : st.hordeGoalX;
        const gy = one || st.hordeGoalY === null ? horde.aimY : st.hordeGoalY;
        goals.add(`${Math.round(gx)},${Math.round(gy)}`);
      }
      const c = centreOf(bodies.filter((b) => world.entities.has(b.id)));
      const bucket = one ? out.old : out.now;
      // p90 rather than the median, and that is the reading rather than a
      // preference: a pile is wedged solid in the middle and churning at the rim,
      // so its median body is standing still and its jiggle is all in the tail.
      // Measured as a median the old pile read 1.1 px/s, which is not what a
      // screen of zombies shoving at one point looks like.
      const sorted = speeds.slice().sort((a, b) => a - b);
      bucket.speed.push(sorted.length ? sorted[Math.floor(sorted.length * 0.9)] : 0);
      bucket.overlap.push(overlapPairs / Math.max(1, overlapTicks));
      bucket.goals.push(goals.size);
      bucket.off.push(Math.hypot(c.x - spot.x, c.y - spot.y));
    }
  }
  setHordeOneRallyPoint(false);
  setHordesHoldTheirEnd(false);

  if (staged === 0 || out.now.speed.length === 0 || out.old.speed.length === 0) {
    console.log('  (nothing staged on these cities; claiming nothing)');
    return;
  }
  console.log(`  ${staged} cities, ${N} zombies held on a spot, last 8s of 25s:`);
  console.log(
    `    body speed, p90      OLD ${f1(med(out.old.speed))} px/s   NEW ${f1(med(out.now.speed))} px/s`,
  );
  console.log(
    `    pairs overlapping    OLD ${f1(med(out.old.overlap))}   NEW ${f1(med(out.now.overlap))}  (per tick)`,
  );
  console.log(`    places told to go    OLD ${med(out.old.goals)}   NEW ${med(out.now.goals)}  of ${N}`);
  console.log(
    `    centre off the spot  OLD ${f1(med(out.old.off))}px   NEW ${f1(med(out.now.off))}px`,
  );
  check(med(out.old.goals) === 1, 'CONTROL: one point, every member told the same place', `${med(out.old.goals)}`);
  check(med(out.now.goals) >= N * 0.9, 'every member told a place of its own', `${med(out.now.goals)} of ${N}`);
  check(
    med(out.now.speed) < med(out.old.speed) * 0.5,
    'they settle rather than churn',
    `${f1(med(out.old.speed))} -> ${f1(med(out.now.speed))} px/s`,
  );
  check(
    med(out.now.overlap) < med(out.old.overlap),
    'and stop standing in each other',
    `${f1(med(out.old.overlap))} -> ${f1(med(out.now.overlap))} pairs a tick`,
  );
  check(med(out.now.off) < 80, 'and the formation is still where the horde was going', `${f1(med(out.now.off))}px`);
}

// ---------------------------------------------------------- in a real round

/**
 * The staged rows above all hand the clustering neat clumps, which is exactly
 * what it wants and tells you nothing about whether it gets them.
 *
 * So: a real city, a real outbreak, ticked until there is a horde's worth of
 * zombies in it, and then the two questions that only a live round can answer —
 * **do several large groups actually form out of however the outbreak happened
 * to spread**, and what does the march cost when it is competing with four
 * hundred other bodies for the path budget.
 *
 * The cost is alternated in one process on the same evolving world, which is
 * the only comparison this box supports — see the note in CLAUDE.md about two
 * `npx tsx` invocations reading 1.97ms and 4.37ms for identical code.
 */
function liveRound(world: World): void {
  console.log('\n--- a real round ---');
  const now0 = Date.now();
  resetWorld(world);
  world.pathBudget = PATH_NODE_BUDGET_PER_TICK;

  // Let the outbreak actually get going. 150s of simulated time, with the horde
  // clock held where it is so nothing forms while it does.
  let now = now0;
  for (let i = 0; i < 4500; i++) {
    tick(world, now, TICK_MS / 1000);
    now += TICK_MS;
  }
  let zombies = 0;
  for (const e of world.entities.values()) if (e.type === 'zombie') zombies++;
  console.log(`  150s in: ${world.entities.size} entities, ${zombies} zombies, ${world.survivorCount} survivors`);
  check(world.hordes.size === 0, 'still no hordes 150s in', `${world.hordes.size}`);

  /*
   * **An outbreak that never took hold is the city winning, not the rig
   * failing.** The map is not seeded and the garrison is spread evenly across
   * it, so some rounds simply put the first five down: measured, one run in
   * several comes back with `522 entities, 0 zombies, 522 survivors` at 150s.
   * There is no horde to form out of nothing, and every row below would read as
   * a failure of the clustering when what it is reporting is the round.
   */
  if (zombies < HORDE_MIN_SIZE * 2) {
    console.log(
      `  (the outbreak was put down on this city — ${zombies} zombies at 150s. ` +
        'Nothing to form a horde out of; claiming nothing. Run it again.)',
    );
    return;
  }

  // Past the mark. A few seconds for the clustering to settle.
  ageRound(world, now);
  for (let i = 0; i < 120; i++) {
    tick(world, now, TICK_MS / 1000);
    now += TICK_MS;
  }

  zombies = 0;
  for (const e of world.entities.values()) if (e.type === 'zombie') zombies++;
  const sizes = [...world.hordes.values()].map((h) => h.size).sort((a, b) => b - a);
  const inAHorde = world.hordeOf.size;
  console.log(
    `  hordes: ${world.hordes.size}, sizes ${sizes.join('/')} — ` +
      `${inAHorde} of ${zombies} zombies in one (${((inAHorde / Math.max(1, zombies)) * 100) | 0}%)`,
  );
  check(world.hordes.size >= 2, 'several groups form out of a real outbreak', `${world.hordes.size}`);
  check(
    inAHorde >= zombies * 0.5,
    'and most of the horde is in one',
    `${((inAHorde / Math.max(1, zombies)) * 100) | 0}%`,
  );
  check(
    sizes.every((s) => s >= HORDE_MIN_SIZE),
    'every one of them a group',
    `smallest ${sizes[sizes.length - 1] ?? 0}`,
  );

  // What it costs, alternated on the one evolving world.
  const window = (off: boolean): number => {
    setNoHordes(off);
    const ms: number[] = [];
    for (let i = 0; i < 300; i++) {
      const t0 = performance.now();
      tick(world, now, TICK_MS / 1000);
      ms.push(performance.now() - t0);
      now += TICK_MS;
    }
    setNoHordes(false);
    return med(ms);
  };
  // Several windows rather than one pair, all of them printed, and all three
  // arrangements interleaved.
  //
  // A live round is still evolving under the measurement — survivors falling,
  // zombies rising — so a single pair of windows is dominated by which of them
  // happened to run later. Two windows read OLD 8.0/9.0 against NEW 9.8/6.6 on
  // working code, which says nothing in either direction; and the far-end and
  // waypoint arrangements cannot be compared between two invocations at all,
  // the map not being seeded.
  const off: number[] = [];
  const way: number[] = [];
  const pt: number[] = [];
  const end: number[] = [];
  for (let i = 0; i < 3; i++) {
    off.push(window(true));
    setHordeAimsAtTheEnd(false);
    way.push(window(false));
    // The one-point arm is the control for the formation's own cost: every
    // member's slot goal is worked out at 2Hz, against a straight-line test,
    // and that has to be shown to be affordable rather than assumed.
    setHordeOneRallyPoint(true);
    pt.push(window(false));
    setHordeOneRallyPoint(false);
    setHordeAimsAtTheEnd(true);
    end.push(window(false));
    setHordeAimsAtTheEnd(false);
  }
  let left = 0;
  for (const e of world.entities.values()) if (e.type === 'zombie') left++;
  console.log(`  no hordes                : ${off.map(f1).join(' / ')}ms   median ${f1(med(off))}`);
  console.log(`  hordes, a slot each      : ${way.map(f1).join(' / ')}ms   median ${f1(med(way))}`);
  console.log(`  hordes, one rally point  : ${pt.map(f1).join(' / ')}ms   median ${f1(med(pt))}`);
  console.log(`  hordes, the far end      : ${end.map(f1).join(' / ')}ms   median ${f1(med(end))}`);
  console.log(
    `  (${world.entities.size} entities, ${left} zombies, ${world.hordes.size} hordes, ` +
      `${world.hordeOf.size} marching)`,
  );

  // The horde tick itself, forced and timed on its own. It only runs every
  // fifteenth tick, so a tick median averages it away — and a spike every half
  // second is exactly the cost a median cannot see.
  const hordeTick: number[] = [];
  for (let i = 0; i < 20; i++) {
    world.nextHordeTick = 0;
    const t0 = performance.now();
    updateHordes(world, now);
    hordeTick.push(performance.now() - t0);
    now += TICK_MS;
  }
  console.log(
    `  the horde tick alone, ${world.hordeOf.size} members: median ${f1(med(hordeTick))}ms, ` +
      `worst ${f1(Math.max(...hordeTick))}ms`,
  );
  check(
    med(way) <= med(end),
    'the rolling waypoint is no dearer than walking at the far end',
    `${f1(med(way))}ms against ${f1(med(end))}ms`,
  );
  let tallest = 0;
  for (const h of world.hordes.values()) tallest = Math.max(tallest, h.size);
  check(tallest <= HORDE_MAX_SIZE, 'and after all that, no horde past the ceiling', `biggest ${tallest}`);
}

// ------------------------------------------------------------------ the run

const world = createWorld();
console.log(
  `hordecheck: ${RUNS} runs, city ${world.map.width}x${world.map.height}, ` +
    `form at ${HORDE_FORM_AT_MS / 1000}s, join radius ${HORDE_JOIN_RADIUS}`,
);
setNoHordes(false);
beforeAndAfter(world);
formAndBounce(world);
mergeRow(world);
capRow(world);
stallRow(world);
formationRow(world);
chaseRow(world);
relayRow(world);
cost(world);
liveRound(world);

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures > 0) console.log(`${failures} FAILED`);
process.exit(failures > 0 ? 1 : 0);
