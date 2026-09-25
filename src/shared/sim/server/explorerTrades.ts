// Fase 7.5 (mansión): las ofertas de mapas de explorador del cartógrafo. Cada una es el mapa de estructura
// (structureMaps.ts) que apunta a la estructura más cercana de su clase desde donde está el aldeano (se
// busca una vez por aldeano y se recuerda); si no hay ninguna al alcance, la oferta no sale (como en
// Minecraft).
import { EMPTY_MAP } from '../../items';
import { structureMap } from '../../structureMaps';
import { isStructureMapKind } from '../../structureMapData';
import type { ItemData } from '../../itemData';
import type { Offer } from '../../villagers';
import type { Entity } from '../entities';
import type { ServerContext } from './context';

export class ExplorerTrades {
  private maps = new WeakMap<Entity, Map<string, ItemData | null>>();

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
      const data = this.mapData(e, o.explorer);
      if (data) out.push({ ...o, data });
    }
    return out;
  }

  /** Datos del mapa de esa clase para el aldeano (null si no hay estructura al alcance). */
  private mapData(e: Entity, kind: string): ItemData | null {
    let m = this.maps.get(e);
    if (!m) this.maps.set(e, (m = new Map()));
    if (!m.has(kind)) {
      const map = isStructureMapKind(kind) ? structureMap(kind, this.ctx.world.gen, e.x, e.z) : null;
      m.set(kind, map && map.id !== EMPTY_MAP && map.data ? map.data : null);
    }
    return m.get(kind)!;
  }
}
