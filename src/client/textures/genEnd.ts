// Fase 8.6 (el End): texturas dibujadas aquí (nada copiado del juego):
// - piedra del End: amarillo pálido con picaduras y cráteres pequeños (y sus ladrillos);
// - púrpura: baldosas lilas con su bisel (bloque) y el pilar, acanalado de lado y con anillos arriba;
// - vara del End: blanca y encendida, con la base más apagada;
// - coro: el tallo violeta con motas claras, la flor (pétalos lilas plegados) y la flor muerta, gris y seca.
import { clamp, mix, scale, idx, N, Noise, pixelNoise, type Generator, type RGB, type Tex } from './texCore';

const END: readonly RGB[] = [[240, 244, 184], [226, 230, 168], [210, 214, 152], [188, 190, 132], [160, 160, 110]];

/** Piedra del End: base pálida con picaduras oscuras y alguna mota clara. */
function endStoneBase(t: Tex, pits = true): Float32Array {
  const r = t.rng();
  const n = new Noise(r, 4);
  const px = pixelNoise(r);
  for (let i = 0; i < N; i++) {
    const x = i & 15, y = i >> 4;
    const v = n.at(x, y) * 0.6 + px[i] * 0.4;
    const k = clamp(Math.floor(v * 3.2), 0, 3);
    t.setI(i, END[k]);
    t.height[i] = 0.8 + v * 0.2;
    t.smooth[i] = 45 + px[i] * 20;
  }
  if (pits) {
    // Cráteres: un píxel hondo con su borde algo más oscuro abajo a la derecha.
    for (let k = 0; k < 9; k++) {
      const x = r.int(0, 15), y = r.int(0, 15);
      t.setI(idx(x, y), END[4]);
      t.height[idx(x, y)] = 0.35;
      if (x < 15) t.setI(idx(x + 1, y), mix(t.get(x + 1, y), END[3], 0.6));
      if (y < 15) t.setI(idx(x, y + 1), mix(t.get(x, y + 1), END[3], 0.5));
      if (x > 0 && y > 0) t.setI(idx(x - 1, y - 1), mix(t.get(x - 1, y - 1), END[0], 0.6));
    }
  }
  t.depth = 1.3;
  return px;
}

function endStoneBricks(t: Tex): void {
  endStoneBase(t, false);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const off = (y >> 3) & 1 ? 4 : 0;
      const joint = y % 8 === 7 || (x + off) % 8 === 7;
      const lit = y % 8 === 0 || (x + off) % 8 === 0;
      const i = idx(x, y);
      if (joint) {
        t.setI(i, END[4]);
        t.height[i] = 0.55;
        t.smooth[i] = 30;
      } else if (lit) t.setI(i, mix(t.getI(i), END[0], 0.5));
    }
  }
}

// ------------------------------------------------------------------ púrpura

const PUR: readonly RGB[] = [[204, 164, 204], [180, 136, 180], [164, 118, 164], [140, 96, 140], [104, 66, 106]];

function purpurBase(t: Tex): Float32Array {
  const px = pixelNoise(t.rng());
  for (let i = 0; i < N; i++) {
    t.setI(i, mix(PUR[2], PUR[1], px[i]));
    t.height[i] = 0.9 + px[i] * 0.1;
    t.smooth[i] = 90 + px[i] * 30;
  }
  return px;
}

/** Bloque de púrpura: cuatro baldosas biseladas. */
function purpurBlock(t: Tex): void {
  purpurBase(t);
  for (let i = 0; i < N; i++) {
    const x = i & 15, y = i >> 4;
    const lx = x & 7, ly = y & 7;
    if (lx === 7 || ly === 7) {
      t.setI(i, PUR[4]);
      t.height[i] = 0.6;
    } else if (lx === 0 || ly === 0) t.setI(i, PUR[0]);
    else if (lx === 6 || ly === 6) t.setI(i, PUR[3]);
  }
  t.depth = 1.2;
}

function purpurPillarSide(t: Tex): void {
  purpurBase(t);
  for (let y = 0; y < 16; y++) {
    for (const x of [0, 15]) t.setI(idx(x, y), PUR[4]);
    for (const x of [1, 8]) t.setI(idx(x, y), PUR[0]);
    for (const x of [7, 14]) t.setI(idx(x, y), PUR[3]);
  }
  t.depth = 1.2;
}

function purpurPillarTop(t: Tex): void {
  purpurBase(t);
  for (let i = 0; i < N; i++) {
    const x = i & 15, y = i >> 4;
    const ring = Math.min(x, y, 15 - x, 15 - y);
    if (ring === 0) t.setI(i, PUR[4]);
    else if (ring === 1 || ring === 5) t.setI(i, PUR[0]);
    else if (ring === 4) t.setI(i, PUR[3]);
    else if (ring >= 6) t.setI(i, PUR[2]);
  }
  t.depth = 1.2;
}

