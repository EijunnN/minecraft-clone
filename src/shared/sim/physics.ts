// Física de cajas (AABB) contra la rejilla de bloques, compartida por criaturas, objetos y flechas.
import { BLOCK_SOLID, BLOCK_FLUID } from '../blocks';
import { moveBox, boxBlocked } from '../collide';

export interface BlockGetter {
  /** Id del bloque o -1 si no está cargado (se trata como sólido). */
  getBlock(x: number, y: number, z: number): number;
}

export interface Body {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  width: number;
  height: number;
  onGround: boolean;
  inWater: boolean;
  inLava: boolean;
  /** Choque horizontal en el último movimiento. */
  hitWall: boolean;
}

const EPS = 1e-4;

export function isSolidAt(w: BlockGetter, x: number, y: number, z: number): boolean {
  const b = w.getBlock(x, y, z);
  return b < 0 || BLOCK_SOLID[b] === 1;
}

/** ¿La caja se solapa con alguna caja de colisión? */
export function boxCollides(
  w: BlockGetter, minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number,
): boolean {
  return boxBlocked(w, minX, minY, minZ, maxX, maxY, maxZ);
}

/**
 * Integra la velocidad durante dt con colisiones por cajas; actualiza onGround, hitWall y fluidos.
 * `step` > 0 permite subir escalones bajos (las criaturas suben losas y escaleras).
 */
export function moveBody(b: Body, w: BlockGetter, dt: number, step = 0): void {
  const r = moveBox(w, b.x, b.y, b.z, b.width, b.height, b.vx * dt, b.vy * dt, b.vz * dt, step, b.onGround);
  b.x += r.dx;
  b.y += r.dy;
  b.z += r.dz;
  if (r.hitX) b.vx = 0;
  if (r.hitZ) b.vz = 0;
  if (r.hitY) b.vy = 0;
  b.onGround = r.onGround;
  b.hitWall = r.hitX || r.hitZ;
  updateFluids(b, w);
}

export function updateFluids(b: Body, w: BlockGetter): void {
  const hw = b.width / 2;
  let water = false, lava = false;
  const x0 = Math.floor(b.x - hw), x1 = Math.floor(b.x + hw - EPS);
  const z0 = Math.floor(b.z - hw), z1 = Math.floor(b.z + hw - EPS);
  const y0 = Math.floor(b.y + 0.1), y1 = Math.floor(b.y + Math.max(0.2, b.height * 0.6));
  for (let y = y0; y <= y1; y++) {
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        const id = w.getBlock(x, y, z);
        if (id <= 0) continue;
        const f = BLOCK_FLUID[id];
        if (f === 1) water = true;
        else if (f === 2) lava = true;
      }
    }
  }
  b.inWater = water;
  b.inLava = lava;
}

/** ¿Hay línea de visión entre dos puntos? (paso de 0.25 bloques). */
export function lineOfSight(w: BlockGetter, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): boolean {
  const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
  const len = Math.hypot(dx, dy, dz);
  const n = Math.ceil(len / 0.25);
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const id = w.getBlock(Math.floor(x0 + dx * t), Math.floor(y0 + dy * t), Math.floor(z0 + dz * t));
    if (id < 0 || (BLOCK_SOLID[id] === 1)) return false;
  }
  return true;
}
