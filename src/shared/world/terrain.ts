// Generador de terreno procedural determinista. Se ejecuta en los Web Workers.
// Todos los clientes generan exactamente el mismo mundo a partir de la semilla; el servidor
// sólo guarda las modificaciones de los jugadores.
import {
  AIR, STONE, GRASS, DIRT, SAND, GRAVEL, OAK_LOG, OAK_LEAVES, WATER, COAL_ORE, IRON_ORE, GOLD_ORE,
  DIAMOND_ORE, LAPIS_ORE, REDSTONE_ORE, SANDSTONE, SNOWY_GRASS, SNOW_BLOCK, ICE, CLAY, CACTUS,
  BIRCH_LOG, BIRCH_LEAVES, SPRUCE_LOG, SPRUCE_LEAVES, SHORT_GRASS, FERN, POPPY, DANDELION, CORNFLOWER,
  DEAD_BUSH, SUGAR_CANE, RED_MUSHROOM, BROWN_MUSHROOM, LAVA, BEDROCK, GRANITE, DIORITE, ANDESITE,
  BLOCK_REPLACEABLE, BLOCK_RENDER, R_CROSS, PUMPKIN, MELON, TERRACOTTA, JUNGLE_LOG, JUNGLE_LEAVES, ACACIA_LOG,
  ACACIA_LEAVES, DARK_OAK_LOG, DARK_OAK_LEAVES, CHERRY_LOG, CHERRY_LEAVES, horizontalLog, AXIS_X, AXIS_Z, VINE, LILY_PAD, MYCELIUM, RED_MUSHROOM_BLOCK,
  BROWN_MUSHROOM_BLOCK, MUSHROOM_STEM, RED_SAND, COLORED_TERRACOTTA, PACKED_ICE, FLOWERS, PINK_PETALS, isLeaves,
  DEEPSLATE, TUFF, CALCITE, SMOOTH_BASALT, DRIPSTONE_BLOCK, POINTED_DRIPSTONE, COPPER_ORE, EMERALD_ORE, DEEPSLATE_ORE,
  MOSS_BLOCK, MOSS_CARPET, AZALEA, FLOWERING_AZALEA, CAVE_VINES, AMETHYST_BLOCK, BUDDING_AMETHYST, AMETHYST_BUD,
  BLOCK_OPAQUE, SNOW_LAYER,
} from '../blocks';
import { CHUNK_SIZE, CHUNK_VOLUME, SEA_LEVEL, MIN_Y, MAX_Y, blockIndex, hash2, hash3, hashToFloat } from '../constants';
import { Simplex, mulberry32, smoothstep, clamp01, spline, lerp } from './noise';
import { DIR_X, DIR_Z } from '../blockModels';
import { placeStructures, locateStructure, type StructureChest } from './structures';
import { VILLAGE_RADIUS } from './villages';
import type { VillagerSpawn } from './villages'; // Fase 6 (aldeanos)
import { placeInfested } from './infested'; // Fase 6 (monstruos)
import { placeBeeNest } from './beeNests'; // Fase 6 (fauna)
import { decorate65 } from './oceanDecor'; // Fase 6.5 (océano y plantas)

type SetBlock = (x: number, y: number, z: number, id: number, force: boolean) => void;

export * from './biomeIds';
import {
  BIOME_OCEAN, BIOME_FROZEN_OCEAN, BIOME_BEACH, BIOME_PLAINS, BIOME_FOREST, BIOME_BIRCH_FOREST, BIOME_TAIGA, BIOME_SNOWY,
  BIOME_DESERT, BIOME_SAVANNA, BIOME_MOUNTAINS, BIOME_SNOWY_PEAKS, BIOME_SWAMP, BIOME_JUNGLE, BIOME_DARK_FOREST,
  BIOME_BADLANDS, BIOME_MUSHROOM_FIELDS, BIOME_CHERRY_GROVE, BIOME_MEADOW, BIOME_ICE_SPIKES, BIOME_WARM_OCEAN,
  BIOME_COLD_OCEAN, BIOME_DEEP_OCEAN, isOceanBiome,
} from './biomeIds';

/** Densidad de árboles (probabilidad por celda de 4x4) por bioma. */
const TREE_DENSITY = [
  0, 0, 0, 0.035, 0.55, 0.5, 0.42, 0.3, 0.05, 0.1, 0.06, 0,
  0.16, 0.85, 0.8, 0.03, 0.035, 0.16, 0.012, 0.03, 0, 0, 0,
];

/** Color de la hierba de los biomas con color propio (sRGB); el resto sale del clima. */
const BIOME_GRASS: Record<number, [number, number, number]> = {
  [BIOME_SWAMP]: [106, 112, 57],
  [BIOME_JUNGLE]: [89, 196, 60],
  [BIOME_DARK_FOREST]: [80, 122, 50],
  [BIOME_BADLANDS]: [144, 129, 77],
  [BIOME_MUSHROOM_FIELDS]: [85, 190, 63],
  [BIOME_CHERRY_GROVE]: [182, 219, 97],
  [BIOME_MEADOW]: [131, 187, 109],
};

/** Terracotas de las franjas de las badlands, con su peso. */
const BANDS: [number, number][] = [
  [TERRACOTTA, 34], [COLORED_TERRACOTTA.orange, 20], [COLORED_TERRACOTTA.yellow, 10], [COLORED_TERRACOTTA.brown, 10],
  [COLORED_TERRACOTTA.red, 10], [COLORED_TERRACOTTA.white, 7], [COLORED_TERRACOTTA.light_gray, 9],
];
const BAND_TOTAL = BANDS.reduce((a, [, w]) => a + w, 0);

export interface ColumnInfo {
  height: number;
  amp: number;
  temp: number;
  humid: number;
  mount: number;
  cont: number;
  biome: number;
}

export interface GenResult {
  blocks: Uint16Array;
  /** 4x4 muestras RGBA de color de hierba del bioma (sRGB) + temperatura en A. */
  tint: Uint8Array;
  /** Altura del bloque sólido más alto por columna (16x16, índice z*16+x). */
  heights: Int16Array;
  /** Cofres de estructuras de este chunk (el servidor los llena con su botín). */
  chests: StructureChest[];
  /** Fase 6 (aldeanos): aldeanos de una aldea cuyo pozo cae en este chunk (el servidor los hace aparecer). */
  villagers: VillagerSpawn[];
}

const CAVE_GRID = 4;

export class TerrainGenerator {
  readonly seed: number;
  private nCont: Simplex;
  private nEro: Simplex;
  private nPeaks: Simplex;
  private nTemp: Simplex;
  private nHumid: Simplex;
  private nDetail: Simplex;
  private nDensity: Simplex;
  private nCaveA: Simplex;
  private nCaveB: Simplex;
  private nCheese: Simplex;
  private nSurface: Simplex;
  private nFlowers: Simplex;
  private nEntrance: Simplex;
  private nWeird: Simplex;
  private nMush: Simplex;
  private nLush: Simplex;
  private nDrip: Simplex;
  private nAquifer: Simplex;
  private info: ColumnInfo = { height: 0, amp: 0, temp: 0, humid: 0, mount: 0, cont: 0, biome: 0 };

  constructor(seed: number) {
    this.seed = seed | 0;
    const r = mulberry32(seed);
    const s = () => Math.floor(r() * 0x7fffffff);
    this.nCont = new Simplex(s());
    this.nEro = new Simplex(s());
    this.nPeaks = new Simplex(s());
    this.nTemp = new Simplex(s());
    this.nHumid = new Simplex(s());
    this.nDetail = new Simplex(s());
    this.nDensity = new Simplex(s());
    this.nCaveA = new Simplex(s());
    this.nCaveB = new Simplex(s());
    this.nCheese = new Simplex(s());
    this.nSurface = new Simplex(s());
    this.nFlowers = new Simplex(s());
    this.nEntrance = new Simplex(s());
    // Añadidos al final: los ruidos anteriores no cambian.
    this.nWeird = new Simplex(s());
    this.nMush = new Simplex(s());
    this.nLush = new Simplex(s());
    this.nDrip = new Simplex(s());
    this.nAquifer = new Simplex(s());
  }

  /** Roca de fondo: pizarra profunda por debajo de 0 y mezclada con piedra entre 0 y 7. */
  private rockAt(x: number, y: number, z: number): number {
    if (y < 0) return DEEPSLATE;
    if (y >= 8) return STONE;
    return hashToFloat(hash3(x, y, z, this.seed ^ 0xdee9)) < (8 - y) / 8 ? DEEPSLATE : STONE;
  }

  /**
   * Nivel del agua subterránea (acuífero) de una columna, o -1e9 si no hay: zonas amplias donde las
   * cuevas por debajo de ese nivel están inundadas. El nivel va en escalones de 6 bloques.
   */
  private aquiferLevel(x: number, z: number, top: number): number {
    const n = this.nAquifer.noise2(x / 170, z / 170);
    if (n < 0.28) return -1e9;
    const level = Math.floor((-40 + (n - 0.28) * 140) / 6) * 6;
    return Math.min(level, top - 14, SEA_LEVEL - 12);
  }

  /** Bioma de cueva de una columna: 1 frondosa, 2 de goteo, 0 normal. */
  caveBiomeAt(x: number, z: number): number {
    if (this.nLush.noise2(x / 240, z / 240) > 0.4) return 1;
    if (this.nDrip.noise2(x / 240 + 31.7, z / 240 - 12.1) > 0.42) return 2;
    return 0;
  }

