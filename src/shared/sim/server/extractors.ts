// Programa lunar (idea-industria.md): los extractores eléctricos y las reservas de las vetas. Ver FACTORIO-REFERENCIA.md §1.
//
// Como el taladro de Factorio, el extractor NO tiene inventario: sólo lleva el progreso del minado. Mira el área de 5×5 que tiene debajo
// (hasta 3 bloques de fondo) y, mientras le llegue energía, avanza; al llegar a los 2 s (0,5 objetos/s a plena potencia) intenta dejar el
// objeto por delante:
//   • si hay una cinta, un brazo, un cofre o una máquina que lo acepte, entra;
//   • si delante no hay nada (aire), cae al suelo, de uno en uno: no suelta el siguiente hasta que se recoja el anterior;
//   • si delante hay algo que no lo acepta (un bloque, un cofre lleno, una cinta llena), se queda en el 100 % del progreso y se para:
//     no gasta energía ni reserva hasta que haya sitio.
// El objeto sólo gasta una unidad de la reserva del bloque de veta cuando llega a su sitio. Recorre las vetas de su área en orden (por filas,
// la de arriba de cada columna primero) y se queda con una hasta agotarla, como el taladro de Factorio (`shuffle_resources_to_mine` falso).
// Guarda el progreso y lo que llevan gastado los bloques tocados (metadatos 'extractors' y 'veins').
import { EXTRACTOR, AIR, extractorInfo, isBeltLike, multiBox, multiControllerPos, familyBase } from '../../blocks';
import { registerRedstone, type RedstoneApi } from '../../redstone';
import { BELT_DX, BELT_DZ } from '../../logistics/belts';
import { veinYield, veinAmount, EXTRACT_SECONDS, EXTRACTOR_RADIUS, EXTRACTOR_DEPTH } from '../../logistics/veins';
import { MACHINE_KW } from '../../logistics/energy';
import type { ItemStack } from '../../items';
import { posKey, keyX, keyY, keyZ } from '../posKey';
import type { ServerStore } from '../store';
import { DT, type ServerContext } from './context';
import type { Redstone } from './redstone';
import type { Belts } from './belts';
import type { Inventories } from './inventories';
import type { Power, PowerConsumer } from './power';

const SYSTEMS = new WeakMap<RedstoneApi, Extractors>();

registerRedstone([EXTRACTOR], {
  changed: (api, x, y, z, old, id) => SYSTEMS.get(api)?.changed(x, y, z, old, id),
});

/** Cara del bloque de delante que mira al extractor (0 +X, 1 −X, 4 +Z, 5 −Z) según su sentido. */
const DST_FACE = [1, 5, 0, 4] as const;

interface Ext {
  dir: number;
  /** Segundos de trabajo acumulados sobre el objeto actual (0..EXTRACT_SECONDS). */
  progress: number;
  /** ¿Avanzó en el último tick? */
  working: boolean;
  /** ¿Está parado con el objeto listo porque lo de delante no lo recibe? */
  blocked: boolean;
  /** Último tick en que se comprobó si hay algo que extraer, y el resultado (se mira una vez por segundo). */
  checked: number;
  hasOre: boolean;
}

type SavedExt = [number, number, number, number];

export class Extractors implements PowerConsumer {
  private list = new Map<number, Ext>();
  private saved = new Map<number, SavedExt>();
  /** Unidades ya gastadas de cada bloque de veta tocado. */
  private used = new Map<number, number>();
  private saveDirty = false;
  private tickN = 0;

