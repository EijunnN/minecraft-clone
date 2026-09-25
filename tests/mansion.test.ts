// Fase 7.5 (mansión): la mansión del bosque (trazado, habitaciones, botín e illagers que no
// desaparecen), el alay (recoger objetos y llevarlos al jugador o al bloque musical, devolver lo que
// lleva, bailar y duplicarse, no desaparecer) con sus jaulas en los puestos, y los mapas de explorador
// del cartógrafo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STONE, COBBLESTONE, JUKEBOX, FENCES, DARK_OAK_PLANKS, BIRCH_PLANKS, OBSIDIAN, IRON_BARS, stateOf } from '../src/shared/blocks';
import {
  WHEAT, AMETHYST_SHARD, EMERALD, COMPASS, FILLED_MAP, MUSIC_DISCS, TOOLS, BONE, GUNPOWDER, ROTTEN_FLESH, STRING, SPAWN_EGGS,
  ITEMS, HORSE_ARMOR,
} from '../src/shared/items';
import { MOBS, MOB_ALLAY, MOB_VINDICATOR, MOB_EVOKER, MOB_VILLAGER, ENT_ITEM } from '../src/shared/mobs';
import { EF_ALLAY_DANCING, ALLAY_DUPLICATE_COOLDOWN } from '../src/shared/allay';
import { TerrainGenerator } from '../src/shared/world/terrain';
import { mulberry32 } from '../src/shared/world/noise';
import { blockIndex } from '../src/shared/constants';
import { locateStructure, structureStartAt, STRUCTURE_NAMES } from '../src/shared/world/structures';
import { mansionLayout, MANSION_LOOT } from '../src/shared/world/mansion';
import { LOOT_TABLES, rollLoot } from '../src/shared/loot';
import { offersFor, PROF_CARTOGRAPHER } from '../src/shared/villagers';
import { explorerInfo, explorerMap, EXPLORER_SPAN } from '../src/shared/explorerMaps';
import { sanitizeStack } from '../src/shared/containers';
import { stackName } from '../src/shared/itemData';
import { makeServer, type Client, type Harness } from './harness';
import type { Entity } from '../src/shared/sim/entities';

const SEED = 12345;

// ------------------------------------------------------------------ mansión

test('mansión: en el bosque oscuro, rara, con nombre y en /localizar', () => {
  assert.equal(STRUCTURE_NAMES.mansion, 'Mansión del bosque');
  const gen = new TerrainGenerator(SEED);
  const p = locateStructure(gen, 'mansion', 0, 0, 20);
  assert.ok(p, 'hay una mansión');
  // Muy rara: como mucho una por región de 80 chunks.
  const q = locateStructure(gen, 'mansion', p![0] + 80 * 16, p![2], 1);
  if (q && (q[0] !== p![0] || q[2] !== p![2])) assert.ok(Math.hypot(q[0] - p![0], q[2] - p![2]) >= 20 * 16, 'separadas');
  const h = makeServer(SEED);
  const c = h.join('Exploradora', 'c');
  c.send({ t: 'chat', m: '/localizar mansión' });
  const reply = c.conn.take('chat').map((m) => m.m).join('\n');
  assert.match(reply, /Mansión del bosque más cercana: x -?\d+/);
});

test('mansión: tres plantas de habitaciones variadas, escaleras, celdas con alays y falso portal', () => {
  const gen = new TerrainGenerator(SEED);
  const p = locateStructure(gen, 'mansion', 0, 0, 20)!;
  const s = structureStartAt(gen, 'mansion', p[0], p[2])!;
  const L = mansionLayout(s);
  const types = new Set(L.rooms.map((r) => r.type));
  assert.ok(L.rooms.length >= 15, `habitaciones: ${L.rooms.length}`);
  assert.ok(types.size >= 8, `tipos: ${[...types].join(', ')}`);
  for (const t of ['stairs', 'jail', 'fake_portal']) assert.ok(types.has(t as never), t);
  assert.equal(L.stairs.length, 2, 'una escalera por planta');
  assert.deepEqual(new Set(L.rooms.map((r) => r.floor)), new Set([0, 1, 2]));
  // Todas las habitaciones con puerta dan a un pasillo; las que no, son las secretas.
  for (const r of L.rooms) assert.equal(!r.door, r.type === 'secret', `${r.type} ${r.floor}:${r.i},${r.j}`);
  const mobs = L.rooms.flatMap((r) => r.mobs);
  assert.ok(mobs.filter((m) => m === MOB_EVOKER).length >= 2, 'al menos dos evocadores');
  assert.ok(mobs.filter((m) => m === MOB_VINDICATOR).length >= 4, 'vindicadores');
  assert.ok(L.rooms.filter((r) => r.type === 'jail').every((r) => r.mobs.length > 0 && r.mobs.every((m) => m === MOB_ALLAY)), 'alays en las celdas');
  // Mismo trazado siempre.
  assert.deepEqual(mansionLayout({ ...s }).rooms.map((r) => r.type), L.rooms.map((r) => r.type));
});

