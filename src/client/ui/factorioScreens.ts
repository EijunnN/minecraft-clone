// Programa lunar: la ventana de investigación y la de fabricación a mano (con su cola), al estilo de Factorio.
import './factorio.css';
import { ITEMS, type ItemStack } from '../../shared/items';
import { TECHS, techByName, techAvailable, type Tech } from '../../shared/factorio/research';
import { factorioRecipeByName, factorioRecipes, itemAlts, type FRecipe } from '../../shared/factorio/catalog';
import { planHandCraft, planSeconds, runStep, HAND_CATEGORIES, type HandPlan } from '../../shared/factorio/handCraft';
import { techLabel, recipeLabel } from '../../shared/factorio/labels';
import { paintSlot } from './UI';
import type { ResearchClient } from '../game/researchClient';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
};

/** Una casilla con el icono de un objeto (y su cantidad). */
function slot(icons: Map<number, string>, id: number, count: number, title: string, cls = ''): HTMLElement {
  const s = el('div', `fx-slot ${cls}`);
  s.innerHTML = '<div class="ico"></div><span class="cnt"></span><div class="dur"><i></i></div>';
  s.title = title;
  paintSlot(s, { id, count } as ItemStack, icons);
  return s;
}

const fmtTime = (s: number): string => (s < 60 ? `${Math.round(s * 10) / 10} s` : `${Math.floor(s / 60)} min ${Math.round(s % 60)} s`);

abstract class Modal {
  protected root = el('div', 'fx-modal hidden');
  protected panel = el('div', 'fx-panel');
  private closedCb: (() => void) | null = null;

  constructor(private id: string) {
    this.root.id = id;
    this.root.appendChild(this.panel);
    document.body.appendChild(this.root);
    this.root.addEventListener('mousedown', (e) => {
      if (e.target === this.root) this.close();
    });
    document.addEventListener('keydown', (e) => {
      if (this.isOpen() && e.code === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        this.close();
      }
    }, true);
  }

  isOpen(): boolean {
    return !this.root.classList.contains('hidden');
  }

  open(closed: () => void): void {
    this.closedCb = closed;
    this.render();
    this.root.classList.remove('hidden');
  }

  close(): void {
    if (!this.isOpen()) return;
    this.root.classList.add('hidden');
    const cb = this.closedCb;
    this.closedCb = null;
    cb?.();
  }

  refresh(): void {
    if (this.isOpen()) this.render();
  }

  protected abstract render(): void;
}

// ------------------------------------------------------------------ investigación

export class ResearchScreen extends Modal {
  private selected = '';
  private query = '';

  constructor(private icons: Map<number, string>, private research: ResearchClient, private send: (tech: string, add: boolean) => void) {
    super('research-screen');
    research.listeners.push(() => this.refresh());
  }

  private status(t: Tech): 'done' | 'cur' | 'queued' | 'avail' | 'locked' {
    if (this.research.done.has(t.name)) return 'done';
    const i = this.research.queue.indexOf(t.name);
    if (i === 0) return 'cur';
    if (i > 0) return 'queued';
    return techAvailable(t.name, new Set([...this.research.done, ...this.research.queue])) ? 'avail' : 'locked';
  }

  private costLine(t: Tech): string {
    return t.unit ? `${t.unit.count} × ${fmtTime(t.unit.time)}` : t.trigger?.type === 'craft-item' ? `fabricar ${t.trigger.count ?? 1} × ${recipeLabel(t.trigger.item ?? '')}` : 'automática';
  }

