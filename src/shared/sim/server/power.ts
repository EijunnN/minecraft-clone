// Programa lunar (idea-industria.md): la red eléctrica en el servidor, como la de Factorio (FACTORIO-REFERENCIA.md §3).
//
// - Los POSTES se unen por cable: al colocar uno se conecta a los postes que tenga al alcance (el menor de los dos alcances, medido entre
//   centros), los más cercanos primero, hasta 5 cables por poste, sin cerrar triángulos (no se une a un poste que ya está unido a otro al
//   que se acaba de unir). Los cables se guardan; al quitar un poste desaparecen los suyos.
// - Cada poste da energía a todo lo que toque su ÁREA DE SUMINISTRO (un cubo centrado en él). Lo que tocan dos postes une sus redes.
//   Sin contacto entre bloques: dos máquinas pegadas no forman red por sí solas.
// - Todo ocupa su HUELLA (paneles 3×3, acumuladores 2×2, postes grandes 2×2…): basta con que el área toque una casilla.
// - Cada red reparte lo que generan sus paneles, lo que piden sus consumidores y la carga de sus acumuladores (shared/logistics/energy).
//   Si falta, todo lo de la red va más lento en la misma proporción.
// - Lo que consume (brazos, hornos, extractores) se apunta con `attach` y avanza con `tick`, que le dice qué parte de lo pedido recibió.
// Guarda los cables y la carga de los acumuladores (metadatos 'power').
import {
  SOLAR_PANEL, ACCUMULATOR, POWER_BLOCKS, poleInfo, poleSpec, isPowerBlock, multiInfo, multiBox, multiControllerPos, familyBase,
  type PoleInfo,
} from '../../blocks';
import { registerRedstone, type RedstoneApi } from '../../redstone';
import {
  balance, sunPower, PANEL_KW, ACCUMULATOR_CAP, POLE_MAX_WIRES, type PowerNet,
} from '../../logistics/energy';
import { dimensionDef } from '../../dimensions';
import { posKey, keyX, keyY, keyZ } from '../posKey';
import type { ServerStore } from '../store';
import { DT, type ServerContext } from './context';
import type { Redstone } from './redstone';

const SYSTEMS = new WeakMap<RedstoneApi, Power>();

registerRedstone(POWER_BLOCKS, {
  changed: (api, x, y, z, old, id) => SYSTEMS.get(api)?.changed(x, y, z, old, id),
});

/** Cuántos bloques hacia arriba se mira para saber si un panel ve el cielo. */
const SKY_SCAN = 32;
/** Cada cuántos ticks se manda a los jugadores los cables de alrededor (y al momento si cambian). */
const WIRE_SYNC_EVERY = 40;
const WIRE_SYNC_RANGE = 96;

/** Lo que consume energía: dice qué pide cada tick y recibe qué parte le llegó. */
export interface PowerConsumer {
  demand(out: Map<number, number>): void;
  advance(sat: (k: number) => number, active: ReadonlyMap<number, number>): void;
}

/** Una caja de bloques (esquina mínima y máxima) de algo que puede tocar el área de suministro de un poste. */
export type Box = [number, number, number, number, number, number];

interface Net {
  gens: number[];
  accs: number[];
  /** Cuánto piden, reciben y generan ahora (para paneles de información y pruebas). */
  supply: number;
  demand: number;
  stored: number;
  satisfaction: number;
  poles: number;
  entities: number;
}

export interface PowerInfo {
  supply: number;
  demand: number;
  stored: number;
  cap: number;
  satisfaction: number;
  poles: number;
}

const edgeKey = (a: number, b: number): string => (a < b ? `${a},${b}` : `${b},${a}`);
const cellBox = (k: number): Box => [keyX(k), keyY(k), keyZ(k), keyX(k) + 1, keyY(k) + 1, keyZ(k) + 1];

