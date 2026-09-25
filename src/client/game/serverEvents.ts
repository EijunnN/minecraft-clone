// Mensajes del servidor: otros jugadores, cambios de bloques, chat, tiempo, entidades, contenedores,
// modo de juego, camas y respuestas a las interacciones.
import { RemotePlayer } from './RemotePlayers';
import type { Welcome } from '../net/Net';
import { AIR, BLOCKS, BLOCK_FLUID, isValidBlockId, BLOCK_COLLIDE, furnaceVariant, isBarrel } from '../../shared/blocks';
import { containerFromWire } from '../../shared/containers';
import { ITEMS } from '../../shared/items';
import type { PlayerInfo, ServerMsg, GameMode } from '../../shared/protocol';
import { lighten } from './gameTypes';
import type { Game } from './Game';
import { EFFECT_INSTANT_DAMAGE } from '../../shared/effects'; // Fase 7 (pociones)

export class ServerEvents {
  constructor(private g: Game) {}

  onServerMessage(msg: ServerMsg): void {
    if (this.g.riding.onMessage(msg)) return; // Fase 6 (monturas): 'ride' y 'mfix'
    if (this.g.books.onMessage(msg)) return; // Fase 6.5 (libros y estandartes): 'banner' y 'lbook'
    switch (msg.t) {
      case 'join':
        this.addRemote(msg.p, true);
        break;
      case 'leave':
        this.removeRemote(msg.id);
        break;
      case 'pos': {
        const rp = this.g.remote.get(msg.id);
        rp?.push(msg.p, msg.r, msg.s, msg.a, msg.h, msg.o);
        if (rp) rp.effectColor = Number.isInteger(msg.ec) ? msg.ec! & 0xffffff : 0; // Fase 7 (pociones)
        break;
      }
      case 'set':
        this.applyRemoteSet(msg.id, msg.x, msg.y, msg.z, msg.b);
        break;
      case 'sets':
        this.applySets(msg.l);
        break;
      case 'chat':
        this.onChat(msg.id, msg.name, msg.m);
        break;
      case 'time':
        this.g.time = msg.time;
        break;
      case 'swing':
        this.g.remote.get(msg.id)?.swing();
        break;
      case 'error':
        this.g.ui.addChat(null, msg.m);
        this.g.ui.setMenuError(msg.m);
        break;
      case 'ents':
        this.g.ents.apply(msg, performance.now() / 1000);
        break;
      case 'hurt':
        this.g.life.onHurt(msg.a, msg.k, msg.c);
        break;
      case 'picked':
        this.g.interaction.onPicked(msg.s);
        break;
      case 'fx':
        this.g.effects.onFx(msg.k, msg.p, msg.a, msg.b);
        break;
      case 'cont': {
        const c = containerFromWire(msg.c);
        if (!c) break;
        const pos: [number, number, number] = [msg.x, msg.y, msg.z];
        const same = (a: [number, number, number] | null) => !!a && a[0] === pos[0] && a[1] === pos[1] && a[2] === pos[2];
        if (same(this.g.interaction.pendingOpen)) {
          this.g.interaction.pendingOpen = null;
          const variant = furnaceVariant(this.g.world?.getBlock(pos[0], pos[1], pos[2]) ?? 0);
          // Fase 6 (aldeanos): el barril se abre como un cofre con su propio título.
          const barrel = isBarrel(this.g.world?.getBlock(pos[0], pos[1], pos[2]) ?? 0);
          this.g.openScreen(c.kind === 'chest' ? 'chest' : 'furnace', pos, barrel ? 'Barril' : c.kind === 'chest' ? '' : ['Horno', 'Ahumador', 'Alto horno'][Math.max(0, variant)]);
          this.g.audio.playUi('open');
        }
        if (this.g.screen.isOpen() && same(this.g.screen.containerPos)) this.g.screen.setContainer(c);
        break;
      }
      case 'cres':
      case 'cclose':
        this.g.screen.onServer(msg);
        if (msg.t === 'cclose' && !this.g.screen.isOpen()) this.g.afterScreenClosed();
        break;
      // Fase 6 (aldeanos): comercio.
      case 'trades':
      case 'tres':
      case 'tclose':
        this.g.trading.onServer(msg);
        break;
      case 'gm':
        this.setMode(msg.m);
        break;
      case 'diff':
        this.g.difficulty = msg.d;
        break;
      case 'sleep':
        if (msg.ok && msg.p) this.g.life.startSleeping(msg.p, Number(msg.f) || 0);
        else if (msg.m) this.g.ui.toast(msg.m);
        break;
      case 'wake':
        this.g.life.leaveBed(false);
        break;
      case 'spawn':
        this.g.life.bed = Array.isArray(msg.p) && msg.p.length === 3 && msg.p.every(Number.isInteger) ? msg.p : null;
        break;
      case 'effect':
        // Del comando /efecto (id 0 = quitarlos todos). Fase 7 (pociones): también de las pociones (en
        // creativo, sin el daño instantáneo).
        if (this.g.creative && msg.id === EFFECT_INSTANT_DAMAGE) break;
        if (msg.id === 0) this.g.statusEffects.clear(this.g.survival);
        else if (Number(msg.s) < 0) this.g.statusEffects.remove(Number(msg.id), this.g.survival); // Fase 6: quitar uno
        else this.g.statusEffects.add(Number(msg.id), Number(msg.s), Number(msg.a), this.g.survival);
        break;
      // Fase 6 (asaltos): barra del asalto cercano.
      case 'raid':
        this.g.raid = msg.s ? { s: msg.s, w: msg.w, n: msg.n, h: msg.h, r: msg.r } : null;
        break;
      case 'ires':
        this.g.interaction.onInteractResult(msg);
        break;
      case 'sign':
        if ([msg.x, msg.y, msg.z].every(Number.isInteger)) this.g.signs.set(msg.x, msg.y, msg.z, msg.l);
        break;
      case 'rod': {
        // Flotador lanzado o recogido; al dueño le llega además el desgaste de la caña.
        if (typeof msg.p !== 'string') break;
        if (Number.isInteger(msg.e) && msg.e > 0) this.g.bobbers.set(msg.p, msg.e);
        else this.g.bobbers.delete(msg.p);
        const w = Number(msg.w);
        if (msg.p === this.g.net?.id && w > 0 && !this.g.creative && ITEMS[this.g.heldId]?.tool?.kind === 'fishing_rod') {
          this.g.interaction.wearHeld(Math.min(2, w));
        }
        break;
      }
      case 'xp': {
        const n = Number(msg.n);
        if (!Number.isInteger(n) || n <= 0) break;
        this.g.audio.playXpOrb();
        if (this.g.xp.add(n)) this.g.audio.playLevelUp();
        break;
      }
    }
  }

