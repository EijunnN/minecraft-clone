// Fase 8 (dimensiones): el generador de cada dimensión. Todos heredan de TerrainGenerator, así que el resto
// del juego (servidor, workers de mallado, consultas del HUD) los usa igual.
import { DIM_NETHER, DIM_END, DIM_MOON } from '../dimensions';
import { TerrainGenerator } from './terrain';
import { NetherGenerator } from './nether';
import { EndGenerator } from './end'; // Fase 8.6
import { MoonGenerator } from './moon'; // Programa lunar

export function createGenerator(dim: number, seed: number): TerrainGenerator {
  if (dim === DIM_NETHER) return new NetherGenerator(seed);
  if (dim === DIM_END) return new EndGenerator(seed);
  if (dim === DIM_MOON) return new MoonGenerator(seed);
  return new TerrainGenerator(seed);
}
