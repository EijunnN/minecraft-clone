// Fase 7 (mecanismos): tolvas en el servidor, como en Minecraft.
// - Cada 8 ticks (2,5 objetos por segundo) pasan un objeto a lo que tienen en el pico (contenedores,
//   hornos, soporte para pociones, otras tolvas, compostador, tocadiscos, estantería cincelada, vagonetas
//   con cofre o con tolva) y cogen uno del contenedor de encima o los objetos tirados encima (si no hay un
//   bloque entero tapándola). Lo que entra en una tolva desde otra no sigue hasta la vuelta siguiente.
// - Con potencia de redstone se bloquean (ni pasan ni cogen nada).
// - Un comparador lee lo llenas que están (y las de los dispensadores y soltadores).
// Las vagonetas con tolva usan lo mismo (sim/server/mechanismCarts.ts).
import {
  HOPPER, DISPENSER, DROPPER, BLOCK_COLLIDE, hopperLocked, hopperWith, hopperOutFace,
} from '../../blocks';
import { registerRedstone, containerSignal, FACE_X, FACE_Y, FACE_Z, UP, DOWN, type RedstoneApi } from '../../redstone';
import { posKey } from '../posKey';
import { insertStack, isEmpty, isFull, type Inventories, type Opened } from './inventories';
import type { Redstone } from './redstone';
import type { ServerContext } from './context';

/** Ticks entre objeto y objeto (Minecraft: 8). */
export const HOPPER_COOLDOWN = 8;

const SYSTEMS = new WeakMap<RedstoneApi, Hoppers>();

registerRedstone(HOPPER, {
  // Bloqueada mientras recibe potencia.
  neighbor: (api, x, y, z, id) => {
    const locked = api.isPowered(x, y, z);
    if (locked !== hopperLocked(id)) api.setBlock(x, y, z, hopperWith(id, locked));
  },
  changed: (api, x, y, z, old) => {
    if (old < 0) api.updateAt(x, y, z);
  },
  periodic: { every: HOPPER_COOLDOWN, run: (api, x, y, z, id) => SYSTEMS.get(api)?.run(x, y, z, id) },
});
registerRedstone([HOPPER, DISPENSER, DROPPER], {
  analog: (api, x, y, z) => containerSignal(api.containerSlots(x, y, z)),
});

export class Hoppers {
  /** Tolvas que recibieron algo de otra en esta vuelta (no lo pasan hasta la siguiente). */
  private received = new Set<number>();
  private receivedTick = -1;

  constructor(private ctx: ServerContext, rs: Redstone, private inv: Inventories) {
    SYSTEMS.set(rs, this);
  }

  /** Una vuelta de la tolva de (x, y, z): pasa un objeto y coge otro. */
  run(x: number, y: number, z: number, id: number): void {
    if (hopperLocked(id)) return;
    if (this.receivedTick !== this.ctx.tickCount) {
      this.receivedTick = this.ctx.tickCount;
      this.received.clear();
    }
    const self = this.inv.open(x, y, z);
    if (!self) return;
    if (!isEmpty(self.state) && !this.received.has(posKey(x, y, z))) this.push(x, y, z, id, self);
    if (!isFull(self.state)) this.pull(x, y, z, self);
  }

  /** Pasa un objeto (el del primer hueco que quepa) a lo que tiene en el pico. */
  private push(x: number, y: number, z: number, id: number, self: Opened): boolean {
    const out = hopperOutFace(id);
    const tx = x + FACE_X[out], ty = y + FACE_Y[out], tz = z + FACE_Z[out];
    if (!this.inv.hasInventory(tx, ty, tz)) return false;
    const c = self.state;
    for (let i = 0; i < c.slots.length; i++) {
      const s = c.slots[i];
      if (!s || s.count <= 0) continue;
      if (!this.inv.insertOne(tx, ty, tz, out ^ 1, s)) continue;
      c.slots[i] = s.count > 1 ? { ...s, count: s.count - 1 } : null;
      self.done();
      this.received.add(posKey(tx, ty, tz));
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
