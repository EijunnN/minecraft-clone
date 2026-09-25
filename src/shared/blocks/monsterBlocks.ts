// Bloques de los monstruos (fase 6): piedra, adoquín y ladrillos de piedra infestados. Se ven igual
// que los normales pero esconden una lepisma, que sale al romperlos; se rompen el doble de rápido y
// no sueltan nada. Se registran al final (ids guardados).
import { family } from './registry';
import { STONE, COBBLESTONE, STONE_BRICKS } from './classic';

const infested = (tex: string, hardness: number) => () => ({
  all: tex, hardness, tool: 'pickaxe' as const, category: 'naturaleza' as const,
});

export const INFESTED_STONE = family('infested_stone', 'Piedra infestada', [], infested('stone', 0.75));
export const INFESTED_COBBLESTONE = family('infested_cobblestone', 'Adoquín infestado', [], infested('cobblestone', 1));
export const INFESTED_STONE_BRICKS = family('infested_stone_bricks', 'Ladrillos de piedra infestados', [], infested('stone_bricks', 0.75));

/** Bloque infestado → el bloque normal que imita. */
export const INFESTED_OF: Readonly<Record<number, number>> = {
  [INFESTED_STONE]: STONE,
  [INFESTED_COBBLESTONE]: COBBLESTONE,
  [INFESTED_STONE_BRICKS]: STONE_BRICKS,
};

export function isInfested(id: number): boolean {
  return id === INFESTED_STONE || id === INFESTED_COBBLESTONE || id === INFESTED_STONE_BRICKS;
}
