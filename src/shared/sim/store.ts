// Almacenamiento persistente del servidor de juego (SQLite en el Durable Object, memoria o
// localStorage en el modo un jugador). Todas las operaciones son síncronas.

export interface ServerStore {
  getMeta(key: string): string | null;
  setMeta(key: string, value: string): void;
  /** Ediciones de un chunk codificadas (n × [u16 índice][u8 bloque]). */
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

export function encodeChunkEdits(m: Map<number, number>): Uint8Array {
  const out = new Uint8Array(m.size * 3);
  let o = 0;
  for (const [idx, b] of m) {
    out[o] = idx & 255;
    out[o + 1] = idx >> 8;
    out[o + 2] = b;
    o += 3;
  }
  return out;
}

export function decodeChunkEdits(data: Uint8Array): Map<number, number> {
  const m = new Map<number, number>();
  for (let o = 0; o + 3 <= data.length; o += 3) m.set(data[o] | (data[o + 1] << 8), data[o + 2]);
  return m;
}
