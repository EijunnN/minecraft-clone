// Programa lunar: cintas completas como las de Factorio: nivel exprés, subterráneas (emparejado, túneles, carriles, cargas laterales),
// divisores (reparto, prioridades, filtro), sustitución rápida al colocar encima y lo que se guarda y se manda.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AIR, STONE, BELTS, UNDERGROUNDS, SPLITTERS, INSERTERS, POLE_SMALL, POLE_MEDIUM, beltState, beltInfo, undergroundState, undergroundInfo,
  splitterInfo, multiFootprint, inserterState, inserterInfo, isBeltLike, isSplitter, familyBase, UNDERGROUND_MAX, EXTRACTOR, extractorInfo,
} from '../src/shared/blocks';
import { IRON_INGOT, COAL, RAW_IRON } from '../src/shared/items';
import { planPlacement, type PlaceHit } from '../src/shared/placement';
import { undergroundKindFor, lookDir, dirYaw } from '../src/shared/logisticsPlacement';
import { BELT_THROUGHPUT, BELT_SPEEDS, newBelt, relink, orderBelts, stepBelts, beltCount, BELT_SPACING, type Belt } from '../src/shared/logistics/belts';
import { carryVelocity } from '../src/shared/logistics/carry';
import { MemoryStore } from '../src/shared/sim/store';
import { makeServer } from './harness';
import { putMulti } from './multi';

function lab(store?: MemoryStore) {
  const h = makeServer(4243, store);
  const c = h.join('Ingeniera', 'c');
  const [sx, , sz] = c.welcome.spawn as [number, number, number];
  const bx = Math.floor(sx), by = 160, bz = Math.floor(sz);
  c.pos(bx + 0.5, by + 30, bz + 0.5);
  h.tick(60);
  const W = h.gs.world;
  for (let dx = -20; dx <= 20; dx++) {
    for (let dz = -20; dz <= 20; dz++) {
      W.setBlock(bx + dx, by - 1, bz + dz, STONE);
      for (let y = by; y < by + 6; y++) W.setBlock(bx + dx, y, bz + dz, AIR);
    }
  }
  h.tick(2);
  const belts = () => h.gs.sys.belts;
  const set = (x: number, y: number, z: number, id: number) => void W.setBlock(x, y, z, id);
  return { h, c, bx, by, bz, W, belts, set };
}

const items = (b: Belt | null, lane: number) => (b ? b.lanes[lane].map((i) => i.s.id) : []);

test('exprés: 45 objetos/s (22,5 por carril) a 5,625 bloques/s', () => {
  assert.equal(BELT_THROUGHPUT[2], 45);
  assert.equal(BELT_SPEEDS[2], 5.625);
  // Motor: una fila larga de cintas exprés llenas entrega 45 objetos por segundo.
  const row: Belt[] = [];
  for (let i = 0; i < 12; i++) row.push(newBelt(i, 0, 0, 0, 2));
  const at = (x: number, y: number, z: number) => (y === 0 && z === 0 ? row[x] ?? null : null);
  for (const b of row) relink(b, at);
  const ordered = orderBelts(row);
  const last = row[row.length - 1];
  let delivered = 0;
  for (let t = 0; t < 400; t++) {
    // Se rellena la primera cinta a tope en los dos carriles y se retira lo que llega al final (a 1 objeto por hueco).
    for (const lane of [0, 1] as const) for (let p = 0.125; p < 1; p += BELT_SPACING) if (!row[0].lanes[lane].some((i) => Math.abs(i.p - p) < 0.24)) row[0].lanes[lane].push({ s: { id: IRON_INGOT, count: 1 }, p });
    for (const lane of row[0].lanes) lane.sort((a, b) => b.p - a.p);
    stepBelts(ordered, 0.05);
    if (t >= 100) for (const lane of last.lanes) for (const it of lane.splice(0)) void it, delivered++;
  }
  const perSecond = delivered / ((400 - 100) * 0.05);
  assert.ok(perSecond > 40 && perSecond <= 46, `${perSecond.toFixed(1)} objetos/s`);
});

