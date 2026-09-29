// Programa lunar: la energía con las reglas de Factorio: postes con cable y área de suministro, paneles con su perfil día/noche,
// acumuladores, brazos y hornos que gastan y se frenan si falta potencia. Las máquinas son de varias casillas (paneles 3×3,
// acumuladores 2×2, hornos 3×3, postes grandes y subestaciones 2×2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AIR, STONE, POLE_SMALL, POLE_MEDIUM, POLE_BIG, SUBSTATION, SOLAR_PANEL, ACCUMULATOR, ELECTRIC_SMELTER, CHEST, inserterState, isPowerBlock,
  poleKind,
} from '../src/shared/blocks';
import { RAW_IRON, IRON_INGOT } from '../src/shared/items';
import {
  balance, sunPower, factorioSun, PANEL_KW, ACCUMULATOR_CAP, ACCUMULATOR_RATE, MACHINE_KW, POLES, POLE_MAX_WIRES,
} from '../src/shared/logistics/energy';
import { SMELTER_SECONDS } from '../src/shared/sim/server/machines';
import { MemoryStore } from '../src/shared/sim/store';
import { makeServer } from './harness';
import { putMulti } from './multi';

const DT = 0.05;

test('energía: sobra → carga los acumuladores; falta → los gasta; sin ellos, todo va más despacio', () => {
  // Sobra: 100 kW dan, 60 piden; se cargan 40 ue/s (tope 300 por acumulador).
  let r = balance({ supply: 100, demand: 60, stored: 0, cap: ACCUMULATOR_CAP, accumulators: 1 }, DT);
  assert.equal(r.satisfaction, 1);
  assert.ok(Math.abs(r.stored - 40 * DT) < 1e-9);
  // Falta y hay carga: el acumulador pone lo que falta.
  r = balance({ supply: 0, demand: 120, stored: 1000, cap: ACCUMULATOR_CAP, accumulators: 1 }, DT);
  assert.equal(r.satisfaction, 1);
  assert.ok(Math.abs(r.stored - (1000 - 120 * DT)) < 1e-9);
  // Falta y no hay carga: 30 de 90 kW → un tercio de velocidad.
  r = balance({ supply: 30, demand: 90, stored: 0, cap: ACCUMULATOR_CAP, accumulators: 1 }, DT);
  assert.ok(Math.abs(r.satisfaction - 1 / 3) < 1e-9);
  // Un acumulador no da más de 300 kW: 900 pedidos → 300/900.
  r = balance({ supply: 0, demand: 900, stored: ACCUMULATOR_CAP, cap: ACCUMULATOR_CAP, accumulators: 1 }, DT);
  assert.ok(Math.abs(r.satisfaction - ACCUMULATOR_RATE / 900) < 1e-9);
  // Nada pide: todo va a los acumuladores, sin pasar de la capacidad.
  r = balance({ supply: 60, demand: 0, stored: ACCUMULATOR_CAP - 0.1, cap: ACCUMULATOR_CAP, accumulators: 1 }, DT);
  assert.equal(r.stored, ACCUMULATOR_CAP);
  // Las cifras son las de Factorio.
  assert.equal(PANEL_KW, 60);
  assert.equal(ACCUMULATOR_CAP, 5000);
  assert.equal(ACCUMULATOR_RATE, 300);
  assert.equal(MACHINE_KW.extractor, 90);
  assert.equal(MACHINE_KW.smelter, 180);
  assert.deepEqual([POLES.small.reach, POLES.small.area, POLES.medium.reach, POLES.medium.area], [7.5, 2.5, 9, 3.5]);
  assert.deepEqual([POLES.big.reach, POLES.big.area, POLES.substation.reach, POLES.substation.area], [32, 2, 18, 9]);
  assert.equal(POLE_MAX_WIRES, 5);
  assert.ok(Math.abs(SMELTER_SECONDS - 1.6) < 1e-9, 'horno eléctrico: 3,2 s ÷ velocidad 2');
});

