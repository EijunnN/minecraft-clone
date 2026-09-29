// Programa lunar: los bloques de los fluidos. Registrados los últimos: ids nuevos.
// - Tubería: 1×1; el estado es qué caras tiene unidas (6 bits) y lo calcula el servidor según lo que haya alrededor.
// - Tubería subterránea: una punta que asoma por un lado y se une a su pareja a hasta 10 casillas por el lado contrario.
// - Tanque de almacenamiento: 3×3 y 2 de alto (25 000). Se une por las casillas de abajo.
// - Bomba: 1×2 orientada; mueve 1 200/s de lo que tiene detrás a lo que tiene delante (necesita energía).
// - Bomba de agua (offshore): 1×1 orientada; con agua detrás da 1 200/s por delante, sin energía.
import { family, L, R_MODEL, familyBase, stateProps } from './registry';
import { multiblock, multiInfo } from './multiblock';
import { mbox, rotateBoxes, type ModelBox } from '../blockModels';
import { POWER_BLOCKS } from './powerBlocks';
import { LOGISTICS_INVENTORY } from './logisticsBlocks';

const METAL = { hardness: 2, tool: 'pickaxe' as const, tier: 0, sound: 'metal' as const, category: 'logistica' as const };
const six = (n: number) => [n, n, n, n, n, n];

// Bits de las caras de una tubería: 0 +x, 1 −x, 2 +y, 3 −y, 4 +z, 5 −z.
export const PIPE_FACE_DX = [1, -1, 0, 0, 0, 0] as const;
export const PIPE_FACE_DY = [0, 0, 1, -1, 0, 0] as const;
export const PIPE_FACE_DZ = [0, 0, 0, 0, 1, -1] as const;
/** La cara contraria de una cara (0↔1, 2↔3, 4↔5). */
export const oppositeFace = (f: number): number => f ^ 1;
/** Cara (0..5) de un sentido horizontal de las cintas (0 +x, 1 +z, 2 −x, 3 −z). */
export const faceOfDir = (dir: number): number => [0, 4, 1, 5][dir & 3];

function armBox(face: number): ModelBox {
  const t = six(L('polished_andesite'));
  switch (face) {
    case 0: return mbox(10, 6, 6, 16, 10, 10, t);
    case 1: return mbox(0, 6, 6, 6, 10, 10, t);
    case 2: return mbox(6, 10, 6, 10, 16, 10, t);
    case 3: return mbox(6, 0, 6, 10, 6, 10, t);
    case 4: return mbox(6, 6, 10, 10, 10, 16, t);
    default: return mbox(6, 6, 0, 10, 10, 6, t);
  }
}

function pipeModel(mask: number): ModelBox[] {
  const wall = L('polished_andesite');
  const boxes = [mbox(5.5, 5.5, 5.5, 10.5, 10.5, 10.5, six(wall))];
  for (let f = 0; f < 6; f++) if (mask & (1 << f)) boxes.push(armBox(f));
  return boxes;
}

/** Tubería: la forma la calcula el servidor (Fluids); sin ninguna cara unida es un tubito suelto. */
export const PIPE = family('pipe', 'Tubería', [['c', 64]], (st) => {
  const boxes = pipeModel(st.c);
  return {
    ...METAL, render: R_MODEL, solid: false, opaque: false, lightOpacity: 0, hardness: 1, all: 'polished_andesite',
    model: boxes, itemModel: pipeModel(3), collision: [0.3, 0.3, 0.3, 0.7, 0.7, 0.7], selection: [0.25, 0.25, 0.25, 0.75, 0.75, 0.75],
  };
});

/** Máscara de caras de una tubería (0 si no lo es). */
export const pipeMask = (id: number): number => (id > 0 && familyBase(id) === PIPE ? stateProps(id)!.c : 0);
export const isPipe = (id: number): boolean => id > 0 && familyBase(id) === PIPE;
export const pipeState = (mask: number): number => PIPE + (mask & 63);

/**
 * Tubería subterránea: `dir` es el lado por el que asoma la punta (0 +x, 1 +z, 2 −x, 3 −z); por el contrario va bajo tierra.
 */
