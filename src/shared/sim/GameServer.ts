// Servidor de juego autoritativo, independiente del transporte: lo usa el Durable Object de
// Cloudflare (multijugador) y un Web Worker en el navegador (modo un jugador). Simula a 20 ticks/s
// los fluidos, las criaturas, los objetos, los hornos, la gravedad de arena/grava, el soporte de
// plantas, la caída de hojas y el crecimiento de brotes; valida y difunde las ediciones.
import {
  PROTOCOL_VERSION, MAX_PLAYERS, MAX_CHAT, STATE_DEAD, STATE_SLEEP, encodeEdits, sanitizeName, sanitizeColor, worldTimeAt,
  stackFromWire, type ClientMsg, type ServerMsg, type PlayerInfo, type WorldTime, type GameMode, type PlayerSave,
  type WireStack,
} from '../protocol';
import { DAY_LENGTH_SECONDS, WORLD_HEIGHT, WORLD_LIMIT, CHUNK_SIZE } from '../constants';
import {
  AIR, BEDROCK, SAND, GRAVEL, CACTUS, SUGAR_CANE, GRASS, DIRT, SNOWY_GRASS, OAK_LOG, BIRCH_LOG, SPRUCE_LOG,
  OAK_LEAVES, BIRCH_LEAVES, SPRUCE_LEAVES, OAK_SAPLING, BIRCH_SAPLING, SPRUCE_SAPLING, FURNACE, FURNACE_LIT,
  BLOCKS, BLOCK_FLUID, BLOCK_FLUID_LEVEL, BLOCK_HARDNESS, BLOCK_SOLID, BLOCK_OPAQUE, BLOCK_RENDER, BLOCK_REPLACEABLE,
  R_CROSS, R_TORCH, BLOCK_WALL, BLOCK_NEEDS_SUPPORT, isValidBlockId, isContainer, isChest, isFurnace, blockFacing,
  blockSupported, isBed, stateProps,
} from '../blocks';
import { planPlacement, partnerOf, toggleEdits, isUsable, type Edit } from '../placement';
import { ITEMS, isValidItem, maxStack, type ItemStack } from '../items';
import { MOBS, MOB_TYPES, ENT_ITEM, ENT_FALLING } from '../mobs';
import {
  newContainer, clickSlot, insertStack, takeFromSlot, furnaceTick, containerToWire, containerFromWire,
  sanitizeStack, type ContainerState, type ContainerWire,
} from '../containers';
import { sunHeightAt, rainAt } from '../weather';
import { WorldSim } from './WorldSim';
import { FluidSim, type FluidWorld } from './fluids';
import { Entities, type Entity, type EntityHost, type PlayerView } from './entities';
import { blockDrops, leafDecayDrops } from './drops';
import { standable } from './pathfind';
import { posKey, keyX, keyY, keyZ } from './posKey';
import { migrateStore, type ServerStore } from './store';

/** Conexión de un jugador (WebSocket del Durable Object o puerto del worker local). */
export interface Conn {
  send(data: string | ArrayBuffer): void;
  close(code?: number, reason?: string): void;
}

interface Session {
  conn: Conn;
  id: string;
  joined: boolean;
  joinedAt: number;
  lastMsg: number;
  name: string;
  shirt: string;
  p: [number, number, number];
  r: [number, number];
  s: number;
  h: number;
  mode: GameMode;
  lookAt: number;
  lookUntil: number;
  lastAttack: number;
  tokens: number;
  tokenTime: number;
  known: Map<number, string>;
  container: number | null;
  save: PlayerSave | null;
  saveDirty: boolean;
  /** Cama en la que duerme (clave de posición) y ticks que lleva dormido. */
  sleeping: number | null;
  sleepTicks: number;
  /** Cama donde reaparece (pies de la cama). */
  bed: [number, number, number] | null;
}

interface PlayerRecord {
  mode: GameMode;
  save: PlayerSave | null;
  bed?: [number, number, number] | null;
}

export const TICK_RATE = 20;
const DT = 1 / TICK_RATE;
const DAY_RATE = 1 / DAY_LENGTH_SECONDS;
/** Radio (en chunks) simulado alrededor de cada jugador. */
const SIM_RADIUS = 4;
/** Chunks generados como máximo por tick (la generación es lo más caro). */
const GEN_PER_TICK = 2;
/** Distancia a la que se envían entidades a un jugador. */
const ENTITY_RANGE = 80;
const STALE_MS = 40_000;
/** Ticks aleatorios por chunk y tick (Minecraft usa 3 por sección de 16³ = 48 por columna). */
const RANDOM_TICKS_PER_CHUNK = 48;

const LOGS = new Set([OAK_LOG, BIRCH_LOG, SPRUCE_LOG]);
const LEAVES = new Set([OAK_LEAVES, BIRCH_LEAVES, SPRUCE_LEAVES]);
const SAPLINGS = new Map([[OAK_SAPLING, 0], [BIRCH_SAPLING, 1], [SPRUCE_SAPLING, 2]]);
const SOIL = new Set([GRASS, DIRT, SNOWY_GRASS]);

