/**
 * The game, with no idea how anybody is talking to it.
 *
 * **This file must never import anything Node-only.** It is loaded in two very
 * different places: the `ws` server in `index.ts`, and a Web Worker inside the
 * browser for offline play. Everything the simulation touches — the AI, the
 * map, combat, the nav grid — was already plain TypeScript; what used to tie it
 * to Node was this file's own socket and HTTP handling, and that now lives in
 * the hosts instead.
 *
 * A connection is an id and a way to send to it. That is the whole of the
 * abstraction: a WebSocket and a `postMessage` port both fit it, and nothing
 * below this line can tell which it is talking to.
 */
import type {
  ClientMessage,
  EntityState,
  PickupState,
  ServerMessage,
  Shot,
  SpeechState,
} from '../../shared/types.js';
import {
  collect,
  dropHeld,
  heldItem,
  nearestPickup,
  newInventory,
  toWireInventory,
  gunSlots,
  utilitySlots,
  dropDebugKit,
  giveStartingItem,
} from './inventory.js';
import { ITEMS } from '../../shared/items.js';
import { grenadesToWire, helicoptersToWire, requestBeacon, smokesToWire, updateAirSupport } from './heli.js';
import {
  TICK_RATE,
  PLAYER_SPEED,
  PLAYER_SIGHT_RADIUS,
  DOG_SIGHT_RADIUS,
  ENTITY_RADIUS,
  PATH_NODE_BUDGET_PER_TICK,
  STAMINA_MAX,
  STAMINA_DRAIN_PER_SEC,
  STAMINA_REGEN_PER_SEC,
  STAMINA_SPRINT_FLOOR,
  STAMINA_RECOVERY_THRESHOLD,
  SPRINT_MULTIPLIER,
  BEACON_THRESHOLD,
  RALLY_STARTING_CHARGES,
  FOLLOW_STARTING_CHARGES,
  FOLLOW_SHOUT,
  FOLLOW_WAIT_SHOUT,
  RALLY_SHOUT,
  RALLY_SHOUT_MS,
  RALLY_NO_CHARGE_LINE,
  RALLY_NO_CHARGE_MS,
  GUN_SLOTS,
  UTILITY_SLOTS,
  DROP_HOLD_MS,
  BLAST_MS,
  TAP_MAX_MS,
  SNIPER_SIGHT_RADIUS,
  BINOCULAR_SIGHT_RADIUS,
  THERMAL_RANGE,
  BEACON_SHOUT,
  BEACON_SHOUT_MS,
  BEACON_REFUSED_LINE,
  BOOTS_SPEED_MUL,
  BOOTS_STAMINA_MUL,
  GUNSLING_SLOTS,
  setCityPopulation,
  citySizeFor,
} from '../../shared/constants.js';
import {
  countSurvivors,
  countZombies,
  createWorld,
  findSpawn,
  findSpawnNear,
  hasLineOfSight,
  humanPositions,
  makeEntity,
  playerOneStart,
  rebuildEntityGrid,
  rebuildNav,
  resetWorld,
  resolveCollisions,
  spawnDog,
  speedAt,
  toWire,
  type Entity,
} from './world.js';
import { dogHudFor, lashesToWire, startDogAbility, tentaclesToWire, updateDogs } from './dog.js';
import { computeFrozen, followMe, holdPosition, rallyHumans, updateAi } from './ai.js';
import { processShooting, steerAim } from './combat.js';
import { allDoorsToWire, doorAt, doorsToWire } from './doors.js';
import { ducksToWire, updateDucks } from './ducks.js';
import {
  emplacementsToWire,
  resolveEmplacementCollisions,
  updateEmplacements,
} from './emplacement.js';
import { acidToWire, spitsToWire, updateAcid } from './acid.js';
import { firesToWire, updateFires } from './fire.js';
import { resolveVehicleCollisions, updateBackup, vehiclesToWire } from './backup.js';
import { minesToWire, updateMines } from './mines.js';
import { doorPromptFor, processPlayerDoors } from './doorplayer.js';
import {
  anyRunning,
  botCount,
  chat,
  clearNotice,
  createLobby,
  cycle,
  joinLobby,
  leaveLobby,
  lobbyOf,
  say,
  seatedDogs,
  seatedPlayers,
  setPopulation,
  setSpectating,
  sit,
  viewFor,
  type Lobby,
} from './lobby.js';

const TICK_MS = 1000 / TICK_RATE;

/** How a host hands a message to one connection. */
export type Send = (message: ServerMessage) => void;

/**
 * What the host has to tell the engine, because the engine cannot find it out
 * for itself without reaching for Node.
 */
export interface EngineConfig {
  /**
   * Which build this is, handed to every client in its `welcome`. Working it
   * out means shelling out to git, which only a Node host can do — a worker is
   * given whatever the page was built with instead.
   */
  build: string;
  /**
   * Whether an anonymous connection may wipe the running world.
   *
   * `restart`, and `spectate` with `restart` set, both call `resetWorld` — from
   * *any* connection, in or out of a lobby. Harmless when the only way here was
   * the same LAN; not harmless behind a tunnel, where the address is all
   * anybody needs and the four-letter code covers neither message.
   *
   * Off unless the host says otherwise. A worker sets it true without a second
   * thought: the only thing that can talk to it is the page it belongs to.
   */
  allowWorldReset: boolean;
}

let config: EngineConfig = { build: 'unknown', allowWorldReset: false };
export function configureEngine(next: EngineConfig): void {
  config = next;
}

export const world = createWorld();
/** Everyone attached, and how to reach them. */
const connections = new Map<string, Send>();

console.log(`[server] city generated with seed ${world.map.seed}`);

function send(to: string | Send, message: ServerMessage): void {
  const fn = typeof to === 'string' ? connections.get(to) : to;
  if (fn) fn(message);
}

function broadcast(message: ServerMessage): void {
  for (const fn of connections.values()) send(fn, message);
}

/** Nothing pressed. What every fresh player, of either kind, starts holding. */
function blankCommand() {
  return {
    input: { up: false, down: false, left: false, right: false },
    aim: 0,
    aimX: 0,
    aimY: 0,
    shooting: false,
    sprint: false,
    interact: false,
    rightDown: false,
  };
}

