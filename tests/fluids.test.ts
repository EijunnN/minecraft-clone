// Programa lunar: tuberías, tuberías subterráneas, tanques, bombas y bombas de agua en el servidor.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AIR, STONE, WATER, PIPE, PIPE_TO_GROUND, STORAGE_TANK, PUMP, OFFSHORE_PUMP, SOLAR_PANEL, POLE_MEDIUM, pipeMask, undergroundPipeState,
} from '../src/shared/blocks';
import { fluidByName, TANK_VOLUME, PIPE_VOLUME } from '../src/shared/logistics/fluidTypes';
import { MemoryStore } from '../src/shared/sim/store';
import { makeServer } from './harness';
import { putMulti } from './multi';

const W_ID = fluidByName('water')!.id;

function lab(store?: MemoryStore, clear = true) {
  const h = makeServer(4243, store);
  const c = h.join('Ingeniera', 'c');
  const [sx, , sz] = c.welcome.spawn as [number, number, number];
  const bx = Math.floor(sx), by = 160, bz = Math.floor(sz);
  c.pos(bx + 0.5, by + 30, bz + 0.5);
  h.tick(60);
  const W = h.gs.world;
  if (clear) for (let dx = -24; dx <= 24; dx++) {
    for (let dz = -24; dz <= 24; dz++) {
      W.setBlock(bx + dx, by - 1, bz + dz, STONE);
      for (let y = by; y < by + 40; y++) W.setBlock(bx + dx, y, bz + dz, AIR);
    }
  }
  h.tick(2);
  const set = (x: number, y: number, z: number, id: number) => void W.setBlock(x, y, z, id);
  const sys = () => h.gs.sys;
  const power = (cx: number, cz: number, sides: number[][] = [[4, 0], [-4, 0], [0, 4], [0, -4]]) => {
    (h.gs as unknown as { setTime(d: number): void }).setTime(10.25);
    set(cx, by, cz, POLE_MEDIUM);
    for (const [dx, dz] of sides) putMulti(W, SOLAR_PANEL, 0, cx + dx, by, cz + dz);
    h.tick(3);
  };
  return { h, c, bx, by, bz, W, set, sys, power };
}

test('tuberías: cada una une las caras que tienen algo con lo que unirse (y sólo esas)', () => {
  const l = lab();
  l.set(l.bx, l.by, l.bz, PIPE);
  l.set(l.bx + 1, l.by, l.bz, PIPE);
  l.set(l.bx + 1, l.by + 1, l.bz, PIPE);
  l.h.tick(3);
  const at = (x: number, y: number, z: number) => pipeMask(l.W.getBlock(x, y, z));
  assert.equal(at(l.bx, l.by, l.bz), 1, 'la primera sólo mira a +x');
  assert.equal(at(l.bx + 1, l.by, l.bz), 0b000110, 'la de en medio: −x y arriba (+y)');
  assert.equal(at(l.bx + 1, l.by + 1, l.bz), 0b001000, 'la de arriba sólo mira abajo (−y)');
  l.set(l.bx + 1, l.by + 1, l.bz, AIR);
  l.h.tick(3);
  assert.equal(at(l.bx + 1, l.by, l.bz), 0b000010, 'al quitar la de arriba, se le quita el brazo');
});

test('fluidos: un tanque reparte a un tramo de tuberías hasta otro tanque y se igualan los niveles', () => {
  const l = lab();
  putMulti(l.W, STORAGE_TANK, 0, l.bx, l.by, l.bz);
  putMulti(l.W, STORAGE_TANK, 0, l.bx + 5, l.by, l.bz);
  for (let x = l.bx + 2; x <= l.bx + 3; x++) l.set(x, l.by, l.bz, PIPE);
  l.h.tick(3);
  const f = l.sys().fluids;
  assert.equal(f.put(l.bx, l.by, l.bz, W_ID, 20000), 20000);
  l.h.tick(20 * 120);
  const a = f.boxAt(l.bx, l.by, l.bz)!, b = f.boxAt(l.bx + 5, l.by, l.bz)!;
  assert.ok(Math.abs(a.amount - b.amount) < 200, `A ${a.amount} B ${b.amount}`);
  assert.ok(Math.abs(a.amount + b.amount + 2 * (a.amount / TANK_VOLUME) * PIPE_VOLUME - 20000) < 300, 'no se pierde nada (salvo lo que llevan las tuberías)');
});

