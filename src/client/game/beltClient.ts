// Programa lunar: las cintas, las subterráneas y los divisores en el cliente.
//
// El servidor manda lo que llevan las piezas de alrededor ('belts') al momento cuando algo entra o sale de fuera y de vez en cuando
// por si acaso. Entre mensaje y mensaje, este cliente las mueve por su cuenta con el MISMO motor y la MISMA red (shared/logistics), así
// que los objetos avanzan con suavidad, se frenan al final, se reparten en los divisores, cruzan los túneles y se apilan sin que haga
// falta un mensaje por tick. Las piezas que aún no conoce (vacías) las crea al vuelo a partir de los bloques del mundo.
//
// Los objetos se dibujan como los que están tumbados en una fogata (ENT_DISPLAY): entidades falsas, sólo de este cliente. Lo que va por
// un túnel o bajo la capucha de una subterránea no se ve.
import { BeltNetwork } from '../../shared/logistics/network';
import { BELT_DX, BELT_DZ, BELT_HEIGHT_FOR_ITEMS, K_UG_IN, K_UG_OUT } from '../../shared/logistics/belts';
import { ENT_DISPLAY } from '../../shared/mobs';
import { posKey } from '../../shared/sim/posKey';
import type { ServerMsg } from '../../shared/protocol';
import type { ClientEntity } from './ClientEntities';
import type { Game } from './Game';

const STEP = 0.05;
/** Distancia (bloques) a la que se mueven y dibujan las cintas. */
const RANGE = 72;

export class BeltClient {
  private net: BeltNetwork;
  private dirty = true;
  private acc = 0;
  private pruneT = 0;
  private pool: ClientEntity[] = [];

  constructor(private g: Game) {
    this.net = this.makeNet();
  }

  private makeNet(): BeltNetwork {
    const n = new BeltNetwork((x, y, z) => this.g.world?.getBlock(x, y, z) ?? 0);
    n.lazy = true;
    return n;
  }

  /** Otro mundo: lo del anterior no vale. */
  reset(): void {
    this.net = this.makeNet();
    this.dirty = true;
  }

  /** La pieza de (x, y, z), creándola (vacía) si el bloque del mundo lo es. */
  private at(x: number, y: number, z: number) {
    const had = this.net.tiles.has(posKey(x, y, z));
    const b = this.net.at(x, y, z);
    if (b && !had) this.dirty = true;
    return b;
  }

  /** Configuración del divisor cuya casilla principal es (x, y, z), tal como la conoce este cliente (null si aún no lo ve). */
  splitterConfig(x: number, y: number, z: number): { inPri: number; outPri: number; filter: number; filterSide: number } | null {
    this.at(x, y, z);
    this.relink();
    const st = this.net.splits.get(posKey(x, y, z));
    return st ? { inPri: st.inPri, outPri: st.outPri, filter: st.filter, filterSide: st.filterSide } : null;
  }

  private relink(): void {
    if (!this.dirty) return;
    this.net.link();
    this.dirty = false;
  }

  onMessage(msg: ServerMsg): boolean {
    if (msg.t !== 'belts') return false;
    const fill = (b: { lanes: [{ s: { id: number; count: number }; p: number }[], { s: { id: number; count: number }; p: number }[]]; moving: [boolean, boolean] }, row: number[], at: number): void => {
      const mv = row[at], n0 = row[at + 1];
      b.moving = [(mv & 1) !== 0, (mv & 2) !== 0];
      b.lanes = [[], []];
      for (let i = 0, o = at + 2; o + 1 < row.length; i++, o += 2) {
        b.lanes[i < n0 ? 0 : 1].push({ s: { id: row[o], count: 1 }, p: Math.max(0, Math.min(0.999, row[o + 1] / 255)) });
      }
      for (const lane of b.lanes) lane.sort((a, c) => c.p - a.p);
    };
    for (const row of msg.l) {
      const b = this.at(row[0], row[1], row[2]);
      if (b) fill(b, row, 3);
    }
    if (msg.c || msg.u) this.relink();
    // Configuración de los divisores.
    for (const c of msg.c ?? []) {
      this.at(c[0], c[1], c[2]);
      this.relink();
      const st = this.net.splits.get(posKey(c[0], c[1], c[2]));
      if (st) {
        st.inPri = Math.sign(c[3]) as -1 | 0 | 1;
        st.outPri = Math.sign(c[4]) as -1 | 0 | 1;
        st.filter = c[5];
        st.filterSide = c[6] < 0 ? -1 : 1;
      }
    }
    // Tramos de túnel: se identifican por la casilla de su entrada y su número.
    for (const u of msg.u ?? []) {
      this.at(u[0], u[1], u[2]);
      this.relink();
      const t = this.net.tunnels.get(posKey(u[0], u[1], u[2]));
      const piece = t?.[u[3]];
      if (piece) fill(piece, u, 4);
    }
    return true;
  }

