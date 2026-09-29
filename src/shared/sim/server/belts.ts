// Programa lunar (idea-industria.md): las cintas transportadoras, las subterráneas y los divisores en el servidor.
//
// La red (shared/logistics/network) tiene una pieza por cada bloque de la logística cargado, enlaza cada una con lo de delante, empareja
// las subterráneas, levanta sus túneles y une las dos mitades de cada divisor. Este sistema
// - la mantiene con los bloques (por el gancho `changed` de la redstone, que también avisa al cargar un chunk) y suelta lo que llevaban
//   las piezas que se rompen;
// - decide la FORMA de las cintas (recta o curva) según las de alrededor, cambiando el estado del bloque como hacen las escaleras;
// - las mueve cada tick (20 por segundo) con el motor compartido;
// - deja que otros sistemas (brazos, máquinas) metan y saquen objetos (`put`, `take`, `peek`);
// - manda a los jugadores lo que llevan las piezas de su alrededor ('belts'): el cliente las mueve por su cuenta con el mismo motor y
//   las corrige con esto (al momento si algo entró o salió de fuera, y de vez en cuando por si se desvían);
// - guarda lo que llevan (metadatos 'belts' y 'tunnels' de la dimensión) y la configuración de los divisores ('splitters').
import { BELTS, UNDERGROUNDS, SPLITTERS, beltInfo, beltState } from '../../blocks';
import { registerRedstone, UPDATE_CLIENTS, type RedstoneApi } from '../../redstone';
import { BeltNetwork } from '../../logistics/network';
import {
  shapeOf, beltPut, beltTake, beltHas, beltCount, BELT_DX, BELT_DZ, BELT_SPACING, K_BELT, type Belt,
} from '../../logistics/belts';
import { stackToWire, stackFromWire, type WireStack } from '../../protocol';
import type { ItemStack } from '../../items';
import { posKey, keyX, keyY, keyZ } from '../posKey';
import type { ServerStore } from '../store';
import { DT, type ServerContext, type Session } from './context';
import type { Redstone } from './redstone';

const SYSTEMS = new WeakMap<RedstoneApi, Belts>();

const HOOKS = {
  changed: (api: RedstoneApi, x: number, y: number, z: number, old: number, id: number) => {
    const s = SYSTEMS.get(api);
    if (s) s.changed(api, x, y, z, old, id);
  },
  neighbor: (api: RedstoneApi, x: number, y: number, z: number) => SYSTEMS.get(api)?.touch(x, y, z),
};
registerRedstone(BELTS, HOOKS);
registerRedstone(UNDERGROUNDS, HOOKS);
registerRedstone(SPLITTERS, HOOKS);
// Cualquier bloque puesto o quitado junto a una cinta puede cambiar su forma (la nueva cinta de al lado): lo avisa el hook de arriba.

/** Ticks entre envíos de corrección a los jugadores. */
const SYNC_EVERY = 10;
/** Distancia (bloques) a la que se mandan las cintas a un jugador. */
const SYNC_RANGE = 56;
/** Como mucho, tantas cintas por mensaje. */
const SYNC_MAX = 700;

type SavedItem = [number, WireStack, number];
/** Configuración de un divisor: [prioridad de entrada, de salida, objeto filtrado, lado del filtro]. */
export type SplitterConfig = { inPri: -1 | 0 | 1; outPri: -1 | 0 | 1; filter: number; filterSide: -1 | 1 };

export class Belts {
  /** La red de piezas (cintas, subterráneas, divisores y túneles). */
  readonly net: BeltNetwork;
  /** Lo guardado de las piezas cuyo chunk aún no se ha cargado, y de los tramos de túnel que aún no existen. */
  private saved = new Map<number, SavedItem[]>();
  private savedTunnel = new Map<string, SavedItem[]>();
  private savedSplit = new Map<number, SplitterConfig>();
  private api: RedstoneApi | null = null;
  private topologyDirty = true;
  private dirty = new Set<number>();
  /** Piezas a las que algo de fuera les metió o sacó objetos: van al momento a los clientes. */
  private touchedSync = new Set<number>();
  private splitDirty = new Set<number>();
  private saveDirty = false;
  private tickCount = 0;

