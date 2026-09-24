// Bucle principal del juego: arranque, entrada, movimiento, cámara, supervivencia y el estado que se
// dibuja cada frame. El resto vive en controladores: interaction (minar, colocar, usar, comer...),
// lifeCycle (daño, muerte, cama), serverEvents (mensajes del servidor), effects (sonidos y
// partículas) y environment (lluvia y océano lejano).
import { Renderer, type FrameState } from '../render/Renderer';
import { World } from '../world/World';
import { Player } from './Player';
import { Input } from './Input';
import { raycast, type RayHit } from './raycast';
import { RemotePlayer } from './RemotePlayers';
import { Net, type Welcome, type NetEvents } from '../net/Net';
import { LocalServer } from '../net/LocalServer';
import { UI } from '../ui/UI';
import { InventoryScreen, type ScreenKind } from '../ui/InventoryScreen';
import type { Settings } from './settings';
import type { GeneratedTextures } from '../textures/generateTextures';
import { AudioEngine } from '../audio/AudioEngine';
import { Inventory, HOTBAR } from './Inventory';
import { Survival } from './Survival';
import { ClientEntities, type ClientEntity } from './ClientEntities';
import { AIR, BLOCKS, BLOCK_RENDER, BLOCK_SOLID, DEFAULT_HOTBAR, WATER, R_CROSS, DIRT, isFarmland, R_CROP } from '../../shared/blocks';
import { ITEMS, maxStack, type ItemStack } from '../../shared/items';
import { MOBS } from '../../shared/mobs';
import { CHUNK_SIZE, DAY_LENGTH_SECONDS, SEA_LEVEL } from '../../shared/constants';
import { STATE_FLY, STATE_SNEAK, STATE_SWIM, STATE_DEAD, STATE_SLEEP, worldTimeAt, type WorldTime, type GameMode, type PlayerSave } from '../../shared/protocol';
import { TerrainGenerator, BIOME_NAMES } from '../../shared/world/terrain';
import type { RemotePlayerView } from '../render/EntityRenderer';
import { REACH_CREATIVE, REACH_SURVIVAL, ATTACK_REACH, lighten } from './gameTypes';
import { Interaction } from './interaction';
import { Experience } from './experience';
import { StatusEffects } from './statusEffects';
import { fishingLines } from './fishingLines';
import { SignTexts } from './signs';
import { SignEditor } from '../ui/SignEditor';
import { renderArmorBar } from '../ui/armorBar';
import { renderXpBar } from '../ui/xpBar';
import { renderEffectsHud } from '../ui/effectsHud';
import { EFFECT_POISON, EFFECT_HUNGER } from '../../shared/effects';
import { Effects } from './effects';
import { LifeCycle } from './lifeCycle';
import { ServerEvents } from './serverEvents';
import { Environment } from './environment';

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

