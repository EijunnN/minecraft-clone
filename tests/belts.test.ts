// Programa lunar: el motor de las cintas (dos carriles, separación, carga lateral, curvas, rendimiento y bucles).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  newBelt, beltPut, beltTake, beltCount, relink, shapeOf, orderBelts, stepBelts, saveBelt, loadBelt,
  BELT_SPACING, BELT_END, BELT_SPEEDS, BELT_THROUGHPUT, type Belt,
} from '../src/shared/logistics/belts';

const DT = 0.05;
const iron = { id: 300, count: 1 };

/** Mundo de cintas con lo justo para relink: se guardan por posición. */
function world(list: Belt[]) {
  const m = new Map(list.map((b) => [`${b.x},${b.y},${b.z}`, b]));
  const at = (x: number, y: number, z: number) => m.get(`${x},${y},${z}`) ?? null;
  for (const b of list) relink(b, at);
  return { at, order: () => orderBelts(list) };
}
const run = (w: ReturnType<typeof world>, ticks: number, each?: () => void) => {
  const ord = w.order();
  for (let i = 0; i < ticks; i++) {
    each?.();
    stepBelts(ord, DT);
  }
};
const line = (n: number, dir = 0, tier = 0): Belt[] => {
  const dx = dir === 0 ? 1 : dir === 2 ? -1 : 0, dz = dir === 1 ? 1 : dir === 3 ? -1 : 0;
  return Array.from({ length: n }, (_, i) => newBelt(i * dx, 64, i * dz, dir, tier));
};

test('cintas: un objeto recorre la fila y se detiene al final', () => {
  const belts = line(4);
  const w = world(belts);
  assert.ok(beltPut(belts[0], 0, 0.1, iron));
  run(w, 20 * 6);
  assert.equal(beltCount(belts[3]), 1, 'llega a la última');
  assert.ok(Math.abs(belts[3].lanes[0][0].p - BELT_END) < 1e-9, 'y se para en el borde');
  assert.equal(beltCount(belts[0]) + beltCount(belts[1]) + beltCount(belts[2]), 0);
});

test('cintas: caben 4 por carril y bloque, separados; al final del todo se apilan', () => {
  const belts = line(3);
  const w = world(belts);
  run(w, 20 * 40, () => beltPut(belts[0], 1, 0.0, iron)); // alimentar sin parar por el carril derecho, sin nadie que saque
  assert.equal(belts[2].lanes[1].length, 4, 'la última se llena con 4 en ese carril');
  for (const b of belts) {
    for (const lane of b.lanes) {
      for (let i = 1; i < lane.length; i++) assert.ok(lane[i - 1].p - lane[i].p >= BELT_SPACING - 1e-6, 'nunca más juntos que SPACING');
    }
  }
  assert.equal(belts[2].lanes[0].length, 0, 'el otro carril sigue vacío');
});

test('cintas: rendimiento de Factorio (15 objetos/s en la básica) y proporcional a la velocidad', () => {
  assert.equal(BELT_THROUGHPUT[0], 15);
  assert.equal(BELT_THROUGHPUT[1], 30);
  assert.equal(BELT_THROUGHPUT[2], 45);
  for (const tier of [0, 1, 2]) {
    // Una cinta larga ya llena a tope (cada 0,25 en los dos carriles) y un sumidero al final: lo que sale es lo que da la cinta.
    const belts = line(120, 0, tier);
    const w = world(belts);
    for (const b of belts) for (const p of [0, 0.25, 0.5, 0.75]) for (const lane of [0, 1] as const) beltPut(b, lane, p, iron);
    const last = belts[belts.length - 1];
    const seconds = 10;
    let out = 0;
    run(w, 20 * seconds, () => {
      while (beltTake(last)) out++;
    });
    const rate = out / seconds;
    assert.ok(Math.abs(rate - BELT_THROUGHPUT[tier]) / BELT_THROUGHPUT[tier] < 0.05, `nivel ${tier}: ${rate.toFixed(1)}/s (esperado ${BELT_THROUGHPUT[tier]})`);
  }
});

