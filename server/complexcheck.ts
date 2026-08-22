/**
 * Headless check on the corner complex: what is in it, who lives in it, and
 * whether a bot officer will go in after the good stuff and come back out.
 *
 * No socket, no port, so it leaves a game on 8080 alone.
 *
 *   npx tsx complexcheck.ts
 *   CITIES=8 npx tsx complexcheck.ts
 *
 * Not covered by `npx tsc --noEmit` — `server/tsconfig.json` includes `src/**`
 * only. Check it explicitly:
 *   npx tsc --noEmit --target ES2022 --module ESNext --moduleResolution Bundler \
 *     --strict --skipLibCheck --types node complexcheck.ts
 */
import {
  createWorld,
  resetWorld,
  rebuildNav,
  rebuildEntityGrid,
  resolveCollisions,
  makeEntity,
  newAiState,

  buildingIndexAt,
  type World,
} from './src/world.js';
import { computeFrozen, updateAi } from './src/ai.js';
import { newInventory } from './src/inventory.js';
import { initDoors, lockDoor, shutDoor } from './src/doors.js';
import { ITEMS, type ItemId } from '../shared/items.js';
import {
  TICK_RATE,
  PATH_NODE_BUDGET_PER_TICK,
  BOT_COMPLEX_NOTICE,
  ITEM_CITY_CAP,
} from '../shared/constants.js';

const TICK_MS = 1000 / TICK_RATE;
const CITIES = Number(process.env.CITIES ?? 6);
const RAID_TICKS = Number(process.env.RAID_TICKS ?? 5400); // 180s

function tick(world: World, now: number, dt: number): void {
  world.pathBudget = PATH_NODE_BUDGET_PER_TICK;
  if (world.navDirty) rebuildNav(world);
  rebuildEntityGrid(world);
  updateAi(world, now, dt, computeFrozen(world));
  resolveCollisions(world);
}

const med = (xs: number[]): number => {
  if (xs.length === 0) return 0;
  const s = xs.slice().sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};
const f1 = (n: number): string => n.toFixed(1);

/**
 * A fresh AiState with the door traits `populate` clears for a real bot.
 *
 * Not optional in a rig. Staged with `newAiState` alone the bot rolls
 * `closesDoors` like a civilian and spends the round tidying up after itself —
 * measured, **144 `close` jobs across eight cities** and not one of them
 * anything a real bot would ever have done.
 */
function botState(now: number, x: number, y: number) {
  const state = newAiState(now, x, y);
  state.closesDoors = false;
  state.locksDoors = false;
  state.slamsDoors = false;
  state.barricades = false;
  state.guardsDoors = false;
  state.hidesDeeper = false;
  return state;
}

// ------------------------------------------------------ what is in it, and who

interface Stock {
  rooms: number[];
  loot: number[];
  ordinary: number[];
  /** Rarity of every item placed in the complex, by the depth of its room. */
  byDepth: Map<number, number[]>;
  crowdIn: number[];
  crowdShare: number[];
  capsBroken: number;
  missing: number;
  inDoorway: number;
}

console.log(`--- the corner complex, ${CITIES} cities ---\n`);

const stock: Stock = {
  rooms: [], loot: [], ordinary: [], byDepth: new Map(),
  crowdIn: [], crowdShare: [], capsBroken: 0, missing: 0, inDoorway: 0,
};

