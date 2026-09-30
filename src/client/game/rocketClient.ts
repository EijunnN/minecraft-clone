// Programa lunar (idea-luna.md): el cohete Selene en el cliente.
//
// El servidor lo lleva todo (sube, espera en tránsito, baja); este cliente:
// - sube a quien hace clic derecho en el cohete ('rboard') y, sentado, no se mueve por su cuenta: su posición sale de la
//   plaza del cohete cada frame (a la vez que el servidor la fija allí);
// - lleva el viaje: al acabar el ascenso cambia de dimensión sin pantalla de carga (el terreno de destino se carga debajo mientras
//   se ve el espacio) y calcula dónde están la Tierra y la Luna en cada momento del tránsito (shared/voyage.ts);
// - le da al renderer los planetas (spaceFrame): la Tierra curva debajo en el ascenso, el espacio en el tránsito, la Luna o la
//   Tierra debajo en el descenso, y el cielo de la Luna con la Tierra a su tamaño real;
// - dibuja la cabina (marco de la ventana, cuenta atrás, telemetría de una misión real con su tiempo de misión, el plasma de la
//   reentrada), pinta las llamas y el humo de todos los cohetes que se ven, hace sonar los motores y tiembla la cámara;
// - teclas: Espacio despega (en tierra, sentado), Mayús baja del cohete o aborta la cuenta atrás antes de la ignición.
import {
  ENT_ROCKET, RK_PHASE, RF_BURN, rocketPhaseOf, rocketSeatPos, COUNTDOWN_S, IGNITION_AT, DESCENT_START, ASCENT_S, ROCKET_SEATS,
  ascentDownrange, ascentHeight, ascentTelemetry, descentDownrange, descentTelemetrySpeed, DESCENT_DECEL, COAST_S, ASCENT_MET,
} from '../../shared/rocket';
import {
  transitView, earthFromMoon, moonBelow, earthBelow, earthShiftAxes, moonForVoyage, EARTH_IN_MOON_SKY, EARTH_MOON, R_MOON, TRANSIT_HOLD,
  type TransitSetup, type TransitView, type BodyView,
} from '../../shared/voyage';
import { RIDER_HIP } from '../../shared/mounts';
import { dimensionDef, DIM_MOON, DIM_OVERWORLD } from '../../shared/dimensions';
import { MOON_BASE } from '../../shared/world/moon';
import type { ServerMsg } from '../../shared/protocol';
import type { MoveControls } from './Player';
import type { ClientEntity } from './ClientEntities';
import type { RemotePlayerView } from '../render/EntityRenderer';
import type { SpaceFrame } from '../render/Renderer';
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
  /** y a la que se vio por primera vez (llegando: la del tránsito, DESCENT_START sobre el suelo). */
  firstY: number;
}

/** El viaje en curso de este jugador (de un mundo a otro): sobrevive al cambio de dimensión. */
interface Voyage {
  toMoon: boolean;
  setup: TransitSetup;
  /** Sitio lunar (x, z): de donde sale (volviendo) o donde llega (yendo; se conoce al llegar). */
  moonSite: [number, number] | null;
  /** Cuándo empezó (ms), por si aún no ha llegado el estado del cohete nuevo. */
  started: number;
}

/** Bocas de las toberas (x, z respecto al centro): la central y las cuatro de alrededor. */
const NOZZLES: readonly (readonly [number, number, number])[] = [[0, 0, 1], [-1.05, -1.05, 0.55], [1.05, -1.05, 0.55], [-1.05, 1.05, 0.55], [1.05, 1.05, 0.55]];
const I3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
/** Velocidad de la órbita lunar baja (m/s): lo que corre el suelo en los segundos de órbita antes del descenso. */
const LOW_ORBIT_V = 1670;

const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Tiempo de misión como «T+ 2 d 14:05:33». */
function metText(s: number): string {
  s = Math.max(0, Math.floor(s));
  const d = Math.floor(s / 86_400), h = Math.floor((s % 86_400) / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  const hms = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}`;
  return d > 0 ? `T+ ${d} d ${hms}` : `T+ ${hms}`;
}

function distText(m: number): string {
  if (m >= 100_000_000) return `${Math.round(m / 1000).toLocaleString('es-ES')} km`;
  if (m >= 10_000) return `${(m / 1000).toLocaleString('es-ES', { maximumFractionDigits: m >= 1e6 ? 0 : 1 })} km`;
  return `${Math.round(m)} m`;
}

function speedText(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)} km/s` : `${Math.round(ms)} m/s`;
}

