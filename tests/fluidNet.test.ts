// Programa lunar: el motor de fluidos: se conserva la cantidad, los niveles se igualan, no se mezclan fluidos y un tanque alimenta una fila de tuberías.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FluidGraph } from '../src/shared/logistics/fluidNet';
import { PIPE_VOLUME, TANK_VOLUME, FLUIDS, fluidByName, PUMP_RATE, PIPE_UNDERGROUND_MAX } from '../src/shared/logistics/fluidTypes';

const WATER = fluidByName('water')!.id, OIL = fluidByName('crude-oil')!.id;

test('fluidos: las cifras de Factorio', () => {
  assert.equal(PIPE_VOLUME, 100);
  assert.equal(TANK_VOLUME, 25000);
  assert.equal(PUMP_RATE, 1200);
  assert.equal(PIPE_UNDERGROUND_MAX, 10);
  assert.ok(FLUIDS.length >= 9);
});

test('fluidos: dos tuberías se igualan y no se pierde ni se inventa nada', () => {
  const g = new FluidGraph();
  g.add(1, 100);
  g.add(2, 100);
  g.setEdges([[1, 2]]);
  g.put(1, WATER, 100);
  for (let i = 0; i < 200; i++) g.step();
  const a = g.boxes.get(1)!, b = g.boxes.get(2)!;
  assert.ok(Math.abs(a.amount - 50) < 0.01 && Math.abs(b.amount - 50) < 0.01, `${a.amount} ${b.amount}`);
  assert.ok(Math.abs(a.amount + b.amount - 100) < 1e-6);
  assert.equal(b.fluid, WATER);
});

test('fluidos: un tanque lleno llena una fila de tuberías y se vacía en proporción', () => {
  const g = new FluidGraph();
  g.add(0, TANK_VOLUME);
  for (let i = 1; i <= 10; i++) g.add(i, PIPE_VOLUME);
  const edges: [number, number][] = [];
  for (let i = 0; i < 10; i++) edges.push([i, i + 1]);
  g.setEdges(edges);
  g.put(0, WATER, TANK_VOLUME);
  for (let i = 0; i < 600; i++) g.step();
  // El tanque baja al 96 % al llenar diez tuberías (1 000 de 25 000) y todas quedan al mismo nivel.
  for (let i = 1; i <= 10; i++) assert.ok(Math.abs(g.boxes.get(i)!.amount - 96) < 0.5, `tubería ${i}: ${g.boxes.get(i)!.amount}`);
  const total = [...g.boxes.values()].reduce((s, b) => s + b.amount, 0);
  assert.ok(Math.abs(total - TANK_VOLUME) < 1e-4);
});

test('fluidos: no se mezclan; una tubería vacía acepta cualquiera', () => {
  const g = new FluidGraph();
  g.add(1, 100);
  g.add(2, 100);
  g.add(3, 100);
  g.setEdges([[1, 2], [2, 3]]);
  g.put(1, WATER, 100);
  g.put(3, OIL, 100);
  for (let i = 0; i < 100; i++) g.step();
  assert.equal(g.boxes.get(2)!.fluid !== 0, true);
  const f2 = g.boxes.get(2)!.fluid;
  // La del medio cogió uno de los dos y el otro se queda fuera; nunca hay mezcla.
  assert.ok(f2 === WATER || f2 === OIL);
  assert.equal(g.boxes.get(1)!.fluid === WATER || g.boxes.get(1)!.amount === 0, true);
  assert.equal(g.boxes.get(3)!.fluid === OIL || g.boxes.get(3)!.amount === 0, true);
  assert.ok(g.boxes.get(2)!.amount + g.boxes.get(1)!.amount + g.boxes.get(3)!.amount <= 200 + 1e-6);
});

test('fluidos: un tanque a medias sólo llena un poco de una tubería; nada fluye entre cajas al mismo nivel', () => {
  const g = new FluidGraph();
  g.add(1, 100);
  g.add(2, 100);
  g.setEdges([[1, 2]]);
  g.put(1, WATER, 50);
  g.put(2, WATER, 50);
  for (let i = 0; i < 50; i++) g.step();
  assert.ok(Math.abs(g.boxes.get(1)!.amount - 50) < 1e-6);
  assert.equal(g.take(1, 30), 30);
  assert.equal(g.put(1, OIL, 10), 0, 'con agua dentro no entra petróleo');
  assert.equal(g.take(1, 1000), 20);
  assert.equal(g.boxes.get(1)!.fluid, 0, 'vacía: sin fluido');
});
