// Fase 7 (mecanismos): pistones y pistones adhesivos en el servidor, como en Minecraft.
// - Se extienden si reciben potencia por cualquier lado menos por delante, o si la recibe el bloque de
//   encima del pistón (la cuasi-conectividad: como sólo miran al recibir un aviso, también hay «BUD»).
// - Al extenderse empujan hasta 12 bloques (shared/pistons.ts decide cuáles y rompe los que se rompen); al
//   recogerse, el adhesivo tira del bloque de delante (y de lo que arrastre el slime o la miel).
// - Lo que se mueve pasa 2 ticks como «bloque en movimiento» (un hueco invisible que no choca) y luego se
//   asienta; el cliente lo ve deslizarse (efecto 'pmove' por bloque) y las entidades que estorban se
//   empujan (el slime las lanza).
// - Un pulso corto (se apaga antes de terminar de extenderse) deja lo empujado donde está: el adhesivo
//   «escupe» su bloque.
// - Romper la base quita la cabeza; romper la cabeza rompe la base (y suelta el pistón).
import {
  AIR, SLIME_BLOCK, HONEY_BLOCK, BLOCK_COLLIDE, isPiston, isStickyPiston, pistonExtended, pistonState, isPistonHead, headState, facingOf,
  MOVING_BLOCK, PISTON, STICKY_PISTON, familyBase,
} from '../../blocks';
import { registerRedstone, FACE_X, FACE_Y, FACE_Z, DOWN, type RedstoneApi } from '../../redstone';
import { resolvePush, isPushable, pushReaction, PUSH_NORMAL, type Cell } from '../../pistons';
import { ENT_DISPLAY } from '../../mobs';
import { isHangingType } from '../../paintings';
import { isVehicleType } from '../../vehicles';
import { posKey } from '../posKey';
import type { Redstone } from './redstone';
import type { BlockRules } from './blockRules';
import type { ServerContext } from './context';

/** Ticks que tarda en asentarse lo que mueve un pistón (en Minecraft, 2 deslizándose y se asienta en el tercero). */
export const MOVE_TICKS = 2;
/** Velocidad (bloques/s) con la que lanza un bloque de slime empujado (1 bloque por tick). */
const SLIME_LAUNCH = 20;

interface MovingCell extends Cell {
  /** Bloque que quedará al asentarse. */
  block: number;
}

interface Move {
  x: number;
  y: number;
  z: number;
  key: number;
  extending: boolean;
  due: number;
  cells: MovingCell[];
}

const SYSTEMS = new WeakMap<RedstoneApi, Pistons>();

registerRedstone([PISTON, STICKY_PISTON], {
  neighbor: (api, x, y, z) => SYSTEMS.get(api)?.check(x, y, z),
});
registerRedstone(MOVING_BLOCK, {
  // Al cargar un chunk guardado a medio movimiento, el hueco se vacía (lo que se movía se pierde).
  changed: (api, x, y, z, old) => {
    if (old < 0) api.schedule(x, y, z, MOVE_TICKS + 1);
  },
  tick: (api, x, y, z) => {
    const s = SYSTEMS.get(api);
    if (s && !s.isMoving(x, y, z)) api.setBlock(x, y, z, AIR);
  },
});

export class Pistons {
  private moves = new Map<number, Move>();
  private cells = new Set<number>();
  /** Mientras mueve bloques no reacciona a sus propios cambios (cabezas y bases). */
  private busy = false;

  constructor(private ctx: ServerContext, private rs: Redstone, private rules: BlockRules) {
    SYSTEMS.set(rs, this);
  }

  /** ¿Hay algo moviéndose en (x, y, z)? */
  isMoving(x: number, y: number, z: number): boolean {
    return this.cells.has(posKey(x, y, z));
  }

  /** Movimientos en curso (para las pruebas). */
  get pending(): number {
    return this.moves.size;
  }

