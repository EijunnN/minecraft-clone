// Programa lunar: el tránsito entre la Tierra y la Luna tal como se ve desde la cabina (sin nada del juego: sólo geometría).
//
// Los tamaños y las distancias son los reales (km): la Tierra de 6 371 km de radio, la Luna de 1 737 km, a 384 400 km una de otra.
// Lo que se comprime es el tiempo: el viaje de tres días dura COAST_S segundos, y la distancia avanza en escala logarítmica (cada
// duplicación cuesta lo mismo), así que el planeta de salida se va encogiendo a ritmo constante y el de llegada crece igual.
//
// Hay tres marcos:
// - el del juego (x, y, z del mundo; y hacia arriba), en el que mira el jugador;
// - el inercial: el cuerpo de salida A en el origen y el de llegada B en (D, 0, 0);
// - el de cada cuerpo (sus ejes), para pintar su superficie siempre igual.
// Al empezar, el marco del juego es el del sitio de salida (A debajo, B donde se veía en su cielo); al acabar, el del sitio de
// llegada (B debajo, A donde se ve en el cielo de B). Entre medias la nave gira («maniobra de giro») de uno a otro.

export type Vec3 = [number, number, number];

export const R_EARTH = 6371;
export const R_MOON = 1737.4;
export const EARTH_MOON = 384_400;
const MU_EARTH = 398_600.4;
const MU_MOON = 4_902.8;
/** Altura (km) a la que acaba el ascenso y a la que empieza el descenso (las de rocket.ts). */
const ALT_START = 96;
const ALT_END = 15;

/**
 * Dónde se ve la Luna desde la Tierra para el viaje: a 75° del Sol, hacia lo alto del cielo. Así, desde la nave, la Tierra que se
 * queda atrás se ve casi llena y la Luna que se acerca, en cuarto (con el terminador y las sombras largas de sus cráteres). La Luna
 * del cielo del juego está siempre frente al Sol (llena): desde ella la Tierra se vería «nueva», a oscuras.
 */
export function moonForVoyage(sun: Vec3): Vec3 {
  const s = normalize(sun);
  let p = sub([0, 1, 0], scale(s, s[1]));
  if (Math.hypot(p[0], p[1], p[2]) < 1e-3) p = [1, 0, 0];
  p = normalize(p);
  const a = (75 * Math.PI) / 180;
  return normalize(add(scale(s, Math.cos(a)), scale(p, Math.sin(a))));
}

/** Dirección fija de la Tierra en el cielo de la Luna (la Luna le da siempre la misma cara). */
export const EARTH_IN_MOON_SKY: Vec3 = normalize([0.34, 0.62, -0.71]);

// ------------------------------------------------------------------ vectores y rotaciones (matrices 3 × 3 por columnas)
function normalize(v: Vec3): Vec3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];

/** Matriz por columnas: m[0..2] = imagen del eje X, m[3..5] = del Y, m[6..8] = del Z. */
export type Mat3 = number[];

function mulMV(m: Mat3, v: Vec3): Vec3 {
  return [m[0] * v[0] + m[3] * v[1] + m[6] * v[2], m[1] * v[0] + m[4] * v[1] + m[7] * v[2], m[2] * v[0] + m[5] * v[1] + m[8] * v[2]];
}
/** Traspuesta por un vector (la inversa de una rotación). */
function mulMtV(m: Mat3, v: Vec3): Vec3 {
  return [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];
}
function mulMM(a: Mat3, b: Mat3): Mat3 {
  const c = (i: number): Vec3 => mulMV(a, [b[i * 3], b[i * 3 + 1], b[i * 3 + 2]]);
  return [...c(0), ...c(1), ...c(2)];
}
function transpose(m: Mat3): Mat3 {
  return [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
}

/** Base ortonormal con `up` como eje Y y `fwd` (sólo su parte perpendicular) como eje X. */
function basis(up: Vec3, fwd: Vec3): Mat3 {
  const u = normalize(up);
  let f = sub(fwd, scale(u, dot(fwd, u)));
  if (Math.hypot(f[0], f[1], f[2]) < 1e-6) f = Math.abs(u[0]) < 0.9 ? sub([1, 0, 0], scale(u, u[0])) : sub([0, 0, 1], scale(u, u[2]));
  const x = normalize(f);
  const z = cross(x, u);
  return [...x, ...u, ...z];
}

type Quat = [number, number, number, number];

function matToQuat(m: Mat3): Quat {
  const [m00, m10, m20, m01, m11, m21, m02, m12, m22] = m;
  const tr = m00 + m11 + m22;
  let q: Quat;
  if (tr > 0) {
    const s = Math.sqrt(tr + 1) * 2;
    q = [(m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s, s / 4];
  } else if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
    q = [s / 4, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s];
  } else if (m11 > m22) {
    const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
    q = [(m01 + m10) / s, s / 4, (m12 + m21) / s, (m02 - m20) / s];
  } else {
    const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
    q = [(m02 + m20) / s, (m12 + m21) / s, s / 4, (m10 - m01) / s];
  }
  return q;
}

function quatToMat(q: Quat): Mat3 {
  const [x, y, z, w] = q;
  return [
    1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w),
    2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w),
    2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y),
  ];
}

