// Programa lunar: los brazos (inserters) en el cliente: dibuja el trabajo de cada brazo con lo que manda el servidor ('arms').
//
// El servidor manda, de los brazos de alrededor: fase (0 quieto, 1 llevando, 2 volviendo), cuánto lleva de esa media vuelta (0..255) y lo
// que lleva en la mano. Entre mensajes el cliente sigue avanzando el ángulo por su cuenta a la velocidad del tipo de brazo. La pinza va
// de lo que tiene detrás (ángulo 0) a lo que tiene delante (ángulo π) por un arco; el brazo es una barra desde el pivote hasta la pinza.
import { INSERTER_TYPES, inserterCycleTicks } from '../../shared/logistics/inserters';
import { inserterInfo } from '../../shared/blocks';
import { BELT_DX, BELT_DZ } from '../../shared/logistics/belts';
import { ENT_DISPLAY } from '../../shared/mobs';
import { posKey, keyX, keyY, keyZ } from '../../shared/sim/posKey';
import type { ServerMsg } from '../../shared/protocol';
import type { ClientEntity } from './ClientEntities';
import type { Game } from './Game';

const RANGE = 40;
/** Segundos sin noticias tras los que se olvida un brazo (el servidor los repite cada segundo). */
const STALE = 3.5;
/** Altura del pivote sobre la base de la casilla y lo que sube la pinza en lo más alto del arco. */
const PIVOT_Y = 0.55;
const LIFT = 0.32;

interface ArmState {
  phase: number;
  /** Avance de la media vuelta (0..1) en el momento `t`. */
  prog: number;
  item: number;
  count: number;
  t: number;
}

export interface ArmDraw {
  tier: number;
  /** Pivote y pinza en coordenadas del mundo. */
  px: number; py: number; pz: number;
  hx: number; hy: number; hz: number;
}

export class ArmClient {
  private arms = new Map<number, ArmState>();
  private pool: ClientEntity[] = [];
  private now = 0;

  constructor(private g: Game) {}

  reset(): void {
    this.arms.clear();
  }

  update(dt: number): void {
    this.now += dt;
  }

  onMessage(msg: ServerMsg): boolean {
    if (msg.t !== 'arms') return false;
    for (const r of msg.l) {
      this.arms.set(posKey(r[0], r[1], r[2]), { phase: r[3], prog: r[4] / 255, item: r[5], count: r[6], t: this.now });
    }
    return true;
  }

  /** Las barras y las manos de los brazos cercanos. */
  draws(): { bars: ArmDraw[]; hands: ClientEntity[] } {
    const bars: ArmDraw[] = [];
    const hands: ClientEntity[] = [];
    const world = this.g.world;
    if (!world) return { bars, hands };
    const p = this.g.player;
    let n = 0;
    for (const [k, a] of this.arms) {
      const x = keyX(k), y = keyY(k), z = keyZ(k);
      const info = inserterInfo(world.getBlock(x, y, z));
      if (!info || this.now - a.t > STALE) {
        if (!info || this.now - a.t > STALE * 2) this.arms.delete(k);
        continue;
      }
      if (Math.abs(x + 0.5 - p.x) > RANGE || Math.abs(z + 0.5 - p.z) > RANGE) continue;
      const t = INSERTER_TYPES[info.tier];
      // La media vuelta dura la mitad de la vuelta entera (20 ticks por segundo).
      const half = inserterCycleTicks(t) / 2 / 20;
      let prog = a.phase === 0 ? 0 : Math.min(1, a.prog + (this.now - a.t) / half);
      // Se quedó esperando (sin sitio donde soltar): la pinza aguarda arriba, sobre lo de delante.
      const theta = a.phase === 0 ? 0 : Math.PI * (a.phase === 1 ? prog : 1 - prog);
      const fx = BELT_DX[info.dir], fz = BELT_DZ[info.dir];
      const cx = x + 0.5, cz = z + 0.5;
      const along = -Math.cos(theta) * t.reach;
      const hx = cx + fx * along, hz = cz + fz * along;
      const hy = y + PIVOT_Y - 0.1 + Math.sin(theta) * LIFT;
      bars.push({ tier: info.tier, px: cx, py: y + PIVOT_Y, pz: cz, hx, hy, hz });
      if (a.count > 0 && a.item > 0 && a.phase !== 2) {
        for (let i = 0; i < Math.min(a.count, 3); i++) {
          const e = this.entity(n++);
          e.item = a.item;
          e.x = hx + fx * 0.1 * i;
          e.z = hz + fz * 0.1 * i;
          e.y = hy - 0.22;
          e.yaw = 0;
          hands.push(e);
        }
      }
    }
    return { bars, hands };
  }

  private entity(i: number): ClientEntity {
    let e = this.pool[i];
    if (!e) {
      e = {
        id: -5000 - i, type: ENT_DISPLAY, snaps: [], x: 0, y: 0, z: 0, yaw: 0, bodyYaw: 0, pitch: 0, flags: 0, item: 0, count: 1, health: 1,
        variant: 0, walkPhase: 0, walkAmount: 0, age: 0, hurtT: 99, deathT: -1, actionT: -1, collector: null, collectT: 0, gone: false,
        seed: 0, lastX: 0, lastZ: 0,
      };
      this.pool[i] = e;
    }
    return e;
  }
}
