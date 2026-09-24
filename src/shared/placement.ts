// Reglas de colocación y de uso de los bloques con estados (compartidas por el cliente, que las
// predice, y el servidor, que las aplica): losas dobles, escaleras invertidas, puertas de dos
// bloques con bisagra, trampillas, portillos, escaleras de mano y antorchas en la pared, camas.
import {
  BLOCK_REPLACEABLE, BLOCK_FLUID, BLOCK_SOLID, BLOCK_OPAQUE, BLOCK_RENDER, R_CROSS, TORCH, WALL_TORCH, LADDER,
  RED_BED, stateOf, stateProps, familyBase, isSlab, isStairs, isDoor, isTrapdoor, isFenceGate, isBed, isCrop, isCake,
  isFarmland, isMatureCrop, COMPOSTER,
  blockSupported, orientedFor, type NeighborGet,
} from './blocks';
import { DIR_X, DIR_Z } from './blockModels';

export type Edit = [number, number, number, number];
export type GetBlock = (x: number, y: number, z: number) => number;

export interface PlaceHit {
  /** Celda golpeada. */
  x: number;
  y: number;
  z: number;
  /** Normal de la cara golpeada. */
  nx: number;
  ny: number;
  nz: number;
  /** Punto golpeado (coordenadas del mundo). */
  px: number;
  py: number;
  pz: number;
  /** Bloque golpeado. */
  id: number;
}

/** Dirección horizontal (0 N, 1 E, 2 S, 3 O) hacia la que mira un jugador con ese yaw. */
export function facingFromYaw(yaw: number): number {
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  if (Math.abs(fx) > Math.abs(fz)) return fx > 0 ? 1 : 3;
  return fz > 0 ? 2 : 0;
}

/** Dirección de una normal horizontal. */
function dirOfNormal(nx: number, nz: number): number {
  if (nz < 0) return 0;
  if (nx > 0) return 1;
  if (nz > 0) return 2;
  return 3;
}

const replaceable = (id: number) => id >= 0 && BLOCK_REPLACEABLE[id] === 1;
/** Suelo firme para puertas y camas. */
const firm = (id: number) => id > 0 && BLOCK_SOLID[id] === 1 && BLOCK_RENDER[id] !== R_CROSS;

function rel(get: GetBlock, x: number, y: number, z: number): NeighborGet {
  return (dx, dy, dz) => get(x + dx, y + dy, z + dz);
}

/**
 * Bloques que coloca el objeto `item` al usarlo sobre `hit` (null si no se puede).
 * No comprueba si hay criaturas o jugadores en medio: eso lo hace quien llama.
 */
export function planPlacement(get: GetBlock, hit: PlaceHit, item: number, yaw: number): Edit[] | null {
  const base = familyBase(item);
  // Losa sobre la mitad libre de otra igual: losa doble.
  if (isSlab(base) && familyBase(hit.id) === base) {
    const t = stateProps(hit.id)!.type;
    if ((t === 0 && hit.ny === 1) || (t === 1 && hit.ny === -1)) return [[hit.x, hit.y, hit.z, stateOf(base, { type: 2 })]];
  }
  let x = hit.x + hit.nx, y = hit.y + hit.ny, z = hit.z + hit.nz;
  if (BLOCK_REPLACEABLE[hit.id] && !BLOCK_FLUID[hit.id]) {
    x = hit.x;
    y = hit.y;
    z = hit.z;
  }
  if (y < 1 || y > 255) return null;
  const cur = get(x, y, z);
  if (cur < 0) return null;
  if (isSlab(base) && familyBase(cur) === base && stateProps(cur)!.type !== 2) return [[x, y, z, stateOf(base, { type: 2 })]];
  if (!replaceable(cur)) return null;

  const face = hit.ny > 0 ? 'up' : hit.ny < 0 ? 'down' : 'side';
  // Mitad superior: clic en la cara de abajo de un bloque o en la mitad alta de una cara lateral.
  const upper = face === 'down' || (face === 'side' && hit.py - y > 0.5);
  const facing = facingFromYaw(yaw);
  const one = (id: number): Edit[] => [[x, y, z, id]];

  // Semillas, zanahorias y patatas: sólo sobre tierra de cultivo.
  if (isCrop(base)) return isFarmland(get(x, y - 1, z)) ? one(base) : null;
  if (isCake(base)) return firm(get(x, y - 1, z)) ? one(base) : null;
  if (isSlab(base)) return one(stateOf(base, { type: upper ? 1 : 0 }));
  if (isStairs(base)) return one(stateOf(base, { facing, half: upper ? 1 : 0 }));
  if (isFenceGate(base)) return one(stateOf(base, { facing }));
  if (isTrapdoor(base)) {
    const f = face === 'side' ? dirOfNormal(hit.nx, hit.nz) : (facing + 2) & 3;
    return one(stateOf(base, { facing: f, half: upper ? 1 : 0 }));
  }
  if (base === LADDER) {
    const f = face === 'side' ? dirOfNormal(hit.nx, hit.nz) : (facing + 2) & 3;
    const id = stateOf(LADDER, { facing: f });
    return blockSupported(id, rel(get, x, y, z)) ? one(id) : null;
  }
  if (base === TORCH) {
    if (face === 'down') return null;
    if (face === 'side') {
      const id = stateOf(WALL_TORCH, { facing: dirOfNormal(hit.nx, hit.nz) });
      if (blockSupported(id, rel(get, x, y, z))) return one(id);
    }
    return one(TORCH); // de pie: el apoyo de abajo lo comprueba quien llama
  }
  if (isDoor(base)) {
    if (y + 1 > 255 || !replaceable(get(x, y + 1, z)) || !firm(get(x, y - 1, z))) return null;
    const left = (facing + 3) & 3, right = (facing + 1) & 3;
    const lx = x + DIR_X[left], lz = z + DIR_Z[left], rx = x + DIR_X[right], rz = z + DIR_Z[right];
    const ln = get(lx, y, lz), rn = get(rx, y, rz);
    const doorWith = (id: number, hinge: number) => {
      if (!isDoor(id) || familyBase(id) !== base) return false;
      const st = stateProps(id)!;
      return st.half === 0 && st.hinge === hinge;
    };
    let hinge: number;
    // Puerta doble: la bisagra en el lado contrario a la vecina.
    if (doorWith(ln, 0)) hinge = 1;
    else if (doorWith(rn, 1)) hinge = 0;
    else {
      const solid = (xx: number, zz: number) => (BLOCK_OPAQUE[Math.max(0, get(xx, y, zz))] ? 1 : 0) + (BLOCK_OPAQUE[Math.max(0, get(xx, y + 1, zz))] ? 1 : 0);
      const sl = solid(lx, lz), sr = solid(rx, rz);
      if (sr > sl) hinge = 1;
      else if (sl > sr) hinge = 0;
      else {
        // Según la mitad de la cara en la que se hizo clic.
        const along = (hit.px - x - 0.5) * DIR_X[right] + (hit.pz - z - 0.5) * DIR_Z[right];
        hinge = along > 0 ? 1 : 0;
      }
    }
    return [
      [x, y, z, stateOf(base, { facing, half: 0, open: 0, hinge })],
      [x, y + 1, z, stateOf(base, { facing, half: 1, open: 0, hinge })],
    ];
  }
  if (isBed(base)) {
    const hx = x + DIR_X[facing], hz = z + DIR_Z[facing];
    if (!replaceable(get(hx, y, hz)) || !firm(get(x, y - 1, z)) || !firm(get(hx, y - 1, hz))) return null;
    return [
      [x, y, z, stateOf(RED_BED, { facing, part: 0 })],
      [hx, y, hz, stateOf(RED_BED, { facing, part: 1 })],
    ];
  }
  return one(orientedFor(base, yaw));
}

