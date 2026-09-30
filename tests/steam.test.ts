// Programa lunar: energía de vapor: caldera (agua + combustible → vapor) y máquina de vapor (vapor → red), a demanda, con la red de fluidos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AIR, STONE, PIPE, STORAGE_TANK, BOILER, STEAM_ENGINE, ELECTRIC_SMELTER, POLE_MEDIUM } from '../src/shared/blocks';
import { COAL, RAW_IRON } from '../src/shared/items';
import { fluidByName } from '../src/shared/logistics/fluidTypes';
import { makeServer } from './harness';
import { putMulti } from './multi';

const WATER = fluidByName('water')!.id;

function build() {
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
  // Caldera mirando al norte (dir 3): controlador (bx, bz); agua por el extremo de +x (pipe en bx+2, bz+1); vapor por delante (pipe en bx, bz-1).
  putMulti(W, BOILER, 3, bx, by, bz);
  set(bx + 2, by, bz + 1, PIPE);
  putMulti(W, STORAGE_TANK, 0, bx + 4, by, bz + 1);
  set(bx, by, bz - 1, PIPE);
  // Máquina de vapor en fila hacia el norte; su extremo de +z toca la tubería del vapor.
  putMulti(W, STEAM_ENGINE, 3, bx, by, bz - 4);
  // Un horno eléctrico (180 kW) y un poste mediano que toca a los dos.
  putMulti(W, ELECTRIC_SMELTER, 0, bx + 6, by, bz - 4);
  set(bx + 3, by, bz - 4, POLE_MEDIUM);
  h.tick(3);
  return { h, c, bx, by, bz, W, set, sys };
}

test('vapor: agua + carbón en la caldera dan vapor, y la máquina de vapor da a la red sólo lo que pide el horno (180 kW)', () => {
  const b = build();
  const s = b.sys();
  s.fluids.put(b.bx + 4, b.by, b.bz + 1, WATER, 20000);
  assert.equal(s.steam.insert(b.bx, b.by, b.bz, { id: COAL, count: 10 }), 10);
  s.machines.insert(b.bx + 6, b.by, b.bz - 4, { id: RAW_IRON, count: 30 });
  b.h.tick(20 * 30);
  const info = s.power.info(b.bx + 6, b.by, b.bz - 4)!;
  assert.ok(info, 'el horno está en la red');
  const eng = s.steam.engineView(b.bx, b.by, b.bz - 4)!;
  assert.ok(eng.kw > 170 && eng.kw < 190, `la máquina da ${eng.kw} kW`);
  const out = s.machines.peek(b.bx + 6, b.by, b.bz - 4)!;
  assert.ok((out.output?.count ?? 0) >= 10, `el horno fundió ${out.output?.count}`);
  const boiler = s.steam.boilerView(b.bx, b.by, b.bz)!;
  assert.ok(boiler.water < 200, 'la caldera gasta agua (del tanque)');
  assert.ok(s.fluids.boxAt(b.bx + 4, b.by, b.bz + 1)!.amount < 20000, 'y el tanque baja');
});

test('vapor: sin combustible no hay vapor ni energía; con el vapor guardado la máquina sigue un rato', () => {
  const b = build();
  const s = b.sys();
  s.fluids.put(b.bx + 4, b.by, b.bz + 1, WATER, 20000);
  s.machines.insert(b.bx + 6, b.by, b.bz - 4, { id: RAW_IRON, count: 30 });
  b.h.tick(20 * 10);
  assert.equal(s.steam.engineView(b.bx, b.by, b.bz - 4)!.kw, 0, 'sin carbón no hay energía');
  assert.equal(s.machines.peek(b.bx + 6, b.by, b.bz - 4)!.output, null);
  s.steam.insert(b.bx, b.by, b.bz, { id: COAL, count: 1 });
  b.h.tick(20 * 8);
  assert.ok((s.machines.peek(b.bx + 6, b.by, b.bz - 4)!.output?.count ?? 0) >= 1, 'con carbón sí');
});

test('vapor: el carbón (4 MJ) rinde 4000 kJ de vapor: a 180 kW dura unos 22 s; sin agua la caldera no hace vapor', () => {
  const b = build();
  const s = b.sys();
  s.fluids.put(b.bx + 4, b.by, b.bz + 1, WATER, 20000);
  s.steam.insert(b.bx, b.by, b.bz, { id: COAL, count: 1 });
  s.machines.insert(b.bx + 6, b.by, b.bz - 4, { id: RAW_IRON, count: 64 });
  b.h.tick(20 * 60);
  const made = s.machines.peek(b.bx + 6, b.by, b.bz - 4)!.output?.count ?? 0;
  // 4 000 kJ ÷ 180 kW ≈ 22 s de horno a 1,6 s por objeto ≈ 14 objetos (más lo que quedó de vapor en las cajas).
  assert.ok(made >= 10 && made <= 20, `fundió ${made}`);
  const dry = build();
  dry.sys().steam.insert(dry.bx, dry.by, dry.bz, { id: COAL, count: 5 });
  dry.h.tick(20 * 5);
  assert.equal(dry.sys().steam.boilerView(dry.bx, dry.by, dry.bz)!.steam, 0, 'sin agua, sin vapor');
});

