/**
 * Finding each other, and then talking directly.
 *
 * The four-letter code was always a key into a `Map` inside one server process.
 * That is fine when everybody is pointed at the same process and useless when
 * they are not — which is what made "send your friend the code" not work: their
 * game looked the code up on *their own* machine and quite correctly found
 * nothing. What was missing was never the lobby; it was any way for their
 * machine to learn where yours is.
 *
 * Four letters cannot carry an address. Twenty letters at four places is 160,000
 * codes, and a home IP is both longer than that and different next week. So the
 * joining machine has to *ask* something it already knows how to reach, and the
 * only question is who runs that something. Trystero's answer is that nobody
 * does: it signals over public infrastructure that is already there for other
 * reasons — Nostr relays by default, BitTorrent trackers and MQTT brokers
 * otherwise — and once two browsers have swapped an offer and an answer through
 * it, the relay drops out and the connection is genuinely direct.
 *
 * **This is a star, not a mesh, and that is deliberate.** Trystero's own
 * documented weak spot is rooms where every peer connects to every other peer,
 * which grows as the square. The game is host-authoritative — one engine, on
 * the host's machine, exactly as the Node server was — so a guest only ever
 * connects to the host. Five connections for six players rather than fifteen,
 * and no guest can desync from another guest because no guest simulates
 * anything.
 */
import { joinRoom, selfId } from 'trystero';
import type { ClientMessage, ServerMessage } from '../../shared/types.js';

/**
 * Namespaces the room topic, so a four-letter code here cannot collide with the
 * same four letters in somebody else's Trystero app on the same public relay.
 */
const APP_ID = 'corvicks-covid-contingency';

/**
 * The action name rides on every single message, and a snapshot goes out thirty
 * times a second to each peer, so it is one character rather than a word.
 *
 * There is only one, and there deliberately is not a second "hello" action for
 * the host to announce itself with. That was the first design and it had a race
 * in it: the guest would learn who the host was and send `lobbyJoin` straight
 * back, possibly before the host's own engine had run `connect` for that peer —
 * at which point the message is addressed to a connection the engine does not
 * yet know about and is dropped on the floor. Latching the host off the **first
 * game message** instead cannot race, because the first thing any engine says
 * to a new connection is `welcome`, and it only says it *after* connecting them.
 * The greeting and the proof of readiness are the same event.
 */
const ACTION_GAME = 'G';

/**
 * How long a guest waits to be greeted before calling it a dead code.
 *
 * This has to cover finding a relay, publishing to it, being noticed, and a
 * full ICE handshake — several seconds on a cold start, where a WebSocket to a
 * known host either connects or refuses almost at once. Too short and a code
 * that would have worked is reported as wrong, which is the most confusing
 * failure available here; too long and a genuine typo leaves somebody watching
 * a spinner. Eight seconds is the compromise.
 */
export const JOIN_TIMEOUT_MS = 8000;

/** Our own peer id, for logging. Trystero draws it once per page. */
export const selfPeerId = selfId;

/**
 * A payload as Trystero types it.
 *
 * Our messages are plain JSON-shaped objects, but `ClientMessage` and
 * `ServerMessage` are declared as unions of interfaces rather than as
 * `JsonValue`, and TypeScript will not accept the one as the other without
 * being told. The cast is confined to the two `send` helpers below rather than
 * sprayed over every call site.
 *
 * It is derived from the action *instance* rather than from `joinRoom`'s type,
 * because `makeAction` is overloaded — a `ReturnType` of it resolves to the
 * last overload, `RequestAction`, which has no `send` at all.
 */

export interface HostRoom {
  /** Push one server message down one peer's channel. */
  sendTo: (peerId: string, msg: ServerMessage) => void;
  /** Stop hosting. Peers see a leave and fall back to their own menus. */
  close: () => void;
}

/**
 * Start accepting guests on `code`.
 *
 * Called once the host's own engine has *already* drawn the code — the engine
 * generates it in `lobbyCreate`, and it is the room name here, so the room
 * cannot be opened until it exists. That ordering is the whole reason this is a
 * separate call rather than something `goHost` does for itself.
 */
