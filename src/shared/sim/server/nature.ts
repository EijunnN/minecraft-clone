// Vegetación que cambia sola: ticks aleatorios (brotes que crecen, hierba que se extiende o muere,
// cactus y caña que crecen) y hojas que se caen cuando se tala su árbol. Otros sistemas (la granja)
// añaden sus propios manejadores de ticks aleatorios.
import {
  AIR, GRASS, DIRT, SNOWY_GRASS, CACTUS, SUGAR_CANE, BLOCK_OPAQUE, BLOCK_FLUID, BLOCK_RENDER, BLOCK_REPLACEABLE,
  R_CROSS,
} from '../../blocks';
import { MIN_Y, MAX_Y, CHUNK_SIZE, CHUNK_VOLUME, indexY } from '../../constants';
import { leafDecayDrops } from '../drops';
import { posKey, keyX, keyY, keyZ } from '../posKey';
import { LOGS, LEAVES, SAPLINGS, SOIL } from './plants';
import { SIM_RADIUS, type ServerContext } from './context';

/** Ticks aleatorios por chunk y tick (Minecraft usa 3 por sección de 16³ = 48 por columna). */
/** 48 por cada 256 de alto (la misma frecuencia por bloque que antes de subir la altura). */
const RANDOM_TICKS_PER_CHUNK = 72;

/** Manejador de ticks aleatorios: devuelve true si el bloque era suyo. */
export type RandomTickHandler = (id: number, x: number, y: number, z: number) => boolean;

export class Nature {
  /** Hojas que se caerán: clave de posición → tick. */
  private decay = new Map<number, number>();
  private handlers: RandomTickHandler[] = [];

  constructor(private ctx: ServerContext) {}

  addRandomTickHandler(h: RandomTickHandler): void {
    this.handlers.push(h);
  }

  onBlockChanged(x: number, y: number, z: number, old: number, id: number): void {
    // Troncos quitados: las hojas sin tronco cercano se caerán.
    if (LOGS.has(old) && !LOGS.has(id)) this.scheduleLeafDecay(x, y, z);
  }

  tick(): void {
    this.processDecay();
    this.randomTicks();
  }

  private scheduleLeafDecay(x: number, y: number, z: number): void {
    const R = 4;
    for (let dy = -R; dy <= R; dy++) {
      for (let dz = -R; dz <= R; dz++) {
        for (let dx = -R; dx <= R; dx++) {
          const id = this.ctx.world.getBlock(x + dx, y + dy, z + dz);
          if (!LEAVES.has(id)) continue;
          const k = posKey(x + dx, y + dy, z + dz);
          if (this.decay.has(k)) continue;
          if (!this.logNearby(x + dx, y + dy, z + dz)) this.decay.set(k, this.ctx.tickCount + 10 + Math.floor(this.ctx.rand() * 200));
        }
      }
    }
  }

