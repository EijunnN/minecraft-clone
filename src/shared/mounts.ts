// Fase 6 (monturas): lo que el servidor y el cliente saben de cada montura (asiento, si se doma, si
// lleva silla, si se guía, velocidad y salto) y los pelajes de caballos y llamas.
import { MOB_PIG, MOB_HORSE, MOB_DONKEY, MOB_MULE, MOB_LLAMA, MOB_CAMEL } from './mobs';

export interface MountDef {
  /** Altura del asiento (donde apoya la cadera el jinete) sobre los pies de la montura, en bloques. */
  seat: number;
  /** Se doma montándola: tira al jinete hasta que se deja (como en Minecraft). */
  tameable: boolean;
  /** Admite silla de montar. */
  saddle: boolean;
  /** Con silla (y domada) el jinete la guía; si no, va donde quiere. */
  steer: boolean;
  /** Velocidad a galope [mín, máx] en bloques/s (cada animal saca la suya al nacer). */
  speed: [number, number];
  /** Fuerza de salto [mín, máx]: velocidad vertical inicial con el salto cargado del todo. */
  jump: [number, number];
  /** Salto cargado: se mantiene el espacio y se suelta. */
  chargeJump: boolean;
  /** Número de pelajes. */
  variants: number;
}

export const MOUNTS: Readonly<Record<number, MountDef>> = {
  [MOB_HORSE]: { seat: 1.38, tameable: true, saddle: true, steer: true, speed: [6.5, 12], jump: [9.5, 15], chargeJump: true, variants: 35 },
  [MOB_DONKEY]: { seat: 1.2, tameable: true, saddle: true, steer: true, speed: [7, 7], jump: [10, 10], chargeJump: true, variants: 1 },
  [MOB_MULE]: { seat: 1.27, tameable: true, saddle: true, steer: true, speed: [7.5, 7.5], jump: [10, 10], chargeJump: true, variants: 1 },
  [MOB_LLAMA]: { seat: 1.22, tameable: true, saddle: false, steer: false, speed: [0, 0], jump: [0, 0], chargeJump: false, variants: 4 },
  [MOB_CAMEL]: { seat: 2.2, tameable: false, saddle: true, steer: true, speed: [6, 6], jump: [9, 9], chargeJump: false, variants: 1 },
  [MOB_PIG]: { seat: 0.94, tameable: false, saddle: true, steer: false, speed: [0, 0], jump: [0, 0], chargeJump: false, variants: 1 },
};

export function mountDef(type: number): MountDef | undefined {
  return MOUNTS[type];
}

/** Colores de pelaje de los caballos (el pelaje es color + 7 · marcas). */
export const HORSE_COLORS = ['Blanco', 'Crema', 'Castaño', 'Marrón', 'Negro', 'Gris', 'Marrón oscuro'] as const;
/** Marcas: ninguna, calcetines y lucero blancos, manchas blancas, lunares blancos, lunares negros. */
export const HORSE_MARKINGS = 5;
export const LLAMA_COLORS = ['Crema', 'Blanca', 'Marrón', 'Gris'] as const;

export function horseColor(variant: number): number {
  return variant % HORSE_COLORS.length;
}

export function horseMarking(variant: number): number {
  return Math.floor(variant / HORSE_COLORS.length) % HORSE_MARKINGS;
}

/** Altura del jinete (pies del modelo de pie) sobre la montura: la cadera queda en el asiento. */
export const RIDER_HIP = 0.675;

/** Caballo con burro (en cualquier orden) → mula. */
export function offspringType(a: number, b: number): number {
  if (a === b) return a;
  const pair = [a, b].sort((x, y) => x - y);
  return pair[0] === MOB_HORSE && pair[1] === MOB_DONKEY ? MOB_MULE : a;
}

/** ¿Pueden criar juntos? Misma especie o caballo con burro. */
export function canMate(a: number, b: number): boolean {
  return a === b || offspringType(a, b) === MOB_MULE;
}

export function isSaddlePart(name: string): boolean {
  return name === 'saddle' || name.startsWith('stirrup');
}
