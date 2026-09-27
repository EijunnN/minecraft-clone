// Fase 8.6 (el End): las criaturas del End. Aquí va lo que comparten el servidor y el cliente: ids, constantes de
// Java 26.3 (en ticks, como allí) y los modelos (con los números de las clases del cliente de Java).
// - Endermita (id 96): la que a veces sale al caer una perla de ender (5 %). Cuatro segmentos (EndermiteModel),
//   8 de vida, muerde por 2; a los 2400 ticks se va si nadie le ha puesto nombre; los enderman la persiguen.
// - Dragón de Ender (id 97): el jefe del End (200 de vida, 16 × 8). Vuela por fases (EnderDragonPhase), se cura con
//   los cristales, rompe lo que atraviesa y lo que toca le hace daño por partes (la cabeza entero; el resto, un cuarto).
// - Cristal del End (entidad 123) y bola de fuego del dragón (entidad 124).
// mobs.ts las registra; su comportamiento va en sim/entities (monsterAi.ts, enderDragon.ts).
import type { MobDef, ModelPart } from './mobs';
import { javaGroundSpeed } from './netherMobs';
import { EF_FAUNA_A, EF_FAUNA_B } from './fauna';

export const MOB_ENDERMITE = 96;
export const MOB_ENDER_DRAGON = 97;
export const ENT_END_CRYSTAL = 123;
export const ENT_DRAGON_FIREBALL = 124;

/** Bits de estado del dragón: sentado en el podio (fases de SITTING_*) y aterrizando o despegando. */
export const EF_DRAGON_SITTING = EF_FAUNA_A;
export const EF_DRAGON_LANDING = EF_FAUNA_B;
/** Vida del dragón (EnderDragon.createAttributes: MAX_HEALTH 200). */
export const DRAGON_HEALTH = 200;
/** Experiencia del dragón: la primera vez 12 000; después, 500. */
export const DRAGON_XP_FIRST = 12000;
export const DRAGON_XP_AGAIN = 500;
/** Partes del dragón (EnderDragonPart): nombre, ancho y alto. La cabeza recibe el daño entero; el resto, un cuarto + 1. */
export const DRAGON_PARTS: readonly (readonly [string, number, number])[] = [
  ['head', 1, 1], ['neck', 3, 3], ['body', 5, 3], ['tail1', 2, 2], ['tail2', 2, 2], ['tail3', 2, 2], ['wing1', 4, 2], ['wing2', 4, 2],
];

/** Ticks que vive una endermita sin nombre (Endermite.aiStep: life ≥ 2400 → discard). */
export const ENDERMITE_LIFE_TICKS = 2400;
/** Probabilidad de que salga una endermita donde estaba quien lanzó la perla (ThrownEnderpearl.onHit). */
export const ENDERMITE_PEARL_CHANCE = 0.05;

/** EndermiteModel: cuatro segmentos [tamaño, z del centro, uv] de la cabeza (−z) a la cola. */
function endermiteParts(): ModelPart[] {
  const sizes: [number, number, number][] = [[4, 3, 2], [6, 4, 5], [3, 3, 1], [1, 2, 1]];
  const uvs: [number, number][] = [[0, 0], [0, 5], [0, 14], [0, 18]];
  const out: ModelPart[] = [];
  let z = -3.5;
  for (let i = 0; i < 4; i++) {
    const s = sizes[i];
    out.push({ name: `seg${i}`, pivot: [0, 0, z], from: [-s[0] / 2, 0, -s[2] / 2], size: s, uv: uvs[i] });
    if (i < 3) z += (s[2] + sizes[i + 1][2]) * 0.5;
  }
  return out;
}

/** Las criaturas del End (las registra mobs.ts). */
export function endMobs(): MobDef[] {
  return [
    {
      id: MOB_ENDERMITE, key: 'endermite', name: 'Endermita', hostile: true, health: 8, walk: 1.4, run: javaGroundSpeed(0.25),
      width: 0.4, height: 0.3, damage: 2, burnsInSun: false, drops: [], atlas: [64, 32], parts: endermiteParts(), anim: 'endermite',
      scale: 1, xp: 3,
    },
    {
      id: MOB_ENDER_DRAGON, key: 'ender_dragon', name: 'Dragón de Ender', hostile: true, health: DRAGON_HEALTH, walk: 0, run: 0,
      width: 16, height: 8, damage: 10, burnsInSun: false, drops: [], atlas: [256, 256], parts: [], anim: 'dragon', scale: 1,
      flying: true, fireImmune: true, xp: 0,
    },
  ];
}

const END = new Set([MOB_ENDERMITE, MOB_ENDER_DRAGON]);
export function isEndMob(type: number): boolean {
  return END.has(type);
}