test('planta química y refinería: el petróleo crudo se refina en gas y el gas + carbón da plástico (recetas de Factorio)', async () => {
  const { ASSEMBLER_BLOCKS, STORAGE_TANK, SOLAR_PANEL } = await import('../src/shared/blocks');
  const { factorioRecipeByName } = await import('../src/shared/factorio/catalog');
  const { FACTORIO_NEW } = await import('../src/shared/items');
  const b = build();
  const s = b.sys();
  s.research.grantAll();
  const gas = fluidByName('petroleum-gas')!.id, crude = fluidByName('crude-oil')!.id;
  // Refinería (5×5) mirando al norte (dir 3): entradas por el sur (z+2), salidas por el norte (z−3). Ancla en (rx, rz).
  const rx = b.bx - 12, rz = b.bz + 12;
  putMulti(b.W, ASSEMBLER_BLOCKS[4], 3, rx, b.by, rz);
  // Tanque de crudo pegado a la entrada 2 (x = rx+1, cara sur → tubería en z+3), y tanque de gas a la salida 3 (x = rx+2, cara norte).
  b.set(rx + 1, b.by, rz + 3, PIPE);
  putMulti(b.W, STORAGE_TANK, 0, rx + 1, b.by, rz + 5);
  b.set(rx + 2, b.by, rz - 3, PIPE);
  putMulti(b.W, STORAGE_TANK, 0, rx + 2, b.by, rz - 5);
  // Dos postes y 8 paneles (420 kW hacen falta).
  b.set(rx + 4, b.by, rz + 3, POLE_MEDIUM);
  (b.h.gs as unknown as { setTime(d: number): void }).setTime(10.25);
  b.set(rx + 12, b.by, rz + 3, POLE_MEDIUM);
  for (const [px, pz] of [[8, 3], [4, 7], [8, 7], [4, -1], [8, -1], [16, 3], [12, 7], [12, -1]]) putMulti(b.W, SOLAR_PANEL, 0, rx + px, b.by, rz + pz);
  b.h.tick(3);
  assert.equal(s.assemblers.setRecipe(rx, b.by, rz, factorioRecipeByName('basic-oil-processing')!.key), true);
  s.fluids.put(rx + 1, b.by, rz + 5, crude, 5000);
  b.h.tick(20 * 40);
  const outGas = s.fluids.boxAt(rx + 2, b.by, rz - 5)!;
  assert.equal(outGas.fluid, gas, 'sale gas de petróleo');
  assert.ok(outGas.amount > 200, `gas ${outGas.amount}`);
  assert.ok(s.fluids.boxAt(rx + 1, b.by, rz + 5)!.amount < 5000, 'y gasta crudo');
  assert.equal(FACTORIO_NEW['plastic-bar'] > 0, true);
});

test('planta química: gas de petróleo + carbón → 2 barras de plástico por segundo de receta (Factorio), gastando 20 de gas y 1 de carbón', async () => {
  const { ASSEMBLER_BLOCKS, STORAGE_TANK, SOLAR_PANEL } = await import('../src/shared/blocks');
  const { factorioRecipeByName } = await import('../src/shared/factorio/catalog');
  const { FACTORIO_NEW, COAL } = await import('../src/shared/items');
  const b = build();
  const s = b.sys();
  s.research.grantAll();
  const gas = fluidByName('petroleum-gas')!.id;
  const cx = b.bx + 12, cz = b.bz + 12;
  putMulti(b.W, ASSEMBLER_BLOCKS[3], 3, cx, b.by, cz);
  b.set(cx - 1, b.by, cz - 2, PIPE);
  putMulti(b.W, STORAGE_TANK, 0, cx - 1, b.by, cz - 4);
  b.set(cx + 4, b.by, cz + 1, POLE_MEDIUM);
  (b.h.gs as unknown as { setTime(d: number): void }).setTime(10.25);
  for (const [px, pz] of [[8, 1], [4, 5], [4, -3]]) putMulti(b.W, SOLAR_PANEL, 0, cx + px, b.by, cz + pz);
  b.h.tick(3);
  assert.equal(s.assemblers.setRecipe(cx, b.by, cz, factorioRecipeByName('plastic-bar')!.key), true);
  s.fluids.put(cx - 1, b.by, cz - 4, gas, 10000);
  let coal = 0;
  for (let i = 0; i < 20 * 12; i++) {
    coal += s.assemblers.insert(cx, b.by, cz, { id: COAL, count: 1 }); // (un brazo lo iría metiendo: la máquina sólo guarda dos tandas)
    b.h.tick(1);
  }
  const v = s.assemblers.view(cx, b.by, cz)!;
  const made = v.output?.[1] ?? 0;
  // 12 s ÷ (1 s de receta ÷ 1 de velocidad ÷ 0,86 de energía) ≈ 10 tandas → 20 barras.
  assert.ok(made >= 16 && made <= 24, `barras ${made}`);
  assert.equal(made, (coal - (v.needs[0]?.[1] ?? 0)) * 2, '2 barras por cada carbón gastado');
  assert.equal(v.output?.[0], FACTORIO_NEW['plastic-bar']);
});
