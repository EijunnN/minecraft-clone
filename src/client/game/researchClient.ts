// Programa lunar: lo que el cliente sabe de la investigación (la manda el servidor: 'research'): qué está hecho, la cola y las recetas abiertas.
import { baseRecipes, techByName } from '../../shared/factorio/research';
import type { ServerMsg } from '../../shared/protocol';

export class ResearchClient {
  done = new Set<string>();
  queue: string[] = [];
  progress = 0;
  private recipes = new Set<string>(baseRecipes());
  /** Quien quiera enterarse de que cambió (las ventanas abiertas). */
  listeners: (() => void)[] = [];

  reset(): void {
    this.done.clear();
    this.queue = [];
    this.progress = 0;
    this.recipes = new Set(baseRecipes());
  }

  onMessage(msg: ServerMsg): boolean {
    if (msg.t !== 'research') return false;
    this.done = new Set(msg.done);
    this.queue = msg.queue;
    this.progress = msg.progress;
    this.recipes = new Set(baseRecipes());
    for (const n of this.done) for (const r of techByName(n)?.unlocks ?? []) this.recipes.add(r);
    for (const f of this.listeners) f();
    return true;
  }

  recipeUnlocked = (name: string): boolean => this.recipes.has(name);
}