test('subterráneas: la entrada y la salida se emparejan solas (la más cercana en línea, mismo sentido y nivel, hasta 5/7/9)', () => {
  const { h, bx, by, bz, set, belts } = lab();
  // Entrada en x0 y salida a 3 casillas: pareja.
  set(bx, by, bz, undergroundState(0, 0, 0));
  set(bx + 3, by, bz, undergroundState(0, 0, 1));
  // Una salida a 6 (más lejos que el alcance de 5): sin pareja.
  set(bx, by, bz + 4, undergroundState(0, 0, 0));
  set(bx + 6, by, bz + 4, undergroundState(0, 0, 1));
  // A 5 exactos: pareja. A otro nivel: no.
  set(bx, by, bz + 8, undergroundState(0, 0, 0));
  set(bx + 5, by, bz + 8, undergroundState(0, 0, 1));
  set(bx, by, bz + 12, undergroundState(1, 0, 0));
  set(bx + 3, by, bz + 12, undergroundState(0, 0, 1));
  h.tick(3);
  const net = belts().net;
  assert.equal(net.tunnels.size, 2, 'sólo dos parejas');
  const tun = [...net.tunnels.values()].map((t) => t.length).sort();
  assert.deepEqual(tun, [2, 4], 'los tramos de túnel entre la entrada y la salida (3 → 2; 5 → 4)');
  // Un alcance de 9 para la exprés.
  assert.deepEqual([...UNDERGROUND_MAX], [5, 7, 9]);
  // La entrada ve una salida más cercana que otra: elige la más cercana. Y una segunda entrada en medio corta la línea.
  const c = lab();
  c.set(c.bx, c.by, c.bz, undergroundState(0, 0, 0));
  c.set(c.bx + 2, c.by, c.bz, undergroundState(0, 0, 0)); // otra entrada
  c.set(c.bx + 4, c.by, c.bz, undergroundState(0, 0, 1)); // se une a la de en medio
  c.h.tick(3);
  assert.equal(c.belts().net.tunnels.size, 1);
  const pairedEntrance = [...c.belts().net.tunnels.keys()][0];
  assert.equal(pairedEntrance, [...c.belts().net.tiles.entries()].find(([, b]) => b.x === c.bx + 2)![0], 'la pareja es la entrada más cercana a la salida');
});

test('subterráneas: lo que entra sale por la otra, carril a carril, sin ocupar lo de en medio', () => {
  const { h, bx, by, bz, set, belts } = lab();
  set(bx, by, bz, undergroundState(0, 0, 0));
  set(bx + 4, by, bz, undergroundState(0, 0, 1));
  set(bx + 5, by, bz, beltState(0, 0, 0));
  set(bx + 6, by, bz, beltState(0, 0, 0));
  // Lo de en medio puede ser otra cosa (aquí, una cinta que cruza en sentido contrario).
  set(bx + 2, by, bz, beltState(0, 1, 0));
  set(bx + 2, by, bz + 1, beltState(0, 1, 0));
  h.tick(3);
  assert.ok(belts().put(bx, by, bz, 0, 0.3, { id: IRON_INGOT, count: 1 }));
  assert.ok(belts().put(bx, by, bz, 1, 0.3, { id: COAL, count: 1 }));
  h.tick(20 * 6);
  const end = belts().at(bx + 6, by, bz)!;
  assert.deepEqual(items(end, 0), [IRON_INGOT], 'el carril izquierdo sigue siendo el izquierdo');
  assert.deepEqual(items(end, 1), [COAL]);
  // Sin nada en el túnel al final, y la cinta que cruza no ha recibido nada.
  assert.equal(beltCount(belts().at(bx + 2, by, bz)!), 0);
  for (const { belt } of belts().net.allTunnelPieces()) assert.equal(beltCount(belt), 0);
});

test('subterráneas: el rendimiento es el de la cinta (el túnel no es un cuello de botella)', () => {
  const { h, bx, by, bz, set, belts } = lab();
  set(bx, by, bz, undergroundState(1, 0, 0));
  set(bx + 5, by, bz, undergroundState(1, 0, 1));
  for (let i = 6; i <= 9; i++) set(bx + i, by, bz, beltState(1, 0, 0));
  h.tick(3);
  // Se mete todo lo que cabe cada tick en la entrada durante 10 s y se cuenta lo que llega al final.
  let put = 0;
  for (let t = 0; t < 200; t++) {
    for (const lane of [0, 1] as const) if (belts().put(bx, by, bz, lane, 0.05, { id: IRON_INGOT, count: 1 })) put++;
    h.tick(1);
    // Vaciar el final para que no se atasque.
    const end = belts().at(bx + 9, by, bz)!;
    end.lanes[0].length = 0;
    end.lanes[1].length = 0;
  }
  assert.ok(put > 200 * 0.6, `entraron ${put}`);
});

