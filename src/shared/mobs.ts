// Criaturas: estadísticas, botín y modelos por cajas (en píxeles, 1 px = 1/16 de bloque).
// El modelo mira hacia -Z; y crece hacia arriba desde los pies.
import {
  RAW_PORKCHOP, RAW_BEEF, LEATHER, RAW_MUTTON, RAW_CHICKEN, FEATHER, ROTTEN_FLESH, BONE, ARROW, GUNPOWDER, STRING,
  ENDER_PEARL, SPIDER_EYE, COD, SALMON,
} from './items';
import { WHITE_WOOL } from './blocks';

export const MOB_PIG = 1;
export const MOB_COW = 2;
export const MOB_SHEEP = 3;
export const MOB_CHICKEN = 4;
export const MOB_ZOMBIE = 5;
export const MOB_HUSK = 6;
export const MOB_SKELETON = 7;
export const MOB_STRAY = 8;
export const MOB_CREEPER = 9;
export const MOB_SPIDER = 10;
export const MOB_ENDERMAN = 11;
export const MOB_SQUID = 12;
// Fase 6: animales salvajes.
export const MOB_FOX = 13;
export const MOB_GOAT = 14;
export const MOB_POLAR_BEAR = 15;
export const MOB_RABBIT = 16;
export const MOB_WOLF = 17;
// Fase 6 (aldeanos): aldeano y comerciante ambulante.
export const MOB_VILLAGER = 18;
export const MOB_WANDERING_TRADER = 19;
// Fase 6 (monturas): ids 25–29.
export const MOB_HORSE = 25;
export const MOB_DONKEY = 26;
export const MOB_MULE = 27;
export const MOB_LLAMA = 28;
export const MOB_CAMEL = 29;
/** Entidades que no son criaturas. */
export const ENT_ITEM = 100;
export const ENT_ARROW = 101;
/** Bloque que cae (arena, grava). */
export const ENT_FALLING = 102;
/** Orbe de experiencia (extra: valor). */
export const ENT_XP = 103;
/** Objeto lanzado (huevo; extra: id del objeto). */
export const ENT_THROWN = 104;
/** Flotador de una caña de pescar. */
export const ENT_BOBBER = 105;
/** Objeto quieto de adorno (comida asándose en una fogata; extra: id del objeto). */
export const ENT_DISPLAY = 106;

export interface ModelPart {
  name: string;
  /** Parte a la que va unida (hereda su transformación). */
  parent?: string;
  /** Pivote respecto al origen de la entidad (o del padre), en píxeles. */
  pivot: [number, number, number];
  /** Esquina mínima de la caja respecto al pivote. */
  from: [number, number, number];
  /** Tamaño: ancho (x), alto (y), fondo (z). */
  size: [number, number, number];
  /** Desplazamiento UV (disposición de caja estilo Minecraft). */
  uv: [number, number];
  /** Rotación de reposo (radianes, orden X, Y, Z). */
  rot?: [number, number, number];
}

export type MobAnim = 'quadruped' | 'humanoid' | 'zombie' | 'skeleton' | 'creeper' | 'spider' | 'chicken' | 'enderman' | 'squid'
  | 'villager'; // Fase 6 (aldeanos)

export interface MobDef {
  id: number;
  key: string;
  name: string;
  hostile: boolean;
  /** Neutral: sólo ataca si se le provoca (arañas de día, enderman). */
  neutral?: boolean;
  health: number;
  /** Velocidad de paseo y de persecución (bloques/s). */
  walk: number;
  run: number;
  width: number;
  height: number;
  /** Daño cuerpo a cuerpo en dificultad normal (medios corazones). */
  damage: number;
  burnsInSun: boolean;
  /** Botín: [objeto, mín, máx]. */
  drops: [number, number, number][];
  atlas: [number, number];
  parts: ModelPart[];
  anim: MobAnim;
  /** Escala global del modelo. */
  scale: number;
  aquatic?: boolean;
}

