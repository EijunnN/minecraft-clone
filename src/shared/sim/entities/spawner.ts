// Aparición natural de criaturas: monstruos en la oscuridad, animales en praderas iluminadas y
// calamares en el agua, con los límites de Minecraft por dificultad y jugadores.
import {
  MOBS, MOB_PIG, MOB_COW, MOB_SHEEP, MOB_CHICKEN, MOB_ZOMBIE, MOB_HUSK, MOB_SKELETON, MOB_STRAY, MOB_CREEPER, MOB_SPIDER, MOB_ENDERMAN, MOB_SQUID,
  MOB_FOX, MOB_GOAT, MOB_POLAR_BEAR, MOB_RABBIT, MOB_WOLF,
} from '../../mobs';
import {
  GRASS, SNOWY_GRASS, SNOW_BLOCK, SAND, STONE, GRAVEL, ICE, PACKED_ICE, SNOW_LAYER, BLOCK_SOLID, BLOCK_OPAQUE, BLOCK_FLUID, BLOCK_FLUID_LEVEL, WATER,
} from '../../blocks';
import {
  BIOME_PLAINS, BIOME_TAIGA, BIOME_SNOWY, BIOME_DESERT, BIOME_MOUNTAINS, BIOME_SNOWY_PEAKS, BIOME_MEADOW, BIOME_ICE_SPIKES,
  BIOME_FROZEN_OCEAN, BIOME_CHERRY_GROVE,
} from '../../world/biomeIds';
import { SEA_LEVEL, MIN_Y } from '../../constants';
import { standable } from '../pathfind';
import { TAU, MAX_PASSIVE, ACTIVE_RANGE, type PlayerView, type Entity } from './types';
import type { Entities } from './Entities';

export class Spawner {
  private spawnTimer = 0;
  private passiveTimer = 3;
  private squidTimer = 5;

  constructor(private m: Entities) {}

