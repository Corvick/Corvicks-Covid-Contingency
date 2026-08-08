import type {
  ClientMessage,
  LobbySummary,
  LobbyTeam,
  LobbyView,
  ServerMessage,
  SlotWire,
} from '../../shared/types.js';

/**
 * The front end: title, gamertag, create or browse, lobby. It owns no game
 * state and no lobby state — the server holds the lobby and pushes it back on
 * every change, and this just draws whatever arrived and forwards clicks.
 */
export interface MenuHooks {
  send: (msg: ClientMessage) => void;
  /** Our lobby's round has begun; the game takes the screen from here. */
  onStart: () => void;
}

export interface Menu {
  /** Feed every server message through here. Non-lobby ones are ignored. */
  handle: (msg: ServerMessage) => void;
}

const NAME_KEY = 'gamertag';
const NAME_MAX = 16;

export function setupMenu(hooks: MenuHooks): Menu {
  const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const shell = el<HTMLDivElement>('shell');

  const screens = {
    title: el<HTMLDivElement>('screen-title'),
    name: el<HTMLDivElement>('screen-name'),
    online: el<HTMLDivElement>('screen-online'),
    create: el<HTMLDivElement>('screen-create'),
    join: el<HTMLDivElement>('screen-join'),
    lobby: el<HTMLDivElement>('lobby'),
  };
  type Screen = keyof typeof screens;

  let current: Screen = 'title';
  const show = (which: Screen) => {
    current = which;
    for (const [key, node] of Object.entries(screens)) node.classList.toggle('active', key === which);
  };

  let name = '';
  let lobbies: LobbySummary[] = [];
  let view: LobbyView | null = null;

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
    hooks.send({
      type: 'lobbyCreate',
      name: lobbyNameInput.value.trim() || `${name}'s lobby`,
      gamertag: name,
    });
  };
  lobbyNameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doCreate();
  });
  el('btn-create-go').addEventListener('click', doCreate);

  // ---- browse ----
  const listHost = el<HTMLDivElement>('lobby-list');

  const renderList = () => {
    listHost.replaceChildren();
    if (lobbies.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'empty';
      empty.textContent = 'no lobbies yet — create one';
      listHost.appendChild(empty);
      return;
    }
    for (const lobby of lobbies) {
      const row = document.createElement('div');
      row.className = 'lobby-row';

      const title = document.createElement('span');
      title.textContent = lobby.name;

      const meta = document.createElement('span');
      meta.className = 'meta';
      meta.textContent = `${lobby.host} · ${lobby.players}/${lobby.capacity}`;
      if (lobby.running) {
        const running = document.createElement('span');
        running.className = 'running';
        running.textContent = ' · IN PROGRESS';
        meta.appendChild(running);
      }

      row.append(title, meta);
      row.addEventListener('click', () =>
        hooks.send({ type: 'lobbyJoin', id: lobby.id, gamertag: name }),
      );
      listHost.appendChild(row);
    }
  };

  el('btn-refresh').addEventListener('click', () => hooks.send({ type: 'lobbyList' }));

  // ---- lobby ----
  const chatLog = el<HTMLDivElement>('chat-log');
  const chatInput = el<HTMLInputElement>('chat-input');
  const startBtn = el<HTMLButtonElement>('lobby-start');
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

      // A closed seat isn't yours to take until it's been opened, and there's
      // no point clicking one someone is already in. Taking a bot's seat is
      // fair game for anyone — the server agrees, so don't disagree here.
      if (seat.state === 'open' || seat.state === 'bot') {
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
    renderSlots('humans', view.humans, view.isHost);
    renderSlots('dogs', view.dogs, view.isHost);
    startBtn.style.display = view.isHost ? '' : 'none';

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
  el('btn-online').addEventListener('click', askName);
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
    hooks.send({ type: 'lobbyList' });
    renderList();
    show('join');
  });
  el('btn-join-back').addEventListener('click', () => show('online'));
  el('lobby-back').addEventListener('click', () => hooks.send({ type: 'lobbyLeave' }));

  return {
    handle(msg) {
      if (msg.type === 'lobbies') {
        lobbies = msg.lobbies;
        if (current === 'join') renderList();
      } else if (msg.type === 'lobby') {
        view = msg.lobby;
        renderLobby();
        if (current !== 'lobby') show('lobby');
      } else if (msg.type === 'lobbyLeft') {
        view = null;
        show('online');
      } else if (msg.type === 'start') {
        shell.classList.add('hidden');
        hooks.onStart();
      }
    },
  };
}
