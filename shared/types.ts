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
  /** Wearing kevlar — drawn as a grey band inside the body. */
  armour?: boolean;
  /** Tearing at a door — the client claws its arms at it. */
  breaking?: boolean;
  /** Id of the partner whose hand they're holding, if any. */
  hand?: string;
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

/** A gap punched in a building's wall — where you can actually get in. */
export interface Door {
  x: number;
  y: number;
  /** Index into MapData.buildings. */
  building: number;
  /** Half the width of the opening, for clearance checks. */
  halfSpan: number;
  /** True when the opening sits in a horizontal run, so the slab spans x. */
  horiz: boolean;
  /** Between two rooms rather than to the street. */
  interior: boolean;
}

/**
 * Runtime state of a door, sent only for doors near the viewer. Doorways with
 * no door hung in them never appear here at all.
 */
export interface DoorState {
  /** Index into MapData.doors. */
  i: number;
  open: boolean;
  locked: boolean;
  /** Knocked off its hinges — permanently open, drawn as wreckage. */
  broken: boolean;
  /** Remaining health as a fraction, omitted while undamaged. */
  hp?: number;
}

/**
 * A speech bubble, sent with its own position so it carries through fog —
 * you hear someone hammering on a door whether or not you can see them.
 */
export interface SpeechState {
  x: number;
  y: number;
  text: string;
}

/** What pressing or holding E would do to the door you're stood at. */
export interface DoorPrompt {
  text: string;
  /** 0-1 while an action is under way, -1 when idle. */
  progress: number;
}

/**
 * A building's real shape, not just its bounding box. L and T footprints carve
 * tiles away, so the bbox alone reports outdoor notches as indoors.
 */
export interface Building {
  /** Bounding box — cheap rejection before testing the real shape. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Solid footprint, merged into row rectangles. */
  rects: Wall[];
  /** Indices into MapData.doors. */
  doors: number[];
}

/** Ornamental water, with a few lily pads and a resident flock. */
export interface Pond {
  x: number;
  y: number;
  /** Mean radius; the real edge wobbles either side of it. */
  r: number;
  /** Summed harmonics that make the outline roundish rather than circular. */
  wobble: Array<{ freq: number; amp: number; phase: number }>;
  pads: Array<{ x: number; y: number; r: number }>;
}

/** A duck, sent for drawing only — they are scenery that reacts, not entities. */
export interface DuckState {
  x: number;
  y: number;
  facing: number;
  /** Up and away, drawn with wings out and a shadow beneath. */
  flying?: boolean;
}

export interface MapData {
  seed: number;
  width: number;
  height: number;
  walls: Wall[];
  bushes: Bush[];
  windows: Window[];
  /** Building footprints — used for "hide indoors" behaviour. */
  buildings: Building[];
  doors: Door[];
  pond: Pond;
}

/** A shotgun blast is several tracers from one trigger pull. */
export type ShotKind = 'bullet' | 'cure' | 'dart';

/** Grenade mid-flight; `h` is arc height, used purely for the drawn offset. */
export interface GrenadeState {
  x: number;
  y: number;
  h: number;
}

