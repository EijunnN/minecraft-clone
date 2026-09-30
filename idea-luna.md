# Idea: el programa lunar (lore, árbol de tecnología y números)

Tercer documento de la serie. `idea.md` dice **qué** es ir a la Luna; `idea-industria.md` dice **cómo se siente** montar una
fábrica allí. Este dice **por qué vamos** (lore), **qué cuesta cada cosa y por qué existe** (el árbol, al estilo Factorio y
Satisfactory) y **cómo se llega** (el cálculo del viaje).

Todos los números salen de una calculadora que está en el repositorio y se puede volver a ejecutar:

```bash
node tools/luna-tablas.mjs           # comprobaciones: sin huérfanos, sin ciclos, hitos en orden
node tools/luna-tablas.mjs recetas   # las tablas de recetas de este documento
node tools/luna-tablas.mjs hitos     # coste en bruto de cada hito
node tools/luna-balance.mjs coste panel 12
```

Es un diseño, no un plan cerrado: las **fórmulas** son exactas; las **constantes** (potencias, tiempos, cantidades) son la
primera propuesta y se afinan jugando. Al final (sección 13) están las decisiones que quedan abiertas.

## Estado: por dónde se empezó (2026-09-29)

Se empezó por **el viaje**, no por la Luna a pie: un cohete en el que te subes y que te lleva. Ya hay, jugable de punta a punta:

- **El cohete Selene** (entidad propia, 4 plazas, modelo de 24 bloques): `/cohete` lo pone delante de ti. Clic derecho para subir,
  **Espacio** despega, **Mayús** baja (o aborta la cuenta atrás antes de la ignición).
- **El vuelo** lo lleva el servidor (`src/shared/rocket.ts`, `sim/server/rockets.ts`): cuenta atrás de 10 s con ignición a T-3,
  ascenso de 48 s hasta ~96 km (la Tierra se curva debajo y el cielo se pone negro), **tránsito** de 46 s por el espacio con la
  Tierra y la Luna a escala real (`src/shared/voyage.ts`) y **descenso motorizado** de 15 km hasta posarse en el otro mundo. Los pasajeros viajan juntos; de vuelta, el mismo cohete los deja en la
  plataforma de la que salieron.
- **La Luna** como dimensión: terreno propio (`world/moon.ts`: tierras altas, mares y cráteres de tres tamaños), bloques
  (regolito claro y oscuro, roca lunar, hielo sucio), un sexto de gravedad, **sin aire** (la barra baja como bajo el agua; la
  cabina del cohete sí tiene aire) y un cielo sin atmósfera (negro, estrellas que no titilan, el Sol duro y la Tierra a la vista).
- Cabina con marco de ventana, cuenta atrás, telemetría (altitud, velocidad, tiempo de misión), notas de la misión, plasma de la reentrada, llamas, humo, polvo,
  temblor de cámara y rugido de motores.

Lo que **aún no** está: el cohete se fabrica con la mesa y las piezas (ahora es un prefabricado), el combustible y el Δv
(sección 4), el traje y el oxígeno (fuera del cohete, en la Luna, sin traje se acaba el aire), la órbita como lugar,
la Plataforma de lanzamiento, y todo el árbol de la Luna (secciones 5 en adelante).

---

## 0. Reglas del árbol (para que todo tenga su porqué)

1. **Cada objeto resuelve una necesidad concreta**: aire, energía, calor, alcance, masa, defensa. Si no resuelve ninguna,
   no existe.
2. **Todo objeto se usa en algo.** No hay huérfanos ni ciclos (lo comprueba el script en cada cambio).
3. **La Luna no tiene lo que tiene la Tierra, y traerlo cuesta ~65 toneladas de cohete por tonelada** (sección 4). Por eso
   cada fase sustituye una importación por algo fabricado allí: sin cobre, cable de aluminio; sin redstone, silicio; sin
   carbón, carbono del hielo; sin los motores hechos con conchas de shulker y aliento de dragón, un motor propio.
4. **Las restricciones fabrican la cadena.** No hay carbono en el regolito, así que no hay acero: se construye en aluminio y
   titanio. No hay agua líquida, así que el hielo de los cráteres es lo más valioso del mapa.
5. **La geografía obliga a moverse.** Hay dos regolitos (tierras altas y mares) y hielo sólo en cráteres oscuros. Ninguno
   de los tres está en el mismo sitio.
6. **Nada sobra.** Cada subproducto tiene destino: el calcio va a las baterías, la escoria de ilmenita da titanio, el
   hidrógeno de los volátiles alimenta el propelente.
7. **Cada fase abre una necesidad nueva**, y la fábrica crece porque falta algo concreto, no porque lo diga un texto.
8. **Los hitos se entregan al Terminal** (Satisfactory) y abren **recetas**, que aparecen en el libro de recetas que ya
   existe. Nada se desbloquea por contador: se desbloquea por haber *fabricado* lo anterior.
9. **La dependencia de la Tierra baja** fase a fase hasta una sola cosa: las perlas de ender de cada reactor (sección 7).
10. **Sólo hace falta el mundo normal y el End.** El Nether es un peaje que el jugador ya pagó para llegar al End (los ojos de
    ender llevan blaze); aquí no se le pide nada más. El programa lunar es lo que pasa **después del End**, con lo que el End da.

**Unidades.** `tj` = tonelada de juego (masa de cohete). `kW` = potencia; `ue` = unidad de energía = 1 kJ (1 kW durante 1 s =
1 ue). `uO` y `uH` = unidades de oxígeno e hidrógeno. Un jugador respira **0,5 uO/s**. Un día lunar dura 20 min y una noche
20 min (1 200 s cada uno).

---

## 1. El lore: por qué vamos a la Luna

> **Vigente desde 2026-09-30: «La caída del Ancla».** Sustituye a la Señal, las Bitácoras, el Receptor, la Plataforma y los tres vuelos
> (1.1 y 1.3, y los pasos T1–T6 de la sección 3), que quedan como ideas. Todo lo que no se fabrica lo da el Dragón. Hecho en
> `shared/meteors.ts` y `sim/server/meteors.ts`.
>
> 1. **El Dragón era el Ancla**: mantenía este mundo escondido. Al matarlo, algo nos encuentra: **el Errante**, un punto rojizo que aparece
>    en el cielo y crece con cada lluvia. Nadie sabe qué es: es el siguiente mundo, después de la Luna.
> 2. **La radio de la Estación Selene** (los Vigías, desde la Luna) suena en ese momento: «…el Ancla cayó… el Errante los vio…».
> 3. **La Primera Lluvia**, en cuanto hay alguien en el mundo normal: aviso de 2 minutos con sirena y el cielo que se tiñe de rojo, 40
>    meteoritos que rompen lo que pillan, y al final **el grande**, que cae delante del jugador y deja en el centro del cráter el
>    **Núcleo**: dentro, el **Corazón del Ancla** (lo único que no se fabrica) y los **Planos de Selene** (un libro con la receta).
> 4. **El cohete se fabrica**: 3 etapas (acero, circuitos, tuberías y engranajes de la fábrica de la Tierra) + el Corazón + 50 de carbón.
>    `/cohete` queda para el creativo.
> 5. **Después, una lluvia cada hora jugada** (sólo corre con gente en el mundo normal), con 5 minutos de aviso y cada vez más fuerte.
>    Rompen construcciones y dejan meteoritos con **fragmentos del Errante**, que aún no sirven para nada: la pista del siguiente mundo.
> 6. La Estación Selene se construyó **para vigilar al Errante**: ir a la Luna no es huir, es ir a entender qué nos ataca.
>
> Pendiente: escudos o cúpulas para proteger la base, lluvias en la Luna, el diario de la Estación Selene y para qué sirven los fragmentos.