  /** Parámetros 2D de una columna (altura base, amplitud 3D, clima y bioma). */
  columnInfo(x: number, z: number, out: ColumnInfo = this.info): ColumnInfo {
    // Deformación de dominio suave para romper la regularidad del ruido.
    const wx = x + this.nDetail.noise2(x / 400, z / 400) * 60;
    const wz = z + this.nDetail.noise2(x / 400 + 71.3, z / 400 - 33.1) * 60;
    const c = this.nCont.fbm2(wx / 1500, wz / 1500, 5) * 1.6 + 0.14;
    const e = this.nEro.fbm2(wx / 750, wz / 750, 4) * 1.5;
    const pv = this.nPeaks.ridged2(wx / 420, wz / 420, 5);
    const base = spline([-1.2, 28, -0.6, 36, -0.32, 48, -0.16, 58, -0.08, 63, 0.0, 66, 0.2, 70, 0.45, 76, 1.0, 88], c);
    const mount = smoothstep(0.02, 0.42, c) * smoothstep(0.3, -0.32, e);
    const hillAmp = 3 + 9 * smoothstep(-0.1, 0.5, -e) * smoothstep(-0.2, 0.1, c);
    const hills = this.nDetail.fbm2(x / 110, z / 110, 4) * hillAmp;
    const peaks = pv * pv * 105 + pv * 12;
    let height = base + mount * peaks + hills;
    // Valles de río suaves: ruido "ridged" invertido cerca de 0.
    const river = 1 - Math.abs(this.nEro.noise2(wx / 900 + 400, wz / 900 - 300));
    const riverCut = smoothstep(0.94, 0.985, river) * smoothstep(-0.1, 0.15, c) * (1 - mount);
    height = lerp(height, Math.min(height, SEA_LEVEL - 3), riverCut);

    const tempBase = this.nTemp.fbm2(x / 1700, z / 1700, 3) * 1.45;
    const humid = this.nHumid.fbm2(x / 1300 + 500, z / 1300 - 500, 3) * 1.5;
    const weird = this.nWeird.fbm2(x / 520, z / 520, 2);
    // Islas de champiñones en alta mar.
    const mush = smoothstep(0.55, 0.68, this.nMush.noise2(x / 380, z / 380)) * smoothstep(-0.42, -0.62, c);
    if (mush > 0) height = lerp(height, SEA_LEVEL + 2 + hills * 0.4 + 3 * mush, mush);
    // Pantanos: tierras bajas, templadas y húmedas, casi a ras del agua (con charcas).
    const swamp = smoothstep(0.28, 0.48, humid) * smoothstep(-0.32, -0.18, tempBase) * smoothstep(0.42, 0.3, tempBase) *
      smoothstep(0.25, 0.1, mount) * smoothstep(SEA_LEVEL + 9, SEA_LEVEL + 3, height) * smoothstep(-0.1, 0.05, c);
    if (swamp > 0) height = lerp(height, SEA_LEVEL - 0.6 + this.nDetail.noise2(x / 18, z / 18) * 1.6, swamp);
    // Badlands: mesetas en escalones en las tierras cálidas y secas.
    const mesa = smoothstep(0.35, 0.5, tempBase) * smoothstep(0.0, -0.15, humid) * smoothstep(0.1, 0.25, weird) * smoothstep(0.05, 0.2, c);
    if (mesa > 0) {
      const plateau = Math.max(0, this.nDetail.fbm2(x / 140 + 50, z / 140, 3)) * 48;
      height += mesa * Math.floor(plateau / 6) * 6;
    }
    const altCool = height > 100 ? (height - 100) / 140 : 0;
    const temp = tempBase - altCool;

    out.height = height;
    out.amp = 2.5 + 26 * mount * mount + 4 * mount;
    out.temp = temp;
    out.humid = humid;
    out.mount = mount;
    out.cont = c;
    out.biome = this.pickBiome(height, temp, humid, mount, c, weird, swamp, mush, mesa);
    return out;
  }

  private pickBiome(
    h: number, t: number, hu: number, m: number, c: number, weird: number, swamp: number, mush: number, mesa: number,
  ): number {
    if (mush > 0.5 && h >= SEA_LEVEL - 1.5) return BIOME_MUSHROOM_FIELDS;
    if (swamp > 0.5 && h > SEA_LEVEL - 4) return BIOME_SWAMP;
    if (h < SEA_LEVEL - 1.5) {
      if (t < -0.58) return BIOME_FROZEN_OCEAN;
      if (h < 44) return BIOME_DEEP_OCEAN;
      if (t < -0.3) return BIOME_COLD_OCEAN;
      if (t > 0.42) return BIOME_WARM_OCEAN;
      return BIOME_OCEAN;
    }
    if (m > 0.45 && h > 105) return h > 150 || t < -0.35 ? BIOME_SNOWY_PEAKS : BIOME_MOUNTAINS;
    // Faldas de las montañas: praderas y, a trechos, cerezales.
    if (m > 0.2 && h > 84 && t > -0.26 && t < 0.38) return weird > 0.2 ? BIOME_CHERRY_GROVE : BIOME_MEADOW;
    if (h < SEA_LEVEL + 2.5 && c < 0.12 && m < 0.25) {
      if (t < -0.58) return BIOME_SNOWY;
      return t > 0.35 && hu < 0 ? BIOME_DESERT : BIOME_BEACH;
    }
    if (t < -0.58) return weird > 0.35 ? BIOME_ICE_SPIKES : BIOME_SNOWY;
    if (t < -0.26) return BIOME_TAIGA;
    if (t > 0.38) {
      if (hu > 0.3) return BIOME_JUNGLE;
      if (hu < 0.05) return mesa > 0.5 ? BIOME_BADLANDS : BIOME_DESERT;
      return BIOME_SAVANNA;
    }
    if (hu > 0.1) {
      if (hu > 0.42 && t > -0.1) return BIOME_DARK_FOREST;
      return t < 0.05 && hu > 0.32 ? BIOME_BIRCH_FOREST : BIOME_FOREST;
    }
    return BIOME_PLAINS;
  }

  biomeAt(x: number, z: number): number {
    return this.columnInfo(x, z).biome;
  }

  /** ¿Es sólido el terreno base (antes de cuevas) en (x, y, z)? */
  private solidAt(x: number, y: number, z: number, h: number, amp: number): boolean {
    if (y < h - amp) return true;
    if (y > h + amp) return false;
    let n = this.nDensity.fbm3(x / 56, y / 38, z / 56, 2);
    // Por encima de la superficie la aportación positiva se atenúa: menos islas flotantes.
    if (n > 0 && y > h) n *= 1 - Math.min(1, (y - h) / (amp * 0.8));
    return h - y + amp * n > 0;
  }

  /** Altura del bloque sólido superior del terreno base de una columna. */
  surfaceAt(x: number, z: number, info: ColumnInfo): number {
    const top = Math.min(MAX_Y - 8, Math.ceil(info.height + info.amp));
    const bottom = Math.max(MIN_Y + 1, Math.floor(info.height - info.amp));
    for (let y = top; y >= bottom; y--) {
      if (this.solidAt(x, y, z, info.height, info.amp)) return y;
    }
    return bottom - 1;
  }

  /** Valor del ruido de cuevas en un punto de la rejilla gruesa (1 = hueco). */
  private caveGridValue(x: number, y: number, z: number): number {
    const a = this.nCaveA.noise3(x / 72, y / 46, z / 72);
    const b = this.nCaveB.noise3(x / 72, y / 46, z / 72);
    const spaghetti = 0.0095 - (a * a + b * b); // > 0 dentro del túnel
    let cheese = -1;
    if (y < 56) {
      const ch = this.nCheese.noise3(x / 110, y / 58, z / 110);
      cheese = (ch - 0.58) * 0.25 * smoothstep(56, 30, y);
    }
    return Math.max(spaghetti, cheese);
  }

  /** Evalúa la función de cuevas interpolada en cualquier posición (igual que en generate()). */
  caveAt(x: number, y: number, z: number): boolean {
    const gx = Math.floor(x / CAVE_GRID) * CAVE_GRID;
    const gy = Math.floor(y / CAVE_GRID) * CAVE_GRID;
    const gz = Math.floor(z / CAVE_GRID) * CAVE_GRID;
    const fx = (x - gx) / CAVE_GRID;
    const fy = (y - gy) / CAVE_GRID;
    const fz = (z - gz) / CAVE_GRID;
    const v000 = this.caveGridValue(gx, gy, gz);
    const v100 = this.caveGridValue(gx + CAVE_GRID, gy, gz);
    const v010 = this.caveGridValue(gx, gy + CAVE_GRID, gz);
    const v110 = this.caveGridValue(gx + CAVE_GRID, gy + CAVE_GRID, gz);
    const v001 = this.caveGridValue(gx, gy, gz + CAVE_GRID);
    const v101 = this.caveGridValue(gx + CAVE_GRID, gy, gz + CAVE_GRID);
    const v011 = this.caveGridValue(gx, gy + CAVE_GRID, gz + CAVE_GRID);
    const v111 = this.caveGridValue(gx + CAVE_GRID, gy + CAVE_GRID, gz + CAVE_GRID);
    const v = lerp(
      lerp(lerp(v000, v100, fx), lerp(v010, v110, fx), fy),
      lerp(lerp(v001, v101, fx), lerp(v011, v111, fx), fy),
      fz,
    );
    return v > 0;
  }

  /** Color de hierba (sRGB 0..255) según temperatura y humedad. */
  static grassColor(temp: number, humid: number, out: number[]): number[] {
    const T = clamp01(temp * 0.6 + 0.5);
    const H = clamp01(humid * 0.6 + 0.5);
    const cold = [124, 178, 150];
    const tr = lerp(172, 92, H), tg = lerp(192, 184, H), tb = lerp(92, 70, H);
    const hr = lerp(196, 82, H), hg = lerp(182, 196, H), hb = lerp(84, 56, H);
    const kc = smoothstep(0.12, 0.32, T);
    const kh = smoothstep(0.55, 0.82, T);
    const r = lerp(cold[0], lerp(tr, hr, kh), kc);
    const g = lerp(cold[1], lerp(tg, hg, kh), kc);
    const b = lerp(cold[2], lerp(tb, hb, kh), kc);
    out[0] = r;
    out[1] = g;
    out[2] = b;
    return out;
  }

  /** Color de la hierba de una columna: el del bioma si tiene uno propio, mezclado con el del clima. */
  static biomeGrass(inf: ColumnInfo, out: number[]): number[] {
    TerrainGenerator.grassColor(inf.temp, inf.humid, out);
    const g = BIOME_GRASS[inf.biome];
    if (g) for (let k = 0; k < 3; k++) out[k] = lerp(out[k], g[k], 0.75);
    return out;
  }

