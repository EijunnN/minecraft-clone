// Aldeanos (fase 6): profesiones, bloque de trabajo de cada una, niveles y ofertas de comercio.
// Lo usan el servidor (autoridad del comercio), el cliente (pantalla de comercio y texturas) y las
// pruebas. Todo es determinista: las ofertas salen de la profesión, el nivel y la semilla del aldeano.
import {
  EMERALD, WHEAT, POTATO, CARROT, BEETROOT, BREAD, APPLE, PUMPKIN_PIE, GOLDEN_APPLE, RAW_CHICKEN, RAW_PORKCHOP,
  RAW_MUTTON, RAW_BEEF, COOKED_PORKCHOP, COOKED_CHICKEN, COOKED_MUTTON, STEAK, COAL, IRON_INGOT, LAVA_BUCKET, DIAMOND,
  SHIELD, ARMOR, TOOLS, CLAY_BALL, PAPER, BOOK, COMPASS, EMPTY_MAP, STICK, ARROW, FLINT, BOW, STRING, FEATHER, COD,
  COOKED_COD, SALMON, COOKED_SALMON, TROPICAL_FISH, PUFFERFISH, FISHING_ROD, SHEARS, LEATHER, GLOW_BERRIES, BUCKET,
  GOLD_INGOT, SUGAR, EGG,
} from './items';
import {
  COMPOSTER, SMOKER, BLAST_FURNACE, STONECUTTER, LECTERN, CARTOGRAPHY_TABLE, FLETCHING_TABLE, BARREL, LOOM, GRINDSTONE,
  SMITHING_TABLE, CAULDRON, PUMPKIN, MELON, CAKE, STONE, BRICKS, STONE_BRICKS, GRANITE, ANDESITE, DIORITE, TERRACOTTA,
  QUARTZ_BLOCK, BOOKSHELF, GLASS, GLASS_PANE, GRAVEL, CAMPFIRE, WHITE_WOOL, BLACK_WOOL, RED_WOOL, YELLOW_WOOL, BLUE_WOOL,
  LIME_WOOL, BEDS, ALL_SAPLINGS, FLOWERS, LILY_PAD, VINE, SUGAR_CANE, CACTUS, PACKED_ICE, RED_SAND, MOSS_BLOCK, POPPY,
  DANDELION, CORNFLOWER, BROWN_MUSHROOM, RED_MUSHROOM, baseBlock,
} from './blocks';

/** Una oferta: lo que pide (una o dos pilas) y lo que da; `max` usos antes de reponer; `xp` que gana el aldeano. */
export interface TradeOffer {
  cost: [number, number];
  cost2?: [number, number];
  result: [number, number];
  max: number;
  xp: number;
  /** Fase 7 (encantamientos): datos de lo que da (un libro encantado, equipo encantado). */
  data?: ItemData;
  /** Fase 7 (encantamientos): se encanta al crear la oferta ('book': libro al azar; 'item': con 5–19 niveles). */
  enchant?: 'book' | 'item';
  /**
   * Fase 7.5 (mansión): mapa de explorador hacia la estructura más cercana de esta clave (el servidor la
   * busca desde el aldeano; si no hay ninguna, la oferta no sale).
   */
  explorer?: string;
}

export interface Profession {
  id: number;
  key: string;
  /** Nombre visible (en español). */
  name: string;
  /** Bloque de trabajo (estado base); 0 = ninguno. */
  block: number;
  /** Ofertas posibles por nivel (índice 0 = novato … 4 = maestro). */
  pool: TradeOffer[][];
}

/** Compra: el aldeano paga `em` esmeraldas por `n` objetos. */
const buy = (id: number, n: number, em = 1, max = 16, xp = 2): TradeOffer => ({ cost: [id, n], result: [EMERALD, em], max, xp });
/** Venta: el aldeano da `n` objetos por `em` esmeraldas. */
const sell = (id: number, n: number, em: number, max = 12, xp = 1): TradeOffer => ({ cost: [EMERALD, em], result: [id, n], max, xp });

export const PROF_NONE = 0;
export const PROF_FARMER = 1;
export const PROF_BUTCHER = 2;
export const PROF_ARMORER = 3;
export const PROF_MASON = 4;
export const PROF_LIBRARIAN = 5;
export const PROF_CARTOGRAPHER = 6;
export const PROF_FLETCHER = 7;
export const PROF_FISHERMAN = 8;
export const PROF_SHEPHERD = 9;
export const PROF_WEAPONSMITH = 10;
export const PROF_TOOLSMITH = 11;
export const PROF_LEATHERWORKER = 12;

