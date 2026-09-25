// Generación procedural de todas las texturas de bloques de VoxelCraft.
//
// Todo el arte es original y se crea en tiempo de ejecución a partir de semillas
// deterministas (hash del nombre de la textura → mulberry32): el mismo código
// produce siempre los mismos bytes. No usa DOM ni canvas, así que puede
// ejecutarse en un Web Worker.
//
// Disposición de memoria: una capa por entrada de TEXTURE_DEFS y en ese orden.
// La capa i ocupa los bytes [i·16·16·4, (i+1)·16·16·4); dentro de la capa las
// filas van de arriba (fila 0) a abajo y el píxel (x, y) empieza en ((y·16)+x)·4.
//
//  - albedo:   RGBA8 sRGB. Recortes con alpha 0/255; texturas tintadas (tint 1/3)
//              en gris neutro; grass_side usa alpha como máscara de tinte.
//  - normal:   RGBA8 lineal. RGB = normal tangente (n·0.5+0.5)·255 con +X = derecha,
//              +Y = arriba (hacia la fila 0), +Z = fuera; A = altura (255 = más alto).
//  - specular: RGBA8 lineal (inspirado en LabPBR). R = suavidad perceptual,
//              G = F0 (≥ 230 = metal, el albedo es el color especular),
//              B = dispersión subsuperficial / porosidad, A = emisión.

import { TEXTURE_DEFS } from '../../shared/textureDefs';
import { N, S, Tex, bake, type Generator } from './texCore';
import { STONE_GENERATORS } from './genStone';
import { SOIL_GENERATORS } from './genSoil';
import { WOOD_GENERATORS } from './genWood';
import { PLANT_GENERATORS } from './genPlants';
import { MISC_GENERATORS } from './genMisc';
import { SURVIVAL_GENERATORS } from './genSurvival';
import { BUILDING_GENERATORS } from './genBuilding';
import { FARM_GENERATORS } from './genFarm';
import { GOURD_GENERATORS } from './genGourds';
import { WORKSTATION_GENERATORS } from './genWorkstations';
import { BIOME_GENERATORS } from './genBiomes';
import { UNDERGROUND_GENERATORS } from './genUnderground';
import { STRUCTURE_GENERATORS } from './genStructures';
// Fase 6 (aldeanos): bloques de trabajo de los aldeanos.
import { VILLAGE_GENERATORS } from './genVillage';
import { AQUATIC_GENERATORS } from './genAquatic'; // Fase 6 (acuáticos)
// Fase 6 (fauna): nido de abejas, colmena, miel y panal.
import { BEE_GENERATORS } from './genBees';

export interface GeneratedTextures {
  /** Lado de cada capa en píxeles (16). */
  size: number;
  /** Número de capas (= TEXTURE_DEFS.length). */
  count: number;
  /** count · size · size · 4 bytes. */
  albedo: Uint8Array;
  normal: Uint8Array;
  specular: Uint8Array;
}

const GENERATORS: Readonly<Record<string, Generator>> = {
  ...STONE_GENERATORS,
  ...SOIL_GENERATORS,
  ...WOOD_GENERATORS,
  ...PLANT_GENERATORS,
  ...MISC_GENERATORS,
  ...SURVIVAL_GENERATORS,
  ...BUILDING_GENERATORS,
  ...FARM_GENERATORS,
  ...GOURD_GENERATORS,
  ...WORKSTATION_GENERATORS,
  ...BIOME_GENERATORS,
  ...UNDERGROUND_GENERATORS,
  ...STRUCTURE_GENERATORS,
  ...VILLAGE_GENERATORS, // Fase 6 (aldeanos)
  ...AQUATIC_GENERATORS, // Fase 6 (acuáticos)
  ...BEE_GENERATORS, // Fase 6 (fauna)
};

/** Marcador visible para texturas que aún no tienen generador (cuadros magenta y negros). */
const placeholder: Generator = (t) => {
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const on = ((x >> 2) + (y >> 2)) & 1;
      t.setI(y * S + x, on ? [200, 40, 200] : [20, 20, 20]);
    }
  }
};

export function generateTextures(): GeneratedTextures {
  const count = TEXTURE_DEFS.length;
  const layerBytes = N * 4;
  const albedo = new Uint8Array(count * layerBytes);
  const normal = new Uint8Array(count * layerBytes);
  const specular = new Uint8Array(count * layerBytes);
  for (let i = 0; i < count; i++) {
    const def = TEXTURE_DEFS[i];
    const gen = Object.prototype.hasOwnProperty.call(GENERATORS, def.name) ? GENERATORS[def.name] : placeholder;
    if (gen === placeholder) console.warn('Textura sin generador procedural (se usa un marcador): ' + def.name);
    const t = new Tex(def.name);
    gen(t);
    bake(t, def, albedo, normal, specular, i * layerBytes);
  }
  return { size: S, count, albedo, normal, specular };
}
