// Fase 7 (mecanismos): pistones (fila, límite de 12, adhesivo, slime y miel, cuasi-conectividad, pulso
// corto), observador, tolvas (entre cofres, horno, bloqueo, comparador), dispensador (flecha, cubo, dinamita),
// soltador, dinamita (mecha, explosión, cadena) y vagonetas con tolva y con dinamita.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AIR, STONE, COBBLESTONE, OBSIDIAN, BEDROCK, DIRT, SAND, WATER, CHEST, FURNACE, REDSTONE_BLOCK, REDSTONE_LAMP, SLIME_BLOCK, HONEY_BLOCK,
  PISTON, STICKY_PISTON, PISTON_HEAD, MOVING_BLOCK, OBSERVER, HOPPER, DISPENSER, DROPPER, TNT, POPPY, stateOf, isPiston,
  pistonExtended, isPistonHead, observerPowered, hopperLocked, dispenserTriggered, facingOf, mechanismSlots, wireState, wirePower,
  COMPARATOR, LEVER, mountedPowered, MOUNT_WALL, REPEATER, RAIL, ACTIVATOR_RAIL, railState, RAIL_EW, RAIL_ACTIVATOR, TORCH,
} from '../src/shared/blocks';
import { EAST, WEST, UP, DOWN, NORTH, SOUTH } from '../src/shared/redstone';
import {
  ITEMS, IRON_INGOT, REDSTONE, QUARTZ, SLIME_BALL, GUNPOWDER, BOW, MINECART, HOPPER_MINECART, TNT_MINECART, ARROW,
  WATER_BUCKET, BUCKET, COAL, IRON_ORE as IRON_ORE_ITEM, DIAMOND, FLINT_AND_STEEL,
} from '../src/shared/items';
import { matchRecipe } from '../src/shared/recipes';
import { planPlacement, type PlaceHit } from '../src/shared/placement';
import { resolvePush } from '../src/shared/pistons';
import { blastResistance, explodedBlocks } from '../src/shared/explosions';
import { ENT_TNT } from '../src/shared/mechanisms';
import { ENT_ITEM, ENT_ARROW } from '../src/shared/mobs';
import { ENT_HOPPER_MINECART, ENT_TNT_MINECART, vehicleContainerPos } from '../src/shared/vehicles';
import { TEXTURE_DEFS } from '../src/shared/textureDefs';
import { makeServer, type Harness, type Client } from './harness';

const craft = (grid: number[]) => matchRecipe(grid, 3)?.out;

interface Lab {
  h: Harness;
  c: Client;
  bx: number;
  by: number;
  bz: number;
  set: (x: number, y: number, z: number, id: number) => void;
  get: (x: number, y: number, z: number) => number;
}

/** Servidor con un solar de piedra despejado en y = 160 alrededor de (bx, bz). */
function lab(seed = 4242): Lab {
  const h = makeServer(seed);
  const c = h.join('Ingeniera', 'c');
  const [sx, , sz] = c.welcome.spawn as [number, number, number];
  const bx = Math.floor(sx), by = 160, bz = Math.floor(sz);
  c.pos(bx + 0.5, by + 30, bz + 0.5);
  h.tick(60);
  const W = h.gs.world;
  for (let dx = -24; dx <= 24; dx++) {
    for (let dz = -24; dz <= 24; dz++) {
      W.setBlock(bx + dx, by - 1, bz + dz, STONE);
      for (let y = by; y < by + 8; y++) W.setBlock(bx + dx, y, bz + dz, AIR);
    }
  }
  h.tick(2);
  return { h, c, bx, by, bz, set: (x, y, z, id) => void W.setBlock(x, y, z, id), get: (x, y, z) => W.getBlock(x, y, z) };
}

test('pistón: empuja una fila, se recoge y no pasa de 12 bloques', () => {
  const { h, bx, by, bz, set, get } = lab();
  const x = bx - 10, z = bz;
  set(x, by, z, stateOf(PISTON, { facing: EAST }));
  for (let i = 1; i <= 3; i++) set(x + i, by, z, COBBLESTONE);
  h.tick(2);
  set(x, by, z - 1, REDSTONE_BLOCK);
  h.tick(1);
  assert.ok(pistonExtended(get(x, by, z)), 'se extiende al momento');
  assert.equal(get(x + 1, by, z), MOVING_BLOCK, 'la cabeza se está moviendo');
  h.tick(3);
  assert.ok(isPistonHead(get(x + 1, by, z)), 'cabeza puesta');
  assert.deepEqual([get(x + 2, by, z), get(x + 3, by, z), get(x + 4, by, z)], [COBBLESTONE, COBBLESTONE, COBBLESTONE]);
  set(x, by, z - 1, AIR);
  h.tick(4);
  assert.ok(isPiston(get(x, by, z)) && !pistonExtended(get(x, by, z)), 'recogido');
  assert.equal(get(x + 1, by, z), AIR, 'sin cabeza');
  assert.equal(get(x + 2, by, z), COBBLESTONE, 'el normal no tira');
  // 12 bloques sí; 13, no.
  const z2 = bz + 3;
  set(x, by, z2, stateOf(PISTON, { facing: EAST }));
  for (let i = 1; i <= 12; i++) set(x + i, by, z2, DIRT);
  set(x, by, z2 - 1, REDSTONE_BLOCK);
  h.tick(4);
  assert.ok(pistonExtended(get(x, by, z2)), 'con 12 se extiende');
  assert.equal(get(x + 13, by, z2), DIRT);
  const z3 = bz + 6;
  set(x, by, z3, stateOf(PISTON, { facing: EAST }));
  for (let i = 1; i <= 13; i++) set(x + i, by, z3, DIRT);
  set(x, by, z3 - 1, REDSTONE_BLOCK);
  h.tick(4);
  assert.ok(!pistonExtended(get(x, by, z3)), 'con 13 no');
  // Obsidiana y lecho de roca no se mueven; lo que se rompe, suelta su objeto.
  const z4 = bz + 9;
  set(x, by, z4, stateOf(PISTON, { facing: EAST }));
  set(x + 1, by, z4, OBSIDIAN);
  set(x, by, z4 - 1, REDSTONE_BLOCK);
  h.tick(4);
  assert.ok(!pistonExtended(get(x, by, z4)), 'la obsidiana no se mueve');
  const z5 = bz + 12;
  set(x, by, z5, stateOf(PISTON, { facing: EAST }));
  set(x + 1, by, z5, POPPY);
  set(x, by, z5 - 1, REDSTONE_BLOCK);
  h.tick(4);
  assert.ok(pistonExtended(get(x, by, z5)), 'la flor no lo impide');
  const drops = [...h.gs.entities.list.values()].filter((e) => e.type === ENT_ITEM && e.stack?.id === POPPY);
  assert.equal(drops.length, 1, 'la flor se rompe y cae');
  void BEDROCK;
});
