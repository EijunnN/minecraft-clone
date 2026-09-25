// Protocolo cliente ↔ servidor (JSON por WebSocket; las ediciones iniciales van en binario).
import type { ItemStack } from './items';
import type { ContainerWire } from './containers';

export const PROTOCOL_VERSION = 6;
export const MAX_PLAYERS = 16;
export const MAX_NAME = 16;
export const MAX_CHAT = 200;

/** Bits del campo de estado del jugador. */
export const STATE_SNEAK = 1;
export const STATE_FLY = 2;
export const STATE_SWIM = 4;
export const STATE_DEAD = 8;
export const STATE_SLEEP = 16;
/** Tumbado boca abajo: buceando o gateando. */
export const STATE_PRONE = 32;
/** Usando un objeto (para animarlo en los demás): comiendo, tensando el arco o cubriéndose. */
export const STATE_EAT = 64;
export const STATE_BOW = 128;
export const STATE_BLOCK = 256;
/** Bits de estado que el servidor acepta. */
export const STATE_MASK = 0x1ff;

/** Bits de estado de las entidades. */
export const EF_HURT = 1;
export const EF_FIRE = 2;
export const EF_DEAD = 4;
export const EF_ANGRY = 8;
export const EF_ACTION = 16;
export const EF_PICKABLE = 32;
/** Cría (se dibuja a la mitad de tamaño y con la cabeza grande). */
export const EF_BABY = 64;
/** Oveja esquilada (sin lana). */
export const EF_SHEARED = 128;
/** Animal en modo amor (corazones). */
export const EF_LOVE = 256;
// Fase 6 (gólems/domesticar): bits altos para no chocar con otros añadidos.
/** Animal domesticado (lleva collar). */
export const EF_TAMED = 1 << 12;
/** Animal domesticado sentado. */
export const EF_SITTING = 1 << 13;
/** Piel de la criatura (gatos): 3 bits a partir de este desplazamiento. */
export const EF_VARIANT_SHIFT = 14;
export const EF_VARIANT_MASK = 7 << EF_VARIANT_SHIFT;

/** 's' supervivencia, 'c' creativo. */
export type GameMode = 's' | 'c';

export interface WorldTime {
  /** Tiempo del mundo en días (fracción = hora del día; 0 = amanecer) en el instante `at`. */
  base: number;
  /** Date.now() del servidor en el que `base` era válido. */
  at: number;
  /** Días por segundo real. */
  rate: number;
}

export interface PlayerInfo {
  id: string;
  name: string;
  shirt: string;
  p: [number, number, number];
  r: [number, number];
  s: number;
  /** Objeto en la mano. */
  h?: number;
  /** Objeto en la mano secundaria. */
  o?: number;
  /** Armadura puesta: ids [cabeza, pecho, piernas, pies] (0 = nada). */
  a?: number[];
}

/** Pila en la red: [id, cantidad] o [id, cantidad, desgaste]. */
export type WireStack = [number, number] | [number, number, number];

/** Estado del jugador que guarda el servidor (el inventario lo gestiona el cliente). */
export interface PlayerSave {
  inv: (WireStack | null)[];
  hp: number;
  food: number;
  sat: number;
  air?: number;
  pos?: [number, number, number];
  rot?: [number, number];
  fly?: boolean;
  sel?: number;
  dead?: boolean;
  /** Armadura puesta [cabeza, pecho, piernas, pies]. */
  armor?: (WireStack | null)[];
  /** Mano secundaria. */
  off?: WireStack | null;
  /** Efectos activos: [efecto, nivel, segundos restantes]. */
  fx?: [number, number, number][];
  /** Corazones dorados (absorción) que le quedan. */
  abs?: number;
  /** Experiencia total acumulada. */
  xp?: number;
}

/** Entidad nueva: [id, tipo, x, y, z, yaw, cuerpo, pitch, flags, extra...]. */
export type EntAdd = number[];
/** Actualización: [id, x, y, z, yaw, cuerpo, pitch, flags, cantidad?]. */
export type EntUpd = number[];

