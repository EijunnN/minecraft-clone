// Programa lunar: la red de cintas (cintas, subterráneas y divisores) sobre el motor de shared/logistics/belts.
//
// Sabe qué pieza hay en cada casilla (a partir de los bloques del mundo), las enlaza entre sí (relink), empareja las subterráneas y
// levanta sus túneles, une las dos mitades de cada divisor y calcula el orden en que se mueven. Lo usan el servidor (que la mantiene
// con los cambios de bloque) y el cliente (que la levanta a medida que ve cintas) para que los dos simulen exactamente lo mismo.
import { beltInfo, undergroundInfo, splitterInfo, multiControllerPos, UNDERGROUND_MAX } from '../blocks';
import { posKey } from '../sim/posKey';
import {
  newBelt, newSplitState, relink, orderBelts, stepBelts, BELT_DX, BELT_DZ, K_BELT, K_UG_IN, K_UG_OUT, K_SPLIT, K_TUNNEL,
  type Belt, type SplitState,
} from './belts';

interface CellInfo {
  kind: number;
  dir: number;
  tier: number;
  /** Mitad del divisor (0 izquierda, 1 derecha) y clave de su casilla principal. */
  half: number;
  ctrl: number;
}

/** Qué pieza de la red es el bloque `id` puesto en (x, y, z) (null si no es de la red). */
export function cellInfo(id: number, x: number, y: number, z: number): CellInfo | null {
  const b = beltInfo(id);
  if (b) return { kind: K_BELT, dir: b.dir, tier: b.tier, half: 0, ctrl: 0 };
  const u = undergroundInfo(id);
  if (u) return { kind: u.kind === 0 ? K_UG_IN : K_UG_OUT, dir: u.dir, tier: u.tier, half: 0, ctrl: 0 };
  const s = splitterInfo(id);
  if (s) {
    const c = multiControllerPos(id, x, y, z)!;
    return { kind: K_SPLIT, dir: s.dir, tier: s.tier, half: s.half, ctrl: posKey(c[0], c[1], c[2]) };
  }
  return null;
}

/** Lo que pasó al sincronizar una casilla: la pieza que hay ahora, la que se quitó (con lo que llevaba) y si es nueva. */
export interface SyncResult {
  belt: Belt | null;
  removed: Belt | null;
  created: boolean;
}

export class BeltNetwork {
  /** Piezas con bloque, por casilla. */
  readonly tiles = new Map<number, Belt>();
  /** Estado de cada divisor por casilla principal. */
  readonly splits = new Map<number, SplitState>();
  /** Tramos de túnel de cada subterránea emparejada, por casilla de la entrada, en orden de la entrada a la salida. */
  readonly tunnels = new Map<number, Belt[]>();
  ordered: Belt[] = [];
  /** Con `lazy`, las casillas que faltan se crean al preguntar por ellas (el cliente las descubre al enlazar). */
  lazy = false;
  /** Lo que se pierde al deshacerse un túnel (para soltarlo al suelo). */
  onSpill: ((stacks: { id: number; count: number }[], x: number, y: number, z: number) => void) | null = null;

  constructor(private blockAt: (x: number, y: number, z: number) => number) {}

  at = (x: number, y: number, z: number): Belt | null => {
    const k = posKey(x, y, z);
    const b = this.tiles.get(k);
    if (b || !this.lazy) return b ?? null;
    return this.sync(x, y, z).belt;
  };

  // ------------------------------------------------------------------ casillas

  /** Pone al día la pieza de (x, y, z) con el bloque que hay ahora. */
  sync(x: number, y: number, z: number): SyncResult {
    const k = posKey(x, y, z);
    const info = cellInfo(this.blockAt(x, y, z), x, y, z);
    const have = this.tiles.get(k);
    if (!info) {
      if (!have) return { belt: null, removed: null, created: false };
      this.forget(k, have);
      return { belt: null, removed: have, created: false };
    }
    if (have && have.kind === info.kind) {
      if (have.dir !== info.dir || have.tier !== info.tier) {
        have.dir = info.dir;
        have.tier = info.tier;
      }
      if (info.kind === K_SPLIT) this.attachSplit(have, info);
      return { belt: have, removed: null, created: false };
    }
    let removed: Belt | null = null;
    if (have) {
      this.forget(k, have);
      removed = have; // cambió de tipo (una cinta que pasa a subterránea…): lo que llevaba se suelta
    }
    const b = newBelt(x, y, z, info.dir, info.tier, info.kind);
    this.tiles.set(k, b);
    if (info.kind === K_SPLIT) this.attachSplit(b, info);
    return { belt: b, removed, created: true };
  }

  /** Deja de llevar la pieza de la casilla `k` (el cliente lo hace con las que quedan lejos), sin mirar el bloque. */
  discard(k: number): void {
    const b = this.tiles.get(k);
    if (b) this.forget(k, b);
  }

  private attachSplit(b: Belt, info: CellInfo): void {
    let st = this.splits.get(info.ctrl);
    if (!st) {
      st = newSplitState();
      this.splits.set(info.ctrl, st);
    }
    st.halves[info.half] = b;
    b.split = st;
  }

  /** Quita la pieza de la casilla `k`. */
  private forget(k: number, b: Belt): void {
    this.tiles.delete(k);
    if (b.split) {
      const st = b.split;
      for (let i = 0; i < 2; i++) if (st.halves[i] === b) st.halves[i] = null;
      if (!st.halves[0] && !st.halves[1]) {
        for (const [ck, s] of this.splits) if (s === st) this.splits.delete(ck);
      }
      b.split = null;
    }
    if (b.kind === K_UG_IN) this.dropTunnel(k);
  }