test('mansión: se genera con cofres de su botín y cada criatura sale en un solo chunk', () => {
  const gen = new TerrainGenerator(SEED);
  const p = locateStructure(gen, 'mansion', 0, 0, 20)!;
  const L = mansionLayout(structureStartAt(gen, 'mansion', p[0], p[2])!);
  const cx = Math.floor(p[0] / 16), cz = Math.floor(p[2] / 16);
  const counts = new Map<number, number>();
  const chests: string[] = [];
  const mobs: number[] = [];
  for (let dz = -3; dz <= 3; dz++) {
    for (let dx = -3; dx <= 3; dx++) {
      const r = gen.generate(cx + dx, cz + dz);
      for (const b of r.blocks) counts.set(b, (counts.get(b) ?? 0) + 1);
      chests.push(...r.chests.map((ch) => ch.table));
      mobs.push(...r.mobs.map((m) => m.type));
    }
  }
  assert.ok((counts.get(DARK_OAK_PLANKS) ?? 0) > 2000, 'roble oscuro');
  assert.ok((counts.get(BIRCH_PLANKS) ?? 0) > 200, 'paredes de abedul por dentro');
  assert.ok((counts.get(OBSIDIAN) ?? 0) >= 12, 'el marco del falso portal');
  assert.ok((counts.get(IRON_BARS) ?? 0) > 10, 'barrotes de las celdas');
  assert.ok(chests.filter((t) => t === MANSION_LOOT).length >= 6, `cofres: ${chests.length}`);
  assert.deepEqual(mobs.sort(), L.rooms.flatMap((r) => r.mobs).sort(), 'cada criatura, una vez');
});

test('mansión: botín como el de Minecraft (tres grupos)', () => {
  const rand = mulberry32(2112);
  const t = LOOT_TABLES[MANSION_LOOT];
  assert.equal(t.pools?.length, 2);
  const seen = new Set<number>();
  for (let i = 0; i < 200; i++) {
    const out = rollLoot(t, rand);
    assert.ok(out.length >= 5 && out.length <= 10, `${out.length} montones`);
    for (const s of out) seen.add(s.id);
  }
  for (const id of [TOOLS.diamond.hoe, BONE, GUNPOWDER, ROTTEN_FLESH, STRING, WHEAT, MUSIC_DISCS[0]]) assert.ok(seen.has(id), ITEMS[id].name);
});

