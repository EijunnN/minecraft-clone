// Programa lunar: entidades de varias casillas (extractor 3×3, panel 3×3, acumulador 2×2, poste grande…): huella, giro, colocación
// (toda la huella o nada), romper cualquiera de sus casillas quita la máquina entera, y el modelo se reparte entre las casillas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AIR, STONE, BLOCKS, EXTRACTOR, SOLAR_PANEL, ACCUMULATOR, POLE_BIG, ELECTRIC_SMELTER, CHEST, multiblock, multiInfo, multiFootprint,
  multiControllerPos, multiBox, multiOf, multiFullModel, isMultiPart, familyBase, extractorInfo, stateProps,
} from '../src/shared/blocks';
import { mbox, type ModelBox } from '../src/shared/blockModels';
import { planPlacement, type PlaceHit } from '../src/shared/placement';
import { lookDir, dirYaw, isOrientable, marchDir } from '../src/shared/logisticsPlacement';
import { itemForBlock } from '../src/shared/items';
import { textureLayer } from '../src/shared/textureDefs';
import { makeServer } from './harness';
import { putMulti } from './multi';

// Una máquina sólo de prueba, alargada (3 de ancho, 2 de fondo, 1 de alto, ancla en una esquina) para comprobar los giros.
const L = (n: string) => textureLayer(n);
const TEST_MACHINE = multiblock({
  key: 'test_long_machine', name: 'Máquina de prueba', size: [3, 1, 2], anchor: [0, 0, 0], oriented: true,
  model: [mbox(0, 0, 0, 48, 10, 32, [L('iron_block'), L('iron_block'), L('iron_block'), L('iron_block'), L('iron_block'), L('copper_block')])],
  opts: { category: null, hardness: 1 },
});

const key = (c: number[]) => c.join(',');

test('varias casillas: la huella (una casilla por parte, el ancla primero) y de qué máquina es cada casilla', () => {
  const cells = multiFootprint(EXTRACTOR, 0, 100, 60, 100);
  assert.equal(cells.length, 3 * 2 * 3, 'el extractor ocupa 3×3 y dos de alto');
  assert.equal(new Set(cells.map((c) => key(c.slice(0, 3)))).size, 18, 'ninguna casilla repetida');
  const [ax, ay, az, aid] = cells[0];
  assert.deepEqual([ax, ay, az], [100, 60, 100], 'la primera es el ancla, donde se apunta');
  assert.equal(multiInfo(aid)!.controller, true);
  assert.equal(extractorInfo(aid)?.dir, 0);
  // El ancla es el centro de abajo: la huella va de −1 a +1 en x y z, y de 0 a 1 en y.
  const xs = cells.map((c) => c[0]), ys = cells.map((c) => c[1]), zs = cells.map((c) => c[2]);
  assert.deepEqual([Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys), Math.min(...zs), Math.max(...zs)], [99, 101, 60, 61, 99, 101]);
  for (const [x, y, z, id] of cells) {
    assert.ok(isMultiPart(id));
    assert.equal(familyBase(id), EXTRACTOR);
    assert.deepEqual(multiControllerPos(id, x, y, z), [100, 60, 100], 'todas saben dónde está el ancla');
    assert.deepEqual(multiBox(id, x, y, z), [99, 60, 99, 102, 62, 102]);
  }
  // Sólo el ancla (estado 0 de la familia) sale en el inventario; las demás casillas no.
  assert.equal(BLOCKS[EXTRACTOR].category, 'logistica');
  for (const [, , , id] of cells.slice(1)) assert.equal(BLOCKS[id].category, null);
  // El objeto que suelta cualquier casilla al romperse es el de la máquina.
  for (const [, , , id] of cells) assert.equal(itemForBlock(id), EXTRACTOR);
  // 2×2: el ancla es una esquina y la huella sale hacia dentro.
  const acc = multiFootprint(ACCUMULATOR, 0, 10, 5, 10);
  assert.equal(acc.length, 2 * 2 * 2);
  assert.deepEqual(multiBox(acc[0][3], 10, 5, 10), [10, 5, 10, 12, 7, 12]);
});

