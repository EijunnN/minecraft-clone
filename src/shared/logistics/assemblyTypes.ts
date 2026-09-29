// Programa lunar: los tipos de ensambladora y de horno de combustible (sin dependencias: los bloques los importan al registrarse).
// Cifras de Factorio (FACTORIO-REFERENCIA.md §5); el resto de la lógica está en assembly.ts.
export interface AssemblerType {
  key: string;
  name: string;
  speed: number;
  kw: number;
  /** kW en reposo (1/30 del gasto). */
  drainKw: number;
}

/** Los tres niveles, por orden de bloque. */
export const ASSEMBLERS: readonly AssemblerType[] = [
  { key: 'assembling_machine_1', name: 'Ensambladora 1', speed: 0.5, kw: 75, drainKw: 2.5 },
  { key: 'assembling_machine_2', name: 'Ensambladora 2', speed: 0.75, kw: 150, drainKw: 5 },
  { key: 'assembling_machine_3', name: 'Ensambladora 3', speed: 1.25, kw: 375, drainKw: 12.5 },
];

export interface FurnaceType {
  key: string;
  name: string;
  speed: number;
  kw: number;
}

export const FURNACES: readonly FurnaceType[] = [
  { key: 'stone_furnace', name: 'Horno de piedra', speed: 1, kw: 90 },
  { key: 'steel_furnace', name: 'Horno de acero', speed: 2, kw: 90 },
];

/** Segundos de una fundición a velocidad 1. */
export const FURNACE_RECIPE_SECONDS = 3.2;
/** kJ que da un objeto combustible: 50 kJ por cada segundo de `fuel` (el carbón, 80 → 4 MJ). */
export const FURNACE_KJ_PER_FUEL = 50;
/** Tope de combustible guardado (una pila). */
export const FURNACE_FUEL_STACK = 64;


/** Laboratorio (`lab`): 3×3, 60 kW, velocidad de investigación 1; en reposo 1/30 del gasto. */
export const LAB = { key: 'lab', name: 'Laboratorio', kw: 60, drainKw: 2, speed: 1 } as const;
/** Cuántas unidades de cada paquete de ciencia guarda un laboratorio (como Factorio, lo de dos unidades). */
export const LAB_PACK_LIMIT = 2;
