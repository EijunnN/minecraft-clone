// Protocolo cliente ↔ servidor (JSON por WebSocket; las ediciones iniciales van en binario).
import type { ItemStack } from './items';
import type { ContainerWire } from './containers';
import type { TradeWire } from './villagers'; // Fase 6 (aldeanos)
import type { ItemData } from './itemData'; // Fase 6.5 (libros y estandartes)
import type { BannerLayer } from './bannerPatterns';

export const PROTOCOL_VERSION = 12;
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
// Fase 6 (monturas, gólems/domesticar): bits altos para no chocar con otros añadidos.
/** Montura con silla puesta. */
export const EF_SADDLE = 1 << 12;
/** Domada o domesticada (monturas; lobos y gatos llevan collar). */
export const EF_TAMED = 1 << 13;
/** Montura con jinete. */
export const EF_RIDDEN = 1 << 14;
/** Animal domesticado sentado. */
export const EF_SITTING = 1 << 15;
/** Piel de la criatura (gatos): 3 bits a partir de este desplazamiento. */
export const EF_VARIANT_SHIFT = 16;
export const EF_VARIANT_MASK = 7 << EF_VARIANT_SHIFT;
/** Fase 6 (asaltos): capitán de una patrulla o de un asalto (lleva el estandarte ominoso). */
export const EF_CAPTAIN = 1 << 21;
/** Fase 7 (encantamientos): objeto (tirado, lanzado, expuesto o tridente) con el brillo de los encantamientos. */
export const EF_GLINT = 1 << 22;
/** Fase 7 (encantamientos): soporte para armadura: brillo de cada pieza (bits 22..25, de la cabeza a los pies). */
export const EF_GLINT_ARMOR_SHIFT = 22;

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
  /** Fase 7 (encantamientos): brillo (bit 0 mano, 1 mano secundaria, 2..5 armadura de la cabeza a los pies). */
  g?: number;
}

/** Pila en la red: [id, cantidad] o [id, cantidad, desgaste]. */
/** [id, cantidad, desgaste?, contenido del saco?] (Fase 6.5: el saco lleva sus pilas en el cuarto campo). */
/** Fase 6.5 (libros y estandartes): quinto campo, los datos de la pila (páginas, capas…). */
export type WireStack = [number, number] | [number, number, number] | [number, number, number, WireStack[]]
  | [number, number, number, WireStack[], ItemData];

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
  /** Fase 7 (encantamientos): semilla de encantamiento (las ofertas de la mesa; cambia al encantar). */
  es?: number;
}

/** Entidad nueva: [id, tipo, x, y, z, yaw, cuerpo, pitch, flags, extra...]. */
export type EntAdd = number[];
/** Actualización: [id, x, y, z, yaw, cuerpo, pitch, flags, cantidad?]. */
export type EntUpd = number[];
/**
 * Fase 6.5 (remate): [id, nombre ('' sin nombre), atada a: id de jugador, [x, y, z] de una valla o 0].
 * Fase 6.5 (equipo): cuarto campo opcional, el equipo que lleva (armadura de caballo o lobo, tridente…).
 */
export type EntExtra = [number, string, string | [number, number, number] | 0] | [number, string, string | [number, number, number] | 0, number];