  /** Cada frame: mueve las piezas cercanas con pasos fijos de 20 por segundo. */
  update(dt: number): void {
    const world = this.g.world;
    if (!world || this.net.tiles.size === 0) return;
    // Cada segundo, se retiran las que ya no son de la red o quedaron lejos, y se vuelven a calcular sus enlaces.
    this.pruneT -= dt;
    if (this.pruneT <= 0) {
      this.pruneT = 1;
      const p = this.g.player;
      for (const [k, b] of [...this.net.tiles]) {
        const far = Math.hypot(b.x + 0.5 - p.x, b.z + 0.5 - p.z) > RANGE + 16;
        if (far) {
          this.net.discard(k);
          this.dirty = true;
        } else {
          const r = this.net.sync(b.x, b.y, b.z);
          if (!r.belt || r.created || r.removed) this.dirty = true;
        }
      }
      this.dirty = true;
    }
    this.relink();
    this.acc = Math.min(this.acc + dt, STEP * 5);
    while (this.acc >= STEP) {
      this.acc -= STEP;
      this.net.step(STEP);
    }
  }

  /** Los objetos de las piezas cercanas como entidades falsas para dibujarlos (la posición está ya interpolada con `acc`). */
  draws(): ClientEntity[] {
    const out: ClientEntity[] = [];
    const p = this.g.player;
    const lead = this.acc; // segundos que llevan de adelanto los objetos respecto al último paso
    let n = 0;
    for (const b of this.net.tiles.values()) {
      if (b.lanes[0].length + b.lanes[1].length === 0) continue;
      const cx = b.x + 0.5, cz = b.z + 0.5;
      if (Math.abs(cx - p.x) > RANGE || Math.abs(cz - p.z) > RANGE) continue;
      const d = b.dir;
      const fx = BELT_DX[d], fz = BELT_DZ[d];
      const lx = BELT_DX[(d + 3) % 4], lz = BELT_DZ[(d + 3) % 4]; // izquierda de la marcha
      for (let lane = 0; lane < 2; lane++) {
        const side = lane === 0 ? 0.24 : -0.24;
        for (const it of b.lanes[lane]) {
          // Un poco más adelante de donde estaba en el último paso, si no está parado, para que el movimiento sea continuo.
          const pos = it.p + (b.moving[lane] ? lead * 1.875 : 0);
          // Bajo la capucha de una subterránea no se ve: en la entrada, la mitad de delante; en la salida, la de atrás.
          if (b.kind === K_UG_IN && pos > 0.5) continue;
          if (b.kind === K_UG_OUT && pos < 0.5) continue;
          const along = Math.min(pos, 0.999) - 0.5;
          const e = this.entity(n++);
          e.item = it.s.id;
          e.x = cx + fx * along + lx * side;
          e.z = cz + fz * along + lz * side;
          e.y = b.y + BELT_HEIGHT_FOR_ITEMS;
          e.yaw = Math.atan2(-fx, -fz) + Math.PI / 2;
          out.push(e);
        }
      }
    }
    return out;
  }

  private entity(i: number): ClientEntity {
    let e = this.pool[i];
    if (!e) {
      e = {
        id: -1000 - i, type: ENT_DISPLAY, snaps: [], x: 0, y: 0, z: 0, yaw: 0, bodyYaw: 0, pitch: 0, flags: 0, item: 0, count: 1, health: 1,
        variant: 0, walkPhase: 0, walkAmount: 0, age: 0, hurtT: 99, deathT: -1, actionT: -1, collector: null, collectT: 0, gone: false,
        seed: 0, lastX: 0, lastZ: 0,
      };
      this.pool[i] = e;
    }
    return e;
  }
}
