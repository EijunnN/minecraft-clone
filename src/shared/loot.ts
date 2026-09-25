// Tablas de botín de los cofres de las estructuras (fase 5), inspiradas en las de Minecraft con lo
// que ya existe en el juego. Cada tabla hace unas tiradas y en cada una elige una entrada por peso.
import { TORCH, OBSIDIAN, GOLD_BLOCK, SNOW_BLOCK, CRYING_OBSIDIAN, PUMPKIN } from './blocks';
import {
  COAL, IRON_INGOT, GOLD_INGOT, DIAMOND, EMERALD, LAPIS, REDSTONE, BREAD, WHEAT, BONE, ROTTEN_FLESH, STRING, GUNPOWDER,
  GOLDEN_APPLE, BUCKET, WHEAT_SEEDS, MELON_SEEDS, PUMPKIN_SEEDS, BEETROOT_SEEDS, APPLE, PAPER, CARROT, POTATO,
  FLINT, SPIDER_EYE, LEATHER, COD, SALMON, COPPER_INGOT, BOOK, ARMOR, TOOLS, type ItemStack,
  SADDLE, // Fase 6 (monturas)
  ARROW, // Fase 6 (asaltos)
} from './items';
import { DARK_OAK_LOG, BIRCH_LOG } from './blocks'; // Fase 6 (asaltos)

/** Entrada: [objeto, peso, mínimo, máximo]. */
type Entry = [number, number, number, number];

export interface LootTable {
  rolls: [number, number];
  entries: Entry[];
}

const T = (min: number, max: number, entries: Entry[]): LootTable => ({ rolls: [min, max], entries });