const quadLegs = (h: number, xs: number, zs: [number, number], uv: [number, number], w = 4): ModelPart[] => [
  { name: 'leg0', pivot: [-xs, h, zs[0]], from: [-w / 2, -h, -w / 2], size: [w, h, w], uv },
  { name: 'leg1', pivot: [xs, h, zs[0]], from: [-w / 2, -h, -w / 2], size: [w, h, w], uv },
  { name: 'leg2', pivot: [-xs, h, zs[1]], from: [-w / 2, -h, -w / 2], size: [w, h, w], uv },
  { name: 'leg3', pivot: [xs, h, zs[1]], from: [-w / 2, -h, -w / 2], size: [w, h, w], uv },
];

const humanoid = (thin: boolean): ModelPart[] => {
  const limb = thin ? 2 : 4;
  return [
    { name: 'head', pivot: [0, 24, 0], from: [-4, 0, -4], size: [8, 8, 8], uv: [0, 0] },
    { name: 'body', pivot: [0, 12, 0], from: [-4, 0, -2], size: [8, 12, 4], uv: [16, 16] },
    { name: 'armR', pivot: [thin ? 5 : 6, 22, 0], from: [-limb / 2, -10, -limb / 2], size: [limb, 12, limb], uv: [40, 16] },
    { name: 'armL', pivot: [thin ? -5 : -6, 22, 0], from: [-limb / 2, -10, -limb / 2], size: [limb, 12, limb], uv: thin ? [40, 32] : [32, 48] },
    { name: 'legR', pivot: [2, 12, 0], from: [-limb / 2, -12, -limb / 2], size: [limb, 12, limb], uv: [0, 16] },
    { name: 'legL', pivot: [-2, 12, 0], from: [-limb / 2, -12, -limb / 2], size: [limb, 12, limb], uv: thin ? [0, 32] : [16, 48] },
  ];
};

const spiderLegs = (): ModelPart[] => {
  const legs: ModelPart[] = [];
  const zs = [-1, 0, 1, 2];
  for (let i = 0; i < 4; i++) {
    const yaw = [0.75, 0.3, -0.3, -0.75][i];
    legs.push({ name: `leg${i * 2}`, parent: 'thorax', pivot: [3, 0, zs[i]], from: [0, -1, -1], size: [16, 2, 2], uv: [0, 40], rot: [0, yaw, 0.6] });
    legs.push({ name: `leg${i * 2 + 1}`, parent: 'thorax', pivot: [-3, 0, zs[i]], from: [-16, -1, -1], size: [16, 2, 2], uv: [0, 40], rot: [0, -yaw, -0.6] });
  }
  return legs;
};

const squidTentacles = (): ModelPart[] => {
  const t: ModelPart[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    t.push({ name: `tent${i}`, parent: 'body', pivot: [Math.cos(a) * 5, -8, Math.sin(a) * 5], from: [-1, -18, -1], size: [2, 18, 2], uv: [48, 0] });
  }
  return t;
};

export const MOBS: MobDef[] = [];

function mob(d: MobDef): void {
  MOBS[d.id] = d;
}

