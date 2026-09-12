/**
 * Writes the character sprites out as PNG contact sheets, so the art can be
 * looked at without starting a round.
 *
 *     cd client && npx tsx spritesheet.ts
 *
 * Headless — no socket, no port, so it leaves a game on 8080 alone. It drives
 * the real `charsprite.ts` the game draws with, so what comes out of here is
 * what the round shows.
 *
 * **It lives at `client/` root, so like the harnesses at `server/` root it is
 * NOT covered by `npx tsc --noEmit`** — the client tsconfig includes `src/**`
 * only. It also has no node types of its own, so the check has to borrow the
 * server's. Run this before trusting anything it prints:
 *
 *     npx tsc --noEmit --target ES2022 --module ESNext --moduleResolution Bundler \
 *       --strict --skipLibCheck --typeRoots ../server/node_modules/@types \
 *       --types node spritesheet.ts
 *
 * It is not academic: the first run of it found a duplicate key in the font
 * table below, which `tsx` had been happily stripping and ignoring.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import {
  Pix, blit, drawCharacter, look, hex, setFlatCharacters, characterPivotY, characterHeadAhead,
  type CharKind, type RGBA,
} from './src/charsprite.js';
import { POSE_GAIT, charGait, setLegacyGait } from './src/chargait.js';

/** `charbake.ts` imports the DOM, so its box constant is restated rather than pulled in. */
const CHAR_BOX_RADII_LOCAL = 4.6;

// ------------------------------------------------------------ png encoder ---
const CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}

