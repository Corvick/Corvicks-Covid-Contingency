import { WebSocketServer, WebSocket } from 'ws';
import { randomUUID } from 'node:crypto';
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
} from './inventory.js';
import { ITEMS } from '../../shared/items.js';
import { grenadesToWire, helicoptersToWire, smokesToWire, updateAirSupport } from './heli.js';
import {
  TICK_RATE,
  PLAYER_SPEED,
  PLAYER_SIGHT_RADIUS,
  ENTITY_RADIUS,
  PATH_BUDGET_PER_TICK,
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
  BEACON_TOO_FAR_LINE,
  BEACON_CALL_RADIUS,
  BOOTS_SPEED_MUL,
  BOOTS_STAMINA_MUL,
  GUNSLING_SLOTS,
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
  speedAt,
  toWire,
  type Entity,
} from './world.js';
import { computeFrozen, followMe, holdPosition, rallyHumans, updateAi } from './ai.js';
import { processShooting, steerAim } from './combat.js';
import { allDoorsToWire, doorAt, doorsToWire } from './doors.js';
import { ducksToWire, updateDucks } from './ducks.js';
import {
  emplacementsToWire,
  resolveEmplacementCollisions,
  updateEmplacements,
} from './emplacement.js';
import { firesToWire, updateFires } from './fire.js';
import { resolveVanCollisions, updateSwatVans, vansToWire } from './swat.js';
import { minesToWire, updateMines } from './mines.js';
import { doorPromptFor, processPlayerDoors } from './doorplayer.js';
import {
  anyRunning,
  botCount,
  chat,
  clearNotice,
  createLobby,
  cycle,
  inALobby,
  joinLobby,
  leaveLobby,
  lobbyOf,
  say,
  seatedPlayers,
  setSpectating,
  sit,
  summaries,
  viewFor,
  type Lobby,
} from './lobby.js';

/** 8080 unless told otherwise, so a second server can be run alongside a game. */
const PORT = Number(process.env.PORT) || 8080;
const TICK_MS = 1000 / TICK_RATE;

const world = createWorld();
const sockets = new Map<string, WebSocket>();

console.log(`[server] city generated with seed ${world.map.seed}`);

const wss = new WebSocketServer({ port: PORT });

