// Fase 8.6 (el End): los bloques del End (registrados los últimos: ids nuevos).
// - Piedra del End (el suelo de todas las islas; dureza 3, resiste 9) y sus ladrillos, con losa, escaleras y muro.
// - Púrpura: bloque, pilar (orientado como un tronco), losa y escaleras (de la fruta de coro reventada).
// - Vara del End: luz 14, apunta hacia la cara en la que se pone (seis direcciones).
// - Planta de coro: el tallo que se une a sus vecinas (y abajo a la piedra del End); se rompe sin apoyo (en
//   cadena) y suelta a veces fruta de coro. Flor de coro: seis edades (la 5, muerta); crece con los ticks
//   aleatorios (ChorusFlowerBlock: sube, se ramifica o se muere) y sólo aguanta sobre planta, piedra del End o
//   colgada de una única planta de al lado.
import { family, L, R_MODEL, familyBase, type NeighborGet, type SoundMaterial } from './registry';
import { mbox, rotateBoxes, type ModelBox } from '../blockModels';
import { addMaterialShapes } from './building';
import { addWall } from './decoration';
import { addAxisLogs } from './logAxis';
import { pointTo } from './redstoneBlocks';

const PICK = (hardness: number, sound: SoundMaterial = 'stone') => ({ hardness, tool: 'pickaxe' as const, tier: 1, sound, category: 'construccion' as const });

export const END_STONE = family('end_stone', 'Piedra del End', [], () => ({ ...PICK(3), all: 'end_stone', category: 'naturaleza' }));
export const END_STONE_BRICKS = family('end_stone_bricks', 'Ladrillos de piedra del End', [], () => ({ ...PICK(3), all: 'end_stone_bricks' }));
addMaterialShapes({ key: 'end_stone_brick', name: 'de ladrillos de piedra del End', block: END_STONE_BRICKS, hardness: 3, tool: 'pickaxe', tier: 1, sound: 'stone' });
addWall({ key: 'end_stone_brick', name: 'de ladrillos de piedra del End', block: END_STONE_BRICKS, hardness: 3 });

export const PURPUR_BLOCK = family('purpur_block', 'Bloque de púrpura', [], () => ({ ...PICK(1.5), all: 'purpur_block' }));
export const PURPUR_PILLAR = family('purpur_pillar', 'Pilar de púrpura', [], () => ({ ...PICK(1.5), top: 'purpur_pillar_top', side: 'purpur_pillar' }));
addAxisLogs('purpur_pillar', 'Pilar de púrpura', PURPUR_PILLAR, 'purpur_pillar_top', 'purpur_pillar', undefined, { ...PICK(1.5), category: null });
addMaterialShapes({ key: 'purpur', name: 'de púrpura', block: PURPUR_BLOCK, hardness: 1.5, tool: 'pickaxe', tier: 1, sound: 'stone' });

// ------------------------------------------------------------------ vara del End

/** Vara del End apuntando hacia arriba: la base de 6×6 y el asta de 2×15. */
function rodBoxes(t: number): ModelBox[] {
  return [mbox(6, 0, 6, 10, 1, 10, t), mbox(7, 1, 7, 9, 16, 9, t)];
}
/** `facing`: la cara hacia la que apunta (0 +x, 1 −x, 2 arriba, 3 abajo, 4 +z, 5 −z). */
export const END_ROD = family('end_rod', 'Vara del End', [['facing', 6]], (st) => {
  const t = L('end_rod');
  const [b] = pointTo([mbox(6, 0, 6, 10, 16, 10, t)], st.facing);
  const box = [b.x0 / 16, b.y0 / 16, b.z0 / 16, b.x1 / 16, b.y1 / 16, b.z1 / 16];
  return {
    render: R_MODEL, solid: false, opaque: false, lightOpacity: 0, emission: 14, hardness: 0, sound: 'wood', all: 'end_rod',
    category: 'decoracion', model: pointTo(rodBoxes(t), st.facing), itemModel: rodBoxes(t), collision: box, selection: box,
  };
});