test('mansión: sus illagers aparecen una vez, no desaparecen, se guardan y se van en pacífico', () => {
  const h = makeServer(SEED);
  const c = h.join('Lejana');
  c.pos(0.5, 120, 0.5);
  const p = locateStructure(h.gs.world.gen, 'mansion', 0, 0, 20)!;
  const cx = Math.floor(p[0] / 16), cz = Math.floor(p[2] / 16);
  const load = () => {
    for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) h.gs.world.ensureChunk(cx + dx, cz + dz);
  };
  load();
  const near = (types: number[]) => [...h.gs.entities.list.values()].filter((e) => types.includes(e.type) && !e.dead && Math.hypot(e.x - p[0], e.z - p[2]) < 40);
  const illagers = near([MOB_VINDICATOR, MOB_EVOKER]);
  assert.ok(illagers.length >= 5, `illagers: ${illagers.length}`);
  assert.ok(illagers.every((e) => e.persistent), 'no desaparecen');
  assert.ok(near([MOB_ALLAY]).length >= 1, 'alays en las celdas');
  // Lejos de todos (a más de 3000 bloques), siguen ahí.
  h.tick(20 * 10);
  assert.equal(near([MOB_VINDICATOR, MOB_EVOKER]).length, illagers.length);
  // Volver a cargar los chunks no los repite.
  load();
  assert.equal(near([MOB_VINDICATOR, MOB_EVOKER]).length, illagers.length);
  // Se guardan con el mundo (los monstruos normales no).
  const saved = JSON.parse(h.gs.entities.serializePassive()) as number[][];
  assert.ok(saved.filter((row) => row[0] === MOB_VINDICATOR).length >= illagers.filter((e) => e.type === MOB_VINDICATOR).length);
  const h2 = makeServer(SEED);
  h2.gs.entities.restorePassive(JSON.stringify(saved));
  assert.ok([...h2.gs.entities.list.values()].some((e) => e.type === MOB_EVOKER && e.persistent), 'restaurados sin desaparecer');
  // En pacífico se van (como en Minecraft).
  c.send({ t: 'chat', m: '/dificultad pacifico' });
  h.tick(5);
  assert.equal(near([MOB_VINDICATOR, MOB_EVOKER]).length, 0);
});

// ------------------------------------------------------------------ alay

function arena(seed = 7331): { h: Harness; c: Client; bx: number; by: number; bz: number } {
  const h = makeServer(seed);
  const c = h.join('Alayera');
  const [sx, sy, sz] = c.welcome.spawn as [number, number, number];
  c.pos(sx, sy, sz);
  h.tick(40);
  const bx = Math.floor(sx) + 2, by = 150, bz = Math.floor(sz) + 2;
  for (let dx = -12; dx <= 12; dx++) for (let dz = -12; dz <= 12; dz++) h.gs.world.setBlock(bx + dx, by - 1, bz + dz, STONE);
  c.pos(bx + 0.5, by, bz + 0.5);
  h.tick(2);
  c.conn.msgs = [];
  return { h, c, bx, by, bz };
}

let q = 100;
function interact(c: Client, e: Entity, item: number, st?: object): { ok: boolean; take?: number; give?: { id: number; count: number; data?: unknown } } {
  c.send({ t: 'interact', e: e.id, item, q: ++q, ...(st ? { st } : {}) });
  return c.conn.take('ires').find((m) => m.q === q);
}

const items = (h: Harness, id: number) => [...h.gs.entities.list.values()].filter((e) => e.type === ENT_ITEM && e.stack?.id === id && !e.dead);
const allays = (h: Harness) => [...h.gs.entities.list.values()].filter((e) => e.type === MOB_ALLAY && !e.dead);

test('alay: id 76, vuela, huevo generador y no desaparece', () => {
  assert.equal(MOB_ALLAY, 76);
  const def = MOBS[MOB_ALLAY];
  assert.equal(def.name, 'Alay');
  assert.ok(def.flying && !def.hostile);
  for (const n of ['head', 'body', 'armR', 'armL', 'wingR', 'wingL']) assert.ok(def.parts.some((p) => p.name === n), n);
  assert.equal(ITEMS[SPAWN_EGGS.allay].name, 'Huevo generador de alay');
  const { h } = arena();
  const a = h.gs.entities.spawnMob(MOB_ALLAY, 0, 200, 0)!;
  assert.ok(a.persistent, 'no desaparece');
});

test('alay: coge el objeto, recoge los iguales y se los lleva al jugador; con la mano vacía lo devuelve', () => {
  const { h, c, bx, by, bz } = arena();
  const a = h.gs.entities.spawnMob(MOB_ALLAY, bx + 0.5, by + 1, bz + 0.5)!;
  const r = interact(c, a, WHEAT, { id: WHEAT, count: 12 });
  assert.ok(r?.ok && r.take === 1, 'se queda con uno');
  assert.equal(a.gear, WHEAT, 'lo lleva en las manos');
  // Trigo a 8 bloques (y roca, que no le interesa).
  const far = h.gs.entities.spawnItem({ id: WHEAT, count: 5 }, bx + 8.5, by + 0.2, bz + 3.5, 0, 0, 0, undefined, 0);
  const other = h.gs.entities.spawnItem({ id: COBBLESTONE, count: 2 }, bx - 6.5, by + 0.2, bz + 0.5, 0, 0, 0, undefined, 0);
  let delivered: Entity | undefined;
  for (let t = 0; t < 20 * 20 && !delivered; t++) {
    h.tick(1);
    delivered = items(h, WHEAT).find((e) => e !== far && Math.hypot(e.x - bx - 0.5, e.z - bz - 0.5) < 4 && e.stack!.count === 5);
  }
  assert.ok(!h.gs.entities.list.has(far.id), 'recogió el trigo');
  assert.ok(delivered, 'y lo trajo');
  assert.ok(h.gs.entities.list.has(other.id), 'la roca no');
  // Lo que lanzó no lo vuelve a coger.
  h.tick(20 * 6);
  assert.ok(h.gs.entities.list.has(delivered!.id), 'no recoge lo que trajo');
  // Con la mano vacía, lo devuelve.
  const back = interact(c, a, 0);
  assert.ok(back?.ok);
  assert.equal(back.give?.id, WHEAT);
  assert.equal(a.gear, undefined);
});

