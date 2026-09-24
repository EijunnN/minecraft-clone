// Compostador: probabilidad de que cada objeto suba un nivel (valores de Minecraft) y sus niveles.
import {
  COMPOSTER, familyBase, SHORT_GRASS, FERN, OAK_LEAVES, BIRCH_LEAVES, SPRUCE_LEAVES, OAK_SAPLING, BIRCH_SAPLING,
  SPRUCE_SAPLING, CACTUS, SUGAR_CANE, PUMPKIN, MELON, CARVED_PUMPKIN, POPPY, DANDELION, CORNFLOWER, RED_MUSHROOM,
  BROWN_MUSHROOM, DEAD_BUSH, HAY_BALE, CAKE,
} from './blocks';
import {
  WHEAT_SEEDS, BEETROOT_SEEDS, PUMPKIN_SEEDS, MELON_SEEDS, MELON_SLICE, APPLE, BEETROOT, CARROT, POTATO, WHEAT,
  BAKED_POTATO, BREAD, PUMPKIN_PIE,
} from './items';

/** Nivel con el compostador lleno (espera un segundo) y nivel listo para dar polvo de hueso. */
export const COMPOSTER_FULL = 7;
export const COMPOSTER_READY = 8;

const chances: Record<number, number> = {};
const set = (p: number, ids: number[]) => {
  for (const id of ids) chances[id] = p;
};
set(0.3, [WHEAT_SEEDS, BEETROOT_SEEDS, PUMPKIN_SEEDS, MELON_SEEDS, SHORT_GRASS, OAK_LEAVES, BIRCH_LEAVES, SPRUCE_LEAVES,
  OAK_SAPLING, BIRCH_SAPLING, SPRUCE_SAPLING]);
set(0.5, [CACTUS, SUGAR_CANE, MELON_SLICE, DEAD_BUSH]);
set(0.65, [APPLE, BEETROOT, CARROT, POTATO, WHEAT, MELON, PUMPKIN, CARVED_PUMPKIN, POPPY, DANDELION, CORNFLOWER,
  RED_MUSHROOM, BROWN_MUSHROOM, FERN]);
set(0.85, [BAKED_POTATO, BREAD, HAY_BALE]);
set(1, [CAKE, PUMPKIN_PIE]);
/** Probabilidad de que un objeto suba el nivel del compostador (0 = no se composta). */
export const COMPOST_CHANCE: Readonly<Record<number, number>> = chances;

/** Nivel de un compostador (0..8) o -1 si no lo es. */
export function composterLevel(id: number): number {
  return familyBase(id) === COMPOSTER ? id - COMPOSTER : -1;
}

/** ¿Acepta el compostador este objeto? (no si está lleno o esperando). */
export function canCompost(level: number, item: number): boolean {
  return level >= 0 && level < COMPOSTER_FULL && (COMPOST_CHANCE[item] ?? 0) > 0;
}

/** ¿Sube de nivel? Vacío siempre sube; si no, según la probabilidad del objeto. */
export function compostRises(level: number, item: number, r: number): boolean {
  return level === 0 || r < (COMPOST_CHANCE[item] ?? 0);
}
