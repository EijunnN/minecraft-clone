// Servidor multijugador en Cloudflare: un Worker enruta cada sala a un Durable Object (WorldRoom)
// que ejecuta el servidor de juego autoritativo (GameServer) a 20 ticks/s mientras haya jugadores
// conectados, y guarda en SQLite las ediciones, los contenedores, los jugadores y los animales.
import { DurableObject } from 'cloudflare:workers';
import { GameServer, TICK_RATE, type Conn } from '../shared/sim/GameServer';
import type { ServerStore } from '../shared/sim/store';

export interface Env {
  WORLDS: DurableObjectNamespace<WorldRoom>;
}

const ROOM_RE = /^\/api\/room\/([a-z0-9_-]{1,32})\/ws$/i;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const m = url.pathname.match(ROOM_RE);
    if (m) {
      if (request.headers.get('Upgrade') !== 'websocket') {
        return new Response('Se esperaba una conexión WebSocket', { status: 426 });
      }
      const stub = env.WORLDS.getByName(m[1].toLowerCase());
      return stub.fetch(request);
    }
    if (url.pathname === '/api/health') return Response.json({ ok: true });
    return new Response('No encontrado', { status: 404 });
  },
} satisfies ExportedHandler<Env>;

/** Almacenamiento del servidor de juego sobre el SQLite del Durable Object. */
class SqlStore implements ServerStore {
  private sql: SqlStorage;

  constructor(sql: SqlStorage) {
    this.sql = sql;
    sql.exec(`CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
    sql.exec(`CREATE TABLE IF NOT EXISTS chunks (key TEXT PRIMARY KEY, data BLOB NOT NULL)`);
    sql.exec(`CREATE TABLE IF NOT EXISTS players (name TEXT PRIMARY KEY, data TEXT NOT NULL) WITHOUT ROWID`);
    sql.exec(`CREATE TABLE IF NOT EXISTS containers (pos INTEGER PRIMARY KEY, data TEXT NOT NULL)`);
  }

  getMeta(key: string): string | null {
    const rows = this.sql.exec<{ value: string }>(`SELECT value FROM meta WHERE key = ?`, key).toArray();
    return rows.length ? rows[0].value : null;
  }

  setMeta(key: string, value: string): void {
    this.sql.exec(`INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, key, value);
  }

  loadChunkEdits(key: string): Uint8Array | null {
    const rows = this.sql.exec<{ data: ArrayBuffer }>(`SELECT data FROM chunks WHERE key = ?`, key).toArray();
    return rows.length ? new Uint8Array(rows[0].data) : null;
  }

  loadAllChunkEdits(): [string, Uint8Array][] {
    return this.sql
      .exec<{ key: string; data: ArrayBuffer }>(`SELECT key, data FROM chunks`)
      .toArray()
      .map((r) => [r.key, new Uint8Array(r.data)]);
  }

  saveChunkEdits(key: string, data: Uint8Array): void {
    this.sql.exec(
      `INSERT INTO chunks (key, data) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET data = excluded.data`,
      key,
      data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
    );
  }

  loadPlayer(name: string): string | null {
    const rows = this.sql.exec<{ data: string }>(`SELECT data FROM players WHERE name = ?`, name).toArray();
    return rows.length ? rows[0].data : null;
  }

  savePlayer(name: string, data: string): void {
    this.sql.exec(`INSERT INTO players (name, data) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET data = excluded.data`, name, data);
  }

  loadContainers(): [number, string][] {
    return this.sql
      .exec<{ pos: number; data: string }>(`SELECT pos, data FROM containers`)
      .toArray()
      .map((r) => [Number(r.pos), r.data]);
  }

  saveContainer(pos: number, data: string | null): void {
    if (data === null) this.sql.exec(`DELETE FROM containers WHERE pos = ?`, pos);
    else this.sql.exec(`INSERT INTO containers (pos, data) VALUES (?, ?) ON CONFLICT(pos) DO UPDATE SET data = excluded.data`, pos, data);
  }
}

export class WorldRoom extends DurableObject<Env> {
  private game!: GameServer;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.game = new GameServer(new SqlStore(ctx.storage.sql));
    });
    // Respuesta automática a los latidos sin despertar al objeto.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('{"t":"hb"}', '{"t":"hb"}'));
    // Conexiones que sobrevivieron a un reinicio no tienen sesión: que se reconecten.
    for (const ws of ctx.getWebSockets()) {
      try {
        ws.close(4003, 'restart');
      } catch {
        /* ya cerrada */
      }
    }
  }

  async fetch(request: Request): Promise<Response> {
    void request;
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    this.ctx.acceptWebSocket(server);
    this.game.connect(server as Conn);
    this.startTicking();
    return new Response(null, { status: 101, webSocket: client });
  }

  private startTicking(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      try {
        this.game.tick();
      } catch (err) {
        console.error('Error en el tick del servidor', err);
      }
      // Sin nadie conectado se detiene la simulación (el objeto puede hibernar y no consume).
      if (this.game.connectionCount === 0) this.stopTicking();
    }, 1000 / TICK_RATE);
  }

  private stopTicking(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (!this.game.isKnown(ws as Conn)) {
      try {
        ws.close(4003, 'restart');
      } catch {
        /* ya cerrada */
      }
      return;
    }
    this.game.message(ws as Conn, message);
    this.startTicking();
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean): Promise<void> {
    void wasClean;
    this.game.disconnect(ws as Conn);
    try {
      ws.close(code, reason);
    } catch {
      /* ya cerrada */
    }
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    this.game.disconnect(ws as Conn);
  }
}
