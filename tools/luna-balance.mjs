// Calculadora del árbol lunar (idea-luna.md). No es código del juego: es la fuente de los números del documento.
// Uso: node tools/luna-balance.mjs [coste <objeto> [cantidad]] [arbol]
//
// Todo lo que sale en las tablas de idea-luna.md sale de aquí: recetas, costes en bruto, cohete, energía, aire.
// Si se cambia una receta, se vuelve a correr y se copian los números.

// ───────────────────────── constantes del juego (ajustables) ─────────────────────────
export const K = {
  g: 9.81,
  // Δv (km/s) de cada tramo. Reales, redondeados.
  dv: { tierraOrbita: 9.4, transferencia: 3.1, aterrizaje: 2.8, ascensoLunar: 1.9, regreso: 1.0 },
  // Velocidad de escape del gas (km/s) por tipo de motor.
  ve: { solido: 2.4, denso: 3.3, crio: 4.4 },
  // Masa seca (tanque + estructura) por tonelada de propelente que caben.
  kDenso: 0.08, kCrio: 0.09,
  // Tanques (fracción de la masa seca por tj de propelente) y motores (masa tj, empuje kN).
  tanqueDenso: 0.06, tanqueCrio: 0.07, cerbero: { m: 1.0, kN: 1200 }, icaro: { m: 0.7, kN: 400 },
  capDenso: 27, capCrio: 8,
  // Energía y tiempo lunar.
  ueEsKJ: 1, panel: 20, bateria: 6000, eta: 0.9, dia: 1200, noche: 1200,
  // 1 tj de propelente criogénico = uO + uH (de la electrólisis del agua).
  crioO: 400, crioH: 50,
};

// ───────────────────────── recetas ─────────────────────────
// [salida, cantidad] : { in: {…}, t: segundos, p: kW (ue/s), m: máquina }
// «raw» = lo que no se fabrica: lo que se recoge en la Tierra o se extrae en la Luna.
export const RAW_TIERRA = ['hierro', 'cobre', 'carbon', 'oro', 'redstone', 'obsidiana', 'ladrillo_barro', 'cristal',
  'slime', 'lana', 'agua_t', 'ojo_ender', 'concha_shulker', 'aliento_dragon', 'perla_ender', 'vara_end', 'chorus', 'amatista'];
export const RAW_LUNA = ['rc', 'ro', 'hs'];

const R = {}; // id → receta
const r = (id, out, inp, t, p, m) => { R[id] = { out, in: inp, t, p, m }; };

// --- Tierra (todo va con fuego; nada de red eléctrica) ---
r('acero', { acero: 1 }, { hierro: 1, carbon: 1 }, 10, 0, 'Alto horno');
r('circuito_r', { circuito_r: 2 }, { cobre: 2, redstone: 2, cristal: 1 }, 5, 0, 'Mesa');
r('valvula', { valvula: 1 }, { hierro: 2, cobre: 1, redstone: 1 }, 5, 0, 'Mesa');
r('aislante', { aislante: 2 }, { lana: 3, slime: 1 }, 5, 0, 'Mesa');
r('losa_termica', { losa_termica: 2 }, { obsidiana: 1, ladrillo_barro: 2 }, 5, 0, 'Horno');
r('unidad_guia', { unidad_guia: 1 }, { circuito_r: 3, ojo_ender: 1, oro: 2 }, 5, 0, 'Mesa');
r('propelente_denso', { pd: 3 }, { chorus: 1, carbon: 1 }, 10, 0, 'Horno de propelente');
r('propelente_crio_t', { pc: 1 }, { agua_t: 1, carbon: 1 }, 10, 0, 'Electrolizador de horno');
r('tanque_denso', { tanque_denso: 1 }, { acero: 9, valvula: 1 }, 5, 0, 'Mesa de ensamblaje');
r('tanque_crio_t', { tanque_crio_t: 1 }, { acero: 3, valvula: 1, aislante: 2 }, 5, 0, 'Mesa de ensamblaje');
r('motor_denso', { motor_denso: 1 }, { acero: 8, cobre: 3, circuito_r: 2, valvula: 2 }, 5, 0, 'Mesa de ensamblaje');
r('motor_crio', { motor_crio: 1 }, { acero: 6, concha_shulker: 1, circuito_r: 3, valvula: 2, aliento_dragon: 1 }, 5, 0, 'Mesa de ensamblaje');
r('cabina', { cabina: 1 }, { concha_shulker: 2, acero: 6, cristal: 3, losa_termica: 8, unidad_guia: 1, circuito_r: 4 }, 5, 0, 'Mesa de ensamblaje');