### 1.1 Lo que pasa después del Dragón

1. **Matas al dragón.** Sale el portal de salida, el huevo y la puerta a las islas exteriores (ya está hecho).
2. **Esa noche, la Luna se enciende.** Aparece un punto de luz en la cara oscura que parpadea cada 8 s. Lo ve **todo el
   mundo, en todo el servidor**: es un evento del mundo, no del jugador. Es barato de hacer (una textura sobre la luna que ya
   existe) y es lo que hace que el resto merezca la pena: es una pregunta que se ve desde la cama.
3. **En las ciudades del End hay algo nuevo:** unas **Bitácoras del Vigía** (siete volúmenes) en los cofres de tesoro y de
   los barcos. Cuentan qué eran esos lugares.
4. **Leer las tres primeras abre las recetas del Receptor y de la Plataforma.** Ahí empieza el programa.

### 1.2 Los Vigías

Una civilización que **vigilaba el cielo** y cruzó el Vacío para no perder su mundo. Todo lo que ya existe del End encaja sin
tocarlo:

| Lo que ya hay en el juego | Lo que era en realidad |
| --- | --- |
| Las ciudades del End | Los **puertos** de la travesía |
| Las torres de púrpura | **Mástiles de amarre** de las naves |
| El barco del End (flota en el vacío) | Una **nave de travesía**: el único vehículo que cruzaba |
| Los élitros | La **vela plegable** de los pilotos |
| Los shulkers | Las **escoltas** de los puertos (de ahí su concha: un casco) |
| Los endermen | **Vigías que se quedaron** y ya no son del todo de este lado: cargan bloques porque siguen intentando reconstruir; no soportan que los mires porque eran ellos los que vigilaban |
| El ojo de ender | Una **brújula de travesía** |
| El dragón | **El Ancla viva**: lo que mantenía el puerto amarrado a este mundo |
| El portal de salida y la puerta exterior | La **boya** del puerto |

### 1.3 Las siete Bitácoras (guion)

| Nº | Dónde | Qué cuenta |
| --- | --- | --- |
| I | Ciudad del End | «Vigilamos el cielo. Lo vimos vaciarse.» Quiénes eran y por qué construyeron puertos. |
| II | Ciudad del End | Cómo se cruza: la nave, los mástiles, las escoltas. Que hay **dos puertos**, no uno. |
| III | Barco del End | El segundo puerto está **en la Luna** y se llama **Selene**. Cómo se señala y cómo se responde. *(Abre Receptor y Plataforma.)* |
| IV | Ciudad del End | El **Ancla**: una criatura viva atada al puerto para que no se soltara del mundo. «Cuando el Ancla caiga, Selene despertará.» |
| V | Barco del End | Por qué los que se quedaron ya no son como antes (los endermen). |
| VI | Ciudad del End | El **Arco**: una máquina en la Luna que lanza carga al cielo. «Sin el Arco, el puerto no tiene hacia dónde.» |
| VII | Ciudad del End | Última entrada: «Si lees esto, el Ancla cayó. Aquí ya no queda nadie que responda. Sube tú.» |

### 1.4 Tres actos

| Acto | Dónde | Qué pasa | Qué mecánica lo lleva |
| --- | --- | --- | --- |
| **I. La Señal** | Tierra | La Luna se enciende. Las Bitácoras explican qué es. | Receptor, Plataforma, los tres vuelos (sección 3) |
| **II. Selene** | Luna (L0–L3) | Aterrizas junto a las ruinas de la **Estación Selene**. Hay **autómatas** apagados y terminales con los **diarios de la estación**: los Vigías vivieron aquí generaciones, y **su fábrica era la tuya** (mismos procesos: regolito, hielo, metal). | Ruinas con lore y reliquias; los autómatas sólo se activan si les das energía |
| **III. El Arco** | Luna (L4–L6) | El Arco está roto: un carril de casi un kilómetro con los cimientos aún en pie. Restaurarlo es el **lanzador de masa**. El primer disparo **enciende una segunda señal**: otra luz, en otro lado. | Lanzador de masa (sección 8) |

El mecanismo del juego y el argumento son **lo mismo**: la fábrica que construyes para vivir es la que reabre el camino. No
hay una misión aparte que hacer en lugar de jugar.

### 1.5 Por qué la Luna y no otra cosa (los cuatro motivos)

1. **Curiosidad**: hay una luz nueva y nadie te pide nada, sólo te pica.
2. **Coherencia**: las Bitácoras dicen adónde iban los Vigías y por qué el Dragón importaba.
3. **Recompensa**: lo que hay allí (aluminio, titanio, helio-3, hielo) no existe en la Tierra y abre equipo y máquinas que aquí
   no se pueden hacer.
4. **Proyección**: el final del acto III **enciende otra luz**. Es la llamada para la siguiente fase (otros mundos), sin
   prometer nada más.

---

## 2. El árbol de un vistazo

```
                       ┌─────────────────────── TIERRA ───────────────────────┐
  Dragón muerto ──► La Señal ──► Bitácoras I–III ──► Receptor ──► Carta lunar (3 sitios)
                                        │
                                        └─► Plataforma ──► V1 Centella ──► V2 Baliza ──► V3 SELENE I
                                                            (sólido)       (órbita)        (aterrizaje)
   End: chorus ───────────────────────────► propelente denso (etapa 1)
   End: shulker, ojo, aliento ────────────► cabina, guía, motores Ícaro
   End: perlas de ender ──────────────────► encendido del reactor (Luna)

                       ┌──────────────────────── LUNA ────────────────────────┐
  L0 Desembarco   kit de la Tierra ──► refugio + energía + aire ──► sobrevivir la 1ª noche
        │
  L1 Regolito     Excavadora ─► Reactor de regolito fundido ─► O, Si, Al, Ca ─► Laminadora ─► cable, placa, tubo
        │                                                                   └► Horno de vidrio / de ladrillo
  L2 Circuitos    circuito lunar ─► celda ─► PANEL · BATERÍA · motor eléctrico ─► replicas tus máquinas
        │           (hierro del MAR ◄── regolito oscuro)                      └► límite de calor (60 kW) ► pide RADIADOR
  L3 Hielo        Perforadora ─► Destiladora ─► agua + CARBONO + NITRÓGENO ─► electrólisis (O, H)
        │            polímero (C+H) ─► sello, válvula, botella │ amoníaco (N+H) ─► RADIADOR │ rover │ invernadero
        │            Licuefactor ─► propelente criogénico ─► BILLETE DE VUELTA
  L4 Titanio+He3  escoria ─► Refinería de Ti ─► placa/viga ─► circuito avanzado ─► Calentador de volátiles ─► He3
        │            REACTOR DE HELIO-3 (2 MW)  ◄── perlas de ender (importadas)
  L5 Astillero    motor Fénix (sustituye al Ícaro) ─► rampa de lanzamiento lunar ─► nave lunar reutilizable
        │
  L6 El Arco      tramos del lanzador ─► condensadores ─► cápsulas ─► DEPÓSITO ORBITAL ─► segunda señal
```

