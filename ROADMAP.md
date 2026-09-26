# Roadmap de VoxelCraft: todo lo que tiene Minecraft y lo que nos falta

Investigación del contenido de **Minecraft Java Edition 26.3 "Wilderness Bound"** (15 de septiembre de
2026, la versión más reciente) comparado con lo que VoxelCraft ya tiene, y un plan por fases para
acercarnos a él. Leyenda: ✅ hecho · 🟡 parcial · ❌ falta.

## 1. Resumen

| | Minecraft 26.3 | VoxelCraft hoy |
| --- | --- | --- |
| Dimensiones | 3 (Mundo normal, Nether, End) | 1 |
| Biomas | 66 (56 del mundo normal, 5 del Nether, 5 del End) | 23 |
| Estructuras | 22 (más 10 elementos decorativos: geodas, mazmorras, fósiles…) | 6 (y 3 elementos decorativos) |
| Criaturas | más de 80, incluidos 2 jefes | 52 |
| Bloques | ~1.290 contando colores y variantes | ~850 (ver `docs/cobertura.md`) |
| Objetos | ~1.650 | ~1.050 (bloques incluidos) |
| Recetas | más de 2.000 | ~790 |
| Altura del mundo | 384 (y de -64 a 320) | ✅ 384 (y de -64 a 319) |
| Sistemas | redstone, encantamientos, pociones, comercio, asaltos, logros… | supervivencia, fluidos, criaturas, cofres y hornos, clima, comercio, domesticar y montar |

Lo que ya tenemos cubre el bucle básico (talar, fabricar, minar, fundir, comer, sobrevivir a la
noche) y en gráficos supera al juego original. Lo que falta es, sobre todo, **contenido** y
**sistemas**, y buena parte depende de tres cambios de base del motor (sección 3).

## 2. Inventario por áreas

### 2.1 Mundo

| Elemento | Minecraft | Estado |
| --- | --- | --- |
| Mundo infinito procedural, determinista por semilla | sí | ✅ |
| Altura -64 a 320, capa de pizarra profunda (deepslate) por debajo de 0 | sí | ✅ |
| Biomas de superficie | llanura, llanura de girasoles, bosque, bosque de flores, abedular (y antiguo), bosque oscuro, jardín pálido, taiga (y antigua de pinos y de abetos), taiga nevada, arboleda, prado, cerezal, bosque moteado (26.3), sabana (y meseta y ventosa), desierto, badlands (3), jungla (3), pantano, manglar, colinas ventosas (3), llanura nevada, picos de hielo, laderas nevadas, picos (3), costa pedregosa, playas, ríos, champiñonal | 🟡 (llanura, bosque, abedular, bosque oscuro, taiga, nevado, picos de hielo, pradera, cerezal, desierto, badlands, sabana, jungla, pantano, champiñonal, montañas, picos nevados, playa) |
| Océanos | cálido, templado, frío, helado, normal y sus versiones profundas | 🟡 (normal, cálido, frío, helado y profundo) |
| Biomas de cueva | cuevas frondosas, cuevas de goteo, oscuridad profunda, cuevas de azufre (26.2) | 🟡 (frondosas y de goteo) |
| Cuevas | "queso", "espagueti", "fideos", acuíferos, lagos de lava subterráneos | 🟡 (queso, espaguetis, acuíferos y lagos de lava) |
| Menas | carbón, hierro, cobre, oro, redstone, lapislázuli, diamante, esmeralda (+ versiones de pizarra profunda), cuarzo y oro del Nether, restos antiguos | ✅ (las 8 del mundo normal, con sus versiones de pizarra profunda) |
| Árboles | roble, abedul, abeto, jungla, acacia, roble oscuro, mangle, cerezo, roble pálido, álamo (26.3), champiñones gigantes, azalea | 🟡 (roble, abedul, abeto, jungla —también gigante—, acacia, roble oscuro, cerezo y champiñones gigantes) |
| Clima | lluvia, nieve, tormentas con rayos; la nieve se acumula y el agua se congela | ✅ |
| Ciclo día/noche, fases lunares | sí | ✅ |
| Fluidos (agua y lava que fluyen, obsidiana, roca) | sí | ✅ |
| Gravedad (arena, grava), soporte de plantas, caída de hojas, crecimiento | sí | ✅ |
| Propagación del fuego, fuego en bloques | sí | ❌ |

### 2.2 Estructuras

| Mundo normal | Nether | End |
| --- | --- | --- |
| Aldea (5 estilos), puesto de saqueadores, mansión del bosque, templo del desierto, templo de la jungla, cabaña de bruja, iglú, campamento abandonado (26.3), mina abandonada, fortaleza (stronghold), ciudad antigua, cámaras de desafío, ruinas de senderos, portal en ruinas, monumento oceánico, ruinas oceánicas, naufragio, tesoro enterrado | fortaleza del Nether, bastión, fósil del Nether, portal en ruinas | ciudad del End (con barco y élitros) |

Elementos decorativos: geoda de amatista, mazmorra con generador de monstruos, fósil, pozo del
desierto, cofre de bonificación, plataformas y pilares del End.

**VoxelCraft (fase 5)** 🟡: templo del desierto, templo de la jungla, iglú (con sótano la mitad de
las veces), mina abandonada, portal en ruinas y naufragio; y geodas, mazmorras con generador y pozos
del desierto. Todas con cofres de botín (tablas propias) y localizables con `/localizar`.

### 2.3 Criaturas

| Tipo | Minecraft | En VoxelCraft |
| --- | --- | --- |
| Pasivas | alay, armadillo, ajolote, murciélago, camello, gato, pollo, bacalao, gólem de cobre, vaca, burro, rana, calamar brillante, ghast feliz, caballo, champiñaca, mula, ocelote, loro, cerdo, conejo, salmón, oveja, sniffer, gólem de nieve, calamar, strider, cubo de azufre (26.2), renacuajo, pez tropical, tortuga, aldeano, vendedor ambulante, caballo esqueleto, caballo zombi | cerdo, vaca, oveja, gallina, calamar, armadillo, ajolote, camello, gato, bacalao, burro, rana, calamar brillante, caballo, mula, loro, conejo, salmón, gólem de nieve, renacuajo, pez tropical, tortuga, aldeano, vendedor ambulante |
| Neutrales | abeja, araña de cueva, delfín, enderman, zorro, cabra, gólem de hierro, llama, nautilo, panda, piglin, oso polar, pez globo, araña, llama de comerciante, lobo, piglin zombificado | araña, enderman, abeja, araña de cueva, delfín, zorro, cabra, gólem de hierro, llama, panda, oso polar, pez globo, lobo |
| Hostiles | blaze, bogged, breeze, creaking, creeper, ahogado, guardián y guardián anciano, endermita, evocador, ghast, hoglin, zombi momificado (husk), cubo de magma, parched (1.21.11), fantasma, piglin bruto, saqueador, devastador, shulker, lepisma, esqueleto, slime, esqueleto errante (stray), vex, vindicador, warden, bruja, esqueleto del Wither, zoglin, zombi, aldeano zombi; monturas de monstruos: nautilo zombi y camello momificado (1.21.11) | zombi, zombi momificado, esqueleto, esqueleto errante, creeper, ahogado, fantasma, lepisma, slime, bruja, aldeano zombi |
| Jefes | dragón del End, Wither | — |

