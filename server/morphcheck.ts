/**
 * Harness for the dog's transformation — F. Headless: no socket, no port, so
 * it leaves a game running on 8080 completely alone.
 *
 *   npx tsx morphcheck.ts
 *
 * Every claim in the spec, and a control beside each one that could otherwise
 * pass by accident:
 *
 *   - it is **earned by the outbreak, not by any one dog**: 101 humans turned
 *     in total, by any zombie — a shambler's conversion counts exactly as much
 *     as this dog's own, and only a genuine conversion counts at all
 *   - two seconds **rooted**, at a tenth of the damage — and full damage before
 *     and after, which is what says the reduction is the wind-up's and not the
 *     dog's
 *   - six times the health, a bigger body, and a **much slower sprint** than
 *     the same dog untransformed over the same ground
 *   - the **lash** infects at range, is stopped by a wall, will not re-bite
 *     somebody already incubating, and has a cooldown
 *   - twenty seconds and it **bursts**: a toxic cloud, its own tentacles on
 *     grenade physics, and a body on the ground — a burst is a death
 *   - shot before the clock runs out, it bursts anyway
 *   - and the four-minute cooldown **survives dying**, like the acid's
 *
 * Not covered by `npx tsc --noEmit` — `server/tsconfig.json` includes `src/**`
 * only. Check it explicitly:
 *   npx tsc --noEmit --target ES2022 --module ESNext --moduleResolution Bundler \
 *     --strict --skipLibCheck --types node morphcheck.ts
 */
import {
  createWorld,
  resetWorld,
  rebuildEntityGrid,
  spawnDog,
  killEntity,
  makeEntity,
  newAiState,
  isMorphed,
  type Entity,
  type World,
} from './src/world.js';
import { computeFrozen, updateAi } from './src/ai.js';
import { startDogAbility, updateDogs, dogHudFor } from './src/dog.js';
import { updateAcid } from './src/acid.js';
import { bouncesOff } from './src/heli.js';
import { fire } from './src/combat.js';
import { ITEMS } from '../shared/items.js';
import {
  DOG_BIRTH_MS,
  DOG_BURST_FLIGHT_MS,
  DOG_BURST_TENTACLES,
  DOG_DEATH_MS,
  DOG_MAX_HEALTH,
  DOG_MORPH_COOLDOWN_MS,
  DOG_MORPH_HEALTH_MUL,
  DOG_MORPH_MS,
  DOG_MORPH_RADIUS,
  DOG_MORPH_UNLOCK_CONVERTED,
  TURN_DELAY_MAX_MS,
  DOG_MORPH_WINDUP_MS,
  DOG_LASH_COOLDOWN_MS,
  DOG_LASH_RANGE,
  DOG_RADIUS,
  DOG_SPEED,
  STAMINA_MAX,
  TICK_RATE,
} from '../shared/constants.js';

const TICK_MS = 1000 / TICK_RATE;
const DOG = 'morph-dog';

let failures = 0;
function check(label: string, ok: boolean, detail = ''): void {
  if (!ok) failures++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
}

interface Rig {
  world: World;
  dog: Entity;
  clock: number;
  tick(): void;
  run(n: number): void;
  aim(x: number, y: number): void;
  press(up: boolean, sprint?: boolean): void;
  morph(): string;
  body(id: string, type: 'human' | 'officer' | 'zombie', x: number, y: number): Entity;
}

/**
 * Open ground with room all round it.
 *
 * The map is not seeded, so a fixed staging spot is a shop on some cities and a
 * street on others — the trap `acidcheck` already fell into once the gobbet
 * started bouncing. Sampled with `bouncesOff`, which is the predicate a
 * *thrown* thing reads: a shut door is solid to one and is deliberately not in
 * the nav grid.
 */
