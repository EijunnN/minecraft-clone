// Física de cajas (AABB) contra la rejilla de bloques, compartida por criaturas, objetos y flechas.
import { BLOCK_SOLID, BLOCK_FLUID } from '../blocks';

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

export function boxCollides(
  w: BlockGetter, minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number,
): boolean {
  const x0 = Math.floor(minX), x1 = Math.floor(maxX - EPS);
  const y0 = Math.floor(minY), y1 = Math.floor(maxY - EPS);
  const z0 = Math.floor(minZ), z1 = Math.floor(maxZ - EPS);
  for (let y = y0; y <= y1; y++) {
    if (y >= 256) continue;
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) if (isSolidAt(w, x, y, z)) return true;
    }
  }
  return false;
}

function moveAxis(b: Body, w: BlockGetter, axis: 0 | 1 | 2, d: number): boolean {
  if (d === 0) return false;
  const hw = b.width / 2;
  let minX = b.x - hw, maxX = b.x + hw, minY = b.y, maxY = b.y + b.height, minZ = b.z - hw, maxZ = b.z + hw;
  if (axis === 0) { minX += d; maxX += d; }
  else if (axis === 1) { minY += d; maxY += d; }
  else { minZ += d; maxZ += d; }
  if (!boxCollides(w, minX, minY, minZ, maxX, maxY, maxZ)) {
    if (axis === 0) b.x += d;
    else if (axis === 1) b.y += d;
    else b.z += d;
    return false;
  }
  if (axis === 0) {
    b.x = d > 0 ? Math.floor(maxX - EPS) - hw - EPS * 2 : Math.floor(minX) + 1 + hw + EPS * 2;
    b.vx = 0;
  } else if (axis === 1) {
    if (d > 0) b.y = Math.floor(maxY - EPS) - b.height - EPS * 2;
    else {
      b.y = Math.floor(minY) + 1 + EPS;
      b.onGround = true;
    }
    b.vy = 0;
  } else {
    b.z = d > 0 ? Math.floor(maxZ - EPS) - hw - EPS * 2 : Math.floor(minZ) + 1 + hw + EPS * 2;
    b.vz = 0;
  }
  return true;
}

/** Integra la velocidad durante dt con colisiones; actualiza onGround, hitWall y fluidos. */
export function moveBody(b: Body, w: BlockGetter, dt: number): void {
  const dx = b.vx * dt, dy = b.vy * dt, dz = b.vz * dt;
  b.onGround = false;
  b.hitWall = false;
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) / 0.4));
  for (let i = 0; i < steps; i++) {
    moveAxis(b, w, 1, dy / steps);
    if (moveAxis(b, w, 0, dx / steps)) b.hitWall = true;
    if (moveAxis(b, w, 2, dz / steps)) b.hitWall = true;
  }
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
