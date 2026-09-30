// Programa lunar: lo que el cliente sabe de los fluidos de alrededor (los manda el servidor: 'fluids') y el rótulo que sale al apuntar a una
// tubería, tanque o bomba: qué fluido lleva y cuánto («Agua 63,2 / 100»).
import { FLUIDS } from '../../shared/logistics/fluidTypes';
import { isPipe, isUndergroundPipe, isTankBlock, isOffshorePump, multiControllerPos } from '../../shared/blocks';
import { posKey } from '../../shared/sim/posKey';
import type { ServerMsg } from '../../shared/protocol';
import type { Game } from './Game';

export class FluidClient {
  private boxes = new Map<number, [number, number, number]>();
  private el: HTMLElement | null = null;
  private last = '';

  constructor(private g: Game) {}

  reset(): void {
    this.boxes.clear();
    this.show('');
  }

  onMessage(msg: ServerMsg): boolean {
    if (msg.t !== 'fluids') return false;
    this.boxes.clear();
    for (const r of msg.l) this.boxes.set(posKey(r[0], r[1], r[2]), [r[3], r[4], r[5]]);
    return true;
  }

  private show(text: string): void {
    if (text === this.last) return;
    this.last = text;
    if (!this.el) {
      this.el = document.createElement('div');
      this.el.id = 'fluid-hint';
      document.body.appendChild(this.el);
    }
    this.el.textContent = text;
    this.el.style.display = text ? 'block' : 'none';
  }

  /** Se llama cada frame: pone o quita el rótulo según lo que se apunta. */
  update(): void {
    const hit = this.g.hit;
    if (!hit || this.g.anyScreenOpen()) return this.show('');
    const id = hit.id;
    const named = isPipe(id) ? 'Tubería' : isUndergroundPipe(id) ? 'Tubería subterránea' : isTankBlock(id) ? 'Tanque' : isOffshorePump(id) ? 'Bomba de agua' : '';
    if (!named) return this.show('');
    const c = isTankBlock(id) ? multiControllerPos(id, hit.x, hit.y, hit.z) : [hit.x, hit.y, hit.z];
    const b = c ? this.boxes.get(posKey(c[0], c[1], c[2])) : undefined;
    const cap = b ? b[2] : isTankBlock(id) ? 25000 : 100;
    this.show(b && b[1] > 0 ? `${named}: ${FLUIDS[b[0]]?.es ?? '?'} ${b[1].toFixed(1).replace('.', ',')} / ${cap}` : `${named}: vacío`);
  }
}
