// Programa lunar (idea-luna.md, idea-industria.md): el motor de las cintas transportadoras, como las de Factorio.
//
// Cada cinta es un bloque con DOS CARRILES (izquierdo y derecho, según su sentido de marcha). En cada carril los objetos van en
// una lista ordenada (el primero, el que va delante) con su posición `p` a lo largo del bloque (0 = entrada, 1 = salida), y no
// pueden acercarse más de SPACING: caben 4 por carril y 8 por bloque. Nada de entidades sueltas: la cinta entera es una lista, y
// por eso una fábrica con miles de objetos en cintas cuesta poco. Es código puro (sin servidor ni cliente): lo usan los dos.
//
// Reglas (las de Factorio):
// - Una cinta que desemboca en la ESPALDA de otra le pasa cada carril al mismo carril; también si la siguiente es una CURVA
//   (una cinta sin nada detrás y con un único alimentador de lado: los carriles se conservan).
// - Una cinta que desemboca por un LADO de otra le pasa los dos carriles al carril de ese lado (carga lateral).
// - Sin nada delante, o con lo de delante lleno, los objetos se detienen y se apilan hasta el final.
// - Velocidad: básica 1,875 bloques/s, rápida 3,75, exprés 5,625 (por carril: 7,5, 15 y 22,5 objetos/s).
// - SUBTERRÁNEAS: la entrada pasa lo que recibe, carril a carril, por un túnel (tramos sin bloque, K_TUNNEL) hasta la salida. Las
//   dos son media cinta con una capucha: una carga lateral sobre ellas sólo mete el carril del lado de la mitad abierta, y una salida
//   no recibe de una cinta que le llegue de espaldas.
// - DIVISORES: dos cintas pegadas cuyos finales reparten entre las dos salidas, alternando por carril; con prioridad de entrada, de
//   salida y un filtro que manda un objeto a un lado. Sólo reciben de espaldas.
import type { ItemStack } from '../items';

/** Sentidos de marcha: 0 +x, 1 +z, 2 −x, 3 −z (la derecha de `d` es `(d + 1) % 4`). */
export const BELT_DX = [1, 0, -1, 0] as const;
export const BELT_DZ = [0, 1, 0, -1] as const;

/** Tipos de pieza. */
export const K_BELT = 0;
/** Entrada y salida de una subterránea, mitad de divisor y tramo de túnel (sin bloque). */
export const K_UG_IN = 1;
export const K_UG_OUT = 2;
export const K_SPLIT = 3;
export const K_TUNNEL = 4;

/** Distancia mínima entre los centros de dos objetos de un carril (bloques): caben 4 por bloque y carril. */
export const BELT_SPACING = 0.25;
/** Hasta dónde llega el primer objeto de una cinta sin nada delante (deja sitio a los tres de detrás). */
export const BELT_END = 0.875;
/** Altura (bloques) de la superficie de una cinta: donde se apoyan los objetos que lleva. */
export const BELT_HEIGHT_FOR_ITEMS = 0.25;
/** Velocidades por nivel (bloques/s). */
export const BELT_SPEEDS = [1.875, 3.75, 5.625] as const;
export const BELT_TIER_NAMES = ['básica', 'rápida', 'exprés'] as const;
/** Objetos por segundo que mueve una cinta llena de cada nivel (los dos carriles). */
export const BELT_THROUGHPUT = BELT_SPEEDS.map((v) => (2 * v) / BELT_SPACING);

/** Un objeto en un carril: su pila (siempre de uno) y su posición. */
export interface BeltItem {
  s: ItemStack;
  p: number;
}

/** A dónde van los objetos del final de una cinta. */
export interface BeltLink {
  to: Belt;
  /** -1 por su lado izquierdo, 0 por su espalda (o una curva), 1 por su lado derecho. */
  side: -1 | 0 | 1;
  /** Si está, por este enlace sólo pasa ese carril del origen (la carga lateral sobre una subterránea). */
  only?: 0 | 1;
}

