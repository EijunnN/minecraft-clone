# Roadmap de VoxelCraft: todo lo que tiene Minecraft y lo que nos falta

Investigación del contenido de **Minecraft Java Edition 26.3 "Wilderness Bound"** (15 de septiembre de
2026, la versión más reciente) comparado con lo que VoxelCraft ya tiene, y un plan por fases para
acercarnos a él. Leyenda: ✅ hecho · 🟡 parcial · ❌ falta.

## 1. Resumen

| | Minecraft 26.3 | VoxelCraft hoy |
| --- | --- | --- |
| Dimensiones | 3 (Mundo normal, Nether, End) | 1 |
| Biomas | 66 (56 del mundo normal, 5 del Nether, 5 del End) | 23 |
| Estructuras | 22 (más 10 elementos decorativos: geodas, mazmorras, fósiles…) | 0 |
| Criaturas | más de 80, incluidos 2 jefes | 12 |
| Bloques | ~1.100 contando colores y variantes | ~70 |
| Objetos | ~1.500 | 56 objetos + bloques |
| Recetas | más de 1.000 | ~50 |
| Altura del mundo | 384 (y de -64 a 320) | ✅ 384 (y de -64 a 319) |
| Sistemas | redstone, encantamientos, pociones, comercio, asaltos, logros… | supervivencia básica, fluidos, criaturas, cofres y hornos |

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
| Clima | lluvia, nieve, tormentas con rayos; la nieve se acumula y el agua se congela | 🟡 (lluvia y nieve visuales) |
| Ciclo día/noche, fases lunares | sí | ✅ |
| Fluidos (agua y lava que fluyen, obsidiana, roca) | sí | ✅ |
| Gravedad (arena, grava), soporte de plantas, caída de hojas, crecimiento | sí | ✅ |
| Propagación del fuego, fuego en bloques | sí | ❌ |

### 2.2 Estructuras

| Mundo normal | Nether | End |
| --- | --- | --- |
| Aldea (5 estilos), puesto de saqueadores, mansión del bosque, templo del desierto, templo de la jungla, cabaña de bruja, iglú, campamento abandonado (26.3), mina abandonada, fortaleza (stronghold), ciudad antigua, cámaras de desafío, ruinas de senderos, portal en ruinas, monumento oceánico, ruinas oceánicas, naufragio, tesoro enterrado | fortaleza del Nether, bastión, fósil del Nether, portal en ruinas | ciudad del End (con barco y élitros) |

Elementos decorativos: geoda de amatista, mazmorra con generador de monstruos, fósil, pozo del
desierto, cofre de bonificación, plataformas y pilares del End. **VoxelCraft: ninguno** ❌.
Requieren un sistema de plantillas y tablas de botín.

### 2.3 Criaturas

| Tipo | Minecraft | En VoxelCraft |
| --- | --- | --- |
| Pasivas | alay, armadillo, ajolote, murciélago, camello, gato, pollo, bacalao, gólem de cobre, vaca, burro, rana, calamar brillante, ghast feliz, caballo, champiñaca, mula, ocelote, loro, cerdo, conejo, salmón, oveja, sniffer, gólem de nieve, calamar, strider, cubo de azufre (26.2), renacuajo, pez tropical, tortuga, aldeano, vendedor ambulante, caballo esqueleto, caballo zombi | cerdo, vaca, oveja, gallina, calamar |
| Neutrales | abeja, araña de cueva, delfín, enderman, zorro, cabra, gólem de hierro, llama, nautilo, panda, piglin, oso polar, pez globo, araña, llama de comerciante, lobo, piglin zombificado | araña, enderman |
| Hostiles | blaze, bogged, breeze, creaking, creeper, ahogado, guardián y guardián anciano, endermita, evocador, ghast, hoglin, zombi momificado (husk), cubo de magma, parched (1.21.11), fantasma, piglin bruto, saqueador, devastador, shulker, lepisma, esqueleto, slime, esqueleto errante (stray), vex, vindicador, warden, bruja, esqueleto del Wither, zoglin, zombi, aldeano zombi; monturas de monstruos: nautilo zombi y camello momificado (1.21.11) | zombi, zombi momificado, esqueleto, esqueleto errante, creeper |
| Jefes | dragón del End, Wither | — |