test('cintas: carga lateral al carril del lado por el que se entra', () => {
  // Principal hacia +x en (1..3); por su izquierda (−z) le llega una que mira +z, y por la derecha (+z) una que mira −z.
  const main = [newBelt(1, 64, 0, 0), newBelt(2, 64, 0, 0), newBelt(3, 64, 0, 0)];
  const fromLeft = newBelt(2, 64, -1, 1);
  const fromRight = newBelt(3, 64, 1, 3);
  const back = newBelt(0, 64, 0, 0); // detrás de la principal, para que no sea una curva
  const w = world([back, ...main, fromLeft, fromRight]);
  assert.equal(fromLeft.out?.side, -1);
  assert.equal(fromRight.out?.side, 1);
  beltPut(fromLeft, 0, 0.5, iron);
  beltPut(fromLeft, 1, 0.2, iron);
  beltPut(fromRight, 0, 0.5, { id: 301, count: 1 });
  run(w, 20 * 3);
  const ids = (lane: number) => main.flatMap((b) => b.lanes[lane].map((i) => i.s.id));
  assert.deepEqual(ids(0).sort(), [300, 300], 'lo de la izquierda, al carril izquierdo');
  assert.deepEqual(ids(1), [301], 'lo de la derecha, al derecho');
});

test('cintas: una curva conserva los carriles (y con una cinta detrás ya no es curva)', () => {
  // Va a +x y gira hacia +z: a y b, la esquina y la que sigue.
  const a = newBelt(0, 64, 0, 0), b = newBelt(1, 64, 0, 0), corner = newBelt(2, 64, 0, 1), after = newBelt(2, 64, 1, 1);
  const w = world([a, b, corner, after]);
  assert.notEqual(shapeOf(corner, w.at).shape, 0, 'la esquina es una curva');
  assert.equal(b.out?.side, 0, 'a la curva se entra de espalda: los carriles se conservan');
  beltPut(a, 0, 0.1, iron);
  beltPut(a, 1, 0.1, { id: 301, count: 1 });
  run(w, 20 * 4);
  assert.deepEqual(after.lanes[0].map((i) => i.s.id), [300]);
  assert.deepEqual(after.lanes[1].map((i) => i.s.id), [301]);
  // Con una cinta detrás de la esquina, ya no es curva: b entra de lado.
  const behind = newBelt(2, 64, -1, 1);
  const w2 = world([a, b, corner, after, behind]);
  assert.equal(shapeOf(corner, w2.at).shape, 0);
  assert.notEqual(b.out?.side, 0);
});

test('cintas: un bucle cerrado gira sin perder ni duplicar nada', () => {
  const ring = [newBelt(0, 64, 0, 0), newBelt(1, 64, 0, 1), newBelt(1, 64, 1, 2), newBelt(0, 64, 1, 3)];
  const w = world(ring);
  for (const b of ring) beltPut(b, 0, 0.3, iron);
  const before = ring.reduce((n, b) => n + beltCount(b), 0);
  run(w, 20 * 30);
  assert.equal(ring.reduce((n, b) => n + beltCount(b), 0), before);
});

test('cintas: guardar y cargar conserva objetos y orden', () => {
  const b = newBelt(0, 64, 0, 0);
  beltPut(b, 0, 0.8, iron);
  beltPut(b, 0, 0.3, { id: 301, count: 1 });
  beltPut(b, 1, 0.5, iron);
  const c = newBelt(0, 64, 0, 0);
  loadBelt(c, saveBelt(b));
  assert.equal(beltCount(c), 3);
  assert.deepEqual(c.lanes[0].map((i) => i.s.id), [300, 301]);
  assert.ok(Math.abs(c.lanes[0][0].p - 0.8) < 0.01);
});

test('cintas: velocidades por nivel', () => {
  assert.deepEqual([...BELT_SPEEDS], [1.875, 3.75, 5.625]);
});
