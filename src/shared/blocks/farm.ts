// Granja: tierra de cultivo, cultivos por edades (trigo, zanahorias, patatas, remolachas) y tarta.
import { family, familyBase, L, isCrop, R_MODEL, R_CROP } from './registry';
import { mbox } from '../blockModels';

// ------------------------------------------------------------------ granja

/** Tierra de cultivo (seca o húmeda); mide 15/16. Al romperla suelta tierra. */
export const FARMLAND = family('farmland', 'Tierra de cultivo', [['moist', 2]], (st) => {
  const dirt = L('dirt'), top = L(st.moist ? 'farmland_wet' : 'farmland_dry');
  return {
    render: R_MODEL, hardness: 0.6, tool: 'shovel', sound: 'dirt', category: null, noItem: true,
    top: st.moist ? 'farmland_wet' : 'farmland_dry', side: 'dirt', bottom: 'dirt',
    model: [mbox(0, 0, 0, 16, 15, 16, [dirt, dirt, top, dirt, dirt, dirt])],
  };
});

/** Cultivo con `ages` edades; `tex(edad)` da la textura y `h(edad)` la altura de selección (1/16). */
function crop(key: string, name: string, ages: number, tex: (age: number) => string, h: (age: number) => number): number {
  return family(key, name, [['age', ages]], (st) => ({
    render: R_CROP, solid: false, opaque: false, lightOpacity: 0, sound: 'grass', hardness: 0, category: null,
    noItem: true, all: tex(st.age), selection: [0, 0, 0, 1, h(st.age) / 16, 1],
  }));
}
/** Las zanahorias y patatas tienen 8 edades pero 4 dibujos (como en Minecraft). */
const quarter = (age: number) => (age < 2 ? 0 : age < 4 ? 1 : age < 7 ? 2 : 3);
export const WHEAT_CROP = crop('wheat_crop', 'Trigo', 8, (a) => `wheat_stage${a}`, (a) => 2 + a * 2);
export const CARROTS = crop('carrots', 'Zanahorias', 8, (a) => `carrots_stage${quarter(a)}`, (a) => 2 + a);
export const POTATOES = crop('potatoes', 'Patatas', 8, (a) => `potatoes_stage${quarter(a)}`, (a) => 2 + a);
export const BEETROOTS = crop('beetroots', 'Remolachas', 4, (a) => `beetroots_stage${a}`, (a) => 2 + a * 2);
/** Edad máxima de cada cultivo (por su estado base). */
export const CROP_MAX_AGE: Readonly<Record<number, number>> = { [WHEAT_CROP]: 7, [CARROTS]: 7, [POTATOES]: 7, [BEETROOTS]: 3 };

/** Tarta: siete porciones; cada mordisco quita 2/16 por el lado oeste. */
export const CAKE = family('cake', 'Tarta', [['bites', 7]], (st) => {
  const top = L('cake_top'), side = L('cake_side'), bottom = L('cake_bottom'), inner = L('cake_inner');
  return {
    render: R_MODEL, hardness: 0.5, sound: 'wool', category: 'decoracion', top: 'cake_top', side: 'cake_side', bottom: 'cake_bottom',
    model: [mbox(1 + st.bites * 2, 0, 1, 15, 8, 15, [side, st.bites ? inner : side, top, bottom, side, side])],
  };
});


/** ¿Cultivo en su última edad? */
export function isMatureCrop(id: number): boolean {
  const b = familyBase(id);
  return isCrop(id) && id - b >= CROP_MAX_AGE[b];
}

