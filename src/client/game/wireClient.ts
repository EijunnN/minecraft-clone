// Programa lunar: los cables entre postes eléctricos, en el cliente.
//
// El servidor manda la lista de cables de alrededor ('wires'; reemplaza a la anterior). Aquí se convierten en segmentos de línea con la
// caída de un cable colgado (una parábola de 8 tramos) para que el renderer los dibuje: cobre entre postes pequeños, gris con el mediano.
import type { ServerMsg } from '../../shared/protocol';

const SEGMENTS = 8;

export interface WireGeometry {
  small: Float32Array;
  medium: Float32Array;
}

export class WireClient {
  private rows: number[][] = [];
  private geo: WireGeometry | null = null;

  reset(): void {
    this.noPower = [];
    this.rows = [];
    this.geo = null;
  }

  /** Lo que no recibe energía (puntos sobre los que dibujar el rayo rojo). */
  noPower: number[][] = [];

  onMessage(msg: ServerMsg): boolean {
    if (msg.t === 'nopower') {
      this.noPower = msg.l;
      return true;
    }
    if (msg.t !== 'wires') return false;
    this.rows = msg.l;
    this.geo = null;
    return true;
  }

  /** Cuántos cables se conocen (para saber si cambiaron). */
  get size(): number {
    return this.rows.length;
  }

  /** ¿Hay cable entre los postes con estos puntos de enganche? */
  connected(a: readonly number[], b: readonly number[]): boolean {
    const eq = (r: number[], o: number, p: readonly number[]) => Math.abs(r[o] - p[0]) < 1e-6 && Math.abs(r[o + 1] - p[1]) < 1e-6 && Math.abs(r[o + 2] - p[2]) < 1e-6;
    return this.rows.some((r) => (eq(r, 0, a) && eq(r, 3, b)) || (eq(r, 0, b) && eq(r, 3, a)));
  }

  /** Cuántos cables tiene el poste con ese punto de enganche. */
  wireCount(p: readonly number[]): number {
    const eq = (r: number[], o: number) => Math.abs(r[o] - p[0]) < 1e-6 && Math.abs(r[o + 1] - p[1]) < 1e-6 && Math.abs(r[o + 2] - p[2]) < 1e-6;
    return this.rows.reduce((n, r) => n + (eq(r, 0) || eq(r, 3) ? 1 : 0), 0);
  }

  /** Los segmentos de línea (pares de vértices en coordenadas del mundo) de cada tipo de cable, o null si no hay ninguno. */
  geometry(): WireGeometry | null {
    if (!this.rows.length) return null;
    if (this.geo) return this.geo;
    const small: number[] = [], medium: number[] = [];
    for (const [ax, ay, az, bx, by, bz, med] of this.rows) {
      const out = med ? medium : small;
      const x0 = ax, y0 = ay, z0 = az; // (el servidor manda ya los puntos de enganche)
      const x1 = bx, y1 = by, z1 = bz;
      const len = Math.hypot(x1 - x0, y1 - y0, z1 - z0);
      const sag = Math.min(0.9, 0.05 * len);
      let px = x0, py = y0, pz = z0;
      for (let i = 1; i <= SEGMENTS; i++) {
        const t = i / SEGMENTS;
        const x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
        const y = y0 + (y1 - y0) * t - sag * 4 * t * (1 - t);
        out.push(px, py, pz, x, y, z);
        px = x;
        py = y;
        pz = z;
      }
    }
    this.geo = { small: new Float32Array(small), medium: new Float32Array(medium) };
    return this.geo;
  }
}
