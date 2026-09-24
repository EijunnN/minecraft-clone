// Registro de objetos. Los objetos de bloque comparten id con su bloque (1..255 y, para las familias
// con estados como losas o puertas, el estado base a partir de 1024); el resto va de 256 a 1023 y usa
// un sprite 16x16 del atlas de objetos.
import { ARMOR_MATERIALS, ARMOR_PIECES, ARMOR_STATS, type ArmorInfo, type ArmorSlot } from './armor';
import {
  EFFECT_HUNGER, EFFECT_POISON, EFFECT_REGENERATION, EFFECT_ABSORPTION, type FoodEffect,
} from './effects';
import {
  BLOCKS, BLOCK_COUNT, R_NONE, WATER, LAVA, FURNACE, CHEST, OAK_LOG, BIRCH_LOG, SPRUCE_LOG, OAK_PLANKS,
  BIRCH_PLANKS, SPRUCE_PLANKS, CRAFTING_TABLE, BOOKSHELF, SAND, GLASS, COBBLESTONE, STONE, IRON_ORE, GOLD_ORE,
  WOOD_TYPES, ALL_LOGS, ALL_PLANKS, ALL_SAPLINGS, RED_SAND, CACTUS, LIME_WOOL, CLAY, TERRACOTTA, DOORS, RED_BED, FENCES,
  FENCE_GATES, TRAPDOORS, SLABS, STAIRS, LADDER, WHEAT_CROP, CARROTS, POTATOES, BEETROOTS, CAKE, baseBlock,
  PUMPKIN_STEM, MELON_STEM, BEDS, SIGNS, familyBase, CAVE_VINES, COPPER_ORE, DEEPSLATE_ORE, COBBLED_DEEPSLATE, DEEPSLATE,
} from './blocks';

export type ToolType = 'pickaxe' | 'axe' | 'shovel' | 'sword' | 'shears' | 'bow' | 'hoe' | 'shield' | 'fishing_rod';

export interface ToolInfo {
  kind: ToolType;
  /** Nivel de cosecha: 1 madera/oro, 2 piedra, 3 hierro, 4 diamante. */
  tier: number;
  /** Multiplicador de velocidad de minado con la herramienta correcta. */
  speed: number;
  durability: number;
  /** Daño al golpear (medios corazones). */
  damage: number;
  /** Golpes por segundo con la barra de ataque llena (Minecraft 1.9+; sin él, 4 como la mano). */
  attackSpeed?: number;
}

export interface FoodInfo {
  hunger: number;
  saturation: number;
  /** Efectos al comerlo: [efecto, segundos, nivel (0 = I), probabilidad]. */
  effects?: FoodEffect[];
  /** Se puede comer aunque no haya hambre (manzana dorada). */
  always?: boolean;
}

export interface ItemDef {
  id: number;
  key: string;
  name: string;
  stack: number;
  /** Bloque que coloca (objetos de bloque; los cubos colocan su fluido). */
  block?: number;
  /** Sprite del atlas de objetos (objetos que no son bloque). */
  sprite?: string;
  tool?: ToolInfo;
  food?: FoodInfo;
  /** Segundos que arde en un horno. */
  fuel?: number;
  /** Resultado al fundirlo en un horno. */
  smelt?: number;
  /** Se bebe (en cualquier momento, aunque no haya hambre): cubo de leche. */
  drink?: boolean;
  /** Pieza de armadura. */
  armor?: ArmorInfo;
}

export const ITEMS: ItemDef[] = [];