Mecánicas de criaturas que faltan: domesticar loros y llamas, arnés del ghast feliz, correas,
variantes por bioma (cerdo, vaca y pollo de clima frío y cálido), criaturas con armadura y objetos en
la mano. Ya hay crías, cría con comida, domesticar lobos, gatos y caballos, montar con silla,
esquilar, ordeñar, huevos y generadores de monstruos.

### 2.4 Supervivencia y combate

| Elemento | Estado |
| --- | --- |
| Vida, hambre, saturación, agotamiento, regeneración, inanición | ✅ |
| Aire, ahogamiento, caída, lava, fuego, vacío, asfixia | ✅ |
| Muerte, pérdida del inventario y reaparición | ✅ (en la cama o en el punto de aparición del mundo) |
| Camas: dormir para saltar la noche y fijar el punto de reaparición; cama de paja de un solo uso (26.3) | 🟡 (8 colores, los de la lana que hay; falta la de paja) |
| Experiencia (orbes, niveles) | ✅ (aún no se gasta: faltan encantamientos y yunque) |
| Armaduras (cuero, cota de malla, hierro, oro, diamante, netherita, cobre) y adornos de armadura | 🟡 (cuero, hierro, oro y diamante) |
| Escudo, golpes críticos, barrido de espada, enfriamiento del ataque | 🟡 (escudo, críticos y enfriamiento por arma; falta el barrido) |
| Armas: espada, hacha, arco, ballesta, tridente, maza, lanza (1.21.11) | 🟡 (espada, hacha, arco, ballesta y tridente) |
| Efectos de estado (veneno, regeneración, fuerza, visión nocturna…) | 🟡 (33 efectos con sus mecánicas, iconos y `/efecto`; faltan los de las cámaras de desafío y los presagios de 1.21, fase 9) |
| Modos: supervivencia, creativo, aventura, espectador, extremo (hardcore) | 🟡 (supervivencia y creativo) |
| Dificultad pacífica, fácil, normal y difícil | ✅ |

### 2.5 Objetos, herramientas y fabricación

| Elemento | Estado |
| --- | --- |
| Herramientas de madera, piedra, hierro, oro y diamante (pico, hacha, pala, espada) | ✅ |
| Azada, netherita, cobre (1.21.9), mechero, caña de pescar, cepillo, catalejo | 🟡 (azadas y caña de pescar) |
| Tijeras | ✅ (hojas y ovejas) |
| Cubos de agua y lava | ✅ |
| Cubos de leche, de peces, de ajolote, de nieve polvo, de cubo de azufre | 🟡 (leche) |
| Brújula, reloj, mapas, mapas de explorador, libro y pluma, etiqueta, rienda, silla | 🟡 (brújula y mapas) |
| Mesa de trabajo 3×3 e inventario 2×2 | ✅ |
| Recetas | 🟡 (~50 de más de 1.000) |
| Libro de recetas | ❌ |
| Horno | ✅ |
| Ahumador, alto horno, fogata | ✅ |
| Cortapiedras, telar, afiladora, yunque, mesa de herrería, mesa de cartografía, fabricador automático (crafter) | 🟡 (cortapiedras) |
| Cofre | ✅ (también doble) |
| Barril, caja de shulker, cofre de ender, tolva, saco (bundle), cofre de cobre, estantería | ❌ |

### 2.6 Agricultura y ganadería

| Elemento | Estado |
| --- | --- |
| Brotes que crecen, caña de azúcar y cactus que crecen, hierba que se extiende | ✅ |
| Cultivos: trigo, zanahoria, patata, remolacha, calabaza, sandía, bayas, cacao, bambú, verrugas del Nether, flor de coro | 🟡 (trigo, zanahoria, patata, remolacha, calabaza y sandía) |
| Azada, tierra de cultivo e hidratación | ✅ |
| Polvo de hueso, compostador | ✅ |
| Pan, tarta, galletas, sopas | 🟡 (pan, tarta y patata asada) |
| Reproducción de animales, crías, pesca, apicultura (miel) | ✅ |

### 2.7 Aldeanos, comercio y asaltos

Aldeas, 13 profesiones con bloques de trabajo, comercio con esmeraldas y niveles, gólem de hierro
protector, vendedor ambulante, curar aldeanos zombi, asaltos con saqueadores, vindicadores,
evocadores y devastadores, y la bandera de mal presagio. **VoxelCraft: 🟡** aldeas con aldeanos,
12 profesiones con sus bloques de trabajo, comercio con esmeraldas en 5 niveles, gólem de hierro,
vendedor ambulante, aldeanos zombi (sin curarlos todavía), puestos de saqueadores, patrullas con
capitán, Mal presagio y asaltos por oleadas con saqueadores, vindicadores, evocadores, vex,
devastadores y brujas; Héroe de la aldea (rebajas). Falta la campana de la aldea.

### 2.8 Redstone

Polvo de redstone, antorchas, repetidores, comparadores, palancas, botones, placas de presión,
pistones y pistones pegajosos, observadores, tolvas, dispensadores, soltadores, lámparas, TNT,
detector de luz solar, bloque musical, raíles y vagonetas (con cofre, tolva, TNT), puertas,
trampillas, puertas de valla, sensores de sculk, bombillas de cobre y fabricador automático.
**VoxelCraft:** ✅ todo salvo el sculk (fase 7.5) y el crafteador (fase 9). Ver `docs/redstone.md` y
`docs/mecanismos.md`.

### 2.9 Encantamientos y pociones

Mesa de encantamientos con librerías, libros encantados, yunque, afiladora, ~40 encantamientos,
soporte para pociones, verruga del Nether, más de 30 efectos de estado, pociones arrojadizas y
persistentes, flechas con efecto. **VoxelCraft:** ✅ (37 encantamientos, 42 pociones, 33 efectos);
faltan los encantamientos del Nether, del Deep Dark y de la maza y las pociones de 1.21 (fases 7.5, 8 y 9).

### 2.10 Transporte y exploración

