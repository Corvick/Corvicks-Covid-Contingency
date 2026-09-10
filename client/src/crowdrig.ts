/**
 * Crowd sprite + night lighting rig. Prototype — delete with the feature.
 *
 * A single vertical column so it reads on any pane width. Top to bottom:
 *
 *  1. OLD live shapes, animating,
 *  2. NEW baked shamble sprites, animating,
 *  3. one figure at 12×, to actually judge the art,
 *  4. the baked cycle frames per variant at 1:1 (the size it is played at),
 *  5. the night pass over the crowd,
 *  6. the same scene with the pass off.
 *
 * Driven off `setInterval`, not rAF — rAF is throttled to nothing while the
 * browser pane isn't compositing. `getImageData` needs neither.
 *
 * `window.rigResult` carries the sanity numbers; they also print under the
 * canvas.
 */
import type { EntityState, MapData } from '../../shared/types.js';
import { drawEntity, drawGround } from './render.js';
import { setCrowdSprites, crowdStrips, type CrowdStrip } from './crowdsprite.js';
import { drawNightLighting, type Light } from './lighting.js';

const canvas = document.getElementById('rig') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const out = document.getElementById('out') as HTMLDivElement;

const W = canvas.width; // 720
const fakeMap = { width: W, height: canvas.height } as MapData;
let t = 0;

// -------------------------------------------------------------- crowd rows

const crowd: Array<{ id: string; type: 'zombie' | 'human'; i: number }> = [];
for (let i = 0; i < 8; i++) {
  crowd.push({ id: `z${i}`, type: 'zombie', i });
  crowd.push({ id: `h${i}`, type: 'human', i });
}

/** One row of alternating zombies and civilians, walking on the spot. */
function crowdRow(oy: number, sprites: boolean): void {
  setCrowdSprites(sprites);
  const now = performance.now();
  for (const b of crowd) {
    const drift = (t * (b.type === 'zombie' ? 20 : 32) + b.i * 40) % 80;
    const s = {
      id: b.id,
      type: b.type,
      x: 60 + b.i * 78 + drift * 0.25,
      y: oy + (b.type === 'human' ? 46 : 0),
      facing: 0.5 + Math.sin(t * 0.4 + b.i) * 0.4,
      health: b.type === 'zombie' && b.i % 3 === 0 ? 60 : 900,
    } as EntityState;
    drawEntity(ctx, s, false, now, false, 1, b.type === 'zombie' ? 0.7 : 0.95);
  }
  setCrowdSprites(false);
}

// -------------------------------------------------------------- 12x inspector

function bigInspector(oy: number): void {
  const K = 12;
  const zs = crowdStrips('zombie');
  const hs = crowdStrips('human');
  const fi = Math.floor(t * 7) % zs[0].length;
  const rows: Array<[string, CrowdStrip]> = [
    ['zombie v0', zs[0]],
    ['zombie v2', zs[2] ?? zs[0]],
    ['civilian v0', hs[0]],
    ['civilian v2', hs[2] ?? hs[0]],
  ];
  ctx.font = '11px system-ui, sans-serif';
  rows.forEach(([label, strip], i) => {
    const fr = strip[fi];
    const px = 130 + (i % 2) * 340;
    const py = oy + 110 + Math.floor(i / 2) * 250;
    ctx.fillStyle = '#161b24';
    ctx.fillRect(px - 105, py - 92, 280, 210);
    ctx.strokeStyle = '#3f4a5c';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + 95, py);
    ctx.stroke();
    ctx.save();
    ctx.translate(px, py);
    ctx.scale(fr.scale * K, fr.scale * K);
    ctx.drawImage(fr.canvas, -fr.ox, -fr.oy);
    ctx.restore();
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(`${label}   (→ forward)`, px - 98, py + 108);
  });
}

// -------------------------------------------------------------- cycle strips

function drawStrips(oy: number): void {
  ctx.font = '10px system-ui, sans-serif';
  let y = oy;
  for (const kind of ['zombie', 'human'] as const) {
    for (let v = 0; v < crowdStrips(kind).length; v++) {
      const strip = crowdStrips(kind)[v];
      ctx.fillStyle = '#64748b';
      ctx.fillText(`${kind} v${v}`, 20, y + 3);
      for (let f = 0; f < strip.length; f++) {
        const fr = strip[f];
        ctx.save();
        ctx.translate(80 + f * 34, y);
        ctx.scale(fr.scale, fr.scale);
        ctx.drawImage(fr.canvas, -fr.ox, -fr.oy);
        ctx.restore();
      }
      y += 42;
    }
    y += 10;
  }
}

// -------------------------------------------------------------- night / day

const PW = 660;
const PH = 300;
const panelMap = { width: PW, height: PH } as MapData;

