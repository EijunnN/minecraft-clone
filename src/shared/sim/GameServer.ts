// Servidor de juego autoritativo, independiente del transporte: lo usa el Durable Object de
// Cloudflare (multijugador) y un Web Worker en el navegador (modo un jugador).
//
// Este archivo sólo orquesta: conexiones y sesiones, reparto de mensajes, el bucle de 20 ticks/s y
// el guardado. Cada tema vive en su sistema (carpeta server/): reglas de bloques, naturaleza,
// granja, camas, contenedores, ediciones de los jugadores, acciones sobre entidades, comandos y
// sincronización de entidades. Los sistemas sólo ven un ServerContext (ver server/context.ts).
import {
  PROTOCOL_VERSION, MAX_PLAYERS, MAX_CHAT, STATE_DEAD, STATE_MASK, encodeEdits, sanitizeName, sanitizeColor, worldTimeAt,
  stackFromWire, type ClientMsg, type ServerMsg, type PlayerInfo, type WorldTime, type PlayerSave, type WireStack,
} from '../protocol';
import { WORLD_LIMIT, CHUNK_SIZE, VOID_Y } from '../constants';
import { AIR, isValidBlockId } from '../blocks';
import { sanitizeStack } from '../containers';
import { ITEMS, isValidItem } from '../items';
import { EFFECTS, MAX_EFFECT_AMP, MAX_EFFECT_SECONDS } from '../effects';
import { sunHeightAt, rainAt } from '../weather';
import { WorldSim } from './WorldSim';
import { FluidSim, type FluidWorld } from './fluids';
import { Entities, type EntityHost, type PlayerView } from './entities';
import { blockDrops } from './drops';
import { migrateStore, type ServerStore } from './store';
import { TICK_RATE, DT, DAY_RATE, SIM_RADIUS, r2, type Conn, type Session, type PlayerRecord, type ServerContext } from './server/context';
import { BlockRules, fallsThrough } from './server/blockRules';
import { Nature } from './server/nature';
import { Spawners } from './server/spawners';
import { Storms } from './server/storms';
import { Farming } from './server/farming';
import { Beds } from './server/beds';
import { Composters } from './server/composters';
import { Fishing } from './server/fishing';
import { Campfires } from './server/campfires';
import { Signs } from './server/signs';
import { ContainerSystem } from './server/containerSystem';
import { BlockEdits } from './server/blockEdits';
import { PlayerActions } from './server/playerActions';
import { Commands } from './server/commands';
import { EntitySync } from './server/entitySync';
import { Riding } from './server/riding'; // Fase 6 (monturas)
import { Trading } from './server/trading'; // Fase 6 (aldeanos)

export { TICK_RATE, type Conn };
export { canSleepAt } from './server/beds';

/** Chunks generados como máximo por tick (la generación es lo más caro). */
const GEN_PER_TICK = 2;
const STALE_MS = 40_000;

export interface GameServerOptions {
  seed?: number;
  /** Reloj en ms (por defecto Date.now). */
  now?: () => number;
  /** Modo un jugador: sin límite de ritmo ni comprobaciones de distancia estrictas. */
  local?: boolean;
  /** Segundos entre guardados (las escrituras cuestan en el plan gratuito de Cloudflare). */
  flushSeconds?: number;
}

export class GameServer {
  readonly world: WorldSim;
  readonly entities: Entities;
  private fluids = new FluidSim();
  private fluidWorld: FluidWorld;
  private store: ServerStore;
  private sessions = new Map<Conn, Session>();
  private time: WorldTime;
  private difficulty = 2;
  private defaultMode: 's' | 'c' | null = null;
  /** Cambios de bloques por enviar: [x, y, z, id, jugador que lo hizo o null]. */
  private queue: [number, number, number, number, string | null][] = [];
  private actor: string | null = null;
  private tickCount = 0;
  private spawnPoint: [number, number, number] | null = null;
  private now: () => number;
  private local: boolean;
  private rand = Math.random;
  private lastMobSave = 0;
  private nextSessionId = 1;
  private flushTicks: number;

  // Sistemas
  private ctx: ServerContext;
  private rules: BlockRules;
  private nature: Nature;
  private spawners: Spawners;
  private storms: Storms;
  private farming: Farming;
  private beds: Beds;
  private composters: Composters;
  private campfires: Campfires;
  private signs: Signs;
  private fishing: Fishing;
  private containers: ContainerSystem;
  private edits: BlockEdits;
  private actions: PlayerActions;
  private commands: Commands;
  private entitySync: EntitySync;
  /** Fase 6 (monturas): quién monta qué. */
  readonly riding: Riding;
  private trading: Trading; // Fase 6 (aldeanos)

