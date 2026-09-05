/**
 * Helicopter downwash rig. A canvas and nothing else — no socket, no port, so
 * it leaves a game on 8080 alone.
 *
 * The claims are all about *pixels* and so none are settled by looking — least
 * of all from here, where rAF is throttled to nothing while the browser pane is
 * not compositing. `getImageData` needs none of that.
 *
 *  - the rotor wash sits on the ground centred on the aircraft, and fades with
 *    `alpha` — full at 1, roughly half at 0.5, gone at 0.02;
 *  - the gust puffs *go outward and fade in and out* — a fixed box out at 0.55R
 *    sees a puff drift through it and vanish, while the disc is never bare;
 *  - nothing the wash draws crosses `HELI_WASH_RADIUS`;
 *  - a bush directly under an aircraft is shoved off its resting spot, and one
 *    outside `HELI_WASH_RADIUS` is not;
 *  - with nothing overhead, `drawBushes` is byte-for-byte what it was — an
 *    empty `helis` list and one far outside the wash radius paint identically.
 *
 * Open `/helirig.html` on the dev server. Results land on `window.rigResult`.
 */
import type { Bush, HelicopterState } from '../../shared/types.js';
import { HELI_WASH_RADIUS } from '../../shared/constants.js';
import {
  drawBushes,
  drawRotorWash,
  setRotorWashHazeOff,
  setRotorGustCount,
} from './render.js';

const canvas = document.getElementById('rig') as HTMLCanvasElement;
const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
const BG: [number, number, number] = [0x4a, 0x4a, 0x4a];
const VIEW = { x: -1e5, y: -1e5, w: 3e5, h: 3e5 };

