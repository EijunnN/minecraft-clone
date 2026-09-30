// Programa lunar: el traje espacial y el oxígeno (shared/spacesuit.ts), sin cliente ni servidor.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ARMOR, OXYGEN_BOTTLE, ITEMS, CREATIVE_ITEMS, FACTORIO_NEW, type ItemStack } from '../src/shared/items';
import { WOOL, GLASS } from '../src/shared/blocks';
import { SPACE_ARMOR, ARMOR_PIECES } from '../src/shared/armor';
import { matchRecipe } from '../src/shared/recipes';
import {
  oxygenStep, oxygenTotal, suitSealed, wearsSuitPiece, bottleLeft, isOxygenBottle, SUIT_TANK, BOTTLE_UO, BREATH_UO,
} from '../src/shared/spacesuit';

const suit = (): (ItemStack | null)[] => ARMOR_PIECES.map((p) => ({ id: ARMOR[SPACE_ARMOR][p], count: 1 }));
const bottle = (used = 0): ItemStack => (used ? { id: OXYGEN_BOTTLE, count: 1, dmg: used } : { id: OXYGEN_BOTTLE, count: 1 });

/** Respira `seconds` segundos a pasos de `dt` y devuelve el depósito final y si respiró todo el tiempo. */
function breathe(tank: number, seconds: number, where: 'air' | 'cabin' | 'vacuum', sealed: boolean, slots: (ItemStack | null)[], dt = 0.05) {
  let ok = true;
  for (let t = 0; t < seconds - 1e-9; t += dt) {
    const r = oxygenStep(tank, dt, where, sealed, slots);
    tank = r.tank;
    if (!r.breathing) ok = false;
  }
  return { tank, ok };
}

test('traje: cuatro piezas de armadura y una botella, en el creativo, que no se apilan', () => {
  for (const [slot, piece] of ARMOR_PIECES.entries()) {
    const it = ITEMS[ARMOR[SPACE_ARMOR][piece]];
    assert.ok(it?.armor, piece);
    assert.equal(it.armor!.slot, slot);
    assert.equal(it.armor!.material, SPACE_ARMOR);
    assert.equal(it.stack, 1);
    assert.ok(CREATIVE_ITEMS.includes(it.id));
  }
  assert.equal(ITEMS[OXYGEN_BOTTLE].stack, 1);
  assert.ok(isOxygenBottle(OXYGEN_BOTTLE) && !isOxygenBottle(ARMOR[SPACE_ARMOR].helmet));
  assert.ok(CREATIVE_ITEMS.includes(OXYGEN_BOTTLE));
});

test('traje: se fabrica en la mesa con acero, lana y cristal; la botella, con acero, sale llena', () => {
  const S = FACTORIO_NEW['steel-plate'], W = WOOL.white, G = GLASS;
  const grid = (rows: string[]) => rows.join('').split('').map((c) => (c === 'S' ? S : c === 'W' ? W : c === 'G' ? G : 0));
  const cases: [string[], number][] = [
    [['SSS', 'SGS', '   '], ARMOR[SPACE_ARMOR].helmet],
    [['S S', 'WSW', 'SWS'], ARMOR[SPACE_ARMOR].chestplate],
    [['SWS', 'W W', 'S S'], ARMOR[SPACE_ARMOR].leggings],
    [['W W', 'S S', '   '], ARMOR[SPACE_ARMOR].boots],
    [[' S ', 'S S', ' S '], OXYGEN_BOTTLE],
  ];
  for (const [rows, out] of cases) {
    const m = matchRecipe(grid(rows), 3);
    assert.equal(m?.out.id, out, `${ITEMS[out].name}: ${rows.join('/')}`);
    assert.equal(m?.out.dmg, undefined, 'sin desgaste (la botella, llena)');
  }
});

test('traje: sólo sella con las cuatro piezas en su sitio', () => {
  assert.ok(suitSealed(suit()));
  const partial = suit();
  partial[0] = null;
  assert.ok(!suitSealed(partial), 'sin casco no sella');
  assert.ok(wearsSuitPiece(partial));
  const swapped = suit();
  [swapped[2], swapped[3]] = [swapped[3], swapped[2]];
  assert.ok(!suitSealed(swapped), 'cada pieza en su ranura');
  assert.ok(!wearsSuitPiece([null, null, null, null]));
});

test('oxígeno: el depósito del traje da 10 minutos en el vacío; sin traje no se respira', () => {
  assert.equal(SUIT_TANK / BREATH_UO, 600);
  const r = breathe(SUIT_TANK, 590, 'vacuum', true, []);
  assert.ok(r.ok, 'respira casi 10 minutos');
  assert.ok(Math.abs(r.tank - (SUIT_TANK - 590 * BREATH_UO)) < 0.01);
  const out = breathe(r.tank, 20, 'vacuum', true, []);
  assert.ok(!out.ok && out.tank === 0, 'luego se acaba');
  assert.equal(oxygenStep(SUIT_TANK, 1, 'vacuum', false, []).breathing, false, 'sin traje sellado no respira');
  assert.equal(oxygenStep(SUIT_TANK, 1, 'vacuum', false, []).tank, SUIT_TANK, 'y no gasta el depósito');
});

test('oxígeno: las botellas alargan el aire, de una en una empezando por la más gastada', () => {
  const half = bottle(BOTTLE_UO / 2), full = bottle();
  const slots: (ItemStack | null)[] = [null, full, null, half];
  const total = oxygenTotal(SUIT_TANK, slots);
  assert.equal(total.uo, SUIT_TANK + BOTTLE_UO * 1.5);
  assert.equal(total.seconds, total.uo / BREATH_UO);
  // Media hora de vacío (1 800 s = 900 uO): el depósito (300) y la botella a medias (300) se gastan y se empieza la llena.
  const r = breathe(SUIT_TANK, 1800, 'vacuum', true, slots);
  assert.ok(r.ok, 'respira todo el rato');
  assert.equal(bottleLeft(half), 0, 'la más gastada, primero');
  assert.ok(bottleLeft(full) < BOTTLE_UO && bottleLeft(full) > 0, 'luego la llena');
  // Todo el oxígeno se conserva (salvo el redondeo a uO enteras).
  const left = oxygenTotal(r.tank, slots).uo;
  assert.ok(Math.abs(left - (total.uo - 1800 * BREATH_UO)) < 1, `sin pérdidas: ${left}`);
  // Hasta que se acaba todo.
  const end = breathe(r.tank, left / BREATH_UO + 5, 'vacuum', true, slots);
  assert.ok(!end.ok);
  assert.equal(oxygenTotal(end.tank, slots).uo, 0);
});

test('oxígeno: en la cabina del cohete y con aire se rellenan el depósito y las botellas', () => {
  const empty = bottle(BOTTLE_UO);
  const slots: (ItemStack | null)[] = [empty];
  const r = breathe(0, 30, 'cabin', true, slots);
  assert.equal(r.tank, SUIT_TANK);
  assert.equal(bottleLeft(empty), BOTTLE_UO);
  assert.equal(empty.dmg, undefined, 'llena: sin desgaste');
  // Con muchos fps (pasos muy cortos) también avanza.
  const e2 = bottle(BOTTLE_UO);
  breathe(0, 2, 'air', false, [e2], 1 / 240);
  assert.ok(bottleLeft(e2) > 0);
  // Con aire alrededor se respira aunque no se lleve traje (y el depósito no se toca sin él).
  const a = oxygenStep(10, 1, 'air', false, []);
  assert.ok(a.breathing);
  assert.equal(a.tank, 10);
});
