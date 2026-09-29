// Programa lunar: las cintas en el servidor: bloques con sentido y forma, transporte de punta a punta, carga lateral, lo que sueltan
// al romperse, lo que se manda a los jugadores y lo que se guarda.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AIR, STONE, CHEST, BELTS, INSERTERS, SOLAR_PANEL, POLE_SMALL, POLE_MEDIUM, ELECTRIC_SMELTER, beltState, beltInfo, isBelt, isGhostBlock } from '../src/shared/blocks';
import { IRON_INGOT, COAL } from '../src/shared/items';
import { ENT_ITEM } from '../src/shared/mobs';
import { planPlacement, type PlaceHit } from '../src/shared/placement';
import { lookDir, dirYaw, isOrientable, marchDir } from '../src/shared/logisticsPlacement';
import { MemoryStore } from '../src/shared/sim/store';
import { makeServer } from './harness';
import { putMulti } from './multi';

function lab() {
  const h = makeServer(4243);
  const c = h.join('Ingeniera', 'c');
  const [sx, , sz] = c.welcome.spawn as [number, number, number];
  const bx = Math.floor(sx), by = 160, bz = Math.floor(sz);
  c.pos(bx + 0.5, by + 30, bz + 0.5);
  h.tick(60);
  const W = h.gs.world;
  for (let dx = -20; dx <= 20; dx++) {
    for (let dz = -20; dz <= 20; dz++) {
      W.setBlock(bx + dx, by - 1, bz + dz, STONE);
      for (let y = by; y < by + 6; y++) W.setBlock(bx + dx, y, bz + dz, AIR);
    }
  }
  h.tick(2);
  return { h, c, bx, by, bz, W, belts: () => h.gs.sys.belts, set: (x: number, y: number, z: number, id: number) => void W.setBlock(x, y, z, id) };
}

test('cintas: estados (nivel, sentido y forma) y colocación hacia donde mira el jugador', () => {
  for (let tier = 0; tier < 2; tier++) {
    for (let dir = 0; dir < 4; dir++) {
      for (let shape = 0; shape < 3; shape++) {
        assert.deepEqual(beltInfo(beltState(tier, dir, shape)), { tier, dir, shape });
      }
    }
  }
  assert.ok(isBelt(BELTS[0]) && !isBelt(STONE));
  // Mirando a −z (yaw 0) la cinta avanza hacia −z (sentido 3); yaw −π/2 mira a +x (sentido 0).
  assert.equal(lookDir(0), 3);
  assert.equal(lookDir(-Math.PI / 2), 0);
  assert.equal(lookDir(Math.PI), 1);
  assert.equal(lookDir(Math.PI / 2), 2);
  // R fija el sentido: la mirada que se manda al servidor da justo ese sentido, y sólo cintas y brazos se pueden girar.
  for (let d = 0; d < 4; d++) assert.equal(lookDir(dirYaw(d)), d);
  assert.ok(isOrientable(BELTS[1]) && isOrientable(INSERTERS[0]) && !isOrientable(STONE) && !isOrientable(CHEST));
  assert.equal(marchDir(beltState(1, 2, 0)), 2);
  assert.equal(marchDir(STONE), -1);
  assert.ok(isGhostBlock(BELTS[0]) && isGhostBlock(SOLAR_PANEL) && isGhostBlock(ELECTRIC_SMELTER) && !isGhostBlock(STONE));
  const get = (x: number, y: number, z: number) => (y === 63 ? STONE : AIR);
  const hit = { x: 0, y: 63, z: 0, nx: 0, ny: 1, nz: 0, px: 0.5, py: 64, pz: 0.5, id: STONE } as PlaceHit;
  const edits = planPlacement(get, hit, BELTS[1], -Math.PI / 2, 0);
  assert.ok(edits && edits.length === 1 && beltInfo(edits[0][3])?.tier === 1 && beltInfo(edits[0][3])?.dir === 0, 'la rápida, hacia +x');
});

test('cintas: un objeto va de un extremo al otro de una fila y se queda al final', () => {
  const { h, bx, by, bz, set, belts } = lab();
  for (let i = 0; i < 6; i++) set(bx + i, by, bz, beltState(0, 0, 0));
  h.tick(2);
  assert.equal(belts().count, 6);
  assert.ok(belts().put(bx, by, bz, 1, 0.1, { id: IRON_INGOT, count: 1 }));
  h.tick(20 * 5);
  const last = belts().at(bx + 5, by, bz)!;
  assert.equal(last.lanes[1].length, 1, 'llegó a la última, por el mismo carril');
  assert.ok(belts().peek(bx + 5, by, bz, (s) => s.id === IRON_INGOT));
  const taken = belts().take(bx + 5, by, bz);
  assert.equal(taken?.id, IRON_INGOT);
  assert.equal(belts().peek(bx + 5, by, bz), false);
});

