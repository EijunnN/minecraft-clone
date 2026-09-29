// Fase 6.5 (materiales): lo que sueltan las menas de hierro y oro (el mineral en bruto, como en
// Minecraft 1.17+) y los bloques nuevos que no se sueltan a sí mismos. drops.ts lo consulta antes de
// sus reglas; null = no es asunto de este módulo.
import {
  IRON_ORE, GOLD_ORE, MOON_IRON_VEIN, MOON_COPPER_VEIN, MOON_COAL_VEIN, MOON_STONE_VEIN, MOON_OIL_WELL, COBBLESTONE, DIRT, BLUE_ICE, PODZOL, DIRT_PATH, POWDER_SNOW, FROGSPAWN, isCandleCake, candleOfCake,
} from '../blocks';
import { RAW_IRON, RAW_GOLD, RAW_COPPER, COAL, itemForBlock, type ItemStack } from '../items';

export function materialDrops(block: number): ItemStack[] | null {
  switch (block) {
    case IRON_ORE:
      return [{ id: RAW_IRON, count: 1 }];
    case GOLD_ORE:
      return [{ id: RAW_GOLD, count: 1 }];
    // Programa lunar: a mano, una veta da un solo trozo y se pierde entera; el extractor es quien la aprovecha.
    case MOON_IRON_VEIN:
      return [{ id: RAW_IRON, count: 1 }];
    case MOON_COPPER_VEIN:
      return [{ id: RAW_COPPER, count: 1 }];
    case MOON_COAL_VEIN:
      return [{ id: COAL, count: 1 }];
    case MOON_STONE_VEIN:
      return [{ id: itemForBlock(COBBLESTONE) || COBBLESTONE, count: 1 }];
    case MOON_OIL_WELL:
      return []; // un pozo no se pica: se bombea
    // Podsol y camino de tierra: tierra (sin toque de seda).
    case PODZOL:
    case DIRT_PATH:
      return [{ id: DIRT, count: 1 }];
    // Hielo azul (sólo con toque de seda), nieve polvo (se recoge con el cubo) y huevos de rana.
    case BLUE_ICE:
    case POWDER_SNOW:
    case FROGSPAWN:
      return [];
  }
  // La tarta con vela suelta sólo la vela (la tarta se pierde).
  if (isCandleCake(block)) return [{ id: candleOfCake(block), count: 1 }];
  return null;
}