export class RocketClient {
  /** Cohete en el que va este jugador (-1: en ninguno) y su plaza. */
  entityId = -1;
  seat = 0;
  private views = new Map<number, View>();
  private voyage: Voyage | null = null;
  private hud: HTMLDivElement | null = null;
  private els: {
    count: HTMLDivElement; status: HTMLDivElement; alt: HTMLElement; altL: HTMLElement; spd: HTMLElement; t: HTMLElement; warp: HTMLElement;
    hint: HTMLDivElement; fade: HTMLDivElement; plasma: HTMLDivElement; note: HTMLDivElement;
  } | null = null;
  private lastCount = -1;
  private blastT = 0;
  private asked = 0;
  /** Última fase propia vista (para saber, al cambiar de dimensión, si se viene de un ascenso) y cuándo se posó. */
  private lastPhase = -1;
  private landedAt = 0;
  private landedWhere = '';
  private lastTransit: TransitView | null = null;

  constructor(private g: Game) {}

  /** ¿Va sentado en un cohete (o cambiando de mundo en uno)? Su posición la lleva el cohete. */
  get active(): boolean {
    return this.entityId > 0 || this.voyage !== null;
  }

  /** ¿Es un viaje en cohete este cambio de dimensión? (sin pantalla de carga: el terreno se carga mientras se ve el espacio). */
  get travelling(): boolean {
    return this.voyage !== null;
  }

  /**
   * Cambio de dimensión: lo que sabía del mundo anterior ya no vale (el servidor reenvía el estado al entrar). El viaje en curso
   * (si se acaba de salir de un ascenso) sigue: es lo que se ve mientras se carga el destino.
   */
  reset(): void {
    if (this.voyage && performance.now() - this.voyage.started > 15_000) this.voyage = null;
    this.views.clear();
    this.entityId = -1;
    this.lastPhase = -1;
    this.lastTransit = null;
    if (!this.voyage) this.showHud(false);
  }

  /**
   * Fin del ascenso: el servidor saca al pasajero del cohete que sube y lo manda a `toDim` (los mensajes pueden llegar en cualquier
   * orden). Empieza el tránsito: se recuerda de dónde sale y hacia dónde mira cada cuerpo en el cielo del otro.
   */
  private beginVoyage(toDim: number, e: ClientEntity | undefined): void {
    if (this.voyage && performance.now() - this.voyage.started < 15_000) return;
    const toMoon = toDim === DIM_MOON;
    const sun = this.g.renderer.sunDir;
    const moonInEarthSky = moonForVoyage([sun[0], sun[1], sun[2]]);
    this.voyage = {
      toMoon,
      setup: {
        toMoon, duration: COAST_S,
        startOther: toMoon ? moonInEarthSky : EARTH_IN_MOON_SKY,
        endOther: toMoon ? EARTH_IN_MOON_SKY : moonInEarthSky,
        departAxes: toMoon ? earthShiftAxes(ascentDownrange(ASCENT_S)) : I3,
        arriveAxes: toMoon ? I3 : earthShiftAxes(descentDownrange(DESCENT_START)),
        met0: ASCENT_MET,
      },
      moonSite: toMoon ? null : [e?.x ?? this.g.player.x, e?.z ?? this.g.player.z],
      started: performance.now(),
    };
  }

  // ------------------------------------------------------------------ red