/**
 * Put a connection into the world. Nobody gets an entity on connect any more —
 * you arrive at the front end, and only a lobby starting a round puts you in a
 * city. The first officer in gets the designated start point so testing needs
 * no hike.
 *
 * Which seat they took at the front end is the whole of the choice: a dog slot
 * spawns a dog, at the breach with the rest of the outbreak, and takes none of
 * the officer kit below — no inventory, no rally charges, no debug heap. It
 * still needs a command entry, which is what the input loop writes into.
 */
function spawnPlayer(id: string, asDog = false): void {
  if (asDog) {
    world.playerIds.add(id);
    spawnDog(world, id);
    world.commands.set(id, blankCommand());
    return;
  }

  const isPlayerOne = world.playerIds.size === 0;
  const start = playerOneStart(world);
  const spawn = isPlayerOne
    ? findSpawnNear(world, start.x, start.y, ENTITY_RADIUS.officer)
    : findSpawn(world, ENTITY_RADIUS.officer);

  world.entities.set(id, makeEntity(id, 'officer', spawn.x, spawn.y));
  world.playerIds.add(id);
  world.commands.set(id, blankCommand());
  world.inventories.set(id, newInventory());
  world.stamina.set(id, STAMINA_MAX);
  world.rallyCharges.set(id, RALLY_STARTING_CHARGES);
  world.followCharges.set(id, FOLLOW_STARTING_CHARGES);
  // Everybody in a player slot opens the round holding one random thing.
  giveStartingItem(world, id, spawn.x, spawn.y);
  // TESTING: the debug heap follows whoever spawns rather than being laid into
  // the city. No-ops unless TEST_DROP_ALL_ITEMS.
  dropDebugKit(world, id, spawn.x, spawn.y);
}

/** Take a connection back out of the world — they've gone, or the lobby has. */
function despawnPlayer(id: string): void {
  world.entities.delete(id);
  world.playerIds.delete(id);
  world.commands.delete(id);
  world.inventories.delete(id);
  world.dogs.delete(id);
  world.dogState.delete(id);
  world.dogsOut.delete(id);
  world.dogDeaths.delete(id);
}

/** Redraw a lobby for everyone in it. Each viewer sees their own 'self' flags. */
function pushLobby(lobby: Lobby): void {
  for (const connId of lobby.members.keys()) {
    send(connId, { type: 'lobby', lobby: viewFor(lobby, connId) });
  }
}

/** Tell everyone in a lobby it has gone, and drop them back to the front end. */
function closeLobby(lobby: Lobby, reason: string): void {
  for (const connId of lobby.members.keys()) {
    send(connId, { type: 'lobbyLeft', reason });
    despawnPlayer(connId);
  }
}

/**
 * Begin a lobby's round. There is one world, so this refuses while another
 * lobby's round is under way rather than resetting the city out from under it.
 */
function startLobby(lobby: Lobby): void {
  if (lobby.running) return;
  if (anyRunning()) {
    say(lobby, '', 'another round is already running — wait for it to finish');
    pushLobby(lobby);
    return;
  }

  const seated = seatedPlayers(lobby);
  const bots = botCount(lobby);
  // A round of nothing but bots is the point of watching one, so this only
  // refuses when there'd be no officers in the city at all.
  if (seated.length === 0 && bots === 0) {
    say(lobby, '', 'nobody is playing and no bots are set — fill a slot first');
    pushLobby(lobby);
    return;
  }

  // Only the people in this lobby exist in the round. Anyone left over from a
  // previous one is cleared out first, or they'd wander a city they never
  // joined.
  for (const connId of world.playerIds) despawnPlayer(connId);
  world.playerIds.clear();

  lobby.running = true;
  clearNotice(lobby);
  world.botOfficerCount = bots;
  world.offline = lobby.offline;
  // Which team each of them sat on. Read *before* `resetWorld`, because the
  // respawn loop inside it consults `world.dogs` to decide what to rebuild
  // anyone already in the world as.
  const dogs = seatedDogs(lobby);
  world.dogs.clear();
  world.dogState.clear();
  world.dogsOut.clear();
  world.corpses.length = 0;
  world.dogDeaths.clear();
  for (const connId of dogs) world.dogs.add(connId);
  // The host's slider. **Immediately before `resetWorld` and nowhere else** —
  // it writes `WORLD_WIDTH`/`WORLD_HEIGHT`/`HUMAN_COUNT`, and everything sized
  // to a city (the nav grid, the room map, the broadphase grids) is rebuilt on
  // the far side of this line rather than the near one.
  setCityPopulation(lobby.population);
  resetWorld(world);

  /*
   * Did the size actually reach `mapgen`?
   *
   * `WORLD_WIDTH` is a live ES module binding, and **a live binding is exactly
   * as live as the module format underneath it**. `shared/` had no
   * `package.json` and there is no root one, so node treated those files as
   * CommonJS — where an exported binding is a snapshot taken at import time —
   * and every round came out 5000x3700 with 500 people in it no matter where
   * the slider was. Nothing errored. `shared/package.json` is what fixes it,
   * and this is what makes losing it again loud instead of silent: the map
   * carries what `mapgen` believed, and `citySizeFor` is an independent oracle
   * for what it was told.
   */
  const want = citySizeFor(lobby.population);
  if (world.map.width !== want.width || world.map.height !== want.height) {
    console.error(
      `[server] the population setting did not reach mapgen — asked for ` +
        `${want.width}x${want.height}, generated ${world.map.width}x${world.map.height}. ` +
        `Check that shared/package.json exists and says { "type": "module" }.`,
    );
  }
  for (const connId of seated) spawnPlayer(connId, dogs.has(connId));
  // resetWorld clears the watchers, so they go back in afterwards. A spectator
  // has no entity at all — they see the whole city instead of a fogged slice.
  for (const connId of lobby.spectators) world.spectators.add(connId);

  console.log(
    `[server] "${lobby.name}" started — ${seated.length - dogs.size} officers, ` +
      `${dogs.size} dogs, ${bots} bot officers, ${lobby.spectators.size} watching, ` +
      `${lobby.population} civilians in a ${world.map.width}x${world.map.height} city`,
  );

  // Chat gets told; a solo room doesn't need telling, since the game is about
  // to take the screen — and it would sit there as a stale notice.
  if (!lobby.offline) say(lobby, '', 'the round has begun');
  pushLobby(lobby);
  for (const connId of lobby.members.keys()) {
    send(connId, { type: 'start' });
    send(connId, { type: 'map', map: world.map });
  }
}

