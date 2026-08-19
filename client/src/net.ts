/// <reference types="vite/client" />
import type { ClientMessage, ServerMessage } from '../../shared/types.js';

const RECONNECT_DELAY_MS = 800;

export interface Connection {
  send: (msg: ClientMessage) => void;
}

/**
 * Cost of handling inbound snapshots, accumulated since the last frame read
 * it. This lands *between* frames rather than inside the render loop, so a
 * profiler that only times rendering cannot see it at all — and a spectator
 * receives every entity on the map thirty times a second.
 */
export const netStats = { parseMs: 0, applyMs: 0, bytes: 0, messages: 0 };

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
      onMessage(msg);

      netStats.parseMs += t1 - t0;
      netStats.applyMs += performance.now() - t1;
      netStats.bytes += raw.length;
      netStats.messages++;
    });
    socket.addEventListener('open', () => console.log('[net] connected'));
    socket.addEventListener('close', () => {
      console.log('[net] disconnected — retrying');
      if (ws === socket) ws = null;
      setTimeout(open, RECONNECT_DELAY_MS);
    });
    socket.addEventListener('error', () => socket.close());
  }

  open();

  return {
    send(msg: ClientMessage) {
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
    },
  };
}
