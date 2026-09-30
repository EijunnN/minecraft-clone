// Programa lunar: el motor de fluidos (puro, sin bloques): un grafo de cajas con volumen y un fluido cada una, unidas por aristas.
//
// Cada paso, por cada arista pasa el 40 % (FLOW_FACTOR) de la diferencia de NIVEL (cantidad ÷ volumen) por el volumen de la caja más pequeña,
// del lado más lleno al más vacío: así un tanque grande alimenta una tubería, y una fila de tuberías se iguala poco a poco. Dos cajas con
// fluidos distintos no se mezclan (no pasa nada entre ellas); una vacía acepta cualquiera. Los flujos de un paso se calculan sobre el estado
// del principio y se aplican juntos, sin que una caja dé más de lo que tiene ni reciba más de lo que le cabe.
import { FLOW_FACTOR } from './fluidTypes';

export interface FBox {
  cap: number;
  /** Id del fluido (0 = vacía). */
  fluid: number;
  amount: number;
  /** Si se pone, la caja sólo admite ese fluido (las de una máquina, según su receta). */
  filter?: number;
  /** 'in': sólo recibe de las tuberías (la entrada de una máquina); 'out': sólo da (su salida). Sin poner, va en los dos sentidos. */
  mode?: 'in' | 'out';
}

export class FluidGraph {
  boxes = new Map<number, FBox>();
  private edges: [number, number][] = [];
  private out = new Map<number, number>();
  private inn = new Map<number, number>();

  add(key: number, cap: number): FBox {
    let b = this.boxes.get(key);
    if (!b) {
      b = { cap, fluid: 0, amount: 0 };
      this.boxes.set(key, b);
    } else b.cap = cap;
    return b;
  }

  remove(key: number): FBox | undefined {
    const b = this.boxes.get(key);
    this.boxes.delete(key);
    return b;
  }

  /** Cambia todas las aristas (pares de claves de cajas que existen). */
  setEdges(edges: [number, number][]): void {
    this.edges = edges.filter(([a, b]) => a !== b && this.boxes.has(a) && this.boxes.has(b));
  }

  get edgeCount(): number {
    return this.edges.length;
  }

  /** Mete hasta `n` del fluido en la caja; devuelve cuánto entró. */
  put(key: number, fluid: number, n: number): number {
    const b = this.boxes.get(key);
    if (!b || n <= 0 || (b.amount > 1e-9 && b.fluid !== fluid) || (b.filter && b.filter !== fluid)) return 0;
    const m = Math.min(n, b.cap - b.amount);
    if (m <= 0) return 0;
    b.fluid = fluid;
    b.amount += m;
    return m;
  }

  /** Saca hasta `n` de la caja; devuelve cuánto salió. */
  take(key: number, n: number): number {
    const b = this.boxes.get(key);
    if (!b || n <= 0) return 0;
    const m = Math.min(n, b.amount);
    b.amount -= m;
    if (b.amount <= 1e-9) {
      b.amount = 0;
      b.fluid = 0;
    }
    return m;
  }

  /** Un paso de flujo por todas las aristas. */
  step(): void {
    const out = this.out, inn = this.inn;
    out.clear();
    inn.clear();
    const moves: [number, number, number][] = [];
    for (const [ka, kb] of this.edges) {
      const a = this.boxes.get(ka)!, b = this.boxes.get(kb)!;
      if (a.amount <= 0 && b.amount <= 0) continue;
      if (a.amount > 1e-9 && b.amount > 1e-9 && a.fluid !== b.fluid) continue;
      const la = a.amount / a.cap, lb = b.amount / b.cap;
      const d = la - lb;
      if (Math.abs(d) < 1e-9) continue;
      const flow = Math.abs(d) * FLOW_FACTOR * Math.min(a.cap, b.cap);
      const from = d > 0 ? ka : kb, to = d > 0 ? kb : ka;
      const src = d > 0 ? a : b, dst = d > 0 ? b : a;
      if (src.mode === 'in' || dst.mode === 'out') continue; // una entrada no da y una salida no recibe
      if (dst.filter && src.fluid !== dst.filter) continue;
      moves.push([from, to, flow]);
      out.set(from, (out.get(from) ?? 0) + flow);
    }
    // Ninguna caja da más de lo que tiene: si le piden más, se reparte en proporción.
    const scale = new Map<number, number>();
    for (const [k, total] of out) {
      const have = this.boxes.get(k)!.amount;
      if (total > have) scale.set(k, have / total);
    }
    for (const [from, to, flow0] of moves) {
      const flow = flow0 * (scale.get(from) ?? 1);
      inn.set(to, (inn.get(to) ?? 0) + flow);
    }
    // Ninguna caja recibe más de lo que le cabe (contando lo que da).
    const fit = new Map<number, number>();
    for (const [k, total] of inn) {
      const b = this.boxes.get(k)!;
      const free = b.cap - b.amount + Math.min(b.amount, out.get(k) ?? 0) * (scale.get(k) ?? 1);
      if (total > free) fit.set(k, Math.max(0, free) / total);
    }
    const fluidOf = new Map<number, number>();
    for (const [from, to] of moves) fluidOf.set(to, this.boxes.get(from)!.fluid);
    const delta = new Map<number, number>();
    for (const [from, to, flow0] of moves) {
      const flow = flow0 * (scale.get(from) ?? 1) * (fit.get(to) ?? 1);
      delta.set(from, (delta.get(from) ?? 0) - flow);
      delta.set(to, (delta.get(to) ?? 0) + flow);
    }
    for (const [k, dl] of delta) {
      const b = this.boxes.get(k)!;
      if (dl > 0 && b.amount <= 1e-9) b.fluid = fluidOf.get(k) ?? b.fluid;
      b.amount = Math.max(0, Math.min(b.cap, b.amount + dl));
      if (b.amount <= 1e-9) {
        b.amount = 0;
        b.fluid = 0;
      }
    }
  }
}