| Elemento | Estado |
| --- | --- |
| Caballos, burros, mulas, camellos, cerdos y striders montables; nautilo bajo el agua; ghast feliz volador | ❌ |
| Barcas (y con cofre, balsas de bambú), vagonetas y raíles | ✅ |
| Élitros y cohetes, perla de ender (teletransporte al lanzarla) | ❌ |
| Arqueología (cepillo, arena sospechosa, vasijas decoradas) | ❌ |
| Mapas y brújulas, barra de localización | 🟡 (mapas y brújula) |
| Logros (advancements) y estadísticas | ❌ |

### 2.11 Nether y End

Portal de obsidiana, 5 biomas del Nether (páramos, valle de almas, bosques carmesí y distorsionado,
deltas de basalto), fortalezas y bastiones, piglins y trueque con oro, netherita. En el End: ojos de
ender para encontrar la fortaleza, el portal del End, combate contra el dragón, islas exteriores,
ciudades del End, élitros y shulkers. **VoxelCraft: nada** ❌.

### 2.12 Bloques de construcción y decoración

Minecraft tiene familias completas por material: bloque, escaleras, losa, muro, valla, puerta,
trampilla, botón, placa de presión, cartel y cartel colgante (para cada madera y cada piedra), 16
colores de lana, alfombra, cristal y paneles, terracota esmaltada, hormigón, velas y camas, además
de faroles, cadenas, macetas, marcos, cuadros, estandartes, cabezas, cojines (26.3)… VoxelCraft
tiene ~70 bloques cúbicos y, desde la fase 3, losas y escaleras (8 materiales), vallas, portillos,
puertas, trampillas (3 maderas), escaleras de mano, paneles de cristal, antorchas en la pared y cama;
en la fase 4, muros (8 piedras), carteles (3 maderas, de pie y en la pared) y camas de 8 colores.
**Las formas no cúbicas son la mayor carencia visual al construir.**

### 2.13 Multijugador, interfaz y opciones

| Elemento | Estado |
| --- | --- |
| Invitar amigos con un enlace, hasta 16 por mundo, chat, lista de jugadores | ✅ (Minecraft añadió lista de amigos en 26.2) |
| Comandos | 🟡 (10 de ~80: `/time`, `/tp`, `/modo`, `/dificultad`, `/invocar`, `/dar`, `/matar`…) |
| Operadores y permisos (quién puede usar `/modo` o `/dar`) | ❌ |
| Aspecto personalizado del jugador (skins) | 🟡 (color de camiseta) |
| Objeto en la mano y armadura visibles en otros jugadores | ✅ |
| Reglas del juego (gamerules), bloques de comandos | ❌ |
| Subtítulos y opciones de accesibilidad | ❌ |
| Gráficos | ✅ (por encima del original: sombras, nubes volumétricas, agua con reflejos, TAA) |
| Sonido y música | ✅ (procedural) |

### 2.14 Experiencia de juego e interfaz (auditoría del 2026-09-24)

Lo que se nota al jugar y no estaba en las tablas anteriores. Revisado en el código, no de memoria.
El estilo visual de las pantallas puede ser moderno; lo que cuenta es que funcionen como en Minecraft.

**Inventario y objetos**

| Elemento | Estado |
| --- | --- |
| Descripción del objeto con sus datos (daño, velocidad de ataque, armadura, durabilidad, comida, efectos) | ✅ |
| Mano secundaria (tecla F; escudo, antorcha o comida en la otra mano) | ✅ |
| Clic central: coger el bloque que se mira (en supervivencia, si está en el inventario) | ✅ |
| Arrastrar para repartir una pila entre huecos (izquierdo a partes iguales, derecho de uno en uno) | ✅ (en el inventario y la fabricación) |
| Doble clic para juntar en el cursor los objetos iguales | ✅ |
| Mayúsculas + clic, 1–9, Q, Ctrl+Q, tirar fuera de la ventana, búsqueda en creativo | ✅ |

**Combate**

| Elemento | Estado |
| --- | --- |
| Velocidad de ataque propia de cada arma (espada 1,6, hacha 0,8, pico 1,2, pala 1, azada según material) | ✅ (y el daño de Minecraft por arma) |
| Indicador de recarga del ataque bajo la mira | ✅ |
| El hacha deja el escudo del rival inútil unos segundos | — (sólo importa con PvP o vindicadores, que aún no hay) |
| Inclinación de la cámara hacia el lado del golpe | ✅ |

**Movimiento y cuerpo**

| Elemento | Estado |
| --- | --- |
| Nadar (correr bajo el agua en postura horizontal) y gatear por huecos de 1 bloque | ✅ |
| Menos daño al caer sobre fardos de heno (−80 %) y camas (−50 %) | ✅ |
| Animaciones de los demás jugadores: comer, tensar el arco, cubrirse con el escudo | ✅ (y lo que llevan en cada mano) |

**Controles, chat y menús**

| Elemento | Estado |
| --- | --- |
| Cambiar las teclas; agacharse y correr con pulsación fija o mantenida | ✅ |
| Chat: historial con flechas y autocompletar comandos y nombres con Tab | ✅ |
| Lista de mundos recientes en el menú y semilla al crear un mundo | ✅ |
| Captura de pantalla (F2) | ✅ |

**Técnico**

| Elemento | Estado |
| --- | --- |
| El servidor manda sobre el inventario (hoy lo guarda el cliente: se puede hacer trampa desde la consola del navegador) | ❌ (da igual entre amigos; importa con desconocidos) |

## 3. Requisitos técnicos (el camino crítico)

Casi todo lo que falta depende de estas bases. Conviene hacerlas antes que el contenido:

1. ✅ **Estados de bloque con identificadores de 16 bits.** Hoy cada bloque ocupa 1 byte (máximo 256
   tipos) y las orientaciones son identificadores sueltos. Minecraft necesita propiedades por bloque:
   orientación, mitad superior o inferior, abierto o cerrado, edad del cultivo, potencia de redstone,
   anegado… Hay que pasar los chunks a `Uint16Array` con un registro de estados y migrar los mundos
   guardados (formato de ediciones, protocolo y mallado).
2. ✅ **Modelos de bloque no cúbicos.** Escaleras, losas, vallas, muros, puertas, camas, paneles,
   carteles, antorchas en la pared, cofres con tapa… Necesita un sistema de modelos por estado (cajas
   con UV) en el mallado y cajas de colisión por estado en la física y el trazado de rayos.
3. **Dimensiones.** Varios mundos por sala (normal, Nether, End), cada uno con su generador, su cielo
   y su iluminación, y portales entre ellos.
4. ✅ **Estructuras.** Constructores deterministas que cada chunk dibuja por su parte (rejilla de
   regiones para las de superficie, piezas encadenadas para las minas) y tablas de botín para sus
   cofres, que el servidor llena la primera vez que genera el chunk.
