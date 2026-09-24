// Registro de bloques compartido por el cliente, los workers de generación/mallado y el servidor.
import { textureLayer, TEXTURE_DEFS } from './textureDefs';
import { MAX_BLOCK_ID, FIRST_EXTENDED_BLOCK } from './constants';
import { mbox, rotateBoxes, rotateFlat, flatBoxes, unionBox, DIR_X, DIR_Z, type ModelBox } from './blockModels';

/** Tipos de renderizado de un bloque. */
export const R_NONE = 0; // aire
export const R_CUBE = 1; // cubo opaco (pasada opaca)
export const R_CUTOUT = 2; // cubo completo con recorte alpha (hojas, cristal)
export const R_CROSS = 3; // planta en cruz
export const R_WATER = 4; // agua (pasada translúcida)
export const R_TRANSLUCENT = 5; // hielo (pasada translúcida)
export const R_TORCH = 6; // antorcha
export const R_CACTUS = 7; // cactus (caras laterales hundidas 1/16)
export const R_LAVA = 8; // lava (opaca, emisiva, superficie rebajada)
export const R_MODEL = 9; // forma hecha de cajas (losas, escaleras, vallas, puertas…)

/** Vecino relativo (dx, dy, dz) → id del bloque (-1 si no se sabe). */
export type NeighborGet = (dx: number, dy: number, dz: number) => number;

export type SoundMaterial =
  | 'stone'
  | 'wood'
  | 'grass'
  | 'dirt'
  | 'sand'
  | 'gravel'
  | 'glass'
  | 'snow'
  | 'wool'
  | 'metal'
  | 'leaves'
  | 'water'
  | 'lava';

export type BlockCategory = 'construccion' | 'naturaleza' | 'minerales' | 'decoracion' | 'colores';

export interface BlockDef {
  id: number;
  key: string;
  /** Nombre visible (en español). */
  name: string;
  render: number;
  /** Colisiona con el jugador. */
  solid: boolean;
  /** Cubo opaco completo: oculta caras vecinas, bloquea la luz y proyecta oclusión ambiental. */
  opaque: boolean;
  /** Cuánto reduce la luz al atravesarlo (0..15). */
  lightOpacity: number;
  /** Nivel de luz emitida (0..15). */
  emission: number;
  /** Texturas por cara: +X, -X, +Y, -Y, +Z, -Z. */
  tex: [string, string, string, string, string, string];
  sound: SoundMaterial;
  /** Se puede colocar otro bloque encima de su celda (aire, agua, hierba...). */
  replaceable: boolean;
  breakable: boolean;
  category: BlockCategory | null;
  /** Dureza estilo Minecraft (segundos base de minado); -1 = irrompible. */
  hardness: number;
  /** Herramienta adecuada para minarlo. */
  tool: ToolKind | null;
  /** Nivel mínimo de pico para que suelte algo (0 = cualquiera, 1 madera, 2 piedra, 3 hierro, 4 diamante). */
  tier: number;
  /** 0 = no es fluido, 1 = agua, 2 = lava. */
  fluid: number;
  /** Nivel del fluido: 0 fuente, 1..7 fluyendo (más alto = más lejos), 8 cayendo. */
  level: number;
  /** Forma fija hecha de cajas (render R_MODEL). */
  model?: ModelBox[];
  /** Forma que depende de los vecinos (vallas, paneles). */
  shape?: (get: NeighborGet) => ModelBox[];
  /** Modelo para la mano y el inventario (si la forma depende de los vecinos). */
  itemModel?: ModelBox[];
  /** Cajas de colisión (0..1, 6 números por caja); por defecto las del modelo o el cubo. */
  collision?: number[] | ((get: NeighborGet) => number[]);
  /** Cajas de selección (contorno y rayo). */
  selection?: number[] | ((get: NeighborGet) => number[]);
  /** Bloque que se obtiene como objeto (estados de una familia → su estado base). */
  base?: number;
  /** Se puede trepar (escalera de mano). */
  climbable?: boolean;
  /** Apoyado en una pared: dirección (0 N, 1 E, 2 S, 3 O) hacia la que mira; la pared está detrás. */
  wall?: number;
  /** Las criaturas pueden cruzarlo (puertas y portillos abiertos). */
  walkThrough?: boolean;
  /** Textura con la que se dibuja plano como objeto (escalera de mano, panel). */
  flatItem?: string;
}

export type ToolKind = 'pickaxe' | 'axe' | 'shovel';

type Opts = Partial<Omit<BlockDef, 'id' | 'key' | 'name' | 'tex'>> & {
  all?: string;
  top?: string;
  bottom?: string;
  side?: string;
  tex?: BlockDef['tex'];
};

const defs: BlockDef[] = [];

function def(id: number, key: string, name: string, o: Opts): void {
  const side = o.side ?? o.all ?? 'stone';
  const top = o.top ?? o.all ?? side;
  const bottom = o.bottom ?? o.top ?? o.all ?? side;
  const tex: BlockDef['tex'] = o.tex ?? [side, side, top, bottom, side, side];
  const render = o.render ?? R_CUBE;
  const opaque = o.opaque ?? render === R_CUBE;
  defs[id] = {
    id,
    key,
    name,
    render,
    solid: o.solid ?? true,
    opaque,
    lightOpacity: o.lightOpacity ?? (opaque ? 15 : 0),
    emission: o.emission ?? 0,
    tex,
    sound: o.sound ?? 'stone',
    replaceable: o.replaceable ?? false,
    breakable: o.breakable ?? true,
    category: o.category === undefined ? 'construccion' : o.category,
    hardness: o.hardness ?? 1.5,
    tool: o.tool === undefined ? null : o.tool,
    tier: o.tier ?? 0,
    fluid: o.fluid ?? 0,
    level: o.level ?? 0,
    model: o.model,
    shape: o.shape,
    itemModel: o.itemModel,
    collision: o.collision,
    selection: o.selection,
    base: o.base,
    climbable: o.climbable,
    wall: o.wall,
    walkThrough: o.walkThrough,
    flatItem: o.flatItem,
  };
}