  constructor(private ctx: ServerContext, rs: Redstone, store: ServerStore) {
    SYSTEMS.set(rs, this);
    this.net = new BeltNetwork((x, y, z) => this.api?.getBlock(x, y, z) ?? ctx.world.getBlock(x, y, z));
    this.net.onSpill = (stacks, x, y, z) => ctx.entities.dropStacks(stacks.map((s) => ({ ...s })), x + 0.5, y + 0.3, z + 0.5);
    const parse = (raw: unknown): SavedItem[] => {
      const items: SavedItem[] = [];
      if (!Array.isArray(raw)) return items;
      for (const it of raw as unknown[]) {
        if (!Array.isArray(it) || it.length !== 3) continue;
        const w = it[1] as WireStack;
        if (stackFromWire(w)) items.push([Number(it[0]) === 1 ? 1 : 0, w, Math.max(0, Math.min(0.999, Number(it[2]) / 255 || 0))]);
      }
      return items;
    };
    try {
      const raw = JSON.parse(store.getMeta('belts') ?? '[]') as unknown;
      if (Array.isArray(raw)) {
        for (const row of raw) {
          if (!Array.isArray(row) || row.length !== 4 || !row.slice(0, 3).every((n) => Number.isFinite(n)) || !Array.isArray(row[3])) continue;
          const items = parse(row[3]);
          if (items.length) this.saved.set(posKey(row[0], row[1], row[2]), items);
        }
      }
      const tun = JSON.parse(store.getMeta('tunnels') ?? '[]') as unknown;
      if (Array.isArray(tun)) {
        for (const row of tun) {
          if (!Array.isArray(row) || row.length !== 5 || !row.slice(0, 4).every((n) => Number.isFinite(n)) || !Array.isArray(row[4])) continue;
          const items = parse(row[4]);
          if (items.length) this.savedTunnel.set(`${posKey(row[0], row[1], row[2])}:${row[3]}`, items);
        }
      }
      const sp = JSON.parse(store.getMeta('splitters') ?? '[]') as unknown;
      if (Array.isArray(sp)) {
        for (const r of sp) {
          if (!Array.isArray(r) || r.length !== 7 || !r.every((n) => Number.isFinite(n))) continue;
          const sgn = (v: number): -1 | 0 | 1 => (v < 0 ? -1 : v > 0 ? 1 : 0);
          this.savedSplit.set(posKey(r[0], r[1], r[2]), { inPri: sgn(r[3]), outPri: sgn(r[4]), filter: Math.max(0, r[5] | 0), filterSide: r[6] < 0 ? -1 : 1 });
        }
      }
    } catch {
      /* mundo sin cintas guardadas */
    }
  }

  // ------------------------------------------------------------------ bloques

  /** ¿Hay una pieza de la red en (x, y, z)? Y su estado. */
  at(x: number, y: number, z: number): Belt | null {
    return this.net.tiles.get(posKey(x, y, z)) ?? null;
  }

  get count(): number {
    return this.net.tiles.size;
  }

  /** Cambió el bloque de (x, y, z): una pieza que se pone (o se carga), cambia de estado o se quita. */
  changed(api: RedstoneApi, x: number, y: number, z: number, _old: number, _id: number): void {
    this.api = api;
    const k = posKey(x, y, z);
    const r = this.net.sync(x, y, z);
    if (r.removed) {
      // Se rompe: lo que llevaba cae al suelo.
      const drops: ItemStack[] = [];
      for (const lane of r.removed.lanes) for (const it of lane) drops.push(it.s);
      if (drops.length) this.ctx.entities.dropStacks(drops, x + 0.5, y + 0.3, z + 0.5);
      this.saveDirty = true;
    }
    if (r.created && r.belt) {
      const sv = this.saved.get(k);
      if (sv) {
        for (const [lane, w, p] of sv) {
          const s = stackFromWire(w);
          if (s) r.belt.lanes[lane].push({ s: { ...s, count: 1 }, p });
        }
        for (const lane of r.belt.lanes) lane.sort((a, c) => c.p - a.p);
        this.saved.delete(k);
      }
    }
    this.topologyDirty = true;
    this.mark(x, y, z);
  }

  /** Marca (x, y, z) y lo que le rodea para volver a calcular sus conexiones y su forma. */
  private mark(x: number, y: number, z: number): void {
    this.dirty.add(posKey(x, y, z));
    for (let d = 0; d < 4; d++) this.dirty.add(posKey(x + BELT_DX[d], y, z + BELT_DZ[d]));
    // Las cintas que van hacia (x, y, z) desde arriba o abajo no se conectan (no hay rampas todavía).
  }

  touch(x: number, y: number, z: number): void {
    this.mark(x, y, z);
    this.topologyDirty = true;
  }

