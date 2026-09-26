// Fase 8.4 (estructuras del Nether): la fortaleza portada de NetherFortressPieces (piezas, topes, alturas, lo que
// dibuja cada chunk y su botín), la verruga del Nether plantada, el generador de blazes y los monstruos de la
// fortaleza (su lista manda dentro de sus piezas).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fortressPieces } from '../src/shared/world/netherFortress';
import { locateNetherStructure, inFortressPiece, complexStart, NETHER_COMPLEXES, NETHER_STRUCTURE_NAMES } from '../src/shared/world/netherStructures';
import { NetherGenerator } from '../src/shared/world/nether';
import {
  NETHER_BRICKS, MOB_SPAWNER, SOUL_SAND, STONE, NETHER_WART_CROP, NETHER_WART_MAX_AGE, AIR, NETHERRACK, BLOCKS,
} from '../src/shared/blocks';
import { NETHER_WART, ITEMS } from '../src/shared/items';
import { LOOT_TABLES, rollLoot } from '../src/shared/loot';
import { FORTRESS_ENEMIES, MOB_BLAZE, MOB_MAGMA_CUBE } from '../src/shared/netherMobs';
import { planPlacement } from '../src/shared/placement';
import { blockDrops } from '../src/shared/sim/drops';
import { blockIndex } from '../src/shared/constants';
import { DIM_NETHER } from '../src/shared/dimensions';
import { makeServer } from './harness';
import { mulberry32 } from '../src/shared/world/noise';

test('fortaleza: piezas como en Java (inicio, topes por tipo, sin choques, entre y = 48 y 70)', () => {
  for (let seed = 1; seed <= 25; seed++) {
    const pieces = fortressPieces(seed, 3, -2);
    assert.equal(pieces[0].kind, 'bridge_crossing', 'empieza con un cruce de puentes');
    assert.deepEqual([pieces[0].box.x0 - pieces[0].box.x1, pieces[0].box.z0 - pieces[0].box.z1], [-18, -18]);
    const count = (k: string) => pieces.filter((p) => p.kind === k).length;
    assert.ok(count('bridge_crossing') <= 5 && count('room_crossing') <= 4 && count('stairs_room') <= 3, 'topes de los puentes');
    assert.ok(count('monster_throne') <= 2 && count('castle_entrance') <= 1, 'dos tronos y una entrada como mucho');
    assert.ok(count('castle_corridor_crossing') <= 5 && count('castle_t_balcony') <= 2 && count('castle_stalk_room') <= 2, 'topes del castillo');
    assert.ok(Math.min(...pieces.map((p) => p.box.y0)) >= 48 && Math.min(...pieces.map((p) => p.box.y0)) <= 70, 'movida entre y = 48 y 70');
    for (let i = 0; i < pieces.length; i++) {
      for (let j = i + 1; j < pieces.length; j++) assert.ok(!pieces[i].box.intersects(pieces[j].box), `sin choques: ${pieces[i].kind} y ${pieces[j].kind}`);
      const b = pieces[i].box;
      assert.ok(Math.abs(b.x0 - pieces[0].box.x0) <= 112 + 19 && Math.abs(b.z0 - pieces[0].box.z0) <= 112 + 19, 'a menos de 112 del inicio');
    }
  }
  // Determinista.
  assert.deepEqual(fortressPieces(7, 0, 0).map((p) => [p.kind, p.box.x0, p.box.y0, p.box.z0]), fortressPieces(7, 0, 0).map((p) => [p.kind, p.box.x0, p.box.y0, p.box.z0]));
});

test('fortaleza: se genera en el Nether con sus ladrillos, tronos con generador, cofres y verrugas', () => {
  const gen = new NetherGenerator(12345);
  const f = locateNetherStructure(gen, 'fortress', 0, 0, 20);
  assert.ok(f, 'hay una fortaleza cerca');
  let bricks = 0, spawners = 0, warts = 0, onSoul = 0;
  const tables = new Set<string>();
  const cx0 = Math.floor(f![0] / 16), cz0 = Math.floor(f![2] / 16);
  for (let dz = -8; dz <= 8; dz++) {
    for (let dx = -8; dx <= 8; dx++) {
      const r = gen.generate(cx0 + dx, cz0 + dz);
      for (const c of r.chests) tables.add(c.table);
      const b = r.blocks;
      for (let i = 0; i < b.length; i++) {
        if (b[i] === NETHER_BRICKS) bricks++;
        else if (b[i] === MOB_SPAWNER) spawners++;
        else if (b[i] >= NETHER_WART_CROP && b[i] <= NETHER_WART_CROP + NETHER_WART_MAX_AGE) {
          warts++;
          if (b[i - 256] === SOUL_SAND) onSoul++;
        }
      }
    }
  }
  assert.ok(bricks > 10000, `ladrillos del Nether: ${bricks}`);
  assert.ok(spawners >= 1 && spawners <= 2, `generadores en los tronos: ${spawners}`);
  assert.ok(warts === 0 || onSoul === warts, 'las verrugas, sobre arena de alma');
  assert.ok([...tables].every((t) => t === 'nether_bridge'), 'cofres con el botín de la fortaleza');
  assert.equal(NETHER_STRUCTURE_NAMES.fortress, 'Fortaleza del Nether');
  // Dentro de una pieza manda la lista de la fortaleza; lejos, no.
  const s = complexStart(gen, Math.floor(cx0 / NETHER_COMPLEXES.spacing), Math.floor(cz0 / NETHER_COMPLEXES.spacing))!;
  const b = s.fortress![3].box;
  assert.ok(inFortressPiece(gen, (b.x0 + b.x1) >> 1, (b.y0 + b.y1) >> 1, (b.z0 + b.z1) >> 1), 'dentro de una pieza');
  assert.ok(!inFortressPiece(gen, f![0] + 2000, 60, f![2] + 2000), 'lejos, no');
});

