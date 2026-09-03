import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { buildStamp } from '../shared/buildstamp.js';

/** The repo root — where git lives, one level up from `client/`. */
const repoRoot = fileURLToPath(new URL('..', import.meta.url));

export default defineConfig({
  /*
   * Where the built game will be served from.
   *
   * `/` is right for every local route — the Vite dev server, and `Host
   * Online.bat`, which has the game server serve `dist` off its own root. A
   * GitHub Pages *project* site is not at a root: it is `/<repo>/`, and a
   * bundle built for `/` asks for `/assets/index.js` there and gets a 404 on
   * every file, so the page loads white with no error worth the name.
   *
   * Set through the environment rather than hardcoded, because the two builds
   * are the same build and only their address differs — the workflow in
   * `.github/workflows/pages.yml` passes the repo path, and anybody building
   * locally gets the root they already had.
   */
  base: process.env.PAGES_BASE || '/',
  // Baked in at build time, because a browser cannot ask git itself. The menu
  // shows this against the stamp the server reports, so a machine that forgot
  // to pull says so on the title screen rather than through some desync an
  // hour into a round.
  define: {
    __BUILD__: JSON.stringify(buildStamp(repoRoot)),
  },
  server: {
    // Bound to every interface, so the other machine on the LAN can open the
    // client. Vite listens on localhost only by default, which makes running
    // the game across two boxes impossible — and the whole point of doing that
    // is to stop the simulation and the browser fighting over the same cores.
    host: true,
    fs: {
      allow: ['..'],
    },
  },
});
