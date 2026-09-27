// Fase 8.6 (el End): el End como dimensión (terreno, biomas, coro) y las fortalezas con el portal del End (piezas,
// anillos, botín, marcos y ojos de ender, perla de ender y endermita).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AIR, STONE, STONE_BRICKS, MOSSY_STONE_BRICKS, CRACKED_STONE_BRICKS, END_STONE, END_PORTAL_FRAME, END_PORTAL, CHORUS_PLANT, CHORUS_FLOWER, stateOf, stateProps, isEndPortalFrame,
} from '../src/shared/blocks';
import { ENDER_EYE, ENDER_PEARL, BLAZE_POWDER, itemSpriteIndex, SPAWN_EGGS, CREATIVE_ITEMS } from '../src/shared/items';
import { MOBS, MOB_ENDERMITE } from '../src/shared/mobs';
import { matchRecipe } from '../src/shared/recipes';
import { LOOT_TABLES, rollLoot } from '../src/shared/loot';
import { mulberry32 } from '../src/shared/world/noise';
import { strongholdPieces, strongholdsNear, locateStronghold, STRONGHOLD_RINGS } from '../src/shared/world/stronghold';
import { TerrainGenerator } from '../src/shared/world/terrain';
import { EndGenerator, END_SPAWN } from '../src/shared/world/end';
import { BIOME_THE_END, isEndBiome } from '../src/shared/world/biomeIds';
import { blockIndex } from '../src/shared/constants';
import { makeServer } from './harness';

test('el End: la isla central, el vacío, la plataforma de llegada y las plantas de coro en las tierras altas', () => {
  const gen = new EndGenerator(8601);
  assert.equal(gen.biomeAt(0, 0), BIOME_THE_END);
  // La isla central: piedra del End en el centro; a 300 bloques, vacío (los chunks cercanos al centro).
  assert.ok(gen.surfaceAt(0, 0) > 40, 'la isla central tiene suelo');
  assert.equal(gen.surfaceAt(300, 0), -1, 'entre la isla central y las exteriores, vacío');
  // La plataforma de obsidiana donde se llega, con aire encima.
  const [px, py, pz] = END_SPAWN;
  const c = gen.generate(px >> 4, pz >> 4);
  assert.equal(c.blocks[blockIndex(px & 15, py, pz & 15)], AIR);
  assert.notEqual(c.blocks[blockIndex(px & 15, py - 1, pz & 15)], AIR);
  // Plantas de coro en las tierras altas de las islas exteriores.
  let chorus = 0, stone = 0;
  for (let cz = 60; cz < 72 && chorus === 0; cz++) {
    for (let cx = 60; cx < 72; cx++) {
      assert.ok(isEndBiome(gen.biomeAt(cx * 16, cz * 16)));
      for (const b of gen.generate(cx, cz).blocks) {
        if (b === CHORUS_PLANT || (b >= CHORUS_FLOWER && b < CHORUS_FLOWER + 6)) chorus++;
        else if (b === END_STONE) stone++;
      }
    }
  }
  assert.ok(stone > 0 && chorus > 0, `islas exteriores con coro (${stone} piedra, ${chorus} coro)`);
});

test('fortalezas: siempre con sala del portal, enterradas, en anillos y con su botín', () => {
  for (let s = 0; s < 30; s++) {
    const pieces = strongholdPieces(9000 + s, 5, 7);
    assert.equal(pieces[0].kind, 'start');
    assert.equal(pieces.filter((p) => p.kind === 'portal_room').length, 1, 'una sala del portal');
    assert.ok(pieces.filter((p) => p.kind === 'library').length <= 2 && pieces.filter((p) => p.kind === 'prison_hall').length <= 5);
    // Enterrada por debajo del nivel del mar (moveBelowSeaLevel: 10 por debajo) y sin salirse del mundo.
    const top = Math.max(...pieces.map((p) => p.box.y1)), bottom = Math.min(...pieces.map((p) => p.box.y0));
    assert.ok(top <= 53 && bottom >= -64, `entre y = ${bottom} y ${top}`);
    // Las piezas no se solapan (salvo los tramos de relleno, que entran en la pared de la pieza con la que chocan).
    const solid = pieces.filter((p) => p.kind !== 'filler_corridor');
    for (let i = 0; i < solid.length; i++) for (let j = i + 1; j < solid.length; j++) assert.ok(!solid[i].box.intersects(solid[j].box));
    // La sala del portal, a más de 5 de hondura; las bibliotecas, a más de 4.
    for (const p of pieces) {
      if (p.kind === 'portal_room') assert.ok(p.depth > 5);
      if (p.kind === 'library') assert.ok(p.depth > 4);
    }
  }
  // El primer anillo: tres fortalezas a unos 128 chunks (± 40) del origen.
  const gen = new TerrainGenerator(8602);
  const at = locateStronghold(gen, 0, 0)!;
  const d = Math.hypot(at[0], at[2]) / 16;
  assert.ok(d > 128 - 40 - 8 && d < 128 + 40 + 8, `la más cercana, a ${d.toFixed(0)} chunks`);
  assert.equal(STRONGHOLD_RINGS.count, 128);
  const near = strongholdsNear(gen, at[0], at[2], at[0], at[2]);
  assert.equal(near.length, 1);
  // Al generar su chunk de partida sale la escalera de ladrillos de piedra.
  const c = gen.generate(at[0] >> 4, at[2] >> 4);
  let bricks = 0;
  for (const b of c.blocks) if (b === STONE_BRICKS || b === MOSSY_STONE_BRICKS || b === CRACKED_STONE_BRICKS) bricks++;
  assert.ok(bricks > 20, `escalera de entrada (${bricks} ladrillos)`);
  // Botín: pasillo (perlas de ender, diamantes…), almacén y biblioteca (libros y papel).
  const r = mulberry32(3);
  const got = new Set<number>();
  for (let i = 0; i < 300; i++) for (const s of rollLoot(LOOT_TABLES.stronghold_corridor, r)) got.add(s.id);
  assert.ok(got.has(ENDER_PEARL));
  for (const t of ['stronghold_crossing', 'stronghold_library']) assert.ok(rollLoot(LOOT_TABLES[t], r).length > 0);
});

