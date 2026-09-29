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

export interface PanelGrid {
  key: string;
  label: string;
  /** Objetos entre los que se elige y el elegido (0 = ninguno). */
  ids: number[];
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
        spec.grid.ids.map((id) => `<div class="slot2${id === spec.grid!.value ? ' on' : ''}" data-g="${id}"><div class="ico"></div><span class="cnt"></span><div class="dur"><i></i></div></div>`).join('')
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
      const id = Number(e.dataset.g);
      paintSlot(e, { id, count: 1 }, this.icons);
      e.title = ITEMS[id]?.name ?? '';
      e.addEventListener('click', () => {
        spec.grid!.value = id;
        this.apply?.({ [spec.grid!.key]: [id] });
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
