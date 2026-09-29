// Programa lunar: los sprites (16×16) de los objetos de Factorio (shared/factorio/itemDefs.ts). Se dibujan con formas geométricas y un color:
// engranaje, cable, circuito, varilla, tubería, placa, ladrillo, batería, motor, armazón, plástico, polvo, estructura, paquete de ciencia y
// módulo. Mismo formato que itemSprites.ts (cada carácter es una tinta; '.' es transparente; el contorno lo añade itemSprites).
import { FACTORIO_ITEM_DEFS, factorioKey, type FactorioItemDef } from '../../shared/factorio/itemDefs';

type RGB = readonly [number, number, number];
interface Ink {
  c: RGB;
  o?: RGB;
}
interface SpriteDef {
  rows: readonly string[];
  inks: Readonly<Record<string, Ink>>;
}

const S = 16;
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const WHITE: RGB = [255, 255, 255], BLACK: RGB = [0, 0, 0];

/** Tintas: '1' brillo, '2' base, '3' sombra, '4' sombra fuerte; 'k' casi negro, 'w' blanco, 'g' gris metálico. */
function inks(t: RGB): Record<string, Ink> {
  const edge = mix(t, BLACK, 0.7);
  return {
    '1': { c: mix(t, WHITE, 0.45), o: edge }, '2': { c: t, o: edge }, '3': { c: mix(t, BLACK, 0.28), o: edge }, '4': { c: mix(t, BLACK, 0.5), o: edge },
    k: { c: [34, 34, 40], o: [10, 10, 14] }, w: { c: [244, 244, 248], o: edge }, g: { c: [168, 174, 184], o: [50, 54, 62] },
    y: { c: [236, 204, 72], o: [90, 70, 10] },
  };
}

type Grid = string[][];
const blank = (): Grid => Array.from({ length: S }, () => Array<string>(S).fill('.'));
const rows = (g: Grid): string[] => g.map((r) => r.join(''));
const put = (g: Grid, x: number, y: number, c: string): void => {
  if (x >= 0 && y >= 0 && x < S && y < S) g[y][x] = c;
};
/** Rellena con `shade(x, y)` los píxeles donde `inside(x, y)` es cierto. */
function fill(g: Grid, inside: (x: number, y: number) => boolean, shade: (x: number, y: number) => string): void {
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (inside(x, y)) g[y][x] = shade(x, y);
}
/** Luz de arriba a la izquierda: brillo, base o sombra según la posición dentro de la caja. */
const light = (x: number, y: number, cx = 7.5, cy = 7.5): string => {
  const d = (x - cx) + (y - cy);
  return d < -3 ? '1' : d < 3 ? '2' : d < 6 ? '3' : '4';
};

function gear(): Grid {
  const g = blank();
  fill(g, (x, y) => {
    const dx = x - 7.5, dy = y - 7.5, r = Math.hypot(dx, dy);
    if (r < 1.9) return false;
    if (r <= 4.6) return true;
    const a = Math.atan2(dy, dx);
    const tooth = Math.abs(((a / (Math.PI / 4)) % 1 + 1) % 1 - 0.5) > 0.16 ? false : true;
    return r <= 6.6 && tooth;
  }, (x, y) => light(x, y));
  return g;
}

function cable(): Grid {
  const g = blank();
  // Una bobina: anillo de hilo con dos puntas que salen.
  fill(g, (x, y) => {
    const r = Math.hypot(x - 7, y - 8);
    return r >= 2.6 && r <= 5.4;
  }, (x, y) => (Math.hypot(x - 7, y - 8) < 3.8 ? light(x, y) : '2'));
  for (let i = 0; i < 4; i++) {
    put(g, 11 + i, 4 - i, i < 2 ? '2' : '1');
    put(g, 3 - Math.min(i, 2), 12 + Math.min(i, 3), '3');
  }
  put(g, 14, 1, 'y');
  put(g, 1, 14, 'y');
  return g;
}

