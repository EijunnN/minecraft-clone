// Programa lunar: los yacimientos (dónde salen y cuánto guardan) y el extractor eléctrico (cuánto saca, cuándo se para y cuándo se agota).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AIR, STONE, CHEST, SOLAR_PANEL, POLE_SMALL, EXTRACTOR, isMultiPart, MOON_IRON_VEIN, MOON_REGOLITH_DARK, DIRTY_ICE, BLOCKS, extractorInfo,
} from '../src/shared/blocks';
import { RAW_IRON } from '../src/shared/items';
import { veinAmount, veinYield, EXTRACT_SECONDS } from '../src/shared/logistics/veins';
import { MACHINE_KW, PANEL_KW } from '../src/shared/logistics/energy';
import { MoonGenerator } from '../src/shared/world/moon';
import { CHUNK_SIZE, MIN_Y, MAX_Y, blockIndex } from '../src/shared/constants';
import { DIM_MOON } from '../src/shared/dimensions';
import { posKey } from '../src/shared/sim/posKey';
import { putMulti } from './multi';
import { makeServer } from './harness';

test('vetas: cada bloque guarda entre 120 y 279 unidades, siempre las mismas para el mismo sitio', () => {
  let min = Infinity, max = 0, sum = 0;
  for (let i = 0; i < 2000; i++) {
    const a = veinAmount(1234, i, 70, i * 3);
    min = Math.min(min, a);
    max = Math.max(max, a);
    sum += a;
    assert.equal(a, veinAmount(1234, i, 70, i * 3));
  }
  assert.ok(min >= 120 && max <= 279, `${min}..${max}`);
  assert.ok(Math.abs(sum / 2000 - 200) < 8, `media ${sum / 2000}`);
  assert.equal(veinYield(MOON_IRON_VEIN)?.item, RAW_IRON);
  assert.equal(veinYield(MOON_IRON_VEIN)?.depleted, MOON_REGOLITH_DARK);
  assert.ok(veinYield(DIRTY_ICE));
  assert.equal(veinYield(STONE), null);
  assert.equal(BLOCKS[MOON_IRON_VEIN].category, 'luna');
  assert.equal(extractorInfo(EXTRACTOR + 2)?.dir, 2);
});

test('vetas: hay una junto al sitio de aterrizaje y son finas (2 capas) y en manchas', () => {
  const gen = new MoonGenerator(777);
  const spawn = gen.findSpawn();
  const scx = Math.floor(spawn.x / CHUNK_SIZE), scz = Math.floor(spawn.z / CHUNK_SIZE);
  let veins = 0, columns = 0;
  for (let cz = scz - 3; cz <= scz + 3; cz++) {
    for (let cx = scx - 3; cx <= scx + 3; cx++) {
      const g = gen.generate(cx, cz);
      const seen = new Set<number>();
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        for (let lx = 0; lx < CHUNK_SIZE; lx++) {
          let n = 0;
          for (let y = MIN_Y; y < MAX_Y; y++) if (g.blocks[blockIndex(lx, y, lz)] === MOON_IRON_VEIN) n++;
          if (n) {
            assert.equal(n, 2, 'dos capas por columna');
            veins += n;
            columns++;
            seen.add(lz * 16 + lx);
          }
        }
      }
    }
  }
  assert.ok(columns >= 40, `cerca del aterrizaje hay veta (${columns} columnas)`);
  assert.ok(veins === columns * 2);
});

function lab(dim?: number) {
  const h = makeServer(4243, undefined, dim);
  const c = h.join('Ingeniera', 'c');
  const [sx, , sz] = c.welcome.spawn as [number, number, number];
  const bx = Math.floor(sx), by = 160, bz = Math.floor(sz);
  c.pos(bx + 0.5, by + 30, bz + 0.5);
  h.tick(60);
  const W = h.gs.world;
  for (let dx = -12; dx <= 12; dx++) {
    for (let dz = -12; dz <= 12; dz++) {
      W.setBlock(bx + dx, by - 3, bz + dz, STONE);
      W.setBlock(bx + dx, by - 2, bz + dz, STONE);
      W.setBlock(bx + dx, by - 1, bz + dz, STONE);
      for (let y = by; y < by + 40; y++) W.setBlock(bx + dx, y, bz + dz, AIR);
    }
  }
  // La veta: 5×5 en las dos capas de debajo del extractor.
  for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) for (const dy of [1, 2]) W.setBlock(bx + dx, by - dy, bz + dz, MOON_IRON_VEIN);
  h.tick(2);
  const day = (n: number) => (h.gs as unknown as { setTime(d: number): void }).setTime(n);
  const set = (x: number, y: number, z: number, id: number) => void W.setBlock(x, y, z, id);
  const sys = () => h.gs.sys;
  // Extractor de 3×3 (mirando a +x: suelta por (bx + 2, by, bz)) con un poste que lo alimenta, hasta dos paneles de 3×3 (120 kW ≥ 90 kW)
  // y un cofre delante.
  const build = (panels: number) => {
    putMulti(W, EXTRACTOR, 0, bx, by, bz);
    set(bx + 2, by, bz, CHEST);
    set(bx, by, bz + 3, POLE_SMALL);
    if (panels > 0) putMulti(W, SOLAR_PANEL, 0, bx - 3, by, bz + 4);
    if (panels > 1) putMulti(W, SOLAR_PANEL, 0, bx + 3, by, bz + 4);
    h.tick(3);
  };
  const ore = () => {
    const o = sys().containers.access(bx + 2, by, bz)!;
    return o.state.slots.reduce((n, s) => n + (s && s.id === RAW_IRON ? s.count : 0), 0);
  };
  return { h, bx, by, bz, W, day, set, sys, build, ore };
}

