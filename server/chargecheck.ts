/**
 * Headless check of the charge rifle as an energy weapon. No socket, no port,
 * so it leaves a game on 8080 alone.
 *
 * Two halves:
 *
 *   - the beam and its aftermath, driven straight through `fire`: a charge
 *     round carries `Shot.plasma` (the bar level), a full-charge one that meets
 *     a wall scorches it (`wall`), one that pierces walls reports an entry
 *     point per wall (`thru`) and clears a whole corner of them, and one that runs
 *     out in the open leaves the crater
 *     condition (`plasma === CHARGE_BARS && !wall`);
 *
 *   - what a full wind-up goes through, driven end to end through
 *     `processShooting` so the real bar-level ramp runs: a dozen bodies out of
 *     a queue of fourteen, and the width of the beam — a body well off the
 *     line is still caught where an ordinary rifle round sails past it;
 *
 *   - the vent, driven through `processShooting`: firing sets
 *     `world.chargeCoolUntil`, the gun will not wind up again until it passes,
 *     and `coolProgress` / `EntityState.cooling` decay from 1 back to nothing
 *     across `CHARGE_COOL_MS`.
 *
 *   npx tsx chargecheck.ts
 *
 * Not typechecked by `npx tsc --noEmit` in `server/` — that only includes
 * `src/**`. Check it explicitly:
 *   npx tsc --noEmit --target ES2022 --module ESNext --moduleResolution Bundler \
 *     --strict --skipLibCheck --types node chargecheck.ts
 */
import {
  createWorld,
  resetWorld,
  buildStaticGrids,
  rebuildEntityGrid,
  makeEntity,
  newAiState,
  stillAlive,
  toWire,
  type World,
  type Entity,
} from './src/world.js';
import { fire, processShooting, coolProgress } from './src/combat.js';
import { newInventory } from './src/inventory.js';
import type { Command } from './src/world.js';
import { ITEMS } from '../shared/items.js';
import {
  CHARGE_BARS,
  CHARGE_MS,
  CHARGE_COOL_MS,
  CHARGE_BASE_MUL,
  CHARGE_TOP_MUL,
  CHARGE_BASE_PIERCE,
  CHARGE_TOP_PIERCE,
  CHARGE_BEAM_RADIUS,
  CHARGE_WALL_PIERCE,
  ZOMBIE_MAX_HEALTH,
  ZOMBIE_RADIUS,
  ENTITY_MAX_HEALTH,
} from '../shared/constants.js';

