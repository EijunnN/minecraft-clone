// Programa lunar (shared/meteors.ts, «La caída del Ancla»): las lluvias de meteoritos del Errante en el servidor.
//
// Hay uno en cada dimensión, pero las lluvias sólo caen en el mundo normal (el que guarda el estado). Los demás sólo llevan la radio: al
// morir el Dragón en el End, la radio de la Estación Selene suena allí (donde está quien lo mató) y el mundo normal se despierta.
//
// Fases: en calma (cuenta los segundos jugados hasta la siguiente) → aviso (cuenta atrás) → impactos (los meteoritos de la lluvia, cada
// uno anunciado FLIGHT_S antes de caer, para que los clientes lo vean venir) → en calma. El mundo normal sólo avanza con alguien dentro,
// así que todo cuenta tiempo jugado.
import {
  MT_PHASE, SHOWER_EVERY_S, WARN_FIRST_S, WARN_S, FLIGHT_S, RADIO_AWAKEN, radioWarning, showerPlan, meteorStart, readMeteorSave,
  type MeteorPhase, type MeteorPlan, type MeteorSave,
} from '../../meteors';
import { DIM_OVERWORLD } from '../../dimensions';
import { AIR, BLOCK_SOLID, BLOCK_FLUID, FIRE, MAGMA_BLOCK, METEORITE, METEOR_CORE } from '../../blocks';
import { CHUNK_SIZE, MIN_Y, MAX_Y } from '../../constants';
import { STATE_DEAD, type ServerMsg } from '../../protocol';
import type { ServerStore } from '../store';
import { DT, type ServerContext, type Session } from './context';

interface Flying {
  /** Segundos de la lluvia en los que cae. */
  at: number;
  x: number;
  y: number;
  z: number;
  power: number;
  core: boolean;
}

export class Meteors {
  private save: MeteorSave;
  private phase: MeteorPhase = MT_PHASE.CALM;
  /** Segundos que quedan del aviso. */
  private left = 0;
  /** Segundos desde el principio de los impactos, lo que queda por lanzar y lo que está en el aire. */
  private t = 0;
  private plan: MeteorPlan[] = [];
  private flying: Flying[] = [];
  /** Radio pendiente: segundos que faltan y el texto. */
  private radio: { in: number; m: string }[] = [];
  private statusT = 0;
  private dirty = false;

  constructor(private ctx: ServerContext, store: ServerStore) {
    this.save = readMeteorSave(store.getMeta('meteors'));
    const raw = store.getMeta('meteorsPhase');
    // Si se guardó en mitad de un aviso, se sigue con lo que quedaba; en mitad de los impactos, se repite la lluvia con un aviso corto.
    if (this.active && raw) {
      const [ph, left] = raw.split(':').map(Number);
      if (ph === MT_PHASE.WARNING && Number.isFinite(left)) this.warn(Math.max(10, left), false);
      else if (ph === MT_PHASE.IMPACTS) this.warn(30, false);
    }
  }

  /** ¿Caen lluvias en este servidor? (el mundo normal, despierto y sin apagar). */
  private get active(): boolean {
    return this.ctx.dim === DIM_OVERWORLD && this.save.awake && !this.save.off;
  }

  /** Lo que saben los clientes: la fase, lo que queda de ella, cuántas han caído y si el Ancla cayó. */
  private status(): Extract<ServerMsg, { t: 'meteors' }> {
    const left = this.phase === MT_PHASE.WARNING ? this.left : this.phase === MT_PHASE.IMPACTS ? 0 : Math.max(0, SHOWER_EVERY_S - this.save.clock);
    return { t: 'meteors', ph: this.save.off ? MT_PHASE.CALM : this.phase, left: Math.round(left * 10) / 10, n: this.save.n, awake: this.save.awake ? 1 : 0 };
  }