5. **Entidades más completas.** Equipamiento, montar, domesticar, crías, objetos arrojadizos y
   efectos de estado, con criaturas definidas por datos en lugar de código.
6. **Redstone en el servidor.** Actualizaciones de bloques vecinos, ticks programados y propagación de
   señal, con cuidado del coste de CPU del Durable Object.
7. **Autoridad del servidor sobre inventario y vida**, si el juego se abre a desconocidos (hoy se
   confía en el navegador de cada jugador).
8. ✅ **Pruebas dentro del repositorio** (servidor y navegador) y comprobación automática en GitHub
   Actions, para poder crecer sin romper lo que ya funciona.

## 4. Plan por fases

Tamaño aproximado para una persona con ayuda de IA: **S** horas · **M** 1–2 días · **L** varios días ·
**XL** una semana o más.

### Fase 3 — Base técnica (L) · ✅ hecha
Estados de bloque de 16 bits con migración de mundos, modelos de bloque no cúbicos con colisión,
pruebas en el repositorio y CI. *Desbloquea casi todo lo demás.*

Hecho: ids de 16 bits (hasta 4096 estados; los mundos guardados se migran solos), familias de
bloques con propiedades (orientación, mitad, abierto, bisagra, parte), modelos de cajas con
selección y colisión reales, subida de escalones de 0,6, colocación compartida por cliente y
servidor (autoritativa), `npm test` con `node:test` y GitHub Actions (tipos, pruebas y compilación).

### Fase 4 — Supervivencia completa (XL) · ✅ hecha
Ya hecho: camas (dormir de noche con todos los jugadores, reaparición en la cama), puertas y puertas
dobles, trampillas, portillos, vallas, escaleras y losas de 8 materiales, paneles de cristal,
escaleras de mano y antorchas en la pared. Granja: azadas, tierra de cultivo (humedad, pisoteo), trigo,
zanahorias, patatas y remolachas, polvo de hueso, pan, patata asada, azúcar, fardo de heno y tarta;
criar animales (crías que crecen, seguir la comida), esquilar, ordeñar y huevos. Armaduras de cuero,
hierro, oro y diamante (con modelo en el jugador) y experiencia (orbes y niveles). Escudo y efectos de
estado (manzana dorada, ojo de araña, carne podrida, leche y el comando `/efecto`). Calabazas y sandías
(tallos que dan fruto, calabaza tallada, farol, tarta de calabaza), compostador, lanzar huevos
(pollitos) y pesca (flotador, picada, peces, basura y tesoros). Muros, carteles con texto para todos,
cofres dobles, camas de colores, ahumador, alto horno, fogata (asa y quema) y cortapiedras.

Fase 4 terminada. (Las puertas de hierro pasan a la fase 7: sin redstone no se pueden abrir.)

### Fase 4.5 — Experiencia de juego (M) · ✅ hecha
Lo indispensable de 2.14 antes de seguir con contenido: descripción completa de los objetos, velocidad
de ataque por arma con su indicador, mano secundaria, clic central, arrastrar y doble clic en el
inventario, historial y autocompletado del chat, teclas configurables y agacharse/correr fijo, nadar y
gatear, reducción de caídas, animaciones de los demás jugadores y lista de mundos. La autoridad del
servidor sobre el inventario queda para cuando se juegue con desconocidos.

### Fase 5 — Un mundo más rico (XL) · ✅ hecha
Más biomas (pantano, jungla, bosque oscuro, badlands, champiñonal, cerezal, prado, picos de hielo,
océanos por temperatura) con sus árboles; cuevas y acuíferos mejores, cuevas frondosas y de goteo;
cobre, esmeralda y pizarra profunda; primeras estructuras (mazmorras con generador, minas, templos,
naufragios, portales en ruinas, iglús, pozos, geodas) con botín; mapas y brújula; tormentas y
acumulación de nieve.

- ✅ **Altura del mundo: 384 bloques, de y = −64 a 319** (coordenadas reales de Minecraft 1.18+).
  El terreno de siempre queda igual de 0 hacia arriba; por debajo hay piedra hasta el lecho de roca
  en −64, cuevas más hondas con lagos de lava desde −54, y el hierro, el oro, el redstone, el
  lapislázuli y los diamantes bajan hasta el fondo. El vacío empieza en −128. Los mundos guardados
  se migran solos (ediciones, cofres, hornos, fogatas y carteles). Cuesta un 40 % más generar cada
  chunk y un 16 % más mallarlo. Cuando lleguen las dimensiones (fase 8), la altura será de cada una
  (Nether 128, End 256).
- ✅ **Biomas nuevos y sus maderas.** 23 biomas: pantano (charcas, nenúfares, orquídeas y robles con
  enredaderas), jungla (árboles gigantes de 2×2, arbustos y enredaderas), bosque oscuro (robles oscuros
  y champiñones gigantes), tierras baldías (mesetas de terracota en franjas de colores y arena roja),
  campos de champiñones (islas de micelio en alta mar), arboleda de cerezos (pétalos rosas), pradera
  (flores), picos de hielo (hielo compacto), y océanos cálido, frío y profundo; la sabana tiene ya
  acacias. Cuatro maderas nuevas (jungla, acacia, roble oscuro y cerezo) con tronco, tablones, hojas,
  brote, losa, escaleras, valla, portillo, puerta, trampilla y carteles; el roble oscuro crece de 2×2
  brotes y la jungla da un árbol gigante con 2×2. Nueve flores nuevas (tulipanes, allium, margarita…).
  Faltan manglar, bosque de flores, arboleda nevada y las variantes (ventosas, antiguas…).
- ✅ **Subsuelo.** Pizarra profunda por debajo de 0 (mezclada con piedra hasta y = 8) con toba y las
  versiones de pizarra de todas las menas; cobre (lingotes y bloque) y esmeralda en las montañas;
  cuevas frondosas (musgo, azaleas y enredaderas de cueva con bayas luminosas que dan luz) y de goteo
  (bloques de espeleotema, estalactitas y estalagmitas, más cobre); acuíferos (cuevas inundadas por
  debajo de un nivel de agua por zonas); y geodas de amatista (basalto liso, calcita, amatista y
  amatista con brotes que echa racimos; los racimos dan fragmentos para el cristal tintado). La pizarra
  profunda rocosa sirve para herramientas de piedra, hornos, losas y escaleras.
