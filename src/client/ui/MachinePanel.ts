// Programa lunar: la ventana de configuración de una máquina (los divisores y los brazos): filas de opciones excluyentes y ranuras de
// filtro. Las ranuras se rellenan con el objeto que lleva el jugador en la mano (clic) y se vacían con clic derecho o con la mano vacía.
import './machinePanel.css';
import { ITEMS } from '../../shared/items';
import { paintSlot } from './UI';

export interface PanelChoice {
  key: string;
  label: string;
  options: [number, string][];
  value: number;
}

export interface PanelSlots {
  key: string;
  label: string;
  /** Objeto de cada ranura (0 = vacía). */
  ids: number[];
}

export interface PanelGridEntry {
  /** Lo que se manda al elegirlo (la clave de la receta). */
  value: number;
  /** Objeto del icono (0 = ninguno: se dibuja un cuadro del color del fluido) y texto de ayuda. */
  icon: number;
  label: string;
  color?: readonly [number, number, number];
}

export interface PanelGrid {
  key: string;
  label: string;
  entries: PanelGridEntry[];
  /** El elegido (0 = ninguno). */
  value: number;
}

export interface PanelSpec {
  title: string;
  choices: PanelChoice[];
  /** Una rejilla de objetos para elegir uno (la receta de una ensambladora). */
  grid?: PanelGrid;
  slots?: PanelSlots[];
  hint?: string;
}

export type PanelPatch = Record<string, number | number[]>;

export class MachinePanel {
  private root: HTMLElement;
  private spec: PanelSpec | null = null;
  private apply: ((patch: PanelPatch) => void) | null = null;
  private closed: (() => void) | null = null;

  constructor(private icons: Map<number, string>, private held: () => number) {
    this.root = document.createElement('div');
    this.root.id = 'machine-panel';
    this.root.className = 'hidden';
    document.body.appendChild(this.root);
    this.root.addEventListener('mousedown', (e) => {
      if (e.target === this.root) this.close();
    });
    document.addEventListener('keydown', (e) => {
      if (this.spec && e.code === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        this.close();
      }
    }, true);
  }

  isOpen(): boolean {
    return this.spec !== null;
  }

  open(spec: PanelSpec, apply: (patch: PanelPatch) => void, closed: () => void): void {
    this.spec = spec;
    this.apply = apply;
    this.closed = closed;
    this.render();
    this.root.classList.remove('hidden');
  }

  /** Pone otra descripción en la ventana abierta (el estado de la máquina cambia mientras se mira). */
  update(spec: PanelSpec): void {
    if (!this.spec) return;
    this.spec = spec;
    this.render();
  }

  close(): void {
    if (!this.spec) return;
    this.spec = null;
    this.root.classList.add('hidden');
    const done = this.closed;
    this.closed = null;
    done?.();
  }

  private render(): void {
    const spec = this.spec;
    if (!spec) return;
    const rows: string[] = [`<h3>${spec.title}</h3>`];
    for (const c of spec.choices) {
      rows.push(`<div class="row"><span class="lbl">${c.label}</span><span class="opts">${
        c.options.map(([v, t]) => `<button type="button" class="opt${v === c.value ? ' on' : ''}" data-c="${c.key}" data-v="${v}">${t}</button>`).join('')
      }</span></div>`);
    }
    for (const s of spec.slots ?? []) {
      rows.push(`<div class="row"><span class="lbl">${s.label}</span><span class="slots">${
        s.ids.map((_, i) => `<div class="slot2" data-s="${s.key}:${i}" title=""><div class="ico"></div><span class="cnt"></span><div class="dur"><i></i></div></div>`).join('')
      }</span></div>`);
    }
    if (spec.grid) {
      rows.push(`<div class="row"><span class="lbl">${spec.grid.label}</span></div><div class="grid2">${
        spec.grid.entries.map((e) => `<div class="slot2${e.value === spec.grid!.value ? ' on' : ''}" data-g="${e.value}"><div class="ico"></div><span class="cnt"></span><div class="dur"><i></i></div></div>`).join('')
      }</div>`);
    }
    if (spec.hint) rows.push(`<p>${spec.hint}</p>`);
    rows.push('<div class="row end"><button type="button" class="btn primary" data-k="close">Cerrar</button></div>');
    this.root.innerHTML = `<div class="panel">${rows.join('')}</div>`;
    this.root.querySelectorAll<HTMLElement>('[data-c]').forEach((el) => {
      el.addEventListener('click', () => {
        const key = el.dataset.c!, v = Number(el.dataset.v);
        const c = spec.choices.find((x) => x.key === key)!;
        c.value = v;
        this.apply?.({ [key]: v });
        this.render();
      });
    });
    this.root.querySelectorAll<HTMLElement>('[data-g]').forEach((e) => {
      const value = Number(e.dataset.g);
      const entry = spec.grid!.entries.find((x) => x.value === value)!;
      if (entry.icon) paintSlot(e, { id: entry.icon, count: 1 }, this.icons);
      else if (entry.color) {
        const ico = e.querySelector('.ico') as HTMLElement;
        const [r, g, b] = entry.color;
        ico.style.background = `radial-gradient(circle at 35% 30%, rgb(${Math.min(255, r + 60)},${Math.min(255, g + 60)},${Math.min(255, b + 60)}), rgb(${r},${g},${b}))`;
        ico.style.borderRadius = '50% 50% 45% 45%';
        ico.style.inset = '9px';
      }
      e.title = entry.label;
      e.addEventListener('click', () => {
        spec.grid!.value = value;
        this.apply?.({ recipe: value });
        this.render();
      });
    });
    this.root.querySelectorAll<HTMLElement>('[data-s]').forEach((el) => {
      const [key, idx] = el.dataset.s!.split(':');
      const set = spec.slots!.find((x) => x.key === key)!;
      const i = Number(idx);
      const id = set.ids[i];
      paintSlot(el, id ? { id, count: 1 } : null, this.icons);
      el.title = id ? ITEMS[id]?.name ?? '' : 'Vacía: clic con un objeto en la mano';
      const put = (v: number) => {
        set.ids[i] = v;
        this.apply?.({ [key]: set.ids.slice() });
        this.render();
      };
      el.addEventListener('click', () => put(this.held() || 0));
      el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        put(0);
      });
    });
    this.root.querySelector('[data-k="close"]')!.addEventListener('click', () => this.close());
  }
}
