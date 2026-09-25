// Fase 6.5 (equipo): líneas de la descripción del equipo nuevo: cómo se usa cada cosa, los colores y
// el vuelo de los fuegos artificiales, la tonada del cuerno y la armadura de los caballos.
import {
  CROSSBOW, CROSSBOW_CHARGED, TRIDENT, FLINT_AND_STEEL, GOAT_HORN, FIREWORK_ROCKET, FIREWORK_STAR, CARROT_ON_A_STICK, TURTLE_HELMET,
  WOLF_ARMOR, HORSE_ARMOR, type ItemStack,
} from '../../shared/items';
import { DYE_COLORS, COLOR_NAMES, CONDUIT } from '../../shared/blocks';
import { HORSE_ARMOR_POINTS, fireworkFlight, fireworkColors, colorList, hornTune } from '../../shared/equipment';
import { potionName } from '../../shared/potions'; // Fase 7 (remate)

const dim = (t: string) => `<span class="tt-dim">${t}</span>`;
const colorNames = (mask: number) => colorList(mask).map((i) => COLOR_NAMES[DYE_COLORS[i]][0]).join(', ');

/** Líneas (HTML) que añade el equipo a la descripción de una pila. */
export function equipmentTooltip(s: ItemStack): string[] {
  const out: string[] = [];
  switch (s.id) {
    case CROSSBOW:
      out.push(dim('Mantén el clic derecho para cargarla (usa flechas)'));
      break;
    case CROSSBOW_CHARGED:
      out.push(dim('Cargada: clic derecho para disparar'));
      // Fase 7 (remate): la flecha con efecto que lleva cargada.
      if (s.data?.ap !== undefined) out.push(dim(`Proyectil: ${potionName('arrow', s.data.ap)}`));
      break;
    case TRIDENT:
      out.push(dim('Mantén el clic derecho y suelta para lanzarlo'));
      break;
    case FLINT_AND_STEEL:
      out.push(dim('Clic derecho: enciende fuego, velas y fogatas'));
      break;
    case GOAT_HORN:
      out.push(dim(`Tonada: ${hornTune(s.dmg)}`));
      break;
    case CARROT_ON_A_STICK:
      out.push(dim('Guía al cerdo ensillado que montas (clic derecho: acelerón)'));
      break;
    case TURTLE_HELMET:
      out.push(dim('Respiración acuática al sacar la cabeza del agua'));
      break;
    case WOLF_ARMOR:
      out.push(dim('Para tu lobo domesticado (con tijeras se le quita)'));
      break;
    case FIREWORK_ROCKET: {
      out.push(dim(`Duración del vuelo: ${fireworkFlight(s.dmg)}`));
      const c = fireworkColors(s.dmg);
      if (c) out.push(dim(`Colores: ${colorNames(c)}`));
      break;
    }
    case FIREWORK_STAR:
      if (s.dmg) out.push(dim(`Colores: ${colorNames(s.dmg)}`));
      break;
    case CONDUIT:
      out.push(dim('Bajo el agua, con un marco de prismarina, da Poder del conducto'));
      break;
  }
  const horse = Object.entries(HORSE_ARMOR).find(([, id]) => id === s.id);
  if (horse) out.push('<span class="tt-gap"></span>', dim('En el caballo:'), `<span class="tt-armor">+${HORSE_ARMOR_POINTS[horse[0]]} de armadura</span>`);
  return out;
}
