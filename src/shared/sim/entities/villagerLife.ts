// Vida de los aldeanos (fase 6): profesión según el bloque de trabajo libre más cercano, paseo por la
// aldea de día, vuelta a casa de noche (abriendo y cerrando puertas), huida de los zombis, reposición
// de las ofertas y el comerciante ambulante que se marcha pasado un tiempo. El comercio en sí (qué se
// paga y qué se recibe) es del sistema de comercio del servidor (server/trading.ts).
import {
  MOBS, MOB_VILLAGER, MOB_WANDERING_TRADER, MOB_ZOMBIE, MOB_HUSK, MOB_ZOMBIE_VILLAGER, MOB_DROWNED, MOB_PILLAGER,
  MOB_VINDICATOR, MOB_EVOKER, MOB_VEX, MOB_RAVAGER, isVillagerType,
} from '../../mobs';
import { AIR, isDoor, familyBase, stateProps } from '../../blocks';
import { PROFESSIONS, PROF_NONE, levelForXp, MAX_LEVEL } from '../../villagers';
import { toggleEdits } from '../../placement';
import { findPath, type PathNode } from '../pathfind';
import type { BlockGetter } from '../physics';
import { posKey } from '../posKey';
import { TAU, type PlayerView, type Entity } from './types';
import type { Entities } from './Entities';

type Vec3 = [number, number, number];

/** De qué huyen los aldeanos: zombis y (fase 6, asaltos) los asaltantes. */
const THREATS = new Set([
  MOB_ZOMBIE, MOB_HUSK, MOB_ZOMBIE_VILLAGER, MOB_DROWNED, MOB_PILLAGER, MOB_VINDICATOR, MOB_EVOKER, MOB_VEX, MOB_RAVAGER,
]);

export interface VillagerData {
  /** Profesión (índice de PROFESSIONS; 0 = sin oficio). */
  prof: number;
  /** Nivel 1..5 y experiencia de comercio. */
  level: number;
  xp: number;
  /** Semilla de sus ofertas. */
  seed: number;
  /** Usos de cada oferta (por su clave) desde la última reposición. */
  uses: Record<number, number>;
  /** Casa (donde duerme), punto de reunión de la aldea (el pozo) y bloque de trabajo. */
  home: Vec3 | null;
  meet: Vec3 | null;
  job: Vec3 | null;
  /** Jugador que comercia con él (se queda quieto mirándolo). */
  trading: string | null;
  /** Comerciante ambulante: segundos hasta que se va (0 = aldeano). */
  life: number;
  // --- estado temporal (no se guarda) ---
  scan: number;
  restock: number;
  fleeScan: number;
  flee: number;
  fleeFrom: [number, number];
  dest: Vec3 | null;
  destT: number;
  idle: number;
  path: PathNode[] | null;
  pathIdx: number;
  repath: number;
  /** Puertas que abrió: [x, y, z, segundos desde que pasó]. */
  doors: [number, number, number, number][];
}

/** Radio en el que un aldeano busca bloque de trabajo (como en Minecraft). */
export const JOB_RADIUS = 16;
/** Segundos entre reposiciones de las ofertas. */
const RESTOCK_SECONDS = 300;
/** Distancia a la que huye de un zombi. */
const FLEE_RANGE = 8;

/** Bloque de trabajo (estado base) → profesión. */
const WORKSTATIONS = new Map<number, number>(PROFESSIONS.filter((p) => p.block).map((p) => [p.block, p.id]));

/** Lo que se guarda de un aldeano (junto a los demás datos del animal). */
export interface VillagerSave {
  vil: { p: number; l: number; x: number; s: number; h: Vec3 | null; m: Vec3 | null; j: Vec3 | null; t: number };
}

const vec = (v: unknown): Vec3 | null =>
  Array.isArray(v) && v.length === 3 && v.every((n) => Number.isInteger(n)) ? [v[0], v[1], v[2]] : null;

