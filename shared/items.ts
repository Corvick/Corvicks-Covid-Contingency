import {
  CHARGE_BARS,
  BOLT_CYCLE_MS,
  GARAND_CLIP_SIZE,
  GARAND_PING_MS,
  GARAND_RELOAD_MS,
} from './constants.js';

export type ItemId =
  | 'pistol'
  | 'dualPistols'
  | 'machineGun'
  | 'shotgun'
  | 'boltRifle'
  | 'semiAutoRifle'
  | 'sniper'
  | 'heavyMg'
  | 'chargeRifle'
  | 'flamethrower'
  | 'cureGun'
  | 'kevlar'
  | 'riotShield'
  | 'lozenge'
  | 'smokeGrenade'
  | 'pocketGunner'
  | 'grenadeLauncher'
  | 'ammoBox'
  | 'zombieTracker'
  | 'binoculars'
  | 'combatBoots'
  | 'grenade'
  | 'gunsling'
  | 'backpack'
  | 'radio'
  | 'zapMine'
  | 'thermalGoggles'
  | 'survivorBeacon';

export type ItemKind = 'gun' | 'utility';

export interface ItemDef {
  id: ItemId;
  kind: ItemKind;
  label: string;
  short: string;
  color: string;
  /** Ground pickups are weighted by this; higher shows up more often. */
  rarity: number;
  /**
   * A gun that is carried in a *utility* slot rather than a gun slot.
   *
   * `kind` decides which loot table something rolls on and how it fires;
   * this decides where it lives in the bag. They are separate questions and
   * the cure gun is the case that proves it — it spawns in houses like a gun
   * and shoots like one, but it is not a weapon and should never be competing
   * with your rifle for a slot. Its doses count down in the one slot the way
   * grenades and kevlar do.
   */
  utilitySlot?: boolean;
  /**
   * How it is held, and so how the body is drawn around it.
   *
   * Absent means the pistol profile everybody used to get whatever was
   * actually in their hands: both arms out to a grip on the centre line. A
   * `rifle` is shouldered instead — butt into one shoulder, the other hand
   * well down the forestock — which puts the weapon off to one side and is
   * what makes a rifleman read as a rifleman at a glance.
   *
   * On the ItemDef rather than in the drawing so that adding a gun decides
   * how it is carried in the same place it decides what it does.
   */
  grip?: 'rifle';
  /** Guns only. */
  damageMin?: number;
  damageMax?: number;
  bloom?: number;
  cooldownMs?: number;
  range?: number;
  /** Rounds fired per trigger pull — the shotgun's spread. */
  pellets?: number;
  /**
   * Offset each pellet sideways by this much rather than spreading it by
   * angle: two pistols fire *parallel*, a hand's width apart, not in a cone.
   */
  parallel?: number;
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
  /**
   * How fast the officer can swing this thing, in rad/s. Absent means the
   * aim snaps to the mouse the way it always has; a figure here makes the
   * weapon feel heavy, because the body and the stream both lag the crosshair.
   */
  turnRate?: number;
  /** Hold the trigger to wind up, release to fire. */
  charge?: boolean;
  chargeMs?: number;
  /** Bodies one round passes through. At full charge, all of them. */
  pierce?: number;
  /**
   * How close a bot wants to be before it opens up, when that is nearer than
   * the weapon's outright reach. A shotgun carries 340 but only bites at half
   * that, so a bot firing at maximum range is a bot wasting shells.
   */
  botIdealRange?: number;
  /**
   * What a bot thinks this is worth, when damage figures don't tell the story
   * — the launcher's damage lives in its blast, not in `damageMin`.
   */
  botWorth?: number;
  /**
   * Rounds before this weapon forces a reload — the M1 Garand's en-bloc clip.
   * Absent means it never does: running dry is simply running dry, the way
   * every other gun in the city already works. `ammo` is expected to be a
   * multiple of this, so the gun always comes in — and a box always tops it
   * back up — as a whole number of clips.
   */
  clipSize?: number;
  /**
   * How long firing is locked out once `clipSize` empties the clip: the ping,
   * then the clatter of a fresh one going in, both heard out before the
   * trigger works again. Meaningless without `clipSize`.
   */
  reloadMs?: number;
}