export class Power {
  /** Postes cargados: posición del controlador → sus datos. */
  private poles = new Map<number, PoleInfo>();
  /** Cables (pares de postes), aunque uno de los dos extremos aún no esté cargado. */
  private edges = new Set<string>();
  /** Postes que ya se cablearon alguna vez (al recargar el chunk no se vuelven a conectar). */
  private wired = new Set<number>();
  private gens = new Map<number, Box>();
  private accs = new Map<number, Box>();
  private charge = new Map<number, number>();
  /** Todo lo que consume: posición → caja que ocupa. */
  private consumers = new Map<number, Box>();
  /** Red de cada entidad (consumidor, panel o acumulador) y de cada poste. */
  private netOf = new Map<number, number>();
  private nets: Net[] = [];
  private dirty = true;
  private covered = new Map<number, boolean>();
  private savedCharge = new Map<number, number>();
  private saveDirty = false;
  private wiresDirty = true;
  private tickCount = 0;
  private lastSent = new Map<string, number>();
  private list: PowerConsumer[] = [];

  constructor(private ctx: ServerContext, rs: Redstone, store: ServerStore) {
    SYSTEMS.set(rs, this);
    try {
      const raw = JSON.parse(store.getMeta('power') ?? '{}') as { edges?: number[][]; wired?: number[][]; charge?: number[][] };
      for (const e of raw.edges ?? []) {
        if (Array.isArray(e) && e.length === 6 && e.every(Number.isFinite)) this.edges.add(edgeKey(posKey(e[0], e[1], e[2]), posKey(e[3], e[4], e[5])));
      }
      for (const w of raw.wired ?? []) if (Array.isArray(w) && w.length === 3 && w.every(Number.isFinite)) this.wired.add(posKey(w[0], w[1], w[2]));
      for (const c of raw.charge ?? []) {
        if (Array.isArray(c) && c.length === 4 && c.every(Number.isFinite)) this.savedCharge.set(posKey(c[0], c[1], c[2]), Math.max(0, Math.min(ACCUMULATOR_CAP, c[3])));
      }
    } catch {
      /* mundo sin red guardada */
    }
  }

  /** Apunta algo que consume (para que `tick` le dé energía). */
  register(c: PowerConsumer): void {
    this.list.push(c);
  }

  /** Lo que consume y ocupa `box` (por defecto la casilla de `k`) queda a la espera de un poste que lo alcance. */
  attach(k: number, box?: Box): void {
    this.consumers.set(k, box ?? cellBox(k));
    this.dirty = true;
  }

  detach(k: number): void {
    if (this.consumers.delete(k)) this.dirty = true;
  }

  /** Posición del controlador de lo que ocupa la casilla (x, y, z) (ella misma si no es de varias casillas). */
  private ctrlKey(x: number, y: number, z: number): number {
    const id = this.ctx.world.getBlock(x, y, z);
    const c = multiControllerPos(id, x, y, z);
    return c ? posKey(c[0], c[1], c[2]) : posKey(x, y, z);
  }

  // ------------------------------------------------------------------ bloques

  changed(x: number, y: number, z: number, old: number, id: number): void {
    const k = posKey(x, y, z);
    const mi = multiInfo(id);
    const ctrl = !mi || mi.controller; // sólo la casilla principal representa a la máquina
    const pi = ctrl ? poleInfo(id, x, y, z) : null;
    if (pi) {
      this.poles.set(k, pi);
      // Recién puesto (no recargado con su chunk): se cablea con lo que tenga cerca.
      if (old !== -1 && !this.wired.has(k)) this.autoconnect(k);
      this.wired.add(k);
      this.saveDirty = true;
    } else if (this.poles.delete(k)) {
      for (const e of [...this.edges]) if (e.split(',').includes(String(k))) this.edges.delete(e);
      this.wired.delete(k);
      this.saveDirty = true;
    }
    const base = id > 0 ? familyBase(id) : 0;
    if (ctrl && base === SOLAR_PANEL) this.gens.set(k, multiBox(id, x, y, z)!);
    else if (this.gens.delete(k)) this.covered.delete(k);
    if (ctrl && base === ACCUMULATOR) {
      this.accs.set(k, multiBox(id, x, y, z)!);
      if (!this.charge.has(k)) {
        this.charge.set(k, this.savedCharge.get(k) ?? 0);
        this.savedCharge.delete(k);
      }
    } else if (this.accs.delete(k)) {
      this.charge.delete(k);
      this.saveDirty = true;
    }
    if (isPowerBlock(id) || old > 0) {
      this.dirty = true;
      this.wiresDirty = true;
    }
  }

