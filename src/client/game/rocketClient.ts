// Programa lunar (idea-luna.md): el cohete Selene en el cliente.
//
// El servidor lo lleva todo (sube, viaja, baja); este cliente:
// - sube a quien hace clic derecho en el cohete ('rboard') y, sentado, no se mueve por su cuenta: su posición sale de la
//   plaza del cohete cada frame (a la vez que el servidor la fija allí);
// - dibuja la cabina (marco de la ventana), la cuenta atrás, la telemetría y el fundido a negro del tránsito;
// - pinta las llamas y el humo de todos los cohetes que se ven, y hace sonar el rugido y temblar la cámara;
// - teclas: Espacio despega (en tierra, sentado), Mayús baja del cohete o aborta la cuenta atrás antes de la ignición.
import {
  ENT_ROCKET, RK_PHASE, RF_BURN, rocketPhaseOf, rocketSeatPos, COUNTDOWN_S, IGNITION_AT, DESCENT_START, ASCENT_S, ROCKET_SEATS,
} from '../../shared/rocket';
import { RIDER_HIP } from '../../shared/mounts';
import { dimensionDef } from '../../shared/dimensions';
import type { ServerMsg } from '../../shared/protocol';
import type { MoveControls } from './Player';
import type { ClientEntity } from './ClientEntities';
import type { RemotePlayerView } from '../render/EntityRenderer';
import type { Game } from './Game';
import '../ui/rocket.css';

interface View {
  ph: number;
  /** Segundos que llevaba en la fase al llegar el mensaje y cuándo llegó (ms). */
  pt: number;
  at: number;
  seats: (string | null)[];
  dest: number;
  /** y de la base en tierra (de donde sale o donde aterriza), para la altitud. */
  baseY: number | null;
  /** Ya se ha visto moverse (en el descenso, hasta entonces sigue la pantalla en negro). */
  moved: boolean;
  firstY: number;
}

/** Bocas de las toberas (x, z respecto al centro): la central y las cuatro de alrededor. */
const NOZZLES: readonly (readonly [number, number, number])[] = [[0, 0, 1], [-1.05, -1.05, 0.55], [1.05, -1.05, 0.55], [-1.05, 1.05, 0.55], [1.05, 1.05, 0.55]];

export class RocketClient {
  /** Cohete en el que va este jugador (-1: en ninguno) y su plaza. */
  entityId = -1;
  seat = 0;
  private views = new Map<number, View>();
  private hud: HTMLDivElement | null = null;
  private els: { count: HTMLDivElement; status: HTMLDivElement; alt: HTMLElement; spd: HTMLElement; t: HTMLElement; hint: HTMLDivElement; fade: HTMLDivElement } | null = null;
  private lastCount = -1;
  private lastY = NaN;
  private speed = 0;
  private speedT = 0;
  private blastT = 0;
  private asked = 0;

  constructor(private g: Game) {}

  get active(): boolean {
    return this.entityId > 0;
  }

  /** Al cambiar de dimensión: lo que sabía del mundo anterior ya no vale (el servidor reenvía el estado al entrar). */
  reset(): void {
    this.views.clear();
    this.entityId = -1;
    this.lastY = NaN;
    this.speed = 0;
    this.speedT = 0;
    this.showHud(false);
  }

  // ------------------------------------------------------------------ red

  onMessage(msg: ServerMsg): boolean {
    if (msg.t !== 'rocket') return false;
    if (msg.k) {
      this.views.delete(msg.e);
      if (this.entityId === msg.e) this.entityId = -1;
      return true;
    }
    const prev = this.views.get(msg.e);
    const e = this.g.ents.list.get(msg.e);
    const v: View = {
      ph: msg.ph, pt: msg.pt, at: performance.now(), seats: msg.seats, dest: msg.d,
      baseY: prev?.baseY ?? (e && msg.ph !== RK_PHASE.DESCENT ? e.y : null), moved: prev?.moved ?? msg.ph !== RK_PHASE.DESCENT, firstY: prev?.firstY ?? NaN,
    };
    this.views.set(msg.e, v);
    const me = this.g.net?.id;
    const seat = me ? msg.seats.indexOf(me) : -1;
    if (seat >= 0) {
      if (this.entityId !== msg.e) this.lastY = NaN;
      this.entityId = msg.e;
      this.seat = seat;
      this.asked = 0;
    } else if (this.entityId === msg.e) {
      this.entityId = -1;
      this.showHud(false);
    }
    return true;
  }

