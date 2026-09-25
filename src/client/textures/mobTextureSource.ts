// Fuente de texturas de criaturas para el renderizador (arte procedural, generado bajo demanda).
import type { MobTexture } from '../render/MobRenderer';
import { generateMobTexture } from './mobTextures';
import { companionTexture } from './companionTextures'; // Fase 6 (gólems/domesticar)

export function mobTextureSource(): (id: number) => MobTexture | null {
  return (id) => {
    try {
      // Fase 6 (gólems/domesticar): gólems y gatos (id + piel · 1000).
      return companionTexture(id) ?? generateMobTexture(id);
    } catch (e) {
      console.warn('Textura de criatura no disponible', id, e);
      return null;
    }
  };
}
