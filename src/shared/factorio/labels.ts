// Programa lunar: los nombres en español de Factorio (data/base/locale/es-ES) de tecnologías, recetas y objetos, para las ventanas.
import names from './names-es.json';
import { LUNAR_RECIPE_NAMES } from './catalog';

type Names = Record<string, string>;
const N = names as { item: Names; entity: Names; recipe: Names; technology: Names; fluid: Names };

const humanize = (id: string): string => {
  const t = id.replace(/-/g, ' ');
  return t.charAt(0).toUpperCase() + t.slice(1);
};

/** Nombre de una tecnología (las de varios niveles, «nombre-3», usan el de la serie y el nivel). */
export function techLabel(id: string): string {
  if (N.technology[id]) return N.technology[id];
  const m = /^(.*)-(\d+)$/.exec(id);
  if (m && N.technology[m[1]]) return `${N.technology[m[1]]} ${m[2]}`;
  return humanize(id);
}

/** Nombre de una receta o de su objeto. */
export function recipeLabel(id: string): string {
  return N.recipe[id] ?? LUNAR_RECIPE_NAMES[id] ?? N.item[id] ?? N.entity[id] ?? N.fluid[id] ?? humanize(id);
}