- ✅ **Estructuras con botín.** Mazmorras (sala de roca musgosa junto a una cueva, generador de
  monstruos y cofres), minas abandonadas (pasillos con soportes de madera, puentes, telarañas, cofres
  y pasillos de arañas), templos del desierto (cámara del tesoro con cuatro cofres) y de la jungla
  (sótano con dos cofres), naufragios (cofres de provisiones y de tesoro), portales en ruinas (obsidiana,
  obsidiana llorosa, rocanegra y oro), iglús (con sótano y cofre la mitad de las veces) y pozos del
  desierto. El generador de monstruos invoca zombis, esqueletos o arañas con un jugador cerca (una
  antorcha al lado lo apaga) y las telarañas frenan. `/localizar <estructura>` dice dónde está la más
  cercana. Faltan las trampas (necesitan redstone y TNT, fase 7) y los raíles de las minas (fase 7).
- ✅ **Clima, mapas y brújula.** Tormentas eléctricas (una de cada tres lluvias): los rayos caen en
  lo más alto cerca de los jugadores, hacen 5 de daño y prenden a lo que haya a 3 bloques, con
  destello, trueno que llega con retraso según la distancia y rayos quebrados que brillan. En las
  zonas frías la nieve se posa en capas (se apilan a mano y dan bolas de nieve, que se lanzan) y el
  agua a la intemperie se congela; junto a una luz fuerte, el hielo y la nieve se derriten. Brújula
  que apunta al punto de aparición y mapas de 128×128 bloques (con un mapa vacío en la mano), que se
  ven al llevarlos con la posición propia y la de los demás jugadores.

### Fase 6 — Criaturas (XL) · ✅ hecha
Aldeas con aldeanos, profesiones y comercio con esmeraldas, gólems de hierro y de nieve; lobos y
gatos domesticables, caballos y burros montables, conejos, zorros, abejas y miel, tortugas, peces,
delfines, loros, cabras, llamas, pandas, osos polares, ranas, ajolotes, armadillos, camellos;
monstruos: ahogado, bruja, slime, fantasma, lepisma, araña de cueva; saqueadores y asaltos.

- ✅ **Aldeas y animales salvajes.** Aldeas de 5 estilos (pozo, calles, casas, granjas, farolas y
  cofres) localizables con `/localizar aldea`. Zorros, cabras, osos polares, conejos y lobos.
- ✅ **Aldeanos y comercio.** 12 profesiones que el aldeano toma del bloque de trabajo libre más
  cercano (atril, mesa de cartografía, de flechas y de herrería, barril, telar, afiladora, caldero y
  los que ya había). Pasean de día, vuelven a casa de noche abriendo puertas y huyen de los zombis.
  Pantalla de comercio con 3 a 6 ofertas en esmeraldas, 5 niveles (de Novato a Maestro) y usos que
  se reponen. Vendedor ambulante de vez en cuando.
- ✅ **Gólems y domesticar.** Gólem de hierro (4 bloques de hierro en T y una calabaza) que defiende
  de los monstruos y gólem de nieve que les lanza bolas de nieve. Lobos (con huesos) y gatos (con
  pescado crudo) domesticables: collar, sentarse, seguir al dueño y defenderlo; los creepers huyen de
  los gatos. Las aldeas traen su gólem y sus gatos.
- ✅ **Monturas.** Caballos (35 pelajes), burros, mulas (de caballo y burro), llamas que escupen y
  camellos. Se doman montándolos hasta que se dejan; con silla se guían con W/A/S/D y el ratón, y el
  caballo carga el salto. Los demás jugadores ven al jinete encima.
- ✅ **Criaturas acuáticas.** Bacalao, salmón, pez tropical y pez globo en bancos según el océano,
  delfines, tortugas que ponen huevos en su playa, ajolotes en las cuevas frondosas, ranas y
  renacuajos en los pantanos y calamar brillante en las profundidades. Cubos con pez.
- ✅ **Monstruos nuevos.** Ahogados (los zombis que se ahogan se convierten), brujas que lanzan
  pociones, slimes que se dividen (en pantanos y en chunks de slime), fantasmas para quien lleva 3
  días sin dormir, lepismas en la piedra infestada de las montañas, arañas de cueva venenosas en las
  minas y aldeanos zombi.
- ✅ **Abejas y más fauna.** Nidos en robles y abedules de praderas, colmenas, miel (quita el veneno)
  y panal; con una fogata debajo las abejas no se enfadan. Pandas, loros de 5 colores y armadillos
  que se enroscan (escamas con el cepillo). Carne y piel de conejo, y voces para todos los animales.
- ✅ **Saqueadores y asaltos.** Puestos de saqueadores (torre de vigilancia con mirador y cofre, nunca
  cerca de una aldea) donde aparecen saqueadores; patrullas de 2 a 5 con un capitán que lleva el
  estandarte ominoso. El capitán suelta la botella ominosa: al beberla se lleva Mal presagio y, al
  entrar en una aldea, empieza un asalto de 3, 5 o 7 oleadas (según la dificultad) con saqueadores
  (ballesta), vindicadores (hacha), evocadores (colmillos que brotan del suelo y vex que atraviesan
  paredes), devastadores (arrasan hojas y cultivos) y brujas. Barra del asalto arriba, aldeanos que
  se esconden, victoria con Héroe de la aldea (los aldeanos rebajan un 30 %) o derrota si no queda
  ninguno. Los evocadores sueltan el tótem de inmortalidad, que salva de una muerte. Los zombis van
  a por los aldeanos y en normal o difícil los convierten en aldeanos zombi. `/asalto` y `/patrulla`
  para probarlo.

### Mejoras entre fases

- ✅ **Conducto en seco.** Como en Minecraft, el agua que corre no anega un conducto puesto en seco
  (queda una burbuja de aire): ahora un cubo de agua vaciado encima lo anega, igual que a los corales
  y los pepinos de mar; el dispensador también los anega y, con un cubo vacío, los vacía.
- ✅ **Raíles.** El metal ya no sale azulado (reflejaba el cielo como un espejo).

- ✅ **Partículas nuevas.** Sistema propio con atlas procedural, física por partícula (viento,
  balanceo, rebote, reposo en el suelo) y fundido suave; emisores del ambiente (pétalos de cerezo,
  hojas, antorchas, hornos, fogatas, goteo, lava, micelio, luciérnagas, lluvia y burbujas).
- ✅ **Troncos tumbados.** Al poner un tronco contra un lateral queda tumbado; las ramas de los
  cerezos, la jungla y el roble oscuro los usan (corteza a lo largo, anillos en los extremos).
- ✅ **Aldeas despejadas.** Ya no crecen árboles dentro de las aldeas.
- ✅ **Agua sin paredes colgando.** El agua que crea el generador es quieta; las cuevas y los huecos
  que la tocaban dejaban paredes y techos de agua en el aire. Ahora llevan una barrera de roca (como
  los acuíferos de Minecraft); al romperla, el agua cae y se extiende.
- ✅ **Luz bajo el agua.** La mano y las partículas reciben la luz del sol filtrada por el agua (antes
  salían negras a pocos bloques de profundidad).

