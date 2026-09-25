// Proyectiles que no son flechas: huevos lanzados (se rompen al chocar y a veces nace un pollito) y el
// flotador de la caña de pescar (vuela, flota en el agua y avisa cuando pica un pez).
import { MOB_CHICKEN } from '../../mobs';
import { EGG, FISHING_ROD, SNOWBALL } from '../../items';
import { BLOCK_SOLID, BLOCK_FLUID, fluidHeight } from '../../blocks';
import { EF_ACTION } from '../../protocol';
import { FISH_WAIT, FISH_BITE } from '../../fishing';
import { moveBody } from '../physics';
import { isSplashPotion, splashPotion } from './potions'; // Fase 6 (monstruos)
import type { PlayerView, Entity } from './types';
import type { Entities } from './Entities';

/** Gravedad y rozamiento por tick de los objetos lanzados (valores de Minecraft: 0,03 y 0,99). */
const THROWN_GRAVITY = 12;
/** Distancia a la que se suelta el sedal. */
const MAX_LINE = 32;

export class Projectiles {
  constructor(private m: Entities) {}

  // ------------------------------------------------------------------ huevos

  thrownTick(e: Entity, dt: number, players: PlayerView[]): void {
    if (e.age > 15) {
      this.m.remove(e.id);
      return;
    }
    e.vy -= THROWN_GRAVITY * dt;
    const drag = Math.pow(e.inWater ? 0.8 : 0.99, dt * 20);
    e.vx *= drag;
    e.vy *= drag;
    e.vz *= drag;
    const speed = Math.hypot(e.vx, e.vy, e.vz);
    const steps = Math.max(1, Math.ceil((speed * dt) / 0.25));
    for (let s = 0; s < steps; s++) {
      const nx = e.x + (e.vx * dt) / steps, ny = e.y + (e.vy * dt) / steps, nz = e.z + (e.vz * dt) / steps;
      const id = this.m.w.getBlock(Math.floor(nx), Math.floor(ny), Math.floor(nz));
      if (id < 0 || BLOCK_SOLID[id]) {
        this.m.host.projectileHit?.('thrown', Math.floor(nx), Math.floor(ny), Math.floor(nz), e.x, e.y, e.z); // Fase 7 (redstone)
        this.shatter(e, null);
        return;
      }
      e.x = nx;
      e.y = ny;
      e.z = nz;
      for (const m of this.m.list.values()) {
        if (!m.ai || m.dead || m.id === e.shooter) continue; // Fase 6 (monstruos): no choca con quien lo lanzó
        const hw = m.width / 2 + 0.1;
        if (Math.abs(m.x - e.x) < hw && Math.abs(m.z - e.z) < hw && e.y > m.y - 0.1 && e.y < m.y + m.height + 0.1) {
          this.shatter(e, m);
          return;
        }
      }
      for (const p of players) {
        if (!p.alive || p.id === e.shooter) continue;
        if (Math.abs(p.x - e.x) < 0.4 && Math.abs(p.z - e.z) < 0.4 && e.y > p.y - 0.1 && e.y < p.y + 1.9) {
          this.shatter(e, null);
          return;
        }
      }
    }
    const b = this.m.w.getBlock(Math.floor(e.x), Math.floor(e.y), Math.floor(e.z));
    e.inWater = b > 0 && BLOCK_FLUID[b] === 1;
  }

  /** El huevo se rompe: empuja a la criatura (sin daño) y, con 1/8, nace un pollito (1/32 de ésos, cuatro). */
  private shatter(e: Entity, mob: Entity | null): void {
    const m = this.m;
    // Fase 6 (monstruos): las pociones arrojadizas de las brujas salpican su efecto.
    if (isSplashPotion(e.stack?.id)) {
      splashPotion(m, e);
      m.remove(e.id);
      return;
    }
    if (mob) m.damage(mob, 0, e.x - e.vx, e.z - e.vz, typeof e.shooter === 'string' ? e.shooter : null, 0.4);
    m.host.fx(e.stack?.id === SNOWBALL ? 'snowball_break' : 'egg_break', e.x, e.y, e.z);
    if (e.stack?.id === EGG && m.rand() < 1 / 8) {
      const n = m.rand() < 1 / 32 ? 4 : 1;
      for (let k = 0; k < n; k++) m.spawnMob(MOB_CHICKEN, e.x, e.y, e.z, true);
    }
    m.remove(e.id);
  }

  // ------------------------------------------------------------------ flotador

  bobberTick(e: Entity, dt: number, players: PlayerView[]): void {
    const m = this.m;
    const owner = players.find((p) => p.id === e.shooter);
    // Se recoge solo si el dueño se va, muere, se aleja o cambia de objeto.
    const gone = !owner || !owner.alive || Math.hypot(owner.x - e.x, owner.y - e.y, owner.z - e.z) > MAX_LINE ||
      (e.age > 1 && owner.held !== FISHING_ROD);
    if (gone) {
      m.remove(e.id);
      return;
    }
    const w = m.w;
    const bx = Math.floor(e.x), by = Math.floor(e.y + 0.05), bz = Math.floor(e.z);
    const cell = w.getBlock(bx, by, bz);
    if (cell > 0 && BLOCK_FLUID[cell] === 1) {
      const above = w.getBlock(bx, by + 1, bz);
      const surface = above > 0 && BLOCK_FLUID[above] === 1 ? by + 1.1 : by + fluidHeight(cell);
      if (e.fishWait === undefined) {
        m.host.fx('fish_splash', e.x, surface, e.z);
        e.fishWait = this.waitTime();
        e.fishBite = 0;
      }
      if (e.fishBite! > 0) {
        e.fishBite! -= dt;
        if (e.fishBite! <= 0) {
          e.fishBite = 0;
          e.fishWait = this.waitTime();
        }
      } else {
        // Sin cielo encima pica la mitad de rápido; con lluvia, algo más rápido.
        const open = w.skyTop(bx, bz) <= by + 1;
        e.fishWait! -= dt * (open ? 1 : 0.5) * (open && m.host.raining() > 0.2 ? 1.25 : 1);
        if (e.fishWait! <= 0) {
          e.fishBite = FISH_BITE[0] + m.rand() * (FISH_BITE[1] - FISH_BITE[0]);
          m.host.fx('fish_bite', e.x, surface, e.z);
        }
      }
      // Flota en la superficie; cuando pica, se hunde un poco.
      const target = surface - (e.fishBite! > 0 ? 0.3 : 0.12);
      e.vy += ((target - e.y) * 30 - e.vy * 6) * dt;
      const damp = 1 - Math.min(1, dt * 3);
      e.vx *= damp;
      e.vz *= damp;
    } else {
      e.fishWait = undefined;
      e.fishBite = 0;
      if (e.onGround) e.vx = e.vz = 0;
      else {
        e.vy -= THROWN_GRAVITY * dt;
        const drag = Math.pow(0.92, dt * 20);
        e.vx *= drag;
        e.vy *= drag;
        e.vz *= drag;
      }
    }
    moveBody(e, w, dt);
    e.flags = e.fishBite! > 0 ? EF_ACTION : 0;
  }

  private waitTime(): number {
    return FISH_WAIT[0] + this.m.rand() * (FISH_WAIT[1] - FISH_WAIT[0]);
  }
}
