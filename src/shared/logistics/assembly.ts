// Programa lunar: las máquinas de fabricar con recetas de Factorio y los hornos de combustible (FACTORIO-REFERENCIA.md §5).
//
// - Ensambladora 1/2/3, planta química y refinería (`ASSEMBLERS`): cada una hace las recetas de las categorías de Factorio que le tocan
//   (`crafting`, `advanced-crafting`, `crafting-with-fluid` en las ensambladoras 2 y 3, `chemistry`, `oil-processing`) con SUS tiempos
//   (`energy_required`) y cantidades; el jugador elige la receta en su ventana. Una tanda tarda `receta.time / velocidad`.
// - Horno de piedra (velocidad 1) y de acero (velocidad 2), los dos a 90 kW de combustible: las recetas de fundición de Factorio (3,2 s a
//   velocidad 1; el acero, 16 s). Queman lo que se les da como combustible (4 MJ el carbón: 44 s de trabajo) y no usan la red eléctrica.
import { factorioRecipes, factorioRecipe, recipesProducing, type FRecipe } from '../factorio/catalog';
import { maxStack } from '../items';
import { ASSEMBLERS } from './assemblyTypes';

export * from './assemblyTypes';
import type { AssemblerType } from './assemblyTypes';

/** Categorías que hace un horno. */
export const FURNACE_CATEGORY = 'smelting';

/** Todas las categorías que hace alguna máquina de fabricar. */
const CRAFTER_CATEGORIES: ReadonlySet<string> = new Set(ASSEMBLERS.flatMap((a) => a.categories));

/** Las recetas que sabe hacer la máquina de fabricar `type`. */
export function recipesOfType(type: AssemblerType): FRecipe[] {
  return factorioRecipes().filter((r) => type.categories.includes(r.category));
}

/** Todas las recetas de máquinas de fabricar (para la ventana y las pruebas). */
export function assemblerRecipes(): readonly FRecipe[] {
  return factorioRecipes().filter((r) => CRAFTER_CATEGORIES.has(r.category));
}

/** La receta con esa clave estable, si alguna máquina de fabricar puede hacerla. */
export function assemblerRecipe(key: number): FRecipe | undefined {
  const r = factorioRecipe(key);
  return r && CRAFTER_CATEGORIES.has(r.category) ? r : undefined;
}

/** Las recetas de máquina de fabricar que dan el objeto `out` (para elegir entre ellas en la ventana). */
export function recipesMaking(out: number): FRecipe[] {
  return recipesProducing(out).filter((r) => CRAFTER_CATEGORIES.has(r.category));
}

/** Segundos a velocidad 1 de una tanda de la receta. */
export const recipeSeconds = (r: FRecipe): number => r.time;

/**
 * Cuánto guarda una máquina de cada ingrediente: como Factorio, lo de dos tandas y, si una tanda dura menos de un segundo a la
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
  return r.out.count > 0 ? Math.max(r.out.count * 2, maxStack(r.out.id)) : 0;
}

let smelts: readonly FRecipe[] | null = null;

/** Las recetas de fundición de Factorio (mineral → placa, piedra → ladrillo, placas → acero). */
export function smeltRecipes(): readonly FRecipe[] {
  return (smelts ??= factorioRecipes().filter((r) => r.category === FURNACE_CATEGORY && r.needs.length === 1));
}

/** La receta de fundición que se hace con el objeto `id` (undefined si no se funde). */
export function smeltRecipeFor(id: number, unlocked?: (r: FRecipe) => boolean): FRecipe | undefined {
  return smeltRecipes().find((r) => r.needs[0].alts.includes(id) && (!unlocked || unlocked(r)));
}
