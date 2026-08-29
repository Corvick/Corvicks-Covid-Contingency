/**
 * Spectator-RTS drawing rig. A canvas and nothing else — no socket and no port,
 * so it leaves a game on 8080 alone.
 *
 * Two claims, and neither can be settled by looking. rAF is throttled to
 * nothing while the browser pane is not compositing, so no frame of a real
 * round can be put on screen from here; `getImageData` needs no compositing at
 * all, which is what turns "it looks right" into a number.
 *
 *  1. **The spectator's pointer is small enough to point at a card button.**
 *     The gunsight is sized for laying a weapon on a body; a command card slot
 *     is 46 layout pixels across, and at full size the mark spans 40 of them —
 *     so the pointer very nearly covered whichever button it was over. The
 *     reading is the mark's own span against the slot, and how much of the
 *     button's icon survives underneath it.
 *  2. **A wall that has been ordered and is not there yet is drawn where it
 *     will stand**, distinctly from one that is standing. The reading is ink
 *     at the site, no ink past the wall's own footprint, and the walking and
 *     stacking treatments differing from each other and from a built wall.
 *  3. **The grid hotkey is printed on the button it presses**, and the grid
 *     lies over the card in reading order. A binding nobody can see is a
 *     binding nobody uses, and the letter's position on the card *is* the
 *     mnemonic — so it has to be in the slot, not in a list somewhere else.
 *
 * And the spectator camera, which is not a drawing at all but cannot be watched
 * either: rAF is throttled to nothing here, so `spectatorPan` was split out
 * pure for exactly this. The readings are the arrows, the edge band's ramp, and
 * the two cases that switch it off.
 *
 * Everything goes through the real `drawCrosshair`, `drawCommandCard`,
 * `commandCardSlots`, `drawBuildSites` and `drawBarricades`. Results land on
 * `window.rigResult`; open `/rtsrig.html` on the dev server to look.
 */
import {
  BARRICADE_HALF_DEPTH,
  BARRICADE_HALF_WIDTH,
  GROUND_COLOR,
  VIEWPORT_HEIGHT,
  VIEWPORT_WIDTH,
} from '../../shared/constants.js';
import {
  CARD_GRID_KEYS,
  cardSlotForKey,
  commandCardButtons,
  commandCardSlots,
  drawBarricades,
  drawBuildSites,
  drawCommandCard,
  drawCrosshair,
} from './render.js';
import { EDGE_SCROLL_BAND, EDGE_SCROLL_MIN, spectatorPan } from './input.js';

const canvas = document.getElementById('rig') as HTMLCanvasElement;
const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

/** The spectator's pointer scale, kept in step with `main.ts` by hand. */
const CURSOR_SCALE = 0.6;

interface Result {
  errors: string[];
  cursor: {
    slot: number;
    /** Span of the drawn mark, in layout pixels, at each scale. */
    fullSpan: number;
    smallSpan: number;
    /** Ink the button's own icon still puts down with the pointer over it. */
    iconPxAlone: number;
    iconPxUnderFull: number;
    iconPxUnderSmall: number;
  };
  grid: {
    /** Every button on both pages, and the key printed in its slot. */
    buttons: string[];
    /** Slots that show a letter, against the slots that hold a button. */
    lettered: number;
    withButton: number;
    /** An empty slot must not be lettered — the card would look full. */
    letteredEmpty: number;
  };
  pan: {
    /** Arrow keys, one and two at a time. */
    up: string;
    upLeft: string;
    /** The edge band, sampled from the inner lip to hard against the edge. */
    edgeRamp: number[];
    /** Just inside the band, and one pixel outside it. */
    justIn: number;
    justOut: number;
    /** Pointer off the canvas, or resting on the card. */
    edgesOff: string;
  };
  build: {
    /** Ink inside the wall's footprint, per treatment. */
    walkingPx: number;
    stackingPx: number;
    builtPx: number;
    /** Ink outside the footprint — a ghost must not claim ground it will not. */
    walkingOutsidePx: number;
    /** Mean colour at the centre of each, so the three read as three things. */
    walkingRgb: string;
    stackingRgb: string;
    builtRgb: string;
  };
}

