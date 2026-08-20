/**
 * Roar rig. Temporary — delete after.
 *
 * Drives the real `drawDogHud`, `drawStamina` and `drawEntity` by hand at the
 * real viewport size, which is the only way to see whether the hexagon row
 * actually clears the stamina bar above it and the jaws bar below it. Driven
 * off `setInterval` rather than rAF, which is throttled to nothing while the
 * browser pane is not compositing.
 *
 * The bottom strip is the HUD at 1:1 — the size it is played at. The top is
 * the roaring animal at 4x and at 1:1 beside it, for the same reason
 * `dogpose.ts` draws both.
 */
import type { DogHud, EntityState, MapData } from '../../shared/types.js';
import { STAMINA_MAX } from '../../shared/constants.js';
import {
  clearDogMap,
  drawDogHud,
  drawDogMap,
  drawEntity,
  drawGround,
  drawStamina,
  DOG_HUD_STAMINA_LIFT,
} from './render.js';

/** One bake plus one draw, so the pair can be timed together in a loop. */
function dogMapWarm(
  c: CanvasRenderingContext2D,
  m: MapData,
  me: { x: number; y: number },
  contacts: Array<{ x: number; y: number }>,
): void {
  drawDogMap(c, m, me, contacts, 1920, 1080);
}

const canvas = document.getElementById('rig') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const fakeMap = { width: canvas.width, height: canvas.height } as MapData;

function hud(over: Partial<DogHud> = {}): DogHud {
  return {
    bite: 1,
    jawsOpen: -1,
    latched: false,
    hold: 0,
    shaken: 0,
    abilities: [{ name: 'ROAR', ready: 1, charges: 0, active: -1 }, null, null, null],
    contacts: [],
    hosts: 43,
    out: false,
    dying: -1,
    ...over,
  };
}

const states: Array<{ label: string; hud: DogHud }> = [
  { label: 'ready, nothing banked', hud: hud() },
  {
    label: 'ready, 12 banked',
    hud: hud({ abilities: [{ name: 'ROAR', ready: 1, charges: 12, active: -1 }, null, null, null] }),
  },
  {
    label: 'roaring',
    hud: hud({ abilities: [{ name: 'ROAR', ready: 0, charges: 12, active: 0.45 }, null, null, null] }),
  },
  {
    label: 'cooling down, spent',
    hud: hud({ abilities: [{ name: 'ROAR', ready: 0.35, charges: 0, active: -1 }, null, null, null] }),
  },
];

let which = 0;
setInterval(() => {
  which = (which + 1) % states.length;
}, 2200);

function dog(x: number, y: number, roaring: boolean): EntityState {
  return {
    id: 'rig-dog',
    type: 'zombie',
    x,
    y,
    facing: 0,
    health: 90,
    dog: true,
    head: 0,
    roaring: roaring || undefined,
  };
}

function frame(): void {
  const now = performance.now();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGround(ctx, fakeMap);

  // ---- the animal, roaring, at 4x and at 1:1.
  ctx.save();
  ctx.translate(300, 300);
  ctx.scale(4, 4);
  drawEntity(ctx, dog(0, 0, true), false, now, false);
  ctx.restore();

  ctx.save();
  ctx.translate(760, 300);
  drawEntity(ctx, dog(0, 0, true), false, now, false);
  ctx.translate(120, 0);
  drawEntity(ctx, dog(0, 0, false), false, now, false);
  ctx.restore();

  ctx.fillStyle = '#94a3b8';
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.fillText('roaring at 4x', 210, 470);
  ctx.fillText('1:1 — roaring, then not', 700, 470);
  ctx.fillText(`HUD: ${states[which].label}`, 700, 560);

  // ---- the HUD, at the real viewport size, exactly as `main.ts` calls it.
  const state = states[which].hud;
  drawDogHud(ctx, state, canvas.width, canvas.height, now);
  drawStamina(ctx, STAMINA_MAX * 0.62, STAMINA_MAX, canvas.width, canvas.height, false, DOG_HUD_STAMINA_LIFT);

  // Guides: the three rows must not touch. Drawn last, thin, off to one side.
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
  ctx.lineWidth = 1;
  for (const y of [canvas.height - 104, canvas.height - 96, canvas.height - 83, canvas.height - 45, canvas.height - 34, canvas.height - 22]) {
    ctx.beginPath();
    ctx.moveTo(canvas.width / 2 - 320, y);
    ctx.lineTo(canvas.width / 2 - 180, y);
    ctx.stroke();
  }
}

setInterval(frame, 33);
frame();

/**
 * Measure rather than look at it.
 *
 * The browser pane does not composite while it is hidden, so no screenshot can
 * be taken — and the question here is a layout one anyway, which is a question
 * about numbers. This draws the HUD alone onto a transparent canvas and hands
 * back which rows have anything in them, so "the hexagons clear the stamina
 * bar and the jaws bar" is a measurement instead of an impression.
 */
