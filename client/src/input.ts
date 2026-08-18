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
  /**
   * Raw right mouse. A tap and a hold mean different things now — a tap works
   * the bipod or bashes with the shield, a hold slings the shield onto your
   * back — so the client reports the button and the server decides what it
   * meant, the same way E already works at a door.
   */
  rightDown: boolean;
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
    rightDown: false,
  };

  /**
   * True while a text field has the keyboard — the lobby's chat and name
   * boxes. WASD is preventDefault'd below, so without this you cannot type a
   * "w" into chat at all.
   */
  function typing(e: KeyboardEvent): boolean {
    const target = e.target as HTMLElement | null;
    if (!target) return false;
    return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
  }

  window.addEventListener('keydown', (e) => {
    if (typing(e)) return;
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

  /**
   * Where the canvas sits on the page, cached.
   *
   * `getBoundingClientRect` is a *layout read*. Called from the mousemove
   * handler it forced a synchronous reflow on every single mouse event — and
   * because the HUD rewrites its `innerHTML` every frame, the layout was always
   * dirty and so the reflow always actually ran. Moving the mouse across a
   * spectator view was therefore laying out the page a hundred times a second.
   *
   * Measured in a 41s trace: the frame callback itself is 6.5ms median and only
   * 1 frame in 1526 ran over 16.7ms, yet frames arrived 25ms apart and the
   * longest main-thread tasks were input handling — 228ms, 96ms, 64ms — with
   * `Layout` and `UpdateLayoutTree` inside them. Chrome's own "Forced reflow"
   * insight flagged it.
   *
   * The rect only changes when the window does, so it is read once and then on
   * resize. `ResizeObserver` covers the letterboxing, which changes the canvas's
   * displayed size without a window resize event of its own.
   */
  let rect = canvas.getBoundingClientRect();
  const refreshRect = (): void => {
    rect = canvas.getBoundingClientRect();
  };
  window.addEventListener('resize', refreshRect);
  // A scroll moves the canvas without resizing it; capture so it fires for any
  // scrolling ancestor rather than only the window.
  window.addEventListener('scroll', refreshRect, true);
  new ResizeObserver(refreshRect).observe(canvas);

  function updateMouse(e: MouseEvent) {
    // The canvas is letterboxed by CSS, so map client px back to canvas px.
    tracker.mouseX = ((e.clientX - rect.left) / rect.width) * canvas.width;
    tracker.mouseY = ((e.clientY - rect.top) / rect.height) * canvas.height;
  }

  canvas.addEventListener('mousemove', updateMouse);
  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 2) {
      // The server ignores this unless there is something to do with it, so a
      // stray right-click with the pistol out costs nothing.
      tracker.rightDown = true;
      return;
    }
    if (e.button !== 0) return;
    updateMouse(e);
    tracker.shooting = true;
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) tracker.shooting = false;
    if (e.button === 2) tracker.rightDown = false;
  });
  window.addEventListener('blur', () => {
    tracker.shooting = false;
    tracker.rightDown = false;
    tracker.sprint = false;
    tracker.interact = false;
    tracker.state.up = tracker.state.down = tracker.state.left = tracker.state.right = false;
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  return tracker;
}