export const AIR = 0;
export const STONE = 1;
export const GRASS = 2;
export const DIRT = 3;
export const COBBLESTONE = 4;
export const OAK_PLANKS = 5;
export const BEDROCK = 6;
export const SAND = 7;
export const GRAVEL = 8;
export const OAK_LOG = 9;
export const OAK_LEAVES = 10;
export const GLASS = 11;
export const WATER = 12;
export const COAL_ORE = 13;
export const IRON_ORE = 14;
export const GOLD_ORE = 15;
export const DIAMOND_ORE = 16;
export const LAPIS_ORE = 17;
export const REDSTONE_ORE = 18;
export const SANDSTONE = 19;
export const SNOWY_GRASS = 20;
export const SNOW_BLOCK = 21;
export const ICE = 22;
export const CLAY = 23;
export const CACTUS = 24;
export const BIRCH_LOG = 25;
export const BIRCH_LEAVES = 26;
export const SPRUCE_LOG = 27;
export const SPRUCE_LEAVES = 28;
export const SHORT_GRASS = 29;
export const FERN = 30;
export const POPPY = 31;
export const DANDELION = 32;
export const CORNFLOWER = 33;
export const DEAD_BUSH = 34;
export const SUGAR_CANE = 35;
export const RED_MUSHROOM = 36;
export const BROWN_MUSHROOM = 37;
export const TORCH = 38;
export const GLOWSTONE = 39;
export const SEA_LANTERN = 40;
export const LAVA = 41;
export const BRICKS = 42;
export const STONE_BRICKS = 43;
export const MOSSY_COBBLESTONE = 44;
export const OBSIDIAN = 45;
export const BOOKSHELF = 46;
export const CRAFTING_TABLE = 47;
export const PUMPKIN = 48;
export const HAY_BALE = 49;
export const BIRCH_PLANKS = 50;
export const SPRUCE_PLANKS = 51;
export const GRANITE = 52;
export const DIORITE = 53;
export const ANDESITE = 54;
export const TERRACOTTA = 55;
export const QUARTZ_BLOCK = 56;
export const GOLD_BLOCK = 57;
export const IRON_BLOCK = 58;
export const DIAMOND_BLOCK = 59;
export const COPPER_BLOCK = 60;
export const WHITE_WOOL = 61;
export const BLACK_WOOL = 62;
export const RED_WOOL = 63;
export const ORANGE_WOOL = 64;
export const YELLOW_WOOL = 65;
export const LIME_WOOL = 66;
export const BLUE_WOOL = 67;
export const PURPLE_WOOL = 68;
/** Agua fluyendo (niveles 1..7) y cayendo. */
export const WATER_FLOW_1 = 69;
export const WATER_FALL = 76;
/** Lava fluyendo (niveles 1..3, cada uno equivale a 2 niveles de Minecraft) y cayendo. */
export const LAVA_FLOW_1 = 77;
export const LAVA_FALL = 80;
/** Horno orientado (frente hacia N=-Z, E=+X, S=+Z, O=-X) y encendido. */
export const FURNACE = 81;
export const FURNACE_LIT = 85;
/** Cofre orientado. */
export const CHEST = 89;
export const OAK_SAPLING = 93;
export const BIRCH_SAPLING = 94;
export const SPRUCE_SAPLING = 95;

const plant = (o: Opts): Opts => ({
  render: R_CROSS,
  solid: false,
  opaque: false,
  lightOpacity: 0,
  sound: 'grass',
  replaceable: false,
  category: 'naturaleza',
  ...o,
});

