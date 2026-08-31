/**
 * Headless check on the spectator's RTS: doors under a command, and a run of
 * sandbag orders. No socket, no port, so it leaves a game on 8080 alone.
 *
 * Three claims, and two of them have a control:
 *
 *  1. **A commanded grey officer works the door in its way.** The city's own
 *     officers never called `doorTick` at all, so an order across a threshold
 *     ended with a body pressed against the front of a house.
 *     `setOfficersIgnoreDoors` is that behaviour put back, and the control is
 *     the whole value of the run — "it got inside" means nothing without "and
 *     it did not before".
 *  2. **A second sandbag order goes to a second officer.** A bag is only spent
 *     when the wall goes up, so the man already walking to a spot still read as
 *     the nearest holder and took the new order in place of his old one: a run
 *     of clicks could only ever produce one wall.
 *  3. **The pending order is on the wire for the whole errand**, which is what
 *     the ghost is drawn from, and it comes off it when the wall goes up.
 *  4. **A single right-click does not take a man off a wall**, and a double one
 *     does. A stray click used to throw a several-second errand away with
 *     nothing said, and everybody else in the selection has to move on the
 *     first click either way or the exemption becomes a stuck group.
 *
 * Both door modes run in ONE process, on the same city and the same door — two
 * `npx tsx` invocations on this box are not comparable and the map is not
 * seeded either.
 *
 * **The clock has to start where the world's does.** `resetWorld` takes no
 * `now` and stamps every fresh AiState with `Date.now()`, so a harness starting
 * its own clock at 10000 leaves `nextSenseAt` decades away and nothing ever
 * perceives anything. It reads as an officer standing about doing nothing,
 * which is indistinguishable from the bug under test.
 *
 *   npx tsx rtscheck.ts
 *   RUNS=8 npx tsx rtscheck.ts
 *
 * Not typechecked by `npx tsc --noEmit` in `server/` — that only includes
 * `src/**`. Check it explicitly:
 *   npx tsc --noEmit --target ES2022 --module ESNext --moduleResolution Bundler \
 *     --strict --skipLibCheck --types node rtscheck.ts
 */
import {
  createWorld,
  resetWorld,
  rebuildNav,
  rebuildEntityGrid,
  resolveCollisions,
  buildingIndexAt,
  makeEntity,
  newAiState,
  type World,
  type Entity,
} from './src/world.js';
import { computeFrozen, updateAi, setOfficersIgnoreDoors } from './src/ai.js';
import { isDoorShut, openDoor, shutDoor, unlockDoor, lockDoor } from './src/doors.js';
import { buildSitesToWire } from './src/emplacement.js';
import { world as engineWorld, handle } from './src/engine.js';
import { TICK_RATE, PATH_NODE_BUDGET_PER_TICK } from '../shared/constants.js';

const TICK_MS = 1000 / TICK_RATE;
const RUNS = Number(process.env.RUNS ?? 6);
/** 20s — comfortably longer than a walk of a couple of hundred pixels. */
const DOOR_TICKS = Number(process.env.DOOR_TICKS ?? 600);

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
 * A city with nothing alive in it but the officers we put there ourselves.
 *
 * Stripped for the reason `complexcheck.ts` strips it: a live outbreak turns
 * the run into a measurement of how far the city got rather than of whether an
 * order can be carried out. The officers are built by hand — unlike a bot, a
 * grey officer needs no inventory and no stamina, only membership of
 * `world.cityOfficers`, which is what `officerGrade` reads.
 */
function bareCity(world: World): void {
  resetWorld(world);
  for (const id of [...world.entities.keys()]) {
    world.entities.delete(id);
    world.ai.delete(id);
  }
  world.cityOfficers.clear();
  world.bots.clear();
  world.barricades.clear();
  rebuildEntityGrid(world);
}

function addOfficer(world: World, id: string, x: number, y: number, now: number): Entity {
  const e = makeEntity(id, 'officer', x, y);
  world.entities.set(id, e);
  world.ai.set(id, newAiState(now, x, y));
  world.cityOfficers.add(id);
  return e;
}

// ------------------------------------------------------------------ doors

