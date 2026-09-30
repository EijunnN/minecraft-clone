// Programa lunar (idea-luna.md §1, «La caída del Ancla»): las lluvias de meteoritos del Errante. Lo que servidor y cliente saben sin nada
// del juego: el calendario, cuántos meteoritos trae cada lluvia, de dónde vienen y cuánto tardan en caer.
//
// El Dragón era el Ancla: mantenía este mundo escondido. Al matarlo, algo nos encuentra: el Errante, un punto rojizo que aparece en el
// cielo y crece con cada lluvia. Nadie sabe qué es (es el siguiente mundo, después de la Luna).
// - La Primera Lluvia llega al morir el Dragón (en cuanto hay alguien en el mundo normal): aviso de 2 minutos, 40 meteoritos y, al final,
//   el más grande, que trae dentro el Núcleo (el Corazón del Ancla y los Planos de Selene: con ellos se fabrica el cohete).
// - Luego, una lluvia cada SHOWER_EVERY_S segundos jugados (sólo cuenta con gente en el mundo normal: el servidor no avanza sin nadie),
//   con 5 minutos de aviso; cada una algo más fuerte que la anterior.
// - Los meteoritos rompen lo que pillan (explosión) y dejan un cráter con fuego, magma y un meteorito (fragmentos del Errante).

import { DAY_LENGTH_SECONDS } from './constants';

/** Segundos jugados entre una lluvia y la siguiente: 3 días de juego (una hora). */
export const SHOWER_EVERY_S = 3 * DAY_LENGTH_SECONDS;
/** Aviso antes de los impactos: el de la Primera Lluvia y el de las demás (s). */
export const WARN_FIRST_S = 120;
export const WARN_S = 300;
/** Segundos que tarda un meteorito desde que se ve hasta el impacto. */
export const FLIGHT_S = 3.2;
/** Distancia (bloques) desde la que se le ve venir. */
const FLIGHT_DIST = 420;
/** Fases de la lluvia (van en el mensaje 'meteors'). */
export const MT_PHASE = { CALM: 0, WARNING: 1, IMPACTS: 2 } as const;
export type MeteorPhase = (typeof MT_PHASE)[keyof typeof MT_PHASE];

/** Dirección del Errante en el cielo (fija: los meteoritos llegan desde ahí). */
export const ERRANTE_DIR: readonly [number, number, number] = (() => {
  const v = [0.62, 0.52, -0.59];
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l] as const;
})();

/** Tamaño aparente del Errante (0 invisible … 1 lo más grande) tras `n` lluvias. */
export function erranteSize(awake: boolean, n: number): number {
  if (!awake) return 0;
  return Math.min(1, 0.25 + 0.075 * n);
}

/** Un meteorito de una lluvia: cuándo cae (s desde el primer impacto), a qué distancia del jugador elegido y su potencia de explosión. */
export interface MeteorPlan {
  at: number;
  /** Distancia horizontal al jugador (bloques). */
  dist: number;
  power: number;
  /** El último de la Primera Lluvia: el grande, con el Núcleo. */
  core: boolean;
}

/**
 * La lluvia número `n` (0 = la Primera). La Primera trae 40 en 70 s y termina con el grande; las siguientes, de 12 a 36 en 40–60 s. La
 * potencia va de 2 (una roca que rompe poco) a 5 (más que una dinamita); el grande, 7. Los más fuertes caen más lejos al principio.
 */
export function showerPlan(n: number, rand: () => number): MeteorPlan[] {
  const first = n === 0;
  const count = first ? 40 : Math.min(36, 12 + 4 * n);
  const span = first ? 70 : Math.min(60, 40 + 4 * n);
  const out: MeteorPlan[] = [];
  for (let i = 0; i < count; i++) {
    // Van a más: al principio pocos y pequeños; hacia el final, seguidos y grandes.
    const x = (i + rand() * 0.8) / count;
    const at = span * Math.sqrt(x);
    const power = 2 + Math.min(3, (first ? 2.2 : 1.6 + 0.2 * n) * x + rand() * 1.4);
    const dist = 22 + rand() * 40 + (power > 4 ? 6 : 0);
    out.push({ at, dist, power, core: false });
  }
  out.sort((a, b) => a.at - b.at);
  if (first) out.push({ at: span + 6, dist: 34, power: 7, core: true });
  return out;
}

