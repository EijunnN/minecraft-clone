// Chat de voz (parte 2): cómo cambia una voz con el entorno. Las paredes entre quien habla y quien escucha la
// apagan y le quitan los agudos (según el material: la lana casi no deja pasar nada, el cristal y las hojas poco
// tapan); en una cueva o una sala cerrada la voz retumba (más cuanto más grande es el hueco); y bajo el agua se
// oye ahogada. Todo se calcula con rayos por los bloques, sin tocar el audio, para poder probarlo aparte.
import { BLOCKS, BLOCK_COLLIDE, BLOCK_FLUID, BLOCK_OPAQUE } from '../../shared/blocks';
import { MAX_BLOCK_ID } from '../../shared/constants';

export type BlockAt = (x: number, y: number, z: number) => number;

/** Por cada bloque: cuánto sonido deja pasar (0..1) y cuánto apaga los agudos (0 nada, ~1.6 la lana). */
const PASS = new Float32Array(MAX_BLOCK_ID);
const MUFFLE = new Float32Array(MAX_BLOCK_ID);
let tablesReady = false;

function buildTables(): void {
  for (let id = 0; id < MAX_BLOCK_ID; id++) {
    const def = BLOCKS[id];
    let pass = 1, muffle = 0;
    if (id === 0 || !def) {
      // aire
    } else if (BLOCK_FLUID[id] === 1) {
      pass = 0.8; muffle = 0.35;
    } else if (BLOCK_FLUID[id] === 2) {
      pass = 0.5; muffle = 0.8;
    } else if (def.sound === 'wool') {
      // Lana: la que mejor aísla (las alfombras, finas, casi nada).
      if (BLOCK_COLLIDE[id] === 1) { pass = 0.16; muffle = 1.6; } else { pass = 0.95; muffle = 0.1; }
    } else if (def.sound === 'leaves' || def.sound === 'vines') {
      pass = 0.85; muffle = 0.15;
    } else if (def.sound === 'glass') {
      if (BLOCK_COLLIDE[id]) { pass = 0.55; muffle = 0.5; }
    } else if (BLOCK_OPAQUE[id] && BLOCK_COLLIDE[id] === 1) {
      pass = 0.3; muffle = 1;
    } else if (BLOCK_COLLIDE[id] === 1) {
      pass = 0.6; muffle = 0.5;
    } else if (BLOCK_COLLIDE[id] === 2) {
      // Losas, escaleras, puertas, vallas…: tapan en parte.
      pass = 0.75; muffle = 0.35;
    }
    PASS[id] = pass;
    MUFFLE[id] = muffle;
  }
  tablesReady = true;
}

export interface Occlusion {
  /** Parte del sonido que llega de frente (1 sin nada en medio). */
  gain: number;
  /** Frecuencia de corte del filtro de paso bajo (Hz): 20000 sin nada, unos cientos tras mucha roca. */
  cutoff: number;
}

/** Corte según lo tapado: m = 1 (una pared) ≈ 3300 Hz, m = 2 ≈ 550 Hz; nunca por debajo de 250 Hz. */
export function muffleCutoff(m: number): number {
  return Math.max(250, 20000 * Math.exp(-1.8 * m));
}

/**
 * Recorre los bloques que cruza el segmento a → b (sin contar las celdas de los extremos, donde están las
 * cabezas) y acumula lo que dejan pasar y lo que apagan.
 */
export function traceSegment(get: BlockAt, ax: number, ay: number, az: number, bx: number, by: number, bz: number): { pass: number; muffle: number } {
  if (!tablesReady) buildTables();
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const len = Math.hypot(dx, dy, dz);
  let pass = 1, muffle = 0;
  if (len < 1e-6) return { pass, muffle };
  let x = Math.floor(ax), y = Math.floor(ay), z = Math.floor(az);
  const ex = Math.floor(bx), ey = Math.floor(by), ez = Math.floor(bz);
  const sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1;
  const tdx = dx !== 0 ? Math.abs(1 / dx) : Infinity;
  const tdy = dy !== 0 ? Math.abs(1 / dy) : Infinity;
  const tdz = dz !== 0 ? Math.abs(1 / dz) : Infinity;
  let tx = dx !== 0 ? (dx > 0 ? x + 1 - ax : ax - x) * tdx : Infinity;
  let ty = dy !== 0 ? (dy > 0 ? y + 1 - ay : ay - y) * tdy : Infinity;
  let tz = dz !== 0 ? (dz > 0 ? z + 1 - az : az - z) * tdz : Infinity;
  for (let i = 0; i < 160; i++) {
    if (tx < ty && tx < tz) { x += sx; if (tx > 1) break; tx += tdx; }
    else if (ty < tz) { y += sy; if (ty > 1) break; ty += tdy; }
    else { z += sz; if (tz > 1) break; tz += tdz; }
    if (x === ex && y === ey && z === ez) break;
    const id = get(x, y, z);
    if (id <= 0 || id >= MAX_BLOCK_ID) continue;
    pass *= PASS[id];
    muffle += MUFFLE[id];
    if (pass < 0.002) break;
  }
  return { pass, muffle };
}

