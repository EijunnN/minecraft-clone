// Tormentas eléctricas: mientras truena caen rayos al azar cerca de los jugadores (en lo más alto
// de la columna, a la intemperie). Un rayo hace 5 de daño y prende a lo que haya a 3 bloques, y
// todos los jugadores ven el destello y oyen el trueno (más tarde cuanto más lejos).
import { thunderAt } from '../../weather';
import { MIN_Y } from '../../constants';
import type { ServerContext } from './context';

/** Rayos por segundo y jugador con la tormenta en su punto más fuerte. */
const STRIKES_PER_SECOND = 1 / 9;

export class Storms {
  constructor(private ctx: ServerContext) {}

  tick(dt: number): void {
    const ctx = this.ctx;
    const th = thunderAt(ctx.worldTime(), ctx.seed);
    if (th <= 0) return;
    for (const s of ctx.sessions()) {
      if (!s.joined || s.s & 8 || ctx.rand() > STRIKES_PER_SECOND * th * dt) continue;
      const x = Math.floor(s.p[0] + (ctx.rand() - 0.5) * 96), z = Math.floor(s.p[2] + (ctx.rand() - 0.5) * 96);
      const top = ctx.world.skyTop(x, z);
      if (top < MIN_Y) continue; // sin cargar
      this.strike(x + 0.5, top + 1, z + 0.5);
    }
  }

  /** Cae un rayo en (x, y, z). */
  strike(x: number, y: number, z: number): void {
    const ctx = this.ctx;
    ctx.broadcast({ t: 'fx', k: 'lightning', p: [Math.round(x * 100) / 100, y, Math.round(z * 100) / 100] });
    for (const e of ctx.entities.list.values()) {
      if (!e.ai || e.dead || Math.hypot(e.x - x, e.y - y, e.z - z) > 3) continue;
      ctx.entities.damage(e, 5, x, z, null, 0.3);
      e.fire = Math.max(e.fire, 8);
    }
    for (const s of ctx.sessions()) {
      if (!s.joined || Math.hypot(s.p[0] - x, s.p[1] - y, s.p[2] - z) > 3) continue;
      ctx.entities.host.hurtPlayer(s.id, 5, 0, 0.3, 0, 'lightning');
    }
  }
}
