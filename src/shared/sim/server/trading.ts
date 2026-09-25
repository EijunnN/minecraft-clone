// Comercio con los aldeanos (fase 6), con el servidor como autoridad: abrir la pantalla de un aldeano
// (sólo si tiene oficio y está cerca), validar cada trato (la oferta existe, no está agotada y lo que
// paga el jugador cubre el precio), sumar usos y experiencia al aldeano (sube de nivel y desbloquea
// ofertas), aldeanos nuevos al generarse una aldea y el comerciante ambulante que aparece de vez en cuando.
import { MOB_VILLAGER, MOB_WANDERING_TRADER, isVillagerType } from '../../mobs';
import { BLOCK_FLUID } from '../../blocks';
import { maxStack, EMERALD, type ItemStack } from '../../items';
import { offersFor, traderOffers, offerToWire, PROF_NONE, type Offer } from '../../villagers';
import { sanitizeStack } from '../../containers';
import { STATE_DEAD, type ClientMsg } from '../../protocol';
import { sunHeightAt } from '../../weather';
import { standable } from '../pathfind';
import type { Entity } from '../entities';
import type { VillagerSpawn } from '../../world/villages';
import type { ServerContext, Session } from './context';
import { ExplorerTrades } from './explorerTrades'; // Fase 7.5 (mansión)
import { mapKeyAt } from '../../maps';

/** Distancia máxima para comerciar (bloques). */
const TRADE_RANGE = 6;
/** Segundos entre intentos de traer un comerciante ambulante. */
const TRADER_EVERY = 600;

export class Trading {
  /** Aldeano con el que comercia cada jugador (id de sesión → id de la entidad). */
  private open = new Map<string, number>();
  private traderTimer = TRADER_EVERY;

  /** Fase 6 (asaltos): ¿es héroe de la aldea este jugador? (rebaja del 30 % en las esmeraldas). */
  heroOf: (name: string) => boolean = () => false;
  /** Fase 7.5 (mansión): mapas de explorador del cartógrafo. */
  readonly explorer: ExplorerTrades;

  constructor(private ctx: ServerContext) {
    this.explorer = new ExplorerTrades(ctx);
  }

  /** Ofertas actuales de un aldeano o comerciante (con la rebaja del héroe, si `s` lo es). */
  offers(e: Entity, s?: Session): Offer[] {
    const v = this.ctx.entities.villagers.data(e);
    const list = e.type === MOB_WANDERING_TRADER ? traderOffers(v.seed) : this.explorer.resolve(e, offersFor(v.prof, v.level, v.seed)); // Fase 7.5
    if (!s || e.type === MOB_WANDERING_TRADER || !this.heroOf(s.name)) return list;
    return list.map((o) => o.cost[0] === EMERALD ? { ...o, cost: [EMERALD, Math.max(1, Math.round(o.cost[1] * 0.7))] as [number, number] } : o);
  }

  /** Aldeano vivo y al alcance del jugador (o null). */
  private villagerFor(s: Session, id: number): Entity | null {
    const e = this.ctx.entities.list.get(id);
    if (!e || e.dead || !e.ai || !isVillagerType(e.type)) return null;
    if (!this.ctx.local && Math.hypot(e.x - s.p[0], e.y - s.p[1], e.z - s.p[2]) > TRADE_RANGE) return null;
    return e;
  }

  onOpen(s: Session, msg: Extract<ClientMsg, { t: 'topen' }>): void {
    const ctx = this.ctx;
    const e = s.s & STATE_DEAD ? null : this.villagerFor(s, Number(msg.e));
    if (!e) {
      ctx.send(s, { t: 'tclose' });
      return;
    }
    const v = ctx.entities.villagers.data(e);
    if (e.type === MOB_VILLAGER && v.prof === PROF_NONE) {
      ctx.send(s, { t: 'tclose' });
      ctx.tell(s, 'Este aldeano aún no tiene oficio: necesita un bloque de trabajo libre cerca.');
      ctx.fx('villager_no', e.x, e.y + e.height, e.z, e.type);
      return;
    }
    if (v.trading && v.trading !== s.id && [...this.open.entries()].some(([sid, eid]) => sid === v.trading && eid === e.id)) {
      ctx.send(s, { t: 'tclose' });
      ctx.tell(s, 'Este aldeano está comerciando con otro jugador.');
      return;
    }
    this.close(s, false);
    v.trading = s.id;
    this.open.set(s.id, e.id);
    this.sendOffers(s, e);
  }

  private sendOffers(s: Session, e: Entity): void {
    const v = this.ctx.entities.villagers.data(e);
    this.ctx.send(s, {
      t: 'trades', e: e.id, p: v.prof, lvl: v.level, xp: v.xp, tr: e.type === MOB_WANDERING_TRADER,
      o: this.offers(e, s).map((o) => offerToWire(o, v.uses[o.key] ?? 0)),
    });
  }

