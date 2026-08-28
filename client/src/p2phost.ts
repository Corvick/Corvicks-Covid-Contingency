/**
 * The whole game, running inside the *host's* browser, for everybody.
 *
 * This is `offline.ts` with the one assumption taken out of it. That file says
 * "there is exactly one player and they are the page that started this worker",
 * and so hardcodes a single connection id. Here there are up to six: the host,
 * who is the page, and one per peer that has opened a WebRTC data channel to
 * them. Nothing else about it differs, because `engine.ts` never cared — its
 * whole API is `connect(id, sendTo)` / `handle(id, msg)` / `disconnect(id)`,
 * and it has no idea whether a `sendTo` ends up in a socket, a `postMessage`
 * or a data channel.
 *
 * **Why the peers are not connected from in here.** `RTCPeerConnection` is
 * `[Exposed=Window]` — it does not exist in a worker at all. So the main thread
 * owns the peer connections and this worker owns the simulation, and the two
 * talk over `postMessage`. That costs one extra structured clone per message
 * each way, which is the same coin `offline.ts` already pays and is still not
 * JSON.
 *
 * The routing envelope is the only thing added to the wire between page and
 * worker: an inbound message says which peer it came from, an outbound one says
 * which peer it is for. `engine.ts` produces per-connection messages already
 * (fog is per-viewer), so there is nothing to broadcast and nothing to fan out
 * — every snapshot has exactly one addressee.
 */
import { configureEngine, connect, disconnect, handle, startClock } from '../../server/src/engine.js';
import type { ServerMessage } from '../../shared/types.js';
import { HOST_SELF, type HostIn, type HostOut } from './p2pwire.js';

let started = false;
let stopClock: (() => void) | null = null;

/** Everyone the engine currently thinks is attached, so a stop can drop them. */
const attached = new Set<string>();

function post(to: string, msg: ServerMessage): void {
  (self as unknown as Worker).postMessage({ to, msg } satisfies HostOut);
}

self.onmessage = (event: MessageEvent<HostIn>) => {
  const inbound = event.data;

  if (inbound.kind === 'start') {
    if (started) return;
    started = true;
    /**
     * `allowWorldReset` is **false** here where `offline.ts` sets it true, and
     * the reasoning is the one written down beside `EngineConfig`: that flag is
     * about who can reach the engine. Offline, the only thing that can talk to
     * the worker is the page that made it. Here, anybody who has the four-letter
     * code can — `restart` and `spectate{restart}` both call `resetWorld` from
     * any connection, in or out of a lobby, so leaving it true would let a guest
     * wipe the host's round out from under everyone.
     */
    configureEngine({ build: inbound.build, allowWorldReset: false });
    connect(HOST_SELF, (out) => post(HOST_SELF, out));
    attached.add(HOST_SELF);
    stopClock = startClock();
    return;
  }

  if (!started) return;

  if (inbound.kind === 'join') {
    // Guard against a duplicate join for one peer: `connect` would send a
    // second `welcome`, and the client treats a welcome as being introduced to
    // a fresh world — it would throw away a lobby it is already sitting in.
    if (attached.has(inbound.id)) return;
    attached.add(inbound.id);
    connect(inbound.id, (out) => post(inbound.id, out));
    return;
  }

  if (inbound.kind === 'leave') {
    if (!attached.delete(inbound.id)) return;
    disconnect(inbound.id);
    return;
  }

  // An ordinary game message from a peer, or from the host's own page.
  // Deliberately dropped if that peer is not attached: a message arriving
  // between a channel closing and the page noticing would otherwise walk into
  // `handle` for a connection the engine has already forgotten.
  if (!attached.has(inbound.id)) return;
  handle(inbound.id, inbound.msg);
};

/**
 * The page has gone. Only reached when the worker is torn down while the
 * document survives — a closing tab takes the worker with it either way.
 */
self.onclose = () => {
  stopClock?.();
  for (const id of attached) disconnect(id);
  attached.clear();
};
