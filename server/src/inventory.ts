import type { GunSlot, InventoryState, PickupState } from '../../shared/types.js';
import { GUN_LOOT, ITEMS, UTILITY_LOOT, isGun, rarestOf, type ItemId } from '../../shared/items.js';
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
  GRENADE_COUNT,
  ZAP_MINE_COUNT,
  RADIO_USES,
  BACKPACK_SLOTS,
  GUNSLING_SLOTS,
  TRACKER_RANGE,
  TEST_DROP_ALL_ITEMS,
  TEST_DROP_RADIUS,
  ONE_OFF_ITEMS,
  GUARANTEED_ITEMS,
  GUARANTEE_EVERY_GUN,
  GUARANTEE_EVERY_UTILITY,
  PARK_LOOT_COUNT,
  PARK_LOOT_GUARANTEED_GUNS,
  PARK_LOOT_GUARANTEED_UTILITIES,
  PARK_LOOT_GUN_SHARE,
  PARK_LOOT_COVER,
  PARK_LOOT_PATH_GAP,
  POND_LOOT_GAP,
  POND_LOOT_BAND,
  BEACON_MUSTER_RADIUS,
  BEACON_ONE_PER_CITY,
  TEST_BEACON_ON_A_BOT,
} from '../../shared/constants.js';
import type { World } from './world.js';
import { chargeProgress, deployProgress } from './combat.js';
import { distToPath } from './mapgen.js';
import { pondRadiusAt } from '../../shared/pond.js';
import { callBackup } from './backup.js';

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

  // A house rolls for a gun and, separately, for something to go with it.
  // They used to compete for the single item a building could hold, which is
  // why a house with a rifle in it never also had a vest.
  for (const b of world.map.buildings) {
    if (Math.random() < BUILDING_GUN_CHANCE) {
      placeIn(b, GUN_LOOT[Math.floor(Math.random() * GUN_LOOT.length)]);
    }
    if (Math.random() < BUILDING_UTILITY_CHANCE) {
      placeIn(b, UTILITY_LOOT[Math.floor(Math.random() * UTILITY_LOOT.length)]);
    }
  }

  // A few things stashed in the park, tucked into the undergrowth rather than
  // left out on the grass — the whole point of putting loot there is that you
  // have to go into the trees for it, so a candidate spot has to have a bush
  // close enough to hide it. Kept off the dirt path for the same reason: a rifle
  // lying on the one clear line through the park is not hidden at all.
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
    const item = table[Math.floor(Math.random() * table.length)];
    for (let attempt = 0; attempt < 24; attempt++) {
      const x = park.x + 30 + Math.random() * Math.max(1, park.w - 60);
      const y = park.y + 30 + Math.random() * Math.max(1, park.h - 60);
      if (world.nav.isBlocked(x, y) || !world.nav.isReachable(x, y)) continue;
      if (distToPath(park.path, x, y) < park.pathWidth / 2 + PARK_LOOT_PATH_GAP) continue;

      let hidden = false;
      for (const bush of world.map.bushes) {
        if (Math.hypot(bush.x - x, bush.y - y) <= bush.r + PARK_LOOT_COVER) {
          hidden = true;
          break;
        }
      }
      if (!hidden) continue;

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
    const item = table[Math.floor(Math.random() * table.length)];
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
  const byHand = (p: PickupState) =>
    p.id.startsWith('loot-oneoff-') || p.id.startsWith('loot-min-');
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
  let bestDist = TRACKER_RANGE;
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
 * what it is for — but only while it is actually in your hand. That cost is
 * the point: consulting it means not holding a gun.
 */
function trackBearing(world: World, inv: Inventory, x: number, y: number): number | null {
  if (heldItem(inv) !== 'zombieTracker') return null;
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