def(AIR, 'air', 'Aire', { render: R_NONE, solid: false, opaque: false, replaceable: true, all: 'stone', category: null });
def(STONE, 'stone', 'Piedra', { all: 'stone' });
def(GRASS, 'grass_block', 'Bloque de hierba', { top: 'grass_top', bottom: 'dirt', side: 'grass_side', sound: 'grass', category: 'naturaleza' });
def(DIRT, 'dirt', 'Tierra', { all: 'dirt', sound: 'dirt', category: 'naturaleza' });
def(COBBLESTONE, 'cobblestone', 'Roca', { all: 'cobblestone' });
def(OAK_PLANKS, 'oak_planks', 'Tablones de roble', { all: 'oak_planks', sound: 'wood' });
def(BEDROCK, 'bedrock', 'Lecho de roca', { all: 'bedrock', breakable: false, category: null });
def(SAND, 'sand', 'Arena', { all: 'sand', sound: 'sand', category: 'naturaleza' });
def(GRAVEL, 'gravel', 'Grava', { all: 'gravel', sound: 'gravel', category: 'naturaleza' });
def(OAK_LOG, 'oak_log', 'Tronco de roble', { top: 'oak_log_top', side: 'oak_log_side', sound: 'wood', category: 'naturaleza' });
def(OAK_LEAVES, 'oak_leaves', 'Hojas de roble', { all: 'oak_leaves', render: R_CUTOUT, lightOpacity: 1, sound: 'leaves', category: 'naturaleza' });
def(GLASS, 'glass', 'Cristal', { all: 'glass', render: R_CUTOUT, lightOpacity: 0, sound: 'glass' });
def(WATER, 'water', 'Agua', { all: 'water', render: R_WATER, solid: false, lightOpacity: 2, sound: 'water', replaceable: true, category: 'naturaleza' });
def(COAL_ORE, 'coal_ore', 'Mena de carbón', { all: 'coal_ore', category: 'minerales' });
def(IRON_ORE, 'iron_ore', 'Mena de hierro', { all: 'iron_ore', category: 'minerales' });
def(GOLD_ORE, 'gold_ore', 'Mena de oro', { all: 'gold_ore', category: 'minerales' });
def(DIAMOND_ORE, 'diamond_ore', 'Mena de diamante', { all: 'diamond_ore', category: 'minerales' });
def(LAPIS_ORE, 'lapis_ore', 'Mena de lapislázuli', { all: 'lapis_ore', category: 'minerales' });
def(REDSTONE_ORE, 'redstone_ore', 'Mena de redstone', { all: 'redstone_ore', category: 'minerales' });
def(SANDSTONE, 'sandstone', 'Arenisca', { top: 'sandstone_top', bottom: 'sandstone_bottom', side: 'sandstone_side' });
def(SNOWY_GRASS, 'snowy_grass_block', 'Hierba nevada', { top: 'snow', bottom: 'dirt', side: 'grass_side_snowy', sound: 'snow', category: 'naturaleza' });
def(SNOW_BLOCK, 'snow_block', 'Bloque de nieve', { all: 'snow', sound: 'snow', category: 'naturaleza' });
def(ICE, 'ice', 'Hielo', { all: 'ice', render: R_TRANSLUCENT, lightOpacity: 2, sound: 'glass', category: 'naturaleza' });
def(CLAY, 'clay', 'Arcilla', { all: 'clay', sound: 'dirt', category: 'naturaleza' });
def(CACTUS, 'cactus', 'Cactus', { top: 'cactus_top', bottom: 'cactus_bottom', side: 'cactus_side', render: R_CACTUS, lightOpacity: 0, sound: 'wool', category: 'naturaleza' });
def(BIRCH_LOG, 'birch_log', 'Tronco de abedul', { top: 'birch_log_top', side: 'birch_log_side', sound: 'wood', category: 'naturaleza' });
def(BIRCH_LEAVES, 'birch_leaves', 'Hojas de abedul', { all: 'birch_leaves', render: R_CUTOUT, lightOpacity: 1, sound: 'leaves', category: 'naturaleza' });
def(SPRUCE_LOG, 'spruce_log', 'Tronco de abeto', { top: 'spruce_log_top', side: 'spruce_log_side', sound: 'wood', category: 'naturaleza' });
def(SPRUCE_LEAVES, 'spruce_leaves', 'Hojas de abeto', { all: 'spruce_leaves', render: R_CUTOUT, lightOpacity: 1, sound: 'leaves', category: 'naturaleza' });
def(SHORT_GRASS, 'short_grass', 'Hierba', plant({ all: 'short_grass', replaceable: true }));
def(FERN, 'fern', 'Helecho', plant({ all: 'fern', replaceable: true }));
def(POPPY, 'poppy', 'Amapola', plant({ all: 'poppy' }));
def(DANDELION, 'dandelion', 'Diente de león', plant({ all: 'dandelion' }));
def(CORNFLOWER, 'cornflower', 'Aciano', plant({ all: 'cornflower' }));
def(DEAD_BUSH, 'dead_bush', 'Arbusto seco', plant({ all: 'dead_bush', replaceable: true }));
def(SUGAR_CANE, 'sugar_cane', 'Caña de azúcar', plant({ all: 'sugar_cane' }));
def(RED_MUSHROOM, 'red_mushroom', 'Champiñón rojo', plant({ all: 'red_mushroom' }));
def(BROWN_MUSHROOM, 'brown_mushroom', 'Champiñón marrón', plant({ all: 'brown_mushroom' }));
def(TORCH, 'torch', 'Antorcha', { all: 'torch', render: R_TORCH, solid: false, lightOpacity: 0, emission: 14, sound: 'wood', category: 'decoracion' });
def(GLOWSTONE, 'glowstone', 'Piedra luminosa', { all: 'glowstone', emission: 15, sound: 'glass', category: 'decoracion' });
def(SEA_LANTERN, 'sea_lantern', 'Linterna marina', { all: 'sea_lantern', emission: 15, sound: 'glass', category: 'decoracion' });
def(LAVA, 'lava', 'Lava', { all: 'lava', render: R_LAVA, solid: false, opaque: false, lightOpacity: 15, emission: 15, sound: 'lava', replaceable: true, category: 'naturaleza' });
def(BRICKS, 'bricks', 'Ladrillos', { all: 'bricks' });
def(STONE_BRICKS, 'stone_bricks', 'Ladrillos de piedra', { all: 'stone_bricks' });
def(MOSSY_COBBLESTONE, 'mossy_cobblestone', 'Roca musgosa', { all: 'mossy_cobblestone' });
def(OBSIDIAN, 'obsidian', 'Obsidiana', { all: 'obsidian' });
def(BOOKSHELF, 'bookshelf', 'Librería', { top: 'oak_planks', side: 'bookshelf', sound: 'wood', category: 'decoracion' });
def(CRAFTING_TABLE, 'crafting_table', 'Mesa de trabajo', {
  tex: ['crafting_table_side', 'crafting_table_side', 'crafting_table_top', 'oak_planks', 'crafting_table_front', 'crafting_table_side'],
  sound: 'wood',
  category: 'decoracion',
});
def(PUMPKIN, 'pumpkin', 'Calabaza', { top: 'pumpkin_top', side: 'pumpkin_side', sound: 'wood', category: 'decoracion' });
def(HAY_BALE, 'hay_bale', 'Fardo de heno', { top: 'hay_bale_top', side: 'hay_bale_side', sound: 'grass', category: 'decoracion' });
def(BIRCH_PLANKS, 'birch_planks', 'Tablones de abedul', { all: 'birch_planks', sound: 'wood' });
def(SPRUCE_PLANKS, 'spruce_planks', 'Tablones de abeto', { all: 'spruce_planks', sound: 'wood' });
def(GRANITE, 'granite', 'Granito', { all: 'granite' });
def(DIORITE, 'diorite', 'Diorita', { all: 'diorite' });
def(ANDESITE, 'andesite', 'Andesita', { all: 'andesite' });
def(TERRACOTTA, 'terracotta', 'Terracota', { all: 'terracotta' });
def(QUARTZ_BLOCK, 'quartz_block', 'Bloque de cuarzo', { all: 'quartz_block' });
def(GOLD_BLOCK, 'gold_block', 'Bloque de oro', { all: 'gold_block', sound: 'metal', category: 'minerales' });
def(IRON_BLOCK, 'iron_block', 'Bloque de hierro', { all: 'iron_block', sound: 'metal', category: 'minerales' });
def(DIAMOND_BLOCK, 'diamond_block', 'Bloque de diamante', { all: 'diamond_block', sound: 'metal', category: 'minerales' });
def(COPPER_BLOCK, 'copper_block', 'Bloque de cobre', { all: 'copper_block', sound: 'metal', category: 'minerales' });
def(WHITE_WOOL, 'white_wool', 'Lana blanca', { all: 'white_wool', sound: 'wool', category: 'colores' });
def(BLACK_WOOL, 'black_wool', 'Lana negra', { all: 'black_wool', sound: 'wool', category: 'colores' });
def(RED_WOOL, 'red_wool', 'Lana roja', { all: 'red_wool', sound: 'wool', category: 'colores' });
def(ORANGE_WOOL, 'orange_wool', 'Lana naranja', { all: 'orange_wool', sound: 'wool', category: 'colores' });
def(YELLOW_WOOL, 'yellow_wool', 'Lana amarilla', { all: 'yellow_wool', sound: 'wool', category: 'colores' });
def(LIME_WOOL, 'lime_wool', 'Lana verde lima', { all: 'lime_wool', sound: 'wool', category: 'colores' });
def(BLUE_WOOL, 'blue_wool', 'Lana azul', { all: 'blue_wool', sound: 'wool', category: 'colores' });
def(PURPLE_WOOL, 'purple_wool', 'Lana morada', { all: 'purple_wool', sound: 'wool', category: 'colores' });

// Fluidos en movimiento (no aparecen en el inventario).
for (let l = 1; l <= 7; l++) {
  def(WATER_FLOW_1 + l - 1, 'water_flow_' + l, 'Agua', {
    all: 'water', render: R_WATER, solid: false, lightOpacity: 2, sound: 'water', replaceable: true, category: null,
    fluid: 1, level: l, hardness: -1,
  });
}
def(WATER_FALL, 'water_fall', 'Agua', {
  all: 'water', render: R_WATER, solid: false, lightOpacity: 2, sound: 'water', replaceable: true, category: null,
  fluid: 1, level: 8, hardness: -1,
});
for (let l = 1; l <= 3; l++) {
  def(LAVA_FLOW_1 + l - 1, 'lava_flow_' + l, 'Lava', {
    all: 'lava', render: R_LAVA, solid: false, opaque: false, lightOpacity: 15, emission: 15 - l, sound: 'lava',
    replaceable: true, category: null, fluid: 2, level: l, hardness: -1,
  });
}
def(LAVA_FALL, 'lava_fall', 'Lava', {
  all: 'lava', render: R_LAVA, solid: false, opaque: false, lightOpacity: 15, emission: 15, sound: 'lava',
  replaceable: true, category: null, fluid: 2, level: 8, hardness: -1,
});
defs[WATER].fluid = 1;
defs[LAVA].fluid = 2;
defs[WATER].hardness = -1;
defs[LAVA].hardness = -1;

