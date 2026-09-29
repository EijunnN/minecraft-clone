# Factorio como referencia del programa lunar

Fuente: los datos de `C:\Games\Factorio` (versión 2.0.72): `data/base/prototypes/**` (números) y `doc-html/*-api.json` (qué hace cada
propiedad). Nada de esto sale de memoria: cada cifra está en esos archivos. Lo que Factorio hace por código y no por datos (cómo elige el
taladro dónde minar, cómo reparte un inserter…) está marcado como **[comportamiento]** y viene de su documentación o de cómo se juega.

Regla del proyecto: donde Factorio tiene una cosa, la nuestra hace lo mismo con los mismos números. Si una pieza se aparta, se anota aquí
con su motivo (lo obliga Minecraft, o lo pide el diseño lunar) y se corrige en cuanto se pueda. Nada se deja «para más adelante» sin estar
en el plan de la última sección.

---

## 1. Extracción

| | Taladro quemador | Taladro eléctrico | Pumpjack |
|---|---|---|---|
| Tamaño (colisión) | 2×2 (1,4) | 3×3 (2,7) | 3×3 |
| Radio de búsqueda | 0,99 → área 2×2 | 2,49 → área 5×5 | 0,49 |
| `mining_speed` | 0,25 | 0,5 | 1 |
| Energía | 150 kW, combustible químico (1 hueco) | 90 kW eléctrica | 90 kW eléctrica |
| Ranuras de módulo | – | 3 | 2 |
| Salida | `vector_to_place_result` {0, −1,85} (delante) | {0, −1,85} | fluido |

- Ritmo = `mining_speed` ÷ `mining_time` del recurso. Hierro, cobre, carbón y piedra: `mining_time` 1 → eléctrico **0,5/s**, quemador 0,25/s.
  Uranio: `mining_time` 2 y necesita ácido.
- **No tiene inventario.** El prototipo `mining-drill` no tiene `inventory_size` ni ningún almacén; sólo lleva el progreso del minado
  (`mining_progress`, `bonus_mining_progress`) y una posición de salida (`drop_position`, `drop_target`). **[comportamiento]** El objeto
  sale ahí: si hay una cinta, un cofre, un horno o una máquina que lo acepte, entra; si no hay nada, cae **al suelo** (de uno en uno); y si
  esa posición está ocupada o lo de delante está lleno, el taladro **se para** («salida bloqueada») hasta que haya sitio.
- `resource_drain_rate_percent` 100: cada objeto gasta una unidad del recurso (los módulos de productividad hacen que salga más sin gastar más).
- `shuffle_resources_to_mine` falso: **no** elige al azar; recorre los recursos de su área en orden.
- Un taladro puede tener filtros de recurso (`filter_count`, máx. 5) para elegir qué minar de una mancha mezclada.
- Los recursos son entidades sueltas (una por casilla) con una cantidad finita cada una: `resource_autoplace` las reparte en manchas
  (`base_density`, `regular_rq_factor_multiplier`, `starting_rq_factor_multiplier`, zona de inicio garantizada). Cuando una casilla se agota, desaparece.
- El jugador también puede minar a mano (`minable`), lento; es la forma de empezar.
- Receta: taladro eléctrico = 3 circuitos electrónicos + 5 engranajes + 10 planchas de hierro (2 s). Quemador = 3 engranajes + 3 planchas + 1 horno de piedra.

## 2. Logística

### Cintas (`transport-belt`, velocidad en casillas por tick)
| | básica | rápida | exprés |
|---|---|---|---|
| `speed` | 0,03125 | 0,0625 | 0,09375 |
| objetos/s (2 carriles) | 15 | 30 | 45 |
| vida | 150 | 160 | 170 |
Receta: 1 plancha de hierro + 1 engranaje → **2 cintas**. Las tres mejoran unas a otras (`next_upgrade`, `fast_replaceable_group`): colocar una mejor
encima sustituye a la que hay.

### Subterráneas (`underground-belt`)
`max_distance` 5 (básica), 7 (rápida), 9 (exprés). Receta: 10 planchas + 5 cintas → 2 subterráneas.

### Divisores (`splitter`)
Ocupa 2×1, misma velocidad que su cinta. Reparte a dos salidas (con prioridad de entrada/salida y filtro por objeto). Receta: 5 circuitos + 5 planchas + 4 cintas.

