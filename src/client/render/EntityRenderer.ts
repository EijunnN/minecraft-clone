// Entidades: jugadores (modelo de cajas con skin procedural y armadura), partículas de bloques,
// contorno de selección y bloque sostenido en primera persona.
import { mat4 } from 'gl-matrix';
import { Program, type GL } from '../engine/gl';
import {
  ENTITY_VS, ENTITY_FS, ENTITY_SHADOW_VS, ENTITY_SHADOW_FS, OUTLINE_VS, OUTLINE_FS,
} from './shaders/entity';
import { ARMOR_FS } from './shaders/armor';
import { ParticleSystem } from './particles/ParticleSystem';
import { ParticleFx } from './particles/effects';
import { buildBox, drawSkin, skinColorsFor, PART_LAYOUT } from './PlayerSkin';
import type { BlockTextures } from './BlockTextures';
import { BLOCK_TEX } from '../../shared/blocks';
import { ITEMS } from '../../shared/items';
import { ALL_ARMOR_MATERIALS, type ArmorMaterial } from '../../shared/armor'; // Fase 6.5 (cobre): con el cobre
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
  /** Boca abajo (buceando o gateando), con la cabeza hacia donde va. */
  prone?: boolean;
  /** Objetos en la mano principal y en la secundaria (0 = nada). */
  held?: number;
  offhand?: number;
  /** Lo que está usando: comer, tensar el arco o cubrirse con el escudo. */
  use?: 'eat' | 'bow' | 'block' | null;
  light: [number, number];
  /** Armadura puesta: ids [cabeza, pecho, piernas, pies] (0 = nada). */
  armor?: number[];
  /** Fase 6 (monturas): sentado en una montura (piernas hacia delante). */
  riding?: boolean;
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

/** ¿Usa la mano principal? (come lo que lleva en ella o se cubre con su escudo). */
function usesMainHand(p: RemotePlayerView): boolean {
  const def = ITEMS[p.held ?? 0];
  return p.use === 'block' ? def?.tool?.kind === 'shield' : !!(def?.food || def?.drink);
}

export class EntityRenderer {
  private gl: GL;
  private textures: BlockTextures;
  private pEntity: Program;
  private pEntityShadow: Program;
  private pOutline: Program;
  private pArmor: Program;
  private parts: Record<BodyPart, PartMesh>;
  /** Cajas de armadura de cada parte del cuerpo. */
  private armorParts = new Map<BodyPart, ArmorMesh[]>();
  private armorTex = new Map<ArmorMaterial, WebGLTexture>();
  private skins = new Map<string, { key: string; tex: WebGLTexture }>();
  private outlineVao: WebGLVertexArrayObject;
  /** Partículas (sistema nuevo) y sus efectos con nombre. */
  readonly particles: ParticleSystem;
  readonly pfx: ParticleFx;
  private m = mat4.create();
  private tmp = mat4.create();

