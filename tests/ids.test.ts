// Los ids de bloque y de objeto se guardan en los mundos (ediciones de chunks, cofres, inventarios):
// no pueden cambiar entre versiones. Las familias y los objetos nuevos se añaden siempre al final.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SLABS, STAIRS, FENCES, FENCE_GATES, DOORS, TRAPDOORS, LADDER, GLASS_PANE, WALL_TORCH, RED_BED, FARMLAND, WHEAT_CROP,
  CARROTS, POTATOES, BEETROOTS, CAKE, CHEST, FURNACE, OAK_SAPLING, SPRUCE_SAPLING, MELON, PUMPKIN_STEM, MELON_STEM,
  ATTACHED_PUMPKIN_STEM, ATTACHED_MELON_STEM, CARVED_PUMPKIN, JACK_O_LANTERN, COMPOSTER, WALLS, BEDS, SIGNS, WALL_SIGNS,
  CHEST_DOUBLE, SMOKER, BLAST_FURNACE, CAMPFIRE, STONECUTTER, JUNGLE_LOG, ACACIA_LOG, DARK_OAK_LOG, CHERRY_LOG, CHERRY_SAPLING,
  VINE, LILY_PAD, MYCELIUM, RED_SAND, COLORED_TERRACOTTA, PACKED_ICE, FLOWERS, PINK_PETALS, DEEPSLATE, COPPER_ORE, DEEPSLATE_ORE,
  COAL_ORE, EMERALD_BLOCK, MOSS_BLOCK, CAVE_VINES, POINTED_DRIPSTONE, AMETHYST_BUD, TINTED_GLASS, MOB_SPAWNER, COBWEB,
  NETHERRACK, CRYING_OBSIDIAN, SNOW_LAYER,
  TURTLE_EGG, LECTERN, CAULDRON, INFESTED_STONE, INFESTED_STONE_BRICKS, BEE_NEST, BEEHIVE, HONEY_BLOCK, HONEYCOMB_BLOCK,
} from '../src/shared/blocks';
import {
  STICK, BREAD, BUCKET, SHEARS, TOOLS, WHEAT_SEEDS, SUGAR, ARMOR, GOLDEN_APPLE, SPIDER_EYE, SHIELD, PUMPKIN_SEEDS, FISHING_ROD,
  PUFFERFISH, COPPER_INGOT, EMERALD, AMETHYST_SHARD, GLOW_BERRIES, COMPASS, EMPTY_MAP, FILLED_MAP, SNOWBALL,
  SADDLE, SLIME_BALL, SPLASH_POISON, COD_BUCKET, TADPOLE_BUCKET, GLASS_BOTTLE, HONEY_BOTTLE, RAW_RABBIT, RABBIT_HIDE, BRUSH,
  OMINOUS_BOTTLE, TOTEM_OF_UNDYING,
} from '../src/shared/items';
import {
  MOB_FOX, MOB_WOLF, MOB_VILLAGER, MOB_WANDERING_TRADER, MOB_IRON_GOLEM, MOB_SNOW_GOLEM, MOB_CAT, MOB_HORSE, MOB_CAMEL,
  MOB_COD, MOB_GLOW_SQUID, MOB_DROWNED, MOB_SLIME, MOB_ZOMBIE_VILLAGER, MOB_SLIME_MEDIUM, MOB_SLIME_SMALL,
  MOB_BEE, MOB_PANDA, MOB_PARROT, MOB_ARMADILLO, MOB_PILLAGER, MOB_EVOKER_FANGS,
} from '../src/shared/mobs';

const NEW_WOODS = ['jungle', 'acacia', 'dark_oak', 'cherry', 'cobbled_deepslate'];
NEW_WOODS.push('mangrove', 'pale_oak', 'bamboo', 'bamboo_mosaic'); // Fase 6.5 (maderas): ids nuevos, sin fijar
// Fase 6.5 (piedras): las losas y escaleras de las piedras nuevas tampoco son de la fase 3.
import { SMOOTH_STONE } from '../src/shared/blocks';
NEW_WOODS.push(...Object.keys(SLABS).filter((k) => SLABS[k] > SMOOTH_STONE));
NEW_WOODS.push('prismarine', 'prismarine_brick', 'dark_prismarine'); // Fase 6.5 (océano y plantas): formas nuevas, sin fijar