### Fase 6.5 — Catálogo del mundo normal (XL) · ✅ hecha
Todo lo del mundo normal que no pertenece a la redstone (fase 7), al Nether y al End (fase 8) ni a las
novedades recientes (fase 9), con sus recetas, sacado del catálogo de Minecraft 26.3 (ver
`docs/cobertura.md`): los 16 colores (tintes, lana, alfombras, hormigón, cristal tintado, terracota
y terracota esmaltada, camas, velas, estandartes lisos), todas las piedras con sus escaleras, losas y
muros, las maderas que faltan (mangle, bambú, roble pálido) y la madera descortezada, el cobre y su
oxidación, el océano (coral, algas, praderas marinas, pepinos de mar, prismarina, esponjas) y las
plantas (flores, arbustos de bayas, azaleas, plantas de cueva), la comida y la decoración (macetas,
faroles, cadenas, andamios…), los huevos de aparición y objetos sueltos (catalejo, reloj, bolsa…).
Antes de empezar se amplió el motor: hasta 1024 texturas (10 bits en el vértice) y 8192 ids de bloque.

- ✅ **Maderas.** Mangle (con raíces y propágulos), roble pálido y bambú (tallos que crecen, bloques
  y mosaico), con todas sus formas; troncos descortezados y leños de todas las maderas (con el hacha).
- ✅ **Colores.** Los 16 tintes (de flores y plantas), lana, alfombras, hormigón y hormigón en polvo
  (se endurece en el agua), cristal y paneles tintados, terracota y terracota esmaltada, camas, velas
  (hasta 4, se encienden) y estandartes lisos, con sus recetas de teñido.
- ✅ **Piedras.** Piedra lisa, las pulidas, pizarra profunda y sus ladrillos y baldosas, toba, las
  areniscas rojas, barro y ladrillos de barro, cinabrio y azufre, con escaleras, losas y muros y las
  cadenas del cortapiedras.
- ✅ **Cobre.** Bloques, cortado, grabado, rejillas, puertas, trampillas, barrotes, cadenas, faroles y
  antorcha de cobre en 4 fases de oxidación que avanzan solas; el panal los encera y el hacha raspa.
  Herramientas y armadura de cobre.
- ✅ **Océano y plantas.** Corales (mueren fuera del agua), algas que crecen, praderas marinas,
  pepinos de mar que alumbran, prismarina y esponjas que secan el agua; arrecifes y bosques de algas
  en los océanos. Flores altas, bayas dulces, azaleas, plantaformas que se inclinan, liquen luminoso,
  raíces colgantes y flor de esporas.
- ✅ **Comida y decoración.** Galleta, estofados, sopa de remolacha, zanahoria dorada; macetas para
  cualquier planta, faroles, cadena y barrotes de hierro, campana, andamios, vasija decorada, cuadros
  y marcos; 52 huevos de aparición, catalejo y reloj. El calamar suelta sacos de tinta (tinte negro).
- ✅ **Remate.** Carteles colgantes de las 10 maderas (del techo o de la pared, texto por las dos
  caras), estantería cincelada (6 huecos para libros), anflorcha en maceta, etiqueta (nombre sobre la
  criatura, que ya no desaparece), correa (al jugador o a una valla), saco y sus 16 colores (hasta 64
  de peso, se mete y se saca con clic derecho), soporte para armadura y saco de tinta del calamar.
- ✅ **Materiales y suelos.** Hierro y oro en bruto (las menas los sueltan) y sus bloques; bloques de
  carbón, lapislázuli, hueso y slime (rebota); hielo azul (y el hielo ya resbala); tierra gruesa, podsol,
  tierra enraizada y camino de tierra; nieve polvo (te hundes y te congelas; botas de cuero) y su cubo;
  más bloques infestados; tartas con vela; ranas que crían con slime y ponen huevos.
- ✅ **Equipo.** Fuego que se propaga y mechero; cota de malla; ballesta; tridente; escama y caparazón
  de tortuga; armaduras de caballo y de lobo; caña con zanahoria; cuerno de cabra (las cabras embisten);
  pata de conejo, patata venenosa y manzana de oro encantada; corazón del mar, concha de nautilo y
  conducto; cohetes y estrellas de fuegos artificiales.
- ✅ **Colecciones.** Cabezas de zombi, esqueleto, creeper y jugador (se ponen y se llevan); creepers
  cargados por los rayos; tocadiscos y 13 discos con música propia; saco de tinta brillante y marco
  brillante.
- ✅ **Libros y estandartes.** Libro y pluma, libro escrito (se firma y se copia) y atril para leerlo;
  telar con 39 dibujos y 7 diseños de estandarte, hasta 6 capas.
- ✅ **Calderos.** Con agua, lava o nieve polvo: se llenan y vacían con los cubos, la lluvia y la nieve
  los llenan, el agua apaga a quien arde, la lava quema y en el agua se lava la última capa de un
  estandarte.
- Lo que queda del catálogo (ver `docs/cobertura.md`) es de otras fases: redstone, encantamientos,
  pociones, yunque y mesa de encantamientos (fase 7); Nether y End (fase 8); novedades de 2025–2026
  y arqueología (fase 9). El Deep Dark y la ciudad antigua, los monumentos oceánicos y los guardianes
  (la prismarina y las esponjas sólo salen en creativo), la mansión del bosque, el tesoro enterrado y
  los mapas de explorador van en la fase 7.5.

### Fase 7 — Magia y técnica (XL) · ✅ hecha
Encantamientos (mesa, libros, yunque, afiladora), pociones y efectos, redstone completa (polvo,
antorchas, repetidores, comparadores, pistones, observadores, tolvas, dispensadores, TNT, lámparas),
raíles y vagonetas, barcas.

- ✅ **Pociones.** Soporte para pociones con polvo de blaze, 42 pociones (también arrojadizas,
  persistentes con su nube y flechas con efecto) con los ingredientes y tiempos de Minecraft;
  invisibilidad (se ve la armadura), supersalto, caída lenta, suerte y los instantáneos.
- ✅ **Encantamientos.** Mesa con librerías (hasta 15, glifos y libro animado), los 37 encantamientos
  del mundo normal con sus efectos reales, libros encantados, yunque (combinar, reparar, renombrar,
  se desgasta) y afiladora; brillo en la mano, en la armadura y en el suelo.
- ✅ **Redstone.** Polvo, antorchas, repetidores, comparadores (comparar, restar y leer contenedores),
  palancas, botones y placas de todas las maderas y pesadas, lámparas, detector de luz solar, diana,
  bloque musical, cuerda trampa, cofre trampa, puertas y trampillas de hierro, bombillas de cobre y
  pararrayos. Motor con cuasi-conectividad y actualizaciones en orden (`docs/redstone.md`).
