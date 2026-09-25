// Registro de bloques compartido por el cliente, los workers de generación/mallado y el servidor.
// El orden de los export * es el orden de registro: fija los ids que se guardan en los mundos
// (ver tests/ids.test.ts). Las familias nuevas se añaden SIEMPRE al final.
import { defs, finalizeBlocks, KINDS, type BlockDef } from './registry';
import {
  GRASS, DIRT, STONE, COBBLESTONE, MOSSY_COBBLESTONE, STONE_BRICKS, BRICKS, GRANITE, DIORITE, ANDESITE, SAND, SANDSTONE,
  GRAVEL, CLAY, TERRACOTTA, SNOW_BLOCK, SNOWY_GRASS, ICE, OBSIDIAN, QUARTZ_BLOCK, OAK_LOG, OAK_PLANKS, BIRCH_LOG,
  BIRCH_PLANKS, SPRUCE_LOG, SPRUCE_PLANKS, OAK_LEAVES, BIRCH_LEAVES, SPRUCE_LEAVES, GLASS, BOOKSHELF, CRAFTING_TABLE,
  FURNACE, CHEST, PUMPKIN, HAY_BALE, TORCH, GLOWSTONE, SEA_LANTERN, CACTUS, SUGAR_CANE, OAK_SAPLING, BIRCH_SAPLING,
  SPRUCE_SAPLING, SHORT_GRASS, FERN, POPPY, DANDELION, CORNFLOWER, DEAD_BUSH, RED_MUSHROOM, BROWN_MUSHROOM, WATER, LAVA,
  COAL_ORE, IRON_ORE, GOLD_ORE, DIAMOND_ORE, LAPIS_ORE, REDSTONE_ORE, IRON_BLOCK, GOLD_BLOCK, DIAMOND_BLOCK, COPPER_BLOCK,
  WHITE_WOOL, BLACK_WOOL, RED_WOOL, ORANGE_WOOL, YELLOW_WOOL, LIME_WOOL, BLUE_WOOL, PURPLE_WOOL,
} from './classic';
import {
  MATERIALS, WOODS, SLABS, STAIRS, FENCES, FENCE_GATES, DOORS, TRAPDOORS, LADDER, GLASS_PANE, RED_BED,
} from './building';
import {
  FARMLAND, WHEAT_CROP, CARROTS, POTATOES, BEETROOTS, CAKE, PUMPKIN_STEM, MELON_STEM, ATTACHED_PUMPKIN_STEM,
  ATTACHED_MELON_STEM, MELON, CARVED_PUMPKIN, JACK_O_LANTERN, COMPOSTER,
} from './farm';
import { WALLS, BEDS, SIGNS } from './decoration';
import { SMOKER, BLAST_FURNACE, CAMPFIRE, STONECUTTER } from './workstations';
import {
  WOOD_TYPES, VINE, LILY_PAD, MYCELIUM, RED_MUSHROOM_BLOCK, BROWN_MUSHROOM_BLOCK, MUSHROOM_STEM, RED_SAND, RED_SANDSTONE,
  COLORED_TERRACOTTA, PACKED_ICE, FLOWERS, PINK_PETALS,
} from './biomes';
import {
  DEEPSLATE, COBBLED_DEEPSLATE, TUFF, CALCITE, SMOOTH_BASALT, DRIPSTONE_BLOCK, POINTED_DRIPSTONE, COPPER_ORE, EMERALD_ORE,
  DEEPSLATE_ORE, EMERALD_BLOCK, MOSS_BLOCK, MOSS_CARPET, AZALEA, FLOWERING_AZALEA, AMETHYST_BLOCK, BUDDING_AMETHYST,
  AMETHYST_BUD, TINTED_GLASS,
} from './underground';
import {
  MOB_SPAWNER, COBWEB, CHISELED_SANDSTONE, CUT_SANDSTONE, MOSSY_STONE_BRICKS, CRACKED_STONE_BRICKS, NETHERRACK,
  CRYING_OBSIDIAN,
} from './structures';
import { SNOW_LAYER } from './weather';
import { TURTLE_EGG } from './aquaticBlocks';

export * from './registry';
export * from './classic';
export * from './building';
export * from './farm';
export * from './decoration';
export * from './workstations';
export * from './biomes';
export * from './underground';
export * from './structures';
export * from './weather';
export * from './queries';
// Fase 6 (acuáticos): huevos de tortuga.
export * from './aquaticBlocks';

{
  const kindOf = new Map<number, number>();
  for (const v of Object.values(DOORS)) kindOf.set(v, KINDS.door);
  for (const v of Object.values(TRAPDOORS)) kindOf.set(v, KINDS.trapdoor);
  for (const v of Object.values(FENCE_GATES)) kindOf.set(v, KINDS.gate);
  for (const v of Object.values(FENCES)) kindOf.set(v, KINDS.fence);
  for (const v of Object.values(SLABS)) kindOf.set(v, KINDS.slab);
  for (const v of Object.values(STAIRS)) kindOf.set(v, KINDS.stairs);
  kindOf.set(RED_BED, KINDS.bed);
  for (const v of Object.values(BEDS)) kindOf.set(v, KINDS.bed);
  // Los muros son tan altos como las vallas (no se pueden saltar).
  for (const v of Object.values(WALLS)) kindOf.set(v, KINDS.fence);
  for (const v of [WHEAT_CROP, CARROTS, POTATOES, BEETROOTS, PUMPKIN_STEM, MELON_STEM, ATTACHED_PUMPKIN_STEM, ATTACHED_MELON_STEM]) {
    kindOf.set(v, KINDS.crop);
  }
  kindOf.set(CAKE, KINDS.cake);
  kindOf.set(FARMLAND, KINDS.farmland);
  finalizeBlocks(kindOf);
}