  protected render(): void {
    const p = this.panel;
    const scrollList = p.querySelector('.fx-list')?.scrollTop ?? 0;
    p.textContent = '';
    const head = el('div', 'fx-head');
    head.appendChild(el('h3', '', 'Investigación'));
    const search = el('input');
    search.type = 'search';
    search.placeholder = 'Buscar tecnología…';
    search.value = this.query;
    search.addEventListener('input', () => {
      this.query = search.value;
      this.render();
      (this.panel.querySelector('input') as HTMLInputElement).focus();
    });
    head.appendChild(search);
    const close = el('button', 'fx-btn alt', 'Cerrar');
    close.addEventListener('click', () => this.close());
    head.appendChild(close);
    p.appendChild(head);

    // Lo que se investiga ahora.
    const cur = this.research.queue[0] ? techByName(this.research.queue[0]) : undefined;
    if (cur?.unit) {
      const row = el('div', 'fx-row');
      row.appendChild(el('span', '', `Investigando: ${techLabel(cur.name)} — ${Math.floor(this.research.progress)}/${cur.unit.count}`));
      const bar = el('div', 'fx-bar');
      bar.style.flex = '1';
      const fill = el('i');
      fill.style.width = `${Math.min(100, (this.research.progress / cur.unit.count) * 100)}%`;
      bar.appendChild(fill);
      row.appendChild(bar);
      p.appendChild(row);
    } else p.appendChild(el('span', 'fx-muted', 'No se investiga nada. Elige una tecnología y ponla en cola; los laboratorios necesitan sus paquetes de ciencia.'));

    const body = el('div', 'fx-body');
    const list = el('div', 'fx-list');
    const q = this.query.trim().toLowerCase();
    const groups: [string, Tech[]][] = [['En cola', []], ['Disponibles', []], ['Bloqueadas', []], ['Investigadas', []]];
    for (const t of TECHS) {
      if (q && !techLabel(t.name).toLowerCase().includes(q)) continue;
      const s = this.status(t);
      groups[s === 'cur' || s === 'queued' ? 0 : s === 'avail' ? 1 : s === 'locked' ? 2 : 3][1].push(t);
    }
    groups[0][1].sort((a, b) => this.research.queue.indexOf(a.name) - this.research.queue.indexOf(b.name));
    for (const [title, techs] of groups) {
      if (!techs.length) continue;
      list.appendChild(el('div', 'fx-tag', `${title} (${techs.length})`));
      for (const t of techs) {
        const st = this.status(t);
        const b = el('button', `fx-tech ${st} ${t.name === this.selected ? 'sel' : ''}`);
        b.appendChild(el('span', '', techLabel(t.name)));
        b.appendChild(el('span', 'fx-muted', this.costLine(t)));
        b.addEventListener('click', () => {
          this.selected = t.name;
          this.render();
        });
        list.appendChild(b);
      }
    }
    body.appendChild(list);
    body.appendChild(this.detail());
    p.appendChild(body);
    list.scrollTop = scrollList;
  }

  private detail(): HTMLElement {
    const d = el('div', 'fx-detail');
    const t = this.selected ? techByName(this.selected) : undefined;
    if (!t) {
      d.appendChild(el('span', 'fx-muted', 'Elige una tecnología de la lista para ver su coste y lo que desbloquea.'));
      return d;
    }
    const st = this.status(t);
    d.appendChild(el('h3', '', techLabel(t.name)));
    d.appendChild(el('span', 'fx-muted', { done: 'Investigada', cur: 'En curso', queued: 'En cola', avail: 'Disponible', locked: 'Bloqueada' }[st]));
    // Coste.
    if (t.unit) {
      d.appendChild(el('div', '', `Coste: ${t.unit.count} unidades de ${fmtTime(t.unit.time)}, cada una con:`));
      const row = el('div', 'fx-icons');
      for (const [pack, n] of t.unit.ingredients) {
        const id = itemAlts(pack)?.[0];
        if (id !== undefined) row.appendChild(slot(this.icons, id, n, `${ITEMS[id]?.name} × ${n}`));
        else row.appendChild(el('span', 'fx-muted', `${recipeLabel(pack)} ×${n} (aún no existe)`));
      }
      d.appendChild(row);
    } else d.appendChild(el('div', '', `Se abre al ${this.costLine(t)}.`));
    // Prerrequisitos.
    if (t.prerequisites.length) {
      d.appendChild(el('div', '', 'Requiere:'));
      const ul = el('div', 'fx-muted');
      ul.textContent = t.prerequisites.map((p) => `${this.research.done.has(p) ? '✔' : '✖'} ${techLabel(p)}`).join('   ');
      d.appendChild(ul);
    }
    // Desbloquea.
    if (t.unlocks.length) {
      d.appendChild(el('div', '', 'Desbloquea:'));
      const row = el('div', 'fx-icons');
      for (const rn of t.unlocks) {
        const r = factorioRecipeByName(rn);
        if (r) row.appendChild(slot(this.icons, r.out.id, 1, recipeLabel(rn)));
        else row.appendChild(el('span', 'fx-muted', recipeLabel(rn)));
      }
      d.appendChild(row);
    }
    const bonuses = t.effects.filter((e) => typeof e.modifier === 'number').map((e) => `${e.type} ${(e.modifier as number) > 0 ? '+' : ''}${e.modifier}`);
    if (bonuses.length) d.appendChild(el('div', 'fx-muted', `Bonificaciones: ${bonuses.join(', ')}`));
    // Botón.
    if (st === 'avail' || st === 'queued' || st === 'cur') {
      const b = el('button', st === 'avail' ? 'fx-btn' : 'fx-btn alt', st === 'avail' ? 'Investigar (poner en cola)' : 'Quitar de la cola');
      b.addEventListener('click', () => this.send(t.name, st === 'avail'));
      d.appendChild(b);
    }
    return d;
  }
}