Y la misma cadena vista como **necesidades** (lo que duele → lo que lo resuelve):

| Lo que falta | Cuando se nota | Qué lo resuelve | Y abre |
| --- | --- | --- | --- |
| Aire | Primera hora | Reactor de regolito fundido (oxígeno del suelo) | Vivir sin botellas |
| Energía de noche | Primera noche | Baterías (calcio + silicio) | Producción de 24 h |
| Metal | L1 | Laminadora | Todo lo demás |
| Hierro | L2 | Regolito oscuro (mares) | Motores y bobinas |
| Disipar calor | Al pasar de 60 kW | Radiadores (necesitan amoníaco) | **Obliga a ir al hielo** |
| Carbono y nitrógeno | L3 | Hielo sucio destilado | Polímeros, sellos, radiadores |
| Volver a casa | L3 | Licuefactor con agua del hielo | Billete de vuelta |
| Más potencia | L4 | Reactor de helio-3 | Titanio, lanzador |
| Independizarse de los motores de la Tierra | L5 | Motor Fénix | Nave reutilizable |
| Llevar carga a órbita sin gastar cohete | L6 | Lanzador electromagnético | Depósito orbital |

---

## 3. La Tierra: del Dragón al cohete

Requisitos de entrada: **dragón muerto** y haber entrado en **una ciudad del End** (concha de shulker, Bitácoras). **No hace
falta volver al Nether ni matar al Wither**: todo lo que el programa pide es del mundo normal o del End.

### 3.1 Qué aporta cada cosa (y por qué)

| Viene de | Objeto | Se usa en | Por qué ahí |
| --- | --- | --- | --- |
| End | Fruta de chorus | Propelente denso | Es la planta de combustible de los Vigías: crece sola en el End y se cultiva |
| End | Concha de shulker | Cabina presurizada y **tobera del motor Ícaro** | Es un casco de escolta: ligero y aguanta el calor |
| End | Ojo de ender | Unidad de guía | Es una brújula de travesía |
| End (dragón) | Aliento de dragón | Encendedor del motor Ícaro | Es la chispa que enciende hidrógeno y oxígeno |
| End | Vara de End, chorus, amatista | Receptor de la Señal | Antena, sintonía y cristal |
| End | Perla de ender | **Reactor de helio-3** (Luna, 16 por reactor) | El «salto» que enciende la fusión: es lo que les permitía cruzar el Vacío |
| Mundo normal | Acero, cobre, redstone, cristal | Estructura, circuitos | El cristal es sílice: hace de silicio en la Tierra |

### 3.2 Los pasos

| Paso | Qué haces | Qué cuesta (en bruto) | Qué abre |
| --- | --- | --- | --- |
| **T1** La Señal | Leer las Bitácoras I–III | Ir al End | Recetas del Receptor y de la Plataforma |
| **T2** Receptor | Construirlo y ponerlo a la vista de la Luna | 4 vara de End, 2 chorus, 3 amatista, 10 cobre, 2 redstone, 1 cristal | La **Carta lunar**: tres sitios de aterrizaje (5.1) |
| **T3** Plataforma | Multibloque con foso de llamas, torre y sala de control | 120 obsidiana, 60 hierro, 60 carbón, 32 cobre, 8 redstone, 10 cristal | Poder montar cohetes |
| **T4** Vuelo 1: **Centella** | Sonda sin tripulantes, una etapa, propelente denso. Sube y vuelve con paracaídas. Trae el **registrador de vuelo** | 23 hierro, 18 carbón, 11 cobre, 8 redstone, 3 cristal, 1 ojo de ender, 2 oro, 1 fruta de chorus | Recetas del motor Ícaro, los tanques criogénicos y el propelente criogénico |
| **T5** Vuelo 2: **Baliza** | Satélite de 27,6 tj a **órbita**. Trae otro registrador | 43 hierro, 44 carbón, 26 cobre, 19 redstone, 16 cristal, 1 concha de shulker, 1 aliento de dragón, 6 lana, 2 slime, 1 ojo de ender, 5 fruta de chorus, 10 cubos de agua | La dimensión **Órbita**, el **mapa estelar** y el radar de la Luna (revela el terreno de los tres sitios) |
| **T6** Vuelo 3: **Selene I** | Aterrizaje con tripulación (4 asientos) | Ver 4.3 | Estar en la Luna |

La Centella y la Baliza son baratas a propósito: **enseñan las reglas** (propelente, etapas, órbita) con poco riesgo antes de la
misión grande. Y cada una es una entrega que abre lo siguiente, igual que un hito.

### 3.3 Lo que se hace con fuego, no con electricidad

En la Tierra las máquinas (alto horno, horno de propelente, electrolizador de horno) **queman carbón**, como los hornos de
siempre. La electricidad con red, baterías y paneles **nace en la Luna**: es un cambio de era en el juego y el primer paso
del acto II.

---

## 4. Cómo se calcula el viaje

### 4.1 Tramos y Δv

Δv es «cuánto hay que acelerar». Son los valores reales redondeados, y son lo que la cabina muestra al piloto.

| Tramo | Δv (km/s) |
| --- | --- |
| Superficie de la Tierra → órbita baja | 9,4 |
| Órbita → transferencia a la Luna | 3,1 |
| Frenar en la Luna y aterrizar | 2,8 |
| Despegar de la Luna → órbita lunar | 1,9 |
| Órbita lunar → volver a la Tierra | 1,0 |
| Reentrada | 0 (escudo térmico) |

Ida y aterrizaje: **15,3**. Vuelta: **2,9**. La vuelta cuesta **cinco veces menos**, y ése es todo el argumento de la fábrica
lunar (4.4).

### 4.2 La ecuación

`Δv = ve · ln(m₀ / m_f)`. Con `ve` la velocidad de escape del motor y `m₀/m_f` la masa con y sin propelente.

| Motor | Propelente | ve (km/s) | Empuje | Masa | Cuesta |
| --- | --- | --- | --- | --- | --- |
| **Cerbero** (denso) | Propelente denso (chorus + carbón) | 3,3 | 1 200 kN | 1,0 tj | 8 acero, 3 cobre, 2 circuito, 2 válvula |
| **Ícaro** (criogénico) | Hidrógeno + oxígeno | 4,4 | 400 kN | 0,7 tj | 6 acero, 1 concha de shulker, 3 circuito, 2 válvula, 1 aliento de dragón |
| **Fénix** (lunar, L5) | Hidrógeno + oxígeno | 4,4 | 400 kN | 0,7 tj | Sólo materiales de la Luna (5.6) |

Tanques: el **denso** (bloque de 3×3×3) guarda **27 tj** y su casco pesa el 6 % de lo que guarda. El **criogénico** (3×3×3)
guarda **8 tj** (es menos denso) y pesa el 7 %.

### 4.3 Selene I (el aterrizaje con tripulación)

Se calcula **de la Luna hacia atrás**: primero lo que llega, y cada etapa carga con la siguiente.

