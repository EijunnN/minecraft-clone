// Programa lunar (idea-industria.md): los bloques de la logística. Registrados los últimos: ids nuevos.
// - Cinta transportadora, en tres niveles (básica, rápida, exprés), cada uno su propia familia: 4 sentidos × 3 formas (recta,
//   curva que recibe de la izquierda y curva que recibe de la derecha). El sentido lo elige el jugador al ponerla; la forma la
//   calcula el servidor según las cintas de alrededor (Belts), como las escaleras. Su movimiento (el motor) está en
//   shared/logistics/belts.ts.
// El sentido `dir` es el de logistics/belts: 0 +x, 1 +z, 2 −x, 3 −z.
import { family, L, R_MODEL, familyBase, stateProps } from './registry';
import { mbox, rotateBoxes } from '../blockModels';
import { BELT_TIER_NAMES } from '../logistics/belts';
import { INSERTER_TYPES } from '../logistics/inserters';
import { multiblock, multiInfo, turnModel } from './multiblock';

/** Altura de la cinta sobre el suelo (16 = un bloque). */
export const BELT_HEIGHT_PX = 4;

/**
 * Nombre de la textura de la cara de arriba de una cinta (nivel y sentido; las curvas usan la de su sentido). Sólo hay 1 024 capas de
 * textura en el vértice y casi están todas: de lado, las cintas y los brazos reutilizan la chapa del bloque de hierro.
 */
export const beltTopTexture = (tier: number, dir: number) => `belt_t${tier}_d${dir}`;
const METAL = 'iron_block';

/** El movimiento que anima la textura de arriba (special del shader): 7 + nivel·4 + sentido. */
export const beltSpecial = (tier: number, dir: number) => 7 + tier * 4 + dir;

const H = BELT_HEIGHT_PX;

function beltFamily(tier: number): number {
  const key = tier === 0 ? 'belt' : tier === 1 ? 'belt_fast' : 'belt_express';
  const name = `Cinta transportadora ${BELT_TIER_NAMES[tier]}`;
  return family(key, name, [['dir', 4], ['shape', 3]], (st) => {
    const top = L(beltTopTexture(tier, st.dir));
    const side = L(METAL);
    const boxes = [mbox(0, 0, 0, 16, H, 16, [side, side, top, side, side, side])];
    const box = [0, 0, 0, 1, H / 16, 1];
    return {
      render: R_MODEL, solid: true, opaque: false, lightOpacity: 0, hardness: 1.5, tool: 'pickaxe', tier: 0, sound: 'metal',
      category: 'logistica', all: METAL, model: boxes, itemModel: boxes, collision: box, selection: box,
    };
  });
}

/** Las familias de cintas: básica, rápida y exprés. */
export const BELTS: readonly number[] = [beltFamily(0), beltFamily(1), beltFamily(2)];

/** ¿Es una cinta? Y de qué nivel, sentido y forma (null si no lo es). */
export function beltInfo(id: number): { tier: number; dir: number; shape: number } | null {
  if (id <= 0) return null;
  const base = familyBase(id);
  const tier = BELTS.indexOf(base);
  if (tier < 0) return null;
  const st = stateProps(id)!;
  return { tier, dir: st.dir, shape: st.shape };
}

export function isBelt(id: number): boolean {
  return id > 0 && BELTS.includes(familyBase(id));
}

/** Id del estado de una cinta de ese nivel, sentido y forma. */
export function beltState(tier: number, dir: number, shape: number): number {
  return BELTS[tier] + (dir % 4) + 4 * shape; // dir es la primera propiedad (paso 1) y shape la segunda (paso 4)
}

// ------------------------------------------------------------------ subterráneas
// Como en Factorio (`underground-belt`): una ENTRADA y una SALIDA en línea, con el mismo sentido y del mismo nivel, a `max_distance`
// bloques o menos (5, 7 y 9); lo que entra sale por la otra sin ocupar lo de en medio. Cada pieza es media cinta con una capucha sobre
// la otra mitad: la entrada tapa la parte de delante, la salida la de atrás. Se emparejan solas al colocarlas.
/** Distancia máxima entre la entrada y la salida de cada nivel (`underground-belt.max_distance`). */
export const UNDERGROUND_MAX = [5, 7, 9] as const;
const UG_KEYS = ['underground_belt', 'underground_belt_fast', 'underground_belt_express'] as const;

