// Fase 6.5 (libros y estandartes): datos propios de una pila. El libro y pluma lleva sus páginas; el
// libro escrito, además, título, autor y generación; el estandarte, sus capas de dibujos. Viajan con la
// pila (5.º campo de WireStack), se guardan con ella (inventario, cofres, objetos en el suelo) y se
// validan y acotan cada vez que llegan de la red o del almacenamiento.
import { WRITABLE_BOOK, WRITTEN_BOOK } from './items';
import { BANNER_PATTERNS, MAX_BANNER_LAYERS, isBannerItem, type BannerLayer } from './bannerPatterns';

export interface ItemData {
  /** Libros: el texto de cada página. */
  pages?: string[];
  /** Libro escrito: título, autor y generación (0 original, 1 copia, 2 copia de una copia). */
  title?: string;
  author?: string;
  gen?: number;
  /** Estandartes: capas [dibujo, color] de abajo arriba. */
  layers?: BannerLayer[];
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

/** Datos válidos para el objeto `id` (undefined si no lleva o no valen). */
export function sanitizeItemData(id: number, raw: unknown): ItemData | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const r = raw as Record<string, unknown>;
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
  return c;
}