  onJoin(s: Session): void {
    if (this.ctx.dim === DIM_OVERWORLD) {
      if (this.save.awake) this.ctx.send(s, this.status());
      return;
    }
    // En las otras dimensiones sólo cuenta el Errante del cielo (crece con cada lluvia).
    const info = this.ctx.meteorInfo();
    if (info.awake) this.ctx.send(s, { t: 'meteors', ph: MT_PHASE.CALM, left: 0, n: info.n, awake: 1 });
  }

  /** Lluvias caídas y si el Ancla cayó (para el cielo de las otras dimensiones: el Errante crece con cada una). */
  info(): { awake: boolean; n: number } {
    return { awake: this.save.awake, n: this.save.n };
  }

  // ------------------------------------------------------------------ el Ancla cae

  /** Murió el Dragón (en el mundo normal: lo llama el anfitrión). La Primera Lluvia, en cuanto haya alguien aquí. */
  awaken(): void {
    if (this.ctx.dim !== DIM_OVERWORLD || this.save.awake) return;
    this.save = { ...this.save, awake: true, n: 0, clock: 0, core: false };
    this.dirty = true;
    if (!this.save.off) this.warn(WARN_FIRST_S, false);
  }

  /** La radio de la Estación Selene al caer el Ancla (en la dimensión donde murió el Dragón). */
  anchorFell(): void {
    for (const [at, m] of RADIO_AWAKEN) this.radio.push({ in: at, m });
  }

  // ------------------------------------------------------------------ comandos (/meteoritos)

  /** Lo que hace el comando; devuelve el texto de respuesta. */
  command(arg: string): string {
    if (this.ctx.dim !== DIM_OVERWORLD) return 'Las lluvias de meteoritos caen en el mundo normal.';
    switch (arg) {
      case 'despertar':
        if (this.save.awake) return 'El Ancla ya cayó.';
        this.awaken();
        this.anchorFell();
        return 'El Ancla cayó: la Primera Lluvia empieza en 2 minutos.';
      case 'ya':
        if (!this.save.awake) this.save = { ...this.save, awake: true };
        this.save.off = false;
        this.dirty = true;
        this.warn(10, true);
        return 'Lluvia de meteoritos en 10 segundos.';
      case 'off':
        this.save.off = true;
        this.dirty = true;
        this.phase = MT_PHASE.CALM;
        this.plan = [];
        this.flying = [];
        this.ctx.broadcast(this.status());
        return 'Lluvias de meteoritos apagadas en este mundo.';
      case 'on':
        this.save.off = false;
        this.dirty = true;
        this.ctx.broadcast(this.status());
        return 'Lluvias de meteoritos encendidas.';
      default: {
        if (!this.save.awake) return 'El Ancla sigue en pie (el Dragón vive): no hay lluvias. Uso: /meteoritos [ya|despertar|off|on].';
        const st = this.status();
        const when = this.phase === MT_PHASE.WARNING ? `impactos en ${Math.ceil(this.left)} s`
          : this.phase === MT_PHASE.IMPACTS ? 'cayendo ahora' : `siguiente en ${Math.ceil(st.left / 60)} min de juego`;
        return `Lluvias caídas: ${this.save.n}; ${this.save.off ? 'apagadas' : when}. Uso: /meteoritos [ya|despertar|off|on].`;
      }
    }
  }

  // ------------------------------------------------------------------ cada tick

  tick(): void {
    // La radio (en cualquier dimensión).
    for (let i = this.radio.length - 1; i >= 0; i--) {
      const r = this.radio[i];
      r.in -= DT;
      if (r.in <= 0) {
        this.ctx.broadcastAll({ t: 'radio', m: r.m });
        this.radio.splice(i, 1);
      }
    }
    if (!this.active || !this.anyone()) return;
    switch (this.phase) {
      case MT_PHASE.CALM: {
        const before = this.save.clock;
        this.save.clock += DT;
        if (Math.floor(before / 30) !== Math.floor(this.save.clock / 30)) this.dirty = true; // se guarda cada 30 s jugados
        if (this.save.clock >= SHOWER_EVERY_S) this.warn(WARN_S, true);
        return;
      }
      case MT_PHASE.WARNING:
        this.left -= DT;
        this.statusT += DT;
        if (this.statusT >= 5) {
          this.statusT = 0;
          this.ctx.broadcast(this.status());
        }
        if (this.left <= 0) this.startImpacts();
        return;
      case MT_PHASE.IMPACTS:
        this.impacts();
        return;
    }
  }

