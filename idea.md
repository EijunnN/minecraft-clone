# Idea: ir al espacio, a la Luna y a otros planetas

Una función propia de VoxelCraft (no existe en Minecraft): construir un cohete, salir del mundo normal y llegar a la
Luna y, más adelante, a otros planetas. Este documento es una idea, no un plan cerrado: dice qué haríamos, cómo
encajaría en el código que ya hay y qué queda por decidir.

## 1. La idea en una frase

Reúnes materiales, fabricas un cohete, lo llenas de combustible, despegas desde una plataforma, cruzas el espacio y
aterrizas en la Luna, donde no hay aire, la gravedad es baja y hay recursos que no existen en la Tierra. Con ellos
montas una base, y con la base, el siguiente viaje.

Encaja con el resto del juego: es supervivencia con una meta grande y un bucle nuevo (preparar, viajar, explorar,
volver), y lo pueden hacer varios jugadores juntos.

## 2. El cohete

### 2.1 Cómo se consigue
- **Plataforma de lanzamiento:** un bloque nuevo (o una estructura pequeña que se construye con bloques nuevos) sobre
  el que se monta el cohete. Sin plataforma no hay despegue.
- **Cohete:** un objeto que se coloca sobre la plataforma y crece por etapas (casco, motor, depósito, cabina), o una
  entidad que se ensambla en una mesa nueva. Propuesta: una **mesa de ensamblaje** con una cuadrícula de piezas, para
  que el cohete se vea y se sienta como algo que has construido.
- **Piezas:** casco (lingotes de hierro o de cobre), motor (redstone, vara de blaze, netherita), depósito, ventana de
  cabina (cristal), cono de cabeza. Cada pieza mejora una cosa: alcance, carga o seguridad.
- **Combustible:** para no inventar de cero, sale de cosas que ya hay: carbón y polvo de blaze para el primer cohete;
  después, un combustible nuevo (por ejemplo, «combustible de cohete» a partir de magma, azufre y aliento de dragón).
  Cuanto más lejos el destino, más combustible.

### 2.2 El despegue (sin ser una pantalla de carga)
1. Te subes a la cabina y arrancas con una tecla o palanca.
2. Cuenta atrás de 10 s con humo y fuego en la plataforma; el suelo tiembla y se oye a distancia.
3. Ascenso a la vista de todos: el cohete sube por el mundo normal, el cielo se oscurece y salen las estrellas.
4. A cierta altura (por ejemplo, y = 400), el juego te lleva a la **órbita**: una dimensión vacía y silenciosa.
5. Desde la órbita eliges destino en un mapa estelar (Luna, y más adelante, otros).
6. Descenso: entras en la atmósfera del destino, frenas con el motor y aterrizas donde quieras (o te estrellas).

### 2.3 Riesgos (para que importe)
- Sin combustible suficiente no llegas y caes.
- Un aterrizaje duro daña el cohete y a ti.
- El cohete puede quedarse sin combustible en la Luna: hay que **fabricar allí** para volver (ver 4.4). Es el bucle
  principal: no viajas a la Luna «de paseo», la necesitas para poder volver.

## 3. El espacio (la órbita)

Una dimensión pequeña y casi vacía:
- Sin aire, sin gravedad (o casi), cielo negro, estrellas y la Tierra grande, azul y con nubes, a un lado.
- Objetos que flotan: **chatarra espacial** (restos de cohetes y satélites con botín), asteroides pequeños con
  mineral, estaciones abandonadas.
- Aquí se puede construir una **estación orbital** (plataforma de descanso, reposta y punto de salida a otros mundos).
- Sirve de «estación de tren» entre destinos: siempre se pasa por la órbita.

## 4. La Luna

### 4.1 Cómo es
- **Terreno:** llanuras grises de regolito, cráteres de todos los tamaños (los grandes, con borde elevado y el fondo
  hundido), montañas bajas, valles largos y algún «mar» oscuro. Muy poca variedad de bioma; lo que cambia es el
  terreno y lo que hay bajo él.
- **Cielo:** negro con estrellas, sin nubes ni lluvia. La **Tierra** siempre a la vista, según dónde estés (una fase
  distinta según la hora). El Sol da mucha luz pero las sombras son negras y nítidas.
- **Día y noche:** largos (por ejemplo, 20 minutos de día y 20 de noche). De noche hace mucho frío y solo se ve por
  la luz de la Tierra y de los bloques.