  /** Bloques del mundo; los pistones que se están moviendo cuentan como inamovibles. */
  private readonly get = (x: number, y: number, z: number): number =>
    this.moves.has(posKey(x, y, z)) ? MOVING_BLOCK : this.ctx.world.getBlock(x, y, z);

  /** ¿Recibe potencia? Por cualquier lado menos por delante; o el bloque de encima, por cualquiera menos por abajo. */
  powered(x: number, y: number, z: number, facing: number): boolean {
    const rs = this.rs;
    for (let f = 0; f < 6; f++) if (f !== facing && rs.powerFrom(x, y, z, f) > 0) return true;
    for (let f = 0; f < 6; f++) if (f !== DOWN && rs.powerFrom(x, y + 1, z, f) > 0) return true;
    return false;
  }

  /** Un aviso llegó al pistón de (x, y, z): se extiende o se recoge si cambió la potencia. */
  check(x: number, y: number, z: number): void {
    const id = this.ctx.world.getBlock(x, y, z);
    if (!isPiston(id)) return;
    const facing = facingOf(id);
    const powered = this.powered(x, y, z, facing);
    const move = this.moves.get(posKey(x, y, z));
    if (move) {
      if (!move.extending || powered) return; // se mira otra vez al terminar
      // Se apaga antes de acabar de extenderse: lo empujado se queda donde iba y no se recoge.
      this.finish(move);
      const now = this.ctx.world.getBlock(x, y, z);
      if (isPiston(now) && pistonExtended(now)) this.retract(x, y, z, now, false);
      return;
    }
    const extended = pistonExtended(id);
    if (powered && !extended) this.extend(x, y, z, id);
    else if (!powered && extended) this.retract(x, y, z, id, isStickyPiston(id));
  }

  private extend(x: number, y: number, z: number, id: number): void {
    const facing = facingOf(id);
    const plan = resolvePush(this.get, x, y, z, facing, true);
    if (!plan) return;
    const head: Cell = { x: x + FACE_X[facing], y: y + FACE_Y[facing], z: z + FACE_Z[facing] };
    const cells = this.move(plan.toPush, plan.toDestroy, plan.dir, () => {
      this.ctx.world.setBlock(head.x, head.y, head.z, MOVING_BLOCK);
      this.ctx.world.setBlock(x, y, z, pistonState(id, facing, true));
    }, head);
    const all = [...cells, { ...head, block: headState(facing, isStickyPiston(id)) }];
    this.start(x, y, z, true, all);
    this.anim({ x, y, z }, headState(facing, isStickyPiston(id)), facing);
    this.ctx.fx('piston', x + 0.5, y + 0.5, z + 0.5, 1);
    this.pushEntities(all, plan.dir);
  }

  /** Se recoge; `pull`: el adhesivo tira del bloque de delante (si se puede mover). */
  private retract(x: number, y: number, z: number, id: number, pull: boolean): void {
    const facing = facingOf(id);
    const w = this.ctx.world;
    const head: Cell = { x: x + FACE_X[facing], y: y + FACE_Y[facing], z: z + FACE_Z[facing] };
    let plan = null;
    if (pull) {
      const fx = x + FACE_X[facing] * 2, fy = y + FACE_Y[facing] * 2, fz = z + FACE_Z[facing] * 2;
      const b = this.get(fx, fy, fz);
      if (b > 0 && isPushable(b, fy, facing ^ 1, false, facing) && (pushReaction(b) === PUSH_NORMAL || isPiston(b))) {
        plan = resolvePush(this.get, x, y, z, facing, false);
      }
    }
    const headId = w.getBlock(head.x, head.y, head.z);
    const cells = this.move(plan?.toPush ?? [], plan?.toDestroy ?? [], facing ^ 1, () => {
      w.setBlock(x, y, z, pistonState(id, facing, false));
      if (isPistonHead(headId) && facingOf(headId) === facing && w.getBlock(head.x, head.y, head.z) === headId) {
        w.setBlock(head.x, head.y, head.z, AIR);
      }
    }, null);
    this.start(x, y, z, false, cells);
    if (isPistonHead(headId)) this.anim(head, headId, facing ^ 1);
    this.ctx.fx('piston', x + 0.5, y + 0.5, z + 0.5, 0);
    this.pushEntities(cells, facing ^ 1);
  }

