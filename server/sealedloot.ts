/**
 * Headless check on a report about bot officers and the pocket gunner:
 *
 *   *"bot officers are getting stuck on the deployed pocket machine gunner
 *   utility. They will walk up to it, get stuck, move backwards and then walk
 *   directly forward again and will loop this behavior indefinitely"* — and, a
 *   moment later, *"they are trying to get in the house but don't realise it is
 *   not possible."*
 *
 * No socket, no port, so it leaves a game on 8080 alone.
 *   npx tsx sealedloot.ts
 *   RUNS=10 npx tsx sealedloot.ts
 *
 * **The second half of the report is the whole of the fault.** Routing round a
 * wall of sandbags has worked since `headingToward` learned about the
 * destructible layer. What had no answer anywhere was a goal with no way round
 * at all: `findPath` hands back its best partial, which ends against the bags;
 * collision pushes the body back out; `unstickTick` sees no progress and
 * commits a breakout heading scored *against* the one that just failed — the
 * step backwards — and when that expires the errand is still set, so round it
 * goes. `unstickTick` clears the route and never the goal, so nothing in the
 * loop could conclude anything.
 *
 * `setBotsIgnoreSealedGoals` is the gate and it is **kept**: "it walked away
 * and did something else" is satisfied just as well by a bot that has stopped
 * looting altogether, so the control is the whole value of the run — and so is
 * the second scenario below, the same rifle behind the same doorway with no
 * gunner across it, which has to be fetched in both modes.
 *
 * **Both modes get the same city.** `resetWorld` generates a fresh unseeded map
 * and `populate` rolls fresh traits, so alternating run by run measures the
 * city and not the code. `withSeed` pins the map, the doors, the traits and the
 * spawn.
 *
 * **The clock has to start where the world's does**, and be read *after* the
 * staging: `resetWorld` stamps every fresh AiState with the real `Date.now()`,
 * so one `now0` taken at the top of the rig falls behind by more than a run is
 * long and the bot perceives nothing — which reads exactly like the bug under
 * test. Same trap as botkite.ts and botdoor.ts.
 *
 * Not typechecked by `npx tsc --noEmit` in `server/`, which only includes
 * `src`. Check it explicitly:
 *   npx tsc --noEmit --target ES2022 --module ESNext --moduleResolution Bundler
 *     --strict --skipLibCheck --types node sealedloot.ts
 */
import {
  createWorld,
  resetWorld,
  rebuildNav,
  rebuildEntityGrid,
  resolveCollisions,
  buildingIndexAt,
  makeEntity,
  type World,
  type Entity,
} from './src/world.js';
import { computeFrozen, updateAi, setBotsIgnoreSealedGoals } from './src/ai.js';
import {
  deployEmplacement,
  resolveEmplacementCollisions,
  updateEmplacements,
  type Emplacement,
} from './src/emplacement.js';
import { closestOnBox } from './src/geometry.js';
import {
  TICK_RATE,
  PATH_NODE_BUDGET_PER_TICK,
  SANDBAG_STANDOFF,
  PICKUP_REACH,
} from '../shared/constants.js';

const TICK_MS = 1000 / TICK_RATE;
const RUNS = Number(process.env.RUNS ?? 8);
/** 20s. The reported loop repeats about every 1.5s, so this sees a dozen of them. */
const TICKS = Number(process.env.TICKS ?? 600);
/** Where the bot starts, out in the street on the line through the doorway. */
const START_OUT = 210;
/** How far in the rifle lies. */
const BAIT_IN = 110;
/** Near enough the bags for a step toward them to be about them. */
const NEAR_WALL = 150;

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
  // The order the real tick uses: bodies out of the bags, rebuild, then work
  // the guns — which is also what pins the gunner back onto its own mount.
  resolveEmplacementCollisions(world);
  rebuildEntityGrid(world);
  updateEmplacements(world, now, dt);
}

function withSeed<T>(seed: number, fn: () => T): T {
  const real = Math.random;
  let a = seed >>> 0;
  Math.random = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  try {
    return fn();
  } finally {
    Math.random = real;
  }
}

