// Efectos que llegan del servidor (sonidos y partículas) y sonidos de ambiente de las criaturas y
// los fluidos cercanos.
import type { MobSoundKind, MobSoundEvent } from '../audio/types';
import type { ClientEntity } from './ClientEntities';
import { BLOCK_FLUID, BLOCK_FLUID_LEVEL, GRASS, CAMPFIRE, isLitFurnace, isValidBlockId } from '../../shared/blocks';
import { MOBS } from '../../shared/mobs';
import { EF_LOVE, EF_BABY, EF_FIRE } from '../../shared/protocol';
import type { Game } from './Game';
import { aquaticFx } from './aquaticFx'; // Fase 6 (acuáticos)
import { illagerFx } from './illagerFx'; // Fase 6 (asaltos)
import { faunaFx } from './faunaEffects'; // Fase 6 (fauna)
import { copperFx } from './copperInteraction'; // Fase 6.5 (cobre)

export class Effects {
  constructor(private g: Game) {}

  idleSounds = new Map<number, number>();
  stepSounds = new Map<number, number>();
  fluidTimer = 0;
  heartT = 0;

  onFx(kind: string, p: [number, number, number], a?: number, b?: number): void {
    if (!Array.isArray(p) || !p.every(Number.isFinite)) return;
    void b;
    const mob = a !== undefined ? MOBS[a] : undefined;
    const mk = (mob?.sound ?? mob?.key) as MobSoundKind | undefined; // Fase 6 (monstruos): voz prestada (MobDef.sound)
    const fx = this.g.renderer.entities;
    switch (kind) {
      case 'lightning': {
        // Rayo: se ve de lejos; el trueno llega con retraso y el destello depende de la distancia.
        const pl = this.g.player;
        const d = Math.hypot(p[0] - pl.x, p[2] - pl.z);
        if (d > 300) break;
        this.g.bolts.push({ x: p[0], y: p[1], z: p[2], age: 0, seed: (Math.random() * 2 ** 31) | 0 });
        this.g.flash = Math.max(this.g.flash, Math.max(0.15, 1 - d / 200));
        this.g.audio.playThunder(d);
        if (d < 24) this.g.shake = Math.max(this.g.shake, 0.5 * (1 - d / 24));
        break;
      }
      // Fase 6.5 (decoración): campana, cuadros y marcos.
      case 'bell':
      case 'hang_place':
      case 'hang_break':
      case 'frame_add':
      case 'frame_remove':
      case 'frame_rotate':
        this.g.audio.playDecorSfx(kind, p);
        break;
      case 'snowball_break':
        fx.pfx.splash(p[0], p[1], p[2], 8);
        fx.spawnSmoke(p[0], p[1], p[2], 4, 0.15, 0.95, 0.2, 0.3);
        this.g.audio.playBlockHit('snow', p);
        break;
      case 'mob_hurt':
        if (mk) this.g.audio.playMob(mk, 'hurt', p);
        break;
      case 'mob_death':
        if (mk) this.g.audio.playMob(mk, 'death', p);
        fx.spawnSmoke(p[0], p[1], p[2], 14, 0.45, 0.85, 0.3, 0.8);
        break;
      case 'mob_attack':
        if (mk) this.g.audio.playMob(mk, 'attack', p);
        break;
      case 'mob_shoot':
        if (mk) this.g.audio.playMob(mk, 'shoot', p);
        break;
      case 'creeper_fuse':
        this.g.audio.playMob('creeper', 'fuse', p);
        break;
      case 'teleport':
        this.g.audio.playMob('enderman', 'teleport', p);
        fx.spawnSmoke(p[0], p[1], p[2], 16, 0.6, 0.15, 0.18, 0.4);
        break;
      case 'enderman_scream':
        this.g.audio.playMob('enderman', 'attack', p);
        break;
      case 'arrow_hit':
        this.g.audio.playArrowHit(p);
        break;
      case 'bow':
        this.g.audio.playBowShoot(p, a ?? 1);
        break;
      case 'explode': {
        const power = a ?? 3;
        this.g.audio.playExplosion(p, power);
        fx.pfx.explosion(p[0], p[1], p[2], power);
        const d = Math.hypot(p[0] - this.g.player.x, p[1] - this.g.player.y, p[2] - this.g.player.z);
        this.g.shake = Math.max(this.g.shake, Math.max(0, 1 - d / 24));
        break;
      }
      case 'spawner':
        // Criatura recién salida de un generador: humo oscuro.
        fx.spawnSmoke(p[0], p[1], p[2], 14, 0.45, 0.2, 0.6, 1.2);
        break;
      case 'burn_item':
        fx.spawnSmoke(p[0], p[1], p[2], 6, 0.2, 0.25, 0.2, 1);
        break;
      case 'leaves':
        if (a !== undefined && isValidBlockId(a)) fx.spawnBreak(Math.floor(p[0]), Math.floor(p[1]), Math.floor(p[2]), a, 0xf0);
        break;
      // Fase 6 (aldeanos): oficio nuevo, subida de nivel, trato hecho o «no».
      case 'villager_job':
      case 'villager_levelup':
        fx.spawnSparkles(p[0], p[1], p[2], kind === 'villager_levelup' ? 24 : 12, 0.5);
        this.g.audio.playMob('villager', 'idle', p);
        break;
      case 'villager_yes':
        fx.spawnSparkles(p[0], p[1], p[2], 4, 0.3);
        this.g.audio.playMob('villager', 'attack', p);
        break;
      case 'villager_no':
        this.g.audio.playMob('villager', 'fuse', p);
        fx.pfx.angry(p[0], p[1] + 0.3, p[2]);
        break;
      case 'feed':
        this.g.audio.playEat();
        fx.spawnHearts(p[0], p[1], p[2], 3, 0.3);
        break;
      case 'breed':
        fx.spawnHearts(p[0], p[1], p[2], 9, 0.6);
        this.g.audio.playPickup();
        break;
      case 'shear':
        this.g.audio.playBreak('wool', p);
        break;
      // Fase 6 (gólems/domesticar)
      case 'tame':
        fx.spawnHearts(p[0], p[1], p[2], 7, 0.5);
        this.g.audio.playPickup();
        break;
      case 'tame_fail':
        fx.spawnSmoke(p[0], p[1], p[2], 7, 0.3, 0.55, 0.3, 0.8);
        break;
      case 'golem_build':
        fx.spawnSmoke(p[0], p[1], p[2], 24, 0.9, 0.85, 0.5, 1.2);
        this.g.audio.playPlace(a === undefined || MOBS[a]?.key !== 'snow_golem' ? 'metal' : 'snow', p);
        break;
      case 'golem_repair':
        this.g.audio.playPlace('metal', p);
        fx.spawnSparkles(p[0], p[1], p[2], 8, 0.6);
        break;
      case 'milk':
        this.g.audio.playSplash(p, 0.25);
        break;
      case 'egg':
        this.g.audio.playPickup();
        break;
      case 'eat_grass':
        this.g.audio.playBreak('grass', p);
        fx.spawnBreak(Math.floor(p[0]), Math.floor(p[1] - 1), Math.floor(p[2]), GRASS, 0xf0);
        break;
      case 'bonemeal':
        this.g.audio.playPlace('grass', p);
        fx.spawnSparkles(p[0], p[1], p[2], 12, 0.5);
        break;
      case 'campfire_put':
        this.g.audio.playPlace('wood', p);
        break;
      case 'campfire_done':
        this.g.audio.playPickup();
        fx.spawnSmoke(p[0], p[1], p[2], 6, 0.2, 0.7, 0.4, 1.2);
        break;
      // Huevos y pesca.
      case 'throw':
        this.g.audio.playBowShoot(p, 0.15);
        break;
      case 'egg_break':
        this.g.audio.playBlockHit('sand', p);
        fx.spawnSmoke(p[0], p[1], p[2], 6, 0.15, 0.95, 0.35, 0.6);
        break;
      case 'rod_cast':
        this.g.audio.playBowShoot(p, 0.3);
        break;
      case 'fish_splash':
        this.g.audio.playSplash(p, 0.3);
        fx.spawnSmoke(p[0], p[1], p[2], 5, 0.2, 0.9, 0.3, 0.8);
        break;
      case 'fish_bite':
        this.g.audio.playSplash(p, 0.7);
        fx.spawnSmoke(p[0], p[1], p[2], 10, 0.3, 0.92, 0.35, 1.4);
        break;
      case 'fish_catch':
        this.g.audio.playSplash(p, 0.5);
        this.g.audio.playPickup();
        break;
      // Compostador.
      case 'compost':
        this.g.audio.playPlace('grass', p);
        if (a) fx.spawnSparkles(p[0], p[1], p[2], 6, 0.3);
        break;
      case 'compost_ready':
        this.g.audio.playPlace('gravel', p);
        fx.spawnSparkles(p[0], p[1], p[2], 10, 0.4);
        break;
      case 'compost_empty':
        this.g.audio.playBreak('grass', p);
        break;
      // Fase 6 (monturas)
      case 'saddle':
        this.g.audio.playBreak('wool', p);
        break;
      case 'tame':
        fx.spawnHearts(p[0], p[1], p[2], 7, 0.5);
        this.g.audio.playPickup();
        break;
      case 'mount_angry':
        fx.spawnSmoke(p[0], p[1], p[2], 8, 0.4, 0.3, 0.35, 0.6);
        break;
      case 'llama_spit': {
        // Escupitajo: una ráfaga de gotas claras desde la boca hacia el objetivo (a = rumbo, b = distancia).
        const yaw = a ?? 0, dist = Math.min(16, Math.max(1, b ?? 4));
        for (let d = 0.5; d < dist; d += 0.6) fx.spawnSmoke(p[0] - Math.sin(yaw) * d, p[1] - d * 0.06, p[2] - Math.cos(yaw) * d, 1, 0.05, 0.92, 0.12, 0.1);
        this.g.audio.playSplash(p, 0.15);
        break;
      }
      // Fase 6 (monstruos).
      case 'potion_break':
        // Poción arrojadiza de bruja que se rompe: cristal y una nube.
        this.g.audio.playBreak('glass', p);
        fx.spawnSparkles(p[0], p[1], p[2], 18, 1.2);
        fx.spawnSmoke(p[0], p[1], p[2], 14, 1.4, 0.75, 0.35, 0.6);
        break;
      case 'witch_drink':
        this.g.audio.playEat();
        fx.spawnSparkles(p[0], p[1], p[2], 8, 0.4);
        break;
      case 'mob_convert':
        // Un zombi ahogado se convierte en ahogado.
        this.g.audio.playSplash(p, 0.5);
        fx.spawnSmoke(p[0], p[1], p[2], 16, 0.6, 0.6, 0.4, 0.8);
        if (mk) this.g.audio.playMob(mk, 'hurt', p);
        break;
      case 'slime_jump':
        if (mk && Math.random() < 0.5) this.g.audio.playMob(mk, 'step', p);
        break;
      default:
        // Fase 6 (acuáticos, fauna)
        if (!aquaticFx(this.g, kind, p) && !illagerFx(this.g, kind, p, a) && !copperFx(this.g, kind, p)) faunaFx(this.g, kind, p, a); // Fase 6 (asaltos), 6.5 (cobre)
    }
  }