function encodePng(w: number, h: number, rgba: Uint8ClampedArray): Buffer {
  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  const src = Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0;
    src.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// `URL.pathname` percent-encodes, and this repo lives under a path with spaces
// in it — left encoded, node cheerfully creates a directory called
// `Zombie%20simulator%20game` next door and writes the sheets into that.
const OUT = decodeURIComponent(new URL('./spritesheets/', import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, '$1');
mkdirSync(OUT, { recursive: true });
const save = (name: string, p: Pix): void => void writeFileSync(OUT + name, encodePng(p.w, p.h, p.d));

// ------------------------------------------------------------- a 3x5 font ---
const FONT: Record<string, string> = {
  A:'111101111101101', B:'110101110101110', C:'111100100100111', D:'110101101101110',
  E:'111100111100111', F:'111100111100100', G:'111100101101111', H:'101101111101101',
  I:'111010010010111', J:'001001001101010', K:'101101110101101', L:'100100100100111',
  M:'101111111101101', N:'110101101101101', O:'111101101101111', P:'111101111100100',
  Q:'111101101111001', R:'111101110101101', S:'111100111001111', T:'111010010010010',
  U:'101101101101111', V:'101101101101010', W:'101101111111101', X:'101101010101101',
  Y:'101101010010010', Z:'111001010100111',
  '0':'111101101101111','1':'010110010010111','2':'111001111100111','3':'111001111001111',
  '4':'101101111001001','5':'111100111001111','6':'111100111101111','7':'111001001001001',
  '8':'111101111101111','9':'111101111001111',
  ' ':'000000000000000','-':'000000111000000','.':'000000000000010',
  '(':'011010010010011', ')':'110010010010110', '/':'001001010100100', ':':'000010000010000',
};
function text(p: Pix, s: string, x: number, y: number, scale: number, col: RGBA): void {
  let cx = x;
  for (const ch of s.toUpperCase()) {
    const g = FONT[ch] ?? FONT[' '];
    for (let r = 0; r < 5; r++)
      for (let c = 0; c < 3; c++) {
        if (g[r * 3 + c] !== '1') continue;
        for (let sy = 0; sy < scale; sy++)
          for (let sx = 0; sx < scale; sx++) p.set(cx + c * scale + sx, y + r * scale + sy, col);
      }
    cx += 4 * scale;
  }
}

const GROUND = hex('#1b1d20');
const INK = hex('#8d949c');
const INK_HI = hex('#d8dde2');
const fill = (p: Pix, c: RGBA): void => {
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) p.set(x, y, c);
};

interface Row { kind: CharKind; label: string; n: number; pose?: 'aim' }
const ROWS: Row[] = [
  { kind: 'citizen', label: 'CITIZEN', n: 10 },
  { kind: 'officer', label: 'OFFICER / WALK', n: 10 },
  { kind: 'officer', label: 'OFFICER / AIM', n: 10, pose: 'aim' },
  { kind: 'zombie', label: 'ZOMBIE', n: 10 },
];
const posed = (row: Row, i: number) => {
  const o = look(row.kind, i + 1);
  if (row.pose) o.pose = row.pose;
  return o;
};

// -------------------------------------------------------- contact sheets ----
function sheet(S: number, scale: number, title: string): Pix {
  const cell = S * scale, gap = 14, padL = 20, padT = 58, labelH = 22, cols = 10;
  const p = new Pix(padL * 2 + cols * cell + (cols - 1) * gap, padT + ROWS.length * (cell + labelH + gap) + 20);
  fill(p, GROUND);
  text(p, title, padL, 20, 3, INK_HI);
  let y = padT;
  for (const row of ROWS) {
    text(p, row.label, padL, y, 2, INK);
    y += labelH;
    for (let i = 0; i < row.n; i++) blit(p, drawCharacter(S, posed(row, i)), padL + i * (cell + gap), y, scale);
    y += cell + gap;
  }
  return p;
}

save('preview-32.png', sheet(32, 6, 'ZOMBIE SIM - 32X32 SPRITES (SHOWN 6X)'));
save('preview-64.png', sheet(64, 3, 'ZOMBIE SIM - 64X64 SPRITES (SHOWN 3X)'));

// --------------------------------------------------- baked rotation sheet ---
{
  const N = 16, S = 32, scale = 5, gap = 10, padL = 20, padT = 56;
  const p = new Pix(padL * 2 + 8 * (S * scale + gap), padT + 2 * (S * scale + 34) + 40);
  fill(p, GROUND);
  text(p, 'SIXTEEN BAKED ANGLES - TURNED AS VECTORS, NOT AS PIXELS', padL, 20, 3, INK_HI);
  for (let i = 0; i < N; i++) {
    const o = look('officer', 3);
    o.rot = (i / N) * Math.PI * 2;
    const x = padL + (i % 8) * (S * scale + gap);
    const y = padT + Math.floor(i / 8) * (S * scale + 34);
    blit(p, drawCharacter(S, o), x, y, scale);
    text(p, String(Math.round((i * 360) / N)), x, y + S * scale + 6, 2, INK);
  }
  save('preview-rotation.png', p);
}

// ------------------------------------------------------ how far it scales ---
{
  const S = 32, scale = 4, gap = 6, padL = 20, padT = 52, cols = 24;
  const p = new Pix(padL * 2 + cols * (S * scale + gap), padT + 6 * (S * scale + gap) + 16);
  fill(p, GROUND);
  text(p, '144 BODIES, NONE OF THEM AUTHORED - ALL OF IT ONE FUNCTION AND A SEED', padL, 18, 3, INK_HI);
  for (let i = 0; i < 144; i++) {
    const kind: CharKind = i % 6 === 5 ? 'zombie' : 'citizen';
    blit(p, drawCharacter(S, look(kind, 100 + i)), padL + (i % cols) * (S * scale + gap), padT + Math.floor(i / cols) * (S * scale + gap), scale);
  }
  save('preview-variety.png', p);
}

// ------------------------------------------------------- the walk cycle -----
/**
 * The seven baked poses laid out left to right through half a stride, from the
 * left arm fully back to fully forward — the sway the tracker walks a body
 * through, a third of the swing at a time.
 *
 * **The arrow is the point of the sheet.** It is the direction the game says
 * the body is travelling, sprung from the sprite's own pivot, and the question
 * it asks is the one that was reported: *does this look like somebody walking
 * that way*. Without it a walk sheet is poses nobody can grade.
 */
const ARROW = hex('#e02424');
function arrow(p: Pix, cx: number, cy: number, a: number, len: number, from: number): void {
  const dx = Math.cos(a), dy = Math.sin(a);
  for (let t = from; t <= len; t++)
    for (let w = -2; w <= 2; w++)
      p.set(Math.round(cx + dx * t - dy * w), Math.round(cy + dy * t + dx * w), ARROW);
  for (let t = 0; t <= 12; t++) {
    const hw = 8 - t * 0.63;
    for (let w = -hw; w <= hw; w++)
      p.set(Math.round(cx + dx * (len - 12 + t) - dy * w), Math.round(cy + dy * (len - 12 + t) + dx * w), ARROW);
  }
}
{
  const S = 64, scale = 4, gap = 14, padL = 20, padT = 56;
  const GAIT = [-1, -2 / 3, -1 / 3, 0, 1 / 3, 2 / 3, 1];
  const SEEDS = [401, 404, 409];
  const cell = S * scale;
  const p = new Pix(padL * 2 + GAIT.length * (cell + gap), padT + SEEDS.length * (cell + 40) + 20);
  fill(p, GROUND);
  text(p, 'THE SWAY - SEVEN POSES, A THIRD OF THE SWING APART. THE ARROW IS WHERE THE BODY IS GOING', padL, 20, 3, INK_HI);
  SEEDS.forEach((seed, row) => {
    const y = padT + row * (cell + 40);
    text(p, `SEED ${seed}`, padL, y - 14, 2, INK);
    for (let i = 0; i < GAIT.length; i++) {
      const o = look('citizen', seed);
      o.gait = GAIT[i];
      const x = padL + i * (cell + gap);
      blit(p, drawCharacter(S, o), x, y, scale);
      arrow(p, x + cell * 0.5, y + cell * characterPivotY(), -Math.PI / 2, cell * 0.42, cell * 0.2);
    }
  });
  save('preview-walk.png', p);
}

// ----------------------------------------------- what it looks like in game --
/**
 * The one sheet that answers a question the others cannot: what a crowd of
 * these looks like *at the size the game draws a body*, against the disc it
 * draws today.
 *
 * Both halves are staged from the same positions and the same facings, on the
 * game's own ground colour and at the camera's own zoom, so the only thing that
 * differs between them is the drawing.
 */
{
  const HUMAN_RADIUS = 13;
  const CAMERA_ZOOM = 2; // what the game frames a player's view at
  const CHAR_SPRITE_PX = 64;
  const CHAR_BOX_RADII = CHAR_BOX_RADII_LOCAL;
  // Asked for rather than written down: this was a third copy of the pivot and
  // it silently went stale the day the body's middle moved.
  const PIVOT_Y = characterPivotY();

  // A staged crowd: a phyllotaxis spiral so it is evenly spread and identical
  // between the two halves, rather than a grid, which reads as a parade.
  const N = 26;
  const crowd = Array.from({ length: N }, (_, i) => {
    const a = i * 2.399963;
    const d = 30 + Math.sqrt(i / N) * 190;
    return { x: Math.cos(a) * d, y: Math.sin(a) * d * 0.72, facing: a * 1.7, seed: 300 + i };
  });

  const halfW = 540, halfH = 420;
  const p = new Pix(halfW * 2 + 30, halfH + 60);
  fill(p, GROUND);
  text(p, 'THE SAME CROWD, THE SAME PLACES, AT THE CAMERA ZOOM THE GAME USES', 20, 16, 3, INK_HI);
  text(p, 'NOW - A DISC, A HEAD AND TWO ARM NUBS', 20, 40, 2, INK);
  text(p, 'PIXEL SPRITES', halfW + 30, 40, 2, INK);

  const dot = (cx: number, cy: number, r: number, col: RGBA): void => {
    for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++)
      for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++)
        if (dx * dx + dy * dy <= r * r) p.set(Math.round(cx + dx), Math.round(cy + dy), col);
  };

  for (const c of crowd) {
    // --- left: the drawing the game does today, replicated
    const lx = 20 + halfW / 2 + c.x * CAMERA_ZOOM * 0.55;
    const ly = 60 + halfH / 2 + c.y * CAMERA_ZOOM * 0.55;
    const r = HUMAN_RADIUS * CAMERA_ZOOM * 0.55;
    const dirX = Math.cos(c.facing), dirY = Math.sin(c.facing);
    for (const s of [-1, 1]) {
      const sx = lx + -dirY * r * 0.5 * s, sy = ly + dirX * r * 0.5 * s;
      dot(sx + -dirY * r * 0.4 * s, sy + dirX * r * 0.4 * s, r * 0.2, hex('#16a34a'));
      dot(sx, sy, r * 0.2, hex('#16a34a'));
    }
    dot(lx, ly, r, hex('#22c55e'));
    dot(lx + dirX * r * 0.28, ly + dirY * r * 0.28, r * 0.5, hex('#166534'));

    // --- right: the sprite, at the world size and pivot `charbake.ts` uses
    const o = look('citizen', c.seed);
    // the same quantised angle the atlas bakes, so this is not a flattering
    // preview at some angle the game would never actually pick
    const ai = Math.round(((c.facing + Math.PI / 2) / (Math.PI * 2)) * 16);
    o.rot = ((ai % 16) / 16) * Math.PI * 2;
    const spr = drawCharacter(CHAR_SPRITE_PX, o);
    const size = Math.round(HUMAN_RADIUS * CHAR_BOX_RADII * CAMERA_ZOOM * 0.55);
    const rx = halfW + 30 + halfW / 2 + c.x * CAMERA_ZOOM * 0.55 - size * 0.5;
    const ry = 60 + halfH / 2 + c.y * CAMERA_ZOOM * 0.55 - size * PIVOT_Y;
    const s = size / CHAR_SPRITE_PX;
    for (let sy = 0; sy < size; sy++)
      for (let sx = 0; sx < size; sx++) {
        const q = spr.d;
        const oi = (Math.floor(sy / s) * CHAR_SPRITE_PX + Math.floor(sx / s)) * 4;
        if (q[oi + 3] === 0) continue;
        p.set(Math.round(rx + sx), Math.round(ry + sy), [q[oi], q[oi + 1], q[oi + 2], q[oi + 3]]);
      }
  }
  save('preview-ingame.png', p);
}

