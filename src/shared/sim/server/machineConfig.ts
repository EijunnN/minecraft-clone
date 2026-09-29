// Programa lunar: la configuración de las máquinas que la tienen (los divisores y, más adelante, los brazos): el jugador la cambia desde
// la ventana de la máquina y manda ('mcfg') los campos que cambian. Todo se valida aquí: alcance, que haya lo que dice y valores en rango.
import {
  splitterInfo, multiControllerPos, multiInfo, multiFootprint, beltInfo, beltState, undergroundInfo, undergroundState, inserterInfo, inserterState,
  AIR, BLOCK_REPLACEABLE, familyBase, isUndergroundPipe, isOffshorePump, undergroundPipeDir, offshorePumpDir,
} from '../../blocks';
import { isValidItem } from '../../items';
import type { ClientMsg } from '../../protocol';
import type { ServerContext, Session } from './context';
import { ITEMS } from '../../items';
import { INSERTER_FILTERS } from '../../logistics/inserters';
import type { Belts, SplitterConfig } from './belts';
import type { Inserters } from './inserters';
import type { Assemblers } from './assemblers';
import type { Furnaces } from './furnaces';
import { recipesMaking } from '../../logistics/assembly';
import { isAssemblerBlock, isFuelFurnace } from '../../blocks';

import { assemblerRecipe } from '../../logistics/assembly';
const assemblerOut = (key: number): number => assemblerRecipe(key)?.out.id ?? 0;

const sgn = (v: unknown): -1 | 0 | 1 => (Number(v) < 0 ? -1 : Number(v) > 0 ? 1 : 0);

export class MachineConfig {
  constructor(
    private ctx: ServerContext, private belts: Belts, private inserters: Inserters, private assemblers: Assemblers, private furnaces: Furnaces,
  ) {}

  onConfig(s: Session, msg: Extract<ClientMsg, { t: 'mcfg' }>): void {
    const x = Number(msg.x), y = Number(msg.y), z = Number(msg.z);
    if (![x, y, z].every(Number.isInteger) || !this.ctx.reachOk(s, x, y, z, 8) || !msg.c || typeof msg.c !== 'object') return;
    const id = this.ctx.world.getBlock(x, y, z);
    if (id <= 0) return;
    if (splitterInfo(id)) {
      const c = multiControllerPos(id, x, y, z)!;
      const patch: Partial<SplitterConfig> = {};
      if ('inPri' in msg.c) patch.inPri = sgn(msg.c.inPri);
      if ('outPri' in msg.c) patch.outPri = sgn(msg.c.outPri);
      if ('filterSide' in msg.c) patch.filterSide = Number(msg.c.filterSide) < 0 ? -1 : 1;
      if ('filter' in msg.c) {
        const f = Array.isArray(msg.c.filter) ? Number(msg.c.filter[0]) : Number(msg.c.filter);
        patch.filter = Number.isInteger(f) && f > 0 && isValidItem(f) ? f : 0;
      }
      this.belts.setSplitterConfig(c[0], c[1], c[2], patch);
      return;
    }
    const ins = inserterInfo(id);
    if (ins) this.onInserter(s, x, y, z, ins.tier, msg.c);
    else if (isAssemblerBlock(id)) this.onAssembler(s, x, y, z, msg.c);
    else if (isFuelFurnace(id)) this.onFurnace(s, x, y, z, msg.c);
  }

