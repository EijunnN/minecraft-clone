// Programa lunar: los hornos de piedra y de acero (Factorio: `stone-furnace` y `steel-furnace`, FACTORIO-REFERENCIA.md §5).
//
// Funden lo que les entra (por un brazo o una cinta) a 3,2 s por objeto a velocidad 1 (la del horno de piedra; el de acero, la doble) y
// gastan 90 kW en combustible: el hueco de combustible acepta lo que arde (el carbón da 4 MJ, 44 s de trabajo) y se quema una unidad
// cuando no queda energía. No usan la red eléctrica. Los brazos meten combustible y mineral por el mismo puerto: lo que se puede
// fundir va a la entrada, lo que arde y no se funde, al combustible; el resultado lo sacan los brazos.
import { FUEL_FURNACE_BLOCKS, multiInfo, multiControllerPos, familyBase } from '../../blocks';
import { registerRedstone, type RedstoneApi } from '../../redstone';
import { smeltRecipeFor } from '../../logistics/assembly';
import { FURNACES, FURNACE_KJ_PER_FUEL, FURNACE_FUEL_STACK } from '../../logistics/assemblyTypes';
import { ITEMS, maxStack, sameKind, type ItemStack } from '../../items';
import { stackToWire, stackFromWire, type WireStack } from '../../protocol';
import { posKey, keyX, keyY, keyZ } from '../posKey';
import type { ServerStore } from '../store';
import { DT, type ServerContext } from './context';
import type { Redstone } from './redstone';
import type { MachinePorts } from './machines';
import type { Research } from './research';

const SYSTEMS = new WeakMap<RedstoneApi, Furnaces>();

registerRedstone(FUEL_FURNACE_BLOCKS, {
  changed: (api, x, y, z, old, id) => SYSTEMS.get(api)?.changed(x, y, z, old, id),
});

interface Fur {
  tier: number;
  input: ItemStack | null;
  output: ItemStack | null;
  fuel: ItemStack | null;
  /** kJ de combustible ya quemado que aún no se gastó. */
  energy: number;
  progress: number;
  working: boolean;
}

type SavedRow = [number, number, number, WireStack | null, WireStack | null, WireStack | null, number, number];

export interface FurView {
  tier: number;
  input: [number, number] | null;
  output: [number, number] | null;
  fuel: [number, number] | null;
  energy: number;
  progress: number;
  working: boolean;
}

const fuelValue = (id: number): number => ITEMS[id]?.fuel ?? 0;

export class Furnaces implements MachinePorts {
  /** La investigación (fija las recetas de fundición desbloqueadas y cuenta lo fabricado). */
  research: Research | null = null;
  private list = new Map<number, Fur>();
  private saved = new Map<number, SavedRow>();
  private saveDirty = false;

  constructor(private ctx: ServerContext, rs: Redstone, store: ServerStore) {
    SYSTEMS.set(rs, this);
    try {
      const raw = JSON.parse(store.getMeta('furnaces') ?? '[]') as unknown;
      if (Array.isArray(raw)) {
        for (const r of raw) {
          if (Array.isArray(r) && r.length === 8 && r.slice(0, 3).every((n) => Number.isFinite(n))) this.saved.set(posKey(r[0], r[1], r[2]), r as SavedRow);
        }
      }
    } catch {
      /* mundo sin hornos guardados */
    }
  }

  get count(): number {
    return this.list.size;
  }

  changed(x: number, y: number, z: number, _old: number, id: number): void {
    const k = posKey(x, y, z);
    const info = id > 0 && FUEL_FURNACE_BLOCKS.includes(familyBase(id)) ? multiInfo(id) : null;
    if (!info?.controller) {
      const m = this.list.get(k);
      if (m) {
        const drops = [m.input, m.output, m.fuel].filter((s): s is ItemStack => !!s);
        if (drops.length) this.ctx.entities.dropStacks(drops, x + 0.5, y + 0.5, z + 0.5);
        this.list.delete(k);
        this.saveDirty = true;
      }
      return;
    }
    if (this.list.has(k)) return;
    const row = this.saved.get(k);
    this.saved.delete(k);
    this.list.set(k, {
      tier: FUEL_FURNACE_BLOCKS.indexOf(familyBase(id)),
      input: row?.[3] ? stackFromWire(row[3]) : null, output: row?.[4] ? stackFromWire(row[4]) : null, fuel: row?.[5] ? stackFromWire(row[5]) : null,
      energy: Number(row?.[6]) || 0, progress: Number(row?.[7]) || 0, working: false,
    });
  }