// ------------------------------------------------------------------ objetos de bloque
for (let id = 1; id < BLOCK_COUNT; id++) {
  const b = BLOCKS[id];
  // Sin variantes (fluidos en movimiento, hornos encendidos u orientados): sólo el bloque base es objeto.
  if (!b || b.render === R_NONE || b.level !== 0 || baseBlock(id) !== id || b.noItem) continue;
  ITEMS[id] = { id, key: b.key, name: b.name, stack: 64, block: id };
}
// Puertas y camas se ven como un dibujo plano (como en Minecraft); la cama no se apila.
for (const [wood, id] of Object.entries(DOORS)) ITEMS[id].sprite = `${wood}_door`;
// Camas y carteles también se ven planos; las camas no se apilan y los carteles, de 16 en 16.
for (const [color, id] of Object.entries(BEDS)) {
  ITEMS[id].sprite = `${color}_bed`;
  ITEMS[id].stack = 1;
}
for (const [wood, id] of Object.entries(SIGNS)) {
  ITEMS[id].sprite = `${wood}_sign`;
  ITEMS[id].stack = 16;
}

// ------------------------------------------------------------------ objetos
let nextId = 256;
function item(key: string, name: string, o: Partial<ItemDef> = {}): number {
  const id = nextId++;
  ITEMS[id] = { id, key, name, stack: 64, sprite: key, ...o };
  return id;
}

export const STICK = item('stick', 'Palo', { fuel: 5 });
export const COAL = item('coal', 'Carbón', { fuel: 80 });
export const CHARCOAL = item('charcoal', 'Carbón vegetal', { fuel: 80 });
export const IRON_INGOT = item('iron_ingot', 'Lingote de hierro');
export const GOLD_INGOT = item('gold_ingot', 'Lingote de oro');
export const DIAMOND = item('diamond', 'Diamante');
export const LAPIS = item('lapis_lazuli', 'Lapislázuli');
export const REDSTONE = item('redstone', 'Polvo de redstone');
export const FLINT = item('flint', 'Pedernal');
export const CLAY_BALL = item('clay_ball', 'Bola de arcilla');
export const BRICK = item('brick', 'Ladrillo');
export const BONE = item('bone', 'Hueso');
export const STRING = item('string', 'Cuerda');
export const FEATHER = item('feather', 'Pluma');
export const GUNPOWDER = item('gunpowder', 'Pólvora');
export const LEATHER = item('leather', 'Cuero');
export const ROTTEN_FLESH = item('rotten_flesh', 'Carne podrida', { food: { hunger: 4, saturation: 0.8 } });
export const PAPER = item('paper', 'Papel');
export const BOOK = item('book', 'Libro');
export const ENDER_PEARL = item('ender_pearl', 'Perla de ender', { stack: 16 });
export const APPLE = item('apple', 'Manzana', { food: { hunger: 4, saturation: 2.4 } });
export const RAW_PORKCHOP = item('raw_porkchop', 'Chuleta de cerdo cruda', { food: { hunger: 3, saturation: 1.8 } });
export const COOKED_PORKCHOP = item('cooked_porkchop', 'Chuleta de cerdo cocinada', { food: { hunger: 8, saturation: 12.8 } });
export const RAW_BEEF = item('raw_beef', 'Filete crudo', { food: { hunger: 3, saturation: 1.8 } });
export const STEAK = item('steak', 'Filete', { food: { hunger: 8, saturation: 12.8 } });
export const RAW_CHICKEN = item('raw_chicken', 'Pollo crudo', { food: { hunger: 2, saturation: 1.2 } });
export const COOKED_CHICKEN = item('cooked_chicken', 'Pollo asado', { food: { hunger: 6, saturation: 7.2 } });
export const RAW_MUTTON = item('raw_mutton', 'Cordero crudo', { food: { hunger: 2, saturation: 1.2 } });
export const COOKED_MUTTON = item('cooked_mutton', 'Cordero asado', { food: { hunger: 6, saturation: 9.6 } });
export const BREAD = item('bread', 'Pan', { food: { hunger: 5, saturation: 6 } });
export const BUCKET = item('bucket', 'Cubo', { stack: 16 });
export const WATER_BUCKET = item('water_bucket', 'Cubo de agua', { stack: 1, block: WATER });
export const LAVA_BUCKET = item('lava_bucket', 'Cubo de lava', { stack: 1, block: LAVA, fuel: 1000 });
export const BOW = item('bow', 'Arco', { stack: 1, fuel: 15, tool: { kind: 'bow', tier: 0, speed: 1, durability: 384, damage: 1 } });
export const ARROW = item('arrow', 'Flecha');
export const SHEARS = item('shears', 'Tijeras', { stack: 1, tool: { kind: 'shears', tier: 0, speed: 1.5, durability: 238, damage: 1 } });

