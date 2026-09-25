// Fase 6.5 (decoración): sonidos sintetizados de la campana (tañido largo con parciales inarmónicos,
// como una campana de bronce), de colgar y descolgar cuadros y marcos, y de girar el objeto del marco.
import { playNoiseBurst, playTonalBlip } from './dsp';
import type { NoiseBuffers } from './noise';

type Sources = AudioScheduledSourceNode[];

export function buildDecorSfx(ctx: AudioContext, noise: NoiseBuffers, kind: string, dest: AudioNode, now: number): Sources {
  switch (kind) {
    case 'bell': {
      // Golpe metálico y parciales de campana (fundamental, tercera menor, quinta, octava…) que se apagan despacio.
      const f = 520 + Math.random() * 20;
      const out: Sources = [
        playNoiseBurst(ctx, { buffer: noise.white, destination: dest, now, filterType: 'bandpass', freq: 3200, q: 3, attack: 0.001, decay: 0.05, gain: 0.12 }),
      ];
      for (const [ratio, gain, decay] of [[0.5, 0.1, 3.2], [1, 0.2, 2.8], [1.19, 0.1, 2.2], [1.5, 0.08, 1.8], [2, 0.08, 1.5], [2.74, 0.05, 1.1], [4.1, 0.03, 0.7]] as const) {
        out.push(playTonalBlip(ctx, { destination: dest, now, freq: f * ratio, wave: 'sine', attack: 0.003, decay, gain }));
      }
      return out;
    }
    case 'hang_place':
    case 'frame_add':
      return [
        playNoiseBurst(ctx, { buffer: noise.brown, destination: dest, now, filterType: 'lowpass', freq: 900, q: 0.8, attack: 0.002, decay: 0.08, gain: 0.3 }),
        playTonalBlip(ctx, { destination: dest, now, freq: 220, freqEnd: 170, wave: 'triangle', attack: 0.002, decay: 0.08, gain: 0.12 }),
      ];
    case 'hang_break':
    case 'frame_remove':
      return [
        playNoiseBurst(ctx, { buffer: noise.pink, destination: dest, now, filterType: 'bandpass', freq: 700, q: 1.2, attack: 0.002, decay: 0.16, gain: 0.3 }),
        playTonalBlip(ctx, { destination: dest, now, freq: 180, freqEnd: 110, wave: 'triangle', attack: 0.002, decay: 0.14, gain: 0.12 }),
      ];
    case 'frame_rotate':
      return [
        playNoiseBurst(ctx, { buffer: noise.white, destination: dest, now, filterType: 'highpass', freq: 2500, q: 0.7, attack: 0.002, decay: 0.05, gain: 0.08 }),
        playTonalBlip(ctx, { destination: dest, now, freq: 900, freqEnd: 700, wave: 'triangle', attack: 0.002, decay: 0.05, gain: 0.05 }),
      ];
    default:
      return [];
  }
}