mob({
  id: MOB_PIG, key: 'pig', name: 'Cerdo', hostile: false, health: 10, walk: 1.2, run: 2.6, width: 0.9, height: 0.9,
  damage: 0, burnsInSun: false, drops: [[RAW_PORKCHOP, 1, 3]], atlas: [64, 64], anim: 'quadruped', scale: 1,
  parts: [
    { name: 'body', pivot: [0, 6, 0], from: [-5, 0, -8], size: [10, 8, 16], uv: [0, 32] },
    { name: 'head', pivot: [0, 12, -8], from: [-4, -4, -8], size: [8, 8, 8], uv: [0, 0] },
    { name: 'snout', parent: 'head', pivot: [0, 0, 0], from: [-2, -3, -9], size: [4, 3, 1], uv: [16, 16] },
    ...quadLegs(6, 3, [-5, 5], [0, 16]),
    // Fase 6 (monturas): silla (sólo se dibuja si la lleva).
    { name: 'saddle', pivot: [0, 6, 0], from: [-5.5, 5, -4], size: [11, 4, 8], uv: [26, 16] },
  ],
});
mob({
  id: MOB_COW, key: 'cow', name: 'Vaca', hostile: false, health: 10, walk: 1.1, run: 2.4, width: 0.9, height: 1.4,
  damage: 0, burnsInSun: false, drops: [[LEATHER, 0, 2], [RAW_BEEF, 1, 3]], atlas: [64, 64], anim: 'quadruped', scale: 1,
  parts: [
    { name: 'body', pivot: [0, 12, 0], from: [-6, 0, -9], size: [12, 10, 18], uv: [0, 16] },
    { name: 'head', pivot: [0, 20, -9], from: [-4, -4, -6], size: [8, 8, 6], uv: [0, 0] },
    { name: 'hornR', parent: 'head', pivot: [0, 0, 0], from: [4, 2, -4], size: [1, 3, 1], uv: [28, 0] },
    { name: 'hornL', parent: 'head', pivot: [0, 0, 0], from: [-5, 2, -4], size: [1, 3, 1], uv: [28, 0] },
    ...quadLegs(12, 4, [-6, 7], [0, 44]),
  ],
});
mob({
  id: MOB_SHEEP, key: 'sheep', name: 'Oveja', hostile: false, health: 8, walk: 1.1, run: 2.4, width: 0.9, height: 1.3,
  damage: 0, burnsInSun: false, drops: [[WHITE_WOOL, 1, 1], [RAW_MUTTON, 1, 2]], atlas: [64, 96], anim: 'quadruped', scale: 1,
  parts: [
    // Cuerpo esquilado (piel) y, encima, la capa de lana que desaparece al esquilarla.
    { name: 'body', pivot: [0, 12, 0], from: [-5, 0, -8], size: [10, 8, 16], uv: [0, 14] },
    { name: 'wool', parent: 'body', pivot: [0, 0, 0], from: [-6, -1, -9], size: [12, 10, 18], uv: [0, 56] },
    { name: 'head', pivot: [0, 18, -8], from: [-3, -4, -8], size: [6, 6, 8], uv: [0, 0] },
    ...quadLegs(12, 3, [-5, 6], [0, 38]),
  ],
});
mob({
  id: MOB_CHICKEN, key: 'chicken', name: 'Gallina', hostile: false, health: 4, walk: 1.0, run: 2.2, width: 0.4, height: 0.7,
  damage: 0, burnsInSun: false, drops: [[FEATHER, 0, 2], [RAW_CHICKEN, 1, 1]], atlas: [64, 64], anim: 'chicken', scale: 1,
  parts: [
    { name: 'body', pivot: [0, 5, 0], from: [-3, 0, -4], size: [6, 6, 8], uv: [0, 9] },
    { name: 'head', pivot: [0, 9, -4], from: [-2, 0, -3], size: [4, 6, 3], uv: [0, 0] },
    { name: 'beak', parent: 'head', pivot: [0, 0, 0], from: [-2, 3, -5], size: [4, 2, 2], uv: [14, 0] },
    { name: 'wattle', parent: 'head', pivot: [0, 0, 0], from: [-1, 1, -4], size: [2, 2, 2], uv: [14, 4] },
    { name: 'legR', pivot: [1.5, 5, 1], from: [-1.5, -5, -1.5], size: [3, 5, 3], uv: [26, 0] },
    { name: 'legL', pivot: [-1.5, 5, 1], from: [-1.5, -5, -1.5], size: [3, 5, 3], uv: [26, 0] },
    { name: 'wingR', pivot: [3, 10, 0], from: [0, -4, -3], size: [1, 4, 6], uv: [28, 9] },
    { name: 'wingL', pivot: [-3, 10, 0], from: [-1, -4, -3], size: [1, 4, 6], uv: [28, 9] },
  ],
});
mob({
  id: MOB_ZOMBIE, key: 'zombie', name: 'Zombi', hostile: true, health: 20, walk: 1.0, run: 2.4, width: 0.6, height: 1.95,
  damage: 3, burnsInSun: true, drops: [[ROTTEN_FLESH, 0, 2]], atlas: [64, 64], anim: 'zombie', scale: 1,
  parts: humanoid(false),
});
mob({
  id: MOB_HUSK, key: 'husk', name: 'Zombi momificado', hostile: true, health: 20, walk: 1.0, run: 2.4, width: 0.6, height: 1.95,
  damage: 3, burnsInSun: false, drops: [[ROTTEN_FLESH, 0, 2]], atlas: [64, 64], anim: 'zombie', scale: 1.06,
  parts: humanoid(false),
});
mob({
  id: MOB_SKELETON, key: 'skeleton', name: 'Esqueleto', hostile: true, health: 20, walk: 1.1, run: 2.3, width: 0.6, height: 1.99,
  damage: 2, burnsInSun: true, drops: [[BONE, 0, 2], [ARROW, 0, 2]], atlas: [64, 64], anim: 'skeleton', scale: 1,
  parts: humanoid(true),
});
mob({
  id: MOB_STRAY, key: 'stray', name: 'Esqueleto errante', hostile: true, health: 20, walk: 1.1, run: 2.3, width: 0.6, height: 1.99,
  damage: 2, burnsInSun: true, drops: [[BONE, 0, 2], [ARROW, 0, 2]], atlas: [64, 64], anim: 'skeleton', scale: 1,
  parts: humanoid(true),
});
mob({
  id: MOB_CREEPER, key: 'creeper', name: 'Creeper', hostile: true, health: 20, walk: 1.0, run: 2.2, width: 0.6, height: 1.7,
  damage: 0, burnsInSun: false, drops: [[GUNPOWDER, 0, 2]], atlas: [64, 64], anim: 'creeper', scale: 1,
  parts: [
    { name: 'head', pivot: [0, 18, 0], from: [-4, 0, -4], size: [8, 8, 8], uv: [0, 0] },
    { name: 'body', pivot: [0, 6, 0], from: [-4, 0, -2], size: [8, 12, 4], uv: [16, 16] },
    ...quadLegs(6, 2, [-4, 4], [0, 16]),
  ],
});
mob({
  id: MOB_SPIDER, key: 'spider', name: 'Araña', hostile: true, neutral: true, health: 16, walk: 1.3, run: 3.0,
  width: 1.4, height: 0.9, damage: 2, burnsInSun: false, drops: [[STRING, 0, 2], [SPIDER_EYE, 0, 1]], atlas: [64, 64], anim: 'spider', scale: 1,
  parts: [
    { name: 'thorax', pivot: [0, 9, 0], from: [-3, -3, -3], size: [6, 6, 6], uv: [0, 0] },
    { name: 'head', parent: 'thorax', pivot: [0, 0, -3], from: [-4, -4, -8], size: [8, 8, 8], uv: [32, 4] },
    { name: 'abdomen', parent: 'thorax', pivot: [0, 0, 3], from: [-5, -4, 0], size: [10, 8, 12], uv: [0, 20] },
    ...spiderLegs(),
  ],
});
mob({
  id: MOB_ENDERMAN, key: 'enderman', name: 'Enderman', hostile: true, neutral: true, health: 40, walk: 1.2, run: 3.4,
  width: 0.6, height: 2.9, damage: 7, burnsInSun: false, drops: [[ENDER_PEARL, 0, 1]], atlas: [64, 64], anim: 'enderman',
  scale: 0.93,
  parts: [
    { name: 'head', pivot: [0, 42, 0], from: [-4, 0, -4], size: [8, 8, 8], uv: [0, 0] },
    { name: 'body', pivot: [0, 30, 0], from: [-4, 0, -2], size: [8, 12, 4], uv: [32, 16] },
    { name: 'armR', pivot: [5, 40, 0], from: [-1, -28, -1], size: [2, 30, 2], uv: [56, 0] },
    { name: 'armL', pivot: [-5, 40, 0], from: [-1, -28, -1], size: [2, 30, 2], uv: [56, 0] },
    { name: 'legR', pivot: [2, 30, 0], from: [-1, -30, -1], size: [2, 30, 2], uv: [56, 0] },
    { name: 'legL', pivot: [-2, 30, 0], from: [-1, -30, -1], size: [2, 30, 2], uv: [56, 0] },
  ],
});
mob({
  id: MOB_SQUID, key: 'squid', name: 'Calamar', hostile: false, health: 10, walk: 1.2, run: 2.5, width: 0.8, height: 0.8,
  damage: 0, burnsInSun: false, drops: [], atlas: [64, 32], anim: 'squid', scale: 0.8, aquatic: true,
  parts: [{ name: 'body', pivot: [0, 18, 0], from: [-6, -8, -6], size: [12, 16, 12], uv: [0, 0] }, ...squidTentacles()],
});

