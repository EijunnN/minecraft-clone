// Fase 7 (redstone): motor de la redstone del servidor. Implementa la RedstoneApi que usan los
// componentes (shared/redstone): nada recorre el mundo; todo va por avisos locales y ticks programados.
// - Avisos a vecinos: cada cambio de bloque avisa a sus seis vecinos (y, si es un emisor, a los vecinos
//   de los bloques que conducen a su lado); se atienden en cola, sin recursión, con un tope por tick.
// - Polvo: la red se resuelve entera de una vez (wire.ts) y no se vuelve a resolver mientras no cambie
//   nada que no sea la potencia de otro polvo.
// - Ticks programados: montón ordenado por (tick, prioridad, orden de llegada), como en Minecraft; uno
//   por posición. Retardos de antorchas, repetidores, comparadores, botones, placas…
// - Pisadas: cada tick se miran las celdas que tocan los pies de jugadores y entidades (placas, cuerda
//   y mena de redstone); proyectiles (diana, botones de madera) y rayos (pararrayos) llegan por avisos.
// - Periódicos: los sensores de luz solar (y lo que registren otros) se apuntan al cargar su chunk.
// Los cambios viajan a los clientes como cualquier cambio de bloque.
import {
  familyBase, BLOCK_COUNT, isLightningRod, rodWith, isTrappedChest, isWire, isWoodenButton, isLitRedstoneOre, redstoneOreLit,
  isTripwire, tripwireWith, tripwirePowered, tripwireAttached,
} from '../../blocks';
import {
  FACE_X, FACE_Y, FACE_Z, emitterOf, neighborHandlers, tickHandler, analogReader, changeHandlers, steppedHandler,
  projectileHandler, useHandler, periodicOf, isConductor, bestNeighborSignal, hasNeighborSignal, signalFrom, strongInto,
  solveWireNetwork, arrowOnButton, type RedstoneApi, type EntityFilter, type ProjectileKind,
} from '../../redstone';
import { MAX_BLOCK_ID, CHUNK_SIZE, CHUNK_VOLUME, indexY } from '../../constants';
import { rainAt, thunderAt } from '../../weather';
import { ENT_ARROW, ENT_DISPLAY } from '../../mobs';
import { ENT_TRIDENT } from '../../equipment';
import { isHangingType } from '../../paintings';
import { ENT_ARMOR_STAND } from '../../armorStands';
import { ITEMS, type ItemStack } from '../../items';
import { STATE_DEAD } from '../../protocol';
import { posKey, keyX, keyY, keyZ } from '../posKey';
import type { SimChunk } from '../WorldSim';
import type { Nature } from './nature';
import type { ServerContext } from './context';

/** Avisos a vecinos que se atienden como mucho por tick (el resto, al siguiente). */
const MAX_UPDATES_PER_TICK = 200_000;
/** Ticks programados que se ejecutan como mucho por tick (el de Minecraft). */
const MAX_TICKS_PER_TICK = 65_536;
/** Radio en el que un pararrayos atrae los rayos. */
const ROD_RANGE = 128;

interface Scheduled {
  key: number;
  x: number;
  y: number;
  z: number;
  base: number;
  due: number;
  prio: number;
  seq: number;
}

const before = (a: Scheduled, b: Scheduled) => a.due - b.due || a.prio - b.prio || a.seq - b.seq;

/** Lo que el motor necesita de otros sistemas del servidor (contenedores, atriles, tocadiscos, marcos). */
export interface RedstoneHooks {
  slots(x: number, y: number, z: number): readonly (ItemStack | null)[] | null;
  viewers(x: number, y: number, z: number): number;
  lecternBook(x: number, y: number, z: number): ItemStack | null;
  jukeboxDisc(x: number, y: number, z: number): number;
  frameSignal(x: number, y: number, z: number): number;
}

