// Empaquetado de coordenadas de bloque en un único número exacto (< 2^53).
const OFF = 1 << 20;
const SPAN = 1 << 21;

export function posKey(x: number, y: number, z: number): number {
  return ((x + OFF) * SPAN + (z + OFF)) * 256 + y;
}

export function keyY(k: number): number {
  return k % 256;
}

export function keyZ(k: number): number {
  return (Math.floor(k / 256) % SPAN) - OFF;
}

export function keyX(k: number): number {
  return Math.floor(Math.floor(k / 256) / SPAN) - OFF;
}
