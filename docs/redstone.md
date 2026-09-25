# Redstone (fase 7)

Cómo funciona la redstone de VoxelCraft y cómo se engancha un bloque nuevo (pistones, observadores,
tolvas, dispensadores…) sin tocar el motor.

## Dónde está cada cosa

| Archivo | Qué hay |
| --- | --- |
| `src/shared/redstone/api.ts` | Caras, la `RedstoneApi` que ofrece el motor y el registro (`registerRedstone`, `setConductor`). |
| `src/shared/redstone/signals.ts` | Consultas de potencia puras (fuerte, débil, la que llega por una cara). |
| `src/shared/redstone/wire.ts` | El polvo: resuelve una red entera de una vez. |
| `src/shared/redstone/components.ts` | Lo que hace cada componente (antorchas, repetidores, comparadores, placas…). |
| `src/shared/redstone/rails.ts` | Raíles propulsores, activadores, detectores y cruces en T. |
| `src/shared/redstone/use.ts` | El clic derecho sobre componentes, como función pura (la usan cliente y servidor). |
| `src/shared/blocks/redstoneBlocks.ts` | Los bloques y lo que **emite** cada uno. |
| `src/shared/sim/server/redstone.ts` | El motor del servidor (`Redstone`, en `GameServer.redstone`). |
| `src/client/game/redstoneClient.ts` | Uso en el cliente, efectos y partículas. |

Importar `src/shared/redstone` registra todos los componentes.

## Modelo

- Potencia de 0 a 15. Cada emisor da, **hacia cada cara**, una potencia débil y otra fuerte (como
  `getSignal` y `getDirectSignal` de Minecraft).
- Un bloque **conductor** (cubo sólido opaco, salvo los que se fuerzan con `setConductor`: piedra
  luminosa, bloque de redstone, cofres) recibe la potencia fuerte de sus vecinos y la da a todo lo que
  tenga alrededor. El polvo cuenta como fuerte hacia el bloque al que apunta, pero ese bloque no
  alimenta a otro polvo (la «potencia débil» de Minecraft).
- Nada recorre el mundo: todo va por **avisos locales** (cada cambio de bloque avisa a sus seis
  vecinos y, si es un emisor, a los vecinos de los conductores de al lado) y **ticks programados**
  (un montón ordenado por tick, prioridad y orden de llegada; uno por posición).
- Los cambios viajan a los clientes como cualquier cambio de bloque: el estado de cada componente
  (encendido, potencia del polvo, retardo…) está en su id de bloque.
- Lo que no cabe en el estado (salida de un comparador, mirones de un cofre trampa, si una puerta ya
  recibía potencia) va en un **dato por posición** (`getData`/`setData`), que se borra solo cuando el
  bloque cambia de familia. No se guarda con el mundo: al cargar un chunk, los componentes lo rehacen.

## Registrar un bloque

```ts
import { registerRedstone, DOWN, UP } from '../redstone';

registerRedstone(MI_BLOQUE, {
  // EMITE: potencia débil y fuerte hacia `face` (dirección del emisor hacia quien la recibe).
  emitter: {
    weak: (v, x, y, z, id, face) => (encendido(id) ? 15 : 0),
    strong: (v, x, y, z, id, face) => (encendido(id) && face === DOWN ? 15 : 0), // opcional
    connects: (id, face) => true, // opcional: ¿se une el polvo a él por ese lado?
  },
  // ESCUCHA: algo cambió a su alrededor (sx, sy, sz: quién provocó el aviso).
  neighbor: (api, x, y, z, id, sx, sy, sz) => {
    if (api.isPowered(x, y, z) !== encendido(id)) api.schedule(x, y, z, 2);
  },
  // Tick programado que vence.
  tick: (api, x, y, z, id) => api.setBlock(x, y, z, conEncendido(id, api.isPowered(x, y, z))),
});
```

Todo lo demás es opcional:

