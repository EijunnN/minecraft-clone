// Estado de supervivencia del jugador: vida, hambre, saturación, agotamiento, aire, fuego,
// invulnerabilidad tras un golpe, armadura, regeneración, inanición y muerte (reglas de Minecraft).
import { ARMOR_BYPASS, armorReduce, armorWear } from '../../shared/armor';

export interface SurvivalContext {
  eyeInWater: boolean;
  inLava: boolean;
  inWater: boolean;
  /** Bajo la lluvia a cielo abierto (apaga el fuego). */
  inRain: boolean;
  /** 0 pacífico .. 3 difícil. */
  difficulty: number;
  /** Efecto Resistencia al fuego: la lava y el fuego no hacen daño. */
  fireResistant?: boolean;
  /** Efecto Respiración acuática: no se gasta el aire. */
  waterBreathing?: boolean;
}

/** Armadura puesta (la implementa el inventario). */
export interface ArmorSource {
  armorPoints(): number;
  armorToughness(): number;
  /** Desgasta cada pieza puesta; devuelve cuántas se rompieron. */
  wearArmor(amount: number): number;
}

export type DamageCause =
  | 'fall' | 'lava' | 'fire' | 'drown' | 'starve' | 'void' | 'suffocate' | 'explosion' | 'arrow' | 'kill' | string;

/** Mensajes de muerte (se completan con el nombre del jugador). */
export function deathMessage(cause: DamageCause): string {
  const mobs: Record<string, string> = {
    zombie: 'fue devorado por un zombi', husk: 'fue devorado por un zombi momificado', skeleton: 'fue abatido por un esqueleto',
    stray: 'fue abatido por un esqueleto errante', spider: 'fue mordido por una araña', enderman: 'fue destrozado por un enderman',
    creeper: 'voló por los aires por un creeper',
  };
  switch (cause) {
    case 'fall': return 'cayó desde muy alto';
    case 'lava': return 'intentó nadar en lava';
    case 'fire': return 'ardió hasta morir';
    case 'drown': return 'se ahogó';
    case 'starve': return 'murió de hambre';
    case 'void': return 'cayó al vacío';
    case 'suffocate': return 'se asfixió dentro de un bloque';
    case 'explosion': return 'voló por los aires';
    case 'arrow': return 'fue abatido por una flecha';
    case 'kill': return 'abandonó este mundo';
    default: return mobs[cause] ?? 'murió';
  }
}

export class Survival {
  health = 20;
  food = 20;
  saturation = 5;
  exhaustion = 0;
  /** Aire en segundos (15 = lleno). */
  air = 15;
  /** Segundos que le quedan ardiendo. */
  fire = 0;
  dead = false;
  deathCause: DamageCause = '';
  /** Tiempo desde el último daño (para el parpadeo rojo y el balanceo de cámara). */
  hurtTime = 10;
  /** Dirección del último golpe (para inclinar la cámara). */
  hurtDir = 0;
  private invuln = 0;
  private lastDamage = 0;
  private regenTimer = 0;
  private starveTimer = 0;
  private drownTimer = 0;
  private fireTimer = 0;
  private lavaTimer = 0;
  /** Se ha curado o dañado (para refrescar el HUD). */
  version = 0;
  /** Corazones dorados del efecto Absorción (vida extra que se gasta primero). */
  absorption = 0;
  /** Armadura que reduce el daño (sin ella, el daño llega entero). */
  armor: ArmorSource | null = null;

  reset(): void {
    this.health = 20;
    this.food = 20;
    this.saturation = 5;
    this.exhaustion = 0;
    this.air = 15;
    this.fire = 0;
    this.absorption = 0;
    this.dead = false;
    this.deathCause = '';
    this.hurtTime = 10;
    this.invuln = 0;
    this.lastDamage = 0;
    this.version++;
  }