export const BLOCKS: readonly BlockDef[] = defs;
/** Uno más que el mayor id registrado (el registro es disperso: hay huecos entre 96 y 1024). */
export const BLOCK_COUNT = defs.length;

/** Orden de los bloques en el inventario creativo. */
export const INVENTORY_ORDER: readonly number[] = [
  GRASS, DIRT, STONE, COBBLESTONE, MOSSY_COBBLESTONE, STONE_BRICKS, BRICKS, GRANITE, DIORITE, ANDESITE,
  SAND, SANDSTONE, GRAVEL, CLAY, TERRACOTTA, SNOW_BLOCK, SNOWY_GRASS, ICE, OBSIDIAN, QUARTZ_BLOCK,
  OAK_LOG, OAK_PLANKS, BIRCH_LOG, BIRCH_PLANKS, SPRUCE_LOG, SPRUCE_PLANKS, OAK_LEAVES, BIRCH_LEAVES, SPRUCE_LEAVES, GLASS,
  BOOKSHELF, CRAFTING_TABLE, FURNACE, CHEST, PUMPKIN, HAY_BALE, TORCH, GLOWSTONE, SEA_LANTERN, CACTUS, SUGAR_CANE,
  OAK_SAPLING, BIRCH_SAPLING, SPRUCE_SAPLING, SHORT_GRASS,
  FERN, POPPY, DANDELION, CORNFLOWER, DEAD_BUSH, RED_MUSHROOM, BROWN_MUSHROOM, WATER, LAVA,
  COAL_ORE, IRON_ORE, GOLD_ORE, DIAMOND_ORE, LAPIS_ORE, REDSTONE_ORE, IRON_BLOCK, GOLD_BLOCK, DIAMOND_BLOCK, COPPER_BLOCK,
  WHITE_WOOL, BLACK_WOOL, RED_WOOL, ORANGE_WOOL, YELLOW_WOOL, LIME_WOOL, BLUE_WOOL, PURPLE_WOOL,
  ...MATERIALS.flatMap((m) => [SLABS[m.key], STAIRS[m.key]]),
  ...WOODS.flatMap((w) => [FENCES[w.key], FENCE_GATES[w.key], DOORS[w.key], TRAPDOORS[w.key]]),
  LADDER, GLASS_PANE, RED_BED, MELON, CARVED_PUMPKIN, JACK_O_LANTERN, COMPOSTER,
  ...Object.values(WALLS), ...Object.values(BEDS).filter((b) => b !== RED_BED), ...Object.values(SIGNS),
  SMOKER, BLAST_FURNACE, CAMPFIRE, STONECUTTER,
  // Fase 5: maderas y biomas nuevos.
  ...WOOD_TYPES.slice(3).flatMap((w) => [w.log, w.planks, w.leaves, w.sapling]),
  MYCELIUM, RED_MUSHROOM_BLOCK, BROWN_MUSHROOM_BLOCK, MUSHROOM_STEM, RED_SAND, RED_SANDSTONE, PACKED_ICE,
  ...Object.values(COLORED_TERRACOTTA), VINE, LILY_PAD, ...Object.values(FLOWERS), PINK_PETALS,
  // Fase 5: subsuelo.
  DEEPSLATE, COBBLED_DEEPSLATE, TUFF, CALCITE, SMOOTH_BASALT, DRIPSTONE_BLOCK, POINTED_DRIPSTONE, COPPER_ORE, EMERALD_ORE,
  ...Object.values(DEEPSLATE_ORE), EMERALD_BLOCK, MOSS_BLOCK, MOSS_CARPET, AZALEA, FLOWERING_AZALEA, AMETHYST_BLOCK,
  BUDDING_AMETHYST, AMETHYST_BUD + 3, TINTED_GLASS,
  // Fase 5: estructuras.
  MOB_SPAWNER, COBWEB, CHISELED_SANDSTONE, CUT_SANDSTONE, MOSSY_STONE_BRICKS, CRACKED_STONE_BRICKS, NETHERRACK, CRYING_OBSIDIAN,
  SNOW_LAYER,
  // Fase 6 (aldeanos): bloques de trabajo.
  ...VILLAGER_BLOCKS,
  // Fase 6 (acuáticos).
  TURTLE_EGG,
];

export const DEFAULT_HOTBAR: readonly number[] = [
  GRASS, STONE, OAK_PLANKS, OAK_LOG, GLASS, TORCH, BRICKS, WATER, GLOWSTONE,
];

// Fase 6 (aldeanos): bloques de trabajo de los aldeanos (se registran los últimos).
import { VILLAGER_BLOCKS } from './villagerBlocks';
export * from './villagerBlocks';
// Fase 6 (monstruos): bloques infestados (se registran los últimos: ids guardados).
export * from './monsterBlocks';
// Fase 6 (fauna): nido de abejas, colmena, bloque de miel y bloque de panal (registrados los últimos
// para no mover ids) y su sitio en el inventario creativo.
import { BEE_INVENTORY } from './beeBlocks';
export * from './beeBlocks';
(INVENTORY_ORDER as number[]).push(...BEE_INVENTORY);
// Troncos tumbados (se registran los últimos: ids guardados).
export * from './logAxis';
