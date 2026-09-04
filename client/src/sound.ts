import type { Wall } from '../../shared/types.js';
import { DOG_ROAR_MS } from '../../shared/constants.js';

/**
 * The game's noises, all of them.
 *
 * **Mostly recorded, with synthesis as the fallback while a recording is still
 * loading (or in case it never does).** The dog's roar and the zombies' bark
 * are still built from oscillators — see `synthesizeZombieGroan` and
 * `synthesizeZombieAttack` further down — but a raw sawtooth voice is a hard
 * way to sound like a throat, so the zombies' everyday groan and bite are now
 * a handful of short, freely-licensed recordings under `client/public/sfx/`
 * (see `CREDITS.md` there) instead. Everything downstream of a sound existing
 * — `spatialOutput`, distance, pan, muffle — has no idea which of the two made
 * it: both a recording and an oscillator are just an `AudioNode` by the time
 * they reach it.
 *
 * The context is made **lazily and resumed on use**. A browser will not start
 * one before a gesture, and building it at module load gets a context stuck in
 * `suspended` that then has to be noticed and revived — where creating it on
 * the first sound means it is created inside a keypress, which is a gesture.
 */
let ctx: AudioContext | null = null;
/** White noise, built once. The hiss is a filtered slice of this. */
let noise: AudioBuffer | null = null;

function audio(): AudioContext | null {
  if (ctx) {
    // Tabbing away suspends it; coming back has to be enough to wake it.
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  }
  const Ctor: typeof AudioContext | undefined =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
  } catch {
    return null; // no audio device, or the page is not allowed one. Not fatal.
  }
  // Kicked off the moment there is a context to decode into, rather than on
  // the first groan — a round's first zombie is usually still several
  // seconds off by the time a player has so much as clicked PLAY, which is
  // normally enough for eleven small files to be ready before anything asks.
  loadZombieVoices(ctx);
  return ctx;
}

/**
 * Cut everything off outright — leaving a round, or quitting to the menu.
 *
 * Closing the context stops the whole graph in one call rather than tracking
 * every oscillator and buffer source this file has ever started so each can
 * be told to stop individually; a groan mid-play does not get to finish
 * itself out over the menu just because it was already running.
 *
 * The next sound simply builds a fresh context — `audio()` already copes with
 * `ctx` being null, which is its ordinary first-launch state — and the
 * decoded recordings are untouched by any of this: an `AudioBuffer` is plain
 * data, not tied to the context that decoded it, so nothing needs reloading.
 */
export function stopAllSounds(): void {
  if (!ctx) return;
  void ctx.close();
  ctx = null;
}

function noiseBuffer(ac: AudioContext): AudioBuffer {
  if (noise && noise.sampleRate === ac.sampleRate) return noise;
  const seconds = 3;
  const buf = ac.createBuffer(1, Math.ceil(ac.sampleRate * seconds), ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  noise = buf;
  return buf;
}

/**
 * How loud, which way, and how muffled — the whole of what makes a sound feel
 * like it is coming from somewhere in the city rather than out of the speakers
 * flat. Worked out by the caller, who knows where the listener is and what the
 * map looks like; this file only ever turns three numbers into an audio graph.
 */
export interface Spatial {
  /** 0-1 linear volume, after distance and (for a pulled-back spectator) the
   *  whole mix's own falloff have already been applied. */
  gain: number;
  /** -1 hard left to 1 hard right. */
  pan: number;
  /** 0 clear, 1 heard through a wall. */
  muffle: number;
}

/**
 * How many solid walls stand on the straight line between two points, capped
 * at 3 — past that a sound is already as dull as this engine can make it, and
 * there is no reason to keep testing.
 *
 * The same slab method `fog.ts`'s own rays use, bounded to the segment itself
 * rather than cast to infinity: a sound does not care what is behind its
 * source, only what stands between it and the ear. Kept here rather than in
 * `fog.ts` because it is an audio question — "how muffled" — and not a sight
 * one, even though the geometry test underneath it is the same.
 */
export function occlusion(x1: number, y1: number, x2: number, y2: number, walls: Wall[]): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const minX = Math.min(x1, x2);
  const maxX = Math.max(x1, x2);
  const minY = Math.min(y1, y2);
  const maxY = Math.max(y1, y2);
  let hits = 0;
  for (const w of walls) {
    if (w.x + w.w < minX || w.x > maxX || w.y + w.h < minY || w.y > maxY) continue;
    let tmin = 0;
    let tmax = 1;
    if (Math.abs(dx) < 1e-9) {
      if (x1 < w.x || x1 > w.x + w.w) continue;
    } else {
      let t1 = (w.x - x1) / dx;
      let t2 = (w.x + w.w - x1) / dx;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
    }
    if (Math.abs(dy) < 1e-9) {
      if (y1 < w.y || y1 > w.y + w.h) continue;
    } else {
      let t1 = (w.y - y1) / dy;
      let t2 = (w.y + w.h - y1) / dy;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
    }
    if (tmax >= tmin && tmax >= 0 && tmin <= 1) {
      hits++;
      if (hits >= 3) break;
    }
  }
  return hits;
}

