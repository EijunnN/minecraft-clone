# Hoja de ruta del programa lunar

Leyenda: ✅ hecho y comprobado · 🟡 hecho pero sin comprobar del todo · ❌ falta. Estado a 2026-09-29. El diseño de fondo está en `idea.md`
(el viaje), `idea-industria.md` (la fábrica) e `idea-luna.md` (lore, árbol de recetas y números). Los números salen de `tools/luna-*.mjs`.

Comprobar mientras se trabaja: `npm run test:luna` (rápido). Antes de dar algo por terminado: `npm test` (todo el juego), porque la Luna
comparte ids de bloques y capas de textura con la Tierra.

---

## Fase 0 · Diseño ✅
- ✅ Idea del viaje, de la industria y del árbol (`idea*.md`).
- ✅ Calculadora del árbol: recetas, costes en bruto, cohete (Δv y masas), energía y aire. Comprueba huérfanos, ciclos y orden de los hitos.
- ✅ Lore: los Vigías, las siete Bitácoras, los tres actos, la Señal en la Luna (sólo el guion, no está en el juego).
- ✅ El programa sólo pide mundo normal y End.

## Fase 1 · El viaje ✅ (con partes pendientes)
- ✅ Dimensión Luna en el registro: un sexto de gravedad, sin aire, sin agua líquida (se evapora).
- ✅ Terreno lunar: tierras altas, mares, cráteres de tres tamaños, hielo sucio en los cráteres polares.
- ✅ Bloques: regolito claro y oscuro, roca lunar, hielo sucio. Pestaña propia en el creativo (Tierra / Luna).
- ✅ Cielo sin atmósfera: negro, estrellas, Sol duro, Tierra a la vista, sin nubes ni bruma; exposición compensada.
- ✅ Cohete Selene (prefabricado, 4 plazas, `/cohete`): subir, cuenta atrás, ascenso a ~61 km, tránsito, descenso frenando y posado.
- ✅ Vuelta a la Tierra en el mismo cohete, a la plataforma de salida. Varios jugadores.
- ✅ Cabina: marco, cuenta atrás, telemetría, fundido, llamas, humo, polvo, temblor y rugido de motores (el sonido sin oír en pruebas).
- ❌ Montaje por módulos (tanques, motores, cabina) con combustible y Δv reales (idea-luna §4).
- ❌ Plataforma de lanzamiento, Receptor de la Señal y los tres vuelos (Centella, Baliza, Selene I).
- ❌ La Señal en el cielo tras el Dragón y las Bitácoras en las ciudades del End.
- ❌ Órbita como lugar (dimensión), mapa estelar y elección de sitio de aterrizaje.
- ❌ Experiencia de vuelo al estilo Outer Wilds (pilotaje manual, órbitas, Δv). Ahora el vuelo lo guía el servidor y se puede sustituir.

## Fase 2 · Núcleo industrial 🟡 (en curso)
Es la base de todo el árbol de la Luna.
- ✅ Motor de cintas: dos carriles, separación, carga lateral, curvas, bucles; 15 / 30 / 45 objetos/s por nivel como Factorio.
- ✅ Cintas en el servidor: conexiones, forma (recta o curva), caída de objetos al romperse, sincronización con los clientes, guardado.
- ✅ Brazos (inserters): cofre → cinta → cofre sin perder nada, 0,83 objetos/s el básico; sólo cogen lo que lo de delante acepta.
- ✅ Cliente: objetos moviéndose por las cintas con el mismo motor, corregidos por el servidor; textura de la cinta deslizándose.
- ✅ Ajuste de texturas (2 niveles de cinta y chapa compartida) para no pasar el límite de 1 024 capas: comprobado (1 023 de 1 024; queda 1).
- ❌ Ver cintas y brazos en el navegador (formas, sentido de las flechas, brazos).
- ❌ Animación de los brazos y cinta exprés (esperan a más capas de textura).
- ❌ Repartir mejor los bits del vértice del terreno (el límite de capas frena todo lo que sigue).
- ✅ Energía como en Factorio (ver `FACTORIO-REFERENCIA.md`): postes pequeño (5×5, cable 7,5) y mediano (7×7, cable 9) con cable automático
  (los más cercanos, 5 como máximo, sin triángulos), cables dibujados y guardados, panel solar de 60 kW con el perfil de brillo de Factorio,
  acumulador de 5 MJ a 300 kW, satisfacción de la red y consumo de brazos (0,4 / 13,2 kW), hornos (180 kW) y extractores (90 kW). Sin contacto
  entre bloques. Poste grande y subestación (2×2), panel solar 3×3 y acumulador 2×2 hechos. Falta: indicador de «sin energía», caldera/vapor y
  demás generadores.
- ✅ Entidades de varias casillas (extractor 3×3, horno 3×3, panel 3×3, acumulador 2×2, poste grande y subestación 2×2): una familia de bloques con
  una casilla por parte; cada una dibuja su porción del modelo; colocar pone toda la huella y romper una quita la máquina entera; los brazos
  meten y sacan por cualquiera de sus casillas.
- 🟡 Máquinas con puertos y cola de entrada/salida: hecho el horno eléctrico (5 s por objeto a 12 kW, brazos entran y sacan por cualquier
  cara, suelta lo que tiene al romperse, guarda). Falta: receta elegida por el jugador, puertos por cara, estado visible y el resto de máquinas.
