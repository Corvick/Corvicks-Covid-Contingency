export type ItemId =
  | 'pistol'
  | 'machineGun'
  | 'shotgun'
  | 'cureGun'
  | 'trackerDart'
  | 'kevlar'
  | 'riotShield'
  | 'lozenge'
  | 'smokeGrenade'
  | 'grenadeLauncher'
  | 'ammoBox';

export type ItemKind = 'gun' | 'utility';

export interface ItemDef {
  id: ItemId;
  kind: ItemKind;
  label: string;
  short: string;
  color: string;
  /** Ground pickups are weighted by this; higher shows up more often. */
  rarity: number;
  /** Guns only. */
  damageMin?: number;
  damageMax?: number;
  bloom?: number;
  cooldownMs?: number;
  range?: number;
  /** Rounds fired per trigger pull — the shotgun's spread. */
  pellets?: number;
  /** Starting ammo when picked up. Absent means unlimited. */
  ammo?: number;
  /** Fires while the trigger is held rather than once per click. */
  automatic?: boolean;
  /** Lobs an explosive shell instead of a hitscan round. */
  explosive?: boolean;
}

export const ITEMS: Record<ItemId, ItemDef> = {
  pistol: {
    id: 'pistol',
    kind: 'gun',
    label: 'Pistol',
    short: 'PSTL',
    color: '#cbd5e1',
    rarity: 0, // never spawns on the ground; you always have it
    damageMin: 15,
    damageMax: 25,
    bloom: 0.06,
    cooldownMs: 1000,
    range: 720,
  },
  machineGun: {
    id: 'machineGun',
    kind: 'gun',
    label: 'Machine Gun',
    short: 'MG',
    color: '#fbbf24',
    rarity: 3,
    damageMin: 8,
    damageMax: 14,
    bloom: 0.13,
    cooldownMs: 110,
    range: 700,
    ammo: 140,
    automatic: true,
  },
  shotgun: {
    id: 'shotgun',
    kind: 'gun',
    label: 'Shotgun',
    short: 'SHTG',
    color: '#fb923c',
    rarity: 3,
    damageMin: 7,
    damageMax: 13,
    bloom: 0.3,
    cooldownMs: 850,
    range: 340,
    pellets: 8,
    ammo: 28,
  },
  cureGun: {
    id: 'cureGun',
    kind: 'gun',
    label: 'Cure Gun',
    short: 'CURE',
    color: '#4ade80',
    rarity: 1,
    bloom: 0.05,
    cooldownMs: 1100,
    range: 520,
    ammo: 6,
  },
  trackerDart: {
    id: 'trackerDart',
    kind: 'gun',
    label: 'Tracker Dart',
    short: 'DART',
    color: '#a78bfa',
    rarity: 2,
    bloom: 0.04,
    cooldownMs: 1200,
    range: 620,
    ammo: 10,
  },
  grenadeLauncher: {
    id: 'grenadeLauncher',
    kind: 'gun',
    label: 'Grenade Launcher',
    short: 'GL',
    color: '#a3e635',
    // Kept out of the ordinary loot table entirely; placed by its own roll.
    rarity: 0,
    cooldownMs: 1600,
    range: 360,
    ammo: 4,
    explosive: true,
  },
  ammoBox: {
    id: 'ammoBox',
    kind: 'utility',
    label: 'Ammo Box',
    short: 'AMMO',
    color: '#facc15',
    rarity: 4,
  },
  kevlar: {
    id: 'kevlar',
    kind: 'utility',
    label: 'Kevlar',
    short: 'KEVL',
    color: '#60a5fa',
    rarity: 3,
  },
  riotShield: {
    id: 'riotShield',
    kind: 'utility',
    label: 'Riot Shield',
    short: 'SHLD',
    color: '#38bdf8',
    rarity: 2,
  },
  lozenge: {
    id: 'lozenge',
    kind: 'utility',
    label: 'Lozenge',
    short: 'LOZ',
    color: '#f472b6',
    rarity: 3,
  },
  smokeGrenade: {
    id: 'smokeGrenade',
    kind: 'utility',
    label: 'Smoke Grenade',
    short: 'SMOKE',
    color: '#ef4444',
    rarity: 2,
  },
};

/** Everything that can turn up as loot, expanded by rarity weight. */
export const LOOT_TABLE: ItemId[] = (Object.keys(ITEMS) as ItemId[]).flatMap((id) =>
  Array<ItemId>(ITEMS[id].rarity).fill(id),
);

export function isGun(id: ItemId): boolean {
  return ITEMS[id].kind === 'gun';
}
