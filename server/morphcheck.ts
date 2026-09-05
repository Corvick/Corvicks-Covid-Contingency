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
 *   - the **strike** is telegraphed rather than instant: nothing resolves on the
 *     tick the key goes down, a locked ring sits on the ground through the
 *     wind-up, and a player who walks out of it is missed while one who stands
 *     still is not — with a civilian, who cannot make it out, as the control
 *   - it catches **everybody in the circle**, not the first body on a line
 *   - **armour gates the infection and nothing else**: shield before vest, one
 *     charge each, and the shove and the blood land either way
 *   - it **shoves** whoever it caught, away from the impact, and the shove is
 *     spent rather than left running
 *   - it is stopped by a wall, will not re-bite somebody already incubating,
 *     has a cooldown, and dies with a dog shot during its own wind-up
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
  hasWallClearPath,
  isMorphed,
  type Entity,
  type World,
} from './src/world.js';
import { computeFrozen, updateAi } from './src/ai.js';
import { startDogAbility, updateDogs, dogHudFor, lashesToWire } from './src/dog.js';
import { newInventory, type Inventory } from './src/inventory.js';
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
  DOG_LASH_WINDUP_MS,
  DOG_LASH_STRIKE_MS,
  DOG_LASH_IMPACT_RADIUS,
  DOG_LASH_PUSH_MS,
  HUMAN_WALK_SPEED,
  PLAYER_SPEED,
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

/** Ticks from the key going down to the arms arriving, plus one for the edge. */
const strikeTicks = Math.ceil((DOG_LASH_WINDUP_MS + DOG_LASH_STRIKE_MS) / TICK_MS) + 1;

/** Throw a strike at a point and run it out to the moment it lands. */
function strikeAt(r: Rig, x: number, y: number): string {
  r.aim(x, y);
  const said = r.morph();
  r.run(strikeTicks);
  return said;
}

