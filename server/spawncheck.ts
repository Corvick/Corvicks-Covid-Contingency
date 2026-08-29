/**
 * Headless check that nothing on the outbreak's side starts indoors. No socket,
 * no port, so it leaves a game on 8080 alone.
 *
 * Reported as *"don't let zombies or the zombie dog start in a building"*, and
 * the three ways in are not equally at fault — which is why the run reports all
 * three separately rather than one number:
 *
 *  - **The initial outbreak was already right.** It walks inward off the edge
 *    until it is out in the open, and measured 0 of 100 indoors before anything
 *    changed. What it lacked was a floor under that walk: the loop *ends* after
 *    forty steps rather than failing, so a body was quietly left wherever it
 *    had got to.
 *  - **The breach point had the same hole**, and it does show: 1 of 240.
 *  - **The dog was the real one, at 20 of 100.** `findSpawnNear` only ever
 *    checked geometry and other bodies, and a room's floor is clear of both.
 *  - **And a dog's next life** comes out of a shambler that may well be inside
 *    a house — and the shamblers most likely to be indoors are the ones pressed
 *    against a shut door, which is the black-screen fault CLAUDE.md records
 *    under **Known open issue**.
 *
 * `setSpawnsIgnoreBuildings` is the gate and it is kept: the control is the
 * whole value of the run, and both modes run in ONE process on the same cities.
 *
 *   npx tsx spawncheck.ts
 *   RUNS=20 npx tsx spawncheck.ts
 *
 * Not typechecked by `npx tsc --noEmit` in `server/` — that only includes
 * `src/**`. Check it explicitly:
 *   npx tsc --noEmit --target ES2022 --module ESNext --moduleResolution Bundler \
 *     --strict --skipLibCheck --types node spawncheck.ts
 */
import {
  createWorld,
  resetWorld,
  rebuildEntityGrid,
  buildingIndexAt,
  breachSpawnPoint,
  spawnAtBreach,
  spawnDog,
  beginDogBirth,
  makeEntity,
  newAiState,
  setSpawnsIgnoreBuildings,
  type World,
} from './src/world.js';

const RUNS = Number(process.env.RUNS ?? 12);
/** Dogs spawned per city — the fault was one in five, so a handful is not enough. */
const DOGS = 10;
/** Breach points sampled per city, fanned either side like a summons. */
const BREACHES = 20;
/** Births staged per city. */
const BIRTHS = 12;

