// Mundo del servidor: genera los mismos chunks que los clientes (generador determinista),
// aplica y guarda las ediciones, y mantiene mapas de altura y fuentes de luz para la simulación.
import { TerrainGenerator } from '../world/terrain';
import { CHUNK_SIZE, CHUNK_VOLUME, WORLD_HEIGHT, blockIndex, chunkKey } from '../constants';
import { AIR, BLOCK_EMISSION, BLOCK_LIGHT_OPACITY, BLOCK_SOLID } from '../blocks';
import { decodeChunkEdits, encodeChunkEdits, type ServerStore } from './store';

export interface SimChunk {
  cx: number;
  cz: number;
  blocks: Uint8Array;
  /** y del bloque más alto que tapa el cielo, por columna (z*16+x); -1 si ninguno. */
  top: Int16Array;
  /** Índices locales de bloques que emiten luz. */
  emitters: Set<number>;
  lastUsed: number;
}

export type ChangeListener = (x: number, y: number, z: number, old: number, id: number) => void;

function blocksSky(id: number): boolean {
  return id !== AIR && (BLOCK_LIGHT_OPACITY[id] > 0 || BLOCK_SOLID[id] === 1);
}

export class WorldSim {
  readonly gen: TerrainGenerator;
  readonly seed: number;
  private store: ServerStore;
  private chunks = new Map<string, SimChunk>();
  private edits = new Map<string, Map<number, number>>();
  private allLoaded = false;
  private dirty = new Set<string>();
  onChange: ChangeListener | null = null;
  generatedCount = 0;

  constructor(seed: number, store: ServerStore) {
    this.seed = seed;
    this.store = store;
    this.gen = new TerrainGenerator(seed);
  }

  // ------------------------------------------------------------------ ediciones

  private chunkEdits(key: string): Map<number, number> {
    let m = this.edits.get(key);
    if (m) return m;
    if (!this.allLoaded) {
      const data = this.store.loadChunkEdits(key);
      m = data ? decodeChunkEdits(data) : new Map();
    } else m = new Map();
    this.edits.set(key, m);
    return m;
  }

  /** Todas las ediciones (para la bienvenida de un jugador). */
  allEdits(): [number, number, number, number][] {
    if (!this.allLoaded) {
      for (const [key, data] of this.store.loadAllChunkEdits()) {
        if (!this.edits.has(key)) this.edits.set(key, decodeChunkEdits(data));
      }
      this.allLoaded = true;
    }
    const out: [number, number, number, number][] = [];
    for (const [key, m] of this.edits) {
      const [cx, cz] = key.split(',').map(Number);
      for (const [idx, b] of m) out.push([cx * 16 + (idx & 15), idx >> 8, cz * 16 + ((idx >> 4) & 15), b]);
    }
    return out;
  }

  get dirtyCount(): number {
    return this.dirty.size;
  }

  flush(): void {
    for (const key of this.dirty) {
      const m = this.edits.get(key);
      if (m) this.store.saveChunkEdits(key, encodeChunkEdits(m));
    }
    this.dirty.clear();
  }

  // ------------------------------------------------------------------ chunks

  isLoaded(cx: number, cz: number): boolean {
    return this.chunks.has(chunkKey(cx, cz));
  }

  getChunk(cx: number, cz: number): SimChunk | undefined {
    return this.chunks.get(chunkKey(cx, cz));
  }

  ensureChunk(cx: number, cz: number, now = 0): SimChunk {
    const key = chunkKey(cx, cz);
    let c = this.chunks.get(key);
    if (c) {
      c.lastUsed = now;
      return c;
    }
    const r = this.gen.generate(cx, cz);
    const blocks = r.blocks;
    const ed = this.chunkEdits(key);
    for (const [idx, id] of ed) blocks[idx] = id;
    c = { cx, cz, blocks, top: new Int16Array(256), emitters: new Set(), lastUsed: now };
    for (let i = 0; i < 256; i++) {
      const lx = i & 15, lz = i >> 4;
      let t = -1;
      for (let y = WORLD_HEIGHT - 1; y >= 0; y--) {
        if (blocksSky(blocks[blockIndex(lx, y, lz)])) {
          t = y;
          break;
        }
      }
      c.top[i] = t;
    }
    for (let i = 0; i < CHUNK_VOLUME; i++) if (BLOCK_EMISSION[blocks[i]]) c.emitters.add(i);
    this.chunks.set(key, c);
    this.generatedCount++;
    return c;
  }