/** Materiales de herramienta: [prefijo, nombre, nivel, velocidad de minado, durabilidad]. */
const MATERIALS: [string, string, number, number, number][] = [
  ['wooden', 'de madera', 1, 2, 59],
  ['stone', 'de piedra', 2, 4, 131],
  ['iron', 'de hierro', 3, 6, 250],
  ['golden', 'de oro', 1, 12, 32],
  ['diamond', 'de diamante', 4, 8, 1561],
];
const KINDS: [ToolType, string][] = [['pickaxe', 'Pico'], ['axe', 'Hacha'], ['shovel', 'Pala'], ['sword', 'Espada']];
/**
 * Daño por golpe y velocidad de ataque de Minecraft Java por tipo y material (madera, piedra,
 * hierro, oro, diamante): la espada es rápida, el hacha pega fuerte pero lenta.
 */
const COMBAT: Record<string, [damage: number[], speed: number[]]> = {
  sword: [[4, 5, 6, 4, 7], [1.6, 1.6, 1.6, 1.6, 1.6]],
  axe: [[7, 9, 9, 7, 9], [0.8, 0.8, 0.9, 1, 1]],
  pickaxe: [[2, 3, 4, 2, 5], [1.2, 1.2, 1.2, 1.2, 1.2]],
  shovel: [[2.5, 3.5, 4.5, 2.5, 5.5], [1, 1, 1, 1, 1]],
  hoe: [[1, 1, 1, 1, 1], [1, 2, 3, 1, 4]],
};
/** TOOLS[material][tipo] → id. */
export const TOOLS: Record<string, Record<string, number>> = {};
MATERIALS.forEach(([mat, matName, tier, speed, dur], m) => {
  TOOLS[mat] = {};
  for (const [kind, kindName] of KINDS) {
    TOOLS[mat][kind] = item(`${mat}_${kind}`, `${kindName} ${matName}`, {
      stack: 1,
      fuel: mat === 'wooden' ? 10 : undefined,
      tool: { kind, tier, speed, durability: dur, damage: COMBAT[kind][0][m], attackSpeed: COMBAT[kind][1][m] },
    });
  }
});

// ------------------------------------------------------------------ granja
// (Van al final para no cambiar los ids de los objetos guardados en inventarios y cofres.)
export const WHEAT_SEEDS = item('wheat_seeds', 'Semillas de trigo', { block: WHEAT_CROP });
export const WHEAT = item('wheat', 'Trigo');
export const CARROT = item('carrot', 'Zanahoria', { block: CARROTS, food: { hunger: 3, saturation: 3.6 } });
export const POTATO = item('potato', 'Patata', { block: POTATOES, food: { hunger: 1, saturation: 0.6 } });
export const BAKED_POTATO = item('baked_potato', 'Patata asada', { food: { hunger: 5, saturation: 6 } });
export const BEETROOT = item('beetroot', 'Remolacha', { food: { hunger: 1, saturation: 1.2 } });
export const BEETROOT_SEEDS = item('beetroot_seeds', 'Semillas de remolacha', { block: BEETROOTS });
export const BONE_MEAL = item('bone_meal', 'Polvo de hueso');
export const EGG = item('egg', 'Huevo', { stack: 16 });
export const MILK_BUCKET = item('milk_bucket', 'Cubo de leche', { stack: 1, drink: true });
export const SUGAR = item('sugar', 'Azúcar');
MATERIALS.forEach(([mat, matName, tier, speed, dur], m) => {
  TOOLS[mat].hoe = item(`${mat}_hoe`, `Azada ${matName}`, {
    stack: 1,
    fuel: mat === 'wooden' ? 10 : undefined,
    tool: { kind: 'hoe', tier, speed, durability: dur, damage: COMBAT.hoe[0][m], attackSpeed: COMBAT.hoe[1][m] },
  });
});
ITEMS[CAKE].stack = 1;

