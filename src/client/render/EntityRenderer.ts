// Entidades: jugadores (modelo de cajas con skin procedural y armadura), partículas de bloques,
// contorno de selección y bloque sostenido en primera persona.
import { mat4 } from 'gl-matrix';
import { Program, type GL } from '../engine/gl';
import {
  ENTITY_VS, ENTITY_FS, ENTITY_SHADOW_VS, ENTITY_SHADOW_FS, OUTLINE_VS, OUTLINE_FS, PARTICLE_VS, PARTICLE_FS,
} from './shaders/entity';
import { ARMOR_FS } from './shaders/armor';
import { buildBox, drawSkin, skinColorsFor, PART_LAYOUT } from './PlayerSkin';
import type { BlockTextures } from './BlockTextures';
import { BLOCK_TEX } from '../../shared/blocks';
import { ITEMS } from '../../shared/items';
import { ARMOR_MATERIALS, type ArmorMaterial } from '../../shared/armor';
import { ARMOR_BOXES, ARMOR_SHINE, generateArmorTexture, type BodyPart } from '../textures/armorTextures';

export interface RemotePlayerView {
  id: string;
  name: string;
  shirt: string;
  x: number;
  y: number;
  z: number;
  bodyYaw: number;
  headYaw: number;
  pitch: number;
  walkPhase: number;
  walkAmount: number;
  swing: number;
  sneaking: boolean;
  /** Tumbado en una cama (la cabeza hacia donde mira). */
  sleeping?: boolean;
  light: [number, number];
  /** Armadura puesta: ids [cabeza, pecho, piernas, pies] (0 = nada). */
  armor?: number[];
}

interface PartMesh {
  vao: WebGLVertexArrayObject;
  count: number;
}

/** Caja de armadura de una parte del cuerpo y la ranura que la muestra. */
interface ArmorMesh {
  mesh: PartMesh;
  slot: number;
}

const PX = 1.8 / 32;
const MAX_PARTICLES = 1024;

interface Particle {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number; max: number; size: number;
  layer: number; u: number; v: number; light: number;
  smoke?: boolean;
}

export class EntityRenderer {
  private gl: GL;
  private textures: BlockTextures;
  private pEntity: Program;
  private pEntityShadow: Program;
  private pOutline: Program;
  private pParticle: Program;
  private pArmor: Program;
  private parts: Record<BodyPart, PartMesh>;
  /** Cajas de armadura de cada parte del cuerpo. */
  private armorParts = new Map<BodyPart, ArmorMesh[]>();
  private armorTex = new Map<ArmorMaterial, WebGLTexture>();
  private skins = new Map<string, { key: string; tex: WebGLTexture }>();
  private outlineVao: WebGLVertexArrayObject;
  private particles: Particle[] = [];
  private particleData = new Float32Array(MAX_PARTICLES * 8);
  private particleBuf: WebGLBuffer;
  private particleVao: WebGLVertexArrayObject;
  private m = mat4.create();
  private tmp = mat4.create();

  constructor(gl: GL, textures: BlockTextures) {
    this.gl = gl;
    this.textures = textures;
    this.pEntity = new Program(gl, { name: 'entity', vs: ENTITY_VS, fs: ENTITY_FS });
    this.pEntityShadow = new Program(gl, { name: 'entity-shadow', vs: ENTITY_SHADOW_VS, fs: ENTITY_SHADOW_FS });
    this.pOutline = new Program(gl, { name: 'outline', vs: OUTLINE_VS, fs: OUTLINE_FS });
    this.pParticle = new Program(gl, { name: 'particle', vs: PARTICLE_VS, fs: PARTICLE_FS });
    this.pArmor = new Program(gl, { name: 'armor', vs: ENTITY_VS, fs: ARMOR_FS });

    const mk = (min: [number, number, number], max: [number, number, number], layout: { u: number; v: number; w: number; h: number; d: number }) => {
      const b = buildBox(min, max, layout, PX);
      const vao = gl.createVertexArray()!;
      gl.bindVertexArray(vao);
      const attr = (loc: number, data: Float32Array, size: number) => {
        const buf = gl.createBuffer()!;
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
      };
      attr(0, b.pos, 3);
      attr(1, b.nrm, 3);
      attr(2, b.uv, 2);
      const ib = gl.createBuffer()!;
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, b.idx, gl.STATIC_DRAW);
      gl.bindVertexArray(null);
      return { vao, count: 36 };
    };
    this.parts = {
      head: mk([-4, 0, -4], [4, 8, 4], PART_LAYOUT.head),
      body: mk([-4, 0, -2], [4, 12, 2], PART_LAYOUT.body),
      rightArm: mk([-2, -10, -2], [2, 2, 2], PART_LAYOUT.rightArm),
      leftArm: mk([-2, -10, -2], [2, 2, 2], PART_LAYOUT.leftArm),
      rightLeg: mk([-2, -12, -2], [2, 0, 2], PART_LAYOUT.rightLeg),
      leftLeg: mk([-2, -12, -2], [2, 0, 2], PART_LAYOUT.leftLeg),
    };