test('varias casillas: girar la máquina gira su huella y su modelo (incluso si no es cuadrada)', () => {
  // Extractor: mirando a cada lado, la boquilla de cobre asoma por el lado que toca (dir 0 +x, 1 +z, 2 −x, 3 −z).
  const dx = [1, 0, -1, 0], dz = [0, 1, 0, -1];
  for (let dir = 0; dir < 4; dir++) {
    const model = multiFullModel(multiFootprint(EXTRACTOR, dir, 0, 0, 0)[0][3])!;
    const spout = model.filter((b) => b.tex.every((t) => t === L('copper_block')));
    assert.equal(spout.length, 2);
    const cx = spout.reduce((n, b) => n + (b.x0 + b.x1) / 2, 0) / spout.length / 16; // en casillas, respecto a la del ancla
    const cz = spout.reduce((n, b) => n + (b.z0 + b.z1) / 2, 0) / spout.length / 16;
    // La boquilla queda del lado de `dir`: a más de una casilla del centro (0,5) por ese lado.
    assert.ok((cx - 0.5) * dx[dir] + (cz - 0.5) * dz[dir] > 0.9, `boquilla hacia dir ${dir}: (${cx}, ${cz})`);
  }
  // Máquina alargada de 3×2 (x por z): girada un cuarto ocupa 2×3.
  const flat = (dir: number) => multiFootprint(TEST_MACHINE, dir, 50, 70, 50);
  const spanOf = (cells: number[][]) => {
    const xs = cells.map((c) => c[0]), zs = cells.map((c) => c[2]);
    return [Math.max(...xs) - Math.min(...xs) + 1, Math.max(...zs) - Math.min(...zs) + 1];
  };
  assert.deepEqual(spanOf(flat(3)), [3, 2], 'dir 3 es el modelo tal cual (mira al norte)');
  assert.deepEqual(spanOf(flat(0)), [2, 3]);
  assert.deepEqual(spanOf(flat(1)), [3, 2]);
  assert.deepEqual(spanOf(flat(2)), [2, 3]);
  for (let dir = 0; dir < 4; dir++) {
    const cells = flat(dir);
    assert.equal(cells.length, 6);
    assert.equal(new Set(cells.map((c) => key(c.slice(0, 3)))).size, 6);
    for (const [x, y, z, id] of cells) assert.deepEqual(multiControllerPos(id, x, y, z), [50, 70, 50]);
    // El caja del conjunto contiene todas las casillas y el modelo (la cara de cobre) sigue del mismo lado que `dir`.
    const box = multiBox(cells[0][3], 50, 70, 50)!;
    for (const [x, , z] of cells) assert.ok(x >= box[0] && x < box[3] && z >= box[2] && z < box[5]);
  }
});

test('varias casillas: cada casilla dibuja su porción del modelo, sin las caras del corte, y colisiona con ella', () => {
  const cells = multiFootprint(SOLAR_PANEL, 0, 0, 0, 0);
  let solarTops = 0;
  for (const [, , , id] of cells) {
    const b = BLOCKS[id];
    assert.ok(b.model && b.model.length === 1, 'un trozo de la placa en cada casilla');
    const box: ModelBox = b.model![0];
    // Cada casilla tiene su trozo de placa: de 0 a 16 en x y z y de 0 a 6 de alto.
    assert.deepEqual([box.x0, box.x1, box.z0, box.z1, box.y0, box.y1], [0, 16, 0, 16, 0, 6]);
    if (box.tex[2] === L('solar_panel_top')) solarTops++;
    assert.deepEqual(b.collision, [0, 0, 0, 1, 6 / 16, 1]);
  }
  assert.equal(solarTops, 9, 'las nueve casillas enseñan la celda solar arriba');
  // Los lados cortados no se dibujan: la casilla de la esquina (x 0, z 0) sólo enseña las caras exteriores.
  const corner = BLOCKS[cells.find(([x, , z]) => x === -1 && z === -1)![3]].model![0];
  assert.equal(corner.tex[0], -1, 'cara +x cortada (hay otra casilla al lado)');
  assert.notEqual(corner.tex[1], -1, 'cara −x exterior');
  assert.equal(corner.tex[4], -1, 'cara +z cortada');
  assert.notEqual(corner.tex[5], -1, 'cara −z exterior');
  // La selección de cada casilla es la de la máquina entera, vista desde ella.
  const centerSel = BLOCKS[cells[0][3]].selection as number[];
  assert.deepEqual(centerSel, [-1, 0, -1, 2, 6 / 16, 2]);
  const cornerSel = BLOCKS[cells.find(([x, , z]) => x === -1 && z === -1)![3]].selection as number[];
  assert.deepEqual(cornerSel, [0, 0, 0, 3, 6 / 16, 3]);
});

const hitOn = (x: number, y: number, z: number): PlaceHit => ({ x, y, z, nx: 0, ny: 1, nz: 0, px: x + 0.5, py: y + 1, pz: z + 0.5, id: STONE }) as PlaceHit;