/** Celda de la otra mitad de una puerta o de la otra parte de una cama (null si no tiene). */
export function partnerOf(x: number, y: number, z: number, id: number): [number, number, number] | null {
  const st = stateProps(id);
  if (!st) return null;
  if (isDoor(id)) return st.half === 0 ? [x, y + 1, z] : [x, y - 1, z];
  if (isBed(id)) {
    const s = st.part === 0 ? 1 : -1;
    return [x + DIR_X[st.facing] * s, y, z + DIR_Z[st.facing] * s];
  }
  return null;
}

/** ¿Hace algo el clic derecho sobre este bloque? (puertas, trampillas, portillos, camas, tartas, compostadores). */
export function isUsable(id: number): boolean {
  return isDoor(id) || isTrapdoor(id) || isFenceGate(id) || isBed(id) || isCake(id) || familyBase(id) === COMPOSTER;
}

/** ¿Tendría efecto el polvo de hueso aquí? (lo usa el cliente para gastarlo). */
export function canFertilize(get: GetBlock, x: number, y: number, z: number, saplings: ReadonlySet<number>, grass: number): boolean {
  const id = get(x, y, z);
  if (isCrop(id)) return !isMatureCrop(id);
  if (saplings.has(id)) return true;
  return id === grass && get(x, y + 1, z) === 0;
}

/** Abrir o cerrar puertas, trampillas y portillos (las dos mitades de una puerta a la vez). */
export function toggleEdits(get: GetBlock, x: number, y: number, z: number, yaw: number): Edit[] | null {
  const id = get(x, y, z);
  const st = stateProps(id);
  if (!st) return null;
  const base = familyBase(id);
  if (isDoor(id)) {
    const open = st.open ? 0 : 1;
    const out: Edit[] = [[x, y, z, stateOf(base, { ...st, open })]];
    const p = partnerOf(x, y, z, id)!;
    const other = get(p[0], p[1], p[2]);
    if (isDoor(other) && familyBase(other) === base) out.push([p[0], p[1], p[2], stateOf(base, { ...stateProps(other)!, open })]);
    return out;
  }
  if (isTrapdoor(id)) return [[x, y, z, stateOf(base, { ...st, open: st.open ? 0 : 1 })]];
  if (isCake(id)) return [[x, y, z, st.bites >= 6 ? 0 : stateOf(base, { bites: st.bites + 1 })]];
  if (isFenceGate(id)) {
    if (st.open) return [[x, y, z, stateOf(base, { ...st, open: 0 })]];
    // Se abre alejándose de quien la empuja.
    const f = facingFromYaw(yaw);
    const facing = st.facing === ((f + 2) & 3) ? f : st.facing;
    return [[x, y, z, stateOf(base, { facing, open: 1 })]];
  }
  return null;
}
