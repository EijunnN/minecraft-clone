// Fuente de texturas de criaturas para el renderizador (arte procedural, generado bajo demanda).
import type { MobTexture } from '../render/MobRenderer';
import { generateMobTexture } from './mobTextures';

/** `variant`: pelaje (Fase 6, monturas) o ropa según la profesión (Fase 6, aldeanos). */
export function mobTextureSource(): (id: number, variant?: number) => MobTexture | null {
  return (id, variant = 0) => {
    try {
      return generateMobTexture(id, variant);
    } catch (e) {
      console.warn('Textura de criatura no disponible', id, e);
      return null;
    }
  };
}
