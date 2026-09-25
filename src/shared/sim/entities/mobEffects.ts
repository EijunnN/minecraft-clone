// Fase 7 (pociones): efectos de estado de las criaturas (los de los jugadores los lleva su cliente).
// Pociones arrojadizas, nubes persistentes, flechas con efecto y lo que beben las brujas. Veneno y
// regeneración (los no muertos no los notan), curación y daño instantáneos (al revés en los no muertos),
// velocidad y lentitud, caída lenta, invisibilidad (no se las dibuja), resistencia al fuego (no les
// quema) y resistencia (menos daño). Alrededor de quien lleva efectos salen remolinos de su color.
import {
  EFFECTS, EFFECT_POISON, EFFECT_REGENERATION, EFFECT_INSTANT_HEALTH, EFFECT_INSTANT_DAMAGE, EFFECT_SPEED, EFFECT_SLOWNESS,
  EFFECT_INVISIBILITY, EFFECT_FIRE_RESISTANCE, EFFECT_RESISTANCE, EFFECT_SLOW_FALLING, MAX_EFFECT_AMP, MAX_EFFECT_SECONDS, instantHeal, instantHarm,
  regenInterval, poisonInterval, speedMultiplier, resistanceFactor, mixEffectColor, packColor,
} from '../../effects';
import {
  MOB_ZOMBIE, MOB_HUSK, MOB_SKELETON, MOB_STRAY, MOB_DROWNED, MOB_ZOMBIE_VILLAGER, MOB_PHANTOM,
} from '../../mobs';
import { EF_INVISIBLE } from '../../potions';
import type { Entity } from './types';
import type { Entities } from './Entities';

export interface MobEffect {
  /** Nivel (0 = I). */
  amp: number;
  /** Segundos que le quedan. */
  time: number;
  /** Acumulador del efecto periódico (veneno, regeneración). */
  acc: number;
}

/** No muertos: la curación les hace daño y el daño les cura; el veneno y la regeneración no les afectan. */
const UNDEAD: ReadonlySet<number> = new Set([MOB_ZOMBIE, MOB_HUSK, MOB_SKELETON, MOB_STRAY, MOB_DROWNED, MOB_ZOMBIE_VILLAGER, MOB_PHANTOM]);

export function isUndead(type: number): boolean {
  return UNDEAD.has(type);
}

/** Cada cuánto salen remolinos alrededor de una criatura con efectos (s). */
const SWIRL_EVERY = 0.4;

export class MobEffects {
  constructor(private m: Entities) {}

  /**
   * Da un efecto como en Minecraft (gana el de más nivel; con el mismo, el que más dura). Los instantáneos
   * se aplican ya, con la fuerza `scale` (salpicaduras lejanas, nubes). `attacker`: quién lo causó.
   */
  add(e: Entity, id: number, seconds: number, amp: number, scale = 1, attacker: string | number | null = null): void {
    const def = EFFECTS[id];
    if (!def || e.dead || !e.ai) return;
    amp = Math.max(0, Math.min(MAX_EFFECT_AMP, amp | 0));
    if (def.instant) {
      this.instant(e, id, amp, scale, attacker);
      return;
    }
    if (isUndead(e.type) && (id === EFFECT_POISON || id === EFFECT_REGENERATION)) return;
    if (!(seconds > 0)) return;
    seconds = Math.min(MAX_EFFECT_SECONDS, seconds);
    const list = (e.effects ??= new Map());
    const cur = list.get(id);
    if (cur && (cur.amp > amp || (cur.amp === amp && cur.time >= seconds))) return;
    list.set(id, { amp, time: seconds, acc: cur?.acc ?? 0 });
    e.swirl = 0;
  }

