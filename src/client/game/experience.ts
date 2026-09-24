// Experiencia del jugador (la gestiona el cliente, como el inventario): total acumulado, nivel y
// progreso hacia el siguiente. PENDIENTE (tanda de experiencia): fórmulas en shared/experience.ts,
// subir de nivel con sonido, soltar orbes al morir.
export class Experience {
  /** Experiencia total acumulada. */
  total = 0;
  /** Aumenta con cada cambio (para guardar y refrescar el HUD). */
  version = 0;

  add(n: number): void {
    if (!(n > 0)) return;
    this.total += n;
    this.version++;
  }

  reset(): void {
    this.total = 0;
    this.version++;
  }
}
