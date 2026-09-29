// Programa lunar: los datos de Factorio (recetas, tecnologías, objetos) puestos sobre el juego: cifras exactas de los prototipos de
// Factorio 2.0.72 (tools/factorio-extract.mjs), objetos nuevos con sprite y recetas disponibles.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import techJson from '../src/shared/factorio/technologies.json';
import { FACTORIO_NEW, ITEMS, ITEM_COUNT, IRON_INGOT, COPPER_INGOT, RAW_IRON, COAL } from '../src/shared/items';
import { FACTORIO_ITEM_DEFS } from '../src/shared/factorio/itemDefs';
import { factorioRecipes, factorioRecipeByName, itemAlts, factorioNameOf } from '../src/shared/factorio/catalog';
import { ASSEMBLER_BLOCKS, FURNACE_BLOCKS, BELTS, INSERTERS } from '../src/shared/blocks';
import { generateItemSprites } from '../src/client/textures/itemSprites';

const need = (name: string) => factorioRecipeByName(name)!.needs.map((n) => [n.alts[0], n.n]);

test('factorio: los objetos nuevos tienen id, pila de Factorio y sprite', () => {
  assert.ok(ITEM_COUNT <= 1024);
  for (const d of FACTORIO_ITEM_DEFS) {
    const id = FACTORIO_NEW[d.name];
    assert.ok(id >= 256, d.name);
    assert.equal(ITEMS[id].stack, d.stack);
    assert.equal(factorioNameOf(id), d.name);
  }
  assert.equal(ITEMS[FACTORIO_NEW['electronic-circuit']].stack, 200);
  assert.equal(ITEMS[FACTORIO_NEW['iron-gear-wheel']].stack, 100);
  // Todos los sprites se dibujan (una tinta desconocida o una fila mal hecha lanza error).
  assert.ok(generateItemSprites().count > 0);
});

test('factorio: las recetas tienen los ingredientes, cantidades y tiempos del juego original', () => {
  const g = (n: string) => FACTORIO_NEW[n];
  const r = (n: string) => factorioRecipeByName(n)!;
  assert.deepEqual(need('iron-gear-wheel'), [[IRON_INGOT, 2]]);
  assert.equal(r('iron-gear-wheel').time, 0.5);
  assert.deepEqual(need('copper-cable'), [[COPPER_INGOT, 1]]);
  assert.equal(r('copper-cable').out.count, 2, 'un cable de cobre da 2');
  assert.deepEqual(need('electronic-circuit'), [[IRON_INGOT, 1], [g('copper-cable'), 3]]);
  assert.deepEqual(need('assembling-machine-1'), [[g('electronic-circuit'), 3], [g('iron-gear-wheel'), 5], [IRON_INGOT, 9]]);
  assert.deepEqual(need('assembling-machine-2'), [[g('steel-plate'), 2], [g('electronic-circuit'), 3], [g('iron-gear-wheel'), 5], [ASSEMBLER_BLOCKS[0], 1]]);
  assert.deepEqual(need('inserter'), [[g('electronic-circuit'), 1], [g('iron-gear-wheel'), 1], [IRON_INGOT, 1]]);
  assert.equal(r('transport-belt').out.count, 2);
  assert.deepEqual(need('transport-belt'), [[IRON_INGOT, 1], [g('iron-gear-wheel'), 1]]);
  assert.deepEqual(need('fast-transport-belt'), [[g('iron-gear-wheel'), 5], [BELTS[0], 1]]);
  assert.deepEqual(need('electric-mining-drill'), [[g('electronic-circuit'), 3], [g('iron-gear-wheel'), 5], [IRON_INGOT, 10]]);
  assert.equal(r('electric-mining-drill').time, 2);
  assert.equal(r('automation-science-pack').time, 5);
  assert.deepEqual(need('automation-science-pack'), [[COPPER_INGOT, 1], [g('iron-gear-wheel'), 1]]);
  assert.equal(r('logistic-science-pack').time, 6);
  assert.equal(r('solar-panel').time, 10);
  // La fundición.
  assert.deepEqual(need('iron-plate'), [[RAW_IRON, 1]]);
  assert.equal(r('iron-plate').time, 3.2);
  assert.deepEqual(need('steel-plate'), [[IRON_INGOT, 5]]);
  assert.equal(r('steel-plate').time, 16);
  assert.equal(r('stone-brick').time, 3.2);
  assert.deepEqual(need('stone-brick').map((x) => x[1]), [2]);
  assert.equal(r('inserter').out.id, INSERTERS[0]);
  assert.ok(FURNACE_BLOCKS.length === 2);
  assert.equal(itemAlts('coal')![0], COAL);
});

