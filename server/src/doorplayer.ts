import type { DoorPrompt } from '../../shared/types.js';
import {
  DOOR_KICK_MS,
  DOOR_PLAYER_CLOSE_MS,
  DOOR_PLAYER_LOCK_MS,
  DOOR_PLAYER_OPEN_MS,
  DOOR_PLAYER_UNLOCK_MS,
  TAP_MAX_MS,
} from '../../shared/constants.js';
import {
  damageDoor,
  doorAt,
  insideOfDoor,
  lockDoor,
  openDoor,
  shutDoor,
  unlockDoor,
} from './doors.js';
import type { DoorAction, Entity, World } from './world.js';

function durationOf(action: DoorAction): number {
  switch (action) {
    case 'open':
      return DOOR_PLAYER_OPEN_MS;
    case 'close':
      return DOOR_PLAYER_CLOSE_MS;
    case 'lock':
      return DOOR_PLAYER_LOCK_MS;
    case 'unlock':
      return DOOR_PLAYER_UNLOCK_MS;
    case 'kick':
      return DOOR_KICK_MS;
  }
}

function labelFor(action: DoorAction): string {
  switch (action) {
    case 'open':
      return 'Opening…';
    case 'close':
      return 'Closing…';
    case 'lock':
      return 'Locking…';
    case 'unlock':
      return 'Unlocking…';
    case 'kick':
      return 'Kicking it in…';
  }
}

/**
 * What a tap does and what a sustained hold does, given the state of the door
 * and which side of it you're stood on.
 */
function optionsFor(
  world: World,
  index: number,
  x: number,
  y: number,
): { tap: DoorAction | null; hold: DoorAction | null; label: string } {
  const door = world.doors[index];
  if (!door || door.broken) return { tap: null, hold: null, label: '' };

  const inside = insideOfDoor(world, index, x, y);

  if (door.open) return { tap: 'close', hold: null, label: 'Press E to close' };

  if (door.locked) {
    return inside
      ? { tap: null, hold: 'unlock', label: 'Hold E to unlock' }
      : { tap: null, hold: 'kick', label: 'Hold E to kick down' };
  }

  return inside
    ? { tap: 'open', hold: 'lock', label: 'Press E to open · Hold E to lock' }
    : { tap: 'open', hold: null, label: 'Press E to open' };
}

function applyAction(world: World, id: string, index: number, action: DoorAction, now: number): void {
  switch (action) {
    case 'open':
      openDoor(world, index);
      break;
    case 'close':
      shutDoor(world, index, now);
      break;
    case 'lock': {
      lockDoor(world, index);
      // A door an officer bolted stays bolted: no civilian talks themselves
      // into opening it and letting the street in behind them.
      const door = world.doors[index];
      if (door) door.playerLocked = true;
      break;
    }
    case 'unlock': {
      unlockDoor(world, index);
      const door = world.doors[index];
      if (door) door.playerLocked = false;
      break;
    }
    case 'kick':
      // Straight off its hinges, whatever was left in it.
      damageDoor(world, index, Number.MAX_SAFE_INTEGER);
      console.log(`[server] ${id} kicked down door ${index}`);
      break;
  }
}

/**
 * A player's press or hold of E at a door. Returns true when a door took the
 * input, so the same key isn't also read as a pickup or a drop.
 *
 * One key covers both actions the way the inventory already does it: the press
 * arms the *hold* action and shows its ring filling, and letting go inside
 * `TAP_MAX_MS` performs the tap action instead. That is what makes "press to
 * open, hold to lock" work on a single key without the open firing first.
 */
export function processPlayerDoors(
  world: World,
  entity: Entity,
  id: string,
  held: boolean,
  now: number,
): boolean {
  const active = world.doorHolds.get(id);

  // Finishing an action latches the key until it's let go. Without this,
  // still holding E after the bolt goes across immediately starts drawing it
  // back again, and the door flaps between locked and unlocked.
  if (!held) world.doorSpent.delete(id);
  else if (world.doorSpent.has(id)) {
    if (active) {
      releaseDoor(world, active.index, id);
      world.doorHolds.delete(id);
    }
    const idle = doorAt(world, entity.x, entity.y);
    if (idle < 0) return false;
    world.doorPrompts.set(id, { text: optionsFor(world, idle, entity.x, entity.y).label, progress: -1 });
    return true;
  }

  if (active) {
    const options = optionsFor(world, active.index, entity.x, entity.y);
    const stillOffered = options.tap === active.action || options.hold === active.action;
    const elapsed = now - active.startedAt;

    // Let go, or walked away, or somebody else changed the door.
    if (!held || !stillOffered) {
      releaseDoor(world, active.index, id);
      world.doorHolds.delete(id);
      if (held || !stillOffered) return true;
      if (elapsed <= TAP_MAX_MS && options.tap) applyAction(world, id, active.index, options.tap, now);
      return true;
    }

    if (elapsed >= durationOf(active.action)) {
      releaseDoor(world, active.index, id);
      world.doorHolds.delete(id);
      applyAction(world, id, active.index, active.action, now);
      world.doorSpent.add(id);
      return true;
    }

    // Below the tap threshold this could still turn out to be a tap, so keep
    // showing what the key does rather than what it is part-way through doing.
    world.doorPrompts.set(
      id,
      elapsed <= TAP_MAX_MS
        ? { text: options.label, progress: -1 }
        : { text: labelFor(active.action), progress: elapsed / durationOf(active.action) },
    );
    return true;
  }

  const index = doorAt(world, entity.x, entity.y);
  if (index < 0) return false;

  const options = optionsFor(world, index, entity.x, entity.y);
  if (!options.tap && !options.hold) return false;

  world.doorPrompts.set(id, { text: options.label, progress: -1 });
  if (!held) return true;

  const action = options.hold ?? options.tap;
  if (action) {
    world.doorHolds.set(id, { index, startedAt: now, action });
    // Claim it, so no civilian works the same handle mid-action.
    const door = world.doors[index];
    if (door) door.busyBy = id;
  }
  return true;
}

/** Give up a claim on a door, if we still hold it. */
function releaseDoor(world: World, index: number, id: string): void {
  const door = world.doors[index];
  if (door && door.busyBy === id) door.busyBy = null;
}

export function doorPromptFor(world: World, id: string): DoorPrompt | null {
  return world.doorPrompts.get(id) ?? null;
}
