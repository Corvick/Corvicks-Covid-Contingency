import type { GunSlot, InventoryState, PickupState } from '../../shared/types.js';
import {
  ALL_LOOT,
  GUN_LOOT,
  ITEMS,
  UTILITY_LOOT,
  isGun,
  lootAtMost,
  rarestOf,
  type ItemId,
} from '../../shared/items.js';
import {
  GUN_SLOTS,
  UTILITY_SLOTS,
  PICKUP_REACH,
  DROP_HOLD_MS,
  KEVLAR_POINTS,
  SHIELD_POINTS,
  RALLY_STARTING_CHARGES,
  BUILDING_GUN_CHANCE,
  BUILDING_UTILITY_CHANCE,
  LOOT_MIN_GAP,
  COMPLEX_LOOT_PER_ROOM,
  COMPLEX_LOOT_DEPTH_BONUS,
  COMPLEX_LOOT_DOOR_GAP,
  COMPLEX_RARITY_CEILING,
  COMPLEX_RARITY_PER_DEPTH,
  GRENADE_COUNT,
  ZAP_MINE_COUNT,
  RADIO_USES,
  BACKPACK_SLOTS,
  GUNSLING_SLOTS,
  trackerRange,
  TEST_DROP_ALL_ITEMS,
  TEST_DROP_RADIUS,
  ONE_OFF_ITEMS,
  ITEM_CITY_CAP,
  GUARANTEED_ITEMS,
  GUARANTEE_EVERY_GUN,
  GUARANTEE_EVERY_UTILITY,
  PARK_LOOT_COUNT,
  PARK_LOOT_GUARANTEED_GUNS,
  PARK_LOOT_GUARANTEED_UTILITIES,
  PARK_LOOT_GUN_SHARE,
  PARK_LOOT_CLEARANCE,
  CITY_CAR_LOOT_GAP,
  POLICE_STATION_GUNS_MIN,
  POLICE_STATION_GUNS_MAX,
  POLICE_STATION_UTILITIES_MIN,
  POLICE_STATION_UTILITIES_MAX,
  POLICE_STATION_RADIO_CHANCE,
  POLICE_STATION_LOOT_GAP,
  PARK_LOOT_PATH_GAP,
  POND_LOOT_GAP,
  POND_LOOT_BAND,
  BEACON_MUSTER_RADIUS,
  BEACON_ONE_PER_CITY,
  TEST_BEACON_ON_A_BOT,
} from '../../shared/constants.js';
import type { World } from './world.js';

/**
 * The armoury radio's pickup id, which is the whole of how it sits outside
 * `ITEM_CITY_CAP` — `cityCount` skips it and `drawItem` never sees it. Named
 * rather than inlined because the places that have to agree on it are now
 * three, and a typo in any of them would silently put the radio back under the
 * ceiling — or, in the harness's case, report a ceiling broken that never was.
 *
 * Exported for `server/startkit.ts`, which counts what is on the floor and had
 * no way to tell this one apart. It read **11-13 cities of 40 over the cap**,
 * which is `POLICE_STATION_RADIO_CHANCE` (0.3) of forty and was the armoury
 * doing exactly what it is documented to do.
 */
export const STATION_RADIO_ID = 'loot-armoury-radio';
import { chargeProgress, deployProgress } from './combat.js';
import { distToPath } from './mapgen.js';
import { pondRadiusAt } from '../../shared/pond.js';
import { callBackup, placeCityCar, placePoliceCars, spotBeside } from './backup.js';

export interface Inventory {
  /**
   * Always `GUN_SLOTS + GUNSLING_SLOTS` long. How many of them you may
   * actually use is `gunSlots()` — the last one only opens up while a gunsling
   * is in the bag, and the array is kept at full length so nothing has to be
   * resized when the sling is picked up or dropped.
   */
  guns: Array<GunSlot | null>;
  utilities: ItemId[];
  activeSlot: number;
  kevlar: number;
  /** Riot shield charges left, or 0 for no shield. */
  shield: number;
  /** In front of you rather than slung on your back. */
  shieldUp: boolean;
  /** Found a second pistol: slot 0 is a pair now, and still never runs out. */
  dual: boolean;
  /** Frags left. Like kevlar, the slot clears itself once they're gone. */
  grenades: number;
  /** Mines left, same bundle-in-one-slot arrangement. */
  mines: number;
  /** Cure doses left. Same arrangement again — see `utilitySlot`. */
  cureDoses: number;
  /**
   * Calls left on the radio, and the earliest it will answer again.
   *
   * Both ride the *pickup* through a drop, so putting it down and picking it
   * up again is neither a way to get the good first call back nor a way to
   * skip the minute's wait.
   */
  radioUses: number;
  radioReadyAt: number;
  /**
   * Worn upgrades. They take no numbered slot of their own — a sling and a
   * pack are things you have on, not things you select — so they are flags
   * rather than entries in `utilities`.
   */
  sling: boolean;
  pack: boolean;
  /** When E was pressed down, or null while released. */
  holdSince: number | null;
  /** Suppresses the tap-to-collect once a hold has already dropped something. */
  holdConsumed: boolean;
}

export function newInventory(): Inventory {
  return {
    guns: Array(GUN_SLOTS + GUNSLING_SLOTS).fill(null),
    utilities: [],
    activeSlot: 0,
    kevlar: 0,
    shield: 0,
    shieldUp: false,
    dual: false,
    grenades: 0,
    mines: 0,
    cureDoses: 0,
    radioUses: 0,
    radioReadyAt: 0,
    sling: false,
    pack: false,
    holdSince: null,
    holdConsumed: false,
  };
}

/** Gun slots this bag can use right now — three, or four with a sling. */
export function gunSlots(inv: Inventory): number {
  return GUN_SLOTS + (inv.sling ? GUNSLING_SLOTS : 0);
}

/** Utility slots this bag can use right now. The pack pays for its own slot. */
export function utilitySlots(inv: Inventory): number {
  return UTILITY_SLOTS + (inv.pack ? BACKPACK_SLOTS : 0);
}