  /** Curación o daño instantáneos (al revés en los no muertos). */
  instant(e: Entity, id: number, amp: number, scale: number, attacker: string | number | null): void {
    const heals = (id === EFFECT_INSTANT_HEALTH) !== isUndead(e.type);
    if (id !== EFFECT_INSTANT_HEALTH && id !== EFFECT_INSTANT_DAMAGE) return;
    if (heals) {
      const n = Math.round(instantHeal(amp) * scale);
      if (n > 0) e.health = Math.min(e.maxHealth, e.health + n);
      return;
    }
    const n = Math.round(instantHarm(amp) * scale);
    if (n <= 0) return;
    // La magia no respeta la invulnerabilidad del último golpe.
    e.invuln = 0;
    this.m.damage(e, n, e.x, e.z, attacker, 0);
  }

  amp(e: Entity, id: number): number {
    return e.effects?.get(id)?.amp ?? -1;
  }

  has(e: Entity, id: number): boolean {
    return !!e.effects?.has(id);
  }

  /** Quita todos los efectos (leche). */
  clear(e: Entity): void {
    e.effects = undefined;
    e.flags &= ~EF_INVISIBLE;
    e.speedMul = undefined;
    e.slowFall = undefined;
  }

  /** Multiplicador del daño recibido (Resistencia). */
  damageFactor(e: Entity): number {
    return e.effects ? resistanceFactor(this.amp(e, EFFECT_RESISTANCE)) : 1;
  }

  /**
   * Turno de una criatura con efectos: `think` es su turno normal. Antes, los efectos periódicos (veneno,
   * regeneración) y la resistencia al fuego; después, la velocidad o la lentitud, la invisibilidad y los
   * remolinos.
   */
  tickWith(e: Entity, dt: number, think: () => void): void {
    const list = e.effects!;
    for (const [id, fx] of list) {
      fx.time -= dt;
      if (id === EFFECT_POISON) {
        fx.acc += dt;
        const iv = poisonInterval(fx.amp);
        while (fx.acc >= iv) {
          fx.acc -= iv;
          // El veneno nunca mata: se queda en medio corazón.
          if (e.health > 1) {
            e.invuln = 0;
            this.m.damage(e, 1, e.x, e.z, null, 0);
          }
        }
      } else if (id === EFFECT_REGENERATION) {
        fx.acc += dt;
        const iv = regenInterval(fx.amp);
        while (fx.acc >= iv) {
          fx.acc -= iv;
          e.health = Math.min(e.maxHealth, e.health + 1);
        }
      }
      if (fx.time <= 0) list.delete(id);
    }
    if (e.dead || !this.m.list.has(e.id)) return;
    // Velocidad y Lentitud (el paso de moveBody) y Caída lenta (baja despacio y no se hace daño).
    const k = speedMultiplier(this.amp(e, EFFECT_SPEED), this.amp(e, EFFECT_SLOWNESS));
    e.speedMul = k !== 1 ? k : undefined;
    e.slowFall = list.has(EFFECT_SLOW_FALLING) || undefined;
    if (e.slowFall) e.fallStart = e.y;
    // Resistencia al fuego: arde pero no se quema.
    const fireProof = list.has(EFFECT_FIRE_RESISTANCE);
    if (fireProof) e.burnAcc = 0;
    think();
    if (e.dead || !this.m.list.has(e.id)) return;
    if (fireProof) e.burnAcc = 0;
    if (list.has(EFFECT_INVISIBILITY)) e.flags |= EF_INVISIBLE;
    else e.flags &= ~EF_INVISIBLE;
    // Remolinos del color de sus efectos (más tenues si es invisible).
    e.swirl = (e.swirl ?? 0) - dt;
    if (e.swirl <= 0 && list.size > 0) {
      e.swirl = list.has(EFFECT_INVISIBILITY) ? SWIRL_EVERY * 3 : SWIRL_EVERY;
      const color = mixEffectColor([...list].map(([id, fx]) => [id, fx.amp] as const));
      if (color) this.m.host.fx('effect_swirl', e.x, e.y, e.z, packColor(color), Math.round(e.height * 10));
    }
    if (list.size === 0) this.clear(e);
  }
}
