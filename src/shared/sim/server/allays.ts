// Fase 7.5 (mansión): lo que el alay necesita del resto del servidor. Oye los bloques musicales (todo
// 'note' que suena pasa por aquí), sabe qué tocadiscos están sonando (para bailar) y recibe los objetos
// que le dan los jugadores (la pila entera, con su desgaste y sus datos, para devolverla igual).
// También hace aparecer las criaturas de las estructuras (illagers de la mansión, alays presos) cuando se
// genera su chunk: ésas no desaparecen.
import { MOB_ALLAY } from '../../allay';
import { sanitizeStack } from '../../containers';
import { STATE_DEAD, type ClientMsg } from '../../protocol';
import type { StructureMob } from '../../world/structures';
import type { Entity, InteractResult } from '../entities';
import type { Collections } from './collections';
import type { ServerContext, Session } from './context';

export class Allays {
  constructor(private ctx: ServerContext, collections: Collections) {
    ctx.entities.allays.jukeboxNear = (x, y, z, r) => collections.playingNear(x, y, z, r);
  }

  /** Suena un bloque musical. */
  heardNote(x: number, y: number, z: number): void {
    this.ctx.entities.allays.heardNote(x, y, z);
  }

  /** Clic derecho sobre un alay (null si no es un alay: lo atienden los demás). */
  onInteract(s: Session, e: Entity, msg: Extract<ClientMsg, { t: 'interact' }>): InteractResult | null {
    if (e.type !== MOB_ALLAY) return null;
    if (s.s & STATE_DEAD) return { ok: false };
    const item = Number(msg.item) | 0;
    let stack = item > 0 ? sanitizeStack(msg.st) : null;
    if (item > 0 && (!stack || stack.id !== item)) stack = sanitizeStack({ id: item, count: 1, ...(msg.d ? { dmg: msg.d } : {}) });
    if (item > 0 && !stack) return { ok: false };
    return this.ctx.entities.allays.interact(e, stack, s.mode === 'c', s.name) ?? { ok: false };
  }

  /** Criaturas de una estructura recién generada (una sola vez por chunk). */
  spawnStructureMobs(list: StructureMob[]): void {
    for (const m of list) {
      const e = this.ctx.entities.spawnMob(m.type, m.x, m.y, m.z);
      if (e) e.persistent = true;
    }
  }
}
