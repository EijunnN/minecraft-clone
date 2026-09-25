// Efectos de estado (como en Minecraft Java): qué hace cada uno, sus colores e iconos, y qué
// alimentos los dan. Los aplica el cliente sobre su jugador (vida, hambre y movimiento son suyos).

export const EFFECT_SPEED = 1;
export const EFFECT_SLOWNESS = 2;
export const EFFECT_STRENGTH = 3;
export const EFFECT_WEAKNESS = 4;
export const EFFECT_REGENERATION = 5;
export const EFFECT_POISON = 6;
export const EFFECT_HUNGER = 7;
export const EFFECT_FIRE_RESISTANCE = 8;
export const EFFECT_NIGHT_VISION = 9;
export const EFFECT_WATER_BREATHING = 10;
export const EFFECT_ABSORPTION = 11;
// Fase 6 (asaltos): Mal presagio (se bebe con la botella ominosa; al entrar en una aldea empieza un
// asalto) y Héroe de la aldea (tras ganar un asalto: los aldeanos rebajan sus precios).
export const EFFECT_BAD_OMEN = 12;
export const EFFECT_HERO = 13;
// Fase 6.5 (equipo): Resistencia (manzana de oro encantada: −20 % de daño por nivel) y Poder del
// conducto (respiración acuática y visión bajo el agua cerca de un conducto activo).
export const EFFECT_RESISTANCE = 14;
export const EFFECT_CONDUIT_POWER = 15;
// Fase 7 (pociones): Supersalto, Invisibilidad, Caída lenta, Suerte, Mala suerte y los instantáneos
// (Curación instantánea y Daño instantáneo, que se aplican de golpe en vez de durar).
export const EFFECT_JUMP_BOOST = 16;
export const EFFECT_INVISIBILITY = 17;
export const EFFECT_SLOW_FALLING = 18;
export const EFFECT_LUCK = 19;
export const EFFECT_UNLUCK = 20;
export const EFFECT_INSTANT_HEALTH = 21;
export const EFFECT_INSTANT_DAMAGE = 22;

export interface EffectDef {
  id: number;
  key: string;
  /** Nombre en español (HUD y comandos). */
  name: string;
  /** Color de las partículas y del icono. */
  color: [number, number, number];
  /** Beneficioso (marco azul) o perjudicial (marco rojo), como en el HUD de Minecraft. */
  good: boolean;
  /** Fase 7 (pociones): instantáneo (curación o daño de golpe; no dura ni sale en el HUD). */
  instant?: boolean;
}

