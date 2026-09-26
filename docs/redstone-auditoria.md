# Auditoría de la redstone frente a Minecraft Java

Comparación de la redstone de la fase 7 con la de Java (1.21, la base de la 26.x) para que se comporte
**igual**, también en lo técnico: pulsos de 0 ticks, BUD, cuasi-conectividad, comportamiento según el
sitio y la dirección, orden de las actualizaciones. Lo que ya coincide no se toca; lo que no, se porta.

## Resumen

Los resultados «normales» (una línea de polvo, un reloj, una puerta de pistones sencilla) ya salen como en
Java. Lo que no coincide es **el modelo de actualizaciones**, y de él dependen los circuitos técnicos:

| # | Tema | Java | VoxelCraft (fase 7) | Estado |
| --- | --- | --- | --- | --- |
| 1 | Orden de los avisos | `NeighborUpdater` en profundidad: cada aviso nuevo se atiende antes de seguir con el anterior (como la recursión de siempre) | Cola en anchura (FIFO) | ✅ |
| 2 | Orden de las caras | `updateNeighborsAt`: oeste, este, abajo, arriba, norte, sur. Formas: oeste, este, norte, sur, abajo, arriba | +X, −X, +Y, −Y, +Z, −Z | ✅ |
| 3 | A quién avisa cada bloque | Cada bloque avisa a quien le toca: el repetidor al de delante y a los vecinos de ese (menos a él); la palanca, a sus vecinos y a los del bloque en que se apoya; la antorcha, a los vecinos de sus seis vecinos… | Todo cambio avisa a sus seis vecinos y, si emite, a los vecinos de todos los conductores de al lado | ✅ |
| 4 | `setBlock` con opciones | Bits: 1 avisar a vecinos, 2 mandar al cliente, 16 no actualizar formas… (el repetidor cambia con 2 y avisa él al de delante en `onPlace`) | Todo cambio avisa igual | ✅ |
| 5 | Actualizaciones de forma | Aparte de los avisos (`updateShape`): el observador reacciona a ellas; el bloqueo del repetidor también | Un único tipo de aviso | ✅ |
| 6 | `onPlace` / `onRemove` | Cada bloque hace lo suyo al ponerse y al quitarse (dentro del propio `setBlock`, antes de avisar a los vecinos) | Aviso de cambio genérico después | ✅ |
| 7 | Polvo | Cable a cable (`updatePowerStrength`): cada uno recalcula y avisa a los vecinos de sí mismo y de sus seis vecinos **en el orden de un `HashSet`** (de ahí el comportamiento según el sitio). Al apagarse una línea larga baja poco a poco | La red entera se resuelve de una vez (potencias finales iguales, orden distinto) | ✅ |
| 8 | Eventos de bloque | Los pistones (y el bloque musical, la campana…) no actúan al recibir el aviso: apuntan un evento que se atiende en su fase del tick y ahí vuelven a mirar la potencia | El pistón actúa al momento | ✅ |
| 9 | Fases del tick | Ticks programados → fluidos → ticks aleatorios → eventos de bloque → entidades (placas) → entidades de bloque (bloques en movimiento, tolvas, sensores de luz) | Ticks programados → pisadas → periódicos; pistones y tolvas después | ✅ |
| 10 | Bloque en movimiento | Entidad con progreso 0 → 0,5 → 1 (se asienta al tercer tick); el pistón mira ese progreso para decidir si «escupe» (retracción instantánea) | 2 ticks fijos; «escupe» si se apaga antes | ✅ |
| 11 | Ticks programados | Uno por posición y tipo de bloque; orden (tick, prioridad, orden de llegada); los que se programan durante el tick van al siguiente | Igual | ✅ |
| 12 | Potencias (débil, fuerte, conductores, `getBestNeighborSignal`) | — | Igual | ✅ |
| 13 | Retardos y prioridades de repetidores y comparadores | — | Igual | ✅ |
| 14 | Fundido de antorchas (8 cambios en 60 ticks) | Lista global por mundo | Lista por antorcha | ✅ |
| 15 | Tolvas | Entidad de bloque: cada tick, con espera de 8; en el orden de las entidades de bloque | Duermen si no tienen nada que hacer | ✅ |
| 16 | Bloque guardado a medio mover | Guarda el progreso y lo termina al cargar | Se guarda ya asentado | ⚠️ |

