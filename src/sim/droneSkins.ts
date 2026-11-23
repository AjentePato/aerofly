import type { DroneSkinId } from './types';

export interface DroneSkinOption {
  id: DroneSkinId;
  name: string;
  badge: string;
  description: string;
  swatches: [string, string, string];
  details: string[];
}

export const DRONE_SKIN_STORAGE_KEY = 'aerotrainer_drone_skin';

export const DRONE_SKINS: ReadonlyArray<DroneSkinOption> = [
  {
    id: 'default',
    name: 'Drone Padrão',
    badge: 'Original',
    description:
      'Visual clássico de treinamento com chassi escuro em carbono, capota laranja de alta visibilidade e esquis de pouso.',
    swatches: ['#1c222d', '#f97316', '#cbd5e1'],
    details: ['Capota laranja visível', 'Chassi carbono', 'Esquis duplos'],
  },
  {
    id: 'dji_lito_1',
    name: 'Drone Branco Moderno',
    badge: 'Moderno',
    description:
      'Drone branco moderno com acabamento fosco, sensores frontais duplos, câmera frontal quadrada, pernas dianteiras e hélices com pontas laranja.',
    swatches: ['#dcdfe0', '#23272e', '#f97316'],
    details: ['Sensores frontais', 'Pernas dianteiras', 'Pontas laranja'],
  },
  {
    id: 'fpv_freestyle',
    name: 'Drone FPV Freestyle',
    badge: 'FPV Racing',
    description:
      'Chassi aberto em fibra de carbono com espaçadores roxos, motores vermelhos, hélices azuis de 3 pás, câmera frontal dupla e bateria no topo.',
    swatches: ['#181c23', '#dc2626', '#38bdf8'],
    details: ['Fibra de carbono', 'Hélices azuis 3 pás', 'Câmera + LiPo topo'],
  },
];

export function isValidDroneSkin(value: unknown): value is DroneSkinId {
  return value === 'default' || value === 'dji_lito_1' || value === 'fpv_freestyle';
}

export function getDroneSkinOption(id: DroneSkinId): DroneSkinOption {
  return DRONE_SKINS.find((skin) => skin.id === id) ?? DRONE_SKINS[0];
}

export function loadSavedDroneSkin(): DroneSkinId {
  if (typeof window === 'undefined') return 'default';
  try {
    const saved = window.localStorage.getItem(DRONE_SKIN_STORAGE_KEY);
    return isValidDroneSkin(saved) ? saved : 'default';
  } catch {
    return 'default';
  }
}

export function saveDroneSkin(skin: DroneSkinId): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(DRONE_SKIN_STORAGE_KEY, skin);
  } catch {
    // Ignore storage quota or private-browsing errors
  }
}
