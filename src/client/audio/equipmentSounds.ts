// Fase 6.5 (equipo): sonidos sintetizados del equipo nuevo: el mechero (raspado y chispa), el fuego
// (chisporroteo, lo que arde y el siseo al apagarse), la ballesta (tensar, cargar y disparar), el
// tridente (lanzar y clavarse), el cuerno de cabra (un metal de viento con ocho tonadas), los cohetes
// (silbido de subida, estallido y chisporroteo), las armaduras de caballo y lobo, la embestida de la
// cabra, el acelerón del cerdo y el conducto al encenderse y apagarse.
import { playNoiseBurst, playTonalBlip } from './dsp';
import type { NoiseBuffers } from './noise';

type Sources = AudioScheduledSourceNode[];

/** Tonadas del cuerno: [nota inicial, nota final, duración] (Hz, Hz, s). */
const HORN_TUNES: readonly [number, number, number][] = [
  [196, 174, 2.4], [220, 262, 2.2], [247, 196, 2.6], [175, 165, 2.8], [262, 330, 2.0], [165, 220, 2.4], [208, 156, 3.0], [233, 277, 2.6],
];

/**
 * Voz de metal de viento: sierra filtrada (el filtro se abre al soplar) con vibrato, que va de f0 a
 * f1. Suena con dos octavas débiles para que tenga cuerpo.
 */
function hornVoice(ctx: AudioContext, noise: NoiseBuffers, dest: AudioNode, now: number, f0: number, f1: number, dur: number, gain: number): Sources {
  const out: Sources = [];
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.Q.value = 2.5;
  filter.frequency.setValueAtTime(300, now);
  filter.frequency.exponentialRampToValueAtTime(2200, now + 0.25);
  filter.frequency.exponentialRampToValueAtTime(1200, now + dur);
  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0.0001, now);
  amp.gain.exponentialRampToValueAtTime(gain, now + 0.18);
  amp.gain.setValueAtTime(gain, now + dur * 0.7);
  amp.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  filter.connect(amp).connect(dest);
  const vib = ctx.createOscillator();
  vib.frequency.value = 5.2;
  const vibGain = ctx.createGain();
  vibGain.gain.value = 3;
  vib.connect(vibGain);
  for (const [mult, wave, g] of [[1, 'sawtooth', 1], [0.5, 'triangle', 0.5], [2, 'sawtooth', 0.18]] as const) {
    const osc = ctx.createOscillator();
    osc.type = wave;
    osc.frequency.setValueAtTime(f0 * mult, now);
    osc.frequency.exponentialRampToValueAtTime(f0 * mult * 1.02, now + 0.12);
    osc.frequency.exponentialRampToValueAtTime(f1 * mult, now + dur * 0.8);
    vibGain.connect(osc.frequency);
    const og = ctx.createGain();
    og.gain.value = g;
    osc.connect(og).connect(filter);
    osc.start(now);
    osc.stop(now + dur + 0.05);
    out.push(osc);
  }
  vib.start(now);
  vib.stop(now + dur + 0.05);
  out.push(vib);
  // Soplido al empezar.
  out.push(playNoiseBurst(ctx, { buffer: noise.pink, destination: dest, now, filterType: 'bandpass', freq: 1400, q: 0.8, attack: 0.02, decay: 0.25, gain: gain * 0.25 }));
  return out;
}

/** Estallido de un cohete: el golpe grave y, al rato, el chisporroteo de las chispas. */
function burst(ctx: AudioContext, noise: NoiseBuffers, dest: AudioNode, now: number, stars: number): Sources {
  const out: Sources = [
    playNoiseBurst(ctx, { buffer: noise.brown, destination: dest, now, filterType: 'lowpass', freq: 900, freqEnd: 120, q: 0.7, attack: 0.004, decay: 0.9, gain: 0.9 }),
    playTonalBlip(ctx, { destination: dest, now, freq: 90, freqEnd: 38, wave: 'sine', attack: 0.004, decay: 0.6, gain: 0.5 }),
  ];
  const crackles = 10 + Math.min(12, stars * 3);
  for (let i = 0; i < crackles; i++) {
    const t = now + 0.45 + Math.random() * 1.1;
    out.push(playNoiseBurst(ctx, { buffer: noise.white, destination: dest, now: t, filterType: 'highpass', freq: 2500 + Math.random() * 3000, q: 0.8, attack: 0.001, decay: 0.03 + Math.random() * 0.04, gain: 0.12 + Math.random() * 0.1 }));
  }
  return out;
}

