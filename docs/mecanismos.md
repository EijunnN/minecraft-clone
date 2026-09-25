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
  redstone del segundo tick; el cliente lo dibuja deslizándose (`fx 'pmove'`). Si se apaga antes de
  asentarse (un pulso de 1 tick de redstone), lo empujado se queda y el adhesivo no tira: lo «escupe».
- **Observador.** Cualquier cambio de estado del bloque que vigila (también un bloque que empieza o
  termina de moverse) lo enciende a los 2 ticks durante 2 ticks.
- **Tolvas.** Cada 8 ticks (periódico de la redstone) pasan un objeto y cogen otro. Lo que llega a una
  tolva desde otra no sigue hasta la vuelta siguiente.
- **Dispensadores y soltadores.** Con un pulso (también por el bloque de encima) disparan a los 4 ticks.
- **Explosiones.** 1352 rayos como en Minecraft; hieren según la distancia y la parte de la entidad que
  se ve desde el centro; los bloques rotos sueltan su objeto con probabilidad 1/potencia.

## Simplificaciones

- La base del pistón que se recoge ya es un pistón recogido mientras la cabeza vuelve (en Minecraft es
  un bloque en movimiento); mientras dura el movimiento no hace caso a la potencia y la mira al acabar.
- Un chunk guardado a medio movimiento pierde lo que se movía (el hueco se vacía al cargarlo).
- Las tolvas pasan objetos todas a la vez (cada 8 ticks del reloj del servidor), no cada una con su espera.
- La vagoneta con dinamita que se rompe corriendo explota, pero suelta también su objeto.