/** Lo que comparten las dos mitades de un divisor. */
export interface SplitState {
  /** A qué salida le toca a cada carril (0 izquierda, 1 derecha): se alterna con cada objeto que sale. */
  rr: [number, number];
  /** Prioridad de entrada y de salida: −1 izquierda, 1 derecha, 0 ninguna. */
  inPri: -1 | 0 | 1;
  outPri: -1 | 0 | 1;
  /** Objeto que se manda sólo a `filterSide` (0 = sin filtro) y ese lado (−1 izquierda, 1 derecha). */
  filter: number;
  filterSide: -1 | 1;
  /** Las dos mitades (izquierda, derecha) y las salidas que tiene cada una delante. */
  halves: [Belt | null, Belt | null];
  outs: [BeltLink | null, BeltLink | null];
}

export function newSplitState(): SplitState {
  return { rr: [0, 0], inPri: 0, outPri: 0, filter: 0, filterSide: -1, halves: [null, null], outs: [null, null] };
}

export interface Belt {
  x: number;
  y: number;
  z: number;
  dir: number;
  tier: number;
  /** Tipo de pieza (K_*). */
  kind: number;
  /** [izquierdo, derecho]; el primer objeto de cada lista es el que va delante. */
  lanes: [BeltItem[], BeltItem[]];
  out: BeltLink | null;
  /** Sólo en las mitades de un divisor. */
  split: SplitState | null;
  /** ¿Avanzó el primer objeto de cada carril en el último tick? (los clientes lo usan para no adelantarse). */
  moving: [boolean, boolean];
}

export function newBelt(x: number, y: number, z: number, dir: number, tier = 0, kind = K_BELT): Belt {
  return { x, y, z, dir, tier, kind, lanes: [[], []], out: null, split: null, moving: [false, false] };
}

/** Objetos que lleva la cinta. */
export function beltCount(b: Belt): number {
  return b.lanes[0].length + b.lanes[1].length;
}

const EPS = 1e-6;

/**
 * ¿Cabe un objeto en `p` del carril? (a SPACING de los de delante y de detrás; el primero también tiene que quedar dentro).
 */
export function laneHasRoom(items: BeltItem[], p: number): boolean {
  if (p < 0 || p >= 1) return false;
  for (const it of items) {
    if (Math.abs(it.p - p) < BELT_SPACING - EPS) return false;
  }
  return true;
}

/** Mete `s` (de uno) en el carril `lane` en `p`, en su sitio de la lista. false si no cabe. */
export function beltPut(b: Belt, lane: 0 | 1, p: number, s: ItemStack): boolean {
  const items = b.lanes[lane];
  if (!laneHasRoom(items, p)) return false;
  let i = 0;
  while (i < items.length && items[i].p > p) i++;
  items.splice(i, 0, { s: { ...s, count: 1 }, p });
  return true;
}

/** Saca el primer objeto (el que va más delante, de cualquiera de los dos carriles) que cumpla `want`; null si ninguno. */
export function beltTake(b: Belt, want: (s: ItemStack) => boolean = () => true): ItemStack | null {
  let bestLane = -1, bestIdx = -1, bestP = -1;
  for (let l = 0; l < 2; l++) {
    const items = b.lanes[l];
    for (let i = 0; i < items.length; i++) {
      if (items[i].p > bestP && want(items[i].s)) {
        bestLane = l;
        bestIdx = i;
        bestP = items[i].p;
        break; // el primero que cumpla en ese carril es el más adelantado
      }
    }
  }
  if (bestLane < 0) return null;
  return b.lanes[bestLane].splice(bestIdx, 1)[0].s;
}

/** Mira (sin sacar) si hay algún objeto que cumpla `want`. */
export function beltHas(b: Belt, want: (s: ItemStack) => boolean = () => true): boolean {
  for (const lane of b.lanes) for (const it of lane) if (want(it.s)) return true;
  return false;
}

