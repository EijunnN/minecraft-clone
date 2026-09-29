// Programa lunar: la investigación (Factorio, FACTORIO-REFERENCIA.md §6). Es de TODO el mundo (se comparte entre dimensiones): qué
// tecnologías están investigadas, la cola, cuánto lleva la actual y cuántos objetos se han fabricado (para las que se abren al fabricar algo).
//
// - Una tecnología se investiga en los laboratorios (labs.ts): cada unidad gasta sus paquetes de ciencia y `time` segundos; a las `count`
//   unidades queda hecha. Las que tienen un disparador (`research_trigger: craft-item`) se completan solas al fabricar lo pedido.
// - Investigar desbloquea recetas (las de Factorio, por nombre) y da bonificaciones (velocidad de laboratorio, tamaño de mano de los brazos…).
// - Se guarda en los metadatos compartidos 'research'; al cambiar en una dimensión, las demás lo recargan.
import { TECHS, techByName, techAvailable, baseRecipes, type Tech } from '../../factorio/research';
import { factorioNameOf } from '../../factorio/catalog';
import type { ServerStore } from '../store';
import type { ServerContext } from './context';

interface Saved {
  done: string[];
  queue: string[];
  progress: number;
  produced: Record<string, number>;
}

/** Bonificaciones que cambian el juego (suma de los `modifier` de las tecnologías hechas). */
export type Modifier = 'laboratory-speed' | 'inserter-stack-size-bonus' | 'bulk-inserter-capacity-bonus' | 'mining-drill-productivity-bonus';

export class Research {
  private done = new Set<string>();
  private queue: string[] = [];
  private progress = 0;
  private produced = new Map<string, number>();
  private recipes = new Set<string>(baseRecipes());
  /** Quien quiera enterarse de que cambió (los brazos, los laboratorios…). */
  onChange: (() => void)[] = [];

  constructor(private ctx: ServerContext, private store: ServerStore) {
    this.load();
  }

  private load(): void {
    this.done.clear();
    this.queue = [];
    this.progress = 0;
    this.produced.clear();
    try {
      const raw = JSON.parse(this.store.getMeta('research') ?? '{}') as Partial<Saved>;
      for (const n of raw.done ?? []) if (techByName(n)) this.done.add(n);
      this.queue = (raw.queue ?? []).filter((n) => techByName(n) && !this.done.has(n));
      this.progress = Math.max(0, Number(raw.progress) || 0);
      for (const [k, v] of Object.entries(raw.produced ?? {})) this.produced.set(k, Number(v) || 0);
    } catch {
      /* mundo sin investigación guardada */
    }
    this.rebuild();
  }

  private rebuild(): void {
    this.recipes = new Set(baseRecipes());
    for (const n of this.done) for (const r of techByName(n)?.unlocks ?? []) this.recipes.add(r);
  }

  private dirty = false;

  /** Guarda lo fabricado (se llama con el guardado normal del mundo). */
  flush(): void {
    if (this.dirty) this.save();
  }

  private save(): void {
    this.dirty = false;
    const s: Saved = { done: [...this.done], queue: this.queue, progress: Math.round(this.progress * 1000) / 1000, produced: Object.fromEntries(this.produced) };
    this.store.setMeta('research', JSON.stringify(s));
  }

  /** Otra dimensión cambió la investigación: se recarga y se avisa a los jugadores de esta. */
  reload(): void {
    this.load();
    this.broadcast();
    for (const f of this.onChange) f();
  }

  // ------------------------------------------------------------------ consulta

  isDone(name: string): boolean {
    return this.done.has(name);
  }

  /** ¿Está desbloqueada la receta de Factorio `name`? */
  recipeUnlocked(name: string): boolean {
    return this.recipes.has(name);
  }

  get current(): Tech | undefined {
    return this.queue.length ? techByName(this.queue[0]) : undefined;
  }

  get queued(): readonly string[] {
    return this.queue;
  }

  get units(): number {
    return this.progress;
  }

  /** Suma de la bonificación `type` de todo lo investigado. */
  modifier(type: Modifier): number {
    let sum = 0;
    for (const n of this.done) for (const e of techByName(n)?.effects ?? []) if (e.type === type && typeof e.modifier === 'number') sum += e.modifier;
    return sum;
  }