  /** Clic derecho sobre un cohete: subirse. */
  onUse(target: ClientEntity): boolean {
    if (target.type !== ENT_ROCKET || target.gone) return false;
    const g = this.g;
    if (this.active || g.riding.active || g.vehicles.active || g.player.sneaking) return true;
    if (performance.now() - this.asked < 600) return true;
    this.asked = performance.now();
    g.net?.send({ t: 'rboard', e: target.id });
    g.swing(false);
    return true;
  }

  // ------------------------------------------------------------------ cada frame

  private phaseTime(v: View): number {
    return v.pt + (performance.now() - v.at) / 1000;
  }

  /** Movimiento del jugador: sentado, sólo cuenta lo que pulsa para despegar, bajar o abortar. */
  update(dt: number, c: MoveControls, active: boolean): boolean {
    void c;
    if (!this.active) return false;
    const g = this.g, p = g.player;
    const v = this.views.get(this.entityId);
    if (g.survival.dead) {
      this.showHud(false);
      return false;
    }
    p.vx = p.vy = p.vz = 0;
    p.kx = p.kz = 0;
    p.fallDistance = 0;
    p.justLanded = false;
    p.landedFall = 0;
    p.walkAmount = 0;
    p.sprinting = false;
    p.sneaking = false;
    p.flying = false;
    if (active && v) {
      const keys = g.cfg.settings.keys;
      if (v.ph === RK_PHASE.IDLE && g.input.wasPressed(keys.jump)) g.net?.send({ t: 'rlaunch' });
      else if (g.input.wasPressed(keys.sneak)) {
        if (v.ph === RK_PHASE.IDLE) g.net?.send({ t: 'rleave' });
        else if (v.ph === RK_PHASE.COUNTDOWN && this.phaseTime(v) < COUNTDOWN_S - IGNITION_AT) g.net?.send({ t: 'rabort' });
      }
    }
    this.seatPlayer();
    return true;
  }

  /** Sienta al jugador en su plaza (la cadera en el asiento). */
  private seatPlayer(): void {
    const e = this.g.ents.list.get(this.entityId);
    if (!e) return;
    const p = this.g.player;
    const [sx, sy, sz] = rocketSeatPos(e.x, e.y, e.z, e.yaw, this.seat);
    p.x = sx;
    p.y = sy - RIDER_HIP;
    p.z = sz;
  }

  /** Después de actualizar las entidades: seguir al cohete, llamas, humo, sonido, cámara y cabina. */
  afterEntities(dt: number): void {
    const g = this.g;
    let power = 0;
    for (const e of g.ents.list.values()) {
      if (e.type !== ENT_ROCKET || e.gone) continue;
      const v = this.views.get(e.id);
      if (v && v.baseY === null && v.ph !== RK_PHASE.DESCENT) v.baseY = e.y;
      if (v && Number.isNaN(v.firstY)) v.firstY = e.y;
      if (v && !v.moved && Math.abs(e.y - v.firstY) > 1.5) v.moved = true;
      const d = Math.hypot(e.x - g.player.x, e.y - g.player.y, e.z - g.player.z);
      const ph = rocketPhaseOf(e.flags);
      const burning = (e.flags & RF_BURN) !== 0;
      if (burning) {
        const pw = this.powerOf(e, ph, v);
        power = Math.max(power, d < 200 ? pw * (1 - d / 200) : 0);
        this.plume(e, ph, pw, dt, v);
      }
    }
    if (this.active) this.seatPlayer();
    // Sonido: dentro se oye entero; fuera, según la distancia al cohete más cercano que enciende sus motores.
    const inside = this.active;
    const ownPower = inside ? this.ownPower() : 0;
    const vol = inside ? ownPower * 0.85 : Math.min(1, power) * 0.9;
    g.audio.setRocketEngine(vol, inside ? ownPower : Math.min(1, power));
    // Cámara: dentro tiembla con los motores.
    if (inside && ownPower > 0) g.shake = Math.max(g.shake, ownPower * 0.16);
    this.updateHud(dt);
  }

