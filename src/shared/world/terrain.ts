// Generador de terreno procedural determinista. Se ejecuta en los Web Workers.
// Todos los clientes generan exactamente el mismo mundo a partir de la semilla; el servidor
// sólo guarda las modificaciones de los jugadores.
import {
  AIR, STONE, GRASS, DIRT, SAND, GRAVEL, OAK_LOG, OAK_LEAVES, WATER, COAL_ORE, IRON_ORE, GOLD_ORE,
  DIAMOND_ORE, LAPIS_ORE, REDSTONE_ORE, SANDSTONE, SNOWY_GRASS, SNOW_BLOCK, ICE, CLAY, CACTUS,
  BIRCH_LOG, BIRCH_LEAVES, SPRUCE_LOG, SPRUCE_LEAVES, SHORT_GRASS, FERN, POPPY, DANDELION, CORNFLOWER,
  DEAD_BUSH, SUGAR_CANE, RED_MUSHROOM, BROWN_MUSHROOM, LAVA, BEDROCK, GRANITE, DIORITE, ANDESITE,
  BLOCK_REPLACEABLE, BLOCK_RENDER, R_CROSS, PUMPKIN, MELON,
} from '../blocks';
import { CHUNK_SIZE, CHUNK_VOLUME, SEA_LEVEL, WORLD_HEIGHT, blockIndex, hash2, hash3, hashToFloat } from '../constants';
import { Simplex, mulberry32, smoothstep, clamp01, spline, lerp } from './noise';

export const BIOME_OCEAN = 0;
export const BIOME_FROZEN_OCEAN = 1;
export const BIOME_BEACH = 2;
export const BIOME_PLAINS = 3;
export const BIOME_FOREST = 4;
export const BIOME_BIRCH_FOREST = 5;
export const BIOME_TAIGA = 6;
export const BIOME_SNOWY = 7;
export const BIOME_DESERT = 8;
export const BIOME_SAVANNA = 9;
export const BIOME_MOUNTAINS = 10;
export const BIOME_SNOWY_PEAKS = 11;

export const BIOME_NAMES = [
  'Océano', 'Océano helado', 'Playa', 'Llanura', 'Bosque', 'Bosque de abedules', 'Taiga',
  'Taiga nevada', 'Desierto', 'Sabana', 'Montañas', 'Picos nevados',
];

