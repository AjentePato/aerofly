# AeroTrainer 3D — Arquitetura e Design

## Visão Geral
Simulador 3D de voo e treinamento para drones quadricópteros construído com React, TypeScript, Three.js, Express e WebSocket (`ws`). Interface e telemetria 100% em Português do Brasil.

## Arquitetura e Arquivos Principais
- `src/App.tsx`: Orquestrador de estado global (`title`, `playing`, `paused`, `gameover`), cliente WebSocket de pareamento celular e status do controle físico Xbox/DS4.
- `src/sim/types.ts`: Tipos compartilhados (`StickInput`, `DronePhysicsState`, `DroneTelemetry`, `MissionDefinition`, `MissionProgress`).
- `src/sim/physics.ts`: Motor físico determinístico 6DoF (`stepDronePhysics`), terreno procedural (`groundHeightAt`, `surfaceHeightAt`), vento, turbinas eólicas, árvores (`WORLD_TREES`) e colisões AABB/cilindro/cone.
- `src/sim/structures.ts`: Geometria e colisores de estruturas (hangar, torre, casas abandonadas, galpões, ruínas, túnel, bunker, pórticos).
- `src/sim/missions.ts`: Definições das 6 missões de treinamento, portões e avaliação de progresso/colisão.
- `src/sim/gamepad.ts`: Leitura pura da Gamepad API para controles Xbox / XInput / PS4 via DS4Windows (USB ou Bluetooth), utilizando exclusivamente os dois sticks analógicos em configuração RC Modo 2 com zona morta (`STICK_DEADZONE = 0.08`) e reescala suave.
- `src/sim/crashAnimation.ts`: Física pura da animação pós-colisão (rebote, queda com giro descontrolado/tumble, quique no solo e temporização antes da tela de resultado).
- `src/sim/crashEffects.ts`: Pool pré-alocado de partículas 3D de colisão (onda de choque, faíscas, fragmentos, hélices soltas e fumaça).
- `src/sim/changelog.ts`: Histórico oficial de versões (`V1.X` para recursos, `V1.X.Y` para correções) e filtragem das alterações desde a V1.0.
- `src/sim/floatingStick.ts` & `src/sim/touchControls.ts`: Lógica pura dos joysticks dinâmicos flutuantes no ponto de toque, detecção automática de dispositivos móveis/toque, raio adaptativo para modo paisagem e compensação de FOV vertical em modo retrato.
- `src/sim/stickProtocol.ts`: Codificação/decodificação binária compacta de 9 bytes (`0x01 + 4x Int16LE`), detecção de variação/retorno imediato ao centro e seleção de transporte (`webrtc` / `ws`).
- `src/sim/webrtcConfig.ts`: Configuração ICE/STUN e tipos de sinalização para canal direto P2P (`RTCDataChannel` não ordenado e sem retransmissão).
- `src/sim/worldBuilder.ts`: Construção da cena Three.js (terreno otimizado, lago, pistas, estruturas com raio de culling para raycast, vegetação, iluminação e visuais de missão).
- `src/sim/droneSkins.ts`: Catálogo e persistência local (`default`, `dji_lito_1` e `fpv_freestyle`) dos visuais/texturas selecionáveis do drone.
- `src/sim/droneMesh.ts`, `src/sim/droneLito1Mesh.ts` & `src/sim/droneFpvMesh.ts`: Rigs 3D completos do Drone Padrão, do Drone Branco Moderno e do Drone FPV Freestyle (chassi aberto em carbono, motores vermelhos, hélices azuis de 3 pás, câmera dupla e bateria no topo).
- `src/sim/arming.ts`: Máquina de partida dos motores (`armed: false` ao iniciar ou reiniciar fase) exigindo segurar `V` no teclado, usar o botão de toque "Segurar p/ Ligar" ou o gesto CSC dos dois sticks para baixo e para dentro.
- `src/sim/audio.ts`: Síntese procedural de motores, melodia de partida dos ESCs, portões e colisões via Web Audio API.
- `src/components/FloatingStickZone.tsx` & `src/components/VirtualTouchSticks.tsx`: Componente compartilhado de joystick virtual dinâmico (usado tanto no modo controle remoto quanto direto na tela do jogo em celular/tablet), aparecendo exatamente no primeiro ponto de toque em cada metade da tela.
- `src/components/DroneCanvas.tsx`: Loop WebGL/Three.js (`requestAnimationFrame` / `afterDraw` em software GL), amostragem unificada de teclado + sticks virtuais na tela + celular pareado + gamepad físico, atalho `[H]` para ocultar HUD, partida dos motores, troca ao vivo de modelo do drone e câmeras (`chase`, `fpv`) com compensação retrato.
- `src/components/TitleOverlay.tsx` & `src/components/DroneSkinSelector.tsx`: Tela inicial responsiva (retrato e paisagem) com abas (`Missões & Voo` e `Textura do Drone`), prévia 3D em close-up, versão ao lado do título e botão "Novidades!" no canto inferior direito.
- `src/components/ChangelogModal.tsx`: Modal acessível exibindo a linha do tempo detalhada de versões com filtros.
- `src/components/FlightHUD.tsx`: HUD responsivo com opção de ocultar todo o HUD e joysticks (`[H]` / botão olho), aviso de partida enquanto desligado, objetivo da missão, troca rápida de modo, câmera/som/pausa, status de controle Xbox/DS4 e barra de telemetria centralizada em telas touch.
- `src/components/Modals.tsx`: Modais de pausa (`PauseModal`, incluindo alternância de joysticks virtuais na tela e exibição do HUD) e resultado de missão (`OutcomeModal`).
- `src/components/PairingModal.tsx` & `src/components/MobileController.tsx`: Controle remoto virtual por celular usando `FloatingStickZone`, envio imediato binário de 9 bytes e upgrade automático para WebRTC P2P.
- `server.ts`: Servidor Express + WebSocket (`perMessageDeflate: false`, `TCP_NODELAY`) com repasse binário zero-parse, controle de fila e sinalização WebRTC.

## Mapeamento RC Modo 2 (Controle Xbox / DS4Windows)
- **Stick Esquerdo Y (`axes[1]` invertido)**: Aceleração (`throttle`: `+1` subir, `-1` descer, centro `0` mantém altitude em GPS/Sport)
- **Stick Esquerdo X (`axes[0]`)**: Guinada (`yaw`: `-1` esquerda, `+1` direita)
- **Stick Direito Y (`axes[3]` invertido)**: Arfagem (`pitch`: `+1` frente, `-1` trás)
- **Stick Direito X (`axes[2]`)**: Rolagem (`roll`: `-1` esquerda, `+1` direita)
- Botões, gatilhos e direcional digital não interferem no controle do drone (uso exclusivo dos sticks).
