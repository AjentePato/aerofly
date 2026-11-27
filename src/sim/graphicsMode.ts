import type { GraphicsMode } from './types';

export const DEFAULT_GRAPHICS_MODE: GraphicsMode = 'realistic';
const GRAPHICS_MODE_STORAGE_KEY = 'aerotrainer_graphics_mode';

export interface GraphicsModeOption {
  id: GraphicsMode;
  label: string;
  description: string;
}

export const GRAPHICS_MODE_OPTIONS: ReadonlyArray<GraphicsModeOption> = [
  {
    id: 'low_poly',
    label: 'Low-Poly (Antiga)',
    description: 'Visual clássico leve com cores vibrantes e formas geométricas simples.',
  },
  {
    id: 'realistic',
    label: 'Realista (Atual)',
    description: 'Texturas detalhadas, água animada, iluminação natural e vegetação realista.',
  },
];

export function isValidGraphicsMode(value: unknown): value is GraphicsMode {
  return value === 'realistic' || value === 'low_poly';
}

export function getGraphicsModeOption(mode: GraphicsMode): GraphicsModeOption {
  return GRAPHICS_MODE_OPTIONS.find((opt) => opt.id === mode) ?? GRAPHICS_MODE_OPTIONS[1];
}

export function loadSavedGraphicsMode(): GraphicsMode {
  if (typeof window === 'undefined') return DEFAULT_GRAPHICS_MODE;
  try {
    const saved = window.localStorage.getItem(GRAPHICS_MODE_STORAGE_KEY);
    return isValidGraphicsMode(saved) ? saved : DEFAULT_GRAPHICS_MODE;
  } catch {
    return DEFAULT_GRAPHICS_MODE;
  }
}

export function saveGraphicsMode(mode: GraphicsMode): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(GRAPHICS_MODE_STORAGE_KEY, mode);
  } catch {
    // Ignore storage quota / privacy mode errors
  }
}
