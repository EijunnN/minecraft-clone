// Constantes y tipos que comparten Game y sus controladores.
import { GRASS, DIRT, SNOWY_GRASS, ALL_SAPLINGS } from '../../shared/blocks';

export const REACH_CREATIVE = 5.5;
export const REACH_SURVIVAL = 4.6;
export const ATTACK_REACH = 3.4;
export const SOIL = new Set([GRASS, DIRT, SNOWY_GRASS]);
export const SAPLINGS = new Set(ALL_SAPLINGS);

export interface Mining {
  x: number;
  y: number;
  z: number;
  id: number;
  progress: number;
  hitT: number;
}

export interface Use {
  /** Comer o beber, tensar el arco o cubrirse con el escudo (fase 6.5: mirar por el catalejo). */
  kind: 'eat' | 'bow' | 'block' | 'spyglass';
  t: number;
  slot: number;
  item: number;
  soundT: number;
}

/** Color de camiseta aclarado para el nombre en el chat. */
export function lighten(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.round(c + (255 - c) * 0.45);
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}