| Etapa | Qué hace | Δv | Motores | Propelente | Tanques | Masa al empezar |
| --- | --- | --- | --- | --- | --- | --- |
| **Ascenso** (viaja vacía y se llena en la Luna) | Despegar y volver | 1,9 + 1,0 | 1 Ícaro | 4,2 tj | 1 | 8,7 tj |
| **Lunar** | Transferencia y aterrizaje | 3,1 + 2,8 | 1 Ícaro | 28,8 tj | 4 | 39,0 tj |
| **Etapa 2** | A la órbita | 6,5 | 5 Ícaro | 188,4 tj | 24 | 244,1 tj |
| **Etapa 1** | Sale de la Tierra | 2,9 | 8 Cerbero | 387,7 tj | 15 | **663,1 tj** |

Lo que se posa en la Luna: **10,2 tj** = la etapa de ascenso vacía con la cabina y las muestras (4,5 tj) + el kit (3 tj) + la etapa lunar ya seca (2,7 tj).

**Coste en bruto de Selene I** (la estructura y el propelente; el kit va aparte):

| Recurso | Cantidad | Recurso | Cantidad |
| --- | --- | --- | --- |
| Hierro | 482 | Concha de shulker | 9 |
| Carbón | 680 | Aliento de dragón | 7 |
| Cobre | 142 | Fruta de chorus | 129 |
| Redstone | 118 | Lana | 87 |
| Cristal | 25 | Slime | 29 |
| Ojo de ender | 1 | Cubos de agua | 217 |
| Obsidiana / ladrillo / oro | 4 / 8 / 2 | | |

**Kit de aterrizaje** (3 tj): hábitat, Terminal, 6 paneles, 8 baterías, 5 máquinas de la Tierra y 4 botellas. En bruto: 130
hierro, 74 carbón, 98 cobre, 92 redstone, 59 cristal, 4 oro.

### 4.4 Por qué la fábrica lunar no es opcional

**663 tj para dejar 10 tj**: cada tonelada que aterrizas cuesta **~65 de cohete**. Es la ecuación, no una decisión de diseño.

- **Llevar el combustible de vuelta desde la Tierra** (4,2 tj más en la Luna) añadiría ~**273 tj** al cohete.
- **Fabricarlo allí** cuesta ~**2 100 de hielo sucio** (1 886 de agua: 4,2 tj × 450), unos **35 min de 3 perforadoras**, y luego
  sólo electricidad.

El jugador **ve** esta cuenta en la cabina («+1 tj de carga: +65 tj de cohete») antes de despegar. No hace falta explicarla: se
entiende sola.

### 4.5 Cómo se vive el vuelo

1. **Montaje**: se construye el cohete con bloques (tanques, motores, cabina) sobre la Plataforma. La cabina calcula Δv, empuje
   y masa; avisa si el empuje/peso es menor de 1,3 al despegar (etapa 1), menor de 0,8 (etapa 2).
2. **Combustible**: se llena desde el Terminal de la plataforma (denso y criogénico).
3. **Cuenta atrás de 10 s**, humo, temblor y sonido a distancia. Se ve subir desde el mundo normal.
4. **Separación de etapas** con una tecla; el cielo se oscurece y salen las estrellas.
5. **Órbita**: dimensión vacía y silenciosa. Desde aquí se elige la **transferencia** en el mapa estelar.
6. **Aterrizaje manual** en el sitio elegido: en la Luna la gravedad es 1/6 y no hay aire, así que se frena sólo con motor.
   Un aterrizaje duro daña la nave y a ti.

---

## 5. La Luna por fases

Cada fase es un tramo del árbol de la sección 2. **Horas** = estimación de diseño para validar jugando.

### 5.1 L0 · Desembarco (0,5–1 h)

**Sitios de aterrizaje** (los revela la Baliza):

| Sitio | Qué tiene cerca | Qué falta | Para quién |
| --- | --- | --- | --- |
| **Borde del Mar** | Regolito claro y oscuro (hierro y titanio), a 300 bloques | Hielo a ~1 500 bloques | El recomendado |
| **Polo Sur** | Cráteres de hielo a 200 bloques | Sin hierro ni titanio: casi todo lo tienes que importar | Difícil |
| **Altiplano** | Sólo regolito claro (aluminio, silicio) | Sin hierro ni hielo cerca | Experto |

**Qué llevas** (el kit, 3 tj): módulo hábitat (con esclusa y un depósito de 12 000 uO), Terminal de Base, 6 paneles, 8 baterías,
5 máquinas de la Tierra (Excavadora ×2, Reactor de regolito fundido, Laminadora, Ensambladora) y 4 botellas.

**La primera noche** (el primer puzle, de verdad): los 8 baterías guardan **48 000 ue** y sólo sostienen **40 kW** toda la noche
(1 200 s). Las cargas son: soporte vital 10 kW, Terminal 2 kW, Reactor de regolito 30 kW, dos Excavadoras 16 kW, Laminadora 6
kW = **64 kW**. No llega: hay que **apagar cosas de noche**. Es la primera lección de energía y no hace falta un texto para
explicarla.

### 5.2 L1 · Regolito (1–1,5 h)

**Necesidad**: dejar de picar a mano.

- **Excavadora** (8 kW): 30 regolito/min.
- **Reactor de regolito fundido** (30 kW): 20 regolito claro → **20 uO + 4 Si + 3 Al + 3 Ca** en 20 s. Es la **fuente de
  aire** (1 uO/s: sostiene a **dos** jugadores) y del metal.
- **Laminadora**: aluminio → cable, placa, tubo.
- **Horno de vidrio y de sinterizado**: vidrio y ladrillo de regolito (que sirve de **blindaje**).

| Hito | Se entrega | Abre |
| --- | --- | --- |
| **H1 Suelo** | 100 regolito claro (a mano) | vidrio, ladrillo, cable, placa, tubo |
| **H2 Metal** | 60 Al, 40 Si, 20 vidrio | circuito lunar, celda, **panel**, **batería**, Laminadora |

### 5.3 L2 · Circuitos y energía propia (2–3 h)

**Necesidad**: no depender del kit y sobrevivir la noche sin apagar nada.

- **Circuito lunar** (2 Si + 1 vidrio + 2 cable): **sin redstone ni cobre**, sólo lo que hay aquí.
- **Panel** (20 kW de día) y **batería** (6 000 ue).
- **Hierro**: sólo sale del regolito **oscuro** de los mares. Hay que ir (a ~300 bloques): el primer viaje.
- **Motor eléctrico** (6 cable + 2 placa + 2 hierro) y con él **replicas máquinas**.

| Hito | Se entrega | Debe estar funcionando | Abre |
| --- | --- | --- | --- |
| **H3 El mar** | 30 hierro lunar | 6 paneles + 8 baterías fabricados aquí | motor, bobina, Excavadora, Reactor de regolito, Ensambladora |
| **H4 Autonomía** | 100 Al, 60 Si | 2 Excavadoras, 1 Reactor de regolito, **12 paneles + 24 baterías** (~114 kW continuos) | Perforadora de hielo, fibra de basalto |

