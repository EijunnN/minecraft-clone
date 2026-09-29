// Programa lunar (idea-industria.md): los brazos (inserters) en el servidor. Ver logistics/inserters.ts y FACTORIO-REFERENCIA.md §2.
//
// Un brazo coge objetos de lo que tiene DETRÁS (un cofre, un horno, una máquina, una cinta o el suelo) y los deja en lo que tiene DELANTE.
// Cinco tipos: básico, rápido, largo (coge y suelta a 2 casillas), de combustible y a granel (lleva 2). Reglas de Factorio:
// - Sólo coge lo que lo de delante puede recibir, y que pase su filtro (hasta 5 objetos, lista blanca o negra); no se queda con algo en
//   la mano sin poder soltarlo salvo que se llene entre medias.
// - En la mano lleva hasta su capacidad (1 objeto; 2 el de a granel; las investigaciones la suben), o menos si se le pone un tope. Todo
//   lo que coge de una vez es del mismo tipo.
// - Una vuelta entera dura lo que dice su velocidad de giro; coger y volver son cada uno media vuelta. Los eléctricos gastan un poco
//   siempre y bastante al moverse, y sin energía se paran (con menos, van más despacio); el de combustible quema lo que se le da, o
//   «chupa» el que va a mover cuando se le acaba.
// - Delante de una cinta deja el objeto en el carril más lejano al brazo, a media altura de la cinta; delante del vacío lo deja en el
//   suelo (de uno en uno: no suelta otro mientras el anterior siga ahí); y detrás del vacío coge lo que haya tirado en el suelo.
import { INSERTERS, inserterInfo, isBeltLike, AIR } from '../../blocks';
import { registerRedstone, type RedstoneApi } from '../../redstone';
import { BELT_DX, BELT_DZ } from '../../logistics/belts';
import {
  INSERTER_TYPES, INSERTER_FILTERS, FILTER_BLACKLIST, FUEL_KJ_PER_UNIT, BURNER_LEECH_BELOW_CYCLES, inserterCycleTicks, inserterCycleKJ, inserterMoveKw,
} from '../../logistics/inserters';
import { ITEMS, sameKind, type ItemStack } from '../../items';
import { insertStack, type Inventories } from './inventories';
import { posKey, keyX, keyY, keyZ } from '../posKey';
import { stackToWire, stackFromWire, type WireStack } from '../../protocol';
import type { Belts } from './belts';
import type { ServerContext, Session } from './context';
import type { ServerStore } from '../store';
import type { Redstone } from './redstone';
import type { Power, PowerConsumer } from './power';

const SYSTEMS = new WeakMap<RedstoneApi, Inserters>();

registerRedstone(INSERTERS, {
  changed: (api, x, y, z, old, id) => SYSTEMS.get(api)?.changed(x, y, z, old, id),
});

/** Cara del bloque de DETRÁS que mira al brazo (0 +X, 1 −X, 4 +Z, 5 −Z) según el sentido del brazo. */
const SRC_FACE = [0, 4, 1, 5] as const;
/** Cara del bloque de DELANTE que mira al brazo. */
const DST_FACE = [1, 5, 0, 4] as const;

/** Fases de una vuelta. */
const IDLE = 0, CARRY = 1, RETURN = 2;
/** Posiciones (a lo largo de la cinta) donde se prueba a dejar cada objeto de una mano con varios. */
const DROP_SPOTS = [0.5, 0.25, 0.75, 0.125, 0.875, 0.375, 0.625] as const;

/** Configuración de un brazo. */
export interface InserterConfig {
  /** Hasta 5 objetos del filtro (0 = ranura vacía). */
  filter: number[];
  /** 0 lista blanca, 1 lista negra. */
  mode: number;
  /** Tope de objetos por viaje (0 = todos los que quepan en la mano). */
  stack: number;
}

interface Arm {
  dir: number;
  tier: number;
  phase: number;
  /** Ticks que faltan para acabar la fase (0: ya puede seguir). */
  wait: number;
  hand: ItemStack | null;
  filter: number[];
  mode: number;
  stack: number;
  /** Sólo el de combustible: lo que le queda de energía (kJ) y el combustible que tiene guardado. */
  energy: number;
  fuel: ItemStack | null;
  /** Duración de la fase actual (ticks), para saber cuánto lleva. */
  span: number;
  /** Lo que se pasó del tick al acabar la fase anterior (se descuenta de la siguiente: el ritmo no se redondea a ticks). */
  over: number;
}

type SavedArm = [number, number, number, number[], number, number, number, WireStack | null, WireStack | null, number, number];

