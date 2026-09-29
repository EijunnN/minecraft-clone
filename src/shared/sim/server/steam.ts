// Programa lunar: la energía de vapor de Factorio (FACTORIO-REFERENCIA.md §3 y §7): calderas y máquinas de vapor.
//
// - CALDERA (1,8 MW): quema el combustible que le llega (un brazo o una cinta) y convierte 6 de agua por segundo en 60 de vapor (30 kJ por
//   unidad de vapor). Sólo hace vapor si hay sitio en su caja de vapor; el agua entra y sale por los dos extremos de atrás (se encadenan).
// - MÁQUINA DE VAPOR (900 kW): gasta 30 de vapor por segundo a pleno rendimiento; el vapor entra por un extremo y sale por el otro (se
//   encadenan en fila). Da a la red sólo lo que falta (después de los paneles y la carga de los acumuladores); sin vapor, no da.
// Cada una tiene una caja de fluido (Fluids) y puertos de tubería; los brazos y las cintas meten el combustible por el puerto de objetos.
// Se guarda lo que llevan dentro (metadatos 'steam').
import {
  BOILER, STEAM_ENGINE, multiInfo, multiBox, multiPort, multiControllerPos, familyBase,
} from '../../blocks';
import { registerRedstone, type RedstoneApi } from '../../redstone';
import {
  BOILER_KW, BOILER_WATER_PER_SECOND, BOILER_STEAM_PER_SECOND, STEAM_KJ, STEAM_ENGINE_KW, BOILER_VOLUME, ENGINE_VOLUME, fluidByName,
} from '../../logistics/fluidTypes';
import { FURNACE_KJ_PER_FUEL } from '../../logistics/assemblyTypes';
import { ITEMS, sameKind, type ItemStack } from '../../items';
import { stackToWire, stackFromWire, type WireStack } from '../../protocol';
import { posKey, keyX, keyY, keyZ } from '../posKey';
import type { ServerStore } from '../store';
import { DT, type ServerContext } from './context';
import type { Redstone } from './redstone';
import type { Power, PowerProducer } from './power';
import type { Fluids } from './fluids';
import type { MachinePorts } from './machines';

const SYSTEMS = new WeakMap<RedstoneApi, Steam>();

registerRedstone([BOILER, STEAM_ENGINE], {
  changed: (api, x, y, z, old, id) => SYSTEMS.get(api)?.changed(x, y, z, old, id),
});

const WATER = fluidByName('water')!.id;
const STEAM = fluidByName('steam')!.id;
const FUEL_STACK = 64;

interface Boiler {
  dir: number;
  water: number;
  steam: number;
  fuel: ItemStack | null;
  /** kJ de combustible quemado que todavía no se han convertido en vapor. */
  energy: number;
  working: boolean;
}

interface Engine {
  dir: number;
  box: number;
  /** kW que dio este tick (para las pruebas y la interfaz). */
  out: number;
}

type SavedBoiler = [number, number, number, number, number, WireStack | null, number];
type SavedEngine = [number, number, number, number, number];

export class Steam implements PowerProducer, MachinePorts {
  private boilers = new Map<number, Boiler>();
  private engines = new Map<number, Engine>();
  private savedBoilers = new Map<number, SavedBoiler>();
  private savedEngines = new Map<number, SavedEngine>();
  private saveDirty = false;

  constructor(private ctx: ServerContext, rs: Redstone, store: ServerStore, private power: Power, private fluids: Fluids) {
    SYSTEMS.set(rs, this);
    try {
      const raw = JSON.parse(store.getMeta('steam') ?? '{}') as { boilers?: unknown[]; engines?: unknown[] };
      for (const r of raw.boilers ?? []) if (Array.isArray(r) && r.length === 7 && r.slice(0, 5).every(Number.isFinite)) this.savedBoilers.set(posKey(r[0], r[1], r[2]), r as SavedBoiler);
      for (const r of raw.engines ?? []) if (Array.isArray(r) && r.length === 5 && r.every(Number.isFinite)) this.savedEngines.set(posKey(r[0], r[1], r[2]), r as SavedEngine);
    } catch {
      /* mundo sin vapor guardado */
    }
    power.registerProducer(this);
  }

  get boilerCount(): number {
    return this.boilers.size;
  }

  get engineCount(): number {
    return this.engines.size;
  }

  // ------------------------------------------------------------------ altas y bajas

