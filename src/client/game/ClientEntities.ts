// Entidades en el cliente: réplica de las del servidor (criaturas, objetos, flechas, bloques que
// caen, orbes de experiencia) con interpolación entre instantáneas (se dibujan ~110 ms en el pasado
// para suavizar).
import { MOBS, ENT_ITEM, ENT_ARROW, ENT_FALLING, ENT_XP } from '../../shared/mobs';
import { EF_DEAD, EF_HURT, EF_ACTION, EF_BABY, type EntAdd, type EntUpd } from '../../shared/protocol';

interface Snap {
  t: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  body: number;
  pitch: number;
}

export interface ClientEntity {
  id: number;
  type: number;
  snaps: Snap[];
  x: number;
  y: number;
  z: number;
  yaw: number;
  bodyYaw: number;
  pitch: number;
  flags: number;
  /** Objetos: id y cantidad. Bloques que caen: id del bloque. Orbes: valor en `count`. */
  item: number;
  count: number;
  health: number;
  /** Animación de caminar. */
  walkPhase: number;
  walkAmount: number;
  /** Segundos desde que apareció (para animaciones) y desde el último golpe. */
  age: number;
  hurtT: number;
  deathT: number;
  /** Segundos desde que empezó su acción (mecha del creeper, tensar el arco); -1 si no. */
  actionT: number;
  /** Recogido por un jugador: vuela hacia él y desaparece. */
  collector: string | null;
  collectT: number;
  /** Retirado del servidor (se borra al terminar la animación). */
  gone: boolean;
  /** Semilla visual (giro de los objetos). */
  seed: number;
  lastX: number;
  lastZ: number;
}

const DELAY = 0.11;

const wrap = (a: number) => {
  let d = a % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
};

export class ClientEntities {
  readonly list = new Map<number, ClientEntity>();
  /** Posición de los jugadores (para la animación de recogida). */
  playerPos: (id: string) => [number, number, number] | null = () => null;
  /** Aviso de golpe recibido por una criatura (sonido/partículas se gestionan fuera). */
  onRemoved: ((e: ClientEntity) => void) | null = null;

  apply(msg: { a?: EntAdd[]; u?: EntUpd[]; rm?: (number | [number, string])[] }, now: number): void {
    for (const a of msg.a ?? []) {
      const [id, type, x, y, z, yaw, body, pitch, flags, e1, e2] = a;
      const prev = this.list.get(id);
      if (prev && !prev.gone) {
        this.push(prev, now, x, y, z, yaw, body, pitch, flags);
        continue;
      }
      const e: ClientEntity = {
        id, type, snaps: [{ t: now, x, y, z, yaw, body, pitch }], x, y, z, yaw, bodyYaw: body, pitch, flags,
        item: type === ENT_ITEM || type === ENT_FALLING ? e1 ?? 0 : 0,
        count: type === ENT_ITEM ? e2 ?? 1 : type === ENT_XP ? e1 ?? 1 : 1,
        health: MOBS[type] ? e1 ?? MOBS[type].health : 1,
        walkPhase: 0, walkAmount: 0, age: 0, hurtT: flags & EF_HURT ? 0 : 99, deathT: flags & EF_DEAD ? 0 : -1,
        actionT: flags & EF_ACTION ? 0 : -1,
        collector: null, collectT: 0, gone: false, seed: (id * 2654435761) % 1000 / 1000, lastX: x, lastZ: z,
      };
      this.list.set(id, e);
    }
    for (const u of msg.u ?? []) {
      const e = this.list.get(u[0]);
      if (!e || e.gone) continue;
      this.push(e, now, u[1], u[2], u[3], u[4], u[5], u[6], u[7]);
      if ((e.type === ENT_ITEM || e.type === ENT_XP) && u.length > 8) e.count = u[8];
    }
    for (const r of msg.rm ?? []) {
      const id = Array.isArray(r) ? r[0] : r;
      const e = this.list.get(id);
      if (!e) continue;
      if (Array.isArray(r) && r[1] && (e.type === ENT_ITEM || e.type === ENT_ARROW || e.type === ENT_XP)) {
        e.collector = r[1];
        e.collectT = 0;
        e.gone = true;
      } else if (MOBS[e.type] && e.deathT >= 0 && e.deathT < 1) {
        // Terminar la animación de muerte antes de borrarla.
        e.gone = true;
      } else {
        this.list.delete(id);
        this.onRemoved?.(e);
      }
    }
  }

