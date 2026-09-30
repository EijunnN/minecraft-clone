// Programa lunar: las recetas de Factorio (data/base/prototypes/recipe.lua, extraídas con tools/factorio-extract.mjs) puestas sobre los objetos
// del juego. Cada nombre de Factorio es un objeto del juego: uno que ya existía (lingote de hierro = `iron-plate`), una pieza de logística o
// de energía (el bloque), o uno de los objetos nuevos de itemDefs.ts. Una receta sólo está «disponible» si TODOS sus objetos existen y su
// categoría sabe hacerse (fabricación, fabricación avanzada, fundición; los fluidos y la química llegan con las tuberías).
import recipesJson from './recipes.json';
import { fluidByName } from '../logistics/fluidTypes';
import { FACTORIO_NEW, COAL, IRON_INGOT, COPPER_INGOT, RAW_IRON, RAW_COPPER, ANCHOR_HEART, ROCKET_STAGE, SELENE_ROCKET, type ItemStack } from '../items';
import {
  COBBLESTONE, BELTS, UNDERGROUNDS, SPLITTERS, INSERTERS, POLE_SMALL, POLE_MEDIUM, POLE_BIG, SUBSTATION, SOLAR_PANEL, ACCUMULATOR, ASSEMBLER_BLOCKS,
  FURNACE_BLOCKS, ELECTRIC_SMELTER, EXTRACTOR, ALL_LOGS, LAB_BLOCK, PIPE, PIPE_TO_GROUND, STORAGE_TANK, PUMP, OFFSHORE_PUMP, PUMPJACK, BOILER, STEAM_ENGINE,
  DIRTY_ICE,
} from '../blocks';

/** Objetos del juego que valen por cada nombre de Factorio (varios = cualquiera de ellos). */
const EXISTING: Readonly<Record<string, readonly number[]>> = {
  'iron-plate': [IRON_INGOT],
  'copper-plate': [COPPER_INGOT],
  'iron-ore': [RAW_IRON],
  'copper-ore': [RAW_COPPER],
  coal: [COAL],
  stone: [COBBLESTONE],
  wood: ALL_LOGS,
  'transport-belt': [BELTS[0]], 'fast-transport-belt': [BELTS[1]], 'express-transport-belt': [BELTS[2]],
  'underground-belt': [UNDERGROUNDS[0]], 'fast-underground-belt': [UNDERGROUNDS[1]], 'express-underground-belt': [UNDERGROUNDS[2]],
  splitter: [SPLITTERS[0]], 'fast-splitter': [SPLITTERS[1]], 'express-splitter': [SPLITTERS[2]],
  inserter: [INSERTERS[0]], 'fast-inserter': [INSERTERS[1]], 'long-handed-inserter': [INSERTERS[2]], 'burner-inserter': [INSERTERS[3]],
  'bulk-inserter': [INSERTERS[4]],
  'small-electric-pole': [POLE_SMALL], 'medium-electric-pole': [POLE_MEDIUM], 'big-electric-pole': [POLE_BIG], substation: [SUBSTATION],
  'solar-panel': [SOLAR_PANEL], accumulator: [ACCUMULATOR],
  'assembling-machine-1': [ASSEMBLER_BLOCKS[0]], 'assembling-machine-2': [ASSEMBLER_BLOCKS[1]], 'assembling-machine-3': [ASSEMBLER_BLOCKS[2]], 'chemical-plant': [ASSEMBLER_BLOCKS[3]], 'oil-refinery': [ASSEMBLER_BLOCKS[4]],
  'stone-furnace': [FURNACE_BLOCKS[0]], 'steel-furnace': [FURNACE_BLOCKS[1]], 'electric-furnace': [ELECTRIC_SMELTER],
  'electric-mining-drill': [EXTRACTOR],
  lab: [LAB_BLOCK],
  pipe: [PIPE], 'pipe-to-ground': [PIPE_TO_GROUND], 'storage-tank': [STORAGE_TANK], pump: [PUMP], 'offshore-pump': [OFFSHORE_PUMP], pumpjack: [PUMPJACK],
  boiler: [BOILER], 'steam-engine': [STEAM_ENGINE],
  ice: [DIRTY_ICE], // Programa lunar: el hielo sucio de los cráteres polares
  // Programa lunar (meteors.ts): el cohete Selene y sus piezas.
  'anchor-heart': [ANCHOR_HEART], 'rocket-stage': [ROCKET_STAGE], 'selene-rocket': [SELENE_ROCKET],
};

/** Los objetos del juego que valen por ese nombre de Factorio (null si aún no existe). */
export function itemAlts(name: string): readonly number[] | null {
  const n = FACTORIO_NEW[name];
  if (n !== undefined) return [n];
  return EXISTING[name] ?? null;
}

const nameOf = new Map<number, string>();
for (const [name, alts] of Object.entries(EXISTING)) if (alts.length === 1) nameOf.set(alts[0], name);
for (const [name, id] of Object.entries(FACTORIO_NEW)) nameOf.set(id, name);

/** El nombre de Factorio de un objeto del juego (undefined si no viene de Factorio). */
export const factorioNameOf = (id: number): string | undefined => nameOf.get(id);

export interface FNeed {
  alts: readonly number[];
  n: number;
}

/** Un fluido de una receta: cuál, cuánto y en qué caja de fluido de la máquina (0, 1… entre las de entrada o entre las de salida). */
export interface FFluid {
  fluid: number;
  amount: number;
  box: number;
}