function testLash(): void {
  console.log('\nthe tentacle strike is telegraphed, then it lands');
  const r = rig(false, true, 420);
  transformed(r);

  const target = r.body('near', 'human', r.dog.x + 180, r.dog.y);
  rebuildEntityGrid(r.world);
  r.aim(target.x, target.y);

  check('F strikes rather than transforming again', r.morph() === 'lashed');

  /**
   * **Nothing happens on the tick the key goes down, and that is the feature.**
   *
   * The old lash resolved inside `startDogAbility`, which is a hitscan: there
   * was no window in which a warning could have been acted on because there was
   * no window at all. This is the control for every dodge claim below — without
   * it, "they got out of the way" is satisfied just as well by a strike that
   * never reached them.
   */
  check('nothing is infected on the tick it is thrown',
    !r.world.pendingInfections.has('near'));
  check('but the strike is on the wire immediately', r.world.lashes.length === 1);

  let wire = lashesToWire(r.world, r.clock);
  check('coiling, with a ring to draw', wire[0]?.phase === 0);
  check('and the ring is at the impact point, not the animal',
    Math.hypot(wire[0]!.x2 - target.x, wire[0]!.y2 - target.y) < 4,
    `${wire[0]?.x2},${wire[0]?.y2} against ${Math.round(target.x)},${Math.round(target.y)}`);
  check('the wire carries the impact radius', wire[0]?.r === DOG_LASH_IMPACT_RADIUS);

  // Halfway through the windup it is still coiling and still has not landed.
  r.run(Math.floor(DOG_LASH_WINDUP_MS / 2 / TICK_MS));
  wire = lashesToWire(r.world, r.clock);
  check('halfway through the tell it has still not landed',
    wire[0]?.phase === 0 && !r.world.pendingInfections.has('near'),
    `phase ${wire[0]?.phase}, t ${wire[0]?.t}`);
  check('and the ring has visibly filled', (wire[0]?.t ?? 0) > 0.35, `t ${wire[0]?.t}`);

  r.run(strikeTicks);
  check('it infects once the arms arrive', r.world.pendingInfections.has('near'));
  check('credited to this dog', r.world.infectedByDog.get('near') === DOG);
  wire = lashesToWire(r.world, r.clock);
  check('the wire says it caught somebody', (wire[0]?.hits.length ?? 0) === 1);
  check('with nothing having blocked it', wire[0]?.hits[0]?.blocked === null);

  // The cooldown.
  check('a second strike straight away is refused', r.morph() === 'refused');
  r.run(Math.ceil((DOG_LASH_COOLDOWN_MS + 60) / TICK_MS));
  check('and taken once the cooldown is up', r.morph() === 'lashed');
  r.run(strikeTicks);

  // Somebody already incubating is passed over — the same rule a grab follows.
  // `infectByLash` returns at once for a target already in `pendingInfections`,
  // so the honest check is that its deadline is untouched by the second strike
  // rather than pushed out or duplicated.
  const deadline = r.world.pendingInfections.get('near');
  r.run(Math.ceil((DOG_LASH_COOLDOWN_MS + 60) / TICK_MS));
  strikeAt(r, target.x, target.y);
  check('somebody already bitten is not re-bitten',
    r.world.pendingInfections.get('near') === deadline,
    `${r.world.pendingInfections.get('near')} against ${deadline}`);

  // Out of range.
  const far = rig(false, true, 420);
  transformed(far);
  const away = far.body('far', 'human', far.dog.x + DOG_LASH_RANGE + 120, far.dog.y);
  rebuildEntityGrid(far.world);
  strikeAt(far, away.x, away.y);
  check('somebody past the reach is missed', !far.world.pendingInfections.has('far'),
    `${DOG_LASH_RANGE}px reach, staged at ${DOG_LASH_RANGE + 120}`);
  check('and the strike still went out', far.world.lashes.length === 1);
  const farWire = lashesToWire(far.world, far.clock);
  check('saying it caught nobody', (farWire[0]?.hits.length ?? 0) === 0);
  check('and it came down at the edge of the reach rather than at the target',
    Math.abs(Math.hypot(farWire[0]!.x2 - far.dog.x, farWire[0]!.y2 - far.dog.y)
      - DOG_LASH_RANGE) < 8,
    `${Math.round(Math.hypot(farWire[0]!.x2 - far.dog.x, farWire[0]!.y2 - far.dog.y))}px`);

  // A zombie is not a target — it is what the thing is made of.
  const horde = rig(false, true, 420);
  transformed(horde);
  horde.body('z', 'zombie', horde.dog.x + 150, horde.dog.y);
  rebuildEntityGrid(horde.world);
  strikeAt(horde, horde.dog.x + 150, horde.dog.y);
  check('the horde is never struck', !horde.world.pendingInfections.has('z'));

  /**
   * **A strike's infection, once it completes, feeds the same tallies a bite
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
  strikeAt(follow, patient.x, patient.y);
  check('the strike set an incubation', follow.world.pendingInfections.has('patient'));
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

    /**
     * **And now confirm with the real geometry that there is a wall there at
     * all**, which `nav.isBlocked` cannot say.
     *
     * The search above reads the nav grid, and the nav grid carries
     * `NAV_INFLATE` (10px) of padding round everything solid. A "blocked run"
     * found in it can therefore be *pure skirt* — inflation near a corner with
     * no slab anywhere on the line. `lashOut` stops the strike at the first
     * thing `hasWallClearPath` refuses, which is real geometry, so on such a
     * city it does not stop at all, the strike lands on the victim, and the
     * check fails having staged no wall.
     *
     * The comment three paragraphs up already learned this lesson once, for the
     * victim's position; this is the same lesson for the *existence* of the
     * wall. It leaked 2 of 6 cities and moved run to run, because the map is not
     * seeded — which is what a rig reporting the city rather than the code looks
     * like. A city that cannot stage one is skipped rather than counted.
     */
    if (hasWallClearPath(r.world, r.dog.x, r.dog.y, victimX, r.dog.y)) continue;

    staged++;
    transformed(r);
    const behind = r.body('behind', 'human', victimX, r.dog.y);
    rebuildEntityGrid(r.world);
    strikeAt(r, behind.x, behind.y);
    if (!r.world.pendingInfections.has('behind')) stopped++;

    // The control: the same reach, no wall.
    const open = rig(false, true, 420);
    transformed(open);
    const clear = open.body('clear', 'human', open.dog.x + farSide, open.dog.y);
    rebuildEntityGrid(open.world);
    strikeAt(open, clear.x, clear.y);
    if (open.world.pendingInfections.has('clear')) controlHit++;
  }

  check('a wall to lash through was found', staged >= 4, `${staged} cities`);
  check('nobody behind it is infected', stopped === staged, `${stopped}/${staged}`);
  check('and the same reach on open ground plainly works', controlHit === staged,
    `${controlHit}/${staged}`);
}

