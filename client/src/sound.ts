import { DOG_ROAR_MS } from '../../shared/constants.js';

/**
 * The one noise this game makes.
 *
 * **Synthesised rather than a file**, and that is the decision worth recording:
 * there is no audio anywhere else in the project, so a sample would have meant
 * an asset pipeline, a loader, a preload and a format question for the sake of
 * a single two-second sound. Everything here is oscillators and a noise buffer
 * built at first use, so it costs one file, no bytes on the wire and nothing at
 * build time.
 *
 * The context is made **lazily and resumed on use**. A browser will not start
 * one before a gesture, and building it at module load gets a context stuck in
 * `suspended` that then has to be noticed and revived — where creating it on
 * the first roar means it is created inside a keypress, which is a gesture.
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
  return ctx;
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
 * `volume` is 0 to 1 and is expected to be a distance falloff. The ceiling is
 * deliberately low — this is meant to be unpleasant and close, not loud.
 */
export function playRoar(volume: number): void {
  const ac = audio();
  if (!ac) return;
  const gain = Math.max(0, Math.min(1, volume));
  if (gain <= 0.01) return;

  const now = ac.currentTime;
  const length = DOG_ROAR_MS / 1000;
  const end = now + length;

  const out = ac.createGain();
  out.gain.setValueAtTime(0, now);
  // A fast attack and a long tail: a roar arrives, it does not fade in.
  out.gain.linearRampToValueAtTime(0.24 * gain, now + 0.09);
  out.gain.setValueAtTime(0.24 * gain, end - 0.55);
  out.gain.exponentialRampToValueAtTime(0.0001, end);
  out.connect(ac.destination);

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
