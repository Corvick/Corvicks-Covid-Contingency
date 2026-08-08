export type ItemId =
  | 'pistol'
  | 'machineGun'
  | 'shotgun'
  | 'boltRifle'
  | 'sniper'
  | 'heavyMg'
  | 'chargeRifle'
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

  /** How long a hit staggers a zombie, and how far it slows them. */
  slowMs?: number;
  slowMul?: number;
  /** A round entering between the arms kills outright. */
  headshot?: boolean;
  /** Client zooms out and draws a reticle; the server extends what you see. */
  scope?: boolean;
  /** Right-click plants a bipod: immobile, but `deployedBloom` accurate. */
  deployable?: boolean;
  deployedBloom?: number;
  /** Hold the trigger to wind up, release to fire. */
  charge?: boolean;
  chargeMs?: number;
  /** Bodies one round passes through. At full charge, all of them. */
  pierce?: number;
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
  boltRifle: {
    id: 'boltRifle',
    kind: 'gun',
    label: 'Bolt Action Rifle',
    short: 'BOLT',
    color: '#d6b27c',
    // The common one. Turns up in houses more often than anything else.
    rarity: 5,
    damageMin: 42,
    damageMax: 64,
    bloom: 0.012,
    cooldownMs: 1000, // works the bolt as fast as you can pull a trigger
    range: 900,
    ammo: 24,
    // A heavy round puts them down harder and for longer than a pistol does.
    slowMs: 900,
    slowMul: 0.35,
  },
  sniper: {
    id: 'sniper',
    kind: 'gun',
    label: 'Sniper Rifle',
    short: 'SNPR',
    color: '#22d3ee',
    rarity: 1,
    damageMin: 70,
    damageMax: 95,
    bloom: 0.003,
    cooldownMs: 1500,
    range: 2200,
    ammo: 8,
    scope: true,
    headshot: true,
    slowMs: 1100,
    slowMul: 0.3,
  },
  heavyMg: {
    id: 'heavyMg',
    kind: 'gun',
    label: 'Heavy Machine Gun',
    short: 'HMG',
    color: '#f97316',
    rarity: 1,
    damageMin: 11,
    damageMax: 18,
    // Hopeless from the hip — the whole point is to put it down first.
    bloom: 0.34,
    cooldownMs: 95,
    range: 720,
    ammo: 300,
    automatic: true,
    deployable: true,
    deployedBloom: 0.018,
  },
  chargeRifle: {
    id: 'chargeRifle',
    kind: 'gun',
    label: 'Charge Rifle',
    short: 'CHRG',
    color: '#c084fc',
    rarity: 1,
    damageMin: 30,
    damageMax: 45,
    bloom: 0.02,
    cooldownMs: 500,
    range: 1300,
    ammo: 14,
    charge: true,
    chargeMs: 1300,
    pierce: 9,
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
    ammo: 10,
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
    rarity: 0,
  },
};

/** Everything that can turn up as loot, expanded by rarity weight. */
export const LOOT_TABLE: ItemId[] = (Object.keys(ITEMS) as ItemId[]).flatMap((id) =>
  Array<ItemId>(ITEMS[id].rarity).fill(id),
);

export function isGun(id: ItemId): boolean {
  return ITEMS[id].kind === 'gun';
}
