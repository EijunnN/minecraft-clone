// Programa lunar: cómo se orientan al colocarlos los bloques de la logística (lo usan placement.ts en el cliente, que lo predice,
// y el servidor, que lo aplica). La cinta avanza hacia donde mira el jugador; su forma (recta o curva) la calcula luego el servidor
// según las cintas de alrededor (Belts).
import {
  BELTS, INSERTERS, UNDERGROUNDS, SPLITTERS, UNDERGROUND_MAX, POLE_SMALL, POLE_MEDIUM, beltState, inserterState, undergroundState, beltInfo,
  inserterInfo, undergroundInfo, splitterInfo, PIPE_TO_GROUND, OFFSHORE_PUMP, undergroundPipeState, undergroundPipeDir, isUndergroundPipe, isOffshorePump,
  offshorePumpDir, familyBase, multiOf, multiInfo, multiFootprint, multiControllerPos, BLOCK_REPLACEABLE, BLOCK_FLUID,
} from './blocks';
import { BELT_DX, BELT_DZ } from './logistics/belts';
import { MIN_Y, MAX_Y } from './constants';
import type { Edit, PlaceHit } from './placement';

/** Sentido de marcha (0 +x, 1 +z, 2 −x, 3 −z) más cercano a la dirección horizontal en la que mira el jugador. */
export function lookDir(yaw: number): number {
  const dx = -Math.sin(yaw), dz = -Math.cos(yaw);
  if (Math.abs(dx) >= Math.abs(dz)) return dx > 0 ? 0 : 2;
  return dz > 0 ? 1 : 3;
}

/** Ángulo de mirada (yaw) que da cada sentido de marcha: lookDir(dirYaw(d)) === d. */
const YAW_FOR_DIR = [-Math.PI / 2, Math.PI, Math.PI / 2, 0] as const;
export const dirYaw = (dir: number): number => YAW_FOR_DIR[((dir % 4) + 4) % 4];

/**
 * Lo que es una subterránea nueva puesta en (x, y, z) con el sentido `dir`: la SALIDA (1) de una entrada que la tenga a menos de su
 * alcance y aún no tenga salida, o una ENTRADA (0) si no (como en Factorio: colocas una y la siguiente en línea la cierra).
 */
export function undergroundKindFor(get: (x: number, y: number, z: number) => number, tier: number, dir: number, x: number, y: number, z: number): number {
  const max = UNDERGROUND_MAX[tier];
  for (let i = 1; i <= max; i++) {
    const bx = x - BELT_DX[dir] * i, bz = z - BELT_DZ[dir] * i;
    const u = undergroundInfo(get(bx, y, bz));
    if (!u || u.dir !== dir || u.tier !== tier) continue;
    if (u.kind === 1) return 0; // antes hay una salida: ésta es una entrada nueva
    // Una entrada: si ya tiene salida entre ella y aquí, ésta no es su pareja.
    for (let j = 1; j < i; j++) {
      const m = undergroundInfo(get(bx + BELT_DX[dir] * j, y, bz + BELT_DZ[dir] * j));
      if (m && m.dir === dir && m.tier === tier) return 0;
    }
    return 1;
  }
  return 0;
}

/**
 * Sustituir lo que hay en (x, y, z) por una pieza mejor del mismo tipo con un clic encima, como el «fast replace» de Factorio: cintas,
 * subterráneas y divisores de otro nivel, brazos de otro tipo y postes pequeños por medianos (y al revés). Sólo cuando cambia el
 * nivel o el tipo: con el mismo, un clic sobre una cinta sigue poniendo la siguiente a su lado (así se alargan las filas). Las cintas y
 * los brazos toman el sentido con que se ponen ahora; las subterráneas y los divisores conservan el suyo. undefined si no es un caso de
 * éstos (sigue la colocación normal).
 */
