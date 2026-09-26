// Fase 7 (mecanismos): tolvas en el servidor, como en Minecraft.
// - Cada tolva pasa un objeto a lo que tiene en el pico (contenedores, hornos, soporte para pociones, otras
//   tolvas, compostador, tocadiscos, estantería cincelada, vagonetas con cofre o con tolva) y coge uno del
//   contenedor de encima o los objetos tirados encima (si no hay un bloque entero tapándola). Si movió algo,
//   espera 8 ticks (su propia espera, la cooldownTime de Minecraft: 2,5 objetos por segundo); la que recibe
//   de otra estando vacía espera 7, así que lo que entra no sigue en el mismo tick y una fila de tolvas va a
//   2,5 objetos por segundo.
// - En Minecraft una tolva sin espera lo intenta cada tick. Aquí sólo se miran las que pueden tener algo que
//   hacer: las que acaban su espera y las que despierta algo (un cambio de bloque a su lado, lo que guarda
//   lo de encima o lo del pico, un objeto tirado encima o una vagoneta al lado). Las demás duermen.
// - Con potencia de redstone se bloquean (ni pasan ni cogen nada).
// - Un comparador lee lo llenas que están (y las de los dispensadores y soltadores).
// Las vagonetas con tolva usan lo mismo (sim/server/mechanismCarts.ts).
import {
  HOPPER, DISPENSER, DROPPER, BLOCK_COLLIDE, familyBase, hopperLocked, hopperWith, hopperOutFace,
} from '../../blocks';
import { registerRedstone, containerSignal, FACE_X, FACE_Y, FACE_Z, UP, DOWN, UPDATE_CLIENTS, type RedstoneApi } from '../../redstone';
import { ENT_ITEM } from '../../mobs';
import { ENT_CHEST_MINECART, ENT_HOPPER_MINECART } from '../../vehicles';
import { posKey, keyX, keyY, keyZ } from '../posKey';
import { insertStack, isEmpty, isFull, type Inventories, type Opened } from './inventories';
import type { Redstone } from './redstone';
import type { ServerContext } from './context';

/** Ticks entre objeto y objeto (Minecraft: 8). */
export const HOPPER_COOLDOWN = 8;

const SYSTEMS = new WeakMap<RedstoneApi, Hoppers>();

/** checkPoweredState de HopperBlock: bloqueada mientras recibe potencia (cambia sin avisar: opción 2). */
function checkHopperPower(api: RedstoneApi, x: number, y: number, z: number, id: number): void {
  const locked = api.isPowered(x, y, z);
  if (locked !== hopperLocked(id)) api.setBlock(x, y, z, hopperWith(id, locked), UPDATE_CLIENTS);
}

registerRedstone(HOPPER, {
  // Cualquier cambio a su lado la despierta.
  neighbor: (api, x, y, z, id) => {
    checkHopperPower(api, x, y, z, id);
    SYSTEMS.get(api)?.wake(x, y, z);
  },
  placed: (api, x, y, z, old, id) => {
    if (old >= 0 && !(old > 0 && familyBase(old) === HOPPER)) checkHopperPower(api, x, y, z, id);
  },
  changed: (api, x, y, z, old, id) => {
    if (old < 0) api.updateAt(x, y, z);
    SYSTEMS.get(api)?.changed(x, y, z, id);
  },
});
registerRedstone([HOPPER, DISPENSER, DROPPER], {
  analog: (api, x, y, z) => containerSignal(api.containerSlots(x, y, z)),
});

const isHopper = (id: number) => id > 0 && familyBase(id) === HOPPER;

export class Hoppers {
  /** Tolvas cargadas. */
  private all = new Set<number>();
  /** Las que probarán a mover algo en el próximo tick. */
  private awake = new Set<number>();
  /** Tick en que acaba la espera de las que la tienen, y las que la acaban en cada tick. */
  private until = new Map<number, number>();
  private timers = new Map<number, number[]>();

  constructor(private ctx: ServerContext, rs: Redstone, private inv: Inventories) {
    SYSTEMS.set(rs, this);
  }

  /** Tolvas despiertas (para las pruebas). */
  get awakeCount(): number {
    return this.awake.size;
  }

  /** La tolva de (x, y, z) mirará en el próximo tick si tiene algo que hacer. */
  wake(x: number, y: number, z: number): void {
    const k = posKey(x, y, z);
    this.all.add(k);
    this.awake.add(k);
  }

  /** Cambió el bloque de (x, y, z): una tolva que se pone (o se carga su chunk) o que se quita. */
  changed(x: number, y: number, z: number, id: number): void {
    if (isHopper(id)) this.wake(x, y, z);
    else this.forget(posKey(x, y, z));
  }

  private forget(k: number): void {
    this.all.delete(k);
    this.awake.delete(k);
    this.until.delete(k);
  }

  /** Despierta a la tolva de (x, y, z), si la hay. */
  private poke(x: number, y: number, z: number): void {
    const k = posKey(x, y, z);
    if (this.all.has(k)) this.awake.add(k);
  }