// Bloques orientados: el frente mira hacia el jugador que los coloca.
const FACING_FACE = [5, 0, 4, 1]; // N (-Z), E (+X), S (+Z), O (-X) -> índice de cara
function oriented(base: number, key: string, name: string, front: string, side: string, top: string, o: Opts): void {
  for (let f = 0; f < 4; f++) {
    const tex: BlockDef['tex'] = [side, side, top, top, side, side];
    tex[FACING_FACE[f]] = front;
    def(base + f, f === 0 ? key : key + '_' + f, name, { ...o, tex, category: f === 0 ? o.category ?? 'decoracion' : null });
  }
}
oriented(FURNACE, 'furnace', 'Horno', 'furnace_front', 'furnace_side', 'furnace_top', { hardness: 3.5, tool: 'pickaxe', tier: 1 });
oriented(FURNACE_LIT, 'furnace_lit', 'Horno', 'furnace_front_lit', 'furnace_side', 'furnace_top', {
  hardness: 3.5, tool: 'pickaxe', tier: 1, emission: 13, category: null,
});
for (let f = 0; f < 4; f++) defs[FURNACE_LIT + f].category = null;
oriented(CHEST, 'chest', 'Cofre', 'chest_front', 'chest_side', 'chest_top', { hardness: 2.5, tool: 'axe', sound: 'wood' });
def(OAK_SAPLING, 'oak_sapling', 'Brote de roble', plant({ all: 'oak_sapling', hardness: 0 }));
def(BIRCH_SAPLING, 'birch_sapling', 'Brote de abedul', plant({ all: 'birch_sapling', hardness: 0 }));
def(SPRUCE_SAPLING, 'spruce_sapling', 'Brote de abeto', plant({ all: 'spruce_sapling', hardness: 0 }));

/** [dureza, herramienta, nivel] por clave de bloque (valores de Minecraft). */
const MINING: Record<string, [number, ToolKind | null, number]> = {
  stone: [1.5, 'pickaxe', 1], cobblestone: [2, 'pickaxe', 1], mossy_cobblestone: [2, 'pickaxe', 1],
  stone_bricks: [1.5, 'pickaxe', 1], bricks: [2, 'pickaxe', 1], granite: [1.5, 'pickaxe', 1],
  diorite: [1.5, 'pickaxe', 1], andesite: [1.5, 'pickaxe', 1], sandstone: [0.8, 'pickaxe', 1],
  terracotta: [1.25, 'pickaxe', 1], quartz_block: [0.8, 'pickaxe', 1], obsidian: [50, 'pickaxe', 4],
  coal_ore: [3, 'pickaxe', 1], iron_ore: [3, 'pickaxe', 2], gold_ore: [3, 'pickaxe', 3],
  diamond_ore: [3, 'pickaxe', 3], lapis_ore: [3, 'pickaxe', 2], redstone_ore: [3, 'pickaxe', 3],
  gold_block: [3, 'pickaxe', 3], iron_block: [5, 'pickaxe', 2], diamond_block: [5, 'pickaxe', 3],
  copper_block: [3, 'pickaxe', 2], ice: [0.5, 'pickaxe', 0],
  grass_block: [0.6, 'shovel', 0], dirt: [0.5, 'shovel', 0], sand: [0.5, 'shovel', 0], gravel: [0.6, 'shovel', 0],
  clay: [0.6, 'shovel', 0], snow_block: [0.2, 'shovel', 0], snowy_grass_block: [0.6, 'shovel', 0],
  oak_log: [2, 'axe', 0], birch_log: [2, 'axe', 0], spruce_log: [2, 'axe', 0], oak_planks: [2, 'axe', 0],
  birch_planks: [2, 'axe', 0], spruce_planks: [2, 'axe', 0], bookshelf: [1.5, 'axe', 0],
  crafting_table: [2.5, 'axe', 0], pumpkin: [1, 'axe', 0],
  oak_leaves: [0.2, null, 0], birch_leaves: [0.2, null, 0], spruce_leaves: [0.2, null, 0], glass: [0.3, null, 0],
  glowstone: [0.3, null, 0], sea_lantern: [0.3, null, 0], hay_bale: [0.5, null, 0], cactus: [0.4, null, 0],
  white_wool: [0.8, null, 0], black_wool: [0.8, null, 0], red_wool: [0.8, null, 0], orange_wool: [0.8, null, 0],
  yellow_wool: [0.8, null, 0], lime_wool: [0.8, null, 0], blue_wool: [0.8, null, 0], purple_wool: [0.8, null, 0],
  torch: [0, null, 0], short_grass: [0, null, 0], fern: [0, null, 0], poppy: [0, null, 0], dandelion: [0, null, 0],
  cornflower: [0, null, 0], dead_bush: [0, null, 0], sugar_cane: [0, null, 0], red_mushroom: [0, null, 0],
  brown_mushroom: [0, null, 0], bedrock: [-1, null, 0], air: [0, null, 0],
};
for (const [key, [h, tool, tier]] of Object.entries(MINING)) {
  const b = defs.find((d) => d && d.key === key);
  if (!b) throw new Error('Bloque desconocido en MINING: ' + key);
  b.hardness = h;
  b.tool = tool;
  b.tier = tier;
}

// Variantes orientadas y encendidas: se obtienen como su bloque base.
for (let f = 0; f < 4; f++) {
  defs[FURNACE + f].base = FURNACE;
  defs[FURNACE_LIT + f].base = FURNACE;
  defs[CHEST + f].base = CHEST;
}

// ------------------------------------------------------------------ familias de estados
// Un bloque con propiedades (orientación, mitad, abierto…) ocupa un id por combinación, a partir de
// FIRST_EXTENDED_BLOCK. El primer estado es el que se obtiene como objeto.

interface Family {
  key: string;
  base: number;
  props: [string, number][];
  count: number;
}

const FAMILY_OF: (Family | undefined)[] = [];
let nextFamilyId = FIRST_EXTENDED_BLOCK;

function decodeState(props: [string, number][], index: number): Record<string, number> {
  const st: Record<string, number> = {};
  let r = index;
  for (const [name, n] of props) {
    st[name] = r % n;
    r = Math.floor(r / n);
  }
  return st;
}

function family(key: string, name: string, props: [string, number][], make: (st: Record<string, number>) => Opts): number {
  const count = props.reduce((a, [, n]) => a * n, 1);
  const base = nextFamilyId;
  const fam: Family = { key, base, props, count };
  for (let i = 0; i < count; i++) {
    const o = make(decodeState(props, i));
    const category = i === 0 ? (o.category === undefined ? 'construccion' : o.category) : null;
    def(base + i, i === 0 ? key : `${key}_${i}`, name, { ...o, category, base: o.base ?? base });
    FAMILY_OF[base + i] = fam;
  }
  nextFamilyId += count;
  return base;
}

/** Id del estado de la familia de `base` con las propiedades dadas (las que falten valen 0). */
export function stateOf(base: number, st: Record<string, number>): number {
  const fam = FAMILY_OF[base];
  if (!fam) return base;
  let idx = 0, mul = 1;
  for (const [name, n] of fam.props) {
    idx += (((st[name] ?? 0) % n) + n) % n * mul;
    mul *= n;
  }
  return fam.base + idx;
}