/** Scatter loot through the city. Most buildings come up empty. */
/**
 * TESTING: one of everything within arm's reach, dropped around whoever has
 * just spawned.
 *
 * Deliberately *not* part of the city. It used to be laid down with the rest
 * of the loot at world generation, which put a heap of every item in the game
 * on the map before anybody had joined — bots walked to it, fought over it and
 * kitted themselves out of it, and every measurement of how loot behaves was
 * taken against a pile that would never exist in a real round.
 *
 * The *pistol* is in the pile on purpose — you start with one, and a second
 * one is the thing worth testing. `dualPistols` is not: it is what slot 0
 * turns into, not an object, and one lying on the ground is nonsense.
 */
export function dropDebugKit(world: World, owner: string, x: number, y: number): void {
  if (!TEST_DROP_ALL_ITEMS) return;
  // **Offline only.** It is a testing tool, and in a round with other people in
  // it it is one player being handed one of every item in the game where the
  // rest of the city has to go and find them. `TEST_DROP_ALL_ITEMS` is left on
  // by default precisely because it is safe to leave on while measuring
  // anything that is not about loot — and it stops being safe the moment a
  // second person is in the lobby, which is what this line covers. The flag is
  // still the master switch: turning it off takes the ring out of solo rounds
  // too.
  if (!world.offline) return;
  const ids = (Object.keys(ITEMS) as ItemId[]).filter((id) => id !== 'dualPistols');
  ids.forEach((item, i) => {
    const angle = (i / ids.length) * Math.PI * 2;
    const id = `loot-test-${owner}-${i}`;
    world.pickups.set(id, {
      id,
      item,
      x: x + Math.cos(angle) * TEST_DROP_RADIUS,
      y: y + Math.sin(angle) * TEST_DROP_RADIUS,
    });
  });
}

/**
 * One random item in the bag of everybody who holds a player slot.
 *
 * "Blue officers" is the whole rule: a player and a bot are the same blue
 * figure and the same slot, and the city's grey officers, the SWAT out of a
 * van and the soldiers off a helicopter get nothing. It is a leg-up for the
 * five people the round is actually about, and it is the *variety* that is the
 * point — every round now opens with somebody holding something, and which
 * something is the first thing that makes one round different from the last.
 *
 * **It follows rarity and ignores the map.**
 *
 * - Rarity is `ALL_LOOT`, the same weighted tables the buildings roll on, so a
 *   sniper is as unlikely here as it is in a house and rarity 0 cannot come up
 *   at all — no grenade launcher, no second beacon.
 * - The city's limits are deliberately not consulted. `ITEM_CITY_CAP` is a
 *   ceiling on what is lying on the *floor* — see the radio, where three vans
 *   in a round was the complaint — and this is not on the floor. Nor does it
 *   take a loot spot from a building or satisfy the every-gun floor, both of
 *   which count placed pickups: the pickup made here is collected on the same
 *   line it is created and is gone before `spawnPickups` ever runs.
 *
 * **It is granted by collecting a real pickup rather than by writing into the
 * bag**, which looks roundabout and is the only version that cannot rot.
 * `collect` is where a duplicate gun becomes ammunition, a second pistol
 * becomes `dual`, a sling or a pack becomes a worn flag, a lozenge is spent on
 * the spot and the shield and the heavy MG refuse each other. Written out
 * again here, the first of those rules to change would quietly stop applying
 * to whatever everybody starts the round holding.
 *
 * **A draw that cannot be taken is re-rolled**, the same as a capped one is in
 * `spawnPickups`. In practice that means exactly one item: the ammo box, which
 * `applyUtility` refuses to anybody holding nothing but a pistol, and a bag at
 * the start of a round is nothing but a pistol. So the ammo box is the one entry
 * in the table nobody can ever start with — measured over 20,000 draws — which
 * is correct rather than a gap: a box of rounds for a gun you do not have yet is
 * the one draw that would have been no draw at all. Without the re-roll it would
 * be 4% of officers starting empty-handed, which is indistinguishable from the
 * feature being broken.
 *
 * Success is read off the pickup being gone rather than off `collect`'s
 * message, which is prose.
 */
export function giveStartingItem(world: World, id: string, x: number, y: number): ItemId | null {
  const inv = world.inventories.get(id);
  if (!inv) return null;
  for (let attempt = 0; attempt < 12; attempt++) {
    const item = ALL_LOOT[Math.floor(Math.random() * ALL_LOOT.length)];
    const pid = `loot-start-${id}`;
    world.pickups.set(pid, { id: pid, item, x, y });
    collect(world, id, inv, x, y, pid);
    if (!world.pickups.has(pid)) return item;
    world.pickups.delete(pid);
  }
  return null;
}