/** One bot, an empty city, every door standing open. */
function stagedWorld(): { world: World; bot: Entity } {
  const world = createWorld();
  world.botOfficerCount = 1;
  resetWorld(world);
  const bot = world.entities.get('bot-0');
  if (!bot) throw new Error('no bot-0 — did populate change?');
  for (const id of [...world.entities.keys()]) {
    if (id === 'bot-0') continue;
    world.entities.delete(id);
    world.ai.delete(id);
  }
  world.cityOfficers.clear();
  /*
   * **Every door standing open, and that is not tidiness.** A shut or bolted
   * door is a second reason the bot cannot get in, and it is one the game
   * already has an answer for — `openDoorAhead`, measured in `botdoor.ts`.
   * Left rolled, a run would be reporting whichever of the two happened to be
   * in the way on that city.
   */
  for (const d of world.doors) {
    if (!d) continue;
    d.open = true;
    d.locked = false;
    d.playerLocked = false;
  }
  // A free slot and a known gun, so what it wants off the floor is not left to
  // whatever `giveStartingItem` rolled.
  const inv = world.inventories.get('bot-0');
  if (!inv) throw new Error('bot-0 has no inventory');
  for (let i = 0; i < inv.guns.length; i++) inv.guns[i] = null;
  inv.guns[1] = { item: 'boltRifle', ammo: 200 };
  inv.activeSlot = 1;

  rebuildEntityGrid(world);
  return { world, bot };
}

interface Spot {
  index: number;
  /** Unit normal pointing from the slab into the building. */
  nx: number;
  ny: number;
  x: number;
  y: number;
  building: number;
}

/**
 * Exterior doorways with open floor a good way in and a clear street a good way
 * out, in index order so the same city hands both modes the same list.
 *
 * Found rather than assumed — the map is not seeded, and a rig staged at a
 * fixed spot reports the city rather than the code.
 *
 * **Deliberately not filtered to buildings with only one street door.** That
 * was the first version and it selected almost nothing but landmarks, whose
 * footprints run to thirty-odd rects with ways in that are not doors at all —
 * `repairEnclosures` cuts openings and hangs nothing in them. What actually has
 * to hold is that *the rifle* is walled off, which is a question about the
 * finished geometry rather than about the door list, and `bagTheDoor` asks it
 * directly.
 */
function doorways(world: World, deep: number, out: number): Spot[] {
  const specs = world.map.doors;
  const found: Spot[] = [];
  for (let index = 0; index < specs.length; index++) {
    const spec = specs[index];
    if (spec.interior) continue;
    const runtime = world.doors[index];
    if (!runtime) continue;
    const sign = runtime.insideSign;
    if (sign === 0) continue;
    const nx = spec.horiz ? 0 : sign;
    const ny = spec.horiz ? sign : 0;

    let ok = true;
    for (let d = 30; d <= deep && ok; d += 14) {
      const ix = spec.x + nx * d;
      const iy = spec.y + ny * d;
      if (world.nav.isBlocked(ix, iy) || buildingIndexAt(world, ix, iy) !== spec.building) ok = false;
    }
    for (let d = 30; d <= out && ok; d += 14) {
      const ox = spec.x - nx * d;
      const oy = spec.y - ny * d;
      if (world.nav.isBlocked(ox, oy) || buildingIndexAt(world, ox, oy) >= 0) ok = false;
    }
    if (ok) found.push({ index, nx, ny, x: spec.x, y: spec.y, building: spec.building });
  }
  return found;
}

