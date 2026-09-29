// Programa lunar: los pozos de petróleo (Factorio: `pumpjack`, FACTORIO-REFERENCIA.md §7). 3×3, 90 kW, sobre un pozo de petróleo lunar.
//
// Cada segundo saca 10 × el rendimiento del pozo de petróleo crudo en su caja de 100, que se une por delante a una tubería (o a lo que ofrezca
// esa cara). El rendimiento empieza entre el 50 % y el 300 % (100 % = 300 000 de reserva) y baja con lo que se saca: 10 de reserva por
// segundo a pleno rendimiento; nunca por debajo del 20 %. Lo que ha gastado cada pozo se guarda ('oilwells').
import { PUMPJACK, MOON_OIL_WELL, multiInfo, multiBox, faceOfDir, PIPE_FACE_DX, PIPE_FACE_DZ } from '../../blocks';
import { registerRedstone, type RedstoneApi } from '../../redstone';
import {
  PUMPJACK_KW, OIL_PER_SECOND, OIL_FULL, OIL_MIN_YIELD, OIL_DEPLETION_PER_SECOND, PUMPJACK_VOLUME, fluidByName,
} from '../../logistics/fluidTypes';
import { hash2 } from '../../constants';
import { posKey, keyX, keyY, keyZ } from '../posKey';
import type { ServerStore } from '../store';
import { DT, type ServerContext } from './context';
import type { Redstone } from './redstone';
import type { Power, PowerConsumer } from './power';
import type { Fluids } from './fluids';

const SYSTEMS = new WeakMap<RedstoneApi, Pumpjacks>();

registerRedstone([PUMPJACK], {
  changed: (api, x, y, z, old, id) => SYSTEMS.get(api)?.changed(x, y, z, old, id),
});

const CRUDE = fluidByName('crude-oil')!.id;

interface Jack {
  dir: number;
  box: number;
  sat: number;
  working: boolean;
}

export class Pumpjacks implements PowerConsumer {
  private list = new Map<number, Jack>();
  /** Reserva gastada de cada pozo (posKey del bloque del pozo). */
  private used = new Map<number, number>();
  private savedBox = new Map<number, [number, number]>();
  private saveDirty = false;

  constructor(private ctx: ServerContext, rs: Redstone, store: ServerStore, private power: Power, private fluids: Fluids) {
    SYSTEMS.set(rs, this);
    try {
      const raw = JSON.parse(store.getMeta('oilwells') ?? '{}') as { used?: number[][]; boxes?: number[][] };
      for (const r of raw.used ?? []) if (r.length === 4 && r.every(Number.isFinite)) this.used.set(posKey(r[0], r[1], r[2]), r[3]);
      for (const r of raw.boxes ?? []) if (r.length === 5 && r.every(Number.isFinite)) this.savedBox.set(posKey(r[0], r[1], r[2]), [r[3], r[4]]);
    } catch {
      /* mundo sin pozos guardados */
    }
  }

  get count(): number {
    return this.list.size;
  }

  /** Reserva inicial del pozo de (x, y, z): entre 150 000 y 900 000 (rendimientos del 50 % al 300 %). */
  static wellAmount(seed: number, x: number, y: number, z: number): number {
    return 150000 + ((hash2(x * 31 + y * 7, z, seed ^ 0x0113a) >>> 0) % 750000);
  }

  /** Rendimiento (1 = 100 %) del pozo de petróleo en (x, y, z); 0 si ahí no hay pozo. */
  yieldAt(x: number, y: number, z: number): number {
    if (this.ctx.world.getBlock(x, y, z) !== MOON_OIL_WELL) return 0;
    const left = Pumpjacks.wellAmount(this.ctx.seed, x, y, z) - (this.used.get(posKey(x, y, z)) ?? 0);
    return Math.max(OIL_MIN_YIELD, left / OIL_FULL);
  }

  /** Lo que tiene el pozo de petróleo con casilla principal en (x, y, z) (para las pruebas). */
  peek(x: number, y: number, z: number): { box: number; working: boolean } | null {
    const j = this.list.get(posKey(x, y, z));
    return j ? { box: j.box, working: j.working } : null;
  }

  changed(x: number, y: number, z: number, _old: number, id: number): void {
    const k = posKey(x, y, z);
    const info = id > 0 ? multiInfo(id) : null;
    if (!info?.controller) {
      const j = this.list.get(k);
      if (j && !info) {
        this.list.delete(k);
        this.power.detach(k);
        this.fluids.clearMachinePorts(k);
        this.fluids.freeBox(j.box);
      }
      return;
    }
    const cur = this.list.get(k);
    if (cur) {
      cur.dir = info.dir;
    } else {
      const box = this.fluids.allocBox(PUMPJACK_VOLUME);
      const sv = this.savedBox.get(k);
      if (sv) {
        this.savedBox.delete(k);
        this.fluids.graph.put(box, sv[0], sv[1]);
      }
      this.list.set(k, { dir: info.dir, box, sat: 0, working: false });
      this.power.attach(k, multiBox(id, x, y, z)!);
    }
    const j = this.list.get(k)!;
    const f = faceOfDir(info.dir);
    // La conexión: la casilla de delante del centro, por su cara de delante.
    this.fluids.setMachinePorts(k, [{ x: x + PIPE_FACE_DX[f], y, z: z + PIPE_FACE_DZ[f], face: f, box: j.box }]);
  }

  private canWork(k: number, j: Jack): boolean {
    if (this.yieldAt(keyX(k), keyY(k) - 1, keyZ(k)) <= 0) return false;
    const b = this.fluids.graph.boxes.get(j.box);
    return !!b && b.amount < b.cap - 1e-6 && (b.amount <= 1e-9 || b.fluid === CRUDE);
  }

  demand(out: Map<number, number>): void {
    for (const [k, j] of this.list) if (this.canWork(k, j)) out.set(k, PUMPJACK_KW);
  }

  advance(sat: (k: number) => number): void {
    for (const [k, j] of this.list) j.sat = sat(k);
  }

  tick(): void {
    for (const [k, j] of this.list) {
      j.working = false;
      if (j.sat <= 0 || !this.canWork(k, j)) continue;
      const wx = keyX(k), wy = keyY(k) - 1, wz = keyZ(k);
      const yld = this.yieldAt(wx, wy, wz);
      const put = this.fluids.graph.put(j.box, CRUDE, OIL_PER_SECOND * yld * j.sat * DT);
      if (put <= 0) continue;
      j.working = true;
      const wk = posKey(wx, wy, wz);
      this.used.set(wk, (this.used.get(wk) ?? 0) + OIL_DEPLETION_PER_SECOND * j.sat * DT);
      this.saveDirty = true;
    }
  }

  flush(store: ServerStore): void {
    if (!this.saveDirty) return;
    this.saveDirty = false;
    const used: number[][] = [];
    for (const [k, n] of this.used) used.push([keyX(k), keyY(k), keyZ(k), Math.round(n * 100) / 100]);
    const boxes: number[][] = [];
    for (const [k, j] of this.list) {
      const b = this.fluids.graph.boxes.get(j.box);
      if (b && b.amount > 0) boxes.push([keyX(k), keyY(k), keyZ(k), b.fluid, Math.round(b.amount * 100) / 100]);
    }
    for (const [k, v] of this.savedBox) boxes.push([keyX(k), keyY(k), keyZ(k), v[0], v[1]]);
    store.setMeta('oilwells', JSON.stringify({ used, boxes }));
  }
}
