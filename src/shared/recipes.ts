// Recetas de fabricación (cuadrícula 2x2 del inventario y 3x3 de la mesa de trabajo).
import {
  CRAFTING_TABLE, TORCH, CHEST, FURNACE, WOOD_TYPES, COBBLED_DEEPSLATE, COPPER_BLOCK, EMERALD_BLOCK, AMETHYST_BLOCK,
  TINTED_GLASS, MOSS_BLOCK, MOSS_CARPET, SNOW_BLOCK, SNOW_LAYER, ALL_LOGS, ALL_PLANKS, MATERIALS, WOODS, RED_SAND, RED_SANDSTONE,
  COBBLESTONE, STONE, STONE_BRICKS, SAND, SANDSTONE, BRICKS, CLAY, BOOKSHELF, IRON_BLOCK, GOLD_BLOCK, DIAMOND_BLOCK,
  WHITE_WOOL, RED_WOOL, YELLOW_WOOL, BLUE_WOOL, POPPY, DANDELION, CORNFLOWER, SUGAR_CANE, GLASS, SLABS, STAIRS,
  FENCES, FENCE_GATES, DOORS, TRAPDOORS, LADDER, GLASS_PANE, RED_BED, HAY_BALE, CAKE, PUMPKIN, MELON, CARVED_PUMPKIN,
  JACK_O_LANTERN, COMPOSTER, WALLS, WALL_SOURCE, BEDS, SIGNS, SMOKER, BLAST_FURNACE, CAMPFIRE, STONECUTTER,
  ORANGE_WOOL, BLACK_WOOL, LIME_WOOL, PURPLE_WOOL,
  LECTERN, CARTOGRAPHY_TABLE, FLETCHING_TABLE, BARREL, LOOM, GRINDSTONE, SMITHING_TABLE, CAULDRON, // Fase 6 (aldeanos)
} from './blocks';
import {
  STICK, COAL, CHARCOAL, IRON_INGOT, GOLD_INGOT, DIAMOND, FLINT, FEATHER, STRING, PAPER, BOOK, LEATHER, BRICK,
  CLAY_BALL, BUCKET, BOW, ARROW, SHEARS, LAPIS, TOOLS, BONE, BREAD, WHEAT, SUGAR, EGG, MILK_BUCKET, BONE_MEAL,
  APPLE, GOLDEN_APPLE, SHIELD, COPPER_INGOT, EMERALD, AMETHYST_SHARD, COMPASS, EMPTY_MAP, SNOWBALL, REDSTONE, PUMPKIN_SEEDS, MELON_SEEDS, MELON_SLICE, PUMPKIN_PIE, FISHING_ROD,
  ARMOR, type ItemStack,
  SADDLE, // Fase 6 (monturas)
} from './items';
// Fase 6 (fauna).
import { BEEHIVE, HONEY_BLOCK, HONEYCOMB_BLOCK } from './blocks';
import { GLASS_BOTTLE, HONEY_BOTTLE, HONEYCOMB, BRUSH, RABBIT_HIDE } from './items';
// Fase 6.5 (colores).
import {
  DYE_COLORS, WOOL, CARPETS, CONCRETE_POWDER, STAINED_GLASS, STAINED_GLASS_PANES, COLORED_TERRACOTTA, TERRACOTTA, CANDLE,
  CANDLES, BANNERS, FLOWERS, PINK_PETALS, GRAVEL, type DyeColor,
} from './blocks';
import { DYES, BEETROOT } from './items';
// Fase 6.5 (piedras).
import {
  VINE, MOSSY_COBBLESTONE, MOSSY_STONE_BRICKS, GRANITE, DIORITE, ANDESITE, TUFF, CUT_SANDSTONE, CHISELED_SANDSTONE,
  SMOOTH_STONE, CHISELED_STONE_BRICKS, POLISHED_GRANITE, POLISHED_DIORITE, POLISHED_ANDESITE, POLISHED_DEEPSLATE,
  DEEPSLATE_BRICKS, DEEPSLATE_TILES, CHISELED_DEEPSLATE, POLISHED_TUFF, TUFF_BRICKS, CHISELED_TUFF, CHISELED_TUFF_BRICKS,
  CUT_RED_SANDSTONE, CHISELED_RED_SANDSTONE, MUD, PACKED_MUD, MUD_BRICKS, CINNABAR, POLISHED_CINNABAR, CINNABAR_BRICKS,
  CHISELED_CINNABAR, SULFUR, POLISHED_SULFUR, SULFUR_BRICKS, CHISELED_SULFUR,
} from './blocks';
// Fase 6.5 (cobre).
import { COPPER, OXIDATION_STAGES, RAW_COPPER_BLOCK, COPPER_TORCH, type CopperKind } from './blocks';
import { RAW_COPPER, COPPER_NUGGET } from './items';
// Fase 6.5 (decoración).
import { FLOWER_POT, LANTERN, IRON_CHAIN, IRON_BARS, SCAFFOLDING, DECORATED_POT, RED_MUSHROOM, BROWN_MUSHROOM } from './blocks';
import {
  BOWL, INK_SAC, IRON_NUGGET, GOLD_NUGGET, COCOA_BEANS, COOKIE, MUSHROOM_STEW, RABBIT_STEW, BEETROOT_SOUP, SUSPICIOUS_STEW,
  GOLDEN_CARROT, GLISTERING_MELON_SLICE, SPYGLASS, CLOCK, PAINTING, ITEM_FRAME, COOKED_RABBIT, CARROT, BAKED_POTATO,
} from './items';
import { SUSPICIOUS_FLOWERS } from './decorFood';
// Fase 6.5 (océano y plantas).
import {
  DRIED_KELP_BLOCK, PRISMARINE, PRISMARINE_BRICKS, DARK_PRISMARINE, SEA_LANTERN, SUNFLOWER, LILAC, ROSE_BUSH, PEONY, TORCHFLOWER,
  PITCHER_PLANT,
} from './blocks';
import { ITEMS, DRIED_KELP, PRISMARINE_SHARD, PRISMARINE_CRYSTALS } from './items';

