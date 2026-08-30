/**
 * Headless check that a body dies once. No socket, no port, so it leaves a game
 * on 8080 alone.
 *
 * Reported as *"shotguns are producing 2 corpses"*, and it was seven.
 * `world.entityGrid` is rebuilt once a tick and `removeEntity` takes a body out
 * of `world.entities` without touching it — so every pellet after the one that
 * killed still found the corpse in the broadphase, spent its damage on it, and
 * pushed another death record. The client draws one sprawled body per record,
 * all on the same pixel.
 *
 * Two halves, because the fault has two costs and only one of them was
 * reported: the corpses, and the **pellets absorbed by a body that is not there
 * any more** instead of carrying on to whatever is behind it.
 *
 * `setKillsCanRepeat` is the gate and it is kept: "one death, one corpse" means
 * nothing without "and it was seven".
 *
 *   npx tsx deathcheck.ts
 *
 * Not typechecked by `npx tsc --noEmit` in `server/` — that only includes
 * `src/**`. Check it explicitly:
 *   npx tsc --noEmit --target ES2022 --module ESNext --moduleResolution Bundler \
 *     --strict --skipLibCheck --types node deathcheck.ts
 */
import {
  createWorld,
  resetWorld,
  rebuildEntityGrid,
  makeEntity,
  newAiState,
  setKillsCanRepeat,
  type World,
  type Entity,
} from './src/world.js';
import { fire } from './src/combat.js';
import { ITEMS } from '../shared/items.js';
import { ENTITY_MAX_HEALTH } from '../shared/constants.js';

let checks = 0;
let failures = 0;
function check(ok: boolean, label: string, detail = ''): void {
  checks++;
  if (!ok) failures++;
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail ? '  - ' + detail : ''}`);
}

/**
 * An empty city with a clear lane in it, and the lane's near end.
 *
 * **Staged at a fixed spot this rig reported nonsense on about half of all
 * runs** — 0 corpses out of 8 pellets with the target's health untouched at
 * 400. `fire` runs its own hitscan against the walls, so a lane that happens to
 * cross a shop front on this city stops every round short and the whole
 * measurement is the map rather than the code. It is the same trap the other
 * harnesses here record, one step further along: the entity grid *was* rebuilt,
 * and the geometry still ate the shot.
 */
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

/** How far down the lane the furthest body stands, plus room behind it. */
const LANE = 320;

function zombie(world: World, id: string, x: number, y: number, health: number): Entity {
  const e = makeEntity(id, 'zombie', x, y);
  e.health = health;
  e.maxHealth = ENTITY_MAX_HEALTH.zombie;
  world.entities.set(id, e);
  world.ai.set(id, newAiState(Date.now(), x, y));
  return e;
}

/**
 * Empty a whole gun's worth of pellets down one line, as `fireHeld` does.
 *
 * **Every pellet is fired without rebuilding the grid**, which is the whole
 * point: they all land inside one tick, and the tick is what the broadphase is
 * a snapshot of.
 */
function volley(world: World, shooter: Entity, item: keyof typeof ITEMS, aim = 0): void {
  const def = ITEMS[item];
  const pellets = def.pellets ?? 1;
  for (let i = 0; i < pellets; i++) fire(world, shooter, aim, 0, Date.now(), def);
}

console.log('\n=== one body, one corpse ===');
const modes: Array<{ label: string; old: boolean }> = [
  { label: 'OLD', old: true },
  { label: 'NEW', old: false },
];
const deaths = new Map<string, number>();
const behind = new Map<string, number>();

for (const m of modes) {
  setKillsCanRepeat(m.old);

  // One zombie, one shell. It has to die on the first pellet for the rest to
  // have anything to hit — a shotgun pellet is 8-14, so 12 health is one.
  {
    const { world, x, y } = bare();
    const shooter = makeEntity('shooter', 'officer', x, y);
    world.entities.set('shooter', shooter);
    zombie(world, 'z', x + 120, y, 12);
    rebuildEntityGrid(world);
    world.deaths.length = 0;
    volley(world, shooter, 'shotgun');
    deaths.set(m.label, world.deaths.length);
  }

  // And one behind it, to see whether the rest of the shell gets through. Both
  // are on the line and both are one pellet from going down.
  {
    const { world, x, y } = bare();
    const shooter = makeEntity('shooter', 'officer', x, y);
    world.entities.set('shooter', shooter);
    zombie(world, 'near', x + 90, y, 8);
    zombie(world, 'far', x + 180, y, 8);
    rebuildEntityGrid(world);
    volley(world, shooter, 'shotgun');
    behind.set(m.label, world.entities.has('far') ? 0 : 1);
  }
}
setKillsCanRepeat(false);

const pellets = ITEMS.shotgun.pellets ?? 1;
console.log(`  a ${pellets}-pellet shell into one zombie:`);
for (const m of modes) console.log(`    ${m.label.padEnd(5)} ${deaths.get(m.label)} corpses`);
console.log(`  …and with a second zombie behind it:`);
for (const m of modes) {
  console.log(`    ${m.label.padEnd(5)} the one behind ${behind.get(m.label) ? 'went down' : 'survived'}`);
}

check(
  (deaths.get('OLD') ?? 0) > 1,
  'CONTROL: a shell used to leave a corpse per pellet',
  `${deaths.get('OLD')} of ${pellets}`,
);
check((deaths.get('NEW') ?? 0) > 0, 'and the shell actually landed', `${deaths.get('NEW')}`);
check(deaths.get('NEW') === 1, 'a shell leaves one corpse', `${deaths.get('NEW')}`);
check(
  behind.get('OLD') === 0,
  'CONTROL: the rest of the shell used to be absorbed by the body it had just killed',
);
check(behind.get('NEW') === 1, 'and now carries on to what is behind it');

// The guard is on the body, not on the gun, so it holds for anything that can
// land twice in a tick.
console.log('\n=== and anything else that lands twice in one tick ===');
{
  const { world, x, y } = bare();
  const shooter = makeEntity('shooter', 'officer', x, y);
  world.entities.set('shooter', shooter);
  zombie(world, 'z', x + 100, y, 10);
  rebuildEntityGrid(world);
  world.deaths.length = 0;
  volley(world, shooter, 'dualPistols');
  check(world.deaths.length === 1, 'two pistols, one corpse', `${world.deaths.length}`);
}
{
  const { world, x, y } = bare();
  const shooter = makeEntity('shooter', 'officer', x, y);
  world.entities.set('shooter', shooter);
  const z = zombie(world, 'z', x + 100, y, 400);
  rebuildEntityGrid(world);
  world.deaths.length = 0;
  // Rounds keep landing on a body with plenty of health, and only the one that
  // takes it under zero may push a record.
  for (let i = 0; i < 40; i++) fire(world, shooter, 0, 0, Date.now(), ITEMS.boltRifle);
  check(
    world.deaths.length === 1,
    'a body shot until it drops leaves one corpse',
    `${world.deaths.length}, health ended ${z.health}`,
  );
}

console.log(`\n${checks - failures}/${checks} checks passed${failures ? ` - ${failures} FAILED` : ''}`);
process.exit(failures ? 1 : 0);