- ✅ **Mecanismos.** Pistones y adhesivos (12 bloques, slime y miel, se deslizan), observadores,
  tolvas (8 ticks cada una), dispensadores y soltadores, dinamita con la explosión de Minecraft
  (`docs/mecanismos.md`).
- ✅ **Transporte.** Raíles (normales, propulsores, detectores y activadores), vagonetas (también con
  cofre, horno, tolva y dinamita), barcas y balsas de bambú de las 10 maderas (con cofre): sólidas,
  se puede estar de pie encima y se atan con la correa.
- ✅ **Efectos.** 33 efectos con sus mecánicas e iconos: prisa, fatiga minera, náuseas, ceguera,
  saturación, brillo (la campana ilumina a los saqueadores), gracia del delfín, salud mejorada,
  oscuridad, marchitamiento y levitación; estofado sospechoso según la flor y pez globo con náuseas.

Fuera de la fase 7 (anotado para que no se pierda):
- **Fase 8 (Nether y End):** conseguir en supervivencia la verruga del Nether, el polvo de blaze, la
  crema de magma y la lágrima de ghast (la fase 7 hace el sistema de pociones completo, pero esos
  ingredientes sólo se obtienen allí); el faro (necesita la estrella del Nether); la ancla de
  reaparición; la piedra imán; el encantamiento de velocidad de alma; los botones y placas de piedra
  negra pulida; la carga de fuego (polvo de blaze) y la flecha espectral (polvo de piedra luminosa),
  también como munición del dispensador; las fuentes de los efectos que sólo dan criaturas o bloques
  de allí (marchitamiento, levitación, brillo de la flecha espectral, prisa y fatiga minera del faro;
  los efectos ya funcionan y se pueden poner con `/efecto`).
- **Fase 7.5 (estructuras del mundo normal):** el sculk (sensores, catalizador, chillador) y el
  encantamiento de sigilo rápido, que salen del Deep Dark.
- **Fase 9 (novedades de 2025–2026):** el crafteador, la maza y sus encantamientos (brecha, densidad,
  estallido de viento), las lanzas y los encantamientos que se añadan con ellas; las pociones de las
  cámaras de desafío (supuración, tejido, infestación y carga de viento) y sus efectos.

### Fase 7.5 — Estructuras y criaturas del mundo normal (XL) · ✅ hecha
Lo del mundo normal que no tenía fase y que depende de la fase 7 (su botín son libros encantados y el
sculk da señales de redstone), y las criaturas y estructuras del mundo normal que quedaban sueltas:
- **Deep Dark:** el bioma, el sculk (bloque, venas, catalizador, sensor y sensor calibrado,
  chillador) con sus vibraciones, el *warden* y la ciudad antigua (pizarra reforzada, eco, fragmentos
  y disco 5, brújula de recuperación, sigilo rápido). La ciudad usa bloques de alma (arena y tierra de
  alma, fuego y farol de alma), que se adelantan de la fase 8.
- ✅ **Océano:** monumentos oceánicos en los océanos profundos (laberinto de salas, núcleo con 8 bloques
  de oro, salas de esponjas mojadas, alas y ático) con guardianes (púas que pinchan, láser que carga y
  cambia de color, coletazos en tierra) y tres guardianes ancianos (fatiga minera III con su aparición;
  prismarina, faroles marinos y esponjas en supervivencia); ruinas oceánicas frías y templadas, grandes
  y pequeñas, con cofres y ahogados; el tesoro enterrado en las playas (corazón del mar) y los mapas del
  tesoro (ruinas y el cofre del camarote de los naufragios). Los mapas de estructura (`structureMaps.ts`)
  sirven también para los de explorador del cartógrafo. Pendiente: adornos de armadura (fase 9).
- **Mansión del bosque** con sus illagers y el alay (también en los puestos de saqueadores); mapas de
  explorador del cartógrafo (bosque y océano).
- **Criaturas sueltas:** murciélago, ocelote, champiñaca, llama de comerciante, caballos esqueleto
  (trampa del rayo) y zombi; cabaña de bruja (bruja y gato negro) y fósiles.

Hecho: todo lo anterior, con vibraciones enganchadas a la redstone (`docs/vibraciones.md`), mapas de
estructura (del tesoro y de explorador, que buscan hasta 100 regiones como en Java) y criaturas de
estructura que no desaparecen y se guardan. La niebla lejana bajo tierra ya es oscura.

Fuera de la fase 7.5 (anotado para que no se pierda):
- **Fase 8:** la fogata de alma, el bloque de magma y las columnas de burbujas (arena de alma y magma
  bajo el agua).
- **Fase 9:** los adornos de armadura (marea, costa, vigía, silencio, vex…), la arena y la grava
  sospechosas y la resina (que también salen en estas estructuras); el sniffer, el breeze, el
  ciénago, el crepitante y las demás criaturas de 2024–2026.

### Fase 7.6 — Biomas y remates del mundo normal (L) · ✅ hecha
Lo que quedaba del mundo normal sin fase (salvo lo de 2024–2026, que es de la fase 9), de uno en uno:
- ✅ **Orden del código:** `GameServer.ts` y `Game.ts` en módulos (sin ganchos encadenados).
- ✅ **Auditoría de recetas:** de las recetas del catálogo con todos sus objetos en el juego, faltaban 70
  (diorita y granito con cuarzo, bloque de cuarzo y de espeleotema, raíces con barro, alfombras que se
  vuelven a teñir, bombillas enceradas y fundir menas, herramientas y pepinos de mar) y cuatro habían
  cambiado en 26.x (correa, etiqueta, silla y andamio de bambú; el alto horno lleva piedra lisa).
  Ahora coinciden todas; las 450 que usan objetos que aún no existen llegarán con ellos (fases 8 y 9).
- ✅ **Sistemas sueltos:** mesa de cartografía (ampliar hasta 1:16 con papel, copiar con un mapa vacío y
  bloquear con un panel de cristal; también ampliar en la mesa de trabajo con 8 papeles), escudo con
  estandarte (se ve en la mano, en el inventario y en los demás jugadores) y reparar juntando dos
  objetos iguales (+5 %, sólo conserva las maldiciones). La cabeza de esqueleto en la pared ya existía
  (sólo cambia el nombre interno) y los discos que faltan son de las fases 8 (Pigstep, Tears) y 9
  (Relic, Creator, Precipice, Bounce, Lava Chicken). Como los mapas se dibujan en vivo, uno bloqueado
  deja de cambiar una vez dibujado en esa sesión (no guarda los píxeles).