console.log(`wrote 5 sheets to ${OUT}`);

// ------------------------------------------------- does it face where it goes --
/**
 * The three claims behind the top-down pass, as numbers.
 *
 * `setFlatCharacters` is the gate and it is **kept**: every figure here is a
 * gain against a control, and "the forward hand reaches 20px in front of the
 * shoulders" says nothing at all without "it was 7px, and that 7px was an
 * *elbow*".
 *
 * **The arm is isolated geometrically** — ink outside both the torso's own
 * bounding disc and the head's. Two earlier cuts of this lied and are worth not
 * repeating: matching the skin colour caught the head, and for two of the
 * sixteen shirts (the pale tans) it caught the shirt; and diffing a pass frame
 * against a step frame caught the torso TWIST, which moves the shoulder's
 * leading edge and reported the old arms as reaching forward when they cannot.
 * The head disc has to be `headR * 1.38` rather than the crown itself, because
 * a cap's PEAK reaches `headR * 1.24` and at 1.12 a hat read as an arm.
 */
{
  const S = 64;
  const SH_Y = 0.505;
  const BOX = Math.round(13 * CHAR_BOX_RADII_LOCAL * 2); // radius x box x CAMERA_ZOOM
  const solid = (p: Pix, i: number): boolean =>
    p.d[i + 3] >= 200 && p.d[i] * 0.3 + p.d[i + 1] * 0.6 + p.d[i + 2] * 0.1 >= 14; // skips shadow + outline
  const med = (a: number[]): number => [...a].sort((x, y) => x - y)[a.length >> 1];
  const px = (f: number): string => `${f >= 0 ? '+' : ''}${(f * BOX).toFixed(1)}px`;

  console.log('\nfacing vs travel, 24 seeds, medians. north-facing, so smaller y is FORWARD.');
  console.log(`a body is ${BOX} screen px across at CAMERA_ZOOM 2; the shoulder line is ${SH_Y}.\n`);
  console.log('             spread        mass behind its    forward-most limb');
  console.log('           head to foot    own coordinate     ink vs the shoulders');
  for (const flatPose of [true, false]) {
    setFlatCharacters(flatPose);
    const piv = characterPivotY();
    const headR0 = flatPose ? 0.128 : 0.106;
    const headAhead = characterHeadAhead();
    const sp: number[] = [], ms: number[] = [], ar: number[] = [];
    for (let seed = 400; seed < 424; seed++) {
      const o = look('citizen', seed);
      const b = o.build;
      const torsoR = Math.hypot(0.2 * b, 0.132 * b) * 1.02;
      const headR = headR0 + (b - 1) * 0.03;
      const headY = SH_Y - headAhead;
      let lo = 9, hi = -9, sy = 0, n = 0, arm = 9;
      for (const gait of [0, 1]) {
        const spr = drawCharacter(S, { ...o, gait });
        for (let y = 0; y < S; y++)
          for (let x = 0; x < S; x++) {
            const i = (y * S + x) * 4;
            if (!solid(spr, i)) continue;
            const u = (x + 0.5) / S, v = (y + 0.5) / S;
            if (gait === 0) { lo = Math.min(lo, v); hi = Math.max(hi, v); sy += v; n++; }
            if (
              gait === 1 &&
              Math.hypot(u - 0.5, v - SH_Y) > torsoR &&
              Math.hypot(u - (0.5 + o.lean), v - headY) > headR * 1.38
            )
              arm = Math.min(arm, v);
          }
      }
      sp.push(hi - lo); ms.push(sy / n - piv); ar.push(arm - SH_Y);
    }
    console.log(
      `${flatPose ? 'BEFORE' : 'NOW   '}   ${med(sp).toFixed(3)} (${(med(sp) * BOX).toFixed(0)}px)` +
      `      ${px(med(ms))}             ${px(med(ar))}`);
  }
  setFlatCharacters(false);
  console.log('\na negative last column is limb ink IN FRONT of the shoulder line. Before the');
  console.log('change that 7px is the ELBOW bulging past the torso; no hand ever cleared the');
  console.log('shoulders at all, so every limb outside the body was behind it.');
}

