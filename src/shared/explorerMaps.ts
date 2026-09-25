// Fase 7.5 (mansión): mapas de explorador del cartógrafo (el de la mansión del bosque y el del monumento
// oceánico). ADAPTADOR PEQUEÑO Y AUTÓNOMO: un mapa de explorador es un mapa normal (FILLED_MAP) cuyos
// datos dicen a qué estructura apunta ({ explore: { k, x, z } }); de ahí salen su nombre, su zona (a
// escala 1:4, 512×512 bloques, como los de Minecraft) y la marca que se dibuja encima.
//
// Al fusionar con la rama del océano, que trae un mecanismo genérico de mapas de estructura, basta con
// cambiar `explorerMap()` (lo que da el cartógrafo) y `explorerInfo()` (lo que leen el cliente y la
// descripción) para que usen aquel; el resto (ofertas y dibujo) sólo pasa por estas dos funciones.
import { FILLED_MAP, type ItemStack } from './items';

export interface ExplorerKind {
  /** Clave del mapa (la misma que la de la estructura en /localizar). */
  key: string;
  /** Nombre del mapa (el de Minecraft en español). */
  name: string;
  /** Marca que se dibuja en el destino. */
  icon: 'mansion' | 'monument';
}

export const EXPLORER_KINDS: Readonly<Record<string, ExplorerKind>> = {
  mansion: { key: 'mansion', name: 'Mapa de mansión del bosque', icon: 'mansion' },
  monument: { key: 'monument', name: 'Mapa de monumento oceánico', icon: 'monument' },
};

/** Escala (bloques por píxel) y lado (bloques) de un mapa de explorador. */
export const EXPLORER_SCALE = 4;
export const EXPLORER_SPAN = 128 * EXPLORER_SCALE;
/** Regiones de estructura en las que busca el cartógrafo (en Minecraft, 100). */
export const EXPLORER_SEARCH = 100;

export interface ExplorerTarget {
  k: string;
  x: number;
  z: number;
}

/** El mapa de explorador que apunta a la estructura `kind` de (x, z). */
export function explorerMap(kind: string, x: number, z: number): ItemStack {
  return { id: FILLED_MAP, count: 1, data: { explore: { k: kind, x: Math.floor(x), z: Math.floor(z) } } };
}

/** Destino de un mapa de explorador válido (undefined si los datos no valen). */
export function sanitizeExplore(raw: unknown): ExplorerTarget | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const k = String(r.k), x = Number(r.x), z = Number(r.z);
  if (!EXPLORER_KINDS[k] || !Number.isInteger(x) || !Number.isInteger(z) || Math.abs(x) > 3e7 || Math.abs(z) > 3e7) return undefined;
  return { k, x, z };
}

/** Esquina noroeste de la zona de un mapa de explorador que contiene (x, z) (rejilla de Minecraft). */
export function explorerOrigin(x: number, z: number): [number, number] {
  const cell = (v: number) => Math.floor((v + 64) / EXPLORER_SPAN) * EXPLORER_SPAN - 64;
  return [cell(x), cell(z)];
}

/** Lo que hace falta para dibujar un mapa de explorador (null si la pila no lo es). */
export function explorerInfo(s: ItemStack | null | undefined): (ExplorerTarget & { kind: ExplorerKind; x0: number; z0: number }) | null {
  const t = s?.id === FILLED_MAP ? s.data?.explore : undefined;
  if (!t || !EXPLORER_KINDS[t.k]) return null;
  const [x0, z0] = explorerOrigin(t.x, t.z);
  return { ...t, kind: EXPLORER_KINDS[t.k], x0, z0 };
}