export type ClientMsg =
  | { t: 'hello'; v: number; name: string; shirt: string; mode?: GameMode }
  | { t: 'pos'; p: [number, number, number]; r: [number, number]; s: number; h?: number; o?: number; a?: number[]; ec?: number; g?: number } // Fase 7: ec (pociones), g (brillo)
  /** Fase 7 (encantamientos): en, encantamientos de la herramienta (Toque de seda, Fortuna). */
  | { t: 'set'; x: number; y: number; z: number; b: number; tool?: number; en?: [number, number][] }
  /** Colocar el bloque `item` sobre la cara (n) de la celda golpeada en el punto p con el yaw dado. */
  | {
    t: 'place'; x: number; y: number; z: number; n: [number, number, number]; p: [number, number, number]; item: number; yaw: number;
    /** Fase 6.5 (libros y estandartes): capas del estandarte que se coloca. */
    l?: BannerLayer[];
    /** Fase 7 (mecanismos): inclinación de la mirada (pistones, observadores… hacia arriba o abajo). */
    pi?: number;
  }
  /** Clic derecho sobre un bloque (abrir puertas, dormir, labrar con la azada, polvo de hueso). */
  | { t: 'use'; x: number; y: number; z: number; yaw: number; item?: number; h?: number } // Fase 6.5 (materiales): h, altura del clic
  /** Al morir: soltar orbes con esta experiencia en la posición p. */
  | { t: 'dropxp'; n: number; p: [number, number, number] }
  /** Usar el objeto de la mano sobre una criatura (dar de comer, esquilar, ordeñar). */
  | { t: 'interact'; e: number; item: number; q: number; n?: string; d?: number; st?: ItemStack } // Fase 7: st, la pila entera
  /** Fase 6.5 (remate): atar a la valla (x, y, z) las criaturas que lleva el jugador con correa. */
  | { t: 'leash'; x: number; y: number; z: number }
  /** El jugador cayó sobre tierra de cultivo y la pisoteó. */
  | { t: 'trample'; x: number; y: number; z: number }
  | { t: 'wake' }
  | { t: 'chat'; m: string }
  | { t: 'swing' }
  | { t: 'ping'; c: number }
  /** b: daño extra por efectos (Fuerza +3 por nivel, Debilidad −4). */
  /** Fase 7 (encantamientos): en, encantamientos del arma; sw, golpe que barre (espada, cargado, en el suelo). */
  | { t: 'attack'; e: number; item: number; crit?: boolean; b?: number; en?: [number, number][]; sw?: number; k?: number }
  | { t: 'pickup'; e: number }
  | { t: 'drop'; items: ItemStack[]; p: [number, number, number]; v?: [number, number, number] }
  /** c: 1 = virote de ballesta (Fase 6.5, equipo). Fase 7: ap, tipo de la flecha con efecto (pociones); en, encantamientos. */
  | { t: 'shoot'; p: [number, number, number]; d: [number, number, number]; f: number; c?: number; ap?: number; en?: [number, number][] }
  /** Lanzar un objeto (huevo) desde p en la dirección d. Fase 6.5 (equipo): tridente o cohete, con w = su desgaste o sus datos. */
  | { t: 'throw'; p: [number, number, number]; d: [number, number, number]; item: number; w?: number; st?: ItemStack } // Fase 7: st, el tridente entero
  /** Caña de pescar: lanzar el flotador o, si ya está fuera, recogerlo. */
  | { t: 'fish'; p: [number, number, number]; d: [number, number, number]; en?: [number, number][] } // Fase 7: en, Suerte marina y Atracción
  /** Escribir el texto de un cartel (cuatro líneas). */
  | { t: 'sign'; x: number; y: number; z: number; l: string[] }
  | { t: 'open'; x: number; y: number; z: number }
  | { t: 'close' }
  | { t: 'cclick'; x: number; y: number; z: number; slot: number; btn: number; cur: ItemStack | null; q: number }
  | { t: 'cput'; x: number; y: number; z: number; stack: ItemStack; q: number }
  | { t: 'ctake'; x: number; y: number; z: number; slot: number; max: number; q: number }
  | { t: 'look'; e: number }
  | { t: 'state'; d: PlayerSave }
  | { t: 'died'; m: string }
  // Fase 6 (monturas)
  /** Montarse en la criatura e. */
  | { t: 'mount'; e: number }
  /** Bajarse de la montura. */
  | { t: 'dismount' }
  /** El jinete mueve la montura que guía: pies de la montura y orientación. */
  | { t: 'mpos'; e: number; p: [number, number, number]; r: number }
  // Fase 6 (aldeanos): comercio. Abrir la pantalla con un aldeano, hacer el trato i (pay: lo que el cliente
  // sacó de su inventario para pagar) y cerrarla.
  | { t: 'topen'; e: number }
  | { t: 'trade'; e: number; i: number; q: number; pay: ItemStack[] }
  | { t: 'tclose' }
  // Fase 6 (asaltos): el jugador se bebió una botella ominosa (Mal presagio de nivel a).
  | { t: 'omen'; a: number }
  // Fase 6.5 (decoración): colgar un cuadro o un marco (item) en la cara f (0 N, 1 E, 2 S, 3 O) del bloque
  // (x, y, z); usar un marco (poner el objeto de la mano o girar el que tiene). Respuesta: 'ires' con q.
  | { t: 'hang'; x: number; y: number; z: number; f: number; item: number; q: number }
  | { t: 'frame'; e: number; item: number; q: number }
  // Fase 6.5 (remate): clic derecho en el hueco `slot` de una estantería cincelada con `item` en la mano
  // (sacar el libro o meter el de la mano). Respuesta: 'ires' con q (take 1 al meterlo, give al sacarlo).
  | { t: 'shelf'; x: number; y: number; z: number; slot: number; item: number; q: number; st?: ItemStack }
  // Fase 6.5 (remate): poner un soporte para armadura sobre el bloque (x, y, z), mirando a `yaw`.
  | { t: 'stand'; x: number; y: number; z: number; yaw: number; q: number }
  // Fase 6.5 (libros y estandartes): atril. 'put' pone el libro de la mano (respuesta 'ires' con take 1),
  // 'take' lo saca (sólo quien lo puso; 'ires' con give) y 'read' pide el libro para leerlo ('lbook').
  | { t: 'lectern'; x: number; y: number; z: number; a: 'put' | 'take' | 'read'; q: number; book?: ItemStack }
  // Fase 6.5 (colecciones): clic derecho en un tocadiscos con `item` en la mano: meter el disco (take 1)
  // o sacar el que tiene (cae encima). Respuesta: 'ires' con q.
  | { t: 'jukebox'; x: number; y: number; z: number; item: number; q: number }
  // Fase 6.5 (equipo): mechero en la cara n del bloque (x, y, z) (respuesta: 'ires' con q y el desgaste),
  // tocar el cuerno de cabra (se oye lejos) y acelerón del cerdo con la caña con zanahoria ('ires' con q).
  | { t: 'ignite'; x: number; y: number; z: number; n: [number, number, number]; q: number }
  | { t: 'horn'; v: number }
  | { t: 'boost'; q: number }
  // Fase 7 (transporte): poner una barca o vagoneta con el objeto `item` en el punto p (b: el bloque tocado;
  // respuesta 'ires' con q), subirse a la entidad e, bajarse y la posición de la que lleva el jugador
  // (p, yaw r, pitch pi, velocidad v en bloques por tick y remos k: bit 1 izquierdo, bit 2 derecho).
  | { t: 'vplace'; item: number; p: [number, number, number]; b?: [number, number, number]; yaw: number; q: number }
  | { t: 'vride'; e: number }
  | { t: 'vleave' }
  | { t: 'vpos'; e: number; p: [number, number, number]; r: number; pi?: number; v: [number, number, number]; k?: number }
  // Fase 7 (encantamientos): se usó la mesa de encantamientos, el yunque (el servidor decide si se
  // deteriora) o la afiladora (n: experiencia que suelta en orbes) en (x, y, z); Paso helado de nivel l
  // bajo los pies del jugador.
  | { t: 'work'; k: 'enchant' | 'anvil' | 'grind'; x: number; y: number; z: number; n?: number }
  | { t: 'frost'; l: number };

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
    /** Fase 6.5 (libros y estandartes): estandartes con dibujos: [x, y, z, capas]. */
    banners?: [number, number, number, BannerLayer[]][];
  }
  | { t: 'join'; p: PlayerInfo }
  | { t: 'leave'; id: string }
  | { t: 'pos'; id: string; p: [number, number, number]; r: [number, number]; s: number; h?: number; o?: number; a?: number[]; ec?: number; g?: number } // Fase 7
  | { t: 'set'; id: string; x: number; y: number; z: number; b: number }
  | { t: 'sets'; l: number[] }
  | { t: 'chat'; id: string | null; name: string; m: string }
  | { t: 'time'; time: WorldTime; now: number }
  | { t: 'swing'; id: string }
  | { t: 'pong'; c: number; now: number }
  | { t: 'error'; m: string }
  | {
      t: 'ents'; a?: EntAdd[]; u?: EntUpd[]; rm?: (number | [number, string])[];
      /** Fase 6.5 (remate): nombre y correa de las criaturas que cambiaron: [id, nombre, atada a (jugador, valla o 0)]. */
      ex?: EntExtra[];
    }
  /** Fase 7 (encantamientos): th, piezas de armadura (bit 0 cabeza … 3 pies) cuyas Espinas saltaron (se desgastan). */
  | { t: 'hurt'; a: number; k: [number, number, number]; c: string; th?: number }
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
  /**
   * Dar un efecto de estado (id 0 = quitarlos todos): s segundos, nivel a (0 = I). Fase 7 (pociones): en
   * los instantáneos (curación), s es la fuerza (0..1).
   */
  | { t: 'effect'; id: number; s: number; a: number }
  /** El jugador recogió orbes de experiencia por valor de `n`. */
  | { t: 'xp'; n: number; l?: number } // Fase 7 (encantamientos): l, niveles de golpe (/experiencia)
  /** Flotador del jugador p (e = id de la entidad, 0 = recogido); w = desgaste de la caña al recoger. */
  | { t: 'rod'; p: string; e: number; w?: number }
  /** Respuesta a 'interact': lo que cambia en la mano del jugador. */
  | { t: 'ires'; q: number; ok: boolean; take?: number; give?: ItemStack; wear?: number }
  /** Punto de reaparición del jugador (cama); null = el del mundo. */
  | { t: 'spawn'; p: [number, number, number] | null }
  // Fase 6 (monturas)
  /** El jugador `id` va en la entidad e (0 = se bajó); c: la guía él; st: [velocidad, salto] de la montura. */
  | { t: 'ride'; id: string; e: number; c?: boolean; st?: [number, number] }
  /** Movimiento de la montura rechazado: vuelve a p. */
  | { t: 'mfix'; e: number; p: [number, number, number] }
  // Fase 6 (aldeanos): ofertas de un aldeano (p profesión, lvl nivel, xp experiencia; o ofertas
  // [pide, n, pide2, n2, da, n, usos, máximo]), resultado de un trato (give lo que recibe, back lo que
  // se le devuelve si no salió) y cierre de la pantalla.
  | { t: 'trades'; e: number; p: number; lvl: number; xp: number; tr: boolean; o: TradeWire[] }
  | { t: 'tres'; q: number; ok: boolean; give?: ItemStack | null; back?: ItemStack[]; m?: string }
  | { t: 'tclose' }
  // Fase 6 (asaltos): barra del asalto cercano. s: 0 ninguno, 1 en curso, 2 victoria, 3 derrota;
  // w oleada actual (1..n), n oleadas, h vida que les queda a los asaltantes (0..1; en la espera, lo
  // que falta para la siguiente oleada), r asaltantes vivos.
  | { t: 'raid'; s: number; w: number; n: number; h: number; r: number }
  // Fase 6.5 (libros y estandartes): capas del estandarte de (x, y, z) (lista vacía: liso) y el libro de un
  // atril para leerlo (b null: no tiene; own: lo puso quien lo pide y lo puede sacar).
  | { t: 'banner'; x: number; y: number; z: number; l: BannerLayer[] }
  | { t: 'lbook'; x: number; y: number; z: number; b: ItemStack | null; own: boolean }
  // Fase 7 (transporte): quién va en cada plaza de la barca o vagoneta e (id de jugador, id de la criatura o
  // 0 si está libre) y posición rechazada de la que lleva el jugador (vuelve a p con velocidad v).
  | { t: 'vpass'; e: number; p: (string | number)[] }
  | { t: 'vfix'; e: number; p: [number, number, number]; v: [number, number, number] }
  // Fase 7 (encantamientos): /encantar pone estos encantamientos al objeto de la mano.
  | { t: 'ench'; e: [number, number][] }
  // Fase 7 (mecanismos): un dispensador le pone esta pieza de armadura al jugador (en su hueco, si está libre).
  | { t: 'equip'; s: ItemStack };

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
  const bag = s.bag?.length ? s.bag.map((b) => stackToWire(b)).filter((b): b is WireStack => !!b) : [];
  if (s.data) return [s.id, s.count, s.dmg ?? 0, bag, s.data]; // Fase 6.5 (libros y estandartes)
  if (bag.length) return [s.id, s.count, s.dmg ?? 0, bag];
  return s.dmg ? [s.id, s.count, s.dmg] : [s.id, s.count];
}

export function stackFromWire(w: unknown, depth = 0): ItemStack | null {
  if (!Array.isArray(w) || w.length < 2) return null;
  const s: ItemStack = { id: Number(w[0]), count: Number(w[1]) };
  if (w.length > 2 && Number(w[2]) > 0) s.dmg = Number(w[2]);
  // Fase 6.5 (remate): contenido del saco (sin sacos dentro).
  if (depth === 0 && Array.isArray(w[3]) && w[3].length) {
    const bag = (w[3] as unknown[]).slice(0, 64).map((b) => stackFromWire(b, 1)).filter((b): b is ItemStack => !!b);
    if (bag.length) s.bag = bag;
  }
  // Fase 6.5 (libros y estandartes): datos de la pila (los valida sanitizeStack).
  const d = w[4];
  if (d && typeof d === 'object' && !Array.isArray(d)) s.data = d as ItemData;
  return s;
}