export function spawnPickups(world: World): void {
  world.pickups.clear();
  let n = 0;

  /**
   * Drop one item somewhere inside this building. Kept off the walls and
   * inside the real footprint rather than the bounding box — an L-shaped
   * building's notch is outdoors — and never on top of something already
   * lying there, since a house can hold more than one thing now.
   */
  const placeIn = (
    b: (typeof world.map.buildings)[number],
    item: ItemId,
    prefix = 'loot',
  ): boolean => {
    for (let attempt = 0; attempt < 18; attempt++) {
      const rect = b.rects[Math.floor(Math.random() * b.rects.length)];
      if (!rect) return false;
      const x = rect.x + 18 + Math.random() * Math.max(1, rect.w - 36);
      const y = rect.y + 6 + Math.random() * Math.max(1, rect.h - 12);
      if (world.nav.isBlocked(x, y) || !world.nav.isReachable(x, y)) continue;
      let crowded = false;
      for (const p of world.pickups.values()) {
        if (Math.hypot(p.x - x, p.y - y) < LOOT_MIN_GAP) {
          crowded = true;
          break;
        }
      }
      if (crowded) continue;
      const id = `${prefix}-${n++}`;
      world.pickups.set(id, { id, item, x, y });
      return true;
    }
    return false;
  };

  /** Somewhere indoors, anywhere. Tries a handful of houses and gives up. */
  const placeSomewhere = (item: ItemId, prefix: string): boolean => {
    const houses = world.map.buildings;
    if (houses.length === 0) return false;
    for (let tries = 0; tries < 12; tries++) {
      const b = houses[Math.floor(Math.random() * houses.length)];
      if (placeIn(b, item, prefix)) return true;
    }
    return false;
  };

  /**
   * Draw from a loot table, honouring `ITEM_CITY_CAP`.
   *
   * Every way loot reaches the map goes through here — the building roll, the
   * park stash, the pond bank — because a ceiling enforced at two of the three
   * is not a ceiling. A capped draw is **re-rolled rather than dropped**: the
   * house still gets its utility, it just isn't a third radio, so the amount of
   * loot in a city is untouched and only the mix moves.
   *
   * Counted by scanning what has actually been placed rather than by keeping a
   * tally, because placement can fail — the park gives a spot 24 tries and may
   * come away with nothing — and a tally incremented at the draw would count
   * items that never landed. The scan is ~100 pickups against ~100 draws, which
   * is nothing, and it cannot drift out of step with the map.
   *
   * The debug heap is excluded on the same test the every-gun floor uses: that
   * is one of everything at a player's feet, and is not the city's loot.
   */
  const cityCount = (item: ItemId): number => {
    let seen = 0;
    for (const p of world.pickups.values()) {
      if (p.id.startsWith('loot-test-')) continue;
      // **The armoury radio does not count toward the ceiling.** It is placed
      // outside `drawItem` so the cap cannot refuse it; counting it here would
      // let it push an ordinary house's radio off the map instead, which is the
      // cap doing the opposite of its job — see `POLICE_STATION_RADIO_CHANCE`.
      if (p.id === STATION_RADIO_ID) continue;
      if (p.item === item) seen++;
    }
    return seen;
  };
  const drawItem = (table: ItemId[]): ItemId => {
    let item = table[Math.floor(Math.random() * table.length)];
    // A handful of re-rolls rather than a filtered table: rebuilding the
    // weighted list per draw would cost more than it saves, and at one capped
    // item in thirty-seven, twelve straight refusals is a vanishing case.
    for (let attempt = 0; attempt < 12; attempt++) {
      const cap = ITEM_CITY_CAP[item];
      if (cap === undefined || cityCount(item) < cap) return item;
      item = table[Math.floor(Math.random() * table.length)];
    }
    return item;
  };

  // A house rolls for a gun and, separately, for something to go with it.
  // They used to compete for the single item a building could hold, which is
  // why a house with a rifle in it never also had a vest.
  for (const b of world.map.buildings) {
    if (Math.random() < BUILDING_GUN_CHANCE) {
      placeIn(b, drawItem(GUN_LOOT));
    }
    if (Math.random() < BUILDING_UTILITY_CHANCE) {
      placeIn(b, drawItem(UTILITY_LOOT));
    }
  }

  /**
   * And the corner complex is stocked, with the scarcity going up as you go in.
   *
   * Every room of it gets a draw of its own — which is what makes it *more*
   * loot rather than better loot in the same one place — and the rarity
   * ceiling comes down by `COMPLEX_RARITY_PER_DEPTH` for every doorway between
   * a room and the street. The front rooms therefore draw from the whole table
   * exactly as any other house does, and four doorways in there is nothing but
   * the rarest tier left in the table at all.
   *
   * **Placed by room, not by rect.** `placeIn` samples the building's footprint
   * rows, which for a twenty-room landmark is a lottery over the whole thing —
   * there would be no way to say which room anything landed in, and the
   * gradient is the entire feature. `RoomMap.randomPoint` is uniform over one
   * room's own floor cells, which is the same tool `settledTick` paces with and
   * the only honest one for an L-shaped room.
   *
   * It goes through `drawItem` like everything else, so `ITEM_CITY_CAP` still
   * holds: a twenty-room complex would otherwise be the fastest way in the game
   * to put six radios on one map.
   */
  const complex = world.map.cornerBuilding;
  if (complex >= 0) {
    for (const roomId of world.rooms.roomsOf(complex)) {
      const room = world.rooms.rooms[roomId];
      if (!room || !Number.isFinite(room.depth)) continue;

      const ceiling = COMPLEX_RARITY_CEILING - room.depth * COMPLEX_RARITY_PER_DEPTH;
      const table = lootAtMost(ceiling);
      const count = COMPLEX_LOOT_PER_ROOM + Math.floor(room.depth / COMPLEX_LOOT_DEPTH_BONUS);

      for (let i = 0; i < count; i++) {
        const item = drawItem(table);
        for (let attempt = 0; attempt < 20; attempt++) {
          const spot = world.rooms.randomPoint(roomId);
          if (!spot) break;
          if (world.nav.isBlocked(spot.x, spot.y) || !world.nav.isReachable(spot.x, spot.y)) continue;

          // Never in a doorway. A room's id bleeds a couple of cells past its
          // own floor (`ROOM_DILATE_CELLS`) so that somebody standing in a
          // threshold reads as being in a room — which means `randomPoint` can
          // hand back the threshold itself, and a rifle lying in the one gap
          // between two rooms is a rifle everybody trips over on the way past.
          let inADoorway = false;
          for (const index of room.exits) {
            const door = world.map.doors[index];
            if (door && Math.hypot(door.x - spot.x, door.y - spot.y) < COMPLEX_LOOT_DOOR_GAP) {
              inADoorway = true;
              break;
            }
          }
          if (inADoorway) continue;

          let crowded = false;
          for (const p of world.pickups.values()) {
            if (Math.hypot(p.x - spot.x, p.y - spot.y) < LOOT_MIN_GAP) {
              crowded = true;
              break;
            }
          }
          if (crowded) continue;

          const id = `loot-${n++}`;
          world.pickups.set(id, { id, item, x: spot.x, y: spot.y });
          break;
        }
      }
    }
  }

  // A few things stashed in the park, tucked into the undergrowth rather than
  // left out on the grass — the whole point of putting loot there is that you
  // sit on open grass with no bush within PARK_LOOT_CLEARANCE of them, so they
  // can actually be seen from a few paces off — foliage is drawn over the top
  // of a pickup and a rifle under a canopy is a rifle nobody finds. Still held
  // off the dirt path, so five of them are not strung out along the one
  // walkway.
  //
  // The first two entries are a gun and a utility outright. The rest roll on
  // the share, which can easily come up all one kind — and a park with nothing
  // in it worth carrying a gun for is a park nobody walks into twice.
  const park = world.map.park;
  const parkTables: ItemId[][] = [
    ...Array<ItemId[]>(PARK_LOOT_GUARANTEED_GUNS).fill(GUN_LOOT),
    ...Array<ItemId[]>(PARK_LOOT_GUARANTEED_UTILITIES).fill(UTILITY_LOOT),
    ...Array.from({ length: PARK_LOOT_COUNT }, () =>
      Math.random() < PARK_LOOT_GUN_SHARE ? GUN_LOOT : UTILITY_LOOT,
    ),
  ];
  for (const table of parkTables) {
    const item = drawItem(table);
    for (let attempt = 0; attempt < 24; attempt++) {
      const x = park.x + 30 + Math.random() * Math.max(1, park.w - 60);
      const y = park.y + 30 + Math.random() * Math.max(1, park.h - 60);
      if (world.nav.isBlocked(x, y) || !world.nav.isReachable(x, y)) continue;
      if (distToPath(park.path, x, y) < park.pathWidth / 2 + PARK_LOOT_PATH_GAP) continue;

      // **Clear of every bush, not tucked under one.** See PARK_LOOT_CLEARANCE.
      let underCover = false;
      for (const bush of world.map.bushes) {
        if (Math.hypot(bush.x - x, bush.y - y) <= bush.r + PARK_LOOT_CLEARANCE) {
          underCover = true;
          break;
        }
      }
      if (underCover) continue;

      let crowded = false;
      for (const p of world.pickups.values()) {
        if (Math.hypot(p.x - x, p.y - y) < LOOT_MIN_GAP) {
          crowded = true;
          break;
        }
      }
      if (crowded) continue;

      const id = `loot-${n++}`;
      world.pickups.set(id, { id, item, x, y });
      break;
    }
  }

  /**
   * **A patrol car parked in the middle of the city, with a gun and a piece of
   * kit on the tarmac beside it.**
   *
   * Here rather than in `resetWorld` for a layering reason worth knowing:
   * `world.ts` keeps a *type-only* import of `backup.ts` on purpose and so
   * cannot call `placeCityCar` — and `spawnPickups` clears the pickup table,
   * so anything laid down before it runs is wiped anyway. This module already
   * reaches both, and the car is the same kind of thing as the park stash and
   * the pond pair: a landmark with something worth walking to on it.
   *
   * The two items go through `drawItem` like everything else, so
   * `ITEM_CITY_CAP` still holds over them — a ceiling any one placement could
   * step round is not a ceiling.
   */
  const car = placeCityCar(world, Date.now());
  if (car) {
    // Along its flanks, one fore and one aft, on whichever side has kerb to
    // spare. The offsets clear the body by construction — which matters,
    // because `park` only sets `navDirty` and the grid it put the car into
    // is not rebuilt until the next tick, so a nav test cannot see it yet.
    const G = CITY_CAR_LOOT_GAP;
    const tables = [GUN_LOOT, UTILITY_LOOT];
    for (let i = 0; i < tables.length; i++) {
      const along = i === 0 ? -G : G;
      const at = spotBeside(world, car.x, car.y, car.facing, [
        { along, across: G },
        { along, across: -G },
        { along: -along, across: G },
        { along: -along, across: -G },
        { along: along * 1.8, across: 0 },
      ]);
      if (!at) continue;
      const id = `loot-car-${i}`;
      world.pickups.set(id, { id, item: drawItem(tables[i]), x: at.x, y: at.y });
    }
  }
  /**
   * **The station armoury, and the yard in front of it.**
   *
   * The one room in the city stocked as a *room* rather than as a building:
   * `placeIn` samples a building's footprint rows, which for the station would
   * scatter the guns through the lobby and the cell as readily as the armoury,
   * and the whole point of a police station is that the guns are in the place
   * with a door on it. `mapgen` hands over the interior rects for exactly this.
   *
   * Guns and utilities both draw through `drawItem`, so `ITEM_CITY_CAP` holds
   * over them like everywhere else. **The radio is the one exception in the
   * game**, and it is deliberate: the cap exists because three vans out of the
   * ordinary building roll was the *ordinary* case and nobody chose it, where
   * finding one in an armoury on the far side of the map is a thing you went
   * and did. It is placed directly, so the cap cannot refuse it, and it is
   * excluded from `cityCount`, so it cannot cost a house one either.
   */
  const station = world.map.policeStation;
  if (station) {
    placePoliceCars(world, Date.now());

    /*
     * **The armoury is laid out on its racks, not sampled for.**
     *
     * Everywhere else in the city a pickup is dropped by rejection sampling,
     * which is right when a house holds one item and there is a whole floor to
     * put it on. This room is asked for up to ten in a room the size of a
     * corridor, and a rejection sample at that density simply fails — measured
     * before any of this, it came away with three guns, no utilities and the
     * radio on 5% of maps against 30%.
     *
     * `station.racks` is the mouth of each stall between two of the dividers
     * `mapgen` jutted off the armoury walls — so a gun stands where a gun
     * would stand, and this file never works out where a divider is. Shuffled,
     * because taken in order the same stall would hold the radio every round.
     *
     * **Then the floor, when there are more items than stalls.** Nine racks
     * against a maximum draw of ten (6 guns, 3 utilities, a radio) leaves
     * about one round in fifty with something over, and an over-stocked
     * armoury with a crate on the floor is exactly what that looks like. The
     * grid below is the same shuffled sample that used to do all of it.
     */
    const slots: Array<{ x: number; y: number }> = [];
    for (const spot of station.racks) {
      if (world.nav.isBlocked(spot.x, spot.y) || !world.nav.isReachable(spot.x, spot.y)) continue;
      slots.push(spot);
    }
    for (let i = slots.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [slots[i], slots[j]] = [slots[j], slots[i]];
    }
    {
      const G = POLICE_STATION_LOOT_GAP;
      const room = station.armoury;
      const floor: Array<{ x: number; y: number }> = [];
      const cols = Math.max(1, Math.floor((room.w - 24) / G) + 1);
      const rows = Math.max(1, Math.floor((room.h - 24) / G) + 1);
      const spanX = cols > 1 ? (room.w - 24) / (cols - 1) : 0;
      const spanY = rows > 1 ? (room.h - 24) / (rows - 1) : 0;
      for (let c = 0; c < cols; c++) {
        for (let r = 0; r < rows; r++) {
          const x = room.x + 12 + c * spanX;
          const y = room.y + 12 + r * spanY;
          // A slot inside geometry is skipped rather than nudged: the grid is
          // built off the room the walls actually left, so this is a belt and
          // braces against a plan change rather than an expected case.
          if (world.nav.isBlocked(x, y) || !world.nav.isReachable(x, y)) continue;
          // Not on top of a rack: that item is already there.
          if (slots.some((s) => Math.hypot(s.x - x, s.y - y) < G)) continue;
          floor.push({ x, y });
        }
      }
      for (let i = floor.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [floor[i], floor[j]] = [floor[j], floor[i]];
      }
      slots.push(...floor);
    }
    let next = 0;
    const rack = (item: ItemId, id: string): void => {
      const at = slots[next++];
      if (!at) return;
      world.pickups.set(id, { id, item, x: at.x, y: at.y });
    };
    const guns =
      POLICE_STATION_GUNS_MIN +
      Math.floor(Math.random() * (POLICE_STATION_GUNS_MAX - POLICE_STATION_GUNS_MIN + 1));
    const utils =
      POLICE_STATION_UTILITIES_MIN +
      Math.floor(
        Math.random() * (POLICE_STATION_UTILITIES_MAX - POLICE_STATION_UTILITIES_MIN + 1),
      );
    let slot = 0;
    for (let i = 0; i < guns; i++) {
      rack(drawItem(GUN_LOOT), `loot-armoury-${slot++}`);
    }
    for (let i = 0; i < utils; i++) {
      rack(drawItem(UTILITY_LOOT), `loot-armoury-${slot++}`);
    }
    if (Math.random() < POLICE_STATION_RADIO_CHANCE) {
      rack('radio', STATION_RADIO_ID);
    }
  }

  // And a pair on the bank of the duck pond: one gun and one utility, both out
  // of the scarcest tier there is. The pond was the one landmark with nothing
  // to do in it — ornamental water, a flock of ducks, and no reason to walk
  // over. Placed independently rather than side by side, so finding one is not
  // finding both and you have to work your way round the water for the other.
  //
  // The **beacon handset** goes on the same bank, and is a third placement
  // rather than one of the two — it does not take the gun's spot or the
  // utility's. It is rarity 0, so nothing else in the city can place one and
  // this is the only survivor beacon there will ever be.
  const pond = world.map.pond;
  const bankTables: Array<ItemId[]> = [rarestOf('gun'), rarestOf('utility')];
  // TESTING: `populate` has already handed it to a bot, so leaving one here as
  // well would put two in a city that is meant to have exactly one. Same
  // condition on both sides, and both fall back to the bank when there are no
  // bots to give it to.
  const beaconOnABot = TEST_BEACON_ON_A_BOT && world.bots.size > 0;
  if (BEACON_ONE_PER_CITY && !beaconOnABot) bankTables.push(['survivorBeacon']);
  for (const table of bankTables) {
    const item = drawItem(table);
    for (let attempt = 0; attempt < 40; attempt++) {
      // A bearing off the pond's centre, then out past the water's edge at
      // that bearing. The edge is a radius-per-bearing rather than a circle,
      // so this is the only honest way to sit *on the bank* all the way round.
      const angle = Math.random() * Math.PI * 2;
      const out = pondRadiusAt(pond, angle) + POND_LOOT_GAP + Math.random() * POND_LOOT_BAND;
      const x = pond.x + Math.cos(angle) * out;
      const y = pond.y + Math.sin(angle) * out;
      if (world.nav.isBlocked(x, y) || !world.nav.isReachable(x, y)) continue;

      let crowded = false;
      for (const p of world.pickups.values()) {
        if (Math.hypot(p.x - x, p.y - y) < LOOT_MIN_GAP) {
          crowded = true;
          break;
        }
      }
      if (crowded) continue;

      const id = `loot-pond-${item}`;
      world.pickups.set(id, { id, item, x, y });
      break;
    }
  }

  // Spots that may be taken over by a placed item — anything already placed by
  // hand is off limits, or the second placement would eat the first. Asked by
  // *id* rather than by item, since the floor below now covers nearly the whole
  // registry and a set of items would leave nothing takeable at all. The debug
  // pile is off limits too: it sits at the player's feet rather than in a
  // building, and counting it would have the every-gun floor satisfied by a
  // heap of test items and never place anything in the city at all.
  const inACity = (p: PickupState) => !p.id.startsWith('loot-test-');
  // The patrol car's pair is placed by hand too, and for the same reason as the
  // other two: a takeover *deletes* the id it lands on and re-adds under its
  // own, so leaving them takeable meant the car's gun could quietly become a
  // second utility. Measured before this, the pair was one item short of what
  // the rig looked up in **1 city in 8** — the item was still lying there, but
  // under another name and no longer a gun.
  const byHand = (p: PickupState) =>
    p.id.startsWith('loot-oneoff-') ||
    p.id.startsWith('loot-min-') ||
    p.id.startsWith('loot-car-') ||
    p.id.startsWith('loot-armoury-') ||
    p.id === STATION_RADIO_ID;
  const freeSpots = () =>
    Array.from(world.pickups.values()).filter((p) => inACity(p) && !byHand(p));

  // Exactly one of each one-off item, placed by taking over an ordinary loot
  // spot. They are out of the loot table entirely, so this is the only way
  // either of them reaches the map.
  for (const item of ONE_OFF_ITEMS) {
    const spots = freeSpots();
    if (spots.length === 0) break;
    const at = spots[Math.floor(Math.random() * spots.length)];
    world.pickups.delete(at.id);
    const id = `loot-oneoff-${item}`;
    world.pickups.set(id, { id, item, x: at.x, y: at.y });
  }

  // And a floor under every gun *and* every utility: if the loot table happened
  // not to roll one anywhere, put one in. Something missing from the map
  // entirely is a worse kind of rare than a scarce one, and deriving the list
  // from the registry means anything added later is covered without anyone
  // remembering to list it.
  //
  // Rarity 0 is excluded because those are placed by their own roll above,
  // and so is the pistol, which you always have.
  const floorOf = (kind: 'gun' | 'utility'): ItemId[] =>
    (Object.keys(ITEMS) as ItemId[]).filter(
      (id) =>
        isGun(id) === (kind === 'gun') &&
        id !== 'pistol' &&
        id !== 'dualPistols' &&
        ITEMS[id].rarity > 0,
    );
  const everyGun = GUARANTEE_EVERY_GUN ? floorOf('gun') : [];
  const everyUtility = GUARANTEE_EVERY_UTILITY ? floorOf('utility') : [];

  // Counted once rather than per item: the floor is two dozen entries now, and
  // re-walking every pickup for each of them is a sweep of the whole map two
  // dozen times over for an answer that cannot change while we look.
  const inTheCity = new Set<ItemId>();
  for (const p of world.pickups.values()) {
    if (inACity(p)) inTheCity.add(p.item);
  }

  for (const item of new Set<ItemId>([...GUARANTEED_ITEMS, ...everyGun, ...everyUtility])) {
    if (inTheCity.has(item)) continue;
    // Placed into a house of its own where there is room for one, rather than
    // taking an existing spot over. The floor used to displace an ordinary
    // item, which was fine when it was four rare guns and is not when it is
    // every gun and every utility — a third of the city's loot would have been
    // the guarantee eating the roll. Falling back to a takeover keeps the
    // promise absolute on a map with no room left.
    if (placeSomewhere(item, 'loot-min')) continue;
    const spots = freeSpots();
    if (spots.length === 0) break;
    const at = spots[Math.floor(Math.random() * spots.length)];
    world.pickups.delete(at.id);
    const id = `loot-min-${item}`;
    world.pickups.set(id, { id, item, x: at.x, y: at.y });
  }
}