/**
 * Somebody has arrived. The host supplies the id and the way back to them.
 *
 * Ids come from the host because the two have different ones available and
 * neither should be guessed at from here: `randomUUID` under Node, whatever the
 * page hands the worker in the browser.
 */
export function connect(id: string, sendTo: Send): void {
  connections.set(id, sendTo);
  send(id, { type: 'welcome', selfId: id, map: world.map, build: config.build });
  console.log(`[server] ${id} connected (${connections.size} at the front end or playing)`);
}

/**
 * One message from one connection.
 *
 * Takes a parsed message rather than bytes: a socket has to `JSON.parse` its
 * text, but a worker is handed a structured clone and would only be re-parsing
 * something it never serialised.
 */
export function handle(id: string, msg: ClientMessage): void {
  {
    {
      if (msg.type === 'ping') {
        // Answered here, in the message handler, rather than anywhere near the
        // tick — the point of the number is to measure the *network*, and a
        // reply that waited for the next tick would fold up to 33ms of server
        // cadence into it and report the wire as slower than it is. What the
        // cadence costs is added back on the client, where it can be labelled.
        send(id, { type: 'pong', t: msg.t });
      } else if (msg.type === 'input') {
        world.commands.set(id, {
          input: msg.input,
          aim: msg.aim,
          aimX: msg.aimX,
          aimY: msg.aimY,
          shooting: msg.shooting,
          sprint: msg.sprint,
          interact: msg.interact,
          rightDown: msg.rightDown,
        });
      } else if (msg.type === 'selectSlot') {
        const inv = world.inventories.get(id);
        // The top of the range moves with the sling and the pack, so a slot
        // only a backpack opened up is selectable while the pack is in the bag.
        if (inv && msg.slot >= 0 && msg.slot <= gunSlots(inv) + utilitySlots(inv)) {
          inv.activeSlot = msg.slot;
        }
      } else if (msg.type === 'ability' && msg.ability === 'follow') {
        const officer = world.entities.get(id);
        const now = Date.now();
        if (officer && officer.type === 'officer' && (world.followCharges.get(id) ?? 0) > 0) {
          // The charge isn't spent here — it goes when they're released, so
          // one charge buys a full follow-then-wait cycle.
          const came = followMe(world, id, officer.x, officer.y);
          if (came > 0) {
            world.followers.add(id);
            world.speech.set(id, { text: FOLLOW_SHOUT, until: now + RALLY_SHOUT_MS });
          }
          console.log(`[server] ${id} asked ${came} civilians to follow`);
        }
      } else if (msg.type === 'ability' && msg.ability === 'wait') {
        const officer = world.entities.get(id);
        const now = Date.now();
        if (officer && world.followers.has(id)) {
          const held = holdPosition(world, id);
          world.followers.delete(id);
          world.followCharges.set(id, Math.max(0, (world.followCharges.get(id) ?? 0) - 1));
          world.speech.set(id, { text: FOLLOW_WAIT_SHOUT, until: now + RALLY_SHOUT_MS });
          console.log(`[server] ${id} told ${held} civilians to hold`);
        }
      } else if (msg.type === 'ability' && msg.ability === 'rally') {
        const officer = world.entities.get(id);
        const now = Date.now();
        if (!officer || officer.type !== 'officer') {
          // Only an officer can shout.
        } else if ((world.rallyCharges.get(id) ?? 0) > 0) {
          world.rallyCharges.set(id, (world.rallyCharges.get(id) ?? 0) - 1);
          world.speech.set(id, { text: RALLY_SHOUT, until: now + RALLY_SHOUT_MS });
          const moved = rallyHumans(world, officer.x, officer.y, msg.x, msg.y);
          console.log(`[server] ${id} rallied ${moved} civilians`);
        } else {
          world.speech.set(id, { text: RALLY_NO_CHARGE_LINE, until: now + RALLY_NO_CHARGE_MS });
        }
      } else if (msg.type === 'ability' && msg.ability === 'beacon') {
        // Unlike the rally shout, this costs nothing and can be given again
        // and again: the mast is a fixed place on the map, so the order is
        // "go there", not "go to the spot I just picked".
        const officer = world.entities.get(id);
        const now = Date.now();
        const tower = nearestTower(officer);
        if (!officer || officer.type !== 'officer') {
          // Not somebody who can shout.
        } else if (!tower) {
          // Nothing standing anywhere in the city, so there is nowhere to send
          // anybody. The wheel does not offer the order at all in that case —
          // this is only the server refusing to trust the client about it.
        } else if ((world.rallyCharges.get(id) ?? 0) > 0) {
          world.rallyCharges.set(id, (world.rallyCharges.get(id) ?? 0) - 1);
          world.speech.set(id, { text: BEACON_SHOUT, until: now + BEACON_SHOUT_MS });
          const moved = rallyHumans(world, officer.x, officer.y, tower.x, tower.y);
          console.log(`[server] ${id} sent ${moved} civilians to the beacon`);
        } else {
          world.speech.set(id, { text: RALLY_NO_CHARGE_LINE, until: now + RALLY_NO_CHARGE_MS });
        }
      } else if (msg.type === 'dogAbility') {
        // Everything about whether it is allowed is `startDogAbility`'s, so a
        // second caller could never get a different set of refusals. The aim
        // point is not in the message either way: the roar reads the input
        // loop's own `aimX`/`aimY` when its two seconds are up, and the spit
        // reads the same pair on the tick the key went down.
        const did = startDogAbility(world, id, msg.slot, Date.now());
        if (did === 'roared') console.log(`[server] ${id} began a roar`);
        else if (did === 'spat') console.log(`[server] ${id} spat acid`);
      } else if (msg.type === 'beaconPlace') {
        // A spot picked off the map rather than clicked in the world, so
        // nothing about it has been validated by having walked there.
        // `requestBeacon` refuses a second one and refuses ground nobody could
        // stand on; the wait for the flight is the cost of the decision.
        const officer = world.entities.get(id);
        const inv = world.inventories.get(id);
        const now = Date.now();
        if (!officer || officer.type !== 'officer' || !inv) {
          // Not somebody holding a handset.
        } else if (!inv.utilities.includes('survivorBeacon')) {
          // They put it down between opening the map and clicking it.
        } else if (!requestBeacon(world, msg.x, msg.y, now)) {
          world.speech.set(id, { text: BEACON_REFUSED_LINE, until: now + RALLY_NO_CHARGE_MS });
        } else {
          console.log(`[server] ${id} called the beacon in at ${msg.x | 0},${msg.y | 0}`);
        }
      } else if (msg.type === 'spectate') {
        // Normally a fresh game to watch; `restart: false` drops into the one
        // already running, so a round can be observed as it actually plays out.
        // Resetting is gated: watching is harmless, wiping everyone's city is
        // not, and this server is reachable from the internet now.
        const restart = msg.restart !== false && config.allowWorldReset;
        if (restart) resetWorld(world);
        world.spectators.add(id);
        world.entities.delete(id);
        world.playerIds.delete(id);
        console.log(
          `[server] ${id} is spectating${restart ? ' a fresh round' : ' the round in progress'}`,
        );
        if (restart) broadcast({ type: 'map', map: world.map });
        else send(id, { type: 'map', map: world.map });
      } else if (msg.type === 'lobbyCreate') {
        world.names.set(id, msg.gamertag);
        const lobby = createLobby(id, msg.name, msg.gamertag, msg.offline === true);
        console.log(
          `[server] ${msg.gamertag} created ${lobby.offline ? 'an offline' : 'lobby'}` +
            ` "${lobby.name}" (${lobby.code})`,
        );
        pushLobby(lobby);
      } else if (msg.type === 'lobbyJoin') {
        world.names.set(id, msg.gamertag);
        const joined = joinLobby(id, msg.code, msg.gamertag);
        if (!joined.ok) {
          // A mistyped code, or a lobby that closed while they were typing it.
          // `lobbyError` rather than `lobbyLeft` because they have not left
          // anywhere — they are still stood on the JOIN screen, which is where
          // the answer has to appear if they are to try again.
          console.log(`[server] ${msg.gamertag} could not join: ${joined.reason}`);
          send(id, { type: 'lobbyError', message: joined.reason });
        } else {
          console.log(
            `[server] ${msg.gamertag} joined "${joined.lobby.name}" (${joined.lobby.code})`,
          );
          pushLobby(joined.lobby);
        }
      } else if (msg.type === 'lobbySit') {
        if (sit(id, msg.team, msg.index)) {
          const lobby = lobbyOf(id);
          if (lobby) pushLobby(lobby);
        }
      } else if (msg.type === 'lobbySpectate') {
        if (setSpectating(id, msg.on)) {
          const lobby = lobbyOf(id);
          if (lobby) pushLobby(lobby);
        }
      } else if (msg.type === 'lobbyCycle') {
        if (cycle(id, msg.team, msg.index)) {
          const lobby = lobbyOf(id);
          if (lobby) pushLobby(lobby);
        }
      } else if (msg.type === 'testDogAbilities') {
        /**
         * TESTING: the dog's ability cooldowns, off.
         *
         * **Stored whatever the round is, and honoured only offline** — the
         * refusal lives in `readyAt` rather than here. Two reasons it is that
         * way round: the client sends this on `start`, which is the moment
         * `world.offline` has just been written, so a check here would race the
         * order the two arrive in; and a rule enforced at the point of use
         * cannot be got round by a message sent at some other moment.
         */
        world.dogAbilitiesFree = msg.free;
        console.log(
          `[server] dog ability limits ${msg.free ? 'OFF' : 'on'} (offline round: ${world.offline})`,
        );
      } else if (msg.type === 'lobbyPopulation') {
        // Sent live as the host drags, so the room watches the number move.
        // `setPopulation` answers false for a value that did not change, which
        // is most of the messages a drag produces — pushing the lobby back for
        // every pixel of travel is a broadcast per pixel for no new news.
        if (setPopulation(id, msg.population)) {
          const lobby = lobbyOf(id);
          if (lobby) pushLobby(lobby);
        }
      } else if (msg.type === 'lobbyChat') {
        const lobby = chat(id, msg.text);
        if (lobby) {
          // "go" from the host is the start command — it's quicker than
          // reaching for the button, and everyone in the room sees it happen.
          const said = msg.text.trim().toLowerCase();
          if (said === 'go' && lobby.hostId === id) startLobby(lobby);
          else pushLobby(lobby);
        }
      } else if (msg.type === 'lobbyStart') {
        const lobby = lobbyOf(id);
        if (lobby && lobby.hostId === id) startLobby(lobby);
      } else if (msg.type === 'lobbyPause') {
        // Solo only. In a room with other people your panel is your business,
        // not a reason for their city to stop.
        const lobby = lobbyOf(id);
        if (lobby && lobby.offline && lobby.running) world.paused = msg.on;
      } else if (msg.type === 'lobbyRestart') {
        const lobby = lobbyOf(id);
        if (lobby && lobby.hostId === id && lobby.running) {
          // Clearing `running` first is what lets startLobby through — it
          // refuses while a round is up, which is exactly what this replaces.
          lobby.running = false;
          world.paused = false;
          startLobby(lobby);
        }
      } else if (msg.type === 'lobbyLeave') {
        const left = leaveLobby(id);
        despawnPlayer(id);
        if (left) {
          if (left.closed) closeLobby(left.lobby, 'the host closed the lobby');
          else pushLobby(left.lobby);
        }
      } else if (msg.type === 'restart' && config.allowWorldReset) {
        // Nothing in the client sends this any more — the pause panel's Restart
        // is `lobbyRestart`, which checks you are the host of the round it is
        // replacing. This is the bare version, kept for headless work, and it
        // trusts whoever sends it, which is why it is gated.
        // Someone watching stays watching: resetWorld gives every connection a
        // fresh officer, which dropped a spectator back into first person.
        const watching = world.spectators.has(id);
        resetWorld(world);
        if (watching) {
          world.spectators.add(id);
          world.entities.delete(id);
          world.playerIds.delete(id);
        }
        console.log(`[server] game reset — new city seed ${world.map.seed}`);
        broadcast({ type: 'map', map: world.map });
      }
    }
  }
}