function send(socket: WebSocket, message: ServerMessage): void {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

function broadcast(message: ServerMessage): void {
  for (const socket of sockets.values()) send(socket, message);
}

/**
 * Put a connection into the world as an officer. Nobody gets one on connect
 * any more — you arrive at the front end, and only a lobby starting a round
 * puts you in a city. The first one in gets the designated start point so
 * testing needs no hike.
 */
function spawnPlayer(id: string): void {
  const isPlayerOne = world.playerIds.size === 0;
  const start = playerOneStart(world);
  const spawn = isPlayerOne
    ? findSpawnNear(world, start.x, start.y, ENTITY_RADIUS.officer)
    : findSpawn(world, ENTITY_RADIUS.officer);

  world.entities.set(id, makeEntity(id, 'officer', spawn.x, spawn.y));
  world.playerIds.add(id);
  world.commands.set(id, {
    input: { up: false, down: false, left: false, right: false },
    aim: 0,
    aimX: 0,
    aimY: 0,
    shooting: false,
    sprint: false,
    interact: false,
    rightDown: false,
  });
  world.inventories.set(id, newInventory());
  world.stamina.set(id, STAMINA_MAX);
  world.rallyCharges.set(id, RALLY_STARTING_CHARGES);
  world.followCharges.set(id, FOLLOW_STARTING_CHARGES);
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
}

/** Push the browse list to everyone still choosing where to go. */
function broadcastLobbies(): void {
  const list = summaries();
  for (const [connId, socket] of sockets) {
    if (!inALobby(connId)) send(socket, { type: 'lobbies', lobbies: list });
  }
}

/** Redraw a lobby for everyone in it. Each viewer sees their own 'self' flags. */
function pushLobby(lobby: Lobby): void {
  for (const connId of lobby.members.keys()) {
    const socket = sockets.get(connId);
    if (socket) send(socket, { type: 'lobby', lobby: viewFor(lobby, connId) });
  }
}

/** Tell everyone in a lobby it has gone, and drop them back to the browse list. */
function closeLobby(lobby: Lobby, reason: string): void {
  for (const connId of lobby.members.keys()) {
    const socket = sockets.get(connId);
    if (socket) send(socket, { type: 'lobbyLeft', reason });
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
  resetWorld(world);
  for (const connId of seated) spawnPlayer(connId);
  // resetWorld clears the watchers, so they go back in afterwards. A spectator
  // has no entity at all — they see the whole city instead of a fogged slice.
  for (const connId of lobby.spectators) world.spectators.add(connId);

  const dogs = lobby.dogs.filter((s) => s.state === 'player').length;
  console.log(
    `[server] "${lobby.name}" started — ${seated.length} players, ` +
      `${bots} bot officers, ${lobby.spectators.size} watching` +
      (dogs > 0 ? `, ${dogs} in dog slots (spawning as officers for now)` : ''),
  );

  // Chat gets told; a solo room doesn't need telling, since the game is about
  // to take the screen — and it would sit there as a stale notice.
  if (!lobby.offline) say(lobby, '', 'the round has begun');
  pushLobby(lobby);
  broadcastLobbies();
  for (const connId of lobby.members.keys()) {
    const socket = sockets.get(connId);
    if (!socket) continue;
    send(socket, { type: 'start' });
    send(socket, { type: 'map', map: world.map });
  }
}

wss.on('connection', (socket) => {
  const id = randomUUID();
  sockets.set(id, socket);

  send(socket, { type: 'welcome', selfId: id, map: world.map });
  send(socket, { type: 'lobbies', lobbies: summaries() });
  console.log(`[server] ${id} connected (${sockets.size} at the front end or playing)`);

  socket.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString()) as ClientMessage;
      if (msg.type === 'input') {
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
          // A mast exists somewhere, or the wheel would not have offered this,
          // but it is out of earshot. Say so — dropping the order silently is
          // indistinguishable from the command being broken, which is exactly
          // how it was reported.
          world.speech.set(id, { text: BEACON_TOO_FAR_LINE, until: now + RALLY_NO_CHARGE_MS });
        } else if ((world.rallyCharges.get(id) ?? 0) > 0) {
          world.rallyCharges.set(id, (world.rallyCharges.get(id) ?? 0) - 1);
          world.speech.set(id, { text: BEACON_SHOUT, until: now + BEACON_SHOUT_MS });
          const moved = rallyHumans(world, officer.x, officer.y, tower.x, tower.y);
          console.log(`[server] ${id} sent ${moved} civilians to the beacon`);
        } else {
          world.speech.set(id, { text: RALLY_NO_CHARGE_LINE, until: now + RALLY_NO_CHARGE_MS });
        }
      } else if (msg.type === 'spectate') {
        // Normally a fresh game to watch; `restart: false` drops into the one
        // already running, so a round can be observed as it actually plays out.
        const restart = msg.restart !== false;
        if (restart) resetWorld(world);
        world.spectators.add(id);
        world.entities.delete(id);
        world.playerIds.delete(id);
        console.log(
          `[server] ${id} is spectating${restart ? ' a fresh round' : ' the round in progress'}`,
        );
        if (restart) broadcast({ type: 'map', map: world.map });
        else send(socket, { type: 'map', map: world.map });
      } else if (msg.type === 'lobbyList') {
        send(socket, { type: 'lobbies', lobbies: summaries() });
      } else if (msg.type === 'lobbyCreate') {
        world.names.set(id, msg.gamertag);
        const lobby = createLobby(id, msg.name, msg.gamertag, msg.offline === true);
        console.log(
          `[server] ${msg.gamertag} created ${lobby.offline ? 'an offline' : 'lobby'}` +
            ` "${lobby.name}" (${lobby.id})`,
        );
        pushLobby(lobby);
        broadcastLobbies();
      } else if (msg.type === 'lobbyJoin') {
        world.names.set(id, msg.gamertag);
        const lobby = joinLobby(id, msg.id, msg.gamertag);
        if (!lobby) {
          // Someone clicked a lobby that closed while the list sat on screen.
          send(socket, { type: 'lobbyLeft', reason: 'that lobby is gone' });
          send(socket, { type: 'lobbies', lobbies: summaries() });
        } else {
          console.log(`[server] ${msg.gamertag} joined lobby "${lobby.name}"`);
          pushLobby(lobby);
          broadcastLobbies();
        }
      } else if (msg.type === 'lobbySit') {
        if (sit(id, msg.team, msg.index)) {
          const lobby = lobbyOf(id);
          if (lobby) {
            pushLobby(lobby);
            broadcastLobbies();
          }
        }
      } else if (msg.type === 'lobbySpectate') {
        if (setSpectating(id, msg.on)) {
          const lobby = lobbyOf(id);
          if (lobby) {
            pushLobby(lobby);
            broadcastLobbies();
          }
        }
      } else if (msg.type === 'lobbyCycle') {
        if (cycle(id, msg.team, msg.index)) {
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
          broadcastLobbies();
        }
        send(socket, { type: 'lobbies', lobbies: summaries() });
      } else if (msg.type === 'restart') {
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
    } catch {
      // ignore malformed messages
    }
  });

  socket.on('close', () => {
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
    world.ai.delete(id);
    world.grapples.delete(id);
    world.pendingInfections.delete(id);
    world.grappleCounts.delete(id);
    world.speedBoosts.delete(id);
    world.lastShotAt.delete(id);
    sockets.delete(id);
    console.log(`[server] player ${id} disconnected (${sockets.size} playing)`);
  });
});

