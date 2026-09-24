// Bucle principal del juego: une mundo, jugador, red, renderizado, audio e interfaz, y aplica las
// reglas de supervivencia (vida, hambre, minado, combate, comida, arco, cubos, inventario).
import { Renderer, type FrameState } from '../render/Renderer';
import { World } from '../world/World';
import { Player } from './Player';
import { Input } from './Input';
import { raycast, type RayHit } from './raycast';
import { RemotePlayer } from './RemotePlayers';
import { Net, type Welcome, type NetEvents } from '../net/Net';
import { LocalServer } from '../net/LocalServer';
import { UI } from '../ui/UI';
import { InventoryScreen } from '../ui/InventoryScreen';
import type { Settings } from './settings';
import type { GeneratedTextures } from '../textures/generateTextures';
import { AudioEngine } from '../audio/AudioEngine';
import type { MobSoundKind, MobSoundEvent } from '../audio/types';
import { Inventory, HOTBAR } from './Inventory';
import { Survival, deathMessage } from './Survival';
import { ClientEntities, type ClientEntity } from './ClientEntities';
import { breakTime } from './mining';
import {
  AIR, BLOCKS, BLOCK_RENDER, BLOCK_SOLID, BLOCK_OPAQUE, BLOCK_REPLACEABLE, BLOCK_FLUID, BLOCK_FLUID_LEVEL, BLOCK_HARDNESS,
  DEFAULT_HOTBAR, WATER, LAVA, CACTUS, SUGAR_CANE, R_CROSS, R_TORCH, BEDROCK, CRAFTING_TABLE, GRASS, DIRT, SNOWY_GRASS, SAND,
  OAK_SAPLING, BIRCH_SAPLING, SPRUCE_SAPLING, FURNACE_LIT, isValidBlockId, isContainer, orientedFor,
} from '../../shared/blocks';
import { ITEMS, ARROW, BUCKET, WATER_BUCKET, LAVA_BUCKET, maxStack, isValidItem, type ItemStack } from '../../shared/items';
import { MOBS, ENT_ITEM, ENT_ARROW, MOB_ENDERMAN } from '../../shared/mobs';
import { containerFromWire } from '../../shared/containers';
import { CHUNK_SIZE, DAY_LENGTH_SECONDS, SEA_LEVEL } from '../../shared/constants';
import {
  STATE_FLY, STATE_SNEAK, STATE_SWIM, STATE_DEAD, EF_PICKABLE, EF_FIRE, worldTimeAt, type PlayerInfo, type WorldTime,
  type ServerMsg, type GameMode, type PlayerSave,
} from '../../shared/protocol';
import { rainAt } from '../../shared/weather';
import { TerrainGenerator, BIOME_NAMES } from '../../shared/world/terrain';
import type { RemotePlayerView } from '../render/EntityRenderer';

export interface GameConfig {
  room: string;
  name: string;
  shirt: string;
  mode: GameMode;
  offline: boolean;
  canvas: HTMLCanvasElement;
  ui: UI;
  audio: AudioEngine;
  textures: GeneratedTextures;
  settings: Settings;
  renderer: Renderer;
}

const REACH_CREATIVE = 5.5;
const REACH_SURVIVAL = 4.6;
const ATTACK_REACH = 3.4;
const SOIL = new Set([GRASS, DIRT, SNOWY_GRASS]);
const SAPLINGS = new Set([OAK_SAPLING, BIRCH_SAPLING, SPRUCE_SAPLING]);