test('tuberías subterráneas: se emparejan a hasta 10 casillas y pasan el fluido por debajo de lo que haya en medio', () => {
  const l = lab();
  // Tuberías: [ tanque ][pipe][ug →]  ...  [← ug][pipe][ tanque ]. La punta mira hacia fuera (dir 0 = +x asoma por +x).
  putMulti(l.W, STORAGE_TANK, 0, l.bx, l.by, l.bz);
  l.set(l.bx + 2, l.by, l.bz, PIPE);
  l.set(l.bx + 3, l.by, l.bz, undergroundPipeState(2)); // punta que asoma por −x (hacia el tanque); baja hacia +x
  l.set(l.bx + 12, l.by, l.bz, undergroundPipeState(0)); // punta que asoma por +x; baja hacia −x: 9 casillas de tierra en medio
  l.set(l.bx + 13, l.by, l.bz, PIPE);
  putMulti(l.W, STORAGE_TANK, 0, l.bx + 15, l.by, l.bz);
  l.set(l.bx + 8, l.by, l.bz, STONE); // algo en medio
  l.h.tick(3);
  const f = l.sys().fluids;
  assert.equal(f.partnerAt(l.bx + 3, l.by, l.bz) >= 0, true, 'se emparejan');
  f.put(l.bx, l.by, l.bz, W_ID, 10000);
  l.h.tick(20 * 90);
  assert.ok(f.boxAt(l.bx + 15, l.by, l.bz)!.amount > 3000, `llega ${f.boxAt(l.bx + 15, l.by, l.bz)!.amount}`);
  // Más de 10 casillas: no se emparejan.
  l.set(l.bx + 12, l.by, l.bz, AIR);
  l.set(l.bx + 14, l.by, l.bz, undergroundPipeState(0));
  l.h.tick(3);
  assert.equal(f.partnerAt(l.bx + 3, l.by, l.bz), -1, 'a 11 casillas ya no');
});

test('bomba: mueve de la caja de detrás a la de delante (a 1 200/s) con energía; sin energía no', () => {
  const run = (powered: boolean) => {
    const l = lab();
    putMulti(l.W, STORAGE_TANK, 0, l.bx, l.by, l.bz);
    // bomba mirando a +x: casilla principal (delante) en bx+4, la de atrás en bx+3; tubería pegada a cada extremo.
    l.set(l.bx + 2, l.by, l.bz, PIPE);
    putMulti(l.W, PUMP, 0, l.bx + 4, l.by, l.bz);
    l.set(l.bx + 5, l.by, l.bz, PIPE);
    putMulti(l.W, STORAGE_TANK, 0, l.bx + 8, l.by, l.bz);
    l.set(l.bx + 6, l.by, l.bz, PIPE);
    l.h.tick(3);
    if (powered) l.power(l.bx + 4, l.bz + 3, [[4, 0], [-4, 0], [0, 4]]);
    l.sys().fluids.put(l.bx, l.by, l.bz, W_ID, 24000);
    l.h.tick(20 * 8);
    return l.sys().fluids.boxAt(l.bx + 8, l.by, l.bz)!.amount;
  };
  const on = run(true), off = run(false);
  assert.ok(on > 6000 && on < 9700, `con energía: ${on}`);
  assert.equal(off, 0, 'sin energía no mueve nada');
});

test('bomba de agua: con agua detrás llena su tubería y el tanque a unos 1 200/s', () => {
  const l = lab();
  l.set(l.bx, l.by - 1, l.bz - 1, WATER);
  // Bomba mirando a +x (sale por +x): el agua debe estar en −x.
  l.set(l.bx - 1, l.by - 1, l.bz, WATER);
  l.set(l.bx, l.by, l.bz, OFFSHORE_PUMP + 0);
  l.set(l.bx + 1, l.by, l.bz, PIPE);
  putMulti(l.W, STORAGE_TANK, 0, l.bx + 3, l.by, l.bz);
  l.h.tick(3);
  l.h.tick(20 * 10);
  const t = l.sys().fluids.boxAt(l.bx + 3, l.by, l.bz)!;
  assert.equal(t.fluid, W_ID);
  assert.ok(t.amount > 8000 && t.amount <= 12100, `tanque ${t.amount}`);
  // Sin agua detrás no da nada.
  const k = lab();
  k.set(k.bx, k.by, k.bz, OFFSHORE_PUMP + 0);
  k.set(k.bx + 1, k.by, k.bz, PIPE);
  k.h.tick(20 * 3);
  assert.equal(k.sys().fluids.boxAt(k.bx + 1, k.by, k.bz)!.amount, 0);
});

test('fluidos: se guardan con el mundo', () => {
  const store = new MemoryStore();
  const a = lab(store);
  putMulti(a.W, STORAGE_TANK, 0, a.bx, a.by, a.bz);
  a.h.tick(3);
  a.sys().fluids.put(a.bx, a.by, a.bz, W_ID, 5000);
  a.h.tick(5);
  a.h.gs.flush(true);
  const b = lab(store, false); // (el tanque ya está en el mundo guardado)
  b.h.tick(3);
  assert.equal(Math.round(b.sys().fluids.boxAt(b.bx, b.by, b.bz)!.amount), 5000);
});

void PIPE_TO_GROUND;
