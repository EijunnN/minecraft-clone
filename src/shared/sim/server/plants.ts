// Grupos de bloques de vegetación que usan varios sistemas del servidor.
import {
  OAK_LOG, BIRCH_LOG, SPRUCE_LOG, OAK_LEAVES, BIRCH_LEAVES, SPRUCE_LEAVES, OAK_SAPLING, BIRCH_SAPLING, SPRUCE_SAPLING,
  GRASS, DIRT, SNOWY_GRASS,
} from '../../blocks';

export const LOGS: ReadonlySet<number> = new Set([OAK_LOG, BIRCH_LOG, SPRUCE_LOG]);
export const LEAVES: ReadonlySet<number> = new Set([OAK_LEAVES, BIRCH_LEAVES, SPRUCE_LEAVES]);
/** Brote → tipo de árbol (0 roble, 1 abedul, 2 abeto). */
export const SAPLINGS: ReadonlyMap<number, number> = new Map([[OAK_SAPLING, 0], [BIRCH_SAPLING, 1], [SPRUCE_SAPLING, 2]]);
/** Suelo donde crecen brotes y caña. */
export const SOIL: ReadonlySet<number> = new Set([GRASS, DIRT, SNOWY_GRASS]);