// ------------------------------------------------------------------ vara del End

function endRod(t: Tex): void {
  const px = pixelNoise(t.rng());
  for (let i = 0; i < N; i++) {
    const y = i >> 4;
    // Arriba el asta encendida; la fila de abajo, la base (su cara, más apagada).
    const base = y >= 14;
    t.setI(i, base ? mix([168, 150, 176], [196, 180, 204], px[i]) : mix([250, 248, 255], [236, 230, 250], px[i]));
    t.emit[i] = base ? 60 : 245;
    t.smooth[i] = 160;
    t.height[i] = 1;
  }
}

// ------------------------------------------------------------------ coro

function chorusPlant(t: Tex): void {
  const r = t.rng();
  const n = new Noise(r, 4);
  const px = pixelNoise(r);
  for (let i = 0; i < N; i++) {
    const x = i & 15, y = i >> 4;
    const v = n.at(x, y) * 0.6 + px[i] * 0.4;
    t.setI(i, mix([74, 44, 76], [118, 80, 120], v));
    t.height[i] = 0.7 + v * 0.3;
    t.smooth[i] = 60;
    t.sss[i] = 40;
  }
  for (let k = 0; k < 12; k++) {
    const x = r.int(0, 15), y = r.int(0, 15);
    t.setI(idx(x, y), [168, 134, 170]);
    t.height[idx(x, y)] = 1;
  }
  t.depth = 1.1;
}

function chorusFlower(dead: boolean): Generator {
  return (t) => {
    const r = t.rng();
    const px = pixelNoise(r);
    const light: RGB = dead ? [128, 112, 124] : [222, 190, 226], dark: RGB = dead ? [72, 58, 70] : [140, 96, 150];
    for (let i = 0; i < N; i++) {
      const x = i & 15, y = i >> 4;
      // Pétalos plegados: rombos concéntricos desde el centro.
      const d = Math.abs(x - 7.5) + Math.abs(y - 7.5);
      const fold = (Math.floor(d / 2.5) & 1) === 0;
      const c = mix(fold ? light : scale(light, 0.86), dark, clamp(d / 18, 0, 1) * 0.6 + px[i] * 0.15);
      t.setI(i, c);
      t.height[i] = fold ? 1 : 0.8;
      t.smooth[i] = dead ? 30 : 80;
      t.sss[i] = dead ? 10 : 70;
    }
    if (!dead) t.setI(idx(7, 7), [250, 236, 250]);
    t.depth = 1.2;
  };
}

// ------------------------------------------------------------------ portal del End

const FRAME: readonly RGB[] = [[88, 130, 110], [70, 108, 92], [54, 86, 74], [40, 64, 56], [24, 40, 36]];

/** Piedra del marco: verde grisácea y lisa, con motas; `inlay` la baldosa de arriba con su marco claro. */
function frameStone(t: Tex): Float32Array {
  const r = t.rng();
  const n = new Noise(r, 4);
  const px = pixelNoise(r);
  for (let i = 0; i < N; i++) {
    const x = i & 15, y = i >> 4;
    const v = n.at(x, y) * 0.55 + px[i] * 0.45;
    t.setI(i, mix(FRAME[2], FRAME[1], v));
    t.height[i] = 0.85 + v * 0.15;
    t.smooth[i] = 110 + px[i] * 40;
  }
  return px;
}

/** Arriba: la baldosa con su bisel, un anillo de runas turquesas y el hueco del ojo en el centro. */
function endPortalFrameTop(t: Tex): void {
  frameStone(t);
  for (let i = 0; i < N; i++) {
    const x = i & 15, y = i >> 4;
    const edge = Math.min(x, y, 15 - x, 15 - y);
    if (edge === 0) {
      t.setI(i, FRAME[4]);
      t.height[i] = 0.5;
    } else if (edge === 1) t.setI(i, mix(t.getI(i), FRAME[0], 0.6));
    const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
    // El hueco del ojo (4..11): hondo y oscuro.
    if (d < 4) {
      t.setI(i, mix(FRAME[4], [16, 30, 30], 0.5));
      t.height[i] = 0.3;
      t.smooth[i] = 60;
    } else if (d < 5) t.setI(i, FRAME[3]);
    // Runas: marcas sueltas en el anillo entre el hueco y el bisel, algo encendidas.
    if (d >= 5.5 && edge >= 2 && ((x * 7 + y * 13) % 5 === 0 || (x * 3 + y * 11) % 7 === 0)) {
      t.setI(i, [96, 214, 186]);
      t.emit[i] = 70;
      t.height[i] = 0.7;
    }
  }
  t.depth = 1.4;
}