  constructor(store: ServerStore, opts: GameServerOptions = {}) {
    this.store = store;
    // Mundos guardados con bloques de 1 byte: pasarlos al formato de 16 bits antes de leerlos.
    migrateStore(store);
    this.now = opts.now ?? Date.now;
    this.local = !!opts.local;
    this.flushTicks = Math.max(1, Math.round((opts.flushSeconds ?? 30) * TICK_RATE));
    let seed = Number(store.getMeta('seed'));
    if (!store.getMeta('seed') || !Number.isFinite(seed)) {
      seed = opts.seed ?? ((Math.random() * 0x7fffffff) | 0);
      store.setMeta('seed', String(seed));
    }
    this.time = { base: 0.08, at: this.now(), rate: DAY_RATE };
    try {
      const t = JSON.parse(store.getMeta('time') ?? '') as WorldTime;
      if (Number.isFinite(t.base) && Number.isFinite(t.at)) this.time = { base: t.base, at: t.at, rate: DAY_RATE };
    } catch {
      store.setMeta('time', JSON.stringify(this.time));
    }
    const d = Number(store.getMeta('difficulty'));
    if (store.getMeta('difficulty') !== null && Number.isInteger(d) && d >= 0 && d <= 3) this.difficulty = d;
    const m = store.getMeta('mode');
    if (m === 's' || m === 'c') this.defaultMode = m;
    this.world = new WorldSim(seed | 0, store);
    this.world.onChange = (x, y, z, old, id) => this.onBlockChanged(x, y, z, old, id);
    this.fluidWorld = {
      getBlock: (x, y, z) => this.world.getBlock(x, y, z),
      setBlock: (x, y, z, id) => {
        this.world.setBlock(x, y, z, id);
      },
      washAway: (x, y, z, id) => this.entities.dropStacks(blockDrops(id, 0, this.rand), x + 0.5, y + 0.3, z + 0.5),
    };
    this.entities = new Entities(this.makeHost());
    this.entities.restorePassive(store.getMeta('mobs'));

    this.ctx = this.makeContext();
    this.rules = new BlockRules(this.ctx);
    this.nature = new Nature(this.ctx);
    this.farming = new Farming(this.ctx, this.nature);
    this.beds = new Beds(this.ctx);
    this.containers = new ContainerSystem(this.ctx, store);
    this.world.onLoot = (chests) => this.containers.fillLoot(chests);
    this.spawners = new Spawners(this.ctx);
    this.storms = new Storms(this.ctx);
    this.composters = new Composters(this.ctx);
    this.fishing = new Fishing(this.ctx);
    this.campfires = new Campfires(this.ctx, store);
    this.signs = new Signs(this.ctx, store);
    this.edits = new BlockEdits(this.ctx, this.rules, this.farming, this.beds, this.composters, this.campfires);
    this.actions = new PlayerActions(this.ctx);
    this.commands = new Commands(this.ctx);
    this.entitySync = new EntitySync(this.ctx);
    this.riding = new Riding(this.ctx); // Fase 6 (monturas)
    // Fase 6 (aldeanos): comercio y aldeanos de las aldeas nuevas.
    this.trading = new Trading(this.ctx);
    this.world.onVillagers = (v) => this.trading.spawnVillagers(v);
  }

  get seed(): number {
    return this.world.seed;
  }

  get playerCount(): number {
    let n = 0;
    for (const s of this.sessions.values()) if (s.joined) n++;
    return n;
  }

  get connectionCount(): number {
    return this.sessions.size;
  }

  isKnown(conn: Conn): boolean {
    return this.sessions.has(conn);
  }

  // ------------------------------------------------------------------ contexto de los sistemas

