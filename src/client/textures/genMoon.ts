// Programa lunar: texturas del suelo de la Luna, dibujadas aquí (nada copiado del juego):
// - regolito claro: polvo gris claro de las tierras altas, con guijarros y chispas de cristal;
// - regolito oscuro: el de los mares, gris azulado casi negro, con motas más claras;
// - roca lunar: piedra gris con grietas finas;
// - hielo sucio: hielo azulado con vetas de polvo y hollín (lo que trae carbono y nitrógeno).
import { clamp, mix, idx, N, Noise, pixelNoise, type Generator, type RGB, type Tex } from './texCore';

// El regolito real es oscuro (albedo ~0,12): con el Sol sin aire por encima se ve gris medio, no blanco.
const LIGHT: readonly RGB[] = [[158, 156, 151], [144, 142, 138], [128, 127, 123], [112, 111, 108], [92, 92, 90]];
const DARK: readonly RGB[] = [[86, 88, 96], [72, 74, 82], [60, 62, 70], [48, 50, 58], [36, 38, 46]];
const ROCK: readonly RGB[] = [[112, 112, 115], [98, 98, 102], [84, 84, 89], [70, 70, 75], [52, 52, 58]];

/** Polvo: ruido de dos escalas sobre una paleta de cinco tonos, con guijarros (píxeles claros con sombra abajo). */
function dust(t: Tex, pal: readonly RGB[], pebbles: number): void {
  const r = t.rng();
  const n = new Noise(r, 4);
  const n2 = new Noise(r, 8);
  const px = pixelNoise(r);
  for (let i = 0; i < N; i++) {
    const x = i & 15, y = i >> 4;
    const v = n.at(x, y) * 0.45 + n2.at(x, y) * 0.25 + px[i] * 0.3;
    t.setI(i, pal[clamp(Math.floor(v * 5), 0, 4)]);
    t.height[i] = 0.75 + v * 0.25;
    t.smooth[i] = 20 + px[i] * 15; // polvo: casi mate
  }
  for (let k = 0; k < pebbles; k++) {
    const x = r.int(1, 14), y = r.int(1, 14);
    t.setI(idx(x, y), pal[0]);
    t.height[idx(x, y)] = 1;
    t.setI(idx(x + 1, y + 1), mix(t.get(x + 1, y + 1), pal[4], 0.7));
    t.height[idx(x + 1, y + 1)] = 0.4;
  }
  t.depth = 1.1;
}

/** Roca: base de polvo más apretada y grietas finas. */
function rock(t: Tex): void {
  dust(t, ROCK, 3);
  const r = t.rng('cracks');
  for (let k = 0; k < 3; k++) {
    let x = r.int(0, 15), y = r.int(0, 15);
    for (let s = 0; s < r.int(4, 8); s++) {
      t.setI(idx(x & 15, y & 15), ROCK[4]);
      t.height[idx(x & 15, y & 15)] = 0.3;
      x += r.int(-1, 1);
      y += r.int(0, 1);
    }
  }
  t.depth = 1.5;
}

/** Hielo sucio: hielo azulado brillante con vetas de polvo oscuro. */
function dirtyIce(t: Tex): void {
  const r = t.rng();
  const n = new Noise(r, 3);
  const streak = new Noise(r, 5, 2);
  const px = pixelNoise(r);
  const ICE: readonly RGB[] = [[196, 220, 236], [172, 200, 224], [150, 182, 210], [128, 160, 192]];
  for (let i = 0; i < N; i++) {
    const x = i & 15, y = i >> 4;
    const v = n.at(x, y) * 0.6 + px[i] * 0.4;
    let c: RGB = ICE[clamp(Math.floor(v * 4), 0, 3)];
    const dirt = streak.at(x, y);
    if (dirt > 0.62) c = mix(c, [58, 54, 56], clamp((dirt - 0.62) * 3.2, 0, 0.85));
    t.setI(i, c);
    t.height[i] = 0.9 + v * 0.1;
    t.smooth[i] = 150 + px[i] * 60; // hielo: brillante
  }
  t.depth = 0.7;
}

export const MOON_GENERATORS: Record<string, Generator> = {
  moon_regolith: (t) => dust(t, LIGHT, 4),
  moon_regolith_dark: (t) => dust(t, DARK, 5),
  moon_rock: rock,
  dirty_ice: dirtyIce,
};
