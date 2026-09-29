// Programa lunar (idea-luna.md): el cohete Selene. Lo que servidor y cliente saben de él sin importar nada del juego:
// el tipo de entidad, sus medidas, las plazas, las fases del vuelo y los perfiles de ascenso y de descenso.
//
// El vuelo lo lleva SIEMPRE el servidor (a diferencia de las barcas, que las guía el cliente): sube por una curva
// cerrada (ascenso) o baja frenando por una velocidad que depende de la altura (descenso), así que dos clientes ven
// lo mismo y no hay nada que validar. Los pasajeros van de plaza: su posición sale del cohete.

export const ENT_ROCKET = 170;

/** Plazas de la cabina (el piloto es la 0). */
export const ROCKET_SEATS = 4;
/** Medidas de la caja de la entidad (ancho y alto, en bloques): la base de 3 × 3 y 24 de alto. */
export const ROCKET_WIDTH = 3;
export const ROCKET_HEIGHT = 24;
/** Altura de la cabina sobre la base (donde se sientan). */
export const ROCKET_CABIN_Y = 15.5;

/** Fases del vuelo (van en el mensaje 'rocket'). */
export const RK_PHASE = {
  /** En tierra, con o sin pasajeros. */
  IDLE: 0,
  /** Cuenta atrás. */
  COUNTDOWN: 1,
  /** Sube (los motores empujan). */
  ASCENT: 2,
  /** Sin motores, camino de otro mundo: pantalla negra mientras se carga el destino. */
  COAST: 3,
  /** Baja frenando hacia el suelo. */
  DESCENT: 4,
} as const;
export type RocketPhase = (typeof RK_PHASE)[keyof typeof RK_PHASE];

/**
 * Estado de la entidad para los clientes (van en sus flags): la fase y si los motores están encendidos. Se ven sin esperar
 * al mensaje 'rocket', así que quien llega tarde o mira de lejos ve el cohete como está.
 */
export const RF_PHASE_SHIFT = 24;
export const RF_PHASE_MASK = 7 << RF_PHASE_SHIFT;
export const RF_BURN = 1 << 27;

/** Fase de un cohete a partir de los flags de su entidad. */
export function rocketPhaseOf(flags: number): RocketPhase {
  return ((flags & RF_PHASE_MASK) >>> RF_PHASE_SHIFT) as RocketPhase;
}

/** Segundos de cuenta atrás (los motores se encienden en los últimos IGNITION_AT). */
export const COUNTDOWN_S = 10;
export const IGNITION_AT = 3;
/** Segundos que dura el ascenso y altura (sobre la plataforma) a la que se corta el motor. */
export const ASCENT_S = 30;
/** Segundos de tránsito a oscuras entre un mundo y otro. */
export const COAST_S = 4;

// ------------------------------------------------------------------ ascenso
// Velocidad v(t) = V·(1 − e^(−t/T)): arranca despacio (pesa mucho), coge velocidad y se acerca a V. La altura es su
// integral: y(t) = V·(t − T·(1 − e^(−t/T))). Con V = 3 200 (bloques/s, casi 3 km/s) y T = 12, el ascenso de 30 s llega a ~61 km: el
// cielo, que es físico (1 bloque = 1 m), acaba negro y con estrellas. No pasar de los 100 km del modelo de atmósfera.
const ASC_V = 3200;
const ASC_T = 12;

/** Altura (sobre la plataforma) `t` segundos después del despegue. */
export function ascentHeight(t: number): number {
  if (t <= 0) return 0;
  return ASC_V * (t - ASC_T * (1 - Math.exp(-t / ASC_T)));
}

/** Velocidad vertical (bloques/s) `t` segundos después del despegue. */
export function ascentSpeed(t: number): number {
  if (t <= 0) return 0;
  return ASC_V * (1 - Math.exp(-t / ASC_T));
}

/** Altura a la que llega el ascenso completo. */
export const ASCENT_TOP = ascentHeight(ASCENT_S);

// ------------------------------------------------------------------ descenso
/** Altura (sobre el suelo) desde la que se llega y velocidad de crucero antes de frenar (bloques/s). */
export const DESCENT_START = 1200;
const DESC_CRUISE = 70;
/** Velocidad con la que se toca el suelo. */
const DESC_TOUCH = 2.2;

/**
 * Velocidad de bajada (positiva) a la altura `h` sobre el suelo con un motor que frena `decel` bloques/s²: el
 * crucero mientras quede espacio para frenar y, después, la que permite parar justo al llegar (v = √(2·a·h)).
 */
export function descentSpeed(h: number, decel: number): number {
  const brake = Math.sqrt(2 * decel * Math.max(0, h));
  return Math.max(DESC_TOUCH, Math.min(DESC_CRUISE, brake));
}

/** Un paso del descenso: nueva altura tras `dt` segundos (nunca por debajo de 0). */
export function descentStep(h: number, dt: number, decel: number): number {
  return Math.max(0, h - descentSpeed(h, decel) * dt);
}

/** Frenada de cada mundo (bloques/s²): en la Luna, con un sexto de gravedad, se frena con menos. */
export const DESCENT_DECEL = { moon: 6, earth: 9 } as const;

// ------------------------------------------------------------------ plazas
/** Posición del pasajero de la plaza `seat` (la cadera) con el cohete en (x, y, z) mirando `yaw`: 2 × 2 en la cabina. */
export function rocketSeatPos(x: number, y: number, z: number, yaw: number, seat: number): [number, number, number] {
  const side = seat % 2 === 0 ? -0.55 : 0.55; // + a la derecha
  const fwd = seat < 2 ? 0.4 : -0.6; // + hacia delante
  const s = Math.sin(yaw), c = Math.cos(yaw);
  // Delante es (−sin, −cos) (como en las barcas) y la derecha (cos, −sin).
  return [x + c * side - s * fwd, y + ROCKET_CABIN_Y, z - s * side - c * fwd];
}
