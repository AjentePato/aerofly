import {
  Play,
  RotateCcw,
  Smartphone,
  Wind,
  Award,
  AlertTriangle,
  Home,
  Gamepad2,
  Gauge,
  Monitor,
  Palette,
  Settings,
  SlidersHorizontal,
  Eye,
  EyeOff,
  Touchpad,
  Vibrate,
  Volume2,
  VolumeX,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { MISSIONS, getMissionById } from '../sim/missions';
import { GRAPHICS_MODE_OPTIONS, getGraphicsModeOption } from '../sim/graphicsMode';
import { DroneSkinSelector } from './DroneSkinSelector';
import type { GamepadActionFeedback } from '../hooks/useGamepadUI';
import type { CameraMode, DronePhysicsState, DroneSkinId, FlightMode, GraphicsMode, MissionId, MissionProgress, SpeedUnit } from '../sim/types';

export type PauseTabId = 'flight' | 'texture' | 'settings';

interface PauseModalProps {
  missionId: MissionId;
  flightMode: FlightMode;
  cameraMode: CameraMode;
  droneSkin: DroneSkinId;
  speedUnit: SpeedUnit;
  graphicsMode: GraphicsMode;
  windEnabled: boolean;
  muted: boolean;
  rumbleEnabled?: boolean;
  touchSticksEnabled: boolean;
  hudHidden: boolean;
  controllerConnected: boolean;
  gamepadConnected?: boolean;
  gamepadLabel?: string;
  gamepadFeedback?: GamepadActionFeedback | null;
  pauseTab: PauseTabId;
  onChangePauseTab: (tab: PauseTabId) => void;
  onResume: () => void;
  onRestart: () => void;
  onReturnTitle: () => void;
  onSelectMission: (id: MissionId) => void;
  onSelectFlightMode: (mode: FlightMode) => void;
  onSelectCameraMode: (cam: CameraMode) => void;
  onSelectDroneSkin: (skin: DroneSkinId) => void;
  onSelectSpeedUnit: (unit: SpeedUnit) => void;
  onSelectGraphicsMode: (mode: GraphicsMode) => void;
  onToggleWind: () => void;
  onToggleMute: () => void;
  onToggleRumble?: () => void;
  onTestRumble?: () => void;
  onToggleTouchSticks: () => void;
  onToggleHud: () => void;
  onOpenPairing: () => void;
}

export function PauseModal({
  missionId,
  flightMode,
  cameraMode,
  droneSkin,
  speedUnit,
  graphicsMode,
  windEnabled,
  muted,
  rumbleEnabled = true,
  touchSticksEnabled,
  hudHidden,
  controllerConnected,
  gamepadConnected = false,
  gamepadLabel,
  gamepadFeedback,
  pauseTab,
  onChangePauseTab,
  onResume,
  onRestart,
  onReturnTitle,
  onSelectMission,
  onSelectFlightMode,
  onSelectCameraMode,
  onSelectDroneSkin,
  onSelectSpeedUnit,
  onSelectGraphicsMode,
  onToggleWind,
  onToggleMute,
  onToggleRumble,
  onTestRumble,
  onToggleTouchSticks,
  onToggleHud,
  onOpenPairing,
}: PauseModalProps) {
  const missionIndex = Math.max(0, MISSIONS.findIndex((m) => m.id === missionId));
  const activeMission = MISSIONS[missionIndex] ?? MISSIONS[0];
  const prevMission = MISSIONS[(missionIndex - 1 + MISSIONS.length) % MISSIONS.length];
  const nextMission = MISSIONS[(missionIndex + 1) % MISSIONS.length];

  return (
    <div
      data-gamepad-root="pause"
      className="fixed inset-0 z-30 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(6, 10, 18, 0.78)' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="pause-title"
    >
      <div
        data-gamepad-scroll="true"
        className="w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-xl border border-slate-700 p-6 text-slate-100 flex flex-col gap-4"
        style={{ backgroundColor: 'rgba(12, 18, 32, 0.96)' }}
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 id="pause-title" className="font-display text-2xl font-bold text-white">
              Simulação Pausada
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Ajuste o modo de voo, câmera, textura ou missão de treinamento
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenPairing}
            className="px-3 py-2 rounded-lg border border-slate-700 bg-slate-900 hover:border-sky-400 text-xs font-medium flex items-center gap-2 cursor-pointer whitespace-nowrap"
          >
            <Smartphone className={`w-4 h-4 ${controllerConnected ? 'text-emerald-400' : 'text-sky-400'}`} />
            {controllerConnected ? 'Celular Ativo' : 'Parear Celular'}
          </button>
        </div>

        {/* Pause Modal Tabs: Voo & Missão | Textura | Configurações */}
        <div
          className="grid grid-cols-3 gap-1 p-1 rounded-lg bg-slate-900 border border-slate-700/80"
          role="tablist"
          aria-label="Abas do menu de pausa"
        >
          <button
            type="button"
            role="tab"
            aria-selected={pauseTab === 'flight'}
            onClick={() => onChangePauseTab('flight')}
            className={`px-2 py-2 rounded-md text-[11px] sm:text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
              pauseTab === 'flight'
                ? 'bg-amber-500 text-slate-950'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>Voo & Missão</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={pauseTab === 'texture'}
            onClick={() => onChangePauseTab('texture')}
            className={`px-2 py-2 rounded-md text-[11px] sm:text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
              pauseTab === 'texture'
                ? 'bg-amber-500 text-slate-950'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Palette className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>Textura</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={pauseTab === 'settings'}
            onClick={() => onChangePauseTab('settings')}
            className={`px-2 py-2 rounded-md text-[11px] sm:text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
              pauseTab === 'settings'
                ? 'bg-amber-500 text-slate-950'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Settings className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>Configurações</span>
          </button>
        </div>

        {pauseTab === 'flight' ? (
          <>
            {gamepadConnected && (
              <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-emerald-500/40 bg-emerald-500/15 text-xs text-emerald-200">
                <div className="flex items-center gap-2 min-w-0">
                  <Gamepad2 className="w-4 h-4 text-emerald-400 shrink-0" aria-hidden="true" />
                  <span className="truncate">
                    {gamepadLabel || 'Controle Xbox / DS4'} · D-Pad Menus · Stick Voo
                  </span>
                </div>
                {gamepadFeedback && (
                  <span className="shrink-0 px-2 py-0.5 rounded bg-amber-500/20 border border-amber-400/50 text-[10px] font-mono text-amber-200">
                    {gamepadFeedback.label}
                  </span>
                )}
              </div>
            )}

            {/* Mission Switch (controller-friendly stepper) */}
            <div>
              <span className="block text-xs font-medium text-slate-300 mb-1.5">
                Missão Ativa ({missionIndex + 1}/{MISSIONS.length})
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  data-testid="pause-mission-prev"
                  aria-label="Missão anterior"
                  onClick={() => onSelectMission(prevMission.id)}
                  className="w-10 h-10 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 flex items-center justify-center shrink-0 cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" aria-hidden="true" />
                </button>
                <div
                  data-testid="pause-mission-current"
                  className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-left"
                >
                  <div className="text-xs sm:text-sm font-semibold text-white truncate">
                    {activeMission.code}. {activeMission.title}
                  </div>
                  <div className="text-[11px] text-slate-400 truncate">{activeMission.subtitle}</div>
                </div>
                <button
                  type="button"
                  data-testid="pause-mission-next"
                  aria-label="Próxima missão"
                  onClick={() => onSelectMission(nextMission.id)}
                  className="w-10 h-10 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 flex items-center justify-center shrink-0 cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            </div>

            {/* Flight Mode & Camera */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <span className="block text-xs font-medium text-slate-300 mb-1.5">Modo de Voo</span>
                <div className="grid grid-cols-2 gap-1">
                  {(
                    [
                      ['normal', 'GPS'],
                      ['sport', 'Sport'],
                    ] as Array<[FlightMode, string]>
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => onSelectFlightMode(id)}
                      className={`py-2 rounded-md text-xs font-semibold border transition-colors cursor-pointer ${
                        flightMode === id
                          ? 'bg-amber-500 text-slate-950 border-amber-400'
                          : 'bg-slate-900 text-slate-300 border-slate-700 hover:border-slate-500'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <span className="block text-xs font-medium text-slate-300 mb-1.5">Câmera</span>
                <div className="grid grid-cols-2 gap-1">
                  {(
                    [
                      ['chase', 'Chase'],
                      ['fpv', 'FPV'],
                    ] as Array<[CameraMode, string]>
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => onSelectCameraMode(id)}
                      className={`py-2 rounded-md text-xs font-semibold border transition-colors cursor-pointer ${
                        cameraMode === id
                          ? 'bg-sky-500 text-slate-950 border-sky-400'
                          : 'bg-slate-900 text-slate-300 border-slate-700 hover:border-slate-500'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Quick Wind Toggle inside Flight & Mission */}
            <button
              type="button"
              onClick={onToggleWind}
              className={`w-full px-3.5 py-2.5 rounded-lg border text-xs font-medium flex items-center justify-between cursor-pointer ${
                windEnabled
                  ? 'bg-sky-500/15 border-sky-400 text-sky-200'
                  : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-slate-500'
              }`}
            >
              <span className="flex items-center gap-2">
                <Wind className="w-4 h-4" aria-hidden="true" />
                Simulação de Vento Lateral
              </span>
              <span className="font-mono">{windEnabled ? 'ATIVADO' : 'DESLIGADO'}</span>
            </button>
          </>
        ) : pauseTab === 'texture' ? (
          <div className="flex flex-col gap-2">
            <DroneSkinSelector
              selectedSkin={droneSkin}
              onSelectSkin={onSelectDroneSkin}
              compact
            />
            <p className="text-xs text-slate-400">
              A troca é aplicada instantaneamente ao drone em voo sem reiniciar sua missão.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            <div className="rounded-lg border border-slate-700 bg-slate-900 p-3 flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                  <Monitor className="w-4 h-4 text-amber-400" aria-hidden="true" />
                  Gráficos do Jogo
                </span>
                <span className="text-[11px] font-mono text-slate-400">
                  {graphicsMode === 'low_poly' ? 'Clássico Leve' : 'Alta Qualidade'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="Qualidade gráfica">
                {GRAPHICS_MODE_OPTIONS.map((opt) => {
                  const active = graphicsMode === opt.id;
                  const testId = opt.id === 'low_poly' ? 'pause-graphics-low-poly' : 'pause-graphics-realistic';
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      data-testid={testId}
                      onClick={() => onSelectGraphicsMode(opt.id)}
                      className={`py-2 px-2.5 rounded-md text-xs font-semibold border transition-colors cursor-pointer ${
                        active
                          ? 'bg-amber-500 text-slate-950 border-amber-400'
                          : 'bg-slate-950/70 text-slate-300 border-slate-700 hover:border-slate-500'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-slate-400 leading-tight">
                {getGraphicsModeOption(graphicsMode).description}
              </p>
            </div>

            <div className="rounded-lg border border-slate-700 bg-slate-900 p-3 flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                  <Gauge className="w-4 h-4 text-amber-400" aria-hidden="true" />
                  Unidade de Velocidade
                </span>
                <span className="text-[11px] font-mono text-slate-400">
                  {speedUnit === 'kmh' ? 'Quilômetros/hora' : 'Metros/segundo'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="Unidade de velocidade">
                <button
                  type="button"
                  data-testid="pause-speed-unit-kmh"
                  onClick={() => onSelectSpeedUnit('kmh')}
                  className={`py-2 px-3 rounded-md text-xs font-semibold border transition-colors cursor-pointer ${
                    speedUnit === 'kmh'
                      ? 'bg-amber-500 text-slate-950 border-amber-400'
                      : 'bg-slate-950/70 text-slate-300 border-slate-700 hover:border-slate-500'
                  }`}
                >
                  km/h
                </button>
                <button
                  type="button"
                  data-testid="pause-speed-unit-ms"
                  onClick={() => onSelectSpeedUnit('ms')}
                  className={`py-2 px-3 rounded-md text-xs font-semibold border transition-colors cursor-pointer ${
                    speedUnit === 'ms'
                      ? 'bg-amber-500 text-slate-950 border-amber-400'
                      : 'bg-slate-950/70 text-slate-300 border-slate-700 hover:border-slate-500'
                  }`}
                >
                  m/s
                </button>
              </div>
            </div>

            <button
              type="button"
              data-testid="pause-toggle-touch-sticks"
              onClick={onToggleTouchSticks}
              className={`w-full px-3.5 py-2.5 rounded-lg border text-xs font-medium flex items-center justify-between cursor-pointer ${
                touchSticksEnabled
                  ? 'bg-amber-500/15 border-amber-400 text-amber-200'
                  : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-slate-500'
              }`}
            >
              <span className="flex items-center gap-2">
                <Touchpad className="w-4 h-4" aria-hidden="true" />
                Joysticks Virtuais na Tela
              </span>
              <span className="font-mono">{touchSticksEnabled ? 'ATIVADO' : 'DESLIGADO'}</span>
            </button>

            <button
              type="button"
              data-testid="pause-toggle-hud"
              onClick={onToggleHud}
              className={`w-full px-3.5 py-2.5 rounded-lg border text-xs font-medium flex items-center justify-between cursor-pointer ${
                hudHidden
                  ? 'bg-slate-800 border-amber-400/60 text-amber-200'
                  : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-slate-500'
              }`}
            >
              <span className="flex items-center gap-2">
                {hudHidden ? <EyeOff className="w-4 h-4" aria-hidden="true" /> : <Eye className="w-4 h-4" aria-hidden="true" />}
                Exibição do HUD (Sticks Ocultos)
              </span>
              <span className="font-mono">{hudHidden ? 'OCULTO' : 'VISÍVEL'}</span>
            </button>

            <button
              type="button"
              onClick={onToggleWind}
              className={`w-full px-3.5 py-2.5 rounded-lg border text-xs font-medium flex items-center justify-between cursor-pointer ${
                windEnabled
                  ? 'bg-sky-500/15 border-sky-400 text-sky-200'
                  : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-slate-500'
              }`}
            >
              <span className="flex items-center gap-2">
                <Wind className="w-4 h-4" aria-hidden="true" />
                Simulação de Vento Lateral
              </span>
              <span className="font-mono">{windEnabled ? 'ATIVADO' : 'DESLIGADO'}</span>
            </button>

            <button
              type="button"
              onClick={onToggleMute}
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-700 bg-slate-900 text-slate-200 hover:border-slate-500 text-xs font-medium flex items-center justify-between cursor-pointer"
            >
              <span className="flex items-center gap-2">
                {muted ? <VolumeX className="w-4 h-4 text-slate-400" aria-hidden="true" /> : <Volume2 className="w-4 h-4 text-emerald-400" aria-hidden="true" />}
                Som do Simulador
              </span>
              <span className="font-mono">{muted ? 'MUDO' : 'ATIVADO'}</span>
            </button>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                data-testid="pause-toggle-rumble"
                onClick={onToggleRumble}
                className={`flex-1 px-3.5 py-2.5 rounded-lg border text-xs font-medium flex items-center justify-between cursor-pointer ${
                  rumbleEnabled
                    ? 'bg-emerald-500/15 border-emerald-500/60 text-emerald-200'
                    : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-500'
                }`}
              >
                <span className="flex items-center gap-2">
                  <Vibrate className="w-4 h-4" aria-hidden="true" />
                  Vibração do Controle
                </span>
                <span className="font-mono">{rumbleEnabled ? 'ATIVADA' : 'DESLIGADA'}</span>
              </button>
              <button
                type="button"
                data-testid="pause-test-rumble"
                onClick={onTestRumble}
                disabled={!rumbleEnabled}
                className="px-3 py-2.5 rounded-lg border border-slate-700 bg-slate-900 hover:border-amber-400 disabled:opacity-45 disabled:cursor-not-allowed text-xs font-semibold text-amber-300 cursor-pointer whitespace-nowrap"
              >
                Testar
              </button>
            </div>
          </div>
        )}

        {/* Modal Actions */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800">
          <button
            type="button"
            onClick={onReturnTitle}
            className="px-4 py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 text-xs font-medium flex items-center gap-1.5 cursor-pointer"
          >
            <Home className="w-3.5 h-3.5" />
            Menu Inicial
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onRestart}
              className="px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reiniciar
            </button>
            <button
              type="button"
              data-gamepad-default="true"
              onClick={onResume}
              className="px-5 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              Continuar Voo
            </button>
          </div>
        </div>
        <div className="text-[10px] text-slate-400 text-center">
          Controle: D-Pad Navegar · A/✕ Selecionar · LB/RB Abas · B/○ ou Start Continuar
        </div>
      </div>
    </div>
  );
}

interface OutcomeModalProps {
  progress: MissionProgress;
  snapshot: DronePhysicsState;
  bestScore: number;
  hasNextMission: boolean;
  onRetry: () => void;
  onNextMission: () => void;
  onReturnTitle: () => void;
}

export function OutcomeModal({
  progress,
  snapshot,
  bestScore,
  hasNextMission,
  onRetry,
  onNextMission,
  onReturnTitle,
}: OutcomeModalProps) {
  const mission = getMissionById(progress.missionId);
  const victory = progress.completed && !progress.failed;

  return (
    <div
      data-gamepad-root="outcome"
      className="fixed inset-0 z-30 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(6, 10, 18, 0.8)' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="outcome-title"
    >
      <div
        className="w-full max-w-md rounded-xl border border-slate-700 p-6 text-slate-100 flex flex-col gap-5"
        style={{ backgroundColor: 'rgba(12, 18, 32, 0.97)' }}
      >
        <div className="flex items-start gap-3">
          <div
            className={`w-11 h-11 rounded-lg flex items-center justify-center shrink-0 ${
              victory ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
            }`}
          >
            {victory ? <Award className="w-6 h-6" /> : <AlertTriangle className="w-6 h-6" />}
          </div>
          <div>
            <div className="text-xs font-medium text-slate-400">
              Missão {mission.code} · {mission.title}
            </div>
            <h2 id="outcome-title" className="font-display text-2xl font-bold text-white mt-0.5">
              {victory ? 'Treinamento Concluído' : 'Queda Detectada'}
            </h2>
            <p className="text-xs text-slate-300 mt-1">
              {victory
                ? 'Excelente controle de estabilidade e precisão.'
                : progress.failReason || 'Impacto forte com o solo ou obstáculo.'}
            </p>
          </div>
        </div>

        {/* 3 Tabular Mastery / Progress Metrics */}
        <div className="grid grid-cols-3 gap-2.5 tabular-nums">
          <div className="rounded-lg bg-slate-900 border border-slate-800 p-3">
            <div className="text-[11px] text-slate-400">{victory ? 'TEMPO' : 'PORTÕES'}</div>
            <div className="font-mono text-lg font-bold text-white mt-0.5">
              {victory
                ? `${progress.elapsedSec.toFixed(1)}s`
                : `${progress.gatesCleared}/${progress.totalGates}`}
            </div>
          </div>

          <div className="rounded-lg bg-slate-900 border border-slate-800 p-3">
            <div className="text-[11px] text-slate-400">PONTUAÇÃO</div>
            <div className="font-mono text-lg font-bold text-amber-400 mt-0.5">
              {progress.score}
            </div>
          </div>

          <div className="rounded-lg bg-slate-900 border border-slate-800 p-3">
            <div className="text-[11px] text-slate-400">{victory ? 'RECORDE' : 'ALT. MÁX'}</div>
            <div className="font-mono text-lg font-bold text-sky-300 mt-0.5">
              {victory ? bestScore : `${Math.round(snapshot.maxAltitudeReached)}m`}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800">
          <button
            type="button"
            data-gamepad-action="return-title"
            onClick={onReturnTitle}
            className="px-3.5 py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-medium text-slate-300 cursor-pointer"
          >
            Menu Inicial
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              data-start={!victory || !hasNextMission ? 'true' : undefined}
              data-gamepad-default={!victory || !hasNextMission ? 'true' : undefined}
              onClick={onRetry}
              className={`px-4 py-2.5 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer ${
                victory && hasNextMission
                  ? 'bg-slate-800 hover:bg-slate-700 text-slate-100'
                  : 'bg-amber-500 hover:bg-amber-400 text-slate-950'
              }`}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              {victory ? 'Voar Novamente' : 'Tentar Novamente'}
            </button>

            {victory && hasNextMission && (
              <button
                type="button"
                data-start="true"
                data-gamepad-default="true"
                onClick={onNextMission}
                className="px-5 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                Próxima Missão
              </button>
            )}
          </div>
        </div>
        <div className="text-[10px] text-slate-400 text-center">
          Controle: D-Pad Navegar · A/✕ Confirmar · B/○ Menu Inicial
        </div>
      </div>
    </div>
  );
}
