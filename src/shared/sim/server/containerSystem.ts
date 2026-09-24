// Cofres y hornos compartidos: estado por posición, operaciones de los jugadores (clic, meter,
// sacar), hornos que funden solos, contenido que cae al romperlos y persistencia.
import { FURNACE, FURNACE_LIT, isContainer, isChest, isFurnace, blockFacing } from '../../blocks';
import type { ClientMsg, ServerMsg } from '../../protocol';
import type { ItemStack } from '../../items';
import {
  newContainer, clickSlot, insertStack, takeFromSlot, furnaceTick, containerToWire, containerFromWire, sanitizeStack,
  type ContainerState, type ContainerWire,
} from '../../containers';
import type { ServerStore } from '../store';
import { posKey, keyX, keyY, keyZ } from '../posKey';
import type { ServerContext, Session } from './context';

export class ContainerSystem {
  private containers = new Map<number, ContainerState>();
  private dirty = new Set<number>();

  constructor(private ctx: ServerContext, store: ServerStore) {
    for (const [key, data] of store.loadContainers()) {
      try {
        const c = containerFromWire(JSON.parse(data) as ContainerWire);
        if (c) this.containers.set(key, c);
      } catch {
        /* ignorar */
      }
    }
  }

  get count(): number {
    return this.containers.size;
  }

  private containerAt(x: number, y: number, z: number): ContainerState | null {
    const id = this.ctx.world.getBlock(x, y, z);
    if (!isContainer(id)) return null;
    const k = posKey(x, y, z);
    let c = this.containers.get(k);
    const kind = isChest(id) ? 'chest' : 'furnace';
    if (!c || c.kind !== kind) {
      c = newContainer(kind);
      this.containers.set(k, c);
    }
    return c;
  }

  /** Contenedores destruidos: soltar su contenido y cerrar las ventanas abiertas. */
  onBlockChanged(x: number, y: number, z: number, old: number, id: number): void {
    if (!isContainer(old) || isContainer(id)) return;
    const k = posKey(x, y, z);
    const c = this.containers.get(k);
    if (!c) return;
    this.containers.delete(k);
    this.dirty.add(k);
    this.ctx.entities.dropStacks(c.slots.filter((s): s is ItemStack => !!s), x + 0.5, y + 0.5, z + 0.5);
    for (const s of this.ctx.sessions()) {
      if (s.container === k) {
        s.container = null;
        this.ctx.send(s, { t: 'cclose' });
      }
    }
  }

  private sendContainer(k: number, c: ContainerState, only?: Session): void {
    const msg: ServerMsg = { t: 'cont', x: keyX(k), y: keyY(k), z: keyZ(k), c: containerToWire(c) };
    if (only) {
      this.ctx.send(only, msg);
      return;
    }
    const data = JSON.stringify(msg);
    for (const s of this.ctx.sessions()) if (s.container === k) this.ctx.sendRaw(s, data);
  }

  onOpen(s: Session, msg: Extract<ClientMsg, { t: 'open' }>): void {
    const x = Number(msg.x), y = Number(msg.y), z = Number(msg.z);
    if (![x, y, z].every(Number.isInteger) || !this.ctx.reachOk(s, x, y, z, 8)) return;
    const c = this.containerAt(x, y, z);
    if (!c) {
      this.ctx.send(s, { t: 'cclose' });
      return;
    }
    const k = posKey(x, y, z);
    s.container = k;
    this.sendContainer(k, c, s);
  }

  onOp(s: Session, msg: Extract<ClientMsg, { t: 'cclick' | 'cput' | 'ctake' }>): void {
    const ctx = this.ctx;
    const x = Number(msg.x), y = Number(msg.y), z = Number(msg.z);
    const q = Number(msg.q) || 0;
    if (![x, y, z].every(Number.isInteger)) return;
    const k = posKey(x, y, z);
    const c = s.container === k && ctx.allow(s, 1) ? this.containerAt(x, y, z) : null;
    if (!c) {
      // Contenedor cerrado o destruido: devolver al jugador lo que ofrecía.
      if (msg.t === 'cclick') ctx.send(s, { t: 'cres', q, cur: sanitizeStack(msg.cur) });
      else if (msg.t === 'cput') ctx.send(s, { t: 'cres', q, give: sanitizeStack(msg.stack) });
      else ctx.send(s, { t: 'cres', q, give: null });
      ctx.send(s, { t: 'cclose' });
      return;
    }
    if (msg.t === 'cclick') {
      const slot = Number(msg.slot), btn = Number(msg.btn) === 1 ? 1 : 0;
      const cur = sanitizeStack(msg.cur);
      const out = Number.isInteger(slot) ? clickSlot(c, slot, btn, cur) : cur;
      ctx.send(s, { t: 'cres', q, cur: out });
    } else if (msg.t === 'cput') {
      ctx.send(s, { t: 'cres', q, give: insertStack(c, sanitizeStack(msg.stack)) });
    } else {
      const slot = Number(msg.slot), max = Math.max(0, Math.min(64, Number(msg.max) | 0));
      ctx.send(s, { t: 'cres', q, give: Number.isInteger(slot) && slot >= 0 && slot < c.slots.length ? takeFromSlot(c, slot, max) : null });
    }
    this.dirty.add(k);
    this.sendContainer(k, c);
  }

  /** Hornos: funden, se encienden y se apagan (cambian de bloque conservando la orientación). */
  tickFurnaces(dt: number): void {
    const w = this.ctx.world;
    for (const [k, c] of this.containers) {
      if (c.kind !== 'furnace') continue;
      const x = keyX(k), y = keyY(k), z = keyZ(k);
      const id = w.getBlock(x, y, z);
      if (id < 0 || !isFurnace(id)) continue;
      const active = c.burn > 0 || c.slots[0] !== null;
      if (!active) continue;
      const res = furnaceTick(c, dt);
      if (res.changed) this.dirty.add(k);
      const lit = id >= FURNACE_LIT;
      if (res.lit !== lit) {
        const f = Math.max(0, blockFacing(id));
        w.setBlock(x, y, z, (res.lit ? FURNACE_LIT : FURNACE) + f);
      }
      if (res.changed || c.burn > 0) this.sendContainer(k, c);
    }
  }

  /** Guarda los contenedores que cambiaron. */
  flush(store: ServerStore): void {
    for (const k of this.dirty) {
      const c = this.containers.get(k);
      store.saveContainer(k, c ? JSON.stringify(containerToWire(c)) : null);
    }
    this.dirty.clear();
  }
}