test('ojo de ender: receta, sprite; el huevo de la endermita', () => {
  assert.equal(matchRecipe([BLAZE_POWDER, ENDER_PEARL, 0, 0, 0, 0, 0, 0, 0], 3)?.out.id, ENDER_EYE);
  assert.ok(itemSpriteIndex(ENDER_EYE) >= 0 && CREATIVE_ITEMS.includes(ENDER_EYE));
  assert.ok(SPAWN_EGGS.endermite && MOBS[MOB_ENDERMITE].key === 'endermite');
  assert.ok(MOBS[MOB_ENDERMITE].health === 8 && MOBS[MOB_ENDERMITE].damage === 2);
});

test('marcos del portal del End: el ojo se engasta y con los doce mirando hacia dentro se abre el portal', () => {
  const h = makeServer(8603);
  const W = h.gs.world;
  const c = h.join('ana');
  W.ensureChunk(0, 0, h.clock.now);
  const y = 60;
  for (let x = 0; x <= 6; x++) for (let z = 0; z <= 6; z++) {
    W.setBlock(x, y - 1, z, STONE);
    for (let yy = y; yy < y + 3; yy++) W.setBlock(x, yy, z, AIR);
  }
  // El anillo alrededor del hueco (2..4, 2..4): cada lado mira hacia el centro (0 norte, 1 este, 2 sur, 3 oeste).
  const frames: [number, number, number][] = [];
  for (let i = 2; i <= 4; i++) {
    frames.push([i, 1, 2], [i, 5, 0], [1, i, 1], [5, i, 3]);
  }
  for (const [x, z, f] of frames) W.setBlock(x, y, z, stateOf(END_PORTAL_FRAME, { facing: f, eye: 0 }));
  c.pos(3.5, y, 3.5);
  for (const [x, z] of frames.slice(0, 11)) c.send({ t: 'use', x, y, z, yaw: 0, item: ENDER_EYE });
  assert.equal(W.getBlock(3, y, 3), AIR, 'con once ojos, aún no');
  assert.equal(stateProps(W.getBlock(frames[0][0], y, frames[0][1]))?.eye, 1);
  // El marco con ojo no admite otro (y otros objetos no hacen nada).
  const [lx, lz] = frames[11];
  c.send({ t: 'use', x: lx, y, z: lz, yaw: 0, item: STONE });
  assert.equal(stateProps(W.getBlock(lx, y, lz))?.eye, 0);
  c.send({ t: 'use', x: lx, y, z: lz, yaw: 0, item: ENDER_EYE });
  for (let x = 2; x <= 4; x++) for (let z = 2; z <= 4; z++) assert.equal(W.getBlock(x, y, z), END_PORTAL, `portal en ${x},${z}`);
  assert.ok(isEndPortalFrame(W.getBlock(lx, y, lz)));
});

test('ojo de ender lanzado vuela hacia la fortaleza; la perla lleva a su dueño a donde cae', () => {
  const h = makeServer(8604);
  const W = h.gs.world;
  const c = h.join('ana');
  W.ensureChunk(0, 0, h.clock.now);
  for (let x = 0; x <= 3; x++) for (let z = 0; z <= 12; z++) {
    W.setBlock(x, 99, z, STONE);
    for (let y = 100; y < 110; y++) W.setBlock(x, y, z, AIR);
  }
  W.setBlock(0, 100, 10, STONE);
  W.setBlock(0, 101, 10, STONE);
  c.pos(0.5, 100, 0.5);
  c.send({ t: 'throw', p: [0.5, 101.6, 0.5], d: [0, 0, -1], item: ENDER_EYE });
  const eye = [...h.gs.entities.list.values()].find((e) => e.stack?.id === ENDER_EYE);
  assert.ok(eye?.eyeTarget, 'sale un ojo con destino');
  const target = locateStronghold(h.gs.world.gen, 0, 0)!;
  const want = Math.atan2(target[2], target[0]), got = Math.atan2(eye!.eyeTarget![2] - 0.5, eye!.eyeTarget![0] - 0.5);
  assert.ok(Math.abs(want - got) < 0.05, 'apunta hacia la fortaleza');
  h.tick(40);
  assert.ok(eye!.y > 101, 'sube');
  h.tick(60);
  assert.ok(!h.gs.entities.list.has(eye!.id), 'a los 80 ticks cae o se rompe');
  // La perla choca con la columna a 10 bloques y su dueño aparece allí.
  c.conn.take('moveTo');
  c.send({ t: 'throw', p: [0.5, 100.8, 0.8], d: [0, 0, 1], item: ENDER_PEARL });
  h.tick(20);
  const moved = c.conn.take('moveTo');
  assert.equal(moved.length, 1, 'la perla lo mueve');
  assert.ok(moved[0].p[2] > 8 && moved[0].p[2] < 10.2, `junto a la columna: ${JSON.stringify(moved[0].p)}`);
});