export function buildEquipmentSfx(ctx: AudioContext, noise: NoiseBuffers, kind: string, dest: AudioNode, now: number, a = 0): Sources {
  switch (kind) {
    case 'ignite':
      // Raspado del acero contra el pedernal y el soplo de la llama al prender.
      return [
        playNoiseBurst(ctx, { buffer: noise.white, destination: dest, now, filterType: 'bandpass', freq: 4200, freqEnd: 2400, q: 2, attack: 0.002, decay: 0.09, gain: 0.3 }),
        playTonalBlip(ctx, { destination: dest, now, freq: 2600, freqEnd: 1800, wave: 'square', attack: 0.001, decay: 0.03, gain: 0.05 }),
        playNoiseBurst(ctx, { buffer: noise.pink, destination: dest, now: now + 0.05, filterType: 'lowpass', freq: 700, q: 0.7, attack: 0.03, decay: 0.3, gain: 0.25 }),
      ];
    case 'fire_crackle': {
      const out: Sources = [playNoiseBurst(ctx, { buffer: noise.brown, destination: dest, now, filterType: 'lowpass', freq: 500, q: 0.6, attack: 0.1, decay: 0.5, gain: 0.12 })];
      for (let i = 0; i < 3 + Math.floor(Math.random() * 3); i++) {
        out.push(playNoiseBurst(ctx, { buffer: noise.white, destination: dest, now: now + Math.random() * 0.5, filterType: 'bandpass', freq: 1500 + Math.random() * 2500, q: 1.5, attack: 0.001, decay: 0.02 + Math.random() * 0.03, gain: 0.1 + Math.random() * 0.12 }));
      }
      return out;
    }
    case 'fire_burn':
      return [playNoiseBurst(ctx, { buffer: noise.pink, destination: dest, now, filterType: 'lowpass', freq: 1200, freqEnd: 400, q: 0.7, attack: 0.02, decay: 0.35, gain: 0.25 })];
    case 'fire_extinguish':
      return [playNoiseBurst(ctx, { buffer: noise.white, destination: dest, now, filterType: 'highpass', freq: 3000, freqEnd: 5000, q: 0.7, attack: 0.01, decay: 0.45, gain: 0.25 })];
    case 'crossbow_loading':
      // Madera que cruje al tensar.
      return [
        playNoiseBurst(ctx, { buffer: noise.brown, destination: dest, now, filterType: 'bandpass', freq: 400, freqEnd: 700, q: 3, attack: 0.1, decay: 0.8, gain: 0.25 }),
        playTonalBlip(ctx, { destination: dest, now, freq: 110, freqEnd: 150, wave: 'triangle', attack: 0.2, decay: 0.7, gain: 0.06 }),
      ];
    case 'crossbow_load':
      return [
        playNoiseBurst(ctx, { buffer: noise.white, destination: dest, now, filterType: 'bandpass', freq: 2600, q: 3, attack: 0.001, decay: 0.04, gain: 0.3 }),
        playTonalBlip(ctx, { destination: dest, now, freq: 900, freqEnd: 600, wave: 'square', attack: 0.001, decay: 0.05, gain: 0.06 }),
      ];
    case 'crossbow_shoot':
      return [
        playTonalBlip(ctx, { destination: dest, now, freq: 180, freqEnd: 90, wave: 'triangle', attack: 0.001, decay: 0.18, gain: 0.3 }),
        playNoiseBurst(ctx, { buffer: noise.white, destination: dest, now, filterType: 'highpass', freq: 1800, freqEnd: 900, q: 0.7, attack: 0.001, decay: 0.2, gain: 0.25 }),
        playNoiseBurst(ctx, { buffer: noise.brown, destination: dest, now, filterType: 'lowpass', freq: 500, q: 1, attack: 0.001, decay: 0.08, gain: 0.35 }),
      ];
    case 'trident_throw':
      return [playNoiseBurst(ctx, { buffer: noise.pink, destination: dest, now, filterType: 'bandpass', freq: 600, freqEnd: 2200, q: 1.5, attack: 0.03, decay: 0.3, gain: 0.35 })];
    case 'trident_hit':
      return [
        playNoiseBurst(ctx, { buffer: noise.brown, destination: dest, now, filterType: 'lowpass', freq: 800, q: 1, attack: 0.001, decay: 0.1, gain: 0.4 }),
        playTonalBlip(ctx, { destination: dest, now, freq: 1250, freqEnd: 1180, wave: 'sine', attack: 0.001, decay: 0.35, gain: 0.08 }),
        playTonalBlip(ctx, { destination: dest, now, freq: 1870, freqEnd: 1830, wave: 'sine', attack: 0.001, decay: 0.25, gain: 0.05 }),
      ];
    case 'trident_break':
    case 'wolf_armor_break':
      return [
        playNoiseBurst(ctx, { buffer: noise.white, destination: dest, now, filterType: 'bandpass', freq: 2200, q: 1, attack: 0.001, decay: 0.15, gain: 0.35 }),
        playTonalBlip(ctx, { destination: dest, now, freq: 700, freqEnd: 300, wave: 'square', attack: 0.001, decay: 0.12, gain: 0.08 }),
      ];
    case 'goat_horn': {
      const [f0, f1, dur] = HORN_TUNES[Math.max(0, Math.min(HORN_TUNES.length - 1, (a || 1) - 1))];
      return hornVoice(ctx, noise, dest, now, f0, f1, dur, 0.35);
    }
    case 'firework_launch':
      return [
        playNoiseBurst(ctx, { buffer: noise.white, destination: dest, now, filterType: 'bandpass', freq: 800, freqEnd: 3500, q: 2, attack: 0.02, decay: 0.9, gain: 0.3 }),
        playTonalBlip(ctx, { destination: dest, now, freq: 600, freqEnd: 1800, wave: 'sine', attack: 0.05, decay: 0.8, gain: 0.04 }),
      ];
    case 'firework_burst':
      return burst(ctx, noise, dest, now, a);
    case 'firework_fizzle':
      return [playNoiseBurst(ctx, { buffer: noise.pink, destination: dest, now, filterType: 'highpass', freq: 1500, q: 0.7, attack: 0.005, decay: 0.2, gain: 0.2 })];
    case 'horse_armor':
      return [
        playNoiseBurst(ctx, { buffer: noise.white, destination: dest, now, filterType: 'bandpass', freq: 3000, q: 2, attack: 0.002, decay: 0.1, gain: 0.2 }),
        playTonalBlip(ctx, { destination: dest, now, freq: 820, freqEnd: 640, wave: 'triangle', attack: 0.002, decay: 0.2, gain: 0.08 }),
      ];
    case 'wolf_armor':
      return [
        playNoiseBurst(ctx, { buffer: noise.brown, destination: dest, now, filterType: 'lowpass', freq: 1300, q: 1, attack: 0.002, decay: 0.1, gain: 0.3 }),
        playTonalBlip(ctx, { destination: dest, now, freq: 380, freqEnd: 300, wave: 'triangle', attack: 0.002, decay: 0.08, gain: 0.08 }),
      ];
    case 'goat_ram':
      return [
        playNoiseBurst(ctx, { buffer: noise.brown, destination: dest, now, filterType: 'lowpass', freq: 600, q: 0.8, attack: 0.001, decay: 0.2, gain: 0.6 }),
        playTonalBlip(ctx, { destination: dest, now, freq: 120, freqEnd: 60, wave: 'sine', attack: 0.001, decay: 0.2, gain: 0.35 }),
      ];
    case 'pig_boost':
      return [playNoiseBurst(ctx, { buffer: noise.pink, destination: dest, now, filterType: 'bandpass', freq: 500, freqEnd: 1500, q: 1, attack: 0.02, decay: 0.3, gain: 0.25 })];
    case 'conduit_on':
    case 'conduit_off': {
      // Acorde brillante que sube (al encenderse) o baja (al apagarse), con un soplo de agua.
      const up = kind === 'conduit_on';
      const out: Sources = [];
      [523, 659, 784, 1047].forEach((f, i) => {
        out.push(playTonalBlip(ctx, { destination: dest, now: now + (up ? i : 3 - i) * 0.09, freq: f, freqEnd: f * (up ? 1.01 : 0.97), wave: 'sine', attack: 0.02, decay: 1.2, gain: 0.07 }));
      });
      out.push(playNoiseBurst(ctx, { buffer: noise.pink, destination: dest, now, filterType: 'lowpass', freq: 900, q: 0.7, attack: 0.2, decay: 1, gain: 0.08 }));
      return out;
    }
    default:
      return [];
  }
}