test('subterráneas: una carga lateral sólo mete el carril de la mitad abierta; la salida no recibe de espaldas', () => {
  const { h, bx, by, bz, set, belts } = lab();
  // Una entrada mirando a +x con una cinta que le llega por el costado (mirando a +z, desde z−1) con objetos en los dos carriles.
  set(bx + 2, by, bz, undergroundState(0, 0, 0));
  set(bx + 6, by, bz, undergroundState(0, 0, 1));
  set(bx + 7, by, bz, beltState(0, 0, 0));
  set(bx + 2, by, bz - 1, beltState(0, 1, 0)); // va a +z hacia la entrada, de lado
  h.tick(3);
  const feeder = belts().at(bx + 2, by, bz - 1)!;
  assert.equal(feeder.out?.to, belts().at(bx + 2, by, bz));
  assert.equal(feeder.out?.only !== undefined, true, 'la carga lateral lleva máscara de carril');
  // La cinta va a +z: su carril izquierdo cae hacia +x (delante de la entrada), el derecho hacia −x (atrás, mitad abierta).
  assert.equal(feeder.out!.only, 1, 'sólo pasa el carril derecho (el que cae en la mitad abierta de la entrada)');
  belts().put(bx + 2, by, bz - 1, 0, 0.6, { id: IRON_INGOT, count: 1 });
  belts().put(bx + 2, by, bz - 1, 1, 0.6, { id: COAL, count: 1 });
  h.tick(20 * 8);
  const end = belts().at(bx + 7, by, bz)!;
  const all = [...items(end, 0), ...items(end, 1)];
  assert.deepEqual(all, [COAL], 'sólo el carbón (carril derecho) pasó');
  assert.deepEqual(items(feeder, 0), [IRON_INGOT], 'el hierro se queda esperando en su carril, bloqueado');
  // Una cinta que le llegue de espaldas a la SALIDA no le pasa nada (la salida no recibe por detrás: ahí está el túnel).
  const b = lab();
  b.set(b.bx, b.by, b.bz, undergroundState(0, 0, 0));
  b.set(b.bx + 2, b.by, b.bz, undergroundState(0, 0, 1));
  b.set(b.bx + 1, b.by, b.bz, beltState(0, 0, 0)); // una cinta que cruza por el hueco del túnel y mira a la salida
  b.h.tick(3);
  assert.equal(b.belts().at(b.bx + 1, b.by, b.bz)!.out, null, 'no hay enlace por detrás de la salida');
  assert.equal(b.belts().net.tunnels.size, 1, 'y el túnel sigue ahí');
});

test('subterráneas: romper una parte suelta lo que llevaba el túnel; lo del túnel se guarda y se recupera', () => {
  const store = new MemoryStore();
  const a = lab(store);
  a.set(a.bx, a.by, a.bz, undergroundState(0, 0, 0));
  a.set(a.bx + 4, a.by, a.bz, undergroundState(0, 0, 1));
  a.set(a.bx + 5, a.by, a.bz, beltState(0, 0, 0));
  a.h.tick(3);
  for (let i = 0; i < 4; i++) a.belts().put(a.bx, a.by, a.bz, 0, 0.05, { id: IRON_INGOT, count: 1 }), a.h.tick(6);
  a.h.tick(12);
  const inTunnel = () => a.belts().net.allTunnelPieces().reduce((n, { belt }) => n + beltCount(belt), 0);
  assert.ok(inTunnel() > 0, `hay ${inTunnel()} objetos por el túnel`);
  const n = inTunnel();
  a.h.gs.flush(true);
  // Se levanta el servidor con el mismo almacén: los objetos del túnel siguen ahí.
  const b = lab(store);
  // (lab de nuevo llena y limpia: se vuelven a poner las piezas para que el túnel exista)
  void b;
  const h2 = makeServer(4243, store);
  const c2 = h2.join('Ingeniera', 'c');
  c2.pos(a.bx + 0.5, a.by + 30, a.bz + 0.5);
  h2.tick(60);
  for (let i = 0; i <= 5; i++) h2.gs.world.ensureChunk((a.bx + i) >> 4, a.bz >> 4);
  h2.tick(5);
  const after = h2.gs.sys.belts.net.allTunnelPieces().reduce((s, { belt }) => s + beltCount(belt), 0)
    + [0, 1, 2, 3, 4, 5].reduce((s, i) => s + beltCount(h2.gs.sys.belts.at(a.bx + i, a.by, a.bz) ?? newBelt(0, 0, 0, 0)), 0);
  assert.ok(after >= 1, `se recuperaron ${after} (había ${n} en el túnel)`);
  // Romper la salida suelta lo del túnel.
  a.set(a.bx + 4, a.by, a.bz, AIR);
  a.h.tick(3);
  assert.equal(a.belts().net.tunnels.size, 0);
  const dropped = [...a.h.gs.entities.list.values()].filter((e) => e.stack?.id === IRON_INGOT).length;
  assert.ok(dropped >= 1, `cayeron ${dropped}`);
});

