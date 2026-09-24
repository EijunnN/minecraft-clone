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

export interface EffectDef {
  id: number;
  key: string;
  /** Nombre en español (HUD y comandos). */
  name: string;
  /** Color de las partículas y del icono. */
  color: [number, number, number];
  /** Beneficioso (marco azul) o perjudicial (marco rojo), como en el HUD de Minecraft. */
  good: boolean;
}

export const EFFECTS: Readonly<Record<number, EffectDef>> = {
  [EFFECT_SPEED]: { id: EFFECT_SPEED, key: 'speed', name: 'Velocidad', color: [124, 175, 198], good: true },
  [EFFECT_SLOWNESS]: { id: EFFECT_SLOWNESS, key: 'slowness', name: 'Lentitud', color: [90, 108, 129], good: false },
  [EFFECT_STRENGTH]: { id: EFFECT_STRENGTH, key: 'strength', name: 'Fuerza', color: [255, 199, 0], good: true },
  [EFFECT_WEAKNESS]: { id: EFFECT_WEAKNESS, key: 'weakness', name: 'Debilidad', color: [72, 77, 72], good: false },
  [EFFECT_REGENERATION]: { id: EFFECT_REGENERATION, key: 'regeneration', name: 'Regeneración', color: [205, 92, 171], good: true },
  [EFFECT_POISON]: { id: EFFECT_POISON, key: 'poison', name: 'Veneno', color: [135, 163, 99], good: false },
  [EFFECT_HUNGER]: { id: EFFECT_HUNGER, key: 'hunger', name: 'Hambre', color: [88, 118, 83], good: false },
  [EFFECT_FIRE_RESISTANCE]: { id: EFFECT_FIRE_RESISTANCE, key: 'fire_resistance', name: 'Resistencia al fuego', color: [255, 153, 0], good: true },
  [EFFECT_NIGHT_VISION]: { id: EFFECT_NIGHT_VISION, key: 'night_vision', name: 'Visión nocturna', color: [194, 255, 102], good: true },
  [EFFECT_WATER_BREATHING]: { id: EFFECT_WATER_BREATHING, key: 'water_breathing', name: 'Respiración acuática', color: [152, 218, 192], good: true },
  [EFFECT_ABSORPTION]: { id: EFFECT_ABSORPTION, key: 'absorption', name: 'Absorción', color: [37, 82, 165], good: true },
};

/** Duración máxima que se acepta (s) y nivel máximo (0 = nivel I). */
export const MAX_EFFECT_SECONDS = 3600;
export const MAX_EFFECT_AMP = 4;

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
  return ['I', 'II', 'III', 'IV', 'V'][Math.max(0, Math.min(4, amp))];
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