function circuit(): Grid {
  const g = blank();
  fill(g, (x, y) => x >= 2 && x <= 13 && y >= 3 && y <= 12, (x, y) => (x === 2 || y === 3 ? '1' : x === 13 || y === 12 ? '3' : '2'));
  // Pistas y patillas doradas.
  for (let x = 3; x <= 12; x += 3) {
    put(g, x, 4, 'y');
    put(g, x, 11, 'y');
  }
  for (const [x, y] of [[4, 6], [4, 8], [11, 6], [11, 8], [6, 5], [9, 10]] as const) put(g, x, y, '1');
  fill(g, (x, y) => x >= 6 && x <= 9 && y >= 6 && y <= 9, (x, y) => (x === 6 || y === 6 ? 'g' : 'k'));
  return g;
}

function stick(): Grid {
  const g = blank();
  for (let i = 0; i < 12; i++) {
    put(g, 2 + i, 13 - i, '2');
    put(g, 3 + i, 13 - i, '3');
    put(g, 2 + i, 12 - i, '1');
  }
  return g;
}

function pipe(): Grid {
  const g = blank();
  fill(g, (x, y) => x >= 1 && x <= 14 && y >= 5 && y <= 10, (x, y) => (y <= 6 ? '1' : y <= 8 ? '2' : '3'));
  fill(g, (x, y) => (x <= 3 || x >= 12) && y >= 4 && y <= 11 && x >= 1 && x <= 14, (x, y) => (y <= 6 ? '2' : y <= 8 ? '3' : '4'));
  return g;
}

function plate(): Grid {
  const g = blank();
  // Una losa plana vista en perspectiva: cara de arriba en paralelogramo y canto de delante.
  for (let y = 5; y <= 8; y++) for (let x = 2 + (8 - y); x <= 12 + (8 - y) && x <= 14; x++) put(g, x, y, y === 5 ? '1' : '2');
  for (let y = 9; y <= 11; y++) for (let x = 2; x <= 11; x++) put(g, x, y, y === 9 ? '3' : '4');
  for (let y = 5; y <= 11; y++) put(g, 12 + Math.max(0, 8 - y) < 15 ? 12 + Math.max(0, 8 - y) : 14, y, y >= 9 ? '4' : '3');
  return g;
}

function brick(): Grid {
  const g = blank();
  for (const [y0, off] of [[3, 0], [7, 4], [11, 0]] as const) {
    for (let x = 1; x < 15; x++) {
      const seam = (x + off) % 8 === 0;
      for (let y = y0; y < y0 + 3; y++) put(g, x, y, seam ? '4' : y === y0 ? '1' : y === y0 + 2 ? '3' : '2');
    }
  }
  return g;
}

function battery(): Grid {
  const g = blank();
  fill(g, (x, y) => x >= 4 && x <= 11 && y >= 4 && y <= 14, (x, y) => (x <= 5 ? '1' : x <= 8 ? '2' : x <= 10 ? '3' : '4'));
  fill(g, (x, y) => x >= 6 && x <= 9 && y >= 2 && y <= 3, () => 'g');
  fill(g, (x, y) => x >= 4 && x <= 11 && y >= 8 && y <= 9, () => 'y');
  return g;
}

function engine(): Grid {
  const g = blank();
  fill(g, (x, y) => x >= 1 && x <= 14 && y >= 7 && y <= 13, (x, y) => (y <= 8 ? '1' : y <= 11 ? '2' : '3'));
  for (const cx of [3, 7, 11]) fill(g, (x, y) => x >= cx && x <= cx + 2 && y >= 2 && y <= 6, (x) => (x === cx ? 'g' : x === cx + 1 ? 'w' : 'g'));
  fill(g, (x, y) => x >= 0 && x <= 15 && y === 14, () => 'k');
  return g;
}

