// Fase 8.6 (el End): efectos de las cosas del End en el cliente.
// - Del servidor: el ojo de ender que se engasta en un marco (humo y el golpe), el portal que se abre (en toda la
//   dimensión), el ojo que cae o se rompe (levelEvent 2003: trocitos y un remolino de partículas de portal), la
//   perla que cae (32 partículas de portal y el sonido del teletransporte) y el lanzamiento del ojo.
// - Cada frame: las partículas de portal que sueltan los enderman y las endermitas (dos por tick, como en su
//   aiStep) y la estela del ojo de ender en vuelo (cuatro por tick; burbujas si va por el agua).
import { MOB_ENDERMAN, MOB_ENDERMITE, ENT_THROWN } from '../../shared/mobs';
import { ENDER_EYE } from '../../shared/items';
import type { Game } from './Game';

/** true si el efecto era de este módulo. */
export function endFx(g: Game, kind: string, p: [number, number, number]): boolean {
  const fx = g.renderer.entities;
  const pfx = fx.pfx;
  switch (kind) {
    case 'end_frame_fill':
      g.audio.playEquipSfx('end_portal_frame_fill', p);
      fx.spawnSmoke(p[0], p[1], p[2], 16, 0.35, 0.3, 0.3, 0.6);
      for (let i = 0; i < 10; i++) pfx.portal(p[0], p[1] - 0.3, p[2], (Math.random() - 0.5) * 1.2, Math.random() * 0.5, (Math.random() - 0.5) * 1.2);
      return true;
    case 'end_portal_spawn': {
      // Se oye en toda la dimensión: desde la dirección del portal, a dos bloques del que escucha.
      const pl = g.player;
      const dx = p[0] - pl.x, dz = p[2] - pl.z, d = Math.hypot(dx, dz) || 1;
      const near: [number, number, number] = d < 2 ? p : [pl.x + (dx / d) * 2, pl.eyeY, pl.z + (dz / d) * 2];
      g.audio.playEquipSfx('end_portal_spawn', near);
      for (let i = 0; i < 60; i++) pfx.portal(p[0], p[1], p[2], (Math.random() - 0.5) * 3, Math.random() * 1.5, (Math.random() - 0.5) * 3);
      return true;
    }
    case 'ender_eye_launch':
      g.audio.playEquipSfx('ender_eye_launch', p);
      return true;
    case 'ender_eye_drop':
      g.audio.playEquipSfx('ender_eye_death', p);
      return true;
    case 'ender_eye_break':
      g.audio.playEquipSfx('ender_eye_death', p);
      fx.spawnSmoke(p[0], p[1], p[2], 8, 0.2, 0.25, 0.25, 0.4);
      for (let i = 0; i < 40; i++) {
        const a = (i / 40) * Math.PI * 2;
        pfx.portal(p[0], p[1] - 0.6, p[2], Math.cos(a) * 1.4, Math.random() * 0.4, Math.sin(a) * 1.4);
      }
      pfx.magic(p[0], p[1], p[2], 10, 0.3);
      return true;
    case 'pearl_land':
      g.audio.playEquipSfx('chorus_teleport', p);
      for (let i = 0; i < 32; i++) pfx.portal(p[0], p[1] - 0.6, p[2], (Math.random() - 0.5) * 2, Math.random() * 2 - 0.5, (Math.random() - 0.5) * 2);
      return true;
    default:
      return false;
  }
}

/** Cada frame: partículas de portal de enderman y endermitas y la estela del ojo de ender. */
export function endTick(g: Game, dt: number): void {
  const pl = g.player;
  const pfx = g.renderer.entities.pfx;
  const ticks = dt * 20;
  for (const e of g.ents.list.values()) {
    if (e.gone || e.deathT >= 0) continue;
    const d = Math.hypot(e.x - pl.x, e.y - pl.y, e.z - pl.z);
    if (d > 40) continue;
    if (e.type === MOB_ENDERMAN || e.type === MOB_ENDERMITE) {
      // Dos por tick de cerca; de lejos menos (no se ven y cuestan).
      const rate = 2 * ticks * (d < 16 ? 1 : 0.4);
      const tall = e.type === MOB_ENDERMAN ? 2.9 : 0.3, half = e.type === MOB_ENDERMAN ? 0.3 : 0.2;
      for (let n = Math.floor(rate + Math.random()); n > 0; n--) {
        pfx.portal(e.x + (Math.random() - 0.5) * half * 2, e.y + Math.random() * tall - 0.25, e.z + (Math.random() - 0.5) * half * 2,
          (Math.random() - 0.5) * 2, -Math.random(), (Math.random() - 0.5) * 2);
      }
    } else if (e.type === ENT_THROWN && e.item === ENDER_EYE) {
      for (let n = Math.floor(4 * ticks + Math.random()); n > 0; n--) {
        pfx.portal(e.x + Math.random() * 0.6 - 0.3, e.y - 0.5, e.z + Math.random() * 0.6 - 0.3, (Math.random() - 0.5) * 0.4, -0.2, (Math.random() - 0.5) * 0.4);
      }
    }
  }
}