test('alay: lo lleva al bloque musical que oyó; su jugador no le hace daño; lo que lleva se guarda', () => {
  const { h, c, bx, by, bz } = arena();
  const a = h.gs.entities.spawnMob(MOB_ALLAY, bx + 0.5, by + 1, bz + 0.5)!;
  interact(c, a, TOOLS.iron.sword, { id: TOOLS.iron.sword, count: 1, dmg: 17 });
  // Su jugador no puede herirlo; otro, sí.
  assert.equal(h.gs.entities.damage(a, 4, bx, bz, c.welcome.id), false);
  assert.equal(a.health, a.maxHealth);
  // Lo que lleva (con su desgaste) sobrevive al guardado.
  const saved = h.gs.entities.serializePassive();
  const h2 = makeServer(7331);
  h2.gs.entities.restorePassive(saved);
  const b = allays(h2)[0];
  assert.ok(b);
  assert.equal(b.gear, TOOLS.iron.sword);
  const again = h2.gs.entities.allays.interact(b, null, false, 'Alayera');
  assert.deepEqual(again?.give, { id: TOOLS.iron.sword, count: 1, dmg: 17 });
  // Con un bloque musical sonando cerca, lleva allí lo recogido.
  interact(c, a, 0);
  interact(c, a, WHEAT, { id: WHEAT, count: 1 });
  const nx = bx - 7, nz = bz + 6;
  (h.gs as unknown as { fx(k: string, x: number, y: number, z: number): void }).fx('note', nx + 0.5, by + 0.2, nz + 0.5);
  const src = h.gs.entities.spawnItem({ id: WHEAT, count: 3 }, bx + 6.5, by + 0.2, bz - 4.5, 0, 0, 0, undefined, 0);
  let atNote: Entity | undefined;
  for (let t = 0; t < 20 * 20 && !atNote; t++) {
    h.tick(1);
    atNote = items(h, WHEAT).find((e) => e !== src && Math.hypot(e.x - nx - 0.5, e.z - nz - 0.5) < 4);
  }
  assert.ok(atNote, 'lo dejó junto al bloque musical');
});

test('alay: al morir suelta lo suyo una sola vez', () => {
  const { h, c, bx, by, bz } = arena();
  const a = h.gs.entities.spawnMob(MOB_ALLAY, bx + 0.5, by + 1, bz + 0.5)!;
  interact(c, a, HORSE_ARMOR.iron, { id: HORSE_ARMOR.iron, count: 1 });
  h.gs.entities.allays.state(a).inv = { id: WHEAT, count: 7 };
  h.gs.entities.kill(a, true);
  assert.equal(items(h, HORSE_ARMOR.iron).length, 1, 'la armadura, una vez');
  assert.equal(items(h, WHEAT).reduce((n, e) => n + e.stack!.count, 0), 7, 'y lo recogido');
});

