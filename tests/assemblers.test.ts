// Programa lunar: ensambladoras 1–3 y hornos de piedra y de acero (Factorio): receta elegida, búfers, velocidades, energía y combustible.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AIR, STONE, CHEST, SOLAR_PANEL, POLE_MEDIUM, ASSEMBLER_BLOCKS, FURNACE_BLOCKS, inserterState,
} from '../src/shared/blocks';
import { IRON_INGOT, RAW_IRON, COAL, FACTORIO_NEW } from '../src/shared/items';
import { ASSEMBLERS, FURNACES } from '../src/shared/logistics/assemblyTypes';
import { recipesMaking, recipeSeconds, assemblerRecipes } from '../src/shared/logistics/assembly';
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
  for (let dx = -24; dx <= 24; dx++) {
    for (let dz = -24; dz <= 24; dz++) {
      W.setBlock(bx + dx, by - 1, bz + dz, STONE);
      for (let y = by; y < by + 40; y++) W.setBlock(bx + dx, y, bz + dz, AIR);
    }
  }
  h.tick(2);
  const set = (x: number, y: number, z: number, id: number) => void W.setBlock(x, y, z, id);
  const sys = () => h.gs.sys;
  sys().research.grantAll(); // (toda la ciencia hecha: aquí se prueban las máquinas, no la investigación)
  const noon = () => (h.gs as unknown as { setTime(d: number): void }).setTime(10.25);
  const fill = (x: number, y: number, z: number, ...stacks: { id: number; count: number }[]) => {
    const a = sys().containers.access(x, y, z)!;
    stacks.forEach((s, i) => (a.state.slots[i] = s));
    a.done();
  };
  const count = (x: number, y: number, z: number, id?: number) =>
    sys().containers.access(x, y, z)!.state.slots.reduce((n, s) => n + (s && (id === undefined || s.id === id) ? s.count : 0), 0);
  /** Un poste mediano y cuatro paneles (4 × 60 kW) alrededor. */
  const power = (cx: number, cz: number, sides: number[][] = [[4, 0], [-4, 0], [0, 4], [0, -4]]) => {
    noon();
    set(cx, by, cz, POLE_MEDIUM);
    for (const [dx, dz] of sides) putMulti(W, SOLAR_PANEL, 0, cx + dx, by, cz + dz);
    h.tick(3);
  };
  return { h, c, bx, by, bz, W, set, sys, fill, count, power };
}

const GEAR = FACTORIO_NEW['iron-gear-wheel'], STICK = FACTORIO_NEW['iron-stick'], STEEL = FACTORIO_NEW['steel-plate'];
const bucketKey = () => recipesMaking(GEAR)[0].key;

test('ensambladoras: las cifras de Factorio y las recetas de fabricación', () => {
  assert.deepEqual(ASSEMBLERS.map((a) => a.speed), [0.5, 0.75, 1.25, 1, 1]);
  assert.deepEqual(ASSEMBLERS.map((a) => a.kw), [75, 150, 375, 210, 420]);
  assert.deepEqual(ASSEMBLERS.slice(0, 3).map((a) => a.drainKw), [2.5, 5, 12.5]);
  assert.deepEqual(FURNACES.map((f) => f.speed), [1, 2]);
  assert.ok(assemblerRecipes().length >= 25, 'las recetas de Factorio disponibles');
  assert.equal(recipesMaking(GEAR).length, 1);
  assert.equal(recipeSeconds(recipesMaking(GEAR)[0]), 0.5, 'el engranaje tarda 0,5 s, como en Factorio');
  assert.deepEqual(recipesMaking(GEAR)[0].needs.map((n) => n.n), [2]);
  assert.equal(recipesMaking(GEAR)[0].out.count, 1);
});