  /** Terracota de la franja de las badlands a la altura y (con una ligera ondulación por columna). */
  private bandAt(x: number, y: number, z: number): number {
    const wobble = Math.round(this.nSurface.noise2(x / 70, z / 70) * 2);
    let h = hash2(Math.floor((y + wobble) / 2), 0, this.seed ^ 0xba7d) % BAND_TOTAL;
    for (const [id, w] of BANDS) {
      if (h < w) return id;
      h -= w;
    }
    return TERRACOTTA;
  }

  /** Bloques de superficie: out = [superior, relleno, profundo(-1 = ninguno), profundidad]. */
  surfaceRules(x: number, z: number, biome: number, top: number, slope: number, out: number[]): number[] {
    const sn = this.nSurface.noise2(x / 24, z / 24);
    const depth = 3 + Math.floor((sn + 1) * 1.5);
    const underwater = top < SEA_LEVEL - 1;
    let topBlock = GRASS;
    let filler = DIRT;
    let deep = -1;
    switch (biome) {
      case BIOME_DESERT:
        topBlock = SAND; filler = SAND; deep = SANDSTONE;
        break;
      case BIOME_BEACH:
        topBlock = SAND; filler = SAND; deep = SANDSTONE;
        if (slope > 3.5) { topBlock = STONE; filler = STONE; deep = -1; }
        break;
      case BIOME_OCEAN:
      case BIOME_FROZEN_OCEAN:
      case BIOME_DEEP_OCEAN:
      case BIOME_WARM_OCEAN:
      case BIOME_COLD_OCEAN: {
        const deepWater = SEA_LEVEL - top;
        topBlock = deepWater > 9 ? GRAVEL : SAND;
        if (sn > 0.55) topBlock = CLAY;
        else if (sn < -0.6) topBlock = GRAVEL;
        // Los mares cálidos tienen fondo de arena; los fríos, sobre todo de grava.
        if (biome === BIOME_WARM_OCEAN) topBlock = SAND;
        else if (biome === BIOME_COLD_OCEAN && sn < 0.3) topBlock = GRAVEL;
        filler = topBlock;
        break;
      }
      case BIOME_BADLANDS:
        // Arena roja en lo llano; en las laderas asoman las franjas de terracota (ver generate).
        if (slope > 3) { topBlock = STONE; filler = STONE; }
        else { topBlock = RED_SAND; filler = RED_SAND; }
        out[3] = 2;
        out[0] = topBlock;
        out[1] = filler;
        out[2] = -1;
        return out;
      case BIOME_MUSHROOM_FIELDS:
        topBlock = MYCELIUM;
        break;
      case BIOME_ICE_SPIKES:
        topBlock = SNOW_BLOCK;
        break;
      case BIOME_SNOWY:
        topBlock = SNOWY_GRASS;
        break;
      case BIOME_SNOWY_PEAKS:
        if (slope > 5) { topBlock = STONE; filler = STONE; }
        else if (top < 150 && slope <= 3) { topBlock = SNOWY_GRASS; filler = DIRT; }
        else { topBlock = SNOW_BLOCK; filler = SNOW_BLOCK; }
        break;
      case BIOME_MOUNTAINS:
        if (slope > 3.2 || top > 140 + sn * 8) { topBlock = STONE; filler = STONE; }
        if (top > 148 + sn * 10 && slope <= 5) topBlock = SNOW_BLOCK;
        if (sn < -0.55 && slope <= 3.2) { topBlock = GRAVEL; filler = GRAVEL; }
        break;
      default:
        if (slope > 5.5) { topBlock = STONE; filler = STONE; }
    }
    if (underwater && (topBlock === GRASS || topBlock === SNOWY_GRASS || topBlock === MYCELIUM)) {
      if (biome === BIOME_SWAMP) topBlock = sn > 0.3 ? CLAY : DIRT;
      else topBlock = sn > 0.2 ? SAND : sn < -0.3 ? GRAVEL : DIRT;
      filler = topBlock === GRAVEL ? GRAVEL : DIRT;
    }
    out[0] = topBlock;
    out[1] = filler;
    out[2] = deep;
    out[3] = depth;
    return out;
  }

  /** Altura máxima (inclusive) hasta la que se excavan cuevas en una columna. */
  private caveCeiling(x: number, z: number, top: number): number {
    // Cerca del mar/lagos no abrimos la superficie (el agua no fluye).
    if (top < SEA_LEVEL + 3) return top - 6;
    return this.nEntrance.noise2(x / 90, z / 90) > 0.35 ? top + 1 : top - 5;
  }

  /** Altura del suelo donde puede crecer un árbol/cactus en (x, z), o -1 si no es válido. */
  private treeGround(x: number, z: number, inf: ColumnInfo): number {
    const biome = inf.biome;
    const height = inf.height, amp = inf.amp;
    const sy = this.surfaceAt(x, z, inf);
    if (sy < SEA_LEVEL - 1 || sy > MAX_Y - 20) return -1;
    if (this.caveAt(x, sy, z) && sy <= this.caveCeiling(x, z, sy)) return -1;
    const t: ColumnInfo = { height: 0, amp: 0, temp: 0, humid: 0, mount: 0, cont: 0, biome: 0 };
    const hx1 = this.columnInfo(x + 1, z, t).height;
    const hx0 = this.columnInfo(x - 1, z, t).height;
    const hz1 = this.columnInfo(x, z + 1, t).height;
    const hz0 = this.columnInfo(x, z - 1, t).height;
    const slope = Math.max(Math.abs(hx1 - hx0), Math.abs(hz1 - hz0));
    const layers = this.surfaceRules(x, z, biome, sy, slope, [0, 0, 0, 0]);
    const g = layers[0];
    let ok: boolean;
    if (biome === BIOME_DESERT) ok = g === SAND && sy >= SEA_LEVEL;
    else if (biome === BIOME_BADLANDS) ok = g === RED_SAND && sy >= SEA_LEVEL;
    else if (biome === BIOME_ICE_SPIKES) ok = g === SNOW_BLOCK;
    else ok = g === GRASS || g === SNOWY_GRASS || g === DIRT || g === MYCELIUM;
    void height;
    void amp;
    return ok ? sy : -1;
  }

