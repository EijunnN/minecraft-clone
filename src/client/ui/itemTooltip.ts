// Descripción de un objeto al pasar el ratón: nombre y, según lo que sea, daño y velocidad de ataque,
// armadura, lo que alimenta y sus efectos, qué bloquea el escudo y la durabilidad que le queda.
import { isBundle, bagWeight, BUNDLE_CAPACITY } from '../../shared/bundles'; // Fase 6.5 (remate)
import { FILLED_MAP } from '../../shared/items';
import { mapOrigin, MAP_SIZE } from '../../shared/maps';
import './itemTooltip.css';
import { ITEMS, itemName, type ItemStack } from '../../shared/items';
import { EFFECTS, effectLevel } from '../../shared/effects';
import { attackDamage, attackSpeed } from '../../shared/combat';
import { SUSPICIOUS_STEW, SPYGLASS, CLOCK } from '../../shared/items'; // Fase 6.5 (decoración)
import { stewEffectText } from '../../shared/decorFood'; // Fase 6.5 (decoración)
// Fase 6.5 (libros y estandartes).
import { WRITABLE_BOOK, WRITTEN_BOOK } from '../../shared/items';
import { BOOK_GENERATIONS } from '../../shared/books';
import { bannerLayers, layerName, isBannerPatternItem } from '../../shared/bannerPatterns';
import { discTitle } from '../../shared/collections'; // Fase 6.5 (colecciones)
import { skullKind } from '../../shared/blocks'; // Fase 6.5 (colecciones)

const WEAPONS = new Set(['sword', 'axe', 'pickaxe', 'shovel', 'hoe']);

const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
const num = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1).replace('.', ','));
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

/** HTML de la descripción de una pila (para un elemento con la clase `tooltip`). */
export function itemTooltipHtml(s: ItemStack): string {
  const def = ITEMS[s.id];
  const lines: string[] = [`<b>${esc(itemName(s.id))}</b>`];
  const tool = def?.tool;
  if (tool && WEAPONS.has(tool.kind)) {
    lines.push('<span class="tt-gap"></span>', '<span class="tt-dim">En la mano principal:</span>',
      `<span class="tt-good">Daño por golpe: ${num(attackDamage(s.id))}</span>`,
      `<span class="tt-good">Velocidad de ataque: ${num(attackSpeed(s.id))}</span>`);
  } else if (tool?.kind === 'shield') {
    lines.push('<span class="tt-dim">Clic derecho mantenido: bloquea lo que llega de frente</span>');
  } else if (tool?.kind === 'bow') {
    lines.push('<span class="tt-dim">Mantén el clic derecho para tensarlo (usa flechas)</span>');
  }
  const armor = skullKind(s.id) ? undefined : def?.armor; // Fase 6.5 (colecciones): las cabezas no protegen
  if (armor) {
    lines.push('<span class="tt-gap"></span>', '<span class="tt-dim">En el cuerpo:</span>', `<span class="tt-armor">+${armor.points} de armadura</span>`);
    if (armor.toughness > 0) lines.push(`<span class="tt-armor">+${num(armor.toughness)} de dureza</span>`);
  }
  const food = def?.food;
  if (food) {
    lines.push(`<span class="tt-dim">Alimenta: ${num(food.hunger / 2)} 🍗 · saturación ${num(food.saturation)}</span>`);
    for (const [id, secs, amp, chance] of food.effects ?? []) {
      const e = EFFECTS[id];
      if (!e) continue;
      const lvl = amp > 0 ? ` ${effectLevel(amp)}` : '';
      const p = chance < 1 ? ` · ${Math.round(chance * 100)} %` : '';
      lines.push(`<span class="${e.good ? 'tt-good' : 'tt-bad'}">${e.name}${lvl} (${clock(secs)})${p}</span>`);
    }
  }
  if (def?.drink) lines.push('<span class="tt-dim">Quita todos los efectos</span>');
  // Fase 6.5 (decoración): efecto del estofado sospechoso y uso del catalejo y del reloj.
  if (s.id === SUSPICIOUS_STEW && s.dmg) lines.push(`<span class="tt-good">${esc(stewEffectText(s.dmg))}</span>`);
  if (s.id === SPYGLASS) lines.push('<span class="tt-dim">Mantén el clic derecho para mirar de lejos</span>');
  if (s.id === CLOCK) lines.push('<span class="tt-dim">En la mano muestra la hora</span>');
  if (s.id === FILLED_MAP && s.dmg) {
    const [x0, z0] = mapOrigin(s.dmg);
    lines.push(`<span class="tt-dim">Zona: x ${x0} a ${x0 + MAP_SIZE - 1}, z ${z0} a ${z0 + MAP_SIZE - 1}</span>`);
  }
  // Fase 6.5 (colecciones): título del disco y para qué sirve llevar una cabeza.
  const title = discTitle(s.id);
  if (title) lines.push(`<span class="tt-dim">${esc(title)}</span>`);
  const skull = skullKind(s.id);
  if (skull && skull !== 'player') {
    const who = { zombie: 'los zombis', skeleton: 'los esqueletos', creeper: 'los creepers' }[skull];
    lines.push(`<span class="tt-dim">Puesta: ${who} te ven a la mitad de distancia</span>`);
  }
  // Fase 6.5 (remate): lo que lleva el saco.
  if (isBundle(s.id)) {
    for (const b of (s.bag ?? []).slice(0, 6)) lines.push(`<span class="tt-dim">${esc(ITEMS[b.id]?.name ?? '?')} ×${b.count}</span>`);
    if ((s.bag?.length ?? 0) > 6) lines.push(`<span class="tt-dim">y ${s.bag!.length - 6} más…</span>`);
    lines.push(`<span class="tt-dim">${bagWeight(s.bag)} / ${BUNDLE_CAPACITY} · clic derecho: meter o sacar</span>`);
  }
  // Fase 6.5 (libros y estandartes): título, autor y generación del libro; capas del estandarte.
  if (s.id === WRITTEN_BOOK && s.data) {
    lines.push(`<span class="tt-good">${esc(s.data.title ?? '')}</span>`, `<span class="tt-dim">de ${esc(s.data.author ?? '?')}</span>`,
      `<span class="tt-dim">${BOOK_GENERATIONS[s.data.gen ?? 0] ?? ''} · clic derecho: leer</span>`);
  }
  if (s.id === WRITABLE_BOOK) {
    const n = s.data?.pages?.length ?? 0;
    lines.push(`<span class="tt-dim">${n ? `${n} página${n === 1 ? '' : 's'} escrita${n === 1 ? '' : 's'}` : 'En blanco'} · clic derecho: escribir</span>`);
  }
  for (const l of bannerLayers(s)) lines.push(`<span class="tt-dim">${esc(layerName(l))}</span>`);
  if (isBannerPatternItem(s.id)) lines.push('<span class="tt-dim">Para el telar (no se gasta)</span>');
  const max = tool?.durability ?? armor?.durability;
  if (max) lines.push(`<span class="tt-dim">Durabilidad: ${max - (s.dmg ?? 0)} / ${max}</span>`);
  return lines.join('');
}
