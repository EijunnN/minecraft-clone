// Fase 8.6 (el End): el combate con el dragón (EndDragonFight de la 26.3), en el servidor del End.
// - La primera vez que alguien llega: cristales en lo alto de los diez pilares y el dragón a y = 128 sobre el centro.
//   El dragón y los cristales se guardan (no son animales: el servidor no los guardaría).
// - Barra del jefe para quien esté a menos de 192 bloques del centro (con su niebla y su música en el cliente).
// - Al morir el dragón: el portal de salida se enciende, la primera vez sale el huevo en lo alto de la columna y cada
//   vez sale una de las veinte puertas del End del anillo.
// - Cuatro cristales en los cuatro lados del portal de salida lo traen de vuelta (DragonRespawnAnimation): los
//   cristales apuntan al cielo, los pilares se rehacen uno a uno entre explosiones y aparece un dragón nuevo.
// - Puertas del End: las del anillo llevan a unos 1024 bloques en su dirección (a una isla; si no hay, se crea) y allí
//   dejan otra de vuelta; las de las tierras altas llevan a la plataforma de llegada.
// - Cristal del End (objeto): sobre obsidiana o lecho de roca con dos de aire encima.
// - Huevo de dragón: al usarlo (o golpearlo) salta a un sitio libre cercano.
import { AIR, OBSIDIAN, BEDROCK, END_STONE, END_GATEWAY, DRAGON_EGG, FIRE, BLOCK_SOLID } from '../../blocks';
import { END_CRYSTAL } from '../../items';
import { MOB_ENDER_DRAGON, ENT_END_CRYSTAL, DRAGON_HEALTH } from '../../mobs';
import { DIM_END } from '../../dimensions';
import { CHUNK_SIZE } from '../../constants';
import { STATE_DEAD } from '../../protocol';
import { END_SPAWN, EndGenerator } from '../../world/end';
import { endSpikes, drawSpike, drawPodium, drawGateway, gatewayOrder, gatewayPos, gatewayFarTarget, type EndLevel } from '../../world/endIsland';
import type { Entity } from '../entities';
import type { ServerStore } from '../store';
import type { ServerContext, Session } from './context';

interface FightSave {
  init: boolean;
  killed: boolean;
  prev: boolean;
  /** Puertas del anillo que quedan (en orden). */
  gates: number[];
  /** Puertas del anillo ya usadas y la suya de vuelta. */
  links: [number, number, number, number, number, number][];
  dragon: [number, number, number, number] | null;
  crystals: [number, number, number, number][];
}

const BOSS_RANGE = 192;

export class EndFight {
  private save: FightSave = { init: false, killed: false, prev: false, gates: [], links: [], dragon: null, crystals: [] };
  private loaded = false;
  private restored = false;
  /** Jugadores con la barra a la vista y lo último que se les mandó. */
  private bossSent = new Map<string, number>();
  /** Espera de cada jugador tras cruzar una puerta (ticks del servidor). */
  private gateCooldown = new Map<string, number>();
  /** Reaparición en marcha: fase, ticks y los cristales que la hacen. */
  private respawn: { stage: number; time: number; spike: number; crystals: number[] } | null = null;
  private portalY = -1;

  constructor(private ctx: ServerContext, private store: ServerStore) {
    if (ctx.dim !== DIM_END) return;
    try {
      const raw = store.getMeta('endFight');
      if (raw) this.save = { ...this.save, ...(JSON.parse(raw) as FightSave) };
    } catch {
      // Sin combate guardado (o roto): empieza de cero.
    }
    const d = ctx.entities.dragon;
    d.fight = {
      podium: () => {
        const y = this.podiumY();
        return [0, y + 4, 0];
      },
      crystalsAlive: () => this.spikeCrystals(),
      previouslyKilled: () => this.save.prev,
      onDragonKilled: () => this.dragonKilled(),
    };
    d.onCrystalGone = () => undefined;
  }

  private get active(): boolean {
    return this.ctx.dim === DIM_END;
  }

  /** El y del portal de salida (el bloque más alto del centro de la isla, como en la generación). */
  private podiumY(): number {
    if (this.portalY < 0) {
      const gen = this.ctx.world.gen;
      this.portalY = gen instanceof EndGenerator ? gen.surfaceAt(0, 0) : 64;
      if (this.portalY < 1) this.portalY = 64;
    }
    return this.portalY;
  }

