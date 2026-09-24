// Entidades del servidor: criaturas (con IA), objetos tirados y flechas.
import {
  MOBS, MOB_PIG, MOB_COW, MOB_SHEEP, MOB_CHICKEN, MOB_ZOMBIE, MOB_HUSK, MOB_SKELETON, MOB_STRAY, MOB_CREEPER,
  MOB_SPIDER, MOB_ENDERMAN, MOB_SQUID, ENT_ITEM, ENT_ARROW, ENT_FALLING, type MobDef,
} from '../mobs';
import { ITEMS, ARROW, maxStack, type ItemStack } from '../items';
import { GRASS, SNOWY_GRASS, AIR, BLOCK_SOLID, BLOCK_FLUID, BLOCK_FLUID_LEVEL, BLOCK_HARDNESS, WATER } from '../blocks';
import { EF_HURT, EF_FIRE, EF_DEAD, EF_ANGRY, EF_ACTION, EF_PICKABLE } from '../protocol';
import { SEA_LEVEL } from '../constants';
import { moveBody, lineOfSight, boxCollides, type Body } from './physics';
import { findPath, standable, type PathNode } from './pathfind';
import type { WorldSim } from './WorldSim';
import { blockDrops } from './drops';

export interface PlayerView {
  id: string;
  name: string;
  x: number;
  y: number;
  z: number;
  alive: boolean;
  creative: boolean;
  /** Entidad a la que mira (para los enderman). */
  lookingAt: number;
}

export interface EntityHost {
  world: WorldSim;
  players(): PlayerView[];
  /** Altura del sol (-1..1). */
  sunHeight(): number;
  raining(): number;
  /** 0 pacífico, 1 fácil, 2 normal, 3 difícil. */
  difficulty(): number;
  hurtPlayer(id: string, amount: number, kx: number, ky: number, kz: number, cause: string): void;
  /** Efecto puntual para los clientes (sonidos, partículas). */
  fx(kind: string, x: number, y: number, z: number, a?: number, b?: number): void;
  /** Cambia un bloque desde la simulación (explosiones, etc.). */
  breakBlock(x: number, y: number, z: number, drop: boolean): void;
  /** Un bloque que caía toca el suelo en la celda (x, y, z). */
  landBlock(x: number, y: number, z: number, block: number): void;
}

interface AI {
  target: string | null;
  goal: PathNode | null;
  path: PathNode[] | null;
  pathIdx: number;
  repath: number;
  think: number;
  attackCd: number;
  shootCd: number;
  fuse: number;
  angry: number;
  panic: number;
  panicFrom: [number, number];
  stuck: number;
  lastX: number;
  lastZ: number;
  swimDir: [number, number, number];
  lookYaw: number;
  teleportCd: number;
}

export interface Entity extends Body {
  id: number;
  type: number;
  yaw: number;
  pitch: number;
  bodyYaw: number;
  health: number;
  maxHealth: number;
  hurt: number;
  invuln: number;
  dead: boolean;
  deathTime: number;
  fire: number;
  burnAcc: number;
  age: number;
  fallStart: number;
  despawn: boolean;
  // Objetos
  stack?: ItemStack;
  pickupDelay?: number;
  owner?: string;
  // Flechas
  shooter?: string | number;
  arrowDamage?: number;
  stuck?: boolean;
  // Bloques que caen
  block?: number;
  ai?: AI;
  /** Bit de estado para los clientes: 1 herido reciente, 2 ardiendo, 4 muerto, 8 enfadado, 16 disparando/mecha. */
  flags: number;
}

const GRAVITY = 32;
const TAU = Math.PI * 2;
/** Límites globales (protegen la memoria y la CPU del servidor): se retiran los más viejos. */
const MAX_ITEMS = 800;
const MAX_ARROWS = 200;
/** Animales en todo el mundo; al llegar al límite se reciclan los que están lejos de todos. */
const MAX_PASSIVE = 300;
/** Distancia a los jugadores a partir de la cual una entidad queda congelada (no se simula). */
const ACTIVE_RANGE = 128;

function angleTo(fromX: number, fromZ: number, toX: number, toZ: number): number {
  return Math.atan2(-(toX - fromX), -(toZ - fromZ));
}

function lerpAngle(a: number, b: number, t: number): number {
  let d = (((b - a) % TAU) + TAU * 1.5) % TAU - Math.PI;
  if (!Number.isFinite(d)) d = 0;
  return a + d * Math.min(1, t);
}

export class Entities {
  readonly list = new Map<number, Entity>();
  private nextId = 1;
  private host: EntityHost;
  private rand = Math.random;
  private spawnTimer = 0;
  private passiveTimer = 3;
  private squidTimer = 5;
  /** Retirados este tick: [id, id del jugador que lo recogió o ''] (para animaciones en clientes). */
  removed: [number, string][] = [];

  constructor(host: EntityHost) {
    this.host = host;
  }

  get w(): WorldSim {
    return this.host.world;
  }

  private base(type: number, x: number, y: number, z: number, width: number, height: number, health: number): Entity {
    return {
      id: this.nextId++, type, x, y, z, vx: 0, vy: 0, vz: 0, width, height, onGround: false, inWater: false,
      inLava: false, hitWall: false, yaw: this.rand() * TAU, pitch: 0, bodyYaw: 0, health, maxHealth: health,
      hurt: 99, invuln: 0, dead: false, deathTime: 0, fire: 0, burnAcc: 0, age: 0, fallStart: y, despawn: false,
      flags: 0,
    };
  }

  spawnMob(type: number, x: number, y: number, z: number): Entity | null {
    const def = MOBS[type];
    if (!def) return null;
    const e = this.base(type, x, y, z, def.width, def.height, def.health);
    e.bodyYaw = e.yaw;
    e.ai = {
      target: null, goal: null, path: null, pathIdx: 0, repath: 0, think: this.rand() * 2, attackCd: 0, shootCd: 1 + this.rand(),
      fuse: 0, angry: 0, panic: 0, panicFrom: [x, z], stuck: 0, lastX: x, lastZ: z, swimDir: [0, 0, 0], lookYaw: e.yaw,
      teleportCd: 0,
    };
    this.list.set(e.id, e);
    return e;
  }