Mecánicas de criaturas que faltan: crías (con los modelos nuevos de 26.1), reproducción con comida,
domesticar (lobo, gato, loro, caballo, llama, nautilo), montar (silla, arnés del ghast feliz),
correas, esquilar ovejas, ordeñar vacas, huevos, variantes por bioma (cerdo, vaca y pollo de clima
frío y cálido), criaturas con armadura y objetos en la mano, generadores de monstruos.

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
| Armas: espada, hacha, arco, ballesta, tridente, maza, lanza (1.21.11) | 🟡 (espada, hacha y arco) |
| Efectos de estado (veneno, regeneración, fuerza, visión nocturna…) | 🟡 (11 efectos: velocidad, lentitud, fuerza, debilidad, regeneración, veneno, hambre, resistencia al fuego, visión nocturna, respiración acuática y absorción; faltan las pociones) |
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
| Brújula, reloj, mapas, mapas de explorador, libro y pluma, etiqueta, rienda, silla | ❌ |
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
| Reproducción de animales, crías, pesca, apicultura (miel) | 🟡 (criar, crías, esquilar, ordeñar, huevos que se lanzan y pesca; falta la apicultura) |

### 2.7 Aldeanos, comercio y asaltos

Aldeas, 13 profesiones con bloques de trabajo, comercio con esmeraldas y niveles, gólem de hierro
protector, vendedor ambulante, curar aldeanos zombi, asaltos con saqueadores, vindicadores,
evocadores y devastadores, y la bandera de mal presagio. **VoxelCraft: nada** ❌.

### 2.8 Redstone

Polvo de redstone, antorchas, repetidores, comparadores, palancas, botones, placas de presión,
pistones y pistones pegajosos, observadores, tolvas, dispensadores, soltadores, lámparas, TNT,
detector de luz solar, bloque musical, raíles y vagonetas (con cofre, tolva, TNT), puertas,
trampillas, puertas de valla, sensores de sculk, bombillas de cobre y fabricador automático.
**VoxelCraft: nada** ❌. Existe el polvo de redstone como objeto, pero sin función.

### 2.9 Encantamientos y pociones

Mesa de encantamientos con librerías, libros encantados, yunque, afiladora, ~40 encantamientos,
soporte para pociones, verruga del Nether, más de 30 efectos de estado, pociones arrojadizas y
persistentes, flechas con efecto. **VoxelCraft: nada** ❌. El lapislázuli y las librerías ya
existen como bloques y objetos.

### 2.10 Transporte y exploración

| Elemento | Estado |
| --- | --- |
| Caballos, burros, mulas, camellos, cerdos y striders montables; nautilo bajo el agua; ghast feliz volador | ❌ |
| Barcas (y con cofre, balsas de bambú), vagonetas y raíles | ❌ |
| Élitros y cohetes, perla de ender (teletransporte al lanzarla) | ❌ |
| Arqueología (cepillo, arena sospechosa, vasijas decoradas) | ❌ |
| Mapas y brújulas, barra de localización | ❌ |
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
4. **Estructuras.** Plantillas y ensamblado por piezas (como las aldeas), deterministas para que
   cliente y servidor las generen igual, y tablas de botín para sus cofres.
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

### Fase 5 — Un mundo más rico (XL)
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

### Fase 6 — Criaturas (XL)
Aldeas con aldeanos, profesiones y comercio con esmeraldas, gólems de hierro y de nieve; lobos y
gatos domesticables, caballos y burros montables, conejos, zorros, abejas y miel, tortugas, peces,
delfines, loros, cabras, llamas, pandas, osos polares, ranas, ajolotes, armadillos, camellos;
monstruos: ahogado, bruja, slime, fantasma, lepisma, araña de cueva; saqueadores y asaltos.

### Fase 7 — Magia y técnica (XL)
Encantamientos (mesa, libros, yunque, afiladora), pociones y efectos, redstone completa (polvo,
antorchas, repetidores, comparadores, pistones, observadores, tolvas, dispensadores, TNT, lámparas),
raíles y vagonetas, barcas.

### Fase 8 — Nether y End (XL)
Portales, los 5 biomas del Nether con sus criaturas (piglins, ghasts, blazes, hoglins, striders),
fortalezas y bastiones, netherita; fortaleza con ojos de ender, dragón del End, ciudades del End,
élitros y shulkers; el Wither.

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
