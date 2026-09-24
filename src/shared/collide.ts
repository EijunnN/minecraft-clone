// Colisiones con cajas (AABB) al estilo de Minecraft: se recogen las cajas de colisión de los
// bloques cercanos (cubos completos o formas: losas, escaleras, vallas, puertas…) y el movimiento
// se recorta eje a eje, con subida automática de escalones bajos (step-up).
import { BLOCK_COLLIDE, blockCollisionBoxes } from './blocks';

export interface BlockGetter {
  /** Id del bloque o -1 si no está cargado (se trata como sólido). */
  getBlock(x: number, y: number, z: number): number;
}

const EPS = 1e-7;
const tmp: number[] = [];

/**
 * Cajas de colisión (en coordenadas del mundo, 6 números por caja) que tocan la región dada.
 * Los chunks sin cargar cuentan como sólidos.
 */
export function gatherBoxes(
  w: BlockGetter, minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number, out: number[],
): number[] {
  out.length = 0;
  const x0 = Math.floor(minX), x1 = Math.floor(maxX);
  // Una fila más abajo: las vallas y muros miden 1,5 bloques de alto.
  const y0 = Math.floor(minY) - 1, y1 = Math.floor(maxY);
  const z0 = Math.floor(minZ), z1 = Math.floor(maxZ);
  for (let y = y0; y <= y1; y++) {
    if (y >= 256) continue;
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        const id = w.getBlock(x, y, z);
        if (id < 0) {
          out.push(x, y, z, x + 1, y + 1, z + 1);
          continue;
        }
        const kind = BLOCK_COLLIDE[id];
        if (kind === 0) continue;
        if (kind === 1) {
          out.push(x, y, z, x + 1, y + 1, z + 1);
          continue;
        }
        const boxes = blockCollisionBoxes(id, x, y, z, w, tmp);
        for (let i = 0; i < boxes.length; i += 6) {
          out.push(x + boxes[i], y + boxes[i + 1], z + boxes[i + 2], x + boxes[i + 3], y + boxes[i + 4], z + boxes[i + 5]);
        }
      }
    }
  }
  return out;
}

/** ¿La caja (x0..x1, y0..y1, z0..z1) se solapa con alguna caja de colisión? */
export function boxBlocked(w: BlockGetter, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): boolean {
  const boxes = gatherBoxes(w, x0, y0, z0, x1, y1, z1, scratch);
  for (let i = 0; i < boxes.length; i += 6) {
    if (boxes[i + 3] > x0 + EPS && boxes[i] < x1 - EPS && boxes[i + 4] > y0 + EPS && boxes[i + 1] < y1 - EPS &&
      boxes[i + 5] > z0 + EPS && boxes[i + 2] < z1 - EPS) return true;
  }
  return false;
}
const scratch: number[] = [];

/** Recorta un desplazamiento en un eje (0 x, 1 y, 2 z) contra las cajas. */
function clip(boxes: number[], b: number[], axis: number, d: number): number {
  if (d === 0) return 0;
  const a1 = (axis + 1) % 3, a2 = (axis + 2) % 3;
  for (let i = 0; i < boxes.length; i += 6) {
    // Solape estricto en los otros dos ejes.
    if (boxes[i + 3 + a1] <= b[a1] + EPS || boxes[i + a1] >= b[3 + a1] - EPS) continue;
    if (boxes[i + 3 + a2] <= b[a2] + EPS || boxes[i + a2] >= b[3 + a2] - EPS) continue;
    if (d > 0) {
      const gap = boxes[i + axis] - b[3 + axis];
      if (gap >= -EPS && gap < d) d = Math.max(0, gap);
    } else {
      const gap = boxes[i + 3 + axis] - b[axis];
      if (gap <= EPS && gap > d) d = Math.min(0, gap);
    }
  }
  return d;
}

export interface MoveResult {
  dx: number;
  dy: number;
  dz: number;
  hitX: boolean;
  hitY: boolean;
  hitZ: boolean;
  onGround: boolean;
}

const gathered: number[] = [];
const bb = [0, 0, 0, 0, 0, 0];

function sweep(boxes: number[], b: number[], dx: number, dy: number, dz: number): [number, number, number] {
  const ry = clip(boxes, b, 1, dy);
  b[1] += ry;
  b[4] += ry;
  // Primero el eje horizontal con más desplazamiento (como Minecraft).
  let rx: number, rz: number;
  if (Math.abs(dx) >= Math.abs(dz)) {
    rx = clip(boxes, b, 0, dx);
    b[0] += rx;
    b[3] += rx;
    rz = clip(boxes, b, 2, dz);
    b[2] += rz;
    b[5] += rz;
  } else {
    rz = clip(boxes, b, 2, dz);
    b[2] += rz;
    b[5] += rz;
    rx = clip(boxes, b, 0, dx);
    b[0] += rx;
    b[3] += rx;
  }
  return [rx, ry, rz];
}

/**
 * Mueve una caja (centro de la base en x, y, z; ancho w; alto h) con recorte por colisiones.
 * `stepHeight` > 0 permite subir escalones (losas, escaleras) sin saltar si estaba en el suelo.
 */
export function moveBox(
  w: BlockGetter, x: number, y: number, z: number, width: number, height: number,
  dx: number, dy: number, dz: number, stepHeight: number, grounded: boolean,
): MoveResult {
  const hw = width / 2;
  const boxes = gatherBoxes(
    w,
    Math.min(x - hw, x - hw + dx) - 0.001, Math.min(y, y + dy) - 0.001, Math.min(z - hw, z - hw + dz) - 0.001,
    Math.max(x + hw, x + hw + dx) + 0.001, Math.max(y + height, y + height + dy) + stepHeight + 0.001,
    Math.max(z + hw, z + hw + dz) + 0.001,
    gathered,
  );
  bb[0] = x - hw; bb[1] = y; bb[2] = z - hw; bb[3] = x + hw; bb[4] = y + height; bb[5] = z + hw;
  let [rx, ry, rz] = sweep(boxes, bb, dx, dy, dz);
  const onGroundNow = dy < 0 && ry > dy + EPS;
  // Subir escalones: si el movimiento horizontal se vio frenado estando en el suelo.
  if (stepHeight > 0 && (grounded || onGroundNow) && (Math.abs(rx - dx) > EPS || Math.abs(rz - dz) > EPS)) {
    const s = [x - hw, y, z - hw, x + hw, y + height, z + hw];
    const up = clip(boxes, s, 1, stepHeight);
    s[1] += up;
    s[4] += up;
    const [sx, , sz] = sweep(boxes, s, dx, 0, dz);
    const down = clip(boxes, s, 1, -up + Math.min(0, dy));
    s[1] += down;
    s[4] += down;
    if (sx * sx + sz * sz > rx * rx + rz * rz + EPS) {
      rx = sx;
      rz = sz;
      ry = s[1] - y;
    }
  }
  return {
    dx: rx, dy: ry, dz: rz,
    hitX: Math.abs(rx - dx) > EPS, hitY: Math.abs(ry - dy) > EPS, hitZ: Math.abs(rz - dz) > EPS,
    onGround: (dy < 0 && ry > dy + EPS) || (stepHeight > 0 && ry > 0 && dy <= 0),
  };
}
