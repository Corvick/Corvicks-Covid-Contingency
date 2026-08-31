/**
 * Police-station drawing rig: the cell gate's teeth, and the paint on the car
 * park. A canvas and nothing else — no socket and no port, so it leaves a game
 * on 8080 alone.
 *
 * Both claims are about *pixels* and neither is settled by looking, least of
 * all from a browser pane that is not compositing: rAF is throttled to nothing
 * there and no frame of a live round can be put on screen. `getImageData`
 * needs no compositing at all, which is what turns "the gate reads as bars"
 * into a number.
 *
 *  - **"The cell door is black and has teeth like a ruler."** Counted as
 *    separate bands of light ink crossing the slab, which is the same trick
 *    the flamethrower's one-stream check uses — a count of *bands* is the
 *    claim itself rather than a proxy for it. The control is an ordinary door
 *    in the same rig, which has one panel line and no teeth.
 *  - **"White parking lanes for the cars."** Counted as bands of white ink
 *    across the row, which must come to one more than there are bays: two bays
 *    share a divider, so a per-bay pair would paint every interior line twice.
 *
 * It lives under `client/src`, so unlike the harnesses at `server/`'s root it
 * is covered by `npx tsc --noEmit`. Results land on `window.rigResult`.
 *
 * Open `/stationrig.html` on the dev server to look at the frame it leaves:
 * the gate in three states over an ordinary door, and a three-bay car park.
 */
import type { Door, DoorState, PoliceStation } from '../../shared/types.js';
import {
  GROUND_COLOR,
  POLICE_STATION_BAY_TILES,
  POLICE_STATION_BAY_DEPTH,
  POLICE_STATION_PARKING,
  TILE,
  WALL_THICKNESS,
} from '../../shared/constants.js';
import { drawDoors, drawParkingBays } from './render.js';

const canvas = document.getElementById('rig') as HTMLCanvasElement;
const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

/** Everything is measured against the real road, not against a blank canvas. */
const ROAD = [0x1b, 0x1d, 0x20];
/** A viewport nothing can be culled against, since framing is not the claim. */
const WHOLE = { x: -10_000, y: -10_000, w: 20_000, h: 20_000 };

function clear(): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = GROUND_COLOR;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

/**
 * Bands of ink along a line, and how many pixels of it there were.
 *
 * A *band* rather than a pixel count, because "teeth" and "lanes" are both
 * claims about separate marks with gaps between them — one fat stripe and five
 * thin ones can put down the same number of lit pixels and only one of them is
 * the thing being asked for.
 */
function scan(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  hit: (r: number, g: number, b: number) => boolean,
): { bands: number; px: number; dark: number[] } {
  /*
   * **Floored, and that is not tidying up.** `getImageData` snaps a fractional
   * origin to the pixel grid but the arithmetic below does not, so a
   * fractional `left` leaves `cx` fractional, the index into the byte array
   * fractional, and every sample reads `undefined` — which is not a colour, so
   * the scan reports the line as empty. Measured that way, the car park's four
   * dividers came back as **0 bands** while the gate's teeth, whose
   * coordinates happened to land on integers, read correctly.
   */
  const left = Math.floor(Math.min(x0, x1)) - 1;
  const top = Math.floor(Math.min(y0, y1)) - 1;
  const w = Math.ceil(Math.abs(x1 - x0)) + 3;
  const h = Math.ceil(Math.abs(y1 - y0)) + 3;
  // One readback for the whole line. Per-sample `getImageData` is the trap
  // `paintbench.ts` documents: it forces a GPU round trip each time and the
  // readback's own cost swamps whatever is being measured.
  const img = ctx.getImageData(left, top, w, h);
  const steps = Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0) * 2));
  let bands = 0;
  let px = 0;
  let inBand = false;
  let dark = [255, 255, 255];
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const cx = Math.round(x0 + (x1 - x0) * t) - left;
    const cy = Math.round(y0 + (y1 - y0) * t) - top;
    const i = (cy * img.width + cx) * 4;
    const rgb = [img.data[i], img.data[i + 1], img.data[i + 2]];
    const on = hit(rgb[0], rgb[1], rgb[2]);
    if (on) px++;
    if (on && !inBand) bands++;
    inBand = on;
    if (rgb[0] + rgb[1] + rgb[2] < dark[0] + dark[1] + dark[2]) dark = rgb;
  }
  return { bands, px, dark };
}

/** Steel: light, and not tinted the way the brown of an ordinary door is. */
const steel = (r: number, g: number, b: number): boolean =>
  r > 90 && g > 90 && b > 90 && Math.abs(r - b) < 40;

/** A horizontal door slab centred at (x, y), `span` px wide. */
function doorAt(x: number, y: number, span: number, bars: boolean): Door {
  return { x, y, building: 0, halfSpan: span / 2, horiz: true, interior: true, bars };
}

/** A row of bays centred on (x, y), nosed north like the real ones. */
function bayRow(x: number, y: number): PoliceStation {
  const bayW = POLICE_STATION_BAY_TILES * TILE;
  const empty = { x: 0, y: 0, w: 0, h: 0 };
  return {
    building: 0,
    parking: Array.from({ length: POLICE_STATION_PARKING }, (_, i) => ({
      x: x + (i - (POLICE_STATION_PARKING - 1) / 2) * bayW,
      y,
      facing: -Math.PI / 2,
    })),
    armoury: empty,
    lobby: empty,
    office: empty,
    cell: empty,
    racks: [],
  };
}

interface Result {
  errors: string[];
  [k: string]: unknown;
}