export class Inserters implements PowerConsumer {
  private arms = new Map<number, Arm>();
  private saved = new Map<number, SavedArm>();
  private touched = new Set<number>();
  private saveDirty = false;
  private tickN = 0;
  /** Lo que las investigaciones suben la capacidad de la mano (los de a granel aparte de los demás). */
  bonus = { inserter: 0, bulk: 0 };

  constructor(private ctx: ServerContext, rs: Redstone, private belts: Belts, private inv: Inventories, private power: Power, store: ServerStore) {
    SYSTEMS.set(rs, this);
    try {
      const raw = JSON.parse(store.getMeta('inserters') ?? '[]') as unknown;
      if (Array.isArray(raw)) {
        for (const r of raw) {
          if (Array.isArray(r) && r.length === 11 && r.slice(0, 3).every((n) => Number.isFinite(n)) && Array.isArray(r[3])) this.saved.set(posKey(r[0], r[1], r[2]), r as SavedArm);
        }
      }
    } catch {
      /* mundo sin brazos guardados */
    }
  }

  get count(): number {
    return this.arms.size;
  }

  /** Objeto que lleva el brazo de (x, y, z) en la mano (para las pruebas). */
  handOf(x: number, y: number, z: number): ItemStack | null {
    return this.arms.get(posKey(x, y, z))?.hand ?? null;
  }

  /** Configuración del brazo de (x, y, z) (null si no hay). */
  configOf(x: number, y: number, z: number): InserterConfig | null {
    const a = this.arms.get(posKey(x, y, z));
    return a ? { filter: a.filter.slice(), mode: a.mode, stack: a.stack } : null;
  }

  /** Cuántos objetos caben en la mano del brazo de (x, y, z) (0 si no hay). */
  capacityOf(x: number, y: number, z: number): number {
    const a = this.arms.get(posKey(x, y, z));
    return a ? this.capacity(a) : 0;
  }

  /** Energía (kJ) y combustible que tiene un brazo de combustible (para las pruebas y la ventana). */
  fuelOf(x: number, y: number, z: number): { energy: number; fuel: ItemStack | null } | null {
    const a = this.arms.get(posKey(x, y, z));
    return a ? { energy: a.energy, fuel: a.fuel } : null;
  }

  setConfig(x: number, y: number, z: number, cfg: Partial<InserterConfig>): boolean {
    const k = posKey(x, y, z);
    const a = this.arms.get(k);
    if (!a) return false;
    if (cfg.filter) {
      const f = cfg.filter.slice(0, INSERTER_FILTERS).map((n) => (Number.isInteger(n) && n > 0 && ITEMS[n] ? n : 0));
      while (f.length < INSERTER_FILTERS) f.push(0);
      a.filter = f;
    }
    if (cfg.mode !== undefined) a.mode = cfg.mode === FILTER_BLACKLIST ? FILTER_BLACKLIST : 0;
    if (cfg.stack !== undefined) a.stack = Math.max(0, Math.min(this.capacity(a), Math.trunc(cfg.stack) || 0));
    this.touched.add(k);
    this.saveDirty = true;
    return true;
  }

  /** Mete combustible en un brazo de combustible (el jugador se lo da). Devuelve cuántos entraron. */
  addFuel(x: number, y: number, z: number, s: ItemStack): number {
    const a = this.arms.get(posKey(x, y, z));
    if (!a || !INSERTER_TYPES[a.tier].burner || !(ITEMS[s.id]?.fuel ?? 0)) return 0;
    const n = insertFuel(a, s);
    if (n > 0) this.saveDirty = true;
    return n;
  }

  /** Cuántos objetos caben en la mano de este brazo ahora (con las investigaciones). */
  capacity(a: Arm): number {
    const t = INSERTER_TYPES[a.tier];
    return t.stack + (t.key === 'inserter_bulk' ? this.bonus.bulk : this.bonus.inserter);
  }