  /** Ensambladora: `q` pide su ventana; `out` (objeto que se quiere fabricar) y `alt` (cuál de sus recetas) eligen la receta; `clear` la quita. */
  private onAssembler(s: Session, x: number, y: number, z: number, c: Record<string, number | number[]>): void {
    const id = this.ctx.world.getBlock(x, y, z);
    const ctrl = multiControllerPos(id, x, y, z);
    if (!ctrl) return;
    if ('clear' in c || ('out' in c && !Number(c.out))) this.assemblers.setRecipe(ctrl[0], ctrl[1], ctrl[2], 0);
    else if ('out' in c) {
      const list = recipesMaking(Number(c.out));
      const alt = Math.max(0, Math.min(list.length - 1, Math.trunc(Number(c.alt)) || 0));
      if (list[alt]) this.assemblers.setRecipe(ctrl[0], ctrl[1], ctrl[2], list[alt].key);
    } else if ('recipe' in c) this.assemblers.setRecipe(ctrl[0], ctrl[1], ctrl[2], Math.trunc(Number(c.recipe)) | 0);
    else if (!('q' in c)) return;
    const v = this.assemblers.view(ctrl[0], ctrl[1], ctrl[2]);
    if (!v) return;
    const alts = v.recipe ? recipesMaking(assemblerOut(v.recipe)).map((r) => r.key) : [];
    this.ctx.send(s, {
      t: 'mview', x: ctrl[0], y: ctrl[1], z: ctrl[2], kind: 0, tier: v.tier, recipe: v.recipe, alts, needs: v.needs, out: v.output,
      progress: Math.round(v.progress * 1000), working: v.working ? 1 : 0, fuel: null, input: null, energy: 0, took: 0, open: 'q' in c && !('r' in c) ? 1 : 0,
    });
  }

  /** Horno de combustible: `q` pide su ventana; `fuel` y `n` le dan lo que el jugador lleva en la mano. */
  private onFurnace(s: Session, x: number, y: number, z: number, c: Record<string, number | number[]>): void {
    const id = this.ctx.world.getBlock(x, y, z);
    const ctrl = multiControllerPos(id, x, y, z);
    if (!ctrl) return;
    let took = 0;
    if ('fuel' in c) {
      const fid = Number(c.fuel), n = Math.max(0, Math.min(64, Math.trunc(Number(c.n)) || 0));
      if (Number.isInteger(fid) && ITEMS[fid] && n > 0) took = this.furnaces.insert(ctrl[0], ctrl[1], ctrl[2], { id: fid, count: n });
    }
    if (!('q' in c) && !took) return;
    const v = this.furnaces.view(ctrl[0], ctrl[1], ctrl[2]);
    if (!v) return;
    this.ctx.send(s, {
      t: 'mview', x: ctrl[0], y: ctrl[1], z: ctrl[2], kind: 1, tier: v.tier, recipe: 0, alts: [], needs: [], out: v.output,
      progress: Math.round(v.progress * 1000), working: v.working ? 1 : 0, fuel: v.fuel, input: v.input, energy: v.energy, took, open: 'q' in c && !('r' in c) ? 1 : 0,
    });
  }

  /** Los brazos: `q` pide su ventana; `filter`, `mode` y `stack` la cambian; `fuel` y `n` le dan combustible de la mano. */
  private onInserter(s: Session, x: number, y: number, z: number, tier: number, c: Record<string, number | number[]>): void {
    const patch: { filter?: number[]; mode?: number; stack?: number } = {};
    if (Array.isArray(c.filter)) patch.filter = c.filter.slice(0, INSERTER_FILTERS).map(Number);
    if ('mode' in c) patch.mode = Number(c.mode);
    if ('stack' in c) patch.stack = Number(c.stack);
    if (Object.keys(patch).length) this.inserters.setConfig(x, y, z, patch);
    let took = 0;
    if ('fuel' in c) {
      const fid = Number(c.fuel), n = Math.max(0, Math.min(64, Math.trunc(Number(c.n)) || 0));
      if (Number.isInteger(fid) && ITEMS[fid] && n > 0) took = this.inserters.addFuel(x, y, z, { id: fid, count: n });
    }
    if (!('q' in c) && !took) return;
    const cfg = this.inserters.configOf(x, y, z);
    if (!cfg) return;
    const f = this.inserters.fuelOf(x, y, z);
    this.ctx.send(s, {
      t: 'icfg', x, y, z, tier, filter: cfg.filter, mode: cfg.mode, stack: cfg.stack, cap: this.inserters.capacityOf(x, y, z),
      fuel: f?.fuel ? [f.fuel.id, f.fuel.count] : null, energy: Math.round(f?.energy ?? 0), took, open: 'q' in c && !('r' in c) ? 1 : 0,
    });
  }