function undergroundFamily(tier: number): number {
  return family(UG_KEYS[tier], `Cinta subterránea ${BELT_TIER_NAMES[tier]}`, [['dir', 4], ['kind', 2]], (st) => {
    const top = L(beltTopTexture(tier, st.dir));
    const side = L(METAL);
    // Mirando a −z (sentido 3): delante es z 0..8 y atrás z 8..16. La capucha cubre delante en la entrada y atrás en la salida.
    const hood = st.kind === 0 ? mbox(1, H, 0, 15, 10, 8, side) : mbox(1, H, 8, 15, 10, 16, side);
    const north = [mbox(0, 0, 0, 16, H, 16, [side, side, top, side, side, side]), hood];
    const boxes = rotateBoxes(north, [1, 2, 3, 0][st.dir]);
    const box = [0, 0, 0, 1, 10 / 16, 1];
    return {
      render: R_MODEL, solid: true, opaque: false, lightOpacity: 0, hardness: 1.5, tool: 'pickaxe', tier: 0, sound: 'metal',
      category: 'logistica', all: METAL, model: boxes, itemModel: boxes, collision: box, selection: box,
    };
  });
}

export const UNDERGROUNDS: readonly number[] = [undergroundFamily(0), undergroundFamily(1), undergroundFamily(2)];

/** Nivel, sentido y tipo (0 entrada, 1 salida) de una subterránea (null si no lo es). */
export function undergroundInfo(id: number): { tier: number; dir: number; kind: number } | null {
  if (id <= 0) return null;
  const tier = UNDERGROUNDS.indexOf(familyBase(id));
  if (tier < 0) return null;
  const st = stateProps(id)!;
  return { tier, dir: st.dir, kind: st.kind };
}

export function isUnderground(id: number): boolean {
  return id > 0 && UNDERGROUNDS.includes(familyBase(id));
}

/** Id de la subterránea de ese nivel, sentido y tipo. */
export function undergroundState(tier: number, dir: number, kind: number): number {
  return UNDERGROUNDS[tier] + (dir % 4) + 4 * (kind & 1);
}

// ------------------------------------------------------------------ divisores
// Como en Factorio (`splitter`): 2×1, dos entradas y dos salidas; reparte los objetos entre las dos salidas (alternando por carril), con
// prioridad de entrada y de salida y un filtro de objeto que manda lo suyo a un lado. Es una máquina de dos casillas: la de la izquierda
// (mirando en el sentido de marcha) es la pieza 0 y la de la derecha, la 1.
const SPLIT_KEYS = ['splitter', 'splitter_fast', 'splitter_express'] as const;
const SPLIT_STRIPE = ['yellow_concrete', 'red_concrete', 'blue_concrete'] as const;

function splitterFamily(tier: number): number {
  const north = (dir: number) => {
    const top = L(beltTopTexture(tier, dir));
    const side = L(METAL);
    const stripe = L(SPLIT_STRIPE[tier]);
    return [
      mbox(0, 0, 0, 32, H, 16, [side, side, top, side, side, side]), // las dos cintas, cada una en su casilla
      mbox(12, H, 2, 20, 10, 14, [stripe, stripe, stripe, stripe, stripe, stripe]), // el cuerpo del divisor, entre las dos
      mbox(2, H, 0, 30, 7, 2, six(side)), // un reborde por delante y por detrás
      mbox(2, H, 14, 30, 7, 16, six(side)),
    ];
  };
  return multiblock({
    key: SPLIT_KEYS[tier], name: `Divisor ${BELT_TIER_NAMES[tier]}`, size: [2, 1, 1], anchor: [0, 0, 0], oriented: true,
    model: north(3), modelFor: (dir) => turnModel(north(dir), 2, 1, dir),
    opts: { hardness: 1.5, tool: 'pickaxe', tier: 0, sound: 'metal', category: 'logistica' },
  });
}
const six = (n: number) => [n, n, n, n, n, n];

export const SPLITTERS: readonly number[] = [splitterFamily(0), splitterFamily(1), splitterFamily(2)];

/** Nivel, sentido y mitad (0 izquierda, 1 derecha) de un divisor (null si no lo es). */
export function splitterInfo(id: number): { tier: number; dir: number; half: number } | null {
  if (id <= 0) return null;
  const tier = SPLITTERS.indexOf(familyBase(id));
  if (tier < 0) return null;
  const m = multiInfo(id)!;
  return { tier, dir: m.dir, half: m.part };
}

