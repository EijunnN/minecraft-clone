// Fase 8.6 (el End): las criaturas del End. Aquí va lo que comparten el servidor y el cliente: ids, constantes de
// Java 26.3 (en ticks, como allí) y los modelos (con los números de las clases del cliente de Java).
// - Endermita (id 96): la que a veces sale al caer una perla de ender (5 %). Cuatro segmentos (EndermiteModel),
//   8 de vida, muerde por 2; a los 2400 ticks se va si nadie le ha puesto nombre; los enderman la persiguen.
// mobs.ts las registra; su comportamiento va en sim/entities (monsterAi.ts).
import type { MobDef, ModelPart } from './mobs';
import { javaGroundSpeed } from './netherMobs';

export const MOB_ENDERMITE = 96;

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
  ];
}

const END = new Set([MOB_ENDERMITE]);
export function isEndMob(type: number): boolean {
  return END.has(type);
}
