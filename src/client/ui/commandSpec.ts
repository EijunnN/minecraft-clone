// Los comandos del chat tal como los entiende el servidor (server/commands.ts): nombre, alias,
// descripción y argumentos con sus opciones. Lo usa el asistente del chat para sugerir y explicar.
import { EFFECTS } from '../../shared/effects';
import { MOBS, MOB_TYPES } from '../../shared/mobs';
import { ITEMS } from '../../shared/items';
import { STRUCTURE_NAMES } from '../../shared/world/structures';
import { ENCHANTS, ENCHANT_IDS } from '../../shared/enchantments'; // Fase 7 (encantamientos)

export interface Option {
  /** Lo que se escribe. */
  value: string;
  /** Nombre legible (en español) que se muestra al lado. */
  label?: string;
  /** Objeto cuyo icono se muestra. */
  item?: number;
}

export interface ArgSpec {
  name: string;
  optional?: boolean;
  desc: string;
  /** Opciones sugeridas (si no hay, sólo se explica el argumento). */
  options?: (players: string[]) => Option[];
}

export interface CommandSpec {
  name: string;
  aliases?: string[];
  desc: string;
  args: ArgSpec[];
}

export const norm = (v: string): string => v.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const underscore = (s: string) => norm(s).replace(/\s+/g, '_');

// Las listas largas se calculan una vez, la primera vez que se piden.
let mobOptions: Option[] | null = null;
let itemOptions: Option[] | null = null;

const STRUCTURES: [string, string][] = [
  ['aldea', 'village'], ['puesto', 'pillager_outpost'], ['templo_del_desierto', 'desert_pyramid'],
  ['templo_de_la_jungla', 'jungle_temple'], ['naufragio', 'shipwreck'], ['portal_en_ruinas', 'ruined_portal'],
  ['iglu', 'igloo'], ['pozo', 'desert_well'], ['mina', 'mineshaft'],
];