test('cintas: al torcer, el bloque de la esquina se vuelve curva y los objetos siguen por sus carriles', () => {
  const { h, bx, by, bz, set, belts, W } = lab();
  // Va a +x en (0..2), y gira a +z en (2, 1..3): la esquina es (2, 0).
  for (let i = 0; i < 2; i++) set(bx + i, by, bz, beltState(0, 0, 0));
  set(bx + 2, by, bz, beltState(0, 1, 0));
  for (let k = 1; k <= 3; k++) set(bx + 2, by, bz + k, beltState(0, 1, 0));
  h.tick(3);
  const corner = beltInfo(W.getBlock(bx + 2, by, bz))!;
  assert.notEqual(corner.shape, 0, 'la esquina cambió a curva');
  assert.equal(corner.dir, 1);
  belts().put(bx, by, bz, 0, 0.1, { id: IRON_INGOT, count: 1 });
  belts().put(bx, by, bz, 1, 0.1, { id: COAL, count: 1 });
  h.tick(20 * 8);
  const end = belts().at(bx + 2, by, bz + 3)!;
  assert.deepEqual(end.lanes[0].map((i) => i.s.id), [IRON_INGOT]);
  assert.deepEqual(end.lanes[1].map((i) => i.s.id), [COAL]);
  // Si se pone otra cinta detrás de la esquina, deja de ser curva.
  set(bx + 2, by, bz - 1, beltState(0, 1, 0));
  h.tick(3);
  assert.equal(beltInfo(W.getBlock(bx + 2, by, bz))!.shape, 0);
});

test('cintas: romper una cinta suelta lo que llevaba', () => {
  const { h, bx, by, bz, set, belts, W } = lab();
  for (let i = 0; i < 3; i++) set(bx + i, by, bz, beltState(0, 0, 0));
  h.tick(2);
  belts().put(bx + 1, by, bz, 0, 0.2, { id: IRON_INGOT, count: 1 });
  belts().put(bx + 1, by, bz, 0, 0.7, { id: COAL, count: 1 });
  set(bx + 1, by, bz, AIR);
  h.tick(2);
  assert.equal(belts().at(bx + 1, by, bz), null);
  const dropped = [...h.gs.entities.list.values()].filter((e) => e.type === ENT_ITEM).map((e) => e.stack!.id).sort();
  assert.deepEqual(dropped, [COAL, IRON_INGOT].sort());
  assert.equal(W.getBlock(bx + 1, by, bz), AIR);
});

test('cintas: los jugadores cercanos reciben lo que llevan, y se guarda y se recupera', () => {
  const store = new MemoryStore();
  const h = makeServer(4243, store);
  const c = h.join('Ingeniera', 'c');
  const [sx, , sz] = c.welcome.spawn as [number, number, number];
  const bx = Math.floor(sx), by = 160, bz = Math.floor(sz);
  c.pos(bx + 0.5, by + 30, bz + 0.5);
  h.tick(60);
  const W = h.gs.world;
  for (let dx = -8; dx <= 8; dx++) for (let dz = -8; dz <= 8; dz++) {
    W.setBlock(bx + dx, by - 1, bz + dz, STONE);
    for (let y = by; y < by + 4; y++) W.setBlock(bx + dx, y, bz + dz, AIR);
  }
  h.tick(2);
  for (let i = 0; i < 4; i++) W.setBlock(bx + i, by, bz, beltState(0, 0, 0));
  h.tick(2);
  c.pos(bx + 1.5, by, bz + 1.5);
  h.gs.sys.belts.put(bx, by, bz, 0, 0.2, { id: IRON_INGOT, count: 1 });
  h.tick(2);
  const msgs = c.conn.take('belts');
  assert.ok(msgs.length > 0, 'llega un mensaje de cintas');
  const rows = msgs.flatMap((m) => m.l as number[][]);
  const row = rows.find((r) => r[0] === bx && r[1] === by && r[2] === bz);
  assert.ok(row, 'con la cinta que tiene el objeto');
  assert.deepEqual([row![4], row![5]], [1, IRON_INGOT], 'un objeto en el carril izquierdo: hierro');
  // Guardar y volver a levantar el servidor con el mismo almacén: el objeto sigue en la cinta.
  h.gs.flush(true);
  const h2 = makeServer(4243, store);
  const c2 = h2.join('Ingeniera', 'c');
  c2.pos(bx + 0.5, by + 30, bz + 0.5);
  h2.tick(60);
  const W2 = h2.gs.world;
  for (let i = 0; i < 4; i++) W2.ensureChunk((bx + i) >> 4, bz >> 4);
  h2.tick(5);
  const b = h2.gs.sys.belts.at(bx, by, bz);
  const total = [0, 1, 2, 3].reduce((n, i) => n + ((h2.gs.sys.belts.at(bx + i, by, bz)?.lanes[0].length ?? 0) + (h2.gs.sys.belts.at(bx + i, by, bz)?.lanes[1].length ?? 0)), 0);
  assert.ok(b, 'la cinta se cargó');
  assert.equal(total, 1, 'el objeto se recuperó');
});