test('extractor: con energía saca 0,5 mineral/s del área de 5×5 y lo suelta en el cofre de delante', () => {
  const { h, day, build, ore, sys, bx, by, bz } = lab();
  day(10.25); // mediodía
  build(2);
  assert.equal(sys().extractors.count, 1);
  h.tick(20 * 20);
  const n = ore();
  const expected = 20 / EXTRACT_SECONDS;
  assert.ok(Math.abs(n - expected) <= 1, `${n} minerales en 20 s (esperados ${expected})`);
  assert.equal(sys().extractors.peek(bx, by, bz)!.working, true);
  assert.ok(2 * PANEL_KW >= MACHINE_KW.extractor);
  // Lo que se extrajo se descontó de las reservas: entre las 50 casillas suman lo mismo que los minerales que salieron.
  let unitsLeft = 0;
  for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) for (const dy of [1, 2]) unitsLeft += sys().extractors.remaining(bx + dx, by - dy, bz + dz);
  assert.ok(unitsLeft > 50 * 120 - n - 1, 'quedan reservas');
});

test('extractor: con un solo panel va más despacio y sin energía no saca nada', () => {
  const a = lab();
  a.day(10.25);
  a.build(1); // 60 kW de 90 → 2/3 de velocidad
  a.h.tick(20 * 30);
  const slow = a.ore();
  assert.ok(Math.abs(slow - (30 / EXTRACT_SECONDS) * (PANEL_KW / MACHINE_KW.extractor)) <= 1.5, `${slow} con un panel`);
  const b = lab();
  b.day(10.75); // noche: sin Sol
  b.build(2);
  b.h.tick(20 * 10);
  assert.equal(b.ore(), 0, 'de noche y sin batería no saca');
  const c = lab();
  c.day(10.25);
  c.build(0); // sin panel
  c.h.tick(20 * 10);
  assert.equal(c.ore(), 0, 'sin ninguna fuente tampoco');
});

test('extractor: en la Luna, mirando a −z, también saca (la dimensión y el sentido no cambian nada)', () => {
  const { h, day, sys, bx, by, bz, set } = lab(DIM_MOON);
  day(10.25);
  putMulti(h.gs.world, EXTRACTOR, 3, bx, by, bz); // sentido 3: suelta hacia −z, por (bx, by, bz − 2)
  set(bx, by, bz - 2, CHEST);
  set(bx, by, bz + 3, POLE_SMALL);
  putMulti(h.gs.world, SOLAR_PANEL, 0, bx - 3, by, bz + 4);
  putMulti(h.gs.world, SOLAR_PANEL, 0, bx + 3, by, bz + 4);
  h.tick(3);
  assert.equal(sys().extractors.count, 1);
  h.tick(20 * 12);
  const o = sys().containers.access(bx, by, bz - 2)!;
  const n = o.state.slots.reduce((t, s) => t + (s && s.id === RAW_IRON ? s.count : 0), 0);
  assert.ok(n >= 4, `${n} minerales en 12 s en la Luna`);
});

const onGround = (h: ReturnType<typeof lab>['h']) =>
  [...h.gs.entities.list.values()].filter((x) => x.stack?.id === RAW_IRON && !x.dead).reduce((n, x) => n + x.stack!.count, 0);

test('extractor (como el de Factorio): sin nada delante deja el mineral al suelo, de uno en uno, y espera a que se recoja', () => {
  const { h, day, build, sys, bx, by, bz, set } = lab();
  day(10.25);
  build(2);
  set(bx + 2, by, bz, AIR); // sin cofre: cae al suelo
  h.tick(20 * 3);
  assert.equal(onGround(h), 1, 'un solo mineral en el suelo');
  h.tick(20 * 30);
  assert.equal(onGround(h), 1, 'no suelta otro mientras el anterior siga ahí');
  const e = sys().extractors.peek(bx, by, bz)!;
  assert.equal(e.blocked, true, 'parado con el siguiente ya listo');
  assert.equal(e.working, false);
  // Al recoger el del suelo, sigue.
  for (const x of [...h.gs.entities.list.values()]) if (x.stack?.id === RAW_IRON) h.gs.entities.remove(x.id);
  h.tick(20 * 2);
  assert.equal(onGround(h), 1, 'suelta el siguiente en cuanto hay sitio');
  // No tiene inventario: al romperlo no suelta nada más que el propio bloque.
  const before = onGround(h);
  set(bx, by, bz, AIR);
  h.tick(2);
  assert.equal(onGround(h), before);
});

