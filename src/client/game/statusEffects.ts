// Efectos de estado del jugador (los lleva el cliente, como la vida y el hambre): duración y nivel de
// cada uno, sus reglas por tick (curar, envenenar, dar hambre) y lo que cambian en movimiento,
// daño, fuego, aire y visión. Se guardan con el jugador.
import {
  EFFECTS, EFFECT_SPEED, EFFECT_SLOWNESS, EFFECT_STRENGTH, EFFECT_WEAKNESS, EFFECT_REGENERATION, EFFECT_POISON,
  EFFECT_HUNGER, EFFECT_FIRE_RESISTANCE, EFFECT_NIGHT_VISION, EFFECT_WATER_BREATHING, EFFECT_ABSORPTION,
  MAX_EFFECT_AMP, MAX_EFFECT_SECONDS, speedMultiplier, meleeBonus, regenInterval, poisonInterval, hungerExhaustion,
} from '../../shared/effects';
import { EFFECT_CONDUIT_POWER } from '../../shared/effects'; // Fase 6.5 (equipo)

export interface ActiveEffect {
  /** Nivel (0 = I). */
  amp: number;
  /** Segundos restantes. */
  time: number;
  /** Duración total (para el parpadeo del icono al acabarse). */
  total: number;
  /** Acumulador del efecto periódico (regeneración, veneno). */
  acc: number;
}

/** Lo que los efectos necesitan de la supervivencia. */
export interface EffectTarget {
  health: number;
  heal(n: number): void;
  damage(amount: number, cause: string, bypass?: boolean): number;
  addExhaustion(n: number): void;
  /** Corazones dorados (absorción). */
  absorption: number;
}

export class StatusEffects {
  readonly list = new Map<number, ActiveEffect>();
  /** Aumenta con cada cambio (para guardar y refrescar el HUD). */
  version = 0;

  /**
   * Da un efecto como Minecraft: si ya lo tiene, gana el de más nivel; con el mismo nivel, el que
   * dura más.
   */
  add(id: number, seconds: number, amp: number, target?: EffectTarget): void {
    if (!EFFECTS[id] || !(seconds > 0)) return;
    amp = Math.max(0, Math.min(MAX_EFFECT_AMP, amp | 0));
    seconds = Math.min(MAX_EFFECT_SECONDS, seconds);
    const cur = this.list.get(id);
    if (cur && (cur.amp > amp || (cur.amp === amp && cur.time >= seconds))) return;
    this.list.set(id, { amp, time: seconds, total: seconds, acc: 0 });
    // Absorción: corazones dorados (2 por nivel) que se gastan antes que la vida.
    if (id === EFFECT_ABSORPTION && target) target.absorption = Math.max(target.absorption, 4 * (amp + 1));
    this.version++;
  }

  remove(id: number, target?: EffectTarget): void {
    if (!this.list.delete(id)) return;
    if (id === EFFECT_ABSORPTION && target) target.absorption = 0;
    this.version++;
  }

  /** Quita todos (leche, muerte). */
  clear(target?: EffectTarget): void {
    if (this.list.size === 0) return;
    this.list.clear();
    if (target) target.absorption = 0;
    this.version++;
  }

  /** Nivel del efecto (0 = I) o −1 si no lo tiene. */
  amp(id: number): number {
    return this.list.get(id)?.amp ?? -1;
  }

  has(id: number): boolean {
    return this.list.has(id);
  }

  /** Multiplicador de la velocidad al andar (Velocidad y Lentitud). */
  get speed(): number {
    return speedMultiplier(this.amp(EFFECT_SPEED), this.amp(EFFECT_SLOWNESS));
  }

  /** Daño extra cuerpo a cuerpo (Fuerza y Debilidad). */
  get melee(): number {
    return meleeBonus(this.amp(EFFECT_STRENGTH), this.amp(EFFECT_WEAKNESS));
  }

  get fireResistant(): boolean {
    return this.has(EFFECT_FIRE_RESISTANCE);
  }

  get waterBreathing(): boolean {
    return this.has(EFFECT_WATER_BREATHING) || this.has(EFFECT_CONDUIT_POWER); // Fase 6.5 (equipo): conducto
  }

  /** Visión nocturna (0..1; parpadea los últimos 10 s como en Minecraft). */
  get nightVision(): number {
    const e = this.list.get(EFFECT_NIGHT_VISION);
    if (!e) return this.has(EFFECT_CONDUIT_POWER) ? 1 : 0; // Fase 6.5 (equipo): el conducto (sólo se da en el agua)
    if (e.time > 10) return 1;
    return 0.7 + 0.3 * Math.sin(e.time * 20 * Math.PI * 0.2);
  }

  /** Avanza el tiempo: curar, envenenar, dar hambre y retirar lo que se acaba. */
  tick(dt: number, target: EffectTarget): void {
    if (this.list.size === 0) return;
    for (const [id, e] of this.list) {
      e.time -= dt;
      if (id === EFFECT_REGENERATION) {
        e.acc += dt;
        const iv = regenInterval(e.amp);
        while (e.acc >= iv) {
          e.acc -= iv;
          if (target.health < 20) target.heal(1);
        }
      } else if (id === EFFECT_POISON) {
        e.acc += dt;
        const iv = poisonInterval(e.amp);
        while (e.acc >= iv) {
          e.acc -= iv;
          // El veneno nunca mata: se queda en medio corazón.
          if (target.health > 1) target.damage(1, 'poison', true);
        }
      } else if (id === EFFECT_HUNGER) {
        target.addExhaustion(hungerExhaustion(e.amp) * dt);
      }
      if (e.time <= 0) {
        this.list.delete(id);
        if (id === EFFECT_ABSORPTION) target.absorption = 0;
        this.version++;
      }
    }
    // La absorción se acaba también cuando se gastan los corazones dorados.
    if (this.list.has(EFFECT_ABSORPTION) && target.absorption <= 0) this.remove(EFFECT_ABSORPTION);
  }

  /** Para el guardado: [efecto, nivel, segundos]. */
  toWire(): [number, number, number][] {
    return [...this.list].map(([id, e]) => [id, e.amp, Math.round(e.time * 10) / 10]);
  }

  fromWire(w: unknown, target?: EffectTarget): void {
    this.list.clear();
    if (Array.isArray(w)) {
      for (const f of w) {
        if (!Array.isArray(f)) continue;
        const [id, amp, secs] = f.map(Number);
        this.add(id, secs, amp, target);
      }
    }
    this.version++;
  }
}