  generate(cx: number, cz: number): GenResult {
    const blocks = new Uint16Array(CHUNK_VOLUME);
    const heights = new Int16Array(CHUNK_SIZE * CHUNK_SIZE);
    const x0 = cx * CHUNK_SIZE;
    const z0 = cz * CHUNK_SIZE;
    const seed = this.seed;

    // --- 1. Información por columna (con borde de 1 para calcular pendientes) ---
    const baseH = new Float64Array(18 * 18);
    const infos: ColumnInfo[] = new Array(256);
    for (let dz = -1; dz <= 16; dz++) {
      for (let dx = -1; dx <= 16; dx++) {
        if (dx >= 0 && dx < 16 && dz >= 0 && dz < 16) {
          const inf = this.columnInfo(x0 + dx, z0 + dz, {
            height: 0, amp: 0, temp: 0, humid: 0, mount: 0, cont: 0, biome: 0,
          });
          infos[dz * 16 + dx] = inf;
          baseH[(dz + 1) * 18 + dx + 1] = inf.height;
        } else {
          baseH[(dz + 1) * 18 + dx + 1] = this.columnInfo(x0 + dx, z0 + dz).height;
        }
      }
    }

    // --- 2. Terreno base con densidad 3D ---
    const tops = new Int16Array(256);
    let maxTop = 0;
    for (let lz = 0; lz < 16; lz++) {
      for (let lx = 0; lx < 16; lx++) {
        const inf = infos[lz * 16 + lx];
        const wx = x0 + lx, wz = z0 + lz;
        const lo = Math.max(MIN_Y + 1, Math.floor(inf.height - inf.amp));
        const hi = Math.min(MAX_Y - 8, Math.ceil(inf.height + inf.amp));
        for (let y = MIN_Y; y < lo; y++) blocks[blockIndex(lx, y, lz)] = y < 8 ? this.rockAt(wx, y, wz) : STONE;
        let top = lo - 1;
        for (let y = lo; y <= hi; y++) {
          if (this.solidAt(wx, y, wz, inf.height, inf.amp)) {
            blocks[blockIndex(lx, y, lz)] = y < 8 ? this.rockAt(wx, y, wz) : STONE;
            top = y;
          }
        }
        tops[lz * 16 + lx] = top;
        if (top > maxTop) maxTop = top;
      }
    }

    // --- 3. Capas de superficie según bioma ---
    const layers = [0, 0, 0, 0];
    for (let lz = 0; lz < 16; lz++) {
      for (let lx = 0; lx < 16; lx++) {
        const inf = infos[lz * 16 + lx];
        const top = tops[lz * 16 + lx];
        const c = (lz + 1) * 18 + lx + 1;
        const slope = Math.max(
          Math.abs(baseH[c + 1] - baseH[c - 1]),
          Math.abs(baseH[c + 18] - baseH[c - 18]),
        );
        this.surfaceRules(x0 + lx, z0 + lz, inf.biome, top, slope, layers);
        const topBlock = layers[0], filler = layers[1], deep = layers[2], depth = layers[3];
        // Recorremos hacia abajo desde la superficie aplicando las capas.
        let d = 0;
        for (let y = top; y > MIN_Y && d < depth + 3; y--) {
          const i = blockIndex(lx, y, lz);
          if (blocks[i] !== STONE) break; // hueco (voladizo)
          if (d === 0) blocks[i] = topBlock;
          else if (d < depth) blocks[i] = filler;
          else if (deep >= 0) blocks[i] = deep;
          else break;
          d++;
        }
        // Badlands: la piedra de las mesetas se vuelve terracota en franjas de colores.
        if (inf.biome === BIOME_BADLANDS) {
          for (let y = top; y > SEA_LEVEL - 8; y--) {
            const i = blockIndex(lx, y, lz);
            if (blocks[i] === STONE) blocks[i] = this.bandAt(x0 + lx, y, z0 + lz);
          }
        }
      }
    }

    // --- 4. Cuevas (rejilla gruesa + interpolación trilineal) ---
    // La rejilla empieza en MIN_Y (múltiplo de CAVE_GRID, como la de caveAt).
    const gyCount = Math.ceil((maxTop + 2 - MIN_Y) / CAVE_GRID) + 1;
    const grid = new Float64Array(5 * 5 * gyCount);
    for (let gy = 0; gy < gyCount; gy++) {
      for (let gz = 0; gz < 5; gz++) {
        for (let gx = 0; gx < 5; gx++) {
          grid[(gy * 5 + gz) * 5 + gx] = this.caveGridValue(x0 + gx * CAVE_GRID, MIN_Y + gy * CAVE_GRID, z0 + gz * CAVE_GRID);
        }
      }
    }
    for (let lz = 0; lz < 16; lz++) {
      for (let lx = 0; lx < 16; lx++) {
        const top = tops[lz * 16 + lx];
        const ceiling = this.caveCeiling(x0 + lx, z0 + lz, top);
        const gx = lx >> 2, gz = lz >> 2;
        const fx = (lx & 3) / 4, fz = (lz & 3) / 4;
        const aquifer = this.aquiferLevel(x0 + lx, z0 + lz, top);
        for (let y = MIN_Y + 5; y <= ceiling && y <= maxTop; y++) {
          const i = blockIndex(lx, y, lz);
          const b = blocks[i];
          if (b === AIR) continue;
          const gy = (y - MIN_Y) >> 2;
          const fy = ((y - MIN_Y) & 3) / 4;
          const b00 = (gy * 5 + gz) * 5 + gx;
          const b01 = b00 + 25; // gy + 1
          const v = lerp(
            lerp(
              lerp(grid[b00], grid[b00 + 1], fx),
              lerp(grid[b00 + 5], grid[b00 + 6], fx),
              fz,
            ),
            lerp(
              lerp(grid[b01], grid[b01 + 1], fx),
              lerp(grid[b01 + 5], grid[b01 + 6], fx),
              fz,
            ),
            fy,
          );
          // Por debajo de y = −54 las cuevas se llenan de lava (como en Minecraft); en los acuíferos, de agua.
          if (v > 0) blocks[i] = y <= MIN_Y + 10 ? LAVA : y <= aquifer ? WATER : AIR;
        }
      }
    }

    // --- 5. Agua y hielo (sólo donde el terreno base queda bajo el nivel del mar) ---
    for (let lz = 0; lz < 16; lz++) {
      for (let lx = 0; lx < 16; lx++) {
        const inf = infos[lz * 16 + lx];
        const baseTop = tops[lz * 16 + lx];
        if (baseTop < SEA_LEVEL - 1) {
          for (let y = SEA_LEVEL - 1; y > MIN_Y; y--) {
            const i = blockIndex(lx, y, lz);
            if (blocks[i] !== AIR) break;
            blocks[i] = WATER;
          }
          if (inf.temp < -0.58) blocks[blockIndex(lx, SEA_LEVEL - 1, lz)] = ICE;
        }
        let top = MIN_Y;
        for (let y = Math.max(maxTop, SEA_LEVEL); y > MIN_Y; y--) {
          if (blocks[blockIndex(lx, y, lz)] !== AIR) { top = y; break; }
        }
        tops[lz * 16 + lx] = top;
      }
    }

    // --- 6. Minerales y vetas de roca ---
    const rng = mulberry32(hash2(cx, cz, seed ^ 0x5eed1234));
    const vein = (id: number, count: number, minY: number, maxY: number, size: number, replace: number) => {
      for (let n = 0; n < count; n++) {
        let x = Math.floor(rng() * 16), y = minY + Math.floor(rng() * (maxY - minY)), z = Math.floor(rng() * 16);
        for (let s = 0; s < size; s++) {
          if (x >= 0 && x < 16 && z >= 0 && z < 16 && y > MIN_Y && y < MAX_Y) {
            const i = blockIndex(x, y, z);
            if (blocks[i] === replace) blocks[i] = id;
            else if (replace === STONE && blocks[i] === DEEPSLATE && DEEPSLATE_ORE[id] !== undefined) blocks[i] = DEEPSLATE_ORE[id];
          }
          const dir = Math.floor(rng() * 6);
          if (dir === 0) x++; else if (dir === 1) x--; else if (dir === 2) y++;
          else if (dir === 3) y--; else if (dir === 4) z++; else z--;
        }
      }
    };
    vein(GRANITE, 3, 5, 90, 28, STONE);
    vein(DIORITE, 3, 5, 90, 28, STONE);
    vein(ANDESITE, 3, 5, 90, 28, STONE);
    // Rangos de Minecraft 1.18: el hierro, el oro, el redstone, el lapislázuli y los diamantes
    // bajan hasta el fondo del mundo (los diamantes abundan más cerca del lecho de roca).
    vein(GRAVEL, 3, MIN_Y + 5, 70, 20, STONE);
    vein(DIRT, 3, MIN_Y + 5, 80, 20, STONE);
    vein(COAL_ORE, 22, 5, 130, 9, STONE);
    vein(IRON_ORE, 24, MIN_Y + 5, 72, 7, STONE);
    vein(GOLD_ORE, 7, MIN_Y + 5, 32, 6, STONE);
    vein(REDSTONE_ORE, 8, MIN_Y + 5, 16, 7, STONE);
    vein(REDSTONE_ORE, 4, MIN_Y + 5, MIN_Y + 32, 7, STONE);
    vein(LAPIS_ORE, 4, MIN_Y + 5, 32, 6, STONE);
    vein(DIAMOND_ORE, 2, MIN_Y + 5, 16, 5, STONE);
    vein(DIAMOND_ORE, 3, MIN_Y + 5, MIN_Y + 20, 5, STONE);
    // Cobre (más en las cuevas de goteo), toba en la pizarra profunda y esmeraldas sueltas en las montañas.
    vein(COPPER_ORE, this.caveBiomeAt(x0 + 8, z0 + 8) === 2 ? 20 : 9, -16, 112, 9, STONE);
    vein(TUFF, 3, MIN_Y + 5, 0, 32, DEEPSLATE);
    const cb = infos[8 * 16 + 8].biome;
    if (cb === BIOME_MOUNTAINS || cb === BIOME_SNOWY_PEAKS) vein(EMERALD_ORE, 8, -16, 200, 1, STONE);
    placeInfested(blocks, cx, cz, seed, cb); // Fase 6 (monstruos): piedra infestada en las montañas

    this.decorateCaves(blocks, tops, x0, z0);
    this.placeGeodes(blocks, cx, cz);

    // --- 7. Plantas y flores ---
    const col = [0, 0, 0];
    for (let lz = 0; lz < 16; lz++) {
      for (let lx = 0; lx < 16; lx++) {
        const top = tops[lz * 16 + lx];
        if (top >= MAX_Y - 2) continue;
        const ground = blocks[blockIndex(lx, top, lz)];
        const above = blockIndex(lx, top + 1, lz);
        if (blocks[above] !== AIR) continue;
        const wx = x0 + lx, wz = z0 + lz;
        const r = hashToFloat(hash2(wx, wz, seed ^ 0x9a5));
        const biome = infos[lz * 16 + lx].biome;
        if (biome >= BIOME_SWAMP || (ground === GRASS && (biome === BIOME_PLAINS || biome === BIOME_FOREST))) {
          const plant = this.newPlant(biome, ground, top, wx, wz, r);
          if (plant > 0) blocks[above] = plant;
        } else if (ground === GRASS) {
          const flowers = this.nFlowers.noise2(wx / 52, wz / 52);
          if (flowers > 0.45 && r < 0.3 && (biome === BIOME_PLAINS || biome === BIOME_FOREST || biome === BIOME_BIRCH_FOREST)) {
            const f = hashToFloat(hash2(wx, wz, seed ^ 0x77f));
            const kind = this.nFlowers.noise2(wx / 20 + 100, wz / 20);
            blocks[above] = kind > 0.25 ? CORNFLOWER : f < 0.5 ? POPPY : DANDELION;
            if (biome !== BIOME_PLAINS && f < 0.3) blocks[above] = POPPY;
          } else if (biome === BIOME_TAIGA && r < 0.14) {
            blocks[above] = FERN;
          } else if ((biome === BIOME_FOREST || biome === BIOME_TAIGA || biome === BIOME_BIRCH_FOREST) && r > 0.994) {
            blocks[above] = r > 0.997 ? RED_MUSHROOM : BROWN_MUSHROOM;
          } else {
            const p = biome === BIOME_SAVANNA ? 0.42 : biome === BIOME_PLAINS ? 0.3 : biome === BIOME_TAIGA ? 0.22 : 0.18;
            if (r < p) blocks[above] = SHORT_GRASS;
          }
        } else if (ground === SAND && biome === BIOME_DESERT && r < 0.008) {
          blocks[above] = DEAD_BUSH;
        }
        // Caña de azúcar junto al agua.
        if ((ground === GRASS || ground === SAND || ground === DIRT) && top === SEA_LEVEL - 1 && r > 0.82) {
          let water = false;
          if (lx > 0 && blocks[blockIndex(lx - 1, top, lz)] === WATER) water = true;
          if (lx < 15 && blocks[blockIndex(lx + 1, top, lz)] === WATER) water = true;
          if (lz > 0 && blocks[blockIndex(lx, top, lz - 1)] === WATER) water = true;
          if (lz < 15 && blocks[blockIndex(lx, top, lz + 1)] === WATER) water = true;
          if (water) {
            const hgt = 1 + (hash2(wx, wz, seed ^ 0x51) % 3);
            for (let k = 1; k <= hgt; k++) blocks[blockIndex(lx, top + k, lz)] = SUGAR_CANE;
          }
        }
      }
    }

    // --- 7b. Calabazas (llanuras, bosques, taigas) y sandías (sabanas y llanuras): grupos raros ---
    const patch = hashToFloat(hash2(cx, cz, seed ^ 0x6a7c));
    if (patch < 0.05) {
      const melon = patch < 0.015;
      const pr = mulberry32(hash2(cx, cz, seed ^ 0x3d1));
      const clx = 3 + Math.floor(pr() * 10), clz = 3 + Math.floor(pr() * 10);
      const b0 = infos[clz * 16 + clx].biome;
      const okBiome = melon
        ? b0 === BIOME_SAVANNA || b0 === BIOME_PLAINS || b0 === BIOME_JUNGLE
        : b0 === BIOME_PLAINS || b0 === BIOME_FOREST || b0 === BIOME_TAIGA || b0 === BIOME_BIRCH_FOREST;
      for (let k = 0; okBiome && k < 10; k++) {
        const lx = clx + Math.floor(pr() * 7) - 3, lz = clz + Math.floor(pr() * 7) - 3;
        if (lx < 0 || lx > 15 || lz < 0 || lz > 15) continue;
        const top = tops[lz * 16 + lx];
        if (top >= MAX_Y - 2 || blocks[blockIndex(lx, top, lz)] !== GRASS) continue;
        const above = blockIndex(lx, top + 1, lz);
        const cur = blocks[above];
        if (cur !== AIR && cur !== SHORT_GRASS && cur !== FERN) continue;
        blocks[above] = melon ? MELON : PUMPKIN;
      }
    }

    // --- 8. Árboles y cactus (rejilla de celdas 4x4; pueden cruzar bordes de chunk) ---
    const set = (x: number, y: number, z: number, id: number, force: boolean) => {
      const lx = x - x0, lz = z - z0;
      if (lx < 0 || lx >= 16 || lz < 0 || lz >= 16 || y <= MIN_Y || y >= MAX_Y) return;
      const i = blockIndex(lx, y, lz);
      const cur = blocks[i];
      if (cur === AIR || (force && (BLOCK_REPLACEABLE[cur] || BLOCK_RENDER[cur] === R_CROSS || isLeaves(cur)))) {
        blocks[i] = id;
      }
    };
    const tmpInfo: ColumnInfo = { height: 0, amp: 0, temp: 0, humid: 0, mount: 0, cont: 0, biome: 0 };
    // Dentro de una aldea no crecen árboles (ni sus copas invaden calles y casas).
    const village = locateStructure(this, 'village', x0 + 8, z0 + 8, 1);
    const villageR = VILLAGE_RADIUS + 8;
    const nearVillage = village && Math.hypot(village[0] - (x0 + 8), village[2] - (z0 + 8)) < villageR + 40;
    // Las copas llegan hasta 8 bloques del tronco (cerezos y jungla gigante).
    const cMin = Math.floor((x0 - 8) / 4), cMax = Math.floor((x0 + 23) / 4);
    const kMin = Math.floor((z0 - 8) / 4), kMax = Math.floor((z0 + 23) / 4);
    for (let ck = kMin; ck <= kMax; ck++) {
      for (let cc = cMin; cc <= cMax; cc++) {
        const h = hash2(cc, ck, seed ^ 0x7a3e);
        const tx = cc * 4 + (h & 3);
        const tz = ck * 4 + ((h >>> 2) & 3);
        const r = ((h >>> 8) & 0xffff) / 65536;
        if (tx < x0 - 8 || tx > x0 + 23 || tz < z0 - 8 || tz > z0 + 23) continue;
        if (nearVillage && Math.hypot(tx - village![0], tz - village![2]) < villageR) continue;
        const inf = this.columnInfo(tx, tz, tmpInfo);
        const density = TREE_DENSITY[inf.biome];
        if (r >= density) continue;
        const biome = inf.biome;
        // Decisión determinista e independiente del chunk que la evalúa (los árboles cruzan bordes).
        const sy = this.treeGround(tx, tz, inf);
        if (sy < 0) continue;
        const inside = tx >= x0 && tx < x0 + 16 && tz >= z0 && tz < z0 + 16;
        const tr = hashToFloat(hash2(tx, tz, seed ^ 0x3a7));
        if (biome === BIOME_DESERT || biome === BIOME_BADLANDS) {
          const hgt = 1 + Math.floor(tr * 3);
          for (let k = 1; k <= hgt; k++) set(tx, sy + k, tz, CACTUS, true);
          continue;
        }
        if (biome === BIOME_ICE_SPIKES) {
          this.iceSpike(tx, sy + 1, tz, tr, set);
          continue;
        }
        if (biome === BIOME_TAIGA || biome === BIOME_SNOWY || biome === BIOME_MOUNTAINS) {
          this.spruce(tx, sy + 1, tz, tr, set);
        } else if (biome === BIOME_BIRCH_FOREST) {
          if (tr < 0.85) this.oak(tx, sy + 1, tz, tr, BIRCH_LOG, BIRCH_LEAVES, set);
          else this.oak(tx, sy + 1, tz, tr, OAK_LOG, OAK_LEAVES, set);
        } else if (biome === BIOME_FOREST) {
          if (tr < 0.22) this.oak(tx, sy + 1, tz, tr, BIRCH_LOG, BIRCH_LEAVES, set);
          else if (tr > 0.9) this.bigOak(tx, sy + 1, tz, tr, set);
          else this.oak(tx, sy + 1, tz, tr, OAK_LOG, OAK_LEAVES, set);
        } else if (biome === BIOME_SAVANNA) {
          this.savannaTree(tx, sy + 1, tz, tr, set);
        } else if (biome === BIOME_SWAMP) {
          this.swampOak(tx, sy + 1, tz, tr, set);
        } else if (biome === BIOME_JUNGLE) {
          if (tr < 0.12) this.megaJungle(tx, sy + 1, tz, tr, set);
          else if (tr < 0.55) this.jungleTree(tx, sy + 1, tz, tr, set);
          else this.jungleBush(tx, sy + 1, tz, set);
        } else if (biome === BIOME_DARK_FOREST) {
          if (tr < 0.06) this.hugeMushroom(tx, sy + 1, tz, tr, tr < 0.03, set);
          else if (tr < 0.82) this.darkOak(tx, sy + 1, tz, tr, set);
          else if (tr < 0.92) this.oak(tx, sy + 1, tz, tr, OAK_LOG, OAK_LEAVES, set);
          else this.oak(tx, sy + 1, tz, tr, BIRCH_LOG, BIRCH_LEAVES, set);
        } else if (biome === BIOME_MUSHROOM_FIELDS) {
          this.hugeMushroom(tx, sy + 1, tz, tr, tr < 0.5, set);
        } else if (biome === BIOME_CHERRY_GROVE) {
          this.cherry(tx, sy + 1, tz, tr, set);
        } else if (biome === BIOME_MEADOW) {
          if (tr < 0.6) this.oak(tx, sy + 1, tz, tr, OAK_LOG, OAK_LEAVES, set);
          else this.oak(tx, sy + 1, tz, tr, BIRCH_LOG, BIRCH_LEAVES, set);
        } else {
          if (tr > 0.8) this.bigOak(tx, sy + 1, tz, tr, set);
          else this.oak(tx, sy + 1, tz, tr, OAK_LOG, OAK_LEAVES, set);
        }
        // Fase 6 (fauna): nidos de abejas en algunos robles y abedules de llanuras y praderas.
        placeBeeNest(seed, biome, tx, sy + 1, tz, tr, set);
        // El tronco convierte la hierba de debajo en tierra.
        if (inside) {
          const gi = blockIndex(tx - x0, sy, tz - z0);
          if (blocks[gi] === GRASS || blocks[gi] === SNOWY_GRASS) blocks[gi] = DIRT;
        }
      }
    }

    // --- 8b. Estructuras (mazmorras, minas, templos, naufragios…) ---
    const villagers: VillagerSpawn[] = []; // Fase 6 (aldeanos)
    const chests = placeStructures(this, blocks, cx, cz, tops, villagers);
    // Fase 6.5 (océano y plantas): arrecifes, algas y praderas marinas; flores altas, bayas, azaleas y cuevas frondosas.
    decorate65(this, blocks, tops, infos, cx, cz);

    // --- 8c. Nieve sobre todo lo que queda a la intemperie en las zonas frías ---
    for (let lz = 0; lz < 16; lz++) {
      for (let lx = 0; lx < 16; lx++) {
        const ci = infos[lz * 16 + lx];
        if (ci.temp >= -0.5 || ci.biome === BIOME_MUSHROOM_FIELDS) continue;
        let y = Math.min(MAX_Y - 2, Math.max(maxTop, SEA_LEVEL) + 32);
        while (y > MIN_Y && blocks[blockIndex(lx, y, lz)] === AIR) y--;
        const b = blocks[blockIndex(lx, y, lz)];
        if (b === ICE || b === PACKED_ICE || b === WATER || !(BLOCK_OPAQUE[b] || isLeaves(b))) continue;
        blocks[blockIndex(lx, y + 1, lz)] = SNOW_LAYER;
      }
    }

    // --- 9. Lecho de roca (en y = −64 y salpicado hasta −60) ---
    for (let lz = 0; lz < 16; lz++) {
      for (let lx = 0; lx < 16; lx++) {
        blocks[blockIndex(lx, MIN_Y, lz)] = BEDROCK;
        for (let k = 1; k < 4; k++) {
          const y = MIN_Y + k;
          if (hashToFloat(hash3(x0 + lx, y, z0 + lz, seed ^ 0xbed)) < (4 - k) / 5) blocks[blockIndex(lx, y, lz)] = BEDROCK;
        }
      }
    }

    // --- 10. Alturas finales y tinte del bioma ---
    for (let lz = 0; lz < 16; lz++) {
      for (let lx = 0; lx < 16; lx++) {
        let y = MAX_Y - 1;
        while (y > MIN_Y && blocks[blockIndex(lx, y, lz)] === AIR) y--;
        heights[lz * 16 + lx] = y;
      }
    }
    const tint = new Uint8Array(64);
    for (let j = 0; j < 4; j++) {
      for (let i = 0; i < 4; i++) {
        const inf = this.columnInfo(x0 + i * 4 + 2, z0 + j * 4 + 2, tmpInfo);
        TerrainGenerator.biomeGrass(inf, col);
        const o = (j * 4 + i) * 4;
        tint[o] = Math.round(col[0]);
        tint[o + 1] = Math.round(col[1]);
        tint[o + 2] = Math.round(col[2]);
        tint[o + 3] = Math.round(clamp01(inf.temp * 0.6 + 0.5) * 255);
      }
    }
    return { blocks, tint, heights, chests, villagers };
  }

