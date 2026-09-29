// Programa lunar: los fluidos de Factorio (data/base/prototypes/fluid.lua y entity/*.lua; FACTORIO-REFERENCIA.md §7) con sus cifras.
//
// - Tubería: 100 de volumen. Tubería subterránea: dos extremos que se unen a hasta 10 casillas (`max_underground_distance` 10).
// - Tanque de almacenamiento: 25 000, 3×3. Bomba: 1 200/s (2 casillas, 29 kW). Bomba de agua (offshore): 1 200/s de agua, sin energía.
// - El flujo entre dos cajas depende de la diferencia de nivel (lo lleno que está cada una): cada tick pasa el 40 % de esa diferencia por la
//   capacidad de la más pequeña, como el modelo de Factorio; el juego va a 20 ticks por segundo y se hacen 3 pasos por tick para igualar los 60.

export interface FluidDef {
  id: number;
  /** Nombre del prototipo de Factorio. */
  name: string;
  es: string;
  /** Color [r, g, b] para el interior de tanques y máquinas. */
  color: readonly [number, number, number];
}

/** Los fluidos que existen (id 0 = ninguno). */
export const FLUIDS: readonly FluidDef[] = [
  { id: 0, name: '', es: 'Vacío', color: [0, 0, 0] },
  { id: 1, name: 'water', es: 'Agua', color: [64, 120, 224] },
  { id: 2, name: 'crude-oil', es: 'Petróleo crudo', color: [40, 32, 36] },
  { id: 3, name: 'heavy-oil', es: 'Petróleo pesado', color: [130, 60, 30] },
  { id: 4, name: 'light-oil', es: 'Petróleo ligero', color: [220, 150, 40] },
  { id: 5, name: 'petroleum-gas', es: 'Gas de petróleo', color: [140, 130, 190] },
  { id: 6, name: 'lubricant', es: 'Lubricante', color: [40, 150, 60] },
  { id: 7, name: 'sulfuric-acid', es: 'Ácido sulfúrico', color: [220, 210, 80] },
  { id: 8, name: 'steam', es: 'Vapor', color: [220, 220, 224] },
];

const byName = new Map(FLUIDS.map((f) => [f.name, f]));
export const fluidByName = (name: string): FluidDef | undefined => byName.get(name);
export const fluidName = (id: number): string => FLUIDS[id]?.es ?? '?';

export const PIPE_VOLUME = 100;
export const TANK_VOLUME = 25000;
export const PUMP_VOLUME = 200;
/** Lo que mueve una bomba (y da una bomba de agua), por segundo. */
export const PUMP_RATE = 1200;
export const OFFSHORE_RATE = 1200;
export const PUMP_KW = 29;
/** Lo más lejos que llegan dos tuberías subterráneas (casillas entre los dos extremos, contando el segundo). */
export const PIPE_UNDERGROUND_MAX = 10;
/** Fracción de la diferencia de nivel que pasa entre dos cajas por paso (Factorio: 0,4 cada 1/60 s). */
export const FLOW_FACTOR = 0.4;
/** Pasos de flujo por tick del juego (20 tps → 60 pasos por segundo). */
export const FLOW_SUBSTEPS = 3;

// Pozo de petróleo (pumpjack): 90 kW; cada segundo saca 10 × el rendimiento de crudo del pozo. Un pozo empieza con un rendimiento (100 % =
// 300 000 de reserva) y pierde reserva con lo que se saca (10 por segundo a pleno rendimiento); nunca baja del 20 %.
export const PUMPJACK_KW = 90;
export const OIL_PER_SECOND = 10;
export const OIL_FULL = 300000;
export const OIL_MIN_YIELD = 0.2;
export const OIL_DEPLETION_PER_SECOND = 10;
export const PUMPJACK_VOLUME = 100;

// Vapor (Factorio): la caldera (1,8 MW) convierte 6 de agua por segundo en 60 de vapor a 165 °C (30 kJ por unidad); la máquina de vapor
// (900 kW) gasta 30 de vapor por segundo. Una caldera alimenta a dos máquinas.
export const BOILER_KW = 1800;
export const BOILER_WATER_PER_SECOND = 6;
export const BOILER_STEAM_PER_SECOND = 60;
export const STEAM_KJ = 30;
export const STEAM_ENGINE_KW = 900;
export const BOILER_VOLUME = 200;
export const ENGINE_VOLUME = 200;