  private level(): EndLevel {
    const w = this.ctx.world;
    return {
      get: (x, y, z) => w.getBlock(x, y, z),
      set: (x, y, z, id) => {
        if (w.getBlock(x, y, z) !== id) w.setBlock(x, y, z, id);
      },
    };
  }

  private load(x0: number, z0: number, x1: number, z1: number): void {
    const now = this.ctx.now();
    for (let cz = Math.floor(z0 / CHUNK_SIZE); cz <= Math.floor(z1 / CHUNK_SIZE); cz++) {
      for (let cx = Math.floor(x0 / CHUNK_SIZE); cx <= Math.floor(x1 / CHUNK_SIZE); cx++) this.ctx.world.ensureChunk(cx, cz, now);
    }
  }

  /** Cristales en lo alto de los pilares (los que cuentan para el dragón). */
  private spikeCrystals(): number {
    let n = 0;
    const spikes = endSpikes(this.ctx.seed);
    for (const e of this.ctx.entities.list.values()) {
      if (e.type !== ENT_END_CRYSTAL || e.dead) continue;
      if (spikes.some((s) => Math.abs(e.x - s.x - 0.5) < 1 && Math.abs(e.z - s.z - 0.5) < 1 && Math.abs(e.y - s.height - 1) < 1)) n++;
    }
    return n;
  }

  private dragon(): Entity | null {
    for (const e of this.ctx.entities.list.values()) if (e.type === MOB_ENDER_DRAGON) return e;
    return null;
  }

  // ------------------------------------------------------------------ tick

  tick(): void {
    if (!this.active) return;
    const players = [...this.ctx.sessions()].filter((s) => s.joined && !(s.s & STATE_DEAD));
    if (players.length === 0) return;
    if (!this.loaded) {
      this.loaded = true;
      this.load(-48, -48, 48, 48);
    }
    if (!this.save.init) this.start();
    else if (!this.restored) this.restore();
    this.restored = true;
    // Si el dragón desaparece sin terminar de morir (un comando), el combate se da por ganado igual.
    const dr = this.dragon();
    if (!this.save.killed && !this.respawn && !dr) this.dragonKilled(false);
    // La zona del combate sigue cargada por donde vuele el dragón (en Java, el combate mantiene su zona).
    if (dr && this.ctx.tickCount % 10 === 0) this.load(dr.x - 24, dr.z - 24, dr.x + 24, dr.z + 24);
    this.bossBar(players);
    this.gateways(players);
    if (this.respawn) this.respawnTick();
  }

  /** Primera vez: cristales en los pilares y el dragón. */
  private start(): void {
    const d = this.ctx.entities.dragon;
    for (const s of endSpikes(this.ctx.seed)) d.spawnCrystal(s.x + 0.5, s.height + 1, s.z + 0.5, true);
    d.spawn(0.5, 128, 0.5);
    this.save.init = true;
    this.save.gates = gatewayOrder(this.ctx.seed);
    this.persist();
  }

  /** Tras reiniciar el servidor: los cristales y el dragón guardados. */
  private restore(): void {
    const d = this.ctx.entities.dragon;
    for (const [x, y, z, b] of this.save.crystals) {
      this.load(x, z, x, z);
      d.spawnCrystal(x, y, z, b === 1);
    }
    if (!this.save.killed && this.save.dragon) {
      const [x, y, z, hp] = this.save.dragon;
      const e = d.spawn(x, y, z);
      if (e) e.health = Math.max(1, Math.min(DRAGON_HEALTH, hp));
    }
  }

  private persist(): void {
    const crystals: [number, number, number, number][] = [];
    for (const e of this.ctx.entities.list.values()) {
      if (e.type === ENT_END_CRYSTAL && !e.dead) crystals.push([round(e.x), round(e.y), round(e.z), e.variant ? 1 : 0]);
    }
    const dr = this.dragon();
    this.save.crystals = crystals;
    this.save.dragon = dr && dr.health > 0 ? [round(dr.x), round(dr.y), round(dr.z), Math.round(dr.health)] : this.save.killed ? null : this.save.dragon;
    this.store.setMeta('endFight', JSON.stringify(this.save));
  }

  flush(store: ServerStore): void {
    if (!this.active || !this.save.init) return;
    this.store = store;
    this.persist();
  }

  // ------------------------------------------------------------------ barra del jefe