  /** Voces ocasionales y pasos de las criaturas cercanas (y llamas de las que arden). */
  mobSounds(dt: number): void {
    const p = this.g.player;
    const now = performance.now() / 1000;
    this.heartT -= dt;
    const hearts = this.heartT <= 0;
    if (hearts) this.heartT = 0.7;
    for (const e of this.g.ents.list.values()) {
      const def = MOBS[e.type];
      if (!def || e.deathT >= 0) continue;
      const d = Math.hypot(e.x - p.x, e.y - p.y, e.z - p.z);
      // Animales enamorados: corazones de vez en cuando.
      if (hearts && e.flags & EF_LOVE && d < 32) {
        this.g.renderer.entities.spawnHearts(e.x, e.y + def.height * (e.flags & EF_BABY ? 0.5 : 1) + 0.2, e.z, 1, 0.3);
      }
      if ((e.flags & EF_FIRE) && d < 48 && Math.random() < dt * 14) {
        const hw = def.width / 2;
        this.g.renderer.entities.spawnFlame(
          e.x + (Math.random() - 0.5) * hw * 2, e.y + Math.random() * def.height, e.z + (Math.random() - 0.5) * hw * 2,
        );
      }
      if (d > 24) continue;
      const kind = (def.sound ?? def.key) as MobSoundKind;
      const next = this.idleSounds.get(e.id);
      if (next === undefined) this.idleSounds.set(e.id, now + 2 + Math.random() * 8);
      else if (now >= next) {
        this.idleSounds.set(e.id, now + 5 + Math.random() * 9);
        this.playMob(kind, 'idle', e);
      }
      if (d < 12 && e.walkAmount > 0.3) {
        const phase = Math.floor(e.walkPhase / Math.PI);
        if (this.stepSounds.get(e.id) !== phase) {
          this.stepSounds.set(e.id, phase);
          this.playMob(kind, 'step', e);
        }
      }
    }
    if (this.idleSounds.size > 200) {
      for (const id of this.idleSounds.keys()) if (!this.g.ents.list.has(id)) {
        this.idleSounds.delete(id);
        this.stepSounds.delete(id);
      }
    }
  }