- **Gravedad:** un sexto de la normal: saltos altísimos, caídas lentas, cosas que flotan. Es la parte más divertida
  y la que más se nota.
- **Sin aire:** la barra de aire baja como bajo el agua. Sin traje no se dura. Nada se apaga con viento ni hay
  sonido normal: dentro del vacío los ruidos llegan «por dentro» (sólo lo que toca el traje o el suelo).
- **Sin agua líquida:** el agua se evapora o se congela; el fuego no arde sin oxígeno.

### 4.2 Qué se necesita para sobrevivir
- **Traje espacial:** casco (con visor), pechera, pantalones, botas. Da aire para un rato (una «botella de oxígeno»
  que se rellena) y protege del frío. Sin él, cada segundo cuenta.
- **Oxígeno:** una barra propia. Se rellena en bases presurizadas, con botellas o junto a un generador.
- **Energía:** los paneles solares dan corriente de día; de noche hay que tener baterías (o redstone).
- **Frío y calor:** de noche, la temperatura baja; de día, al sol, sube. Las bases necesitan aislamiento.
- **Comida y agua:** no se cultivan al aire libre; hay que hacerlo dentro de cúpulas con aire, tierra y agua traídas.

### 4.3 Qué hay que hacer allí
1. **Aterrizar y explorar:** cráteres con cofres de misión anteriores (restos de sondas, banderas).
2. **Minar recursos que solo existen allí:**
   - **Regolito** (bloque de construcción gris, se puede fundir en cristal y ladrillo lunar).
   - **Hielo lunar** en cráteres oscuros: se funde en agua y se separa en oxígeno e hidrógeno.
   - **Helio-3** (mineral raro): combustible de alto rendimiento y fuente de energía.
   - **Titanio y aluminio**: para la armadura de traje y las piezas de cohete mejores.
   - **Cristales lunares**: para herramientas y decoración.
3. **Montar una base:** cúpulas de cristal, esclusas de aire (dos puertas, una sola abierta a la vez), generadores de
   oxígeno, paneles solares, invernaderos, cuartos con cama. Es el «modo construcción» de este mundo.
4. **Fabricar el combustible de vuelta:** con hielo lunar y helio-3 en una **refinería** (un bloque nuevo). Sin la
   refinería no vuelves.
5. **Vehículo lunar (rover):** un coche de baja gravedad para cruzar llanuras (aprovecha el sistema de vehículos que
   ya hay). Con faros, carga y asiento para dos.
6. **Peligros:** micrometeoritos (lluvia de rocas pequeñas que dañan cúpulas y a quien esté fuera), tormentas solares
   (hay que ponerse a cubierto), criaturas propias (ver 4.5).

### 4.4 El bucle de juego
Prepararse en la Tierra → despegar → llegar con poco combustible → montar una base mínima → minar hielo y helio-3 →
refinar combustible → volver con la carga (y lo que valga la pena) → usar lo traído para mejorar el equipo y llegar
más lejos.

### 4.5 Criaturas (opcional, para más adelante)
No hay vida, pero se puede inventar algo propio y raro: **autómatas** de una civilización anterior que guardan
ruinas (estilo «guardianes» de las ruinas subacuáticas), o **polvo con vida** que se agita cuando pasas. Mejor
empezar sin criaturas y añadirlas si el mundo se siente vacío.

## 5. Más allá de la Luna (otros planetas)

Cada destino es una entrada más del mismo sistema, con una idea clara que lo distinga:

| Destino | Cómo es | Qué se hace allí |
| --- | --- | --- |
| **Marte** | Desierto rojo, atmósfera fina, tormentas de polvo, cañones y volcanes | Agua congelada bajo tierra, terraformar (crear aire y verde), ruinas antiguas |
| **Venus** | Atmósfera de ácido, calor extremo, cielo naranja | Traje resistente al calor; minerales raros; lluvia ácida que corroe |
| **Asteroides** | Rocas pequeñas sin gravedad, unas junto a otras | Minería flotante, chatarra, un cinturón por el que se navega saltando |
| **Una luna helada** | Océano bajo el hielo, géiseres | Buceo bajo el hielo, criaturas propias |
| **Estación abandonada** | Nave a la deriva con botín y peligros | Historia y misiones sueltas |

Cada uno pide algo más del cohete (más alcance, mejor blindaje, más carga), de modo que hay progresión natural.