## Hecho (y comprobado)

- El motor, el polvo, todos los componentes, los raíles, el pistón, el observador, las tolvas, los
  dispensadores y la dinamita siguen el código de Java (la columna «VoxelCraft» de arriba es como estaba).
- Lo que depende del orden interno de Java (el `HashSet<BlockPos>` del polvo y el `HashMap<BlockPos>` del
  pistón) se compara con Java de verdad: `tools/JavaHashOrder.java` genera las referencias y
  `tests/redstoneJava.test.ts` las comprueba (300 conjuntos y 100 mapas, también con coordenadas grandes).
- Pruebas de comportamientos técnicos: el adhesivo escupe con pulsos de 1 y 2 ticks y tira con 3; un BUD por
  cuasi-conectividad; la antorcha fundida no vuelve a encenderse sola (su tick de 160 se pierde contra el
  de 2 que ya tenía), como en Java.

## Decisiones y lo que queda

- **Versión:** 1.21.x con la retirada de `onRemove` de 1.21.5 (ahora `affectNeighborsAfterRemoval`, sólo
  cuando cambia el tipo de bloque). El polvo usa el evaluador de siempre (el de los «experimentos de
  redstone» es opcional en Java y no está).
- **El bloque que avisa** en un cambio de bloque es el que había antes (como `Level.setBlock` de Java). Un
  efecto curioso, también en Java: al poner un bloque de redstone junto a un cruce de raíles en T no cambia
  (el aviso lo da el aire que había), sí con una palanca o una antorcha.
- **Propiedades que aquí no caben en el estado** (el `powered` de puertas, trampillas, portillos y campanas,
  por los ids guardados): van en el dato de posición y su cambio se notifica como si cambiara el bloque
  (`stateTouched`: avisos y formas, así que un observador lo ve).
- **Colocar:** lo que en Java decide `getStateForPlacement`/`setPlacedBy` (la lámpara encendida, el
  repetidor que se enciende en 1 tick) se hace justo después de ponerlo, en `placed`.
- ⚠️ **Guardar a medio mover:** un chunk guardado con un pistón a medio mover se guarda ya asentado (Java
  guarda el progreso). El resultado es el mismo salvo que ese pistón no vuelve a mirar su potencia al cargar.

## Plan (seguido)

1. **Motor** (`sim/server/redstone.ts`): `NeighborUpdater` de Java (en profundidad, con su tope), `setBlock`
   con opciones, `onPlace`/`onRemove`, avisos y formas en el orden de Java, eventos de bloque y las fases
   del tick.
2. **Polvo**: el algoritmo de Java cable a cable, con el orden del `HashSet<BlockPos>` de Java reproducido
   (el `hashCode` de `BlockPos` y el recorrido de un `HashMap` de 16 cubos).
3. **Componentes**, uno a uno con el código de Java: antorchas, palanca, botones, placas, gancho y cuerda,
   repetidor, comparador, observador, lámpara, bloque musical, sensor de luz, diana, pararrayos, bombilla,
   puertas/trampillas/portillos, raíles, campana, cofre trampa, atril, dispensador, soltador, tolva,
   dinamita, sensores de sculk.
4. **Pistones**: eventos de bloque, entidad de bloque en movimiento con su progreso, los tres tipos de
   evento (extender, recoger, recoger al instante) y el resolvedor de empuje.
5. **Pruebas** con montajes conocidos (relojes, biestables, BUD, pulsos de 0 ticks, puertas de pistones,
   comportamiento según el sitio) y guardado del progreso de lo que se mueve.
