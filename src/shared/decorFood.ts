// Fase 6.5 (decoración): comida con algo especial. El estofado sospechoso da un efecto según la flor
// con la que se hizo (como en Minecraft Java); la flor va en el `dmg` de la pila (1..n, índice de
// SUSPICIOUS_FLOWERS + 1). Los estofados y sopas devuelven el cuenco.
import { POPPY, DANDELION, CORNFLOWER, FLOWERS } from './blocks';
import {
  EFFECT_FIRE_RESISTANCE, EFFECT_NIGHT_VISION, EFFECT_SPEED, EFFECT_SLOWNESS, EFFECT_POISON, EFFECT_REGENERATION, EFFECT_WEAKNESS, EFFECTS,
} from './effects';
import { BOWL, MUSHROOM_STEW, RABBIT_STEW, BEETROOT_SOUP, SUSPICIOUS_STEW } from './items';

/**
 * Flor → efecto del estofado: [bloque de la flor, efecto (0 = saturación: comida extra), segundos].
 * Los efectos que aún no existen en el juego (ceguera, salto) se cambian por el más parecido que hay.
 * El orden es el que se guarda en `dmg`: sólo se añade al final.
 */
export const SUSPICIOUS_FLOWERS: readonly (readonly [number, number, number])[] = [
  [POPPY, EFFECT_NIGHT_VISION, 5],
  [DANDELION, 0, 0.35],
  [CORNFLOWER, EFFECT_SPEED, 5], // (Minecraft: salto 5 s)
  [FLOWERS.blue_orchid, 0, 0.35],
  [FLOWERS.allium, EFFECT_FIRE_RESISTANCE, 3],
  [FLOWERS.azure_bluet, EFFECT_SLOWNESS, 11], // (Minecraft: ceguera 11 s)
  [FLOWERS.red_tulip, EFFECT_WEAKNESS, 7],
  [FLOWERS.orange_tulip, EFFECT_WEAKNESS, 7],
  [FLOWERS.white_tulip, EFFECT_WEAKNESS, 7],
  [FLOWERS.pink_tulip, EFFECT_WEAKNESS, 7],
  [FLOWERS.oxeye_daisy, EFFECT_REGENERATION, 7],
  [FLOWERS.lily_of_the_valley, EFFECT_POISON, 11],
];

/** Efecto de un estofado sospechoso: [efecto (0 = saturación), segundos] o null si no tiene flor. */
export function stewEffect(dmg: number | undefined): readonly [number, number] | null {
  const f = SUSPICIOUS_FLOWERS[(dmg ?? 0) - 1];
  return f ? [f[1], f[2]] : null;
}

/** Texto del efecto (para la descripción del objeto). */
export function stewEffectText(dmg: number | undefined): string {
  const e = stewEffect(dmg);
  if (!e) return '';
  return e[0] === 0 ? 'Saturación' : `${EFFECTS[e[0]]?.name ?? '?'} (${e[1]} s)`;
}

/** Comida que deja el recipiente al comerla (cuenco). */
export const EATEN_REMAINDER: Readonly<Record<number, number>> = {
  [MUSHROOM_STEW]: BOWL, [RABBIT_STEW]: BOWL, [BEETROOT_SOUP]: BOWL, [SUSPICIOUS_STEW]: BOWL,
};