test('energía: el perfil de brillo del día de Factorio (media 0,7 → 42 kW de un panel de 60)', () => {
  assert.equal(factorioSun(0), 1);
  assert.equal(factorioSun(0.25), 1);
  assert.ok(Math.abs(factorioSun(0.35) - 0.5) < 1e-9);
  assert.equal(factorioSun(0.5), 0);
  assert.ok(Math.abs(factorioSun(0.65) - 0.5) < 1e-9);
  assert.equal(factorioSun(0.75), 1);
  let sum = 0;
  for (let i = 0; i < 1000; i++) sum += factorioSun(i / 1000);
  assert.ok(Math.abs(sum / 1000 - 0.7) < 0.005, `media ${sum / 1000}`);
  assert.ok(Math.abs((sum / 1000) * PANEL_KW - 42) < 0.5);
  // En el juego el mediodía es la fracción 0,25 del día.
  assert.equal(sunPower(0.25), 1);
  assert.equal(sunPower(0.75), 0);
  assert.ok(isPowerBlock(POLE_SMALL) && isPowerBlock(ACCUMULATOR) && isPowerBlock(SOLAR_PANEL + 3) && !isPowerBlock(STONE));
  assert.equal(poleKind(POLE_MEDIUM), 'medium');
  assert.equal(poleKind(POLE_BIG), 'big');
  assert.equal(poleKind(SUBSTATION), 'substation');
});

function lab(store?: MemoryStore) {
  const h = makeServer(4243, store);
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
  const day = (n: number) => (h.gs as unknown as { setTime(d: number): void }).setTime(n);
  const set = (x: number, y: number, z: number, id: number) => void W.setBlock(x, y, z, id);
  /** Pone una máquina de varias casillas con su casilla principal en (x, y, z). */
  const mb = (base: number, dir: number, x: number, y: number, z: number) => putMulti(W, base, dir, x, y, z);
  return { h, c, bx, by, bz, W, day, set, mb, sys: () => h.gs.sys };
}

test('postes: el área de suministro alimenta lo que toca (5×5 el pequeño, 7×7 el mediano)', () => {
  const { h, bx, by, bz, set, mb, sys } = lab();
  const p = sys().power;
  // Poste pequeño: área de 5×5 (±2 desde su centro). Un panel de 3×3 la toca si alguna de sus casillas cae dentro.
  set(bx, by, bz, POLE_SMALL);
  mb(SOLAR_PANEL, 0, bx + 3, by, bz); // ocupa x bx+2..bx+4: toca el área (llega a bx+2)
  mb(SOLAR_PANEL, 0, bx + 6, by, bz); // x bx+5..bx+7: fuera
  mb(SOLAR_PANEL, 0, bx, by + 4, bz); // 4 más arriba (el área es un cubo de ±2): fuera
  h.tick(3);
  assert.equal(p.powered(bx + 3, by, bz), true);
  assert.equal(p.powered(bx + 4, by, bz + 1), true, 'cualquier casilla de la máquina cuenta como ella');
  assert.equal(p.powered(bx + 6, by, bz), false);
  assert.equal(p.powered(bx, by + 4, bz), false);
  // Poste mediano: 7×7 (±3).
  set(bx + 12, by, bz, POLE_MEDIUM);
  mb(SOLAR_PANEL, 0, bx + 16, by, bz); // x bx+15..bx+17: llega a bx+15 (12 + 3) → dentro
  mb(SOLAR_PANEL, 0, bx + 19, by, bz); // x bx+18..: fuera
  h.tick(3);
  assert.equal(p.powered(bx + 16, by, bz), true);
  assert.equal(p.powered(bx + 19, by, bz), false);
});