  private makeContext(): ServerContext {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const gs = this;
    return {
      world: this.world,
      entities: this.entities,
      local: this.local,
      get seed() {
        return gs.seed;
      },
      get tickCount() {
        return gs.tickCount;
      },
      get playerCount() {
        return gs.playerCount;
      },
      get difficulty() {
        return gs.difficulty;
      },
      rand: () => this.rand(),
      now: () => this.now(),
      worldTime: () => this.worldTime(),
      sessions: () => this.sessions.values(),
      send: (s, msg) => this.send(s, msg),
      sendRaw: (s, data) => this.sendRaw(s, data),
      broadcast: (msg, except) => this.broadcast(msg, except),
      tell: (s, m) => this.send(s, { t: 'chat', id: null, name: '', m }),
      fx: (kind, x, y, z, a, b) => this.fx(kind, x, y, z, a, b),
      allow: (s, cost) => this.allow(s, cost),
      reachOk: (s, x, y, z, max) => this.reachOk(s, x, y, z, max),
      reject: (s, x, y, z) => this.reject(s, x, y, z),
      asActor: (id, fn) => {
        const prev = this.actor;
        this.actor = id;
        try {
          return fn();
        } finally {
          this.actor = prev;
        }
      },
      savePlayer: (s) => this.savePlayer(s),
      setTime: (days) => this.setTime(days),
      setDifficulty: (dd) => {
        this.difficulty = dd;
        this.store.setMeta('difficulty', String(dd));
        this.broadcast({ t: 'diff', d: dd });
      },
      markCollected: (id, who) => this.entitySync.markCollected(id, who),
    };
  }

  // ------------------------------------------------------------------ anfitrión de entidades

  private makeHost(): EntityHost {
    return {
      world: this.world,
      players: () => this.playerViews(),
      sunHeight: () => sunHeightAt(this.worldTime()),
      raining: () => rainAt(this.worldTime(), this.seed),
      difficulty: () => this.difficulty,
      hurtPlayer: (id, amount, kx, ky, kz, cause) => {
        for (const s of this.sessions.values()) {
          if (s.id !== id || !s.joined || s.mode === 'c' || s.s & STATE_DEAD) continue;
          this.send(s, { t: 'hurt', a: Math.round(amount * 10) / 10, k: [r2(kx), r2(ky), r2(kz)], c: cause });
        }
      },
      fx: (kind, x, y, z, a, b) => this.fx(kind, x, y, z, a, b),
      breakBlock: (x, y, z, drop) => {
        const id = this.world.getBlock(x, y, z);
        if (id <= 0) return;
        this.world.setBlock(x, y, z, AIR);
        if (drop) this.entities.dropStacks(blockDrops(id, 0, this.rand), x + 0.5, y + 0.3, z + 0.5);
      },
      trample: (x, y, z) => this.farming.trample(x, y, z),
      landBlock: (x, y, z, block) => {
        const cur = this.world.getBlock(x, y, z);
        if (cur >= 0 && fallsThrough(cur) && isValidBlockId(block)) this.world.setBlock(x, y, z, block);
        else this.entities.dropStacks([{ id: block, count: 1 }], x + 0.5, y + 0.5, z + 0.5);
      },
      giveXp: (id, n) => {
        for (const s of this.sessions.values()) if (s.id === id && s.joined) this.send(s, { t: 'xp', n });
      },
    };
  }

  private playerViews(): PlayerView[] {
    const now = this.now();
    const out: PlayerView[] = [];
    for (const s of this.sessions.values()) {
      if (!s.joined) continue;
      out.push({
        id: s.id, name: s.name, x: s.p[0], y: s.p[1], z: s.p[2], alive: !(s.s & STATE_DEAD), creative: s.mode === 'c',
        lookingAt: s.lookUntil > now ? s.lookAt : -1, held: s.h,
      });
    }
    return out;
  }

  private worldTime(): number {
    return worldTimeAt(this.time, this.now());
  }

  private fx(kind: string, x: number, y: number, z: number, a?: number, b?: number): void {
    const msg: ServerMsg = { t: 'fx', k: kind, p: [r2(x), r2(y), r2(z)] };
    if (a !== undefined) msg.a = a;
    if (b !== undefined) msg.b = b;
    const data = JSON.stringify(msg);
    for (const s of this.sessions.values()) {
      if (!s.joined) continue;
      const dx = s.p[0] - x, dz = s.p[2] - z;
      if (dx * dx + dz * dz < 64 * 64) this.sendRaw(s, data);
    }
  }

  // ------------------------------------------------------------------ envío

  private sendRaw(s: Session, data: string | ArrayBuffer): void {
    try {
      s.conn.send(data);
    } catch {
      /* conexión cerrada */
    }
  }

  private send(s: Session, msg: ServerMsg): void {
    this.sendRaw(s, JSON.stringify(msg));
  }

