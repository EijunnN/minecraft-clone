// Programa lunar (plan de FACTORIO-REFERENCIA.md, punto 2): las máquinas de varias casillas en el servidor.
//
// Una máquina de varias casillas es una familia de bloques (shared/blocks/multiblock). Colocarla pone toda la huella de una vez (lo hace
// planPlacement); aquí se cuida lo contrario: cuando desaparece CUALQUIERA de sus casillas (el jugador la rompe, una explosión, un
// comando), las demás se quitan con ella, sin soltar nada más (el objeto lo suelta la casilla que se rompió, una sola vez).
import { registerRedstone, type RedstoneApi } from '../../redstone';
import { allMultiBases, multiInfo, multiControllerPos, multiFootprint, isMultiPart, familyBase, AIR } from '../../blocks';
import type { ServerContext } from './context';
import type { Redstone } from './redstone';

const SYSTEMS = new WeakMap<RedstoneApi, MultiBlocks>();

registerRedstone(allMultiBases(), {
  changed: (api, x, y, z, old, id) => SYSTEMS.get(api)?.changed(x, y, z, old, id),
});

export class MultiBlocks {
  constructor(private ctx: ServerContext, rs: Redstone) {
    SYSTEMS.set(rs, this);
  }

  changed(x: number, y: number, z: number, old: number, id: number): void {
    // old = −1: el chunk se acaba de cargar, no ha cambiado nada.
    if (old <= 0 || !isMultiPart(old) || familyBase(id) === familyBase(old)) return;
    const info = multiInfo(old)!;
    const c = multiControllerPos(old, x, y, z)!;
    const base = familyBase(old);
    for (const [cx, cy, cz] of multiFootprint(base, info.dir, c[0], c[1], c[2])) {
      if (cx === x && cy === y && cz === z) continue;
      if (familyBase(this.ctx.world.getBlock(cx, cy, cz)) === base) this.ctx.world.setBlock(cx, cy, cz, AIR);
    }
  }
}
