// Fase 8 (dimensiones): generador del Nether. Como en Minecraft, ocupa de y = 0 a y = 127: suelo y techo de
// lecho de roca, cavernas enormes de rocanegra (densidad 3D con el suelo y el techo que suben y bajan), un
// mar de lava hasta y = 31, playas de arena de alma y de grava junto a la lava, magma, piedra luminosa que
// cuelga del techo, menas de cuarzo y de oro y fuegos que arden solos sobre la rocanegra.
// Por debajo de y = 0 todo es lecho de roca (no se ve y así no hay caras que dibujar) y por encima del
// techo, aire. Hereda de TerrainGenerator para que el resto del juego lo use igual (bioma, aparición…).
import { CHUNK_SIZE, CHUNK_VOLUME, MIN_Y, MAX_Y, blockIndex, hash2, hash3, hashToFloat } from '../constants';
import {
  AIR, BEDROCK, NETHERRACK, LAVA, GLOWSTONE, SOUL_SAND, GRAVEL, FIRE, NETHER_QUARTZ_ORE, NETHER_GOLD_ORE, MAGMA_BLOCK,
} from '../blocks';
import { Simplex } from './noise';
import { TerrainGenerator, type ColumnInfo, type GenResult } from './terrain';
import { BIOME_NETHER_WASTES } from './biomeIds';

/** Nivel del mar de lava (la lava llena el aire con y ≤ LAVA_LEVEL). */
export const NETHER_LAVA_LEVEL = 31;
/** Techo de lecho de roca (la última fila; por encima, aire). */
export const NETHER_ROOF = 127;

export class NetherGenerator extends TerrainGenerator {
  private nA: Simplex;
  private nB: Simplex;
  private nFloor: Simplex;
  private nCeil: Simplex;
  private nPatch: Simplex;
  private nGravel: Simplex;

  constructor(seed: number) {
    super(seed);
    this.nA = new Simplex((seed ^ 0x4e7e1) | 0);
    this.nB = new Simplex((seed ^ 0x4e7e2) | 0);
    this.nFloor = new Simplex((seed ^ 0x4e7e3) | 0);
    this.nCeil = new Simplex((seed ^ 0x4e7e4) | 0);
    this.nPatch = new Simplex((seed ^ 0x4e7e5) | 0);
    this.nGravel = new Simplex((seed ^ 0x4e7e6) | 0);
  }

  override columnInfo(x: number, z: number, out: ColumnInfo = { height: 0, amp: 0, temp: 0, humid: 0, mount: 0, cont: 0, biome: 0 }): ColumnInfo {
    void x;
    void z;
    out.height = NETHER_LAVA_LEVEL + 1;
    out.amp = 0;
    out.temp = 2; // no hay nieve ni hielo
    out.humid = 0;
    out.mount = 0;
    out.cont = 0;
    out.biome = BIOME_NETHER_WASTES;
    return out;
  }

  override biomeAt(x: number, z: number): number {
    void x;
    void z;
    return BIOME_NETHER_WASTES;
  }

  override caveBiomeAt(x: number, z: number): number {
    void x;
    void z;
    return 0;
  }

  override surfaceAt(x: number, z: number): number {
    return this.floorAt(x, z);
  }

  /** ¿Hay rocanegra en (x, y, z)? (sin el lecho de roca). */
  private solid(x: number, y: number, z: number, floor: number, ceil: number): boolean {
    let d = this.nA.noise3(x / 64, y / 32, z / 64) * 0.7 + this.nB.noise3(x / 22, y / 14, z / 22) * 0.3 - 0.12;
    if (y < floor) d += (floor - y) * 0.09;
    if (y > ceil) d += (y - ceil) * 0.09;
    return d > 0;
  }

  private floorLevel(x: number, z: number): number {
    return 30 + this.nFloor.noise2(x / 96, z / 96) * 14;
  }

  private ceilLevel(x: number, z: number): number {
    return 104 + this.nCeil.noise2(x / 80, z / 80) * 12;
  }