test('brazos: de un cofre a otro por una cinta, sin perder nada y a 0,83 objetos/s por brazo básico', async () => {
  const { CHEST, inserterState } = await import('../src/shared/blocks');
  const { h, bx, by, bz, set, W } = lab();
  const cont = h.gs.sys.containers;
  set(bx - 1, by, bz, CHEST);
  set(bx, by, bz, inserterState(0, 0));
  for (let i = 1; i <= 4; i++) set(bx + i, by, bz, beltState(0, 0, 0));
  set(bx + 5, by, bz, inserterState(0, 0));
  set(bx + 6, by, bz, CHEST);
  // Los brazos gastan energía: un poste mediano que alcanza a los dos y un panel.
  set(bx + 2, by, bz + 1, POLE_MEDIUM);
  putMulti(W, SOLAR_PANEL, 0, bx + 2, by, bz + 4); // (3×3: toca el área del poste, que llega a bz + 4)
  h.tick(3);
  const src = cont.access(bx - 1, by, bz)!;
  for (let i = 0; i < 10; i++) src.state.slots[i] = { id: IRON_INGOT, count: 1 };
  src.done();
  const count = (x: number) => {
    const o = cont.access(x, by, bz)!;
    return o.state.slots.reduce((n, s) => n + (s ? s.count : 0), 0);
  };
  assert.equal(count(bx - 1), 10);
  h.tick(20 * 3);
  const after3s = count(bx + 6);
  assert.ok(after3s >= 0 && after3s <= 3, `en 3 s aún no ha llegado todo (${after3s})`);
  h.tick(20 * 25);
  assert.equal(count(bx + 6), 10, 'llegan los 10');
  assert.equal(count(bx - 1), 0, 'y el origen queda vacío');
  assert.equal(h.gs.sys.inserters.count, 2);
  // Nada en el aire ni en las cintas.
  for (let i = 1; i <= 4; i++) assert.equal(h.gs.sys.belts.at(bx + i, by, bz)!.lanes[0].length + h.gs.sys.belts.at(bx + i, by, bz)!.lanes[1].length, 0);
});

test('brazos: no cogen lo que lo de delante no puede recibir', async () => {
  const { CHEST, inserterState } = await import('../src/shared/blocks');
  const { h, bx, by, bz, set, W } = lab();
  const cont = h.gs.sys.containers;
  set(bx - 1, by, bz, CHEST);
  set(bx, by, bz, inserterState(0, 0));
  set(bx + 1, by, bz, CHEST);
  set(bx, by, bz + 1, POLE_SMALL);
  putMulti(W, SOLAR_PANEL, 0, bx, by, bz + 4);
  h.tick(3);
  const src = cont.access(bx - 1, by, bz)!;
  src.state.slots[0] = { id: IRON_INGOT, count: 5 };
  src.done();
  // El de delante, lleno de piedra: no cabe nada más de hierro.
  const dst = cont.access(bx + 1, by, bz)!;
  for (let i = 0; i < dst.state.slots.length; i++) dst.state.slots[i] = { id: 1, count: 64 };
  dst.done();
  h.tick(20 * 5);
  assert.equal(h.gs.sys.inserters.handOf(bx, by, bz), null, 'no se quedó con nada en la mano');
  assert.equal(cont.access(bx - 1, by, bz)!.state.slots[0]?.count, 5, 'el origen sigue entero');
});