### Brazos (`inserter`)
| | quemador | básico | largo | rápido | a granel |
|---|---|---|---|---|---|
| `rotation_speed` (vueltas/tick) | 0,013 | 0,014 | 0,02 | 0,04 | 0,04 |
| `extension_speed` | 0,035 | 0,035 | 0,05 | 0,1 | 0,1 |
| Recoge de | 1 casilla | 1 | **2** | 1 | 1 |
| Energía por movimiento | 50 kJ (combustible) | 5 kJ | 5 kJ | 7 kJ | 20 kJ |
| Consumo en reposo (`drain`) | – | 0,4 kW | 0,4 kW | 0,5 kW | 1 kW |
| Chest → chest (wiki, no está en los datos) | ≈0,6/s | 0,83/s | 1,15/s | 2,31/s | 2,31/s (×bonus de pila) |
- **Todos los brazos gastan energía** (son eléctricos salvo el quemador) y se paran sin ella.
- Todos tienen `filter_count` 5: se les puede poner hasta 5 filtros de objeto.
- **[comportamiento]** Cogen sólo lo que lo de delante acepta; el tamaño de lo que llevan de una vez sube con la investigación (bonus de pila).
- Recetas: básico = 1 circuito + 1 engranaje + 1 plancha; largo = básico + 1 engranaje + 1 plancha; rápido = básico + 2 circuitos + 2 planchas.

### Almacén
Cofre de madera 16 huecos, de hierro 32, de acero 48; cofres logísticos (pasivo, activo, almacén, búfer, solicitud) para robots.
Cofre de hierro = 8 planchas; de madera = 2 madera.

## 3. Energía

### Postes (`electric-pole`) — así se cablea Factorio
| | pequeño | mediano | grande | subestación |
|---|---|---|---|---|
| `supply_area_distance` | 2,5 → **5×5** | 3,5 → **7×7** | 2 → **4×4** | 9 → **18×18** |
| `maximum_wire_distance` | 7,5 | 9 | 32 | 18 |
| Tamaño | 1×1 | 1×1 | 2×2 | 2×2 |
Una máquina recibe energía si su caja toca el **área de suministro** de algún poste; los postes se unen por cable dentro del alcance (el menor
de los dos). Todo lo conectado forma una red. **No** se conecta por contacto entre bloques.

### Generadores y almacenes
- Panel solar: 3×3, **60 kW** de pico; con el ciclo día/noche de Nauvis sale una media de 42 kW (día completo 50 %, amanecer y ocaso 20 % cada
  uno con rampa lineal, noche 10 %). Receta: 5 acero + 15 circuitos + 5 cobre.
- Acumulador: 2×2, **5 MJ**, carga y descarga a **300 kW**. Receta: 2 planchas + 5 baterías.
- Caldera (3×2, 1,8 MW, quema combustible, agua → vapor a 165 °C) y máquina de vapor (3×5, **900 kW**, 30 vapor/s): 1 caldera alimenta 2 máquinas.
- Turbina de vapor, reactor nuclear, intercambiador de calor, tubería de calor (energía nuclear).
- **[comportamiento]** Red con déficit: cada consumidor recibe el mismo porcentaje de lo que pide (satisfacción), y las máquinas van más lentas.
  Los acumuladores se cargan con el sobrante y se gastan cuando falta.

## 4. Máquinas

| | Ensambladora 1 | Ensambladora 2 | Ensambladora 3 | Horno de piedra | Horno de acero | Horno eléctrico | Laboratorio |
|---|---|---|---|---|---|---|---|
| Tamaño | 3×3 | 3×3 | 3×3 | 2×2 | 2×2 | 3×3 | 3×3 |
| `crafting_speed` | 0,5 | 0,75 | 1,25 | 1 | 2 | 2 | (velocidad de investigación 1) |
| Energía | 75 kW | 150 kW | 375 kW | 90 kW (combustible) | 90 kW (combustible) | 180 kW | 60 kW |
| Módulos | 0 | 2 | 4 | – | – | 2 | 2 |
- Tiempo de una receta = `energy_required` ÷ `crafting_speed` (la plancha de hierro es 3,2 s → horno de piedra 0,31/s; eléctrico 0,625/s).
- Toman los ingredientes, los guardan en un búfer de entrada (sobre todo lo de 2 tandas de receta, más lo que meta un brazo) y dejan el
  resultado en un búfer de salida; se paran si la salida está llena. Se elige la **receta** en la máquina (ensambladoras) o se deduce del
  ingrediente (hornos).
