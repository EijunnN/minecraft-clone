// Registro de bloques compartido por el cliente, los workers de generación/mallado y el servidor.
import { textureLayer } from './textureDefs';

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

export const BLOCKS: readonly BlockDef[] = defs;
export const BLOCK_COUNT = defs.length;

// Tablas planas para los bucles calientes (mallado, luz, física).
export const BLOCK_RENDER = new Uint8Array(256);
export const BLOCK_SOLID = new Uint8Array(256);
export const BLOCK_OPAQUE = new Uint8Array(256);
/** Proyecta oclusión ambiental (cubos opacos y hojas). */
export const BLOCK_AO = new Uint8Array(256);
export const BLOCK_LIGHT_OPACITY = new Uint8Array(256);
export const BLOCK_EMISSION = new Uint8Array(256);
export const BLOCK_REPLACEABLE = new Uint8Array(256);
/** Capa de textura para cada cara: índice = id * 6 + cara. */
export const BLOCK_TEX = new Uint16Array(256 * 6);
/** 0 = no fluido, 1 = agua, 2 = lava. */
export const BLOCK_FLUID = new Uint8Array(256);
/** 0 fuente, 1..7 fluyendo, 8 cayendo. */
export const BLOCK_FLUID_LEVEL = new Uint8Array(256);
export const BLOCK_HARDNESS = new Float32Array(256);

for (const b of defs) {
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
}

export function isValidBlockId(id: number): boolean {
  return Number.isInteger(id) && id >= 0 && id < BLOCK_COUNT && defs[id] !== undefined;
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
  if (id >= FURNACE && id < FURNACE + 4) return FURNACE;
  if (id >= FURNACE_LIT && id < FURNACE_LIT + 4) return FURNACE;
  if (id >= CHEST && id < CHEST + 4) return CHEST;
  return id;
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
];

export const DEFAULT_HOTBAR: readonly number[] = [
  GRASS, STONE, OAK_PLANKS, OAK_LOG, GLASS, TORCH, BRICKS, WATER, GLOWSTONE,
];