  private anyone(): boolean {
    for (const s of this.ctx.sessions()) if (s.joined && !(s.s & STATE_DEAD)) return true;
    return false;
  }

  /** Empieza un aviso de `seconds` (con la radio, desde la segunda lluvia). */
  private warn(seconds: number, radio: boolean): void {
    this.phase = MT_PHASE.WARNING;
    this.left = seconds;
    this.statusT = 0;
    this.dirty = true;
    this.ctx.broadcast(this.status());
    if (radio && this.save.n > 0) this.ctx.broadcast({ t: 'radio', m: radioWarning(this.save.n) });
  }

  private startImpacts(): void {
    this.phase = MT_PHASE.IMPACTS;
    this.t = -FLIGHT_S; // el primero se ve venir antes de caer
    this.plan = showerPlan(this.save.n, () => this.ctx.rand());
    // Sólo la Primera trae el Núcleo (y sólo una vez).
    if (this.save.core) this.plan = this.plan.filter((m) => !m.core);
    this.flying = [];
    this.dirty = true;
    this.ctx.broadcast(this.status());
  }

  private impacts(): void {
    this.t += DT;
    // Se lanzan los que caen dentro de FLIGHT_S.
    while (this.plan.length && this.plan[0].at - FLIGHT_S <= this.t) this.launch(this.plan.shift()!);
    for (let i = this.flying.length - 1; i >= 0; i--) {
      const f = this.flying[i];
      if (f.at > this.t) continue;
      this.flying.splice(i, 1);
      this.impact(f);
    }
    if (!this.plan.length && !this.flying.length) {
      // Fin de la lluvia.
      this.phase = MT_PHASE.CALM;
      this.save.n++;
      this.save.clock = 0;
      this.dirty = true;
      this.ctx.broadcast(this.status());
    }
  }

  /** Elige dónde cae (cerca de un jugador al azar; el del Núcleo, delante de él) y lo anuncia. */
  private launch(m: MeteorPlan): void {
    const players = [...this.ctx.sessions()].filter((s) => s.joined && !(s.s & STATE_DEAD));
    if (!players.length) return;
    const rand = () => this.ctx.rand();
    const s = players[Math.floor(rand() * players.length)];
    // El del Núcleo cae delante de quien lo va a buscar (se ve bajar); los demás, alrededor. Delante es (−sin yaw, −cos yaw).
    const a = m.core ? Math.atan2(-Math.cos(s.r[0]), -Math.sin(s.r[0])) + (rand() - 0.5) * 0.6 : rand() * Math.PI * 2;
    const x = Math.floor(s.p[0] + Math.cos(a) * m.dist) + 0.5, z = Math.floor(s.p[2] + Math.sin(a) * m.dist) + 0.5;
    const y = this.groundAt(x, z, s.p[1]);
    if (y === null) return;
    const from = meteorStart([x, y, z], [rand() * 2 - 1, rand() * 2 - 1]);
    const at = Math.max(this.t + FLIGHT_S * 0.5, m.at);
    this.flying.push({ at, x, y, z, power: m.power, core: m.core });
    const r1 = (v: number) => Math.round(v * 10) / 10;
    this.ctx.broadcast({ t: 'meteor', s: [r1(from[0]), r1(from[1]), r1(from[2])], p: [r1(x), r1(y), r1(z)], k: r1(m.power), ...(m.core ? { c: 1 as const } : {}) });
  }