/** A shell going off: the client draws an expanding ring from it. */
export interface BlastState {
  x: number;
  y: number;
  /** Milliseconds since it went off. */
  age: number;
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

/**
 * A lobby slot: shut, waiting for someone, filled by the machine, or sat in by
 * a real person.
 */
export type SlotState = 'closed' | 'open' | 'bot' | 'player';

/** A slot as the server describes it — the name rides along with the seat. */
export interface SlotWire {
  state: SlotState;
  /** Gamertag of whoever is sitting here, when `state` is 'player'. */
  name?: string;
  /** True when that person is you, so the client can pick you out. */
  self?: boolean;
}

/** One line in a lobby's chat. `from` is empty for the server's own notices. */
export interface ChatLine {
  from: string;
  text: string;
}

/** A lobby as it appears in the browse list. */
export interface LobbySummary {
  id: string;
  name: string;
  /** The host's gamertag. */
  host: string;
  /** People sitting in slots, and how many seats exist in total. */
  players: number;
  capacity: number;
  /** Its round is already under way — you can still join, but not play yet. */
  running: boolean;
}

/** The lobby you are actually in, pushed whenever anything about it changes. */
export interface LobbyView {
  id: string;
  name: string;
  isHost: boolean;
  humans: SlotWire[];
  dogs: SlotWire[];
  chat: ChatLine[];
  /**
   * A solo room: nobody else can join it, so it is never listed, has no chat,
   * and its slots only offer closed or bot.
   */
  offline: boolean;
  /**
   * The latest thing the room needs to tell you. Offline draws no chat box, so
   * refusals from START would otherwise go somewhere nobody can read.
   */
  notice: string;
  /** You are watching rather than playing. */
  spectating: boolean;
  /** Everyone watching, yourself included. */
  spectators: string[];
}

export type AbilityId = 'rally' | 'follow' | 'wait';

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
  /** Bipod: -1 not deployable, 0-1 planting, 1 steady. */
  deployProgress: number;
  /** Charge rifle wind-up: -1 when not charging, else 0-1. */
  chargeProgress: number;
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
      /** Right mouse toggle: plant the heavy MG's bipod. */
      deploy: boolean;
    }
  | { type: 'ability'; ability: AbilityId; x: number; y: number }
  | { type: 'selectSlot'; slot: number }
  /**
   * Watch instead of play. `restart: false` joins the round already in
   * progress rather than starting a fresh one — which is what you want when
   * the point is to observe how a game actually unfolds.
   */
  | { type: 'spectate'; restart?: boolean }
  | { type: 'restart' }
  // ---- front end. None of these touch the running world except `lobbyStart`.
  /** Send me the browse list, and keep sending it as it changes. */
  | { type: 'lobbyList' }
  | { type: 'lobbyCreate'; name: string; gamertag: string; offline?: boolean }
  /** Sit out and watch, or come back off the bench. */
  | { type: 'lobbySpectate'; on: boolean }
  | { type: 'lobbyJoin'; id: string; gamertag: string }
  /** Take a seat. Only 'open' and 'bot' seats can be taken. */
  | { type: 'lobbySit'; team: LobbyTeam; index: number }
  /** Host only: walk a slot through closed → open → bot. */
  | { type: 'lobbyCycle'; team: LobbyTeam; index: number }
  | { type: 'lobbyChat'; text: string }
  | { type: 'lobbyLeave' }
  /** Host only. Also what the host's "go" in chat resolves to. */
  | { type: 'lobbyStart' };

export type LobbyTeam = 'humans' | 'dogs';

export type ServerMessage =
  | { type: 'welcome'; selfId: string; map: MapData }
  | { type: 'map'; map: MapData }
  /** The browse list, pushed to everyone who isn't in a lobby yet. */
  | { type: 'lobbies'; lobbies: LobbySummary[] }
  /** The lobby you're in. Sent on every change, so the client just redraws. */
  | { type: 'lobby'; lobby: LobbyView }
  /** You are no longer in a lobby — you left, or it went away under you. */
  | { type: 'lobbyLeft'; reason: string }
  /** Your lobby's round is beginning. The map follows. */
  | { type: 'start' }
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
      /** State of every door near the viewer. */
      doors: DoorState[];
      /** The door prompt under the crosshair, when stood at one. */
      doorPrompt: DoorPrompt | null;
      /** Every active speech bubble, fog or no fog. */
      speech: SpeechState[];
      /** Remaining uses of the rally shout. */
      rallyCharges: number;
      /** Remaining uses of the follow command. */
      followCharges: number;
      /** True once people are following, so the wheel offers "Wait" instead. */
      following: boolean;
      pickups: PickupState[];
      inventory: InventoryState;
      grenades: GrenadeState[];
      smokes: SmokeState[];
      blasts: BlastState[];
      ducks: DuckState[];
      helicopters: HelicopterState[];
      /** Sprint is locked out until stamina recovers past its threshold. */
      exhausted: boolean;
      /** Rolling average server tick cost, for the perf readout. */
      tickMs: number;
      /** Positions of the final few humans, shown as edge arrows. */
      beacons: Array<{ x: number; y: number }>;
    };
