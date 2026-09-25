// Mapa y brújula en pantalla (fase 5). Con un mapa en la mano principal se ve el mapa entero,
// con una flecha para el jugador y puntos para los demás; con una brújula en cualquier mano, una
// esfera cuya aguja apunta al punto de aparición del mundo.
import { COMPASS, FILLED_MAP } from '../../shared/items';
import { MAP_SIZE } from '../../shared/maps';
import { MapImage } from './maps';
import { explorerInfo, EXPLORER_SCALE } from '../../shared/explorerMaps'; // Fase 7.5 (mansión)
import { explorerMarkIcon } from './explorerMarks';
import type { Game } from './Game';
import '../ui/navigation.css';

export class Navigation {
  private mapEl: HTMLDivElement | null = null;
  private compassEl: HTMLDivElement | null = null;
  private needle: HTMLDivElement | null = null;
  private images = new Map<number | string, MapImage>();
  private shown: MapImage | null = null;

  constructor(private g: Game) {}

  update(): void {
    const g = this.g;
    const main = g.heldStack;
    const off = g.inv.offhand;
    const mapKey = main?.id === FILLED_MAP && main.dmg ? main.dmg : 0;
    const compass = main?.id === COMPASS || off?.id === COMPASS;
    const explorer = explorerInfo(main); // Fase 7.5 (mansión): mapa de explorador
    this.updateMap(mapKey, explorer);
    this.updateCompass(compass && !mapKey && !explorer);
  }

  /** Imagen de un mapa (se crea al verlo por primera vez y se sigue completando). */
  imageOf(key: number, explorer?: { x0: number; z0: number }): MapImage {
    const id = explorer ? `x${explorer.x0},${explorer.z0}` : key;
    let img = this.images.get(id);
    if (!img) {
      img = new MapImage(key, explorer && { ...explorer, scale: EXPLORER_SCALE });
      this.images.set(id, img);
      if (this.images.size > 12) this.images.delete(this.images.keys().next().value!);
    }
    return img;
  }

  private updateMap(key: number, explorer: ReturnType<typeof explorerInfo> = null): void {
    const g = this.g;
    if ((!key && !explorer) || !g.world) {
      if (this.mapEl) this.mapEl.style.display = 'none';
      this.shown = null;
      return;
    }
    if (!this.mapEl) {
      this.mapEl = document.createElement('div');
      this.mapEl.id = 'map-view';
      document.body.appendChild(this.mapEl);
    }
    const img = explorer ? this.imageOf(0, explorer) : this.imageOf(key);
    // Unos milisegundos por fotograma: se dibuja entero en menos de un segundo y luego se refresca.
    img.step(g.world, img.passes === 0 ? 6 : 1.5);
    const el = this.mapEl;
    el.style.display = 'block';
    if (this.shown !== img) {
      el.innerHTML = '';
      img.canvas.className = 'map-canvas';
      el.appendChild(img.canvas);
      this.shown = img;
    }
    // Marcas: el jugador (flecha) y los demás (puntos de su color), en fracciones del mapa.
    for (const m of el.querySelectorAll('.map-mark')) m.remove();
    const mark = (x: number, z: number, cls: string, yaw: number | null, color?: string) => {
      let u = (x - img.x0) / (MAP_SIZE * img.scale), v = (z - img.z0) / (MAP_SIZE * img.scale);
      const outside = u < 0 || u > 1 || v < 0 || v > 1;
      u = Math.min(1, Math.max(0, u));
      v = Math.min(1, Math.max(0, v));
      const m = document.createElement('div');
      m.className = `map-mark ${cls}${outside ? ' outside' : ''}`;
      m.style.left = `${u * 100}%`;
      m.style.top = `${v * 100}%`;
      if (yaw !== null && !outside) m.style.transform = `translate(-50%, -50%) rotate(${-yaw}rad)`;
      if (color) m.style.background = color;
      el.appendChild(m);
    };
    // Fase 7.5 (mansión): el destino del mapa de explorador.
    if (explorer) {
      mark(explorer.x, explorer.z, 'target', null);
      const t = el.lastElementChild as HTMLElement;
      t.style.backgroundImage = `url(${explorerMarkIcon(explorer.kind.icon)})`;
    }
    for (const rp of g.remote.values()) mark(rp.view.x, rp.view.z, 'other', null, rp.shirt);
    mark(g.player.x, g.player.z, 'me', g.player.yaw);
  }

  private updateCompass(show: boolean): void {
    const g = this.g;
    if (!show) {
      if (this.compassEl) this.compassEl.style.display = 'none';
      return;
    }
    if (!this.compassEl) {
      this.compassEl = document.createElement('div');
      this.compassEl.id = 'compass-view';
      this.compassEl.innerHTML = '<span class="n">N</span><div class="needle"></div>';
      this.needle = this.compassEl.querySelector('.needle');
      document.body.appendChild(this.compassEl);
    }
    this.compassEl.style.display = 'block';
    // Ángulo del punto de aparición respecto a donde mira el jugador (0 = de frente, horario).
    const p = g.player;
    const dx = g.spawn[0] - p.x, dz = g.spawn[2] - p.z;
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    const rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
    const near = Math.hypot(dx, dz) < 2;
    // Muy cerca del punto la aguja gira sin rumbo, como en Minecraft.
    const a = near ? performance.now() / 180 : Math.atan2(dx * rx + dz * rz, dx * fx + dz * fz);
    this.needle!.style.transform = `translate(-50%, -100%) rotate(${a}rad)`;
    // La "N" de la esfera marca el norte (−z) respecto a la vista.
    const n = this.compassEl.querySelector('.n') as HTMLElement;
    const an = Math.atan2(-rz, -fz);
    n.style.transform = `translate(-50%, -50%) rotate(${an}rad) translateY(-26px) rotate(${-an}rad)`;
  }
}
