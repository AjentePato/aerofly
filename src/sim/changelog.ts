/**
 * Registro histórico e versionamento oficial do AeroTrainer 3D.
 * Convenção de versões:
 * - V1.X: lançamentos principais e novos recursos/sistemas;
 * - V1.X.Y: atualizações pequenas, ajustes visuais e correções de bugs.
 * Regra de redação: escrever sempre em linguagem simples e clara para qualquer jogador,
 * evitando jargões técnicos de programação ou rede.
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
    version: 'V1.5',
    title: 'Troca de Textura e Novos Visuais de Drone',
    summary:
      'Nova aba para personalizar o visual do drone, estreando os modelos Drone Branco Moderno e Drone FPV Freestyle ao lado do modelo padrão.',
    kind: 'feature',
    changes: [
      {
        category: 'Novo',
        text: 'Nova aba "Textura do Drone" no menu inicial e no menu de pausa para alternar o visual do drone com prévia 3D ao vivo.',
      },
      {
        category: 'Novo',
        text: 'Adicionado o Drone Branco Moderno, com sensores frontais duplos, câmera frontal quadrada, pernas dianteiras e hélices com pontas laranja.',
      },
      {
        category: 'Novo',
        text: 'Adicionado o Drone FPV Freestyle com chassi aberto em fibra de carbono, espaçadores roxos, motores vermelhos, hélices azuis de 3 pás, câmera dupla e bateria no topo.',
      },
      {
        category: 'Melhoria',
        text: 'A textura escolhida fica salva automaticamente e pode ser trocada até durante o voo sem reiniciar a missão.',
      },
    ],
  },
  {
    version: 'V1.4.2',
    title: 'Remoção da Câmera Solo (LOS)',
    summary:
      'Simplificação da troca de câmeras para deixar apenas as visões Chase (3ª pessoa) e FPV (primeira pessoa).',
    kind: 'fix',
    changes: [
      {
        category: 'Correção',
        text: 'Removido o modo de câmera fixa "Solo (LOS)", que apresentava falhas visuais e dificultava acompanhar o drone.',
      },
      {
        category: 'Melhoria',
        text: 'Atalho [C], botão no celular e menu de pausa agora alternam diretamente entre Chase 3ª Pessoa e FPV Óculos.',
      },
    ],
  },
  {
    version: 'V1.4.1',
    title: 'Resposta Mais Rápida no Controle pelo Celular',
    summary:
      'Melhorias na transmissão de rede do controle virtual pelo celular e na leveza do jogo para reduzir atrasos, mesmo em servidores gratuitos.',
    kind: 'fix',
    changes: [
      {
        category: 'Novo',
        text: 'Conexão direta entre o celular e o computador quando estão no mesmo Wi-Fi, deixando a resposta do drone quase imediata.',
      },
      {
        category: 'Melhoria',
        text: 'Transmissão de comandos muito mais leve e rápida, enviando apenas os movimentos necessários para não acumular atraso na rede.',
      },
      {
        category: 'Correção',
        text: 'Otimizações no visual do terreno, nas sombras e na tela de toque do celular para deixar o simulador mais leve e fluido.',
      },
    ],
  },
  {
    version: 'V1.4',
    title: 'Central de Novidades e Versões',
    summary:
      'Adição do histórico completo de atualizações no menu inicial, com numeração organizada das versões do jogo.',
    kind: 'feature',
    changes: [
      {
        category: 'Novo',
        text: 'Botão "Novidades!" no canto inferior direito do menu para consultar toda a evolução do simulador ao longo do tempo.',
      },
      {
        category: 'Novo',
        text: 'Exibição discreta da versão atual ao lado do nome do jogo e filtros para ver novidades grandes ou pequenas correções.',
      },
      {
        category: 'Melhoria',
        text: 'Registro completo das melhorias de voo, colisões, câmeras, controles e ajustes visuais desde a V1.0.',
      },
    ],
  },
  {
    version: 'V1.3',
    title: 'Animação Completa de Batida',
    summary:
      'Agora, quando o drone bate com força, ele cai girando no ar com faíscas, fumaça e efeitos sonoros antes da tela de resultado.',
    kind: 'feature',
    changes: [
      {
        category: 'Novo',
        text: 'Animação realista após o impacto, com o drone girando descontrolado, quicando no chão e perdendo hélices na batida.',
      },
      {
        category: 'Novo',
        text: 'Efeitos visuais de onda de impacto, faíscas, pequenos pedaços soltos e fumaça saindo do drone.',
      },
      {
        category: 'Novo',
        text: 'Luzes de emergência piscando em vermelho no drone, aviso "Impacto Detectado" na tela e som realista de batida.',
      },
    ],
  },
  {
    version: 'V1.2',
    title: 'Suporte a Controle de Xbox e PS4',
    summary:
      'Agora você pode pilotar como em um controle real de drone usando um joystick de Xbox ou PS4 (via DS4Windows).',
    kind: 'feature',
    changes: [
      {
        category: 'Novo',
        text: 'Compatível com controles de Xbox e PlayStation 4 (via programa DS4Windows), conectado por cabo USB ou Bluetooth.',
      },
      {
        category: 'Novo',
        text: 'Pilotagem usando apenas os dois analógicos (Esquerdo: subir/descer e girar · Direito: frente, trás e lados), sem botões atrapalhando.',
      },
      {
        category: 'Melhoria',
        text: 'Ajuste automático no centro dos analógicos para evitar que o drone puxe sozinho e aviso na tela mostrando quando o controle está conectado.',
      },
    ],
  },
  {
    version: 'V1.1.2',
    title: 'Giro Mais Suave, Colisão em Árvores e Ajuste na Visão FPV',
    summary:
      'Melhorias na sensação ao fazer curvas, proteção real nas árvores do mapa e ajuste na inclinação da câmera em primeira pessoa.',
    kind: 'fix',
    changes: [
      {
        category: 'Melhoria',
        text: 'Movimento mais fluido e natural ao virar o drone para os lados (Q/E), com leve inclinação e acompanhamento suave da câmera.',
      },
      {
        category: 'Novo',
        text: 'Todas as árvores do mapa agora têm colisão real tanto nos troncos quanto nas folhas.',
      },
      {
        category: 'Correção',
        text: 'Ajuste da câmera FPV (primeira pessoa): ela agora fica reta com o drone parado e levanta um pouco ao acelerar para frente para enxergar melhor o caminho.',
      },
    ],
  },
  {
    version: 'V1.1.1',
    title: 'Colisão nas Turbinas Eólicas, Correção Visual e Argolas',
    summary:
      'Conserto de obstáculos sem colisão, correção de pisos piscando na tela e ajuste no tamanho das argolas nos portões.',
    kind: 'fix',
    changes: [
      {
        category: 'Correção',
        text: 'Adicionada colisão real nos postes e nas pás giratórias de todas as turbinas de vento.',
      },
      {
        category: 'Correção',
        text: 'Corrigido o problema visual em que pisos, pistas e telhados ficavam piscando ao encostar no terreno.',
      },
      {
        category: 'Correção',
        text: 'Argolas diminuídas e centralizadas dentro das casas, portões e construções para não atravessarem as barras nem as paredes.',
      },
    ],
  },
  {
    version: 'V1.1',
    title: 'Mapa Gigante (720m), Construções e Novas Missões',
    summary:
      'Grande expansão do cenário com prédios e obstáculos exploráveis para treinar manobras avançadas.',
    kind: 'feature',
    changes: [
      {
        category: 'Novo',
        text: 'Vale ampliado para 720 metros com casas abandonadas, ruínas, aqueduto, hangar, ponte, túnel norte, contêiner e lago.',
      },
      {
        category: 'Novo',
        text: 'Novas missões: "05. Estruturas & Ruínas" e "06. Voo Livre · Mundo Aberto" com 14 anéis espalhados pelo mapa.',
      },
      {
        category: 'Novo',
        text: 'Paredes, pilares, arcos e telhados reagem ao toque: encostar devagar apenas empurra o drone, enquanto batidas fortes causam queda.',
      },
    ],
  },
  {
    version: 'V1.0',
    title: 'Lançamento Inicial do AeroTrainer 3D',
    summary:
      'Primeira versão do simulador 3D de drone com diferentes modos de voo, câmeras, missões e controle remoto pelo celular.',
    kind: 'major',
    changes: [
      {
        category: 'Novo',
        text: 'Simulação realista de voo com os modos Estabilizado (GPS) e Sport e opção de vento lateral.',
      },
      {
        category: 'Novo',
        text: 'Quatro missões iniciais para treinar decolagem, passagem em portões, giros ao redor da torre e pouso de precisão.',
      },
      {
        category: 'Novo',
        text: 'Controle virtual pelo celular via QR Code com dados de voo ao vivo na tela e sons de motor.',
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
