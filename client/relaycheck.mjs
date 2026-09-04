/*
 * Are the signalling relays still alive?
 *
 * Two browsers find each other by publishing a signed presence event to a
 * Nostr relay and reading each other's back. That is the whole of matchmaking,
 * and it runs on *somebody else's* infrastructure — so it rots, silently, and
 * when it does the symptom is "my friend cannot join" with nothing in the game
 * to say why. It has already happened once: two of the five relays Trystero
 * picked by default were refusing every write, permanently, which is what made
 * a perfectly good four-letter code look broken. See `SIGNAL_RELAYS` in
 * `src/p2p.ts`.
 *
 * So this is the thing to run when somebody says they cannot connect, *before*
 * suspecting NAT, the code, or the game. Run it on both machines: a relay
 * reachable from one country and not another produces exactly the same symptom
 * and cannot be seen from one end.
 *
 *   cd client && node relaycheck.mjs          # the pinned list
 *   cd client && node relaycheck.mjs --all    # the whole default pool, to repin from
 *
 * It signs with the game's own `createEvent`, so what it measures is the exact
 * event the game publishes — kind 21463, ephemeral, which is precisely the kind
 * some relays quietly refuse.
 */
import { createEvent, defaultRelayUrls } from '@trystero-p2p/nostr';

/**
 * Kept in step with `SIGNAL_RELAYS` in `src/p2p.ts` by hand.
 *
 * Deliberately a copy rather than an import: this file is plain node ESM and
 * that one is TypeScript inside the Vite graph. The list is six lines and
 * changes about once a year; a build step to share it would cost more than it
 * saves. If they drift, this harness reports on relays nobody is using — so
 * change both, and the check below prints the list it used.
 */
const PINNED = [
  'wss://nos.lol',
  'wss://relay.mostr.pub',
  'wss://bucket.coracle.social',
  'wss://purplerelay.com',
  'wss://nostr.data.haus',
  'wss://relay.sigit.io',
];

/** Writes per relay, and the gap between them — the cadence a room announces at. */
const BURST = 6;
const GAP_MS = 500;
const TIMEOUT_MS = 12000;

/**
 * One relay, tested the way the game uses it: open, publish several signed
 * ephemeral events, count how many are actually accepted.
 *
 * **A read test is not enough and that is the trap worth knowing.** Both dead
 * relays in the original fault answered reads perfectly well and refused every
 * write — one wanted proof-of-work, one wanted an allowlist. A host that cannot
 * write cannot announce itself, and is invisible however well it reads.
 */
async function check(url) {
  const events = [];
  for (let i = 0; i < BURST; i++) {
    const payload = await createEvent('relaycheck-' + Math.random().toString(36).slice(2), 'x' + i);
    events.push({ payload, id: JSON.parse(payload)[1].id });
  }

  return new Promise((resolve) => {
    const t0 = Date.now();
    let ws;
    let opened = false;
    let done = false;
    const accepted = new Set();
    const refused = new Map();

    const finish = () => {
      if (done) return;
      done = true;
      try { ws && ws.close(); } catch { /* already gone */ }
      resolve({
        url,
        opened,
        ok: accepted.size,
        why: [...new Set(refused.values())][0] ?? (opened ? '' : 'could not connect'),
        ms: Date.now() - t0,
      });
    };

    const timer = setTimeout(finish, TIMEOUT_MS);
    try {
      ws = new WebSocket(url);
    } catch (e) {
      clearTimeout(timer);
      refused.set('x', String(e.message).slice(0, 50));
      return finish();
    }

    ws.onopen = async () => {
      opened = true;
      for (const e of events) {
        if (done) return;
        ws.send(e.payload);
        await new Promise((r) => setTimeout(r, GAP_MS));
      }
      // A moment for the last OK to come back before calling it.
      setTimeout(() => { clearTimeout(timer); finish(); }, 2500);
    };
    ws.onmessage = (m) => {
      let d;
      try { d = JSON.parse(m.data); } catch { return; }
      if (d[0] !== 'OK') return;
      if (d[2]) accepted.add(d[1]);
      else refused.set(d[1], String(d[3] ?? '').slice(0, 50));
    };
    ws.onerror = () => { clearTimeout(timer); finish(); };
    ws.onclose = () => { clearTimeout(timer); finish(); };
  });
}

const all = process.argv.includes('--all');
const urls = all ? defaultRelayUrls.map((u) => (u.startsWith('wss://') ? u : 'wss://' + u)) : PINNED;

console.log(`probing ${urls.length} relay(s), ${BURST} signed writes each\n`);
const results = await Promise.all(urls.map(check));
results.sort((a, b) => b.ok - a.ok || a.ms - b.ms);

console.log(`accepted/${BURST}   relay`);
for (const r of results) {
  const mark = r.ok === BURST ? '  ' : r.ok === 0 ? '!!' : ' ~';
  console.log(`${mark}  ${r.ok}/${BURST}       ${r.url}${r.why ? '   ' + r.why : ''}`);
}

const healthy = results.filter((r) => r.ok === BURST).length;
const dead = results.filter((r) => r.ok === 0);
console.log(`\n${healthy}/${results.length} fully healthy, ${dead.length} dead`);

if (!all) {
  /*
   * Two peers meet only on a relay they share, so what matters is not the
   * count but whether *enough* of the pinned list works for two independent
   * machines to overlap. One is a single point of failure; below half is worth
   * repinning off `--all`.
   */
  if (healthy === 0) {
    console.log('\nNOBODY CAN CONNECT. Every pinned relay is refusing writes.');
    console.log('Re-pin from a healthy relay: node relaycheck.mjs --all');
    process.exitCode = 1;
  } else if (healthy < urls.length / 2) {
    console.log('\nThin. More than half the pinned relays are unhealthy —');
    console.log('re-pin from: node relaycheck.mjs --all');
    process.exitCode = 1;
  } else {
    console.log('Signalling is healthy. If a join still fails it is NAT or the code, not the relays.');
  }
}