test('fortaleza: botín (nether_bridge) y monstruos (FORTRESS_ENEMIES) de la 26.3', () => {
  const t = LOOT_TABLES.nether_bridge;
  assert.deepEqual(t.rolls, [2, 4]);
  assert.equal(t.entries.reduce((s, e) => s + e[1], 0), 78 - 5, 'pesos de Java sin la armadura de cobre para caballo (fase 9)');
  const r = mulberry32(3);
  for (let i = 0; i < 50; i++) {
    const out = rollLoot(t, r);
    assert.ok(out.length >= 1 && out.every((s) => ITEMS[s.id] || BLOCKS[s.id]));
  }
  assert.deepEqual(FORTRESS_ENEMIES.map((e) => [e[1], e[2], e[3]]), [[10, 2, 3], [5, 4, 4], [8, 5, 5], [2, 5, 5], [3, 4, 4]]);
});

test('verruga del Nether: se planta sólo en arena de alma, crece sola hasta la edad 3 y madura suelta 2–4', () => {
  const world: Record<string, number> = { '0,4,0': SOUL_SAND, '2,4,0': STONE };
  const get = (x: number, y: number, z: number) => world[`${x},${y},${z}`] ?? AIR;
  assert.equal(ITEMS[NETHER_WART].block, NETHER_WART_CROP, 'la verruga se planta');
  assert.deepEqual(planPlacement(get, { x: 0, y: 4, z: 0, nx: 0, ny: 1, nz: 0, px: 0.5, py: 5, pz: 0.5, id: SOUL_SAND }, NETHER_WART_CROP, 0), [[0, 5, 0, NETHER_WART_CROP]]);
  assert.equal(planPlacement(get, { x: 2, y: 4, z: 0, nx: 0, ny: 1, nz: 0, px: 2.5, py: 5, pz: 0.5, id: STONE }, NETHER_WART_CROP, 0), null, 'en piedra, no');
  const r = mulberry32(9);
  assert.deepEqual(blockDrops(NETHER_WART_CROP, 0, r), [{ id: NETHER_WART, count: 1 }]);
  for (let i = 0; i < 30; i++) {
    const d = blockDrops(NETHER_WART_CROP + NETHER_WART_MAX_AGE, 0, r);
    assert.ok(d[0].id === NETHER_WART && d[0].count >= 2 && d[0].count <= 4);
  }
  // Crece con los ticks aleatorios (una de cada diez veces), también a oscuras.
  const h = makeServer(8401, undefined, DIM_NETHER);
  const W = h.gs.world;
  W.ensureChunk(0, 0);
  W.setBlock(4, 60, 4, SOUL_SAND);
  W.setBlock(4, 61, 4, NETHER_WART_CROP);
  for (let y = 62; y < 66; y++) W.setBlock(4, y, 4, NETHERRACK);
  const nature = h.gs.sys.nature as { randomTickAt(x: number, y: number, z: number): void };
  for (let i = 0; i < 200; i++) nature.randomTickAt(4, 61, 4);
  assert.equal(W.getBlock(4, 61, 4), NETHER_WART_CROP + NETHER_WART_MAX_AGE, 'madura');
});

test('generador del trono: blazes entre ladrillos del Nether (con luz), cubos de magma en otro sitio', () => {
  const h = makeServer(8402, undefined, DIM_NETHER);
  const W = h.gs.world;
  W.ensureChunk(0, 0);
  const sp = h.gs.sys.spawners as { mobOf(x: number, y: number, z: number): number };
  W.setBlock(5, 64, 5, MOB_SPAWNER);
  W.setBlock(5, 63, 5, NETHER_BRICKS);
  assert.equal(sp.mobOf(5, 64, 5), MOB_BLAZE);
  W.setBlock(9, 64, 9, MOB_SPAWNER);
  W.setBlock(9, 63, 9, NETHERRACK);
  assert.equal(sp.mobOf(9, 64, 9), MOB_MAGMA_CUBE);
  void blockIndex;
});
