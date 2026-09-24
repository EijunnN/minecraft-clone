// Identificadores y nombres de los biomas (compartidos por el generador de terreno y las estructuras).

export const BIOME_OCEAN = 0;
export const BIOME_FROZEN_OCEAN = 1;
export const BIOME_BEACH = 2;
export const BIOME_PLAINS = 3;
export const BIOME_FOREST = 4;
export const BIOME_BIRCH_FOREST = 5;
export const BIOME_TAIGA = 6;
export const BIOME_SNOWY = 7;
export const BIOME_DESERT = 8;
export const BIOME_SAVANNA = 9;
export const BIOME_MOUNTAINS = 10;
export const BIOME_SNOWY_PEAKS = 11;
// Fase 5.
export const BIOME_SWAMP = 12;
export const BIOME_JUNGLE = 13;
export const BIOME_DARK_FOREST = 14;
export const BIOME_BADLANDS = 15;
export const BIOME_MUSHROOM_FIELDS = 16;
export const BIOME_CHERRY_GROVE = 17;
export const BIOME_MEADOW = 18;
export const BIOME_ICE_SPIKES = 19;
export const BIOME_WARM_OCEAN = 20;
export const BIOME_COLD_OCEAN = 21;
export const BIOME_DEEP_OCEAN = 22;

export const BIOME_NAMES = [
  'Océano', 'Océano helado', 'Playa', 'Llanura', 'Bosque', 'Bosque de abedules', 'Taiga',
  'Taiga nevada', 'Desierto', 'Sabana', 'Montañas', 'Picos nevados', 'Pantano', 'Jungla', 'Bosque oscuro',
  'Tierras baldías', 'Campos de champiñones', 'Arboleda de cerezos', 'Pradera', 'Picos de hielo', 'Océano cálido',
  'Océano frío', 'Océano profundo',
];

/** ¿Es un océano (de cualquier tipo)? */
export function isOceanBiome(b: number): boolean {
  return b === BIOME_OCEAN || b === BIOME_FROZEN_OCEAN || b === BIOME_WARM_OCEAN || b === BIOME_COLD_OCEAN || b === BIOME_DEEP_OCEAN;
}
