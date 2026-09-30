// Programa lunar (meteors.ts): lo que dejan los meteoritos del Errante. Registrados los últimos: ids nuevos. Sin texturas nuevas (quedan
// muy pocas capas libres): la roca negra del basalto negro y el brillo violeta de la obsidiana llorosa.
// - Meteorito: la roca que queda en el fondo del cráter; con un pico de hierro suelta fragmentos del Errante.
// - Núcleo del meteorito: el del grande de la Primera Lluvia; brilla y guarda el Corazón del Ancla y los Planos de Selene (los suelta al
//   romperlo con cualquier pico: nadie se queda sin cohete por no tener el pico adecuado).
import { family } from './registry';

export const METEORITE = family('meteorite', 'Meteorito', [], () => ({
  all: 'blackstone', hardness: 6, tool: 'pickaxe' as const, tier: 2, sound: 'stone' as const, category: 'luna' as const,
}));
export const METEOR_CORE = family('meteor_core', 'Núcleo del meteorito', [], () => ({
  all: 'crying_obsidian', hardness: 4, tool: 'pickaxe' as const, tier: 0, sound: 'stone' as const, category: 'luna' as const, emission: 12,
}));

/** Su sitio en el inventario creativo. */
export const METEOR_INVENTORY: readonly number[] = [METEORITE, METEOR_CORE];
