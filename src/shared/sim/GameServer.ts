// Servidor de juego autoritativo, independiente del transporte: lo usa el Durable Object de
// Cloudflare (multijugador) y un Web Worker en el navegador (modo un jugador).
//
// Este archivo sólo orquesta: conexiones y sesiones, reparto de mensajes, el bucle de 20 ticks/s y
// el guardado. Cada tema vive en su sistema (carpeta server/): reglas de bloques, naturaleza,
// granja, camas, contenedores, ediciones de los jugadores, acciones sobre entidades, comandos y
// sincronización de entidades. Los sistemas sólo ven un ServerContext (ver server/context.ts).
import {
  PROTOCOL_VERSION, MAX_PLAYERS, MAX_CHAT, STATE_DEAD, STATE_MASK, encodeEdits, sanitizeName, sanitizeColor, worldTimeAt,
  stackFromWire, stackToWire, type ClientMsg, type ServerMsg, type PlayerInfo, type WorldTime, type PlayerSave, type WireStack,
} from '../protocol';
import { WORLD_LIMIT, CHUNK_SIZE, VOID_Y } from '../constants';
import { AIR, isValidBlockId } from '../blocks';
import { sanitizeStack } from '../containers';
import { ITEMS, isValidItem } from '../items';
import { EFFECTS, MAX_EFFECT_AMP, MAX_EFFECT_SECONDS } from '../effects';
import { sunHeightAt, rainAt } from '../weather';
import { WorldSim } from './WorldSim';
import { FluidSim, type FluidWorld } from './fluids';
import { Entities, type EntityHost, type PlayerView } from './entities';
import { blockDrops } from './drops';
import { migrateStore, type ServerStore } from './store';
import { TICK_RATE, DT, DAY_RATE, SIM_RADIUS, r2, type Conn, type Session, type PlayerRecord, type ServerContext } from './server/context';
import { BlockRules, fallsThrough } from './server/blockRules';
import { Nature } from './server/nature';
import { TurtleEggs } from './server/turtleEggs'; // Fase 6 (acuáticos)
import { BambooGrowth } from './server/bamboo'; // Fase 6.5 (maderas)
import { Spawners } from './server/spawners';
import { Storms } from './server/storms';
import { Farming } from './server/farming';
import { Beds } from './server/beds';
import { Composters } from './server/composters';
import { Fishing } from './server/fishing';
import { Campfires } from './server/campfires';
import { Signs } from './server/signs';
import { ContainerSystem } from './server/containerSystem';
import { BlockEdits } from './server/blockEdits';
import { PlayerActions } from './server/playerActions';
import { Commands } from './server/commands';
import { EntitySync } from './server/entitySync';
import { Riding } from './server/riding'; // Fase 6 (monturas)
import { Trading } from './server/trading'; // Fase 6 (aldeanos)
import { Monsters } from './server/monsters'; // Fase 6 (monstruos)
import { Golems } from './server/golems'; // Fase 6 (gólems/domesticar)
import { Raids } from './server/raids'; // Fase 6 (asaltos)
import { ColorBlocks } from './server/colorBlocks'; // Fase 6.5 (colores)
import { Copper } from './server/copper'; // Fase 6.5 (cobre)
import { Hangings } from './server/hangings'; // Fase 6.5 (decoración)
import { Shelves } from './server/shelves'; // Fase 6.5 (remate)
import { Cauldrons } from './server/cauldrons'; // Fase 6.5 (calderos)
import { Leashes } from './server/leashes'; // Fase 6.5 (remate)
import { ArmorStands } from './server/armorStands'; // Fase 6.5 (remate)
import { OceanLife } from './server/oceanLife'; // Fase 6.5 (océano y plantas)
import { Lecterns } from './server/lecterns'; // Fase 6.5 (libros y estandartes)
import { Banners } from './server/banners'; // Fase 6.5 (libros y estandartes)
import { Materials } from './server/materials'; // Fase 6.5 (materiales)
import { Frogspawn } from './server/frogspawn'; // Fase 6.5 (materiales)
import { Collections } from './server/collections'; // Fase 6.5 (colecciones)
// Fase 6.5 (equipo): fuego, conductos y el equipo de los jugadores.
import { Fire } from './server/fire';
import { potionView, effectColorFrom } from './server/potionPlayers'; // Fase 7 (pociones)
import { STATE_INVISIBLE, potionKind, isPotionType } from '../potions';
import { Conduits } from './server/conduits';
import { Equipment } from './server/equipment';
import { Transport } from './server/vehicles'; // Fase 7 (transporte)
import { EnchantWork } from './server/enchantWork'; // Fase 7 (encantamientos)
import { thunderAt } from '../weather'; // Fase 7 (encantamientos): Conductividad
import { Redstone } from './server/redstone'; // Fase 7 (redstone)
import { Mechanisms } from './server/mechanisms'; // Fase 7 (mecanismos)
import { BellResonance } from './server/bellResonance'; // Fase 7 (efectos)
import { STATE_GLOWING, MAX_HEALTH_CAP } from '../effects'; // Fase 7 (efectos)
import { discOfItem } from '../collections';
import { OceanMonuments } from './server/monuments'; // Fase 7.5 (océano)
import { CritterWorld } from './server/critterWorld'; // Fase 7.5 (fauna)
import { Allays } from './server/allays'; // Fase 7.5 (mansión)

export { TICK_RATE, type Conn };
export { canSleepAt } from './server/beds';

/** Chunks generados como máximo por tick (la generación es lo más caro). */
const GEN_PER_TICK = 2;
/**
 * Tamaño máximo de un mensaje. Fase 6.5 (libros y estandartes): los libros escritos viajan con el
 * inventario, así que el estado del jugador puede pasar de 16 KB (1 MB es el límite de Cloudflare).
 */
const MAX_MESSAGE = 1 << 20;
const STALE_MS = 40_000;

/** Fase 7 (remate): tipo de poción válido del objeto `item` en la mano (0 si no es una poción o no vale). */
function heldPotionType(item: number, raw: unknown): number {
  const t = Number(raw);
  return potionKind(item) && Number.isInteger(t) && isPotionType(t) ? t : 0;
}

/** Fase 7 (remate): campos hp y op de un jugador (sólo los que no son agua). */
function handPotions(s: Session): { hp?: number; op?: number } {
  return { ...(s.hp ? { hp: s.hp } : {}), ...(s.op ? { op: s.op } : {}) };
}

export interface GameServerOptions {
  seed?: number;
  /** Reloj en ms (por defecto Date.now). */
  now?: () => number;
  /** Modo un jugador: sin límite de ritmo ni comprobaciones de distancia estrictas. */
  local?: boolean;
  /** Segundos entre guardados (las escrituras cuestan en el plan gratuito de Cloudflare). */
  flushSeconds?: number;
  /** Azar del servidor y de las criaturas (por defecto Math.random; las pruebas pasan uno con semilla). */
  rand?: () => number;
}

export class GameServer {
  readonly world: WorldSim;
  readonly entities: Entities;
  private fluids = new FluidSim();
  private fluidWorld: FluidWorld;
  private store: ServerStore;
  private sessions = new Map<Conn, Session>();
  private time: WorldTime;
  private difficulty = 2;
  private defaultMode: 's' | 'c' | null = null;
  /** Cambios de bloques por enviar: [x, y, z, id, jugador que lo hizo o null]. */
  private queue: [number, number, number, number, string | null][] = [];
  private actor: string | null = null;
  private tickCount = 0;
  private spawnPoint: [number, number, number] | null = null;
  private now: () => number;
  private local: boolean;
  private rand = Math.random;
  private lastMobSave = 0;
  private nextSessionId = 1;
  private flushTicks: number;