| Campo | Cuándo se llama |
| --- | --- |
| `emitter` | Cada vez que alguien pregunta cuánta potencia da (tiene que ser puro y barato). |
| `neighbor` | Un vecino cambió o le llegó un aviso (se acumulan: varios registros suman oyentes). |
| `tick` | Vence un tick programado con `api.schedule` (si el bloque sigue siendo de la misma familia). |
| `changed` | El bloque se puso, se quitó o cambió de estado; con `old = -1`, al cargar su chunk (entonces sólo anotar y programar, sin cambiar bloques). |
| `analog` | Lo que lee un comparador de él (0..15). |
| `stepped` | Hay una entidad en su celda este tick (placas, cuerda, mena). |
| `projectile` | Le da una flecha, un tridente o algo lanzado (diana). |
| `periodic` | Cada `every` ticks mientras está cargado (sensor de luz solar). |
| `use` | Clic derecho de un jugador; devuelve si lo atendió. |

El registro es por **familia** (el estado base): vale para todos sus estados.

## Consultar la potencia

Desde cualquier manejador, con la `api` que recibe:

```ts
api.isPowered(x, y, z);       // ¿recibe alguna potencia? (hasNeighborSignal)
api.power(x, y, z);           // la mayor que recibe de sus seis vecinos, 0..15
api.powerFrom(x, y, z, face); // la que le llega desde el vecino de esa cara (getSignal)
api.strongPower(x, y, z);     // la potencia fuerte que recibe (getDirectSignalTo)
api.analog(x, y, z);          // lo que leería un comparador del bloque; -1 si nada
```

Fuera de un manejador (otros sistemas del servidor), lo mismo con `gameServer.redstone`, o las
funciones puras de `signals.ts` con cualquier `RedstoneView` (`getBlock` y `getData`).

## Programar ticks y avisar

```ts
api.schedule(x, y, z, 4, PRIORITY_HIGH); // dentro de 4 ticks de juego; si ya hay uno ahí, no hace nada
api.isScheduled(x, y, z);
api.updateNeighbors(x, y, z);            // avisa a los seis vecinos
api.outputChanged(x, y, z);              // cambió lo que emite sin cambiar el bloque (comparador)
api.analogChanged(x, y, z);              // cambió lo que lee un comparador (contenido de un cofre)
```

Un tick de redstone son 2 ticks de juego. Las prioridades son las de Minecraft (más baja, antes):
`PRIORITY_EXTREMELY_HIGH` … `PRIORITY_NORMAL`.

## Ejemplo: un observador sencillo

```ts
registerRedstone(OBSERVER, {
  emitter: { weak: (_v, _x, _y, _z, id, face) => (on(id) && face === back(id) ? 15 : 0),
             strong: (_v, _x, _y, _z, id, face) => (on(id) && face === back(id) ? 15 : 0) },
  neighbor: (api, x, y, z, id, sx, sy, sz) => {
    // Sólo le importa lo que cambia delante.
    if (esDelante(id, x, y, z, sx, sy, sz) && !api.isScheduled(x, y, z)) api.schedule(x, y, z, 2);
  },
  tick: (api, x, y, z, id) => {
    api.setBlock(x, y, z, conOn(id, !on(id)));
    if (!on(id)) api.schedule(x, y, z, 2); // pulso de 2 ticks
  },
});
```

## Lo que se engancha desde fuera del motor

- Contenedores (`containerSlots`, `viewers`), atriles, tocadiscos y marcos llegan por `Redstone.hooks`
  (los pone `GameServer`).
- Los raíles del transporte: `transport.rails.railPowered` usa `redstone.isPowered`.
- Proyectiles (`projectileHit`), rayos (`lightningTarget`, `lightning`), cofres que se abren
  (`viewersChanged`) y contenidos que cambian (`analogChanged`) avisan al motor.

## Rendimiento

- Los avisos se atienden en cola, sin recursión, con un tope por tick (200 000); los ticks
  programados, con el tope de Minecraft (65 536).
- El polvo resuelve su red entera en una pasada (cubos de potencia de 15 a 1) y no se vuelve a
  resolver mientras sólo cambie la potencia de otros polvos: una línea de 15 se enciende o se apaga con
  15 cambios de bloque, no con cientos de avisos.
- La prueba de rendimiento (`tests/redstone.test.ts`) mueve una rejilla de 40×40 de polvo y diez
  relojes a la vez por debajo de 8 ms por tick.