export class VillagerLife {
  /** Bloques de trabajo ocupados: posición → id del aldeano. */
  private claims = new Map<number, number>();

  constructor(private m: Entities) {}

  /** Datos de aldeano de una entidad (se crean la primera vez: los invocados con /invocar no los traen). */
  data(e: Entity): VillagerData {
    if (!e.villager) {
      e.villager = {
        prof: PROF_NONE, level: 1, xp: 0, seed: Math.floor(this.m.rand() * 2 ** 31), uses: {}, home: null,
        meet: [Math.floor(e.x), Math.floor(e.y), Math.floor(e.z)], job: null, trading: null,
        life: e.type === MOB_WANDERING_TRADER ? 2400 : 0,
        scan: this.m.rand() * 2, restock: RESTOCK_SECONDS, fleeScan: 0, flee: 0, fleeFrom: [0, 0], dest: null, destT: 0,
        idle: this.m.rand() * 3, path: null, pathIdx: 0, repath: 0, doors: [],
      };
    }
    return e.villager;
  }

  /** Hace aparecer un aldeano (al generarse una aldea o para las pruebas). */
  spawn(x: number, y: number, z: number, home: Vec3 | null, meet: Vec3 | null, type = MOB_VILLAGER): Entity | null {
    const e = this.m.spawnMob(type, x, y, z);
    if (!e) return null;
    const v = this.data(e);
    v.home = home;
    v.meet = meet ?? v.meet;
    return e;
  }

  // ------------------------------------------------------------------ cada tick

  /** Profesión, reposición, huida, puertas y marcha del comerciante. */
  tick(e: Entity, dt: number): void {
    const v = this.data(e);
    e.variant = v.prof;
    if (e.dead) {
      this.release(e);
      return;
    }
    // Comerciante ambulante: se va cuando se le acaba el tiempo (si nadie comercia con él).
    if (e.type === MOB_WANDERING_TRADER) {
      v.life -= dt;
      if (v.life <= 0 && !v.trading) {
        this.m.host.fx('teleport', e.x, e.y + 1, e.z, e.type);
        this.m.remove(e.id);
        return;
      }
    }
    v.restock -= dt;
    if (v.restock <= 0) {
      v.restock = RESTOCK_SECONDS;
      // Sólo repone quien tiene su bloque de trabajo (o el comerciante, que no tiene).
      if (v.job || e.type === MOB_WANDERING_TRADER) v.uses = {};
    }
    v.fleeScan -= dt;
    if (v.fleeScan <= 0) {
      v.fleeScan = 0.5;
      const z = this.nearestZombie(e);
      if (z) {
        v.flee = 3;
        v.fleeFrom = [z.x, z.z];
      }
    }
    if (v.flee > 0) v.flee -= dt;
    if (e.type === MOB_VILLAGER) {
      v.scan -= dt;
      if (v.scan <= 0) {
        v.scan = 4 + this.m.rand() * 2;
        this.checkJob(e, v);
      }
    }
    this.doorTick(e, v, dt);
  }

  private nearestZombie(e: Entity): Entity | null {
    let best: Entity | null = null, bd = FLEE_RANGE;
    for (const o of this.m.list.values()) {
      if (!THREATS.has(o.type) || o.dead) continue;
      const d = Math.hypot(o.x - e.x, o.z - e.z);
      if (d < bd && Math.abs(o.y - e.y) < 4) {
        bd = d;
        best = o;
      }
    }
    return best;
  }

  // ------------------------------------------------------------------ profesión

  /** Libera el bloque de trabajo de un aldeano (al morir o perder el oficio). */
  release(e: Entity): void {
    const v = e.villager;
    if (!v?.job) return;
    const k = posKey(v.job[0], v.job[1], v.job[2]);
    if (this.claims.get(k) === e.id) this.claims.delete(k);
  }

