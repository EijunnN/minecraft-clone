// Fase 7 (mecanismos): los mecanismos del servidor juntos (lo que GameServer crea y avisa).
// - Pistones (pistons.ts), tolvas (hoppers.ts), dispensadores y soltadores (dispensers.ts), dinamita y
//   explosiones (tnt.ts) y las vagonetas con tolva y con dinamita (mechanismCarts.ts).
// - Observadores (aquí): cuando cambia el bloque que vigila su cara (cualquier cambio de estado, también un
//   bloque que empieza o termina de moverse), a los 2 ticks dan un pulso de 2 ticks por detrás.
// Se enganchan a la redstone con su API (docs/redstone.md): no tocan el motor.
import { OBSERVER, TNT, isObserver, observerPowered, observerWith, facingOf } from '../../blocks';
import { registerRedstone, FACE_X, FACE_Y, FACE_Z } from '../../redstone';
import { Pistons } from './pistons';
import { Hoppers } from './hoppers';
import { Dispensers } from './dispensers';
import { Explosives } from './tnt';
import { Inventories } from './inventories';
import { bindCarts } from './mechanismCarts';
import type { Redstone } from './redstone';
import type { BlockRules } from './blockRules';
import type { ContainerSystem } from './containerSystem';
import type { Composters } from './composters';
import type { Collections } from './collections';
import type { Shelves } from './shelves';
import type { Transport } from './vehicles';
import type { Fire } from './fire';
import type { ArmorStands } from './armorStands';
import type { ServerContext } from './context';

/** Duración del pulso del observador y su retardo (2 ticks de juego). */
const OBSERVER_TICKS = 2;

registerRedstone(OBSERVER, {
  // Pulso: se enciende y a los 2 ticks se apaga.
  tick: (api, x, y, z, id) => {
    if (observerPowered(id)) api.setBlock(x, y, z, observerWith(id, false));
    else {
      api.setBlock(x, y, z, observerWith(id, true));
      api.schedule(x, y, z, OBSERVER_TICKS);
    }
  },
  // Guardado encendido: que se apague.
  changed: (api, x, y, z, old, id) => {
    if (old < 0 && observerPowered(id)) api.schedule(x, y, z, 1);
  },
});

export interface MechanismDeps {
  ctx: ServerContext;
  redstone: Redstone;
  rules: BlockRules;
  containers: ContainerSystem;
  composters: Composters;
  collections: Collections;
  shelves: Shelves;
  transport: Transport;
  fire: Fire;
  stands: ArmorStands;
  /** Polvo de hueso sobre el bloque (x, y, z) (el de la granja). */
  fertilize(x: number, y: number, z: number): boolean;
}

export class Mechanisms {
  readonly inventories: Inventories;
  readonly pistons: Pistons;
  readonly hoppers: Hoppers;
  readonly explosives: Explosives;
  readonly dispensers: Dispensers;

  constructor(private d: MechanismDeps) {
    const { ctx, redstone } = d;
    this.inventories = new Inventories(ctx, d.containers, d.composters, d.collections, d.shelves);
    this.pistons = new Pistons(ctx, redstone, d.rules);
    // Lo que se mueve no se pierde: se guarda ya asentado y, si el chunk se descarga, se asienta antes.
    ctx.world.savedInstead = () => this.pistons.settledCells();
    ctx.world.onChunkUnload = (c) => this.pistons.settleChunk(c.cx, c.cz);
    this.hoppers = new Hoppers(ctx, redstone, this.inventories);
    this.explosives = new Explosives(ctx, redstone, d.transport);
    this.dispensers = new Dispensers(ctx, redstone, this.inventories, this.explosives, d.fire, d.transport, d.stands, { fertilize: d.fertilize });
    bindCarts(d.transport, { inv: this.inventories, containers: d.containers, tnt: this.explosives });
    this.pistons.vehicleBody = (id) => {
      const v = d.transport.vehicleOf(id);
      return v?.cart ?? v?.boat;
    };
  }

  /** Cada cambio de bloque: pistones (base y cabeza) y observadores que lo vigilan. */
  onBlockChanged(x: number, y: number, z: number, old: number, id: number): void {
    this.pistons.onBlockChanged(x, y, z, old, id);
    if (old === id) return;
    const w = this.d.ctx.world, rs = this.d.redstone;
    for (let f = 0; f < 6; f++) {
      const ox = x + FACE_X[f], oy = y + FACE_Y[f], oz = z + FACE_Z[f];
      const o = w.getBlock(ox, oy, oz);
      // Un observador al lado cuya cara mira a este bloque.
      if (!isObserver(o) || facingOf(o) !== (f ^ 1) || observerPowered(o) || rs.isScheduled(ox, oy, oz)) continue;
      rs.schedule(ox, oy, oz, OBSERVER_TICKS);
    }
  }

  /** Cada tick (después de la redstone): se asienta lo que movieron los pistones y explotan las vagonetas. */
  tick(): void {
    this.pistons.tick();
    this.explosives.tick();
  }

  /** Un proyectil se clavó en (bx, by, bz): una flecha en llamas enciende la dinamita. */
  projectileHit(kind: string, bx: number, by: number, bz: number, fire: boolean): void {
    if (kind === 'arrow' && fire && this.d.ctx.world.getBlock(bx, by, bz) === TNT) this.explosives.prime(bx, by, bz);
  }

  /** El mechero (o el fuego) alcanza el bloque (x, y, z): si es dinamita, se enciende. */
  light(x: number, y: number, z: number): boolean {
    return this.d.ctx.world.getBlock(x, y, z) === TNT && this.explosives.prime(x, y, z);
  }
}
