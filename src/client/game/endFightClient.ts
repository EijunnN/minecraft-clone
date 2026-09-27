// Fase 8.6 (el End): el combate con el dragón en el cliente.
// - La barra del jefe que manda el servidor (y, mientras se ve, más niebla y la música del combate).
// - Los haces de los cristales (hasta el dragón que curan, o a donde apuntan en la reaparición) y los rayos de la
//   muerte del dragón.
// - Las puertas del End: el haz morado cuando sale una nueva (10 s) o cuando alguien la cruza (2 s).
import { MOB_ENDER_DRAGON, ENT_END_CRYSTAL } from '../../shared/mobs';
import type { CrystalBeam, DragonRays } from '../render/EndFxRenderer';
import type { BeaconBeam } from './beacons';
import type { Game } from './Game';
import { dragonYRot } from './dragonClient';

let boss: { name: string; h: number } | null = null;
/** Niebla del combate (0..1, suavizada) y cuándo se calculó. */
let fogK = 0, fogAt = 0;
const gates: { x: number; y: number; z: number; until: number; born: number }[] = [];

export function bossState(): { name: string; h: number } | null {
  return boss;
}

export function onBossMsg(msg: { n?: string; h: number }): void {
  boss = msg.h < 0 ? null : { name: msg.n ?? boss?.name ?? '', h: msg.h };
}

/** Un haz en la puerta de (x, y, z) durante `seconds`. */
export function gatewayBeam(x: number, y: number, z: number, seconds: number): void {
  const now = performance.now() / 1000;
  const g = gates.find((q) => q.x === x && q.y === y && q.z === z);
  if (g) g.until = Math.max(g.until, now + seconds);
  else gates.push({ x, y, z, until: now + seconds, born: now });
}

/** Lo que dibuja el renderer este frame. */
export function frame(g: Game): { endRays?: DragonRays[]; crystalBeams?: CrystalBeam[]; gatewayBeams?: BeaconBeam[]; bossFog?: number } {
  const rays: DragonRays[] = [];
  const beams: CrystalBeam[] = [];
  const time = performance.now() / 1000;
  const crystals = [...g.ents.list.values()].filter((e) => e.type === ENT_END_CRYSTAL && !e.gone);
  for (const e of g.ents.list.values()) {
    if (e.type !== MOB_ENDER_DRAGON || e.gone) continue;
    if (e.variant > 0) rays.push({ x: e.x, y: e.y, z: e.z, yRot: dragonYRot(e), death: e.variant });
    else {
      // El cristal más cercano a su alcance (la caja del dragón agrandada 32 bloques).
      let best = null as (typeof crystals)[number] | null, bd = Infinity;
      for (const c of crystals) {
        if (Math.abs(c.x - e.x) > 40 || Math.abs(c.y - e.y) > 36 || Math.abs(c.z - e.z) > 40) continue;
        const d = (c.x - e.x) ** 2 + (c.y - e.y) ** 2 + (c.z - e.z) ** 2;
        if (d < bd) {
          bd = d;
          best = c;
        }
      }
      if (best) beams.push({ from: g.renderer.mobs.dragon.crystalBeamOrigin(best, time), to: [e.x, e.y + 2, e.z] });
    }
  }
  for (const c of crystals) {
    if (Array.isArray(c.leash)) beams.push({ from: g.renderer.mobs.dragon.crystalBeamOrigin(c, time), to: [c.leash[0] + 0.5, c.leash[1], c.leash[2] + 0.5] });
  }
  const now = time;
  for (let i = gates.length - 1; i >= 0; i--) if (gates[i].until < now) gates.splice(i, 1);
  const gatewayBeams: BeaconBeam[] = gates.map((q) => ({
    x: q.x, y: q.y, z: q.z, age: now - q.born, segments: [{ y0: q.y + 0.5, y1: q.y + 256, color: [0.78, 0.35, 0.95] as [number, number, number] }],
  })) as BeaconBeam[];
  // La niebla del jefe (BossEvent.createWorldFog) entra y sale despacio.
  const dt = Math.min(0.1, fogAt ? time - fogAt : 0);
  fogAt = time;
  fogK += ((boss ? 1 : 0) - fogK) * Math.min(1, dt * 0.8);
  return {
    ...(fogK > 0.01 ? { bossFog: fogK } : {}),
    ...(rays.length ? { endRays: rays } : {}),
    ...(beams.length ? { crystalBeams: beams } : {}),
    ...(gatewayBeams.length ? { gatewayBeams } : {}),
  };
}
