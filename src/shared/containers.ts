// Contenedores (cofres y hornos): contenido, reglas de clic compartidas por cliente (predicción)
// y servidor (autoridad), y la lógica del horno.
import { ITEMS, BUCKET, LAVA_BUCKET, maxStack, sameKind, isValidItem, type ItemStack } from './items';
import { IRON_ORE, GOLD_ORE } from './blocks';

export const CHEST_SLOTS = 27;
export const FURNACE_IN = 0;
export const FURNACE_FUEL = 1;
export const FURNACE_OUT = 2;
/** Segundos por objeto fundido. */
export const COOK_TIME = 10;

export type ContainerKind = 'chest' | 'furnace';

export interface ContainerState {
  kind: ContainerKind;
  slots: (ItemStack | null)[];
  /** Horno: segundos de combustible restantes y duración del combustible actual. */
  burn: number;
  burnMax: number;
  /** Horno: progreso de fundición (0..COOK_TIME). */
  cook: number;
}

/** Cofre grande (dos mitades de cofre doble). */
export const DOUBLE_CHEST_SLOTS = CHEST_SLOTS * 2;

export function newContainer(kind: ContainerKind, size = kind === 'chest' ? CHEST_SLOTS : 3): ContainerState {
  return { kind, slots: new Array(size).fill(null), burn: 0, burnMax: 0, cook: 0 };
}

/** Tipos de horno: 0 horno, 1 ahumador (sólo comida), 2 alto horno (sólo minerales). */
export type FurnaceVariant = 0 | 1 | 2;
/** Lo que funde el alto horno. */
const BLAST_INPUTS = new Set([IRON_ORE, GOLD_ORE]);

/** ¿Funde este horno lo que hay en la entrada? */
export function variantSmelts(variant: FurnaceVariant, input: number): boolean {
  const result = smeltResult(input);
  if (result === undefined) return false;
  if (variant === 1) return !!ITEMS[result]?.food;
  if (variant === 2) return BLAST_INPUTS.has(input);
  return true;
}

export function cloneStack(s: ItemStack | null | undefined): ItemStack | null {
  if (!s || s.count <= 0) return null;
  const c: ItemStack = { id: s.id, count: s.count };
  if (s.dmg) c.dmg = s.dmg;
  return c;
}

/** Valida una pila recibida por la red. */
export function sanitizeStack(raw: unknown): ItemStack | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as { id?: unknown; count?: unknown; dmg?: unknown };
  const id = Number(r.id), count = Number(r.count), dmg = r.dmg === undefined ? 0 : Number(r.dmg);
  if (!Number.isInteger(id) || !isValidItem(id)) return null;
  if (!Number.isInteger(count) || count < 1 || count > maxStack(id)) return null;
  if (!Number.isInteger(dmg) || dmg < 0 || dmg > 10000) return null;
  const s: ItemStack = { id, count };
  if (dmg > 0) s.dmg = dmg;
  return s;
}

export function isFuel(id: number): boolean {
  return (ITEMS[id]?.fuel ?? 0) > 0;
}

export function smeltResult(id: number): number | undefined {
  return ITEMS[id]?.smelt;
}

/** ¿Se puede colocar esta pila en esa ranura? */
export function canPlace(kind: ContainerKind, slot: number, s: ItemStack | null): boolean {
  if (!s) return true;
  if (kind === 'chest') return true;
  if (slot === FURNACE_OUT) return false;
  if (slot === FURNACE_FUEL) return isFuel(s.id);
  return true;
}

/**
 * Clic en una ranura (btn 0 izquierdo, 1 derecho) con `cursor` en la mano.
 * Modifica `c.slots` y devuelve el nuevo cursor. No comparte referencias con la entrada.
 */