const r2 = (v: number) => Math.round(v * 100) / 100;
const NEIGHBORS7 = [[0, 0, 0], [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

/** Plantas, antorchas de pie y cactus: necesitan el bloque de abajo. */
function needsSupport(id: number): boolean {
  const r = BLOCK_RENDER[id];
  return ((r === R_CROSS || r === R_TORCH) && BLOCK_WALL[id] < 0) || id === CACTUS;
}

/** Ticks durmiendo antes de que se haga de día (Minecraft: 100). */
const SLEEP_TICKS = 100;

/** ¿Se puede dormir a esta hora? (como en Minecraft: del anochecer hasta poco antes del amanecer). */
export function canSleepAt(worldTime: number): boolean {
  const d = worldTime - Math.floor(worldTime);
  return d > 0.52 && d < 0.98;
}

function supportOk(id: number, below: number): boolean {
  if (below < 0) return true; // sin cargar: no tocar
  if (id === CACTUS) return below === CACTUS || below === SAND;
  if (id === SUGAR_CANE) return below === SUGAR_CANE || below === SAND || SOIL.has(below);
  if (SAPLINGS.has(id)) return SOIL.has(below);
  return BLOCK_SOLID[below] === 1 && BLOCK_RENDER[below] !== R_CROSS;
}

function isFalling(id: number): boolean {
  return id === SAND || id === GRAVEL;
}

/** ¿Puede ocupar una celda un bloque que cae (o se desplaza) sobre ella? */
function fallsThrough(id: number): boolean {
  return id === AIR || BLOCK_FLUID[id] > 0 || (BLOCK_SOLID[id] === 0 && BLOCK_REPLACEABLE[id] === 1);
}

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
  private defaultMode: GameMode | null = null;
  private containers = new Map<number, ContainerState>();
  private dirtyContainers = new Set<number>();
  private queue: [number, number, number, number, string | null][] = [];
  private actor: string | null = null;
  private tickCount = 0;
  private decay = new Map<number, number>();
  private spawnPoint: [number, number, number] | null = null;
  private now: () => number;
  private local: boolean;
  private rand = Math.random;
  private lastMobSave = 0;
  private nextSessionId = 1;
  private collected = new Map<number, string>();
  private flushTicks: number;
  /** Mientras se colocan varias celdas a la vez, las comprobaciones de apoyo se aplazan. */
  private supportBatch: [number, number, number][] | null = null;
  /** Romper sin soltar objetos (jugador en creativo). */
  private silentDrops = false;

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
    for (const [key, data] of store.loadContainers()) {
      try {
        const c = containerFromWire(JSON.parse(data) as ContainerWire);
        if (c) this.containers.set(key, c);
      } catch {
        /* ignorar */
      }
    }
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
      landBlock: (x, y, z, block) => {
        const cur = this.world.getBlock(x, y, z);
        if (cur >= 0 && fallsThrough(cur) && isValidBlockId(block)) this.world.setBlock(x, y, z, block);
        else this.entities.dropStacks([{ id: block, count: 1 }], x + 0.5, y + 0.5, z + 0.5);
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
        lookingAt: s.lookUntil > now ? s.lookAt : -1,
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
    return { id: s.id, name: s.name, shirt: s.shirt, p: s.p, r: s.r, s: s.s, h: s.h };
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
      joinedAt: now, lastMsg: now, name: '', shirt: '#3a7bd5', p: [0, 100, 0], r: [0, 0], s: 0, h: 0, mode: 's',
      lookAt: -1, lookUntil: 0, lastAttack: 0, tokens: 60, tokenTime: now, known: new Map(), container: null,
      save: null, saveDirty: false, sleeping: null, sleepTicks: 0, bed: null,
    });
  }

  disconnect(conn: Conn): void {
    const s = this.sessions.get(conn);
    if (!s) return;
    this.sessions.delete(conn);
    if (!s.joined) return;
    this.savePlayer(s);
    this.broadcast({ t: 'leave', id: s.id });
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
        this.onSet(s, msg);
        break;
      case 'place':
        this.onPlace(s, msg);
        break;
      case 'use':
        if (this.allow(s, 1)) this.onUse(s, msg);
        break;
      case 'wake':
        this.wake(s);
        break;
      case 'chat':
        this.onChat(s, msg.m);
        break;
      case 'swing':
        if (this.allow(s, 0.5)) this.broadcast({ t: 'swing', id: s.id }, s);
        break;
      case 'attack':
        if (this.allow(s, 1)) this.onAttack(s, msg);
        break;
      case 'pickup':
        if (this.allow(s, 0.5)) this.onPickup(s, Number(msg.e));
        break;
      case 'drop':
        this.onDrop(s, msg);
        break;
      case 'shoot':
        if (this.allow(s, 3)) this.onShoot(s, msg);
        break;
      case 'open':
        if (this.allow(s, 1)) this.onOpen(s, msg);
        break;
      case 'close':
        s.container = null;
        break;
      case 'cclick':
      case 'cput':
      case 'ctake':
        this.onContainerOp(s, msg);
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
      case 'died':
        if (typeof msg.m === 'string' && this.allow(s, 5)) {
          const m = msg.m.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 80);
          if (m) this.broadcast({ t: 'chat', id: null, name: '', m: `☠ ${s.name} ${m}.` });
        }
        break;
    }
  }

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
      mode: s.mode, diff: this.difficulty, save: s.save, spawn: this.spawnPoint, bed: s.bed,
    });
    this.sendRaw(s, encodeEdits(edits));
    this.broadcast({ t: 'join', p: this.info(s) }, s);
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
    s.p = [r2(clamp(p[0], -WORLD_LIMIT, WORLD_LIMIT)), r2(clamp(p[1], -128, 1024)), r2(clamp(p[2], -WORLD_LIMIT, WORLD_LIMIT))];
    s.r = [Math.round(yaw * 1000) / 1000, Math.round(clamp(r[1], -Math.PI / 2, Math.PI / 2) * 1000) / 1000];
    s.s = (Number(msg.s) | 0) & 0xff;
    const h = Number(msg.h);
    s.h = Number.isInteger(h) && isValidItem(h) ? h : 0;
    this.broadcast({ t: 'pos', id: s.id, p: s.p, r: s.r, s: s.s, h: s.h }, s);
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

  private onSet(s: Session, msg: Extract<ClientMsg, { t: 'set' }>): void {
    const x = Number(msg.x), y = Number(msg.y), z = Number(msg.z), b = Number(msg.b);
    if (![x, y, z, b].every(Number.isInteger)) return;
    if (Math.abs(x) > WORLD_LIMIT || Math.abs(z) > WORLD_LIMIT || y < 1 || y >= WORLD_HEIGHT) return;
    if (!isValidBlockId(b) || b === BEDROCK || BLOCK_FLUID_LEVEL[b] !== 0 || (b >= FURNACE_LIT && b < FURNACE_LIT + 4)) {
      this.reject(s, x, y, z);
      return;
    }
    if (!this.allow(s, 1) || s.s & STATE_DEAD || !this.reachOk(s, x, y, z, 8)) {
      this.reject(s, x, y, z);
      return;
    }
    // Sólo ahora (edición válida y al alcance del jugador) se genera el chunk si aún no estaba.
    this.world.ensureChunk(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE), this.now());
    const cur = this.world.getBlock(x, y, z);
    if (cur < 0) return;
    const creative = s.mode === 'c';
    const tool = Number(msg.tool);
    this.actor = s.id;
    this.silentDrops = creative;
    try {
      if (b === AIR) {
        if (cur === AIR) return;
        if (BLOCK_FLUID[cur]) {
          // Recoger con el cubo: sólo fuentes.
          if (BLOCK_FLUID_LEVEL[cur] !== 0) {
            this.reject(s, x, y, z);
            return;
          }
        } else if (BLOCK_HARDNESS[cur] < 0 || !BLOCKS[cur].breakable) {
          this.reject(s, x, y, z);
          return;
        }
        const drops = !creative && !BLOCK_FLUID[cur] ? blockDrops(cur, Number.isInteger(tool) ? tool : 0, this.rand) : [];
        this.world.setBlock(x, y, z, AIR);
        this.entities.dropStacks(drops, x + 0.5, y + 0.3, z + 0.5);
      } else {
        // Sólo cubos (fluidos); los bloques se colocan con 'place'.
        if (!BLOCK_FLUID[b] || (!BLOCK_REPLACEABLE[cur] && cur !== b)) {
          this.reject(s, x, y, z);
          return;
        }
        this.world.setBlock(x, y, z, b);
      }
    } finally {
      this.actor = null;
      this.silentDrops = false;
    }
  }

  /** Aplica varias ediciones como una sola (las dos mitades de una puerta, una cama...). */
  private applyEdits(edits: Edit[]): void {
    this.supportBatch = [];
    try {
      for (const [x, y, z, id] of edits) this.world.setBlock(x, y, z, id);
    } finally {
      const batch = this.supportBatch;
      this.supportBatch = null;
      for (const [x, y, z] of batch) this.checkSupport(x, y, z, this.world.getBlock(x, y, z));
    }
  }

  private onPlace(s: Session, msg: Extract<ClientMsg, { t: 'place' }>): void {
    const x = Number(msg.x), y = Number(msg.y), z = Number(msg.z), item = Number(msg.item), yaw = Number(msg.yaw);
    const n = Array.isArray(msg.n) ? msg.n.map(Number) : [];
    const p = Array.isArray(msg.p) ? msg.p.map(Number) : [];
    if (![x, y, z, item].every(Number.isInteger) || !Number.isFinite(yaw) || n.length !== 3 || p.length !== 3) return;
    if (!n.every((v) => v === -1 || v === 0 || v === 1) || Math.abs(n[0]) + Math.abs(n[1]) + Math.abs(n[2]) !== 1) return;
    if (!p.every(Number.isFinite) || Math.abs(p[0] - x - 0.5) > 1 || Math.abs(p[1] - y - 0.5) > 1 || Math.abs(p[2] - z - 0.5) > 1) return;
    if (Math.abs(x) > WORLD_LIMIT || Math.abs(z) > WORLD_LIMIT || y < 0 || y >= WORLD_HEIGHT) return;
    // Deshacer la predicción del cliente en las celdas que pudo tocar.
    const undo = (): void => {
      const cells = [[0, 0, 0], [n[0], n[1], n[2]], [n[0], n[1] + 1, n[2]]];
      for (let d = 0; d < 4; d++) cells.push([n[0] + [0, 1, 0, -1][d], n[1], n[2] + [-1, 0, 1, 0][d]]);
      for (const [dx, dy, dz] of cells) this.reject(s, x + dx, y + dy, z + dz);
    };
    if (!isValidBlockId(item) || ITEMS[item]?.block !== item || BLOCK_FLUID[item] || item === BEDROCK) {
      undo();
      return;
    }
    if (!this.allow(s, 1) || s.s & STATE_DEAD || !this.reachOk(s, x, y, z, 8)) {
      undo();
      return;
    }
    this.world.ensureChunk(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE), this.now());
    const hitId = this.world.getBlock(x, y, z);
    if (hitId < 0) return;
    const get = (bx: number, by: number, bz: number) => this.world.getBlock(bx, by, bz);
    const edits = planPlacement(get, { x, y, z, nx: n[0], ny: n[1], nz: n[2], px: p[0], py: p[1], pz: p[2], id: hitId }, item, yaw);
    if (!edits) {
      undo();
      return;
    }
    this.actor = s.id;
    try {
      this.applyEdits(edits);
    } finally {
      this.actor = null;
    }
  }

  private onUse(s: Session, msg: Extract<ClientMsg, { t: 'use' }>): void {
    const x = Number(msg.x), y = Number(msg.y), z = Number(msg.z), yaw = Number(msg.yaw);
    if (![x, y, z].every(Number.isInteger) || !Number.isFinite(yaw) || s.s & STATE_DEAD || !this.reachOk(s, x, y, z, 8)) return;
    const id = this.world.getBlock(x, y, z);
    if (id < 0) return;
    if (!isUsable(id)) {
      this.reject(s, x, y, z);
      return;
    }
    if (isBed(id)) {
      this.trySleep(s, x, y, z, id);
      return;
    }
    const edits = toggleEdits((bx, by, bz) => this.world.getBlock(bx, by, bz), x, y, z, yaw);
    if (!edits) return;
    this.actor = s.id;
    try {
      this.applyEdits(edits);
    } finally {
      this.actor = null;
    }
  }

  // ------------------------------------------------------------------ camas

  private trySleep(s: Session, x: number, y: number, z: number, id: number): void {
    // Siempre se duerme en los pies de la cama.
    const st = stateProps(id)!;
    const foot: [number, number, number] = st.part === 0 ? [x, y, z] : (partnerOf(x, y, z, id) as [number, number, number]);
    const fail = (m: string) => this.send(s, { t: 'sleep', ok: false, m });
    const footId = this.world.getBlock(foot[0], foot[1], foot[2]);
    if (!isBed(footId)) return fail('La cama está rota.');
    if (s.sleeping !== null) return;
    // Punto de reaparición: al usar la cama, aunque no se pueda dormir (como en Minecraft).
    const same = s.bed && s.bed[0] === foot[0] && s.bed[1] === foot[1] && s.bed[2] === foot[2];
    if (!same) {
      s.bed = foot;
      this.savePlayer(s);
      this.send(s, { t: 'spawn', p: foot });
      this.send(s, { t: 'chat', id: null, name: '', m: 'Punto de reaparición establecido.' });
    }
    if (!canSleepAt(this.worldTime())) return fail('Sólo puedes dormir de noche.');
    const key = posKey(foot[0], foot[1], foot[2]);
    for (const o of this.sessions.values()) if (o !== s && o.sleeping === key) return fail('Esta cama está ocupada.');
    if (s.mode !== 'c') {
      for (const e of this.entities.list.values()) {
        const def = MOBS[e.type];
        if (!def || !def.hostile || e.dead) continue;
        if (Math.abs(e.x - (foot[0] + 0.5)) <= 8 && Math.abs(e.z - (foot[2] + 0.5)) <= 8 && Math.abs(e.y - foot[1]) <= 5) {
          return fail('No puedes descansar ahora: hay monstruos cerca.');
        }
      }
    }
    s.sleeping = key;
    s.sleepTicks = 0;
    s.s |= STATE_SLEEP;
    this.send(s, { t: 'sleep', ok: true, p: [foot[0] + 0.5, foot[1] + 0.5625, foot[2] + 0.5], f: stateProps(footId)!.facing });
    const n = this.playerCount;
    let sleeping = 0;
    for (const o of this.sessions.values()) if (o.joined && o.sleeping !== null) sleeping++;
    if (n > 1) this.broadcast({ t: 'chat', id: null, name: '', m: `${s.name} se fue a dormir (${sleeping}/${n}).` });
  }

  /** Levanta a un jugador de la cama. */
  private wake(s: Session, notify = false): void {
    if (s.sleeping === null) return;
    s.sleeping = null;
    s.sleepTicks = 0;
    s.s &= ~STATE_SLEEP;
    if (notify) this.send(s, { t: 'wake' });
  }

  /** Si todos los jugadores vivos duermen desde hace 5 s, se hace de día. */
  private tickSleep(): void {
    let any = false, all = true;
    const night = canSleepAt(this.worldTime());
    for (const s of this.sessions.values()) {
      if (!s.joined || s.s & STATE_DEAD) continue;
      if (s.sleeping === null) {
        all = false;
        continue;
      }
      if (!night || !isBed(this.world.getBlock(keyX(s.sleeping), keyY(s.sleeping), keyZ(s.sleeping)))) {
        this.wake(s, true);
        all = false;
        continue;
      }
      any = true;
      s.sleepTicks++;
      if (s.sleepTicks < SLEEP_TICKS) all = false;
    }
    if (!any || !all) return;
    this.setTime(Math.floor(this.worldTime()) + 1.01);
    for (const s of this.sessions.values()) this.wake(s, true);
    this.broadcast({ t: 'chat', id: null, name: '', m: 'Amaneció. ¡Buenos días!' });
  }

  // ------------------------------------------------------------------ cambios de bloques

  private onBlockChanged(x: number, y: number, z: number, old: number, id: number): void {
    this.queue.push([x, y, z, id, this.actor]);
    this.fluids.onBlockChanged(this.fluidWorld, x, y, z);
    // Contenedores destruidos: soltar su contenido.
    if (isContainer(old) && !isContainer(id)) this.destroyContainer(x, y, z);
    // Troncos quitados: las hojas sin tronco cercano se caerán.
    if (LOGS.has(old) && !LOGS.has(id)) this.scheduleLeafDecay(x, y, z);
    // Camas rotas: ya no sirven para reaparecer.
    if (isBed(old) && !isBed(id)) {
      const p = partnerOf(x, y, z, old);
      for (const s of this.sessions.values()) {
        if (!s.bed) continue;
        const atFoot = s.bed[0] === x && s.bed[1] === y && s.bed[2] === z;
        const atHead = !!p && s.bed[0] === p[0] && s.bed[1] === p[1] && s.bed[2] === p[2];
        if (atFoot || atHead) {
          s.bed = null;
          this.savePlayer(s);
          this.send(s, { t: 'spawn', p: null });
        }
      }
    }
    if (this.supportBatch) this.supportBatch.push([x, y, z]);
    else this.checkSupport(x, y, z, id);
    // Arena y grava caen.
    const above = this.world.getBlock(x, y + 1, z);
    if (above > 0 && isFalling(above) && fallsThrough(id)) this.startFall(x, y + 1, z, above);
    if (isFalling(id)) {
      const below = this.world.getBlock(x, y - 1, z);
      if (below >= 0 && fallsThrough(below)) this.startFall(x, y, z, id);
    }
  }

  /** Rompe lo que se quedó sin apoyo alrededor de un cambio en (x, y, z). */
  private checkSupport(x: number, y: number, z: number, id: number): void {
    // Plantas y antorchas de pie encima.
    const above = this.world.getBlock(x, y + 1, z);
    if (above > 0 && needsSupport(above) && !supportOk(above, id)) this.breakWithDrops(x, y + 1, z, above);
    // Este mismo bloque sin apoyo (por ejemplo, colocado por un fluido que arrastra).
    if (id > 0 && needsSupport(id) && !supportOk(id, this.world.getBlock(x, y - 1, z))) this.breakWithDrops(x, y, z, id);
    // Antorchas de pared, escaleras de mano, puertas y camas: la celda y sus seis vecinas.
    for (const [dx, dy, dz] of NEIGHBORS7) {
      const nx = x + dx, ny = y + dy, nz = z + dz;
      const n = this.world.getBlock(nx, ny, nz);
      if (n <= 0 || !BLOCK_NEEDS_SUPPORT[n]) continue;
      if (!blockSupported(n, (ax, ay, az) => this.world.getBlock(nx + ax, ny + ay, nz + az))) this.breakWithDrops(nx, ny, nz, n);
    }
  }

  private breakWithDrops(x: number, y: number, z: number, id: number): void {
    this.world.setBlock(x, y, z, AIR);
    if (!this.silentDrops) this.entities.dropStacks(blockDrops(id, 0, this.rand), x + 0.5, y + 0.3, z + 0.5);
  }

  private startFall(x: number, y: number, z: number, id: number): void {
    this.world.setBlock(x, y, z, AIR);
    this.entities.spawnFalling(id, x + 0.5, y, z + 0.5);
  }

  private scheduleLeafDecay(x: number, y: number, z: number): void {
    const R = 4;
    for (let dy = -R; dy <= R; dy++) {
      for (let dz = -R; dz <= R; dz++) {
        for (let dx = -R; dx <= R; dx++) {
          const id = this.world.getBlock(x + dx, y + dy, z + dz);
          if (!LEAVES.has(id)) continue;
          const k = posKey(x + dx, y + dy, z + dz);
          if (this.decay.has(k)) continue;
          if (!this.logNearby(x + dx, y + dy, z + dz)) this.decay.set(k, this.tickCount + 10 + Math.floor(this.rand() * 200));
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
          const id = this.world.getBlock(nx, ny, nz);
          if (id < 0 || LOGS.has(id)) return true; // sin cargar: prudencia
          if (LEAVES.has(id)) next.push([nx, ny, nz]);
        }
      }
      frontier = next;
    }
    return false;
  }

  // ------------------------------------------------------------------ contenedores

  private containerAt(x: number, y: number, z: number): ContainerState | null {
    const id = this.world.getBlock(x, y, z);
    if (!isContainer(id)) return null;
    const k = posKey(x, y, z);
    let c = this.containers.get(k);
    const kind = isChest(id) ? 'chest' : 'furnace';
    if (!c || c.kind !== kind) {
      c = newContainer(kind);
      this.containers.set(k, c);
    }
    return c;
  }

  private destroyContainer(x: number, y: number, z: number): void {
    const k = posKey(x, y, z);
    const c = this.containers.get(k);
    if (!c) return;
    this.containers.delete(k);
    this.dirtyContainers.add(k);
    this.entities.dropStacks(c.slots.filter((s): s is ItemStack => !!s), x + 0.5, y + 0.5, z + 0.5);
    for (const s of this.sessions.values()) {
      if (s.container === k) {
        s.container = null;
        this.send(s, { t: 'cclose' });
      }
    }
  }

  private sendContainer(k: number, c: ContainerState, only?: Session): void {
    const msg: ServerMsg = { t: 'cont', x: keyX(k), y: keyY(k), z: keyZ(k), c: containerToWire(c) };
    if (only) {
      this.send(only, msg);
      return;
    }
    const data = JSON.stringify(msg);
    for (const s of this.sessions.values()) if (s.container === k) this.sendRaw(s, data);
  }

  private onOpen(s: Session, msg: Extract<ClientMsg, { t: 'open' }>): void {
    const x = Number(msg.x), y = Number(msg.y), z = Number(msg.z);
    if (![x, y, z].every(Number.isInteger) || !this.reachOk(s, x, y, z, 8)) return;
    const c = this.containerAt(x, y, z);
    if (!c) {
      this.send(s, { t: 'cclose' });
      return;
    }
    const k = posKey(x, y, z);
    s.container = k;
    this.sendContainer(k, c, s);
  }

  private onContainerOp(s: Session, msg: Extract<ClientMsg, { t: 'cclick' | 'cput' | 'ctake' }>): void {
    const x = Number(msg.x), y = Number(msg.y), z = Number(msg.z);
    const q = Number(msg.q) || 0;
    if (![x, y, z].every(Number.isInteger)) return;
    const k = posKey(x, y, z);
    const c = s.container === k && this.allow(s, 1) ? this.containerAt(x, y, z) : null;
    if (!c) {
      // Contenedor cerrado o destruido: devolver al jugador lo que ofrecía.
      if (msg.t === 'cclick') this.send(s, { t: 'cres', q, cur: sanitizeStack(msg.cur) });
      else if (msg.t === 'cput') this.send(s, { t: 'cres', q, give: sanitizeStack(msg.stack) });
      else this.send(s, { t: 'cres', q, give: null });
      this.send(s, { t: 'cclose' });
      return;
    }
    if (msg.t === 'cclick') {
      const slot = Number(msg.slot), btn = Number(msg.btn) === 1 ? 1 : 0;
      const cur = sanitizeStack(msg.cur);
      const out = Number.isInteger(slot) ? clickSlot(c, slot, btn, cur) : cur;
      this.send(s, { t: 'cres', q, cur: out });
    } else if (msg.t === 'cput') {
      this.send(s, { t: 'cres', q, give: insertStack(c, sanitizeStack(msg.stack)) });
    } else {
      const slot = Number(msg.slot), max = Math.max(0, Math.min(64, Number(msg.max) | 0));
      this.send(s, { t: 'cres', q, give: Number.isInteger(slot) && slot >= 0 && slot < c.slots.length ? takeFromSlot(c, slot, max) : null });
    }
    this.dirtyContainers.add(k);
    this.sendContainer(k, c);
  }

  private tickFurnaces(dt: number): void {
    for (const [k, c] of this.containers) {
      if (c.kind !== 'furnace') continue;
      const x = keyX(k), y = keyY(k), z = keyZ(k);
      const id = this.world.getBlock(x, y, z);
      if (id < 0 || !isFurnace(id)) continue;
      const active = c.burn > 0 || c.slots[0] !== null;
      if (!active) continue;
      const res = furnaceTick(c, dt);
      if (res.changed) this.dirtyContainers.add(k);
      const lit = id >= FURNACE_LIT;
      if (res.lit !== lit) {
        const f = Math.max(0, blockFacing(id));
        this.world.setBlock(x, y, z, (res.lit ? FURNACE_LIT : FURNACE) + f);
      }
      if (res.changed || c.burn > 0) this.sendContainer(k, c);
    }
  }

  // ------------------------------------------------------------------ combate y objetos

  private onAttack(s: Session, msg: Extract<ClientMsg, { t: 'attack' }>): void {
    if (s.s & STATE_DEAD) return;
    const e = this.entities.list.get(Number(msg.e));
    if (!e || !e.ai || e.dead) return;
    const reach = this.local ? 8 : 6;
    const dx = e.x - s.p[0], dy = e.y + e.height / 2 - (s.p[1] + 1.6), dz = e.z - s.p[2];
    if (dx * dx + dy * dy + dz * dz > reach * reach) return;
    const now = this.now();
    // Enfriamiento del ataque (como en Minecraft 1.9+): golpes seguidos hacen menos daño.
    const charge = Math.min(1, (now - s.lastAttack) / 625);
    s.lastAttack = now;
    const item = Number(msg.item);
    const tool = Number.isInteger(item) && item > 0 ? ITEMS[item]?.tool : undefined;
    let dmg = tool ? tool.damage : 1;
    dmg *= 0.2 + 0.8 * charge * charge;
    if (msg.crit && charge > 0.9) dmg *= 1.5;
    this.entities.damage(e, Math.max(0.5, dmg), s.p[0], s.p[2], s.id, tool?.kind === 'sword' ? 1.2 : 1);
  }

  private onPickup(s: Session, id: number): void {
    if (s.s & STATE_DEAD || !Number.isInteger(id)) return;
    const view: PlayerView = {
      id: s.id, name: s.name, x: s.p[0], y: s.p[1], z: s.p[2], alive: true, creative: s.mode === 'c', lookingAt: -1,
    };
    const stack = this.entities.tryPickup(id, view);
    if (stack) {
      this.collected.set(id, s.id);
      this.send(s, { t: 'picked', e: id, s: stack });
    }
  }

  private onDrop(s: Session, msg: Extract<ClientMsg, { t: 'drop' }>): void {
    if (!Array.isArray(msg.items) || !Array.isArray(msg.p) || msg.items.length > 64) return;
    if (!this.allow(s, 1 + msg.items.length * 0.5)) return;
    const p = msg.p.map(Number);
    if (p.length !== 3 || !p.every(Number.isFinite)) return;
    if (!this.local && Math.hypot(p[0] - s.p[0], p[1] - s.p[1], p[2] - s.p[2]) > 4) return;
    const v = Array.isArray(msg.v) && msg.v.length === 3 && msg.v.map(Number).every(Number.isFinite) ? msg.v.map(Number) : null;
    for (const raw of msg.items) {
      const st = sanitizeStack(raw);
      if (!st) continue;
      if (v) {
        const clampV = (a: number) => Math.max(-12, Math.min(12, a));
        this.entities.spawnItem(st, p[0], p[1], p[2], clampV(v[0]), clampV(v[1]), clampV(v[2]), s.id, 2);
      } else {
        const a = this.rand() * Math.PI * 2, sp = this.rand() * 3;
        this.entities.spawnItem(st, p[0], p[1] + 0.5, p[2], Math.cos(a) * sp, 3 + this.rand() * 2, Math.sin(a) * sp, s.id, 2);
      }
    }
  }

  private onShoot(s: Session, msg: Extract<ClientMsg, { t: 'shoot' }>): void {
    if (s.s & STATE_DEAD || !Array.isArray(msg.p) || !Array.isArray(msg.d)) return;
    const p = msg.p.map(Number), d = msg.d.map(Number);
    const f = Math.max(0, Math.min(1, Number(msg.f) || 0));
    if (p.length !== 3 || d.length !== 3 || ![...p, ...d].every(Number.isFinite) || f < 0.1) return;
    if (!this.local && Math.hypot(p[0] - s.p[0], p[1] - s.p[1] - 1.6, p[2] - s.p[2]) > 3) return;
    const len = Math.hypot(d[0], d[1], d[2]) || 1;
    const speed = 55 * f;
    this.entities.spawnArrow(p[0], p[1], p[2], (d[0] / len) * speed, (d[1] / len) * speed, (d[2] / len) * speed, s.id, 2);
    this.fx('bow', p[0], p[1], p[2], f);
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
    };
    if (Array.isArray(raw.pos) && raw.pos.length === 3 && raw.pos.map(Number).every(Number.isFinite)) {
      save.pos = [r2(Number(raw.pos[0])), r2(Number(raw.pos[1])), r2(Number(raw.pos[2]))];
    }
    if (Array.isArray(raw.rot) && raw.rot.length === 2 && raw.rot.map(Number).every(Number.isFinite)) {
      save.rot = [r2(Number(raw.rot[0])), r2(Number(raw.rot[1]))];
    }
    s.save = save;
    s.saveDirty = true;
  }

  // ------------------------------------------------------------------ chat y comandos

  private onChat(s: Session, raw: unknown): void {
    if (typeof raw !== 'string') return;
    const m = raw.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, MAX_CHAT);
    if (!m || !this.allow(s, 3)) return;
    if (m.startsWith('/')) {
      this.command(s, m);
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

  private command(s: Session, line: string): void {
    const [cmdRaw, ...args] = line.slice(1).split(/\s+/);
    const cmd = cmdRaw.toLowerCase();
    const reply = (m: string) => this.send(s, { t: 'chat', id: null, name: '', m });
    const norm = (v: string) => v.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    switch (cmd) {
      case 'time':
      case 'hora': {
        const sub = norm(args[0] ?? '');
        const val = norm(args[1] ?? args[0] ?? '');
        const presets = new Map<string, number>([
          ['day', 0.05], ['dia', 0.05], ['noon', 0.25], ['mediodia', 0.25], ['sunset', 0.47], ['atardecer', 0.47],
          ['night', 0.55], ['noche', 0.55], ['midnight', 0.75], ['medianoche', 0.75], ['sunrise', 0.98], ['amanecer', 0.98],
        ]);
        const now = this.worldTime();
        const day = Math.floor(now);
        let target: number | null = null;
        if (presets.has(val)) target = presets.get(val)!;
        else if (/^\d+(\.\d+)?$/.test(val)) target = (Number(val) % 24000) / 24000;
        if (target === null || !Number.isFinite(target) || (sub !== 'set' && !presets.has(sub) && !/^\d/.test(sub))) {
          reply('Uso: /time set <dia|mediodia|atardecer|noche|medianoche|amanecer|0-24000>');
          return;
        }
        this.setTime(day + (target < now - day ? 1 : 0) + target);
        this.broadcast({ t: 'chat', id: null, name: '', m: `${s.name} cambió la hora del día.` });
        return;
      }
      case 'gamemode':
      case 'modo': {
        const v = norm(args[0] ?? '');
        const mode: GameMode | null = ['s', '0', 'survival', 'supervivencia'].includes(v) ? 's'
          : ['c', '1', 'creative', 'creativo'].includes(v) ? 'c' : null;
        if (!mode) {
          reply('Uso: /modo <supervivencia|creativo>');
          return;
        }
        s.mode = mode;
        this.savePlayer(s);
        this.send(s, { t: 'gm', m: mode });
        this.broadcast({ t: 'chat', id: null, name: '', m: `${s.name} pasó al modo ${mode === 's' ? 'supervivencia' : 'creativo'}.` });
        return;
      }
      case 'difficulty':
      case 'dificultad': {
        const v = norm(args[0] ?? '');
        const map: Record<string, number> = {
          pacifico: 0, peaceful: 0, '0': 0, facil: 1, easy: 1, '1': 1, normal: 2, '2': 2, dificil: 3, hard: 3, '3': 3,
        };
        if (!(v in map)) {
          reply('Uso: /dificultad <pacifico|facil|normal|dificil>');
          return;
        }
        this.difficulty = map[v];
        this.store.setMeta('difficulty', String(this.difficulty));
        this.broadcast({ t: 'diff', d: this.difficulty });
        const names = ['pacífica', 'fácil', 'normal', 'difícil'];
        this.broadcast({ t: 'chat', id: null, name: '', m: `Dificultad: ${names[this.difficulty]}.` });
        return;
      }
      case 'kill':
      case 'matar':
        this.send(s, { t: 'hurt', a: 1000, k: [0, 0, 0], c: 'kill' });
        return;
      case 'summon':
      case 'invocar': {
        const v = norm(args[0] ?? '');
        const def = MOB_TYPES.map((t) => MOBS[t]).find((m) => m.key === v || norm(m.name) === v);
        if (!def) {
          reply('Uso: /invocar <' + MOB_TYPES.map((t) => norm(MOBS[t].name)).join('|') + '>');
          return;
        }
        // Delante del jugador, en el primer hueco donde quepa de pie.
        const a = s.r[0];
        const tx = Math.floor(s.p[0] - Math.sin(a) * 3), tz = Math.floor(s.p[2] - Math.cos(a) * 3);
        this.world.ensureChunk(Math.floor(tx / 16), Math.floor(tz / 16), this.now());
        const h = Math.ceil(def.height);
        let y = Math.floor(s.p[1]);
        let found = false;
        for (let dy = 0; dy <= 12 && !found; dy++) {
          for (const cand of [y + dy, y - dy]) {
            if (standable(this.world, tx, cand, tz, h)) {
              y = cand;
              found = true;
              break;
            }
          }
        }
        if (found) this.entities.spawnMob(def.id, tx + 0.5, y, tz + 0.5);
        else this.entities.spawnMob(def.id, s.p[0], s.p[1] + 0.1, s.p[2]);
        return;
      }
      case 'give':
      case 'dar': {
        const v = norm(args[0] ?? '');
        const item = ITEMS.find((it) => it && (it.key === v || norm(it.name) === v.replace(/_/g, ' ')));
        if (!item) {
          reply('Uso: /dar <objeto> [cantidad] (por ejemplo: /dar diamond 5, /dar iron_pickaxe)');
          return;
        }
        let n = Math.max(1, Math.min(64 * 9, Number(args[1]) || 1));
        while (n > 0) {
          const c = Math.min(n, maxStack(item.id));
          this.entities.spawnItem({ id: item.id, count: c }, s.p[0], s.p[1] + 0.5, s.p[2], 0, 0, 0, undefined, 0);
          n -= c;
        }
        return;
      }
      case 'seed':
      case 'semilla':
        reply(`Semilla del mundo: ${this.seed}`);
        return;
      case 'list':
      case 'lista':
        reply('Jugadores: ' + [...this.sessions.values()].filter((o) => o.joined).map((o) => o.name).join(', '));
        return;
      case 'help':
      case 'ayuda':
        reply(
          'Comandos: /modo <supervivencia|creativo>, /dificultad <pacifico|facil|normal|dificil>, ' +
          '/time set <dia|noche|...>, /invocar <criatura>, /dar <objeto> [n], /matar, /seed, /lista, /tp <jugador>',
        );
        return;
      default:
        if (cmd !== 'tp') reply(`Comando desconocido: /${cmdRaw}. Escribe /ayuda.`);
    }
  }

  // ------------------------------------------------------------------ bucle

  /** Avanza un tick (1/20 s). Llamar a 20 Hz mientras haya jugadores. */
  tick(): void {
    this.tickCount++;
    const now = this.now();
    this.loadChunks(now);
    this.fluids.step(this.fluidWorld);
    this.processDecay();
    this.randomTicks();
    this.entities.tick(DT);
    this.tickSleep();
    for (const [id, who] of this.entities.removed) if (!this.collected.has(id)) this.collected.set(id, who);
    this.entities.removed = [];
    if (this.tickCount % 4 === 0) this.tickFurnaces(DT * 4);
    this.flushQueue();
    if (this.tickCount % 2 === 0) this.syncEntities();
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

  private processDecay(): void {
    if (this.decay.size === 0 || this.tickCount % 5 !== 0) return;
    for (const [k, due] of this.decay) {
      if (due > this.tickCount) continue;
      this.decay.delete(k);
      const x = keyX(k), y = keyY(k), z = keyZ(k);
      const id = this.world.getBlock(x, y, z);
      if (!LEAVES.has(id) || this.logNearby(x, y, z)) continue;
      this.world.setBlock(x, y, z, AIR);
      this.entities.dropStacks(leafDecayDrops(id, this.rand), x + 0.5, y + 0.3, z + 0.5);
      this.fx('leaves', x + 0.5, y + 0.5, z + 0.5, id);
    }
  }

  /** Ticks aleatorios: brotes que crecen, hierba que se extiende o muere, cactus y cañas que crecen. */
  private randomTicks(): void {
    const w = this.world;
    const chunks = this.loadedNearPlayers();
    for (const c of chunks) {
      for (let k = 0; k < RANDOM_TICKS_PER_CHUNK; k++) {
        const idx = (this.rand() * 65536) | 0;
        const id = c.blocks[idx];
        if (id === AIR) continue;
        const x = c.cx * 16 + (idx & 15), y = idx >> 8, z = c.cz * 16 + ((idx >> 4) & 15);
        if (SAPLINGS.has(id)) {
          this.growTree(x, y, z, SAPLINGS.get(id)!);
        } else if (id === GRASS || id === SNOWY_GRASS) {
          const above = w.getBlock(x, y + 1, z);
          if (above > 0 && (BLOCK_OPAQUE[above] || BLOCK_FLUID[above])) {
            w.setBlock(x, y, z, DIRT);
            continue;
          }
          for (let t = 0; t < 2; t++) {
            const nx = x + ((this.rand() * 3) | 0) - 1, ny = y + ((this.rand() * 5) | 0) - 3, nz = z + ((this.rand() * 3) | 0) - 1;
            if (w.getBlock(nx, ny, nz) !== DIRT) continue;
            const up = w.getBlock(nx, ny + 1, nz);
            if (up < 0 || BLOCK_OPAQUE[up] || BLOCK_FLUID[up]) continue;
            // Sólo a la luz: cielo abierto encima o bajo la copa de un árbol.
            const top = w.skyTop(nx, nz);
            if (top <= ny + 1 || LEAVES.has(w.getBlock(nx, top, nz))) w.setBlock(nx, ny, nz, GRASS);
          }
        } else if (id === CACTUS || id === SUGAR_CANE) {
          if (w.getBlock(x, y + 1, z) !== AIR || this.rand() > 0.25) continue;
          let h = 1;
          while (h < 3 && w.getBlock(x, y - h, z) === id) h++;
          if (h < 3) w.setBlock(x, y + 1, z, id);
        }
      }
    }
  }

  private loadedNearPlayers(): { cx: number; cz: number; blocks: Uint16Array }[] {
    const out: { cx: number; cz: number; blocks: Uint16Array }[] = [];
    const seen = new Set<string>();
    for (const s of this.sessions.values()) {
      if (!s.joined) continue;
      const pcx = Math.floor(s.p[0] / CHUNK_SIZE), pcz = Math.floor(s.p[2] / CHUNK_SIZE);
      for (let dz = -SIM_RADIUS; dz <= SIM_RADIUS; dz++) {
        for (let dx = -SIM_RADIUS; dx <= SIM_RADIUS; dx++) {
          const key = (pcx + dx) + ',' + (pcz + dz);
          if (seen.has(key)) continue;
          seen.add(key);
          const c = this.world.getChunk(pcx + dx, pcz + dz);
          if (c) out.push(c);
        }
      }
    }
    return out;
  }

  /** Hace crecer un árbol desde un brote si hay sitio. */
  private growTree(x: number, y: number, z: number, kind: number): void {
    const w = this.world;
    const below = w.getBlock(x, y - 1, z);
    if (!SOIL.has(below)) return;
    const need = kind === 2 ? 10 : 7;
    for (let k = 1; k <= need; k++) {
      const b = w.getBlock(x, y + k, z);
      if (b < 0 || (b !== AIR && !LEAVES.has(b) && BLOCK_RENDER[b] !== R_CROSS)) return;
    }
    const r = this.rand();
    w.setBlock(x, y, z, AIR);
    this.world.gen.growTree(kind, x, y, z, r, (bx, by, bz, id, force) => {
      if (by <= 0 || by >= WORLD_HEIGHT) return;
      const cur = w.getBlock(bx, by, bz);
      if (cur < 0) return;
      if (cur === AIR || (force && (LEAVES.has(cur) || BLOCK_RENDER[cur] === R_CROSS || BLOCK_REPLACEABLE[cur]))) {
        w.setBlock(bx, by, bz, id);
      }
    });
    if (w.getBlock(x, y - 1, z) === GRASS) w.setBlock(x, y - 1, z, DIRT);
  }

  // ------------------------------------------------------------------ sincronización de entidades

  private entityKey(e: Entity): string {
    return `${r2(e.x)},${r2(e.y)},${r2(e.z)},${r2(e.yaw)},${r2(e.bodyYaw)},${r2(e.pitch)},${e.flags},${e.stack?.count ?? 0}`;
  }

  private syncEntities(): void {
    const removedInfo = this.collected;
    for (const s of this.sessions.values()) {
      if (!s.joined) continue;
      const add: number[][] = [], upd: number[][] = [], rm: (number | [number, string])[] = [];
      const seen = new Set<number>();
      for (const e of this.entities.list.values()) {
        const dx = e.x - s.p[0], dz = e.z - s.p[2];
        if (dx * dx + dz * dz > ENTITY_RANGE * ENTITY_RANGE) continue;
        seen.add(e.id);
        const key = this.entityKey(e);
        const prev = s.known.get(e.id);
        if (prev === key) continue;
        s.known.set(e.id, key);
        if (prev === undefined) {
          const rec = [e.id, e.type, r2(e.x), r2(e.y), r2(e.z), r2(e.yaw), r2(e.bodyYaw), r2(e.pitch), e.flags];
          if (e.type === ENT_ITEM && e.stack) rec.push(e.stack.id, e.stack.count);
          else if (e.type === ENT_FALLING) rec.push(e.block ?? 0);
          else if (e.ai) rec.push(Math.round(e.health));
          add.push(rec);
        } else {
          const rec = [e.id, r2(e.x), r2(e.y), r2(e.z), r2(e.yaw), r2(e.bodyYaw), r2(e.pitch), e.flags];
          if (e.type === ENT_ITEM && e.stack) rec.push(e.stack.count);
          upd.push(rec);
        }
      }
      for (const id of s.known.keys()) {
        if (seen.has(id)) continue;
        s.known.delete(id);
        const who = removedInfo.get(id);
        rm.push(who ? [id, who] : id);
      }
      if (add.length || upd.length || rm.length) {
        const msg: ServerMsg = { t: 'ents' };
        if (add.length) msg.a = add;
        if (upd.length) msg.u = upd;
        if (rm.length) msg.rm = rm;
        this.send(s, msg);
      }
    }
    removedInfo.clear();
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
    for (const k of this.dirtyContainers) {
      const c = this.containers.get(k);
      this.store.saveContainer(k, c ? JSON.stringify(containerToWire(c)) : null);
    }
    this.dirtyContainers.clear();
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
      containers: this.containers.size, players: this.playerCount,
    };
  }
}
