// Pantallas de inventario de supervivencia: inventario con fabricación 2x2, mesa de trabajo
// (3x3), cofre y horno. Reglas de clic de Minecraft: clic izquierdo coge/deja/intercambia,
// derecho reparte o deja de uno en uno, mayúsculas mueve rápido, 1–9 intercambia con la barra
// y Q suelta. Los cofres y hornos son del servidor: los clics se predicen y se confirman.
import { ITEMS, itemName, maxStack, sameKind, type ItemStack } from '../../shared/items';
import { matchRecipe, CRAFT_REMAINDER } from '../../shared/recipes';
import {
  clickSlot, cloneStack, COOK_TIME, FURNACE_FUEL, FURNACE_IN, FURNACE_OUT, type ContainerState,
} from '../../shared/containers';
import type { ClientMsg, ServerMsg } from '../../shared/protocol';
import type { Inventory } from '../game/Inventory';

export type ScreenKind = 'player' | 'table' | 'chest' | 'furnace';

export interface ScreenHost {
  icons: Map<number, string>;
  send(msg: ClientMsg): void;
  /** Tira una pila al suelo delante del jugador. */
  drop(stack: ItemStack): void;
  sound(kind: 'click' | 'craft'): void;
}

type SlotRef = { kind: 'inv'; i: number } | { kind: 'grid'; i: number } | { kind: 'out' } | { kind: 'cont'; i: number };

const $ = (sel: string) => document.querySelector(sel) as HTMLElement;

export class InventoryScreen {
  private host: ScreenHost;
  private inv: Inventory;
  kind: ScreenKind | null = null;
  /** Contenedor abierto (copia local, predicha) y su posición. */
  container: ContainerState | null = null;
  containerPos: [number, number, number] | null = null;
  private grid: (ItemStack | null)[] = [];
  private gridSize = 2;
  private root: HTMLElement;
  private panel: HTMLElement;
  private cursorEl: HTMLElement;
  private tooltip: HTMLElement;
  private slotEls = new Map<string, HTMLElement>();
  private hovered: SlotRef | null = null;
  /** Operación de contenedor esperando respuesta (bloquea los clics mientras la pantalla está abierta). */
  private busy = 0;
  private busyAt = 0;
  private seq = 1;
  /**
   * Operaciones enviadas al servidor por número de secuencia. Su respuesta se aplica aunque la
   * pantalla ya se haya cerrado (así cerrar deprisa no pierde ni duplica objetos).
   */
  private pending = new Map<number, { kind: 'click' | 'put' | 'take'; at: number; slot: number; stack: ItemStack | null }>();
  private mouse = [0, 0];

