// Pesca: tiempos de espera y de picada, y el botín (tablas de Minecraft sin encantamientos:
// 85 % peces, 10 % basura y 5 % tesoros).
import {
  COD, SALMON, PUFFERFISH, TROPICAL_FISH, ARMOR, LEATHER, BONE, ROTTEN_FLESH, STRING, STICK, FISHING_ROD, BOW,
  ITEMS, type ItemStack,
} from './items';
import { NAUTILUS_SHELL } from './items'; // Fase 6.5 (equipo)

/** Segundos hasta que pica un pez (con lluvia, un 20 % menos). */
export const FISH_WAIT: readonly [number, number] = [5, 30];
/** Segundos que dura la picada (hay que recoger entonces). */
export const FISH_BITE: readonly [number, number] = [1, 2];
/** Experiencia por captura. */
export const FISH_XP: readonly [number, number] = [1, 6];

type Entry = [id: number, weight: number, damaged?: boolean];
const FISH: Entry[] = [[COD, 60], [SALMON, 25], [PUFFERFISH, 13], [TROPICAL_FISH, 2]];
const JUNK: Entry[] = [
  [ARMOR.leather.boots, 10, true], [LEATHER, 10], [BONE, 10], [ROTTEN_FLESH, 10], [STRING, 5], [STICK, 5],
  [FISHING_ROD, 2, true],
];
const TREASURE: Entry[] = [[BOW, 1, true], [FISHING_ROD, 1, true], [NAUTILUS_SHELL, 1]]; // Fase 6.5 (equipo): concha de nautilo

function pick(table: Entry[], rand: () => number): ItemStack {
  const total = table.reduce((n, e) => n + e[1], 0);
  let r = rand() * total;
  for (const [id, w, damaged] of table) {
    r -= w;
    if (r < 0) {
      const max = ITEMS[id].tool?.durability ?? ITEMS[id].armor?.durability ?? 0;
      // Basura y tesoros gastados: entre el 10 y el 90 % de desgaste.
      return damaged && max ? { id, count: 1, dmg: Math.floor(max * (0.1 + 0.8 * rand())) } : { id, count: 1 };
    }
  }
  return { id: table[0][0], count: 1 };
}

/**
 * Lo que sale del agua al recoger en plena picada. Fase 7 (pociones): `luck` (Suerte, −Mala suerte)
 * cambia los pesos como en Minecraft: peces 85 − luck, basura 10 − 2·luck y tesoros 5 + 2·luck.
 */
export function fishingLoot(rand: () => number = Math.random, luck = 0): ItemStack {
  const fish = Math.max(0, 85 - luck), junk = Math.max(0, 10 - 2 * luck), treasure = Math.max(0, 5 + 2 * luck);
  const r = rand() * (fish + junk + treasure);
  return pick(r < fish ? FISH : r < fish + junk ? JUNK : TREASURE, rand);
}
