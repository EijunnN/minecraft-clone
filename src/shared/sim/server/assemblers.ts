// Programa lunar: las ensambladoras 1–3 (Factorio: `assembling-machine-1/2/3`, FACTORIO-REFERENCIA.md §5).
//
// Cada una hace UNA receta de fabricación, la que elija el jugador en su ventana. Tiene un hueco por ingrediente de la receta (los brazos
// y las cintas sólo meten lo que la receta pide, hasta lo que cabe en dos tandas) y un hueco de resultado del que sacan los brazos.
// Trabaja mientras tenga todos los ingredientes y sitio para el resultado, a la velocidad de su nivel y proporcional a la energía que
// recibe. Cambiar la receta devuelve al suelo lo que había dentro. Guarda su estado (metadatos 'assemblers' de la dimensión).
import { ASSEMBLER_BLOCKS, multiInfo, multiBox, multiControllerPos, familyBase } from '../../blocks';
import { registerRedstone, type RedstoneApi } from '../../redstone';
import { ASSEMBLERS } from '../../logistics/assemblyTypes';
import { assemblerRecipe, recipeSeconds, ingredientLimit, outputLimit } from '../../logistics/assembly';
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

const SYSTEMS = new WeakMap<RedstoneApi, Assemblers>();

registerRedstone(ASSEMBLER_BLOCKS, {
  changed: (api, x, y, z, old, id) => SYSTEMS.get(api)?.changed(x, y, z, old, id),
});

interface Asm {
  tier: number;
  /** Clave de la receta (0 = ninguna). */
  recipe: number;
  /** Lo que hay de cada ingrediente de la receta (en el orden de `needs`). */
  slots: (ItemStack | null)[];
  output: ItemStack | null;
  progress: number;
  working: boolean;
}

type SavedRow = [number, number, number, number, (WireStack | null)[], WireStack | null, number];

export interface AsmView {
  tier: number;
  recipe: number;
  /** Por ingrediente: [objeto que hay (0 si nada), cuántos hay, cuántos pide una tanda, cuántos admite]. */
  needs: number[][];
  output: [number, number] | null;
  progress: number;
  working: boolean;
}

export class Assemblers implements MachinePorts, PowerConsumer {
  /** La investigación (sólo se pueden poner las recetas desbloqueadas; cuenta lo fabricado). */
  research: Research | null = null;
  private list = new Map<number, Asm>();
  private saved = new Map<number, SavedRow>();
  private saveDirty = false;

  constructor(private ctx: ServerContext, rs: Redstone, store: ServerStore, private power: Power) {
    SYSTEMS.set(rs, this);
    try {
      const raw = JSON.parse(store.getMeta('assemblers') ?? '[]') as unknown;
      if (Array.isArray(raw)) {
        for (const r of raw) {
          if (Array.isArray(r) && r.length === 7 && r.slice(0, 3).every((n) => Number.isFinite(n))) this.saved.set(posKey(r[0], r[1], r[2]), r as SavedRow);
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
      if (m) {
        const drops = [...m.slots, m.output].filter((s): s is ItemStack => !!s);
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
    const tier = ASSEMBLER_BLOCKS.indexOf(familyBase(id));
    const recipe = row && assemblerRecipe(row[3]) ? row[3] : 0;
    const r = recipe ? assemblerRecipe(recipe)! : null;
    const slots: (ItemStack | null)[] = r ? r.needs.map((_, i) => (row?.[4]?.[i] ? stackFromWire(row[4][i]!) : null)) : [];
    this.list.set(k, { tier, recipe, slots, output: row?.[5] ? stackFromWire(row[5]) : null, progress: Number(row?.[6]) || 0, working: false });
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

  // ------------------------------------------------------------------ la receta

  /** Pone (o quita, con 0) la receta de la ensambladora de (x, y, z). Lo que había dentro cae al suelo. */
  setRecipe(x: number, y: number, z: number, key: number): boolean {
    const k = this.keyAt(x, y, z);
    const m = this.list.get(k);
    const rec = key ? assemblerRecipe(key) : undefined;
    if (!m || (key !== 0 && (!rec || (this.research && !this.research.recipeUnlocked(rec.name))))) return false;
    if (m.recipe === key) return true;
    const drops = [...m.slots, m.output].filter((s): s is ItemStack => !!s);
    if (drops.length) this.ctx.entities.dropStacks(drops, keyX(k) + 0.5, keyY(k) + 1.5, keyZ(k) + 0.5);
    m.recipe = key;
    m.slots = key ? assemblerRecipe(key)!.needs.map(() => null) : [];
    m.output = null;
    m.progress = 0;
    this.saveDirty = true;
    return true;
  }

  /** Lo que enseña la ventana de la ensambladora de (x, y, z). */
  view(x: number, y: number, z: number): AsmView | null {
    const m = this.list.get(this.keyAt(x, y, z));
    if (!m) return null;
    const r = this.recipeOf(m);
    const type = ASSEMBLERS[m.tier];
    return {
      tier: m.tier, recipe: m.recipe,
      needs: r ? r.needs.map((n, i) => [m.slots[i]?.id ?? 0, m.slots[i]?.count ?? 0, n.n, ingredientLimit(r, i, type)]) : [],
      output: m.output ? [m.output.id, m.output.count] : null,
      progress: r ? Math.min(1, m.progress / (recipeSeconds(r) / type.speed)) : 0,
      working: m.working,
    };
  }

  /** La receta de la ensambladora de (x, y, z) (para las pruebas). */
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
    if (!m.output) return true;
    return m.output.id === r.out.id && m.output.count + r.out.count <= outputLimit(r);
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
      const need = recipeSeconds(r);
      if (m.progress >= need) {
        m.progress -= need;
        r.needs.forEach((n, i) => {
          const have = m.slots[i]!;
          m.slots[i] = have.count > n.n ? { ...have, count: have.count - n.n } : null;
        });
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
    for (const [k, m] of this.list) {
      rows.push([
        keyX(k), keyY(k), keyZ(k), m.recipe, m.slots.map((s) => (s ? stackToWire(s) : null)), m.output ? stackToWire(m.output) : null,
        Math.round(m.progress * 100) / 100,
      ]);
    }
    store.setMeta('assemblers', JSON.stringify(rows));
  }
}