> **Regla de la energía.** Con un rendimiento del 90 %, **1 panel + 2 baterías = 9,5 kW continuos** (de día y de noche).
> Para 128 kW hacen falta **14 paneles y 26 baterías** (~1 526 regolito de paneles + 1 300 de baterías).

**Lo que duele al final de L2** (lo que empuja a L3): con todo en marcha la base gasta ~121 kW y **el calor supera los 60 kW
que disipa el hábitat**. Los radiadores lo arreglan, pero los radiadores llevan **amoníaco** (nitrógeno + hidrógeno), y el
nitrógeno sólo está **en el hielo**. Ése es el empujón a la primera expedición: no hay un texto que te mande, hay una
máquina que se apaga.

### 5.4 L3 · Hielo y volátiles (3–4 h)

**Necesidad**: calor, carbono, agua, billete de vuelta.

**La primera expedición es a pie** (y con dos botellas): el hielo está a ~1 500 bloques y todavía no hay rover porque el rover
lleva sellos, y los sellos llevan polímero, y el polímero lleva carbono, y el carbono está en el hielo. **La primera carga de
hielo se trae en la mochila** (unos 300, cinco pilas). Es la bootstrap del árbol.

- **Perforadora de hielo** (20 kW): 20 hielo sucio/min.
- **Destiladora criogénica** (40 kW): 100 hielo sucio → **90 agua + 6 carbono + 4 nitrógeno** en 60 s.
- **Electrolizador** (25 kW): 9 agua → 8 uO + 1 uH.
- **Planta química**: **polímero** (1 C + 2 H → 3), **amoníaco** (1 N + 3 H → 1).
- **Radiador**: 6 placa + 4 tubo + 5 amoníaco, disipa **50 kW**.
- **Rover** y **botella de oxígeno** (600 uO = 20 min), **invernadero**, **traje Mk2**, **Licuefactor criogénico**.

| Hito | Se entrega | Debe estar funcionando | Abre |
| --- | --- | --- | --- |
| **H5 Hielo** | 300 hielo sucio | 1 Perforadora | Destiladora, Electrolizador, Planta química, polímero, amoníaco, sello, válvula, botella, radiador, rueda, **rover** |
| **H6 Vida** | 100 polímero, 20 amoníaco | 1 rover, 4 radiadores, 3 botellas | **Licuefactor**, depósito criogénico, traje Mk2, invernadero |

**El billete de vuelta** llega aquí. La etapa de ascenso necesita **4,2 tj** de propelente criogénico: **1 886 de agua** (2 100
de hielo sucio). Con 3 perforadoras, ~35 min; y **84 s** de licuefactor. **Desde este punto se puede volver a casa** (y traer más
cosas), pero el árbol sigue empujando a quedarse.

**Reservas de hielo** (finitas: es lo único que no se regenera):

| Cráter | Hielo sucio |
| --- | --- |
| Pequeño | 20 000 |
| Mediano | 40 000 |
| Grande | 80 000 |

Sólo el árbol hasta H11 gasta ~**14 000**; el propelente para el final de fase, mucho más (8.3). El hielo **manda la geografía**.

### 5.5 L4 · Titanio y helio-3 (3–4 h)

**Necesidad**: más potencia y materiales más fuertes que el aluminio.

- **Refinería de titanio**: escoria de ilmenita (sale del regolito oscuro: 20 → 4 escoria + 4 Fe + 12 uO) + 4 uO → 3 Ti.
- **Circuito avanzado** (2 circuito + 1 Ti + 1 polímero + 1 Ca).
- **Calentador de volátiles** (60 kW): 60 regolito oscuro → **1 He3 + 6 H** en 30 s.
- **Reactor de helio-3** (**2 000 kW**, calor 30 % = 600 kW = 12 radiadores; 1 He3 = 960 MJ, uno cada 8 min): 24 placa Ti, 12 viga Ti, 12 tubo,
  6 circuito avanzado, 12 radiador, 8 bobina y **16 perlas de ender**.

| Hito | Se entrega | Debe estar funcionando | Abre |
| --- | --- | --- | --- |
| **H7 Escoria** | 80 escoria, 40 hierro | — | Refinería de Ti, placa, viga |
| **H8 Helio** | 24 Ti, 4 bobinas | Refinería de Ti | Calentador de volátiles, circuito avanzado, depósito (Ti), condensador |
| **H9 Fusión** | 6 He3, 6 circuito avanzado, 12 radiadores | Calentador de volátiles | **Reactor de helio-3** |

Un reactor da lo que **100 paneles** (sin noche, sin baterías): es la primera vez que la energía deja de ser un cuello de
botella. Por eso **cuesta 16 perlas de ender** (renovables: una granja de endermen las da): es el «salto» de los Vigías y mantiene un hilo con el End.

### 5.6 L5 · Astillero (4–6 h)

**Necesidad**: irse de la Tierra de verdad (que no haga falta el motor importado).

- **Motor Fénix** (400 kN, 0,7 tj): 10 placa Ti, 4 viga Ti, 8 tubo, 4 circuito avanzado, 2 bobina. **Sin concha de shulker ni aliento
  de dragón**: es el sustituto lunar del Ícaro, con el mismo empuje y eficiencia.
- **Rampa de lanzamiento lunar**: 60 ladrillo de regolito, 20 placa Ti, 2 circuito avanzado.
- **Nave lunar reutilizable** (Selene II): sube y baja con propelente hecho allí.

| Hito | Se entrega | Debe estar funcionando | Abre |
| --- | --- | --- | --- |
| **H10 Astillero** | 40 placa Ti, 20 viga Ti | **2 reactores** | Motor Fénix, rampa lunar, tramo del lanzador |

### 5.7 L6 · El Arco (3–5 h para el primer disparo)

Ver la sección 8.

---

## 6. Sistemas con números

| Sistema | Regla |
| --- | --- |
| **Aire** | 0,5 uO/s por jugador. Botella: 600 uO (20 min). Depósito del hábitat: 12 000 uO (4 jugadores, 100 min). Llenar un volumen sellado: 0,2 uO por bloque. Un ciclo de esclusa gasta 15 uO. Un agujero de un bloque pierde 2 uO/s |
| **Energía** | 1 panel = 20 kW de día; 1 batería = 6 000 ue; rendimiento 90 %. **1 panel + 2 baterías = 9,5 kW continuos** |
| **Calor** | Cada máquina genera el 50 % de su potencia como calor (el reactor, el 30 %). El hábitat disipa 60 kW. **Cada radiador, 50 kW.** Sin disipar, la máquina se apaga |
| **Noche** | 20 min. Sin sol no hay panel: baterías o reactor |
| **Micrometeoritos** | Lluvia cada 15–25 min, dura 20–60 s, ~1 impacto/4 s en un área de 50×50. Rompen vidrio y cables expuestos. **2 capas de ladrillo de regolito** los paran |
| **Tormentas solares** | Aviso de 30 s (sonido de alarma en el Terminal), dura 90 s. Fuera de un refugio blindado (2 capas de ladrillo): daño de radiación de 1 corazón cada 5 s |
| **Regolito** | Infinito. Las excavadoras no agotan el suelo |
| **Hielo** | Finito por cráter (tabla de 5.4) |
| **Sonido** | En vacío no hay sonido: sólo lo que toca el traje o el suelo. Con radio (chat de voz) se habla a cualquier distancia |