/**
 * Wires a lowpass and a stereo pan onto whatever a voice plays into, and
 * returns the gain node to build that voice on top of.
 *
 * One chain for every positional sound in the game — a zombie's groan and the
 * dog's roar both end up here, so "quiet, off to the left, and dulled by a
 * wall" means the same three nodes whatever is making the noise.
 */
function spatialOutput(ac: AudioContext, spatial: Spatial): GainNode {
  const bus = ac.createGain();
  bus.gain.value = Math.max(0, Math.min(1, spatial.gain));
  let node: AudioNode = bus;
  if (spatial.muffle > 0.02) {
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    // Clear runs out past hearing; fully muffled falls to a couple hundred
    // hertz — the cliché of a voice heard through a wall, and it is one for a
    // reason.
    lp.frequency.value = 8000 - Math.min(1, spatial.muffle) * 7500;
    lp.Q.value = 0.6;
    node.connect(lp);
    node = lp;
  }
  if (typeof ac.createStereoPanner === 'function') {
    const panner = ac.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, spatial.pan));
    node.connect(panner);
    panner.connect(ac.destination);
  } else {
    node.connect(ac.destination);
  }
  return bus;
}

/**
 * Where the recorded voices live, and which files make up each one.
 *
 * `import.meta.env.BASE_URL` rather than a bare `/sfx/...`: the client is
 * built for a GitHub Pages *project* site as well as for a plain root, and a
 * path that forgot the base would 404 quietly on one of the two and be found
 * by nobody until somebody went looking for why the game had gone silent.
 */
const SFX_BASE = `${import.meta.env.BASE_URL}sfx/zombie/`;
const GROAN_FILES = [
  'groan-01-growl.mp3',
  'groan-02-creature-breath.mp3',
  'groan-03-demon-breathing.mp3',
  'groan-04-breath.mp3',
  'groan-05-gasp.mp3',
  'groan-06-sobbing.mp3',
  'groan-07-calm-growl.mp3',
  'groan-08-male-growl.mp3',
  'groan-09-monster-grunt.mp3',
  'groan-10-dying-pain.mp3',
];
const ATTACK_FILES = [
  'attack-01-grunt.mp3',
  'attack-02-roar.mp3',
  'attack-04-growl.mp3',
  'attack-05-hurt.mp3',
  'attack-06-screech.mp3',
  'attack-07-scream.mp3',
  'attack-08-creature-roar.mp3',
  'attack-09-small-growl.mp3',
  'attack-10-pain-gasp.mp3',
  'attack-11-aggressive-gasp.mp3',
  'attack-12-snarl.mp3',
];
/**
 * The one-off reaction to being *shot*, as against attacking — see
 * `playZombieHit`. Kept to a single file on purpose: it fires far more often
 * than a groan does in a real firefight, so it is the one voice that most
 * needs to stay a rare flourish rather than a library to draw from.
 */
const HIT_FILES = ['hit-01-pain.mp3'];

/**
 * Decoded and ready to play. Filled in as each file arrives rather than all
 * at once, so the first one to finish decoding is already usable while the
 * rest are still in flight.
 */
const groanVoices: AudioBuffer[] = [];
const attackVoices: AudioBuffer[] = [];
const hitVoices: AudioBuffer[] = [];
let voicesRequested = false;

/**
 * Fetch and decode every recorded voice, once. Fire-and-forget: nothing here
 * is awaited by a caller, because a groan asked for before this has finished
 * falls back to the synthesised one rather than a round pausing on a network
 * request for a sound effect.
 */
