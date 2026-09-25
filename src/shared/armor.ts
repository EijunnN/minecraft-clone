// Armaduras: piezas, materiales y la reducción de daño de Minecraft (Java 1.9+).

/** Ranura de armadura: 0 cabeza, 1 pecho, 2 piernas, 3 pies. */
export type ArmorSlot = 0 | 1 | 2 | 3;
export const ARMOR_SLOTS = 4;
export const ARMOR_PIECES = ['helmet', 'chestplate', 'leggings', 'boots'] as const;
export type ArmorPiece = (typeof ARMOR_PIECES)[number];
export const ARMOR_MATERIALS = ['leather', 'iron', 'golden', 'diamond'] as const;
/** Fase 6.5 (cobre): va aparte para que el bucle de items.ts no mueva los ids de los objetos guardados. */
export const COPPER_ARMOR = 'copper';
/** Fase 6.5 (equipo): cota de malla (no se fabrica) y caparazón de tortuga (sólo el casco). */
export const CHAINMAIL_ARMOR = 'chainmail';
export const TURTLE_ARMOR = 'turtle';
export type ArmorMaterial = (typeof ARMOR_MATERIALS)[number] | typeof COPPER_ARMOR | typeof CHAINMAIL_ARMOR | typeof TURTLE_ARMOR;
/** Todos los materiales de armadura (los de siempre, el cobre, la cota de malla y la tortuga). */
export const ALL_ARMOR_MATERIALS: readonly ArmorMaterial[] = [...ARMOR_MATERIALS, COPPER_ARMOR, CHAINMAIL_ARMOR, TURTLE_ARMOR];

export interface ArmorInfo {
  slot: ArmorSlot;
  material: ArmorMaterial;
  /** Puntos de armadura (medias corazas del HUD). */
  points: number;
  /** Dureza (sólo el diamante en Minecraft). */
  toughness: number;
  /** Usos antes de romperse. */
  durability: number;
}

/** Valores de Minecraft: [casco, peto, grebas, botas] de puntos y durabilidad, y la dureza. */
export const ARMOR_STATS: Readonly<Record<ArmorMaterial, { points: readonly number[]; durability: readonly number[]; toughness: number }>> = {
  leather: { points: [1, 3, 2, 1], durability: [55, 80, 75, 65], toughness: 0 },
  golden: { points: [2, 5, 3, 1], durability: [77, 112, 105, 91], toughness: 0 },
  iron: { points: [2, 6, 5, 2], durability: [165, 240, 225, 195], toughness: 0 },
  diamond: { points: [3, 8, 6, 3], durability: [363, 528, 495, 429], toughness: 2 },
  copper: { points: [2, 4, 3, 1], durability: [121, 176, 165, 143], toughness: 0 }, // Fase 6.5 (cobre)
  chainmail: { points: [2, 5, 4, 1], durability: [165, 240, 225, 195], toughness: 0 }, // Fase 6.5 (equipo)
  turtle: { points: [2, 0, 0, 0], durability: [275, 0, 0, 0], toughness: 0 }, // Fase 6.5 (equipo): sólo el casco
};

/** Causas de daño que la armadura no reduce (como en Minecraft). */
export const ARMOR_BYPASS: ReadonlySet<string> = new Set(['fall', 'void', 'suffocate', 'drown', 'starve', 'kill', 'poison', 'wither']);

/**
 * Daño tras la armadura (fórmula de Minecraft):
 * daño × (1 − min(20, max(puntos / 5, puntos − 4·daño / (dureza + 8))) / 25).
 */
export function armorReduce(damage: number, points: number, toughness: number): number {
  const eff = Math.min(20, Math.max(points / 5, points - (4 * damage) / (toughness + 8)));
  return damage * (1 - eff / 25);
}

/** Desgaste de cada pieza puesta al recibir un golpe de `damage` (mínimo 1). */
export function armorWear(damage: number): number {
  return Math.max(1, Math.floor(damage / 4));
}