/** Propiedades de un estado (null si no pertenece a una familia). */
export function stateProps(id: number): Record<string, number> | null {
  const fam = FAMILY_OF[id];
  return fam ? decodeState(fam.props, id - fam.base) : null;
}

/** Estado base de la familia de un bloque (o el propio id). */
export function familyBase(id: number): number {
  return FAMILY_OF[id]?.base ?? id;
}

const L = (name: string) => textureLayer(name);
const texOf = (block: number) => defs[block].tex.map(L);

interface Material {
  key: string;
  name: string;
  block: number;
  hardness: number;
  tool: ToolKind;
  tier: number;
  sound: SoundMaterial;
}

const MATERIALS: Material[] = [
  { key: 'oak', name: 'de roble', block: OAK_PLANKS, hardness: 2, tool: 'axe', tier: 0, sound: 'wood' },
  { key: 'birch', name: 'de abedul', block: BIRCH_PLANKS, hardness: 2, tool: 'axe', tier: 0, sound: 'wood' },
  { key: 'spruce', name: 'de abeto', block: SPRUCE_PLANKS, hardness: 2, tool: 'axe', tier: 0, sound: 'wood' },
  { key: 'cobblestone', name: 'de roca', block: COBBLESTONE, hardness: 2, tool: 'pickaxe', tier: 1, sound: 'stone' },
  { key: 'stone', name: 'de piedra', block: STONE, hardness: 1.5, tool: 'pickaxe', tier: 1, sound: 'stone' },
  { key: 'stone_brick', name: 'de ladrillos de piedra', block: STONE_BRICKS, hardness: 1.5, tool: 'pickaxe', tier: 1, sound: 'stone' },
  { key: 'brick', name: 'de ladrillos', block: BRICKS, hardness: 2, tool: 'pickaxe', tier: 1, sound: 'stone' },
  { key: 'sandstone', name: 'de arenisca', block: SANDSTONE, hardness: 0.8, tool: 'pickaxe', tier: 1, sound: 'stone' },
];
const WOODS = MATERIALS.slice(0, 3);

const matOpts = (m: Material): Opts => ({ hardness: m.hardness, tool: m.tool, tier: m.tier, sound: m.sound, tex: defs[m.block].tex });

/** Losas por material (tipo 0 abajo, 1 arriba, 2 doble). */
export const SLABS: Record<string, number> = {};
/** Escaleras por material (orientación 0..3 hacia donde suben, mitad 0 normal / 1 invertida). */
export const STAIRS: Record<string, number> = {};
for (const m of MATERIALS) {
  const t = texOf(m.block);
  SLABS[m.key] = family(`${m.key}_slab`, `Losa ${m.name}`, [['type', 3]], (st) => {
    if (st.type === 2) return { ...matOpts(m), render: R_CUBE };
    return { ...matOpts(m), render: R_MODEL, model: [st.type === 0 ? mbox(0, 0, 0, 16, 8, 16, t) : mbox(0, 8, 0, 16, 16, 16, t)] };
  });
  STAIRS[m.key] = family(`${m.key}_stairs`, `Escaleras ${m.name}`, [['facing', 4], ['half', 2]], (st) => {
    const boxes = st.half === 0
      ? [mbox(0, 0, 0, 16, 8, 16, t), mbox(0, 8, 0, 16, 16, 8, t)]
      : [mbox(0, 8, 0, 16, 16, 16, t), mbox(0, 0, 0, 16, 8, 8, t)];
    return { ...matOpts(m), render: R_MODEL, model: rotateBoxes(boxes, st.facing) };
  });
}

export const FENCES: Record<string, number> = {};
export const FENCE_GATES: Record<string, number> = {};
export const DOORS: Record<string, number> = {};
export const TRAPDOORS: Record<string, number> = {};
const FENCE_IDS = new Set<number>();

const GATE_BASES = new Set<number>();
function isGate(id: number): boolean {
  return GATE_BASES.has(familyBase(id));
}

/** Las vallas se unen a otras vallas, a los portillos y a los bloques sólidos completos. */
function fenceConnects(id: number): boolean {
  return id > 0 && (FENCE_IDS.has(id) || isGate(id) || BLOCK_OPAQUE[id] === 1);
}

for (const w of WOODS) {
  const t = texOf(w.block);
  const post = mbox(6, 0, 6, 10, 16, 10, t);
  const arm = (d: number) => rotateBoxes([mbox(7, 6, 0, 9, 9, 6, t), mbox(7, 12, 0, 9, 15, 6, t)], d);
  const fence = family(`${w.key}_fence`, `Valla ${w.name}`, [], () => ({
    ...matOpts(w),
    render: R_MODEL,
    shape: (get) => {
      const boxes = [post];
      for (let d = 0; d < 4; d++) if (fenceConnects(get(DIR_X[d], 0, DIR_Z[d]))) boxes.push(...arm(d));
      return boxes;
    },
    itemModel: [mbox(6, 0, 0, 10, 16, 4, t), mbox(6, 0, 12, 10, 16, 16, t), mbox(7, 6, 4, 9, 9, 12, t), mbox(7, 12, 4, 9, 15, 12, t)],
    collision: (get) => {
      const out = [0.375, 0, 0.375, 0.625, 1.5, 0.625];
      for (let d = 0; d < 4; d++) if (fenceConnects(get(DIR_X[d], 0, DIR_Z[d]))) out.push(...rotateFlat([0.375, 0, 0, 0.625, 1.5, 0.375], d));
      return out;
    },
    selection: (get) => {
      const out = [0.375, 0, 0.375, 0.625, 1, 0.625];
      for (let d = 0; d < 4; d++) if (fenceConnects(get(DIR_X[d], 0, DIR_Z[d]))) out.push(...rotateFlat([0.375, 0, 0, 0.625, 1, 0.375], d));
      return out;
    },
  }));
  FENCES[w.key] = fence;
  FENCE_IDS.add(fence);
  FENCE_GATES[w.key] = family(`${w.key}_fence_gate`, `Portillo ${w.name}`, [['facing', 4], ['open', 2]], (st) => {
    const closed = [
      mbox(0, 5, 7, 2, 16, 9, t), mbox(14, 5, 7, 16, 16, 9, t), mbox(2, 6, 7, 14, 9, 9, t), mbox(2, 12, 7, 14, 15, 9, t),
      mbox(6, 9, 7, 10, 12, 9, t),
    ];
    // Abierto, las dos hojas giran hacia donde mira el portillo (hacia -Z mirando al norte).
    const open = [
      mbox(0, 5, 7, 2, 16, 9, t), mbox(14, 5, 7, 16, 16, 9, t),
      mbox(0, 6, 1, 2, 15, 3, t), mbox(14, 6, 1, 16, 15, 3, t),
      mbox(0, 6, 3, 2, 9, 7, t), mbox(0, 12, 3, 2, 15, 7, t), mbox(14, 6, 3, 16, 9, 7, t), mbox(14, 12, 3, 16, 15, 7, t),
    ];
    return {
      ...matOpts(w),
      render: R_MODEL,
      model: rotateBoxes(st.open ? open : closed, st.facing),
      solid: !st.open,
      walkThrough: st.open === 1,
      collision: st.open ? [] : rotateFlat([0, 0, 0.375, 1, 1.5, 0.625], st.facing),
      selection: rotateFlat([0, 0, 0.375, 1, 1, 0.625], st.facing),
    };
  });
  GATE_BASES.add(FENCE_GATES[w.key]);
  DOORS[w.key] = family(`${w.key}_door`, `Puerta ${w.name}`, [['facing', 4], ['half', 2], ['open', 2], ['hinge', 2]], (st) => {
    const tx = L(`${w.key}_door_${st.half ? 'top' : 'bottom'}`);
    const panel = !st.open ? mbox(0, 0, 13, 16, 16, 16, tx) : st.hinge === 0 ? mbox(0, 0, 0, 3, 16, 16, tx) : mbox(13, 0, 0, 16, 16, 16, tx);
    const name = `${w.key}_door_bottom`;
    return {
      hardness: 3, tool: 'axe', sound: 'wood', render: R_MODEL, model: rotateBoxes([panel], st.facing),
      tex: [name, name, name, name, name, name], walkThrough: st.open === 1,
    };
  });
  TRAPDOORS[w.key] = family(`${w.key}_trapdoor`, `Trampilla ${w.name}`, [['facing', 4], ['half', 2], ['open', 2]], (st) => {
    const name = `${w.key}_trapdoor`;
    const tx = L(name);
    const box = st.open ? rotateBoxes([mbox(0, 0, 13, 16, 16, 16, tx)], st.facing)
      : [st.half ? mbox(0, 13, 0, 16, 16, 16, tx) : mbox(0, 0, 0, 16, 3, 16, tx)];
    return { hardness: 3, tool: 'axe', sound: 'wood', render: R_MODEL, model: box, tex: [name, name, name, name, name, name] };
  });
}

