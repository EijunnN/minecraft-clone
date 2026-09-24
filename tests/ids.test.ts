// Los ids de bloque y de objeto se guardan en los mundos (ediciones de chunks, cofres, inventarios):
// no pueden cambiar entre versiones. Las familias y los objetos nuevos se añaden siempre al final.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SLABS, STAIRS, FENCES, FENCE_GATES, DOORS, TRAPDOORS, LADDER, GLASS_PANE, WALL_TORCH, RED_BED, FARMLAND, WHEAT_CROP,
  CARROTS, POTATOES, BEETROOTS, CAKE, CHEST, FURNACE, OAK_SAPLING, SPRUCE_SAPLING, MELON, PUMPKIN_STEM, MELON_STEM,
  ATTACHED_PUMPKIN_STEM, ATTACHED_MELON_STEM, CARVED_PUMPKIN, JACK_O_LANTERN, COMPOSTER, WALLS, BEDS, SIGNS, WALL_SIGNS,
  CHEST_DOUBLE, SMOKER, BLAST_FURNACE, CAMPFIRE, STONECUTTER,
} from '../src/shared/blocks';
import {
  STICK, BREAD, BUCKET, SHEARS, TOOLS, WHEAT_SEEDS, SUGAR, ARMOR, GOLDEN_APPLE, SPIDER_EYE, SHIELD, PUMPKIN_SEEDS, FISHING_ROD,
  PUFFERFISH,
} from '../src/shared/items';

test('los ids de bloques guardados no cambian', () => {
  // Bloques clásicos (0..255).
  assert.deepEqual([CHEST, FURNACE, OAK_SAPLING, SPRUCE_SAPLING], [89, 81, 93, 95]);
  // Familias con estados (fase 3), en el orden en que se registraron.
  assert.deepEqual(SLABS, { oak: 1024, birch: 1035, spruce: 1046, cobblestone: 1057, stone: 1068, stone_brick: 1079, brick: 1090, sandstone: 1101 });
  assert.deepEqual(STAIRS, { oak: 1027, birch: 1038, spruce: 1049, cobblestone: 1060, stone: 1071, stone_brick: 1082, brick: 1093, sandstone: 1104 });
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
});
