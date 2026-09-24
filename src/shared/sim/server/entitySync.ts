// Envío de entidades a cada jugador: sólo las cercanas y sólo lo que cambió desde el último envío
// (altas, actualizaciones y bajas, con quién recogió cada objeto para la animación).
import { ENT_ITEM, ENT_FALLING, ENT_XP } from '../../mobs';
import type { ServerMsg } from '../../protocol';
import type { Entity } from '../entities';
import { r2, type ServerContext } from './context';

/** Distancia a la que se envían entidades a un jugador. */
const ENTITY_RANGE = 80;

export class EntitySync {
  /** Entidades retiradas desde el último envío: id → jugador que la recogió. */
  private collected = new Map<number, string>();

  constructor(private ctx: ServerContext) {}

  markCollected(entityId: number, playerId: string): void {
    this.collected.set(entityId, playerId);
  }

  /** Recoge las bajas del último tick de la simulación de entidades. */
  takeRemoved(removed: [number, string][]): void {
    for (const [id, who] of removed) if (!this.collected.has(id)) this.collected.set(id, who);
  }

  private key(e: Entity): string {
    return `${r2(e.x)},${r2(e.y)},${r2(e.z)},${r2(e.yaw)},${r2(e.bodyYaw)},${r2(e.pitch)},${e.flags},${e.stack?.count ?? e.xp ?? 0}`;
  }

  sync(): void {
    const ctx = this.ctx;
    const removedInfo = this.collected;
    for (const s of ctx.sessions()) {
      if (!s.joined) continue;
      const add: number[][] = [], upd: number[][] = [], rm: (number | [number, string])[] = [];
      const seen = new Set<number>();
      for (const e of ctx.entities.list.values()) {
        const dx = e.x - s.p[0], dz = e.z - s.p[2];
        if (dx * dx + dz * dz > ENTITY_RANGE * ENTITY_RANGE) continue;
        seen.add(e.id);
        const key = this.key(e);
        const prev = s.known.get(e.id);
        if (prev === key) continue;
        s.known.set(e.id, key);
        if (prev === undefined) {
          const rec = [e.id, e.type, r2(e.x), r2(e.y), r2(e.z), r2(e.yaw), r2(e.bodyYaw), r2(e.pitch), e.flags];
          if (e.type === ENT_ITEM && e.stack) rec.push(e.stack.id, e.stack.count);
          else if (e.type === ENT_FALLING) rec.push(e.block ?? 0);
          else if (e.type === ENT_XP) rec.push(e.xp ?? 1);
          else if (e.ai) rec.push(Math.round(e.health));
          add.push(rec);
        } else {
          const rec = [e.id, r2(e.x), r2(e.y), r2(e.z), r2(e.yaw), r2(e.bodyYaw), r2(e.pitch), e.flags];
          if (e.type === ENT_ITEM && e.stack) rec.push(e.stack.count);
          else if (e.type === ENT_XP) rec.push(e.xp ?? 1);
          upd.push(rec);
        }
      }
      for (const id of s.known.keys()) {
        if (seen.has(id)) continue;
        s.known.delete(id);
        const who = removedInfo.get(id);
        rm.push(who ? [id, who] : id);
      }
      if (add.length || upd.length || rm.length) {
        const msg: ServerMsg = { t: 'ents' };
        if (add.length) msg.a = add;
        if (upd.length) msg.u = upd;
        if (rm.length) msg.rm = rm;
        ctx.send(s, msg);
      }
    }
    removedInfo.clear();
  }
}