export const LADDER = family('ladder', 'Escalera de mano', [['facing', 4]], (st) => {
  const tl = L('ladder');
  return {
    render: R_MODEL, hardness: 0.4, tool: 'axe', sound: 'wood', all: 'ladder', category: 'decoracion',
    model: rotateBoxes([mbox(0, 0, 15, 16, 16, 16, [-1, -1, -1, -1, tl, tl])], st.facing),
    collision: rotateFlat([0, 0, 13 / 16, 1, 1, 1], st.facing),
    selection: rotateFlat([0, 0, 13 / 16, 1, 1, 1], st.facing),
    climbable: true, wall: st.facing, flatItem: 'ladder',
  };
});

const PANE_IDS = new Set<number>();
function paneConnects(id: number): boolean {
  return id > 0 && (PANE_IDS.has(id) || id === GLASS || BLOCK_OPAQUE[id] === 1);
}
export const GLASS_PANE = family('glass_pane', 'Panel de cristal', [], () => {
  const g = L('glass');
  const arm = (d: number) => rotateBoxes([mbox(7, 0, 0, 9, 16, 7, g)], d);
  const flat = (d: number) => rotateFlat([7 / 16, 0, 0, 9 / 16, 1, 7 / 16], d);
  return {
    render: R_MODEL, hardness: 0.3, sound: 'glass', all: 'glass', flatItem: 'glass',
    shape: (get) => {
      const boxes = [mbox(7, 0, 7, 9, 16, 9, g)];
      for (let d = 0; d < 4; d++) if (paneConnects(get(DIR_X[d], 0, DIR_Z[d]))) boxes.push(...arm(d));
      return boxes;
    },
    collision: (get) => {
      const out = [7 / 16, 0, 7 / 16, 9 / 16, 1, 9 / 16];
      for (let d = 0; d < 4; d++) if (paneConnects(get(DIR_X[d], 0, DIR_Z[d]))) out.push(...flat(d));
      return out;
    },
  };
});
PANE_IDS.add(GLASS_PANE);

export const WALL_TORCH = family('wall_torch', 'Antorcha', [['facing', 4]], (st) => ({
  render: R_TORCH, solid: false, lightOpacity: 0, emission: 14, sound: 'wood', all: 'torch', hardness: 0, category: null,
  wall: st.facing, base: TORCH, selection: rotateFlat([5.5 / 16, 3 / 16, 11 / 16, 10.5 / 16, 13 / 16, 1], st.facing),
}));

/** Cama roja: orientación hacia la cabecera y parte (0 pies, 1 cabecera). */
export const RED_BED = family('red_bed', 'Cama roja', [['facing', 4], ['part', 2]], (st) => {
  const red = L('red_wool'), white = L('white_wool'), wood = L('oak_planks');
  const mattress = mbox(0, 3, 0, 16, 9, 16, [red, red, red, wood, red, red]);
  const boxes = st.part === 0
    ? [mattress, mbox(0, 0, 13, 3, 3, 16, wood), mbox(13, 0, 13, 16, 3, 16, wood)]
    : [mattress, mbox(1, 9, 1, 15, 11, 7, white), mbox(0, 0, 0, 3, 3, 3, wood), mbox(13, 0, 0, 16, 3, 3, wood)];
  return {
    render: R_MODEL, hardness: 0.2, sound: 'wool', all: 'red_wool', category: 'decoracion',
    model: rotateBoxes(boxes, st.facing), collision: [0, 0, 0, 1, 9 / 16, 1],
  };
});

export const BLOCKS: readonly BlockDef[] = defs;
/** Uno más que el mayor id registrado (el registro es disperso: hay huecos entre 96 y 1024). */
export const BLOCK_COUNT = defs.length;

