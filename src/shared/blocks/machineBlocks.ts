// Programa lunar (idea-industria.md): las máquinas de fabricar. Registradas las últimas: ids nuevos.
// - Ensambladoras 1, 2 y 3 (3×3, 2 de alto): eléctricas; hacen la receta de fabricación que se les elija (logistics/assembly.ts).
// - Horno de piedra y horno de acero (2×2, 2 de alto): funden con combustible (sin red eléctrica).
// Los detalles (la boca, la escotilla) van dentro de UNA casilla para que se vean enteros.
import { L, familyBase } from './registry';
import { multiblock, multiInfo } from './multiblock';
import { mbox } from '../blockModels';
import { POWER_BLOCKS } from './powerBlocks';
import { LOGISTICS_INVENTORY } from './logisticsBlocks';
import { ASSEMBLERS, FURNACES, LAB } from '../logistics/assemblyTypes';

const six = (n: number) => [n, n, n, n, n, n];
const METAL = { hardness: 2.5, tool: 'pickaxe' as const, tier: 0, sound: 'metal' as const, category: 'logistica' as const };
const BAND = ['orange_concrete', 'blue_concrete', 'green_concrete'] as const;

function assembler(tier: number): number {
  const t = ASSEMBLERS[tier];
  const shell = L('smooth_quartz'), dark = L('polished_andesite'), iron = L('iron_block');
  const [w, , d] = t.size;
  const W = w * 16, D = d * 16;
  let model;
  if (t.key === 'chemical_plant') {
    const teal = L('cyan_concrete');
    model = [
      mbox(0, 0, 0, W, 3, D, six(dark)),
      mbox(2, 3, 2, W - 2, 22, D - 2, six(shell)),
      mbox(2, 10, 2, W - 2, 14, D - 2, six(teal)),
      mbox(6, 22, 6, 18, 36, 18, six(iron)), // dos depósitos
      mbox(W - 18, 22, 6, W - 6, 36, 18, six(iron)),
      mbox(4, 22, D - 18, W - 4, 27, D - 8, six(dark)),
      // las bocas de tubería: entradas al norte y salidas al sur, dentro de las casillas de las esquinas
      mbox(4, 4, 0, 12, 12, 2, six(iron)), mbox(W - 12, 4, 0, W - 4, 12, 2, six(iron)),
      mbox(4, 4, D - 2, 12, 12, D, six(iron)), mbox(W - 12, 4, D - 2, W - 4, 12, D, six(iron)),
    ];
  } else if (t.key === 'oil_refinery') {
    const red = L('red_concrete');
    model = [
      mbox(0, 0, 0, W, 4, D, six(dark)),
      mbox(4, 4, 4, W - 4, 20, D - 4, six(shell)),
      mbox(4, 12, 4, W - 4, 16, D - 4, six(red)),
      mbox(8, 20, 8, 22, 44, 22, six(iron)), // las torres
      mbox(30, 20, 10, 44, 40, 24, six(iron)),
      mbox(W - 22, 20, 8, W - 8, 42, 22, six(iron)),
      mbox(20, 20, D - 30, W - 20, 30, D - 12, six(dark)),
      mbox(8, 4, 0, 16, 12, 2, six(iron)), mbox(W / 2 - 4, 4, 0, W / 2 + 4, 12, 2, six(iron)), mbox(W - 16, 4, 0, W - 8, 12, 2, six(iron)),
      mbox(24, 4, D - 2, 32, 12, D, six(iron)), mbox(W - 32, 4, D - 2, W - 24, 12, D, six(iron)),
    ];
  } else {
    const band = L(BAND[tier]);
    model = [
      mbox(0, 0, 0, 48, 3, 48, six(dark)),
      mbox(2, 3, 2, 46, 24, 46, six(shell)),
      mbox(2, 10, 2, 46, 14, 46, six(band)), // la franja del nivel, alrededor
      mbox(16, 24, 16, 32, 29, 32, [iron, iron, L('crafting_table_top'), iron, iron, iron]), // la escotilla de arriba
      mbox(4, 24, 4, 10, 30, 10, six(iron)), // dos chimeneas cortas
      mbox(38, 24, 4, 44, 30, 10, six(iron)),
    ];
    if (t.fluidIn.length) {
      // Las bocas de tubería del frente (entrada) y de atrás (salida), dentro de la casilla del centro.
      model.push(mbox(18, 4, 0, 30, 12, 2, six(iron)), mbox(18, 4, 46, 30, 12, 48, six(iron)));
    }
  }
  return multiblock({ key: t.key, name: t.name, size: [...t.size] as [number, number, number], anchor: [...t.anchor] as [number, number, number], oriented: true, model, opts: { ...METAL } });
}