/**
 * Put a pocket gunner across the doorway, the way a player does.
 *
 * `deployEmplacement` stands the gunner 46px ahead of whoever deployed it and
 * lays the bags `SANDBAG_STANDOFF` ahead of *that*, so the prop goes on the
 * street side at the sum of the two, facing in. It is deleted afterwards: it is
 * a pair of hands, not part of the scene.
 *
 * **And then it has to be checked, because the gun lands where it likes.**
 * `deployEmplacement` puts the gunner through `findSpawnNear`, which is a spawn
 * *spread* rather than a nudge — 40px plus up to 70 more, on a random bearing —
 * so the bags come down anywhere in a ring round the spot they were asked for.
 * Measured over eight cities staged at a doorway: **41 to 106px off**, with the
 * wall somewhere out in the street on seven of them. Same trap `placeCityCar`
 * records for standing an officer beside a car, and here it means the rig
 * cannot assume its own staging: it deploys, asks whether the way in is
 * actually shut, and takes the wall away and goes again if it is not.
 *
 * Retried rather than skipped, so both modes measure the same cities. Null when
 * forty goes never landed one across the doorway.
 */
function bagTheDoor(
  world: World,
  spot: Spot,
  now: number,
  sealed: () => boolean,
): Emplacement | null {
  const back = 46 + SANDBAG_STANDOFF;
  for (let attempt = 0; attempt < 40; attempt++) {
    const prop = makeEntity('prop', 'officer', spot.x - spot.nx * back, spot.y - spot.ny * back);
    prop.facing = Math.atan2(spot.ny, spot.nx);
    world.entities.set('prop', prop);
    rebuildEntityGrid(world);
    const ok = deployEmplacement(world, prop, now);
    world.entities.delete('prop');
    world.ai.delete('prop');
    if (!ok) continue;
    rebuildNav(world);
    const gun = [...world.emplacements.values()][0];
    if (gun && gun.bags && sealed()) return gun;
    if (gun) {
      world.emplacements.delete(gun.id);
      world.entities.delete(gun.id);
      world.ai.delete(gun.id);
      rebuildNav(world);
    }
  }
  return null;
}

interface Out {
  /** Which doorway was staged, so the control can use the same one. */
  door: number;
  /** Ticks the sealed rifle was the errand. */
  wanted: number;
  /**
   * Ticks pressed on the bags *while the rifle was the errand*.
   *
   * Scoped to the errand deliberately. Unscoped it counts a bot brushing past
   * the wall on an ordinary patrol, which is not what was reported and moves a
   * long way run to run — it read 134 one way and 235 the other on runs of the
   * same code. What is being counted is the loop, and the loop is a body at a
   * wall *because it is trying to get past it*.
   */
  pressed: number;
  /** The same, for reversals along the line through the doorway. */
  reversals: number;
  /** It actually came away with the rifle. */
  got: boolean;
  /**
   * …and when it did, it was standing somewhere the router says is cut off from
   * where it started. That is a body that has ground its way through a gap no
   * route would ever have been drawn down, rather than a hole in the seal.
   */
  squeezed: boolean;
  /** How far from the bags it finished. */
  endGap: number;
}

function blank(door: number): Out {
  return { door, wanted: 0, pressed: 0, reversals: 0, got: false, squeezed: false, endGap: 0 };
}

/**
 * **Is the rifle genuinely out of reach from the street?**
 *
 * *Not* "is its own pixel walled off", which was the first version of this and
 * was the rig lying: `PICKUP_REACH` is 46, so a bot never has to stand on the
 * thing — it only has to get within arm's length of it. Bags landing across a
 * strip beside the rifle satisfied the narrow test and left a bot walking in
 * the front door and picking it up from the doorway of the room. Measured that
 * way: **5 of 8 came away with it** under the old behaviour, at 44px from the
 * rifle, about two seconds in — a run reporting its own staging.
 *
 * So it is the whole disc, sampled at two radii, and it is checked against a
 * full-budget A\* as well, which agreed with the components on every city.
 */
function outOfReach(world: World, ox: number, oy: number, bx: number, by: number): boolean {
  if (world.nav.isBlockedOrSoft(bx, by)) return false;
  if (!world.nav.isReachable(bx, by)) return false;
  if (world.nav.canWalkBetween(ox, oy, bx, by)) return false;
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    for (const r of [PICKUP_REACH, PICKUP_REACH * 0.55]) {
      const px = bx + Math.cos(a) * r;
      const py = by + Math.sin(a) * r;
      if (world.nav.isBlockedOrSoft(px, py)) continue;
      if (world.nav.canWalkBetween(ox, oy, px, py)) return false;
    }
  }
  return true;
}