export const PROFESSIONS: readonly Profession[] = [
  { id: PROF_NONE, key: 'none', name: 'Aldeano', block: 0, pool: [] },
  {
    id: PROF_FARMER, key: 'farmer', name: 'Granjero', block: COMPOSTER, pool: [
      [buy(WHEAT, 20), buy(POTATO, 26), buy(CARROT, 22), sell(BREAD, 6, 1, 16)],
      [buy(PUMPKIN, 6, 1, 12, 10), sell(PUMPKIN_PIE, 4, 1, 12, 5), sell(APPLE, 4, 1, 16, 5)],
      [buy(MELON, 4, 1, 12, 20), sell(CAKE, 1, 1, 12, 10)],
      [buy(BEETROOT, 15, 1, 12, 20), sell(GLOW_BERRIES, 6, 2, 12, 15)],
      [sell(GOLDEN_APPLE, 1, 10, 6, 30)],
    ],
  },
  {
    id: PROF_BUTCHER, key: 'butcher', name: 'Carnicero', block: SMOKER, pool: [
      [buy(RAW_CHICKEN, 14), buy(RAW_PORKCHOP, 7), buy(COAL, 15), sell(COOKED_PORKCHOP, 5, 1, 16)],
      [sell(COOKED_CHICKEN, 8, 1, 16, 5), buy(RAW_MUTTON, 7, 1, 16, 10)],
      [buy(RAW_BEEF, 10, 1, 16, 20), sell(COOKED_MUTTON, 5, 1, 12, 10)],
      [sell(STEAK, 4, 1, 12, 15)],
      [buy(EGG, 12, 1, 12, 30)],
    ],
  },
  {
    id: PROF_ARMORER, key: 'armorer', name: 'Armero', block: BLAST_FURNACE, pool: [
      [buy(COAL, 15), sell(ARMOR.iron.helmet, 1, 5, 12), sell(ARMOR.iron.leggings, 1, 7, 12), sell(ARMOR.iron.boots, 1, 4, 12)],
      [buy(IRON_INGOT, 4, 1, 12, 10), sell(ARMOR.iron.chestplate, 1, 9, 12, 5)],
      [buy(LAVA_BUCKET, 1, 1, 12, 20), sell(SHIELD, 1, 5, 12, 10)],
      [buy(DIAMOND, 1, 1, 12, 30), sell(ARMOR.diamond.leggings, 1, 19, 3, 15)],
      [sell(ARMOR.diamond.chestplate, 1, 21, 3, 30)],
    ],
  },
  {
    id: PROF_MASON, key: 'mason', name: 'Cantero', block: STONECUTTER, pool: [
      [buy(CLAY_BALL, 10), buy(STONE, 20), sell(BRICKS, 10, 1, 16)],
      [sell(STONE_BRICKS, 4, 1, 16, 5), buy(GRANITE, 16, 1, 16, 10)],
      [buy(ANDESITE, 16, 1, 16, 20), buy(DIORITE, 16, 1, 16, 20)],
      [sell(TERRACOTTA, 1, 1, 12, 15)],
      [sell(QUARTZ_BLOCK, 1, 1, 12, 30)],
    ],
  },
  {
    id: PROF_LIBRARIAN, key: 'librarian', name: 'Bibliotecario', block: LECTERN, pool: [
      [buy(PAPER, 24), sell(BOOKSHELF, 1, 9, 12), buy(BOOK, 4, 1, 12, 2)],
      [sell(GLASS, 4, 1, 12, 5), buy(SUGAR, 20, 1, 12, 10)],
      [sell(PAPER, 16, 2, 12, 10), sell(BOOK, 2, 3, 12, 10)],
      [sell(COMPASS, 1, 5, 12, 15)],
      [sell(GOLD_INGOT, 1, 6, 6, 30)],
    ],
  },
  {
    id: PROF_CARTOGRAPHER, key: 'cartographer', name: 'Cartógrafo', block: CARTOGRAPHY_TABLE, pool: [
      [buy(PAPER, 24), sell(EMPTY_MAP, 1, 7, 12), buy(GLASS_PANE, 11)],
      [buy(COMPASS, 1, 1, 12, 10), sell(PAPER, 8, 1, 12, 5)],
      [sell(GLASS_PANE, 8, 1, 12, 10)],
      [sell(COMPASS, 1, 4, 12, 15)],
      [sell(EMPTY_MAP, 3, 12, 6, 30)],
    ],
  },
  {
    id: PROF_FLETCHER, key: 'fletcher', name: 'Flechero', block: FLETCHING_TABLE, pool: [
      [buy(STICK, 32), sell(ARROW, 16, 1, 12), { cost: [GRAVEL, 10], cost2: [EMERALD, 1], result: [FLINT, 10], max: 12, xp: 1 }],
      [buy(FLINT, 26, 1, 12, 10), sell(BOW, 1, 2, 12, 5)],
      [buy(STRING, 14, 1, 16, 20), sell(ARROW, 32, 2, 12, 10)],
      [buy(FEATHER, 24, 1, 16, 30)],
      [sell(BOW, 1, 4, 3, 30)],
    ],
  },
  {
    id: PROF_FISHERMAN, key: 'fisherman', name: 'Pescador', block: BARREL, pool: [
      [buy(STRING, 20), buy(COAL, 10), { cost: [COD, 6], cost2: [EMERALD, 1], result: [COOKED_COD, 6], max: 16, xp: 1 }],
      [buy(COD, 15, 1, 16, 10), sell(CAMPFIRE, 1, 2, 12, 5)],
      [buy(SALMON, 13, 1, 16, 20), { cost: [SALMON, 6], cost2: [EMERALD, 1], result: [COOKED_SALMON, 6], max: 16, xp: 10 }],
      [buy(TROPICAL_FISH, 6, 1, 12, 30), sell(BUCKET, 1, 2, 12, 15)],
      [buy(PUFFERFISH, 4, 1, 12, 30), sell(FISHING_ROD, 1, 3, 3, 30)],
    ],
  },
  {
    id: PROF_SHEPHERD, key: 'shepherd', name: 'Pastor', block: LOOM, pool: [
      [buy(WHITE_WOOL, 18), buy(BLACK_WOOL, 18), sell(SHEARS, 1, 2, 12)],
      [sell(RED_WOOL, 1, 1, 16, 5), sell(YELLOW_WOOL, 1, 1, 16, 5), sell(BLUE_WOOL, 1, 1, 16, 5)],
      [sell(LIME_WOOL, 1, 1, 16, 10), sell(BEDS.white ?? WHITE_WOOL, 1, 3, 12, 10)],
      [sell(BEDS.red ?? RED_WOOL, 1, 3, 12, 15)],
      [sell(BEDS.blue ?? BLUE_WOOL, 1, 3, 12, 30)],
    ],
  },
  {
    id: PROF_WEAPONSMITH, key: 'weaponsmith', name: 'Herrero de armas', block: GRINDSTONE, pool: [
      [buy(COAL, 15), sell(TOOLS.iron.axe, 1, 3, 12), sell(TOOLS.iron.sword, 1, 7, 12)],
      [buy(IRON_INGOT, 4, 1, 12, 10), sell(TOOLS.stone.sword, 1, 1, 12, 5)],
      [buy(FLINT, 24, 1, 12, 20)],
      [buy(DIAMOND, 1, 1, 12, 30), sell(TOOLS.diamond.axe, 1, 17, 3, 15)],
      [sell(TOOLS.diamond.sword, 1, 13, 3, 30)],
    ],
  },
  {
    id: PROF_TOOLSMITH, key: 'toolsmith', name: 'Herrero', block: SMITHING_TABLE, pool: [
      [buy(COAL, 15), sell(TOOLS.stone.axe, 1, 1, 12), sell(TOOLS.stone.shovel, 1, 1, 12), sell(TOOLS.stone.pickaxe, 1, 1, 12),
        sell(TOOLS.stone.hoe, 1, 1, 12)],
      [buy(IRON_INGOT, 4, 1, 12, 10)],
      [buy(FLINT, 30, 1, 12, 20), sell(TOOLS.iron.shovel, 1, 4, 12, 10), sell(TOOLS.iron.pickaxe, 1, 7, 12, 10)],
      [buy(DIAMOND, 1, 1, 12, 30), sell(TOOLS.diamond.axe, 1, 12, 3, 15)],
      [sell(TOOLS.diamond.pickaxe, 1, 13, 3, 30)],
    ],
  },
  {
    id: PROF_LEATHERWORKER, key: 'leatherworker', name: 'Peletero', block: CAULDRON, pool: [
      [buy(LEATHER, 6), sell(ARMOR.leather.leggings, 1, 3, 12), sell(ARMOR.leather.chestplate, 1, 7, 12)],
      [buy(FLINT, 26, 1, 12, 10), sell(ARMOR.leather.helmet, 1, 5, 12, 5), sell(ARMOR.leather.boots, 1, 4, 12, 5)],
      [buy(STRING, 14, 1, 12, 20)],
      [buy(RAW_BEEF, 10, 1, 12, 30)],
      [sell(LEATHER, 6, 2, 12, 30)],
    ],
  },
];

