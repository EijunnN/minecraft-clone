// Programa lunar: los objetos de Factorio que no existen ya en el juego (intermedios, paquetes de ciencia, módulos). Datos puros: los registra
// items.ts (sus ids son los últimos) y los dibuja client/textures/factorioSprites.ts según `shape` y `tint`.
// Las pilas son las de Factorio (data/base/prototypes/item.lua).

export type FShape =
  | 'gear' | 'cable' | 'circuit' | 'stick' | 'pipe' | 'plate' | 'brick' | 'battery' | 'engine' | 'frame' | 'plastic' | 'powder' | 'structure'
  | 'pack' | 'module';

export interface FactorioItemDef {
  /** Nombre del prototipo de Factorio. */
  name: string;
  es: string;
  stack: number;
  shape: FShape;
  /** Color principal [r, g, b] (los paquetes de ciencia y los módulos, el de su tipo). */
  tint: readonly [number, number, number];
  /** Nivel (módulos: 1..3; puntos que se dibujan). */
  level?: number;
}

const RED = [214, 64, 56] as const, GREEN = [88, 176, 84] as const, BLUE = [72, 132, 220] as const, PURPLE = [150, 84, 190] as const, YELLOW = [232, 200, 64] as const;
const MODULE_SPEED = [82, 178, 224] as const, MODULE_PROD = [220, 90, 80] as const, MODULE_EFF = [96, 190, 100] as const;

export const FACTORIO_ITEM_DEFS: readonly FactorioItemDef[] = [
  { name: 'iron-gear-wheel', es: 'Engranaje de hierro', stack: 100, shape: 'gear', tint: [196, 200, 208] },
  { name: 'copper-cable', es: 'Cable de cobre', stack: 200, shape: 'cable', tint: [226, 130, 84] },
  { name: 'electronic-circuit', es: 'Circuito electrónico', stack: 200, shape: 'circuit', tint: [70, 158, 84] },
  { name: 'advanced-circuit', es: 'Circuito avanzado', stack: 200, shape: 'circuit', tint: [190, 66, 60] },
  { name: 'processing-unit', es: 'Unidad de procesamiento', stack: 200, shape: 'circuit', tint: [66, 110, 214] },
  { name: 'iron-stick', es: 'Varilla de hierro', stack: 100, shape: 'stick', tint: [190, 194, 204] },
  { name: 'pipe', es: 'Tubería', stack: 100, shape: 'pipe', tint: [176, 182, 192] },
  { name: 'steel-plate', es: 'Placa de acero', stack: 100, shape: 'plate', tint: [150, 160, 176] },
  { name: 'stone-brick', es: 'Ladrillo de piedra', stack: 100, shape: 'brick', tint: [176, 160, 132] },
  { name: 'battery', es: 'Batería', stack: 200, shape: 'battery', tint: [120, 138, 156] },
  { name: 'engine-unit', es: 'Motor', stack: 50, shape: 'engine', tint: [128, 134, 146] },
  { name: 'electric-engine-unit', es: 'Motor eléctrico', stack: 50, shape: 'engine', tint: [96, 150, 214] },
  { name: 'low-density-structure', es: 'Estructura de baja densidad', stack: 10, shape: 'structure', tint: [232, 196, 96] },
  { name: 'flying-robot-frame', es: 'Armazón de robot volador', stack: 50, shape: 'frame', tint: [150, 172, 200] },
  { name: 'plastic-bar', es: 'Barra de plástico', stack: 100, shape: 'plastic', tint: [236, 236, 232] },
  { name: 'sulfur', es: 'Azufre', stack: 50, shape: 'powder', tint: [232, 214, 72] },
  { name: 'automation-science-pack', es: 'Paquete de ciencia de automatización', stack: 200, shape: 'pack', tint: RED },
  { name: 'logistic-science-pack', es: 'Paquete de ciencia logística', stack: 200, shape: 'pack', tint: GREEN },
  { name: 'chemical-science-pack', es: 'Paquete de ciencia química', stack: 200, shape: 'pack', tint: BLUE },
  { name: 'production-science-pack', es: 'Paquete de ciencia de producción', stack: 200, shape: 'pack', tint: PURPLE },
  { name: 'utility-science-pack', es: 'Paquete de ciencia de utilidad', stack: 200, shape: 'pack', tint: YELLOW },
  { name: 'speed-module', es: 'Módulo de velocidad', stack: 50, shape: 'module', tint: MODULE_SPEED, level: 1 },
  { name: 'speed-module-2', es: 'Módulo de velocidad 2', stack: 50, shape: 'module', tint: MODULE_SPEED, level: 2 },
  { name: 'speed-module-3', es: 'Módulo de velocidad 3', stack: 50, shape: 'module', tint: MODULE_SPEED, level: 3 },
  { name: 'productivity-module', es: 'Módulo de productividad', stack: 50, shape: 'module', tint: MODULE_PROD, level: 1 },
  { name: 'productivity-module-2', es: 'Módulo de productividad 2', stack: 50, shape: 'module', tint: MODULE_PROD, level: 2 },
  { name: 'productivity-module-3', es: 'Módulo de productividad 3', stack: 50, shape: 'module', tint: MODULE_PROD, level: 3 },
  { name: 'efficiency-module', es: 'Módulo de eficiencia', stack: 50, shape: 'module', tint: MODULE_EFF, level: 1 },
  { name: 'efficiency-module-2', es: 'Módulo de eficiencia 2', stack: 50, shape: 'module', tint: MODULE_EFF, level: 2 },
  { name: 'efficiency-module-3', es: 'Módulo de eficiencia 3', stack: 50, shape: 'module', tint: MODULE_EFF, level: 3 },
];

/** Clave del objeto en el juego para un nombre de prototipo de Factorio (guiones bajos). */
export const factorioKey = (name: string): string => 'f_' + name.replace(/-/g, '_');
