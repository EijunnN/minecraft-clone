// Programa lunar: el generador de la Luna. Un mundo sin aire ni agua: llanuras de regolito, mares oscuros y cráteres de todos
// los tamaños, con la roca lunar debajo. Sin árboles, sin cuevas, sin estructuras (las ruinas de la Estación Selene llegan
// con su paso). Es una función de altura pura de (x, z) y la semilla: el servidor y cada hilo del cliente generan lo mismo.
//
// - Tierras altas (regolito claro): colinas suaves y muchos cráteres.
// - Mares (regolito oscuro): llanuras bajas y casi planas, con pocos cráteres.
// - Cráteres en tres escalas (grandes, medianos y pequeños) sobre una rejilla con un cráter, como mucho, por celda:
//   cuenco hundido con un borde elevado alrededor. En las latitudes altas, los grandes guardan hielo sucio en el fondo
//   (nunca ven el Sol).
import { CHUNK_SIZE, CHUNK_VOLUME, MIN_Y, MAX_Y, blockIndex, hash2 } from '../constants';
import {
  BEDROCK, MOON_REGOLITH, MOON_REGOLITH_DARK, MOON_ROCK, DIRTY_ICE, MOON_IRON_VEIN, MOON_COPPER_VEIN, MOON_COAL_VEIN, MOON_STONE_VEIN, MOON_OIL_WELL,
} from '../blocks';
import { TerrainGenerator, type ColumnInfo, type GenResult } from './terrain';
import { Simplex } from './noise';
import { BIOME_MOON_HIGHLANDS, BIOME_MOON_MARE } from './biomeIds';

/** Altura media del suelo de las tierras altas y de los mares. */
export const MOON_BASE = 72;
const MARE_DROP = 9;
/** Grosor de la capa de regolito sobre la roca. */
const REGOLITH_DEPTH = 5;
/** Lado de la celda de las vetas y capas de bloque que ocupa cada una (las dos de arriba). */
const VEIN_CELL = 64;
const VEIN_DEPTH = 2;
/** A partir de esta latitud (|z|) los cráteres grandes guardan hielo sucio. */
export const MOON_ICE_LATITUDE = 1200;

interface Crater {
  x: number;
  z: number;
  r: number;
  depth: number;
}

/** Escalas de cráteres: lado de la celda, radio mínimo y máximo, probabilidad de que la celda tenga uno. */
const SCALES = [
  { cell: 288, rMin: 34, rMax: 70, chance: 0.55 },
  { cell: 112, rMin: 11, rMax: 26, chance: 0.6 },
  { cell: 40, rMin: 3, rMax: 8, chance: 0.6 },
] as const;

export class MoonGenerator extends TerrainGenerator {
  private readonly hills: Simplex;
  private readonly detail: Simplex;
  private readonly mare: Simplex;

  constructor(seed: number) {
    super(seed);
    this.hills = new Simplex(seed ^ 0x1a2b3c);
    this.detail = new Simplex(seed ^ 0x4d5e6f);
    this.mare = new Simplex(seed ^ 0x7a8b9c);
  }

  /** El cráter (si lo hay) de la celda (i, j) de la escala `s`: sale de un hash, así que no hace falta guardarlo. */
  private craterOf(s: number, i: number, j: number): Crater | null {
    const sc = SCALES[s];
    const h = (n: number) => (hash2(i * 31 + n, j * 17 + s, this.seed ^ 0xc4a7e5) >>> 0) / 0x100000000;
    if (h(0) >= sc.chance) return null;
    const r = sc.rMin + (sc.rMax - sc.rMin) * h(1) * h(1); // más pequeños que grandes
    const margin = r * 1.3;
    const x = i * sc.cell + margin + (sc.cell - 2 * margin) * h(2);
    const z = j * sc.cell + margin + (sc.cell - 2 * margin) * h(3);
    return { x, z, r, depth: Math.min(r * 0.32, 9 + r * 0.12) };
  }