/** Ofertas del comerciante ambulante: plantas y rarezas de otros biomas (se eligen 5). */
export const TRADER_POOL: readonly TradeOffer[] = [
  ...ALL_SAPLINGS.map((s) => sell(s, 1, 5, 8)),
  ...Object.values(FLOWERS).slice(0, 6).map((f) => sell(f, 1, 1, 12)),
  sell(POPPY, 1, 1, 12), sell(DANDELION, 1, 1, 12), sell(CORNFLOWER, 1, 1, 12),
  sell(LILY_PAD, 2, 1, 5), sell(VINE, 1, 1, 12), sell(SUGAR_CANE, 1, 1, 8), sell(CACTUS, 1, 3, 8),
  sell(PUMPKIN, 1, 1, 4), sell(PACKED_ICE, 1, 3, 6), sell(RED_SAND, 8, 1, 6), sell(MOSS_BLOCK, 2, 1, 5),
  sell(GLOW_BERRIES, 3, 1, 8), sell(BROWN_MUSHROOM, 1, 1, 4), sell(RED_MUSHROOM, 1, 1, 4),
];

/** Experiencia total para llegar a cada nivel (1 novato … 5 maestro). */
export const LEVEL_XP = [0, 10, 70, 150, 250] as const;
export const MAX_LEVEL = 5;
export const LEVEL_NAMES = ['Novato', 'Aprendiz', 'Oficial', 'Experto', 'Maestro'] as const;
/** Ofertas nuevas que se desbloquean en cada nivel; se muestran como mucho 6. */
const PICKS = [3, 1, 1, 1, 1];
export const MAX_OFFERS = 6;