// ------------------------------------------------------------- the burst

/**
 * **The warning is a warning: walking out of the ring is enough.**
 *
 * This is the claim the whole rework exists for, and it needs both halves. The
 * dodge on its own is satisfied just as well by a strike that never worked, so
 * the control is the *same* body, at the *same* staged distance, in the *same*
 * city, that simply does not move — and the two runs are paired rather than
 * averaged over separate rigs, because the map is not seeded and how much open
 * ground a spot has is the city's business rather than the code's.
 *
 * The dodge is deliberately a plain walk at officer pace rather than a sprint:
 * a telegraph that can only be answered by a fresh stamina bar is a telegraph
 * most people cannot answer.
 */
function testDodge(): void {
  console.log('\nthe ring is dodgeable, and standing in it is not');
  let dodged = 0;
  let caught = 0;
  const runs = 8;

  for (let i = 0; i < runs; i++) {
    // Stood still.
    const still = rig(false, true, 420);
    transformed(still);
    const sitter = still.body('sit', 'human', still.dog.x + 200, still.dog.y);
    rebuildEntityGrid(still.world);
    strikeAt(still, sitter.x, sitter.y);
    if (still.world.pendingInfections.has('sit')) caught++;

    // The same staging, walking out of it from the moment the ring appears.
    const run = rig(false, true, 420);
    transformed(run);
    const mover = run.body('run', 'human', run.dog.x + 200, run.dog.y);
    rebuildEntityGrid(run.world);
    run.aim(mover.x, mover.y);
    run.morph();
    /**
     * Straight out of the ring, across the line the arms are coming in on, at
     * **`PLAYER_SPEED`** — the claim is about players, and staging it at
     * `HUMAN_WALK_SPEED` measures a civilian instead. That was the first
     * version and it read **0/8 dodged**, which looks exactly like the
     * telegraph not working and is in fact the rig asking a body that moves at
     * 35px/s to cover 60 in under half a second.
     *
     * A plain walk rather than a sprint, deliberately: a telegraph that can
     * only be answered with a full stamina bar is one most people cannot answer
     * while they are also being shot at. See `DOG_LASH_WINDUP_MS`.
     */
    const perTick = (PLAYER_SPEED * TICK_MS) / 1000;
    for (let t = 0; t < strikeTicks; t++) {
      mover.y += perTick;
      run.tick();
    }
    if (!run.world.pendingInfections.has('run')) dodged++;
  }

  check('standing in the ring is caught', caught === runs, `${caught}/${runs}`);
  check('and a player walking out of it is not', dodged === runs, `${dodged}/${runs}`);
  check('a civilian cannot make it out, which is what the ability is for',
    !crowdEscapes(), `${HUMAN_WALK_SPEED}px/s covers ` +
      `${((HUMAN_WALK_SPEED * DOG_LASH_WINDUP_MS) / 1000).toFixed(0)}px of the ` +
      `${DOG_LASH_IMPACT_RADIUS}px it would need`);
}

/** The same walk at civilian pace — the control on the dodge above. */
function crowdEscapes(): boolean {
  const r = rig(false, true, 420);
  transformed(r);
  const civ = r.body('civ', 'human', r.dog.x + 200, r.dog.y);
  rebuildEntityGrid(r.world);
  r.aim(civ.x, civ.y);
  r.morph();
  const perTick = (HUMAN_WALK_SPEED * TICK_MS) / 1000;
  for (let t = 0; t < strikeTicks; t++) {
    civ.y += perTick;
    r.tick();
  }
  return !r.world.pendingInfections.has('civ');
}

/**
 * **Everybody in the circle, not the first body on a line.**
 *
 * The old lash took whoever was nearest along its corridor and stopped there,
 * so a crowd standing shoulder to shoulder lost exactly one of its number. A
 * landing point with a radius catches the group it lands on, which is what
 * makes siting the thing a decision.
 */