export const PIPE_TO_GROUND = family('pipe_to_ground', 'Tubería subterránea', [['dir', 4]], (st) => {
  const wall = L('polished_andesite'), cap = L('iron_block');
  // Mirando a −z (sentido 3): la punta sale por z = 0 y el «montículo» de tierra queda atrás.
  const north = [mbox(6, 6, 0, 10, 10, 6, six(wall)), mbox(4, 4, 6, 12, 12, 16, six(cap)), mbox(3, 3, 6, 13, 13, 8, six(wall))];
  const boxes = rotateBoxes(north, [1, 2, 3, 0][st.dir]);
  return {
    ...METAL, render: R_MODEL, solid: false, opaque: false, lightOpacity: 0, hardness: 1, all: 'iron_block',
    model: boxes, itemModel: rotateBoxes(north, 1), collision: [0.2, 0.2, 0.2, 0.8, 0.8, 0.8], selection: [0.2, 0.2, 0.2, 0.8, 0.8, 0.8],
  };
});
export const isUndergroundPipe = (id: number): boolean => id > 0 && familyBase(id) === PIPE_TO_GROUND;
export const undergroundPipeDir = (id: number): number => (isUndergroundPipe(id) ? stateProps(id)!.dir : -1);
export const undergroundPipeState = (dir: number): number => PIPE_TO_GROUND + (dir & 3);

/** Tanque de almacenamiento: 3×3 y 2 de alto; cuerpo de hierro con la tapa y el nivel en un lado. */
export const STORAGE_TANK = multiblock({
  key: 'storage_tank', name: 'Tanque de almacenamiento', size: [3, 2, 3], anchor: [1, 0, 1], oriented: false,
  model: [
    mbox(1, 0, 1, 47, 4, 47, six(L('polished_andesite'))),
    mbox(2, 4, 2, 46, 28, 46, [L('smooth_quartz'), L('smooth_quartz'), L('polished_andesite'), L('polished_andesite'), L('smooth_quartz'), L('smooth_quartz')]),
    mbox(1, 28, 1, 47, 31, 47, six(L('iron_block'))),
    mbox(20, 31, 20, 28, 32, 28, six(L('iron_block'))),
  ],
  opts: { ...METAL, hardness: 3 },
});
export const isTankBlock = (id: number): boolean => id > 0 && familyBase(id) === STORAGE_TANK;

/**
 * Bomba: 1×2 y 1 de alto, mirando al norte en el modelo: `dir` es hacia donde empuja. La casilla principal es la de delante; la de atrás
 * recibe. Por sus dos extremos se une a tuberías.
 */
export const PUMP = multiblock({
  key: 'pump', name: 'Bomba', size: [1, 1, 2], anchor: [0, 0, 0], oriented: true,
  model: [
    mbox(4, 0, 0, 12, 4, 32, six(L('iron_block'))),
    mbox(3, 4, 6, 13, 12, 26, six(L('polished_andesite'))),
    mbox(6, 12, 12, 10, 15, 20, six(L('iron_block'))),
    mbox(6, 6, 0, 10, 10, 2, six(L('polished_andesite'))),
    mbox(6, 6, 30, 10, 10, 32, six(L('polished_andesite'))),
  ],
  opts: { ...METAL },
});
export const isPumpBlock = (id: number): boolean => id > 0 && familyBase(id) === PUMP;

/** Bomba de agua (offshore): `dir` es el lado por el que sale el agua; el agua tiene que estar detrás. */
export const OFFSHORE_PUMP = family('offshore_pump', 'Bomba de agua', [['dir', 4]], (st) => {
  const iron = L('iron_block'), wall = L('polished_andesite');
  const north = [mbox(3, 0, 5, 13, 8, 16, six(iron)), mbox(5, 8, 7, 11, 13, 13, six(wall)), mbox(6, 5, 0, 10, 9, 5, six(wall))];
  const boxes = rotateBoxes(north, [1, 2, 3, 0][st.dir]);
  return {
    ...METAL, render: R_MODEL, solid: false, opaque: false, lightOpacity: 0, hardness: 1.5, all: 'iron_block',
    model: boxes, itemModel: rotateBoxes(north, 1), collision: [0.15, 0, 0.15, 0.85, 0.8, 0.85], selection: [0.15, 0, 0.15, 0.85, 0.8, 0.85],
  };
});
export const isOffshorePump = (id: number): boolean => id > 0 && familyBase(id) === OFFSHORE_PUMP;
export const offshorePumpDir = (id: number): number => (isOffshorePump(id) ? stateProps(id)!.dir : -1);