test('colocar una subterránea: la siguiente en línea cierra la pareja; lejos o tras otra salida, abre una entrada nueva', () => {
  const ground = new Map<string, number>();
  const get = (x: number, y: number, z: number) => ground.get(`${x},${y},${z}`) ?? (y === 63 ? STONE : AIR);
  const put = (x: number, id: number) => ground.set(`${x},64,0`, id);
  const hit = (x: number): PlaceHit => ({ x, y: 63, z: 0, nx: 0, ny: 1, nz: 0, px: x + 0.5, py: 64, pz: 0.5, id: STONE }) as PlaceHit;
  const face = dirYaw(0); // mirando a +x
  // Primera: una entrada.
  let e = planPlacement(get, hit(0), UNDERGROUNDS[0], face, 0)!;
  assert.equal(undergroundInfo(e[0][3])!.kind, 0);
  put(0, e[0][3]);
  // Otra a 3 casillas, en línea y mismo sentido: la salida.
  e = planPlacement(get, hit(3), UNDERGROUNDS[0], face, 0)!;
  assert.deepEqual([undergroundInfo(e[0][3])!.kind, undergroundInfo(e[0][3])!.dir], [1, 0]);
  put(3, e[0][3]);
  // Una tercera más allá de la salida: entrada nueva (no hay entrada libre en su alcance).
  e = planPlacement(get, hit(5), UNDERGROUNDS[0], face, 0)!;
  assert.equal(undergroundInfo(e[0][3])!.kind, 0, 'la entrada de antes ya tiene su salida');
  // Demasiado lejos de la entrada: entrada nueva.
  ground.clear();
  put(0, undergroundState(0, 0, 0));
  e = planPlacement(get, hit(6), UNDERGROUNDS[0], face, 0)!;
  assert.equal(undergroundInfo(e[0][3])!.kind, 0);
  assert.equal(undergroundKindFor(get, 0, 0, 5, 64, 0), 1, 'a 5 exactos sí');
  assert.equal(undergroundKindFor(get, 1, 0, 5, 64, 0), 0, 'otro nivel: no');
  assert.equal(undergroundKindFor(get, 0, 1, 5, 64, 0), 0, 'otro sentido: no');
  void lookDir;
});

// ------------------------------------------------------------------ divisores

/** Un divisor de +x en la casilla (bx + 3, bz) con dos cintas que le entran y dos que salen; devuelve las piezas. */
function splitterLab(tier = 0, store?: MemoryStore) {
  const l = lab(store);
  const { bx, by, bz, W, set } = l;
  putMulti(W, SPLITTERS[tier], 0, bx + 3, by, bz);
  const cells = multiFootprint(SPLITTERS[tier], 0, bx + 3, by, bz);
  const left = cells.find(([, , , id]) => splitterInfo(id)!.half === 0)!;
  const right = cells.find(([, , , id]) => splitterInfo(id)!.half === 1)!;
  const rows = { l: left[2], r: right[2] };
  for (let i = 0; i <= 2; i++) {
    set(bx + i, by, rows.l, beltState(tier, 0, 0));
    set(bx + i, by, rows.r, beltState(tier, 0, 0));
  }
  for (let i = 4; i <= 7; i++) {
    set(bx + i, by, rows.l, beltState(tier, 0, 0));
    set(bx + i, by, rows.r, beltState(tier, 0, 0));
  }
  l.h.tick(3);
  return { ...l, rows, ctrl: [left[0], left[1], left[2]] as [number, number, number] };
}

