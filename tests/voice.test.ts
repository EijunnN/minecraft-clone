// Chat de voz por proximidad: el servidor reparte quién tiene la voz activada y pasa, validadas, las señales de
// WebRTC entre dos jugadores que la tienen (la voz en sí va de navegador a navegador).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeRtc } from '../src/shared/sim/server/voice';
import { makeServer } from './harness';

test('señales: sólo ofertas, respuestas y candidatos con tamaños razonables', () => {
  assert.deepEqual(sanitizeRtc({ sdp: { type: 'offer', sdp: 'v=0' } }), { sdp: { type: 'offer', sdp: 'v=0' } });
  assert.deepEqual(sanitizeRtc({ ice: { candidate: 'candidate:1 1 udp 1 1.2.3.4 5 typ host', sdpMid: '0', sdpMLineIndex: 0 } }),
    { ice: { candidate: 'candidate:1 1 udp 1 1.2.3.4 5 typ host', sdpMid: '0', sdpMLineIndex: 0 } });
  assert.equal(sanitizeRtc({ sdp: { type: 'pranswer', sdp: 'x' } }), null);
  assert.equal(sanitizeRtc({ sdp: { type: 'offer', sdp: 'x'.repeat(20000) } }), null);
  assert.equal(sanitizeRtc({ ice: { candidate: 5 } }), null);
  assert.equal(sanitizeRtc('hola'), null);
});

test('servidor: presencia de voz, señales entre quienes la tienen y nada para quien no', () => {
  const h = makeServer(4242);
  const a = h.join('Ana');
  const b = h.join('Beto');
  a.conn.msgs = [];
  b.conn.msgs = [];
  // Ana activa su voz: Beto se entera.
  a.send({ t: 'voice', on: true });
  assert.deepEqual(b.conn.take('voice').map((m) => [m.id, m.on]), [[a.welcome.id, true]]);
  // Beto aún no la tiene: la señal de Ana no le llega.
  a.send({ t: 'rtc', to: b.welcome.id, d: { sdp: { type: 'offer', sdp: 'v=0' } } });
  assert.equal(b.conn.take('rtc').length, 0);
  // Con los dos, sí (con quién la manda); y la respuesta vuelve.
  b.send({ t: 'voice', on: true });
  a.send({ t: 'rtc', to: b.welcome.id, d: { sdp: { type: 'offer', sdp: 'v=0' } } });
  const [offer] = b.conn.take('rtc');
  assert.equal(offer.from, a.welcome.id);
  assert.equal(offer.d.sdp.type, 'offer');
  b.send({ t: 'rtc', to: a.welcome.id, d: { sdp: { type: 'answer', sdp: 'v=0' } } });
  assert.equal(a.conn.take('rtc')[0]?.d.sdp.type, 'answer');
  // Una señal que no vale no pasa.
  a.send({ t: 'rtc', to: b.welcome.id, d: { sdp: { type: 'offer', sdp: 'x'.repeat(20000) } } });
  assert.equal(b.conn.take('rtc').length, 0);
  // Quien entra después ve quién tiene la voz.
  const c = h.join('Carla');
  const info = (c.welcome.players as { id: string; v?: number }[]).find((p) => p.id === a.welcome.id);
  assert.equal(info?.v, 1);
  // Ana la apaga: los demás se enteran y ya no le llegan señales.
  b.conn.msgs = [];
  a.send({ t: 'voice', on: false });
  assert.deepEqual(b.conn.take('voice').map((m) => m.on), [false]);
  b.send({ t: 'rtc', to: a.welcome.id, d: { sdp: { type: 'offer', sdp: 'v=0' } } });
  assert.equal(a.conn.take('rtc').length, 0);
});

test('cliente: la voz se oye entera de cerca y se apaga del todo a los 48 bloques', async () => {
  const { voiceDistanceGain, VOICE_RANGE } = await import('../src/client/voice/VoiceChat');
  assert.equal(VOICE_RANGE, 48);
  assert.equal(voiceDistanceGain(1), 1);
  assert.equal(voiceDistanceGain(48), 0);
  assert.equal(voiceDistanceGain(60), 0);
  assert.ok(voiceDistanceGain(10) > voiceDistanceGain(20) && voiceDistanceGain(20) > voiceDistanceGain(40));
  assert.ok(voiceDistanceGain(40) > 0 && voiceDistanceGain(40) < 0.05);
});

test('entorno: las paredes apagan la voz según el material, las cuevas retumban y el aire libre no', async () => {
  const { voiceOcclusion, voiceReverb } = await import('../src/client/voice/voiceEnvironment');
  const { STONE, GLASS, OAK_LEAVES, WHITE_WOOL } = await import('../src/shared/blocks');
  // Una pared de un bloque de grosor en x = 5 (de y 60 a 70), entre dos cabezas a la misma altura.
  const wall = (id: number, thick = 1) => (x: number, y: number) => (x >= 5 && x < 5 + thick && y >= 60 && y <= 70 ? id : 0);
  const open = voiceOcclusion(() => 0, 0.5, 64.6, 0.5, 10.5, 64.6, 0.5);
  assert.deepEqual(open, { gain: 1, cutoff: 20000 });
  const stone = voiceOcclusion(wall(STONE), 0.5, 64.6, 0.5, 10.5, 64.6, 0.5);
  const stone3 = voiceOcclusion(wall(STONE, 3), 0.5, 64.6, 0.5, 10.5, 64.6, 0.5);
  const glass = voiceOcclusion(wall(GLASS), 0.5, 64.6, 0.5, 10.5, 64.6, 0.5);
  const leaves = voiceOcclusion(wall(OAK_LEAVES), 0.5, 64.6, 0.5, 10.5, 64.6, 0.5);
  const wool = voiceOcclusion(wall(WHITE_WOOL), 0.5, 64.6, 0.5, 10.5, 64.6, 0.5);
  assert.ok(stone.gain < 0.4 && stone.cutoff < 5000, JSON.stringify(stone));
  assert.ok(stone3.gain < stone.gain && stone3.cutoff < stone.cutoff);
  assert.ok(wool.gain < stone.gain, 'la lana aísla más que la piedra');
  assert.ok(leaves.gain > glass.gain && glass.gain > stone.gain, 'hojas < cristal < piedra en lo que tapan');
  // Un muro bajo (hasta y 64): se oye por encima, aunque algo menos que sin nada.
  const low = voiceOcclusion((x: number, y: number) => (x === 5 && y <= 64 ? STONE : 0), 0.5, 64.6, 0.5, 10.5, 64.6, 0.5);
  assert.ok(low.gain > 0.6 && low.gain < 1, JSON.stringify(low));
  // Eco: al aire libre casi nada; en una sala de 5 × 4 × 5 bastante; en una cueva grande más.
  const box = (r: number, h: number) => (x: number, y: number, z: number) => (Math.abs(x) > r || Math.abs(z) > r || y < 60 || y > 60 + h ? STONE : 0);
  const outside = voiceReverb((_x: number, y: number) => (y < 60 ? STONE : 0), 0.5, 61.6, 0.5);
  const room = voiceReverb(box(2, 4), 0.5, 61.6, 0.5);
  const cave = voiceReverb(box(14, 12), 0.5, 61.6, 0.5);
  assert.ok(outside < 0.1, `fuera ${outside}`);
  assert.ok(room > 0.3, `sala ${room}`);
  assert.ok(cave > room, `cueva ${cave} > sala ${room}`);
});
