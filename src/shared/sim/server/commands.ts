// Comandos del chat (/modo, /dificultad, /time, /invocar, /dar, /matar, /seed, /lista, /ayuda).
// /tp lo resuelve el cliente.
import type { GameMode } from '../../protocol';
import { ITEMS, maxStack } from '../../items';
import { MOBS, MOB_TYPES } from '../../mobs';
import { MOB_CREEPER } from '../../mobs'; // Fase 6.5 (colecciones)
import { standable } from '../pathfind';
import { EFFECTS, MAX_EFFECT_AMP, MAX_EFFECT_SECONDS, effectByName } from '../../effects';
import type { ServerContext, Session } from './context';
import type { Raids } from './raids'; // Fase 6 (asaltos)
import { locateStructure, STRUCTURE_NAMES } from '../../world/structures';
import { enchantByName, MAX_ENCHANT_LEVEL } from '../../enchantments'; // Fase 7 (encantamientos)

/** Nombres que acepta /localizar (sin tildes, en minúsculas). */
export const STRUCTURE_ALIASES: Readonly<Record<string, string>> = {
  templo_del_desierto: 'desert_pyramid', templo_desierto: 'desert_pyramid', piramide: 'desert_pyramid',
  templo_de_la_jungla: 'jungle_temple', templo_jungla: 'jungle_temple', naufragio: 'shipwreck',
  portal_en_ruinas: 'ruined_portal', portal: 'ruined_portal', iglu: 'igloo', pozo_del_desierto: 'desert_well',
  pozo: 'desert_well', mina_abandonada: 'mineshaft', mina: 'mineshaft',
  aldea: 'village',
  puesto: 'pillager_outpost', puesto_de_saqueadores: 'pillager_outpost', puesto_saqueador: 'pillager_outpost', // Fase 6 (asaltos)
  // Fase 7.5 (océano)
  monumento: 'monument', monumento_oceanico: 'monument', ruinas: 'ocean_ruins', ruinas_oceanicas: 'ocean_ruins',
  tesoro: 'buried_treasure', tesoro_enterrado: 'buried_treasure',
  cabana_de_bruja: 'swamp_hut', cabana: 'swamp_hut', choza_de_bruja: 'swamp_hut', fosil: 'fossil', fosiles: 'fossil', // Fase 7.5 (fauna)
  mansion: 'mansion', mansion_del_bosque: 'mansion', // Fase 7.5 (mansión)
};

export class Commands {
  /** Fase 6 (asaltos): para /asalto y /patrulla. */
  raids: Raids | null = null;
  /** Fase 6.5 (colecciones): para /invocar rayo. */
  lightning: ((x: number, y: number, z: number) => void) | null = null;

  constructor(private ctx: ServerContext) {}

