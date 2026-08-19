import { randomInt } from 'node:crypto';
import type {
  ChatLine,
  LobbyTeam,
  LobbyView,
  SlotState,
  SlotWire,
} from '../../shared/types.js';
import {
  CITY_POP_MAX,
  LOBBY_CODE_ALPHABET,
  LOBBY_CODE_LENGTH,
  LOBBY_DOG_SLOTS,
  LOBBY_HUMAN_SLOTS,
  clampCityPopulation,
} from '../../shared/constants.js';

/**
 * Lobbies: the rooms people wait in before a round. They are deliberately
 * separate from the world — nobody has an entity until their lobby starts, so
 * sitting at the front end can't put an idle officer into a city.
 *
 * There is still only one world, so only one lobby's round can be running at a
 * time; `start` refuses while another is under way rather than resetting the
 * map out from under it. Per-lobby worlds are the obvious next step, and this
 * is the seam they'd go through.
 *
 * **A four-letter code is the only way into one.** There is no browse list and
 * nothing enumerates the live lobbies, so the code is not a convenience on top
 * of an open door — it is the door. That is what makes it worth generating with
 * `randomInt` and worth refusing an offline room by, and it is why `summaries`
 * and the `lobbies` message were removed outright rather than left unused: a
 * listing endpoint that still worked would hand out every code on the server
 * and quietly make the whole thing decorative.
 */

/** A seat: shut, waiting, a bot, or a specific connection sitting in it. */
type Seat = { state: Exclude<SlotState, 'player'> } | { state: 'player'; id: string };

export interface Lobby {
  /**
   * The four letters, and the lobby's only public identity. It is the map key
   * as well, because there is nothing else to look a lobby up by — with no
   * browse list, a second internal id would be a handle nobody could ever hold.
   */
  code: string;
  name: string;
  hostId: string;
  humans: Seat[];
  dogs: Seat[];
  chat: ChatLine[];
  /** Everyone connected to this lobby, seated or not, by connection id. */
  members: Map<string, string>;
  /** Watching rather than playing. A spectator holds no seat. */
  spectators: Set<string>;
  /**
   * Solo: never listed, no chat, and its slots offer only closed or bot. It is
   * an ordinary lobby in every other respect, which is why offline play needed
   * almost no code of its own.
   */
  offline: boolean;
  /** Latest thing the room needs to tell you, when there is no chat to say it in. */
  notice: string;
  /** True once its round has been started. */
  running: boolean;
  /**
   * How many civilians the round is built for, and — through
   * `setCityPopulation` — how big a city they get. The host's only setting.
   *
   * It lives on the lobby rather than in the world because the world it sizes
   * does not exist yet: `startLobby` reads it and sets the globals immediately
   * before `resetWorld` generates the map. Everyone in the room sees it, since
   * "how big is this going to be" is a thing you want to know before you sit
   * down in a seat.
   */
  population: number;
}

/** Chat kept short — it's a waiting room, not a log. */
const CHAT_HISTORY = 60;
const CHAT_MAX_LEN = 200;
const NAME_MAX_LEN = 32;

/** Keyed by code. Which is the whole point: a code *is* how you find one. */
const lobbies = new Map<string, Lobby>();
/** Which lobby each connection is in, so leaving needs no search. */
const memberOf = new Map<string, string>();

/**
 * Draw a code nobody is using. `randomInt` rather than `Math.random` scaled by
 * hand: it rejects into an unbiased range for us, and a code guessed is a
 * stranger in your game, so this is not the place to be casually uniform.
 *
 * The retry is bounded and then lengthens the code rather than looping forever.
 * At 160,000 codes against a handful live that will never fire — but an
 * unbounded search of a space that *could* be full is a hung server, and the
 * honest failure here is an ugly five-letter code, not a refusal to create.
 */
function newCode(): string {
  for (let tries = 0; tries < 200; tries++) {
    let code = '';
    for (let i = 0; i < LOBBY_CODE_LENGTH; i++) {
      code += LOBBY_CODE_ALPHABET[randomInt(LOBBY_CODE_ALPHABET.length)];
    }
    if (!lobbies.has(code)) return code;
  }
  let code = '';
  while (lobbies.has(code) || !code) {
    code += LOBBY_CODE_ALPHABET[randomInt(LOBBY_CODE_ALPHABET.length)];
  }
  return code;
}

/**
 * What somebody typed, turned into what a code is — uppercased, with anything
 * that isn't a letter thrown away so a pasted ` ABCD`, `abcd`, `A-B-C-D` or a
 * code with a stray quote round it all arrive as the same four letters.
 *
 * Deliberately keeps letters that aren't in the alphabet rather than dropping
 * them: dropping one shifts everything after it along and turns a single typo
 * into a different valid-looking code, which then fails with a message about
 * the wrong lobby. Kept, it simply matches nothing, which is the truth.
 */