r('receptor', { receptor: 1 }, { vara_end: 4, chorus: 2, amatista: 3, cobre: 8, circuito_r: 2 }, 10, 0, 'Mesa de ensamblaje');
r('plataforma', { plataforma: 1 }, { obsidiana: 120, acero: 60, circuito_r: 8, cobre: 24, cristal: 6 }, 30, 0, 'Mesa de ensamblaje');

// --- Tierra: el kit de aterrizaje (todo se hace en la Tierra con fuego y redstone; pesa lo que pesa) ---
r('habitat0', { habitat0: 1 }, { acero: 20, cristal: 12, valvula: 6, losa_termica: 2, circuito_r: 4 }, 10, 0, 'Mesa de ensamblaje');
r('terminal', { terminal: 1 }, { acero: 4, circuito_r: 6, oro: 4, cristal: 2 }, 10, 0, 'Mesa de ensamblaje');
r('panel_t', { panel_t: 1 }, { cristal: 5, cobre: 2 }, 5, 0, 'Mesa');
r('bateria_t', { bateria_t: 1 }, { hierro: 3, cobre: 2, redstone: 4 }, 5, 0, 'Mesa');
r('maquina_t', { maquina_t: 1 }, { acero: 10, cobre: 6, circuito_r: 4, redstone: 4 }, 10, 0, 'Mesa de ensamblaje');
r('botella_t', { botella_t: 1 }, { hierro: 3, valvula: 1 }, 5, 0, 'Mesa');

// --- Luna: extracción ---
r('excavar_rc', { rc: 5 }, {}, 10, 8, 'Excavadora');
r('excavar_ro', { ro: 5 }, {}, 10, 8, 'Excavadora');
r('perforar_hs', { hs: 5 }, {}, 15, 20, 'Perforadora de hielo');

// --- Luna: procesado ---
r('rrf_a', { o: 20, si: 4, al: 3, ca: 3 }, { rc: 20 }, 20, 30, 'Reactor de regolito fundido');
r('rrf_b', { o: 12, fe: 4, esc: 4 }, { ro: 20 }, 20, 30, 'Reactor de regolito fundido');
r('refi_ti', { ti: 3 }, { esc: 4, o: 4 }, 30, 45, 'Refinería de titanio');
r('volatiles', { he3: 1, h: 6 }, { ro: 60 }, 30, 60, 'Calentador de volátiles');
r('destila', { agua: 90, c: 6, n: 4 }, { hs: 100 }, 60, 40, 'Destiladora criogénica');
r('electro', { o: 8, h: 1 }, { agua: 9 }, 10, 25, 'Electrolizador');
r('amoniaco', { nh3: 1 }, { n: 1, h: 3 }, 10, 15, 'Planta química');
r('polimero', { polimero: 3 }, { c: 1, h: 2 }, 10, 20, 'Planta química');
r('vidrio', { vidrio: 1 }, { rc: 4 }, 8, 15, 'Horno de vidrio');
r('ladrillo', { ladrillo: 1 }, { rc: 4 }, 10, 12, 'Horno de sinterizado');
r('fibra', { fibra: 2 }, { ro: 6 }, 10, 15, 'Horno de fibra');
r('licuar', { tj: 1 }, { o: K.crioO, h: K.crioH }, 20, 80, 'Licuefactor criogénico');

// --- Luna: laminado ---
r('cable', { cable: 2 }, { al: 1 }, 2, 6, 'Laminadora');
r('placa_al', { placa_al: 1 }, { al: 1 }, 3, 6, 'Laminadora');
r('tubo', { tubo: 1 }, { al: 1 }, 3, 6, 'Laminadora');
r('placa_ti', { placa_ti: 1 }, { ti: 1 }, 4, 8, 'Laminadora');
r('viga_ti', { viga_ti: 1 }, { ti: 2 }, 6, 8, 'Laminadora');