  run(s: Session, line: string): void {
    const ctx = this.ctx;
    const [cmdRaw, ...args] = line.slice(1).split(/\s+/);
    const cmd = cmdRaw.toLowerCase();
    const reply = (m: string) => ctx.tell(s, m);
    const norm = (v: string) => v.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    switch (cmd) {
      case 'time':
      case 'hora': {
        const sub = norm(args[0] ?? '');
        const val = norm(args[1] ?? args[0] ?? '');
        const presets = new Map<string, number>([
          ['day', 0.05], ['dia', 0.05], ['noon', 0.25], ['mediodia', 0.25], ['sunset', 0.47], ['atardecer', 0.47],
          ['night', 0.55], ['noche', 0.55], ['midnight', 0.75], ['medianoche', 0.75], ['sunrise', 0.98], ['amanecer', 0.98],
        ]);
        const now = ctx.worldTime();
        const day = Math.floor(now);
        let target: number | null = null;
        if (presets.has(val)) target = presets.get(val)!;
        else if (/^\d+(\.\d+)?$/.test(val)) target = (Number(val) % 24000) / 24000;
        if (target === null || !Number.isFinite(target) || (sub !== 'set' && !presets.has(sub) && !/^\d/.test(sub))) {
          reply('Uso: /time set <dia|mediodia|atardecer|noche|medianoche|amanecer|0-24000>');
          return;
        }
        ctx.setTime(day + (target < now - day ? 1 : 0) + target);
        ctx.broadcast({ t: 'chat', id: null, name: '', m: `${s.name} cambió la hora del día.` });
        return;
      }
      case 'gamemode':
      case 'modo': {
        const v = norm(args[0] ?? '');
        const mode: GameMode | null = ['s', '0', 'survival', 'supervivencia'].includes(v) ? 's'
          : ['c', '1', 'creative', 'creativo'].includes(v) ? 'c' : null;
        if (!mode) {
          reply('Uso: /modo <supervivencia|creativo>');
          return;
        }
        s.mode = mode;
        ctx.savePlayer(s);
        ctx.send(s, { t: 'gm', m: mode });
        ctx.broadcast({ t: 'chat', id: null, name: '', m: `${s.name} pasó al modo ${mode === 's' ? 'supervivencia' : 'creativo'}.` });
        return;
      }
      case 'difficulty':
      case 'dificultad': {
        const v = norm(args[0] ?? '');
        const map: Record<string, number> = {
          pacifico: 0, peaceful: 0, '0': 0, facil: 1, easy: 1, '1': 1, normal: 2, '2': 2, dificil: 3, hard: 3, '3': 3,
        };
        if (!(v in map)) {
          reply('Uso: /dificultad <pacifico|facil|normal|dificil>');
          return;
        }
        ctx.setDifficulty(map[v]);
        const names = ['pacífica', 'fácil', 'normal', 'difícil'];
        ctx.broadcast({ t: 'chat', id: null, name: '', m: `Dificultad: ${names[ctx.difficulty]}.` });
        return;
      }
      case 'effect':
      case 'efecto': {
        // /efecto <efecto> [segundos] [nivel] · /efecto quitar
        const v = norm(args[0] ?? '');
        if (v === 'quitar' || v === 'clear') {
          ctx.send(s, { t: 'effect', id: 0, s: 0, a: 0 });
          return;
        }
        const def = effectByName(args[0] ?? '');
        if (!def) {
          reply('Uso: /efecto <' + Object.values(EFFECTS).map((e) => e.key).join('|') + '> [segundos] [nivel] · /efecto quitar');
          return;
        }
        const secs = Math.max(1, Math.min(MAX_EFFECT_SECONDS, Math.floor(Number(args[1]) || 30)));
        const amp = Math.max(0, Math.min(MAX_EFFECT_AMP, Math.floor(Number(args[2]) || 1) - 1));
        ctx.send(s, { t: 'effect', id: def.id, s: secs, a: amp });
        return;
      }
      case 'kill':
      case 'matar':
        ctx.send(s, { t: 'hurt', a: 1000, k: [0, 0, 0], c: 'kill' });
        return;
      case 'summon':
      case 'invocar': {
        const v = norm(args[0] ?? '');
        // Fase 6.5 (colecciones): /invocar rayo (a 3 bloques delante, en lo alto de la columna).
        if ((v === 'rayo' || v === 'lightning_bolt') && this.lightning) {
          const lx = Math.floor(s.p[0] - Math.sin(s.r[0]) * 3), lz = Math.floor(s.p[2] - Math.cos(s.r[0]) * 3);
          this.lightning(lx + 0.5, ctx.world.skyTop(lx, lz) + 1, lz + 0.5);
          return;
        }
        // Fase 6: también con guiones bajos en vez de espacios (como sugiere el autocompletado: gólem_de_hierro).
        const def = MOB_TYPES.map((t) => MOBS[t]).find((m) => m.key === v || norm(m.name) === v || norm(m.name).replace(/\s+/g, '_') === v);
        if (!def) {
          reply('Uso: /invocar <' + MOB_TYPES.map((t) => norm(MOBS[t].name)).join('|') + '>');
          return;
        }
        // Delante del jugador, en el primer hueco donde quepa de pie.
        const a = s.r[0];
        const tx = Math.floor(s.p[0] - Math.sin(a) * 3), tz = Math.floor(s.p[2] - Math.cos(a) * 3);
        ctx.world.ensureChunk(Math.floor(tx / 16), Math.floor(tz / 16), ctx.now());
        const h = Math.ceil(def.height);
        let y = Math.floor(s.p[1]);
        let found = false;
        for (let dy = 0; dy <= 12 && !found; dy++) {
          for (const cand of [y + dy, y - dy]) {
            if (standable(ctx.world, tx, cand, tz, h)) {
              y = cand;
              found = true;
              break;
            }
          }
        }
        const mob = found ? ctx.entities.spawnMob(def.id, tx + 0.5, y, tz + 0.5) : ctx.entities.spawnMob(def.id, s.p[0], s.p[1] + 0.1, s.p[2]);
        // Fase 6.5 (colecciones): /invocar creeper cargado.
        if (mob && def.id === MOB_CREEPER && norm(args[1] ?? '') === 'cargado') mob.charged = true;
        return;
      }
      case 'give':
      case 'dar': {
        const v = norm(args[0] ?? '');
        const item = ITEMS.find((it) => it && (it.key === v || norm(it.name) === v.replace(/_/g, ' ')));
        if (!item) {
          reply('Uso: /dar <objeto> [cantidad] (por ejemplo: /dar diamond 5, /dar iron_pickaxe)');
          return;
        }
        let n = Math.max(1, Math.min(64 * 9, Number(args[1]) || 1));
        while (n > 0) {
          const c = Math.min(n, maxStack(item.id));
          ctx.entities.spawnItem({ id: item.id, count: c }, s.p[0], s.p[1] + 0.5, s.p[2], 0, 0, 0, undefined, 0);
          n -= c;
        }
        return;
      }
      case 'locate':
      case 'localizar': {
        // /localizar <estructura>: la más cercana de ese tipo.
        const want = norm(args.join('_'));
        const key = Object.keys(STRUCTURE_ALIASES).find((a) => a === want);
        if (!key) {
          reply('Uso: /localizar <templo_del_desierto|templo_de_la_jungla|naufragio|portal_en_ruinas|iglu|pozo|mina|aldea|puesto|monumento|ruinas|tesoro|cabana_de_bruja|fosil|mansion>');
          return;
        }
        const type = STRUCTURE_ALIASES[key];
        const p = locateStructure(ctx.world.gen, type, Math.floor(s.p[0]), Math.floor(s.p[2]));
        // Fase 7.5 (mansión): con el género del nombre («ninguna mansión», «aldea más cercana»).
        const fem = /^(Aldea|Mina|Mansión)/.test(STRUCTURE_NAMES[type]);
        if (!p) reply(`No hay ${fem ? 'ninguna' : 'ningún'} ${STRUCTURE_NAMES[type].toLowerCase()} cerca.`);
        else reply(`${STRUCTURE_NAMES[type]} más ${fem ? 'cercana' : 'cercano'}: x ${p[0]}, y ${p[1]}, z ${p[2]} (a ${Math.round(Math.hypot(p[0] - s.p[0], p[2] - s.p[2]))} bloques).`);
        return;
      }
      // Fase 6 (asaltos): lanzar un asalto en la aldea más cercana (hasta 200 bloques) o una patrulla.
      case 'asalto':
      case 'raid': {
        if (!this.raids) return;
        const v = locateStructure(ctx.world.gen, 'village', Math.floor(s.p[0]), Math.floor(s.p[2]), 1);
        if (!v || Math.hypot(v[0] - s.p[0], v[2] - s.p[2]) > 200) {
          reply('No hay ninguna aldea cerca (a menos de 200 bloques).');
          return;
        }
        if (ctx.difficulty === 0) {
          reply('En dificultad pacífica no hay asaltos.');
          return;
        }
        this.raids.start(v[0], v[1], v[2]);
        ctx.broadcast({ t: 'chat', id: null, name: '', m: `${s.name} desató un asalto en la aldea de x ${v[0]}, z ${v[2]}.` });
        return;
      }
      case 'patrulla':
      case 'patrol': {
        if (!this.raids) return;
        const n = this.raids.spawnPatrol(s.p[0], s.p[2]).length;
        reply(n ? `Aparece una patrulla de ${n} saqueadores cerca.` : 'No hay sitio para una patrulla aquí.');
        return;
      }
      // Fase 7 (encantamientos): /encantar <encantamiento> [nivel] (al objeto de la mano; lo aplica el cliente)
      // y /experiencia <cantidad> [niveles|puntos].
      case 'enchant':
      case 'encantar': {
        const def = enchantByName(args[0] ?? '');
        if (!def) {
          reply('Uso: /encantar <encantamiento> [nivel] (por ejemplo: /encantar filo 5, /encantar toque_de_seda)');
          return;
        }
        const lvl = Math.max(1, Math.min(MAX_ENCHANT_LEVEL, Math.floor(Number(args[1]) || 1)));
        ctx.send(s, { t: 'ench', e: [[def.id, lvl]] });
        return;
      }
      case 'xp':
      case 'experiencia': {
        const n = Math.floor(Number(args[0]));
        const unit = norm(args[1] ?? 'puntos');
        if (!Number.isFinite(n) || n <= 0 || n > 1_000_000) {
          reply('Uso: /experiencia <cantidad> [puntos|niveles]');
          return;
        }
        if (unit.startsWith('nivel') || unit === 'levels' || unit === 'l') ctx.send(s, { t: 'xp', n: 0, l: Math.min(n, 10_000) });
        else ctx.send(s, { t: 'xp', n });
        return;
      }
      case 'seed':
      case 'semilla':
        reply(`Semilla del mundo: ${ctx.seed}`);
        return;
      case 'list':
      case 'lista':
        reply('Jugadores: ' + [...ctx.sessions()].filter((o) => o.joined).map((o) => o.name).join(', '));
        return;
      case 'help':
      case 'ayuda':
        reply(
          'Comandos: /modo <supervivencia|creativo>, /dificultad <pacifico|facil|normal|dificil>, ' +
          '/time set <dia|noche|...>, /invocar <criatura>, /dar <objeto> [n], /efecto <efecto> [s] [nivel], /matar, ' +
          '/seed, /lista, /tp <jugador>, /localizar <estructura>, /asalto, /patrulla, /encantar <encantamiento> [nivel], ' +
          '/experiencia <n> [puntos|niveles]',
        );
        return;
      default:
        if (cmd !== 'tp') reply(`Comando desconocido: /${cmdRaw}. Escribe /ayuda.`);
    }
  }
}