function srgbToLin(v: number): number {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

interface Mining {
  x: number;
  y: number;
  z: number;
  id: number;
  progress: number;
  hitT: number;
}

interface Use {
  kind: 'eat' | 'bow';
  t: number;
  slot: number;
  item: number;
  soundT: number;
}

export class Game {
  private cfg: GameConfig;
  private renderer: Renderer;
  private ui: UI;
  private audio: AudioEngine;
  private input: Input;
  private world: World | null = null;
  private player = new Player();
  private net: Net | null = null;
  private local: LocalServer | null = null;
  private offline = false;
  private remote = new Map<string, RemotePlayer>();
  private selected = 0;
  private time: WorldTime = { base: 0.08, at: Date.now(), rate: 1 / DAY_LENGTH_SECONDS };
  private running = false;
  private raf = 0;
  private lastFrame = 0;
  private hit: RayHit | null = null;
  private placeCooldown = 0;
  private breakDelay = 0;
  private swingT = -1;
  private equipT = 0;
  private lastSent = 0;
  private lastSentKey = '';
  private debug = false;
  private hudHidden = false;
  private thirdPerson = 0;
  private eyeSky = 1;
  private fovCurrent = 75;
  private stepDist = 0;
  private fps = 0;
  private fpsAcc = 0;
  private fpsFrames = 0;
  private playing = false;
  private lastTabDown = false;
  private statusText: string | null = null;
  private tmpGrass = [0, 0, 0];
  private onQuitCb: (() => void) | null = null;

  // --- Supervivencia ---
  private mode: GameMode = 's';
  private difficulty = 2;
  private inv = new Inventory();
  private survival = new Survival();
  private ents = new ClientEntities();
  private screen: InventoryScreen;
  private spawn: [number, number, number] = [0.5, 100, 0.5];
  private mining: Mining | null = null;
  private use: Use | null = null;
  private pickupAsk = new Map<number, number>();
  private lookTimer = 0;
  private stateTimer = 0;
  private stateKey = '';
  private voidTimer = 0;
  private suffocateTimer = 0;
  private hotbarKey = '';
  private idleSounds = new Map<number, number>();
  private stepSounds = new Map<number, number>();
  private fluidTimer = 0;
  private shake = 0;
  private pendingOpen: [number, number, number] | null = null;

  constructor(cfg: GameConfig) {
    this.cfg = cfg;
    this.renderer = cfg.renderer;
    this.ui = cfg.ui;
    this.audio = cfg.audio;
    this.input = new Input(cfg.canvas);
    this.input.onLockChange = (locked) => this.onLockChange(locked);
    this.screen = new InventoryScreen({
      icons: this.ui.icons,
      send: (m) => this.net?.send(m),
      drop: (s) => this.throwStack(s, false),
      sound: (k) => (k === 'craft' ? this.audio.playCraft() : this.audio.playUi('click')),
    }, this.inv);
    this.ents.playerPos = (id) => {
      if (id === this.net?.id) return [this.player.x, this.player.y, this.player.z];
      const rp = this.remote.get(id);
      return rp ? [rp.view.x, rp.view.y, rp.view.z] : null;
    };
    this.bindUi();
  }

  onQuit(cb: () => void): void {
    this.onQuitCb = cb;
  }

  private get creative(): boolean {
    return this.mode === 'c';
  }

  private get heldStack(): ItemStack | null {
    return this.inv.slots[this.selected] ?? null;
  }

  private get heldId(): number {
    return this.heldStack?.id ?? 0;
  }

  // ------------------------------------------------------------------ arranque

  async start(): Promise<void> {
    const { ui } = this;
    ui.showLoading(this.cfg.offline ? 'Preparando el mundo local…' : 'Conectando con el servidor…', 0.05);
    let welcome: Welcome | null = null;
    const events: NetEvents = {
      onWelcome: (w, reconnect) => {
        if (reconnect) this.onReconnectWelcome(w);
        else welcome = w;
      },
      onMessage: (m) => this.onServerMessage(m),
      onStatus: (st) => {
        this.statusText = st === 'reconnecting' ? 'Conexión perdida · reconectando…' : st === 'closed' && this.playing && !this.offline ? 'Desconectado del servidor' : null;
        ui.setStatus(this.statusText);
        if (st === 'connected' && this.playing) ui.addChat(null, 'Reconectado al servidor.');
      },
    };
    if (!this.cfg.offline) {
      this.net = new Net(Net.websocketFactory(this.cfg.room), this.cfg.name, this.cfg.shirt, this.cfg.mode, events);
      try {
        await this.net.connect();
      } catch (e) {
        console.warn('Sin servidor, modo un jugador:', e);
        this.net.close();
        this.net = null;
      }
    }
    if (!this.net) {
      this.offline = true;
      ui.showLoading('Preparando el mundo local…', 0.08);
      this.local = new LocalServer(this.cfg.room, hashSeed(this.cfg.room));
      this.net = new Net(this.local.factory, this.cfg.name, this.cfg.shirt, this.cfg.mode, events, true);
      await this.net.connect(30000);
    }
    const w = welcome as Welcome | null;
    if (!w) throw new Error('El servidor no envió la bienvenida.');
    this.time = w.time;
    for (const p of w.players) this.addRemote(p, false);
    this.mode = w.mode;
    this.difficulty = w.diff;
    if (Array.isArray(w.spawn) && w.spawn.every(Number.isFinite)) this.spawn = w.spawn;
    const cores = navigator.hardwareConcurrency || 4;
    this.world = new World(w.seed, this.renderer.terrain, Math.max(2, Math.min(6, cores - 1)));
    this.world.renderDistance = this.cfg.settings.render.renderDistance;
    this.world.loadEdits(w.edits);

    // Estado guardado del jugador o aparición nueva.
    ui.showLoading('Buscando un buen lugar para aparecer…', 0.1);
    this.restore(w.save);

    // Carga inicial alrededor del jugador.
    const needR = 2;
    await new Promise<void>((resolve) => {
      const tick = () => {
        const world = this.world!;
        world.update(this.player.x, this.player.z, this.player.yaw, 0.016);
        const pcx = Math.floor(this.player.x / CHUNK_SIZE), pcz = Math.floor(this.player.z / CHUNK_SIZE);
        let ready = 0, total = 0;
        for (let dz = -needR; dz <= needR; dz++) {
          for (let dx = -needR; dx <= needR; dx++) {
            total++;
            if (world.isReady(pcx + dx, pcz + dz)) ready++;
          }
        }
        ui.showLoading(this.offline ? 'Generando el mundo (modo un jugador)…' : 'Generando el mundo…', 0.15 + 0.85 * (ready / total));
        if (ready >= total) resolve();
        else setTimeout(tick, 30);
      };
      tick();
    });
    this.player.unstuck(this.world);
    ui.hideLoading();
    ui.showHud();
    this.refreshHotbar(true);
    ui.addChat(null, this.offline
      ? 'Modo un jugador: el mundo se guarda en este navegador. Escribe /ayuda para ver los comandos.'
      : `Bienvenido a «${this.cfg.room}». E: inventario · T: chat · /ayuda: comandos. Comparte el enlace para jugar con amigos.`);
    ui.addChat(null, this.creative ? 'Modo creativo: vuela con doble espacio y rompe al instante.' : 'Modo supervivencia: consigue madera, fabrica herramientas y sobrevive a la noche.');
    this.playing = true;
    this.running = true;
    this.renderer.resetTemporal();
    this.lastFrame = performance.now();
    this.input.requestLock();
    setTimeout(() => {
      if (this.playing && !this.input.locked && !this.anyScreenOpen()) {
        this.ui.showPause('Haz clic en «Volver al juego» para capturar el ratón y empezar a jugar.');
      }
    }, 400);
    this.cfg.canvas.addEventListener('mousedown', this.onCanvasClick);
    window.addEventListener('beforeunload', this.onUnload);
    this.raf = requestAnimationFrame(this.frame);
    if (this.survival.dead) this.showDeath();
  }

  /** Aplica el estado guardado por el servidor (o prepara una aparición nueva). */
  private restore(save: PlayerSave | null): void {
    const p = this.player;
    if (save) {
      this.inv.fromWire(save.inv);
      this.survival.reset();
      this.survival.health = Math.max(0, Math.min(20, save.hp));
      this.survival.food = Math.max(0, Math.min(20, save.food));
      this.survival.saturation = Math.max(0, Math.min(20, save.sat));
      this.survival.air = save.air ?? 15;
      this.survival.dead = !!save.dead || this.survival.health <= 0;
      if (this.survival.dead) this.survival.deathCause = '';
      this.selected = Math.max(0, Math.min(8, save.sel ?? 0));
      if (save.pos && save.pos.every(Number.isFinite)) {
        [p.x, p.y, p.z] = save.pos;
        if (save.rot) [p.yaw, p.pitch] = save.rot;
        p.flying = !!save.fly && this.creative;
        return;
      }
    } else if (this.creative) {
      DEFAULT_HOTBAR.forEach((id, i) => (this.inv.slots[i] = { id, count: maxStack(id) }));
      this.inv.changed();
    }
    [p.x, p.y, p.z] = [this.spawn[0], this.spawn[1] + 0.1, this.spawn[2]];
    p.yaw = Math.PI * 0.75;
  }

  private onCanvasClick = () => {
    if (!this.playing || this.input.locked || this.anyScreenOpen()) return;
    this.ui.hidePause();
    this.input.requestLock();
  };

  private onUnload = () => {
    this.sendState(true);
  };

  private anyScreenOpen(): boolean {
    return this.ui.isChatOpen() || this.ui.isInventoryOpen() || this.ui.isSettingsOpen() || this.screen.isOpen() || this.ui.isDeathOpen();
  }

  stop(): void {
    this.sendState(true);
    this.screen.close();
    this.running = false;
    this.playing = false;
    cancelAnimationFrame(this.raf);
    this.cfg.canvas.removeEventListener('mousedown', this.onCanvasClick);
    window.removeEventListener('beforeunload', this.onUnload);
    const local = this.local;
    const net = this.net;
    // Cerrar después de que salga el último estado (y de que el servidor local guarde).
    setTimeout(() => {
      net?.close();
      if (local) void local.flush().then(() => local.dispose());
    }, 150);
    this.world?.dispose();
    this.input.exitLock();
    this.input.dispose();
    this.ui.updateNameTags([]);
    this.ui.hideDeath();
    this.ui.setSurvival(false, 20, 20, 15, false);
    this.audio.setHeartbeat(0);
    this.audio.setFluidProximity(0, 0);
    this.remote.clear();
    this.ents.clear();
  }

  // ------------------------------------------------------------------ red

  private onServerMessage(msg: ServerMsg): void {
    switch (msg.t) {
      case 'join':
        this.addRemote(msg.p, true);
        break;
      case 'leave':
        this.removeRemote(msg.id);
        break;
      case 'pos':
        this.remote.get(msg.id)?.push(msg.p, msg.r, msg.s);
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
        this.time = msg.time;
        break;
      case 'swing':
        this.remote.get(msg.id)?.swing();
        break;
      case 'error':
        this.ui.addChat(null, msg.m);
        this.ui.setMenuError(msg.m);
        break;
      case 'ents':
        this.ents.apply(msg, performance.now() / 1000);
        break;
      case 'hurt':
        this.onHurt(msg.a, msg.k, msg.c);
        break;
      case 'picked':
        this.onPicked(msg.s);
        break;
      case 'fx':
        this.onFx(msg.k, msg.p, msg.a, msg.b);
        break;
      case 'cont': {
        const c = containerFromWire(msg.c);
        if (!c) break;
        const pos: [number, number, number] = [msg.x, msg.y, msg.z];
        const same = (a: [number, number, number] | null) => !!a && a[0] === pos[0] && a[1] === pos[1] && a[2] === pos[2];
        if (same(this.pendingOpen)) {
          this.pendingOpen = null;
          this.openScreen(c.kind === 'chest' ? 'chest' : 'furnace', pos);
          this.audio.playUi('open');
        }
        if (this.screen.isOpen() && same(this.screen.containerPos)) this.screen.setContainer(c);
        break;
      }
      case 'cres':
      case 'cclose':
        this.screen.onServer(msg);
        if (msg.t === 'cclose' && !this.screen.isOpen()) this.afterScreenClosed();
        break;
      case 'gm':
        this.setMode(msg.m);
        break;
      case 'diff':
        this.difficulty = msg.d;
        break;
    }
  }

  private addRemote(p: PlayerInfo, announce: boolean): void {
    if (p.id === this.net?.id) return;
    const rp = new RemotePlayer(p);
    this.remote.set(p.id, rp);
    if (announce) {
      this.ui.addChat(null, `${p.name} se unió al mundo.`);
      this.audio.playUi('join');
    }
  }

  private removeRemote(id: string): void {
    if (!this.remote.delete(id)) return;
    this.audio.playUi('leave');
  }

  private applyRemoteSet(id: string, x: number, y: number, z: number, b: number): void {
    const world = this.world;
    if (!world || !isValidBlockId(b)) return;
    const old = world.getBlock(x, y, z);
    // El servidor reenvía también nuestras ediciones: su orden es el que vale para todos.
    world.setBlock(x, y, z, b);
    if (BLOCK_SOLID[b] && this.player.intersectsBlock(x, y, z)) this.player.unstuck(world);
    if (id === this.net?.id || old === b) return;
    this.remote.get(id)?.swing();
    const pos: [number, number, number] = [x + 0.5, y + 0.5, z + 0.5];
    if (b === AIR && old > 0) {
      if (!BLOCK_FLUID[old]) {
        this.audio.playBreak(BLOCKS[old].sound, pos);
        this.renderer.entities.spawnBreak(x, y, z, old, world.getLight(x, y, z));
      }
    } else if (b !== AIR && !BLOCK_FLUID[b]) {
      this.audio.playPlace(BLOCKS[b].sound, pos);
    }
  }

  /** Cambios de la simulación (fluidos, arena, hojas, explosiones, hornos...). */
  private applySets(l: number[]): void {
    const world = this.world;
    if (!world || !Array.isArray(l)) return;
    for (let i = 0; i + 3 < l.length; i += 4) {
      const x = l[i], y = l[i + 1], z = l[i + 2], b = l[i + 3];
      if (!isValidBlockId(b)) continue;
      world.setBlock(x, y, z, b);
      if (BLOCK_SOLID[b] && this.player.intersectsBlock(x, y, z)) this.player.unstuck(world);
      const m = this.mining;
      if (m && m.x === x && m.y === y && m.z === z) this.mining = null;
    }
  }

  private onReconnectWelcome(w: Welcome): void {
    const world = this.world;
    this.time = w.time;
    this.remote.clear();
    this.ents.clear();
    for (const p of w.players) this.addRemote(p, false);
    this.mode = w.mode;
    this.difficulty = w.diff;
    if (!world) return;
    world.resetEdits(w.edits);
    this.screen.close();
    this.sendState(true);
  }

  private onChat(id: string | null, name: string, m: string): void {
    const color = id ? this.remote.get(id)?.shirt ?? '#9fd8ff' : undefined;
    this.ui.addChat(id === null ? null : name, m, color ? lighten(color) : undefined);
    if (id !== null) this.audio.playUi('chat');
  }

  private sendChat(text: string): void {
    if (text.startsWith('/tp ')) {
      const target = text.slice(4).trim().toLowerCase();
      for (const rp of this.remote.values()) {
        if (rp.name.toLowerCase() === target) {
          this.player.x = rp.view.x;
          this.player.y = rp.view.y + 0.1;
          this.player.z = rp.view.z;
          this.player.fallDistance = 0;
          this.ui.addChat(null, `Teletransportado a ${rp.name}.`);
          return;
        }
      }
      this.ui.addChat(null, `No hay ningún jugador llamado «${text.slice(4).trim()}».`);
      return;
    }
    if (!text.startsWith('/')) this.ui.addChat(this.cfg.name, text, lighten(this.cfg.shirt));
    this.net?.send({ t: 'chat', m: text });
  }

  private setMode(m: GameMode): void {
    if (m === this.mode) return;
    this.mode = m;
    if (m === 's') this.player.flying = false;
    this.mining = null;
    if (this.ui.isInventoryOpen()) this.toggleInventory();
    this.ui.toast(m === 's' ? 'Modo supervivencia' : 'Modo creativo');
    this.refreshHotbar(true);
  }

  // ------------------------------------------------------------------ daño, muerte y objetos

  private onHurt(amount: number, k: [number, number, number], cause: string): void {
    if (this.survival.dead || (this.creative && cause !== 'kill')) return;
    const dmg = this.survival.damage(amount, cause, cause === 'kill');
    if (dmg <= 0) return;
    if (Array.isArray(k) && k.every(Number.isFinite)) this.player.impulse(k[0], k[1], k[2]);
    this.hurtFeedback(dmg);
    if (this.survival.dead) this.die();
  }

  private hurtFeedback(dmg: number): void {
    this.audio.playPlayerHurt(null);
    this.ui.flashHurt(dmg);
    this.shake = Math.min(1, 0.4 + dmg * 0.1);
  }

  private die(): void {
    this.survival.dead = true;
    this.mining = null;
    this.use = null;
    // Cerrar antes las pantallas: lo que había en la cuadrícula de fabricación vuelve al inventario
    // y se suelta con todo lo demás.
    this.screen.close();
    if (this.ui.isInventoryOpen()) this.toggleInventory();
    if (!this.creative) {
      const items = this.inv.takeAll();
      const p = this.player;
      for (let i = 0; i < items.length; i += 16) {
        this.net?.send({ t: 'drop', items: items.slice(i, i + 16), p: [p.x, p.y + 0.5, p.z] });
      }
    }
    this.audio.playPlayerDeath();
    this.net?.send({ t: 'died', m: deathMessage(this.survival.deathCause) });
    this.showDeath();
    this.sendState(true);
    this.sendPos(true);
  }

  private showDeath(): void {
    this.ui.showDeath(this.survival.deathCause ? `${this.cfg.name} ${deathMessage(this.survival.deathCause)}.` : 'Tu partida anterior terminó en muerte.');
    this.input.exitLock();
    this.input.releaseAll();
  }

  private respawn(): void {
    this.survival.reset();
    const p = this.player;
    [p.x, p.y, p.z] = [this.spawn[0], this.spawn[1] + 0.1, this.spawn[2]];
    p.vx = p.vy = p.vz = 0;
    p.kx = p.kz = 0;
    p.fallDistance = 0;
    p.flying = false;
    if (this.world) p.unstuck(this.world);
    this.ui.hideDeath();
    this.input.requestLock();
    this.sendState(true);
    this.sendPos(true);
    this.refreshHotbar(true);
  }

  private onPicked(s: ItemStack): void {
    if (!s || !isValidItem(s.id)) return;
    const rest = this.inv.add({ id: s.id, count: Math.max(1, Math.min(64, s.count | 0)), dmg: s.dmg });
    if (rest) this.throwStack(rest, false);
    this.audio.playPickup();
  }

  /** Tira una pila al suelo hacia donde mira el jugador (Q o fuera de la ventana del inventario). */
  private throwStack(s: ItemStack, strong: boolean): void {
    const p = this.player;
    const cp = Math.cos(p.pitch);
    const d = [-Math.sin(p.yaw) * cp, Math.sin(p.pitch), -Math.cos(p.yaw) * cp];
    const k = strong ? 4.5 : 3;
    const pos: [number, number, number] = [p.x + d[0] * 0.4, p.eyeY - 0.3, p.z + d[2] * 0.4];
    const v: [number, number, number] = [d[0] * k + p.vx * 0.5, d[1] * k + 1.8, d[2] * k + p.vz * 0.5];
    this.net?.send({ t: 'drop', items: [s], p: pos, v });
  }

  private onFx(kind: string, p: [number, number, number], a?: number, b?: number): void {
    if (!Array.isArray(p) || !p.every(Number.isFinite)) return;
    void b;
    const mob = a !== undefined ? MOBS[a] : undefined;
    const mk = mob?.key as MobSoundKind | undefined;
    const fx = this.renderer.entities;
    switch (kind) {
      case 'mob_hurt':
        if (mk) this.audio.playMob(mk, 'hurt', p);
        break;
      case 'mob_death':
        if (mk) this.audio.playMob(mk, 'death', p);
        fx.spawnSmoke(p[0], p[1], p[2], 14, 0.45, 0.85, 0.3, 0.8);
        break;
      case 'mob_attack':
        if (mk) this.audio.playMob(mk, 'attack', p);
        break;
      case 'mob_shoot':
        if (mk) this.audio.playMob(mk, 'shoot', p);
        break;
      case 'creeper_fuse':
        this.audio.playMob('creeper', 'fuse', p);
        break;
      case 'teleport':
        this.audio.playMob('enderman', 'teleport', p);
        fx.spawnSmoke(p[0], p[1], p[2], 16, 0.6, 0.15, 0.18, 0.4);
        break;
      case 'enderman_scream':
        this.audio.playMob('enderman', 'attack', p);
        break;
      case 'arrow_hit':
        this.audio.playArrowHit(p);
        break;
      case 'bow':
        this.audio.playBowShoot(p, a ?? 1);
        break;
      case 'explode': {
        const power = a ?? 3;
        this.audio.playExplosion(p, power);
        fx.spawnSmoke(p[0], p[1], p[2], 50, power * 0.7, 0.8, 0.9, 2.2);
        fx.spawnSmoke(p[0], p[1], p[2], 12, power * 0.4, 0.97, 0.7, 3);
        const d = Math.hypot(p[0] - this.player.x, p[1] - this.player.y, p[2] - this.player.z);
        this.shake = Math.max(this.shake, Math.max(0, 1 - d / 24));
        break;
      }
      case 'burn_item':
        fx.spawnSmoke(p[0], p[1], p[2], 6, 0.2, 0.25, 0.2, 1);
        break;
      case 'leaves':
        if (a !== undefined && isValidBlockId(a)) fx.spawnBreak(Math.floor(p[0]), Math.floor(p[1]), Math.floor(p[2]), a, 0xf0);
        break;
    }
  }

  // ------------------------------------------------------------------ UI

  private bindUi(): void {
    const ui = this.ui;
    ui.onResume = () => {
      ui.hidePause();
      this.input.requestLock();
    };
    ui.onQuit = () => {
      this.stop();
      this.onQuitCb?.();
    };
    ui.onRespawn = () => this.respawn();
    ui.onChatSubmit = (t) => this.sendChat(t);
    ui.onChatClosed = () => {
      this.input.gameKeys = true;
      this.input.requestLock();
    };
    ui.onInventoryPick = (id, slot) => {
      const s = slot ?? this.selected;
      this.inv.set(s, { id, count: maxStack(id) });
      this.refreshHotbar(true);
      this.equipT = 1;
    };
    ui.onInventorySelectSlot = (slot) => {
      this.selected = slot;
      this.refreshHotbar(true);
    };
    ui.getInviteLink = () => `${location.origin}/?mundo=${encodeURIComponent(this.cfg.room)}`;
    ui.onCloseInventory = () => {
      if (ui.isInventoryOpen()) this.toggleInventory();
    };
  }

  private onLockChange(locked: boolean): void {
    if (!this.playing) return;
    if (locked) {
      this.ui.hidePause();
      return;
    }
    if (!this.anyScreenOpen()) {
      const n = this.remote.size + 1;
      this.ui.showPause(this.offline ? 'Modo un jugador' : `Mundo «${this.cfg.room}» · ${n} jugador${n === 1 ? '' : 'es'} conectado${n === 1 ? '' : 's'}`);
    }
  }

  /** E: inventario (creativo: selector de bloques; supervivencia: inventario con fabricación). */
  private toggleInventory(): void {
    const ui = this.ui;
    if (this.screen.isOpen()) {
      this.screen.close();
      this.afterScreenClosed();
      return;
    }
    if (ui.isInventoryOpen()) {
      ui.hideInventory();
      this.audio.playUi('close');
      this.input.gameKeys = true;
      this.input.requestLock();
      return;
    }
    if (this.creative) {
      ui.showInventory();
    } else {
      this.openScreen('player', null);
    }
    this.audio.playUi('open');
    this.input.gameKeys = false;
    this.input.releaseAll();
    this.input.exitLock();
  }

  private openScreen(kind: 'player' | 'table' | 'chest' | 'furnace', pos: [number, number, number] | null): void {
    this.mining = null;
    this.use = null;
    this.screen.open(kind, pos);
    this.input.gameKeys = false;
    this.input.releaseAll();
    this.input.exitLock();
  }

  private afterScreenClosed(): void {
    this.audio.playUi('close');
    this.input.gameKeys = true;
    this.refreshHotbar(true);
    this.sendState(false);
    if (!this.survival.dead) this.input.requestLock();
  }

  private refreshHotbar(force = false): void {
    const key = `${this.inv.version}|${this.selected}`;
    if (!force && key === this.hotbarKey) return;
    this.hotbarKey = key;
    this.ui.setHotbar(this.inv.slots.slice(0, HOTBAR), this.selected);
  }

  // ------------------------------------------------------------------ persistencia

  private sendState(force: boolean): void {
    if (!this.net || !this.playing) return;
    const p = this.player, s = this.survival;
    const key = `${this.inv.version}|${s.version}|${Math.round(p.x)}|${Math.round(p.y)}|${Math.round(p.z)}|${this.selected}|${s.dead}`;
    if (!force && key === this.stateKey) return;
    this.stateKey = key;
    this.net.send({
      t: 'state',
      d: {
        inv: this.inv.toWire(), hp: s.health, food: s.food, sat: Math.round(s.saturation * 10) / 10, air: Math.round(s.air),
        pos: [p.x, p.y, p.z], rot: [p.yaw, p.pitch], fly: p.flying, sel: this.selected, dead: s.dead,
      },
    });
  }

  private sendPos(force: boolean): void {
    const p = this.player;
    const s = (p.sneaking ? STATE_SNEAK : 0) | (p.flying ? STATE_FLY : 0) | (p.inWater ? STATE_SWIM : 0) | (this.survival.dead ? STATE_DEAD : 0);
    const q = (v: number, step: number) => Math.round(v / step);
    const key = `${q(p.x, 0.05)},${q(p.y, 0.05)},${q(p.z, 0.05)},${q(p.yaw, 0.03)},${q(p.pitch, 0.03)},${s},${this.heldId}`;
    if (!force && key === this.lastSentKey) return;
    this.net?.send({ t: 'pos', p: [p.x, p.y, p.z], r: [p.yaw, p.pitch], s, h: this.heldId });
    this.lastSentKey = key;
  }

  // ------------------------------------------------------------------ bucle

  private frame = (now: number) => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    try {
      this.update(dt);
    } catch (e) {
      console.error(e);
    }
    this.input.endFrame();
  };

  private update(dt: number): void {
    const world = this.world!;
    const ui = this.ui;
    const input = this.input;
    const settings = this.cfg.settings;
    const p = this.player;
    const surv = this.survival;
    const nowS = performance.now() / 1000;

    // FPS
    this.fpsAcc += dt;
    this.fpsFrames++;
    if (this.fpsAcc >= 0.5) {
      this.fps = this.fpsFrames / this.fpsAcc;
      this.fpsAcc = 0;
      this.fpsFrames = 0;
    }

    // --- Teclas de interfaz ---
    if (!ui.isChatOpen() && !surv.dead) {
      if (input.wasPressed('KeyE') && !ui.isSettingsOpen() && !ui.isPauseOpen()) this.toggleInventory();
      else if (input.wasPressed('Escape') && (ui.isInventoryOpen() || this.screen.isOpen())) this.toggleInventory();
      if (input.locked && !this.anyScreenOpen()) {
        if (input.wasPressed('KeyT') || input.wasPressed('Enter')) this.openChat('');
        else if (input.wasPressed('Slash')) this.openChat('/');
        if (input.wasPressed('F1')) {
          this.hudHidden = !this.hudHidden;
          ui.setHudVisible(!this.hudHidden);
        }
        if (input.wasPressed('F3')) this.debug = !this.debug;
        if (input.wasPressed('F5')) this.thirdPerson = (this.thirdPerson + 1) % 3;
        for (let i = 0; i < 9; i++) {
          if (input.wasPressed('Digit' + (i + 1))) this.selectSlot(i);
        }
        if (input.wheel !== 0) this.selectSlot((this.selected + (input.wheel > 0 ? 1 : -1) + 9) % 9);
        if (input.wasPressed('KeyQ')) this.dropHeld(input.wasPressedWithCtrl('KeyQ') || input.isDown('ControlLeft') || input.isDown('ControlRight'));
      }
    }
    const tabDown = input.isDown('Tab') && input.locked;
    if (tabDown) {
      const list = [{ name: this.cfg.name, color: this.cfg.shirt, me: true }];
      for (const rp of this.remote.values()) list.push({ name: rp.name, color: rp.shirt, me: false });
      ui.showPlayerList(list, this.cfg.room, this.net?.latency ?? null);
    } else if (this.lastTabDown) ui.hidePlayerList();
    this.lastTabDown = tabDown;
    this.screen.expirePending();
    if (this.screen.isOpen()) this.screen.render();

    // --- Cámara ---
    if (input.locked && !surv.dead) {
      const sens = 0.0022 * settings.sensitivity;
      p.yaw -= input.dx * sens;
      p.pitch -= input.dy * sens * (settings.invertY ? -1 : 1);
      p.pitch = Math.max(-Math.PI / 2 + 0.001, Math.min(Math.PI / 2 - 0.001, p.pitch));
    }

    // --- Movimiento ---
    const active = input.locked && !ui.isChatOpen() && !surv.dead;
    if (active && this.creative && input.wasDoubleTapped('Space')) {
      p.flying = !p.flying;
      if (p.flying) p.vy = 0;
    }
    if (!this.creative) p.flying = false;
    if (active && input.wasDoubleTapped('KeyW') && (this.creative || surv.canSprint())) p.sprinting = true;
    if (!this.creative && !surv.canSprint()) p.sprinting = false;
    p.slow = this.use ? 0.25 : 1;
    world.renderDistance = settings.render.renderDistance;
    const wasInWater = p.inWater;
    const wasGround = p.onGround;
    const ox = p.x, oz = p.z;
    p.update(dt, {
      forward: active && input.isDown('KeyW'),
      back: active && input.isDown('KeyS'),
      left: active && input.isDown('KeyA'),
      right: active && input.isDown('KeyD'),
      jump: active && (input.isDown('Space') || input.wasPressed('Space')),
      sneak: active && (input.isDown('ShiftLeft') || input.isDown('ShiftRight')),
      sprint: active && (input.isDown('ControlLeft') || input.isDown('ControlRight')) && (this.creative || surv.canSprint()),
    }, world);
    const moved = Math.hypot(p.x - ox, p.z - oz);

    // Sonidos de pasos y aterrizaje.
    const below = world.getBlock(Math.floor(p.x), Math.floor(p.y - 0.2), Math.floor(p.z));
    const groundMat = below > 0 ? BLOCKS[below].sound : 'stone';
    if (p.onGround && !p.sneaking) {
      this.stepDist += p.walkAmount * dt * 4.3;
      if (this.stepDist > 1.8) {
        this.stepDist = 0;
        this.audio.playStep(groundMat, [p.x, p.y, p.z], p.sprinting ? 0.8 : 0.6);
      }
    }
    if (p.justLanded && p.landedSpeed < -7) this.audio.playLand(groundMat, [p.x, p.y, p.z], Math.min(1, (-p.landedSpeed - 7) / 15));
    if (p.inWater && !wasInWater && p.justEnteredWater) this.audio.playSplash([p.x, p.y, p.z], Math.min(1, -p.vy / 10 + 0.3));

    // --- Supervivencia ---
    const worldTime = worldTimeAt(this.time, Date.now() + (this.net?.serverOffset ?? 0));
    const rain = this.weatherAt(worldTime);
    if (!this.creative && !surv.dead) {
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
      const headB = world.getBlock(Math.floor(p.x), Math.floor(p.eyeY), Math.floor(p.z));
      if (headB > 0 && BLOCK_OPAQUE[headB] && BLOCK_SOLID[headB] && !p.flying) {
        this.suffocateTimer += dt;
        if (this.suffocateTimer >= 0.5) {
          this.suffocateTimer = 0;
          if (surv.damage(1, 'suffocate', true) > 0) this.hurtFeedback(1);
        }
      } else this.suffocateTimer = 0;
      const hpBefore = surv.health;
      const exposed = world.getLight(Math.floor(p.x), Math.floor(p.eyeY), Math.floor(p.z)) >> 4 >= 15;
      surv.update(dt, { eyeInWater: p.eyeInWater, inLava: p.inLava, inWater: p.inWater, inRain: rain > 0.2 && exposed, difficulty: this.difficulty });
      if (surv.health < hpBefore) this.hurtFeedback(hpBefore - surv.health);
      if (surv.dead) this.die();
    } else if (this.creative && p.y < -64) {
      p.y = 200;
      p.vy = 0;
    }
    this.audio.setHeartbeat(!this.creative && !surv.dead && surv.health <= 6 ? (7 - surv.health) / 6 : 0);

    // --- Interacción ---
    const eyeX = p.x, eyeY = p.eyeY, eyeZ = p.z;
    const cp = Math.cos(p.pitch);
    const dir = [-Math.sin(p.yaw) * cp, Math.sin(p.pitch), -Math.cos(p.yaw) * cp];
    const reach = this.creative ? REACH_CREATIVE : REACH_SURVIVAL;
    this.hit = surv.dead ? null : raycast(eyeX, eyeY, eyeZ, dir[0], dir[1], dir[2], reach, (x, y, z) => world.getBlock(x, y, z));
    const entHit = surv.dead ? null : this.ents.raycast(eyeX, eyeY, eyeZ, dir[0], dir[1], dir[2], this.creative ? 5 : ATTACK_REACH);
    const target = entHit && (!this.hit || entHit.dist < this.hit.dist) ? entHit.e : null;
    this.placeCooldown -= dt;
    this.breakDelay -= dt;
    if (active) this.interact(dt, target, dir);
    else {
      this.mining = null;
      if (this.use?.kind === 'bow') this.releaseBow(dir);
      this.use = null;
    }

    // --- Mundo, jugadores, entidades y partículas ---
    world.update(p.x, p.z, p.yaw, dt);
    this.ents.update(dt, nowS);
    this.autoPickup(nowS);
    this.lookTimer -= dt;
    if (this.lookTimer <= 0 && !surv.dead) {
      this.lookTimer = 0.3;
      this.checkEndermanLook(eyeX, eyeY, eyeZ, dir);
    }
    this.mobSounds(dt);
    const views: RemotePlayerView[] = [];
    const tags: { id: string; name: string; pos: [number, number] | null }[] = [];
    for (const rp of this.remote.values()) {
      rp.update(dt);
      if (rp.state & STATE_DEAD) continue;
      const v = rp.view;
      const l = world.getLight(Math.floor(v.x), Math.floor(v.y + 0.5), Math.floor(v.z));
      v.light = [(l >> 4) / 15, (l & 15) / 15];
      views.push(v);
    }
    this.renderer.entities.updateParticles(dt, (x, y, z) => {
      const b = world.getBlock(x, y, z);
      return b < 0 || BLOCK_SOLID[b] === 1;
    });

    // --- Red: posición a ~8 Hz y sólo si cambia (ahorra peticiones) ---
    this.lastSent += dt;
    if (this.net && this.lastSent > 0.125) {
      this.sendPos(false);
      this.lastSent = 0;
    }
    this.stateTimer += dt;
    if (this.stateTimer > 10) {
      this.stateTimer = 0;
      this.sendState(false);
    }
    this.refreshHotbar();
    ui.setSurvival(!this.creative && !surv.dead, surv.health, surv.food, surv.air, surv.hurtTime < 0.3);

    // --- Horizonte lejano ---
    this.farTimer -= dt;
    if (this.farTimer <= 0 || Math.hypot(p.x - this.farPos[0], p.z - this.farPos[1]) > 48) this.updateFarOcean();

    // --- Tiempo y clima ---
    const day = Math.floor(worldTime);
    const dayTime = worldTime - day;
    const sunHeight = Math.sin(dayTime * Math.PI * 2);
    const baseCoverage = 0.27 + 0.1 * Math.sin(worldTime * 2.3 + 1.3) + 0.06 * Math.sin(worldTime * 5.9 + 0.4);
    const coverage = baseCoverage + (0.86 - baseCoverage) * Math.min(1, rain * 1.5);
    const dawn = Math.exp(-Math.pow(((dayTime + 0.5) % 1) - 0.5, 2) / 0.0035);
    const mist = 0.0022 + 0.011 * dawn + (sunHeight < 0 ? 0.002 : 0) + rain * 0.006;
    const climate = world.generator.columnInfo(Math.floor(p.x), Math.floor(p.z));
    const snow = climate.temp < -0.5 || climate.height > 150;
    this.rainMapTimer -= dt;
    if (rain > 0.01 && this.rainMapTimer <= 0) this.updateRainMap();

    // --- Luz en el ojo y exposición al cielo ---
    const le = world.getLight(Math.floor(eyeX), Math.floor(eyeY), Math.floor(eyeZ));
    const skyAtEye = (le >> 4) / 15;
    this.eyeSky += (skyAtEye - this.eyeSky) * (1 - Math.exp(-dt * 1.5));
    const underwater = p.eyeInWater;

    // --- Cámara (primera/tercera persona) ---
    let camX = eyeX, camY = eyeY, camZ = eyeZ;
    let yaw = p.yaw, pitch = p.pitch;
    if (surv.dead) camY = p.y + 0.3;
    if (settings.viewBobbing && this.thirdPerson === 0) {
      const ph = p.walkDistance * Math.PI * 0.62;
      camY += -Math.abs(Math.cos(ph)) * 0.06 * p.walkAmount;
      camX += Math.cos(p.yaw) * Math.sin(ph) * 0.035 * p.walkAmount;
      camZ += -Math.sin(p.yaw) * Math.sin(ph) * 0.035 * p.walkAmount;
    }
    // Sacudida al recibir daño o por una explosión cercana.
    if (this.shake > 0) {
      const t = performance.now() / 1000;
      pitch += Math.sin(t * 41) * 0.03 * this.shake;
      yaw += Math.sin(t * 33 + 1) * 0.03 * this.shake;
      this.shake = Math.max(0, this.shake - dt * 2.5);
    }
    if (this.thirdPerson > 0) {
      const back = this.thirdPerson === 1 ? 1 : -1;
      const want = 4;
      const hit = raycast(eyeX, eyeY, eyeZ, -dir[0] * back, -dir[1] * back, -dir[2] * back, want, (x, y, z) => {
        const b = world.getBlock(x, y, z);
        return b > 0 && BLOCK_SOLID[b] ? b : AIR;
      });
      const d = hit ? Math.max(0.3, hit.dist - 0.25) : want;
      camX = eyeX - dir[0] * back * d;
      camY = eyeY - dir[1] * back * d;
      camZ = eyeZ - dir[2] * back * d;
      if (back < 0) {
        yaw += Math.PI;
        pitch = -pitch;
      }
      views.push({
        id: '__self', name: this.cfg.name, shirt: this.cfg.shirt, x: p.x, y: p.y, z: p.z,
        bodyYaw: p.yaw, headYaw: p.yaw, pitch: p.pitch, walkPhase: p.walkDistance * 2.2, walkAmount: p.walkAmount,
        swing: this.swingT >= 0 ? this.swingT : 0, sneaking: p.sneaking, light: [skyAtEye, (le & 15) / 15],
      });
    }

    // FOV dinámico al correr/volar y al tensar el arco.
    const baseFov = settings.render.fov;
    const bowZoom = this.use?.kind === 'bow' ? 1 - Math.min(1, this.use.t) * 0.15 : 1;
    const targetFov = baseFov * (p.sprinting ? 1.12 : 1) * (p.flying && p.sprinting ? 1.05 : 1) * bowZoom;
    this.fovCurrent += (targetFov - this.fovCurrent) * (1 - Math.exp(-dt * 8));
    // Resolución dinámica: si el rendimiento cae de forma sostenida, bajar la escala interna.
    if (settings.render.renderScale !== this.lastUserScale) {
      this.lastUserScale = settings.render.renderScale;
      this.autoScale = 1;
      this.slowTime = 0;
    }
    if (this.playing && document.visibilityState === 'visible') {
      this.slowTime = dt > 1 / 33 ? this.slowTime + dt : Math.max(0, this.slowTime - dt * 0.5);
      if (this.slowTime > 3 && settings.render.renderScale * this.autoScale > 0.55) {
        this.autoScale = Math.max(0.5 / settings.render.renderScale, this.autoScale - 0.12);
        this.slowTime = 0;
        ui.toast('Resolución reducida automáticamente para mantener la fluidez');
      }
    }
    this.renderer.settings = { ...settings.render, fov: this.fovCurrent, renderScale: settings.render.renderScale * this.autoScale };

    // Animaciones de la mano.
    if (this.swingT >= 0) {
      this.swingT += dt / 0.28;
      if (this.swingT >= 1) this.swingT = this.mining ? 0 : -1;
    }
    this.equipT = Math.max(0, this.equipT - dt / 0.18);
    const bobPh = p.walkDistance * Math.PI * 0.62;
    const gen = world.generator;
    const inf = gen.columnInfo(Math.floor(p.x), Math.floor(p.z));
    TerrainGenerator.grassColor(inf.temp, inf.humid, this.tmpGrass);

    // Entidades a dibujar.
    const mobs: ClientEntity[] = [];
    const drops: ClientEntity[] = [];
    for (const e of this.ents.list.values()) {
      if (MOBS[e.type]) mobs.push(e);
      else drops.push(e);
    }
    const m = this.mining;
    let crack: FrameState['crack'] = null;
    if (m && m.progress > 0) crack = { x: m.x, y: m.y, z: m.z, stage: Math.min(9, Math.floor(m.progress * 10)) };

    this.renderer.entities.lightDir = this.renderer.sunDir[1] >= 0 ? this.renderer.sunDir : this.renderer.sunDir.map((v) => -v);
    const use = this.use;
    const state: FrameState = {
      camX, camY, camZ, yaw, pitch,
      time: performance.now() / 1000,
      dt,
      dayTime,
      day,
      underwater,
      eyeSkyExposure: this.eyeSky,
      rain,
      snow,
      cloudCoverage: (window as unknown as { __cloudCov?: number }).__cloudCov ?? Math.max(0.1, Math.min(0.9, coverage)),
      mist,
      selection: this.hit && !this.hudHidden && !target ? { x: this.hit.x, y: this.hit.y, z: this.hit.z, box: this.hit.box } : null,
      heldItem: surv.dead ? 0 : this.heldId,
      handUse: use ? (use.kind === 'bow' ? Math.min(1, use.t) : use.t / 1.6) : 0,
      handUseKind: use ? use.kind : 'none',
      crack,
      mobs,
      drops,
      lightAt: (x, y, z) => world.getLight(x, y, z),
      handSwing: this.swingT >= 0 ? this.swingT : 0,
      handBob: settings.viewBobbing ? [Math.sin(bobPh) * 0.018 * p.walkAmount, -Math.abs(Math.cos(bobPh)) * 0.022 * p.walkAmount] : [0, 0],
      handEquip: this.equipT,
      lightAtEye: [skyAtEye, (le & 15) / 15],
      grassTint: [srgbToLin(this.tmpGrass[0]), srgbToLin(this.tmpGrass[1]), srgbToLin(this.tmpGrass[2])],
      players: views,
      showHand: this.thirdPerson === 0 && !this.hudHidden,
    };
    this.renderer.render(state);

    // Etiquetas de nombre.
    for (const rp of this.remote.values()) {
      const v = rp.view;
      const d = Math.hypot(v.x - camX, v.y - camY, v.z - camZ);
      const visible = d < 72 && !this.hudHidden && !(rp.state & STATE_DEAD);
      tags.push({ id: rp.id, name: rp.name, pos: visible ? this.renderer.project(v.x, v.y + (v.sneaking ? 1.85 : 2.1), v.z) : null });
    }
    ui.updateNameTags(tags);
    this.renderer.entities.prune(new Set(views.map((v) => v.id)));

    // Audio.
    const fwd: [number, number, number] = [dir[0], dir[1], dir[2]];
    this.audio.setListener([camX, camY, camZ], fwd, [0, 1, 0]);
    let waterNear = 0;
    if (p.y < SEA_LEVEL + 6) {
      for (const [ox2, oz2] of [[4, 0], [-4, 0], [0, 4], [0, -4], [0, 0]]) {
        if (world.getBlock(Math.floor(p.x + ox2), SEA_LEVEL - 1, Math.floor(p.z + oz2)) === WATER) waterNear += 0.2;
      }
    }
    this.fluidTimer -= dt;
    if (this.fluidTimer <= 0) {
      this.fluidTimer = 0.5;
      this.updateFluidSound();
    }
    this.audio.update(dt, {
      sunHeight,
      skyExposure: this.eyeSky,
      underwater,
      waterProximity: waterNear,
      altitude: camY,
      rain: snow ? 0 : rain * Math.min(1, this.eyeSky * 1.3),
    });

    // Depuración.
    if (this.debug) {
      const biome = BIOME_NAMES[gen.biomeAt(Math.floor(p.x), Math.floor(p.z))];
      const hours = Math.floor(((dayTime * 24 + 6) % 24));
      const mins = Math.floor(((dayTime * 24 * 60) % 60));
      const r = this.renderer;
      ui.setDebug(
        `VoxelCraft · ${this.fps.toFixed(0)} FPS\n` +
        `XYZ: ${p.x.toFixed(2)} / ${p.y.toFixed(2)} / ${p.z.toFixed(2)}\n` +
        `Chunk: ${Math.floor(p.x / 16)}, ${Math.floor(p.z / 16)} · Bioma: ${biome}\n` +
        `Hora: ${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')} · Día ${day + 1}\n` +
        `Luz: cielo ${le >> 4} · bloque ${le & 15}\n` +
        `Chunks: ${world.meshedCount} mallados · ${r.stats.drawCalls} draws · ${(r.stats.quads / 1000).toFixed(0)}k caras\n` +
        `Entidades: ${mobs.length} criaturas · ${drops.length} objetos\n` +
        `Modo: ${this.creative ? 'creativo' : 'supervivencia'} · ${this.offline ? 'sin conexión' : `ping ${Math.round(this.net?.latency ?? 0)} ms · ${this.remote.size + 1} jugadores`}\n` +
        (this.hit ? `Mirando: ${BLOCKS[this.hit.id].name} (${this.hit.x}, ${this.hit.y}, ${this.hit.z})\n` : '') +
        (target ? `Criatura: ${MOBS[target.type].name}\n` : '') +
        `GPU: ${r.caps.renderer}`,
      );
    } else ui.setDebug(null);
  }

  // ------------------------------------------------------------------ interacción

  private interact(dt: number, target: ClientEntity | null, dir: number[]): void {
    const input = this.input;
    const hit = this.hit;
    // --- Botón izquierdo: atacar o minar ---
    if (target) {
      this.mining = null;
      if (input.mousePressed[0]) this.attack(target);
    } else if (hit && input.mouseDown[0]) {
      if (this.creative) {
        if (input.mousePressed[0] || this.breakDelay <= 0) {
          this.breakBlock(hit);
          this.breakDelay = 0.25;
        }
      } else this.mineStep(dt, hit, input.mousePressed[0]);
    } else {
      this.mining = null;
      if (input.mousePressed[0]) this.swing(true);
    }

    // --- Botón derecho: usar, colocar, abrir ---
    const held = this.heldStack;
    const def = held ? ITEMS[held.id] : undefined;
    if (this.use) {
      const u = this.use;
      if (!input.mouseDown[2] || this.selected !== u.slot || this.heldId !== u.item) {
        if (u.kind === 'bow') this.releaseBow(dir);
        this.use = null;
      } else {
        u.t += dt;
        if (u.kind === 'eat') {
          u.soundT -= dt;
          if (u.soundT <= 0) {
            u.soundT = 0.22;
            this.audio.playEat();
          }
          if (u.t >= 1.6) this.finishEating();
        }
      }
      return;
    }
    const pressed = input.mousePressed[2];
    if (!pressed && !(input.mouseDown[2] && this.placeCooldown <= 0)) return;
    this.placeCooldown = 0.2;
    // Abrir contenedores y la mesa de trabajo (agachado se coloca encima).
    if (pressed && hit && !this.player.sneaking) {
      if (isContainer(hit.id)) {
        this.pendingOpen = [hit.x, hit.y, hit.z];
        this.net?.send({ t: 'open', x: hit.x, y: hit.y, z: hit.z });
        this.swing(true);
        return;
      }
      if (hit.id === CRAFTING_TABLE) {
        this.openScreen('table', null);
        this.audio.playUi('open');
        return;
      }
    }
    if (!held || !def) return;
    if (def.food) {
      if (pressed && (this.survival.food < 20 || this.creative)) this.use = { kind: 'eat', t: 0, slot: this.selected, item: held.id, soundT: 0.3 };
      return;
    }
    if (def.tool?.kind === 'bow') {
      if (pressed && (this.creative || this.inv.count(ARROW) > 0)) this.use = { kind: 'bow', t: 0, slot: this.selected, item: held.id, soundT: 0 };
      return;
    }
    if (held.id === BUCKET) {
      if (pressed) this.fillBucket(dir);
      return;
    }
    if (held.id === WATER_BUCKET || held.id === LAVA_BUCKET) {
      if (pressed && hit) this.emptyBucket(hit, held.id === WATER_BUCKET ? WATER : LAVA);
      return;
    }
    if (def.block !== undefined && hit) this.placeBlock(hit, def.block);
  }

  private mineStep(dt: number, hit: RayHit, pressed: boolean): void {
    const m = this.mining;
    if (!m || m.x !== hit.x || m.y !== hit.y || m.z !== hit.z || m.id !== hit.id) {
      if (this.breakDelay > 0 && !pressed) return;
      this.mining = { x: hit.x, y: hit.y, z: hit.z, id: hit.id, progress: 0, hitT: 0 };
    }
    const cur = this.mining!;
    const p = this.player;
    const t = breakTime(hit.id, this.heldId, p.eyeInWater, p.onGround || p.inWater);
    if (this.swingT < 0) this.swingT = 0;
    if (t === Infinity) return;
    if (t === 0) {
      if (pressed || this.breakDelay <= 0) {
        this.breakBlock(hit);
        this.breakDelay = 0.25;
      }
      this.mining = null;
      return;
    }
    cur.progress += dt / t;
    cur.hitT -= dt;
    if (cur.hitT <= 0) {
      cur.hitT = 0.25;
      this.audio.playBlockHit(BLOCKS[hit.id].sound, [hit.x + 0.5, hit.y + 0.5, hit.z + 0.5]);
    }
    if (cur.progress >= 1) {
      this.breakBlock(hit);
      this.mining = null;
      this.breakDelay = 0.3;
    }
  }

  private breakBlock(hit: RayHit): void {
    const world = this.world!;
    const { x, y, z, id } = hit;
    this.swing(false);
    if (id === BEDROCK || BLOCK_HARDNESS[id] < 0) return;
    world.setBlock(x, y, z, AIR);
    this.net?.sendSet(x, y, z, AIR, this.heldId);
    this.audio.playBreak(BLOCKS[id].sound, [x + 0.5, y + 0.5, z + 0.5]);
    this.renderer.entities.spawnBreak(x, y, z, id, world.getLight(x, y + 1, z));
    if (!this.creative) {
      this.survival.addExhaustion(0.005);
      const tool = ITEMS[this.heldId]?.tool;
      if (tool && tool.kind !== 'bow' && BLOCK_HARDNESS[id] > 0) this.wearHeld(tool.kind === 'sword' ? 2 : 1);
    }
  }

  private wearHeld(amount: number): void {
    if (this.creative) return;
    if (this.inv.wear(this.selected, amount)) {
      this.audio.playBreak('stone', [this.player.x, this.player.eyeY, this.player.z]);
      this.ui.toast('¡Se rompió la herramienta!');
    }
  }

  private attack(e: ClientEntity): void {
    const p = this.player;
    const crit = !p.onGround && p.vy < -1 && !p.inWater && !p.flying;
    this.net?.send({ t: 'attack', e: e.id, item: this.heldId, crit });
    this.swing(false);
    this.net?.send({ t: 'swing' });
    if (crit) this.renderer.entities.spawnCrit(e.x, e.y + 1, e.z, 10);
    if (!this.creative) {
      this.survival.addExhaustion(0.1);
      const tool = ITEMS[this.heldId]?.tool;
      if (tool && tool.kind !== 'bow') this.wearHeld(tool.kind === 'sword' ? 1 : 2);
    }
  }

  private finishEating(): void {
    const u = this.use!;
    const food = ITEMS[u.item]?.food;
    this.use = null;
    if (!food) return;
    this.survival.eat(food.hunger, food.saturation);
    this.audio.playBurp();
    if (!this.creative) this.inv.consume(this.selected, 1);
  }

  private releaseBow(dir: number[]): void {
    const u = this.use;
    this.use = null;
    if (!u || u.kind !== 'bow') return;
    // Potencia como en Minecraft: f = (t² + 2t) / 3 con t en segundos (máx. 1).
    const t = Math.min(1, u.t);
    const f = Math.min(1, (t * t + 2 * t) / 3);
    if (f < 0.1) return;
    if (!this.creative) {
      if (this.inv.remove(ARROW, 1) < 1) return;
      this.wearHeld(1);
    }
    const p = this.player;
    this.net?.send({ t: 'shoot', p: [p.x + dir[0] * 0.3, p.eyeY - 0.1, p.z + dir[2] * 0.3], d: [dir[0], dir[1], dir[2]], f });
    this.swing(false);
  }

  private fillBucket(dir: number[]): void {
    const world = this.world!;
    const p = this.player;
    const hit = raycast(p.x, p.eyeY, p.z, dir[0], dir[1], dir[2], this.creative ? REACH_CREATIVE : REACH_SURVIVAL, (x, y, z) => world.getBlock(x, y, z), true);
    if (!hit || !BLOCK_FLUID[hit.id] || BLOCK_FLUID_LEVEL[hit.id] !== 0) return;
    const filled = BLOCK_FLUID[hit.id] === 1 ? WATER_BUCKET : LAVA_BUCKET;
    world.setBlock(hit.x, hit.y, hit.z, AIR);
    this.net?.sendSet(hit.x, hit.y, hit.z, AIR, BUCKET);
    this.audio.playSplash([hit.x + 0.5, hit.y + 0.5, hit.z + 0.5], 0.5);
    this.swing(false);
    if (this.creative) return;
    const s = this.heldStack!;
    if (s.count <= 1) this.inv.set(this.selected, { id: filled, count: 1 });
    else {
      this.inv.consume(this.selected, 1);
      const rest = this.inv.add({ id: filled, count: 1 });
      if (rest) this.throwStack(rest, true);
    }
  }

  private emptyBucket(hit: RayHit, fluid: number): void {
    const world = this.world!;
    let x = hit.x + hit.nx, y = hit.y + hit.ny, z = hit.z + hit.nz;
    if (BLOCK_REPLACEABLE[hit.id] && !BLOCK_FLUID[hit.id]) [x, y, z] = [hit.x, hit.y, hit.z];
    const cur = world.getBlock(x, y, z);
    if (cur < 0 || !BLOCK_REPLACEABLE[cur]) return;
    world.setBlock(x, y, z, fluid);
    this.net?.sendSet(x, y, z, fluid);
    this.audio.playSplash([x + 0.5, y + 0.5, z + 0.5], 0.4);
    this.swing(false);
    if (!this.creative) this.inv.set(this.selected, { id: BUCKET, count: 1 });
  }

  private placeBlock(hit: RayHit, base: number): void {
    const world = this.world!;
    // Colocar en la celda vecina (o sustituir hierba/flores sustituibles).
    let x = hit.x + hit.nx, y = hit.y + hit.ny, z = hit.z + hit.nz;
    if (BLOCK_REPLACEABLE[hit.id] && !BLOCK_FLUID[hit.id]) {
      x = hit.x;
      y = hit.y;
      z = hit.z;
    }
    if (y < 1 || y > 255) return;
    const cur = world.getBlock(x, y, z);
    if (cur < 0 || !BLOCK_REPLACEABLE[cur]) return;
    const id = orientedFor(base, this.player.yaw);
    if (BLOCK_SOLID[id]) {
      if (this.player.intersectsBlock(x, y, z)) return;
      for (const rp of this.remote.values()) {
        const v = rp.view;
        if (v.x + 0.3 > x && v.x - 0.3 < x + 1 && v.y + 1.8 > y && v.y < y + 1 && v.z + 0.3 > z && v.z - 0.3 < z + 1) return;
      }
      for (const e of this.ents.list.values()) {
        const def = MOBS[e.type];
        if (!def || e.deathT >= 0) continue;
        const hw = def.width / 2;
        if (e.x + hw > x && e.x - hw < x + 1 && e.y + def.height > y && e.y < y + 1 && e.z + hw > z && e.z - hw < z + 1) return;
      }
    }
    // Plantas, antorchas, cactus y caña necesitan apoyo.
    const r = BLOCK_RENDER[id];
    if (r === R_CROSS || r === R_TORCH || id === CACTUS || id === SUGAR_CANE) {
      const under = world.getBlock(x, y - 1, z);
      if (SAPLINGS.has(id)) {
        if (!SOIL.has(under)) return;
      } else if (id === CACTUS) {
        if (under !== CACTUS && under !== SAND) return;
      } else {
        const okSame = id === SUGAR_CANE && under === id;
        if (!okSame && (under <= 0 || !BLOCK_SOLID[under] || BLOCK_RENDER[under] === R_CROSS)) return;
      }
    }
    world.setBlock(x, y, z, id);
    this.net?.sendSet(x, y, z, id);
    this.swing(false);
    this.audio.playPlace(BLOCKS[id].sound, [x + 0.5, y + 0.5, z + 0.5]);
    if (!this.creative) this.inv.consume(this.selected, 1);
  }

  /** Q: tirar el objeto de la mano (con Ctrl, la pila entera). */
  private dropHeld(all: boolean): void {
    const s = this.heldStack;
    if (!s || this.survival.dead) return;
    const n = all ? s.count : 1;
    this.throwStack({ ...s, count: n }, true);
    this.inv.consume(this.selected, n);
    this.swing(false);
  }

  /** Pide recoger los objetos que el jugador toca. */
  private autoPickup(now: number): void {
    if (this.survival.dead || !this.net) return;
    const p = this.player;
    for (const e of this.ents.list.values()) {
      if ((e.type !== ENT_ITEM && e.type !== ENT_ARROW) || !(e.flags & EF_PICKABLE) || e.gone) continue;
      if (Math.abs(e.x - p.x) > 1.3 || Math.abs(e.z - p.z) > 1.3 || e.y < p.y - 0.8 || e.y > p.y + 2.3) continue;
      const id = e.type === ENT_ARROW ? ARROW : e.item;
      if (this.inv.room({ id, count: 1 }) <= 0) continue;
      const last = this.pickupAsk.get(e.id) ?? 0;
      if (now - last < 0.5) continue;
      this.pickupAsk.set(e.id, now);
      this.net.send({ t: 'pickup', e: e.id });
    }
    if (this.pickupAsk.size > 256) {
      for (const [id, t] of this.pickupAsk) if (now - t > 5) this.pickupAsk.delete(id);
    }
  }

  /** Mirar a un enderman lo enfada (el servidor decide). */
  private checkEndermanLook(ex: number, ey: number, ez: number, dir: number[]): void {
    let any = false;
    for (const e of this.ents.list.values()) if (e.type === MOB_ENDERMAN) any = true;
    if (!any) return;
    const world = this.world!;
    const hit = this.ents.raycast(ex, ey, ez, dir[0], dir[1], dir[2], 64);
    if (!hit || hit.e.type !== MOB_ENDERMAN) return;
    const block = raycast(ex, ey, ez, dir[0], dir[1], dir[2], hit.dist, (x, y, z) => world.getBlock(x, y, z));
    if (block) return;
    this.net?.send({ t: 'look', e: hit.e.id });
  }

  /** Voces ocasionales y pasos de las criaturas cercanas (y llamas de las que arden). */
  private mobSounds(dt: number): void {
    const p = this.player;
    const now = performance.now() / 1000;
    for (const e of this.ents.list.values()) {
      const def = MOBS[e.type];
      if (!def || e.deathT >= 0) continue;
      const d = Math.hypot(e.x - p.x, e.y - p.y, e.z - p.z);
      if ((e.flags & EF_FIRE) && d < 48 && Math.random() < dt * 14) {
        const hw = def.width / 2;
        this.renderer.entities.spawnFlame(
          e.x + (Math.random() - 0.5) * hw * 2, e.y + Math.random() * def.height, e.z + (Math.random() - 0.5) * hw * 2,
        );
      }
      if (d > 24) continue;
      const kind = def.key as MobSoundKind;
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
      for (const id of this.idleSounds.keys()) if (!this.ents.list.has(id)) {
        this.idleSounds.delete(id);
        this.stepSounds.delete(id);
      }
    }
  }

  private playMob(kind: MobSoundKind, ev: MobSoundEvent, e: ClientEntity): void {
    this.audio.playMob(kind, ev, [e.x, e.y + 1, e.z]);
  }

  /** Cercanía de agua que fluye y de lava (para su sonido ambiente). */
  private updateFluidSound(): void {
    const world = this.world!;
    const p = this.player;
    let water = 0, lava = 0;
    let furnace: [number, number, number] | null = null;
    const cx = Math.floor(p.x), cy = Math.floor(p.y), cz = Math.floor(p.z);
    for (let dy = -3; dy <= 3; dy++) {
      for (let dz = -6; dz <= 6; dz++) {
        for (let dx = -6; dx <= 6; dx++) {
          const b = world.getBlock(cx + dx, cy + dy, cz + dz);
          if (b <= 0) continue;
          if (b >= FURNACE_LIT && b < FURNACE_LIT + 4) furnace = [cx + dx + 0.5, cy + dy + 0.5, cz + dz + 0.5];
          const f = BLOCK_FLUID[b];
          if (!f || ((dx | dz) & 1)) continue;
          const w = 1 / (1 + Math.hypot(dx, dy, dz) * 0.5);
          if (f === 2) lava += w;
          else if (BLOCK_FLUID_LEVEL[b] !== 0) water += w;
        }
      }
    }
    this.audio.setFluidProximity(Math.min(1, water / 4), Math.min(1, lava / 3));
    // Chisporroteo de un horno encendido cercano.
    if (furnace && Math.random() < 0.35) this.audio.playFurnace(furnace);
  }

  // ------------------------------------------------------------------ utilidades

  private autoScale = 1;
  private lastUserScale = -1;
  private slowTime = 0;
  private rainMapTimer = 0;
  private rainHeights = new Uint8Array(64 * 64);

  /** Intensidad de lluvia (0..1) determinista a partir del tiempo del mundo: igual para todos. */
  private weatherAt(worldTime: number): number {
    const override = (window as unknown as { __rain?: number }).__rain;
    if (override !== undefined) return override;
    return rainAt(worldTime, this.world!.seed);
  }

  /** Altura del bloque más alto de cada columna en un área de 64x64 (para que no llueva bajo techo). */
  private updateRainMap(): void {
    const world = this.world!;
    this.rainMapTimer = 0.5;
    const x0 = Math.floor(this.player.x) - 32;
    const z0 = Math.floor(this.player.z) - 32;
    const out = this.rainHeights;
    for (let dz = 0; dz < 64; dz++) {
      for (let dx = 0; dx < 64; dx++) {
        const x = x0 + dx, z = z0 + dz;
        const col = world.getColumn(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE));
        let top = 0;
        if (col && col.blocks) {
          const lx = x - col.cx * CHUNK_SIZE, lz = z - col.cz * CHUNK_SIZE;
          for (let y = Math.min(255, col.maxY + 1); y > 0; y--) {
            const b = col.blocks[(y << 8) | (lz << 4) | lx];
            if (b !== AIR && BLOCK_RENDER[b] !== R_CROSS && BLOCK_RENDER[b] !== R_TORCH) {
              top = y;
              break;
            }
          }
        }
        out[dz * 64 + dx] = top;
      }
    }
    this.renderer.weather.setHeights(x0, z0, out);
  }

  private farTimer = 0;
  private farPos = [1e9, 1e9];
  private farData = new Uint8Array(64);

  private updateFarOcean(): void {
    const world = this.world!;
    const p = this.player;
    this.farTimer = 2;
    this.farPos = [p.x, p.z];
    const R = world.renderDistance * CHUNK_SIZE;
    const gen = world.generator;
    const dists = [R + 16, R + 60, R + 140, R + 300, R + 600, R + 1100];
    const weights = [2, 1.6, 1.3, 1, 0.8, 0.6];
    const raw = new Float32Array(64);
    for (let i = 0; i < 64; i++) {
      const az = ((i + 0.5) / 64 - 0.5) * Math.PI * 2;
      const cx = Math.cos(az), cz = Math.sin(az);
      let water = 0, total = 0;
      for (let k = 0; k < dists.length; k++) {
        const h = gen.columnInfo(Math.floor(p.x + cx * dists[k]), Math.floor(p.z + cz * dists[k])).height;
        if (h < SEA_LEVEL - 1) water += weights[k];
        total += weights[k];
      }
      raw[i] = water / total;
    }
    const k5 = [1, 2, 3, 2, 1];
    for (let i = 0; i < 64; i++) {
      let acc = 0;
      for (let j = -2; j <= 2; j++) acc += raw[(i + j + 64) % 64] * k5[j + 2];
      const v = acc / 9;
      const t = Math.max(0, Math.min(1, (v - 0.3) / 0.4));
      this.farData[i] = Math.round(t * t * (3 - 2 * t) * 255);
    }
    this.renderer.setFarOcean(this.farData);
  }

  private openChat(prefill: string): void {
    this.input.gameKeys = false;
    this.input.releaseAll();
    this.ui.openChat(prefill);
    this.input.exitLock();
  }

  private selectSlot(i: number): void {
    if (i === this.selected) return;
    this.selected = i;
    this.equipT = 1;
    this.mining = null;
    this.refreshHotbar(true);
    const s = this.heldStack;
    if (s) this.ui.showBlockName(ITEMS[s.id]?.name ?? '');
  }

  /** Animación del brazo (y aviso por red si no hubo edición, que ya la anima). */
  private swing(sendNet = false): void {
    if (this.swingT < 0 || this.swingT > 0.5) this.swingT = 0;
    if (sendNet) this.net?.send({ t: 'swing' });
  }
}

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h & 0x7fffffff;
}

function lighten(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.round(c + (255 - c) * 0.45);
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}