function drawCrowdScene(c: CanvasRenderingContext2D): void {
  const now = performance.now();
  c.setTransform(1, 0, 0, 1, 0, 0);
  drawGround(c, panelMap);
  setCrowdSprites(true);
  for (let i = 0; i < 15; i++) {
    const s = {
      id: `p${i}`,
      type: i % 3 === 0 ? 'human' : 'zombie',
      x: 60 + (i % 8) * 76 + Math.sin(t + i) * 7,
      y: 80 + Math.floor(i / 8) * 110,
      facing: 0.2 + Math.sin(t * 0.5 + i) * 0.6,
      health: 900,
    } as EntityState;
    drawEntity(c, s, false, now, false, 1, 0.8);
  }
  setCrowdSprites(false);
}

function mkCtx(): CanvasRenderingContext2D {
  const c = document.createElement('canvas');
  c.width = PW;
  c.height = PH;
  return c.getContext('2d')!;
}
const nightC = mkCtx();
const dayC = mkCtx();

function nightPanel(): HTMLCanvasElement {
  drawCrowdScene(nightC);
  const flash = (Math.sin(t * 3) + 1) / 2;
  const lights: Light[] = [
    { x: 190, y: 120, r: 120, intensity: flash, color: [255, 224, 150], core: true },
    { x: 450, y: 200, r: 140, intensity: 0.85, color: [255, 138, 46], core: true },
    { x: 320, y: 160, r: 250, intensity: 0.5, color: [150, 168, 208] },
  ];
  drawNightLighting(nightC, { x: 0, y: 0, w: PW, h: PH }, 1, lights, performance.now(), PW, PH, 'player');
  return nightC.canvas;
}
function dayPanel(): HTMLCanvasElement {
  drawCrowdScene(dayC);
  return dayC.canvas;
}

// -------------------------------------------------------------- sanity numbers

interface Result {
  framesBaked: number;
  cycleAnimates: boolean;
  zombieGoreVsCivilian: number;
  nightDarkensBy: number;
}

function tally(c: HTMLCanvasElement): { lum: number; gore: number } {
  const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
  let lum = 0;
  let n = 0;
  let gore = 0;
  for (let i = 0; i < d.length; i += 12) {
    if (d[i + 3] < 8) continue;
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    lum += (r + g + b) / 3;
    n++;
    if (r > 45 && r < 135 && r > g * 1.4 && r > b * 1.4) gore++;
  }
  return { lum: n ? lum / n : 0, gore };
}

function measure(): Result {
  const z = crowdStrips('zombie');
  const h = crowdStrips('human');
  const framesBaked = z.reduce((a, s) => a + s.length, 0) + h.reduce((a, s) => a + s.length, 0);

  const a = z[0][0].canvas;
  const b = z[0][Math.floor(z[0].length / 2)].canvas;
  const da = a.getContext('2d')!.getImageData(0, 0, a.width, a.height).data;
  const db = b.getContext('2d')!.getImageData(0, 0, b.width, b.height).data;
  let diff = 0;
  for (let i = 0; i < da.length; i += 32) diff += Math.abs(da[i] - db[i]);

  const day = mkCtx();
  drawGround(day, panelMap);
  const lit = mkCtx();
  lit.drawImage(nightC.canvas, 0, 0);

  return {
    framesBaked,
    cycleAnimates: diff > 200,
    zombieGoreVsCivilian: tally(z[0][0].canvas).gore - tally(h[0][0].canvas).gore,
    nightDarkensBy: +(tally(day.canvas).lum - tally(lit.canvas).lum).toFixed(1),
  };
}

// -------------------------------------------------------------- frame

function label(text: string, y: number): void {
  ctx.fillStyle = '#e2e8f0';
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillText(text, 20, y);
}

function frame(): void {
  t += 1 / 30;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  drawGround(ctx, fakeMap);

  label('OLD — live shapes (what ships today)', 24);
  crowdRow(70, false);

  label('NEW — baked shamble sprites', 170);
  crowdRow(216, true);

  label('12× — judge the art here', 320);
  bigInspector(330);

  label('baked cycle frames — 1:1, the size it is played at', 900);
  drawStrips(926);

  label('night pass — pulsing muzzle flash + fire, over the baked crowd', 1230);
  ctx.drawImage(nightPanel(), 20, 1248);

  label('— same scene, lights off —', 1580);
  ctx.drawImage(dayPanel(), 20, 1598);
}

setCrowdSprites(false);
setInterval(frame, 1000 / 30);
frame();

setTimeout(() => {
  const r = measure();
  (window as unknown as { rigResult: Result }).rigResult = r;
  out.textContent =
    `frames baked ............... ${r.framesBaked}  (3 zombie + 3 civilian × 8)\n` +
    `cycle animates ............. ${r.cycleAnimates}\n` +
    `zombie gore − civilian ..... ${r.zombieGoreVsCivilian} px  (want > 0)\n` +
    `night pass darkens by ...... ${r.nightDarkensBy} / 255 luma\n\n` +
    `in a real round: __proto.crowd(true) / __proto.night(true) in the console`;
}, 500);