/** De lado: la piedra con una franja de piedra del End abajo y los dientes de la losa arriba. */
function endPortalFrameSide(t: Tex): void {
  const px = frameStone(t);
  for (let i = 0; i < N; i++) {
    const x = i & 15, y = i >> 4;
    if (y < 3) {
      // La tapa: 3 píxeles (lo que se ve de la losa de 13/16) con bisel.
      t.setI(i, y === 0 ? FRAME[0] : y === 2 ? FRAME[3] : mix(FRAME[1], FRAME[0], px[i]));
      t.height[i] = y === 2 ? 0.6 : 1;
    } else if (y >= 12) {
      t.setI(i, mix(END[1], END[3], px[i]));
      t.height[i] = 0.8 + px[i] * 0.2;
      t.smooth[i] = 45;
    } else if (y === 11) {
      t.setI(i, FRAME[4]);
      t.height[i] = 0.5;
    } else if ((x === 3 || x === 12) && y >= 5 && y <= 9) {
      // Dos ranuras con un brillo turquesa al fondo.
      t.setI(i, y === 7 ? [80, 196, 170] : FRAME[4]);
      if (y === 7) t.emit[i] = 60;
      t.height[i] = 0.4;
    }
  }
  t.depth = 1.3;
}

/** El ojo de ender engastado: verde turquesa, con el iris oscuro y un brillo. */
function endPortalFrameEye(t: Tex): void {
  const px = pixelNoise(t.rng());
  for (let i = 0; i < N; i++) {
    const x = i & 15, y = i >> 4;
    const dx = (x - 7.5) / 7.5, dy = (y - 7.5) / 7.5;
    const r = Math.hypot(dx, dy);
    let c: RGB = mix([30, 88, 74], [16, 52, 46], r + px[i] * 0.2);
    if (Math.abs(dx) < 0.22 && Math.abs(dy) < 0.75) c = [6, 20, 18]; // la pupila rasgada
    else if (r < 0.55) c = mix([96, 190, 150], [40, 120, 96], r / 0.55);
    t.setI(i, c);
    t.emit[i] = r < 0.55 ? 45 : 10;
    t.smooth[i] = 200;
    t.height[i] = 1 - r * 0.3;
  }
  t.setI(idx(5, 4), [200, 240, 220]);
  t.setI(idx(6, 4), [150, 210, 190]);
  t.depth = 0.8;
}

/** El velo (para el objeto y de respaldo): casi negro, con motas; en el mundo lo pinta el shader (estrellas). */
function endPortal(t: Tex): void {
  const r = t.rng();
  for (let i = 0; i < N; i++) {
    t.setI(i, [6, 14, 18]);
    t.emit[i] = 20;
    t.height[i] = 1;
  }
  for (let k = 0; k < 14; k++) {
    const i = idx(r.int(0, 15), r.int(0, 15));
    const specks: readonly RGB[] = [[80, 200, 190], [120, 150, 220], [150, 230, 170]];
    t.setI(i, specks[k % 3]);
    t.emit[i] = 200;
  }
}

/** Huevo de dragón: negro violáceo con escamas y motas moradas que brillan un poco. */
function dragonEgg(t: Tex): void {
  const r = t.rng();
  const n = new Noise(r, 4);
  const px = pixelNoise(r);
  for (let i = 0; i < N; i++) {
    const x = i & 15, y = i >> 4;
    const v = n.at(x, y) * 0.6 + px[i] * 0.4;
    // Escamas: filas desplazadas con el borde de abajo más claro.
    const sy = y % 3, sx = (x + (Math.floor(y / 3) & 1) * 2) % 4;
    let c: RGB = mix([12, 6, 18], [30, 14, 42], v);
    if (sy === 2 && sx !== 0) c = mix(c, [58, 26, 78], 0.6);
    t.setI(i, c);
    t.height[i] = sy === 2 ? 1 : 0.75 + v * 0.2;
    t.smooth[i] = 150;
  }
  for (let k = 0; k < 10; k++) {
    const i = idx(r.int(0, 15), r.int(0, 15));
    t.setI(i, [150, 70, 200]);
    t.emit[i] = 90;
  }
  t.depth = 1.1;
}

export const END_GENERATORS: Record<string, Generator> = {
  dragon_egg: dragonEgg,
  end_portal_frame_top: endPortalFrameTop,
  end_portal_frame_side: endPortalFrameSide,
  end_portal_frame_eye: endPortalFrameEye,
  end_portal: endPortal,
  end_stone: (t) => void endStoneBase(t),
  end_stone_bricks: endStoneBricks,
  purpur_block: purpurBlock,
  purpur_pillar: purpurPillarSide,
  purpur_pillar_top: purpurPillarTop,
  end_rod: endRod,
  chorus_plant: chorusPlant,
  chorus_flower: chorusFlower(false),
  chorus_flower_dead: chorusFlower(true),
};
