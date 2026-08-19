import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { buildStamp } from '../shared/buildstamp.js';

/** The repo root — where git lives, one level up from `client/`. */
const repoRoot = fileURLToPath(new URL('..', import.meta.url));

export default defineConfig({
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
