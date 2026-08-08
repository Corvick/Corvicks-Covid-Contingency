import { LOBBY_DOG_SLOTS, LOBBY_HUMAN_SLOTS } from '../../shared/constants.js';
import type { SlotState } from '../../shared/types.js';

/**
 * The front end: title, mode, lobby. It owns nothing about the game itself —
 * it hands back a slot configuration and gets out of the way, so the running
 * game never has to know a menu existed.
 */
export interface LobbyConfig {
  humans: SlotState[];
  dogs: SlotState[];
}

const CYCLE: SlotState[] = ['closed', 'open', 'bot'];

export function setupMenu(onStart: (config: LobbyConfig) => void): void {
  const shell = document.getElementById('shell') as HTMLDivElement;
  const screens = {
    title: document.getElementById('screen-title') as HTMLDivElement,
    online: document.getElementById('screen-online') as HTMLDivElement,
    lobby: document.getElementById('lobby') as HTMLDivElement,
  };

  const show = (which: keyof typeof screens) => {
    for (const [name, el] of Object.entries(screens)) {
      el.classList.toggle('active', name === which);
    }
  };

  // The host's first slot is themselves, so it starts open rather than closed.
  const config: LobbyConfig = {
    humans: Array.from({ length: LOBBY_HUMAN_SLOTS }, (_, i) => (i === 0 ? 'open' : 'closed')),
    dogs: Array.from({ length: LOBBY_DOG_SLOTS }, () => 'closed'),
  };

  const render = (team: 'humans' | 'dogs', host: HTMLDivElement) => {
    host.replaceChildren();
    config[team].forEach((state, i) => {
      const row = document.createElement('button');
      row.className = 'slot';
      row.dataset.state = state;

      const label = document.createElement('span');
      label.textContent = `${team === 'humans' ? 'OFFICER' : 'DOG'} ${i + 1}`;
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = state.toUpperCase();
      row.append(label, tag);

      row.addEventListener('click', () => {
        const next = CYCLE[(CYCLE.indexOf(config[team][i]) + 1) % CYCLE.length];
        config[team][i] = next;
        render(team, host);
      });
      host.appendChild(row);
    });
  };

  const humanSlots = document.getElementById('slots-humans') as HTMLDivElement;
  const dogSlots = document.getElementById('slots-dogs') as HTMLDivElement;
  render('humans', humanSlots);
  render('dogs', dogSlots);

  document.getElementById('btn-online')!.addEventListener('click', () => show('online'));
  document.getElementById('btn-create')!.addEventListener('click', () => show('lobby'));
  document.getElementById('btn-online-back')!.addEventListener('click', () => show('title'));
  document.getElementById('lobby-back')!.addEventListener('click', () => show('online'));

  document.getElementById('lobby-start')!.addEventListener('click', () => {
    shell.classList.add('hidden');
    onStart(config);
  });
}