  /** Cablea el poste nuevo `k` con los postes al alcance, los más cercanos primero. */
  private autoconnect(k: number): void {
    const me = this.poles.get(k)!;
    const spec = poleSpec(me.kind);
    const cands: { k: number; d: number }[] = [];
    for (const [o, oi] of this.poles) {
      if (o === k) continue;
      const reach = Math.min(spec.reach, poleSpec(oi.kind).reach);
      const d = Math.hypot(oi.center[0] - me.center[0], oi.center[1] - me.center[1], oi.center[2] - me.center[2]);
      if (d <= reach + 1e-9) cands.push({ k: o, d });
    }
    cands.sort((a, b) => a.d - b.d);
    const joined: number[] = [];
    let mine = this.wireCount(k);
    for (const c of cands) {
      if (mine >= POLE_MAX_WIRES) break;
      if (this.wireCount(c.k) >= POLE_MAX_WIRES) continue;
      // Sin triángulos: si ese poste ya está unido a otro al que acabamos de unirnos, es redundante.
      if (joined.some((j) => this.edges.has(edgeKey(j, c.k)))) continue;
      this.edges.add(edgeKey(k, c.k));
      joined.push(c.k);
      mine++;
    }
  }

  private wireCount(k: number): number {
    let n = 0;
    const s = String(k);
    for (const e of this.edges) {
      const [a, b] = e.split(',');
      if (a === s || b === s) n++;
    }
    return n;
  }

  // ------------------------------------------------------------------ redes

  private rebuild(): void {
    this.dirty = false;
    // Unión de postes: por cable y por lo que dos postes tocan a la vez.
    const parent = new Map<number, number>();
    const find = (a: number): number => {
      let r = a;
      while (parent.get(r)! !== r) r = parent.get(r)!;
      while (parent.get(a)! !== r) {
        const n = parent.get(a)!;
        parent.set(a, r);
        a = n;
      }
      return r;
    };
    const union = (a: number, b: number) => {
      const ra = find(a), rb = find(b);
      if (ra !== rb) parent.set(ra, rb);
    };
    for (const p of this.poles.keys()) parent.set(p, p);
    for (const e of this.edges) {
      const [a, b] = e.split(',').map(Number);
      if (this.poles.has(a) && this.poles.has(b)) union(a, b);
    }
    // Todo lo eléctrico que ocupa cada casilla (para no recorrer las entidades por cada poste).
    const owner = new Map<number, number>();
    const put = (k: number, box: Box) => {
      for (let y = box[1]; y < box[4]; y++) for (let z = box[2]; z < box[5]; z++) for (let x = box[0]; x < box[3]; x++) owner.set(posKey(x, y, z), k);
    };
    for (const [g, box] of this.gens) put(g, box);
    for (const [a, box] of this.accs) put(a, box);
    for (const [c, box] of this.consumers) put(c, box);
    // Cada poste toca las entidades que hay en su área (un cubo centrado en él).
    const touched = new Map<number, number[]>(); // entidad → postes que la tocan
    for (const [p, info] of this.poles) {
      const d = poleSpec(info.kind).area;
      const [cx, cy, cz] = info.center;
      const x0 = Math.floor(cx - d + 1e-9), x1 = Math.ceil(cx + d - 1e-9) - 1;
      const y0 = Math.floor(cy - d + 1e-9), y1 = Math.ceil(cy + d - 1e-9) - 1;
      const z0 = Math.floor(cz - d + 1e-9), z1 = Math.ceil(cz + d - 1e-9) - 1;
      const seen = new Set<number>();
      for (let y = y0; y <= y1; y++) {
        for (let z = z0; z <= z1; z++) {
          for (let x = x0; x <= x1; x++) {
            const o = owner.get(posKey(x, y, z));
            if (o === undefined || seen.has(o)) continue;
            seen.add(o);
            const l = touched.get(o);
            if (l) l.push(p);
            else touched.set(o, [p]);
          }
        }
      }
    }
    for (const ps of touched.values()) for (let i = 1; i < ps.length; i++) union(ps[0], ps[i]);
    // Redes: una por raíz.
    this.netOf.clear();
    this.nets = [];
    const idx = new Map<number, number>();
    const netFor = (root: number): number => {
      let i = idx.get(root);
      if (i === undefined) {
        i = this.nets.length;
        idx.set(root, i);
        this.nets.push({ gens: [], accs: [], supply: 0, demand: 0, stored: 0, satisfaction: 1, poles: 0, entities: 0 });
      }
      return i;
    };
    for (const p of this.poles.keys()) {
      const i = netFor(find(p));
      this.netOf.set(p, i);
      this.nets[i].poles++;
    }
    for (const [e, ps] of touched) {
      const i = netFor(find(ps[0]));
      this.netOf.set(e, i);
      this.nets[i].entities++;
      if (this.gens.has(e)) this.nets[i].gens.push(e);
      else if (this.accs.has(e)) this.nets[i].accs.push(e);
    }
  }