  constructor(private ctx: ServerContext, rs: Redstone, store: ServerStore, private belts: Belts, private inv: Inventories, private power: Power) {
    SYSTEMS.set(rs, this);
    try {
      const raw = JSON.parse(store.getMeta('extractors') ?? '[]') as unknown;
      if (Array.isArray(raw)) {
        for (const r of raw) {
          if (Array.isArray(r) && r.length === 4 && r.every((n) => Number.isFinite(n))) this.saved.set(posKey(r[0], r[1], r[2]), r as SavedExt);
        }
      }
      const v = JSON.parse(store.getMeta('veins') ?? '[]') as unknown;
      if (Array.isArray(v)) for (const r of v) if (Array.isArray(r) && r.length === 4 && r.every((n) => Number.isFinite(n))) this.used.set(posKey(r[0], r[1], r[2]), r[3]);
    } catch {
      /* mundo sin extractores guardados */
    }
  }

  get count(): number {
    return this.list.size;
  }

  peek(x: number, y: number, z: number): Readonly<Ext> | null {
    const id = this.ctx.world.getBlock(x, y, z);
    const c = id > 0 && familyBase(id) === EXTRACTOR ? multiControllerPos(id, x, y, z) : null;
    return this.list.get(c ? posKey(c[0], c[1], c[2]) : posKey(x, y, z)) ?? null;
  }

  /** Unidades que le quedan al bloque de veta de (x, y, z) (0 si no es veta). */
  remaining(x: number, y: number, z: number): number {
    if (!veinYield(this.ctx.world.getBlock(x, y, z))) return 0;
    return veinAmount(this.ctx.seed, x, y, z) - (this.used.get(posKey(x, y, z)) ?? 0);
  }

  changed(x: number, y: number, z: number, _old: number, id: number): void {
    const k = posKey(x, y, z);
    const info = extractorInfo(id);
    if (!info) {
      if (this.list.delete(k)) {
        this.power.detach(k);
        this.saveDirty = true;
      }
      return;
    }
    const e = this.list.get(k);
    if (e) {
      e.dir = info.dir;
      return;
    }
    this.power.attach(k, multiBox(id, x, y, z)!);
    const row = this.saved.get(k);
    this.saved.delete(k);
    this.list.set(k, { dir: info.dir, progress: Number(row?.[3]) || 0, working: false, blocked: false, checked: -100, hasOre: false });
  }

  // ------------------------------------------------------------------ mineral

  /** El bloque de veta del área de 5×5 que toca gastar ahora (el primero en orden: por filas, y en cada columna el de arriba), o −1. */
  private nextOre(x: number, y: number, z: number): number {
    const w = this.ctx.world;
    for (let dz = -EXTRACTOR_RADIUS; dz <= EXTRACTOR_RADIUS; dz++) {
      for (let dx = -EXTRACTOR_RADIUS; dx <= EXTRACTOR_RADIUS; dx++) {
        for (let dy = 1; dy <= EXTRACTOR_DEPTH; dy++) {
          if (veinYield(w.getBlock(x + dx, y - dy, z + dz))) return posKey(x + dx, y - dy, z + dz);
        }
      }
    }
    return -1;
  }

  private hasOre(k: number, e: Ext): boolean {
    if (this.tickN - e.checked >= 20) {
      e.checked = this.tickN;
      e.hasOre = this.nextOre(keyX(k), keyY(k), keyZ(k)) >= 0;
    }
    return e.hasOre;
  }

  /** Gasta una unidad del bloque de veta `bk`; si era la última, el bloque se agota. */
  private spend(bk: number): void {
    const x = keyX(bk), y = keyY(bk), z = keyZ(bk);
    const w = this.ctx.world;
    const yielded = veinYield(w.getBlock(x, y, z));
    if (!yielded) return;
    const used = (this.used.get(bk) ?? 0) + 1;
    this.saveDirty = true;
    if (used >= veinAmount(this.ctx.seed, x, y, z)) {
      this.used.delete(bk);
      w.setBlock(x, y, z, yielded.depleted);
    } else this.used.set(bk, used);
  }

  // ------------------------------------------------------------------ energía y salida

  /** Suma a `active` los extractores que quieren trabajar ahora (posición → potencia que piden). */
  demand(active: Map<number, number>): void {
    this.tickN++;
    // (el extractor de 1×1 toca lo que toque su casilla; el de 3×3 tocará su huella)
    for (const [k, e] of this.list) {
      // Con el objeto listo y sin sitio donde dejarlo no gasta nada.
      if (e.progress < EXTRACT_SECONDS && this.hasOre(k, e)) active.set(k, MACHINE_KW.extractor);
    }
  }