/** Carril de destino y posición de entrada de un objeto que pasa por el final de `from` a `link.to` con el sobrante `over`. */
function landing(link: BeltLink, lane: number, over: number): { lane: number; p: number } {
  if (link.side === 0) return { lane, p: over };
  // Carga lateral: los dos carriles van al carril de ese lado, y entran hacia la mitad del bloque.
  return { lane: link.side === -1 ? 0 : 1, p: 0.5 };
}

/** ¿Tiene esta pieza alguna salida? */
function hasExit(b: Belt): boolean {
  return b.split ? !!(b.split.outs[0] || b.split.outs[1]) : !!b.out;
}

/** Las salidas de un divisor en el orden en que le toca probarlas a un objeto del carril `lane` (vacío si su filtro no deja pasar). */
function splitOrder(st: SplitState, lane: number, item: ItemStack): (0 | 1)[] {
  if (st.filter !== 0) {
    const side = st.filterSide === -1 ? 0 : 1;
    // Lo filtrado va sólo a su lado; lo demás, sólo al otro.
    return item.id === st.filter ? [side] : [(1 - side) as 0 | 1];
  }
  if (st.outPri !== 0) {
    const pref = st.outPri === -1 ? 0 : 1;
    return [pref, (1 - pref) as 0 | 1];
  }
  const first = st.rr[lane] as 0 | 1;
  return [first, (1 - first) as 0 | 1];
}

/** Pasa el objeto `it` del final de `b` a lo de delante (o a una de las dos salidas de un divisor). true si entró. */
function pass(b: Belt, lane: number, it: BeltItem, over: number): boolean {
  if (b.split) {
    const st = b.split;
    for (const o of splitOrder(st, lane, it.s)) {
      const link = st.outs[o];
      if (!link) continue;
      if (link.only !== undefined && link.only !== lane) continue;
      const land = landing(link, lane, over);
      if (beltPut(link.to, land.lane as 0 | 1, land.p, it.s)) {
        if (st.filter === 0 && st.outPri === 0) st.rr[lane] = 1 - o;
        return true;
      }
    }
    return false;
  }
  const link = b.out;
  if (!link) return false;
  if (link.only !== undefined && link.only !== lane) return false;
  const land = landing(link, lane, over);
  return beltPut(link.to, land.lane as 0 | 1, land.p, it.s);
}

/** Un tick (`dt` segundos) de un carril. */
function stepLane(b: Belt, lane: number, dt: number): void {
  const items = b.lanes[lane];
  b.moving[lane] = false;
  if (items.length === 0) return;
  const v = BELT_SPEEDS[b.tier] * dt;
  const exit = hasExit(b);
  // Hasta dónde puede llegar el siguiente: lo que deje el de delante (o, si éste acaba de salir del bloque, SPACING por detrás).
  let limit = Infinity;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    let np = Math.min(it.p + v, limit);
    if (i === 0) {
      if (np >= 1 && exit) {
        if (pass(b, lane, it, np - 1)) {
          items.shift();
          i--; // el siguiente pasa a ser el primero
          b.moving[lane] = true;
          limit = np - BELT_SPACING;
          continue;
        }
        np = 1 - EPS; // sin sitio delante: espera en el borde
      } else np = Math.min(np, exit ? 1 - EPS : BELT_END);
    }
    if (np < it.p) np = it.p; // nunca marcha atrás (p. ej. si se quita la cinta de delante)
    if (i === 0 && np > it.p + 1e-9) b.moving[lane] = true;
    it.p = np;
    limit = it.p - BELT_SPACING;
  }
}

/** A quiénes les pasa objetos `b` (uno, o los dos de las salidas de un divisor). */
function successors(b: Belt): Belt[] {
  if (b.split) {
    const out: Belt[] = [];
    for (const l of b.split.outs) if (l) out.push(l.to);
    return out;
  }
  return b.out ? [b.out.to] : [];
}

/**
 * Ordena las cintas para moverlas: cada una después de aquella a la que le pasa los objetos (así una fila llena avanza a la vez
 * en un solo tick). Los ciclos (cintas en bucle) se dejan en el orden en que vienen. Las mitades de un divisor con prioridad de
 * entrada van la prioritaria primero (así coge sitio antes que la otra).
 */