export function isSplitter(id: number): boolean {
  return id > 0 && SPLITTERS.includes(familyBase(id));
}

/** ¿Es una pieza de la red de cintas (cinta, subterránea o casilla de un divisor)? Lo que los brazos y las máquinas ven como «cinta». */
export function isBeltLike(id: number): boolean {
  return isBelt(id) || isUnderground(id) || isSplitter(id);
}

// ------------------------------------------------------------------ brazos (inserters)
// Un brazo coge un objeto de lo que tiene DETRÁS y lo deja en lo que tiene DELANTE (cofres, hornos, cintas…). `dir` es el sentido
// en que mueve los objetos (0 +x, 1 +z, 2 −x, 3 −z); se pone mirando hacia donde mira el jugador, como las cintas. Dos niveles:
// el básico da 0,83 vueltas por segundo (como el de Factorio) y el rápido, 2,3.
// Cinco tipos (logistics/inserters.ts): básico, rápido, largo, de combustible y a granel. El de arriba de la lista es el que sale en
// el inventario. Las piezas que se mueven (el brazo, la mano) se dibujan en el cliente; el bloque es la peana y el poste.
export const INSERTER_PAINT = ['orange_concrete', 'blue_concrete', 'red_concrete', 'brown_concrete', 'green_concrete'] as const;

function inserterFamily(tier: number): number {
  const t = INSERTER_TYPES[tier];
  return family(t.key, `Brazo ${t.name}`, [['dir', 4]], (st) => {
    const metal = L(METAL);
    const paint = L(INSERTER_PAINT[tier]);
    // Mirando a −z (la dirección 3): la peana y el poste. El brazo, la pinza y lo que lleva se dibujan en el cliente (siguen el trabajo
    // del brazo); la peana lleva una marca del lado de la pinza.
    const north = [
      mbox(3, 0, 3, 13, 3, 13, [metal, metal, metal, metal, metal, metal]),
      mbox(6, 3, 6, 10, 9, 10, [paint, paint, paint, paint, paint, paint]),
      mbox(5, 3, 1, 11, 4, 4, [paint, paint, paint, paint, paint, paint]),
    ];
    // Los giros de modelBoxes llevan el norte al este…: −z (dir 3) → norte, +x (dir 0) → este, +z (dir 1) → sur, −x (dir 2) → oeste.
    const turns = [1, 2, 3, 0][st.dir];
    const boxes = rotateBoxes(north, turns);
    const box = [0, 0, 0, 1, 9 / 16, 1];
    return {
      render: R_MODEL, solid: false, opaque: false, lightOpacity: 0, hardness: 1.5, tool: 'pickaxe', tier: 0, sound: 'metal',
      category: 'logistica', all: METAL, model: boxes, itemModel: rotateBoxes(north, 1), collision: box, selection: box,
    };
  });
}

/** Los cinco tipos de brazos (logistics/inserters.ts). */
export const INSERTERS: readonly number[] = INSERTER_TYPES.map((_, i) => inserterFamily(i));

export function isInserter(id: number): boolean {
  return id > 0 && INSERTERS.includes(familyBase(id));
}

/** Nivel y sentido de un brazo (null si no lo es). */
export function inserterInfo(id: number): { tier: number; dir: number } | null {
  if (id <= 0) return null;
  const tier = INSERTERS.indexOf(familyBase(id));
  return tier < 0 ? null : { tier, dir: stateProps(id)!.dir };
}

/** Id del brazo de ese nivel y sentido. */
export function inserterState(tier: number, dir: number): number {
  return INSERTERS[tier] + (dir % 4);
}

/** Su sitio en el inventario creativo. */
export const LOGISTICS_INVENTORY: readonly number[] = [...BELTS, ...UNDERGROUNDS, ...SPLITTERS, ...INSERTERS];
/**
 * Lo que se coloca con «fantasma» sin ser eléctrico: la logística y, después, los hornos de combustible y los fluidos (lo añaden sus
 * módulos). Aparte del inventario creativo, donde cada familia sale en su propia sección (si no, salían repetidos).
 */
export const GHOST_BLOCKS: number[] = [...LOGISTICS_INVENTORY];