let checks = 0;
let failures = 0;
function check(ok: boolean, label: string, detail = ''): void {
  checks++;
  if (!ok) failures++;
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail ? '  - ' + detail : ''}`);
}

interface Count {
  indoors: number;
  total: number;
}
const zero = (): Count => ({ indoors: 0, total: 0 });
function bump(c: Count, indoors: boolean): void {
  c.total++;
  if (indoors) c.indoors++;
}
const pct = (c: Count): string =>
  `${c.indoors}/${c.total}${c.total ? ` (${((c.indoors / c.total) * 100).toFixed(1)}%)` : ''}`;

interface Mode {
  outbreak: Count;
  breach: Count;
  summon: Count;
  dog: Count;
  birth: Count;
  /** Births that found no host at all — the one thing that must never rise. */
  refused: number;
}
const blank = (): Mode => ({
  outbreak: zero(),
  breach: zero(),
  summon: zero(),
  dog: zero(),
  birth: zero(),
  refused: 0,
});

const indoors = (world: World, x: number, y: number): boolean => buildingIndexAt(world, x, y) >= 0;

/**
 * A shambler in a room, so the birth has something wrong to pick.
 *
 * **Staged rather than waited for.** A fresh city has five zombies in it and
 * all five are out in the street by construction, so a rig that just called
 * `beginDogBirth` would find nothing but correct answers and pass in both
 * modes — measuring the outbreak's own spawn rule twice over rather than the
 * host choice. Half the horde is put indoors on purpose.
 */
function stageHorde(world: World, now: number): { inside: number; outside: number } {
  let inside = 0;
  let outside = 0;
  for (const b of world.map.buildings) {
    if (inside >= 12) break;
    for (const r of b.rects) {
      const x = r.x + r.w / 2;
      const y = r.y + r.h / 2;
      if (!indoors(world, x, y)) continue;
      const id = `in-${inside}`;
      world.entities.set(id, makeEntity(id, 'zombie', x, y));
      world.ai.set(id, newAiState(now, x, y));
      inside++;
      break;
    }
  }
  for (const e of world.entities.values()) {
    if (e.type === 'zombie' && !indoors(world, e.x, e.y)) outside++;
  }
  rebuildEntityGrid(world);
  return { inside, outside };
}

function runMode(old: boolean, out: Mode): { stagedInside: number; stagedOutside: number } {
  setSpawnsIgnoreBuildings(old);
  let stagedInside = 0;
  let stagedOutside = 0;

  for (let run = 0; run < RUNS; run++) {
    const world = createWorld();
    resetWorld(world);
    const now = Date.now();

    for (const e of world.entities.values()) {
      if (e.type === 'zombie') bump(out.outbreak, indoors(world, e.x, e.y));
    }

    for (let k = 0; k < BREACHES; k++) {
      const spot = breachSpawnPoint(world, (k - BREACHES / 2) * 34);
      bump(out.breach, indoors(world, spot.x, spot.y));
    }

    // The roar's summons goes through the same point, so this is the same rule
    // seen from the caller that actually puts bodies down.
    for (const e of spawnAtBreach(world, 8, now)) {
      bump(out.summon, indoors(world, e.x, e.y));
      world.entities.delete(e.id);
      world.ai.delete(e.id);
    }

    for (let d = 0; d < DOGS; d++) {
      const id = `dog-${d}`;
      spawnDog(world, id);
      const dog = world.entities.get(id)!;
      bump(out.dog, indoors(world, dog.x, dog.y));
      world.entities.delete(id);
      world.dogs.delete(id);
    }

    const staged = stageHorde(world, now);
    stagedInside += staged.inside;
    stagedOutside += staged.outside;
    for (let b = 0; b < BIRTHS; b++) {
      const dog = makeEntity(`birth-dog-${b}`, 'zombie', 100, 100);
      world.entities.set(dog.id, dog);
      if (!beginDogBirth(world, dog, now)) {
        out.refused++;
      } else {
        const birth = world.dogBirths.get(dog.id)!;
        const host = world.entities.get(birth.hostId)!;
        bump(out.birth, indoors(world, host.x, host.y));
        world.dogBirths.delete(dog.id);
      }
      world.entities.delete(dog.id);
    }
  }
  return { stagedInside, stagedOutside };
}

const oldMode = blank();
const newMode = blank();
const stagedOld = runMode(true, oldMode);
const stagedNew = runMode(false, newMode);
setSpawnsIgnoreBuildings(false);

console.log(`\n=== indoors, out of every spawn ===  (${RUNS} cities each)`);
const rows: Array<[string, keyof Mode]> = [
  ['the initial outbreak', 'outbreak'],
  ['a breach point', 'breach'],
  ["the roar's summons", 'summon'],
  ['a dog joining a round', 'dog'],
  ["a dog's next life", 'birth'],
];
for (const [label, key] of rows) {
  console.log(
    `  ${label.padEnd(24)} OLD ${pct(oldMode[key] as Count).padEnd(18)} NEW ${pct(newMode[key] as Count)}`,
  );
}
console.log(
  `  hosts staged: OLD ${stagedOld.stagedInside} indoors / ${stagedOld.stagedOutside} out - ` +
    `NEW ${stagedNew.stagedInside} indoors / ${stagedNew.stagedOutside} out`,
);

console.log('');
// The control first. Without it "0 indoors" is satisfied just as well by a rig
// that never sampled anything, or by a city with no buildings near the edge.
check(
  oldMode.dog.indoors > 0,
  'CONTROL: a dog used to come into the round indoors',
  pct(oldMode.dog),
);
check(
  oldMode.birth.indoors > 0,
  'CONTROL: and used to rise indoors',
  pct(oldMode.birth),
);
check(stagedNew.stagedInside > 0, 'CONTROL: indoor shamblers were staged to choose wrong from', `${stagedNew.stagedInside}`);

check(newMode.outbreak.indoors === 0, 'the initial outbreak starts in the street', pct(newMode.outbreak));
check(newMode.breach.indoors === 0, 'every breach point is in the street', pct(newMode.breach));
check(newMode.summon.indoors === 0, "the roar's summons walks in off the street", pct(newMode.summon));
check(newMode.dog.indoors === 0, 'a dog joins the round in the street', pct(newMode.dog));
check(newMode.birth.indoors === 0, "and takes its next life out of a body in the street", pct(newMode.birth));
check(
  newMode.refused === 0 && oldMode.refused === 0,
  'and no birth was refused for want of a host',
  `${newMode.refused} refused`,
);

console.log(`\n${checks - failures}/${checks} checks passed${failures ? ` - ${failures} FAILED` : ''}`);
process.exit(failures ? 1 : 0);
