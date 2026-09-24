// Cortapiedras: qué sale de cada piedra (valores de Minecraft: losas de 2 en 2, escaleras y muros de
// 1 en 1, y ladrillos de piedra de la piedra lisa).
import { STONE, COBBLESTONE, STONE_BRICKS, BRICKS, SANDSTONE, SLABS, STAIRS, WALLS, WALL_SOURCE } from './blocks';
import type { ItemStack } from './items';

const table = new Map<number, ItemStack[]>();
const add = (input: number, id: number, count = 1) => {
  const l = table.get(input) ?? [];
  l.push({ id, count });
  table.set(input, l);
};
// Losas y escaleras de cada piedra (y los de ladrillos de piedra también desde la piedra lisa).
const SHAPED: [number, string][] = [
  [STONE, 'stone'], [COBBLESTONE, 'cobblestone'], [STONE_BRICKS, 'stone_brick'], [BRICKS, 'brick'], [SANDSTONE, 'sandstone'],
];
for (const [block, key] of SHAPED) {
  add(block, SLABS[key], 2);
  add(block, STAIRS[key]);
}
add(STONE, STONE_BRICKS);
add(STONE, SLABS.stone_brick, 2);
add(STONE, STAIRS.stone_brick);
// Muros de su piedra (y el de ladrillos de piedra desde la piedra lisa).
for (const [wall, src] of Object.entries(WALL_SOURCE)) add(src, Number(wall));
add(STONE, WALLS.stone_brick);

/** Lo que se puede cortar de una piedra (vacío si no sirve). */
export function stonecutterOptions(input: number): readonly ItemStack[] {
  return table.get(input) ?? [];
}
