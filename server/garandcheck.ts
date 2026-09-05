/**
 * Headless check for the M1 Garand's en-bloc clip: nine ordinary rounds, a
 * tenth that empties the clip and locks the rifle out for the ping-and-reload
 * cycle, and firing again only once that has actually elapsed.
 *
 * No socket, no port, so it leaves a game on 8080 alone.
 *
 *   npx tsx garandcheck.ts
 *
 * Not typechecked by `npx tsc --noEmit` in `server/` — that only includes
 * `src/**`. Check it explicitly:
 *   npx tsc --noEmit --target ES2022 --module ESNext --moduleResolution Bundler \
 *     --strict --skipLibCheck --types node garandcheck.ts
 */
import { createWorld, resetWorld, rebuildEntityGrid, makeEntity, type World, type Entity } from './src/world.js';
import { fireHeld } from './src/combat.js';
import { newInventory, type Inventory } from './src/inventory.js';
import { ITEMS } from '../shared/items.js';

let checks = 0;
let failures = 0;
function check(ok: boolean, label: string, detail = ''): void {
  checks++;
  if (!ok) failures++;
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail ? '  - ' + detail : ''}`);
}

function rig(): { world: World; shooter: Entity; inv: Inventory } {
  const world = createWorld();
  resetWorld(world);
  for (const id of [...world.entities.keys()]) {
    world.entities.delete(id);
    world.ai.delete(id);
  }
  const shooter = makeEntity('shooter', 'officer', 1000, 1000);
  world.entities.set('shooter', shooter);
  world.playerIds.add('shooter');
  const inv = newInventory();
  for (let i = 0; i < inv.guns.length; i++) inv.guns[i] = null;
  inv.guns[0] = { item: 'semiAutoRifle', ammo: 30 };
  inv.activeSlot = 1;
  world.inventories.set('shooter', inv);
  rebuildEntityGrid(world);
  return { world, shooter, inv };
}

const def = ITEMS.semiAutoRifle;
const clipSize = def.clipSize ?? 0;
const reloadMs = def.reloadMs ?? 0;
console.log(`\n=== semiAutoRifle: clipSize ${clipSize}, cooldownMs ${def.cooldownMs}, reloadMs ${reloadMs} ===`);

console.log('\n=== nine ordinary rounds, then the tenth empties the clip ===');
{
  const { world, shooter, inv } = rig();
  let now = 1_000_000;
  let allNineFiredCleanly = true;
  let anyEarlyEject = false;
  for (let i = 1; i <= 9; i++) {
    world.shots.length = 0;
    const fired = fireHeld(world, shooter, inv, 0, now);
    if (!fired) allNineFiredCleanly = false;
    if (world.shots.some((s) => s.clipEject)) anyEarlyEject = true;
    now += def.cooldownMs!;
  }
  check(allNineFiredCleanly, 'shots 1-9 all fired on the ordinary cadence');
  check(!anyEarlyEject, 'none of the first nine ejected a clip', `ammo now ${inv.guns[0]!.ammo}`);
  check(inv.guns[0]!.ammo === 21, 'ammo is down to 21 after nine rounds', `${inv.guns[0]!.ammo}`);

  // The tenth.
  world.shots.length = 0;
  const tenthFired = fireHeld(world, shooter, inv, 0, now);
  check(tenthFired, 'the tenth round fires');
  check(inv.guns[0]!.ammo === 20, 'ammo is down to 20 — a whole clip', `${inv.guns[0]!.ammo}`);
  check(world.shots.some((s) => s.clipEject), 'the tenth round carries clipEject');
  const reloadDeadline = world.reloadReadyAt.get('shooter') ?? 0;
  check(reloadDeadline > now, 'a reload deadline was set in the future', `+${reloadDeadline - now}ms`);
  check(
    Math.abs(reloadDeadline - (now + reloadMs)) < 1,
    'the deadline is exactly now + reloadMs',
    `${reloadDeadline} vs ${now + reloadMs}`,
  );

  // Right after, on the ordinary cadence alone, it must not fire.
  now += def.cooldownMs!;
  const tooSoon = fireHeld(world, shooter, inv, 0, now);
  check(!tooSoon, 'an eleventh round refuses on the ordinary cooldown alone, mid-reload');
  check(inv.guns[0]!.ammo === 20, 'and ammo is untouched by the refusal', `${inv.guns[0]!.ammo}`);

  // One tick short of the deadline: still refused.
  const justShort = fireHeld(world, shooter, inv, 0, reloadDeadline - 1);
  check(!justShort, 'still refused one tick short of the reload finishing');

  // At the deadline: fires.
  world.shots.length = 0;
  const afterReload = fireHeld(world, shooter, inv, 0, reloadDeadline);
  check(afterReload, 'fires again exactly at the reload deadline');
  check(inv.guns[0]!.ammo === 19, 'ammo is 19 — the fresh clip took its first round', `${inv.guns[0]!.ammo}`);
  check(!world.shots.some((s) => s.clipEject), 'and that round does not itself eject a clip');
}

console.log('\n=== the last clip: the ping still plays, but nothing locks out an empty gun ===');
{
  const { world, shooter, inv } = rig();
  inv.guns[0]!.ammo = 10; // one clip left
  let now = 2_000_000;
  for (let i = 1; i <= 9; i++) {
    fireHeld(world, shooter, inv, 0, now);
    now += def.cooldownMs!;
  }
  world.shots.length = 0;
  const lastRound = fireHeld(world, shooter, inv, 0, now);
  check(lastRound, 'the final round of the last clip still fires');
  check(inv.guns[0]!.ammo === 0, 'ammo reads exactly 0', `${inv.guns[0]!.ammo}`);
  check(world.shots.some((s) => s.clipEject), 'the empty clip still ejects — the ping plays either way');
  const deadline = world.reloadReadyAt.get('shooter') ?? 0;
  check(deadline <= now, 'but no reload lockout was set — there is nothing left to load', `${deadline} vs now ${now}`);
  now += def.cooldownMs!;
  const dry = fireHeld(world, shooter, inv, 0, now);
  check(!dry, 'and the next attempt fails outright — out of ammo, not mid-reload');
}

console.log('\n=== a gun with an odd ammo count still aligns to clip boundaries ===');
{
  // A previous holder fired 7 of the first clip and dropped it; the picker's
  // ammo is 23, not a multiple of 10 — see the note in combat.ts.
  const { world, shooter, inv } = rig();
  inv.guns[0]!.ammo = 23;
  let now = 3_000_000;
  let ejectedAt = -1;
  for (let i = 1; i <= 5; i++) {
    world.shots.length = 0;
    fireHeld(world, shooter, inv, 0, now);
    if (world.shots.some((s) => s.clipEject)) ejectedAt = inv.guns[0]!.ammo;
    now += def.cooldownMs!;
    if (world.reloadReadyAt.get('shooter')) now = Math.max(now, world.reloadReadyAt.get('shooter')!);
  }
  check(ejectedAt === 20, 'the clip still empties on the next multiple of ten down', `at ammo ${ejectedAt}`);
}

console.log(`\n${checks - failures}/${checks} checks passed${failures ? ` - ${failures} FAILED` : ''}`);
process.exit(failures ? 1 : 0);
