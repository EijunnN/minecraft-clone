// Programa lunar: el oxígeno del traje en pantalla. Una barra propia encima de la del hambre, con el tiempo que queda (el depósito y
// las botellas que se llevan) y un aviso cuando falta algo: el traje incompleto en el vacío o el oxígeno a punto de acabarse.
import { SUIT_TANK } from '../../shared/spacesuit';
import './oxygenHud.css';

let el: HTMLDivElement | null = null;
let fill: HTMLElement, time: HTMLElement, note: HTMLElement;
let last = '';

function build(): void {
  const hud = document.getElementById('survival-hud') ?? document.getElementById('hud');
  if (!hud) return;
  el = document.createElement('div');
  el.id = 'oxygen-hud';
  el.innerHTML = '<b>O₂</b><span class="ox-bar"><i></i></span><span class="ox-time"></span><span class="ox-note"></span>';
  hud.appendChild(el);
  fill = el.querySelector('.ox-bar i') as HTMLElement;
  time = el.querySelector('.ox-time') as HTMLElement;
  note = el.querySelector('.ox-note') as HTMLElement;
}

function clock(s: number): string {
  s = Math.max(0, Math.floor(s));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * `show`: se ve (en supervivencia, en el vacío o con el traje a medias de oxígeno). `tank`: uO del depósito; `seconds`: lo que da todo
 * lo que se lleva; `sealed`: lleva el traje entero; `vacuum`: está en el vacío (fuera del cohete).
 */
export function renderOxygenHud(show: boolean, tank: number, seconds: number, sealed: boolean, vacuum: boolean): void {
  if (!el) {
    if (!show) return;
    build();
    if (!el) return;
  }
  const warn = vacuum && (!sealed || seconds < 60);
  const msg = !vacuum ? '' : !sealed ? 'Sin traje sellado: no hay aire' : seconds <= 0 ? 'Sin oxígeno' : seconds < 60 ? 'Oxígeno bajo' : '';
  const key = `${show}|${Math.round((tank / SUIT_TANK) * 100)}|${Math.floor(seconds)}|${warn}|${msg}`;
  if (key === last) return;
  last = key;
  el.style.display = show ? '' : 'none';
  el.classList.toggle('warn', warn);
  fill.style.width = `${Math.round(Math.max(0, Math.min(1, tank / SUIT_TANK)) * 100)}%`;
  time.textContent = sealed ? clock(seconds) : '—';
  note.textContent = msg;
}