  // Sistemas
  private ctx: ServerContext;
  private rules: BlockRules;
  private nature: Nature;
  private turtleEggs: TurtleEggs;
  /** Fase 6.5 (maderas): crecimiento del bambú. */
  readonly bamboo: BambooGrowth;
  private spawners: Spawners;
  private storms: Storms;
  private farming: Farming;
  private beds: Beds;
  private composters: Composters;
  private campfires: Campfires;
  private signs: Signs;
  private fishing: Fishing;
  private containers: ContainerSystem;
  private edits: BlockEdits;
  private actions: PlayerActions;
  private commands: Commands;
  private entitySync: EntitySync;
  /** Fase 6 (monturas): quién monta qué. */
  readonly riding: Riding;
  private trading: Trading; // Fase 6 (aldeanos)
  /** Fase 6 (monstruos): insomnio y phantoms, bloques infestados. */
  private monsters: Monsters;
  /** Fase 6 (gólems/domesticar): construir gólems y poblar las aldeas. */
  readonly golems: Golems;
  /** Fase 6 (asaltos): puestos, patrullas, Mal presagio y asaltos. */
  readonly raids: Raids;
  /** Fase 6.5 (colores): hormigón en polvo que se endurece en el agua. */
  private colorBlocks: ColorBlocks;
  /** Fase 6.5 (cobre): oxidación, cera, raspado y rayos. */
  private copper: Copper;
  /** Fase 6.5 (decoración): cuadros y marcos colgados. */
  readonly hangings: Hangings;
  /** Fase 6.5 (remate): libros de las estanterías cinceladas. */
  private shelves: Shelves;
  /** Fase 6.5 (calderos): calderos con agua, lava o nieve polvo. */
  private cauldrons: Cauldrons;
  /** Fase 6.5 (remate): etiquetas y correas. */
  private leashes: Leashes;
  /** Fase 6.5 (remate): soportes para armadura. */
  private stands: ArmorStands;
  /** Fase 6.5 (océano y plantas): corales, algas, esponjas, bayas dulces y plantaformas. */
  readonly oceanLife: OceanLife;
  /** Fase 6.5 (libros y estandartes): libros de los atriles y capas de los estandartes. */
  readonly lecterns: Lecterns;
  readonly banners: Banners;
  /** Fase 6.5 (materiales): suelos, tartas con vela y caminos. */
  private materials: Materials;
  /** Fase 6.5 (materiales): cría de las ranas y huevos de rana. */
  readonly frogspawn: Frogspawn;
  /** Fase 6.5 (colecciones): tocadiscos y creepers cargados. */
  readonly collections: Collections;
  /** Fase 6.5 (equipo): fuego, conductos y el equipo de los jugadores (mechero, tridente, cohetes…). */
  readonly fire: Fire;
  readonly conduits: Conduits;
  private equipment: Equipment;
  /** Fase 7 (transporte): barcas, vagonetas y raíles. */
  readonly transport: Transport;
  private enchantWork: EnchantWork; // Fase 7 (encantamientos)
  /** Fase 7 (redstone): potencia, componentes y ticks programados. */
  readonly redstone: Redstone;
  /** Fase 7 (mecanismos): pistones, observadores, tolvas, dispensadores, soltadores y dinamita. */
  readonly mechanisms: Mechanisms;
  /** Fase 7 (efectos): la campana hace brillar a los saqueadores. */
  private bells: BellResonance;
  /** Fase 7.5 (océano): criaturas de estructura, guardianes de los monumentos y maldición del anciano. */
  readonly monuments: OceanMonuments;
  /** Fase 7.5 (fauna): trampa del rayo, llamas del comerciante y cabañas de bruja. */
  readonly critters: CritterWorld;
  /** Fase 7.5 (mansión): alays (bloques musicales, tocadiscos y objetos). */
  private allays: Allays;