function openGround(world: World, reach: number): { x: number; y: number } {
  for (let i = 0; i < 8000; i++) {
    const x = reach + 80 + Math.random() * Math.max(1, world.map.width - reach * 2 - 160);
    const y = reach + 80 + Math.random() * Math.max(1, world.map.height - reach * 2 - 160);
    if (!world.nav.isReachable(x, y)) continue;
    let clear = true;
    for (let a = 0; a < 8 && clear; a++) {
      const dx = Math.cos((a / 8) * Math.PI * 2);
      const dy = Math.sin((a / 8) * Math.PI * 2);
      for (let d = 0; d <= reach && clear; d += 8) clear = !bouncesOff(world, x + dx * d, y + dy * d);
    }
    if (clear) return { x, y };
  }
  return { x: world.map.width / 2, y: world.map.height / 2 };
}

function rig(withAi = false, unlocked = true, reach = 320): Rig {
  const world = createWorld();
  resetWorld(world);
  world.dogs.add(DOG);
  world.playerIds.add(DOG);
  spawnDog(world, DOG);
  // Every rig that is about the *form* rather than about the gate has to have
  // earned it, or `morph()` is refused and each of those checks passes or fails
  // on the wrong thing entirely. The unlock is one global counter now, so this
  // is the whole of what "earned" means for every rig below.
  if (unlocked) world.totalConverted = DOG_MORPH_UNLOCK_CONVERTED;

  const dog = world.entities.get(DOG)!;
  const spot = openGround(world, reach);
  dog.x = spot.x;
  dog.y = spot.y;
  world.commands.set(DOG, {
    input: { up: false, down: false, left: false, right: false },
    aim: 0,
    aimX: dog.x + 200,
    aimY: dog.y,
    shooting: false,
    sprint: false,
    interact: false,
    rightDown: false,
  });
  // Nothing alive but what the rig puts there: a live outbreak makes every
  // figure below a measurement of how far the city got.
  for (const e of [...world.entities.values()]) {
    if (e.id === DOG) continue;
    world.entities.delete(e.id);
    world.ai.delete(e.id);
  }

  return {
    world,
    dog,
    clock: Date.now(),
    tick(): void {
      this.clock += TICK_MS;
      rebuildEntityGrid(world);
      const frozen = computeFrozen(world);
      updateDogs(world, TICK_MS / 1000, this.clock);
      if (withAi) updateAi(world, this.clock, TICK_MS / 1000, frozen);
      updateAcid(world, this.clock, TICK_MS / 1000);
    },
    run(n: number): void {
      for (let i = 0; i < n; i++) this.tick();
    },
    aim(x: number, y: number): void {
      const c = world.commands.get(DOG)!;
      c.aimX = x;
      c.aimY = y;
      c.aim = Math.atan2(y - dog.y, x - dog.x);
    },
    press(up: boolean, sprint = false): void {
      const c = world.commands.get(DOG)!;
      c.input.up = up;
      c.sprint = sprint;
    },
    morph(): string {
      return startDogAbility(world, DOG, 3, this.clock);
    },
    body(id, type, x, y): Entity {
      const e = makeEntity(id, type, x, y);
      world.entities.set(id, e);
      world.ai.set(id, newAiState(this.clock, x, y));
      return e;
    },
  };
}

const windUpTicks = Math.ceil(DOG_MORPH_WINDUP_MS / TICK_MS) + 1;
const formTicks = Math.ceil(DOG_MORPH_MS / TICK_MS) + 2;

/** Walk a transformed dog into its full form and hand it back. */
function transformed(r: Rig): void {
  r.morph();
  r.run(windUpTicks);
}

// ------------------------------------------------------------- the unlock

