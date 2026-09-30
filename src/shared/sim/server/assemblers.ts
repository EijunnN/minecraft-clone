// Programa lunar: las máquinas de fabricar con recetas de Factorio (FACTORIO-REFERENCIA.md §5 y §7): ensambladoras 1-3, planta química y
// refinería de petróleo.
//
// Cada una hace UNA receta, la que elija el jugador en su ventana. Tiene un hueco por ingrediente de la receta (los brazos y las cintas sólo
// meten lo que la receta pide, hasta lo que cabe en dos tandas) y un hueco de resultado del que sacan los brazos. Las recetas con fluidos
// usan las cajas de fluido de la máquina: sus puertos de tubería (Fluids) sólo están abiertos para los fluidos que la receta usa, y cada caja
// sólo admite el suyo. Trabaja mientras tenga todos los ingredientes (objetos y fluidos) y sitio para los resultados, a la velocidad de su
// nivel y proporcional a la energía que recibe. Cambiar la receta devuelve al suelo lo que había dentro y vacía las cajas de fluido.
// Guarda su estado (metadatos 'assemblers' de la dimensión).
import { ASSEMBLER_BLOCKS, multiInfo, multiBox, multiControllerPos, multiPort, familyBase } from '../../blocks';
import { registerRedstone, type RedstoneApi } from '../../redstone';
import { ASSEMBLERS } from '../../logistics/assemblyTypes';
import { assemblerRecipe, ingredientLimit, outputLimit } from '../../logistics/assembly';
import { maxStack, type ItemStack } from '../../items';
import { stackToWire, stackFromWire, type WireStack } from '../../protocol';
import { posKey, keyX, keyY, keyZ } from '../posKey';
import type { ServerStore } from '../store';
import { DT, type ServerContext } from './context';
import type { Redstone } from './redstone';
import type { Power, PowerConsumer } from './power';
import type { MachinePorts } from './machines';
import type { FRecipe } from '../../factorio/catalog';
import type { Research } from './research';
import type { Fluids } from './fluids';

const SYSTEMS = new WeakMap<RedstoneApi, Assemblers>();

registerRedstone(ASSEMBLER_BLOCKS, {
  changed: (api, x, y, z, old, id) => SYSTEMS.get(api)?.changed(x, y, z, old, id),
});

interface Asm {
  tier: number;
  dir: number;
  /** Clave de la receta (0 = ninguna). */
  recipe: number;
  /** Lo que hay de cada ingrediente de la receta (en el orden de `needs`). */
  slots: (ItemStack | null)[];
  output: ItemStack | null;
  progress: number;
  working: boolean;
  /** Cajas de fluido de entrada y de salida (claves de Fluids). */
  fin: number[];
  fout: number[];
}

type SavedRow = [number, number, number, number, (WireStack | null)[], WireStack | null, number, [number, number][]?, [number, number][]?];

export interface AsmView {
  tier: number;
  recipe: number;
  /** Por ingrediente: [objeto que hay (0 si nada), cuántos hay, cuántos pide una tanda, cuántos admite]. */
  needs: number[][];
  output: [number, number] | null;
  progress: number;
  working: boolean;
  /** Fluidos de entrada y de salida: [fluido, cantidad que hay, cantidad por tanda]. */
  fluidsIn: number[][];
  fluidsOut: number[][];
}

export class Assemblers implements MachinePorts, PowerConsumer {
  /** La investigación (sólo se pueden poner las recetas desbloqueadas; cuenta lo fabricado). */
  research: Research | null = null;
  /** Las tuberías (las cajas de fluido de las máquinas que las tienen). */
  fluids: Fluids | null = null;
  private list = new Map<number, Asm>();
  private saved = new Map<number, SavedRow>();
  private saveDirty = false;

  constructor(private ctx: ServerContext, rs: Redstone, store: ServerStore, private power: Power) {
    SYSTEMS.set(rs, this);
    try {
      const raw = JSON.parse(store.getMeta('assemblers') ?? '[]') as unknown;
      if (Array.isArray(raw)) {
        for (const r of raw) {
          if (Array.isArray(r) && r.length >= 7 && r.slice(0, 3).every((n) => Number.isFinite(n))) this.saved.set(posKey(r[0], r[1], r[2]), r as SavedRow);
        }
      }
    } catch {
      /* mundo sin ensambladoras guardadas */
    }
  }