  changed(x: number, y: number, z: number, _old: number, id: number): void {
    const k = posKey(x, y, z);
    const info = id > 0 ? multiInfo(id) : null;
    const base = id > 0 ? familyBase(id) : 0;
    if (!info?.controller) {
      if (!info) this.remove(k);
      return;
    }
    if (base === BOILER) this.addBoiler(k, x, y, z, id, info.dir);
    else if (base === STEAM_ENGINE) this.addEngine(k, x, y, z, id, info.dir);
  }

  private remove(k: number): void {
    const b = this.boilers.get(k);
    if (b) {
      this.boilers.delete(k);
      this.fluids.clearMachinePorts(k);
      this.fluids.freeBox(b.water);
      this.fluids.freeBox(b.steam);
      this.power.detach(k);
      if (b.fuel) this.ctx.entities.dropStacks([b.fuel], keyX(k) + 0.5, keyY(k) + 0.5, keyZ(k) + 0.5);
      this.saveDirty = true;
    }
    const e = this.engines.get(k);
    if (e) {
      this.engines.delete(k);
      this.fluids.clearMachinePorts(k);
      this.fluids.freeBox(e.box);
      this.power.detach(k);
      this.saveDirty = true;
    }
  }

  private addBoiler(k: number, x: number, y: number, z: number, id: number, dir: number): void {
    let b = this.boilers.get(k);
    if (!b) {
      const sv = this.savedBoilers.get(k);
      this.savedBoilers.delete(k);
      b = {
        dir, water: this.fluids.allocBox(BOILER_VOLUME), steam: this.fluids.allocBox(BOILER_VOLUME), fuel: sv?.[5] ? stackFromWire(sv[5]) : null,
        energy: sv ? Number(sv[6]) || 0 : 0, working: false,
      };
      if (sv) {
        if (sv[3] > 0) this.fluids.graph.put(b.water, WATER, sv[3]);
        if (sv[4] > 0) this.fluids.graph.put(b.steam, STEAM, sv[4]);
      }
      this.boilers.set(k, b);
      this.power.attach(k, multiBox(id, x, y, z)!); // (para que un poste lo cuente; no consume)
    }
    b.dir = dir;
    // Puertos (huella sin girar, mirando al norte): agua por los extremos de atrás, vapor por el centro del frente.
    const at = (lx: number, ly: number, lz: number, face: number, box: number) => ({ ...multiPort(BOILER, dir, x, y, z, lx, ly, lz, face), box });
    this.fluids.setMachinePorts(k, [at(0, 0, 1, 1, b.water), at(2, 0, 1, 0, b.water), at(1, 0, 0, 5, b.steam)]);
  }

  private addEngine(k: number, x: number, y: number, z: number, id: number, dir: number): void {
    let e = this.engines.get(k);
    if (!e) {
      const sv = this.savedEngines.get(k);
      this.savedEngines.delete(k);
      e = { dir, box: this.fluids.allocBox(ENGINE_VOLUME), out: 0 };
      if (sv && sv[4] > 0) this.fluids.graph.put(e.box, sv[3] || STEAM, sv[4]);
      this.engines.set(k, e);
      this.power.attach(k, multiBox(id, x, y, z)!);
    }
    e.dir = dir;
    const at = (lz: number, face: number) => ({ ...multiPort(STEAM_ENGINE, dir, x, y, z, 1, 0, lz, face), box: e!.box });
    this.fluids.setMachinePorts(k, [at(0, 5), at(4, 4)]);
  }

  // ------------------------------------------------------------------ combustible (puertos de objetos)

  private keyAt(x: number, y: number, z: number): number {
    const id = this.ctx.world.getBlock(x, y, z);
    if (id <= 0 || familyBase(id) !== BOILER) return -1;
    const c = multiControllerPos(id, x, y, z);
    return c ? posKey(c[0], c[1], c[2]) : -1;
  }

  has(x: number, y: number, z: number): boolean {
    return this.boilers.has(this.keyAt(x, y, z));
  }

  private room(b: Boiler, s: ItemStack): number {
    if ((ITEMS[s.id]?.fuel ?? 0) <= 0) return 0;
    if (!b.fuel) return FUEL_STACK;
    return sameKind(b.fuel, s) ? Math.max(0, FUEL_STACK - b.fuel.count) : 0;
  }

  accepts(x: number, y: number, z: number, s: ItemStack): boolean {
    const b = this.boilers.get(this.keyAt(x, y, z));
    return !!b && this.room(b, s) > 0;
  }

  insert(x: number, y: number, z: number, s: ItemStack): number {
    const b = this.boilers.get(this.keyAt(x, y, z));
    if (!b) return 0;
    const n = Math.min(s.count, this.room(b, s));
    if (n <= 0) return 0;
    b.fuel = b.fuel ? { ...b.fuel, count: b.fuel.count + n } : { ...s, count: n };
    this.saveDirty = true;
    return n;
  }

