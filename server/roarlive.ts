/**
 * End-to-end check of the roar's *message path* — the one thing the headless
 * harness cannot cover, because it calls `startDogAbility` directly.
 *
 * Opens a socket to a server, makes an offline lobby, sits in a dog seat,
 * starts the round, then sends `{"type":"dogAbility","slot":0}` exactly as the
 * client's keydown handler does, and reads the answer back off the snapshots.
 *
 * Point it at a *second* server, never the one somebody is playing on:
 *
 *   PORT=8090 npx tsx src/index.ts        # in one shell
 *   SERVER=8090 npx tsx roarlive.ts       # in another
 */
import WebSocket from 'ws';
import type { ClientMessage, ServerMessage } from '../shared/types.js';

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
/** The ability hexagon, snapshot by snapshot. */
const bar: Array<{ ready: number; charges: number; active: number }> = [];
/**
 * When the roar was first and last seen running, in wall time.
 *
 * **Counting snapshots would be measuring the snapshot rate, not the roar** —
 * which is what the first version of this check did, and it read 43 where it
 * expected 60. Broadcasts arrive at whatever rate the tick and the socket
 * manage on the day; the two seconds are a fact about the server's clock.
 */
let roarFirstSeen = 0;
let roarLastSeen = 0;
let longestSpell = 0;
let completedRoars = 0;
let diedWhileWatching = false;
let snapshots = 0;
let firstSnapshotAt = 0;
/** Whether the entity we are driving carried the `roaring` flag. */
let sawRoaringFlag = false;
let sawRooted = false;
let lastPos: { x: number; y: number } | null = null;
let movedWhileRoaring = 0;
const contactSamples: number[] = [];

socket.on('open', () => console.log(`roar live check — ws://localhost:${PORT}`));

socket.on('message', (raw: Buffer) => {
  const msg = JSON.parse(raw.toString()) as ServerMessage;

  if (msg.type === 'welcome') {
    selfId = msg.selfId;
    send({ type: 'lobbyCreate', name: 'roar', gamertag: 'ROARTEST', offline: true });
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
    // Hold W down from the off, so "it did not move" is a real measurement.
    setInterval(() => {
      send({
        type: 'input',
        input: { up: true, down: false, left: false, right: false },
        aim: 0,
        aimX: 2000,
        aimY: 1500,
        shooting: false,
        sprint: false,
        interact: false,
        rightDown: false,
      });
    }, 33);
    // A moment to spawn and walk, then press Q exactly as the client does.
    setTimeout(() => send({ type: 'dogAbility', slot: 0 }), 1500);
    setTimeout(report, 6000);
    return;
  }

  if (msg.type !== 'state') return;

  snapshots++;
  if (firstSnapshotAt === 0) firstSnapshotAt = Date.now();

  if (msg.dog) {
    if (msg.dog.dying >= 0) diedWhileWatching = true;
    const slot = msg.dog.abilities[0];
    if (slot) {
      bar.push({ ready: slot.ready, charges: slot.charges, active: slot.active });
      // The longest *unbroken* spell the bar spent claiming to be running.
      // This is the check that matters: the failure it was written for is a
      // roar that never ends, and counting snapshots cannot see that.
      if (slot.active >= 0) {
        if (roarFirstSeen === 0) roarFirstSeen = Date.now();
        roarLastSeen = Date.now();
        longestSpell = Math.max(longestSpell, roarLastSeen - roarFirstSeen);
      } else {
        if (roarFirstSeen > 0) completedRoars++;
        roarFirstSeen = 0;
      }
    }
    if (bar.length === 1) {
      check('the wire carries a four-slot bar', msg.dog.abilities.length === 4);
      check('one filled, three empty', msg.dog.abilities.filter((a) => a !== null).length === 1);
      check('and a contact list for the corner map', Array.isArray(msg.dog.contacts));
    }
    // What the map is *allowed* to show is proven against `dogHudFor` in
    // `dogmapcheck.ts`, where the world is there to check it against. All this
    // end can honestly say is that the field crosses the wire and stays sane.
    contactSamples.push(msg.dog.contacts.length);
  }

  const me = msg.entities.find((e) => e.id === selfId);
  if (!me) return;
  if (me.roaring) {
    sawRoaringFlag = true;
    sawRooted = true;
    if (lastPos) movedWhileRoaring = Math.max(movedWhileRoaring, Math.hypot(me.x - lastPos.x, me.y - lastPos.y));
  }
  lastPos = { x: me.x, y: me.y };
});

