# VoxelCraft

**▶ Juega ahora: [voxelcraft.arturo97xd.workers.dev](https://voxelcraft.arturo97xd.workers.dev)** — pon
el mismo nombre de mundo que tus amigos (o comparte el enlace de invitación) para jugar juntos.

Un juego de bloques estilo Minecraft que corre en el navegador, con gráficos tipo *shader pack*,
modo **supervivencia** completo y multijugador en tiempo real sobre Cloudflare (Workers + Durable
Objects). Pensado para PC (teclado y ratón).

- **Mundo infinito procedural** con 23 biomas: océanos (cálidos, fríos, helados y profundos), playas,
  llanuras, praderas en flor, bosques, abedulares, bosques oscuros, arboledas de cerezos, taiga,
  picos de hielo, desiertos, tierras baldías de terracota, sabanas de acacias, junglas con árboles
  gigantes, pantanos, islas de champiñones y montañas con picos nevados; ríos, cuevas (frondosas con
  bayas luminosas, de goteo con estalactitas, inundadas), lagos de lava, geodas de amatista y las ocho
  menas de Minecraft (también en pizarra profunda por debajo de 0).
- **Estructuras con botín**: mazmorras con generador de monstruos, minas abandonadas con telarañas,
  templos del desierto y de la jungla, naufragios, portales en ruinas, iglús y pozos del desierto. Sus
  cofres traen botín propio de cada estructura; `/localizar` indica dónde está la más cercana.
- **Clima**: lluvia, nieve y tormentas con rayos (destello, trueno y daño). En las zonas frías la nieve
  se acumula en capas y el agua se congela; junto a la luz se derriten.
- **Mapas y brújula**: un mapa vacío se convierte en el mapa de la zona (128×128 bloques) y se ve al
  llevarlo en la mano; la brújula apunta al punto de aparición. Siete maderas (roble, abedul, abeto, jungla, acacia, roble oscuro y cerezo). 384 bloques
  de alto como en Minecraft actual: de y = −64 (lecho de roca) a 319.
- **Supervivencia**: vida, hambre y saturación, aire bajo el agua, daño por caída, lava, fuego,
  ahogamiento, vacío y asfixia, regeneración, muerte con pérdida del inventario y reaparición.
  Minado con tiempos reales según la dureza del bloque y la herramienta (con grietas), desgaste de
  herramientas, comida, arco y flechas, cubos de agua y lava.
- **Inventario y fabricación**: inventario de 36 ranuras con fabricación 2×2, mesa de trabajo 3×3,
  cofres y hornos compartidos entre jugadores. Clic, clic derecho, mayúsculas + clic, teclas 1–9 y Q
  funcionan como en Minecraft.
- **52 criaturas** con IA, búsqueda de caminos (A*), animaciones y sonidos propios: animales de
  granja y salvajes (zorros, cabras, osos polares, conejos, lobos, pandas, loros, armadillos y abejas
  con sus nidos y su miel), criaturas acuáticas (peces, delfines, tortugas, ajolotes, ranas y calamar
  brillante) y monstruos (zombis, esqueletos, creepers, arañas, endermen, ahogados, brujas, slimes,
  fantasmas, lepismas y aldeanos zombi). Los monstruos aparecen en la oscuridad y los no muertos
  arden al sol.
- **Aldeas y comercio**: aldeanos con 12 profesiones según su bloque de trabajo, que pasean de día y
  vuelven a casa de noche; clic derecho abre el comercio en esmeraldas, con 5 niveles. Vendedor
  ambulante y gólem de hierro protector.
- **Saqueadores y asaltos**: puestos de saqueadores y patrullas con capitán. Su botella ominosa da Mal
  presagio y, al entrar en una aldea, llega un asalto por oleadas (saqueadores, vindicadores,
  evocadores con sus colmillos y vex, devastadores y brujas) con su barra arriba; ganarlo te hace
  Héroe de la aldea. El evocador suelta el tótem de inmortalidad.
- **Domesticar y montar**: lobos y gatos se domestican (se sientan, siguen y defienden a su dueño);
  gólems de hierro y de nieve se construyen con calabazas. Caballos, burros, mulas y camellos se doman
  y se montan con silla (salto cargado); las llamas escupen.
- **Agua y lava que fluyen** como en Minecraft: el agua avanza 7 bloques y la lava 3, caen, buscan
  el hueco más cercano, se secan al quitar la fuente, dos fuentes de agua crean una tercera y el
  contacto agua–lava forma obsidiana, roca o piedra. Las corrientes arrastran al jugador y la
  superficie se inclina y fluye en los shaders.
- **Construcción con formas**: losas (también dobles) y escaleras de madera, roca, piedra, ladrillos
  de piedra, ladrillos y arenisca; vallas y portillos que se unen solos; puertas de dos bloques con
  bisagra (y puertas dobles), trampillas, escaleras de mano para trepar, paneles de cristal y
  antorchas en la pared. Se colocan como en Minecraft (la mitad y la orientación dependen de dónde
  haces clic y hacia dónde miras), tienen colisiones reales y se suben losas y escalones sin saltar.
  También muros de 8 piedras (se unen como las vallas) y carteles de pie o en la pared: al ponerlos
  se escribe su texto (cuatro líneas) y lo ven todos los jugadores.
- **Camas** de 8 colores: dormir de noche salta al amanecer cuando todos los jugadores del mundo
  están acostados (no si hay monstruos cerca) y la cama pasa a ser tu punto de reaparición.
- **Bloques de trabajo**: cofres que se unen en cofres grandes de 54 huecos; ahumador (comida) y alto
  horno (minerales), el doble de rápidos que el horno; fogata que alumbra, echa humo, asa hasta
  cuatro alimentos y quema al pisarla; cortapiedras para sacar losas, escaleras, muros y ladrillos.
- **Granja**: azadas y tierra de cultivo (se hidrata con agua a 4 bloques o con la lluvia, se seca y
  se pisotea al saltar encima); semillas que salen de la hierba; trigo, zanahorias, patatas y
  remolachas que crecen con la velocidad de Minecraft; polvo de hueso; pan, patata asada, azúcar,
  fardos de heno y tarta (se come por porciones y devuelve los cubos). Calabazas y sandías: sus
  tallos maduran y dan el fruto al lado; las calabazas se tallan con tijeras (con una antorcha, farol)
  y salen en grupos por el mundo. El compostador convierte restos de cosecha en polvo de hueso.
- **Pesca**: caña con flotador y sedal; cuando pica un pez el flotador se hunde y hay que recoger a
  tiempo: bacalao, salmón, pez tropical, pez globo, algo de basura y a veces un tesoro.
- **Animales de granja**: los animales siguen a quien lleva su comida y se crían (corazones, crías que
  crecen en 20 minutos y más rápido si comen); las ovejas se esquilan y les vuelve a crecer la lana
  comiendo hierba; las vacas se ordeñan con un cubo y las gallinas ponen huevos, que se pueden lanzar
  (a veces nace un pollito).
- **Armaduras**: cuero, hierro, oro y diamante (casco, peto, grebas y botas) con la reducción de daño
  y el desgaste de Minecraft; se ponen con clic derecho o en las ranuras del inventario, se ven sobre
  los jugadores (también sobre los demás) y tienen su barra en el HUD.
- **Escudo**: se levanta con clic derecho mantenido, frena el paso y para los golpes, flechas y
  explosiones que llegan de frente (no por la espalda); se desgasta con cada golpe fuerte.
- **Efectos de estado**: velocidad, lentitud, fuerza, debilidad, regeneración, veneno, hambre,
  resistencia al fuego, visión nocturna, respiración acuática y absorción (corazones dorados), con
  sus iconos y el tiempo restante en el HUD. Los dan la manzana dorada, el ojo de araña, la carne
  podrida y el pollo crudo; la leche los quita.
- **Experiencia**: orbes al matar criaturas, criar animales, minar menas y sacar lo fundido del horno;
  niveles con las fórmulas de Minecraft, barra con el nivel y al morir se suelta parte.
- **Mundo vivo**: la arena y la grava caen, las plantas y antorchas necesitan apoyo, las hojas se
  caen al talar el árbol, los brotes crecen hasta ser árboles, la hierba se extiende y los cactus y
  la caña crecen.
- **Gráficos avanzados** (WebGL2, todo propio):
  - Cielo físico con dispersión atmosférica (modelo de Hillaire): amaneceres, atardeceres, noche con
    luna con fases y estrellas.
  - Sombras suaves del sol y de la luna (mapa de sombras distorsionado + PCF), también de criaturas
    y objetos.
  - Nubes volumétricas con dispersión múltiple y sombras de nubes sobre el terreno.
  - Rayos de luz volumétricos (*god rays*), también bajo el agua.
  - Agua con refracción, absorción física por profundidad, reflejos en espacio de pantalla (SSR),
    brillo del sol, espuma en la orilla, cáusticas y un océano infinito en el horizonte.
  - Materiales PBR (normales, rugosidad, metales, emisión), dispersión subsuperficial en hojas y
    plantas, viento en la vegetación, iluminación de antorchas y oclusión ambiental.
  - TAA, bloom, exposición automática (adaptación de la vista), tonemapping ACES y visión nocturna.
  - Texturas pixel art 16×16 originales generadas por código (bloques, 56 objetos y las 12
    criaturas; sin recursos de Mojang).
- **Multijugador**: comparte el enlace del mundo. Cada mundo es un Durable Object que ejecuta el
  servidor de juego (20 ticks por segundo mientras haya alguien conectado) y guarda en SQLite los
  cambios, los cofres y hornos, el estado de cada jugador y los animales.
- **Un jugador sin conexión**: el mismo servidor de juego se ejecuta en un Web Worker y el mundo se
  guarda en el navegador (IndexedDB). Se activa con la casilla del menú o automáticamente si no se
  puede contactar con el servidor.
- **Sonido procedural** (Web Audio): pasos por material, romper/colocar y golpes de minado, voces de
  cada criatura, combate, comer, arco, explosiones, agua y lava cercanas, latido con poca vida,
  ambiente (viento, pájaros, grillos, cuevas, orilla, bajo el agua) y música generativa.

## Capturas

| | |
| --- | --- |
| ![Bosque a mediodía](docs/screenshots/forest.png) | ![Atardecer sobre la costa](docs/screenshots/sunset.png) |
| ![Criaturas](docs/screenshots/mobs.png) | ![Agua y lava que fluyen](docs/screenshots/fluids.png) |
| ![Horno e inventario](docs/screenshots/furnace.png) | ![Minando con un pico](docs/screenshots/mining.png) |
| ![Bloques PBR sobre el agua](docs/screenshots/build.png) | ![Bajo el agua](docs/screenshots/underwater.png) |
| ![Tormenta](docs/screenshots/rain.png) | ![Noche con antorchas](docs/screenshots/torches.png) |
| ![Losas, escaleras, vallas, puerta y cama](docs/screenshots/building.png) | ![Granja con trigo, zanahorias, patatas y remolachas](docs/screenshots/farm.png) |
| ![Armadura de diamante y barra de experiencia](docs/screenshots/armor.png) | ![Espada y escudo, efectos de estado y corazones dorados al atardecer](docs/screenshots/combat.png) |
| ![Huerto de calabazas y sandías con faroles y compostador](docs/screenshots/gourds.png) | ![Pescando en un estanque](docs/screenshots/fishing.png) |
| ![Taller con cartel, cofre doble, ahumador, alto horno, cortapiedras y fogata](docs/screenshots/workshop.png) | ![Inventario con la mano secundaria y la descripción de un arma](docs/screenshots/inventory.png) |
| ![Jungla con árboles gigantes y enredaderas](docs/screenshots/jungle.png) | ![Arboleda de cerezos al pie de una montaña](docs/screenshots/cherry.png) |
| ![Tierras baldías con mesetas de terracota](docs/screenshots/badlands.png) | ![Isla de champiñones gigantes](docs/screenshots/mushroom.png) |
| ![Pantano con nenúfares y orquídeas azules](docs/screenshots/swamp.png) | ![Picos de hielo compacto en la nieve](docs/screenshots/ice_spikes.png) |
| ![Cueva frondosa con musgo y enredaderas de bayas luminosas](docs/screenshots/lush.png) | ![Cueva de goteo con estalactitas](docs/screenshots/dripstone.png) |
| ![Geoda de amatista a oscuras](docs/screenshots/geode.png) | ![Pizarra profunda con menas](docs/screenshots/deepslate.png) |
| ![Templo del desierto](docs/screenshots/desert_temple.png) | ![Mazmorra con generador de monstruos y cofre](docs/screenshots/dungeon.png) |
| ![Naufragio en el fondo del mar](docs/screenshots/shipwreck.png) | ![Templo de la jungla entre cerezos](docs/screenshots/jungle_temple.png) |
| ![Mapa de la zona en la mano](docs/screenshots/map.png) | ![Rayo de tormenta sobre la costa, con la brújula](docs/screenshots/lightning.png) |
| ![Comercio con un cantero de la aldea](docs/screenshots/trade.png) | ![Gólems de hierro y de nieve, aldeanos, gato y lobo](docs/screenshots/golems.png) |
| ![Caballo, burro, mula, llama y camello](docs/screenshots/mounts.png) | ![Slime, bruja y otros monstruos nuevos; un fantasma al fondo](docs/screenshots/monsters.png) |
| ![Tortuga, ajolote, delfín y peces en la playa](docs/screenshots/aquatic.png) | ![Panda, oso polar, zorro, abeja y armadillo](docs/screenshots/fauna.png) |
| ![Capitán de una patrulla con el estandarte ominoso](docs/screenshots/pillagers.png) | ![Evocador y, detrás, una patrulla de saqueadores](docs/screenshots/evoker.png) |
| ![Puesto de saqueadores en la taiga](docs/screenshots/outpost.png) | ![Barra de un asalto sobre la aldea](docs/screenshots/raid.png) |

## Controles

Todas las teclas se pueden cambiar en **Ajustes → Teclas** (también agacharse y correr con una sola
pulsación). Estas son las de por defecto:

| Tecla | Acción |
| --- | --- |
| WASD | Moverse |
| Espacio | Saltar · en creativo, doble pulsación para volar |
| Shift | Agacharse (no caes por los bordes; permite colocar bloques sobre cofres, mesas y puertas; quieto en una escalera de mano; levantarse de la cama; bajarse de la montura) |
| Ctrl o doble W | Correr (en supervivencia hace falta tener algo de hambre saciada). En una ventana normal, Ctrl + W es el atajo de cerrar la pestaña: el juego pide confirmación antes de cerrar, y en **Pantalla completa** (botón de la pausa) Ctrl + W ya no cierra nada |
| Clic izquierdo | Romper bloque (mantener) · atacar criaturas (cada arma tiene su ritmo: la barra bajo la mira indica cuándo el golpe hace todo su daño) |
| Clic derecho | Colocar · abrir cofres, hornos, mesas, puertas, trampillas y portillos · dormir · comer o beber (mantener) · tensar el arco · usar cubos · labrar con la azada · polvo de hueso · dar de comer, esquilar u ordeñar animales · domesticar, sentar y montar · comerciar con aldeanos |
| Clic central | Coger el bloque apuntado: lo selecciona en la barra, lo trae de la mochila o, en creativo, lo crea |
| 1–9, rueda | Elegir ranura |
| Q · Ctrl + Q | Tirar un objeto · tirar la pila |
| F | Pasar lo que llevas a la mano secundaria (escudo, antorcha, comida…); el clic derecho la usa si la principal no hace nada |
| Ctrl corriendo bajo el agua | Bucear en postura horizontal; en huecos de un bloque se gatea |
| E | Inventario (en creativo, selector de bloques y objetos) |
| T, Enter, / | Chat y comandos (flechas: lo enviado antes · Tab: completar comandos y nombres) |
| Tab | Lista de jugadores |
| F1 · F2 · F3 · F5 | Ocultar HUD · captura de pantalla · información de depuración · tercera persona |
| Esc | Pausa / ajustes |

### Comandos

| Comando | Qué hace |
| --- | --- |
| `/modo supervivencia` · `/modo creativo` | Cambia tu modo de juego |
| `/dificultad pacifico\|facil\|normal\|dificil` | Dificultad del mundo (en pacífico no hay monstruos) |
| `/time set dia\|mediodia\|atardecer\|noche\|medianoche\|amanecer` | Cambia la hora |
| `/invocar <criatura>` | Hace aparecer una criatura delante (`cerdo`, `zombi`, `creeper`…) |
| `/dar <objeto> [cantidad]` | Deja objetos a tus pies (`/dar diamond 5`, `/dar iron_pickaxe`) |
| `/efecto <efecto> [segundos] [nivel]` | Da un efecto (`/efecto velocidad 60 2`); `/efecto quitar` los quita todos |
| `/matar` | Muerte instantánea (por si te quedas atascado) |
| `/localizar <estructura>` | Dónde está la estructura más cercana (`templo_del_desierto`, `templo_de_la_jungla`, `naufragio`, `portal_en_ruinas`, `iglu`, `pozo`, `mina`, `aldea`, `puesto`) |
| `/asalto` · `/patrulla` | Desatar un asalto en la aldea más cercana · hacer aparecer una patrulla de saqueadores |
| `/tp <jugador>` · `/lista` · `/seed` · `/ayuda` | Teletransporte, jugadores, semilla y ayuda |

### Primeros pasos en supervivencia

1. Rompe troncos con la mano y conviértelos en tablones (inventario, cuadrícula 2×2).
2. Con 4 tablones haz una mesa de trabajo; en ella fabrica palos, un pico y una espada de madera.
3. Consigue roca con el pico, haz herramientas de piedra y un horno (8 de roca).
4. Funde menas de hierro con carbón para conseguir lingotes (herramientas de hierro, cubos,
   tijeras). Los diamantes necesitan pico de hierro.
5. Antes de la noche, fabrica antorchas (carbón + palo) y un refugio: los monstruos no aparecen en
   lugares iluminados.

Recetas incluidas: tablones, palos, mesa de trabajo, antorchas, cofre, horno, librería, ladrillos
de piedra, arenisca, ladrillos, arcilla, las 20 herramientas (madera, piedra, hierro, oro y
diamante × pico, hacha, pala y espada), cubo, tijeras, arco, flechas, papel, libro, bloques de
hierro/oro/diamante (y de vuelta a lingotes), lana y lana teñida con flores o lapislázuli, losas,
escaleras, vallas, portillos, puertas, trampillas, escalera de mano, paneles de cristal, cama, azadas,
pan, fardo de heno, polvo de hueso, azúcar y tarta. En el horno: vidrio, piedra, lingotes, carbón
vegetal, ladrillos, terracota, carne cocinada y patata asada.

## Desarrollo local

Requisitos: Node.js 20 o superior.

```bash
npm install
npm run dev
```

Abre `http://localhost:5173`. El servidor de desarrollo de Vite ejecuta también el Worker y el
Durable Object (con `workerd`), así que el multijugador funciona en local: abre dos pestañas con el
mismo mundo para probarlo.

Otros comandos:

```bash
npm run typecheck   # comprobación de tipos (cliente, servidor y pruebas)
npm test            # pruebas del servidor de juego (fluidos, criaturas, colocación, camas, granja, ids...)
npm run build       # compila cliente + Worker en dist/
npm run preview     # compila y sirve la versión de producción en local
```

## Desplegar en Cloudflare

1. Crea una cuenta gratuita en [Cloudflare](https://dash.cloudflare.com/sign-up).
2. Inicia sesión desde la terminal:

   ```bash
   npx wrangler login
   ```

3. Despliega:

   ```bash
   npm run deploy
   ```

   Wrangler te mostrará la URL pública (por ejemplo `https://voxelcraft.<tu-subdominio>.workers.dev`).
   La primera vez crea el Durable Object `GameWorld` con almacenamiento SQLite (incluido en el plan
   gratuito). Los mundos creados con la versión anterior siguen funcionando: sus construcciones se
   conservan.

4. Comparte el enlace de invitación desde el juego (**Copiar invitación** en el menú o en la pausa).
   Tiene la forma `https://…/?mundo=nombre-del-mundo`: todos los que entren con el mismo nombre de
   mundo juegan juntos. El modo de juego elegido en el menú se aplica al crear un mundo nuevo; los
   jugadores que se unen después empiezan en el modo del mundo.

### Límites del plan gratuito

El juego está pensado para grupos de amigos dentro del plan gratuito de Workers:

- **Tiempo de servidor**: mientras haya alguien conectado, el Durable Object del mundo simula a 20
  ticks por segundo (1–2 ms de CPU por tick con 4 jugadores y un centenar de criaturas). El plan
  gratuito incluye 13.000 GB·s al día, unas **28 horas de mundo activo al día** (sumando todos los
  mundos). Cuando se va el último jugador la simulación se detiene y deja de consumir.
- **Peticiones**: los mensajes entrantes se facturan a razón de 20:1; con la posición a ~8 Hz (solo
  cuando te mueves) y un ping cada 5 s, cada hora-jugador consume unas 1.500–2.500 de las 100.000
  peticiones diarias.
- **Escrituras**: el mundo se guarda cada 30 segundos (una fila por chunk modificado, por cofre y
  por jugador) y al salir el último jugador, así que el agua que fluye o la hierba que crece no
  agotan las 100.000 filas diarias.
- El servidor es quien ordena las ediciones: si dos jugadores tocan el mismo bloque a la vez, todos
  ven el mismo resultado; lo que construyas durante un corte de conexión se envía al reconectar.
- Hasta 16 jugadores por mundo.

Si el grupo es grande o juega muchas horas, el plan Workers Paid (5 USD/mes) elimina estas
preocupaciones.

### Qué no incluye (todavía)

VoxelCraft reproduce el bucle principal de supervivencia de Minecraft, pero no todo el juego:

- 52 tipos de criatura (no las ~80 de Minecraft): sin criaturas del Nether y el End, ni jefes.
- Sin redstone, encantamientos (la experiencia todavía no se gasta en nada), pociones, estructuras
  generadas, barcas ni vagonetas, ni Nether o End.
- El inventario y la vida de cada jugador los gestiona su navegador (confianza entre amigos): los
  bloques, los cofres, los hornos, las criaturas y los objetos del suelo sí los controla el servidor.
- Los fluidos, las criaturas y el crecimiento de plantas solo se simulan cerca de los jugadores
  (unos 64 bloques), como las "distancias de simulación" de Minecraft.
- Los objetos del suelo y los monstruos no se guardan si el servidor se reinicia sin nadie
  conectado (los animales, los cofres y lo construido sí).

## Calidad gráfica

En **Ajustes** hay cuatro perfiles (Bajo, Medio, Alto, Ultra) y control individual de distancia de
visión, escala de resolución, sombras, nubes, reflejos, luz volumétrica, TAA y bloom. El juego elige
un perfil inicial según la GPU detectada. Si va lento en un portátil, prueba **Bajo** o reduce la
escala de resolución.

## Estructura

```
src/
  shared/          Bloques, objetos, criaturas, recetas, contenedores, protocolo y generación del mundo
    sim/           Servidor de juego: fluidos, criaturas (IA, A*), física, objetos, hornos, guardado
  server/          Worker + Durable Object (GameWorld) con almacenamiento SQLite
  client/
    world/         Iluminación y mallado (Web Workers), gestión de chunks
    render/        Pipeline WebGL2 y shaders (cielo, terreno, agua, nubes, criaturas, objetos, post)
    textures/      Texturas procedurales (bloques, objetos y criaturas)
    audio/         Motor de sonido procedural
    game/          Bucle de juego, jugador, supervivencia, inventario, entidades, entrada
    net/           Cliente de red y servidor local (Web Worker + IndexedDB)
    ui/            Menús, HUD, pantallas de inventario, fabricación, cofre y horno
```
