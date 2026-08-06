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
} from '../../shared/constants.js';
import type { World } from './world.js';

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
    // Keep it off the walls so it's reachable from inside the room.
    for (let attempt = 0; attempt < 14; attempt++) {
      const x = b.x + 24 + Math.random() * Math.max(1, b.w - 48);
      const y = b.y + 24 + Math.random() * Math.max(1, b.h - 48);
      if (world.nav.isBlocked(x, y) || !world.nav.isReachable(x, y)) continue;
      const id = `loot-${n++}`;
      world.pickups.set(id, { id, item, x, y });
      break;
    }
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

function applyUtility(world: World, playerId: string, inv: Inventory, item: ItemId): boolean {
  // Some utilities are consumed the moment they're picked up.
  if (item === 'lozenge') {
    world.rallyCharges.set(playerId, (world.rallyCharges.get(playerId) ?? 0) + RALLY_STARTING_CHARGES);
    return true;
  }
  if (item === 'kevlar') {
    inv.kevlar = KEVLAR_POINTS;
    return true;
  }
  if (item === 'riotShield') {
    inv.shield = true;
    return true;
  }
  return false; // carried instead (smoke grenade)
}

/**
 * Tap E. Picks the item up, or — when all three gun slots are already full and
 * you're holding a gun — swaps the held one for whatever is on the floor.
 */
export function collect(world: World, playerId: string, inv: Inventory, x: number, y: number): string | null {
  const pickup = nearestPickup(world, x, y);
  if (!pickup) return null;

  const def = ITEMS[pickup.item];

  if (def.kind === 'utility') {
    if (applyUtility(world, playerId, inv, pickup.item)) {
      world.pickups.delete(pickup.id);
      return `picked up ${def.label}`;
    }
    if (inv.utilities.length >= UTILITY_SLOTS) return 'utility slots full';
    inv.utilities.push(pickup.item);
    world.pickups.delete(pickup.id);
    return `picked up ${def.label}`;
  }

  const free = inv.guns.findIndex((g) => g === null);
  if (free >= 0) {
    inv.guns[free] = { item: pickup.item, ammo: def.ammo ?? 0 };
    inv.activeSlot = free + 1;
    world.pickups.delete(pickup.id);
    return `picked up ${def.label}`;
  }

  // No room: swap whatever is in hand for what's on the ground.
  const slot = heldGunSlot(inv);
  if (!slot) return 'gun slots full — hold a gun to swap';

  const dropped = slot.item;
  const droppedAmmo = slot.ammo;
  inv.guns[inv.activeSlot - 1] = { item: pickup.item, ammo: def.ammo ?? 0 };
  world.pickups.delete(pickup.id);
  world.pickups.set(pickup.id, { id: pickup.id, item: dropped, x: pickup.x, y: pickup.y });
  void droppedAmmo; // ground guns come with a fresh magazine
  return `swapped for ${def.label}`;
}

/** Hold E. Drops whatever is in hand; the pistol is bolted to slot 0. */
export function dropHeld(world: World, inv: Inventory, x: number, y: number): string | null {
  const item = heldItem(inv);
  if (!item || item === 'pistol') return null;

  if (inv.activeSlot <= GUN_SLOTS) inv.guns[inv.activeSlot - 1] = null;
  else inv.utilities.splice(inv.activeSlot - GUN_SLOTS - 1, 1);

  const id = `loot-drop-${Math.random().toString(36).slice(2, 9)}`;
  world.pickups.set(id, { id, item, x, y });
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
  };
}

export { isGun };