export function orderBelts(belts: readonly Belt[]): Belt[] {
  const present = new Set(belts);
  const feeders = new Map<Belt, Belt[]>();
  const queue: Belt[] = [];
  for (const b of belts) {
    const succ = successors(b).filter((s) => present.has(s));
    if (succ.length === 0) queue.push(b);
    for (const s of succ) {
      const list = feeders.get(s);
      if (list) list.push(b);
      else feeders.set(s, [b]);
    }
  }
  const order: Belt[] = [];
  const seen = new Set<Belt>(queue);
  for (let q = 0; q < queue.length; q++) {
    const b = queue[q];
    order.push(b);
    for (const f of feeders.get(b) ?? []) {
      if (!seen.has(f)) {
        seen.add(f);
        queue.push(f);
      }
    }
  }
  for (const b of belts) if (!seen.has(b)) order.push(b); // bucles
  // Prioridad de entrada de los divisores.
  for (const b of belts) {
    const st = b.split;
    if (!st || st.inPri === 0 || st.halves[0] !== b) continue;
    const pri = st.halves[st.inPri === -1 ? 0 : 1], other = st.halves[st.inPri === -1 ? 1 : 0];
    if (!pri || !other) continue;
    const ip = order.indexOf(pri), io = order.indexOf(other);
    if (ip > io && ip >= 0 && io >= 0) {
      order[ip] = other;
      order[io] = pri;
    }
  }
  return order;
}

/** Avanza un tick todas las cintas (ya ordenadas con orderBelts). */
export function stepBelts(ordered: readonly Belt[], dt: number): void {
  for (const b of ordered) {
    if (b.lanes[0].length === 0 && b.lanes[1].length === 0) {
      b.moving[0] = b.moving[1] = false;
      continue;
    }
    stepLane(b, 0, dt);
    stepLane(b, 1, dt);
  }
}

// ------------------------------------------------------------------ conexiones según la geometría

/** Lo que el mundo sabe de una posición: la cinta que hay (o null). */
export type BeltAt = (x: number, y: number, z: number) => Belt | null;

/** ¿Puede esta pieza pasarle objetos a otra? (la entrada de una subterránea sólo los manda por su túnel) */
function canFeed(b: Belt): boolean {
  return b.kind !== K_UG_IN && b.kind !== K_TUNNEL;
}

/**
 * Carril de `from` (que va en el sentido `dB`) que puede entrar de lado en la subterránea `u` (sentido `dU`): sólo el que cae en la
 * mitad abierta (atrás en la entrada, delante en la salida); el otro queda bajo la capucha.
 */
function openLane(u: Belt, dB: number): 0 | 1 {
  const dU = u.dir;
  const leftIsFront = dB === (dU + 1) % 4; // el carril izquierdo cae hacia delante de `u`
  if (u.kind === K_UG_IN) return leftIsFront ? 1 : 0; // mitad abierta: atrás
  return leftIsFront ? 0 : 1; // salida: mitad abierta delante
}

/**
 * Calcula a dónde pasa los objetos `b` y de qué forma es (recta o curva), según las cintas de alrededor.
 * - Delante hay una cinta que no mira hacia `b`: si mira igual, es de espalda (o curva) → side 0; si `b` le llega por un costado,
 *   es carga lateral, salvo que esa cinta sea una CURVA que recibe justo de `b` (sin nada detrás y con `b` de único alimentador
 *   lateral), en cuyo caso se enlaza como espalda (los carriles se conservan).
 * - Subterráneas: a una entrada se le puede pasar de espaldas o de lado (un solo carril); a una salida sólo de lado (un solo carril).
 *   Un divisor sólo recibe de espaldas.
 * - `shape`: 0 recta, 1 curva que recibe de la izquierda, 2 curva que recibe de la derecha (sólo las cintas normales).
 * Los túneles y las entradas de subterráneas no se enlazan aquí: su salida la pone quien los empareja.
 */
