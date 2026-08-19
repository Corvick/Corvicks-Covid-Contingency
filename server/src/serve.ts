import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * Serving the built client off the game server, so the whole game is **one
 * port**.
 *
 * That is the difference between playing over the internet and not. In
 * development the client is Vite on 5173 and the server is ws on 8080, and a
 * friend on the far side of the internet would need both of those reachable —
 * two port forwards, or two tunnels, and a URL carrying `?server=` to staple
 * them back together. One port is one thing to forward, one tunnel, and a URL
 * you can paste into a chat window on its own.
 *
 * It is deliberately tiny and dependency-free: `ws` is the only thing this
 * server has ever depended on, and a static handler for two files is not worth
 * changing that.
 */

const here = fileURLToPath(new URL('.', import.meta.url));
/** `server/src` → the repo root → `client/dist`. */
export const CLIENT_DIST = resolve(here, '..', '..', 'client', 'dist');

const TYPES = new Map(
  Object.entries({
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.map': 'application/json; charset=utf-8',
  }),
);

/** Is there a built client to serve at all? */
export function clientIsBuilt(): boolean {
  return existsSync(join(CLIENT_DIST, 'index.html'));
}

/**
 * Resolve a request path to a file inside the build, or null.
 *
 * The containment check is the point: a request for `/../../server/src/world.ts`
 * normalises to something outside the build, and this is a server people are
 * about to expose to the internet. Everything unknown falls back to
 * `index.html` — the game is one page, and a guest who mistypes the path should
 * still get the game rather than a 404 they cannot interpret.
 */
function fileFor(urlPath: string): string | null {
  let wanted: string;
  try {
    wanted = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  } catch {
    return null; // malformed percent-encoding
  }
  if (wanted === '/' || wanted === '') wanted = '/index.html';

  const full = resolve(join(CLIENT_DIST, normalize(wanted)));
  // `resolve` has already collapsed any `..`, so this is the whole guard.
  if (full !== CLIENT_DIST && !full.startsWith(CLIENT_DIST + sep)) return null;
  if (!existsSync(full) || !statSync(full).isFile()) {
    const index = join(CLIENT_DIST, 'index.html');
    return existsSync(index) ? index : null;
  }
  return full;
}

export function serveClient(req: IncomingMessage, res: ServerResponse): void {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { allow: 'GET, HEAD' });
    res.end();
    return;
  }

  if (!clientIsBuilt()) {
    res.writeHead(503, { 'content-type': 'text/plain; charset=utf-8' });
    res.end(
      'No built client to serve.\n\nRun:  cd client && npm run build\n' +
        'Or use the dev setup instead: the Vite server on 5173, with ?server=8080.\n',
    );
    return;
  }

  const file = fileFor(req.url ?? '/');
  if (!file) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('not found');
    return;
  }

  // Vite fingerprints everything under assets/, so those can be cached hard.
  // index.html must not be, or a rebuilt client never reaches anyone who has
  // already played once — which is the confusing kind of stale, because the
  // game loads and is simply the wrong version.
  const immutable = file.includes(`${sep}assets${sep}`);
  res.writeHead(200, {
    'content-type': TYPES.get(extname(file).toLowerCase()) ?? 'application/octet-stream',
    'content-length': statSync(file).size,
    'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  createReadStream(file).pipe(res);
}