type Cell = readonly number[] | null;

interface Shaped {
  w: number;
  h: number;
  cells: Cell[];
  out: ItemStack;
}

interface Shapeless {
  items: (readonly number[])[];
  out: ItemStack;
}

/** Cualquier tablón (palos, mesa, cofre, herramientas de madera…). */
const PLANKS = ALL_PLANKS;
const FUEL_COAL = [COAL, CHARCOAL] as const;

const shaped: Shaped[] = [];
const shapeless: Shapeless[] = [];

/** Receta con forma: filas de caracteres y leyenda (espacio = vacío). */
function shape(rows: string[], key: Record<string, number | readonly number[]>, id: number, count = 1): void {
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const cells: Cell[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = rows[y][x] ?? ' ';
      if (ch === ' ') cells.push(null);
      else {
        const k = key[ch];
        if (k === undefined) throw new Error('Clave de receta desconocida: ' + ch);
        cells.push(typeof k === 'number' ? [k] : k);
      }
    }
  }
  shaped.push({ w, h, cells, out: { id, count } });
}

function mix(items: (number | readonly number[])[], id: number, count = 1): void {
  shapeless.push({ items: items.map((i) => (typeof i === 'number' ? [i] : i)), out: { id, count } });
}

// --- Madera ---
for (const w of WOOD_TYPES) mix([w.log], w.planks, 4);
shape(['P', 'P'], { P: PLANKS }, STICK, 4);
shape(['PP', 'PP'], { P: PLANKS }, CRAFTING_TABLE);
shape(['C', 'S'], { C: FUEL_COAL, S: STICK }, TORCH, 4);
shape(['PPP', 'P P', 'PPP'], { P: PLANKS }, CHEST);
shape(['PPP', 'BBB', 'PPP'], { P: PLANKS, B: BOOK }, BOOKSHELF);

// --- Piedra y construcción ---
/** Roca para herramientas de piedra y hornos (también la de pizarra profunda). */
const ROCKS = [COBBLESTONE, COBBLED_DEEPSLATE] as const;
shape(['CCC', 'C C', 'CCC'], { C: ROCKS }, FURNACE);
shape(['SS', 'SS'], { S: STONE }, STONE_BRICKS, 4);
shape(['SS', 'SS'], { S: SAND }, SANDSTONE);
shape(['SS', 'SS'], { S: RED_SAND }, RED_SANDSTONE);
shape(['BB', 'BB'], { B: BRICK }, BRICKS);
shape(['CC', 'CC'], { C: CLAY_BALL }, CLAY);

// --- Losas, escaleras, vallas, puertas... (como en Minecraft) ---
for (const { key, block } of MATERIALS) {
  shape(['MMM'], { M: block }, SLABS[key], 6);
  shape(['M  ', 'MM ', 'MMM'], { M: block }, STAIRS[key], 4);
}
for (const { key, block: planks } of WOODS) {
  shape(['PSP', 'PSP'], { P: planks, S: STICK }, FENCES[key], 3);
  shape(['SPS', 'SPS'], { P: planks, S: STICK }, FENCE_GATES[key]);
  shape(['PP', 'PP', 'PP'], { P: planks }, DOORS[key], 3);
  shape(['PPP', 'PPP'], { P: planks }, TRAPDOORS[key], 2);
}
shape(['S S', 'SSS', 'S S'], { S: STICK }, LADDER, 3);
shape(['GGG', 'GGG'], { G: GLASS }, GLASS_PANE, 16);
shape(['WWW', 'PPP'], { W: RED_WOOL, P: PLANKS }, RED_BED);

// --- Herramientas ---
const MATS: [string, number | readonly number[]][] = [
  ['wooden', PLANKS], ['stone', ROCKS], ['iron', IRON_INGOT], ['golden', GOLD_INGOT], ['diamond', DIAMOND],
];
for (const [mat, m] of MATS) {
  shape(['MMM', ' S ', ' S '], { M: m, S: STICK }, TOOLS[mat].pickaxe);
  shape(['MM', 'MS', ' S'], { M: m, S: STICK }, TOOLS[mat].axe);
  shape(['M', 'S', 'S'], { M: m, S: STICK }, TOOLS[mat].shovel);
  shape(['M', 'M', 'S'], { M: m, S: STICK }, TOOLS[mat].sword);
  shape(['MM', ' S', ' S'], { M: m, S: STICK }, TOOLS[mat].hoe);
}
shape(['I I', ' I '], { I: IRON_INGOT }, BUCKET);
shape([' I', 'I '], { I: IRON_INGOT }, SHEARS);
shape([' SW', 'S W', ' SW'], { S: STICK, W: STRING }, BOW);
shape(['F', 'S', 'E'], { F: FLINT, S: STICK, E: FEATHER }, ARROW, 4);

// --- Armaduras ---
const ARMOR_MATS: [string, number][] = [['leather', LEATHER], ['iron', IRON_INGOT], ['golden', GOLD_INGOT], ['diamond', DIAMOND]];
for (const [mat, m] of ARMOR_MATS) {
  shape(['MMM', 'M M'], { M: m }, ARMOR[mat].helmet);
  shape(['M M', 'MMM', 'MMM'], { M: m }, ARMOR[mat].chestplate);
  shape(['MMM', 'M M', 'M M'], { M: m }, ARMOR[mat].leggings);
  shape(['M M', 'M M'], { M: m }, ARMOR[mat].boots);
}