interface DoorStage {
  index: number;
  /** Where the officer starts: out in the street, a step off the slab. */
  fromX: number;
  fromY: number;
  /** Where he is sent: inside the building, a step past the slab. */
  toX: number;
  toY: number;
  building: number;
}

/**
 * A street door with open ground on the outside and a room on the inside.
 *
 * Staged rather than assumed, and the precondition is checked rather than hoped
 * for: an exterior door whose two faces do not come back as one outdoors and
 * one indoors is not the situation being measured, and a rig that measured it
 * anyway would be reporting the city.
 */
function stageDoor(world: World): DoorStage | null {
  const order = world.map.doors.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  for (const index of order) {
    const spec = world.map.doors[index];
    if (spec.interior) continue;
    const reach = 46;
    const dx = spec.horiz ? 0 : 1;
    const dy = spec.horiz ? 1 : 0;
    const aX = spec.x + dx * reach;
    const aY = spec.y + dy * reach;
    const bX = spec.x - dx * reach;
    const bY = spec.y - dy * reach;
    const aIn = buildingIndexAt(world, aX, aY);
    const bIn = buildingIndexAt(world, bX, bY);
    let inX: number;
    let inY: number;
    let outX: number;
    let outY: number;
    if (aIn === spec.building && bIn < 0) {
      inX = aX;
      inY = aY;
      outX = bX;
      outY = bY;
    } else if (bIn === spec.building && aIn < 0) {
      inX = bX;
      inY = bY;
      outX = aX;
      outY = aY;
    } else continue;
    // Both ends have to be ground a body can stand on, or the officer is being
    // sent somewhere nobody could go and the run says nothing either way.
    if (world.nav.isBlocked(inX, inY) || world.nav.isBlocked(outX, outY)) continue;
    // And he has to start out in the street with room to walk, not wedged in an
    // alcove where the whole run measures the corner rather than the door.
    const stepX = outX + (outX - spec.x) * 1.4;
    const stepY = outY + (outY - spec.y) * 1.4;
    if (world.nav.isBlocked(stepX, stepY)) continue;
    return { index, fromX: stepX, fromY: stepY, toX: inX, toY: inY, building: spec.building };
  }
  return null;
}

interface DoorRun {
  /** The door came open at some point in the run. */
  opened: boolean;
  /** He ended up inside the building he was sent into. */
  inside: boolean;
  /** Closest he ever got to the spot he was sent to. */
  closest: number;
  /** Seconds to get inside, or -1. */
  secs: number;
}

function doorRun(world: World, stage: DoorStage, locked: boolean): DoorRun {
  const now1 = Date.now();
  const e = addOfficer(world, 'grey-door', stage.fromX, stage.fromY, now1);
  const st = world.ai.get('grey-door')!;
  // Face the door, so the very first `doorInTheWay` probe is honest rather than
  // pointing at wherever a fresh AiState happened to be looking.
  st.heading = Math.atan2(stage.toY - e.y, stage.toX - e.x);
  e.facing = st.heading;
  // The spectator's order, written exactly as `commandOfficers` writes it.
  st.commandX = stage.toX;
  st.commandY = stage.toY;

  shutDoor(world, stage.index, now1);
  if (locked) lockDoor(world, stage.index);
  else unlockDoor(world, stage.index);

  const out: DoorRun = { opened: false, inside: false, closest: Infinity, secs: -1 };
  let now = now1;
  for (let i = 0; i < DOOR_TICKS; i++) {
    tick(world, now, TICK_MS / 1000);
    now += TICK_MS;
    if (!isDoorShut(world, stage.index)) out.opened = true;
    out.closest = Math.min(out.closest, Math.hypot(e.x - stage.toX, e.y - stage.toY));
    if (buildingIndexAt(world, e.x, e.y) === stage.building) {
      out.inside = true;
      if (out.secs < 0) out.secs = ((i + 1) * TICK_MS) / 1000;
    }
  }
  world.entities.delete('grey-door');
  world.ai.delete('grey-door');
  world.cityOfficers.delete('grey-door');
  return out;
}

interface DoorTally {
  opened: number;
  inside: number;
  n: number;
  secs: number[];
  closest: number[];
}