export const LOOT_TABLES: Readonly<Record<string, LootTable>> = {
  // Mazmorra: comida, huesos, cuerda, pólvora, algo de metal y, con suerte, una manzana dorada.
  dungeon: T(4, 8, [
    [BREAD, 20, 1, 3], [WHEAT, 20, 1, 4], [BONE, 20, 1, 8], [ROTTEN_FLESH, 20, 1, 8], [STRING, 20, 1, 8],
    [GUNPOWDER, 20, 1, 8], [IRON_INGOT, 10, 1, 4], [GOLD_INGOT, 5, 1, 4], [BUCKET, 10, 1, 1], [REDSTONE, 15, 1, 4],
    [COAL, 15, 1, 4], [BEETROOT_SEEDS, 10, 2, 4], [MELON_SEEDS, 10, 2, 4], [PUMPKIN_SEEDS, 10, 2, 4], [GOLDEN_APPLE, 3, 1, 1],
    [ARMOR.iron.helmet, 2, 1, 1],
    [SADDLE, 12, 1, 1], // Fase 6 (monturas)
  ]),
  // Mina abandonada: carbón, raíles no (aún), antorchas, pan y metales.
  mineshaft: T(3, 6, [
    [IRON_INGOT, 10, 1, 5], [GOLD_INGOT, 5, 1, 3], [REDSTONE, 5, 4, 9], [LAPIS, 5, 4, 9], [DIAMOND, 3, 1, 2],
    [COAL, 10, 3, 8], [BREAD, 15, 1, 3], [TORCH, 15, 1, 16], [MELON_SEEDS, 10, 2, 4], [PUMPKIN_SEEDS, 10, 2, 4],
    [BEETROOT_SEEDS, 10, 2, 4], [TOOLS.iron.pickaxe, 1, 1, 1], [GOLDEN_APPLE, 2, 1, 1], [COPPER_INGOT, 8, 2, 6],
  ]),
  // Templo del desierto: huesos, carne podrida, pólvora, arena… y oro, esmeraldas y diamantes.
  desert_pyramid: T(2, 5, [
    [BONE, 25, 4, 6], [ROTTEN_FLESH, 16, 3, 7], [SPIDER_EYE, 16, 1, 3], [GUNPOWDER, 10, 1, 8], [STRING, 10, 1, 8],
    [GOLD_INGOT, 15, 2, 7], [IRON_INGOT, 15, 1, 5], [EMERALD, 15, 1, 3], [DIAMOND, 5, 1, 3], [GOLDEN_APPLE, 20, 1, 1],
    [BOOK, 20, 1, 1],
    [SADDLE, 15, 1, 1], // Fase 6 (monturas)
  ]),
  // Templo de la jungla: huesos, carne podrida y metales preciosos.
  jungle_temple: T(2, 6, [
    [DIAMOND, 3, 1, 3], [IRON_INGOT, 10, 1, 5], [GOLD_INGOT, 15, 2, 7], [EMERALD, 2, 1, 3], [BONE, 20, 4, 6],
    [ROTTEN_FLESH, 16, 3, 7], [BOOK, 1, 1, 1],
  ]),
  // Naufragio: provisiones (comida, papel, carbón) y tesoro (hierro, oro, esmeraldas, diamantes).
  shipwreck_supply: T(3, 10, [
    [PAPER, 8, 1, 12], [POTATO, 7, 2, 6], [CARROT, 7, 4, 8], [WHEAT, 7, 8, 21], [COAL, 6, 2, 8], [ROTTEN_FLESH, 5, 5, 24],
    [PUMPKIN, 2, 1, 3], [GUNPOWDER, 3, 1, 5], [LEATHER, 3, 1, 3], [BOOK, 1, 1, 1], [COD, 6, 2, 6], [SALMON, 6, 2, 6],
    [ARMOR.leather.helmet, 3, 1, 1], [ARMOR.leather.boots, 3, 1, 1],
  ]),
  shipwreck_treasure: T(3, 6, [
    [IRON_INGOT, 90, 1, 5], [GOLD_INGOT, 10, 1, 5], [EMERALD, 40, 1, 5], [DIAMOND, 5, 1, 1], [LAPIS, 20, 1, 10],
    [COPPER_INGOT, 30, 2, 8],
  ]),
  // Portal en ruinas: obsidiana, pedernal, oro (mucho oro) y algo de comida.
  ruined_portal: T(4, 8, [
    [OBSIDIAN, 40, 1, 2], [FLINT, 40, 1, 4], [IRON_INGOT, 40, 9, 18], [GOLD_INGOT, 15, 4, 24], [GOLDEN_APPLE, 15, 1, 1],
    [ARMOR.golden.helmet, 15, 1, 1], [ARMOR.golden.boots, 15, 1, 1], [TOOLS.golden.sword, 15, 1, 1],
    [TOOLS.golden.pickaxe, 15, 1, 1], [GOLD_BLOCK, 1, 1, 2], [CRYING_OBSIDIAN, 15, 1, 3],
  ]),
  // Iglú: provisiones de invierno.
  igloo: T(2, 8, [
    [APPLE, 15, 1, 3], [COAL, 15, 1, 4], [GOLD_INGOT, 10, 1, 3], [STRING, 10, 1, 1], [WHEAT, 10, 2, 3],
    [ROTTEN_FLESH, 10, 1, 1], [GOLDEN_APPLE, 1, 1, 1], [SNOW_BLOCK, 5, 1, 4],
  ]),
  // Aldea: la despensa de una casa (pan, manzanas, cosecha, semillas, antorchas y algo de hierro).
  village: T(3, 7, [
    [BREAD, 20, 1, 4], [APPLE, 15, 1, 5], [WHEAT, 15, 2, 7], [WHEAT_SEEDS, 12, 2, 6], [CARROT, 10, 1, 4],
    [POTATO, 10, 1, 4], [TORCH, 10, 2, 8], [IRON_INGOT, 6, 1, 3], [COAL, 8, 1, 4], [EMERALD, 2, 1, 2],
    [BEETROOT_SEEDS, 5, 1, 4], [BOOK, 2, 1, 1],
  ]),
  // Fase 6 (asaltos): el mirador del puesto de saqueadores (como en Minecraft: flechas, trigo,
  // patatas, zanahorias, troncos, hierro y, rara vez, un libro).
  pillager_outpost: T(3, 6, [
    [ARROW, 16, 2, 7], [WHEAT, 14, 3, 5], [POTATO, 10, 2, 5], [CARROT, 10, 3, 5], [DARK_OAK_LOG, 10, 2, 3],
    [BIRCH_LOG, 8, 2, 3], [STRING, 8, 1, 6], [IRON_INGOT, 6, 1, 3], [EMERALD, 2, 1, 1], [BOOK, 1, 1, 1],
  ]),
};

