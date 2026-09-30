// Programa lunar (idea-luna.md): el cohete Selene en el servidor.
//
// Una entidad sin IA (ENT_ROCKET) que este sistema crea, mueve y retira. A diferencia de las barcas, la mueve SIEMPRE el
// servidor por las curvas de shared/rocket.ts: el cliente sólo dibuja y se sienta donde le dicen. Fases:
//   en tierra (con gente subiendo) → cuenta atrás → ascenso → [otra dimensión] → tránsito → descenso → en tierra.
// Al acabar el ascenso cada pasajero viaja a la dimensión de destino (Multiverse.travel con Arrival 'rocket') y allí se crea un
// cohete nuevo, quieto en lo alto, con ellos sentados dentro: mientras dura el tránsito su cliente pinta el viaje por el espacio y
// carga el terreno de abajo; luego baja frenando. Los cohetes en tierra se guardan; los que vuelan, no.
//
// Ir y volver: la plataforma de la que sale cada vuelo viaja con él (`pad`), y el destino la recuerda para el regreso.
import { STATE_DEAD, type ClientMsg, type ServerMsg } from '../../protocol';
import {
  ENT_ROCKET, ROCKET_SEATS, ROCKET_WIDTH, ROCKET_HEIGHT, RK_PHASE, COUNTDOWN_S, IGNITION_AT, ASCENT_S, COAST_S, DESCENT_START,
  DESCENT_DECEL, RF_PHASE_SHIFT, RF_BURN, ascentHeight, descentStep, rocketSeatPos, type RocketPhase,
} from '../../rocket';
import { DIM_OVERWORLD, DIM_MOON } from '../../dimensions';
import type { Entity } from '../entities';
import type { ServerStore } from '../store';
import { DT, r2, type Arrival, type ServerContext, type Session } from './context';

/** Distancia máxima a la base del cohete para subirse. */
const BOARD_REACH = 7;

type Pad = [number, number, number];

interface Rocket {
  e: Entity;
  phase: RocketPhase;
  /** Segundos en la fase actual. */
  t: number;
  /** Id de sesión de quien ocupa cada plaza. */
  seats: (string | null)[];
  /** Altura de la base cuando está posado (donde aterriza o de donde despega). */
  restY: number;
  /** Dimensión a la que iría desde aquí (-1: no puede despegar). */
  dest: number;
  /** Identifica un vuelo entre dimensiones (los pasajeros de un mismo vuelo llegan al mismo cohete). */
  flight: number;
  /** Plataforma de la que salió este vuelo (en la otra dimensión), para recordarla al llegar. */
  from: number;
  pad: Pad | null;
}

/** Destino de un cohete que despega en `dim` (-1 si no hay). */
export function rocketDestination(dim: number): number {
  return dim === DIM_OVERWORLD ? DIM_MOON : dim === DIM_MOON ? DIM_OVERWORLD : -1;
}

export class Rockets {
  private rockets = new Map<number, Rocket>();
  /** Vuelo → cohete que lo espera aquí (se crea con el primer pasajero que llega). */
  private arriving = new Map<number, Rocket>();
  /** Plataformas de otros mundos (por dimensión): la de la que salieron los vuelos que llegaron aquí. */
  private pads = new Map<number, Pad>();
  private nextFlight = 1;
  private dirty = false;

  constructor(private ctx: ServerContext, store: ServerStore) {
    // Sin esto la simulación de entidades trataría al cohete como una criatura.
    ctx.entities.custom.set(ENT_ROCKET, () => {});
    try {
      const raw = JSON.parse(store.getMeta('rockets') ?? '{}') as { parked?: unknown; pads?: unknown };
      const finite = (v: unknown, n: number): v is number[] => Array.isArray(v) && v.length >= n && v.slice(0, n).every((x) => Number.isFinite(x));
      if (Array.isArray(raw.parked)) for (const p of raw.parked) if (finite(p, 3)) this.spawn(p[0], p[1], p[2], Number(p[3]) || 0);
      if (raw.pads && typeof raw.pads === 'object') for (const [d, p] of Object.entries(raw.pads)) if (finite(p, 3)) this.pads.set(Number(d), [p[0], p[1], p[2]]);
    } catch {
      /* mundo sin cohetes guardados */
    }
  }

