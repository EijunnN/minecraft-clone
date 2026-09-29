// Programa lunar: las recetas de Factorio (data/base/prototypes/recipe.lua, extraídas con tools/factorio-extract.mjs) puestas sobre los objetos
// del juego. Cada nombre de Factorio es un objeto del juego: uno que ya existía (lingote de hierro = `iron-plate`), una pieza de logística o
// de energía (el bloque), o uno de los objetos nuevos de itemDefs.ts. Una receta sólo está «disponible» si TODOS sus objetos existen y su
// categoría sabe hacerse (fabricación, fabricación avanzada, fundición; los fluidos y la química llegan con las tuberías).
import recipesJson from './recipes.json';
import { FACTORIO_NEW, COAL, IRON_INGOT, COPPER_INGOT, RAW_IRON, RAW_COPPER, type ItemStack } from '../items';
import {
  COBBLESTONE, BELTS, UNDERGROUNDS, SPLITTERS, INSERTERS, POLE_SMALL, POLE_MEDIUM, POLE_BIG, SUBSTATION, SOLAR_PANEL, ACCUMULATOR, ASSEMBLER_BLOCKS,
  FURNACE_BLOCKS, ELECTRIC_SMELTER, EXTRACTOR, ALL_LOGS, LAB_BLOCK,
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
  'assembling-machine-1': [ASSEMBLER_BLOCKS[0]], 'assembling-machine-2': [ASSEMBLER_BLOCKS[1]], 'assembling-machine-3': [ASSEMBLER_BLOCKS[2]],
  'stone-furnace': [FURNACE_BLOCKS[0]], 'steel-furnace': [FURNACE_BLOCKS[1]], 'electric-furnace': [ELECTRIC_SMELTER],
  'electric-mining-drill': [EXTRACTOR],
  lab: [LAB_BLOCK],
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

export interface FRecipe {
  /** Clave estable de 32 bits (de su nombre). */
  key: number;
  name: string;
  category: string;
  /** Segundos de fabricación a velocidad 1 (`energy_required`). */
  time: number;
  needs: readonly FNeed[];
  /** El resultado (los de fabricación y fundición sólo tienen uno). */
  out: ItemStack;
  /** ¿Está desbloqueada desde el principio? (`enabled`; el resto, con la investigación que las libera). */
  enabled: boolean;
}

interface RawRecipe {
  name: string;
  category: string;
  time: number;
  enabled: boolean;
  ingredients: [string, number, string][];
  results: [string, number, string, number][];
}

/** Las categorías que ya saben hacerse: a mano/ensambladora (`crafting`, `advanced-crafting`) y en horno (`smelting`). */
export const SUPPORTED_CATEGORIES: ReadonlySet<string> = new Set(['crafting', 'advanced-crafting', 'smelting']);

function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h | 0;
}

let cache: FRecipe[] | null = null;
const byKey = new Map<number, FRecipe>();
const byName = new Map<string, FRecipe>();

/** Todas las recetas disponibles. */
export function factorioRecipes(): readonly FRecipe[] {
  if (cache) return cache;
  cache = [];
  for (const r of recipesJson as RawRecipe[]) {
    if (!SUPPORTED_CATEGORIES.has(r.category) || r.results.length !== 1 || r.results[0][2] !== 'item' || r.results[0][3] !== 1) continue;
    const needs: FNeed[] = [];
    let ok = true;
    for (const [name, amount, type] of r.ingredients) {
      const alts = type === 'item' ? itemAlts(name) : null;
      if (!alts) {
        ok = false;
        break;
      }
      needs.push({ alts, n: amount });
    }
    const res = itemAlts(r.results[0][0]);
    if (!ok || !res) continue;
    const rec: FRecipe = { key: hash32('factorio|' + r.name), name: r.name, category: r.category, time: r.time, needs, out: { id: res[0], count: r.results[0][1] }, enabled: r.enabled };
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