// Tablas planas para los bucles calientes (mallado, luz, física).
export const BLOCK_RENDER = new Uint8Array(MAX_BLOCK_ID);
export const BLOCK_SOLID = new Uint8Array(MAX_BLOCK_ID);
export const BLOCK_OPAQUE = new Uint8Array(MAX_BLOCK_ID);
/** Proyecta oclusión ambiental (cubos opacos y hojas). */
export const BLOCK_AO = new Uint8Array(MAX_BLOCK_ID);
export const BLOCK_LIGHT_OPACITY = new Uint8Array(MAX_BLOCK_ID);
export const BLOCK_EMISSION = new Uint8Array(MAX_BLOCK_ID);
export const BLOCK_REPLACEABLE = new Uint8Array(MAX_BLOCK_ID);
/** Capa de textura para cada cara: índice = id * 6 + cara. */
export const BLOCK_TEX = new Uint16Array(MAX_BLOCK_ID * 6);
/** 0 = no fluido, 1 = agua, 2 = lava. */
export const BLOCK_FLUID = new Uint8Array(MAX_BLOCK_ID);
/** 0 fuente, 1..7 fluyendo, 8 cayendo. */
export const BLOCK_FLUID_LEVEL = new Uint8Array(MAX_BLOCK_ID);
export const BLOCK_HARDNESS = new Float32Array(MAX_BLOCK_ID);
/** Bloque que se obtiene como objeto (estados → su estado base). */
export const BLOCK_BASE = new Uint16Array(MAX_BLOCK_ID);
/** Colisión: 0 ninguna, 1 cubo completo, 2 forma (cajas). */
export const BLOCK_COLLIDE = new Uint8Array(MAX_BLOCK_ID);
export const BLOCK_CLIMB = new Uint8Array(MAX_BLOCK_ID);
export const BLOCK_WALKTHROUGH = new Uint8Array(MAX_BLOCK_ID);
/** Dirección de la pared (0..3) de antorchas de pared y escaleras de mano; -1 si no. */
export const BLOCK_WALL = new Int8Array(MAX_BLOCK_ID);
/** El modelo usa texturas con recorte (pasada de recortes). */
export const BLOCK_MODEL_CUTOUT = new Uint8Array(MAX_BLOCK_ID);
const STATIC_COLLISION: (number[] | undefined)[] = [];
/** Tipo de bloque con estados: 1 puerta, 2 trampilla, 3 portillo, 4 cama, 5 losa, 6 escalera. */
const KIND_DOOR = 1, KIND_TRAPDOOR = 2, KIND_GATE = 3, KIND_BED = 4, KIND_SLAB = 5, KIND_STAIRS = 6;
export const BLOCK_KIND = new Uint8Array(MAX_BLOCK_ID);
/** Necesita apoyo de un vecino (antorchas de pared, escaleras de mano, puertas, camas). */
export const BLOCK_NEEDS_SUPPORT = new Uint8Array(MAX_BLOCK_ID);
/** Colisión más alta que un bloque (vallas y portillos cerrados): no se puede saltar por encima. */
export const BLOCK_TALL = new Uint8Array(MAX_BLOCK_ID);
{
  const kindOf = new Map<number, number>();
  for (const v of Object.values(DOORS)) kindOf.set(v, KIND_DOOR);
  for (const v of Object.values(TRAPDOORS)) kindOf.set(v, KIND_TRAPDOOR);
  for (const v of Object.values(FENCE_GATES)) kindOf.set(v, KIND_GATE);
  for (const v of Object.values(SLABS)) kindOf.set(v, KIND_SLAB);
  for (const v of Object.values(STAIRS)) kindOf.set(v, KIND_STAIRS);
  kindOf.set(RED_BED, KIND_BED);
  for (const b of defs) {
    if (!b) continue;
    const k = kindOf.get(familyBase(b.id)) ?? 0;
    BLOCK_KIND[b.id] = k;
    BLOCK_TALL[b.id] = FENCE_IDS.has(b.id) || (k === KIND_GATE && b.solid) ? 1 : 0;
    BLOCK_NEEDS_SUPPORT[b.id] = k === KIND_DOOR || k === KIND_BED || (b.wall !== undefined && b.wall >= 0) ? 1 : 0;
  }
}

export function isBed(id: number): boolean {
  return BLOCK_KIND[id] === KIND_BED;
}

export function isDoor(id: number): boolean {
  return BLOCK_KIND[id] === KIND_DOOR;
}

export function isTrapdoor(id: number): boolean {
  return BLOCK_KIND[id] === KIND_TRAPDOOR;
}

export function isFenceGate(id: number): boolean {
  return BLOCK_KIND[id] === KIND_GATE;
}

export function isSlab(id: number): boolean {
  return BLOCK_KIND[id] === KIND_SLAB;
}

export function isStairs(id: number): boolean {
  return BLOCK_KIND[id] === KIND_STAIRS;
}

for (const b of defs) {
  if (!b) continue;
  BLOCK_FLUID[b.id] = b.fluid;
  BLOCK_FLUID_LEVEL[b.id] = b.level;
  BLOCK_HARDNESS[b.id] = b.hardness;
  BLOCK_RENDER[b.id] = b.render;
  BLOCK_SOLID[b.id] = b.solid ? 1 : 0;
  BLOCK_OPAQUE[b.id] = b.opaque ? 1 : 0;
  BLOCK_AO[b.id] = b.opaque || (b.render === R_CUTOUT && b.lightOpacity > 0) ? 1 : 0;
  BLOCK_LIGHT_OPACITY[b.id] = b.lightOpacity;
  BLOCK_EMISSION[b.id] = b.emission;
  BLOCK_REPLACEABLE[b.id] = b.replaceable ? 1 : 0;
  for (let f = 0; f < 6; f++) BLOCK_TEX[b.id * 6 + f] = b.render === R_NONE ? 0 : textureLayer(b.tex[f]);
  BLOCK_BASE[b.id] = b.base ?? b.id;
  BLOCK_COLLIDE[b.id] = !b.solid ? 0 : b.render === R_MODEL || b.collision ? 2 : 1;
  BLOCK_CLIMB[b.id] = b.climbable ? 1 : 0;
  BLOCK_WALKTHROUGH[b.id] = b.walkThrough ? 1 : 0;
  BLOCK_WALL[b.id] = b.wall ?? -1;
  const boxes = b.model ?? b.itemModel ?? [];
  BLOCK_MODEL_CUTOUT[b.id] = boxes.some((m) => m.tex.some((l) => l >= 0 && !!TEXTURE_DEFS[l]?.cutout)) ||
    (b.render === R_MODEL && b.tex.some((n) => !!TEXTURE_DEFS[textureLayer(n)]?.cutout)) ? 1 : 0;
  if (b.render === R_MODEL && !b.shape) STATIC_COLLISION[b.id] = typeof b.collision === 'object' ? b.collision : flatBoxes(b.model ?? []);
}

/** Cajas con las que se dibuja un bloque R_MODEL como objeto (mano, suelo, inventario). */
export function blockItemModel(id: number): ModelBox[] {
  const d = defs[id];
  if (!d) return [];
  return d.itemModel ?? d.model ?? (d.shape ? d.shape(() => 0) : []);
}

/** Forma del modelo de un bloque R_MODEL (null si no tiene). */
export function blockModel(id: number, get: NeighborGet): ModelBox[] | null {
  const d = defs[id];
  if (!d) return null;
  if (d.shape) return d.shape(get);
  return d.model ?? null;
}

/**
 * Cajas de colisión locales (0..1) de un bloque con forma (BLOCK_COLLIDE = 2) en (x, y, z).
 * `out` se reutiliza para no crear listas nuevas.
 */
export function blockCollisionBoxes(
  id: number, x: number, y: number, z: number, w: { getBlock(x: number, y: number, z: number): number }, out: number[],
): number[] {
  const d = defs[id];
  if (!d) return out;
  if (typeof d.collision === 'function') return d.collision((dx, dy, dz) => w.getBlock(x + dx, y + dy, z + dz));
  return STATIC_COLLISION[id] ?? (typeof d.collision === 'object' ? d.collision : FULL_BOX);
}

const FULL_BOX = [0, 0, 0, 1, 1, 1];
const CROSS_BOX = [0.12, 0, 0.12, 0.88, 0.85, 0.88];
const TORCH_BOX = [0.4, 0, 0.4, 0.6, 0.65, 0.6];
const CACTUS_BOX = [1 / 16, 0, 1 / 16, 15 / 16, 1, 15 / 16];

