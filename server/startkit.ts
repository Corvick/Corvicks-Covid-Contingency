/**
 * Headless check on the three changes that all fail silently: the starting
 * item, the tracker running on being carried, and the halved bolt work. No
 * socket, no port, so it leaves a game on 8080 alone.
 *
 * Each of these produces *nothing* rather than an error when it is wrong — a
 * bot with an empty bag, a `trackBearing` of null, a door that takes as long as
 * it always did — which is exactly the shape of thing a rig is for.
 *
 * The clock starts at `Date.now()`, because `resetWorld` stamps every fresh
 * AiState with it and a rig with its own clock never perceives anything at all.
 * See the header of `botkite.ts`.
 *
 *   npx tsx startkit.ts
 *   CITIES=40 npx tsx startkit.ts
 *
 * Not typechecked by `npx tsc --noEmit` in `server/`. Check it explicitly:
 *   npx tsc --noEmit --target ES2022 --module ESNext --moduleResolution Bundler \
 *     --strict --skipLibCheck --types node startkit.ts
 */
import { createWorld, resetWorld, type World } from './src/world.js';
import {
  addKevlarVest,
  giveStartingItem,
  newInventory,
  toWireInventory,
  STATION_RADIO_ID,
} from './src/inventory.js';
import { ALL_LOOT, ITEMS, type ItemId } from '../shared/items.js';
import {
  ITEM_CITY_CAP,
  DOOR_LOCK_MIN_MS,
  DOOR_LOCK_MAX_MS,
  DOOR_NPC_UNLOCK_MS,
  DOOR_PLAYER_LOCK_MS,
  DOOR_PLAYER_UNLOCK_MS,
  DOOR_PLAYER_OPEN_MS,
  TAP_MAX_MS,
  KEVLAR_POINTS,
  RALLY_STARTING_CHARGES,
} from '../shared/constants.js';

const CITIES = Number(process.env.CITIES ?? 40);
const BOTS = 5;
/** Enough draws that a 1-in-85 item turning up 0 times would be news. */
const DRAWS = Number(process.env.DRAWS ?? 4000);

const share = (a: number, b: number): string => `${((100 * a) / Math.max(1, b)).toFixed(1)}%`;

/**
 * Did *anything* land in this bag?
 *
 * Read by comparing against a bag that was never given anything, rather than by
 * listing the slots. Listing them is what a rig gets wrong here, twice over: the
 * riot shield sets `shield` *and* takes a utility slot, so counting both
 * double-counts it at 10.8% against a table share of 2.4%; and the gunsling, the
 * backpack and the rally lozenge leave no slot entry at all — they are worn or
 * spent — so a bot that drew one reads as a bot that drew nothing. Measured that
 * way this said 12.5% of bots came away empty when none of them had.
 *
 * The lozenge is the exception that has to be asked about separately, since what
 * it changes is a rally charge on the world rather than anything in the bag.
 */
function gotSomething(world: World, id: string): boolean {
  const inv = world.inventories.get(id);
  if (!inv) return false;
  // The baseline is a fresh bag *plus the starting vest* every blue officer now
  // opens the round in — otherwise every bot reads as "got something" off the
  // vest alone and the draw's hit rate becomes meaningless.
  const base = newInventory();
  addKevlarVest(base);
  if (JSON.stringify(inv) !== JSON.stringify(base)) return true;
  return (world.rallyCharges.get(id) ?? 0) > RALLY_STARTING_CHARGES;
}

console.log(`startkit: ${CITIES} cities, ${BOTS} bots each\n`);

// -------------------------------------------------- 1. the starting item
//
// Two halves. The distribution is measured off what `giveStartingItem` says it
// granted, because that is the claim — what the draw does. Whether a bot ends up
// holding it is a separate question and is asked over real cities below.

const drawn = new Map<ItemId, number>();
let nothing = 0;
{
  const world = createWorld();
  resetWorld(world);
  const id = 'probe';
  for (let i = 0; i < DRAWS; i++) {
    world.inventories.set(id, newInventory());
    const item = giveStartingItem(world, id, 1000, 1000);
    if (item === null) nothing++;
    else drawn.set(item, (drawn.get(item) ?? 0) + 1);
  }
}

let withSomething = 0;
let bots = 0;
let vested = 0;
let overCap = 0;
let startPickupsLeft = 0;
let rarityZero = 0;