  /** ¿Está libre el bloque de trabajo de la posición `k` (o lo tiene este aldeano)? */
  private free(k: number, e: Entity): boolean {
    const owner = this.claims.get(k);
    if (owner === undefined || owner === e.id) return true;
    const o = this.m.list.get(owner);
    const ok = !!o && !o.dead && !!o.villager?.job && posKey(o.villager.job[0], o.villager.job[1], o.villager.job[2]) === k;
    if (!ok) this.claims.delete(k);
    return !ok;
  }

  /** Comprueba el bloque de trabajo actual y, si no tiene, busca el libre más cercano. */
  checkJob(e: Entity, v = this.data(e)): void {
    const w = this.m.w;
    if (v.job) {
      const b = w.getBlock(v.job[0], v.job[1], v.job[2]);
      if (b < 0) return; // chunk sin cargar: no se sabe
      const k = posKey(v.job[0], v.job[1], v.job[2]);
      if (WORKSTATIONS.get(familyBase(b)) === v.prof && this.free(k, e)) {
        this.claims.set(k, e.id);
        return;
      }
      // Le quitaron el bloque: pierde el trabajo; si aún no ha comerciado, también el oficio.
      this.release(e);
      v.job = null;
      if (v.xp === 0 && v.level === 1) {
        v.prof = PROF_NONE;
        e.variant = PROF_NONE;
      }
    }
    const found = this.findJob(e, v.prof);
    if (!found) return;
    const [x, y, z, prof] = found;
    v.job = [x, y, z];
    this.claims.set(posKey(x, y, z), e.id);
    if (v.prof !== prof) {
      v.prof = prof;
      v.uses = {};
      e.variant = prof;
      this.m.host.fx('villager_job', e.x, e.y + e.height + 0.2, e.z, e.type);
    }
  }

  /** Bloque de trabajo libre más cercano en el radio (de la profesión dada, o de cualquiera si no tiene). */
  findJob(e: Entity, prof: number): [number, number, number, number] | null {
    const w = this.m.w;
    const ex = Math.floor(e.x), ey = Math.floor(e.y), ez = Math.floor(e.z);
    let best: [number, number, number, number] | null = null, bd = Infinity;
    for (let dy = -4; dy <= 4; dy++) {
      for (let dz = -JOB_RADIUS; dz <= JOB_RADIUS; dz++) {
        for (let dx = -JOB_RADIUS; dx <= JOB_RADIUS; dx++) {
          const d = dx * dx + dz * dz + dy * dy * 2;
          if (d >= bd || dx * dx + dz * dz > JOB_RADIUS * JOB_RADIUS) continue;
          const b = w.getBlock(ex + dx, ey + dy, ez + dz);
          if (b <= 0) continue;
          const p = WORKSTATIONS.get(familyBase(b));
          if (p === undefined || (prof !== PROF_NONE && p !== prof)) continue;
          if (!this.free(posKey(ex + dx, ey + dy, ez + dz), e)) continue;
          bd = d;
          best = [ex + dx, ey + dy, ez + dz, p];
        }
      }
    }
    return best;
  }

  /** Suma experiencia de comercio; devuelve true si sube de nivel. */
  addXp(e: Entity, xp: number): boolean {
    const v = this.data(e);
    if (e.type !== MOB_VILLAGER) return false;
    v.xp += xp;
    const lvl = Math.min(MAX_LEVEL, levelForXp(v.xp));
    if (lvl <= v.level) return false;
    v.level = lvl;
    this.m.host.fx('villager_levelup', e.x, e.y + e.height, e.z, e.type);
    return true;
  }

  // ------------------------------------------------------------------ movimiento