for (let c = 0; c < CITIES; c++) {
  const world = createWorld();
  resetWorld(world);
  const complex = world.map.cornerBuilding;
  const rooms = world.rooms.roomsOf(complex);
  stock.rooms.push(rooms.length);

  let here = 0;
  const ordinaryCounts = new Map<number, number>();
  for (const p of world.pickups.values()) {
    if (p.id.startsWith('loot-test-')) continue;
    const b = buildingIndexAt(world, p.x, p.y);
    if (b < 0) continue;
    if (b !== complex) {
      ordinaryCounts.set(b, (ordinaryCounts.get(b) ?? 0) + 1);
      continue;
    }
    here++;
    const room = world.rooms.roomAt(p.x, p.y);
    const depth = room >= 0 ? world.rooms.rooms[room].depth : -1;
    if (!Number.isFinite(depth)) continue;
    const list = stock.byDepth.get(depth) ?? [];
    list.push(ITEMS[p.item].rarity);
    stock.byDepth.set(depth, list);

    // Nothing may sit in a threshold everybody has to walk through.
    for (const index of world.map.buildings[complex].doors) {
      const d = world.map.doors[index];
      if (Math.hypot(d.x - p.x, d.y - p.y) < 24) stock.inDoorway++;
    }
  }
  stock.loot.push(here);
  // Every other building that got anything at all, so the comparison is
  // "a house with loot in it" rather than being dragged down by empty ones.
  stock.ordinary.push(
    ordinaryCounts.size > 0 ? [...ordinaryCounts.values()].reduce((a, b) => a + b, 0) / ordinaryCounts.size : 0,
  );

  // The city cap has to survive a twenty-room building drawing on its own.
  const counts = new Map<ItemId, number>();
  for (const p of world.pickups.values()) {
    if (p.id.startsWith('loot-test-')) continue;
    counts.set(p.item, (counts.get(p.item) ?? 0) + 1);
  }
  for (const [item, cap] of Object.entries(ITEM_CITY_CAP) as Array<[ItemId, number]>) {
    if ((counts.get(item) ?? 0) > cap) stock.capsBroken++;
  }
  // The every-gun and every-utility floors are the thing two dozen extra draws
  // could plausibly break, since they are satisfied by scanning what has been
  // placed — so they are checked rather than assumed.
  for (const id of Object.keys(ITEMS) as ItemId[]) {
    if (ITEMS[id].rarity <= 0 || id === 'pistol' || id === 'dualPistols') continue;
    if (!counts.has(id)) stock.missing++;
  }

  let inComplex = 0;
  let people = 0;
  for (const e of world.entities.values()) {
    if (e.type !== 'human') continue;
    people++;
    if (buildingIndexAt(world, e.x, e.y) === complex) inComplex++;
  }
  stock.crowdIn.push(inComplex);
  // What uniform placement would give it: one building's share of the indoor
  // crowd. That is the control the multiplier is measured against.
  stock.crowdShare.push((100 * inComplex) / Math.max(1, people));
}

console.log(`rooms in it                  : ${stock.rooms.join(', ')}`);
console.log(`pickups in it                : ${stock.loot.join(', ')} (median ${med(stock.loot)})`);
console.log(`pickups in an ordinary house : median ${f1(med(stock.ordinary))} of those that got any`);
console.log(`lying in a doorway of it     : ${stock.inDoorway}`);
console.log(`city caps broken             : ${stock.capsBroken}`);
console.log(`guns or utilities missing    : ${stock.missing}`);
console.log(`civilians in it              : ${stock.crowdIn.join(', ')} (${stock.crowdShare.map((s) => f1(s) + '%').join(', ')} of the city)`);
console.log('\nrarity by how many doorways in (lower is scarcer):');
for (const depth of [...stock.byDepth.keys()].sort((a, b) => a - b)) {
  const rs = stock.byDepth.get(depth)!;
  console.log(
    `  depth ${String(depth).padStart(2)} · ${String(rs.length).padStart(3)} items · ` +
      `median rarity ${String(med(rs)).padStart(2)} · scarcest ${Math.min(...rs)}`,
  );
}

// ------------------------------------------------------------ the raid

console.log(`\n--- a bot officer walked past it, ${CITIES} cities, ${(RAID_TICKS / TICK_RATE) | 0}s ---\n`);

let wentIn = 0;
let cameOut = 0;
let staged = 0;
const deepest: number[] = [];
const roomsSeen: number[] = [];
const tookIn: number[] = [];
const rarest: number[] = [];
const outAt: number[] = [];
/** Every door job any bot started, across every city. */
const doorActions = new Map<string, number>();