- Refinería, planta química, centrifugadora, baliza (módulos de velocidad, eficiencia, productividad, calidad), roboport, silo de cohetes…

## 5. Fluidos
- Tubería: volumen 100; subterránea: alcance máx. 10 (par); tanque: 3×3, **25 000**; bomba: 20/tick, 29 kW; bomba de orilla: 1 200/s.
- Las cajas de fluido igualan su nivel entre vecinas según la diferencia de presión (simulación de flujo con volumen, no un «tanque global»).
- Caldera: filtro de agua y de vapor. Máquinas con cajas de fluido entrantes y salientes en posiciones fijas (girando con la máquina).

## 6. Otros sistemas de Factorio
Investigación (laboratorios, paquetes de ciencia, tecnologías con requisitos y costes); módulos y balizas; red de circuitos (combinadores,
cables rojo/verde); robots (logísticos y de construcción, roboports); trenes; contaminación y enemigos; planos (blueprints); estadísticas de
producción; vehículos; silo de cohetes (partes de cohete, satélite).

---

## 7. Lo nuestro frente a Factorio (estado real)

Veredicto: ✅ igual · 🔧 hecho, pero distinto de Factorio: hay que corregirlo · ❌ no existe.

| Pieza | Factorio | Nosotros hoy | |
|---|---|---|---|
| Cinta: velocidad | 15/30/45 por s, 2 carriles | 15/30 por s, 2 carriles | ✅ (exprés ❌) |
| Cinta: mejora al colocar encima | sí | no | ❌ |
| Subterránea, divisor | sí | no | ❌ |
| Brazo básico/rápido | 0,83/s y 2,31/s | 0,83/s y 2,2/s | ✅ |
| Brazo: **gasta energía** (0,4 kW en reposo, 13,2 kW al moverse) | sí, se para sin ella | sí; va más lento si falta | ✅ |
| Brazo largo, quemador, a granel, filtros (5), bonus de pila | sí | no | ❌ |
| Extractor: tamaño | 3×3 | 3×3 (2 de alto), boquilla al frente | ✅ |
| Extractor: **sin inventario**; cae al suelo y se para si se bloquea | sí | igual (probado) | ✅ |
| Extractor: ritmo 0,5/s, área 5×5, finitas | sí | sí | ✅ |
| Extractor: recorre los recursos en orden | sí | sí (por filas, capa de arriba primero) | ✅ |
| Extractor: filtros, módulos, quemador, pumpjack | sí | no | ❌ |
| Potencia del extractor / del panel | 90 kW / 60 kW | 90 kW / 60 kW | ✅ |
| **Red eléctrica** | postes con área de suministro y cable | postes pequeño, mediano, grande (2×2) y subestación (2×2), cable automático (5 máx., sin triángulos), área de suministro, cables dibujados y guardados | ✅ |
| Panel solar: 3×3, 60 kW, perfil día/noche de Factorio | sí | 60 kW, perfil de Factorio y 3×3 | ✅ |
| Acumulador: 5 MJ, 300 kW | sí | 5 000 ue, 300 ue/s y 2×2 | ✅ |
| Caldera / máquina de vapor / turbina / nuclear | sí | no | ❌ |
| Satisfacción de la red (todo va más lento) | sí | sí | ✅ |
| Ensambladora con receta elegida y búfers | 3 niveles | no | ❌ |
| Horno: tiempos, tamaño, combustible / eléctrico | 3,2 s por plancha a velocidad 1 | eléctrico 180 kW, 1,6 s (velocidad 2) y 3×3; falta el de piedra y el de acero | 🔧 |
| Laboratorio e investigación | sí | no | ❌ |
| Fluidos (tuberías, tanque, bomba) | sí | no | ❌ |
| Módulos y balizas | sí | no | ❌ |
| Red de circuitos | sí | no | ❌ |
| Robots, trenes | sí | no | ❌ (los trenes se sustituyen por el rover del diseño; ver plan) |
| Planos, estadísticas de producción | sí | no | ❌ |
| Fantasma de colocación, girar con R | sí | sí (sin arrastrar en línea con curvas; sin ver el de otros jugadores) | 🔧 |
| Entidades de varias casillas (2×2, 3×3, 3×5…) | sí | sí: familia de bloques con una casilla por parte, colocar/romper como un todo, modelo repartido entre casillas | ✅ |

