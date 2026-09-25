# Mecanismos (fase 7)

Pistones, observadores, tolvas, dispensadores, soltadores, dinamita y las vagonetas con tolva y con
dinamita. Se enganchan a la redstone con su API (ver `docs/redstone.md`): el motor no se ha tocado.

## Dónde está cada cosa

| Archivo | Qué hay |
| --- | --- |
| `src/shared/blocks/mechanismBlocks.ts` | Los bloques (6 orientaciones, modelos del pistón y la tolva) y lo que emite el observador. |
| `src/shared/pistons.ts` | Qué mueve un pistón (el `PistonStructureResolver` de Minecraft), puro. |
| `src/shared/explosions.ts` | Resistencia de los bloques y los rayos de una explosión, puro. |
| `src/shared/mechanismPlacement.ts` | Cómo se orientan al colocarlos (con la inclinación de la mirada). |
| `src/shared/mechanisms.ts` | Dinamita encendida (tipo de entidad 180, mecha, potencia). |
| `src/shared/sim/server/mechanisms.ts` | Lo que crea `GameServer` (y los observadores). |
| `src/shared/sim/server/pistons.ts` | Pistones: extender, recoger, tirar, bloques en movimiento, empujar entidades. |
| `src/shared/sim/server/hoppers.ts`, `inventories.ts` | Tolvas y lo que meten y sacan de cada cosa (reglas por cara). |
| `src/shared/sim/server/dispensers.ts` | Dispensadores y soltadores. |
| `src/shared/sim/server/tnt.ts` | Dinamita y explosiones (también las de los creepers). |
| `src/shared/sim/server/mechanismCarts.ts` | Vagonetas con tolva y con dinamita (`CART_BEHAVIORS`). |
| `src/client/game/mechanismsClient.ts` | Bloques que se deslizan, empuje del jugador, dinamita que parpadea, efectos. |

## Cómo funcionan

- **Pistones.** Miran la potencia al recibir un aviso (por cualquier lado menos por delante, o la del
  bloque de encima: cuasi-conectividad, con su «BUD»). Lo que mueven pasa 2 ticks como bloque en
  movimiento (`moving_piston`: invisible, no choca, no se rompe ni se mueve) y se asienta después de la
  redstone del segundo tick; el cliente lo dibuja deslizándose (`fx 'pmove'`). Al recogerse, también la
  base es un bloque en movimiento hasta que entra la cabeza (el cliente la dibuja extendida y quieta,
  `PMOVE_STILL`). Si se apaga antes de asentarse (un pulso de 1 tick de redstone), lo empujado se queda y
  el adhesivo no tira: lo «escupe».
- **Guardar a medio movimiento.** El chunk se guarda con lo que quedará al asentarse (`WorldSim.savedInstead`,
  sin tocar el mundo) y un chunk que se descarga asienta antes lo que se mueve en él
  (`WorldSim.onChunkUnload`): no se pierde nada.
- **Observador.** Cualquier cambio de estado del bloque que vigila (también un bloque que empieza o
  termina de moverse) lo enciende a los 2 ticks durante 2 ticks.
- **Tolvas.** Cada una pasa un objeto y coge otro; si movió algo, espera 8 ticks (su `cooldownTime`), y la
  que recibe de otra estando vacía, 7: una fila de tolvas mueve 2,5 objetos por segundo. Sólo se miran
  las que acaban su espera o despierta algo (un cambio de bloque a su lado, lo que guarda lo de encima o
  lo del pico, un objeto tirado encima o una vagoneta al lado); las demás duermen.
- **Dispensadores y soltadores.** Con un pulso (también por el bloque de encima) disparan a los 4 ticks.
  Como en Java, uno puesto donde ya hay potencia no dispara hasta que le llega un aviso de un vecino (en
  Bedrock sí dispararía).
- **Vagoneta con dinamita.** Rota corriendo (0,1 bloques por tick o más) no se suelta: se enciende con
  una mecha corta (0 a 38 ticks) y explota. Quieta, se suelta (aunque tenga la mecha encendida).
- **Explosiones.** 1352 rayos como en Minecraft; hieren según la distancia y la parte de la entidad que
  se ve desde el centro; los bloques rotos sueltan su objeto con probabilidad 1/potencia.

## Simplificaciones

- Un chunk guardado o descargado a medio movimiento se queda con el movimiento ya terminado (Minecraft
  guarda el avance y lo termina al cargar): el resultado es el mismo, pero un pistón guardado así no mira
  otra vez la potencia al cargar.
- Una tolva sin espera que no tiene nada que hacer duerme hasta que algo la despierta (en Minecraft lo
  intenta cada tick); en un mismo tick, las tolvas actúan en el orden en que despertaron, no en el de los
  bloques con datos del chunk.