  private keyAt(x: number, y: number, z: number): number {
    const id = this.ctx.world.getBlock(x, y, z);
    if (id <= 0 || !FUEL_FURNACE_BLOCKS.includes(familyBase(id))) return -1;
    const c = multiControllerPos(id, x, y, z);
    return c ? posKey(c[0], c[1], c[2]) : -1;
  }

  view(x: number, y: number, z: number): FurView | null {
    const m = this.list.get(this.keyAt(x, y, z));
    if (!m) return null;
    const w = (s: ItemStack | null): [number, number] | null => (s ? [s.id, s.count] : null);
    return {
      tier: m.tier, input: w(m.input), output: w(m.output), fuel: w(m.fuel), energy: Math.round(m.energy),
      progress: this.progressOf(m), working: m.working,
    };
  }

  private ok = (r: { name: string }): boolean => !this.research || this.research.recipeUnlocked(r.name);

  private progressOf(m: Fur): number {
    const r = m.input ? smeltRecipeFor(m.input.id, this.ok) : undefined;
    return r ? Math.min(1, m.progress / (r.time / FURNACES[m.tier].speed)) : 0;
  }

  // ------------------------------------------------------------------ puertos

  has(x: number, y: number, z: number): boolean {
    return this.list.has(this.keyAt(x, y, z));
  }

  /** Cuánto cabe de `s` y dónde: lo que se funde va a la entrada; lo que arde (y no se funde), al combustible. */
  private room(m: Fur, s: ItemStack): { into: 'input' | 'fuel' | null; room: number } {
    if (smeltRecipeFor(s.id, this.ok)) {
      const max = maxStack(s.id);
      if (!m.input) return { into: 'input', room: max };
      return sameKind(m.input, s) ? { into: 'input', room: Math.max(0, max - m.input.count) } : { into: null, room: 0 };
    }
    if (fuelValue(s.id) > 0) {
      if (!m.fuel) return { into: 'fuel', room: FURNACE_FUEL_STACK };
      return sameKind(m.fuel, s) ? { into: 'fuel', room: Math.max(0, FURNACE_FUEL_STACK - m.fuel.count) } : { into: null, room: 0 };
    }
    return { into: null, room: 0 };
  }

  accepts(x: number, y: number, z: number, s: ItemStack): boolean {
    const m = this.list.get(this.keyAt(x, y, z));
    return !!m && this.room(m, s).room > 0;
  }

  insert(x: number, y: number, z: number, s: ItemStack): number {
    const m = this.list.get(this.keyAt(x, y, z));
    if (!m) return 0;
    const { into, room } = this.room(m, s);
    const n = Math.min(s.count, room);
    if (!into || n <= 0) return 0;
    const have = m[into];
    m[into] = have ? { ...have, count: have.count + n } : { ...s, count: n };
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

  private canWork(m: Fur): boolean {
    if (!m.input) return false;
    const r = smeltRecipeFor(m.input.id, this.ok);
    if (!r || m.input.count < r.needs[0].n) return false;
    if (!m.output) return true;
    return m.output.id === r.out.id && m.output.count + r.out.count <= maxStack(r.out.id);
  }

  tick(): void {
    for (const m of this.list.values()) {
      m.working = false;
      if (!this.canWork(m)) continue;
      const type = FURNACES[m.tier];
      const use = type.kw * DT; // kJ de este tick
      if (m.energy < use) {
        // Quema una unidad de combustible (si no hay, se para hasta que un brazo le dé más).
        const f = m.fuel;
        if (!f || fuelValue(f.id) <= 0) continue;
        m.energy += fuelValue(f.id) * FURNACE_KJ_PER_FUEL;
        m.fuel = f.count > 1 ? { ...f, count: f.count - 1 } : null;
        this.saveDirty = true;
      }
      m.energy -= use;
      m.working = true;
      m.progress += DT * type.speed;
      const r = smeltRecipeFor(m.input!.id, this.ok)!;
      if (m.progress >= r.time) {
        m.progress -= r.time;
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
    const rows: SavedRow[] = [...this.saved.values()];
    const w = (s: ItemStack | null) => (s ? stackToWire(s) : null);
    for (const [k, m] of this.list) rows.push([keyX(k), keyY(k), keyZ(k), w(m.input), w(m.output), w(m.fuel), Math.round(m.energy * 10) / 10, Math.round(m.progress * 100) / 100]);
    store.setMeta('furnaces', JSON.stringify(rows));
  }
}
