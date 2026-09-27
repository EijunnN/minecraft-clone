// Cómo apuntan las criaturas que disparan o lanzan (Projectile.shoot de Java 26.3): hacia su objetivo, con la altura
// que cada una suma (0,2 × la distancia en horizontal, para compensar la caída), a una velocidad fija y con una
// desviación triangular de 0,0172275 × la incertidumbre en cada eje. No calculan el tiro exacto: lo que no alcanza
// su velocidad (una poción de bruja contra alguien 10 bloques más arriba) cae antes de llegar.

/** rangedAttackUncertainty de casi todas: 14 − 4 × dificultad (10 en fácil, 6 en normal, 2 en difícil). */
export function mobUncertainty(difficulty: number): number {
  return 14 - difficulty * 4;
}

/**
 * getMovementToShoot: la velocidad (en bloques/s) de un proyectil lanzado hacia (xd, yd, zd) con `pow` (bloques por
 * tick) y esa incertidumbre.
 */
export function shotVelocity(xd: number, yd: number, zd: number, pow: number, uncertainty: number, rand: () => number): [number, number, number] {
  const len = Math.hypot(xd, yd, zd) || 1;
  const dev = 0.0172275 * uncertainty;
  const tri = () => dev * (rand() - rand());
  return [(xd / len + tri()) * pow * 20, (yd / len + tri()) * pow * 20, (zd / len + tri()) * pow * 20];
}
