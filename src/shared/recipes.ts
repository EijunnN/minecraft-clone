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