  /**
   * Cuánto suben o bajan los cráteres el suelo en (x, z), si el punto cae dentro de uno grande (para el hielo) y si está en el borde
   * de uno grande o mediano (donde caen las rocas que saltaron con el impacto).
   */
  private craterShape(x: number, z: number): { dy: number; big: boolean; rim: boolean } {
    let dy = 0, big = false, rim = false;
    for (let s = 0; s < SCALES.length; s++) {
      const cell = SCALES[s].cell;
      const ci = Math.floor(x / cell), cj = Math.floor(z / cell);
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          const c = this.craterOf(s, ci + di, cj + dj);
          if (!c) continue;
          const d = Math.hypot(x - c.x, z - c.z);
          if (d > c.r * 1.45) continue;
          const t = d / c.r;
          if (s < 2 && t > 0.9 && t < 1.5) rim = true;
          if (t < 1) {
            // Cuenco: fondo casi plano y paredes que suben hasta el borde, sin escalón: la pared interior acaba a la altura del
            // borde elevado de fuera (con una pendiente de ~30°, la del talud del polvo; antes era un muro de columnas).
            dy -= c.depth * (1 - t * t) ** 1.6 * (1 - 0.18 * t);
            dy += c.depth * 0.42 * t ** 4;
            if (s === 0 && t < 0.72) big = true;
          } else {
            // Borde elevado que baja hacia fuera.
            const u = (t - 1) / 0.45;
            dy += c.depth * 0.42 * (1 - u) * (1 - u) * (1 + 0.5 * u);
          }
        }
      }
    }
    return { dy, big, rim };
  }

  /** ¿Es mar (regolito oscuro)? Manchas grandes: ruido de escala muy larga. */
  private isMare(x: number, z: number): boolean {
    return this.mare.noise2(x / 420, z / 420) + 0.25 * this.mare.noise2(x / 130, z / 130) > 0.12;
  }

  private spawnAt: { x: number; z: number } | null = null;

  private spawnPoint(): { x: number; z: number } {
    if (!this.spawnAt) {
      const s = this.findSpawn();
      this.spawnAt = { x: Math.floor(s.x), z: Math.floor(s.z) };
    }
    return this.spawnAt;
  }

  /**
   * ¿Es (x, z) de una mancha de un recurso? Manchas de `rMin` a `rMin + rSpan` bloques de radio con bordes irregulares, una celda de `cell`
   * de cada `1 / chance`, donde `allow` diga (los mares, las tierras altas…), más una mancha fija de 5,5 de radio a `starter` del punto de
   * aterrizaje para que la primera se encuentre.
   */
  private patchAt(
    x: number, z: number, salt: number, cell: number, chance: number, rMin: number, rSpan: number, allow: (px: number, pz: number) => boolean,
    starter: readonly [number, number],
  ): boolean {
    const fuzz = this.detail.noise2(x / 3.1 + salt, z / 3.1 - salt) * 1.4;
    const sp = this.spawnPoint();
    if (Math.hypot(x - (sp.x + starter[0]), z - (sp.z + starter[1])) + fuzz < 5.5) return true;
    const ci = Math.floor(x / cell), cj = Math.floor(z / cell);
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        const h = (n: number) => (hash2((ci + di) * 29 + n, (cj + dj) * 13 + 5, this.seed ^ salt) >>> 0) / 0x100000000;
        if (h(0) >= chance) continue;
        const r = rMin + rSpan * h(1);
        const px = (ci + di) * cell + r + (cell - 2 * r) * h(2);
        const pz = (cj + dj) * cell + r + (cell - 2 * r) * h(3);
        if (Math.hypot(x - px, z - pz) + fuzz < r && allow(px, pz)) return true;
      }
    }
    return false;
  }

  /** ¿Es (x, z) una veta de hierro? Sólo en los mares (el basalto con ilmenita). */
  veinAt(x: number, z: number): boolean {
    return this.patchAt(x, z, 0x1e70b0, VEIN_CELL, 0.4, 3, 5, (px, pz) => this.isMare(px, pz), [22, 9]);
  }

  /** Cobre: en cualquier sitio, algo más raro que el hierro. */
  copperAt(x: number, z: number): boolean {
    return this.patchAt(x, z, 0x0c0b12, VEIN_CELL, 0.35, 3, 5, () => true, [-20, 14]);
  }

  /** Carbón: en las tierras altas. */
  coalAt(x: number, z: number): boolean {
    return this.patchAt(x, z, 0x0c0a15, 80, 0.3, 3, 5, (px, pz) => !this.isMare(px, pz), [8, -24]);
  }

  /** Piedra: manchas algo mayores, en cualquier sitio. */
  stoneAt(x: number, z: number): boolean {
    return this.patchAt(x, z, 0x057013, VEIN_CELL, 0.4, 4, 5, () => true, [-14, -22]);
  }

  /**
   * ¿Hay un pozo de petróleo en la columna (x, z)? Campos de 3 a 6 pozos sueltos en un radio de 7, en los mares, una celda de 160 de cada
   * tres; y un campo fijo cerca del aterrizaje (a unos 50 bloques).
   */
  oilAt(x: number, z: number): boolean {
    const sp = this.spawnPoint();
    const wellsOf = (cx: number, cz: number, seed: number): boolean => {
      const n = 3 + ((hash2(cx, cz, seed) >>> 0) % 4);
      for (let i = 0; i < n; i++) {
        const wx = cx + Math.round(((hash2(cx + i * 7, cz, seed ^ 0x51) >>> 0) / 0x100000000 - 0.5) * 14);
        const wz = cz + Math.round(((hash2(cx, cz + i * 11, seed ^ 0xa3) >>> 0) / 0x100000000 - 0.5) * 14);
        if (wx === x && wz === z) return true;
      }
      return false;
    };
    if (Math.abs(x - (sp.x + 36)) <= 8 && Math.abs(z - (sp.z - 34)) <= 8 && wellsOf(sp.x + 36, sp.z - 34, this.seed ^ 0x0113)) return true;
    const cell = 160;
    const ci = Math.floor(x / cell), cj = Math.floor(z / cell);
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        const h = (n: number) => (hash2((ci + di) * 29 + n, (cj + dj) * 13 + 3, this.seed ^ 0x0113) >>> 0) / 0x100000000;
        if (h(0) >= 0.33) continue;
        const cx = Math.floor((ci + di) * cell + 20 + (cell - 40) * h(1)), cz = Math.floor((cj + dj) * cell + 20 + (cell - 40) * h(2));
        if (Math.abs(x - cx) <= 8 && Math.abs(z - cz) <= 8 && this.isMare(cx, cz) && wellsOf(cx, cz, this.seed ^ 0x0114)) return true;
      }
    }
    return false;
  }

  /** Altura del bloque sólido más alto de la columna. */
  private heightAt(x: number, z: number): number {
    const mare = this.isMare(x, z);
    const hills = this.hills.noise2(x / 140, z / 140) * (mare ? 2.2 : 10) + this.detail.noise2(x / 24, z / 24) * (mare ? 0.8 : 2.2);
    const { dy } = this.craterShape(x, z);
    const y = MOON_BASE + (mare ? -MARE_DROP : 0) + hills + dy * (mare ? 0.7 : 1);
    return Math.max(MIN_Y + 8, Math.min(MAX_Y - 16, Math.round(y)));
  }

  override columnInfo(x: number, z: number, out: ColumnInfo = { height: 0, amp: 0, temp: 0, humid: 0, mount: 0, cont: 0, biome: 0 }): ColumnInfo {
    out.height = this.heightAt(x, z);
    out.amp = 0;
    out.temp = -2; // nada de hierba ni nieve
    out.humid = 0;
    out.mount = 0;
    out.cont = 1;
    out.biome = this.isMare(x, z) ? BIOME_MOON_MARE : BIOME_MOON_HIGHLANDS;
    return out;
  }

  override biomeAt(x: number, z: number): number {
    return this.isMare(x, z) ? BIOME_MOON_MARE : BIOME_MOON_HIGHLANDS;
  }

  override caveBiomeAt(x: number, z: number): number {
    void x;
    void z;
    return 0;
  }

  override surfaceAt(x: number, z: number, _info?: ColumnInfo): number {
    return this.heightAt(Math.floor(x), Math.floor(z));
  }

  override caveAt(): boolean {
    return false;
  }

  override generatedWaterAt(): boolean {
    return false;
  }

  /** Aparece en la llanura más cercana al origen (sin caer dentro de un cráter). */
  override findSpawn(): { x: number; y: number; z: number } {
    let best = { x: 0, z: 0, score: Infinity };
    for (let r = 0; r < 400; r += 16) {
      const steps = Math.max(1, Math.floor((r * 2 * Math.PI) / 16));
      for (let s = 0; s < steps; s++) {
        const a = (s / steps) * Math.PI * 2;
        const x = Math.round(Math.cos(a) * r), z = Math.round(Math.sin(a) * r);
        // Una zona plana: poca diferencia de altura con sus vecinos (una plataforma de aterrizaje).
        const h = this.heightAt(x, z);
        let rough = 0;
        for (const [dx, dz] of [[8, 0], [-8, 0], [0, 8], [0, -8], [6, 6], [-6, -6]]) rough = Math.max(rough, Math.abs(this.heightAt(x + dx, z + dz) - h));
        if (rough < best.score) best = { x, z, score: rough };
        if (rough <= 1) return { x: x + 0.5, y: h + 1, z: z + 0.5 };
      }
    }
    return { x: best.x + 0.5, y: this.heightAt(best.x, best.z) + 1, z: best.z + 0.5 };
  }

  override generate(cx: number, cz: number): GenResult {
    const blocks = new Uint16Array(CHUNK_VOLUME);
    const heights = new Int16Array(CHUNK_SIZE * CHUNK_SIZE);
    const x0 = cx * CHUNK_SIZE, z0 = cz * CHUNK_SIZE;
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const x = x0 + lx, z = z0 + lz;
        const top = this.heightAt(x, z);
        const mare = this.isMare(x, z);
        const { big, rim } = this.craterShape(x, z);
        const ice = big && Math.abs(z) > MOON_ICE_LATITUDE;
        // Un recurso por columna, por orden: hierro, cobre, carbón, piedra.
        const vein = ice ? 0 : this.veinAt(x, z) ? MOON_IRON_VEIN : this.copperAt(x, z) ? MOON_COPPER_VEIN : this.coalAt(x, z) ? MOON_COAL_VEIN : this.stoneAt(x, z) ? MOON_STONE_VEIN : 0;
        const well = !ice && !vein && this.oilAt(x, z);
        // Rocas sueltas en los bordes de los cráteres: bloques de roca que saltaron con el impacto (nunca junto al aterrizaje).
        let boulder = 0;
        if (rim && !ice && !vein && !well) {
          const h = (hash2(x, z, this.seed ^ 0xb0a1de) >>> 0) / 0x100000000;
          const sp = this.spawnPoint();
          if (h < 0.03 && Math.hypot(x - sp.x, z - sp.z) > 48) boulder = h < 0.008 ? 2 : 1;
        }
        heights[lz * CHUNK_SIZE + lx] = top + boulder;
        for (let b = 1; b <= boulder; b++) blocks[blockIndex(lx, top + b, lz)] = MOON_ROCK;
        const soil = mare ? MOON_REGOLITH_DARK : MOON_REGOLITH;
        for (let y = MIN_Y; y <= top; y++) {
          let b = MOON_ROCK;
          if (y === MIN_Y) b = BEDROCK;
          else if (y > top - REGOLITH_DEPTH) b = soil;
          if (ice && y > top - 4) b = DIRTY_ICE;
          else if (vein && y > top - VEIN_DEPTH) b = vein;
          else if (well && y === top) b = MOON_OIL_WELL;
          blocks[blockIndex(lx, y, lz)] = b;
        }
      }
    }
    const tint = new Uint8Array(64);
    for (let i = 0; i < 16; i++) tint.set([150, 150, 150, 0], i * 4);
    return { blocks, tint, heights, chests: [], villagers: [], mobs: [] };
  }
}
