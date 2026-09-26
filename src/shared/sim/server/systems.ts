// Los sistemas del servidor: los crea, los conecta entre sí y reparte lo que les toca a todos (cada
// cambio de bloque, cada tick, el guardado y la entrada y salida de jugadores). GameServer sólo
// orquesta (conexiones, mensajes, bucle y guardado); cada tema vive en su sistema de esta carpeta y
// cada sistema sólo ve un ServerContext.
//
// Los enganches entre sistemas van por puntos con nombre (ver hooks.ts): los rayos (`storms.strikes`),
// el clic derecho sobre entidades (`farming.interactions`), lo que enciende un bloque (`fire.igniters`)…
import { thunderAt } from '../../weather';
import { discOfItem } from '../../collections';
import { DT, TICK_RATE, type ServerContext, type Session } from './context';
import type { ServerStore } from '../store';
import { BlockRules } from './blockRules';
import { Nature } from './nature';
import { TurtleEggs } from './turtleEggs';
import { BambooGrowth } from './bamboo';
import { Spawners } from './spawners';
import { Storms } from './storms';
import { Farming } from './farming';
import { Beds } from './beds';
import { Composters } from './composters';
import { Fishing } from './fishing';
import { Campfires } from './campfires';
import { Signs } from './signs';
import { ContainerSystem } from './containerSystem';
import { BlockEdits } from './blockEdits';
import { PlayerActions } from './playerActions';
import { Commands } from './commands';
import { EntitySync } from './entitySync';
import { Riding } from './riding';
import { Trading } from './trading';
import { Monsters } from './monsters';
import { Golems } from './golems';
import { Raids } from './raids';
import { ColorBlocks } from './colorBlocks';
import { Copper } from './copper';
import { Hangings } from './hangings';
import { Shelves } from './shelves';
import { Cauldrons } from './cauldrons';
import { Leashes } from './leashes';
import { ArmorStands } from './armorStands';
import { OceanLife } from './oceanLife';
import { Lecterns } from './lecterns';
import { Banners } from './banners';
import { Materials } from './materials';
import { Frogspawn } from './frogspawn';
import { Collections } from './collections';
import { Fire } from './fire';
import { Conduits } from './conduits';
import { Equipment } from './equipment';
import { Transport } from './vehicles';
import { EnchantWork } from './enchantWork';
import { Redstone } from './redstone';
import { Mechanisms } from './mechanisms';
import { BellResonance } from './bellResonance';
import { DeepDark } from './deepDark';
import { OceanMonuments } from './monuments';
import { CritterWorld } from './critterWorld';
import { Allays } from './allays';
import { Portals } from './portals';

