// Lista de texturas de bloques. El índice en este array es la capa (layer) de la
// TEXTURE_2D_ARRAY en la GPU. Las propiedades describen cómo las trata el shader.
//
// tint:    0 = sin tinte, 1 = tinte de hierba del bioma (textura en escala de grises),
//          2 = tinte de hierba sólo donde alpha = 255 (máscara en el canal alpha; bloque opaco),
//          3 = tinte de follaje del bioma (textura en escala de grises).
// wave:    0 = estático, 1 = hojas (oscilación suave de todo el bloque),
//          2 = planta (los vértices superiores se mueven con el viento).
// sss:     0..1 cantidad de dispersión subsuperficial (luz que atraviesa hojas/plantas).
// special: 0 = normal, 1 = agua, 2 = lava, 3 = hielo (translúcido).
// cutout:  true si la textura usa alpha 0/255 como recorte (hojas, plantas, cristal...).

export interface TextureDef {
  name: string;
  tint?: 0 | 1 | 2 | 3;
  wave?: 0 | 1 | 2;
  sss?: number;
  special?: 0 | 1 | 2 | 3;
  cutout?: boolean;
}

export const TEXTURE_DEFS: readonly TextureDef[] = [
  // Piedras
  { name: 'stone' },
  { name: 'cobblestone' },
  { name: 'mossy_cobblestone' },
  { name: 'stone_bricks' },
  { name: 'granite' },
  { name: 'diorite' },
  { name: 'andesite' },
  { name: 'bedrock' },
  { name: 'obsidian' },
  // Suelos
  { name: 'dirt' },
  { name: 'grass_top', tint: 1 },
  { name: 'grass_side', tint: 2 },
  { name: 'grass_side_snowy' },
  { name: 'snow', sss: 0.25 },
  { name: 'ice', special: 3 },
  { name: 'sand' },
  { name: 'gravel' },
  { name: 'clay' },
  { name: 'sandstone_top' },
  { name: 'sandstone_side' },
  { name: 'sandstone_bottom' },
  { name: 'terracotta' },
  // Madera
  { name: 'oak_log_side' },
  { name: 'oak_log_top' },
  { name: 'oak_planks' },
  { name: 'oak_leaves', tint: 3, wave: 1, sss: 0.85, cutout: true },
  { name: 'birch_log_side' },
  { name: 'birch_log_top' },
  { name: 'birch_planks' },
  { name: 'birch_leaves', wave: 1, sss: 0.85, cutout: true },
  { name: 'spruce_log_side' },
  { name: 'spruce_log_top' },
  { name: 'spruce_planks' },
  { name: 'spruce_leaves', wave: 1, sss: 0.7, cutout: true },
  // Plantas
  { name: 'short_grass', tint: 1, wave: 2, sss: 0.8, cutout: true },
  { name: 'fern', tint: 1, wave: 2, sss: 0.8, cutout: true },
  { name: 'poppy', wave: 2, sss: 0.7, cutout: true },
  { name: 'dandelion', wave: 2, sss: 0.7, cutout: true },
  { name: 'cornflower', wave: 2, sss: 0.7, cutout: true },
  { name: 'dead_bush', wave: 2, sss: 0.3, cutout: true },
  { name: 'sugar_cane', sss: 0.5, cutout: true },
  { name: 'red_mushroom', sss: 0.3, cutout: true },
  { name: 'brown_mushroom', sss: 0.3, cutout: true },
  { name: 'cactus_side', sss: 0.2 },
  { name: 'cactus_top', sss: 0.2, cutout: true },
  { name: 'cactus_bottom', cutout: true },
  // Líquidos
  { name: 'water', special: 1 },
  { name: 'lava', special: 2 },
  // Minerales
  { name: 'coal_ore' },
  { name: 'iron_ore' },
  { name: 'gold_ore' },
  { name: 'diamond_ore' },
  { name: 'lapis_ore' },
  { name: 'redstone_ore' },
  // Luz
  { name: 'torch', cutout: true },
  { name: 'glowstone' },
  { name: 'sea_lantern' },
  // Construcción
  { name: 'bricks' },
  { name: 'glass', cutout: true },
  { name: 'bookshelf' },
  { name: 'crafting_table_top' },
  { name: 'crafting_table_side' },
  { name: 'crafting_table_front' },
  { name: 'pumpkin_top' },
  { name: 'pumpkin_side' },
  { name: 'hay_bale_top' },
  { name: 'hay_bale_side' },
  { name: 'quartz_block' },
  { name: 'gold_block' },
  { name: 'iron_block' },
  { name: 'diamond_block' },
  { name: 'copper_block' },
  // Lana
  { name: 'white_wool' },
  { name: 'black_wool' },
  { name: 'red_wool' },
  { name: 'orange_wool' },
  { name: 'yellow_wool' },
  { name: 'lime_wool' },
  { name: 'blue_wool' },
  { name: 'purple_wool' },
  // Supervivencia
  { name: 'furnace_front' },
  { name: 'furnace_front_lit' },
  { name: 'furnace_side' },
  { name: 'furnace_top' },
  { name: 'chest_front' },
  { name: 'chest_side' },
  { name: 'chest_top' },
  { name: 'oak_sapling', wave: 2, sss: 0.75, cutout: true },
  { name: 'birch_sapling', wave: 2, sss: 0.75, cutout: true },
  { name: 'spruce_sapling', wave: 2, sss: 0.7, cutout: true },
  // Grietas al picar (10 fases, se dibujan superpuestas al bloque).
  { name: 'destroy_0', cutout: true },
  { name: 'destroy_1', cutout: true },
  { name: 'destroy_2', cutout: true },
  { name: 'destroy_3', cutout: true },
  { name: 'destroy_4', cutout: true },
  { name: 'destroy_5', cutout: true },
  { name: 'destroy_6', cutout: true },
  { name: 'destroy_7', cutout: true },
  { name: 'destroy_8', cutout: true },
  { name: 'destroy_9', cutout: true },
  // Construcción: puertas (mitad superior e inferior), trampillas y escalera de mano.
  { name: 'oak_door_top', cutout: true },
  { name: 'oak_door_bottom', cutout: true },
  { name: 'birch_door_top', cutout: true },
  { name: 'birch_door_bottom', cutout: true },
  { name: 'spruce_door_top', cutout: true },
  { name: 'spruce_door_bottom', cutout: true },
  { name: 'oak_trapdoor', cutout: true },
  { name: 'birch_trapdoor', cutout: true },
  { name: 'spruce_trapdoor', cutout: true },
  { name: 'ladder', cutout: true },
  // Granja: tierra de cultivo, etapas de los cultivos y tarta.
  { name: 'farmland_dry' },
  { name: 'farmland_wet' },
  ...[0, 1, 2, 3, 4, 5, 6, 7].map((s): TextureDef => ({ name: `wheat_stage${s}`, wave: 2, sss: 0.5, cutout: true })),
  ...['carrots', 'potatoes', 'beetroots'].flatMap((c) =>
    [0, 1, 2, 3].map((s): TextureDef => ({ name: `${c}_stage${s}`, wave: 2, sss: 0.55, cutout: true })),
  ),
  { name: 'cake_top' },
  { name: 'cake_side' },
  { name: 'cake_inner' },
  { name: 'cake_bottom' },
  // Calabazas, sandías y compostador (fase 4).
  { name: 'melon_side' },
  { name: 'melon_top' },
  ...[0, 1, 2, 3, 4, 5, 6, 7].map((s): TextureDef => ({ name: `stem_stage${s}`, wave: 2, sss: 0.5, cutout: true })),
  { name: 'stem_attached', wave: 2, sss: 0.5, cutout: true },
  { name: 'carved_pumpkin' },
  { name: 'jack_o_lantern' },
  { name: 'composter_side' },
  { name: 'composter_top' },
  { name: 'composter_bottom' },
  { name: 'compost' },
  { name: 'compost_ready' },
  // Cofre doble, ahumador, alto horno, fogata y cortapiedras (fase 4).
  { name: 'chest_front_seam_right' },
  { name: 'chest_front_seam_left' },
  { name: 'chest_side_seam_right' },
  { name: 'chest_side_seam_left' },
  ...['smoker', 'blast_furnace'].flatMap((k): TextureDef[] => [
    { name: `${k}_front` }, { name: `${k}_front_lit` }, { name: `${k}_side` }, { name: `${k}_top` },
  ]),
  { name: 'campfire_log_lit' },
  { name: 'campfire_fire', wave: 2, cutout: true },
  { name: 'campfire_embers' },
  { name: 'campfire_ash' },
  { name: 'stonecutter_top' },
  { name: 'stonecutter_side' },
  { name: 'stonecutter_bottom' },
  { name: 'stonecutter_saw', cutout: true },
  // Maderas de la fase 5 (jungla, acacia, roble oscuro y cerezo).
  ...['jungle', 'acacia', 'dark_oak', 'cherry'].flatMap((k): TextureDef[] => [
    { name: `${k}_log_side` },
    { name: `${k}_log_top` },
    { name: `${k}_planks` },
    k === 'cherry'
      ? { name: `${k}_leaves`, wave: 1, sss: 0.9, cutout: true }
      : { name: `${k}_leaves`, tint: 3, wave: 1, sss: 0.85, cutout: true },
    { name: `${k}_sapling`, wave: 2, sss: 0.75, cutout: true },
    { name: `${k}_door_top`, cutout: true },
    { name: `${k}_door_bottom`, cutout: true },
    { name: `${k}_trapdoor`, cutout: true },
  ]),
  // Biomas de la fase 5.
  { name: 'vine', tint: 3, wave: 1, sss: 0.8, cutout: true },
  { name: 'lily_pad', sss: 0.5, cutout: true },
  { name: 'mycelium_top' },
  { name: 'mycelium_side' },
  { name: 'red_mushroom_block' },
  { name: 'brown_mushroom_block' },
  { name: 'mushroom_stem' },
  { name: 'mushroom_block_inside' },
  { name: 'red_sand' },
  { name: 'red_sandstone_top' },
  { name: 'red_sandstone_side' },
  { name: 'red_sandstone_bottom' },
  ...['white', 'orange', 'yellow', 'brown', 'red', 'light_gray'].map((c): TextureDef => ({ name: `${c}_terracotta` })),
  { name: 'packed_ice' },
  ...['blue_orchid', 'allium', 'azure_bluet', 'red_tulip', 'orange_tulip', 'white_tulip', 'pink_tulip', 'oxeye_daisy',
    'lily_of_the_valley'].map((k): TextureDef => ({ name: k, wave: 2, sss: 0.7, cutout: true })),
  { name: 'pink_petals', sss: 0.6, cutout: true },
  // Subsuelo de la fase 5: pizarra profunda, menas, cuevas frondosas y de goteo, geodas.
  { name: 'deepslate' },
  { name: 'deepslate_top' },
  { name: 'cobbled_deepslate' },
  { name: 'tuff' },
  { name: 'calcite' },
  { name: 'smooth_basalt' },
  { name: 'dripstone_block' },
  { name: 'pointed_dripstone' },
  { name: 'copper_ore' },
  { name: 'emerald_ore' },
  ...['coal', 'iron', 'copper', 'gold', 'redstone', 'lapis', 'diamond', 'emerald'].map((k): TextureDef => ({ name: `deepslate_${k}_ore` })),
  { name: 'emerald_block' },
  { name: 'moss_block', sss: 0.3 },
  { name: 'azalea', wave: 2, sss: 0.7, cutout: true },
  { name: 'flowering_azalea', wave: 2, sss: 0.7, cutout: true },
  { name: 'cave_vines', wave: 2, sss: 0.7, cutout: true },
  { name: 'cave_vines_lit', wave: 2, sss: 0.7, cutout: true },
  { name: 'amethyst_block' },
  { name: 'budding_amethyst' },
  ...['small_amethyst_bud', 'medium_amethyst_bud', 'large_amethyst_bud', 'amethyst_cluster'].map((k): TextureDef => ({ name: k, sss: 0.4, cutout: true })),
  { name: 'tinted_glass', special: 3 },
  // Estructuras de la fase 5.
  { name: 'spawner', cutout: true },
  { name: 'cobweb', cutout: true },
  { name: 'chiseled_sandstone' },
  { name: 'cut_sandstone' },
  { name: 'mossy_stone_bricks' },
  { name: 'cracked_stone_bricks' },
  { name: 'netherrack' },
  { name: 'crying_obsidian' },
  // Fase 6 (fauna): nido de abejas, colmena, bloque de miel y bloque de panal.
  ...['bee_nest_top', 'bee_nest_bottom', 'bee_nest_side', 'bee_nest_front', 'bee_nest_front_honey', 'beehive_end', 'beehive_side',
    'beehive_front', 'beehive_front_honey', 'honey_block', 'honeycomb_block'].map((name): TextureDef => ({ name })),
];

export const TEXTURE_NAMES: readonly string[] = TEXTURE_DEFS.map((t) => t.name);
export const TEXTURE_COUNT = TEXTURE_DEFS.length;

const layerByName = new Map<string, number>();
TEXTURE_DEFS.forEach((t, i) => layerByName.set(t.name, i));

export function textureLayer(name: string): number {
  const layer = layerByName.get(name);
  if (layer === undefined) throw new Error('Textura desconocida: ' + name);
  return layer;
}
