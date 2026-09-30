// Programa lunar (shared/meteors.ts, «La caída del Ancla»): las lluvias de meteoritos en el cliente, como en una película.
//
// - El aviso: un banner con la cuenta atrás («IMPACTOS EN 01:23»), la sirena y el cielo que se tiñe de rojo (más cuanto menos falta).
// - Los meteoritos: cada uno se ve venir desde el Errante durante FLIGHT_S segundos (cabeza incandescente y estela de humo) y silba al
//   pasar; el impacto (la explosión, el cráter) lo pone el servidor.
// - La radio de la Estación Selene: los mensajes se escriben letra a letra con estática, arriba a la izquierda.
// - El Errante: un punto rojizo fijo en el cielo que crece con cada lluvia (lo pinta el renderer con `errante`).
import { MT_PHASE, FLIGHT_S, meteorAt, erranteSize } from '../../shared/meteors';
import { DIM_OVERWORLD } from '../../shared/dimensions';
import type { ServerMsg } from '../../shared/protocol';
import type { Game } from './Game';
import '../ui/meteors.css';

interface Flying {
  from: [number, number, number];
  to: [number, number, number];
  /** Cuándo apareció (ms). */
  t0: number;
  power: number;
  core: boolean;
  whooshed: boolean;
  /** Dónde estaba en el frame anterior (para la raya de fuego). */
  last: [number, number, number] | null;
}

