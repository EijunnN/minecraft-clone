// Vida del jugador: daño, muerte (suelta el inventario), reaparición (en la cama si la tiene) y
// dormir.
import { deathMessage } from './Survival';
import { isBed, BLOCK_OPAQUE, BLOCK_SOLID } from '../../shared/blocks';
import type { Game } from './Game';

export class LifeCycle {
  constructor(private g: Game) {}

  voidTimer = 0;
  suffocateTimer = 0;
  /** Durmiendo en una cama (t = segundos que lleva). */
  sleeping: { t: number } | null = null;
  /** Cama donde reaparece (pies). */
  bed: [number, number, number] | null = null;
  startSleeping(pos: [number, number, number], facing: number): void {
    const p = this.g.player;
    [p.x, p.y, p.z] = pos;
    // Mirando hacia la cabecera (0 N, 1 E, 2 S, 3 O).
    p.yaw = [0, -Math.PI / 2, Math.PI, Math.PI / 2][facing & 3];
    p.pitch = 0;
    p.vx = p.vy = p.vz = 0;
    p.kx = p.kz = 0;
    p.flying = false;
    this.g.interaction.mining = null;
    this.g.interaction.use = null;
    this.sleeping = { t: 0 };
    this.g.ui.setSleep(0);
    this.g.sendPos(true);
  }

  /** Levantarse de la cama (send: avisar al servidor). */
  leaveBed(send: boolean): void {
    if (!this.sleeping) return;
    this.sleeping = null;
    this.g.ui.setSleep(null);
    if (send) this.g.net?.send({ t: 'wake' });
    this.g.sendPos(true);
  }

  onHurt(amount: number, k: [number, number, number], cause: string): void {
    this.leaveBed(true);
    if (this.g.survival.dead || (this.g.creative && cause !== 'kill')) return;
    const dmg = this.g.survival.damage(amount, cause, cause === 'kill');
    if (dmg <= 0) return;
    if (Array.isArray(k) && k.every(Number.isFinite)) this.g.player.impulse(k[0], k[1], k[2]);
    this.hurtFeedback(dmg);
    if (this.g.survival.dead) this.die();
  }

  hurtFeedback(dmg: number): void {
    this.g.audio.playPlayerHurt(null);
    this.g.ui.flashHurt(dmg);
    this.g.shake = Math.min(1, 0.4 + dmg * 0.1);
  }

  die(): void {
    this.leaveBed(true);
    this.g.survival.dead = true;
    this.g.interaction.mining = null;
    this.g.interaction.use = null;
    // Cerrar antes las pantallas: lo que había en la cuadrícula de fabricación vuelve al inventario
    // y se suelta con todo lo demás.
    this.g.screen.close();
    if (this.g.ui.isInventoryOpen()) this.g.toggleInventory();
    if (!this.g.creative) {
      const items = this.g.inv.takeAll();
      const p = this.g.player;
      for (let i = 0; i < items.length; i += 16) {
        this.g.net?.send({ t: 'drop', items: items.slice(i, i + 16), p: [p.x, p.y + 0.5, p.z] });
      }
    }
    this.g.audio.playPlayerDeath();
    this.g.net?.send({ t: 'died', m: deathMessage(this.g.survival.deathCause) });
    this.showDeath();
    this.g.sendState(true);
    this.g.sendPos(true);
  }

  showDeath(): void {
    this.g.ui.showDeath(this.g.survival.deathCause ? `${this.g.cfg.name} ${deathMessage(this.g.survival.deathCause)}.` : 'Tu partida anterior terminó en muerte.');
    this.g.input.exitLock();
    this.g.input.releaseAll();
  }

  respawn(): void {
    this.g.survival.reset();
    const p = this.g.player;
    let sp: [number, number, number] = [this.g.spawn[0], this.g.spawn[1] + 0.1, this.g.spawn[2]];
    if (this.bed) {
      // En la cama si sigue ahí (si su chunk aún no está cargado, se confía en ella).
      const b = this.g.world ? this.g.world.getBlock(this.bed[0], this.bed[1], this.bed[2]) : -1;
      if (b < 0 || isBed(b)) sp = [this.bed[0] + 0.5, this.bed[1] + 0.5625, this.bed[2] + 0.5];
      else {
        this.bed = null;
        this.g.ui.toast('No tenías cama o estaba obstruida');
      }
    }
    [p.x, p.y, p.z] = sp;
    p.vx = p.vy = p.vz = 0;
    p.kx = p.kz = 0;
    p.fallDistance = 0;
    p.flying = false;
    if (this.g.world) p.unstuck(this.g.world);
    this.g.ui.hideDeath();
    this.g.input.requestLock();
    this.g.sendState(true);
    this.g.sendPos(true);
    this.g.refreshHotbar(true);
  }

  /**
   * Reglas de supervivencia de cada frame: daño por caída, agotamiento al correr, nadar y saltar,
   * vacío, asfixia dentro de bloques, lluvia, hambre y regeneración (Survival), y la muerte.
   */
  tickSurvival(dt: number, moved: number, wasGround: boolean, rain: number): void {
    const g = this.g;
    const p = g.player;
    const surv = g.survival;
    if (!g.creative && !surv.dead) {
      if (p.landedFall > 3 && !p.inWater) {
        const dmg = Math.ceil(p.landedFall - 3);
        if (surv.damage(dmg, 'fall') > 0) this.hurtFeedback(dmg);
      }
      if (p.sprinting) surv.addExhaustion(moved * 0.1);
      else if (p.inWater) surv.addExhaustion(moved * 0.01);
      if (wasGround && !p.onGround && p.vy > 5) surv.addExhaustion(p.sprinting ? 0.2 : 0.05);
      // Vacío y asfixia.
      if (p.y < -64) {
        this.voidTimer += dt;
        if (this.voidTimer >= 0.5) {
          this.voidTimer = 0;
          if (surv.damage(4, 'void', true) > 0) this.hurtFeedback(4);
        }
      }
      const headB = g.world!.getBlock(Math.floor(p.x), Math.floor(p.eyeY), Math.floor(p.z));
      if (headB > 0 && BLOCK_OPAQUE[headB] && BLOCK_SOLID[headB] && !p.flying) {
        this.suffocateTimer += dt;
        if (this.suffocateTimer >= 0.5) {
          this.suffocateTimer = 0;
          if (surv.damage(1, 'suffocate', true) > 0) this.hurtFeedback(1);
        }
      } else this.suffocateTimer = 0;
      const hpBefore = surv.health;
      const exposed = g.world!.getLight(Math.floor(p.x), Math.floor(p.eyeY), Math.floor(p.z)) >> 4 >= 15;
      surv.update(dt, { eyeInWater: p.eyeInWater, inLava: p.inLava, inWater: p.inWater, inRain: rain > 0.2 && exposed, difficulty: g.difficulty });
      if (surv.health < hpBefore) this.hurtFeedback(hpBefore - surv.health);
      if (surv.dead) this.die();
    } else if (g.creative && p.y < -64) {
      p.y = 200;
      p.vy = 0;
    }
  }
}