test('factorio: las recetas disponibles usan sólo objetos que existen; las de fluidos esperan a las tuberías', () => {
  const all = factorioRecipes();
  assert.ok(all.length >= 45);
  for (const rec of all) {
    assert.ok(ITEMS[rec.out.id], rec.name);
    for (const n of rec.needs) for (const a of n.alts) assert.ok(ITEMS[a], `${rec.name} necesita un objeto que no existe`);
    assert.ok(['crafting', 'advanced-crafting', 'smelting'].includes(rec.category));
  }
  assert.equal(factorioRecipeByName('sulfur'), undefined, 'la química aún no');
  assert.equal(factorioRecipeByName('plastic-bar'), undefined);
});

test('factorio: la investigación tiene los costes del original (automatización 10 paquetes rojos a 10 s)', () => {
  const t = (techJson as { name: string; unit?: { count: number; time: number; ingredients: [string, number][] } }[]).find((x) => x.name === 'automation')!;
  assert.deepEqual([t.unit!.count, t.unit!.time, t.unit!.ingredients], [10, 10, [['automation-science-pack', 1]]]);
  assert.equal(techJson.length, 192);
});

test('fabricación a mano: los intermedios se hacen solos y los sobrantes vuelven al inventario', async () => {
  const { planHandCraft, runStep, planSeconds } = await import('../src/shared/factorio/handCraft');
  const gear = FACTORIO_NEW['iron-gear-wheel'];
  const belt = factorioRecipeByName('transport-belt')!;
  const all = () => true;
  // Sin engranajes: 1 cinta = engranaje (2 placas, 0,5 s) + 1 placa; da 2 cintas (0,5 s).
  let plan = planHandCraft(belt, 1, new Map([[IRON_INGOT, 3]]), all)!;
  assert.deepEqual(plan.steps.map((s) => s.name), ['iron-gear-wheel', 'transport-belt']);
  assert.equal(plan.reserved.get(IRON_INGOT), 3);
  assert.equal(planSeconds(plan), 1);
  const pool = new Map(plan.reserved);
  for (const s of plan.steps) assert.ok(runStep(pool, s));
  assert.equal(pool.get(belt.out.id), 2);
  assert.equal(pool.get(IRON_INGOT), 0);
  // Con un engranaje ya hecho: sólo la cinta (usa el engranaje y una placa).
  plan = planHandCraft(belt, 1, new Map([[IRON_INGOT, 1], [gear, 1]]), all)!;
  assert.deepEqual(plan.steps.map((s) => s.name), ['transport-belt']);
  assert.equal(plan.reserved.get(gear), 1);
  // Faltan placas → no se puede.
  assert.equal(planHandCraft(belt, 1, new Map([[IRON_INGOT, 2]]), all), null);
  // Receta bloqueada → no se puede fabricar el intermedio.
  assert.equal(planHandCraft(belt, 1, new Map([[IRON_INGOT, 3]]), (n) => n !== 'iron-gear-wheel'), null);
  // Los circuitos: 3 cables (2 cables por 1 cobre) + 1 placa de hierro → 2 cobre y 1 hierro para 1 circuito (sobra 1 cable).
  const circuit = factorioRecipeByName('electronic-circuit')!;
  plan = planHandCraft(circuit, 1, new Map([[IRON_INGOT, 1], [COPPER_INGOT, 2]]), all)!;
  assert.deepEqual(plan.steps.map((s) => s.name), ['copper-cable', 'copper-cable', 'electronic-circuit']);
  const p2 = new Map(plan.reserved);
  for (const s of plan.steps) runStep(p2, s);
  assert.equal(p2.get(FACTORIO_NEW['copper-cable']), 1, 'sobra un cable');
});