  private bedrock(x: number, y: number, z: number): boolean {
    if (y <= 0 || y >= NETHER_ROOF) return true;
    const r = hashToFloat(hash3(x, y, z, this.seed ^ 0xbed0));
    if (y <= 4) return r < (5 - y) / 5;
    if (y >= NETHER_ROOF - 4) return r < (y - (NETHER_ROOF - 5)) / 5;
    return false;
  }

  /** Primer suelo firme con dos de aire encima por encima de la lava, o -1. */
  private floorAt(x: number, z: number): number {
    const floor = this.floorLevel(x, z), ceil = this.ceilLevel(x, z);
    let prev = this.solid(x, NETHER_LAVA_LEVEL + 1, z, floor, ceil);
    let a1 = this.solid(x, NETHER_LAVA_LEVEL + 2, z, floor, ceil);
    for (let y = NETHER_LAVA_LEVEL + 1; y < NETHER_ROOF - 6; y++) {
      const a2 = this.solid(x, y + 2, z, floor, ceil);
      if (prev && !a1 && !a2) return y;
      prev = a1;
      a1 = a2;
    }
    return -1;
  }

  override findSpawn(): { x: number; y: number; z: number } {
    for (let r = 0; r < 2000; r += 8) {
      const steps = Math.max(1, Math.floor((r * 2 * Math.PI) / 8));
      for (let s = 0; s < steps; s++) {
        const a = (s / steps) * Math.PI * 2;
        const x = Math.round(Math.cos(a) * r), z = Math.round(Math.sin(a) * r);
        const y = this.floorAt(x, z);
        if (y > NETHER_LAVA_LEVEL && y < 100) return { x: x + 0.5, y: y + 1, z: z + 0.5 };
      }
    }
    return { x: 0.5, y: 64, z: 0.5 };
  }

