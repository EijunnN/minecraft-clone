// Programa lunar (idea-industria.md): las máquinas, con sus puertos y su gasto de energía.
//
// Una máquina tiene una cola de entrada y otra de salida. Los brazos y las cintas meten en la de entrada y sacan de la de salida por
// cualquier cara (el «puerto»); mientras trabaja pide potencia a su red (Power, por los postes) y avanza en proporción a lo que
// recibe. Ahora sólo hay el horno eléctrico, con las cifras del de Factorio (`electric-furnace`: velocidad 2 y 180 kW; una receta de
// horno tarda 3,2 s a velocidad 1 → 1,6 s); las demás (ensambladoras, reactor…) usan este mismo esqueleto.
// Guarda lo que tienen dentro (metadatos 'machines' de la dimensión).
import { ELECTRIC_SMELTER, multiInfo, multiBox, multiControllerPos, familyBase } from '../../blocks';
import { registerRedstone, type RedstoneApi } from '../../redstone';
import { smeltRecipeFor } from '../../logistics/assembly';
import { maxStack, sameKind, type ItemStack } from '../../items';
import { MACHINE_KW } from '../../logistics/energy';
import { stackToWire, stackFromWire, type WireStack } from '../../protocol';
import { posKey, keyX, keyY, keyZ } from '../posKey';
import type { ServerStore } from '../store';
import { DT, type ServerContext } from './context';
import type { Redstone } from './redstone';
import type { Power, PowerConsumer } from './power';
import type { Research } from './research';

const SYSTEMS = new WeakMap<RedstoneApi, Machines>();

registerRedstone([ELECTRIC_SMELTER], {
  changed: (api, x, y, z, old, id) => SYSTEMS.get(api)?.changed(x, y, z, old, id),
});

/** Segundos que tarda en fundir un objeto a plena potencia: 3,2 s de receta ÷ velocidad 2 del horno eléctrico. */
export const SMELT_RECIPE_SECONDS = 3.2;
export const SMELTER_SPEED = 2;
export const SMELTER_SECONDS = SMELT_RECIPE_SECONDS / SMELTER_SPEED;

interface Machine {
  input: ItemStack | null;
  output: ItemStack | null;
  /** Segundos de trabajo acumulados sobre el objeto actual. */
  progress: number;
  /** ¿Trabajó en el último tick? (para indicadores y pruebas) */
  working: boolean;
}

type SavedRow = [number, number, number, WireStack | null, WireStack | null, number];

/** Lo que las demás piezas (brazos, cintas) ven de las máquinas: es el mismo contrato que un inventario. */
export interface MachinePorts {
  has(x: number, y: number, z: number): boolean;
  accepts(x: number, y: number, z: number, s: ItemStack): boolean;
  insert(x: number, y: number, z: number, s: ItemStack): number;
  extractOne(x: number, y: number, z: number, take: (s: ItemStack) => boolean): boolean;
}

export class Machines implements MachinePorts, PowerConsumer {
  /** La investigación (fija las recetas de fundición desbloqueadas y cuenta lo fabricado). */
  research: Research | null = null;
  private ok = (r: { name: string }): boolean => !this.research || this.research.recipeUnlocked(r.name);
  private list = new Map<number, Machine>();
  private saved = new Map<number, SavedRow>();
  private saveDirty = false;

  constructor(private ctx: ServerContext, rs: Redstone, store: ServerStore, private power: Power) {
    SYSTEMS.set(rs, this);
    try {
      const raw = JSON.parse(store.getMeta('machines') ?? '[]') as unknown;
      if (Array.isArray(raw)) {
        for (const r of raw) {
          if (Array.isArray(r) && r.length === 6 && r.slice(0, 3).every((n) => Number.isFinite(n))) this.saved.set(posKey(r[0], r[1], r[2]), r as SavedRow);
        }
      }
    } catch {
      /* mundo sin máquinas guardadas */
    }
  }

  get count(): number {
    return this.list.size;
  }

  /** Lo que tiene la máquina de (x, y, z) (para las pruebas y los paneles). */
  peek(x: number, y: number, z: number): Readonly<Machine> | null {
    return this.list.get(this.keyAt(x, y, z)) ?? null;
  }

  changed(x: number, y: number, z: number, _old: number, id: number): void {
    const k = posKey(x, y, z);
    const info = id > 0 && familyBase(id) === ELECTRIC_SMELTER ? multiInfo(id) : null;
    if (!info?.controller) {
      // Ya no es la casilla principal de un horno: si lo era, se suelta lo que tenía dentro (las demás casillas no guardan nada).
      const m = this.list.get(k);
      if (m) {
        const drops = [m.input, m.output].filter((s): s is ItemStack => !!s);
        if (drops.length) this.ctx.entities.dropStacks(drops, x + 0.5, y + 0.5, z + 0.5);
        this.list.delete(k);
        this.power.detach(k);
        this.saveDirty = true;
      }
      return;
    }
    if (this.list.has(k)) return;
    this.power.attach(k, multiBox(id, x, y, z)!);
    const row = this.saved.get(k);
    this.saved.delete(k);
    this.list.set(k, {
      input: row?.[3] ? stackFromWire(row[3]) : null, output: row?.[4] ? stackFromWire(row[4]) : null,
      progress: Number(row?.[5]) || 0, working: false,
    });
  }

