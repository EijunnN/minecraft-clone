// Entorno alrededor del jugador: lluvia (mapa de alturas para no mojar bajo techo) y océano lejano
// del horizonte.
import { AIR, BLOCK_RENDER, R_CROSS, R_TORCH } from '../../shared/blocks';
import { CHUNK_SIZE, SEA_LEVEL } from '../../shared/constants';
import { rainAt } from '../../shared/weather';
import type { Game } from './Game';

export class Environment {
  constructor(private g: Game) {}

  rainMapTimer = 0;
  rainHeights = new Uint8Array(64 * 64);

  /** Intensidad de lluvia (0..1) determinista a partir del tiempo del mundo: igual para todos. */
  weatherAt(worldTime: number): number {
    const override = (window as unknown as { __rain?: number }).__rain;
    if (override !== undefined) return override;
    return rainAt(worldTime, this.g.world!.seed);
  }

  /** Altura del bloque más alto de cada columna en un área de 64x64 (para que no llueva bajo techo). */
  updateRainMap(): void {
    const world = this.g.world!;
    this.rainMapTimer = 0.5;
    const x0 = Math.floor(this.g.player.x) - 32;
    const z0 = Math.floor(this.g.player.z) - 32;
    const out = this.rainHeights;
    for (let dz = 0; dz < 64; dz++) {
      for (let dx = 0; dx < 64; dx++) {
        const x = x0 + dx, z = z0 + dz;
        const col = world.getColumn(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE));
        let top = 0;
        if (col && col.blocks) {
          const lx = x - col.cx * CHUNK_SIZE, lz = z - col.cz * CHUNK_SIZE;
          for (let y = Math.min(255, col.maxY + 1); y > 0; y--) {
            const b = col.blocks[(y << 8) | (lz << 4) | lx];
            if (b !== AIR && BLOCK_RENDER[b] !== R_CROSS && BLOCK_RENDER[b] !== R_TORCH) {
              top = y;
              break;
            }
          }
        }
        out[dz * 64 + dx] = top;
      }
    }
    this.g.renderer.weather.setHeights(x0, z0, out);
  }

  farTimer = 0;
  farPos = [1e9, 1e9];
  farData = new Uint8Array(64);

  updateFarOcean(): void {
    const world = this.g.world!;
    const p = this.g.player;
    this.farTimer = 2;
    this.farPos = [p.x, p.z];
    const R = world.renderDistance * CHUNK_SIZE;
    const gen = world.generator;
    const dists = [R + 16, R + 60, R + 140, R + 300, R + 600, R + 1100];
    const weights = [2, 1.6, 1.3, 1, 0.8, 0.6];
    const raw = new Float32Array(64);
    for (let i = 0; i < 64; i++) {
      const az = ((i + 0.5) / 64 - 0.5) * Math.PI * 2;
      const cx = Math.cos(az), cz = Math.sin(az);
      let water = 0, total = 0;
      for (let k = 0; k < dists.length; k++) {
        const h = gen.columnInfo(Math.floor(p.x + cx * dists[k]), Math.floor(p.z + cz * dists[k])).height;
        if (h < SEA_LEVEL - 1) water += weights[k];
        total += weights[k];
      }
      raw[i] = water / total;
    }
    const k5 = [1, 2, 3, 2, 1];
    for (let i = 0; i < 64; i++) {
      let acc = 0;
      for (let j = -2; j <= 2; j++) acc += raw[(i + j + 64) % 64] * k5[j + 2];
      const v = acc / 9;
      const t = Math.max(0, Math.min(1, (v - 0.3) / 0.4));
      this.farData[i] = Math.round(t * t * (3 - 2 * t) * 255);
    }
    this.g.renderer.setFarOcean(this.farData);
  }
}