  /** Estado que ven los jugadores. */
  view(): { done: string[]; queue: string[]; progress: number } {
    return { done: [...this.done], queue: this.queue.slice(), progress: Math.round(this.progress * 100) / 100 };
  }

  // ------------------------------------------------------------------ cambios

  /** Pone en la cola una tecnología (o la quita, `add` falso). Devuelve si cambió algo. */
  request(name: string, add: boolean): boolean {
    const t = techByName(name);
    if (!t || !t.unit) return false;
    if (!add) {
      const i = this.queue.indexOf(name);
      if (i < 0) return false;
      this.queue.splice(i, 1);
      if (i === 0) this.progress = 0;
      this.changed();
      return true;
    }
    if (this.queue.includes(name)) return false;
    // Se puede encolar si sus prerrequisitos están hechos o ya en cola (delante).
    const ahead = new Set([...this.done, ...this.queue]);
    if (!techAvailable(name, ahead)) return false;
    this.queue.push(name);
    this.changed();
    return true;
  }

  /** Da por investigada una tecnología (y las que necesita). Para /investigar y las pruebas. */
  grant(name: string): boolean {
    const t = techByName(name);
    if (!t) return false;
    const stack = [t];
    while (stack.length) {
      const x = stack.pop()!;
      if (this.done.has(x.name)) continue;
      this.done.add(x.name);
      this.queue = this.queue.filter((n) => n !== x.name);
      if (this.progress && this.queue.length === 0) this.progress = 0;
      for (const r of x.unlocks) this.recipes.add(r);
      for (const p of x.prerequisites) {
        const pt = techByName(p);
        if (pt) stack.push(pt);
      }
    }
    this.changed();
    return true;
  }

  /** Da por investigada TODA la ciencia. */
  grantAll(): void {
    for (const t of TECHS) this.grant(t.name);
  }

  /** Un laboratorio terminó una unidad de la tecnología actual. */
  addUnit(): void {
    const t = this.current;
    if (!t?.unit) return;
    this.progress += 1;
    if (this.progress >= t.unit.count) this.complete(t);
    else this.changed();
  }

  private complete(t: Tech): void {
    this.done.add(t.name);
    this.queue = this.queue.filter((n) => n !== t.name);
    this.progress = 0;
    for (const r of t.unlocks) this.recipes.add(r);
    this.changed();
    this.ctx.broadcast({ t: 'chat', id: null, name: '', m: `Investigación terminada: ${t.name}.` });
    this.checkTriggers();
  }

  /** Se fabricó `count` de un objeto (a mano, en una ensambladora o en un horno): cuenta para las tecnologías con disparador. */
  noteProduced(item: number, count: number): void {
    const name = factorioNameOf(item);
    if (!name || count <= 0) return;
    this.produced.set(name, (this.produced.get(name) ?? 0) + count);
    this.dirty = true;
    this.checkTriggers();
  }

  private checkTriggers(): void {
    let any = false;
    for (let again = true; again; ) {
      again = false;
      for (const t of TECHS) {
        if (!t.trigger || this.done.has(t.name) || t.trigger.type !== 'craft-item' || !t.prerequisites.every((p) => this.done.has(p))) continue;
        if ((this.produced.get(t.trigger.item ?? '') ?? 0) < (t.trigger.count ?? 1)) continue;
        this.done.add(t.name);
        for (const r of t.unlocks) this.recipes.add(r);
        this.ctx.broadcast({ t: 'chat', id: null, name: '', m: `Investigación terminada: ${t.name}.` });
        again = true;
        any = true;
      }
    }
    if (any) this.changed();
  }

  private changed(): void {
    this.save();
    this.broadcast();
    for (const f of this.onChange) f();
    this.ctx.sharedChanged();
  }

  // ------------------------------------------------------------------ envío

  broadcast(): void {
    const v = this.view();
    for (const s of this.ctx.sessions()) if (s.joined) this.ctx.send(s, { t: 'research', ...v });
  }

  sendTo(s: Parameters<ServerContext['send']>[0]): void {
    this.ctx.send(s, { t: 'research', ...this.view() });
  }
}