/** Casilla principal de un tanque o bomba (null si no lo es o es otra casilla). */
export function fluidMachineInfo(id: number): { kind: 'tank' | 'pump'; dir: number } | null {
  if (!isTankBlock(id) && !isPumpBlock(id)) return null;
  const i = multiInfo(id);
  return i && i.controller ? { kind: isTankBlock(id) ? 'tank' : 'pump', dir: i.dir } : null;
}

/**
 * Pozo de petróleo (pumpjack): 3×3 y 3 de alto; se pone sobre un pozo (el bloque de debajo del centro) y saca petróleo crudo por delante.
 * `dir` (0 +x, 1 +z, 2 −x, 3 −z) es hacia donde asoma la conexión de tubería (en el centro del lado).
 */
export const PUMPJACK = multiblock({
  key: 'pumpjack', name: 'Pozo de petróleo (bomba)', size: [3, 3, 3], anchor: [1, 0, 1], oriented: true,
  model: [
    mbox(2, 0, 2, 46, 4, 46, six(L('polished_andesite'))),
    mbox(18, 4, 18, 30, 30, 30, six(L('iron_block'))),
    mbox(6, 30, 20, 42, 36, 28, six(L('iron_block'))), // el balancín
    mbox(38, 20, 21, 46, 34, 27, six(L('polished_andesite'))),
    mbox(20, 4, 0, 28, 12, 18, six(L('polished_andesite'))), // la salida, dentro de UNA casilla de delante
  ],
  opts: { ...METAL, hardness: 3 },
});
export const isPumpjack = (id: number): boolean => id > 0 && familyBase(id) === PUMPJACK;

/**
 * Caldera: 3×2 y 2 de alto, mirando al norte en el modelo (`dir`: hacia donde sale el vapor, por el centro del frente). El agua entra y
 * sale por los dos extremos de atrás. Quema el combustible que le meta un brazo. La casilla principal es el centro del frente.
 */
export const BOILER = multiblock({
  key: 'boiler', name: 'Caldera', size: [3, 2, 2], anchor: [1, 0, 0], oriented: true,
  model: [
    mbox(0, 0, 0, 48, 4, 32, six(L('polished_andesite'))),
    mbox(2, 4, 8, 46, 26, 30, six(L('iron_block'))), // el depósito
    mbox(18, 4, 0, 30, 20, 8, [L('furnace_side'), L('furnace_side'), L('furnace_top'), L('furnace_top'), L('furnace_side'), L('furnace_front')]), // la boca del fuego
    mbox(20, 26, 14, 28, 32, 22, six(L('iron_block'))), // la chimenea
  ],
  opts: { ...METAL, hardness: 3 },
});
export const isBoiler = (id: number): boolean => id > 0 && familyBase(id) === BOILER;

/**
 * Máquina de vapor: 3×5 y 2 de alto; el vapor entra por un extremo y sale por el otro (se encadenan en fila). `dir` es el sentido de la
 * fila. La casilla principal es la del centro. 900 kW con 30 de vapor por segundo.
 */
export const STEAM_ENGINE = multiblock({
  key: 'steam_engine', name: 'Máquina de vapor', size: [3, 2, 5], anchor: [1, 0, 2], oriented: true,
  model: [
    mbox(0, 0, 0, 48, 4, 80, six(L('polished_andesite'))),
    mbox(10, 4, 2, 38, 24, 78, six(L('iron_block'))),
    mbox(4, 4, 24, 44, 14, 56, six(L('polished_andesite'))), // el cilindro
    mbox(20, 24, 12, 28, 32, 68, six(L('iron_block'))), // el eje
  ],
  opts: { ...METAL, hardness: 3 },
});
export const isSteamEngine = (id: number): boolean => id > 0 && familyBase(id) === STEAM_ENGINE;

/** Todo lo de los fluidos que se coloca con «fantasma» y sale en el inventario. */
export const FLUID_BLOCKS: readonly number[] = [PIPE, PIPE_TO_GROUND, STORAGE_TANK, PUMP, OFFSHORE_PUMP, PUMPJACK, BOILER, STEAM_ENGINE];
(POWER_BLOCKS as number[]).push(PUMP, PUMPJACK, BOILER, STEAM_ENGINE); // la bomba lleva energía; la de agua no
(LOGISTICS_INVENTORY as number[]).push(PIPE, PIPE_TO_GROUND, STORAGE_TANK, OFFSHORE_PUMP);
export const FLUID_INVENTORY: readonly number[] = [...FLUID_BLOCKS];