  private broadcast(msg: ServerMsg, except?: Session): void {
    const data = JSON.stringify(msg);
    for (const s of this.sessions.values()) if (s.joined && s !== except) this.sendRaw(s, data);
  }

  private info(s: Session): PlayerInfo {
    return { id: s.id, name: s.name, shirt: s.shirt, p: s.p, r: s.r, s: s.s, h: s.h, o: s.o, a: s.a };
  }

  /** Envía las ediciones pendientes respetando el orden en que se aplicaron. */
  private flushQueue(): void {
    const q = this.queue;
    if (q.length === 0) return;
    this.queue = [];
    let batch: number[] = [];
    const sendBatch = () => {
      if (batch.length) this.broadcast({ t: 'sets', l: batch });
      batch = [];
    };
    for (const [x, y, z, b, who] of q) {
      if (who) {
        sendBatch();
        this.broadcast({ t: 'set', id: who, x, y, z, b });
      } else batch.push(x, y, z, b);
    }
    sendBatch();
  }

  // ------------------------------------------------------------------ conexiones

  connect(conn: Conn): void {
    const now = this.now();
    this.sessions.set(conn, {
      conn, id: (this.nextSessionId++).toString(36) + Math.random().toString(36).slice(2, 7), joined: false,
      joinedAt: now, lastMsg: now, name: '', shirt: '#3a7bd5', p: [0, 100, 0], r: [0, 0], s: 0, h: 0, o: 0, a: [0, 0, 0, 0], mode: 's',
      lookAt: -1, lookUntil: 0, lastAttack: 0, tokens: 60, tokenTime: now, known: new Map(), container: null,
      save: null, saveDirty: false, sleeping: null, sleepTicks: 0, bed: null,
    });
  }

  disconnect(conn: Conn): void {
    const s = this.sessions.get(conn);
    if (!s) return;
    this.sessions.delete(conn);
    if (!s.joined) return;
    this.trading.onLeave(s); // Fase 6 (aldeanos)
    this.savePlayer(s);
    this.broadcast({ t: 'leave', id: s.id });
    this.riding.onLeave(s); // Fase 6 (monturas)
    this.broadcast({ t: 'chat', id: null, name: '', m: `${s.name} salió del mundo.` });
    if (this.playerCount === 0) this.flush(true);
  }

  message(conn: Conn, data: string | ArrayBuffer): void {
    const s = this.sessions.get(conn);
    if (!s || typeof data !== 'string' || data.length > 16384) return;
    let msg: ClientMsg;
    try {
      const parsed: unknown = JSON.parse(data);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return;
      msg = parsed as ClientMsg;
    } catch {
      return;
    }
    s.lastMsg = this.now();
    try {
      this.handle(s, msg);
    } catch (err) {
      console.error('Error procesando mensaje', err);
    }
    this.flushQueue();
  }

  private allow(s: Session, cost: number): boolean {
    if (this.local) return true;
    const now = this.now();
    s.tokens = Math.min(80, s.tokens + ((now - s.tokenTime) / 1000) * 40);
    s.tokenTime = now;
    if (s.tokens < cost) return false;
    s.tokens -= cost;
    return true;
  }