// ------------------------------------------------------------------ armaduras (fase 4)
const ARMOR_NAMES: Record<string, [string, string]> = {
  leather: ['de cuero', 'de cuero'], golden: ['de oro', 'de oro'], iron: ['de hierro', 'de hierro'], diamond: ['de diamante', 'de diamante'],
};
const PIECE_NAMES = ['Casco', 'Peto', 'Grebas', 'Botas'];
/** ARMOR[material][pieza] → id (materiales: leather, iron, golden, diamond). */
export const ARMOR: Record<string, Record<string, number>> = {};
for (const mat of ARMOR_MATERIALS) {
  ARMOR[mat] = {};
  const st = ARMOR_STATS[mat];
  ARMOR_PIECES.forEach((piece, slot) => {
    ARMOR[mat][piece] = item(`${mat}_${piece}`, `${PIECE_NAMES[slot]} ${ARMOR_NAMES[mat][0]}`, {
      stack: 1,
      armor: { slot: slot as ArmorSlot, material: mat, points: st.points[slot], toughness: st.toughness, durability: st.durability[slot] },
    });
  });
}

// ------------------------------------------------------------------ combate y estado (fase 4)
export const GOLDEN_APPLE = item('golden_apple', 'Manzana dorada', {
  food: { hunger: 4, saturation: 9.6, always: true, effects: [[EFFECT_REGENERATION, 5, 1, 1], [EFFECT_ABSORPTION, 120, 0, 1]] },
});
export const SPIDER_EYE = item('spider_eye', 'Ojo de araña', {
  food: { hunger: 2, saturation: 3.2, effects: [[EFFECT_POISON, 5, 0, 1]] },
});
/** Escudo: se levanta con clic derecho mantenido y bloquea lo que llega de frente. */
export const SHIELD = item('shield', 'Escudo', {
  stack: 1, fuel: 15, tool: { kind: 'shield', tier: 0, speed: 1, durability: 336, damage: 1 },
});

// ------------------------------------------------------------------ calabazas, sandías y pesca (fase 4)
export const PUMPKIN_SEEDS = item('pumpkin_seeds', 'Semillas de calabaza', { block: PUMPKIN_STEM });
export const MELON_SEEDS = item('melon_seeds', 'Semillas de sandía', { block: MELON_STEM });
export const MELON_SLICE = item('melon_slice', 'Rodaja de sandía', { food: { hunger: 2, saturation: 1.2 } });
export const PUMPKIN_PIE = item('pumpkin_pie', 'Tarta de calabaza', { food: { hunger: 8, saturation: 4.8 } });
export const FISHING_ROD = item('fishing_rod', 'Caña de pescar', {
  stack: 1, fuel: 15, tool: { kind: 'fishing_rod', tier: 0, speed: 1, durability: 64, damage: 1 },
});
export const COD = item('cod', 'Bacalao crudo', { food: { hunger: 2, saturation: 0.4 } });
export const COOKED_COD = item('cooked_cod', 'Bacalao cocinado', { food: { hunger: 5, saturation: 6 } });
export const SALMON = item('salmon', 'Salmón crudo', { food: { hunger: 2, saturation: 0.4 } });
export const COOKED_SALMON = item('cooked_salmon', 'Salmón cocinado', { food: { hunger: 6, saturation: 9.6 } });
export const TROPICAL_FISH = item('tropical_fish', 'Pez tropical', { food: { hunger: 1, saturation: 0.2 } });
/** Pez globo: Hambre III y Veneno II (como en Minecraft, sin la náusea). */
export const PUFFERFISH = item('pufferfish', 'Pez globo', {
  food: { hunger: 1, saturation: 0.2, effects: [[EFFECT_HUNGER, 15, 2, 1], [EFFECT_POISON, 60, 1, 1]] },
});

