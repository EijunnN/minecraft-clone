// Entidades del servidor: criaturas (con IA), objetos tirados, flechas, bloques que caen, orbes de
// experiencia, huevos lanzados y flotadores de pesca. Este gestor guarda la lista, crea y retira
// entidades, aplica daño y explosiones y reparte cada tick entre sus comportamientos: itemPhysics,
// projectiles, mobBrain, animalLife, spawner y xpOrbs.
import {
  MOBS, MOB_CHICKEN, MOB_ENDERMAN, MOB_SQUID, ENT_ITEM, ENT_ARROW, ENT_FALLING, ENT_XP, ENT_THROWN, ENT_BOBBER, ENT_DISPLAY,
  type MobDef,
} from '../../mobs';
import { ITEMS, ARROW, SADDLE, type ItemStack } from '../../items';
import { WHITE_WOOL, BLOCK_FLUID, BLOCK_HARDNESS } from '../../blocks';
import type { WorldSim } from '../WorldSim';
import { blockDrops } from '../drops';
import { GROW_SECONDS, TAU, MAX_ITEMS, MAX_ARROWS, ACTIVE_RANGE, type PlayerView, type EntityHost, type InteractResult, type Entity } from './types';
import { ItemPhysics } from './itemPhysics';
import { MobBrain } from './mobBrain';
import { AnimalLife } from './animalLife';
import { Spawner } from './spawner';
import { XpOrbs } from './xpOrbs';
import { Projectiles } from './projectiles';
import { MountLife } from './mounts'; // Fase 6 (monturas)
import { VillagerLife } from './villagerLife'; // Fase 6 (aldeanos)
// Fase 6 (acuáticos).
import { AquaticLife } from './aquaticLife';
import { isWaterAmbient } from '../../aquaticMobs';
// Fase 6 (gólems/domesticar)
import { Companions } from './companions';
import { ENT_ARMOR_STAND } from '../../armorStands'; // Fase 6.5 (remate)
import { isHangingType } from '../../paintings'; // Fase 6.5 (decoración)
import { collectionDrops } from './collectionDrops'; // Fase 6.5 (colecciones)
// Fase 6.5 (equipo): armaduras y equipo de las criaturas; tridentes y cohetes.
import { MobGear } from './mobGear';
import { GearShots } from './gearShots';
import { ENT_TRIDENT, ENT_FIREWORK } from '../../equipment';
// Fase 7 (pociones): efectos de las criaturas, pociones que se rompen, nubes y flechas con efecto.
import { MobEffects } from './mobEffects';
import { PotionLife } from './potions';
import { ENT_EFFECT_CLOUD } from '../../potions';

export class Entities {
  readonly list = new Map<number, Entity>();
  private nextId = 1;
  readonly host: EntityHost;
  rand = Math.random;
  /** Retirados este tick: [id, id del jugador que lo recogió o ''] (para animaciones en clientes). */
  removed: [number, string][] = [];
  readonly items = new ItemPhysics(this);
  readonly mobs = new MobBrain(this);
  readonly animals = new AnimalLife(this);
  readonly spawner = new Spawner(this);
  readonly xp = new XpOrbs(this);
  readonly projectiles = new Projectiles(this);
  /** Fase 6 (monturas): pelaje, silla, doma, mulas y llamas que escupen. */
  readonly mounts = new MountLife(this);
  /** Fase 6 (aldeanos): profesión, paseo y casa de los aldeanos. */
  readonly villagers = new VillagerLife(this);
  /** Fase 6 (acuáticos): peces, delfines, tortugas, ajolotes, ranas y renacuajos. */
  readonly aquatic = new AquaticLife(this);
  // Fase 6 (gólems/domesticar): gólems y animales domesticados.
  readonly companions = new Companions(this);
  /** Fase 6 (asaltos): centro de la aldea de cada asalto en curso (hacia donde marchan los asaltantes). */
  readonly raidCenters = new Map<number, [number, number, number]>();
  /** Fase 6 (asaltos): zonas en alerta [x, z, radio]: los aldeanos se refugian en casa. */
  alarms: [number, number, number][] = [];
  /** Fase 6.5 (colecciones): quién dio el golpe mortal (mientras se resuelve la muerte). */
  private killer: string | number | null = null;
  /** Fase 6.5 (colecciones): explosión de creeper cargado en curso (suelta una sola cabeza). */
  chargedBlast: { dropped: boolean } | null = null;
  /** Fase 6.5 (equipo): armaduras de caballo y lobo, tridentes de los ahogados, botín raro y cabras. */
  readonly gear = new MobGear(this);
  /** Fase 6.5 (equipo): tridentes lanzados y cohetes. */
  readonly gearShots = new GearShots(this);
  /** Fase 7 (pociones): efectos de estado de las criaturas. */
  readonly effects = new MobEffects(this);
  /** Fase 7 (pociones): arrojadizas, persistentes (nubes) y flechas con efecto. */
  readonly potions = new PotionLife(this);

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