interface RigWindow extends Window {
  __rigRows?: (state: number) => { rows: number[]; height: number };
  __rigMapCost?: (reps?: number) => unknown;
  __rigMapBounds?: () => unknown;
  __rigDrawMap?: (c: CanvasRenderingContext2D, contacts: Array<{ x: number; y: number }>) => void;
  __rigRoar?: () => { roaring: number; quiet: number };
}

(window as unknown as RigWindow).__rigRows = (state: number) => {
  const scratch = document.createElement('canvas');
  scratch.width = canvas.width;
  scratch.height = canvas.height;
  const s = scratch.getContext('2d')!;
  drawDogHud(s, states[state].hud, scratch.width, scratch.height, 0);
  drawStamina(s, STAMINA_MAX * 0.62, STAMINA_MAX, scratch.width, scratch.height, false, DOG_HUD_STAMINA_LIFT);

  // Only the middle of the screen: the "N LEFT TO RISE FROM" caption sits off
  // to the left of the bar and would smear every row it touches together.
  const x0 = Math.round(scratch.width / 2 - 120);
  const w = 240;
  const top = scratch.height - 160;
  const data = s.getImageData(x0, top, w, 160).data;
  const rows: number[] = [];
  for (let row = 0; row < 160; row++) {
    let n = 0;
    for (let col = 0; col < w; col++) {
      if (data[(row * w + col) * 4 + 3] > 12) n++;
    }
    rows.push(n);
  }
  return { rows, height: scratch.height };
};

/**
 * What the corner map costs a frame, and what baking it buys.
 *
 * Timed with a 1px `getImageData` behind each batch, the way `paintbench.ts`
 * does — canvas commands are queued and rasterised after the callback returns,
 * so timing the calls alone measures nothing. The readback carries a fixed cost
 * of several milliseconds, so each configuration is drawn many times behind one
 * readback and the cost divided out.
 *
 * The "live" figure redraws the city every frame — the version this would have
 * been without the bake — so the two are the same drawing measured two ways.
 */
/**
 * Where the corner map actually lands, in pixels, and whether anything else on
 * the HUD is under it. Drawn onto a transparent canvas so "ink" is the map and
 * only the map.
 */
