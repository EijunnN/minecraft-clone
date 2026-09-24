// Fuente de texturas de criaturas para el renderizador (arte procedural, generado bajo demanda).
import type { MobTexture } from '../render/MobRenderer';
import { generateMobTexture } from './mobTextures';

export function mobTextureSource(): (id: number) => MobTexture | null {
  return (id) => {
    try {
      return generateMobTexture(id);
    } catch (e) {
      console.warn('Textura de criatura no disponible', id, e);
      return null;
    }
  };
}