  constructor(store: ServerStore, opts: GameServerOptions = {}) {
    this.store = store;
    // Mundos guardados con bloques de 1 byte: pasarlos al formato de 16 bits antes de leerlos.
    migrateStore(store);
    this.now = opts.now ?? Date.now;
    if (opts.rand) this.rand = opts.rand;
    this.local = !!opts.local;
    this.flushTicks = Math.max(1, Math.round((opts.flushSeconds ?? 30) * TICK_RATE));
    let seed = Number(store.getMeta('seed'));
    if (!store.getMeta('seed') || !Number.isFinite(seed)) {
      seed = opts.seed ?? ((Math.random() * 0x7fffffff) | 0);
      store.setMeta('seed', String(seed));
    }
    this.time = { base: 0.08, at: this.now(), rate: DAY_RATE };
    try {
      const t = JSON.parse(store.getMeta('time') ?? '') as WorldTime;
      if (Number.isFinite(t.base) && Number.isFinite(t.at)) this.time = { base: t.base, at: t.at, rate: DAY_RATE };
    } catch {
      store.setMeta('time', JSON.stringify(this.time));
    }
    const d = Number(store.getMeta('difficulty'));
    if (store.getMeta('difficulty') !== null && Number.isInteger(d) && d >= 0 && d <= 3) this.difficulty = d;
    const m = store.getMeta('mode');
    if (m === 's' || m === 'c') this.defaultMode = m;
    this.world = new WorldSim(seed | 0, store);
    this.world.onChange = (x, y, z, old, id) => this.onBlockChanged(x, y, z, old, id);
    this.fluidWorld = {
      getBlock: (x, y, z) => this.world.getBlock(x, y, z),
      setBlock: (x, y, z, id) => {
        this.world.setBlock(x, y, z, id);
      },
      washAway: (x, y, z, id) => this.entities.dropStacks(blockDrops(id, 0, this.rand), x + 0.5, y + 0.3, z + 0.5),
    };
    this.entities = new Entities(this.makeHost());
    this.entities.rand = this.rand;
    this.entities.restorePassive(store.getMeta('mobs'));

    this.ctx = this.makeContext();
    this.rules = new BlockRules(this.ctx);
    this.nature = new Nature(this.ctx);
    this.farming = new Farming(this.ctx, this.nature);
    this.turtleEggs = new TurtleEggs(this.ctx, this.nature); // Fase 6 (acuáticos)
    this.bamboo = new BambooGrowth(this.ctx, this.nature); // Fase 6.5 (maderas)
    this.beds = new Beds(this.ctx);
    this.containers = new ContainerSystem(this.ctx, store);
    this.world.onLoot = (chests) => this.containers.fillLoot(chests);
    this.spawners = new Spawners(this.ctx);
    this.storms = new Storms(this.ctx);
    this.composters = new Composters(this.ctx);
    this.fishing = new Fishing(this.ctx);
    this.campfires = new Campfires(this.ctx, store);
    this.signs = new Signs(this.ctx, store);
    this.edits = new BlockEdits(this.ctx, this.rules, this.farming, this.beds, this.composters, this.campfires);
    this.actions = new PlayerActions(this.ctx);
    this.commands = new Commands(this.ctx);
    this.entitySync = new EntitySync(this.ctx);
    this.riding = new Riding(this.ctx); // Fase 6 (monturas)
    // Fase 6 (aldeanos): comercio y aldeanos de las aldeas nuevas.
    this.trading = new Trading(this.ctx);
    this.world.onVillagers = (v) => this.trading.spawnVillagers(v);
    this.monsters = new Monsters(this.ctx, store);
    this.golems = new Golems(this.ctx, store); // Fase 6 (gólems/domesticar)
    this.raids = new Raids(this.ctx, store); // Fase 6 (asaltos)
    this.colorBlocks = new ColorBlocks(this.ctx); // Fase 6.5 (colores)
    // Fase 6.5 (océano y plantas).
    this.oceanLife = new OceanLife(this.ctx, this.nature, this.rules);
    this.farming.extraFertilize = (x, y, z) => this.oceanLife.fertilize(x, y, z);
    this.edits.extraUse = (s, x, y, z, id) => this.oceanLife.useBlock(s, x, y, z, id);
    this.trading.heroOf = (name) => this.raids.isHero(name);
    this.commands.raids = this.raids;
    // Fase 6.5 (cobre).
    this.copper = new Copper(this.ctx, this.nature, this.rules);
    this.edits.copper = this.copper;
    this.storms.onStrike = (x, y, z) => this.copper.lightning(Math.floor(x), Math.floor(y) - 1, Math.floor(z));
    this.hangings = new Hangings(this.ctx, store); // Fase 6.5 (decoración)
    this.shelves = new Shelves(this.ctx, store); // Fase 6.5 (remate)
    this.cauldrons = new Cauldrons(this.ctx, this.nature); // Fase 6.5 (calderos)
    this.edits.cauldrons = (s, x, y, z, id, item) => this.cauldrons.use(s, x, y, z, id, item);
    this.leashes = new Leashes(this.ctx); // Fase 6.5 (remate)
    this.stands = new ArmorStands(this.ctx, store); // Fase 6.5 (remate)
    this.farming.extraInteract = (s, e, msg) => this.stands.onInteract(s, e, msg) ?? this.leashes.onInteract(s, e, msg);
    // Fase 6.5 (libros y estandartes): atriles y estandartes con dibujos. El estandarte roto suelta su
    // objeto con las capas (lo suelte quien lo suelte: el jugador, la falta de apoyo, una explosión…).
    this.lecterns = new Lecterns(this.ctx, store);
    this.banners = new Banners(this.ctx, store);
    this.edits.placed = (s, msg, edits) => this.banners.onPlaced(s, msg, edits);
    const drop = this.entities.dropStacks.bind(this.entities);
    this.entities.dropStacks = (stacks, x, y, z) => drop(this.banners.decorateDrops(stacks, x, y, z), x, y, z);
    // Fase 6.5 (materiales).
    this.materials = new Materials(this.ctx);
    this.edits.materials = (s, x, y, z, id, item, h) => this.materials.useBlock(s, x, y, z, id, item, h);
    this.frogspawn = new Frogspawn(this.ctx, this.nature);
    // Fase 6.5 (colecciones): tocadiscos; los rayos también cargan a los creepers.
    this.collections = new Collections(this.ctx, store);
    this.storms.onStrike = (x, y, z) => {
      this.copper.lightning(Math.floor(x), Math.floor(y) - 1, Math.floor(z));
      this.collections.lightning(x, y, z);
    };
    this.commands.lightning = (x, y, z) => this.storms.strike(x, y, z);
    // Fase 6.5 (equipo): fuego (los rayos también lo encienden), conductos y equipo.
    this.fire = new Fire(this.ctx, this.nature);
    this.conduits = new Conduits(this.ctx, this.nature);
    this.bells = new BellResonance(this.ctx); // Fase 7 (efectos)
    this.equipment = new Equipment(this.ctx, this.fire, this.riding);
    const strike = this.storms.onStrike;
    this.storms.onStrike = (x, y, z) => {
      strike?.(x, y, z);
      this.fire.lightning(x, y, z);
    };
    const interact = this.farming.extraInteract;
    this.farming.extraInteract = (s, e, msg) => this.equipment.onInteract(s, e, msg) ?? interact?.(s, e, msg) ?? null;
    // Fase 7 (transporte): barcas y vagonetas (sus cofres se abren como los de bloque) y raíles.
    this.transport = new Transport(this.ctx, store, this.riding);
    this.containers.virtual = {
      container: (x, y, z, s) => this.transport.container(x, y, z, s),
      changed: () => this.transport.containerChanged(),
    };
    this.transport.leash = (s, e, msg) => this.leashes.onInteract(s, e, msg); // Fase 7 (remate): barcas atadas
    const interact2 = this.farming.extraInteract;
    this.farming.extraInteract = (s, e, msg) => this.transport.onInteract(s, e, msg) ?? interact2?.(s, e, msg) ?? null;
    // Fase 7 (encantamientos): mesa, yunque, afiladora, yunques que caen, Paso helado y Conductividad.
    this.enchantWork = new EnchantWork(this.ctx, this.nature);
    this.entities.fallingLanded = (e) => this.enchantWork.fallingLanded(e);
    this.entities.gearShots.lightning = (x, y, z) => this.storms.strike(x, y, z);
    this.entities.gearShots.thundering = () => thunderAt(this.worldTime(), this.seed) > 0;
    // Fase 7 (redstone): el motor, lo que lee de otros sistemas y los avisos que le llegan de ellos.
    const rs = (this.redstone = new Redstone(this.ctx, this.nature));
    rs.hooks = {
      slots: (x, y, z) => this.containers.slotsAt(x, y, z),
      viewers: (x, y, z) => this.containers.viewers(x, y, z),
      lecternBook: (x, y, z) => this.lecterns.bookAt(x, y, z),
      jukeboxDisc: (x, y, z) => {
        const item = this.collections.discAt(x, y, z);
        return item ? discOfItem(item) : -1;
      },
      frameSignal: (x, y, z) => this.hangings.frameSignal(x, y, z),
    };
    this.containers.viewersChanged = (x, y, z) => rs.viewersChanged(x, y, z);
    this.containers.contentsChanged = (x, y, z) => rs.analogChanged(x, y, z);
    this.hangings.onFrameChanged = (x, y, z) => rs.analogChanged(x, y, z);
    this.world.onChunkLoaded = (c) => rs.onChunkLoaded(c);
    this.storms.redirect = (x, y, z) => rs.lightningTarget(x, y, z);
    const strikeRs = this.storms.onStrike;
    this.storms.onStrike = (x, y, z) => {
      strikeRs?.(x, y, z);
      rs.lightning(x, y, z);
    };
    this.edits.redstone = (x, y, z, id) => rs.use(x, y, z, id);
    this.edits.touched = (x, y, z) => rs.touch(x, y, z);
    this.edits.beforeBreak = (x, y, z, id, tool) => rs.beforeBreak(x, y, z, id, tool);
    // Los raíles propulsores y activadores del transporte miran la potencia de la redstone.
    this.transport.rails.railPowered = (x, y, z) => rs.isPowered(x, y, z);
    for (const c of this.world.loadedChunks()) rs.onChunkLoaded(c);
    // Fase 7 (mecanismos): lo que usan (contenedores, fuego, transporte…) y los avisos que les llegan.
    const mech = (this.mechanisms = new Mechanisms({
      ctx: this.ctx, redstone: rs, rules: this.rules, containers: this.containers, composters: this.composters,
      collections: this.collections, shelves: this.shelves, transport: this.transport, fire: this.fire, stands: this.stands,
      fertilize: (x, y, z) => this.farming.fertilize(x, y, z),
    }));
    const lightBlock = this.fire.lightBlock.bind(this.fire);
    this.fire.lightBlock = (x, y, z) => mech.light(x, y, z) || lightBlock(x, y, z);
    this.fire.burned = (x, y, z) => mech.light(x, y, z);
    // Fase 7.5 (océano, mansión): un solo camino para las criaturas de estructura (guardianes, illagers de la
    // mansión, alays presos): las hace aparecer con persist; lo propio de cada especie (el alay) lo pone
    // Entities.spawnMob.
    this.monuments = new OceanMonuments(this.ctx); // Fase 7.5 (océano)
    this.world.onStructureMobs = (m) => this.monuments.spawnStructureMobs(m);
    this.critters = new CritterWorld(this.ctx, this.storms, this.trading); // Fase 7.5 (fauna)
    // Fase 7.5 (mansión): alays (bloques musicales, tocadiscos y los objetos que les dan los jugadores).
    this.allays = new Allays(this.ctx, this.collections);
    const interact3 = this.farming.extraInteract;
    this.farming.extraInteract = (s, e, msg) => this.allays.onInteract(s, e, msg) ?? interact3?.(s, e, msg) ?? null;
  }