---

## 7. La Tierra desaparece del árbol

Lo que se importa y lo que lo sustituye. **Al terminar L5, sólo queda una cosa.**

| Importado | Para qué | Se sustituye en | Por |
| --- | --- | --- | --- |
| Kit de aterrizaje | Empezar | L2 | Fabricación local |
| Cobre | Cables | L1 | Cable de aluminio |
| Redstone | Circuitos | L2 | Circuito lunar (silicio) |
| Carbón | Acero, propelente | L3 | Carbono del hielo (no hay acero: aluminio y titanio) |
| Aliento de dragón + concha de shulker | Motor Ícaro | L5 | Motor Fénix |
| Lana, slime | Aislantes | L3 | El vacío es el aislante; tanques de aluminio |
| **Perla de ender** | **Reactor de helio-3** | — | **Ninguno** (16 por reactor) |

Dieciséis perlas por reactor son un coste **pequeño pero recurrente** que **mantiene viva la conexión con la Tierra**: la
gente que se queda en la Luna necesita a quien vuelve. Es un pegamento social barato, y renovable (granja de endermen).

---

## 8. El final de la fase: el Arco y el depósito orbital

### 8.1 Qué es

Un **lanzador electromagnético** (mass driver): un carril de bobinas que acelera cápsulas de carga sin gastar propelente. Los
Vigías lo llamaron **el Arco** (Bitácora VI). Se construye sobre sus cimientos, que están **en las ruinas de la Estación
Selene**.

### 8.2 Diseño: energía frente a propelente

Para llegar a órbita lunar hacen falta **1,9 km/s**. El lanzador pone una parte y la **cápsula** pone el resto con su propio
motor y propelente hecho en la Luna. Es una decisión de diseño **del jugador**: pista larga y cara en energía, o pista corta y cara en
hielo.

| Velocidad del lanzador | Lo pone la cápsula | Energía por tj útil | Propelente por tj útil | Pista (a = 3 000 m/s²) |
| --- | --- | --- | --- | --- |
| 0,6 km/s | 1,3 km/s | 242 000 ue | 0,34 tj (155 agua) | 60 bloques |
| **1,2 km/s** | 0,7 km/s | **844 000 ue** | 0,17 tj (78 agua) | **240 bloques** |
| 1,9 km/s | 0 | 1 805 000 ue | 0 | 602 bloques |

La energía es `½mv²`; la pista, `v²/2a`. El tramo del lanzador mide 20 bloques.

### 8.3 Cuánto cuesta un depósito orbital

Objetivo de la fase: **300 tj de propelente en el depósito orbital**. Cada tj útil (a 1,2 km/s) necesita ~**586 de hielo
sucio** y **844 000 ue**. Por cada 1 tj/h que quieres exportar:

| Tamaño de fábrica | Exportas | Perforadoras | Electrolizadores | Destiladoras | Reactores | Tiempo para 300 tj | Hielo total |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Pequeña | 8 tj/h | 4 | 2 | 1 | 1 | 37,5 h | ~176 000 |
| Media | 24 tj/h | 12 | 4 | 3 | 3 | 12,5 h | ~176 000 |
| Grande | 48 tj/h | 24 | 8 | 5 | 6 | 6,3 h | ~176 000 |

Esto es lo Factorio: **una escala que tú eliges.** El cuello de botella no es el tiempo de juego, es cuánto has construido, y
el hielo total (**~176 000**: varios cráteres grandes) **fuerza a explorar** y a montar logística entre cráteres.

### 8.4 El primer disparo

**H11 Lanzador**: entregar **4 tramos** y **2 condensadores** (capacidad de un condensador: 50 000 ue) y tener **una rampa
lunar**. Con 4 tramos (80 bloques, a = 3 000 m/s²) el primer disparo sale a **0,69 km/s**: no llega a órbita, pero es la prueba.
Abre la **cápsula de carga**. El resto es ampliar.

Al **primer disparo con cápsula**, la Luna enciende la **segunda señal** (1.4).

---

## 9. El libro de recetas

### 9.1 Tierra

| Dónde | Entra | Sale | Tiempo |
| --- | --- | --- | --- |
| Mesa de ensamblaje | 4 vara de End + 2 fruta de chorus + 3 fragmento de amatista + 8 cobre + 2 circuito de redstone | 1 Receptor de la Señal | 10 s |
| Mesa de ensamblaje | 120 obsidiana + 60 acero + 8 circuito de redstone + 24 cobre + 6 cristal | 1 Plataforma de lanzamiento | 30 s |
| Alto horno | 1 hierro + 1 carbón | 1 acero | 10 s |
| Mesa | 2 cobre + 2 redstone + 1 cristal | 2 circuito de redstone | 5 s |
| Mesa | 2 hierro + 1 cobre + 1 redstone | 1 válvula | 5 s |
| Mesa | 3 lana + 1 slime | 2 aislante | 5 s |
| Horno | 1 obsidiana + 2 ladrillo | 2 losa térmica | 5 s |
| Mesa | 3 circuito de redstone + 1 ojo de ender + 2 oro | 1 unidad de guía | 5 s |
| Horno de propelente | 1 fruta de chorus + 1 carbón | 3 tj de propelente denso | 10 s |
| Electrolizador de horno | 1 cubo de agua + 1 carbón | 1 tj de propelente criogénico | 10 s |
| Mesa de ensamblaje | 9 acero + 1 válvula | 1 tanque denso | 5 s |
| Mesa de ensamblaje | 3 acero + 1 válvula + 2 aislante | 1 tanque criogénico | 5 s |
| Mesa de ensamblaje | 8 acero + 3 cobre + 2 circuito de redstone + 2 válvula | 1 motor Cerbero | 5 s |
| Mesa de ensamblaje | 6 acero + 1 concha de shulker + 3 circuito de redstone + 2 válvula + 1 aliento de dragón | 1 motor Ícaro | 5 s |
| Mesa de ensamblaje | 2 concha de shulker + 6 acero + 3 cristal + 8 losa térmica + 1 unidad de guía + 4 circuito de redstone | 1 cabina Ícaro-C | 5 s |
| Mesa de ensamblaje | 20 acero + 12 cristal + 6 válvula + 2 losa térmica + 4 circuito de redstone | 1 módulo hábitat | 10 s |
| Mesa de ensamblaje | 4 acero + 6 circuito de redstone + 4 oro + 2 cristal | 1 Terminal de Base | 10 s |
| Mesa | 5 cristal + 2 cobre | 1 panel de cristal | 5 s |
| Mesa | 3 hierro + 2 cobre + 4 redstone | 1 batería de redstone | 5 s |
| Mesa de ensamblaje | 10 acero + 6 cobre + 4 circuito de redstone + 4 redstone | 1 máquina de la Tierra | 10 s |
| Mesa | 3 hierro + 1 válvula | 1 botella de la Tierra | 5 s |

### 9.2 Luna