test('los ids de bloques guardados no cambian', () => {
  // Bloques clásicos (0..255).
  assert.deepEqual([CHEST, FURNACE, OAK_SAPLING, SPRUCE_SAPLING], [89, 81, 93, 95]);
  // Familias con estados (fase 3), en el orden en que se registraron.
  const old = (m: Record<string, number>) => Object.fromEntries(Object.entries(m).filter(([k]) => !NEW_WOODS.includes(k)));
  assert.deepEqual(old(SLABS), { oak: 1024, birch: 1035, spruce: 1046, cobblestone: 1057, stone: 1068, stone_brick: 1079, brick: 1090, sandstone: 1101 });
  assert.deepEqual(old(STAIRS), { oak: 1027, birch: 1038, spruce: 1049, cobblestone: 1060, stone: 1071, stone_brick: 1082, brick: 1093, sandstone: 1104 });
  assert.deepEqual([FENCES.oak, FENCE_GATES.oak, DOORS.oak, TRAPDOORS.oak], [1112, 1113, 1121, 1153]);
  assert.deepEqual([FENCES.spruce, FENCE_GATES.spruce, DOORS.spruce, TRAPDOORS.spruce], [1226, 1227, 1235, 1267]);
  assert.deepEqual([LADDER, GLASS_PANE, WALL_TORCH, RED_BED], [1283, 1287, 1288, 1292]);
  // Granja (fase 4).
  assert.deepEqual([FARMLAND, WHEAT_CROP, CARROTS, POTATOES, BEETROOTS, CAKE], [1300, 1302, 1310, 1318, 1326, 1330]);
  // Calabazas, sandías y compostador (fase 4).
  assert.deepEqual(
    [MELON, PUMPKIN_STEM, MELON_STEM, ATTACHED_PUMPKIN_STEM, ATTACHED_MELON_STEM, CARVED_PUMPKIN, JACK_O_LANTERN, COMPOSTER],
    [1337, 1338, 1346, 1354, 1358, 1362, 1366, 1370],
  );
  // Muros, camas de colores, carteles y bloques de trabajo (fase 4).
  assert.deepEqual([WALLS.cobblestone, WALLS.andesite, BEDS.white, BEDS.purple, SIGNS.oak, WALL_SIGNS.oak, WALL_SIGNS.spruce], [1379, 1386, 1387, 1435, 1443, 1447, 1463]);
  assert.deepEqual([CHEST_DOUBLE, SMOKER, BLAST_FURNACE, CAMPFIRE, STONECUTTER], [1467, 1475, 1483, 1491, 1493]);
  // Maderas y biomas (fase 5).
  assert.deepEqual([JUNGLE_LOG, SLABS.jungle, DOORS.jungle, SIGNS.jungle, ACACIA_LOG, DARK_OAK_LOG, CHERRY_LOG, CHERRY_SAPLING], [1497, 1501, 1521, 1569, 1577, 1657, 1737, 1740]);
  assert.deepEqual([VINE, LILY_PAD, MYCELIUM, RED_SAND, COLORED_TERRACOTTA.white, PACKED_ICE, FLOWERS.blue_orchid, PINK_PETALS], [1817, 1821, 1822, 1826, 1828, 1834, 1835, 1844]);
  // Subsuelo (fase 5).
  assert.deepEqual([DEEPSLATE, SLABS.cobbled_deepslate, COPPER_ORE, DEEPSLATE_ORE[COAL_ORE], EMERALD_BLOCK, MOSS_BLOCK, CAVE_VINES, POINTED_DRIPSTONE, AMETHYST_BUD, TINTED_GLASS], [1845, 1851, 1862, 1864, 1872, 1873, 1877, 1879, 1887, 1891]);
  // Estructuras (fase 5).
  assert.deepEqual([MOB_SPAWNER, COBWEB, NETHERRACK, CRYING_OBSIDIAN], [1892, 1893, 1898, 1899]);
  // Clima (fase 5).
  assert.equal(SNOW_LAYER, 1900);
  // Fase 6: huevo de tortuga, bloques de trabajo, bloques infestados y colmenas.
  assert.deepEqual([TURTLE_EGG, LECTERN, CAULDRON, INFESTED_STONE, INFESTED_STONE_BRICKS], [1908, 1920, 1927, 1928, 1930]);
  assert.deepEqual([BEE_NEST, BEEHIVE, HONEY_BLOCK, HONEYCOMB_BLOCK], [1931, 1955, 1979, 1980]);
});