export class Redstone implements RedstoneApi {
  hooks: RedstoneHooks | null = null;
  /** Montón de ticks programados y el pendiente de cada posición. */
  private heap: Scheduled[] = [];
  private pending = new Map<number, Scheduled>();
  private seq = 0;
  /** Dato por posición (salida de comparadores, mirones de cofres trampa, potencia recibida por puertas…). */
  private data = new Map<number, number>();
  /** Cola de avisos: x, y, z y la posición que los provocó. */
  private queue: number[] = [];
  private head = 0;
  /** Redes de polvo resueltas en la «época» actual (cambia con cualquier cambio que no sea de potencia de polvo). */
  private solved = new Map<number, number>();
  private epoch = 0;
  /** Posiciones con algo periódico (por periodo) y pararrayos. */
  private periodic = new Map<number, Set<number>>();
  readonly rods = new Set<number>();
  /** Tablas por id: 1 si tiene aviso de cambio (para revisar al cargar un chunk); 1 si se pisa. */
  private readonly onLoad = new Uint8Array(MAX_BLOCK_ID);
  private readonly steps = new Uint8Array(MAX_BLOCK_ID);
  private stepSeen = new Set<number>();
  private stepList: number[] = [];
  /** Estadística para las pruebas: avisos atendidos en total. */
  updates = 0;

  constructor(private ctx: ServerContext, nature: Nature) {
    for (let id = 1; id < BLOCK_COUNT; id++) {
      if (changeHandlers(id) || periodicOf(id) || isLightningRod(id)) this.onLoad[id] = 1;
      if (steppedHandler(id)) this.steps[id] = 1;
    }
    // La mena de redstone encendida se apaga sola con los ticks aleatorios.
    nature.addRandomTickHandler((id, x, y, z) => {
      if (!isLitRedstoneOre(id)) return false;
      this.ctx.world.setBlock(x, y, z, redstoneOreLit(id, false));
      return true;
    });
  }

  // ------------------------------------------------------------------ RedstoneApi

  get gameTick(): number {
    return this.ctx.tickCount;
  }

  getBlock(x: number, y: number, z: number): number {
    return this.ctx.world.getBlock(x, y, z);
  }

  setBlock(x: number, y: number, z: number, id: number): void {
    this.ctx.world.setBlock(x, y, z, id);
  }

  getData(x: number, y: number, z: number): number {
    return this.data.get(posKey(x, y, z)) ?? 0;
  }

  setData(x: number, y: number, z: number, value: number): void {
    if (value === 0) this.data.delete(posKey(x, y, z));
    else this.data.set(posKey(x, y, z), value);
  }

  power(x: number, y: number, z: number): number {
    return bestNeighborSignal(this, x, y, z);
  }

  isPowered(x: number, y: number, z: number): boolean {
    return hasNeighborSignal(this, x, y, z);
  }

  powerFrom(x: number, y: number, z: number, face: number): number {
    return signalFrom(this, x, y, z, face);
  }

  strongPower(x: number, y: number, z: number): number {
    return strongInto(this, x, y, z);
  }

  schedule(x: number, y: number, z: number, delay: number, priority = 0): void {
    const key = posKey(x, y, z);
    if (this.pending.has(key)) return;
    const id = this.getBlock(x, y, z);
    if (id <= 0) return;
    const e: Scheduled = { key, x, y, z, base: familyBase(id), due: this.gameTick + Math.max(1, delay | 0), prio: priority, seq: this.seq++ };
    this.pending.set(key, e);
    this.push(e);
  }

  isScheduled(x: number, y: number, z: number): boolean {
    return this.pending.has(posKey(x, y, z));
  }

  willTickNow(x: number, y: number, z: number): boolean {
    const e = this.pending.get(posKey(x, y, z));
    return !!e && e.due <= this.gameTick;
  }

  updateAt(x: number, y: number, z: number): void {
    this.enqueue(x, y, z, x, y, z);
  }

  updateNeighbors(x: number, y: number, z: number): void {
    for (let f = 0; f < 6; f++) this.enqueue(x + FACE_X[f], y + FACE_Y[f], z + FACE_Z[f], x, y, z);
  }

  outputChanged(x: number, y: number, z: number): void {
    this.bumpEpoch();
    this.updateNeighbors(x, y, z);
    this.updateThroughConductors(x, y, z);
  }

  analogChanged(x: number, y: number, z: number): void {
    // Comparadores al lado, o a dos bloques con un bloque que conduce entre medias (updateNeighbourForOutputSignal).
    for (let f = 0; f < 6; f++) {
      if (FACE_Y[f] !== 0) continue;
      const ax = x + FACE_X[f], az = z + FACE_Z[f];
      const a = this.getBlock(ax, y, az);
      if (a <= 0) continue;
      if (neighborHandlers(a)) this.enqueue(ax, y, az, x, y, z);
      else if (isConductor(a)) this.enqueue(ax + FACE_X[f], y, az + FACE_Z[f], x, y, z);
    }
  }

