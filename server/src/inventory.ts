import type { GunSlot, InventoryState, PickupState } from '../../shared/types.js';
import { ITEMS, LOOT_TABLE, isGun, type ItemId } from '../../shared/items.js';
import {
  GUN_SLOTS,
  UTILITY_SLOTS,
  PICKUP_REACH,
  DROP_HOLD_MS,
  KEVLAR_POINTS,
  RALLY_STARTING_CHARGES,
  BUILDING_LOOT_CHANCE,
  TEST_DROP_ALL_ITEMS,
  TEST_DROP_RADIUS,
  ONE_OFF_ITEMS,
  GUARANTEED_ITEMS,
} from '../../shared/constants.js';
import type { World } from './world.js';
import { chargeProgress, deployProgress } from './combat.js';

export interface Inventory {
  guns: Array<GunSlot | null>;
  utilities: ItemId[];
  activeSlot: number;
  kevlar: number;
  shield: boolean;
  /** When E was pressed down, or null while released. */
  holdSince: number | null;
  /** Suppresses the tap-to-collect once a hold has already dropped something. */
  holdConsumed: boolean;
}

export function newInventory(): Inventory {
  return {
    guns: Array(GUN_SLOTS).fill(null),
    utilities: [],
    activeSlot: 0,
    kevlar: 0,
    shield: false,
    holdSince: null,
    holdConsumed: false,
  };
}

/** Scatter loot through the city. Most buildings come up empty. */
export function spawnPickups(world: World, testDropAt?: { x: number; y: number }): void {
  world.pickups.clear();
  let n = 0;

  // TESTING: one of everything within arm's reach of the start point.
  if (TEST_DROP_ALL_ITEMS && testDropAt) {
    const ids = (Object.keys(ITEMS) as ItemId[]).filter((id) => id !== 'pistol');
    ids.forEach((item, i) => {
      const angle = (i / ids.length) * Math.PI * 2;
      const id = `loot-test-${i}`;
      world.pickups.set(id, {
        id,
        item,
        x: testDropAt.x + Math.cos(angle) * TEST_DROP_RADIUS,
        y: testDropAt.y + Math.sin(angle) * TEST_DROP_RADIUS,
      });
    });
    n = ids.length;
  }

  for (const b of world.map.buildings) {
    if (Math.random() > BUILDING_LOOT_CHANCE) continue;

    const item = LOOT_TABLE[Math.floor(Math.random() * LOOT_TABLE.length)];
    // Keep it off the walls, and inside the real footprint rather than the
    // bounding box — an L-shaped building's notch is outdoors.
    for (let attempt = 0; attempt < 18; attempt++) {
      const rect = b.rects[Math.floor(Math.random() * b.rects.length)];
      if (!rect) break;
      const x = rect.x + 18 + Math.random() * Math.max(1, rect.w - 36);
      const y = rect.y + 6 + Math.random() * Math.max(1, rect.h - 12);
      if (world.nav.isBlocked(x, y) || !world.nav.isReachable(x, y)) continue;
      const id = `loot-${n++}`;
      world.pickups.set(id, { id, item, x, y });
      break;
    }
  }

  // Spots that may be taken over by a placed item — anything already placed by
  // hand is off limits, or the second placement would eat the first.
  const placed = new Set<ItemId>([...ONE_OFF_ITEMS, ...GUARANTEED_ITEMS]);
  const freeSpots = () => Array.from(world.pickups.values()).filter((p) => !placed.has(p.item));

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

  // And a floor under the rare guns: if the loot table happened not to roll
  // one anywhere, put one in. A rare gun that is missing entirely is a worse
  // kind of rare than a scarce one.
  for (const item of GUARANTEED_ITEMS) {
    let already = false;
    for (const p of world.pickups.values()) {
      if (p.item === item) {
        already = true;
        break;
      }
    }
    if (already) continue;
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
  if (inv.activeSlot === 0) return 'pistol';
  if (inv.activeSlot <= GUN_SLOTS) return inv.guns[inv.activeSlot - 1]?.item ?? null;
  return inv.utilities[inv.activeSlot - GUN_SLOTS - 1] ?? null;
}

export function heldGunSlot(inv: Inventory): GunSlot | null {
  if (inv.activeSlot === 0 || inv.activeSlot > GUN_SLOTS) return null;
  return inv.guns[inv.activeSlot - 1];
}

/**
 * What picking a utility up does: some are used on the spot and vanish, some
 * are carried, and some refuse to be picked up at all because using them right
 * now would waste them.
 */
type UtilityOutcome = 'used' | 'carry' | 'refuse';

function applyUtility(world: World, playerId: string, inv: Inventory, item: ItemId): UtilityOutcome {
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
  if (item === 'riotShield') {
    inv.shield = true;
    return 'used';
  }
  return 'carry'; // smoke grenade, and anything else you hold on to
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

  if (def.kind === 'utility') {
    const outcome = applyUtility(world, playerId, inv, pickup.item);
    if (outcome === 'refuse') return 'nothing that would use it';
    if (outcome === 'used') {
      world.pickups.delete(pickup.id);
      return `used ${def.label}`;
    }
    if (inv.utilities.length >= UTILITY_SLOTS) return 'utility slots full';
    inv.utilities.push(pickup.item);
    world.pickups.delete(pickup.id);
    return `picked up ${def.label}`;
  }

  // A gun that was dropped keeps whatever was left in it; one that spawned in
  // the world comes with a full magazine.
  const loaded = pickup.ammo ?? def.ammo ?? 0;

  const free = inv.guns.findIndex((g) => g === null);
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
  if (!item || item === 'pistol') return null;

  // Guns go down with what was left in them, so an empty one stays empty on
  // the floor and reads as not worth the walk.
  const gunSlot = heldGunSlot(inv);
  const ammo = gunSlot ? gunSlot.ammo : undefined;

  if (inv.activeSlot <= GUN_SLOTS) inv.guns[inv.activeSlot - 1] = null;
  else inv.utilities.splice(inv.activeSlot - GUN_SLOTS - 1, 1);

  // Worn kit is worn *because* the slot is occupied. Dropping the vest has to
  // take the protection with it, or you keep the armour and free the slot.
  if (item === 'kevlar') inv.kevlar = 0;

  const id = `loot-drop-${Math.random().toString(36).slice(2, 9)}`;
  world.pickups.set(id, ammo === undefined ? { id, item, x, y } : { id, item, x, y, ammo });
  inv.activeSlot = 0;
  return `dropped ${ITEMS[item].label}`;
}

export function dropProgress(inv: Inventory, now: number): number {
  if (inv.holdSince === null || inv.holdConsumed) return -1;
  const held = heldItem(inv);
  if (!held || held === 'pistol') return -1;
  return Math.min(1, (now - inv.holdSince) / DROP_HOLD_MS);
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
    dropProgress: dropProgress(inv, now),
    nearbyItem: near ? near.item : null,
    deployProgress: deployProgress(world, id, inv),
    chargeProgress: chargeProgress(world, id, inv),
  };
}

export { isGun };
