// Programa lunar: el modelo de vuelo del cohete (curvas puras: nada de servidor ni de cliente).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ascentHeight, ascentSpeed, ASCENT_S, ASCENT_TOP, descentSpeed, descentStep, DESCENT_START, DESCENT_DECEL, rocketSeatPos,
  ROCKET_CABIN_Y, ROCKET_SEATS, descentDownrange, ascentTelemetry, COAST_S,
} from '../src/shared/rocket';
import { transitView, EARTH_IN_MOON_SKY, earthShiftAxes, R_EARTH, R_MOON, type TransitSetup, type Vec3 } from '../src/shared/voyage';

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
  // El ascenso completo sale casi de la atmósfera sin pasar de los 100 km del modelo de cielo; despega a paso lento.
  assert.ok(ASCENT_TOP > 80_000 && ASCENT_TOP < 100_000, `altura final razonable: ${ASCENT_TOP}`);
  assert.ok(ascentHeight(3) < 60, `los primeros segundos apenas sube: ${ascentHeight(3)}`);
  // La telemetría es la de una misión real: la velocidad orbital al final y nunca hacia atrás.
  assert.ok(ascentTelemetry(ASCENT_S).speed > 7000);
  assert.ok(ascentTelemetry(10).speed < ascentTelemetry(30).speed);
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
    assert.ok(t > 35 && t < 75, `tarda lo que una escena: ${t.toFixed(1)} s`);
    assert.ok(lastV < 6, `toca el suelo despacio: ${lastV.toFixed(2)} b/s`);
    assert.ok(maxV < 700, `empieza rápido pero razonable: ${maxV.toFixed(0)} b/s`);
  }
  assert.ok(descentSpeed(0, 6) > 0, 'aun a ras de suelo sigue bajando despacio, para no quedarse en el aire');
  // Los últimos cien metros, despacio (se ve el suelo acercarse).
  assert.ok(descentSpeed(100, DESCENT_DECEL.moon) < 40 && descentSpeed(20, DESCENT_DECEL.moon) < 10);
  // Lo que avanza en horizontal se acaba antes de ver los bloques: en vertical por debajo de 1 500 m.
  assert.ok(descentDownrange(DESCENT_START) > 10_000);
  assert.equal(descentDownrange(1500), 0);
});

const I3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const dirOf = (c: Vec3): Vec3 => {
  const l = Math.hypot(...c);
  return [c[0] / l, c[1] / l, c[2] / l];
};
const near = (a: number[], b: number[], eps: number) => a.every((x, i) => Math.abs(x - b[i]) < eps);

test('tránsito: sale con el planeta debajo y llega con el otro debajo, sin saltos', () => {
  const moonInEarthSky: Vec3 = dirOf([0.3, 0.5, -0.8]);
  for (const toMoon of [true, false]) {
    const s: TransitSetup = {
      toMoon, duration: COAST_S, startOther: toMoon ? moonInEarthSky : EARTH_IN_MOON_SKY, endOther: toMoon ? EARTH_IN_MOON_SKY : moonInEarthSky,
      departAxes: toMoon ? earthShiftAxes(200_000) : I3, arriveAxes: toMoon ? I3 : earthShiftAxes(22_000), met0: 500,
    };
    const v0 = transitView(0, s), v1 = transitView(COAST_S, s);
    const dep0 = toMoon ? v0.earth : v0.moon, arr1 = toMoon ? v1.moon : v1.earth;
    const oth0 = toMoon ? v0.moon : v0.earth, oth1 = toMoon ? v1.earth : v1.moon;
    // Al salir: el de salida justo debajo, a la altura del final del ascenso, con los ejes con los que se veía.
    assert.ok(near(dirOf(dep0.c), [0, -1, 0], 1e-6));
    assert.ok(Math.abs(Math.hypot(...dep0.c) - dep0.r - 96) < 1);
    assert.ok(near(dep0.axes, s.departAxes, 1e-6), 'mismo giro que en el ascenso');
    assert.ok(near(dirOf(oth0.c), s.startOther, 0.01), 'el otro, donde se veía en el cielo');
    // Al llegar: el de llegada debajo a 15 km, con sus ejes, y el otro donde se ve desde su cielo.
    assert.ok(near(dirOf(arr1.c), [0, -1, 0], 1e-6));
    assert.ok(Math.abs(Math.hypot(...arr1.c) - arr1.r - 15) < 0.5);
    assert.ok(near(arr1.axes, s.arriveAxes, 1e-6));
    assert.ok(near(dirOf(oth1.c), s.endOther, 0.01));
    // Tamaños y distancias reales.
    assert.equal(v0.earth.r, R_EARTH);
    assert.equal(v0.moon.r, R_MOON);
    // Sin saltos: de un instante al siguiente la dirección de los dos cambia poco y la distancia avanza siempre hacia el destino.
    let prev = transitView(0, s), last = Infinity;
    for (let t = 0.1; t <= COAST_S; t += 0.1) {
      const v = transitView(t, s);
      for (const k of ['earth', 'moon'] as const) {
        const a = dirOf(prev[k].c), b = dirOf(v[k].c);
        assert.ok(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] > Math.cos(0.12), `sin saltos en t = ${t.toFixed(1)} (${k})`);
      }
      const d = toMoon ? v.altMoon : v.altEarth;
      assert.ok(d <= last + 1e-6, `se acerca al destino en t = ${t.toFixed(1)}`);
      last = d;
      prev = v;
    }
    // Telemetría: inyección a unos 11 km/s desde la Tierra; tres días de viaje.
    if (toMoon) assert.ok(transitView(8, s).speed > 10 && transitView(8, s).speed < 11.5);
    assert.ok(v1.met - v0.met > 2.5 * 86_400);
  }
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
