/**
 * What the three baked whole-world layers cost, and why a late round is not an
 * early one.
 *
 * `stainLayer` (dried blood and settled corpses), `wallMarkLayer` (bullet
 * holes) and `groundScorchLayer` (plasma craters) are each
 * `WORLD * BLOOD_BAKE_SCALE` — 2500x1850, ~4.6MP, ~18MB at a 5000x3700 city.
 * Each blit is gated on a dirty flag that is **false for the first minute of a
 * round and true for the rest of it**: the first dried mark, the first round
 * into a wall and the first crater turn them on and nothing turns them off. So
 * an early round skips all three outright and a late round pays all three every
 * frame — which is the shape of "the frame rate only went at this stage".
 *
 * Each blit also draws "just the sub-rect on screen", which for a player is a
 * few hundred pixels of the layer and for a spectator framing the whole city is
 * *the entire layer*, three times, reduced to the viewport.
 *
 * None of it shows up in `render` on the HUD. `drawImage` returns immediately
 * and the resample happens after rAF returns, so it lands in the frame gap as
 * `elsewhere` — and `else` is a *residual* (`gap - render - net`) that also
 * swallows the idle wait for the next vsync, so a frame that slips one reads as
 * a huge `else` rather than as the couple of milliseconds it actually went over
 * by. `getImageData` forces the rasteriser to finish there and then, which is
 * what makes the real figure measurable at all — and measurable in a browser
 * pane that never composites.
 *
 * Everything is driven through the real `spawn*` / `draw*` entry points rather
 * than a replica of them, so what is measured is the shipping path.
 *
 * **Read the CONTROL row before quoting anything else here.** It runs one case
 * twice under different labels, so what it reports is this machine's noise
 * floor, and any difference smaller than that is not a result. A
 * quarter-world-resolution mip for the spectator blit was built against this
 * rig and thrown away for exactly that reason: it measured 0.33ms against a
 * 0.99ms floor, and switching between the two surfaces frame to frame was
 * plainly visible as the decals jittering. Do not rebuild it without a way to
 * resolve sub-millisecond canvas work first.
 *
 * Open `/layerbench.html`.
 */
import {
  VIEWPORT_WIDTH,
  VIEWPORT_HEIGHT,
  CAMERA_ZOOM,
  BLOOD_BAKE_SCALE,
  BLOOD_DECAL_MS,
  BLOOD_DECAL_MAX,
  setWorldSize,
} from '../../shared/constants.js';
import {
  spawnBlood,
  spawnBulletHole,
  spawnPlasmaCrater,
  spawnCorpse,
  drawBlood,
  drawBulletHoles,
  drawGroundScorch,
  drawZombieCorpses,
  clearBlood,
  setLayerBlitSmoothing,
} from './render.js';
import type { Viewport } from './render.js';

const out = document.getElementById('out') as HTMLElement;
const canvas = document.createElement('canvas');
canvas.width = VIEWPORT_WIDTH;
canvas.height = VIEWPORT_HEIGHT;
document.body.appendChild(canvas);
const ctx = canvas.getContext('2d', { willReadFrequently: false })!;

const WORLD_W = 5000;
const WORLD_H = 3700;
// The layers size themselves off `WORLD_WIDTH`/`HEIGHT`, which are `let`s the
// map sets — without this they would be built for whatever the default is.
setWorldSize(WORLD_W, WORLD_H);

let seed = 12345;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

/** A fixed clock, so nothing ages out from under a run. */
const NOW = 1_000_000;

/** Two cameras: a player at `CAMERA_ZOOM`, and a spectator framing the city. */
const playerScale = CAMERA_ZOOM;
const playerView: Viewport = {
  x: WORLD_W / 2 - VIEWPORT_WIDTH / playerScale / 2,
  y: WORLD_H / 2 - VIEWPORT_HEIGHT / playerScale / 2,
  w: VIEWPORT_WIDTH / playerScale,
  h: VIEWPORT_HEIGHT / playerScale,
};
const specScale = Math.min(VIEWPORT_WIDTH / WORLD_W, VIEWPORT_HEIGHT / WORLD_H);
const specView: Viewport = {
  x: 0,
  y: 0,
  w: VIEWPORT_WIDTH / specScale,
  h: VIEWPORT_HEIGHT / specScale,
};

interface Case {
  label: string;
  view: Viewport;
  scale: number;
  smoothing: boolean;
  /** Keep the live decal list over its cap, so the overflow bake fires. */
  bakePerFrame: boolean;
  /** Skip the staging, so every blit is gated off — the early round. */
  clean?: boolean;
}