export function nearestPickup(world: World, x: number, y: number): PickupState | null {
  let best: PickupState | null = null;
  let bestDist = PICKUP_REACH;
  for (const p of world.pickups.values()) {
    const d = Math.hypot(p.x - x, p.y - y);
    if (d < bestDist) {
      bestDist = d;
      best = p;
    }
  }
  return best;
}

/** The item currently in hand, or null when the active slot is empty. */
export function heldItem(inv: Inventory): ItemId | null {
  if (inv.activeSlot === 0) return inv.dual ? 'dualPistols' : 'pistol';
  if (inv.activeSlot <= gunSlots(inv)) return inv.guns[inv.activeSlot - 1]?.item ?? null;
  // Numbering is contiguous, so a gunsling shifts the utilities along by one
  // — and the HUD renumbers with it, so what is on screen is what the key
  // selects. Keyed off the live count, not the constant, for that reason.
  return inv.utilities[inv.activeSlot - gunSlots(inv) - 1] ?? null;
}

export function heldGunSlot(inv: Inventory): GunSlot | null {
  if (inv.activeSlot === 0 || inv.activeSlot > gunSlots(inv)) return null;
  return inv.guns[inv.activeSlot - 1];
}

/**
 * What picking a utility up does: some are used on the spot and vanish, some
 * are carried, and some refuse to be picked up at all because using them right
 * now would waste them.
 */
