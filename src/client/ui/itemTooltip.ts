// Descripción de un objeto al pasar el ratón: nombre y, según lo que sea, daño y velocidad de ataque,
// armadura, lo que alimenta y sus efectos, qué bloquea el escudo y la durabilidad que le queda.
import { FILLED_MAP } from '../../shared/items';
import { mapOrigin, MAP_SIZE } from '../../shared/maps';
import './itemTooltip.css';
import { ITEMS, itemName, type ItemStack } from '../../shared/items';
import { EFFECTS, effectLevel } from '../../shared/effects';
import { attackDamage, attackSpeed } from '../../shared/combat';

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
  const armor = def?.armor;
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
  if (s.id === FILLED_MAP && s.dmg) {
    const [x0, z0] = mapOrigin(s.dmg);
    lines.push(`<span class="tt-dim">Zona: x ${x0} a ${x0 + MAP_SIZE - 1}, z ${z0} a ${z0 + MAP_SIZE - 1}</span>`);
  }
  const max = tool?.durability ?? armor?.durability;
  if (max) lines.push(`<span class="tt-dim">Durabilidad: ${max - (s.dmg ?? 0)} / ${max}</span>`);
  return lines.join('');
}
