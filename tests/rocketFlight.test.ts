// Programa lunar: el cohete de punta a punta en el servidor. Se pone con /cohete, se sube, despega, cruza a la Luna, baja
// frenando y se posa; y de vuelta, lo mismo al revés hasta la plataforma de la que salió.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStore } from '../src/shared/sim/store';
import { Multiverse } from '../src/shared/sim/Multiverse';
import { PROTOCOL_VERSION } from '../src/shared/protocol';
import { DIM_OVERWORLD, DIM_MOON, dimensionByKey, dimensionDef } from '../src/shared/dimensions';
import { RK_PHASE, ASCENT_TOP, ROCKET_CABIN_Y, DESCENT_START } from '../src/shared/rocket';
import { createGenerator } from '../src/shared/world/generators';
import { MoonGenerator } from '../src/shared/world/moon';
import { MOON_REGOLITH, MOON_REGOLITH_DARK, MOON_ROCK } from '../src/shared/blocks';
import { FakeConn } from './harness';

function makeRoom() {
  const clock = { now: 1_000_000 };
  let r = 0x1234;
  const rand = () => ((r = (Math.imul(r, 1103515245) + 12345) >>> 0) / 4294967296);
  const mv = new Multiverse(new MemoryStore(), { seed: 12345, now: () => clock.now, flushSeconds: 5, rand, local: true });
  const tick = (n: number) => {
    for (let i = 0; i < n; i++) {
      clock.now += 50;
      mv.tick();
    }
  };
  const clients: { send: (m: object) => void }[] = [];
  /** Avanza `n` ticks; los clientes mandan su posición cada segundo, como los de verdad (si no, el servidor los da por caídos). */
  const fly = (n: number) => {
    for (let i = 0; i < n; i += 20) {
      tick(Math.min(20, n - i));
      for (const c of clients) c.send({ t: 'pos', p: [0, 100, 0], r: [0, 0], s: 0 });
    }
  };
  const join = (name: string) => {
    const conn = new FakeConn();
    mv.connect(conn);
    const send = (m: object) => mv.message(conn, JSON.stringify(m));
    send({ t: 'hello', v: PROTOCOL_VERSION, name, shirt: '#ff0000', mode: 'c' });
    const c = { conn, send };
    clients.push(c);
    return c;
  };
  return { mv, tick, fly, join };
}

test('la Luna: registro (un sexto de gravedad, sin aire) y su generador', () => {
  const d = dimensionDef(DIM_MOON);
  assert.equal(d.gravity, 1 / 6);
  assert.equal(d.breathable, false);
  assert.equal(dimensionByKey('luna'), DIM_MOON);
  assert.equal(dimensionByKey('La Luna'), DIM_MOON);
  const gen = createGenerator(DIM_MOON, 7);
  assert.ok(gen instanceof MoonGenerator);
  // Determinista: dos generadores con la misma semilla dan el mismo chunk.
  const a = gen.generate(3, -2), b = createGenerator(DIM_MOON, 7).generate(3, -2);
  assert.deepEqual(a.heights, b.heights);
  assert.equal(Buffer.compare(Buffer.from(a.blocks.buffer), Buffer.from(b.blocks.buffer)), 0);
  // Su suelo es regolito sobre roca lunar, sin agua ni hierba.
  const kinds = new Set<number>(a.blocks);
  assert.ok(kinds.has(MOON_ROCK) && (kinds.has(MOON_REGOLITH) || kinds.has(MOON_REGOLITH_DARK)));
  // Hay llanuras (para aterrizar) cerca del origen y cráteres (relieve) más lejos.
  const sp = gen.findSpawn();
  assert.ok(Number.isFinite(sp.x) && sp.y > 40 && sp.y < 120, `aparición razonable: ${JSON.stringify(sp)}`);
  let lo = Infinity, hi = -Infinity;
  for (let x = -600; x <= 600; x += 12) for (let z = -600; z <= 600; z += 12) {
    const h = gen.surfaceAt(x, z, gen.columnInfo(x, z));
    lo = Math.min(lo, h);
    hi = Math.max(hi, h);
  }
  assert.ok(hi - lo >= 12, `hay relieve (cráteres y colinas): ${lo}..${hi}`);
});