  private bossBar(players: Session[]): void {
    const dr = this.dragon();
    const tick = this.ctx.tickCount;
    for (const s of players) {
      const near = !!dr && Math.hypot(s.p[0], s.p[2]) < BOSS_RANGE;
      const h = near ? Math.max(0, Math.min(1, dr!.health / DRAGON_HEALTH)) : -1;
      const last = this.bossSent.get(s.id);
      if (last === undefined && h < 0) continue;
      if (last !== undefined && Math.abs(last - h) < 0.002 && tick % 40 !== 0) continue;
      if (h < 0) this.bossSent.delete(s.id);
      else this.bossSent.set(s.id, h);
      this.ctx.send(s, h < 0 ? { t: 'boss', h: -1 } : { t: 'boss', n: 'Dragón de Ender', h: Math.round(h * 1000) / 1000 });
    }
  }

  onLeave(s: Session): void {
    this.bossSent.delete(s.id);
    this.gateCooldown.delete(s.id);
  }

  // ------------------------------------------------------------------ muerte del dragón

  /** setDragonKilled: portal encendido, huevo la primera vez y una puerta del End nueva. */
  private dragonKilled(real = true): void {
    if (this.save.killed) return;
    const y = this.podiumY();
    this.load(-8, -8, 8, 8);
    drawPodium(this.level(), 0, y, 0, true);
    if (!this.save.prev) this.ctx.world.setBlock(0, y + 4, 0, DRAGON_EGG);
    this.save.prev = true;
    this.save.killed = true;
    this.save.dragon = null;
    if (real || this.save.gates.length) this.spawnGateway();
    this.persist();
  }

  private spawnGateway(): void {
    const i = this.save.gates.shift();
    if (i === undefined) return;
    const [x, y, z] = gatewayPos(i);
    this.load(x - 2, z - 2, x + 2, z + 2);
    drawGateway(this.level(), x, y, z);
    this.ctx.fx('gateway_spawn', x + 0.5, y + 0.5, z + 0.5);
  }

  // ------------------------------------------------------------------ puertas del End

  private gateways(players: Session[]): void {
    const w = this.ctx.world;
    const tick = this.ctx.tickCount;
    for (const s of players) {
      const until = this.gateCooldown.get(s.id) ?? 0;
      if (tick < until) continue;
      const x = Math.floor(s.p[0]), y = Math.floor(s.p[1]), z = Math.floor(s.p[2]);
      let gy = -1;
      if (w.getBlock(x, y, z) === END_GATEWAY) gy = y;
      else if (w.getBlock(x, y + 1, z) === END_GATEWAY) gy = y + 1;
      if (gy < 0) continue;
      const to = this.gatewayExit(x, gy, z);
      if (!to) continue;
      this.gateCooldown.set(s.id, tick + 40);
      this.ctx.fx('gateway_beam', x + 0.5, gy + 0.5, z + 0.5);
      s.p = [to[0], to[1], to[2]];
      this.ctx.send(s, { t: 'moveTo', p: [to[0], to[1], to[2]] });
    }
  }

  /** A dónde lleva la puerta de (x, y, z). */
  private gatewayExit(x: number, y: number, z: number): [number, number, number] | null {
    const link = this.save.links.find((l) => (l[0] === x && l[1] === y && l[2] === z) || (l[3] === x && l[4] === y && l[5] === z));
    if (link) {
      const back = link[0] === x && link[1] === y && link[2] === z ? [link[3], link[4], link[5]] : [link[0], link[1], link[2]];
      return this.safeNear(back[0], back[1], back[2]);
    }
    if (Math.hypot(x, z) < 150) {
      const far = this.makeFarGateway(x, z);
      if (!far) return null;
      this.save.links.push([x, y, z, far[0], far[1], far[2]]);
      this.persist();
      return this.safeNear(far[0], far[1], far[2]);
    }
    // Las de las tierras altas (end_gateway_return): a la plataforma de llegada, justo encima.
    return [END_SPAWN[0] + 0.5, END_SPAWN[1] + 1, END_SPAWN[2] + 0.5];
  }