/** ¿Es una vara del End? Y su dirección. */
export function isEndRod(id: number): boolean {
  return id > 0 && familyBase(id) === END_ROD;
}

// ------------------------------------------------------------------ coro

const DIRS6: readonly (readonly [number, number, number])[] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

/** ¿Se une el tallo de coro a este vecino? (a las plantas y flores de coro; hacia abajo, también a la piedra). */
function chorusConnects(id: number, down: boolean): boolean {
  const b = id > 0 ? familyBase(id) : -1;
  return b === CHORUS_PLANT || b === CHORUS_FLOWER || (down && b === END_STONE);
}

/** Las cajas del tallo: el núcleo de 8×8×8 y un brazo hacia cada vecina a la que se une. */
function chorusShape(get: NeighborGet, t: number): ModelBox[] {
  const boxes = [mbox(4, 4, 4, 12, 12, 12, t)];
  const arm = [mbox(12, 4, 4, 16, 12, 12, t), mbox(0, 4, 4, 4, 12, 12, t), mbox(4, 12, 4, 12, 16, 12, t), mbox(4, 0, 4, 12, 4, 12, t),
    mbox(4, 4, 12, 12, 12, 16, t), mbox(4, 4, 0, 12, 12, 4, t)];
  DIRS6.forEach(([dx, dy, dz], i) => {
    if (chorusConnects(get(dx, dy, dz), i === 3)) boxes.push(arm[i]);
  });
  return boxes;
}

/** ChorusPlantBlock.canSurvive. */
function chorusPlantSurvives(get: NeighborGet): boolean {
  const below = get(0, -1, 0), above = get(0, 1, 0);
  const blocked = above > 0 && below > 0;
  for (const [dx, , dz] of [DIRS6[0], DIRS6[1], DIRS6[4], DIRS6[5]]) {
    if (get(dx, 0, dz) > 0 && familyBase(get(dx, 0, dz)) === CHORUS_PLANT) {
      if (blocked) return false;
      const b2 = get(dx, -1, dz);
      if (b2 > 0 && (familyBase(b2) === CHORUS_PLANT || b2 === END_STONE)) return true;
    }
  }
  return below < 0 || (below > 0 && (familyBase(below) === CHORUS_PLANT || below === END_STONE));
}

export const CHORUS_PLANT = family('chorus_plant', 'Planta de coro', [], () => {
  const t = L('chorus_plant');
  return {
    render: R_MODEL, opaque: false, lightOpacity: 0, hardness: 0.4, tool: 'axe', sound: 'wood', all: 'chorus_plant', category: 'naturaleza',
    shape: (get: NeighborGet) => chorusShape(get, t), itemModel: [mbox(4, 4, 4, 12, 12, 12, t)],
    collision: [0.25, 0.25, 0.25, 0.75, 0.75, 0.75], selection: [0.25, 0.25, 0.25, 0.75, 0.75, 0.75],
    support: chorusPlantSurvives,
  };
});

/** Edad de la flor de coro muerta. */
export const CHORUS_FLOWER_DEAD_AGE = 5;

/** ChorusFlowerBlock.canSurvive. */
function chorusFlowerSurvives(get: NeighborGet): boolean {
  const below = get(0, -1, 0);
  if (below < 0 || (below > 0 && (familyBase(below) === CHORUS_PLANT || below === END_STONE))) return true;
  if (below !== 0) return false;
  let plant = false;
  for (const [dx, , dz] of [DIRS6[0], DIRS6[1], DIRS6[4], DIRS6[5]]) {
    const n = get(dx, 0, dz);
    if (n > 0 && familyBase(n) === CHORUS_PLANT) {
      if (plant) return false;
      plant = true;
    } else if (n !== 0) return false;
  }
  return plant;
}

