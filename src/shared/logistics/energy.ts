// Programa lunar (idea-industria.md): la energía, con los números de Factorio (FACTORIO-REFERENCIA.md §3 y §4).
//
// Cada red eléctrica (los postes unidos por cable y todo lo que tocan con su área de suministro) reparte por separado:
//   • los paneles solares dan hasta PANEL_KW según el brillo del día (perfil de Factorio) y sólo con el cielo abierto;
//   • las máquinas piden su potencia mientras trabajan; los brazos, un poco siempre (drain) y bastante al moverse;
//   • lo que sobra carga los acumuladores; lo que falta lo pone la carga guardada (hasta 300 kW por acumulador);
//   • si aún falta, TODO lo que consume de la red va más lento en la misma proporción (`satisfaction`).
// Unidades: 1 ue = 1 kJ; la potencia va en ue/s (= kW). Cifras de los prototipos de Factorio 2.0.72.

/** Potencia máxima de un panel solar (ue/s) a pleno Sol (`solar-panel.production`). */
export const PANEL_KW = 60;
/** Carga de un acumulador (`accumulator.buffer_capacity` 5 MJ) y lo más rápido que carga o descarga (300 kW). */
export const ACCUMULATOR_CAP = 5000;
export const ACCUMULATOR_RATE = 300;

/** Potencia (ue/s) de cada máquina mientras trabaja (`energy_usage`). */
export const MACHINE_KW = { smelter: 180, extractor: 90 } as const;

/** Postes: alcance del cable (`maximum_wire_distance`) y mitad del lado del área de suministro (`supply_area_distance`). */
export const POLES = {
  small: { reach: 7.5, area: 2.5 },
  medium: { reach: 9, area: 3.5 },
  big: { reach: 32, area: 2 },
  substation: { reach: 18, area: 9 },
} as const;
/** Cables que puede tener un poste como mucho. */
export const POLE_MAX_WIRES = 5;

export interface PowerNet {
  /** Potencia que dan los generadores ahora (ue/s). */
  supply: number;
  /** Potencia que piden las máquinas activas (ue/s). */
  demand: number;
  /** Carga guardada en los acumuladores (ue) y su capacidad total. */
  stored: number;
  cap: number;
  /** Cuántos acumuladores hay (limitan lo rápido que se carga y descarga). */
  accumulators: number;
}

export interface PowerResult {
  /** 0..1: la parte de lo pedido que se cumple (1 = todo). */
  satisfaction: number;
  /** Carga guardada tras el paso (ue). */
  stored: number;
}

/** Un paso de `dt` segundos de una red: reparte lo generado, la carga guardada y lo pedido. */
export function balance(n: PowerNet, dt: number): PowerResult {
  const rate = n.accumulators * ACCUMULATOR_RATE;
  const stored = Math.max(0, Math.min(n.cap, n.stored));
  if (n.demand <= 0) {
    // Nada pide: todo lo que se genera va a los acumuladores.
    return { satisfaction: 1, stored: Math.min(n.cap, stored + Math.min(n.supply, rate) * dt) };
  }
  if (n.supply >= n.demand) {
    const surplus = Math.min(n.supply - n.demand, rate);
    return { satisfaction: 1, stored: Math.min(n.cap, stored + surplus * dt) };
  }
  const missing = n.demand - n.supply;
  const draw = Math.min(missing, rate, stored / dt);
  return { satisfaction: (n.supply + draw) / n.demand, stored: Math.max(0, stored - draw * dt) };
}

/**
 * Brillo del día (0..1) como en Factorio: `daytime` 0 es mediodía. Pleno hasta el 0,25 (dusk), rampa lineal hasta el 0,45 (evening), noche
 * hasta el 0,55 (morning), rampa hasta el 0,75 (dawn) y pleno hasta el final. Media 0,7 → 42 kW de un panel de 60.
 */
export function factorioSun(daytime: number): number {
  const d = ((daytime % 1) + 1) % 1;
  if (d < 0.25 || d >= 0.75) return 1;
  if (d < 0.45) return 1 - (d - 0.25) / 0.2;
  if (d < 0.55) return 0;
  return (d - 0.55) / 0.2;
}

/** Fuerza del Sol en un panel a partir de la fracción del día del juego (0,25 = mediodía). */
export function sunPower(dayFraction: number): number {
  return factorioSun(dayFraction - 0.25);
}
