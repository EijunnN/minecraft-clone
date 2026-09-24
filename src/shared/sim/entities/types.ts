// Tipos y constantes compartidos por el gestor de entidades y sus comportamientos.
import type { ItemStack } from '../../items';
import type { Body } from '../physics';
import type { PathNode } from '../pathfind';
import type { WorldSim } from '../WorldSim';

export interface PlayerView {
  id: string;
  name: string;
  x: number;
  y: number;
  z: number;
  alive: boolean;
  creative: boolean;
  /** Entidad a la que mira (para los enderman). */
  lookingAt: number;
  /** Objeto en la mano (los animales siguen a quien lleva su comida). */
  held?: number;
}

export interface EntityHost {
  world: WorldSim;
  players(): PlayerView[];
  /** Altura del sol (-1..1). */
  sunHeight(): number;
  raining(): number;
  /** 0 pacífico, 1 fácil, 2 normal, 3 difícil. */
  difficulty(): number;
  hurtPlayer(id: string, amount: number, kx: number, ky: number, kz: number, cause: string): void;
  /** Efecto puntual para los clientes (sonidos, partículas). */
  fx(kind: string, x: number, y: number, z: number, a?: number, b?: number): void;
  /** Cambia un bloque desde la simulación (explosiones, etc.). */
  breakBlock(x: number, y: number, z: number, drop: boolean): void;
  /** Un bloque que caía toca el suelo en la celda (x, y, z). */
  landBlock(x: number, y: number, z: number, block: number): void;
  /** Una criatura cae sobre tierra de cultivo y la pisotea. */
  trample(x: number, y: number, z: number): void;
}

/** Resultado de usar un objeto sobre una criatura (lo que cambia en la mano del jugador). */
export interface InteractResult {
  ok: boolean;
  /** Objetos que se gastan de la mano. */
  take?: number;
  /** Objeto que se recibe a cambio (cubo de leche). */
  give?: ItemStack;
  /** Desgaste de la herramienta (tijeras). */
  wear?: number;
}

/** Segundos que tarda una cría en crecer (Minecraft: 20 minutos). */
export const GROW_SECONDS = 1200;
export const LOVE_SECONDS = 30;
export const BREED_COOLDOWN = 300;

export interface AI {
  target: string | null;
  goal: PathNode | null;
  path: PathNode[] | null;
  pathIdx: number;
  repath: number;
  think: number;
  attackCd: number;
  shootCd: number;
  fuse: number;
  angry: number;
  panic: number;
  panicFrom: [number, number];
  stuck: number;
  lastX: number;
  lastZ: number;
  swimDir: [number, number, number];
  lookYaw: number;
  teleportCd: number;
  /** Dirección elegida por animalGoal: [x, z, velocidad, saltar]. */
  goalDir: [number, number, number, number];
  lookAt: [number, number, number] | null;
}

export interface Entity extends Body {
  id: number;
  type: number;
  yaw: number;
  pitch: number;
  bodyYaw: number;
  health: number;
  maxHealth: number;
  hurt: number;
  invuln: number;
  dead: boolean;
  deathTime: number;
  fire: number;
  burnAcc: number;
  age: number;
  fallStart: number;
  despawn: boolean;
  // Objetos
  stack?: ItemStack;
  pickupDelay?: number;
  owner?: string;
  // Flechas
  shooter?: string | number;
  arrowDamage?: number;
  stuck?: boolean;
  // Bloques que caen
  block?: number;
  // Animales
  /** Segundos que le faltan para ser adulto (> 0: cría). */
  growAge?: number;
  /** Segundos que le quedan en modo amor (buscando pareja). */
  love?: number;
  /** Espera hasta poder volver a criar. */
  breedCd?: number;
  sheared?: boolean;
  /** Gallinas: segundos hasta el próximo huevo. */
  eggTimer?: number;
  ai?: AI;
  /** Bit de estado para los clientes: 1 herido reciente, 2 ardiendo, 4 muerto, 8 enfadado, 16 disparando/mecha. */
  flags: number;
}

export const GRAVITY = 32;
export const TAU = Math.PI * 2;
/** Límites globales (protegen la memoria y la CPU del servidor): se retiran los más viejos. */
export const MAX_ITEMS = 800;
export const MAX_ARROWS = 200;
/** Animales en todo el mundo; al llegar al límite se reciclan los que están lejos de todos. */
export const MAX_PASSIVE = 300;
/** Distancia a los jugadores a partir de la cual una entidad queda congelada (no se simula). */
export const ACTIVE_RANGE = 128;

export function angleTo(fromX: number, fromZ: number, toX: number, toZ: number): number {
  return Math.atan2(-(toX - fromX), -(toZ - fromZ));
}

export function lerpAngle(a: number, b: number, t: number): number {
  let d = (((b - a) % TAU) + TAU * 1.5) % TAU - Math.PI;
  if (!Number.isFinite(d)) d = 0;
  return a + d * Math.min(1, t);
}