/** Tira una tabla de botín: lista de montones (sin juntar). */
export function rollLoot(table: LootTable, rand: () => number): ItemStack[] {
  const total = table.entries.reduce((a, e) => a + e[1], 0);
  const rolls = table.rolls[0] + Math.floor(rand() * (table.rolls[1] - table.rolls[0] + 1));
  const out: ItemStack[] = [];
  for (let r = 0; r < rolls; r++) {
    let pick = rand() * total;
    for (const [id, w, min, max] of table.entries) {
      pick -= w;
      if (pick > 0) continue;
      out.push({ id, count: min + Math.floor(rand() * (max - min + 1)) });
      break;
    }
  }
  return out;
}

/** Reparte el botín en huecos al azar de un cofre de `slots` casillas. */
export function scatterLoot(stacks: ItemStack[], slots: number, rand: () => number): (ItemStack | null)[] {
  const out: (ItemStack | null)[] = new Array(slots).fill(null);
  const free = Array.from({ length: slots }, (_, i) => i);
  for (const s of stacks) {
    if (free.length === 0) break;
    const k = Math.floor(rand() * free.length);
    out[free[k]] = s;
    free.splice(k, 1);
  }
  return out;
}

// ------------------------------------------------------------------ Fase 6.5 (equipo)
// Manzana de oro encantada (sólo en estructuras), armaduras para caballo, cota de malla, mechero,
// corazón del mar (naufragios y portales en ruinas) y ballestas en los puestos de saqueadores.
import { ENCHANTED_GOLDEN_APPLE, HORSE_ARMOR, HEART_OF_THE_SEA, FLINT_AND_STEEL, CROSSBOW } from './items';
{
  const add = (table: string, ...entries: Entry[]) => LOOT_TABLES[table].entries.push(...entries);
  const chain = ARMOR.chainmail;
  add('dungeon', [ENCHANTED_GOLDEN_APPLE, 2, 1, 1], [HORSE_ARMOR.iron, 8, 1, 1], [HORSE_ARMOR.golden, 5, 1, 1],
    [HORSE_ARMOR.diamond, 3, 1, 1], [chain.helmet, 3, 1, 1], [chain.chestplate, 3, 1, 1]);
  add('mineshaft', [ENCHANTED_GOLDEN_APPLE, 1, 1, 1], [chain.leggings, 2, 1, 1], [chain.boots, 2, 1, 1]);
  add('desert_pyramid', [ENCHANTED_GOLDEN_APPLE, 2, 1, 1], [HORSE_ARMOR.iron, 15, 1, 1], [HORSE_ARMOR.golden, 10, 1, 1],
    [HORSE_ARMOR.diamond, 5, 1, 1]);
  add('jungle_temple', [HORSE_ARMOR.iron, 1, 1, 1], [HORSE_ARMOR.golden, 1, 1, 1], [HORSE_ARMOR.diamond, 1, 1, 1], [chain.helmet, 2, 1, 1]);
  add('ruined_portal', [ENCHANTED_GOLDEN_APPLE, 1, 1, 1], [FLINT_AND_STEEL, 40, 1, 1], [HEART_OF_THE_SEA, 2, 1, 1]);
  add('shipwreck_treasure', [HEART_OF_THE_SEA, 20, 1, 1]);
  add('shipwreck_supply', [chain.boots, 1, 1, 1]);
  add('pillager_outpost', [CROSSBOW, 4, 1, 1]);
}