// --- Granja ---
shape(['WWW'], { W: WHEAT }, BREAD);
shape(['WWW', 'WWW', 'WWW'], { W: WHEAT }, HAY_BALE);
mix([HAY_BALE], WHEAT, 9);
mix([BONE], BONE_MEAL, 3);
mix([SUGAR_CANE], SUGAR);
shape(['MMM', 'SES', 'WWW'], { M: MILK_BUCKET, S: SUGAR, E: EGG, W: WHEAT }, CAKE);

/** Lo que queda en la cuadrícula al fabricar (los cubos de leche de la tarta vuelven vacíos). */
export const CRAFT_REMAINDER: Readonly<Record<number, number>> = { [MILK_BUCKET]: BUCKET, [HONEY_BOTTLE]: GLASS_BOTTLE };

// --- Calabazas, sandías, compostador y pesca ---
mix([PUMPKIN], PUMPKIN_SEEDS, 4);
mix([MELON_SLICE], MELON_SEEDS);
shape(['MMM', 'MMM', 'MMM'], { M: MELON_SLICE }, MELON);
mix([PUMPKIN, SUGAR, EGG], PUMPKIN_PIE);
shape(['C', 'T'], { C: CARVED_PUMPKIN, T: TORCH }, JACK_O_LANTERN);
shape(['S S', 'S S', 'SSS'], { S: WOODS.map((w) => SLABS[w.key]) }, COMPOSTER);
shape(['  S', ' SW', 'S W'], { S: STICK, W: STRING }, FISHING_ROD);

// --- Muros, camas de colores, carteles y bloques de trabajo ---
for (const wall of Object.values(WALLS)) shape(['MMM', 'MMM'], { M: WALL_SOURCE[wall] }, wall, 6);
const WOOL_OF: Record<string, number> = {
  white: WHITE_WOOL, black: BLACK_WOOL, orange: ORANGE_WOOL, yellow: YELLOW_WOOL, lime: LIME_WOOL, blue: BLUE_WOOL,
  purple: PURPLE_WOOL,
};
for (const [color, bed] of Object.entries(BEDS)) if (WOOL_OF[color]) shape(['WWW', 'PPP'], { W: WOOL_OF[color], P: PLANKS }, bed);
for (const w of WOOD_TYPES) shape(['PPP', 'PPP', ' S '], { P: w.planks, S: STICK }, SIGNS[w.key], 3);
const LOGS = ALL_LOGS;
shape([' L ', 'LFL', ' L '], { L: LOGS, F: FURNACE }, SMOKER);
shape(['III', 'IFI', 'SSS'], { I: IRON_INGOT, F: FURNACE, S: STONE }, BLAST_FURNACE);
shape([' S ', 'SCS', 'LLL'], { S: STICK, C: FUEL_COAL, L: LOGS }, CAMPFIRE);
shape([' I ', 'SSS'], { I: IRON_INGOT, S: STONE }, STONECUTTER);

// --- Subsuelo (fase 5) ---
shape(['III', 'III', 'III'], { I: COPPER_INGOT }, COPPER_BLOCK);
mix([COPPER_BLOCK], COPPER_INGOT, 9);
shape(['EEE', 'EEE', 'EEE'], { E: EMERALD }, EMERALD_BLOCK);
mix([EMERALD_BLOCK], EMERALD, 9);
shape(['AA', 'AA'], { A: AMETHYST_SHARD }, AMETHYST_BLOCK);
shape([' A ', 'AGA', ' A '], { A: AMETHYST_SHARD, G: GLASS }, TINTED_GLASS, 2);
shape(['MM'], { M: MOSS_BLOCK }, MOSS_CARPET, 3);

// --- Mapas, brújula y nieve (fase 5) ---
shape([' I ', 'IRI', ' I '], { I: IRON_INGOT, R: REDSTONE }, COMPASS);
shape(['PPP', 'PCP', 'PPP'], { P: PAPER, C: COMPASS }, EMPTY_MAP);
shape(['SS', 'SS'], { S: SNOWBALL }, SNOW_BLOCK);
shape(['BBB'], { B: SNOW_BLOCK }, SNOW_LAYER, 6);

// --- Combate y estado ---
shape(['GGG', 'GAG', 'GGG'], { G: GOLD_INGOT, A: APPLE }, GOLDEN_APPLE);
shape(['PIP', 'PPP', ' P '], { P: PLANKS, I: IRON_INGOT }, SHIELD);

// --- Papel y libros ---
shape(['CCC'], { C: SUGAR_CANE }, PAPER, 3);
mix([PAPER, PAPER, PAPER, LEATHER], BOOK);

// --- Bloques de mineral ---
shape(['III', 'III', 'III'], { I: IRON_INGOT }, IRON_BLOCK);
shape(['III', 'III', 'III'], { I: GOLD_INGOT }, GOLD_BLOCK);
shape(['III', 'III', 'III'], { I: DIAMOND }, DIAMOND_BLOCK);
mix([IRON_BLOCK], IRON_INGOT, 9);
mix([GOLD_BLOCK], GOLD_INGOT, 9);
mix([DIAMOND_BLOCK], DIAMOND, 9);

// --- Lana y tintes naturales ---
shape(['SS', 'SS'], { S: STRING }, WHITE_WOOL);
mix([POPPY, WHITE_WOOL], RED_WOOL);
mix([DANDELION, WHITE_WOOL], YELLOW_WOOL);
mix([CORNFLOWER, WHITE_WOOL], BLUE_WOOL);
mix([LAPIS, WHITE_WOOL], BLUE_WOOL);

