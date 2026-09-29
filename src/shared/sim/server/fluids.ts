// Programa lunar: los fluidos en el servidor (Factorio, FACTORIO-REFERENCIA.md §7): tuberías, tuberías subterráneas, tanques, bombas y bombas
// de agua, sobre el motor de logistics/fluidNet.ts.
//
// - Cada tubería, punta subterránea, bomba de agua y tanque es una CAJA con volumen y un fluido. Dos cajas se unen si cada una ofrece una
//   cara hacia la otra (una tubería ofrece las seis; la punta subterránea, la suya; el tanque, los lados de su casilla de abajo); las puntas
//   subterráneas se unen además con su pareja (hasta 10 casillas, en línea, mirando en sentidos contrarios).
// - La forma de una tubería (qué brazos tiene) se calcula aquí según lo que tiene alrededor y se pone en el bloque.
// - Una bomba mueve hasta 1 200/s de la caja de detrás a la de delante, con energía; una bomba de agua rellena su caja con 1 200/s de agua si
//   tiene agua detrás. Con más cajas, los fluidos se reparten solos por diferencia de nivel.
// Se guarda lo que hay en cada caja (metadatos 'fluids').
import {
  PIPE, PIPE_TO_GROUND, STORAGE_TANK, PUMP, OFFSHORE_PUMP, pipeMask, pipeState, isPipe, isUndergroundPipe, undergroundPipeDir, isTankBlock, isPumpBlock,
  isOffshorePump, offshorePumpDir, faceOfDir, oppositeFace, PIPE_FACE_DX, PIPE_FACE_DY, PIPE_FACE_DZ, multiInfo, multiControllerPos, multiBox, WATER,
} from '../../blocks';
import { registerRedstone, UPDATE_CLIENTS, type RedstoneApi } from '../../redstone';
import { FluidGraph } from '../../logistics/fluidNet';
import {
  PIPE_VOLUME, TANK_VOLUME, PUMP_RATE, OFFSHORE_RATE, PUMP_KW, PIPE_UNDERGROUND_MAX, FLOW_SUBSTEPS, fluidByName,
} from '../../logistics/fluidTypes';
import { posKey, keyX, keyY, keyZ } from '../posKey';
import type { ServerStore } from '../store';
import type { ServerContext } from './context';
import type { Redstone } from './redstone';
import type { Power, PowerConsumer } from './power';

const SYSTEMS = new WeakMap<RedstoneApi, Fluids>();

registerRedstone([PIPE, PIPE_TO_GROUND, STORAGE_TANK, PUMP, OFFSHORE_PUMP], {
  changed: (api, x, y, z, old, id) => SYSTEMS.get(api)?.changed(api, x, y, z, old, id),
});

const WATER_FLUID = fluidByName('water')!.id;
/** Cada cuántos ticks se manda a los jugadores lo que hay en las cajas de alrededor. */
const SYNC_EVERY = 10;
const SYNC_RANGE = 40;
const SYNC_MAX = 400;

type Kind = 'pipe' | 'ug' | 'offshore';

interface Cell {
  kind: Kind;
  x: number;
  y: number;
  z: number;
}

interface PumpRec {
  /** Casilla principal (delante) y sentido. */
  x: number;
  y: number;
  z: number;
  dir: number;
  /** Cajas de detrás y de delante (−1 si no hay nada unido). */
  inKey: number;
  outKey: number;
  sat: number;
  working: boolean;
}

export class Fluids implements PowerConsumer {
  readonly graph = new FluidGraph();
  private cells = new Map<number, Cell>();
  private tanks = new Set<number>();
  private pumps = new Map<number, PumpRec>();
  private saved = new Map<number, [number, number]>();
  private api: RedstoneApi | null = null;
  private dirty = true;
  private saveDirty = false;
  private tickCount = 0;

  constructor(private ctx: ServerContext, rs: Redstone, store: ServerStore, private power: Power) {
    SYSTEMS.set(rs, this);
    try {
      const raw = JSON.parse(store.getMeta('fluids') ?? '[]') as unknown;
      if (Array.isArray(raw)) {
        for (const r of raw) {
          if (Array.isArray(r) && r.length === 5 && r.every((n) => Number.isFinite(n))) this.saved.set(posKey(r[0], r[1], r[2]), [r[3], r[4]]);
        }
      }
    } catch {
      /* mundo sin fluidos guardados */
    }
  }

