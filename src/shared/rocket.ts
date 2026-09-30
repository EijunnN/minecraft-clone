// Programa lunar (idea-luna.md): el cohete Selene. Lo que servidor y cliente saben de él sin importar nada del juego:
// el tipo de entidad, sus medidas, las plazas, las fases del vuelo y los perfiles de ascenso y de descenso.
//
// El vuelo lo lleva SIEMPRE el servidor (a diferencia de las barcas, que las guía el cliente): sube por una curva
// cerrada (ascenso) o baja frenando por una velocidad que depende de la altura (descenso), así que dos clientes ven
// lo mismo y no hay nada que validar. Los pasajeros van de plaza: su posición sale del cohete.
//
// El viaje, de punta a punta (en tiempo comprimido; los números que ve el piloto son los de una misión real):
//   cuenta atrás → ascenso hasta ~96 km (el planeta se curva debajo) → [otra dimensión] tránsito: inyección, crucero con la
//   maniobra de giro e inserción en órbita (o reentrada) a 15 km del destino → descenso motorizado → posado.
// El tránsito ya transcurre en la dimensión de destino: el cliente carga su terreno mientras pinta el espacio (voyage.ts).

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
  /** Tránsito entre los dos mundos, ya en la dimensión de destino: el cohete espera quieto en lo alto mientras el cliente
   * pinta el viaje por el espacio y carga el terreno de abajo. */
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
/** Segundos que dura el ascenso. */
export const ASCENT_S = 48;
/** Segundos del tránsito entre los dos mundos (en la dimensión de destino). */
export const COAST_S = 46;

// ------------------------------------------------------------------ ascenso
// Altura h(t) = TOP · g(t) / g(T) con g(t) = e^(kt) − 1 − kt: arranca muy despacio (un cohete pesado despega a paso de hombre:
// ~30 m a los 3 s), coge velocidad y acaba casi fuera de la atmósfera. No pasar de los 100 km del modelo de cielo (atmosphere.ts).
const ASC_TOP = 96_000;
const ASC_K = 0.11;
const ascG = (t: number) => Math.exp(ASC_K * t) - 1 - ASC_K * t;
const ASC_GT = ascG(ASCENT_S);

/** Altura (sobre la plataforma) `t` segundos después del despegue. */
export function ascentHeight(t: number): number {
  if (t <= 0) return 0;
  return (ASC_TOP * ascG(Math.min(t, ASCENT_S))) / ASC_GT;
}

/** Velocidad vertical (bloques/s) `t` segundos después del despegue. */
export function ascentSpeed(t: number): number {
  if (t <= 0) return 0;
  return (ASC_TOP * ASC_K * (Math.exp(ASC_K * Math.min(t, ASCENT_S)) - 1)) / ASC_GT;
}

/** Altura a la que llega el ascenso completo. */
export const ASCENT_TOP = ascentHeight(ASCENT_S);

/**
 * Cuánto se ha desplazado el suelo bajo el cohete en el ascenso (m): el giro gravitatorio lo lleva hacia delante. Es la cifra que
 * mueve el planeta dibujado debajo (no la de una misión real, que a esta escala de tiempo lo haría girar demasiado rápido).
 */
export function ascentDownrange(t: number): number {
  const x = Math.max(0, Math.min(1, t / ASCENT_S));
  return 200_000 * x * x * x;
}

