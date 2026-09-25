// Fase 6.5 (calderos): qué pasa al usar un objeto sobre un caldero. Lo usan el cliente (para predecirlo y
// cambiar lo que lleva en la mano) y el servidor (que cambia el bloque).
import {
  BANNERS, cauldronFill, cauldronOf, CAULDRON_EMPTY, CAULDRON_WATER, CAULDRON_LAVA, CAULDRON_SNOW,
} from './blocks';
import { BUCKET, WATER_BUCKET, LAVA_BUCKET, POWDER_SNOW_BUCKET, type ItemStack } from './items';
import { bannerLayers } from './bannerPatterns';

const BANNER_ITEMS = new Set<number>(Object.values(BANNERS));

export interface CauldronResult {
  /** El caldero después. */
  block: number;
  /** Lo que queda en la mano (null: nada; undefined: no cambia). */
  held?: ItemStack | null;
  /** Sonido: llenar, vaciar o lavar. */
  sound: 'fill' | 'empty' | 'wash';
}

/** Resultado de usar `held` sobre el caldero `id`, o null si no hace nada. */
export function cauldronUse(id: number, held: ItemStack | null): CauldronResult | null {
  const f = cauldronFill(id);
  if (!f || !held) return null;
  const item = held.id;
  const full = f.level >= 3;
  // Cubos llenos: se vacían en el caldero (el agua y la nieve polvo, también sobre lo mismo a medias).
  if (item === WATER_BUCKET && (f.kind === CAULDRON_EMPTY || f.kind === CAULDRON_WATER) && !full) {
    return { block: cauldronOf(CAULDRON_WATER, 3), held: { id: BUCKET, count: 1 }, sound: 'empty' };
  }
  if (item === LAVA_BUCKET && f.kind === CAULDRON_EMPTY) return { block: cauldronOf(CAULDRON_LAVA, 3), held: { id: BUCKET, count: 1 }, sound: 'empty' };
  if (item === POWDER_SNOW_BUCKET && (f.kind === CAULDRON_EMPTY || f.kind === CAULDRON_SNOW) && !full) {
    return { block: cauldronOf(CAULDRON_SNOW, 3), held: { id: BUCKET, count: 1 }, sound: 'empty' };
  }
  // Cubo vacío: se llena si el caldero está lleno.
  if (item === BUCKET && held.count === 1 && full) {
    const give = f.kind === CAULDRON_WATER ? WATER_BUCKET : f.kind === CAULDRON_LAVA ? LAVA_BUCKET : f.kind === CAULDRON_SNOW ? POWDER_SNOW_BUCKET : 0;
    if (give) return { block: cauldronOf(CAULDRON_EMPTY, 0), held: { id: give, count: 1 }, sound: 'fill' };
  }
  // Estandarte con dibujos en el agua: se lava la última capa (y baja un nivel).
  if (BANNER_ITEMS.has(item) && f.kind === CAULDRON_WATER && f.level > 0) {
    const layers = bannerLayers(held);
    if (layers.length === 0 || held.count !== 1) return null;
    const rest = layers.slice(0, -1);
    const washed: ItemStack = { ...held, count: 1, data: rest.length ? { ...held.data, layers: rest } : undefined };
    if (!washed.data) delete washed.data;
    return { block: cauldronOf(CAULDRON_WATER, f.level - 1), held: washed, sound: 'wash' };
  }
  return null;
}

/** En el servidor (que no ve las capas del estandarte de la mano): el caldero tras usar `item`, o -1. */
export function cauldronUseServer(id: number, item: number): number {
  const f = cauldronFill(id);
  if (!f) return -1;
  if (BANNER_ITEMS.has(item)) return f.kind === CAULDRON_WATER && f.level > 0 ? cauldronOf(CAULDRON_WATER, f.level - 1) : -1;
  return cauldronUse(id, { id: item, count: 1 })?.block ?? -1;
}