/** Cajas de selección (0..1) de un bloque: las del modelo, las de su tipo o el cubo. */
export function blockSelectionBoxes(id: number, get: NeighborGet): number[] {
  const d = defs[id];
  if (!d) return FULL_BOX;
  if (d.selection) return typeof d.selection === 'function' ? d.selection(get) : d.selection;
  if (d.render === R_MODEL) return flatBoxes(blockModel(id, get) ?? []);
  if (d.render === R_CROSS) return CROSS_BOX;
  if (d.render === R_TORCH) return TORCH_BOX;
  if (d.render === R_CACTUS) return CACTUS_BOX;
  return FULL_BOX;
}

/** Caja envolvente de la selección (para el contorno). */
export function blockSelectionBounds(id: number, get: NeighborGet): number[] {
  return unionBox(blockSelectionBoxes(id, get));
}

/**
 * ¿Sigue apoyado el bloque? Antorchas de pared y escaleras de mano necesitan la pared de detrás,
 * las puertas su otra mitad (y suelo) y las camas su otra parte.
 */
export function blockSupported(id: number, get: NeighborGet): boolean {
  const d = defs[id];
  if (!d) return true;
  if (d.wall !== undefined && d.wall >= 0) {
    const b = get(-DIR_X[d.wall], 0, -DIR_Z[d.wall]);
    return b < 0 || BLOCK_OPAQUE[b] === 1;
  }
  const st = stateProps(id);
  if (!st) return true;
  if (isDoor(id)) {
    if (st.half === 0) {
      const below = get(0, -1, 0), above = get(0, 1, 0);
      return (below < 0 || BLOCK_SOLID[below] === 1) && (above < 0 || (isDoor(above) && familyBase(above) === familyBase(id)));
    }
    const below = get(0, -1, 0);
    return below < 0 || (isDoor(below) && familyBase(below) === familyBase(id));
  }
  if (isBed(id)) {
    const s = st.part === 0 ? 1 : -1;
    const o = get(DIR_X[st.facing] * s, 0, DIR_Z[st.facing] * s);
    return o < 0 || (isBed(o) && stateProps(o)!.part !== st.part);
  }
  return true;
}

export function isValidBlockId(id: number): boolean {
  return Number.isInteger(id) && id >= 0 && id < BLOCK_COUNT && id < MAX_BLOCK_ID && defs[id] !== undefined;
}

/** Nivel máximo de expansión horizontal: agua 7, lava 3. */
export const FLUID_MAX_LEVEL = [0, 7, 3];

/** Id del bloque de un fluido (1 agua, 2 lava) con nivel 0 (fuente), 1..max o 8 (cayendo). */
export function fluidBlock(fluid: number, level: number): number {
  if (fluid === 1) return level === 0 ? WATER : level >= 8 ? WATER_FALL : WATER_FLOW_1 + level - 1;
  return level === 0 ? LAVA : level >= 8 ? LAVA_FALL : LAVA_FLOW_1 + level - 1;
}

/** Altura (0..1) de la superficie de un bloque de fluido según su nivel. */
export function fluidHeight(id: number): number {
  const l = BLOCK_FLUID_LEVEL[id];
  if (l === 0 || l >= 8) return 8 / 9;
  const max = FLUID_MAX_LEVEL[BLOCK_FLUID[id]];
  return (8 / 9) * (1 - l / (max + 1)) + 0.02;
}

/** Bloque base (el que se obtiene como objeto) de una variante orientada o encendida. */
export function baseBlock(id: number): number {
  return BLOCK_BASE[id] || id;
}

/** Orientación (0 N, 1 E, 2 S, 3 O) de un bloque orientado; -1 si no lo es. */
export function blockFacing(id: number): number {
  if (id >= FURNACE && id < FURNACE + 4) return id - FURNACE;
  if (id >= FURNACE_LIT && id < FURNACE_LIT + 4) return id - FURNACE_LIT;
  if (id >= CHEST && id < CHEST + 4) return id - CHEST;
  return -1;
}

/** Variante orientada de un bloque base para un yaw del jugador (el frente mira al jugador). */
export function orientedFor(base: number, yaw: number): number {
  if (base !== FURNACE && base !== CHEST && base !== FURNACE_LIT) return base;
  // El jugador mira hacia (-sin yaw, -cos yaw); el frente del bloque apunta en sentido contrario.
  const fx = Math.sin(yaw), fz = Math.cos(yaw);
  let f: number;
  if (Math.abs(fx) > Math.abs(fz)) f = fx > 0 ? 1 : 3;
  else f = fz > 0 ? 2 : 0;
  return base + f;
}

export function isFurnace(id: number): boolean {
  return id >= FURNACE && id < FURNACE_LIT + 4;
}

export function isChest(id: number): boolean {
  return id >= CHEST && id < CHEST + 4;
}

export function isContainer(id: number): boolean {
  return isFurnace(id) || isChest(id);
}

/** Orden de los bloques en el inventario creativo. */
export const INVENTORY_ORDER: readonly number[] = [
  GRASS, DIRT, STONE, COBBLESTONE, MOSSY_COBBLESTONE, STONE_BRICKS, BRICKS, GRANITE, DIORITE, ANDESITE,
  SAND, SANDSTONE, GRAVEL, CLAY, TERRACOTTA, SNOW_BLOCK, SNOWY_GRASS, ICE, OBSIDIAN, QUARTZ_BLOCK,
  OAK_LOG, OAK_PLANKS, BIRCH_LOG, BIRCH_PLANKS, SPRUCE_LOG, SPRUCE_PLANKS, OAK_LEAVES, BIRCH_LEAVES, SPRUCE_LEAVES, GLASS,
  BOOKSHELF, CRAFTING_TABLE, FURNACE, CHEST, PUMPKIN, HAY_BALE, TORCH, GLOWSTONE, SEA_LANTERN, CACTUS, SUGAR_CANE,
  OAK_SAPLING, BIRCH_SAPLING, SPRUCE_SAPLING, SHORT_GRASS,
  FERN, POPPY, DANDELION, CORNFLOWER, DEAD_BUSH, RED_MUSHROOM, BROWN_MUSHROOM, WATER, LAVA,
  COAL_ORE, IRON_ORE, GOLD_ORE, DIAMOND_ORE, LAPIS_ORE, REDSTONE_ORE, IRON_BLOCK, GOLD_BLOCK, DIAMOND_BLOCK, COPPER_BLOCK,
  WHITE_WOOL, BLACK_WOOL, RED_WOOL, ORANGE_WOOL, YELLOW_WOOL, LIME_WOOL, BLUE_WOOL, PURPLE_WOOL,
  ...MATERIALS.flatMap((m) => [SLABS[m.key], STAIRS[m.key]]),
  ...WOODS.flatMap((w) => [FENCES[w.key], FENCE_GATES[w.key], DOORS[w.key], TRAPDOORS[w.key]]),
  LADDER, GLASS_PANE, RED_BED,
];

export const DEFAULT_HOTBAR: readonly number[] = [
  GRASS, STONE, OAK_PLANKS, OAK_LOG, GLASS, TORCH, BRICKS, WATER, GLOWSTONE,
];