// --- Luna: electrónica y energía ---
r('cl', { cl: 1 }, { si: 2, vidrio: 1, cable: 2 }, 10, 12, 'Ensambladora');
r('ca', { ca_c: 1 }, { cl: 2, ti: 1, polimero: 1, ca: 1 }, 20, 20, 'Ensambladora');
r('celda', { celda: 1 }, { si: 3, cable: 1, vidrio: 1 }, 10, 12, 'Ensambladora');
r('panel', { panel: 1 }, { celda: 4, placa_al: 2, cable: 2 }, 15, 12, 'Ensambladora');
r('bateria', { bateria: 1 }, { placa_al: 3, ca: 2, si: 2, cable: 2 }, 15, 12, 'Ensambladora');
r('motor', { motor: 1 }, { cable: 6, placa_al: 2, fe: 2 }, 12, 12, 'Ensambladora');
r('bobina', { bobina: 1 }, { cable: 10, fe: 4 }, 12, 12, 'Ensambladora');
r('sello', { sello: 2 }, { polimero: 3, placa_al: 1 }, 6, 10, 'Ensambladora');
r('valvula_l', { valvula_l: 1 }, { placa_al: 1, polimero: 1 }, 5, 10, 'Ensambladora');
r('botella', { botella: 1 }, { placa_al: 2, valvula_l: 1 }, 8, 10, 'Ensambladora');
r('radiador', { radiador: 1 }, { placa_al: 6, tubo: 4, nh3: 5 }, 15, 10, 'Ensambladora');
r('rueda', { rueda: 1 }, { cable: 6, placa_al: 2 }, 8, 10, 'Ensambladora');
r('condensador', { condensador: 1 }, { placa_ti: 6, ca: 4, cable: 8, ca_c: 1 }, 20, 20, 'Ensambladora');

// --- Luna: máquinas (lo que se construye en la Ensambladora) ---
r('m_excavadora', { m_excavadora: 1 }, { placa_al: 8, motor: 1, cl: 1 }, 20, 12, 'Ensambladora');
r('m_laminadora', { m_laminadora: 1 }, { placa_al: 8, motor: 2, cl: 2 }, 20, 12, 'Ensambladora');
r('m_ensambladora', { m_ensambladora: 1 }, { placa_al: 10, motor: 3, cl: 4, tubo: 2 }, 30, 12, 'Ensambladora');
r('m_rrf', { m_rrf: 1 }, { placa_al: 15, ladrillo: 10, tubo: 6, cl: 4, motor: 2 }, 30, 12, 'Ensambladora');
r('m_perforadora', { m_perforadora: 1 }, { placa_al: 14, motor: 4, cl: 3 }, 30, 12, 'Ensambladora');
r('m_destiladora', { m_destiladora: 1 }, { placa_al: 12, tubo: 10, cl: 4, motor: 2, radiador: 1 }, 30, 12, 'Ensambladora');
r('m_electrolizador', { m_electrolizador: 1 }, { placa_al: 8, tubo: 6, cl: 3, sello: 2 }, 30, 12, 'Ensambladora');
r('m_quimica', { m_quimica: 1 }, { placa_al: 10, tubo: 8, cl: 4, sello: 2 }, 30, 12, 'Ensambladora');
r('m_refi_ti', { m_refi_ti: 1 }, { placa_al: 12, ladrillo: 12, tubo: 8, cl: 6, motor: 2 }, 30, 12, 'Ensambladora');
r('m_volatiles', { m_volatiles: 1 }, { placa_ti: 10, ladrillo: 8, tubo: 8, cl: 4, motor: 2 }, 30, 12, 'Ensambladora');
r('m_licuefactor', { m_licuefactor: 1 }, { placa_al: 14, tubo: 14, motor: 4, cl: 6, radiador: 4 }, 40, 12, 'Ensambladora');
r('m_reactor', { m_reactor: 1 }, { placa_ti: 24, viga_ti: 12, tubo: 12, ca_c: 6, radiador: 12, bobina: 8, perla_ender: 16 }, 60, 12, 'Ensambladora');
r('rover', { rover: 1 }, { motor: 4, bateria: 2, placa_al: 16, rueda: 4, cl: 2, sello: 1 }, 30, 12, 'Ensambladora');
r('deposito', { deposito: 1 }, { placa_al: 20, tubo: 8, sello: 2 }, 30, 12, 'Ensambladora');
r('deposito_ti', { deposito_ti: 1 }, { viga_ti: 4, placa_ti: 12, sello: 2 }, 30, 12, 'Ensambladora');
r('traje2', { traje2: 1 }, { fibra: 30, polimero: 12, placa_al: 8, cl: 2, botella: 1 }, 30, 12, 'Ensambladora');
r('invernadero', { invernadero: 1 }, { vidrio: 40, placa_al: 20, sello: 8, cl: 2 }, 60, 12, 'Ensambladora');
r('tramo_lanzador', { tramo_lanzador: 1 }, { bobina: 8, viga_ti: 4, ca_c: 1 }, 30, 12, 'Ensambladora');
r('motor_luna', { motor_luna: 1 }, { placa_ti: 10, viga_ti: 4, tubo: 8, ca_c: 4, bobina: 2 }, 40, 12, 'Ensambladora');
r('capsula', { capsula: 1 }, { placa_ti: 8, viga_ti: 2, sello: 2, ca_c: 1 }, 30, 12, 'Ensambladora');
r('rampa_lunar', { rampa_lunar: 1 }, { ladrillo: 60, placa_ti: 20, ca_c: 2 }, 60, 12, 'Ensambladora');