let checks = 0;
let failures = 0;
function check(ok: boolean, label: string, detail = ''): void {
  checks++;
  if (!ok) failures++;
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail ? '  - ' + detail : ''}`);
}

/** An empty city with a clear stretch of ground, and its near end. */
function bare(): { world: World; x: number; y: number } {
  for (let attempt = 0; attempt < 40; attempt++) {
    const world = createWorld();
    resetWorld(world);
    for (const id of [...world.entities.keys()]) {
      world.entities.delete(id);
      world.ai.delete(id);
    }
    // **A shut door is not in the nav grid** — that is the rule doors follow
    // everywhere — so a lane swept as clear below can still have one across
    // it, and `fire` stops at one. That is CLAUDE.md's own trap about picking
    // a clear lane out of the nav grid. An empty city has nobody to work a
    // handle, so every door is simply stood open.
    for (const door of world.doors) if (door) door.open = true;
    rebuildEntityGrid(world);
    for (let i = 0; i < 4000; i++) {
      const x = 300 + Math.random() * (world.map.width - 3000);
      const y = 300 + Math.random() * (world.map.height - 600);
      let clear = true;
      // Nothing solid for the whole of the gun's reach along +x, and clear to
      // either side of it by more than the widest the beam is ever tested at —
      // a body staged off the line to measure the beam's width is no use if a
      // shop front on that city stands between it and the muzzle, and a lane
      // cleared at ±16 says nothing about ±36.
      for (let d = -40; d <= 2400 && clear; d += 14) {
        for (const off of [-44, -16, 0, 16, 44]) {
          if (world.nav.isBlocked(x + d, y + off)) {
            clear = false;
            break;
          }
        }
      }
      if (clear) return { world, x, y };
    }
  }
  throw new Error('no clear lane found');
}

function officerWith(world: World, id: string, x: number, y: number): Entity {
  const e = makeEntity(id, 'officer', x, y);
  world.entities.set(id, e);
  return e;
}

const lastPlasma = (world: World): number | undefined =>
  world.shots.length ? world.shots[world.shots.length - 1].plasma : undefined;

// ---------------------------------------------------------------- the beam

console.log('\n=== the beam, the scorch and the crater ===');
{
  const { world, x, y } = bare();
  const shooter = officerWith(world, 'shooter', x, y);
  const def = ITEMS.chargeRifle;

  // `CHARGE_WALL_PIERCE` walls in front, well clear of each other so each is
  // its own — see `CHARGE_WALL_MERGE`, and the corner section below for what
  // happens when they are not — and the far side of the street behind them,
  // which is the one that has to stop it.
  for (let i = 0; i < CHARGE_WALL_PIERCE; i++) {
    world.map.walls.push({ x: x + 400 + i * 100, y: y - 60, w: 12, h: 120 });
  }
  world.map.walls.push({ x: x + 900, y: y - 60, w: 12, h: 120 });
  buildStaticGrids(world);
  rebuildEntityGrid(world);

  // Full charge into the near wall.
  world.shots.length = 0;
  fire(world, shooter, 0, 0, 1e6, def, CHARGE_TOP_PIERCE, 2.4, 0, 0, false, CHARGE_BARS);
  const a = world.shots[world.shots.length - 1];
  check(a?.plasma === CHARGE_BARS, 'a full-charge round carries plasma === CHARGE_BARS', `${a?.plasma}`);
  check(a?.wall === true, 'and meeting a wall it scorches it (wall)', `${a?.wall}`);
  check(a?.thru === undefined, 'and does not report a pierce point when it did not pierce', `${a?.thru}`);
  check(Math.abs(a.x2 - (x + 400)) < 20, 'and stops at the near wall', `x2 ${a.x2} vs ${x + 400}`);

  // Full charge, driven through the near wall.
  world.shots.length = 0;
  fire(world, shooter, 0, 0, 1e6, def, CHARGE_TOP_PIERCE, 2.4, CHARGE_WALL_PIERCE, 0, false, CHARGE_BARS);
  const b = world.shots[world.shots.length - 1];
  check(b?.thru !== undefined && Math.abs(b.thru[0] - (x + 400)) < 20, 'a through-wall round reports the entry point', `thru ${b?.thru}`);
  // Every wall, not only the first — the whole of "I am not seeing the second
  // decal". `CHARGE_WALL_PIERCE` walls pierced, so that many entry points, in
  // the order it met them.
  const wallXs = b?.thru?.filter((_, i) => i % 2 === 0) ?? [];
  const expectedXs = Array.from({ length: CHARGE_WALL_PIERCE }, (_, i) => 400 + i * 100);
  check(
    wallXs.length === CHARGE_WALL_PIERCE &&
      wallXs.every((wx, i) => Math.abs(wx - (x + 400 + i * 100)) < 20),
    'and one for every wall it went through, not only the first',
    `${wallXs.length} entries ${wallXs.map((v) => v - x).join(',')} vs ${expectedXs.join(',')}`,
  );
  check(
    Math.abs(b.x2 - (x + 900)) < 20,
    'and carries on through CHARGE_WALL_PIERCE of them to the one behind',
    `x2 ${b.x2} vs ${x + 900}`,
  );

  // A one-bar round.
  world.shots.length = 0;
  fire(world, shooter, 0, 0, 1e6, def, CHARGE_BASE_PIERCE, 0.4, 0, 0, false, 1);
  check(lastPlasma(world) === 1, 'a one-bar round carries plasma === 1', `${lastPlasma(world)}`);

  // Full charge with nothing in reach — the crater condition.
  world.map.walls.length -= CHARGE_WALL_PIERCE + 1;
  buildStaticGrids(world);
  world.shots.length = 0;
  fire(world, shooter, 0, 0, 1e6, def, CHARGE_TOP_PIERCE, 2.4, 0, 0, false, CHARGE_BARS);
  const c = world.shots[world.shots.length - 1];
  check(c?.plasma === CHARGE_BARS && !c.wall, 'a full-charge round into the open leaves no wall — a crater', `plasma ${c?.plasma} wall ${c?.wall}`);
  check(Math.hypot(c.x2 - x, c.y2 - y) > 2000, 'and it ran most of its reach first', `${Math.round(Math.hypot(c.x2 - x, c.y2 - y))}px`);

  // A brass casing is never thrown for an energy round.
  check(c.light === undefined, 'no light flag on an energy round', `${c.light}`);
}

// ------------------------------------------------------- a full charge one-shots

console.log('\n=== a full charge drops a normal zombie in one ===');
{
  const { world, x, y } = bare();
  const shooter = officerWith(world, 'shooter', x, y);
  const def = ITEMS.chargeRifle;
  const topMul = CHARGE_BASE_MUL + (CHARGE_TOP_MUL - CHARGE_BASE_MUL) * 1; // level 4
  const bar3Mul = CHARGE_BASE_MUL + (CHARGE_TOP_MUL - CHARGE_BASE_MUL) * (2 / 3);

  let killed = 0;
  let bar3Killed = 0;
  const trials = 200;
  for (let i = 0; i < trials; i++) {
    const z = makeEntity('z', 'zombie', x + 200, y);
    z.health = ZOMBIE_MAX_HEALTH;
    z.maxHealth = ZOMBIE_MAX_HEALTH;
    world.entities.set('z', z);
    world.ai.set('z', newAiState(1e6, z.x, z.y));
    rebuildEntityGrid(world);
    fire(world, shooter, 0, 0, 1e6, def, CHARGE_TOP_PIERCE, topMul, 0, 0, false, CHARGE_BARS);
    if (!stillAlive(world, 'z')) killed++;
    world.entities.delete('z');

    const z3 = makeEntity('z3', 'zombie', x + 200, y);
    z3.health = ZOMBIE_MAX_HEALTH;
    z3.maxHealth = ZOMBIE_MAX_HEALTH;
    world.entities.set('z3', z3);
    world.ai.set('z3', newAiState(1e6, z3.x, z3.y));
    rebuildEntityGrid(world);
    fire(world, shooter, 0, 0, 1e6, def, 8, bar3Mul, 0, 0, false, 3);
    if (!stillAlive(world, 'z3')) bar3Killed++;
    world.entities.delete('z3');
  }
  check(killed === trials, 'a full-charge round always drops a 100hp zombie', `${killed}/${trials}`);
  check(bar3Killed < trials, 'bar 3 does NOT always — the tiers still mean something', `${bar3Killed}/${trials}`);

  // Same against an infected civilian (100hp human) still on its feet.
  let curedKilled = 0;
  for (let i = 0; i < 60; i++) {
    const h = makeEntity('h', 'human', x + 200, y);
    h.health = ENTITY_MAX_HEALTH.human;
    h.maxHealth = ENTITY_MAX_HEALTH.human;
    world.entities.set('h', h);
    world.pendingInfections.set('h', 1e6 + 30000);
    world.ai.set('h', newAiState(1e6, h.x, h.y));
    rebuildEntityGrid(world);
    fire(world, shooter, 0, 0, 1e6, def, CHARGE_TOP_PIERCE, topMul, 0, 0, false, CHARGE_BARS);
    if (!stillAlive(world, 'h')) curedKilled++;
    world.entities.delete('h');
    world.pendingInfections.delete('h');
  }
  check(curedKilled === 60, 'and it always drops an infected civilian too', `${curedKilled}/60`);
}

// ------------------------------------------------------------------ the corner

console.log('\n=== a full wind-up clears a corner, not one slab of it ===');
{
  const { world, x, y } = bare();
  const id = 'p';
  officerWith(world, id, x, y);
  world.playerIds.add(id);
  const inv = newInventory();
  inv.guns[0] = { item: 'chargeRifle', ammo: 14 };
  inv.activeSlot = 1;
  world.inventories.set(id, inv);

  // A corner: `mapgen` lays walls as runs of rects, so where two runs meet a
  // round crossing the join meets three slabs within a few pixels of each
  // other rather than one. Measured in a real city, a full charge fired north
  // from a street met slabs at 25, 25, 81, 165 and 165px — which is the
  // reported fault, and it is why a pierce is charged per *wall*: these three
  // must cost one between them.
  for (let i = 0; i < 3; i++) world.map.walls.push({ x: x + 400 + i * 7, y: y - 60, w: 12, h: 120 });
  // Then `CHARGE_WALL_PIERCE - 1` more, each plainly its own wall, to spend
  // the rest of the budget — and the wall behind them, which is the one that
  // has to stop it. Three wall-groups against two pierces, so the round is
  // stopped by geometry rather than by running out of reach — without that
  // the check would pass for a beam that goes through everything. **Counted
  // by the rect the corner alone would spend three of the two**, and the
  // round would stop inside the corner itself instead.
  const laterWalls = Array.from({ length: CHARGE_WALL_PIERCE - 1 }, (_, i) => 700 + i * 200);
  const stopAt = 700 + (CHARGE_WALL_PIERCE - 1) * 200;
  for (const at of [...laterWalls, stopAt]) {
    world.map.walls.push({ x: x + at, y: y - 60, w: 12, h: 120 });
  }
  buildStaticGrids(world);
  rebuildEntityGrid(world);

  const cmd = (shooting: boolean): Command => ({
    input: { up: false, down: false, left: false, right: false },
    aim: 0,
    aimX: x + 2000,
    aimY: y,
    shooting,
    sprint: false,
    interact: false,
    rightDown: false,
  });

  let t = 2_000_000;
  world.commands.set(id, cmd(true));
  processShooting(world, t, new Set());
  t += CHARGE_MS + 60;
  world.shots.length = 0;
  world.commands.set(id, cmd(false));
  processShooting(world, t, new Set());
  const through = world.shots[world.shots.length - 1];
  check(
    through !== undefined && Math.abs(through.x2 - (x + stopAt)) < 40,
    'the corner costs one pierce between its three slabs, not three',
    `x2 ${through?.x2} vs ${x + stopAt} - counted by the rect it would stop inside the corner`,
  );
  const cornerXs = through?.thru?.filter((_, i) => i % 2 === 0) ?? [];
  check(
    cornerXs.length > 0 && Math.abs(cornerXs[0] - (x + 400)) < 30,
    'and reports the face it went in by, not the last one it skipped',
    `thru ${through?.thru} vs ${x + 400}`,
  );
  // The merge rule reaches the marks as well as the count: the corner is one
  // wall, so it leaves one scar rather than three stacked on each other.
  const expectedCornerXs = [400, ...laterWalls];
  check(
    cornerXs.length === CHARGE_WALL_PIERCE &&
      expectedCornerXs.every((at, i) => Math.abs(cornerXs[i] - (x + at)) < 30),
    'and the corner leaves one scar between its three slabs, then one per wall',
    `${cornerXs.length} entries ${cornerXs.map((v) => v - x).join(',')} vs ${expectedCornerXs.join(',')}`,
  );

  // The control, and it is what says four is a count rather than a free pass:
  // a lesser wind-up still stops at the first thing it meets.
  t += CHARGE_COOL_MS + 60;
  world.commands.set(id, cmd(true));
  processShooting(world, t, new Set());
  t += CHARGE_MS * 0.3;
  world.shots.length = 0;
  world.commands.set(id, cmd(false));
  processShooting(world, t, new Set());
  const stopped = world.shots[world.shots.length - 1];
  check(
    stopped !== undefined && stopped.plasma !== CHARGE_BARS && Math.abs(stopped.x2 - (x + 400)) < 30,
    'a part charge stops at the near face of it',
    `bar ${stopped?.plasma} x2 ${stopped?.x2} vs ${x + 400}`,
  );
}

// -------------------------------------------------- a full charge clears a queue

console.log('\n=== a full wind-up goes through a crowd ===');
{
  const { world, x, y } = bare();
  const id = 'p';
  const shooter = officerWith(world, id, x, y);
  world.playerIds.add(id);
  const inv = newInventory();
  inv.guns[0] = { item: 'chargeRifle', ammo: 14 };
  inv.activeSlot = 1;
  world.inventories.set(id, inv);

  // Fourteen in a line, which is two more than the beam can carry through —
  // "it went through everything" is satisfied just as well by a round with no
  // limit at all, and the two left standing are what say the figure is a
  // figure. Spaced tighter than the beam is long so the whole queue is well
  // inside the gun's reach.
  const QUEUE = 14;
  const SPACING = 50;
  for (let i = 0; i < QUEUE; i++) {
    const z = makeEntity(`q${i}`, 'zombie', x + 160 + i * SPACING, y);
    z.health = ZOMBIE_MAX_HEALTH;
    z.maxHealth = ZOMBIE_MAX_HEALTH;
    world.entities.set(z.id, z);
    world.ai.set(z.id, newAiState(1e6, z.x, z.y));
  }
  rebuildEntityGrid(world);

  const cmd = (shooting: boolean): Command => ({
    input: { up: false, down: false, left: false, right: false },
    aim: 0,
    aimX: x + 2000,
    aimY: y,
    shooting,
    sprint: false,
    interact: false,
    rightDown: false,
  });

  // Held to a full wind-up and let go, through the real `fireHeld` ramp —
  // handing `fire` a pierce count by hand would measure the harness's
  // arithmetic rather than the gun's.
  let t = 1_000_000;
  world.commands.set(id, cmd(true));
  processShooting(world, t, new Set());
  t += CHARGE_MS + 60;
  world.shots.length = 0;
  world.commands.set(id, cmd(false));
  processShooting(world, t, new Set());

  let down = 0;
  for (let i = 0; i < QUEUE; i++) if (!stillAlive(world, `q${i}`)) down++;
  check(down >= 10, 'a full charge drops at least ten of a queue', `${down}/${QUEUE}`);
  check(down === CHARGE_TOP_PIERCE, 'exactly CHARGE_TOP_PIERCE of them, and no more', `${down} vs ${CHARGE_TOP_PIERCE}`);
  check(stillAlive(world, `q${QUEUE - 1}`), 'the back of the queue is still standing - it is a figure, not a free pass');
  const beamShot = world.shots[world.shots.length - 1];
  check(beamShot?.plasma === CHARGE_BARS, 'and the beam still reports the bar level, not the body count', `${beamShot?.plasma}`);
}

// ------------------------------------------------------------- the beam is wide

console.log('\n=== the beam has width, and it is the wind-up ===');
{
  const { world, x, y } = bare();
  const shooter = officerWith(world, 'shooter', x, y);
  const def = ITEMS.chargeRifle;
  const topMul = CHARGE_BASE_MUL + (CHARGE_TOP_MUL - CHARGE_BASE_MUL);

  /** Fires one round past a body standing `off` pixels to the side of the line. */
  function grazed(off: number, level: number, mul: number, gun = def): boolean {
    const z = makeEntity('g', 'zombie', x + 300, y + off);
    z.health = 10_000;
    z.maxHealth = 10_000;
    world.entities.set('g', z);
    world.ai.set('g', newAiState(1e6, z.x, z.y));
    rebuildEntityGrid(world);
    fire(world, shooter, 0, 0, 1e6, gun, CHARGE_TOP_PIERCE, mul, 0, 0, false, level);
    const hit = (world.entities.get('g')?.health ?? 0) < 10_000;
    world.entities.delete('g');
    world.ai.delete('g');
    return hit;
  }

  // A zombie's own radius is 14, so anything past that is the beam.
  const R = ZOMBIE_RADIUS;
  check(grazed(R + CHARGE_BEAM_RADIUS - 3, CHARGE_BARS, topMul), 'a full charge catches a body its own radius clear of the line', `${R + CHARGE_BEAM_RADIUS - 3}px off`);
  check(!grazed(R + CHARGE_BEAM_RADIUS + 6, CHARGE_BARS, topMul), 'and not one past the beam', `${R + CHARGE_BEAM_RADIUS + 6}px off`);
  // The control, and it is the point: the same body, the same pixel, an
  // ordinary rifle round. Without it "the beam is wide" is satisfied by a
  // hit test that has stopped checking anything at all.
  check(!grazed(R + CHARGE_BEAM_RADIUS - 3, 0, 1, ITEMS.boltRifle), 'a bolt action round sails past the same body - the control');
  // And the width is the wind-up: one bar is a quarter of it.
  check(!grazed(R + CHARGE_BEAM_RADIUS - 3, 1, CHARGE_BASE_MUL), 'a one-bar round does not reach that far off the line');
  check(grazed(R + 2, 1, CHARGE_BASE_MUL), 'though it is still wider than the body it is aimed at', `${R + 2}px off`);
}

// ---------------------------------------------------------------- the vent

console.log('\n=== the vent locks the gun, then recedes ===');
{
  const { world, x, y } = bare();
  const id = 'p';
  const shooter = officerWith(world, id, x, y);
  world.playerIds.add(id);
  const inv = newInventory();
  inv.guns[0] = { item: 'chargeRifle', ammo: 14 };
  inv.activeSlot = 1;
  world.inventories.set(id, inv);
  rebuildEntityGrid(world);

  const cmd = (shooting: boolean): Command => ({
    input: { up: false, down: false, left: false, right: false },
    aim: 0,
    aimX: x + 500,
    aimY: y,
    shooting,
    sprint: false,
    interact: false,
    rightDown: false,
  });

  let t = 1_000_000;

  // Hold the trigger to wind up.
  world.commands.set(id, cmd(true));
  processShooting(world, t, new Set());
  check(world.chargeSince.has(id), 'holding the trigger winds it up');

  // Release past a full wind-up: it fires an energy beam and starts venting.
  t += CHARGE_MS + 60;
  world.shots.length = 0;
  world.commands.set(id, cmd(false));
  processShooting(world, t, new Set());
  const shot = world.shots[world.shots.length - 1];
  check(shot?.plasma === CHARGE_BARS, 'a released full wind-up fires plasma === CHARGE_BARS', `${shot?.plasma}`);
  const fired = t;
  const until = world.chargeCoolUntil.get(id) ?? 0;
  check(Math.abs(until - (fired + CHARGE_COOL_MS)) < 5, 'the vent is set to now + CHARGE_COOL_MS', `${until - fired}ms`);
  check(!world.chargeSince.has(id), 'and the wind-up is cleared');

  // Mid-vent: holding the trigger does nothing, and the readouts count down.
  t = fired + CHARGE_COOL_MS / 2;
  world.commands.set(id, cmd(true));
  processShooting(world, t, new Set());
  check(!world.chargeSince.has(id), 'holding the trigger while venting does not wind it up');
  const cp = coolProgress(world, id, inv, t);
  check(cp > 0.3 && cp < 0.7, 'coolProgress is about half way', `${cp.toFixed(2)}`);
  const wire = toWire(world, shooter, false, t);
  check(
    typeof wire.cooling === 'number' && wire.cooling > 0.3 && wire.cooling < 0.7,
    'EntityState.cooling matches',
    `${wire.cooling}`,
  );
  check(wire.charging === undefined, 'and EntityState.charging is absent mid-vent', `${wire.charging}`);

  // Once it has cooled: the readouts clear and it winds up again.
  t = fired + CHARGE_COOL_MS + 40;
  check(coolProgress(world, id, inv, t) === -1, 'coolProgress clears once cool', `${coolProgress(world, id, inv, t)}`);
  check(toWire(world, shooter, false, t).cooling === undefined, 'EntityState.cooling clears once cool');
  world.commands.set(id, cmd(true));
  processShooting(world, t, new Set());
  check(world.chargeSince.has(id), 'and the trigger winds it up again');
  const w2 = toWire(world, shooter, false, t + 200);
  check(typeof w2.charging === 'number' && w2.charging > 0, 'EntityState.charging ramps while winding up', `${w2.charging}`);
}

console.log(`\n${checks - failures}/${checks} checks passed${failures ? ` - ${failures} FAILED` : ''}`);
process.exit(failures ? 1 : 0);
