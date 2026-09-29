// Programa lunar (idea-industria.md): los bloques de la energía y la primera máquina. Registrados los últimos: ids nuevos.
// Como en Factorio (FACTORIO-REFERENCIA.md §3), la energía NO pasa por contacto entre bloques: se cablea con postes.
// - Poste eléctrico pequeño (1×1, área de suministro 5×5, cable hasta 7,5) y mediano (1×1, 7×7, hasta 9).
// - Poste eléctrico grande (2×2, área 4×4, cable hasta 32) y subestación (2×2, área 18×18, cable hasta 18): entidades de varias casillas.
// - Panel solar: 3×3, 60 kW a pleno Sol y con el cielo abierto (perfil de brillo de Factorio).
// - Acumulador: 2×2, 5 MJ; carga y descarga a 300 kW.
// - Horno eléctrico: 3×3, funde lo que le entra (por un brazo o una cinta) sin combustible, a 180 kW; el resultado sale por otro brazo.
// Sólo hay 1 024 capas de textura y casi están todas: se reutilizan las de hierro, tablones, redstone y horno (más la del panel).
import { family, L, R_MODEL, familyBase } from './registry';
import { LOGISTICS_INVENTORY } from './logisticsBlocks';
import { multiblock, multiBox, multiOf, multiControllerPos } from './multiblock';
import { mbox } from '../blockModels';
import { POLES } from '../logistics/energy';

const METAL = { hardness: 2, tool: 'pickaxe' as const, tier: 0, sound: 'metal' as const, category: 'logistica' as const };

export type PoleKind = 'small' | 'medium' | 'big' | 'substation';

function poleFamily(kind: 'small' | 'medium'): number {
  const small = kind === 'small';
  return family(small ? 'electric_pole_small' : 'electric_pole_medium', small ? 'Poste eléctrico pequeño' : 'Poste eléctrico mediano', [], () => {
    const wood = L('oak_planks'), metal = L('iron_block');
    // Un mástil fino, más alto el mediano, con un travesaño arriba donde se enganchan los cables.
    const boxes = small
      ? [mbox(7, 0, 7, 9, 16, 9, wood), mbox(4, 13, 7.5, 12, 15, 8.5, wood)]
      : [mbox(6.5, 0, 6.5, 9.5, 16, 9.5, metal), mbox(3, 13, 7, 13, 15, 9, metal)];
    const box = small ? [0.4375, 0, 0.4375, 0.5625, 1, 0.5625] : [0.40625, 0, 0.40625, 0.59375, 1, 0.59375];
    return {
      ...METAL, render: R_MODEL, opaque: false, lightOpacity: 0, all: small ? 'oak_planks' : 'iron_block', sound: small ? 'wood' as const : 'metal' as const,
      hardness: 1, model: boxes, itemModel: boxes, collision: box, selection: [0.25, 0, 0.25, 0.75, 1, 0.75],
    };
  });
}

export const POLE_SMALL = poleFamily('small');
export const POLE_MEDIUM = poleFamily('medium');

// ------------------------------------------------------------------ entidades de varias casillas
// Las cajas grandes se dibujan casilla a casilla: el bloque de hierro tiene borde y marcaría las casillas; el hormigón liso, no.
const iron = () => L('iron_block'), wood = () => L('oak_planks'), shell = () => L('smooth_quartz'), dark = () => L('polished_andesite');
const six = (n: number) => [n, n, n, n, n, n];

/** Poste grande: 2×2 de base y 3 de alto; un mástil con un travesaño largo arriba. */
export const POLE_BIG = multiblock({
  key: 'electric_pole_big', name: 'Poste eléctrico grande', size: [2, 3, 2], anchor: [0, 0, 0], oriented: false,
  model: [mbox(12, 0, 12, 20, 48, 20, six(wood())), mbox(2, 38, 13, 30, 44, 19, six(wood())), mbox(6, 44, 14, 26, 46, 18, six(wood()))],
  opts: { ...METAL, hardness: 1.5, sound: 'wood' },
});

/** Subestación: 2×2 de base y 2 de alto; una caja de hierro con un mástil corto. */
export const SUBSTATION = multiblock({
  key: 'substation', name: 'Subestación', size: [2, 2, 2], anchor: [0, 0, 0], oriented: false,
  model: [mbox(4, 0, 4, 28, 20, 28, [shell(), shell(), dark(), shell(), shell(), shell()]), mbox(13, 20, 13, 19, 30, 19, six(iron())), mbox(8, 26, 14, 24, 28, 18, six(iron()))],
  opts: { ...METAL },
});

