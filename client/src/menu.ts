import { DEFAULTS, LOW, apply as applySettings, isDefault, isLow, settings } from './settings.js';
import type {
  ClientMessage,
  LobbyTeam,
  LobbyView,
  ServerMessage,
  SlotWire,
} from '../../shared/types.js';
import {
  CITY_POP_BASE,
  CITY_POP_MAX,
  CITY_POP_MIN,
  CITY_POP_STEP,
  WORLD_BASE_WIDTH,
  WORLD_BASE_HEIGHT,
  LOBBY_CODE_LENGTH,
  RENDER_SCALES,
  VIEWPORT_WIDTH,
  VIEWPORT_HEIGHT,
  citySizeFor,
} from '../../shared/constants.js';

/** The backbuffer a render scale asks for, which is what the row is named after. */
const resolutionAt = (scale: number): { w: number; h: number } => ({
  w: Math.round(VIEWPORT_WIDTH * scale),
  h: Math.round(VIEWPORT_HEIGHT * scale),
});

/**
 * The front end: title, gamertag, create or browse, lobby. It owns no game
 * state and no lobby state — the server holds the lobby and pushes it back on
 * every change, and this just draws whatever arrived and forwards clicks.
 */
export interface MenuHooks {
  send: (msg: ClientMessage) => void;
  /**
   * Move the game onto a worker in this page and drop the server, then call
   * back once it is listening. What PLAY OFFLINE does before it creates its
   * room — see `goOffline` in `net.ts`.
   */
  goOffline: (onReady: () => void) => void;
  /**
   * Put a server back, having played offline. Called when an online path is
   * chosen, so the socket is up by the time a lobby is asked for.
   */
  goOnline: () => void;
  /**
   * Host for other people on this machine, then call back once the engine is
   * listening — at which point the lobby is created and its code becomes the
   * name of the room guests find us by. What HOST GAME does.
   */
  goHost: (onReady: () => void) => void;
  /**
   * Connect directly to whoever is hosting `code`. `onReady` fires when their
   * engine has said hello and a `lobbyJoin` can be sent; `onFail` when nobody
   * answered, which from the player's side is the same event as a wrong code.
   */
  goGuest: (code: string, onReady: () => void, onFail: (why: string) => void) => void;
  /**
   * Our lobby's round has begun; the game takes the screen from here. `solo`
   * says whether it can be paused — only an offline round can, since nobody
   * else is in it.
   */
  onStart: (solo: boolean) => void;
  /**
   * The lobby went away under us — the host quit, taking the round with them.
   * The game has to stand down whether or not we asked it to.
   */
  onEnd: () => void;
}

export interface Menu {
  /** Feed every server message through here. Non-lobby ones are ignored. */
  handle: (msg: ServerMessage) => void;
  /** Come back from a round: put the shell up again, at the title. */
  reopen: () => void;
}

const NAME_KEY = 'gamertag';
const NAME_MAX = 16;
/** How long COPY stays ticked before going back to offering itself. */
const COPIED_SHOWN_MS = 1400;

