// Fase 6.5 (equipo): el equipo nuevo en el cliente.
// - Mechero: clic derecho en un bloque (enciende fuego en esa cara, o una vela o fogata apagadas).
// - Ballesta: se carga manteniendo el clic derecho (gasta una flecha) y queda cargada; el siguiente
//   clic dispara. Tridente: se mantiene para cargarlo y se suelta para lanzarlo (sale del inventario).
// - Cuerno de cabra (con enfriamiento), cohetes (sobre un bloque) y la caña con zanahoria (acelerón
//   del cerdo que se monta).
// - Armaduras: la de caballo se pone a un caballo domado (agachado y con la mano vacía se quita); la
//   de lobo, al lobo propio (con tijeras se le quita).
import type { RayHit } from './raycast';
import type { ClientEntity } from './ClientEntities';
import type { Interaction } from './interaction';
import type { Game } from './Game';
import type { Use } from './gameTypes';
import {
  ITEMS, SHEARS, FLINT_AND_STEEL, CROSSBOW, CROSSBOW_CHARGED, TRIDENT, GOAT_HORN, FIREWORK_ROCKET, CARROT_ON_A_STICK,
  WOLF_ARMOR, HORSE_ARMOR, type ItemStack,
} from '../../shared/items';
import { MOB_HORSE, MOB_WOLF, MOB_PIG } from '../../shared/mobs';
import { EF_TAMED, EF_BABY } from '../../shared/protocol';
import { CROSSBOW_CHARGE, TRIDENT_MIN_CHARGE, GOAT_HORN_COOLDOWN } from '../../shared/equipment';
import { hasArrows, takeArrow, LOADED_TIPPED } from './potionClient'; // Fase 7 (pociones)

const HORSE_ARMORS = new Set(Object.values(HORSE_ARMOR));
/** Momento (ms) en que se podrá volver a tocar el cuerno. */
let hornReady = 0;

/** Pide algo al servidor que responde con 'ires' (lo que se gasta o se desgasta de la mano). */
function ask(ia: Interaction, g: Game, item: number, send: (q: number) => void): void {
  const q = ++ia.interactQ;
  ia.pendingInteract.set(q, { slot: g.selected, item });
  if (ia.pendingInteract.size > 32) ia.pendingInteract.delete(ia.pendingInteract.keys().next().value!);
  send(q);
}

/** Clic derecho con el equipo nuevo; true si lo atendió (y el resto de la interacción no sigue). */
export function equipmentUse(
  g: Game, ia: Interaction, pressed: boolean, hit: RayHit | null, target: ClientEntity | null, held: ItemStack | null,
): boolean {
  if (!pressed) return false;
  const heldId = held?.id ?? 0;
  // Armaduras sobre caballos y lobos.
  if (target && target.deathT < 0) {
    const baby = (target.flags & EF_BABY) !== 0;
    if (target.type === MOB_HORSE && HORSE_ARMORS.has(heldId)) {
      if (!(target.flags & EF_TAMED) || baby) g.ui.toast('Primero tienes que domarlo.');
      else if (!target.gear) ia.interactEntity(target, heldId);
      return true;
    }
    if (target.type === MOB_HORSE && !heldId && g.player.sneaking && target.gear) {
      ia.interactEntity(target, 0);
      return true;
    }
    if (target.type === MOB_WOLF && heldId === WOLF_ARMOR) {
      if (!target.gear && !baby) {
        ask(ia, g, heldId, (q) => g.net?.send({ t: 'interact', e: target.id, item: heldId, q, ...(held?.dmg ? { d: held.dmg } : {}) }));
        g.swing(true);
      }
      return true;
    }
    if (target.type === MOB_WOLF && heldId === SHEARS && target.gear === WOLF_ARMOR) {
      ia.interactEntity(target, SHEARS);
      return true;
    }
  }
  if (!held) return false;
  switch (heldId) {
    case FLINT_AND_STEEL:
      if (!hit) return false;
      ask(ia, g, heldId, (q) => g.net?.send({ t: 'ignite', x: hit.x, y: hit.y, z: hit.z, n: [hit.nx, hit.ny, hit.nz], q }));
      g.swing(true);
      return true;
    case CROSSBOW:
      if (g.creative || hasArrows(g)) { // Fase 7 (pociones): también flechas con efecto
        ia.use = { kind: 'crossbow', t: 0, slot: g.selected, item: heldId, soundT: 0 };
        g.audio.playEquipSfx('crossbow_loading', [g.player.x, g.player.eyeY, g.player.z]);
      }
      return true;
    case CROSSBOW_CHARGED:
      fireCrossbow(g, ia, held);
      return true;
    case TRIDENT:
      ia.use = { kind: 'trident', t: 0, slot: g.selected, item: heldId, soundT: 0 };
      return true;
    case GOAT_HORN: {
      const now = performance.now();
      if (now < hornReady) return true;
      hornReady = now + GOAT_HORN_COOLDOWN * 1000;
      g.net?.send({ t: 'horn', v: held.dmg || 1 });
      g.swing(false);
      return true;
    }
    case FIREWORK_ROCKET:
      if (!hit) return true;
      g.net?.send({
        t: 'throw', item: heldId, p: [hit.px + hit.nx * 0.15, hit.py + hit.ny * 0.15, hit.pz + hit.nz * 0.15], d: [0, 1, 0],
        ...(held.dmg ? { w: held.dmg } : {}),
      });
      if (!g.creative) g.inv.consume(g.selected, 1);
      g.swing(false);
      return true;
    case CARROT_ON_A_STICK: {
      const mount = g.riding.active ? g.ents.list.get(g.riding.entityId) : undefined;
      if (mount?.type === MOB_PIG) {
        ask(ia, g, heldId, (q) => g.net?.send({ t: 'boost', q }));
        g.swing(false);
      }
      return true;
    }
  }
  return false;
}