function fill(): void {
  ctx.fillStyle = `rgb(${BG[0]},${BG[1]},${BG[2]})`;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function heli(id: string, x: number, y: number, alpha: number): HelicopterState {
  return { id, x, y, facing: 0.6, alpha };
}

/**
 * Ink in a box that differs from the flat background: how many pixels, the
 * total departure from the background (∝ how much dust landed and how opaque),
 * and the centroid.
 */
/**
 * `ann` optionally restricts counting to an annulus `[rMin, rMax]` around
 * `(acx, acy)` — for reading just the puffs that are passing through a band of
 * radius, whatever bearing they are on.
 */
function inkInBox(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  ann?: { acx: number; acy: number; rMin: number; rMax: number },
) {
  const w = x1 - x0;
  const d = ctx.getImageData(x0, y0, w, y1 - y0).data;
  let n = 0;
  let sum = 0;
  let strong = 0; // off>8 — gust ink. Only read with the haze gated off, so the
  // flat background is the only other thing and this is clean.
  let maxOff = 0;
  let minStrongX = Infinity;
  let sx = 0;
  let sy = 0;
  let strongSx = 0;
  let strongSy = 0;
  for (let i = 0; i < d.length; i += 4) {
    const p = i / 4;
    const gx = (p % w) + x0;
    const gy = Math.floor(p / w) + y0;
    if (ann) {
      const r = Math.hypot(gx - ann.acx, gy - ann.acy);
      if (r < ann.rMin || r > ann.rMax) continue;
    }
    const off =
      Math.abs(d[i] - BG[0]) + Math.abs(d[i + 1] - BG[1]) + Math.abs(d[i + 2] - BG[2]);
    if (off > maxOff) maxOff = off;
    if (off > 3) {
      n++;
      sum += off;
      sx += gx;
      sy += gy;
      if (off > 8) {
        strong++;
        strongSx += gx;
        strongSy += gy;
        if (gx < minStrongX) minStrongX = gx;
      }
    }
  }
  return {
    n,
    sum,
    strong,
    maxOff,
    minStrongX,
    cx: n ? sx / n : 0,
    cy: n ? sy / n : 0,
    strongCx: strong ? strongSx / strong : 0,
    strongCy: strong ? strongSy / strong : 0,
  };
}

/** The bounding box of a single bush's drawn ink, given its rest centre. */
function bushInkBox(cx: number, cy: number, pad = 60) {
  const x0 = Math.round(cx - pad);
  const y0 = Math.round(cy - pad);
  const w = pad * 2;
  const d = ctx.getImageData(x0, y0, w, w).data;
  let minX = w;
  let minY = w;
  let maxX = 0;
  let maxY = 0;
  let n = 0;
  for (let i = 0; i < d.length; i += 4) {
    // Bush ink: greener than the grey and darker overall.
    const green = d[i + 1] > d[i] + 6 && d[i + 1] > d[i + 2] + 6;
    if (green) {
      n++;
      const p = i / 4;
      const px = p % w;
      const py = Math.floor(p / w);
      minX = Math.min(minX, px);
      minY = Math.min(minY, py);
      maxX = Math.max(maxX, px);
      maxY = Math.max(maxY, py);
    }
  }
  return n ? { n, x: x0 + (minX + maxX) / 2, y: y0 + (minY + maxY) / 2 } : { n: 0, x: 0, y: 0 };
}

interface Result {
  wash: { alpha: number; inkSum: number; offCentrePx: number }[];
  washOutsideRadius: number;
  puffPeakOff: number; // brightest single pixel — "more transparent" than the old ~50
  gustFade: { probeSwing: number };
  trail: { stationaryCentreDx: number; movingCentreDx: number; leftEdgeBehindPx: number };
  bushUnder: { restVsWindyPx: number };
  bushFar: { restVsWindyPx: number };
  noHeliIdentical: boolean;
  pass: boolean;
}

const result: Result = {
  wash: [],
  washOutsideRadius: 0,
  puffPeakOff: 0,
  gustFade: { probeSwing: 0 },
  trail: { stationaryCentreDx: 0, movingCentreDx: 0, leftEdgeBehindPx: 0 },
  bushUnder: { restVsWindyPx: 0 },
  bushFar: { restVsWindyPx: 0 },
  noHeliIdentical: false,
  pass: false,
};

// ---- rotor wash, by alpha ------------------------------------------------
// One aircraft at a time — two washes are 1.5x the disc radius each and would
// overlap on any canvas that fits three.
{
  const CX = 750;
  const CY = 360; // >= R so the read box never runs off the top of the canvas
  const R = Math.ceil(HELI_WASH_RADIUS);
  for (const alpha of [1, 0.5, 0.02]) {
    fill();
    drawRotorWash(ctx, [heli('w', CX, CY, alpha)], 5000);
    const box = inkInBox(CX - R, CY - R, CX + R, CY + R);
    result.wash.push({
      alpha,
      inkSum: box.sum,
      offCentrePx: box.n ? Math.hypot(box.cx - CX, box.cy - CY) : 0,
    });
    if (alpha === 1) {
      // Nothing lands beyond the wash radius — it is where the bush stir stops
      // too.
      const far = inkInBox(CX + R + 6, CY - 40, CX + R + 100, CY + 40);
      result.washOutsideRadius = far.n;
    }
  }

  // The rest of the wash checks read the puffs alone — they are faint by design
  // and do not threshold cleanly against the haze gradient.
  setRotorWashHazeOff(true);

  // "more transparent": the brightest puff pixel over a short sweep stays well
  // under opaque (a solid stroke on this background would be ~150+).
  for (let t = 0; t < 1600; t += 120) {
    fill();
    drawRotorWash(ctx, [heli('w', CX, CY, 1)], 300000 + t);
    result.puffPeakOff = Math.max(
      result.puffPeakOff,
      inkInBox(CX - R, CY - R, CX + R, CY + R).maxOff,
    );
  }

  // "fade in and out": one puff, swept over its whole life — its ink goes from
  // nothing, up to a peak, and back to nothing. (N evenly-staggered puffs sum
  // to a near-constant, which is why this forces a single one.)
  setRotorGustCount(1);
  let probeLo = Infinity;
  let probeHi = 0;
  for (let t = 0; t < 3200; t += 40) {
    fill();
    drawRotorWash(ctx, [heli('w', CX, CY, 1)], 200000 + t);
    const s = inkInBox(CX - R, CY - R, CX + R, CY + R).sum;
    probeLo = Math.min(probeLo, s);
    probeHi = Math.max(probeHi, s);
  }
  setRotorGustCount(-1);
  result.gustFade = { probeSwing: probeHi > 0 ? (probeHi - probeLo) / probeHi : 0 };

  // "not follow the helicopter as it's moving": fly one right across the canvas
  // and the puffs it kicked up should be left behind, so the puff ink trails to
  // the LEFT of the current shadow. Fresh id each run so the velocity tracker
  // starts clean.
  const R2 = Math.ceil(HELI_WASH_RADIUS);
  const runWash = (moving: boolean, tag: string) => {
    const y = CY;
    let x = 460;
    // establish the velocity estimate over several frames
    for (let k = 0; k < 16; k++) {
      if (moving) x += 16; // ~0.27 px/ms at 60ms steps — about HELI_SPEED
      fill();
      drawRotorWash(ctx, [heli(tag, x, y, 1)], 500000 + k * 60);
    }
    const b = inkInBox(Math.max(0, x - R2 - 500), y - R2, x + R2, y + R2);
    // The puff centroid, not the haze-dominated all-ink one — the haze always
    // sits on the current shadow, the puffs are what stay behind.
    return { centreDx: b.strong ? b.strongCx - x : 0, leftEdge: b.minStrongX - x };
  };
  const still = runWash(false, 'trail-still');
  const flew = runWash(true, 'trail-move');
  result.trail = {
    stationaryCentreDx: still.centreDx,
    movingCentreDx: flew.centreDx,
    leftEdgeBehindPx: Number.isFinite(flew.leftEdge) ? -flew.leftEdge : 0,
  };

  setRotorWashHazeOff(false);
}

// ---- bushes under the wash --------------------------------------------
{
  const by = 820;
  const underX = 360; // a bush right under the heli
  const farX = 360 + Math.round(HELI_WASH_RADIUS) + 140; // well outside it
  const bushes: Bush[] = [
    { x: underX, y: by, r: 22 },
    { x: farX, y: by, r: 22 },
  ];
  const h = heli('b', underX, by - 8, 1);

  // rest
  fill();
  drawBushes(ctx, bushes, VIEW);
  const restUnder = bushInkBox(underX, by);
  const restFar = bushInkBox(farX, by);

  // windy
  fill();
  drawBushes(ctx, bushes, VIEW, [h], 4321);
  const windyUnder = bushInkBox(underX, by);
  const windyFar = bushInkBox(farX, by);

  result.bushUnder.restVsWindyPx = Math.hypot(windyUnder.x - restUnder.x, windyUnder.y - restUnder.y);
  result.bushFar.restVsWindyPx = Math.hypot(windyFar.x - restFar.x, windyFar.y - restFar.y);

  // no heli at all vs a heli parked far outside the wash radius: identical
  fill();
  drawBushes(ctx, bushes, VIEW, [], 4321);
  const a = ctx.getImageData(0, by - 80, canvas.width, 160).data;
  fill();
  drawBushes(ctx, bushes, VIEW, [heli('x', -9000, -9000, 1)], 4321);
  const b = ctx.getImageData(0, by - 80, canvas.width, 160).data;
  let same = true;
  for (let i = 0; i < a.length && same; i++) if (a[i] !== b[i]) same = false;
  result.noHeliIdentical = same;
}

result.pass =
  result.wash[0].offCentrePx < HELI_WASH_RADIUS * 0.32 && // roughly centred on the aircraft
  result.wash[0].inkSum > result.wash[1].inkSum * 1.5 && // scales with alpha
  result.wash[1].inkSum > result.wash[2].inkSum * 5 && // ~0 at alpha 0.02
  result.washOutsideRadius === 0 &&
  result.puffPeakOff < 70 && // faint — nowhere near an opaque stroke (~150+)
  result.gustFade.probeSwing > 0.9 && // one puff's ink: nothing → peak → nothing
  Math.abs(result.trail.stationaryCentreDx) < 45 && // a hovering wash sits on the aircraft
  result.trail.movingCentreDx < -25 && // …a moving one is left behind it
  result.trail.leftEdgeBehindPx > 120 && // the wake reaches well back
  result.bushUnder.restVsWindyPx > 4 &&
  result.bushFar.restVsWindyPx < 1.5 &&
  result.noHeliIdentical;

// ---- a frame to look at ---------------------------------------------
// The measurements above do not depend on this; it is just so opening the page
// shows the effect rather than a grey rectangle.
{
  fill();
  ctx.fillStyle = '#8a9070';
  ctx.font = 'bold 14px sans-serif';
  ctx.fillText('rotor wash — alpha 1.0 / 0.6 / 0.25', 40, 30);
  const ys = 190;
  [1, 0.6, 0.25].forEach((alpha, i) => {
    drawRotorWash(ctx, [heli(`s${i}`, 260 + i * 470, ys, alpha)], 6000 + i * 900);
  });

  ctx.fillStyle = '#8a9070';
  ctx.fillText('a hedge under a helicopter sweeping left → right', 40, 470);
  const row: Bush[] = [];
  for (let i = 0; i < 26; i++) row.push({ x: 120 + i * 50, y: 620, r: 24 });
  for (const t of [0.15, 0.4, 0.62, 0.85]) {
    const hx = 120 + t * 26 * 50;
    drawRotorWash(ctx, [heli('sweep', hx, 612, 1)], 9000);
  }
  drawBushes(ctx, row, VIEW, [heli('sweep', 120 + 0.62 * 26 * 50, 612, 1)], 9000);
}

(window as unknown as { rigResult: Result }).rigResult = result;
const out = document.getElementById('out')!;
out.textContent = JSON.stringify(result, null, 2);
console.log(JSON.stringify(result));