/** Interpolación lineal por tramos en una tabla [x, y] (x creciente). */
function table(t: readonly (readonly [number, number])[], x: number): number {
  if (x <= t[0][0]) return t[0][1];
  for (let i = 1; i < t.length; i++) {
    if (x <= t[i][0]) {
      const [x0, y0] = t[i - 1], [x1, y1] = t[i];
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  return t[t.length - 1][1];
}

// Lo que marca la telemetría en el ascenso según la altura: la velocidad y el tiempo de misión de un lanzamiento real (la primera
// etapa se apaga hacia los 65 km a ~2 km/s; la segunda llega a la velocidad orbital).
const ASC_V: readonly (readonly [number, number])[] = [[0, 0], [100, 38], [1000, 150], [5000, 310], [12000, 480], [30000, 1100], [60000, 2050], [80000, 4200], [96000, 7650]];
const ASC_MET: readonly (readonly [number, number])[] = [[0, 0], [100, 9], [1000, 25], [5000, 48], [12000, 72], [30000, 112], [60000, 162], [80000, 330], [96000, 525]];

/** Telemetría del ascenso a los `t` s del despegue: velocidad (m/s) y tiempo de misión (s) de una misión real a esa altura. */
export function ascentTelemetry(t: number): { speed: number; met: number } {
  const h = ascentHeight(t);
  return { speed: table(ASC_V, h), met: Math.max(t, table(ASC_MET, h)) };
}

/** Tiempo de misión (s) al acabar el ascenso (de ahí sigue el tránsito). */
export const ASCENT_MET = table(ASC_MET, ASC_TOP);

// ------------------------------------------------------------------ descenso
/** Altura (sobre el suelo) desde la que empieza el descenso motorizado (la del final de la órbita baja). */
export const DESCENT_START = 15_000;
/** Velocidad con la que se toca el suelo. */
const DESC_TOUCH = 2.2;

/**
 * Velocidad de bajada (positiva) a la altura `h` sobre el suelo con un motor que frena `decel` bloques/s²: la que permite parar
 * justo al llegar (v = √(2·a·h)) y, en los últimos cien metros, una aproximación lenta que acaba a paso de hombre.
 */
export function descentSpeed(h: number, decel: number): number {
  const brake = Math.sqrt(2 * decel * Math.max(0, h));
  return Math.max(DESC_TOUCH, Math.min(brake, DESC_TOUCH + 0.35 * Math.max(0, h)));
}

/** Un paso del descenso: nueva altura tras `dt` segundos (nunca por debajo de 0). */
export function descentStep(h: number, dt: number, decel: number): number {
  return Math.max(0, h - descentSpeed(h, decel) * dt);
}

/** Frenada de cada mundo (bloques/s²): lo que da ~50 s de descenso desde los 15 km. */
export const DESCENT_DECEL = { moon: 12, earth: 12 } as const;

/**
 * Cuánto le queda al cohete por recorrer en horizontal en el descenso (m): empieza a ~2 km/s de lado, como un módulo lunar al
 * empezar a frenar, y ya cae en vertical por debajo de 1 500 m (donde se empieza a ver el terreno de bloques).
 */
export function descentDownrange(h: number): number {
  const x = Math.max(0, Math.min(1, (h - 1500) / (DESCENT_START - 1500)));
  return 22_000 * x * x;
}

/** Velocidad total (m/s) en el descenso a la altura `h`: la vertical y la horizontal que se lleva el suelo. */
export function descentTelemetrySpeed(h: number, decel: number): number {
  const v = descentSpeed(h, decel);
  const dh = 1;
  const vh = ((descentDownrange(h + dh) - descentDownrange(h)) / dh) * v;
  return Math.hypot(v, vh);
}

// ------------------------------------------------------------------ plazas
/** Posición del pasajero de la plaza `seat` (la cadera) con el cohete en (x, y, z) mirando `yaw`: 2 × 2 en la cabina. */
export function rocketSeatPos(x: number, y: number, z: number, yaw: number, seat: number): [number, number, number] {
  const side = seat % 2 === 0 ? -0.55 : 0.55; // + a la derecha
  const fwd = seat < 2 ? 0.4 : -0.6; // + hacia delante
  const s = Math.sin(yaw), c = Math.cos(yaw);
  // Delante es (−sin, −cos) (como en las barcas) y la derecha (cos, −sin).
  return [x + c * side - s * fwd, y + ROCKET_CABIN_Y, z - s * side - c * fwd];
}
