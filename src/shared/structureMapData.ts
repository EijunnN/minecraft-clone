// Fase 7.5 (océano): lo que un mapa de estructura lleva en sus datos (ItemData.smap) y cómo se valida.
// Va aparte de structureMaps.ts para que itemData.ts pueda validarlo sin cargar el generador del mundo.
import { WORLD_LIMIT } from './constants';

/** Tipos de mapa de estructura: tesoro enterrado y mapas de explorador (oceánico y de bosques). */
export type StructureMapKind = 'buried_treasure' | 'monument' | 'mansion';

/** Marca que se dibuja en el objetivo: una X roja, un monumento o una mansión. */
export type StructureMapMarker = 'x' | 'monument' | 'mansion';

export interface StructureMapDef {
  /** Clave de la estructura (la de locateStructure y /localizar). */
  structure: string;
  marker: StructureMapMarker;
  /** Nombre del objeto (el del mapa de Minecraft en español). */
  name: string;
  /** Regiones de la rejilla de estructuras en las que se busca (Minecraft: 50 chunks el tesoro, 100 los de explorador). */
  search: number;
  /**
   * Fase 7.5 (mansión): bloques por píxel del mapa (Minecraft: 1:2 el del tesoro, 1:4 los de explorador);
   * se dibuja con el estilo de exploración (tierra anaranjada y agua a rayas donde aún no se ha estado).
   */
  scale: number;
}

export const STRUCTURE_MAPS: Readonly<Record<StructureMapKind, StructureMapDef>> = {
  buried_treasure: { structure: 'buried_treasure', marker: 'x', name: 'Mapa del tesoro enterrado', search: 13, scale: 2 },
  // Fase 7.5 (mansión): los de explorador buscan en 100 regiones, como en Minecraft (el del tesoro, 50 chunks:
  // 13 regiones de 4 chunks).
  monument: { structure: 'monument', marker: 'monument', name: 'Mapa de explorador oceánico', search: 100, scale: 4 },
  mansion: { structure: 'mansion', marker: 'mansion', name: 'Mapa de explorador de bosques', search: 100, scale: 4 },
};

/**
 * Fase 7.5 (mansión): zona que muestra un mapa de estructura: esquina noroeste y escala. Como en Minecraft,
 * la rejilla de mapas de su escala (128·escala bloques) en la celda que contiene el objetivo.
 */
export function structureMapArea(kind: StructureMapKind, x: number, z: number): { x0: number; z0: number; scale: number; span: number } {
  const scale = STRUCTURE_MAPS[kind].scale, span = 128 * scale;
  const cell = (v: number) => Math.floor((v + 64) / span) * span - 64;
  return { x0: cell(x), z0: cell(z), scale, span };
}

/** Datos de un mapa de estructura: tipo y, ya resuelto, la posición del objetivo. */
export interface StructureMapData {
  k: StructureMapKind;
  x?: number;
  z?: number;
}

export function isStructureMapKind(k: unknown): k is StructureMapKind {
  return typeof k === 'string' && Object.prototype.hasOwnProperty.call(STRUCTURE_MAPS, k);
}

/** Datos válidos de un mapa de estructura (tipo conocido y objetivo dentro del mundo), o undefined. */
export function sanitizeStructureMap(raw: unknown): StructureMapData | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const r = raw as Record<string, unknown>;
  if (!isStructureMapKind(r.k)) return undefined;
  const x = Number(r.x), z = Number(r.z);
  if (!Number.isInteger(x) || !Number.isInteger(z) || Math.abs(x) > WORLD_LIMIT || Math.abs(z) > WORLD_LIMIT) return { k: r.k };
  return { k: r.k, x, z };
}