  get seed(): number {
    return this.world.seed;
  }

  get playerCount(): number {
    let n = 0;
    for (const s of this.sessions.values()) if (s.joined) n++;
    return n;
  }

  get connectionCount(): number {
    return this.sessions.size;
  }

  isKnown(conn: Conn): boolean {
    return this.sessions.has(conn);
  }

  // ------------------------------------------------------------------ contexto de los sistemas

  private makeContext(): ServerContext {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const gs = this;
    return {
      world: this.world,
      entities: this.entities,
      local: this.local,
      get seed() {
        return gs.seed;
      },
      get tickCount() {
        return gs.tickCount;
      },
      get playerCount() {
        return gs.playerCount;
      },
      get difficulty() {
        return gs.difficulty;
      },
      rand: () => this.rand(),
      now: () => this.now(),
      worldTime: () => this.worldTime(),
      sessions: () => this.sessions.values(),
      send: (s, msg) => this.send(s, msg),
      sendRaw: (s, data) => this.sendRaw(s, data),
      broadcast: (msg, except) => this.broadcast(msg, except),
      tell: (s, m) => this.send(s, { t: 'chat', id: null, name: '', m }),
      fx: (kind, x, y, z, a, b) => this.fx(kind, x, y, z, a, b),
      allow: (s, cost) => this.allow(s, cost),
      reachOk: (s, x, y, z, max) => this.reachOk(s, x, y, z, max),
      reject: (s, x, y, z) => this.reject(s, x, y, z),
      asActor: (id, fn) => {
        const prev = this.actor;
        this.actor = id;
        try {
          return fn();
        } finally {
          this.actor = prev;
        }
      },
      savePlayer: (s) => this.savePlayer(s),
      setTime: (days) => this.setTime(days),
      setDifficulty: (dd) => {
        this.difficulty = dd;
        this.store.setMeta('difficulty', String(dd));
        this.broadcast({ t: 'diff', d: dd });
      },
      markCollected: (id, who) => this.entitySync.markCollected(id, who),
    };
  }

  // ------------------------------------------------------------------ anfitrión de entidades

  private makeHost(): EntityHost {
    return {
      world: this.world,
      players: () => this.playerViews(),
      sunHeight: () => sunHeightAt(this.worldTime()),
      raining: () => rainAt(this.worldTime(), this.seed),
      difficulty: () => this.difficulty,
      hurtPlayer: (id, amount, kx, ky, kz, cause, src) => {
        for (const s of this.sessions.values()) {
          if (s.id !== id || !s.joined || s.mode === 'c' || s.s & STATE_DEAD) continue;
          const th = src ? this.enchantWork.thorns(s, src) : 0; // Fase 7 (encantamientos): Espinas
          this.send(s, { t: 'hurt', a: Math.round(amount * 10) / 10, k: [r2(kx), r2(ky), r2(kz)], c: cause, ...(th ? { th } : {}) });
        }
      },
      fx: (kind, x, y, z, a, b) => this.fx(kind, x, y, z, a, b),
      breakBlock: (x, y, z, drop) => {
        const id = this.world.getBlock(x, y, z);
        if (id <= 0) return;
        this.world.setBlock(x, y, z, AIR);
        if (drop) this.entities.dropStacks(blockDrops(id, 0, this.rand), x + 0.5, y + 0.3, z + 0.5);
      },
      trample: (x, y, z) => this.farming.trample(x, y, z),
      landBlock: (x, y, z, block) => {
        const cur = this.world.getBlock(x, y, z);
        if (cur >= 0 && fallsThrough(cur) && isValidBlockId(block)) this.world.setBlock(x, y, z, block);
        else this.entities.dropStacks([{ id: block, count: 1 }], x + 0.5, y + 0.5, z + 0.5);
      },
      giveXp: (id, n) => {
        for (const s of this.sessions.values()) if (s.id === id && s.joined) this.send(s, { t: 'xp', n });
      },
      // Fase 7 (redstone): proyectiles que se clavan (diana, botones de madera).
      projectileHit: (kind, bx, by, bz, px, py, pz, fire) => {
        this.redstone?.projectileHit(kind, bx, by, bz, px, py, pz);
        this.mechanisms?.projectileHit(kind, bx, by, bz, !!fire); // Fase 7 (mecanismos): flechas en llamas y dinamita
      },
      // Fase 6 (monstruos): efectos de estado que causan las criaturas (los aplica el cliente).
      // Fase 7 (pociones): las pociones también afectan a los jugadores en creativo (`creativeToo`).
      effectPlayer: (id, effect, seconds, amp, creativeToo) => {
        for (const s of this.sessions.values()) {
          if (s.id !== id || !s.joined || (s.mode === 'c' && !creativeToo) || s.s & STATE_DEAD) continue;
          this.send(s, { t: 'effect', id: effect, s: seconds, a: amp });
        }
      },
    };
  }

  private playerViews(): PlayerView[] {
    const now = this.now();
    const out: PlayerView[] = [];
    for (const s of this.sessions.values()) {
      if (!s.joined) continue;
      out.push({
        id: s.id, name: s.name, x: s.p[0], y: s.p[1], z: s.p[2], alive: !(s.s & STATE_DEAD), creative: s.mode === 'c',
        lookingAt: s.lookUntil > now ? s.lookAt : -1, held: s.h,
        head: s.a[0], // Fase 6.5 (colecciones)
        ...potionView(s), // Fase 7 (pociones): invisible, armadura, efectos y vida
      });
    }
    return out;
  }

  private worldTime(): number {
    return worldTimeAt(this.time, this.now());
  }

  private fx(kind: string, x: number, y: number, z: number, a?: number, b?: number): void {
    // Fase 7 (efectos): toda campana que suena (tocada o con redstone) pasa por aquí.
    if (kind === 'bell') this.bells?.ring(x, y, z);
    if (kind === 'note') this.allays?.heardNote(x, y, z); // Fase 7.5 (mansión): los alays lo oyen
    const msg: ServerMsg = { t: 'fx', k: kind, p: [r2(x), r2(y), r2(z)] };
    if (a !== undefined) msg.a = a;
    if (b !== undefined) msg.b = b;
    const data = JSON.stringify(msg);
    for (const s of this.sessions.values()) {
      if (!s.joined) continue;
      const dx = s.p[0] - x, dz = s.p[2] - z;
      if (dx * dx + dz * dz < 64 * 64) this.sendRaw(s, data);
    }
  }

  // ------------------------------------------------------------------ envío

  private sendRaw(s: Session, data: string | ArrayBuffer): void {
    try {
      s.conn.send(data);
    } catch {
      /* conexión cerrada */
    }
  }

