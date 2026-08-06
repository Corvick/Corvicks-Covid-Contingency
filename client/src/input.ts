import type { InputState } from '../../shared/types.js';

const keyMap: Record<string, keyof InputState> = {
  KeyW: 'up',
  ArrowUp: 'up',
  KeyS: 'down',
  ArrowDown: 'down',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
};

export interface InputTracker {
  state: InputState;
  /** Mouse position in canvas pixel space. */
  mouseX: number;
  mouseY: number;
  shooting: boolean;
  sprint: boolean;
  /** True while E is held. */
  interact: boolean;
  /** Slot key pressed since the last poll, or -1. */
  slotPressed: number;
}

export function trackInput(canvas: HTMLCanvasElement): InputTracker {
  const tracker: InputTracker = {
    state: { up: false, down: false, left: false, right: false },
    mouseX: canvas.width / 2,
    mouseY: canvas.height / 2,
    shooting: false,
    sprint: false,
    interact: false,
    slotPressed: -1,
  };

  window.addEventListener('keydown', (e) => {
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') tracker.sprint = true;
    if (e.code === 'KeyE') tracker.interact = true;

    // Digit0 is the pistol; 1-9 walk the rest of the inventory.
    if (e.code.startsWith('Digit')) {
      const n = Number(e.code.slice(5));
      if (!Number.isNaN(n)) tracker.slotPressed = n;
    }

    const key = keyMap[e.code];
    if (!key) return;
    tracker.state[key] = true;
    e.preventDefault(); // stop arrow keys scrolling the page
  });

  window.addEventListener('keyup', (e) => {
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') tracker.sprint = false;
    if (e.code === 'KeyE') tracker.interact = false;
    const key = keyMap[e.code];
    if (key) tracker.state[key] = false;
  });

  function updateMouse(e: MouseEvent) {
    const rect = canvas.getBoundingClientRect();
    // The canvas is letterboxed by CSS, so map client px back to canvas px.
    tracker.mouseX = ((e.clientX - rect.left) / rect.width) * canvas.width;
    tracker.mouseY = ((e.clientY - rect.top) / rect.height) * canvas.height;
  }

  canvas.addEventListener('mousemove', updateMouse);
  canvas.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    updateMouse(e);
    tracker.shooting = true;
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) tracker.shooting = false;
  });
  window.addEventListener('blur', () => {
    tracker.shooting = false;
    tracker.sprint = false;
    tracker.interact = false;
    tracker.state.up = tracker.state.down = tracker.state.left = tracker.state.right = false;
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  return tracker;
}