export const RECIPES = R;

// Qué produce cada objeto (id de receta que lo da).
export const PRODUCER = {};
for (const [id, rec] of Object.entries(R)) for (const o of Object.keys(rec.out)) (PRODUCER[o] ??= []).push(id);
// Con dos recetas para lo mismo, la primera es la habitual: el hidrógeno sale de la electrólisis (el de los volátiles es un extra).
PRODUCER.h = ['electro', 'volatiles'];

/** Coste en bruto de `n` unidades de `item` (suma de lo que hay que recoger o extraer). */
export function rawCost(item, n = 1, acc = {}, machineTime = { t: 0, e: 0 }) {
  if (RAW_TIERRA.includes(item) || RAW_LUNA.includes(item)) { acc[item] = (acc[item] ?? 0) + n; return acc; }
  const ids = PRODUCER[item];
  if (!ids) throw new Error(`sin receta: ${item}`);
  const rec = R[ids[0]];
  const runs = n / rec.out[item];
  for (const [i, q] of Object.entries(rec.in)) rawCost(i, q * runs, acc, machineTime);
  machineTime.t += runs * rec.t; machineTime.e += runs * rec.t * rec.p;
  return acc;
}

/** Cadena completa (todos los pasos) de un objeto, en orden topológico, con las veces que se ejecuta cada receta. */
export function runsFor(item, n = 1, runs = {}) {
  if (RAW_TIERRA.includes(item) || RAW_LUNA.includes(item)) return runs;
  const id = PRODUCER[item][0];
  const rec = R[id];
  const k = n / rec.out[item];
  runs[id] = (runs[id] ?? 0) + k;
  for (const [i, q] of Object.entries(rec.in)) runsFor(i, q * k, runs);
  return runs;
}

