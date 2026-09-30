// Programa lunar: el mapa lejano de la Luna. Alturas y mares del generador en un cuadrado de casi 4 km alrededor del jugador (un
// dato cada 12 bloques), para que el suelo que se pinta más allá de los bloques cargados (shaders/planets.ts) sea el mismo que se
// encontrará al llegar andando: los mismos cráteres, las mismas llanuras oscuras.
//
// Se construye poco a poco (unas filas por frame) y sólo cambia la textura cuando el nuevo está entero; se vuelve a centrar cuando
// el jugador se aleja un kilómetro del centro.
import type { GL } from '../engine/gl';
import type { TerrainGenerator } from '../../shared/world/terrain';
import { BIOME_MOON_MARE } from '../../shared/world/biomeIds';

const N = 320;
const STEP = 12;
const SIDE = N * STEP;

export class MoonFarMap {
  readonly tex: WebGLTexture;
  /** x0, z0 (bloques), 1 / lado (bloques), listo (1) — lo que lee el shader (uMoonMapInfo). */
  readonly info: [number, number, number, number] = [0, 0, 1 / SIDE, 0];
  /** Semilla de los cráteres del generador (seed ^ 0xc4a7e5, como en world/moon.ts). */
  seed = 0;
  private gen: TerrainGenerator | null = null;
  private job: { x0: number; z0: number; row: number; data: Float32Array } | null = null;
  private center: [number, number] | null = null;

  constructor(private gl: GL) {
    this.tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, 1, 1, 0, gl.RGBA, gl.FLOAT, new Float32Array(4));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  /** Otro mundo (u otra semilla): lo de antes ya no vale. */
  reset(gen: TerrainGenerator | null): void {
    this.gen = gen;
    this.job = null;
    this.center = null;
    this.info[3] = 0;
    this.seed = gen ? (gen.seed ^ 0xc4a7e5) | 0 : 0;
  }

  /** Cada frame, en la Luna: sigue construyendo durante `budgetMs` y, si hace falta, empieza otro centrado en (x, z). */
  update(gen: TerrainGenerator, x: number, z: number, budgetMs = 2.5): void {
    if (gen !== this.gen) this.reset(gen);
    const c = this.center;
    if (!this.job && (!c || Math.hypot(x - c[0], z - c[1]) > SIDE * 0.25)) {
      const x0 = Math.round(x / 512) * 512 - SIDE / 2, z0 = Math.round(z / 512) * 512 - SIDE / 2;
      this.job = { x0, z0, row: 0, data: new Float32Array(N * N * 4) };
      this.center = [x0 + SIDE / 2, z0 + SIDE / 2];
    }
    const job = this.job;
    if (!job) return;
    // Mientras no hay ninguno listo (al llegar), más deprisa: el suelo lejano es lo primero que se ve desde lo alto.
    if (this.info[3] === 0) budgetMs *= 3;
    const t0 = performance.now();
    const info = { height: 0, amp: 0, temp: 0, humid: 0, mount: 0, cont: 0, biome: 0 };
    while (job.row < N && performance.now() - t0 < budgetMs) {
      const j = job.row++;
      const wz = job.z0 + j * STEP;
      for (let i = 0; i < N; i++) {
        gen.columnInfo(job.x0 + i * STEP, wz, info);
        const o = (j * N + i) * 4;
        job.data[o] = info.height + 1; // la cara de arriba del bloque más alto
        job.data[o + 1] = info.biome === BIOME_MOON_MARE ? 1 : 0;
      }
    }
    if (job.row < N) return;
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, N, N, 0, gl.RGBA, gl.FLOAT, job.data);
    // Los datos son de los centros de cada celda de 8: el texel i cubre [x0 + i·8, x0 + (i+1)·8).
    this.info[0] = job.x0 - STEP / 2;
    this.info[1] = job.z0 - STEP / 2;
    this.info[3] = 1;
    this.job = null;
  }
}