  get count(): number {
    return this.list.size;
  }

  changed(x: number, y: number, z: number, _old: number, id: number): void {
    const k = posKey(x, y, z);
    const info = id > 0 && ASSEMBLER_BLOCKS.includes(familyBase(id)) ? multiInfo(id) : null;
    if (!info?.controller) {
      const m = this.list.get(k);
      if (m && !info) {
        const drops = [...m.slots, m.output].filter((s): s is ItemStack => !!s);
        if (drops.length) this.ctx.entities.dropStacks(drops, x + 0.5, y + 0.5, z + 0.5);
        this.list.delete(k);
        this.power.detach(k);
        this.fluids?.clearMachinePorts(k);
        for (const b of [...m.fin, ...m.fout]) this.fluids?.freeBox(b);
        this.saveDirty = true;
      }
      return;
    }
    const existing = this.list.get(k);
    if (existing) {
      if (existing.dir !== info.dir) {
        existing.dir = info.dir;
        this.applyPorts(k, x, y, z, existing);
      }
      return;
    }
    this.power.attach(k, multiBox(id, x, y, z)!);
    const row = this.saved.get(k);
    this.saved.delete(k);
    const tier = ASSEMBLER_BLOCKS.indexOf(familyBase(id));
    const type = ASSEMBLERS[tier];
    const recipe = row && assemblerRecipe(row[3]) && type.categories.includes(assemblerRecipe(row[3])!.category) ? row[3] : 0;
    const r = recipe ? assemblerRecipe(recipe)! : null;
    const slots: (ItemStack | null)[] = r ? r.needs.map((_, i) => (row?.[4]?.[i] ? stackFromWire(row[4][i]!) : null)) : [];
    const m: Asm = {
      tier, dir: info.dir, recipe, slots, output: row?.[5] ? stackFromWire(row[5]) : null, progress: Number(row?.[6]) || 0, working: false, fin: [], fout: [],
    };
    this.list.set(k, m);
    if (this.fluids) {
      m.fin = type.fluidIn.map((p) => this.fluids!.allocBox(p.cap));
      m.fout = type.fluidOut.map((p) => this.fluids!.allocBox(p.cap));
      this.configureBoxes(m);
      // Lo que tenían las cajas al guardar.
      (row?.[7] ?? []).forEach(([f, a], i) => m.fin[i] && a > 0 && this.fluids!.graph.put(m.fin[i], f, a));
      (row?.[8] ?? []).forEach(([f, a], i) => m.fout[i] && a > 0 && this.fluids!.graph.put(m.fout[i], f, a));
      this.applyPorts(k, x, y, z, m);
    }
  }

  private keyAt(x: number, y: number, z: number): number {
    const id = this.ctx.world.getBlock(x, y, z);
    if (id <= 0 || !ASSEMBLER_BLOCKS.includes(familyBase(id))) return -1;
    const c = multiControllerPos(id, x, y, z);
    return c ? posKey(c[0], c[1], c[2]) : -1;
  }

  private recipeOf(m: Asm): FRecipe | null {
    return m.recipe ? assemblerRecipe(m.recipe) ?? null : null;
  }

  // ------------------------------------------------------------------ cajas de fluido

  /** Fija el modo y el fluido que admite cada caja según la receta (las que la receta no usa, cerradas). */
  private configureBoxes(m: Asm): void {
    if (!this.fluids) return;
    const r = this.recipeOf(m);
    const boxes = this.fluids.graph.boxes;
    m.fin.forEach((b, i) => {
      const box = boxes.get(b);
      if (!box) return;
      const need = r?.fluidsIn.find((f) => f.box === i);
      box.mode = 'in';
      box.filter = need ? need.fluid : -1; // −1: no admite nada
    });
    m.fout.forEach((b, i) => {
      const box = boxes.get(b);
      if (!box) return;
      const out = r?.fluidsOut.find((f) => f.box === i);
      box.mode = 'out';
      box.filter = out ? out.fluid : -1;
    });
  }