/** Put the bot in the street on the line through the doorway, facing it. */
function place(world: World, bot: Entity, spot: Spot): void {
  bot.x = spot.x - spot.nx * START_OUT;
  bot.y = spot.y - spot.ny * START_OUT;
  bot.facing = Math.atan2(spot.ny, spot.nx);
  const state = world.ai.get('bot-0');
  if (!state) return;
  state.heading = bot.facing;
  state.lastX = bot.x;
  state.lastY = bot.y;
  state.unstickX = bot.x;
  state.unstickY = bot.y;
  state.wanderX = bot.x;
  state.wanderY = bot.y;
}

/** The rifle, `BAIT_IN` inside the doorway. */
function bait(world: World, spot: Spot): { x: number; y: number } {
  const x = spot.x + spot.nx * BAIT_IN;
  const y = spot.y + spot.ny * BAIT_IN;
  world.pickups.clear();
  world.pickups.set('bait', { id: 'bait', item: 'sniper', x, y });
  return { x, y };
}

/**
 * **A rifle in a room whose doorway a pocket gunner is standing across.**
 *
 * Nothing else alive in the city but the bot and the gunner, deliberately: a
 * live outbreak turns the run into a measurement of how far the city got.
 */
function sealedRun(seed: number): Out | null {
  const { world, bot } = withSeed(seed, stagedWorld);
  let now = Date.now();

  for (const spot of doorways(world, BAIT_IN + 30, START_OUT + 40)) {
    const inX = spot.x + spot.nx * BAIT_IN;
    const inY = spot.y + spot.ny * BAIT_IN;
    const outX = spot.x - spot.nx * START_OUT;
    const outY = spot.y - spot.ny * START_OUT;
    /*
     * The precondition, and it is the fault stated exactly: the map still says
     * that floor is reachable — `isReachable` is the hard layer and has to stay
     * that way, a wall somebody stacked this minute being no statement about
     * where a body may be spawned — while nothing alive can get to it.
     *
     * **Staging on `canWalkBetween` is not circular, and the OLD column is what
     * says so.** The gate does not touch routing, so both modes are handed the
     * identical scene, and *"came away with the rifle 0/8"* under the old
     * behaviour is the independent evidence that it really is walled off.
     */
    const gun = bagTheDoor(world, spot, now, () => outOfReach(world, outX, outY, inX, inY));
    if (!gun || !gun.bags) continue;

    place(world, bot, spot);
    bait(world, spot);

    const out = blank(spot.index);
    let lastSign = 0;
    for (let i = 0; i < TICKS; i++) {
      const wasX = bot.x;
      const wasY = bot.y;
      now += TICK_MS;
      tick(world, now, TICK_MS / 1000);

      if (world.ai.get('bot-0')?.lootId === 'bait') out.wanted++;
      if (!world.pickups.has('bait') && !out.got) {
        out.got = true;
        out.squeezed = !world.nav.canWalkBetween(outX, outY, bot.x, bot.y);
      }

      const onTheErrand = world.ai.get('bot-0')?.lootId === 'bait';
      const bags = gun.bags;
      const gap = bags ? closestOnBox(bags, bot.x, bot.y).dist : Infinity;
      if (onTheErrand && gap < bot.radius + 6) out.pressed++;

      // The reported loop, as a number: how many times it changed its mind
      // about which way along the line through the doorway it was going, while
      // near enough to the bags for that to be about them.
      if (onTheErrand && gap < NEAR_WALL) {
        const along = (bot.x - wasX) * spot.nx + (bot.y - wasY) * spot.ny;
        if (Math.abs(along) > 0.5) {
          const sign = along > 0 ? 1 : -1;
          if (lastSign !== 0 && sign !== lastSign) out.reversals++;
          lastSign = sign;
        }
      }
    }
    out.endGap = gun.bags ? closestOnBox(gun.bags, bot.x, bot.y).dist : Infinity;
    return out;
  }
  return null;
}

