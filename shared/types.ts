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
  /**
   * A grey officer still carrying his one sandbag.
   *
   * Only sent for `npc` officers who have not spent it. The spectator's command
   * card counts the flag across the selection to work out how many walls it can
   * still order, and greys the icon out at zero — so this is the whole of what
   * the card needs, without anything about *where* anybody is.
   */
  bag?: boolean;
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
   * Roaring: rooted, mouth open, throwing rings off the muzzle. Dogs only.
   *
   * Sent to everyone who can see it rather than kept on the roaring player's
   * own HUD, because the whole point of a two-second animal-sized tell is that
   * the officers across the street get to read it and decide what to do about
   * it. It is also what the client hangs the sound on.
   */
  roaring?: boolean;
  /**
   * A dog is coming out of this body, 0 to 1 across `DOG_BIRTH_MS`.
   *
   * It is on the *shambler*, not on the dog — the dog does not exist yet, and
   * the thing being drawn is what is happening to somebody else. It vibrates
   * for the first `DOG_BIRTH_TWIST_FROM` of it, the arms go after that, and
   * then it bursts and is gone from the snapshot, which is the client's cue to
   * throw the gore: nothing about the burst is sent, in the same way nothing
   * about blood is.
   */
  birthing?: number;
  /**
   * Coming apart: 0 to 1 across `DOG_MORPH_WINDUP_MS`, then held at 1 for the
   * whole of the transformed form. Dogs only.
   *
   * **One number rather than a ramp and a flag**, because the two halves are
   * one continuous change to the same body — it grows and the tentacles come
   * out across the ramp and then stay out. The client scales the drawing by it
   * and grows the tentacles by it with no branch, and there is no moment where
   * a ramp reading 1 and a boolean reading false could disagree about what is
   * on screen.
   *
   * Sent to everyone who can see it, like `roaring` and for the same reason: an
   * animal tearing itself into something twice the size is the only warning the
   * officers get, and a secret version of it would do nothing.
   */
  morph?: number;
  /**
   * Still winding up, as against finished and out in the world.
   *
   * The one thing `morph` alone cannot say — it is pinned at 1 for both the
   * last frame of the ramp and the whole twenty seconds — and the two want
   * different drawings: rooted and vibrating, against moving and writhing.
   */
  morphing?: boolean;
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
  /**
   * The clerk's counter: a slab several times a wall's thickness, drawn as a
   * bench with a screen standing on it rather than as a pane in a wall.
   *
   * **A pane is the only shape that gives "see, but do not travel through"** —
   * `hasLineOfSight` ignores panes and `hasWallClearPath` treats them as solid
   * — so the whole depth of the counter is glass and this flag is purely about
   * how it is drawn. Like `Door.bars` it rides on the map, so it costs the wire
   * one boolean once in `welcome`.
   */
  counter?: boolean;
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
  /**
   * A barred cell gate rather than a door: black, toothed, and permanently
   * locked.
   *
   * It rides on the *map* rather than on `DoorState`, because it is a property
   * of the door that was hung there and never changes — so it costs the wire
   * one boolean once, in `welcome`, rather than a field on every door near
   * every viewer thirty times a second.
   */
  bars?: boolean;
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
  /** A FISHHOOK or HOOK arrival — a hard screeching turn. The client draws it a
   *  wider arc of rubber and more smoke than an ordinary LEAN. */
  heavy?: boolean;
  /**
   * The braking curve, for the client to rebuild the tyre marks along: signed
   * body rotation at rest (`slew * driftDir`), where in the brake the turn
   * starts and finishes, and how long the brake is in px. All four are absent
   * together for a dead-straight arrival, and only ever ride a van that is
   * actually turning — see `shared/vancurve.ts`.
   */
  sl?: number;
  th?: number;
  td?: number;
  bk?: number;
  /** How far the back doors and the cab door have swung, 0-1. */
  rearOpen?: number;
  cabOpen?: number;
  /**
   * Parked with the lightbar dark. A car that drove in on a call goes on
   * flashing afterwards — that is most of what makes it findable from a
   * street away — but one that has been sitting in the station car park
   * since before the round started never had a call to answer.
   */
  silent?: boolean;
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

