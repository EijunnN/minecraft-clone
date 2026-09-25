// Pantallas de inventario de supervivencia: inventario con armadura y fabricación 2x2, mesa de
// trabajo (3x3), cofre (y cofre grande), horno (y ahumador y alto horno) y cortapiedras. Reglas de clic de Minecraft: clic izquierdo coge/deja/intercambia,
// derecho reparte o deja de uno en uno, mayúsculas mueve rápido, 1–9 intercambia con la barra,
// F con la mano secundaria y Q suelta. Arrastrar con una pila la reparte (izquierdo a partes
// iguales, derecho de uno en uno) y el doble clic junta en el cursor los objetos iguales. Los cofres y hornos son del servidor: los clics se predicen y se confirman.
import { isBundle, fitsInBundle, bundleInsert, bundleTake, bagWeight, BUNDLE_CAPACITY } from '../../shared/bundles'; // Fase 6.5 (remate)
import { ITEMS, itemName, maxStack, sameKind, type ItemStack } from '../../shared/items';
import { matchRecipe, CRAFT_REMAINDER } from '../../shared/recipes';
import { fireworkCraft } from '../../shared/recipes'; // Fase 6.5 (equipo)
import {
  clickSlot, cloneStack, COOK_TIME, FURNACE_FUEL, FURNACE_IN, FURNACE_OUT, type ContainerState,
} from '../../shared/containers';
import type { ClientMsg, ServerMsg } from '../../shared/protocol';
import type { Inventory } from '../game/Inventory';
import { armorSilhouettes } from './armorBar';
import { stonecutterOptions } from '../../shared/stonecutting';
import './workstations.css';
import { keyLabel, type Keybinds } from '../game/keybinds';
import { itemTooltipHtml } from './itemTooltip';

export type ScreenKind = 'player' | 'table' | 'chest' | 'furnace' | 'stonecutter';

export interface ScreenHost {
  icons: Map<number, string>;
  send(msg: ClientMsg): void;
  /** Tira una pila al suelo delante del jugador. */
  drop(stack: ItemStack): void;
  sound(kind: 'click' | 'craft'): void;
  /** Teclas configuradas (tirar, cambiar de mano). */
  keys(): Keybinds;
}