type UtilityOutcome = 'used' | 'carry' | 'refuse';

function applyUtility(
  world: World,
  playerId: string,
  inv: Inventory,
  item: ItemId,
  /** The thing on the floor, for kit that remembers what is left of it. */
  pickup?: PickupState,
): UtilityOutcome {
  // An ammo box tops up the gun in your hands and is gone. The pistol has
  // unlimited rounds, so it refuses rather than letting you waste the box.
  // A box is rounds, not a magazine: it adds to whatever the gun in your hands
  // is carrying rather than topping it up to a full one. Being full is no
  // longer a reason to leave it on the floor — you just end up with more than
  // a magazine's worth. The pistol still refuses it, having nothing to add to.
  if (item === 'ammoBox') {
    const slot = heldGunSlot(inv);
    if (!slot) return 'refuse';
    slot.ammo += ITEMS[slot.item].ammo ?? 0;
    return 'used';
  }

  // Some utilities are consumed the moment they're picked up.
  if (item === 'lozenge') {
    world.rallyCharges.set(playerId, (world.rallyCharges.get(playerId) ?? 0) + RALLY_STARTING_CHARGES);
    // A lozenge also buys back a follow command.
    world.followCharges.set(playerId, (world.followCharges.get(playerId) ?? 0) + 1);
    return 'used';
  }
  // Kevlar is worn, not consumed on pickup — it takes up a utility slot until
  // its three uses are spent, so wearing one costs you a slot you could have
  // filled with something else.
  if (item === 'kevlar') {
    inv.kevlar = KEVLAR_POINTS;
    return 'carry';
  }
  // Worn like the vest, and like the vest it costs a slot for as long as it
  // lasts. It goes up the moment you pick it up — a shield on your back is a
  // decision, not a default.
  // The radio is worked by hand now rather than going off on pickup — see the
  // `radio` branch in `fireHeld`. What happens here is only that it remembers:
  // a radio lying on the floor carries what is left of it, so the one you find
  // may already have had its best call spent by whoever dropped it.
  if (item === 'radio') {
    inv.radioUses = pickup?.uses ?? RADIO_USES;
    inv.radioReadyAt = pickup?.readyAt ?? 0;
    return 'carry';
  }
  if (item === 'riotShield') {
    inv.shield = SHIELD_POINTS;
    inv.shieldUp = true;
    return 'carry';
  }
  // Grenades come as a bundle and count down like kevlar does, so three of
  // them cost one slot rather than three.
  if (item === 'grenade') {
    inv.grenades += GRENADE_COUNT;
    return inv.utilities.includes('grenade') ? 'used' : 'carry';
  }
  if (item === 'zapMine') {
    inv.mines += ZAP_MINE_COUNT;
    return inv.utilities.includes('zapMine') ? 'used' : 'carry';
  }
  // A gun by every other measure, but the doses stack in one slot rather than
  // a second cure gun taking a second one.
  if (item === 'cureGun') {
    inv.cureDoses += ITEMS.cureGun.ammo ?? 0;
    return inv.utilities.includes('cureGun') ? 'used' : 'carry';
  }
  // Worn rather than carried: they cost no slot, so picking one up is pure
  // gain and a second of either is dead weight left on the floor.
  if (item === 'gunsling') {
    if (inv.sling) return 'refuse';
    inv.sling = true;
    return 'used';
  }
  if (item === 'backpack') {
    if (inv.pack) return 'refuse';
    inv.pack = true;
    return 'used';
  }
  return 'carry'; // boots, binoculars, tracker, smoke, and anything else worn
}