// --- Fase 6 (monturas): silla de montar (cuero y un lingote de hierro, como en Minecraft 1.21.6) ---
shape(['LLL', ' I '], { L: LEATHER, I: IRON_INGOT }, SADDLE);
// --- Fase 6 (aldeanos): bloques de trabajo ---
{
  const WOOD_SLABS = WOODS.map((w) => SLABS[w.key]);
  shape(['SSS', ' B ', ' S '], { S: WOOD_SLABS, B: BOOKSHELF }, LECTERN);
  shape(['PP', 'WW', 'WW'], { P: PAPER, W: PLANKS }, CARTOGRAPHY_TABLE);
  shape(['FF', 'WW', 'WW'], { F: FLINT, W: PLANKS }, FLETCHING_TABLE);
  shape(['WSW', 'W W', 'WSW'], { W: PLANKS, S: WOOD_SLABS }, BARREL);
  shape(['SS', 'WW'], { S: STRING, W: PLANKS }, LOOM);
  shape(['TST', 'W W'], { T: STICK, S: SLABS.stone, W: PLANKS }, GRINDSTONE);
  shape(['II', 'WW', 'WW'], { I: IRON_INGOT, W: PLANKS }, SMITHING_TABLE);
  shape(['I I', 'I I', 'III'], { I: IRON_INGOT }, CAULDRON);
}
// --- Fauna (fase 6): colmena, frascos, miel, panal, cepillo y piel de conejo ---
shape(['PPP', 'HHH', 'PPP'], { P: PLANKS, H: HONEYCOMB }, BEEHIVE);
shape(['G G', ' G '], { G: GLASS }, GLASS_BOTTLE, 3);
shape(['HH', 'HH'], { H: HONEY_BOTTLE }, HONEY_BLOCK);
mix([HONEY_BLOCK, GLASS_BOTTLE, GLASS_BOTTLE, GLASS_BOTTLE, GLASS_BOTTLE], HONEY_BOTTLE, 4);
mix([HONEY_BOTTLE], SUGAR, 3);
shape(['CC', 'CC'], { C: HONEYCOMB }, HONEYCOMB_BLOCK);
shape(['F', 'C', 'S'], { F: FEATHER, C: COPPER_INGOT, S: STICK }, BRUSH);
shape(['HH', 'HH'], { H: RABBIT_HIDE }, LEATHER);
// --- Fase 6.5 (cobre) ---
{
  shape(['NNN', 'NNN', 'NNN'], { N: COPPER_NUGGET }, COPPER_INGOT);
  mix([COPPER_INGOT], COPPER_NUGGET, 9);
  shape(['RRR', 'RRR', 'RRR'], { R: RAW_COPPER }, RAW_COPPER_BLOCK);
  mix([RAW_COPPER_BLOCK], RAW_COPPER, 9);
  mix([COPPER.block[1][0]], COPPER_INGOT, 9); // el bloque encerado también se deshace en lingotes
  for (let s = 0; s < OXIDATION_STAGES; s++) {
    for (const w of [0, 1]) {
      const [block, cut, slab] = [COPPER.block[w][s], COPPER.cut[w][s], COPPER.cut_slab[w][s]];
      shape(['BB', 'BB'], { B: block }, cut, 4);
      shape(['CCC'], { C: cut }, slab, 6);
      shape(['C  ', 'CC ', 'CCC'], { C: cut }, COPPER.cut_stairs[w][s], 4);
      shape(['S', 'S'], { S: slab }, COPPER.chiseled[w][s]);
      shape([' B ', 'B B', ' B '], { B: block }, COPPER.grate[w][s], 4);
    }
    // Encerar con panal (sin mesa de trabajo): cualquier bloque de cobre sin cera y un panal.
    for (const kind of Object.keys(COPPER) as CopperKind[]) mix([COPPER[kind][0][s], HONEYCOMB], COPPER[kind][1][s]);
  }
  const I = COPPER_INGOT;
  shape(['II', 'II', 'II'], { I }, COPPER.door[0][0], 3);
  shape(['II', 'II'], { I }, COPPER.trapdoor[0][0]);
  shape(['III', 'III'], { I }, COPPER.bars[0][0], 16);
  shape(['N', 'I', 'N'], { N: COPPER_NUGGET, I }, COPPER.chain[0][0]);
  shape(['N', 'C', 'S'], { N: COPPER_NUGGET, C: FUEL_COAL, S: STICK }, COPPER_TORCH, 4);
  shape(['NNN', 'NTN', 'NNN'], { N: COPPER_NUGGET, T: COPPER_TORCH }, COPPER.lantern[0][0]);
  shape(['MMM', ' S ', ' S '], { M: I, S: STICK }, TOOLS.copper.pickaxe);
  shape(['MM', 'MS', ' S'], { M: I, S: STICK }, TOOLS.copper.axe);
  shape(['M', 'S', 'S'], { M: I, S: STICK }, TOOLS.copper.shovel);
  shape(['M', 'M', 'S'], { M: I, S: STICK }, TOOLS.copper.sword);
  shape(['MM', ' S', ' S'], { M: I, S: STICK }, TOOLS.copper.hoe);
  shape(['MMM', 'M M'], { M: I }, ARMOR.copper.helmet);
  shape(['M M', 'MMM', 'MMM'], { M: I }, ARMOR.copper.chestplate);
  shape(['MMM', 'M M', 'M M'], { M: I }, ARMOR.copper.leggings);
  shape(['M M', 'M M'], { M: I }, ARMOR.copper.boots);
}

