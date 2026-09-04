/**
 * Headless check on *"when a blue officer dies they turn into a zombie dog
 * with no abilities just the biting and the respawning for the zombie dog
 * that's currently in the game"*.
 *
 * No socket, no port — leaves a game on 8080 alone.
 *   npx tsx officerdog.ts
 *
 * Not typechecked by `npx tsc --noEmit` in `server/`, which only includes
 * `src`. Check it explicitly:
 *   npx tsc --noEmit --target ES2022 --module ESNext --moduleResolution Bundler
 *     --strict --skipLibCheck --types node officerdog.ts
 *
 * "Blue officer" is `isBlueOfficer`: a real player or a bot standing in one
 * of the five seats the lobby hands out, as against the grey ambient
 * garrison, the radio's own dispatched crews, SWAT or soldiers — none of
 * whom this touches, and the control below is what says so. Turning one
 * routes through `convertOfficerToDog` in place of the ordinary `convert`,
 * onto exactly the membership team 2's own seat already carries: `world.dogs`
 * for the body, the bite and the respawn out of the horde, plus
 * `world.officerDogs` for the one thing layered on top — no Q, no E, no F,
 * whoever or whatever is behind it.
 */
import {
  createWorld,
  resetWorld,
  rebuildEntityGrid,
  makeEntity,
  killEntity,
  hasWallClearPath,
  hasLineOfSight,
  type Entity,
  type World,
} from './src/world.js';
import { convert, driveOfficerDogAi } from './src/ai.js';
import { dogHudFor, startDogAbility, updateDogs } from './src/dog.js';
import { DOG_BIRTH_MS, DOG_DEATH_MS, DOG_MAX_HEALTH, ENTITY_MAX_HEALTH, TICK_RATE } from '../shared/constants.js';

const TICK_MS = 1000 / TICK_RATE;