- ✅ **Ciudad antigua** con edificios más detallados: casas y barracones con zócalo, pilastras, franjas,
  ventanas con barrotes, techo de roble oscuro y tejado a dos aguas con alero (dentro, camas de lana,
  alfombra, farol colgado y cofre); torres por pisos (base con faldón, cuerpo con saeteras, remate volado
  sobre ménsulas con barandilla y aguja con farol, escalera de mano por dentro) que caben bajo la bóveda;
  pasarelas elevadas entre torres vecinas; costillas del centro con pilares, arcos y faroles colgados y
  barandillas en las escalinatas; farolas con pie cincelado.
- ✅ **Los biomas que faltaban** (29 nuevos; ya están los 53 del mundo normal salvo el jardín pálido,
  que es de la fase 9): ríos y ríos helados, playa nevada y costa pedregosa, océanos templados y los
  profundos que faltaban, llanuras de girasoles y nevadas, bosque de flores, abedular viejo, colinas
  ventosas de grava y con bosque, arboleda nevada, picos helados, escarpados y pedregosos, taigas de
  pinos y de abetos viejos (piceas gigantes de 2×2, podsol, rocas musgosas), junglas dispersa y de
  bambú, tierras baldías erosionadas (chimeneas de terracota) y boscosas (robles sobre tierra gruesa),
  meseta de sabana y sabana ventosa, manglar; las cuevas frondosas y de goteo salen con F3. Se eligen con
  los mismos parámetros que Java (temperatura, humedad, continentalidad, montaña, rareza y ríos), pero
  con reglas sobre nuestros ruidos, no con la tabla de Java: la forma del terreno no cambia. Cada bioma
  nuevo hereda de su bioma base lo general (criaturas, aldeas, estructuras) y tiene lo suyo (superficie,
  árboles y plantas). Las colinas ventosas y laderas nevadas son las antiguas «montañas» y «picos
  nevados».

### Fase 8 — Nether y End (XL) · 🟡 en curso
Portales, los 5 biomas del Nether con sus criaturas (piglins, ghasts, blazes, hoglins, striders),
fortalezas y bastiones, netherita; fortaleza con ojos de ender, dragón del End, ciudades del End,
élitros y shulkers; el Wither. De uno en uno:
- ✅ **8.1 Dimensiones y el Nether básico.** Cada dimensión es un mundo aparte en la misma sala
  (`sim/Multiverse.ts`: un servidor por dimensión con su parte del guardado; los jugadores, la semilla, la
  hora y la dificultad son comunes) y un registro de datos (`shared/dimensions.ts`: cielo, luz, niebla,
  clima, gravedad, aire, escala…) pensado para añadir más adelante otros sitios (el End, y lugares propios
  como la Luna a la que se llegue en cohete). Portal del Nether (marcos de 2×3 a 21×21 encendidos con
  cualquier fuego, se apagan al romper el marco, 4 s dentro o al momento en creativo, llegada al portal
  más cercano o a uno nuevo con plataforma), Nether de y = 0 a 127 (rocanegra, lava a y = 31, piedra
  luminosa, arena de alma, grava, magma, menas de cuarzo y de oro, fuegos eternos), niebla roja y luz sin
  cielo, agua que se evapora, camas que explotan, magma que quema, brújula y reloj sin rumbo, reaparecer
  en el mundo normal y los comandos `/dimension`, `/setblock` y `/fill`.
- **8.2 Biomas del Nether:** bosques carmesí y distorsionado (hongos, tallos, nylium, raíces, enredaderas y
  sus maderas), valle de almas, deltas de basalto; piedra negra, basalto, tierra de alma, luz de hongo,
  ladrillos del Nether; partículas y sonido de cada bioma; la lava del Nether fluye más rápido.
- **8.3 Criaturas del Nether:** piglins (trueque con oro) y piglins brutos, piglins zombificados, ghasts,
  blazes, cubos de magma, hoglins y zoglins, striders, esqueletos wither.
- **8.4 Estructuras del Nether:** fortalezas (generadores de blazes, verruga del Nether), bastiones (los 4
  tipos), fósiles del Nether y portales en ruinas en el Nether.
- **8.5 Lo que da el Nether:** netherita (escombros ancestrales, plantilla de mejora y mesa de herrería),
  ancla de reaparición, piedra imán, faro, velocidad de alma, fogata de alma, columnas de burbujas, carga
  de fuego, flecha espectral y lo apuntado en la fase 7.
- **8.6 El End:** fortalezas con el portal del End (ojos de ender), la isla del dragón (pilares de
  obsidiana, cristales del End), el dragón y el portal de salida, puertas del End, islas exteriores,
  ciudades y barcos del End (shulkers, élitros), plantas de coro y purpur.
- **8.7 El Wither.**

### Fase 9 — Metajuego y novedades recientes (L)
Logros y estadísticas, modos aventura, espectador y extremo, reglas del juego, más comandos,
permisos y operadores, libro de recetas, subtítulos; contenido de 2025–2026: la Edad del Cobre
(gólem de cobre, herramientas y armadura de cobre), ghast feliz, lanzas y nautilos, jardín pálido y
creaking, cámaras de desafío y breeze, arqueología, cuevas de azufre, bosque moteado y campamentos.

## 5. Decisiones pendientes

- **¿Paridad total o lo esencial?** Recomiendo priorizar lo que más se usa jugando con amigos
  (fases 3 a 6) antes que redstone avanzada, el End o las novedades de los últimos años.
- **Anti-trampas:** el inventario en el servidor sólo compensa si el juego se abre a desconocidos.
- **Plan gratuito de Cloudflare:** más criaturas, redstone y dimensiones consumen más CPU del Durable
  Object; hay que medir en cada fase (hoy ~1,3 ms por tick con 4 jugadores).

## Fuentes

- [Minecraft Wiki — Java Edition 26.3 (Wilderness Bound)](https://minecraft.wiki/w/Java_Edition_26.3)
- [Minecraft Wiki — Java Edition 26.2 (Chaos Cubed)](https://minecraft.wiki/w/Java_Edition_26.2)
- [Minecraft Wiki — Java Edition 26.1 (Tiny Takeover)](https://minecraft.wiki/w/Java_Edition_26.1)
- [Minecraft Wiki — Java Edition 1.21.11 (Mounts of Mayhem)](https://minecraft.wiki/w/Java_Edition_1.21.11)
- [Minecraft Wiki — Java Edition 1.21.9 (The Copper Age)](https://minecraft.wiki/w/Java_Edition_1.21.9)
- [Minecraft Wiki — Criaturas](https://minecraft.wiki/w/Mob) · [Biomas](https://minecraft.wiki/w/Biome) · [Estructuras](https://minecraft.wiki/w/Structure)
- [Minecraft Wiki (Fandom) — Objetos](https://minecraft.fandom.com/wiki/Item) · [ScalaCube — número de bloques](https://scalacube.com/blog/minecraft/how-many-blocks-are-there-in-minecraft)
