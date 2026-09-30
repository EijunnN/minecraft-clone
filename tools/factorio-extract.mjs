// Programa lunar: saca de los datos de Factorio (data/base/prototypes/*.lua) las recetas, las tecnologías y los objetos (pila y combustible)
// como JSON en src/shared/factorio/. Sólo números y nombres de prototipo (ingredientes, tiempos, costes de investigación): nada de gráficos.
// Uso: node tools/factorio-extract.mjs [ruta de Factorio, por defecto C:\Games\Factorio]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const root = process.argv[2] ?? 'C:\\Games\\Factorio';
const proto = join(root, 'data', 'base', 'prototypes');
const OUT = join(process.cwd(), 'src', 'shared', 'factorio');

/** Un lector mínimo de constructores de tabla de Lua (lo que usan los prototipos). */
class Lua {
  constructor(src) {
    this.s = src;
    this.i = 0;
    this.vars = new Map();
  }
  ws() {
    for (;;) {
      const c = this.s[this.i];
      if (c === ' ' || c === '\t' || c === '\r' || c === '\n') this.i++;
      else if (this.s.startsWith('--[[', this.i)) {
        const e = this.s.indexOf(']]', this.i + 4);
        this.i = e < 0 ? this.s.length : e + 2;
      } else if (this.s.startsWith('--', this.i)) {
        const e = this.s.indexOf('\n', this.i);
        this.i = e < 0 ? this.s.length : e + 1;
      } else return;
    }
  }
  peek() {
    this.ws();
    return this.s[this.i];
  }
  expect(c) {
    this.ws();
    if (this.s[this.i] !== c) throw new Error(`se esperaba ${c} en ${this.i}: ${this.s.slice(this.i, this.i + 40)}`);
    this.i++;
  }
  value() {
    let v = this.term();
    for (;;) {
      this.ws();
      const two = this.s.slice(this.i, this.i + 2);
      if (two === '..') {
        this.i += 2;
        v = String(v) + String(this.term());
      } else if ('+-*/'.includes(this.s[this.i]) && !this.s.startsWith('--', this.i)) {
        const op = this.s[this.i++];
        const r = this.term();
        v = op === '+' ? v + r : op === '-' ? v - r : op === '*' ? v * r : v / r;
      } else return v;
    }
  }
  term() {
    this.ws();
    const c = this.s[this.i];
    if (c === '{') return this.table();
    if (c === '"' || c === "'") return this.string();
    if (c === '(') {
      this.i++;
      const v = this.value();
      this.expect(')');
      return v;
    }
    if (c === '-') {
      this.i++;
      return -this.term();
    }
    const m = /^(0x[0-9a-fA-F]+|\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+)/.exec(this.s.slice(this.i, this.i + 40));
    if (m) {
      this.i += m[0].length;
      return Number(m[0]);
    }
    const id = /^[A-Za-z_][A-Za-z0-9_.]*/.exec(this.s.slice(this.i, this.i + 80));
    if (!id) throw new Error(`término raro en ${this.i}: ${this.s.slice(this.i, this.i + 40)}`);
    this.i += id[0].length;
    const w = id[0];
    if (w === 'true') return true;
    if (w === 'false') return false;
    if (w === 'nil') return null;
    // Llamada a función (util.merge(…), etc.): se lee y se descarta.
    if (this.peek() === '(') {
      this.i++;
      let d = 1;
      while (d > 0 && this.i < this.s.length) {
        const ch = this.s[this.i++];
        if (ch === '(') d++;
        else if (ch === ')') d--;
      }
      return { __call: w };
    }
    return this.vars.has(w) ? this.vars.get(w) : { __ref: w };
  }
  string() {
    const q = this.s[this.i++];
    let out = '';
    while (this.s[this.i] !== q) {
      if (this.s[this.i] === '\\') this.i++;
      out += this.s[this.i++];
    }
    this.i++;
    return out;
  }
  table() {
    this.expect('{');
    const arr = [];
    const obj = {};
    let named = false;
    for (;;) {
      if (this.peek() === '}') {
        this.i++;
        break;
      }
      // clave = valor  |  [expr] = valor  |  valor
      const save = this.i;
      const m = /^([A-Za-z_][A-Za-z0-9_]*)\s*=(?!=)/.exec(this.s.slice(this.i, this.i + 100));
      if (m) {
        this.i += m[0].length;
        obj[m[1]] = this.value();
        named = true;
      } else if (this.peek() === '[') {
        this.i++;
        const k = this.value();
        this.expect(']');
        this.expect('=');
        obj[k] = this.value();
        named = true;
      } else {
        this.i = save;
        arr.push(this.value());
      }
      const c = this.peek();
      if (c === ',' || c === ';') this.i++;
    }
    return named ? Object.assign(obj, arr.length ? { __list: arr } : {}) : arr;
  }
  /** Lee el archivo entero: variables locales y las tablas de cada data:extend. */
  extend() {
    const protos = [];
    const s = this.s;
    let pos = 0;
    // variables locales de primer nivel: local nombre = "cadena" | número
    for (const m of s.matchAll(/^local\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*("[^"\n]*"|\d+(?:\.\d+)?)\s*$/gm)) {
      this.vars.set(m[1], m[2].startsWith('"') ? m[2].slice(1, -1) : Number(m[2]));
    }
    for (;;) {
      const k = s.indexOf('data:extend', pos);
      if (k < 0) break;
      this.i = k + 'data:extend'.length;
      this.ws();
      let paren = false;
      if (this.s[this.i] === '(') {
        paren = true;
        this.i++;
      }
      try {
        const t = this.value();
        if (Array.isArray(t)) protos.push(...t);
        pos = this.i;
      } catch (e) {
        console.error('aviso:', e.message.slice(0, 120));
        pos = k + 12;
      }
      void paren;
    }
    return protos;
  }
}

const load = (f) => new Lua(readFileSync(join(proto, f), 'utf8')).extend();

const num = (v, d) => (typeof v === 'number' ? v : d);

// ------------------------------------------------------------------ recetas
const recipes = [];
for (const r of load('recipe.lua')) {
  if (!r || r.type !== 'recipe' || r.parameter) continue;
  const ing = (r.ingredients ?? []).map((x) => (Array.isArray(x) ? [x[0], x[1], 'item', 0] : [x.name, x.amount, x.type ?? 'item', x.fluidbox_index ?? 0]));
  let res = r.results ?? (r.result ? [{ type: 'item', name: r.result, amount: r.result_count ?? 1 }] : []);
  res = res.map((x) => [x.name, x.amount ?? ((num(x.amount_min, 0) + num(x.amount_max, 0)) / 2), x.type ?? 'item', x.probability ?? 1, x.fluidbox_index ?? 0]);
  recipes.push({
    name: r.name, category: r.category ?? 'crafting', time: num(r.energy_required, 0.5), enabled: r.enabled !== false,
    ingredients: ing, results: res, ...(r.main_product ? { main: r.main_product } : {}),
  });
}

// ------------------------------------------------------------------ tecnologías
const techs = [];
for (const t of load('technology.lua')) {
  if (!t || t.type !== 'technology') continue;
  const u = t.unit;
  techs.push({
    name: t.name,
    prerequisites: t.prerequisites ?? [],
    unlocks: (t.effects ?? []).filter((e) => e.type === 'unlock-recipe').map((e) => e.recipe),
    effects: (t.effects ?? []).filter((e) => e.type !== 'unlock-recipe').map((e) => ({ ...e })),
    ...(u
      ? {
          unit: {
            count: typeof u.count === 'number' ? u.count : null, formula: u.count_formula ?? null, time: u.time,
            ingredients: (u.ingredients ?? []).map((x) => [x[0] ?? x.name, x[1] ?? x.amount]),
          },
        }
      : {}),
    ...(t.research_trigger ? { trigger: t.research_trigger } : {}),
    ...(t.max_level !== undefined ? { maxLevel: t.max_level } : {}),
  });
}

// ------------------------------------------------------------------ objetos (pila y combustible)
const items = [];
for (const it of [...load('item.lua'), ...load('fluid.lua')]) {
  if (!it || !it.name || !it.type) continue;
  if (it.type === 'fluid') items.push({ name: it.name, fluid: true, ...(it.fuel_value ? { fuel: it.fuel_value } : {}) });
  else if (typeof it.stack_size === 'number') items.push({ name: it.name, stack: it.stack_size, ...(typeof it.fuel_value === 'string' ? { fuel: it.fuel_value } : {}) });
}

// ------------------------------------------------------------------ nombres (español de España)
const cfg = readFileSync(join(root, 'data', 'base', 'locale', 'es-ES', 'base.cfg'), 'utf8');
const names = { item: {}, entity: {}, recipe: {}, technology: {}, fluid: {} };
{
  let sect = '';
  for (const raw of cfg.split('\n')) {
    const line = raw.trim();
    const h = /^\[([a-z-]+)\]$/.exec(line);
    if (h) {
      sect = h[1];
      continue;
    }
    const m = /^([^=;#]+)=(.*)$/.exec(line);
    if (!m) continue;
    const kind = { 'item-name': 'item', 'entity-name': 'entity', 'recipe-name': 'recipe', 'technology-name': 'technology', 'fluid-name': 'fluid' }[sect];
    if (kind) names[kind][m[1]] = m[2];
  }
}

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'names-es.json'), JSON.stringify(names));
writeFileSync(join(OUT, 'recipes.json'), JSON.stringify(recipes));
writeFileSync(join(OUT, 'technologies.json'), JSON.stringify(techs));
writeFileSync(join(OUT, 'items.json'), JSON.stringify(items));
console.log(`${Object.keys(names.item).length} nombres de objeto; ${recipes.length} recetas, ${techs.length} tecnologías, ${items.length} objetos`);