  // ---------------------------------------------------------------- árboles
  /**
   * Hace crecer un árbol desde un brote (kind: posición de su madera en WOOD_TYPES: 0 roble,
   * 1 abedul, 2 abeto, 3 jungla, 4 acacia, 5 roble oscuro, 6 cerezo). `mega`: desde 2×2 brotes, con
   * (x, z) en la esquina noroeste. `set` recibe los bloques con `force` = true para el tronco (puede
   * sustituir plantas y hojas) y false para las hojas.
   */
  growTree(kind: number, x: number, y: number, z: number, r: number, set: SetBlock, mega = false): void {
    switch (kind) {
      case 1: return this.oak(x, y, z, r, BIRCH_LOG, BIRCH_LEAVES, set);
      case 2: return this.spruce(x, y, z, r, set);
      case 3: return mega ? this.megaJungle(x, y, z, r, set) : this.jungleTree(x, y, z, r, set);
      case 4: return this.savannaTree(x, y, z, r, set);
      case 5: return this.darkOak(x, y, z, r, set);
      case 6: return this.cherry(x, y, z, r, set);
    }
    if (r > 0.9) this.bigOak(x, y, z, r, set);
    else this.oak(x, y, z, r, OAK_LOG, OAK_LEAVES, set);
  }

  private oak(
    x: number, y: number, z: number, r: number, log: number, leaves: number,
    set: (x: number, y: number, z: number, id: number, force: boolean) => void,
  ): void {
    const h = 4 + Math.floor(r * 1000) % 3 + (log === BIRCH_LOG ? 1 : 0);
    for (let k = 0; k < h; k++) set(x, y + k, z, log, true);
    const top = y + h - 1;
    for (let dy = -2; dy <= 1; dy++) {
      const rad = dy <= -1 ? 2 : 1;
      for (let dz = -rad; dz <= rad; dz++) {
        for (let dx = -rad; dx <= rad; dx++) {
          const corner = Math.abs(dx) === rad && Math.abs(dz) === rad;
          if (corner) {
            if (dy === 1) continue;
            if (hash3(x + dx, top + dy, z + dz, this.seed ^ 0x1ea) % 3 === 0) continue;
          }
          if (dy === 1 && (Math.abs(dx) + Math.abs(dz) > 1)) continue;
          set(x + dx, top + dy, z + dz, leaves, false);
        }
      }
    }
  }