function updatePlayers(dt: number, frozen: Set<string>, now: number): void {
  for (const id of world.playerIds) {
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
    const speed = speedAt(world, entity.x, entity.y, base);
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
  const inv = world.inventories.get(viewer.id);
  const held = inv ? heldItem(inv) : null;
  if (held && ITEMS[held]?.scope) return SNIPER_SIGHT_RADIUS;
  // Binoculars pull the camera back the way a scope does, so the server has to
  // send the ground you can now see or you would be looking at empty fog.
  if (held === 'binoculars') return BINOCULAR_SIGHT_RADIUS;
  return PLAYER_SIGHT_RADIUS;
}

/** The mast this officer would be pointing at: the nearest one in earshot. */
function nearestTower(officer: Entity | undefined): { x: number; y: number } | null {
  if (!officer) return null;
  let best: { x: number; y: number } | null = null;
  let bestDist = BEACON_CALL_RADIUS;
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
  const inv = world.inventories.get(viewer.id);
  const carriesCure = inv ? inv.utilities.includes('cureGun') : false;
  const reveal = viewer.type === 'zombie' || carriesCure;
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
    const seen = dist <= sight && hasLineOfSight(world, viewer.x, viewer.y, other.x, other.y);
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
    if (!hasLineOfSight(world, viewer.x, viewer.y, p.x, p.y)) continue;
    out.push(p);
  }
  return out;
}

function visibleShots(viewer: Entity): Shot[] {
  const sight = sightRadiusFor(viewer);
  return world.shots.filter(
    (shot) =>
      (Math.hypot(shot.x1 - viewer.x, shot.y1 - viewer.y) <= sight &&
        hasLineOfSight(world, viewer.x, viewer.y, shot.x1, shot.y1)) ||
      (Math.hypot(shot.x2 - viewer.x, shot.y2 - viewer.y) <= sight &&
        hasLineOfSight(world, viewer.x, viewer.y, shot.x2, shot.y2)),
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

function tick(): void {
  const started = performance.now();
  const dt = TICK_MS / 1000;
  const now = Date.now();

  world.pathBudget = PATH_BUDGET_PER_TICK;

  // Paused: nothing in the world advances, but snapshots keep going out so the
  // frozen scene stays on screen behind the panel. Only ever set by a solo
  // round — pausing one with other people in it would stop their game too.
  if (!world.paused) {
    // Glass smashed last tick opened a new way through — take it in once here,
    // rather than once per pane.
    if (world.navDirty) rebuildNav(world);

    rebuildEntityGrid(world);
    const frozen = computeFrozen(world);

    updatePlayers(dt, frozen, now);
    updateAi(world, now, dt, frozen);
    resolveCollisions(world);
    // Sandbags are deliberately not in the nav grid — like doors, routes are
    // planned as though they weren't there and whoever walks into one deals
    // with it. So the push-out happens here, once everyone has moved.
    resolveEmplacementCollisions(world);
    // A parked squad car is solid to bodies, like the sandbags, and pushed out
    // of here rather than through the nav grid for the same reason.
    resolveVanCollisions(world);

    rebuildEntityGrid(world);
    updateEmplacements(world, now, dt);
    processInteractions(now);
    processShooting(world, now, frozen);
    updateAirSupport(world, now, dt);
    updateSwatVans(world, now, dt);
    updateMines(world, now);
    updateDucks(world, now, dt);
    updateFires(world, now, dt);
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

  // Spectators see the whole board, infection markers included.
  const allEntities: EntityState[] = [];
  for (const e of world.entities.values()) allEntities.push(toWire(world, e, true, now));
  const infected = world.pendingInfections.size;

  // Air support is small enough to send to everyone unfiltered — a helicopter
  // overhead is not something fog should hide.
  const airGrenades = grenadesToWire(world, now);
  const airSmokes = smokesToWire(world, now);
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

  for (const [id, socket] of sockets) {
    const viewer = world.entities.get(id);
    const spectating = world.spectators.has(id) || !viewer;

    send(socket, {
      type: 'state',
      entities: spectating ? allEntities : visibleTo(viewer, now),
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
      grenades: airGrenades,
      smokes: airSmokes,
      blasts: airBlasts,
      ducks: ducksToWire(world),
      emplacements: emplacementsToWire(world),
    vans: vansToWire(world),
    mines: minesToWire(world, now),
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

  const elapsed = performance.now() - started;
  rollingTickMs = rollingTickMs === 0 ? elapsed : rollingTickMs * 0.9 + elapsed * 0.1;
  tickTimeTotal += elapsed;
  tickSamples++;
  if (now - lastPerfLog >= 5000) {
    const avg = tickTimeTotal / tickSamples;
    console.log(
      `[perf] avg tick ${avg.toFixed(1)}ms / ${TICK_MS.toFixed(1)}ms budget ` +
        `| ${world.entities.size} entities | ${sockets.size} clients | ${survivors} survivors`,
    );
    tickTimeTotal = 0;
    tickSamples = 0;
    lastPerfLog = now;
  }
}

setInterval(tick, TICK_MS);

console.log(`[server] listening on ws://localhost:${PORT}`);