/**
 * **The control: the same rifle behind the same doorway, with nothing across
 * it.** Refusing a goal it cannot walk to must not become refusing goals, and
 * this is the row that says so. Handed the doorway `sealedRun` settled on, so
 * the two rows are the same geometry with and without the wall.
 */
function openRun(seed: number, door: number): Out | null {
  const { world, bot } = withSeed(seed, stagedWorld);
  const spot = doorways(world, BAIT_IN + 30, START_OUT + 40).find((s) => s.index === door);
  if (!spot) return null;

  place(world, bot, spot);
  bait(world, spot);

  const out = blank(door);
  let now = Date.now();
  for (let i = 0; i < TICKS; i++) {
    now += TICK_MS;
    tick(world, now, TICK_MS / 1000);
    if (world.ai.get('bot-0')?.lootId === 'bait') out.wanted++;
    if (!world.pickups.has('bait')) {
      out.got = true;
      break;
    }
  }
  return out;
}

/**
 * **Does the gunner's own body play any part in this?**
 *
 * Asked outright, and the honest way to answer it is to take the bags away and
 * leave the man standing there. He is the one body in the game that cannot be
 * shoved out of the way for long — `updateEmplacements` pins him back onto his
 * mount every tick — so he is worth measuring rather than waving through on the
 * general rule that bodies are not geometry. What the run has to show is that
 * he seals nothing: entities are in no nav layer at all, and collision goes
 * round.
 */
function gunnerOnlyRun(seed: number): { sealed: boolean; got: boolean } | null {
  const { world, bot } = withSeed(seed, stagedWorld);
  let now = Date.now();

  for (const spot of doorways(world, BAIT_IN + 30, START_OUT + 40)) {
    const inX = spot.x + spot.nx * BAIT_IN;
    const inY = spot.y + spot.ny * BAIT_IN;
    const outX = spot.x - spot.nx * START_OUT;
    const outY = spot.y - spot.ny * START_OUT;
    // Staged exactly as the sealed run — the bags across the doorway — and only
    // then taken away, so what is left is a gunner standing in a way in that
    // was shut a moment ago, being asked whether he shuts it himself.
    const gun = bagTheDoor(world, spot, now, () => outOfReach(world, outX, outY, inX, inY));
    if (!gun) continue;
    gun.bags = null;
    rebuildNav(world);
    const sealed = !world.nav.canWalkBetween(outX, outY, inX, inY);

    place(world, bot, spot);
    bait(world, spot);

    let got = false;
    for (let i = 0; i < TICKS; i++) {
      now += TICK_MS;
      tick(world, now, TICK_MS / 1000);
      if (!world.pickups.has('bait')) {
        got = true;
        break;
      }
    }
    return { sealed, got };
  }
  return null;
}

function report(label: string, rows: Out[]): void {
  if (rows.length === 0) {
    console.log(`  ${label}  (nothing staged)`);
    return;
  }
  console.log(
    `  ${label}  came away with it ${rows.filter((r) => r.got).length}/${rows.length}` +
      `   of which by squeezing ${rows.filter((r) => r.squeezed).length}` +
      `   ticks walking at it ${rows.reduce((a, r) => a + r.wanted, 0)}` +
      `   ticks pressed on the bags ${rows.reduce((a, r) => a + r.pressed, 0)}` +
      `   reversals at the wall ${rows.reduce((a, r) => a + r.reversals, 0)}` +
      `   median end gap ${f1(med(rows.map((r) => r.endGap)))}px`,
  );
}

const sealed: Record<string, Out[]> = { OLD: [], NEW: [] };
const open: Record<string, Out[]> = { OLD: [], NEW: [] };
const gunnerOnly: { sealed: boolean; got: boolean }[] = [];
let skipped = 0;