function run(): void {
  const result: Result = { errors: [] };
  try {
    // -------------------------------------------------------------- the gate
    const span = 56;
    const cases: Array<[string, Door, DoorState]> = [
      ['gate', doorAt(200, 120, span, true), { i: 0, open: false, locked: true, broken: false }],
      [
        'gateHurt',
        doorAt(200, 220, span, true),
        { i: 0, open: false, locked: true, broken: false, hp: 0.4 },
      ],
      ['door', doorAt(200, 320, span, false), { i: 0, open: false, locked: true, broken: false }],
    ];

    for (const [name, door, state] of cases) {
      clear();
      drawDoors(ctx, [door], new Map([[0, state]]), WHOLE);
      // Along the slab, a shade off its centre line — an ordinary door's own
      // panel line runs across the middle and is not a tooth.
      const y = door.y - WALL_THICKNESS / 2 + 3;
      const along = scan(door.x - span / 2 + 2, y, door.x + span / 2 - 2, y, steel);
      result[`${name}Teeth`] = along.bands;
      /*
       * The slab's own body, taken as **the darkest pixel along that same
       * line** rather than at a chosen spot. Brown is what says "wood"; a
       * gate has to be near-neutral and dark. A fixed sample is a lottery
       * against the tooth spacing — measured a quarter of the way along, it
       * landed on a tooth and read the gate's body as (121,129,143), and on
       * the centre line of an ordinary door it landed on the brass bolt and
       * read (224,180,92). Neither is the slab.
       */
      result[`${name}Body`] = along.dark;
      result[`${name}Brown`] = along.dark[0] - along.dark[2];
    }

    // A wider gate grows *more* bars rather than fatter ones, which is the
    // whole reason the spacing is a constant and the count is not.
    clear();
    const wide = doorAt(200, 120, span * 2, true);
    drawDoors(
      ctx,
      [wide],
      new Map([[0, { i: 0, open: false, locked: true, broken: false }]]),
      WHOLE,
    );
    result.wideGateTeeth = scan(
      wide.x - span + 2,
      wide.y - WALL_THICKNESS / 2 + 3,
      wide.x + span - 2,
      wide.y - WALL_THICKNESS / 2 + 3,
      steel,
    ).bands;

    // -------------------------------------------------------------- the bays
    const bayW = POLICE_STATION_BAY_TILES * TILE;
    const rowY = 420;
    clear();
    drawParkingBays(ctx, bayRow(600, rowY), WHOLE);

    const white = (r: number, g: number, b: number): boolean =>
      r > ROAD[0] + 24 && g > ROAD[1] + 24 && b > ROAD[2] + 24;
    const half = (POLICE_STATION_PARKING * bayW) / 2;
    // Across the row, level with the bay centres: one band per divider.
    result.bayLines = scan(600 - half - 6, rowY, 600 + half + 6, rowY, white).bands;
    // Down one bay's middle: the stop line at its head, and nothing else — the
    // dividers are either side of this line, not on it.
    result.bayStopLines = scan(
      600,
      rowY - POLICE_STATION_BAY_DEPTH / 2 - 6,
      600,
      rowY + POLICE_STATION_BAY_DEPTH / 2 + 6,
      white,
    ).bands;
    // And nothing is painted on the road beside the row.
    result.bayOutside = scan(600 - half - 40, rowY, 600 - half - 12, rowY, white).px;

    result.pass =
      (result.gateTeeth as number) >= 3 &&
      result.doorTeeth === 0 &&
      (result.wideGateTeeth as number) > (result.gateTeeth as number) &&
      (result.gateBrown as number) < 12 &&
      (result.doorBrown as number) > 30 &&
      result.bayLines === POLICE_STATION_PARKING + 1 &&
      result.bayStopLines === 1 &&
      result.bayOutside === 0;
  } catch (e) {
    result.errors.push(String(e));
  }

  // Leave a frame to look at: the gate in three states over an ordinary door,
  // and a car park beside them.
  clear();
  const shown: Array<[Door, DoorState]> = [
    [doorAt(180, 90, 56, true), { i: 0, open: false, locked: true, broken: false }],
    [doorAt(180, 170, 56, true), { i: 1, open: false, locked: true, broken: false, hp: 0.35 }],
    [doorAt(180, 250, 56, true), { i: 2, open: false, locked: true, broken: true }],
    [doorAt(180, 330, 56, false), { i: 3, open: false, locked: true, broken: false }],
  ];
  drawDoors(
    ctx,
    shown.map((s) => s[0]),
    new Map(shown.map((s, i) => [i, s[1]])),
    WHOLE,
  );
  drawParkingBays(ctx, bayRow(460, 330), WHOLE);
  ctx.font = '12px sans-serif';
  ctx.fillStyle = '#888';
  ctx.textAlign = 'left';
  ['gate', 'gate, hurt', 'gate, broken', 'ordinary door'].forEach((t, i) =>
    ctx.fillText(t, 250, 94 + i * 80),
  );
  ctx.fillText('car park', 400, 400);

  /*
   * And the same four at 4x, because a gate is 10px thick and judging one at
   * life size is how you end up with detail nobody can see — the lesson
   * `dogpose.ts` records. The **measurements above are all taken at 1:1**;
   * this panel is only for looking at.
   */
  shown.forEach(([door, state], i) => {
    ctx.save();
    ctx.setTransform(4, 0, 0, 4, 880 - door.x * 4, 90 + i * 80 - door.y * 4);
    drawDoors(ctx, [door], new Map([[0, state]]), WHOLE);
    ctx.restore();
  });
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillText('4x', 760, 40);

  (window as unknown as Record<string, unknown>).rigResult = result;
  console.log('[stationrig]', JSON.stringify(result));
}

// Driven off `setInterval`, like `dogpose.ts` and `roarrig.ts`: rAF is
// throttled to nothing while the browser pane is not compositing.
setInterval(run, 500);
run();