## 8. Plan de trabajo (todo entra; el orden lo marcan las dependencias)

1. ✅ **Extractor fiel**: sin búfer; suelta por delante sobre lo que haya o al suelo; se para si está bloqueado; recorre los recursos en orden.
2. ✅ **Entidades de varias casillas**: cada casilla de la huella es un bloque de la misma familia que sabe dónde está el ancla y dibuja su porción
   del modelo; se colocan y se rompen enteras; los brazos entran y salen por cualquiera de sus casillas; giran con `dir`.
3. ✅ **Red eléctrica de postes**: hechos los cuatro postes, área de suministro, cable automático, cables dibujados y guardados, consumo de
   brazos y máquinas, perfil de brillo de Factorio, panel 3×3 y acumulador 2×2. Con el rayo rojo de «sin energía».
4. ✅ Extractor a 3×3 y cifras de energía de Factorio (90 kW, panel de 60 kW). Faltan los filtros de recurso y los módulos.
5. ✅ **Brazos completos**: los cinco (básico, rápido, largo a 2 casillas, de combustible con reserva y «chupa», a granel de 2), filtros de 5 objetos
   (lista blanca/negra), tope de pila, gancho para el bonus de pila de la investigación, coger/soltar en el suelo, energía (eléctricos por la red,
   drain + movimiento), ventana de configuración, guardado y animación del brazo y la pinza en el cliente.
6. **Cintas completas**: exprés, subterráneas (5/7/9), divisores con prioridad y filtro, mejora al colocar encima, arrastrar en línea con curvas.
7. ✅ **Máquinas con las recetas de Factorio**: ensambladoras 1–3 (3×3; 0,5/0,75/1,25; 75/150/375 kW; reposo 1/30), hornos de piedra y de acero
   (2×2; velocidad 1 y 2; 90 kW de combustible; carbón 4 MJ), horno eléctrico y laboratorio (3×3, 60 kW). Las recetas y los tiempos son
   LOS DE FACTORIO (`tools/factorio-extract.mjs` los saca de `data/base/prototypes/recipe.lua` a `src/shared/factorio/*.json`): la
   ensambladora elige una receta de Factorio y tarda `energy_required ÷ velocidad`; los hornos funden mineral→placa (3,2 s), piedra→ladrillo
   (3,2 s) y placas→acero (5 placas, 16 s). Los objetos de Factorio que no existían son objetos nuevos (engranaje, circuitos, acero, paquetes de
   ciencia, módulos…) con los nombres de su traducción al español. Las recetas con fluidos (química, petróleo, cinta exprés, plástico,
   batería…) están en los datos pero no se pueden hacer hasta que haya tuberías.
   Fabricación a mano (tecla C): cola con intermedios automáticos y reserva de ingredientes como Factorio.
10. ✅ **Investigación**: las 192 tecnologías de Factorio (costes, tiempos, prerrequisitos, recetas que desbloquean); laboratorios que gastan
   paquetes de ciencia; las que se abren al fabricar algo (`craft-item`) se completan solas; bonificaciones de laboratorio y de mano de los
   brazos. Estado compartido por todas las dimensiones. Ventana con la tecla G y desde el laboratorio. `/investigar <tecnología|todo>`.
   Pendiente: efectos aún sin aplicar (productividad de minado, velocidad de minado a mano…) y las tecnologías infinitas.
8. **Generación de energía propia de la Luna** con la mecánica de Factorio (caldera y vapor si hay agua del hielo; reactor de helio-3; solar).
9. **Fluidos**: tuberías con volumen y flujo, subterráneas, tanque, bomba, cajas de fluido en las máquinas; química y refinería del árbol lunar.
11. **Módulos y balizas**, **red de circuitos**, **robots y roboports**, **rover/tren lunar**, **planos**, **estadísticas de producción**.
12. Ver el fantasma de otros jugadores y sincronizarlo.