function loadZombieVoices(ac: AudioContext): void {
  if (voicesRequested) return;
  voicesRequested = true;
  const load = (file: string, into: AudioBuffer[]) => {
    fetch(SFX_BASE + file)
      .then((r) => r.arrayBuffer())
      .then((data) => ac.decodeAudioData(data))
      .then((buffer) => into.push(buffer))
      .catch(() => {
        // Offline, blocked, or a bad file — the synthesised fallback carries
        // this one voice for the rest of the round rather than the whole
        // thing failing over one missing recording.
      });
  };
  for (const file of GROAN_FILES) load(file, groanVoices);
  for (const file of ATTACK_FILES) load(file, attackVoices);
  for (const file of HIT_FILES) load(file, hitVoices);
}

/**
 * Play a random one of a pool of recorded voices, spatialised the same way
 * every synthesised sound is. Returns false — plays nothing — when the pool
 * is still empty, which is the caller's cue to fall back.
 *
 * `voice` steers the *pitch*, via `playbackRate` rather than anything the
 * recording studio did: a stable per-zombie centre plus a little per-play
 * jitter, the same shape the synthesised version used its oscillator
 * frequency for. A single small file therefore never plays back twice
 * identically, and which of several files gets picked is left to plain
 * `Math.random()` — nobody's screen has to agree about the exact sound of one
 * zombie's groan.
 */
/**
 * `ceiling` is the loudest a recording is ever allowed to be, at point-blank
 * range. The synthesised voices this replaced topped out around 0.4-0.55 by
 * construction — every oscillator's own gain was hand-set well under 1 — but
 * a decoded recording has no such headroom built in: a professionally
 * mastered clip peaks near full scale, so playing it straight into
 * `spatial.gain` at 1 is the loudest sound this engine can make. Scaling it
 * down here is what keeps a close zombie unpleasant rather than deafening.
 */
function playVoice(
  ac: AudioContext,
  pool: AudioBuffer[],
  spatial: Spatial,
  voice: number,
  ceiling: number,
): boolean {
  if (pool.length === 0) return false;
  const buffer = pool[Math.floor(Math.random() * pool.length)];
  const source = ac.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.value = 0.88 + voice * 0.22 + (Math.random() * 0.16 - 0.08);
  source.connect(spatialOutput(ac, { ...spatial, gain: spatial.gain * ceiling }));
  source.start();
  return true;
}

/**
 * The dog's roar: a guttural bottom end with a hiss laid over it.
 *
 * Three voices, and each is doing a different job. Two detuned sawtooths an
 * octave apart through a low-pass are the **growl** — detuned rather than one,
 * because two close frequencies beat against each other and that beating is
 * what stops a synthesised note sounding like a note. A slow tremolo on the
 * whole thing is the **guttural** part: a roar out of a throat is not a
 * sustained tone, it is a rattle. And a band-passed slice of noise, swept down
 * as it goes, is the **hiss** — the thing that makes it read as coming out of
 * something dead rather than out of a lion.
 *
 * It ends on a downward pitch bend. Everything alive runs out of air.
 *
 * `spatial.gain` is expected to already carry a distance falloff, and the
 * ceiling on top of it is deliberately low — this is meant to be unpleasant
 * and close, not loud.
 */
export function playRoar(spatial: Spatial): void {
  const ac = audio();
  if (!ac) return;
  if (spatial.gain <= 0.01) return;

  const now = ac.currentTime;
  const length = DOG_ROAR_MS / 1000;
  const end = now + length;

  const bus = spatialOutput(ac, spatial);
  const out = ac.createGain();
  out.gain.setValueAtTime(0, now);
  // A fast attack and a long tail: a roar arrives, it does not fade in.
  out.gain.linearRampToValueAtTime(0.24, now + 0.09);
  out.gain.setValueAtTime(0.24, end - 0.55);
  out.gain.exponentialRampToValueAtTime(0.0001, end);
  out.connect(bus);

  // The rattle. One LFO on a gain node the growl passes through, so it shapes
  // the voice rather than being a voice of its own.
  const rattle = ac.createGain();
  rattle.gain.value = 0.72;
  rattle.connect(out);
  const lfo = ac.createOscillator();
  const lfoGain = ac.createGain();
  lfo.type = 'sine';
  lfo.frequency.setValueAtTime(23, now);
  lfo.frequency.linearRampToValueAtTime(14, end);
  lfoGain.gain.value = 0.28;
  lfo.connect(lfoGain).connect(rattle.gain);
  lfo.start(now);
  lfo.stop(end);

  // The growl: low, dirty, and bending down at the end.
  const throat = ac.createBiquadFilter();
  throat.type = 'lowpass';
  throat.frequency.setValueAtTime(420, now);
  throat.frequency.linearRampToValueAtTime(190, end);
  throat.Q.value = 3.2;
  throat.connect(rattle);

  for (const [base, detune, level] of [
    [58, 0, 1],
    [61, 9, 0.75],
    [116, -7, 0.34],
  ] as Array<[number, number, number]>) {
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = 'sawtooth';
    osc.detune.value = detune;
    osc.frequency.setValueAtTime(base * 1.16, now);
    osc.frequency.linearRampToValueAtTime(base, now + 0.35);
    // Runs out of air.
    osc.frequency.linearRampToValueAtTime(base * 0.78, end);
    g.gain.value = level;
    osc.connect(g).connect(throat);
    osc.start(now);
    osc.stop(end);
  }

  // The hiss, over the top of it. Band-passed so it is a breath rather than
  // static, and swept down with the growl so the two move together.
  const hiss = ac.createBufferSource();
  hiss.buffer = noiseBuffer(ac);
  hiss.loop = true;
  const band = ac.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.setValueAtTime(1750, now);
  band.frequency.exponentialRampToValueAtTime(760, end);
  band.Q.value = 0.9;
  const hissGain = ac.createGain();
  hissGain.gain.setValueAtTime(0, now);
  hissGain.gain.linearRampToValueAtTime(0.5, now + 0.16);
  hissGain.gain.linearRampToValueAtTime(0.22, end);
  hiss.connect(band).connect(hissGain).connect(out);
  hiss.start(now);
  hiss.stop(end);
}

