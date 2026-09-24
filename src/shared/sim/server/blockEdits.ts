// Ediciones de bloques que piden los jugadores: romper (y recoger fluidos con el cubo), colocar
// (con las reglas compartidas de placement.ts) y usar (puertas, camas, azada, polvo de hueso).
// Todo se valida aquí; si algo no vale, se devuelve al jugador el bloque real.
import {
  AIR, BEDROCK, FURNACE_LIT, BLOCKS, BLOCK_FLUID, BLOCK_FLUID_LEVEL, BLOCK_HARDNESS, BLOCK_REPLACEABLE, isValidBlockId,
  isBed,
} from '../../blocks';
import { WORLD_HEIGHT, WORLD_LIMIT, CHUNK_SIZE } from '../../constants';
import { STATE_DEAD, type ClientMsg } from '../../protocol';
import { ITEMS, BONE_MEAL, PLACEABLE_BLOCKS } from '../../items';
import { planPlacement, toggleEdits, isUsable } from '../../placement';
import { blockDrops } from '../drops';
import type { BlockRules } from './blockRules';
import type { Farming } from './farming';
import type { Beds } from './beds';
import type { ServerContext, Session } from './context';

export class BlockEdits {
  constructor(private ctx: ServerContext, private rules: BlockRules, private farming: Farming, private beds: Beds) {}