test('alay: baila con un tocadiscos y se duplica con un fragmento de amatista (cada 5 minutos)', () => {
  const { h, c, bx, by, bz } = arena();
  const a = h.gs.entities.spawnMob(MOB_ALLAY, bx + 0.5, by + 1, bz + 0.5)!;
  h.gs.world.setBlock(bx + 3, by, bz, stateOf(JUKEBOX, { disc: 0 }));
  assert.ok(h.gs.collections.insertDisc(bx + 3, by, bz, MUSIC_DISCS[0]));
  h.tick(30);
  assert.ok(a.flags & EF_ALLAY_DANCING, 'baila');
  const r = interact(c, a, AMETHYST_SHARD, { id: AMETHYST_SHARD, count: 4 });
  assert.ok(r?.ok && r.take === 1);
  assert.equal(allays(h).length, 2, 'se duplicó');
  assert.equal(h.gs.entities.allays.state(allays(h)[1]).dupCd, ALLAY_DUPLICATE_COOLDOWN);
  // Otra vez enseguida: no se duplica (se queda con el fragmento como con cualquier objeto).
  interact(c, a, AMETHYST_SHARD, { id: AMETHYST_SHARD, count: 3 });
  assert.equal(allays(h).length, 2);
  // Sin música deja de bailar.
  h.gs.world.setBlock(bx + 3, by, bz, STONE);
  h.tick(30);
  assert.ok(!(allays(h)[1].flags & EF_ALLAY_DANCING));
});

test('alay: jaulas con alays en la mitad de los puestos de saqueadores', () => {
  const gen = new TerrainGenerator(SEED);
  const cache = new Map<string, ReturnType<TerrainGenerator['generate']>>();
  const chunk = (cx: number, cz: number) => {
    const k = `${cx},${cz}`;
    let r = cache.get(k);
    if (!r) cache.set(k, (r = gen.generate(cx, cz)));
    return r;
  };
  const block = (x: number, y: number, z: number) => {
    const cx = Math.floor(x / 16), cz = Math.floor(z / 16);
    return chunk(cx, cz).blocks[blockIndex(x - cx * 16, y, z - cz * 16)];
  };
  const seen = new Set<string>();
  let caged = 0, withCage = 0;
  for (let k = 0; k < 16; k++) {
    const o = locateStructure(gen, 'pillager_outpost', (k % 4) * 3000 - 4500, Math.floor(k / 4) * 3000 - 4500, 2);
    if (!o || seen.has(`${o[0]},${o[2]}`)) continue;
    seen.add(`${o[0]},${o[2]}`);
    const cx = Math.floor(o[0] / 16), cz = Math.floor(o[2] / 16);
    const found = [];
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) found.push(...chunk(cx + dx, cz + dz).mobs.filter((m) => m.type === MOB_ALLAY));
    if (found.length) withCage++;
    caged += found.length;
    // Cada alay, dentro de una jaula de vallas de roble oscuro.
    for (const m of found) {
      let fences = 0;
      for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) if (block(Math.floor(m.x) + dx, Math.floor(m.y), Math.floor(m.z) + dz) === FENCES.dark_oak) fences++;
      assert.ok(fences >= 8, `jaula alrededor del alay (${fences})`);
    }
  }
  assert.ok(caged >= 1 && withCage < seen.size, `alays enjaulados en ${withCage} de ${seen.size} puestos`);
});

// ------------------------------------------------------------------ mapas de explorador

test('cartógrafo: mapa del monumento de oficial y de la mansión de maestro, fuera del sorteo', () => {
  const o3 = offersFor(PROF_CARTOGRAPHER, 3, 42), o5 = offersFor(PROF_CARTOGRAPHER, 5, 42);
  const ex = (o: typeof o3) => o.filter((t) => t.explorer).map((t) => [t.explorer, t.cost[1], t.cost2?.[0], t.result[0]]);
  assert.deepEqual(ex(offersFor(PROF_CARTOGRAPHER, 2, 42)), []);
  assert.deepEqual(ex(o3), [['monument', 13, COMPASS, FILLED_MAP]]);
  assert.deepEqual(ex(o5), [['monument', 13, COMPASS, FILLED_MAP], ['mansion', 14, COMPASS, FILLED_MAP]]);
  // El mapa: su nombre, su zona (1:4) y sus datos sobreviven a la red y al guardado.
  const map = explorerMap('mansion', 5000, -3000);
  const clean = sanitizeStack(JSON.parse(JSON.stringify(map)))!;
  assert.deepEqual(clean, map);
  assert.equal(stackName(clean), 'Mapa de mansión del bosque');
  const info = explorerInfo(clean)!;
  assert.ok(5000 >= info.x0 && 5000 < info.x0 + EXPLORER_SPAN && -3000 >= info.z0 && -3000 < info.z0 + EXPLORER_SPAN);
  assert.equal(sanitizeStack({ id: FILLED_MAP, count: 1, data: { explore: { k: 'nada', x: 1, z: 2 } } })?.data, undefined);
});