/**
 * A zombie groan.
 *
 * `voice` is a 0-1 hash of the zombie's own id (see `main.ts`'s `hashId`), so
 * the same one sounds roughly like itself from one groan to the next without
 * every zombie in the city sounding identical.
 *
 * Tries a recorded voice first and only reaches for the synthesised one —
 * `synthesizeZombieGroan`, below — while the recordings are still loading.
 */
export function playZombieGroan(spatial: Spatial, voice: number): void {
  const ac = audio();
  if (!ac) return;
  if (spatial.gain <= 0.012) return;
  if (playVoice(ac, groanVoices, spatial, voice, 0.42)) return;
  synthesizeZombieGroan(spatial, voice);
}

/**
 * The synthesised groan: a low moan with a slow wobble in it, and a breath of
 * noise laid quietly *under* the pitch rather than over it — the roar's hiss
 * is the sound of something dying, and a shambler ambling down a street is
 * not that.
 *
 * Kept as the fallback for `playZombieGroan` while a recording is still in
 * flight (or in case one never arrives) rather than deleted outright: a
 * synthesised moan that sounds a little like an insect is still a sound,
 * where silence for however long a fetch takes is a worse failure.
 */
function synthesizeZombieGroan(spatial: Spatial, voice: number): void {
  const ac = audio();
  if (!ac) return;
  if (spatial.gain <= 0.012) return;

  const now = ac.currentTime;
  const length = 0.9 + voice * 0.5 + Math.random() * 0.5;
  const end = now + length;
  const base = 58 + voice * 55 + (Math.random() * 14 - 7);

  const bus = spatialOutput(ac, spatial);
  const out = ac.createGain();
  out.gain.setValueAtTime(0, now);
  out.gain.linearRampToValueAtTime(0.42, now + 0.18 + Math.random() * 0.12);
  out.gain.setValueAtTime(0.42, end - 0.3);
  out.gain.exponentialRampToValueAtTime(0.0001, end);
  out.connect(bus);

  // The wobble — a moan is not a held note. Modulates detune (cents), so it
  // adds to whatever the voice below is already offset by rather than
  // replacing it.
  const vibrato = ac.createOscillator();
  const vibratoGain = ac.createGain();
  vibrato.frequency.value = 2.4 + Math.random() * 2.6;
  vibratoGain.gain.value = 22 + Math.random() * 22;
  vibrato.connect(vibratoGain);
  vibrato.start(now);
  vibrato.stop(end);

  const throat = ac.createBiquadFilter();
  throat.type = 'lowpass';
  throat.frequency.value = 360 + voice * 260;
  throat.Q.value = 1.6;
  throat.connect(out);

  for (const [mul, detune, level] of [
    [1, 0, 1],
    [1.004, 6, 0.55],
    [2, -9, 0.2],
  ] as Array<[number, number, number]>) {
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = 'sawtooth';
    osc.frequency.value = base * mul;
    osc.detune.value = detune;
    vibratoGain.connect(osc.detune);
    g.gain.value = level;
    osc.connect(g).connect(throat);
    osc.start(now);
    osc.stop(end);
  }

  // A breath of noise, quiet and low — texture rather than the roar's hiss.
  const breath = ac.createBufferSource();
  breath.buffer = noiseBuffer(ac);
  breath.loop = true;
  const band = ac.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = 320 + voice * 260;
  band.Q.value = 0.7;
  const breathGain = ac.createGain();
  breathGain.gain.setValueAtTime(0, now);
  breathGain.gain.linearRampToValueAtTime(0.07, now + 0.22);
  breathGain.gain.linearRampToValueAtTime(0.03, end);
  breath.connect(band).connect(breathGain).connect(out);
  breath.start(now);
  breath.stop(end);
}

