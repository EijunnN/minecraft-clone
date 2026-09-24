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

export * from './registry';
export * from './classic';
export * from './building';
export * from './farm';
export * from './queries';

{
  const kindOf = new Map<number, number>();
  for (const v of Object.values(DOORS)) kindOf.set(v, KINDS.door);
  for (const v of Object.values(TRAPDOORS)) kindOf.set(v, KINDS.trapdoor);
  for (const v of Object.values(FENCE_GATES)) kindOf.set(v, KINDS.gate);
  for (const v of Object.values(FENCES)) kindOf.set(v, KINDS.fence);
  for (const v of Object.values(SLABS)) kindOf.set(v, KINDS.slab);
  for (const v of Object.values(STAIRS)) kindOf.set(v, KINDS.stairs);
  kindOf.set(RED_BED, KINDS.bed);
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
];

export const DEFAULT_HOTBAR: readonly number[] = [
  GRASS, STONE, OAK_PLANKS, OAK_LOG, GLASS, TORCH, BRICKS, WATER, GLOWSTONE,
];