/** One frame of exactly the four layer draws, in the order `main.ts` makes them. */
function layerFrame(c: Case): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#0b0d10';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  setLayerBlitSmoothing(c.smoothing);
  ctx.save();
  ctx.scale(c.scale, c.scale);
  ctx.translate(-c.view.x, -c.view.y);

  if (c.bakePerFrame) {
    // What a busy street does: enough marks a frame to stay over the cap, so
    // `drawBlood`'s overflow path is baking into `stainLayer` as it blits it.
    for (let i = 0; i < 6; i++) {
      spawnBlood(rnd() * WORLD_W, rnd() * WORLD_H, rnd() * Math.PI * 2, NOW);
    }
  }

  drawBlood(ctx, c.view, NOW);
  drawGroundScorch(ctx, c.view);
  drawZombieCorpses(ctx, c.view, NOW);
  drawBulletHoles(ctx, c.view);

  ctx.restore();
  setLayerBlitSmoothing(true);
}

/**
 * Put every layer back to an identical late-round state.
 *
 * **Called before every single sample, and the first version of this rig was
 * not** — which is the whole reason its two runs disagreed by more than the
 * effect they were measuring. A `bakePerFrame` case leaves about a thousand
 * extra decals and a fuller stain layer behind it, so every case downstream
 * measured whatever the cases above it happened to leave: the same code read
 * "baking is free, -0.44ms" on one ordering and "+5.58ms" on another. State
 * that carries between cases is the rig reporting itself.
 *
 * The seed is reset with it, so the content is identical too — the blit
 * resamples a fixed-size surface either way, but the *bake* path is not
 * content-free and neither is a corpse list.
 */
function reset(dirty: boolean): void {
  seed = 12345;
  clearBlood();
  if (!dirty) return;

  // The real route a mark takes into `stainLayer`: spawned in the past, then
  // one `drawBlood` at a clock past the dry-down retires it.
  for (let i = 0; i < 900; i++) {
    spawnBlood(rnd() * WORLD_W, rnd() * WORLD_H, rnd() * Math.PI * 2, 0);
  }
  drawBlood(ctx, specView, BLOOD_DECAL_MS + 1);

  for (let i = 0; i < 120; i++) {
    spawnCorpse(rnd() * WORLD_W, rnd() * WORLD_H, rnd() * Math.PI * 2, 0);
  }
  drawZombieCorpses(ctx, specView, NOW);

  // These two bake on the spot.
  for (let i = 0; i < 600; i++) {
    spawnBulletHole(rnd() * WORLD_W, rnd() * WORLD_H, rnd() * Math.PI * 2, i);
  }
  for (let i = 0; i < 25; i++) {
    spawnPlasmaCrater(rnd() * WORLD_W, rnd() * WORLD_H, 4, i);
  }

  // Leave the live list just under its cap, so the steady state is a blit with
  // no bake unless a case asks for one.
  for (let i = 0; i < BLOOD_DECAL_MAX - 40; i++) {
    spawnBlood(rnd() * WORLD_W, rnd() * WORLD_H, rnd() * Math.PI * 2, NOW);
  }
}

/**
 * `getImageData` carries a fixed readback cost of several milliseconds, the
 * same order as the thing being measured — so each sample draws `REPEATS`
 * frames behind one readback and the fixed cost is divided away with the rest.
 * This is the trap `paintbench` already records: measure the readback and
 * "cheaper" configurations come out slower.
 */
const REPEATS = 8;
/**
 * How many times round the whole set. The cases are **interleaved** rather than
 * each run to completion, which is this project's own rule for an A/B: a busy
 * interval on the machine then hits every case rather than whichever one it
 * happened to land on.
 */
const ROUNDS = 21;

const lines: string[] = [];

function sample(c: Case): { issue: number; paint: number } {
  reset(!c.clean);
  for (let i = 0; i < 3; i++) layerFrame(c); // warm
  const t0 = performance.now();
  for (let r = 0; r < REPEATS; r++) layerFrame(c);
  const t1 = performance.now();
  ctx.getImageData(0, 0, 1, 1); // forces the queued drawing to be rasterised
  const t2 = performance.now();
  return { issue: (t1 - t0) / REPEATS, paint: (t2 - t1) / REPEATS };
}