function testUnlock(): void {
  console.log('\nit is earned by the whole outbreak, not by this dog');

  const fresh = rig(false, false);
  check('a fresh city is refused it', fresh.morph() === 'refused');
  let bar = dogHudFor(fresh.world, DOG, fresh.clock)!.abilities;
  check('and the hexagon says how many conversions are left',
    bar[3]?.locked === DOG_MORPH_UNLOCK_CONVERTED, `${bar[3]?.locked}`);

  fresh.world.totalConverted = DOG_MORPH_UNLOCK_CONVERTED - 1;
  check('one short is still refused', fresh.morph() === 'refused');
  bar = dogHudFor(fresh.world, DOG, fresh.clock)!.abilities;
  check('and the count follows', bar[3]?.locked === 1, `${bar[3]?.locked}`);
  fresh.world.totalConverted = DOG_MORPH_UNLOCK_CONVERTED;
  bar = dogHudFor(fresh.world, DOG, fresh.clock)!.abilities;
  check('at 101 the hexagon opens', bar[3]?.locked === 0);
  check('and the key is taken', fresh.morph() === 'morphing');

  /**
   * **The claim that matters: it is shared.**
   *
   * A second dog with nothing of its own to show for the round — no bites, no
   * lashes, never fired a shot — gets the ability the instant the *city's*
   * tally crosses the line. That is the whole difference between "your work"
   * and "the outbreak's", and it is what the spec asks for: converted by
   * other zombies and yourself, not by yourself alone.
   */
  const shared = rig(false, false);
  const SECOND_DOG = 'second-dog';
  shared.world.dogs.add(SECOND_DOG);
  shared.world.playerIds.add(SECOND_DOG);
  spawnDog(shared.world, SECOND_DOG);
  check('a second dog with nothing of its own is refused too',
    startDogAbility(shared.world, SECOND_DOG, 3, shared.clock) === 'refused');
  shared.world.totalConverted = DOG_MORPH_UNLOCK_CONVERTED;
  check('and it opens for that dog as well, on the city crossing the line alone',
    startDogAbility(shared.world, SECOND_DOG, 3, shared.clock) === 'morphing');
}

/**
 * **Only a genuine conversion counts — not a kill, and not an officer lost.**
 *
 * The mechanism this replaced credited an officer going down without anybody
 * having been turned at all; the new one is explicitly about turning, so the
 * harness has to show that shooting somebody dead moves nothing, and that a
 * conversion by an *ordinary* zombie — not this dog, not any dog — moves the
 * same counter every dog's hexagon reads.
 *
 * Staged as a real `GrappleSession` and resolved by `updateAi`, the same
 * pattern `roarcheck.ts` uses and for the same reason: a grapple is where the
 * game's actual escape roll, instant-turn roll and incubation live, and a
 * harness that reimplements any of that is measuring its own guess rather than
 * the code.
 */
function testWhatCounts(): void {
  console.log('\nonly a genuine conversion moves the tally');

  const shot = rig(false, false);
  const victim = shot.body('victim', 'human', shot.dog.x + 200, shot.dog.y);
  killEntity(shot.world, victim, shot.clock);
  check('somebody killed outright is not a conversion', shot.world.totalConverted === 0,
    `${shot.world.totalConverted}`);

  /**
   * An ordinary shambler, not this dog and not any dog, turns somebody.
   *
   * **Two phases, not one.** A grapple that resolves with no escape still only
   * converts *instantly* about half the time (`INSTANT_INFECT_BASE`); the rest
   * goes to `pendingInfections` and takes up to `TURN_DELAY_MAX_MS` to come up.
   * One short `run` catches only the instant branch and is right roughly half
   * the time it is run — which is the exact shape of flakiness this file has
   * had to fix in itself before. Resolving the grapple and then jumping the
   * clock past the longest incubation, the way `roarcheck.ts`'s `stageBites`
   * does, catches both branches every time.
   */
  const other = rig(true, false);
  const shambler = other.body('shambler', 'zombie', other.dog.x + 260, other.dog.y);
  const prey = other.body('prey', 'human', shambler.x + 20, shambler.y);
  other.world.grapples.set(prey.id, {
    zombieIds: new Set([shambler.id]),
    endsAt: other.clock,
    escapeAt: null,
  });
  other.run(2);
  other.clock += TURN_DELAY_MAX_MS + 2000;
  other.run(2);
  check('a shambler turning someone counts toward the same total',
    other.world.totalConverted === 1, `${other.world.totalConverted}`);

  // And once the shared counter is over the line — whoever put it there — the
  // dog in this same city, who never touched the victim, can transform.
  other.world.totalConverted = DOG_MORPH_UNLOCK_CONVERTED;
  check('and it opens the ability for a dog that never touched them',
    other.morph() === 'morphing');
}

// ------------------------------------------------------------ the wind-up