type SlotRef =
  | { kind: 'inv'; i: number } | { kind: 'grid'; i: number } | { kind: 'out' } | { kind: 'cont'; i: number }
  | { kind: 'armor'; i: number } | { kind: 'off'; i: number };

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
  /** Título de la pantalla del horno (horno, ahumador o alto horno). */
  private title = '';
  /** Huecos del cofre dibujados (27 o 54 en el cofre grande). */
  private chestSlots = 27;
  /** Cortapiedras: opción elegida y la piedra para la que se eligió. */
  private cut = -1;
  private cutInput = 0;
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
  /** Arrastre con una pila en el cursor: botón y huecos por los que pasa (inventario y fabricación). */
  private drag: { btn: number; keys: string[] } | null = null;
  /** Último clic (para el doble clic). */
  private lastClick = { key: '', at: 0 };

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
    // Cortapiedras: elegir qué cortar (los botones se rehacen al cambiar la piedra).
    this.panel.addEventListener('mousedown', (e) => {
      const b = (e.target as HTMLElement).closest('[data-cut]') as HTMLElement | null;
      if (!b || this.kind !== 'stonecutter') return;
      e.preventDefault();
      this.cut = Number(b.dataset.cut);
      this.host.sound('click');
      this.render();
    });
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousemove', (e) => {
      this.mouse = [e.clientX, e.clientY];
      if (this.kind) this.placeCursor();
    });
    window.addEventListener('keydown', (e) => this.onKey(e));
    window.addEventListener('mouseup', () => this.endDrag());
  }

  isOpen(): boolean {
    return this.kind !== null;
  }

  open(kind: ScreenKind, pos: [number, number, number] | null = null, title = ''): void {
    this.kind = kind;
    this.containerPos = pos;
    this.container = null;
    this.title = title;
    this.chestSlots = 27;
    this.cut = -1;
    this.gridSize = kind === 'table' ? 3 : kind === 'stonecutter' ? 1 : 2;
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
    // El cofre grande tiene el doble de huecos: se vuelve a montar la pantalla.
    if (this.kind === 'chest' && c.slots.length !== this.chestSlots) {
      this.chestSlots = c.slots.length;
      this.build();
    }
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
      // Inventario del jugador: la armadura en columna (cabeza arriba) a la izquierda.
      if (kind === 'player') {
        top = `<div class="armor-col">${Array.from({ length: 4 }, (_, i) => `<div class="slot2 armor-slot" data-s="armor:${i}"></div>`).join('')}` +
          `<div class="slot2 off-slot" data-s="off:0" title="Mano secundaria (F)"></div></div>` +
          `<div class="armor-craft">${top}</div>`;
      }
    } else if (kind === 'chest') {
      const n = this.chestSlots;
      top = `<h3>${n > 27 ? 'Cofre grande' : this.title || 'Cofre'}</h3><div class="grid g9">${Array.from({ length: n }, (_, i) => `<div class="slot2" data-s="cont:${i}"></div>`).join('')}</div>`;
    } else if (kind === 'stonecutter') {
      top = `<h3>Cortapiedras</h3><div class="cutter"><div class="slot2" data-s="grid:0"></div>` +
        `<div class="cut-list"></div><div class="arrow"></div><div class="slot2 big" data-s="out"></div></div>`;
    } else {
      top = `<h3>${this.title || 'Horno'}</h3><div class="furnace">` +
        `<div class="fcol"><div class="slot2" data-s="cont:${FURNACE_IN}"></div><div class="flame"><i></i></div>` +
        `<div class="slot2" data-s="cont:${FURNACE_FUEL}"></div></div>` +
        `<div class="arrow prog"><i></i></div><div class="slot2 big" data-s="cont:${FURNACE_OUT}"></div></div>`;
    }
    const keys = this.host.keys();
    this.panel.innerHTML =
      `<div class="inv2-top${kind === 'player' ? ' with-armor' : ''}">${top}</div>` +
      `<h3>Inventario</h3>` +
      `<div class="grid g9">${Array.from({ length: 27 }, (_, i) => `<div class="slot2" data-s="inv:${i + 9}"></div>`).join('')}</div>` +
      `<div class="grid g9 hotrow">${Array.from({ length: 9 }, (_, i) => `<div class="slot2" data-s="inv:${i}"></div>`).join('')}</div>` +
      `<p class="hint">Clic: coger/dejar · Clic derecho: la mitad / de uno en uno · Mayús + clic: mover rápido · 1–9: a la barra · ${keyLabel(keys.swapHands)}: a la otra mano · ${keyLabel(keys.drop)}: tirar · ${keyLabel(keys.inventory)}: cerrar</p>`;
    this.panel.querySelectorAll<HTMLElement>('[data-s]').forEach((el) => {
      const key = el.dataset.s!;
      this.slotEls.set(key, el);
      el.innerHTML = '<div class="ico"></div><span class="cnt"></span><div class="dur"><i></i></div>';
      if (key.startsWith('armor:')) el.style.setProperty('--sil', `url(${armorSilhouettes()[Number(key.slice(6))]})`);
      el.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const ref = this.parseRef(key);
        const btn = e.button === 2 ? 1 : 0;
        if (btn === 0 && !e.shiftKey && this.collect(key)) return;
        // Con algo en el cursor sobre el inventario o la fabricación: puede ser un arrastre.
        if (this.inv.cursor && !e.shiftKey && (ref.kind === 'inv' || ref.kind === 'grid') && !this.isBusy()) {
          this.drag = { btn, keys: [key] };
          el.classList.add('drag');
          return;
        }
        this.onSlotClick(ref, btn, e.shiftKey);
        this.lastClick = { key, at: performance.now() };
      });
      el.addEventListener('mouseenter', () => {
        this.hovered = this.parseRef(key);
        this.extendDrag(key, el);
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
    return { kind: k as 'inv' | 'grid' | 'cont' | 'armor' | 'off', i: Number(n) };
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
      case 'armor':
        return this.inv.armor[r.i];
      case 'off':
        return this.inv.offhand;
    }
  }

  private result(): ItemStack | null {
    if (this.kind === 'stonecutter') {
      const opt = this.cutOptions()[this.cut];
      return opt ? { ...opt } : null;
    }
    if (this.kind !== 'player' && this.kind !== 'table') return null;
    // Fase 6.5 (equipo): los fuegos artificiales miran las pilas (los colores de las estrellas).
    const fw = fireworkCraft(this.grid);
    if (fw) return fw;
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
    else if (r.kind === 'off') {
      // Mano secundaria: coge/deja como un hueco más; con mayúsculas vuelve al inventario.
      if (shift) this.inv.offhand = this.inv.add(this.inv.offhand);
      else {
        const fake: ContainerState = { kind: 'chest', slots: [this.inv.offhand], burn: 0, burnMax: 0, cook: 0 };
        this.inv.cursor = clickSlot(fake, 0, btn, this.inv.cursor);
        this.inv.offhand = fake.slots[0];
      }
    } else if (r.kind === 'armor') {
      // Mayúsculas: devolver la pieza al inventario; si no, coger, dejar o intercambiar.
      if (shift) this.inv.unequip(r.i);
      else this.inv.clickArmor(r.i);
    } else if (shift) this.quickMove(r);
    else {
      const arr = r.kind === 'inv' ? this.inv.slots : this.grid;
      // Fase 6.5 (remate): clic derecho con sacos (meter o sacar).
      if (btn === 1 && this.bundleClick(arr, r.i)) {
        this.inv.changed();
        this.render();
        return;
      }
      const fake: ContainerState = { kind: 'chest', slots: arr, burn: 0, burnMax: 0, cook: 0 };
      this.inv.cursor = clickSlot(fake, r.i, btn, this.inv.cursor);
    }
    this.inv.changed();
    this.render();
  }

  /**
   * Fase 6.5 (remate): clic derecho con sacos. Con un saco en el cursor, se mete en él la pila del hueco
   * (o, si el hueco está vacío, sale al hueco la última pila del saco). Sobre un saco: se mete la pila
   * del cursor o, con el cursor vacío, sale la última. Devuelve si hizo algo.
   */
  private bundleClick(arr: (ItemStack | null)[], i: number): boolean {
    const slot = arr[i], cur = this.inv.cursor;
    if (cur && isBundle(cur.id)) {
      if (slot && fitsInBundle(slot)) {
        const rest = bundleInsert(cur, slot);
        if (rest && rest.count === slot.count) return false;
        arr[i] = rest;
        return true;
      }
      if (!slot) {
        const out = bundleTake(cur);
        if (!out) return false;
        arr[i] = out;
        return true;
      }
      return false;
    }
    if (slot && isBundle(slot.id)) {
      if (cur && fitsInBundle(cur)) {
        const rest = bundleInsert(slot, cur);
        if (rest && rest.count === cur.count) return false;
        this.inv.cursor = rest;
        return true;
      }
      if (!cur) {
        const out = bundleTake(slot);
        if (!out) return false;
        this.inv.cursor = out;
        return true;
      }
    }
    return false;
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
    // Fase 6.5 (remate): al teñir un saco, se queda con lo que llevaba.
    if (isBundle(res.id)) {
      const old = this.grid.find((g) => g && isBundle(g.id) && g.bag?.length);
      if (old) res.bag = cloneStack(old)!.bag;
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
    // En el inventario del jugador, una pieza de armadura va a su ranura si está libre.
    if (this.kind === 'player' && this.inv.equipFromSlot(r.i, false)) return;
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

  /** Pila de un hueco local del inventario o de la fabricación (para arrastrar). */
  private localArray(r: SlotRef): (ItemStack | null)[] | null {
    return r.kind === 'inv' ? this.inv.slots : r.kind === 'grid' ? this.grid : null;
  }

  /** El arrastre pasa por otro hueco: se añade si acepta la pila del cursor. */
  private extendDrag(key: string, el: HTMLElement): void {
    const d = this.drag, cur = this.inv.cursor;
    if (!d || !cur || d.keys.includes(key)) return;
    const r = this.parseRef(key);
    const arr = this.localArray(r);
    if (!arr || r.kind === 'out') return;
    const s = arr[r.i];
    if (s && !(sameKind(s, cur) && s.count < maxStack(s.id))) return;
    if (d.keys.length >= cur.count && d.btn === 0) return;
    d.keys.push(key);
    el.classList.add('drag');
  }

  /** Suelta el arrastre: un solo hueco es un clic normal; varios, el reparto. */
  private endDrag(): void {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    for (const k of d.keys) this.slotEls.get(k)?.classList.remove('drag');
    if (d.keys.length === 1 || !this.inv.cursor) {
      this.onSlotClick(this.parseRef(d.keys[0]), d.btn, false);
      this.lastClick = { key: d.keys[0], at: performance.now() };
      return;
    }
    const cur = this.inv.cursor;
    const per = d.btn === 0 ? Math.floor(cur.count / d.keys.length) : 1;
    for (const key of d.keys) {
      if (cur.count <= 0) break;
      const r = this.parseRef(key);
      const arr = this.localArray(r)!;
      const i = (r as { i: number }).i;
      const s = arr[i];
      const n = Math.min(per, cur.count, maxStack(cur.id) - (s?.count ?? 0));
      if (n <= 0) continue;
      arr[i] = s ? { ...s, count: s.count + n } : { ...cur, count: n };
      cur.count -= n;
    }
    this.inv.cursor = cur.count > 0 ? cur : null;
    this.host.sound('click');
    this.inv.changed();
    this.render();
  }

  /** Doble clic con una pila en el cursor: junta en ella los objetos iguales del inventario. */
  private collect(key: string): boolean {
    const cur = this.inv.cursor;
    const dbl = this.lastClick.key === key && performance.now() - this.lastClick.at < 300;
    this.lastClick = { key: '', at: 0 };
    if (!dbl || !cur || this.isBusy()) return false;
    const max = maxStack(cur.id);
    for (const arr of [this.inv.slots, this.grid]) {
      for (let i = 0; i < arr.length && cur.count < max; i++) {
        const s = arr[i];
        if (!s || !sameKind(s, cur)) continue;
        const n = Math.min(max - cur.count, s.count);
        cur.count += n;
        arr[i] = s.count - n > 0 ? { ...s, count: s.count - n } : null;
      }
    }
    this.host.sound('click');
    this.inv.changed();
    this.render();
    return true;
  }

  private onKey(e: KeyboardEvent): void {
    if (!this.kind || !this.hovered || this.isBusy()) return;
    const r = this.hovered;
    if (r.kind !== 'inv' && r.kind !== 'grid') return;
    const arr = r.kind === 'inv' ? this.inv.slots : this.grid;
    const n = Number(e.key);
    const keys = this.host.keys();
    if (e.code === keys.swapHands && r.kind === 'inv') this.inv.swapOffhand(r.i);
    else if (n >= 1 && n <= 9) {
      const h = n - 1;
      if (r.kind === 'inv' && r.i === h) return;
      const tmp = arr[r.i];
      arr[r.i] = this.inv.slots[h];
      this.inv.slots[h] = tmp;
    } else if (e.code === keys.drop) {
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
    for (const [key, el] of this.slotEls) {
      const s = this.stackAt(this.parseRef(key));
      this.paint(el, s);
      if (key.startsWith('armor:')) el.classList.toggle('empty', !s);
    }
    if (this.kind === 'furnace') {
      const c = this.container;
      const flame = this.panel.querySelector('.flame i') as HTMLElement | null;
      const prog = this.panel.querySelector('.prog i') as HTMLElement | null;
      if (flame) flame.style.height = `${c && c.burnMax > 0 ? Math.round((c.burn / c.burnMax) * 100) : 0}%`;
      if (prog) prog.style.width = `${c ? Math.round((c.cook / COOK_TIME) * 100) : 0}%`;
    }
    if (this.kind === 'stonecutter') this.renderCuts();
    const out = this.slotEls.get('out');
    if (out) out.classList.toggle('ready', !!this.result());
    this.placeCursor();
    if (this.hovered) this.showTooltip();
  }

  /** Opciones del cortapiedras para la piedra puesta (si cambia la piedra, se deselecciona). */
  private cutOptions(): readonly ItemStack[] {
    const id = this.grid[0]?.id ?? 0;
    if (id !== this.cutInput) {
      this.cutInput = id;
      this.cut = -1;
    }
    return id ? stonecutterOptions(id) : [];
  }

  /** Botones de lo que se puede cortar (se eligen con clic). */
  private renderCuts(): void {
    const list = this.panel.querySelector('.cut-list') as HTMLElement | null;
    if (!list) return;
    const opts = this.cutOptions();
    const key = opts.map((o) => o.id).join(',') + '|' + this.cut;
    if (list.dataset.key === key) return;
    list.dataset.key = key;
    list.innerHTML = opts.map((o, i) => {
      const url = this.host.icons.get(o.id);
      return `<div class="cut${i === this.cut ? ' sel' : ''}" data-cut="${i}" title="${itemName(o.id)}">` +
        `<i style="background-image:url(${url ?? ''})"></i>${o.count > 1 ? `<span>${o.count}</span>` : ''}</div>`;
    }).join('');
  }

  private paint(el: HTMLElement, s: ItemStack | null): void {
    const ico = el.firstElementChild as HTMLElement;
    const cnt = el.children[1] as HTMLElement;
    const dur = el.children[2] as HTMLElement;
    const url = s ? this.host.icons.get(s.id) : undefined;
    ico.style.backgroundImage = url ? `url(${url})` : '';
    cnt.textContent = s && s.count > 1 ? String(s.count) : '';
    const max = s ? ITEMS[s.id]?.tool?.durability ?? ITEMS[s.id]?.armor?.durability : undefined;
    if (s && max && s.dmg) {
      const f = Math.max(0, 1 - s.dmg / max);
      dur.style.display = '';
      const bar = dur.firstElementChild as HTMLElement;
      bar.style.width = `${Math.round(f * 100)}%`;
      bar.style.background = `hsl(${Math.round(f * 120)}, 90%, 50%)`;
    } else if (s && isBundle(s.id) && s.bag?.length) {
      // Fase 6.5 (remate): lo lleno que está el saco (azul; rojo si no cabe más).
      const f = Math.min(1, bagWeight(s.bag) / BUNDLE_CAPACITY);
      dur.style.display = '';
      const bar = dur.firstElementChild as HTMLElement;
      bar.style.width = `${Math.round(f * 100)}%`;
      bar.style.background = f >= 1 ? '#e8503a' : '#6aa8ff';
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
    this.tooltip.innerHTML = itemTooltipHtml(s);
    this.tooltip.classList.remove('hidden');
    this.tooltip.style.left = `${this.mouse[0] + 14}px`;
    this.tooltip.style.top = `${this.mouse[1] + 14}px`;
  }
}
