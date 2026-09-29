// Programa lunar: la investigación de Factorio (data/base/prototypes/technology.lua, extraída con tools/factorio-extract.mjs).
//
// Cada tecnología tiene prerrequisitos, un coste (`unit`: cuántas unidades, segundos por unidad y qué paquetes de ciencia gasta cada una) o un
// disparador (`research_trigger`: fabricar tantos objetos, minar algo…) y unos efectos (recetas que desbloquea y bonificaciones).
// Aquí sólo hay datos y reglas puras; el estado (qué está investigado y cómo va) es del servidor (sim/server/research.ts).
import techJson from './technologies.json';
import { factorioRecipes, itemAlts } from './catalog';

export interface TechUnit {
  count: number;
  /** Segundos por unidad a velocidad de laboratorio 1. */
  time: number;
  /** [nombre del paquete, cantidad por unidad]. */
  ingredients: [string, number][];
}

export interface Tech {
  name: string;
  prerequisites: string[];
  /** Nombres de las recetas que desbloquea. */
  unlocks: string[];
  effects: { type: string; [k: string]: unknown }[];
  unit?: TechUnit;
  trigger?: { type: string; item?: string; count?: number; entity?: string };
}

interface RawTech {
  name: string;
  prerequisites: string[];
  unlocks: string[];
  effects: { type: string }[];
  unit?: { count: number | null; formula: string | null; time: number; ingredients: [string, number][] };
  trigger?: Tech['trigger'];
}

/** Las tecnologías con coste fijo o disparador (las infinitas con fórmula de nivel quedan fuera). */
export const TECHS: readonly Tech[] = (techJson as RawTech[])
  .filter((t) => (t.unit ? t.unit.count !== null : !!t.trigger))
  .map((t) => ({
    name: t.name, prerequisites: t.prerequisites, unlocks: t.unlocks, effects: t.effects,
    ...(t.unit ? { unit: { count: t.unit.count as number, time: t.unit.time, ingredients: t.unit.ingredients } } : {}),
    ...(t.trigger ? { trigger: t.trigger } : {}),
  }));

const byName = new Map(TECHS.map((t) => [t.name, t]));
export const techByName = (name: string): Tech | undefined => byName.get(name);

/** Las recetas que están desbloqueadas desde el principio (`enabled`). */
export function baseRecipes(): string[] {
  return factorioRecipes().filter((r) => r.enabled).map((r) => r.name);
}

/**
 * ¿Se puede empezar a investigar `name`? Todos sus prerrequisitos investigados y, si tiene coste, que exista un paquete de cada ciencia
 * que pida en el juego (los paquetes de ciencia espacial y demás llegan más adelante).
 */
export function techAvailable(name: string, done: ReadonlySet<string>): boolean {
  const t = byName.get(name);
  if (!t || done.has(name)) return false;
  if (!t.prerequisites.every((p) => done.has(p))) return false;
  return !t.unit || t.unit.ingredients.every(([pack]) => itemAlts(pack) !== null);
}

/** Segundos que tarda una unidad en un laboratorio de velocidad `speed`. */
export const unitSeconds = (t: Tech, speed: number): number => (t.unit ? t.unit.time / speed : 0);
