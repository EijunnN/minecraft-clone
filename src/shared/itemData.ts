// Fase 6.5 (libros y estandartes): datos propios de una pila. El libro y pluma lleva sus páginas; el
// libro escrito, además, título, autor y generación; el estandarte, sus capas de dibujos. Viajan con la
// pila (5.º campo de WireStack), se guardan con ella (inventario, cofres, objetos en el suelo) y se
// validan y acotan cada vez que llegan de la red o del almacenamiento.
import { WRITABLE_BOOK, WRITTEN_BOOK, CROSSBOW, CROSSBOW_CHARGED, itemName, type ItemStack } from './items';
import { BANNER_PATTERNS, MAX_BANNER_LAYERS, isBannerItem, type BannerLayer } from './bannerPatterns';
// Fase 7 (encantamientos): encantamientos, libros encantados, nombres del yunque y coste de trabajo previo.
import { ENCHANTED_BOOK } from './items';
import { sanitizeEnchList, isEnchantable } from './enchantments';
import { isPotionType } from './potions'; // Fase 7 (remate): la flecha con efecto de la ballesta
import { FILLED_MAP } from './items'; // Fase 7.5 (mansión)
import { sanitizeExplore, EXPLORER_KINDS, type ExplorerTarget } from './explorerMaps';

export interface ItemData {
  /** Libros: el texto de cada página. */
  pages?: string[];
  /** Libro escrito: título, autor y generación (0 original, 1 copia, 2 copia de una copia). */
  title?: string;
  author?: string;
  gen?: number;
  /** Estandartes: capas [dibujo, color] de abajo arriba. */
  layers?: BannerLayer[];
  // Fase 7 (encantamientos)
  /** Encantamientos aplicados: [id, nivel] (ver enchantments.ts). */
  ench?: [number, number][];
  /** Libro encantado: encantamientos guardados. */
  stored?: [number, number][];
  /** Nombre puesto en el yunque. */
  name?: string;
  /** Penalización por trabajo previo en el yunque (coste que se suma cada vez). */
  rc?: number;
  /** Fase 7 (remate): ballesta cargada con una flecha con efecto: el tipo de poción de la flecha. */
  ap?: number;
  /** Fase 7.5 (mansión): mapa de explorador: la estructura a la que apunta (ver explorerMaps.ts). */
  explore?: ExplorerTarget;
}

/** Páginas de un libro como mucho y caracteres por página. */
export const BOOK_MAX_PAGES = 50;
export const BOOK_PAGE_CHARS = 256;
/** Líneas que caben en una página (saltos de línea permitidos + 1). */
export const BOOK_PAGE_LINES = 14;
export const BOOK_TITLE_CHARS = 32;
const MAX_AUTHOR = 16;
/** Generaciones: original, copia del original, copia de una copia y hecho jirones. */
export const MAX_BOOK_GEN = 3;

/** Texto sin caracteres de control (salvo los saltos de línea si se permiten), acotado a `max`. */
function cleanText(raw: unknown, max: number, newlines: boolean): string {
  if (typeof raw !== 'string') return '';
  let s = raw.replace(/\r\n?/g, '\n').replace(newlines ? /[\u0000-\u0009\u000b-\u001f\u007f]/g : /[\u0000-\u001f\u007f]/g, '');
  if (newlines) s = s.split('\n').slice(0, BOOK_PAGE_LINES).join('\n');
  return [...s].slice(0, max).join('');
}

/** Páginas válidas (sin las vacías del final); null si no hay ninguna con texto. */
export function sanitizePages(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const pages = raw.slice(0, BOOK_MAX_PAGES).map((p) => cleanText(p, BOOK_PAGE_CHARS, true));
  while (pages.length && !pages[pages.length - 1].trim()) pages.pop();
  return pages.length ? pages : null;
}

export function sanitizeTitle(raw: unknown): string {
  return cleanText(raw, BOOK_TITLE_CHARS, false).trim();
}

/** Capas válidas de un estandarte (como mucho 6, dibujos y colores conocidos); null si no hay. */
export function sanitizeLayers(raw: unknown): BannerLayer[] | null {
  if (!Array.isArray(raw)) return null;
  const out: BannerLayer[] = [];
  for (const l of raw.slice(0, 64)) {
    if (out.length >= MAX_BANNER_LAYERS) break;
    if (!Array.isArray(l)) continue;
    const p = Number(l[0]), c = Number(l[1]);
    if (Number.isInteger(p) && p >= 0 && p < BANNER_PATTERNS.length && Number.isInteger(c) && c >= 0 && c < 16) out.push([p, c]);
  }
  return out.length ? out : null;
}

/** Fase 7 (encantamientos): largo máximo del nombre que se pone en el yunque (Minecraft: 50). */
export const ITEM_NAME_CHARS = 50;
/** Tope de la penalización por trabajo previo (Minecraft la guarda como un entero). */
const MAX_REPAIR_COST = 0x7fffffff;

