// Límites del motor que el contenido no debe pasar: capas de textura (14 bits en el vértice de los chunks, 2 048 en la tarjeta) e ids de bloque (tablas de MAX_BLOCK_ID y 16 bits en el guardado).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TEXTURE_DEFS } from '../src/shared/textureDefs';
import { BLOCK_COUNT, BLOCK_TEX } from '../src/shared/blocks';
import { MAX_BLOCK_ID, MAX_TEXTURE_LAYERS } from '../src/shared/constants';

test('texturas: caben en las capas que admiten el vértice (14 bits) y la tarjeta (2 048)', () => {
  assert.ok(TEXTURE_DEFS.length <= MAX_TEXTURE_LAYERS, `${TEXTURE_DEFS.length} texturas`);
  let max = 0;
  for (let i = 0; i < BLOCK_TEX.length; i++) max = Math.max(max, BLOCK_TEX[i]);
  assert.ok(max < MAX_TEXTURE_LAYERS, `capa más alta ${max}`);
});

test('bloques: los ids caben en las tablas y en 16 bits', () => {
  assert.ok(BLOCK_COUNT <= MAX_BLOCK_ID, `${BLOCK_COUNT} ids de ${MAX_BLOCK_ID}`);
  assert.ok(MAX_BLOCK_ID <= 65536);
});