test('divisor: 2×1 con dos mitades (izquierda y derecha) que se rompen juntas; sólo recibe de espaldas', () => {
  const { h, bx, by, bz, W, belts, rows, set } = splitterLab();
  assert.equal(isSplitter(W.getBlock(bx + 3, by, rows.l)), true);
  assert.equal(isSplitter(W.getBlock(bx + 3, by, rows.r)), true);
  assert.equal(Math.abs(rows.l - rows.r), 1);
  assert.deepEqual([splitterInfo(W.getBlock(bx + 3, by, rows.l))!.half, splitterInfo(W.getBlock(bx + 3, by, rows.r))!.half], [0, 1]);
  assert.ok(belts().at(bx + 3, by, rows.l) && belts().at(bx + 3, by, rows.r), 'cada mitad es una pieza de la red');
  // Una cinta de lado no le pasa nada.
  set(bx + 3, by, Math.min(rows.l, rows.r) - 1, beltState(0, 1, 0)); // mira +z, hacia el divisor por su costado
  h.tick(3);
  assert.equal(belts().at(bx + 3, by, Math.min(rows.l, rows.r) - 1)!.out, null, 'los divisores no reciben de lado');
  // Romper una mitad quita las dos.
  set(bx + 3, by, rows.r, AIR);
  h.tick(3);
  assert.equal(isSplitter(W.getBlock(bx + 3, by, rows.l)), false);
  assert.equal(belts().net.splits.size, 0);
});

test('divisor: reparte a partes iguales entre las dos salidas, y si una está bloqueada todo va por la otra', () => {
  const { h, bx, by, bz, belts, rows, set } = splitterLab();
  const fill = (n: number) => {
    for (let i = 0; i < n; i++) {
      belts().put(bx, by, rows.l, 0, 0.1, { id: IRON_INGOT, count: 1 });
      h.tick(9);
    }
  };
  const count = (row: number) => [4, 5, 6, 7].reduce((n, i) => n + beltCount(belts().at(bx + i, by, row)!), 0);
  fill(12);
  h.tick(20 * 6);
  const l = count(rows.l), r = count(rows.r);
  assert.equal(l + r, 12, 'no se pierde nada');
  assert.ok(Math.abs(l - r) <= 1, `${l} por la izquierda y ${r} por la derecha`);
  // Bloqueada la salida izquierda (se llena hasta el final): todo lo nuevo va por la derecha.
  const b = splitterLab();
  for (const i of [4, 5, 6, 7]) for (const lane of [0, 1] as const) for (let p = 0.125; p < 1; p += 0.25) b.belts().put(b.bx + i, b.by, b.rows.l, lane, p, { id: COAL, count: 1 });
  for (let i = 0; i < 6; i++) {
    b.belts().put(b.bx, b.by, b.rows.l, 0, 0.1, { id: IRON_INGOT, count: 1 });
    b.h.tick(9);
  }
  b.h.tick(20 * 5);
  const rightIron = [4, 5, 6, 7].reduce((n, i) => n + b.belts().at(b.bx + i, b.by, b.rows.r)!.lanes.reduce((m, ln) => m + ln.filter((it) => it.s.id === IRON_INGOT).length, 0), 0);
  assert.equal(rightIron, 6, 'todo el hierro salió por la derecha');
  void set;
});