export function normaliseCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z]/g, '');
}

/**
 * The seats a new lobby opens with.
 *
 * Online they start **open**, which is the same resting state `vacate` already
 * puts a seat back to when somebody stands up — `emptySeats` predated that
 * distinction and disagreed with it. It matters much more now the code is the
 * only way in: a code is an invitation to a particular person, and having them
 * arrive in a room where every seat is shut, unable to sit until the host
 * notices and opens one, is a poor way to be let in somewhere.
 *
 * Offline still starts shut, because there is nobody it could be open to.
 */
const emptySeats = (n: number, offline: boolean): Seat[] =>
  Array.from({ length: n }, () => ({ state: offline ? 'closed' : 'open' }));

function tidy(text: string, max: number): string {
  // Control characters would let a name draw over the rest of the row.
  return text.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
}

export function lobbyOf(connId: string): Lobby | undefined {
  const code = memberOf.get(connId);
  return code ? lobbies.get(code) : undefined;
}

export function anyRunning(): boolean {
  for (const lobby of lobbies.values()) if (lobby.running) return true;
  return false;
}

export function createLobby(
  connId: string,
  rawName: string,
  gamertag: string,
  offline = false,
): Lobby {
  leaveLobby(connId);
  const tag = tidy(gamertag, NAME_MAX_LEN) || 'PLAYER';
  const lobby: Lobby = {
    code: newCode(),
    name: tidy(rawName, NAME_MAX_LEN) || `${tag}'s lobby`,
    hostId: connId,
    humans: emptySeats(LOBBY_HUMAN_SLOTS, offline),
    dogs: emptySeats(LOBBY_DOG_SLOTS, offline),
    chat: [],
    members: new Map([[connId, tag]]),
    spectators: new Set(),
    offline,
    notice: '',
    running: false,
    // A new room is a full city until the host says otherwise. The setting is
    // for the machine that cannot manage one, and it should be the choice
    // somebody makes rather than the one they inherit.
    population: CITY_POP_MAX,
  };
  // The host takes the first officer seat rather than standing about in a
  // lobby they own — one fewer click to get to a startable state.
  lobby.humans[0] = { state: 'player', id: connId };
  lobbies.set(lobby.code, lobby);
  memberOf.set(connId, lobby.code);
  if (!offline) say(lobby, '', `${tag} created the lobby`);
  return lobby;
}

/**
 * The result of trying a code. A refusal carries its own reason because the
 * reasons are genuinely different to the person typing — a code that is four
 * letters and wrong is a typo or a lobby that has closed, and a code that isn't
 * four letters is a half-finished paste. Answering both with "no" would have
 * them retyping a code that was never going to work.
 */
export type JoinResult = { ok: true; lobby: Lobby } | { ok: false; reason: string };

export function joinLobby(connId: string, rawCode: string, gamertag: string): JoinResult {
  const code = normaliseCode(rawCode);
  if (code.length < LOBBY_CODE_LENGTH) {
    return { ok: false, reason: `a code is ${LOBBY_CODE_LENGTH} letters` };
  }
  const lobby = lobbies.get(code);
  if (!lobby) return { ok: false, reason: `no lobby with the code ${code}` };
  // Solo rooms are never listed and are not joinable; without this a guessed
  // code could drop a stranger into somebody's offline game, which is the one
  // thing "offline" is supposed to promise.
  if (lobby.offline) return { ok: false, reason: `no lobby with the code ${code}` };
  leaveLobby(connId);
  const tag = tidy(gamertag, NAME_MAX_LEN) || 'PLAYER';
  lobby.members.set(connId, tag);
  memberOf.set(connId, lobby.code);
  // Drop them into the first free officer seat if there is one, so joining is
  // one click. Failing that they're in the room but not yet playing.
  const free = lobby.humans.findIndex((s) => s.state === 'open');
  if (free >= 0) lobby.humans[free] = { state: 'player', id: connId };
  say(lobby, '', `${tag} joined`);
  return { ok: true, lobby };
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
  lobby.spectators.delete(connId);
  vacate(lobby, connId);

  if (lobby.hostId === connId || lobby.members.size === 0) {
    lobbies.delete(lobby.code);
    for (const other of lobby.members.keys()) memberOf.delete(other);
    return { lobby, closed: true };
  }
  say(lobby, '', `${tag} left`);
  return { lobby, closed: false };
}

/**
 * Empty whatever seat this connection was in, on either team. Offline leaves it
 * shut rather than open — there is nobody else it could be open to.
 */