/** Segundos de cuenta atrás como «01:23». */
function clock(s: number): string {
  s = Math.max(0, Math.ceil(s));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export class MeteorClient {
  private awake = false;
  private n = 0;
  private phase: number = MT_PHASE.CALM;
  /** Segundos que quedaban del aviso al llegar el mensaje, y cuándo llegó (ms). */
  private left = 0;
  private leftAt = 0;
  private flying: Flying[] = [];
  private sirenT = 0;
  /** Tinte rojo del cielo (0..1), suavizado. */
  private alarmLevel = 0;
  /** Fogonazo del meteorito grande (0..1). */
  private flash = 0;
  private radio: { text: string; shown: number; t: number }[] = [];
  private el: {
    root: HTMLDivElement; banner: HTMLDivElement; title: HTMLElement; count: HTMLElement; vignette: HTMLDivElement; radio: HTMLDivElement;
    flash: HTMLDivElement;
  } | null = null;

  constructor(private g: Game) {}

  /** Al cambiar de dimensión: los meteoritos en el aire y el aviso eran del mundo anterior (el Errante sigue: lo reenvía el servidor). */
  reset(): void {
    this.flying = [];
    this.phase = MT_PHASE.CALM;
  }

  /** Tamaño del Errante en el cielo (0: no se ve). */
  get errante(): number {
    return erranteSize(this.awake, this.n);
  }

  /** Tinte rojo del cielo por el aviso o la lluvia (0..1). */
  get alarm(): number {
    return this.alarmLevel;
  }

  // ------------------------------------------------------------------ red

  onMessage(msg: ServerMsg): boolean {
    switch (msg.t) {
      case 'meteors':
        this.awake = msg.awake === 1;
        this.n = msg.n;
        if (msg.ph === MT_PHASE.WARNING && this.phase !== MT_PHASE.WARNING) this.sirenT = 0;
        this.phase = msg.ph;
        this.left = msg.left;
        this.leftAt = performance.now();
        return true;
      case 'meteor':
        this.flying.push({ from: msg.s, to: msg.p, t0: performance.now(), power: msg.k, core: msg.c === 1, whooshed: false, last: null });
        return true;
      case 'radio':
        this.radio.push({ text: msg.m, shown: 0, t: 0 });
        if (this.radio.length > 4) this.radio.shift();
        this.g.audio.playRadioStatic();
        return true;
    }
    return false;
  }

  // ------------------------------------------------------------------ cada frame

  update(dt: number): void {
    const g = this.g;
    const inOverworld = g.world?.dim === DIM_OVERWORLD;
    const now = performance.now();
    const leftNow = Math.max(0, this.left - (now - this.leftAt) / 1000);
    // La sirena: al empezar el aviso, en el último medio minuto y durante los impactos.
    if (inOverworld && (this.phase === MT_PHASE.WARNING || this.phase === MT_PHASE.IMPACTS)) {
      this.sirenT -= dt;
      const loud = this.phase === MT_PHASE.WARNING && leftNow > 30 && leftNow < this.left - 12 ? 0 : 1;
      if (this.sirenT <= 0 && loud > 0) {
        g.audio.playSiren(3.4, this.phase === MT_PHASE.IMPACTS ? 0.7 : 1);
        this.sirenT = this.phase === MT_PHASE.IMPACTS ? 7 : 4;
      }
    }
    // El cielo se tiñe de rojo: poco al empezar el aviso, más al acercarse, del todo durante los impactos.
    const target = !inOverworld ? 0
      : this.phase === MT_PHASE.WARNING ? 0.25 + 0.45 * (1 - Math.min(1, leftNow / 120)) + 0.08 * Math.sin(now / 400)
      : this.phase === MT_PHASE.IMPACTS ? 0.85 : 0;
    this.alarmLevel += (target - this.alarmLevel) * Math.min(1, dt * 1.5);
    // Los meteoritos en el aire.
    const p = g.player;
    const fx = g.renderer.entities.pfx;
    for (let i = this.flying.length - 1; i >= 0; i--) {
      const m = this.flying[i];
      const t = (now - m.t0) / 1000;
      if (t >= FLIGHT_S) {
        this.flying.splice(i, 1);
        const d = Math.hypot(m.to[0] - p.x, m.to[1] - p.y, m.to[2] - p.z);
        if (m.core) this.flash = Math.max(this.flash, 1 - d / 200);
        // Temblor aunque caiga lejos (el suelo lo transmite).
        g.shake = Math.max(g.shake, Math.max(0, 1 - d / (40 + m.power * 12)) * (m.core ? 1 : 0.6));
        continue;
      }
      const pos = meteorAt(m.from, m.to, t);
      const ahead = meteorAt(m.from, m.to, Math.min(FLIGHT_S, t + 0.05));
      let dx = ahead[0] - pos[0], dy = ahead[1] - pos[1], dz = ahead[2] - pos[2];
      const l = Math.hypot(dx, dy, dz) || 1;
      dx /= l;
      dy /= l;
      dz /= l;
      const last = m.last ?? pos;
      fx.meteor(pos[0], pos[1], pos[2], dx, dy, dz, m.power, Math.min(3, dt * 60), last[0], last[1], last[2]);
      m.last = pos;
      if (!m.whooshed && t > FLIGHT_S * 0.35) {
        m.whooshed = true;
        g.audio.playMeteorWhoosh(meteorAt(m.from, m.to, FLIGHT_S * 0.8), m.power);
      }
    }
    this.flash = Math.max(0, this.flash - dt * 0.8);
    this.updateHud(dt, inOverworld, leftNow);
  }

  // ------------------------------------------------------------------ pantalla

  private build(): void {
    const root = document.createElement('div');
    root.id = 'mt-hud';
    root.innerHTML =
      '<div class="mt-vignette"></div><div class="mt-flash"></div>' +
      '<div class="mt-banner"><b class="mt-title"></b><span class="mt-count"></span></div>' +
      '<div class="mt-radio"></div>';
    document.body.appendChild(root);
    const q = <T extends HTMLElement>(s: string) => root.querySelector(s) as T;
    this.el = { root, banner: q('.mt-banner'), title: q('.mt-title'), count: q('.mt-count'), vignette: q('.mt-vignette'), radio: q('.mt-radio'), flash: q('.mt-flash') };
  }

  private updateHud(dt: number, inOverworld: boolean, leftNow: number): void {
    const warning = inOverworld && this.phase === MT_PHASE.WARNING;
    const impacts = inOverworld && this.phase === MT_PHASE.IMPACTS;
    if (!this.el) {
      if (!warning && !impacts && !this.radio.length && this.flash <= 0) return;
      this.build();
    }
    const el = this.el!;
    el.banner.classList.toggle('on', warning || impacts);
    el.banner.classList.toggle('now', impacts);
    if (warning) {
      el.title.textContent = this.n === 0 ? 'EL ANCLA CAYÓ' : 'LLUVIA DE METEORITOS';
      el.count.textContent = `IMPACTOS EN ${clock(leftNow)}`;
    } else if (impacts) {
      el.title.textContent = 'IMPACTOS';
      el.count.textContent = 'BUSCA REFUGIO';
    }
    el.vignette.style.opacity = String(Math.min(1, this.alarmLevel * (impacts ? 0.9 : 0.7)));
    el.flash.style.opacity = String(this.flash);
    // La radio: cada mensaje se escribe letra a letra (40 por segundo) y se borra a los 9 s de acabar.
    for (const r of this.radio) {
      r.t += dt;
      r.shown = Math.min(r.text.length, Math.floor(r.t * 40));
    }
    this.radio = this.radio.filter((r) => r.t < r.text.length / 40 + 9);
    const html = this.radio.map((r) => `<p>${escapeHtml(r.text.slice(0, r.shown))}${r.shown < r.text.length ? '<i>▌</i>' : ''}</p>`).join('');
    const on = this.radio.length > 0;
    if (el.radio.dataset.html !== html) {
      el.radio.dataset.html = html;
      el.radio.innerHTML = on ? `<b>RADIO · ESTACIÓN SELENE</b>${html}` : '';
    }
    el.radio.classList.toggle('on', on);
  }

  dispose(): void {
    this.el?.root.remove();
    this.el = null;
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}
