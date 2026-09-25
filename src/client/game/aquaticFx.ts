// Efectos de las criaturas acuáticas (fase 6): chapoteos, el pez globo que se hincha, cubos con
// criatura, huevos de tortuga que se agrietan y eclosionan, saltos de rana.
import { TURTLE_EGG } from '../../shared/blocks';
import type { Game } from './Game';

/** Atiende un efecto del servidor; devuelve false si no es de las criaturas acuáticas. */
export function aquaticFx(g: Game, kind: string, p: [number, number, number]): boolean {
  const fx = g.renderer.entities;
  switch (kind) {
    case 'splash':
      g.audio.playSplash(p, 0.6);
      fx.spawnSmoke(p[0], p[1], p[2], 10, 0.4, 0.92, 0.35, 1.6);
      return true;
    case 'puffer_inflate':
      g.audio.playSplash(p, 0.25);
      fx.spawnSmoke(p[0], p[1], p[2], 5, 0.3, 0.95, 0.25, 0.6);
      return true;
    case 'bucket_fill_fish':
    case 'bucket_empty_fish':
      g.audio.playSplash(p, 0.45);
      return true;
    case 'turtle_egg_crack':
      g.audio.playBlockHit('stone', p);
      return true;
    case 'turtle_egg_hatch':
      g.audio.playBreak('stone', p);
      fx.spawnBreak(Math.floor(p[0]), Math.floor(p[1]), Math.floor(p[2]), TURTLE_EGG, 0xf0);
      return true;
    case 'turtle_lay_egg':
      g.audio.playPlace('sand', p);
      return true;
    case 'frog_hop':
    case 'tadpole_grow':
      g.audio.playPlace('grass', p);
      return true;
  }
  return false;
}
