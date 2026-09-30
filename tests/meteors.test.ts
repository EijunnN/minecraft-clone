// Programa lunar (shared/meteors.ts, «La caída del Ancla»): las lluvias de meteoritos del Errante y el cohete que se fabrica con lo que
// trae la Primera Lluvia.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeServer } from './harness';
import {
  showerPlan, meteorStart, meteorAt, erranteSize, readMeteorSave, MT_PHASE, SHOWER_EVERY_S, WARN_FIRST_S, WARN_S, FLIGHT_S, ERRANTE_DIR,
  SELENE_PLANS_PAGES,
} from '../src/shared/meteors';
import { METEORITE, METEOR_CORE, AIR, STONE, INVENTORY_ORDER } from '../src/shared/blocks';
import { ANCHOR_HEART, ERRANT_FRAGMENT, SELENE_ROCKET, ROCKET_STAGE, WRITTEN_BOOK, FIRE_RESISTANT_ITEMS, CREATIVE_ITEMS } from '../src/shared/items';
import { blockDrops } from '../src/shared/sim/drops';
import { factorioRecipeByName } from '../src/shared/factorio/catalog';
import { recipeLabel } from '../src/shared/factorio/labels';
import { ENT_ROCKET } from '../src/shared/rocket';
import { BOOK_PAGE_CHARS } from '../src/shared/itemData';

const seeded = (seed: number) => {
  let r = seed >>> 0;
  return () => ((r = (Math.imul(r, 1103515245) + 12345) >>> 0) / 4294967296);
};

test('lluvias: la Primera trae 40 y termina con el grande (el Núcleo); luego van a más y el Errante crece', () => {
  const first = showerPlan(0, seeded(1));
  assert.equal(first.length, 41);
  assert.equal(first.filter((m) => m.core).length, 1);
  assert.ok(first[first.length - 1].core, 'el Núcleo, el último');
  assert.equal(first[first.length - 1].power, 7);
  for (let i = 1; i < first.length; i++) assert.ok(first[i].at >= first[i - 1].at, 'en orden');
  for (const m of first.filter((x) => !x.core)) assert.ok(m.power >= 2 && m.power <= 5 && m.dist >= 22 && m.dist <= 70);
  const later = [1, 2, 5, 20].map((n) => showerPlan(n, seeded(n)));
  assert.ok(later.every((p) => !p.some((m) => m.core)), 'sólo la Primera trae el Núcleo');
  assert.ok(later[0].length < later[2].length && later[3].length <= 36, 'cada vez más, con un tope');
  assert.equal(erranteSize(false, 3), 0);
  assert.ok(erranteSize(true, 0) > 0 && erranteSize(true, 4) > erranteSize(true, 1) && erranteSize(true, 99) === 1);
  assert.equal(SHOWER_EVERY_S, 3600, 'una hora jugada entre lluvias');
});

test('lluvias: los meteoritos llegan desde el Errante, de lo alto, y caen justo en su sitio', () => {
  const to: [number, number, number] = [100, 70, -40];
  const from = meteorStart(to, [0.3, -0.2]);
  assert.ok(from[1] > to[1] + 100, 'de lo alto');
  const d = [from[0] - to[0], from[1] - to[1], from[2] - to[2]];
  const l = Math.hypot(d[0], d[1], d[2]);
  assert.ok((d[0] * ERRANTE_DIR[0] + d[1] * ERRANTE_DIR[1] + d[2] * ERRANTE_DIR[2]) / l > 0.9, 'de la dirección del Errante');
  assert.deepEqual(meteorAt(from, to, 0), from);
  assert.deepEqual(meteorAt(from, to, FLIGHT_S), to);
  assert.deepEqual(readMeteorSave('basura'), { awake: false, n: 0, clock: 0, off: false, core: false });
});

test('el Núcleo suelta el Corazón del Ancla y los Planos; el meteorito, fragmentos (con pico de hierro); el cohete se fabrica', () => {
  const core = blockDrops(METEOR_CORE, 0);
  assert.deepEqual(core.map((s) => s.id), [ANCHOR_HEART, WRITTEN_BOOK]);
  assert.equal(core[1].data?.title, 'Planos de Selene');
  assert.ok(SELENE_PLANS_PAGES.every((p) => p.length <= BOOK_PAGE_CHARS), 'las páginas caben en un libro');
  assert.ok(FIRE_RESISTANT_ITEMS.has(ANCHOR_HEART), 'el Corazón no arde (cae en un cráter en llamas)');
  const IRON_PICK = 0; // sin pico no suelta nada (hace falta uno de hierro)
  assert.deepEqual(blockDrops(METEORITE, IRON_PICK), []);
  // Recetas: tres etapas de lo que da la fábrica de la Tierra + el Corazón + carbón.
  const rocket = factorioRecipeByName('selene-rocket')!;
  assert.ok(rocket.enabled);
  assert.equal(rocket.out.id, SELENE_ROCKET);
  assert.deepEqual(rocket.needs.map((n) => [n.alts[0], n.n]).slice(0, 2), [[ROCKET_STAGE, 3], [ANCHOR_HEART, 1]]);
  assert.equal(factorioRecipeByName('rocket-stage')!.out.id, ROCKET_STAGE);
  assert.equal(recipeLabel('selene-rocket'), 'Cohete Selene');
  assert.ok(INVENTORY_ORDER.includes(METEORITE) && CREATIVE_ITEMS.includes(ERRANT_FRAGMENT) && CREATIVE_ITEMS.includes(SELENE_ROCKET));
});