/**
 * Lo que tapa el camino de una voz: además del rayo directo (cabeza a cabeza) se prueban rayos paralelos un poco
 * por encima, a los lados y hacia los pies, y vale el más despejado. Así se oye algo por encima de un muro bajo o
 * por el borde de una puerta, aunque menos que sin nada (el sonido que rodea un obstáculo pierde algo).
 */
export function voiceOcclusion(get: BlockAt, lx: number, ly: number, lz: number, sx: number, sy: number, sz: number): Occlusion {
  const hx = sx - lx, hz = sz - lz;
  const hl = Math.hypot(hx, hz) || 1;
  // Perpendicular horizontal al camino, para los rayos de los lados.
  const px = -hz / hl * 0.8, pz = hx / hl * 0.8;
  const rays: [number, number, number, number, number, number][] = [
    [0, 0, 0, 0, 0, 0],
    [0, 1, 0, 0, 1, 0],
    [px, 0, pz, px, 0, pz],
    [-px, 0, -pz, -px, 0, -pz],
    [0, 0, 0, 0, -1.2, 0],
  ];
  let best = { pass: 0, muffle: Infinity };
  for (let i = 0; i < rays.length; i++) {
    const [ax, ay, az, bx, by, bz] = rays[i];
    const r = traceSegment(get, lx + ax, ly + ay, lz + az, sx + bx, sy + by, sz + bz);
    const pass = i === 0 ? r.pass : r.pass * 0.8;
    if (pass > best.pass) best = { pass, muffle: r.muffle + (i === 0 ? 0 : 0.15) };
  }
  return { gain: best.pass, cutoff: muffleCutoff(best.muffle) };
}

/** Direcciones de los rayos para medir el hueco: los seis ejes y las ocho diagonales. */
const DIRS: [number, number, number][] = [
  [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
  [1, 1, 1], [1, 1, -1], [-1, 1, 1], [-1, 1, -1], [1, -1, 1], [1, -1, -1], [-1, -1, 1], [-1, -1, -1],
].map(([x, y, z]) => { const l = Math.hypot(x, y, z); return [x / l, y / l, z / l] as [number, number, number]; });

/** Distancia (en bloques, hasta max) a la primera pared en una dirección; max si no hay ninguna. */
function wallDistance(get: BlockAt, x: number, y: number, z: number, d: [number, number, number], max: number): number {
  for (let t = 0.5; t <= max; t += 0.5) {
    const id = get(Math.floor(x + d[0] * t), Math.floor(y + d[1] * t), Math.floor(z + d[2] * t));
    if (id > 0 && id < MAX_BLOCK_ID && BLOCK_COLLIDE[id] === 1 && (BLOCK_OPAQUE[id] || BLOCKS[id]?.sound === 'glass')) return t;
  }
  return max;
}

/** Hasta dónde se miran las paredes para decidir si es un sitio cerrado. */
const ROOM_RANGE = 32;

/**
 * Cuánto retumba una voz en un sitio (0..1, lo que va a la reverberación): casi nada al aire libre, bastante en una
 * sala y mucho en una cueva grande. Depende de cuántas direcciones topan con pared y de lo lejos que están.
 */
export function voiceReverb(get: BlockAt, x: number, y: number, z: number): number {
  let hits = 0, dist = 0;
  for (const d of DIRS) {
    const w = wallDistance(get, x, y, z, d, ROOM_RANGE);
    if (w < ROOM_RANGE) { hits++; dist += w; }
  }
  const closed = hits / DIRS.length;
  const size = hits ? dist / hits : 0;
  return Math.min(0.75, 0.04 + closed * closed * (0.22 + 0.4 * Math.min(1, size / 16)));
}