  // ------------------------------------------------------------------ consultas

  /** ¿Va este jugador sentado en un cohete? (su posición la lleva el cohete, no su cliente). */
  isSeated(playerId: string): boolean {
    return !!this.rocketOf(playerId);
  }

  private rocketOf(playerId: string): Rocket | undefined {
    for (const r of this.rockets.values()) if (r.seats.includes(playerId)) return r;
    return undefined;
  }

  private find(id: string): Session | undefined {
    for (const s of this.ctx.sessions()) if (s.joined && s.id === id) return s;
    return undefined;
  }

  /** Altura del suelo (y de los pies) en una columna de esta dimensión, según el generador. */
  private groundFeetY(x: number, z: number): number {
    const gen = this.ctx.world.gen;
    return gen.surfaceAt(Math.floor(x), Math.floor(z), gen.columnInfo(Math.floor(x), Math.floor(z))) + 1;
  }

  // ------------------------------------------------------------------ creación

  /** Pone un cohete posado con la base en (x, y, z). */
  spawn(x: number, y: number, z: number, yaw = 0): Rocket {
    const e = this.ctx.entities.spawnBare(ENT_ROCKET, x, y, z, ROCKET_WIDTH, ROCKET_HEIGHT);
    e.yaw = e.bodyYaw = yaw;
    const r: Rocket = {
      e, phase: RK_PHASE.IDLE, t: 0, seats: new Array(ROCKET_SEATS).fill(null), restY: y, dest: rocketDestination(this.ctx.dim),
      flight: 0, from: this.ctx.dim, pad: null,
    };
    this.rockets.set(e.id, r);
    this.publish(r);
    this.dirty = true;
    return r;
  }

  /** Estado de la entidad para los clientes (fase y motores) y mensaje 'rocket' a todos. */
  private publish(r: Rocket): void {
    r.e.flags = (r.phase << RF_PHASE_SHIFT) | (r.phase === RK_PHASE.ASCENT || r.phase === RK_PHASE.DESCENT || (r.phase === RK_PHASE.COUNTDOWN && r.t >= COUNTDOWN_S - IGNITION_AT) ? RF_BURN : 0);
    this.ctx.broadcast(this.msg(r));
  }

  private msg(r: Rocket, gone = false): ServerMsg {
    return { t: 'rocket', e: r.e.id, ph: r.phase, pt: r2(r.t), seats: [...r.seats], d: r.dest, ...(gone ? { k: 1 as const } : {}) };
  }

  /** Un jugador entra: cómo están los cohetes. */
  onJoin(s: Session): void {
    for (const r of this.rockets.values()) this.ctx.send(s, this.msg(r));
  }

  onLeave(s: Session): void {
    const r = this.rocketOf(s.id);
    if (!r) return;
    r.seats[r.seats.indexOf(s.id)] = null;
    // Quien se va (o viaja) no queda guardado en el aire (a la altura de la cabina, o a 60 km en pleno vuelo): vuelve al suelo, a los
    // pies del cohete.
    s.p = [r.e.x + 3, r.restY, r.e.z];
    if (s.save) s.save = { ...s.save, pos: [s.p[0], s.p[1], s.p[2]] };
    this.publish(r);
  }

  // ------------------------------------------------------------------ órdenes de los jugadores