/** Un mundo con un jugador de pie en un llano de piedra (para ver los cráteres). */
function field(mode: 's' | 'c' = 's') {
  const h = makeServer(777);
  const c = h.join('Vigía', mode);
  const [sx, , sz] = c.welcome.spawn as [number, number, number];
  const bx = Math.floor(sx), bz = Math.floor(sz), by = 150;
  const W = h.gs.world;
  c.pos(bx + 0.5, by + 1, bz + 0.5);
  h.tick(40);
  for (let dx = -72; dx <= 72; dx++) {
    for (let dz = -72; dz <= 72; dz++) {
      for (let y = by - 4; y < by; y++) W.setBlock(bx + dx, y, bz + dz, STONE);
      for (let y = by; y < by + 60; y++) W.setBlock(bx + dx, y, bz + dz, AIR);
    }
  }
  c.pos(bx + 0.5, by, bz + 0.5);
  h.tick(2);
  const count = (id: number) => {
    let n = 0;
    for (let dx = -72; dx <= 72; dx++) for (let dz = -72; dz <= 72; dz++) for (let y = by - 12; y < by + 4; y++) if (W.getBlock(bx + dx, y, bz + dz) === id) n++;
    return n;
  };
  const holes = () => {
    let n = 0;
    for (let dx = -72; dx <= 72; dx++) for (let dz = -72; dz <= 72; dz++) if (W.getBlock(bx + dx, by - 1, bz + dz) !== STONE) n++;
    return n;
  };
  return { h, c, bx, by, bz, W, count, holes };
}

test('la caída del Ancla: aviso de 2 minutos, 40 meteoritos que rompen el suelo y el grande con el Núcleo delante del jugador', () => {
  const f = field();
  const { h, c } = f;
  const holes0 = f.holes(); // (fuera de lo cargado no hay piedra: se cuenta lo que cambia)
  c.conn.take('meteors');
  // Sin el Dragón muerto no pasa nada, aunque pase el tiempo.
  h.tick(20 * 30);
  assert.equal(c.conn.take('meteors').length, 0);
  // Muere el Dragón (lo que hace el End en el mismo servidor).
  h.gs.sys.meteors.awaken();
  h.gs.sys.meteors.anchorFell();
  h.tick(1);
  const st = c.conn.take('meteors').pop();
  assert.equal(st.ph, MT_PHASE.WARNING);
  assert.equal(st.awake, 1);
  assert.ok(Math.abs(st.left - WARN_FIRST_S) < 1);
  // La radio de la Estación Selene.
  h.tick(20 * 12);
  const radio = c.conn.take('radio').map((m) => m.m as string);
  assert.ok(radio.some((m) => m.includes('el Ancla cayó')), radio.join(' / '));
  // Hasta que acaba el aviso no cae nada.
  h.tick(20 * (WARN_FIRST_S - 14));
  assert.equal(c.conn.take('meteor').length, 0);
  assert.equal(f.holes(), holes0);
  // Los impactos: 41 meteoritos anunciados, el suelo roto y cráteres con meteoritos.
  h.tick(20 * 90);
  const meteors = c.conn.take('meteor');
  assert.equal(meteors.length, 41, 'cada uno anunciado antes de caer');
  assert.equal(meteors.filter((m) => m.c).length, 1);
  for (const m of meteors) {
    const d = Math.hypot(m.p[0] - (f.bx + 0.5), m.p[2] - (f.bz + 0.5));
    assert.ok(d >= 20 && d <= 72, `cerca del jugador: ${d.toFixed(1)}`);
  }
  assert.ok(f.holes() - holes0 > 150, `rompen el suelo: ${f.holes() - holes0}`);
  assert.ok(f.count(METEORITE) >= 20, `quedan meteoritos: ${f.count(METEORITE)}`);
  assert.equal(f.count(METEOR_CORE), 1, 'y un Núcleo');
  const core = meteors.find((m) => m.c)!;
  assert.ok(core.p[2] < f.bz, 'el grande cae delante (mirando al norte)');
  const end = c.conn.take('meteors').pop();
  assert.equal(end.ph, MT_PHASE.CALM);
  assert.equal(end.n, 1);
  // Una hora jugada después, otra lluvia (con 5 minutos de aviso), sin Núcleo. (Se adelanta el reloj: una hora de ticks es muy lenta.)
  (h.gs.sys.meteors as unknown as { save: { clock: number } }).save.clock = SHOWER_EVERY_S - 10;
  h.tick(20 * 5);
  assert.notEqual(c.conn.take('meteors').pop()?.ph, MT_PHASE.WARNING);
  h.tick(20 * 12);
  const warn = c.conn.take('meteors').pop();
  assert.equal(warn.ph, MT_PHASE.WARNING);
  assert.ok(warn.left <= WARN_S && warn.left > WARN_S - 12, `aviso de 5 minutos: ${warn.left}`);
  h.tick(20 * (WARN_S + 80));
  const second = c.conn.take('meteor');
  assert.ok(second.length >= 12 && !second.some((m) => m.c), `segunda lluvia: ${second.length}`);
  assert.equal(f.count(METEOR_CORE), 1, 'el Núcleo no se repite');
});

