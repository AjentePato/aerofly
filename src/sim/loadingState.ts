export type LoadingKind = 'startup' | 'flight' | 'skin' | 'graphics';

export interface LoadingOverlayState {
  kind: LoadingKind;
  detail?: string;
}

export interface LoadingCopy {
  badge: string;
  title: string;
  subtitle: string;
}

export function getLoadingCopy(kind: LoadingKind, detail?: string): LoadingCopy {
  switch (kind) {
    case 'startup':
      return {
        badge: 'INICIALIZANDO',
        title: 'Carregando Simulador 3D',
        subtitle: detail || 'Preparando terreno, atmosfera e sistemas da aeronave...',
      };
    case 'flight':
      return {
        badge: 'DECOLAGEM',
        title: 'Preparando Missão',
        subtitle: detail || 'Calibrando sensores, pista e portões de treinamento...',
      };
    case 'skin':
      return {
        badge: 'TEXTURA DO DRONE',
        title: 'Aplicando Textura',
        subtitle: detail
          ? `Carregando visual ${detail} em alta definição...`
          : 'Atualizando pintura, hélices e materiais da aeronave...',
      };
    case 'graphics':
      return {
        badge: 'GRÁFICOS DO JOGO',
        title: 'Atualizando Gráficos',
        subtitle: detail
          ? `Alternando cenário para ${detail}...`
          : 'Reconstruindo terreno, água e iluminação do mundo...',
      };
  }
}