  private ownPower(): number {
    const e = this.g.ents.list.get(this.entityId), v = this.views.get(this.entityId);
    if (!e || !(e.flags & RF_BURN)) return 0;
    return this.powerOf(e, rocketPhaseOf(e.flags), v);
  }

  /** Potencia (0..1) de los motores según la fase: crece en los últimos segundos de la cuenta atrás y sostiene en el vuelo. */
  private powerOf(e: ClientEntity, ph: number, v: View | undefined): number {
    if (ph === RK_PHASE.COUNTDOWN && v) return 0.25 + 0.55 * Math.min(1, (this.phaseTime(v) - (COUNTDOWN_S - IGNITION_AT)) / IGNITION_AT);
    if (ph === RK_PHASE.ASCENT) return 1;
    if (ph === RK_PHASE.DESCENT) return 0.65;
    return 0.3 + 0 * e.id;
  }

  /** Llamas de las cinco toberas y el humo/polvo del suelo mientras está cerca. */
  private plume(e: ClientEntity, ph: number, power: number, dt: number, v: View | undefined): void {
    const fx = this.g.renderer.entities.pfx;
    const k = Math.min(3, dt * 60); // partículas por frame a 60 fps; con menos fps, proporcional
    for (const [ox, oz, s] of NOZZLES) {
      const n = Math.max(1, Math.round((s === 1 ? 5 : 2) * k * (0.4 + 0.6 * power)));
      fx.rocketPlume(e.x + ox, e.y + 0.3, e.z + oz, power * s, n, 18 + 22 * power);
    }
    // Polvo del suelo: cerca de la plataforma (subiendo o bajando).
    const base = v?.baseY ?? e.y;
    const alt = e.y - base;
    if (alt < 60 && (ph === RK_PHASE.ASCENT || ph === RK_PHASE.COUNTDOWN || ph === RK_PHASE.DESCENT)) {
      this.blastT += dt;
      if (this.blastT > 0.08) {
        this.blastT = 0;
        fx.rocketBlast(e.x, base, e.z, Math.max(0.35, power) * (1 - alt / 80));
      }
    }
  }

  /** Otro jugador sentado en un cohete: en su plaza. */
  placeRemote(id: string, view: RemotePlayerView): boolean {
    for (const [eid, v] of this.views) {
      const seat = v.seats.indexOf(id);
      if (seat < 0) continue;
      const e = this.g.ents.list.get(eid);
      if (!e) return false;
      const [sx, sy, sz] = rocketSeatPos(e.x, e.y, e.z, e.yaw, seat);
      view.x = sx;
      view.y = sy - RIDER_HIP;
      view.z = sz;
      view.bodyYaw = e.yaw;
      view.walkAmount = 0;
      view.riding = true;
      return true;
    }
    return false;
  }

  // ------------------------------------------------------------------ cabina

  private showHud(on: boolean): void {
    if (!this.hud) {
      if (!on) return;
      this.buildHud();
    }
    this.hud!.classList.toggle('on', on);
    if (!on) this.els?.fade.classList.remove('on');
  }

  private buildHud(): void {
    const hud = document.createElement('div');
    hud.id = 'rk-hud';
    hud.innerHTML =
      '<div class="rk-frame"></div><div class="rk-status"></div><div class="rk-count"></div>' +
      '<div class="rk-panel"><div><b>ALTITUD</b><span class="rk-alt">0 m</span></div><div><b>VELOCIDAD</b><span class="rk-spd">0 m/s</span></div><div><b>T</b><span class="rk-t">—</span></div></div>' +
      '<div class="rk-hint"></div><div class="rk-fade"></div>';
    document.body.appendChild(hud);
    this.hud = hud;
    const q = <T extends HTMLElement>(s: string) => hud.querySelector(s) as T;
    this.els = { count: q('.rk-count'), status: q('.rk-status'), alt: q('.rk-alt'), spd: q('.rk-spd'), t: q('.rk-t'), hint: q('.rk-hint'), fade: q('.rk-fade') };
  }

