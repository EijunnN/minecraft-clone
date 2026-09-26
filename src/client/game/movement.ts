// El jugador propio en cada frame: mirar con el ratón, levantarse de la cama, los controles (agacharse y
// correr fijos, volar con doble salto en creativo), la física (o la montura, barca o vagoneta que lo
// lleva) y los sonidos de pasos, aterrizajes y chapuzones.
import { BLOCKS, DIRT, isFarmland } from '../../shared/blocks';
import { ITEMS } from '../../shared/items';
import { potionPhysics } from './potionClient';
import { effectsPhysics } from './effectsClient';
import type { Game } from './Game';

/** Lo que el resto del frame necesita saber del movimiento. */
export interface MoveResult {
  /** El jugador controla (ratón capturado, sin chat, vivo y despierto). */
  active: boolean;
  /** Distancia horizontal recorrida (0 montado: no gasta hambre). */
  moved: number;
  /** Estaba en el suelo antes de moverse. */
  wasGround: boolean;
}

export class Movement {
  /** Agacharse y correr fijos: una pulsación los activa y otra los quita. */
  sneakOn = false;
  sprintOn = false;
  private stepDist = 0;

  constructor(private g: Game) {}

  update(dt: number): MoveResult {
    const g = this.g;
    const world = g.world!;
    const { ui, input, player: p, survival: surv } = g;
    const settings = g.cfg.settings;

    // Cámara: el ratón gira la mirada (el catalejo la frena).
    if (input.locked && !surv.dead) {
      const sens = 0.0022 * settings.sensitivity * (g.interaction.use?.kind === 'spyglass' ? 0.2 : 1); // Fase 6.5: catalejo
      p.yaw -= input.dx * sens;
      p.pitch -= input.dy * sens * (settings.invertY ? -1 : 1);
      p.pitch = Math.max(-Math.PI / 2 + 0.001, Math.min(Math.PI / 2 - 0.001, p.pitch));
    }

    // Cama: la pantalla se oscurece; Mayús para levantarse.
    if (g.life.sleeping) {
      g.life.sleeping.t += dt;
      ui.setSleep(Math.min(0.9, g.life.sleeping.t / 5));
      if (input.locked && !ui.isChatOpen() && input.wasPressed(settings.keys.sneak)) g.life.leaveBed(true);
    }

    const active = input.locked && !ui.isChatOpen() && !surv.dead && !g.life.sleeping;
    const k = settings.keys;
    if (active && settings.toggleSneak && input.wasPressed(k.sneak)) this.sneakOn = !this.sneakOn;
    if (active && settings.toggleSprint && input.wasPressed(k.sprint)) this.sprintOn = !this.sprintOn;
    if (!settings.toggleSneak) this.sneakOn = false;
    if (!settings.toggleSprint) this.sprintOn = false;
    if (active && g.creative && input.wasDoubleTapped(k.jump)) {
      p.flying = !p.flying;
      if (p.flying) p.vy = 0;
    }
    if (!g.creative) p.flying = false;
    if (active && input.wasDoubleTapped(k.forward) && (g.creative || surv.canSprint())) p.sprinting = true;
    if (!g.creative && !surv.canSprint()) p.sprinting = false;
    // Usar un objeto frena mucho; los efectos Velocidad y Lentitud multiplican.
    p.usingItem = !!g.interaction.use;
    p.slow = (g.interaction.use ? 0.25 : 1) * g.statusEffects.speed;
    potionPhysics(g); // Fase 7 (pociones): Supersalto y Caída lenta
    effectsPhysics(g); // Fase 7 (efectos): Levitación, Gracia del delfín, Ceguera y Salud mejorada
    p.leatherBoots = ITEMS[g.inv.armor[3]?.id ?? 0]?.armor?.material === 'leather'; // Fase 6.5 (materiales): nieve polvo
    world.renderDistance = settings.render.renderDistance;
    const wasInWater = p.inWater;
    const wasGround = p.onGround;
    const ox = p.x, oz = p.z;
    const controls = {
      forward: active && input.isDown(k.forward),
      back: active && input.isDown(k.back),
      left: active && input.isDown(k.left),
      right: active && input.isDown(k.right),
      jump: active && (input.isDown(k.jump) || input.wasPressed(k.jump)),
      sneak: active && (settings.toggleSneak ? this.sneakOn : input.isDown(k.sneak)),
      sprint: active && (settings.toggleSprint ? this.sprintOn : input.isDown(k.sprint)) && (g.creative || surv.canSprint()),
    };
    // Fase 6 (monturas): montado se mueve la montura (o nada, si la lleva el servidor) y no el jugador.
    // Fase 7 (transporte): en barca o vagoneta tampoco (la mueve su sistema).
    g.vehicles.collidePlayer(dt); // Fase 7 (remate): barcas sólidas y vagonetas que apartan
    if (!g.riding.update(dt, controls, active) && !g.vehicles.update(dt, controls, active)) p.update(dt, controls, world);
    g.mechanisms.update(); // Fase 7 (mecanismos): los bloques que empujan los pistones apartan al jugador
    const moved = g.riding.active || g.vehicles.active ? 0 : Math.hypot(p.x - ox, p.z - oz);
    // Caer sobre tierra de cultivo la pisotea (más probable cuanto más alta la caída).
    if (p.justLanded && !p.flying && p.landedFall > 0.5 && Math.random() < p.landedFall - 0.5) {
      const bx = Math.floor(p.x), by = Math.floor(p.y - 0.05), bz = Math.floor(p.z);
      if (isFarmland(world.getBlock(bx, by, bz))) {
        world.setBlock(bx, by, bz, DIRT);
        g.net?.send({ t: 'trample', x: bx, y: by, z: bz });
      }
    }

    // Sonidos de pasos y aterrizaje.
    const below = world.getBlock(Math.floor(p.x), Math.floor(p.y - 0.2), Math.floor(p.z));
    const groundMat = below > 0 ? BLOCKS[below].sound : 'stone';
    if (p.onGround && !p.sneaking) {
      this.stepDist += p.walkAmount * dt * 4.3;
      if (this.stepDist > 1.8) {
        this.stepDist = 0;
        g.audio.playStep(groundMat, [p.x, p.y, p.z], p.sprinting ? 0.8 : 0.6);
      }
    }
    if (p.justLanded && p.landedSpeed < -7) g.audio.playLand(groundMat, [p.x, p.y, p.z], Math.min(1, (-p.landedSpeed - 7) / 15));
    if (p.inWater && !wasInWater && p.justEnteredWater) {
      g.audio.playSplash([p.x, p.y, p.z], Math.min(1, -p.vy / 10 + 0.3));
      // Chapuzón: salpicadura en la superficie y burbujas.
      g.renderer.entities.pfx.splash(p.x, p.y + 0.4, p.z, Math.min(24, 6 + Math.round(-p.vy * 1.5)));
      g.renderer.entities.pfx.bubbles(p.x, p.y, p.z, 6, 0.4);
    }
    return { active, moved, wasGround };
  }
}