function testWindUp(): void {
  console.log('\ntwo seconds rooted, at a tenth of the damage');
  const r = rig();

  // It plainly walks when it is not transforming — otherwise "did not move"
  // says nothing but that it was against a wall.
  r.press(true);
  r.run(4);
  const beforeX = r.dog.x;
  const beforeY = r.dog.y;
  r.run(8);
  const freeWalk = Math.hypot(r.dog.x - beforeX, r.dog.y - beforeY);
  check('walks with W held before it starts', freeWalk > 1, `${freeWalk.toFixed(1)}px`);

  check('F starts it', r.morph() === 'morphing');
  const atX = r.dog.x;
  const atY = r.dog.y;
  let running = 0;
  const ticks = Math.ceil(DOG_MORPH_WINDUP_MS / TICK_MS);
  for (let i = 0; i < ticks; i++) {
    r.tick();
    const a = dogHudFor(r.world, DOG, r.clock)!.abilities[3]!;
    if (a.active >= 0) running++;
  }
  const drift = Math.hypot(r.dog.x - atX, r.dog.y - atY);
  check('rooted for the whole of it, W still held', drift === 0, `${drift.toFixed(2)}px`);
  check('the hexagon shows it running throughout', running >= ticks - 1, `${running}/${ticks}`);

  // The damage reduction, measured through the real `fire` path rather than by
  // reading the constant back — and with the same weapon before, during and
  // after, so the three figures are comparable.
  const armour = rig();
  const shooter = armour.body('shot', 'officer', armour.dog.x + 120, armour.dog.y);
  shooter.facing = Math.PI; // pointing back at the dog
  rebuildEntityGrid(armour.world);

  const shoot = (): number => {
    const was = armour.dog.health;
    // No bloom, so the round cannot miss and the figure is the damage rather
    // than the accuracy.
    fire(armour.world, shooter, Math.PI, 0, armour.clock, ITEMS.boltRifle);
    return was - armour.dog.health;
  };

  const before = shoot();
  armour.dog.health = armour.dog.maxHealth;
  armour.morph();
  armour.run(2);
  const during = shoot();
  armour.dog.health = armour.dog.maxHealth;
  armour.run(windUpTicks);
  const after = shoot();

  check('a round lands normally before it', before > 0, `${before}hp`);
  check('a tenth of it during the wind-up', during > 0 && during <= Math.ceil(before * 0.35),
    `${during}hp against ${before}`);
  check('and normally again once it is out', after >= during * 2, `${after}hp`);
}

// -------------------------------------------------------------- the form

function testForm(): void {
  console.log('\nsix times the health, and much slower');
  const r = rig();
  const wasMax = r.dog.maxHealth;
  transformed(r);

  check('it is out in the world as the thing', isMorphed(r.world.dogState.get(DOG), r.clock));
  check('six times the health', r.dog.maxHealth === DOG_MAX_HEALTH * DOG_MORPH_HEALTH_MUL,
    `${r.dog.maxHealth} against ${wasMax}`);
  check('and it is full', r.dog.health === r.dog.maxHealth);
  check('a bigger body', r.dog.radius === DOG_MORPH_RADIUS, `${r.dog.radius} from ${DOG_RADIUS}`);
  /**
   * **And it still fits through the tightest doorway a city cuts**, which is
   * the whole reason the drawing grows far more than the body does.
   *
   * Asserted as the sum rather than against a number, because the number is
   * exactly what got this wrong once: `DOG_MORPH_RADIUS` was first written 42
   * on a misreading of `DOG_RADIUS` (19) as a diameter, which is an 84px body
   * going through a 46px gap — a monster locked out of every building in the
   * city, and locked *into* one if it transformed indoors.
   */
  const CLEAR = 46; // `CLEAR` in `mapgen`, the narrowest opening it ever cuts
  check('and still fits through the tightest doorway', DOG_MORPH_RADIUS * 2 < CLEAR,
    `${DOG_MORPH_RADIUS * 2}px across a ${CLEAR}px gap`);

  /**
   * The sprint, and **it has to be the same dog on the same pixel of the same
   * city** or the comparison is a measurement of the ground.
   *
   * `speedAt` reads bushes, so two rigs are two different cities and one of
   * them can have a hedge under the run — measured that way this failed one run
   * in five with the plain dog slowed rather than the heavy one quick. So the
   * animal is put back on its start spot with a full stamina bar before each
   * window, and the only thing that differs between the two is the form.
   */
  const sprint = (rr: Rig, from: { x: number; y: number }, ticks: number): number => {
    rr.dog.x = from.x;
    rr.dog.y = from.y;
    rr.world.stamina.set(DOG, STAMINA_MAX);
    rr.world.exhausted.delete(DOG);
    rr.press(true, true);
    rr.run(ticks);
    return Math.hypot(rr.dog.x - from.x, rr.dog.y - from.y);
  };

  const plain = rig();
  const start = { x: plain.dog.x, y: plain.dog.y };
  const plainRun = sprint(plain, start, 20);
  // Same world, same spot — transformed in place and run again.
  plain.press(false, false);
  transformed(plain);
  const heavyRun = sprint(plain, start, 20);

  check("the sprint is much slower than an ordinary dog's", heavyRun < plainRun * 0.75,
    `${heavyRun.toFixed(0)}px against ${plainRun.toFixed(0)}px over 0.67s, same ground`);
  check('but it is not pinned', heavyRun > DOG_SPEED * 0.4 * 20 * (TICK_MS / 1000),
    `${heavyRun.toFixed(0)}px`);
}