export const ITEMS: Record<ItemId, ItemDef> = {
  pistol: {
    id: 'pistol',
    kind: 'gun',
    label: 'Pistol',
    short: 'PSTL',
    color: '#cbd5e1',
    // You always have one, so finding a second is not a gun — it is the other
    // hand. `collect` turns it into `dualPistols` in slot 0 rather than taking
    // a slot, which is why this spawns but is excluded from the every-gun floor.
    rarity: 2,
    damageMin: 14,
    damageMax: 23,
    bloom: 0.06,
    cooldownMs: 1000,
    range: 720,
  },
  dualPistols: {
    id: 'dualPistols',
    kind: 'gun',
    label: 'Dual Pistols',
    short: 'DUAL',
    color: '#e2e8f0',
    rarity: 0, // never loot: it is what slot 0 becomes
    damageMin: 14,
    damageMax: 23,
    // Both hands at once: two rounds side by side per pull, on the pistol's
    // own cadence. `pellets` is what fires them; `parallel` is what keeps them
    // apart, so they read as two guns rather than one with a wide barrel.
    bloom: 0.06,
    cooldownMs: 1000,
    range: 720,
    pellets: 2,
    parallel: 9,
  },
  machineGun: {
    id: 'machineGun',
    kind: 'gun',
    label: 'Machine Gun',
    short: 'MG',
    color: '#fbbf24',
    // Common now: an MG in most streets, but a weaker one.
    rarity: 11,
    // Nerfed hard. It was doing bolt-action work at ten times the rate; what
    // it is for is pinning a crowd, not killing one, so the damage came out
    // and the stagger went in. A held burst now stops a charge dead without
    // dropping much of it.
    damageMin: 4,
    damageMax: 7,
    bloom: 0.13,
    cooldownMs: 110,
    range: 700,
    ammo: 140,
    automatic: true,
    slowMs: 700,
    slowMul: 0.45,
  },
  shotgun: {
    id: 'shotgun',
    kind: 'gun',
    label: 'Shotgun',
    short: 'SHTG',
    color: '#fb923c',
    // One of the three the city is meant to be full of, alongside the bolt
    // action and the machine gun. The rares are left at 1 so raising these
    // makes the common guns commoner rather than everything commoner.
    rarity: 9,
    damageMin: 6,
    damageMax: 12,
    bloom: 0.3,
    cooldownMs: 850,
    range: 340,
    pellets: 8,
    ammo: 28,
    // Eight pellets at 0.3 bloom put maybe two on target at full reach, so a
    // bot firing from 340 is a bot wasting shells. Make it walk in first.
    botIdealRange: 170,
  },
  boltRifle: {
    id: 'boltRifle',
    grip: 'rifle',
    kind: 'gun',
    label: 'Bolt Action Rifle',
    short: 'BOLT',
    color: '#d6b27c',
    // The common one. Turns up in houses more often than anything else.
    rarity: 12,
    damageMin: 38,
    damageMax: 58,
    bloom: 0.012,
    // At least as long as the bolt-cycle sound itself (see `BOLT_CYCLE_MS`),
    // plus a tick and a bit of slack, or a fast trigger finger fires the next
    // round while the last one is still audibly working the bolt.
    cooldownMs: BOLT_CYCLE_MS + 60,
    range: 900,
    ammo: 24,
    // A heavy round puts them down harder and for longer than a pistol does.
    slowMs: 900,
    slowMul: 0.35,
  },
  semiAutoRifle: {
    id: 'semiAutoRifle',
    grip: 'rifle',
    kind: 'gun',
    label: 'M1 Garand',
    short: 'GRND',
    color: '#d97757',
    // The middle tier: not one of the three the city is full of, and not one of
    // the ones you might go a whole round without seeing either.
    rarity: 5,
    // The bolt action's rifle round, fired as fast as you can pull rather than
    // as fast as you can work the bolt — so it gives up the thing the bolt is
    // actually for. Less damage per round, three times the bloom, and a lighter
    // stagger, in exchange for two and a half times the rate.
    damageMin: 23,
    damageMax: 36,
    bloom: 0.04,
    cooldownMs: 470,
    range: 820,
    // A multiple of the clip size below, so the gun always comes in — and an
    // ammo box always tops it back up — as a whole number of clips: 3 today.
    ammo: 30,
    slowMs: 450,
    slowMul: 0.55,
    // The en-bloc clip: every tenth round empties it, and it ejects itself
    // with the iconic ping, then the clatter of a fresh one going in — see
    // `GARAND_CLIP_SIZE` and `client/src/sound.ts`'s `playGarandCycle`.
    clipSize: GARAND_CLIP_SIZE,
    reloadMs: GARAND_PING_MS + GARAND_RELOAD_MS + 60,
  },
  sniper: {
    id: 'sniper',
    grip: 'rifle',
    kind: 'gun',
    label: 'Sniper Rifle',
    short: 'SNPR',
    color: '#22d3ee',
    rarity: 1,
    damageMin: 63,
    damageMax: 86,
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
    grip: 'rifle',
    kind: 'gun',
    label: 'Heavy Machine Gun',
    short: 'HMG',
    color: '#f97316',
    rarity: 1,
    damageMin: 10,
    damageMax: 16,
    // Hopeless from the hip — the whole point is to put it down first.
    bloom: 0.34,
    cooldownMs: 95,
    range: 720,
    ammo: 300,
    automatic: true,
    // From the hip it only lands anything at close quarters.
    botIdealRange: 400,
    // Heavier to swing than the flamethrower, but only off the pegs — a
    // planted bipod traverses freely, which is part of what you get for
    // committing to it. `steerAim` makes that exception.
    turnRate: 2.0,
    deployable: true,
    deployedBloom: 0.018,
  },
  chargeRifle: {
    id: 'chargeRifle',
    grip: 'rifle',
    kind: 'gun',
    label: 'Charge Rifle',
    short: 'CHRG',
    color: '#c084fc',
    // Middle tier, alongside the semi-auto. It is the only gun that can shoot
    // somebody already bitten, which is a job that has to come up often enough
    // to be worth learning — at rarity 1 most rounds never presented it.
    rarity: 5,
    damageMin: 30,
    damageMax: 45,
    bloom: 0.02,
    cooldownMs: 500,
    range: 1300,
    ammo: 14,
    charge: true,
    chargeMs: 1300,
    // One body per bar; the top bar also drives it through a wall or a door.
    pierce: CHARGE_BARS,
  },
  flamethrower: {
    id: 'flamethrower',
    kind: 'gun',
    label: 'Flamethrower',
    short: 'FLAM',
    color: '#f97316',
    rarity: 1,
    // The stream itself barely scratches. Burning is what does the work.
    damageMin: 1,
    damageMax: 2,
    bloom: 0.06,
    cooldownMs: 55,
    range: 340,
    // Cut back: a flamethrower you can hold down for half a minute is one
    // that never asks you to pick your moment.
    ammo: 560,
    automatic: true,
    // Heavy, awkward, and slow to bring round. Sweeping a street with it is
    // meant to be a commitment rather than a flick of the wrist.
    turnRate: 2.6,
    // Its damage is all in the fire it leaves, so say so outright.
    botWorth: 88,
    botIdealRange: 200,
  },
  cureGun: {
    id: 'cureGun',
    kind: 'gun',
    label: 'Cure Gun',
    short: 'CURE',
    color: '#4ade80',
    rarity: 1,
    // Rolls on the gun table and fires like a gun, but rides in a utility
    // slot: it is medicine, not a weapon, and it should not be the reason you
    // leave a rifle on the floor. `ammo` is the dose count.
    utilitySlot: true,
    bloom: 0.05,
    cooldownMs: 1100,
    range: 520,
    ammo: 6,
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
    // Five shells. It is the best thing in the city; it should run out.
    ammo: 5,
    explosive: true,
    // Its damage lives in the blast, so ranking it on damageMin scores it zero
    // and bots walked straight past the best weapon in the city.
    botWorth: 95,
    // Far enough out not to catch itself in its own shell.
    botIdealRange: 300,
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
  pocketGunner: {
    id: 'pocketGunner',
    kind: 'utility',
    label: 'Pocket Machine Gunner',
    short: 'GUNR',
    color: '#84cc16',
    rarity: 2,
  },
  smokeGrenade: {
    id: 'smokeGrenade',
    kind: 'utility',
    label: 'Smoke Grenade',
    short: 'SMOKE',
    color: '#ef4444',
    rarity: 0,
  },
  zombieTracker: {
    id: 'zombieTracker',
    kind: 'utility',
    label: 'Zombie Tracker',
    short: 'TRACK',
    color: '#f87171',
    rarity: 3,
  },
  binoculars: {
    id: 'binoculars',
    kind: 'utility',
    label: 'Binoculars',
    short: 'BINOC',
    color: '#7dd3fc',
    rarity: 3,
  },
  combatBoots: {
    id: 'combatBoots',
    kind: 'utility',
    label: 'Combat Boots',
    short: 'BOOTS',
    color: '#a16207',
    rarity: 3,
  },
  grenade: {
    id: 'grenade',
    kind: 'utility',
    label: 'Grenades',
    short: 'FRAG',
    color: '#65a30d',
    rarity: 3,
  },
  gunsling: {
    id: 'gunsling',
    kind: 'utility',
    label: 'Gunsling',
    short: 'SLING',
    color: '#d97706',
    rarity: 2,
  },
  survivorBeacon: {
    id: 'survivorBeacon',
    kind: 'utility',
    label: 'Survivor Beacon',
    short: 'BCON',
    color: '#facc15',
    // Out of the loot table by construction, like the launcher and the smoke.
    // There is exactly one in the city and it is always on the bank of the
    // duck pond — see `BEACON_ONE_PER_CITY`. Rarity 0 is also what keeps it out
    // of `rarestOf` and out of the every-utility floor, both of which filter on
    // rarity > 0, so nothing else can quietly place a second one.
    rarity: 0,
  },
  thermalGoggles: {
    id: 'thermalGoggles',
    kind: 'utility',
    label: 'Thermal Goggles',
    short: 'THRM',
    color: '#fb923c',
    rarity: 2,
  },
  zapMine: {
    id: 'zapMine',
    kind: 'utility',
    label: 'Zap Mines',
    short: 'MINE',
    color: '#22d3ee',
    rarity: 3,
  },
  radio: {
    id: 'radio',
    kind: 'utility',
    label: 'Hand Radio',
    short: 'RADIO',
    color: '#38bdf8',
    rarity: 2,
  },
  backpack: {
    id: 'backpack',
    kind: 'utility',
    label: 'Backpack',
    short: 'PACK',
    color: '#78716c',
    rarity: 2,
  },
};

/**
 * Guns and utilities are drawn from separate tables, because a building rolls
 * for one of each. They used to compete for the single item a house could
 * hold, so a house with a rifle in it never had a vest as well.
 *
 * Both are expanded by rarity weight; rarity 0 keeps something out entirely,
 * which is how the one-offs and `dualPistols` stay off the floor.
 */
const weighted = (kind: ItemKind): ItemId[] =>
  (Object.keys(ITEMS) as ItemId[])
    .filter((id) => ITEMS[id].kind === kind)
    .flatMap((id) => Array<ItemId>(ITEMS[id].rarity).fill(id));

export const GUN_LOOT: ItemId[] = weighted('gun');
export const UTILITY_LOOT: ItemId[] = weighted('utility');

/**
 * Both tables end to end: one draw over everything a city can put on the floor.
 *
 * Concatenating rather than picking a table and then an item is what keeps the
 * rarities honest across the two. Rolling a coin for gun-or-utility first would
 * make the rarest gun as likely as the rarest utility even though there are
 * half again as many utilities to spread the same coin over, and a bolt action
 * no commoner than a shotgun relative to a vest. Here every entry in both
 * weighted lists is one ticket, so an item is exactly as likely as its share of
 * all the loot in the game.
 *
 * Rarity 0 stays out by construction, since neither table contains it.
 */
export const ALL_LOOT: ItemId[] = [...GUN_LOOT, ...UTILITY_LOOT];

/**
 * The scarcest tier of a kind — everything sharing the lowest rarity weight
 * that still appears in the loot table at all.
 *
 * Derived rather than hand-listed for the same reason the every-gun floor is:
 * a hand-kept list of "the good ones" goes stale the moment something is added
 * or re-weighted, and nothing tells you. For guns that is currently the
 * sniper, the heavy MG, the flamethrower and the cure gun; for utilities the
 * shield, the pocket gunner, the sling, the beacon, the goggles, the radio and
 * the pack. Rarity 0 is excluded — those are placed by their own roll and are
 * not a tier, they are a quota.
 */
export function rarestOf(kind: ItemKind): ItemId[] {
  const ids = (Object.keys(ITEMS) as ItemId[]).filter(
    (id) => ITEMS[id].kind === kind && ITEMS[id].rarity > 0 && id !== 'pistol',
  );
  const floor = Math.min(...ids.map((id) => ITEMS[id].rarity));
  return ids.filter((id) => ITEMS[id].rarity === floor);
}

/**
 * Everything at or below a rarity ceiling, still weighted by rarity.
 *
 * The scarcity gradient through the corner complex is a *ceiling* that comes
 * down room by room rather than a set of hand-picked tiers, so the shallow
 * rooms hold ordinary loot and the deep ones hold only what is genuinely hard
 * to find — and anything added to the registry lands in the right place on
 * that gradient the day it exists, without anybody remembering to list it.
 *
 * Weighted rather than flat, because inside a tier the odds should still be
 * the odds: a ceiling of 5 is "no bolt actions, no machine guns, no shotguns",
 * not "every rare item is now equally likely".
 *
 * Rarity 0 is excluded, exactly as `weighted` excludes it — those are placed
 * by their own roll and are a quota rather than a tier. Never returns an empty
 * table: a ceiling below the scarcest thing in the game falls back to that
 * scarcest tier, so a caller can walk the ceiling down as far as it likes.
 */
export function lootAtMost(maxRarity: number): ItemId[] {
  const table = ALL_LOOT.filter((id) => ITEMS[id].rarity <= maxRarity);
  if (table.length > 0) return table;
  return [...rarestOf('gun'), ...rarestOf('utility')];
}

export function isGun(id: ItemId): boolean {
  return ITEMS[id].kind === 'gun';
}
