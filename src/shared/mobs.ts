// Criaturas: estadísticas, botín y modelos por cajas (en píxeles, 1 px = 1/16 de bloque).
// El modelo mira hacia -Z; y crece hacia arriba desde los pies.
import {
  RAW_PORKCHOP, RAW_BEEF, LEATHER, RAW_MUTTON, RAW_CHICKEN, FEATHER, ROTTEN_FLESH, BONE, ARROW, GUNPOWDER, STRING,
  ENDER_PEARL, SPIDER_EYE,
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

export type MobAnim = 'quadruped' | 'humanoid' | 'zombie' | 'skeleton' | 'creeper' | 'spider' | 'chicken' | 'enderman' | 'squid';

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
