// Fase 7 (redstone): registro abierto de la redstone. Cada tipo de bloque (por su estado base) puede
// declarar aquí lo que hace con la potencia sin tocar el motor (server/redstone.ts):
// - emisor: cuánta potencia débil y fuerte da hacia cada cara (y si el polvo se une a él);
// - oyente: qué hace cuando cambia algo a su alrededor (la potencia que recibe, un vecino…);
// - tick: qué hace cuando vence un tick programado (repetidores, antorchas, botones…);
// - lectura analógica: lo que lee de él un comparador (lo lleno que está un cofre, un caldero…);
// - uso: qué pasa con el clic derecho (palancas, botones, repetidores…).
// Las funciones son puras sobre la RedstoneApi que reciben: sirven para cualquier servidor (el del
// Durable Object, el del modo un jugador y los de las pruebas). Ver docs/redstone.md.
import { familyBase, BLOCK_OPAQUE, BLOCK_COLLIDE } from '../blocks/registry';
import { MAX_BLOCK_ID } from '../constants';
import type { ItemStack } from '../items';

// ------------------------------------------------------------------ caras

/** Caras en el orden de las texturas de los bloques: 0 +X, 1 −X, 2 +Y, 3 −Y, 4 +Z, 5 −Z. */
export const FACE_X: readonly number[] = [1, -1, 0, 0, 0, 0];
export const FACE_Y: readonly number[] = [0, 0, 1, -1, 0, 0];
export const FACE_Z: readonly number[] = [0, 0, 0, 0, 1, -1];
export const EAST = 0, WEST = 1, UP = 2, DOWN = 3, SOUTH = 4, NORTH = 5;
/** Cara opuesta. */
export const opposite = (face: number): number => face ^ 1;
/** Cara de cada dirección horizontal (0 norte, 1 este, 2 sur, 3 oeste; la de blockModels). */
export const HFACE: readonly number[] = [NORTH, EAST, SOUTH, WEST];
/** Dirección horizontal (0..3) de una cara horizontal; −1 si es vertical. */
export const faceDir = (face: number): number => HFACE.indexOf(face);

// ------------------------------------------------------------------ vista y API del motor

/** Lo mínimo para calcular potencias: bloques del mundo y el dato que guarda el motor por posición. */
export interface RedstoneView {
  /** Id del bloque (−1 si su chunk no está cargado). */
  getBlock(x: number, y: number, z: number): number;
  /** Dato numérico que guarda el motor en una posición (salida de un comparador, mirones de un cofre trampa…); 0 si no hay. */
  getData(x: number, y: number, z: number): number;
}

/** Qué entidades cuenta una placa de presión o un cable trampa. */
export type EntityFilter = 'all' | 'living' | 'arrows';

/**
 * Lo que ofrece el motor de redstone del servidor a los componentes (los de esta fase y los que se
 * enganchen después: pistones, observadores, tolvas, dispensadores, raíles…).
 */
export interface RedstoneApi extends RedstoneView {
  /** Tick de juego actual (20 por segundo). */
  readonly gameTick: number;
  /** Cambia un bloque (se difunde a los clientes y avisa a los vecinos). */
  setBlock(x: number, y: number, z: number, id: number): void;
  setData(x: number, y: number, z: number, value: number): void;
  /** Mayor potencia (0..15) que recibe (x, y, z) de sus seis vecinos (getBestNeighborSignal de Minecraft). */
  power(x: number, y: number, z: number): number;
  /** ¿Recibe (x, y, z) alguna potencia? (hasNeighborSignal de Minecraft). */
  isPowered(x: number, y: number, z: number): boolean;
  /** Potencia que llega a (x, y, z) desde el vecino de la cara `face` (getSignal de Minecraft). */
  powerFrom(x: number, y: number, z: number, face: number): number;
  /** Potencia fuerte que recibe el bloque (x, y, z) de sus vecinos (getDirectSignalTo de Minecraft). */
  strongPower(x: number, y: number, z: number): number;
  /** Programa un tick de redstone dentro de `delay` ticks (si ya hay uno pendiente en esa posición, no hace nada). */
  schedule(x: number, y: number, z: number, delay: number, priority?: number): void;
  /** ¿Hay un tick pendiente en (x, y, z)? */
  isScheduled(x: number, y: number, z: number): boolean;
  /** ¿Vence en este mismo tick un tick pendiente en (x, y, z)? */
  willTickNow(x: number, y: number, z: number): boolean;
  /** Avisa a los seis vecinos de (x, y, z). */
  updateNeighbors(x: number, y: number, z: number): void;
  /**
   * La salida de un emisor en (x, y, z) cambió sin que cambiara su bloque (comparador, cofre trampa):
   * avisa a sus vecinos y a los vecinos de los bloques que alimenta.
   */
  outputChanged(x: number, y: number, z: number): void;
  /** Cambió lo que un comparador leería de (x, y, z) (el contenido de un contenedor): avisa a los comparadores cercanos. */
  analogChanged(x: number, y: number, z: number): void;
  /** Lectura analógica (0..15) del bloque de (x, y, z) para un comparador; −1 si no tiene. */
  analog(x: number, y: number, z: number): number;
  /** Entidades (jugadores incluidos) cuya caja toca la caja dada (coordenadas del mundo). */
  countEntities(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, filter: EntityFilter): number;
  /** Casillas de un contenedor (cofres, hornos…) o null si no hay. */
  containerSlots(x: number, y: number, z: number): readonly (ItemStack | null)[] | null;
  /** Efecto (sonido y partículas) para los jugadores cercanos. */
  fx(kind: string, x: number, y: number, z: number, a?: number, b?: number): void;
  /** Número aleatorio en [0, 1). */
  rand(): number;
}