test('divisor: prioridad de salida, filtro y prioridad de entrada', () => {
  // Prioridad de salida a la derecha: todo por la derecha mientras quepa.
  const a = splitterLab();
  a.belts().setSplitterConfig(...a.ctrl, { outPri: 1 });
  for (let i = 0; i < 6; i++) {
    a.belts().put(a.bx, a.by, a.rows.l, 0, 0.1, { id: IRON_INGOT, count: 1 });
    a.h.tick(9);
  }
  a.h.tick(20 * 5);
  const on = (l: typeof a, row: number, id?: number) => [4, 5, 6, 7].reduce((n, i) => n + l.belts().at(l.bx + i, l.by, row)!.lanes.reduce((m, ln) => m + ln.filter((it) => id === undefined || it.s.id === id).length, 0), 0);
  assert.equal(on(a, a.rows.r), 6);
  assert.equal(on(a, a.rows.l), 0);
  // Filtro: el carbón sólo a la izquierda; lo demás sólo a la derecha (aunque esa salida esté llena, no se van al otro lado).
  const f = splitterLab();
  f.belts().setSplitterConfig(...f.ctrl, { filter: COAL, filterSide: -1 });
  for (let i = 0; i < 4; i++) {
    f.belts().put(f.bx, f.by, f.rows.r, 0, 0.1, { id: i % 2 ? COAL : IRON_INGOT, count: 1 });
    f.h.tick(9);
  }
  f.h.tick(20 * 5);
  assert.equal(on(f, f.rows.l, COAL), 2, 'el carbón por la izquierda');
  assert.equal(on(f, f.rows.l, IRON_INGOT), 0);
  assert.equal(on(f, f.rows.r, IRON_INGOT), 2, 'el hierro, por la derecha');
  assert.equal(on(f, f.rows.r, COAL), 0);
  assert.deepEqual(f.belts().splitterConfig(...f.ctrl), { inPri: 0, outPri: 0, filter: COAL, filterSide: -1 });
  // Prioridad de entrada: con la salida de la izquierda como única salida disponible y las dos entradas llenas, entra primero la prioritaria.
  const p = splitterLab();
  p.belts().setSplitterConfig(...p.ctrl, { inPri: 1, outPri: -1 });
  // Sólo hay sitio en una salida (la de la izquierda): se bloquea la de la derecha.
  for (const i of [4, 5, 6, 7]) for (const lane of [0, 1] as const) for (let q = 0.125; q < 1; q += 0.25) p.belts().put(p.bx + i, p.by, p.rows.r, lane, q, { id: COAL, count: 1 });
  for (const row of [p.rows.l, p.rows.r]) for (const i of [0, 1, 2]) for (const lane of [0, 1] as const) for (let q = 0.125; q < 1; q += 0.25) p.belts().put(p.bx + i, p.by, row, lane, q, { id: row === p.rows.r ? RAW_IRON : IRON_INGOT, count: 1 });
  p.h.tick(20 * 3);
  const got = [4, 5, 6, 7].flatMap((i) => p.belts().at(p.bx + i, p.by, p.rows.l)!.lanes.flatMap((ln) => ln.map((it) => it.s.id)));
  const fromRight = got.filter((id) => id === RAW_IRON).length, fromLeft = got.filter((id) => id === IRON_INGOT).length;
  assert.ok(fromRight > fromLeft, `con prioridad a la derecha entra más de la derecha (${fromRight} frente a ${fromLeft})`);
});

test('divisor: la configuración se guarda y se manda a los jugadores con lo que llevan sus cintas', () => {
  const store = new MemoryStore();
  const a = splitterLab(0, store);
  a.belts().setSplitterConfig(...a.ctrl, { inPri: -1, outPri: 1, filter: COAL, filterSide: 1 });
  a.c.pos(a.bx + 1.5, a.by, a.bz + 1.5);
  a.belts().put(a.bx, a.by, a.rows.l, 0, 0.3, { id: IRON_INGOT, count: 1 });
  a.h.tick(25);
  const msgs = a.c.conn.take('belts');
  const cfg = msgs.flatMap((m) => (m.c as number[][] | undefined) ?? []);
  assert.ok(cfg.some((r) => r[3] === -1 && r[4] === 1 && r[5] === COAL && r[6] === 1), 'llega la configuración del divisor');
  a.h.gs.flush(true);
  const h2 = makeServer(4243, store);
  const c2 = h2.join('Ingeniera', 'c');
  c2.pos(a.bx + 0.5, a.by + 30, a.bz + 0.5);
  h2.tick(60);
  for (let i = 0; i <= 8; i++) h2.gs.world.ensureChunk((a.bx + i) >> 4, a.bz >> 4);
  h2.tick(5);
  assert.deepEqual(h2.gs.sys.belts.splitterConfig(...a.ctrl), { inPri: -1, outPri: 1, filter: COAL, filterSide: 1 });
});

// ------------------------------------------------------------------ sustitución rápida

const hitOn = (x: number, y: number, z: number, id: number): PlaceHit => ({ x, y, z, nx: 0, ny: 1, nz: 0, px: x + 0.5, py: y + 1, pz: z + 0.5, id }) as PlaceHit;
const nothing = () => AIR;