/** Panel solar: 3×3 y bajo; sus nueve casillas enseñan cada una la celda azul con su rejilla. */
export const SOLAR_PANEL = multiblock({
  key: 'solar_panel', name: 'Panel solar', size: [3, 1, 3], anchor: [1, 0, 1], oriented: false,
  model: [mbox(0, 0, 0, 48, 6, 48, [dark(), dark(), L('solar_panel_top'), dark(), dark(), dark()])],
  opts: { ...METAL },
});

/** Acumulador: 2×2 y 2 de alto; el cuerpo de hierro con la tapa roja. */
export const ACCUMULATOR = multiblock({
  key: 'accumulator', name: 'Acumulador', size: [2, 2, 2], anchor: [0, 0, 0], oriented: false,
  model: [mbox(2, 0, 2, 30, 30, 30, [dark(), dark(), L('redstone_block'), dark(), dark(), dark()])],
  opts: { ...METAL },
});

/** Horno eléctrico: 3×3 y 2 de alto, con la boca del horno en el centro del frente (dentro de UNA casilla, para que se vea entera). */
export const ELECTRIC_SMELTER = multiblock({
  key: 'electric_smelter', name: 'Horno eléctrico', size: [3, 2, 3], anchor: [1, 0, 1], oriented: true,
  model: [
    mbox(0, 0, 2, 48, 28, 48, [L('furnace_side'), L('furnace_side'), L('furnace_top'), L('furnace_top'), L('furnace_side'), L('furnace_side')]),
    mbox(16, 0, 0, 32, 16, 2, [L('furnace_side'), L('furnace_side'), L('furnace_top'), L('furnace_top'), L('furnace_side'), L('furnace_front')]),
  ],
  opts: { ...METAL },
});

export const POLE_BLOCKS: readonly number[] = [POLE_SMALL, POLE_MEDIUM, POLE_BIG, SUBSTATION];

/** Qué poste es (null si no lo es). Vale para cualquiera de las casillas de un poste de varias. */
export function poleKind(id: number): PoleKind | null {
  if (id <= 0) return null;
  const f = familyBase(id);
  return f === POLE_SMALL ? 'small' : f === POLE_MEDIUM ? 'medium' : f === POLE_BIG ? 'big' : f === SUBSTATION ? 'substation' : null;
}

/** Alcance del cable y mitad del lado del área de suministro de un poste. */
export const poleSpec = (kind: PoleKind) => POLES[kind];

export interface PoleInfo {
  kind: PoleKind;
  /** Casilla del controlador (el propio poste si es de 1×1). */
  ctrl: [number, number, number];
  /** Caja que ocupa (esquinas mínima y máxima, en bloques), su centro y el punto del que cuelga el cable. */
  box: [number, number, number, number, number, number];
  center: [number, number, number];
  attach: [number, number, number];
}

/** Todo lo que hace falta de un poste cuyo bloque `id` está en (x, y, z) (cualquiera de sus casillas). */
export function poleInfo(id: number, x: number, y: number, z: number): PoleInfo | null {
  const kind = poleKind(id);
  if (!kind) return null;
  const box = multiOf(id) ? multiBox(id, x, y, z)! : ([x, y, z, x + 1, y + 1, z + 1] as [number, number, number, number, number, number]);
  const ctrl = multiOf(id) ? multiControllerPos(id, x, y, z)! : ([x, y, z] as [number, number, number]);
  const center: [number, number, number] = [(box[0] + box[3]) / 2, (box[1] + box[4]) / 2, (box[2] + box[5]) / 2];
  const attach: [number, number, number] = [center[0], kind === 'small' || kind === 'medium' ? box[1] + 0.9 : box[4] - 0.15, center[2]];
  return { kind, ctrl, box, center, attach };
}

/** Lo eléctrico (extractionBlocks añade el extractor). */
export const POWER_BLOCKS: number[] = [POLE_SMALL, POLE_MEDIUM, POLE_BIG, SUBSTATION, SOLAR_PANEL, ACCUMULATOR, ELECTRIC_SMELTER];

/** ¿Es algo eléctrico (entra en una red de energía)? */
export function isPowerBlock(id: number): boolean {
  return id > 0 && POWER_BLOCKS.includes(familyBase(id)); // (las máquinas tienen un estado por casilla y sentido)
}

/** ¿Se coloca con «fantasma» (la vista previa verde o roja de dónde y cómo quedará)? Toda la logística y la energía. */
export function isGhostBlock(id: number): boolean {
  return id > 0 && (isPowerBlock(id) || LOGISTICS_INVENTORY.includes(familyBase(id)));
}

/** Su sitio en el inventario creativo. */
export const POWER_INVENTORY: readonly number[] = [...POWER_BLOCKS]; // (copia: el extractor se añade a POWER_BLOCKS después)
