/*
 * What would a TURN relay actually have to carry?
 *
 * TURN is not a signalling helper — when ICE falls back to it, *every* byte
 * between the two peers goes through it. Host-authoritative means that is one
 * snapshot stream per guest, thirty times a second, for the length of the
 * round. So "should we add TURN" is really "is somebody willing to pay for N
 * guests times that", and that is a number rather than an opinion.
 *
 * Headless — no socket, no port, so it leaves a game on 8080 alone. It drives
 * the real `connect`/`handle`/`tick` and measures what the engine actually
 * hands a connection.
 *
 *   cd server && npx tsx turncost.ts
 *
 * **A connection with no entity is a spectator, and that is the trap here.**
 * `const spectating = world.spectators.has(id) || !viewer` — so a probe that
 * merely calls `connect` is handed `wholeBoard()` and measures the worst case
 * while claiming to measure a player. Measured that way the two came out
 * *byte for byte identical* at 58.7 KB a snapshot, which is the tell. A guest
 * has to be seated in a lobby and the round actually started, which is the
 * only way anybody gets an entity — see "Nobody has an entity until their
 * lobby starts a round".
 */
import { connect, disconnect, handle, startClock, world } from './src/engine.js';
import { lobbyOf } from './src/lobby.js';

/**
 * Real seconds, on the engine's own clock, because **`tick()` takes no
 * arguments** — it reads `Date.now()` itself.
 *
 * That is the trap this file fell into first and it is the one CLAUDE.md
 * already records for every other harness here: ticks driven back to back
 * complete in microseconds, so the clock barely moves and every time-gated
 * piece of work is skipped — perception at 10Hz, the danger rebuild, wander
 * re-picks. The usual fix is to advance a clock and pass it as `now`, and that
 * is not available through this entry point: `tick(now)` compiles only because
 * nothing at `server/` root is typechecked, and the argument is discarded.
 * Measured that way the world is frozen — 524 entities and ~500 survivors after
 * a "300-tick warmup" during which the outbreak had not started at all.
 *
 * So this waits on wall time, and the run genuinely takes this long.
 */
const WARMUP_MS = Number(process.env.WARMUP_S ?? 20) * 1000;
const SAMPLE_MS = 10000;

interface Seen {
  bytes: number;
  states: number;
  /** Proof the probe is what it says it is, rather than a spectator by accident. */
  hadEntity: boolean;
  /** Measured rather than assumed — the clock is wall time now. */
  seconds: number;
}

/**
 * Bytes as they would go down a socket.
 *
 * The peer-to-peer path does not use `JSON.stringify` — Trystero encodes to
 * binary over the data channel — so this is a proxy rather than the exact wire
 * figure. It is the right proxy: the same information has to cross either way,
 * and framing moves the number by a modest factor, not by an order of
 * magnitude. Quote it as "about", never as exact.
 */