  changed(x: number, y: number, z: number, _old: number, id: number): void {
    const k = posKey(x, y, z);
    const info = inserterInfo(id);
    if (!info) {
      const a = this.arms.get(k);
      if (a) {
        const drops = [a.hand, a.fuel].filter((s): s is ItemStack => !!s);
        if (drops.length) this.ctx.entities.dropStacks(drops, x + 0.5, y + 0.5, z + 0.5); // lo que llevaba en la mano y su combustible
        this.arms.delete(k);
        this.power.detach(k);
        this.saveDirty = true;
      }
      return;
    }
    const a = this.arms.get(k);
    if (a) {
      const tierChanged = a.tier !== info.tier;
      a.dir = info.dir;
      a.tier = info.tier;
      if (tierChanged) {
        // Sustitución rápida por otro tipo: se conserva la mano y la configuración; cambia de dónde saca la energía.
        if (INSERTER_TYPES[info.tier].burner) this.power.detach(k);
        else this.power.attach(k);
        a.stack = Math.min(a.stack, this.capacity(a));
      }
      this.touched.add(k);
      return;
    }
    const sv = this.saved.get(k);
    this.saved.delete(k);
    const arm: Arm = {
      dir: info.dir, tier: info.tier, phase: IDLE, wait: 0, hand: null, filter: Array(INSERTER_FILTERS).fill(0), mode: 0, stack: 0, energy: 0, fuel: null,
      span: 0, over: 0,
    };
    if (sv) {
      arm.filter = sv[3].slice(0, INSERTER_FILTERS).map((n) => n | 0);
      while (arm.filter.length < INSERTER_FILTERS) arm.filter.push(0);
      arm.mode = sv[4] === FILTER_BLACKLIST ? FILTER_BLACKLIST : 0;
      arm.stack = Math.max(0, sv[5] | 0);
      arm.energy = Math.max(0, Number(sv[6]) || 0);
      arm.fuel = sv[7] ? stackFromWire(sv[7]) : null;
      arm.hand = sv[8] ? stackFromWire(sv[8]) : null;
      arm.phase = sv[9] === CARRY || sv[9] === RETURN ? sv[9] : arm.hand ? CARRY : IDLE;
      arm.wait = Math.max(0, Number(sv[10]) || 0);
    }
    this.arms.set(k, arm);
    if (!INSERTER_TYPES[info.tier].burner) this.power.attach(k);
    this.touched.add(k);
  }

  // ------------------------------------------------------------------ lo que hay delante y detrás

  /** Filtro del brazo: lista blanca (sólo lo de la lista; sin lista, todo) o lista negra (todo menos lo de la lista). */
  private passes(a: Arm, s: ItemStack): boolean {
    const any = a.filter.some((f) => f > 0);
    if (!any) return true;
    const hit = a.filter.includes(s.id);
    return a.mode === FILTER_BLACKLIST ? !hit : hit;
  }

  /** ¿Hay un objeto tirado en la casilla (x, y, z)? */
  private groundItem(x: number, y: number, z: number): boolean {
    return this.inv.itemsAt(x, y, z).some((e) => !e.dead);
  }

  /** ¿Puede lo de delante recibir `s`? (sin meterlo) */
  private accepts(x: number, y: number, z: number, dir: number, s: ItemStack): boolean {
    const w = this.ctx.world.getBlock(x, y, z);
    if (w < 0) return false;
    if (w === AIR) return !this.groundItem(x, y, z); // al suelo, de uno en uno
    if (isBeltLike(w)) return this.belts.room(x, y, z, this.laneFor(x, y, z, dir), 0.5);
    if (this.inv.machines?.has(x, y, z)) return this.inv.machines.accepts(x, y, z, s);
    const o = this.inv.open(x, y, z);
    if (o) {
      // Prueba en una copia: el contenido de verdad no cambia.
      const trial = { ...o.state, slots: o.state.slots.map((t) => (t ? { ...t } : t)) };
      return insertStack(trial, { ...s, count: 1 }, DST_FACE[dir]) === 1;
    }
    return this.inv.hasInventory(x, y, z); // compostador, tocadiscos, estantería: lo intenta al soltar
  }

  /** Carril de la cinta de (x, y, z) en el que suelta un brazo que mira hacia `dir`: el más lejano a él. */
  private laneFor(bx: number, by: number, bz: number, dir: number): 0 | 1 {
    const piece = this.belts.at(bx, by, bz);
    if (!piece) return 1;
    const bd = piece.dir;
    // El brazo está en (bx, bz) − dir·alcance: su posición respecto a la cinta.
    const ox = -BELT_DX[dir], oz = -BELT_DZ[dir];
    const leftX = BELT_DX[(bd + 3) % 4], leftZ = BELT_DZ[(bd + 3) % 4];
    if (ox === leftX && oz === leftZ) return 1; // el brazo está a la izquierda: suelta en el carril derecho (el lejano)
    if (ox === -leftX && oz === -leftZ) return 0;
    return 1; // de frente o de espaldas: el derecho
  }