function doorSuite(): void {
  console.log('\n=== an order across a threshold ===');
  const modes: Array<{ label: string; ignore: boolean }> = [
    { label: 'OLD (no doors)', ignore: true },
    { label: 'NEW', ignore: false },
  ];
  const tally = new Map<string, DoorTally>();
  for (const m of modes) tally.set(m.label, { opened: 0, inside: 0, n: 0, secs: [], closest: [] });

  const bolted = { opened: 0, inside: 0, n: 0 };
  let staged = 0;

  for (let run = 0; run < RUNS; run++) {
    const world = createWorld();
    bareCity(world);
    const stage = stageDoor(world);
    if (!stage) continue;
    staged++;
    // Same city, same door, same start — the door is put back shut at the top
    // of each run, so both modes see the identical situation.
    for (const m of modes) {
      setOfficersIgnoreDoors(m.ignore);
      openDoor(world, stage.index);
      const r = doorRun(world, stage, false);
      const t = tally.get(m.label)!;
      t.n++;
      if (r.opened) t.opened++;
      if (r.inside) t.inside++;
      if (r.secs >= 0) t.secs.push(r.secs);
      t.closest.push(r.closest);
    }
    // And the same door bolted. An officer works a lock from whichever side it
    // is on — the rule a bot already had, and a grey officer under an order is
    // as much an officer as a bot is.
    setOfficersIgnoreDoors(false);
    openDoor(world, stage.index);
    const r = doorRun(world, stage, true);
    bolted.n++;
    if (r.opened) bolted.opened++;
    if (r.inside) bolted.inside++;
  }
  setOfficersIgnoreDoors(false);

  console.log(`  staged ${staged}/${RUNS} cities`);
  for (const m of modes) {
    const t = tally.get(m.label)!;
    console.log(
      `  ${m.label.padEnd(15)} opened ${t.opened}/${t.n} - inside ${t.inside}/${t.n} - ` +
        `median ${t.secs.length ? f1(med(t.secs)) + 's' : '--'} - closest median ${f1(med(t.closest))}px`,
    );
  }
  console.log(`  ${'BOLTED (new)'.padEnd(15)} opened ${bolted.opened}/${bolted.n} - inside ${bolted.inside}/${bolted.n}`);

  const old = tally.get('OLD (no doors)')!;
  const now = tally.get('NEW')!;
  check(staged > 0, 'a street door with a room behind it was staged');
  check(old.inside === 0, 'CONTROL: the old behaviour never got inside', `${old.inside}/${old.n}`);
  check(old.opened === 0, 'CONTROL: the old behaviour never touched the door', `${old.opened}/${old.n}`);
  check(now.opened === now.n && now.n > 0, 'a commanded officer opens the door', `${now.opened}/${now.n}`);
  check(now.inside === now.n && now.n > 0, 'and gets inside the building', `${now.inside}/${now.n}`);
  check(
    bolted.inside === bolted.n && bolted.n > 0,
    'a bolted door is drawn back rather than refused',
    `${bolted.inside}/${bolted.n}`,
  );
}

// --------------------------------------------------------------- sandbags

/** Somewhere in the open, well clear of geometry. */
function openSpot(world: World): { x: number; y: number } | null {
  for (let i = 0; i < 6000; i++) {
    const x = 400 + Math.random() * (world.map.width - 800);
    const y = 400 + Math.random() * (world.map.height - 800);
    let clear = true;
    for (let a = 0; a < 12 && clear; a++) {
      const t = (a / 12) * Math.PI * 2;
      for (let r = 0; r <= 340; r += 28) {
        if (world.nav.isBlocked(x + Math.cos(t) * r, y + Math.sin(t) * r)) {
          clear = false;
          break;
        }
      }
    }
    if (clear) return { x, y };
  }
  return null;
}

/**
 * A run of build orders, through the real message path.
 *
 * `handle` on the engine's own world rather than one of our own, because the
 * spectator gate is half the point of the branch under test: everything about
 * *who may give an order* lives at that call site, and a rig that reached past
 * it into `commandOfficers` would not be measuring it at all.
 */