  /** Abre los puertos de tubería que la receta usa. */
  private applyPorts(k: number, x: number, y: number, z: number, m: Asm): void {
    if (!this.fluids) return;
    const type = ASSEMBLERS[m.tier];
    const base = ASSEMBLER_BLOCKS[m.tier];
    const r = this.recipeOf(m);
    const ports: { x: number; y: number; z: number; face: number; box: number }[] = [];
    type.fluidIn.forEach((p, i) => {
      if (r?.fluidsIn.some((f) => f.box === i)) ports.push({ ...multiPort(base, m.dir, x, y, z, p.lx, p.ly, p.lz, p.face), box: m.fin[i] });
    });
    type.fluidOut.forEach((p, i) => {
      if (r?.fluidsOut.some((f) => f.box === i)) ports.push({ ...multiPort(base, m.dir, x, y, z, p.lx, p.ly, p.lz, p.face), box: m.fout[i] });
    });
    this.fluids.setMachinePorts(k, ports);
  }

  private clearBoxes(m: Asm): void {
    for (const b of [...m.fin, ...m.fout]) this.fluids?.graph.take(b, 1e12);
  }

  // ------------------------------------------------------------------ la receta

  /** Pone (o quita, con 0) la receta de la máquina de (x, y, z). Lo que había dentro cae al suelo. */
  setRecipe(x: number, y: number, z: number, key: number): boolean {
    const k = this.keyAt(x, y, z);
    const m = this.list.get(k);
    const rec = key ? assemblerRecipe(key) : undefined;
    if (!m) return false;
    if (key !== 0) {
      if (!rec || !ASSEMBLERS[m.tier].categories.includes(rec.category)) return false;
      if (this.research && !this.research.recipeUnlocked(rec.name)) return false;
    }
    if (m.recipe === key) return true;
    const drops = [...m.slots, m.output].filter((s): s is ItemStack => !!s);
    if (drops.length) this.ctx.entities.dropStacks(drops, keyX(k) + 0.5, keyY(k) + 1.5, keyZ(k) + 0.5);
    m.recipe = key;
    m.slots = key ? assemblerRecipe(key)!.needs.map(() => null) : [];
    m.output = null;
    m.progress = 0;
    this.clearBoxes(m);
    this.configureBoxes(m);
    this.applyPorts(k, keyX(k), keyY(k), keyZ(k), m);
    this.saveDirty = true;
    return true;
  }

  /** Lo que enseña la ventana de la máquina de (x, y, z). */
  view(x: number, y: number, z: number): AsmView | null {
    const m = this.list.get(this.keyAt(x, y, z));
    if (!m) return null;
    const r = this.recipeOf(m);
    const type = ASSEMBLERS[m.tier];
    const boxes = this.fluids?.graph.boxes;
    return {
      tier: m.tier, recipe: m.recipe,
      needs: r ? r.needs.map((n, i) => [m.slots[i]?.id ?? 0, m.slots[i]?.count ?? 0, n.n, ingredientLimit(r, i, type)]) : [],
      output: m.output ? [m.output.id, m.output.count] : null,
      progress: r ? Math.min(1, m.progress / (r.time / type.speed)) : 0,
      working: m.working,
      fluidsIn: r ? r.fluidsIn.map((f) => [f.fluid, boxes?.get(m.fin[f.box])?.amount ?? 0, f.amount]) : [],
      fluidsOut: r ? r.fluidsOut.map((f) => [f.fluid, boxes?.get(m.fout[f.box])?.amount ?? 0, f.amount]) : [],
    };
  }

  /** La receta de la máquina de (x, y, z) (para las pruebas). */
  recipeAt(x: number, y: number, z: number): number {
    return this.list.get(this.keyAt(x, y, z))?.recipe ?? 0;
  }

  // ------------------------------------------------------------------ puertos

  has(x: number, y: number, z: number): boolean {
    return this.list.has(this.keyAt(x, y, z));
  }

  /** En qué hueco de ingrediente entra `s` y cuánto cabe (−1 si en ninguno). */
  private slotFor(m: Asm, s: ItemStack): { i: number; room: number } {
    const r = this.recipeOf(m);
    if (!r) return { i: -1, room: 0 };
    const type = ASSEMBLERS[m.tier];
    for (let i = 0; i < r.needs.length; i++) {
      if (!r.needs[i].alts.includes(s.id)) continue;
      const have = m.slots[i];
      if (have && (have.id !== s.id || have.dmg !== s.dmg)) continue; // el hueco ya tiene otra de las alternativas
      const room = Math.min(maxStack(s.id), ingredientLimit(r, i, type)) - (have?.count ?? 0);
      if (room > 0) return { i, room };
    }
    return { i: -1, room: 0 };
  }