  /** Romper un bloque o usar un cubo (colocar o recoger un fluido). */
  onSet(s: Session, msg: Extract<ClientMsg, { t: 'set' }>): void {
    const ctx = this.ctx;
    const x = Number(msg.x), y = Number(msg.y), z = Number(msg.z), b = Number(msg.b);
    if (![x, y, z, b].every(Number.isInteger)) return;
    if (Math.abs(x) > WORLD_LIMIT || Math.abs(z) > WORLD_LIMIT || y < 1 || y >= WORLD_HEIGHT) return;
    if (!isValidBlockId(b) || b === BEDROCK || BLOCK_FLUID_LEVEL[b] !== 0 || (b >= FURNACE_LIT && b < FURNACE_LIT + 4)) {
      ctx.reject(s, x, y, z);
      return;
    }
    if (!ctx.allow(s, 1) || s.s & STATE_DEAD || !ctx.reachOk(s, x, y, z, 8)) {
      ctx.reject(s, x, y, z);
      return;
    }
    // Sólo ahora (edición válida y al alcance del jugador) se genera el chunk si aún no estaba.
    ctx.world.ensureChunk(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE), ctx.now());
    const cur = ctx.world.getBlock(x, y, z);
    if (cur < 0) return;
    const creative = s.mode === 'c';
    const tool = Number(msg.tool);
    ctx.asActor(s.id, () => this.rules.withoutDrops(creative, () => {
      if (b === AIR) {
        if (cur === AIR) return;
        if (BLOCK_FLUID[cur]) {
          // Recoger con el cubo: sólo fuentes.
          if (BLOCK_FLUID_LEVEL[cur] !== 0) {
            ctx.reject(s, x, y, z);
            return;
          }
        } else if (BLOCK_HARDNESS[cur] < 0 || !BLOCKS[cur].breakable) {
          ctx.reject(s, x, y, z);
          return;
        }
        const drops = !creative && !BLOCK_FLUID[cur] ? blockDrops(cur, Number.isInteger(tool) ? tool : 0, () => ctx.rand()) : [];
        ctx.world.setBlock(x, y, z, AIR);
        ctx.entities.dropStacks(drops, x + 0.5, y + 0.3, z + 0.5);
      } else {
        // Sólo cubos (fluidos); los bloques se colocan con 'place'.
        if (!BLOCK_FLUID[b] || (!BLOCK_REPLACEABLE[cur] && cur !== b)) {
          ctx.reject(s, x, y, z);
          return;
        }
        ctx.world.setBlock(x, y, z, b);
      }
    }));
  }

  /** Colocar un bloque sobre la cara `n` de la celda golpeada (una o varias celdas). */
  onPlace(s: Session, msg: Extract<ClientMsg, { t: 'place' }>): void {
    const ctx = this.ctx;
    const x = Number(msg.x), y = Number(msg.y), z = Number(msg.z), item = Number(msg.item), yaw = Number(msg.yaw);
    const n = Array.isArray(msg.n) ? msg.n.map(Number) : [];
    const p = Array.isArray(msg.p) ? msg.p.map(Number) : [];
    if (![x, y, z, item].every(Number.isInteger) || !Number.isFinite(yaw) || n.length !== 3 || p.length !== 3) return;
    if (!n.every((v) => v === -1 || v === 0 || v === 1) || Math.abs(n[0]) + Math.abs(n[1]) + Math.abs(n[2]) !== 1) return;
    if (!p.every(Number.isFinite) || Math.abs(p[0] - x - 0.5) > 1 || Math.abs(p[1] - y - 0.5) > 1 || Math.abs(p[2] - z - 0.5) > 1) return;
    if (Math.abs(x) > WORLD_LIMIT || Math.abs(z) > WORLD_LIMIT || y < 0 || y >= WORLD_HEIGHT) return;
    // Deshacer la predicción del cliente en las celdas que pudo tocar.
    const undo = (): void => {
      const cells = [[0, 0, 0], [n[0], n[1], n[2]], [n[0], n[1] + 1, n[2]]];
      for (let d = 0; d < 4; d++) cells.push([n[0] + [0, 1, 0, -1][d], n[1], n[2] + [-1, 0, 1, 0][d]]);
      for (const [dx, dy, dz] of cells) ctx.reject(s, x + dx, y + dy, z + dz);
    };
    if (!isValidBlockId(item) || !PLACEABLE_BLOCKS.has(item) || BLOCK_FLUID[item] || item === BEDROCK) {
      undo();
      return;
    }
    if (!ctx.allow(s, 1) || s.s & STATE_DEAD || !ctx.reachOk(s, x, y, z, 8)) {
      undo();
      return;
    }
    ctx.world.ensureChunk(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE), ctx.now());
    const hitId = ctx.world.getBlock(x, y, z);
    if (hitId < 0) return;
    const get = (bx: number, by: number, bz: number) => ctx.world.getBlock(bx, by, bz);
    const edits = planPlacement(get, { x, y, z, nx: n[0], ny: n[1], nz: n[2], px: p[0], py: p[1], pz: p[2], id: hitId }, item, yaw);
    if (!edits) {
      undo();
      return;
    }
    ctx.asActor(s.id, () => this.rules.applyEdits(edits));
  }

  /** Clic derecho sobre un bloque: objetos (azada, polvo de hueso), puertas, tartas y camas. */
  onUse(s: Session, msg: Extract<ClientMsg, { t: 'use' }>): void {
    const ctx = this.ctx;
    const x = Number(msg.x), y = Number(msg.y), z = Number(msg.z), yaw = Number(msg.yaw);
    if (![x, y, z].every(Number.isInteger) || !Number.isFinite(yaw) || s.s & STATE_DEAD || !ctx.reachOk(s, x, y, z, 8)) return;
    const id = ctx.world.getBlock(x, y, z);
    if (id < 0) return;
    // Usar un objeto sobre el bloque: azada (labrar) y polvo de hueso.
    const item = Number(msg.item);
    if (Number.isInteger(item) && item > 0) {
      const done = ctx.asActor(s.id, () => {
        if (ITEMS[item]?.tool?.kind === 'hoe') return this.farming.till(x, y, z);
        if (item === BONE_MEAL) return this.farming.fertilize(x, y, z);
        return false;
      });
      if (!done) ctx.reject(s, x, y, z);
      if (!done && item !== BONE_MEAL) ctx.reject(s, x, y + 1, z);
      return;
    }
    if (!isUsable(id)) {
      ctx.reject(s, x, y, z);
      return;
    }
    if (isBed(id)) {
      this.beds.trySleep(s, x, y, z, id);
      return;
    }
    const edits = toggleEdits((bx, by, bz) => ctx.world.getBlock(bx, by, bz), x, y, z, yaw);
    if (!edits) return;
    ctx.asActor(s.id, () => this.rules.applyEdits(edits));
  }
}