// ------------------------------------------------------------------ subsuelo (fase 5)
export const COPPER_INGOT = item('copper_ingot', 'Lingote de cobre');
export const EMERALD = item('emerald', 'Esmeralda');
export const AMETHYST_SHARD = item('amethyst_shard', 'Fragmento de amatista');
/** Bayas luminosas: se comen o se plantan bajo un techo (enredaderas de cueva). */
export const GLOW_BERRIES = item('glow_berries', 'Bayas luminosas', { block: CAVE_VINES, food: { hunger: 2, saturation: 0.4 } });

// ------------------------------------------------------------------ mapas, brújula y nieve (fase 5)
export const COMPASS = item('compass', 'Brújula');
export const EMPTY_MAP = item('map', 'Mapa vacío');
/** Mapa de una zona: la celda de 128×128 bloques va en `dmg` (ver maps.ts). */
export const FILLED_MAP = item('filled_map', 'Mapa');
export const SNOWBALL = item('snowball', 'Bola de nieve', { stack: 16 });

// Comida con efectos (valores de Minecraft).
ITEMS[ROTTEN_FLESH].food!.effects = [[EFFECT_HUNGER, 30, 0, 0.8]];
ITEMS[RAW_CHICKEN].food!.effects = [[EFFECT_HUNGER, 30, 0, 0.3]];

/** Comida que acepta cada animal para criar (y que le hace seguir al jugador). */
export const BREED_FOOD: Readonly<Record<string, readonly number[]>> = {
  cow: [WHEAT],
  sheep: [WHEAT],
  pig: [CARROT, POTATO, BEETROOT],
  chicken: [WHEAT_SEEDS, BEETROOT_SEEDS, PUMPKIN_SEEDS, MELON_SEEDS],
};

export const ITEM_COUNT = nextId;
if (ITEM_COUNT > 1024) throw new Error('Demasiados objetos: el rango 256..1023 está lleno');

// ------------------------------------------------------------------ combustibles y fundición
const fuel = (id: number, s: number) => {
  if (ITEMS[id]) ITEMS[id].fuel = s;
};
for (const id of [...ALL_LOGS, ...ALL_PLANKS, CRAFTING_TABLE, BOOKSHELF, CHEST]) fuel(id, 15);
for (const id of ALL_SAPLINGS) fuel(id, 5);
// Bloques de madera con forma (como en Minecraft: vallas, portillos y escaleras 15 s; losas 7,5 s…).
for (const { key: wood } of WOOD_TYPES) {
  for (const id of [FENCES[wood], FENCE_GATES[wood], STAIRS[wood], TRAPDOORS[wood]]) fuel(id, 15);
  fuel(SLABS[wood], 7.5);
  fuel(DOORS[wood], 10);
}
fuel(LADDER, 15);
for (const id of Object.values(SIGNS)) fuel(id, 10);

const smelt = (from: number, to: number) => {
  if (ITEMS[from]) ITEMS[from].smelt = to;
};
smelt(SAND, GLASS);
smelt(COBBLESTONE, STONE);
smelt(IRON_ORE, IRON_INGOT);
smelt(GOLD_ORE, GOLD_INGOT);
for (const log of ALL_LOGS) smelt(log, CHARCOAL);
smelt(RED_SAND, GLASS);
smelt(COPPER_ORE, COPPER_INGOT);
smelt(DEEPSLATE_ORE[IRON_ORE], IRON_INGOT);
smelt(DEEPSLATE_ORE[GOLD_ORE], GOLD_INGOT);
smelt(DEEPSLATE_ORE[COPPER_ORE], COPPER_INGOT);
smelt(COBBLED_DEEPSLATE, DEEPSLATE);
smelt(CLAY_BALL, BRICK);
smelt(CLAY, TERRACOTTA);
smelt(CACTUS, LIME_WOOL);
smelt(RAW_PORKCHOP, COOKED_PORKCHOP);
smelt(RAW_BEEF, STEAK);
smelt(RAW_CHICKEN, COOKED_CHICKEN);
smelt(RAW_MUTTON, COOKED_MUTTON);
smelt(POTATO, BAKED_POTATO);
smelt(COD, COOKED_COD);
smelt(SALMON, COOKED_SALMON);

