// Programa lunar: los cinco brazos de Factorio (`inserter`, `fast-inserter`, `long-handed-inserter`, `burner-inserter`,
// `bulk-inserter`; FACTORIO-REFERENCIA.md §2) con los números de sus prototipos.
//
// - Ritmo: una vuelta entera (coger, llevar, soltar y volver) gira 1 vuelta a `rotation_speed` (vueltas por tick de 60 por segundo), o
//   sea 60·rotation_speed vueltas por segundo: básico 0,84/s, largo 1,2, rápido 2,4 (a granel igual), de combustible 0,78. (En Factorio
//   la extensión del brazo añade algo: 0,83 y 2,31 con los cofres; aquí el juego va a 20 ticks por segundo y se usa la vuelta.)
// - Energía: cada movimiento gasta `energy_per_movement` (5 kJ el básico y el largo, 7 el rápido, 20 el de a granel, 50 el de combustible)
//   y una vuelta entera son 3,14 movimientos (calibrado con los 13,2 kW del básico); además gastan `drain` en reposo (0,4 / 0,5 / 1 kW).
//   Los eléctricos van con la red de postes; el de combustible quema lo que se le da (1 hueco de combustible) y puede «chupar» el que
//   lleva a otra parte cuando se le acaba.
// - Alcance: el largo coge a 2 casillas y suelta a 2; los demás, a 1.
// - Capacidad de la mano: 1 objeto para todos; las investigaciones la suben (la de «bulk-inserter» le da +1 al de a granel: 2; las «inserter-
//   capacity-bonus» siguen subiéndola; la 2 y la 7 también la de los demás).
// - Filtros: los cinco tienen `filter_count` 5 (lista blanca o negra).
export interface InserterType {
  key: string;
  name: string;
  /** Casillas a las que coge y suelta. */
  reach: number;
  /** Vueltas por tick de 60 por segundo (`rotation_speed`). */
  rotation: number;
  /** kJ por movimiento (`energy_per_movement`). */
  movementKJ: number;
  /** kW en reposo (`drain`; 0 en el de combustible). */
  drainKw: number;
  /** Objetos que lleva a la vez sin investigaciones. */
  stack: number;
  burner: boolean;
}

/** El orden de las familias de bloque: básico, rápido, largo, de combustible y a granel. */
export const INSERTER_TYPES: readonly InserterType[] = [
  { key: 'inserter', name: 'básico', reach: 1, rotation: 0.014, movementKJ: 5, drainKw: 0.4, stack: 1, burner: false },
  { key: 'inserter_fast', name: 'rápido', reach: 1, rotation: 0.04, movementKJ: 7, drainKw: 0.5, stack: 1, burner: false },
  { key: 'inserter_long', name: 'largo', reach: 2, rotation: 0.02, movementKJ: 5, drainKw: 0.4, stack: 1, burner: false },
  { key: 'inserter_burner', name: 'de combustible', reach: 1, rotation: 0.013, movementKJ: 50, drainKw: 0, stack: 1, burner: true },
  { key: 'inserter_bulk', name: 'a granel', reach: 1, rotation: 0.04, movementKJ: 20, drainKw: 1, stack: 1, burner: false },
];

/** Movimientos de energía que gasta una vuelta entera (calibrado con los 13,2 kW del brazo básico). */
export const MOVEMENTS_PER_CYCLE = 3.14;
/** Ticks del juego (20 por segundo) que dura una vuelta entera de cada tipo. */
export const inserterCycleTicks = (t: InserterType): number => 20 / (60 * t.rotation);
/** kJ que gasta una vuelta entera. */
export const inserterCycleKJ = (t: InserterType): number => MOVEMENTS_PER_CYCLE * t.movementKJ;
/** kW que pide mientras se mueve. */
export const inserterMoveKw = (t: InserterType): number => inserterCycleKJ(t) * 60 * t.rotation;

/** Filtros por brazo y modos del filtro. */
export const INSERTER_FILTERS = 5;
export const FILTER_WHITELIST = 0;
export const FILTER_BLACKLIST = 1;

/** kJ que da un combustible: 50 kJ por cada segundo de `fuel` del objeto (el carbón, 80, da los 4 MJ del de Factorio). */
export const FUEL_KJ_PER_UNIT = 50;
/** Los kJ por debajo de los que el brazo de combustible chupa el combustible que lleva (una vuelta y media). */
export const BURNER_LEECH_BELOW_CYCLES = 1.5;