// ------------------------------------------------------------ what it costs --
// `charbake.ts` bakes lazily, so this is the figure that decides whether that
// is safe: a hitch is one frame's worth of first-sightings, not the whole set.
{
  for (const S of [32, 64]) {
    const t0 = performance.now();
    let n = 0;
    for (let v = 0; v < 48; v++)
      for (let a = 0; a < 16; a++) {
        const o = look('citizen', v + 1);
        o.rot = (a / 16) * Math.PI * 2;
        drawCharacter(S, o);
        n++;
      }
    const ms = performance.now() - t0;
    console.log(`bake ${S}px: ${n} sprites in ${ms.toFixed(0)}ms = ${(ms / n).toFixed(3)}ms each`);
  }
}

// ---------------------------------------------------------- does it fit the cell --
/**
 * `charbake.ts` keeps only a 48px square of the 64px box, centred on the pivot,
 * which is what let the walk go to seven poses without the atlas doubling. That
 * is only safe if nothing is ever drawn outside the square, so every variant,
 * angle and pose of every kind is checked — officers aiming too, since they
 * reach furthest — rather than the handful a sheet happens to show.
 */
{
  const S = 64;
  const piv = characterPivotY();
  const CELL = 48;
  const X0 = (S - CELL) >> 1;
  const Y0 = Math.round(S * piv - CELL / 2);
  let outside = 0;
  let worst = Infinity;
  let worstAt = '';
  for (const kind of ['citizen', 'officer', 'zombie'] as const)
    for (let v = 1; v <= 32; v++)
      for (let a = 0; a < 16; a++)
        for (const gait of POSE_GAIT)
          for (const pose of kind === 'officer' ? (['walk', 'aim'] as const) : (['walk'] as const)) {
            const o = look(kind, v);
            o.rot = (a / 16) * Math.PI * 2;
            o.gait = gait;
            o.pose = pose;
            const spr = drawCharacter(S, o);
            for (let y = 0; y < S; y++)
              for (let x = 0; x < S; x++) {
                if (spr.d[(y * S + x) * 4 + 3] === 0) continue;
                const edge = Math.max(X0 - x, x - (X0 + CELL - 1), Y0 - y, y - (Y0 + CELL - 1));
                if (edge > 0) outside++;
                const margin = Math.min(x - X0, X0 + CELL - 1 - x, y - Y0, Y0 + CELL - 1 - y);
                if (margin < worst) {
                  worst = margin;
                  worstAt = `${kind}${pose === 'aim' ? '/aim' : ''} v${v} angle ${a} gait ${gait.toFixed(2)}`;
                }
              }
          }
  console.log(`\ncell ${CELL}px from (${X0},${Y0}): ${outside} pixels outside it across every kind, variant, angle and pose;`);
  console.log(`closest any ink comes to the cell's edge: ${worst}px, ${worstAt}`);
}

