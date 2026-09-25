// Fase 7 (redstone): potencia del polvo de redstone. En vez de recalcular cable a cable (lo que en
// Minecraft hace que una línea larga se actualice cientos de veces), se resuelve la red entera de una
// vez: se recogen los cables unidos, se mira cuánta potencia le llega a cada uno desde fuera (sin
// contar otros cables) y se reparte bajando 1 por bloque, de mayor a menor (cubos de 15 a 1). El
// resultado es el mismo que el de Minecraft: cada cable queda con max(externa, vecino − 1).
//
// Quién da potencia a quién (calculateTargetStrength de Minecraft): un cable recibe de los cables de
// su nivel, del que tiene encima en diagonal si el bloque de al lado conduce y el de encima de él no,
// y del que tiene debajo en diagonal si el bloque de al lado no conduce. Por eso sube por escalones de
// piedra, pero por la piedra luminosa (que no conduce) sólo sube y no baja.
import { isWire, wirePower, wireDot, wireState } from '../blocks/redstoneBlocks';
import { isConductor, type RedstoneApi, type RedstoneView } from './api';
import { bestNeighborSignal } from './signals';
import { posKey } from '../sim/posKey';

const DX = [0, 1, 0, -1], DZ = [-1, 0, 1, 0];

/** Cables más grandes que esto se resuelven por partes (en la práctica no pasa). */
export const MAX_NETWORK = 8192;

/** Cables de los que recibe potencia el cable (x, y, z): posiciones en `out` (x, y, z seguidos). */
export function wireSources(v: RedstoneView, x: number, y: number, z: number, out: number[]): void {
  out.length = 0;
  const aboveConducts = isConductor(v.getBlock(x, y + 1, z));
  for (let d = 0; d < 4; d++) {
    const sx = x + DX[d], sz = z + DZ[d];
    const side = v.getBlock(sx, y, sz);
    if (isWire(side)) out.push(sx, y, sz);
    else if (isConductor(side)) {
      if (!aboveConducts && isWire(v.getBlock(sx, y + 1, sz))) out.push(sx, y + 1, sz);
    } else if (isWire(v.getBlock(sx, y - 1, sz))) out.push(sx, y - 1, sz);
  }
}

const srcTmp: number[] = [];

/**
 * Resuelve la red de cables que contiene (x, y, z): calcula la potencia de todos y cambia los que
 * no la tengan. `solved` recibe la clave de cada cable resuelto. Devuelve cuántos cambió.
 */
export function solveWireNetwork(api: RedstoneApi, x: number, y: number, z: number, solved: (key: number) => void): number {
  // 1) Red: los cables alcanzables por los doce huecos vecinos (su nivel y los de arriba y abajo en
  // diagonal). Puede juntar alguna red que en realidad está separada: no pasa nada, sale igual.
  const xs: number[] = [], ys: number[] = [], zs: number[] = [];
  const index = new Map<number, number>();
  const add = (ax: number, ay: number, az: number) => {
    const k = posKey(ax, ay, az);
    if (index.has(k)) return;
    index.set(k, xs.length);
    xs.push(ax);
    ys.push(ay);
    zs.push(az);
  };
  add(x, y, z);
  for (let i = 0; i < xs.length && xs.length < MAX_NETWORK; i++) {
    for (let d = 0; d < 4; d++) {
      const nx = xs[i] + DX[d], nz = zs[i] + DZ[d];
      for (let dy = -1; dy <= 1; dy++) if (isWire(api.getBlock(nx, ys[i] + dy, nz))) add(nx, ys[i] + dy, nz);
    }
  }
  const n = xs.length;
  // 2) Potencia de fuera y de quién recibe cada uno (se guarda al revés: a quién da).
  const power = new Int8Array(n);
  const out: number[][] = Array.from({ length: n }, () => []);
  const buckets: number[][] = Array.from({ length: 16 }, () => []);
  for (let i = 0; i < n; i++) {
    const p = bestNeighborSignal(api, xs[i], ys[i], zs[i], true);
    power[i] = p;
    if (p > 0) buckets[p].push(i);
    wireSources(api, xs[i], ys[i], zs[i], srcTmp);
    for (let k = 0; k < srcTmp.length; k += 3) {
      const j = index.get(posKey(srcTmp[k], srcTmp[k + 1], srcTmp[k + 2]));
      if (j !== undefined) out[j].push(i);
    }
  }
  // 3) Reparto de mayor a menor: cada cable da (su potencia − 1) a los que reciben de él.
  for (let p = 15; p >= 2; p--) {
    const b = buckets[p];
    for (let q = 0; q < b.length; q++) {
      const i = b[q];
      if (power[i] !== p) continue;
      for (const j of out[i]) {
        if (power[j] < p - 1) {
          power[j] = p - 1;
          buckets[p - 1].push(j);
        }
      }
    }
  }
  // 4) Sólo cambian los que tienen otra potencia (cada cambio avisa a sus vecinos).
  let changed = 0;
  for (let i = 0; i < n; i++) solved(posKey(xs[i], ys[i], zs[i]));
  for (let i = 0; i < n; i++) {
    const id = api.getBlock(xs[i], ys[i], zs[i]);
    if (!isWire(id) || wirePower(id) === power[i]) continue;
    api.setBlock(xs[i], ys[i], zs[i], wireState(power[i], wireDot(id)));
    changed++;
  }
  return changed;
}