export interface FRecipe {
  /** Clave estable de 32 bits (de su nombre). */
  key: number;
  name: string;
  category: string;
  /** Segundos de fabricación a velocidad 1 (`energy_required`). */
  time: number;
  /** Ingredientes que son objetos. */
  needs: readonly FNeed[];
  /** Ingredientes y resultados que son fluidos. */
  fluidsIn: readonly FFluid[];
  fluidsOut: readonly FFluid[];
  /** El resultado que es un objeto ({ id: 0, count: 0 } si la receta sólo da fluidos). */
  out: ItemStack;
  /** ¿Está desbloqueada desde el principio? (`enabled`; el resto, con la investigación que las libera). */
  enabled: boolean;
}

interface RawRecipe {
  name: string;
  category: string;
  time: number;
  enabled: boolean;
  ingredients: [string, number, string, number][];
  results: [string, number, string, number, number][];
}

/** Las categorías que ya saben hacerse: a mano/ensambladora, fundición, ensambladora con fluidos, planta química y refinería. */
export const SUPPORTED_CATEGORIES: ReadonlySet<string> = new Set([
  'crafting', 'advanced-crafting', 'smelting', 'crafting-with-fluid', 'chemistry', 'oil-processing',
]);

function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h | 0;
}

/**
 * Programa lunar: recetas que no están en el Factorio base (recipes.json sale de él), con los números de Factorio 2.0 (Space Age) cuando
 * los hay. «Fundido de hielo» (ice-melting): 1 hielo → 20 de agua en 1 s en la planta química; es el agua de la Luna (calderas, ácido,
 * azufre), que no tiene agua líquida. Abierta desde el principio: lo que cuesta es la planta química (procesado de petróleo).
 */
export const LUNAR_RECIPES: readonly RawRecipe[] = [
  { name: 'ice-melting', category: 'chemistry', time: 1, enabled: true, ingredients: [['ice', 1, 'item', 0]], results: [['water', 20, 'fluid', 1, 0]] },
  // El cohete Selene (meteors.ts): tres etapas de lo que da la fábrica de la Tierra (acero, circuitos, tuberías y engranajes; sin
  // petróleo, que en la Tierra no hay) y el Corazón del Ancla, que sólo trae el meteorito grande. El carbón es el propelente denso.
  {
    name: 'rocket-stage', category: 'crafting', time: 15, enabled: true,
    ingredients: [['steel-plate', 20, 'item', 0], ['electronic-circuit', 10, 'item', 0], ['pipe', 10, 'item', 0], ['iron-gear-wheel', 10, 'item', 0]],
    results: [['rocket-stage', 1, 'item', 1, 0]],
  },
  {
    name: 'selene-rocket', category: 'crafting', time: 30, enabled: true,
    ingredients: [['rocket-stage', 3, 'item', 0], ['anchor-heart', 1, 'item', 0], ['coal', 50, 'item', 0]],
    results: [['selene-rocket', 1, 'item', 1, 0]],
  },
];
/** Nombres en español de las recetas lunares (names-es.json es el de Factorio base). */
export const LUNAR_RECIPE_NAMES: Readonly<Record<string, string>> = {
  'ice-melting': 'Fundido de hielo', 'rocket-stage': 'Etapa de cohete', 'selene-rocket': 'Cohete Selene',
};

let cache: FRecipe[] | null = null;
const byKey = new Map<number, FRecipe>();
const byName = new Map<string, FRecipe>();

/** Todas las recetas disponibles. */
export function factorioRecipes(): readonly FRecipe[] {
  if (cache) return cache;
  cache = [];
  for (const r of [...(recipesJson as RawRecipe[]), ...LUNAR_RECIPES]) {
    if (!SUPPORTED_CATEGORIES.has(r.category) || r.results.length === 0) continue;
    const needs: FNeed[] = [];
    const fluidsIn: FFluid[] = [];
    const fluidsOut: FFluid[] = [];
    const items: ItemStack[] = [];
    let ok = true;
    let seq = 0;
    for (const [name, amount, type, fb] of r.ingredients) {
      if (type === 'fluid') {
        const f = fluidByName(name);
        if (!f) ok = false;
        else fluidsIn.push({ fluid: f.id, amount, box: fb > 0 ? fb - 1 : seq++ });
        continue;
      }
      const alts = itemAlts(name);
      if (!alts) ok = false;
      else needs.push({ alts, n: amount });
    }
    seq = 0;
    for (const [name, amount, type, prob, fb] of r.results) {
      if (type === 'fluid') {
        const f = fluidByName(name);
        if (!f) ok = false;
        else fluidsOut.push({ fluid: f.id, amount, box: fb > 0 ? fb - 1 : seq++ });
        continue;
      }
      const res = itemAlts(name);
      if (!res || prob !== 1 || !Number.isInteger(amount)) ok = false;
      else items.push({ id: res[0], count: amount });
    }
    if (!ok || items.length > 1) continue;
    const rec: FRecipe = {
      key: hash32('factorio|' + r.name), name: r.name, category: r.category, time: r.time, needs, fluidsIn, fluidsOut,
      out: items[0] ?? { id: 0, count: 0 }, enabled: r.enabled,
    };
    cache.push(rec);
    byKey.set(rec.key, rec);
    byName.set(rec.name, rec);
  }
  return cache;
}

/** La receta con esa clave (undefined si no existe o no está disponible). */
export function factorioRecipe(key: number): FRecipe | undefined {
  factorioRecipes();
  return byKey.get(key);
}

/** La receta de Factorio con ese nombre de prototipo. */
export function factorioRecipeByName(name: string): FRecipe | undefined {
  factorioRecipes();
  return byName.get(name);
}

/** Las recetas que dan el objeto `out`. */
export function recipesProducing(out: number): FRecipe[] {
  return factorioRecipes().filter((r) => r.out.id === out);
}