  onMessage(msg: ServerMsg): boolean {
    if (msg.t !== 'rocket') return false;
    if (msg.k) {
      this.views.delete(msg.e);
      if (this.entityId === msg.e) {
        const prev = this.views.get(msg.e);
        if (this.lastPhase === RK_PHASE.ASCENT && prev) this.beginVoyage(prev.dest, this.g.ents.list.get(msg.e));
        this.entityId = -1;
      }
      return true;
    }
    const prev = this.views.get(msg.e);
    const e = this.g.ents.list.get(msg.e);
    const arriving = msg.ph === RK_PHASE.COAST || msg.ph === RK_PHASE.DESCENT;
    const v: View = {
      ph: msg.ph, pt: msg.pt, at: performance.now(), seats: msg.seats, dest: msg.d,
      baseY: prev?.baseY ?? (e && !arriving ? e.y : null), firstY: prev?.firstY ?? (e ? e.y : NaN),
    };
    this.views.set(msg.e, v);
    const me = this.g.net?.id;
    const seat = me ? msg.seats.indexOf(me) : -1;
    if (seat >= 0) {
      this.entityId = msg.e;
      this.seat = seat;
      this.asked = 0;
      if (msg.ph === RK_PHASE.IDLE && this.lastPhase === RK_PHASE.DESCENT) {
        this.landedAt = performance.now();
        this.landedWhere = dimensionDef(this.g.world!.dim).name;
      }
      this.lastPhase = msg.ph;
      if (msg.ph === RK_PHASE.IDLE) this.voyage = null;
    } else if (this.entityId === msg.e) {
      // Fuera de su plaza: al final del ascenso es que se va al otro mundo (empieza el viaje); si no, se bajó o el cohete se fue.
      if (this.lastPhase === RK_PHASE.ASCENT && msg.ph === RK_PHASE.ASCENT && msg.pt >= ASCENT_S - 1) this.beginVoyage(msg.d, e);
      else this.voyage = null;
      this.entityId = -1;
      if (!this.voyage) this.showHud(false);
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
    void dt;
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

  /** Segundos del tránsito (del estado del servidor o, mientras no llega, desde que empezó). */
  private transitTime(): number | null {
    const vy = this.voyage;
    if (!vy) return null;
    const v = this.views.get(this.entityId);
    if (v && v.ph === RK_PHASE.COAST) return this.phaseTime(v);
    if (v && v.ph !== RK_PHASE.COAST) return null;
    return (performance.now() - vy.started) / 1000;
  }

  /** Después de actualizar las entidades: seguir al cohete, llamas, humo, sonido, cámara y cabina. */
  afterEntities(dt: number): void {
    const g = this.g;
    let power = 0;
    for (const e of g.ents.list.values()) {
      if (e.type !== ENT_ROCKET || e.gone) continue;
      const v = this.views.get(e.id);
      if (v && v.baseY === null && v.ph !== RK_PHASE.DESCENT && v.ph !== RK_PHASE.COAST) v.baseY = e.y;
      if (v && Number.isNaN(v.firstY)) v.firstY = e.y;
      const d = Math.hypot(e.x - g.player.x, e.y - g.player.y, e.z - g.player.z);
      const ph = rocketPhaseOf(e.flags);
      const burning = (e.flags & RF_BURN) !== 0;
      if (burning) {
        const pw = this.powerOf(ph, v);
        power = Math.max(power, d < 200 ? pw * (1 - d / 200) : 0);
        this.plume(e, ph, pw, dt, v);
      }
    }
    if (this.active) this.seatPlayer();
    // Sonido: dentro se oye entero (en el espacio, sólo lo que vibra en la estructura: los motores); fuera, según la distancia.
    const inside = this.active;
    const tr = this.lastTransit;
    const burn = tr ? tr.burn : 0;
    const rumble = tr ? tr.plasma : 0;
    const ownPower = inside ? Math.max(this.ownPower(), burn * 0.8, rumble * 0.6) : 0;
    const vol = inside ? ownPower * 0.85 : Math.min(1, power) * 0.9;
    g.audio.setRocketEngine(vol, inside ? ownPower : Math.min(1, power));
    // Cámara: dentro tiembla con los motores (y con la reentrada).
    if (inside && ownPower > 0) g.shake = Math.max(g.shake, ownPower * 0.16);
    this.updateHud();
  }

  private ownPower(): number {
    const e = this.g.ents.list.get(this.entityId), v = this.views.get(this.entityId);
    if (!e || !(e.flags & RF_BURN)) return 0;
    return this.powerOf(rocketPhaseOf(e.flags), v);
  }

  /** Potencia (0..1) de los motores según la fase: crece en los últimos segundos de la cuenta atrás y sostiene en el vuelo. */
  private powerOf(ph: number, v: View | undefined): number {
    if (ph === RK_PHASE.COUNTDOWN && v) return 0.25 + 0.55 * Math.min(1, (this.phaseTime(v) - (COUNTDOWN_S - IGNITION_AT)) / IGNITION_AT);
    if (ph === RK_PHASE.ASCENT) return 1;
    if (ph === RK_PHASE.DESCENT) return 0.65;
    return 0.3;
  }

  /** Llamas de las cinco toberas y el humo/polvo del suelo mientras está cerca. */
  private plume(e: ClientEntity, ph: number, power: number, dt: number, v: View | undefined): void {
    const fx = this.g.renderer.entities.pfx;
    const k = Math.min(3, dt * 60); // partículas por frame a 60 fps; con menos fps, proporcional
    const alt = this.altitude(e, v);
    // Muy arriba las partículas se quedarían atrás en un instante (van a kilómetros por segundo): sólo cerca del suelo.
    if (alt > 4000) return;
    for (const [ox, oz, s] of NOZZLES) {
      const n = Math.max(1, Math.round((s === 1 ? 5 : 2) * k * (0.4 + 0.6 * power)));
      fx.rocketPlume(e.x + ox, e.y + 0.3, e.z + oz, power * s, n, 18 + 22 * power);
    }
    // Polvo del suelo: cerca de la plataforma (subiendo o bajando).
    const base = e.y - alt;
    if (alt < 60 && (ph === RK_PHASE.ASCENT || ph === RK_PHASE.COUNTDOWN || ph === RK_PHASE.DESCENT)) {
      this.blastT += dt;
      if (this.blastT > 0.08) {
        this.blastT = 0;
        fx.rocketBlast(e.x, base, e.z, Math.max(0.35, power) * (1 - alt / 80));
      }
    }
  }

  /** Altura del cohete sobre su suelo (la plataforma de salida o el sitio de llegada). */
  private altitude(e: ClientEntity, v: View | undefined): number {
    if (!v) return 0;
    if (v.ph === RK_PHASE.COAST || v.ph === RK_PHASE.DESCENT || v.baseY === null) {
      return Number.isNaN(v.firstY) ? DESCENT_START : Math.max(0, e.y - (v.firstY - DESCENT_START));
    }
    return Math.max(0, e.y - v.baseY);
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

  // ------------------------------------------------------------------ los planetas para el renderer

  /**
   * Dónde están la Tierra y la Luna para el renderer este frame: en el tránsito, las del viaje; si no, la Tierra en el cielo de la
   * Luna (o bajo el cohete) y la Luna bajo los pies; más lo que avanza la nave sobre cada una (el suelo que corre debajo).
   */
  spaceFrame(camX: number, camY: number, camZ: number, timeS: number): SpaceFrame {
    const dim = this.g.world!.dim;
    const e = this.entityId > 0 ? this.g.ents.list.get(this.entityId) : undefined;
    const v = this.views.get(this.entityId);
    const vy = this.voyage;
    let earthShift = 0, moonShift = 0;
    let site: [number, number] = [camX, camZ];
    const tau = this.transitTime();
    this.lastTransit = null;
    if (vy && tau !== null) {
      const sd = this.g.renderer.sunDir;
      const tv = transitView(tau, vy.setup, [sd[0], sd[1], sd[2]]);
      this.lastTransit = tv;
      if (vy.toMoon) {
        // La órbita baja corre sobre el suelo hasta que empieza el descenso (y el descenso sigue desde ahí).
        const left = Math.max(0, Math.min(TRANSIT_HOLD, COAST_S - tau));
        moonShift = descentDownrange(DESCENT_START) + LOW_ORBIT_V * left;
        site = [camX, camZ];
      } else {
        moonShift = ascentDownrange(ASCENT_S);
        site = vy.moonSite ?? site;
      }
      return { transit: true, spaceness: 1, earth: tv.earth, moon: tv.moon, sun: tv.sun, site, moonShift, earthShift, plasma: tv.plasma };
    }
    if (e && v) {
      const alt = this.altitude(e, v);
      const shift = v.ph === RK_PHASE.ASCENT ? ascentDownrange(this.phaseTime(v)) : v.ph === RK_PHASE.DESCENT ? descentDownrange(alt) : 0;
      if (dim === DIM_MOON) moonShift = shift;
      else earthShift = shift;
    }
    let earth: BodyView, moon: BodyView;
    if (dim === DIM_MOON) {
      earth = earthFromMoon(timeS);
      moon = moonBelow((camY - MOON_BASE) / 1000);
    } else {
      earth = earthBelow(Math.max(0, camY - 63) / 1000, earthShift);
      const s = this.g.renderer.sunDir;
      const md = [-s[0], -s[1], -s[2]];
      moon = { c: [md[0] * EARTH_MOON, md[1] * EARTH_MOON, md[2] * EARTH_MOON], r: R_MOON, axes: I3 };
    }
    const spaceness = dim === DIM_MOON ? 1 : dim === DIM_OVERWORLD ? smooth(20_000, 80_000, camY) : 0;
    const sd = this.g.renderer.sunDir;
    void camZ;
    return { transit: false, spaceness, earth, moon, sun: [sd[0], sd[1], sd[2]], site, moonShift, earthShift, plasma: 0 };
  }

  // ------------------------------------------------------------------ cabina

  private showHud(on: boolean): void {
    if (!this.hud) {
      if (!on) return;
      this.buildHud();
    }
    this.hud!.classList.toggle('on', on);
    // En la cabina no se ven la barra de objetos ni la mira: sólo la ventana y los instrumentos.
    document.body.classList.toggle('rk-cabin', on);
  }

  private buildHud(): void {
    const hud = document.createElement('div');
    hud.id = 'rk-hud';
    hud.innerHTML =
      '<div class="rk-plasma"></div><div class="rk-frame"></div><div class="rk-status"></div><div class="rk-count"></div><div class="rk-note"></div>' +
      '<div class="rk-panel"><div><b class="rk-alt-l">ALTITUD</b><span class="rk-alt">0 m</span></div><div><b>VELOCIDAD</b><span class="rk-spd">0 m/s</span></div>' +
      '<div><b>TIEMPO DE MISIÓN</b><span class="rk-t">—</span></div><div class="rk-warp"></div></div>' +
      '<div class="rk-hint"></div><div class="rk-fade"></div>';
    document.body.appendChild(hud);
    this.hud = hud;
    const q = <T extends HTMLElement>(s: string) => hud.querySelector(s) as T;
    this.els = {
      count: q('.rk-count'), status: q('.rk-status'), alt: q('.rk-alt'), altL: q('.rk-alt-l'), spd: q('.rk-spd'), t: q('.rk-t'), warp: q('.rk-warp'),
      hint: q('.rk-hint'), fade: q('.rk-fade'), plasma: q('.rk-plasma'), note: q('.rk-note'),
    };
  }

  private updateHud(): void {
    const g = this.g;
    const v = this.views.get(this.entityId);
    const e = g.ents.list.get(this.entityId);
    const landedRecently = performance.now() - this.landedAt < 6000;
    if (!this.active || g.survival.dead || (!this.voyage && (!v || !e))) {
      this.showHud(false);
      return;
    }
    this.showHud(true);
    const els = this.els!;
    const vy = this.voyage;
    const tr = this.lastTransit;
    let status = '', hint = '', count = '', note = '', fade = 0, plasma = 0;
    let altL = 'ALTITUD', alt = '—', spd = '—', met = '—', warp = '';
    const here = dimensionDef(g.world!.dim).name;
    if (tr && vy) {
      // Tránsito.
      const tau = this.transitTime() ?? 0;
      const destName = vy.toMoon ? 'la Luna' : 'la Tierra';
      const names: Record<string, string> = {
        sep: 'Separación de etapa',
        inject: vy.toMoon ? 'Inyección translunar' : 'Inyección transterrestre',
        coast: `Crucero hacia ${destName}`,
        flip: 'Maniobra de giro',
        capture: 'Inserción en órbita lunar',
        orbit: vy.toMoon ? 'Órbita lunar baja' : 'Reentrada atmosférica',
        reentry: 'Reentrada atmosférica',
      };
      status = names[tr.stage];
      const far = vy.toMoon ? tr.altMoon : tr.altEarth;
      const near = vy.toMoon ? tr.altEarth : tr.altMoon;
      // Cerca de la salida, la altura sobre ella; luego, la distancia al destino.
      if (tr.u < 0.12) {
        altL = 'ALTITUD';
        alt = distText(near * 1000);
      } else {
        altL = vy.toMoon ? 'DISTANCIA A LA LUNA' : 'DISTANCIA A LA TIERRA';
        alt = distText(far * 1000);
      }
      spd = speedText(tr.speed * 1000);
      met = metText(tr.met);
      warp = tr.warp > 1.5 ? `×${Math.round(tr.warp).toLocaleString('es-ES')}` : '';
      fade = 1 - smooth(0.15, 1.1, tau);
      plasma = tr.plasma;
      if (tr.stage === 'coast' && tr.u > 0.08 && tr.u < 0.3) note = vy.toMoon ? 'Mira hacia abajo y atrás: la Tierra se aleja' : 'Mira hacia abajo: la Luna se aleja';
      else if (tr.stage === 'flip') note = vy.toMoon ? 'La nave gira: la Luna, delante' : 'La nave gira: la Tierra, delante';
      else if (tr.stage === 'orbit' && vy.toMoon) note = 'Mira abajo: el sitio de alunizaje';
      if (tau > COAST_S) note = 'Esperando a la tripulación…';
    } else if (v && e) {
      const t = this.phaseTime(v);
      const h = this.altitude(e, v);
      switch (v.ph) {
        case RK_PHASE.IDLE: {
          const n = v.seats.filter((s) => s !== null).length;
          status = landedRecently ? `Contacto · ${this.landedWhere}` : `Cohete Selene · ${n}/${ROCKET_SEATS} a bordo`;
          const dest = dimensionDef(v.dest).name;
          hint = `<kbd>ESPACIO</kbd>Despegar hacia ${dest}<br><kbd>MAYÚS</kbd>Bajar del cohete`;
          alt = '0 m';
          spd = '0 m/s';
          if (landedRecently) note = 'Motores apagados';
          break;
        }
        case RK_PHASE.COUNTDOWN: {
          const left = COUNTDOWN_S - t;
          status = left > IGNITION_AT ? 'Cuenta atrás' : 'Ignición';
          count = left > 0 ? String(Math.ceil(left)) : '0';
          met = `T- 00:00:${String(Math.max(0, Math.ceil(left))).padStart(2, '0')}`;
          alt = '0 m';
          spd = '0 m/s';
          hint = left > IGNITION_AT ? '<kbd>MAYÚS</kbd>Abortar' : '';
          break;
        }
        case RK_PHASE.ASCENT: {
          const tel = ascentTelemetry(t);
          const hh = ascentHeight(t);
          status = t < 2 ? 'Despegue' : hh > 9_000 && hh < 15_000 ? 'Máxima presión dinámica' : hh > 60_000 && hh < 68_000 ? 'Separación de la primera etapa'
            : t > ASCENT_S - 2.5 ? 'Apagado de motores' : hh > 68_000 ? 'Segunda etapa' : 'Ascenso';
          if (t < 2) count = '¡DESPEGUE!';
          alt = distText(h);
          spd = speedText(tel.speed);
          met = metText(tel.met);
          const w = (ascentTelemetry(t + 0.1).met - tel.met) / 0.1;
          warp = w > 1.5 ? `×${Math.round(w)}` : '';
          if (hh > 20_000 && hh < 60_000) note = g.world!.dim === DIM_MOON ? 'Mira abajo: la Luna se curva' : 'Mira abajo: la Tierra se curva';
          break;
        }
        case RK_PHASE.COAST: // un tránsito sin viaje propio (llegó a mitad): la órbita de llegada
          status = `Órbita: ${here}`;
          alt = distText(h);
          break;
        case RK_PHASE.DESCENT: {
          const decel = g.world!.dim === DIM_MOON ? DESCENT_DECEL.moon : DESCENT_DECEL.earth;
          status = h > 1500 ? 'Descenso motorizado' : h > 120 ? 'Aproximación final' : 'Toma de contacto';
          alt = distText(h);
          spd = speedText(descentTelemetrySpeed(h, decel));
          if (vy) met = metText(transitView(COAST_S, vy.setup).met + t); // el tiempo de misión sigue desde el tránsito
          if (h > 1500 && h < 12_000) note = g.world!.dim === DIM_MOON ? 'El suelo corre debajo: frenando' : '';
          if (g.world!.dim !== DIM_MOON && t < 4) plasma = 1 - smooth(0, 4, t);
          break;
        }
      }
    }
    els.status.textContent = status;
    els.hint.innerHTML = hint;
    els.altL.textContent = altL;
    els.alt.textContent = alt;
    els.spd.textContent = spd;
    els.t.textContent = met;
    els.warp.textContent = warp;
    els.warp.style.display = warp ? '' : 'none';
    if (els.note.textContent !== note) els.note.textContent = note;
    els.note.classList.toggle('on', note !== '');
    els.fade.style.opacity = String(fade);
    els.fade.innerHTML = '';
    els.plasma.style.opacity = String(Math.min(1, plasma));
    // Cuenta atrás: un pulso por segundo.
    const cd = v && v.ph === RK_PHASE.COUNTDOWN ? Math.ceil(COUNTDOWN_S - this.phaseTime(v)) : -1;
    if (count !== els.count.textContent || cd !== this.lastCount) {
      els.count.textContent = count;
      els.count.classList.remove('pulse');
      void els.count.offsetWidth;
      els.count.classList.toggle('pulse', count !== '');
      els.count.classList.toggle('go', v?.ph === RK_PHASE.COUNTDOWN && COUNTDOWN_S - this.phaseTime(v) <= IGNITION_AT);
      this.lastCount = cd;
    }
  }

  dispose(): void {
    this.hud?.remove();
    this.hud = null;
    this.els = null;
  }
}