  /** Recalcula conexiones y formas de lo marcado (y cambia el bloque si su forma cambió) y aplica lo guardado a lo que ya existe. */
  private refresh(): void {
    this.net.link();
    const at = this.net.at;
    for (const k of this.dirty) {
      const b = this.net.tiles.get(k);
      if (!b || b.kind !== K_BELT) continue;
      const shape = shapeOf(b, at).shape;
      const cur = this.api ? this.api.getBlock(b.x, b.y, b.z) : -1;
      const info = beltInfo(cur);
      if (info && info.shape !== shape && this.api) this.api.setBlock(b.x, b.y, b.z, beltState(b.tier, b.dir, shape), UPDATE_CLIENTS);
    }
    this.dirty.clear();
    // Lo guardado de los túneles y de los divisores, en cuanto existen.
    for (const { entrance, index, belt } of this.net.allTunnelPieces()) {
      const key = `${entrance}:${index}`;
      const sv = this.savedTunnel.get(key);
      if (!sv) continue;
      for (const [lane, w, p] of sv) {
        const s = stackFromWire(w);
        if (s) belt.lanes[lane].push({ s: { ...s, count: 1 }, p });
      }
      for (const lane of belt.lanes) lane.sort((a, c) => c.p - a.p);
      this.savedTunnel.delete(key);
    }
    for (const [ck, st] of this.net.splits) {
      const cfg = this.savedSplit.get(ck);
      if (!cfg) continue;
      st.inPri = cfg.inPri;
      st.outPri = cfg.outPri;
      st.filter = cfg.filter;
      st.filterSide = cfg.filterSide;
      this.savedSplit.delete(ck);
    }
    this.topologyDirty = false;
  }

  // ------------------------------------------------------------------ divisores

  /** Configuración del divisor cuya casilla principal es (x, y, z) (null si no hay). */
  splitterConfig(x: number, y: number, z: number): SplitterConfig | null {
    const st = this.net.splits.get(posKey(x, y, z));
    return st ? { inPri: st.inPri, outPri: st.outPri, filter: st.filter, filterSide: st.filterSide } : null;
  }

  /** Cambia la configuración del divisor de (x, y, z) (su casilla principal). true si lo hay. */
  setSplitterConfig(x: number, y: number, z: number, cfg: Partial<SplitterConfig>): boolean {
    const st = this.net.splits.get(posKey(x, y, z));
    if (!st) return false;
    if (cfg.inPri !== undefined) st.inPri = cfg.inPri;
    if (cfg.outPri !== undefined) st.outPri = cfg.outPri;
    if (cfg.filter !== undefined) st.filter = Math.max(0, cfg.filter | 0);
    if (cfg.filterSide !== undefined) st.filterSide = cfg.filterSide < 0 ? -1 : 1;
    this.splitDirty.add(posKey(x, y, z));
    this.topologyDirty = true; // la prioridad de entrada cambia el orden de proceso
    this.saveDirty = true;
    return true;
  }

  // ------------------------------------------------------------------ objetos (para brazos y máquinas)

  /** Mete `s` (de uno) en la pieza de (x, y, z) por el carril `lane`, en `p`. false si no hay o no cabe. */
  put(x: number, y: number, z: number, lane: 0 | 1, p: number, s: ItemStack): boolean {
    const b = this.at(x, y, z);
    if (!b || !beltPut(b, lane, p, s)) return false;
    this.touchedSync.add(posKey(x, y, z));
    this.saveDirty = true;
    return true;
  }

  /** ¿Hay sitio en la pieza para meter algo por ese carril y posición? */
  room(x: number, y: number, z: number, lane: 0 | 1, p: number): boolean {
    const b = this.at(x, y, z);
    if (!b) return false;
    for (const it of b.lanes[lane]) if (Math.abs(it.p - p) < BELT_SPACING - 1e-6) return false;
    return true;
  }

  /** Saca el objeto más adelantado de la pieza que cumpla `want` (null si no hay). */
  take(x: number, y: number, z: number, want?: (s: ItemStack) => boolean): ItemStack | null {
    const b = this.at(x, y, z);
    if (!b) return null;
    const s = beltTake(b, want);
    if (s) {
      this.touchedSync.add(posKey(x, y, z));
      this.saveDirty = true;
    }
    return s;
  }

  /** ¿Hay algo que coger (que cumpla `want`) en la pieza? */
  peek(x: number, y: number, z: number, want?: (s: ItemStack) => boolean): boolean {
    const b = this.at(x, y, z);
    return !!b && beltHas(b, want);
  }

  // ------------------------------------------------------------------ cada tick

  tick(): void {
    if (this.net.tiles.size === 0) return;
    if (this.dirty.size || this.topologyDirty) this.refresh();
    this.net.step(DT);
    this.tickCount++;
    const periodic = this.tickCount % SYNC_EVERY === 0;
    if (periodic || this.touchedSync.size || this.splitDirty.size) this.sync(periodic);
    this.touchedSync.clear();
    this.splitDirty.clear();
    if (periodic) this.saveDirty = true; // lo que llevan cambia con el tiempo
  }

  private row(b: Belt, head: number[]): number[] {
    const n0 = b.lanes[0].length;
    const row = [...head, (b.moving[0] ? 1 : 0) | (b.moving[1] ? 2 : 0), n0];
    for (const it of b.lanes[0]) row.push(it.s.id, Math.round(it.p * 255));
    for (const it of b.lanes[1]) row.push(it.s.id, Math.round(it.p * 255));
    return row;
  }

