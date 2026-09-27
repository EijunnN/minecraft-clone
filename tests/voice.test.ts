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