export const EFFECTS: Readonly<Record<number, EffectDef>> = {
  // (Fase 7: Velocidad, Lentitud y Resistencia, con los colores actuales de Minecraft.)
  [EFFECT_SPEED]: { id: EFFECT_SPEED, key: 'speed', name: 'Velocidad', color: [51, 235, 255], good: true },
  [EFFECT_SLOWNESS]: { id: EFFECT_SLOWNESS, key: 'slowness', name: 'Lentitud', color: [139, 175, 224], good: false },
  [EFFECT_STRENGTH]: { id: EFFECT_STRENGTH, key: 'strength', name: 'Fuerza', color: [255, 199, 0], good: true },
  [EFFECT_WEAKNESS]: { id: EFFECT_WEAKNESS, key: 'weakness', name: 'Debilidad', color: [72, 77, 72], good: false },
  [EFFECT_REGENERATION]: { id: EFFECT_REGENERATION, key: 'regeneration', name: 'Regeneración', color: [205, 92, 171], good: true },
  [EFFECT_POISON]: { id: EFFECT_POISON, key: 'poison', name: 'Veneno', color: [135, 163, 99], good: false },
  [EFFECT_HUNGER]: { id: EFFECT_HUNGER, key: 'hunger', name: 'Hambre', color: [88, 118, 83], good: false },
  [EFFECT_FIRE_RESISTANCE]: { id: EFFECT_FIRE_RESISTANCE, key: 'fire_resistance', name: 'Resistencia al fuego', color: [255, 153, 0], good: true },
  [EFFECT_NIGHT_VISION]: { id: EFFECT_NIGHT_VISION, key: 'night_vision', name: 'Visión nocturna', color: [194, 255, 102], good: true },
  [EFFECT_WATER_BREATHING]: { id: EFFECT_WATER_BREATHING, key: 'water_breathing', name: 'Respiración acuática', color: [152, 218, 192], good: true },
  [EFFECT_ABSORPTION]: { id: EFFECT_ABSORPTION, key: 'absorption', name: 'Absorción', color: [37, 82, 165], good: true },
  [EFFECT_BAD_OMEN]: { id: EFFECT_BAD_OMEN, key: 'bad_omen', name: 'Mal presagio', color: [11, 97, 56], good: false },
  [EFFECT_HERO]: { id: EFFECT_HERO, key: 'hero_of_the_village', name: 'Héroe de la aldea', color: [68, 255, 68], good: true },
  // Fase 6.5 (equipo)
  [EFFECT_RESISTANCE]: { id: EFFECT_RESISTANCE, key: 'resistance', name: 'Resistencia', color: [145, 70, 240], good: true },
  [EFFECT_CONDUIT_POWER]: { id: EFFECT_CONDUIT_POWER, key: 'conduit_power', name: 'Poder del conducto', color: [29, 194, 209], good: true },
  // Fase 7 (pociones)
  [EFFECT_JUMP_BOOST]: { id: EFFECT_JUMP_BOOST, key: 'jump_boost', name: 'Supersalto', color: [253, 255, 132], good: true },
  [EFFECT_INVISIBILITY]: { id: EFFECT_INVISIBILITY, key: 'invisibility', name: 'Invisibilidad', color: [246, 246, 246], good: true },
  [EFFECT_SLOW_FALLING]: { id: EFFECT_SLOW_FALLING, key: 'slow_falling', name: 'Caída lenta', color: [243, 207, 185], good: true },
  [EFFECT_LUCK]: { id: EFFECT_LUCK, key: 'luck', name: 'Suerte', color: [89, 193, 6], good: true },
  [EFFECT_UNLUCK]: { id: EFFECT_UNLUCK, key: 'unluck', name: 'Mala suerte', color: [192, 164, 77], good: false },
  [EFFECT_INSTANT_HEALTH]: { id: EFFECT_INSTANT_HEALTH, key: 'instant_health', name: 'Curación instantánea', color: [248, 36, 35], good: true, instant: true },
  [EFFECT_INSTANT_DAMAGE]: { id: EFFECT_INSTANT_DAMAGE, key: 'instant_damage', name: 'Daño instantáneo', color: [169, 101, 106], good: false, instant: true },
};

/** Fase 6.5 (equipo): multiplicador del daño con Resistencia (−20 % por nivel; −1 = sin el efecto). */
export function resistanceFactor(amp: number): number {
  return amp < 0 ? 1 : Math.max(0, 1 - 0.2 * (amp + 1));
}

/** Segundos de Mal presagio al beber la botella ominosa y de Héroe de la aldea tras ganar un asalto. */
export const BAD_OMEN_SECONDS = 3600;
export const HERO_SECONDS = 2400;

/** Duración máxima que se acepta (s) y nivel máximo (0 = nivel I; Fase 7: VI, la Lentitud del maestro tortuga fuerte). */
export const MAX_EFFECT_SECONDS = 3600;
export const MAX_EFFECT_AMP = 5;

/** Efecto que da un alimento: [efecto, segundos, nivel (0 = I), probabilidad]. */
export type FoodEffect = [number, number, number, number];

/** Efecto por clave (para el comando /efecto): acepta la clave o el nombre sin tildes. */
export function effectByName(v: string): EffectDef | null {
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[\s_]+/g, '');
  const k = norm(v);
  for (const d of Object.values(EFFECTS)) if (norm(d.key) === k || norm(d.name) === k) return d;
  return null;
}