/** They have gone. Take every trace of them out of the world. */
export function disconnect(id: string): void {
  {
    {
    const left = leaveLobby(id);
    if (left) {
      if (left.closed) closeLobby(left.lobby, 'the host left');
      else pushLobby(left.lobby);
    }
    world.names.delete(id);
    world.entities.delete(id);
    world.playerIds.delete(id);
    world.spectators.delete(id);
    world.commands.delete(id);
    world.dogs.delete(id);
    world.dogState.delete(id);
    world.dogsOut.delete(id);
    world.dogDeaths.delete(id);
    world.ai.delete(id);
    world.grapples.delete(id);
    world.pendingInfections.delete(id);
    world.infectedByDog.delete(id);
    world.dogConversions.delete(id);
    world.dogTurned.delete(id);
    world.dogCooldowns.delete(id);
    world.grappleCounts.delete(id);
    world.speedBoosts.delete(id);
    world.lastShotAt.delete(id);
    connections.delete(id);
    console.log(`[server] player ${id} disconnected (${connections.size} playing)`);
    }
  }
}

function updatePlayers(dt: number, frozen: Set<string>, now: number): void {
  for (const id of world.playerIds) {
    // Dogs are players too, but nothing below applies to one: no weapon to
    // steer the aim with, no boots, no bipod, and a body that turns at its own
    // rate rather than snapping. `updateDogs` is the whole of theirs.
    if (world.dogs.has(id)) continue;
    const entity = world.entities.get(id);
    const command = world.commands.get(id);
    if (!entity || !command) continue;

    // Officers point where the mouse points; anything else faces where it
    // walks. A weapon with a `turnRate` swings slowly and drags the body round
    // with it, so this is the one value both the drawn facing and the shot
    // direction come from — worked out here, before anything fires.
    if (entity.type === 'officer') entity.facing = steerAim(world, id, command.aim, dt, now);

    let dx = 0;
    let dy = 0;
    // Behind a planted bipod you are a gun emplacement, not a person — that is
    // the trade the heavy MG asks for, and it starts the moment you commit,
    // not when the pegs finish going down.
    const rooted = world.deployStart.has(id);
    if (!frozen.has(id) && !rooted) {
      if (command.input.up) dy -= 1;
      if (command.input.down) dy += 1;
      if (command.input.left) dx -= 1;
      if (command.input.right) dx += 1;
    }
    const moving = dx !== 0 || dy !== 0;

    // Stamina drains only while actually sprinting, and refills otherwise.
    // Running it dry latches an exhausted state that only clears once the bar
    // has climbed back past STAMINA_RECOVERY_THRESHOLD.
    // Boots are worn, not held: carrying them is enough. They are quicker and
    // cheaper on the legs, which is what a whole utility slot buys.
    const inv = world.inventories.get(id);
    const booted = inv !== undefined && inv.utilities.includes('combatBoots');

    let stamina = world.stamina.get(id) ?? STAMINA_MAX;
    const locked = world.exhausted.has(id);
    const wantsSprint = command.sprint && moving && !locked && stamina > STAMINA_SPRINT_FLOOR;

    if (wantsSprint) {
      stamina = Math.max(0, stamina - STAMINA_DRAIN_PER_SEC * (booted ? BOOTS_STAMINA_MUL : 1) * dt);
      if (stamina <= STAMINA_SPRINT_FLOOR) world.exhausted.add(id);
    } else {
      stamina = Math.min(STAMINA_MAX, stamina + STAMINA_REGEN_PER_SEC * dt);
      if (locked && stamina >= STAMINA_RECOVERY_THRESHOLD) world.exhausted.delete(id);
    }
    world.stamina.set(id, stamina);

    if (!moving) continue;

    const len = Math.hypot(dx, dy);
    const base = PLAYER_SPEED * (wantsSprint ? SPRINT_MULTIPLIER : 1) * (booted ? BOOTS_SPEED_MUL : 1);
    const speed = speedAt(world, entity.x, entity.y, base, entity.type);
    entity.x += (dx / len) * speed * dt;
    entity.y += (dy / len) * speed * dt;
    if (entity.type !== 'officer') entity.facing = Math.atan2(dy, dx);
  }
}

