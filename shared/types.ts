import type { ItemId } from './items.js';

export type EntityType = 'officer' | 'zombie' | 'human' | 'zombieMaster';

/** Entity as sent over the wire. Radius/max-health/color are derived
 *  client-side from `type` to keep snapshots small. Flags are omitted
 *  entirely when false. */
export interface EntityState {
  id: string;
  type: EntityType;
  x: number;
  y: number;
  facing: number; // radians
  health: number;
  /** Locked in a grapple — client animates a struggle. */
  grappling?: boolean;
  /** Bitten but not yet turned. Only ever sent to zombie-side viewers. */
  infected?: boolean;
  /** AI-driven officer, drawn grey to separate it from players. */
  npc?: boolean;
  /** Helicopter-dropped trooper: better shot, drawn in olive. */
  soldier?: boolean;
  /** Still fading into existence — client dithers it in. */
  materializing?: boolean;
  /** Speech bubble text, while one is active. */
  say?: string;
}

export interface Wall {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Bush {
  x: number;
  y: number;
  r: number;
}

/** A pane set into a building wall: see-through, solid until smashed. */
export interface Window {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface MapData {
  seed: number;
  width: number;
  height: number;
  walls: Wall[];
  bushes: Bush[];
  windows: Window[];
  /** Building footprints — used for "hide indoors" behaviour. */
  buildings: Wall[];
}

/** A shotgun blast is several tracers from one trigger pull. */
export type ShotKind = 'bullet' | 'cure' | 'dart';

/** Grenade mid-flight; `h` is arc height, used purely for the drawn offset. */
export interface GrenadeState {
  x: number;
  y: number;
  h: number;
}

export interface SmokeState {
  x: number;
  y: number;
  r: number;
  a: number;
}

/** Only ever seen as a shadow passing over the ground. */
export interface HelicopterState {
  x: number;
  y: number;
  facing: number;
  /** 0-1: darkens in as it arrives, fades away as it leaves. */
  alpha: number;
}

/** A single hitscan shot, broadcast for one tick so clients can draw a tracer. */
export interface Shot {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  hit: boolean;
  kind?: ShotKind;
}

export interface InputState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

export type AbilityId = 'rally';

/** A lootable item lying on the floor. */
export interface PickupState {
  id: string;
  item: ItemId;
  x: number;
  y: number;
}

/** One of the three gun slots. */
export interface GunSlot {
  item: ItemId;
  ammo: number;
}

export interface InventoryState {
  /** Slot 0 is always the pistol; 1-3 are the lootable gun slots. */
  guns: Array<GunSlot | null>;
  /** Slots 4-9, in pickup order. */
  utilities: ItemId[];
  activeSlot: number;
  kevlar: number;
  shield: boolean;
  /** 0-1 while holding E to drop; -1 when not dropping. */
  dropProgress: number;
  /** Pickup within reach, if any — drives the "press E" prompt. */
  nearbyItem: ItemId | null;
}

export type ClientMessage =
  | {
      type: 'input';
      input: InputState;
      aim: number;
      shooting: boolean;
      sprint: boolean;
      /** True while E is held — a tap collects, a hold drops. */
      interact: boolean;
    }
  | { type: 'ability'; ability: AbilityId; x: number; y: number }
  | { type: 'selectSlot'; slot: number }
  | { type: 'spectate' }
  | { type: 'restart' };

export type ServerMessage =
  | { type: 'welcome'; selfId: string; map: MapData }
  | { type: 'map'; map: MapData }
  | {
      type: 'state';
      entities: EntityState[];
      shots: Shot[];
      spectating: boolean;
      gameOver: boolean;
      victory: boolean;
      survivors: number;
      infected: number;
      zombies: number;
      stamina: number;
      /** Indices into map.windows that have been smashed open. */
      brokenWindows: number[];
      /** Remaining uses of the rally shout. */
      rallyCharges: number;
      pickups: PickupState[];
      inventory: InventoryState;
      grenades: GrenadeState[];
      smokes: SmokeState[];
      helicopters: HelicopterState[];
      /** Sprint is locked out until stamina recovers past its threshold. */
      exhausted: boolean;
      /** Rolling average server tick cost, for the perf readout. */
      tickMs: number;
      /** Positions of the final few humans, shown as edge arrows. */
      beacons: Array<{ x: number; y: number }>;
    };
