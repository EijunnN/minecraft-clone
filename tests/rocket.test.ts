// Programa lunar: el modelo de vuelo del cohete (curvas puras: nada de servidor ni de cliente).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ascentHeight, ascentSpeed, ASCENT_S, ASCENT_TOP, descentSpeed, descentStep, DESCENT_START, DESCENT_DECEL, rocketSeatPos,
  ROCKET_CABIN_Y, ROCKET_SEATS,
} from '../src/shared/rocket';

test('cohete: el ascenso sale despacio, acelera y sólo sube', () => {
  assert.equal(ascentHeight(0), 0);
  assert.equal(ascentSpeed(0), 0);
  assert.ok(ascentSpeed(1) < ascentSpeed(10) && ascentSpeed(10) < ascentSpeed(30), 'la velocidad crece');
  let prev = -1;
  for (let t = 0; t <= ASCENT_S; t += 0.5) {
    const h = ascentHeight(t);
    assert.ok(h > prev || t === 0, `sube en t = ${t}`);
    prev = h;
  }
  // El ascenso completo sale casi de la atmósfera (más de 50 km) sin pasar de los 100 km del modelo de cielo.
  assert.ok(ASCENT_TOP > 50_000 && ASCENT_TOP < 95_000, `altura final razonable: ${ASCENT_TOP}`);
  // La velocidad es la derivada de la altura.
  const dt = 0.001, t = 12;
  assert.ok(Math.abs((ascentHeight(t + dt) - ascentHeight(t)) / dt - ascentSpeed(t)) < 2);
});

test('cohete: el descenso frena y toca el suelo despacio, en la Luna y en la Tierra', () => {
  for (const decel of [DESCENT_DECEL.moon, DESCENT_DECEL.earth]) {
    let h: number = DESCENT_START;
    let t = 0, maxV = 0, lastV = 0;
    while (h > 0 && t < 300) {
      lastV = descentSpeed(h, decel);
      maxV = Math.max(maxV, lastV);
      h = descentStep(h, 0.05, decel);
      t += 0.05;
    }
    assert.equal(h, 0, `llega al suelo (decel ${decel})`);
    assert.ok(t > 15 && t < 60, `tarda lo que una escena: ${t.toFixed(1)} s`);
    assert.ok(lastV < 6, `toca el suelo despacio: ${lastV.toFixed(2)} b/s`);
    assert.ok(maxV <= 70.0001, 'no pasa de la velocidad de crucero');
  }
  assert.ok(descentSpeed(0, 6) > 0, 'aun a ras de suelo sigue bajando despacio, para no quedarse en el aire');
});

test('cohete: las cuatro plazas son distintas y están en la cabina', () => {
  const seen = new Set<string>();
  for (let s = 0; s < ROCKET_SEATS; s++) {
    const [x, y, z] = rocketSeatPos(10, 64, 20, 0, s);
    assert.equal(y, 64 + ROCKET_CABIN_Y);
    assert.ok(Math.hypot(x - 10, z - 20) < 1.2, 'dentro de la cabina');
    seen.add(`${x.toFixed(2)},${z.toFixed(2)}`);
  }
  assert.equal(seen.size, ROCKET_SEATS);
  // Girado 90°, las plazas giran con el cohete (misma distancia al centro).
  const [x0, , z0] = rocketSeatPos(0, 0, 0, 0, 1);
  const [x1, , z1] = rocketSeatPos(0, 0, 0, Math.PI / 2, 1);
  assert.ok(Math.abs(Math.hypot(x0, z0) - Math.hypot(x1, z1)) < 1e-9);
  assert.ok(Math.abs(x0 - x1) > 0.1 || Math.abs(z0 - z1) > 0.1);
});
