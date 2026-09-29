// Programa lunar: las ensambladoras y los hornos de combustible, con las cifras de Factorio (FACTORIO-REFERENCIA.md §5).
//
// - Ensambladora 1/2/3 (`assembling-machine-1/2/3`): velocidad 0,5 / 0,75 / 1,25 y 75 / 150 / 375 kW; en reposo gastan 1/30 de eso (`drain`).
//   Hacen las recetas de Factorio de fabricación (`crafting`, `advanced-crafting`; las de fluidos llegan con las tuberías) con SUS tiempos
//   (`energy_required`) y cantidades: el jugador elige la receta en su ventana. Una tanda tarda `receta.time / velocidad`.
// - Horno de piedra (velocidad 1) y de acero (velocidad 2), los dos a 90 kW de combustible: las recetas de fundición de Factorio (3,2 s a
//   velocidad 1; el acero, 16 s). Queman lo que se les da como combustible (4 MJ el carbón: 44 s de trabajo) y no usan la red eléctrica.
import { factorioRecipes, factorioRecipe, recipesProducing, type FRecipe } from '../factorio/catalog';
import { maxStack } from '../items';

export * from './assemblyTypes';
import type { AssemblerType } from './assemblyTypes';

/** Categorías que hace una ensambladora. */
const ASSEMBLER_CATEGORIES: ReadonlySet<string> = new Set(['crafting', 'advanced-crafting']);
/** Categorías que hace un horno. */
export const FURNACE_CATEGORY = 'smelting';

let all: readonly FRecipe[] | null = null;

/** Las recetas que sabe hacer una ensambladora. */
export function assemblerRecipes(): readonly FRecipe[] {
  return (all ??= factorioRecipes().filter((r) => ASSEMBLER_CATEGORIES.has(r.category)));
}

/** La receta con esa clave estable, si una ensambladora puede hacerla. */
export function assemblerRecipe(key: number): FRecipe | undefined {
  const r = factorioRecipe(key);
  return r && ASSEMBLER_CATEGORIES.has(r.category) ? r : undefined;
}

/** Las recetas de ensambladora que dan el objeto `out` (para elegir entre ellas en la ventana). */
export function recipesMaking(out: number): FRecipe[] {
  return recipesProducing(out).filter((r) => ASSEMBLER_CATEGORIES.has(r.category));
}

/** Segundos a velocidad 1 de una tanda de la receta. */
export const recipeSeconds = (r: FRecipe): number => r.time;

/**
 * Cuánto guarda una ensambladora de cada ingrediente: como Factorio, lo de dos tandas y, si una tanda dura menos de un segundo a la
 * velocidad de la máquina, lo de una tanda más por cada segundo que le falte (para no quedarse corta), sin pasar de una pila.
 */
export function ingredientLimit(r: FRecipe, need: number, type: AssemblerType): number {
  const per = r.needs[need].n;
  const batches = Math.max(2, Math.ceil(1 / Math.max(0.05, r.time / type.speed)) + 1);
  const cap = maxStack(r.needs[need].alts[0]);
  return Math.max(per, Math.min(cap, per * batches));
}

/** Lo máximo que guarda de resultado antes de pararse: una pila (o dos tandas si la pila es más pequeña). */
export function outputLimit(r: FRecipe): number {
  return Math.max(r.out.count * 2, maxStack(r.out.id));
}

let smelts: readonly FRecipe[] | null = null;

/** Las recetas de fundición de Factorio (mineral → placa, piedra → ladrillo, placa → acero). */
export function smeltRecipes(): readonly FRecipe[] {
  return (smelts ??= factorioRecipes().filter((r) => r.category === FURNACE_CATEGORY && r.needs.length === 1));
}

/** La receta de fundición que se hace con el objeto `id` (undefined si no se funde). */
export function smeltRecipeFor(id: number, unlocked?: (r: FRecipe) => boolean): FRecipe | undefined {
  return smeltRecipes().find((r) => r.needs[0].alts.includes(id) && (!unlocked || unlocked(r)));
}
