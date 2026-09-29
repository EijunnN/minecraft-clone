// Programa lunar (FACTORIO-REFERENCIA.md §7 y plan, punto 2): entidades de varias casillas.
//
// Factorio tiene extractores de 3×3, paneles de 3×3, acumuladores de 2×2, hornos y ensambladoras de 3×3… y Minecraft sólo bloques de 1.
// Solución: una máquina es una FAMILIA de bloques con un estado por casilla de su huella. Cada casilla dibuja su porción del modelo
// entero (con el mismo motor de siempre: luz, sombras, colisión y selección salen solas) y todas saben dónde está la casilla PRINCIPAL
// (el «ancla»), que es la que guarda el estado de la máquina y lleva el objeto de inventario (el estado 0). Colocar pone toda la huella
// de una vez; romper cualquier casilla quita la máquina entera (sistema MultiBlocks del servidor).
//
// Modelo: cajas en dieciseisavos, en el espacio de la huella entera (ancho·16 × alto·16 × fondo·16), mirando al norte (−Z). Como las
// UV salen de la posición dentro de cada casilla, una textura que cruce casillas se repite en cada una: lo que deba verse entero
// (una puerta, una pantalla) se dibuja dentro de UNA casilla.
// Orientación: la propiedad `dir` es la de las cintas (0 +x, 1 +z, 2 −x, 3 −z; el modelo mira a dir 3), sólo si la máquina es orientable.
import { family, familyBase, stateProps, stateOf, R_MODEL, type Opts } from './registry';
import { flatBoxes, unionBox, type ModelBox } from '../blockModels';

export interface MultiSpec {
  key: string;
  name: string;
  /** [ancho (x), alto (y), fondo (z)] en casillas, con el modelo mirando al norte. */
  size: [number, number, number];
  /** Casilla principal dentro de la huella (mirando al norte): la que guarda el estado y se pone donde apunta el jugador. */
  anchor: [number, number, number];
  /** Si tiene delante (y se gira con `dir`) o es igual mirando a cualquier lado. */
  oriented: boolean;
  /** Cajas del modelo entero (en dieciseisavos, en el espacio de la huella). */
  model: ModelBox[];
  /**
   * Alternativa a `model` para lo que no se puede girar sin más (una textura con flechas, por ejemplo): las cajas ya giradas para el
   * sentido `dir` (0 +x, 1 +z, 2 −x, 3 −z), en el espacio de la huella de ESE sentido (ancho y fondo ya intercambiados).
   */
  modelFor?: (dir: number) => ModelBox[];
  /** Dureza, herramienta, sonido y categoría del bloque. */
  opts: Opts;
}

interface Turned {
  boxes: ModelBox[];
  /** Ancho y fondo (casillas) tras girar. */
  w: number;
  d: number;
  /** Casilla (x, y, z) de cada parte tras girar, en el orden de las partes (0 = ancla). */
  cells: [number, number, number][];
}

export interface Multi {
  spec: MultiSpec;
  base: number;
  /** Huella de cada sentido (uno solo si no es orientable). */
  turned: Turned[];
  /** Casillas de la huella sin girar, con el ancla primero. */
  parts: number;
}

const MULTI = new Map<number, Multi>();
/** Giros que hay que dar al modelo (mirando al norte) para cada sentido de las cintas: dir 3 → 0, 0 → 1, 1 → 2, 2 → 3. */
const TURNS = [1, 2, 3, 0] as const;

/** Un giro de 90° de todo el modelo alrededor del centro de la huella (ancho w, fondo d): (x, z) → (d·16 − z, x). */
function turnOnce(boxes: ModelBox[], d: number): ModelBox[] {
  return boxes.map((b) => {
    const ax = d * 16 - b.z0, bx = d * 16 - b.z1;
    const t = b.tex;
    return {
      x0: Math.min(ax, bx), x1: Math.max(ax, bx), y0: b.y0, y1: b.y1, z0: b.x0, z1: b.x1,
      tex: [t[5], t[4], t[2], t[3], t[0], t[1]],
    };
  });
}