  onRotate(s: Session, msg: Extract<ClientMsg, { t: 'rot' }>): void {
    const x = Number(msg.x), y = Number(msg.y), z = Number(msg.z), d = Number(msg.d);
    if (![x, y, z, d].every(Number.isInteger) || !this.ctx.reachOk(s, x, y, z, 8)) return;
    this.ctx.asActor(s.id, () => rotateBlock(this.ctx, x, y, z, d));
  }
}

/** Cuánto vale girar: 4 sentidos. */
const norm = (d: number): number => ((Math.trunc(d) % 4) + 4) % 4;

// ------------------------------------------------------------------ girar lo ya puesto
/** Aplica el giro pedido por un jugador (validado: alcance y que la pieza sea de las que giran). */
export function rotateBlock(ctx: ServerContext, x: number, y: number, z: number, d: number): boolean {
  const w = ctx.world;
  const id = w.getBlock(x, y, z);
  if (id <= 0) return false;
  d = norm(d);
  const b = beltInfo(id);
  if (b) {
    if (b.dir === d) return false;
    w.setBlock(x, y, z, beltState(b.tier, d, 0)); // (la forma la recalcula el sistema de cintas)
    return true;
  }
  const u = undergroundInfo(id);
  if (u) {
    if (u.dir === d) return false;
    w.setBlock(x, y, z, undergroundState(u.tier, d, u.kind));
    return true;
  }
  if (isUndergroundPipe(id) || isOffshorePump(id)) {
    const cur = isUndergroundPipe(id) ? undergroundPipeDir(id) : offshorePumpDir(id);
    if (cur === d) return false;
    w.setBlock(x, y, z, familyBase(id) + d);
    return true;
  }
  const i = inserterInfo(id);
  if (i) {
    if (i.dir === d) return false;
    w.setBlock(x, y, z, inserterState(i.tier, d));
    return true;
  }
  const m = multiInfo(id);
  if (m && m.multi.spec.oriented) {
    if (m.dir === d) return false;
    const c = multiControllerPos(id, x, y, z)!;
    const base = familyBase(id);
    const oldCells = multiFootprint(base, m.dir, c[0], c[1], c[2]);
    const newCells = multiFootprint(base, d, c[0], c[1], c[2]);
    const key = (cx: number, cy: number, cz: number) => `${cx},${cy},${cz}`;
    const oldSet = new Set(oldCells.map((e) => key(e[0], e[1], e[2])));
    // Las casillas nuevas que no eran ya de la máquina tienen que estar libres.
    for (const [cx, cy, cz] of newCells) {
      if (oldSet.has(key(cx, cy, cz))) continue;
      const cur = w.getBlock(cx, cy, cz);
      if (cur < 0 || (cur !== AIR && !BLOCK_REPLACEABLE[cur])) return false;
    }
    const sameCells = newCells.length === oldCells.length && newCells.every((e) => oldSet.has(key(e[0], e[1], e[2])));
    if (sameCells) {
      // Misma huella (3×3…): sólo cambian los estados; lo que la máquina guarda dentro se queda (nunca se quita ninguna casilla).
      for (const [cx, cy, cz, nid] of newCells) w.setBlock(cx, cy, cz, nid);
      return true;
    }
    // Otra huella (un divisor, de 2×1): se quita y se pone de nuevo (lo que llevara cae al suelo).
    for (const [cx, cy, cz] of oldCells) if (w.getBlock(cx, cy, cz) > 0 && familyBase(w.getBlock(cx, cy, cz)) === base) w.setBlock(cx, cy, cz, AIR);
    for (const [cx, cy, cz, nid] of newCells) w.setBlock(cx, cy, cz, nid);
    return true;
  }
  return false;
}
