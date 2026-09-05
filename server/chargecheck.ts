/**
 * Headless check of the charge rifle as an energy weapon. No socket, no port,
 * so it leaves a game on 8080 alone.
 *
 * Two halves:
 *
 *   - the beam and its aftermath, driven straight through `fire`: a charge
 *     round carries `Shot.plasma` (the bar level), a full-charge one that meets
 *     a wall scorches it (`wall`), one that pierces a wall reports the entry
 *     point (`thruX`), and one that runs out in the open leaves the crater
 *     condition (`plasma === CHARGE_BARS && !wall`);
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
  ZOMBIE_MAX_HEALTH,
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
    rebuildEntityGrid(world);
    for (let i = 0; i < 4000; i++) {
      const x = 300 + Math.random() * (world.map.width - 3000);
      const y = 300 + Math.random() * (world.map.height - 600);
      let clear = true;
      // Nothing solid for the whole of the gun's reach along +x, and a little
      // either side of the line.
      for (let d = -40; d <= 2400 && clear; d += 14) {
        for (const off of [-16, 0, 16]) {
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

  // A wall in front, and a second one behind it.
  world.map.walls.push({ x: x + 400, y: y - 60, w: 12, h: 120 });
  world.map.walls.push({ x: x + 900, y: y - 60, w: 12, h: 120 });
  buildStaticGrids(world);
  rebuildEntityGrid(world);

  // Full charge into the near wall.
  world.shots.length = 0;
  fire(world, shooter, 0, 0, 1e6, def, CHARGE_BARS, 2.4, false);
  const a = world.shots[world.shots.length - 1];
  check(a?.plasma === CHARGE_BARS, 'a full-charge round carries plasma === CHARGE_BARS', `${a?.plasma}`);
  check(a?.wall === true, 'and meeting a wall it scorches it (wall)', `${a?.wall}`);
  check(a?.thruX === undefined, 'and does not report a pierce point when it did not pierce', `${a?.thruX}`);
  check(Math.abs(a.x2 - (x + 400)) < 20, 'and stops at the near wall', `x2 ${a.x2} vs ${x + 400}`);

  // Full charge, driven through the near wall.
  world.shots.length = 0;
  fire(world, shooter, 0, 0, 1e6, def, CHARGE_BARS, 2.4, true);
  const b = world.shots[world.shots.length - 1];
  check(b?.thruX !== undefined && Math.abs(b.thruX - (x + 400)) < 20, 'a through-wall round reports the entry point', `thruX ${b?.thruX}`);
  check(Math.abs(b.x2 - (x + 900)) < 20, 'and carries on to the wall behind', `x2 ${b.x2} vs ${x + 900}`);

  // A one-bar round.
  world.shots.length = 0;
  fire(world, shooter, 0, 0, 1e6, def, 1, 0.4, false);
  check(lastPlasma(world) === 1, 'a one-bar round carries plasma === 1', `${lastPlasma(world)}`);

  // Full charge with nothing in reach — the crater condition.
  world.map.walls.length -= 2;
  buildStaticGrids(world);
  world.shots.length = 0;
  fire(world, shooter, 0, 0, 1e6, def, CHARGE_BARS, 2.4, false);
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
    fire(world, shooter, 0, 0, 1e6, def, CHARGE_BARS, topMul, false);
    if (!stillAlive(world, 'z')) killed++;
    world.entities.delete('z');

    const z3 = makeEntity('z3', 'zombie', x + 200, y);
    z3.health = ZOMBIE_MAX_HEALTH;
    z3.maxHealth = ZOMBIE_MAX_HEALTH;
    world.entities.set('z3', z3);
    world.ai.set('z3', newAiState(1e6, z3.x, z3.y));
    rebuildEntityGrid(world);
    fire(world, shooter, 0, 0, 1e6, def, 3, bar3Mul, false);
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
    fire(world, shooter, 0, 0, 1e6, def, CHARGE_BARS, topMul, false);
    if (!stillAlive(world, 'h')) curedKilled++;
    world.entities.delete('h');
    world.pendingInfections.delete('h');
  }
  check(curedKilled === 60, 'and it always drops an infected civilian too', `${curedKilled}/60`);
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
