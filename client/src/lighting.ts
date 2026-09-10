/**
 * **The night pass — a darkness laid over the scene, punched back by light.**
 *
 * The grim-and-dirty art (grime, vignette, blood, corpses) is "the beginning of
 * the final look, not the end of it." This is the other cheap half of the mood:
 * the city is dark, and what you can see is what something is lighting — a
 * muzzle flash, a fire, an explosion, the torch you are carrying. It does more
 * for horror per millisecond than new character art, and it makes the *current*
 * flat shapes read as dread.
 *
 * **How it works** — one half-resolution mask, the same shape as `drawFog`'s:
 *
 *  1. fill it with the ambient night colour (not black — you can still make out
 *     shapes, or the game is unplayable),
 *  2. `lighter`-composite a soft radial gradient for every light on top, so lit
 *     ground goes toward white and coloured light tints,
 *  3. blit the mask over the scene with `multiply`: black → ×0, white → ×1,
 *     colour → tinted.
 *
 * Then a small additive pass draws the *cores* — the flash and the fire you
 * actually see — so fire looks like fire rather than merely "an area that is
 * less dark."
 *
 * **Gated, and off by default.** It darkens the whole screen and changes how
 * readable a fight is, so it is a deliberate choice, not the shipped look — the
 * same standing as `noFog`. Composited *under* the fog (drawn before it), so
 * genuinely unseen ground is still fully black regardless of any light near it.
 */

let night = false;

export function setNightLighting(v: boolean): void {
  night = v;
}

export function nightLightingOn(): boolean {
  return night;
}

export interface Light {
  /** World coordinates. */
  x: number;
  y: number;
  /** World radius of the pool. */
  r: number;
  /** 0..1. Scales how far toward lit the pool pushes, and the core's alpha. */
  intensity: number;
  /** [r,g,b] 0..255. Warm for fire/flash, cool for a carried light. */
  color: [number, number, number];
  /** Draw an additive core (fire, flash). A carried torch gets none. */
  core?: boolean;
}

/**
 * The ambient night colours. `player` is what an officer's own torch has to dig
 * a hole in; `spectator` is lighter because a watcher has no personal light and
 * still has to read the board. Neither is black.
 */
/**
 * Not black. Under a `multiply` blit this is a fraction: `[42,46,58]` leaves
 * unlit ground at about a sixth of its daytime value — plainly night, but you
 * can still make out a shape moving in it. A spectator, who has no torch, gets
 * a good deal more.
 */
const AMBIENT = {
  player: [42, 46, 58] as [number, number, number],
  spectator: [74, 78, 92] as [number, number, number],
};

/** Half-res, like the fog mask — its blur and blit come down with it. */
const MASK_SCALE = 0.5;

let mask: HTMLCanvasElement | null = null;
let mctx: CanvasRenderingContext2D | null = null;

function ensureMask(w: number, h: number): CanvasRenderingContext2D {
  const mw = Math.ceil(w * MASK_SCALE);
  const mh = Math.ceil(h * MASK_SCALE);
  if (!mask || mask.width !== mw || mask.height !== mh) {
    mask = mask ?? document.createElement('canvas');
    mask.width = mw;
    mask.height = mh;
    mctx = mask.getContext('2d')!;
  }
  return mctx!;
}

/** Cheap deterministic flicker, no per-frame state — the acid-churn shape. */
function flicker(now: number, seed: number): number {
  const t = now * 0.017 + seed;
  return 0.82 + 0.18 * (Math.sin(t) * 0.6 + Math.sin(t * 2.3 + 1.7) * 0.4);
}

/**
 * @param view   the world rect currently on screen
 * @param scale  world→screen pixels (so a world light lands in the right place)
 * @param lights every light source this frame, in world coordinates
 * @param mode   'player' | 'spectator' — picks the ambient darkness
 */
export function drawNightLighting(
  ctx: CanvasRenderingContext2D,
  view: { x: number; y: number; w: number; h: number },
  scale: number,
  lights: Light[],
  now: number,
  vw: number,
  vh: number,
  mode: 'player' | 'spectator',
): void {
  const g = ensureMask(vw, vh);
  const s = scale * MASK_SCALE;
  const mw = Math.ceil(vw * MASK_SCALE);
  const mh = Math.ceil(vh * MASK_SCALE);

  const amb = AMBIENT[mode];
  g.globalCompositeOperation = 'source-over';
  g.fillStyle = `rgb(${amb[0]}, ${amb[1]}, ${amb[2]})`;
  g.fillRect(0, 0, mw, mh);

  // Lit pools: add toward white/tint. `lighter` so overlapping lights stack.
  g.globalCompositeOperation = 'lighter';
  for (const L of lights) {
    const sx = (L.x - view.x) * s;
    const sy = (L.y - view.y) * s;
    const sr = L.r * s;
    if (sx + sr < 0 || sx - sr > mw || sy + sr < 0 || sy - sr > mh) continue;
    const fl = L.core ? flicker(now, sx * 0.7 + sy) : 1;
    const k = Math.max(0, Math.min(1, L.intensity * fl));
    const grad = g.createRadialGradient(sx, sy, 0, sx, sy, sr);
    // Toward the light's own colour at the centre, falling to nothing. The
    // multiply blit then tints and brightens the scene under it — so a bright
    // white-ish centre restores the scene to near full value there.
    const c0 = [
      Math.min(255, L.color[0] + 60),
      Math.min(255, L.color[1] + 60),
      Math.min(255, L.color[2] + 60),
    ];
    grad.addColorStop(0, `rgba(${c0[0]}, ${c0[1]}, ${c0[2]}, ${k})`);
    grad.addColorStop(0.4, `rgba(${L.color[0]}, ${L.color[1]}, ${L.color[2]}, ${0.55 * k})`);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(sx, sy, sr, 0, Math.PI * 2);
    g.fill();
  }
  g.globalCompositeOperation = 'source-over';

  // Blit the mask over the world. `multiply`: dark stays dark, lit comes back.
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(mask!, 0, 0, mw, mh, 0, 0, vw, vh);
  ctx.restore();

  // The cores — the flash and the fire you actually see, added on top so they
  // glow rather than just failing to be dark. Screen space, few of them.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const L of lights) {
    if (!L.core) continue;
    const sx = (L.x - view.x) * scale;
    const sy = (L.y - view.y) * scale;
    const cr = L.r * scale * 0.6;
    if (sx + cr < 0 || sx - cr > vw || sy + cr < 0 || sy - cr > vh) continue;
    const fl = flicker(now, sx * 0.7 + sy);
    const k = Math.max(0, Math.min(1, L.intensity * fl));
    const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, cr);
    grad.addColorStop(0, `rgba(${L.color[0]}, ${L.color[1]}, ${L.color[2]}, ${0.62 * k})`);
    grad.addColorStop(0.5, `rgba(${L.color[0]}, ${L.color[1]}, ${L.color[2]}, ${0.22 * k})`);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(sx, sy, cr, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