  /**
   * Mueve los bloques `toPush` una celda hacia `dir` (rompe antes los de `toDestroy`): los destinos pasan a
   * ser bloques en movimiento y lo que queda vacío, aire. `between` cambia el pistón y su cabeza. Devuelve
   * lo que se asentará en cada destino.
   */
  private move(toPush: Cell[], toDestroy: Cell[], dir: number, between: () => void, reserved: Cell | null): MovingCell[] {
    const w = this.ctx.world;
    const cells: MovingCell[] = [];
    this.busy = true;
    try {
      for (let i = toDestroy.length - 1; i >= 0; i--) {
        const c = toDestroy[i];
        const b = w.getBlock(c.x, c.y, c.z);
        if (b > 0) this.rules.breakWithDrops(c.x, c.y, c.z, b);
      }
      const blocks = toPush.map((c) => w.getBlock(c.x, c.y, c.z));
      const dest = toPush.map((c) => ({ x: c.x + FACE_X[dir], y: c.y + FACE_Y[dir], z: c.z + FACE_Z[dir] }));
      const taken = new Set(dest.map((c) => posKey(c.x, c.y, c.z)));
      if (reserved) taken.add(posKey(reserved.x, reserved.y, reserved.z));
      for (let i = toPush.length - 1; i >= 0; i--) {
        const d = dest[i];
        w.setBlock(d.x, d.y, d.z, MOVING_BLOCK);
        cells.push({ ...d, block: blocks[i] });
      }
      between();
      for (const c of toPush) if (!taken.has(posKey(c.x, c.y, c.z))) w.setBlock(c.x, c.y, c.z, AIR);
    } finally {
      this.busy = false;
    }
    for (let i = 0; i < toPush.length; i++) this.anim(toPush[i], cells[toPush.length - 1 - i].block, dir);
    return cells;
  }

  private start(x: number, y: number, z: number, extending: boolean, cells: MovingCell[]): void {
    const key = posKey(x, y, z);
    this.moves.set(key, { x, y, z, key, extending, due: this.ctx.tickCount + MOVE_TICKS, cells });
    for (const c of cells) this.cells.add(posKey(c.x, c.y, c.z));
  }

  /** Lo que se estaba moviendo se asienta. */
  private finish(m: Move): void {
    const w = this.ctx.world;
    this.moves.delete(m.key);
    this.busy = true;
    try {
      for (const c of m.cells) {
        this.cells.delete(posKey(c.x, c.y, c.z));
        if (w.getBlock(c.x, c.y, c.z) !== MOVING_BLOCK) continue;
        // Una cabeza cuya base ya no está (se rompió mientras se extendía) no se queda sola.
        let id = c.block;
        if (isPistonHead(id)) {
          const f = facingOf(id);
          const b = w.getBlock(c.x - FACE_X[f], c.y - FACE_Y[f], c.z - FACE_Z[f]);
          if (!isPiston(b) || !pistonExtended(b) || facingOf(b) !== f) id = AIR;
        }
        w.setBlock(c.x, c.y, c.z, id);
      }
    } finally {
      this.busy = false;
    }
    // Mira otra vez la potencia (pudo cambiar mientras se movía).
    this.rs.updateAt(m.x, m.y, m.z);
  }

  /** Cada tick: se asienta lo que terminó de moverse. */
  tick(): void {
    if (this.moves.size === 0) return;
    const now = this.ctx.tickCount;
    for (const m of [...this.moves.values()]) if (m.due <= now && this.moves.get(m.key) === m) this.finish(m);
  }

