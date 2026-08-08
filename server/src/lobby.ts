import { randomUUID } from 'node:crypto';
import type {
  ChatLine,
  LobbySummary,
  LobbyTeam,
  LobbyView,
  SlotState,
  SlotWire,
} from '../../shared/types.js';
import { LOBBY_DOG_SLOTS, LOBBY_HUMAN_SLOTS } from '../../shared/constants.js';

/**
 * Lobbies: the rooms people wait in before a round. They are deliberately
 * separate from the world — nobody has an entity until their lobby starts, so
 * sitting at the front end can't put an idle officer into a city.
 *
 * There is still only one world, so only one lobby's round can be running at a
 * time; `start` refuses while another is under way rather than resetting the
 * map out from under it. Per-lobby worlds are the obvious next step, and this
 * is the seam they'd go through.
 */

/** A seat: shut, waiting, a bot, or a specific connection sitting in it. */
type Seat = { state: Exclude<SlotState, 'player'> } | { state: 'player'; id: string };

export interface Lobby {
  id: string;
  name: string;
  hostId: string;
  humans: Seat[];
  dogs: Seat[];
  chat: ChatLine[];
  /** Everyone connected to this lobby, seated or not, by connection id. */
  members: Map<string, string>;
  /** True once its round has been started. */
  running: boolean;
}

/** Chat kept short — it's a waiting room, not a log. */
const CHAT_HISTORY = 60;
const CHAT_MAX_LEN = 200;
const NAME_MAX_LEN = 32;

const lobbies = new Map<string, Lobby>();
/** Which lobby each connection is in, so leaving needs no search. */
const memberOf = new Map<string, string>();

const emptySeats = (n: number): Seat[] => Array.from({ length: n }, () => ({ state: 'closed' }));

function tidy(text: string, max: number): string {
  // Control characters would let a name draw over the rest of the row.
  return text.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
}

export function lobbyOf(connId: string): Lobby | undefined {
  const id = memberOf.get(connId);
  return id ? lobbies.get(id) : undefined;
}

export function anyRunning(): boolean {
  for (const lobby of lobbies.values()) if (lobby.running) return true;
  return false;
}

export function createLobby(connId: string, rawName: string, gamertag: string): Lobby {
  leaveLobby(connId);
  const tag = tidy(gamertag, NAME_MAX_LEN) || 'PLAYER';
  const lobby: Lobby = {
    id: randomUUID().slice(0, 8),
    name: tidy(rawName, NAME_MAX_LEN) || `${tag}'s lobby`,
    hostId: connId,
    humans: emptySeats(LOBBY_HUMAN_SLOTS),
    dogs: emptySeats(LOBBY_DOG_SLOTS),
    chat: [],
    members: new Map([[connId, tag]]),
    running: false,
  };
  // The host takes the first officer seat rather than standing about in a
  // lobby they own — one fewer click to get to a startable state.
  lobby.humans[0] = { state: 'player', id: connId };
  lobbies.set(lobby.id, lobby);
  memberOf.set(connId, lobby.id);
  say(lobby, '', `${tag} created the lobby`);
  return lobby;
}

export function joinLobby(connId: string, lobbyId: string, gamertag: string): Lobby | null {
  const lobby = lobbies.get(lobbyId);
  if (!lobby) return null;
  leaveLobby(connId);
  const tag = tidy(gamertag, NAME_MAX_LEN) || 'PLAYER';
  lobby.members.set(connId, tag);
  memberOf.set(connId, lobby.id);
  // Drop them into the first free officer seat if there is one, so joining is
  // one click. Failing that they're in the room but not yet playing.
  const free = lobby.humans.findIndex((s) => s.state === 'open');
  if (free >= 0) lobby.humans[free] = { state: 'player', id: connId };
  say(lobby, '', `${tag} joined`);
  return lobby;
}

/**
 * Stand up and go. Returns the lobby they left, if any — the caller still has
 * to tell the people who remain. A host leaving takes the lobby with them.
 */