export function planFastReplace(
  hit: PlaceHit, base: number, yaw: number,
): Edit[] | undefined {
  const cur = hit.id, x = hit.x, y = hit.y, z = hit.z;
  const b = familyBase(base);
  const dir = lookDir(yaw);
  const cb = beltInfo(cur);
  if (cb && BELTS.includes(b)) {
    const tier = BELTS.indexOf(b);
    if (tier === cb.tier) return undefined;
    return [[x, y, z, beltState(tier, dir, 0)]]; // (la forma la recalcula el servidor)
  }
  const cu = undergroundInfo(cur);
  if (cu && UNDERGROUNDS.includes(b)) {
    const tier = UNDERGROUNDS.indexOf(b);
    if (tier === cu.tier) return undefined;
    return [[x, y, z, undergroundState(tier, cu.dir, cu.kind)]];
  }
  const cs = splitterInfo(cur);
  if (cs && SPLITTERS.includes(b)) {
    const tier = SPLITTERS.indexOf(b);
    if (tier === cs.tier) return undefined;
    const c = multiControllerPos(cur, x, y, z)!;
    return multiFootprint(SPLITTERS[tier], cs.dir, c[0], c[1], c[2]);
  }
  const ci = inserterInfo(cur);
  if (ci && INSERTERS.includes(b)) {
    const tier = INSERTERS.indexOf(b);
    if (tier === ci.tier) return undefined;
    return [[x, y, z, inserterState(tier, ci.dir)]];
  }
  const cf = familyBase(cur);
  if ((cf === POLE_SMALL && b === POLE_MEDIUM) || (cf === POLE_MEDIUM && b === POLE_SMALL)) return [[x, y, z, b]];
  return undefined;
}

/** ¿Tiene sentido de marcha este bloque (cinta, brazo o máquina orientable), que el jugador puede girar con R antes de ponerlo? */
export function isOrientable(block: number): boolean {
  const f = familyBase(block);
  return BELTS.includes(f) || INSERTERS.includes(f) || UNDERGROUNDS.includes(f) || f === PIPE_TO_GROUND || f === OFFSHORE_PUMP || !!multiOf(f)?.spec.oriented;
}

/** Sentido de marcha de una cinta, un brazo o una máquina orientable ya colocados (−1 si no lo es). */
export function marchDir(id: number): number {
  const m = multiInfo(id);
  const pd = isUndergroundPipe(id) ? undergroundPipeDir(id) : isOffshorePump(id) ? offshorePumpDir(id) : -1;
  return beltInfo(id)?.dir ?? inserterInfo(id)?.dir ?? undergroundInfo(id)?.dir ?? (pd >= 0 ? pd : m && m.multi.spec.oriented ? m.dir : -1);
}

/** Estado que pone un bloque de logística orientable en (x, y, z); undefined si no es uno de ellos. */
export function planLogistics(
  get: (x: number, y: number, z: number) => number, _hit: PlaceHit, base: number, x: number, y: number, z: number, yaw: number,
): Edit[] | null | undefined {
  const tier = BELTS.indexOf(familyBase(base));
  if (tier >= 0) return [[x, y, z, beltState(tier, lookDir(yaw), 0)]];
  const ins = INSERTERS.indexOf(familyBase(base));
  if (ins >= 0) return [[x, y, z, inserterState(ins, lookDir(yaw))]];
  const ug = UNDERGROUNDS.indexOf(familyBase(base));
  if (ug >= 0) {
    const dir = lookDir(yaw);
    return [[x, y, z, undergroundState(ug, dir, undergroundKindFor(get, ug, dir, x, y, z))]];
  }
  // Tubería subterránea y bomba de agua: la punta / la salida mira hacia el jugador (lo de detrás va bajo tierra / al agua).
  if (familyBase(base) === PIPE_TO_GROUND) return [[x, y, z, undergroundPipeState((lookDir(yaw) + 2) % 4)]];
  if (familyBase(base) === OFFSHORE_PUMP) return [[x, y, z, OFFSHORE_PUMP + ((lookDir(yaw) + 2) % 4)]];
  // Máquinas de varias casillas: toda la huella de una vez, con el ancla donde apunta el jugador y el frente hacia donde mira.
  const multi = multiOf(base);
  if (multi) {
    const cells = multiFootprint(base, multi.spec.oriented ? lookDir(yaw) : 0, x, y, z);
    for (const [cx, cy, cz] of cells) {
      if (cy <= MIN_Y || cy >= MAX_Y) return null;
      const cur = get(cx, cy, cz);
      if (cur < 0) return null;
      if (cur !== 0 && !(BLOCK_REPLACEABLE[cur] && !BLOCK_FLUID[cur])) return null; // toda la huella debe estar libre
    }
    return cells;
  }
  return undefined;
}