test('postes grandes: el poste grande (2×2, área 4×4, cable 32) y la subestación (2×2, área 18×18, cable 18) son máquinas de varias casillas', () => {
  const { h, bx, by, bz, mb, sys, W } = lab();
  const p = sys().power;
  mb(POLE_BIG, 0, bx, by, bz); // ocupa x bx..bx+1, z bz..bz+1; su centro está en (bx+1, bz+1)
  assert.equal(poleKind(W.getBlock(bx + 1, by + 2, bz + 1)), 'big', 'cualquiera de sus casillas es el poste');
  mb(SOLAR_PANEL, 0, bx + 5, by, bz + 1); // x bx+4..bx+6: el área de ±2 desde bx+1 llega hasta bx+2 → fuera
  mb(SOLAR_PANEL, 0, bx + 3, by, bz + 1); // x bx+2..bx+4: dentro
  h.tick(3);
  assert.equal(p.powered(bx + 3, by, bz + 1), true);
  assert.equal(p.powered(bx + 5, by, bz + 1), false);
  // La subestación llega a 9 desde su centro.
  const s = lab();
  s.mb(SUBSTATION, 0, s.bx, s.by, s.bz); // centro (bx+1, bz+1)
  s.mb(SOLAR_PANEL, 0, s.bx + 9, s.by, s.bz + 1); // x bx+8..bx+10: llega hasta bx+10 → dentro
  s.mb(SOLAR_PANEL, 0, s.bx + 15, s.by, s.bz + 1); // fuera
  s.h.tick(3);
  assert.equal(s.sys().power.powered(s.bx + 9, s.by, s.bz + 1), true);
  assert.equal(s.sys().power.powered(s.bx + 15, s.by, s.bz + 1), false);
  // El cable alcanza lo que permite el menor de los dos alcances: el mediano sólo llega a 9.
  const c = lab();
  c.mb(POLE_BIG, 0, c.bx, c.by, c.bz);
  c.set(c.bx + 22, c.by, c.bz, POLE_MEDIUM); // a ~21 del centro del grande: no se unen
  c.set(c.bx + 8, c.by, c.bz + 1, POLE_MEDIUM); // a 7: se unen
  c.h.tick(3);
  assert.equal(c.sys().power.wireList().length, 1);
});

test('postes: dos máquinas pegadas NO forman red; sin poste no reciben nada', () => {
  const { h, bx, by, bz, mb, sys, day } = lab();
  day(10.25);
  mb(SOLAR_PANEL, 0, bx, by, bz);
  mb(ELECTRIC_SMELTER, 0, bx + 3, by, bz); // pegado al panel
  h.tick(3);
  assert.equal(sys().machines.insert(bx + 3, by, bz, { id: RAW_IRON, count: 2 }), 2);
  h.tick(20 * 8);
  assert.equal(sys().machines.peek(bx + 3, by, bz)!.working, false);
  assert.equal(sys().machines.peek(bx + 3, by, bz)!.output, null);
  assert.equal(sys().power.powered(bx + 3, by, bz), false);
});

test('postes: al colocar uno se cablea con los cercanos, sin triángulos, con 5 cables como máximo, y al quitarlo se parte la red', () => {
  const { h, bx, by, bz, set, sys } = lab();
  const p = sys().power;
  // Cadena A—B—C a 7 de distancia (alcance 7,5): A y C no llegan entre sí.
  set(bx, by, bz, POLE_SMALL);
  set(bx + 7, by, bz, POLE_SMALL);
  set(bx + 14, by, bz, POLE_SMALL);
  h.tick(2);
  assert.equal(p.wireList().length, 2);
  assert.equal(p.netCount, 1);
  set(bx + 7, by, bz, AIR); // quitar B parte la red
  h.tick(2);
  assert.equal(p.wireList().length, 0);
  assert.equal(p.netCount, 2);
  // Triángulo: C a 5,83 de A y de B (que ya están unidos): sólo se une a uno.
  const t = lab();
  t.set(t.bx, t.by, t.bz, POLE_SMALL);
  t.set(t.bx + 6, t.by, t.bz, POLE_SMALL);
  t.set(t.bx + 3, t.by, t.bz + 5, POLE_SMALL);
  t.h.tick(2);
  assert.equal(t.sys().power.wireList().length, 2, 'A—B y C—(uno de los dos), no tres');
  assert.equal(t.sys().power.netCount, 1);
  // Cinco cables como máximo por poste.
  const m = lab();
  for (let i = 0; i < 9; i++) m.set(m.bx + (i % 3), m.by, m.bz + Math.floor(i / 3) * 2, POLE_SMALL);
  m.h.tick(3);
  const count = new Map<number, number>();
  for (const [a, b] of m.sys().power.wireList()) {
    count.set(a, (count.get(a) ?? 0) + 1);
    count.set(b, (count.get(b) ?? 0) + 1);
  }
  assert.ok([...count.values()].every((n) => n <= POLE_MAX_WIRES), `cables por poste: ${[...count.values()]}`);
  assert.equal(m.sys().power.netCount, 1, 'y aun así están todos unidos');
});

