// Grupos de bloques de vegetación que usan varios sistemas del servidor.
import { GRASS, DIRT, SNOWY_GRASS, WOOD_TYPES, ALL_LOGS, ALL_LEAVES } from '../../blocks';

export const LOGS: ReadonlySet<number> = new Set(ALL_LOGS);
export const LEAVES: ReadonlySet<number> = new Set(ALL_LEAVES);
/**
 * Brote → tipo de árbol: su posición en WOOD_TYPES (0 roble, 1 abedul, 2 abeto, 3 jungla, 4 acacia,
 * 5 roble oscuro, 6 cerezo).
 */
export const SAPLINGS: ReadonlyMap<number, number> = new Map(WOOD_TYPES.map((w, i) => [w.sapling, i]));
/** Suelo donde crecen brotes y caña. */
export const SOIL: ReadonlySet<number> = new Set([GRASS, DIRT, SNOWY_GRASS]);