export function leaveLobby(connId: string): { lobby: Lobby; closed: boolean } | null {
  const lobby = lobbyOf(connId);
  if (!lobby) return null;
  const tag = lobby.members.get(connId) ?? 'someone';
  memberOf.delete(connId);
  lobby.members.delete(connId);
  vacate(lobby, connId);

  if (lobby.hostId === connId || lobby.members.size === 0) {
    lobbies.delete(lobby.id);
    for (const other of lobby.members.keys()) memberOf.delete(other);
    return { lobby, closed: true };
  }
  say(lobby, '', `${tag} left`);
  return { lobby, closed: false };
}

/** Empty whatever seat this connection was in, on either team. */
function vacate(lobby: Lobby, connId: string): void {
  for (const team of [lobby.humans, lobby.dogs]) {
    for (let i = 0; i < team.length; i++) {
      const seat = team[i];
      if (seat.state === 'player' && seat.id === connId) team[i] = { state: 'open' };
    }
  }
}

/** Take a seat. Closed seats aren't yours to take; anything else is. */
export function sit(connId: string, team: LobbyTeam, index: number): boolean {
  const lobby = lobbyOf(connId);
  if (!lobby) return false;
  const seats = team === 'humans' ? lobby.humans : lobby.dogs;
  const seat = seats[index];
  if (!seat || seat.state === 'closed') return false;
  if (seat.state === 'player') return false; // already someone's, yours included
  vacate(lobby, connId);
  seats[index] = { state: 'player', id: connId };
  return true;
}

const CYCLE: Array<Exclude<SlotState, 'player'>> = ['closed', 'open', 'bot'];

/** Host only: walk a seat through closed → open → bot. */
export function cycle(connId: string, team: LobbyTeam, index: number): boolean {
  const lobby = lobbyOf(connId);
  if (!lobby || lobby.hostId !== connId) return false;
  const seats = team === 'humans' ? lobby.humans : lobby.dogs;
  const seat = seats[index];
  if (!seat) return false;
  // Someone is sitting there. Cycling them out from under themselves is the
  // host booting them, which is a decision for later, not an accident now.
  if (seat.state === 'player') return false;
  seats[index] = { state: CYCLE[(CYCLE.indexOf(seat.state) + 1) % CYCLE.length] };
  return true;
}

export function say(lobby: Lobby, from: string, text: string): void {
  lobby.chat.push({ from, text: tidy(text, CHAT_MAX_LEN) });
  if (lobby.chat.length > CHAT_HISTORY) lobby.chat.splice(0, lobby.chat.length - CHAT_HISTORY);
}

export function chat(connId: string, text: string): Lobby | null {
  const lobby = lobbyOf(connId);
  const clean = tidy(text, CHAT_MAX_LEN);
  if (!lobby || !clean) return null;
  say(lobby, lobby.members.get(connId) ?? 'someone', clean);
  return lobby;
}

/** Ids of everyone sitting in a seat — these are the people who get an entity. */
export function seatedPlayers(lobby: Lobby): string[] {
  const ids: string[] = [];
  for (const seat of [...lobby.humans, ...lobby.dogs]) {
    if (seat.state === 'player') ids.push(seat.id);
  }
  return ids;
}

export function botCount(lobby: Lobby): number {
  return lobby.humans.filter((s) => s.state === 'bot').length;
}

function seatWire(lobby: Lobby, seat: Seat, viewer: string): SlotWire {
  if (seat.state !== 'player') return { state: seat.state };
  return {
    state: 'player',
    name: lobby.members.get(seat.id) ?? '???',
    ...(seat.id === viewer ? { self: true } : {}),
  };
}

export function viewFor(lobby: Lobby, viewer: string): LobbyView {
  return {
    id: lobby.id,
    name: lobby.name,
    isHost: lobby.hostId === viewer,
    humans: lobby.humans.map((s) => seatWire(lobby, s, viewer)),
    dogs: lobby.dogs.map((s) => seatWire(lobby, s, viewer)),
    chat: lobby.chat,
  };
}

export function summaries(): LobbySummary[] {
  return [...lobbies.values()].map((lobby) => ({
    id: lobby.id,
    name: lobby.name,
    host: lobby.members.get(lobby.hostId) ?? '???',
    players: seatedPlayers(lobby).length,
    capacity: lobby.humans.length + lobby.dogs.length,
    running: lobby.running,
  }));
}

/** Every connection currently in any lobby — used to know who *isn't*. */
export function inALobby(connId: string): boolean {
  return memberOf.has(connId);
}