// ───────────────────────── validaciones ─────────────────────────
export function validar() {
  const problemas = [];
  const producidos = new Set([...RAW_TIERRA, ...RAW_LUNA]);
  for (const rec of Object.values(R)) for (const o of Object.keys(rec.out)) producidos.add(o);
  const usados = new Set();
  for (const [id, rec] of Object.entries(R)) for (const i of Object.keys(rec.in)) {
    usados.add(i);
    if (!producidos.has(i)) problemas.push(`ingrediente sin origen: ${i} (en ${id})`);
  }
  // Salidas que nadie usa (aparte de los objetos finales).
  const FINALES = new Set(['cabina', 'motor_denso', 'motor_crio', 'tanque_denso', 'tanque_crio_t', 'pd', 'pc', 'tj', 'panel', 'bateria',
    'rover', 'deposito', 'traje2', 'invernadero', 'botella', 'tramo_lanzador', 'rampa_lunar', 'condensador', 'm_excavadora',
    'm_laminadora', 'm_ensambladora', 'm_rrf', 'm_perforadora', 'm_destiladora', 'm_electrolizador', 'm_quimica', 'm_refi_ti',
    'm_volatiles', 'm_licuefactor', 'm_reactor', 'receptor', 'plataforma', 'deposito_ti', 'motor_luna', 'capsula', 'habitat0', 'terminal', 'panel_t', 'bateria_t', 'maquina_t', 'botella_t', 'agua', 'he3', 'c', 'n', 'nh3', 'o', 'h', 'ladrillo']);
  for (const [id, rec] of Object.entries(R)) for (const o of Object.keys(rec.out)) {
    if (!usados.has(o) && !FINALES.has(o)) problemas.push(`huérfano (nadie lo usa): ${o} (de ${id})`);
  }
  // Ciclos.
  const visit = (item, pila) => {
    if (RAW_TIERRA.includes(item) || RAW_LUNA.includes(item)) return;
    if (pila.includes(item)) { problemas.push(`ciclo: ${[...pila, item].join(' → ')}`); return; }
    for (const i of Object.keys(R[PRODUCER[item][0]].in)) visit(i, [...pila, item]);
  };
  for (const item of Object.keys(PRODUCER)) visit(item, []);
  return problemas;
}

// ───────────────────────── cohete ─────────────────────────
/** Ecuación de Tsiolkovsky con masa seca proporcional: devuelve {prop, seca, m0} para una carga útil dada. */
export function etapa(carga, dv, ve, k, fija = 0) {
  const R_ = Math.exp(dv / ve);
  // m0 = R·mf ; prop = m0 - mf ; mf = carga + fija + k·prop  →  mf = (carga+fija) / (1 - k·(R-1))
  const mf = (carga + fija) / (1 - k * (R_ - 1));
  const prop = (R_ - 1) * mf;
  return { R: R_, prop, mf, m0: R_ * mf, seca: k * prop + fija };
}

export function seleneI() {
  const { dv, ve } = K;
  const cabina = 3.0; // 4 asientos, escudo térmico, guía
  const muestras = 0.5;
  // Etapa de ascenso (vuelve): sale de la Luna y vuelve a casa (1,9 + 1,0). Sale de la Tierra con el depósito VACÍO.
  const ascenso = etapa(cabina + muestras, dv.ascensoLunar + dv.regreso, ve.crio, K.kCrio, 0.8);
  // Lo que se posa en la Luna: el ascenso vacío (sin propelente) + la carga (el kit de la base).
  const kit = 3.0;
  const ascensoVacio = ascenso.mf - ascenso.prop * 0 + 0; // (mf ya incluye la estructura y el depósito; el propelente no se lleva)
  const seca = ascenso.seca + cabina + muestras;           // lo que se posa de la etapa de ascenso
  // Etapa lunar (transferencia + aterrizaje): lleva `seca` + kit hasta el suelo.
  const lunar = etapa(seca + kit, dv.transferencia + dv.aterrizaje, ve.crio, K.kCrio);
  // Etapa 2 (a órbita, criogénica) y etapa 1 (densa).
  const dvTierra2 = 5.0, dvTierra1 = dv.tierraOrbita - dvTierra2;
  const e2 = etapa(lunar.m0, dvTierra2, ve.crio, K.kCrio);
  const e1 = etapa(e2.m0, dvTierra1, ve.denso, K.kDenso);
  return { cabina, muestras, kit, ascenso, seca, lunar, e2, e1, aterrizado: seca + kit + lunar.seca };
}

// ───────────────────────── energía ─────────────────────────
/** Con `carga` kW continuos día y noche: paneles y baterías necesarios. */
export function energia(carga) {
  const { panel, bateria, eta, dia, noche } = K;
  const G = carga * (1 + noche / (dia * eta) * 1); // generación de día: carga + lo que se guarda para la noche / rendimiento
  const paneles = Math.ceil(G / panel);
  const baterias = Math.ceil(carga * noche / bateria);
  return { generacion: G, paneles, baterias };
}