// ------------------------------------------------------------------ fabricación a mano

interface QueueEntry {
  plan: HandPlan;
  pool: Map<number, number>;
  step: number;
  progress: number;
  /** Lo que es el resultado (para el icono). */
  out: FRecipe;
  count: number;
}

export interface CraftHost {
  /** Cuántos hay de un objeto en el inventario. */
  count(id: number): number;
  /** Quita hasta n de un objeto. */
  remove(id: number, n: number): void;
  /** Mete objetos en el inventario (lo que no quepa se tira). */
  give(id: number, n: number): void;
  /** Se fabricó algo (cuenta para las tecnologías con disparador). */
  crafted(id: number, n: number): void;
}

export class CraftScreen extends Modal {
  private query = '';
  private selected: FRecipe | null = null;
  private queue: QueueEntry[] = [];

  constructor(private icons: Map<number, string>, private research: ResearchClient, private host: CraftHost) {
    super('craft-screen');
    research.listeners.push(() => this.refresh());
  }

  private stock(): Map<number, number> {
    const m = new Map<number, number>();
    for (const r of factorioRecipes()) for (const n of r.needs) for (const a of n.alts) if (!m.has(a)) m.set(a, this.host.count(a));
    return m;
  }

  /** Las recetas que se pueden hacer a mano y están abiertas. */
  private recipes(): FRecipe[] {
    return factorioRecipes().filter((r) => HAND_CATEGORIES.has(r.category) && this.research.recipeUnlocked(r.name));
  }

  /** Pone en cola `n` fabricaciones (las que se puedan). Devuelve cuántas quedaron. */
  enqueue(r: FRecipe, n: number): number {
    let plan: HandPlan | null = null;
    let made = n;
    const stock = this.stock();
    while (made > 0 && !(plan = planHandCraft(r, made, stock, this.research.recipeUnlocked))) made--;
    if (!plan || made <= 0) return 0;
    for (const [id, c] of plan.reserved) this.host.remove(id, c);
    this.queue.push({ plan, pool: new Map(plan.reserved), step: 0, progress: 0, out: r, count: made });
    this.refresh();
    return made;
  }

  /** Cancela una entrada de la cola y devuelve lo apartado. */
  cancel(i: number): void {
    const e = this.queue[i];
    if (!e) return;
    // Lo que ya se gastó en pasos hechos no vuelve: se devuelve lo que hay en la reserva.
    for (const [id, c] of e.pool) if (c > 0) this.host.give(id, c);
    this.queue.splice(i, 1);
    this.refresh();
  }

  get busy(): boolean {
    return this.queue.length > 0;
  }

  /** Avanza la cola `dt` segundos (velocidad de fabricación a mano 1). */
  update(dt: number): void {
    const e = this.queue[0];
    if (!e) return;
    e.progress += dt;
    let changed = false;
    for (;;) {
      const r = e.plan.steps[e.step];
      if (!r || e.progress < r.time) break;
      e.progress -= r.time;
      runStep(e.pool, r);
      this.host.crafted(r.out.id, r.out.count);
      e.step++;
      changed = true;
    }
    if (e.step >= e.plan.steps.length) {
      for (const [id, c] of e.pool) if (c > 0) this.host.give(id, c);
      this.queue.shift();
      changed = true;
    }
    if (changed || this.isOpen()) this.refresh();
  }