function testCrowd(): void {
  console.log('\nit catches everybody standing in it');
  const r = rig(false, true, 420);
  transformed(r);
  const at = { x: r.dog.x + 200, y: r.dog.y };
  // Three inside the radius, one plainly outside it — the control, and it is
  // the half that says this is a circle rather than "everybody nearby".
  r.body('a', 'human', at.x - 20, at.y);
  r.body('b', 'human', at.x + 18, at.y - 14);
  r.body('c', 'human', at.x, at.y + 26);
  r.body('outside', 'human', at.x, at.y + DOG_LASH_IMPACT_RADIUS + 60);
  rebuildEntityGrid(r.world);
  strikeAt(r, at.x, at.y);

  const got = ['a', 'b', 'c'].filter((id) => r.world.pendingInfections.has(id)).length;
  check('all three in the circle are caught', got === 3, `${got}/3`);
  check('and the one outside it is not', !r.world.pendingInfections.has('outside'),
    `staged ${DOG_LASH_IMPACT_RADIUS + 60}px out against a ${DOG_LASH_IMPACT_RADIUS}px radius`);
}

/**
 * **Armour gates the infection and spends a charge; the shove and the blood are
 * not gated on anything.**
 *
 * Three subjects, one strike, so the ordering claim is measured rather than
 * assumed: the shield goes before the vest, and a player carrying both spends
 * the shield. Each is checked for *both* halves — a charge gone and no
 * infection — because either alone would pass for the wrong reason: a vest that
 * denied the turn without being spent would be free, and one spent without
 * denying it would be worthless.
 */
function testArmour(): void {
  console.log('\nthe shield goes first, then the vest, and only then does it infect');
  const r = rig(false, true, 420);
  transformed(r);
  const at = { x: r.dog.x + 200, y: r.dog.y };

  const shielded = r.body('shielded', 'officer', at.x - 16, at.y);
  const vested = r.body('vested', 'officer', at.x + 16, at.y);
  const both = r.body('both', 'officer', at.x, at.y + 20);
  const bare = r.body('bare', 'officer', at.x, at.y - 20);
  // Facing the strike, so the shield is covering the bearing it comes in on.
  for (const e of [shielded, vested, both, bare]) e.facing = Math.PI;

  r.world.inventories.set('shielded', kit({ shield: 3, shieldUp: true }));
  r.world.inventories.set('vested', kit({ kevlar: 3 }));
  r.world.inventories.set('both', kit({ shield: 3, shieldUp: true, kevlar: 3 }));
  r.world.inventories.set('bare', kit({}));
  rebuildEntityGrid(r.world);
  strikeAt(r, at.x, at.y);

  const inv = (id: string) => r.world.inventories.get(id)!;
  check('a shield turns it away', !r.world.pendingInfections.has('shielded'));
  check('and one charge is gone', inv('shielded').shield === 2, `${inv('shielded').shield}/3`);
  check('a vest turns it away', !r.world.pendingInfections.has('vested'));
  check('and one charge is gone', inv('vested').kevlarUses[0] === 2, `${inv('vested').kevlarUses[0]}/3`);
  check('carrying both spends the shield, not the vest',
    inv('both').shield === 2 && inv('both').kevlarUses[0] === 3,
    `shield ${inv('both').shield}/3, vest ${inv('both').kevlarUses[0]}/3`);
  check('and somebody with nothing on is infected', r.world.pendingInfections.has('bare'));

  const wire = lashesToWire(r.world, r.clock);
  const blocked = wire[0]!.hits.filter((h) => h.blocked !== null).length;
  check('the wire says what stopped each of them', blocked === 3,
    `${blocked} of ${wire[0]!.hits.length} hits blocked`);
  check('four bodies were caught, armoured or not', wire[0]!.hits.length === 4,
    `${wire[0]!.hits.length}`);
}

/**
 * **The shove is real, it goes away from the impact, and it is not a stun.**
 *
 * The control is a body the strike missed entirely, standing on the same ground
 * over the same window — without it, "they moved" is satisfied by any body the
 * rig happens to have left walking.
 */