  /** Retira la entidad más antigua de un tipo si se alcanzó su límite. */
  private makeRoom(type: number, max: number): void {
    let n = 0;
    let oldest: Entity | null = null;
    for (const e of this.list.values()) {
      if (e.type !== type) continue;
      n++;
      if (!oldest || e.age > oldest.age) oldest = e;
    }
    if (n >= max && oldest) this.remove(oldest.id);
  }

  spawnItem(stack: ItemStack, x: number, y: number, z: number, vx = 0, vy = 0, vz = 0, owner?: string, delay = 0.5): Entity {
    this.makeRoom(ENT_ITEM, MAX_ITEMS);
    const e = this.base(ENT_ITEM, x, y, z, 0.25, 0.25, 5);
    e.stack = { ...stack };
    e.vx = vx;
    e.vy = vy;
    e.vz = vz;
    e.owner = owner;
    e.pickupDelay = delay;
    this.list.set(e.id, e);
    return e;
  }

  /** Suelta objetos con la dispersión típica de un bloque roto. */
  dropStacks(stacks: ItemStack[], x: number, y: number, z: number): void {
    for (const s of stacks) {
      if (!s || s.count <= 0) continue;
      this.spawnItem(s, x + (this.rand() - 0.5) * 0.4, y, z + (this.rand() - 0.5) * 0.4, (this.rand() - 0.5) * 2, 3 + this.rand() * 1.5, (this.rand() - 0.5) * 2);
    }
  }

  spawnArrow(x: number, y: number, z: number, vx: number, vy: number, vz: number, shooter: string | number, damage: number): Entity {
    this.makeRoom(ENT_ARROW, MAX_ARROWS);
    const e = this.base(ENT_ARROW, x, y, z, 0.2, 0.2, 1);
    e.vx = vx;
    e.vy = vy;
    e.vz = vz;
    e.shooter = shooter;
    e.arrowDamage = damage;
    e.yaw = Math.atan2(-vx, -vz);
    e.pitch = Math.atan2(vy, Math.hypot(vx, vz));
    this.list.set(e.id, e);
    return e;
  }

  spawnFalling(block: number, x: number, y: number, z: number): Entity {
    const e = this.base(ENT_FALLING, x, y, z, 0.98, 0.98, 1);
    e.block = block;
    e.yaw = 0;
    this.list.set(e.id, e);
    return e;
  }

  remove(id: number, collector = ''): void {
    if (this.list.delete(id)) this.removed.push([id, collector]);
  }

  counts(x: number, z: number, radius: number): { hostile: number; passive: number; squid: number } {
    let hostile = 0, passive = 0, squid = 0;
    const r2 = radius * radius;
    for (const e of this.list.values()) {
      if (!e.ai) continue;
      const dx = e.x - x, dz = e.z - z;
      if (dx * dx + dz * dz > r2) continue;
      const def = MOBS[e.type];
      if (e.type === MOB_SQUID) squid++;
      else if (def.hostile) hostile++;
      else passive++;
    }
    return { hostile, passive, squid };
  }

  // ------------------------------------------------------------------ daño

  /** Daño a una entidad; devuelve true si murió. */
  damage(e: Entity, amount: number, fromX: number, fromZ: number, attacker: string | number | null, knock = 1): boolean {
    if (e.dead || !e.ai) return false;
    if (e.invuln > 0) return false;
    e.health -= amount;
    e.invuln = 0.5;
    e.hurt = 0;
    const dx = e.x - fromX, dz = e.z - fromZ;
    const d = Math.hypot(dx, dz) || 1;
    e.vx += (dx / d) * 5 * knock;
    e.vz += (dz / d) * 5 * knock;
    e.vy = Math.max(e.vy, 4 * knock);
    const ai = e.ai;
    const def = MOBS[e.type];
    if (!def.hostile || def.neutral) {
      if (def.hostile && typeof attacker === 'string') {
        ai.angry = 30;
        ai.target = attacker;
      } else {
        ai.panic = 5;
        ai.panicFrom = [fromX, fromZ];
      }
    } else if (typeof attacker === 'string') ai.target = attacker;
    if (e.type === MOB_ENDERMAN && this.rand() < 0.6) this.teleport(e);
    this.host.fx('mob_hurt', e.x, e.y + e.height / 2, e.z, e.type);
    if (e.health <= 0) {
      this.kill(e, true);
      return true;
    }
    return false;
  }

  kill(e: Entity, drops: boolean): void {
    if (e.dead) return;
    e.dead = true;
    e.deathTime = 0;
    e.health = 0;
    this.host.fx('mob_death', e.x, e.y + e.height / 2, e.z, e.type);
    if (drops && e.ai) {
      const def = MOBS[e.type];
      const stacks: ItemStack[] = [];
      for (const [id, min, max] of def.drops) {
        const n = min + Math.floor(this.rand() * (max - min + 1));
        if (n > 0) stacks.push({ id, count: n });
      }
      // Los animales que mueren ardiendo sueltan la carne cocinada.
      if (e.fire > 0) for (const s of stacks) if (ITEMS[s.id]?.smelt && ITEMS[s.id]?.food) s.id = ITEMS[s.id].smelt!;
      this.dropStacks(stacks, e.x, e.y + 0.3, e.z);
    }
  }

  // ------------------------------------------------------------------ explosiones

