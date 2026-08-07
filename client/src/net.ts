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

  function open() {
    const socket = new WebSocket(`ws://${location.hostname}:8080`);
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