  private send(s: Session, msg: ServerMsg): void {
    this.sendRaw(s, JSON.stringify(msg));
  }

  private broadcast(msg: ServerMsg, except?: Session): void {
    const data = JSON.stringify(msg);
    for (const s of this.sessions.values()) if (s.joined && s !== except) this.sendRaw(s, data);
  }

  private info(s: Session): PlayerInfo {
    return { id: s.id, name: s.name, shirt: s.shirt, p: s.p, r: s.r, s: s.s, h: s.h, o: s.o, a: s.a, ...(s.g ? { g: s.g } : {}), ...handPotions(s) }; // Fase 7: g
  }

  /** Envía las ediciones pendientes respetando el orden en que se aplicaron. */
  private flushQueue(): void {
    const q = this.queue;
    if (q.length === 0) return;
    this.queue = [];
    let batch: number[] = [];
    const sendBatch = () => {
      if (batch.length) this.broadcast({ t: 'sets', l: batch });
      batch = [];
    };
    for (const [x, y, z, b, who] of q) {
      if (who) {
        sendBatch();
        this.broadcast({ t: 'set', id: who, x, y, z, b });
      } else batch.push(x, y, z, b);
    }
    sendBatch();
  }

  // ------------------------------------------------------------------ conexiones

  connect(conn: Conn): void {
    const now = this.now();
    this.sessions.set(conn, {
      conn, id: (this.nextSessionId++).toString(36) + Math.random().toString(36).slice(2, 7), joined: false,
      joinedAt: now, lastMsg: now, name: '', shirt: '#3a7bd5', p: [0, 100, 0], r: [0, 0], s: 0, h: 0, o: 0, a: [0, 0, 0, 0], mode: 's',
      lookAt: -1, lookUntil: 0, lastAttack: 0, tokens: 60, tokenTime: now, known: new Map(), container: null,
      save: null, saveDirty: false, sleeping: null, sleepTicks: 0, bed: null,
    });
  }

  disconnect(conn: Conn): void {
    const s = this.sessions.get(conn);
    if (!s) return;
    this.sessions.delete(conn);
    if (!s.joined) return;
    this.trading.onLeave(s); // Fase 6 (aldeanos)
    this.containers.close(s); // Fase 7 (redstone): deja de mirar el cofre trampa
    this.savePlayer(s);
    this.broadcast({ t: 'leave', id: s.id });
    this.riding.onLeave(s); // Fase 6 (monturas)
    this.raids.onLeave(s); // Fase 6 (asaltos)
    this.leashes.onLeave(s); // Fase 6.5 (remate)
    this.transport.onLeave(s); // Fase 7 (transporte)
    this.broadcast({ t: 'chat', id: null, name: '', m: `${s.name} salió del mundo.` });
    if (this.playerCount === 0) this.flush(true);
  }

  message(conn: Conn, data: string | ArrayBuffer): void {
    const s = this.sessions.get(conn);
    if (!s || typeof data !== 'string' || data.length > MAX_MESSAGE) return;
    let msg: ClientMsg;
    try {
      const parsed: unknown = JSON.parse(data);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return;
      msg = parsed as ClientMsg;
    } catch {
      return;
    }
    s.lastMsg = this.now();
    try {
      this.handle(s, msg);
    } catch (err) {
      console.error('Error procesando mensaje', err);
    }
    this.redstone.flush(); // Fase 7 (redstone): la redstone reacciona en el acto a lo que hizo el jugador
    this.flushQueue();
  }

  private allow(s: Session, cost: number): boolean {
    if (this.local) return true;
    const now = this.now();
    s.tokens = Math.min(80, s.tokens + ((now - s.tokenTime) / 1000) * 40);
    s.tokenTime = now;
    if (s.tokens < cost) return false;
    s.tokens -= cost;
    return true;
  }