  analog(x: number, y: number, z: number): number {
    const id = this.getBlock(x, y, z);
    const r = analogReader(id);
    return r ? r(this, x, y, z, id) : -1;
  }

  countEntities(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, filter: EntityFilter): number {
    let n = 0;
    if (filter !== 'arrows') {
      for (const s of this.ctx.sessions()) {
        if (!s.joined || s.s & STATE_DEAD) continue;
        const [px, py, pz] = s.p;
        if (px + 0.3 > x0 && px - 0.3 < x1 && py + 1.8 > y0 && py < y1 && pz + 0.3 > z0 && pz - 0.3 < z1) n++;
      }
    }
    for (const e of this.ctx.entities.list.values()) {
      if (e.dead || e.type === ENT_DISPLAY || isHangingType(e.type)) continue;
      const arrow = e.type === ENT_ARROW || e.type === ENT_TRIDENT;
      if (filter === 'arrows' ? !arrow : filter === 'living' ? !e.ai && e.type !== ENT_ARMOR_STAND : false) continue;
      const hw = arrow ? 0.05 : e.width / 2;
      if (e.x + hw > x0 && e.x - hw < x1 && e.y + Math.max(0.05, e.height) > y0 && e.y < y1 && e.z + hw > z0 && e.z - hw < z1) n++;
    }
    return n;
  }

  containerSlots(x: number, y: number, z: number): readonly (ItemStack | null)[] | null {
    return this.hooks?.slots(x, y, z) ?? null;
  }

  viewers(x: number, y: number, z: number): number {
    return this.hooks?.viewers(x, y, z) ?? 0;
  }

  lecternBook(x: number, y: number, z: number): ItemStack | null {
    return this.hooks?.lecternBook(x, y, z) ?? null;
  }

  jukeboxDisc(x: number, y: number, z: number): number {
    return this.hooks?.jukeboxDisc(x, y, z) ?? -1;
  }

  frameSignal(x: number, y: number, z: number): number {
    return this.hooks?.frameSignal(x, y, z) ?? -1;
  }

