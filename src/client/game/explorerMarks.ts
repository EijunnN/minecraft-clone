// Fase 7.5 (mansión): marcas de destino de los mapas de explorador, pintadas a mano en 16×16 (como
// las de Minecraft, pero propias): una mansión de roble oscuro con el tejado a dos aguas y ventanas
// encendidas, y un monumento oceánico escalonado de prismarina.
import type { ExplorerKind } from '../../shared/explorerMaps';

const cache = new Map<string, string>();

/** Imagen (data URL) de la marca de un tipo de mapa de explorador. */
export function explorerMarkIcon(icon: ExplorerKind['icon']): string {
  let url = cache.get(icon);
  if (url) return url;
  const c = document.createElement('canvas');
  c.width = c.height = 16;
  const g = c.getContext('2d')!;
  const px = (x: number, y: number, w: number, h: number, color: string) => {
    g.fillStyle = color;
    g.fillRect(x, y, w, h);
  };
  if (icon === 'mansion') {
    // Silueta negra, tejado oscuro, fachada marrón y ventanas amarillas.
    for (let k = 0; k < 5; k++) px(8 - k, 1 + k, 2 * k + 1, 1, '#1c120b');
    px(1, 5, 14, 1, '#1c120b');
    for (let k = 0; k < 4; k++) px(7 - k, 2 + k, 2 + 2 * k, 1, '#3d281a');
    px(1, 6, 14, 9, '#1c120b');
    px(2, 6, 12, 8, '#5b3b22');
    px(2, 10, 12, 1, '#3d281a');
    for (const x of [3, 6, 9, 12]) {
      px(x, 7, 1, 2, '#f0d878');
      px(x, 11, 1, 2, '#f0d878');
    }
    px(7, 11, 2, 3, '#2a1a0e');
  } else {
    // Pirámide escalonada verde azulada con la entrada oscura.
    const steps: [number, number][] = [[7, 2], [5, 5], [3, 8], [1, 11]];
    for (const [x, y] of steps) px(x, y, 16 - 2 * x, 3, '#16403d');
    for (const [x, y] of steps) px(x + 1, y + 1, 14 - 2 * x, 2, '#46a89c');
    px(1, 14, 14, 1, '#16403d');
    px(6, 11, 4, 3, '#0d2624');
    px(7, 3, 2, 1, '#9fe3d8');
  }
  url = c.toDataURL();
  cache.set(icon, url);
  return url;
}
