# Lo que falta para la Luna «estilo Factorio»

Estado a 2026-09-29, rama `factorio-style`. Las recetas, tiempos y tecnologías son las de Factorio 2.0.72 (`tools/factorio-extract.mjs`).
Hecho: cintas (3 niveles, subterráneas, divisores, arrastrar, reemplazo rápido), 5 brazos con filtros/combustible/animación, postes y cables,
paneles solares y acumuladores, extractor con vetas, hornos (eléctrico, de piedra y de acero), ensambladoras 1–3, laboratorio, investigación
(192 tecnologías), fabricación a mano con cola, indicador de «sin energía», cohete a la Luna.

## Siguiente en el plan (en este orden)
1. **Fluidos**: tuberías (volumen 100), tuberías subterráneas, tanque de 25 000, bomba, bomba de agua, cajas de fluido en las máquinas.
   Con ello se abren las recetas de química y petróleo que ya están en los datos (plástico, azufre, batería, cinta exprés, circuito avanzado,
   ciencia química…). En la Luna no hay agua líquida: sale del hielo sucio (fundirlo).
2. **Energía propia de la Luna**: caldera y máquina de vapor (con el agua del hielo), reactor de helio-3; hoy sólo hay solar + acumuladores.
3. **Efectos de la investigación sin aplicar**: productividad de minado del extractor, velocidad de minado a mano, huecos de inventario extra,
   velocidad de laboratorio ya aplicada. Tecnologías infinitas (fórmula de nivel) fuera por ahora.
4. **Módulos y balizas**: los 9 módulos existen como objetos pero no tienen efecto; ranuras en ensambladoras/hornos/extractor/laboratorio.
5. **Máquinas que faltan**: horno/extractor quemador, bombas de petróleo, refinería, planta química, centrífuga, reactor, silo de cohetes
   real (hoy el cohete es el de la fase lunar), radar, lámparas, cofres de hierro/acero, tanque.
6. **Red de circuitos** (cables rojo/verde, combinadores, interruptor de energía) y **robots** (roboports, cofres logísticos).
7. **Transporte lunar**: rover y trenes (rieles, señales).
8. **Planos, estadísticas de producción, alertas** (el rayo rojo de «sin energía» ya está).
9. **Ver el fantasma de otros jugadores** al colocar (difundir el objeto en mano/objetivo unas 5 veces por segundo).
10. **Ciencia espacial**: `send-item-to-orbit` (satélite) para abrir «space-science-pack»; el resto del árbol de la Luna (L0–L6 de idea-luna.md)
    hay que fundirlo con el árbol de Factorio.

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
- `npm run test:luna` (121 pruebas, no hace falta la suite completa).
- En el juego: `G` investigación, `C` fabricación a mano, `/investigar todo` para abrir todo el árbol, `R` girar cintas y brazos.
