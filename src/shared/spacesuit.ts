// Programa lunar (idea-luna.md §4.1): el traje espacial y el oxígeno. Sin nada del cliente: las cuentas, para que se puedan probar.
//
// - El traje son cuatro piezas (casco, pechera, pantalones y botas): sólo sella con las cuatro puestas.
// - Lleva un depósito de SUIT_TANK uO en la mochila. Se respira 0,5 uO/s (el número de idea-luna.md): 10 minutos.
// - Las botellas de oxígeno (600 uO, 20 minutos) van en el inventario; cuando el depósito baja de la reserva, el traje tira de la
//   botella más vacía que aún tenga (así se acaban de una en una y quedan llenas las demás). Lo gastado de cada botella va en su
//   desgaste (`dmg`): 0 llena, BOTTLE_UO vacía.
// - Se rellena todo (el depósito y las botellas) donde hay aire: en la cabina del cohete y en la Tierra.
// - Sin traje sellado o con todo vacío, la barra de aire de siempre baja como bajo el agua (15 s) y luego hace daño.
import type { ItemStack } from './items';

/** Lo que cabe en el depósito del traje (uO): 10 minutos. */
export const SUIT_TANK = 300;
/** Lo que cabe en una botella (uO): 20 minutos. */
export const BOTTLE_UO = 600;
/** Lo que respira un jugador (uO/s). */
export const BREATH_UO = 0.5;
/** Cuánto se rellena por segundo donde hay aire (el depósito y cada botella). */
export const REFILL_UO = 40;
/** Por debajo de esto el traje conecta una botella y rellena el depósito con ella. */
const RESERVE = SUIT_TANK * 0.25;

/** Dónde está quien respira: con aire alrededor, en la cabina de un cohete o en el vacío. */
export type Surroundings = 'air' | 'cabin' | 'vacuum';

/** ¿Es una botella de oxígeno? (el id lo pone items.ts al registrarla). */
let bottleId = -1;
export function setOxygenBottleId(id: number): void {
  bottleId = id;
}
export const isOxygenBottle = (id: number): boolean => id === bottleId && id > 0;

/** Las cuatro piezas del traje, por ranura (casco, torso, piernas, botas): las pone items.ts. */
let suitPieces: readonly number[] = [];
export function setSuitPieces(ids: readonly number[]): void {
  suitPieces = ids;
}

/** ¿Sella el traje? (las cuatro piezas puestas, cada una en su ranura). */
export function suitSealed(armor: readonly (ItemStack | null)[]): boolean {
  return suitPieces.length === 4 && suitPieces.every((id, slot) => armor[slot]?.id === id);
}

/** ¿Lleva alguna pieza del traje? */
export function wearsSuitPiece(armor: readonly (ItemStack | null)[]): boolean {
  return armor.some((s) => !!s && suitPieces.includes(s.id));
}

/** uO que le quedan a una botella. */
export function bottleLeft(s: ItemStack | null | undefined): number {
  if (!s || !isOxygenBottle(s.id)) return 0;
  return Math.max(0, BOTTLE_UO - (s.dmg ?? 0));
}

function setBottleLeft(s: ItemStack, left: number): void {
  const dmg = Math.round(BOTTLE_UO - Math.max(0, Math.min(BOTTLE_UO, left)));
  if (dmg > 0) s.dmg = dmg;
  else delete s.dmg;
}

export interface OxygenResult {
  /** El depósito del traje (uO) después del paso. */
  tank: number;
  /** ¿Respira? (con aire alrededor, en la cabina o con el traje sellado y oxígeno). Si no, baja la barra de aire. */
  breathing: boolean;
  /** ¿Ha cambiado alguna botella? (para mandar el inventario). */
  bottlesChanged: boolean;
}

/**
 * Un paso de `dt` segundos. `sealed`: lleva las cuatro piezas del traje. `slots`: el inventario (las botellas se gastan o se llenan
 * en su sitio; lo demás no se toca). Los valores de las botellas se redondean a uO enteras (van en `dmg`).
 */
export function oxygenStep(tank: number, dt: number, where: Surroundings, sealed: boolean, slots: (ItemStack | null)[]): OxygenResult {
  let changed = false;
  if (where !== 'vacuum') {
    // Con aire: se llena el depósito (si lleva el traje) y las botellas que se lleven.
    if (sealed) tank = Math.min(SUIT_TANK, tank + REFILL_UO * dt);
    for (const s of slots) {
      if (!s || !isOxygenBottle(s.id) || !s.dmg) continue;
      const before = s.dmg;
      setBottleLeft(s, Math.ceil(bottleLeft(s) + REFILL_UO * dt)); // (hacia arriba: con muchos fps no se queda en el sitio)
      if ((s.dmg ?? 0) !== before) changed = true;
    }
    return { tank, breathing: true, bottlesChanged: changed };
  }
  if (!sealed) return { tank, breathing: false, bottlesChanged: false };
  // En el vacío con el traje: se respira del depósito y, si baja de la reserva, se pasa oxígeno de una botella.
  tank = Math.max(0, tank - BREATH_UO * dt);
  if (tank < RESERVE) {
    let from: ItemStack | null = null;
    for (const s of slots) {
      const left = bottleLeft(s);
      if (left > 0 && (!from || left < bottleLeft(from))) from = s;
    }
    if (from) {
      // Se pasa de una vez, en uO enteras (lo que cabe en el desgaste): hasta llenar el depósito o vaciar la botella.
      const moved = Math.min(bottleLeft(from), Math.floor(SUIT_TANK - tank));
      if (moved > 0) {
        setBottleLeft(from, bottleLeft(from) - moved);
        tank += moved;
        changed = true;
      }
    }
  }
  return { tank, breathing: tank > 0, bottlesChanged: changed };
}

/** Oxígeno total que se lleva (depósito y botellas) y los segundos que da respirando. */
export function oxygenTotal(tank: number, slots: readonly (ItemStack | null)[]): { uo: number; seconds: number } {
  let uo = tank;
  for (const s of slots) uo += bottleLeft(s);
  return { uo, seconds: uo / BREATH_UO };
}
