// Fase 7 (pociones): lo que el servidor sabe de los efectos de cada jugador (los lleva su cliente).
// Invisible (bit de estado que manda con su posición: las criaturas lo ven de mucho más cerca, menos
// cuanta más armadura lleve), el color de sus remolinos (se reenvía a los demás) y, del último estado
// guardado, sus efectos y su vida (las brujas eligen qué poción lanzar según eso).
import { STATE_INVISIBLE } from '../../potions';
import type { PlayerView } from '../entities';
import type { Session } from './context';

/** Campos de la vista del jugador que dependen de sus efectos. */
export function potionView(s: Session): Pick<PlayerView, 'invisible' | 'armorPieces' | 'fx' | 'hp'> {
  return {
    invisible: (s.s & STATE_INVISIBLE) !== 0,
    armorPieces: s.a.filter((id) => id > 0).length,
    fx: new Set((s.save?.fx ?? []).map(([id]) => id)),
    hp: s.save?.hp,
  };
}

/** Color de los remolinos que manda el cliente (0xRRGGBB; 0 sin efectos). */
export function effectColorFrom(v: unknown): number {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 && n <= 0xffffff ? n : 0;
}