/** Disparar la ballesta cargada: sale el virote y vuelve a estar descargada (con un uso menos). */
function fireCrossbow(g: Game, ia: Interaction, held: ItemStack): void {
  const p = g.player;
  const cp = Math.cos(p.pitch);
  const d = [-Math.sin(p.yaw) * cp, Math.sin(p.pitch), -Math.cos(p.yaw) * cp];
  const ap = LOADED_TIPPED.get(held); // Fase 7 (pociones): cargada con una flecha con efecto
  g.net?.send({ t: 'shoot', p: [p.x + d[0] * 0.3, p.eyeY - 0.1, p.z + d[2] * 0.3], d: [d[0], d[1], d[2]], f: 1, c: 1, ...(ap !== undefined ? { ap } : {}) });
  g.inv.set(g.selected, { id: CROSSBOW, count: 1, ...(held.dmg ? { dmg: held.dmg } : {}) });
  ia.wearHeld(1);
  g.swing(false);
  g.shake = Math.max(g.shake, 0.15);
}

/** Mientras se mantiene el clic: la ballesta termina de cargarse (gasta una flecha). */
export function equipmentHold(g: Game, ia: Interaction, u: Use): void {
  if (u.kind !== 'crossbow' || u.t < CROSSBOW_CHARGE) return;
  const s = g.inv.get(u.slot);
  ia.use = null;
  if (!s || s.id !== CROSSBOW) return;
  // Fase 7 (pociones): la primera flecha que haya; si es con efecto, la ballesta la recuerda.
  const ap = takeArrow(g);
  if (ap === null) return;
  const charged: ItemStack = { id: CROSSBOW_CHARGED, count: 1, ...(s.dmg ? { dmg: s.dmg } : {}) };
  if (ap >= 0) LOADED_TIPPED.set(charged, ap);
  g.inv.set(u.slot, charged);
  g.audio.playEquipSfx('crossbow_load', [g.player.x, g.player.eyeY, g.player.z]);
}

/** Al soltar el clic: el tridente cargado sale lanzado (y deja el inventario). */
export function equipmentRelease(g: Game, u: Use, dir: number[], stillHeld: boolean): void {
  if (u.kind !== 'trident' || !stillHeld || u.t < TRIDENT_MIN_CHARGE) return;
  const s = g.inv.get(u.slot);
  if (!s || s.id !== TRIDENT) return;
  const p = g.player;
  g.net?.send({ t: 'throw', item: TRIDENT, p: [p.x + dir[0] * 0.3, p.eyeY - 0.1, p.z + dir[2] * 0.3], d: [dir[0], dir[1], dir[2]], ...(s.dmg ? { w: s.dmg } : {}) });
  if (!g.creative) g.inv.set(u.slot, null);
  g.swing(false);
}

/** Cómo se ve en la mano y en el cuerpo lo que se está usando (la ballesta y el tridente, como el arco). */
export function useLook(u: Use | null): { kind: 'eat' | 'bow' | 'block' | 'none'; amount: number } {
  if (!u || u.kind === 'spyglass') return { kind: 'none', amount: 0 };
  if (u.kind === 'crossbow') return { kind: 'bow', amount: Math.min(1, u.t / CROSSBOW_CHARGE) };
  if (u.kind === 'trident') return { kind: 'bow', amount: Math.min(1, u.t / TRIDENT_MIN_CHARGE) };
  if (u.kind === 'bow') return { kind: 'bow', amount: Math.min(1, u.t) };
  if (u.kind === 'block') return { kind: 'block', amount: u.t };
  return { kind: 'eat', amount: u.t / 1.6 };
}

/** Lo que no se gasta al picar ni al golpear (sólo con su propio uso). */
export const EQUIPMENT_WEARLESS = ['crossbow', 'lighter', 'carrot_stick', 'body_armor'] as const;

/** ¿Es un objeto del equipo que usa el clic derecho? (para que la mano secundaria no se adelante). */
export function equipmentUses(id: number): boolean {
  return id === FLINT_AND_STEEL || id === CROSSBOW || id === CROSSBOW_CHARGED || id === TRIDENT || id === GOAT_HORN ||
    id === FIREWORK_ROCKET || id === CARROT_ON_A_STICK || ITEMS[id]?.tool?.kind === 'body_armor';
}
