import { useState } from 'react';
import {
  Play,
  RotateCcw,
  Smartphone,
  Wind,
  Award,
  AlertTriangle,
  Home,
  Gamepad2,
  Palette,
  SlidersHorizontal,
  Eye,
  EyeOff,
  Touchpad,
} from 'lucide-react';
import { MISSIONS, getMissionById } from '../sim/missions';
import { DroneSkinSelector } from './DroneSkinSelector';
import type { CameraMode, DronePhysicsState, DroneSkinId, FlightMode, MissionId, MissionProgress } from '../sim/types';

interface PauseModalProps {
  missionId: MissionId;
  flightMode: FlightMode;
  cameraMode: CameraMode;
  droneSkin: DroneSkinId;
  windEnabled: boolean;
  touchSticksEnabled: boolean;
  hudHidden: boolean;
  controllerConnected: boolean;
  gamepadConnected?: boolean;
  gamepadLabel?: string;
  onResume: () => void;
  onRestart: () => void;
  onReturnTitle: () => void;
  onSelectMission: (id: MissionId) => void;
  onSelectFlightMode: (mode: FlightMode) => void;
  onSelectCameraMode: (cam: CameraMode) => void;
  onSelectDroneSkin: (skin: DroneSkinId) => void;
  onToggleWind: () => void;
  onToggleTouchSticks: () => void;
  onToggleHud: () => void;
  onOpenPairing: () => void;
}

export function PauseModal({
  missionId,
  flightMode,
  cameraMode,
  droneSkin,
  windEnabled,
  touchSticksEnabled,
  hudHidden,
  controllerConnected,
  gamepadConnected = false,
  gamepadLabel,
  onResume,
  onRestart,
  onReturnTitle,
  onSelectMission,
  onSelectFlightMode,
  onSelectCameraMode,
  onSelectDroneSkin,
  onToggleWind,
  onToggleTouchSticks,
  onToggleHud,
  onOpenPairing,
}: PauseModalProps) {
  const [pauseTab, setPauseTab] = useState<'settings' | 'texture'>('settings');

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(6, 10, 18, 0.78)' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="pause-title"
    >
      <div
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

        {/* Pause Modal Tabs: Voo & Missão | Textura do Drone */}
        <div
          className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-slate-900 border border-slate-700/80"
          role="tablist"
          aria-label="Abas do menu de pausa"
        >
          <button
            type="button"
            role="tab"
            aria-selected={pauseTab === 'settings'}
            onClick={() => setPauseTab('settings')}
            className={`px-3 py-2 rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
              pauseTab === 'settings'
                ? 'bg-amber-500 text-slate-950'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" aria-hidden="true" />
            Voo & Missão
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={pauseTab === 'texture'}
            onClick={() => setPauseTab('texture')}
            className={`px-3 py-2 rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
              pauseTab === 'texture'
                ? 'bg-amber-500 text-slate-950'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Palette className="w-3.5 h-3.5" aria-hidden="true" />
            Textura do Drone
          </button>
        </div>

        {pauseTab === 'settings' ? (
          <>
            {gamepadConnected && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-emerald-500/40 bg-emerald-500/15 text-xs text-emerald-200">
                <Gamepad2 className="w-4 h-4 text-emerald-400 shrink-0" aria-hidden="true" />
                <span>
                  Controle conectado ({gamepadLabel || 'Xbox / DS4'}) · Stick Esq: Acel/Yaw · Stick Dir: Pitch/Roll
                </span>
              </div>
            )}

            {/* Mission Switch */}
            <div>
              <label htmlFor="pause-mission-select" className="block text-xs font-medium text-slate-300 mb-1.5">
                Missão Ativa
              </label>
              <select
                id="pause-mission-select"
                value={missionId}
                onChange={(e) => onSelectMission(e.target.value as MissionId)}
                className="w-full px-3 py-2.5 rounded-lg bg-slate-900 border border-slate-700 text-sm text-white focus:outline-none focus:border-amber-400"
              >
                {MISSIONS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.code}. {m.title} — {m.subtitle}
                  </option>
                ))}
              </select>
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

            {/* Wind, On-Screen Joysticks & HUD Visibility Toggles */}
            <div className="flex flex-col gap-2">
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
                  Exibição do HUD e Joysticks
                </span>
                <span className="font-mono">{hudHidden ? 'OCULTO' : 'VISÍVEL'}</span>
              </button>
            </div>
          </>
        ) : (
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
              onClick={onResume}
              className="px-5 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              Continuar Voo
            </button>
          </div>
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
            onClick={onReturnTitle}
            className="px-3.5 py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-medium text-slate-300 cursor-pointer"
          >
            Menu Inicial
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              data-start={!victory || !hasNextMission ? 'true' : undefined}
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
                onClick={onNextMission}
                className="px-5 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                Próxima Missão
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
