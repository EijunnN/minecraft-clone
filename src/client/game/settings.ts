// Ajustes persistentes (localStorage).
import { PRESETS, type PresetName, type RenderSettings } from '../render/Renderer';

export interface Settings {
  preset: PresetName | 'personalizado';
  render: RenderSettings;
  sensitivity: number;
  invertY: boolean;
  viewBobbing: boolean;
  master: number;
  music: number;
  ambient: number;
}

const KEY = 'voxelcraft:settings:v1';

export function detectPreset(renderer: string): PresetName {
  const r = renderer.toLowerCase();
  if (/swiftshader|llvmpipe|software|basic render/.test(r)) return 'bajo';
  if (/intel|mali|adreno|powervr|apple gpu|videocore/.test(r)) return 'medio';
  if (/rtx|rx 6|rx 7|rx 9|radeon rx|arc a|m1 max|m2 max|m3|m4/.test(r)) return 'alto';
  return 'medio';
}

export function defaultSettings(preset: PresetName = 'medio'): Settings {
  return {
    preset,
    render: { ...PRESETS[preset], fov: 75, brightness: 0 },
    sensitivity: 1,
    invertY: false,
    viewBobbing: true,
    master: 0.8,
    music: 0.45,
    ambient: 0.7,
  };
}

export function loadSettings(fallbackPreset: PresetName): Settings {
  const def = defaultSettings(fallbackPreset);
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return def;
    const s = JSON.parse(raw) as Partial<Settings>;
    return {
      ...def,
      ...s,
      render: { ...def.render, ...(s.render ?? {}) },
    };
  } catch {
    return def;
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* almacenamiento no disponible */
  }
}

export function applyPreset(s: Settings, p: PresetName): void {
  s.preset = p;
  s.render = { ...s.render, ...PRESETS[p] };
}