  private bigOak(
    x: number, y: number, z: number, r: number,
    set: (x: number, y: number, z: number, id: number, force: boolean) => void,
  ): void {
    const h = 6 + Math.floor(r * 997) % 3;
    for (let k = 0; k < h; k++) set(x, y + k, z, OAK_LOG, true);
    const top = y + h - 1;
    // Ramas
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (let d = 0; d < 4; d++) {
      if (hash2(x + d, z - d, this.seed ^ 0xb4) % 2 === 0) continue;
      const bx = x + dirs[d][0] * 2, bz = z + dirs[d][1] * 2;
      set(x + dirs[d][0], top - 2, z + dirs[d][1], OAK_LOG, true);
      set(bx, top - 1, bz, OAK_LOG, true);
      this.leafBlob(bx, top, bz, 2, set);
    }
    this.leafBlob(x, top, z, 3, set);
  }

  private leafBlob(
    x: number, y: number, z: number, rad: number,
    set: (x: number, y: number, z: number, id: number, force: boolean) => void,
  ): void {
    for (let dy = -rad + 1; dy <= rad - 1; dy++) {
      for (let dz = -rad; dz <= rad; dz++) {
        for (let dx = -rad; dx <= rad; dx++) {
          const d = dx * dx + dz * dz + dy * dy * 2.2;
          const lim = rad * rad + 0.6 + (hash3(x + dx, y + dy, z + dz, this.seed ^ 0x2ee) % 3) * 0.5;
          if (d <= lim) set(x + dx, y + dy, z + dz, OAK_LEAVES, false);
        }
      }
    }
  }

  private spruce(
    x: number, y: number, z: number, r: number,
    set: (x: number, y: number, z: number, id: number, force: boolean) => void,
  ): void {
    const h = 7 + Math.floor(r * 1000) % 5;
    for (let k = 0; k < h; k++) set(x, y + k, z, SPRUCE_LOG, true);
    const top = y + h;
    set(x, top, z, SPRUCE_LEAVES, false);
    set(x, top + 1, z, SPRUCE_LEAVES, false);
    let rad = 0;
    const leafStart = y + 2 + (Math.floor(r * 37) % 2);
    for (let yy = top - 1; yy >= leafStart; yy--) {
      const layer = top - 1 - yy;
      rad = layer % 2 === 0 ? Math.min(1 + Math.floor(layer / 3), 3) : Math.max(0, Math.min(1 + Math.floor(layer / 3), 3) - 1);
      for (let dz = -rad; dz <= rad; dz++) {
        for (let dx = -rad; dx <= rad; dx++) {
          if (Math.abs(dx) + Math.abs(dz) > rad + (rad > 1 ? 1 : 0)) continue;
          if (dx === 0 && dz === 0) continue;
          set(x + dx, yy, z + dz, SPRUCE_LEAVES, false);
        }
      }
    }
  }

  private savannaTree(x: number, y: number, z: number, r: number, set: SetBlock): void {
    // Acacia: tronco inclinado y copa plana.
    const log = ACACIA_LOG, leaves = ACACIA_LEAVES;
    const h = 4 + Math.floor(r * 1000) % 2;
    const dirIdx = Math.floor(r * 4000) % 4;
    const ddx = [1, -1, 0, 0][dirIdx], ddz = [0, 0, 1, -1][dirIdx];
    let cx = x, cz = z;
    for (let k = 0; k < h; k++) {
      if (k >= 2) { cx += ddx; cz += ddz; }
      set(cx, y + k, cz, log, true);
    }
    const top = y + h;
    this.acaciaCanopy(cx, top, cz, leaves, set);
    // La acacia a veces abre una segunda rama hacia el otro lado, con su propia copa más baja.
    if (Math.floor(r * 7919) % 2 === 0) {
      let bx = x, bz = z;
      const by = y + 1;
      for (let k = 1; k <= 3; k++) {
        bx -= ddx;
        bz -= ddz;
        set(bx, by + k, bz, log, true);
      }
      this.acaciaCanopy(bx, by + 4, bz, leaves, set);
    }
  }