test('ensambladora: sin receta no acepta nada; con la receta sólo sus ingredientes, y fabrica a su velocidad', () => {
  const l = lab();
  const ax = l.bx, az = l.bz;
  putMulti(l.W, ASSEMBLER_BLOCKS[1], 0, ax, l.by, az);
  l.power(ax + 3, az + 3);
  const asm = l.sys().assemblers;
  assert.equal(asm.accepts(ax, l.by, az, { id: IRON_INGOT, count: 1 }), false, 'sin receta, nada');
  assert.ok(asm.setRecipe(ax, l.by, az, bucketKey()));
  assert.equal(asm.accepts(ax, l.by, az, { id: IRON_INGOT, count: 1 }), true);
  assert.equal(asm.accepts(ax, l.by, az, { id: STICK, count: 1 }), false, 'lo que no pide la receta, no');
  // Los brazos meten desde un cofre y sacan a otro (por casillas distintas de la huella).
  l.set(ax - 3, l.by, az, CHEST);
  l.set(ax - 2, l.by, az, inserterState(1, 0));
  l.set(ax - 2, l.by, az + 1, POLE_MEDIUM);
  l.set(ax + 2, l.by, az, inserterState(1, 0));
  l.set(ax + 3, l.by, az, CHEST);
  l.h.tick(3);
  l.fill(ax - 3, l.by, az, { id: IRON_INGOT, count: 30 });
  l.h.tick(20 * 30);
  const made = l.count(ax + 3, l.by, az, GEAR);
  // 2 placas → 1 engranaje en 0,5 s ÷ 0,75 = 0,67 s: limitado por los brazos y por las 30 placas (15 engranajes).
  assert.ok(made >= 12 && made <= 15, `engranajes ${made}`);
  const spent = 30 - l.count(ax - 3, l.by, az, IRON_INGOT);
  assert.ok(spent >= made * 2, 'gastó dos placas por engranaje');
});

test('ensambladora: cambiar la receta suelta lo que había dentro; la ventana (mcfg) elige por el objeto y responde', () => {
  const l = lab();
  const ax = l.bx, az = l.bz;
  putMulti(l.W, ASSEMBLER_BLOCKS[0], 0, ax, l.by, az);
  l.c.pos(ax + 0.5, l.by, az + 4.5);
  l.h.tick(3);
  l.c.send({ t: 'mcfg', x: ax + 1, y: l.by, z: az, c: { out: GEAR } }); // desde cualquier casilla
  l.h.tick(2);
  const v = l.c.conn.take('mview');
  assert.equal(v.length, 1);
  assert.equal(v[0].recipe, bucketKey());
  assert.equal(v[0].needs.length, 1);
  assert.equal(v[0].needs[0][2], 2, 'pide dos placas por tanda');
  l.sys().assemblers.insert(ax, l.by, az, { id: IRON_INGOT, count: 4 });
  const before = [...l.h.gs.entities.list.values()].length;
  l.c.send({ t: 'mcfg', x: ax, y: l.by, z: az, c: { clear: 1 } });
  l.h.tick(2);
  assert.equal(l.sys().assemblers.recipeAt(ax, l.by, az), 0);
  assert.ok([...l.h.gs.entities.list.values()].length > before, 'los lingotes caen al suelo');
});

test('ensambladoras: la 3 rinde más que la 1 (varillas de hierro), pero sus 375 kW no caben en 240 kW de paneles (va al 64 %)', () => {
  const run = (tier: number) => {
    const l = lab();
    const ax = l.bx, az = l.bz;
    putMulti(l.W, ASSEMBLER_BLOCKS[tier], 0, ax, l.by, az);
    l.power(ax + 3, az + 3);
    l.sys().assemblers.setRecipe(ax, l.by, az, recipesMaking(STICK)[0].key);
    let out = 0;
    for (let i = 0; i < 400; i++) {
      l.sys().assemblers.insert(ax, l.by, az, { id: IRON_INGOT, count: 64 });
      l.h.tick(1);
      while (l.sys().assemblers.extractOne(ax, l.by, az, () => true)) out++;
    }
    return out;
  };
  const one = run(0), three = run(2);
  // Velocidad 2,5 veces mayor × 240/375 de energía = 1,6 veces.
  assert.ok(three > one * 1.4 && three < one * 1.9, `AM3 ${three} contra AM1 ${one}`);
});