/** Nombre de yunque válido ('' si no queda nada). */
export function sanitizeItemName(raw: unknown): string {
  return cleanText(raw, ITEM_NAME_CHARS, false).trim();
}

/** Datos válidos para el objeto `id` (undefined si no lleva o no valen). */
export function sanitizeItemData(id: number, raw: unknown): ItemData | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const r = raw as Record<string, unknown>;
  // Fase 7 (encantamientos): lo propio del objeto y, encima, lo que cualquier pila puede llevar.
  const out: ItemData = { ...(ownData(id, r) ?? {}) };
  const ench = isEnchantable(id) ? sanitizeEnchList(r.ench) : null;
  if (ench) out.ench = ench;
  const stored = id === ENCHANTED_BOOK ? sanitizeEnchList(r.stored) : null;
  if (stored) out.stored = stored;
  const name = sanitizeItemName(r.name);
  if (name) out.name = name;
  const rc = Number(r.rc);
  if (Number.isInteger(rc) && rc > 0) out.rc = Math.min(MAX_REPAIR_COST, rc);
  return Object.keys(out).length ? out : undefined;
}

/** Datos propios de cada objeto (páginas de los libros, capas de los estandartes, flecha de la ballesta). */
function ownData(id: number, r: Record<string, unknown>): ItemData | undefined {
  if (id === WRITABLE_BOOK) {
    const pages = sanitizePages(r.pages);
    return pages ? { pages } : undefined;
  }
  if (id === WRITTEN_BOOK) {
    const gen = Number(r.gen);
    return {
      pages: sanitizePages(r.pages) ?? [],
      title: sanitizeTitle(r.title) || 'Sin título',
      author: cleanText(r.author, MAX_AUTHOR, false).trim() || '?',
      gen: Number.isInteger(gen) ? Math.max(0, Math.min(MAX_BOOK_GEN, gen)) : 0,
    };
  }
  if (isBannerItem(id)) {
    const layers = sanitizeLayers(r.layers);
    return layers ? { layers } : undefined;
  }
  if (id === CROSSBOW_CHARGED) {
    const ap = Number(r.ap);
    return r.ap !== undefined && isPotionType(ap) ? { ap } : undefined;
  }
  if (id === FILLED_MAP) { // Fase 7.5 (mansión)
    const explore = sanitizeExplore(r.explore);
    return explore ? { explore } : undefined;
  }
  return undefined;
}

/** Copia independiente de los datos (las pilas copiadas no comparten listas). */
export function cloneItemData(d: ItemData): ItemData {
  const c: ItemData = {};
  if (d.pages) c.pages = d.pages.slice();
  if (d.title !== undefined) c.title = d.title;
  if (d.author !== undefined) c.author = d.author;
  if (d.gen !== undefined) c.gen = d.gen;
  if (d.layers) c.layers = d.layers.map((l): BannerLayer => [l[0], l[1]]);
  // Fase 7 (encantamientos)
  if (d.ench) c.ench = d.ench.map((e): [number, number] => [e[0], e[1]]);
  if (d.stored) c.stored = d.stored.map((e): [number, number] => [e[0], e[1]]);
  if (d.name !== undefined) c.name = d.name;
  if (d.rc !== undefined) c.rc = d.rc;
  if (d.ap !== undefined) c.ap = d.ap; // Fase 7 (remate)
  if (d.explore) c.explore = { ...d.explore }; // Fase 7.5 (mansión)
  return c;
}

/**
 * Fase 7 (encantamientos): nombre visible de una pila: el puesto en el yunque, el título de un libro
 * escrito o el del objeto.
 */
export function stackName(s: ItemStack): string {
  if (s.data?.name) return s.data.name;
  if (s.id === WRITTEN_BOOK && s.data?.title) return s.data.title;
  if (s.data?.explore && EXPLORER_KINDS[s.data.explore.k]) return EXPLORER_KINDS[s.data.explore.k].name; // Fase 7.5 (mansión)
  return itemName(s.id);
}

/**
 * Fase 7 (remate): la ballesta cargada con una flecha (`ap`: tipo de la flecha con efecto, −1 normal). La
 * flecha va en sus datos para que no se pierda al moverla de hueco ni al guardar; conserva el resto.
 */
export function loadCrossbow(s: ItemStack, ap: number): ItemStack {
  const data = s.data ? cloneItemData(s.data) : {};
  delete data.ap;
  if (ap >= 0) data.ap = ap;
  const out: ItemStack = { ...s, id: CROSSBOW_CHARGED, count: 1 };
  if (Object.keys(data).length) out.data = data;
  else delete out.data;
  return out;
}

/** Fase 7 (remate): la ballesta después de disparar: descargada y sin la flecha con efecto. */
export function unloadCrossbow(s: ItemStack): ItemStack {
  return { ...loadCrossbow(s, -1), id: CROSSBOW };
}