(window as unknown as RigWindow).__rigMapBounds = () => {
  const scratch = document.createElement('canvas');
  scratch.width = 1920;
  scratch.height = 1080;
  const s = scratch.getContext('2d')!;
  clearDogMap();
  drawDogMap(s, rigMap(), { x: 2500, y: 1850 }, [], 1920, 1080);
  const d = s.getImageData(0, 0, 1920, 1080).data;
  let minX = 1e9, minY = 1e9, maxX = -1, maxY = -1;
  for (let y = 0; y < 1080; y++) {
    for (let x = 0; x < 1920; x++) {
      if (d[(y * 1920 + x) * 4 + 3] > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  clearDogMap();

  // What the rest of the dog's HUD occupies, for the overlap question.
  const hudScratch = document.createElement('canvas');
  hudScratch.width = 1920;
  hudScratch.height = 1080;
  const h = hudScratch.getContext('2d')!;
  drawDogHud(h, states[1].hud, 1920, 1080, 0);
  drawStamina(h, STAMINA_MAX * 0.62, STAMINA_MAX, 1920, 1080, false, DOG_HUD_STAMINA_LIFT);
  const hd = h.getImageData(0, 0, 1920, 1080).data;
  let hudMinX = 1e9;
  for (let y = 0; y < 1080; y++) {
    for (let x = 0; x < 1920; x++) {
      if (hd[(y * 1920 + x) * 4 + 3] > 8 && x < hudMinX) hudMinX = x;
    }
  }

  return {
    map: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1, right: maxX, bottom: maxY },
    hudLeftmostInk: hudMinX,
    clearOfHud: maxX < hudMinX,
    gapPx: hudMinX - maxX,
  };
};

/** Draw the map onto any context, so a projection can be probed pixel by pixel. */
(window as unknown as RigWindow).__rigDrawMap = (c, contacts) => {
  clearDogMap();
  drawDogMap(c, rigMap(), { x: 2500, y: 1850 }, contacts, 1920, 1080);
  clearDogMap();
};

/** The same synthetic city both hooks measure against. */
function rigMap(): MapData {
  let s = 20260819;
  const rand = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const buildings = [];
  for (let i = 0; i < 90; i++) {
    const bx = rand() * 4600;
    const by = rand() * 3400;
    const bw = 90 + rand() * 220;
    const bh = 90 + rand() * 180;
    const rects = rand() < 0.33
      ? [
          { x: bx, y: by, w: bw, h: bh * 0.6 },
          { x: bx, y: by + bh * 0.6, w: bw * 0.55, h: bh * 0.4 },
        ]
      : [{ x: bx, y: by, w: bw, h: bh }];
    buildings.push({ x: bx, y: by, w: bw, h: bh, rects, doors: [] });
  }
  return {
    seed: 1,
    width: 5000,
    height: 3700,
    walls: [],
    bushes: [],
    windows: [],
    buildings,
    doors: [],
    pond: { x: 3200, y: 900, r: 180, wobble: [{ freq: 3, amp: 0.1, phase: 1 }], pads: [] },
    park: { x: 800, y: 2100, w: 900, h: 700, path: [], pathWidth: 40 },
  } as unknown as MapData;
}

(window as unknown as RigWindow).__rigMapCost = (reps = 200) => {
  // A city of about the size the real one is: ~90 footprints, a park, a pond.
  const rand = (() => {
    let s = 20260819;
    return () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  })();
  const buildings = [];
  for (let i = 0; i < 90; i++) {
    const bx = rand() * 4600;
    const by = rand() * 3400;
    const bw = 90 + rand() * 220;
    const bh = 90 + rand() * 180;
    // About one in three is L or T shaped, like the real generator's.
    const rects = rand() < 0.33
      ? [
          { x: bx, y: by, w: bw, h: bh * 0.6 },
          { x: bx, y: by + bh * 0.6, w: bw * 0.55, h: bh * 0.4 },
        ]
      : [{ x: bx, y: by, w: bw, h: bh }];
    buildings.push({ x: bx, y: by, w: bw, h: bh, rects, doors: [] });
  }
  const fake = {
    seed: 1,
    width: 5000,
    height: 3700,
    walls: [],
    bushes: [],
    windows: [],
    buildings,
    doors: [],
    pond: { x: 3200, y: 900, r: 180, wobble: [{ freq: 3, amp: 0.1, phase: 1 }], pads: [] },
    park: { x: 800, y: 2100, w: 900, h: 700, path: [], pathWidth: 40 },
  } as unknown as MapData;

  const contacts = [];
  for (let i = 0; i < 12; i++) contacts.push({ x: rand() * 5000, y: rand() * 3700 });
  const me = { x: 2500, y: 1850 };

  const scratch = document.createElement('canvas');
  scratch.width = 1920;
  scratch.height = 1080;
  const s = scratch.getContext('2d', { willReadFrequently: true })!;

  // Bake, timed over many so the readback's own fixed cost — several
  // milliseconds, and the reason `paintbench.ts` batches — is divided out
  // rather than being counted as the bake. Timed once it read 39ms, which is
  // almost entirely the readback and a cold canvas.
  const bakeReps = 30;
  clearDogMap();
  drawDogMap(s, fake, me, contacts, 1920, 1080); // warm
  s.getImageData(0, 0, 1, 1);
  const b0 = performance.now();
  for (let i = 0; i < bakeReps; i++) {
    clearDogMap();
    dogMapWarm(s, fake, me, contacts);
  }
  s.getImageData(0, 0, 1, 1);
  const bake = (performance.now() - b0) / bakeReps;

  // Warm, then the per-frame cost of the baked version.
  for (let i = 0; i < 40; i++) drawDogMap(s, fake, me, contacts, 1920, 1080);
  s.getImageData(0, 0, 1, 1);
  const t0 = performance.now();
  for (let i = 0; i < reps; i++) drawDogMap(s, fake, me, contacts, 1920, 1080);
  s.getImageData(0, 0, 1, 1);
  const baked = (performance.now() - t0) / reps;

  // And the same drawing with the bake thrown away every frame, which is what
  // it would cost written the obvious way.
  for (let i = 0; i < 20; i++) {
    clearDogMap();
    drawDogMap(s, fake, me, contacts, 1920, 1080);
  }
  s.getImageData(0, 0, 1, 1);
  const t1 = performance.now();
  for (let i = 0; i < reps; i++) {
    clearDogMap();
    drawDogMap(s, fake, me, contacts, 1920, 1080);
  }
  s.getImageData(0, 0, 1, 1);
  const live = (performance.now() - t1) / reps;

  clearDogMap();
  return {
    buildings: buildings.length,
    bakeMs: Number(bake.toFixed(3)),
    bakedPerFrameMs: Number(baked.toFixed(4)),
    livePerFrameMs: Number(live.toFixed(4)),
    ratio: Number((live / baked).toFixed(1)),
  };
};

(window as unknown as RigWindow).__rigRoar = () => {
  // The same animal drawn twice, roaring and not, on a transparent ground —
  // the difference is the roar and nothing else.
  const count = (roaring: boolean): number => {
    const scratch = document.createElement('canvas');
    scratch.width = 400;
    scratch.height = 400;
    const s = scratch.getContext('2d')!;
    drawEntity(s, dog(120, 200, roaring), false, 0, false);
    const data = s.getImageData(0, 0, 400, 400).data;
    let n = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] > 12) n++;
    return n;
  };
  return { roaring: count(true), quiet: count(false) };
};