  /**
   * Objetivo del aldeano (deja la dirección en ai.goalDir y a quién mira en ai.lookAt). Siempre
   * decide él: comerciar, huir, ir a casa de noche o pasear por la aldea.
   */
  goal(e: Entity, players: PlayerView[], dt: number): boolean {
    const v = this.data(e);
    const ai = e.ai!;
    const def = MOBS[e.type];
    ai.lookAt = null;
    ai.goalDir = [0, 0, 0, 0];
    if (v.trading) {
      const p = players.find((pp) => pp.id === v.trading && pp.alive);
      if (p && Math.hypot(p.x - e.x, p.z - e.z) < 8) {
        ai.lookAt = [p.x, p.y + 1.6, p.z];
        return true;
      }
      v.trading = null;
    }
    if (v.flee > 0) {
      const dx = e.x - v.fleeFrom[0], dz = e.z - v.fleeFrom[1];
      const d = Math.hypot(dx, dz) || 1;
      ai.goalDir = [dx / d, dz / d, def.run, 0];
      v.dest = null;
      return true;
    }
    // De noche (o si hay un asalto en la aldea, fase 6), a casa.
    const night = this.m.host.sunHeight() < 0.02 || this.m.alarmed(e.x, e.z);
    if (night && e.type === MOB_VILLAGER) {
      const home = v.home ?? v.meet;
      if (home && Math.hypot(home[0] + 0.5 - e.x, home[2] + 0.5 - e.z) > 0.8) this.walkTo(e, v, home, def.walk, dt);
      v.dest = null;
      return true;
    }
    // Día: pasear entre la plaza, su bloque de trabajo y algún punto al azar cerca.
    if (v.idle > 0) {
      v.idle -= dt;
      const near = players.find((p) => p.alive && Math.hypot(p.x - e.x, p.z - e.z) < 5);
      if (near) ai.lookAt = [near.x, near.y + 1.6, near.z];
      return true;
    }
    if (!v.dest) {
      v.destT = 0;
      const base = v.meet ?? [Math.floor(e.x), Math.floor(e.y), Math.floor(e.z)] as Vec3;
      if (Math.hypot(base[0] - e.x, base[2] - e.z) > 28) v.dest = base;
      else if (v.job && this.m.rand() < 0.35) v.dest = v.job;
      else {
        const a = this.m.rand() * TAU, r = 3 + this.m.rand() * 10;
        v.dest = [Math.floor(base[0] + Math.cos(a) * r), base[1], Math.floor(base[2] + Math.sin(a) * r)];
      }
    }
    v.destT += dt;
    const reach = v.dest === v.job ? 1.8 : 1.2;
    if (Math.hypot(v.dest[0] + 0.5 - e.x, v.dest[2] + 0.5 - e.z) < reach || v.destT > 20) {
      if (v.dest === v.job && v.job) ai.lookAt = [v.job[0] + 0.5, v.job[1] + 0.8, v.job[2] + 0.5];
      v.dest = null;
      v.path = null;
      v.idle = 2 + this.m.rand() * 6;
      return true;
    }
    this.walkTo(e, v, v.dest, def.walk, dt);
    return true;
  }

  /** Camino A* en el que las puertas cuentan como paso (el aldeano las abre al llegar). */
  private walkTo(e: Entity, v: VillagerData, to: Vec3, speed: number, dt: number): void {
    const ai = e.ai!;
    v.repath -= dt;
    if (!v.path || v.repath <= 0 || ai.stuck > 1) {
      v.repath = 1.5 + this.m.rand();
      const w = this.m.w;
      const doorsOpen: BlockGetter = { getBlock: (x, y, z) => {
        const b = w.getBlock(x, y, z);
        return b > 0 && isDoor(b) ? AIR : b;
      } };
      v.path = findPath(doorsOpen, Math.floor(e.x), Math.floor(e.y + 0.01), Math.floor(e.z), to[0], to[1], to[2], 2, 350);
      v.pathIdx = 0;
    }
    let tx = to[0] + 0.5, tz = to[2] + 0.5, up = false;
    const path = v.path;
    if (path && v.pathIdx < path.length) {
      let node = path[v.pathIdx];
      if (Math.hypot(node[0] + 0.5 - e.x, node[2] + 0.5 - e.z) < 0.4 && Math.abs(node[1] - e.y) < 1.2) {
        v.pathIdx++;
        node = path[Math.min(v.pathIdx, path.length - 1)];
      }
      tx = node[0] + 0.5;
      tz = node[2] + 0.5;
      up = node[1] > Math.floor(e.y + 0.01);
    }
    const dx = tx - e.x, dz = tz - e.z;
    const d = Math.hypot(dx, dz) || 1;
    ai.goalDir = [dx / d, dz / d, speed, up ? 1 : 0];
    this.openDoorAhead(e, v, dx / d, dz / d);
  }

