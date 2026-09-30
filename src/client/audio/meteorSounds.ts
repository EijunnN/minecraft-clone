// Programa lunar (meteors.ts): los sonidos de las lluvias de meteoritos. La sirena del aviso (dos tonos que suben y bajan, como una
// alarma antiaérea), el silbido de cada meteorito que cruza el cielo (un soplido que baja de tono al acercarse) y el chasquido de estática
// de la radio de la Estación Selene.
import { playNoiseBurst, playTonalBlip } from './dsp';
import type { NoiseBuffers } from './noise';

/** Un aullido de sirena de `seconds` (sube y baja una vez). */
export function buildSiren(ctx: AudioContext, destination: AudioNode, now: number, seconds: number, loud: number): AudioScheduledSourceNode[] {
  const out: AudioScheduledSourceNode[] = [];
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.16 * loud, now + seconds * 0.25);
  gain.gain.linearRampToValueAtTime(0.16 * loud, now + seconds * 0.7);
  gain.gain.linearRampToValueAtTime(0, now + seconds);
  // Un filtro para que suene lejos, por un altavoz.
  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = 900;
  band.Q.value = 0.8;
  gain.connect(band).connect(destination);
  for (const [mult, type] of [[1, 'sawtooth'], [1.5, 'triangle']] as const) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(260 * mult, now);
    osc.frequency.linearRampToValueAtTime(620 * mult, now + seconds * 0.45);
    osc.frequency.linearRampToValueAtTime(240 * mult, now + seconds);
    osc.connect(gain);
    osc.start(now);
    osc.stop(now + seconds + 0.05);
    out.push(osc);
  }
  return out;
}

/** El silbido de un meteorito que pasa (`power` 2..7: más grave y largo cuanto más grande). */
export function buildMeteorWhoosh(ctx: AudioContext, noise: NoiseBuffers, destination: AudioNode, now: number, power: number): AudioScheduledSourceNode[] {
  const big = Math.min(1, (power - 2) / 5);
  const d = 2.4 + big * 1.2;
  const hiss = playNoiseBurst(ctx, {
    buffer: noise.pink, destination, now, filterType: 'bandpass', freq: 2600 - big * 1200, freqEnd: 500, q: 1.2, attack: d * 0.7, decay: d * 0.3,
    gain: 0.35 + 0.3 * big,
  });
  const roar = playNoiseBurst(ctx, { buffer: noise.brown, destination, now: now + d * 0.3, filterType: 'lowpass', freq: 300, freqEnd: 120, q: 0.7, attack: d * 0.5, decay: d * 0.2, gain: 0.5 + 0.4 * big });
  return [hiss, roar];
}

/** Estática de radio al empezar un mensaje. */
export function buildRadioStatic(ctx: AudioContext, noise: NoiseBuffers, destination: AudioNode, now: number): AudioScheduledSourceNode[] {
  const s1 = playNoiseBurst(ctx, { buffer: noise.white, destination, now, filterType: 'bandpass', freq: 2200, q: 0.9, attack: 0.01, decay: 0.35, gain: 0.12 });
  const beep = playTonalBlip(ctx, { destination, now: now + 0.36, freq: 1320, wave: 'square', attack: 0.005, decay: 0.08, gain: 0.03 });
  return [s1, beep];
}