  explode(x: number, y: number, z: number, power: number): void {
    const r = Math.ceil(power);
    this.host.fx('explode', x, y, z, power);
    for (let dy = -r; dy <= r; dy++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          const d = Math.hypot(dx, dy, dz);
          if (d > power * (0.7 + this.rand() * 0.6)) continue;
          const bx = Math.floor(x) + dx, by = Math.floor(y) + dy, bz = Math.floor(z) + dz;
          const id = this.w.getBlock(bx, by, bz);
          if (id <= 0 || BLOCK_FLUID[id]) continue;
          const h = BLOCK_HARDNESS[id];
          if (h < 0 || h >= 10) continue;
          this.host.breakBlock(bx, by, bz, this.rand() < 0.3);
        }
      }
    }
    const reach = power * 2;
    for (const e of this.list.values()) {
      if (!e.ai || e.dead) continue;
      const d = Math.hypot(e.x - x, e.y + e.height / 2 - y, e.z - z);
      if (d > reach) continue;
      const impact = 1 - d / reach;
      this.damage(e, Math.floor((impact * impact + impact) * 3.5 * power + 1), x, z, null, 1 + impact * 2);
    }
    for (const p of this.host.players()) {
      if (!p.alive || p.creative) continue;
      const d = Math.hypot(p.x - x, p.y + 0.9 - y, p.z - z);
      if (d > reach) continue;
      const impact = 1 - d / reach;
      const dmg = Math.floor((impact * impact + impact) * 3.5 * power + 1) * this.difficultyScale();
      const dd = d || 1;
      this.host.hurtPlayer(p.id, dmg, ((p.x - x) / dd) * impact * 12, 4 + impact * 6, ((p.z - z) / dd) * impact * 12, 'explosion');
    }
  }

  private difficultyScale(): number {
    const d = this.host.difficulty();
    return d <= 1 ? 0.5 : d === 3 ? 1.5 : 1;
  }

  // ------------------------------------------------------------------ bucle

  /** Distancia horizontal al jugador más cercano. */
  private nearestPlayer2D(e: Entity, players: PlayerView[]): number {
    let d = Infinity;
    for (const p of players) d = Math.min(d, Math.hypot(p.x - e.x, p.z - e.z));
    return d;
  }

  tick(dt: number): void {
    const players = this.host.players();
    this.buildItemGrid();
    const active: Entity[] = [];
    for (const e of this.list.values()) {
      const near = this.nearestPlayer2D(e, players);
      // Monstruos y calamares desaparecen lejos de todos (como en Minecraft).
      if (e.ai && !e.dead && (MOBS[e.type].hostile || e.type === MOB_SQUID)) {
        if (near > 96 || (MOBS[e.type].hostile && this.host.difficulty() === 0) || (near > 32 && this.rand() < dt / 40)) {
          this.remove(e.id);
          continue;
        }
      }
      // Lejos de los jugadores o en un chunk sin cargar: congelada.
      if (near > ACTIVE_RANGE || !this.w.isLoaded(Math.floor(e.x / 16), Math.floor(e.z / 16))) continue;
      if (e.ai) active.push(e);
      e.age += dt;
      e.hurt += dt;
      if (e.invuln > 0) e.invuln -= dt;
      if (e.dead) {
        e.deathTime += dt;
        if (e.deathTime > 1.1) this.remove(e.id);
        continue;
      }
      if (e.type === ENT_ITEM) this.itemTick(e, dt, players);
      else if (e.type === ENT_ARROW) this.arrowTick(e, dt, players);
      else if (e.type === ENT_FALLING) this.fallingTick(e, dt);
      else this.mobTick(e, dt, players);
    }
    this.separate(active.filter((e) => !e.dead && this.list.has(e.id)));
    this.spawnTick(dt, players);
  }

  /** Empuje entre criaturas que se solapan (sólo las que se simulan). */
  private separate(mobs: Entity[]): void {
    for (let i = 0; i < mobs.length; i++) {
      for (let j = i + 1; j < mobs.length; j++) {
        const a = mobs[i], b = mobs[j];
        const dx = b.x - a.x, dz = b.z - a.z;
        const min = (a.width + b.width) * 0.5;
        const d2 = dx * dx + dz * dz;
        if (d2 >= min * min || Math.abs(a.y - b.y) > 1.5) continue;
        const d = Math.sqrt(d2) || 0.01;
        const push = (min - d) * 2;
        a.vx -= (dx / d) * push;
        a.vz -= (dz / d) * push;
        b.vx += (dx / d) * push;
        b.vz += (dz / d) * push;
      }
    }
  }

  // ------------------------------------------------------------------ bloques que caen

  private fallingTick(e: Entity, dt: number): void {
    e.vy = Math.max(-40, e.vy - GRAVITY * dt);
    moveBody(e, this.w, dt);
    if (e.onGround || e.age > 30) {
      this.remove(e.id);
      this.host.landBlock(Math.floor(e.x), Math.floor(e.y + 0.1), Math.floor(e.z), e.block ?? AIR);
    }
    e.flags = 0;
  }

  // ------------------------------------------------------------------ objetos

  private itemGrid = new Map<string, Entity[]>();

  private buildItemGrid(): void {
    this.itemGrid.clear();
    for (const e of this.list.values()) {
      if (e.type !== ENT_ITEM || e.dead) continue;
      const k = `${Math.floor(e.x)},${Math.floor(e.y)},${Math.floor(e.z)}`;
      const l = this.itemGrid.get(k);
      if (l) l.push(e);
      else this.itemGrid.set(k, [e]);
    }
  }

  private itemTick(e: Entity, dt: number, _players: PlayerView[]): void {
    if (e.pickupDelay! > 0) e.pickupDelay! -= dt;
    e.flags = e.pickupDelay! <= 0 ? EF_PICKABLE : 0;
    if (e.age > 300) {
      this.remove(e.id);
      return;
    }
    if (e.inWater) {
      e.vy += (1.5 - e.vy) * Math.min(1, dt * 3);
      e.vx *= 1 - Math.min(1, dt * 2);
      e.vz *= 1 - Math.min(1, dt * 2);
    } else {
      e.vy -= 18 * dt;
      const fr = e.onGround ? 8 : 0.5;
      e.vx *= 1 - Math.min(1, dt * fr);
      e.vz *= 1 - Math.min(1, dt * fr);
    }
    if (e.inLava) {
      this.remove(e.id);
      this.host.fx('burn_item', e.x, e.y, e.z);
      return;
    }
    // Si quedó dentro de un bloque, empujarlo hacia arriba.
    if (boxCollides(this.w, e.x - 0.12, e.y, e.z - 0.12, e.x + 0.12, e.y + 0.24, e.z + 0.12)) {
      e.y += 3 * dt;
      e.vy = 0;
      e.onGround = false;
    } else moveBody(e, this.w, dt);
    // Fusionar pilas iguales cercanas (sólo se miran las celdas vecinas).
    if (((e.id + Math.floor(e.age * 4)) & 7) === 0) {
      const near: Entity[] = [];
      const bx = Math.floor(e.x), by = Math.floor(e.y), bz = Math.floor(e.z);
      for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const l = this.itemGrid.get(`${bx + dx},${by + dy},${bz + dz}`);
        if (l) near.push(...l);
      }
      for (const o of near) {
        if (o === e || o.type !== ENT_ITEM || o.dead || !o.stack || !e.stack || !this.list.has(o.id)) continue;
        if (o.stack.id !== e.stack.id || (o.stack.dmg ?? 0) !== (e.stack.dmg ?? 0) || ITEMS[e.stack.id]?.tool) continue;
        if (Math.abs(o.x - e.x) > 0.6 || Math.abs(o.y - e.y) > 0.6 || Math.abs(o.z - e.z) > 0.6) continue;
        const room = maxStack(e.stack.id) - e.stack.count;
        if (room <= 0) continue;
        const n = Math.min(room, o.stack.count);
        e.stack.count += n;
        o.stack.count -= n;
        e.age = Math.min(e.age, o.age);
        if (o.stack.count <= 0) this.remove(o.id);
      }
    }
  }

  /** Un jugador pide recoger un objeto: devuelve la pila si es válido. */
  tryPickup(id: number, p: PlayerView): ItemStack | null {
    const e = this.list.get(id);
    if (!e || e.dead) return null;
    if (e.type === ENT_ARROW) {
      if (!e.stuck || typeof e.shooter !== 'string') return null;
      if (Math.hypot(e.x - p.x, e.y - (p.y + 0.9), e.z - p.z) > 3.5) return null;
      this.remove(e.id, p.id);
      return { id: ARROW, count: 1 };
    }
    if (e.type !== ENT_ITEM || !e.stack) return null;
    if (e.pickupDelay! > 0 && e.owner === p.id) return null;
    if (e.pickupDelay! > 0.3 && e.owner !== p.id) return null;
    const dx = e.x - p.x, dy = e.y - (p.y + 0.9), dz = e.z - p.z;
    if (dx * dx + dy * dy + dz * dz > 3.5 * 3.5) return null;
    const s = e.stack;
    this.remove(e.id, p.id);
    return s;
  }

  // ------------------------------------------------------------------ flechas

  private arrowTick(e: Entity, dt: number, players: PlayerView[]): void {
    if (e.stuck) {
      if (e.age > 30) this.remove(e.id);
      return;
    }
    if (e.age > 20) {
      this.remove(e.id);
      return;
    }
    e.vy -= 20 * dt;
    const drag = e.inWater ? 0.6 : 0.99;
    e.vx *= Math.pow(drag, dt * 20);
    e.vy *= Math.pow(drag, dt * 20);
    e.vz *= Math.pow(drag, dt * 20);
    const speed = Math.hypot(e.vx, e.vy, e.vz);
    const steps = Math.max(1, Math.ceil((speed * dt) / 0.25));
    for (let s = 0; s < steps; s++) {
      const nx = e.x + (e.vx * dt) / steps, ny = e.y + (e.vy * dt) / steps, nz = e.z + (e.vz * dt) / steps;
      const id = this.w.getBlock(Math.floor(nx), Math.floor(ny), Math.floor(nz));
      if (id < 0 || BLOCK_SOLID[id]) {
        e.stuck = true;
        e.age = 0;
        e.vx = e.vy = e.vz = 0;
        e.flags = typeof e.shooter === 'string' ? EF_PICKABLE : 0;
        this.host.fx('arrow_hit', nx, ny, nz);
        return;
      }
      e.x = nx;
      e.y = ny;
      e.z = nz;
      // Daño proporcional a la velocidad (bloques por tick × daño base), como en Minecraft.
      const dmg = Math.max(1, Math.ceil((speed / 20) * (e.arrowDamage ?? 2)));
      for (const m of this.list.values()) {
        if (!m.ai || m.dead || m.id === e.shooter) continue;
        const hw = m.width / 2 + 0.1;
        if (Math.abs(m.x - e.x) < hw && Math.abs(m.z - e.z) < hw && e.y > m.y - 0.1 && e.y < m.y + m.height + 0.1) {
          this.damage(m, dmg, e.x - e.vx, e.z - e.vz, typeof e.shooter === 'string' ? e.shooter : null, 0.6);
          this.host.fx('arrow_hit', e.x, e.y, e.z);
          this.remove(e.id);
          return;
        }
      }
      // Las flechas de jugadores no hieren a otros jugadores (juego cooperativo).
      if (typeof e.shooter !== 'string') for (const p of players) {
        if (!p.alive || p.creative) continue;
        if (Math.abs(p.x - e.x) < 0.4 && Math.abs(p.z - e.z) < 0.4 && e.y > p.y - 0.1 && e.y < p.y + 1.9) {
          const d = Math.hypot(e.vx, e.vz) || 1;
          this.host.hurtPlayer(p.id, dmg * this.difficultyScale(), (e.vx / d) * 3, 3, (e.vz / d) * 3, 'arrow');
          this.host.fx('arrow_hit', e.x, e.y, e.z);
          this.remove(e.id);
          return;
        }
      }
    }
    e.yaw = Math.atan2(-e.vx, -e.vz);
    e.pitch = Math.atan2(e.vy, Math.hypot(e.vx, e.vz));
    const b = this.w.getBlock(Math.floor(e.x), Math.floor(e.y), Math.floor(e.z));
    e.inWater = b > 0 && BLOCK_FLUID[b] === 1;
  }

  // ------------------------------------------------------------------ criaturas

  private nearestPlayer(e: Entity, players: PlayerView[], max: number, needLos: boolean): PlayerView | null {
    let best: PlayerView | null = null;
    let bd = max * max;
    for (const p of players) {
      if (!p.alive || p.creative) continue;
      const dx = p.x - e.x, dy = p.y - e.y, dz = p.z - e.z;
      const d2 = dx * dx + dy * dy * 2 + dz * dz;
      if (d2 >= bd) continue;
      if (needLos && d2 > 36 && !lineOfSight(this.w, e.x, e.y + e.height * 0.85, e.z, p.x, p.y + 1.5, p.z)) continue;
      bd = d2;
      best = p;
    }
    return best;
  }

  private isSunlit(e: Entity): boolean {
    if (this.host.sunHeight() < 0.05 || this.host.raining() > 0.3 || e.inWater) return false;
    const top = this.w.skyTop(Math.floor(e.x), Math.floor(e.z));
    return top >= -1 && e.y + e.height > top + 1;
  }

  private mobTick(e: Entity, dt: number, players: PlayerView[]): void {
    const def = MOBS[e.type];
    const ai = e.ai!;
    const w = this.w;
    // Ambiente: sol, lava, fuego, caída, vacío.
    if (def.burnsInSun && this.isSunlit(e)) e.fire = Math.max(e.fire, 2);
    if (e.inLava) {
      e.fire = 7;
      e.burnAcc += dt * 8;
    }
    if (e.inWater) e.fire = 0;
    if (e.fire > 0) {
      e.fire -= dt;
      e.burnAcc += dt;
    }
    if (e.burnAcc >= 1) {
      e.burnAcc -= 1;
      e.invuln = 0;
      if (this.damage(e, 1, e.x, e.z, null, 0)) return;
    }
    if (e.y < -64) {
      this.kill(e, false);
      return;
    }
    if (def.aquatic) {
      if (!e.inWater) {
        ai.think -= dt;
        if (ai.think <= 0) {
          ai.think = 1;
          e.invuln = 0;
          if (this.damage(e, 1, e.x, e.z, null, 0)) return;
        }
      }
    }
    if (e.type === MOB_ENDERMAN && (e.inWater || (this.host.raining() > 0.3 && this.isSunlit({ ...e, inWater: false } as Entity)))) {
      ai.teleportCd -= dt;
      if (ai.teleportCd <= 0) {
        ai.teleportCd = 1;
        e.invuln = 0;
        this.damage(e, 1, e.x, e.z, null, 0);
        this.teleport(e);
      }
    }

    ai.attackCd -= dt;
    ai.shootCd -= dt;
    ai.repath -= dt;
    ai.think -= dt;
    if (ai.angry > 0) ai.angry -= dt;
    if (ai.panic > 0) ai.panic -= dt;

    // --- Decisión ---
    let moveX = 0, moveZ = 0, speed = 0, jump = false;
    let lookAt: [number, number, number] | null = null;
    const hostileNow = def.hostile && (
      !def.neutral || ai.angry > 0 ||
      (e.type === MOB_SPIDER && (this.host.sunHeight() < 0.05 || w.skyTop(Math.floor(e.x), Math.floor(e.z)) > e.y + 2))
    );
    if (e.type === MOB_ENDERMAN) {
      for (const p of players) {
        if (p.lookingAt === e.id && p.alive && !p.creative) {
          if (ai.angry <= 0) this.host.fx('enderman_scream', e.x, e.y + 2.5, e.z);
          ai.angry = 30;
          ai.target = p.id;
        }
      }
    }
    let target: PlayerView | null = null;
    if (hostileNow) {
      if (ai.target) target = players.find((p) => p.id === ai.target && p.alive && !p.creative) ?? null;
      if (target && Math.hypot(target.x - e.x, target.z - e.z) > 40) target = null;
      if (!target && (def.neutral ? ai.angry > 0 : true)) target = this.nearestPlayer(e, players, e.type === MOB_SPIDER ? 16 : 24, true);
      ai.target = target ? target.id : null;
    } else ai.target = null;

    if (def.aquatic) {
      // Calamar: impulsos aleatorios dentro del agua.
      if (e.inWater) {
        if (ai.think <= 0) {
          ai.think = 2 + this.rand() * 3;
          const a = this.rand() * TAU;
          ai.swimDir = [Math.cos(a), (this.rand() - 0.5) * 0.8, Math.sin(a)];
        }
        e.vx += (ai.swimDir[0] * def.walk - e.vx) * dt * 1.5;
        e.vz += (ai.swimDir[2] * def.walk - e.vz) * dt * 1.5;
        e.vy += (ai.swimDir[1] * def.walk - e.vy) * dt * 1.5;
        const above = w.getBlock(Math.floor(e.x), Math.floor(e.y + e.height + 0.3), Math.floor(e.z));
        if (!(above > 0 && BLOCK_FLUID[above] === 1) && e.vy > 0) e.vy = -0.5;
      } else {
        e.vy -= GRAVITY * dt;
        if (e.onGround && this.rand() < dt * 2) {
          e.vy = 4;
          e.vx = (this.rand() - 0.5) * 3;
          e.vz = (this.rand() - 0.5) * 3;
        }
      }
      if (Math.hypot(e.vx, e.vz) > 0.05) e.bodyYaw = lerpAngle(e.bodyYaw, Math.atan2(-e.vx, -e.vz), dt * 3);
      e.yaw = e.bodyYaw;
      moveBody(e, w, dt);
      this.updateFlags(e, ai);
      return;
    }

    if (target) {
      const dx = target.x - e.x, dz = target.z - e.z;
      const dist = Math.hypot(dx, dz);
      const dy = target.y - e.y;
      lookAt = [target.x, target.y + 1.6, target.z];
      const reach = def.width / 2 + 1.1;
      const los = dist < 20 && lineOfSight(w, e.x, e.y + e.height * 0.85, e.z, target.x, target.y + 1.5, target.z);
      if (e.type === MOB_SKELETON || e.type === MOB_STRAY) {
        // Mantener distancia y disparar.
        if (dist < 6) {
          moveX = -dx / dist;
          moveZ = -dz / dist;
          speed = def.walk;
        } else if (dist > 12 || !los) {
          [moveX, moveZ, jump] = this.followPath(e, target, dt);
          speed = def.run;
        } else {
          // Rodeo lateral.
          const side = Math.sin(e.age * 0.7 + e.id) > 0 ? 1 : -1;
          moveX = (-dz / dist) * side;
          moveZ = (dx / dist) * side;
          speed = def.walk * 0.6;
        }
        if (los && dist < 16 && ai.shootCd <= 0) {
          ai.shootCd = 1.6 + this.rand() * 1.2;
          this.shootAt(e, target);
        }
      } else if (e.type === MOB_CREEPER) {
        if (dist < 3.2 && los) {
          ai.fuse += dt;
          if (ai.fuse === dt) this.host.fx('creeper_fuse', e.x, e.y + 1, e.z);
          speed = 0;
          if (ai.fuse >= 1.5) {
            this.remove(e.id);
            this.explode(e.x, e.y + 0.5, e.z, 3);
            return;
          }
        } else {
          if (dist > 7) ai.fuse = Math.max(0, ai.fuse - dt);
          if (ai.fuse <= 0) {
            [moveX, moveZ, jump] = this.followPath(e, target, dt);
            speed = def.run;
          }
        }
      } else {
        // Cuerpo a cuerpo.
        if (dist < 2.5 && Math.abs(dy) < 1.5 && los) {
          moveX = dx / (dist || 1);
          moveZ = dz / (dist || 1);
        } else [moveX, moveZ, jump] = this.followPath(e, target, dt);
        speed = e.type === MOB_ENDERMAN ? def.run * 1.2 : def.run;
        if (e.type === MOB_SPIDER && dist < 4 && dist > 2 && e.onGround && this.rand() < dt * 1.5) {
          // Salto de ataque.
          e.vy = 6;
          e.vx += (dx / dist) * 4;
          e.vz += (dz / dist) * 4;
        }
        if (dist < reach && Math.abs(dy) < 1.6 && ai.attackCd <= 0) {
          ai.attackCd = 1;
          const dmg = def.damage * this.difficultyScale();
          this.host.hurtPlayer(target.id, dmg, (dx / (dist || 1)) * 5, 4, (dz / (dist || 1)) * 5, def.key);
          this.host.fx('mob_attack', e.x, e.y + e.height * 0.7, e.z, e.type);
        }
      }
    } else if (ai.panic > 0) {
      const dx = e.x - ai.panicFrom[0], dz = e.z - ai.panicFrom[1];
      const d = Math.hypot(dx, dz) || 1;
      moveX = dx / d + Math.sin(e.age * 3) * 0.3;
      moveZ = dz / d + Math.cos(e.age * 3) * 0.3;
      speed = def.run;
    } else {
      // Paseo tranquilo.
      if (ai.think <= 0) {
        ai.think = 3 + this.rand() * 6;
        if (this.rand() < 0.6) {
          const a = this.rand() * TAU, r = 3 + this.rand() * 7;
          ai.goal = [Math.floor(e.x + Math.cos(a) * r), Math.floor(e.y), Math.floor(e.z + Math.sin(a) * r)];
        } else ai.goal = null;
        // Mirar a los jugadores cercanos a veces.
        const near = this.nearestPlayer(e, players.map((p) => ({ ...p, creative: false })), 8, false);
        if (near && this.rand() < 0.5) ai.lookYaw = angleTo(e.x, e.z, near.x, near.z);
        else ai.lookYaw = e.bodyYaw + (this.rand() - 0.5) * 1.5;
      }
      if (ai.goal) {
        const dx = ai.goal[0] + 0.5 - e.x, dz = ai.goal[2] + 0.5 - e.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.6) ai.goal = null;
        else {
          moveX = dx / d;
          moveZ = dz / d;
          speed = def.walk;
        }
      }
    }

    // --- Movimiento ---
    const wantMove = speed > 0 && (moveX !== 0 || moveZ !== 0);
    if (wantMove) {
      const ml = Math.hypot(moveX, moveZ) || 1;
      moveX /= ml;
      moveZ /= ml;
      // No caminar hacia la lava ni a caídas grandes al pasear.
      if (!target && ai.panic <= 0) {
        const ax = Math.floor(e.x + moveX * 0.9), az = Math.floor(e.z + moveZ * 0.9), fy = Math.floor(e.y);
        const ahead = w.getBlock(ax, fy, az);
        let drop = 0;
        while (drop < 4 && !BLOCK_SOLID[Math.max(0, w.getBlock(ax, fy - 1 - drop, az))] && w.getBlock(ax, fy - 1 - drop, az) >= 0) drop++;
        const below = w.getBlock(ax, fy - 1, az);
        if ((ahead > 0 && BLOCK_FLUID[ahead] === 2) || (below > 0 && BLOCK_FLUID[below] === 2) || drop >= 4) {
          moveX = moveZ = 0;
          ai.goal = null;
        }
      }
    }
    const tvx = moveX * speed, tvz = moveZ * speed;
    const acc = e.onGround ? 10 : e.inWater ? 4 : 2;
    e.vx += (tvx - e.vx) * Math.min(1, dt * acc);
    e.vz += (tvz - e.vz) * Math.min(1, dt * acc);
    if (e.inWater || e.inLava) {
      // Flotar (las criaturas terrestres nadan hacia arriba).
      e.vy += (1.8 - e.vy) * Math.min(1, dt * 3);
      if (e.hitWall) e.vy = Math.max(e.vy, 4);
    } else {
      e.vy -= GRAVITY * dt;
      if (e.vy < -60) e.vy = -60;
    }
    if (e.onGround && (jump || (e.hitWall && wantMove && speed > 0))) {
      if (e.type === MOB_CHICKEN || e.type === MOB_SPIDER || ai.stuck > 0.1 || jump || e.hitWall) e.vy = 8.6;
    }
    if (e.type === MOB_SPIDER && e.hitWall && wantMove) e.vy = Math.max(e.vy, 3.2);
    if (e.type === MOB_CHICKEN && !e.onGround && e.vy < -2 && !e.inWater) e.vy = -2; // aleteo
    const wasGround = e.onGround;
    const prevVy = e.vy;
    moveBody(e, w, dt);
    // Daño por caída.
    if (!wasGround && e.onGround && !e.inWater && e.type !== MOB_CHICKEN) {
      const fall = e.fallStart - e.y;
      if (fall > 3.5 && prevVy < -8) this.damage(e, Math.floor(fall - 3), e.x, e.z, null, 0);
    }
    if (e.onGround || e.inWater) e.fallStart = e.y;
    else e.fallStart = Math.max(e.fallStart, e.y);
    // Atasco.
    const moved = Math.hypot(e.x - ai.lastX, e.z - ai.lastZ);
    ai.stuck = wantMove && moved < speed * dt * 0.2 ? ai.stuck + dt : 0;
    if (ai.stuck > 2) {
      ai.goal = null;
      ai.path = null;
      ai.stuck = 0;
      ai.think = 0;
    }
    ai.lastX = e.x;
    ai.lastZ = e.z;
    // Orientación.
    if (Math.hypot(e.vx, e.vz) > 0.3) e.bodyYaw = lerpAngle(e.bodyYaw, Math.atan2(-e.vx, -e.vz), dt * 8);
    if (lookAt) {
      e.yaw = lerpAngle(e.yaw, angleTo(e.x, e.z, lookAt[0], lookAt[2]), dt * 10);
      const hd = Math.hypot(lookAt[0] - e.x, lookAt[2] - e.z);
      e.pitch = Math.atan2(lookAt[1] - (e.y + e.height * 0.85), hd);
    } else {
      e.yaw = lerpAngle(e.yaw, ai.lookYaw, dt * 3);
      e.pitch *= 1 - Math.min(1, dt * 3);
    }
    this.updateFlags(e, ai);
  }

  private updateFlags(e: Entity, ai: AI): void {
    let f = 0;
    if (e.hurt < 0.4) f |= EF_HURT;
    if (e.fire > 0) f |= EF_FIRE;
    if (e.dead) f |= EF_DEAD;
    if (ai.angry > 0 || (ai.target && MOBS[e.type].hostile)) f |= EF_ANGRY;
    if (ai.fuse > 0 || (ai.target && ai.shootCd < 0.6 && (e.type === MOB_SKELETON || e.type === MOB_STRAY))) f |= EF_ACTION;
    e.flags = f;
  }

  /** Sigue (o recalcula) el camino hacia el objetivo. Devuelve [dirX, dirZ, saltar]. */
  private followPath(e: Entity, target: PlayerView, dt: number): [number, number, boolean] {
    const ai = e.ai!;
    const tx = Math.floor(target.x), ty = Math.floor(target.y), tz = Math.floor(target.z);
    const needs = !ai.path || ai.repath <= 0 || (ai.goal && Math.abs(ai.goal[0] - tx) + Math.abs(ai.goal[2] - tz) > 2);
    if (needs) {
      ai.repath = 1 + this.rand() * 0.6;
      ai.goal = [tx, ty, tz];
      const h = Math.ceil(e.height);
      ai.path = findPath(this.w, Math.floor(e.x), Math.floor(e.y + 0.01), Math.floor(e.z), tx, ty, tz, h, 350);
      ai.pathIdx = 0;
    }
    void dt;
    const path = ai.path;
    if (path && ai.pathIdx < path.length) {
      let node = path[ai.pathIdx];
      const dx = node[0] + 0.5 - e.x, dz = node[2] + 0.5 - e.z;
      if (Math.hypot(dx, dz) < 0.4 && Math.abs(node[1] - e.y) < 1.2) {
        ai.pathIdx++;
        if (ai.pathIdx >= path.length) return this.direct(e, target);
        node = path[ai.pathIdx];
      }
      const ndx = node[0] + 0.5 - e.x, ndz = node[2] + 0.5 - e.z;
      const d = Math.hypot(ndx, ndz) || 1;
      return [ndx / d, ndz / d, node[1] > Math.floor(e.y + 0.01)];
    }
    return this.direct(e, target);
  }

  private direct(e: Entity, target: PlayerView): [number, number, boolean] {
    const dx = target.x - e.x, dz = target.z - e.z;
    const d = Math.hypot(dx, dz) || 1;
    return [dx / d, dz / d, false];
  }

  private shootAt(e: Entity, target: PlayerView): void {
    const sx = e.x, sy = e.y + e.height * 0.8, sz = e.z;
    const tx = target.x, ty = target.y + 1.2, tz = target.z;
    const dx = tx - sx, dz = tz - sz;
    const horiz = Math.max(1e-3, Math.hypot(dx, dz));
    const speed = 30;
    const t = Math.max(0.05, horiz / speed);
    // Compensar la gravedad (20 m/s²) y añadir imprecisión según la dificultad.
    const spread = [0.12, 0.09, 0.06, 0.03][this.host.difficulty()] ?? 0.06;
    const vy = (ty - sy) / t + 0.5 * 20 * t;
    const vx = dx / t + (this.rand() - 0.5) * spread * speed;
    const vz = dz / t + (this.rand() - 0.5) * spread * speed;
    this.spawnArrow(sx + (dx / horiz) * 0.6, sy, sz + (dz / horiz) * 0.6, vx, vy + (this.rand() - 0.5) * spread * speed, vz, e.id, 2);
    this.host.fx('mob_shoot', sx, sy, sz, e.type);
  }

  private teleport(e: Entity): void {
    for (let i = 0; i < 16; i++) {
      const x = Math.floor(e.x + (this.rand() - 0.5) * 32);
      const z = Math.floor(e.z + (this.rand() - 0.5) * 32);
      for (let y = Math.floor(e.y) + 8; y > Math.floor(e.y) - 16; y--) {
        if (standable(this.w, x, y, z, 3)) {
          const b = this.w.getBlock(x, y, z);
          if (b > 0 && BLOCK_FLUID[b]) break;
          this.host.fx('teleport', e.x, e.y + 1.5, e.z, e.type);
          e.x = x + 0.5;
          e.y = y;
          e.z = z + 0.5;
          e.vx = e.vy = e.vz = 0;
          e.fallStart = e.y;
          this.host.fx('teleport', e.x, e.y + 1.5, e.z, e.type);
          return;
        }
      }
    }
  }

  // ------------------------------------------------------------------ aparición

  private spawnTick(dt: number, players: PlayerView[]): void {
    this.spawnTimer -= dt;
    this.passiveTimer -= dt;
    this.squidTimer -= dt;
    if (players.length === 0) return;
    if (this.spawnTimer <= 0) {
      // Un intento cada ~2.5 s por jugador: la noche es peligrosa pero no una avalancha.
      this.spawnTimer = 1.5 + this.rand() * 2;
      if (this.host.difficulty() > 0) for (const p of players) if (p.alive) this.spawnHostiles(p, players.length);
    }
    if (this.passiveTimer <= 0) {
      this.passiveTimer = 4;
      for (const p of players) this.spawnPassive(p);
    }
    if (this.squidTimer <= 0) {
      this.squidTimer = 8;
      for (const p of players) this.spawnSquid(p);
    }
  }

  private ring(p: PlayerView, min: number, max: number): [number, number] {
    const a = this.rand() * TAU, r = min + this.rand() * (max - min);
    return [Math.floor(p.x + Math.cos(a) * r), Math.floor(p.z + Math.sin(a) * r)];
  }

  /** Aparición de criaturas hostiles en la oscuridad. */
  private spawnHostiles(p: PlayerView, playerCount: number): void {
    // Límite de monstruos cerca del jugador según la dificultad (fácil 9, normal 12, difícil 15 para uno).
    const d = this.host.difficulty();
    const cap = (d <= 1 ? 6 : d === 2 ? 8 : 10) + (d <= 1 ? 3 : d === 2 ? 4 : 5) * Math.min(4, playerCount);
    if (this.counts(p.x, p.z, 96).hostile >= cap) return;
    const w = this.w;
    const night = this.host.sunHeight() < -0.02;
    for (let attempt = 0; attempt < 4; attempt++) {
      const [x, z] = this.ring(p, 22, 48);
      const top = w.skyTop(x, z);
      if (top === -2) continue;
      let y: number;
      if (this.rand() < 0.5) y = top + 1;
      else {
        y = Math.floor(p.y + (this.rand() - 0.5) * 32);
        let found = false;
        for (let k = 0; k < 10; k++, y--) {
          if (standable(w, x, y, z, 2)) {
            found = true;
            break;
          }
        }
        if (!found) continue;
      }
      if (y < 1 || !standable(w, x, y, z, 2)) continue;
      const feet = w.getBlock(x, y, z);
      const floor = w.getBlock(x, y - 1, z);
      if (feet > 0 && BLOCK_FLUID[feet]) continue;
      if (floor <= 0 || BLOCK_FLUID[floor] || floor === AIR) continue;
      const exposed = y > top;
      if (exposed && !night) continue;
      if (w.isLitByBlocks(x, y, z)) continue;
      // Tipo según el bioma.
      const info = w.gen.columnInfo(x, z);
      const r = this.rand();
      let type: number;
      if (r < 0.34) type = info.biome === 8 ? MOB_HUSK : MOB_ZOMBIE;
      else if (r < 0.6) type = info.temp < -0.5 ? MOB_STRAY : MOB_SKELETON;
      else if (r < 0.8) type = MOB_SPIDER;
      else if (r < 0.95) type = MOB_CREEPER;
      else type = MOB_ENDERMAN;
      const def = MOBS[type];
      if (!standable(w, x, y, z, Math.ceil(def.height))) continue;
      if (type === MOB_SPIDER && !this.spaceFor(x, y, z, 1)) continue;
      this.spawnMob(type, x + 0.5, y, z + 0.5);
      return;
    }
  }

  private spaceFor(x: number, y: number, z: number, r: number): boolean {
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) if (BLOCK_SOLID[Math.max(0, this.w.getBlock(x + dx, y, z + dz))]) return false;
    return true;
  }

  /** Animales en praderas iluminadas por el cielo. */
  spawnPassive(p: PlayerView, force = false): void {
    const c = this.counts(p.x, p.z, 72);
    if (!force && c.passive >= 10) return;
    if (!this.roomForPassive(4)) return;
    const w = this.w;
    for (let attempt = 0; attempt < 6; attempt++) {
      const [x, z] = this.ring(p, force ? 12 : 24, 56);
      const top = w.skyTop(x, z);
      if (top < 0) continue;
      const floor = w.getBlock(x, top, z);
      if (floor !== GRASS && floor !== SNOWY_GRASS) continue;
      const y = top + 1;
      if (!standable(w, x, y, z, 2)) continue;
      const r = this.rand();
      const type = r < 0.3 ? MOB_PIG : r < 0.55 ? MOB_COW : r < 0.85 ? MOB_SHEEP : MOB_CHICKEN;
      const n = 2 + Math.floor(this.rand() * 3);
      for (let i = 0; i < n; i++) {
        const ox = x + Math.floor((this.rand() - 0.5) * 5), oz = z + Math.floor((this.rand() - 0.5) * 5);
        const ot = w.skyTop(ox, oz);
        if (ot < 0) continue;
        const f = w.getBlock(ox, ot, oz);
        if ((f === GRASS || f === SNOWY_GRASS) && standable(w, ox, ot + 1, oz, 2)) this.spawnMob(type, ox + 0.5, ot + 1, oz + 0.5);
      }
      return;
    }
  }

  /** ¿Caben n animales más? Si no, recicla los más alejados de todos los jugadores. */
  private roomForPassive(n: number): boolean {
    const players = this.host.players();
    const far: [number, Entity][] = [];
    let total = 0;
    for (const e of this.list.values()) {
      if (!e.ai || e.dead || MOBS[e.type].hostile || e.type === MOB_SQUID) continue;
      total++;
      const d = this.nearestPlayer2D(e, players);
      if (d > ACTIVE_RANGE) far.push([d, e]);
    }
    if (total + n <= MAX_PASSIVE) return true;
    far.sort((a, b) => b[0] - a[0]);
    const need = total + n - MAX_PASSIVE;
    for (let i = 0; i < need && i < far.length; i++) this.remove(far[i][1].id);
    return far.length >= need;
  }

  private spawnSquid(p: PlayerView): void {
    if (this.counts(p.x, p.z, 64).squid >= 5) return;
    const w = this.w;
    for (let attempt = 0; attempt < 3; attempt++) {
      const [x, z] = this.ring(p, 16, 40);
      const y = SEA_LEVEL - 3 - Math.floor(this.rand() * 6);
      const a = w.getBlock(x, y, z), b = w.getBlock(x, y + 1, z), c = w.getBlock(x, y - 1, z);
      if (a === WATER && b === WATER && (c === WATER || (c > 0 && BLOCK_FLUID_LEVEL[c] === 0 && BLOCK_FLUID[c] === 1))) {
        this.spawnMob(MOB_SQUID, x + 0.5, y, z + 0.5);
        return;
      }
    }
  }

  // ------------------------------------------------------------------ persistencia

  /** Animales pacíficos para guardar (los hostiles no se guardan). */
  serializePassive(): string {
    const out: number[][] = [];
    for (const e of this.list.values()) {
      if (!e.ai || e.dead || MOBS[e.type].hostile || e.type === MOB_SQUID) continue;
      out.push([e.type, Math.round(e.x * 10) / 10, Math.round(e.y * 10) / 10, Math.round(e.z * 10) / 10, Math.round(e.health)]);
    }
    return JSON.stringify(out);
  }

  restorePassive(json: string | null): void {
    if (!json) return;
    try {
      const arr = JSON.parse(json) as number[][];
      for (const [type, x, y, z, hp] of arr) {
        if (!MOBS[type] || ![x, y, z].every(Number.isFinite)) continue;
        const e = this.spawnMob(type, x, y, z);
        if (e && Number.isFinite(hp)) e.health = Math.max(1, Math.min(e.maxHealth, hp));
      }
    } catch {
      /* ignorar */
    }
  }
}

export function isMobType(type: number): boolean {
  return !!MOBS[type];
}

export function mobDef(type: number): MobDef | undefined {
  return MOBS[type];
}

export { ARROW, blockDrops };