test('se guarda: con el mundo recargado sigue la cuenta y no vuelve a despertar', () => {
  const f = field();
  f.h.gs.sys.meteors.awaken();
  f.h.tick(20 * 10);
  f.h.gs.flush(true);
  const saved = readMeteorSave(f.h.store.getMeta('meteors'));
  assert.equal(saved.awake, true);
  assert.equal(f.h.store.getMeta('meteorsPhase')?.split(':')[0], String(MT_PHASE.WARNING));
});

test('comandos: /cohete y lanzar las lluvias, sólo en creativo; en supervivencia el cohete se fabrica y se pone en el suelo', () => {
  const s = field('s');
  s.c.conn.take('chat');
  s.c.send({ t: 'chat', m: '/cohete' });
  s.h.tick(2);
  assert.ok(s.c.conn.take('chat').some((m) => /se fabrica/.test(m.m)));
  assert.equal([...s.h.gs.entities.list.values()].filter((e) => e.type === ENT_ROCKET).length, 0);
  s.c.send({ t: 'chat', m: '/meteoritos ya' });
  s.h.tick(2);
  assert.ok(s.c.conn.take('chat').some((m) => /Sólo en creativo/.test(m.m)));
  // Poner el cohete fabricado (el objeto lo gasta el cliente con la respuesta).
  s.c.send({ t: 'rplace', p: [s.bx + 3.5, s.by, s.bz + 0.5], yaw: 0, q: 7 });
  s.h.tick(2);
  const res = s.c.conn.take('ires').pop();
  assert.equal(res.ok, true);
  assert.equal(res.take, 1, 'se gasta el objeto');
  const rocket = [...s.h.gs.entities.list.values()].find((e) => e.type === ENT_ROCKET)!;
  assert.ok(rocket && Math.abs(rocket.y - s.by) < 0.01, 'posado en el suelo');
  // No se pone encima de otro.
  s.c.send({ t: 'rplace', p: [s.bx + 3.5, s.by, s.bz + 1.5], yaw: 0, q: 8 });
  s.h.tick(2);
  assert.equal(s.c.conn.take('ires').pop().ok, false);
  // En creativo, /meteoritos ya lanza una lluvia en 10 s.
  const c = field('c');
  c.c.send({ t: 'chat', m: '/meteoritos ya' });
  c.h.tick(2);
  const st = c.c.conn.take('meteors').pop();
  assert.equal(st.ph, MT_PHASE.WARNING);
  assert.ok(st.left <= 10);
  c.c.send({ t: 'chat', m: '/meteoritos off' });
  c.h.tick(20 * 30);
  assert.equal(c.c.conn.take('meteor').length, 0, 'apagadas, no cae nada');
});

test('matar al Dragón en el End despierta el mundo normal (la radio suena en el End) y sólo la primera vez', async () => {
  const { Multiverse } = await import('../src/shared/sim/Multiverse');
  const { MemoryStore } = await import('../src/shared/sim/store');
  const { DIM_END, DIM_OVERWORLD } = await import('../src/shared/dimensions');
  const clock = { now: 1_000_000 };
  const mv = new Multiverse(new MemoryStore(), { seed: 99, now: () => clock.now, flushSeconds: 5, rand: seeded(5), local: true });
  const end = mv.server(DIM_END);
  const kill = (end.sys.endFight as unknown as { dragonKilled(real?: boolean): void });
  const ow = mv.server(DIM_OVERWORLD);
  assert.equal(ow.sys.meteors.info().awake, false);
  kill.dragonKilled(true);
  assert.equal(ow.sys.meteors.info().awake, true, 'el mundo normal se despierta');
  // La radio de la Estación Selene suena en el End (donde está quien lo mató) aunque no haya nadie en el mundo normal.
  const radio = (end.sys.meteors as unknown as { radio: unknown[] }).radio;
  assert.ok(radio.length >= 4);
  // Y al volver a matarlo (el Dragón renace con los cristales) no vuelve a empezar.
  const n0 = ow.sys.meteors.info().n;
  (end.sys.endFight as unknown as { save: { killed: boolean } }).save.killed = false;
  kill.dragonKilled(true);
  assert.equal(ow.sys.meteors.info().n, n0);
});