/** Fog of war is enforced server-side: unseen entities are never sent. */
/**
 * How far this viewer can see. Down a scope you see a good deal further —
 * without it the sniper would out-range the fog and you'd be shooting at ground
 * with nothing drawn on it.
 */
function sightRadiusFor(viewer: Entity): number {
  // The dog's camera is pulled out to `DOG_CAMERA_ZOOM`, so its screen reaches
  // further than an officer's and the fog hole it punches is wider. This is the
  // other half of that: light ground the server never populated and the dog
  // gets a broader view of an emptier street, which is worse than not widening
  // it at all. Checked before the bag, since a dog has no bag to check.
  // `world.dogs`, not `viewer.dog`. `Entity extends EntityState`, so the wire's
  // `dog` flag is in the server type and compiles perfectly here — but nothing
  // server-side ever sets it. It is added in `toWire`, off this same set, which
  // is why the client sees a dog and a check on the entity sees `undefined`.
  if (world.dogs.has(viewer.id)) return DOG_SIGHT_RADIUS;
  const inv = world.inventories.get(viewer.id);
  const held = inv ? heldItem(inv) : null;
  if (held && ITEMS[held]?.scope) return SNIPER_SIGHT_RADIUS;
  /**
   * **Binoculars run on being carried, not on being held**, the same trade the
   * tracker, the goggles and the beacon handset already make: the slot is the
   * cost.
   *
   * Held, they were something you took out, looked through and put away — and
   * the one moment you most want to see further is the one moment you least
   * want to be holding a pair of binoculars instead of a rifle. Carried, what
   * they buy is a wider circle in **every** direction rather than a longer look
   * down one bearing, which is the honest version of the same item: the camera
   * push (`BINOCULAR_PUSH`) still needs them in hand, and that is what "looking
   * down them" now means.
   *
   * The client's `baseSightRadius` reads the same bag for the same reason the
   * sniper's radius has to be matched on both ends — a fog hole wider than what
   * the server populates is an empty street rather than an error, which is the
   * fault this file has recorded three times.
   */
  if (inv && inv.utilities.includes('binoculars')) return BINOCULAR_SIGHT_RADIUS;
  return PLAYER_SIGHT_RADIUS;
}