/** Nivel (1..5) que corresponde a una experiencia. */
export function levelForXp(xp: number): number {
  let lvl = 1;
  for (let i = 1; i < LEVEL_XP.length; i++) if (xp >= LEVEL_XP[i]) lvl = i + 1;
  return lvl;
}

/** Profesión que da un bloque de trabajo (PROF_NONE si no es un bloque de trabajo). */
export function professionForBlock(block: number): number {
  if (block <= 0) return PROF_NONE;
  const base = baseBlock(block); // Fase 6.5 (libros y estandartes): el atril con libro sigue siendo un atril
  for (const p of PROFESSIONS) if (p.block && p.block === base) return p.id;
  return PROF_NONE;
}

/** ¿Es un bloque de trabajo de aldeano? */
export const isWorkstation = (block: number): boolean => professionForBlock(block) !== PROF_NONE;

/** PRNG pequeño y determinista (mulberry32) para elegir ofertas. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Oferta concreta de un aldeano: `key` la identifica aunque cambie su posición en la lista. */
export interface Offer extends TradeOffer {
  key: number;
}

/**
 * Ofertas de un aldeano: las de cada nivel alcanzado (3 de novato y una más por nivel), sin repetir.
 * Si pasan de 6, se retiran las más antiguas.
 */
export function offersFor(prof: number, level: number, seed: number): Offer[] {
  const p = PROFESSIONS[prof];
  if (!p || p.pool.length === 0) return [];
  const out: Offer[] = [];
  const r = rng(seed ^ (prof * 0x9e3779b1));
  for (let lvl = 0; lvl < Math.min(level, p.pool.length); lvl++) {
    const pool = p.pool[lvl].map((o, i) => ({ ...o, key: lvl * 16 + i }));
    // Barajado determinista del nivel (se baraja entero para que la elección no dependa del nivel actual).
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    out.push(...pool.slice(0, PICKS[lvl]));
  }
  while (out.length > MAX_OFFERS) out.shift();
  // Fase 7.5 (mansión): los mapas de explorador del cartógrafo salen siempre en su nivel (aparte del sorteo).
  for (let lvl = 0; lvl < Math.min(level, p.pool.length); lvl++) {
    (EXPLORER_TRADES[prof]?.[lvl] ?? []).forEach((o, i) => out.push({ ...o, key: lvl * 16 + 12 + i }));
  }
  return out.map((o) => (o.enchant ? enchantOffer(o, seed) : o)); // Fase 7 (encantamientos)
}