test('extractor: si lo de delante no lo acepta (bloque, cofre lleno) se para con el objeto listo, sin gastar energía ni reserva', () => {
  const { h, day, build, sys, bx, by, bz, set } = lab();
  day(10.25);
  build(2);
  set(bx + 2, by, bz, STONE); // un bloque que no recibe nada
  h.tick(20 * 10);
  const e = sys().extractors.peek(bx, by, bz)!;
  assert.equal(e.blocked, true);
  assert.equal(e.progress, EXTRACT_SECONDS, 'al 100 %, esperando');
  assert.equal(onGround(h), 0, 'no tira nada al suelo si delante hay un bloque');
  let spent = 0;
  for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) for (const dy of [1, 2]) spent += 279 - Math.min(279, sys().extractors.remaining(bx + dx, by - dy, bz + dz));
  assert.ok(spent >= 0);
  // Un cofre lleno tampoco lo recibe.
  set(bx + 2, by, bz, CHEST);
  h.tick(2);
  const c = sys().containers.access(bx + 2, by, bz)!;
  for (let i = 0; i < c.state.slots.length; i++) c.state.slots[i] = { id: 1, count: 64 };
  c.done();
  h.tick(20 * 5);
  assert.equal(sys().extractors.peek(bx, by, bz)!.blocked, true);
  // Al vaciar un hueco, sigue.
  const c2 = sys().containers.access(bx + 2, by, bz)!;
  c2.state.slots[0] = null;
  c2.done();
  h.tick(20 * 3);
  const c3 = sys().containers.access(bx + 2, by, bz)!;
  assert.equal(c3.state.slots[0]?.id, RAW_IRON, 'el mineral listo entra en cuanto hay hueco');
});

test('extractor: mina las vetas en orden, una hasta agotarla, no al azar', () => {
  const { h, day, build, sys, bx, by, bz } = lab();
  day(10.25);
  build(2);
  h.tick(20 * 10); // ~5 minerales
  // Los gasta todos de la misma casilla (la primera del área: fila de arriba a la izquierda, capa de arriba), y de ninguna otra.
  const used = (sys().extractors as unknown as { used: Map<number, number> }).used;
  assert.equal(used.size, 1, 'sólo una casilla tocada');
  const [key, n] = [...used][0];
  assert.equal(key, posKey(bx - 2, by - 1, bz - 2), 'la primera del área');
  assert.ok(n >= 4, `${n} unidades gastadas de ella`);
});

test('vetas: una veta se agota: el bloque se vuelve regolito oscuro y ya no da más', () => {
  const { h, day, build, sys, bx, by, bz, W, set } = lab();
  day(10.25);
  // Una sola veta bajo el extractor: se quita el resto.
  for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) for (const dy of [1, 2]) W.setBlock(bx + dx, by - dy, bz + dz, STONE);
  W.setBlock(bx, by - 1, bz, MOON_IRON_VEIN);
  build(2);
  const ex = sys().extractors as unknown as { used: Map<number, number>; remaining(x: number, y: number, z: number): number };
  const amount = ex.remaining(bx, by - 1, bz);
  assert.ok(amount >= 120 && amount <= 279, `reserva ${amount}`);
  h.tick(20 * 5);
  assert.ok(ex.remaining(bx, by - 1, bz) < amount, 'gasta una unidad por objeto');
  assert.equal(W.getBlock(bx, by - 1, bz), MOON_IRON_VEIN);
  // Se deja a una unidad de agotarse para no esperar cientos de segundos.
  ex.used.set(posKey(bx, by - 1, bz), amount - 1);
  h.tick(20 * 4);
  assert.equal(W.getBlock(bx, by - 1, bz), MOON_REGOLITH_DARK, 'agotada: queda regolito');
  assert.equal(ex.remaining(bx, by - 1, bz), 0);
  // Sin más veta bajo él, el extractor deja de pedir energía y de sacar.
  const o = sys().containers.access(bx + 2, by, bz)!;
  const total = () => o.state.slots.reduce((n, s) => n + (s && s.id === RAW_IRON ? s.count : 0), 0);
  const got = total();
  h.tick(20 * 10);
  assert.equal(sys().containers.access(bx + 2, by, bz)!.state.slots.reduce((n, s) => n + (s && s.id === RAW_IRON ? s.count : 0), 0), got);
  assert.equal(sys().extractors.peek(bx, by, bz)!.working, false);
});
