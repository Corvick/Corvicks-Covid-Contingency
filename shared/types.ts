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
  /** Standing in for a player rather than ambient — blue body, grey head. */
  bot?: boolean;
  /** Helicopter-dropped trooper: better shot, drawn in olive. */
  soldier?: boolean;
  /** Out of a SWAT van: black gear, a riot shield, and a rifle to match. */
  swat?: boolean;
  /** Leading a squad: the one with the radio pack on his back. */
  squadLead?: boolean;
  /** Still fading into existence — client dithers it in. */
  materializing?: boolean;
  /** Speech bubble text, while one is active. */
  say?: string;
  /** Wearing kevlar — drawn as a grey band inside the body. */
  armour?: boolean;
  /** Dropped by a zap mine and going nowhere. */
  stunned?: boolean;
  /**
   * How far through the last few seconds before they turn, 0 to 1. Absent
   * until it starts to show. Unlike `infected` this is sent to *everyone* —
   * the body reddening is the warning, and a warning nobody can see is not
   * one. See `TURNING_TELL_MS`.
   */
  turning?: number;
  /**
   * Seen only through thermal goggles — through a wall or a hedge. Drawn as a
   * heat blob rather than a body, because you have not actually laid eyes on
   * it and it should not read as though you have.
   */
  thermal?: boolean;
  /**
   * Carrying a riot shield, and which way it faces: +1 in front, -1 slung on
   * the back. Absent for everyone else.
   */
  shield?: number;
  /** Mid shield-shove: the client throws the arc forward. */
  bashing?: boolean;
  /** Tearing at a door — the client claws its arms at it. */
  breaking?: boolean;
  /** Alight: the client wreathes it in flame. */
  burning?: boolean;
  /** Id of the partner whose hand they're holding, if any. */
  hand?: string;
  /**
   * A zombie dog rather than a shambler — always a player, never AI.
   *
   * It rides on `type: 'zombie'` with this flag on top, the same way four
   * grades of officer share one type. That is not a shortcut: a dog *is* part
   * of the outbreak everywhere it counts, so bullets find it, the crowd runs
   * from it, the danger field is sourced from it and the victory count includes
   * it, all with no code anywhere saying so.
   */
  dog?: boolean;
  /**
   * Where the head is pointing, as against `facing`, which is the spine. The
   * head leads and the body swings after it — see `DOG_HEAD_TURN_RATE`. Only
   * ever sent for dogs, so two entities pay for it rather than four hundred.
   */
  head?: number;
  /** Mid-snap: the jaws are thrown open and thrown forward. Dogs only. */
  lunging?: boolean;
  /**
   * Down. Drawn grey and sprawled, and going nowhere — a dog holds its own
   * body on screen for `DOG_DEATH_MS` before it rises again somewhere else, so
   * that being killed is something you watch rather than a cut.
   */
  dead?: boolean;
  /**
   * What is actually in this officer's hands, so the body can be drawn around
   * it — a shouldered rifle rather than a pistol held out in front.
   *
   * Absent means the pistol profile, which is what everybody got regardless of
   * what they were carrying before this existed. Only sent for officers, and
   * only when it is not the pistol, so it costs a short string on a handful of
   * entities rather than anything on the four hundred.
   */
  held?: ItemId;
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
  /** Crackling out of a handset rather than out of a mouth: drawn jagged. */
  radio?: boolean;
}

/**
 * A dog that was put down, left where it fell. Permanent scenery for the rest
 * of the round: the animal rises again out of a shambler somewhere else, and
 * the body it left stays exactly where somebody shot it.
 *
 * Sent to everyone unfogged — there are a handful of these in a whole round,
 * and a corpse you walked past ten seconds ago should not blink out because you
 * turned round.
 */
export interface CorpseState {
  x: number;
  y: number;
  /** The pose it died in: the spine, and where the head had fallen. */
  facing: number;
  head: number;
}

/** A survivor beacon: a small mast people can be sent to. */
export interface BeaconState {
  x: number;
  y: number;
}

/** A zap mine on the ground: a dark disc until it arms, then a live one. */
export interface MineState {
  x: number;
  y: number;
  armed: boolean;
}

/**
 * Whatever the radio sent. Scenery once it has parked and emptied.
 *
 * `facing` is the *body* angle, which during a hard stop is not the direction
 * of travel — the van slews. The tyre marks are drawn from `skidX`/`skidY`,
 * the point the brakes went on, so the client doesn't have to remember when
 * that was.
 */
