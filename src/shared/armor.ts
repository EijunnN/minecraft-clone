// Armaduras: piezas, materiales y la reducción de daño de Minecraft (Java 1.9+).

/** Ranura de armadura: 0 cabeza, 1 pecho, 2 piernas, 3 pies. */
export type ArmorSlot = 0 | 1 | 2 | 3;
export const ARMOR_SLOTS = 4;
export const ARMOR_PIECES = ['helmet', 'chestplate', 'leggings', 'boots'] as const;
export type ArmorPiece = (typeof ARMOR_PIECES)[number];
export const ARMOR_MATERIALS = ['leather', 'iron', 'golden', 'diamond'] as const;
export type ArmorMaterial = (typeof ARMOR_MATERIALS)[number];

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
};

/** Causas de daño que la armadura no reduce (como en Minecraft). */
export const ARMOR_BYPASS: ReadonlySet<string> = new Set(['fall', 'void', 'suffocate', 'drown', 'starve', 'kill']);

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