// ---------------------------------------------------------------- fase 6: animales salvajes
mob({
  id: MOB_FOX, key: 'fox', name: 'Zorro', hostile: false, health: 10, walk: 1.3, run: 3.2, width: 0.6, height: 0.7,
  damage: 0, burnsInSun: false, drops: [], atlas: [64, 48], anim: 'quadruped', scale: 1,
  parts: [
    { name: 'body', pivot: [0, 6, 0], from: [-3, 0, -6], size: [6, 6, 11], uv: [0, 12] },
    { name: 'head', pivot: [0, 10, -6], from: [-4, -3, -6], size: [8, 6, 6], uv: [0, 0] },
    { name: 'snout', parent: 'head', pivot: [0, 0, 0], from: [-2, -3, -9], size: [4, 2, 3], uv: [28, 0] },
    { name: 'earR', parent: 'head', pivot: [0, 0, 0], from: [1, 3, -4], size: [2, 2, 1], uv: [44, 0] },
    { name: 'earL', parent: 'head', pivot: [0, 0, 0], from: [-3, 3, -4], size: [2, 2, 1], uv: [44, 0] },
    { name: 'tail', pivot: [0, 10, 5], from: [-2, -2, 0], size: [4, 4, 9], uv: [34, 12], rot: [0.7, 0, 0] },
    ...quadLegs(6, 2, [-4, 3], [0, 30], 2),
  ],
});
mob({
  id: MOB_GOAT, key: 'goat', name: 'Cabra', hostile: false, health: 10, walk: 1.2, run: 2.8, width: 0.9, height: 1.3,
  damage: 0, burnsInSun: false, drops: [], atlas: [64, 64], anim: 'quadruped', scale: 1,
  parts: [
    { name: 'body', pivot: [0, 10, 0], from: [-4, 0, -7], size: [8, 8, 14], uv: [0, 20] },
    { name: 'head', pivot: [0, 17, -7], from: [-2.5, -2, -6], size: [5, 6, 6], uv: [0, 0] },
    { name: 'hornR', parent: 'head', pivot: [0, 0, 0], from: [1, 4, -2], size: [1, 5, 1], uv: [28, 0] },
    { name: 'hornL', parent: 'head', pivot: [0, 0, 0], from: [-2, 4, -2], size: [1, 5, 1], uv: [28, 0] },
    { name: 'beard', parent: 'head', pivot: [0, 0, 0], from: [-0.5, -5, -6], size: [1, 3, 1], uv: [34, 0] },
    { name: 'earR', parent: 'head', pivot: [0, 0, 0], from: [2.5, 2, -2], size: [3, 1, 2], uv: [40, 0] },
    { name: 'earL', parent: 'head', pivot: [0, 0, 0], from: [-5.5, 2, -2], size: [3, 1, 2], uv: [40, 0] },
    ...quadLegs(10, 2.5, [-5, 5], [0, 44], 3),
  ],
});
mob({
  id: MOB_POLAR_BEAR, key: 'polar_bear', name: 'Oso polar', hostile: false, neutral: true, health: 30, walk: 1.0, run: 2.6,
  width: 1.4, height: 1.4, damage: 6, burnsInSun: false, drops: [[COD, 0, 2], [SALMON, 0, 2]], atlas: [128, 64],
  anim: 'quadruped', scale: 1,
  parts: [
    { name: 'body', pivot: [0, 10, 0], from: [-6, 0, -11], size: [12, 12, 22], uv: [0, 20] },
    { name: 'head', pivot: [0, 19, -11], from: [-4, -4, -7], size: [8, 8, 7], uv: [0, 0] },
    { name: 'snout', parent: 'head', pivot: [0, 0, 0], from: [-2.5, -4, -10], size: [5, 3, 3], uv: [32, 0] },
    { name: 'earR', parent: 'head', pivot: [0, 0, 0], from: [2, 4, -3], size: [2, 2, 1], uv: [50, 0] },
    { name: 'earL', parent: 'head', pivot: [0, 0, 0], from: [-4, 4, -3], size: [2, 2, 1], uv: [50, 0] },
    ...quadLegs(10, 4, [-8, 8], [70, 20], 5),
  ],
});
mob({
  id: MOB_RABBIT, key: 'rabbit', name: 'Conejo', hostile: false, health: 3, walk: 1.6, run: 3.6, width: 0.4, height: 0.5,
  damage: 0, burnsInSun: false, drops: [], atlas: [32, 32], anim: 'quadruped', scale: 1,
  parts: [
    { name: 'body', pivot: [0, 3, 0], from: [-2, 0, -3], size: [4, 4, 6], uv: [0, 0] },
    { name: 'head', pivot: [0, 6, -3], from: [-2, -1, -4], size: [4, 4, 4], uv: [0, 10] },
    { name: 'earR', parent: 'head', pivot: [0, 0, 0], from: [0, 3, -2], size: [2, 4, 1], uv: [16, 10] },
    { name: 'earL', parent: 'head', pivot: [0, 0, 0], from: [-2, 3, -2], size: [2, 4, 1], uv: [16, 10] },
    { name: 'tail', pivot: [0, 5, 3], from: [-1, -1, 0], size: [2, 2, 2], uv: [22, 10] },
    ...quadLegs(3, 1.5, [-2, 2], [0, 18], 2),
  ],
});
mob({
  id: MOB_WOLF, key: 'wolf', name: 'Lobo', hostile: false, neutral: true, health: 8, walk: 1.2, run: 3.4, width: 0.6, height: 0.85,
  damage: 4, burnsInSun: false, drops: [], atlas: [64, 48], anim: 'quadruped', scale: 1,
  parts: [
    { name: 'body', pivot: [0, 8, 0], from: [-3, 0, -2], size: [6, 6, 9], uv: [30, 10] },
    { name: 'mane', pivot: [0, 8, -2], from: [-4, -0.5, -6], size: [8, 7, 6], uv: [0, 10] },
    { name: 'head', pivot: [0, 13, -8], from: [-3, -3, -4], size: [6, 6, 4], uv: [0, 0] },
    { name: 'snout', parent: 'head', pivot: [0, 0, 0], from: [-1.5, -3, -7], size: [3, 3, 3], uv: [20, 0] },
    { name: 'earR', parent: 'head', pivot: [0, 0, 0], from: [1, 3, -2], size: [2, 2, 1], uv: [36, 0] },
    { name: 'earL', parent: 'head', pivot: [0, 0, 0], from: [-3, 3, -2], size: [2, 2, 1], uv: [36, 0] },
    { name: 'tail', pivot: [0, 13, 7], from: [-1, -1, 0], size: [2, 2, 8], uv: [0, 26], rot: [0.9, 0, 0] },
    ...quadLegs(8, 2, [-5, 5], [24, 26], 2),
  ],
});

