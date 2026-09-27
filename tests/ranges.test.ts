// Alcance de los ataques a distancia como en Java: el creeper mide en 3D (no se hincha con el jugador 10 bloques por
// encima) y la bruja lanza sus pociones a 0,75 bloques por tick, que no llegan 10 bloques hacia arriba.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STONE, AIR } from '../src/shared/blocks';
import { MOB_CREEPER, MOB_WITCH, ENT_THROWN } from '../src/shared/mobs';
import { makeServer } from './harness';

test('alcance: ni el creeper ni la poción de la bruja alcanzan a quien está 10 bloques más arriba; de cerca, sí', () => {
  const h = makeServer(1010);
  const W = h.gs.world;
  const c = h.join('ana');
  c.pos(8.5, 111, 8.5);
  h.tick(5);
  W.ensureChunk(0, 0, h.clock.now);
  for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) for (let y = 99; y < 125; y++) W.setBlock(x, y, z, y === 99 ? STONE : AIR);
  W.setBlock(8, 109, 8, STONE); // el jugador, de pie sobre un bloque 10 más arriba
  const ents = h.gs.entities;
  const creeper = ents.spawnMob(MOB_CREEPER, 8.5, 100, 8.5)!;
  const witch = ents.spawnMob(MOB_WITCH, 10.5, 100, 8.5)!;
  c.pos(8.5, 110, 8.5);
  c.conn.take('hurt');
  c.conn.take('effect');
  h.tick(200);
  assert.equal(creeper.ai!.fuse, 0, 'el creeper no se hincha con el jugador 10 bloques encima');
  assert.ok(ents.list.has(creeper.id));
  assert.equal(c.conn.take('hurt').length + c.conn.take('effect').length, 0, 'ninguna poción de la bruja le llega a 10 de altura');
  void witch;
  void ENT_THROWN;
  // De cerca (a su altura), el creeper sí se hincha.
  c.pos(10.5, 100, 8.5);
  h.tick(10);
  assert.ok(creeper.ai!.fuse > 0 || !ents.list.has(creeper.id), 'de cerca, se hincha');
});