function turnAll(spec: MultiSpec, cells0: [number, number, number][], turns: number, dir: number): Turned {
  let boxes = spec.modelFor ? spec.modelFor(dir) : spec.model;
  let w = spec.size[0], d = spec.size[2];
  let cells = cells0;
  for (let k = 0; k < turns; k++) {
    if (!spec.modelFor) boxes = turnOnce(boxes, d);
    cells = cells.map(([cx, cy, cz]) => [d - 1 - cz, cy, cx] as [number, number, number]);
    [w, d] = [d, w];
  }
  return { boxes, w, d, cells };
}

/** Recorta el modelo a la casilla (cx, cy, cz): sólo lo que cae dentro, en coordenadas de esa casilla; sin las caras del corte. */
function slice(boxes: ModelBox[], cx: number, cy: number, cz: number): ModelBox[] {
  const c0 = [cx * 16, cy * 16, cz * 16];
  const out: ModelBox[] = [];
  for (const b of boxes) {
    const lo = [b.x0, b.y0, b.z0], hi = [b.x1, b.y1, b.z1];
    const nl = lo.map((v, i) => Math.max(v, c0[i])), nh = hi.map((v, i) => Math.min(v, c0[i] + 16));
    if (nl.some((v, i) => v >= nh[i])) continue;
    const tex = b.tex.slice();
    for (let a = 0; a < 3; a++) {
      if (nh[a] < hi[a]) tex[a * 2] = -1; // se cortó por el lado + del eje: esa cara no existe
      if (nl[a] > lo[a]) tex[a * 2 + 1] = -1;
    }
    out.push({ x0: nl[0] - c0[0], y0: nl[1] - c0[1], z0: nl[2] - c0[2], x1: nh[0] - c0[0], y1: nh[1] - c0[1], z1: nh[2] - c0[2], tex });
  }
  return out;
}

/** Registra una máquina de varias casillas y devuelve el id de su estado base (el controlador, mirando al sentido 0). */
export function multiblock(spec: MultiSpec): number {
  const [w, h, d] = spec.size;
  // Casillas de la huella con el ancla primero.
  const all: [number, number, number][] = [];
  for (let y = 0; y < h; y++) for (let z = 0; z < d; z++) for (let x = 0; x < w; x++) all.push([x, y, z]);
  const [ax, ay, az] = spec.anchor;
  const cells0 = [[ax, ay, az] as [number, number, number], ...all.filter(([x, y, z]) => !(x === ax && y === ay && z === az))];
  const dirs = spec.oriented ? 4 : 1;
  const turned: Turned[] = [];
  for (let dir = 0; dir < dirs; dir++) turned.push(turnAll(spec, cells0, spec.oriented ? TURNS[dir] : 0, dir));

  const props: [string, number][] = spec.oriented ? [['dir', 4], ['part', cells0.length]] : [['part', cells0.length]];
  // Modelo del objeto (en la mano y el inventario): la máquina entera, encogida para que quepa en un bloque y centrada.
  const s = 1 / Math.max(w, h, d);
  const item = spec.model.map((b) => ({
    x0: b.x0 * s + (16 - w * 16 * s) / 2, x1: b.x1 * s + (16 - w * 16 * s) / 2,
    y0: b.y0 * s, y1: b.y1 * s,
    z0: b.z0 * s + (16 - d * 16 * s) / 2, z1: b.z1 * s + (16 - d * 16 * s) / 2, tex: b.tex.slice(),
  }));
  const base = family(spec.key, spec.name, props, (st) => {
    const t = turned[spec.oriented ? st.dir : 0];
    const [cx, cy, cz] = t.cells[st.part];
    const mine = slice(t.boxes, cx, cy, cz);
    // La selección (el contorno y el rayo) es la de la máquina entera, vista desde esta casilla.
    const whole = unionBox(flatBoxes(t.boxes));
    const sel = [whole[0] - cx, whole[1] - cy, whole[2] - cz, whole[3] - cx, whole[4] - cy, whole[5] - cz];
    return {
      ...spec.opts, render: R_MODEL, opaque: false, lightOpacity: 0, solid: true, model: mine, itemModel: item,
      collision: flatBoxes(mine), selection: sel,
    };
  });
  MULTI.set(base, { spec, base, turned, parts: cells0.length });
  return base;
}