/**
 * The mast this officer is pointing at: the nearest one, at any distance.
 *
 * No range test. The order is "go to the beacon", shouted at the people around
 * the officer — how far the officer is from the mast has nothing to do with
 * whether they can point at it, and capping it meant finding survivors out in
 * the city and having no way to send them anywhere.
 */
function nearestTower(officer: Entity | undefined): { x: number; y: number } | null {
  if (!officer) return null;
  let best: { x: number; y: number } | null = null;
  let bestDist = Infinity;
  for (const t of world.towers) {
    const d = Math.hypot(t.x - officer.x, t.y - officer.y);
    if (d < bestDist) {
      bestDist = d;
      best = t;
    }
  }
  return best;
}

function visibleTo(viewer: Entity, now: number): EntityState[] {
  const out: EntityState[] = [];
  // A cure gun anywhere in the bag picks the infected out of a crowd — you
  // can't aim a cure at somebody you can't tell apart from everyone else.
  //
  // A flamethrower does the same, but only **in hand**. It answers the infected
  // now (see `FLAME_INFECTED_DAMAGE_MUL`) and a weapon whose whole job is a
  // problem nobody can see is a weapon nobody uses. Held rather than carried
  // because it is a thing you raise and look down, where the cure gun's is a
  // triage you do with the whole bag — and it keeps the hole in the fog shut
  // for anyone merely walking around with one slung.
  const inv = world.inventories.get(viewer.id);
  const carriesCure = inv ? inv.utilities.includes('cureGun') : false;
  const burningThem = inv ? heldItem(inv) === 'flamethrower' : false;
  const reveal = viewer.type === 'zombie' || carriesCure || burningThem;
  const sight = sightRadiusFor(viewer);

  /**
   * Thermal goggles are a deliberate, narrow hole in server-enforced fog —
   * the one place anything is sent that the viewer cannot see.
   *
   * Kept as tight as it can be and still do the job: **zombies only**, inside
   * their own short radius, and flagged so the client draws a heat blob rather
   * than a body. Nothing else about the fog rule bends, so a wallhack for
   * survivors or loot is still impossible by construction.
   */
  // Worn, not held: goggles on your head work whatever is in your hands.
  const thermal = inv?.utilities.includes('thermalGoggles') ? THERMAL_RANGE : 0;

  for (const other of world.entities.values()) {
    if (other.id === viewer.id) {
      out.push(toWire(world, other, reveal, now));
      continue;
    }
    const dist = Math.hypot(other.x - viewer.x, other.y - viewer.y);
    // `viewer.type`, so a dog — which is a zombie with a flag — sees straight
    // through its own acid, and an officer standing in a cloud is sent nothing
    // at all. Server-enforced, so being blind is not something a client can
    // decline to render.
    const seen =
      dist <= sight && hasLineOfSight(world, viewer.x, viewer.y, other.x, other.y, false, viewer.type);
    if (seen) {
      out.push(toWire(world, other, reveal, now));
      continue;
    }
    if (thermal > 0 && other.type === 'zombie' && dist <= thermal) {
      const state = toWire(world, other, reveal, now);
      state.thermal = true;
      out.push(state);
    }
  }
  return out;
}

/** Loot is subject to the same fog rules as everything else. */
function visiblePickups(viewer: Entity): PickupState[] {
  const out: PickupState[] = [];
  const sight = sightRadiusFor(viewer);
  for (const p of world.pickups.values()) {
    if (Math.hypot(p.x - viewer.x, p.y - viewer.y) > sight) continue;
    if (!hasLineOfSight(world, viewer.x, viewer.y, p.x, p.y, false, viewer.type)) continue;
    out.push(p);
  }
  return out;
}

function visibleShots(viewer: Entity): Shot[] {
  const sight = sightRadiusFor(viewer);
  return world.shots.filter(
    (shot) =>
      (Math.hypot(shot.x1 - viewer.x, shot.y1 - viewer.y) <= sight &&
        hasLineOfSight(world, viewer.x, viewer.y, shot.x1, shot.y1, false, viewer.type)) ||
      (Math.hypot(shot.x2 - viewer.x, shot.y2 - viewer.y) <= sight &&
        hasLineOfSight(world, viewer.x, viewer.y, shot.x2, shot.y2, false, viewer.type)),
  );
}

/**
 * E is overloaded: a quick tap grabs (or swaps) whatever is underfoot, while
 * holding it past DROP_HOLD_MS throws away what you're carrying.
 */
function processInteractions(now: number): void {
  world.doorPrompts.clear();

  for (const id of world.playerIds) {
    const entity = world.entities.get(id);
    const command = world.commands.get(id);
    const inv = world.inventories.get(id);
    if (!entity || !command || !inv) continue;

    // A door under your nose takes the key before the floor does — unless
    // there's loot lying closer, or dropping a crate in a doorway would put it
    // permanently out of reach.
    const loot = nearestPickup(world, entity.x, entity.y);
    const doorIndex = doorAt(world, entity.x, entity.y);
    const doorFirst =
      doorIndex >= 0 &&
      (!loot ||
        Math.hypot(world.map.doors[doorIndex].x - entity.x, world.map.doors[doorIndex].y - entity.y) <
          Math.hypot(loot.x - entity.x, loot.y - entity.y));

    if (doorFirst && processPlayerDoors(world, entity, id, command.interact, now)) {
      inv.holdSince = null;
      inv.holdConsumed = false;
      continue;
    }

    if (command.interact) {
      if (inv.holdSince === null) {
        inv.holdSince = now;
        inv.holdConsumed = false;
      } else if (!inv.holdConsumed && now - inv.holdSince >= DROP_HOLD_MS) {
        const result = dropHeld(world, inv, entity.x, entity.y);
        inv.holdConsumed = true;
        if (result) console.log(`[server] ${id} ${result}`);
      }
      continue;
    }

    // Released. A short press with nothing dropped is a pickup attempt.
    if (inv.holdSince !== null) {
      const heldFor = now - inv.holdSince;
      if (!inv.holdConsumed && heldFor <= TAP_MAX_MS) {
        const result = collect(world, id, inv, entity.x, entity.y);
        if (result) console.log(`[server] ${id} ${result}`);
      }
      inv.holdSince = null;
      inv.holdConsumed = false;
    }
  }
}