  accepts(x: number, y: number, z: number, s: ItemStack): boolean {
    const m = this.list.get(this.keyAt(x, y, z));
    return !!m && this.slotFor(m, s).room > 0;
  }

  insert(x: number, y: number, z: number, s: ItemStack): number {
    const m = this.list.get(this.keyAt(x, y, z));
    if (!m) return 0;
    const { i, room } = this.slotFor(m, s);
    const n = Math.min(s.count, room);
    if (i < 0 || n <= 0) return 0;
    const have = m.slots[i];
    m.slots[i] = have ? { ...have, count: have.count + n } : { ...s, count: n };
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

  private canWork(m: Asm): boolean {
    const r = this.recipeOf(m);
    if (!r) return false;
    for (let i = 0; i < r.needs.length; i++) if ((m.slots[i]?.count ?? 0) < r.needs[i].n) return false;
    if (r.fluidsIn.length || r.fluidsOut.length) {
      const boxes = this.fluids?.graph.boxes;
      if (!boxes) return false;
      for (const f of r.fluidsIn) {
        const b = boxes.get(m.fin[f.box]);
        if (!b || b.fluid !== f.fluid || b.amount + 1e-9 < f.amount) return false;
      }
      for (const f of r.fluidsOut) {
        const b = boxes.get(m.fout[f.box]);
        if (!b || b.cap - b.amount + 1e-9 < f.amount || (b.amount > 1e-9 && b.fluid !== f.fluid)) return false;
      }
    }
    if (r.out.count > 0 && m.output) return m.output.id === r.out.id && m.output.count + r.out.count <= outputLimit(r);
    return true;
  }

  /** Trabajando pide toda su potencia; parada (con receta o sin ella), sólo lo de reposo. */
  demand(out: Map<number, number>): void {
    for (const [k, m] of this.list) {
      const t = ASSEMBLERS[m.tier];
      out.set(k, this.canWork(m) ? t.kw : t.drainKw);
    }
  }

  advance(sat: (k: number) => number): void {
    for (const [k, m] of this.list) {
      m.working = false;
      const r = this.recipeOf(m);
      if (!r || !this.canWork(m)) continue;
      const s = sat(k);
      if (s <= 0) continue;
      m.working = true;
      const type = ASSEMBLERS[m.tier];
      m.progress += DT * s * type.speed;
      if (m.progress >= r.time) {
        m.progress -= r.time;
        r.needs.forEach((n, i) => {
          const have = m.slots[i]!;
          m.slots[i] = have.count > n.n ? { ...have, count: have.count - n.n } : null;
        });
        for (const f of r.fluidsIn) this.fluids!.graph.take(m.fin[f.box], f.amount);
        for (const f of r.fluidsOut) this.fluids!.graph.put(m.fout[f.box], f.fluid, f.amount);
        if (r.out.count > 0) {
          m.output = m.output ? { ...m.output, count: m.output.count + r.out.count } : { ...r.out };
          this.research?.noteProduced(r.out.id, r.out.count);
        }
        this.saveDirty = true;
      }
    }
  }

  flush(store: ServerStore): void {
    if (!this.saveDirty) return;
    this.saveDirty = false;
    const rows: SavedRow[] = [...this.saved.values()];
    const boxes = this.fluids?.graph.boxes;
    const dump = (keys: number[]): [number, number][] => keys.map((b) => [boxes?.get(b)?.fluid ?? 0, Math.round((boxes?.get(b)?.amount ?? 0) * 100) / 100]);
    for (const [k, m] of this.list) {
      rows.push([
        keyX(k), keyY(k), keyZ(k), m.recipe, m.slots.map((s) => (s ? stackToWire(s) : null)), m.output ? stackToWire(m.output) : null,
        Math.round(m.progress * 100) / 100, dump(m.fin), dump(m.fout),
      ]);
    }
    store.setMeta('assemblers', JSON.stringify(rows));
  }
}
