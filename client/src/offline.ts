/**
 * The whole game, running inside the browser.
 *
 * This is a Web Worker host over the same `engine.ts` the Node server uses —
 * the other half of the seam described there. Offline play used to mean a
 * browser talking over a WebSocket to a *separate Node process*, so a machine
 * playing solo ran two runtimes that competed for the same cores. On a
 * four-core laptop that was most of what made it stutter: the simulation and
 * the renderer each wanted a core and neither could have one to itself.
 *
 * Here there is no server, no socket and no port. The engine ticks on this
 * worker's thread while the page draws on its own, and messages cross by
 * `postMessage` — which is a structured clone, so nothing is ever serialised
 * to JSON in either direction. That last part is not incidental: a snapshot is
 * tens of kilobytes thirty times a second, and parsing it was measurable on the
 * main thread and worse in the garbage it left behind.
 */
import { configureEngine, connect, disconnect, handle, startClock } from '../../server/src/engine.js';
import { TICK_RATE } from '../../shared/constants.js';
import type { ClientMessage, ServerMessage } from '../../shared/types.js';

const TICK_MS = 1000 / TICK_RATE;

/**
 * There is exactly one player and they are the page that started this worker,
 * so the id is a constant rather than anything drawn.
 */
const SOLO = 'offline-player';

let started = false;
let stopClock: (() => void) | null = null;

self.onmessage = (event: MessageEvent<{ type: 'start'; build: string } | ClientMessage>) => {
  const msg = event.data;

  if (msg.type === 'start') {
    if (started) return;
    started = true;
    /**
     * `allowWorldReset` is true here where the Node host defaults it false, and
     * the reasoning inverts cleanly: that flag exists because a server on the
     * internet can be reached by anybody. The only thing that can talk to this
     * worker is the page that created it.
     */
    configureEngine({ build: msg.build, allowWorldReset: true });
    connect(SOLO, (out: ServerMessage) => {
      // Structured clone, not JSON. The engine's own objects go across as they
      // are and arrive as ordinary objects on the other side.
      (self as unknown as Worker).postMessage(out);
    });
    stopClock = startClock();
    return;
  }

  if (!started) return;
  handle(SOLO, msg);
};

/**
 * The page has gone. Only reached when the worker is being torn down while the
 * document survives — a closing tab takes the worker with it either way.
 */
self.onclose = () => {
  stopClock?.();
  disconnect(SOLO);
};
