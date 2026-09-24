// Física del jugador: caminar, correr, agacharse (sin caer por los bordes), saltar, nadar, volar,
// subir escalones bajos (losas, escaleras) y trepar por escaleras de mano.
import { BLOCK_SOLID, BLOCK_FLUID, BLOCK_FLUID_LEVEL, BLOCK_CLIMB, fluidHeight } from '../../shared/blocks';
import { moveBox, boxBlocked } from '../../shared/collide';
import { PLAYER_EYE_HEIGHT, PLAYER_HEIGHT, PLAYER_SNEAK_EYE_HEIGHT, PLAYER_WIDTH } from '../../shared/constants';

export interface BlockSource {
  /** Id del bloque o -1 si la columna no está cargada. */
  getBlock(x: number, y: number, z: number): number;
}

export interface MoveControls {
  forward: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
  jump: boolean;
  sneak: boolean;
  sprint: boolean;
}

const GRAVITY = 32;
const JUMP_VELOCITY = 9.0;
const HW = PLAYER_WIDTH / 2;
const EPS = 1e-4;

export class Player {
  x = 0;
  y = 100;
  z = 0;
  vx = 0;
  vy = 0;
  vz = 0;
  yaw = 0;
  pitch = 0;
  onGround = false;
  flying = false;
  sneaking = false;
  sprinting = false;
  inWater = false;
  eyeInWater = false;
  inLava = false;
  /** Distancia horizontal recorrida en el suelo (para pasos y balanceo). */
  walkDistance = 0;
  /** 0..1: cuánto se está moviendo (para animaciones). */
  walkAmount = 0;
  /** Velocidad vertical en el último aterrizaje (negativa). */
  landedSpeed = 0;
  justLanded = false;
  justEnteredWater = false;
  /** Distancia de caída acumulada (para el daño por caída). */
  fallDistance = 0;
  /** Caída total al aterrizar en este frame (0 si no aterrizó). */
  landedFall = 0;
  /** Impulso externo (golpes, explosiones) que se disipa poco a poco. */
  kx = 0;
  kz = 0;
  /** Corriente del agua en la que está (unitaria o cero). */
  flowX = 0;
  flowZ = 0;
  /** Multiplicador de velocidad (tensar el arco, comer). */
  slow = 1;
  /** Agarrado a una escalera de mano. */
  onLadder = false;
  /** Chocó horizontalmente en el último movimiento. */
  hitWall = false;
  private eyeOffset = PLAYER_EYE_HEIGHT;

  get eyeY(): number {
    return this.y + this.eyeOffset;
  }

  private collides(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number, world: BlockSource): boolean {
    return boxBlocked(world, minX, minY, minZ, maxX, maxY, maxZ);
  }

  /** ¿Toca alguna escalera de mano con el cuerpo? */
  private checkLadder(world: BlockSource): boolean {
    const x0 = Math.floor(this.x - HW - 0.02), x1 = Math.floor(this.x + HW + 0.02);
    const z0 = Math.floor(this.z - HW - 0.02), z1 = Math.floor(this.z + HW + 0.02);
    for (let y = Math.floor(this.y); y <= Math.floor(this.y + 1.2); y++) {
      for (let z = z0; z <= z1; z++) {
        for (let x = x0; x <= x1; x++) {
          const b = world.getBlock(x, y, z);
          if (b > 0 && BLOCK_CLIMB[b]) return true;
        }
      }
    }
    return false;
  }

  /** ¿Hay suelo bajo la caja si el jugador estuviera en (px, pz)? */
  private groundBelow(px: number, pz: number, world: BlockSource): boolean {
    return this.collides(px - HW, this.y - 0.6, pz - HW, px + HW, this.y - 0.01, pz + HW, world);
  }

  /** Altura de la superficie de un fluido en la celda (1 si hay fluido encima). */
  private fluidTop(world: BlockSource, x: number, y: number, z: number, id: number): number {
    const up = world.getBlock(x, y + 1, z);
    return y + (up > 0 && BLOCK_FLUID[up] === BLOCK_FLUID[id] ? 1 : fluidHeight(id));
  }

