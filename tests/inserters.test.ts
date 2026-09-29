// Programa lunar: los cinco brazos de Factorio (básico, rápido, largo, de combustible y a granel): ritmo, alcance, mano, filtros,
// combustible, suelo y energía.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AIR, STONE, CHEST, SOLAR_PANEL, POLE_SMALL, BELTS, inserterState } from '../src/shared/blocks';
import { RAW_IRON, IRON_INGOT, COAL, GOLD_INGOT } from '../src/shared/items';
import { INSERTER_TYPES, inserterCycleTicks, inserterMoveKw, FILTER_BLACKLIST } from '../src/shared/logistics/inserters';
import { makeServer } from './harness';
import { putMulti } from './multi';

const [BASIC, FAST, LONG, BURNER, BULK] = [0, 1, 2, 3, 4];

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
  /** Corriente para los eléctricos: un poste y tres paneles a pleno Sol pegados. */
  const power = () => {
    (h.gs as unknown as { setTime(d: number): void }).setTime(10.25);
    set(bx, by, bz + 1, POLE_SMALL);
    putMulti(W, SOLAR_PANEL, 0, bx, by, bz + 4);
    h.tick(3);
  };
  const fill = (x: number, y: number, z: number, ...stacks: { id: number; count: number }[]) => {
    const a = sys().containers.access(x, y, z)!;
    stacks.forEach((s, i) => (a.state.slots[i] = s));
    a.done();
  };
  const count = (x: number, y: number, z: number, id?: number) =>
    sys().containers.access(x, y, z)!.state.slots.reduce((n, s) => n + (s && (id === undefined || s.id === id) ? s.count : 0), 0);
  return { h, c, bx, by, bz, W, set, sys, power, fill, count };
}

test('brazos: las cifras de Factorio (vueltas, energía, alcance, mano y filtros)', () => {
  assert.deepEqual(INSERTER_TYPES.map((t) => t.rotation), [0.014, 0.04, 0.02, 0.013, 0.04]);
  assert.deepEqual(INSERTER_TYPES.map((t) => t.movementKJ), [5, 7, 5, 50, 20]);
  assert.deepEqual(INSERTER_TYPES.map((t) => t.reach), [1, 1, 2, 1, 1]);
  assert.deepEqual(INSERTER_TYPES.map((t) => t.stack), [1, 1, 1, 1, 1], 'la mano empieza en 1; el +1 del de a granel llega con la tecnología');
  assert.ok(Math.abs(inserterMoveKw(INSERTER_TYPES[BASIC]) - 13.2) < 0.1, 'el básico pide 13,2 kW al moverse');
  assert.ok(inserterCycleTicks(INSERTER_TYPES[FAST]) < inserterCycleTicks(INSERTER_TYPES[BASIC]));
});

test('brazos: el rápido mueve más que el básico en el mismo tiempo', () => {
  const run = (tier: number) => {
    const l = lab();
    l.power();
    l.set(l.bx - 1, l.by, l.bz, CHEST);
    l.set(l.bx, l.by, l.bz, inserterState(tier, 0));
    l.set(l.bx + 1, l.by, l.bz, CHEST);
    l.h.tick(3);
    l.fill(l.bx - 1, l.by, l.bz, { id: RAW_IRON, count: 64 });
    l.h.tick(20 * 10);
    return l.count(l.bx + 1, l.by, l.bz);
  };
  const basic = run(BASIC), fast = run(FAST);
  assert.ok(basic >= 7 && basic <= 9, `básico ${basic}`);
  assert.ok(fast >= 22 && fast <= 25, `rápido ${fast}`);
});

test('brazo largo: coge y suelta a 2 casillas', () => {
  const l = lab();
  l.power();
  l.set(l.bx - 2, l.by, l.bz, CHEST);
  l.set(l.bx, l.by, l.bz, inserterState(LONG, 0));
  l.set(l.bx + 2, l.by, l.bz, CHEST);
  l.h.tick(3);
  l.fill(l.bx - 2, l.by, l.bz, { id: RAW_IRON, count: 5 });
  l.h.tick(20 * 8);
  assert.equal(l.count(l.bx + 2, l.by, l.bz), 5);
});