// --- Fase 6.5 (maderas): sin corteza, leños y bambú ---
import { WOOD_EXTRAS, BAMBOO, BAMBOO_BLOCK, STRIPPED_BAMBOO_BLOCK, BAMBOO_PLANKS, BAMBOO_MOSAIC } from './blocks';
for (const { wood, strippedLog, woodBlock, strippedWood } of WOOD_EXTRAS) {
  for (const id of [strippedLog, woodBlock, strippedWood]) mix([id], wood.planks, 4);
  shape(['LL', 'LL'], { L: wood.log }, woodBlock, 3);
  shape(['LL', 'LL'], { L: strippedLog }, strippedWood, 3);
}
shape(['BBB', 'BBB', 'BBB'], { B: BAMBOO }, BAMBOO_BLOCK);
mix([BAMBOO_BLOCK], BAMBOO_PLANKS, 2);
mix([STRIPPED_BAMBOO_BLOCK], BAMBOO_PLANKS, 2);
shape(['B', 'B'], { B: BAMBOO }, STICK);
shape(['S', 'S'], { S: SLABS.bamboo }, BAMBOO_MOSAIC);
shape(['PPP', 'PPP', ' S '], { P: BAMBOO_PLANKS, S: STICK }, SIGNS.bamboo, 3);
// --- Fase 6.5 (colores): tintes y todo lo que se tiñe ---
{
  const D = DYES;
  // Tintes de flores y plantas (las flores nuevas traen sus recetas con ellas).
  const fromPlant: [number, DyeColor, number][] = [
    [BONE_MEAL, 'white', 1], [FLOWERS.lily_of_the_valley, 'white', 1], [FLOWERS.orange_tulip, 'orange', 1],
    [FLOWERS.allium, 'magenta', 1], [FLOWERS.blue_orchid, 'light_blue', 1], [DANDELION, 'yellow', 1],
    [FLOWERS.pink_tulip, 'pink', 1], [PINK_PETALS, 'pink', 1], [FLOWERS.azure_bluet, 'light_gray', 1],
    [FLOWERS.oxeye_daisy, 'light_gray', 1], [FLOWERS.white_tulip, 'light_gray', 1], [LAPIS, 'blue', 1],
    [CORNFLOWER, 'blue', 1], [POPPY, 'red', 1], [FLOWERS.red_tulip, 'red', 1], [BEETROOT, 'red', 1],
  ];
  for (const [plant, c, n] of fromPlant) mix([plant], D[c], n);
  // Mezclas de tintes (como en Minecraft).
  mix([D.red, D.yellow], D.orange, 2);
  mix([D.purple, D.pink], D.magenta, 2);
  mix([D.blue, D.red, D.pink], D.magenta, 3);
  mix([D.blue, D.red, D.red, D.white], D.magenta, 4);
  mix([D.blue, D.white], D.light_blue, 2);
  mix([D.green, D.white], D.lime, 2);
  mix([D.red, D.white], D.pink, 2);
  mix([D.black, D.white], D.gray, 2);
  mix([D.gray, D.white], D.light_gray, 2);
  mix([D.black, D.white, D.white], D.light_gray, 3);
  mix([D.blue, D.green], D.cyan, 2);
  mix([D.blue, D.red], D.purple, 2);

  const ANY_WOOL = DYE_COLORS.map((c) => WOOL[c]);
  const ANY_CARPET = DYE_COLORS.map((c) => CARPETS[c]);
  const ANY_BED = DYE_COLORS.map((c) => BEDS[c]);
  const ANY_CANDLE = [CANDLE, ...DYE_COLORS.map((c) => CANDLES[c])];
  shape(['S', 'H'], { S: STRING, H: HONEYCOMB }, CANDLE);
  for (const c of DYE_COLORS) {
    const dye = D[c];
    // Teñir: lana, cama y vela de uno en uno; alfombras, cristal, paneles y terracota de ocho en ocho.
    mix([dye, ANY_WOOL], WOOL[c]);
    mix([dye, ANY_BED], BEDS[c]);
    mix([dye, ANY_CANDLE], CANDLES[c]);
    shape(['CCC', 'CDC', 'CCC'], { C: ANY_CARPET, D: dye }, CARPETS[c], 8);
    shape(['GGG', 'GDG', 'GGG'], { G: GLASS, D: dye }, STAINED_GLASS[c], 8);
    shape(['GGG', 'GDG', 'GGG'], { G: GLASS_PANE, D: dye }, STAINED_GLASS_PANES[c], 8);
    shape(['TTT', 'TDT', 'TTT'], { T: TERRACOTTA, D: dye }, COLORED_TERRACOTTA[c], 8);
    mix([dye, SAND, SAND, SAND, SAND, GRAVEL, GRAVEL, GRAVEL, GRAVEL], CONCRETE_POWDER[c], 8);
    // Con la lana o el cristal de su color.
    shape(['WW'], { W: WOOL[c] }, CARPETS[c], 3);
    shape(['GGG', 'GGG'], { G: STAINED_GLASS[c] }, STAINED_GLASS_PANES[c], 16);
    shape(['WWW', 'WWW', ' S '], { W: WOOL[c], S: STICK }, BANNERS[c]);
    if (!WOOL_OF[c] && c !== 'red') shape(['WWW', 'PPP'], { W: WOOL[c], P: PLANKS }, BEDS[c]);
  }
}