  playMob(kind: MobSoundKind, ev: MobSoundEvent, e: ClientEntity): void {
    this.g.audio.playMob(kind, ev, [e.x, e.y + 1, e.z]);
  }

  /** Cercanía de agua que fluye y de lava (para su sonido ambiente), hornos y fogatas encendidos. */
  updateFluidSound(): void {
    const world = this.g.world!;
    const p = this.g.player;
    let water = 0, lava = 0;
    let furnace: [number, number, number] | null = null;
    const fires: [number, number, number][] = [];
    const cx = Math.floor(p.x), cy = Math.floor(p.y), cz = Math.floor(p.z);
    for (let dy = -3; dy <= 3; dy++) {
      for (let dz = -6; dz <= 6; dz++) {
        for (let dx = -6; dx <= 6; dx++) {
          const b = world.getBlock(cx + dx, cy + dy, cz + dz);
          if (b <= 0) continue;
          if (isLitFurnace(b)) furnace = [cx + dx + 0.5, cy + dy + 0.5, cz + dz + 0.5];
          else if (b === CAMPFIRE + 1 && fires.length < 6) fires.push([cx + dx + 0.5, cy + dy, cz + dz + 0.5]);
          const f = BLOCK_FLUID[b];
          if (!f || ((dx | dz) & 1)) continue;
          const w = 1 / (1 + Math.hypot(dx, dy, dz) * 0.5);
          if (f === 2) lava += w;
          else if (BLOCK_FLUID_LEVEL[b] !== 0) water += w;
        }
      }
    }
    this.g.audio.setFluidProximity(Math.min(1, water / 4), Math.min(1, lava / 3));
    // Chisporroteo de un horno encendido cercano.
    if (furnace && Math.random() < 0.35) this.g.audio.playFurnace(furnace);
    // Fogatas: chisporroteo (el humo lo ponen las partículas del ambiente).
    for (const [x, y, z] of fires) {
      if (Math.random() < 0.3) this.g.audio.playFurnace([x, y + 0.5, z]);
    }
  }
}
