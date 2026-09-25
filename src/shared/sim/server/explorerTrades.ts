// Fase 7.5 (mansión): las ofertas de mapas de explorador del cartógrafo. Cada una apunta a la estructura
// más cercana de su clase desde donde está el aldeano (se busca una vez por aldeano y se recuerda); si
// no hay ninguna en todo el radio de búsqueda, la oferta no sale (como en Minecraft).
import { explorerMap, EXPLORER_SEARCH } from '../../explorerMaps';
import { locateStructure } from '../../world/structures';
import type { Offer } from '../../villagers';
import type { Entity } from '../entities';
import type { ServerContext } from './context';

export class ExplorerTrades {
  private targets = new WeakMap<Entity, Map<string, [number, number] | null>>();

  constructor(private ctx: ServerContext) {}

  /** Las ofertas del aldeano con los mapas de explorador ya apuntando a su destino (o sin ellos). */
  resolve(e: Entity, list: Offer[]): Offer[] {
    if (!list.some((o) => o.explorer)) return list;
    const out: Offer[] = [];
    for (const o of list) {
      if (!o.explorer) {
        out.push(o);
        continue;
      }
      const t = this.target(e, o.explorer);
      if (t) out.push({ ...o, data: explorerMap(o.explorer, t[0], t[1]).data });
    }
    return out;
  }

  /** Estructura de esa clase más cercana al aldeano (x, z), o null. */
  target(e: Entity, kind: string): [number, number] | null {
    let m = this.targets.get(e);
    if (!m) this.targets.set(e, (m = new Map()));
    if (!m.has(kind)) {
      const p = locateStructure(this.ctx.world.gen, kind, Math.floor(e.x), Math.floor(e.z), EXPLORER_SEARCH);
      m.set(kind, p ? [p[0], p[2]] : null);
    }
    return m.get(kind)!;
  }
}