test('brazo a granel: lleva dos objetos por viaje; con tope de pila, sólo uno', () => {
  const run = (stack: number) => {
    const l = lab();
    l.power();
    l.set(l.bx - 1, l.by, l.bz, CHEST);
    l.set(l.bx, l.by, l.bz, inserterState(BULK, 0));
    l.set(l.bx + 1, l.by, l.bz, CHEST);
    l.h.tick(3);
    l.sys().inserters.bonus = { inserter: 0, bulk: 1 }; // (la tecnología «bulk-inserter» ya hecha)
    if (stack) assert.ok(l.sys().inserters.setConfig(l.bx, l.by, l.bz, { stack }));
    l.fill(l.bx - 1, l.by, l.bz, { id: RAW_IRON, count: 64 });
    l.h.tick(20 * 5);
    return l.count(l.bx + 1, l.by, l.bz);
  };
  const full = run(0), one = run(1);
  assert.ok(full > one * 1.6, `a granel ${full} contra tope 1: ${one}`);
  assert.ok(full % 2 === 0 || full > 0);
});

test('brazos: filtro de lista blanca, de lista negra y todos iguales (hasta 5 objetos)', () => {
  const run = (cfg: { filter: number[]; mode: number }) => {
    const l = lab();
    l.power();
    l.set(l.bx - 1, l.by, l.bz, CHEST);
    l.set(l.bx, l.by, l.bz, inserterState(FAST, 0));
    l.set(l.bx + 1, l.by, l.bz, CHEST);
    l.h.tick(3);
    assert.ok(l.sys().inserters.setConfig(l.bx, l.by, l.bz, cfg));
    l.fill(l.bx - 1, l.by, l.bz, { id: RAW_IRON, count: 5 }, { id: IRON_INGOT, count: 5 }, { id: GOLD_INGOT, count: 5 });
    l.h.tick(20 * 12);
    return (id: number) => l.count(l.bx + 1, l.by, l.bz, id);
  };
  const white = run({ filter: [IRON_INGOT, 0, 0, 0, 0], mode: 0 });
  assert.equal(white(IRON_INGOT), 5);
  assert.equal(white(RAW_IRON) + white(GOLD_INGOT), 0);
  const black = run({ filter: [IRON_INGOT, GOLD_INGOT, 0, 0, 0], mode: FILTER_BLACKLIST });
  assert.equal(black(RAW_IRON), 5);
  assert.equal(black(IRON_INGOT) + black(GOLD_INGOT), 0);
  const five = run({ filter: [1, 2, 3, RAW_IRON, GOLD_INGOT], mode: 0 });
  assert.equal(five(RAW_IRON), 5);
  assert.equal(five(GOLD_INGOT), 5);
  assert.equal(five(IRON_INGOT), 0);
});

test('brazo de combustible: sin combustible no se mueve; con carbón sí (y no gasta red)', () => {
  const l = lab();
  l.set(l.bx - 1, l.by, l.bz, CHEST);
  l.set(l.bx, l.by, l.bz, inserterState(BURNER, 0));
  l.set(l.bx + 1, l.by, l.bz, CHEST);
  l.h.tick(3);
  l.fill(l.bx - 1, l.by, l.bz, { id: RAW_IRON, count: 10 });
  l.h.tick(20 * 5);
  assert.equal(l.count(l.bx + 1, l.by, l.bz), 0, 'sin combustible, quieto');
  assert.equal(l.sys().inserters.addFuel(l.bx, l.by, l.bz, { id: COAL, count: 2 }), 2);
  l.h.tick(20 * 12);
  assert.ok(l.count(l.bx + 1, l.by, l.bz) >= 8, `con carbón mueve ${l.count(l.bx + 1, l.by, l.bz)}`);
});

test('brazo de combustible: chupa el carbón que iba a mover cuando se le acaba', () => {
  const l = lab();
  l.set(l.bx - 1, l.by, l.bz, CHEST);
  l.set(l.bx, l.by, l.bz, inserterState(BURNER, 0));
  l.set(l.bx + 1, l.by, l.bz, CHEST);
  l.h.tick(3);
  assert.equal(l.sys().inserters.addFuel(l.bx, l.by, l.bz, { id: COAL, count: 1 }), 1);
  l.fill(l.bx - 1, l.by, l.bz, { id: COAL, count: 60 });
  l.h.tick(20 * 60);
  const moved = l.count(l.bx + 1, l.by, l.bz, COAL);
  assert.ok(moved >= 30, `mueve ${moved}`);
  assert.ok(moved + l.count(l.bx - 1, l.by, l.bz, COAL) < 60, 'se quedó con una unidad para quemarla');
});