test('los ids de objetos guardados no cambian', () => {
  // Hasta la fase 3 (desplegados).
  assert.deepEqual([STICK, BREAD, BUCKET, SHEARS], [256, 285, 286, 291]);
  assert.deepEqual([TOOLS.wooden.pickaxe, TOOLS.diamond.sword], [292, 311]);
  // Granja (fase 4): añadidos al final.
  assert.deepEqual([WHEAT_SEEDS, SUGAR, TOOLS.wooden.hoe, TOOLS.diamond.hoe], [312, 322, 323, 327]);
  // Armaduras (fase 4).
  assert.deepEqual([ARMOR.leather.helmet, ARMOR.iron.helmet, ARMOR.golden.helmet, ARMOR.diamond.boots], [328, 332, 336, 343]);
  // Efectos y escudo (fase 4).
  assert.deepEqual([GOLDEN_APPLE, SPIDER_EYE, SHIELD], [344, 345, 346]);
  // Calabazas, sandías y pesca (fase 4).
  assert.deepEqual([PUMPKIN_SEEDS, FISHING_ROD, PUFFERFISH], [347, 351, 357]);
  // Subsuelo (fase 5).
  assert.deepEqual([COPPER_INGOT, EMERALD, AMETHYST_SHARD, GLOW_BERRIES], [358, 359, 360, 361]);
  // Mapas, brújula y nieve (fase 5).
  assert.deepEqual([COMPASS, EMPTY_MAP, FILLED_MAP, SNOWBALL], [362, 363, 364, 365]);
  // Fase 6: silla, botín de monstruos, cubos con criatura y fauna.
  assert.deepEqual([SADDLE, SLIME_BALL, SPLASH_POISON, COD_BUCKET, TADPOLE_BUCKET], [366, 367, 371, 372, 377]);
  assert.deepEqual([GLASS_BOTTLE, HONEY_BOTTLE, RAW_RABBIT, RABBIT_HIDE, BRUSH], [378, 379, 381, 383, 385]);
  // Asaltos (fase 6).
  assert.deepEqual([OMINOUS_BOTTLE, TOTEM_OF_UNDYING], [386, 387]);
});

test('los ids de criatura guardados no cambian', () => {
  assert.deepEqual([MOB_FOX, MOB_WOLF, MOB_VILLAGER, MOB_WANDERING_TRADER], [13, 17, 18, 19]);
  assert.deepEqual([MOB_IRON_GOLEM, MOB_SNOW_GOLEM, MOB_CAT, MOB_HORSE, MOB_CAMEL], [20, 21, 22, 25, 29]);
  assert.deepEqual([MOB_COD, MOB_GLOW_SQUID], [30, 39]);
  assert.deepEqual([MOB_DROWNED, MOB_SLIME, MOB_ZOMBIE_VILLAGER, MOB_SLIME_MEDIUM, MOB_SLIME_SMALL], [40, 42, 46, 47, 48]);
  assert.deepEqual([MOB_BEE, MOB_PANDA, MOB_PARROT, MOB_ARMADILLO], [50, 51, 52, 53]);
  assert.deepEqual([MOB_PILLAGER, MOB_EVOKER_FANGS], [60, 65]);
});