export function setupMenu(hooks: MenuHooks): Menu {
  const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const shell = el<HTMLDivElement>('shell');

  /**
   * The build stamp, bottom right of the shell.
   *
   * Two questions, and the second is the one worth the pixels: what is this
   * client, and is the server the same thing? Ours is `__BUILD__`, baked in by
   * Vite at compile time; the server's arrives in `welcome`.
   *
   * While they agree there is one grey line — printing a matching stamp twice
   * is noise. When they differ both are shown and it goes amber, because that
   * is the whole reason this exists: running the game across two machines, the
   * thing that has gone wrong is almost always that one of them did not pull.
   */
  const stamp = el<HTMLDivElement>('build-stamp');
  const showBuild = (server?: string) => {
    const differs = server !== undefined && server !== __BUILD__;
    stamp.classList.toggle('mismatch', differs);
    // No "build" label on the matching line: the stamp now leads with `v0.0.5`,
    // which says what it is without being told.
    stamp.textContent = differs ? `client ${__BUILD__}\nserver ${server}` : __BUILD__;
  };
  showBuild();

  const screens = {
    title: el<HTMLDivElement>('screen-title'),
    name: el<HTMLDivElement>('screen-name'),
    online: el<HTMLDivElement>('screen-online'),
    create: el<HTMLDivElement>('screen-create'),
    join: el<HTMLDivElement>('screen-join'),
    options: el<HTMLDivElement>('screen-options'),
    lobby: el<HTMLDivElement>('lobby'),
  };
  type Screen = keyof typeof screens;

  let current: Screen = 'title';
  const show = (which: Screen) => {
    current = which;
    for (const [key, node] of Object.entries(screens)) node.classList.toggle('active', key === which);
  };

  let name = '';
  let view: LobbyView | null = null;

  /**
   * A code carried in on the URL — `?join=MZGD`.
   *
   * Four letters is already short, but it is four letters typed into a box the
   * guest has to be told how to find. A link is one click out of a chat window,
   * which is the whole of what "frictionless" means to the person being
   * invited. Held here until there is a gamertag to join with, and cleared once
   * spent so that leaving the lobby cannot silently rejoin it.
   */
  let pendingJoin = (() => {
    const raw = new URLSearchParams(location.search).get('join') ?? '';
    const code = raw.toUpperCase().replace(/[^A-Z]/g, '').slice(0, LOBBY_CODE_LENGTH);
    return code.length === LOBBY_CODE_LENGTH ? code : '';
  })();

  /**
   * Whether the socket is actually up.
   *
   * `net.ts` drops a send on the floor when the socket is still connecting —
   * silently, with no error and no queue — so an invite spent at page load goes
   * nowhere at all and the guest is left sitting on the JOIN screen with the
   * right code in the box and no idea why nothing happened. `welcome` is the
   * first thing the server says, so it is the honest "you may talk now" signal.
   */
  let connected = false;

  /**
   * Spend the invite, once there is one, a name to spend it under, and a socket
   * to spend it down. Called from all three of those becoming true, in whatever
   * order they do; the first call that finds all three wins and clears it.
   *
   * Returns the code it sent, so the caller can put it in the box — a refusal
   * has to land somewhere with something to correct.
   */
  const takeInvite = (): string => {
    /*
     * `connected` is deliberately no longer required.
     *
     * It meant "the socket has said `welcome`, so you may talk", which was the
     * honest signal while joining meant sending `lobbyJoin` down a socket to a
     * server. Joining is peer-to-peer now and needs no socket at all — waiting
     * on one would hang an invite link forever on any machine that is not also
     * running a game server, which is every guest's machine.
     */
    if (!pendingJoin || !name) return '';
    const code = pendingJoin;
    pendingJoin = '';
    hooks.goGuest(
      code,
      () => hooks.send({ type: 'lobbyJoin', code, gamertag: name }),
      (why) => {
        // Land it on the JOIN screen with the code still in the box, which is
        // where a refusal has always gone and where it can be corrected.
        show('join');
        codeInput.value = code;
        joinError.textContent = why;
        codeInput.focus();
        codeInput.select();
      },
    );
    return code;
  };

  // ---- gamertag ----
  const nameInput = el<HTMLInputElement>('name-input');
  const nameOk = el<HTMLButtonElement>('btn-name-ok');
  const typedName = () => nameInput.value.trim().slice(0, NAME_MAX);

  const confirmName = () => {
    const next = typedName();
    if (!next) return;
    name = next;
    // Private browsing and locked-down storage both throw here, and neither is
    // worth a crash — you just get asked again next time.
    try {
      localStorage.setItem(NAME_KEY, name);
    } catch {
      /* not remembered, still usable this session */
    }
    // Arriving on an invite, the name screen is the only thing between the
    // click and the lobby — so answering it goes straight there rather than
    // dropping them on a menu to find JOIN for themselves.
    const sent = takeInvite();
    if (sent) {
      codeInput.value = sent;
      refreshJoinButton();
      show('join');
      return;
    }
    show('online');
  };

  nameInput.addEventListener('input', () => nameOk.classList.toggle('dim', !typedName()));
  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') confirmName();
  });
  nameOk.addEventListener('click', confirmName);

  const askName = () => {
    let remembered = '';
    try {
      remembered = localStorage.getItem(NAME_KEY) ?? '';
    } catch {
      /* nothing remembered */
    }
    nameInput.value = remembered;
    nameOk.classList.toggle('dim', !typedName());
    show('name');
    nameInput.focus();
    nameInput.select();
  };

  // ---- create ----
  const lobbyNameInput = el<HTMLInputElement>('lobby-name-input');
  const doCreate = () => {
    /*
     * **The game runs here, and guests connect to this machine.**
     *
     * There is no server in this any more. The engine goes on a worker in this
     * page exactly as PLAY OFFLINE puts it there, and the only difference is
     * that it is fed more than one connection. The lobby is created once it has
     * said hello, because until then there is nothing listening — the same
     * ordering PLAY OFFLINE needs, and for the same reason.
     *
     * The room guests find us by is named after the four-letter code, which the
     * engine draws inside `lobbyCreate`. So it cannot be opened from here; the
     * transport watches for the code and opens it. See `goHost` in `net.ts`.
     */
    hooks.goHost(() => {
      hooks.send({
        type: 'lobbyCreate',
        name: lobbyNameInput.value.trim() || `${name}'s lobby`,
        gamertag: name,
      });
    });
  };
  lobbyNameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doCreate();
  });
  el('btn-create-go').addEventListener('click', doCreate);

  // ---- join by code ----
  // There is no browse list any more: nothing enumerates the lobbies on a
  // server, so the four letters are the only handle on one. That is the whole
  // of the "only my friends get in" property, and it costs nothing to keep —
  // the client simply has no way to ask what exists.
  const codeInput = el<HTMLInputElement>('code-input');
  const joinGo = el<HTMLButtonElement>('btn-join-go');
  const joinError = el<HTMLParagraphElement>('join-error');

  /** What is in the box, as the server will read it: letters only, uppercase. */
  const typedCode = () =>
    codeInput.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, LOBBY_CODE_LENGTH);

  /**
   * A join is in flight. Finding a peer takes seconds where a socket took
   * none, so the button has to stop accepting clicks for that window — pressed
   * twice it would open a second room on the same code and leave the first one
   * orphaned on the relay.
   */
  let joining = false;

  const refreshJoinButton = () =>
    joinGo.classList.toggle('dim', joining || typedCode().length < LOBBY_CODE_LENGTH);

  const doJoin = () => {
    if (joining) return;
    const code = typedCode();
    // Refuse a short code here rather than sending it: the server would answer
    // the same thing, and a round trip to be told you have not finished typing
    // reads as the code being wrong.
    if (code.length < LOBBY_CODE_LENGTH) {
      joinError.textContent = `a code is ${LOBBY_CODE_LENGTH} letters`;
      return;
    }
    /*
     * Say something, because this one takes a moment.
     *
     * A socket to a known address either connects or refuses almost at once.
     * Finding a peer means reaching a relay, being noticed by the host, and
     * then a full ICE handshake — seconds, on a cold start. Silence for that
     * long is indistinguishable from a dead button, which is the fault this
     * whole screen has been bitten by before.
     */
    joinError.textContent = 'connecting…';
    joining = true;
    refreshJoinButton();
    hooks.goGuest(
      code,
      () => {
        joining = false;
        refreshJoinButton();
        joinError.textContent = '';
        hooks.send({ type: 'lobbyJoin', code, gamertag: name });
      },
      (why) => {
        joining = false;
        refreshJoinButton();
        // Stays on this screen with the code still in the box: mistyping is the
        // ordinary case, and being sent back a screen costs you your place.
        joinError.textContent = why;
        codeInput.focus();
        codeInput.select();
      },
    );
  };

  // Normalise as they type, so a pasted " abcd " or "A-B-C-D" lands as ABCD and
  // the box always shows exactly what will be sent.
  codeInput.addEventListener('input', () => {
    const clean = typedCode();
    if (codeInput.value !== clean) codeInput.value = clean;
    joinError.textContent = '';
    refreshJoinButton();
  });
  codeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doJoin();
  });
  joinGo.addEventListener('click', doJoin);

  // ---- lobby ----
  const codeWrap = el<HTMLDivElement>('lobby-code-wrap');
  const codeText = el<HTMLSpanElement>('lobby-code');
  const copyBtn = el<HTMLButtonElement>('btn-copy-code');
  const copyLinkBtn = el<HTMLButtonElement>('btn-copy-link');
  const inviteHint = el<HTMLParagraphElement>('invite-hint');
  let copiedTimer = 0;
  let linkTimer = 0;

  /**
   * The link a guest can click.
   *
   * Built from the address *this page was served from*, which is the only
   * address known to actually reach this server — a tunnel hostname, a LAN IP,
   * a forwarded public one, whatever the host opened the game on.
   *
   * Which is also why it is refused on localhost: a host playing at
   * `http://localhost:8080` would otherwise copy a link to their own machine
   * and paste it to four people, for whom it means "your own PC". A button that
   * hands out a broken link is worse than no button, so it says so instead.
   */
  const inviteLink = (code: string) => `${location.origin}/?join=${code}`;
  const linkIsLocal =
    location.hostname === 'localhost' ||
    location.hostname === '::1' ||
    location.hostname.startsWith('127.');

  /**
   * Put the code on the clipboard.
   *
   * `navigator.clipboard` only exists in a secure context — HTTPS or
   * localhost — and the whole point of this feature is the *other* players,
   * who reach the dev server at `http://192.168.x.x:5173` and therefore do not
   * have it. So the deprecated `execCommand` path is not a legacy fallback
   * here, it is the one that actually runs for everybody but the host.
   */
  const copyToClipboard = (text: string): boolean => {
    if (navigator.clipboard?.writeText) {
      // Fire and forget: it resolves after this returns, and a rejection just
      // means the tick was optimistic — the code is still on screen to read.
      navigator.clipboard.writeText(text).catch(() => {});
      return true;
    }
    const scratch = document.createElement('textarea');
    scratch.value = text;
    // Off screen rather than hidden — a display:none element cannot be selected.
    scratch.style.cssText = 'position:fixed;top:-1000px;opacity:0';
    document.body.appendChild(scratch);
    scratch.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      /* no clipboard at all — the code is selectable on screen instead */
    }
    scratch.remove();
    return ok;
  };

  copyLinkBtn.addEventListener('click', () => {
    if (!view || linkIsLocal) return;
    const ok = copyToClipboard(inviteLink(view.code));
    copyLinkBtn.textContent = ok ? 'LINK COPIED' : 'PRESS CTRL+C';
    copyLinkBtn.classList.toggle('done', ok);
    clearTimeout(linkTimer);
    linkTimer = window.setTimeout(() => {
      copyLinkBtn.textContent = 'COPY INVITE LINK';
      copyLinkBtn.classList.remove('done');
    }, COPIED_SHOWN_MS);
  });

  copyBtn.addEventListener('click', () => {
    if (!view) return;
    const ok = copyToClipboard(view.code);
    copyBtn.textContent = ok ? 'COPIED' : 'CTRL+C';
    copyBtn.classList.toggle('done', ok);
    // Failing that, select it for them so one Ctrl+C finishes the job.
    if (!ok) {
      const range = document.createRange();
      range.selectNodeContents(codeText);
      const sel = getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
    clearTimeout(copiedTimer);
    copiedTimer = window.setTimeout(() => {
      copyBtn.textContent = 'COPY';
      copyBtn.classList.remove('done');
    }, COPIED_SHOWN_MS);
  });

  // ---- options ----
  /**
   * The host's one setting: how many civilians the round is built for, and
   * with it how big a city they get.
   *
   * It is sent **live as the slider moves**, so the room watches the number
   * change rather than being told about it once the host lets go — which is
   * the same reason seats push on every click. The server clamps and steps
   * whatever arrives, so the range here is a courtesy to the person dragging
   * rather than the rule.
   */
  const popSlider = el<HTMLInputElement>('pop-slider');
  const popValue = el<HTMLSpanElement>('pop-value');
  const popNote = el<HTMLParagraphElement>('pop-note');
  popSlider.min = String(CITY_POP_MIN);
  popSlider.max = String(CITY_POP_MAX);
  popSlider.step = String(CITY_POP_STEP);

  /**
   * Whether the host has hold of it.
   *
   * The server owns the lobby and pushes the whole thing back on every change,
   * and `renderLobby` writes what arrived into the controls — which for a
   * slider being dragged means the value the host is *leaving* gets written
   * back over the value they are moving to, one round trip behind the mouse.
   * The thumb sticks, jumps and fights the drag. So while it is being held, the
   * slider is the authority on its own position and the push is only allowed to
   * update the text beside it.
   */
  let draggingPop = false;

  /**
   * The slider reads both ways now, so the caption has to as well: 500 is the
   * city the game is tuned in and the share is measured against that, which
   * means it goes over 100% as often as under it.
   */
  const popCaption = (pop: number) => {
    const { width, height } = citySizeFor(pop);
    if (pop === CITY_POP_BASE) return `${width}x${height} — the standard city`;
    const share = Math.round((width * height * 100) / (WORLD_BASE_WIDTH * WORLD_BASE_HEIGHT));
    return `${width}x${height} city · ${share}% of a standard one`;
  };

  /** Draw the number and the caption for a value, wherever it came from. */
  const showPop = (pop: number) => {
    popValue.textContent = String(pop);
    popNote.textContent = popCaption(pop);
  };

  const sendPop = () => {
    const pop = Number(popSlider.value);
    showPop(pop);
    hooks.send({ type: 'lobbyPopulation', population: pop });
  };

  popSlider.addEventListener('input', sendPop);
  // Both ends of the hold. `pointerdown` catches a drag, `keydown` the arrow
  // keys — a slider is focusable, and holding Right walks it the same way.
  popSlider.addEventListener('pointerdown', () => { draggingPop = true; });
  popSlider.addEventListener('keydown', () => { draggingPop = true; });
  // Letting go simply hands the control back. There is nothing to correct: the
  // pushes ignored during the drag were echoes of values this client sent, and
  // the last one either changed something — in which case a push is on its way
  // and `renderLobby` will write it — or it did not, in which case what is on
  // screen is already what the server holds.
  for (const done of ['pointerup', 'pointercancel', 'blur', 'keyup'] as const) {
    popSlider.addEventListener(done, () => { draggingPop = false; });
  }

  const chatLog = el<HTMLDivElement>('chat-log');
  const chatInput = el<HTMLInputElement>('chat-input');
  const startBtn = el<HTMLButtonElement>('lobby-start');
  const teams = document.querySelector('#lobby .teams') as HTMLDivElement;
  const spectatorRow = el<HTMLDivElement>('spectator-row');
  const spectatorTag = spectatorRow.querySelector('.tag') as HTMLButtonElement;
  const spectatorLabel = spectatorRow.querySelector('span') as HTMLSpanElement;

  // One control, both directions: on the bench it puts you back in a seat, in
  // a seat it takes you out of one.
  const toggleSpectate = () => hooks.send({ type: 'lobbySpectate', on: !view?.spectating });
  spectatorRow.addEventListener('click', toggleSpectate);
  spectatorTag.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleSpectate();
  });
  const hosts: Record<LobbyTeam, HTMLDivElement> = {
    humans: el<HTMLDivElement>('slots-humans'),
    dogs: el<HTMLDivElement>('slots-dogs'),
  };

  const renderSlots = (team: LobbyTeam, seats: SlotWire[], isHost: boolean) => {
    const host = hosts[team];
    host.replaceChildren();
    seats.forEach((seat, i) => {
      const row = document.createElement('div');
      row.className = 'slot';
      row.dataset.state = seat.state;
      if (seat.self) row.dataset.self = 'yes';

      const label = document.createElement('span');
      label.textContent = `${team === 'humans' ? 'OFFICER' : 'DOG'} ${i + 1}`;

      const tag = document.createElement('button');
      tag.className = 'tag';
      tag.textContent = seat.state === 'player' ? (seat.name ?? '???') : seat.state.toUpperCase();
      // Only the host arranges the room, and nobody rearranges an occupied seat.
      tag.disabled = !isHost || seat.state === 'player';
      tag.addEventListener('click', (e) => {
        e.stopPropagation(); // the row underneath would try to seat us
        hooks.send({ type: 'lobbyCycle', team, index: i });
      });

      if (seat.self) {
        // Clicking the seat you're in is you standing up to watch instead.
        row.addEventListener('click', () => hooks.send({ type: 'lobbySpectate', on: true }));
      } else if (seat.state === 'open' || seat.state === 'bot') {
        // A closed seat isn't yours to take until it's been opened, and there's
        // no point clicking one someone else is already in. Taking a bot's seat
        // is fair game — the server agrees, so don't disagree here.
        row.addEventListener('click', () => hooks.send({ type: 'lobbySit', team, index: i }));
      } else {
        row.style.cursor = 'default';
      }

      row.append(label, tag);
      host.appendChild(row);
    });
  };

  const renderLobby = () => {
    if (!view) return;
    el('lobby-title').textContent = view.name.toUpperCase();
    // A solo room has nobody to hand a code to, so it doesn't show one.
    codeWrap.classList.toggle('hidden', view.offline);
    codeText.textContent = view.code;
    copyLinkBtn.disabled = linkIsLocal;
    inviteHint.textContent = view.offline
      ? ''
      : linkIsLocal
        ? 'you opened the game on localhost, so there is no link worth sharing — ' +
          'send the code, or reopen the game on the address your friends use'
        : inviteLink(view.code);
    renderSlots('humans', view.humans, view.isHost);
    renderSlots('dogs', view.dogs, view.isHost);
    startBtn.style.display = view.isHost ? '' : 'none';

    // Offline is the same room with the parts that need other people removed.
    teams.classList.toggle('solo', view.offline);
    el('lobby-hint').textContent = view.offline
      ? 'click a slot to cycle it CLOSED → BOT · click your own to watch instead'
      : 'click a slot to take it · click its tag to cycle CLOSED → OPEN → BOT';

    // The setting sizes the city that a round *generates*, so once one is up
    // there is nothing left for it to size — the nav grid, the room map and
    // every broadphase grid are already built to the city on screen. The server
    // refuses it while running; the control says so rather than being refused.
    popSlider.disabled = !view.isHost || view.running;
    if (!draggingPop) popSlider.value = String(view.population);
    showPop(draggingPop ? Number(popSlider.value) : view.population);

    el('lobby-notice').textContent = view.notice;
    spectatorRow.dataset.state = view.spectating ? 'spectating' : 'closed';
    spectatorTag.textContent = view.spectating ? 'WATCHING' : 'OFF';
    // Everyone else on the bench, so a full room still reads correctly.
    const others = view.spectators.length - (view.spectating ? 1 : 0);
    spectatorLabel.textContent = others > 0 ? `SPECTATOR · +${others}` : 'SPECTATOR';

    // Pinned to the bottom unless you've scrolled up to read something.
    const atBottom = chatLog.scrollTop + chatLog.clientHeight >= chatLog.scrollHeight - 24;
    chatLog.replaceChildren();
    for (const line of view.chat) {
      const p = document.createElement('div');
      p.className = line.from ? 'chat-line' : 'chat-line system';
      if (line.from) {
        const who = document.createElement('span');
        who.className = 'from';
        who.textContent = `${line.from}: `;
        p.appendChild(who);
      }
      p.appendChild(document.createTextNode(line.text));
      chatLog.appendChild(p);
    }
    if (atBottom) chatLog.scrollTop = chatLog.scrollHeight;
  };

  chatInput.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const text = chatInput.value.trim();
    if (!text) return;
    chatInput.value = '';
    hooks.send({ type: 'lobbyChat', text });
  });

  startBtn.addEventListener('click', () => hooks.send({ type: 'lobbyStart' }));

  // ---- navigation ----
  // Offline skips straight to the room. There is nobody to introduce yourself
  // to, so it doesn't ask for a name — it reuses one if you've given it before.
  el('btn-offline').addEventListener('click', () => {
    if (!name) {
      try {
        name = (localStorage.getItem(NAME_KEY) ?? '').trim().slice(0, NAME_MAX);
      } catch {
        /* nothing remembered */
      }
      if (!name) name = 'PLAYER';
    }
    // **Offline means offline.** The game moves onto a worker thread in this
    // page — no server, no socket, no port — and the lobby is created once it
    // has said hello, because until then there is nothing listening.
    hooks.goOffline(() => {
      hooks.send({ type: 'lobbyCreate', name: 'OFFLINE', gamertag: name, offline: true });
    });
  });

  /**
   * The options screen.
   *
   * Nothing here is sent anywhere — every setting is about how this machine
   * draws the world, never what is in it, so it takes effect on the next frame
   * and needs no round trip and no restart. Each row is a button that cycles
   * its own value; there is no Apply, because there is nothing to apply.
   */
  const optRows = {
    resolution: el<HTMLButtonElement>('opt-resolution'),
    smooth: el<HTMLButtonElement>('opt-smooth'),
    fog: el<HTMLButtonElement>('opt-fog'),
    noFog: el<HTMLButtonElement>('opt-nofog'),
    ground: el<HTMLButtonElement>('opt-ground'),
    vignette: el<HTMLButtonElement>('opt-vignette'),
    blood: el<HTMLButtonElement>('opt-blood'),
    permBlood: el<HTMLButtonElement>('opt-permblood'),
    corpses: el<HTMLButtonElement>('opt-corpses'),
    dogLimits: el<HTMLButtonElement>('opt-doglimits'),
  };

  const drawOptions = (): void => {
    const set = (btn: HTMLButtonElement, text: string, on: boolean): void => {
      const val = btn.querySelector<HTMLSpanElement>('.opt-val');
      if (!val) return;
      val.textContent = text;
      val.classList.toggle('off', !on);
    };
    // Named in pixels rather than as a multiplier, because "1600x900" is a
    // thing a player already knows the size of and "0.83" is not. The number
    // shown is the backbuffer, which is exactly what the row changes — the
    // amount of *world* on screen is the same at every setting.
    const { w, h } = resolutionAt(settings.renderScale);
    set(optRows.resolution, `${w}x${h}`, settings.renderScale >= 1);
    set(optRows.smooth, settings.smoothMotion ? 'ON' : 'OFF', settings.smoothMotion);
    set(optRows.fog, settings.fogDetail === 'full' ? 'FULL' : 'LOW', settings.fogDetail === 'full');
    // Reads as the *state of the fog*, not of the switch: OFF is the notable
    // condition here, so that is what the green is spent on.
    set(optRows.noFog, settings.noFog ? 'FOG OFF' : 'FOG ON', settings.noFog);
    set(optRows.ground, settings.groundDetail ? 'ON' : 'OFF', settings.groundDetail);
    set(optRows.vignette, settings.vignette ? 'ON' : 'OFF', settings.vignette);
    set(optRows.blood, settings.blood ? 'ON' : 'OFF', settings.blood);
    // Dim when the master switch is off — there is nothing for these to do.
    optRows.permBlood.classList.toggle('dim', !settings.blood);
    optRows.corpses.classList.toggle('dim', !settings.blood);
    set(optRows.permBlood, settings.permanentBlood ? 'ON' : 'OFF', settings.permanentBlood);
    set(optRows.corpses, settings.corpses ? 'ON' : 'OFF', settings.corpses);
    // Reads as the state of the *limits*, not of the switch — OFF is the
    // notable condition here, the same wording `NO FOG` uses for the same
    // reason: green is spent on the thing worth noticing.
    set(optRows.dogLimits, settings.dogLimits ? 'ON' : 'OFF', !settings.dogLimits);

    // The presets double as a readout: whichever one you are already on says so.
    el('btn-opt-low').classList.toggle('dim', isLow());
    el('btn-opt-default').classList.toggle('dim', isDefault());
  };

  // Cycles like every other row here rather than being a dropdown: six values
  // is a short enough list to walk, and one control that behaves the same way
  // as the five below it is worth more than a second kind of widget.
  optRows.resolution.addEventListener('click', () => {
    const at = RENDER_SCALES.indexOf(settings.renderScale as (typeof RENDER_SCALES)[number]);
    // A stored value from an older build, or one that has been edited out of
    // the list, lands on -1 and comes back at the start rather than nowhere.
    const next = RENDER_SCALES[(at + 1) % RENDER_SCALES.length];
    applySettings({ renderScale: next });
    drawOptions();
  });
  optRows.smooth.addEventListener('click', () => {
    applySettings({ smoothMotion: !settings.smoothMotion });
    drawOptions();
  });
  optRows.fog.addEventListener('click', () => {
    applySettings({ fogDetail: settings.fogDetail === 'full' ? 'low' : 'full' });
    drawOptions();
  });
  optRows.noFog.addEventListener('click', () => {
    applySettings({ noFog: !settings.noFog });
    drawOptions();
  });
  optRows.ground.addEventListener('click', () => {
    applySettings({ groundDetail: !settings.groundDetail });
    drawOptions();
  });
  optRows.vignette.addEventListener('click', () => {
    applySettings({ vignette: !settings.vignette });
    drawOptions();
  });
  optRows.blood.addEventListener('click', () => {
    applySettings({ blood: !settings.blood });
    drawOptions();
  });
  optRows.permBlood.addEventListener('click', () => {
    if (!settings.blood) return;
    applySettings({ permanentBlood: !settings.permanentBlood });
    drawOptions();
  });
  optRows.corpses.addEventListener('click', () => {
    if (!settings.blood) return;
    applySettings({ corpses: !settings.corpses });
    drawOptions();
  });
  /**
   * **The one row here that is sent anywhere.**
   *
   * Every other setting on this screen is about how this machine draws the
   * world and takes effect on the next frame with nothing to plumb through —
   * that is what makes "no two players can see a different game" true of the
   * rest of them. A cooldown and an unlock requirement are rules about the
   * game, so this one has to reach the server, which is free to refuse it
   * outright: see `World.dogAbilitiesFree`.
   *
   * It is also resent — from `main.ts`'s `onStart`, not from here — because
   * `resetWorld` clears the server's copy on every fresh round, and a player
   * who left this on before clicking START would otherwise find it silently
   * off again.
   */
  optRows.dogLimits.addEventListener('click', () => {
    applySettings({ dogLimits: !settings.dogLimits });
    hooks.send({ type: 'testDogAbilities', free: !settings.dogLimits });
    drawOptions();
  });

  el('btn-opt-low').addEventListener('click', () => {
    applySettings(LOW);
    drawOptions();
  });
  el('btn-opt-default').addEventListener('click', () => {
    applySettings(DEFAULTS);
    drawOptions();
  });

  el('btn-options').addEventListener('click', () => {
    drawOptions();
    show('options');
  });
  el('btn-options-back').addEventListener('click', () => show('title'));

  el('btn-online').addEventListener('click', () => {
    // Before the name screen, so the socket has the time it takes to type one.
    hooks.goOnline();
    askName();
  });
  el('btn-name-back').addEventListener('click', () => show('title'));
  el('btn-online-back').addEventListener('click', askName);
  el('btn-create').addEventListener('click', () => {
    lobbyNameInput.value = `${name}'s lobby`;
    show('create');
    lobbyNameInput.focus();
    lobbyNameInput.select();
  });
  el('btn-create-back').addEventListener('click', () => show('online'));
  el('btn-join').addEventListener('click', () => {
    codeInput.value = '';
    joinError.textContent = '';
    refreshJoinButton();
    show('join');
    codeInput.focus();
  });
  el('btn-join-back').addEventListener('click', () => show('online'));

  /**
   * **Escape is BACK, on every screen that has one.**
   *
   * The BACK button is at the bottom of the screen and OPTIONS is taller than
   * a letterboxed stage on a laptop, so the one control that gets you off it
   * is the one that falls off the bottom. The screens scroll now, which is the
   * real fix — but a key that needs no scrolling to reach is what makes a
   * screen you have landed on by mistake cost nothing, and Escape is already
   * what leaves a round.
   *
   * Each entry is deliberately the *same call* the screen's own button makes
   * rather than a `show` of wherever it came from: `btn-online-back` runs
   * `askName`, which is not merely `show('name')`, and two ways back that
   * differ in what they do is exactly the sort of thing that rots.
   *
   * **The lobby is left out on purpose.** Escape there would be
   * `lobbyLeave` — which despawns you and closes the room behind you if it is
   * yours — and a reflexive keypress must not take four other people's lobby
   * down with it. Nothing is offered for the title screen either: there is
   * nowhere behind it.
   */
  const escapeBack: Partial<Record<Screen, () => void>> = {
    options: () => show('title'),
    name: () => show('title'),
    online: askName,
    create: () => show('online'),
    join: () => show('online'),
  };

  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Escape') return;
    // A round owns Escape once one is up — pause offline, quit online, and
    // `main.ts` gates that on `started`. The shell being hidden is the same
    // fact seen from this side.
    if (shell.classList.contains('hidden')) return;
    const back = escapeBack[current];
    if (!back) return;
    e.preventDefault();
    back();
  });

  el('lobby-back').addEventListener('click', () => {
    // The server sends nothing back for a leave — you already know you left —
    // so the screen change happens here. An offline room came from the title,
    // so that's where LEAVE goes back to.
    const solo = view?.offline === true;
    hooks.send({ type: 'lobbyLeave' });
    view = null;
    show(solo ? 'title' : 'online');
  });

  // An invite skips the title: the guest asked for a specific lobby, so the
  // first thing they see should be the shortest path into it. With a gamertag
  // already remembered that is the lobby itself; without one it is the single
  // field standing in the way.
  if (pendingJoin) {
    try {
      name = (localStorage.getItem(NAME_KEY) ?? '').trim().slice(0, NAME_MAX);
    } catch {
      /* nothing remembered — they get asked */
    }
    if (name) {
      // Put the code where a refusal can land and wait for the socket; the
      // `welcome` handler below is what actually spends it.
      codeInput.value = pendingJoin;
      refreshJoinButton();
      show('join');
    } else {
      askName();
    }
  }

  return {
    reopen() {
      view = null;
      show('title');
      shell.classList.remove('hidden');
    },

    handle(msg) {
      if (msg.type === 'welcome') {
        connected = true;
        showBuild(msg.build);
        const sent = takeInvite();
        if (sent) {
          codeInput.value = sent;
          refreshJoinButton();
          show('join');
        }
      } else if (msg.type === 'lobby') {
        view = msg.lobby;
        renderLobby();
        if (current !== 'lobby') show('lobby');
      } else if (msg.type === 'lobbyError') {
        // A code that found nothing. Stay put and say so — being bounced to
        // another screen for a typo is what makes a code box infuriating.
        joinError.textContent = msg.message;
        if (current === 'join') {
          codeInput.focus();
          codeInput.select();
        }
      } else if (msg.type === 'lobbyLeft') {
        view = null;
        show('online');
        shell.classList.remove('hidden');
        hooks.onEnd();
      } else if (msg.type === 'start') {
        shell.classList.add('hidden');
        hooks.onStart(view?.offline === true);
      }
    },
  };
}
