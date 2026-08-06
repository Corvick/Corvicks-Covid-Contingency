import type { ClientMessage, ServerMessage } from '../../shared/types.js';

const RECONNECT_DELAY_MS = 800;

export interface Connection {
  send: (msg: ClientMessage) => void;
}

/** Auto-reconnecting socket — the dev server restarts on every edit. */
export function connect(onMessage: (msg: ServerMessage) => void): Connection {
  let ws: WebSocket | null = null;

  function open() {
    const socket = new WebSocket(`ws://${location.hostname}:8080`);
    ws = socket;

    socket.addEventListener('message', (event) => {
      onMessage(JSON.parse(event.data) as ServerMessage);
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
