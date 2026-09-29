// Programa lunar: los laboratorios (Factorio: `lab`, FACTORIO-REFERENCIA.md §6). 3×3, 60 kW, velocidad de investigación 1 (más con la
// tecnología «laboratory-speed»). Un brazo o una cinta le mete paquetes de ciencia (hasta 2 unidades de cada tipo); si tiene de todos los que
// pide la tecnología que se investiga, empieza una unidad: gasta un paquete de cada y tarda `time` segundos ÷ velocidad; al acabar, la
// investigación sube una unidad. Sin tecnología en curso o sin todos los paquetes, espera (gastando sólo lo de reposo).
import { LAB_BLOCK, multiInfo, multiBox, multiControllerPos, familyBase } from '../../blocks';
import { registerRedstone, type RedstoneApi } from '../../redstone';
import { LAB, LAB_PACK_LIMIT } from '../../logistics/assemblyTypes';
import { itemAlts } from '../../factorio/catalog';
import { TECHS } from '../../factorio/research';
import { sameKind, type ItemStack } from '../../items';
import { stackToWire, stackFromWire, type WireStack } from '../../protocol';
import { posKey, keyX, keyY, keyZ } from '../posKey';
import type { ServerStore } from '../store';
import { DT, type ServerContext } from './context';
import type { Redstone } from './redstone';
import type { Power, PowerConsumer } from './power';
import type { MachinePorts } from './machines';
import type { Research } from './research';

const SYSTEMS = new WeakMap<RedstoneApi, Labs>();

registerRedstone([LAB_BLOCK], {
  changed: (api, x, y, z, old, id) => SYSTEMS.get(api)?.changed(x, y, z, old, id),
});

/** Los paquetes de ciencia que alguna tecnología pide y existen en el juego: lo único que entra en un laboratorio. */
const PACK_IDS: ReadonlySet<number> = new Set(
  TECHS.flatMap((t) => t.unit?.ingredients ?? []).flatMap(([n]) => itemAlts(n) ?? []),
);

interface Lab {
  packs: ItemStack[];
  /** Segundos de la unidad en curso (0 = ninguna empezada). */
  progress: number;
  /** Tecnología a la que pertenece la unidad en curso (si cambia, se pierde). */
  tech: string;
  working: boolean;
}

type SavedRow = [number, number, number, WireStack[], number];

export class Labs implements MachinePorts, PowerConsumer {
  private list = new Map<number, Lab>();
  private saved = new Map<number, SavedRow>();
  private saveDirty = false;

  constructor(private ctx: ServerContext, rs: Redstone, store: ServerStore, private power: Power, private research: Research) {
    SYSTEMS.set(rs, this);
    try {
      const raw = JSON.parse(store.getMeta('labs') ?? '[]') as unknown;
      if (Array.isArray(raw)) {
        for (const r of raw) {
          if (Array.isArray(r) && r.length === 5 && r.slice(0, 3).every((n) => Number.isFinite(n))) this.saved.set(posKey(r[0], r[1], r[2]), r as SavedRow);
        }
      }
    } catch {
      /* mundo sin laboratorios guardados */
    }
  }

  get count(): number {
    return this.list.size;
  }

  changed(x: number, y: number, z: number, _old: number, id: number): void {
    const k = posKey(x, y, z);
    const info = id > 0 && familyBase(id) === LAB_BLOCK ? multiInfo(id) : null;
    if (!info?.controller) {
      const m = this.list.get(k);
      if (m) {
        if (m.packs.length) this.ctx.entities.dropStacks(m.packs, x + 0.5, y + 0.5, z + 0.5);
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
    this.list.set(k, { packs: (row?.[3] ?? []).map(stackFromWire).filter((s): s is ItemStack => !!s), progress: Number(row?.[4]) || 0, tech: '', working: false });
  }

  private keyAt(x: number, y: number, z: number): number {
    const id = this.ctx.world.getBlock(x, y, z);
    if (id <= 0 || familyBase(id) !== LAB_BLOCK) return -1;
    const c = multiControllerPos(id, x, y, z);
    return c ? posKey(c[0], c[1], c[2]) : -1;
  }

  /** Lo que tiene el laboratorio de (x, y, z) (para las pruebas y la ventana). */
  view(x: number, y: number, z: number): { packs: [number, number][]; progress: number; working: boolean } | null {
    const m = this.list.get(this.keyAt(x, y, z));
    return m ? { packs: m.packs.map((s) => [s.id, s.count]), progress: m.progress, working: m.working } : null;
  }

  // ------------------------------------------------------------------ puertos

  has(x: number, y: number, z: number): boolean {
    return this.list.has(this.keyAt(x, y, z));
  }

  private room(m: Lab, s: ItemStack): number {
    if (!PACK_IDS.has(s.id)) return 0;
    const have = m.packs.find((p) => sameKind(p, s));
    return LAB_PACK_LIMIT - (have?.count ?? 0);
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
    const have = m.packs.find((p) => sameKind(p, s));
    if (have) have.count += n;
    else m.packs.push({ ...s, count: n });
    this.saveDirty = true;
    return n;
  }

  /** Un laboratorio no da nada a los brazos (los paquetes se gastan dentro). */
  extractOne(): boolean {
    return false;
  }

  // ------------------------------------------------------------------ cada tick

  /** ¿Tiene de todos los paquetes que gasta la unidad de la tecnología actual? */
  private ready(m: Lab): boolean {
    const t = this.research.current;
    if (!t?.unit) return false;
    return t.unit.ingredients.every(([name, n]) => {
      const alts = itemAlts(name);
      const id = alts?.[0];
      return id !== undefined && (m.packs.find((p) => p.id === id)?.count ?? 0) >= n;
    });
  }

  demand(out: Map<number, number>): void {
    for (const [k, m] of this.list) out.set(k, m.progress > 0 || this.ready(m) ? LAB.kw : LAB.drainKw);
  }

  advance(sat: (k: number) => number): void {
    const t = this.research.current;
    const speed = LAB.speed * (1 + this.research.modifier('laboratory-speed'));
    for (const [k, m] of this.list) {
      m.working = false;
      if (!t?.unit) {
        m.progress = 0;
        continue;
      }
      if (m.tech !== t.name) {
        m.tech = t.name;
        m.progress = 0;
      }
      if (m.progress <= 0) {
        if (!this.ready(m)) continue;
        // Empieza una unidad: gasta un paquete de cada tipo de golpe.
        for (const [name, n] of t.unit.ingredients) {
          const p = m.packs.find((q) => q.id === itemAlts(name)![0])!;
          p.count -= n;
        }
        m.packs = m.packs.filter((p) => p.count > 0);
        m.progress = 1e-6;
        this.saveDirty = true;
      }
      const s = sat(k);
      if (s <= 0) continue;
      m.working = true;
      m.progress += DT * s * speed;
      if (m.progress >= t.unit.time) {
        m.progress = 0;
        this.saveDirty = true;
        this.research.addUnit();
        if (this.research.current?.name !== t.name) return; // la tecnología terminó: el resto de laboratorios vuelve a empezar el próximo tick
      }
    }
  }

  flush(store: ServerStore): void {
    if (!this.saveDirty) return;
    this.saveDirty = false;
    const rows: SavedRow[] = [...this.saved.values()];
    for (const [k, m] of this.list) rows.push([keyX(k), keyY(k), keyZ(k), m.packs.map(stackToWire).filter((w): w is WireStack => !!w), Math.round(m.progress * 100) / 100]);
    store.setMeta('labs', JSON.stringify(rows));
  }
}