/** ¿Es una casilla de una máquina de varias casillas? */
export function isMultiPart(id: number): boolean {
  return id > 0 && MULTI.has(familyBase(id));
}

/** La máquina a la que pertenece `id` (null si no es de ninguna). */
export function multiOf(id: number): Multi | null {
  return id > 0 ? MULTI.get(familyBase(id)) ?? null : null;
}

export interface MultiInfo {
  multi: Multi;
  /** Sentido (0 si no es orientable) y parte (0 = el ancla, que es el controlador). */
  dir: number;
  part: number;
  /** Casilla de esta parte dentro de la huella ya girada, y la del ancla. */
  cell: [number, number, number];
  anchor: [number, number, number];
  /** ¿Es la casilla principal? */
  controller: boolean;
}

export function multiInfo(id: number): MultiInfo | null {
  const multi = multiOf(id);
  if (!multi) return null;
  const st = stateProps(id)!;
  const dir = multi.spec.oriented ? st.dir : 0;
  const t = multi.turned[dir];
  return { multi, dir, part: st.part, cell: t.cells[st.part], anchor: t.cells[0], controller: st.part === 0 };
}

/** Posición del controlador de la máquina de la casilla (x, y, z) cuyo bloque es `id`. */
export function multiControllerPos(id: number, x: number, y: number, z: number): [number, number, number] | null {
  const i = multiInfo(id);
  if (!i) return null;
  return [x - (i.cell[0] - i.anchor[0]), y - (i.cell[1] - i.anchor[1]), z - (i.cell[2] - i.anchor[2])];
}

/** Caja (esquinas mínima y máxima, en bloques) que ocupa la máquina de la casilla (x, y, z). */
export function multiBox(id: number, x: number, y: number, z: number): [number, number, number, number, number, number] | null {
  const i = multiInfo(id);
  const c = multiControllerPos(id, x, y, z);
  if (!i || !c) return null;
  const t = i.multi.turned[i.dir];
  const ox = c[0] - i.anchor[0], oy = c[1] - i.anchor[1], oz = c[2] - i.anchor[2];
  return [ox, oy, oz, ox + t.w, oy + i.multi.spec.size[1], oz + t.d];
}

/** Lo que hay que poner para colocar la máquina `base` con su ancla en (x, y, z) mirando al sentido `dir`: [x, y, z, id] de cada casilla. */
export function multiFootprint(base: number, dir: number, x: number, y: number, z: number): [number, number, number, number][] {
  const multi = MULTI.get(familyBase(base));
  if (!multi) return [];
  const d = multi.spec.oriented ? dir & 3 : 0;
  const t = multi.turned[d];
  const [ax, ay, az] = t.cells[0];
  return t.cells.map(([cx, cy, cz], part) => [
    x + cx - ax, y + cy - ay, z + cz - az, stateOf(multi.base, multi.spec.oriented ? { dir: d, part } : { part }),
  ]);
}

/** El modelo entero de la máquina de `id` (sentido incluido), en dieciseisavos y relativo a la casilla del ancla: para el fantasma. */
export function multiFullModel(id: number): ModelBox[] | null {
  const i = multiInfo(id);
  if (!i) return null;
  const t = i.multi.turned[i.dir];
  const [ax, ay, az] = i.anchor;
  return t.boxes.map((b) => ({
    x0: b.x0 - ax * 16, x1: b.x1 - ax * 16, y0: b.y0 - ay * 16, y1: b.y1 - ay * 16, z0: b.z0 - az * 16, z1: b.z1 - az * 16, tex: b.tex.slice(),
  }));
}

/** Los estados base de todas las máquinas de varias casillas registradas (para engancharse a sus cambios). */
export function allMultiBases(): number[] {
  return [...MULTI.keys()];
}

/** Gira un modelo (mirando al norte, en el espacio de una huella de ancho `w` y fondo `d`) como las máquinas orientables: `dir` = 0 +x … 3 −z. */
export function turnModel(boxes: ModelBox[], w: number, d: number, dir: number): ModelBox[] {
  let out = boxes;
  let dd = d;
  let ww = w;
  for (let k = 0; k < TURNS[dir & 3]; k++) {
    out = turnOnce(out, dd);
    [ww, dd] = [dd, ww];
  }
  return out;
}