function srgbToLin(v: number): number {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export class Game {
  readonly interaction = new Interaction(this);
  readonly effects = new Effects(this);
  readonly life = new LifeCycle(this);
  readonly network = new ServerEvents(this);
  readonly environment = new Environment(this);
  readonly xp = new Experience();
  readonly statusEffects = new StatusEffects();
  cfg: GameConfig;
  renderer: Renderer;
  ui: UI;
  audio: AudioEngine;
  input: Input;
  world: World | null = null;
  player = new Player();
  net: Net | null = null;
  private local: LocalServer | null = null;
  private offline = false;
  remote = new Map<string, RemotePlayer>();
  /** Flotadores de pesca fuera: jugador → entidad. */
  readonly bobbers = new Map<string, number>();
  /** Texto de los carteles y su editor. */
  readonly signs = new SignTexts();
  readonly signEditor = new SignEditor((pos, lines) => {
    this.net?.send({ t: 'sign', x: pos[0], y: pos[1], z: pos[2], l: lines });
    this.afterScreenClosed();
  });
  selected = 0;
  time: WorldTime = { base: 0.08, at: Date.now(), rate: 1 / DAY_LENGTH_SECONDS };
  private running = false;
  private raf = 0;
  private lastFrame = 0;
  hit: RayHit | null = null;
  swingT = -1;
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
  mode: GameMode = 's';
  difficulty = 2;
  inv = new Inventory();
  survival = new Survival();
  ents = new ClientEntities();
  screen: InventoryScreen;
  spawn: [number, number, number] = [0.5, 100, 0.5];
  private lookTimer = 0;
  private stateTimer = 0;
  private stateKey = '';
  private hotbarKey = '';
  shake = 0;
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
      drop: (s) => this.interaction.throwStack(s, false),
      sound: (k) => (k === 'craft' ? this.audio.playCraft() : this.audio.playUi('click')),
    }, this.inv);
    this.survival.armor = this.interaction.armor;
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

  get creative(): boolean {
    return this.mode === 'c';
  }

  get heldStack(): ItemStack | null {
    return this.inv.slots[this.selected] ?? null;
  }

  get heldId(): number {
    return this.heldStack?.id ?? 0;
  }

  // ------------------------------------------------------------------ arranque

  async start(): Promise<void> {
    const { ui } = this;
    ui.showLoading(this.cfg.offline ? 'Preparando el mundo local…' : 'Conectando con el servidor…', 0.05);
    let welcome: Welcome | null = null;
    const events: NetEvents = {
      onWelcome: (w, reconnect) => {
        if (reconnect) this.network.onReconnectWelcome(w);
        else welcome = w;
      },
      onMessage: (m) => this.network.onServerMessage(m),
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
    for (const p of w.players) this.network.addRemote(p, false);
    this.mode = w.mode;
    this.difficulty = w.diff;
    if (Array.isArray(w.spawn) && w.spawn.every(Number.isFinite)) this.spawn = w.spawn;
    this.life.bed = Array.isArray(w.bed) && w.bed.length === 3 && w.bed.every(Number.isInteger) ? w.bed : null;
    for (const r of Array.isArray(w.rods) ? w.rods : []) if (Array.isArray(r) && typeof r[0] === 'string' && Number.isInteger(r[1])) this.bobbers.set(r[0], r[1]);
    this.signs.clear();
    for (const sg of Array.isArray(w.signs) ? w.signs : []) if (Array.isArray(sg) && sg.slice(0, 3).every(Number.isInteger)) this.signs.set(sg[0], sg[1], sg[2], sg[3]);
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
    if (this.survival.dead) this.life.showDeath();
  }

  /** Aplica el estado guardado por el servidor (o prepara una aparición nueva). */
  private restore(save: PlayerSave | null): void {
    const p = this.player;
    if (save) {
      this.inv.fromWire(save.inv);
      this.inv.armorFromWire(save.armor);
      this.xp.total = Math.max(0, Math.floor(Number(save.xp) || 0));
      this.survival.reset();
      this.survival.health = Math.max(0, Math.min(20, save.hp));
      this.survival.food = Math.max(0, Math.min(20, save.food));
      this.survival.saturation = Math.max(0, Math.min(20, save.sat));
      this.survival.air = save.air ?? 15;
      this.statusEffects.fromWire(save.fx, this.survival);
      this.survival.absorption = Math.max(0, Math.min(20, Number(save.abs) || 0));
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

  /**
   * Al cerrar o recargar la pestaña: guardar el estado y, si se está jugando, pedir confirmación
   * (Ctrl + W, el atajo de cerrar pestaña, está al lado de correr con Ctrl).
   */
  private onUnload = (e: BeforeUnloadEvent) => {
    this.sendState(true);
    if (this.playing && !this.survival.dead) {
      e.preventDefault();
      e.returnValue = '';
    }
  };

  private anyScreenOpen(): boolean {
    return this.ui.isChatOpen() || this.ui.isInventoryOpen() || this.ui.isSettingsOpen() || this.screen.isOpen() || this.ui.isDeathOpen() ||
      this.signEditor.isOpen();
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
    ui.onFullscreen = () => {
      void this.input.toggleFullscreen().then(() => {
        ui.hidePause();
        this.input.requestLock();
      });
    };
    ui.onRespawn = () => this.life.respawn();
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
  toggleInventory(): void {
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

  /** Editor del texto de un cartel (al colocarlo o con clic derecho). */
  openSignEditor(x: number, y: number, z: number): void {
    this.interaction.mining = null;
    this.interaction.use = null;
    this.input.gameKeys = false;
    this.input.releaseAll();
    this.input.exitLock();
    this.signEditor.open([x, y, z], this.signs.get(x, y, z));
  }

  openScreen(kind: ScreenKind, pos: [number, number, number] | null, title = ''): void {
    this.interaction.mining = null;
    this.interaction.use = null;
    this.screen.open(kind, pos, title);
    this.input.gameKeys = false;
    this.input.releaseAll();
    this.input.exitLock();
  }

  afterScreenClosed(): void {
    this.audio.playUi('close');
    this.input.gameKeys = true;
    this.refreshHotbar(true);
    this.sendState(false);
    if (!this.survival.dead) this.input.requestLock();
  }

  refreshHotbar(force = false): void {
    const key = `${this.inv.version}|${this.selected}`;
    if (!force && key === this.hotbarKey) return;
    this.hotbarKey = key;
    this.ui.setHotbar(this.inv.slots.slice(0, HOTBAR), this.selected);
  }

  // ------------------------------------------------------------------ persistencia

  sendState(force: boolean): void {
    if (!this.net || !this.playing) return;
    const p = this.player, s = this.survival;
    const key = `${this.inv.version}|${s.version}|${this.xp.version}|${this.statusEffects.version}|${Math.round(p.x)}|${Math.round(p.y)}|${Math.round(p.z)}|${this.selected}|${s.dead}`;
    if (!force && key === this.stateKey) return;
    this.stateKey = key;
    this.net.send({
      t: 'state',
      d: {
        inv: this.inv.toWire(), hp: s.health, food: s.food, sat: Math.round(s.saturation * 10) / 10, air: Math.round(s.air),
        pos: [p.x, p.y, p.z], rot: [p.yaw, p.pitch], fly: p.flying, sel: this.selected, dead: s.dead,
        armor: this.inv.armorToWire(), xp: this.xp.total, fx: this.statusEffects.toWire(), abs: s.absorption,
      },
    });
  }

  sendPos(force: boolean): void {
    const p = this.player;
    const s = (p.sneaking ? STATE_SNEAK : 0) | (p.flying ? STATE_FLY : 0) | (p.inWater ? STATE_SWIM : 0) |
      (this.survival.dead ? STATE_DEAD : 0) | (this.life.sleeping ? STATE_SLEEP : 0);
    const q = (v: number, step: number) => Math.round(v / step);
    const armor = this.inv.armorIds();
    const key = `${q(p.x, 0.05)},${q(p.y, 0.05)},${q(p.z, 0.05)},${q(p.yaw, 0.03)},${q(p.pitch, 0.03)},${s},${this.heldId},${armor}`;
    if (!force && key === this.lastSentKey) return;
    this.net?.send({ t: 'pos', p: [p.x, p.y, p.z], r: [p.yaw, p.pitch], s, h: this.heldId, a: armor });
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

  /** Teclas de interfaz (inventario, chat, F1/F3/F5, ranuras, tirar, lista de jugadores). */
  private handleUiKeys(): void {
    const ui = this.ui;
    const input = this.input;
    const surv = this.survival;
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
        if (input.wasPressed('KeyQ')) this.interaction.dropHeld(input.wasPressedWithCtrl('KeyQ') || input.isDown('ControlLeft') || input.isDown('ControlRight'));
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
  }

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

    this.handleUiKeys();

    // --- Cámara ---
    if (input.locked && !surv.dead) {
      const sens = 0.0022 * settings.sensitivity;
      p.yaw -= input.dx * sens;
      p.pitch -= input.dy * sens * (settings.invertY ? -1 : 1);
      p.pitch = Math.max(-Math.PI / 2 + 0.001, Math.min(Math.PI / 2 - 0.001, p.pitch));
    }

    // --- Cama: la pantalla se oscurece; Mayús para levantarse ---
    if (this.life.sleeping) {
      this.life.sleeping.t += dt;
      ui.setSleep(Math.min(0.9, this.life.sleeping.t / 5));
      if (input.locked && !ui.isChatOpen() && (input.wasPressed('ShiftLeft') || input.wasPressed('ShiftRight'))) this.life.leaveBed(true);
    }

    // --- Movimiento ---
    const active = input.locked && !ui.isChatOpen() && !surv.dead && !this.life.sleeping;
    if (active && this.creative && input.wasDoubleTapped('Space')) {
      p.flying = !p.flying;
      if (p.flying) p.vy = 0;
    }
    if (!this.creative) p.flying = false;
    if (active && input.wasDoubleTapped('KeyW') && (this.creative || surv.canSprint())) p.sprinting = true;
    if (!this.creative && !surv.canSprint()) p.sprinting = false;
    // Usar un objeto frena mucho; los efectos Velocidad y Lentitud multiplican.
    p.usingItem = !!this.interaction.use;
    p.slow = (this.interaction.use ? 0.25 : 1) * this.statusEffects.speed;
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
    // Caer sobre tierra de cultivo la pisotea (más probable cuanto más alta la caída).
    if (p.justLanded && !p.flying && p.landedFall > 0.5 && Math.random() < p.landedFall - 0.5) {
      const bx = Math.floor(p.x), by = Math.floor(p.y - 0.05), bz = Math.floor(p.z);
      if (isFarmland(world.getBlock(bx, by, bz))) {
        world.setBlock(bx, by, bz, DIRT);
        this.net?.send({ t: 'trample', x: bx, y: by, z: bz });
      }
    }

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
    const rain = this.environment.weatherAt(worldTime);
    this.life.tickSurvival(dt, moved, wasGround, rain);
    this.audio.setHeartbeat(!this.creative && !surv.dead && surv.health <= 6 ? (7 - surv.health) / 6 : 0);

    // --- Interacción ---
    const eyeX = p.x, eyeY = p.eyeY, eyeZ = p.z;
    const cp = Math.cos(p.pitch);
    const dir = [-Math.sin(p.yaw) * cp, Math.sin(p.pitch), -Math.cos(p.yaw) * cp];
    const reach = this.creative ? REACH_CREATIVE : REACH_SURVIVAL;
    this.hit = surv.dead ? null : raycast(eyeX, eyeY, eyeZ, dir[0], dir[1], dir[2], reach, (x, y, z) => world.getBlock(x, y, z));
    const entHit = surv.dead ? null : this.ents.raycast(eyeX, eyeY, eyeZ, dir[0], dir[1], dir[2], this.creative ? 5 : ATTACK_REACH);
    // Las plantas sin colisión (hierba, flores, cultivos) no tapan a las criaturas.
    const hitBlocks = this.hit && BLOCK_RENDER[this.hit.id] !== R_CROSS && BLOCK_RENDER[this.hit.id] !== R_CROP;
    const target = entHit && (!hitBlocks || entHit.dist < this.hit!.dist) ? entHit.e : null;
    this.interaction.placeCooldown -= dt;
    this.interaction.breakDelay -= dt;
    if (active) this.interaction.interact(dt, target, dir);
    else {
      this.interaction.mining = null;
      if (this.interaction.use?.kind === 'bow') this.interaction.releaseBow(dir);
      this.interaction.use = null;
    }

    // --- Mundo, jugadores, entidades y partículas ---
    world.update(p.x, p.z, p.yaw, dt);
    this.ents.update(dt, nowS);
    this.interaction.autoPickup(nowS);
    this.lookTimer -= dt;
    if (this.lookTimer <= 0 && !surv.dead) {
      this.lookTimer = 0.3;
      this.interaction.checkEndermanLook(eyeX, eyeY, eyeZ, dir);
    }
    this.effects.mobSounds(dt);
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
    const fx = this.statusEffects;
    ui.setSurvival(
      !this.creative && !surv.dead, surv.health, surv.food, surv.air, surv.hurtTime < 0.3, surv.absorption,
      fx.has(EFFECT_POISON), fx.has(EFFECT_HUNGER),
    );
    renderEffectsHud(fx, !surv.dead && !this.hudHidden);
    renderArmorBar(this.inv.armorPoints(), !this.creative && !surv.dead);
    renderXpBar(this.xp, !this.creative && !surv.dead);

    // --- Horizonte lejano ---
    this.environment.farTimer -= dt;
    if (this.environment.farTimer <= 0 || Math.hypot(p.x - this.environment.farPos[0], p.z - this.environment.farPos[1]) > 48) this.environment.updateFarOcean();

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
    this.environment.rainMapTimer -= dt;
    if (rain > 0.01 && this.environment.rainMapTimer <= 0) this.environment.updateRainMap();

    // --- Luz en el ojo y exposición al cielo ---
    const le = world.getLight(Math.floor(eyeX), Math.floor(eyeY), Math.floor(eyeZ));
    const skyAtEye = (le >> 4) / 15;
    this.eyeSky += (skyAtEye - this.eyeSky) * (1 - Math.exp(-dt * 1.5));
    const underwater = p.eyeInWater;

    // --- Cámara (primera/tercera persona) ---
    let camX = eyeX, camY = eyeY, camZ = eyeZ;
    let yaw = p.yaw, pitch = p.pitch;
    if (surv.dead) camY = p.y + 0.3;
    else if (this.life.sleeping) camY = p.y + 0.2;
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
        swing: this.swingT >= 0 ? this.swingT : 0, sneaking: p.sneaking, sleeping: !!this.life.sleeping, light: [skyAtEye, (le & 15) / 15],
        armor: this.inv.armorIds(),
      });
    }

    // FOV dinámico al correr/volar y al tensar el arco.
    const baseFov = settings.render.fov;
    const bowZoom = this.interaction.use?.kind === 'bow' ? 1 - Math.min(1, this.interaction.use.t) * 0.15 : 1;
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
      if (this.swingT >= 1) this.swingT = this.interaction.mining ? 0 : -1;
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
    const m = this.interaction.mining;
    let crack: FrameState['crack'] = null;
    if (m && m.progress > 0) {
      const h = this.hit;
      const box = h && h.x === m.x && h.y === m.y && h.z === m.z ? h.box : undefined;
      crack = { x: m.x, y: m.y, z: m.z, stage: Math.min(9, Math.floor(m.progress * 10)), box };
    }

    this.renderer.entities.lightDir = this.renderer.sunDir[1] >= 0 ? this.renderer.sunDir : this.renderer.sunDir.map((v) => -v);
    const use = this.interaction.use;
    const state: FrameState = {
      camX, camY, camZ, yaw, pitch,
      time: performance.now() / 1000,
      dt,
      dayTime,
      day,
      underwater,
      eyeSkyExposure: this.eyeSky,
      rain,
      nightVision: this.statusEffects.nightVision,
      snow,
      cloudCoverage: (window as unknown as { __cloudCov?: number }).__cloudCov ?? Math.max(0.1, Math.min(0.9, coverage)),
      mist,
      selection: this.hit && !this.hudHidden && !target ? { x: this.hit.x, y: this.hit.y, z: this.hit.z, box: this.hit.box } : null,
      heldItem: surv.dead ? 0 : this.heldId,
      handUse: use ? (use.kind === 'bow' ? Math.min(1, use.t) : use.kind === 'block' ? use.t : use.t / 1.6) : 0,
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
      signs: this.signs.draws((x, y, z) => world.getBlock(x, y, z), camX, camY, camZ),
      fishLines: fishingLines(this.bobbers, this.ents.list, this.net?.id ?? null, {
        cam: [camX, camY, camZ], yaw, pitch, firstPerson: this.thirdPerson === 0, feet: [p.x, p.y, p.z], bodyYaw: p.yaw,
      }, views),
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
    this.effects.fluidTimer -= dt;
    if (this.effects.fluidTimer <= 0) {
      this.effects.fluidTimer = 0.5;
      this.effects.updateFluidSound();
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

  private autoScale = 1;
  private lastUserScale = -1;
  private slowTime = 0;
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
    this.interaction.mining = null;
    this.refreshHotbar(true);
    const s = this.heldStack;
    if (s) this.ui.showBlockName(ITEMS[s.id]?.name ?? '');
  }

  /** Animación del brazo (y aviso por red si no hubo edición, que ya la anima). */
  swing(sendNet = false): void {
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
