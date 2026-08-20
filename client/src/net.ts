/// <reference types="vite/client" />
import type { ClientMessage, ServerMessage } from '../../shared/types.js';

const RECONNECT_DELAY_MS = 800;
/**
 * How often to probe. Once a second is plenty: this is a number somebody reads
 * off a HUD to decide whether a tunnel is costing them anything, not a control
 * loop, and a rolling window of these already smooths it.
 */
const PING_INTERVAL_MS = 1000;
/** Twenty seconds of history — long enough for a p90 to mean something. */
const PING_WINDOW = 20;

export interface Connection {
  send: (msg: ClientMessage) => void;
  /**
   * Put the game on a worker thread here and drop the server. One way — see
   * the implementation for why, and what it costs to go back (a page reload).
   */
  goOffline: (onReady: () => void) => void;
}

/**
 * Cost of handling inbound snapshots, accumulated since the last frame read
 * it. This lands *between* frames rather than inside the render loop, so a
 * profiler that only times rendering cannot see it at all — and a spectator
 * receives every entity on the map thirty times a second.
 */
export const netStats = { parseMs: 0, applyMs: 0, bytes: 0, messages: 0 };

/**
 * Round-trip time to the server.
 *
 * `median` rather than the last sample because a single probe that happened to
 * land behind a garbage collection says nothing, and `p90` because **jitter is
 * what actually ruins the feel**, not the average — a steady 80ms is far more
 * playable than one that swings between 20 and 200. Both are 0 until the first
 * reply lands.
 */
export const pingStats = { median: 0, p90: 0, samples: 0 };

const pings: number[] = [];

function recordPing(rtt: number): void {
  pings.push(rtt);
  if (pings.length > PING_WINDOW) pings.shift();
  const sorted = [...pings].sort((a, b) => a - b);
  pingStats.median = sorted[Math.floor(sorted.length / 2)];
  pingStats.p90 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.9))];
  pingStats.samples = sorted.length;
}

export function takeNetStats(): { parseMs: number; applyMs: number; bytes: number; messages: number } {
  const snapshot = { ...netStats };
  netStats.parseMs = 0;
  netStats.applyMs = 0;
  netStats.bytes = 0;
  netStats.messages = 0;
  return snapshot;
}

