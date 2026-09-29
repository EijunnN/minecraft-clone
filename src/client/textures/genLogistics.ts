// Programa lunar: texturas de la logística, dibujadas aquí (nada copiado del juego):
// - cintas transportadoras: chapa oscura con raíles laterales y una fila de flechas (amarillas o rojas según el nivel) que apuntan
//   hacia donde avanza; de arriba, una textura por nivel y sentido (el shader la desliza a la velocidad de su nivel).
// La cara de arriba tiene u a lo largo de +x y v a lo largo de +z; los sentidos son los de logistics/belts (0 +x, 1 +z, 2 −x, 3 −z).
import { clamp, idx, mix, N, pixelNoise, type Generator, type RGB, type Tex } from './texCore';

const TIER_COLORS: readonly RGB[] = [[236, 190, 40], [226, 84, 52], [64, 150, 236]]; // amarilla, roja y azul, como las de Factorio
const PLATE: readonly RGB[] = [[62, 64, 70], [54, 56, 62], [46, 48, 54]];
const RAIL: RGB = [112, 116, 126];

/** Dibuja la cinta con las flechas hacia −v («arriba») y devuelve una rejilla de píxeles para girarla después. */
function drawUp(t: Tex, tier: number): RGB[] {
  const r = t.rng();
  const px = pixelNoise(r);
  const grid: RGB[] = new Array(N);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const i = idx(x, y);
      const n = px[i];
      let c: RGB = mix(PLATE[clamp(Math.floor(n * 3), 0, 2)], PLATE[1], 0.5);
      if (x <= 1 || x >= 14) c = mix(RAIL, [86, 90, 100], 0.4 * n); // raíles laterales
      grid[i] = c;
    }
  }
  const col = TIER_COLORS[tier];
  const dark = mix(col, [20, 20, 22], 0.55);
  // Flechas «^» de 8 px de periodo (dos por bloque): el vértice arriba y los brazos hacia abajo.
  for (let base = 0; base < 16; base += 8) {
    for (let k = 0; k < 5; k++) {
      const y = base + 1 + k;
      for (const x of [7 - k, 8 + k]) {
        if (x >= 2 && x <= 13 && y < 16) grid[idx(x, y)] = col;
      }
      const y2 = y + 1;
      for (const x of [7 - k, 8 + k]) {
        if (x >= 2 && x <= 13 && y2 < 16 && k < 4) grid[idx(x, y2)] = mix(grid[idx(x, y2)], dark, 0.6);
      }
    }
  }
  return grid;
}

/** Gira la rejilla 90° `turns` veces en el sentido de las agujas del reloj. */
function rotate(grid: RGB[], turns: number): RGB[] {
  let g = grid;
  for (let k = 0; k < (turns & 3); k++) {
    const out: RGB[] = new Array(N);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) out[idx(15 - y, x)] = g[idx(x, y)];
    g = out;
  }
  return g;
}

function beltTop(tier: number, dir: number): Generator {
  return (t: Tex) => {
    // «Arriba» (−v) es el sentido 3 (−z); girando en el sentido horario: −z → +x (1 giro) → +z (2) → −x (3).
    const turns = [1, 2, 3, 0][dir];
    const g = rotate(drawUp(t, tier), turns);
    for (let i = 0; i < N; i++) {
      t.setI(i, g[i]);
      t.height[i] = 0.85;
      t.smooth[i] = 90;
    }
    t.depth = 0.6;
  };
}

/** Panel solar: cuatro celdas de silicio azul oscuro separadas por una rejilla plateada, con un marco de chapa. */
const solarPanelTop: Generator = (t) => {
  const px = pixelNoise(t.rng());
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const i = idx(x, y);
      const frame = x === 0 || y === 0 || x === 15 || y === 15;
      const grid = x === 7 || x === 8 || y === 7 || y === 8;
      const finger = !grid && !frame && (x % 3 === 0);
      let c: RGB;
      if (frame) c = mix(RAIL, [86, 90, 100], 0.4 * px[i]);
      else if (grid) c = [150, 156, 168];
      else if (finger) c = mix([44, 70, 140], [90, 110, 170], 0.5);
      else c = mix([22, 36, 92], [30, 52, 118], px[i]);
      t.setI(i, c);
      t.height[i] = frame || grid ? 0.9 : 0.7;
      t.smooth[i] = frame || grid ? 80 : 190; // el silicio brilla; la rejilla, mate
    }
  }
};

export const LOGISTICS_GENERATORS: Record<string, Generator> = { solar_panel_top: solarPanelTop };
for (let tier = 0; tier < 3; tier++) {
  for (let dir = 0; dir < 4; dir++) LOGISTICS_GENERATORS[`belt_t${tier}_d${dir}`] = beltTop(tier, dir);
}