/**
 * Tap E. Picks the item up, or — when all three gun slots are already full and
 * you're holding a gun — swaps the held one for whatever is on the floor.
 */
export function collect(
  world: World,
  playerId: string,
  inv: Inventory,
  x: number,
  y: number,
  wantId?: string,
): string | null {
  // `wantId` names a specific pickup — a bot that walked across the map for
  // one thing shouldn't take whatever happens to be nearest instead, least of
  // all the empty gun it just dropped at its own feet.
  let pickup = nearestPickup(world, x, y);
  if (wantId) {
    const wanted = world.pickups.get(wantId);
    if (wanted && Math.hypot(wanted.x - x, wanted.y - y) <= PICKUP_REACH) pickup = wanted;
  }
  if (!pickup) return null;

  const def = ITEMS[pickup.item];

  // The shield and the heavy MG both claim right-click, and the shield's claim
  // doesn't depend on what is in your hands — it is worn, not held. Rather than
  // leave one of them quietly broken, you carry one or the other. Refusing at
  // pickup means nothing downstream ever has to cope with both.
  if (pickup.item === 'riotShield' && inv.guns.some((g) => g?.item === 'heavyMg')) {
    return 'no hand free for a shield with the heavy MG';
  }
  if (pickup.item === 'heavyMg' && inv.shield > 0) {
    return 'not while you are carrying the shield';
  }

  // `kind` says what it is; `utilitySlot` says where it goes. The cure gun is
  // both a gun and a thing you carry on the belt, so the slot question is
  // asked separately from every other question about it.
  if (def.kind === 'utility' || def.utilitySlot) {
    const outcome = applyUtility(world, playerId, inv, pickup.item, pickup);
    if (outcome === 'refuse') return 'nothing that would use it';
    if (outcome === 'used') {
      world.pickups.delete(pickup.id);
      return `used ${def.label}`;
    }
    if (inv.utilities.length >= utilitySlots(inv)) return 'utility slots full';
    inv.utilities.push(pickup.item);
    world.pickups.delete(pickup.id);
    return `picked up ${def.label}`;
  }

  // A second pistol isn't a gun, it's the other hand. It costs no slot and
  // upgrades the one you can never lose, so the sidearm stops being purely
  // the thing you fall back to when everything else is dry.
  //
  // `dualPistols` counts as one of these, not as a gun. It is what slot 0
  // *becomes* and has no business sitting in a slot of its own — but it is a
  // real entry in the registry, so anything that walks `ITEMS` can put one on
  // the floor. Taken as a gun it lands in a slot with no rounds in it and
  // never sets `dual`, which reads exactly as "duel pistols don't work and
  // don't replace the pistol on slot 0". Handled here so it cannot happen
  // whatever put it there.
  if (pickup.item === 'pistol' || pickup.item === 'dualPistols') {
    if (inv.dual) return 'already holding a pair';
    inv.dual = true;
    world.pickups.delete(pickup.id);
    return 'paired up — dual pistols';
  }

  // A gun that was dropped keeps whatever was left in it; one that spawned in
  // the world comes with a full magazine.
  const loaded = pickup.ammo ?? def.ammo ?? 0;

  // A second of something you're already carrying is ammunition, not a gun.
  // Carrying two of the same is strictly worse than carrying one loaded one —
  // you can only fire the one — so a duplicate is stripped for its rounds.
  // This is checked ahead of the free-slot case on purpose: filling a slot
  // with a copy of what's in the next slot along is never the better outcome.
  const twin = inv.guns.findIndex((g) => g !== null && g.item === pickup.item);
  if (twin >= 0) {
    if (loaded <= 0) return `that ${def.label} is empty`;
    inv.guns[twin]!.ammo += loaded;
    world.pickups.delete(pickup.id);
    return `stripped a ${def.label} for ${loaded} rounds`;
  }

  const free = inv.guns.findIndex((g, i) => g === null && i < gunSlots(inv));
  if (free >= 0) {
    inv.guns[free] = { item: pickup.item, ammo: loaded };
    inv.activeSlot = free + 1;
    world.pickups.delete(pickup.id);
    return `picked up ${def.label}`;
  }

  // No room: swap whatever is in hand for what's on the ground.
  const slot = heldGunSlot(inv);
  if (!slot) return 'gun slots full — hold a gun to swap';

  const dropped = slot.item;
  const droppedAmmo = slot.ammo;
  inv.guns[inv.activeSlot - 1] = { item: pickup.item, ammo: loaded };
  world.pickups.delete(pickup.id);
  // What you put down is what you were carrying, rounds and all. Handing back
  // a full magazine made swapping a way to manufacture ammo.
  world.pickups.set(pickup.id, {
    id: pickup.id,
    item: dropped,
    x: pickup.x,
    y: pickup.y,
    ammo: droppedAmmo,
  });
  return `swapped for ${def.label}`;
}