  private updateHud(dt: number): void {
    const g = this.g;
    const v = this.views.get(this.entityId);
    const e = g.ents.list.get(this.entityId);
    if (!this.active || !v || !e || g.survival.dead) {
      this.showHud(false);
      return;
    }
    this.showHud(true);
    const els = this.els!;
    const t = this.phaseTime(v);
    // Velocidad vertical: media en ventanas de 0,25 s (por frame sale a saltos, porque las posiciones llegan a 20 por segundo).
    this.speedT += dt;
    if (Number.isNaN(this.lastY)) this.lastY = e.y;
    if (this.speedT >= 0.25) {
      this.speed = (e.y - this.lastY) / this.speedT;
      this.lastY = e.y;
      this.speedT = 0;
    }
    const base = v.baseY ?? e.y;
    const alt = v.ph === RK_PHASE.DESCENT ? Math.max(0, e.y - (v.firstY - DESCENT_START)) : Math.max(0, e.y - base);
    els.alt.textContent = alt >= 10_000 ? `${(alt / 1000).toFixed(1)} km` : `${Math.round(alt)} m`;
    const sp = Math.abs(this.speed);
    els.spd.textContent = sp >= 1000 ? `${(sp / 1000).toFixed(2)} km/s` : `${Math.round(sp)} m/s`;
    const dest = dimensionDef(v.dest).name;
    const here = dimensionDef(g.world!.dim).name;
    let status = '', hint = '', count = '', fade = false, tl = '—';
    switch (v.ph) {
      case RK_PHASE.IDLE: {
        const n = v.seats.filter((s) => s !== null).length;
        status = `Cohete Selene · ${n}/${ROCKET_SEATS} a bordo`;
        hint = `<kbd>ESPACIO</kbd>Despegar hacia ${dest}<br><kbd>MAYÚS</kbd>Bajar del cohete`;
        break;
      }
      case RK_PHASE.COUNTDOWN: {
        const left = COUNTDOWN_S - t;
        status = left > IGNITION_AT ? 'Cuenta atrás' : 'Ignición';
        count = left > 0 ? String(Math.ceil(left)) : '0';
        tl = `T-${Math.max(0, left).toFixed(1)}`;
        hint = left > IGNITION_AT ? '<kbd>MAYÚS</kbd>Abortar' : '';
        break;
      }
      case RK_PHASE.ASCENT:
        status = 'Ascenso';
        tl = `T+${t.toFixed(0)} s`;
        if (t < 2) count = '¡DESPEGUE!';
        break;
      case RK_PHASE.COAST:
        status = '';
        fade = true;
        tl = `T+${(ASCENT_S + t).toFixed(0)} s`;
        break;
      case RK_PHASE.DESCENT:
        status = v.moved ? `Descenso: ${here}` : `Llegando: ${here}`;
        fade = !v.moved;
        tl = v.moved ? `${Math.round(alt)} m` : '—';
        break;
    }
    els.status.textContent = status;
    els.hint.innerHTML = hint;
    els.t.textContent = tl;
    els.fade.innerHTML = fade ? (v.ph === RK_PHASE.COAST ? `Rumbo a ${dest}<small>Tránsito</small>` : '') : '';
    els.fade.classList.toggle('on', fade);
    // Cuenta atrás: un pulso por segundo.
    const shown = count;
    if (shown !== els.count.textContent || (v.ph === RK_PHASE.COUNTDOWN && Math.ceil(COUNTDOWN_S - t) !== this.lastCount)) {
      els.count.textContent = shown;
      els.count.classList.remove('pulse');
      void els.count.offsetWidth;
      els.count.classList.toggle('pulse', shown !== '');
      els.count.classList.toggle('go', v.ph === RK_PHASE.COUNTDOWN && COUNTDOWN_S - t <= IGNITION_AT);
      this.lastCount = Math.ceil(COUNTDOWN_S - t);
    }
    if (v.ph === RK_PHASE.ASCENT && t >= 2) els.count.textContent = '';
    if (v.ph === RK_PHASE.IDLE || v.ph === RK_PHASE.DESCENT) els.count.textContent = '';
  }

  dispose(): void {
    this.hud?.remove();
    this.hud = null;
    this.els = null;
  }
}