  /** Descarga los chunks no usados desde hace tiempo (las ediciones se conservan). */
  unloadUnused(now: number, keep: (cx: number, cz: number) => boolean): number {
    let n = 0;
    for (const [key, c] of this.chunks) {
      if (!keep(c.cx, c.cz) && now - c.lastUsed > 5000) {
        this.chunks.delete(key);
        n++;
      }
    }
    return n;
  }

  get loadedCount(): number {
    return this.chunks.size;
  }

  // ------------------------------------------------------------------ bloques

  /** Id del bloque, o -1 si el chunk no está cargado. */
  getBlock(x: number, y: number, z: number): number {
    if (y < 0) return -1;
    if (y >= WORLD_HEIGHT) return AIR;
    const cx = Math.floor(x / CHUNK_SIZE), cz = Math.floor(z / CHUNK_SIZE);
    const c = this.chunks.get(chunkKey(cx, cz));
    if (!c) return -1;
    return c.blocks[blockIndex(x - cx * CHUNK_SIZE, y, z - cz * CHUNK_SIZE)];
  }

  /** Cambia un bloque (y registra la edición). Devuelve el id anterior o -1 si no hubo cambio. */
  setBlock(x: number, y: number, z: number, id: number): number {
    if (y < 0 || y >= WORLD_HEIGHT) return -1;
    const cx = Math.floor(x / CHUNK_SIZE), cz = Math.floor(z / CHUNK_SIZE);
    const key = chunkKey(cx, cz);
    const lx = x - cx * CHUNK_SIZE, lz = z - cz * CHUNK_SIZE;
    const idx = blockIndex(lx, y, lz);
    const c = this.chunks.get(key);
    let old = -1;
    if (c) {
      old = c.blocks[idx];
      if (old === id) return -1;
      c.blocks[idx] = id;
      // Mapa de altura.
      const col = lz * 16 + lx;
      if (blocksSky(id)) {
        if (y > c.top[col]) c.top[col] = y;
      } else if (y === c.top[col]) {
        let t = -1;
        for (let yy = y - 1; yy >= 0; yy--) {
          if (blocksSky(c.blocks[blockIndex(lx, yy, lz)])) {
            t = yy;
            break;
          }
        }
        c.top[col] = t;
      }
      if (BLOCK_EMISSION[id]) c.emitters.add(idx);
      else c.emitters.delete(idx);
    }
    this.chunkEdits(key).set(idx, id);
    this.dirty.add(key);
    if (old >= 0) this.onChange?.(x, y, z, old, id);
    return old;
  }

  /** y del bloque más alto que tapa el cielo en (x, z), o -2 si no está cargado. */
  skyTop(x: number, z: number): number {
    const cx = Math.floor(x / CHUNK_SIZE), cz = Math.floor(z / CHUNK_SIZE);
    const c = this.chunks.get(chunkKey(cx, cz));
    if (!c) return -2;
    return c.top[(z - cz * CHUNK_SIZE) * 16 + (x - cx * CHUNK_SIZE)];
  }

  /** ¿Algún bloque emisor ilumina (x, y, z)? (distancia Manhattan menor que su nivel de luz). */
  isLitByBlocks(x: number, y: number, z: number): boolean {
    const cx0 = Math.floor((x - 15) / CHUNK_SIZE), cx1 = Math.floor((x + 15) / CHUNK_SIZE);
    const cz0 = Math.floor((z - 15) / CHUNK_SIZE), cz1 = Math.floor((z + 15) / CHUNK_SIZE);
    for (let cz = cz0; cz <= cz1; cz++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const c = this.chunks.get(chunkKey(cx, cz));
        if (!c) continue;
        for (const idx of c.emitters) {
          const ex = cx * 16 + (idx & 15), ey = idx >> 8, ez = cz * 16 + ((idx >> 4) & 15);
          const d = Math.abs(ex - x) + Math.abs(ey - y) + Math.abs(ez - z);
          if (d < BLOCK_EMISSION[c.blocks[idx]]) return true;
        }
      }
    }
    return false;
  }
}
