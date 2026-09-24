// Chat: historial de lo enviado (flechas arriba y abajo) y autocompletar con Tab los comandos, sus
// argumentos (modos, dificultades, horas, efectos, criaturas, objetos) y los nombres de jugadores.
// Tab repetido recorre las opciones.
import { EFFECTS } from '../../shared/effects';
import { MOBS, MOB_TYPES } from '../../shared/mobs';
import { ITEMS } from '../../shared/items';

const norm = (v: string) => v.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const HISTORY_KEY = 'voxelcraft:chat-history';
const HISTORY_MAX = 50;

/** Opciones del argumento `n` (desde 1) de cada comando. */
function argOptions(cmd: string, n: number, players: string[]): string[] {
  if (n !== 1) return cmd === 'dar' && n === 2 ? ['1', '16', '32', '64'] : [];
  switch (cmd) {
    case 'modo': return ['supervivencia', 'creativo'];
    case 'dificultad': return ['pacifico', 'facil', 'normal', 'dificil'];
    case 'hora': return ['dia', 'mediodia', 'atardecer', 'noche', 'medianoche', 'amanecer'];
    case 'efecto': return ['quitar', ...Object.values(EFFECTS).map((e) => norm(e.name).replace(/\s+/g, '_'))];
    case 'invocar': return MOB_TYPES.map((t) => norm(MOBS[t].name).replace(/\s+/g, '_'));
    case 'dar': return ITEMS.filter((i) => i).map((i) => i.key);
    case 'tp': return players;
    default: return [];
  }
}

const COMMANDS = ['ayuda', 'dar', 'dificultad', 'efecto', 'hora', 'invocar', 'lista', 'matar', 'modo', 'semilla', 'tp'];

export class ChatCompletion {
  private history: string[] = [];
  private pos = -1;
  private draft = '';
  /** Ciclo de Tab: el texto antes de la palabra, las opciones y cuál va. */
  private cycle: { head: string; options: string[]; i: number } | null = null;

  constructor(private input: HTMLInputElement, private players: () => string[]) {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (raw) this.history = (JSON.parse(raw) as unknown[]).filter((s): s is string => typeof s === 'string').slice(-HISTORY_MAX);
    } catch {
      /* sin historial guardado */
    }
    input.addEventListener('input', () => {
      this.cycle = null;
      this.pos = -1;
    });
  }

  /** Lo enviado se añade al historial (sin repetir el último). */
  sent(line: string): void {
    if (this.history[this.history.length - 1] !== line) this.history.push(line);
    if (this.history.length > HISTORY_MAX) this.history.shift();
    this.pos = -1;
    this.cycle = null;
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(this.history));
    } catch {
      /* no se guarda */
    }
  }

  /** Teclas del campo del chat; devuelve true si la ha usado. */
  onKey(e: KeyboardEvent): boolean {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      if (this.history.length === 0) return true;
      if (this.pos === -1) this.draft = this.input.value;
      const up = e.key === 'ArrowUp';
      this.pos = up ? (this.pos === -1 ? this.history.length - 1 : Math.max(0, this.pos - 1)) : this.pos === -1 ? -1 : this.pos + 1;
      if (this.pos >= this.history.length) this.pos = -1;
      this.set(this.pos === -1 ? this.draft : this.history[this.pos]);
      return true;
    }
    if (e.key === 'Tab') {
      this.complete(e.shiftKey);
      return true;
    }
    return false;
  }

  private set(v: string): void {
    this.input.value = v;
    this.input.setSelectionRange(v.length, v.length);
  }

  private complete(back: boolean): void {
    if (!this.cycle) {
      const v = this.input.value;
      const cut = v.lastIndexOf(' ') + 1;
      const head = v.slice(0, cut), word = norm(v.slice(cut));
      let pool: string[];
      if (v.startsWith('/') && cut === 0) pool = COMMANDS.map((c) => '/' + c);
      else if (v.startsWith('/')) {
        const parts = v.slice(1).split(/\s+/);
        pool = argOptions(norm(parts[0]), parts.length - 1, this.players());
      } else pool = this.players();
      const options = pool.filter((o) => norm(o).startsWith(word)).sort();
      if (options.length === 0) return;
      this.cycle = { head, options, i: back ? options.length - 1 : 0 };
    } else {
      const c = this.cycle;
      c.i = (c.i + (back ? c.options.length - 1 : 1)) % c.options.length;
    }
    const c = this.cycle;
    const pick = c.options[c.i];
    this.set(c.head + pick + (c.options.length === 1 ? ' ' : ''));
    // Una sola opción: queda escrita y se sigue con el siguiente argumento.
    if (c.options.length === 1) this.cycle = null;
  }
}