function frame(): Grid {
  const g = blank();
  fill(g, (x, y) => Math.hypot(x - 7.5, y - 7.5) <= 3.2, (x, y) => light(x, y));
  for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    for (let i = 3; i <= 6; i++) put(g, Math.round(7.5 + dx * i * 0.95 - 0.5 * dx), Math.round(7.5 + dy * i * 0.95 - 0.5 * dy), '3');
    fill(g, (x, y) => Math.hypot(x - (7.5 + dx * 6.4), y - (7.5 + dy * 6.4)) <= 1.6, () => 'g');
  }
  put(g, 7, 7, 'k');
  put(g, 8, 8, 'k');
  return g;
}

function plastic(): Grid {
  const g = blank();
  fill(g, (x, y) => x >= 2 && x <= 13 && y >= 5 && y <= 11, (x, y) => (y === 5 || x === 2 ? 'w' : y === 11 || x === 13 ? '3' : '1'));
  return g;
}

function powder(): Grid {
  const g = blank();
  fill(g, (x, y) => y >= 5 && y <= 13 && Math.abs(x - 7.5) <= (y - 4) * 0.95 && x >= 1 && x <= 14, (x, y) => light(x, y, 6, 8));
  for (const [x, y] of [[6, 8], [9, 10], [4, 12], [11, 12], [7, 6]] as const) put(g, x, y, 'y');
  return g;
}

function structure(): Grid {
  const g = blank();
  fill(g, (x, y) => x >= 2 && x <= 13 && y >= 3 && y <= 12, (x, y) => ((x + y) % 3 === 0 ? '3' : light(x, y)));
  return g;
}

function pack(): Grid {
  const g = blank();
  // Un matraz: cuello con tapón y panza redonda con el líquido del color de la ciencia.
  fill(g, (x, y) => x >= 6 && x <= 9 && y >= 1 && y <= 3, (x) => (x === 6 ? 'g' : 'k'));
  fill(g, (x, y) => x >= 6 && x <= 9 && y >= 4 && y <= 6, (x, y) => (y === 4 ? 'g' : x <= 7 ? '1' : '2'));
  fill(g, (x, y) => Math.hypot(x - 7.5, y - 10.5) <= 4.6, (x, y) => (Math.hypot(x - 7.5, y - 10.5) > 3.6 ? '3' : light(x, y)));
  put(g, 6, 9, 'w');
  put(g, 6, 10, 'w');
  return g;
}

function moduleShape(level: number): Grid {
  const g = blank();
  fill(g, (x, y) => x >= 2 && x <= 13 && y >= 2 && y <= 13, (x, y) => (x === 2 || y === 2 ? '1' : x === 13 || y === 13 ? '4' : '2'));
  fill(g, (x, y) => x >= 4 && x <= 11 && y >= 4 && y <= 8, () => 'k');
  for (let i = 0; i < 3; i++) put(g, 5 + i * 2, 6, i < level ? 'w' : '3');
  for (let i = 0; i < level; i++) put(g, 5 + i * 2, 11, 'y');
  return g;
}

function draw(d: FactorioItemDef): Grid {
  switch (d.shape) {
    case 'gear': return gear();
    case 'cable': return cable();
    case 'circuit': return circuit();
    case 'stick': return stick();
    case 'pipe': return pipe();
    case 'plate': return plate();
    case 'brick': return brick();
    case 'battery': return battery();
    case 'engine': return engine();
    case 'frame': return frame();
    case 'plastic': return plastic();
    case 'powder': return powder();
    case 'structure': return structure();
    case 'pack': return pack();
    case 'module': return moduleShape(d.level ?? 1);
  }
}

/** Un sprite por objeto de Factorio (clave `f_nombre`). */
export const FACTORIO_SPRITES: Record<string, SpriteDef> = Object.fromEntries(
  FACTORIO_ITEM_DEFS.map((d) => [factorioKey(d.name), { rows: rows(draw(d)), inks: inks(d.tint) }]),
);
