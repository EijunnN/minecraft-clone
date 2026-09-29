// Programa lunar: la fabricación a mano de Factorio: la cola de fabricación con los ingredientes intermedios que se hacen solos.
//
// Al encolar una receta se apartan del inventario TODOS los ingredientes sin fabricar que hacen falta y se ponen en una reserva; si falta un
// intermedio (un engranaje para una cinta) que también se puede hacer a mano, se encolan antes las recetas que lo dan. Cada paso tarda el
// `energy_required` de su receta (velocidad de fabricación a mano 1), gasta de la reserva lo que pide y le añade lo que da; al terminar el
// último paso, lo que queda en la reserva (el resultado y los sobrantes) va al inventario. Si se cancela, todo vuelve.
import { factorioRecipes, type FRecipe } from './catalog';

/** Categorías que se pueden hacer a mano. */
export const HAND_CATEGORIES: ReadonlySet<string> = new Set(['crafting', 'advanced-crafting']);

export interface HandPlan {
  /** Pasos por orden (primero los intermedios). */
  steps: FRecipe[];
  /** Ingredientes que se sacan del inventario al encolar (objeto → cantidad). */
  reserved: Map<number, number>;
}

let byOut: Map<number, FRecipe[]> | null = null;

/** Las recetas de mano que dan el objeto `id`, la primera es la que se usa para los intermedios. */
export function handRecipesFor(id: number): FRecipe[] {
  if (!byOut) {
    byOut = new Map();
    for (const r of factorioRecipes()) {
      if (!HAND_CATEGORIES.has(r.category)) continue;
      const l = byOut.get(r.out.id);
      if (l) l.push(r);
      else byOut.set(r.out.id, [r]);
    }
  }
  return byOut.get(id) ?? [];
}

/**
 * Prepara `count` fabricaciones de `recipe`. `stock` es lo que hay en el inventario (objeto → cantidad); `unlocked` dice si una receta está
 * desbloqueada. Devuelve null si no se puede (falta algo que no se puede fabricar a mano).
 */
export function planHandCraft(recipe: FRecipe, count: number, stock: ReadonlyMap<number, number>, unlocked: (name: string) => boolean): HandPlan | null {
  const left = new Map(stock); // lo que queda en el inventario
  const made = new Map<number, number>(); // lo que darán los pasos ya planeados y nadie ha gastado
  const reserved = new Map<number, number>();
  const steps: FRecipe[] = [];

  const craft = (r: FRecipe, depth: number): boolean => {
    if (depth > 8 || !unlocked(r.name)) return false;
    for (const need of r.needs) if (!ensure(need.alts, need.n, depth + 1, r)) return false;
    steps.push(r);
    made.set(r.out.id, (made.get(r.out.id) ?? 0) + r.out.count);
    return true;
  };

  const ensure = (alts: readonly number[], n: number, depth: number, parent: FRecipe): boolean => {
    let need = n;
    // 1) lo que darán los pasos anteriores
    for (const a of alts) {
      const m = Math.min(made.get(a) ?? 0, need);
      if (m > 0) {
        made.set(a, (made.get(a) ?? 0) - m);
        need -= m;
      }
    }
    // 2) lo que hay en el inventario
    for (const a of alts) {
      if (need <= 0) break;
      const m = Math.min(left.get(a) ?? 0, need);
      if (m > 0) {
        left.set(a, (left.get(a) ?? 0) - m);
        reserved.set(a, (reserved.get(a) ?? 0) + m);
        need -= m;
      }
    }
    // 3) fabricarlo (la receta que lo da, que no sea la propia)
    while (need > 0) {
      const r = handRecipesFor(alts[0]).find((x) => x !== parent && unlocked(x.name));
      if (!r || !craft(r, depth)) return false;
      const m = Math.min(made.get(alts[0]) ?? 0, need);
      made.set(alts[0], (made.get(alts[0]) ?? 0) - m);
      need -= m;
    }
    return true;
  };

  for (let i = 0; i < count; i++) if (!craft(recipe, 0)) return null;
  return { steps, reserved };
}

/** Segundos que tarda todo el plan a mano (velocidad 1). */
export const planSeconds = (p: HandPlan): number => p.steps.reduce((t, r) => t + r.time, 0);

/** Un paso del plan: gasta de la `pool` los ingredientes de `r` y le añade lo que da. false si no había (no debería pasar). */
export function runStep(pool: Map<number, number>, r: FRecipe): boolean {
  const take: [number, number][] = [];
  const tmp = new Map(pool);
  for (const need of r.needs) {
    let n = need.n;
    for (const a of need.alts) {
      const m = Math.min(tmp.get(a) ?? 0, n);
      if (m > 0) {
        tmp.set(a, (tmp.get(a) ?? 0) - m);
        take.push([a, m]);
        n -= m;
      }
    }
    if (n > 0) return false;
  }
  for (const [id, n] of take) pool.set(id, (pool.get(id) ?? 0) - n);
  pool.set(r.out.id, (pool.get(r.out.id) ?? 0) + r.out.count);
  return true;
}