/** Densidad de árboles (probabilidad por celda de 4x4) por bioma. */
const TREE_DENSITY = [0, 0, 0, 0.035, 0.55, 0.5, 0.42, 0.3, 0.05, 0.1, 0.06, 0];

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
  heights: Uint8Array;
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

    const altCool = height > 100 ? (height - 100) / 140 : 0;
    const temp = this.nTemp.fbm2(x / 1700, z / 1700, 3) * 1.45 - altCool;
    const humid = this.nHumid.fbm2(x / 1300 + 500, z / 1300 - 500, 3) * 1.5;

    out.height = height;
    out.amp = 2.5 + 26 * mount * mount + 4 * mount;
    out.temp = temp;
    out.humid = humid;
    out.mount = mount;
    out.cont = c;
    out.biome = this.pickBiome(height, temp, humid, mount, c);
    return out;
  }

  private pickBiome(h: number, t: number, hu: number, m: number, c: number): number {
    if (h < SEA_LEVEL - 1.5) return t < -0.58 ? BIOME_FROZEN_OCEAN : BIOME_OCEAN;
    if (m > 0.45 && h > 105) return h > 150 || t < -0.35 ? BIOME_SNOWY_PEAKS : BIOME_MOUNTAINS;
    if (h < SEA_LEVEL + 2.5 && c < 0.12 && m < 0.25) {
      if (t < -0.58) return BIOME_SNOWY;
      return t > 0.35 && hu < 0 ? BIOME_DESERT : BIOME_BEACH;
    }
    if (t < -0.58) return BIOME_SNOWY;
    if (t < -0.26) return BIOME_TAIGA;
    if (t > 0.38) return hu < 0.05 ? BIOME_DESERT : BIOME_SAVANNA;
    if (hu > 0.1) return t < 0.05 && hu > 0.32 ? BIOME_BIRCH_FOREST : BIOME_FOREST;
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
    const top = Math.min(WORLD_HEIGHT - 8, Math.ceil(info.height + info.amp));
    const bottom = Math.max(1, Math.floor(info.height - info.amp));
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
      case BIOME_FROZEN_OCEAN: {
        const deepWater = SEA_LEVEL - top;
        topBlock = deepWater > 9 ? GRAVEL : SAND;
        if (sn > 0.55) topBlock = CLAY;
        else if (sn < -0.6) topBlock = GRAVEL;
        filler = topBlock;
        break;
      }
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
    if (underwater && (topBlock === GRASS || topBlock === SNOWY_GRASS)) {
      topBlock = sn > 0.2 ? SAND : sn < -0.3 ? GRAVEL : DIRT;
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
    if (sy < SEA_LEVEL - 1 || sy > WORLD_HEIGHT - 20) return -1;
    if (this.caveAt(x, sy, z) && sy <= this.caveCeiling(x, z, sy)) return -1;
    const t: ColumnInfo = { height: 0, amp: 0, temp: 0, humid: 0, mount: 0, cont: 0, biome: 0 };
    const hx1 = this.columnInfo(x + 1, z, t).height;
    const hx0 = this.columnInfo(x - 1, z, t).height;
    const hz1 = this.columnInfo(x, z + 1, t).height;
    const hz0 = this.columnInfo(x, z - 1, t).height;
    const slope = Math.max(Math.abs(hx1 - hx0), Math.abs(hz1 - hz0));
    const layers = this.surfaceRules(x, z, biome, sy, slope, [0, 0, 0, 0]);
    const g = layers[0];
    const ok = biome === BIOME_DESERT ? g === SAND && sy >= SEA_LEVEL : g === GRASS || g === SNOWY_GRASS || g === DIRT;
    void height;
    void amp;
    return ok ? sy : -1;
  }

  generate(cx: number, cz: number): GenResult {
    const blocks = new Uint16Array(CHUNK_VOLUME);
    const heights = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
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
        const lo = Math.max(1, Math.floor(inf.height - inf.amp));
        const hi = Math.min(WORLD_HEIGHT - 8, Math.ceil(inf.height + inf.amp));
        for (let y = 0; y < lo; y++) blocks[blockIndex(lx, y, lz)] = STONE;
        let top = lo - 1;
        for (let y = lo; y <= hi; y++) {
          if (this.solidAt(wx, y, wz, inf.height, inf.amp)) {
            blocks[blockIndex(lx, y, lz)] = STONE;
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
        for (let y = top; y > 0 && d < depth + 3; y--) {
          const i = blockIndex(lx, y, lz);
          if (blocks[i] !== STONE) break; // hueco (voladizo)
          if (d === 0) blocks[i] = topBlock;
          else if (d < depth) blocks[i] = filler;
          else if (deep >= 0) blocks[i] = deep;
          else break;
          d++;
        }
      }
    }

    // --- 4. Cuevas (rejilla gruesa + interpolación trilineal) ---
    const gyCount = Math.ceil((maxTop + 2) / CAVE_GRID) + 1;
    const grid = new Float64Array(5 * 5 * gyCount);
    for (let gy = 0; gy < gyCount; gy++) {
      for (let gz = 0; gz < 5; gz++) {
        for (let gx = 0; gx < 5; gx++) {
          grid[(gy * 5 + gz) * 5 + gx] = this.caveGridValue(x0 + gx * CAVE_GRID, gy * CAVE_GRID, z0 + gz * CAVE_GRID);
        }
      }
    }
    for (let lz = 0; lz < 16; lz++) {
      for (let lx = 0; lx < 16; lx++) {
        const top = tops[lz * 16 + lx];
        const ceiling = this.caveCeiling(x0 + lx, z0 + lz, top);
        const gx = lx >> 2, gz = lz >> 2;
        const fx = (lx & 3) / 4, fz = (lz & 3) / 4;
        for (let y = 5; y <= ceiling && y <= maxTop; y++) {
          const i = blockIndex(lx, y, lz);
          const b = blocks[i];
          if (b === AIR) continue;
          const gy = y >> 2;
          const fy = (y & 3) / 4;
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
          if (v > 0) blocks[i] = y <= 10 ? LAVA : AIR;
        }
      }
    }

    // --- 5. Agua y hielo (sólo donde el terreno base queda bajo el nivel del mar) ---
    for (let lz = 0; lz < 16; lz++) {
      for (let lx = 0; lx < 16; lx++) {
        const inf = infos[lz * 16 + lx];
        const baseTop = tops[lz * 16 + lx];
        if (baseTop < SEA_LEVEL - 1) {
          for (let y = SEA_LEVEL - 1; y > 0; y--) {
            const i = blockIndex(lx, y, lz);
            if (blocks[i] !== AIR) break;
            blocks[i] = WATER;
          }
          if (inf.temp < -0.58) blocks[blockIndex(lx, SEA_LEVEL - 1, lz)] = ICE;
        }
        let top = 0;
        for (let y = Math.max(maxTop, SEA_LEVEL); y > 0; y--) {
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
          if (x >= 0 && x < 16 && z >= 0 && z < 16 && y > 0 && y < WORLD_HEIGHT) {
            const i = blockIndex(x, y, z);
            if (blocks[i] === replace) blocks[i] = id;
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
    vein(GRAVEL, 2, 5, 70, 20, STONE);
    vein(DIRT, 2, 5, 80, 20, STONE);
    vein(COAL_ORE, 22, 5, 130, 9, STONE);
    vein(IRON_ORE, 16, 5, 72, 7, STONE);
    vein(GOLD_ORE, 4, 5, 34, 6, STONE);
    vein(REDSTONE_ORE, 6, 5, 18, 7, STONE);
    vein(LAPIS_ORE, 2, 8, 32, 6, STONE);
    vein(DIAMOND_ORE, 2, 5, 17, 5, STONE);

    // --- 7. Plantas y flores ---
    const col = [0, 0, 0];
    for (let lz = 0; lz < 16; lz++) {
      for (let lx = 0; lx < 16; lx++) {
        const top = tops[lz * 16 + lx];
        if (top >= WORLD_HEIGHT - 2) continue;
        const ground = blocks[blockIndex(lx, top, lz)];
        const above = blockIndex(lx, top + 1, lz);
        if (blocks[above] !== AIR) continue;
        const wx = x0 + lx, wz = z0 + lz;
        const r = hashToFloat(hash2(wx, wz, seed ^ 0x9a5));
        const biome = infos[lz * 16 + lx].biome;
        if (ground === GRASS) {
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
        ? b0 === BIOME_SAVANNA || b0 === BIOME_PLAINS
        : b0 === BIOME_PLAINS || b0 === BIOME_FOREST || b0 === BIOME_TAIGA || b0 === BIOME_BIRCH_FOREST;
      for (let k = 0; okBiome && k < 10; k++) {
        const lx = clx + Math.floor(pr() * 7) - 3, lz = clz + Math.floor(pr() * 7) - 3;
        if (lx < 0 || lx > 15 || lz < 0 || lz > 15) continue;
        const top = tops[lz * 16 + lx];
        if (top >= WORLD_HEIGHT - 2 || blocks[blockIndex(lx, top, lz)] !== GRASS) continue;
        const above = blockIndex(lx, top + 1, lz);
        const cur = blocks[above];
        if (cur !== AIR && cur !== SHORT_GRASS && cur !== FERN) continue;
        blocks[above] = melon ? MELON : PUMPKIN;
      }
    }

    // --- 8. Árboles y cactus (rejilla de celdas 4x4; pueden cruzar bordes de chunk) ---
    const set = (x: number, y: number, z: number, id: number, force: boolean) => {
      const lx = x - x0, lz = z - z0;
      if (lx < 0 || lx >= 16 || lz < 0 || lz >= 16 || y <= 0 || y >= WORLD_HEIGHT) return;
      const i = blockIndex(lx, y, lz);
      const cur = blocks[i];
      if (cur === AIR || (force && (BLOCK_REPLACEABLE[cur] || BLOCK_RENDER[cur] === R_CROSS || cur === OAK_LEAVES || cur === BIRCH_LEAVES || cur === SPRUCE_LEAVES))) {
        blocks[i] = id;
      }
    };
    const tmpInfo: ColumnInfo = { height: 0, amp: 0, temp: 0, humid: 0, mount: 0, cont: 0, biome: 0 };
    // Las copas llegan hasta 5 bloques del tronco (roble grande, acacia inclinada).
    const cMin = Math.floor((x0 - 8) / 4), cMax = Math.floor((x0 + 23) / 4);
    const kMin = Math.floor((z0 - 8) / 4), kMax = Math.floor((z0 + 23) / 4);
    for (let ck = kMin; ck <= kMax; ck++) {
      for (let cc = cMin; cc <= cMax; cc++) {
        const h = hash2(cc, ck, seed ^ 0x7a3e);
        const tx = cc * 4 + (h & 3);
        const tz = ck * 4 + ((h >>> 2) & 3);
        const r = ((h >>> 8) & 0xffff) / 65536;
        if (tx < x0 - 5 || tx > x0 + 20 || tz < z0 - 5 || tz > z0 + 20) continue;
        const inf = this.columnInfo(tx, tz, tmpInfo);
        const density = TREE_DENSITY[inf.biome];
        if (r >= density) continue;
        const biome = inf.biome;
        // Decisión determinista e independiente del chunk que la evalúa (los árboles cruzan bordes).
        const sy = this.treeGround(tx, tz, inf);
        if (sy < 0) continue;
        const inside = tx >= x0 && tx < x0 + 16 && tz >= z0 && tz < z0 + 16;
        const tr = hashToFloat(hash2(tx, tz, seed ^ 0x3a7));
        if (biome === BIOME_DESERT) {
          const hgt = 1 + Math.floor(tr * 3);
          for (let k = 1; k <= hgt; k++) set(tx, sy + k, tz, CACTUS, true);
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
        } else {
          if (tr > 0.8) this.bigOak(tx, sy + 1, tz, tr, set);
          else this.oak(tx, sy + 1, tz, tr, OAK_LOG, OAK_LEAVES, set);
        }
        // El tronco convierte la hierba de debajo en tierra.
        if (inside) {
          const gi = blockIndex(tx - x0, sy, tz - z0);
          if (blocks[gi] === GRASS || blocks[gi] === SNOWY_GRASS) blocks[gi] = DIRT;
        }
      }
    }

    // --- 9. Lecho de roca ---
    for (let lz = 0; lz < 16; lz++) {
      for (let lx = 0; lx < 16; lx++) {
        blocks[blockIndex(lx, 0, lz)] = BEDROCK;
        for (let y = 1; y < 4; y++) {
          if (hashToFloat(hash3(x0 + lx, y, z0 + lz, seed ^ 0xbed)) < (4 - y) / 5) blocks[blockIndex(lx, y, lz)] = BEDROCK;
        }
      }
    }

    // --- 10. Alturas finales y tinte del bioma ---
    for (let lz = 0; lz < 16; lz++) {
      for (let lx = 0; lx < 16; lx++) {
        let y = WORLD_HEIGHT - 1;
        while (y > 0 && blocks[blockIndex(lx, y, lz)] === AIR) y--;
        heights[lz * 16 + lx] = y;
      }
    }
    const tint = new Uint8Array(64);
    for (let j = 0; j < 4; j++) {
      for (let i = 0; i < 4; i++) {
        const inf = this.columnInfo(x0 + i * 4 + 2, z0 + j * 4 + 2, tmpInfo);
        TerrainGenerator.grassColor(inf.temp, inf.humid, col);
        const o = (j * 4 + i) * 4;
        tint[o] = Math.round(col[0]);
        tint[o + 1] = Math.round(col[1]);
        tint[o + 2] = Math.round(col[2]);
        tint[o + 3] = Math.round(clamp01(inf.temp * 0.6 + 0.5) * 255);
      }
    }
    return { blocks, tint, heights };
  }

  // ---------------------------------------------------------------- árboles
  /**
   * Hace crecer un árbol desde un brote (kind: 0 roble, 1 abedul, 2 abeto). `set` recibe los bloques
   * con `force` = true para el tronco (puede sustituir plantas y hojas) y false para las hojas.
   */
  growTree(kind: number, x: number, y: number, z: number, r: number, set: (x: number, y: number, z: number, id: number, force: boolean) => void): void {
    if (kind === 1) this.oak(x, y, z, r, BIRCH_LOG, BIRCH_LEAVES, set);
    else if (kind === 2) this.spruce(x, y, z, r, set);
    else if (r > 0.9) this.bigOak(x, y, z, r, set);
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

  private savannaTree(
    x: number, y: number, z: number, r: number,
    set: (x: number, y: number, z: number, id: number, force: boolean) => void,
  ): void {
    // Árbol inclinado de copa plana (estilo acacia) con madera de roble.
    const h = 4 + Math.floor(r * 1000) % 2;
    const dirIdx = Math.floor(r * 4000) % 4;
    const ddx = [1, -1, 0, 0][dirIdx], ddz = [0, 0, 1, -1][dirIdx];
    let cx = x, cz = z;
    for (let k = 0; k < h; k++) {
      if (k >= 2) { cx += ddx; cz += ddz; }
      set(cx, y + k, cz, OAK_LOG, true);
    }
    const top = y + h;
    for (let dz = -2; dz <= 2; dz++) {
      for (let dx = -2; dx <= 2; dx++) {
        if (Math.abs(dx) === 2 && Math.abs(dz) === 2) continue;
        set(cx + dx, top, cz + dz, OAK_LEAVES, false);
      }
    }
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) set(cx + dx, top + 1, cz + dz, OAK_LEAVES, false);
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