  /** Reparte cada mensaje a su sistema. */
  private handle(s: Session, msg: ClientMsg): void {
    if (msg.t === 'hello') {
      this.onHello(s, msg);
      return;
    }
    if (msg.t === 'ping') {
      this.send(s, { t: 'pong', c: Number(msg.c) || 0, now: this.now() });
      return;
    }
    if (!s.joined) return;
    switch (msg.t) {
      case 'pos':
        if (this.allow(s, 0.2)) this.onPos(s, msg);
        break;
      case 'set':
        this.edits.onSet(s, msg);
        break;
      case 'place':
        this.edits.onPlace(s, msg);
        break;
      case 'use':
        if (this.allow(s, 1)) this.edits.onUse(s, msg);
        break;
      case 'wake':
        this.beds.wake(s);
        break;
      case 'interact':
        if (this.allow(s, 1)) this.farming.onInteract(s, msg);
        break;
      case 'trample': {
        const x = Number(msg.x), y = Number(msg.y), z = Number(msg.z);
        if ([x, y, z].every(Number.isInteger) && this.allow(s, 1) && this.reachOk(s, x, y, z, 3)) this.farming.trample(x, y, z);
        break;
      }
      case 'chat':
        this.onChat(s, msg.m);
        break;
      case 'swing':
        if (this.allow(s, 0.5)) this.broadcast({ t: 'swing', id: s.id }, s);
        break;
      case 'attack':
        if (this.allow(s, 1)) this.actions.onAttack(s, msg);
        break;
      case 'pickup':
        if (this.allow(s, 0.5)) this.actions.onPickup(s, Number(msg.e));
        break;
      case 'drop':
        this.actions.onDrop(s, msg);
        break;
      case 'shoot':
        if (this.allow(s, 3)) this.actions.onShoot(s, msg);
        break;
      case 'throw':
        if (this.allow(s, 1)) this.actions.onThrow(s, msg);
        break;
      case 'fish':
        if (this.allow(s, 1)) this.fishing.onFish(s, msg);
        break;
      case 'sign':
        if (this.allow(s, 2)) this.signs.onSign(s, msg);
        break;
      case 'open':
        if (this.allow(s, 1)) this.containers.onOpen(s, msg);
        break;
      case 'close':
        s.container = null;
        break;
      case 'cclick':
      case 'cput':
      case 'ctake':
        this.containers.onOp(s, msg);
        break;
      case 'look':
        if (Number.isInteger(msg.e) && this.allow(s, 0.2)) {
          s.lookAt = msg.e;
          s.lookUntil = this.now() + 700;
        }
        break;
      case 'state':
        if (this.allow(s, 2)) this.onState(s, msg.d);
        break;
      case 'dropxp': {
        // Al morir: n entero 1..100 (7 por nivel, como mucho 100), junto al jugador ya muerto.
        const n = Number(msg.n);
        const p = Array.isArray(msg.p) && msg.p.length === 3 ? msg.p.map(Number) : [];
        if (!Number.isInteger(n) || n < 1 || n > 100 || p.length !== 3 || !p.every(Number.isFinite)) break;
        if (!(s.s & STATE_DEAD) || s.mode === 'c' || Math.hypot(p[0] - s.p[0], p[1] - s.p[1], p[2] - s.p[2]) > 4) break;
        if (this.allow(s, 5)) this.entities.xp.playerDrop(s.id, n, p[0], p[1], p[2], this.now());
        break;
      }
      // Fase 6 (aldeanos): comercio.
      case 'topen':
        if (this.allow(s, 1)) this.trading.onOpen(s, msg);
        break;
      case 'trade':
        this.trading.onTrade(s, msg);
        break;
      case 'tclose':
        this.trading.onClose(s);
        break;
      case 'died':
        if (typeof msg.m === 'string' && this.allow(s, 5)) {
          const m = msg.m.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 80);
          if (m) this.broadcast({ t: 'chat', id: null, name: '', m: `☠ ${s.name} ${m}.` });
        }
        break;
      // Fase 6 (monturas)
      case 'mount':
        if (this.allow(s, 1)) this.riding.onMount(s, msg);
        break;
      case 'dismount':
        this.riding.dismount(s.id);
        break;
      case 'mpos':
        if (this.allow(s, 0.2)) this.riding.onMove(s, msg);
        break;
    }
  }

  // ------------------------------------------------------------------ jugadores

  private onHello(s: Session, msg: Extract<ClientMsg, { t: 'hello' }>): void {
    if (s.joined) return;
    if (msg.v !== PROTOCOL_VERSION) {
      this.send(s, { t: 'error', m: 'Versión del juego desactualizada: recarga la página.' });
      s.conn.close(4000, 'version');
      return;
    }
    this.sweepStale(true);
    const name = sanitizeName(msg.name);
    // Mismo nombre conectado: la conexión nueva sustituye a la antigua (p. ej. tras un corte).
    for (const other of this.sessions.values()) {
      if (other !== s && other.joined && other.name.toLowerCase() === name.toLowerCase()) {
        this.send(other, { t: 'error', m: 'Has entrado con este nombre desde otra ventana.' });
        this.disconnect(other.conn);
        try {
          other.conn.close(4005, 'replaced');
        } catch {
          /* ya cerrada */
        }
      }
    }
    if (this.playerCount >= MAX_PLAYERS) {
      this.send(s, { t: 'error', m: `La sala está llena (máximo ${MAX_PLAYERS} jugadores).` });
      s.conn.close(4001, 'full');
      return;
    }
    if (!this.defaultMode) {
      this.defaultMode = msg.mode === 'c' ? 'c' : 's';
      this.store.setMeta('mode', this.defaultMode);
    }
    s.name = name;
    s.shirt = sanitizeColor(msg.shirt);
    const rec = this.loadRecord(name);
    s.mode = rec?.mode ?? this.defaultMode;
    s.save = rec?.save ?? null;
    const bed = rec?.bed;
    s.bed = Array.isArray(bed) && bed.length === 3 && bed.every(Number.isInteger) ? bed : null;
    if (s.save?.pos && s.save.pos.every(Number.isFinite)) s.p = [s.save.pos[0], s.save.pos[1], s.save.pos[2]];
    s.joined = true;
    s.joinedAt = this.now();
    if (!this.spawnPoint) {
      const sp = this.world.gen.findSpawn();
      this.spawnPoint = [sp.x, sp.y, sp.z];
    }
    const edits = this.world.allEdits();
    const players: PlayerInfo[] = [];
    for (const o of this.sessions.values()) if (o.joined && o !== s) players.push(this.info(o));
    this.send(s, {
      t: 'welcome', id: s.id, seed: this.seed, time: this.time, now: this.now(), players, editCount: edits.length,
      mode: s.mode, diff: this.difficulty, save: s.save, spawn: this.spawnPoint, bed: s.bed, rods: this.fishing.active(),
      signs: this.signs.all(),
    });
    this.sendRaw(s, encodeEdits(edits));
    this.broadcast({ t: 'join', p: this.info(s) }, s);
    this.riding.onJoin(s); // Fase 6 (monturas): quién va montado
  }

  private loadRecord(name: string): PlayerRecord | null {
    const raw = this.store.loadPlayer(name.toLowerCase());
    if (!raw) return null;
    try {
      const r = JSON.parse(raw) as PlayerRecord;
      if (r.mode !== 's' && r.mode !== 'c') r.mode = this.defaultMode ?? 's';
      return r;
    } catch {
      return null;
    }
  }

  private savePlayer(s: Session): void {
    if (!s.joined) return;
    const rec: PlayerRecord = { mode: s.mode, save: s.save, bed: s.bed };
    this.store.savePlayer(s.name.toLowerCase(), JSON.stringify(rec));
    s.saveDirty = false;
  }

  private onPos(s: Session, msg: Extract<ClientMsg, { t: 'pos' }>): void {
    if (!Array.isArray(msg.p) || !Array.isArray(msg.r) || msg.p.length !== 3 || msg.r.length !== 2) return;
    const p = msg.p.map(Number);
    const r = msg.r.map(Number);
    if (!p.every(Number.isFinite) || !r.every(Number.isFinite)) return;
    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
    const TAU = Math.PI * 2;
    const yaw = ((r[0] % TAU) + TAU) % TAU;
    s.p = [r2(clamp(p[0], -WORLD_LIMIT, WORLD_LIMIT)), r2(clamp(p[1], VOID_Y - 64, 1024)), r2(clamp(p[2], -WORLD_LIMIT, WORLD_LIMIT))];
    s.r = [Math.round(yaw * 1000) / 1000, Math.round(clamp(r[1], -Math.PI / 2, Math.PI / 2) * 1000) / 1000];
    s.s = (Number(msg.s) | 0) & STATE_MASK;
    const h = Number(msg.h), o = Number(msg.o);
    s.h = Number.isInteger(h) && isValidItem(h) ? h : 0;
    s.o = Number.isInteger(o) && isValidItem(o) ? o : 0;
    // Armadura visible: cada ranura sólo admite su pieza (cabeza, pecho, piernas, pies); lo demás es 0.
    const a = Array.isArray(msg.a) ? msg.a : [];
    s.a = [0, 1, 2, 3].map((slot) => {
      const id = Number(a[slot]);
      return Number.isInteger(id) && isValidItem(id) && ITEMS[id]?.armor?.slot === slot ? id : 0;
    });
    this.broadcast({ t: 'pos', id: s.id, p: s.p, r: s.r, s: s.s, h: s.h, o: s.o, a: s.a }, s);
  }

  /** Distancia del ojo del jugador al centro del bloque. */
  private reachOk(s: Session, x: number, y: number, z: number, max: number): boolean {
    if (this.local) return true;
    const dx = x + 0.5 - s.p[0], dy = y + 0.5 - (s.p[1] + 1.6), dz = z + 0.5 - s.p[2];
    return dx * dx + dy * dy + dz * dz <= max * max;
  }

  /** Rechaza una edición: devuelve al emisor el bloque real para deshacer su predicción. */
  private reject(s: Session, x: number, y: number, z: number): void {
    const cur = this.world.getBlock(x, y, z);
    if (cur >= 0) this.send(s, { t: 'sets', l: [x, y, z, cur] });
  }

  private onState(s: Session, d: unknown): void {
    if (!d || typeof d !== 'object') return;
    const raw = d as Partial<PlayerSave>;
    const num = (v: unknown, lo: number, hi: number, def: number) => {
      const n = Number(v);
      return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : def;
    };
    const inv: (WireStack | null)[] = [];
    if (Array.isArray(raw.inv)) {
      for (let i = 0; i < Math.min(46, raw.inv.length); i++) {
        const st = sanitizeStack(stackFromWire(raw.inv[i]));
        inv.push(st ? (st.dmg ? [st.id, st.count, st.dmg] : [st.id, st.count]) : null);
      }
    }
    const save: PlayerSave = {
      inv,
      hp: num(raw.hp, 0, 20, 20),
      food: num(raw.food, 0, 20, 20),
      sat: num(raw.sat, 0, 20, 5),
      air: num(raw.air, 0, 15, 15),
      sel: num(raw.sel, 0, 8, 0) | 0,
      fly: !!raw.fly,
      dead: !!raw.dead,
      xp: Math.floor(num(raw.xp, 0, 10_000_000, 0)),
      abs: num(raw.abs, 0, 20, 0),
    };
    if (Array.isArray(raw.fx)) {
      // Efectos activos: sólo los conocidos, con nivel y duración acotados.
      save.fx = raw.fx.slice(0, 16).flatMap((f) => {
        if (!Array.isArray(f)) return [];
        const [id, amp, secs] = f.map(Number);
        if (!EFFECTS[id] || !Number.isFinite(secs) || secs <= 0) return [];
        return [[id, Math.max(0, Math.min(MAX_EFFECT_AMP, amp | 0)), Math.min(MAX_EFFECT_SECONDS, Math.round(secs * 10) / 10)] as [number, number, number]];
      });
    }
    if (raw.off !== undefined) {
      const st = sanitizeStack(stackFromWire(raw.off));
      save.off = st ? (st.dmg ? [st.id, st.count, st.dmg] : [st.id, st.count]) : null;
    }
    if (Array.isArray(raw.armor)) {
      // Cada ranura sólo admite su pieza (cabeza, pecho, piernas, pies).
      save.armor = [0, 1, 2, 3].map((slot) => {
        const st = sanitizeStack(stackFromWire(raw.armor![slot]));
        return st && ITEMS[st.id]?.armor?.slot === slot ? (st.dmg ? [st.id, 1, st.dmg] : [st.id, 1]) : null;
      });
    }
    if (Array.isArray(raw.pos) && raw.pos.length === 3 && raw.pos.map(Number).every(Number.isFinite)) {
      save.pos = [r2(Number(raw.pos[0])), r2(Number(raw.pos[1])), r2(Number(raw.pos[2]))];
    }
    if (Array.isArray(raw.rot) && raw.rot.length === 2 && raw.rot.map(Number).every(Number.isFinite)) {
      save.rot = [r2(Number(raw.rot[0])), r2(Number(raw.rot[1]))];
    }
    s.save = save;
    s.saveDirty = true;
  }

  private onChat(s: Session, raw: unknown): void {
    if (typeof raw !== 'string') return;
    const m = raw.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, MAX_CHAT);
    if (!m || !this.allow(s, 3)) return;
    if (m.startsWith('/')) {
      this.commands.run(s, m);
      return;
    }
    this.broadcast({ t: 'chat', id: s.id, name: s.name, m }, s);
  }

  private setTime(days: number): void {
    if (!Number.isFinite(days)) return;
    this.time = { base: days, at: this.now(), rate: DAY_RATE };
    this.store.setMeta('time', JSON.stringify(this.time));
    this.broadcast({ t: 'time', time: this.time, now: this.now() });
  }

  // ------------------------------------------------------------------ cambios de bloques

  /** Cada cambio de bloque (de quien sea) se difunde y avisa a los sistemas que dependen de él. */
  private onBlockChanged(x: number, y: number, z: number, old: number, id: number): void {
    this.queue.push([x, y, z, id, this.actor]);
    this.fluids.onBlockChanged(this.fluidWorld, x, y, z);
    this.containers.onBlockChanged(x, y, z, old, id);
    this.nature.onBlockChanged(x, y, z, old, id);
    this.beds.onBlockChanged(x, y, z, old, id);
    this.farming.onBlockChanged(x, y, z, old, id);
    this.campfires.onBlockChanged(x, y, z, old, id);
    this.signs.onBlockChanged(x, y, z, old, id);
    this.rules.onBlockChanged(x, y, z, id);
  }

  // ------------------------------------------------------------------ bucle

  /** Avanza un tick (1/20 s). Llamar a 20 Hz mientras haya jugadores. */
  tick(): void {
    this.tickCount++;
    const now = this.now();
    this.loadChunks(now);
    this.fluids.step(this.fluidWorld);
    this.nature.tick();
    this.entities.tick(DT);
    this.riding.tick(); // Fase 6 (monturas)
    this.beds.tick();
    this.composters.tick();
    this.fishing.tick();
    if (this.tickCount % TICK_RATE === 0) this.spawners.tick();
    this.storms.tick(DT);
    if (this.tickCount % TICK_RATE === 0) this.trading.tick(1); // Fase 6 (aldeanos)
    this.entitySync.takeRemoved(this.entities.removed);
    this.entities.removed = [];
    if (this.tickCount % 4 === 0) {
      this.containers.tickFurnaces(DT * 4);
      this.campfires.tick(DT * 4);
    }
    this.flushQueue();
    if (this.tickCount % 2 === 0) this.entitySync.sync();
    if (this.tickCount % (TICK_RATE * 5) === 0) this.sweepStale(false);
    if (this.tickCount % this.flushTicks === 0) this.flush(false);
    if (this.tickCount % (TICK_RATE * 10) === 0) {
      this.world.unloadUnused(now, (cx, cz) => this.nearPlayer(cx, cz, SIM_RADIUS + 2));
    }
  }

  private nearPlayer(cx: number, cz: number, r: number): boolean {
    for (const s of this.sessions.values()) {
      if (!s.joined) continue;
      const pcx = Math.floor(s.p[0] / CHUNK_SIZE), pcz = Math.floor(s.p[2] / CHUNK_SIZE);
      if (Math.abs(cx - pcx) <= r && Math.abs(cz - pcz) <= r) return true;
    }
    return false;
  }

  /** Carga los chunks cercanos a los jugadores (los más próximos primero) y los marca en uso. */
  private loadChunks(now: number): void {
    let budget = GEN_PER_TICK;
    for (const s of this.sessions.values()) {
      if (!s.joined) continue;
      const pcx = Math.floor(s.p[0] / CHUNK_SIZE), pcz = Math.floor(s.p[2] / CHUNK_SIZE);
      for (let ring = 0; ring <= SIM_RADIUS; ring++) {
        for (let dz = -ring; dz <= ring; dz++) {
          for (let dx = -ring; dx <= ring; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue;
            const cx = pcx + dx, cz = pcz + dz;
            const c = this.world.getChunk(cx, cz);
            if (c) c.lastUsed = now;
            else if (budget > 0) {
              budget--;
              this.world.ensureChunk(cx, cz, now);
            }
          }
        }
      }
    }
  }

  // ------------------------------------------------------------------ persistencia

  private sweepStale(force: boolean): void {
    if (this.local) return;
    const now = this.now();
    for (const s of [...this.sessions.values()]) {
      if (now - s.lastMsg > STALE_MS || (force && !s.joined && now - s.joinedAt > STALE_MS)) {
        this.disconnect(s.conn);
        try {
          s.conn.close(4002, 'timeout');
        } catch {
          /* ya cerrada */
        }
      }
    }
  }

  /** Guarda lo pendiente: ediciones, contenedores, jugadores y animales. */
  flush(all: boolean): void {
    this.world.flush();
    this.containers.flush(this.store);
    this.campfires.flush(this.store);
    this.signs.flush(this.store);
    for (const s of this.sessions.values()) if (s.saveDirty) this.savePlayer(s);
    const now = this.now();
    if (all || now - this.lastMobSave > 60_000) {
      this.lastMobSave = now;
      this.store.setMeta('mobs', this.entities.serializePassive());
    }
  }

  /** Para pruebas y depuración. */
  stats(): { chunks: number; entities: number; fluids: number; containers: number; players: number } {
    return {
      chunks: this.world.loadedCount, entities: this.entities.list.size, fluids: this.fluids.pending,
      containers: this.containers.count, players: this.playerCount,
    };
  }
}