  private acaciaCanopy(cx: number, top: number, cz: number, leaves: number, set: SetBlock): void {
    for (let dz = -2; dz <= 2; dz++) {
      for (let dx = -2; dx <= 2; dx++) {
        if (Math.abs(dx) === 2 && Math.abs(dz) === 2) continue;
        set(cx + dx, top, cz + dz, leaves, false);
      }
    }
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) set(cx + dx, top + 1, cz + dz, leaves, false);
    }
  }

  // ---------------------------------------------------------------- árboles de la fase 5

  /** ¿Está (x, z) dentro del disco de hojas de radio `rad` centrado en (cx, cz)? (borde irregular) */
  private inDisc(cx: number, cz: number, rad: number, x: number, y: number, z: number): boolean {
    const dx = x + 0.5 - cx, dz = z + 0.5 - cz;
    return dx * dx + dz * dz <= rad * rad + rad * 0.6 + (hash3(x, y, z, this.seed ^ 0x2ee) % 3) * 0.25;
  }

  /** Capa de hojas: centro (cx, cz) en coordenadas del mundo (x + 0,5 para un tronco, x + 1 para 2×2). */
  private leafDisc(cx: number, y: number, cz: number, rad: number, leaves: number, set: SetBlock): void {
    const r0 = Math.ceil(rad + 1);
    const ix = Math.floor(cx), iz = Math.floor(cz);
    for (let z = iz - r0; z <= iz + r0; z++) {
      for (let x = ix - r0; x <= ix + r0; x++) if (this.inDisc(cx, cz, rad, x, y, z)) set(x, y, z, leaves, false);
    }
  }

  /** Enredaderas colgando del borde de una capa de hojas (sólo donde el borde es hoja y fuera hay aire). */
  private hangVines(cx: number, y: number, cz: number, rad: number, chance: number, set: SetBlock): void {
    const ix = Math.floor(cx), iz = Math.floor(cz);
    for (let d = 0; d < 4; d++) {
      for (let k = -2; k <= 2; k++) {
        let ex = ix + (DIR_X[d] === 0 ? k : 0), ez = iz + (DIR_Z[d] === 0 ? k : 0);
        if (!this.inDisc(cx, cz, rad, ex, y, ez)) continue;
        while (this.inDisc(cx, cz, rad, ex + DIR_X[d], y, ez + DIR_Z[d])) {
          ex += DIR_X[d];
          ez += DIR_Z[d];
        }
        const h = hash3(ex, y, ez, this.seed ^ 0x71e);
        if ((h % 100) / 100 >= chance) continue;
        const len = 1 + ((h >>> 8) % 4);
        for (let j = 0; j < len; j++) set(ex + DIR_X[d], y - j, ez + DIR_Z[d], VINE + d, false);
      }
    }
  }

  /** Enredaderas pegadas a las caras de un tronco (celdas x0..x1 × z0..z1) entre y0 e y1. */
  private trunkVines(x0: number, z0: number, x1: number, z1: number, y0: number, y1: number, chance: number, set: SetBlock): void {
    const vine = (x: number, y: number, z: number, f: number) => {
      if ((hash3(x, y, z, this.seed ^ 0x3c1) % 100) / 100 < chance) set(x, y, z, VINE + f, false);
    };
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        vine(x, y, z0 - 1, 0);
        vine(x, y, z1 + 1, 2);
      }
      for (let z = z0; z <= z1; z++) {
        vine(x1 + 1, y, z, 1);
        vine(x0 - 1, y, z, 3);
      }
    }
  }

  /** Roble de pantano: copa ancha y baja con enredaderas colgando. */
  private swampOak(x: number, y: number, z: number, r: number, set: SetBlock): void {
    const h = 5 + Math.floor(r * 1000) % 3;
    for (let k = 0; k < h; k++) set(x, y + k, z, OAK_LOG, true);
    const top = y + h - 1;
    const radii = [3, 3, 2, 1.2];
    for (let k = 0; k < 4; k++) this.leafDisc(x + 0.5, top - 2 + k, z + 0.5, radii[k], OAK_LEAVES, set);
    this.hangVines(x + 0.5, top - 2, z + 0.5, 3, 0.5, set);
  }

  /** Árbol de jungla pequeño, con alguna enredadera en el tronco. */
  private jungleTree(x: number, y: number, z: number, r: number, set: SetBlock): void {
    const h = 5 + Math.floor(r * 1000) % 5;
    for (let k = 0; k < h; k++) set(x, y + k, z, JUNGLE_LOG, true);
    const top = y + h - 1;
    const radii = [2.2, 2.2, 1.4, 0.8];
    for (let k = 0; k < 4; k++) this.leafDisc(x + 0.5, top - 2 + k, z + 0.5, radii[k], JUNGLE_LEAVES, set);
    this.trunkVines(x, z, x, z, y, top - 2, 0.3, set);
    this.hangVines(x + 0.5, top - 2, z + 0.5, 2.2, 0.25, set);
  }

  /** Arbusto de jungla: un tronco con una bola de hojas de roble (como en Minecraft). */
  private jungleBush(x: number, y: number, z: number, set: SetBlock): void {
    set(x, y, z, JUNGLE_LOG, true);
    this.leafDisc(x + 0.5, y, z + 0.5, 2.2, OAK_LEAVES, set);
    this.leafDisc(x + 0.5, y + 1, z + 0.5, 1.3, OAK_LEAVES, set);
    set(x, y + 2, z, OAK_LEAVES, false);
  }

  /** Árbol de jungla gigante: tronco de 2×2, ramas con copa propia y muchas enredaderas. */
  private megaJungle(x: number, y: number, z: number, r: number, set: SetBlock): void {
    const h = 16 + Math.floor(r * 1000) % 12;
    for (let k = 0; k < h; k++) {
      for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) set(x + dx, y + k, z + dz, JUNGLE_LOG, true);
    }
    const top = y + h - 1;
    const radii = [4.2, 4.8, 3.8, 2.2];
    for (let k = 0; k < 4; k++) this.leafDisc(x + 1, top - 1 + k, z + 1, radii[k], JUNGLE_LEAVES, set);
    // Ramas.
    const n = 2 + Math.floor(r * 37) % 3;
    for (let i = 0; i < n; i++) {
      const d = (Math.floor(r * 97) + i) % 4;
      const by = y + Math.floor(h * 0.45) + i * 3;
      if (by > top - 4) break;
      let bx = x + (DIR_X[d] > 0 ? 1 : 0), bz = z + (DIR_Z[d] > 0 ? 1 : 0);
      let yy = by;
      for (let s2 = 1; s2 <= 3; s2++) {
        bx += DIR_X[d];
        bz += DIR_Z[d];
        if (s2 > 1) yy++;
        // El primer tramo sale en horizontal (tronco tumbado); luego sube.
        set(bx, yy, bz, s2 === 1 ? horizontalLog(JUNGLE_LOG, DIR_X[d] !== 0 ? AXIS_X : AXIS_Z) : JUNGLE_LOG, true);
      }
      this.leafDisc(bx + 0.5, yy, bz + 0.5, 2, JUNGLE_LEAVES, set);
      this.leafDisc(bx + 0.5, yy + 1, bz + 0.5, 1.2, JUNGLE_LEAVES, set);
    }
    this.trunkVines(x, z, x + 1, z + 1, y, top - 2, 0.55, set);
    this.hangVines(x + 1, top - 1, z + 1, 4.2, 0.45, set);
  }

  /** Roble oscuro: tronco de 2×2 y una copa ancha y espesa. */
  private darkOak(x: number, y: number, z: number, r: number, set: SetBlock): void {
    const h = 6 + Math.floor(r * 1000) % 3;
    for (let k = 0; k < h; k++) {
      for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) set(x + dx, y + k, z + dz, DARK_OAK_LOG, true);
    }
    const top = y + h - 1;
    // Dos ramas cortas bajo la copa.
    for (let i = 0; i < 2; i++) {
      const d = (Math.floor(r * 131) + i * 2) % 4;
      const bx = x + (DIR_X[d] > 0 ? 1 : 0) + DIR_X[d], bz = z + (DIR_Z[d] > 0 ? 1 : 0) + DIR_Z[d];
      set(bx, top - 1, bz, horizontalLog(DARK_OAK_LOG, DIR_X[d] !== 0 ? AXIS_X : AXIS_Z), true);
      set(bx + DIR_X[d], top, bz + DIR_Z[d], DARK_OAK_LOG, true);
      this.leafDisc(bx + DIR_X[d] + 0.5, top + 1, bz + DIR_Z[d] + 0.5, 1.8, DARK_OAK_LEAVES, set);
    }
    const radii = [3.2, 3.8, 3.2, 1.8];
    for (let k = 0; k < 4; k++) this.leafDisc(x + 1, top - 1 + k, z + 1, radii[k], DARK_OAK_LEAVES, set);
  }

  /**
   * Cerezo (como en Minecraft): tronco corto del que salen dos o tres ramas; cada una va en
   * horizontal (troncos tumbados, con la corteza a lo largo) y luego sube hasta su copa rosa, que
   * cuelga por debajo.
   */
  private cherry(x: number, y: number, z: number, r: number, set: SetBlock): void {
    const h = 3 + Math.floor(r * 1000) % 2;
    for (let k = 0; k < h; k++) set(x, y + k, z, CHERRY_LOG, true);
    const n = 2 + Math.floor(r * 53) % 2;
    const d0 = Math.floor(r * 4000) % 4;
    for (let i = 0; i < n; i++) {
      // Direcciones distintas; con tres ramas, una se abre en diagonal (un paso de lado a mitad).
      const d = (d0 + i * (n === 2 ? 2 : 1)) % 4;
      const dx = DIR_X[d], dz = DIR_Z[d];
      const sx = DIR_X[(d + 1) & 3], sz = DIR_Z[(d + 1) & 3];
      const len = 2 + (Math.floor(r * 91) + i) % 3;
      const jog = n === 3 && i === 2 ? 1 : 0;
      const by = y + h - 1 - ((Math.floor(r * 29) + i) % 2);
      let ex = x, ez = z;
      const across = dx !== 0 ? AXIS_X : AXIS_Z;
      for (let s2 = 1; s2 <= len; s2++) {
        ex += dx;
        ez += dz;
        if (jog && s2 === 2) {
          ex += sx;
          ez += sz;
        }
        set(ex, by, ez, horizontalLog(CHERRY_LOG, across), true);
      }
      // Sube hasta la copa.
      const up = 1 + (Math.floor(r * 67) + i) % 2;
      let ey = by;
      for (let k = 1; k <= up; k++) set(ex, ++ey, ez, CHERRY_LOG, true);
      const radii = [3.1, 2.7, 1.7];
      for (let k = 0; k < 3; k++) this.leafDisc(ex + 0.5, ey + k, ez + 0.5, radii[k], CHERRY_LEAVES, set);
      // Hojas que cuelgan bajo la copa.
      for (let dz = -3; dz <= 3; dz++) {
        for (let dx = -3; dx <= 3; dx++) {
          if (!this.inDisc(ex + 0.5, ez + 0.5, 3.1, ex + dx, ey, ez + dz)) continue;
          const hh = hash3(ex + dx, ey, ez + dz, this.seed ^ 0xc4e);
          if (hh % 5 === 0) set(ex + dx, ey - 1, ez + dz, CHERRY_LEAVES, false);
          if (hh % 13 === 0) set(ex + dx, ey - 2, ez + dz, CHERRY_LEAVES, false);
        }
      }
    }
  }

  /** Champiñón gigante: rojo (sombrero en cúpula) o marrón (sombrero plano y ancho). */
  private hugeMushroom(x: number, y: number, z: number, r: number, red: boolean, set: SetBlock): void {
    const h = 5 + Math.floor(r * 1000) % 3;
    for (let k = 0; k < h; k++) set(x, y + k, z, MUSHROOM_STEM, true);
    const top = y + h;
    if (red) {
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) set(x + dx, top, z + dz, RED_MUSHROOM_BLOCK, false);
      for (let yy = top - 3; yy < top; yy++) {
        for (let dz = -2; dz <= 2; dz++) {
          for (let dx = -2; dx <= 2; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dz)) !== 2 || (Math.abs(dx) === 2 && Math.abs(dz) === 2)) continue;
            set(x + dx, yy, z + dz, RED_MUSHROOM_BLOCK, false);
          }
        }
      }
    } else {
      for (let dz = -3; dz <= 3; dz++) {
        for (let dx = -3; dx <= 3; dx++) {
          if (Math.abs(dx) === 3 && Math.abs(dz) === 3) continue;
          set(x + dx, top, z + dz, BROWN_MUSHROOM_BLOCK, false);
        }
      }
    }
  }

  /** Pico de hielo compacto; de vez en cuando, uno enorme. */
  private iceSpike(x: number, y: number, z: number, r: number, set: SetBlock): void {
    const huge = r < 0.004;
    const h = huge ? 24 + Math.floor(r * 1e5) % 16 : 5 + Math.floor(r * 1000) % 9;
    const base = huge ? 2.8 : 1.5;
    for (let k = 0; k <= h; k++) {
      const rad = Math.max(0.2, base * (1 - k / h));
      const r0 = Math.ceil(rad);
      for (let dz = -r0; dz <= r0; dz++) {
        for (let dx = -r0; dx <= r0; dx++) if (dx * dx + dz * dz <= rad * rad + 0.3) set(x + dx, y + k, z + dz, PACKED_ICE, true);
      }
    }
  }

  /** Plantas de los biomas nuevos (y flores nuevas en llanuras y bosques): id o 0. */
  private newPlant(biome: number, ground: number, top: number, wx: number, wz: number, r: number): number {
    const seed = this.seed;
    const flowers = this.nFlowers.noise2(wx / 52, wz / 52);
    const kind = this.nFlowers.noise2(wx / 20 + 100, wz / 20);
    const f = hashToFloat(hash2(wx, wz, seed ^ 0x77f));
    const mushroom = r > 0.997 ? RED_MUSHROOM : BROWN_MUSHROOM;
    if (ground === WATER) return biome === BIOME_SWAMP && top === SEA_LEVEL - 1 && r < 0.07 ? LILY_PAD : 0;
    if (ground === MYCELIUM) return r < 0.015 ? mushroom : 0;
    if (ground === RED_SAND) return biome === BIOME_BADLANDS && r < 0.012 ? DEAD_BUSH : 0;
    if (ground !== GRASS) return 0;
    switch (biome) {
      case BIOME_PLAINS:
      case BIOME_FOREST: {
        if (flowers > 0.45 && r < 0.3) {
          if (biome === BIOME_FOREST) return f < 0.3 ? POPPY : f < 0.55 ? FLOWERS.lily_of_the_valley : DANDELION;
          // Llanuras: tulipanes en rodales, y margaritas, rubias azules y acianos.
          if (kind > 0.3) return [FLOWERS.red_tulip, FLOWERS.orange_tulip, FLOWERS.white_tulip, FLOWERS.pink_tulip][Math.floor(f * 4)];
          if (kind < -0.3) return f < 0.5 ? FLOWERS.oxeye_daisy : FLOWERS.azure_bluet;
          return f < 0.4 ? POPPY : f < 0.8 ? DANDELION : CORNFLOWER;
        }
        if (biome === BIOME_FOREST && r > 0.994) return mushroom;
        return r < (biome === BIOME_PLAINS ? 0.3 : 0.18) ? SHORT_GRASS : 0;
      }
      case BIOME_SWAMP:
        if (r < 0.03) return FLOWERS.blue_orchid;
        if (r > 0.99) return mushroom;
        return r < 0.25 ? SHORT_GRASS : 0;
      case BIOME_JUNGLE:
        return r < 0.35 ? SHORT_GRASS : r < 0.55 ? FERN : 0;
      case BIOME_DARK_FOREST:
        if (r > 0.985) return mushroom;
        if (flowers > 0.55 && r < 0.1) return f < 0.5 ? POPPY : FLOWERS.lily_of_the_valley;
        return r < 0.25 ? SHORT_GRASS : 0;
      case BIOME_MEADOW:
        if (flowers > -0.1 && r < 0.35) {
          return [FLOWERS.allium, FLOWERS.azure_bluet, FLOWERS.oxeye_daisy, CORNFLOWER, DANDELION, POPPY][Math.floor((kind * 0.5 + 0.5) * 5.99)];
        }
        return r < 0.65 ? SHORT_GRASS : 0;
      case BIOME_CHERRY_GROVE:
        return r < 0.28 ? PINK_PETALS : r < 0.42 ? SHORT_GRASS : 0;
      case BIOME_SAVANNA:
        return r < 0.42 ? SHORT_GRASS : 0;
    }
    return r < 0.18 ? SHORT_GRASS : 0;
  }

  // ---------------------------------------------------------------- subsuelo

  /** Cuevas frondosas (musgo, azaleas, enredaderas con bayas) y de goteo (espeleotemas). */
  private decorateCaves(blocks: Uint16Array, tops: Int16Array, x0: number, z0: number): void {
    const seed = this.seed;
    const ROW = 256; // distancia en el índice entre una fila y la siguiente
    const solid = (b: number) => b !== AIR && BLOCK_OPAQUE[b] === 1;
    const drip = (dir: number, part: number) => POINTED_DRIPSTONE + dir + part * 2;
    for (let lz = 0; lz < 16; lz++) {
      for (let lx = 0; lx < 16; lx++) {
        const wx = x0 + lx, wz = z0 + lz;
        const kind = this.caveBiomeAt(wx, wz);
        if (kind === 0) continue;
        const top = tops[lz * 16 + lx];
        for (let y = MIN_Y + 6; y < top - 12; y++) {
          const i = blockIndex(lx, y, lz);
          if (blocks[i] !== AIR) continue;
          const h = hash3(wx, y, wz, seed ^ 0xca7e);
          const r = (h & 0xffff) / 65536;
          const r2 = ((h >>> 16) & 0xff) / 256;
          const len = 1 + ((h >>> 24) % 4);
          const floor = solid(blocks[i - ROW]), ceil = solid(blocks[i + ROW]);
          if (kind === 1) {
            if (floor) {
              if (r < 0.85) blocks[i - ROW] = MOSS_BLOCK;
              if (r2 < 0.2) blocks[i] = MOSS_CARPET;
              else if (r2 < 0.24) blocks[i] = AZALEA;
              else if (r2 < 0.26) blocks[i] = FLOWERING_AZALEA;
              else if (r2 < 0.42) blocks[i] = SHORT_GRASS;
            }
            if (ceil) {
              if (r < 0.6) blocks[i + ROW] = MOSS_BLOCK;
              if (r2 > 0.88 && blocks[i] === AIR) {
                for (let k = 0; k <= len && y - k > MIN_Y + 5; k++) {
                  const j = i - k * ROW;
                  if (blocks[j] !== AIR) break;
                  blocks[j] = hash3(wx, y - k, wz, seed ^ 0xbe1) % 3 === 0 ? CAVE_VINES + 1 : CAVE_VINES;
                }
              }
            }
          } else {
            if (floor) {
              if (r < 0.5) blocks[i - ROW] = DRIPSTONE_BLOCK;
              if (r2 < 0.08) {
                let n = 0;
                while (n < len && y + n < top - 12 && blocks[i + n * ROW] === AIR) n++;
                for (let k = 0; k < n; k++) blocks[i + k * ROW] = drip(0, k === n - 1 ? 0 : k === 0 && n >= 3 ? 2 : 1);
              }
            }
            if (ceil && blocks[i] === AIR) {
              if (r < 0.5) blocks[i + ROW] = DRIPSTONE_BLOCK;
              if (r2 > 0.9) {
                let n = 0;
                while (n < len && y - n > MIN_Y + 5 && blocks[i - n * ROW] === AIR) n++;
                for (let k = 0; k < n; k++) blocks[i - k * ROW] = drip(1, k === n - 1 ? 0 : k === 0 && n >= 3 ? 2 : 1);
              }
            }
          }
        }
      }
    }
  }

  /**
   * Geodas de amatista (una de cada ~24 chunks, entre y = −50 y 20): capas de basalto liso, calcita
   * y amatista (con alguna amatista con brotes que echa racimos) alrededor de un hueco. Pueden
   * cruzar el borde del chunk: cada chunk dibuja su parte de las geodas de sus vecinos.
   */
  private placeGeodes(blocks: Uint16Array, cx: number, cz: number): void {
    const seed = this.seed;
    const x0 = cx * CHUNK_SIZE, z0 = cz * CHUNK_SIZE;
    for (let gz = cz - 1; gz <= cz + 1; gz++) {
      for (let gx = cx - 1; gx <= cx + 1; gx++) {
        const h = hash2(gx, gz, seed ^ 0x6e0de);
        if (h % 24 !== 0) continue;
        const ox = gx * 16 + ((h >>> 5) & 15), oz = gz * 16 + ((h >>> 9) & 15);
        const oy = -50 + ((h >>> 13) % 70);
        const R = 5 + ((h >>> 20) % 3);
        // Que no asome a la superficie ni al fondo del mar.
        if (oy + R > this.columnInfo(ox, oz).height - 10) continue;
        for (let y = oy - R; y <= oy + R; y++) {
          if (y <= MIN_Y + 4) continue;
          for (let z = Math.max(z0, oz - R); z <= Math.min(z0 + 15, oz + R); z++) {
            for (let x = Math.max(x0, ox - R); x <= Math.min(x0 + 15, ox + R); x++) {
              const j = hash3(x, y, z, seed ^ 0x9e0);
              const d = Math.hypot(x - ox, (y - oy) * 1.1, z - oz) + (j % 5) * 0.08;
              if (d > R) continue;
              const i = blockIndex(x - x0, y, z - z0);
              if (d > R - 1) blocks[i] = SMOOTH_BASALT;
              else if (d > R - 2) blocks[i] = CALCITE;
              else if (d > R - 3) blocks[i] = (j >>> 8) % 5 === 0 ? BUDDING_AMETHYST : AMETHYST_BLOCK;
              else blocks[i] = AIR;
            }
          }
        }
        // Racimos de amatista en el suelo de la geoda (hacia arriba).
        for (let y = oy - R + 1; y <= oy + R; y++) {
          if (y <= MIN_Y + 5) continue;
          for (let z = Math.max(z0, oz - R); z <= Math.min(z0 + 15, oz + R); z++) {
            for (let x = Math.max(x0, ox - R); x <= Math.min(x0 + 15, ox + R); x++) {
              const i = blockIndex(x - x0, y, z - z0);
              const below = blocks[i - 256];
              if (blocks[i] !== AIR || (below !== BUDDING_AMETHYST && below !== AMETHYST_BLOCK)) continue;
              const k = hash3(x, y, z, seed ^ 0xa3e);
              // Sobre la amatista con brotes siempre; sobre la normal, a veces (racimos que ya no crecen).
              if (below === AMETHYST_BLOCK && (k >>> 4) % 100 >= 35) continue;
              blocks[i] = AMETHYST_BUD + (k % 4);
            }
          }
        }
      }
    }
  }

  /** Busca un punto de aparición en tierra firme cerca del origen. */
  findSpawn(): { x: number; y: number; z: number } {
    const info: ColumnInfo = { height: 0, amp: 0, temp: 0, humid: 0, mount: 0, cont: 0, biome: 0 };
    for (let r = 0; r < 4000; r += 16) {
      const steps = Math.max(1, Math.floor((r * 2 * Math.PI) / 16));
      for (let s = 0; s < steps; s++) {
        const a = (s / steps) * Math.PI * 2;
        const x = Math.round(Math.cos(a) * r);
        const z = Math.round(Math.sin(a) * r);
        this.columnInfo(x, z, info);
        if (info.biome === BIOME_OCEAN || info.biome === BIOME_FROZEN_OCEAN || info.mount > 0.35) continue;
        const y = this.surfaceAt(x, z, info);
        if (y >= SEA_LEVEL && y < 110) return { x: x + 0.5, y: y + 1, z: z + 0.5 };
      }
    }
    return { x: 0.5, y: 120, z: 0.5 };
  }
}