  /** Avanza el trabajo de cada extractor con lo que le llegó de energía y, si terminó un objeto, intenta dejarlo por delante. */
  advance(sat: (k: number) => number, active: ReadonlyMap<number, number>): void {
    for (const [k, e] of this.list) {
      e.working = false;
      if (active.has(k)) {
        const s = sat(k);
        if (s > 0) {
          e.working = true;
          e.progress = Math.min(EXTRACT_SECONDS, e.progress + DT * s);
        }
      }
      if (e.progress < EXTRACT_SECONDS) {
        e.blocked = false;
        continue;
      }
      // Objeto listo.
      const bk = this.nextOre(keyX(k), keyY(k), keyZ(k));
      if (bk < 0) {
        e.progress = 0;
        e.blocked = false;
        continue;
      }
      const yielded = veinYield(this.ctx.world.getBlock(keyX(bk), keyY(bk), keyZ(bk)));
      if (!yielded) continue;
      if (this.output(k, e, { id: yielded.item, count: 1 })) {
        this.spend(bk);
        e.progress -= EXTRACT_SECONDS;
        e.blocked = false;
        this.saveDirty = true;
      } else e.blocked = true;
    }
  }

  /**
   * Deja `one` en lo que hay delante del extractor de `k` (posición de salida de Factorio): una cinta, un contenedor o una máquina que
   * lo acepte, o el suelo si delante no hay nada. false si no cabe.
   */
  private output(k: number, e: Ext, one: ItemStack): boolean {
    // La salida es la casilla de delante del centro, pegada al borde de su huella de 3×3 (`vector_to_place_result` {0, −1,85}).
    const x = keyX(k) + 2 * BELT_DX[e.dir], y = keyY(k), z = keyZ(k) + 2 * BELT_DZ[e.dir];
    const w = this.ctx.world.getBlock(x, y, z);
    if (w < 0) return false; // sin cargar
    if (w === AIR) {
      // Al suelo, de uno en uno: no suelta otro mientras el anterior siga ahí.
      if (this.inv.itemsAt(x, y, z).length > 0) return false;
      this.ctx.entities.spawnItem(one, x + 0.5, y + 0.3, z + 0.5, 0, 0, 0, undefined, 0);
      return true;
    }
    if (isBeltLike(w)) {
      // En el carril más cercano al extractor si la cinta cruza; en el derecho si va en su mismo sentido o al revés.
      const bd = this.belts.at(x, y, z)?.dir ?? e.dir;
      const cross = bd % 2 !== e.dir % 2;
      let lane: 0 | 1 = 1;
      if (cross) {
        // El extractor queda a la izquierda de la cinta si está en el lado de (bd + 3); la cara cercana es el carril de ese lado.
        const lx = BELT_DX[(bd + 3) % 4], lz = BELT_DZ[(bd + 3) % 4];
        lane = -BELT_DX[e.dir] === lx && -BELT_DZ[e.dir] === lz ? 0 : 1;
      }
      return this.belts.put(x, y, z, lane, 0.5, one);
    }
    return this.inv.insertOne(x, y, z, DST_FACE[e.dir], one);
  }

  flush(store: ServerStore): void {
    if (!this.saveDirty) return;
    this.saveDirty = false;
    const rows: SavedExt[] = [...this.saved.values()];
    for (const [k, e] of this.list) rows.push([keyX(k), keyY(k), keyZ(k), Math.round(e.progress * 100) / 100]);
    store.setMeta('extractors', JSON.stringify(rows));
    const veins: number[][] = [];
    for (const [k, n] of this.used) veins.push([keyX(k), keyY(k), keyZ(k), n]);
    store.setMeta('veins', JSON.stringify(veins));
  }
}