/** Punto (bloques) desde el que se ve venir un meteorito que cae en `to`: en la dirección del Errante, un poco desviado. */
export function meteorStart(to: readonly [number, number, number], jitter: readonly [number, number]): [number, number, number] {
  const d = ERRANTE_DIR;
  // Perpendiculares a la dirección, para que no lleguen todos por la misma línea.
  const ux = -d[2], uz = d[0];
  const ul = Math.hypot(ux, uz) || 1;
  const k = FLIGHT_DIST;
  return [
    to[0] + d[0] * k + (ux / ul) * jitter[0] * 60,
    to[1] + Math.max(0.35, d[1]) * k + jitter[1] * 30,
    to[2] + d[2] * k + (uz / ul) * jitter[0] * 60,
  ];
}

/** Posición de un meteorito `t` segundos después de aparecer (de `from` a `to` en FLIGHT_S, acelerando un poco al final). */
export function meteorAt(from: readonly number[], to: readonly number[], t: number): [number, number, number] {
  const x = Math.max(0, Math.min(1, t / FLIGHT_S));
  const k = x * (0.75 + 0.25 * x);
  return [from[0] + (to[0] - from[0]) * k, from[1] + (to[1] - from[1]) * k, from[2] + (to[2] - from[2]) * k];
}

/** Lo que dice la radio (la Estación Selene) al caer el Ancla: [segundos desde la muerte del Dragón, texto]. */
export const RADIO_AWAKEN: readonly (readonly [number, string])[] = [
  [3, '…ksss… aquí Estación Selene… ¿alguien me copia?…'],
  [9, '…el Ancla cayó. Repito: el Ancla cayó…'],
  [15, '…sin ella ya no están ocultos. Los vio. El Errante los vio…'],
  [22, '…vienen piedras del cielo. Busquen refugio bajo tierra…'],
  [30, '…lo que les mando va en la más grande. Encuéntrenla. Suban a la Luna…'],
];

/** La radio cuando empieza cada lluvia (la n-ésima, desde la segunda). */
export function radioWarning(n: number): string {
  const lines = [
    '…Selene a Tierra: el Errante vuelve a pasar. Prepárense…',
    '…otra lluvia en camino. Cada vez está más cerca…',
    '…no dejen nada importante a cielo abierto…',
    '…el Errante crece en el cielo. No sabemos qué es. Todavía…',
  ];
  return lines[(n - 1) % lines.length];
}

/** Estado guardado del sistema (lo que va en la metainformación del mundo normal). */
export interface MeteorSave {
  /** El Ancla cayó (el Dragón murió). */
  awake: boolean;
  /** Lluvias que ya han caído. */
  n: number;
  /** Segundos jugados desde la última lluvia (o desde que se despertó). */
  clock: number;
  /** Apagado con /meteoritos off. */
  off: boolean;
  /** Ya cayó el Núcleo de la Primera Lluvia. */
  core: boolean;
}

export const METEOR_SAVE_DEFAULT: MeteorSave = { awake: false, n: 0, clock: 0, off: false, core: false };

/** Lee lo guardado sin fiarse (valores por defecto para lo que falte). */
export function readMeteorSave(raw: string | null | undefined): MeteorSave {
  try {
    const o = JSON.parse(raw ?? '{}') as Partial<MeteorSave>;
    return {
      awake: !!o.awake, n: Number.isInteger(o.n) && (o.n as number) >= 0 ? (o.n as number) : 0,
      clock: Number.isFinite(o.clock) ? Math.max(0, o.clock as number) : 0, off: !!o.off, core: !!o.core,
    };
  } catch {
    return { ...METEOR_SAVE_DEFAULT };
  }
}

/** Los Planos de Selene: el libro que viene en el Núcleo (páginas de 256 caracteres como mucho, las de un libro escrito). */
export const SELENE_PLANS_PAGES: readonly string[] = [
  'PLANOS DE SELENE\n\nA quien encuentre esto:\n\nel Ancla cayó y ya no están ocultos. Lo que les mandamos en esta piedra es lo último que quedaba de ella: su Corazón.\n\nCon él se enciende un cohete.',
  'EL COHETE SELENE\n\n3 Etapas de cohete\n1 Corazón del Ancla\n50 de carbón (propelente)\n\nSe monta a mano (tecla C) o en una ensambladora. Se pone en el suelo con clic derecho.',
  'ETAPA DE COHETE\n\n20 placas de acero\n10 circuitos electrónicos\n10 tuberías\n10 engranajes de hierro\n\nEl acero sale del hierro en el horno (hay que investigarlo antes: tecla G).',
  'EN LA LUNA\n\nSin aire. Lleven el traje entero (las cuatro piezas) y botellas de oxígeno. La cabina del cohete las rellena.\n\nEl agua está en el hielo de los cráteres del polo.',
  'EL ERRANTE\n\nNo sabemos qué es. Lo vigilábamos desde Selene cuando el Ancla aún nos escondía.\n\nVolverá a pasar. Cada vez más cerca.\n\nSuban. Los esperamos.\n\n— Estación Selene',
];
