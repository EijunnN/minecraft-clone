// Programa lunar: los puertos de todas las máquinas de fabricar (horno eléctrico, ensambladoras, hornos de combustible) con un solo
// contrato, para que los brazos y las cintas no tengan que saber cuál es cuál.
import type { ItemStack } from '../../items';
import type { MachinePorts } from './machines';

export class MachineHub implements MachinePorts {
  constructor(private parts: readonly MachinePorts[]) {}

  private at(x: number, y: number, z: number): MachinePorts | undefined {
    return this.parts.find((p) => p.has(x, y, z));
  }

  has(x: number, y: number, z: number): boolean {
    return !!this.at(x, y, z);
  }

  accepts(x: number, y: number, z: number, s: ItemStack): boolean {
    return this.at(x, y, z)?.accepts(x, y, z, s) ?? false;
  }

  insert(x: number, y: number, z: number, s: ItemStack): number {
    return this.at(x, y, z)?.insert(x, y, z, s) ?? 0;
  }

  extractOne(x: number, y: number, z: number, take: (s: ItemStack) => boolean): boolean {
    return this.at(x, y, z)?.extractOne(x, y, z, take) ?? false;
  }
}
