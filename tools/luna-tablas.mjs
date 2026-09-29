// Hitos del Terminal, comprobaciones de orden y tablas del documento idea-luna.md.
// Uso: node tools/luna-tablas.mjs            → comprobaciones
//      node tools/luna-tablas.mjs recetas     → tablas de recetas en Markdown
//      node tools/luna-tablas.mjs hitos       → coste en bruto y tiempo de cada hito
import { RECIPES as R, PRODUCER, RAW_TIERRA, RAW_LUNA, rawCost, energiaLanzar, pista, K, validar } from './luna-balance.mjs';

/** Se entrega `da` al Terminal y se abren las recetas de `abre`. Cada receta lunar se abre en un solo hito. */
export const HITOS = [
  { id: 'H1', fase: 'L1', nombre: 'Suelo', da: { rc: 100 }, estado: {}, abre: ['vidrio', 'ladrillo', 'cable', 'placa_al', 'tubo'] },
  { id: 'H2', fase: 'L1', nombre: 'Metal', da: { al: 60, si: 40, vidrio: 20 }, estado: {}, abre: ['cl', 'celda', 'panel', 'bateria', 'm_laminadora'] },
  { id: 'H3', fase: 'L2', nombre: 'El mar', da: { fe: 30 }, estado: { panel: 6, bateria: 8 }, abre: ['motor', 'bobina', 'm_excavadora', 'm_rrf', 'm_ensambladora'] },
  { id: 'H4', fase: 'L2', nombre: 'Autonomía', da: { al: 100, si: 60 }, estado: { m_excavadora: 2, m_rrf: 1, panel: 12, bateria: 24 }, abre: ['perforar_hs', 'm_perforadora', 'fibra'] },
  { id: 'H5', fase: 'L3', nombre: 'Hielo', da: { hs: 300 }, estado: { m_perforadora: 1 }, abre: ['destila', 'electro', 'polimero', 'amoniaco', 'sello', 'valvula_l', 'botella', 'radiador', 'rueda', 'rover', 'm_destiladora', 'm_electrolizador', 'm_quimica'] },
  { id: 'H6', fase: 'L3', nombre: 'Vida', da: { polimero: 100, nh3: 20 }, estado: { rover: 1, radiador: 4, botella: 3 }, abre: ['licuar', 'm_licuefactor', 'deposito', 'traje2', 'invernadero'] },
  { id: 'H7', fase: 'L4', nombre: 'Escoria', da: { esc: 80, fe: 40 }, estado: {}, abre: ['refi_ti', 'm_refi_ti', 'placa_ti', 'viga_ti'] },
  { id: 'H8', fase: 'L4', nombre: 'Helio', da: { ti: 24, bobina: 4 }, estado: { m_refi_ti: 1 }, abre: ['volatiles', 'm_volatiles', 'ca', 'deposito_ti', 'condensador'] },
  { id: 'H9', fase: 'L4', nombre: 'Fusión', da: { he3: 6, ca_c: 6, radiador: 12 }, estado: { m_volatiles: 1 }, abre: ['m_reactor'] },
  { id: 'H10', fase: 'L5', nombre: 'Astillero', da: { placa_ti: 40, viga_ti: 20 }, estado: { m_reactor: 2 }, abre: ['motor_luna', 'rampa_lunar', 'tramo_lanzador'] },
  { id: 'H11', fase: 'L6', nombre: 'Lanzador', da: { tramo_lanzador: 4, condensador: 2 }, estado: { rampa_lunar: 1 }, abre: ['capsula'] },
];
// Lo que ya funciona con el kit de la Tierra (sin abrir nada).
const KIT = new Set(['excavar_rc', 'excavar_ro', 'rrf_a', 'rrf_b']);
const TIERRA = new Set(['receptor', 'plataforma', 'acero', 'circuito_r', 'valvula', 'aislante', 'losa_termica', 'unidad_guia', 'propelente_denso', 'propelente_crio_t', 'tanque_denso',
  'tanque_crio_t', 'motor_denso', 'motor_crio', 'cabina', 'habitat0', 'terminal', 'panel_t', 'bateria_t', 'maquina_t', 'botella_t']);

export function validarHitos() {
  const p = [];
  const abiertas = {};
  for (const h of HITOS) for (const id of h.abre) { if (!R[id]) p.push(`el hito ${h.id} abre una receta que no existe: ${id}`); (abiertas[id] ??= []).push(h.id); }
  for (const id of Object.keys(R)) if (!TIERRA.has(id) && !KIT.has(id) && !abiertas[id]) p.push(`receta lunar que ningún hito abre: ${id}`);
  for (const [id, hs] of Object.entries(abiertas)) if (hs.length > 1) p.push(`receta abierta dos veces: ${id} (${hs})`);
  // Lo que pide un hito debe poder fabricarse con recetas del kit o abiertas en hitos anteriores.
  const abierto = new Set(KIT);
  for (const h of HITOS) {
    const puede = (item) => {
      if (RAW_TIERRA.includes(item) || RAW_LUNA.includes(item)) return true;
      const id = PRODUCER[item]?.[0];
      if (!id) { p.push(`${h.id} pide ${item}, que no se fabrica`); return false; }
      if (TIERRA.has(id)) return true;
      if (!abierto.has(id)) { p.push(`${h.id} pide ${item}, pero su receta (${id}) aún no está abierta`); return false; }
      return Object.keys(R[id].in).every(puede);
    };
    // Lo que se entrega se fabrica con lo abierto ANTES de este hito.
    for (const item of [...Object.keys(h.da), ...Object.keys(h.estado)]) puede(item);
    for (const id of h.abre) abierto.add(id);
  }
  return p;
}