for (let c = 0; c < CITIES; c++) {
  const world = createWorld();
  world.botOfficerCount = BOTS;
  resetWorld(world);

  // What is on the floor, which the draw is supposed to sit outside of.
  const onFloor = new Map<ItemId, number>();
  for (const p of world.pickups.values()) {
    if (p.id.startsWith('loot-test-')) continue;
    if (p.id.startsWith('loot-start-')) startPickupsLeft++;
    // **The armoury's radio is outside `ITEM_CITY_CAP` in both directions**, by
    // design and by name — it is not refused when the city already holds its
    // two and it does not count toward them, so a round can legitimately
    // finish with three. Counted here it read 11-13 cities of 40 "over the
    // cap", which is the station's own 30% roll and nothing to do with the
    // starting draw this file is about.
    if (p.id === STATION_RADIO_ID) continue;
    onFloor.set(p.item, (onFloor.get(p.item) ?? 0) + 1);
  }
  // The city's own ceiling still has to hold *on the floor*.
  for (const [item, n] of onFloor) {
    const cap = ITEM_CITY_CAP[item as keyof typeof ITEM_CITY_CAP];
    if (cap !== undefined && n > cap) overCap++;
  }

  for (const id of world.bots) {
    bots++;
    if (gotSomething(world, id)) withSomething++;
    const inv = world.inventories.get(id);
    // Started in a vest: at least one full one (a draw of `kevlar` on top adds a
    // second, so >= rather than ===).
    if (inv && inv.kevlarUses.length >= 1 && inv.kevlarUses[0] === KEVLAR_POINTS
      && inv.utilities.filter((u) => u === 'kevlar').length === inv.kevlarUses.length) {
      vested++;
    }
  }
}

for (const item of drawn.keys()) {
  if (ITEMS[item].rarity === 0) rarityZero++;
}

const total = [...drawn.values()].reduce((a, b) => a + b, 0);
const ranked = [...drawn.entries()].sort((a, b) => b[1] - a[1]);
const line = (item: ItemId, n: number): string => {
  const tickets = ALL_LOOT.filter((i) => i === item).length;
  return `    ${item.padEnd(16)} ${String(n).padStart(4)}  ${share(n, total).padStart(6)}  table says ${share(tickets, ALL_LOOT.length)}`;
};
console.log(`--- a random item for every blue officer`);
console.log(`  bots that started in a vest ${vested}/${bots}  (must be ${bots})`);
console.log(`  bots that got a draw too  ${withSomething}/${bots} (${share(withSomething, bots)})`);
console.log(`  draws that came to nothing ${nothing}/${DRAWS}  (must be 0)`);
console.log(`  rarity-0 items drawn     ${rarityZero}  (must be 0)`);
console.log(`  loot-start- left on map  ${startPickupsLeft}  (must be 0)`);
console.log(`  city caps broken on the floor ${overCap}  (must be 0)`);
console.log(`  distinct items drawn     ${drawn.size} of ${new Set(ALL_LOOT).size} in the table`);
console.log(`  commonest`);
for (const [item, n] of ranked.slice(0, 5)) console.log(line(item, n));
console.log(`  rarest`);
for (const [item, n] of ranked.slice(-5)) console.log(line(item, n));

// ------------------------------------------------------- 2. the tracker

{
  const world = createWorld();
  world.botOfficerCount = 1;
  resetWorld(world);
  const id = [...world.bots][0];
  const inv = world.inventories.get(id)!;
  const e = world.entities.get(id)!;

  // Strip whatever it drew, so this measures the tracker and nothing else.
  inv.utilities.length = 0;
  const without = toWireInventory(world, id, inv, e.x, e.y, Date.now()).trackBearing;

  inv.utilities.push('zombieTracker');
  // Slot 0 — the pistol. The whole point is that it works without being held.
  inv.activeSlot = 0;
  const carried = toWireInventory(world, id, inv, e.x, e.y, Date.now()).trackBearing;

  inv.activeSlot = 4; // the tracker's own slot
  const held = toWireInventory(world, id, inv, e.x, e.y, Date.now()).trackBearing;

  console.log(`\n--- the tracker`);
  console.log(`  no tracker in the bag    ${without === null ? 'null' : without.toFixed(3)}  (must be null)`);
  console.log(`  carried, pistol in hand  ${carried === null ? 'null' : carried.toFixed(3)}  (must be a bearing)`);
  console.log(`  held, as it used to be   ${held === null ? 'null' : held.toFixed(3)}`);
  console.log(`  carried matches held     ${carried !== null && carried === held}`);
}

// --------------------------------------------------------- 3. door times

console.log(`\n--- bolt work, in seconds`);
console.log(`  npc lock                 ${DOOR_LOCK_MIN_MS / 1000}-${DOOR_LOCK_MAX_MS / 1000}  (was 1-2)`);
console.log(`  npc unlock               ${DOOR_NPC_UNLOCK_MS / 1000}      (was 2)`);
console.log(`  player lock              ${DOOR_PLAYER_LOCK_MS / 1000}   (was 1.5)`);
console.log(`  player unlock            ${DOOR_PLAYER_UNLOCK_MS / 1000}    (was 1)`);
console.log(`  player open, untouched   ${DOOR_PLAYER_OPEN_MS / 1000}`);
console.log(
  `  clear of TAP_MAX_MS      ${Math.min(DOOR_PLAYER_LOCK_MS, DOOR_PLAYER_UNLOCK_MS) / TAP_MAX_MS}x  (must be > 1)`,
);
