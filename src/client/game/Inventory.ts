// Inventario del jugador: 36 ranuras (0–8 barra rápida, 9–35 mochila) y la pila del cursor.
import { ITEMS, maxStack, sameKind, isValidItem, type ItemStack } from '../../shared/items';
import { stackToWire, stackFromWire, type WireStack } from '../../shared/protocol';
import { cloneStack } from '../../shared/containers';

export const INV_SIZE = 36;
export const HOTBAR = 9;

export class Inventory {
  slots: (ItemStack | null)[] = new Array(INV_SIZE).fill(null);
  cursor: ItemStack | null = null;
  /** Aumenta con cada cambio (para refrescar la interfaz y guardar). */
  version = 0;

  changed(): void {
    this.version++;
  }

  get(i: number): ItemStack | null {
    return this.slots[i] ?? null;
  }

  set(i: number, s: ItemStack | null): void {
    this.slots[i] = s && s.count > 0 ? s : null;
    this.changed();
  }

  /** Cuántos objetos de esta pila caben. */
  room(s: ItemStack): number {
    let n = 0;
    const max = maxStack(s.id);
    for (const cur of this.slots) {
      if (!cur) n += max;
      else if (sameKind(cur, s)) n += Math.max(0, max - cur.count);
      if (n >= s.count) return s.count;
    }
    return Math.min(n, s.count);
  }

  /**
   * Añade una pila: primero completa pilas iguales (barra y luego mochila) y después ocupa
   * huecos (barra primero). Devuelve lo que no cupo.
   */
  add(stack: ItemStack | null, preferSlot = -1): ItemStack | null {
    const rest = cloneStack(stack);
    if (!rest) return null;
    const max = maxStack(rest.id);
    for (let i = 0; i < INV_SIZE && rest.count > 0; i++) {
      const cur = this.slots[i];
      if (cur && sameKind(cur, rest) && cur.count < max) {
        const n = Math.min(max - cur.count, rest.count);
        cur.count += n;
        rest.count -= n;
      }
    }
    if (rest.count > 0 && preferSlot >= 0 && !this.slots[preferSlot]) {
      const n = Math.min(max, rest.count);
      this.slots[preferSlot] = { ...rest, count: n };
      rest.count -= n;
    }
    for (let i = 0; i < INV_SIZE && rest.count > 0; i++) {
      if (!this.slots[i]) {
        const n = Math.min(max, rest.count);
        this.slots[i] = { ...rest, count: n };
        rest.count -= n;
      }
    }
    this.changed();
    return rest.count > 0 ? rest : null;
  }

  /** Añade en un rango de ranuras (para mayúsculas + clic entre barra y mochila). */
  addRange(stack: ItemStack, from: number, to: number): ItemStack | null {
    const rest = { ...stack };
    const max = maxStack(rest.id);
    for (let i = from; i < to && rest.count > 0; i++) {
      const cur = this.slots[i];
      if (cur && sameKind(cur, rest) && cur.count < max) {
        const n = Math.min(max - cur.count, rest.count);
        cur.count += n;
        rest.count -= n;
      }
    }
    for (let i = from; i < to && rest.count > 0; i++) {
      if (!this.slots[i]) {
        const n = Math.min(max, rest.count);
        this.slots[i] = { ...rest, count: n };
        rest.count -= n;
      }
    }
    this.changed();
    return rest.count > 0 ? rest : null;
  }

  count(id: number): number {
    let n = 0;
    for (const s of this.slots) if (s && s.id === id) n += s.count;
    return n;
  }

  /** Quita n objetos del tipo id (primero de la mochila). Devuelve cuántos quitó. */
  remove(id: number, n: number): number {
    let left = n;
    for (let i = INV_SIZE - 1; i >= 0 && left > 0; i--) {
      const s = this.slots[i];
      if (!s || s.id !== id) continue;
      const k = Math.min(left, s.count);
      s.count -= k;
      left -= k;
      if (s.count <= 0) this.slots[i] = null;
    }
    this.changed();
    return n - left;
  }

  /** Gasta objetos de una ranura. */
  consume(i: number, n = 1): void {
    const s = this.slots[i];
    if (!s) return;
    s.count -= n;
    if (s.count <= 0) this.slots[i] = null;
    this.changed();
  }

  /** Desgasta la herramienta de una ranura. Devuelve true si se rompió. */
  wear(i: number, amount = 1): boolean {
    const s = this.slots[i];
    const tool = s ? ITEMS[s.id]?.tool : undefined;
    if (!s || !tool) return false;
    s.dmg = (s.dmg ?? 0) + amount;
    this.changed();
    if (s.dmg >= tool.durability) {
      this.slots[i] = null;
      return true;
    }
    return false;
  }

  /** Vacía el inventario (y el cursor) y devuelve todo lo que había. */
  takeAll(): ItemStack[] {
    const out: ItemStack[] = [];
    for (let i = 0; i < INV_SIZE; i++) {
      if (this.slots[i]) out.push(this.slots[i]!);
      this.slots[i] = null;
    }
    if (this.cursor) out.push(this.cursor);
    this.cursor = null;
    this.changed();
    return out;
  }

  toWire(): (WireStack | null)[] {
    const out = this.slots.map((s) => stackToWire(s));
    while (out.length && out[out.length - 1] === null) out.pop();
    return out;
  }

  fromWire(w: (WireStack | null)[] | undefined): void {
    this.slots = new Array(INV_SIZE).fill(null);
    if (Array.isArray(w)) {
      for (let i = 0; i < Math.min(INV_SIZE, w.length); i++) {
        const s = stackFromWire(w[i]);
        if (s && isValidItem(s.id) && s.count > 0) this.slots[i] = { ...s, count: Math.min(s.count, maxStack(s.id)) };
      }
    }
    this.cursor = null;
    this.changed();
  }
}