  spawnTick(dt: number, players: PlayerView[]): void {
    this.spawnTimer -= dt;
    this.passiveTimer -= dt;
    this.squidTimer -= dt;
    if (players.length === 0) return;
    if (this.spawnTimer <= 0) {
      // Un intento cada ~2.5 s por jugador: la noche es peligrosa pero no una avalancha.
      this.spawnTimer = 1.5 + this.m.rand() * 2;
      if (this.m.host.difficulty() > 0) for (const p of players) if (p.alive) this.spawnHostiles(p, players.length);
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

  ring(p: PlayerView, min: number, max: number): [number, number] {
    const a = this.m.rand() * TAU, r = min + this.m.rand() * (max - min);
    return [Math.floor(p.x + Math.cos(a) * r), Math.floor(p.z + Math.sin(a) * r)];
  }

  /** Aparición de criaturas hostiles en la oscuridad. */
  spawnHostiles(p: PlayerView, playerCount: number): void {
    // Límite de monstruos cerca del jugador según la dificultad (fácil 9, normal 12, difícil 15 para uno).
    const d = this.m.host.difficulty();
    const cap = (d <= 1 ? 6 : d === 2 ? 8 : 10) + (d <= 1 ? 3 : d === 2 ? 4 : 5) * Math.min(4, playerCount);
    if (this.m.counts(p.x, p.z, 96).hostile >= cap) return;
    const w = this.m.w;
    const night = this.m.host.sunHeight() < -0.02;
    for (let attempt = 0; attempt < 4; attempt++) {
      const [x, z] = this.ring(p, 22, 48);
      const top = w.skyTop(x, z);
      if (top === MIN_Y - 2) continue;
      let y: number;
      if (this.m.rand() < 0.5) y = top + 1;
      else {
        y = Math.floor(p.y + (this.m.rand() - 0.5) * 32);
        let found = false;
        for (let k = 0; k < 10; k++, y--) {
          if (standable(w, x, y, z, 2)) {
            found = true;
            break;
          }
        }
        if (!found) continue;
      }
      if (y <= MIN_Y || !standable(w, x, y, z, 2)) continue;
      const feet = w.getBlock(x, y, z);
      const floor = w.getBlock(x, y - 1, z);
      if (feet > 0 && BLOCK_FLUID[feet]) continue;
      // Como en Minecraft: sólo sobre bloques opacos completos (no losas, cristal, hojas...).
      if (floor <= 0 || !BLOCK_OPAQUE[floor]) continue;
      const exposed = y > top;
      if (exposed && !night) continue;
      if (w.isLitByBlocks(x, y, z)) continue;
      // Tipo según el bioma.
      const info = w.gen.columnInfo(x, z);
      const r = this.m.rand();
      let type: number;
      if (r < 0.34) type = info.biome === 8 ? MOB_HUSK : MOB_ZOMBIE;
      else if (r < 0.6) type = info.temp < -0.5 ? MOB_STRAY : MOB_SKELETON;
      else if (r < 0.8) type = MOB_SPIDER;
      else if (r < 0.95) type = MOB_CREEPER;
      else type = MOB_ENDERMAN;
      const def = MOBS[type];
      if (!standable(w, x, y, z, Math.ceil(def.height))) continue;
      if (type === MOB_SPIDER && !this.spaceFor(x, y, z, 1)) continue;
      this.m.spawnMob(type, x + 0.5, y, z + 0.5);
      return;
    }
  }

  spaceFor(x: number, y: number, z: number, r: number): boolean {
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) if (BLOCK_SOLID[Math.max(0, this.m.w.getBlock(x + dx, y, z + dz))]) return false;
    return true;
  }

  /** Animales en praderas iluminadas por el cielo (los salvajes, según el bioma). */
  spawnPassive(p: PlayerView, force = false): void {
    const c = this.m.counts(p.x, p.z, 72);
    if (!force && c.passive >= 10) return;
    if (!this.roomForPassive(4)) return;
    const w = this.m.w;
    for (let attempt = 0; attempt < 6; attempt++) {
      const [x, z] = this.ring(p, force ? 12 : 24, 56);
      const top = w.skyTop(x, z);
      if (top < MIN_Y) continue;
      const type = this.passiveFor(w.gen.columnInfo(x, z).biome);
      if (type === 0) continue;
      const floor = w.getBlock(x, top, z);
      if (!floorFor(type, floor)) continue;
      const h = Math.ceil(MOBS[type].height);
      const y = top + 1;
      if (!standable(w, x, y, z, h)) continue;
      const [lo, hi] = GROUP[type] ?? [2, 4];
      const n = lo + Math.floor(this.m.rand() * (hi - lo + 1));
      for (let i = 0; i < n; i++) {
        const ox = x + Math.floor((this.m.rand() - 0.5) * 5), oz = z + Math.floor((this.m.rand() - 0.5) * 5);
        const ot = w.skyTop(ox, oz);
        if (ot < MIN_Y) continue;
        const f = w.getBlock(ox, ot, oz);
        if (floorFor(type, f) && standable(w, ox, ot + 1, oz, h)) this.m.spawnMob(type, ox + 0.5, ot + 1, oz + 0.5);
      }
      return;
    }
  }

  /** Animal que aparece en un bioma (0: ninguno). Los de granja salen en casi todos. */
  passiveFor(biome: number): number {
    const r = this.m.rand();
    const farm = (): number => {
      const q = this.m.rand();
      return q < 0.3 ? MOB_PIG : q < 0.55 ? MOB_COW : q < 0.85 ? MOB_SHEEP : MOB_CHICKEN;
    };
    switch (biome) {
      case BIOME_TAIGA:
        return r < 0.25 ? MOB_WOLF : r < 0.5 ? MOB_FOX : farm();
      case BIOME_SNOWY:
        return r < 0.2 ? MOB_FOX : r < 0.35 ? MOB_WOLF : r < 0.5 ? MOB_POLAR_BEAR : r < 0.75 ? MOB_RABBIT : farm();
      case BIOME_ICE_SPIKES:
        return r < 0.5 ? MOB_POLAR_BEAR : MOB_RABBIT;
      case BIOME_FROZEN_OCEAN:
        return MOB_POLAR_BEAR;
      case BIOME_MOUNTAINS:
        return r < 0.5 ? MOB_GOAT : farm();
      case BIOME_SNOWY_PEAKS:
        return MOB_GOAT;
      case BIOME_MEADOW:
        return r < 0.3 ? MOB_GOAT : r < 0.55 ? MOB_RABBIT : farm();
      case BIOME_DESERT:
        return MOB_RABBIT;
      case BIOME_PLAINS:
      case BIOME_CHERRY_GROVE:
        return r < 0.15 ? MOB_RABBIT : farm();
      default:
        return farm();
    }
  }

  /** ¿Caben n animales más? Si no, recicla los más alejados de todos los jugadores. */
  roomForPassive(n: number): boolean {
    const players = this.m.host.players();
    const far: [number, Entity][] = [];
    let total = 0;
    for (const e of this.m.list.values()) {
      if (!e.ai || e.dead || MOBS[e.type].hostile || e.type === MOB_SQUID) continue;
      total++;
      const d = this.m.nearestPlayer2D(e, players);
      if (d > ACTIVE_RANGE) far.push([d, e]);
    }
    if (total + n <= MAX_PASSIVE) return true;
    far.sort((a, b) => b[0] - a[0]);
    const need = total + n - MAX_PASSIVE;
    for (let i = 0; i < need && i < far.length; i++) this.m.remove(far[i][1].id);
    return far.length >= need;
  }

  spawnSquid(p: PlayerView): void {
    if (this.m.counts(p.x, p.z, 64).squid >= 5) return;
    const w = this.m.w;
    for (let attempt = 0; attempt < 3; attempt++) {
      const [x, z] = this.ring(p, 16, 40);
      const y = SEA_LEVEL - 3 - Math.floor(this.m.rand() * 6);
      const a = w.getBlock(x, y, z), b = w.getBlock(x, y + 1, z), c = w.getBlock(x, y - 1, z);
      if (a === WATER && b === WATER && (c === WATER || (c > 0 && BLOCK_FLUID_LEVEL[c] === 0 && BLOCK_FLUID[c] === 1))) {
        this.m.spawnMob(MOB_SQUID, x + 0.5, y, z + 0.5);
        return;
      }
    }
  }
}

/** Tamaño de grupo [mín, máx] de los animales salvajes (los de granja, 2–4). */
const GROUP: Record<number, [number, number]> = {
  [MOB_FOX]: [1, 2],
  [MOB_GOAT]: [1, 3],
  [MOB_POLAR_BEAR]: [1, 2],
  [MOB_RABBIT]: [2, 3],
  [MOB_WOLF]: [2, 4],
};

/** Suelo natural de los animales salvajes (nieve, roca de montaña, arena del desierto, hielo). */
const WILD_FLOORS = new Set<number>([GRASS, SNOWY_GRASS, SNOW_BLOCK, SAND, STONE, GRAVEL, ICE, PACKED_ICE]);
for (let i = 0; i < 8; i++) WILD_FLOORS.add(SNOW_LAYER + i);

/** ¿Puede aparecer este animal sobre ese bloque? Los de granja sólo sobre hierba. */
function floorFor(type: number, floor: number): boolean {
  if (type in GROUP) return WILD_FLOORS.has(floor);
  return floor === GRASS || floor === SNOWY_GRASS;
}