  addRemote(p: PlayerInfo, announce: boolean): void {
    if (p.id === this.g.net?.id) return;
    const rp = new RemotePlayer(p);
    this.g.remote.set(p.id, rp);
    if (announce) {
      this.g.ui.addChat(null, `${p.name} se unió al mundo.`);
      this.g.audio.playUi('join');
    }
  }

  removeRemote(id: string): void {
    if (!this.g.remote.delete(id)) return;
    this.g.audio.playUi('leave');
  }

  applyRemoteSet(id: string, x: number, y: number, z: number, b: number): void {
    const world = this.g.world;
    if (!world || !isValidBlockId(b)) return;
    const old = world.getBlock(x, y, z);
    // El servidor reenvía también nuestras ediciones: su orden es el que vale para todos.
    world.setBlock(x, y, z, b);
    if (BLOCK_COLLIDE[b] === 1 && this.g.player.intersectsBlock(x, y, z)) this.g.player.unstuck(world);
    if (id === this.g.net?.id || old === b) return;
    this.g.remote.get(id)?.swing();
    const pos: [number, number, number] = [x + 0.5, y + 0.5, z + 0.5];
    if (b === AIR && old > 0) {
      if (!BLOCK_FLUID[old]) {
        this.g.audio.playBreak(BLOCKS[old].sound, pos);
        this.g.renderer.entities.spawnBreak(x, y, z, old, world.getLight(x, y, z));
      }
    } else if (b !== AIR && !BLOCK_FLUID[b]) {
      this.g.audio.playPlace(BLOCKS[b].sound, pos);
    }
  }

  /** Cambios de la simulación (fluidos, arena, hojas, explosiones, hornos...). */
  applySets(l: number[]): void {
    const world = this.g.world;
    if (!world || !Array.isArray(l)) return;
    for (let i = 0; i + 3 < l.length; i += 4) {
      const x = l[i], y = l[i + 1], z = l[i + 2], b = l[i + 3];
      if (!isValidBlockId(b)) continue;
      world.setBlock(x, y, z, b);
      if (BLOCK_COLLIDE[b] === 1 && this.g.player.intersectsBlock(x, y, z)) this.g.player.unstuck(world);
      const m = this.g.interaction.mining;
      if (m && m.x === x && m.y === y && m.z === z) this.g.interaction.mining = null;
    }
  }

  onReconnectWelcome(w: Welcome): void {
    const world = this.g.world;
    this.g.time = w.time;
    this.g.remote.clear();
    this.g.ents.clear();
    for (const p of w.players) this.addRemote(p, false);
    this.g.mode = w.mode;
    this.g.difficulty = w.diff;
    if (!world) return;
    world.resetEdits(w.edits);
    this.g.screen.close();
    this.g.sendState(true);
  }

  onChat(id: string | null, name: string, m: string): void {
    const color = id ? this.g.remote.get(id)?.shirt ?? '#9fd8ff' : undefined;
    this.g.ui.addChat(id === null ? null : name, m, color ? lighten(color) : undefined);
    if (id !== null) this.g.audio.playUi('chat');
  }

  setMode(m: GameMode): void {
    if (m === this.g.mode) return;
    this.g.mode = m;
    if (m === 's') this.g.player.flying = false;
    this.g.interaction.mining = null;
    if (this.g.ui.isInventoryOpen()) this.g.toggleInventory();
    this.g.ui.toast(m === 's' ? 'Modo supervivencia' : 'Modo creativo');
    this.g.refreshHotbar(true);
  }
}
