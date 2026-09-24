// Música generativa: piezas de piano calmadas y dispersas, de inspiración C418 (no una copia de
// ninguna canción real). Cada frase se compone entera de una vez (con tiempos absolutos del
// AudioContext) y se deja programada; Web Audio se encarga de la reproducción precisa aunque el
// bucle de fotogramas no sea perfectamente regular.
import { choice, randInt, randRange } from './types';

const MAJOR_PENTATONIC: readonly number[] = [0, 2, 4, 7, 9];
const MINOR_PENTATONIC: readonly number[] = [0, 3, 5, 7, 10];
// Raíces graves tipo piano: C3, D3, E3, F3, G3.
const ROOTS: readonly number[] = [130.81, 146.83, 164.81, 174.61, 196.0];

function noteFreq(root: number, semitones: number): number {
  return root * Math.pow(2, semitones / 12);
}

function clampIndex(i: number, len: number): number {
  return ((i % len) + len) % len;
}

export class MusicEngine {
  private countdown: number;
  private readonly pending: AudioScheduledSourceNode[] = [];
  private disposed = false;

  constructor(
    private readonly ctx: AudioContext,
    private readonly destination: AudioNode,
    private readonly reverbSend: AudioNode,
  ) {
    // Pequeño silencio inicial: deja que la ambientación se asiente antes de la primera frase.
    this.countdown = randRange(8, 30);
  }

  update(dt: number): void {
    if (this.disposed) return;
    this.countdown -= dt;
    if (this.countdown <= 0) {
      const startAt = this.ctx.currentTime + 1.5;
      const phraseDuration = this.schedulePhrase(startAt);
      this.countdown = Math.max(phraseDuration + 20, randRange(120, 240));
    }
  }

  /** Genera y programa una frase completa; devuelve su duración aproximada en segundos. */
  private schedulePhrase(startAt: number): number {
    const scale = Math.random() < 0.55 ? MAJOR_PENTATONIC : MINOR_PENTATONIC;
    const root = choice(ROOTS);
    const beat = randRange(0.85, 1.4);
    const targetSeconds = randRange(30, 90);
    const beats = Math.max(8, Math.floor(targetSeconds / beat));

    let melodyIndex = randInt(0, scale.length - 1);
    let melodyOctave = 1;
    let lastChordBeat = -999;
    let nextChordGap = randInt(4, 8);

    for (let b = 0; b < beats; b++) {
      const beatTime = startAt + b * beat;

      // Melodía: paseo aleatorio de paso corto dentro de la escala, con huecos (silencio disperso).
      if (Math.random() < 0.58) {
        melodyIndex = clampIndex(melodyIndex + randInt(-1, 1), scale.length);
        if (Math.random() < 0.12) melodyOctave = melodyOctave === 1 ? 2 : 1;
        const semis = scale[melodyIndex] + 12 * melodyOctave;
        const dur = beat * randRange(1, 2.4);
        const jitter = randRange(-0.03, 0.03);
        this.playPianoNote(noteFreq(root, semis), beatTime + jitter, dur, randRange(0.12, 0.26));
      }

      // Acorde grave ocasional (raíz + dos grados) como sostén armónico suave.
      if (b - lastChordBeat >= nextChordGap) {
        lastChordBeat = b;
        nextChordGap = randInt(4, 8);
        const dur = beat * randRange(3, 6);
        const chordTones = [0, scale[2], scale[4]];
        for (const ct of chordTones) {
          this.playPianoNote(noteFreq(root, ct), beatTime + randRange(-0.02, 0.02), dur, randRange(0.07, 0.15));
        }
      }
    }

    return beats * beat;
  }

  /** Voz de piano aditiva/FM suave: ataque rápido, caída exponencial, hacia la reverb compartida. */
  private playPianoNote(freq: number, startTime: number, duration: number, velocity: number): void {
    if (this.disposed) return;
    const ctx = this.ctx;

    const carrier = ctx.createOscillator();
    carrier.type = 'sine';
    carrier.frequency.value = freq;

    // Modulador sutil: el "tine" percusivo del ataque, como el golpe del martillo del piano.
    const modulator = ctx.createOscillator();
    modulator.type = 'sine';
    modulator.frequency.value = freq * 2.01;
    const modGain = ctx.createGain();
    modGain.gain.setValueAtTime(freq * 0.5 * velocity, startTime);
    modGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.22);
    modulator.connect(modGain).connect(carrier.frequency);

    // Sobretono de una octava para dar cuerpo tipo piano.
    const overtone = ctx.createOscillator();
    overtone.type = 'sine';
    overtone.frequency.value = freq * 2;
    const overtoneGain = ctx.createGain();
    overtoneGain.gain.value = 0.16 * velocity;

    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, startTime);
    amp.gain.exponentialRampToValueAtTime(Math.max(velocity, 0.0005), startTime + 0.01);
    amp.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    carrier.connect(amp);
    overtone.connect(overtoneGain).connect(amp);

    const dry = ctx.createGain();
    dry.gain.value = 0.8;
    const wet = ctx.createGain();
    wet.gain.value = 0.55;
    amp.connect(dry).connect(this.destination);
    amp.connect(wet).connect(this.reverbSend);

    const stopAt = startTime + duration + 0.3;
    carrier.start(startTime);
    modulator.start(startTime);
    overtone.start(startTime);
    carrier.stop(stopAt);
    modulator.stop(stopAt);
    overtone.stop(stopAt);

    const nodes: AudioScheduledSourceNode[] = [carrier, modulator, overtone];
    this.pending.push(...nodes);
    carrier.addEventListener(
      'ended',
      () => {
        try {
          carrier.disconnect();
          modulator.disconnect();
          overtone.disconnect();
          modGain.disconnect();
          overtoneGain.disconnect();
          amp.disconnect();
          dry.disconnect();
          wet.disconnect();
        } catch {
          /* ya desconectado */
        }
        for (const n of nodes) {
          const idx = this.pending.indexOf(n);
          if (idx >= 0) this.pending.splice(idx, 1);
        }
      },
      { once: true },
    );
  }

  dispose(): void {
    this.disposed = true;
    for (const n of this.pending.splice(0)) {
      try {
        n.stop();
      } catch {
        /* ya detenida */
      }
      try {
        n.disconnect();
      } catch {
        /* ya desconectada */
      }
    }
  }
}