export const CHORUS_FLOWER = family('chorus_flower', 'Flor de coro', [['age', 6]], (st) => {
  const tex = st.age >= CHORUS_FLOWER_DEAD_AGE ? 'chorus_flower_dead' : 'chorus_flower';
  const t = L(tex);
  return {
    render: R_MODEL, opaque: false, lightOpacity: 1, hardness: 0.4, tool: 'axe', sound: 'wood', all: tex, category: 'naturaleza',
    // El capullo: un cubo un poco metido con un botón en cada cara.
    model: [mbox(2, 2, 2, 14, 14, 14, t), mbox(4, 14, 4, 12, 16, 12, t), mbox(4, 0, 4, 12, 2, 12, t), mbox(0, 4, 4, 2, 12, 12, t),
      mbox(14, 4, 4, 16, 12, 12, t), mbox(4, 4, 0, 12, 12, 2, t), mbox(4, 4, 14, 12, 12, 16, t)],
    collision: [0.125, 0.125, 0.125, 0.875, 0.875, 0.875], selection: [0, 0, 0, 1, 1, 1],
    support: chorusFlowerSurvives,
  };
});

export function isChorusFlower(id: number): boolean {
  return id > 0 && familyBase(id) === CHORUS_FLOWER;
}
export function isChorusPlant(id: number): boolean {
  return id === CHORUS_PLANT;
}

// ------------------------------------------------------------------ portal del End

/**
 * Marco del portal del End (EndPortalFrameBlock): una losa de 13/16 que mira hacia dentro del portal (`facing`) y
 * que puede llevar un ojo de ender encima (`eye`). No se rompe; da un poco de luz.
 */
export const END_PORTAL_FRAME = family('end_portal_frame', 'Marco del portal del End', [['facing', 4], ['eye', 2]], (st) => {
  const top = L('end_portal_frame_top'), side = L('end_portal_frame_side'), bottom = L('end_stone'), eye = L('end_portal_frame_eye');
  const boxes: ModelBox[] = [mbox(0, 0, 0, 16, 13, 16, [side, side, top, bottom, side, side])];
  if (st.eye) boxes.push(mbox(4, 13, 4, 12, 16, 12, eye));
  const shape = st.eye ? [0, 0, 0, 1, 13 / 16, 1, 0.25, 13 / 16, 0.25, 0.75, 1, 0.75] : [0, 0, 0, 1, 13 / 16, 1];
  return {
    render: R_MODEL, opaque: false, lightOpacity: 0, emission: 1, hardness: -1, breakable: false, sound: 'glass',
    top: 'end_portal_frame_top', side: 'end_portal_frame_side', category: 'decoracion',
    model: rotateBoxes(boxes, st.facing), itemModel: [mbox(0, 0, 0, 16, 13, 16, [side, side, top, bottom, side, side])],
    collision: shape, selection: shape,
  };
});

/** ¿Es un marco del portal del End? */
export function isEndPortalFrame(id: number): boolean {
  return id > 0 && familyBase(id) === END_PORTAL_FRAME;
}

/**
 * Portal del End: el velo de estrellas (dos caras, a 12/16 y a 6/16 de alto, como TheEndPortalRenderer). Ni se pica
 * ni se toca; quien entra viaja al End (o, desde el End, vuelve al mundo normal).
 */
export const END_PORTAL = family('end_portal', 'Portal del End', [], () => {
  const t = L('end_portal');
  return {
    render: R_MODEL, all: 'end_portal', solid: false, opaque: false, lightOpacity: 0, emission: 15, hardness: -1, breakable: false,
    sound: 'glass', noItem: true, category: null, walkThrough: true, collision: [], selection: [],
    model: [mbox(0, 12, 0, 16, 12, 16, [-1, -1, t, -1, -1, -1]), mbox(0, 6, 0, 16, 6, 16, [-1, -1, -1, t, -1, -1])],
  };
});

/** Su sitio en el inventario creativo. */
export const END_INVENTORY: number[] = [END_STONE, END_STONE_BRICKS, PURPUR_BLOCK, PURPUR_PILLAR, END_ROD, CHORUS_PLANT, CHORUS_FLOWER, END_PORTAL_FRAME];
