// Programa lunar (idea-industria.md): la extracción. Registrados los últimos: ids nuevos.
// - Veta de hierro lunar: el mineral de los mares (basalto con ilmenita). Cada bloque guarda una reserva finita (logistics/veins) que
//   sólo el extractor va sacando poco a poco; picada a mano da un solo trozo y se pierde entera (es lo lento y caro a propósito).
// - Extractor eléctrico: 3×3 como el taladro de Factorio. Se pone sobre una veta (o sobre hielo sucio) y saca el mineral del área de
//   5×5 que tiene debajo. Consume energía (90 kW) y suelta lo que saca por delante: una cinta, un brazo, un cofre o una máquina.
// Sólo quedaba una capa de textura libre: la veta usa la de la mena de hierro y el extractor, chapa de hierro, cobre y horno.
import { family, L, familyBase } from './registry';
import { multiblock, multiInfo } from './multiblock';
import { mbox } from '../blockModels';
import { POWER_BLOCKS } from './powerBlocks';

export const MOON_IRON_VEIN = family('moon_iron_vein', 'Veta de hierro lunar', [], () => ({
  hardness: 5, tool: 'pickaxe' as const, tier: 0, sound: 'stone' as const, category: 'luna' as const, all: 'iron_ore',
}));

// Las demás vetas de la Luna (como las manchas de Factorio): cobre, carbón y piedra. Igual que la de hierro: una reserva finita por bloque
// que sólo saca el extractor; a mano dan un trozo. Y el petróleo: un pozo de un bloque que sólo aprovecha el pozo de petróleo (bomba).
export const MOON_COPPER_VEIN = family('moon_copper_vein', 'Veta de cobre lunar', [], () => ({
  hardness: 5, tool: 'pickaxe' as const, tier: 0, sound: 'stone' as const, category: 'luna' as const, all: 'copper_ore',
}));
export const MOON_COAL_VEIN = family('moon_coal_vein', 'Veta de carbón lunar', [], () => ({
  hardness: 4, tool: 'pickaxe' as const, tier: 0, sound: 'stone' as const, category: 'luna' as const, all: 'coal_ore',
}));
export const MOON_STONE_VEIN = family('moon_stone_vein', 'Veta de piedra lunar', [], () => ({
  hardness: 4, tool: 'pickaxe' as const, tier: 0, sound: 'stone' as const, category: 'luna' as const, all: 'andesite',
}));
export const MOON_OIL_WELL = family('moon_oil_well', 'Pozo de petróleo', [], () => ({
  hardness: 8, tool: 'pickaxe' as const, tier: 1, sound: 'stone' as const, category: 'luna' as const, all: 'coal_block',
}));

const six = (n: number) => [n, n, n, n, n, n];

/**
 * Extractor: 3×3 y 2 de alto, mirando al norte (−Z) en el modelo. `dir` (0 +x, 1 +z, 2 −x, 3 −z) es hacia dónde suelta lo que saca: la
 * boquilla de cobre asoma por ese lado, en el centro, dentro de UNA casilla.
 */
export const EXTRACTOR = multiblock({
  key: 'extractor', name: 'Extractor eléctrico', size: [3, 2, 3], anchor: [1, 0, 1], oriented: true,
  model: [
    // (cuerpos de hormigón liso: el bloque de hierro tiene borde y se vería a cuadros al repartirse en casillas)
    mbox(0, 0, 0, 48, 4, 48, six(L('polished_andesite'))),
    mbox(4, 4, 4, 44, 20, 44, [L('smooth_quartz'), L('smooth_quartz'), L('polished_andesite'), L('smooth_quartz'), L('smooth_quartz'), L('smooth_quartz')]),
    mbox(16, 20, 16, 32, 32, 32, [L('iron_block'), L('iron_block'), L('furnace_top'), L('iron_block'), L('iron_block'), L('iron_block')]),
    mbox(18, 6, 0, 30, 14, 4, six(L('copper_block'))),
    mbox(18, 6, 4, 30, 14, 8, six(L('copper_block'))),
  ],
  opts: { hardness: 3, tool: 'pickaxe' as const, tier: 0, sound: 'metal' as const, category: 'logistica' as const },
});

/** Sentido de un extractor si `id` es su casilla principal (null si no lo es o es otra casilla de la máquina). */
export function extractorInfo(id: number): { dir: number } | null {
  if (id <= 0 || familyBase(id) !== EXTRACTOR) return null;
  const i = multiInfo(id);
  return i && i.controller ? { dir: i.dir } : null;
}

// El extractor es eléctrico: entra en las redes de energía y sale en el inventario junto a las demás piezas.
(POWER_BLOCKS as number[]).push(EXTRACTOR);
/** Su sitio en el inventario creativo (la veta, con el suelo de la Luna; el extractor, con la logística). */
export const EXTRACTION_INVENTORY: readonly number[] = [MOON_IRON_VEIN, MOON_COPPER_VEIN, MOON_COAL_VEIN, MOON_STONE_VEIN, MOON_OIL_WELL, EXTRACTOR];
