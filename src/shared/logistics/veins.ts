// Programa lunar (idea-industria.md): las reservas de los yacimientos y las reglas del extractor. Como en Factorio, los recursos son
// manchas de mineral en el suelo, cada casilla con una cantidad finita que se va gastando; aquí, cada bloque de veta (o de hielo sucio)
// guarda entre 120 y 279 unidades de mineral (media 200), que sale de una función de su posición: no hace falta guardar nada hasta
// que el extractor empieza a gastarla. Cuando se acaba, el bloque se vuelve regolito (o roca, si era hielo).
//
// Números (de Factorio: taladro eléctrico 0,5 mineral/s con mineral de tiempo 1; aquí la potencia sigue la proporción de nuestro panel
// de 20 kW): 0,5 mineral/s a plena potencia, 30 kW, área de 5×5 y hasta 3 bloques de fondo. Un extractor sobre veta rica (2 capas de
// 25 bloques, ~200 cada una) da ~10 000 minerales: unas 5 horas a 0,5/s.
import { MOON_IRON_VEIN, MOON_COPPER_VEIN, MOON_COAL_VEIN, MOON_STONE_VEIN, DIRTY_ICE, MOON_REGOLITH, MOON_REGOLITH_DARK, MOON_ROCK, COBBLESTONE } from '../blocks';
import { RAW_IRON, RAW_COPPER, COAL, itemForBlock } from '../items';
import { hash2 } from '../constants';

/** Segundos que tarda el extractor en sacar un objeto a plena potencia (0,5 objetos/s). */
export const EXTRACT_SECONDS = 2;
/** Radio del área (2 → 5×5) y bloques de fondo bajo el extractor que mira. */
export const EXTRACTOR_RADIUS = 2;
export const EXTRACTOR_DEPTH = 3;

const AMOUNT_MIN = 120, AMOUNT_SPAN = 160;

/** Reserva inicial (unidades de mineral) del bloque de veta de (x, y, z). */
export function veinAmount(seed: number, x: number, y: number, z: number): number {
  return AMOUNT_MIN + ((hash2(x * 31 + y * 7, z, seed ^ 0x5eed11) >>> 0) % AMOUNT_SPAN);
}

export interface VeinYield {
  /** Objeto que sale. */
  item: number;
  /** En qué se convierte el bloque cuando se agota. */
  depleted: number;
}

/** ¿Es un bloque del que el extractor puede sacar algo? (y qué) */
export function veinYield(block: number): VeinYield | null {
  if (block === MOON_IRON_VEIN) return { item: RAW_IRON, depleted: MOON_REGOLITH_DARK };
  if (block === MOON_COPPER_VEIN) return { item: RAW_COPPER, depleted: MOON_REGOLITH };
  if (block === MOON_COAL_VEIN) return { item: COAL, depleted: MOON_REGOLITH };
  if (block === MOON_STONE_VEIN) return { item: itemForBlock(COBBLESTONE) || COBBLESTONE, depleted: MOON_ROCK };
  if (block === DIRTY_ICE) {
    const item = itemForBlock(DIRTY_ICE);
    return item ? { item, depleted: MOON_ROCK } : null;
  }
  return null;
}