  /** Altura (y de los pies) del suelo en (x, z): lo más alto sólido o líquido por debajo de donde está el jugador más 80. */
  private groundAt(x: number, z: number, nearY: number): number | null {
    const w = this.ctx.world;
    w.ensureChunk(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE), this.ctx.now());
    const bx = Math.floor(x), bz = Math.floor(z);
    for (let y = Math.min(MAX_Y - 2, Math.floor(nearY) + 80); y > MIN_Y + 2; y--) {
      const id = w.getBlock(bx, y, bz);
      if (id > 0 && (BLOCK_SOLID[id] || BLOCK_FLUID[id])) return y + 1;
    }
    return null;
  }

  /** El impacto: la explosión y el cráter (fuego, magma y el meteorito en el fondo; el grande, con el Núcleo). */
  private impact(f: Flying): void {
    const ctx = this.ctx, w = ctx.world, rand = () => ctx.rand();
    ctx.entities.explosion?.(f.x, f.y + 0.2, f.z, f.power, false, true);
    const cx = Math.floor(f.x), cz = Math.floor(f.z);
    /** Lo más alto sólido de la columna tras la explosión (null si es agua o no hay nada cerca). */
    const top = (x: number, z: number): number | null => {
      for (let y = Math.floor(f.y) + 3; y > Math.floor(f.y) - Math.ceil(f.power) - 4; y--) {
        const id = w.getBlock(x, y, z);
        if (id > 0 && BLOCK_FLUID[id]) return null; // en el agua no queda fuego
        if (id > 0 && BLOCK_SOLID[id]) return y;
      }
      return null;
    };
    // Borde humeante: magma y fuego sueltos alrededor.
    const r = Math.max(1, Math.round(f.power * 0.7));
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (dx * dx + dz * dz > r * r) continue;
        const y = top(cx + dx, cz + dz);
        if (y === null) continue;
        const k = rand();
        if (k < 0.3) w.setBlock(cx + dx, y, cz + dz, MAGMA_BLOCK);
        else if (k < 0.55 && w.getBlock(cx + dx, y + 1, cz + dz) === AIR) w.setBlock(cx + dx, y + 1, cz + dz, FIRE);
      }
    }
    // El meteorito en el fondo (más grande cuanto más fuerte); el del Núcleo, con el Núcleo encima, en medio.
    const y0 = top(cx, cz);
    if (y0 !== null) {
      const rock = f.core || f.power >= 4.5 ? 1 : 0;
      for (let dx = -rock; dx <= rock; dx++) {
        for (let dz = -rock; dz <= rock; dz++) {
          if (Math.abs(dx) + Math.abs(dz) > rock) continue;
          w.setBlock(cx + dx, y0, cz + dz, METEORITE);
        }
      }
      if (f.core) {
        w.setBlock(cx, y0 + 1, cz, METEOR_CORE);
        if (w.getBlock(cx, y0 + 2, cz) === FIRE) w.setBlock(cx, y0 + 2, cz, AIR);
      }
    } else if (f.core) {
      // Cayó al agua: el Núcleo se queda flotando encima (no se puede perder).
      w.setBlock(cx, Math.floor(f.y), cz, METEOR_CORE);
    }
    if (f.core) {
      this.save.core = true;
      this.dirty = true;
      ctx.broadcast({ t: 'radio', m: '…ya lo tienen. En el centro del cráter: rómpanlo y lo van a encontrar…' });
    }
  }

  // ------------------------------------------------------------------ guardado

  flush(store: ServerStore): void {
    if (!this.dirty) return;
    this.dirty = false;
    store.setMeta('meteors', JSON.stringify(this.save));
    store.setMeta('meteorsPhase', this.save.off || this.phase === MT_PHASE.CALM ? '' : `${this.phase}:${Math.round(this.left)}`);
  }
}