function testKnockback(): void {
  console.log('\nand it shoves whoever it caught');
  const r = rig(false, true, 420);
  transformed(r);
  const at = { x: r.dog.x + 200, y: r.dog.y };

  const hit = r.body('hit', 'human', at.x + 10, at.y);
  const miss = r.body('miss', 'human', at.x, at.y + DOG_LASH_IMPACT_RADIUS + 90);
  rebuildEntityGrid(r.world);
  const hitFrom = { x: hit.x, y: hit.y };
  const missFrom = { x: miss.x, y: miss.y };
  strikeAt(r, at.x, at.y);

  // Let the impulse run out.
  r.run(Math.ceil((DOG_LASH_PUSH_MS + 100) / TICK_MS));
  const moved = Math.hypot(hit.x - hitFrom.x, hit.y - hitFrom.y);
  const control = Math.hypot(miss.x - missFrom.x, miss.y - missFrom.y);

  check('the body it caught is shoved', moved > 8, `${moved.toFixed(1)}px`);
  check('and one it missed is not', control < 1, `${control.toFixed(1)}px`);
  check('the shove goes away from the impact, not toward it',
    Math.hypot(hit.x - at.x, hit.y - at.y) > Math.hypot(hitFrom.x - at.x, hitFrom.y - at.y),
    `${Math.hypot(hit.x - at.x, hit.y - at.y).toFixed(1)}px out, was ` +
      `${Math.hypot(hitFrom.x - at.x, hitFrom.y - at.y).toFixed(1)}`);
  check('and it is spent rather than left running',
    !r.world.knockbacks.has('hit'), `${r.world.knockbacks.size} still in the air`);
}

/**
 * **A strike out of a dog that has been shot never lands.**
 *
 * Two seconds of coiling is the officers' whole answer to this ability, and a
 * strike that came down anyway would be that answer doing nothing. The control
 * is the same staging with the dog left alive — without it, "nobody was
 * infected" is satisfied by a strike that was never going to reach.
 */
function testStrikeDiesWithTheDog(): void {
  console.log('\na strike still coiling dies with the animal');

  const shot = rig(false, true, 420);
  transformed(shot);
  const near = shot.body('near', 'human', shot.dog.x + 180, shot.dog.y);
  rebuildEntityGrid(shot.world);
  shot.aim(near.x, near.y);
  shot.morph();
  check('it is coiling', shot.world.lashes.length === 1);
  killEntity(shot.world, shot.dog, shot.clock);
  check('killing the dog drops the strike', shot.world.lashes.length === 0);
  shot.run(strikeTicks + 4);
  check('and nobody is infected by it', !shot.world.pendingInfections.has('near'));

  const live = rig(false, true, 420);
  transformed(live);
  const alive = live.body('near', 'human', live.dog.x + 180, live.dog.y);
  rebuildEntityGrid(live.world);
  strikeAt(live, alive.x, alive.y);
  check('the control — left alive, the same strike lands',
    live.world.pendingInfections.has('near'));
}

/**
 * A bag with nothing in it but the armour under test.
 *
 * Built off `newInventory()` rather than by hand: a literal here would have to
 * be kept in step with every field ever added to `Inventory`, and the one that
 * got missed would be a rig staging a bag no real player has.
 *
 * The `utilities` entry matters as much as the count — `spendArmour` splices
 * the item out when the last charge goes, exactly as `resolveGrapple` does, and
 * a bag with charges but no item would pass the count check while proving
 * nothing about the slot being freed.
 */
function kit(over: { shield?: number; kevlar?: number; shieldUp?: boolean }): Inventory {
  const inv = newInventory();
  if (over.shield) {
    inv.shield = over.shield;
    inv.shieldUp = over.shieldUp ?? true;
    inv.utilities.push('riotShield');
  }
  if (over.kevlar) {
    inv.utilities.push('kevlar');
    inv.kevlarUses.push(over.kevlar);
  }
  return inv;
}

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
testDodge();
testCrowd();
testArmour();
testKnockback();
testStrikeDiesWithTheDog();
testBurst();
testShotMidForm();
testTentaclePhysics();
testCooldownSurvivesDeath();
console.log(`\n${failures === 0 ? 'all checks passed' : `${failures} FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
