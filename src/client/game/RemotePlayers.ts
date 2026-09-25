// Jugadores remotos: interpolación de instantáneas y estado de animación.
import type { PlayerInfo } from '../../shared/protocol';
import { STATE_SNEAK, STATE_SLEEP, STATE_PRONE, STATE_EAT, STATE_BOW, STATE_BLOCK } from '../../shared/protocol';
import { STATE_GLOWING } from '../../shared/effects'; // Fase 7 (efectos)
import type { RemotePlayerView } from '../render/EntityRenderer';

interface Snapshot {
  t: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  s: number;
}

const INTERP_DELAY = 190; // ms (las posiciones llegan a ~8 Hz)

const TAU = Math.PI * 2;

/** Diferencia angular en (-π, π] sin bucles (robusto ante valores enormes). */
function angleDiff(a: number, b: number): number {
  const d = (((b - a) % TAU) + TAU * 1.5) % TAU - Math.PI;
  return Number.isFinite(d) ? d : 0;
}

function angleLerp(a: number, b: number, t: number): number {
  return a + angleDiff(a, b) * t;
}

function wrapAngle(a: number): number {
  return Number.isFinite(a) ? ((a % TAU) + TAU) % TAU : 0;
}

/** Armadura que llega de la red: 4 ids enteros (el servidor ya valida cada ranura). */
function armorFrom(a: unknown): number[] {
  const src = Array.isArray(a) ? a : [];
  return [0, 1, 2, 3].map((i) => (Number.isInteger(src[i]) && src[i] > 0 ? src[i] : 0));
}

/** Id de objeto que llega de la red (0 = nada). */
function itemFrom(v: unknown): number {
  return Number.isInteger(v) && (v as number) > 0 ? (v as number) : 0;
}

export class RemotePlayer {
  readonly id: string;
  name: string;
  shirt: string;
  private snaps: Snapshot[] = [];
  view: RemotePlayerView;
  private lastX = 0;
  private lastZ = 0;
  swingTime = -1;
  nameTag: HTMLDivElement | null = null;
  /** Fase 7 (pociones): color de los remolinos de sus efectos (0xRRGGBB; 0 sin efectos). */
  effectColor = 0;

  constructor(info: PlayerInfo) {
    this.id = info.id;
    this.name = info.name;
    this.shirt = info.shirt;
    const now = performance.now();
    this.snaps.push({ t: now, x: info.p[0], y: info.p[1], z: info.p[2], yaw: info.r[0], pitch: info.r[1], s: info.s });
    this.view = {
      id: info.id, name: info.name, shirt: info.shirt, x: info.p[0], y: info.p[1], z: info.p[2],
      bodyYaw: info.r[0], headYaw: info.r[0], pitch: info.r[1], walkPhase: 0, walkAmount: 0, swing: 0,
      sneaking: false, light: [1, 0], armor: armorFrom(info.a), held: itemFrom(info.h), offhand: itemFrom(info.o),
      glint: (Number(info.g) | 0) & 0x3f, // Fase 7 (encantamientos)
    };
    this.lastX = info.p[0];
    this.lastZ = info.p[2];
  }

  push(p: [number, number, number], r: [number, number], s: number, a?: number[], h?: number, o?: number, g?: number): void {
    if (!Array.isArray(p) || !Array.isArray(r) || ![p[0], p[1], p[2], r[0], r[1]].every(Number.isFinite)) return;
    this.view.glint = (Number(g) | 0) & 0x3f; // Fase 7 (encantamientos): cada 'pos' trae el brillo (sin él, nada)
    // La armadura y lo que lleva en las manos se cambian al instante (no se interpolan).
    if (a !== undefined) this.view.armor = armorFrom(a);
    if (h !== undefined) this.view.held = itemFrom(h);
    if (o !== undefined) this.view.offhand = itemFrom(o);
    const now = performance.now();
    const pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, r[1]));
    this.snaps.push({ t: now, x: p[0], y: p[1], z: p[2], yaw: wrapAngle(r[0]), pitch, s: s | 0 });
    if (this.snaps.length > 20) this.snaps.shift();
  }

  swing(): void {
    this.swingTime = performance.now();
  }

  /** Bits de estado más recientes (agachado, volando, muerto...). */
  get state(): number {
    return this.snaps[this.snaps.length - 1].s;
  }

  update(dt: number): void {
    const now = performance.now();
    const rt = now - INTERP_DELAY;
    const s = this.snaps;
    let a = s[0], b = s[s.length - 1];
    for (let i = 0; i < s.length - 1; i++) {
      if (s[i].t <= rt && s[i + 1].t >= rt) {
        a = s[i];
        b = s[i + 1];
        break;
      }
    }
    let t = b.t > a.t ? (rt - a.t) / (b.t - a.t) : 1;
    t = Math.max(0, Math.min(1, t));
    if (rt > b.t) t = 1;
    const v = this.view;
    v.x = a.x + (b.x - a.x) * t;
    v.y = a.y + (b.y - a.y) * t;
    v.z = a.z + (b.z - a.z) * t;
    v.headYaw = angleLerp(a.yaw, b.yaw, t);
    v.pitch = a.pitch + (b.pitch - a.pitch) * t;
    v.sneaking = (b.s & STATE_SNEAK) !== 0;
    v.sleeping = (b.s & STATE_SLEEP) !== 0;
    v.prone = (b.s & STATE_PRONE) !== 0;
    v.glowing = (b.s & STATE_GLOWING) !== 0; // Fase 7 (efectos)
    v.use = b.s & STATE_EAT ? 'eat' : b.s & STATE_BOW ? 'bow' : b.s & STATE_BLOCK ? 'block' : null;
    // Animación de caminar según la velocidad horizontal.
    const mv = Math.hypot(v.x - this.lastX, v.z - this.lastZ);
    this.lastX = v.x;
    this.lastZ = v.z;
    const speed = dt > 0 ? mv / dt : 0;
    const target = Math.min(1, speed / 4.3);
    v.walkAmount += (target - v.walkAmount) * (1 - Math.exp(-dt * 8));
    v.walkPhase += mv * 2.2;
    // El cuerpo sigue a la cabeza (y a la dirección de marcha).
    v.headYaw = wrapAngle(v.headYaw);
    v.bodyYaw = wrapAngle(v.bodyYaw);
    const diff = angleDiff(v.bodyYaw, v.headYaw);
    const limit = 0.9;
    if (diff > limit) v.bodyYaw += diff - limit;
    else if (diff < -limit) v.bodyYaw += diff + limit;
    if (v.walkAmount > 0.2) v.bodyYaw = angleLerp(v.bodyYaw, v.headYaw, 1 - Math.exp(-dt * 6));
    // Brazo al golpear/colocar.
    if (this.swingTime > 0) {
      const p = (now - this.swingTime) / 300;
      v.swing = p >= 1 ? 0 : p;
      if (p >= 1) this.swingTime = -1;
    }
  }
}