  protected render(): void {
    const p = this.panel;
    p.textContent = '';
    const head = el('div', 'fx-head');
    head.appendChild(el('h3', '', 'Fabricación'));
    const search = el('input');
    search.type = 'search';
    search.placeholder = 'Buscar…';
    search.value = this.query;
    search.addEventListener('input', () => {
      this.query = search.value;
      this.render();
      (this.panel.querySelector('input') as HTMLInputElement).focus();
    });
    head.appendChild(search);
    const close = el('button', 'fx-btn alt', 'Cerrar');
    close.addEventListener('click', () => this.close());
    head.appendChild(close);
    p.appendChild(head);

    const body = el('div', 'fx-body');
    const grid = el('div', 'fx-list');
    const inner = el('div', 'fx-grid');
    const q = this.query.trim().toLowerCase();
    const stock = this.stock();
    for (const r of this.recipes()) {
      if (q && !recipeLabel(r.name).toLowerCase().includes(q) && !(ITEMS[r.out.id]?.name ?? '').toLowerCase().includes(q)) continue;
      const can = !!planHandCraft(r, 1, stock, this.research.recipeUnlocked);
      const s = slot(this.icons, r.out.id, r.out.count, `${ITEMS[r.out.id]?.name}\nClic: 1 · Mayús: 5 · Ctrl: todas las que se puedan`, `${can ? '' : 'off'} ${this.selected === r ? 'sel' : ''}`);
      s.addEventListener('click', (ev) => {
        this.selected = r;
        this.enqueue(r, ev.ctrlKey ? 100 : ev.shiftKey ? 5 : 1);
        this.render();
      });
      s.addEventListener('mouseenter', () => {
        if (this.selected !== r) {
          this.selected = r;
          this.detailBox(body);
        }
      });
      inner.appendChild(s);
    }
    grid.appendChild(inner);
    body.appendChild(grid);
    const d = el('div', 'fx-detail');
    d.id = 'fx-craft-detail';
    body.appendChild(d);
    p.appendChild(body);
    this.detailBox(body);

    // La cola.
    if (this.queue.length) {
      const qrow = el('div', 'fx-row');
      qrow.appendChild(el('span', 'fx-muted', 'Cola (clic para cancelar):'));
      this.queue.forEach((e, i) => {
        const s = slot(this.icons, e.out.out.id, e.count, `${ITEMS[e.out.out.id]?.name} × ${e.count}`);
        if (i === 0) {
          const r = e.plan.steps[e.step];
          s.style.borderColor = '#7ccd4f';
          s.title += r ? `\n${Math.round((e.progress / r.time) * 100)} %` : '';
        }
        s.addEventListener('click', () => this.cancel(i));
        qrow.appendChild(s);
      });
      p.appendChild(qrow);
    }
  }

  private detailBox(body: HTMLElement): void {
    const d = (body.querySelector('#fx-craft-detail') ?? body.lastElementChild) as HTMLElement | null;
    if (!d) return;
    d.textContent = '';
    const r = this.selected;
    if (!r) {
      d.appendChild(el('span', 'fx-muted', 'Pasa el ratón por una receta para ver lo que gasta. Lo que falte y se pueda hacer a mano se fabrica solo.'));
      return;
    }
    d.appendChild(el('h3', '', ITEMS[r.out.id]?.name ?? recipeLabel(r.name)));
    d.appendChild(el('div', 'fx-muted', `Tarda ${fmtTime(r.time)}${r.out.count > 1 ? ` y da ${r.out.count}` : ''}.`));
    const row = el('div', 'fx-icons');
    for (const n of r.needs) {
      const have = n.alts.reduce((s, a) => s + this.host.count(a), 0);
      row.appendChild(slot(this.icons, n.alts[0], n.n, `${ITEMS[n.alts[0]]?.name}: tienes ${have}, pide ${n.n}`, have >= n.n ? '' : 'off'));
    }
    d.appendChild(row);
    const plan = planHandCraft(r, 1, this.stock(), this.research.recipeUnlocked);
    d.appendChild(el('div', 'fx-muted', plan ? `Total a mano: ${fmtTime(planSeconds(plan))}.` : 'Faltan ingredientes que no se pueden fabricar a mano.'));
  }
}