const result: Result = {
  errors: [],
  cursor: {
    slot: 0,
    fullSpan: 0,
    smallSpan: 0,
    iconPxAlone: 0,
    iconPxUnderFull: 0,
    iconPxUnderSmall: 0,
  },
  grid: { buttons: [], lettered: 0, withButton: 0, letteredEmpty: 0 },
  pan: { up: '', upLeft: '', edgeRamp: [], justIn: 0, justOut: 0, edgesOff: '' },
  build: {
    walkingPx: 0,
    stackingPx: 0,
    builtPx: 0,
    walkingOutsidePx: 0,
    walkingRgb: '',
    stackingRgb: '',
    builtRgb: '',
  },
};

function clear(): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = GROUND_COLOR;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

/**
 * Ink in a box, and how far it spreads.
 *
 * **One `getImageData` for the whole box, never one per sample.** A per-pixel
 * readback is a forced GPU round trip each time, which is the trap
 * `paintbench.ts` documents and which hung an earlier rig outright.
 */
function inkIn(
  x: number,
  y: number,
  w: number,
  h: number,
): { px: number; minX: number; maxX: number; minY: number; maxY: number; mean: string } {
  const d = ctx.getImageData(x, y, w, h).data;
  let px = 0;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let r = 0;
  let g = 0;
  let b = 0;
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const o = (j * w + i) * 4;
      // Anything meaningfully off the road counts as ink. The road is very dark
      // and everything drawn here is amber or pale, so a low threshold is safe
      // and an antialiased skirt is honestly part of the mark.
      const off =
        Math.abs(d[o] - 0x1b) + Math.abs(d[o + 1] - 0x1d) + Math.abs(d[o + 2] - 0x20);
      if (off <= 24) continue;
      px++;
      r += d[o];
      g += d[o + 1];
      b += d[o + 2];
      if (i < minX) minX = i;
      if (i > maxX) maxX = i;
      if (j < minY) minY = j;
      if (j > maxY) maxY = j;
    }
  }
  const mean = px === 0 ? '-' : `${Math.round(r / px)},${Math.round(g / px)},${Math.round(b / px)}`;
  return { px, minX, maxX, minY, maxY, mean };
}

// ------------------------------------------------------------- the pointer

/**
 * The mark's own span, measured in a box far larger than it can possibly be so
 * the reading is the drawing rather than the box.
 */
function crosshairSpan(scale: number): number {
  clear();
  drawCrosshair(ctx, 120, 120, true, scale);
  const box = inkIn(20, 20, 200, 200);
  if (box.px === 0) return 0;
  return Math.max(box.maxX - box.minX, box.maxY - box.minY) + 1;
}