/** Números romanos para el nivel (Fuerza II). */
export function effectLevel(amp: number): string {
  return ['I', 'II', 'III', 'IV', 'V', 'VI'][Math.max(0, Math.min(5, amp))];
}

/** Multiplicador de velocidad al andar: +20 % por nivel de Velocidad, −15 % por nivel de Lentitud. */
export function speedMultiplier(speedAmp: number, slowAmp: number): number {
  const up = speedAmp >= 0 ? 1 + 0.2 * (speedAmp + 1) : 1;
  const down = slowAmp >= 0 ? Math.max(0, 1 - 0.15 * (slowAmp + 1)) : 1;
  return up * down;
}

/** Daño extra cuerpo a cuerpo: Fuerza +3 por nivel, Debilidad −4 por nivel. */
export function meleeBonus(strengthAmp: number, weaknessAmp: number): number {
  return (strengthAmp >= 0 ? 3 * (strengthAmp + 1) : 0) - (weaknessAmp >= 0 ? 4 * (weaknessAmp + 1) : 0);
}

/** Segundos entre curaciones de Regeneración (50 ticks, la mitad por nivel). */
export function regenInterval(amp: number): number {
  return Math.max(0.05, 2.5 / (1 << Math.min(5, amp)));
}

/** Segundos entre daños de Veneno (25 ticks, la mitad por nivel). */
export function poisonInterval(amp: number): number {
  return Math.max(0.05, 1.25 / (1 << Math.min(5, amp)));
}

/** Agotamiento por segundo del efecto Hambre (0,005 por tick y nivel). */
export function hungerExhaustion(amp: number): number {
  return 0.1 * (amp + 1);
}

// ------------------------------------------------------------------ Fase 7 (pociones)

/** Vida que cura Curación instantánea (4, doblando con cada nivel) y la que quita Daño instantáneo (6, doblando). */
export function instantHeal(amp: number): number {
  return 4 << Math.max(0, Math.min(5, amp));
}
export function instantHarm(amp: number): number {
  return 6 << Math.max(0, Math.min(5, amp));
}

/** Velocidad extra del salto con Supersalto (bloques/s: 0,1 bloques por tick y nivel, como en Minecraft). */
export function jumpBoostVelocity(amp: number): number {
  return amp < 0 ? 0 : 2 * (amp + 1);
}

/** Caída lenta: gravedad (bloques/s²) y velocidad máxima de caída (bloques/s); no hay daño por caída. */
export const SLOW_FALL_GRAVITY = 4;
export const SLOW_FALL_SPEED = 1.8;

/**
 * Alcance con que las criaturas ven a alguien invisible (fracción del normal): 0,7 × la parte del cuerpo
 * cubierta por la armadura (cada pieza, una cuarta parte), como mínimo 0,07, como en Minecraft.
 */
export function invisibleRange(armorPieces: number): number {
  return 0.7 * Math.max(0.1, Math.min(4, armorPieces) / 4);
}

/** Color mezclado de varios efectos [efecto, nivel] (partículas y líquido de las pociones): media pesada por nivel. */
export function mixEffectColor(list: readonly (readonly [number, number])[]): [number, number, number] | null {
  let r = 0, g = 0, b = 0, w = 0;
  for (const [id, amp] of list) {
    const d = EFFECTS[id];
    if (!d) continue;
    const k = amp + 1;
    r += d.color[0] * k;
    g += d.color[1] * k;
    b += d.color[2] * k;
    w += k;
  }
  return w > 0 ? [Math.round(r / w), Math.round(g / w), Math.round(b / w)] : null;
}

/** Color empaquetado 0xRRGGBB (para los mensajes de partículas). */
export function packColor(c: readonly [number, number, number]): number {
  return (c[0] << 16) | (c[1] << 8) | c[2];
}

export function unpackColor(v: number): [number, number, number] {
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