  /**
   * Aplica daño respetando la invulnerabilidad de medio segundo (en ella sólo cuenta el exceso
   * sobre el último golpe; `bypass` se la salta). La armadura reduce el daño y se desgasta, salvo con
   * las causas que la atraviesan (caídas, ahogo, vacío...). Devuelve el daño efectivo.
   */
  damage(amount: number, cause: DamageCause, bypass = false): number {
    if (this.dead || amount <= 0) return 0;
    let dmg = amount;
    if (!bypass && this.invuln > 0) {
      if (amount <= this.lastDamage) return 0;
      dmg = amount - this.lastDamage;
      this.lastDamage = amount;
    } else {
      this.lastDamage = amount;
      this.invuln = 0.5;
    }
    // `bypass` sólo salta la invulnerabilidad (daño periódico); lo que atraviesa la armadura lo
    // decide la causa (la lava y el fuego sí se reducen, como en Minecraft).
    if (this.armor && !ARMOR_BYPASS.has(cause)) {
      const raw = dmg;
      dmg = armorReduce(raw, this.armor.armorPoints(), this.armor.armorToughness());
      this.armor.wearArmor(armorWear(raw));
    }
    // Los corazones dorados (absorción) se gastan antes que la vida.
    const absorbed = Math.min(this.absorption, dmg);
    this.absorption -= absorbed;
    this.health = Math.max(0, this.health - (dmg - absorbed));
    this.hurtTime = 0;
    this.addExhaustion(0.1);
    this.version++;
    if (this.health <= 0) {
      this.dead = true;
      this.deathCause = cause;
    }
    return dmg;
  }

  heal(n: number): void {
    if (this.dead) return;
    const h = Math.min(20, this.health + n);
    if (h !== this.health) {
      this.health = h;
      this.version++;
    }
  }

  addExhaustion(x: number): void {
    this.exhaustion += x;
  }

  eat(hunger: number, saturation: number): void {
    this.food = Math.min(20, this.food + hunger);
    this.saturation = Math.min(this.food, this.saturation + saturation);
    this.version++;
  }

  canSprint(): boolean {
    return this.food > 6;
  }

  update(dt: number, ctx: SurvivalContext): void {
    if (this.dead) return;
    this.hurtTime += dt;
    if (this.invuln > 0) this.invuln -= dt;
    const peaceful = ctx.difficulty === 0;

    // Agotamiento → saturación → hambre.
    while (this.exhaustion >= 4) {
      this.exhaustion -= 4;
      if (this.saturation > 0) this.saturation = Math.max(0, this.saturation - 1);
      else if (!peaceful) {
        this.food = Math.max(0, this.food - 1);
        this.version++;
      }
    }
    // Regeneración natural.
    this.regenTimer += dt;
    if (peaceful) {
      if (this.regenTimer >= 1) {
        this.regenTimer = 0;
        this.heal(1);
        if (this.food < 20) {
          this.food++;
          this.version++;
        }
      }
    } else if (this.health < 20 && this.food >= 20 && this.saturation > 0) {
      if (this.regenTimer >= 0.5) {
        this.regenTimer = 0;
        this.heal(1);
        this.addExhaustion(Math.min(this.saturation, 6));
      }
    } else if (this.health < 20 && this.food >= 18) {
      if (this.regenTimer >= 4) {
        this.regenTimer = 0;
        this.heal(1);
        this.addExhaustion(6);
      }
    } else this.regenTimer = Math.min(this.regenTimer, 4);
    // Inanición: en fácil se detiene a 5 corazones y en normal a medio corazón.
    if (this.food <= 0) {
      this.starveTimer += dt;
      if (this.starveTimer >= 4) {
        this.starveTimer = 0;
        const floor = ctx.difficulty <= 1 ? 10 : ctx.difficulty === 2 ? 1 : 0;
        if (this.health > floor) this.damage(1, 'starve', true);
      }
    } else this.starveTimer = 0;
    // Aire bajo el agua.
    if (ctx.eyeInWater && !ctx.waterBreathing) {
      this.air = Math.max(0, this.air - dt);
      if (this.air <= 0) {
        this.drownTimer += dt;
        if (this.drownTimer >= 1) {
          this.drownTimer = 0;
          this.damage(2, 'drown', true);
        }
      }
    } else {
      this.air = Math.min(15, this.air + dt * 5);
      this.drownTimer = 0;
    }
    // Lava y fuego.
    if (ctx.inLava) {
      this.fire = 15;
      this.lavaTimer += dt;
      if (this.lavaTimer >= 0.5) {
        this.lavaTimer = 0;
        if (!ctx.fireResistant) this.damage(4, 'lava', true);
      }
    } else this.lavaTimer = 0.5;
    if (ctx.inWater || ctx.inRain) this.fire = 0;
    if (this.fire > 0) {
      this.fire -= dt;
      this.fireTimer += dt;
      if (this.fireTimer >= 1 && !ctx.inLava) {
        this.fireTimer = 0;
        if (!ctx.fireResistant) this.damage(1, 'fire', true);
      }
    } else this.fireTimer = 0;
  }
}