function slerpQ(a: Quat, b: Quat, t: number): Quat {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  let bb: Quat = b;
  if (d < 0) {
    d = -d;
    bb = [-b[0], -b[1], -b[2], -b[3]];
  }
  if (d > 0.9995) {
    const r: Quat = [a[0] + (bb[0] - a[0]) * t, a[1] + (bb[1] - a[1]) * t, a[2] + (bb[2] - a[2]) * t, a[3] + (bb[3] - a[3]) * t];
    const l = Math.hypot(...r);
    return [r[0] / l, r[1] / l, r[2] / l, r[3] / l];
  }
  const th = Math.acos(d), s = Math.sin(th);
  const ka = Math.sin((1 - t) * th) / s, kb = Math.sin(t * th) / s;
  return [a[0] * ka + bb[0] * kb, a[1] * ka + bb[1] * kb, a[2] * ka + bb[2] * kb, a[3] * ka + bb[3] * kb];
}

function slerpV(a: Vec3, b: Vec3, t: number): Vec3 {
  const d = Math.max(-1, Math.min(1, dot(a, b)));
  const th = Math.acos(d);
  if (th < 1e-6) return a;
  const s = Math.sin(th);
  return normalize(add(scale(a, Math.sin((1 - t) * th) / s), scale(b, Math.sin(t * th) / s)));
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Rotación de `angle` radianes alrededor del eje Z. */
export function rotZ(angle: number): Mat3 {
  const c = Math.cos(angle), s = Math.sin(angle);
  return [c, s, 0, -s, c, 0, 0, 0, 1];
}

// ------------------------------------------------------------------ el tránsito

/** Un cuerpo visto desde la cámara: centro (km, en el marco del juego, relativo a la cámara), radio y sus ejes en el marco del juego. */
export interface BodyView {
  c: Vec3;
  r: number;
  axes: Mat3;
}

/** Momentos del tránsito (para la cabina). */
export type TransitStage = 'sep' | 'inject' | 'coast' | 'flip' | 'capture' | 'orbit' | 'reentry';

export interface TransitView {
  earth: BodyView;
  moon: BodyView;
  /** Dirección del Sol en el marco del juego (fijo respecto a las estrellas mientras la nave gira). */
  sun: Vec3;
  /** Avance del viaje (0: en la órbita de salida; 1: en la de llegada). */
  u: number;
  stage: TransitStage;
  /** Motores (0..1): la inyección y la frenada de llegada. */
  burn: number;
  /** Plasma de la reentrada en la Tierra (0..1). */
  plasma: number;
  /** Altura sobre la Tierra y sobre la Luna (km, sobre su superficie). */
  altEarth: number;
  altMoon: number;
  /** Velocidad respecto al cuerpo más cercano (km/s). */
  speed: number;
  /** Tiempo de misión (s) y aceleración del tiempo (segundos de misión por segundo de juego). */
  met: number;
  warp: number;
}

export interface TransitSetup {
  /** ¿Va a la Luna (desde la Tierra) o vuelve? */
  toMoon: boolean;
  /** Duración del tránsito (s). */
  duration: number;
  /** Dirección (marco del juego) en la que se veía el cuerpo de llegada desde el sitio de salida, y el de salida desde el de llegada. */
  startOther: Vec3;
  endOther: Vec3;
  /** Ejes de cada cuerpo en el marco del sitio de salida y en el de llegada (su giro; la identidad si no gira). */
  departAxes: Mat3;
  arriveAxes: Mat3;
  /** Tiempo de misión al empezar el tránsito (s). */
  met0: number;
}

/** Segundos de «separación de etapa» antes de la inyección y de órbita baja al final, antes del descenso. */
const T_SEP = 1.2;
export const TRANSIT_HOLD = 4;
const T_HOLD = TRANSIT_HOLD;

/** Avance del viaje (0..1) a los `tau` s del tránsito: más despacio cerca de los planetas, deprisa por el medio vacío. */
export function transitProgress(tau: number, duration: number): number {
  const x = Math.max(0, Math.min(1, (tau - T_SEP) / (duration - T_SEP - T_HOLD)));
  return x + 0.6 * (x * x * (3 - 2 * x) - x);
}

/** Tiempo de misión del tránsito: tres días de viaje, casi todos lejos de los dos planetas (en el medio del avance). */
function transitMet(u: number): number {
  return 3 * 86_400 * 0.5 * (1 - Math.cos(Math.PI * u));
}

/**
 * Lo que se ve a los `tau` s del tránsito: dónde están la Tierra y la Luna respecto a la cámara (km) y cómo están giradas, dónde está
 * el Sol, más la telemetría (altura, velocidad y tiempo de misión reales). `sun`: la dirección del Sol en el cielo de ahora (marco del
 * juego); al salir y al llegar coincide con ella, y entre medias queda quieto respecto a las estrellas mientras la nave gira.
 */
export function transitView(tau: number, s: TransitSetup, sun: Vec3 = [0, 1, 0]): TransitView {
  const RA = s.toMoon ? R_EARTH : R_MOON;
  const RB = s.toMoon ? R_MOON : R_EARTH;
  const D = EARTH_MOON;
  const u = transitProgress(tau, s.duration);
  // Sitios de salida y de llegada: en cada cuerpo, donde el otro se ve a la misma altura en el cielo que en el juego.
  const a0 = Math.acos(Math.max(-1, Math.min(1, normalize(s.startOther)[1])));
  const a1 = Math.acos(Math.max(-1, Math.min(1, normalize(s.endOther)[1])));
  // (Con paralaje: desde el sitio, a un radio del centro, el otro cuerpo no se ve exactamente en la dirección de los centros.)
  let th0 = a0, th1 = a1;
  for (let i = 0; i < 4; i++) {
    const p0 = [Math.cos(th0) * (RA + ALT_START), Math.sin(th0) * (RA + ALT_START)];
    th0 = a0 - Math.atan2(p0[1], D - p0[0]);
    const p1 = [Math.cos(th1) * (RB + ALT_END), Math.sin(th1) * (RB + ALT_END)];
    th1 = a1 - Math.atan2(p1[1], D - p1[0]);
  }
  const n0: Vec3 = [Math.cos(th0), Math.sin(th0), 0];
  const n1: Vec3 = [-Math.cos(th1), Math.sin(th1), 0];
  // Distancia al centro de A en el punto medio: donde los dos se ven del mismo tamaño.
  const dMid = (D * RA) / (RA + RB);
  let C: Vec3;
  if (u <= 0.5) {
    const alt = ALT_START * Math.pow((dMid - RA) / ALT_START, u / 0.5);
    C = scale(slerpV(n0, [1, 0, 0], smooth(0, 0.3, u)), RA + alt);
  } else {
    const alt = ALT_END * Math.pow((D - dMid - RB) / ALT_END, (1 - u) / 0.5);
    C = add([D, 0, 0], scale(slerpV([-1, 0, 0], n1, smooth(0.7, 1, u)), RB + alt));
  }
  // Orientación: al salir, Y es la vertical del sitio de salida y B está donde se veía; al llegar, igual con el sitio de llegada.
  const C0 = scale(n0, RA + ALT_START);
  const C1 = add([D, 0, 0], scale(n1, RB + ALT_END));
  const R0 = mulMM(basis(n0, sub([D, 0, 0], C0)), transpose(basis([0, 1, 0], s.startOther)));
  const R1 = mulMM(basis(n1, scale(C1, -1)), transpose(basis([0, 1, 0], s.endOther)));
  const turn = smooth(0.3, 0.7, u);
  const R = quatToMat(slerpQ(matToQuat(R0), matToQuat(R1), turn));
  const sunI = slerpV(normalize(mulMV(R0, sun)), normalize(mulMV(R1, sun)), turn);
  const sunG = normalize(mulMtV(R, sunI));
  // Cada cuerpo: en el inercial, A lleva los ejes que tenía en el sitio de salida y B los que tendrá en el de llegada.
  const A: BodyView = { c: mulMtV(R, scale(C, -1)), r: RA, axes: mulMM(transpose(R), mulMM(R0, s.departAxes)) };
  const B: BodyView = { c: mulMtV(R, sub([D, 0, 0], C)), r: RB, axes: mulMM(transpose(R), mulMM(R1, s.arriveAxes)) };
  const rA = Math.hypot(...C), rB = Math.hypot(...sub(C, [D, 0, 0]));
  // Motores y momentos.
  const inject = smooth(T_SEP, T_SEP + 0.8, tau) * (1 - smooth(T_SEP + 5.2, T_SEP + 6, tau));
  const capStart = s.duration - T_HOLD - 8;
  const capture = s.toMoon ? smooth(capStart, capStart + 0.8, tau) * (1 - smooth(capStart + 5.4, capStart + 6.2, tau)) : 0;
  const plasma = s.toMoon ? 0 : smooth(s.duration - 9, s.duration - 6, tau);
  const stage: TransitStage =
    tau < T_SEP ? 'sep'
    : tau < T_SEP + 6 ? 'inject'
    : !s.toMoon && tau > s.duration - 9 ? 'reentry'
    : tau >= s.duration - T_HOLD ? 'orbit'
    : s.toMoon && tau >= capStart ? 'capture'
    : u > 0.36 && u < 0.64 ? 'flip'
    : 'coast';
  // Velocidad: la órbita de transferencia (vis-viva) cerca del de salida y la hipérbola de llegada cerca del otro; al llegar a la Luna,
  // la frenada deja la velocidad de la órbita baja.
  const muA = s.toMoon ? MU_EARTH : MU_MOON, muB = s.toMoon ? MU_MOON : MU_EARTH;
  const rp = RA + ALT_START;
  const vPark = Math.sqrt(muA / rp);
  const vTrans = Math.sqrt(Math.max(0, muA * (2 / rA - 2 / (rp + D))));
  const vDep = s.toMoon ? vTrans : Math.sqrt(0.64 + (2 * muA) / rA); // desde la Luna, una hipérbola de escape con v∞ de 0,8 km/s
  const vArr = Math.sqrt(0.72 + (2 * muB) / rB);
  const soi = s.toMoon ? 66_000 : 0.9 * D;
  let speed = rB < soi ? vArr : vDep;
  speed = vPark + (speed - vPark) * smooth(T_SEP, T_SEP + 6, tau);
  if (s.toMoon) speed = speed + (Math.sqrt(muB / (RB + ALT_END)) - speed) * smooth(capStart, capStart + 6.2, tau);
  else speed = speed + (0.6 - speed) * smooth(s.duration - 8, s.duration - 0.5, tau); // el aire frena la cápsula
  const met = s.met0 + transitMet(u) + tau;
  const du = 0.02;
  const warp = Math.max(1, (transitMet(transitProgress(tau + du, s.duration)) - transitMet(u)) / du + 1);
  const earth = s.toMoon ? A : B;
  const moon = s.toMoon ? B : A;
  return {
    earth, moon, sun: sunG, u, stage, burn: Math.max(inject, capture), plasma,
    altEarth: (s.toMoon ? rA : rB) - R_EARTH, altMoon: (s.toMoon ? rB : rA) - R_MOON, speed, met, warp,
  };
}

/** La Tierra vista desde el suelo de la Luna: a su distancia real en la dirección fija, girando despacio (un día cada `dayS`). */
export function earthFromMoon(timeS: number, dayS = 1200): BodyView {
  const c = scale(EARTH_IN_MOON_SKY, EARTH_MOON);
  const spin = (timeS / dayS) * Math.PI * 2;
  // Eje de giro: casi perpendicular a la línea de visión, para que los continentes pasen de un lado al otro.
  const cs = Math.cos(spin), sn = Math.sin(spin);
  const axes: Mat3 = [cs, 0, -sn, 0, 1, 0, sn, 0, cs];
  return { c, r: R_EARTH, axes };
}

/** La Luna bajo los pies (en la Luna, a `altKm` sobre su suelo): su centro justo debajo y sus ejes los del juego. */
export function moonBelow(altKm: number): BodyView {
  return { c: [0, -(R_MOON + altKm), 0], r: R_MOON, axes: [1, 0, 0, 0, 1, 0, 0, 0, 1] };
}

/**
 * La Tierra bajo los pies (a `altKm` sobre su suelo), girada según lo que haya avanzado la nave sobre ella (`shiftM`, metros hacia
 * +x): lo que había a esa distancia hacia +x queda ahora debajo (igual que el desplazamiento del suelo de la Luna en los shaders).
 */
export function earthBelow(altKm: number, shiftM: number): BodyView {
  return { c: [0, -(R_EARTH + altKm), 0], r: R_EARTH, axes: earthShiftAxes(shiftM) };
}

/** Ejes de la Tierra tras avanzar `shiftM` metros hacia +x sobre ella. */
export function earthShiftAxes(shiftM: number): Mat3 {
  return rotZ(-shiftM / 1000 / R_EARTH);
}
