// Mensajes del servidor: otros jugadores, cambios de bloques, chat, tiempo, entidades, contenedores,
// modo de juego, camas y respuestas a las interacciones.
import { RemotePlayer } from './RemotePlayers';
import type { Welcome } from '../net/Net';
import { AIR, BLOCKS, BLOCK_FLUID, isValidBlockId, BLOCK_COLLIDE } from '../../shared/blocks';
import { containerFromWire } from '../../shared/containers';
import type { PlayerInfo, ServerMsg, GameMode } from '../../shared/protocol';
import { lighten } from './gameTypes';
import type { Game } from './Game';

export class ServerEvents {
  constructor(private g: Game) {}

  onServerMessage(msg: ServerMsg): void {
    switch (msg.t) {
      case 'join':
        this.addRemote(msg.p, true);
        break;
      case 'leave':
        this.removeRemote(msg.id);
        break;
      case 'pos':
        this.g.remote.get(msg.id)?.push(msg.p, msg.r, msg.s, msg.a);
        break;
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
          this.g.openScreen(c.kind === 'chest' ? 'chest' : 'furnace', pos);
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
      case 'ires':
        this.g.interaction.onInteractResult(msg);
        break;
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