  constructor(gl: GL, textures: BlockTextures) {
    this.gl = gl;
    this.textures = textures;
    this.pEntity = new Program(gl, { name: 'entity', vs: ENTITY_VS, fs: ENTITY_FS });
    this.pEntityShadow = new Program(gl, { name: 'entity-shadow', vs: ENTITY_SHADOW_VS, fs: ENTITY_SHADOW_FS });
    this.pOutline = new Program(gl, { name: 'outline', vs: OUTLINE_VS, fs: OUTLINE_FS });
    this.particles = new ParticleSystem(gl);
    this.pfx = new ParticleFx(this.particles);
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
    for (const mat of ALL_ARMOR_MATERIALS) {
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
    const sneak = p.sneaking && !p.sleeping && !p.prone;
    mat4.translate(root, root, [p.x - camX, p.y - camY - (sneak ? 0.12 : 0), p.z - camZ]);
    if (p.sleeping) {
      // Boca arriba, con la cabeza hacia la cabecera de la cama.
      mat4.rotateY(root, root, p.headYaw + Math.PI);
      mat4.translate(root, root, [0, 0.15, -0.45]);
      mat4.rotateX(root, root, Math.PI / 2);
    } else if (p.prone) {
      // Boca abajo: el cuerpo en horizontal hacia donde mira, a ras del suelo.
      mat4.rotateY(root, root, p.bodyYaw);
      mat4.translate(root, root, [0, 0.3, 0.9]);
      mat4.rotateX(root, root, -Math.PI / 2);
    } else mat4.rotateY(root, root, p.bodyYaw);
    const legSwing = p.sleeping ? 0 : Math.sin(p.walkPhase) * 0.9 * p.walkAmount;
    const armSwing = legSwing * 0.8;
    const m = this.m;
    // Piernas
    for (const [part, sx, ang] of [['rightLeg', 2, legSwing], ['leftLeg', -2, -legSwing]] as const) {
      mat4.translate(m, root, [sx * PX, 12 * PX, 0]);
      // Fase 6 (monturas): montado, las piernas van hacia delante y algo abiertas.
      if (p.riding && !p.sleeping) {
        mat4.rotateY(m, m, sx > 0 ? -0.3 : 0.3);
        mat4.rotateX(m, m, 1.4);
      } else mat4.rotateX(m, m, ang);
      fn(part, m);
    }
    // Parte superior (inclinada al agacharse).
    const upper = this.tmp;
    mat4.translate(upper, root, [0, 12 * PX, 0]);
    if (sneak) mat4.rotateX(upper, upper, -0.4);
    mat4.translate(m, upper, [0, 0, 0]);
    fn('body', m);
    const swing = p.swing > 0 ? Math.sin(p.swing * Math.PI) : 0;
    // Brazo que come o se cubre: el de la mano que lleva la comida o el escudo.
    const useArm = p.use === 'eat' || p.use === 'block' ? (usesMainHand(p) ? 'rightArm' : 'leftArm') : null;
    const t = performance.now() / 1000;
    for (const [part, sx, ang] of [['rightArm', 6, -legSwing * 0.8], ['leftArm', -6, legSwing * 0.8]] as const) {
      mat4.translate(m, upper, [sx * PX, 10 * PX, 0]);
      let a = ang * (armSwing !== 0 ? 1 : 1);
      let turn = 0;
      if (p.use === 'bow') {
        // Tensando el arco: los dos brazos hacia delante, apuntando con la cabeza.
        a = -Math.PI / 2 - p.pitch;
        turn = sx > 0 ? -0.1 : 0.5;
      } else if (part === useArm) {
        a = p.use === 'eat' ? -1.15 + Math.sin(t * 20) * 0.08 : -0.9;
        turn = sx > 0 ? 0.45 : -0.45;
      } else if (part === 'rightArm' && swing > 0) a -= swing * 1.3 + 0.2;
      if (turn) mat4.rotateY(m, m, turn);
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

  /** Matriz de la mano (derecha o izquierda) de un jugador, para dibujar lo que lleva en ella. */
  handMatrix(p: RemotePlayerView, camX: number, camY: number, camZ: number, left: boolean): mat4 {
    const want = left ? 'leftArm' : 'rightArm';
    const out = mat4.create();
    this.forEachPart(p, camX, camY, camZ, (part, m) => {
      if (part === want) mat4.copy(out, m);
    });
    mat4.translate(out, out, [0, -10 * PX, 1 * PX]);
    return out;
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

  /** Fase 6.5 (remate): sólo la armadura (soportes para armadura), con las cajas del jugador. */
  drawArmorOnly(views: RemotePlayerView[], camX: number, camY: number, camZ: number, bindLighting: (p: Program) => Program): void {
    if (views.length === 0) return;
    let armor: Program | null = null;
    for (const p of views) {
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
    this.gl.bindVertexArray(null);
  }

  /** Fase 6.5 (remate): sombra de la armadura de los soportes. */
  drawArmorOnlyShadow(views: RemotePlayerView[], camX: number, camY: number, camZ: number): void {
    if (views.length === 0) return;
    const prog = this.pEntityShadow.use();
    for (const p of views) {
      let bound: ArmorMaterial | null = null;
      this.forEachArmor(p, camX, camY, camZ, (mesh, mat, m) => {
        if (mat !== bound) prog.tex2D('uSkin', this.armorTex.get(mat)!);
        bound = mat;
        this.drawMesh(prog, mesh, m);
      });
    }
    this.gl.bindVertexArray(null);
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
  // (Atajos de siempre; el sistema nuevo está en render/particles.)

  spawnBreak(x: number, y: number, z: number, blockId: number, light: number): void {
    this.pfx.chips(x, y, z, BLOCK_TEX[blockId * 6], light);
  }

  /** Humo o polvo (explosiones, muerte de criaturas, fuego). gray: 0 negro .. 1 blanco; up: subida. */
  spawnSmoke(x: number, y: number, z: number, n: number, spread: number, gray: number, size: number, up = 1.2, light?: number): void {
    void light;
    this.pfx.smoke(x, y, z, n, spread, gray, size, up);
  }

  /** Llama de una criatura que arde (sube y se apaga). */
  spawnFlame(x: number, y: number, z: number): void {
    this.pfx.flame(x, y, z);
  }

  /** Corazones (animales en modo amor, crías que nacen). */
  spawnHearts(x: number, y: number, z: number, n: number, spread = 0.4): void {
    this.pfx.hearts(x, y, z, n, spread);
  }

  /** Destellos verdes (polvo de hueso). */
  spawnSparkles(x: number, y: number, z: number, n: number, spread = 0.5): void {
    this.pfx.sparkles(x, y, z, n, spread);
  }

  /** Chispas de golpe crítico / daño. */
  spawnCrit(x: number, y: number, z: number, n: number): void {
    this.pfx.crit(x, y, z, n);
  }
}