  // ------------------------------------------------------------------ puertas

  /** Abre la puerta cerrada que tiene delante (y la apunta para cerrarla después). */
  private openDoorAhead(e: Entity, v: VillagerData, dx: number, dz: number): void {
    const w = this.m.w;
    const x = Math.floor(e.x + dx * 0.8), z = Math.floor(e.z + dz * 0.8);
    for (const y of [Math.floor(e.y + 0.01), Math.floor(e.y + 0.01) + 1]) {
      const b = w.getBlock(x, y, z);
      if (b <= 0 || !isDoor(b) || stateProps(b)?.open) continue;
      const edits = toggleEdits((bx, by, bz) => w.getBlock(bx, by, bz), x, y, z, 0);
      if (!edits) return;
      for (const [ex, ey, ez, id] of edits) w.setBlock(ex, ey, ez, id);
      v.doors.push([x, y, z, 0]);
      return;
    }
  }

  /** Cierra las puertas que abrió cuando ya las ha cruzado. */
  private doorTick(e: Entity, v: VillagerData, dt: number): void {
    if (v.doors.length === 0) return;
    const w = this.m.w;
    v.doors = v.doors.filter((dd) => {
      dd[3] += dt;
      const far = Math.hypot(dd[0] + 0.5 - e.x, dd[2] + 0.5 - e.z) > 1.6;
      if (!far && dd[3] < 10) return true;
      const b = w.getBlock(dd[0], dd[1], dd[2]);
      if (b > 0 && isDoor(b) && stateProps(b)?.open) {
        const edits = toggleEdits((bx, by, bz) => w.getBlock(bx, by, bz), dd[0], dd[1], dd[2], 0);
        for (const [ex, ey, ez, id] of edits ?? []) w.setBlock(ex, ey, ez, id);
      }
      return false;
    });
  }

  // ------------------------------------------------------------------ guardado

  save(e: Entity): VillagerSave | null {
    const v = e.villager;
    if (!v || !isVillagerType(e.type)) return null;
    return { vil: { p: v.prof, l: v.level, x: v.xp, s: v.seed, h: v.home, m: v.meet, j: v.job, t: Math.round(v.life) } };
  }

  restore(e: Entity, raw: unknown): void {
    if (!raw || typeof raw !== 'object' || !('vil' in raw)) return;
    const s = (raw as VillagerSave).vil;
    if (!s || typeof s !== 'object') return;
    const v = this.data(e);
    const int = (n: unknown, lo: number, hi: number, def: number) => (Number.isInteger(n) && (n as number) >= lo && (n as number) <= hi ? (n as number) : def);
    v.prof = int(s.p, 0, PROFESSIONS.length - 1, PROF_NONE);
    v.xp = int(s.x, 0, 1_000_000, 0);
    v.level = Math.max(int(s.l, 1, MAX_LEVEL, 1), Math.min(MAX_LEVEL, levelForXp(v.xp)));
    v.seed = int(s.s, 0, 2 ** 31, v.seed);
    v.home = vec(s.h);
    v.meet = vec(s.m) ?? v.meet;
    v.job = vec(s.j);
    if (e.type === MOB_WANDERING_TRADER) v.life = int(s.t, 0, 100_000, 600);
    e.variant = v.prof;
  }
}