  spawnMob(type: number, x: number, y: number, z: number, baby = false): Entity | null {
    const def = MOBS[type];
    if (!def) return null;
    const e = this.base(type, x, y, z, def.width, def.height, def.health);
    e.bodyYaw = e.yaw;
    if (!def.hostile && !def.aquatic) {
      e.growAge = 0;
      e.love = 0;
      e.breedCd = 0;
      e.sheared = false;
      if (type === MOB_CHICKEN) e.eggTimer = 300 + this.rand() * 300;
      if (baby) this.animals.setBaby(e, GROW_SECONDS);
      this.mounts.init(e); // Fase 6 (monturas)
    }
    e.ai = {
      target: null, goal: null, path: null, pathIdx: 0, repath: 0, think: this.rand() * 2, attackCd: 0, shootCd: 1 + this.rand(),
      fuse: 0, angry: 0, panic: 0, panicFrom: [x, z], stuck: 0, lastX: x, lastZ: z, swimDir: [0, 0, 0], lookYaw: e.yaw,
      teleportCd: 0, goalDir: [0, 0, 0, 0], lookAt: null,
    };
    this.gear.onSpawn(e); // Fase 6.5 (equipo)
    this.list.set(e.id, e);
    return e;
  }

  /** Entidad sin comportamiento propio (el que la crea rellena sus datos). */
  spawnBare(type: number, x: number, y: number, z: number, width: number, height: number): Entity {
    const e = this.base(type, x, y, z, width, height, 1);
    this.list.set(e.id, e);
    return e;
  }

  /** Retira la entidad más antigua de un tipo si se alcanzó su límite. */
  makeRoom(type: number, max: number): void {
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

  /** Objeto lanzado por un jugador (huevo). Fase 7 (pociones): `dmg`, el tipo de la poción lanzada. */
  spawnThrown(item: number, x: number, y: number, z: number, vx: number, vy: number, vz: number, thrower: string, dmg = 0): Entity {
    this.makeRoom(ENT_THROWN, MAX_ARROWS);
    const e = this.base(ENT_THROWN, x, y, z, 0.25, 0.25, 1);
    e.vx = vx;
    e.vy = vy;
    e.vz = vz;
    e.stack = dmg > 0 ? { id: item, count: 1, dmg } : { id: item, count: 1 };
    e.shooter = thrower;
    this.list.set(e.id, e);
    return e;
  }

  /** Flotador de la caña de pescar de `owner`. */
  spawnBobber(x: number, y: number, z: number, vx: number, vy: number, vz: number, owner: string): Entity {
    const e = this.base(ENT_BOBBER, x, y, z, 0.25, 0.25, 1);
    e.vx = vx;
    e.vy = vy;
    e.vz = vz;
    e.shooter = owner;
    this.list.set(e.id, e);
    return e;
  }

  /** Objeto quieto de adorno (no se mueve ni se recoge). */
  spawnDisplay(stack: ItemStack, x: number, y: number, z: number, yaw: number): Entity {
    const e = this.base(ENT_DISPLAY, x, y, z, 0.25, 0.05, 1);
    e.stack = { id: stack.id, count: 1 };
    e.yaw = yaw;
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
      else if (isWaterAmbient(e.type)) continue; // Fase 6 (acuáticos): tienen sus propios límites.
      else if (def.hostile) hostile++;
      else passive++;
    }
    return { hostile, passive, squid };
  }

