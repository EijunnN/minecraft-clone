// Fase 7.5 (mansión): el alay en el cliente. Qué se le puede dar (cualquier objeto si no lleva nada; la
// mano vacía para que devuelva el suyo; un fragmento de amatista mientras baila) y los efectos que
// manda el servidor: darle y quitarle el objeto, recoger, lanzar y duplicarse.
import { MOB_ALLAY, EF_ALLAY_DANCING } from '../../shared/allay';
import { AMETHYST_SHARD } from '../../shared/items';
import type { ClientEntity } from './ClientEntities';
import type { Game } from './Game';

/** ¿Sirve este objeto (0: la mano vacía) con el alay? undefined si no es un alay. */
export function allayCanInteract(e: ClientEntity, item: number): boolean | undefined {
  if (e.type !== MOB_ALLAY) return undefined;
  if (item === AMETHYST_SHARD && e.flags & EF_ALLAY_DANCING) return true;
  return item ? !e.gear : !!e.gear;
}

/** Atiende un efecto del servidor; false si no es del alay. */
export function allayFx(g: Game, kind: string, p: [number, number, number]): boolean {
  const fx = g.renderer.entities;
  switch (kind) {
    case 'allay_give':
    case 'allay_take':
    case 'allay_throw':
      g.audio.playAllaySfx(kind, p);
      if (kind === 'allay_give') fx.spawnSparkles(p[0], p[1], p[2], 8, 0.4);
      return true;
    case 'allay_pickup':
      g.audio.playAllaySfx(kind, p);
      fx.spawnSparkles(p[0], p[1], p[2], 4, 0.3);
      return true;
    case 'allay_dup':
      g.audio.playAllaySfx(kind, p);
      fx.spawnHearts(p[0], p[1], p[2], 6, 0.5);
      fx.spawnSparkles(p[0], p[1], p[2], 18, 0.8);
      return true;
    default:
      return false;
  }
}
