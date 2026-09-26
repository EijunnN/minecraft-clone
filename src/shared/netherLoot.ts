// Fase 8.4 (estructuras del Nether): botín de las estructuras del Nether, portado de las tablas de la 26.3.
// Lo que aún no existe en el juego queda fuera hasta su fase (y se anota): en la fortaleza, la armadura de cobre
// para caballo (fase 9) y la plantilla de adorno «costilla» (fase 9).
import type { LootTable } from './loot';
import { DIAMOND, IRON_INGOT, GOLD_INGOT, TOOLS, ARMOR, FLINT_AND_STEEL, NETHER_WART, SADDLE, HORSE_ARMOR } from './items';
import { OBSIDIAN } from './blocks';

type Entry = LootTable['entries'][number];
const T = (min: number, max: number, entries: Entry[]): LootTable => ({ rolls: [min, max], entries });

export const NETHER_LOOT: Readonly<Record<string, LootTable>> = {
  // Fortaleza del Nether (chests/nether_bridge).
  nether_bridge: T(2, 4, [
    [DIAMOND, 5, 1, 3], [IRON_INGOT, 5, 1, 5], [GOLD_INGOT, 15, 1, 3], [TOOLS.golden.sword, 5, 1, 1],
    [ARMOR.golden.chestplate, 5, 1, 1], [FLINT_AND_STEEL, 5, 1, 1], [NETHER_WART, 5, 3, 7], [SADDLE, 10, 1, 1],
    [HORSE_ARMOR.golden, 8, 1, 1], [HORSE_ARMOR.iron, 5, 1, 1], [HORSE_ARMOR.diamond, 3, 1, 1], [OBSIDIAN, 2, 2, 4],
  ]),
};
