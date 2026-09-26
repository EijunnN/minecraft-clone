// Fase 7.6: iconos de los escudos decorados con un estandarte (el dibujo del escudo con la tela en vez
// de la madera). Se hacen la primera vez que se ven y se guardan por decoración.
import { SHIELD, itemSpriteIndex, type ItemStack } from '../../shared/items';
import { decoratedShieldRGBA, parseShieldKey, shieldDecorKey } from '../render/shieldArt';
import type { ItemSprites } from '../textures/itemSprites';

let sprites: ItemSprites | null = null;
const cache = new Map<string, string>();

/** Guarda los sprites de los objetos (el del escudo se decora a partir de él). */
export function setShieldIconSprites(s: ItemSprites): void {
  sprites = s;
}

/** Icono de un escudo decorado (undefined si la pila no es uno). */
export function shieldIconUrl(s: ItemStack): string | undefined {
  if (s.id !== SHIELD || !sprites) return undefined;
  const key = shieldDecorKey(s);
  const d = key ? parseShieldKey(key) : null;
  if (!key || !d) return undefined;
  let url = cache.get(key);
  if (!url) {
    const layer = itemSpriteIndex(SHIELD);
    const c = document.createElement('canvas');
    c.width = 16;
    c.height = 16;
    const g = c.getContext('2d')!;
    const img = g.createImageData(16, 16);
    img.data.set(decoratedShieldRGBA(sprites.rgba, layer * 1024, d.base, d.layers));
    g.putImageData(img, 0, 0);
    url = c.toDataURL();
    if (cache.size > 128) cache.clear();
    cache.set(key, url);
  }
  return url;
}