// ------------------------------------------------------------------ the walk --
/**
 * The walk, driven the way the game drives it and measured rather than watched.
 *
 * rAF is throttled to nothing while the browser pane is not compositing, so a
 * walk cannot be looked at from here — but `charGait` has no DOM, so the whole
 * path can be replayed: a server moving a body at a fixed speed on a 30Hz tick,
 * **rounding it to whole pixels the way the wire does**, snapshots arriving
 * with a few milliseconds of jitter, the client's own interpolation as
 * `main.ts` writes it, and the tracker called once per rendered frame at 60Hz
 * and at 144Hz. `setLegacyGait` is the control.
 *
 * *Pose changes a second* is the jiggle; *undone inside 100ms* is the part of it
 * that is pure flicker — a pose that changes and changes straight back before
 * the eye could read it as movement. *Steps a second* is how many times the
 * body passes through the pass pose. *Drawn pace* is the drawn body's speed over
 * 40ms windows as a share of its true speed, p5 and p95, which is the surge.
 */
{
  const TICK = 1000 / 30;
  type Run = { changes: number; undone: number; steps: number; lo: number; hi: number; maxOff: number };
  const simulate = (speed: number, fps: number, legacyOn: boolean, jostle = false): Run => {
    setLegacyGait(legacyOn);
    let seed = 12345;
    const rand = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
    const id = 'sim';
    const dur = 12000;
    const frameMs = 1000 / fps;
    // state as main.ts holds it
    let fromX = 0, toX = 0, drawnX = 0, snapshotAt = 0, snapshotGap = TICK;
    let nextTick = 0, tickN = 0;
    let arrival = 0;
    let serverX = 0;
    let lastFrame = 0, prevFrame = 0, lastChangeAt = -1e9, changes = 0, undone = 0, steps = 0;
    const samples: { t: number; drawn: number; truth: number }[] = [];
    let maxOff = 0;
    for (let now = 0; now < dur; now += frameMs) {
      // snapshots that have arrived by now
      while (arrival <= now) {
        serverX = jostle ? Math.round(Math.sin(tickN * 1.7) * 2 + (rand() - 0.5) * 2) : Math.round((speed * tickN) / 30);
        const gap = arrival - snapshotAt;
        if (snapshotAt > 0 && gap > 4 && gap < 400) snapshotGap = snapshotGap * 0.8 + gap * 0.2;
        snapshotAt = arrival;
        fromX = drawnX;
        toX = serverX;
        tickN++;
        nextTick += TICK;
        arrival = nextTick + rand() * 8;
      }
      const t = Math.min(1, Math.max(0, (now - snapshotAt) / snapshotGap));
      drawnX = fromX + (toX - fromX) * t;
      const g = charGait(id, drawnX, 0, 0, now);
      if (now < 2000) { lastFrame = g.frame; continue; }
      samples.push({ t: now, drawn: drawnX + g.dx, truth: drawnX });
      maxOff = Math.max(maxOff, Math.abs(g.dx));
      if (g.frame !== lastFrame) {
        changes++;
        if (g.frame === prevFrame && now - lastChangeAt < 100) undone++;
        if (g.frame === 0) steps++;
        prevFrame = lastFrame;
        lastFrame = g.frame;
        lastChangeAt = now;
      }
    }
    const secs = (dur - 2000) / 1000;
    const ratios: number[] = [];
    for (let i = 0, j = 0; i < samples.length; i++) {
      while (j < samples.length && samples[j].t - samples[i].t < 40) j++;
      if (j >= samples.length) break;
      const dt = (samples[j].t - samples[i].t) / 1000;
      ratios.push((samples[j].drawn - samples[i].drawn) / dt / Math.max(1, speed));
    }
    ratios.sort((a, b) => a - b);
    const q = (f: number) => (ratios.length ? ratios[Math.floor(f * (ratios.length - 1))] : 0);
    setLegacyGait(false);
    return { changes: changes / secs, undone: undone / secs, steps: steps / secs, lo: q(0.05), hi: q(0.95), maxOff };
  };

  const f1 = (n: number) => n.toFixed(1).padStart(5);
  console.log('\nthe walk, a simulated 30Hz whole-pixel feed with jitter. OLD is setLegacyGait.');
  console.log('                       pose changes/s   undone <100ms/s   steps/s      drawn pace p5..p95   offset');
  for (const speed of [13, 30, 35, 60, 83])
    for (const fps of [60, 144]) {
      const o = simulate(speed, fps, true);
      const n = simulate(speed, fps, false);
      console.log(
        `${String(speed).padStart(3)}px/s @${String(fps).padStart(3)}Hz` +
        `      ${f1(o.changes)} -> ${f1(n.changes)}   ${f1(o.undone)} -> ${f1(n.undone)}   ${f1(o.steps)} -> ${f1(n.steps)}` +
        `   ${o.lo.toFixed(2)}..${o.hi.toFixed(2)} -> ${n.lo.toFixed(2)}..${n.hi.toFixed(2)}   ${n.maxOff.toFixed(1)}px`);
    }
  for (const fps of [60, 144]) {
    const o = simulate(0, fps, true, true);
    const n = simulate(0, fps, false, true);
    console.log(`jostled in place @${fps}Hz: pose changes/s ${f1(o.changes)} -> ${f1(n.changes)}, undone ${f1(o.undone)} -> ${f1(n.undone)}, offset ${n.maxOff.toFixed(1)}px`);
  }
}
{
  /**
   * Stopping, and a heading wobbling on the line between two baked angles.
   *
   * A body that stops must settle square and on its own coordinate — the
   * offset is a drawing, and one left behind is a body standing a few pixels
   * from where it is. And a civilian's heading wobbles a degree or two walking
   * through a crowd; sat on a boundary that flicked the whole sprite 22.5
   * degrees back and forth, which is a jiggle of its own.
   */
  const frameMs = 1000 / 144;
  for (const legacyOn of [true, false]) {
    setLegacyGait(legacyOn);
    let x = 0, settledAt = -1;
    for (let now = 0; now < 6000; now += frameMs) {
      if (now < 3000) x += (35 * frameMs) / 1000;
      const g = charGait('stop', x, 0, 0, now);
      if (now >= 3000 && settledAt < 0 && g.frame === 0 && Math.abs(g.dx) < 0.25) settledAt = now - 3000;
      if (now >= 3000 && settledAt >= 0 && (g.frame !== 0 || Math.abs(g.dx) >= 0.25)) settledAt = -1;
    }
    let changes = 0, last = -1;
    for (let now = 0; now < 5000; now += frameMs) {
      const boundary = ((0.5 + 3) / 16) * Math.PI * 2 - Math.PI / 2; // between angles 3 and 4
      const wob = Math.sin(now * 0.013) * 0.03 + Math.sin(now * 0.041) * 0.015; // about 2.5 degrees
      const g = charGait('wobble', 0, 0, boundary + wob, now);
      if (last >= 0 && g.angle !== last) changes++;
      last = g.angle;
    }
    console.log(
      `${legacyOn ? 'OLD' : 'NEW'}: stopped from 35px/s, square and on its coordinate after ${settledAt.toFixed(0)}ms;` +
      ` heading wobbling 2.5 degrees on an angle boundary turns the sprite ${(changes / 5).toFixed(1)} times a second`);
  }
  setLegacyGait(false);
}
