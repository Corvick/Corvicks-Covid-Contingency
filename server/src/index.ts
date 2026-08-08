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
import { collect, dropHeld, nearestPickup, newInventory, toWireInventory } from './inventory.js';
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
import { processShooting } from './combat.js';
import { allDoorsToWire, doorAt, doorsToWire } from './doors.js';
import { doorPromptFor, processPlayerDoors } from './doorplayer.js';

const PORT = 8080;
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

wss.on('connection', (socket) => {
  const id = randomUUID();

  // Player one drops on the designated start point so testing needs no hike.
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
    shooting: false,
    sprint: false,
    interact: false,
  });
  world.inventories.set(id, newInventory());
  world.stamina.set(id, STAMINA_MAX);
  world.rallyCharges.set(id, RALLY_STARTING_CHARGES);
  world.followCharges.set(id, FOLLOW_STARTING_CHARGES);
  sockets.set(id, socket);

  send(socket, { type: 'welcome', selfId: id, map: world.map });
  console.log(`[server] player ${id} connected (${sockets.size} playing)`);

  socket.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString()) as ClientMessage;
      if (msg.type === 'input') {
        world.commands.set(id, {
          input: msg.input,
          aim: msg.aim,
          shooting: msg.shooting,
          sprint: msg.sprint,
          interact: msg.interact,
        });
      } else if (msg.type === 'selectSlot') {
        const inv = world.inventories.get(id);
        if (inv && msg.slot >= 0 && msg.slot <= GUN_SLOTS + UTILITY_SLOTS) {
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

function updatePlayers(dt: number, frozen: Set<string>): void {
  for (const id of world.playerIds) {
    const entity = world.entities.get(id);
    const command = world.commands.get(id);
    if (!entity || !command) continue;

    // Officers point where the mouse points; anything else faces where it walks.
    if (entity.type === 'officer') entity.facing = command.aim;

    let dx = 0;
    let dy = 0;
    if (!frozen.has(id)) {
      if (command.input.up) dy -= 1;
      if (command.input.down) dy += 1;
      if (command.input.left) dx -= 1;
      if (command.input.right) dx += 1;
    }
    const moving = dx !== 0 || dy !== 0;

    // Stamina drains only while actually sprinting, and refills otherwise.
    // Running it dry latches an exhausted state that only clears once the bar
    // has climbed back past STAMINA_RECOVERY_THRESHOLD.
    let stamina = world.stamina.get(id) ?? STAMINA_MAX;
    const locked = world.exhausted.has(id);
    const wantsSprint = command.sprint && moving && !locked && stamina > STAMINA_SPRINT_FLOOR;

    if (wantsSprint) {
      stamina = Math.max(0, stamina - STAMINA_DRAIN_PER_SEC * dt);
      if (stamina <= STAMINA_SPRINT_FLOOR) world.exhausted.add(id);
    } else {
      stamina = Math.min(STAMINA_MAX, stamina + STAMINA_REGEN_PER_SEC * dt);
      if (locked && stamina >= STAMINA_RECOVERY_THRESHOLD) world.exhausted.delete(id);
    }
    world.stamina.set(id, stamina);

    if (!moving) continue;

    const len = Math.hypot(dx, dy);
    const base = PLAYER_SPEED * (wantsSprint ? SPRINT_MULTIPLIER : 1);
    const speed = speedAt(world, entity.x, entity.y, base);
    entity.x += (dx / len) * speed * dt;
    entity.y += (dy / len) * speed * dt;
    if (entity.type !== 'officer') entity.facing = Math.atan2(dy, dx);
  }
}

/** Fog of war is enforced server-side: unseen entities are never sent. */
function visibleTo(viewer: Entity, now: number): EntityState[] {
  const out: EntityState[] = [];
  const viewerIsZombie = viewer.type === 'zombie';
  for (const other of world.entities.values()) {
    if (other.id === viewer.id) {
      out.push(toWire(world, other, viewerIsZombie, now));
      continue;
    }
    if (Math.hypot(other.x - viewer.x, other.y - viewer.y) > PLAYER_SIGHT_RADIUS) continue;
    if (!hasLineOfSight(world, viewer.x, viewer.y, other.x, other.y)) continue;
    out.push(toWire(world, other, viewerIsZombie, now));
  }
  return out;
}

/** Loot is subject to the same fog rules as everything else. */
function visiblePickups(viewer: Entity): PickupState[] {
  const out: PickupState[] = [];
  for (const p of world.pickups.values()) {
    if (Math.hypot(p.x - viewer.x, p.y - viewer.y) > PLAYER_SIGHT_RADIUS) continue;
    if (!hasLineOfSight(world, viewer.x, viewer.y, p.x, p.y)) continue;
    out.push(p);
  }
  return out;
}

function visibleShots(viewer: Entity): Shot[] {
  return world.shots.filter(
    (shot) =>
      (Math.hypot(shot.x1 - viewer.x, shot.y1 - viewer.y) <= PLAYER_SIGHT_RADIUS &&
        hasLineOfSight(world, viewer.x, viewer.y, shot.x1, shot.y1)) ||
      (Math.hypot(shot.x2 - viewer.x, shot.y2 - viewer.y) <= PLAYER_SIGHT_RADIUS &&
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

  // Glass smashed last tick opened a new way through — take it in once here,
  // rather than once per pane.
  if (world.navDirty) rebuildNav(world);

  rebuildEntityGrid(world);
  const frozen = computeFrozen(world);

  updatePlayers(dt, frozen);
  updateAi(world, now, dt, frozen);
  resolveCollisions(world);

  rebuildEntityGrid(world);
  processInteractions(now);
  processShooting(world, now, frozen);
  updateAirSupport(world, now, dt);

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
    speech.push({ x: Math.round(speaker.x), y: Math.round(speaker.y), text: line.text });
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
        ? doorsToWire(world, viewer.x, viewer.y, PLAYER_SIGHT_RADIUS + 220)
        : allDoorsToWire(world),
      doorPrompt: doorPromptFor(world, id),
      speech,
      rallyCharges: world.rallyCharges.get(id) ?? 0,
      followCharges: world.followCharges.get(id) ?? 0,
      following: world.followers.has(id),
      pickups: viewer ? visiblePickups(viewer) : Array.from(world.pickups.values()),
      inventory: toWireInventory(
        world,
        world.inventories.get(id) ?? newInventory(),
        viewer?.x ?? 0,
        viewer?.y ?? 0,
        now,
      ),
      grenades: airGrenades,
      smokes: airSmokes,
      blasts: airBlasts,
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