export function hostRoom(
  code: string,
  handlers: {
    onJoin: (peerId: string) => void;
    onLeave: (peerId: string) => void;
    onMessage: (peerId: string, msg: ClientMessage) => void;
  },
): HostRoom {
  const room = joinRoom({ appId: APP_ID }, code);
  const game = room.makeAction(ACTION_GAME);
  type Payload = Parameters<typeof game.send>[0];

  game.onMessage = (data, context) => {
    handlers.onMessage(context.peerId, data as unknown as ClientMessage);
  };

  room.onPeerJoin = (peerId) => {
    console.log('[p2p] peer connected:', peerId);
    /*
     * Attach them to the engine. That is what makes the host declare itself:
     * `connect` answers with a `welcome` addressed to this peer, which is the
     * first thing they hear from anybody in the room and is how they work out
     * which of these peers is the one simulating the game.
     */
    handlers.onJoin(peerId);
  };

  room.onPeerLeave = (peerId) => {
    console.log('[p2p] peer gone:', peerId);
    handlers.onLeave(peerId);
  };

  console.log('[p2p] hosting room', code, 'as', selfId);

  return {
    sendTo(peerId, msg) {
      void game.send(msg as unknown as Payload, { target: peerId });
    },
    close() {
      void room.leave();
    },
  };
}

export interface GuestRoom {
  send: (msg: ClientMessage) => void;
  close: () => void;
}

/**
 * Join `code` and find the host.
 *
 * `onReady` fires once a host has identified itself, which is the first moment
 * there is anywhere to send a `lobbyJoin`. `onFail` fires if nobody does inside
 * `JOIN_TIMEOUT_MS`, and the caller turns that into the same refusal a wrong
 * code has always produced — from the player's side those are the same event,
 * and inventing a new one would only ask them to tell apart two things they
 * cannot act on differently.
 */
export function guestRoom(
  code: string,
  handlers: {
    onReady: () => void;
    onFail: (why: string) => void;
    onMessage: (msg: ServerMessage) => void;
    onHostLost: () => void;
  },
): GuestRoom {
  const room = joinRoom({ appId: APP_ID }, code);
  const game = room.makeAction(ACTION_GAME);
  type Payload = Parameters<typeof game.send>[0];

  /** Latched on the first message anybody sends us. See `ACTION_GAME`. */
  let hostId: string | null = null;
  let settled = false;

  const timer = setTimeout(() => {
    if (settled) return;
    settled = true;
    void room.leave();
    handlers.onFail('no lobby with the code ' + code);
  }, JOIN_TIMEOUT_MS);

  game.onMessage = (data, context) => {
    if (!hostId) {
      /*
       * Whoever spoke first is the host. No guest can be mistaken for one:
       * a guest only ever sends to `hostId`, and until this line runs it does
       * not have one, so nothing but the host is capable of sending anything.
       */
      hostId = context.peerId;
      settled = true;
      clearTimeout(timer);
      console.log('[p2p] host is', hostId);
      /*
       * Deliver before announcing. This very message is the `welcome`, and the
       * caller's `onReady` sends `lobbyJoin` — which the client may only send
       * once it has been introduced to a world. Firing `onReady` first would
       * put those two the wrong way round.
       */
      handlers.onMessage(data as unknown as ServerMessage);
      handlers.onReady();
      return;
    }
    // Ignore anything from a peer that is not the host. Nothing else should be
    // talking, and a guest must never act on another guest's traffic.
    if (context.peerId !== hostId) return;
    handlers.onMessage(data as unknown as ServerMessage);
  };

  room.onPeerLeave = (peerId) => {
    if (peerId !== hostId) return;
    console.log('[p2p] host went away');
    hostId = null;
    handlers.onHostLost();
  };

  console.log('[p2p] joining room', code, 'as', selfId);

  return {
    send(msg) {
      if (!hostId) return;
      void game.send(msg as unknown as Payload, { target: hostId });
    },
    close() {
      settled = true;
      clearTimeout(timer);
      void room.leave();
    },
  };
}
