/**
 * The Node host: a WebSocket and an HTTP server in front of `engine.ts`.
 *
 * Everything about the *game* is in the engine, which knows nothing about
 * sockets. All this file does is give each connection an id and a way to be
 * sent to, hand messages across, and own the clock — which is exactly what the
 * worker in `client/src/offline.ts` does too, by other means.
 */
import { WebSocketServer } from 'ws';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { buildStamp } from '../../shared/buildstamp.js';
import { TICK_RATE } from '../../shared/constants.js';
import type { ClientMessage } from '../../shared/types.js';
import { configureEngine, connect, disconnect, handle, startClock } from './engine.js';
import { clientIsBuilt, serveClient } from './serve.js';

/** 8080 unless told otherwise, so a second server can be run alongside a game. */
const PORT = Number(process.env.PORT) || 8080;
const TICK_MS = 1000 / TICK_RATE;

/**
 * Whether an anonymous socket may wipe the running world — off unless asked,
 * because this server is something you can put on the internet. See the note on
 * `EngineConfig.allowWorldReset`.
 */
const ALLOW_WORLD_RESET = process.env.ALLOW_WORLD_RESET === '1';

/**
 * Which build this server is, read once at startup and handed to every client
 * in its `welcome`. Once rather than per connection: it cannot change while the
 * process is up, and shelling out to git on every socket would be three
 * subprocesses for an answer that is already known.
 *
 * `process.cwd()` is good enough to find the checkout — git walks up looking
 * for `.git`, and every way this is started (npm from `server/`, the launcher
 * from the repo root) begins inside it. Outside one it answers `unknown`.
 */
configureEngine({ build: buildStamp(process.cwd()), allowWorldReset: ALLOW_WORLD_RESET });

/**
 * One port carries both the game and the page that plays it.
 *
 * The WebSocket rides the same HTTP server the client is served from, which is
 * what makes internet play a single thing to forward or tunnel rather than
 * two. It also means the client can find the server by simply looking at the
 * address bar — see `net.ts` — so there is no `?server=` for a guest to be
 * given, and no way for them to be handed a URL with the wrong one in it.
 */
const http = createServer(serveClient);
const wss = new WebSocketServer({ server: http });

wss.on('connection', (socket) => {
  const id = randomUUID();
  // The engine never sees the socket. It is handed a way to send, and this is
  // the only place that knows the message has to be JSON on a wire.
  connect(id, (message) => {
    if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
  });

  socket.on('message', (raw) => {
    try {
      handle(id, JSON.parse(raw.toString()) as ClientMessage);
    } catch {
      // ignore malformed messages
    }
  });
  socket.on('close', () => disconnect(id));
});

// Drift-corrected rather than setInterval — see startClock.
startClock();

http.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT} (game and client, one port)`);
  if (ALLOW_WORLD_RESET) {
    console.log('[server] ALLOW_WORLD_RESET=1 — any socket may reset the world. Local use only.');
  }
  if (clientIsBuilt()) {
    console.log('[server] serving the built client — this URL is the whole game');
  } else {
    console.log(
      '[server] no built client yet (cd client && npm run build) — ' +
        'until then use the Vite dev server on 5173 with ?server=' + PORT,
    );
  }
});