export class ServerSystems {
  readonly rules: BlockRules;
  readonly nature: Nature;
  readonly turtleEggs: TurtleEggs; // Fase 6 (acuáticos)
  readonly bamboo: BambooGrowth; // Fase 6.5 (maderas)
  readonly beds: Beds;
  readonly containers: ContainerSystem;
  readonly spawners: Spawners;
  readonly storms: Storms;
  readonly farming: Farming;
  readonly composters: Composters;
  readonly fishing: Fishing;
  readonly campfires: Campfires;
  readonly signs: Signs;
  readonly edits: BlockEdits;
  readonly actions: PlayerActions;
  readonly commands: Commands;
  readonly entitySync: EntitySync;
  /** Fase 6 (monturas): quién monta qué. */
  readonly riding: Riding;
  /** Fase 6 (aldeanos): comercio y aldeanos de las aldeas nuevas. */
  readonly trading: Trading;
  /** Fase 6 (monstruos): insomnio y phantoms, bloques infestados. */
  readonly monsters: Monsters;
  /** Fase 6 (gólems/domesticar): construir gólems y poblar las aldeas. */
  readonly golems: Golems;
  /** Fase 6 (asaltos): puestos, patrullas, Mal presagio y asaltos. */
  readonly raids: Raids;
  /** Fase 6.5 (colores): hormigón en polvo que se endurece en el agua. */
  readonly colorBlocks: ColorBlocks;
  /** Fase 6.5 (océano y plantas): corales, algas, esponjas, bayas dulces y plantaformas. */
  readonly oceanLife: OceanLife;
  /** Fase 6.5 (cobre): oxidación, cera, raspado y rayos. */
  readonly copper: Copper;
  /** Fase 6.5 (decoración): cuadros y marcos colgados. */
  readonly hangings: Hangings;
  /** Fase 6.5 (remate): libros de las estanterías cinceladas. */
  readonly shelves: Shelves;
  /** Fase 6.5 (calderos): calderos con agua, lava o nieve polvo. */
  readonly cauldrons: Cauldrons;
  /** Fase 6.5 (remate): etiquetas y correas. */
  readonly leashes: Leashes;
  /** Fase 6.5 (remate): soportes para armadura. */
  readonly stands: ArmorStands;
  /** Fase 6.5 (libros y estandartes): libros de los atriles y capas de los estandartes. */
  readonly lecterns: Lecterns;
  readonly banners: Banners;
  /** Fase 6.5 (materiales): suelos, tartas con vela y caminos; cría de las ranas. */
  readonly materials: Materials;
  readonly frogspawn: Frogspawn;
  /** Fase 6.5 (colecciones): tocadiscos y creepers cargados. */
  readonly collections: Collections;
  /** Fase 6.5 (equipo): fuego, conductos y el equipo de los jugadores (mechero, tridente, cohetes…). */
  readonly fire: Fire;
  readonly conduits: Conduits;
  readonly equipment: Equipment;
  /** Fase 7 (efectos): la campana hace brillar a los saqueadores. */
  readonly bells: BellResonance;
  /** Fase 7 (transporte): barcas, vagonetas y raíles. */
  readonly transport: Transport;
  /** Fase 7 (encantamientos): mesa, yunque, afiladora, yunques que caen, Paso helado y Conductividad. */
  readonly enchantWork: EnchantWork;
  /** Fase 7 (redstone): potencia, componentes y ticks programados. */
  readonly redstone: Redstone;
  /** Fase 7 (mecanismos): pistones, observadores, tolvas, dispensadores, soltadores y dinamita. */
  readonly mechanisms: Mechanisms;
  /** Fase 7.5 (abismo): vibraciones, sculk, chilladores, warden y la brújula de recuperación. */
  readonly deepDark: DeepDark;
  /** Fase 7.5 (océano): criaturas de estructura, guardianes de los monumentos y maldición del anciano. */
  readonly monuments: OceanMonuments;
  /** Fase 7.5 (fauna): trampa del rayo, llamas del comerciante y cabañas de bruja. */
  readonly critters: CritterWorld;
  /** Fase 7.5 (mansión): alays (bloques musicales, tocadiscos y objetos). */
  readonly allays: Allays;
  /** Fase 8 (dimensiones): portales del Nether (encender, romper, cruzar y llegar). */
  readonly portals: Portals;

