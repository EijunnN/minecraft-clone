// Aparición natural de criaturas: monstruos en la oscuridad, animales en praderas iluminadas y
// calamares en el agua, con los límites de Minecraft por dificultad y jugadores.
import { MOBS, MOB_PIG, MOB_COW, MOB_SHEEP, MOB_CHICKEN, MOB_ZOMBIE, MOB_HUSK, MOB_SKELETON, MOB_STRAY, MOB_CREEPER, MOB_SPIDER, MOB_ENDERMAN, MOB_SQUID } from '../../mobs';
import { GRASS, SNOWY_GRASS, BLOCK_SOLID, BLOCK_OPAQUE, BLOCK_FLUID, BLOCK_FLUID_LEVEL, WATER } from '../../blocks';
import { SEA_LEVEL } from '../../constants';
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
      if (top === -2) continue;
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
      if (y < 1 || !standable(w, x, y, z, 2)) continue;
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

  /** Animales en praderas iluminadas por el cielo. */
  spawnPassive(p: PlayerView, force = false): void {
    const c = this.m.counts(p.x, p.z, 72);
    if (!force && c.passive >= 10) return;
    if (!this.roomForPassive(4)) return;
    const w = this.m.w;
    for (let attempt = 0; attempt < 6; attempt++) {
      const [x, z] = this.ring(p, force ? 12 : 24, 56);
      const top = w.skyTop(x, z);
      if (top < 0) continue;
      const floor = w.getBlock(x, top, z);
      if (floor !== GRASS && floor !== SNOWY_GRASS) continue;
      const y = top + 1;
      if (!standable(w, x, y, z, 2)) continue;
      const r = this.m.rand();
      const type = r < 0.3 ? MOB_PIG : r < 0.55 ? MOB_COW : r < 0.85 ? MOB_SHEEP : MOB_CHICKEN;
      const n = 2 + Math.floor(this.m.rand() * 3);
      for (let i = 0; i < n; i++) {
        const ox = x + Math.floor((this.m.rand() - 0.5) * 5), oz = z + Math.floor((this.m.rand() - 0.5) * 5);
        const ot = w.skyTop(ox, oz);
        if (ot < 0) continue;
        const f = w.getBlock(ox, ot, oz);
        if ((f === GRASS || f === SNOWY_GRASS) && standable(w, ox, ot + 1, oz, 2)) this.m.spawnMob(type, ox + 0.5, ot + 1, oz + 0.5);
      }
      return;
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