/** Ofertas del comerciante ambulante (5, según su semilla). */
export function traderOffers(seed: number): Offer[] {
  const pool = TRADER_POOL.map((o, i) => ({ ...o, key: 200 + i }));
  const r = rng(seed ^ 0x7a3c5);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, 5);
}

/** Oferta en la red: [pide, n, pide2, n2, da, n, usos, máximo] y, Fase 7 (encantamientos), los datos de lo que da. */
export type TradeWire = [number, number, number, number, number, number, number, number] |
  [number, number, number, number, number, number, number, number, ItemData];

export function offerToWire(o: TradeOffer, uses: number): TradeWire {
  const w: TradeWire = [o.cost[0], o.cost[1], o.cost2?.[0] ?? 0, o.cost2?.[1] ?? 0, o.result[0], o.result[1], uses, o.max];
  return o.data ? [...w, o.data] : w;
}

/** Nombre visible de un aldeano según su profesión (y del comerciante). */
export function villagerTitle(prof: number, trader: boolean): string {
  if (trader) return 'Comerciante ambulante';
  return PROFESSIONS[prof]?.name ?? 'Aldeano';
}

// Fase 6.5 (equipo): el armero vende cota de malla (aprendiz: grebas y botas; oficial: casco y peto),
// el flechero, ballestas, y el peletero, la armadura de cuero para caballo.
import { CROSSBOW, HORSE_ARMOR } from './items';
{
  const prof = (id: number) => PROFESSIONS.find((p) => p.id === id)!;
  prof(PROF_ARMORER).pool[0].push(sell(ARMOR.chainmail.leggings, 1, 3, 12, 1), sell(ARMOR.chainmail.boots, 1, 1, 12, 1));
  prof(PROF_ARMORER).pool[1].push(sell(ARMOR.chainmail.helmet, 1, 1, 12, 5), sell(ARMOR.chainmail.chestplate, 1, 4, 12, 5));
  prof(PROF_FLETCHER).pool[2].push(sell(CROSSBOW, 1, 3, 12, 10));
  const leather = prof(PROF_LEATHERWORKER).pool;
  if (leather[2]) leather[2].push(sell(HORSE_ARMOR.leather, 1, 6, 12, 15));
}

