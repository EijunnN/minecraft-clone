// Programa lunar: la investigación de Factorio: tecnologías con disparador, cola, laboratorios que gastan paquetes de ciencia, recetas que se
// desbloquean y bonificaciones; se guarda con el mundo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AIR, STONE, SOLAR_PANEL, POLE_MEDIUM, LAB_BLOCK, ASSEMBLER_BLOCKS } from '../src/shared/blocks';
import { IRON_INGOT, COPPER_INGOT, FACTORIO_NEW } from '../src/shared/items';
import { factorioRecipeByName } from '../src/shared/factorio/catalog';
import { MemoryStore } from '../src/shared/sim/store';
import { makeServer } from './harness';
import { putMulti } from './multi';

function lab(store?: MemoryStore) {
  const h = makeServer(4243, store);
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
  const sys = () => h.gs.sys;
  const power = () => {
    (h.gs as unknown as { setTime(d: number): void }).setTime(10.25);
    W.setBlock(bx + 3, by, bz + 3, POLE_MEDIUM);
    for (const [dx, dz] of [[4, 0], [-4, 0], [0, 4], [0, -4]]) putMulti(W, SOLAR_PANEL, 0, bx + 3 + dx, by, bz + 3 + dz);
    h.tick(3);
  };
  return { h, c, bx, by, bz, W, sys, power };
}

const RED = () => FACTORIO_NEW['automation-science-pack'];

test('investigación: las tecnologías con disparador se abren al fabricar lo pedido y desbloquean sus recetas', () => {
  const l = lab();
  const r = l.sys().research;
  assert.equal(r.recipeUnlocked('iron-gear-wheel'), true, 'el engranaje viene abierto');
  assert.equal(r.recipeUnlocked('electronic-circuit'), false);
  r.noteProduced(COPPER_INGOT, 9);
  assert.equal(r.isDone('electronics'), false);
  r.noteProduced(COPPER_INGOT, 1);
  assert.equal(r.isDone('electronics'), true, '10 placas de cobre abren «electronics»');
  for (const n of ['electronic-circuit', 'copper-cable', 'lab', 'inserter', 'small-electric-pole']) assert.equal(r.recipeUnlocked(n), true, n);
  r.noteProduced(IRON_INGOT, 50);
  assert.equal(r.isDone('steam-power'), true);
  // Ya no pide esperar: ahora se puede empezar la que sale al fabricar un laboratorio.
  r.noteProduced(LAB_BLOCK, 1);
  assert.equal(r.isDone('automation-science-pack'), true);
  assert.equal(r.recipeUnlocked('automation-science-pack'), true);
});

test('investigación: una tecnología con coste no se encola sin sus prerrequisitos; con ellos, sí', () => {
  const l = lab();
  const r = l.sys().research;
  assert.equal(r.request('automation', true), false, 'antes hay que abrir la ciencia roja');
  r.noteProduced(COPPER_INGOT, 10);
  r.noteProduced(IRON_INGOT, 50);
  r.noteProduced(LAB_BLOCK, 1);
  assert.equal(r.request('automation', true), true);
  assert.deepEqual(r.queued, ['automation']);
  assert.equal(r.current!.unit!.count, 10);
  assert.equal(r.request('automation', true), false, 'ya está en cola');
  assert.equal(r.request('automation', false), true);
  assert.deepEqual(r.queued, []);
});

