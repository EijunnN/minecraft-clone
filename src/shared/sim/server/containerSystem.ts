// Cofres (sencillos y dobles) y hornos (horno, ahumador y alto horno) compartidos: estado por
// posición, operaciones de los jugadores (clic, meter, sacar), hornos que funden solos, contenido
// que cae al romperlos y persistencia.
import {
  CHEST, CHEST_DOUBLE, isContainer, isChest, isFurnace, furnaceVariant, isLitFurnace, furnaceWithLit, familyBase,
  stateProps, chestPartnerDir,
} from '../../blocks';
import { DIR_X, DIR_Z } from '../../blockModels';
import { smeltXp } from '../../experience';
import type { ClientMsg, ServerMsg } from '../../protocol';
import type { ItemStack } from '../../items';
import {
  newContainer, clickSlot, insertStack, takeFromSlot, furnaceTick, containerToWire, containerFromWire, sanitizeStack,
  FURNACE_OUT, CHEST_SLOTS, DOUBLE_CHEST_SLOTS, type ContainerState, type ContainerWire, type FurnaceVariant,
} from '../../containers';
import type { ServerStore } from '../store';
import { LOOT_TABLES, rollLoot, scatterLoot } from '../../loot';
import type { StructureChest } from '../../world/structures';
import { posKey, keyX, keyY, keyZ } from '../posKey';
import type { ServerContext, Session } from './context';
// Fase 7 (pociones): el alambique alquímico destila solo y enseña sus frascos.
import { isBrewingStand, brewingStandMask, brewingStandWith } from '../../blocks';
import { brewTick, brewBottleMask, BREW_INGREDIENT, BREW_FUEL } from '../../brewing';

