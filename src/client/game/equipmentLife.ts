// Fase 6.5 (equipo): lo que el equipo cambia en el jugador cada frame: el caparazón de tortuga (10 s de
// respiración acuática al sacar la cabeza del agua), el efecto Resistencia (lo aplica Survival), si
// el jugador está dentro del fuego y la estela de los cohetes en vuelo.
import type { Game } from './Game';
import { isFire } from '../../shared/blocks';
import { TURTLE_HELMET } from '../../shared/items';
import { EFFECT_RESISTANCE, EFFECT_WATER_BREATHING } from '../../shared/effects';
import { TURTLE_SHELL_BREATH } from '../../shared/equipment';
import { fireworkTrails } from './equipmentFx';

/** Cada frame (también en creativo): partículas del equipo. */
export function equipmentFrame(g: Game, dt: number): void {
  fireworkTrails(g, dt);
}

/** Antes de actualizar la supervivencia: Resistencia y el caparazón de tortuga. */
export function equipmentSurvival(g: Game): void {
  const fx = g.statusEffects;
  g.survival.resistance = fx.amp(EFFECT_RESISTANCE);
  if (g.inv.armor[0]?.id === TURTLE_HELMET && !g.player.eyeInWater) {
    const cur = fx.list.get(EFFECT_WATER_BREATHING);
    if (!cur || (cur.amp === 0 && cur.time < TURTLE_SHELL_BREATH - 0.5)) fx.add(EFFECT_WATER_BREATHING, TURTLE_SHELL_BREATH, 0, g.survival);
  }
}

/** ¿Toca el jugador un bloque de fuego? (pies o cuerpo). */
export function playerInFire(g: Game): boolean {
  const p = g.player, w = g.world;
  if (!w) return false;
  const x = Math.floor(p.x), z = Math.floor(p.z);
  return isFire(w.getBlock(x, Math.floor(p.y + 0.05), z)) || isFire(w.getBlock(x, Math.floor(p.y + 1), z));
}
