// Granja: labrar con la azada, polvo de hueso, humedad de la tierra de cultivo, crecimiento de los
// cultivos, pisoteo y lo que se hace con los animales (dar de comer, esquilar, ordeñar).
import {
  AIR, GRASS, DIRT, FARMLAND, POPPY, DANDELION, SHORT_GRASS, BLOCK_FLUID, CROP_MAX_AGE, isFarmland, isCrop,
  isMatureCrop, familyBase,
} from '../../blocks';
import { STATE_DEAD, type ClientMsg } from '../../protocol';
import { rainAt } from '../../weather';
import { SAPLINGS } from './plants';
import type { Nature } from './nature';
import type { ServerContext, Session } from './context';

export class Farming {
  constructor(private ctx: ServerContext, private nature: Nature) {
    nature.addRandomTickHandler((id, x, y, z) => this.randomTick(id, x, y, z));
  }

  /** Usar un objeto sobre una criatura (el resultado dice qué cambia en la mano del jugador). */
  onInteract(s: Session, msg: Extract<ClientMsg, { t: 'interact' }>): void {
    const ctx = this.ctx;
    const q = Number(msg.q) | 0;
    const e = ctx.entities.list.get(Number(msg.e));
    const item = Number(msg.item);
    const far = e && !ctx.local && Math.hypot(e.x - s.p[0], e.y - s.p[1], e.z - s.p[2]) > 6;
    if (!e || far || !Number.isInteger(item) || s.s & STATE_DEAD) {
      ctx.send(s, { t: 'ires', q, ok: false });
      return;
    }
    const r = ctx.entities.interact(e, item, s.mode === 'c');
    ctx.send(s, { t: 'ires', q, ...r });
  }

  /** ¿Hay agua a 4 bloques en horizontal (a la misma altura o uno por encima)? */
  private hydrated(x: number, y: number, z: number): boolean {
    for (let dy = 0; dy <= 1; dy++) {
      for (let dz = -4; dz <= 4; dz++) {
        for (let dx = -4; dx <= 4; dx++) {
          const b = this.ctx.world.getBlock(x + dx, y + dy, z + dz);
          if (b > 0 && BLOCK_FLUID[b] === 1) return true;
        }
      }
    }
    return false;
  }

  /** Labrar con la azada: hierba o tierra con aire encima → tierra de cultivo. */
  till(x: number, y: number, z: number): boolean {
    const w = this.ctx.world;
    const id = w.getBlock(x, y, z);
    if (id !== GRASS && id !== DIRT) return false;
    if (w.getBlock(x, y + 1, z) !== AIR) return false;
    w.setBlock(x, y, z, FARMLAND + (this.hydrated(x, y, z) ? 1 : 0));
    return true;
  }

  /** La tierra de cultivo pisoteada vuelve a ser tierra (y el cultivo de encima se rompe). */
  trample(x: number, y: number, z: number): void {
    if (isFarmland(this.ctx.world.getBlock(x, y, z))) this.ctx.world.setBlock(x, y, z, DIRT);
  }

  /** Polvo de hueso: hace crecer cultivos y brotes, y cubre la hierba de plantas. */
  fertilize(x: number, y: number, z: number): boolean {
    const ctx = this.ctx;
    const w = ctx.world;
    const id = w.getBlock(x, y, z);
    if (isCrop(id)) {
      if (isMatureCrop(id)) return false;
      const base = familyBase(id);
      w.setBlock(x, y, z, Math.min(base + CROP_MAX_AGE[base], id + 2 + Math.floor(ctx.rand() * 4)));
      ctx.fx('bonemeal', x + 0.5, y + 0.4, z + 0.5);
      return true;
    }
    if (SAPLINGS.has(id)) {
      ctx.fx('bonemeal', x + 0.5, y + 0.4, z + 0.5);
      if (ctx.rand() < 0.45) this.nature.growTree(x, y, z, SAPLINGS.get(id)!);
      return true;
    }
    if (id === GRASS && w.getBlock(x, y + 1, z) === AIR) {
      for (let k = 0; k < 40; k++) {
        const bx = x + Math.round((ctx.rand() - 0.5) * 6), bz = z + Math.round((ctx.rand() - 0.5) * 6);
        for (let by = y + 2; by >= y - 2; by--) {
          if (w.getBlock(bx, by, bz) !== GRASS || w.getBlock(bx, by + 1, bz) !== AIR) continue;
          const r = ctx.rand();
          w.setBlock(bx, by + 1, bz, r < 0.85 ? SHORT_GRASS : r < 0.93 ? POPPY : DANDELION);
          break;
        }
      }
      ctx.fx('bonemeal', x + 0.5, y + 1.2, z + 0.5);
      return true;
    }
    return false;
  }

  /** Humedad de la tierra de cultivo y crecimiento de los cultivos. */
  private randomTick(id: number, x: number, y: number, z: number): boolean {
    const ctx = this.ctx;
    const w = ctx.world;
    if (isFarmland(id)) {
      const above = w.getBlock(x, y + 1, z);
      const rain = rainAt(ctx.worldTime(), ctx.seed) > 0.2 && w.skyTop(x, z) <= y;
      const moist = id !== FARMLAND;
      if (this.hydrated(x, y, z) || rain) {
        if (!moist) w.setBlock(x, y, z, FARMLAND + 1);
      } else if (moist) w.setBlock(x, y, z, FARMLAND);
      else if (!isCrop(above)) w.setBlock(x, y, z, DIRT);
      return true;
    }
    if (!isCrop(id)) return false;
    if (isMatureCrop(id)) return true;
    // Luz: cielo abierto (aunque sea de noche, como en Minecraft) o una antorcha cerca.
    if (w.skyTop(x, z) > y && !w.isLitByBlocks(x, y, z)) return true;
    // Velocidad como en Minecraft: la tierra húmeda de debajo y la de alrededor ayudan.
    let f = 1;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const b = w.getBlock(x + dx, y - 1, z + dz);
        if (!isFarmland(b)) continue;
        const wet = b !== FARMLAND;
        f += dx === 0 && dz === 0 ? (wet ? 3 : 1) : wet ? 0.75 : 0.25;
      }
    }
    if (ctx.rand() < 1 / (Math.floor(25 / f) + 1)) w.setBlock(x, y, z, id + 1);
    return true;
  }
}