  onTrade(s: Session, msg: Extract<ClientMsg, { t: 'trade' }>): void {
    const ctx = this.ctx;
    const q = Number(msg.q) | 0;
    const pay = (Array.isArray(msg.pay) ? msg.pay.slice(0, 4) : []).map((p) => sanitizeStack(p)).filter((p): p is ItemStack => !!p);
    const fail = (m?: string) => ctx.send(s, { t: 'tres', q, ok: false, back: pay, ...(m ? { m } : {}) });
    const id = Number(msg.e);
    if (this.open.get(s.id) !== id || !ctx.allow(s, 1)) return fail();
    const e = this.villagerFor(s, id);
    if (!e) {
      this.close(s, true);
      return fail();
    }
    const list = this.offers(e, s);
    const i = Number(msg.i);
    const o = Number.isInteger(i) ? list[i] : undefined;
    if (!o) return fail();
    const v = ctx.entities.villagers.data(e);
    const used = v.uses[o.key] ?? 0;
    if (used >= o.max) return fail('Esta oferta está agotada: el aldeano repondrá más tarde.');
    // Lo pagado tiene que cubrir el precio; lo que sobre se devuelve.
    const left = new Map<number, number>();
    for (const p of pay) left.set(p.id, (left.get(p.id) ?? 0) + p.count);
    for (const [cid, n] of [o.cost, ...(o.cost2 ? [o.cost2] : [])]) {
      const have = left.get(cid) ?? 0;
      if (have < n) return fail();
      left.set(cid, have - n);
    }
    const back: ItemStack[] = [];
    for (const [lid, n] of left) {
      for (let r = n; r > 0; r -= maxStack(lid)) back.push({ id: lid, count: Math.min(r, maxStack(lid)) });
    }
    v.uses[o.key] = used + 1;
    ctx.entities.villagers.addXp(e, o.xp);
    // Como en Minecraft, cada trato da algo de experiencia también al jugador.
    ctx.entities.xp.spawn(3 + Math.floor(ctx.rand() * 4), e.x, e.y + 0.5, e.z);
    ctx.fx('villager_yes', e.x, e.y + e.height, e.z, e.type);
    // Fase 7.5 (mansión): el mapa de explorador, con su celda como los demás mapas de estructura.
    const sm = o.data?.smap;
    const dmg = sm && sm.x !== undefined && sm.z !== undefined ? { dmg: mapKeyAt(sm.x, sm.z) } : {};
    ctx.send(s, { t: 'tres', q, ok: true, give: { id: o.result[0], count: o.result[1], ...dmg, ...(o.data ? { data: o.data } : {}) }, back }); // Fase 7: libros y equipo encantados
    this.sendOffers(s, e);
  }

  onClose(s: Session): void {
    this.close(s, false);
  }

  /** Un jugador se va: deja libre al aldeano. */
  onLeave(s: Session): void {
    this.close(s, false);
  }

  private close(s: Session, notify: boolean): void {
    const id = this.open.get(s.id);
    if (id === undefined) return;
    this.open.delete(s.id);
    const e = this.ctx.entities.list.get(id);
    if (e?.villager?.trading === s.id) e.villager.trading = null;
    if (notify) this.ctx.send(s, { t: 'tclose' });
  }

  /** Una vez por segundo: cierra los comercios con aldeanos que se alejaron o murieron; trae comerciantes. */
  tick(dt: number): void {
    for (const s of this.ctx.sessions()) {
      const id = this.open.get(s.id);
      if (id === undefined) continue;
      const e = this.villagerFor(s, id);
      if (!e || s.s & STATE_DEAD || Math.hypot(e.x - s.p[0], e.z - s.p[2]) > TRADE_RANGE + 2) this.close(s, true);
    }
    this.traderTimer -= dt;
    if (this.traderTimer <= 0) {
      this.traderTimer = TRADER_EVERY;
      if (this.ctx.rand() < 0.35) this.spawnTrader();
    }
  }

  /** Comerciante ambulante de día cerca de un jugador al azar (si no hay ya uno). */
  spawnTrader(): Entity | null {
    const ctx = this.ctx;
    if (sunHeightAt(ctx.worldTime()) < 0.1) return null;
    for (const e of ctx.entities.list.values()) if (e.type === MOB_WANDERING_TRADER && !e.dead) return null;
    const players = [...ctx.sessions()].filter((s) => s.joined && !(s.s & STATE_DEAD));
    if (players.length === 0) return null;
    const p = players[Math.floor(ctx.rand() * players.length)];
    const w = ctx.world;
    for (let attempt = 0; attempt < 12; attempt++) {
      const a = ctx.rand() * Math.PI * 2, r = 16 + ctx.rand() * 16;
      const x = Math.floor(p.p[0] + Math.cos(a) * r), z = Math.floor(p.p[2] + Math.sin(a) * r);
      const y = w.skyTop(x, z) + 1;
      if (y < -60 || !standable(w, x, y, z, 2)) continue;
      const floor = w.getBlock(x, y - 1, z);
      if (floor <= 0 || BLOCK_FLUID[floor]) continue;
      return ctx.entities.villagers.spawn(x + 0.5, y, z + 0.5, null, [x, y, z], MOB_WANDERING_TRADER);
    }
    return null;
  }

  /** Aldeanos de una aldea recién generada (una sola vez por aldea). */
  spawnVillagers(list: VillagerSpawn[]): void {
    for (const sp of list) this.ctx.entities.villagers.spawn(sp.x + 0.5, sp.y, sp.z + 0.5, sp.home, sp.meet);
  }
}