  /**
   * Manda a cada jugador las piezas cercanas (todas las que llevan algo en el envío periódico; las tocadas, al momento):
   *   l: [x, y, z, movimiento, n0, (objeto, posición)…] de cada pieza con bloque;
   *   u: [x, y, z (de la entrada), tramo, movimiento, n0, (objeto, posición)…] de cada tramo de túnel;
   *   c: [x, y, z (de la casilla principal), prioridad de entrada, de salida, filtro, lado] de cada divisor.
   */
  private sync(all: boolean): void {
    const ctx = this.ctx;
    for (const s of ctx.sessions()) {
      if (!s.joined || s.dimPending) continue;
      const rows: number[][] = [];
      const near = (x: number, y: number, z: number) => {
        const dx = x + 0.5 - s.p[0], dz = z + 0.5 - s.p[2];
        return dx * dx + dz * dz <= SYNC_RANGE * SYNC_RANGE && Math.abs(y - s.p[1]) <= 48;
      };
      for (const b of this.net.tiles.values()) {
        const k = posKey(b.x, b.y, b.z);
        if (!all && !this.touchedSync.has(k)) continue;
        if (!near(b.x, b.y, b.z)) continue;
        if (beltCount(b) === 0 && !this.touchedSync.has(k)) continue;
        rows.push(this.row(b, [b.x, b.y, b.z]));
        if (rows.length >= SYNC_MAX) break;
      }
      const tun: number[][] = [];
      if (all) {
        for (const { entrance, index, belt } of this.net.allTunnelPieces()) {
          if (beltCount(belt) === 0 || !near(keyX(entrance), keyY(entrance), keyZ(entrance))) continue;
          tun.push(this.row(belt, [keyX(entrance), keyY(entrance), keyZ(entrance), index]));
        }
      }
      const cfg: number[][] = [];
      for (const [ck, st] of this.net.splits) {
        const x = keyX(ck), y = keyY(ck), z = keyZ(ck);
        if ((all || this.splitDirty.has(ck)) && near(x, y, z) && (st.inPri || st.outPri || st.filter || this.splitDirty.has(ck))) {
          cfg.push([x, y, z, st.inPri, st.outPri, st.filter, st.filterSide]);
        }
      }
      if (rows.length || tun.length || cfg.length) ctx.send(s, { t: 'belts', l: rows, ...(tun.length ? { u: tun } : {}), ...(cfg.length ? { c: cfg } : {}) });
    }
  }

  onLeave(_s: Session): void {
    /* nada que soltar */
  }

  // ------------------------------------------------------------------ guardado

  flush(store: ServerStore): void {
    if (!this.saveDirty) return;
    this.saveDirty = false;
    const rows: [number, number, number, SavedItem[]][] = [];
    for (const [k, items] of this.saved) rows.push([keyX(k), keyY(k), keyZ(k), items.map((i): SavedItem => [i[0], i[1], Math.round(i[2] * 255)])]);
    const pack = (b: Belt): SavedItem[] => {
      const items: SavedItem[] = [];
      for (let l = 0; l < 2; l++) for (const it of b.lanes[l]) items.push([l, stackToWire(it.s)!, Math.round(it.p * 255)]);
      return items;
    };
    for (const b of this.net.tiles.values()) {
      if (beltCount(b) === 0) continue;
      rows.push([b.x, b.y, b.z, pack(b)]);
    }
    store.setMeta('belts', JSON.stringify(rows));
    const tun: [number, number, number, number, SavedItem[]][] = [];
    for (const [key, items] of this.savedTunnel) {
      const [ek, idx] = key.split(':').map(Number);
      tun.push([keyX(ek), keyY(ek), keyZ(ek), idx, items]);
    }
    for (const { entrance, index, belt } of this.net.allTunnelPieces()) {
      if (beltCount(belt) > 0) tun.push([keyX(entrance), keyY(entrance), keyZ(entrance), index, pack(belt)]);
    }
    store.setMeta('tunnels', JSON.stringify(tun));
    const sp: number[][] = [];
    for (const [ck, cfg] of this.savedSplit) sp.push([keyX(ck), keyY(ck), keyZ(ck), cfg.inPri, cfg.outPri, cfg.filter, cfg.filterSide]);
    for (const [ck, st] of this.net.splits) {
      if (st.inPri || st.outPri || st.filter) sp.push([keyX(ck), keyY(ck), keyZ(ck), st.inPri, st.outPri, st.filter, st.filterSide]);
    }
    store.setMeta('splitters', JSON.stringify(sp));
  }
}