function sandbagSuite(): void {
  console.log('\n=== a run of sandbag orders ===');
  const world = engineWorld;

  let spot: { x: number; y: number } | null = null;
  for (let attempt = 0; attempt < 6 && !spot; attempt++) {
    bareCity(world);
    spot = openSpot(world);
  }
  if (!spot) {
    check(false, 'open ground for three officers and three walls');
    return;
  }

  /*
   * **Three officers well apart, and three spots all nearest to the first of
   * them.** This is the staging the whole run turns on, and the obvious version
   * does not discriminate: spread the spots out one per officer and the nearest
   * holder to each is a different man anyway, so the bug produces three orders
   * on three officers and looks exactly like the fix. Measured that way, the
   * old behaviour passed the check outright.
   *
   * Clustered, they are the report itself — a spectator clicking a few spots
   * along one stretch of street. With the bug every one of them picks the same
   * nearest holder and the third order is the only one left standing.
   */
  const now0 = Date.now();
  const ids = ['grey-0', 'grey-1', 'grey-2'];
  ids.forEach((id, i) => addOfficer(world, id, spot!.x + (i - 1) * 200, spot!.y, now0));
  rebuildEntityGrid(world);

  world.spectators.add('spec');
  const targets = [
    { x: spot.x - 200, y: spot.y - 150 },
    { x: spot.x - 150, y: spot.y - 150 },
    { x: spot.x - 250, y: spot.y - 150 },
  ];

  // A socket that is not spectating is ignored, which is the one rule the wire
  // message carries beyond its geometry.
  handle('nobody', {
    type: 'command',
    ids,
    x: targets[0].x,
    y: targets[0].y,
    build: 'sandbag',
    angle: 0,
  });
  check(
    buildSitesToWire(world).length === 0,
    'a socket that is not spectating is ignored',
    `${buildSitesToWire(world).length} orders`,
  );

  const assigned: string[] = [];
  for (const t of targets) {
    handle('spec', { type: 'command', ids, x: t.x, y: t.y, build: 'sandbag', angle: 0.4 });
    const fresh = buildSitesToWire(world).find((s) => !assigned.includes(s.id));
    assigned.push(fresh ? fresh.id : '(none)');
  }
  console.log(`  three orders went to: ${assigned.join(', ')}`);
  check(
    new Set(assigned).size === 3 && !assigned.includes('(none)'),
    'three orders go to three different officers',
    assigned.join(', '),
  );
  const three = buildSitesToWire(world);
  check(three.length === 3, 'all three orders stand at once', `${three.length} on the wire`);

  // A fourth has nobody left free, and is refused rather than reassigned.
  handle('spec', { type: 'command', ids, x: spot.x, y: spot.y - 260, build: 'sandbag', angle: 0 });
  const after = buildSitesToWire(world);
  check(after.length === 3, 'a fourth order with nobody free is refused', `${after.length} on the wire`);
  check(
    after.every((s) => Math.abs(s.y - (spot!.y - 150)) < 40),
    'and does not move an order somebody is already carrying out',
  );
  check(
    new Set(three.map((s) => s.id)).size === 3,
    'and three walls are pending on three different men',
    three.map((s) => s.id).join(' '),
  );

  /*
   * A plain move goes round the builders; a double right-click takes one off.
   *
   * Staged with the three men still walking, which is the only window in which
   * the question exists at all — and the control is the *fourth* officer, who
   * has no errand and must move on the very same message. Without him "nothing
   * happened" is satisfied just as well by the order having been dropped.
   */
  addOfficer(world, 'grey-3', spot.x + 300, spot.y, now0);
  rebuildEntityGrid(world);
  const withSpare = [...ids, 'grey-3'];
  const beforeSites = buildSitesToWire(world).map((b) => `${b.id}@${b.x},${b.y}`).sort();

  handle('spec', { type: 'command', ids: withSpare, x: spot.x + 300, y: spot.y + 220 });
  const afterPlain = buildSitesToWire(world).map((b) => `${b.id}@${b.x},${b.y}`).sort();
  check(
    afterPlain.join('|') === beforeSites.join('|'),
    'a single right-click leaves every wall order exactly as it was',
    `${afterPlain.length} of ${beforeSites.length} still standing`,
  );
  check(
    ids.every((id) => world.ai.get(id)?.commandX === null),
    'and does not send a builder anywhere either',
  );
  check(
    world.ai.get('grey-3')?.commandX !== null,
    'CONTROL: the officer with no errand moves on that very message',
  );

  handle('spec', {
    type: 'command',
    ids: withSpare,
    x: spot.x + 300,
    y: spot.y + 220,
    override: true,
  });
  check(
    buildSitesToWire(world).length === 0,
    'a double right-click calls the walls off',
    `${buildSitesToWire(world).length} left`,
  );
  check(
    ids.every((id) => world.ai.get(id)?.commandX !== null),
    'and sends the men who were carrying them',
  );
  check(
    ids.every((id) => world.ai.get(id)?.hasSandbag === true),
    'giving an errand up does not spend the sandbag',
  );

  // Put them back to work, so the ghost and the wall are measured on a real
  // errand rather than on one that has just been cancelled.
  world.entities.delete('grey-3');
  world.ai.delete('grey-3');
  world.cityOfficers.delete('grey-3');
  for (const id of ids) {
    const st = world.ai.get(id)!;
    st.commandX = null;
    st.commandY = null;
  }
  for (const t of targets) {
    handle('spec', { type: 'command', ids, x: t.x, y: t.y, build: 'sandbag', angle: 0.4 });
  }
  check(buildSitesToWire(world).length === 3, 'three orders again for the walk');

  // The ghost stands for the whole errand and comes off when the wall goes up.
  let now = now0;
  let walking = 0;
  let stacking = 0;
  for (let i = 0; i < 900; i++) {
    tick(world, now, TICK_MS / 1000);
    now += TICK_MS;
    for (const s of buildSitesToWire(world)) {
      if (s.working) stacking++;
      else walking++;
    }
    if (world.barricades.size >= 3) break;
  }
  console.log(
    `  walls built ${world.barricades.size}/3 - ghost ticks walking ${walking}, stacking ${stacking} - ` +
      `orders left ${buildSitesToWire(world).length}`,
  );
  check(walking > 0, 'the ghost stands while he walks to the spot', `${walking} ticks`);
  check(stacking > 0, 'and says so once he has arrived and is stacking', `${stacking} ticks`);
  check(world.barricades.size === 3, 'three walls actually get built', `${world.barricades.size}/3`);
  check(buildSitesToWire(world).length === 0, 'and the ghosts come off the wire with them');
  /*
   * **And then they stand there.**
   *
   * Reported as grey officers wandering off the moment the sandbags were
   * stacked: with the build cleared and nothing else standing, the next tick
   * fell through to escort/guard/patrol and they strolled away from the thing
   * they had just put up. Finishing hands over to the move order's own arrival
   * behaviour instead — hold where you are and scan the street.
   *
   * Measured over a good deal longer than the walk took, because "did not move"
   * is a claim about the rest of the round rather than about the next second.
   */
  {
    const wasAt = ids.map((id) => {
      const e = world.entities.get(id);
      return { id, x: e?.x ?? 0, y: e?.y ?? 0 };
    });
    for (let i = 0; i < 600; i++) {
      tick(world, now, TICK_MS / 1000);
      now += TICK_MS;
    }
    const drift = wasAt.map((w) => {
      const e = world.entities.get(w.id);
      return e ? Math.hypot(e.x - w.x, e.y - w.y) : 0;
    });
    const worst = Math.max(...drift);
    check(
      worst < 30,
      'and then holds the spot rather than wandering off it',
      `worst drift ${worst.toFixed(1)}px over 20s`,
    );
    check(
      ids.every((id) => world.ai.get(id)?.commandX !== null),
      'because finishing leaves him under a stand-here order',
    );
  }

  check(
    ids.every((id) => world.ai.get(id)?.hasSandbag === false),
    'every builder spent his one sandbag',
    ids.map((id) => `${id}:${world.ai.get(id)?.hasSandbag}`).join(' '),
  );
  world.spectators.delete('spec');
}

doorSuite();
sandbagSuite();

console.log(`\n${checks - failures}/${checks} checks passed${failures ? ` - ${failures} FAILED` : ''}`);
process.exit(failures ? 1 : 0);
