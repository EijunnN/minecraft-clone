// Fase 6 (monstruos): pociones arrojadizas (las lanzan las brujas). Al romperse afectan a todo lo que
// esté a menos de 4 bloques, con más fuerza cuanto más cerca: daño al instante, lentitud o veneno.
import { MOB_WITCH } from '../../mobs';
import { SPLASH_HARMING, SPLASH_POISON, SPLASH_SLOWNESS } from '../../items';
import { EFFECT_POISON, EFFECT_SLOWNESS } from '../../effects';
import type { Entity } from './types';
import type { Entities } from './Entities';

/** Radio de la salpicadura (bloques). */
export const SPLASH_RADIUS = 4;

/** Efecto de cada poción: [efecto de estado (0 = daño instantáneo), segundos, nivel]. */
const SPLASH: Readonly<Record<number, [number, number, number]>> = {
  [SPLASH_HARMING]: [0, 0, 0],
  [SPLASH_SLOWNESS]: [EFFECT_SLOWNESS, 45, 0],
  [SPLASH_POISON]: [EFFECT_POISON, 22, 0],
};

export function isSplashPotion(id: number | undefined): boolean {
  return id !== undefined && SPLASH[id] !== undefined;
}

/** La poción `e` se rompe donde está: aplica su efecto alrededor. */
export function splashPotion(m: Entities, e: Entity): void {
  const id = e.stack!.id;
  const [effect, secs, amp] = SPLASH[id];
  m.host.fx('potion_break', e.x, e.y, e.z, id);
  for (const p of m.host.players()) {
    if (!p.alive || p.creative) continue;
    const d = Math.hypot(p.x - e.x, p.y + 0.9 - e.y, p.z - e.z);
    if (d > SPLASH_RADIUS) continue;
    const k = 1 - (d / SPLASH_RADIUS) * 0.75;
    if (effect === 0) m.host.hurtPlayer(p.id, Math.max(1, Math.round(6 * k)), 0, 0, 0, 'witch');
    else m.host.effectPlayer?.(p.id, effect, Math.max(1, Math.round(secs * k)), amp);
  }
  // Las criaturas sólo notan el daño (no llevan efectos de estado); las brujas resisten la magia.
  if (effect !== 0) return;
  for (const c of m.list.values()) {
    if (!c.ai || c.dead || c.type === MOB_WITCH) continue;
    const d = Math.hypot(c.x - e.x, c.y + c.height / 2 - e.y, c.z - e.z);
    if (d > SPLASH_RADIUS) continue;
    m.damage(c, Math.max(1, Math.round(6 * (1 - (d / SPLASH_RADIUS) * 0.75))), e.x, e.z, null, 0);
  }
}
