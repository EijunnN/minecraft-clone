// Iconos isométricos de bloques (Canvas 2D) a partir de las texturas generadas.
import { BLOCKS, BLOCK_TEX, R_CROSS, R_TORCH, R_NONE } from '../../shared/blocks';
import { TEXTURE_DEFS } from '../../shared/textureDefs';
import type { GeneratedTextures } from '../textures/generateTextures';

const GRASS_TINT = [145, 189, 89];
const FOLIAGE_TINT = [113, 167, 55];

function layerCanvas(tex: GeneratedTextures, layer: number): HTMLCanvasElement {
  const size = tex.size;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d')!;
  const img = g.createImageData(size, size);
  const def = TEXTURE_DEFS[layer];
  const off = layer * size * size * 4;
  for (let i = 0; i < size * size; i++) {
    let r = tex.albedo[off + i * 4];
    let gg = tex.albedo[off + i * 4 + 1];
    let b = tex.albedo[off + i * 4 + 2];
    let a = tex.albedo[off + i * 4 + 3];
    const tint = def.tint === 1 || (def.tint === 2 && a > 127) ? GRASS_TINT : def.tint === 3 ? FOLIAGE_TINT : null;
    if (tint) {
      r = (r * tint[0]) / 255;
      gg = (gg * tint[1]) / 255;
      b = (b * tint[2]) / 255;
    }
    if (!def.cutout && def.special !== 1 && def.special !== 3) a = 255;
    if (def.special === 1) a = Math.max(a, 200);
    img.data[i * 4] = r;
    img.data[i * 4 + 1] = gg;
    img.data[i * 4 + 2] = b;
    img.data[i * 4 + 3] = a;
  }
  g.putImageData(img, 0, 0);
  return c;
}

/** Genera un mapa id → dataURL con los iconos de todos los bloques. */
export function buildIcons(tex: GeneratedTextures): Map<number, string> {
  const layers = new Map<number, HTMLCanvasElement>();
  const L = (i: number) => {
    let c = layers.get(i);
    if (!c) {
      c = layerCanvas(tex, i);
      layers.set(i, c);
    }
    return c;
  };
  const out = new Map<number, string>();
  const S = 64;
  for (const b of BLOCKS) {
    if (!b || b.render === R_NONE) continue;
    const cv = document.createElement('canvas');
    cv.width = S;
    cv.height = S;
    const g = cv.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    if (b.render === R_CROSS || b.render === R_TORCH) {
      g.drawImage(L(BLOCK_TEX[b.id * 6]), 8, 8, 48, 48);
    } else {
      const top = L(BLOCK_TEX[b.id * 6 + 2]);
      const left = L(BLOCK_TEX[b.id * 6 + 4]);
      const right = L(BLOCK_TEX[b.id * 6 + 0]);
      const k = 26 / 16; // tamaño del texel en el icono
      const face = (img: HTMLCanvasElement, a: number, bb: number, c: number, d: number, e: number, f: number, dark: number) => {
        g.save();
        g.setTransform(a, bb, c, d, e, f);
        g.drawImage(img, 0, 0);
        if (dark > 0) {
          g.globalCompositeOperation = 'source-atop';
          g.fillStyle = `rgba(0,0,0,${dark})`;
          g.fillRect(0, 0, 16, 16);
        }
        g.restore();
      };
      // Cara superior (rombo), izquierda y derecha.
      face(top, k, -k / 2, k, k / 2, 6, 18.5, 0);
      face(left, k, k / 2, 0, k, 6, 18.5, 0.22);
      face(right, k, -k / 2, 0, k, 32, 31.5, 0.4);
    }
    out.set(b.id, cv.toDataURL());
  }
  return out;
}
