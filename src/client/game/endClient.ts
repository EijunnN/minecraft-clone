// Fase 8.6 (el End): lo que el cliente hace con las cosas del End.
// - Fruta de coro: al comerla, teletransporte al azar (teleport_randomly, diámetro 16, como en Java): hasta 16
//   intentos a ±8 bloques; en cada uno se baja hasta algo firme y vale si cabe sin tocar líquidos. Suena donde
//   se estaba y donde se llega, y la fruta queda en espera un segundo.
import { CHORUS_FRUIT } from '../../shared/items';
import { BLOCK_FLUID, BLOCK_SOLID } from '../../shared/blocks';
import { boxBlocked } from '../../shared/collide';
import { PLAYER_WIDTH } from '../../shared/constants';
import type { Game } from './Game';

/** Hasta cuándo (ms) espera cada objeto antes de poder usarse otra vez. */
const cooldown = new Map<number, number>();

/** ¿Está en espera el objeto? (y cuánto le falta, 0..1, para la barra). */
export function itemCooldown(id: number): number {
  const until = cooldown.get(id);
  if (until === undefined) return 0;
  const left = until - performance.now();
  if (left <= 0) {
    cooldown.delete(id);
    return 0;
  }
  return left / 1000;
}

/** Tras comer algo del End: la fruta de coro teletransporta. */
export function endAfterEat(g: Game, item: number): void {
  if (item !== CHORUS_FRUIT) return;
  cooldown.set(CHORUS_FRUIT, performance.now() + 1000);
  const w = g.world;
  if (!w) return;
  const p = g.player;
  const get = (x: number, y: number, z: number) => w.getBlock(x, y, z);
  const hw = PLAYER_WIDTH / 2;
  const from: [number, number, number] = [p.x, p.y, p.z];
  for (let i = 0; i < 16; i++) {
    const x = p.x + (Math.random() - 0.5) * 16, z = p.z + (Math.random() - 0.5) * 16;
    let y = Math.floor(Math.max(0, Math.min(255, p.y + (Math.random() - 0.5) * 16)));
    const bx = Math.floor(x), bz = Math.floor(z);
    if (get(bx, y, bz) < 0) continue; // sin cargar
    let found = false;
    while (!found && y > -64) {
      const below = get(bx, y - 1, bz);
      if (below > 0 && BLOCK_SOLID[below]) found = true;
      else y--;
    }
    if (!found) continue;
    if (boxBlocked(w, x - hw, y, z - hw, x + hw, y + p.height, z + hw)) continue;
    let wet = false;
    for (let yy = y; yy < y + p.height && !wet; yy++) if (BLOCK_FLUID[Math.max(0, get(bx, Math.floor(yy), bz))]) wet = true;
    if (wet) continue;
    g.audio.playEquipSfx('chorus_teleport', from);
    p.x = x;
    p.y = y;
    p.z = z;
    p.vx = p.vy = p.vz = 0;
    p.fallDistance = 0;
    g.sendPos(true);
    g.audio.playEquipSfx('chorus_teleport', [x, y, z]);
    g.renderer.entities.pfx.magic(from[0], from[1] + 1, from[2], 16, 0.5);
    return;
  }
}
