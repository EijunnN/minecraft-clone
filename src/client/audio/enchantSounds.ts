// Fase 7 (encantamientos): sonidos sintetizados de la mesa de encantamientos (un arpegio de campanillas
// con un soplo de aire que sube), el yunque (golpe de metal al usarlo, más grave al caer, estrépito al
// romperse), la afiladora (piedra que rasca), la botella con experiencia al romperse y las espinas.
import { playNoiseBurst, playTonalBlip, playInharmonicRing } from './dsp';
import type { NoiseBuffers } from './noise';

type Sources = AudioScheduledSourceNode[];

/** Notas del arpegio de la mesa (una escala pentatónica que sube y se abre). */
const ENCHANT_NOTES = [784, 988, 1175, 1319, 1568, 1976];

export function buildEnchantSfx(ctx: AudioContext, noise: NoiseBuffers, kind: string, dest: AudioNode, now: number): Sources {
  switch (kind) {
    case 'enchant': {
      const out: Sources = [
        playNoiseBurst(ctx, { buffer: noise.pink, destination: dest, now, filterType: 'bandpass', freq: 600, freqEnd: 3200, q: 1.4, attack: 0.25, decay: 0.9, gain: 0.12 }),
      ];
      const start = Math.floor(Math.random() * 2);
      for (let i = 0; i < 5; i++) {
        const t = now + 0.05 + i * 0.075 + Math.random() * 0.02;
        const f = ENCHANT_NOTES[(start + i) % ENCHANT_NOTES.length] * (Math.random() < 0.5 ? 1 : 1.5);
        out.push(playTonalBlip(ctx, { destination: dest, now: t, freq: f, wave: 'sine', attack: 0.004, decay: 0.9, gain: 0.11 }));
        out.push(playTonalBlip(ctx, { destination: dest, now: t, freq: f * 2.01, wave: 'sine', attack: 0.004, decay: 0.35, gain: 0.035, detune: 7 }));
      }
      return out;
    }
    case 'anvil_use':
      return [
        ...playInharmonicRing(ctx, { destination: dest, now, baseFreq: 820, partials: [1, 2.32, 3.87, 5.4], decay: 0.55, gain: 0.3 }),
        playNoiseBurst(ctx, { buffer: noise.white, destination: dest, now, filterType: 'highpass', freq: 3000, q: 0.7, attack: 0.001, decay: 0.05, gain: 0.25 }),
      ];
    case 'anvil_land':
      return [
        ...playInharmonicRing(ctx, { destination: dest, now, baseFreq: 430, partials: [1, 2.21, 3.4, 4.9], decay: 0.8, gain: 0.34 }),
        playNoiseBurst(ctx, { buffer: noise.brown, destination: dest, now, filterType: 'lowpass', freq: 500, freqEnd: 90, q: 0.8, attack: 0.002, decay: 0.3, gain: 0.6 }),
      ];
    case 'anvil_destroy': {
      const out: Sources = [
        playNoiseBurst(ctx, { buffer: noise.white, destination: dest, now, filterType: 'bandpass', freq: 2200, freqEnd: 600, q: 0.6, attack: 0.002, decay: 0.45, gain: 0.45 }),
        ...playInharmonicRing(ctx, { destination: dest, now, baseFreq: 520, partials: [1, 1.73, 2.9, 4.1], decay: 0.4, gain: 0.25 }),
      ];
      for (let i = 0; i < 5; i++) {
        out.push(playTonalBlip(ctx, { destination: dest, now: now + 0.08 + Math.random() * 0.35, freq: 1400 + Math.random() * 1800, wave: 'triangle', attack: 0.001, decay: 0.08, gain: 0.08 }));
      }
      return out;
    }
    case 'grindstone': {
      const out: Sources = [];
      for (let i = 0; i < 4; i++) {
        const t = now + i * 0.09;
        out.push(playNoiseBurst(ctx, { buffer: noise.white, destination: dest, now: t, filterType: 'bandpass', freq: 1800 + Math.random() * 900, q: 3, attack: 0.01, decay: 0.12, gain: 0.2 }));
      }
      out.push(playNoiseBurst(ctx, { buffer: noise.brown, destination: dest, now, filterType: 'lowpass', freq: 400, q: 0.7, attack: 0.02, decay: 0.4, gain: 0.3 }));
      return out;
    }
    case 'xp_bottle': {
      const out: Sources = [
        playNoiseBurst(ctx, { buffer: noise.white, destination: dest, now, filterType: 'highpass', freq: 3500, q: 0.8, attack: 0.001, decay: 0.12, gain: 0.35 }),
      ];
      for (let i = 0; i < 6; i++) {
        out.push(playTonalBlip(ctx, { destination: dest, now: now + Math.random() * 0.15, freq: 2600 + Math.random() * 3000, wave: 'sine', attack: 0.001, decay: 0.06 + Math.random() * 0.05, gain: 0.07 }));
      }
      return out;
    }
    case 'thorns':
      return [
        playNoiseBurst(ctx, { buffer: noise.white, destination: dest, now, filterType: 'bandpass', freq: 5200, freqEnd: 2600, q: 3, attack: 0.001, decay: 0.07, gain: 0.25 }),
        playTonalBlip(ctx, { destination: dest, now, freq: 180, freqEnd: 90, wave: 'triangle', attack: 0.002, decay: 0.12, gain: 0.2 }),
      ];
  }
  return [];
}