  onBoard(s: Session, msg: Extract<ClientMsg, { t: 'rboard' }>): void {
    const r = this.rockets.get(Number(msg.e));
    if (!r || r.phase !== RK_PHASE.IDLE || this.isSeated(s.id) || s.s & STATE_DEAD) return;
    if (!this.ctx.local && Math.hypot(r.e.x - s.p[0], r.e.z - s.p[2]) > BOARD_REACH) return;
    const seat = r.seats.indexOf(null);
    if (seat < 0) return this.ctx.tell(s, 'El cohete va lleno.');
    r.seats[seat] = s.id;
    s.p = rocketSeatPos(r.e.x, r.e.y, r.e.z, r.e.yaw, seat);
    this.publish(r);
  }

  onLeaveSeat(s: Session): void {
    const r = this.rocketOf(s.id);
    if (!r) return;
    if (r.phase !== RK_PHASE.IDLE) return this.ctx.tell(s, 'No se puede bajar en pleno vuelo.');
    r.seats[r.seats.indexOf(s.id)] = null;
    // A los pies del cohete (dos bloques a su lado, en el suelo).
    const at: [number, number, number] = [r.e.x + 3, this.groundFeetY(r.e.x + 3, r.e.z), r.e.z];
    s.p = at;
    this.ctx.send(s, { t: 'moveTo', p: [r2(at[0]), r2(at[1]), r2(at[2])] });
    this.publish(r);
  }

  onLaunch(s: Session): void {
    const r = this.rocketOf(s.id);
    if (!r || r.phase !== RK_PHASE.IDLE) return;
    if (r.dest < 0) return this.ctx.tell(s, 'Este cohete no tiene adónde ir desde aquí.');
    r.phase = RK_PHASE.COUNTDOWN;
    r.t = 0;
    r.flight = this.nextFlight++ + Math.floor(this.ctx.now() % 1_000_000) * 1000;
    r.restY = r.e.y;
    this.publish(r);
  }

  onAbort(s: Session): void {
    const r = this.rocketOf(s.id);
    if (!r || r.phase !== RK_PHASE.COUNTDOWN || r.t >= COUNTDOWN_S - IGNITION_AT) return;
    r.phase = RK_PHASE.IDLE;
    r.t = 0;
    this.publish(r);
  }

  // ------------------------------------------------------------------ vuelo

  tick(): void {
    for (const r of [...this.rockets.values()]) {
      if (r.e.dead || !this.ctx.entities.list.has(r.e.id)) {
        this.drop(r);
        continue;
      }
      this.step(r);
      if (!this.rockets.has(r.e.id)) continue; // acabó el tránsito: ya no está
      // Quien se desconectó o murió deja su plaza; los demás van donde está el cohete (tras moverlo, para no ir un tick atrás).
      for (let i = 0; i < r.seats.length; i++) {
        const id = r.seats[i];
        if (id === null) continue;
        const s = this.find(id);
        if (!s || s.s & STATE_DEAD) r.seats[i] = null;
        else s.p = rocketSeatPos(r.e.x, r.e.y, r.e.z, r.e.yaw, i);
      }
    }
  }

  private step(r: Rocket): void {
    const e = r.e;
    switch (r.phase) {
      case RK_PHASE.IDLE:
        return;
      case RK_PHASE.COUNTDOWN: {
        const before = r.t;
        r.t += DT;
        // Los motores se encienden a T-3: se avisa una vez.
        if (before < COUNTDOWN_S - IGNITION_AT && r.t >= COUNTDOWN_S - IGNITION_AT) this.publish(r);
        if (r.t >= COUNTDOWN_S) {
          r.phase = RK_PHASE.ASCENT;
          r.t = 0;
          this.publish(r);
        }
        return;
      }
      case RK_PHASE.ASCENT:
        r.t += DT;
        e.y = r.restY + ascentHeight(r.t);
        if (r.t >= ASCENT_S) this.transfer(r);
        return;
      case RK_PHASE.COAST: {
        // Tránsito (ya en el destino): el cohete espera en lo alto. Acaba cuando pasa su tiempo y todos los pasajeros tienen montada
        // esta dimensión (su cliente carga el terreno de abajo); si alguno tarda demasiado, se baja igual.
        r.t += DT;
        const ready = r.seats.every((id) => {
          if (id === null) return true;
          const s = this.find(id);
          return !s || !s.dimPending;
        });
        if ((r.t >= COAST_S && ready) || r.t > COAST_S + 25) {
          r.phase = RK_PHASE.DESCENT;
          r.t = 0;
          this.publish(r);
        }
        return;
      }
      case RK_PHASE.DESCENT: {
        r.t += DT;
        const decel = this.ctx.dim === DIM_MOON ? DESCENT_DECEL.moon : DESCENT_DECEL.earth;
        const h = descentStep(e.y - r.restY, DT, decel);
        e.y = r.restY + h;
        if (h <= 0) {
          r.phase = RK_PHASE.IDLE;
          r.t = 0;
          r.flight = 0;
          this.publish(r);
          this.dirty = true;
        }
        return;
      }
    }
  }