/**
 * A zombie's bite or claw connecting — fired once on the rising edge of a
 * grapple or a spell of clawing at a door or a wall, never held for its
 * length.
 *
 * `voice` is the same per-zombie hash the groan takes, so an animal's bite and
 * its groan share a family without being the same sound.
 *
 * Tries a recorded voice first, the same as `playZombieGroan`, and falls back
 * to `synthesizeZombieAttack` below only while the recordings are loading.
 */
export function playZombieAttack(spatial: Spatial, voice: number): void {
  const ac = audio();
  if (!ac) return;
  if (spatial.gain <= 0.012) return;
  if (playVoice(ac, attackVoices, spatial, voice, 0.55)) return;
  synthesizeZombieAttack(spatial, voice);
}

/**
 * The synthesised bite: a short, ugly bark rather than the groan's slow
 * arrival, because this is not ambience, it is the thing happening. Kept as
 * `synthesizeZombieGroan`'s fallback is — see the note there.
 */
function synthesizeZombieAttack(spatial: Spatial, voice: number): void {
  const ac = audio();
  if (!ac) return;
  if (spatial.gain <= 0.012) return;

  const now = ac.currentTime;
  const length = 0.26 + voice * 0.14 + Math.random() * 0.12;
  const end = now + length;
  const base = 85 + voice * 70 + (Math.random() * 20 - 10);

  const bus = spatialOutput(ac, spatial);
  const out = ac.createGain();
  out.gain.setValueAtTime(0, now);
  // No arrival to speak of — it is already happening on the first sample.
  out.gain.linearRampToValueAtTime(0.55, now + 0.02);
  out.gain.exponentialRampToValueAtTime(0.0001, end);
  out.connect(bus);

  const throat = ac.createBiquadFilter();
  throat.type = 'lowpass';
  throat.frequency.setValueAtTime(1500, now);
  throat.frequency.exponentialRampToValueAtTime(220, end);
  throat.Q.value = 2.2;
  throat.connect(out);

  for (const [mul, detune, level] of [
    [1, 0, 1],
    [1.5, -12, 0.5],
  ] as Array<[number, number, number]>) {
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(base * mul * 1.3, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(30, base * mul * 0.6), end);
    osc.detune.value = detune;
    g.gain.value = level;
    osc.connect(g).connect(throat);
    osc.start(now);
    osc.stop(end);
  }

  // The snap: a short burst of high noise for teeth or claws meeting
  // something, right at the top of the envelope rather than under it.
  const snap = ac.createBufferSource();
  snap.buffer = noiseBuffer(ac);
  const snapBand = ac.createBiquadFilter();
  snapBand.type = 'bandpass';
  snapBand.frequency.value = 1500 + Math.random() * 1200;
  snapBand.Q.value = 1.1;
  const snapGain = ac.createGain();
  snapGain.gain.setValueAtTime(0.5, now);
  snapGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.07 + Math.random() * 0.05);
  snap.connect(snapBand).connect(snapGain).connect(out);
  snap.start(now);
  snap.stop(now + 0.15);
}

/**
 * A zombie taking a hit — a pained yelp rather than the aggressive bark
 * `playZombieAttack` plays. The caller rolls whether this fires at all and
 * throttles how often any one zombie can repeat it; this end just plays
 * whatever it's handed.
 *
 * No synthesised fallback, unlike the groan and the bite. Both of those are
 * meant to be heard on nearly every play, so a silent gap while the
 * recordings load would be conspicuous; this one is already meant to be rare
 * — the caller's own chance roll already throws most of them away — so a
 * handful going unheard in the first second of a round is not worth a whole
 * second voice built out of oscillators.
 */
export function playZombieHit(spatial: Spatial, voice: number): void {
  const ac = audio();
  if (!ac) return;
  if (spatial.gain <= 0.012) return;
  playVoice(ac, hitVoices, spatial, voice, 0.4);
}