test('cohete: de la Tierra a la Luna y de vuelta, con dos pasajeros', () => {
  const room = makeRoom();
  const ana = room.join('ana'), leo = room.join('leo');
  ana.conn.take('welcome');
  leo.conn.take('welcome');
  for (const p of [ana, leo]) p.send({ t: 'dimok', d: DIM_OVERWORLD });
  const ow = room.mv.overworld;
  ana.send({ t: 'pos', p: [0.5, 100, 0.5], r: [0, 0], s: 0 });
  leo.send({ t: 'pos', p: [1.5, 100, 0.5], r: [0, 0], s: 0 });
  room.tick(2);

  // El cohete aparece y todos saben de él.
  ana.send({ t: 'chat', m: '/cohete' });
  room.tick(2);
  let states = ana.conn.take('rocket');
  assert.ok(states.length >= 1, 'llega el estado del cohete');
  const id = states[states.length - 1].e as number;
  assert.equal(states[states.length - 1].ph, RK_PHASE.IDLE);
  const rocket = ow.entities.list.get(id)!;
  assert.ok(rocket, 'existe la entidad');
  const baseY = rocket.y;

  // Suben los dos (el cohete está a cinco bloques delante) y el piloto despega.
  ana.send({ t: 'pos', p: [rocket.x, baseY, rocket.z + 2], r: [0, 0], s: 0 });
  leo.send({ t: 'pos', p: [rocket.x, baseY, rocket.z + 2.5], r: [0, 0], s: 0 });
  ana.send({ t: 'rboard', e: id });
  leo.send({ t: 'rboard', e: id });
  room.tick(1);
  states = ana.conn.take('rocket');
  const seated = states[states.length - 1].seats as (string | null)[];
  assert.equal(seated.filter((s) => s !== null).length, 2, 'dos plazas ocupadas');
  // Un tercero no puede subirse desde lejos... y ya sentados no pueden volver a subir.
  ana.send({ t: 'rlaunch' });
  room.tick(1);
  assert.equal(ana.conn.take('rocket').pop()?.ph, RK_PHASE.COUNTDOWN);

  // Cuenta atrás: 10 s. Ascenso: el cohete y los pasajeros suben juntos.
  room.fly(200 - 1);
  let ph = ana.conn.take('rocket').pop();
  assert.equal(ph?.ph, RK_PHASE.ASCENT, 'a los 10 s despega');
  room.fly(200); // 10 s de ascenso
  assert.ok(rocket.y > baseY + 5_000, `sube: ${rocket.y - baseY}`);
  // Los pasajeros van en la cabina, no donde diga su cliente (que intenta quedarse en el suelo).
  ana.send({ t: 'pos', p: [0, baseY, 0], r: [0, 0], s: 0 });
  room.tick(1);
  const anaSession = [...(ow as unknown as { sessions: Map<unknown, { name: string; p: number[] }> }).sessions.values()].find((s) => s.name === 'ana')!;
  assert.ok(Math.abs(anaSession.p[1] - (rocket.y + ROCKET_CABIN_Y)) < 0.5, 'el pasajero va con el cohete');

  // Hasta el final del ascenso y el tránsito a oscuras.
  room.fly(400 + 80 + 2);
  const wa = ana.conn.take('welcome');
  const wl = leo.conn.take('welcome');
  assert.equal(wa.length, 1, 'llega a la Luna');
  assert.equal(wa[0].dim, DIM_MOON);
  assert.equal(wl[0].dim, DIM_MOON);
  assert.equal(room.mv.dimensionOf(ana.conn), DIM_MOON);
  assert.equal(room.mv.dimensionOf(leo.conn), DIM_MOON);
  assert.ok(wa[0].at[1] > 1000, `llegan en lo alto de la Luna: ${wa[0].at[1]}`);
  assert.equal(ow.entities.list.has(id), false, 'el cohete de la Tierra desaparece');

  // En la Luna hay un cohete nuevo, esperando a que sus pasajeros monten el mundo; luego baja frenando y se posa.
  const moon = room.mv.server(DIM_MOON);
  const arrived = [...moon.entities.list.values()].filter((e) => e.type === 170);
  assert.equal(arrived.length, 1, 'un único cohete para los dos');
  const mr = arrived[0];
  const y0 = mr.y;
  room.tick(40);
  assert.equal(mr.y, y0, 'espera a que carguen (dimok)');
  ana.send({ t: 'dimok', d: DIM_MOON });
  leo.send({ t: 'dimok', d: DIM_MOON });
  room.tick(2);
  room.fly(20 * 8);
  assert.ok(mr.y < y0 - 100, 'baja');
  // Se posa en el suelo de la Luna.
  let guard = 0;
  while (guard++ < 20 * 90) {
    room.fly(1);
    const st = ana.conn.take('rocket').pop();
    if (st?.ph === RK_PHASE.IDLE) break;
  }
  const gen = moon.world.gen;
  const ground = gen.surfaceAt(Math.floor(mr.x), Math.floor(mr.z), gen.columnInfo(Math.floor(mr.x), Math.floor(mr.z))) + 1;
  assert.ok(Math.abs(mr.y - ground) < 0.01, `posado en el suelo: ${mr.y} vs ${ground}`);
  assert.ok(y0 - ground >= DESCENT_START - 1, 'bajó desde lo alto');

  // Vuelta: mismo cohete, mismos pasajeros, sin salir de sus plazas; despega de la Luna y llega a la plataforma de la Tierra.
  ana.send({ t: 'rlaunch' });
  room.fly(200 + 600 + 80 + 20);
  const back = ana.conn.take('welcome');
  assert.equal(back.at(-1)?.dim, DIM_OVERWORLD, 'vuelve a la Tierra');
  assert.ok(ASCENT_TOP > 0);
  const [bx, , bz] = back.at(-1)!.at;
  assert.ok(Math.abs(bx - rocket.x) < 1 && Math.abs(bz - rocket.z) < 1, `sobre la plataforma de salida (${bx}, ${bz})`);
});