export function clickSlot(c: ContainerState, slot: number, btn: number, cursorIn: ItemStack | null): ItemStack | null {
  if (slot < 0 || slot >= c.slots.length) return cloneStack(cursorIn);
  let cursor = cloneStack(cursorIn);
  let cur = cloneStack(c.slots[slot]);
  const accept = canPlace(c.kind, slot, cursor);
  if (c.kind === 'furnace' && slot === FURNACE_OUT) {
    if (!cur) return cursor;
    if (!cursor) {
      c.slots[slot] = null;
      return cur;
    }
    if (sameKind(cursor, cur) && cursor.count + cur.count <= maxStack(cur.id)) {
      cursor.count += cur.count;
      c.slots[slot] = null;
    }
    return cursor;
  }
  if (btn === 0) {
    if (!cursor) {
      c.slots[slot] = null;
      return cur;
    }
    if (!cur) {
      if (!accept) return cursor;
      c.slots[slot] = cursor;
      return null;
    }
    if (sameKind(cur, cursor)) {
      const n = Math.min(maxStack(cur.id) - cur.count, cursor.count);
      cur.count += n;
      cursor.count -= n;
      c.slots[slot] = cur;
      return cursor.count > 0 ? cursor : null;
    }
    if (!accept) return cursor;
    c.slots[slot] = cursor;
    return cur;
  }
  // Botón derecho.
  if (!cursor) {
    if (!cur) return null;
    const half = Math.ceil(cur.count / 2);
    const take: ItemStack = { ...cur, count: half };
    cur.count -= half;
    c.slots[slot] = cur.count > 0 ? cur : null;
    return take;
  }
  if (!accept) return cursor;
  if (!cur) {
    c.slots[slot] = { ...cursor, count: 1 };
    cursor.count -= 1;
    return cursor.count > 0 ? cursor : null;
  }
  if (sameKind(cur, cursor)) {
    if (cur.count < maxStack(cur.id)) {
      cur.count++;
      cursor.count--;
      c.slots[slot] = cur;
    }
    return cursor.count > 0 ? cursor : null;
  }
  c.slots[slot] = cursor;
  cur = cloneStack(cur);
  return cur;
}

/** Mete una pila en el contenedor (mayúsculas + clic desde el inventario). Devuelve lo que sobra. */
export function insertStack(c: ContainerState, s: ItemStack | null): ItemStack | null {
  const rest = cloneStack(s);
  if (!rest) return null;
  const targets: number[] = [];
  if (c.kind === 'chest') for (let i = 0; i < c.slots.length; i++) targets.push(i);
  else {
    if (smeltResult(rest.id) !== undefined) targets.push(FURNACE_IN);
    else if (isFuel(rest.id)) targets.push(FURNACE_FUEL);
    else targets.push(FURNACE_IN);
  }
  // Primero completar pilas iguales, luego huecos libres.
  for (const i of targets) {
    const cur = c.slots[i];
    if (cur && sameKind(cur, rest)) {
      const n = Math.min(maxStack(cur.id) - cur.count, rest.count);
      if (n > 0) {
        c.slots[i] = { ...cur, count: cur.count + n };
        rest.count -= n;
        if (rest.count <= 0) return null;
      }
    }
  }
  for (const i of targets) {
    if (!c.slots[i] && canPlace(c.kind, i, rest)) {
      c.slots[i] = rest;
      return null;
    }
  }
  return rest;
}

/** Saca hasta `max` objetos de una ranura (mayúsculas + clic hacia el inventario). */
export function takeFromSlot(c: ContainerState, slot: number, max: number): ItemStack | null {
  const cur = c.slots[slot];
  if (!cur || max <= 0) return null;
  const n = Math.min(max, cur.count);
  const out: ItemStack = { ...cur, count: n };
  c.slots[slot] = cur.count - n > 0 ? { ...cur, count: cur.count - n } : null;
  return out;
}

/**
 * Avanza el horno dt segundos. Devuelve si cambió el contenido y si está encendido. El ahumador y el
 * alto horno van al doble de velocidad (y gastan el combustible al doble), pero sólo con lo suyo.
 */