  /** Fin del ascenso: los pasajeros viajan a la otra dimensión y el cohete de aquí desaparece (allí se crea otro, en tránsito). */
  private transfer(r: Rocket): void {
    const pad: Pad = r.pad ?? [r.e.x, r.restY, r.e.z];
    const landAt = this.pads.get(r.dest) ?? null; // si ya vinimos de allí, la plataforma de esa dimensión
    r.seats.forEach((id, seat) => {
      const s = id === null ? undefined : this.find(id);
      if (s) this.ctx.travel(s, r.dest, { kind: 'rocket', flight: r.flight, seat, from: this.ctx.dim, pad, landAt });
    });
    this.drop(r);
  }

  private drop(r: Rocket): void {
    this.rockets.delete(r.e.id);
    if (r.flight) this.arriving.delete(r.flight);
    this.ctx.broadcast(this.msg(r, true));
    this.ctx.entities.remove(r.e.id);
    this.dirty = true;
  }

  // ------------------------------------------------------------------ llegada

  /** Sitio (x, z) donde aterriza lo que llega sin una plataforma concreta. */
  private defaultLanding(): [number, number] {
    const sp = this.ctx.world.gen.findSpawn();
    return [Math.floor(sp.x) + 0.5, Math.floor(sp.z) + 0.5];
  }

  /**
   * Un jugador llega en un cohete: se le busca (o se crea) el cohete de su vuelo, quieto en lo alto y en tránsito, y se le
   * sienta. Devuelve dónde aparece.
   */
  arrive(s: Session, a: Extract<Arrival, { kind: 'rocket' }>): [number, number, number] {
    let r = this.arriving.get(a.flight);
    if (!r) {
      const [x, z] = a.landAt ? [a.landAt[0], a.landAt[2]] : this.defaultLanding();
      const landY = a.landAt ? a.landAt[1] : this.groundFeetY(x, z);
      r = this.spawn(x, landY + DESCENT_START, z, 0);
      r.restY = landY;
      r.phase = RK_PHASE.COAST;
      r.flight = a.flight;
      r.from = a.from;
      r.pad = a.pad;
      // Se recuerda de dónde vino, para volver.
      this.pads.set(a.from, a.pad);
      this.arriving.set(a.flight, r);
      this.publish(r);
    }
    let seat = a.seat;
    if (seat < 0 || seat >= r.seats.length || r.seats[seat] !== null) seat = r.seats.indexOf(null);
    if (seat >= 0) r.seats[seat] = s.id;
    this.publish(r);
    return rocketSeatPos(r.e.x, r.e.y, r.e.z, r.e.yaw, Math.max(0, seat));
  }

  // ------------------------------------------------------------------ guardado

  flush(store: ServerStore): void {
    if (!this.dirty) return;
    this.dirty = false;
    const parked = [...this.rockets.values()].filter((r) => r.phase === RK_PHASE.IDLE).map((r) => [r2(r.e.x), r2(r.e.y), r2(r.e.z), r2(r.e.yaw)]);
    store.setMeta('rockets', JSON.stringify({ parked, pads: Object.fromEntries(this.pads) }));
  }
}
