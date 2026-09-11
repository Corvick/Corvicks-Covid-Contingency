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
import { Pix, blit, drawCharacter, look, hex, type CharKind, type RGBA } from './src/charsprite.js';

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
 * The four-beat cycle laid out left to right, with the pass frame appearing
 * twice because that is what three baked poses buy. Four bodies down so the
 * swing can be compared across builds rather than across one lucky seed.
 */
{
  const S = 64, scale = 4, gap = 12, padL = 20, padT = 56;
  const GAIT = [0, 1, 0, -1];
  const cell = S * scale;
  const p = new Pix(padL * 2 + GAIT.length * (cell + gap), padT + 4 * (cell + gap) + 20);
  fill(p, GROUND);
  text(p, 'THE WALK - PASS, STEP, PASS, STEP (THREE BAKED POSES)', padL, 20, 3, INK_HI);
  for (let row = 0; row < 4; row++)
    for (let i = 0; i < GAIT.length; i++) {
      const o = look('citizen', 400 + row);
      o.gait = GAIT[i];
      blit(p, drawCharacter(S, o), padL + i * (cell + gap), padT + row * (cell + gap), scale);
    }
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
  const CHAR_BOX_RADII = 4.6;
  const PIVOT_Y = 0.44;

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
