// Almacenamiento persistente del servidor de juego (SQLite en el Durable Object, memoria o
// localStorage en el modo un jugador). Todas las operaciones son síncronas.
import { legacyPosKey } from './posKey';

export interface ServerStore {
  getMeta(key: string): string | null;
  setMeta(key: string, value: string): void;
  /** Ediciones de un chunk codificadas (ver encodeChunkEdits). */
  loadChunkEdits(key: string): Uint8Array | null;
  loadAllChunkEdits(): [string, Uint8Array][];
  saveChunkEdits(key: string, data: Uint8Array): void;
  loadPlayer(name: string): string | null;
  savePlayer(name: string, data: string): void;
  loadContainers(): [number, string][];
  saveContainer(pos: number, data: string | null): void;
}

export class MemoryStore implements ServerStore {
  meta = new Map<string, string>();
  chunks = new Map<string, Uint8Array>();
  players = new Map<string, string>();
  containers = new Map<number, string>();
  getMeta(key: string): string | null {
    return this.meta.get(key) ?? null;
  }
  setMeta(key: string, value: string): void {
    this.meta.set(key, value);
  }
  loadChunkEdits(key: string): Uint8Array | null {
    return this.chunks.get(key) ?? null;
  }
  loadAllChunkEdits(): [string, Uint8Array][] {
    return [...this.chunks.entries()];
  }
  saveChunkEdits(key: string, data: Uint8Array): void {
    this.chunks.set(key, data);
  }
  loadPlayer(name: string): string | null {
    return this.players.get(name) ?? null;
  }
  savePlayer(name: string, data: string): void {
    this.players.set(name, data);
  }
  loadContainers(): [number, string][] {
    return [...this.containers.entries()];
  }
  saveContainer(pos: number, data: string | null): void {
    if (data === null) this.containers.delete(pos);
    else this.containers.set(pos, data);
  }
}

/**
 * Versión del formato de las ediciones guardadas (clave `blockFormat` en meta):
 * 1 = [u16 índice][u8 bloque]; 2 = [u16 índice][u16 bloque]; 3 = [u24 índice][u16 bloque], con el
 * mundo de y = −64 a 319 (en los formatos 1 y 2 la fila 0 del índice era y = 0).
 */
export const BLOCK_FORMAT = '3';

/** Filas que se añadieron por debajo de y = 0 al pasar a 384 de alto. */
const ROWS_BELOW_ZERO = 64;

/** Ediciones de un chunk: n × [u24 índice][u16 bloque] (little endian). */
export function encodeChunkEdits(m: Map<number, number>): Uint8Array {
  const out = new Uint8Array(m.size * 5);
  let o = 0;
  for (const [idx, b] of m) {
    out[o] = idx & 255;
    out[o + 1] = (idx >> 8) & 255;
    out[o + 2] = idx >> 16;
    out[o + 3] = b & 255;
    out[o + 4] = b >> 8;
    o += 5;
  }
  return out;
}

export function decodeChunkEdits(data: Uint8Array): Map<number, number> {
  const m = new Map<number, number>();
  for (let o = 0; o + 5 <= data.length; o += 5) {
    m.set(data[o] | (data[o + 1] << 8) | (data[o + 2] << 16), data[o + 3] | (data[o + 4] << 8));
  }
  return m;
}

/** Formatos 1 y 2 (índice de 16 bits con la fila 0 en y = 0), ya con el índice del mundo actual. */
function decodeOldChunkEdits(data: Uint8Array, format: string): Map<number, number> {
  const m = new Map<number, number>();
  const step = format === '2' ? 4 : 3;
  for (let o = 0; o + step <= data.length; o += step) {
    const idx = (data[o] | (data[o + 1] << 8)) + (ROWS_BELOW_ZERO << 8);
    m.set(idx, step === 4 ? data[o + 2] | (data[o + 3] << 8) : data[o + 2]);
  }
  return m;
}

/** Pasa las ediciones guardadas al formato actual (una sola vez por mundo). */
export function migrateStore(store: ServerStore): number {
  const format = store.getMeta('blockFormat') ?? '1';
  if (format === BLOCK_FORMAT) return 0;
  let n = 0;
  for (const [key, data] of store.loadAllChunkEdits()) {
    store.saveChunkEdits(key, encodeChunkEdits(decodeOldChunkEdits(data, format)));
    n++;
  }
  // Cofres, hornos, fogatas y carteles se guardan por posición: la clave cambió con la altura.
  // Primero se borran todas las antiguas y luego se escriben las nuevas, para que no se pisen.
  const containers = store.loadContainers();
  for (const [pos] of containers) store.saveContainer(pos, null);
  for (const [pos, data] of containers) store.saveContainer(legacyPosKey(pos), data);
  store.setMeta('blockFormat', BLOCK_FORMAT);
  return n;
}