// ---------------------------------------------------------------- fase 6 (monturas)
/** Caballo, burro y mula comparten modelo; cambian las orejas (largas en burros y mulas). */
const horseParts = (earH: number): ModelPart[] => [
  { name: 'body', pivot: [0, 11, 0], from: [-5, 0, -11], size: [10, 10, 22], uv: [0, 32] },
  { name: 'neck', pivot: [0, 17, -8], from: [-2, 0, -3], size: [4, 12, 7], uv: [0, 0], rot: [-0.52, 0, 0] },
  { name: 'head', parent: 'neck', pivot: [0, 11, 0], from: [-3, -1, -4], size: [6, 5, 7], uv: [24, 0] },
  { name: 'mouth', parent: 'head', pivot: [0, 0, 0], from: [-2, -1, -10], size: [4, 4, 6], uv: [52, 0] },
  { name: 'earR', parent: 'head', pivot: [0, 0, 0], from: [0.5, 4, 0.5], size: [2, earH, 1], uv: [74, 0] },
  { name: 'earL', parent: 'head', pivot: [0, 0, 0], from: [-2.5, 4, 0.5], size: [2, earH, 1], uv: [74, 0] },
  { name: 'mane', parent: 'neck', pivot: [0, 0, 0], from: [-1, 1, 4], size: [2, 14, 2], uv: [82, 0] },
  { name: 'tail', pivot: [0, 20, 11], from: [-1.5, -12, 0], size: [3, 12, 4], uv: [92, 0], rot: [-0.4, 0, 0] },
  ...quadLegs(11, 3, [-8, 8], [24, 14]),
  { name: 'saddle', pivot: [0, 21, -1], from: [-6, -2, -5], size: [12, 3, 10], uv: [64, 32] },
  { name: 'stirrupR', pivot: [6, 19, -1], from: [0, -6, -1], size: [1, 6, 2], uv: [108, 0] },
  { name: 'stirrupL', pivot: [-6, 19, -1], from: [-1, -6, -1], size: [1, 6, 2], uv: [108, 0] },
];