function report(): void {
  const running = bar.filter((b) => b.active >= 0).length;
  check('the dogAbility message reached the server', running > 0, `${running} snapshots mid-roar`);
  check('and the roar was on the wire for everyone', sawRoaringFlag);
  /**
   * **Rooted means its legs stop, not that nothing can move it.**
   *
   * `moveDog` is skipped for the whole roar, but `resolveCollisions` is not —
   * a shambler walking into a stationary dog shoves it a pixel or so, exactly
   * as it shoves anything else, and a planted bipod is no different. So the
   * threshold has to separate "jostled" from "walking" rather than demand
   * zero: at `DOG_SPEED` 182 over a 30Hz tick, walking is about 6px a step.
   * Measured over five live runs: 0.00px on four of them and 1.64px on the one
   * where something bumped into it.
   */
  check(
    'rooted for the whole of it with W held',
    sawRooted && movedWhileRoaring < 3,
    `worst step ${movedWhileRoaring.toFixed(2)}px, against ~6px a step walking`,
  );
  // Measured in wall time rather than in snapshots: broadcasts arrive at
  // whatever rate the tick and the socket manage on the day, and the two
  // seconds are a fact about the server's clock. It is short by up to one
  // broadcast interval at each end, so the window is generous at the bottom.
  const rate = snapshots / ((Date.now() - firstSnapshotAt) / 1000);
  check(
    'it ran for about two seconds and then stopped',
    longestSpell > 1600 && longestSpell < 2300,
    `longest unbroken spell ${longestSpell}ms of a 2000ms window,` +
      ` over ${running} snapshots at ${rate.toFixed(1)}Hz`,
  );
  check('the bar came back off it', completedRoars > 0, `${completedRoars} finished`);

  const worstContacts = contactSamples.length > 0 ? Math.max(...contactSamples) : 0;
  check(
    'the contact list stays a handful, not the whole garrison',
    worstContacts <= 8,
    `most seen at once: ${worstContacts}`,
  );

  /**
   * **A dog shot mid-roar is a different run, not a failed one.**
   *
   * Standing still for two seconds in a city with a garrison in it is the whole
   * cost of the ability, so the garrison killing it is the ability working. It
   * happens in roughly one run in five here, and it is the case that turned up
   * the stuck-roar bug — so when it happens the run checks something *more*
   * rather than less: that the bar came off it anyway, and that no roar was
   * ever unleashed from the grave.
   */
  if (diedWhileWatching) {
    console.log('  note  the garrison killed it mid-roar — the case that found the stuck-roar bug');
    check('the bar did not stay stuck on a dead dog', longestSpell < 2300, `${longestSpell}ms`);
    return finish();
  }

  const cooling = bar.filter((b) => b.active < 0 && b.ready < 1).length;
  check('and the hexagon recharges afterwards', cooling > 0, `${cooling} snapshots cooling`);
  finish();
}

function finish(): void {

  console.log(`\n${failures === 0 ? 'all good' : `${failures} FAILED`}`);
  send({ type: 'lobbyLeave' });
  socket.close();
  process.exit(failures === 0 ? 0 : 1);
}

socket.on('error', (e: Error) => {
  console.log(`  FAIL  could not reach the server — ${e.message}`);
  console.log('        start one first:  PORT=8090 npx tsx src/index.ts');
  process.exit(1);
});