  private netIndex(k: number): number {
    if (this.dirty) this.rebuild();
    return this.netOf.get(k) ?? -1;
  }

  /** Cuántas redes con algún poste hay (para las pruebas). */
  get netCount(): number {
    if (this.dirty) this.rebuild();
    return this.nets.filter((n) => n.poles > 0).length;
  }

  get poleCount(): number {
    return this.poles.size;
  }

  /** Los cables que hay ahora entre postes cargados, como pares de posiciones (para las pruebas y el envío a los clientes). */
  wireList(): [number, number][] {
    const out: [number, number][] = [];
    for (const e of this.edges) {
      const [a, b] = e.split(',').map(Number);
      if (this.poles.has(a) && this.poles.has(b)) out.push([a, b]);
    }
    return out;
  }

  /** ¿Recibe energía algo que ocupa (x, y, z)? (¿lo toca el área de algún poste?) */
  powered(x: number, y: number, z: number): boolean {
    return this.netIndex(this.ctrlKey(x, y, z)) >= 0;
  }

  /** Cómo va la red de lo que ocupa (x, y, z) (null si no está en ninguna). */
  info(x: number, y: number, z: number): PowerInfo | null {
    const i = this.netIndex(this.ctrlKey(x, y, z));
    if (i < 0) return null;
    const n = this.nets[i];
    return { supply: n.supply, demand: n.demand, stored: n.stored, cap: n.accs.length * ACCUMULATOR_CAP, satisfaction: n.satisfaction, poles: n.poles };
  }

  /** Carga del acumulador que ocupa (x, y, z) (para las pruebas). */
  chargeOf(x: number, y: number, z: number): number {
    return this.charge.get(this.ctrlKey(x, y, z)) ?? 0;
  }

  // ------------------------------------------------------------------ cada tick

  /** ¿Ve el cielo el panel de `k`? (se mira una vez por segundo, por encima de su caja) */
  private open(k: number, box: Box): boolean {
    const c = this.covered.get(k);
    if (c !== undefined && this.tickCount % 20 !== k % 20) return !c;
    const x = Math.floor((box[0] + box[3]) / 2), z = Math.floor((box[2] + box[5]) / 2);
    let blocked = false;
    for (let i = 0; i < SKY_SCAN && !blocked; i++) if (this.ctx.world.getBlock(x, box[4] + i, z) > 0) blocked = true;
    this.covered.set(k, blocked);
    return !blocked;
  }

  /** Un tick: los consumidores piden, cada red reparte, y a cada consumidor le llega su parte. */
  tick(): void {
    this.tickCount++;
    if (this.dirty) this.rebuild();
    const active = new Map<number, number>();
    for (const c of this.list) c.demand(active);
    const sky = dimensionDef(this.ctx.dim).sky;
    const w = this.ctx.worldTime();
    const sun = sky ? sunPower(w - Math.floor(w)) : 0;
    for (const n of this.nets) {
      n.supply = 0;
      n.demand = 0;
      n.stored = 0;
    }
    for (const n of this.nets) {
      if (sun > 0) for (const g of n.gens) if (this.open(g, this.gens.get(g)!)) n.supply += PANEL_KW * sun;
      for (const a of n.accs) n.stored += this.charge.get(a) ?? 0;
    }
    for (const [k, kw] of active) {
      const i = this.netOf.get(k);
      if (i !== undefined) this.nets[i].demand += kw;
    }
    for (const n of this.nets) {
      if (n.supply === 0 && n.demand === 0 && n.stored === 0 && n.accs.length === 0) {
        n.satisfaction = 1;
        continue;
      }
      const net: PowerNet = { supply: n.supply, demand: n.demand, stored: n.stored, cap: n.accs.length * ACCUMULATOR_CAP, accumulators: n.accs.length };
      const r = balance(net, DT);
      n.satisfaction = r.satisfaction;
      if (n.accs.length && Math.abs(r.stored - n.stored) > 1e-9) {
        const each = r.stored / n.accs.length;
        for (const a of n.accs) this.charge.set(a, each);
        n.stored = r.stored;
        this.saveDirty = true;
      }
    }
    const sat = (k: number): number => {
      const i = this.netOf.get(k);
      return i === undefined ? 0 : this.nets[i].satisfaction;
    };
    for (const c of this.list) c.advance(sat, active);
    if (this.tickCount % 10 === 0) this.syncNoPower(active, sat);
    if (this.wiresDirty || this.tickCount % WIRE_SYNC_EVERY === 0) this.syncWires();
  }