test('varias casillas: colocar pone toda la huella hacia donde mira el jugador, o nada si algo estorba', () => {
  const ground = new Map<string, number>();
  const get = (x: number, y: number, z: number) => ground.get(`${x},${y},${z}`) ?? (y === 63 ? STONE : AIR);
  // Mirando a +x (yaw −π/2): el extractor suelta hacia +x.
  const edits = planPlacement(get, hitOn(0, 63, 0), EXTRACTOR, dirYaw(0), 0)!;
  assert.equal(edits.length, 18);
  assert.equal(marchDir(edits[0][3]), 0);
  assert.deepEqual(edits[0].slice(0, 3), [0, 64, 0], 'el ancla está donde se apunta, encima del suelo');
  assert.equal(lookDir(dirYaw(3)), 3);
  assert.ok(isOrientable(EXTRACTOR) && isOrientable(ELECTRIC_SMELTER) && !isOrientable(SOLAR_PANEL) && !isOrientable(CHEST));
  // Se pueden girar: el mismo sitio, mirando a −z, da otra huella.
  const north = planPlacement(get, hitOn(0, 63, 0), EXTRACTOR, dirYaw(3), 0)!;
  assert.equal(north.length, 18);
  assert.equal(marchDir(north[0][3]), 3);
  // Una casilla ocupada de la huella lo impide todo.
  ground.set('1,65,1', STONE);
  assert.equal(planPlacement(get, hitOn(0, 63, 0), EXTRACTOR, dirYaw(0), 0), null);
  // Una máquina sin orientación ignora hacia dónde se mira.
  const panel = planPlacement(get, hitOn(5, 63, 5), SOLAR_PANEL, dirYaw(1), 0)!;
  assert.equal(panel.length, 9);
  assert.equal(new Set(panel.map((e) => key(e.slice(0, 3)))).size, 9);
});

test('varias casillas en el servidor: romper cualquier casilla quita la máquina entera (sin soltar de más)', () => {
  const h = makeServer(4243);
  const c = h.join('Ingeniera', 'c');
  const [sx, , sz] = c.welcome.spawn as [number, number, number];
  const bx = Math.floor(sx), by = 160, bz = Math.floor(sz);
  c.pos(bx + 0.5, by + 30, bz + 0.5);
  h.tick(60);
  const W = h.gs.world;
  for (let dx = -8; dx <= 8; dx++) for (let dz = -8; dz <= 8; dz++) {
    W.setBlock(bx + dx, by - 1, bz + dz, STONE);
    for (let y = by; y < by + 10; y++) W.setBlock(bx + dx, y, bz + dz, AIR);
  }
  h.tick(2);
  const present = (cells: number[][]) => cells.filter(([x, y, z]) => W.getBlock(x, y, z) > 0 && isMultiPart(W.getBlock(x, y, z))).length;
  // Romper una casilla de un lado.
  putMulti(W, EXTRACTOR, 1, bx, by, bz);
  const cells = multiFootprint(EXTRACTOR, 1, bx, by, bz);
  h.tick(2);
  assert.equal(present(cells), 18);
  W.setBlock(bx + 1, by + 1, bz - 1, AIR);
  h.tick(2);
  assert.equal(present(cells), 0, 'se fue toda');
  // Romper la casilla principal.
  putMulti(W, SOLAR_PANEL, 0, bx, by, bz);
  const panel = multiFootprint(SOLAR_PANEL, 0, bx, by, bz);
  h.tick(2);
  assert.equal(present(panel), 9);
  W.setBlock(bx, by, bz, AIR);
  h.tick(2);
  assert.equal(present(panel), 0);
  // No toca lo que no es suyo: un bloque de piedra pegado a la máquina sigue ahí.
  putMulti(W, SOLAR_PANEL, 0, bx, by, bz);
  W.setBlock(bx + 2, by, bz, STONE);
  h.tick(2);
  W.setBlock(bx - 1, by, bz + 1, AIR);
  h.tick(2);
  assert.equal(W.getBlock(bx + 2, by, bz), STONE);
  assert.equal(present(panel), 0);
  // El poste grande (2×2, 3 de alto) también.
  putMulti(W, POLE_BIG, 0, bx - 5, by, bz - 5);
  const pole = multiFootprint(POLE_BIG, 0, bx - 5, by, bz - 5);
  assert.equal(pole.length, 12);
  h.tick(2);
  W.setBlock(bx - 4, by + 2, bz - 4, AIR);
  h.tick(2);
  assert.equal(present(pole), 0);
});

test('varias casillas: los estados son de la familia y el estado 0 es el objeto (dir 0, casilla principal)', () => {
  assert.equal(multiOf(EXTRACTOR)!.parts, 18);
  assert.deepEqual(stateProps(EXTRACTOR), { dir: 0, part: 0 });
  assert.deepEqual(stateProps(SOLAR_PANEL + 4), { part: 4 });
  const ids = new Set(multiFootprint(ELECTRIC_SMELTER, 2, 0, 0, 0).map((c) => c[3]));
  assert.equal(ids.size, 18);
  for (const id of ids) assert.equal(multiInfo(id)!.dir, 2);
});