  // ------------------------------------------------------------------ daño

  /** Daño a una entidad; devuelve true si murió. */
  damage(e: Entity, amount: number, fromX: number, fromZ: number, attacker: string | number | null, knock = 1): boolean {
    if (e.dead || !e.ai || MOBS[e.type].inert) return false;
    if (e.invuln > 0) return false;
    amount = this.gear.absorb(e, amount); // Fase 6.5 (equipo): armadura de caballo o de lobo
    amount *= this.effects.damageFactor(e); // Fase 7 (pociones): Resistencia
    e.health -= amount;
    e.invuln = 0.5;
    e.hurt = 0;
    const dx = e.x - fromX, dz = e.z - fromZ;
    const d = Math.hypot(dx, dz) || 1;
    e.vx += (dx / d) * 5 * knock;
    e.vz += (dz / d) * 5 * knock;
    e.vy = Math.max(e.vy, 4 * knock);
    if (typeof attacker === 'string') {
      e.lastHurtBy = attacker;
      e.lastHurtAt = e.age;
    }
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
    // Fase 6 (gólems/domesticar): los lobos ayudan a su dueño; gólems y domesticados se defienden.
    if (typeof attacker === 'string') this.companions.onPlayerAttack(attacker, e);
    this.companions.onHurt(e, attacker);
    if (e.type === MOB_ENDERMAN && this.rand() < 0.6) this.mobs.teleport(e);
    this.mobs.monsters.onDamaged(e, attacker); // Fase 6 (monstruos): las lepismas piden ayuda
    this.mobs.illagers.onDamaged(e, attacker); // Fase 6 (asaltos): venganza de los asaltantes
    this.host.fx('mob_hurt', e.x, e.y + e.height / 2, e.z, e.type);
    if (e.health <= 0) {
      this.killer = attacker; // Fase 6.5 (colecciones)
      this.kill(e, true);
      this.killer = null;
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
    if (drops && e.ai && !((e.growAge ?? 0) > 0)) {
      const def = MOBS[e.type];
      const stacks: ItemStack[] = [];
      for (const [id, min, max] of def.drops) {
        if (id === WHITE_WOOL && e.sheared) continue;
        const n = min + Math.floor(this.rand() * (max - min + 1));
        if (n > 0) stacks.push({ id, count: n });
      }
      // Los animales que mueren ardiendo sueltan la carne cocinada.
      if (e.fire > 0) for (const s of stacks) if (ITEMS[s.id]?.smelt && ITEMS[s.id]?.food) s.id = ITEMS[s.id].smelt!;
      if (e.saddled) stacks.push({ id: SADDLE, count: 1 }); // Fase 6 (monturas): suelta la silla
      this.dropStacks(stacks, e.x, e.y + 0.3, e.z);
    }
    if (drops) this.xp.onMobKilled(e);
    if (drops) this.mobs.monsters.onKilled(e); // Fase 6 (monstruos): los slimes se dividen
    if (drops) this.mobs.illagers.onKilled(e); // Fase 6 (asaltos): botella ominosa del capitán
    if (drops) collectionDrops(this, e, this.killer); // Fase 6.5 (colecciones): cabezas y discos
    if (drops) this.gear.onKilled(e); // Fase 6.5 (equipo): armadura puesta, tridente, ballesta, pata de conejo
  }

  // ------------------------------------------------------------------ explosiones

  /** `charged`: Fase 6.5 (colecciones), creeper cargado (su víctima suelta la cabeza). */
  explode(x: number, y: number, z: number, power: number, charged = false): void {
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
    this.chargedBlast = charged ? { dropped: false } : null;
    for (const e of this.list.values()) {
      if (!e.ai || e.dead) continue;
      const d = Math.hypot(e.x - x, e.y + e.height / 2 - y, e.z - z);
      if (d > reach) continue;
      const impact = 1 - d / reach;
      this.damage(e, Math.floor((impact * impact + impact) * 3.5 * power + 1), x, z, null, 1 + impact * 2);
    }
    this.chargedBlast = null;
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

  difficultyScale(): number {
    const d = this.host.difficulty();
    return d <= 1 ? 0.5 : d === 3 ? 1.5 : 1;
  }

  // ------------------------------------------------------------------ bucle

  /** Distancia horizontal al jugador más cercano. */
  nearestPlayer2D(e: Entity, players: PlayerView[]): number {
    let d = Infinity;
    for (const p of players) d = Math.min(d, Math.hypot(p.x - e.x, p.z - e.z));
    return d;
  }

  tick(dt: number): void {
    const players = this.host.players();
    this.items.buildItemGrid();
    this.xp.beginTick(dt);
    this.mobs.illagers.tickWorld(dt); // Fase 6 (asaltos): colmillos que brotan
    const active: Entity[] = [];
    for (const e of this.list.values()) {
      const near = this.nearestPlayer2D(e, players);
      // Monstruos y calamares desaparecen lejos de todos (como en Minecraft).
      if (e.ai && !e.dead && e.raid === undefined && !e.customName && !e.leash && (MOBS[e.type].hostile || this.aquatic.despawns(e))) {
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
      if (e.type === ENT_ITEM) this.items.itemTick(e, dt, players);
      else if (e.type === ENT_ARROW) this.items.arrowTick(e, dt, players);
      else if (e.type === ENT_FALLING) this.items.fallingTick(e, dt);
      else if (e.type === ENT_XP) this.xp.orbTick(e, dt, players);
      else if (e.type === ENT_THROWN) this.projectiles.thrownTick(e, dt, players);
      else if (e.type === ENT_BOBBER) this.projectiles.bobberTick(e, dt, players);
      else if (e.type === ENT_DISPLAY || isHangingType(e.type) || e.type === ENT_ARMOR_STAND) e.flags = 0; // Fase 6.5: cuadros, marcos y soportes
      else if (e.type === ENT_TRIDENT || e.type === ENT_FIREWORK) this.gearShots.tick(e, dt, players); // Fase 6.5 (equipo)
      else if (e.type === ENT_EFFECT_CLOUD) this.potions.cloudTick(e, dt, players); // Fase 7 (pociones)
      else if (e.effects) this.effects.tickWith(e, dt, () => this.mobs.mobTick(e, dt, players)); // Fase 7 (pociones)
      else this.mobs.mobTick(e, dt, players);
    }
    this.separate(active.filter((e) => !e.dead && this.list.has(e.id)));
    this.spawner.spawnTick(dt, players);
    this.aquatic.spawnTick(dt, players); // Fase 6 (acuáticos).
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

  // ------------------------------------------------------------------ persistencia

  /** Animales pacíficos para guardar (los hostiles no se guardan). */
  serializePassive(): string {
    const out: number[][] = [];
    for (const e of this.list.values()) {
      // Fase 6.5 (remate): los que llevan nombre se guardan siempre (también monstruos y calamares).
      if (!e.ai || e.dead || ((MOBS[e.type].hostile || e.type === MOB_SQUID || isWaterAmbient(e.type)) && !e.customName)) continue;
      const row = [
        e.type, Math.round(e.x * 10) / 10, Math.round(e.y * 10) / 10, Math.round(e.z * 10) / 10, Math.round(e.health),
        Math.round(e.growAge ?? 0), e.sheared ? 1 : 0,
      ];
      // Fase 6 (monturas): octavo campo con pelaje, doma, silla y aptitudes.
      const mount = this.mounts.save(e);
      if (mount !== null) row.push(mount);
      // Fase 6 (aldeanos): profesión, nivel y casa, como un objeto al final de la fila.
      const vil = this.villagers.save(e);
      if (vil) (row as unknown[]).push(vil);
      // Fase 6 (gólems/domesticar): dueño, sentado, piel y gólem hecho a mano.
      const extra = this.companions.save(e);
      if (extra) (row as unknown[]).push(extra);
      // Fase 6.5 (remate): nombre y valla a la que está atada (la correa en la mano de un jugador no se guarda).
      if (e.customName || Array.isArray(e.leash)) (row as unknown[]).push({ tag: e.customName ?? '', fence: Array.isArray(e.leash) ? e.leash : 0 });
      // Fase 6.5 (equipo): armadura de caballo o de lobo.
      const gear = this.gear.save(e);
      if (gear) (row as unknown[]).push(gear);
      out.push(row);
    }
    return JSON.stringify(out);
  }

  restorePassive(json: string | null): void {
    if (!json) return;
    try {
      const arr = JSON.parse(json) as number[][];
      for (const row of arr) {
        const [type, x, y, z, hp, grow, sheared, mount] = row;
        if (!MOBS[type] || ![x, y, z].every(Number.isFinite)) continue;
        const e = this.spawnMob(type, x, y, z);
        if (!e) continue;
        // Fase 6: campos extra al final de la fila (monturas: número; gólems/domesticar: lista; aldeanos: {vil}).
        this.companions.restore(e, (row as unknown[]).slice(7).find((c) => Array.isArray(c)));
        if (Number.isFinite(hp)) e.health = Math.max(1, Math.min(e.maxHealth, hp));
        if (Number.isFinite(grow) && grow > 0) this.animals.setBaby(e, Math.min(GROW_SECONDS, grow));
        if (sheared === 1) e.sheared = true;
        if (typeof mount === 'number') this.mounts.load(e, mount); // Fase 6 (monturas)
        // Fase 6 (aldeanos): datos del aldeano (objeto con clave 'vil' en cualquier posición de la fila).
        if (Array.isArray(row)) this.villagers.restore(e, (row as unknown[]).find((c) => !!c && typeof c === 'object' && 'vil' in (c as object)));
        // Fase 6.5 (remate): nombre y valla.
        const tag = (row as unknown[]).find((c) => !!c && typeof c === 'object' && 'tag' in (c as object)) as { tag?: unknown; fence?: unknown } | undefined;
        if (tag) {
          if (typeof tag.tag === 'string' && tag.tag) e.customName = tag.tag.slice(0, 32);
          const f = tag.fence;
          if (Array.isArray(f) && f.length === 3 && f.every(Number.isInteger)) e.leash = [f[0], f[1], f[2]];
        }
        if (Array.isArray(row)) this.gear.restore(e, row as unknown[]); // Fase 6.5 (equipo)
      }
    } catch {
      /* ignorar */
    }
  }

  /** Fase 6 (asaltos): ¿hay un asalto en curso cerca de (x, z)? */
  alarmed(x: number, z: number): boolean {
    for (const [ax, az, r] of this.alarms) if (Math.hypot(x - ax, z - az) < r) return true;
    return false;
  }

  // ------------------------------------------------------------------ fachada para el servidor

  tryPickup(id: number, p: PlayerView): ItemStack | null {
    const trident = this.gearShots.tryPickup(id, p); // Fase 6.5 (equipo)
    if (trident !== undefined) return trident;
    return this.items.tryPickup(id, p);
  }

  /** `who`: nombre del jugador (para domesticar y reconocer al dueño). */
  interact(e: Entity, item: number, creative: boolean, who?: string): InteractResult {
    // Fase 6 (gólems/domesticar): domesticar, sentar, curar gólems.
    const r = this.companions.interact(e, item, creative, who);
    if (r) return r;
    // Fase 6 (acuáticos): cubo de agua sobre un pez, un ajolote o un renacuajo.
    return this.aquatic.interact(e, item) ?? this.animals.interact(e, item, creative);
  }

  spawnPassive(p: PlayerView, force = false): void {
    this.spawner.spawnPassive(p, force);
  }
}

export function isMobType(type: number): boolean {
  return !!MOBS[type];
}

export function mobDef(type: number): MobDef | undefined {
  return MOBS[type];
}

export { ARROW, blockDrops };