  private checkFluids(world: BlockSource): void {
    const wasInWater = this.inWater;
    let water = false;
    let lava = false;
    let fx = 0, fz = 0;
    const x0 = Math.floor(this.x - HW), x1 = Math.floor(this.x + HW - EPS);
    const z0 = Math.floor(this.z - HW), z1 = Math.floor(this.z + HW - EPS);
    const y0 = Math.floor(this.y + 0.1), y1 = Math.floor(this.y + 1.0);
    for (let y = y0; y <= y1; y++) {
      for (let z = z0; z <= z1; z++) {
        for (let x = x0; x <= x1; x++) {
          const b = world.getBlock(x, y, z);
          if (b <= 0) continue;
          const f = BLOCK_FLUID[b];
          if (!f || this.y + 0.05 >= this.fluidTop(world, x, y, z, b)) continue;
          if (f === 1) water = true;
          else lava = true;
          if (f === 1) {
            const [ax, az] = this.flowAt(world, x, y, z, b);
            fx += ax;
            fz += az;
          }
        }
      }
    }
    this.inWater = water;
    this.inLava = lava;
    const fl = Math.hypot(fx, fz);
    this.flowX = fl > 0.01 ? fx / fl : 0;
    this.flowZ = fl > 0.01 ? fz / fl : 0;
    const ex = Math.floor(this.x), ey = Math.floor(this.eyeY), ez = Math.floor(this.z);
    const eb = world.getBlock(ex, ey, ez);
    this.eyeInWater = eb > 0 && BLOCK_FLUID[eb] === 1 && this.eyeY < this.fluidTop(world, ex, ey, ez, eb) - 0.02;
    this.justEnteredWater = water && !wasInWater && this.vy < -3;
  }

