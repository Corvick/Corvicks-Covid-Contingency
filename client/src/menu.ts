import { LOBBY_DOG_SLOTS, LOBBY_HUMAN_SLOTS } from '../../shared/constants.js';
import type { SlotState } from '../../shared/types.js';

/**
 * The front end: title, gamertag, mode, lobby. It owns nothing about the game
 * itself — it hands back a name and a slot configuration and gets out of the
 * way, so the running game never has to know a menu existed.
 */
export interface LobbyConfig {
  name: string;
  humans: SlotState[];
  dogs: SlotState[];
}

type Team = 'humans' | 'dogs';

/** What the tag button walks a slot through. Your own slot is never in it. */
const CYCLE: SlotState[] = ['closed', 'open', 'bot'];

const NAME_KEY = 'gamertag';
const NAME_MAX = 16;

export function setupMenu(onStart: (config: LobbyConfig) => void): void {
  const shell = document.getElementById('shell') as HTMLDivElement;
  const screens = {
    title: document.getElementById('screen-title') as HTMLDivElement,
    name: document.getElementById('screen-name') as HTMLDivElement,
    online: document.getElementById('screen-online') as HTMLDivElement,
    lobby: document.getElementById('lobby') as HTMLDivElement,
  };

  const show = (which: keyof typeof screens) => {
    for (const [key, el] of Object.entries(screens)) el.classList.toggle('active', key === which);
  };

  // You always occupy exactly one slot, starting at the top of the officers.
  const slots: Record<Team, SlotState[]> = {
    humans: Array.from({ length: LOBBY_HUMAN_SLOTS }, (_, i) => (i === 0 ? 'player' : 'closed')),
    dogs: Array.from({ length: LOBBY_DOG_SLOTS }, () => 'closed'),
  };
  let name = '';

  const hosts: Record<Team, HTMLDivElement> = {
    humans: document.getElementById('slots-humans') as HTMLDivElement,
    dogs: document.getElementById('slots-dogs') as HTMLDivElement,
  };

  /** Move into a slot, leaving the one you were in standing open behind you. */
  const takeSlot = (team: Team, index: number) => {
    for (const t of ['humans', 'dogs'] as Team[]) {
      const at = slots[t].indexOf('player');
      if (at >= 0) slots[t][at] = 'open';
    }
    slots[team][index] = 'player';
    renderAll();
  };

  const render = (team: Team) => {
    const host = hosts[team];
    host.replaceChildren();
    slots[team].forEach((state, i) => {
      const row = document.createElement('div');
      row.className = 'slot';
      row.dataset.state = state;

      const label = document.createElement('span');
      label.textContent = `${team === 'humans' ? 'OFFICER' : 'DOG'} ${i + 1}`;

      const tag = document.createElement('button');
      tag.className = 'tag';
      tag.textContent = state === 'player' ? name.toUpperCase() : state.toUpperCase();
      // You can't close or bot the seat you're sitting in.
      tag.disabled = state === 'player';
      tag.addEventListener('click', (e) => {
        e.stopPropagation(); // the row underneath would try to seat you
        slots[team][i] = CYCLE[(CYCLE.indexOf(slots[team][i]) + 1) % CYCLE.length];
        render(team);
      });

      // A closed slot isn't yours to sit in until it's been opened; anything
      // else you can move into, bots included — you take their place.
      if (state === 'open' || state === 'bot') {
        row.addEventListener('click', () => takeSlot(team, i));
      }

      row.append(label, tag);
      host.appendChild(row);
    });
  };

  const renderAll = () => {
    render('humans');
    render('dogs');
  };

  // ---- gamertag ----
  const input = document.getElementById('name-input') as HTMLInputElement;
  const okBtn = document.getElementById('btn-name-ok') as HTMLButtonElement;

  const typed = () => input.value.trim().slice(0, NAME_MAX);
  const refreshOk = () => okBtn.classList.toggle('dim', typed().length === 0);

  const confirmName = () => {
    const next = typed();
    if (!next) return;
    name = next;
    // Remembered so it's already filled in next time. Private browsing and
    // locked-down storage both throw here, and neither is worth a crash.
    try {
      localStorage.setItem(NAME_KEY, name);
    } catch {
      /* not remembered, but still usable this session */
    }
    renderAll();
    show('online');
  };

  input.addEventListener('input', refreshOk);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') confirmName();
  });
  okBtn.addEventListener('click', confirmName);

  const askName = () => {
    let remembered = '';
    try {
      remembered = localStorage.getItem(NAME_KEY) ?? '';
    } catch {
      /* nothing remembered */
    }
    input.value = remembered;
    refreshOk();
    show('name');
    input.focus();
    input.select();
  };

  // ---- wiring ----
  document.getElementById('btn-online')!.addEventListener('click', askName);
  document.getElementById('btn-name-back')!.addEventListener('click', () => show('title'));
  document.getElementById('btn-create')!.addEventListener('click', () => show('lobby'));
  document.getElementById('btn-online-back')!.addEventListener('click', askName);
  document.getElementById('lobby-back')!.addEventListener('click', () => show('online'));

  document.getElementById('lobby-start')!.addEventListener('click', () => {
    shell.classList.add('hidden');
    onStart({ name, humans: slots.humans, dogs: slots.dogs });
  });

  renderAll();
}
