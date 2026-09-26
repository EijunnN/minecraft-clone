// Las barras e indicadores del HUD en cada frame: vida, hambre y aire, efectos, barra del asalto,
// catalejo y reloj, escarcha, carga del ataque, armadura y experiencia.
import { CLOCK } from '../../shared/items';
import { EFFECT_POISON, EFFECT_HUNGER, EFFECT_WITHER } from '../../shared/effects';
import { renderArmorBar } from '../ui/armorBar';
import { renderXpBar } from '../ui/xpBar';
import { renderEffectsHud } from '../ui/effectsHud';
import { renderAttackIndicator } from '../ui/attackIndicator';
import { renderRaidBar } from '../ui/raidBar';
import { renderDecorHud } from '../ui/decorHud';
import { renderFrostHud } from '../ui/frostHud';
import { Freezing } from './freezing';
import type { Game } from './Game';

export function updateHud(g: Game, worldTime: number): void {
  const surv = g.survival;
  const fx = g.statusEffects;
  const shown = !surv.dead && !g.hudHidden;
  g.ui.setSurvival(
    !g.creative && !surv.dead, surv.health, surv.food, surv.air, surv.hurtTime < 0.3, surv.absorption,
    fx.has(EFFECT_POISON), fx.has(EFFECT_HUNGER), surv.maxHealth, fx.has(EFFECT_WITHER), // Fase 7 (efectos)
  );
  renderEffectsHud(fx, shown);
  renderRaidBar(g.raid, !g.hudHidden); // Fase 6 (asaltos)
  const clock = g.heldId === CLOCK || g.inv.offhand?.id === CLOCK;
  renderDecorHud(g.interaction.use?.kind === 'spyglass', clock ? worldTime : null, shown); // Fase 6.5 (decoración)
  renderFrostHud(g.life.freezing.fraction, Freezing.eyesInPowder(g), shown); // Fase 6.5 (materiales)
  renderAttackIndicator(g.interaction.attackCharge(), shown && !g.anyScreenOpen());
  renderArmorBar(g.inv.armorPoints(), !g.creative && !surv.dead);
  renderXpBar(g.xp, !g.creative && !surv.dead);
}