  get boxCount(): number {
    return this.graph.boxes.size;
  }

  private block(x: number, y: number, z: number): number {
    return this.api ? this.api.getBlock(x, y, z) : this.ctx.world.getBlock(x, y, z);
  }

  changed(api: RedstoneApi, x: number, y: number, z: number, _old: number, id: number): void {
    this.api = api;
    const k = posKey(x, y, z);
    this.dirty = true;
    let cell: Cell | null = null;
    if (isPipe(id)) cell = { kind: 'pipe', x, y, z };
    else if (isUndergroundPipe(id)) cell = { kind: 'ug', x, y, z };
    else if (isOffshorePump(id)) cell = { kind: 'offshore', x, y, z };
    if (cell) {
      this.cells.set(k, cell);
      if (!this.graph.boxes.has(k)) {
        const b = this.graph.add(k, PIPE_VOLUME);
        const sv = this.saved.get(k);
        if (sv) {
          this.saved.delete(k);
          b.fluid = sv[0];
          b.amount = Math.min(b.cap, sv[1]);
        }
      }
    } else if (this.cells.delete(k)) this.graph.remove(k);
    // Tanque y bomba: sólo su casilla principal cuenta (y la primera vez que se ve).
    if (isTankBlock(id)) {
      const info = multiInfo(id);
      if (info?.controller) {
        this.tanks.add(k);
        if (!this.graph.boxes.has(k)) {
          const b = this.graph.add(k, TANK_VOLUME);
          const sv = this.saved.get(k);
          if (sv) {
            this.saved.delete(k);
            b.fluid = sv[0];
            b.amount = Math.min(b.cap, sv[1]);
          }
        }
      } else if (!info) this.dropTank(k);
    } else if (this.tanks.has(k)) this.dropTank(k);
    if (isPumpBlock(id)) {
      const info = multiInfo(id);
      if (info?.controller) {
        if (!this.pumps.has(k)) {
          this.pumps.set(k, { x, y, z, dir: info.dir, inKey: -1, outKey: -1, sat: 0, working: false });
          this.power.attach(k, multiBox(id, x, y, z)!);
        }
      } else if (!info) this.dropPump(k);
    } else if (this.pumps.has(k)) this.dropPump(k);
  }

  private dropTank(k: number): void {
    this.tanks.delete(k);
    this.graph.remove(k);
  }

  private dropPump(k: number): void {
    this.pumps.delete(k);
    this.power.detach(k);
  }

  // ------------------------------------------------------------------ conexiones

  /** ¿Ofrece el bloque `id` de la casilla (x, y, z) una unión por la cara `face`? */
  private offers(id: number, x: number, y: number, z: number, face: number): boolean {
    if (id <= 0) return false;
    if (isPipe(id)) return true;
    if (isUndergroundPipe(id)) return face === faceOfDir(undergroundPipeDir(id));
    if (isOffshorePump(id)) return face === faceOfDir(offshorePumpDir(id));
    if (isTankBlock(id)) {
      if (face === 2 || face === 3) return false;
      const c = multiControllerPos(id, x, y, z);
      return !!c && c[1] === y; // sólo la fila de abajo
    }
    if (isPumpBlock(id)) {
      const info = multiInfo(id);
      const c = multiControllerPos(id, x, y, z);
      if (!info || !c) return false;
      const front = faceOfDir(info.dir);
      const isFront = c[0] === x && c[1] === y && c[2] === z;
      return isFront ? face === front : face === oppositeFace(front);
    }
    return false;
  }

  /** Clave de la caja de la casilla (x, y, z), o −1 si ahí no hay una (una bomba no tiene caja). */
  private boxKey(id: number, x: number, y: number, z: number): number {
    if (isPipe(id) || isUndergroundPipe(id) || isOffshorePump(id)) return posKey(x, y, z);
    if (isTankBlock(id)) {
      const c = multiControllerPos(id, x, y, z);
      return c ? posKey(c[0], c[1], c[2]) : -1;
    }
    return -1;
  }