/** Hold E. Drops whatever is in hand; the pistol is bolted to slot 0. */
export function dropHeld(world: World, inv: Inventory, x: number, y: number): string | null {
  const item = heldItem(inv);
  // Slot 0 is bolted down, pair or not.
  if (!item || item === 'pistol' || item === 'dualPistols') return null;

  // Guns go down with what was left in them, so an empty one stays empty on
  // the floor and reads as not worth the walk.
  const gunSlot = heldGunSlot(inv);
  const ammo = gunSlot ? gunSlot.ammo : undefined;

  if (inv.activeSlot <= gunSlots(inv)) inv.guns[inv.activeSlot - 1] = null;
  else inv.utilities.splice(inv.activeSlot - gunSlots(inv) - 1, 1);

  // Worn kit is worn *because* the slot is occupied. Dropping the vest has to
  // take the protection with it, or you keep the armour and free the slot.
  if (item === 'kevlar') inv.kevlar = 0;
  if (item === 'grenade') inv.grenades = 0;
  if (item === 'zapMine') inv.mines = 0;
  if (item === 'cureGun') inv.cureDoses = 0;
  if (item === 'riotShield') {
    inv.shield = 0;
    inv.shieldUp = false;
  }

  // Unlike every other bundle above, the radio's count is not thrown away —
  // it goes down with the set. A radio remembers what it has already sent, so
  // the one you find on a floor may have had its best call spent already, and
  // dropping your own is not a way to get that call back.
  const uses = item === 'radio' ? inv.radioUses : undefined;
  const readyAt = item === 'radio' ? inv.radioReadyAt : undefined;
  if (item === 'radio') {
    inv.radioUses = 0;
    inv.radioReadyAt = 0;
  }

  const id = `loot-drop-${Math.random().toString(36).slice(2, 9)}`;
  const dropped: PickupState = { id, item, x, y };
  if (ammo !== undefined) dropped.ammo = ammo;
  if (uses !== undefined) dropped.uses = uses;
  if (readyAt !== undefined) dropped.readyAt = readyAt;
  world.pickups.set(id, dropped);
  inv.activeSlot = 0;
  return `dropped ${ITEMS[item].label}`;
}

