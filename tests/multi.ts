// Ayudante de pruebas: coloca una máquina de varias casillas por su huella, como lo hace el planificador al ponerla.
import { multiFootprint } from '../src/shared/blocks';

/** Pone la máquina `base` con su casilla principal (el centro de abajo de las de 3×3) en (x, y, z), mirando al sentido `dir`. */
export function putMulti(world: { setBlock(x: number, y: number, z: number, id: number): unknown }, base: number, dir: number, x: number, y: number, z: number): void {
  for (const [cx, cy, cz, id] of multiFootprint(base, dir, x, y, z)) world.setBlock(cx, cy, cz, id);
}