let fails = 0;
function check(ok: boolean, label: string, detail = ''): void {
  if (!ok) fails++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? '  - ' + detail : ''}`);
}

/** Somewhere well clear of geometry — the map is not seeded, so found rather than assumed. */
function openSpot(world: World): { x: number; y: number } {
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
  throw new Error('no open ground found to stage on');
}

function rig(): { world: World; spot: { x: number; y: number }; clock: number } {
  const world = createWorld();
  resetWorld(world);
  // `resetWorld` populates a whole real city — the ordinary outbreak, the
  // garrison, hundreds of civilians — same as `emptyTheHorde` in
  // `roarcheck.ts` has to clear before staging anything of its own, and for
  // the same reason: a random shambler among five is a random shambler
  // `beginDogBirth` might pick over the one this file cares about, and a
  // stray civilian nearer than the one staged is a target this file didn't
  // ask for.
  world.entities.clear();
  world.ai.clear();
  return { world, spot: openSpot(world), clock: Date.now() };
}

/**
 * A spot `dist` off `from` with a straight, clear line back to it — clear to
 * *walk*, and clear to *see*, which are not the same test.
 *
 * `openSpot` only guarantees clearance in a ring of *sampled* rays round one
 * point — it says nothing about the line between two points, and the map is
 * not seeded, so a fixed offset is a wall on some rolls and open ground on
 * others. Found rather than assumed, the same rule every rig in this project
 * already follows. And a bush waves `hasWallClearPath` through — it is not a
 * wall — while `hasLineOfSight` (with no bush transparency, the same call
 * `driveOfficerDogAi`'s own target scan makes) refuses it; a spot clear to
 * walk to but hidden behind foliage is exactly the case that sent the dog
 * wandering off toward the nearest thing it *could* see instead.
 */
function clearApproach(world: World, from: { x: number; y: number }, dist: number): { x: number; y: number } {
  for (let i = 0; i < 64; i++) {
    const a = (i / 16) * Math.PI * 2;
    const x = from.x + Math.cos(a) * dist;
    const y = from.y + Math.sin(a) * dist;
    if (hasWallClearPath(world, from.x, from.y, x, y) && hasLineOfSight(world, from.x, from.y, x, y)) {
      return { x, y };
    }
  }
  throw new Error('no clear approach found to stage on');
}

function officer(world: World, id: string, x: number, y: number): Entity {
  const e = makeEntity(id, 'officer', x, y);
  world.entities.set(id, e);
  return e;
}

console.log('=== who turns into a dog, and who does not ===');
{
  const { world, spot, clock } = rig();

  const botId = 'bot-0';
  const bot = officer(world, botId, spot.x, spot.y);
  world.bots.add(botId);
  convert(world, bot, clock);
  check(bot.type === 'zombie', 'a bot officer: actually converted');
  check(world.dogs.has(botId), 'a bot officer: joined world.dogs');
  check(world.officerDogs.has(botId), 'a bot officer: joined world.officerDogs');
  check(bot.maxHealth === DOG_MAX_HEALTH && bot.health === DOG_MAX_HEALTH, 'a bot officer: dog health', `${bot.health}/${bot.maxHealth}`);

  const playerId = 'player-0';
  const player = officer(world, playerId, spot.x + 40, spot.y);
  world.playerIds.add(playerId);
  convert(world, player, clock);
  check(player.type === 'zombie', 'a real player officer: actually converted');
  check(world.dogs.has(playerId), 'a real player officer: joined world.dogs');
  check(world.officerDogs.has(playerId), 'a real player officer: joined world.officerDogs');

  // The control: the grey garrison, a dispatched crew, SWAT and a soldier are
  // all `type: 'officer'` too, and none of them is a blue officer.
  const controls: Array<[string, (id: string) => void]> = [
    ['a grey ambient officer', (id) => world.cityOfficers.add(id)],
    ['a dispatched patrol-car rifleman', (id) => world.dispatched.add(id)],
    ['a SWAT operator', (id) => world.swat.add(id)],
    ['a soldier', (id) => world.soldiers.add(id)],
    ['an ordinary officer in no set at all', () => {}],
  ];
  for (const [label, mark] of controls) {
    const id = `ctrl-${label}`;
    const e = officer(world, id, spot.x + 80, spot.y);
    mark(id);
    convert(world, e, clock);
    check(e.type === 'zombie', `${label}: still converted`);
    check(!world.dogs.has(id) && !world.officerDogs.has(id), `${label}: NOT a dog`, `dogs=${world.dogs.has(id)} officerDogs=${world.officerDogs.has(id)}`);
    check(e.maxHealth !== DOG_MAX_HEALTH || e.maxHealth === ENTITY_MAX_HEALTH.zombie, `${label}: not dog health`, `${e.maxHealth}`);
  }

  // And the ordinary population: civilians turning stays exactly what it was.
  const civId = 'civ-control';
  const civ = makeEntity(civId, 'human', spot.x, spot.y + 40);
  world.entities.set(civId, civ);
  convert(world, civ, clock);
  check(civ.type === 'zombie' && !world.dogs.has(civId), 'a civilian: ordinary conversion, not a dog');
}

console.log('\n=== no abilities, whatever the cooldowns and unlocks say ===');
{
  const { world, spot, clock } = rig();
  const id = 'bot-noability';
  const bot = officer(world, id, spot.x, spot.y);
  world.bots.add(id);
  convert(world, bot, clock);

  // Wide open: no cooldown ever set, and the morph/spit unlock thresholds
  // dropped to nothing, so an ordinary dog would freely have all three.
  world.dogAbilitiesFree = true;
  world.offline = true;

  for (const slot of [0, 1, 2, 3]) {
    const result = startDogAbility(world, id, slot, clock);
    check(result === 'refused', `slot ${slot}: refused`, result);
  }

  const hud = dogHudFor(world, id, clock);
  check(hud !== null, 'still has a dog HUD at all');
  if (hud) {
    check(
      hud.abilities.every((a) => a === null),
      'every hexagon is empty',
      JSON.stringify(hud.abilities),
    );
  }
  world.dogAbilitiesFree = false;
}

console.log('\n=== a bot-driven dog actually hunts, with nobody at the keyboard ===');
{
  // `openSpot` only checks that a body can *walk* clear of the spot it
  // picks — bushes don't block that, so it can (rarely) land somewhere deep
  // enough in foliage that no direction at all has a clean sighting line out
  // of it. Rather than assume one roll will do, this tries a few.
  let world: World | null = null;
  let spot: { x: number; y: number } | null = null;
  let clock = 0;
  let preySpot: { x: number; y: number } | null = null;
  for (let attempt = 0; attempt < 8 && !preySpot; attempt++) {
    const staged = rig();
    try {
      preySpot = clearApproach(staged.world, staged.spot, 180);
      world = staged.world;
      spot = staged.spot;
      clock = staged.clock;
    } catch {
      // Try again on a fresh city.
    }
  }
  if (!world || !spot || !preySpot) {
    check(false, 'closed in and got a bite on the only person in sight', 'no clear sighting line found to stage on');
  } else {
    const id = 'bot-hunt';
    const bot = officer(world, id, spot.x, spot.y);
    world.bots.add(id);
    convert(world, bot, clock);

    const preyId = 'prey';
    const prey = makeEntity(preyId, 'human', preySpot.x, preySpot.y);
    world.entities.set(preyId, prey);

    let now = clock;
    let caught = false;
    for (let i = 0; i < 400 && !caught; i++) {
      now += TICK_MS;
      rebuildEntityGrid(world);
      driveOfficerDogAi(world, now, TICK_MS / 1000);
      updateDogs(world, TICK_MS / 1000, now);
      if (world.grapples.has(preyId) || world.pendingInfections.has(preyId)) caught = true;
    }
    const dogEntity = world.entities.get(id)!;
    const closed = Math.hypot(dogEntity.x - spot.x, dogEntity.y - spot.y);
    check(caught, 'closed in and got a bite on the only person in sight', `moved ${closed.toFixed(0)}px`);
  }
}

console.log('\n=== it dies, and it rises again out of the horde — same as the seat it borrowed ===');
{
  const { world, spot, clock } = rig();
  const id = 'bot-respawn';
  const bot = officer(world, id, spot.x, spot.y);
  world.bots.add(id);
  convert(world, bot, clock);

  // Horde fodder to rise out of, well clear of the dog itself.
  const hostId = 'shambler-host';
  const host = makeEntity(hostId, 'zombie', spot.x + 220, spot.y + 40);
  world.entities.set(hostId, host);

  let now = clock;
  rebuildEntityGrid(world);
  killEntity(world, world.entities.get(id)!, now);
  check(world.dogDeaths.has(id), 'killed: down, waiting to rise');
  check(world.entities.get(id) !== undefined, 'killed: still holds an entity (a corpse to look at)');
  check(world.entities.get(id)!.health === 0, 'killed: health at zero');

  now += DOG_DEATH_MS + TICK_MS * 2;
  rebuildEntityGrid(world);
  driveOfficerDogAi(world, now, TICK_MS / 1000);
  updateDogs(world, TICK_MS / 1000, now);
  check(world.dogBirths.has(id), 'death window up: began coming out of the shambler');
  // Not spent yet — the host convulses for a whole `DOG_BIRTH_MS` before it
  // bursts, which is the point of a birth window at all: see `beginDogBirth`.
  check(world.entities.has(hostId), 'death window up: still convulsing, not spent yet');

  now += DOG_BIRTH_MS + TICK_MS * 2;
  rebuildEntityGrid(world);
  driveOfficerDogAi(world, now, TICK_MS / 1000);
  updateDogs(world, TICK_MS / 1000, now);
  const risen = world.entities.get(id);
  check(!world.dogBirths.has(id), 'birth window up: no longer coming out');
  check(!world.entities.has(hostId), 'birth window up: the host is spent');
  check(risen !== undefined && risen.health === risen.maxHealth, 'birth window up: back on full health');
  check(world.dogs.has(id), 'risen: still the same dog seat');
  check(world.officerDogs.has(id), 'risen: still a blue officer\'s dog, not team 2\'s own');
  check(startDogAbility(world, id, 0, now) === 'refused', 'risen: still no abilities');
}

console.log('\n=== a real connection keeps its own hand on the controls ===');
{
  const { world, spot, clock } = rig();
  const id = 'player-keeps-input';
  const player = officer(world, id, spot.x, spot.y);
  world.playerIds.add(id);
  convert(world, player, clock);

  const mine = {
    input: { up: true, down: false, left: false, right: false },
    aim: 1.23,
    aimX: 999,
    aimY: 888,
    shooting: true,
    sprint: false,
    interact: false,
    rightDown: false,
  };
  world.commands.set(id, mine);
  driveOfficerDogAi(world, clock + TICK_MS, TICK_MS / 1000);
  check(world.commands.get(id) === mine, 'a live connection\'s own command is left untouched');
}

console.log('\n=== a restart drops the borrowed seat, not the real one ===');
{
  const { world, spot, clock } = rig();
  const botId = 'bot-reset';
  const bot = officer(world, botId, spot.x, spot.y);
  world.bots.add(botId);
  convert(world, bot, clock);
  check(world.dogs.has(botId) && world.officerDogs.has(botId), 'staged: a dog before the restart');

  resetWorld(world);
  check(!world.dogs.has(botId), 'after resetWorld: no longer in world.dogs');
  check(!world.officerDogs.has(botId), 'after resetWorld: no longer in world.officerDogs');
}

console.log(`\n${fails === 0 ? 'all checks passed' : `${fails} checks FAILED`}`);