const N = {
  rc: 'regolito claro', ro: 'regolito oscuro', hs: 'hielo sucio', o: 'oxígeno (uO)', h: 'hidrógeno (uH)', si: 'silicio', al: 'aluminio', ca: 'calcio',
  fe: 'hierro lunar', esc: 'escoria de ilmenita', ti: 'titanio', he3: 'helio-3', agua: 'agua', c: 'carbono', n: 'nitrógeno', nh3: 'amoníaco',
  polimero: 'polímero', vidrio: 'vidrio lunar', ladrillo: 'ladrillo de regolito', fibra: 'fibra de basalto', tj: 'tj de propelente criogénico',
  cable: 'cable de aluminio', placa_al: 'placa de aluminio', tubo: 'tubo de aluminio', placa_ti: 'placa de titanio', viga_ti: 'viga de titanio',
  cl: 'circuito lunar', ca_c: 'circuito avanzado', celda: 'celda solar', panel: 'panel solar', bateria: 'batería', motor: 'motor eléctrico',
  bobina: 'bobina', sello: 'sello', valvula_l: 'válvula lunar', botella: 'botella de oxígeno', radiador: 'radiador', rueda: 'rueda de malla',
  condensador: 'condensador de pulso', m_excavadora: 'Excavadora', m_laminadora: 'Laminadora', m_ensambladora: 'Ensambladora', m_rrf: 'Reactor de regolito fundido',
  m_perforadora: 'Perforadora de hielo', m_destiladora: 'Destiladora criogénica', m_electrolizador: 'Electrolizador', m_quimica: 'Planta química',
  m_refi_ti: 'Refinería de titanio', m_volatiles: 'Calentador de volátiles', m_licuefactor: 'Licuefactor criogénico', m_reactor: 'Reactor de helio-3',
  rover: 'rover', deposito: 'depósito criogénico (Al)', deposito_ti: 'depósito criogénico (Ti)', traje2: 'traje espacial Mk2', invernadero: 'invernadero',
  tramo_lanzador: 'tramo del lanzador', rampa_lunar: 'rampa de lanzamiento lunar', motor_luna: 'motor Fénix', perla_ender: 'perla de ender',
  acero: 'acero', circuito_r: 'circuito de redstone', valvula: 'válvula', aislante: 'aislante', losa_termica: 'losa térmica', unidad_guia: 'unidad de guía',
  pd: 'tj de propelente denso', pc: 'tj de propelente criogénico', tanque_denso: 'tanque denso', tanque_crio_t: 'tanque criogénico', motor_denso: 'motor Cerbero',
  motor_crio: 'motor Ícaro', cabina: 'cabina Ícaro-C', habitat0: 'módulo hábitat', terminal: 'Terminal de Base', panel_t: 'panel de cristal', bateria_t: 'batería de redstone',
  maquina_t: 'máquina de la Tierra', botella_t: 'botella de la Tierra', hierro: 'hierro', cobre: 'cobre', carbon: 'carbón', oro: 'oro', redstone: 'redstone', 
  obsidiana: 'obsidiana', ladrillo_barro: 'ladrillo', cristal: 'cristal', slime: 'slime', lana: 'lana', agua_t: 'cubo de agua',
  ojo_ender: 'ojo de ender', concha_shulker: 'concha de shulker', aliento_dragon: 'aliento de dragón', 
  receptor: 'Receptor de la Señal', plataforma: 'Plataforma de lanzamiento', vara_end: 'vara de End', chorus: 'fruta de chorus', amatista: 'fragmento de amatista', capsula: 'cápsula de carga',
};
const n = (id) => N[id] ?? id;

export function tabla(ids) {
  const l = ['| Máquina | Entra | Sale | Tiempo | Potencia |', '| --- | --- | --- | --- | --- |'];
  for (const id of ids) {
    const r = R[id];
    const ent = Object.entries(r.in).map(([k, v]) => `${v} ${n(k)}`).join(' + ') || '—';
    const sal = Object.entries(r.out).map(([k, v]) => `${v} ${n(k)}`).join(' + ');
    l.push(`| ${r.m} | ${ent} | ${sal} | ${r.t} s | ${r.p} kW |`);
  }
  return l.join('\n');
}

export function lanzador() {
  return [0.6, 1.2, 1.9].map((v) => {
    const aux = 1.9 - v;
    const factor = Math.exp(aux / K.ve.crio);          // tj lanzados por cada tj útil
    return { v, aux, eTj: energiaLanzar(v) * factor, prop: factor - 1, agua: (factor - 1) * (K.crioO + K.crioH), pista: pista(v, 3000) };
  });
}

if (process.argv[1]?.endsWith('luna-tablas.mjs')) {
  const cmd = process.argv[2];
  if (cmd === 'recetas') {
    const lunares = Object.keys(R).filter((id) => !TIERRA.has(id));
    console.log(tabla(lunares));
  } else if (cmd === 'hitos') {
    const f = (o) => Object.entries(o).map(([k, v]) => `${Math.round(v)} ${n(k)}`).join(', ');
    for (const h of HITOS) {
      const acc = {}; const t = { t: 0, e: 0 };
      for (const [item, q] of Object.entries({ ...h.da, ...h.estado })) rawCost(item, q, acc, t);
      console.log(`${h.id} ${h.nombre}: ${f(acc)} | ${Math.round(t.t / 60)} min-máquina, ${Math.round(t.e / 1000)} MJ`);
    }
  } else {
    console.log('recetas:', validar());
    console.log('hitos:', validarHitos());
    for (const l of lanzador()) console.log(Object.fromEntries(Object.entries(l).map(([k, v]) => [k, Math.round(v * 100) / 100])));
  }
}