// Fase 7 (encantamientos): libros encantados del bibliotecario (uno por nivel, de novato a experto: un
// encantamiento al azar con un nivel al azar; cuestan 2 + azar(5 + nivel·10) + 3·nivel esmeraldas, el doble
// si es un tesoro, y un libro) y el equipo encantado del armero, el herrero de armas, el herrero, el
// flechero y el pescador (encantado con 5 a 19 niveles, que se suman a su precio), como en Minecraft.
import { EXPERIENCE_BOTTLE, ENCHANTED_BOOK, type ItemStack } from './items';
import type { ItemData } from './itemData';
import { librarianBook, enchantWithLevels, rndFrom, TABLE_POOL } from './enchanting';
{
  const prof = (id: number) => PROFESSIONS.find((p) => p.id === id)!;
  const book = (xp: number): TradeOffer => ({ cost: [EMERALD, 1], cost2: [BOOK, 1], result: [ENCHANTED_BOOK, 1], max: 12, xp, enchant: 'book' });
  const gear = (id: number, em: number, xp: number): TradeOffer => ({ cost: [EMERALD, em], result: [id, 1], max: 3, xp, enchant: 'item' });
  const lib = prof(PROF_LIBRARIAN).pool;
  lib[0].push(book(1));
  lib[1].push(book(5));
  lib[2].push(book(10));
  lib[3].push(book(15));
  // El equipo de diamante de los niveles altos sale encantado (sustituye a la versión sin encantar).
  const enchanted = (p: number, lvl: number, id: number, em: number, xp: number) => {
    const pool = prof(p).pool[lvl];
    const i = pool.findIndex((o) => o.result[0] === id);
    if (i >= 0) pool.splice(i, 1, gear(id, em, xp));
    else pool.push(gear(id, em, xp));
  };
  enchanted(PROF_ARMORER, 3, ARMOR.diamond.leggings, 14, 15);
  enchanted(PROF_ARMORER, 4, ARMOR.diamond.chestplate, 16, 30);
  prof(PROF_ARMORER).pool[3].push(gear(ARMOR.diamond.boots, 8, 15));
  prof(PROF_ARMORER).pool[4].push(gear(ARMOR.diamond.helmet, 8, 30));
  prof(PROF_WEAPONSMITH).pool[0].push(gear(TOOLS.iron.sword, 2, 1));
  enchanted(PROF_WEAPONSMITH, 3, TOOLS.diamond.axe, 12, 15);
  enchanted(PROF_WEAPONSMITH, 4, TOOLS.diamond.sword, 8, 30);
  prof(PROF_TOOLSMITH).pool[2].push(gear(TOOLS.iron.axe, 1, 10));
  enchanted(PROF_TOOLSMITH, 3, TOOLS.diamond.axe, 12, 15);
  prof(PROF_TOOLSMITH).pool[3].push(gear(TOOLS.diamond.shovel, 5, 15));
  enchanted(PROF_TOOLSMITH, 4, TOOLS.diamond.pickaxe, 13, 30);
  prof(PROF_FLETCHER).pool[3].push(gear(BOW, 2, 15));
  enchanted(PROF_FLETCHER, 4, BOW, 2, 30);
  prof(PROF_FLETCHER).pool[4].push(gear(CROSSBOW, 3, 30));
  enchanted(PROF_FISHERMAN, 4, FISHING_ROD, 3, 30);
  // Botellas con experiencia: el cartógrafo no, el bibliotecario maestro sí (no hay clérigo todavía).
  prof(PROF_LIBRARIAN).pool[4].push(sell(EXPERIENCE_BOTTLE, 1, 3, 12, 30));
}

/**
 * Fase 7 (encantamientos): la oferta encantada concreta de un aldeano (siempre la misma para su semilla y
 * la oferta): el libro o el objeto encantado, con su precio.
 */
function enchantOffer(o: Offer, seed: number): Offer {
  const r = rndFrom(rng(seed ^ Math.imul(o.key + 1, 0x2c1b3c6d)));
  let stack: ItemStack;
  let price: number;
  if (o.enchant === 'book') {
    const b = librarianBook(r);
    stack = b.book;
    price = b.price;
  } else {
    const levels = 5 + r.nextInt(15);
    stack = enchantWithLevels({ id: o.result[0], count: 1 }, levels, r, TABLE_POOL);
    price = Math.min(64, o.cost[1] + levels);
  }
  const { enchant: _e, ...rest } = o;
  void _e;
  return { ...rest, cost: [o.cost[0], price], result: [stack.id, 1], ...(stack.data ? { data: stack.data } : {}) };
}

// ------------------------------------------------------------------ Fase 7.5 (mansión)
// Mapas de explorador del cartógrafo, como en Minecraft 26.x: el del monumento oceánico de oficial (13
// esmeraldas y una brújula) y el de la mansión del bosque de maestro (14 esmeraldas y una brújula). No
// entran en el sorteo de ofertas: salen siempre (si hay una estructura así en el mundo).
import { FILLED_MAP } from './items';
const explorerTrade = (kind: string, em: number, xp: number): TradeOffer => ({
  cost: [EMERALD, em], cost2: [COMPASS, 1], result: [FILLED_MAP, 1], max: 12, xp, explorer: kind,
});
/** Ofertas de mapas de explorador por profesión y nivel (índice 0 = novato). */
export const EXPLORER_TRADES: Readonly<Record<number, TradeOffer[][]>> = {
  [PROF_CARTOGRAPHER]: [[], [], [explorerTrade('monument', 13, 10)], [], [explorerTrade('mansion', 14, 30)]],
};
