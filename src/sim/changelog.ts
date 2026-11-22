/**
 * Registro histórico e versionamento oficial do AeroTrainer 3D.
 * Convenção de versões:
 * - V1.X: lançamentos principais e novos recursos/sistemas;
 * - V1.X.Y: atualizações pequenas, ajustes visuais e correções de bugs.
 */

export type ReleaseKind = 'major' | 'feature' | 'fix';

export type ChangeCategory = 'Novo' | 'Melhoria' | 'Correção';

export interface ChangelogItem {
  category: ChangeCategory;
  text: string;
}

export interface ChangelogEntry {
  version: string;
  title: string;
  summary: string;
  kind: ReleaseKind;
  changes: ChangelogItem[];
}

export const CHANGELOG_ENTRIES: ChangelogEntry[] = [
  {
    version: 'V1.4.1',
    title: 'Resposta Instantânea no Controle do Celular (P2P + Binário)',
    summary:
      'Otimização profunda de latência e uso de CPU no controle virtual do celular, eliminando atrasos em servidores gratuitos como Render.com.',
    kind: 'fix',
    changes: [
      {
        category: 'Novo',
        text: 'Conexão direta WebRTC P2P (DataChannel UDP sem retransmissão/bloqueio) entre celular e PC para resposta instantânea na rede local sem passar pelo servidor após o pareamento.',
      },
      {
        category: 'Melhoria',
        text: 'Protocolo binário compacto de 9 bytes com envio imediato ao mover os sticks, proteção anti-fila (backpressure), TCP_NODELAY e desativação de compressão no servidor WebSocket.',
      },
      {
        category: 'Correção',
        text: 'Eliminadas re-renderizações React de 50-120Hz no PC e no toque do celular, além de otimização do terreno, sombras e raycast da câmera para manter FPS estável.',
      },
    ],
  },
  {
    version: 'V1.4',
    title: 'Central de Novidades e Versionamento',
    summary:
      'Adição do histórico completo de atualizações no menu inicial com numeração contínua de versões e patches.',
    kind: 'feature',
    changes: [
      {
        category: 'Novo',
        text: 'Botão "Novidades!" no canto inferior direito do menu para consultar toda a evolução do simulador.',
      },
      {
        category: 'Novo',
        text: 'Exibição discreta da versão atual ao lado do título do jogo e filtros por Recursos (V1.X) ou Correções (V1.X.Y).',
      },
      {
        category: 'Melhoria',
        text: 'Documentação detalhada de todas as melhorias de física, colisões, câmeras, controles e correções visuais desde a V1.0.',
      },
    ],
  },
  {
    version: 'V1.3',
    title: 'Animação Completa de Colisão',
    summary:
      'Impactos fortes agora exibem queda física realista, partículas 3D e feedback visual e sonoro antes da tela de queda.',
    kind: 'feature',
    changes: [
      {
        category: 'Novo',
        text: 'Física pós-colisão com rebote, giro descontrolado (tumble) nos três eixos, quique no solo e parada progressiva.',
      },
      {
        category: 'Novo',
        text: 'Partículas 3D de onda de choque, faíscas incandescentes, fragmentos de carbono, fumaça e desprendimento visual de hélices.',
      },
      {
        category: 'Novo',
        text: 'LEDs de emergência piscando em vermelho, vinheta de alerta "Impacto Detectado" no HUD e áudio de colisão com quique secundário.',
      },
    ],
  },
  {
    version: 'V1.2',
    title: 'Integração com Controle Xbox e PS4 (DS4)',
    summary:
      'Suporte plug-and-play para pilotar como em um rádio controle real usando exclusivamente os dois sticks analógicos.',
    kind: 'feature',
    changes: [
      {
        category: 'Novo',
        text: 'Leitura nativa via Gamepad API compatível com controles Xbox / XInput e DualShock 4 via DS4Windows (cabo USB ou Bluetooth).',
      },
      {
        category: 'Novo',
        text: 'Mapeamento RC Modo 2 exclusivo nos dois sticks (Esq: Aceleração/Yaw · Dir: Pitch/Roll) sem interferência de botões ou gatilhos.',
      },
      {
        category: 'Melhoria',
        text: 'Zona morta simétrica de 8% com reescala suave anti-drift e badges de conexão na tela inicial, HUD e menu de pausa.',
      },
    ],
  },
  {
    version: 'V1.1.2',
    title: 'Guinada Suave, Colisão em Árvores e Ajuste FPV',
    summary:
      'Refinamento na sensação de pilotagem ao girar, proteção de colisores na vegetação e calibração da visão em primeira pessoa.',
    kind: 'fix',
    changes: [
      {
        category: 'Melhoria',
        text: 'Animação mais fluida ao girar para os lados (Q/E) com inércia suave, inclinação lateral coordenada e antecipação do gimbal/câmera.',
      },
      {
        category: 'Novo',
        text: 'Colisão física real adicionada nos troncos cilíndricos e copas cônicas de todas as árvores do mapa.',
      },
      {
        category: 'Correção',
        text: 'Calibração da câmera FPV Óculos: horizonte nivelado com o drone parado e compensação automática para cima ao acelerar para frente.',
      },
    ],
  },
  {
    version: 'V1.1.1',
    title: 'Hitbox em Turbinas, Correção de Flicker e Argolas',
    summary:
      'Correções de colisão em obstáculos aéreos, eliminação de piscamento de superfícies (Z-fighting) e ajuste de proporção dos portões.',
    kind: 'fix',
    changes: [
      {
        category: 'Correção',
        text: 'Adição de hitbox real nos mastros, naceles e pás giratórias de todas as turbinas eólicas.',
      },
      {
        category: 'Correção',
        text: 'Eliminação de Z-fighting (flicker) nos telhados da casa do lago, lajes de piso de todas as construções, pista e heliponto.',
      },
      {
        category: 'Correção',
        text: 'Redimensionamento e centralização das argolas instaladas em pórticos, casas e estruturas para não atravessarem barras ou paredes.',
      },
    ],
  },
  {
    version: 'V1.1',
    title: 'Mundo Aberto 720m, Estruturas e Novas Missões',
    summary:
      'Grande expansão do ambiente de treinamento com construções exploráveis, obstáculos internos e física de colisão estrutural.',
    kind: 'feature',
    changes: [
      {
        category: 'Novo',
        text: 'Vale expandido para 720m com casas abandonadas, ruínas, aqueduto, hangar, ponte, túnel norte, contêiner e lago.',
      },
      {
        category: 'Novo',
        text: 'Novas missões: "05. Estruturas & Ruínas" e "06. Voo Livre · Mundo Aberto" com 14 anéis distribuídos pelo mapa.',
      },
      {
        category: 'Novo',
        text: 'Colisão estrutural em paredes, pilares, arcos e telhados com rebote leve em baixa velocidade e queda em impactos fortes.',
      },
    ],
  },
  {
    version: 'V1.0',
    title: 'Lançamento Inicial do AeroTrainer 3D',
    summary:
      'Base do simulador 3D de quadricóptero com física 6DoF, missões guiadas, câmeras e controle remoto pelo celular.',
    kind: 'major',
    changes: [
      {
        category: 'Novo',
        text: 'Motor físico 6DoF com modos Estabilizado (GPS), Sport e Acro FPV, além de simulação opcional de vento lateral.',
      },
      {
        category: 'Novo',
        text: 'Quatro missões fundamentais (Decolagem e Pairar, Circuito de Portões, Órbita na Torre e Pouso de Precisão).',
      },
      {
        category: 'Novo',
        text: 'Pareamento de celular via QR Code / WebSocket com sticks flutuantes, telemetria ao vivo, HUD e áudio procedural.',
      },
    ],
  },
];

export const GAME_VERSION: string = CHANGELOG_ENTRIES[0].version;

export type ChangelogFilter = 'all' | 'features' | 'fixes';

/**
 * Filtra as entradas do log por todas as versões, apenas recursos (V1.X) ou apenas correções (V1.X.Y).
 */
export function filterChangelogEntries(
  entries: readonly ChangelogEntry[],
  filter: ChangelogFilter
): ChangelogEntry[] {
  if (filter === 'all') return [...entries];
  if (filter === 'fixes') return entries.filter((entry) => entry.kind === 'fix');
  return entries.filter((entry) => entry.kind === 'major' || entry.kind === 'feature');
}

/**
 * Verifica se uma string de versão segue o padrão V1.X ou V1.X.Y.
 */
export function isValidVersionFormat(version: string): boolean {
  return /^V\d+\.\d+(?:\.\d+)?$/.test(version);
}

/**
 * Indica se a versão representa uma atualização pequena / correção (três números, ex.: V1.1.1).
 */
export function isPatchVersion(version: string): boolean {
  return /^V\d+\.\d+\.\d+$/.test(version);
}