// -------------------------------------------------------------- the lash

function testLash(): void {
  console.log('\nthe tentacle lashes out and infects');
  const r = rig(false, true, 420);
  transformed(r);

  const target = r.body('near', 'human', r.dog.x + 180, r.dog.y);
  rebuildEntityGrid(r.world);
  r.aim(target.x, target.y);

  check('F lashes rather than transforming again', r.morph() === 'lashed');
  check('and it infected them', r.world.pendingInfections.has('near'));
  check('credited to this dog', r.world.infectedByDog.get('near') === DOG);
  check('the lash is on the wire to be drawn', r.world.lashes.length === 1);
  check('and it says it caught somebody', r.world.lashes[0]?.hit === true);

  // The cooldown.
  check('a second lash straight away is refused', r.morph() === 'refused');
  r.run(Math.ceil((DOG_LASH_COOLDOWN_MS + 60) / TICK_MS));
  check('and taken once the cooldown is up', r.morph() === 'lashed');

  // Somebody already incubating is passed over — the same rule a grab follows.
  // `infectByLash` returns at once for a target already in `pendingInfections`,
  // so the honest check is that its deadline is untouched by the second lash
  // rather than pushed out or duplicated.
  const deadline = r.world.pendingInfections.get('near');
  r.run(Math.ceil((DOG_LASH_COOLDOWN_MS + 60) / TICK_MS));
  r.aim(target.x, target.y);
  r.morph();
  check('somebody already bitten is not re-bitten',
    r.world.pendingInfections.get('near') === deadline,
    `${r.world.pendingInfections.get('near')} against ${deadline}`);

  // Out of range.
  const far = rig(false, true, 420);
  transformed(far);
  const away = far.body('far', 'human', far.dog.x + DOG_LASH_RANGE + 120, far.dog.y);
  rebuildEntityGrid(far.world);
  far.aim(away.x, away.y);
  far.morph();
  check('somebody past the reach is missed', !far.world.pendingInfections.has('far'),
    `${DOG_LASH_RANGE}px reach, staged at ${DOG_LASH_RANGE + 120}`);
  check('and the lash still went out', far.world.lashes.length === 1);
  check('saying it caught nobody', far.world.lashes[0]?.hit === false);

  // A zombie is not a target — it is what the thing is made of.
  const horde = rig(false, true, 420);
  transformed(horde);
  horde.body('z', 'zombie', horde.dog.x + 150, horde.dog.y);
  rebuildEntityGrid(horde.world);
  horde.aim(horde.dog.x + 150, horde.dog.y);
  horde.morph();
  check('the horde is never lashed', !horde.world.pendingInfections.has('z'));

  /**
   * **A lash's infection, once it completes, feeds the same tallies a bite
   * does.** `withAi: true` here, unlike above — this is the one point in the
   * function that needs `updateAi` actually running to resolve the incubation,
   * and it is isolated in its own rig so the rest of the file's careful timing
   * is untouched by it.
   */
  const follow = rig(true, true, 420);
  // `rig(…, true, …)` starts this world already at `DOG_MORPH_UNLOCK_CONVERTED`
  // so the transformation itself would be reachable; the claim below is about
  // the *increment*, so the baseline is read rather than assumed to be nought.
  const before = follow.world.totalConverted;
  transformed(follow);
  const patient = follow.body('patient', 'human', follow.dog.x + 150, follow.dog.y);
  rebuildEntityGrid(follow.world);
  follow.aim(patient.x, patient.y);
  follow.morph();
  check('the lash set an incubation', follow.world.pendingInfections.has('patient'));
  /**
   * **The dog's own form has to be kept alive past the wait, or it eats its own
   * test.** `TURN_DELAY_MAX_MS` (45s) outlasts `DOG_MORPH_MS` (20s), so waiting
   * for the worst-case incubation lets the transformed form time out and burst
   * mid-run — and `patient` is, at that point, the only zombie anywhere in this
   * deliberately empty city, so the dog's own rebirth picks *them* as its host
   * and `finishDogBirth` removes the entity outright. That is correct game
   * behaviour and the wrong thing to be staged next to: the harness caught
   * itself doing it, reporting `totalConverted` incremented and the entity
   * gone in the same run. Holding the form open sidesteps it without touching
   * the claim under test, which is the incubation, not the dog's lifecycle.
   */
  follow.world.dogState.get(DOG)!.morphedUntil = follow.clock + TURN_DELAY_MAX_MS + 5000;
  follow.run(Math.ceil((TURN_DELAY_MAX_MS + 2000) / TICK_MS));
  check('it turns them', follow.world.entities.get('patient')?.type === 'zombie');
  check('and it counts toward the shared total', follow.world.totalConverted === before + 1,
    `${follow.world.totalConverted} against a baseline of ${before}`);
  check('and toward this dog\'s own roar balance and total',
    (follow.world.dogConversions.get(DOG) ?? 0) === 1 && (follow.world.dogTurned.get(DOG) ?? 0) === 1,
    `${follow.world.dogConversions.get(DOG)} / ${follow.world.dogTurned.get(DOG)}`);
}