/** Horno eléctrico de 3×3 (centro en (bx + 3, bz)) con un poste mediano y `panels` paneles de 3×3 a su alrededor. */
function furnaceLab(panels: number) {
  const l = lab();
  l.day(10.25);
  const { bx, by, bz, set, mb } = l;
  set(bx, by, bz, POLE_MEDIUM);
  mb(ELECTRIC_SMELTER, 0, bx + 3, by, bz);
  const spots: [number, number][] = [[bx - 3, bz], [bx, bz + 3], [bx, bz - 3]];
  for (let i = 0; i < panels; i++) mb(SOLAR_PANEL, 0, spots[i][0], by, spots[i][1]);
  l.h.tick(3);
  return l;
}

test('horno eléctrico: 1,6 s por objeto con 180 kW (tres paneles al mediodía); con uno solo va a un tercio', () => {
  const full = furnaceLab(3);
  assert.equal(full.sys().machines.insert(full.bx + 3, full.by, full.bz, { id: RAW_IRON, count: 10 }), 10);
  full.h.tick(20 * 8);
  const n = full.sys().machines.peek(full.bx + 3, full.by, full.bz)!.output?.count ?? 0;
  assert.ok(Math.abs(n - 8 / SMELTER_SECONDS) <= 1, `${n} lingotes en 8 s (esperados ${8 / SMELTER_SECONDS})`);
  assert.equal(full.sys().machines.peek(full.bx + 3, full.by, full.bz)!.output?.id, IRON_INGOT);
  const info = full.sys().power.info(full.bx + 3, full.by, full.bz)!;
  assert.ok(info.supply >= MACHINE_KW.smelter - 1e-6 && info.satisfaction === 1, `${info.supply} kW dan, ${info.demand} piden`);

  const slow = furnaceLab(1);
  slow.sys().machines.insert(slow.bx + 3, slow.by, slow.bz, { id: RAW_IRON, count: 10 });
  slow.h.tick(20 * 8);
  const s = slow.sys().machines.peek(slow.bx + 3, slow.by, slow.bz)!.output?.count ?? 0;
  assert.ok(Math.abs(s - (8 / SMELTER_SECONDS) / 3) <= 1, `${s} lingotes con un tercio de potencia`);
});

test('horno eléctrico: los brazos meten y sacan por cualquiera de las nueve casillas de su huella', () => {
  const { h, bx, by, bz, sys, set } = furnaceLab(3);
  // El horno ocupa x bx+2..bx+4, z bz-1..bz+1. Un cofre con hierro y un brazo que mira a +x, en la fila bz+1 (la de su esquina),
  // dentro del área del poste mediano (±3 desde (bx, bz)).
  set(bx, by, bz + 1, CHEST);
  set(bx + 1, by, bz + 1, inserterState(0, 0)); // deja lo que coge del cofre en la esquina del horno (bx+2, bz+1)
  h.tick(3);
  const src = sys().containers.access(bx, by, bz + 1)!;
  src.state.slots[0] = { id: RAW_IRON, count: 3 };
  src.done();
  h.tick(20 * 12);
  const m = sys().machines.peek(bx + 3, by, bz)!;
  assert.ok((m.output?.count ?? 0) + (m.input?.count ?? 0) >= 1, 'el brazo metió mineral por una casilla de la esquina');
  assert.equal(sys().machines.has(bx + 4, by + 1, bz - 1), true, 'las casillas de arriba y las esquinas son el horno');
  assert.equal(sys().machines.has(bx + 5, by, bz), false);
});

test('acumulador (2×2): se carga con el sobrante de día y mantiene el horno de noche mientras dura', () => {
  const { h, bx, by, bz, mb, sys, day } = furnaceLab(3);
  mb(ACCUMULATOR, 0, bx + 2, by, bz - 3); // x bx+2..bx+3, z bz-3..bz-2: dentro del área del poste mediano
  h.tick(3);
  h.tick(20 * 20); // de día, sin nada que fundir: todo el sobrante (180 kW, tope 300) va al acumulador
  const charged = sys().power.chargeOf(bx + 2, by, bz - 3);
  assert.ok(charged > 2500, `carga ${charged}`);
  // De noche: los paneles no dan nada y el horno funde con la carga.
  day(10.75);
  h.tick(2);
  sys().machines.insert(bx + 3, by, bz, { id: RAW_IRON, count: 4 });
  h.tick(20 * (SMELTER_SECONDS * 2 + 1));
  assert.ok((sys().machines.peek(bx + 3, by, bz)!.output?.count ?? 0) >= 2, 'funde de noche');
  assert.ok(sys().power.chargeOf(bx + 2, by, bz - 3) < charged, 'y gasta carga');
});