  /** Reparte cada mensaje a su sistema. */
  private handle(s: Session, msg: ClientMsg): void {
    if (msg.t === 'hello') {
      this.onHello(s, msg);
      return;
    }
    if (msg.t === 'ping') {
      this.send(s, { t: 'pong', c: Number(msg.c) || 0, now: this.now() });
      return;
    }
    if (!s.joined) return;
    switch (msg.t) {
      case 'pos':
        if (this.allow(s, 0.2)) this.onPos(s, msg);
        break;
      case 'set':
        this.edits.onSet(s, msg);
        break;
      case 'place':
        this.edits.onPlace(s, msg);
        break;
      case 'use':
        if (this.allow(s, 1)) this.edits.onUse(s, msg);
        break;
      case 'wake':
        this.beds.wake(s);
        break;
      case 'interact':
        if (this.allow(s, 1)) this.farming.onInteract(s, msg);
        break;
      case 'trample': {
        const x = Number(msg.x), y = Number(msg.y), z = Number(msg.z);
        if ([x, y, z].every(Number.isInteger) && this.allow(s, 1) && this.reachOk(s, x, y, z, 3)) this.farming.trample(x, y, z);
        break;
      }
      case 'chat':
        this.onChat(s, msg.m);
        break;
      case 'swing':
        if (this.allow(s, 0.5)) this.broadcast({ t: 'swing', id: s.id }, s);
        break;
      case 'attack':
        // Fase 6.5 (decoración): los golpes a cuadros y marcos los atiende su sistema.
        if (this.allow(s, 1) && !this.hangings.onAttack(s, Number(msg.e)) && !this.stands.onAttack(s, Number(msg.e)) &&
          !this.transport.onAttack(s, Number(msg.e), Number(msg.item))) this.actions.onAttack(s, msg); // Fase 7: barcas y vagonetas
        break;
      case 'pickup':
        if (this.allow(s, 0.5)) this.actions.onPickup(s, Number(msg.e));
        break;
      case 'drop':
        this.actions.onDrop(s, msg);
        break;
      case 'shoot':
        if (this.allow(s, 3)) this.actions.onShoot(s, msg);
        break;
      case 'throw':
        // Fase 6.5 (equipo): el tridente y los cohetes los lanza su sistema.
        if (this.allow(s, 1) && !this.equipment.onThrow(s, msg)) this.actions.onThrow(s, msg);
        break;
      case 'fish':
        if (this.allow(s, 1)) this.fishing.onFish(s, msg);
        break;
      case 'sign':
        if (this.allow(s, 2)) this.signs.onSign(s, msg);
        break;
      case 'open':
        if (this.allow(s, 1)) this.containers.onOpen(s, msg);
        break;
      case 'close':
        this.containers.close(s); // Fase 7 (redstone): los cofres trampa cuentan quién mira
        break;
      case 'cclick':
      case 'cput':
      case 'ctake':
        this.containers.onOp(s, msg);
        break;
      case 'look':
        if (Number.isInteger(msg.e) && this.allow(s, 0.2)) {
          s.lookAt = msg.e;
          s.lookUntil = this.now() + 700;
        }
        break;
      case 'state':
        if (this.allow(s, 2)) this.onState(s, msg.d);
        break;
      case 'dropxp': {
        // Al morir: n entero 1..100 (7 por nivel, como mucho 100), junto al jugador ya muerto.
        const n = Number(msg.n);
        const p = Array.isArray(msg.p) && msg.p.length === 3 ? msg.p.map(Number) : [];
        if (!Number.isInteger(n) || n < 1 || n > 100 || p.length !== 3 || !p.every(Number.isFinite)) break;
        if (!(s.s & STATE_DEAD) || s.mode === 'c' || Math.hypot(p[0] - s.p[0], p[1] - s.p[1], p[2] - s.p[2]) > 4) break;
        if (this.allow(s, 5)) this.entities.xp.playerDrop(s.id, n, p[0], p[1], p[2], this.now());
        break;
      }
      // Fase 6 (aldeanos): comercio.
      case 'topen':
        if (this.allow(s, 1)) this.trading.onOpen(s, msg);
        break;
      case 'trade':
        this.trading.onTrade(s, msg);
        break;
      case 'tclose':
        this.trading.onClose(s);
        break;
      case 'died':
        this.raids.onDeath(s); // Fase 6 (asaltos): se pierde el presagio
        if (typeof msg.m === 'string' && this.allow(s, 5)) {
          const m = msg.m.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 80);
          if (m) this.broadcast({ t: 'chat', id: null, name: '', m: `☠ ${s.name} ${m}.` });
        }
        break;
      // Fase 6 (asaltos)
      case 'omen':
        if (this.allow(s, 1)) this.raids.onOmen(s, msg.a);
        break;
      // Fase 6 (monturas)
      case 'mount':
        if (this.allow(s, 1)) {
          this.transport.leave(s.id); // Fase 7 (transporte)
          this.riding.onMount(s, msg);
        }
        break;
      case 'dismount':
        this.riding.dismount(s.id);
        break;
      case 'mpos':
        if (this.allow(s, 0.2)) this.riding.onMove(s, msg);
        break;
      // Fase 6.5 (decoración): colgar cuadros y marcos, y usar un marco.
      case 'hang':
        if (this.allow(s, 1)) this.hangings.onHang(s, msg);
        break;
      case 'frame':
        if (this.allow(s, 1)) this.hangings.onFrame(s, msg);
        break;
      case 'stand': // Fase 6.5 (remate)
        if (this.allow(s, 1)) this.stands.onPlace(s, msg);
        break;
      case 'leash': // Fase 6.5 (remate)
        if (this.allow(s, 1)) this.leashes.onFence(s, msg);
        break;
      case 'shelf': // Fase 6.5 (remate)
        if (this.allow(s, 1)) this.shelves.onShelf(s, msg);
        break;
      case 'lectern': // Fase 6.5 (libros y estandartes)
        if (this.allow(s, 1)) this.lecterns.onLectern(s, msg);
        break;
      case 'jukebox': // Fase 6.5 (colecciones)
        if (this.allow(s, 1)) this.collections.onJukebox(s, msg);
        break;
      case 'ignite': // Fase 6.5 (equipo)
        if (this.allow(s, 1)) this.equipment.onIgnite(s, msg);
        break;
      case 'horn':
        if (this.allow(s, 1)) this.equipment.onHorn(s, msg);
        break;
      case 'boost':
        if (this.allow(s, 1)) this.equipment.onBoost(s, msg);
        break;
      // Fase 7 (transporte): poner, subirse, bajarse y mover la que lleva el jugador.
      case 'vplace':
        if (this.allow(s, 1)) this.transport.onPlace(s, msg);
        break;
      case 'vride':
        if (this.allow(s, 1)) this.transport.onRide(s, msg);
        break;
      case 'vleave':
        this.transport.leave(s.id);
        break;
      case 'vpos':
        if (this.allow(s, 0.2)) this.transport.onMove(s, msg);
        break;
      // Fase 7 (encantamientos)
      case 'work':
        if (this.allow(s, 2)) this.enchantWork.onWork(s, msg);
        break;
      case 'frost':
        if (this.allow(s, 0.2)) this.enchantWork.onFrost(s, msg);
        break;
    }
  }

  // ------------------------------------------------------------------ jugadores

  private onHello(s: Session, msg: Extract<ClientMsg, { t: 'hello' }>): void {
    if (s.joined) return;
    if (msg.v !== PROTOCOL_VERSION) {
      this.send(s, { t: 'error', m: 'Versión del juego desactualizada: recarga la página.' });
      s.conn.close(4000, 'version');
      return;
    }
    this.sweepStale(true);
    const name = sanitizeName(msg.name);
    // Mismo nombre conectado: la conexión nueva sustituye a la antigua (p. ej. tras un corte).
    for (const other of this.sessions.values()) {
      if (other !== s && other.joined && other.name.toLowerCase() === name.toLowerCase()) {
        this.send(other, { t: 'error', m: 'Has entrado con este nombre desde otra ventana.' });
        this.disconnect(other.conn);
        try {
          other.conn.close(4005, 'replaced');
        } catch {
          /* ya cerrada */
        }
      }
    }
    if (this.playerCount >= MAX_PLAYERS) {
      this.send(s, { t: 'error', m: `La sala está llena (máximo ${MAX_PLAYERS} jugadores).` });
      s.conn.close(4001, 'full');
      return;
    }
    if (!this.defaultMode) {
      this.defaultMode = msg.mode === 'c' ? 'c' : 's';
      this.store.setMeta('mode', this.defaultMode);
    }
    s.name = name;
    s.shirt = sanitizeColor(msg.shirt);
    const rec = this.loadRecord(name);
    s.mode = rec?.mode ?? this.defaultMode;
    s.save = rec?.save ?? null;
    const bed = rec?.bed;
    s.bed = Array.isArray(bed) && bed.length === 3 && bed.every(Number.isInteger) ? bed : null;
    if (s.save?.pos && s.save.pos.every(Number.isFinite)) s.p = [s.save.pos[0], s.save.pos[1], s.save.pos[2]];
    s.joined = true;
    s.joinedAt = this.now();
    if (!this.spawnPoint) {
      const sp = this.world.gen.findSpawn();
      this.spawnPoint = [sp.x, sp.y, sp.z];
    }
    const edits = this.world.allEdits();
    const players: PlayerInfo[] = [];
    for (const o of this.sessions.values()) if (o.joined && o !== s) players.push(this.info(o));
    this.send(s, {
      t: 'welcome', id: s.id, seed: this.seed, time: this.time, now: this.now(), players, editCount: edits.length,
      mode: s.mode, diff: this.difficulty, save: s.save, spawn: this.spawnPoint, bed: s.bed, rods: this.fishing.active(),
      signs: this.signs.all(),
      banners: this.banners.all(), // Fase 6.5 (libros y estandartes)
    });
    this.sendRaw(s, encodeEdits(edits));
    this.broadcast({ t: 'join', p: this.info(s) }, s);
    this.riding.onJoin(s); // Fase 6 (monturas): quién va montado
    this.collections.onJoin(s); // Fase 6.5 (colecciones): los tocadiscos que están sonando
    this.transport.onJoin(s); // Fase 7 (transporte): quién va en cada barca o vagoneta
  }

  private loadRecord(name: string): PlayerRecord | null {
    const raw = this.store.loadPlayer(name.toLowerCase());
    if (!raw) return null;
    try {
      const r = JSON.parse(raw) as PlayerRecord;
      if (r.mode !== 's' && r.mode !== 'c') r.mode = this.defaultMode ?? 's';
      return r;
    } catch {
      return null;
    }
  }

  private savePlayer(s: Session): void {
    if (!s.joined) return;
    const rec: PlayerRecord = { mode: s.mode, save: s.save, bed: s.bed };
    this.store.savePlayer(s.name.toLowerCase(), JSON.stringify(rec));
    s.saveDirty = false;
  }

  private onPos(s: Session, msg: Extract<ClientMsg, { t: 'pos' }>): void {
    if (!Array.isArray(msg.p) || !Array.isArray(msg.r) || msg.p.length !== 3 || msg.r.length !== 2) return;
    const p = msg.p.map(Number);
    const r = msg.r.map(Number);
    if (!p.every(Number.isFinite) || !r.every(Number.isFinite)) return;
    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
    const TAU = Math.PI * 2;
    const yaw = ((r[0] % TAU) + TAU) % TAU;
    s.p = [r2(clamp(p[0], -WORLD_LIMIT, WORLD_LIMIT)), r2(clamp(p[1], VOID_Y - 64, 1024)), r2(clamp(p[2], -WORLD_LIMIT, WORLD_LIMIT))];
    s.r = [Math.round(yaw * 1000) / 1000, Math.round(clamp(r[1], -Math.PI / 2, Math.PI / 2) * 1000) / 1000];
    s.s = (Number(msg.s) | 0) & (STATE_MASK | STATE_INVISIBLE | STATE_GLOWING); // Fase 7 (pociones y efectos): invisible y brillo
    s.ec = effectColorFrom(msg.ec);
    const h = Number(msg.h), o = Number(msg.o);
    s.h = Number.isInteger(h) && isValidItem(h) ? h : 0;
    s.o = Number.isInteger(o) && isValidItem(o) ? o : 0;
    // Fase 7 (remate): el tipo de poción de cada mano, sólo si lleva una poción o una flecha con efecto.
    s.hp = heldPotionType(s.h, msg.hp);
    s.op = heldPotionType(s.o, msg.op);
    // Armadura visible: cada ranura sólo admite su pieza (cabeza, pecho, piernas, pies); lo demás es 0.
    const a = Array.isArray(msg.a) ? msg.a : [];
    s.a = [0, 1, 2, 3].map((slot) => {
      const id = Number(a[slot]);
      return Number.isInteger(id) && isValidItem(id) && ITEMS[id]?.armor?.slot === slot ? id : 0;
    });
    // Fase 7 (encantamientos): qué brilla (mano, mano secundaria y cada pieza de armadura).
    const g = Number(msg.g);
    s.g = Number.isInteger(g) ? g & 0x3f : 0;
    this.broadcast({ t: 'pos', id: s.id, p: s.p, r: s.r, s: s.s, h: s.h, o: s.o, a: s.a, ...(s.ec ? { ec: s.ec } : {}), ...(s.g ? { g: s.g } : {}), ...handPotions(s) }, s);
  }

  /** Distancia del ojo del jugador al centro del bloque. */
  private reachOk(s: Session, x: number, y: number, z: number, max: number): boolean {
    if (this.local) return true;
    const dx = x + 0.5 - s.p[0], dy = y + 0.5 - (s.p[1] + 1.6), dz = z + 0.5 - s.p[2];
    return dx * dx + dy * dy + dz * dz <= max * max;
  }

  /** Rechaza una edición: devuelve al emisor el bloque real para deshacer su predicción. */
  private reject(s: Session, x: number, y: number, z: number): void {
    const cur = this.world.getBlock(x, y, z);
    if (cur >= 0) this.send(s, { t: 'sets', l: [x, y, z, cur] });
  }

  private onState(s: Session, d: unknown): void {
    if (!d || typeof d !== 'object') return;
    const raw = d as Partial<PlayerSave>;
    const num = (v: unknown, lo: number, hi: number, def: number) => {
      const n = Number(v);
      return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : def;
    };
    const inv: (WireStack | null)[] = [];
    if (Array.isArray(raw.inv)) {
      for (let i = 0; i < Math.min(46, raw.inv.length); i++) {
        const st = sanitizeStack(stackFromWire(raw.inv[i]));
        inv.push(stackToWire(st)); // Fase 6.5: con el contenido de los sacos
      }
    }
    const save: PlayerSave = {
      inv,
      hp: num(raw.hp, 0, MAX_HEALTH_CAP, 20), // Fase 7 (efectos): con Salud mejorada pasa de 20
      food: num(raw.food, 0, 20, 20),
      sat: num(raw.sat, 0, 20, 5),
      air: num(raw.air, 0, 15, 15),
      sel: num(raw.sel, 0, 8, 0) | 0,
      fly: !!raw.fly,
      dead: !!raw.dead,
      xp: Math.floor(num(raw.xp, 0, 10_000_000, 0)),
      abs: num(raw.abs, 0, 20, 0),
    };
    // Fase 7 (encantamientos): semilla de encantamiento (entero de 32 bits).
    const es = Number(raw.es);
    if (Number.isInteger(es)) save.es = es | 0;
    if (Array.isArray(raw.fx)) {
      // Efectos activos: sólo los conocidos, con nivel y duración acotados.
      save.fx = raw.fx.slice(0, 16).flatMap((f) => {
        if (!Array.isArray(f)) return [];
        const [id, amp, secs] = f.map(Number);
        if (!EFFECTS[id] || !Number.isFinite(secs) || secs <= 0) return [];
        return [[id, Math.max(0, Math.min(MAX_EFFECT_AMP, amp | 0)), Math.min(MAX_EFFECT_SECONDS, Math.round(secs * 10) / 10)] as [number, number, number]];
      });
    }
    if (raw.off !== undefined) {
      const st = sanitizeStack(stackFromWire(raw.off));
      save.off = stackToWire(st);
    }
    if (Array.isArray(raw.armor)) {
      // Cada ranura sólo admite su pieza (cabeza, pecho, piernas, pies).
      save.armor = [0, 1, 2, 3].map((slot) => {
        const st = sanitizeStack(stackFromWire(raw.armor![slot]));
        return st && ITEMS[st.id]?.armor?.slot === slot ? stackToWire({ ...st, count: 1 }) : null; // Fase 7: con sus encantamientos
      });
    }
    if (Array.isArray(raw.pos) && raw.pos.length === 3 && raw.pos.map(Number).every(Number.isFinite)) {
      save.pos = [r2(Number(raw.pos[0])), r2(Number(raw.pos[1])), r2(Number(raw.pos[2]))];
    }
    if (Array.isArray(raw.rot) && raw.rot.length === 2 && raw.rot.map(Number).every(Number.isFinite)) {
      save.rot = [r2(Number(raw.rot[0])), r2(Number(raw.rot[1]))];
    }
    s.save = save;
    s.saveDirty = true;
  }

  private onChat(s: Session, raw: unknown): void {
    if (typeof raw !== 'string') return;
    const m = raw.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, MAX_CHAT);
    if (!m || !this.allow(s, 3)) return;
    if (m.startsWith('/')) {
      this.commands.run(s, m);
      return;
    }
    this.broadcast({ t: 'chat', id: s.id, name: s.name, m }, s);
  }

  private setTime(days: number): void {
    if (!Number.isFinite(days)) return;
    this.time = { base: days, at: this.now(), rate: DAY_RATE };
    this.store.setMeta('time', JSON.stringify(this.time));
    this.broadcast({ t: 'time', time: this.time, now: this.now() });
  }

  // ------------------------------------------------------------------ cambios de bloques

  /** Cada cambio de bloque (de quien sea) se difunde y avisa a los sistemas que dependen de él. */
  private onBlockChanged(x: number, y: number, z: number, old: number, id: number): void {
    this.queue.push([x, y, z, id, this.actor]);
    this.fluids.onBlockChanged(this.fluidWorld, x, y, z);
    this.containers.onBlockChanged(x, y, z, old, id);
    this.nature.onBlockChanged(x, y, z, old, id);
    this.beds.onBlockChanged(x, y, z, old, id);
    this.farming.onBlockChanged(x, y, z, old, id);
    this.campfires.onBlockChanged(x, y, z, old, id);
    this.signs.onBlockChanged(x, y, z, old, id);
    this.rules.onBlockChanged(x, y, z, id);
    this.monsters.onBlockChanged(x, y, z, old, id);
    this.golems.onBlockChanged(x, y, z, id); // Fase 6 (gólems/domesticar)
    this.colorBlocks.onBlockChanged(x, y, z, old, id); // Fase 6.5 (colores)
    this.hangings?.onBlockChanged(x, y, z); // Fase 6.5 (decoración)
    this.shelves?.onBlockChanged(x, y, z, old, id); // Fase 6.5 (remate)
    this.stands?.onBlockChanged(x, y, z); // Fase 6.5 (remate)
    this.oceanLife.onBlockChanged(x, y, z, old, id); // Fase 6.5 (océano y plantas)
    this.lecterns?.onBlockChanged(x, y, z, old, id); // Fase 6.5 (libros y estandartes)
    this.banners?.onBlockChanged(x, y, z, old, id);
    this.materials?.onBlockChanged(x, y, z, id); // Fase 6.5 (materiales)
    this.collections?.onBlockChanged(x, y, z, old, id); // Fase 6.5 (colecciones)
    this.fire?.onBlockChanged(x, y, z, old, id); // Fase 6.5 (equipo)
    this.conduits?.onBlockChanged(x, y, z, old, id);
    this.transport?.rails.onBlockChanged(x, y, z); // Fase 7 (transporte): potencia de los raíles
    this.mechanisms?.onBlockChanged(x, y, z, old, id); // Fase 7 (mecanismos)
    this.redstone?.onBlockChanged(x, y, z, old, id); // Fase 7 (redstone)
  }

  // ------------------------------------------------------------------ bucle

  /** Avanza un tick (1/20 s). Llamar a 20 Hz mientras haya jugadores. */
  tick(): void {
    this.tickCount++;
    const now = this.now();
    this.loadChunks(now);
    this.fluids.step(this.fluidWorld);
    this.nature.tick();
    this.entities.tick(DT);
    this.leashes.tick(DT); // Fase 6.5 (remate)
    this.cauldrons.tick(); // Fase 6.5 (calderos)
    this.riding.tick(); // Fase 6 (monturas)
    this.transport.tick(); // Fase 7 (transporte)
    this.beds.tick();
    this.composters.tick();
    this.fishing.tick();
    if (this.tickCount % TICK_RATE === 0) this.spawners.tick();
    if (this.tickCount % TICK_RATE === 0) this.monsters.tick();
    this.storms.tick(DT);
    if (this.tickCount % TICK_RATE === 0) this.trading.tick(1); // Fase 6 (aldeanos)
    if (this.tickCount % TICK_RATE === 0) this.raids.tick(); // Fase 6 (asaltos)
    if (this.tickCount % TICK_RATE === 0) this.collections.tick(); // Fase 6.5 (colecciones)
    if (this.tickCount % TICK_RATE === 0) this.critters.tick(); // Fase 7.5 (fauna)
    this.golems.tick(); // Fase 6 (gólems/domesticar)
    this.oceanLife.tick(); // Fase 6.5 (océano y plantas)
    this.banners.endTick(); // Fase 6.5 (libros y estandartes)
    this.frogspawn.tick(); // Fase 6.5 (materiales)
    this.fire.tick(); // Fase 6.5 (equipo)
    this.conduits.tick();
    this.bells.tick(DT); // Fase 7 (efectos)
    this.equipment.tick();
    this.enchantWork.tick(); // Fase 7 (encantamientos)
    this.redstone.tick(); // Fase 7 (redstone)
    this.mechanisms.tick(); // Fase 7 (mecanismos): después de la redstone (los pulsos cortos llegan antes)
    this.monuments.tick(); // Fase 7.5 (océano)
    this.entitySync.takeRemoved(this.entities.removed);
    this.entities.removed = [];
    if (this.tickCount % 4 === 0) {
      this.containers.tickFurnaces(DT * 4);
      this.campfires.tick(DT * 4);
    }
    this.flushQueue();
    if (this.tickCount % 2 === 0) this.entitySync.sync();
    if (this.tickCount % (TICK_RATE * 5) === 0) this.sweepStale(false);
    if (this.tickCount % this.flushTicks === 0) this.flush(false);
    if (this.tickCount % (TICK_RATE * 10) === 0) {
      this.world.unloadUnused(now, (cx, cz) => this.nearPlayer(cx, cz, SIM_RADIUS + 2));
    }
  }

  private nearPlayer(cx: number, cz: number, r: number): boolean {
    for (const s of this.sessions.values()) {
      if (!s.joined) continue;
      const pcx = Math.floor(s.p[0] / CHUNK_SIZE), pcz = Math.floor(s.p[2] / CHUNK_SIZE);
      if (Math.abs(cx - pcx) <= r && Math.abs(cz - pcz) <= r) return true;
    }
    return false;
  }

  /** Carga los chunks cercanos a los jugadores (los más próximos primero) y los marca en uso. */
  private loadChunks(now: number): void {
    let budget = GEN_PER_TICK;
    for (const s of this.sessions.values()) {
      if (!s.joined) continue;
      const pcx = Math.floor(s.p[0] / CHUNK_SIZE), pcz = Math.floor(s.p[2] / CHUNK_SIZE);
      for (let ring = 0; ring <= SIM_RADIUS; ring++) {
        for (let dz = -ring; dz <= ring; dz++) {
          for (let dx = -ring; dx <= ring; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue;
            const cx = pcx + dx, cz = pcz + dz;
            const c = this.world.getChunk(cx, cz);
            if (c) c.lastUsed = now;
            else if (budget > 0) {
              budget--;
              this.world.ensureChunk(cx, cz, now);
            }
          }
        }
      }
    }
  }

  // ------------------------------------------------------------------ persistencia

  private sweepStale(force: boolean): void {
    if (this.local) return;
    const now = this.now();
    for (const s of [...this.sessions.values()]) {
      if (now - s.lastMsg > STALE_MS || (force && !s.joined && now - s.joinedAt > STALE_MS)) {
        this.disconnect(s.conn);
        try {
          s.conn.close(4002, 'timeout');
        } catch {
          /* ya cerrada */
        }
      }
    }
  }

  /** Guarda lo pendiente: ediciones, contenedores, jugadores y animales. */
  flush(all: boolean): void {
    this.world.flush();
    this.containers.flush(this.store);
    this.campfires.flush(this.store);
    this.signs.flush(this.store);
    this.monsters.flush(this.store);
    this.raids.flush(this.store); // Fase 6 (asaltos)
    this.hangings.flush(this.store); // Fase 6.5 (decoración)
    this.shelves.flush(this.store); // Fase 6.5 (remate)
    this.stands.flush(this.store); // Fase 6.5 (remate)
    this.lecterns.flush(this.store); // Fase 6.5 (libros y estandartes)
    this.banners.flush(this.store);
    this.collections.flush(this.store); // Fase 6.5 (colecciones)
    this.transport.flush(this.store); // Fase 7 (transporte)
    for (const s of this.sessions.values()) if (s.saveDirty) this.savePlayer(s);
    const now = this.now();
    if (all || now - this.lastMobSave > 60_000) {
      this.lastMobSave = now;
      this.store.setMeta('mobs', this.entities.serializePassive());
    }
  }

  /** Para pruebas y depuración. */
  stats(): { chunks: number; entities: number; fluids: number; containers: number; players: number } {
    return {
      chunks: this.world.loadedCount, entities: this.entities.list.size, fluids: this.fluids.pending,
      containers: this.containers.count, players: this.playerCount,
    };
  }
}
