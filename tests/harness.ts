// Utilidades de las pruebas: un servidor de juego en memoria con reloj simulado y clientes falsos.
import assert from 'node:assert/strict';
import { GameServer, type Conn } from '../src/shared/sim/GameServer';
import { MemoryStore } from '../src/shared/sim/store';
import { PROTOCOL_VERSION } from '../src/shared/protocol';

/** Conexión falsa que guarda los mensajes recibidos. */
export class FakeConn implements Conn {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  msgs: any[] = [];
  bins: ArrayBuffer[] = [];
  closed: [number?, string?] | null = null;
  send(d: string | ArrayBuffer): void {
    if (typeof d === 'string') this.msgs.push(JSON.parse(d));
    else this.bins.push(d);
  }
  close(code?: number, reason?: string): void {
    this.closed = [code, reason];
  }
  /** Saca (y devuelve) los mensajes de un tipo. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  take(t: string): any[] {
    const out = this.msgs.filter((m) => m.t === t);
    this.msgs = this.msgs.filter((m) => m.t !== t);
    return out;
  }
}

/** Comprobaciones que no cortan la prueba: se listan todas las que fallan al final. */
export class Checks {
  failed: string[] = [];
  ok(cond: unknown, msg: string): void {
    if (!cond) this.failed.push(msg);
  }
  done(): void {
    assert.deepEqual(this.failed, [], 'comprobaciones fallidas');
  }
}

export interface Harness {
  store: MemoryStore;
  gs: GameServer;
  clock: { now: number };
  tick(n: number): void;
  join(name: string, mode?: 's' | 'c'): Client;
}

export interface Client {
  conn: FakeConn;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  welcome: any;
  send(msg: object): void;
  pos(x: number, y: number, z: number, s?: number): void;
}

export function makeServer(seed = 12345, store = new MemoryStore()): Harness {
  const clock = { now: 1_000_000 };
  const gs = new GameServer(store, { seed, now: () => clock.now, flushSeconds: 5 });
  const clients: Client[] = [];
  const h: Harness = {
    store,
    gs,
    clock,
    tick(n: number) {
      for (let i = 0; i < n; i++) {
        clock.now += 50;
        gs.tick();
        // Mantener vivas las sesiones (el servidor cierra las que llevan 40 s calladas).
        if (i % 100 === 0) for (const c of clients) c.send({ t: 'ping', c: 0 });
      }
    },
    join(name: string, mode: 's' | 'c' = 's') {
      const conn = new FakeConn();
      gs.connect(conn);
      const client: Client = {
        conn,
        welcome: null,
        send: (msg) => gs.message(conn, JSON.stringify(msg)),
        pos: (x, y, z, s = 0) => gs.message(conn, JSON.stringify({ t: 'pos', p: [x, y, z], r: [0, 0], s })),
      };
      client.send({ t: 'hello', v: PROTOCOL_VERSION, name, shirt: '#ff0000', mode });
      client.welcome = conn.take('welcome')[0];
      clients.push(client);
      return client;
    },
  };
  return h;
}

/** Colocar `item` sobre la cara superior de la celda (x, y - 1, z), como haría el cliente. */
export function placeOnTop(c: Client, x: number, y: number, z: number, item: number, yaw = 0): void {
  c.send({ t: 'place', x, y: y - 1, z, n: [0, 1, 0], p: [x + 0.5, y, z + 0.5], item, yaw });
}
