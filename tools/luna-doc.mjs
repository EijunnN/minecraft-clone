// Genera las dos tablas de recetas de idea-luna.md (Tierra y Luna) a partir de la calculadora.
// Uso: node tools/luna-doc.mjs tierra | node tools/luna-doc.mjs luna
import { RECIPES } from './luna-balance.mjs';
import { tabla } from './luna-tablas.mjs';

const TIERRA = ['receptor', 'plataforma', 'acero', 'circuito_r', 'valvula', 'aislante', 'losa_termica', 'unidad_guia', 'propelente_denso',
  'propelente_crio_t', 'tanque_denso', 'tanque_crio_t', 'motor_denso', 'motor_crio', 'cabina', 'habitat0', 'terminal', 'panel_t',
  'bateria_t', 'maquina_t', 'botella_t'];

if (process.argv[2] === 'tierra') {
  // En la Tierra no hay potencia (todo va con fuego): se quita esa columna.
  const filas = tabla(TIERRA).split('\n').map((l) => l.split(' | ').slice(0, 4).join(' | '));
  console.log(filas.map((l, i) => (i === 0 ? l.replace('Máquina', 'Dónde') + ' |' : i === 1 ? '| --- | --- | --- | --- |' : l + ' |')).join('\n'));
} else if (process.argv[2] === 'luna') {
  console.log(tabla(Object.keys(RECIPES).filter((id) => !TIERRA.includes(id))));
}