// ------------------------------------------------------------------ registro

/** Emisor de potencia. `face`: dirección del emisor hacia quien recibe. */
export interface Emitter {
  /** Potencia débil (0..15) hacia `face`: la que alimenta a un componente o al bloque de ese lado. */
  weak(v: RedstoneView, x: number, y: number, z: number, id: number, face: number): number;
  /** Potencia fuerte (0..15) hacia `face`: la que deja cargado al bloque de ese lado (por defecto, 0). */
  strong?(v: RedstoneView, x: number, y: number, z: number, id: number, face: number): number;
  /** ¿Se une el polvo a este bloque? `face`: dirección del bloque hacia el polvo. Por defecto, sí. */
  connects?(id: number, face: number): boolean;
}

/** Algo cambió junto a (x, y, z) (un bloque vecino, la potencia que recibe…). */
export type NeighborHandler = (api: RedstoneApi, x: number, y: number, z: number, id: number) => void;
/** Venció un tick programado en (x, y, z). */
export type TickHandler = (api: RedstoneApi, x: number, y: number, z: number, id: number) => void;
/** Lo que lee un comparador (0..15). */
export type AnalogReader = (api: RedstoneApi, x: number, y: number, z: number, id: number) => number;
/** Clic derecho sobre el bloque en el servidor: devuelve si lo atendió. */
export type UseHandler = (api: RedstoneApi, x: number, y: number, z: number, id: number) => boolean;
/** El bloque aparece o desaparece (old → id); sirve para llevar la cuenta de sensores. */
export type PlacedHandler = (api: RedstoneApi, x: number, y: number, z: number, old: number, id: number) => void;

export interface RedstoneBehavior {
  emitter?: Emitter;
  neighbor?: NeighborHandler;
  tick?: TickHandler;
  analog?: AnalogReader;
  /** Se llama al colocarlo o quitarlo (y al cargar su chunk, con old = 0). */
  placed?: PlacedHandler;
}

const EMITTERS: (Emitter | undefined)[] = [];
const NEIGHBOR: (NeighborHandler[] | undefined)[] = [];
const TICKS: (TickHandler | undefined)[] = [];
const ANALOG: (AnalogReader | undefined)[] = [];
const PLACED: (PlacedHandler[] | undefined)[] = [];
/** Conductores forzados: 1 conduce, 2 no conduce (0: lo decide su forma). */
const CONDUCTOR = new Uint8Array(MAX_BLOCK_ID);
/** Estados base que tienen algún comportamiento (para revisarlos al cargar un chunk). */
const KNOWN = new Uint8Array(MAX_BLOCK_ID);

const bases = (b: number | readonly number[]): readonly number[] => (typeof b === 'number' ? [b] : b);

/**
 * Registra el comportamiento de redstone de uno o varios bloques (sus estados base: la familia entera).
 * Los oyentes y los avisos de colocación se acumulan; emisor, tick y lectura analógica sustituyen al anterior.
 */
export function registerRedstone(base: number | readonly number[], b: RedstoneBehavior): void {
  for (const id of bases(base)) {
    const f = familyBase(id);
    KNOWN[f] = 1;
    if (b.emitter) EMITTERS[f] = b.emitter;
    if (b.neighbor) (NEIGHBOR[f] ??= []).push(b.neighbor);
    if (b.tick) TICKS[f] = b.tick;
    if (b.analog) ANALOG[f] = b.analog;
    if (b.placed) (PLACED[f] ??= []).push(b.placed);
  }
}

/** Fuerza que un bloque conduzca (o no) la potencia, sea cual sea su forma. */
export function setConductor(ids: number | readonly number[], conducts: boolean): void {
  for (const id of bases(ids)) CONDUCTOR[id] = conducts ? 1 : 2;
}

export function emitterOf(id: number): Emitter | undefined {
  return id > 0 ? EMITTERS[familyBase(id)] : undefined;
}
export function neighborHandlers(id: number): readonly NeighborHandler[] | undefined {
  return id > 0 ? NEIGHBOR[familyBase(id)] : undefined;
}
export function tickHandler(id: number): TickHandler | undefined {
  return id > 0 ? TICKS[familyBase(id)] : undefined;
}
export function analogReader(id: number): AnalogReader | undefined {
  return id > 0 ? ANALOG[familyBase(id)] : undefined;
}
export function placedHandlers(id: number): readonly PlacedHandler[] | undefined {
  return id > 0 ? PLACED[familyBase(id)] : undefined;
}
/** ¿Tiene el bloque algún comportamiento de redstone? */
export function hasRedstone(id: number): boolean {
  return id > 0 && KNOWN[familyBase(id)] === 1;
}
/**
 * ¿Conduce el bloque la potencia? (isRedstoneConductor de Minecraft): los cubos sólidos opacos, salvo
 * los que se fuerzan con setConductor (piedra luminosa, bloque de redstone, cofres…).
 */
export function isConductor(id: number): boolean {
  if (id <= 0) return false;
  const o = CONDUCTOR[id];
  if (o) return o === 1;
  return BLOCK_OPAQUE[id] === 1 && BLOCK_COLLIDE[id] === 1;
}

// ------------------------------------------------------------------ usos (clic derecho)

const USES: (UseHandler | undefined)[] = [];

/** Clic derecho sobre el bloque en el servidor (el cliente lo predice con redstoneToggle). */
export function registerUse(base: number | readonly number[], fn: UseHandler): void {
  for (const id of bases(base)) USES[familyBase(id)] = fn;
}
export function useHandler(id: number): UseHandler | undefined {
  return id > 0 ? USES[familyBase(id)] : undefined;
}