const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function run(seatPlayer: boolean): Promise<Seen> {
  const host = 'probe-host';
  const seen: Seen = { bytes: 0, states: 0, hadEntity: false, seconds: 0 };
  let counting = false;
  /** Only the seated guest is metered; the host's own stream is not the cost. */
  const meter = (id: string) => (msg: unknown) => {
    if (!counting || id !== (seatPlayer ? 'probe-guest' : host)) return;
    seen.bytes += JSON.stringify(msg).length;
    if ((msg as { type?: string }).type === 'state') seen.states++;
  };

  connect(host, meter(host));
  handle(host, {
    type: 'lobbyCreate',
    name: 'probe',
    gamertag: 'HOST',
    offline: false,
  } as never);

  /*
   * The code the engine drew, which is the only way into the lobby.
   *
   * Read off `lobbyOf` rather than reached for on the world: `lobbies` is
   * module state inside `lobby.ts` and is not a field on the world at all, so
   * the obvious version found nothing, the guest was refused with "a code is 4
   * letters", and the run went on to measure a spectator while calling it a
   * player. Thrown on rather than defaulted, because a staging that failed
   * must not be allowed to report a figure.
   */
  const code = lobbyOf(host)?.code ?? '';
  if (!code) throw new Error('staging failed: no lobby code');

  if (seatPlayer) {
    connect('probe-guest', meter('probe-guest'));
    handle('probe-guest', { type: 'lobbyJoin', code, gamertag: 'GUEST' } as never);
    /*
     * Which seat matters: a dog sees on `DOG_SIGHT_RADIUS` (945) against an
     * officer's 720, so it is handed more of the city and costs more. Four of
     * five players are officers, so that is the figure to plan against;
     * `SEAT=dog` measures the other.
     *
     * **`LobbyTeam` is `'humans' | 'dogs'`, not an index**, and getting that
     * wrong is silent: `sit` reads `team === 'humans' ? lobby.humans :
     * lobby.dogs`, so *anything* else lands in a dog seat. Written as `team: 0`
     * it staged a dog both times and the run reported an officer's cost. None
     * of this file is typechecked — `server/tsconfig.json` includes `src/**`
     * only — and the `as never` below defeats what little there would be, which
     * is why the staging prints what the guest actually became.
     */
    if (process.env.SEAT === 'spectator') {
      /*
       * A spectator holds no seat and gets no entity, and is handed
       * `wholeBoard()` — the worst case, and the one worth knowing because it
       * is roughly thirteen times a player. Reached through `lobbySpectate`
       * rather than by simply not sitting, because `startLobby` puts the
       * spectator set together itself.
       */
      handle('probe-guest', { type: 'lobbySpectate', on: true } as never);
    } else {
      const team = process.env.SEAT === 'dog' ? 'dogs' : 'humans';
      handle('probe-guest', { type: 'lobbySit', team, index: 1 } as never);
    }
  }

  handle(host, { type: 'lobbyStart' } as never);

  const stop = startClock();
  await wait(WARMUP_MS);

  seen.hadEntity = world.entities.has(seatPlayer ? 'probe-guest' : host);
  if (seatPlayer) {
    // Label the figure by what the guest actually became rather than by which
    // seat was asked for — `sit` can refuse, `lobbySpectate` can refuse, and a
    // mislabelled number is worse than no number.
    const what = world.spectators.has('probe-guest')
      ? 'SPECTATOR'
      : world.dogs.has('probe-guest')
        ? 'DOG'
        : seen.hadEntity
          ? 'OFFICER'
          : 'NOTHING — staging failed';
    console.log(`  [staged] guest is a ${what}`);
  }
  // Proof the round is actually moving. A frozen world reports the full crowd
  // and no zombies, which is what the discarded-clock version measured.
  let zombies = 0;
  for (const e of world.entities.values()) if (e.type === 'zombie') zombies++;
  console.log(`  [staged] after ${WARMUP_MS / 1000}s: ${world.entities.size} entities, ${zombies} zombies`);

  const t0 = Date.now();
  counting = true;
  await wait(SAMPLE_MS);
  counting = false;
  seen.seconds = (Date.now() - t0) / 1000;

  stop();
  if (seatPlayer) disconnect('probe-guest');
  disconnect(host);
  return seen;
}

function human(bytesPerSec: number): string {
  const mbps = (bytesPerSec * 8) / 1e6;
  const gbPerHour = (bytesPerSec * 3600) / 1e9;
  return `${(bytesPerSec / 1024).toFixed(0)} KB/s · ${mbps.toFixed(2)} Mbps · ${gbPerHour.toFixed(2)} GB/hour`;
}

console.log(
  `warming up ${WARMUP_MS / 1000}s on the engine's own clock, then sampling ${SAMPLE_MS / 1000}s\n`,
);

const spectating = process.env.SEAT === 'spectator';
const player = await run(true);
const seconds = player.seconds;
console.log(
  spectating
    ? 'A SPECTATOR — the whole board, the worst case'
    : 'A SEATED GUEST — fog-limited, what a relayed friend actually costs',
);
// A spectator is *supposed* to have no entity, so only shout about it otherwise.
if (!spectating) {
  console.log(`  had an entity: ${player.hadEntity}  ${player.hadEntity ? '' : '<-- NOT A PLAYER, figure is void'}`);
}
console.log(`  entities alive: ${world.entities.size}`);
console.log(`  snapshots:    ${player.states} in ${seconds.toFixed(1)}s (${(player.states / seconds).toFixed(1)}/s)`);
console.log(`  per snapshot: ${(player.bytes / Math.max(1, player.states) / 1024).toFixed(1)} KB`);
console.log(`  sustained:    ${human(player.bytes / seconds)}\n`);

const perGuest = player.bytes / seconds;

console.log('IF TURN HAD TO CARRY IT — host outbound, per guest relayed');
for (const n of [1, 2, 4]) {
  console.log(`  ${n} guest${n > 1 ? 's' : ''}: ${human(perGuest * n)}`);
}

console.log('\nAGAINST A FREE TURN ALLOWANCE');
for (const [tier, gb] of [
  ['5 GB', 5],
  ['20 GB', 20],
] as const) {
  const solo = (gb * 1e9) / (perGuest * 3600);
  const four = (gb * 1e9) / (perGuest * 4 * 3600);
  console.log(`  ${tier.padEnd(6)} ${solo.toFixed(1)}h with 1 relayed guest · ${four.toFixed(1)}h with 4`);
}

console.log('\nOnly pairs that FALL BACK to TURN cost anything.');
console.log('A direct connection never touches it, and most pairs connect directly.');
process.exit(0);