test('brazos: gastan energía: sin poste no se mueven; con él, el cofre pasa a otro', () => {
  const dead = lab();
  const move = (l: ReturnType<typeof lab>, poles: boolean) => {
    const { h, bx, by, bz, set, sys, day } = l;
    day(10.25);
    set(bx - 1, by, bz, CHEST);
    set(bx, by, bz, inserterState(0, 0));
    set(bx + 1, by, bz, CHEST);
    if (poles) {
      set(bx, by, bz + 1, POLE_SMALL);
      l.mb(SOLAR_PANEL, 0, bx, by, bz + 4); // toca el área del poste (z hasta bz + 3)
    }
    h.tick(3);
    const src = sys().containers.access(bx - 1, by, bz)!;
    src.state.slots[0] = { id: RAW_IRON, count: 3 };
    src.done();
    h.tick(20 * 10);
    return sys().containers.access(bx + 1, by, bz)!.state.slots.reduce((n, s) => n + (s ? s.count : 0), 0);
  };
  assert.equal(move(dead, false), 0, 'sin energía no se mueve');
  assert.equal(move(lab(), true), 3, 'con energía pasa los tres');
});

test('cables: se mandan a los jugadores cercanos y, con los acumuladores, se guardan y se recuperan', () => {
  const store = new MemoryStore();
  const a = lab(store);
  a.day(10.25);
  a.set(a.bx, a.by, a.bz, POLE_MEDIUM);
  a.set(a.bx + 6, a.by, a.bz, POLE_SMALL);
  a.mb(ACCUMULATOR, 0, a.bx + 1, a.by, a.bz - 3); // 2×2: x bx+1..bx+2, z bz-3..bz-2 (dentro del área ±3 del mediano)
  a.mb(SOLAR_PANEL, 0, a.bx, a.by, a.bz + 3);
  a.h.tick(3);
  a.c.pos(a.bx + 2.5, a.by, a.bz + 2.5);
  a.h.tick(45);
  const msgs = a.c.conn.take('wires');
  assert.ok(msgs.length > 0, 'llega el mensaje de cables');
  const rows = msgs[msgs.length - 1].l as number[][];
  assert.equal(rows.length, 1);
  // Los extremos son los puntos de enganche de los dos postes (arriba, en el centro de su casilla).
  const ends = new Set([`${rows[0][0]},${rows[0][2]}`, `${rows[0][3]},${rows[0][5]}`]);
  assert.deepEqual(ends, new Set([`${a.bx + 0.5},${a.bz + 0.5}`, `${a.bx + 6.5},${a.bz + 0.5}`]), 'entre los dos postes');
  assert.equal(rows[0][6], 1, 'gris: hay un poste mediano en un extremo');
  a.h.tick(20 * 10);
  const charge = a.sys().power.chargeOf(a.bx + 1, a.by, a.bz - 3);
  assert.ok(charge > 0);
  a.h.gs.flush(true);
  // Se vuelve a levantar el servidor: el cable y la carga siguen.
  const b = makeServer(4243, store);
  const c2 = b.join('Ingeniera', 'c');
  c2.pos(a.bx + 0.5, a.by + 30, a.bz + 0.5);
  b.tick(60);
  for (let i = -1; i <= 1; i++) b.gs.world.ensureChunk((a.bx + i * 6) >> 4, a.bz >> 4);
  b.tick(5);
  assert.equal(b.gs.sys.power.wireList().length, 1, 'el cable se recuperó');
  // (sigue cargándose con los paneles mientras el servidor vuelve a arrancar: nunca menos de lo que tenía al guardar)
  assert.ok(b.gs.sys.power.chargeOf(a.bx + 1, a.by, a.bz - 3) >= charge - 2, 'y la carga del acumulador');
  assert.equal(b.gs.sys.power.netCount, 1);
});
