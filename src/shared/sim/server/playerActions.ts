// Acciones de los jugadores sobre entidades: atacar, recoger y tirar objetos, disparar flechas y
// lanzar huevos.
import { STATE_DEAD, type ClientMsg } from '../../protocol';
import { ITEMS, EGG, SNOWBALL } from '../../items';
import { attackCooldown, attackDamage, chargeFactor } from '../../combat';
import { sanitizeStack } from '../../containers';
import type { PlayerView } from '../entities';
import { CROSSBOW_SPEED, CROSSBOW_ARROW_DAMAGE } from '../../equipment'; // Fase 6.5 (equipo)
import type { ServerContext, Session } from './context';

export class PlayerActions {
  constructor(private ctx: ServerContext) {}

  onAttack(s: Session, msg: Extract<ClientMsg, { t: 'attack' }>): void {
    const ctx = this.ctx;
    if (s.s & STATE_DEAD) return;
    const e = ctx.entities.list.get(Number(msg.e));
    if (!e || !e.ai || e.dead) return;
    const reach = ctx.local ? 8 : 6;
    const dx = e.x - s.p[0], dy = e.y + e.height / 2 - (s.p[1] + 1.6), dz = e.z - s.p[2];
    if (dx * dx + dy * dy + dz * dz > reach * reach) return;
    const now = ctx.now();
    // Enfriamiento del ataque (como en Minecraft 1.9+): cada arma tiene su ritmo y golpear antes de
    // tiempo hace menos daño.
    const item = Number(msg.item);
    const valid = Number.isInteger(item) && item > 0;
    const tool = valid ? ITEMS[item]?.tool : undefined;
    const charge = Math.min(1, (now - s.lastAttack) / (attackCooldown(valid ? item : 0) * 1000));
    s.lastAttack = now;
    let dmg = valid ? attackDamage(item) : 1;
    // Efectos del jugador (Fuerza, Debilidad): el cliente los manda y aquí se acotan.
    const bonus = Number(msg.b);
    if (Number.isFinite(bonus)) dmg = Math.max(0, dmg + Math.max(-20, Math.min(15, bonus)));
    dmg *= chargeFactor(charge);
    if (msg.crit && charge > 0.9) dmg *= 1.5;
    ctx.entities.damage(e, Math.max(0.5, dmg), s.p[0], s.p[2], s.id, tool?.kind === 'sword' ? 1.2 : 1);
  }

  onPickup(s: Session, id: number): void {
    if (s.s & STATE_DEAD || !Number.isInteger(id)) return;
    const view: PlayerView = {
      id: s.id, name: s.name, x: s.p[0], y: s.p[1], z: s.p[2], alive: true, creative: s.mode === 'c', lookingAt: -1,
    };
    const stack = this.ctx.entities.tryPickup(id, view);
    if (stack) {
      this.ctx.markCollected(id, s.id);
      this.ctx.send(s, { t: 'picked', e: id, s: stack });
    }
  }

  onDrop(s: Session, msg: Extract<ClientMsg, { t: 'drop' }>): void {
    const ctx = this.ctx;
    if (!Array.isArray(msg.items) || !Array.isArray(msg.p) || msg.items.length > 64) return;
    if (!ctx.allow(s, 1 + msg.items.length * 0.5)) return;
    const p = msg.p.map(Number);
    if (p.length !== 3 || !p.every(Number.isFinite)) return;
    if (!ctx.local && Math.hypot(p[0] - s.p[0], p[1] - s.p[1], p[2] - s.p[2]) > 4) return;
    const v = Array.isArray(msg.v) && msg.v.length === 3 && msg.v.map(Number).every(Number.isFinite) ? msg.v.map(Number) : null;
    for (const raw of msg.items) {
      const st = sanitizeStack(raw);
      if (!st) continue;
      if (v) {
        const clampV = (a: number) => Math.max(-12, Math.min(12, a));
        ctx.entities.spawnItem(st, p[0], p[1], p[2], clampV(v[0]), clampV(v[1]), clampV(v[2]), s.id, 2);
      } else {
        const a = ctx.rand() * Math.PI * 2, sp = ctx.rand() * 3;
        ctx.entities.spawnItem(st, p[0], p[1] + 0.5, p[2], Math.cos(a) * sp, 3 + ctx.rand() * 2, Math.sin(a) * sp, s.id, 2);
      }
    }
  }

  onShoot(s: Session, msg: Extract<ClientMsg, { t: 'shoot' }>): void {
    const ctx = this.ctx;
    if (s.s & STATE_DEAD || !Array.isArray(msg.p) || !Array.isArray(msg.d)) return;
    const p = msg.p.map(Number), d = msg.d.map(Number);
    const f = Math.max(0, Math.min(1, Number(msg.f) || 0));
    if (p.length !== 3 || d.length !== 3 || ![...p, ...d].every(Number.isFinite) || f < 0.1) return;
    if (!ctx.local && Math.hypot(p[0] - s.p[0], p[1] - s.p[1] - 1.6, p[2] - s.p[2]) > 3) return;
    const len = Math.hypot(d[0], d[1], d[2]) || 1;
    // Fase 6.5 (equipo): el virote de la ballesta sale siempre a tope y pega más fuerte.
    const crossbow = msg.c === 1;
    const speed = crossbow ? CROSSBOW_SPEED : 55 * f;
    ctx.entities.spawnArrow(p[0], p[1], p[2], (d[0] / len) * speed, (d[1] / len) * speed, (d[2] / len) * speed, s.id, crossbow ? CROSSBOW_ARROW_DAMAGE : 2);
    if (crossbow) ctx.fx('crossbow_shoot', p[0], p[1], p[2]);
    else ctx.fx('bow', p[0], p[1], p[2], f);
  }

  /** Lanzar un huevo (el cliente ya lo quitó del inventario). */
  onThrow(s: Session, msg: Extract<ClientMsg, { t: 'throw' }>): void {
    const ctx = this.ctx;
    const item = Number(msg.item);
    if (s.s & STATE_DEAD || (item !== EGG && item !== SNOWBALL) || !Array.isArray(msg.p) || !Array.isArray(msg.d)) return;
    const p = msg.p.map(Number), d = msg.d.map(Number);
    if (p.length !== 3 || d.length !== 3 || ![...p, ...d].every(Number.isFinite)) return;
    if (!ctx.local && Math.hypot(p[0] - s.p[0], p[1] - s.p[1] - 1.6, p[2] - s.p[2]) > 3) return;
    const len = Math.hypot(d[0], d[1], d[2]) || 1;
    // 1,5 bloques por tick, como en Minecraft.
    const speed = 30;
    ctx.entities.spawnThrown(item, p[0], p[1], p[2], (d[0] / len) * speed, (d[1] / len) * speed, (d[2] / len) * speed, s.id);
    ctx.fx('throw', p[0], p[1], p[2]);
  }
}