function vacate(lobby: Lobby, connId: string): void {
  const empty: SlotState = lobby.offline ? 'closed' : 'open';
  for (const team of [lobby.humans, lobby.dogs]) {
    for (let i = 0; i < team.length; i++) {
      const seat = team[i];
      if (seat.state === 'player' && seat.id === connId) team[i] = { state: empty };
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
  lobby.spectators.delete(connId); // sitting down is the opposite of watching
  seats[index] = { state: 'player', id: connId };
  return true;
}

/**
 * Sit out and watch, or come back. Going to the bench frees your seat; coming
 * back takes the first one going, so you are never left with nowhere to sit.
 */
export function setSpectating(connId: string, on: boolean): boolean {
  const lobby = lobbyOf(connId);
  if (!lobby) return false;

  if (on) {
    if (lobby.spectators.has(connId)) return false;
    vacate(lobby, connId);
    lobby.spectators.add(connId);
    return true;
  }

  if (!lobby.spectators.has(connId)) return false;
  lobby.spectators.delete(connId);
  // Prefer a seat nobody wanted, then a shut one, then displace a bot — in
  // that order there is always somewhere to land.
  for (const want of ['open', 'closed', 'bot'] as SlotState[]) {
    const at = lobby.humans.findIndex((s) => s.state === want);
    if (at >= 0) {
      lobby.humans[at] = { state: 'player', id: connId };
      return true;
    }
  }
  return true;
}

const CYCLE: Array<Exclude<SlotState, 'player'>> = ['closed', 'open', 'bot'];
/** Offline has nobody to hold a seat open for, so it skips that rung. */
const CYCLE_OFFLINE: Array<Exclude<SlotState, 'player'>> = ['closed', 'bot'];

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
  const order = lobby.offline ? CYCLE_OFFLINE : CYCLE;
  // An index of -1 (a seat vacated into a state this order doesn't contain)
  // lands on the first rung, which is what you'd want anyway.
  seats[index] = { state: order[(order.indexOf(seat.state) + 1) % order.length] };
  return true;
}

/**
 * Host only: how many civilians the next round gets.
 *
 * Refused while a round is up, because the city it would size has already been
 * generated — the nav grid, the room map and every broadphase grid are all
 * built to it. Restart is what applies a changed setting, and `startLobby` is
 * the one place that reads this.
 */
export function setPopulation(connId: string, pop: number): boolean {
  const lobby = lobbyOf(connId);
  if (!lobby || lobby.hostId !== connId || lobby.running) return false;
  const next = clampCityPopulation(pop);
  if (next === lobby.population) return false;
  lobby.population = next;
  return true;
}

export function say(lobby: Lobby, from: string, text: string): void {
  const clean = tidy(text, CHAT_MAX_LEN);
  // A solo room draws no chat box, so a notice posted into one would never be
  // read. The refusals from `start` are exactly the messages you most need to
  // see, so offline keeps the latest one somewhere the client can show it.
  if (lobby.offline) {
    if (!from) lobby.notice = clean;
    return;
  }
  lobby.chat.push({ from, text: clean });
  if (lobby.chat.length > CHAT_HISTORY) lobby.chat.splice(0, lobby.chat.length - CHAT_HISTORY);
}

/** Wipe the standing notice — something has happened since it was posted. */
export function clearNotice(lobby: Lobby): void {
  lobby.notice = '';
}

export function chat(connId: string, text: string): Lobby | null {
  const lobby = lobbyOf(connId);
  const clean = tidy(text, CHAT_MAX_LEN);
  // Nobody to talk to in a solo room, and no chat box drawn to type into.
  if (!lobby || lobby.offline || !clean) return null;
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

/**
 * Just the ones on team two. Which seat somebody took is the only thing that
 * decides what they spawn as, so this is the whole of the officer/dog choice —
 * there is no separate class pick anywhere.
 */
export function seatedDogs(lobby: Lobby): Set<string> {
  const ids = new Set<string>();
  for (const seat of lobby.dogs) {
    if (seat.state === 'player') ids.add(seat.id);
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
    code: lobby.code,
    name: lobby.name,
    isHost: lobby.hostId === viewer,
    humans: lobby.humans.map((s) => seatWire(lobby, s, viewer)),
    dogs: lobby.dogs.map((s) => seatWire(lobby, s, viewer)),
    chat: lobby.chat,
    offline: lobby.offline,
    notice: lobby.notice,
    spectating: lobby.spectators.has(viewer),
    spectators: [...lobby.spectators].map((id) => lobby.members.get(id) ?? '???'),
    population: lobby.population,
    running: lobby.running,
  };
}

/** Every connection currently in any lobby — used to know who *isn't*. */
export function inALobby(connId: string): boolean {
  return memberOf.has(connId);
}