// --- Fase 6.5 (piedras): piedras pulidas, ladrillos, azulejos, cinceladas, losas sueltas y barro ---
// (las losas, escaleras y muros de MATERIALS y WALLS ya salen de los bucles de arriba)
{
  const four = (from: number, to: number) => shape(['SS', 'SS'], { S: from }, to, 4);
  four(GRANITE, POLISHED_GRANITE);
  four(DIORITE, POLISHED_DIORITE);
  four(ANDESITE, POLISHED_ANDESITE);
  four(COBBLED_DEEPSLATE, POLISHED_DEEPSLATE);
  four(POLISHED_DEEPSLATE, DEEPSLATE_BRICKS);
  four(DEEPSLATE_BRICKS, DEEPSLATE_TILES);
  four(TUFF, POLISHED_TUFF);
  four(POLISHED_TUFF, TUFF_BRICKS);
  four(SANDSTONE, CUT_SANDSTONE);
  four(RED_SANDSTONE, CUT_RED_SANDSTONE);
  four(PACKED_MUD, MUD_BRICKS);
  four(CINNABAR, POLISHED_CINNABAR);
  four(POLISHED_CINNABAR, CINNABAR_BRICKS);
  four(SULFUR, POLISHED_SULFUR);
  four(POLISHED_SULFUR, SULFUR_BRICKS);
  // Cinceladas: dos losas una encima de otra.
  const chisel = (slab: number, to: number) => shape(['S', 'S'], { S: slab }, to);
  chisel(SLABS.stone_brick, CHISELED_STONE_BRICKS);
  chisel(SLABS.cobbled_deepslate, CHISELED_DEEPSLATE);
  chisel(SLABS.tuff, CHISELED_TUFF);
  chisel(SLABS.tuff_brick, CHISELED_TUFF_BRICKS);
  chisel(SLABS.sandstone, CHISELED_SANDSTONE);
  chisel(SLABS.red_sandstone, CHISELED_RED_SANDSTONE);
  chisel(SLABS.cinnabar, CHISELED_CINNABAR);
  chisel(SLABS.sulfur, CHISELED_SULFUR);
  // Losas sueltas (sin escaleras).
  shape(['MMM'], { M: SMOOTH_STONE }, SLABS.smooth_stone, 6);
  shape(['MMM'], { M: CUT_SANDSTONE }, SLABS.cut_sandstone, 6);
  shape(['MMM'], { M: CUT_RED_SANDSTONE }, SLABS.cut_red_sandstone, 6);
  // Musgo, andesita y barro compacto.
  mix([COBBLESTONE, [MOSS_BLOCK, VINE]], MOSSY_COBBLESTONE);
  mix([STONE_BRICKS, [MOSS_BLOCK, VINE]], MOSSY_STONE_BRICKS);
  mix([DIORITE, COBBLESTONE], ANDESITE, 2);
  mix([MUD, WHEAT], PACKED_MUD);
}

// --- Fase 6.5 (decoración): comida, pepitas, macetas, faroles, cadenas, barrotes, andamios, vasijas,
// cuadros, marcos, catalejo y reloj (como en Minecraft; el andamio lleva palos porque no hay bambú) ---
{
  shape(['P P', ' P '], { P: PLANKS }, BOWL, 4);
  mix([IRON_INGOT], IRON_NUGGET, 9);
  shape(['NNN', 'NNN', 'NNN'], { N: IRON_NUGGET }, IRON_INGOT);
  mix([GOLD_INGOT], GOLD_NUGGET, 9);
  shape(['NNN', 'NNN', 'NNN'], { N: GOLD_NUGGET }, GOLD_INGOT);
  shape(['WCW'], { W: WHEAT, C: COCOA_BEANS }, COOKIE, 8);
  mix([COCOA_BEANS], DYES.brown); // tinte marrón (los granos de cacao llegan con la decoración)
  mix([INK_SAC], DYES.black); // tinte negro
  mix([RED_MUSHROOM, BROWN_MUSHROOM, BOWL], MUSHROOM_STEW);
  mix([COOKED_RABBIT, CARROT, BAKED_POTATO, [RED_MUSHROOM, BROWN_MUSHROOM], BOWL], RABBIT_STEW);
  mix([BEETROOT, BEETROOT, BEETROOT, BEETROOT, BEETROOT, BEETROOT, BOWL], BEETROOT_SOUP);
  // Estofado sospechoso: la flor queda anotada en el desgaste de la pila (su efecto, en decorFood.ts).
  SUSPICIOUS_FLOWERS.forEach(([flower], i) => {
    shapeless.push({ items: [[RED_MUSHROOM], [BROWN_MUSHROOM], [BOWL], [flower]], out: { id: SUSPICIOUS_STEW, count: 1, dmg: i + 1 } });
  });
  shape(['NNN', 'NCN', 'NNN'], { N: GOLD_NUGGET, C: CARROT }, GOLDEN_CARROT);
  shape(['NNN', 'NMN', 'NNN'], { N: GOLD_NUGGET, M: MELON_SLICE }, GLISTERING_MELON_SLICE);
  shape(['A', 'C', 'C'], { A: AMETHYST_SHARD, C: COPPER_INGOT }, SPYGLASS);
  shape([' G ', 'GRG', ' G '], { G: GOLD_INGOT, R: REDSTONE }, CLOCK);
  const WOOLS = [WHITE_WOOL, BLACK_WOOL, RED_WOOL, ORANGE_WOOL, YELLOW_WOOL, LIME_WOOL, BLUE_WOOL, PURPLE_WOOL];
  shape(['SSS', 'SWS', 'SSS'], { S: STICK, W: WOOLS }, PAINTING);
  shape(['SSS', 'SLS', 'SSS'], { S: STICK, L: LEATHER }, ITEM_FRAME);
  shape(['B B', ' B '], { B: BRICK }, FLOWER_POT);
  shape(['NNN', 'NTN', 'NNN'], { N: IRON_NUGGET, T: TORCH }, LANTERN);
  shape(['N', 'I', 'N'], { N: IRON_NUGGET, I: IRON_INGOT }, IRON_CHAIN);
  shape(['III', 'III'], { I: IRON_INGOT }, IRON_BARS, 16);
  shape(['SWS', 'S S', 'S S'], { S: STICK, W: STRING }, SCAFFOLDING, 6);
  shape([' B ', 'B B', ' B '], { B: BRICK }, DECORATED_POT);
}

// --- Fase 6.5 (océano y plantas): algas secas, prismarina, linterna marina y tintes de las flores nuevas ---
{
  shape(['KKK', 'KKK', 'KKK'], { K: DRIED_KELP }, DRIED_KELP_BLOCK);
  mix([DRIED_KELP_BLOCK], DRIED_KELP, 9);
  shape(['SS', 'SS'], { S: PRISMARINE_SHARD }, PRISMARINE);
  shape(['SSS', 'SSS', 'SSS'], { S: PRISMARINE_SHARD }, PRISMARINE_BRICKS);
  shape(['SCS', 'CCC', 'SCS'], { S: PRISMARINE_SHARD, C: PRISMARINE_CRYSTALS }, SEA_LANTERN);
  // Los tintes los define otro módulo: se buscan por clave y, si aún no existen, se saltan.
  const dye = (color: string): number | undefined => ITEMS.find((i) => i?.key === `${color}_dye`)?.id;
  const black = dye('black');
  if (black !== undefined) shape(['SSS', 'SDS', 'SSS'], { S: PRISMARINE_SHARD, D: black }, DARK_PRISMARINE);
  const FLOWER_DYES: [number, string, number][] = [
    [SUNFLOWER, 'yellow', 2], [LILAC, 'magenta', 2], [ROSE_BUSH, 'red', 2], [PEONY, 'pink', 2], [TORCHFLOWER, 'orange', 1],
    [PITCHER_PLANT, 'cyan', 2],
  ];
  for (const [flower, color, n] of FLOWER_DYES) {
    const id = dye(color);
    if (id !== undefined) mix([flower], id, n);
  }
}