  /** Dirección de la corriente en una celda de agua (hacia los niveles más bajos y los bordes). */
  private flowAt(world: BlockSource, x: number, y: number, z: number, id: number): [number, number] {
    const lvl = BLOCK_FLUID_LEVEL[id];
    const depth = lvl >= 8 ? 0 : lvl;
    let fx = 0, fz = 0;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = world.getBlock(x + dx, y, z + dz);
      if (n < 0) continue;
      if (BLOCK_FLUID[n] === 1) {
        const nl = BLOCK_FLUID_LEVEL[n];
        const d = (nl >= 8 ? 0 : nl) - depth;
        fx += dx * d;
        fz += dz * d;
      } else if (!BLOCK_SOLID[n]) {
        // Hacia un hueco: la corriente sale por el borde (sobre todo si cae).
        const below = world.getBlock(x + dx, y - 1, z + dz);
        const k = below > 0 && BLOCK_FLUID[below] === 1 ? 3 : lvl > 0 ? 1 : 0;
        fx += dx * k;
        fz += dz * k;
      }
    }
    return [fx, fz];
  }

  /** Empujón (golpe, explosión). */
  impulse(kx: number, ky: number, kz: number): void {
    this.kx += kx;
    this.kz += kz;
    if (ky > 0) {
      this.vy = Math.max(this.vy, ky);
      this.onGround = false;
    }
  }

  update(dt: number, c: MoveControls, world: BlockSource): void {
    dt = Math.min(dt, 0.05);
    this.checkFluids(world);
    this.onLadder = !this.flying && this.checkLadder(world);
    const wasGround = this.onGround;
    const fwd = (c.forward ? 1 : 0) - (c.back ? 1 : 0);
    const str = (c.right ? 1 : 0) - (c.left ? 1 : 0);
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    let wx = -sy * fwd + cy * str;
    let wz = -cy * fwd - sy * str;
    const wl = Math.hypot(wx, wz);
    if (wl > 1) { wx /= wl; wz /= wl; }

    this.sneaking = c.sneak && !this.flying;
    if (fwd <= 0 || this.sneaking || this.slow < 1) this.sprinting = false;
    else if (c.sprint) this.sprinting = true;
    const targetEye = this.sneaking ? PLAYER_SNEAK_EYE_HEIGHT : PLAYER_EYE_HEIGHT;
    this.eyeOffset += (targetEye - this.eyeOffset) * (1 - Math.exp(-dt * 14));

    if (this.flying) {
      const speed = this.sprinting ? 21.6 : 10.9;
      const k = 1 - Math.exp(-dt * 8);
      this.vx += (wx * speed - this.vx) * k;
      this.vz += (wz * speed - this.vz) * k;
      const vyT = ((c.jump ? 1 : 0) - (c.sneak ? 1 : 0)) * (this.sprinting ? 12 : 8);
      this.vy += (vyT - this.vy) * (1 - Math.exp(-dt * 10));
    } else if (this.inWater || this.inLava) {
      const speed = (this.inLava ? 1.2 : this.sprinting ? 3.6 : 2.4) * this.slow;
      const k = 1 - Math.exp(-dt * 6);
      // La corriente arrastra (velocidad objetivo desplazada en su dirección).
      this.vx += (wx * speed + this.flowX * 2.2 - this.vx) * k;
      this.vz += (wz * speed + this.flowZ * 2.2 - this.vz) * k;
      this.vy -= (this.inLava ? 5 : 8) * dt;
      this.vy *= Math.exp(-dt * 2.2);
      if (c.jump) this.vy += 26 * dt;
      if (c.sneak) this.vy -= 14 * dt;
      this.vy = Math.max(-4.5, Math.min(4.2, this.vy));
      // Salir del agua trepando a la orilla.
      if (c.jump && this.inWater && !this.eyeInWater && this.touchingWall(world)) this.vy = Math.max(this.vy, 5.5);
    } else {
      const speed = (this.sneaking ? 1.31 : this.sprinting ? 5.61 : 4.32) * this.slow;
      const k = 1 - Math.exp(-dt * (this.onGround ? 16 : 3.2));
      this.vx += (wx * speed - this.vx) * k;
      this.vz += (wz * speed - this.vz) * k;
      this.vy -= GRAVITY * dt;
      if (this.vy < -78) this.vy = -78;
      if (this.onLadder) {
        // Escalera de mano: se baja despacio, se sube saltando o empujando contra ella y
        // agachado se queda quieto.
        this.fallDistance = 0;
        if (this.vy < -3) this.vy = -3;
        if (c.jump || (this.hitWall && (c.forward || c.back || c.left || c.right))) this.vy = 2.4;
        else if (c.sneak && this.vy < 0) this.vy = 0;
      } else if (c.jump && this.onGround) {
        this.vy = JUMP_VELOCITY;
        this.onGround = false;
        if (this.sprinting) {
          this.vx += -sy * 1.2;
          this.vz += -cy * 1.2;
        }
      }
    }

    // Impulso externo (se disipa en ~0.4 s).
    const kd = Math.exp(-dt * (this.onGround ? 7 : 2.5));
    this.kx *= kd;
    this.kz *= kd;
    if (Math.abs(this.kx) < 0.01) this.kx = 0;
    if (Math.abs(this.kz) < 0.01) this.kz = 0;
    let dx = (this.vx + this.kx) * dt;
    const dy = this.vy * dt;
    let dz = (this.vz + this.kz) * dt;
    // Agachado: no caer por los bordes.
    if (this.sneaking && this.onGround && !this.inWater) {
      if (dx !== 0 && !this.groundBelow(this.x + dx, this.z, world)) { dx = 0; this.vx = 0; }
      if (dz !== 0 && !this.groundBelow(this.x, this.z + dz, world)) { dz = 0; this.vz = 0; }
      if (dx !== 0 && dz !== 0 && !this.groundBelow(this.x + dx, this.z + dz, world)) { dz = 0; this.vz = 0; }
    }
    const prevVy = this.vy;
    const ox = this.x, oy = this.y, oz = this.z;
    // Colisión por cajas con subida automática de escalones de hasta 0,6 bloques.
    const r = moveBox(world, this.x, this.y, this.z, PLAYER_WIDTH, PLAYER_HEIGHT, dx, dy, dz, this.flying ? 0 : 0.6, wasGround);
    this.x += r.dx;
    this.y += r.dy;
    this.z += r.dz;
    if (r.hitX) {
      this.vx = 0;
      this.kx = 0;
    }
    if (r.hitZ) {
      this.vz = 0;
      this.kz = 0;
    }
    if (r.hitY) this.vy = 0;
    this.onGround = r.onGround;
    this.hitWall = r.hitX || r.hitZ;
    if (this.flying && this.onGround) this.flying = false;
    this.justLanded = this.onGround && !wasGround;
    this.landedSpeed = this.justLanded ? prevVy : 0;
    // Distancia de caída: se acumula al bajar y se consume al aterrizar (el agua la anula).
    this.landedFall = 0;
    if (this.flying || this.inWater) this.fallDistance = 0;
    else if (this.y < oy) this.fallDistance += oy - this.y;
    if (this.onGround) {
      if (this.justLanded) this.landedFall = this.fallDistance;
      this.fallDistance = 0;
    }
    const moved = Math.hypot(this.x - ox, this.z - oz);
    if (this.onGround) this.walkDistance += moved;
    const target = this.onGround && moved > 0.001 ? Math.min(1, moved / dt / 4.3) : 0;
    this.walkAmount += (target - this.walkAmount) * (1 - Math.exp(-dt * 10));
  }

  private touchingWall(world: BlockSource): boolean {
    const y0 = this.y + 0.3, y1 = this.y + 0.9;
    return this.collides(this.x - HW - 0.05, y0, this.z - HW - 0.05, this.x + HW + 0.05, y1, this.z + HW + 0.05, world);
  }

  /** ¿La caja del jugador ocupa la celda (bx, by, bz)? */
  intersectsBlock(bx: number, by: number, bz: number): boolean {
    return (
      this.x + HW > bx && this.x - HW < bx + 1 &&
      this.y + PLAYER_HEIGHT > by && this.y < by + 1 &&
      this.z + HW > bz && this.z - HW < bz + 1
    );
  }

  /** Sube al jugador hasta que no esté dentro de bloques sólidos. */
  unstuck(world: BlockSource): void {
    for (let i = 0; i < 256; i++) {
      if (!this.collides(this.x - HW, this.y, this.z - HW, this.x + HW, this.y + PLAYER_HEIGHT, this.z + HW, world)) return;
      this.y = Math.floor(this.y) + 1;
    }
  }
}