  private drop(x: number, y: number, z: number, dir: number, s: ItemStack): boolean {
    const w = this.ctx.world.getBlock(x, y, z);
    if (w < 0) return false;
    if (w === AIR) {
      if (this.groundItem(x, y, z)) return false;
      this.ctx.entities.spawnItem({ ...s, count: 1 }, x + 0.5, y + 0.3, z + 0.5, 0, 0, 0, undefined, 0);
      return true;
    }
    if (isBeltLike(w)) {
      const lane = this.laneFor(x, y, z, dir);
      for (const p of DROP_SPOTS) if (this.belts.put(x, y, z, lane, p, s)) return true;
      return false;
    }
    return this.inv.insertOne(x, y, z, DST_FACE[dir], s);
  }

  /** Intenta coger UN objeto de lo de detrás que cumpla `want`. */
  private pickOne(x: number, y: number, z: number, dir: number, want: (s: ItemStack) => boolean): ItemStack | null {
    const w = this.ctx.world.getBlock(x, y, z);
    if (w < 0) return null;
    if (w === AIR) {
      // Lo tirado en el suelo de esa casilla.
      for (const e of this.inv.itemsAt(x, y, z)) {
        if (e.dead || !e.stack || !this.ctx.entities.list.has(e.id) || !want({ ...e.stack, count: 1 })) continue;
        const one: ItemStack = { ...e.stack, count: 1 };
        if (e.stack.count > 1) e.stack = { ...e.stack, count: e.stack.count - 1 };
        else this.ctx.entities.remove(e.id);
        return one;
      }
      return null;
    }
    if (isBeltLike(w)) return this.belts.take(x, y, z, want);
    let got: ItemStack | null = null;
    if (this.inv.machines?.has(x, y, z)) {
      this.inv.machines.extractOne(x, y, z, (s) => {
        if (!want(s)) return false;
        got = s;
        return true;
      });
      return got;
    }
    this.inv.extractOne(x, y, z, SRC_FACE[dir], (s) => {
      if (!want(s)) return false;
      got = s;
      return true;
    });
    return got;
  }

  // ------------------------------------------------------------------ energía y trabajo

  /** Cada brazo eléctrico pide su consumo en reposo (`drain`) y, mientras se mueve, el de movimiento. */
  demand(out: Map<number, number>): void {
    for (const [k, a] of this.arms) {
      const t = INSERTER_TYPES[a.tier];
      if (t.burner) continue;
      out.set(k, a.phase === IDLE ? t.drainKw : inserterMoveKw(t));
    }
  }

  /** Sin energía un brazo no se mueve; con menos de la que pide, va más despacio en la misma proporción. */
  advance(sat: (k: number) => number): void {
    this.tickN++;
    for (const [k, a] of this.arms) {
      const t = INSERTER_TYPES[a.tier];
      let s: number;
      if (t.burner) {
        // El de combustible: trabaja mientras tenga energía; al empezar una vuelta necesita la de una entera.
        s = a.phase !== IDLE || a.energy >= inserterCycleKJ(t) || this.burn(a) ? 1 : 0;
      } else s = sat(k);
      if (s <= 0) continue;
      if (a.wait > 0) {
        a.wait -= s;
        if (t.burner && a.phase !== IDLE) a.energy = Math.max(0, a.energy - (inserterCycleKJ(t) / inserterCycleTicks(t)) * s);
        if (a.wait > 0) continue;
        a.over = -a.wait;
        a.wait = 0;
      }
      this.work(k, a, t);
    }
  }

  /** Duración (ticks) de una media vuelta descontando lo que sobró de la anterior. */
  private phaseTicks(a: Arm, half: number): number {
    const t = Math.max(0.01, half - a.over);
    a.over = Math.max(0, a.over - half);
    return t;
  }

  /** Quema una unidad del combustible del brazo de combustible. false si no tiene. */
  private burn(a: Arm): boolean {
    const f = a.fuel;
    if (!f || (ITEMS[f.id]?.fuel ?? 0) <= 0) return false;
    a.energy += (ITEMS[f.id]!.fuel ?? 0) * FUEL_KJ_PER_UNIT;
    a.fuel = f.count > 1 ? { ...f, count: f.count - 1 } : null;
    this.saveDirty = true;
    return a.energy >= 0;
  }