export function relink(b: Belt, at: BeltAt): { shape: 0 | 1 | 2 } {
  if (b.kind === K_TUNNEL || b.kind === K_UG_IN) return { shape: 0 };
  const d = b.dir;
  const front = at(b.x + BELT_DX[d], b.y, b.z + BELT_DZ[d]);
  b.out = null;
  if (front && front.dir !== (d + 2) % 4 && front.kind !== K_TUNNEL) {
    if (front.kind === K_UG_OUT) {
      // La salida no recibe de espaldas; de lado, sólo el carril de su mitad abierta.
      if (front.dir !== d) b.out = { to: front, side: d === (front.dir + 1) % 4 ? -1 : 1, only: openLane(front, d) };
    } else if (front.kind === K_UG_IN) {
      if (front.dir === d) b.out = { to: front, side: 0 };
      else b.out = { to: front, side: d === (front.dir + 1) % 4 ? -1 : 1, only: openLane(front, d) };
    } else if (front.kind === K_SPLIT) {
      if (front.dir === d) b.out = { to: front, side: 0 };
    } else if (front.dir === d) b.out = { to: front, side: 0 };
    else {
      const info = shapeOf(front, at);
      if (info.shape !== 0 && info.from === b) b.out = { to: front, side: 0 }; // curva: carriles conservados
      // Si `b` está en el lado izquierdo de `front` (mira hacia el (fd + 1) % 4), carga su carril izquierdo (-1); si no, el derecho.
      else b.out = { to: front, side: d === (front.dir + 1) % 4 ? -1 : 1 };
    }
  }
  return { shape: b.kind === K_BELT ? shapeOf(b, at).shape : 0 };
}

/** ¿Es `b` una curva? (sin cinta detrás y con un único alimentador lateral): su forma y quién le alimenta. */
export function shapeOf(b: Belt, at: BeltAt): { shape: 0 | 1 | 2; from: Belt | null } {
  if (b.kind !== K_BELT) return { shape: 0, from: null };
  const d = b.dir;
  const back = at(b.x - BELT_DX[d], b.y, b.z - BELT_DZ[d]);
  if (back && back.dir === d && canFeed(back)) return { shape: 0, from: null };
  // Alimentadores laterales: cintas de un costado que miran hacia `b`.
  const leftDir = (d + 3) % 4, rightDir = (d + 1) % 4;
  const left = at(b.x + BELT_DX[leftDir], b.y, b.z + BELT_DZ[leftDir]);
  const right = at(b.x + BELT_DX[rightDir], b.y, b.z + BELT_DZ[rightDir]);
  const fromLeft = left && left.dir === rightDir && canFeed(left) && left.kind !== K_SPLIT ? left : null; // mira hacia mi derecha, o sea, hacia mí
  const fromRight = right && right.dir === leftDir && canFeed(right) && right.kind !== K_SPLIT ? right : null;
  if (fromLeft && !fromRight) return { shape: 1, from: fromLeft };
  if (fromRight && !fromLeft) return { shape: 2, from: fromRight };
  return { shape: 0, from: null };
}

// ------------------------------------------------------------------ guardado

export interface BeltSave {
  x: number;
  y: number;
  z: number;
  /** [carril, id, posición (0..255), datos] de cada objeto. */
  items: [number, number, number][];
}

export function saveBelt(b: Belt): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (let l = 0; l < 2; l++) for (const it of b.lanes[l]) out.push([l, it.s.id, Math.round(it.p * 255)]);
  return out;
}

export function loadBelt(b: Belt, items: readonly (readonly number[])[]): void {
  b.lanes = [[], []];
  for (const [l, id, p8] of items) {
    if ((l !== 0 && l !== 1) || !Number.isInteger(id) || !Number.isFinite(p8)) continue;
    b.lanes[l].push({ s: { id, count: 1 }, p: Math.max(0, Math.min(0.999, p8 / 255)) });
  }
  for (const lane of b.lanes) lane.sort((a, c) => c.p - a.p);
}