| Máquina | Entra | Sale | Tiempo | Potencia |
| --- | --- | --- | --- | --- |
| Excavadora | — | 5 regolito claro | 10 s | 8 kW |
| Excavadora | — | 5 regolito oscuro | 10 s | 8 kW |
| Perforadora de hielo | — | 5 hielo sucio | 15 s | 20 kW |
| Reactor de regolito fundido | 20 regolito claro | 20 oxígeno (uO) + 4 silicio + 3 aluminio + 3 calcio | 20 s | 30 kW |
| Reactor de regolito fundido | 20 regolito oscuro | 12 oxígeno (uO) + 4 hierro lunar + 4 escoria de ilmenita | 20 s | 30 kW |
| Refinería de titanio | 4 escoria de ilmenita + 4 oxígeno (uO) | 3 titanio | 30 s | 45 kW |
| Calentador de volátiles | 60 regolito oscuro | 1 helio-3 + 6 hidrógeno (uH) | 30 s | 60 kW |
| Destiladora criogénica | 100 hielo sucio | 90 agua + 6 carbono + 4 nitrógeno | 60 s | 40 kW |
| Electrolizador | 9 agua | 8 oxígeno (uO) + 1 hidrógeno (uH) | 10 s | 25 kW |
| Planta química | 1 nitrógeno + 3 hidrógeno (uH) | 1 amoníaco | 10 s | 15 kW |
| Planta química | 1 carbono + 2 hidrógeno (uH) | 3 polímero | 10 s | 20 kW |
| Horno de vidrio | 4 regolito claro | 1 vidrio lunar | 8 s | 15 kW |
| Horno de sinterizado | 4 regolito claro | 1 ladrillo de regolito | 10 s | 12 kW |
| Horno de fibra | 6 regolito oscuro | 2 fibra de basalto | 10 s | 15 kW |
| Licuefactor criogénico | 400 oxígeno (uO) + 50 hidrógeno (uH) | 1 tj de propelente criogénico | 20 s | 80 kW |
| Laminadora | 1 aluminio | 2 cable de aluminio | 2 s | 6 kW |
| Laminadora | 1 aluminio | 1 placa de aluminio | 3 s | 6 kW |
| Laminadora | 1 aluminio | 1 tubo de aluminio | 3 s | 6 kW |
| Laminadora | 1 titanio | 1 placa de titanio | 4 s | 8 kW |
| Laminadora | 2 titanio | 1 viga de titanio | 6 s | 8 kW |
| Ensambladora | 2 silicio + 1 vidrio lunar + 2 cable de aluminio | 1 circuito lunar | 10 s | 12 kW |
| Ensambladora | 2 circuito lunar + 1 titanio + 1 polímero + 1 calcio | 1 circuito avanzado | 20 s | 20 kW |
| Ensambladora | 3 silicio + 1 cable de aluminio + 1 vidrio lunar | 1 celda solar | 10 s | 12 kW |
| Ensambladora | 4 celda solar + 2 placa de aluminio + 2 cable de aluminio | 1 panel solar | 15 s | 12 kW |
| Ensambladora | 3 placa de aluminio + 2 calcio + 2 silicio + 2 cable de aluminio | 1 batería | 15 s | 12 kW |
| Ensambladora | 6 cable de aluminio + 2 placa de aluminio + 2 hierro lunar | 1 motor eléctrico | 12 s | 12 kW |
| Ensambladora | 10 cable de aluminio + 4 hierro lunar | 1 bobina | 12 s | 12 kW |
| Ensambladora | 3 polímero + 1 placa de aluminio | 2 sello | 6 s | 10 kW |
| Ensambladora | 1 placa de aluminio + 1 polímero | 1 válvula lunar | 5 s | 10 kW |
| Ensambladora | 2 placa de aluminio + 1 válvula lunar | 1 botella de oxígeno | 8 s | 10 kW |
| Ensambladora | 6 placa de aluminio + 4 tubo de aluminio + 5 amoníaco | 1 radiador | 15 s | 10 kW |
| Ensambladora | 6 cable de aluminio + 2 placa de aluminio | 1 rueda de malla | 8 s | 10 kW |
| Ensambladora | 6 placa de titanio + 4 calcio + 8 cable de aluminio + 1 circuito avanzado | 1 condensador de pulso | 20 s | 20 kW |
| Ensambladora | 8 placa de aluminio + 1 motor eléctrico + 1 circuito lunar | 1 Excavadora | 20 s | 12 kW |
| Ensambladora | 8 placa de aluminio + 2 motor eléctrico + 2 circuito lunar | 1 Laminadora | 20 s | 12 kW |
| Ensambladora | 10 placa de aluminio + 3 motor eléctrico + 4 circuito lunar + 2 tubo de aluminio | 1 Ensambladora | 30 s | 12 kW |
| Ensambladora | 15 placa de aluminio + 10 ladrillo de regolito + 6 tubo de aluminio + 4 circuito lunar + 2 motor eléctrico | 1 Reactor de regolito fundido | 30 s | 12 kW |
| Ensambladora | 14 placa de aluminio + 4 motor eléctrico + 3 circuito lunar | 1 Perforadora de hielo | 30 s | 12 kW |
| Ensambladora | 12 placa de aluminio + 10 tubo de aluminio + 4 circuito lunar + 2 motor eléctrico + 1 radiador | 1 Destiladora criogénica | 30 s | 12 kW |
| Ensambladora | 8 placa de aluminio + 6 tubo de aluminio + 3 circuito lunar + 2 sello | 1 Electrolizador | 30 s | 12 kW |
| Ensambladora | 10 placa de aluminio + 8 tubo de aluminio + 4 circuito lunar + 2 sello | 1 Planta química | 30 s | 12 kW |
| Ensambladora | 12 placa de aluminio + 12 ladrillo de regolito + 8 tubo de aluminio + 6 circuito lunar + 2 motor eléctrico | 1 Refinería de titanio | 30 s | 12 kW |
| Ensambladora | 10 placa de titanio + 8 ladrillo de regolito + 8 tubo de aluminio + 4 circuito lunar + 2 motor eléctrico | 1 Calentador de volátiles | 30 s | 12 kW |
| Ensambladora | 14 placa de aluminio + 14 tubo de aluminio + 4 motor eléctrico + 6 circuito lunar + 4 radiador | 1 Licuefactor criogénico | 40 s | 12 kW |
| Ensambladora | 24 placa de titanio + 12 viga de titanio + 12 tubo de aluminio + 6 circuito avanzado + 12 radiador + 8 bobina + 16 perla de ender | 1 Reactor de helio-3 | 60 s | 12 kW |
| Ensambladora | 4 motor eléctrico + 2 batería + 16 placa de aluminio + 4 rueda de malla + 2 circuito lunar + 1 sello | 1 rover | 30 s | 12 kW |
| Ensambladora | 20 placa de aluminio + 8 tubo de aluminio + 2 sello | 1 depósito criogénico (Al) | 30 s | 12 kW |
| Ensambladora | 4 viga de titanio + 12 placa de titanio + 2 sello | 1 depósito criogénico (Ti) | 30 s | 12 kW |
| Ensambladora | 30 fibra de basalto + 12 polímero + 8 placa de aluminio + 2 circuito lunar + 1 botella de oxígeno | 1 traje espacial Mk2 | 30 s | 12 kW |
| Ensambladora | 40 vidrio lunar + 20 placa de aluminio + 8 sello + 2 circuito lunar | 1 invernadero | 60 s | 12 kW |
| Ensambladora | 8 bobina + 4 viga de titanio + 1 circuito avanzado | 1 tramo del lanzador | 30 s | 12 kW |
| Ensambladora | 10 placa de titanio + 4 viga de titanio + 8 tubo de aluminio + 4 circuito avanzado + 2 bobina | 1 motor Fénix | 40 s | 12 kW |
| Ensambladora | 8 placa de titanio + 2 viga de titanio + 2 sello + 1 circuito avanzado | 1 cápsula de carga | 30 s | 12 kW |
| Ensambladora | 60 ladrillo de regolito + 20 placa de titanio + 2 circuito avanzado | 1 rampa de lanzamiento lunar | 60 s | 12 kW |


