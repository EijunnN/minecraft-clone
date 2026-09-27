// Fase 8.6 (el End): sprites de los objetos del End, dibujados aquí. Mismo formato que SPRITES en itemSprites.ts
// ('.' transparente; el contorno lo pone él).

type RGB = readonly [number, number, number];
interface Ink {
  c: RGB;
  o?: RGB;
  bare?: boolean;
}
interface SpriteDef {
  rows: readonly string[];
  inks: Readonly<Record<string, Ink>>;
  holes?: boolean;
}

const ink = (c: RGB, o?: RGB): Ink => ({ c, o });
const EDGE: RGB = [36, 18, 40];

export const END_SPRITES: Record<string, SpriteDef> = {
  // Fruta de coro: una baya lila de pétalos plegados con el rabito del tallo.
  chorus_fruit: {
    rows: [
      '................',
      '................',
      '.......ss.......',
      '.......s........',
      '.....1112.......',
      '....112223......',
      '...11222333.....',
      '...12223334.....',
      '...12233344.....',
      '...22333444.....',
      '....233444......',
      '.....3444.......',
      '................',
      '................',
      '................',
      '................',
    ],
    inks: {
      '1': ink([226, 196, 230], EDGE), '2': ink([186, 146, 196], EDGE), '3': ink([150, 108, 164], EDGE), '4': ink([108, 72, 122], EDGE),
      s: ink([86, 60, 90], EDGE),
    },
  },
  // Reventada: abierta, más clara y con el hueco del centro.
  popped_chorus_fruit: {
    rows: [
      '................',
      '................',
      '................',
      '.....1..1.......',
      '....1211221.....',
      '...12222.22.....',
      '...12.3..33.....',
      '....2.....3.....',
      '...22.....34....',
      '...2233.3344....',
      '....23334.4.....',
      '.....3.44.......',
      '................',
      '................',
      '................',
      '................',
    ],
    inks: {
      '1': ink([240, 220, 244], EDGE), '2': ink([206, 170, 214], EDGE), '3': ink([170, 128, 182], EDGE), '4': ink([128, 88, 140], EDGE),
    },
  },
};