- ✅ Vista previa de colocación («fantasma»): caja translúcida verde o roja donde va a quedar, con la flecha del sentido en cintas y brazos; `R`
  los gira antes de ponerlos (el sentido fijado se manda al servidor). El fantasma es el modelo real del bloque, translúcido y con su
  orientación (tinte verde si cabe, rojo si no), como el de Factorio; muestra también el área del extractor y de los postes y los cables previstos. Comprobado en el navegador. Falta: área del extractor, arrastrar para
  poner cintas en fila con curvas automáticas.
- ✅ Energía, horno, cintas y brazos vistos en el navegador: se ven bien y la cadena cofre → brazo → horno → brazo → cofre funciona.
- ❌ Indicador de estado de máquinas y ventana del horno.
- ✅ Yacimientos y extractor (probado con `test:luna` y en el navegador: saca hierro al cofre de delante): veta de hierro lunar en los mares (2 capas, manchas de
  3–8 de radio, una fija junto al aterrizaje), reserva finita por bloque (120–279, media 200) que el extractor va gastando hasta dejar regolito;
  extractor eléctrico 1×1 (no 3×3) sobre la veta, área 5×5 y 3 de fondo, 0,5 objetos/s a 30 kW, suelta por delante a cinta/brazo/cofre/máquina,
  buche de 8; el fantasma enseña su área. Minar la veta a mano da 1 trozo y la pierde entera (lento y caro a propósito). Hielo sucio también se
  puede extraer. Falta: aluminio/titanio (sin capas de textura libres), extractor 3×3, resaltar las vetas cubiertas, panel de reservas.
- ✅ Brazos completos (5 tipos, filtros de 5 objetos, combustible, a granel, largo, suelo, animación) y divisores/subterráneas hechos. ❌ Almacenes con filtro.
- ❌ Fluidos y gases: tuberías con caudal, depósitos (agua, oxígeno, hidrógeno, propelente).
- ❌ Panel de producción (objetos por minuto) y planos (copiar diseños).
- ❌ Cálculo por tasas para que la fábrica siga produciendo con el chunk descargado.

## Fase 3 · Sobrevivir en la Luna ❌
- ❌ Traje espacial con botella de oxígeno y barra de oxígeno propia (ahora, en supervivencia, se acaba el aire en ~25 s fuera del cohete).
- ❌ Hábitat prefabricado, esclusas de aire, aire por volúmenes sellados y fugas.
- ❌ Frío, calor y noche larga (40 min de ciclo); radiadores y límite de calor por base.
- ❌ Micrometeoritos, tormentas solares y refugios blindados.
- ❌ Sonido en el vacío (sólo lo que toca el traje o el suelo) y radio por chat de voz.

## Fase 4 · El árbol de la Luna (L0 – L6) ❌
- ❌ Terminal de Base y hitos por entrega que abren recetas en el libro de recetas.
- ❌ L1 regolito: excavadora, reactor de regolito fundido, laminadora, vidrio, ladrillo.
- ❌ L2 circuitos y energía propia: paneles, baterías, motores, replicar máquinas; hierro en los mares.
- ❌ L3 hielo: perforadora, destiladora, electrólisis, polímero, amoníaco, radiador, rover, invernadero, licuefactor y billete de vuelta.
- ❌ L4 titanio y helio-3: refinería, calentador de volátiles, circuito avanzado, reactor (16 perlas de ender).
- ❌ L5 astillero: motor Fénix, rampa lunar, nave lunar reutilizable.
- ❌ L6 el Arco: lanzador de masa, condensadores, cápsulas, depósito orbital (300 tj).
- ❌ Vetas y reservas finitas de hielo por cráter; geografía de recursos (altas / mares / polos).

## Fase 5 · Historia ❌
- ❌ Estación Selene en ruinas, autómatas apagados, diarios en terminales y reliquias.
- ❌ El Arco en ruinas como cimiento del lanzador; la segunda señal al primer disparo.

## Fase 6 · Pulido y equilibrio ❌
- ❌ Jugarlo por horas y ajustar constantes (energía, calor, tiempos, reservas de hielo).
- ❌ Suavizar las paredes de los cráteres (salen como columnas finas).
- ❌ Rendimiento con fábricas grandes y varios jugadores.

---

## Siguiente paso recomendado
1. Comprobar el ajuste de texturas (`npm run test:luna`, luego `npm test`).
2. Ver cintas y brazos en el navegador.
3. Repartir los bits del vértice (desbloquea todo lo que necesita texturas).
4. Energía y máquinas con puertos, y con ellas la primera cadena real (excavadora → cinta → horno → brazo → almacén).


## Datos de Factorio (decisión: iguales a los del original)
Para no equivocar los cálculos, las recetas, tiempos, costes de investigación y árbol tecnológico son los de Factorio 2.0.72. Se extraen con
`node tools/factorio-extract.mjs` a `src/shared/factorio/` (recipes, technologies, items, names-es). El catálogo (`catalog.ts`) los pone sobre
objetos del juego (lingote de hierro = placa de hierro…). Hecho: ensambladoras 1–3, hornos, laboratorio, investigación, fabricación a mano.
Pendiente: fluidos y química, energía de vapor/nuclear, módulos y balizas (los objetos existen, no sus efectos), robots, circuitos, trenes.