  /** ¿Hay un tronco a 6 pasos o menos a través de hojas? */
  private logNearby(x: number, y: number, z: number): boolean {
    const seen = new Set<number>([posKey(x, y, z)]);
    let frontier: [number, number, number][] = [[x, y, z]];
    for (let step = 0; step < 6 && frontier.length; step++) {
      const next: [number, number, number][] = [];
      for (const [cx, cy, cz] of frontier) {
        for (const [ox, oy, oz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
          const nx = cx + ox, ny = cy + oy, nz = cz + oz;
          const k = posKey(nx, ny, nz);
          if (seen.has(k)) continue;
          seen.add(k);
          const id = this.ctx.world.getBlock(nx, ny, nz);
          if (id < 0 || LOGS.has(id)) return true; // sin cargar: prudencia
          if (LEAVES.has(id)) next.push([nx, ny, nz]);
        }
      }
      frontier = next;
    }
    return false;
  }

  private processDecay(): void {
    const ctx = this.ctx;
    if (this.decay.size === 0 || ctx.tickCount % 5 !== 0) return;
    for (const [k, due] of this.decay) {
      if (due > ctx.tickCount) continue;
      this.decay.delete(k);
      const x = keyX(k), y = keyY(k), z = keyZ(k);
      const id = ctx.world.getBlock(x, y, z);
      if (!LEAVES.has(id) || this.logNearby(x, y, z)) continue;
      ctx.world.setBlock(x, y, z, AIR);
      ctx.entities.dropStacks(leafDecayDrops(id, () => ctx.rand()), x + 0.5, y + 0.3, z + 0.5);
      ctx.fx('leaves', x + 0.5, y + 0.5, z + 0.5, id);
    }
  }

  /** Ticks aleatorios: brotes que crecen, hierba que se extiende o muere, cactus y cañas que crecen. */
  private randomTicks(): void {
    const w = this.ctx.world;
    const rand = () => this.ctx.rand();
    for (const c of this.loadedNearPlayers()) {
      for (let k = 0; k < RANDOM_TICKS_PER_CHUNK; k++) {
        const idx = (rand() * CHUNK_VOLUME) | 0;
        const id = c.blocks[idx];
        if (id === AIR) continue;
        const x = c.cx * 16 + (idx & 15), y = indexY(idx), z = c.cz * 16 + ((idx >> 4) & 15);
        if (SAPLINGS.has(id)) {
          this.growTree(x, y, z, SAPLINGS.get(id)!);
        } else if (id === GRASS || id === SNOWY_GRASS) {
          const above = w.getBlock(x, y + 1, z);
          if (above > 0 && (BLOCK_OPAQUE[above] || BLOCK_FLUID[above])) {
            w.setBlock(x, y, z, DIRT);
            continue;
          }
          for (let t = 0; t < 2; t++) {
            const nx = x + ((rand() * 3) | 0) - 1, ny = y + ((rand() * 5) | 0) - 3, nz = z + ((rand() * 3) | 0) - 1;
            if (w.getBlock(nx, ny, nz) !== DIRT) continue;
            const up = w.getBlock(nx, ny + 1, nz);
            if (up < 0 || BLOCK_OPAQUE[up] || BLOCK_FLUID[up]) continue;
            // Sólo a la luz: cielo abierto encima o bajo la copa de un árbol.
            const top = w.skyTop(nx, nz);
            if (top <= ny + 1 || LEAVES.has(w.getBlock(nx, top, nz))) w.setBlock(nx, ny, nz, GRASS);
          }
        } else if (id === CACTUS || id === SUGAR_CANE) {
          if (w.getBlock(x, y + 1, z) !== AIR || rand() > 0.25) continue;
          let h = 1;
          while (h < 3 && w.getBlock(x, y - h, z) === id) h++;
          if (h < 3) w.setBlock(x, y + 1, z, id);
        } else {
          for (const handle of this.handlers) if (handle(id, x, y, z)) break;
        }
      }
    }
  }

  private loadedNearPlayers(): { cx: number; cz: number; blocks: Uint16Array }[] {
    const out: { cx: number; cz: number; blocks: Uint16Array }[] = [];
    const seen = new Set<string>();
    for (const s of this.ctx.sessions()) {
      if (!s.joined) continue;
      const pcx = Math.floor(s.p[0] / CHUNK_SIZE), pcz = Math.floor(s.p[2] / CHUNK_SIZE);
      for (let dz = -SIM_RADIUS; dz <= SIM_RADIUS; dz++) {
        for (let dx = -SIM_RADIUS; dx <= SIM_RADIUS; dx++) {
          const key = (pcx + dx) + ',' + (pcz + dz);
          if (seen.has(key)) continue;
          seen.add(key);
          const c = this.ctx.world.getChunk(pcx + dx, pcz + dz);
          if (c) out.push(c);
        }
      }
    }
    return out;
  }

  /** Hace crecer un árbol desde un brote si hay sitio. */
  growTree(x: number, y: number, z: number, kind: number): void {
    const w = this.ctx.world;
    const below = w.getBlock(x, y - 1, z);
    if (!SOIL.has(below)) return;
    const need = kind === 2 ? 10 : 7;
    for (let k = 1; k <= need; k++) {
      const b = w.getBlock(x, y + k, z);
      if (b < 0 || (b !== AIR && !LEAVES.has(b) && BLOCK_RENDER[b] !== R_CROSS)) return;
    }
    const r = this.ctx.rand();
    w.setBlock(x, y, z, AIR);
    w.gen.growTree(kind, x, y, z, r, (bx, by, bz, id, force) => {
      if (by <= MIN_Y || by >= MAX_Y) return;
      const cur = w.getBlock(bx, by, bz);
      if (cur < 0) return;
      if (cur === AIR || (force && (LEAVES.has(cur) || BLOCK_RENDER[cur] === R_CROSS || BLOCK_REPLACEABLE[cur]))) {
        w.setBlock(bx, by, bz, id);
      }
    });
    if (w.getBlock(x, y - 1, z) === GRASS) w.setBlock(x, y - 1, z, DIRT);
  }
}