  // ------------------------------------------------------------------ subterráneas

  /** La salida con la que se empareja la entrada `e` (la más cercana de su línea, si a su vez ésta la tiene a ella como entrada). */
  private findExit(e: Belt): Belt | null {
    const max = UNDERGROUND_MAX[e.tier];
    for (let i = 1; i <= max; i++) {
      const x = e.x + BELT_DX[e.dir] * i, z = e.z + BELT_DZ[e.dir] * i;
      const u = undergroundInfo(this.blockAt(x, e.y, z));
      if (!u || u.dir !== e.dir || u.tier !== e.tier) continue;
      if (u.kind === 0) return null; // otra entrada antes: ésta no tiene salida
      const exit = this.at(x, e.y, z);
      if (!exit || exit.kind !== K_UG_OUT) return null;
      return this.findEntrance(exit) === e ? exit : null;
    }
    return null;
  }

  /** La entrada con la que se empareja la salida `x` (la más cercana hacia atrás en su línea). */
  private findEntrance(x: Belt): Belt | null {
    const max = UNDERGROUND_MAX[x.tier];
    for (let i = 1; i <= max; i++) {
      const bx = x.x - BELT_DX[x.dir] * i, bz = x.z - BELT_DZ[x.dir] * i;
      const u = undergroundInfo(this.blockAt(bx, x.y, bz));
      if (!u || u.dir !== x.dir || u.tier !== x.tier) continue;
      if (u.kind === 1) return null; // otra salida antes
      const e = this.at(bx, x.y, bz);
      return e && e.kind === K_UG_IN ? e : null;
    }
    return null;
  }

  private dropTunnel(ek: number): void {
    const t = this.tunnels.get(ek);
    if (!t) return;
    const lost: { id: number; count: number }[] = [];
    for (const v of t) for (const lane of v.lanes) for (const it of lane) lost.push({ id: it.s.id, count: 1 });
    this.tunnels.delete(ek);
    if (lost.length && this.onSpill) {
      const first = t[0];
      this.onSpill(lost, first.x, first.y, first.z);
    }
  }

  /** Empareja las subterráneas y levanta o ajusta el túnel de cada pareja; deshace los que ya no valen. */
  private pairUndergrounds(): void {
    const live = new Set<number>();
    for (const [k, e] of [...this.tiles]) {
      if (e.kind !== K_UG_IN) continue;
      const exit = this.findExit(e);
      if (!exit) {
        e.out = null;
        continue;
      }
      live.add(k);
      const n = Math.abs(exit.x - e.x) + Math.abs(exit.z - e.z); // casillas entre la entrada y la salida (contando la salida)
      const need = n - 1;
      let t = this.tunnels.get(k) ?? [];
      // Los tramos que sobran se quitan (soltando lo que llevaran); los que faltan se añaden vacíos.
      if (t.length > need) {
        const cut = t.slice(need);
        t = t.slice(0, need);
        const lost: { id: number; count: number }[] = [];
        for (const v of cut) for (const lane of v.lanes) for (const it of lane) lost.push({ id: it.s.id, count: 1 });
        if (lost.length && this.onSpill) this.onSpill(lost, cut[0].x, cut[0].y, cut[0].z);
      }
      for (let i = t.length; i < need; i++) {
        t.push(newBelt(e.x + BELT_DX[e.dir] * (i + 1), e.y, e.z + BELT_DZ[e.dir] * (i + 1), e.dir, e.tier, K_TUNNEL));
      }
      for (const v of t) {
        v.dir = e.dir;
        v.tier = e.tier;
      }
      this.tunnels.set(k, t);
      const chain = [e, ...t, exit];
      for (let i = 0; i + 1 < chain.length; i++) chain[i].out = { to: chain[i + 1], side: 0 };
      // (la salida no se toca: su `out` ya lo puso relink)
    }
    for (const k of [...this.tunnels.keys()]) if (!live.has(k)) this.dropTunnel(k);
  }

  // ------------------------------------------------------------------ enlaces y orden

  /** Vuelve a enlazar todo (las salidas de cada pieza, las subterráneas, los divisores) y a ordenar. */
  link(): void {
    let n: number;
    do {
      n = this.tiles.size;
      for (const b of [...this.tiles.values()]) relink(b, this.at);
    } while (this.lazy && this.tiles.size !== n);
    for (const st of this.splits.values()) {
      st.outs = [st.halves[0]?.out ?? null, st.halves[1]?.out ?? null];
    }
    this.pairUndergrounds();
    // (la salida de una subterránea ya se enlazó arriba con relink; `pairUndergrounds` sólo toca las entradas y los túneles)
    const all: Belt[] = [...this.tiles.values()];
    for (const t of this.tunnels.values()) all.push(...t);
    this.ordered = orderBelts(all);
  }

  /** Cada pieza con lo que lleva (para guardar y mandar): las de bloque y los tramos de túnel. */
  allTunnelPieces(): { entrance: number; index: number; belt: Belt }[] {
    const out: { entrance: number; index: number; belt: Belt }[] = [];
    for (const [ek, t] of this.tunnels) t.forEach((belt, index) => out.push({ entrance: ek, index, belt }));
    return out;
  }

  /** Un paso de `dt` segundos de todas las piezas. */
  step(dt: number): void {
    stepBelts(this.ordered, dt);
  }
}