  /**
   * findExitPosition: a 1024 bloques en la dirección de la puerta; se va hacia atrás mientras haya isla y hacia
   * delante mientras no, de 16 en 16; allí, 10 por encima de lo más alto del chunk, la puerta de vuelta.
   */
  private makeFarGateway(x: number, z: number): [number, number, number] | null {
    const gen = this.ctx.world.gen;
    const top = (bx: number, bz: number) => (gen instanceof EndGenerator ? gen.surfaceAt(bx, bz) : -1);
    const d = Math.hypot(x, z) || 1;
    const dx = x / d, dz = z / d;
    let [tx, tz] = gatewayFarTarget(x, z);
    const chunkTop = (cx: number, cz: number): [number, number, number] | null => {
      let best: [number, number, number] | null = null;
      for (let lz = 0; lz < 16; lz += 2) for (let lx = 0; lx < 16; lx += 2) {
        const h = top(cx * 16 + lx, cz * 16 + lz);
        if (h > 0 && (!best || h > best[1])) best = [cx * 16 + lx, h, cz * 16 + lz];
      }
      return best;
    };
    for (let i = 16; chunkTop(Math.floor(tx / 16), Math.floor(tz / 16)) && i-- > 0;) {
      tx -= dx * 16;
      tz -= dz * 16;
    }
    for (let i = 16; !chunkTop(Math.floor(tx / 16), Math.floor(tz / 16)) && i-- > 0;) {
      tx += dx * 16;
      tz += dz * 16;
    }
    const cx = Math.floor(tx / 16), cz = Math.floor(tz / 16);
    this.load(cx * 16 - 16, cz * 16 - 16, cx * 16 + 31, cz * 16 + 31);
    let at = chunkTop(cx, cz);
    if (!at) {
      // Sin isla en todo el recorrido: se crea una pequeña (EndIslandFeature) a y = 75.
      at = [Math.floor(tx), 75, Math.floor(tz)];
      const w = this.ctx.world;
      let size = 4 + Math.floor(this.ctx.rand() * 3);
      for (let dy = 0; size > 0.5; dy--) {
        for (let ox = -Math.ceil(size); ox <= Math.ceil(size); ox++) for (let oz = -Math.ceil(size); oz <= Math.ceil(size); oz++) {
          if (ox * ox + oz * oz <= (size + 1) * (size + 1)) w.setBlock(at[0] + ox, 75 + dy, at[2] + oz, END_STONE);
        }
        size -= Math.floor(this.ctx.rand() * 2) + 0.5;
      }
    }
    const g: [number, number, number] = [at[0], at[1] + 10, at[2]];
    drawGateway(this.level(), g[0], g[1], g[2]);
    return g;
  }

  /** findOrCreateValidTeleportPos: suelo firme con dos de aire encima cerca de la puerta; si no, encima de ella. */
  private safeNear(x: number, y: number, z: number): [number, number, number] {
    const w = this.ctx.world;
    this.load(x - 6, z - 6, x + 6, z + 6);
    let best: [number, number, number] | null = null, bd = Infinity;
    for (let dx = -5; dx <= 5; dx++) {
      for (let dz = -5; dz <= 5; dz++) {
        for (let dy = -12; dy <= 4; dy++) {
          const bx = x + dx, by = y + dy, bz = z + dz;
          const below = w.getBlock(bx, by - 1, bz);
          if (below <= 0 || !BLOCK_SOLID[below] || below === BEDROCK || w.getBlock(bx, by, bz) !== AIR || w.getBlock(bx, by + 1, bz) !== AIR) continue;
          const d = dx * dx + dz * dz + dy * dy * 0.5;
          if (d < bd && (Math.abs(dx) > 1 || Math.abs(dz) > 1)) {
            bd = d;
            best = [bx + 0.5, by, bz + 0.5];
          }
        }
      }
    }
    return best ?? [x + 0.5, y + 3, z + 0.5];
  }

  // ------------------------------------------------------------------ objetos y bloques

  /** Clic derecho con algo: el cristal del End sobre obsidiana o lecho de roca, o el huevo de dragón. */
  use(_s: Session, x: number, y: number, z: number, id: number, item: number): boolean {
    const w = this.ctx.world;
    if (id === DRAGON_EGG) {
      this.eggTeleport(x, y, z);
      return true;
    }
    if (item !== END_CRYSTAL || (id !== OBSIDIAN && id !== BEDROCK)) return false;
    if (w.getBlock(x, y + 1, z) !== AIR || w.getBlock(x, y + 2, z) !== AIR) return true;
    for (const e of this.ctx.entities.list.values()) {
      if (!e.dead && Math.abs(e.x - x - 0.5) < 1 + e.width / 2 && Math.abs(e.z - z - 0.5) < 1 + e.width / 2 && e.y < y + 3 && e.y + e.height > y + 1) return true;
    }
    this.ctx.entities.dragon.spawnCrystal(x + 0.5, y + 1, z + 0.5, false);
    if (this.active) this.tryRespawn();
    return true;
  }