export function furnaceTick(c: ContainerState, dt: number, variant: FurnaceVariant = 0): { changed: boolean; lit: boolean } {
  const wasLit = c.burn > 0;
  let changed = false;
  const input = c.slots[FURNACE_IN];
  const out = c.slots[FURNACE_OUT];
  const result = input && variantSmelts(variant, input.id) ? smeltResult(input.id) : undefined;
  const canSmelt = result !== undefined && (!out || (out.id === result && out.count < maxStack(result)));
  if (variant !== 0) dt *= 2;
  if (c.burn > 0) c.burn -= dt;
  if (c.burn <= 0 && canSmelt) {
    const fuel = c.slots[FURNACE_FUEL];
    const secs = fuel ? ITEMS[fuel.id]?.fuel ?? 0 : 0;
    if (fuel && secs > 0) {
      c.burnMax = secs;
      c.burn = Math.max(0, c.burn) + secs;
      if (fuel.id === LAVA_BUCKET) c.slots[FURNACE_FUEL] = { id: BUCKET, count: 1 };
      else c.slots[FURNACE_FUEL] = fuel.count > 1 ? { ...fuel, count: fuel.count - 1 } : null;
      changed = true;
    }
  }
  if (c.burn > 0 && canSmelt) {
    c.cook += dt;
    if (c.cook >= COOK_TIME) {
      c.cook = 0;
      const inp = c.slots[FURNACE_IN]!;
      c.slots[FURNACE_IN] = inp.count > 1 ? { ...inp, count: inp.count - 1 } : null;
      const o = c.slots[FURNACE_OUT];
      c.slots[FURNACE_OUT] = o ? { ...o, count: o.count + 1 } : { id: result!, count: 1 };
      changed = true;
    }
  } else if (c.cook > 0) {
    c.cook = Math.max(0, c.cook - dt * 2);
  }
  if (c.burn < 0) c.burn = 0;
  const lit = c.burn > 0;
  return { changed: changed || lit !== wasLit, lit };
}

/** Serialización compacta para guardar y enviar. */
export interface ContainerWire {
  k: 'c' | 'f';
  s: ([number, number] | [number, number, number] | null)[];
  b?: number;
  bm?: number;
  ck?: number;
}

export function containerToWire(c: ContainerState): ContainerWire {
  const w: ContainerWire = {
    k: c.kind === 'chest' ? 'c' : 'f',
    s: c.slots.map((s) => (s ? (s.dmg ? [s.id, s.count, s.dmg] : [s.id, s.count]) : null)),
  };
  if (c.kind === 'furnace') {
    w.b = Math.round(c.burn * 100) / 100;
    w.bm = c.burnMax;
    w.ck = Math.round(c.cook * 100) / 100;
  }
  return w;
}

export function containerFromWire(w: ContainerWire): ContainerState | null {
  if (!w || (w.k !== 'c' && w.k !== 'f') || !Array.isArray(w.s)) return null;
  const c = newContainer(w.k === 'c' ? 'chest' : 'furnace', w.k === 'c' && w.s.length === DOUBLE_CHEST_SLOTS ? DOUBLE_CHEST_SLOTS : undefined);
  for (let i = 0; i < c.slots.length; i++) {
    const s = w.s[i];
    c.slots[i] = Array.isArray(s) ? sanitizeStack({ id: s[0], count: s[1], dmg: s[2] }) : null;
  }
  if (c.kind === 'furnace') {
    c.burn = Number.isFinite(w.b) ? Math.max(0, w.b!) : 0;
    c.burnMax = Number.isFinite(w.bm) ? Math.max(0, w.bm!) : 0;
    c.cook = Number.isFinite(w.ck) ? Math.max(0, Math.min(COOK_TIME, w.ck!)) : 0;
  }
  return c;
}