function cursorSuite(): void {
  const { slots } = commandCardSlots(VIEWPORT_WIDTH, VIEWPORT_HEIGHT);
  const slot = slots[0];
  result.cursor.slot = slot.w;
  result.cursor.fullSpan = crosshairSpan(1);
  result.cursor.smallSpan = crosshairSpan(CURSOR_SCALE);

  // The build page's sandbag button, and how much of it survives the pointer.
  const cx = slot.x + slot.w / 2;
  const cy = slot.y + slot.h / 2;

  clear();
  drawCommandCard(ctx, 'build', 3, 3, 0, VIEWPORT_WIDTH, VIEWPORT_HEIGHT);
  const alone = inkIn(slot.x, slot.y, slot.w, slot.h).px;
  result.cursor.iconPxAlone = alone;

  clear();
  drawCommandCard(ctx, 'build', 3, 3, 0, VIEWPORT_WIDTH, VIEWPORT_HEIGHT);
  drawCrosshair(ctx, cx, cy, true, 1);
  result.cursor.iconPxUnderFull = alone - hidden(slot, cx, cy, 1);

  clear();
  drawCommandCard(ctx, 'build', 3, 3, 0, VIEWPORT_WIDTH, VIEWPORT_HEIGHT);
  drawCrosshair(ctx, cx, cy, true, CURSOR_SCALE);
  result.cursor.iconPxUnderSmall = alone - hidden(slot, cx, cy, CURSOR_SCALE);

  if (result.cursor.smallSpan >= result.cursor.slot) {
    result.errors.push(
      `the pointer is ${result.cursor.smallSpan}px across a ${result.cursor.slot}px slot`,
    );
  }
  if (result.cursor.smallSpan >= result.cursor.fullSpan) {
    result.errors.push('the small pointer is no smaller than the full one');
  }
  if (result.cursor.smallSpan === 0) result.errors.push('the small pointer drew nothing at all');
}

/**
 * How much of the button the mark sits on top of.
 *
 * Counted as the mark's own footprint inside the slot rather than by
 * differencing two images: the mark is amber over an amber icon, so a plain
 * pixel diff undercounts wherever the two happen to agree, which is most of it.
 */
function hidden(
  slot: { x: number; y: number; w: number; h: number },
  cx: number,
  cy: number,
  scale: number,
): number {
  clear();
  drawCrosshair(ctx, cx, cy, true, scale);
  return inkIn(slot.x, slot.y, slot.w, slot.h).px;
}

// -------------------------------------------------------------- the ghosts

function buildSuite(): void {
  const view = { x: 0, y: 0, w: canvas.width, h: canvas.height };
  const at = { x: 300, y: 300 };
  const pad = 14;
  const bx = at.x - BARRICADE_HALF_WIDTH - pad;
  const by = at.y - BARRICADE_HALF_DEPTH - pad;
  const bw = (BARRICADE_HALF_WIDTH + pad) * 2;
  const bh = (BARRICADE_HALF_DEPTH + pad) * 2;

  // The clock is passed in, so the walking treatment's breathing is sampled at
  // a fixed phase rather than at whenever the rig happened to run.
  const site = { id: 'grey-0', x: at.x, y: at.y, angle: 0 };

  clear();
  drawBuildSites(ctx, [site], view, 0);
  const walking = inkIn(bx, by, bw, bh);
  result.build.walkingPx = walking.px;
  result.build.walkingRgb = walking.mean;

  // Ground either side of the footprint, well clear of it: a ghost that claimed
  // ground it will not occupy would be promising a wall in the wrong place.
  const outside = inkIn(at.x - 260, at.y - 120, 160, 240);
  result.build.walkingOutsidePx = outside.px;

  clear();
  drawBuildSites(ctx, [{ ...site, working: true }], view, 0);
  const stacking = inkIn(bx, by, bw, bh);
  result.build.stackingPx = stacking.px;
  result.build.stackingRgb = stacking.mean;

  clear();
  drawBarricades(
    ctx,
    [
      {
        x: at.x,
        y: at.y,
        angle: 0,
        hw: BARRICADE_HALF_WIDTH,
        hh: BARRICADE_HALF_DEPTH,
        hp: 1,
      },
    ],
    view,
  );
  const built = inkIn(bx, by, bw, bh);
  result.build.builtPx = built.px;
  result.build.builtRgb = built.mean;

  if (walking.px === 0) result.errors.push('a walking ghost drew nothing');
  if (stacking.px === 0) result.errors.push('a stacking ghost drew nothing');
  if (outside.px > 0) result.errors.push(`a ghost put ${outside.px}px outside its own footprint`);
  if (walking.mean === stacking.mean) {
    result.errors.push('walking and stacking are drawn identically');
  }
  if (stacking.mean === built.mean) {
    result.errors.push('a ghost is drawn the same as a wall that is standing');
  }
}