// Fase 6.5 (remate): carteles colgantes (2 cadenas y 6 troncos descortezados → 6).
import { HANGING_SIGNS, HANGING_SIGN_LOG } from './blocks';
for (const [k, id] of Object.entries(HANGING_SIGNS)) shape(['C C', 'LLL', 'LLL'], { C: IRON_CHAIN, L: HANGING_SIGN_LOG[k] }, id, 6);
// Correa (4 cuerdas y una bola de slime → 2) y etiqueta (papel y cuerda).
import { LEAD, NAME_TAG, SLIME_BALL } from './items';
shape(['SS ', 'SB ', '  S'], { S: STRING, B: SLIME_BALL }, LEAD, 2);
mix([PAPER, STRING], NAME_TAG);
// Saco (cuerda sobre cuero) y teñirlo de cualquiera de los 16 colores (se queda con lo que lleva).
import { BUNDLE, DYED_BUNDLES } from './items';
shape(['S', 'L'], { S: STRING, L: LEATHER }, BUNDLE);
{
  const ANY_BUNDLE = [BUNDLE, ...Object.values(DYED_BUNDLES)];
  for (const c of DYE_COLORS) mix([ANY_BUNDLE, DYES[c]], DYED_BUNDLES[c]);
}
// Soporte para armadura: 6 palos y una losa de piedra lisa.
import { ARMOR_STAND } from './items';
shape(['SSS', ' S ', 'SLS'], { S: STICK, L: SLABS.smooth_stone }, ARMOR_STAND);
// Estantería cincelada: 6 tablones y 3 losas de madera (de cualquier madera).
import { CHISELED_BOOKSHELF } from './blocks';
shape(['PPP', 'SSS', 'PPP'], { P: PLANKS, S: WOODS.map((w) => SLABS[w.key]).filter((id) => id !== undefined) }, CHISELED_BOOKSHELF);
// Fase 6.5 (colecciones): tocadiscos (8 tablones y un diamante) y marco brillante (marco y saco de tinta brillante).
import { JUKEBOX } from './blocks';
import { GLOW_INK_SAC, GLOW_ITEM_FRAME } from './items';
shape(['PPP', 'PDP', 'PPP'], { P: PLANKS, D: DIAMOND }, JUKEBOX);
mix([ITEM_FRAME, GLOW_INK_SAC], GLOW_ITEM_FRAME);

// --- Fase 6.5 (materiales): bloques de almacenamiento (9 ↔ 1), hielo compacto y azul, tierra gruesa ---
import {
  RAW_IRON_BLOCK, RAW_GOLD_BLOCK, COAL_BLOCK, LAPIS_BLOCK, BONE_BLOCK, SLIME_BLOCK, ICE, PACKED_ICE, BLUE_ICE, DIRT,
  COARSE_DIRT,
} from './blocks';
import { RAW_IRON, RAW_GOLD } from './items';
{
  const nine = (unit: number, blockId: number) => {
    shape(['UUU', 'UUU', 'UUU'], { U: unit }, blockId);
    mix([blockId], unit, 9);
  };
  nine(RAW_IRON, RAW_IRON_BLOCK);
  nine(RAW_GOLD, RAW_GOLD_BLOCK);
  nine(COAL, COAL_BLOCK);
  nine(LAPIS, LAPIS_BLOCK);
  nine(BONE_MEAL, BONE_BLOCK);
  nine(SLIME_BALL, SLIME_BLOCK);
  shape(['III', 'III', 'III'], { I: ICE }, PACKED_ICE);
  shape(['III', 'III', 'III'], { I: PACKED_ICE }, BLUE_ICE);
  shape(['DG', 'GD'], { D: DIRT, G: GRAVEL }, COARSE_DIRT, 4);
}

export interface RecipeMatch {
  out: ItemStack;
}

/** Busca la receta que coincide con la cuadrícula (size 2 o 3; ids, 0 = vacío). */
export function matchRecipe(grid: readonly number[], size: number): RecipeMatch | null {
  // Caja envolvente de las celdas ocupadas.
  let x0 = size, y0 = size, x1 = -1, y1 = -1, n = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (grid[y * size + x] > 0) {
        n++;
        if (x < x0) x0 = x;
        if (y < y0) y0 = y;
        if (x > x1) x1 = x;
        if (y > y1) y1 = y;
      }
    }
  }
  if (n === 0) return null;
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  for (const r of shaped) {
    if (r.w !== w || r.h !== h) continue;
    for (const mirror of [false, true]) {
      let ok = true;
      for (let y = 0; y < h && ok; y++) {
        for (let x = 0; x < w; x++) {
          const cell = r.cells[y * w + (mirror ? w - 1 - x : x)];
          const id = grid[(y0 + y) * size + x0 + x];
          if (cell === null ? id !== 0 : !cell.includes(id)) {
            ok = false;
            break;
          }
        }
      }
      if (ok) return { out: { ...r.out } };
    }
  }
  const items = grid.filter((id) => id > 0);
  for (const r of shapeless) {
    if (r.items.length !== items.length) continue;
    const used = new Array(items.length).fill(false);
    let ok = true;
    for (const alt of r.items) {
      const k = items.findIndex((id, i) => !used[i] && alt.includes(id));
      if (k < 0) {
        ok = false;
        break;
      }
      used[k] = true;
    }
    if (ok) return { out: { ...r.out } };
  }
  return null;
}