  constructor(private ctx: ServerContext, store: ServerStore) {
    const { world, entities } = ctx;
    this.rules = new BlockRules(ctx);
    this.nature = new Nature(ctx);
    this.farming = new Farming(ctx, this.nature);
    this.turtleEggs = new TurtleEggs(ctx, this.nature);
    this.bamboo = new BambooGrowth(ctx, this.nature);
    this.beds = new Beds(ctx);
    this.containers = new ContainerSystem(ctx, store);
    world.onLoot = (chests) => this.containers.fillLoot(chests);
    this.spawners = new Spawners(ctx);
    this.storms = new Storms(ctx);
    this.composters = new Composters(ctx);
    this.fishing = new Fishing(ctx);
    this.campfires = new Campfires(ctx, store);
    this.signs = new Signs(ctx, store);
    this.edits = new BlockEdits(ctx, this.rules, this.farming, this.beds, this.composters, this.campfires);
    this.actions = new PlayerActions(ctx);
    this.commands = new Commands(ctx);
    this.entitySync = new EntitySync(ctx);
    this.riding = new Riding(ctx);
    this.trading = new Trading(ctx);
    world.onVillagers = (v) => this.trading.spawnVillagers(v);
    this.monsters = new Monsters(ctx, store);
    this.golems = new Golems(ctx, store);
    this.raids = new Raids(ctx, store);
    this.trading.heroOf = (name) => this.raids.isHero(name);
    this.commands.raids = this.raids;
    this.commands.lightning = (x, y, z) => this.storms.strike(x, y, z);
    this.colorBlocks = new ColorBlocks(ctx);
    this.oceanLife = new OceanLife(ctx, this.nature, this.rules);
    this.farming.extraFertilize = (x, y, z) => this.oceanLife.fertilize(x, y, z);
    this.edits.extraUse = (s, x, y, z, id) => this.oceanLife.useBlock(s, x, y, z, id);
    this.copper = new Copper(ctx, this.nature, this.rules);
    this.edits.copper = this.copper;
    this.hangings = new Hangings(ctx, store);
    this.shelves = new Shelves(ctx, store);
    this.cauldrons = new Cauldrons(ctx, this.nature);
    this.edits.cauldrons = (s, x, y, z, id, item) => this.cauldrons.use(s, x, y, z, id, item);
    this.leashes = new Leashes(ctx);
    this.stands = new ArmorStands(ctx, store);
    // Atriles y estandartes con dibujos. El estandarte roto suelta su objeto con las capas (lo suelte
    // quien lo suelte: el jugador, la falta de apoyo, una explosión…).
    this.lecterns = new Lecterns(ctx, store);
    this.banners = new Banners(ctx, store);
    this.edits.placed = (s, msg, edits) => this.banners.onPlaced(s, msg, edits);
    entities.decorateDrops = (stacks, x, y, z) => this.banners.decorateDrops(stacks, x, y, z);
    this.materials = new Materials(ctx);
    this.edits.materials = (s, x, y, z, id, item, h) => this.materials.useBlock(s, x, y, z, id, item, h);
    this.frogspawn = new Frogspawn(ctx, this.nature);
    this.collections = new Collections(ctx, store);
    this.fire = new Fire(ctx, this.nature);
    this.conduits = new Conduits(ctx, this.nature);
    this.bells = new BellResonance(ctx);
    this.equipment = new Equipment(ctx, this.fire, this.riding);
    this.transport = new Transport(ctx, store, this.riding);
    this.containers.virtual = {
      container: (x, y, z, s) => this.transport.container(x, y, z, s),
      changed: () => this.transport.containerChanged(),
    };
    this.transport.leash = (s, e, msg) => this.leashes.onInteract(s, e, msg); // Fase 7 (remate): barcas atadas
    this.enchantWork = new EnchantWork(ctx, this.nature);
    entities.fallingLanded = (e) => this.enchantWork.fallingLanded(e);
    entities.gearShots.lightning = (x, y, z) => this.storms.strike(x, y, z);
    entities.gearShots.thundering = () => thunderAt(ctx.worldTime(), ctx.seed) > 0;
    // La redstone: el motor, lo que lee de otros sistemas y los avisos que le llegan de ellos.
    const rs = (this.redstone = new Redstone(ctx, this.nature));
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
    world.onChunkLoaded = (c) => rs.onChunkLoaded(c);
    this.storms.redirect = (x, y, z) => rs.lightningTarget(x, y, z);
    this.edits.redstone = (x, y, z, id) => rs.use(x, y, z, id);
    this.edits.touched = (x, y, z) => rs.touch(x, y, z);
    this.edits.beforeBreak = (x, y, z, id, tool) => rs.beforeBreak(x, y, z, id, tool);
    this.transport.rails.railPowered = (x, y, z) => rs.isPowered(x, y, z);
    // El detector (checkPressed de Java): tras cambiar avisa a sus vecinos y a los del bloque de debajo.
    this.transport.rails.detectorOutput = (x, y, z) => {
      rs.updateNeighbors(x, y, z);
      rs.updateNeighbors(x, y - 1, z);
    };
    for (const c of world.loadedChunks()) rs.onChunkLoaded(c);
    // Los mecanismos: lo que usan (contenedores, fuego, transporte…) y los avisos que les llegan.
    const mech = (this.mechanisms = new Mechanisms({
      ctx, redstone: rs, rules: this.rules, containers: this.containers, composters: this.composters,
      collections: this.collections, shelves: this.shelves, transport: this.transport, fire: this.fire, stands: this.stands,
      fertilize: (x, y, z) => this.farming.fertilize(x, y, z),
    }));
    this.fire.igniters.add((x, y, z) => mech.light(x, y, z));
    this.fire.burned = (x, y, z) => mech.light(x, y, z);
    this.deepDark = new DeepDark(ctx, store, rs);
    // Un solo camino para las criaturas de estructura (guardianes, illagers de la mansión, alays presos):
    // las hace aparecer con persist; lo propio de cada especie (el alay) lo pone Entities.spawnMob.
    this.monuments = new OceanMonuments(ctx);
    world.onStructureMobs = (m) => this.monuments.spawnStructureMobs(m);
    this.critters = new CritterWorld(ctx, this.storms, this.trading);
    this.allays = new Allays(ctx, this.collections);
    this.portals = new Portals(ctx, store);

    // Cada rayo: el cobre se desoxida, carga creepers, prende fuego, la redstone (pararrayos) y vibra.
    this.storms.strikes.add((x, y, z) => this.copper.lightning(Math.floor(x), Math.floor(y) - 1, Math.floor(z)));
    this.storms.strikes.add((x, y, z) => this.collections.lightning(x, y, z));
    this.storms.strikes.add((x, y, z) => this.fire.lightning(x, y, z));
    this.storms.strikes.add((x, y, z) => rs.lightning(x, y, z));
    this.storms.strikes.add((x, y, z) => this.deepDark.lightning(x, y, z));
    // Clic derecho sobre una entidad: el primero que lo atiende (si ninguno, la propia entidad).
    this.farming.interactions.add((s, e, msg) => this.allays.onInteract(s, e, msg));
    this.farming.interactions.add((s, e, msg) => this.transport.onInteract(s, e, msg));
    this.farming.interactions.add((s, e, msg) => this.equipment.onInteract(s, e, msg));
    this.farming.interactions.add((s, e, msg) => this.stands.onInteract(s, e, msg));
    this.farming.interactions.add((s, e, msg) => this.leashes.onInteract(s, e, msg));
  }