## 6. Cómo encajaría con el código de hoy

Lo más importante ya está pensado: las dimensiones son un **registro de datos** (`src/shared/dimensions.ts`) y viajar
es una sola operación («llevar al jugador a la dimensión D en el punto P», `src/shared/sim/Multiverse.ts`). El Nether
y el End ya la usan; la Luna y la órbita serían dos entradas más.

Lo que ya existe y sirve tal cual:
- `gravity`: la Luna usaría 1/6.
- `breathable: false`: la barra de aire baja sin aire.
- `sky: false`, `skyLight`, `ambient`, `fog`, `skybox`: cielo negro con estrellas (el End ya tiene su cielo propio).
- `weather: false`, `beds: false`, `respawn: false`: sin lluvia, sin camas normales, y al morir se vuelve a la Tierra.
- Vehículos, redstone, mecanismos y energía de redstone: base para rover, esclusas y generadores.

Lo que habría que añadir:
- **Campos nuevos en la dimensión:** `pressure`/`atmosphere` (con o sin aire, tipo de atmósfera), `temperature` (frío o
  calor por hora del día), `radiation`, y `dayLength` propio (la Luna, ciclo más largo).
- **Aire por zonas:** un sistema de «volúmenes con aire» (las cúpulas y las bases): un espacio cerrado con generador
  de oxígeno tiene aire; si se rompe una pared, se escapa. Es la pieza técnica más difícil; una primera versión
  puede ser más simple (radio alrededor de un generador).
- **Traje y botella de oxígeno:** equipo nuevo (mismo sistema de armaduras) y una barra de oxígeno propia.
- **Generador de terreno lunar:** cráteres, regolito, minerales y hielo en cráteres oscuros (en la línea de lo
  que ya hicimos con las cuevas y el End: un generador por dimensión).
- **Cohete y plataforma:** entidad nueva, bloque de plataforma, máquina de ensamblaje, combustible y sus recetas.
- **Órbita:** una dimensión casi vacía con chatarra y asteroides.
- **Cielo de la Luna:** la Tierra según la posición, estrellas más brillantes, sombras duras.
- **Sonido:** el vacío no propaga el sonido (encaja con lo que ya hicimos del chat de voz y su oclusión: en el
  vacío, nadie se oye sin radio).
- **Radio:** una versión del chat de voz por radio en el traje, para hablar a cualquier distancia en el espacio
  (aprovecha el sistema de grupos que ya existe).

Reglas del proyecto que se mantienen:
- Los **ids guardados** solo se añaden al final (bloques, objetos, dimensiones).
- **Sin compatibilidad con mundos viejos**: los mundos anteriores pueden no tener Luna; no hay que cargar nada raro.
- Las mecánicas nuevas se hacen **fieles a lo conocido** cuando existe en Java (gravedad, daño de caída, etc.) y
  **mejores** en lo visual y ambiental.

## 7. Fases sugeridas

1. **Base técnica:** campos nuevos de dimensión (aire, temperatura, duración del día) y el traje con oxígeno. Se
   prueba en el mundo normal con un comando (`/dimension luna`) antes de haber cohete.
2. **La Luna a pie:** generador de terreno, cielo con la Tierra, gravedad, regolito, hielo, helio-3, cúpulas y
   esclusas de aire.
3. **El cohete:** plataforma, mesa de ensamblaje, combustible, despegue y ascenso con efecto, aterrizaje.
4. **La órbita:** estación, mapa estelar, chatarra y asteroides.
5. **El bucle completo:** refinería, combustible de vuelta, rover, peligros (micrometeoritos, tormentas solares).
6. **Otros planetas**, de uno en uno.

## 8. Preguntas abiertas

- ¿El cohete lo pilota un jugador y los demás van de pasajeros, o cada uno puede lanzar el suyo?
- ¿Se puede volver a la Tierra sin refinería (con mucho combustible cargado desde aquí), o siempre hace falta?
- ¿Cómo de duro es el vacío: muerte rápida sin traje, o daño lento que da margen para reaccionar?
- ¿El tiempo en la Luna corre igual que en la Tierra (para que el ciclo día/noche de los amigos sea el mismo) o va
  a su ritmo?
- ¿Un mundo por servidor o Luna compartida entre todos? (Lo natural es lo segundo: la Luna de cada mundo.)
- ¿Qué peso tiene la historia (ruinas, mensajes) frente a la pura supervivencia y construcción?