  constructor(host: ScreenHost, inv: Inventory) {
    this.host = host;
    this.inv = inv;
    this.root = $('#invscreen');
    this.panel = $('#invscreen .inv2');
    this.cursorEl = $('#cursor-stack');
    this.tooltip = document.createElement('div');
    this.tooltip.className = 'tooltip hidden';
    document.body.appendChild(this.tooltip);
    this.root.addEventListener('mousedown', (e) => {
      if (e.target === this.root && this.inv.cursor) {
        // Clic fuera del panel: tirar lo que hay en el cursor (derecho: sólo uno).
        const c = this.inv.cursor;
        if (e.button === 2 && c.count > 1) {
          this.host.drop({ ...c, count: 1 });
          c.count--;
        } else {
          this.host.drop(c);
          this.inv.cursor = null;
        }
        this.inv.changed();
        this.render();
      }
    });
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousemove', (e) => {
      this.mouse = [e.clientX, e.clientY];
      if (this.kind) this.placeCursor();
    });
    window.addEventListener('keydown', (e) => this.onKey(e));
  }

  isOpen(): boolean {
    return this.kind !== null;
  }

  open(kind: ScreenKind, pos: [number, number, number] | null = null): void {
    this.kind = kind;
    this.containerPos = pos;
    this.container = null;
    this.gridSize = kind === 'table' ? 3 : 2;
    this.grid = new Array(this.gridSize * this.gridSize).fill(null);
    this.busy = 0;
    this.build();
    this.root.classList.remove('hidden');
    this.render();
  }

  /** Cierra y devuelve al inventario lo que quedó en la cuadrícula y el cursor. */
  close(): void {
    if (!this.kind) return;
    this.busy = 0;
    if (this.container) this.host.send({ t: 'close' });
    for (const s of this.grid) this.giveOrDrop(s);
    this.grid = [];
    this.giveOrDrop(this.inv.cursor);
    this.inv.cursor = null;
    this.inv.changed();
    this.kind = null;
    this.container = null;
    this.containerPos = null;
    this.root.classList.add('hidden');
    this.tooltip.classList.add('hidden');
    this.cursorEl.classList.add('hidden');
  }

  private giveOrDrop(s: ItemStack | null): void {
    if (!s) return;
    const rest = this.inv.add(s);
    if (rest) this.host.drop(rest);
  }

  // ---------------------------------------------------------------- mensajes del servidor

  onServer(msg: ServerMsg): void {
    if (msg.t === 'cres') {
      const p = this.pending.get(msg.q);
      if (!p) return;
      this.pending.delete(msg.q);
      const give = cloneStack(msg.give);
      if (p.kind === 'click') {
        // El cursor del servidor manda (si la pantalla sigue abierta con ese clic en curso).
        if (this.kind && this.busy === msg.q && msg.cur !== undefined) this.inv.cursor = cloneStack(msg.cur);
      } else if (p.kind === 'put') {
        // Lo que no cupo vuelve a su ranura (o a donde quepa).
        if (give && !this.inv.slots[p.slot]) this.inv.slots[p.slot] = give;
        else this.giveOrDrop(give);
      } else this.giveOrDrop(give);
      if (this.busy === msg.q) this.busy = 0;
      this.inv.changed();
      this.render();
    } else if (msg.t === 'cclose') {
      if (this.kind === 'chest' || this.kind === 'furnace') this.close();
    }
  }

  /** Contenido autoritativo del contenedor abierto. */
  setContainer(c: ContainerState): void {
    // Esperando la confirmación de un clic: el servidor envía el estado nuevo justo después.
    if (this.isBusy()) return;
    this.container = c;
    this.render();
  }

  // ---------------------------------------------------------------- construcción

  private build(): void {
    this.slotEls.clear();
    const kind = this.kind!;
    let top = '';
    if (kind === 'player' || kind === 'table') {
      const n = this.gridSize;
      top = `<h3>${kind === 'table' ? 'Mesa de trabajo' : 'Fabricación'}</h3><div class="craft">` +
        `<div class="grid g${n}">${Array.from({ length: n * n }, (_, i) => `<div class="slot2" data-s="grid:${i}"></div>`).join('')}</div>` +
        `<div class="arrow"></div><div class="slot2 big" data-s="out"></div></div>`;
    } else if (kind === 'chest') {
      top = `<h3>Cofre</h3><div class="grid g9">${Array.from({ length: 27 }, (_, i) => `<div class="slot2" data-s="cont:${i}"></div>`).join('')}</div>`;
    } else {
      top = `<h3>Horno</h3><div class="furnace">` +
        `<div class="fcol"><div class="slot2" data-s="cont:${FURNACE_IN}"></div><div class="flame"><i></i></div>` +
        `<div class="slot2" data-s="cont:${FURNACE_FUEL}"></div></div>` +
        `<div class="arrow prog"><i></i></div><div class="slot2 big" data-s="cont:${FURNACE_OUT}"></div></div>`;
    }
    this.panel.innerHTML =
      `<div class="inv2-top">${top}</div>` +
      `<h3>Inventario</h3>` +
      `<div class="grid g9">${Array.from({ length: 27 }, (_, i) => `<div class="slot2" data-s="inv:${i + 9}"></div>`).join('')}</div>` +
      `<div class="grid g9 hotrow">${Array.from({ length: 9 }, (_, i) => `<div class="slot2" data-s="inv:${i}"></div>`).join('')}</div>` +
      `<p class="hint">Clic: coger/dejar · Clic derecho: la mitad / de uno en uno · Mayús + clic: mover rápido · 1–9: a la barra · Q: tirar · E: cerrar</p>`;
    this.panel.querySelectorAll<HTMLElement>('[data-s]').forEach((el) => {
      const key = el.dataset.s!;
      this.slotEls.set(key, el);
      el.innerHTML = '<div class="ico"></div><span class="cnt"></span><div class="dur"><i></i></div>';
      el.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.onSlotClick(this.parseRef(key), e.button === 2 ? 1 : 0, e.shiftKey);
      });
      el.addEventListener('mouseenter', () => {
        this.hovered = this.parseRef(key);
        this.showTooltip();
      });
      el.addEventListener('mouseleave', () => {
        this.hovered = null;
        this.tooltip.classList.add('hidden');
      });
    });
  }

  private parseRef(key: string): SlotRef {
    if (key === 'out') return { kind: 'out' };
    const [k, n] = key.split(':');
    return { kind: k as 'inv' | 'grid' | 'cont', i: Number(n) };
  }

  // ---------------------------------------------------------------- lectura de ranuras

  private stackAt(r: SlotRef): ItemStack | null {
    switch (r.kind) {
      case 'inv':
        return this.inv.slots[r.i];
      case 'grid':
        return this.grid[r.i];
      case 'out':
        return this.result();
      case 'cont':
        return this.container?.slots[r.i] ?? null;
    }
  }

  private result(): ItemStack | null {
    if (this.kind !== 'player' && this.kind !== 'table') return null;
    const m = matchRecipe(this.grid.map((s) => (s ? s.id : 0)), this.gridSize);
    return m ? m.out : null;
  }

  // ---------------------------------------------------------------- clics

  private isBusy(): boolean {
    this.expirePending();
    return this.busy !== 0;
  }

  /**
   * Operaciones sin respuesta tras 5 s (conexión perdida): lo enviado al contenedor vuelve al
   * inventario. Llamar a menudo (también con la pantalla cerrada).
   */
  expirePending(): void {
    if (this.pending.size === 0) return;
    const now = performance.now();
    for (const [q, p] of this.pending) {
      if (now - p.at < 5000) continue;
      this.pending.delete(q);
      if (p.kind === 'put' && p.stack) {
        if (!this.inv.slots[p.slot]) this.inv.slots[p.slot] = p.stack;
        else this.giveOrDrop(p.stack);
        this.inv.changed();
      }
      if (this.busy === q) this.busy = 0;
    }
  }

  private track(q: number, kind: 'click' | 'put' | 'take', slot = -1, stack: ItemStack | null = null): void {
    this.busy = q;
    this.busyAt = performance.now();
    this.pending.set(q, { kind, at: this.busyAt, slot, stack });
  }

  private onSlotClick(r: SlotRef, btn: number, shift: boolean): void {
    if (this.isBusy()) return;
    this.host.sound('click');
    if (r.kind === 'out') this.clickOutput(shift);
    else if (r.kind === 'cont') this.clickContainer(r.i, btn, shift);
    else if (shift) this.quickMove(r);
    else {
      const arr = r.kind === 'inv' ? this.inv.slots : this.grid;
      const fake: ContainerState = { kind: 'chest', slots: arr, burn: 0, burnMax: 0, cook: 0 };
      this.inv.cursor = clickSlot(fake, r.i, btn, this.inv.cursor);
    }
    this.inv.changed();
    this.render();
  }

  private clickOutput(shift: boolean): void {
    const res = this.result();
    if (!res) return;
    if (shift) {
      // Fabricar todo lo posible directamente al inventario.
      for (let n = 0; n < 64; n++) {
        const r = this.result();
        if (!r || this.inv.room(r) < r.count) break;
        this.inv.add(r);
        this.consumeGrid();
      }
      this.host.sound('craft');
      return;
    }
    const cur = this.inv.cursor;
    if (!cur) this.inv.cursor = { ...res };
    else if (sameKind(cur, res) && cur.count + res.count <= maxStack(res.id)) cur.count += res.count;
    else return;
    this.consumeGrid();
    this.host.sound('craft');
  }

  private consumeGrid(): void {
    for (let i = 0; i < this.grid.length; i++) {
      const s = this.grid[i];
      if (!s) continue;
      s.count--;
      if (s.count <= 0) {
        const rest = CRAFT_REMAINDER[s.id];
        this.grid[i] = rest ? { id: rest, count: 1 } : null;
      }
    }
  }

  /** Mayúsculas + clic sobre el inventario o la cuadrícula. */
  private quickMove(r: SlotRef): void {
    const s = this.stackAt(r);
    if (!s) return;
    if (r.kind === 'grid') {
      this.grid[r.i] = this.inv.add(s);
      return;
    }
    if (r.kind !== 'inv') return;
    if (this.container && this.containerPos) {
      // Del inventario al contenedor (lo confirma el servidor).
      const q = this.seq++;
      this.track(q, 'put', r.i, s);
      this.inv.slots[r.i] = null;
      const [x, y, z] = this.containerPos;
      this.host.send({ t: 'cput', x, y, z, stack: s, q });
      return;
    }
    this.inv.slots[r.i] = null;
    const rest = r.i < 9 ? this.inv.addRange(s, 9, 36) : this.inv.addRange(s, 0, 9);
    if (rest) this.inv.slots[r.i] = rest;
  }

  private clickContainer(i: number, btn: number, shift: boolean): void {
    if (!this.container || !this.containerPos) return;
    const [x, y, z] = this.containerPos;
    const q = this.seq++;
    if (shift) {
      const s = this.container.slots[i];
      if (!s) return;
      const max = this.inv.room(s);
      if (max <= 0) return;
      this.track(q, 'take');
      this.host.send({ t: 'ctake', x, y, z, slot: i, max, q });
      return;
    }
    const before = cloneStack(this.inv.cursor);
    // Predicción local con las mismas reglas que el servidor.
    this.inv.cursor = clickSlot(this.container, i, btn, this.inv.cursor);
    this.track(q, 'click');
    this.host.send({ t: 'cclick', x, y, z, slot: i, btn, cur: before, q });
  }

  private onKey(e: KeyboardEvent): void {
    if (!this.kind || !this.hovered || this.isBusy()) return;
    const r = this.hovered;
    if (r.kind !== 'inv' && r.kind !== 'grid') return;
    const arr = r.kind === 'inv' ? this.inv.slots : this.grid;
    const n = Number(e.key);
    if (n >= 1 && n <= 9) {
      const h = n - 1;
      if (r.kind === 'inv' && r.i === h) return;
      const tmp = arr[r.i];
      arr[r.i] = this.inv.slots[h];
      this.inv.slots[h] = tmp;
    } else if (e.code === 'KeyQ') {
      const s = arr[r.i];
      if (!s) return;
      if (e.ctrlKey || s.count === 1) {
        this.host.drop(s);
        arr[r.i] = null;
      } else {
        this.host.drop({ ...s, count: 1 });
        s.count--;
      }
    } else return;
    this.inv.changed();
    this.render();
  }

  // ---------------------------------------------------------------- dibujo

  render(): void {
    if (!this.kind) return;
    for (const [key, el] of this.slotEls) this.paint(el, this.stackAt(this.parseRef(key)));
    if (this.kind === 'furnace') {
      const c = this.container;
      const flame = this.panel.querySelector('.flame i') as HTMLElement | null;
      const prog = this.panel.querySelector('.prog i') as HTMLElement | null;
      if (flame) flame.style.height = `${c && c.burnMax > 0 ? Math.round((c.burn / c.burnMax) * 100) : 0}%`;
      if (prog) prog.style.width = `${c ? Math.round((c.cook / COOK_TIME) * 100) : 0}%`;
    }
    const out = this.slotEls.get('out');
    if (out) out.classList.toggle('ready', !!this.result());
    this.placeCursor();
    if (this.hovered) this.showTooltip();
  }

  private paint(el: HTMLElement, s: ItemStack | null): void {
    const ico = el.firstElementChild as HTMLElement;
    const cnt = el.children[1] as HTMLElement;
    const dur = el.children[2] as HTMLElement;
    const url = s ? this.host.icons.get(s.id) : undefined;
    ico.style.backgroundImage = url ? `url(${url})` : '';
    cnt.textContent = s && s.count > 1 ? String(s.count) : '';
    const tool = s ? ITEMS[s.id]?.tool : undefined;
    if (s && tool && s.dmg) {
      const f = Math.max(0, 1 - s.dmg / tool.durability);
      dur.style.display = '';
      const bar = dur.firstElementChild as HTMLElement;
      bar.style.width = `${Math.round(f * 100)}%`;
      bar.style.background = `hsl(${Math.round(f * 120)}, 90%, 50%)`;
    } else dur.style.display = 'none';
  }

  private placeCursor(): void {
    const c = this.inv.cursor;
    const el = this.cursorEl;
    if (!c || !this.kind) {
      el.classList.add('hidden');
      return;
    }
    el.classList.remove('hidden');
    const url = this.host.icons.get(c.id);
    (el.firstElementChild as HTMLElement).style.backgroundImage = url ? `url(${url})` : '';
    (el.children[1] as HTMLElement).textContent = c.count > 1 ? String(c.count) : '';
    el.style.left = `${this.mouse[0]}px`;
    el.style.top = `${this.mouse[1]}px`;
  }

  private showTooltip(): void {
    const s = this.hovered ? this.stackAt(this.hovered) : null;
    if (!s || this.inv.cursor) {
      this.tooltip.classList.add('hidden');
      return;
    }
    const tool = ITEMS[s.id]?.tool;
    const food = ITEMS[s.id]?.food;
    let extra = '';
    if (tool && tool.durability) extra = ` · ${tool.durability - (s.dmg ?? 0)}/${tool.durability}`;
    else if (food) extra = ` · +${food.hunger / 2} 🍗`;
    this.tooltip.textContent = itemName(s.id) + extra;
    this.tooltip.classList.remove('hidden');
    this.tooltip.style.left = `${this.mouse[0] + 14}px`;
    this.tooltip.style.top = `${this.mouse[1] + 14}px`;
  }
}