export type ClientMsg =
  | { t: 'hello'; v: number; name: string; shirt: string; mode?: GameMode }
  | { t: 'pos'; p: [number, number, number]; r: [number, number]; s: number; h?: number; o?: number; a?: number[] }
  | { t: 'set'; x: number; y: number; z: number; b: number; tool?: number }
  /** Colocar el bloque `item` sobre la cara (n) de la celda golpeada en el punto p con el yaw dado. */
  | { t: 'place'; x: number; y: number; z: number; n: [number, number, number]; p: [number, number, number]; item: number; yaw: number }
  /** Clic derecho sobre un bloque (abrir puertas, dormir, labrar con la azada, polvo de hueso). */
  | { t: 'use'; x: number; y: number; z: number; yaw: number; item?: number }
  /** Al morir: soltar orbes con esta experiencia en la posición p. */
  | { t: 'dropxp'; n: number; p: [number, number, number] }
  /** Usar el objeto de la mano sobre una criatura (dar de comer, esquilar, ordeñar). */
  | { t: 'interact'; e: number; item: number; q: number }
  /** El jugador cayó sobre tierra de cultivo y la pisoteó. */
  | { t: 'trample'; x: number; y: number; z: number }
  | { t: 'wake' }
  | { t: 'chat'; m: string }
  | { t: 'swing' }
  | { t: 'ping'; c: number }
  /** b: daño extra por efectos (Fuerza +3 por nivel, Debilidad −4). */
  | { t: 'attack'; e: number; item: number; crit?: boolean; b?: number }
  | { t: 'pickup'; e: number }
  | { t: 'drop'; items: ItemStack[]; p: [number, number, number]; v?: [number, number, number] }
  | { t: 'shoot'; p: [number, number, number]; d: [number, number, number]; f: number }
  /** Lanzar un objeto (huevo) desde p en la dirección d. */
  | { t: 'throw'; p: [number, number, number]; d: [number, number, number]; item: number }
  /** Caña de pescar: lanzar el flotador o, si ya está fuera, recogerlo. */
  | { t: 'fish'; p: [number, number, number]; d: [number, number, number] }
  /** Escribir el texto de un cartel (cuatro líneas). */
  | { t: 'sign'; x: number; y: number; z: number; l: string[] }
  | { t: 'open'; x: number; y: number; z: number }
  | { t: 'close' }
  | { t: 'cclick'; x: number; y: number; z: number; slot: number; btn: number; cur: ItemStack | null; q: number }
  | { t: 'cput'; x: number; y: number; z: number; stack: ItemStack; q: number }
  | { t: 'ctake'; x: number; y: number; z: number; slot: number; max: number; q: number }
  | { t: 'look'; e: number }
  | { t: 'state'; d: PlayerSave }
  | { t: 'died'; m: string };

export type ServerMsg =
  | {
    t: 'welcome'; id: string; seed: number; time: WorldTime; now: number; players: PlayerInfo[]; editCount: number;
    mode: GameMode; diff: number; save: PlayerSave | null; spawn: [number, number, number];
    /** Reaparición en la cama (si tiene). */
    bed?: [number, number, number] | null;
    /** Flotadores de pesca ya lanzados: [jugador, entidad]. */
    rods?: [string, number][];
    /** Carteles con texto: [x, y, z, líneas]. */
    signs?: [number, number, number, string[]][];
  }
  | { t: 'join'; p: PlayerInfo }
  | { t: 'leave'; id: string }
  | { t: 'pos'; id: string; p: [number, number, number]; r: [number, number]; s: number; h?: number; o?: number; a?: number[] }
  | { t: 'set'; id: string; x: number; y: number; z: number; b: number }
  | { t: 'sets'; l: number[] }
  | { t: 'chat'; id: string | null; name: string; m: string }
  | { t: 'time'; time: WorldTime; now: number }
  | { t: 'swing'; id: string }
  | { t: 'pong'; c: number; now: number }
  | { t: 'error'; m: string }
  | { t: 'ents'; a?: EntAdd[]; u?: EntUpd[]; rm?: (number | [number, string])[] }
  | { t: 'hurt'; a: number; k: [number, number, number]; c: string }
  | { t: 'picked'; e: number; s: ItemStack }
  | { t: 'fx'; k: string; p: [number, number, number]; a?: number; b?: number }
  | { t: 'cont'; x: number; y: number; z: number; c: ContainerWire }
  /** Texto de un cartel (lista vacía: sin texto). */
  | { t: 'sign'; x: number; y: number; z: number; l: string[] }
  | { t: 'cres'; q: number; cur?: ItemStack | null; give?: ItemStack | null }
  | { t: 'cclose' }
  | { t: 'gm'; m: GameMode }
  | { t: 'diff'; d: number }
  /** Resultado de intentar dormir: p = posición en la cama, f = orientación; m = motivo si no. */
  | { t: 'sleep'; ok: boolean; p?: [number, number, number]; f?: number; m?: string }
  | { t: 'wake' }
  /** Dar un efecto de estado (id 0 = quitarlos todos): s segundos, nivel a (0 = I). */
  | { t: 'effect'; id: number; s: number; a: number }
  /** El jugador recogió orbes de experiencia por valor de `n`. */
  | { t: 'xp'; n: number }
  /** Flotador del jugador p (e = id de la entidad, 0 = recogido); w = desgaste de la caña al recoger. */
  | { t: 'rod'; p: string; e: number; w?: number }
  /** Respuesta a 'interact': lo que cambia en la mano del jugador. */
  | { t: 'ires'; q: number; ok: boolean; take?: number; give?: ItemStack; wear?: number }
  /** Punto de reaparición del jugador (cama); null = el del mundo. */
  | { t: 'spawn'; p: [number, number, number] | null };

