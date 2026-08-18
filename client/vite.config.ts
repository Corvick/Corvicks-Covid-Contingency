import { defineConfig } from 'vite';

export default defineConfig({
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
