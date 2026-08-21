/**
 * End-to-end check of the acid's *message path* — the one thing `acidcheck.ts`
 * cannot cover, because it calls `startDogAbility` directly and never puts a
 * byte on a socket.
 *
 * Opens a socket, makes an offline lobby, sits in a dog seat, starts the round,
 * then sends `{"type":"dogAbility","slot":1}` exactly as the client's keydown
 * handler does for `KeyE`, and reads the cloud back off the snapshots. It is
 * checking the plumbing rather than the behaviour: that the slot the client
 * sends is the slot the server spits from, and that `acid` and `spits` actually
 * arrive on the wire where the client looks for them.
 *
 * Point it at a *second* server, never the one somebody is playing on:
 *
 *   PORT=8090 npx tsx src/index.ts        # in one shell
 *   SERVER=8090 npx tsx acidlive.ts       # in another
 */
import WebSocket from 'ws';
import type { ClientMessage, ServerMessage } from '../shared/types.js';
import { ACID_CLOUD_RADIUS, DOG_SPIT_RANGE } from '../shared/constants.js';

const PORT = process.env.SERVER ?? '8090';
const socket = new WebSocket(`ws://localhost:${PORT}`);

let failures = 0;
function check(label: string, ok: boolean, detail = ''): void {
  if (!ok) failures++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
}

const send = (msg: ClientMessage): void => socket.send(JSON.stringify(msg));

let selfId = '';
let started = false;
let spatAt = 0;
let snapshots = 0;
let sawSpitInAir = 0;
let maxRadius = 0;
let firstCloudAt = 0;
let cloudSeen = 0;
/** Where the animal was when it spat, and where the cloud came down. */
let dogAt: { x: number; y: number } | null = null;
let cloudAt: { x: number; y: number } | null = null;
/** The hexagon, so the cooldown is read from the same place the HUD reads it. */
let barReady: number[] = [];

socket.on('open', () => console.log(`acid live check — ws://localhost:${PORT}`));

socket.on('message', (raw: Buffer) => {
  const msg = JSON.parse(raw.toString()) as ServerMessage;

  if (msg.type === 'welcome') {
    selfId = msg.selfId;
    send({ type: 'lobbyCreate', name: 'acid', gamertag: 'ACIDTEST', offline: true });
    return;
  }

  if (msg.type === 'lobby') {
    if (started) return;
    // Take a dog seat. Offline seats start `closed`, so cycle one open first —
    // the same two clicks the front end makes.
    const seat = msg.lobby.dogs[0];
    if (seat.state === 'closed') {
      send({ type: 'lobbyCycle', team: 'dogs', index: 0 });
      return;
    }
    if (seat.state !== 'player') {
      send({ type: 'lobbySit', team: 'dogs', index: 0 });
      return;
    }
    started = true;
    check('sat in a dog seat', true);
    send({ type: 'lobbyStart' });
    return;
  }

  if (msg.type === 'start') {
    // The input loop the real client runs, so the server has an aim point to
    // read when the key goes down. Aimed well out in front of the animal.
    setInterval(() => {
      const me = dogAt;
      send({
        type: 'input',
        input: { up: false, down: false, left: false, right: false },
        aim: 0,
        aimX: (me?.x ?? 0) + 300,
        aimY: me?.y ?? 0,
        shooting: false,
        sprint: false,
        interact: false,
        rightDown: false,
      });
    }, 33);
    return;
  }

  if (msg.type !== 'state') return;
  snapshots++;

  const me = msg.entities.find((e) => e.id === selfId);
  if (me && spatAt === 0) dogAt = { x: me.x, y: me.y };

  // The two new arrays have to exist on every snapshot, not merely when there
  // is something in them — the client reads them unconditionally.
  if (snapshots === 1) {
    check('the wire carries an acid list', Array.isArray(msg.acid), typeof msg.acid);
    check('and a spits list', Array.isArray(msg.spits), typeof msg.spits);
    check('both empty before anything is thrown',
      msg.acid.length === 0 && msg.spits.length === 0);
  }

  // Give it a moment on its feet, then press E.
  if (snapshots === 20 && spatAt === 0 && dogAt) {
    spatAt = Date.now();
    send({ type: 'dogAbility', slot: 1 });
    return;
  }

  if (spatAt === 0) return;

  if (msg.spits.length > 0) sawSpitInAir++;
  if (msg.acid.length > 0) {
    if (firstCloudAt === 0) {
      firstCloudAt = Date.now();
      cloudAt = { x: msg.acid[0].x, y: msg.acid[0].y };
    }
    cloudSeen++;
    maxRadius = Math.max(maxRadius, msg.acid[0].r);
  }
  const spit = msg.dog?.abilities?.[1];
  if (spit) barReady.push(spit.ready);

  if (snapshots === 150) finish();
});

function finish(): void {
  check('the gobbet was in the air first', sawSpitInAir > 0, `${sawSpitInAir} snapshots`);
  check('a cloud landed', cloudSeen > 0, `${cloudSeen} snapshots`);
  check('the flight took a moment rather than none',
    firstCloudAt - spatAt > 200, `${firstCloudAt - spatAt}ms`);
  check('it boiled out to full width', maxRadius >= ACID_CLOUD_RADIUS - 1,
    `${maxRadius} against ${ACID_CLOUD_RADIUS}`);
  if (dogAt && cloudAt) {
    const reach = Math.hypot(cloudAt.x - dogAt.x, cloudAt.y - dogAt.y);
    check('it came down out in front of the animal', reach > 50 && reach <= DOG_SPIT_RANGE + 2,
      `${Math.round(reach)}px`);
  } else {
    check('the animal and the cloud were both seen', false);
  }
  // The hexagon empties on the press and climbs back, read off the same field
  // the HUD draws.
  const lowest = Math.min(...barReady);
  const last = barReady[barReady.length - 1];
  check('the hexagon emptied when the key went down', lowest < 0.05, lowest.toFixed(3));
  check('and is filling again', last > lowest, `${lowest.toFixed(2)} to ${last.toFixed(2)}`);

  console.log(`\n${failures === 0 ? 'all checks passed' : `${failures} FAILED`}\n`);
  socket.close();
  process.exit(failures === 0 ? 0 : 1);
}

setTimeout(() => {
  console.log('\ntimed out waiting for the round');
  process.exit(1);
}, 30000);