function run(): void {
  const lw = Math.round(WORLD_W * BLOOD_BAKE_SCALE);
  const lh = Math.round(WORLD_H * BLOOD_BAKE_SCALE);

  const spec = { view: specView, scale: specScale };
  const play = { view: playerView, scale: playerScale };
  const cases: Case[] = [
    { label: 'SPECTATOR clean (early round)', ...spec, smoothing: true, bakePerFrame: false, clean: true },
    { label: 'PLAYER    clean (early round)', ...play, smoothing: true, bakePerFrame: false, clean: true },
    { label: 'SPECTATOR dirty (late round)', ...spec, smoothing: true, bakePerFrame: false },
    { label: 'SPECTATOR dirty, smoothing off', ...spec, smoothing: false, bakePerFrame: false },
    { label: 'SPECTATOR dirty + baking each frame', ...spec, smoothing: true, bakePerFrame: true },
    { label: 'PLAYER    dirty (late round)', ...play, smoothing: true, bakePerFrame: false },
    // Deliberately identical to the row above it. Whatever these two differ by
    // is what this machine cannot resolve, and nothing smaller than it is a
    // result. This row is what caught a "fix" that measured a third of it.
    { label: 'CONTROL   identical to the row above', ...play, smoothing: true, bakePerFrame: false },
  ];

  const issues: number[][] = cases.map(() => []);
  const paints: number[][] = cases.map(() => []);
  // Rotated, not just interleaved. A fixed order gives whichever case runs
  // last a systematically worse deal — GC accumulated over the round lands on
  // it — and the control is a case whose whole job is to read the same as the
  // one above it. Measured with a fixed order the control came out 2.84ms
  // *dearer* than the identical case it duplicates, which is the rig's own
  // ordering and not the machine's noise.
  for (let round = 0; round < ROUNDS; round++) {
    for (let k = 0; k < cases.length; k++) {
      const i = (k + round) % cases.length;
      const r = sample(cases[i]);
      issues[i].push(r.issue);
      paints[i].push(r.paint);
    }
  }

  lines.push('=== the three baked whole-world layers ===');
  lines.push(`  each layer  ${lw}x${lh} = ${((lw * lh) / 1e6).toFixed(1)}MP, ~${((lw * lh * 4) / 1048576).toFixed(0)}MB`);
  lines.push(`  city ${WORLD_W}x${WORLD_H}, backbuffer ${VIEWPORT_WIDTH}x${VIEWPORT_HEIGHT}`);
  lines.push(`  spectator scale ${specScale.toFixed(3)} · player scale ${playerScale.toFixed(2)}`);
  lines.push(`  ${ROUNDS} interleaved rounds, ${REPEATS} frames a sample, cheapest sample`);
  lines.push('');
  lines.push('  case                                    issue   paint   total   spread');

  const tot: number[] = [];
  for (let i = 0; i < cases.length; i++) {
    const totals = issues[i].map((v, k) => v + paints[i][k]);
    // The cheapest *whole* sample, not the floor of each half separately —
    // those would come from two different frames and need not add up to
    // anything that ever happened. Interference here is one-sided, so the
    // cheapest of many is the closest thing to the cost with nothing else in
    // the way.
    const at = totals.indexOf(Math.min(...totals));
    const sorted = [...totals].sort((a, b) => a - b);
    tot.push(totals[at]);
    lines.push(
      `  ${cases[i].label.padEnd(38)} ${issues[i][at].toFixed(2).padStart(6)}  ${paints[i][at]
        .toFixed(2)
        .padStart(6)}  ${totals[at].toFixed(2).padStart(6)}  ${sorted[0].toFixed(2)}-${sorted[
        sorted.length - 1
      ].toFixed(2)}`,
    );
  }

  const [specClean, playClean, specDirty, specFlat, specBake, playDirty, playControl] = tot;
  const floor = Math.abs(playDirty - playControl);

  lines.push('');
  lines.push('=== what that says ===');
  lines.push(`  NOISE FLOOR (the control, identical code)    ${floor.toFixed(2)}ms`);
  lines.push('');
  const verdict = (label: string, v: number): string =>
    `  ${label.padEnd(41)} ${v >= 0 ? '+' : ''}${v.toFixed(2)}ms  ${
      Math.abs(v) > floor * 2 ? '<- real' : '<- inside the noise'
    }`;
  lines.push(verdict('a late round costs a spectator', specDirty - specClean));
  lines.push(verdict('a late round costs a player', playDirty - playClean));
  lines.push(verdict('smoothing off would save a spectator', specDirty - specFlat));
  lines.push(verdict('baking while blitting adds', specBake - specDirty));
  lines.push('');
  lines.push('  (paint = what the rasteriser needed once the commands were in.');
  lines.push('   That is the half that lands in the frame gap as `elsewhere`,');
  lines.push('   and it is invisible to the `render` number on the HUD.)');

  clearBlood();
  out.textContent = lines.join('\n');
}

setTimeout(run, 200);