  /** El cliente dibuja el bloque `block` deslizándose de (c) una celda hacia `dir`. */
  private anim(c: Cell, block: number, dir: number): void {
    if (block > 0) this.ctx.fx('pmove', c.x, c.y, c.z, block, dir);
  }

  /**
   * Las entidades que ocupan el sitio al que llega un bloque que choca se apartan hacia donde se mueve (los
   * jugadores los aparta su cliente); el slime, además, las lanza, y la miel se lleva las que tiene pegadas
   * (encima o a los lados).
   */
  private pushEntities(cells: MovingCell[], dir: number): void {
    if (cells.length === 0) return;
    const ax = FACE_X[dir], ay = FACE_Y[dir], az = FACE_Z[dir];
    for (const e of this.ctx.entities.list.values()) {
      if (e.dead || e.type === ENT_DISPLAY || isHangingType(e.type) || isVehicleType(e.type)) continue;
      const hw = e.width / 2, h = Math.max(0.1, e.height);
      let need = 0, slime = false, honey = false;
      for (const c of cells) {
        if (BLOCK_COLLIDE[c.block] === 0) continue;
        if (c.block === HONEY_BLOCK) {
          // Pegada a la miel (tocando su caja de antes de moverse, salvo por la cara de delante).
          const ox = c.x - ax, oy = c.y - ay, oz = c.z - az, m = 0.02;
          const touch = e.x + hw > ox - m && e.x - hw < ox + 1 + m && e.y + h > oy - m && e.y < oy + 1 + m && e.z + hw > oz - m && e.z - hw < oz + 1 + m;
          if (touch) honey = true;
        }
        if (e.x + hw <= c.x || e.x - hw >= c.x + 1 || e.y + h <= c.y || e.y >= c.y + 1 || e.z + hw <= c.z || e.z - hw >= c.z + 1) continue;
        const d = ax > 0 ? c.x + 1 - (e.x - hw) : ax < 0 ? e.x + hw - c.x : ay > 0 ? c.y + 1 - e.y : ay < 0 ? e.y + h - c.y
          : az > 0 ? c.z + 1 - (e.z - hw) : e.z + hw - c.z;
        need = Math.max(need, Math.min(1.01, d + 0.01));
        if (c.block === SLIME_BLOCK) slime = true;
      }
      if (honey && need === 0) need = 1;
      if (need > 0) {
        e.x += ax * need;
        e.y += ay * need;
        e.z += az * need;
        if (ay !== 0) e.fallStart = e.y;
      }
      if (slime) {
        if (ax) e.vx = ax * SLIME_LAUNCH;
        if (ay) e.vy = ay * SLIME_LAUNCH;
        if (az) e.vz = az * SLIME_LAUNCH;
        e.onGround = false;
      }
    }
  }

  /** Cambio de bloque (de quien sea): la base y la cabeza no se quedan la una sin la otra. */
  onBlockChanged(x: number, y: number, z: number, old: number, id: number): void {
    if (this.busy || old <= 0) return;
    const w = this.ctx.world;
    if (isPiston(old) && pistonExtended(old) && !(isPiston(id) && familyBase(id) === familyBase(old))) {
      const f = facingOf(old);
      const hx = x + FACE_X[f], hy = y + FACE_Y[f], hz = z + FACE_Z[f];
      const h = w.getBlock(hx, hy, hz);
      if (isPistonHead(h) && facingOf(h) === f) w.setBlock(hx, hy, hz, AIR);
    } else if (isPistonHead(old) && !isPistonHead(id) && id !== MOVING_BLOCK) {
      const f = facingOf(old);
      const bx = x - FACE_X[f], by = y - FACE_Y[f], bz = z - FACE_Z[f];
      const b = w.getBlock(bx, by, bz);
      if (isPiston(b) && pistonExtended(b) && facingOf(b) === f) this.rules.breakWithDrops(bx, by, bz, b);
    }
  }
}