  /** Clave del horno al que pertenece la casilla (x, y, z) (cualquiera de las nueve de su huella, o −1). */
  private keyAt(x: number, y: number, z: number): number {
    const id = this.ctx.world.getBlock(x, y, z);
    if (id <= 0 || familyBase(id) !== ELECTRIC_SMELTER) return -1;
    const c = multiControllerPos(id, x, y, z);
    return c ? posKey(c[0], c[1], c[2]) : -1;
  }

  // ------------------------------------------------------------------ puertos

  has(x: number, y: number, z: number): boolean {
    return this.list.has(this.keyAt(x, y, z));
  }

  /** Cuánto cabe de `s` en la entrada (sólo lo que se puede fundir, y del mismo tipo que lo que ya hay). */
  private room(m: Machine, s: ItemStack): number {
    if (!smeltRecipeFor(s.id, this.ok)) return 0;
    const max = maxStack(s.id);
    if (!m.input) return max;
    return sameKind(m.input, s) ? Math.max(0, max - m.input.count) : 0;
  }

  accepts(x: number, y: number, z: number, s: ItemStack): boolean {
    const m = this.list.get(this.keyAt(x, y, z));
    return !!m && this.room(m, s) > 0;
  }

  insert(x: number, y: number, z: number, s: ItemStack): number {
    const m = this.list.get(this.keyAt(x, y, z));
    if (!m) return 0;
    const n = Math.min(s.count, this.room(m, s));
    if (n <= 0) return 0;
    m.input = m.input ? { ...m.input, count: m.input.count + n } : { ...s, count: n };
    this.saveDirty = true;
    return n;
  }

  extractOne(x: number, y: number, z: number, take: (s: ItemStack) => boolean): boolean {
    const m = this.list.get(this.keyAt(x, y, z));
    if (!m?.output || !take({ ...m.output, count: 1 })) return false;
    m.output = m.output.count > 1 ? { ...m.output, count: m.output.count - 1 } : null;
    this.saveDirty = true;
    return true;
  }

  // ------------------------------------------------------------------ cada tick

  /** ¿Puede trabajar ahora? (tiene algo que fundir y sitio para el resultado) */
  private canWork(m: Machine): boolean {
    if (!m.input) return false;
    const r = smeltRecipeFor(m.input.id, this.ok);
    if (!r || m.input.count < r.needs[0].n) return false;
    if (!m.output) return true;
    return m.output.id === r.out.id && m.output.count + r.out.count <= maxStack(r.out.id);
  }

  /** Los hornos que pueden trabajar piden su potencia. */
  demand(out: Map<number, number>): void {
    for (const [k, m] of this.list) if (this.canWork(m)) out.set(k, MACHINE_KW.smelter);
  }

  /** Cada horno avanza según la parte de lo pedido que le llegó. */
  advance(sat: (k: number) => number, active: ReadonlyMap<number, number>): void {
    for (const [k, m] of this.list) {
      m.working = false;
      if (!active.has(k)) {
        if (!m.input && m.progress > 0) m.progress = 0;
        continue;
      }
      const s = sat(k);
      if (s <= 0) continue;
      m.working = true;
      m.progress += DT * s;
      const r = smeltRecipeFor(m.input!.id, this.ok)!;
      const secs = r.time / SMELTER_SPEED; // (3,2 s la de los minerales; 16 s el acero) ÷ velocidad 2
      if (m.progress >= secs) {
        m.progress -= secs;
        const n = r.needs[0].n;
        m.input = m.input!.count > n ? { ...m.input!, count: m.input!.count - n } : null;
        m.output = m.output ? { ...m.output, count: m.output.count + r.out.count } : { ...r.out };
        this.research?.noteProduced(r.out.id, r.out.count);
        this.saveDirty = true;
      }
    }
  }

  flush(store: ServerStore): void {
    if (!this.saveDirty) return;
    this.saveDirty = false;
    const rows: SavedRow[] = [];
    for (const r of this.saved.values()) rows.push(r);
    for (const [k, m] of this.list) {
      rows.push([keyX(k), keyY(k), keyZ(k), m.input ? stackToWire(m.input) : null, m.output ? stackToWire(m.output) : null, Math.round(m.progress * 100) / 100]);
    }
    store.setMeta('machines', JSON.stringify(rows));
  }
}