/** Número de recetas (para pruebas). */
export const RECIPE_COUNT = shaped.length + shapeless.length;

// Fase 6.5 (libros y estandartes): libro y pluma (libro, saco de tinta y pluma) y diseños de estandarte
// (papel y un objeto). Los objetos que aquí no existen se cambian por otros del tema: cráneo de wither → hueso, manzana de oro encantada → manzana dorada; el globo, que en
// Minecraft se compra al cartógrafo, sale del mapa vacío. La copia de libros escritos va aparte
// (books.ts: lleva datos y el original se queda).
import { WRITABLE_BOOK, BANNER_PATTERN_ITEMS, ENCHANTED_GOLDEN_APPLE } from './items';
import { SKULLS } from './blocks';
mix([BOOK, INK_SAC, FEATHER], WRITABLE_BOOK);
mix([PAPER, FLOWERS.oxeye_daisy], BANNER_PATTERN_ITEMS.flower);
mix([PAPER, SKULLS.creeper], BANNER_PATTERN_ITEMS.creeper); // Fase 6.5: ya hay cabeza de creeper
mix([PAPER, BONE], BANNER_PATTERN_ITEMS.skull);
mix([PAPER, ENCHANTED_GOLDEN_APPLE], BANNER_PATTERN_ITEMS.thing); // Fase 6.5: ya hay manzana de oro encantada
mix([PAPER, EMPTY_MAP], BANNER_PATTERN_ITEMS.globe);
mix([PAPER, VINE], BANNER_PATTERN_ITEMS.curly_border);
mix([PAPER, BRICKS], BANNER_PATTERN_ITEMS.bricks);
// ------------------------------------------------------------------ Fase 6.5 (equipo)
// Mechero, ballesta (sin gancho de cuerda en el juego: lleva un segundo lingote en su lugar), caparazón
// de tortuga, armadura de cuero para caballo, armadura para lobo, caña con zanahoria y conducto (como
// en Minecraft). Los fuegos artificiales van aparte (fireworkCraft): sus colores viajan en la pila.
import {
  FLINT_AND_STEEL, CROSSBOW, TURTLE_SCUTE, TURTLE_HELMET, HORSE_ARMOR, WOLF_ARMOR, ARMADILLO_SCUTE, CARROT_ON_A_STICK,
  NAUTILUS_SHELL, HEART_OF_THE_SEA, FIREWORK_ROCKET, FIREWORK_STAR, GUNPOWDER as FW_GUNPOWDER, PAPER as FW_PAPER,
} from './items';
import { CONDUIT } from './blocks';
import { fireworkData, fireworkColors } from './equipment';
mix([IRON_INGOT, FLINT], FLINT_AND_STEEL);
shape(['SIS', 'TIT', ' S '], { S: STICK, I: IRON_INGOT, T: STRING }, CROSSBOW);
shape(['SSS', 'S S'], { S: TURTLE_SCUTE }, TURTLE_HELMET);
shape(['L L', 'LLL', 'L L'], { L: LEATHER }, HORSE_ARMOR.leather);
shape(['S  ', 'SSS', 'S S'], { S: ARMADILLO_SCUTE }, WOLF_ARMOR);
shape(['R ', ' C'], { R: FISHING_ROD, C: CARROT }, CARROT_ON_A_STICK);
shape(['NNN', 'NHN', 'NNN'], { N: NAUTILUS_SHELL, H: HEART_OF_THE_SEA }, CONDUIT);

/**
 * Fuegos artificiales (cuadrícula con sus pilas, para ver los colores de las estrellas):
 * - Estrella: pólvora y de 1 a 8 tintes → estrella de esos colores.
 * - Cohete: papel, de 1 a 3 pólvoras (la duración del vuelo) y las estrellas que se quiera → 3 cohetes
 *   que estallan con los colores de todas las estrellas (sin estrellas, sólo suben).
 * null si la cuadrícula no es una de estas recetas.
 */
export function fireworkCraft(grid: readonly (ItemStack | null)[]): ItemStack | null {
  const items = grid.filter((s): s is ItemStack => !!s && s.count > 0);
  if (items.length === 0) return null;
  const count = (id: number) => items.filter((s) => s.id === id).length;
  const dyeIndex = (id: number) => DYE_COLORS.findIndex((c) => DYES[c] === id);
  const gunpowder = count(FW_GUNPOWDER), paper = count(FW_PAPER), stars = items.filter((s) => s.id === FIREWORK_STAR);
  if (paper === 0) {
    // Estrella: una pólvora y tintes.
    const dyes = items.filter((s) => dyeIndex(s.id) >= 0);
    if (gunpowder !== 1 || dyes.length < 1 || dyes.length > 8 || dyes.length + 1 !== items.length) return null;
    let mask = 0;
    for (const d of dyes) mask |= 1 << dyeIndex(d.id);
    return { id: FIREWORK_STAR, count: 1, dmg: mask };
  }
  if (paper !== 1 || gunpowder < 1 || gunpowder > 3 || 1 + gunpowder + stars.length !== items.length) return null;
  let colors = 0;
  for (const s of stars) colors |= s.dmg ?? 0;
  return { id: FIREWORK_ROCKET, count: 3, dmg: fireworkData(gunpowder, colors) };
}

/** Colores (máscara de tintes) de una estrella o de un cohete. */
export function fireworkMask(s: ItemStack): number {
  return s.id === FIREWORK_STAR ? (s.dmg ?? 0) & 0xffff : s.id === FIREWORK_ROCKET ? fireworkColors(s.dmg) : 0;
}