    // Armadura: las cajas (brazos y piernas comparten malla) y una textura por material.
    for (const box of ARMOR_BOXES) {
      const mesh = mk(box.min, box.max, box.layout);
      for (const part of box.parts) {
        const list = this.armorParts.get(part) ?? [];
        list.push({ mesh, slot: box.slot });
        this.armorParts.set(part, list);
      }
    }
    for (const mat of ARMOR_MATERIALS) {
      const t = generateArmorTexture(mat);
      const tex = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, t.width, t.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, t.rgba);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      this.armorTex.set(mat, tex);
    }

    // Contorno: 12 aristas de un cubo unitario.
    const e: number[] = [];
    const c = [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1], [0, 1, 0], [1, 1, 0], [1, 1, 1], [0, 1, 1]];
    const edges = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
    for (const [a, b] of edges) e.push(...c[a], ...c[b]);
    this.outlineVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.outlineVao);
    const ob = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, ob);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(e), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    // Partículas instanciadas.
    this.particleVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.particleVao);
    this.particleBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.particleBuf);
    gl.bufferData(gl.ARRAY_BUFFER, this.particleData.byteLength, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 32, 0);
    gl.vertexAttribDivisor(0, 1);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 32, 16);
    gl.vertexAttribDivisor(1, 1);
    gl.bindVertexArray(null);
  }

  // ---------------------------------------------------------------- jugadores

  private skinFor(p: RemotePlayerView): WebGLTexture {
    const key = p.name + '|' + p.shirt;
    const cached = this.skins.get(p.id);
    if (cached && cached.key === key) return cached.tex;
    const gl = this.gl;
    if (cached) gl.deleteTexture(cached.tex);
    const canvas = drawSkin(skinColorsFor(p.name, p.shirt));
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.skins.set(p.id, { key, tex });
    return tex;
  }

  /** Libera skins de jugadores que ya no están. */
  prune(ids: Set<string>): void {
    for (const [id, s] of this.skins) {
      if (!ids.has(id)) {
        this.gl.deleteTexture(s.tex);
        this.skins.delete(id);
      }
    }
  }

  private forEachPart(p: RemotePlayerView, camX: number, camY: number, camZ: number, fn: (part: BodyPart, m: mat4) => void): void {
    const root = mat4.create();
    const sneak = p.sneaking && !p.sleeping;
    mat4.translate(root, root, [p.x - camX, p.y - camY - (sneak ? 0.12 : 0), p.z - camZ]);
    if (p.sleeping) {
      // Boca arriba, con la cabeza hacia la cabecera de la cama.
      mat4.rotateY(root, root, p.headYaw + Math.PI);
      mat4.translate(root, root, [0, 0.15, -0.45]);
      mat4.rotateX(root, root, Math.PI / 2);
    } else mat4.rotateY(root, root, p.bodyYaw);
    const legSwing = p.sleeping ? 0 : Math.sin(p.walkPhase) * 0.9 * p.walkAmount;
    const armSwing = legSwing * 0.8;
    const m = this.m;
    // Piernas
    for (const [part, sx, ang] of [['rightLeg', 2, legSwing], ['leftLeg', -2, -legSwing]] as const) {
      mat4.translate(m, root, [sx * PX, 12 * PX, 0]);
      mat4.rotateX(m, m, ang);
      fn(part, m);
    }
    // Parte superior (inclinada al agacharse).
    const upper = this.tmp;
    mat4.translate(upper, root, [0, 12 * PX, 0]);
    if (sneak) mat4.rotateX(upper, upper, -0.4);
    mat4.translate(m, upper, [0, 0, 0]);
    fn('body', m);
    const swing = p.swing > 0 ? Math.sin(p.swing * Math.PI) : 0;
    for (const [part, sx, ang] of [['rightArm', 6, -legSwing * 0.8], ['leftArm', -6, legSwing * 0.8]] as const) {
      mat4.translate(m, upper, [sx * PX, 10 * PX, 0]);
      let a = ang * (armSwing !== 0 ? 1 : 1);
      if (part === 'rightArm' && swing > 0) a -= swing * 1.3 + 0.2;
      mat4.rotateX(m, m, a);
      mat4.rotateZ(m, m, sx > 0 ? -0.06 : 0.06);
      fn(part, m);
    }
    mat4.translate(m, upper, [0, 12 * PX, 0]);
    if (!p.sleeping) {
      mat4.rotateY(m, m, p.headYaw - p.bodyYaw);
      mat4.rotateX(m, m, p.pitch);
    }
    fn('head', m);
  }

  /** Material de la pieza de cada ranura (null = nada o id que no encaja), o null sin armadura. */
  private armorOf(p: RemotePlayerView): (ArmorMaterial | null)[] | null {
    const a = p.armor;
    if (!a) return null;
    let any = false;
    const mats = [0, 1, 2, 3].map((slot) => {
      const info = ITEMS[a[slot]]?.armor;
      if (!info || info.slot !== slot) return null;
      any = true;
      return info.material;
    });
    return any ? mats : null;
  }

  /** Cajas de armadura de un jugador con la matriz de su parte del cuerpo (misma animación que la piel). */
  private forEachArmor(
    p: RemotePlayerView, camX: number, camY: number, camZ: number, fn: (mesh: PartMesh, mat: ArmorMaterial, m: mat4) => void,
  ): void {
    const mats = this.armorOf(p);
    if (!mats) return;
    this.forEachPart(p, camX, camY, camZ, (part, m) => {
      for (const box of this.armorParts.get(part) ?? []) {
        const mat = mats[box.slot];
        if (mat) fn(box.mesh, mat, m);
      }
    });
  }

  private drawMesh(prog: Program, mesh: PartMesh, m: mat4): void {
    const gl = this.gl;
    prog.m4('uModel', m as Float32Array);
    gl.bindVertexArray(mesh.vao);
    gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0);
  }

  drawPlayers(
    players: RemotePlayerView[], camX: number, camY: number, camZ: number, bindLighting: (p: Program) => Program,
  ): void {
    if (players.length === 0) return;
    const gl = this.gl;
    const prog = bindLighting(this.pEntity.use());
    for (const p of players) {
      prog.tex2D('uSkin', this.skinFor(p)).f2('uLightLevel', p.light[0], p.light[1]).f3('uTint', 1, 1, 1);
      this.forEachPart(p, camX, camY, camZ, (part, m) => this.drawMesh(prog, this.parts[part], m));
    }
    // Armadura encima de la piel, con el brillo de cada material.
    let armor: Program | null = null;
    for (const p of players) {
      let bound: ArmorMaterial | null = null;
      this.forEachArmor(p, camX, camY, camZ, (mesh, mat, m) => {
        if (!armor) armor = bindLighting(this.pArmor.use());
        if (!bound) armor.f2('uLightLevel', p.light[0], p.light[1]);
        if (mat !== bound) {
          const sh = ARMOR_SHINE[mat];
          armor.tex2D('uSkin', this.armorTex.get(mat)!).f3('uMat', sh.rough, sh.metal, sh.sheen);
          bound = mat;
        }
        this.drawMesh(armor, mesh, m);
      });
    }
    gl.bindVertexArray(null);
  }

  drawPlayersShadow(players: RemotePlayerView[], camX: number, camY: number, camZ: number): void {
    if (players.length === 0) return;
    const gl = this.gl;
    const prog = this.pEntityShadow.use();
    for (const p of players) {
      prog.tex2D('uSkin', this.skinFor(p));
      this.forEachPart(p, camX, camY, camZ, (part, m) => this.drawMesh(prog, this.parts[part], m));
      let bound: ArmorMaterial | null = null;
      this.forEachArmor(p, camX, camY, camZ, (mesh, mat, m) => {
        if (mat !== bound) prog.tex2D('uSkin', this.armorTex.get(mat)!);
        bound = mat;
        this.drawMesh(prog, mesh, m);
      });
    }
    gl.bindVertexArray(null);
  }

  // ---------------------------------------------------------------- contorno

  drawOutline(sel: { x: number; y: number; z: number; box?: number[] }, camX: number, camY: number, camZ: number): void {
    const gl = this.gl;
    const b = sel.box ?? [0, 0, 0, 1, 1, 1];
    const e = 0.003;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    this.pOutline.use()
      .f3('uOffset', sel.x + b[0] - camX - e, sel.y + b[1] - camY - e, sel.z + b[2] - camZ - e)
      .f3('uScale', b[3] - b[0] + 2 * e, b[4] - b[1] + 2 * e, b[5] - b[2] + 2 * e)
      .f4('uColor', 0.02, 0.02, 0.02, 0.55);
    gl.bindVertexArray(this.outlineVao);
    gl.drawArrays(gl.LINES, 0, 24);
    gl.bindVertexArray(null);
    gl.disable(gl.BLEND);
  }

  /** Dirección de la luz principal (la fija el juego cada frame). */
  lightDir: number[] = [0, 1, 0];

  // ---------------------------------------------------------------- partículas

  spawnBreak(x: number, y: number, z: number, blockId: number, light: number): void {
    const layer = BLOCK_TEX[blockId * 6];
    const n = 26;
    for (let i = 0; i < n; i++) {
      if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
      const px = x + 0.15 + Math.random() * 0.7;
      const py = y + 0.15 + Math.random() * 0.7;
      const pz = z + 0.15 + Math.random() * 0.7;
      this.particles.push({
        x: px, y: py, z: pz,
        vx: (px - x - 0.5) * 3 + (Math.random() - 0.5) * 0.8,
        vy: 1.5 + Math.random() * 2.5,
        vz: (pz - z - 0.5) * 3 + (Math.random() - 0.5) * 0.8,
        life: 0, max: 0.6 + Math.random() * 0.6,
        size: 0.08 + Math.random() * 0.07,
        layer, u: Math.floor(Math.random() * 4) * 0.25, v: Math.floor(Math.random() * 4) * 0.25, light,
      });
    }
  }

  /**
   * Humo o polvo (explosiones, muerte de criaturas, fuego): partículas grises redondas.
   * gray: 0 negro .. 1 blanco; up: velocidad de subida.
   */
  spawnSmoke(x: number, y: number, z: number, n: number, spread: number, gray: number, size: number, up = 1.2, light = 0xf0): void {
    for (let i = 0; i < n; i++) {
      if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
      const a = Math.random() * Math.PI * 2, r = Math.random() * spread;
      const g = Math.max(0, Math.min(0.99, gray + (Math.random() - 0.5) * 0.15));
      this.particles.push({
        x: x + Math.cos(a) * r, y: y + (Math.random() - 0.5) * spread, z: z + Math.sin(a) * r,
        vx: Math.cos(a) * r * 1.5, vy: up * (0.5 + Math.random()), vz: Math.sin(a) * r * 1.5,
        life: 0, max: 0.6 + Math.random() * 0.9, size: size * (0.6 + Math.random() * 0.8),
        layer: -1 - g, u: 0, v: 0, light, smoke: true,
      });
    }
  }

  /** Llama de una criatura que arde (sube y se apaga). */
  spawnFlame(x: number, y: number, z: number): void {
    if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
    this.particles.push({
      x, y, z, vx: (Math.random() - 0.5) * 0.3, vy: 0.8 + Math.random() * 0.8, vz: (Math.random() - 0.5) * 0.3,
      life: 0, max: 0.35 + Math.random() * 0.3, size: 0.12 + Math.random() * 0.1, layer: -1.97, u: 0, v: 0, light: 0xff,
      smoke: true,
    });
  }

  /** Corazones (animales en modo amor, crías que nacen). */
  spawnHearts(x: number, y: number, z: number, n: number, spread = 0.4): void {
    this.spawnShaped(x, y, z, n, spread, -3, 0.22);
  }

  /** Destellos verdes (polvo de hueso). */
  spawnSparkles(x: number, y: number, z: number, n: number, spread = 0.5): void {
    this.spawnShaped(x, y, z, n, spread, -4, 0.14);
  }

  private spawnShaped(x: number, y: number, z: number, n: number, spread: number, layer: number, size: number): void {
    for (let i = 0; i < n; i++) {
      if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
      this.particles.push({
        x: x + (Math.random() - 0.5) * spread * 2, y: y + (Math.random() - 0.5) * spread, z: z + (Math.random() - 0.5) * spread * 2,
        vx: (Math.random() - 0.5) * 0.3, vy: 0.3 + Math.random() * 0.4, vz: (Math.random() - 0.5) * 0.3,
        life: 0, max: 0.9 + Math.random() * 0.6, size: size * (0.8 + Math.random() * 0.4), layer, u: 0, v: 0, light: 0xff,
        smoke: true,
      });
    }
  }

  /** Chispas de golpe crítico / daño. */
  spawnCrit(x: number, y: number, z: number, n: number): void {
    for (let i = 0; i < n; i++) {
      if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
      this.particles.push({
        x, y, z, vx: (Math.random() - 0.5) * 6, vy: Math.random() * 4, vz: (Math.random() - 0.5) * 6,
        life: 0, max: 0.4 + Math.random() * 0.3, size: 0.07, layer: -1.95, u: 0, v: 0, light: 0xff, smoke: false,
      });
    }
  }

  updateParticles(dt: number, solid: (x: number, y: number, z: number) => boolean): void {
    const ps = this.particles;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      p.life += dt;
      if (p.life >= p.max) {
        ps.splice(i, 1);
        continue;
      }
      if (p.smoke) {
        // El humo sube despacio y se frena.
        p.vx *= Math.exp(-dt * 2);
        p.vz *= Math.exp(-dt * 2);
        p.vy = p.vy * Math.exp(-dt * 1.5) + 0.6 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        continue;
      }
      p.vy -= 18 * dt;
      p.vx *= 0.98;
      p.vz *= 0.98;
      const nx = p.x + p.vx * dt, ny = p.y + p.vy * dt, nz = p.z + p.vz * dt;
      if (solid(Math.floor(nx), Math.floor(p.y), Math.floor(p.z))) p.vx = 0; else p.x = nx;
      if (solid(Math.floor(p.x), Math.floor(p.y), Math.floor(nz))) p.vz = 0; else p.z = nz;
      if (solid(Math.floor(p.x), Math.floor(ny), Math.floor(p.z))) {
        p.vy = 0;
        p.vx *= 0.7;
        p.vz *= 0.7;
      } else p.y = ny;
    }
  }

  drawParticles(camX: number, camY: number, camZ: number, irradiance: WebGLTexture): void {
    const n = this.particles.length;
    if (n === 0) return;
    const gl = this.gl;
    const d = this.particleData;
    for (let i = 0; i < n; i++) {
      const p = this.particles[i];
      const o = i * 8;
      const fade = 1 - Math.max(0, (p.life - p.max * 0.7) / (p.max * 0.3));
      d[o] = p.x - camX;
      d[o + 1] = p.y - camY;
      d[o + 2] = p.z - camZ;
      d[o + 3] = p.size * fade;
      d[o + 4] = p.layer;
      d[o + 5] = p.u;
      d[o + 6] = p.v;
      d[o + 7] = p.light;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.particleBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, d, 0, n * 8);
    this.pParticle.use().tex('uAlbedo', gl.TEXTURE_2D_ARRAY, this.textures.albedo).tex2D('uIrradiance', irradiance);
    gl.bindVertexArray(this.particleVao);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n);
    gl.bindVertexArray(null);
  }
}