/** Auto-reconnecting socket — the dev server restarts on every edit. */
export function connect(onMessage: (msg: ServerMessage) => void): Connection {
  let ws: WebSocket | null = null;
  /**
   * The game, running here instead of on a server.
   *
   * Once this is set the socket is gone for good and every message goes to a
   * Web Worker running the same `engine.ts` the Node server does. See
   * `goOffline` below for why.
   */
  let worker: Worker | null = null;

  /**
   * Where the server is.
   *
   * **A built client answers this by looking at the address bar.** It is served
   * by the game server itself, over the same port the WebSocket listens on, so
   * wherever the page came from is where the game is — a LAN address, a
   * forwarded port, a tunnel hostname, anything. That is what makes a URL on
   * its own enough to hand to somebody: there is no `?server=` for a guest to
   * be given, and so no way to hand them one pointing at the wrong machine.
   *
   * In development the two are separate — Vite on 5173, the server on 8080 —
   * so a dev build still reaches for 8080 on whatever host served the page.
   *
   * `?server=` overrides either. `?server=8090` is a port on this machine — a
   * second server, leaving a live game alone. `?server=192.168.1.50` or
   * `?server=192.168.1.50:8080` is a *different machine*, which is the point:
   * the simulation and the browser are both single-threaded CPU work, and on a
   * four-core laptop they fight each other. Putting the server on another box
   * is the one change that separates them without giving anything up in the
   * game itself.
   */
  const asked = new URLSearchParams(location.search).get('server') ?? '';
  const host = /^\d+$/.test(asked)
    ? `${location.hostname}:${asked}` // bare number: a port here
    : asked
      ? asked.includes(':')
        ? asked
        : `${asked}:8080` // a host with the usual port
      : import.meta.env.DEV
        ? `${location.hostname}:8080` // Vite served this; the server is elsewhere
        : location.host; // the game server served this page — it is right here

  /**
   * `wss:` whenever the page is https, and it is not optional: a browser blocks
   * a plain `ws://` socket opened from an https page as mixed content, and
   * every tunnel worth using (Cloudflare, ngrok, playit) terminates TLS and
   * serves the page over https. Hardcoding `ws://` is what would make this work
   * perfectly on a LAN and fail the moment it went out to the internet, with a
   * console error most people would never think to look for.
   */
  const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:';

  function open() {
    const socket = new WebSocket(`${scheme}//${host}`);
    ws = socket;

    socket.addEventListener('message', (event) => {
      const raw = event.data as string;
      const t0 = performance.now();
      const msg = JSON.parse(raw) as ServerMessage;
      const t1 = performance.now();
      // Swallowed here rather than forwarded: nothing above this layer has any
      // use for a pong, and letting one through would mean every consumer of
      // `ServerMessage` growing a branch to ignore it.
      if (msg.type === 'pong') {
        recordPing(performance.now() - msg.t);
        netStats.bytes += raw.length;
        netStats.messages++;
        return;
      }
      onMessage(msg);

      netStats.parseMs += t1 - t0;
      netStats.applyMs += performance.now() - t1;
      netStats.bytes += raw.length;
      netStats.messages++;
    });
    socket.addEventListener('open', () => console.log('[net] connected'));
    socket.addEventListener('close', () => {
      // Closed because we moved the game into a worker, not because anything
      // went wrong. Reconnecting would put a server back in the picture.
      if (worker) return;
      console.log('[net] disconnected — retrying');
      if (ws === socket) ws = null;
      // The window is about *this* connection. Carrying it across a reconnect
      // would average the old route's timings into the new one's.
      pings.length = 0;
      pingStats.median = 0;
      pingStats.p90 = 0;
      pingStats.samples = 0;
      setTimeout(open, RECONNECT_DELAY_MS);
    });
    socket.addEventListener('error', () => socket.close());
  }

  open();

  // One timer for the life of the page, not one per connection — `open` runs
  // again on every reconnect, and a timer started there would multiply. It
  // follows the game into the worker rather than stopping, so the HUD's latency
  // figure keeps meaning something: offline it measures how long the worker
  // took to answer, which is small but real on a loaded machine.
  setInterval(() => {
    const probe = { type: 'ping', t: performance.now() } satisfies ClientMessage;
    if (worker) worker.postMessage(probe);
    else if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(probe));
  }, PING_INTERVAL_MS);

  return {
    send(msg: ClientMessage) {
      if (worker) worker.postMessage(msg);
      else if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
    },

    /**
     * Stop talking to a server and run the game here instead.
     *
     * Offline used to mean a browser talking over a socket to a *separate Node
     * process*, so playing solo ran two runtimes competing for the same cores.
     * On a four-core laptop that was most of the stutter: the simulation wanted
     * a core and so did the renderer. This puts the same `engine.ts` on a
     * worker thread — no server, no socket, no port — and messages cross as
     * structured clones, so a snapshot is never serialised to JSON and parsed
     * back thirty times a second.
     *
     * The worker sends its own `welcome`, exactly as a reconnecting socket
     * would, which is why nothing above this layer needed a new case: the
     * client has always had to cope with being introduced to a fresh world.
     * `onReady` fires on that welcome, so the caller can create its lobby
     * knowing the engine is listening.
     */
    goOffline(onReady: () => void) {
      if (worker) return;
      const w = new Worker(new URL('./offline.ts', import.meta.url), { type: 'module' });
      worker = w;
      // Drop the socket, and suppress the reconnect its close would schedule.
      ws?.close();
      ws = null;

      let greeted = false;
      w.addEventListener('message', (event: MessageEvent<ServerMessage>) => {
        const t0 = performance.now();
        const msg = event.data;
        if (msg.type === 'pong') {
          recordPing(performance.now() - msg.t);
          netStats.messages++;
          return;
        }
        onMessage(msg);
        // Nothing to parse — it arrived as an object rather than as text, so
        // `parseMs` stays zero. That is the honest reading, and it is the
        // largest single thing not having a socket buys.
        netStats.applyMs += performance.now() - t0;
        netStats.messages++;
        if (!greeted && msg.type === 'welcome') {
          greeted = true;
          onReady();
        }
      });
      w.addEventListener('error', (e) => console.error('[offline] worker failed:', e.message));

      // `__BUILD__` is baked in by Vite; a worker cannot ask git either.
      w.postMessage({ type: 'start', build: __BUILD__ });
      console.log('[net] offline — the game is running in a worker, no server');
    },
  };
}
