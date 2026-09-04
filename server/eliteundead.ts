/**
 * Headless check on two reports:
 *
 *  - "swat zombies and soldier zombies should have more health and the grey
 *    officer zombies just a little more than a regular zombie"
 *  - "have swat and soldier zombies stagger less too"
 *
 * No socket, no port, so it leaves a game on 8080 alone.
 *   npx tsx eliteundead.ts
 *
 * Not typechecked by `npx tsc --noEmit` in `server/`, which only includes
 * `src`. Check it explicitly:
 *   npx tsc --noEmit --target ES2022 --module ESNext --moduleResolution Bundler
 *     --strict --skipLibCheck --types node eliteundead.ts
 */
import { createWorld, makeEntity, newAiState, rebuildEntityGrid, type World, type Entity } from './src/world.js';
import { fire } from './src/combat.js';
import { convert } from './src/ai.js';
import { ITEMS } from '../shared/items.js';
import {
  ENTITY_MAX_HEALTH,
  ZOMBIE_ELITE_HEALTH_MUL,
  ZOMBIE_OFFICER_HEALTH_MUL,
  FRESH_ZOMBIE_SLOW_MS,
  PLAYER_RADIUS,
  DOG_MAX_HEALTH,
} from '../shared/constants.js';

let fails = 0;
function check(ok: boolean, label: string, detail = ''): void {
  if (!ok) fails++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? '  - ' + detail : ''}`);
}

const swat = (w: World, id: string) => w.swat.add(id);
const soldier = (w: World, id: string) => w.soldiers.add(id);
const cityOfficer = (w: World, id: string) => w.cityOfficers.add(id);
const rifleman = (w: World, id: string) => w.riflemen.add(id);
const dispatched = (w: World, id: string) => w.dispatched.add(id);
const bot = (w: World, id: string) => w.bots.add(id);

/**
 * Somewhere in the open, well clear of geometry, for a shot to have a clear
 * line across. The map is not seeded, so a fixed spot is a spot a wall stands
 * on in some cities and not others — the same trap `botfight.ts` and
 * `sandbagnav.ts` both stage around rather than assume past.
 */
function openSpot(world: World): { x: number; y: number } | null {
  for (let i = 0; i < 4000; i++) {
    const x = 300 + Math.random() * (world.map.width - 600);
    const y = 300 + Math.random() * (world.map.height - 600);
    let clear = true;
    for (let a = 0; a < 8 && clear; a++) {
      const t = (a / 8) * Math.PI * 2;
      for (let r = 0; r <= 260; r += 30) {
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
 * A body about to be bitten, marked as whichever sets name it — exactly as it
 * would be marked while it was still alive and playing that role — and then
 * turned through the real `convert`.
 *
 * **Converted well in the past, not "just now".** `convert` also sets the
 * ordinary "a fresh zombie comes up slow" stagger — `FRESH_ZOMBIE_SLOW_MS` at
 * `FRESH_ZOMBIE_SLOW_MUL` — which is a real mechanic and not what is under
 * test here. Reading `state.slowUntil` immediately after conversion measures
 * that instead of anything a shot did, so the turn is staged well outside the
 * window; the leftover `slowMul` from it is reset too; a stale 65% figure
 * sitting under `Math.min` would otherwise read as this shot's own stagger the
 * moment it happens to be more restrictive than the eased one being measured.
 */
function turn(id: string, sets: Array<(w: World, id: string) => void>): { world: World; e: Entity } | null {
  const world = createWorld();
  const spot = openSpot(world);
  if (!spot) return null;
  const e = makeEntity(id, 'officer', spot.x, spot.y);
  e.radius = PLAYER_RADIUS;
  world.entities.set(id, e);
  world.ai.set(id, newAiState(Date.now(), e.x, e.y));
  for (const mark of sets) mark(world, id);
  convert(world, e, Date.now() - FRESH_ZOMBIE_SLOW_MS * 10);
  // A blue officer's own turn carries no `AiState` at all any more — see
  // `convertOfficerToDog` — so this is skipped rather than asserted past.
  const state = world.ai.get(id);
  if (state) state.slowMul = 1;
  // The candidate list a shot is tested against is the spatial grid, not
  // `world.entities` directly — nothing populates it until this is called, the
  // same trap every other harness in this project already pays for.
  rebuildEntityGrid(world);
  return { world, e };
}

console.log('=== max health, through the real convert() ===');
{
  const base = ENTITY_MAX_HEALTH.zombie;
  const cases: Array<[string, Array<(w: World, id: string) => void>, number]> = [
    ['a fresh outbreak zombie (in no set at all)', [], base],
    ['a converted SWAT operator', [swat], Math.round(base * ZOMBIE_ELITE_HEALTH_MUL)],
    ['a converted soldier', [soldier], Math.round(base * ZOMBIE_ELITE_HEALTH_MUL)],
    ['SWAT that is also somehow dispatched', [swat, dispatched], Math.round(base * ZOMBIE_ELITE_HEALTH_MUL)],
    ['a converted ambient grey officer', [cityOfficer], Math.round(base * ZOMBIE_OFFICER_HEALTH_MUL)],
    ['a converted patrol-car rifleman', [rifleman], Math.round(base * ZOMBIE_OFFICER_HEALTH_MUL)],
    ['a converted van driver (dispatched, not swat)', [dispatched], Math.round(base * ZOMBIE_OFFICER_HEALTH_MUL)],
    // A blue officer's own turn is a dog now, not an ordinary shambler at all
    // — see `officerdog.ts` — so this no longer measures `zombieHealthFor`
    // the way every other row here does. Kept as a control anyway: it is
    // what says this table's own tiers stayed put for everybody else while
    // that one seat's fate changed underneath it.
    ['a converted bot officer (now a dog, not "unboosted")', [bot], DOG_MAX_HEALTH],
    ['an ordinary converted civilian', [], base],
  ];
  for (const [label, sets, want] of cases) {
    const staged = turn(`zh-${label}`, sets);
    if (!staged) {
      check(false, label, 'no open ground found to stage on');
      continue;
    }
    const { e } = staged;
    check(e.type === 'zombie', `${label}: actually converted`);
    check(e.maxHealth === want && e.health === want, label, `${e.health}/${e.maxHealth}hp, wanted ${want}`);
  }
}

console.log('\n=== the reported figures ===');
console.log(
  `  regular zombie ${ENTITY_MAX_HEALTH.zombie}hp` +
    `   SWAT/soldier zombie ${Math.round(ENTITY_MAX_HEALTH.zombie * ZOMBIE_ELITE_HEALTH_MUL)}hp` +
    `   grey officer zombie ${Math.round(ENTITY_MAX_HEALTH.zombie * ZOMBIE_OFFICER_HEALTH_MUL)}hp`,
);

console.log('\n=== staggers less: a bolt action round on each, through fire() ===');
{
  const def = ITEMS.boltRifle;
  const kinds: Array<[string, Array<(w: World, id: string) => void>]> = [
    ['ordinary zombie', []],
    ['converted SWAT operator', [swat]],
    ['converted soldier', [soldier]],
    ['converted grey officer', [cityOfficer]],
  ];
  const rows: Array<{ label: string; slowMs: number; slowMul: number }> = [];
  for (const [label, sets] of kinds) {
    const id = `st-${label}`;
    const staged = turn(id, sets);
    if (!staged) {
      console.log(`  (skipped ${label}: no open ground found to stage on)`);
      continue;
    }
    const { world, e } = staged;
    // Straight up from the target, at the range clear ground was checked to —
    // openSpot only guarantees 260px of it, so this has to stay well inside.
    const shooter = makeEntity('shooter', 'officer', e.x, e.y - 200);
    world.entities.set('shooter', shooter);
    const now = Date.now();
    fire(world, shooter, Math.PI / 2, 0, now, def);
    const state = world.ai.get(id)!;
    rows.push({ label, slowMs: state.slowUntil - now, slowMul: state.slowMul });
  }
  for (const r of rows) {
    console.log(
      `  ${r.label.padEnd(28)} slowed ${r.slowMs.toFixed(0)}ms at ${(r.slowMul * 100).toFixed(0)}% speed`,
    );
  }
  const byLabel = (l: string) => rows.find((r) => r.label === l);
  const ordinary = byLabel('ordinary zombie');
  check(ordinary !== undefined && ordinary.slowMs > 0, 'CONTROL: an ordinary zombie is staggered at all');
  for (const label of ['converted SWAT operator', 'converted soldier']) {
    const r = byLabel(label);
    if (!ordinary || !r) continue;
    check(r.slowMs < ordinary.slowMs, `${label}: shorter stagger than an ordinary zombie`);
    check(r.slowMul > ordinary.slowMul, `${label}: less slowed than an ordinary zombie`);
  }
  // Not asked for, and not given: a converted grey officer staggers exactly
  // like anyone else — only SWAT and soldiers were asked to shrug it off.
  const greyOfficer = byLabel('converted grey officer');
  if (ordinary && greyOfficer) {
    check(
      greyOfficer.slowMs === ordinary.slowMs && greyOfficer.slowMul === ordinary.slowMul,
      'converted grey officer: staggers the same as an ordinary zombie',
    );
  }
}

console.log(`\n${fails === 0 ? 'all checks passed' : `${fails} checks FAILED`}`);