let tickSamples = 0;
let tickTimeTotal = 0;
let lastPerfLog = Date.now();
/** Exponential moving average of tick cost, surfaced on the client HUD. */
let rollingTickMs = 0;
/** Worst single tick since the last `[perf]` line — an EMA hides the spikes. */
let worstTickMs = 0;

/**
 * Where the tick went, accumulated across the log window.
 *
 * The same trick as the client's frame profiler, and for the same reason: the
 * HUD says a tick cost 31ms, and that number on its own cannot say whether it
 * is the AI, the collision pass, the per-viewer serialisation or a nav rebuild
 * — which are four different fixes. Costs a `performance.now()` per phase.
 */
const phaseTotals = new Map<string, number>();
let phaseAt = 0;
/**
 * The current tick's own split, and the worst one seen in this window.
 *
 * The average says the tick costs 15ms; what is actually felt is the one that
 * cost 200. Those are not the same question and an average cannot answer the
 * second — a spike that lands once every few seconds is invisible in a mean
 * over 150 ticks and is exactly what a stutter is. So the breakdown of the
 * worst tick is kept whole, rather than folded into the totals.
 */
const phaseThisTick: Array<[string, number]> = [];
let worstPhases: Array<[string, number]> = [];
function mark(label: string): void {
  const t = performance.now();
  const cost = t - phaseAt;
  phaseTotals.set(label, (phaseTotals.get(label) ?? 0) + cost);
  phaseThisTick.push([label, cost]);
  phaseAt = t;
}

function tick(): void {
  const started = performance.now();
  phaseAt = started;
  phaseThisTick.length = 0;
  const dt = TICK_MS / 1000;
  const now = Date.now();

  world.pathBudget = PATH_NODE_BUDGET_PER_TICK;

  // Paused: nothing in the world advances, but snapshots keep going out so the
  // frozen scene stays on screen behind the panel. Only ever set by a solo
  // round — pausing one with other people in it would stop their game too.
  if (!world.paused) {
    // Glass smashed last tick opened a new way through — take it in once here,
    // rather than once per pane.
    // A whole new NavGrid and DangerField, and any smashed pane sets it off.
    if (world.navDirty) {
      rebuildNav(world);
      mark('rebuildNav');
    }

    rebuildEntityGrid(world);
    const frozen = computeFrozen(world);
    mark('grid+frozen');

    updatePlayers(dt, frozen, now);
    // Before the AI and before collision: a shaken victim is dragged onto the
    // jaws here and pushed back out of anything it was dragged into below,
    // which is the same deal every other body in the world gets.
    updateDogs(world, dt, now);
    mark('players+dogs');
    updateAi(world, now, dt, frozen);
    mark('updateAi');
    resolveCollisions(world);
    // Sandbags are deliberately not in the nav grid — like doors, routes are
    // planned as though they weren't there and whoever walks into one deals
    // with it. So the push-out happens here, once everyone has moved.
    resolveEmplacementCollisions(world);
    // A parked squad car is solid to bodies, like the sandbags, and pushed out
    // of here rather than through the nav grid for the same reason.
    resolveVehicleCollisions(world);
    mark('collisions');

    rebuildEntityGrid(world);
    updateEmplacements(world, now, dt);
    processInteractions(now);
    processShooting(world, now, frozen);
    updateAirSupport(world, now, dt);
    updateBackup(world, now, dt);
    updateMines(world, now);
    updateDucks(world, now, dt);
    updateFires(world, now, dt);
    // After the movers, because a gobbet landing blinds whoever is standing
    // there *now* rather than where they were at the top of the tick — and
    // before the serialise below, so a cloud that formed this tick is on the
    // wire this tick rather than one behind the body it is meant to hide.
    updateAcid(world, now, dt);
    mark('shooting+world');
  }

  const survivors = countSurvivors(world);
  const zombies = countZombies(world);

  if (!world.gameOver && !world.victory && survivors === 0) {
    world.gameOver = true;
    console.log('[server] game over — every survivor has turned');
  }
  if (!world.victory && !world.gameOver && zombies === 0) {
    world.victory = true;
    console.log('[server] victory — the outbreak is contained');
  }

  /**
   * Spectators see the whole board, infection markers included — and **only
   * spectators**, so it is built on the first one who asks and not before.
   *
   * This used to run unconditionally: a `toWire` for every entity in the city,
   * thirty times a second, in every round including a solo offline one where
   * nobody would ever read it. Lazy rather than gated on a flag so it is still
   * built at most once a tick however many people are watching.
   */
  let allEntities: EntityState[] | null = null;
  const wholeBoard = (): EntityState[] => {
    if (!allEntities) {
      allEntities = [];
      for (const e of world.entities.values()) allEntities.push(toWire(world, e, true, now));
    }
    return allEntities;
  };
  const infected = world.pendingInfections.size;

  // Air support is small enough to send to everyone unfiltered — a helicopter
  // overhead is not something fog should hide.
  const airGrenades = grenadesToWire(world, now);
  const airSmokes = smokesToWire(world, now);
  const airAcid = acidToWire(world, now);
  const airSpits = spitsToWire(world);
  // A burst dog's parts, and any lash still on screen. Sent unfiltered like the
  // helicopters and the acid: a body coming apart is not something fog hides.
  const airTentacles = tentaclesToWire(world);
  const airLashes = lashesToWire(world, now);
  const airHelis = helicoptersToWire(world, now);
  // Detonations linger only long enough for the ring to be drawn out.
  world.blasts = world.blasts.filter((b) => now - b.at < BLAST_MS);
  const airBlasts = world.blasts.map((b) => ({ x: b.x, y: b.y, age: now - b.at }));

  // Speech carries through fog: someone hammering on a door is heard whether
  // or not there's a line of sight to them.
  const speech: SpeechState[] = [];
  for (const [id, line] of world.speech) {
    if (now >= line.until) {
      world.speech.delete(id);
      continue;
    }
    const speaker = world.entities.get(id);
    if (!speaker) continue;
    speech.push({
      x: Math.round(speaker.x),
      y: Math.round(speaker.y),
      text: line.text,
      ...(line.radio ? { radio: true } : {}),
    });
  }

  // Once only a handful of humans are left, point the way to each of them.
  const humans = humanPositions(world);
  const beacons = humans.length > 0 && humans.length <= BEACON_THRESHOLD ? humans : [];
  mark('prep');

  for (const id of connections.keys()) {
    const viewer = world.entities.get(id);
    const spectating = world.spectators.has(id) || !viewer;

    send(id, {
      type: 'state',
      entities: spectating ? wholeBoard() : visibleTo(viewer, now),
      shots: spectating ? world.shots : visibleShots(viewer),
      brokenWindows: world.brokenWindows,
      // Doors are static geometry the client already has; only their state
      // travels, and only for the ones near enough to matter.
      doors: viewer
        ? doorsToWire(world, viewer.x, viewer.y, sightRadiusFor(viewer) + 220)
        : allDoorsToWire(world),
      doorPrompt: doorPromptFor(world, id),
      speech,
      rallyCharges: world.rallyCharges.get(id) ?? 0,
      followCharges: world.followCharges.get(id) ?? 0,
      following: world.followers.has(id),
      pickups: viewer ? visiblePickups(viewer) : Array.from(world.pickups.values()),
      inventory: toWireInventory(
        world,
        id,
        world.inventories.get(id) ?? newInventory(),
        viewer?.x ?? 0,
        viewer?.y ?? 0,
        now,
      ),
      dog: dogHudFor(world, id, now),
      grenades: airGrenades,
      smokes: airSmokes,
      // Unfogged like the smoke and the helicopters, and for the same reason:
      // a cloud is a hundred and thirty pixels of green in the middle of a
      // street, so a viewer who cannot see the ground it is on can see *it*.
      // It is also a handful of entries at the very most.
      acid: airAcid,
      spits: airSpits,
      tentacles: airTentacles,
      lashes: airLashes,
      blasts: airBlasts,
      ducks: ducksToWire(world),
      emplacements: emplacementsToWire(world),
    vehicles: vehiclesToWire(world),
    mines: minesToWire(world, now),
    // Unfogged, deliberately: a handful in a whole round, and a body you walked
    // past should not blink out because you turned round.
    corpses: world.corpses,
    towers: world.towers,
    zaps: world.zaps,
      fires: firesToWire(world, now),
      helicopters: airHelis,
      spectating,
      gameOver: world.gameOver,
      victory: world.victory,
      survivors,
      infected,
      zombies,
      stamina: Math.round(world.stamina.get(id) ?? STAMINA_MAX),
      exhausted: world.exhausted.has(id),
      tickMs: Math.round(rollingTickMs * 100) / 100,
      beacons,
    });
  }
  world.shots.length = 0;
  mark('serialise+send');

  const elapsed = performance.now() - started;
  rollingTickMs = rollingTickMs === 0 ? elapsed : rollingTickMs * 0.9 + elapsed * 0.1;
  tickTimeTotal += elapsed;
  tickSamples++;
  if (elapsed > worstTickMs) {
    worstTickMs = elapsed;
    worstPhases = phaseThisTick.slice();
  }
  if (now - lastPerfLog >= 5000) {
    const avg = tickTimeTotal / tickSamples;
    // Per tick, biggest first, so the line reads as "where the tick went".
    const split = Array.from(phaseTotals)
      .map(([label, total]) => [label, total / tickSamples] as const)
      .sort((a, b) => b[1] - a[1])
      .filter(([, ms]) => ms >= 0.05)
      .map(([label, ms]) => `${label} ${ms.toFixed(1)}`)
      .join(' · ');
    // The worst tick gets its own line, and only when it is genuinely out of
    // line with the average — a spike is a different fault from a slow mean.
    const worstSplit = worstPhases
      .filter(([, ms]) => ms >= 0.5)
      .sort((a, b) => b[1] - a[1])
      .map(([label, ms]) => `${label} ${ms.toFixed(1)}`)
      .join(' · ');
    const spike =
      worstTickMs > Math.max(TICK_MS, avg * 2)
        ? `\n       WORST ${worstTickMs.toFixed(1)}ms was: ${worstSplit || '(all phases small — GC or the event loop)'}`
        : '';

    console.log(
      `[perf] avg tick ${avg.toFixed(1)}ms / ${TICK_MS.toFixed(1)}ms budget ` +
        `(worst ${worstTickMs.toFixed(1)}) ` +
        `| ${world.entities.size} entities | ${connections.size} clients | ${survivors} survivors\n` +
        `       ${split}${spike}`,
    );
    tickTimeTotal = 0;
    tickSamples = 0;
    worstTickMs = 0;
    worstPhases = [];
    phaseTotals.clear();
    lastPerfLog = now;
  }
}