for (let run = 0; run < RUNS; run++) {
  const seed = 4100 + run;
  const staged: Record<string, Out | null> = { OLD: null, NEW: null };
  for (const mode of ['OLD', 'NEW'] as const) {
    setBotsIgnoreSealedGoals(mode === 'OLD');
    staged[mode] = sealedRun(seed);
  }
  setBotsIgnoreSealedGoals(false);

  // `bagTheDoor` is gate-independent, so both modes settle on the same doorway;
  // taking it from either is what lets the control run on the same geometry.
  const door = staged.OLD?.door ?? staged.NEW?.door ?? null;
  if (staged.OLD && staged.NEW && door !== null) {
    sealed.OLD.push(staged.OLD);
    sealed.NEW.push(staged.NEW);
    for (const mode of ['OLD', 'NEW'] as const) {
      setBotsIgnoreSealedGoals(mode === 'OLD');
      const b = openRun(seed, door);
      if (b) open[mode].push(b);
    }
    setBotsIgnoreSealedGoals(false);
  } else {
    skipped++;
  }

  const c = gunnerOnlyRun(seed);
  if (c) gunnerOnly.push(c);
}
setBotsIgnoreSealedGoals(false);

console.log(`
a rifle behind a doorway a pocket gunner is standing across  (${RUNS} cities each)`);
report('OLD', sealed.OLD);
report('NEW', sealed.NEW);

const took = (rows: Out[]): number => rows.filter((r) => r.got).length;
console.log(`
the same rifle and the same doorway, nothing across it — the control`);
console.log(`  OLD  came away with it ${took(open.OLD)}/${open.OLD.length}`);
console.log(`  NEW  came away with it ${took(open.NEW)}/${open.NEW.length}`);

console.log(`
the gunner's body with the bags torn down off it`);
console.log(
  `  sealed the doorway ${gunnerOnly.filter((r) => r.sealed).length}/${gunnerOnly.length}` +
    `   came away with the rifle ${gunnerOnly.filter((r) => r.got).length}/${gunnerOnly.length}`,
);

console.log('');
const oldRows = sealed.OLD;
const newRows = sealed.NEW;
const oldWanted = oldRows.reduce((a, r) => a + r.wanted, 0);
const newWanted = newRows.reduce((a, r) => a + r.wanted, 0);
const oldPressed = oldRows.reduce((a, r) => a + r.pressed, 0);
const newPressed = newRows.reduce((a, r) => a + r.pressed, 0);
const oldRev = oldRows.reduce((a, r) => a + r.reversals, 0);
const newRev = newRows.reduce((a, r) => a + r.reversals, 0);

check(newRows.length >= 6, 'enough cities staged', `${newRows.length}`);
check(
  oldRows.length > 0 &&
    oldRows.every((r) => !r.got || r.squeezed) &&
    newRows.every((r) => !r.got || r.squeezed),
  'the rifle really is walled off — every pickup was a squeeze, never a route',
  `${took(oldRows)} / ${took(newRows)} taken, all by squeezing`,
);
check(
  newWanted * 4 < oldWanted,
  'ticks spent walking at a rifle it cannot reach',
  `${oldWanted} -> ${newWanted}`,
);
check(newPressed * 4 < oldPressed, 'ticks pressed on the bags', `${oldPressed} -> ${newPressed}`);
check(
  newRev * 4 < oldRev,
  'reversals at the wall — the reported loop, counted',
  `${oldRev} -> ${newRev}`,
);
check(
  took(open.NEW) >= took(open.OLD) && took(open.NEW) === open.NEW.length && open.NEW.length > 0,
  'the control: the same rifle through an open doorway is still fetched',
  `${took(open.OLD)}/${open.OLD.length} -> ${took(open.NEW)}/${open.NEW.length}`,
);
check(
  gunnerOnly.length > 0 && gunnerOnly.every((r) => !r.sealed),
  'the gunner alone seals nothing',
  `${gunnerOnly.filter((r) => r.sealed).length}/${gunnerOnly.length} sealed`,
);

if (skipped > 0) {
  console.log(`
(${skipped} cities skipped: no doorway with room either side that the bags would land across)`);
}
console.log(`
${checks - failures}/${checks} checks passed${failures > 0 ? `, ${failures} FAILED` : ''}`);