  extractOne(): boolean {
    return false;
  }

  /** Lo que tiene la caldera de (x, y, z) (para las pruebas y la interfaz). */
  boilerView(x: number, y: number, z: number): { water: number; steam: number; fuel: ItemStack | null; energy: number; working: boolean } | null {
    const b = this.boilers.get(this.keyAt(x, y, z));
    if (!b) return null;
    const g = this.fluids.graph.boxes;
    return { water: g.get(b.water)?.amount ?? 0, steam: g.get(b.steam)?.amount ?? 0, fuel: b.fuel, energy: b.energy, working: b.working };
  }

  /** El vapor y lo que dio la máquina de vapor con controlador en (x, y, z). */
  engineView(x: number, y: number, z: number): { steam: number; kw: number } | null {
    const e = this.engines.get(posKey(x, y, z));
    return e ? { steam: this.fluids.graph.boxes.get(e.box)?.amount ?? 0, kw: e.out } : null;
  }

  // ------------------------------------------------------------------ generación

  /** Cuánta potencia puede dar ahora cada máquina de vapor: 900 kW como mucho, y lo que permita el vapor que tiene. */
  capacity(out: Map<number, number>): void {
    for (const [k, e] of this.engines) {
      const steam = this.fluids.graph.boxes.get(e.box)?.amount ?? 0;
      out.set(k, Math.min(STEAM_ENGINE_KW, (steam * STEAM_KJ) / DT));
    }
  }

  /** La red repartió: cada máquina gasta el vapor de lo que dio. */
  deliver(used: ReadonlyMap<number, number>): void {
    for (const [k, e] of this.engines) {
      const kw = used.get(k) ?? 0;
      e.out = kw;
      if (kw > 0) this.fluids.graph.take(e.box, (kw * DT) / STEAM_KJ);
    }
  }

  /** Cada tick las calderas hacen vapor con el agua y el combustible que tengan, hasta llenar su caja. */
  tick(): void {
    for (const [, b] of this.boilers) {
      b.working = false;
      const steamBox = this.fluids.graph.boxes.get(b.steam)!, waterBox = this.fluids.graph.boxes.get(b.water)!;
      if (waterBox.fluid !== WATER && waterBox.amount > 0) continue;
      if (steamBox.amount > 1e-9 && steamBox.fluid !== STEAM) continue;
      const room = steamBox.cap - steamBox.amount;
      let want = Math.min(BOILER_STEAM_PER_SECOND * DT, room, (waterBox.amount * BOILER_STEAM_PER_SECOND) / BOILER_WATER_PER_SECOND);
      if (want <= 1e-9) continue;
      // El fuego: hace falta energía para el vapor; si no queda, se quema otra unidad de combustible.
      const need = want * STEAM_KJ;
      const cap = BOILER_KW * DT;
      if (need > cap) want = cap / STEAM_KJ;
      if (b.energy < want * STEAM_KJ && b.fuel) {
        const f = b.fuel;
        b.energy += (ITEMS[f.id]?.fuel ?? 0) * FURNACE_KJ_PER_FUEL;
        b.fuel = f.count > 1 ? { ...f, count: f.count - 1 } : null;
        this.saveDirty = true;
      }
      want = Math.min(want, b.energy / STEAM_KJ);
      if (want <= 1e-9) continue;
      b.energy -= want * STEAM_KJ;
      this.fluids.graph.take(b.water, (want * BOILER_WATER_PER_SECOND) / BOILER_STEAM_PER_SECOND);
      this.fluids.graph.put(b.steam, STEAM, want);
      b.working = true;
      this.saveDirty = true;
    }
  }

  flush(store: ServerStore): void {
    if (!this.saveDirty) return;
    this.saveDirty = false;
    const g = this.fluids.graph.boxes;
    const boilers: SavedBoiler[] = [...this.savedBoilers.values()];
    for (const [k, b] of this.boilers) {
      boilers.push([keyX(k), keyY(k), keyZ(k), Math.round((g.get(b.water)?.amount ?? 0) * 100) / 100, Math.round((g.get(b.steam)?.amount ?? 0) * 100) / 100, b.fuel ? stackToWire(b.fuel) : null, Math.round(b.energy * 10) / 10]);
    }
    const engines: SavedEngine[] = [...this.savedEngines.values()];
    for (const [k, e] of this.engines) engines.push([keyX(k), keyY(k), keyZ(k), STEAM, Math.round((g.get(e.box)?.amount ?? 0) * 100) / 100]);
    store.setMeta('steam', JSON.stringify({ boilers, engines }));
  }
}