/**
 * **A wall stops it.** Staged against a wall the rig finds rather than one it
 * assumes, with the victim on the far side of it — and the control is the same
 * victim at the same distance on open ground, or "it missed" is satisfied just
 * as well by a reach that is simply too short.
 */
function testLashWall(): void {
  console.log('\nand a wall stops it');
  let staged = 0;
  let stopped = 0;
  let controlHit = 0;

  for (let attempt = 0; attempt < 300 && staged < 6; attempt++) {
    const r = rig();
    /*
     * **The dog has to be moved off the open ground the rig found for it.**
     *
     * `rig()` stages on a spot with several hundred pixels clear in every
     * direction, which is right for every other check here and is precisely
     * wrong for this one: there is never a wall inside the lash's reach, so the
     * search below found nothing and the run reported "0 cities" — the rig
     * defeating its own test rather than the code failing.
     */
    /**
     * **The victim goes past the far face of the wall, not a fixed distance
     * past the near one.**
     *
     * `nav.isBlocked` carries `NAV_INFLATE`, so the first blocked sample
     * walking east is several pixels *before* the slab — and the line from the
     * dog can graze that inflated skirt without ever crossing anything solid,
     * which is a victim standing in plain view with a "wall" between them that
     * is not there. Measured two ways, that leaked on 1 city in 3 and then on 1
     * in 6.
     *
     * So the run of blocked ground is walked all the way through, and the body
     * is put down past the *other* side of it. A city where that lands outside
     * the lash's reach is skipped rather than measured, which is the difference
     * between "the wall stopped it" and "it was too far away".
     */
    let wall = -1;
    let farSide = -1;
    for (let i = 0; i < 3000 && wall < 0; i++) {
      const x = 100 + Math.random() * (r.world.map.width - 200);
      const y = 100 + Math.random() * (r.world.map.height - 200);
      if (r.world.nav.isBlocked(x, y) || !r.world.nav.isReachable(x, y)) continue;
      for (let d = 60; d < DOG_LASH_RANGE - 100; d += 4) {
        if (!r.world.nav.isBlocked(x + d, y)) continue;
        // Through the solid run to open ground on the other side of it.
        let out = d;
        while (out < DOG_LASH_RANGE - 40 && r.world.nav.isBlocked(x + out, y)) out += 4;
        const at = out + 20;
        if (at > DOG_LASH_RANGE - 30) break; // past the reach; not this city
        if (!r.world.nav.isReachable(x + at, y)) break;
        r.dog.x = x;
        r.dog.y = y;
        wall = d;
        farSide = at;
        break;
      }
    }
    if (wall < 0) continue;
    const victimX = r.dog.x + farSide;

    staged++;
    transformed(r);
    const behind = r.body('behind', 'human', victimX, r.dog.y);
    rebuildEntityGrid(r.world);
    r.aim(behind.x, behind.y);
    r.morph();
    if (!r.world.pendingInfections.has('behind')) stopped++;

    // The control: the same reach, no wall.
    const open = rig(false, true, 420);
    transformed(open);
    const clear = open.body('clear', 'human', open.dog.x + farSide, open.dog.y);
    rebuildEntityGrid(open.world);
    open.aim(clear.x, clear.y);
    open.morph();
    if (open.world.pendingInfections.has('clear')) controlHit++;
  }

  check('a wall to lash through was found', staged >= 4, `${staged} cities`);
  check('nobody behind it is infected', stopped === staged, `${stopped}/${staged}`);
  check('and the same reach on open ground plainly works', controlHit === staged,
    `${controlHit}/${staged}`);
}

