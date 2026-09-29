// Programa lunar (idea-luna.md): los bloques del suelo de la Luna (registrados los últimos: ids nuevos).
// - Regolito claro: el suelo de las tierras altas (anortosita: aluminio, silicio y calcio).
// - Regolito oscuro: el de los mares (basalto con ilmenita: hierro, titanio y helio-3).
// - Roca lunar: el fondo de todo, dura.
// - Hielo sucio: el de los cráteres que nunca ven el Sol (agua, carbono y nitrógeno). Aparece en el tercer paso del programa.
import { family } from './registry';

const SHOVEL = (hardness: number) => ({ hardness, tool: 'shovel' as const, tier: 0, sound: 'gravel' as const, category: 'luna' as const });

export const MOON_REGOLITH = family('moon_regolith', 'Regolito claro', [], () => ({ ...SHOVEL(0.6), all: 'moon_regolith' }));
export const MOON_REGOLITH_DARK = family('moon_regolith_dark', 'Regolito oscuro', [], () => ({ ...SHOVEL(0.6), all: 'moon_regolith_dark' }));
export const MOON_ROCK = family('moon_rock', 'Roca lunar', [], () => ({
  hardness: 3, tool: 'pickaxe' as const, tier: 1, sound: 'stone' as const, category: 'luna' as const, all: 'moon_rock',
}));
export const DIRTY_ICE = family('dirty_ice', 'Hielo sucio', [], () => ({
  hardness: 0.7, tool: 'pickaxe' as const, tier: 0, sound: 'glass' as const, category: 'luna' as const, all: 'dirty_ice',
}));

/** Su sitio en el inventario creativo. */
export const MOON_INVENTORY: readonly number[] = [MOON_REGOLITH, MOON_REGOLITH_DARK, MOON_ROCK, DIRTY_ICE];