  override generate(cx: number, cz: number): GenResult {
    const blocks = new Uint16Array(CHUNK_VOLUME);
    const heights = new Int16Array(CHUNK_SIZE * CHUNK_SIZE);
    const x0 = cx * CHUNK_SIZE, z0 = cz * CHUNK_SIZE;
    const seed = this.seed;
    const at = (lx: number, y: number, lz: number) => blocks[blockIndex(lx, y, lz)];
    const put = (lx: number, y: number, lz: number, id: number) => {
      blocks[blockIndex(lx, y, lz)] = id;
    };

    // --- 1. Lecho de roca, rocanegra y lava ---
    for (let lz = 0; lz < 16; lz++) {
      for (let lx = 0; lx < 16; lx++) {
        const wx = x0 + lx, wz = z0 + lz;
        const floor = this.floorLevel(wx, wz), ceil = this.ceilLevel(wx, wz);
        for (let y = MIN_Y; y < 0; y++) put(lx, y, lz, BEDROCK);
        for (let y = 0; y <= NETHER_ROOF; y++) {
          if (this.bedrock(wx, y, wz)) put(lx, y, lz, BEDROCK);
          else if (this.solid(wx, y, wz, floor, ceil)) put(lx, y, lz, NETHERRACK);
          else if (y <= NETHER_LAVA_LEVEL) put(lx, y, lz, LAVA);
        }
      }
    }

    // --- 2. Suelos: arena de alma y grava junto a la lava, magma, fuegos ---
    for (let lz = 0; lz < 16; lz++) {
      for (let lx = 0; lx < 16; lx++) {
        const wx = x0 + lx, wz = z0 + lz;
        const soul = this.nPatch.noise2(wx / 22, wz / 22) > 0.42;
        const gravel = this.nGravel.noise2(wx / 18, wz / 18) > 0.5;
        for (let y = 5; y < NETHER_ROOF - 5; y++) {
          if (at(lx, y, lz) !== NETHERRACK || at(lx, y + 1, lz) === NETHERRACK || at(lx, y + 1, lz) === BEDROCK) continue;
          const up = at(lx, y + 1, lz);
          const shore = y >= NETHER_LAVA_LEVEL - 4 && y <= NETHER_LAVA_LEVEL + 6;
          const r = hashToFloat(hash3(wx, y, wz, seed ^ 0x5041));
          if (shore && soul) {
            for (let k = 0; k < 3 && at(lx, y - k, lz) === NETHERRACK; k++) put(lx, y - k, lz, SOUL_SAND);
          } else if (shore && gravel && up === AIR) {
            for (let k = 0; k < 2 && at(lx, y - k, lz) === NETHERRACK; k++) put(lx, y - k, lz, GRAVEL);
          } else if (y >= NETHER_LAVA_LEVEL - 4 && y <= NETHER_LAVA_LEVEL + 3 && r < 0.05) {
            put(lx, y, lz, MAGMA_BLOCK);
          } else if (up === AIR && r > 0.996) {
            put(lx, y + 1, lz, FIRE);
          }
        }
      }
    }

    // --- 3. Menas: cuarzo (16 vetas) y oro (10), sólo en la rocanegra ---
    const vein = (ore: number, count: number, size: number, salt: number) => {
      for (let v = 0; v < count; v++) {
        const h = hash2(cx * 131 + v, cz * 71 - v, seed ^ salt);
        let x = h & 15, z = (h >>> 4) & 15, y = 10 + ((h >>> 8) % 108);
        const n = 2 + ((h >>> 16) % size);
        for (let k = 0; k < n; k++) {
          if (x >= 0 && x < 16 && z >= 0 && z < 16 && at(x, y, z) === NETHERRACK) put(x, y, z, ore);
          const m = hash3(x + x0, y, z + z0, seed ^ salt ^ k);
          x += (m % 3) - 1;
          y += ((m >>> 2) % 3) - 1;
          z += ((m >>> 4) % 3) - 1;
        }
      }
    };
    vein(NETHER_QUARTZ_ORE, 16, 12, 0x9a27);
    vein(NETHER_GOLD_ORE, 10, 8, 0x901d);

    // --- 4. Piedra luminosa colgando del techo (racimos que crecen hacia abajo dentro del chunk) ---
    for (let c = 0; c < 10; c++) {
      const h = hash2(cx * 17 + c, cz * 29 + c * 7, seed ^ 0x6105);
      const sx = 3 + (h % 10), sz = 3 + ((h >>> 4) % 10);
      let sy = 60 + ((h >>> 8) % 60);
      // Sube hasta tocar techo firme.
      while (sy < NETHER_ROOF - 1 && at(sx, sy, sz) === AIR && at(sx, sy + 1, sz) === AIR) sy++;
      if (at(sx, sy, sz) !== AIR || at(sx, sy + 1, sz) !== NETHERRACK) continue;
      put(sx, sy, sz, GLOWSTONE);
      for (let k = 0; k < 90; k++) {
        const m = hash3(sx + k, sy - k, sz, seed ^ 0x6106 ^ c);
        const x = sx + (m % 7) - 3, z = sz + ((m >>> 3) % 7) - 3, y = sy - ((m >>> 6) % 8);
        if (x < 0 || x > 15 || z < 0 || z > 15 || y < 1 || at(x, y, z) !== AIR) continue;
        let touch = 0;
        if (at(x, y + 1, z) === GLOWSTONE) touch++;
        if (x > 0 && at(x - 1, y, z) === GLOWSTONE) touch++;
        if (x < 15 && at(x + 1, y, z) === GLOWSTONE) touch++;
        if (z > 0 && at(x, y, z - 1) === GLOWSTONE) touch++;
        if (z < 15 && at(x, y, z + 1) === GLOWSTONE) touch++;
        if (touch === 1) put(x, y, z, GLOWSTONE);
      }
    }

    // --- 5. Alturas (el bloque más alto que no es aire) ---
    for (let lz = 0; lz < 16; lz++) {
      for (let lx = 0; lx < 16; lx++) {
        let y = MAX_Y - 1;
        while (y > MIN_Y && at(lx, y, lz) === AIR) y--;
        heights[lz * 16 + lx] = y;
      }
    }
    // Sin hierba: el tinte es un pardo cualquiera (temperatura alta en A).
    const tint = new Uint8Array(64);
    for (let i = 0; i < 16; i++) tint.set([110, 90, 60, 255], i * 4);
    return { blocks, tint, heights, chests: [], villagers: [], mobs: [] };
  }
}