export function dropProgress(inv: Inventory, now: number): number {
  if (inv.holdSince === null || inv.holdConsumed) return -1;
  const held = heldItem(inv);
  if (!held || held === 'pistol' || held === 'dualPistols') return -1;
  return Math.min(1, (now - inv.holdSince) / DROP_HOLD_MS);
}

/**
 * Bearing to the nearest zombie anywhere on the map, and how far off it is.
 *
 * Walks every entity, so it is deliberately *not* something to call per tick
 * per bot — see `botPatrolTarget`, which reads it only when it re-picks a
 * destination. For a player it is once a tick, and only with one in hand.
 */
export function nearestZombieBearing(
  world: World,
  x: number,
  y: number,
): { bearing: number; dist: number } | null {
  let best: { bearing: number; dist: number } | null = null;
  let bestDist = trackerRange();
  for (const e of world.entities.values()) {
    if (e.type !== 'zombie') continue;
    const d = Math.hypot(e.x - x, e.y - y);
    if (d >= bestDist) continue;
    bestDist = d;
    best = { bearing: Math.atan2(e.y - y, e.x - x), dist: d };
  }
  return best;
}

/**
 * The tracker is the one thing that sees past the fog, which is the whole of
 * what it is for. **It runs on being carried, not on being held.**
 *
 * It used to need to be in your hand, and the cost of that was meant to be the
 * point — consulting it means not holding a gun. In practice it made the item
 * something you took out, read, and put away, which is the opposite of a
 * compass: what a bearing to the nearest zombie is *for* is knowing which way
 * trouble is while you are doing something else, and the one moment you most
 * want it is the one moment you least want to be holding it instead of a
 * rifle. The slot it takes is the cost now, the same trade thermal goggles and
 * the beacon handset already make.
 *
 * The hole in the fog does not widen: this is a bearing and nothing else, the
 * same single number it always was. Nothing about *where* anybody is comes
 * down the wire for it.
 */
function trackBearing(world: World, inv: Inventory, x: number, y: number): number | null {
  if (!inv.utilities.includes('zombieTracker')) return null;
  return nearestZombieBearing(world, x, y)?.bearing ?? null;
}

/**
 * The state of the one beacon, for whoever is carrying the handset.
 *
 * Null without one in the bag, which is what makes dropping it cost you the
 * map: the answer never leaves the server, exactly as `selfInfected` doesn't
 * without a cure gun in hand.
 *
 * `muster` is a *count*, never positions. The map deliberately shows no NPC
 * anywhere on it — the point of the readout is "is this working", not "where
 * is everyone".
 */
function beaconWire(world: World, inv: Inventory): InventoryState['beacon'] {
  if (!inv.utilities.includes('survivorBeacon')) return null;
  const b = world.beacon;
  if (!b) return { placed: false, pending: false, muster: 0, x: 0, y: 0 };
  let muster = 0;
  if (b.placed) {
    for (const e of world.entities.values()) {
      if (e.type !== 'human' && e.type !== 'officer') continue;
      if (Math.hypot(e.x - b.x, e.y - b.y) <= BEACON_MUSTER_RADIUS) muster++;
    }
  }
  return { placed: b.placed, pending: !b.placed, muster, x: Math.round(b.x), y: Math.round(b.y) };
}

export function toWireInventory(
  world: World,
  id: string,
  inv: Inventory,
  x: number,
  y: number,
  now: number,
): InventoryState {
  const near = nearestPickup(world, x, y);
  return {
    guns: inv.guns,
    utilities: inv.utilities,
    activeSlot: inv.activeSlot,
    kevlar: inv.kevlar,
    shield: inv.shield,
    shieldUp: inv.shieldUp,
    dual: inv.dual,
    grenades: inv.grenades,
    mines: inv.mines,
    cureDoses: inv.cureDoses,
    radioUses: inv.radioUses,
    radioReadyAt: inv.radioReadyAt,
    gunSlots: gunSlots(inv),
    utilitySlots: utilitySlots(inv),
    dropProgress: dropProgress(inv, now),
    nearbyItem: near ? near.item : null,
    deployProgress: deployProgress(world, id, inv, now),
    deployWanted: world.deployWanted.has(id),
    chargeProgress: chargeProgress(world, id, inv, now),
    trackBearing: trackBearing(world, inv, x, y),
    beacon: beaconWire(world, inv),
    // Only the cure gun tells you about yourself. Without one in hand the
    // flag never reaches the client at all, so there is nothing to read off
    // the wire either.
    selfInfected: heldItem(inv) === 'cureGun' ? world.pendingInfections.has(id) : null,
  };
}

export { isGun };
