// Fase 8 (dimensiones): el generador de cada dimensión. Todos heredan de TerrainGenerator, así que el resto
// del juego (servidor, workers de mallado, consultas del HUD) los usa igual.
import { DIM_NETHER } from '../dimensions';
import { TerrainGenerator } from './terrain';
import { NetherGenerator } from './nether';

export function createGenerator(dim: number, seed: number): TerrainGenerator {
  if (dim === DIM_NETHER) return new NetherGenerator(seed);
  return new TerrainGenerator(seed);
}