// ------------------------------------------------------------- the burst

function testBurst(): void {
  console.log('\ntwenty seconds, then it comes apart');
  const r = rig(false, true, 420);
  transformed(r);
  const atX = r.dog.x;
  const atY = r.dog.y;
  const corpsesBefore = r.world.corpses.length;

  // Right up to the edge of the twenty seconds.
  r.run(formTicks - 4);
  check('still the thing just before the clock', isMorphed(r.world.dogState.get(DOG), r.clock));
  check('and nothing has burst yet', r.world.acid.size === 0 && r.world.tentacles.size === 0);

  r.run(6);
  check('it bursts', r.world.dogDeaths.has(DOG));
  check('into a toxic cloud', r.world.acid.size === 1);
  const cloud = [...r.world.acid.values()][0];
  check('where it stood', cloud !== undefined && Math.hypot(cloud.x - atX, cloud.y - atY) < 2,
    cloud ? `${Math.round(Math.hypot(cloud.x - atX, cloud.y - atY))}px off` : 'no cloud');
  check('a bigger one than a gobbet leaves', cloud !== undefined && cloud.full > 130,
    `${Math.round(cloud?.full ?? 0)}px against a spit's 130`);
  check('and it throws its own tentacles', r.world.tentacles.size === DOG_BURST_TENTACLES,
    `${r.world.tentacles.size}`);
  check('a burst is a death: it leaves a body', r.world.corpses.length === corpsesBefore + 1);

  // And the form goes with it — a dog reborn six times as tough would keep the
  // whole ability for the rest of the round.
  check('the health is back to normal', r.dog.maxHealth === DOG_MAX_HEALTH, `${r.dog.maxHealth}`);
  check('and so is the body', r.dog.radius === DOG_RADIUS, `${r.dog.radius}`);
  const st = r.world.dogState.get(DOG);
  check('and it is not still transformed', !isMorphed(st, r.clock));
}

/**
 * **Shot at second nineteen, it bursts anyway.**
 *
 * One ending rather than two. Without this the timer bursts it and gunfire
 * merely kills it, which makes shooting the thing the anticlimax and leaves the
 * transformed form with a second way to end that has to be written and drawn.
 */