  /**
   * Cambió lo que guarda (x, y, z) (un contenedor, o hay una vagoneta ahí): despiertan ella misma, si es una
   * tolva, la de debajo (coge de encima) y las que tienen el pico hacia ella.
   */
  contentsChanged(x: number, y: number, z: number): void {
    if (this.all.size === 0) return;
    this.poke(x, y, z);
    for (let f = 0; f < 6; f++) {
      const nx = x + FACE_X[f], ny = y + FACE_Y[f], nz = z + FACE_Z[f];
      if (!this.all.has(posKey(nx, ny, nz))) continue;
      if (f === DOWN || hopperOutFace(this.ctx.world.getBlock(nx, ny, nz)) === (f ^ 1)) this.poke(nx, ny, nz);
    }
  }

  /** La tolva `k` espera `ticks` antes de volver a mover nada. */
  private cool(k: number, now: number, ticks: number): void {
    const due = now + ticks;
    this.until.set(k, due);
    const l = this.timers.get(due);
    if (l) l.push(k);
    else this.timers.set(due, [k]);
  }

  /** Cada tick: las que acaban su espera y las despiertas mueven lo que puedan. */
  tick(): void {
    if (this.all.size === 0) return;
    const now = this.ctx.tickCount;
    const due = this.timers.get(now);
    if (due) {
      this.timers.delete(now);
      for (const k of due) this.awake.add(k);
    }
    this.watchEntities();
    if (this.awake.size === 0) return;
    const list = [...this.awake];
    this.awake.clear();
    for (const k of list) this.run(k, now);
  }

  /** Objetos tirados encima de una tolva y vagonetas con cofre o con tolva a su lado: la despiertan. */
  private watchEntities(): void {
    for (const e of this.ctx.entities.list.values()) {
      if (e.dead) continue;
      if (e.type === ENT_ITEM) {
        // Lo que coge una tolva: de 11/16 de su altura hasta 2 bloques por encima (ver pull).
        const x = Math.floor(e.x), z = Math.floor(e.z);
        for (let y = Math.ceil(e.y - 2); y <= Math.floor(e.y - 11 / 16); y++) this.poke(x, y, z);
      } else if (e.type === ENT_CHEST_MINECART || e.type === ENT_HOPPER_MINECART) {
        this.contentsChanged(Math.floor(e.x), Math.floor(e.y + 0.3), Math.floor(e.z));
      }
    }
  }

  /** La tolva `k`, si no espera ni está bloqueada: pasa un objeto y coge otro. Si movió algo, espera. */
  private run(k: number, now: number): void {
    const x = keyX(k), y = keyY(k), z = keyZ(k);
    const id = this.ctx.world.getBlock(x, y, z);
    if (!isHopper(id)) {
      // Quitada o sin cargar (al cargarse su chunk se apunta otra vez).
      this.forget(k);
      return;
    }
    if (hopperLocked(id)) return;
    const u = this.until.get(k);
    if (u !== undefined) {
      if (u > now) return;
      this.until.delete(k);
    }
    const self = this.inv.open(x, y, z);
    if (!self) return;
    let moved = false;
    if (!isEmpty(self.state)) moved = this.push(x, y, z, id, self, now);
    if (!isFull(self.state)) moved = this.pull(x, y, z, self) || moved;
    if (moved) this.cool(k, now, HOPPER_COOLDOWN);
  }

  /**
   * Pasa un objeto (el del primer hueco que quepa) a lo que tiene en el pico. Una tolva vacía que lo recibe
   * espera 7 ticks (Minecraft: 8 menos el tick que ya lleva), así que no lo pasa en el mismo tick.
   */
  private push(x: number, y: number, z: number, id: number, self: Opened, now: number): boolean {
    const out = hopperOutFace(id);
    const tx = x + FACE_X[out], ty = y + FACE_Y[out], tz = z + FACE_Z[out];
    if (!this.inv.hasInventory(tx, ty, tz)) return false;
    const target = isHopper(this.ctx.world.getBlock(tx, ty, tz)) ? this.inv.open(tx, ty, tz) : null;
    const wasEmpty = !!target && isEmpty(target.state);
    const c = self.state;
    for (let i = 0; i < c.slots.length; i++) {
      const s = c.slots[i];
      if (!s || s.count <= 0) continue;
      if (!this.inv.insertOne(tx, ty, tz, out ^ 1, s)) continue;
      c.slots[i] = s.count > 1 ? { ...s, count: s.count - 1 } : null;
      self.done();
      if (wasEmpty) {
        const tk = posKey(tx, ty, tz);
        this.all.add(tk);
        this.cool(tk, now, HOPPER_COOLDOWN - 1);
      }
      return true;
    }
    return false;
  }

  /** Coge un objeto del contenedor de encima o lo que haya tirado encima. */
  private pull(x: number, y: number, z: number, self: Opened): boolean {
    const c = self.state;
    if (this.inv.hasInventory(x, y + 1, z)) {
      const ok = this.inv.extractOne(x, y + 1, z, DOWN, (s) => insertStack(c, s, UP) === 1);
      if (ok) self.done();
      return ok;
    }
    const above = this.ctx.world.getBlock(x, y + 1, z);
    if (above > 0 && BLOCK_COLLIDE[above] === 1) return false;
    if (!this.inv.suckItems(c, x, y + 11 / 16, z, x + 1, y + 2, z + 1)) return false;
    self.done();
    return true;
  }
}