/** Lo que ve un jugador: un contenedor o las dos mitades de un cofre doble (izquierda primero). */
interface View {
  parts: [number, ContainerState][];
  state: ContainerState;
}

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

  /** Llena los cofres de una estructura con su botín (al generarse su chunk). */
  fillLoot(chests: StructureChest[]): void {
    const rand = () => this.ctx.rand();
    for (const ch of chests) {
      const table = LOOT_TABLES[ch.table];
      if (!table) continue;
      const k = posKey(ch.x, ch.y, ch.z);
      const c = newContainer('chest');
      c.slots = scatterLoot(rollLoot(table, rand), CHEST_SLOTS, rand);
      this.containers.set(k, c);
      this.dirty.add(k);
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
    const kind = isChest(id) ? 'chest' : isBrewingStand(id) ? 'brewing' : 'furnace'; // Fase 7 (pociones)
    if (!c || c.kind !== kind) {
      c = newContainer(kind);
      this.containers.set(k, c);
    }
    return c;
  }

  /** Pareja de una mitad de cofre doble: [x, y, z, lado de la mitad dada] o null. */
  private partnerOf(x: number, y: number, z: number): [number, number, number, number] | null {
    const id = this.ctx.world.getBlock(x, y, z);
    if (familyBase(id) !== CHEST_DOUBLE) return null;
    const st = stateProps(id)!;
    const d = chestPartnerDir(st.facing, st.side);
    const px = x + DIR_X[d], pz = z + DIR_Z[d];
    return familyBase(this.ctx.world.getBlock(px, y, pz)) === CHEST_DOUBLE ? [px, y, pz, st.side] : null;
  }

  /** Lo que se ve al abrir (x, y, z): el contenedor o el cofre grande. */
  private viewAt(x: number, y: number, z: number): View | null {
    const c = this.containerAt(x, y, z);
    if (!c) return null;
    const k = posKey(x, y, z);
    const p = this.partnerOf(x, y, z);
    const other = p ? this.containerAt(p[0], p[1], p[2]) : null;
    if (!p || !other || c.slots.length !== CHEST_SLOTS || other.slots.length !== CHEST_SLOTS) return { parts: [[k, c]], state: c };
    const pk = posKey(p[0], p[1], p[2]);
    const parts: [number, ContainerState][] = p[3] === 0 ? [[k, c], [pk, other]] : [[pk, other], [k, c]];
    const state = newContainer('chest', DOUBLE_CHEST_SLOTS);
    state.slots = [...parts[0][1].slots, ...parts[1][1].slots];
    return { parts, state };
  }

  /** Reparte en las mitades lo que cambió en la vista combinada. */
  private commit(v: View): void {
    if (v.parts.length === 1) return;
    v.parts[0][1].slots = v.state.slots.slice(0, CHEST_SLOTS);
    v.parts[1][1].slots = v.state.slots.slice(CHEST_SLOTS);
  }

  /** Contenedores destruidos: soltar su contenido y cerrar las ventanas abiertas. */
  onBlockChanged(x: number, y: number, z: number, old: number, id: number): void {
    // Se rompe media cofre doble: la otra mitad vuelve a ser un cofre sencillo.
    if (familyBase(old) === CHEST_DOUBLE && familyBase(id) !== CHEST_DOUBLE) {
      const st = stateProps(old)!;
      const d = chestPartnerDir(st.facing, st.side);
      const px = x + DIR_X[d], pz = z + DIR_Z[d];
      if (familyBase(this.ctx.world.getBlock(px, y, pz)) === CHEST_DOUBLE) this.ctx.world.setBlock(px, y, pz, CHEST + st.facing);
    }
    if (!isContainer(old) || isContainer(id)) return;
    const k = posKey(x, y, z);
    const c = this.containers.get(k);
    if (!c) return;
    this.containers.delete(k);
    this.dirty.add(k);
    this.ctx.entities.dropStacks(c.slots.filter((s): s is ItemStack => !!s), x + 0.5, y + 0.5, z + 0.5);
    for (const s of this.ctx.sessions()) {
      if (s.container === null) continue;
      if (s.container === k || this.viewKeys(s.container).includes(k)) {
        s.container = null;
        this.ctx.send(s, { t: 'cclose' });
      }
    }
  }

  /** Posiciones que forman la vista abierta en `k`. */
  private viewKeys(k: number): number[] {
    const p = this.partnerOf(keyX(k), keyY(k), keyZ(k));
    return p ? [k, posKey(p[0], p[1], p[2])] : [k];
  }

  /** Envía la vista a quien la tenga abierta (o sólo a `only`). */
  private sendView(k: number, only?: Session): void {
    for (const s of only ? [only] : this.ctx.sessions()) {
      if (s.container === null || !this.viewKeys(s.container).includes(k)) continue;
      const x = keyX(s.container), y = keyY(s.container), z = keyZ(s.container);
      const v = this.viewAt(x, y, z);
      if (!v) continue;
      const msg: ServerMsg = { t: 'cont', x, y, z, c: containerToWire(v.state) };
      this.ctx.send(s, msg);
    }
  }

  onOpen(s: Session, msg: Extract<ClientMsg, { t: 'open' }>): void {
    const x = Number(msg.x), y = Number(msg.y), z = Number(msg.z);
    if (![x, y, z].every(Number.isInteger) || !this.ctx.reachOk(s, x, y, z, 8)) return;
    if (!this.viewAt(x, y, z)) {
      this.ctx.send(s, { t: 'cclose' });
      return;
    }
    const k = posKey(x, y, z);
    s.container = k;
    this.sendView(k, s);
  }

  onOp(s: Session, msg: Extract<ClientMsg, { t: 'cclick' | 'cput' | 'ctake' }>): void {
    const ctx = this.ctx;
    const x = Number(msg.x), y = Number(msg.y), z = Number(msg.z);
    const q = Number(msg.q) || 0;
    if (![x, y, z].every(Number.isInteger)) return;
    const k = posKey(x, y, z);
    const v = s.container === k && ctx.allow(s, 1) ? this.viewAt(x, y, z) : null;
    if (!v) {
      // Contenedor cerrado o destruido: devolver al jugador lo que ofrecía.
      if (msg.t === 'cclick') ctx.send(s, { t: 'cres', q, cur: sanitizeStack(msg.cur) });
      else if (msg.t === 'cput') ctx.send(s, { t: 'cres', q, give: sanitizeStack(msg.stack) });
      else ctx.send(s, { t: 'cres', q, give: null });
      ctx.send(s, { t: 'cclose' });
      return;
    }
    const c = v.state;
    // Lo que había en la salida del horno (para dar la experiencia de lo que se saque).
    const out = c.kind === 'furnace' ? c.slots[FURNACE_OUT] : null;
    const before = out ? { id: out.id, count: out.count } : null;
    if (msg.t === 'cclick') {
      const slot = Number(msg.slot), btn = Number(msg.btn) === 1 ? 1 : 0;
      const cur = sanitizeStack(msg.cur);
      const res = Number.isInteger(slot) ? clickSlot(c, slot, btn, cur) : cur;
      ctx.send(s, { t: 'cres', q, cur: res });
    } else if (msg.t === 'cput') {
      ctx.send(s, { t: 'cres', q, give: insertStack(c, sanitizeStack(msg.stack)) });
    } else {
      const slot = Number(msg.slot), max = Math.max(0, Math.min(64, Number(msg.max) | 0));
      ctx.send(s, { t: 'cres', q, give: Number.isInteger(slot) && slot >= 0 && slot < c.slots.length ? takeFromSlot(c, slot, max) : null });
    }
    this.commit(v);
    if (before) this.smeltReward(s, before.id, before.count - (c.slots[FURNACE_OUT]?.count ?? 0));
    for (const [pk] of v.parts) this.dirty.add(pk);
    this.sendView(k);
  }

  /** El jugador sacó `taken` objetos fundidos: orbes de experiencia a sus pies. */
  private smeltReward(s: Session, item: number, taken: number): void {
    if (taken <= 0) return;
    const xp = smeltXp(item, taken, () => this.ctx.rand());
    if (xp > 0) this.ctx.entities.xp.spawn(xp, s.p[0], s.p[1] + 0.5, s.p[2]);
  }

  /** Hornos: funden, se encienden y se apagan (cambian de bloque conservando la orientación). */
  tickFurnaces(dt: number): void {
    const w = this.ctx.world;
    for (const [k, c] of this.containers) {
      if (c.kind === 'brewing') this.tickBrewing(k, c, dt); // Fase 7 (pociones)
      if (c.kind !== 'furnace') continue;
      const x = keyX(k), y = keyY(k), z = keyZ(k);
      const id = w.getBlock(x, y, z);
      if (id < 0 || !isFurnace(id)) continue;
      const active = c.burn > 0 || c.slots[0] !== null;
      if (!active) continue;
      const res = furnaceTick(c, dt, furnaceVariant(id) as FurnaceVariant);
      if (res.changed) this.dirty.add(k);
      if (res.lit !== isLitFurnace(id)) w.setBlock(x, y, z, furnaceWithLit(id, res.lit));
      if (res.changed || c.burn > 0) this.sendView(k);
    }
  }

  /**
   * Fase 7 (pociones): el alambique destila (con combustible e ingrediente), avisa al acabar y el bloque
   * enseña los frascos que tiene dentro.
   */
  private tickBrewing(k: number, c: ContainerState, dt: number): void {
    const w = this.ctx.world;
    const x = keyX(k), y = keyY(k), z = keyZ(k);
    const id = w.getBlock(x, y, z);
    if (id < 0 || !isBrewingStand(id)) return;
    if (c.cook > 0 || c.slots[BREW_INGREDIENT] || (c.burn <= 0 && c.slots[BREW_FUEL])) {
      const res = brewTick(c, dt);
      if (res.changed) this.dirty.add(k);
      if (res.done) this.ctx.fx('brew_done', x + 0.5, y + 0.6, z + 0.5);
      if (res.changed || c.cook > 0) this.sendView(k);
    }
    const mask = brewBottleMask(c);
    if (brewingStandMask(id) !== mask) w.setBlock(x, y, z, brewingStandWith(mask));
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
