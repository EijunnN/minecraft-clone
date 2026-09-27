// Fase 8.6 (el End): botín de las estructuras del End, portado de las tablas de la 26.3.
// Lo que aún no existe en el juego queda fuera hasta su fase: en las fortalezas, la armadura de cobre para caballo,
// el disco «otherside» y la plantilla de adorno «ojo» (fase 9).
import type { LootTable, LootFn } from './loot';
import {
  ENDER_PEARL, DIAMOND, IRON_INGOT, GOLD_INGOT, REDSTONE, BREAD, APPLE, TOOLS, ARMOR, GOLDEN_APPLE, LEATHER, HORSE_ARMOR, BOOK,
  COAL, PAPER, EMPTY_MAP, COMPASS,
} from './items';
import { enchantWithLevels, rndFrom } from './enchanting';

type Entry = LootTable['entries'][number];
const T = (min: number, max: number, entries: Entry[], extra?: LootTable[]): LootTable => ({ rolls: [min, max], entries, ...(extra ? { extra } : {}) });

/** enchant_with_levels 30. */
const levels30: LootFn = (s, rand) => enchantWithLevels(s, 30, rndFrom(rand));
const I = TOOLS.iron, IA = ARMOR.iron;

export const END_LOOT: Readonly<Record<string, LootTable>> = {
  // Pasillos con cofre (chests/stronghold_corridor).
  stronghold_corridor: T(2, 3, [
    [ENDER_PEARL, 10, 1, 1], [DIAMOND, 3, 1, 3], [IRON_INGOT, 10, 1, 5], [GOLD_INGOT, 5, 1, 3], [REDSTONE, 5, 4, 9], [BREAD, 15, 1, 3],
    [APPLE, 15, 1, 3], [I.pickaxe, 5, 1, 1], [I.sword, 5, 1, 1], [IA.chestplate, 5, 1, 1], [IA.helmet, 5, 1, 1], [IA.leggings, 5, 1, 1],
    [IA.boots, 5, 1, 1], [GOLDEN_APPLE, 1, 1, 1], [LEATHER, 1, 1, 5], [HORSE_ARMOR.iron, 1, 1, 1], [HORSE_ARMOR.golden, 1, 1, 1],
    [HORSE_ARMOR.diamond, 1, 1, 1], [BOOK, 1, 1, 1, levels30],
  ]),
  // El almacén de las salas de cruce (chests/stronghold_crossing).
  stronghold_crossing: T(1, 4, [
    [IRON_INGOT, 10, 1, 5], [GOLD_INGOT, 5, 1, 3], [REDSTONE, 5, 4, 9], [COAL, 10, 3, 8], [BREAD, 15, 1, 3], [APPLE, 15, 1, 3],
    [I.pickaxe, 1, 1, 1], [BOOK, 1, 1, 1, levels30],
  ]),
  // Las bibliotecas (chests/stronghold_library).
  stronghold_library: T(2, 10, [[BOOK, 20, 1, 3], [PAPER, 20, 2, 7], [EMPTY_MAP, 1, 1, 1], [COMPASS, 1, 1, 1], [BOOK, 10, 1, 1, levels30]]),
};