---

## 10. Costes en bruto de lo importante

Todo en **regolito claro (RC), regolito oscuro (RO) y hielo sucio (HS)**. «Min-máq» es el tiempo de máquina sin contar el
transporte.

| Objeto | Coste en bruto | Min-máq |
| --- | --- | --- |
| Panel solar | 109 RC | 3 |
| Batería | 50 RC | 1 |
| Excavadora | 107 RC + 10 RO | 3 |
| Reactor de regolito fundido | 329 RC + 20 RO | 10 |
| Ensambladora | 263 RC + 30 RO | 8 |
| Rover | 518 RC + 40 RO + 18 HS | 15 |
| Radiador | 67 RC + 275 HS | 8 |
| Licuefactor | 711 RC + 40 RO + 1 100 HS | 45 |
| **Reactor de helio-3** | **1 507 RC + 520 RO + 3 373 HS + 16 perlas** | **139** |
| Tramo del lanzador | 327 RC + 220 RO + 12 HS | 16 |
| Rampa lunar | 365 RC + 147 RO + 24 HS | 23 |

**Coste de cada hito** (entregas + lo que debe estar funcionando, en bruto):

| Hito | Coste | Min-máq |
| --- | --- | --- |
| H1 | 100 RC | 0 |
| H2 | 680 RC | 13 |
| H3 | 1 056 RC + 150 RO | 32 |
| H4 | 4 023 RC + 40 RO | 102 |
| H5 | 300 HS + 289 RC + 40 RO | 9 |
| H6 | 845 RC + 40 RO + 3 477 HS | 103 |
| H7 | 600 RO | 10 |
| H8 | 537 RC + 260 RO | 24 |
| H9 | 1 344 RC + 487 RO + 3 373 HS | 123 |
| H10 | 3 120 RC + 1 573 RO + 6 747 HS + 32 perlas | 307 |
| H11 | 1 893 RC + 1 120 RO + 98 HS | 97 |

Los dos saltos grandes son **H6** y **H9**–**H10**: los dos **empujan al hielo**. Es el equivalente del salto de los paquetes
azules en Factorio: la fase en la que deja de ser «monto una cinta» y pasa a ser «monto un sistema».

---

## 11. Comprobaciones que ya pasan

`node tools/luna-tablas.mjs`:

- **Sin huérfanos**: cada objeto que se fabrica lo usa otro (o es un objeto final: máquina, panel, propelente…).
- **Sin ciclos**: ningún objeto necesita, directa o indirectamente, a sí mismo.
- **Todo tiene origen**: cada ingrediente es materia prima de la Tierra, de la Luna, o se fabrica.
- **Cada receta lunar se abre en un solo hito**, y **lo que un hito pide se puede fabricar con recetas abiertas antes**. Esta
  comprobación cazó tres errores del primer borrador (un hito que pedía el rover antes de abrirlo, un ciclo en el último hito
  y el hidrógeno tomando el camino equivocado); los tres están corregidos.

Lo que **no** comprueba (queda para jugar): el ritmo (las horas de cada fase), el equilibrio de las reservas de hielo, y
cuánto pesa en la práctica la logística a mano entre cráteres.

---

## 12. Encaje en el código

Sigue las reglas del proyecto: **ids guardados sólo al final**, **sin compatibilidad con mundos viejos**, **dimensiones como
registro**.

| Qué | Dónde | Notas |
| --- | --- | --- |
| Dimensiones `orbita` y `luna` | `src/shared/dimensions.ts` (ids 3 y 4) | Ya existen `gravity`, `breathable`, `sky`, `skybox`, `weather`, `beds`, `respawn` |
| Campos nuevos de dimensión | `dimensions.ts` | `dayLength` (Luna: 2 400 s), `temperature`, `radiation` |
| Cielo lunar con la Tierra y la Señal | `skybox` nuevo | La Señal es un punto sobre la textura de la Luna, visible en el mundo normal |
| Aire por volúmenes | Sistema nuevo | Versión 1: radio alrededor de un generador. Versión 2: espacio sellado |
| Traje y botella de oxígeno | `armor.ts` + barra de aire | Mismo sistema de armaduras |
| Máquinas | Sistema nuevo | Entidad de bloque con inventario, potencia y calor; **simulación por tasas** (ver `idea-industria.md`) |
| Red eléctrica | Sistema nuevo | Redes por cable con producción, consumo y baterías |
| Hitos y Terminal | Bloque + estado del mundo | Se guardan **por mundo** (comparten todos) y abren recetas |
| Recetas nuevas | `recipes.ts`, `recipeBook.ts` | Se muestran en el libro de recetas al abrirse |
| Cohete | Entidad + estructura de bloques | La cabina calcula Δv con las fórmulas del 4.2 |
| Viaje | `Multiverse.ts` | Una sola operación «llevar al jugador a la dimensión D en el punto P» (la usan portales y cohetes) |
| Bitácoras | `books.ts` + `endLoot.ts` | Siete títulos; tres primeros abren recetas |
| Ids de bloques/objetos | `blocks/`, `items.ts` | **Sólo se añaden al final** |

**Rendimiento**: las cintas van por caudales (no ítem a ítem); los objetos se dibujan sólo cerca del jugador; la fábrica sigue
produciendo con el chunk descargado por simulación de tasas.

---

## 13. Preguntas abiertas

1. **¿16 perlas de ender por reactor?** Es lo único que sigue viniendo de la Tierra (y del End). ¿Demasiado, poco, o mejor
   ninguna importación?
2. **¿El huevo del dragón?** Propongo que no se gaste: se coloca en el Receptor y **revela la ubicación de la Estación
   Selene**. Sin él el juego se completa igual.
3. **¿Hitos por mundo o por jugador?** Por mundo hace que cualquiera pueda aportar; por jugador respeta el ritmo de cada uno.
4. **¿Las ruinas dan atajos?** Ahora sólo dan lore y reliquias. Podrían abrir una receta suelta.
5. **¿Cuánto cuesta morir?** Al morir se reaparece en la Tierra (con `respawn: false`); ¿se pierde lo que llevabas en la
   Luna o se queda en una tumba?
6. **¿Masa del cohete?** La escala (663 tj, 65:1) es cómoda por el precio por tj, pero la Plataforma tiene que ser grande
   (15 tanques densos de 27 tj, 24 criogénicos de 8 tj y 13 motores). ¿Aceptamos esa altura?
7. **¿Selene II reutilizable o un módulo desechable?** Ahora es reutilizable.
8. **¿Qué es la segunda señal?** Está a propósito sin definir: es el hilo para la siguiente fase (otros mundos).