test('sustitución rápida: una cinta, subterránea, divisor, brazo o poste mejor sobre uno del mismo tipo lo sustituye', () => {
  // Cinta básica hacia +z sobre la que se pone una exprés (mirando a +x): sube de nivel y toma el sentido de ahora.
  const up = planPlacement(nothing, hitOn(5, 64, 5, beltState(0, 1, 0)), BELTS[2], dirYaw(0), 0)!;
  assert.deepEqual(up.map((e) => e.slice(0, 3)), [[5, 64, 5]]);
  assert.deepEqual([beltInfo(up[0][3])!.tier, beltInfo(up[0][3])!.dir], [2, 0]);
  // Del mismo nivel no sustituye (sigue poniendo la siguiente al lado).
  const same = planPlacement(nothing, hitOn(5, 64, 5, beltState(0, 1, 0)), BELTS[0], dirYaw(0), 0)!;
  assert.deepEqual(same[0].slice(0, 3), [5, 65, 5]);
  // Subterránea: conserva el sentido y el tipo.
  const ug = planPlacement(nothing, hitOn(5, 64, 5, undergroundState(0, 2, 1)), UNDERGROUNDS[1], dirYaw(0), 0)!;
  assert.deepEqual([undergroundInfo(ug[0][3])!.tier, undergroundInfo(ug[0][3])!.dir, undergroundInfo(ug[0][3])!.kind], [1, 2, 1]);
  // Divisor: cambia sus dos mitades y conserva el sentido.
  const cells = multiFootprint(SPLITTERS[0], 1, 10, 64, 10);
  const get = (x: number, y: number, z: number) => cells.find((c) => c[0] === x && c[1] === y && c[2] === z)?.[3] ?? AIR;
  const sp = planPlacement(get, hitOn(cells[1][0], cells[1][1], cells[1][2], cells[1][3]), SPLITTERS[2], dirYaw(0), 0)!;
  assert.equal(sp.length, 2);
  for (const e of sp) assert.deepEqual([splitterInfo(e[3])!.tier, splitterInfo(e[3])!.dir], [2, 1]);
  assert.deepEqual(sp.map((e) => e.slice(0, 3)).sort(), cells.map((c) => c.slice(0, 3)).sort());
  // Brazo básico → rápido: conserva el sentido.
  const ins = planPlacement(nothing, hitOn(5, 64, 5, inserterState(0, 2)), INSERTERS[1], dirYaw(0), 0)!;
  assert.deepEqual([inserterInfo(ins[0][3])!.tier, inserterInfo(ins[0][3])!.dir], [1, 2]);
  // Postes: pequeño → mediano y al revés.
  assert.equal(planPlacement(nothing, hitOn(5, 64, 5, POLE_SMALL), POLE_MEDIUM, 0, 0)![0][3], POLE_MEDIUM);
  assert.equal(planPlacement(nothing, hitOn(5, 64, 5, POLE_MEDIUM), POLE_SMALL, 0, 0)![0][3], POLE_SMALL);
  assert.ok(isBeltLike(up[0][3]) && familyBase(up[0][3]) === BELTS[2]);
});

test('sustitución rápida en el servidor: la cinta mejora sin perder lo que lleva', () => {
  const { h, bx, by, bz, set, belts } = lab();
  for (let i = 0; i < 3; i++) set(bx + i, by, bz, beltState(0, 0, 0));
  h.tick(3);
  belts().put(bx + 1, by, bz, 0, 0.5, { id: IRON_INGOT, count: 1 });
  set(bx + 1, by, bz, beltState(2, 0, 0)); // (lo que hace el servidor al recibir el clic con una exprés)
  h.tick(2);
  const b = belts().at(bx + 1, by, bz)!;
  assert.equal(b.tier, 2);
  assert.equal(beltCount(b) + beltCount(belts().at(bx + 2, by, bz)!), 1, 'el objeto sigue en la cinta');
});

// ------------------------------------------------------------------ girar lo puesto

