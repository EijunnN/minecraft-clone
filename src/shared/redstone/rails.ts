// Fase 7 (redstone): los raíles con la redstone, como en Minecraft.
// - Raíl propulsor y activador: se encienden si reciben potencia (y con ellos, hasta 8 más unidos en
//   línea: railPowerEdits de shared/rails.ts); escuchan a sus vecinos, así que les llega también la
//   potencia que atraviesa un bloque.
// - Raíl detector: con una vagoneta encima (lo enciende el transporte) da potencia 15 a su alrededor y
//   fuerte al bloque de debajo; el polvo se une a él.
// - Raíl normal en un cruce en T: al cambiar la potencia que recibe, tuerce hacia el otro lado.
// Se importa por sus efectos (registra en api.ts) desde redstone/index.ts.
import { RAIL, POWERED_RAIL, DETECTOR_RAIL, ACTIVATOR_RAIL, RAIL_KIND, RAIL_PLAIN, railIsPowered, isRail } from '../blocks';
import { railPowerEdits, replanJunction } from '../rails';
import { registerRedstone, DOWN, type RedstoneApi } from './api';

const apply = (api: RedstoneApi, edits: readonly (readonly [number, number, number, number])[]) => {
  for (const [x, y, z, id] of edits) api.setBlock(x, y, z, id);
};

registerRedstone([POWERED_RAIL, ACTIVATOR_RAIL], {
  neighbor: (api, x, y, z) => {
    const get = (a: number, b: number, c: number) => api.getBlock(a, b, c);
    apply(api, railPowerEdits(get, x, y, z, (a, b, c) => (api.isPowered(a, b, c) ? 1 : 0)));
  },
  changed: (api, x, y, z, old) => {
    if (old < 0) api.updateAt(x, y, z); // al cargar el chunk, que mire si le llega potencia
  },
});

registerRedstone(DETECTOR_RAIL, {
  emitter: {
    weak: (_v, _x, _y, _z, id) => (railIsPowered(id) ? 15 : 0),
    strong: (_v, _x, _y, _z, id, face) => (face === DOWN && railIsPowered(id) ? 15 : 0),
  },
});

/** ¿Tiene el raíl de (x, y, z) raíles en tres o cuatro lados? (a la misma altura, encima o debajo). */
function isJunction(api: RedstoneApi, x: number, y: number, z: number): boolean {
  let n = 0;
  for (const [dx, dz] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
    for (const dy of [0, 1, -1]) {
      if (isRail(api.getBlock(x + dx, y + dy, z + dz))) {
        n++;
        break;
      }
    }
  }
  return n >= 3;
}

registerRedstone(RAIL, {
  // Sólo cuenta el cambio de potencia (lo recuerda el dato de la posición, como en las puertas).
  neighbor: (api, x, y, z, id) => {
    if (RAIL_KIND[id] !== RAIL_PLAIN) return;
    const powered = api.isPowered(x, y, z);
    if (powered === (api.getData(x, y, z) === 1)) return;
    api.setData(x, y, z, powered ? 1 : 0);
    if (!isJunction(api, x, y, z)) return;
    const get = (a: number, b: number, c: number) => api.getBlock(a, b, c);
    apply(api, replanJunction(get, x, y, z, powered));
  },
});