  private work(k: number, a: Arm, t: (typeof INSERTER_TYPES)[number]): void {
    const x = keyX(k), y = keyY(k), z = keyZ(k);
    const dx = BELT_DX[a.dir] * t.reach, dz = BELT_DZ[a.dir] * t.reach;
    const cycle = inserterCycleTicks(t);
    if (a.phase === IDLE) {
      const cap = a.stack > 0 ? Math.min(a.stack, this.capacity(a)) : this.capacity(a);
      const fx = x + dx, fz = z + dz;
      const want = (first: ItemStack | null) => (s: ItemStack) => {
        if (first && !sameKind(first, s)) return false; // todo lo de un viaje es del mismo tipo
        return this.passes(a, s) && this.accepts(fx, y, fz, a.dir, s);
      };
      let first: ItemStack | null = null;
      let n = 0;
      let leeched = false;
      while (n < cap) {
        const s = this.pickOne(x - dx, y, z - dz, a.dir, want(first));
        if (!s) break;
        // El brazo de combustible sin energía se queda con el combustible que iba a mover (una unidad) y sigue.
        if (t.burner && !leeched && a.energy < inserterCycleKJ(t) * BURNER_LEECH_BELOW_CYCLES && (ITEMS[s.id]?.fuel ?? 0) > 0 && !a.fuel) {
          a.fuel = { ...s, count: 1 };
          this.burn(a);
          leeched = true;
          break;
        }
        first = first ?? { ...s, count: 1 };
        n++;
      }
      if (n > 0 && first) {
        a.hand = { ...first, count: n };
        a.phase = CARRY;
        a.span = a.wait = this.phaseTicks(a, cycle / 2);
        this.touched.add(k);
      }
    } else if (a.phase === CARRY) {
      const hand = a.hand;
      if (hand) {
        let left = hand.count;
        while (left > 0 && this.drop(x + dx, y, z + dz, a.dir, hand)) left--;
        a.hand = left > 0 ? { ...hand, count: left } : null;
        this.touched.add(k);
        if (left > 0) return; // si no cabe (todavía), sigue esperando con lo que le queda en la mano
      }
      a.phase = RETURN;
      a.span = a.wait = this.phaseTicks(a, cycle / 2);
    } else {
      a.phase = IDLE;
      a.span = 0;
      this.touched.add(k);
      this.work(k, a, t); // en cuanto vuelve, ya busca otro
    }
    this.saveDirty = true;
  }

  // ------------------------------------------------------------------ sincronización con los jugadores

  /**
   * Manda a cada jugador cómo van los brazos de su alrededor, para que dibuje el trabajo del brazo:
   * [x, y, z, fase (0 quieto, 1 llevando, 2 volviendo), lo que lleva de la fase (0..255), objeto en la mano, cuántos].
   * Cada segundo van todos; cada 5 ticks, los que se mueven o cambiaron.
   */
  sync(): void {
    if (this.arms.size === 0) return;
    const all = this.tickN % 20 === 0;
    if (!all && this.tickN % 5 !== 0) return;
    for (const s of this.ctx.sessions()) {
      if (!s.joined || s.dimPending) continue;
      const rows: number[][] = [];
      for (const [k, a] of this.arms) {
        if (!all && a.phase === IDLE && !this.touched.has(k)) continue;
        const x = keyX(k), z = keyZ(k);
        if (Math.hypot(x + 0.5 - s.p[0], z + 0.5 - s.p[2]) > 48) continue;
        rows.push([x, keyY(k), z, a.phase, a.span > 0 ? Math.round(255 * (1 - a.wait / a.span)) : 0, a.hand?.id ?? 0, a.hand?.count ?? 0]);
        if (rows.length >= 500) break;
      }
      if (rows.length) this.ctx.send(s, { t: 'arms', l: rows });
    }
    this.touched.clear();
  }

  onLeave(_s: Session): void {
    /* nada que soltar */
  }

  // ------------------------------------------------------------------ guardado

  flush(store: ServerStore): void {
    if (!this.saveDirty) return;
    this.saveDirty = false;
    const rows: SavedArm[] = [...this.saved.values()];
    for (const [k, a] of this.arms) {
      const plain = !a.hand && !a.fuel && a.energy === 0 && a.mode === 0 && a.stack === 0 && a.filter.every((f) => !f);
      if (plain) continue;
      rows.push([keyX(k), keyY(k), keyZ(k), a.filter, a.mode, a.stack, Math.round(a.energy * 10) / 10, a.fuel ? stackToWire(a.fuel) : null, a.hand ? stackToWire(a.hand) : null, a.phase, Math.round(a.wait * 100) / 100]);
    }
    store.setMeta('inserters', JSON.stringify(rows));
  }
}

/** Mete lo que quepa de `s` como combustible en el hueco del brazo (uno solo: del mismo tipo hasta llenar la pila). */
function insertFuel(a: Arm, s: ItemStack): number {
  const max = 64;
  if (!a.fuel) {
    const n = Math.min(s.count, max);
    a.fuel = { ...s, count: n };
    return n;
  }
  if (!sameKind(a.fuel, s)) return 0;
  const n = Math.min(s.count, max - a.fuel.count);
  a.fuel = { ...a.fuel, count: a.fuel.count + n };
  return n;
}
