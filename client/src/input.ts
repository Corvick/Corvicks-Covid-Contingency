import type { InputState } from '../../shared/types.js';
import { VIEWPORT_WIDTH, VIEWPORT_HEIGHT } from '../../shared/constants.js';

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

/**
 * The arrows on their own, tracked separately from `state`.
 *
 * **A spectator's camera pans on these and not on WASD**, because W, A, S and D
 * are four of the fifteen grid hotkeys on the command card — a watcher pressing
 * S to look further down the street would be pressing the second button of the
 * bottom row. A player is unaffected: `state` still takes both, and a body is
 * driven with WASD as it always was.
 */
const arrowMap: Record<string, keyof InputState> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
};

/**
 * How deep the edge-scroll band is, in layout pixels, and how slowly the camera
 * creeps at the inner lip of it.
 *
 * Ramped rather than flat because the band has to be wide enough to hit without
 * aiming — and a wide band at full speed means the camera lurches away the
 * moment you reach for anything near the edge of the screen. At the inner lip
 * it barely moves; hard against the edge it matches a held arrow key.
 */
export const EDGE_SCROLL_BAND = 48;
export const EDGE_SCROLL_MIN = 0.22;

/** How hard one edge pushes, from a distance to it in layout pixels. */
export function edgePush(near: number): number {
  if (near >= EDGE_SCROLL_BAND) return 0;
  const depth = 1 - Math.max(0, near) / EDGE_SCROLL_BAND;
  return EDGE_SCROLL_MIN + (1 - EDGE_SCROLL_MIN) * depth;
}

/**
 * Which way the spectator camera should be moving, and how fast, as a vector no
 * longer than one.
 *
 * **Pure, and exported, so it can be measured without a frame.** rAF is
 * throttled to nothing while the browser pane is not compositing, so the camera
 * cannot be driven and watched from there; this is the whole of the decision
 * with the drawing and the clock taken out of it. Same split as
 * `commandCardSlots` against `drawCommandCard`, and `flameStreamSpine` against
 * the stream.
 *
 * `edges` is false while the pointer is off the canvas or resting on the
 * command card — see `panSpectator` for why both matter.
 */
export function spectatorPan(
  arrows: InputState,
  mouseX: number,
  mouseY: number,
  edges: boolean,
): { x: number; y: number } {
  let dx = 0;
  let dy = 0;
  if (arrows.up) dy -= 1;
  if (arrows.down) dy += 1;
  if (arrows.left) dx -= 1;
  if (arrows.right) dx += 1;

  if (edges) {
    dx -= edgePush(mouseX);
    dx += edgePush(VIEWPORT_WIDTH - 1 - mouseX);
    dy -= edgePush(mouseY);
    dy += edgePush(VIEWPORT_HEIGHT - 1 - mouseY);
  }

  // **Clamped to one, not normalised to one.** A held key contributes a whole
  // unit, and dividing by the length is what keeps a diagonal the same speed as
  // a straight line; an edge push contributes a *fraction*, and dividing that by
  // its own length would scale it straight back up to full speed and throw the
  // ramp away. So the vector is only shortened when it is longer than one —
  // which is the two-key diagonal, and nothing else.
  const len = Math.max(1, Math.hypot(dx, dy));
  return { x: dx / len, y: dy / len };
}

export interface InputTracker {
  state: InputState;
  /** The arrows alone — see `arrowMap`. What the spectator camera reads. */
  arrows: InputState;
  /**
   * True while the pointer is actually over the canvas.
   *
   * Edge scrolling needs it and cannot be written without it: `mousemove` is
   * bound to the canvas, so a pointer that leaves the window leaves `mouseX`
   * and `mouseY` frozen at the last place it was — which, having left by the
   * edge, is *inside the scroll band*. The camera would then slide in that
   * direction for as long as the pointer was away, and come back to a view
   * nobody asked for.
   */
  pointerOver: boolean;
  /**
   * Mouse position in *viewport* space — 0..1920 by 0..1080, whatever the
   * backbuffer is actually painted at. See `updateMouse`.
   */
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
    arrows: { up: false, down: false, left: false, right: false },
    pointerOver: false,
    mouseX: VIEWPORT_WIDTH / 2,
    mouseY: VIEWPORT_HEIGHT / 2,
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

    const arrow = arrowMap[e.code];
    if (arrow) tracker.arrows[arrow] = true;

    const key = keyMap[e.code];
    if (!key) return;
    tracker.state[key] = true;
    e.preventDefault(); // stop arrow keys scrolling the page
  });

  window.addEventListener('keyup', (e) => {
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') tracker.sprint = false;
    if (e.code === 'KeyE') tracker.interact = false;
    const arrow = arrowMap[e.code];
    if (arrow) tracker.arrows[arrow] = false;
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
    // The canvas is letterboxed by CSS, so map client px back to the viewport.
    //
    // **`VIEWPORT_WIDTH`, not `canvas.width`.** Those are the same number only
    // at a render scale of 1 — the backbuffer is however many real pixels the
    // player has asked the frame to be painted at, while everything that reads
    // the mouse (the camera pan, the wheel's hit test, the beacon map, the
    // scope push) is written in layout units. Reading the backbuffer here
    // would make the crosshair drift further from the cursor the further the
    // scale is from 1, and in exactly the settings a struggling machine picks.
    tracker.mouseX = ((e.clientX - rect.left) / rect.width) * VIEWPORT_WIDTH;
    tracker.mouseY = ((e.clientY - rect.top) / rect.height) * VIEWPORT_HEIGHT;
  }

  canvas.addEventListener('mousemove', (e) => {
    tracker.pointerOver = true;
    updateMouse(e);
  });
  canvas.addEventListener('mouseenter', () => {
    tracker.pointerOver = true;
  });
  canvas.addEventListener('mouseleave', () => {
    tracker.pointerOver = false;
  });
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
    tracker.arrows.up = tracker.arrows.down = tracker.arrows.left = tracker.arrows.right = false;
    // Alt-tabbing away with the pointer near an edge would otherwise leave the
    // camera sliding for as long as the window was in the background.
    tracker.pointerOver = false;
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  return tracker;
}