/**
 * One step of the world. The host decides *when*, but both hosts want the same
 * answer, so the policy lives here — see `startClock`.
 */
export { tick };

/**
 * A tick every `TICK_MS`, corrected for drift.
 *
 * `setInterval(tick, 33.3)` looks right and is not. The delay is rounded, a
 * tick that runs long pushes every tick after it back, and timers are coalesced
 * under load — so what comes out is not 30Hz, it is a *spread*. Measured in a
 * worker on a loaded laptop: median 33.6ms, but p10 **17.7** and p90 **50.2**,
 * with a tenth of all ticks more than 50ms apart and the worst at 160.
 *
 * That is felt directly, because the world only moves when a tick says so. A
 * frame rate of 60 draws an unevenly-moving world sixty times a second and the
 * result is a stutter the fps counter cannot see — which is exactly how it was
 * reported: "getting good frames but still feeling constant stuttering".
 *
 * Scheduling against an absolute clock fixes it: a tick that ran late is
 * followed by a shorter wait instead of shifting the whole sequence.
 */
export function startClock(): () => void {
  let next = performance.now() + TICK_MS;
  let stopped = false;

  const step = (): void => {
    if (stopped) return;
    tick();
    next += TICK_MS;
    const now = performance.now();
    /*
     * Too far behind to be worth catching up — a debugger pause, a long
     * collection, a laptop that went to sleep. Chasing it would fire a burst of
     * ticks back to back, which is a worse stutter than the gap it is trying to
     * repair, and at four ticks of debt it is beyond hiding anyway.
     */
    if (next < now - TICK_MS * 4) next = now + TICK_MS;
    setTimeout(step, Math.max(0, next - now));
  };

  setTimeout(step, TICK_MS);
  return () => {
    stopped = true;
  };
}
