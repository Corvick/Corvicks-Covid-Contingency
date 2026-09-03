/// <reference types="vite/client" />
import type { ClientMessage, ServerMessage } from '../../shared/types.js';
import { guestRoom, hostRoom, type GuestRoom, type HostRoom } from './p2p.js';
import { HOST_SELF, type HostIn, type HostOut } from './p2pwire.js';

const RECONNECT_DELAY_MS = 800;
/**
 * How many times to try a server that has never once answered before deciding
 * there isn't one.
 *
 * The retry exists because the dev server restarts on every edit — a case that
 * by definition has connected at least once. A build published to a static host
 * has no server at all and never will, so the same loop runs for the life of
 * the page: a failed WebSocket and a red console line every 800ms, forever,
 * behind a menu that works perfectly without it. Giving up is only ever applied
 * to a connection that has never succeeded; once one has, it retries as before.
 */
const NO_SERVER_ATTEMPTS = 3;
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
   * Put the game on a worker thread here and drop the server. Reversible with
   * `goOnline`; calling it again while already offline simply reports ready.
   */
  goOffline: (onReady: () => void) => void;
  /** Reconnect to a server, having been offline. A no-op if never offline. */
  goOnline: () => void;
  /**
   * Host a game for other people, on this machine, with no server anywhere.
   *
   * The same worker `goOffline` starts, with the one difference that it is fed
   * more than one connection — see `p2phost.ts`. `onReady` fires on the host's
   * own `welcome`, so the caller can create its lobby knowing the engine is
   * listening, exactly as offline does.
   *
   * **The room is opened later and not by the caller.** It is named after the
   * four-letter code, which the engine draws in `lobbyCreate`, so it cannot
   * exist until the lobby does. This watches for that and opens it.
   */
  goHost: (onReady: () => void) => void;
  /**
   * Join somebody else's game by code, over a direct connection to them.
   *
   * `onReady` fires once their engine has said `welcome`, which is the first
   * moment a `lobbyJoin` can be sent. `onFail` fires when nobody answers, and
   * carries the same wording a wrong code has always produced.
   */
  goGuest: (code: string, onReady: () => void, onFail: (why: string) => void) => void;
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
   * Which worker that is. Both run `engine.ts`, and they take *different*
   * messages: `offline.ts` is handed a bare `ClientMessage` because it has one
   * connection and knows who it is, where `p2phost.ts` needs the envelope in
   * `p2pwire.ts` saying which of its several connections this is. Getting this
   * wrong is silent — the worker simply ignores a shape it does not recognise.
   */
  let workerKind: 'offline' | 'host' = 'offline';
  /** Our peers, when hosting. Null when not. */
  let hosting: HostRoom | null = null;
  /** Our connection to somebody else's engine, when a guest. Null when not. */
  let guest: GuestRoom | null = null;

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

  /**
   * Whether a socket to `host` has ever opened. Tells "the server restarted"
   * apart from "there is no server here", which want opposite answers.
   */
  let everConnected = false;
  /** Consecutive failures with nothing having connected yet. */
  let deadOpens = 0;

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
    socket.addEventListener('open', () => {
      everConnected = true;
      deadOpens = 0;
      console.log('[net] connected');
    });
    socket.addEventListener('close', () => {
      // Closed because we moved the game off the socket, not because anything
      // went wrong. Reconnecting would put a server back in the picture.
      // `guest` counts as much as `worker` does: joining somebody else's game
      // drops the socket without starting a worker, and without this line the
      // retry timer quietly reconnects underneath a peer-to-peer session.
      if (worker || guest) return;
      if (ws === socket) ws = null;
      /*
       * Nothing has ever answered here, so stop asking.
       *
       * This is the published-to-a-static-host case: the page is the whole
       * game and there is no server anywhere. Said once and then dropped —
       * hosting, joining and playing offline all work from here, and each of
       * them closes the socket for good on its way past.
       */
      if (!everConnected && ++deadOpens >= NO_SERVER_ATTEMPTS) {
        console.log('[net] no server at ' + host + ' — peer-to-peer only');
        return;
      }
      console.log('[net] disconnected — retrying');
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
    deliver({ type: 'ping', t: performance.now() });
  }, PING_INTERVAL_MS);

  /**
   * The one place that knows where an outbound message goes.
   *
   * There are four possible answers now — a guest's data channel, a host's own
   * worker, an offline worker, a socket — and the ping loop has to reach the
   * same one `send` does or the HUD's latency figure measures a route nobody is
   * playing over. It was duplicated across the two while there were only two
   * answers, and this is the point at which that stops being tenable.
   */
  function deliver(msg: ClientMessage): void {
    if (guest) {
      guest.send(msg);
      return;
    }
    if (worker) {
      worker.postMessage(
        workerKind === 'host' ? ({ kind: 'msg', id: HOST_SELF, msg } satisfies HostIn) : msg,
      );
      return;
    }
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }

  return {
    send(msg: ClientMessage) {
      deliver(msg);
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
      /*
       * Already offline — quit to the menu and pressed PLAY OFFLINE again.
       *
       * The engine in the worker is still there and still listening; leaving a
       * lobby does not disconnect from it. So the only thing to do is say so.
       * Returning silently here is what made the menu look dead after a quit:
       * the guard against building a *second* worker was also swallowing the
       * callback, so the lobby that PLAY OFFLINE exists to create was never
       * asked for, and nothing happened at all.
       */
      if (worker) {
        onReady();
        return;
      }
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

    /**
     * Go back to a server, having been offline.
     *
     * `goOffline` closes the socket for good, so without this the second dead
     * button after quitting an offline round was PLAY ONLINE: the screens still
     * moved, but CREATE and JOIN sent into a socket that was gone and nothing
     * ever came back. A menu that changes screens and then does nothing is the
     * worst of both — it looks like it worked.
     *
     * The worker is terminated rather than parked. It owns a whole world, and
     * an offline round that came back would be the wrong one anyway.
     */
    goOnline() {
      if (!worker) return;
      worker.terminate();
      worker = null;
      // A fresh `welcome` arrives from the server, which the client already
      // copes with — it is the same path a dropped connection takes.
      open();
      console.log('[net] back online — reconnecting to the server');
    },

    goHost(onReady: () => void) {
      if (worker) {
        onReady();
        return;
      }
      const w = new Worker(new URL('./p2phost.ts', import.meta.url), { type: 'module' });
      worker = w;
      workerKind = 'host';
      // Drop the socket, and suppress the reconnect its close would schedule.
      ws?.close();
      ws = null;

      /** The code the room is currently open on, so a new lobby moves it. */
      let openOn: string | null = null;
      let greeted = false;

      w.addEventListener('message', (event: MessageEvent<HostOut>) => {
        const { to, msg } = event.data;

        /*
         * Somebody else's message. Straight out to their channel without being
         * looked at — this page is their server, and a snapshot addressed to a
         * peer means nothing here.
         */
        if (to !== HOST_SELF) {
          hosting?.sendTo(to, msg);
          return;
        }

        const t0 = performance.now();
        if (msg.type === 'pong') {
          recordPing(performance.now() - msg.t);
          netStats.messages++;
          return;
        }
        onMessage(msg);
        // Nothing to parse — it arrived as an object rather than as text, so
        // `parseMs` stays zero, exactly as offline.
        netStats.applyMs += performance.now() - t0;
        netStats.messages++;

        if (!greeted && msg.type === 'welcome') {
          greeted = true;
          onReady();
        }

        /*
         * Open the room the moment there is a code to name it after.
         *
         * The code is drawn by the engine inside `lobbyCreate`, so this is the
         * earliest it can possibly happen, and it is done here rather than by
         * the caller because which relay a room lives on is a transport
         * question and the menu has no business knowing there is one.
         *
         * An offline lobby is skipped outright: it promises nobody can join it,
         * and publishing its code to a public relay would be exactly the thing
         * `joinLobby` refuses to do from the other end.
         */
        if (msg.type === 'lobby' && !msg.lobby.offline && msg.lobby.code !== openOn) {
          hosting?.close();
          openOn = msg.lobby.code;
          hosting = hostRoom(msg.lobby.code, {
            onJoin: (id) => w.postMessage({ kind: 'join', id } satisfies HostIn),
            onLeave: (id) => w.postMessage({ kind: 'leave', id } satisfies HostIn),
            onMessage: (id, m) => w.postMessage({ kind: 'msg', id, msg: m } satisfies HostIn),
          });
        }
      });
      w.addEventListener('error', (e) => console.error('[p2p] host worker failed:', e.message));

      // `__BUILD__` is baked in by Vite; a worker cannot ask git either.
      w.postMessage({ kind: 'start', build: __BUILD__ } satisfies HostIn);
      console.log('[net] hosting — the game runs in this page and peers connect to it');
    },

    goGuest(code: string, onReady: () => void, onFail: (why: string) => void) {
      /*
       * A guest runs no engine at all — the host's does everything, exactly as
       * the Node server used to. So any worker this page had is terminated
       * rather than parked: it owns a whole world, and it is not the world
       * about to be played.
       */
      if (worker) {
        worker.terminate();
        worker = null;
      }
      ws?.close();
      ws = null;
      guest?.close();

      guest = guestRoom(code, {
        onReady,
        onFail: (why) => {
          guest?.close();
          guest = null;
          onFail(why);
        },
        onMessage: (msg) => {
          const t0 = performance.now();
          if (msg.type === 'pong') {
            recordPing(performance.now() - msg.t);
            netStats.messages++;
            return;
          }
          onMessage(msg);
          netStats.applyMs += performance.now() - t0;
          netStats.messages++;
        },
        /*
         * The host closed the tab, lost their connection, or quit. There is no
         * round any more and nothing to reconnect to — the world only ever
         * existed on their machine. `lobbyLeft` is what the client already does
         * when a host takes a lobby with them, so this needs no new case
         * anywhere above.
         */
        onHostLost: () => {
          guest?.close();
          guest = null;
          onMessage({ type: 'lobbyLeft', reason: 'the host left' });
        },
      });
    },
  };
}
