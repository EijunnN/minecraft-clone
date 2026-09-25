// Fuente de texturas de criaturas para el renderizador (arte procedural, generado bajo demanda).
import type { MobTexture } from '../render/MobRenderer';
import { generateMobTexture } from './mobTextures';

// Fase 6 (aldeanos): `variant` elige la ropa del aldeano según su profesión.
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