  /** Máscara de caras unidas de una tubería en (x, y, z). */
  private maskAt(x: number, y: number, z: number): number {
    let m = 0;
    for (let f = 0; f < 6; f++) {
      const nx = x + PIPE_FACE_DX[f], ny = y + PIPE_FACE_DY[f], nz = z + PIPE_FACE_DZ[f];
      const nid = this.block(nx, ny, nz);
      if (this.offers(nid, nx, ny, nz, oppositeFace(f))) m |= 1 << f;
    }
    return m;
  }

  private rebuild(): void {
    this.dirty = false;
    const seen = new Set<string>();
    const edges: [number, number][] = [];
    const link = (a: number, b: number): void => {
      if (a < 0 || b < 0 || a === b) return;
      const key = a < b ? `${a},${b}` : `${b},${a}`;
      if (seen.has(key)) return;
      seen.add(key);
      edges.push([a, b]);
    };
    for (const [k, c] of this.cells) {
      const id = this.block(c.x, c.y, c.z);
      if (id < 0) continue;
      if (!(isPipe(id) || isUndergroundPipe(id) || isOffshorePump(id))) continue;
      for (let f = 0; f < 6; f++) {
        if (!this.offers(id, c.x, c.y, c.z, f)) continue;
        const nx = c.x + PIPE_FACE_DX[f], ny = c.y + PIPE_FACE_DY[f], nz = c.z + PIPE_FACE_DZ[f];
        const nid = this.block(nx, ny, nz);
        if (nid < 0 || !this.offers(nid, nx, ny, nz, oppositeFace(f))) continue;
        link(k, this.boxKey(nid, nx, ny, nz));
      }
      if (c.kind === 'ug') {
        const partner = this.partnerOf(c, id);
        if (partner >= 0) link(k, partner);
      }
      if (c.kind === 'pipe') {
        const want = this.maskAt(c.x, c.y, c.z);
        if (pipeMask(id) !== want && this.api) this.api.setBlock(c.x, c.y, c.z, pipeState(want), UPDATE_CLIENTS);
      }
    }
    this.graph.setEdges(edges);
    // Las bombas: la caja de detrás y la de delante.
    for (const [, p] of this.pumps) {
      const f = faceOfDir(p.dir);
      const fx = PIPE_FACE_DX[f], fz = PIPE_FACE_DZ[f];
      const ax = p.x, az = p.z;
      const rx = ax - fx, rz = az - fz; // casilla de atrás de la bomba
      const inX = rx - fx, inZ = rz - fz;
      const outX = ax + fx, outZ = az + fz;
      const iid = this.block(inX, p.y, inZ), oid = this.block(outX, p.y, outZ);
      p.inKey = iid > 0 && this.offers(iid, inX, p.y, inZ, f) ? this.boxKey(iid, inX, p.y, inZ) : -1;
      p.outKey = oid > 0 && this.offers(oid, outX, p.y, outZ, oppositeFace(f)) ? this.boxKey(oid, outX, p.y, outZ) : -1;
    }
  }

  /** La pareja de una punta subterránea: la primera del otro lado, en línea y mirando al revés, a 10 casillas o menos. */
  private partnerOf(c: Cell, id: number): number {
    const dir = undergroundPipeDir(id);
    const f = faceOfDir(dir);
    const dx = -PIPE_FACE_DX[f], dz = -PIPE_FACE_DZ[f]; // hacia donde va bajo tierra
    for (let k = 1; k <= PIPE_UNDERGROUND_MAX; k++) {
      const x = c.x + dx * k, z = c.z + dz * k;
      const bid = this.block(x, c.y, z);
      if (isUndergroundPipe(bid) && undergroundPipeDir(bid) === (dir + 2) % 4) return posKey(x, c.y, z);
    }
    return -1;
  }

  /** ¿Con quién está emparejada la punta de (x, y, z)? (clave, para las pruebas y la interfaz) */
  partnerAt(x: number, y: number, z: number): number {
    const id = this.block(x, y, z);
    if (!isUndergroundPipe(id)) return -1;
    return this.partnerOf({ kind: 'ug', x, y, z }, id);
  }

  // ------------------------------------------------------------------ consulta

  /** La caja de la casilla (x, y, z) (cualquier casilla de un tanque vale). */
  boxAt(x: number, y: number, z: number): { fluid: number; amount: number; cap: number } | null {
    const id = this.block(x, y, z);
    const k = this.boxKey(id, x, y, z);
    const b = k >= 0 ? this.graph.boxes.get(k) : undefined;
    return b ? { fluid: b.fluid, amount: b.amount, cap: b.cap } : null;
  }