test('laboratorio: gasta un paquete rojo por unidad y 10 s cada una; a las 10 unidades la tecnología queda hecha', () => {
  const l = lab();
  const r = l.sys().research;
  r.noteProduced(COPPER_INGOT, 10);
  r.noteProduced(IRON_INGOT, 50);
  r.noteProduced(LAB_BLOCK, 1);
  putMulti(l.W, LAB_BLOCK, 0, l.bx, l.by, l.bz);
  l.power();
  r.request('automation', true);
  const labs = l.sys().labs;
  assert.equal(labs.accepts(l.bx, l.by, l.bz, { id: RED(), count: 1 }), true);
  assert.equal(labs.accepts(l.bx, l.by, l.bz, { id: IRON_INGOT, count: 1 }), false, 'sólo paquetes de ciencia');
  assert.equal(labs.insert(l.bx, l.by, l.bz, { id: RED(), count: 5 }), 2, 'dos unidades como mucho');
  let fed = 2;
  for (let t = 0; t < 20 * 40 && fed < 20; t++) {
    l.h.tick(1);
    if (t % 20 === 0) fed += labs.insert(l.bx, l.by, l.bz, { id: RED(), count: 2 });
  }
  // 40 s de trabajo ≈ 4 unidades (10 s cada una).
  assert.ok(r.units >= 3 && r.units <= 4, `unidades ${r.units}`);
  for (let t = 0; t < 20 * 80 && !r.isDone('automation'); t++) {
    l.h.tick(1);
    if (t % 20 === 0) labs.insert(l.bx, l.by, l.bz, { id: RED(), count: 2 });
  }
  assert.equal(r.isDone('automation'), true);
  assert.equal(r.recipeUnlocked('assembling-machine-1'), true, 'desbloquea la ensambladora 1');
  assert.equal(r.recipeUnlocked('long-handed-inserter'), true);
});

test('laboratorio: sin energía no avanza', () => {
  const l = lab();
  const r = l.sys().research;
  r.noteProduced(COPPER_INGOT, 10);
  r.noteProduced(IRON_INGOT, 50);
  r.noteProduced(LAB_BLOCK, 1);
  putMulti(l.W, LAB_BLOCK, 0, l.bx, l.by, l.bz);
  r.request('automation', true);
  l.sys().labs.insert(l.bx, l.by, l.bz, { id: RED(), count: 2 });
  l.h.tick(20 * 30);
  assert.equal(r.units, 0);
});

test('ensambladoras y hornos: sólo usan recetas desbloqueadas', () => {
  const l = lab();
  const r = l.sys().research;
  putMulti(l.W, ASSEMBLER_BLOCKS[0], 0, l.bx, l.by, l.bz);
  const asm = l.sys().assemblers;
  const key = (n: string) => factorioRecipeByName(n)!.key;
  assert.equal(asm.setRecipe(l.bx, l.by, l.bz, key('electronic-circuit')), false, 'los circuitos aún no');
  assert.equal(asm.setRecipe(l.bx, l.by, l.bz, key('iron-gear-wheel')), true);
  r.noteProduced(COPPER_INGOT, 10);
  assert.equal(asm.setRecipe(l.bx, l.by, l.bz, key('electronic-circuit')), true, 'con «electronics» ya');
  assert.equal(r.recipeUnlocked('steel-plate'), false, 'el acero necesita «steel-processing»');
});

test('investigación: se guarda y las estadísticas de fabricación también', () => {
  const store = new MemoryStore();
  const a = lab(store);
  a.sys().research.noteProduced(COPPER_INGOT, 10);
  a.sys().research.noteProduced(IRON_INGOT, 30);
  a.h.tick(5);
  a.h.gs.flush(true);
  const b = lab(store);
  assert.equal(b.sys().research.isDone('electronics'), true);
  b.sys().research.noteProduced(IRON_INGOT, 20);
  assert.equal(b.sys().research.isDone('steam-power'), true, 'los 30 de antes cuentan');
});

test('investigación: el servidor manda el estado al entrar y al cambiar', () => {
  const l = lab();
  l.sys().research.noteProduced(COPPER_INGOT, 10);
  l.h.tick(2);
  const msgs = l.c.conn.take('research');
  assert.ok(msgs.length >= 1);
  assert.ok((msgs[msgs.length - 1].done as string[]).includes('electronics'));
  l.c.send({ t: 'rq', tech: 'automation', add: true });
  l.h.tick(2);
  assert.equal(l.c.conn.take('research').length, 0, 'todavía no se puede (falta la ciencia roja)');
});