  /**
   * Lectura del sensor de luz solar (updateSignalStrength de Minecraft): luz del cielo en la celda menos
   * lo que oscurecen la noche, la lluvia y la tormenta, y con el sol bajo, menos aún. Invertido, al revés.
   */
  sunlight(x: number, y: number, z: number, inverted: boolean): number {
    const ctx = this.ctx, w = ctx.world;
    // Luz del cielo aproximada: 15 a cielo abierto; 14 si lo tiene un vecino al lado; si no, nada.
    let sky = 0;
    if (w.skyTop(x, z) <= y) sky = 15;
    else if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => w.skyTop(x + dx, z + dz) < y)) sky = 14;
    const t = ctx.worldTime();
    // Ángulo del sol como el de Minecraft: 0 a mediodía (nuestro día empieza al amanecer).
    const celestial = t - 0.25 - Math.floor(t - 0.25);
    const rain = rainAt(t, ctx.seed), thunder = thunderAt(t, ctx.seed);
    let d = 1 - Math.max(0, Math.min(1, Math.cos(celestial * Math.PI * 2) * 2 + 0.5));
    d = 1 - d;
    d *= 1 - (rain * 5) / 16;
    d *= 1 - (thunder * 5) / 16;
    const darken = Math.floor((1 - d) * 11);
    let i = sky - darken;
    let f = celestial * Math.PI * 2;
    if (inverted) i = 15 - i;
    else if (i > 0) {
      const g = f < Math.PI ? 0 : Math.PI * 2;
      f += (g - f) * 0.2;
      i = Math.round(i * Math.cos(f));
    }
    return Math.max(0, Math.min(15, i));
  }

  fx(kind: string, x: number, y: number, z: number, a?: number, b?: number): void {
    this.ctx.fx(kind, x, y, z, a, b);
  }

  rand(): number {
    return this.ctx.rand();
  }

  // ------------------------------------------------------------------ cambios de bloques

  /** Cada cambio de bloque (lo llama GameServer): avisos, redes de polvo y anotaciones. */
  onBlockChanged(x: number, y: number, z: number, old: number, id: number): void {
    const k = posKey(x, y, z);
    const sameFamily = old > 0 && id > 0 && familyBase(old) === familyBase(id);
    if (!sameFamily) this.data.delete(k);
    // Sólo la potencia de un polvo no invalida las redes resueltas.
    if (!(isWire(old) && isWire(id))) this.bumpEpoch();
    const ho = changeHandlers(old), hn = changeHandlers(id);
    if (ho && !sameFamily) for (const h of ho) h(this, x, y, z, old, id);
    if (hn) for (const h of hn) h(this, x, y, z, old, id);
    if (!sameFamily) {
      this.track(x, y, z, old, false);
      this.track(x, y, z, id, true);
    }
    // Avisos: el propio bloque (si escucha), sus vecinos y, si emite, los de los bloques que carga.
    if (id > 0 && (neighborHandlers(id) || isWire(id))) this.enqueue(x, y, z, x, y, z);
    this.updateNeighbors(x, y, z);
    if (emitterOf(old) || emitterOf(id)) this.updateThroughConductors(x, y, z);
    // Polvo quitado: los de los escalones de al lado tienen que recalcular.
    if (isWire(old) && !isWire(id)) {
      for (let f = 0; f < 6; f++) {
        if (FACE_Y[f] !== 0) continue;
        this.enqueue(x + FACE_X[f], y + 1, z + FACE_Z[f], x, y, z);
        this.enqueue(x + FACE_X[f], y - 1, z + FACE_Z[f], x, y, z);
      }
    }
    if (analogReader(old) || analogReader(id)) this.analogChanged(x, y, z);
  }

  /** Apunta (o borra) las posiciones con algo periódico y los pararrayos. */
  private track(x: number, y: number, z: number, id: number, add: boolean): void {
    if (id <= 0) return;
    const k = posKey(x, y, z);
    const p = periodicOf(id);
    if (p) {
      let set = this.periodic.get(p.every);
      if (!set) this.periodic.set(p.every, (set = new Set()));
      if (add) set.add(k);
      else set.delete(k);
    }
    if (isLightningRod(id)) {
      if (add) this.rods.add(k);
      else this.rods.delete(k);
    }
  }

  /** Un chunk recién cargado: sus componentes apuntan lo suyo y reprograman lo que tenían en marcha. */
  onChunkLoaded(c: SimChunk): void {
    const b = c.blocks, table = this.onLoad;
    const ox = c.cx * CHUNK_SIZE, oz = c.cz * CHUNK_SIZE;
    for (let i = 0; i < CHUNK_VOLUME; i++) {
      const id = b[i];
      if (!table[id]) continue;
      const x = ox + (i & 15), y = indexY(i), z = oz + ((i >> 4) & 15);
      this.track(x, y, z, id, true);
      const hs = changeHandlers(id);
      if (hs) for (const h of hs) h(this, x, y, z, 0, id);
    }
  }

  private bumpEpoch(): void {
    this.epoch++;
    if (this.solved.size) this.solved.clear();
  }

  private enqueue(x: number, y: number, z: number, sx: number, sy: number, sz: number): void {
    this.queue.push(x, y, z, sx, sy, sz);
  }

  /** Avisa a los vecinos de los bloques que conducen alrededor de (x, y, z) (la potencia fuerte los atraviesa). */
  private updateThroughConductors(x: number, y: number, z: number): void {
    for (let f = 0; f < 6; f++) {
      const nx = x + FACE_X[f], ny = y + FACE_Y[f], nz = z + FACE_Z[f];
      if (!isConductor(this.getBlock(nx, ny, nz))) continue;
      for (let g = 0; g < 6; g++) {
        if (g === (f ^ 1)) continue;
        this.enqueue(nx + FACE_X[g], ny + FACE_Y[g], nz + FACE_Z[g], nx, ny, nz);
      }
    }
  }

  /** Atiende los avisos pendientes (los que surjan mientras tanto, también). */
  private drain(budget: { n: number }): void {
    const q = this.queue;
    while (this.head < q.length && budget.n > 0) {
      budget.n--;
      const h = this.head;
      this.head += 6;
      const x = q[h], y = q[h + 1], z = q[h + 2];
      const id = this.getBlock(x, y, z);
      if (id <= 0) continue;
      this.updates++;
      if (isWire(id)) {
        if (this.solved.get(posKey(x, y, z)) === this.epoch) continue;
        const epoch = this.epoch;
        solveWireNetwork(this, x, y, z, (key) => this.solved.set(key, epoch));
        continue;
      }
      const hs = neighborHandlers(id);
      if (hs) for (const fn of hs) fn(this, x, y, z, id, q[h + 3], q[h + 4], q[h + 5]);
    }
    if (this.head >= q.length) {
      q.length = 0;
      this.head = 0;
    } else if (this.head > 60_000) {
      this.queue = q.slice(this.head);
      this.head = 0;
    }
  }

  // ------------------------------------------------------------------ montón de ticks

  private push(e: Scheduled): void {
    const h = this.heap;
    h.push(e);
    let i = h.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (before(h[p], h[i]) <= 0) break;
      [h[p], h[i]] = [h[i], h[p]];
      i = p;
    }
  }

  private pop(): Scheduled {
    const h = this.heap;
    const top = h[0];
    const last = h.pop()!;
    if (h.length) {
      h[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < h.length && before(h[l], h[m]) < 0) m = l;
        if (r < h.length && before(h[r], h[m]) < 0) m = r;
        if (m === i) break;
        [h[m], h[i]] = [h[i], h[m]];
        i = m;
      }
    }
    return top;
  }

  /** Ticks pendientes (para las pruebas). */
  get scheduledCount(): number {
    return this.pending.size;
  }

  // ------------------------------------------------------------------ bucle

  /** Un tick del servidor: avisos pendientes, ticks programados, pisadas y periódicos. */
  tick(): void {
    const budget = { n: MAX_UPDATES_PER_TICK };
    this.drain(budget);
    const now = this.gameTick;
    let n = 0;
    while (this.heap.length && this.heap[0].due <= now && n++ < MAX_TICKS_PER_TICK) {
      const e = this.pop();
      this.pending.delete(e.key);
      const id = this.getBlock(e.x, e.y, e.z);
      if (id <= 0 || familyBase(id) !== e.base) continue;
      tickHandler(id)?.(this, e.x, e.y, e.z, id);
      this.drain(budget);
    }
    this.stepping();
    this.drain(budget);
    for (const [every, set] of this.periodic) {
      if (now % every !== 0) continue;
      for (const k of set) {
        const x = keyX(k), y = keyY(k), z = keyZ(k);
        const id = this.getBlock(x, y, z);
        if (id < 0) continue; // sin cargar: se queda apuntado
        const p = periodicOf(id);
        if (!p || p.every !== every) {
          set.delete(k);
          continue;
        }
        p.run(this, x, y, z, id);
      }
      this.drain(budget);
    }
  }

  /** Jugadores y entidades sobre placas, cuerdas y menas de redstone. */
  private stepping(): void {
    this.stepSeen.clear();
    this.stepList.length = 0;
    for (const s of this.ctx.sessions()) {
      if (!s.joined || s.s & STATE_DEAD) continue;
      this.feet(s.p[0], s.p[1], s.p[2], 0.3);
    }
    for (const e of this.ctx.entities.list.values()) {
      if (e.dead || e.type === ENT_DISPLAY || isHangingType(e.type)) continue;
      this.feet(e.x, e.y, e.z, Math.min(0.5, e.width / 2));
    }
    const l = this.stepList;
    for (let i = 0; i < l.length; i += 3) {
      const id = this.getBlock(l[i], l[i + 1], l[i + 2]);
      steppedHandler(id)?.(this, l[i], l[i + 1], l[i + 2], id);
    }
  }

  private feet(px: number, py: number, pz: number, hw: number): void {
    const x0 = Math.floor(px - hw), x1 = Math.floor(px + hw), z0 = Math.floor(pz - hw), z1 = Math.floor(pz + hw);
    const y = Math.floor(py + 0.001);
    // Justo encima de un bloque: también cuenta el de debajo (la mena de redstone).
    const onTop = py - Math.floor(py) < 0.07;
    for (let x = x0; x <= x1; x++) {
      for (let z = z0; z <= z1; z++) {
        this.stepAt(x, y, z);
        if (onTop) this.stepAt(x, y - 1, z);
      }
    }
  }

  private stepAt(x: number, y: number, z: number): void {
    const id = this.getBlock(x, y, z);
    if (id <= 0 || !this.steps[id]) return;
    const k = posKey(x, y, z);
    if (this.stepSeen.has(k)) return;
    this.stepSeen.add(k);
    this.stepList.push(x, y, z);
  }

  // ------------------------------------------------------------------ avisos de otros sistemas

  /** Clic derecho de un jugador sobre un componente: devuelve si lo atendió. */
  use(x: number, y: number, z: number, id: number): boolean {
    const fn = useHandler(id);
    return !!fn && fn(this, x, y, z, id);
  }

  /** Un jugador coloca un bloque contra (x, y, z): si es mena de redstone, se enciende. */
  touch(x: number, y: number, z: number): void {
    const id = this.getBlock(x, y, z);
    const lit = redstoneOreLit(id, true);
    if (lit && lit !== id) this.setBlock(x, y, z, lit);
  }

  /** Antes de romper un bloque: la cuerda cortada con tijeras queda desarmada (no da el pulso). */
  beforeBreak(x: number, y: number, z: number, id: number, tool: number): void {
    if (isTripwire(id) && ITEMS[tool]?.tool?.kind === 'shears') {
      this.setBlock(x, y, z, tripwireWith(tripwirePowered(id), tripwireAttached(id), true));
    }
  }

  /** Un proyectil se clava en (bx, by, bz) desde el punto libre (px, py, pz). */
  projectileHit(kind: ProjectileKind, bx: number, by: number, bz: number, px: number, py: number, pz: number): void {
    const id = this.getBlock(bx, by, bz);
    projectileHandler(id)?.(this, bx, by, bz, id, px, py, pz, kind);
    // Una flecha que se queda en la celda de un botón de madera lo pulsa.
    if (kind !== 'thrown') {
      const cx = Math.floor(px), cy = Math.floor(py), cz = Math.floor(pz);
      const b = this.getBlock(cx, cy, cz);
      if (isWoodenButton(b)) arrowOnButton(this, cx, cy, cz, b);
    }
  }

  /** Cambió quién mira un contenedor: los cofres trampa dan esa potencia. */
  viewersChanged(x: number, y: number, z: number): void {
    if (!isTrappedChest(this.getBlock(x, y, z))) return;
    const n = Math.min(15, this.viewers(x, y, z));
    if (n === this.getData(x, y, z)) return;
    this.setData(x, y, z, n);
    this.outputChanged(x, y, z);
  }

  /**
   * Pararrayos que atrae un rayo que iba a caer en (x, y, z): el más cercano a 128 bloques que esté a
   * cielo abierto. Devuelve el punto de impacto (encima de su punta) o null.
   */
  lightningTarget(x: number, y: number, z: number): [number, number, number] | null {
    let best: [number, number, number] | null = null, bestD = Infinity;
    for (const k of this.rods) {
      const rx = keyX(k), ry = keyY(k), rz = keyZ(k);
      if (Math.abs(rx - x) > ROD_RANGE || Math.abs(rz - z) > ROD_RANGE) continue;
      const id = this.getBlock(rx, ry, rz);
      if (id < 0) continue;
      if (!isLightningRod(id)) {
        this.rods.delete(k);
        continue;
      }
      if (this.ctx.world.skyTop(rx, rz) > ry) continue;
      const d = (rx - x) ** 2 + (ry - y) ** 2 + (rz - z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = [rx + 0.5, ry + 1, rz + 0.5];
      }
    }
    return best;
  }

  /** Cayó un rayo en (x, y, z) (el punto de impacto): si debajo hay un pararrayos, da potencia 8 ticks. */
  lightning(x: number, y: number, z: number): void {
    const bx = Math.floor(x), by = Math.floor(y) - 1, bz = Math.floor(z);
    const id = this.getBlock(bx, by, bz);
    if (!isLightningRod(id)) return;
    this.setBlock(bx, by, bz, rodWith(id, true));
    this.schedule(bx, by, bz, 8);
    this.fx('rod_spark', bx + 0.5, by + 0.5, bz + 0.5);
  }
}