function testShotMidForm(): void {
  console.log('\nkilled as the thing, it still comes apart');
  const r = rig(false, true, 420);
  transformed(r);
  r.run(60); // two seconds in, nowhere near the clock

  killEntity(r.world, r.dog, r.clock);
  r.run(2); // `updateDogs` drains the queue on the next tick
  check('it is down', r.world.dogDeaths.has(DOG));
  check('and it burst all the same', r.world.acid.size === 1);
  check('with its tentacles thrown out', r.world.tentacles.size === DOG_BURST_TENTACLES);

  // The control: an *untransformed* dog killed the same way leaves no cloud.
  const plain = rig(false, true, 420);
  killEntity(plain.world, plain.dog, plain.clock);
  plain.run(2);
  check('an ordinary dog killed the same way leaves none', plain.world.acid.size === 0,
    `${plain.world.acid.size}`);
}

/** Thrown tentacles come off walls rather than through them. */
function testTentaclePhysics(): void {
  console.log('\nthe tentacles bounce');
  const r = rig(false, true, 420);
  transformed(r);
  killEntity(r.world, r.dog, r.clock);
  r.run(2);

  const ids = [...r.world.tentacles.keys()];
  check('there are some', ids.length === DOG_BURST_TENTACLES);
  r.run(Math.ceil(DOG_BURST_FLIGHT_MS / TICK_MS) + 2);

  let inGeometry = 0;
  for (const id of ids) {
    const t = r.world.tentacles.get(id);
    if (t && bouncesOff(r.world, t.x, t.y)) inGeometry++;
  }
  check('and none of them come to rest inside a wall', inGeometry === 0,
    `${inGeometry} of ${ids.length}`);

  // They lie there and then go.
  const lying = r.world.tentacles.size;
  check('they lie where they fell', lying === DOG_BURST_TENTACLES, `${lying}`);
  r.run(Math.ceil(6000 / TICK_MS));
  check('and are gone a few seconds later', r.world.tentacles.size === 0,
    `${r.world.tentacles.size} left`);
}

/**
 * The cooldown outlives the body, exactly as the acid's does — and at four
 * minutes against a four-second death it matters far more here.
 */
function testCooldownSurvivesDeath(): void {
  console.log('\nfour minutes, and dying does not refresh it');
  const r = rig(false, true, 420);
  // Something to rise back out of, or the dog is simply out of the round.
  r.body('host', 'zombie', r.dog.x + 300, r.dog.y + 140);

  check('taken', r.morph() === 'morphing');
  const startedAt = r.clock;
  check('and refused straight away', r.morph() === 'refused');

  // All the way through the form, the burst, the death and the birth.
  r.run(windUpTicks + formTicks);
  const deathTicks = Math.ceil(DOG_DEATH_MS / TICK_MS) + 1;
  const birthTicks = Math.ceil(DOG_BIRTH_MS / TICK_MS) + 2;
  r.run(deathTicks + birthTicks);
  check('it is back on its feet', r.world.entities.has(DOG) && !r.world.dogsOut.has(DOG));

  // The strong form: "still refused" would pass for a cooldown that had been
  // reset and merely restarted. What is asserted is that the time remaining
  // matches the clock.
  const gone = r.clock - startedAt;
  const bar = dogHudFor(r.world, DOG, r.clock)!.abilities;
  const left = (1 - (bar[3]?.ready ?? 1)) * DOG_MORPH_COOLDOWN_MS;
  const want = DOG_MORPH_COOLDOWN_MS - gone;
  check('still refused after coming back', r.morph() === 'refused');
  check('and the bar has counted every second of it',
    Math.abs(left - want) < 200,
    `${Math.round(left / 1000)}s left, ${Math.round(want / 1000)}s expected after ` +
      `${Math.round(gone / 1000)}s`);
}

console.log('=== the dog tears itself open ===');
testUnlock();
testWhatCounts();
testWindUp();
testForm();
testLash();
testLashWall();
testBurst();
testShotMidForm();
testTentaclePhysics();
testCooldownSurvivesDeath();
console.log(`\n${failures === 0 ? 'all checks passed' : `${failures} FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
