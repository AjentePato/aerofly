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
    version: 'V2.3',
    title: 'Controle Completo nos Menus, Atalhos de Voo e Vibração Tátil',
    summary:
      'Agora é possível controlar todo o simulador usando apenas um controle de PS4 (via DS4Windows) ou Xbox, com navegação completa em menus, atalhos em voo e resposta por vibração.',
    kind: 'feature',
    changes: [
      {
        category: 'Novo',
        text: 'Navegação completa pelo controle em todas as telas: use as setinhas (D-Pad) ou o analógico esquerdo para escolher missões, modos de voo, texturas, configurações e janelas, A / ✕ para confirmar e B / ○ para voltar.',
      },
      {
        category: 'Novo',
        text: 'Troca rápida de abas e filtros com LB / RB (L1 / R1) no menu inicial, pausa e novidades, além de rolagem de listas pelo analógico direito.',
      },
      {
        category: 'Novo',
        text: 'Vibração tátil (feedback háptico) no controle ao navegar, confirmar botões, ligar os motores, atravessar portões, pousar com força ou bater — com opção para ligar, desligar e testar a vibração nas Configurações.',
      },
      {
        category: 'Melhoria',
        text: 'Atalhos práticos durante o voo pelo controle (Start/Options para pausar, Y / △ câmera, X / □ modo GPS/Sport, LB som, RB ocultar HUD e Back/Share reiniciar) com aviso visual na tela.',
      },
    ],
  },
  {
    version: 'V2.2',
    title: 'Seletor de Gráficos (Low-Poly e Realista) e Ajustes Visuais do Cenário',
    summary:
      'Adicionada a opção nas Configurações para escolher entre o visual clássico Low-Poly (Clássica) e o visual Realista (Nova), além de correções na água do lago e nos reflexos do terreno.',
    kind: 'feature',
    changes: [
      {
        category: 'Novo',
        text: 'Nova opção nas Configurações (menu inicial e pausa) para trocar os gráficos entre Low-Poly (Clássica) e Realista (Nova) a qualquer momento.',
      },
      {
        category: 'Correção',
        text: 'Corrigida a cor e o reflexo da água do lago em todo o contorno, removendo o aspecto esbranquiçado em ângulos baixos para exibir azul e verde naturais.',
      },
      {
        category: 'Melhoria',
        text: 'Reduzido o brilho excessivo no solo e no cascalho, removida a caixa do topo das turbinas eólicas e aprimorados o topo da torre e a textura das ruínas.',
      },
    ],
  },
  {
    version: 'V2.1',
    title: 'Visual Realista de Terreno, Água, Vegetação, Construções e Drones',
    summary:
      'Reformulação gráfica completa de todo o cenário e dos modelos de drone para substituir o estilo simples por iluminação natural, superfícies detalhadas e animações realistas.',
    kind: 'major',
    changes: [
      {
        category: 'Novo',
        text: 'Terreno mais detalhado com mistura natural entre grama, trilhas de cascalho, encostas rochosas e margem úmida ao redor do lago.',
      },
      {
        category: 'Novo',
        text: 'Lago com ondas em movimento, reflexos do céu e espuma suave na beira, além de nuvens se movendo no céu.',
      },
      {
        category: 'Novo',
        text: 'Pinheiros com copas em camadas reais que balançam com o vento, tufos de capim e rochas naturais pelo vale.',
      },
      {
        category: 'Melhoria',
        text: 'Construções, contêineres, pista de asfalto, helipontos com luzes, torre com treliças, turbinas eólicas com pás aerodinâmicas e o Drone Padrão totalmente detalhados.',
      },
    ],
  },
  {
    version: 'V2.0.1',
    title: 'Unidade de Velocidade (km/h e m/s) nas Configurações',
    summary:
      'Adicionada uma aba dedicada de Configurações no menu inicial e no menu de pausa para escolher entre km/h e m/s na telemetria de voo.',
    kind: 'fix',
    changes: [
      {
        category: 'Novo',
        text: 'Nova opção nas Configurações para alternar a velocidade do drone e do vento entre km/h e m/s a qualquer momento.',
      },
      {
        category: 'Melhoria',
        text: 'A preferência escolhida fica salva automaticamente e atualiza tanto o painel de voo quanto a tela do controle remoto no celular.',
      },
    ],
  },
  {
    version: 'V2.0',
    title: 'Simulador Completo no Celular, Joysticks Dinâmicos e Modo Tela Limpa',
    summary:
      'Grande atualização que torna todo o simulador 3D jogável diretamente no celular ou tablet, com joysticks virtuais dinâmicos na tela e opção para ocultar todo o HUD.',
    kind: 'major',
    changes: [
      {
        category: 'Novo',
        text: 'Suporte completo para jogar direto no celular (em pé ou deitado), com menus, botões e câmera adaptados automaticamente para telas menores.',
      },
      {
        category: 'Novo',
        text: 'Joysticks virtuais dinâmicos na própria tela de voo: toque em qualquer ponto do lado esquerdo (subir e girar) ou direito (mover para frente, trás e lados) para o controle surgir exatamente onde seu dedo tocou.',
      },
      {
        category: 'Novo',
        text: 'Partida dos motores também por toque: arraste os dois joysticks virtuais para baixo e para dentro ou segure o botão "Segurar p/ Ligar" no aviso inicial.',
      },
      {
        category: 'Novo',
        text: 'Botão "Ocultar HUD" na tela de voo (e atalho [H] no teclado) para esconder todos os painéis, mira e telemetria: os joysticks por toque continuam funcionando na tela de forma invisível, deixando a visão do cenário 100% limpa com um botão discreto no canto para restaurar quando quiser.',
      },
      {
        category: 'Melhoria',
        text: 'Opções no menu de pausa para ligar ou desligar os joysticks na tela a qualquer momento e alternar a exibição do HUD.',
      },
    ],
  },
  {
    version: 'V1.6.1',
    title: 'Melhorias no Drone',
    summary:
      'Correção no comportamento do drone no solo para impedir inclinações, giros ou deslizes enquanto estiver apoiado em qualquer superfície.',
    kind: 'fix',
    changes: [
      {
        category: 'Correção',
        text: 'Invalidados os comandos de movimento lateral, inclinação e giro enquanto o drone estiver apoiado no chão, heliponto ou cima de estruturas.',
      },
      {
        category: 'Melhoria',
        text: 'Enquanto estiver em uma superfície, apenas o comando de subir (Espaço ou stick esquerdo para cima) funciona para uma decolagem reta e estável.',
      },
    ],
  },
  {
    version: 'V1.6',
    title: 'Partida dos Motores ao Iniciar a Fase',
    summary:
      'Agora o drone começa desligado no heliponto sempre que uma fase inicia ou é reiniciada, deixando a decolagem mais realista.',
    kind: 'feature',
    changes: [
      {
        category: 'Novo',
        text: 'Ao começar ou reiniciar qualquer fase, as hélices ficam paradas até você ligar o drone manualmente.',
      },
      {
        category: 'Novo',
        text: 'Para ligar os motores, segure a tecla V no teclado ou coloque os dois sticks do controle para baixo e para dentro.',
      },
      {
        category: 'Melhoria',
        text: 'Trava de segurança pós-partida: ao ligar pelo controle, o drone aguarda você soltar os sticks antes de se mover para não girar nem sair do lugar sozinho, e o cronômetro só começa após ligar.',
      },
    ],
  },
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
