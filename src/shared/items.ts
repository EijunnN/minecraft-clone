// Registro de objetos. Los objetos de bloque comparten id con su bloque (1..255 y, para las familias
// con estados como losas o puertas, el estado base a partir de 1024); el resto va de 256 a 1023 y usa
// un sprite 16x16 del atlas de objetos.
import {
  BLOCKS, BLOCK_COUNT, R_NONE, WATER, LAVA, FURNACE, CHEST, OAK_LOG, BIRCH_LOG, SPRUCE_LOG, OAK_PLANKS,
  BIRCH_PLANKS, SPRUCE_PLANKS, CRAFTING_TABLE, BOOKSHELF, SAND, GLASS, COBBLESTONE, STONE, IRON_ORE, GOLD_ORE,
  OAK_SAPLING, BIRCH_SAPLING, SPRUCE_SAPLING, CACTUS, LIME_WOOL, CLAY, TERRACOTTA, DOORS, RED_BED, FENCES,
  FENCE_GATES, TRAPDOORS, SLABS, STAIRS, LADDER, baseBlock,
} from './blocks';

export type ToolType = 'pickaxe' | 'axe' | 'shovel' | 'sword' | 'shears' | 'bow';

export interface ToolInfo {
  kind: ToolType;
  /** Nivel de cosecha: 1 madera/oro, 2 piedra, 3 hierro, 4 diamante. */
  tier: number;
  /** Multiplicador de velocidad de minado con la herramienta correcta. */
  speed: number;
  durability: number;
  /** Daño al golpear (medios corazones). */
  damage: number;
}

export interface FoodInfo {
  hunger: number;
  saturation: number;
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
}

export const ITEMS: ItemDef[] = [];

// ------------------------------------------------------------------ objetos de bloque
for (let id = 1; id < BLOCK_COUNT; id++) {
  const b = BLOCKS[id];
  // Sin variantes (fluidos en movimiento, hornos encendidos u orientados): sólo el bloque base es objeto.
  if (!b || b.render === R_NONE || b.level !== 0 || baseBlock(id) !== id) continue;
  ITEMS[id] = { id, key: b.key, name: b.name, stack: 64, block: id };
}
// Puertas y camas se ven como un dibujo plano (como en Minecraft); la cama no se apila.
for (const [wood, id] of Object.entries(DOORS)) ITEMS[id].sprite = `${wood}_door`;
ITEMS[RED_BED].sprite = 'red_bed';
ITEMS[RED_BED].stack = 1;

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

/** Materiales de herramienta: [prefijo, nombre, nivel, velocidad, durabilidad, daño de espada]. */
const MATERIALS: [string, string, number, number, number, number][] = [
  ['wooden', 'de madera', 1, 2, 59, 4],
  ['stone', 'de piedra', 2, 4, 131, 5],
  ['iron', 'de hierro', 3, 6, 250, 6],
  ['golden', 'de oro', 1, 12, 32, 4],
  ['diamond', 'de diamante', 4, 8, 1561, 7],
];
const KINDS: [ToolType, string, number][] = [
  ['pickaxe', 'Pico', -2],
  ['axe', 'Hacha', -1],
  ['shovel', 'Pala', -3],
  ['sword', 'Espada', 0],
];
/** TOOLS[material][tipo] → id. */
export const TOOLS: Record<string, Record<string, number>> = {};
for (const [mat, matName, tier, speed, dur, dmg] of MATERIALS) {
  TOOLS[mat] = {};
  for (const [kind, kindName, dmgOffset] of KINDS) {
    TOOLS[mat][kind] = item(`${mat}_${kind}`, `${kindName} ${matName}`, {
      stack: 1,
      fuel: mat === 'wooden' ? 10 : undefined,
      tool: { kind, tier, speed, durability: dur, damage: Math.max(1, dmg + dmgOffset) },
    });
  }
}

export const ITEM_COUNT = nextId;
if (ITEM_COUNT > 1024) throw new Error('Demasiados objetos: el rango 256..1023 está lleno');

// ------------------------------------------------------------------ combustibles y fundición
const fuel = (id: number, s: number) => {
  if (ITEMS[id]) ITEMS[id].fuel = s;
};
for (const id of [OAK_LOG, BIRCH_LOG, SPRUCE_LOG, OAK_PLANKS, BIRCH_PLANKS, SPRUCE_PLANKS, CRAFTING_TABLE, BOOKSHELF, CHEST]) fuel(id, 15);
for (const id of [OAK_SAPLING, BIRCH_SAPLING, SPRUCE_SAPLING]) fuel(id, 5);
// Bloques de madera con forma (como en Minecraft: vallas, portillos y escaleras 15 s; losas 7,5 s…).
for (const wood of ['oak', 'birch', 'spruce']) {
  for (const id of [FENCES[wood], FENCE_GATES[wood], STAIRS[wood], TRAPDOORS[wood]]) fuel(id, 15);
  fuel(SLABS[wood], 7.5);
  fuel(DOORS[wood], 10);
}
fuel(LADDER, 15);

const smelt = (from: number, to: number) => {
  if (ITEMS[from]) ITEMS[from].smelt = to;
};
smelt(SAND, GLASS);
smelt(COBBLESTONE, STONE);
smelt(IRON_ORE, IRON_INGOT);
smelt(GOLD_ORE, GOLD_INGOT);
smelt(OAK_LOG, CHARCOAL);
smelt(BIRCH_LOG, CHARCOAL);
smelt(SPRUCE_LOG, CHARCOAL);
smelt(CLAY_BALL, BRICK);
smelt(CLAY, TERRACOTTA);
smelt(CACTUS, LIME_WOOL);
smelt(RAW_PORKCHOP, COOKED_PORKCHOP);
smelt(RAW_BEEF, STEAK);
smelt(RAW_CHICKEN, COOKED_CHICKEN);
smelt(RAW_MUTTON, COOKED_MUTTON);

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
  ARROW, SHEARS,
  ...Object.values(TOOLS).flatMap((t) => Object.values(t)),
];