  /**
   * El rayo rojo de Factorio: los consumidores que piden energía y no la reciben (sin poste que los toque o con la red sin nada).
   * Cada fila: [x, y, z] del punto sobre el que se dibuja (centro de la parte de arriba).
   */
  private syncNoPower(active: ReadonlyMap<number, number>, sat: (k: number) => number): void {
    const rows: number[][] = [];
    for (const [k] of active) {
      if (sat(k) > 0.02) continue;
      const x = keyX(k), y = keyY(k), z = keyZ(k);
      const box = multiBox(this.ctx.world.getBlock(x, y, z), x, y, z);
      rows.push(box ? [(box[0] + box[3]) / 2, box[4] + 0.2, (box[2] + box[5]) / 2] : [x + 0.5, y + 0.95, z + 0.5]);
    }
    for (const s of this.ctx.sessions()) {
      if (!s.joined || s.dimPending) continue;
      const near = rows.filter((r) => Math.hypot(r[0] - s.p[0], r[2] - s.p[2]) <= 48).slice(0, 200);
      const had = this.noPowerSent.get(s.id) ?? 0;
      if (near.length === 0 && had === 0) continue;
      this.noPowerSent.set(s.id, near.length);
      this.ctx.send(s, { t: 'nopower', l: near });
    }
  }

  private noPowerSent = new Map<string, number>();

  /** Manda a cada jugador los cables de alrededor: [x1, y1, z1, x2, y2, z2, 0 cobre (poste pequeño) / 1 gris] con los puntos de enganche. */
  private syncWires(): void {
    const changed = this.wiresDirty;
    this.wiresDirty = false;
    const all = this.wireList();
    for (const s of this.ctx.sessions()) {
      if (!s.joined || s.dimPending) continue;
      const rows: number[][] = [];
      for (const [a, b] of all) {
        const pa = this.poles.get(a)!, pb = this.poles.get(b)!;
        if (Math.hypot(pa.attach[0] - s.p[0], pa.attach[2] - s.p[2]) > WIRE_SYNC_RANGE) continue;
        rows.push([...pa.attach, ...pb.attach, pa.kind === 'small' && pb.kind === 'small' ? 0 : 1]);
      }
      const sig = rows.length * 1000003 + rows.reduce((h, r) => (h * 31 + Math.round(r[0] * 7 + r[2] * 13 + r[3] * 3 + r[5])) | 0, 0);
      const key = String(s.id);
      if (!changed && this.lastSent.get(key) === sig) continue;
      this.lastSent.set(key, sig);
      this.ctx.send(s, { t: 'wires', l: rows });
    }
  }

  flush(store: ServerStore): void {
    if (!this.saveDirty) return;
    this.saveDirty = false;
    const edges: number[][] = [];
    for (const e of this.edges) {
      const [a, b] = e.split(',').map(Number);
      edges.push([keyX(a), keyY(a), keyZ(a), keyX(b), keyY(b), keyZ(b)]);
    }
    const wired = [...this.wired].map((k) => [keyX(k), keyY(k), keyZ(k)]);
    const charge: number[][] = [];
    for (const [k, c] of this.savedCharge) charge.push([keyX(k), keyY(k), keyZ(k), Math.round(c)]);
    for (const [k, c] of this.charge) if (c > 0) charge.push([keyX(k), keyY(k), keyZ(k), Math.round(c)]);
    store.setMeta('power', JSON.stringify({ edges, wired, charge }));
  }
}