for (let c = 0; c < CITIES; c++) {
  const world = createWorld();
  resetWorld(world);
  // Nothing alive but the bot: a raid is what a bot does with nothing to
  // shoot at, and a live outbreak turns the run into a measurement of how far
  // the city got rather than of whether the bot can work a landmark.
  for (const id of [...world.entities.keys()]) {
    world.entities.delete(id);
    world.ai.delete(id);
  }
  world.playerIds.clear();
  world.bots.clear();
  initDoors(world);

  const complex = world.map.cornerBuilding;
  const b = world.map.buildings[complex];

  // Stood in the street beside it, well inside the notice radius.
  let spot: { x: number; y: number } | null = null;
  for (let attempt = 0; attempt < 4000 && !spot; attempt++) {
    const a = Math.random() * Math.PI * 2;
    const r = 120 + Math.random() * (BOT_COMPLEX_NOTICE - 200);
    const x = b.x + b.w / 2 + Math.cos(a) * (b.w / 2 + r);
    const y = b.y + b.h / 2 + Math.sin(a) * (b.h / 2 + r);
    if (world.nav.isBlocked(x, y) || !world.nav.isReachable(x, y)) continue;
    if (buildingIndexAt(world, x, y) >= 0) continue;
    spot = { x, y };
  }
  if (!spot) {
    console.log(`city ${c}: nowhere in the street to stand a bot`);
    continue;
  }
  staged++;

  const now0 = Date.now();
  const id = 'bot-0';
  world.entities.set(id, makeEntity(id, 'officer', spot.x, spot.y));
  world.ai.set(id, botState(now0, spot.x, spot.y));
  world.inventories.set(id, newInventory());
  world.bots.add(id);
  world.rallyCharges.set(id, 0);

  const before = new Set([...world.pickups.keys()].filter((k) => {
    const p = world.pickups.get(k)!;
    return buildingIndexAt(world, p.x, p.y) === complex;
  }));

  let now = now0;
  let deepestReached = -1;
  const seen = new Set<number>();
  let insideEver = false;
  let leftAt = -1;
  // Every door job the bot actually starts. An officer works a lock rather
  // than taking the door off its hinges — the boot is being kept for
  // barricades — so `kick` here should be 0 and `unlock` should not.
  const doorWork = new Map<string, number>();
  let lastAction: string | null = null;
  // A raid can only start from inside `BOT_COMPLEX_NOTICE`, and a bot is free
  // to walk off after a rifle it can see across the street first. So "did not
  // go in" has two very different meanings and they have to be told apart.
  let noticeTicks = 0;

  for (let t = 0; t < RAID_TICKS; t++) {
    now += TICK_MS;
    tick(world, now, TICK_MS / 1000);
    const e = world.entities.get(id);
    if (!e) break;
    // Counted on the *edge*, or a 4.2s kick reads as 126 of them.
    const action = world.ai.get(id)?.doorAction ?? null;
    if (action && action !== lastAction) doorWork.set(action, (doorWork.get(action) ?? 0) + 1);
    lastAction = action;
    const dx = Math.max(b.x - e.x, 0, e.x - (b.x + b.w));
    const dy = Math.max(b.y - e.y, 0, e.y - (b.y + b.h));
    if (Math.hypot(dx, dy) <= BOT_COMPLEX_NOTICE) noticeTicks++;
    if (buildingIndexAt(world, e.x, e.y) === complex) {
      insideEver = true;
      const room = world.rooms.roomAt(e.x, e.y);
      if (room >= 0) {
        seen.add(room);
        const d = world.rooms.rooms[room].depth;
        if (Number.isFinite(d) && d > deepestReached) deepestReached = d;
      }
    } else if (insideEver && leftAt < 0 && world.ai.get(id)!.raidUntil <= 0) {
      leftAt = t;
    }
  }

  if (insideEver) wentIn++;
  if (leftAt >= 0) {
    cameOut++;
    outAt.push(leftAt / TICK_RATE);
  }
  deepest.push(deepestReached);
  roomsSeen.push(seen.size);

  let taken = 0;
  let best = 99;
  for (const key of before) {
    if (!world.pickups.has(key)) taken++;
  }
  const inv = world.inventories.get(id)!;
  for (const g of inv.guns) if (g) best = Math.min(best, ITEMS[g.item].rarity);
  for (const u of inv.utilities) best = Math.min(best, ITEMS[u].rarity);
  if (inv.sling) best = Math.min(best, ITEMS.gunsling.rarity);
  if (inv.pack) best = Math.min(best, ITEMS.backpack.rarity);
  tookIn.push(taken);
  if (best < 99) rarest.push(best);

  console.log(
    `city ${c}: went in ${insideEver ? 'yes' : 'NO '} · rooms entered ${seen.size}/${world.rooms.roomsOf(complex).length} ` +
      `· deepest ${deepestReached} · took ${taken} of its ${before.size} · ` +
      `left ${leftAt >= 0 ? f1(leftAt / TICK_RATE) + 's' : 'no'} · ` +
      `near enough to notice it ${((100 * noticeTicks) / RAID_TICKS).toFixed(0)}% of the round`,
  );
  for (const [action, n] of doorWork) doorActions.set(action, (doorActions.get(action) ?? 0) + n);
}

console.log(
  `\nwent in            : ${wentIn}/${staged}` +
    `\ncame back out      : ${cameOut}/${staged}${outAt.length ? ` (median ${f1(med(outAt))}s)` : ''}` +
    `\ndeepest room, med  : ${med(deepest)} doorways in` +
    `\nrooms entered, med : ${med(roomsSeen)}` +
    `\nloot taken, med    : ${med(tookIn)}` +
    `\nscarcest thing held: rarity ${rarest.length ? med(rarest) : '-'} (lower is scarcer)` +
    `\ndoor jobs started  : ${[...doorActions].map(([a, n]) => `${a} ${n}`).join(' · ') || 'none'}`,
);