  /** Cada cambio de bloque (de quien sea) avisa a los sistemas que dependen de él. */
  blockChanged(x: number, y: number, z: number, old: number, id: number, actor: string | null): void {
    // Con ?.: los primeros cambios pueden llegar mientras aún se crean los sistemas.
    this.containers?.onBlockChanged(x, y, z, old, id);
    this.nature?.onBlockChanged(x, y, z, old, id);
    this.beds?.onBlockChanged(x, y, z, old, id);
    this.farming?.onBlockChanged(x, y, z, old, id);
    this.campfires?.onBlockChanged(x, y, z, old, id);
    this.signs?.onBlockChanged(x, y, z, old, id);
    this.rules?.onBlockChanged(x, y, z, id);
    this.monsters?.onBlockChanged(x, y, z, old, id);
    this.golems?.onBlockChanged(x, y, z, id);
    this.colorBlocks?.onBlockChanged(x, y, z, old, id);
    this.hangings?.onBlockChanged(x, y, z);
    this.shelves?.onBlockChanged(x, y, z, old, id);
    this.stands?.onBlockChanged(x, y, z);
    this.oceanLife?.onBlockChanged(x, y, z, old, id);
    this.lecterns?.onBlockChanged(x, y, z, old, id);
    this.banners?.onBlockChanged(x, y, z, old, id);
    this.materials?.onBlockChanged(x, y, z, id);
    this.collections?.onBlockChanged(x, y, z, old, id);
    this.fire?.onBlockChanged(x, y, z, old, id);
    this.conduits?.onBlockChanged(x, y, z, old, id);
    this.transport?.rails.onBlockChanged(x, y, z); // potencia de los raíles
    this.mechanisms?.onBlockChanged(x, y, z, old, id);
    this.redstone?.onBlockChanged(x, y, z, old, id);
    this.deepDark?.onBlockChanged(x, y, z, old, id, actor); // vibraciones y venas de sculk
    this.portals?.onBlockChanged(x, y, z, old, id); // Fase 8: el fuego en un marco enciende el portal
  }