test('girar con R lo ya puesto: cintas, subterráneas, brazos y máquinas (una de 3×3 en su sitio; un divisor cambia de huella)', () => {
  const { h, c, bx, by, bz, set, W, belts } = lab();
  c.pos(bx + 0.5, by, bz + 0.5);
  const rot = (x: number, y: number, z: number, d: number) => {
    c.send({ t: 'rot', x, y, z, d });
    h.tick(3);
  };
  set(bx + 1, by, bz, beltState(1, 0, 0));
  rot(bx + 1, by, bz, 2);
  assert.deepEqual([beltInfo(W.getBlock(bx + 1, by, bz))!.tier, beltInfo(W.getBlock(bx + 1, by, bz))!.dir], [1, 2], 'la cinta conserva su nivel');
  set(bx + 2, by, bz, undergroundState(2, 0, 1));
  rot(bx + 2, by, bz, 3);
  assert.deepEqual([undergroundInfo(W.getBlock(bx + 2, by, bz))!.dir, undergroundInfo(W.getBlock(bx + 2, by, bz))!.kind, undergroundInfo(W.getBlock(bx + 2, by, bz))!.tier], [3, 1, 2]);
  set(bx + 3, by, bz, inserterState(1, 0));
  rot(bx + 3, by, bz, 1);
  assert.equal(inserterInfo(W.getBlock(bx + 3, by, bz))!.dir, 1);
  // Una máquina de 3×3 gira en su sitio: no se quita ninguna casilla y lo que guarda se queda.
  c.pos(bx + 6.5, by, bz + 6.5);
  putMulti(W, EXTRACTOR, 0, bx + 8, by, bz + 8);
  h.tick(3);
  const before = h.gs.sys.extractors.peek(bx + 8, by, bz + 8);
  assert.ok(before);
  rot(bx + 8, by, bz + 8, 2);
  assert.equal(extractorInfo(W.getBlock(bx + 8, by, bz + 8))!.dir, 2);
  assert.equal(h.gs.sys.extractors.peek(bx + 8, by, bz + 8), before, 'es la misma máquina (no se rehízo)');
  // Girar desde una casilla lateral también vale.
  rot(bx + 9, by + 1, bz + 7, 1);
  assert.equal(extractorInfo(W.getBlock(bx + 8, by, bz + 8))!.dir, 1);
  // Un divisor cambia de huella (2×1 → 1×2): necesita las casillas nuevas libres.
  putMulti(W, SPLITTERS[0], 0, bx + 4, by, bz + 4);
  h.tick(3);
  const cells0 = multiFootprint(SPLITTERS[0], 0, bx + 4, by, bz + 4);
  assert.equal(cells0.length, 2);
  const [nx, ny, nz] = multiFootprint(SPLITTERS[0], 1, bx + 4, by, bz + 4)[1]; // la casilla nueva de la huella girada
  assert.ok(!cells0.some(([x, y, z]) => x === nx && y === ny && z === nz));
  set(nx, ny, nz, STONE); // estorba
  rot(bx + 4, by, bz + 4, 1);
  assert.equal(splitterInfo(W.getBlock(bx + 4, by, bz + 4))!.dir, 0, 'con una casilla ocupada no gira');
  set(nx, ny, nz, AIR);
  rot(bx + 4, by, bz + 4, 1);
  assert.equal(splitterInfo(W.getBlock(bx + 4, by, bz + 4))!.dir, 1);
  for (const [x, y, z] of multiFootprint(SPLITTERS[0], 1, bx + 4, by, bz + 4)) assert.equal(isSplitter(W.getBlock(x, y, z)), true);
  void belts;
});

test('las cintas llevan lo que hay encima: a su velocidad, en su sentido (cinta, subterránea y divisor)', () => {
  assert.deepEqual(carryVelocity(beltState(0, 0, 0)), [1.875, 0]);
  assert.deepEqual(carryVelocity(beltState(1, 3, 0)), [0, -3.75]);
  assert.deepEqual(carryVelocity(undergroundState(2, 2, 1)), [-5.625, 0]);
  assert.deepEqual(carryVelocity(multiFootprint(SPLITTERS[0], 1, 0, 0, 0)[0][3]), [0, 1.875]);
  assert.equal(carryVelocity(STONE), null);
  // Un objeto tirado sobre una cinta larga avanza con ella (unos 1,9 bloques por segundo).
  const { h, bx, by, bz, set } = lab();
  for (let i = 0; i < 14; i++) set(bx + i, by, bz, beltState(0, 0, 0));
  h.tick(3);
  const e = h.gs.entities.spawnItem({ id: IRON_INGOT, count: 1 }, bx + 1.5, by + 0.3, bz + 0.5, 0, 0, 0, undefined, 0);
  h.tick(2);
  const x0 = e.x;
  h.tick(40);
  const moved = e.x - x0;
  assert.ok(moved > 2.5 && moved < 4.6, `avanzó ${moved.toFixed(2)} bloques en 2 s`);
  assert.ok(Math.abs(e.z - (bz + 0.5)) < 0.3, 'sigue en su fila');
});
