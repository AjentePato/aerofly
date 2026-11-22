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
- `src/sim/stickProtocol.ts`: Codificação/decodificação binária compacta de 9 bytes (`0x01 + 4x Int16LE`), detecção de variação/retorno imediato ao centro e seleção de transporte (`webrtc` / `ws`).
- `src/sim/webrtcConfig.ts`: Configuração ICE/STUN e tipos de sinalização para canal direto P2P (`RTCDataChannel` não ordenado e sem retransmissão).
- `src/sim/worldBuilder.ts`: Construção da cena Three.js (terreno otimizado, lago, pistas, estruturas com raio de culling para raycast, vegetação, iluminação e visuais de missão).
- `src/sim/droneMesh.ts`: Rig 3D do drone quadricóptero, hélices, gimbal estabilizado e sombra de contato.
- `src/sim/audio.ts`: Síntese procedural de motores, portões e colisões via Web Audio API.
- `src/components/DroneCanvas.tsx`: Loop WebGL/Three.js (`requestAnimationFrame` / `afterDraw` em software GL), amostragem unificada de teclado + celular + gamepad físico e câmeras (`chase`, `fpv`, `los`).
- `src/components/TitleOverlay.tsx`: Tela inicial com seleção de missões, modo de voo, vento, pareamento celular, indicador discreto de versão ao lado do título e botão "Novidades!" no canto inferior direito.
- `src/components/ChangelogModal.tsx`: Modal acessível exibindo a linha do tempo detalhada de versões com filtros.
- `src/components/FlightHUD.tsx`: HUD de voo com objetivo da missão, troca rápida de modo, câmera/som/pausa, status de controle Xbox/DS4, visualizador ao vivo dos sticks Modo 2 e barra de telemetria.
- `src/components/Modals.tsx`: Modais de pausa (`PauseModal`) e resultado de missão (`OutcomeModal`).
- `src/components/PairingModal.tsx` & `src/components/MobileController.tsx`: Controle remoto virtual por celular com toque direto no DOM, envio imediato binário de 9 bytes e upgrade automático para WebRTC P2P.
- `server.ts`: Servidor Express + WebSocket (`perMessageDeflate: false`, `TCP_NODELAY`) com repasse binário zero-parse, controle de fila e sinalização WebRTC.

## Mapeamento RC Modo 2 (Controle Xbox / DS4Windows)
- **Stick Esquerdo Y (`axes[1]` invertido)**: Aceleração (`throttle`: `+1` subir, `-1` descer, centro `0` mantém altitude em GPS/Sport)
- **Stick Esquerdo X (`axes[0]`)**: Guinada (`yaw`: `-1` esquerda, `+1` direita)
- **Stick Direito Y (`axes[3]` invertido)**: Arfagem (`pitch`: `+1` frente, `-1` trás)
- **Stick Direito X (`axes[2]`)**: Rolagem (`roll`: `-1` esquerda, `+1` direita)
- Botões, gatilhos e direcional digital não interferem no controle do drone (uso exclusivo dos sticks).
