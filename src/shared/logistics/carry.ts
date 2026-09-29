// Programa lunar: lo que las cintas se llevan por delante. Como en Factorio, quien se sube a una cinta (subterránea o divisor incluidos)
// avanza con ella a su velocidad: el jugador y los objetos tirados en el suelo. Lo usan el cliente (el jugador) y el servidor (los objetos).
import { beltInfo, undergroundInfo, splitterInfo } from '../blocks';
import { BELT_DX, BELT_DZ, BELT_SPEEDS } from './belts';

/** Velocidad (bloques/s en x y z) con que se lleva la pieza de logística `id` a quien está sobre ella, o null si no es de las que mueven. */
export function carryVelocity(id: number): [number, number] | null {
  if (id <= 0) return null;
  const c = beltInfo(id) ?? undergroundInfo(id) ?? splitterInfo(id);
  if (!c) return null;
  const v = BELT_SPEEDS[c.tier];
  return [BELT_DX[c.dir] * v, BELT_DZ[c.dir] * v];
}