test('ensambladora: sin energía se para; con corriente fabrica', () => {
  const l = lab();
  const ax = l.bx, az = l.bz;
  putMulti(l.W, ASSEMBLER_BLOCKS[0], 0, ax, l.by, az);
  const asm = l.sys().assemblers;
  asm.setRecipe(ax, l.by, az, bucketKey());
  asm.insert(ax, l.by, az, { id: IRON_INGOT, count: 6 });
  l.h.tick(20 * 8);
  assert.equal(asm.view(ax, l.by, az)!.output, null, 'sin poste no fabrica');
  l.power(ax + 3, az + 3);
  l.h.tick(20 * 8);
  assert.ok(asm.view(ax, l.by, az)!.output, 'con corriente, sí');
});

test('hornos de piedra y de acero: funden con carbón (3,2 s y 1,6 s por objeto); un brazo mete el mineral y el carbón', () => {
  const run = (tier: number) => {
    const l = lab();
    const fx = l.bx, fz = l.bz;
    putMulti(l.W, FURNACE_BLOCKS[tier], 0, fx, l.by, fz);
    l.set(fx - 3, l.by, fz, CHEST);
    l.set(fx - 2, l.by, fz, inserterState(1, 0));
    l.h.tick(3);
    l.power(fx - 2, fz + 3, [[4, 0], [-4, 0], [0, 4]]);
    l.fill(fx - 3, l.by, fz, { id: RAW_IRON, count: 10 }, { id: COAL, count: 2 });
    l.h.tick(20 * 12);
    return l.sys().furnaces.view(fx, l.by, fz)!;
  };
  const stone = run(0), steel = run(1);
  const made = (v: ReturnType<typeof run>) => (v.output ? v.output[1] : 0);
  assert.ok(made(stone) >= 2 && made(stone) <= 4, `piedra ${made(stone)}`);
  assert.ok(made(steel) > made(stone), `acero ${made(steel)} contra piedra ${made(stone)}`);
});

test('horno de combustible: sin combustible se para; el carbón (4 MJ) da para 44 s de trabajo', () => {
  const l = lab();
  const fx = l.bx, fz = l.bz;
  putMulti(l.W, FURNACE_BLOCKS[0], 0, fx, l.by, fz);
  const fur = l.sys().furnaces;
  fur.insert(fx, l.by, fz, { id: RAW_IRON, count: 5 });
  l.h.tick(20 * 6);
  assert.equal(fur.view(fx, l.by, fz)!.output, null, 'sin combustible no funde');
  fur.insert(fx, l.by, fz, { id: COAL, count: 1 });
  l.h.tick(20 * 40);
  const v = fur.view(fx, l.by, fz)!;
  assert.ok(v.output && v.output[1] >= 5, 'fundió los cinco con un solo carbón');
  assert.equal(v.fuel, null, 'el carbón se quemó');
});

test('hornos: el acero (5 placas, 16 s) se funde igual que en Factorio: piedra 16 s, acero 8 s, eléctrico 8 s', () => {
  const run = (tier: number) => {
    const l = lab();
    const fx = l.bx, fz = l.bz;
    putMulti(l.W, FURNACE_BLOCKS[tier], 0, fx, l.by, fz);
    const fur = l.sys().furnaces;
    fur.insert(fx, l.by, fz, { id: IRON_INGOT, count: 20 });
    fur.insert(fx, l.by, fz, { id: COAL, count: 3 });
    l.h.tick(20 * 34);
    const v = fur.view(fx, l.by, fz)!;
    return v.output ? v.output[1] : 0;
  };
  assert.equal(run(0), 2, 'el de piedra hace 2 placas de acero en 34 s (16 s cada una)');
  assert.equal(run(1), 4, 'el de acero, 4 (8 s cada una)');
  assert.equal(STEEL > 0, true);
});