// --------------------------------------------- a bolted door, from the outside

/**
 * **An officer works a lock rather than taking the door off its hinges.**
 *
 * Nothing in the loop above can show this: `initDoors` starts every door
 * unlocked, and a lock only ever appears because a civilian threw one — so a
 * rig with nothing alive but a bot never meets a bolted door at all. It has to
 * be staged, and staging it is also the only way to tell "unlocked it" from
 * "walked round to another one".
 *
 * Every exterior door of the complex is bolted, so there is no way in that is
 * not the thing under test.
 */
console.log(`\n--- every way into the complex bolted, ${CITIES} cities, 60s ---\n`);

let unlocked = 0;
let kicked = 0;
let gotIn = 0;
let tried = 0;
const unlockedAt: number[] = [];

for (let c = 0; c < CITIES; c++) {
  const world = createWorld();
  resetWorld(world);
  for (const id of [...world.entities.keys()]) {
    world.entities.delete(id);
    world.ai.delete(id);
  }
  world.playerIds.clear();
  world.bots.clear();
  initDoors(world);

  const complex = world.map.cornerBuilding;
  const b = world.map.buildings[complex];
  const ext = (world.map.buildings[complex].doors ?? []).filter(
    (i) => !world.map.doors[i].interior && world.doors[i],
  );
  if (ext.length === 0) continue;
  for (const i of ext) {
    // `lockDoor` refuses an open door, which is right — you cannot bolt one
    // that is standing open — so it has to be shut first.
    shutDoor(world, i, Date.now());
    lockDoor(world, i);
  }

  let spot: { x: number; y: number } | null = null;
  for (let attempt = 0; attempt < 4000 && !spot; attempt++) {
    const a = Math.random() * Math.PI * 2;
    const r = 120 + Math.random() * 300;
    const x = b.x + b.w / 2 + Math.cos(a) * (b.w / 2 + r);
    const y = b.y + b.h / 2 + Math.sin(a) * (b.h / 2 + r);
    if (world.nav.isBlocked(x, y) || !world.nav.isReachable(x, y)) continue;
    if (buildingIndexAt(world, x, y) >= 0) continue;
    spot = { x, y };
  }
  if (!spot) continue;
  tried++;

  let now = Date.now();
  const id = 'bot-0';
  world.entities.set(id, makeEntity(id, 'officer', spot.x, spot.y));
  world.ai.set(id, botState(now, spot.x, spot.y));
  world.inventories.set(id, newInventory());
  world.bots.add(id);
  world.rallyCharges.set(id, 0);

  let last: string | null = null;
  let didUnlock = false;
  let didKick = false;
  let inside = false;
  let at = -1;

  for (let t = 0; t < 1800; t++) {
    now += TICK_MS;
    tick(world, now, TICK_MS / 1000);
    const e = world.entities.get(id);
    if (!e) break;
    const action = world.ai.get(id)?.doorAction ?? null;
    if (action && action !== last) {
      if (action === 'unlock') didUnlock = true;
      if (action === 'kick') didKick = true;
    }
    last = action;
    // The claim is that the *bolt* came off, not that the slab did.
    if (!didUnlock && ext.some((i) => !world.doors[i]?.locked && !world.doors[i]?.broken)) {
      didUnlock = true;
    }
    if (!inside && buildingIndexAt(world, e.x, e.y) === complex) {
      inside = true;
      at = t;
    }
  }

  if (didUnlock) unlocked++;
  if (didKick) kicked++;
  if (inside) {
    gotIn++;
    unlockedAt.push(at / TICK_RATE);
  }
  console.log(
    `city ${c}: ${ext.length} bolted way(s) in · unlocked ${didUnlock ? 'yes' : 'NO '} · ` +
      `kicked ${didKick ? 'YES' : 'no '} · got in ${inside ? f1(at / TICK_RATE) + 's' : 'no'}`,
  );
}

console.log(
  `\ndrew the bolt      : ${unlocked}/${tried}` +
    `\nkicked it in       : ${kicked}/${tried}  (the boot is being kept for barricades)` +
    `\ngot inside         : ${gotIn}/${tried}${unlockedAt.length ? ` (median ${f1(med(unlockedAt))}s)` : ''}`,
);