test('cartógrafo: vende el mapa que apunta a la mansión más cercana (sin monumentos, sin esa oferta)', () => {
  const h = makeServer(SEED);
  const c = h.join('Cartografa');
  const [sx, sy, sz] = c.welcome.spawn as [number, number, number];
  c.pos(sx, sy, sz);
  h.tick(20);
  const e = h.gs.entities.villagers.spawn(sx + 1, sy, sz, null, [Math.floor(sx), Math.floor(sy), Math.floor(sz)], MOB_VILLAGER)!;
  const v = h.gs.entities.villagers.data(e);
  v.prof = PROF_CARTOGRAPHER;
  v.level = 5;
  c.pos(e.x + 1, e.y, e.z);
  c.send({ t: 'topen', e: e.id });
  const trades = c.conn.take('trades')[0];
  assert.ok(trades, 'abre el comercio');
  const offers = trades.o as unknown[][];
  const maps = offers.map((o, i) => [o, i] as const).filter(([o]) => o[4] === FILLED_MAP);
  assert.equal(maps.length, 1, 'sólo el de la mansión (no hay monumentos en esta rama)');
  const [wire, idx] = maps[0];
  const target = (wire[8] as { explore: { k: string; x: number; z: number } }).explore;
  assert.equal(target.k, 'mansion');
  const want = locateStructure(h.gs.world.gen, 'mansion', Math.floor(e.x), Math.floor(e.z), 100)!;
  assert.deepEqual([target.x, target.z], [want[0], want[2]]);
  c.send({ t: 'trade', e: e.id, i: idx, q: 7, pay: [{ id: EMERALD, count: 14 }, { id: COMPASS, count: 1 }] });
  const res = c.conn.take('tres').find((m) => m.q === 7);
  assert.ok(res?.ok, 'trato hecho');
  assert.equal(res.give.id, FILLED_MAP);
  assert.equal(explorerInfo(res.give)?.kind.name, 'Mapa de mansión del bosque');
});

// ------------------------------------------------------------------ cliente

test('alay en el cliente: textura que brilla, qué se le puede dar y alas que baten', async () => {
  const { generateMobTexture } = await import('../src/client/textures/mobTextures');
  const { allayCanInteract } = await import('../src/client/game/allayClient');
  const { animateAllay } = await import('../src/client/render/allayPose');
  const t = generateMobTexture(MOB_ALLAY);
  const alphas = new Set<number>();
  for (let i = 3; i < t.rgba.length; i += 4) if (t.rgba[i]) alphas.add(t.rgba[i]);
  assert.equal(alphas.size, 1, 'toda la piel pintada es emisiva');
  assert.ok(![...alphas].includes(255));
  const e = { type: MOB_ALLAY, flags: 0, gear: 0, seed: 0.3, walkAmount: 0, yaw: 0, bodyYaw: 0, pitch: 0 } as never as Parameters<typeof allayCanInteract>[0];
  assert.equal(allayCanInteract(e, WHEAT), true, 'sin nada, coge cualquier objeto');
  assert.equal(allayCanInteract(e, 0), false);
  (e as { gear: number }).gear = WHEAT;
  assert.equal(allayCanInteract(e, 0), true, 'con la mano vacía devuelve el suyo');
  assert.equal(allayCanInteract(e, AMETHYST_SHARD), false, 'sin bailar, la amatista no');
  (e as { flags: number }).flags = EF_ALLAY_DANCING;
  assert.equal(allayCanInteract(e, AMETHYST_SHARD), true, 'bailando, la amatista sí');
  assert.equal(allayCanInteract({ ...e, type: MOB_VILLAGER } as never, 0), undefined);
  const a = [0, 0, 0], b = [0, 0, 0];
  animateAllay(MOBS[MOB_ALLAY], e, 0.1, 'wingR', a);
  animateAllay(MOBS[MOB_ALLAY], e, 0.13, 'wingR', b);
  assert.notEqual(a[1], b[1], 'las alas se mueven');
});