/** Mensaje binario de ediciones: [u8 tipo=2][u32 n] + n × ([i32 x][i16 y][i32 z][u16 b]). */
export const BIN_EDITS = 2;
export const EDIT_RECORD_BYTES = 12;

export function encodeEdits(edits: [number, number, number, number][]): ArrayBuffer {
  const buf = new ArrayBuffer(5 + edits.length * EDIT_RECORD_BYTES);
  const dv = new DataView(buf);
  dv.setUint8(0, BIN_EDITS);
  dv.setUint32(1, edits.length, true);
  let o = 5;
  for (const [x, y, z, b] of edits) {
    dv.setInt32(o, x, true);
    dv.setInt16(o + 4, y, true);
    dv.setInt32(o + 6, z, true);
    dv.setUint16(o + 10, b, true);
    o += EDIT_RECORD_BYTES;
  }
  return buf;
}

export function decodeEdits(buf: ArrayBuffer): [number, number, number, number][] {
  const dv = new DataView(buf);
  if (dv.getUint8(0) !== BIN_EDITS) return [];
  const n = dv.getUint32(1, true);
  const out: [number, number, number, number][] = new Array(n);
  let o = 5;
  for (let i = 0; i < n; i++) {
    out[i] = [dv.getInt32(o, true), dv.getInt16(o + 4, true), dv.getInt32(o + 6, true), dv.getUint16(o + 10, true)];
    o += EDIT_RECORD_BYTES;
  }
  return out;
}

export function sanitizeName(raw: unknown): string {
  const s = typeof raw === 'string' ? raw : '';
  const clean = s.replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, MAX_NAME);
  return clean || 'Jugador';
}

export function sanitizeColor(raw: unknown): string {
  return typeof raw === 'string' && /^#[0-9a-fA-F]{6}$/.test(raw) ? raw.toLowerCase() : '#3a7bd5';
}

export function sanitizeRoom(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 32) || 'mundo';
}

/** Tiempo del mundo (días) en el instante serverNow (ms). */
export function worldTimeAt(t: WorldTime, serverNow: number): number {
  return t.base + ((serverNow - t.at) / 1000) * t.rate;
}

export function stackToWire(s: ItemStack | null): WireStack | null {
  if (!s || s.count <= 0) return null;
  return s.dmg ? [s.id, s.count, s.dmg] : [s.id, s.count];
}

export function stackFromWire(w: unknown): ItemStack | null {
  if (!Array.isArray(w) || w.length < 2) return null;
  const s: ItemStack = { id: Number(w[0]), count: Number(w[1]) };
  if (w.length > 2 && Number(w[2]) > 0) s.dmg = Number(w[2]);
  return s;
}