mob({
  id: MOB_HORSE, key: 'horse', name: 'Caballo', hostile: false, health: 22, walk: 1.4, run: 3.4, width: 1.3, height: 1.6,
  damage: 0, burnsInSun: false, drops: [[LEATHER, 0, 2]], atlas: [128, 64], anim: 'quadruped', scale: 1, parts: horseParts(3),
});
mob({
  id: MOB_DONKEY, key: 'donkey', name: 'Burro', hostile: false, health: 20, walk: 1.3, run: 3, width: 1.2, height: 1.4,
  damage: 0, burnsInSun: false, drops: [[LEATHER, 0, 2]], atlas: [128, 64], anim: 'quadruped', scale: 0.87, parts: horseParts(7),
});
mob({
  id: MOB_MULE, key: 'mule', name: 'Mula', hostile: false, health: 22, walk: 1.3, run: 3, width: 1.25, height: 1.5,
  damage: 0, burnsInSun: false, drops: [[LEATHER, 0, 2]], atlas: [128, 64], anim: 'quadruped', scale: 0.92, parts: horseParts(6),
});
mob({
  id: MOB_LLAMA, key: 'llama', name: 'Llama', hostile: false, neutral: true, health: 20, walk: 1.2, run: 2.8, width: 0.9,
  height: 1.87, damage: 1, burnsInSun: false, drops: [[LEATHER, 0, 2]], atlas: [128, 64], anim: 'quadruped', scale: 0.85,
  parts: [
    { name: 'body', pivot: [0, 13, 0], from: [-6, 0, -9], size: [12, 10, 18], uv: [0, 36] },
    { name: 'neck', pivot: [0, 20, -7], from: [-4, 0, -3], size: [8, 11, 6], uv: [0, 0] },
    { name: 'head', parent: 'neck', pivot: [0, 11, 0], from: [-4, 0, -3], size: [8, 6, 6], uv: [30, 0] },
    { name: 'snout', parent: 'head', pivot: [0, 0, 0], from: [-2, 0, -7], size: [4, 4, 4], uv: [60, 0] },
    { name: 'earR', parent: 'head', pivot: [0, 0, 0], from: [1.5, 6, -1], size: [2, 3, 2], uv: [78, 0] },
    { name: 'earL', parent: 'head', pivot: [0, 0, 0], from: [-3.5, 6, -1], size: [2, 3, 2], uv: [78, 0] },
    { name: 'tail', pivot: [0, 21, 9], from: [-2, -4, 0], size: [4, 5, 2], uv: [88, 0], rot: [-0.2, 0, 0] },
    ...quadLegs(13, 3.5, [-6, 6], [0, 18]),
  ],
});
mob({
  id: MOB_CAMEL, key: 'camel', name: 'Camello', hostile: false, health: 32, walk: 1.1, run: 2.6, width: 1.5, height: 2.3,
  damage: 0, burnsInSun: false, drops: [], atlas: [128, 64], anim: 'quadruped', scale: 1,
  parts: [
    { name: 'body', pivot: [0, 18, 0], from: [-7, 0, -11], size: [14, 11, 22], uv: [0, 28] },
    { name: 'hump', parent: 'body', pivot: [0, 11, 0], from: [-4, 0, -5], size: [8, 5, 9], uv: [74, 28] },
    { name: 'neck', pivot: [0, 24, -10], from: [-2.5, -1, -4], size: [5, 14, 5], uv: [0, 0], rot: [-0.7, 0, 0] },
    { name: 'head', parent: 'neck', pivot: [0, 13, 0], from: [-3, -1, -9], size: [6, 5, 10], uv: [22, 0], rot: [0.6, 0, 0] },
    { name: 'earR', parent: 'head', pivot: [0, 0, 0], from: [2.5, 3, 0], size: [2, 1, 2], uv: [56, 0] },
    { name: 'earL', parent: 'head', pivot: [0, 0, 0], from: [-4.5, 3, 0], size: [2, 1, 2], uv: [56, 0] },
    { name: 'tail', pivot: [0, 27, 11], from: [-1, -9, 0], size: [2, 9, 1], uv: [66, 0] },
    ...quadLegs(18, 4, [-8, 8], [80, 0]),
    { name: 'saddle', parent: 'body', pivot: [0, 11, 0], from: [-5, -1, -6], size: [10, 7, 11], uv: [74, 44] },
    { name: 'stirrupR', pivot: [7, 28, -1], from: [0, -7, -1], size: [1, 7, 2], uv: [98, 0] },
    { name: 'stirrupL', pivot: [-7, 28, -1], from: [-1, -7, -1], size: [1, 7, 2], uv: [98, 0] },
  ],
});
// ---------------------------------------------------------------- Fase 6 (aldeanos): aldeano y comerciante
/** Aldeano: cabeza grande con nariz, túnica larga y los brazos cruzados delante. */
const villagerParts = (): ModelPart[] => [
  { name: 'head', pivot: [0, 24, 0], from: [-4, 0, -4], size: [8, 10, 8], uv: [0, 0] },
  { name: 'nose', parent: 'head', pivot: [0, 0, 0], from: [-1, 1, -6], size: [2, 4, 2], uv: [32, 0] },
  { name: 'body', pivot: [0, 24, 0], from: [-4, -18, -3], size: [8, 18, 6], uv: [16, 20] },
  { name: 'arms', pivot: [0, 22, -1], from: [-4, -6, -2], size: [8, 4, 4], uv: [40, 44], rot: [0.75, 0, 0] },
  { name: 'armR', parent: 'arms', pivot: [0, 0, 0], from: [4, -8, -2], size: [4, 8, 4], uv: [44, 22] },
  { name: 'armL', parent: 'arms', pivot: [0, 0, 0], from: [-8, -8, -2], size: [4, 8, 4], uv: [44, 22] },
  { name: 'legR', pivot: [2, 12, 0], from: [-2, -12, -2], size: [4, 12, 4], uv: [0, 22] },
  { name: 'legL', pivot: [-2, 12, 0], from: [-2, -12, -2], size: [4, 12, 4], uv: [0, 22] },
];
mob({
  id: MOB_VILLAGER, key: 'villager', name: 'Aldeano', hostile: false, health: 20, walk: 0.9, run: 2.2, width: 0.6, height: 1.95,
  damage: 0, burnsInSun: false, drops: [], atlas: [64, 64], anim: 'villager', scale: 0.94, parts: villagerParts(),
});
mob({
  id: MOB_WANDERING_TRADER, key: 'wandering_trader', name: 'Comerciante ambulante', hostile: false, health: 20, walk: 0.9,
  run: 2.2, width: 0.6, height: 1.95, damage: 0, burnsInSun: false, drops: [], atlas: [64, 64], anim: 'villager', scale: 0.94,
  parts: villagerParts(),
});
/** ¿Aldeano o comerciante ambulante (se comercia con ellos)? */
export const isVillagerType = (type: number): boolean => type === MOB_VILLAGER || type === MOB_WANDERING_TRADER;

export const MOB_TYPES: readonly number[] = MOBS.filter(Boolean).map((m) => m.id);

/**
 * Rectángulos de cada cara de una caja en el atlas (disposición de Minecraft):
 * [u, v, ancho, alto] para +X, -X, +Y (arriba), -Y (abajo), -Z (frente), +Z (espalda).
 */
export function boxFaces(u: number, v: number, w: number, h: number, d: number): [number, number, number, number][] {
  return [
    [u, v + d, d, h],
    [u + d + w, v + d, d, h],
    [u + d, v, w, d],
    [u + d + w, v, w, d],
    [u + d, v + d, w, h],
    [u + d + w + d, v + d, w, h],
  ];
}