// ------------------------------------------------------- the grid hotkeys

/**
 * The letter, looked for in the slot's own bottom-left corner and **by its
 * colour**, not by being different from the road.
 *
 * Two things make the obvious probe wrong, and the rig reported *27 empty slots
 * are lettered* before both were fixed. The corner has to be the reading rather
 * than the whole slot, because an icon fills the middle of every button and
 * would answer "is there ink here" on its own. And "ink" cannot mean "unlike
 * the road": the card paints a panel and every slot a fill over it, so an empty
 * slot is already 34/255 off the road before anything is drawn in it. What is
 * actually being looked for is amber glyph, and the only other thing in that
 * corner is the slot's own grey-blue border.
 */
function letterInSlot(slot: { x: number; y: number; w: number; h: number }): number {
  const d = ctx.getImageData(slot.x + 3, slot.y + slot.h - 14, 11, 11).data;
  let px = 0;
  for (let o = 0; o < d.length; o += 4) {
    if (d[o] > 110 && d[o] > d[o + 1] + 25 && d[o + 1] > d[o + 2] + 15) px++;
  }
  return px;
}

function gridSuite(): void {
  const { slots } = commandCardSlots(VIEWPORT_WIDTH, VIEWPORT_HEIGHT);

  for (const page of ['root', 'build'] as const) {
    clear();
    drawCommandCard(ctx, page, 3, 3, -1, VIEWPORT_WIDTH, VIEWPORT_HEIGHT);
    const buttons = commandCardButtons(page, 3);
    for (const b of buttons) {
      result.grid.buttons.push(`${page}/${b.id}=${CARD_GRID_KEYS[b.slot].slice(3)}`);
      result.grid.withButton++;
      if (letterInSlot(slots[b.slot]) > 0) result.grid.lettered++;
    }
    for (let i = 0; i < slots.length; i++) {
      if (buttons.some((b) => b.slot === i)) continue;
      if (letterInSlot(slots[i]) > 0) result.grid.letteredEmpty++;
    }
  }

  if (CARD_GRID_KEYS.length !== slots.length) {
    result.errors.push(`${CARD_GRID_KEYS.length} grid keys for ${slots.length} slots`);
  }
  if (new Set(CARD_GRID_KEYS).size !== CARD_GRID_KEYS.length) {
    result.errors.push('two slots share a grid key');
  }
  // Reading order: the key for a slot has to be the slot the key names, or the
  // one thing a grid binding promises — that the keyboard is the card — is
  // false and every letter on screen is a lie.
  for (let i = 0; i < CARD_GRID_KEYS.length; i++) {
    if (cardSlotForKey(CARD_GRID_KEYS[i]) !== i) result.errors.push(`key ${i} maps to another slot`);
  }
  if (result.grid.lettered !== result.grid.withButton) {
    result.errors.push(`${result.grid.lettered} of ${result.grid.withButton} buttons show their key`);
  }
  if (result.grid.letteredEmpty > 0) {
    result.errors.push(`${result.grid.letteredEmpty} empty slots are lettered`);
  }
}

// ------------------------------------------------------------- the camera

const NO_ARROWS = { up: false, down: false, left: false, right: false };
const f3 = (v: { x: number; y: number }): string => `${v.x.toFixed(3)},${v.y.toFixed(3)}`;
/** Well away from any edge, so a reading is the keys and nothing else. */
const MID_X = VIEWPORT_WIDTH / 2;
const MID_Y = VIEWPORT_HEIGHT / 2;