// Los hornos y cofres se apilan hasta 64 como bloque base.
void FURNACE;

/** Nombres de sprite del atlas de objetos (en orden de capa). */
export const ITEM_SPRITES: readonly string[] = ITEMS.filter((i) => i && i.sprite).map((i) => i.sprite!);
const spriteIndex = new Map<string, number>();
ITEM_SPRITES.forEach((n, i) => spriteIndex.set(n, i));
export function itemSpriteIndex(id: number): number {
  const s = ITEMS[id]?.sprite;
  return s ? spriteIndex.get(s) ?? -1 : -1;
}

/**
 * Objeto que corresponde a un bloque del mundo (clic central): el propio bloque, su estado base
 * (hornos encendidos, carteles de pared, cofres dobles) o lo que lo planta (semillas, zanahorias…).
 */
export function itemForBlock(block: number): number {
  if (block <= 0 || BLOCKS[block]?.fluid) return 0;
  const base = baseBlock(block);
  if (ITEMS[base]?.block === base) return base;
  const fam = familyBase(block);
  const planter = ITEMS.find((i) => i && i.block === fam && !i.tool);
  return planter ? planter.id : 0;
}

export function isValidItem(id: number): boolean {
  return Number.isInteger(id) && id > 0 && id < ITEMS.length && ITEMS[id] !== undefined;
}

export function itemName(id: number): string {
  return ITEMS[id]?.name ?? '?';
}

export function maxStack(id: number): number {
  return ITEMS[id]?.stack ?? 64;
}

/** Una pila de objetos. `dmg` es el desgaste acumulado (herramientas). */
export interface ItemStack {
  id: number;
  count: number;
  dmg?: number;
}

export function sameKind(a: ItemStack | null, b: ItemStack | null): boolean {
  return !!a && !!b && a.id === b.id && (a.dmg ?? 0) === (b.dmg ?? 0) && !ITEMS[a.id]?.tool;
}

/** Objetos del inventario creativo que no son bloques. */
export const CREATIVE_ITEMS: readonly number[] = [
  STICK, COAL, CHARCOAL, IRON_INGOT, GOLD_INGOT, DIAMOND, LAPIS, REDSTONE, FLINT, CLAY_BALL, BRICK, BONE, STRING,
  FEATHER, GUNPOWDER, LEATHER, ROTTEN_FLESH, PAPER, BOOK, ENDER_PEARL, APPLE, BREAD, RAW_PORKCHOP, COOKED_PORKCHOP,
  RAW_BEEF, STEAK, RAW_CHICKEN, COOKED_CHICKEN, RAW_MUTTON, COOKED_MUTTON, BUCKET, WATER_BUCKET, LAVA_BUCKET, BOW,
  ARROW, SHEARS, WHEAT_SEEDS, WHEAT, CARROT, POTATO, BAKED_POTATO, BEETROOT, BEETROOT_SEEDS, BONE_MEAL, EGG, SUGAR,
  MILK_BUCKET,
  ...Object.values(TOOLS).flatMap((t) => Object.values(t)),
  ...Object.values(ARMOR).flatMap((a) => Object.values(a)),
  GOLDEN_APPLE, SPIDER_EYE, SHIELD, PUMPKIN_SEEDS, MELON_SEEDS, MELON_SLICE, PUMPKIN_PIE, FISHING_ROD, COD, COOKED_COD,
  SALMON, COOKED_SALMON, TROPICAL_FISH, PUFFERFISH, COPPER_INGOT, EMERALD, AMETHYST_SHARD, GLOW_BERRIES, COMPASS, EMPTY_MAP,
  SNOWBALL,
];

/** Bloques que algún objeto sabe colocar (el servidor sólo acepta éstos en 'place'). */
export const PLACEABLE_BLOCKS: ReadonlySet<number> = new Set(
  ITEMS.filter((i) => i && i.block !== undefined && !i.tool).map((i) => i.block!),
);
