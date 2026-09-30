// Programa lunar: los tipos de ensambladora y de horno de combustible (sin dependencias: los bloques los importan al registrarse).
// Cifras de Factorio (FACTORIO-REFERENCIA.md §5); el resto de la lógica está en assembly.ts.
/** Un puerto de tubería de una máquina, en su huella sin girar (mirando al norte, −Z): casilla local, cara de esa casilla y volumen. */
export interface FluidPortDef {
  lx: number;
  ly: number;
  lz: number;
  /** Cara (0 +x, 1 −x, 2 +y, 3 −y, 4 +z, 5 −z). */
  face: number;
  cap: number;
}

export interface AssemblerType {
  key: string;
  name: string;
  speed: number;
  kw: number;
  /** kW en reposo (1/30 del gasto). */
  drainKw: number;
  /** Categorías de receta de Factorio que hace. */
  categories: readonly string[];
  /** Huella (ancho, alto, fondo) y casilla principal, mirando al norte. */
  size: readonly [number, number, number];
  anchor: readonly [number, number, number];
  /** Cajas de fluido de entrada y de salida (en el orden de los `box` de las recetas). */
  fluidIn: readonly FluidPortDef[];
  fluidOut: readonly FluidPortDef[];
}

const NONE: readonly FluidPortDef[] = [];
/** Ensambladoras 2 y 3: una caja de entrada por el frente (norte) y una de salida por atrás (sur), de 1 000. */
const AM_IN: readonly FluidPortDef[] = [{ lx: 1, ly: 0, lz: 0, face: 5, cap: 1000 }];
const AM_OUT: readonly FluidPortDef[] = [{ lx: 1, ly: 0, lz: 2, face: 4, cap: 1000 }];
const CRAFT = ['crafting', 'advanced-crafting'] as const;

/**
 * Las máquinas de fabricar con recetas (ensambladoras 1-3, planta química y refinería), por orden de bloque. Cifras de Factorio:
 * ensambladoras 0,5/0,75/1,25 y 75/150/375 kW (la 1 no hace recetas con fluidos); planta química 3×3, velocidad 1, 210 kW, dos entradas
 * de 1 000 por el norte y dos salidas de 100 por el sur; refinería 5×5, velocidad 1, 420 kW, dos entradas de 1 000 por el sur y tres
 * salidas de 100 por el norte.
 */
export const ASSEMBLERS: readonly AssemblerType[] = [
  { key: 'assembling_machine_1', name: 'Ensambladora 1', speed: 0.5, kw: 75, drainKw: 2.5, categories: CRAFT, size: [3, 2, 3], anchor: [1, 0, 1], fluidIn: NONE, fluidOut: NONE },
  {
    key: 'assembling_machine_2', name: 'Ensambladora 2', speed: 0.75, kw: 150, drainKw: 5, categories: [...CRAFT, 'crafting-with-fluid'], size: [3, 2, 3],
    anchor: [1, 0, 1], fluidIn: AM_IN, fluidOut: AM_OUT,
  },
  {
    key: 'assembling_machine_3', name: 'Ensambladora 3', speed: 1.25, kw: 375, drainKw: 12.5, categories: [...CRAFT, 'crafting-with-fluid'], size: [3, 2, 3],
    anchor: [1, 0, 1], fluidIn: AM_IN, fluidOut: AM_OUT,
  },
  {
    key: 'chemical_plant', name: 'Planta química', speed: 1, kw: 210, drainKw: 7, categories: ['chemistry'], size: [3, 2, 3], anchor: [1, 0, 1],
    fluidIn: [{ lx: 0, ly: 0, lz: 0, face: 5, cap: 1000 }, { lx: 2, ly: 0, lz: 0, face: 5, cap: 1000 }],
    fluidOut: [{ lx: 0, ly: 0, lz: 2, face: 4, cap: 100 }, { lx: 2, ly: 0, lz: 2, face: 4, cap: 100 }],
  },
  {
    key: 'oil_refinery', name: 'Refinería de petróleo', speed: 1, kw: 420, drainKw: 14, categories: ['oil-processing'], size: [5, 3, 5], anchor: [2, 0, 2],
    fluidIn: [{ lx: 1, ly: 0, lz: 4, face: 4, cap: 1000 }, { lx: 3, ly: 0, lz: 4, face: 4, cap: 1000 }],
    fluidOut: [{ lx: 0, ly: 0, lz: 0, face: 5, cap: 100 }, { lx: 2, ly: 0, lz: 0, face: 5, cap: 100 }, { lx: 4, ly: 0, lz: 0, face: 5, cap: 100 }],
  },
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