  private push(e: ClientEntity, now: number, x: number, y: number, z: number, yaw: number, body: number, pitch: number, flags: number): void {
    if ((flags & EF_HURT) && !(e.flags & EF_HURT)) e.hurtT = 0;
    if ((flags & EF_DEAD) && e.deathT < 0) e.deathT = 0;
    if (flags & EF_ACTION) {
      if (e.actionT < 0) e.actionT = 0;
    } else e.actionT = -1;
    e.flags = flags;
    e.snaps.push({ t: now, x, y, z, yaw, body, pitch });
    if (e.snaps.length > 4) e.snaps.shift();
  }

  update(dt: number, now: number): void {
    const rt = now - DELAY;
    for (const [id, e] of this.list) {
      e.age += dt;
      e.hurtT += dt;
      if (e.deathT >= 0) e.deathT += dt;
      if (e.actionT >= 0) e.actionT += dt;
      if (e.collector) {
        e.collectT += dt;
        const p = this.playerPos(e.collector);
        if (p) {
          const k = Math.min(1, e.collectT / 0.15);
          e.x += (p[0] - e.x) * k;
          e.y += (p[1] + 0.8 - e.y) * k;
          e.z += (p[2] - e.z) * k;
        }
        if (e.collectT > 0.15 || !p) {
          this.list.delete(id);
          this.onRemoved?.(e);
        }
        continue;
      }
      if (e.gone && (e.deathT < 0 || e.deathT > 1.05)) {
        this.list.delete(id);
        this.onRemoved?.(e);
        continue;
      }
      // Interpolación entre las dos instantáneas que rodean el tiempo de dibujo.
      const s = e.snaps;
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
      e.x = a.x + (b.x - a.x) * t;
      e.y = a.y + (b.y - a.y) * t;
      e.z = a.z + (b.z - a.z) * t;
      e.yaw = a.yaw + wrap(b.yaw - a.yaw) * t;
      e.bodyYaw = a.body + wrap(b.body - a.body) * t;
      e.pitch = a.pitch + (b.pitch - a.pitch) * t;
      // Animación de caminar según la velocidad real.
      const moved = Math.hypot(e.x - e.lastX, e.z - e.lastZ);
      e.lastX = e.x;
      e.lastZ = e.z;
      const speed = dt > 0 ? moved / dt : 0;
      e.walkAmount += (Math.min(1, speed / 2.5) - e.walkAmount) * Math.min(1, dt * 10);
      e.walkPhase += moved * 2.2;
    }
  }

  /** Rayo contra las cajas de las criaturas: devuelve la más cercana antes de maxDist. */
  raycast(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxDist: number): { e: ClientEntity; dist: number } | null {
    let best: { e: ClientEntity; dist: number } | null = null;
    for (const e of this.list.values()) {
      const def = MOBS[e.type];
      if (!def || e.gone || e.deathT >= 0) continue;
      const k = e.flags & EF_BABY ? 0.5 : 1;
      const hw = (def.width * k) / 2 + 0.05;
      const mn = [e.x - hw, e.y, e.z - hw], mx = [e.x + hw, e.y + def.height * k, e.z + hw];
      let tmin = 0, tmax = maxDist;
      const o = [ox, oy, oz], d = [dx, dy, dz];
      let hit = true;
      for (let k = 0; k < 3; k++) {
        if (Math.abs(d[k]) < 1e-9) {
          if (o[k] < mn[k] || o[k] > mx[k]) {
            hit = false;
            break;
          }
          continue;
        }
        let t1 = (mn[k] - o[k]) / d[k], t2 = (mx[k] - o[k]) / d[k];
        if (t1 > t2) [t1, t2] = [t2, t1];
        tmin = Math.max(tmin, t1);
        tmax = Math.min(tmax, t2);
        if (tmin > tmax) {
          hit = false;
          break;
        }
      }
      if (hit && (!best || tmin < best.dist)) best = { e, dist: tmin };
    }
    return best;
  }

  clear(): void {
    this.list.clear();
  }
}