// ───────────────────────── salida por consola ─────────────────────────
const fmt = (o) => Object.entries(o).map(([k, v]) => `${k} ${Math.round(v * 10) / 10}`).join(', ');
if (process.argv[1] && process.argv[1].endsWith('luna-balance.mjs')) {
  const [, , cmd, a, b] = process.argv;
  if (cmd === 'coste') {
    const t = { t: 0, e: 0 };
    console.log(fmt(rawCost(a, Number(b ?? 1), {}, t)), `| tiempo de máquina ${Math.round(t.t)} s, energía ${Math.round(t.e)} ue`);
  } else {
    console.log('Problemas:', validar());
    console.log('Selene I:', JSON.stringify(seleneI(), (k, v) => (typeof v === 'number' ? Math.round(v * 100) / 100 : v), 1));
  }
}

// ───────────────────────── extras de cálculo ─────────────────────────
/** Mejor reparto del Δv de la Tierra entre la etapa 1 (densa) y la 2 (criogénica). */
export function mejorReparto() {
  const base = seleneI();
  let mejor = null;
  for (let d2 = 3; d2 <= 7; d2 += 0.25) {
    const e2 = etapa(base.lunar.m0, d2, K.ve.crio, K.kCrio);
    const e1 = etapa(e2.m0, K.dv.tierraOrbita - d2, K.ve.denso, K.kDenso);
    if (!mejor || e1.m0 < mejor.m0) mejor = { d2, d1: K.dv.tierraOrbita - d2, m0: e1.m0, e1, e2 };
  }
  return mejor;
}

/** Energía (ue) para lanzar 1 tj a `v` km/s con el lanzador electromagnético (½mv², sin pérdidas). */
export const energiaLanzar = (v, tj = 1) => 0.5 * tj * 1000 * (v * 1000) ** 2 / 1000; // ue (1 ue = 1 kJ)
/** Longitud (bloques) de la pista para v y aceleración a (m/s²). */
export const pista = (v, a) => (v * 1000) ** 2 / (2 * a);

/** Etapa con motores contados: la masa seca es la de los tanques más n motores, y n cumple el empuje/peso `twr`. */
export function etapaMotores(carga, dv, ve, fTanque, motor, twr) {
  for (let n = 1; n < 60; n++) {
    const R_ = Math.exp(dv / ve);
    // mf = carga + fTanque·prop + n·m ; prop = (R-1)·mf
    const mf = (carga + n * motor.m) / (1 - fTanque * (R_ - 1));
    const prop = (R_ - 1) * mf, m0 = R_ * mf;
    if (n * motor.kN >= twr * m0 * K.g) return { n, prop, mf, m0, seca: fTanque * prop + n * motor.m, tanques: 0 };
  }
  throw new Error('sin solución');
}

/** Ficha completa de Selene I con motores y tanques contados. */
export function fichaSelene() {
  const { dv, ve } = K;
  const cabina = 3.0, muestras = 0.5, kit = 3.0;
  const asc = etapaMotores(cabina + muestras, dv.ascensoLunar + dv.regreso, ve.crio, K.tanqueCrio, K.icaro, 0.4); // en la Luna basta 0,4·g(Tierra)=2,4 g_luna
  const seca = asc.seca + cabina + muestras;
  const lun = etapaMotores(seca + kit, dv.transferencia + dv.aterrizaje, ve.crio, K.tanqueCrio, K.icaro, 0.5);
  let mejor = null;
  for (let d2 = 4; d2 <= 7.5; d2 += 0.25) {
    const e2 = etapaMotores(lun.m0, d2, ve.crio, K.tanqueCrio, K.icaro, 0.8);
    const e1 = etapaMotores(e2.m0, dv.tierraOrbita - d2, ve.denso, K.tanqueDenso, K.cerbero, 1.3);
    if (!mejor || e1.m0 < mejor.e1.m0) mejor = { d2, d1: dv.tierraOrbita - d2, e1, e2 };
  }
  const { e1, e2 } = mejor;
  const t = (x, cap) => Math.ceil(x.prop / cap);
  return { cabina, muestras, kit, asc, lun, ...mejor,
    tanques: { e1: t(e1, K.capDenso), e2: t(e2, K.capCrio), lun: t(lun, K.capCrio), asc: t(asc, K.capCrio) },
    aterrizado: seca + kit + lun.seca, ratio: e1.m0 / (seca + kit + lun.seca) };
}