  /** Un efecto (sonido y partículas) que se difunde: algunos sistemas lo oyen. */
  heard(kind: string, x: number, y: number, z: number, a?: number): void {
    if (kind === 'bell') this.bells?.ring(x, y, z); // toda campana que suena (tocada o con redstone)
    this.deepDark?.onFx(kind, x, y, z, a); // explosiones, notas, campanas… vibran
    if (kind === 'note') this.allays?.heardNote(x, y, z); // los alays lo oyen
  }

  /**
   * Un tick de todos los sistemas (sin la carga de chunks, los ticks programados de la redstone ni los fluidos,
   * que van antes). Auditoría de la redstone: en el orden de las fases de Java: ticks aleatorios → eventos de
   * bloque → entidades → entidades de bloque.
   */
  tick(tickCount: number): void {
    const ctx = this.ctx;
    const second = tickCount % TICK_RATE === 0;
    this.nature.tick();
    this.redstone.runBlockEvents();
    this.redstone.handlingTick = false;
    ctx.entities.tick(DT);
    this.leashes.tick(DT);
    this.cauldrons.tick();
    this.riding.tick();
    this.transport.tick();
    this.beds.tick();
    this.composters.tick();
    this.fishing.tick();
    if (second) {
      this.spawners.tick();
      this.monsters.tick();
    }
    this.storms.tick(DT);
    if (second) {
      this.trading.tick(1);
      this.raids.tick();
      this.collections.tick();
      this.critters.tick();
    }
    this.golems.tick();
    this.oceanLife.tick();
    this.banners.endTick();
    this.frogspawn.tick();
    this.fire.tick();
    this.conduits.tick();
    this.bells.tick(DT);
    this.equipment.tick();
    this.enchantWork.tick();
    this.redstone.entityPhase(); // placas, cuerda y mena pisadas
    this.redstone.blockEntityPhase(); // sensores de luz solar
    this.mechanisms.tick(); // bloques en movimiento, tolvas y vagonetas con dinamita
    this.deepDark.tick();
    this.monuments.tick();
    this.portals.tick(); // Fase 8
    this.entitySync.takeRemoved(ctx.entities.removed);
    ctx.entities.removed = [];
    if (tickCount % 4 === 0) {
      this.containers.tickFurnaces(DT * 4);
      this.campfires.tick(DT * 4);
    }
  }

  /** Un jugador acaba de entrar: lo que tiene que saber y no va en la bienvenida. */
  onJoin(s: Session): void {
    this.riding.onJoin(s); // quién va montado
    this.collections.onJoin(s); // los tocadiscos que están sonando
    this.transport.onJoin(s); // quién va en cada barca o vagoneta
    this.deepDark.onJoin(s); // su última muerte (brújula de recuperación)
  }

  /** Un jugador se va: soltar lo que tenía abierto, montado o atado. */
  onLeave(s: Session): void {
    this.trading.onLeave(s);
    this.containers.close(s); // deja de mirar el cofre trampa
    this.riding.onLeave(s);
    this.raids.onLeave(s);
    this.leashes.onLeave(s);
    this.transport.onLeave(s);
    this.portals.onLeave(s);
  }

  /** Un jugador ha muerto (lo avisa su cliente). */
  onDied(s: Session): void {
    this.raids.onDeath(s); // se pierde el presagio
    this.deepDark.onDied(s); // brújula de recuperación
  }

  /** Guarda lo pendiente de cada sistema. */
  flush(store: ServerStore): void {
    this.containers.flush(store);
    this.campfires.flush(store);
    this.signs.flush(store);
    this.monsters.flush(store);
    this.raids.flush(store);
    this.hangings.flush(store);
    this.shelves.flush(store);
    this.stands.flush(store);
    this.lecterns.flush(store);
    this.banners.flush(store);
    this.collections.flush(store);
    this.transport.flush(store);
    this.deepDark.flush(store);
    this.portals.flush(store);
  }
}