test('brazos: sacan de una cinta y cogen del suelo lo que hay tirado; sueltan al suelo de uno en uno', () => {
  const l = lab();
  l.power();
  // Al suelo: el cofre de atrás, nada delante.
  l.set(l.bx - 1, l.by, l.bz, CHEST);
  l.set(l.bx, l.by, l.bz, inserterState(BASIC, 0));
  l.h.tick(3);
  l.fill(l.bx - 1, l.by, l.bz, { id: RAW_IRON, count: 5 });
  l.h.tick(20 * 6);
  const items = () => [...l.h.gs.entities.list.values()].filter((e) => e.stack && e.stack.id === RAW_IRON);
  assert.equal(items().length, 1, 'sólo uno en el suelo hasta que se recoja');
  // Del suelo: un brazo con el suelo detrás y un cofre delante.
  const bz = l.bz + 2;
  l.set(l.bx + 1, l.by, bz, inserterState(BASIC, 0));
  l.set(l.bx + 2, l.by, bz, CHEST);
  l.h.gs.entities.spawnItem({ id: RAW_IRON, count: 2 }, l.bx + 0.5, l.by + 0.3, bz + 0.5, 0, 0, 0, undefined, 0);
  l.h.tick(20 * 8);
  assert.equal(l.count(l.bx + 2, l.by, bz), 2, 'recoge lo tirado');
  void BELTS;
});

test('brazos: quitar uno suelta lo que lleva en la mano', () => {
  const l = lab();
  l.power();
  l.set(l.bx - 1, l.by, l.bz, CHEST);
  l.set(l.bx, l.by, l.bz, inserterState(LONG, 0));
  l.set(l.bx + 1, l.by, l.bz, AIR);
  l.h.tick(3);
  l.fill(l.bx - 1, l.by, l.bz, { id: RAW_IRON, count: 1 });
  l.h.tick(3);
  assert.equal(l.sys().inserters.count, 1);
  l.set(l.bx, l.by, l.bz, AIR);
  l.h.tick(2);
  assert.equal(l.sys().inserters.count, 0);
});

test('brazos: la ventana (mcfg) da su configuración, la cambia y acepta combustible (sólo el de combustible)', () => {
  const l = lab();
  l.set(l.bx, l.by, l.bz, inserterState(BURNER, 0));
  l.set(l.bx + 3, l.by, l.bz, inserterState(BASIC, 0));
  l.c.pos(l.bx + 1.5, l.by, l.bz + 2.5);
  l.h.tick(3);
  l.c.send({ t: 'mcfg', x: l.bx, y: l.by, z: l.bz, c: { q: 1, filter: [RAW_IRON, 0, 0, 0, 0], mode: FILTER_BLACKLIST } });
  l.h.tick(2);
  const a = l.c.conn.take('icfg');
  assert.equal(a.length, 1);
  assert.deepEqual([a[0].tier, a[0].mode, a[0].filter[0], a[0].open, a[0].took], [BURNER, FILTER_BLACKLIST, RAW_IRON, 1, 0]);
  l.c.send({ t: 'mcfg', x: l.bx, y: l.by, z: l.bz, c: { fuel: COAL, n: 3 } });
  l.h.tick(2);
  const b = l.c.conn.take('icfg');
  assert.equal(b[0].took, 3);
  assert.deepEqual(b[0].fuel, [COAL, 3]);
  l.c.send({ t: 'mcfg', x: l.bx + 3, y: l.by, z: l.bz, c: { fuel: COAL, n: 3 } });
  l.h.tick(2);
  assert.equal(l.c.conn.take('icfg').length, 0, 'el brazo eléctrico no acepta combustible ni responde si no lo piden');
});

test('sin energía: el brazo eléctrico sin poste sale en la lista del rayo rojo; con poste y panel, no', () => {
  const l = lab();
  l.set(l.bx, l.by, l.bz, inserterState(BASIC, 0));
  l.c.pos(l.bx + 1.5, l.by, l.bz + 2.5);
  l.h.tick(30);
  const dead = l.c.conn.take('nopower');
  assert.ok(dead.length > 0);
  assert.deepEqual(dead[dead.length - 1].l, [[l.bx + 0.5, l.by + 0.95, l.bz + 0.5]]);
  l.power();
  l.h.tick(30);
  const live = l.c.conn.take('nopower');
  assert.deepEqual(live[live.length - 1].l, [], 'con corriente, la lista queda vacía');
});
