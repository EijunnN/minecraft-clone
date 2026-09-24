// Qué suelta cada bloque al romperse en supervivencia (según la herramienta usada).
import {
  BLOCKS, STONE, COBBLESTONE, GRASS, SNOWY_GRASS, DIRT, COAL_ORE, DIAMOND_ORE, LAPIS_ORE, REDSTONE_ORE, GRAVEL,
  CLAY, GLASS, ICE, OAK_LEAVES, BIRCH_LEAVES, SPRUCE_LEAVES, OAK_SAPLING, BIRCH_SAPLING, SPRUCE_SAPLING,
  SHORT_GRASS, FERN, DEAD_BUSH, BOOKSHELF, BLOCK_FLUID, GLASS_PANE, baseBlock, stateProps, isDoor, isBed, isSlab,
  WHEAT_CROP, CARROTS, POTATOES, BEETROOTS, familyBase, isCrop, isMatureCrop, isFarmland, isCake,
} from '../blocks';
import {
  ITEMS, COAL, DIAMOND, LAPIS, REDSTONE, FLINT, CLAY_BALL, APPLE, STICK, BOOK, WHEAT_SEEDS, WHEAT, CARROT, POTATO,
  BEETROOT, BEETROOT_SEEDS, type ItemStack,
} from '../items';

/** Botín de un bloque roto con la herramienta `toolId` (0 = mano). */
export function blockDrops(block: number, toolId: number, rand: () => number = Math.random): ItemStack[] {
  const b = BLOCKS[block];
  if (!b || b.hardness < 0 || BLOCK_FLUID[block]) return [];
  const tool = toolId > 0 ? ITEMS[toolId]?.tool : undefined;
  // Bloques que exigen un pico de cierto nivel.
  if (b.tier > 0 && !(tool && tool.kind === 'pickaxe' && tool.tier >= b.tier)) return [];
  const one = (id: number, n = 1): ItemStack[] => [{ id, count: n }];
  const rnd = (a: number, c: number) => a + Math.floor(rand() * (c - a + 1));
  // Puertas y camas sueltan el objeto una sola vez (por la mitad de abajo / los pies).
  if (isDoor(block)) return stateProps(block)!.half === 0 ? one(baseBlock(block)) : [];
  if (isBed(block)) return stateProps(block)!.part === 0 ? one(baseBlock(block)) : [];
  if (isSlab(block)) return one(baseBlock(block), stateProps(block)!.type === 2 ? 2 : 1);
  if (block === GLASS_PANE || isCake(block)) return [];
  if (isFarmland(block)) return one(DIRT);
  if (isCrop(block)) {
    // Cosecha como en Minecraft: tres intentos al 57 % de sacar una semilla o fruto más.
    const extra = () => (rand() < 4 / 7 ? 1 : 0) + (rand() < 4 / 7 ? 1 : 0) + (rand() < 4 / 7 ? 1 : 0);
    const ripe = isMatureCrop(block);
    switch (familyBase(block)) {
      case WHEAT_CROP:
        return ripe ? [{ id: WHEAT, count: 1 }, { id: WHEAT_SEEDS, count: 1 + extra() }] : one(WHEAT_SEEDS);
      case CARROTS:
        return one(CARROT, ripe ? 2 + extra() : 1);
      case POTATOES:
        return one(POTATO, ripe ? 2 + extra() : 1);
      case BEETROOTS:
        return ripe ? [{ id: BEETROOT, count: 1 }, { id: BEETROOT_SEEDS, count: 1 + extra() }] : one(BEETROOT_SEEDS);
    }
    return [];
  }
  switch (block) {
    case STONE:
      return one(COBBLESTONE);
    case GRASS:
    case SNOWY_GRASS:
      return one(DIRT);
    case COAL_ORE:
      return one(COAL);
    case DIAMOND_ORE:
      return one(DIAMOND);
    case LAPIS_ORE:
      return one(LAPIS, rnd(4, 8));
    case REDSTONE_ORE:
      return one(REDSTONE, rnd(4, 5));
    case GRAVEL:
      return rand() < 0.1 ? one(FLINT) : one(GRAVEL);
    case CLAY:
      return one(CLAY_BALL, 4);
    case GLASS:
    case ICE:
      return [];
    case BOOKSHELF:
      return one(BOOK, 3);
    case SHORT_GRASS:
    case FERN:
      // Semillas de trigo con un 12,5 % de probabilidad.
      return rand() < 0.125 ? one(WHEAT_SEEDS) : [];
    case DEAD_BUSH:
      return rnd(0, 2) > 0 ? one(STICK, rnd(1, 2)) : [];
    case OAK_LEAVES:
    case BIRCH_LEAVES:
    case SPRUCE_LEAVES: {
      if (tool?.kind === 'shears') return one(block);
      const out: ItemStack[] = [];
      if (rand() < 0.05) out.push({ id: block === OAK_LEAVES ? OAK_SAPLING : block === BIRCH_LEAVES ? BIRCH_SAPLING : SPRUCE_SAPLING, count: 1 });
      if (block === OAK_LEAVES && rand() < 0.005) out.push({ id: APPLE, count: 1 });
      if (rand() < 0.02) out.push({ id: STICK, count: rnd(1, 2) });
      return out;
    }
  }
  return one(baseBlock(block));
}

/** Botín de las hojas al descomponerse solas (sin herramienta). */
export function leafDecayDrops(block: number, rand: () => number = Math.random): ItemStack[] {
  return blockDrops(block, 0, rand);
}