/** Las máquinas de fabricar con recetas (ensambladoras 1-3, planta química y refinería), por nivel. */
export const ASSEMBLER_BLOCKS: readonly number[] = ASSEMBLERS.map((_, i) => assembler(i));

function furnace(tier: number): number {
  const t = FURNACES[tier];
  const stone = tier === 0;
  const side = L(stone ? 'furnace_side' : 'blast_furnace_side');
  const top = L(stone ? 'furnace_top' : 'blast_furnace_top');
  const front = L(stone ? 'furnace_front' : 'blast_furnace_front');
  return multiblock({
    key: t.key, name: t.name, size: [2, 2, 2], anchor: [0, 0, 0], oriented: true,
    model: [
      mbox(0, 0, 2, 32, 26, 32, [side, side, top, top, side, side]),
      mbox(2, 2, 0, 14, 14, 2, [side, side, top, top, side, front]), // la boca, dentro de la casilla de la izquierda del frente
      mbox(20, 26, 20, 28, 32, 28, six(L('iron_block'))), // la chimenea
    ],
    opts: { ...METAL, hardness: 3 },
  });
}

/** Horno de piedra y horno de acero. */
export const FURNACE_BLOCKS: readonly number[] = FURNACES.map((_, i) => furnace(i));

/** Laboratorio: 3×3 y 2 de alto; cuerpo claro con la cúpula de cristal en el centro de arriba. */
export const LAB_BLOCK = multiblock({
  key: LAB.key, name: LAB.name, size: [3, 2, 3], anchor: [1, 0, 1], oriented: false,
  model: [
    mbox(0, 0, 0, 48, 3, 48, six(L('polished_andesite'))),
    mbox(2, 3, 2, 46, 20, 46, six(L('smooth_quartz'))),
    mbox(2, 9, 2, 46, 12, 46, six(L('light_blue_concrete'))),
    mbox(14, 20, 14, 34, 27, 34, [L('glass'), L('glass'), L('glass'), L('glass'), L('glass'), L('glass')]),
    mbox(20, 27, 20, 28, 29, 28, six(L('iron_block'))),
  ],
  opts: { ...METAL },
});

export const isLabBlock = (id: number): boolean => id > 0 && familyBase(id) === LAB_BLOCK;

/** ¿Es la casilla principal de un laboratorio? */
export function labInfo(id: number): boolean {
  if (!isLabBlock(id)) return false;
  const i = multiInfo(id);
  return !!i && i.controller;
}

export const isAssemblerBlock = (id: number): boolean => id > 0 && ASSEMBLER_BLOCKS.includes(familyBase(id));
export const FUEL_FURNACE_BLOCKS = FURNACE_BLOCKS;
export const isFuelFurnace = (id: number): boolean => id > 0 && FURNACE_BLOCKS.includes(familyBase(id));

/** Nivel de una ensambladora si `id` es su casilla principal (null si no lo es o es otra casilla). */
export function assemblerInfo(id: number): { tier: number } | null {
  if (!isAssemblerBlock(id)) return null;
  const i = multiInfo(id);
  return i && i.controller ? { tier: ASSEMBLER_BLOCKS.indexOf(familyBase(id)) } : null;
}

/** Tipo de horno de combustible si `id` es su casilla principal (null si no lo es). */
export function furnaceInfo(id: number): { tier: number; dir: number } | null {
  if (!isFuelFurnace(id)) return null;
  const i = multiInfo(id);
  return i && i.controller ? { tier: FURNACE_BLOCKS.indexOf(familyBase(id)), dir: i.dir } : null;
}

// Las ensambladoras son eléctricas; unas y otros se colocan con «fantasma» y salen en el inventario junto a la logística.
(POWER_BLOCKS as number[]).push(...ASSEMBLER_BLOCKS, LAB_BLOCK);
(LOGISTICS_INVENTORY as number[]).push(...FURNACE_BLOCKS);
export const MACHINE_INVENTORY: readonly number[] = [...ASSEMBLER_BLOCKS, ...FURNACE_BLOCKS, LAB_BLOCK];