/**
 * A bare sandbag wall a grey officer built to order — the pocket gunner's bags
 * with no gun behind them.
 *
 * Drawn by the same `drawSandbagWall` the emplacement's are, so the two cannot
 * drift apart, and solid to walking in the same way. There are never many: one
 * per grey officer for the whole round.
 */
export interface BarricadeState {
  x: number;
  y: number;
  angle: number;
  hw: number;
  hh: number;
  /** Remaining health as a fraction, so it dries out as it is torn at. */
  hp: number;
}

/**
 * A sandbag wall a grey officer has been sent to build and has not built yet.
 *
 * **The ghost stays up for the whole errand rather than for the instant of the
 * click.** Ordering a wall is a walk and not a placement — the officer may be
 * most of a street away — so an order that cleared the moment it was given left
 * nothing on screen saying it had been given at all, and the only way to find
 * out was to wait and see whether a wall appeared.
 *
 * Read off the authority that owns it rather than remembered on the client, for
 * the same reason the card counts sandbags off the wire: a client-side copy goes
 * stale the moment the wall goes up, the errand is given up on, or its owner is
 * eaten.
 *
 * Spectators alone, and there are never many — one per grey officer for the
 * whole round.
 */
export interface BuildSiteState {
  /** Whose errand it is, so the card can tell who is already spoken for. */
  id: string;
  x: number;
  y: number;
  angle: number;
  /** He has arrived and is stacking, as against still walking to it. */
  working?: boolean;
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

/**
 * The city police station: one per map, and the only building with a floor
 * plan rather than a random partition.
 *
 * The rects are the *interior* of each room, inset off the walls, because
 * every one of them is a place something gets put — loot in the armoury,
 * staff in the lobby, the garrison in the office. Handed over rather than
 * worked out again from the walls: the plan is laid out in tiles in one
 * function and a second derivation of it would drift the first time a room
 * moved.
 */
export interface PoliceStation {
  /** Index into `buildings`. */
  building: number;
  /** Where a car may stand, and which way it is nosed in. 0-3 get filled. */
  parking: Array<{ x: number; y: number; facing: number }>;
  /** Interiors, for whoever fills them. */
  armoury: Wall;
  lobby: Wall;
  office: Wall;
  cell: Wall;
  /**
   * Where the armoury's stock stands: one spot in the mouth of each stall
   * between two rack dividers.
   *
   * **Worked out by `mapgen` and handed over, rather than derived again by
   * whoever fills them.** The dividers are walls this file pushed and the
   * slots have to sit exactly between them — computed twice, the day somebody
   * moves a divider is the day the guns start standing inside one.
   */
  racks: Array<{ x: number; y: number }>;
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
  /**
   * Index into `buildings` of the corner complex — the one landmark that
   * claims its ground outright rather than sampling for a spot, and the one
   * building in the city worth crossing the map to strip.
   *
   * One number on `MapData` rather than a flag on every footprint, and stated
   * rather than worked out again by whoever wants it: it is `buildings[0]` by
   * construction today, and anything leaning on that would break silently the
   * day something else is pushed first.
   */
  cornerBuilding: number;
  /**
   * The police station, or null on a map with nowhere to put one.
   *
   * Nullable rather than assumed, because its placement has a hard
   * constraint no other landmark has — the half of the map away from the
   * breach — and a small city whose corner complex happens to sit in that
   * half can genuinely run out of room. Everything that reads it has to
   * cope with a round that has none.
   */
  policeStation: PoliceStation | null;
  /**
   * Which edge the outbreak walks in from (0 N, 1 E, 2 S, 3 W), and where
   * along it, 0-1.
   *
   * **Rolled by `generateMap` rather than by `populate`, and that is what
   * makes the police station possible.** The station has to stand in the
   * half of the map away from the breach, which is a question the map has
   * to be able to answer while it is being laid out — and `populate` runs
   * afterwards. So the map decides, and `populate` reads it back and puts
   * the zombies where it says.
   */
  outbreakSide: number;
  outbreakAlong: number;
  doors: Door[];
  pond: Pond;
  park: Park;
}

/** A shotgun blast is several tracers from one trigger pull. */
export type ShotKind = 'bullet' | 'cure' | 'flame';

/**
 * Which recorded gunshot a round's report should play as — see the pools in
 * `sound.ts`. One per weapon *family* rather than one per `ItemId`: the bolt
 * action and the charge rifle fire the same rifle round and share a voice,
 * where the pistol, the shotgun, the two machine guns, the sniper and the
 * M1 Garand are each their own thing to the ear.
 *
 * **The Garand is deliberately not `'rifle'`.** It used to share that pool
 * with the bolt action, whose recordings are close-up "shot" takes several
 * seconds long — the tail is a natural part of a single slow bolt-action
 * report and was never a problem at that weapon's own cadence, but the
 * Garand's fires several times a second and the tail of one shot ran
 * straight into the crack of the next, audibly overlapping. See
 * `GARAND_SHOT_FILES` in `sound.ts`, three takes hand-trimmed to a single
 * ~225ms report each — well clear of `semiAutoRifle.cooldownMs`.
 */
export type GunVoice = 'pistol' | 'rifle' | 'shotgun' | 'mg' | 'heavyMg' | 'sniper' | 'garand';

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

/**
 * A cloud of the dog's acid.
 *
 * **The same three fields a `Bush` has, and that is on purpose** — the client
 * hands its clouds to `visibilityPolygon` in the same array as the foliage, so
 * a cloud is an occluder there without one line of new fog code. `a` and `t`
 * are for the drawing alone and are simply ignored by that path.
 */
export interface AcidState {
  x: number;
  y: number;
  /**
   * The **bounding** radius. A cloud is a cluster of lobes rather than a disc
   * and none of them reaches past this, so it is still what the fog cache keys
   * on and what every cheap rejection test uses.
   */
  r: number;
  /**
   * Which cluster of lumps this cloud is.
   *
   * The lobes themselves are derived from it by `shared/acidshape.ts`, on both
   * sides, rather than being sent — the client needs the identical shape for
   * the fog polygon *and* for the drawing, and the drawn rim has to sit exactly
   * where the occluder edge does.
   */
  s: number;
  /** Thins away at the end of its life. */
  a: number;
  /** Its age in ms, so the churn can be hashed off it with no per-frame state. */
  t: number;
}

/** A gobbet of it still in the air. */
export interface SpitState {
  x: number;
  y: number;
  /** Height above the ground, for the shadow and the arc. */
  h: number;
  /** How far along the throw, 0 to 1. */
  t: number;
}

/**
 * A tentacle thrown out of a bursting dog, or lying where it came to rest.
 *
 * Simulated rather than drawn client-side, because it **bounces** — off the
 * same walls, glass and shut doors a grenade does — and the client has no
 * business deciding where a wall is. `a` is which way it is lying, `t` its life
 * from 1 down to 0 so it can fade out on its own clock.
 */
export interface TentacleState {
  x: number;
  y: number;
  a: number;
  t: number;
  /** Still in the air, so it is drawn with a shadow under it and writhing. */
  air: boolean;
}

/**
 * Where one body the strike caught was standing, and what stopped it.
 *
 * `blocked` is the whole readout that armour did its job. Everybody caught is
 * shoved and bleeds — the strike is a limb the width of a leg and that is not
 * something a vest makes pleasant — but only an *unarmoured* body is infected,
 * and without this the two outcomes are the same picture. A deflect ring over
 * the blood is what tells the officer their charge was spent on something.
 */
export interface LashHit {
  x: number;
  y: number;
  blocked: 'shield' | 'kevlar' | null;
}

/**
 * A tentacle strike: the arms coiling, going out, and coming back.
 *
 * On the wire rather than derived, unlike blood, and for two reasons that are
 * not the same. The old lash was on it because there is no `Shot` behind it to
 * read a line off. This one is on it because **the warning has to reach the
 * people it is warning** — a ring the dog's own client drew for itself would be
 * a ring nobody could dodge.
 *
 * Sent unfiltered, like the acid and the helicopters. Fog hides what is
 * happening quietly; a limb the length of a street coming down on you is not
 * that, and a telegraph you only see once it has already landed is worse than
 * no telegraph at all.
 */
export interface LashState {
  /**
   * Stable for the life of the strike, so the client can throw the gore, the
   * chips and the gouge **exactly once** rather than on every frame it is
   * visible. Same job the birth host's leaving the snapshot does, done with a
   * number because a strike does not leave — it finishes.
   */
  id: number;
  /**
   * Whose back these came off. The arms are drawn *with the dog*, by
   * `drawTentacles`, rather than as a separate pass — they are the same limbs
   * that idle on its back, and two bits of code drawing them would be two bits
   * of code to keep in step.
   */
  dogId: string;
  /** The anchor, followed live: the animal can still walk while they are out. */
  x1: number;
  y1: number;
  /** The locked landing point. Chosen once, at the keypress, and never re-read. */
  x2: number;
  y2: number;
  /** How wide the impact was, so the ring and the flash agree with the server. */
  r: number;
  /** `0` coiling, `1` going out, `2` snapping back. */
  phase: 0 | 1 | 2;
  /**
   * 0 to 1 through whichever phase it is in. One number rather than three
   * clocks: nothing on the client needs to know how long a phase lasts, only
   * how far through it is, and a ramp cannot disagree with the phase the way a
   * second deadline could.
   */
  t: number;
  /** Everybody it caught, once it has landed. Empty while it is still coming. */
  hits: LashHit[];
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
  /**
   * A pistol-grade round rather than a rifle one. The client throws a smaller,
   * sparser blood mark for it — a sidearm does not open a body up the way a
   * rifle does. Absent (the common case over a round) means an ordinary round.
   * Derived server-side from the weapon, not the damage: a shotgun pellet and a
   * machine-gun round are low *per hit* and still tear.
   */
  light?: boolean;
  /**
   * Stopped by a wall rather than by a body — never by a door, whose own
   * drawing runs after the wall pass and would paint straight over a mark
   * left for it. Absent means the round hit somebody, or simply ran out of
   * range in the open. The client bakes a bullet hole at `x2,y2` for it.
   */
  wall?: boolean;
  /**
   * Which gunshot recording this round's report should play as. Absent for
   * the flamethrower (its own continuous stream has no discrete report) and
   * for anything that isn't `fire`'s ordinary hitscan at all — a cure beam
   * and a flame tongue are never bullets, whatever `kind` says about them.
   */
  voice?: GunVoice;
  /**
   * Fired from a bolt-action rifle specifically. `voice` alone can't say
   * this — the bolt action, the semi-auto and the charge rifle all share
   * `'rifle'`, since they fire the same round — but only the bolt action has
   * a bolt to work afterward, so the client plays the cycling sound on this
   * flag rather than on the voice.
   */
  bolt?: boolean;
  /**
   * The M1 Garand's en-bloc clip ejecting — the ping, and the reload that
   * follows it. `voice` alone can't say this either: only every `clipSize`th
   * round of a Garand triggers it, so most of that rifle's own shots carry
   * `voice: 'rifle'` with this absent, same as any other rifle round. See
   * `GARAND_CLIP_SIZE` and `playGarandCycle`.
   */
  clipEject?: boolean;
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
/**
 * One of the four hexagons on the dog's bar, or `null` for a slot with
 * nothing in it yet.
 *
 * The *key* is not on the wire, only the slot index: which keys the row is on
 * is the client's decision (`DOG_ABILITY_KEYS`), and sending them would be the
 * server repeating something it does not own. It is also what made moving the
 * row off W — where it collided with walking forward — a one-side change.
 */
export interface DogAbilityHud {
  /** Short name in the hexagon, e.g. `ROAR`. */
  name: string;
  /** Recharge, 0 to 1. 1 is ready. */
  ready: number;
  /** Charges banked, or -1 for an ability that does not use any. */
  charges: number;
  /** 0 to 1 while it is actually running, -1 the rest of the time. */
  active: number;
  /**
   * How many more people this dog has to turn before the ability works at all;
   * 0 once it is open.
   *
   * A number rather than a boolean, because a locked hexagon that says nothing
   * is indistinguishable from a broken one. What the player needs to know is
   * how much further there is to go, and that is also the whole of the reason
   * the ability is gated: it makes biting people the thing that unlocks the
   * rest of the animal.
   */
  locked: number;
}

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
  /**
   * The ability bar, left to right — always `DOG_ABILITY_SLOTS` long, with a
   * `null` for each slot still empty. Sent whole rather than only the filled
   * ones so the client never has to work out which hexagon is which.
   */
  abilities: Array<DogAbilityHud | null>;
  /**
   * Officers the horde has made contact with — everything the corner map is
   * allowed to show beyond the dog itself.
   *
   * **What is *not* here is the point.** An officer nowhere near a zombie is
   * simply absent from the list, so the map cannot be used to hunt a quiet
   * street; there is no flag to ignore and no position to leak, because the
   * server never sends one. See `DOG_MAP_CONTACT_RANGE`.
   *
   * Positions are rounded to whole pixels — the map draws them a couple of
   * pixels across — and the list is a handful of entries, so it costs less on
   * the wire than one extra entity would.
   */
  contacts: Array<{ x: number; y: number }>;
  /** No horde left and it went down. Out of the round. */
  out: boolean;
  /**
   * Coming out of a shambler, 0 to 1 across `DOG_BIRTH_MS`; -1 otherwise.
   *
   * Separate from `dying` rather than an extension of it, because the two are
   * opposite states that happen to be adjacent: `dying` blacks the screen out
   * and this one has to bring it back, and a single ramp through both would
   * have the client guessing which half of it was which. It is also what tells
   * the HUD to stay off — there is no animal to draw a jaw bar for yet.
   */
  birth: number;
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
   * What is left of a thing that was dropped rather than spawned — rounds in a
   * gun, hits on a Kevlar vest. Absent means full (a fresh magazine, a fresh
   * vest); loot found in the world always is. Zero rounds draws grey, which is
   * how everyone else knows not to bother walking over for it.
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
  /**
   * Hits left on each Kevlar vest carried, one per `'kevlar'` in `utilities`
   * and in the same order. `[0]` is the one being worn; the rest are spares
   * that drop in the instant the worn one is torn off. Empty for no vest.
   */
  kevlarUses: number[];
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
   * Press a hexagon on the dog's bar. Its own message rather than an
   * `AbilityId`, for the reasons `beaconPlace` is: nothing about it goes near
   * the officers' Q wheel, it spends no rally charge, and the only thing the
   * client can honestly say about it is *which key went down*. Where it is
   * aimed is read off the same `aimX`/`aimY` the input loop is already
   * sending, so a slow message cannot leave the dog roaring at a stale bearing.
   */
  | { type: 'dogAbility'; slot: number }
  /**
   * Where on the map the beacon should go. Deliberately its own message rather
   * than an `AbilityId`: it is not on the Q wheel, it costs no rally charge,
   * and it is picked off a map rather than by clicking the world.
   */
  | { type: 'beaconPlace'; x: number; y: number }
  | { type: 'selectSlot'; slot: number }
  /**
   * A spectator's RTS order to one or more grey NPC officers: go here and hold.
   *
   * Only honoured from a socket that is actually spectating — a player cannot
   * command the garrison — and only for grey AI officers (not blue bots, olive
   * soldiers or black SWAT). `stop` freezes them where they stand (x/y ignored);
   * `release` clears the order so they go back to their own AI. Selection lives
   * entirely on the client; this order is the only thing that reaches the
   * server, and it is an order, not anything about visibility.
   *
   * A plain move keeps the group's **shape**: the server takes the centroid of
   * the named bodies, keeps each one's offset from it, and scales the lot down
   * — so `x`/`y` is where the *formation* goes, not where every officer goes.
   * See `COMMAND_FORMATION_SPREAD`.
   *
   * `build` is the command card's one order: the nearest of `ids` who still has
   * a sandbag walks to `x`/`y` and stacks one at `angle`. Nobody else in the
   * selection is disturbed.
   */
  | {
      type: 'command';
      ids: string[];
      x: number;
      y: number;
      stop?: boolean;
      release?: boolean;
      build?: 'sandbag';
      /** Which way the wall lies, from the ghost the spectator rotated. */
      angle?: number;
      /**
       * A double right-click: this move may take an officer off a wall he has
       * been sent to build.
       *
       * A single one may not. Ordering a wall is a walk of several seconds, and
       * a stray right-click anywhere on the map would otherwise throw the whole
       * errand away with nothing said — so a plain move simply passes the
       * builder by and moves everybody else. The gesture is the client's, like
       * shift-queueing and the H and R keys; the wire carries what it meant.
       */
      override?: boolean;
    }
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
  /**
   * **TESTING: turn the dog's ability cooldowns off.** Offline rounds only, and
   * the server enforces that rather than trusting this.
   *
   * The only message the options screen sends, and it is there under protest:
   * every other row on that screen is a *client* decision about how the world
   * is drawn, which is what makes "no two players can see a different game"
   * true. A cooldown is not that — it is a rule about the game and it has to
   * reach the server — so it carries the same restriction `noFog` does, for the
   * same reason: an offline round has exactly one person in it, so there is
   * nobody to see a different game from.
   */
  | { type: 'testDogAbilities'; free: boolean }
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
  /**
   * `build` is the *server's* stamp. The client bakes in its own at compile
   * time and shows the two against each other on the title screen, so a box
   * that forgot to pull is visible before anybody presses START rather than
   * through whatever goes wrong an hour later.
   */
  | { type: 'welcome'; selfId: string; map: MapData; build: string }
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
      /**
       * Zombies that died this tick, for one tick, exactly like `shots` — the
       * client throws a ragdoll-and-grey corpse off each one and nothing more
       * is sent. `a` is the direction to shove the body (the round's travel
       * direction). Empty on almost every tick; a burst of a few at the endgame.
       * Dogs are not here — they keep their own permanent `corpses` list.
       */
      deaths: Array<{ id: string; x: number; y: number; a: number }>;
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
      acid: AcidState[];
      spits: SpitState[];
      tentacles: TentacleState[];
      lashes: LashState[];
      blasts: BlastState[];
      ducks: DuckState[];
      /** Deployed pocket gunners: the gun, and the bags in front of it. */
      emplacements: EmplacementState[];
      /** Bare sandbag walls a spectator had the garrison build. */
      barricades: BarricadeState[];
      /** Walls ordered and not yet built, drawn as ghosts. Spectators only. */
      buildSites: BuildSiteState[];
      vehicles: BackupVehicleState[];
      mines: MineState[];
      /** Every dog put down this round, left where it fell. */
      corpses: CorpseState[];
      towers: BeaconState[];
      zaps: Array<{ x: number; y: number; at: number }>;
      /**
       * A sob from someone genuinely hiding in a bush, for one tick — sound
       * only, exactly like `zaps`. No id, no entity data: the client just
       * spatialises it and plays `groan-06-sobbing.mp3` through it.
       */
      sobs: Array<{ x: number; y: number }>;
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
