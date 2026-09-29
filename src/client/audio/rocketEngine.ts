// Programa lunar: el rugido de los motores del cohete, que se oye dentro de la cabina (no posicional). Ruido rosa en bucle por
// tres filtros: un retumbar grave que da cuerpo (lo que hace temblar el pecho), un rugido medio y un siseo agudo que sube con la
// potencia. El volumen y el tono los fija el cliente cada frame (0 = apagado: el sonido se suelta despacio y se para).
import { noiseSource, type NoiseBuffers } from './noise';
import { clamp01 } from './types';

export class RocketEngine {
  private src: AudioBufferSourceNode | null = null;
  private rumble: BiquadFilterNode | null = null;
  private roar: BiquadFilterNode | null = null;
  private hiss: BiquadFilterNode | null = null;
  private gain: GainNode | null = null;
  private volume = 0;
  private power = 0;

  constructor(
    private readonly ctx: AudioContext,
    private readonly noise: NoiseBuffers,
    private readonly destination: AudioNode,
  ) {}

  /** Volumen (0..1) y potencia (0..1: más agudo y más fuerte cuanto más empuja). */
  set(volume: number, power: number): void {
    this.volume = clamp01(volume);
    this.power = clamp01(power);
  }

  update(): void {
    const ctx = this.ctx;
    const now = ctx.currentTime;
    if (this.volume <= 0.002) {
      if (this.gain) {
        this.gain.gain.setTargetAtTime(0, now, 0.4);
        const src = this.src;
        this.src = null;
        this.gain = null;
        setTimeout(() => {
          try {
            src?.stop();
          } catch {
            /* ya parada */
          }
        }, 2500);
      }
      return;
    }
    if (!this.gain) {
      const src = noiseSource(ctx, this.noise.pink, true);
      const rumble = ctx.createBiquadFilter();
      rumble.type = 'lowpass';
      rumble.frequency.value = 90;
      rumble.Q.value = 1.1;
      const roar = ctx.createBiquadFilter();
      roar.type = 'bandpass';
      roar.frequency.value = 420;
      roar.Q.value = 0.5;
      const hiss = ctx.createBiquadFilter();
      hiss.type = 'highpass';
      hiss.frequency.value = 2400;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const rumbleGain = ctx.createGain();
      rumbleGain.gain.value = 2.4;
      const roarGain = ctx.createGain();
      roarGain.gain.value = 0.9;
      const hissGain = ctx.createGain();
      hissGain.gain.value = 0.22;
      src.connect(rumble).connect(rumbleGain).connect(gain);
      src.connect(roar).connect(roarGain).connect(gain);
      src.connect(hiss).connect(hissGain).connect(gain);
      gain.connect(this.destination);
      src.start(now, Math.random() * 2);
      this.src = src;
      this.rumble = rumble;
      this.roar = roar;
      this.hiss = hiss;
      this.gain = gain;
    }
    const v = this.volume, p = this.power;
    this.rumble!.frequency.setTargetAtTime(70 + 90 * p, now, 0.2);
    this.roar!.frequency.setTargetAtTime(300 + 500 * p, now, 0.2);
    this.hiss!.frequency.setTargetAtTime(2000 + 2600 * p, now, 0.2);
    this.src!.playbackRate.setTargetAtTime(0.8 + 0.35 * p, now, 0.25);
    this.gain!.gain.setTargetAtTime(v * 0.6, now, 0.25);
  }

  dispose(): void {
    try {
      this.src?.stop();
    } catch {
      /* ya parada */
    }
    this.src = null;
    this.gain = null;
  }
}
