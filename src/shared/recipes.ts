// Recetas de fabricación (cuadrícula 2x2 del inventario y 3x3 de la mesa de trabajo).
import {
  OAK_LOG, BIRCH_LOG, SPRUCE_LOG, OAK_PLANKS, BIRCH_PLANKS, SPRUCE_PLANKS, CRAFTING_TABLE, TORCH, CHEST, FURNACE,
  COBBLESTONE, STONE, STONE_BRICKS, SAND, SANDSTONE, BRICKS, CLAY, BOOKSHELF, IRON_BLOCK, GOLD_BLOCK, DIAMOND_BLOCK,
  WHITE_WOOL, RED_WOOL, YELLOW_WOOL, BLUE_WOOL, POPPY, DANDELION, CORNFLOWER, SUGAR_CANE, GLASS, SLABS, STAIRS,
  FENCES, FENCE_GATES, DOORS, TRAPDOORS, LADDER, GLASS_PANE, RED_BED,
} from './blocks';
import {
  STICK, COAL, CHARCOAL, IRON_INGOT, GOLD_INGOT, DIAMOND, FLINT, FEATHER, STRING, PAPER, BOOK, LEATHER, BRICK,
  CLAY_BALL, BUCKET, BOW, ARROW, SHEARS, LAPIS, TOOLS, type ItemStack,
} from './items';

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

const PLANKS = [OAK_PLANKS, BIRCH_PLANKS, SPRUCE_PLANKS] as const;
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
mix([OAK_LOG], OAK_PLANKS, 4);
mix([BIRCH_LOG], BIRCH_PLANKS, 4);
mix([SPRUCE_LOG], SPRUCE_PLANKS, 4);
shape(['P', 'P'], { P: PLANKS }, STICK, 4);
shape(['PP', 'PP'], { P: PLANKS }, CRAFTING_TABLE);
shape(['C', 'S'], { C: FUEL_COAL, S: STICK }, TORCH, 4);
shape(['PPP', 'P P', 'PPP'], { P: PLANKS }, CHEST);
shape(['PPP', 'BBB', 'PPP'], { P: PLANKS, B: BOOK }, BOOKSHELF);

// --- Piedra y construcción ---
shape(['CCC', 'C C', 'CCC'], { C: COBBLESTONE }, FURNACE);
shape(['SS', 'SS'], { S: STONE }, STONE_BRICKS, 4);
shape(['SS', 'SS'], { S: SAND }, SANDSTONE);
shape(['BB', 'BB'], { B: BRICK }, BRICKS);
shape(['CC', 'CC'], { C: CLAY_BALL }, CLAY);

// --- Losas, escaleras, vallas, puertas... (como en Minecraft) ---
const SHAPE_MATERIALS: [string, number][] = [
  ['oak', OAK_PLANKS], ['birch', BIRCH_PLANKS], ['spruce', SPRUCE_PLANKS], ['cobblestone', COBBLESTONE], ['stone', STONE],
  ['stone_brick', STONE_BRICKS], ['brick', BRICKS], ['sandstone', SANDSTONE],
];
for (const [key, block] of SHAPE_MATERIALS) {
  shape(['MMM'], { M: block }, SLABS[key], 6);
  shape(['M  ', 'MM ', 'MMM'], { M: block }, STAIRS[key], 4);
}
for (const [key, planks] of SHAPE_MATERIALS.slice(0, 3)) {
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
  ['wooden', PLANKS], ['stone', COBBLESTONE], ['iron', IRON_INGOT], ['golden', GOLD_INGOT], ['diamond', DIAMOND],
];
for (const [mat, m] of MATS) {
  shape(['MMM', ' S ', ' S '], { M: m, S: STICK }, TOOLS[mat].pickaxe);
  shape(['MM', 'MS', ' S'], { M: m, S: STICK }, TOOLS[mat].axe);
  shape(['M', 'S', 'S'], { M: m, S: STICK }, TOOLS[mat].shovel);
  shape(['M', 'M', 'S'], { M: m, S: STICK }, TOOLS[mat].sword);
}
shape(['I I', ' I '], { I: IRON_INGOT }, BUCKET);
shape([' I', 'I '], { I: IRON_INGOT }, SHEARS);
shape([' SW', 'S W', ' SW'], { S: STICK, W: STRING }, BOW);
shape(['F', 'S', 'E'], { F: FLINT, S: STICK, E: FEATHER }, ARROW, 4);

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
