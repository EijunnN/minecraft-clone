// Fase 7 (remate): las pociones en las manos de los demás, la flecha con efecto de la ballesta,
// chocar con barcas y vagonetas y atar barcas con la rienda.
import { test } from 'node:test';
import { POTION, SPLASH_POTION, TIPPED_ARROW, STICK, CROSSBOW, CROSSBOW_CHARGED } from '../src/shared/items';
import { PT_HEALING, PT_POISON, POTION_TYPE_COUNT } from '../src/shared/potions';
import { sanitizeItemData, loadCrossbow, unloadCrossbow } from '../src/shared/itemData';
import { sanitizeStack } from '../src/shared/containers';
import { stackToWire, stackFromWire } from '../src/shared/protocol';
import { Checks, makeServer } from './harness';

test('remate: el tipo de poción de cada mano llega a los demás jugadores', () => {
  const t = new Checks();
  const h = makeServer();
  const a = h.join('Ana');
  const b = h.join('Beto');
  const [sx, sy, sz] = a.welcome.spawn as [number, number, number];
  const pos = (extra: object) => a.send({ t: 'pos', p: [sx, sy, sz], r: [0, 0], s: 0, ...extra });

  b.conn.msgs = [];
  pos({ h: POTION, o: TIPPED_ARROW, hp: PT_HEALING, op: PT_POISON });
  let got = b.conn.take('pos').pop();
  t.ok(got?.hp === PT_HEALING && got?.op === PT_POISON, `pociones reenviadas (${got?.hp}, ${got?.op})`);

  // Lo que no es una poción no lleva tipo; tipos que no existen tampoco.
  h.clock.now += 1000;
  pos({ h: STICK, o: SPLASH_POTION, hp: PT_HEALING, op: POTION_TYPE_COUNT + 5 });
  got = b.conn.take('pos').pop();
  t.ok(got && got.hp === undefined && got.op === undefined, `saneado (${got?.hp}, ${got?.op})`);
  h.clock.now += 1000;
  pos({ h: POTION, hp: 'x' });
  got = b.conn.take('pos').pop();
  t.ok(got && got.hp === undefined, 'basura → agua');

  // Quien entra después lo recibe en PlayerInfo.
  h.clock.now += 1000;
  pos({ h: SPLASH_POTION, hp: PT_POISON });
  const c = h.join('Carla');
  const info = (c.welcome.players as { id: string; hp?: number }[]).find((p) => p.id === a.welcome.id);
  t.ok(info?.hp === PT_POISON, `tipo en PlayerInfo (${info?.hp})`);
  t.done();
});

test('remate: la ballesta guarda la flecha con efecto cargada', () => {
  const t = new Checks();
  const base = { id: CROSSBOW, count: 1, dmg: 7, data: { ench: [[1, 1]] as [number, number][], name: 'Arco' } };
  const loaded = loadCrossbow(base, PT_POISON);
  t.ok(loaded.id === CROSSBOW_CHARGED && loaded.data?.ap === PT_POISON, 'cargada con la flecha de veneno');
  t.ok(loaded.dmg === 7 && loaded.data?.name === 'Arco' && loaded.data?.ench?.length === 1, 'conserva desgaste, nombre y encantamientos');
  t.ok(base.data && !('ap' in base.data), 'no toca la pila original');
  const plain = loadCrossbow({ id: CROSSBOW, count: 1 }, -1);
  t.ok(plain.id === CROSSBOW_CHARGED && plain.data === undefined, 'flecha normal: sin datos');

  // Sobrevive a la red y al guardado (inventario y cofres pasan por stackToWire/sanitizeStack).
  const back = sanitizeStack(stackFromWire(JSON.parse(JSON.stringify(stackToWire(loaded)))));
  t.ok(back?.id === CROSSBOW_CHARGED && back.data?.ap === PT_POISON, `ida y vuelta (${JSON.stringify(back)})`);

  // Validación: sólo la ballesta cargada y con tipos de poción que existen.
  t.ok(sanitizeItemData(CROSSBOW_CHARGED, { ap: PT_HEALING })?.ap === PT_HEALING, 'tipo válido');
  t.ok(sanitizeItemData(CROSSBOW_CHARGED, { ap: POTION_TYPE_COUNT }) === undefined, 'tipo que no existe');
  t.ok(sanitizeItemData(CROSSBOW_CHARGED, { ap: 1.5 }) === undefined, 'tipo no entero');
  t.ok(sanitizeItemData(CROSSBOW, { ap: PT_HEALING }) === undefined, 'la descargada no lleva flecha');

  // Al disparar vuelve a estar descargada y sin la flecha, con lo demás intacto.
  const shot = unloadCrossbow(loaded);
  t.ok(shot.id === CROSSBOW && shot.data?.ap === undefined && shot.data?.name === 'Arco', 'descargada tras disparar');
  t.done();
});