export interface BackupVehicleState {
  kind: 'van' | 'car';
  x: number;
  y: number;
  facing: number;
  parked: boolean;
  /** Where the brakes went on, and the tangent it was travelling at the time. */
  skidX?: number;
  skidY?: number;
  skidAngle?: number;
  /** Still sliding: the tyres are smoking. */
  braking?: boolean;
  /** How far the back doors and the cab door have swung, 0-1. */
  rearOpen?: number;
  cabOpen?: number;
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

/**
 * A deployed pocket gunner: the machine gun, and the sandbags in front of it.
 * The bags are drawn as an oriented box because they lie across whatever way
 * the officer who put them down was facing.
 */
export interface EmplacementState {
  id: string;
  x: number;
  y: number;
  /** Where the gun is pointing right now, not where it was planted. */
  facing: number;
  /** The direction it was planted in — the centre of its arc. */
  arc: number;
  /** Rounds left, so the client can show it running down. */
  ammo: number;
  /** 0-1 each. The bags go first; then the gun itself. */
  bagHp: number;
  gunHp: number;
  /** Absent once the bags are gone. */
  bags?: { x: number; y: number; angle: number; hw: number; hh: number };
}

/** A duck, sent for drawing only — they are scenery that reacts, not entities. */
export interface DuckState {
  x: number;
  y: number;
  facing: number;
  /** Up and away, drawn with wings out and a shadow beneath. */
  flying?: boolean;
  /**
   * How far into the climb: 0 at take-off, 1 as it goes out of sight. The
   * client shrinks the bird, spreads its shadow and dithers it away on this,
   * so a duck leaves rather than simply ceasing to exist.
   */
  climb?: number;
}

/**
 * The park, and the dirt path worn through it.
 *
 * The path is a centre line rather than a shape: everything that cares about
 * it — the drawing, and keeping the undergrowth off it — measures distance to
 * the polyline, so there is nothing to keep in step.
 */
export interface Park extends Wall {
  path: Array<{ x: number; y: number }>;
  pathWidth: number;
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
  park: Park;
}

/** A shotgun blast is several tracers from one trigger pull. */
export type ShotKind = 'bullet' | 'cure' | 'flame';

/** A patch of ground alight. `life` is 1 when fresh and 0 as it dies. */
export interface FireState {
  x: number;
  y: number;
  life: number;
}

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
  /**
   * Who fired it. Only sent for `flame`, and only because the client has to
   * join one shooter's pulls into a single stream — a hose is one continuous
   * thing, and two officers stood together must not have theirs spliced into
   * each other. Nothing else needs it, so nothing else pays for it.
   */
  who?: string;
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

/** The lobby you are actually in, pushed whenever anything about it changes. */
export interface LobbyView {
  /**
   * The four letters that get somebody else in here. This is the lobby's whole
   * public identity — there is no browse list and no other handle on it — so it
   * is what the room draws large and what JOIN asks for.
   */
  code: string;
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
  /**
   * Civilians the next round is built for — the host's slider, and the one
   * thing that decides how big the city comes out. Pushed to everybody, not
   * just the host: how big a round is going to be is worth knowing before you
   * take a seat in it.
   */
  population: number;
  /**
   * Its round is under way. Only reachable from the lobby screen by joining a
   * lobby that is already playing, which is exactly when a host's settings
   * would be refused — so the controls that size the *next* city say so instead
   * of being clicked and ignored.
   */
  running: boolean;
}

export type AbilityId = 'rally' | 'follow' | 'wait' | 'beacon';

/**
 * What a dog needs on screen, and nothing an officer would. Null for everyone
 * who isn't one, so the field costs a word on every other snapshot.
 *
 * `hold` and `shaken` are two readings of the same clock and both are needed:
 * one is how much bite is left, the other is how much of it the shaking has
 * already taken off. Without the second, worrying at somebody looks exactly
 * like waiting.
 */
export interface DogHud {
  /** Jaw recovery since the last bite, 0-1. 1 is ready to open. */
  bite: number;
  /**
   * How much of the open window is left, 1 down to 0 — or -1 while the jaws are
   * shut. Its own reading rather than folded into `bite`, because "how long can
   * I hold this open" and "when may I open it again" are opposite questions and
   * a single bar answering both would be read wrong in the half-second that
   * matters.
   */
  jawsOpen: number;
  /** Teeth actually in somebody. */
  latched: boolean;
  /** How much of the bite clock is left, 1 down to 0. */
  hold: number;
  /** The share of it shaking has torn off so far, 0-1. */
  shaken: number;
  /**
   * How many shamblers are left on the map to come back out of — which is this
   * dog's lives, and the only number on its HUD that goes down for good.
   */
  hosts: number;
  /** No horde left and it went down. Out of the round. */
  out: boolean;
  /**
   * Being killed, 0 to 1 across `DOG_DEATH_MS`; -1 while up.
   *
   * The client watches its own body go down for the first part of it and then
   * fades to black, so the ramp is deliberately the *whole* window rather than
   * just the fade — where in it the screen starts going dark is a drawing
   * decision and belongs on the client.
   */
  dying: number;
}

/** A lootable item lying on the floor. */
export interface PickupState {
  id: string;
  item: ItemId;
  x: number;
  y: number;
  /**
   * Rounds left in a gun that was dropped rather than spawned. Absent means a
   * full magazine — loot found in the world always is. Zero draws grey, which
   * is how everyone else knows not to bother walking over for it.
   */
  ammo?: number;
  /**
   * Calls left on a dropped radio, and when it will next answer. A radio
   * remembers what it has already sent: putting it down and picking it up
   * again is not a way to get the good call back, or to skip the minute.
   */
  uses?: number;
  readyAt?: number;
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
  /** Riot shield charges left, 0 for none. */
  shield: number;
  /** Up in front rather than slung on the back. */
  shieldUp: boolean;
  /** Slot 0 is a pair. */
  dual: boolean;
  /** Frags left in the bundle. */
  grenades: number;
  /** Mines left in the bundle. */
  mines: number;
  /** Cure doses left. */
  cureDoses: number;
  /** Calls left on the radio, and when it will next answer (0 for ready). */
  radioUses: number;
  radioReadyAt: number;
  /** How many of each kind of slot this bag can use, sling and pack included. */
  gunSlots: number;
  utilitySlots: number;
  /** 0-1 while holding E to drop; -1 when not dropping. */
  dropProgress: number;
  /** Pickup within reach, if any — drives the "press E" prompt. */
  nearbyItem: ItemId | null;
  /** Bipod: -1 not deployable, 0-1 planting, 1 steady. */
  deployProgress: number;
  /**
   * Whether the bipod is wanted down. The toggle lives on the server now that
   * right-click is resolved there, so the HUD has to be told rather than
   * keeping its own copy and drifting out of step with it.
   */
  deployWanted: boolean;
  /** Charge rifle wind-up: -1 when not charging, else 0-1. */
  chargeProgress: number;
  /** Bearing to the nearest zombie while the tracker is out, else null. */
  trackBearing: number | null;
  /**
   * The beacon handset, or null without one in the bag.
   *
   * `placed` is a mast actually standing — not one that has merely been asked
   * for, since the whole point of the wait is that the soldier has to get
   * there. `muster` is how many are gathered at it, which is the only readout
   * in the game for whether any of this worked, and it is a *count* rather
   * than positions: the map deliberately shows no NPC anywhere on it.
   */
  beacon: {
    placed: boolean;
    /** Called in, soldier on his way, nothing standing yet. */
    pending: boolean;
    muster: number;
    x: number;
    y: number;
  } | null;
  /**
   * Whether *you* are incubating. Null unless a cure gun is in hand — the
   * server simply never sends it otherwise, so there is nothing to read.
   */
  selfInfected: boolean | null;
}

export type ClientMessage =
  | {
      type: 'input';
      input: InputState;
      aim: number;
      /**
       * Where the crosshair actually is, in world coordinates. The angle alone
       * is enough for a hitscan round, but a lobbed shell has to land on the
       * spot rather than at a fixed distance along the bearing.
       */
      aimX: number;
      aimY: number;
      shooting: boolean;
      sprint: boolean;
      /** True while E is held — a tap collects, a hold drops. */
      interact: boolean;
      /** Right mouse toggle: plant the heavy MG's bipod. */
      rightDown: boolean;
    }
  | { type: 'ability'; ability: AbilityId; x: number; y: number }
  /**
   * Where on the map the beacon should go. Deliberately its own message rather
   * than an `AbilityId`: it is not on the Q wheel, it costs no rally charge,
   * and it is picked off a map rather than by clicking the world.
   */
  | { type: 'beaconPlace'; x: number; y: number }
  | { type: 'selectSlot'; slot: number }
  /**
   * Watch instead of play. `restart: false` joins the round already in
   * progress rather than starting a fresh one — which is what you want when
   * the point is to observe how a game actually unfolds.
   */
  | { type: 'spectate'; restart?: boolean }
  | { type: 'restart' }
  // ---- front end. None of these touch the running world except `lobbyStart`.
  /**
   * Round-trip probe. `t` is the client's own clock and the server hands it
   * straight back untouched, so the two never have to agree on what time it is
   * — the only reading taken is `now - t` on the machine that sent it.
   */
  | { type: 'ping'; t: number }
  | { type: 'lobbyCreate'; name: string; gamertag: string; offline?: boolean }
  /** Sit out and watch, or come back off the bench. */
  | { type: 'lobbySpectate'; on: boolean }
  /**
   * Get me into the lobby with this code. Sent raw as typed — the server tidies
   * it, because it is the one that has to agree with itself about what a code
   * is, and a client that trimmed differently would refuse codes that are fine.
   */
  | { type: 'lobbyJoin'; code: string; gamertag: string }
  /** Take a seat. Only 'open' and 'bot' seats can be taken. */
  | { type: 'lobbySit'; team: LobbyTeam; index: number }
  /** Host only: walk a slot through closed → open → bot. */
  | { type: 'lobbyCycle'; team: LobbyTeam; index: number }
  /**
   * Host only: how many civilians the next round gets, and with it how big a
   * city. Sent live as the slider is dragged, so everyone in the room watches
   * it move; the server clamps and steps it, so an out-of-range number off a
   * hand-crafted message is a value in range rather than a broken city.
   */
  | { type: 'lobbyPopulation'; population: number }
  | { type: 'lobbyChat'; text: string }
  | { type: 'lobbyLeave' }
  /** Host only. Also what the host's "go" in chat resolves to. */
  | { type: 'lobbyStart' }
  /**
   * Freeze a solo round while its panel is up. Refused for a lobby with other
   * people in it — pausing theirs is not yours to do.
   */
  | { type: 'lobbyPause'; on: boolean }
  /** Same lobby, same slots, fresh city. */
  | { type: 'lobbyRestart' };

export type LobbyTeam = 'humans' | 'dogs';

export type ServerMessage =
  | { type: 'welcome'; selfId: string; map: MapData }
  | { type: 'map'; map: MapData }
  /** `t` exactly as it arrived, echoed the moment it did. */
  | { type: 'pong'; t: number }
  /** The lobby you're in. Sent on every change, so the client just redraws. */
  | { type: 'lobby'; lobby: LobbyView }
  /** You are no longer in a lobby — you left, or it went away under you. */
  | { type: 'lobbyLeft'; reason: string }
  /**
   * A refusal that leaves you exactly where you are, unlike `lobbyLeft`, which
   * moves you. Mistyping a code is the ordinary case now, and it has to answer
   * on the screen you are already looking at rather than throwing you back a
   * step and making you find your way to it again.
   */
  | { type: 'lobbyError'; message: string }
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
      /** The dog's own readouts, or null for anyone who isn't one. */
      dog: DogHud | null;
      grenades: GrenadeState[];
      smokes: SmokeState[];
      blasts: BlastState[];
      ducks: DuckState[];
      /** Deployed pocket gunners: the gun, and the bags in front of it. */
      emplacements: EmplacementState[];
      vehicles: BackupVehicleState[];
      mines: MineState[];
      /** Every dog put down this round, left where it fell. */
      corpses: CorpseState[];
      towers: BeaconState[];
      zaps: Array<{ x: number; y: number; at: number }>;
      /** Ground still burning. */
      fires: FireState[];
      helicopters: HelicopterState[];
      /** Sprint is locked out until stamina recovers past its threshold. */
      exhausted: boolean;
      /** Rolling average server tick cost, for the perf readout. */
      tickMs: number;
      /** Positions of the final few humans, shown as edge arrows. */
      beacons: Array<{ x: number; y: number }>;
    };
