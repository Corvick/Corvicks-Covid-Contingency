/**
 * Headless check for two asks in the same breath: the sniper round should
 * carry through to whatever is standing behind its first target, and the
 * bolt action's damage roll should be sized against a normal zombie's own
 * health rather than picked by eye — the top end one-shots 75% of the time,
 * the bottom end always leaves it dead in two.
 *
 * No socket, no port, so it leaves a game on 8080 alone.
 *
 *   npx tsx riflebalance.ts
 *
 * Not typechecked by `npx tsc --noEmit` in `server/` — that only includes
 * `src/**`. Check it explicitly:
 *   npx tsc --noEmit --target ES2022 --module ESNext --moduleResolution Bundler \
 *     --strict --skipLibCheck --types node riflebalance.ts
 */
import {
  createWorld,
  resetWorld,
  rebuildEntityGrid,
  makeEntity,
  newAiState,
  type World,
  type Entity,
} from './src/world.js';
import { fire } from './src/combat.js';
import { ITEMS } from '../shared/items.js';
import { ZOMBIE_MAX_HEALTH } from '../shared/constants.js';

let checks = 0;
let failures = 0;
function check(ok: boolean, label: string, detail = ''): void {
  checks++;
  if (!ok) failures++;
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail ? '  - ' + detail : ''}`);
}

/** An empty city with a clear lane in it, and the lane's near end — same
 *  staging `deathcheck.ts` uses, and the same reason: `fire` runs its own
 *  hitscan against the walls, so a lane that happens to cross a shop front
 *  eats the round and the whole measurement becomes the map. */
const LANE = 320;
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
      const x = 300 + Math.random() * (world.map.width - 900);
      const y = 300 + Math.random() * (world.map.height - 600);
      let clear = true;
      for (let d = -40; d <= LANE && clear; d += 12) {
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

function zombie(world: World, id: string, x: number, y: number, health = ZOMBIE_MAX_HEALTH): Entity {
  const e = makeEntity(id, 'zombie', x, y);
  e.health = health;
  e.maxHealth = ZOMBIE_MAX_HEALTH;
  world.entities.set(id, e);
  world.ai.set(id, newAiState(Date.now(), x, y));
  return e;
}

/**
 * `fire` takes `pierce` as a bare parameter rather than reading `def.pierce`
 * itself — that translation is normally `fireHeld`'s job. Doing it here too
 * rather than hardcoding a number is what makes this test fail loudly if
 * `sniper.pierce` ever changes instead of quietly testing a stale value.
 */
function sniperShot(world: World, shooter: Entity): void {
  fire(world, shooter, 0, 0, Date.now(), ITEMS.sniper, ITEMS.sniper.pierce ?? 1);
}

console.log(`\n=== the sniper carries through to what is behind its target (pierce ${ITEMS.sniper.pierce}) ===`);
{
  const { world, x, y } = bare();
  const shooter = makeEntity('shooter', 'officer', x, y);
  world.entities.set('shooter', shooter);
  const near = zombie(world, 'near', x + 150, y, 400); // tough enough to survive the hit
  const far = zombie(world, 'far', x + 300, y, 400);
  rebuildEntityGrid(world);
  const nearBefore = near.health, farBefore = far.health;
  sniperShot(world, shooter);
  check(near.health < nearBefore, 'the near zombie takes damage', `${nearBefore} -> ${near.health}`);
  check(far.health < farBefore, 'and so does the one behind it', `${farBefore} -> ${far.health}`);
}
{
  // Control: with nothing behind it, a lone target still works exactly as
  // before — piercing must not change the ordinary case.
  const { world, x, y } = bare();
  const shooter = makeEntity('shooter', 'officer', x, y);
  world.entities.set('shooter', shooter);
  zombie(world, 'only', x + 150, y, 12);
  rebuildEntityGrid(world);
  world.deaths.length = 0;
  sniperShot(world, shooter);
  check(world.deaths.length === 1, 'CONTROL: a lone target still just dies once', `${world.deaths.length}`);
}
{
  // Three in a line: pierce is 2, so the third must be untouched.
  const { world, x, y } = bare();
  const shooter = makeEntity('shooter', 'officer', x, y);
  world.entities.set('shooter', shooter);
  const a = zombie(world, 'a', x + 120, y, 400);
  const b = zombie(world, 'b', x + 240, y, 400);
  const c = zombie(world, 'c', x + 360, y, 400);
  rebuildEntityGrid(world);
  const [ab, bb, cb] = [a.health, b.health, c.health];
  sniperShot(world, shooter);
  check(a.health < ab, 'first in line hit');
  check(b.health < bb, 'second in line hit');
  check(c.health === cb, 'third in line untouched — pierce is 2, not unlimited', `${cb} -> ${c.health}`);
}

console.log('\n=== the bolt action, sized against a normal zombie ===');
{
  const def = ITEMS.boltRifle;
  console.log(`  damageMin ${def.damageMin}, damageMax ${def.damageMax}, ZOMBIE_MAX_HEALTH ${ZOMBIE_MAX_HEALTH}`);
  check((def.damageMin ?? 0) * 2 >= ZOMBIE_MAX_HEALTH, 'twice the low end already covers a normal zombie on paper');

  // One city, one lane, reused for every trial below — `generateMap` is the
  // expensive part (`bare` calls it up to 40 times looking for a clear lane)
  // and none of it changes what a fixed-position shot against a fixed-health
  // zombie does. Only the zombie (which may die) is re-added and the entity
  // grid — a handful of bodies, not the map — rebuilt each time.
  const { world, x, y } = bare();
  const shooter = makeEntity('shooter', 'officer', x, y);
  world.entities.set('shooter', shooter);
  const zx = x + 150;

  // The low end, empirically: two worst-case rounds, nothing else, on a
  // fresh zombie each time — must always finish it.
  let twoShotFails = 0;
  const trials = 300;
  for (let i = 0; i < trials; i++) {
    world.entities.delete('z');
    world.ai.delete('z');
    zombie(world, 'z', zx, y);
    rebuildEntityGrid(world);
    // Force the worst-case roll by patching Math.random to always return 0,
    // which `hit`'s `lo + Math.floor(Math.random() * (hi-lo+1))` turns into
    // exactly `lo` — the low end, not an average.
    const realRandom = Math.random;
    Math.random = () => 0;
    try {
      fire(world, shooter, 0, 0, Date.now(), def);
      if (world.entities.has('z')) fire(world, shooter, 0, 0, Date.now(), def);
    } finally {
      Math.random = realRandom;
    }
    if (world.entities.has('z')) twoShotFails++;
  }
  check(twoShotFails === 0, 'two worst-case rounds always finish a normal zombie', `${trials - twoShotFails}/${trials}`);

  // The high end, statistically: roll damage the ordinary way (unpatched)
  // against a zombie with exactly ZOMBIE_MAX_HEALTH and nothing else in the
  // way, and count how often one round is enough.
  let oneShots = 0;
  const rollTrials = 4000;
  for (let i = 0; i < rollTrials; i++) {
    world.entities.delete('z');
    world.ai.delete('z');
    zombie(world, 'z', zx, y);
    rebuildEntityGrid(world);
    fire(world, shooter, 0, 0, Date.now(), def);
    if (!world.entities.has('z')) oneShots++;
  }
  const rate = oneShots / rollTrials;
  console.log(`  one-shot rate over ${rollTrials} fresh rolls: ${(rate * 100).toFixed(1)}%`);
  check(Math.abs(rate - 0.75) < 0.03, 'one-shots a normal zombie ~75% of the time', `${(rate * 100).toFixed(1)}%`);
}

console.log(`\n${checks - failures}/${checks} checks passed${failures ? ` - ${failures} FAILED` : ''}`);
process.exit(failures ? 1 : 0);
