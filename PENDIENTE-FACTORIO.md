# Lo que falta para la Luna «estilo Factorio»

Estado a 2026-09-29, rama `factorio-style`. Las recetas, tiempos y tecnologías son las de Factorio 2.0.72 (`tools/factorio-extract.mjs`).
Hecho: cintas (3 niveles, subterráneas, divisores, arrastrar, reemplazo rápido), 5 brazos con filtros/combustible/animación, postes y cables,
paneles solares y acumuladores, extractor con vetas, hornos (eléctrico, de piedra y de acero), ensambladoras 1–3, laboratorio, investigación
(192 tecnologías), fabricación a mano con cola, indicador de «sin energía», cohete a la Luna.

## Hecho desde la primera versión de este documento
- **Recursos lunares** (decisión: todo como vetas en la Luna): hierro, cobre, carbón, piedra y campos de petróleo (pozos de 1 bloque) junto
  al aterrizaje y repartidos por el mapa; el extractor saca los minerales; el petróleo sólo se bombea.
- **Fluidos**: tuberías (volumen 100, forma automática), tuberías subterráneas (10), tanque (25 000), bomba (1 200/s, 29 kW), bomba de agua,
  motor de flujo por niveles (`FLOW_FACTOR` 0,4 × 3 pasos por tick). Rótulo al apuntar («Agua 63,2 / 100»).
- **Pozo de petróleo** (90 kW; 10 × rendimiento por segundo; el pozo pierde rendimiento hasta un 20 %), **caldera** (1,8 MW, agua + combustible)
  y **máquina de vapor** (900 kW) que genera a demanda; **planta química** y **refinería** con sus cajas de fluido; **ensambladoras 2 y 3**
  con recetas de fluidos (`crafting-with-fluid`). La investigación «procesado de petróleo» se abre al bombear crudo.

- **Agua en la Luna** (2026-09-30): receta «Fundido de hielo» en la planta química, la *ice-melting* de Factorio 2.0 (Space Age):
  1 hielo sucio → 20 de agua en 1 s. Decisión: sin máquina propia; se usa la planta química como en Factorio, y la cadena lunar queda
  paneles → pozo de petróleo → procesado de petróleo → planta química → agua → calderas. El extractor ya saca hielo sucio.
- **Traje espacial y oxígeno** (2026-09-30, `shared/spacesuit.ts`): traje de 4 piezas que sella con las cuatro puestas, depósito de 300 uO
  (10 min a 0,5 uO/s), botellas de 600 uO (20 min) que se gastan solas de una en una, relleno en la cabina del cohete y con aire; barra de
  O₂ propia con el tiempo que queda y avisos. Se fabrican en la mesa con placas de acero, lana y cristal.

## Siguiente en el plan (en este orden)
1. **Reactor de helio-3 / energía nuclear** y los intercambiadores de calor; hoy: solar, acumuladores y vapor.
2. **Efectos de la investigación sin aplicar**: productividad de minado del extractor, velocidad de minado a mano, huecos de inventario extra.
   Tecnologías infinitas (fórmula de nivel) fuera por ahora.
3. **Módulos y balizas**: los 9 módulos existen como objetos pero no tienen efecto; ranuras en las máquinas.
4. **Máquinas que faltan**: horno/extractor quemador, centrífuga, reactor, silo de cohetes real, radar, lámparas, cofres de hierro/acero,
   ciencia militar y espacial, cintas exprés (ya se pueden hacer con lubricante), lubricante y ácido en las tuberías.
5. **Red de circuitos** (cables rojo/verde, combinadores, interruptor de energía) y **robots** (roboports, cofres logísticos).
6. **Transporte lunar**: rover y trenes (rieles, señales).
7. **Planos, estadísticas de producción, alertas** (el rayo rojo de «sin energía» ya está).
8. **Ver el fantasma de otros jugadores** al colocar (difundir el objeto en mano/objetivo unas 5 veces por segundo).
9. **Ciencia espacial**: `send-item-to-orbit` (satélite) para abrir «space-science-pack».
10. **Misiones / lista de «lo siguiente»** sobre la investigación (ver conversación: capa 1 = tecnologías disponibles; capa 2 = hitos lunares).

## Cosas pequeñas conocidas
- Los laboratorios no pasan paquetes de uno a otro (en Factorio sí, con brazos).
- El extractor no aplica todavía la productividad de minado; sin filtros de recurso ni módulos.
- Ensambladoras: no se respetan los límites de ingredientes de la AM1 (en Factorio 2.0 no hay límite) ni la cola de salida por lotes.
- Hornos de combustible: no aceptan combustible que también sea mineral fundible (la madera va a la entrada).
- El bloque «cofre» es el de Minecraft (27 huecos); Factorio tiene cofres de 16/32/48.
- Los sprites de los objetos nuevos son geométricos (no dibujos a mano) y hay que revisar cómo se ven en el inventario.
- Las piezas industriales ya se fabrican con recetas de Factorio, pero la madera de los postes pequeños hay que traerla de la Tierra.
- Sin pruebas de la cola de fabricación a mano en el cliente (sólo la planificación, en `tests/factorio.test.ts`).

## Cómo probar
- `npm run test:luna` (140 pruebas, no hace falta la suite completa).
- En el juego: `G` investigación, `C` fabricación a mano, `/investigar todo` para abrir todo el árbol, `R` girar cintas y brazos.