  /** Mete fluido en la caja de (x, y, z) (para las pruebas y las máquinas). */
  put(x: number, y: number, z: number, fluid: number, n: number): number {
    const k = this.boxKey(this.block(x, y, z), x, y, z);
    return k >= 0 ? this.graph.put(k, fluid, n) : 0;
  }

  take(x: number, y: number, z: number, n: number): number {
    const k = this.boxKey(this.block(x, y, z), x, y, z);
    return k >= 0 ? this.graph.take(k, n) : 0;
  }

  // ------------------------------------------------------------------ energía de las bombas

  private canPump(p: PumpRec): boolean {
    if (p.inKey < 0 || p.outKey < 0) return false;
    const a = this.graph.boxes.get(p.inKey), b = this.graph.boxes.get(p.outKey);
    return !!a && !!b && a.amount > 1e-6 && b.amount < b.cap - 1e-6 && (b.amount <= 1e-9 || b.fluid === a.fluid);
  }

  demand(out: Map<number, number>): void {
    for (const [k, p] of this.pumps) if (this.canPump(p)) out.set(k, PUMP_KW);
  }

  advance(sat: (k: number) => number): void {
    for (const [k, p] of this.pumps) p.sat = sat(k);
  }

  // ------------------------------------------------------------------ cada tick

  tick(): void {
    this.tickCount++;
    if (this.dirty) this.rebuild();
    if (this.graph.boxes.size === 0) return;
    const perStep = 1 / (FLOW_SUBSTEPS * 20); // segundos por paso
    for (let s = 0; s < FLOW_SUBSTEPS; s++) {
      for (const [k, c] of this.cells) {
        if (c.kind !== 'offshore') continue;
        const id = this.block(c.x, c.y, c.z);
        if (!isOffshorePump(id)) continue;
        const f = faceOfDir(offshorePumpDir(id));
        const bx = c.x - PIPE_FACE_DX[f], bz = c.z - PIPE_FACE_DZ[f];
        if (this.block(bx, c.y, bz) === WATER || this.block(bx, c.y - 1, bz) === WATER) this.graph.put(k, WATER_FLUID, OFFSHORE_RATE * perStep);
      }
      for (const p of this.pumps.values()) {
        p.working = false;
        if (p.sat <= 0 || !this.canPump(p)) continue;
        const a = this.graph.boxes.get(p.inKey)!, b = this.graph.boxes.get(p.outKey)!;
        const n = Math.min(PUMP_RATE * perStep * p.sat, a.amount, b.cap - b.amount);
        const fluid = a.fluid;
        const took = this.graph.take(p.inKey, n);
        this.graph.put(p.outKey, fluid, took);
        p.working = took > 0;
      }
      this.graph.step();
    }
    this.saveDirty = true;
    if (this.tickCount % SYNC_EVERY === 0) this.sync();
  }

  /** Manda a cada jugador lo que hay en las cajas cercanas: [x, y, z, fluido, cantidad, volumen]. */
  private sync(): void {
    for (const s of this.ctx.sessions()) {
      if (!s.joined || s.dimPending) continue;
      const rows: number[][] = [];
      for (const [k, b] of this.graph.boxes) {
        if (b.amount <= 0) continue;
        const x = keyX(k), z = keyZ(k);
        if (Math.hypot(x + 0.5 - s.p[0], z + 0.5 - s.p[2]) > SYNC_RANGE) continue;
        rows.push([x, keyY(k), z, b.fluid, Math.round(b.amount * 10) / 10, b.cap]);
        if (rows.length >= SYNC_MAX) break;
      }
      this.ctx.send(s, { t: 'fluids', l: rows });
    }
  }

  flush(store: ServerStore): void {
    if (!this.saveDirty) return;
    this.saveDirty = false;
    const rows: number[][] = [];
    for (const [k, v] of this.saved) rows.push([keyX(k), keyY(k), keyZ(k), v[0], v[1]]);
    for (const [k, b] of this.graph.boxes) if (b.amount > 0) rows.push([keyX(k), keyY(k), keyZ(k), b.fluid, Math.round(b.amount * 100) / 100]);
    store.setMeta('fluids', JSON.stringify(rows));
  }
}