  /** DragonEggBlock.teleport: hasta 1000 intentos a ±15 en horizontal y ±7 en vertical, a un hueco de aire. */
  private eggTeleport(x: number, y: number, z: number): void {
    const w = this.ctx.world;
    const r = () => this.ctx.rand();
    for (let i = 0; i < 1000; i++) {
      const tx = x + Math.floor(r() * 16) - Math.floor(r() * 16), ty = y + Math.floor(r() * 8) - Math.floor(r() * 8), tz = z + Math.floor(r() * 16) - Math.floor(r() * 16);
      if (ty < 1 || w.getBlock(tx, ty, tz) !== AIR) continue;
      w.setBlock(x, y, z, AIR);
      w.setBlock(tx, ty, tz, DRAGON_EGG);
      this.ctx.fx('egg_teleport', x + 0.5, y + 0.5, z + 0.5, tx - x, (ty - y) * 1000 + (tz - z));
      return;
    }
  }

  // ------------------------------------------------------------------ reaparición

  /** tryRespawn: con el dragón muerto, un cristal en cada uno de los cuatro lados del portal de salida. */
  private tryRespawn(): void {
    if (!this.save.killed || this.respawn || this.dragon()) return;
    const y = this.podiumY() + 1;
    const found: number[] = [];
    for (const [dx, dz] of [[0, -2], [2, 0], [0, 2], [-2, 0]]) {
      const c = [...this.ctx.entities.list.values()].find((e) => e.type === ENT_END_CRYSTAL && !e.dead &&
        e.x + 1 > dx && e.x - 1 < dx + 1 && e.z + 1 > dz && e.z - 1 < dz + 1 && e.y < y + 1 && e.y + 2 > y);
      if (!c) return;
      found.push(c.id);
    }
    this.respawn = { stage: 0, time: 0, spike: 0, crystals: found };
    for (const id of found) {
      const c = this.ctx.entities.list.get(id);
      if (c) c.leash = [0, y + 127, 0];
    }
  }

  /**
   * DragonRespawnAnimation: 5 s con los cristales apuntando al cielo, cada pilar se rehace (con su cristal) entre
   * explosiones y, tras el último, los cuatro cristales estallan sin romper nada y aparece el dragón.
   */
  private respawnTick(): void {
    const r = this.respawn!;
    r.time++;
    const spikes = endSpikes(this.ctx.seed);
    if (r.stage === 0 && r.time >= 100) {
      r.stage = 1;
      r.time = 0;
    } else if (r.stage === 1 && r.time >= 40) {
      r.time = 0;
      const s = spikes[r.spike];
      this.load(s.x - 8, s.z - 8, s.x + 8, s.z + 8);
      for (const id of r.crystals) {
        const c = this.ctx.entities.list.get(id);
        if (c) c.leash = [s.x, s.height + 1, s.z];
      }
      this.ctx.fx('explode', s.x + 0.5, s.height, s.z + 0.5, 4);
      drawSpike(this.level(), s, FIRE);
      for (const e of this.ctx.entities.list.values()) {
        if (e.type === ENT_END_CRYSTAL && Math.abs(e.x - s.x - 0.5) < 1 && Math.abs(e.z - s.z - 0.5) < 1 && Math.abs(e.y - s.height - 1) < 1) this.ctx.entities.remove(e.id);
      }
      this.ctx.entities.dragon.spawnCrystal(s.x + 0.5, s.height + 1, s.z + 0.5, true);
      if (++r.spike >= spikes.length) r.stage = 2;
    } else if (r.stage === 2 && r.time >= 100) {
      for (const id of r.crystals) {
        const c = this.ctx.entities.list.get(id);
        if (!c) continue;
        this.ctx.entities.remove(c.id);
        this.ctx.fx('explode', c.x, c.y, c.z, 6);
      }
      const y = this.podiumY();
      drawPodium(this.level(), 0, y, 0, false);
      this.ctx.entities.dragon.spawn(0.5, 128, 0.5);
      this.save.killed = false;
      this.respawn = null;
      this.persist();
    }
  }
}

function round(v: number): number {
  return Math.round(v * 100) / 100;
}