export const COMMAND_SPECS: CommandSpec[] = [
  { name: 'ayuda', aliases: ['help'], desc: 'Lista los comandos disponibles', args: [] },
  {
    name: 'modo', aliases: ['gamemode'], desc: 'Cambia tu modo de juego',
    args: [{
      name: 'modo', desc: 'Supervivencia o creativo',
      options: () => [{ value: 'supervivencia', label: 'Vida, hambre y recursos' }, { value: 'creativo', label: 'Vuelo y bloques infinitos' }],
    }],
  },
  {
    name: 'dificultad', aliases: ['difficulty'], desc: 'Cambia la dificultad del mundo',
    args: [{
      name: 'dificultad', desc: 'Cuánto daño hacen los monstruos (pacífico: no aparecen)',
      options: () => [
        { value: 'pacifico', label: 'Sin monstruos' }, { value: 'facil', label: 'Menos daño' },
        { value: 'normal', label: 'Como en Minecraft' }, { value: 'dificil', label: 'Más daño y más peligros' },
      ],
    }],
  },
  {
    name: 'hora', aliases: ['time'], desc: 'Cambia la hora del día',
    args: [{
      name: 'momento', desc: 'Un momento del día o un número de 0 a 24000',
      options: () => [
        { value: 'dia', label: 'Mañana' }, { value: 'mediodia', label: 'Sol en lo alto' }, { value: 'atardecer', label: 'Puesta de sol' },
        { value: 'noche', label: 'Salen los monstruos' }, { value: 'medianoche', label: 'Luna en lo alto' },
        { value: 'amanecer', label: 'Sale el sol' },
      ],
    }],
  },
  {
    name: 'invocar', aliases: ['summon'], desc: 'Hace aparecer una criatura delante de ti',
    args: [{
      name: 'criatura', desc: 'La criatura que aparece',
      options: () => (mobOptions ??= MOB_TYPES.filter((t) => !MOBS[t].inert).map((t) => ({ value: underscore(MOBS[t].name), label: MOBS[t].key.replace(/_/g, ' ') }))),
    }],
  },
  {
    name: 'dar', aliases: ['give'], desc: 'Te da un objeto (lo suelta a tus pies)',
    args: [
      {
        name: 'objeto', desc: 'Busca por su nombre en español o por su clave',
        options: () => (itemOptions ??= ITEMS.filter((i) => i).map((i) => ({ value: i.key, label: i.name, item: i.id }))),
      },
      {
        name: 'cantidad', optional: true, desc: 'Cuántos (1 por defecto, hasta 576)',
        options: () => ['1', '8', '16', '32', '64'].map((v) => ({ value: v })),
      },
    ],
  },
  {
    name: 'efecto', aliases: ['effect'], desc: 'Te pone un efecto de estado (o te los quita todos)',
    args: [
      {
        name: 'efecto', desc: 'El efecto, o «quitar» para quitarlos todos',
        options: () => [{ value: 'quitar', label: 'Quita todos los efectos' }, ...Object.values(EFFECTS).map((e) => ({ value: underscore(e.name), label: e.good ? 'Beneficioso' : 'Perjudicial' }))],
      },
      { name: 'segundos', optional: true, desc: 'Duración en segundos (30 por defecto, hasta 3600)', options: () => ['30', '60', '300', '3600'].map((v) => ({ value: v })) },
      { name: 'nivel', optional: true, desc: 'Nivel del efecto (1 por defecto, hasta 5)', options: () => ['1', '2', '3', '4', '5'].map((v) => ({ value: v })) },
    ],
  },
  { name: 'matar', aliases: ['kill'], desc: 'Te mata al instante', args: [] },
  {
    name: 'tp', desc: 'Te lleva junto a otro jugador',
    args: [{ name: 'jugador', desc: 'A quién ir', options: (players) => players.map((p) => ({ value: p })) }],
  },
  {
    name: 'localizar', aliases: ['locate'], desc: 'Dice dónde está la estructura más cercana',
    args: [{
      name: 'estructura', desc: 'Qué buscar',
      options: () => STRUCTURES.map(([value, key]) => ({ value, label: key === 'mineshaft' ? 'Mina abandonada' : STRUCTURE_NAMES[key] })),
    }],
  },
  { name: 'asalto', aliases: ['raid'], desc: 'Desata un asalto en la aldea más cercana', args: [] },
  { name: 'patrulla', aliases: ['patrol'], desc: 'Hace aparecer una patrulla de saqueadores', args: [] },
  // Fase 7 (encantamientos)
  {
    name: 'encantar', aliases: ['enchant'], desc: 'Encanta el objeto que tienes en la mano',
    args: [
      {
        name: 'encantamiento', desc: 'Por su nombre en español (con guiones bajos)',
        options: () => ENCHANT_IDS.map((id) => ({ value: underscore(ENCHANTS[id].name), label: `Hasta ${ENCHANTS[id].max}` })),
      },
      { name: 'nivel', optional: true, desc: 'Nivel (1 por defecto, hasta 10)', options: () => ['1', '2', '3', '4', '5'].map((v) => ({ value: v })) },
    ],
  },
  {
    name: 'experiencia', aliases: ['xp'], desc: 'Te da experiencia (puntos o niveles)',
    args: [
      { name: 'cantidad', desc: 'Cuánta experiencia', options: () => ['10', '30', '100', '1000'].map((v) => ({ value: v })) },
      { name: 'unidad', optional: true, desc: 'Puntos (por defecto) o niveles', options: () => [{ value: 'puntos' }, { value: 'niveles' }] },
    ],
  },
  { name: 'semilla', aliases: ['seed'], desc: 'Muestra la semilla del mundo', args: [] },
  { name: 'lista', aliases: ['list'], desc: 'Jugadores conectados', args: [] },
];

/** Comando por su nombre o un alias (sin tildes ni mayúsculas). */
export function findCommand(name: string): CommandSpec | undefined {
  const n = norm(name);
  return COMMAND_SPECS.find((c) => c.name === n || c.aliases?.includes(n));
}

/** Firma legible: «/dar <objeto> [cantidad]». */
export function signature(c: CommandSpec): string {
  return '/' + c.name + c.args.map((a) => (a.optional ? ` [${a.name}]` : ` <${a.name}>`)).join('');
}