function panSuite(): void {
  result.pan.up = f3(spectatorPan({ ...NO_ARROWS, up: true }, MID_X, MID_Y, true));
  result.pan.upLeft = f3(
    spectatorPan({ ...NO_ARROWS, up: true, left: true }, MID_X, MID_Y, true),
  );

  // The ramp, walked in from the inner lip of the band to hard against the
  // left edge. It has to rise, and it has to reach a full key's worth.
  for (let x = EDGE_SCROLL_BAND; x >= 0; x -= 8) {
    result.pan.edgeRamp.push(Number(spectatorPan(NO_ARROWS, x, MID_Y, true).x.toFixed(3)));
  }
  result.pan.justIn = spectatorPan(NO_ARROWS, EDGE_SCROLL_BAND - 1, MID_Y, true).x;
  result.pan.justOut = spectatorPan(NO_ARROWS, EDGE_SCROLL_BAND, MID_Y, true).x;
  result.pan.edgesOff = f3(spectatorPan(NO_ARROWS, 0, 0, false));

  if (result.pan.up !== '0.000,-1.000') result.errors.push(`up is ${result.pan.up}`);
  // A diagonal must not be faster than a straight line, which is the whole
  // reason the vector is clamped rather than left as it comes.
  const ul = result.pan.upLeft.split(',').map(Number);
  if (Math.abs(Math.hypot(ul[0], ul[1]) - 1) > 0.001) {
    result.errors.push(`a two-key diagonal is ${Math.hypot(ul[0], ul[1]).toFixed(3)} long`);
  }
  if (result.pan.justOut !== 0) result.errors.push('the band pushes from outside itself');
  if (!(result.pan.justIn < 0)) result.errors.push('the band does not push at its inner lip');
  // The lip has to be gentle and the edge has to be a full key's worth, or the
  // ramp is doing nothing and the band may as well be flat.
  if (Math.abs(Math.abs(result.pan.justIn) - EDGE_SCROLL_MIN) > 0.02) {
    result.errors.push(`the inner lip pushes ${Math.abs(result.pan.justIn).toFixed(3)}`);
  }
  if (Math.abs(spectatorPan(NO_ARROWS, 0, MID_Y, true).x + 1) > 0.001) {
    result.errors.push('hard against the edge is not a full key');
  }
  for (let i = 1; i < result.pan.edgeRamp.length; i++) {
    if (result.pan.edgeRamp[i] > result.pan.edgeRamp[i - 1]) {
      result.errors.push('the ramp is not monotonic');
      break;
    }
  }
  if (result.pan.edgesOff !== '0.000,0.000') {
    result.errors.push(`a corner with edges off pushes ${result.pan.edgesOff}`);
  }
}

try {
  cursorSuite();
  gridSuite();
  panSuite();
  buildSuite();
} catch (err) {
  result.errors.push(String(err));
}

// Leave something on screen to look at as well as something to read.
clear();
const view = { x: 0, y: 0, w: canvas.width, h: canvas.height };
drawBuildSites(ctx, [{ id: 'a', x: 200, y: 120, angle: 0 }], view, 0);
drawBuildSites(ctx, [{ id: 'b', x: 200, y: 240, angle: 0, working: true }], view, 0);
drawBarricades(
  ctx,
  [{ x: 200, y: 360, angle: 0, hw: BARRICADE_HALF_WIDTH, hh: BARRICADE_HALF_DEPTH, hp: 1 }],
  view,
);
drawCrosshair(ctx, 520, 120, true, 1);
drawCrosshair(ctx, 620, 120, true, CURSOR_SCALE);
// Both pages up where they can be seen, rather than a screen's width away in
// the corner they really live in — the measurements above use the real place.
for (const [i, page] of (['root', 'build'] as const).entries()) {
  const vw = 700 + i * 400;
  const vh = 700;
  drawCommandCard(ctx, page, 3, 3, -1, vw, vh);
  const { slots } = commandCardSlots(vw, vh);
  if (i === 1) {
    drawCrosshair(ctx, slots[0].x + slots[0].w / 2, slots[0].y + slots[0].h / 2, true, CURSOR_SCALE);
  }
}

(window as unknown as { rigResult: Result }).rigResult = result;
console.log(JSON.stringify(result, null, 2));
