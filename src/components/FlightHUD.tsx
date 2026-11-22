import { AlertTriangle, Camera, Gamepad2, Pause, RotateCcw, Smartphone, Volume2, VolumeX } from 'lucide-react';
import { getMissionById } from '../sim/missions';
import type {
  CameraMode,
  DroneTelemetry,
  FlightMode,
  MissionProgress,
  StickInput,
} from '../sim/types';

interface FlightHUDProps {
  telemetry: DroneTelemetry;
  progress: MissionProgress;
  sticks: StickInput;
  muted: boolean;
  controllerConnected: boolean;
  gamepadConnected: boolean;
  gamepadLabel?: string;
  onCycleCamera: () => void;
  onToggleMute: () => void;
  onTogglePause: () => void;
  onReset: () => void;
  onOpenPairing: () => void;
  onSelectFlightMode: (mode: FlightMode) => void;
}

const CAMERA_LABELS: Record<CameraMode, string> = {
  chase: 'Chase 3ª Pessoa',
  fpv: 'FPV Óculos',
};

const MODE_LABELS: Record<FlightMode, string> = {
  normal: 'GPS Estabilizado',
  sport: 'Sport',
};

function StickMiniPreview({ x, y, label }: { x: number; y: number; label: string }) {
  const dotX = 24 + x * 16;
  const dotY = 24 - y * 16;
  return (
    <div className="flex flex-col items-center gap-1">
      <svg viewBox="0 0 48 48" className="w-11 h-11" aria-label={label}>
        <circle cx="24" cy="24" r="20" fill="rgba(10,15,28,0.8)" stroke="rgba(148,163,184,0.45)" strokeWidth="1.5" />
        <line x1="24" y1="6" x2="24" y2="42" stroke="rgba(148,163,184,0.22)" strokeWidth="1" />
        <line x1="6" y1="24" x2="42" y2="24" stroke="rgba(148,163,184,0.22)" strokeWidth="1" />
        <circle cx={dotX} cy={dotY} r="4.5" fill="#f59e0b" stroke="#0f172a" strokeWidth="1.2" />
      </svg>
      <span className="text-[10px] font-mono text-slate-300">{label}</span>
    </div>
  );
}

export function FlightHUD({
  telemetry,
  progress,
  sticks,
  muted,
  controllerConnected,
  gamepadConnected,
  gamepadLabel,
  onCycleCamera,
  onToggleMute,
  onTogglePause,
  onReset,
  onOpenPairing,
  onSelectFlightMode,
}: FlightHUDProps) {
  const mission = getMissionById(progress.missionId);
  const speedKmh = Math.round(telemetry.speed * 3.6);
  const altMeters = Math.round(telemetry.agl);
  const batPct = Math.round(telemetry.batteryPct);

  const rollRad = (telemetry.rollDeg * Math.PI) / 180;
  const pitchOffset = Math.max(-28, Math.min(28, telemetry.pitchDeg * 0.7));

  return (
    <div className="fixed inset-0 z-10 pointer-events-none select-none flex flex-col justify-between p-4 md:p-6">
      {/* Brief peripheral crash impact flash & status during tumble sequence */}
      {telemetry.crashed && (
        <>
          <div
            className="fixed inset-0 pointer-events-none animate-pulse"
            style={{
              background:
                'radial-gradient(circle at center, rgba(239, 68, 68, 0) 42%, rgba(220, 38, 38, 0.42) 100%)',
            }}
          />
          <div
            data-testid="crash-impact-banner"
            className="fixed top-6 left-1/2 -translate-x-1/2 z-20 px-4 py-2 rounded-lg border border-rose-500/70 bg-rose-950/90 text-rose-100 text-xs font-display font-bold tracking-wider uppercase flex items-center gap-2 shadow-lg"
          >
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" aria-hidden="true" />
            <span>Impacto Detectado</span>
          </div>
        </>
      )}

      {/* Top Perimeter Row */}
      <div className="flex items-start justify-between gap-4">
        {/* Top-Left: Mission Objective & Flight Mode Switch */}
        <div
          className="pointer-events-auto max-w-sm rounded-lg px-4 py-3 border border-slate-700/80"
          style={{ backgroundColor: 'rgba(8, 13, 24, 0.82)' }}
        >
          <div className="flex items-center gap-2 text-xs text-amber-400 font-semibold">
            <span>Missão {mission.code}</span>
            <span aria-hidden="true">·</span>
            <span className="text-slate-200">{mission.title}</span>
          </div>
          <p className="text-xs text-slate-300 mt-1 leading-snug">{mission.goalHint}</p>

          {/* Progress counter */}
          <div className="mt-2.5 flex items-center justify-between gap-3 text-xs font-mono tabular-nums">
            <span className="text-sky-300">
              {mission.hoverTarget ? (
                <span>
                  Estabilizar: {progress.hoverTimerSec.toFixed(1)}s / {progress.hoverRequiredSec.toFixed(0)}s
                </span>
              ) : (
                <span>
                  Portões: {progress.gatesCleared} / {progress.totalGates}
                  {mission.targetLandingPad && progress.gatesCleared >= progress.totalGates
                    ? ' · Pouse no Alvo B'
                    : ''}
                  {progress.nextTargetDistM !== undefined ? ` · ${progress.nextTargetDistM}m` : ''}
                </span>
              )}
            </span>
            <span className="text-slate-400 shrink-0">{Math.round(progress.elapsedSec)}s</span>
          </div>

          {/* Quick Flight Mode Switcher */}
          <div className="mt-2.5 flex items-center gap-1" role="group" aria-label="Alternar modo de voo">
            {(['normal', 'sport'] as FlightMode[]).map((m, idx) => (
              <button
                key={m}
                type="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.currentTarget.blur();
                  onSelectFlightMode(m);
                }}
                className={`px-2 py-1 rounded text-[11px] font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  telemetry.flightMode === m
                    ? 'bg-amber-500 text-slate-950 font-semibold'
                    : 'bg-slate-800/90 text-slate-300 hover:bg-slate-700'
                }`}
              >
                [{idx + 1}] {MODE_LABELS[m].split(' ')[0]}
              </button>
            ))}
          </div>
        </div>

        {/* Top-Right: Compact Utility Controls */}
        <div className="pointer-events-auto flex items-center gap-2">
          {gamepadConnected && (
            <div
              data-testid="hud-gamepad-status"
              title={`${gamepadLabel || 'Controle Xbox / DS4'} — Sticks Modo 2 ativos`}
              aria-label="Controle Xbox ou DS4 conectado"
              className="h-10 px-3 rounded-lg border border-emerald-500/45 text-xs font-medium text-emerald-200 flex items-center gap-2 whitespace-nowrap"
              style={{ backgroundColor: 'rgba(8, 13, 24, 0.85)' }}
            >
              <Gamepad2 className="w-4 h-4 text-emerald-400 shrink-0" aria-hidden="true" />
              <span className="hidden sm:inline">Xbox / DS4</span>
            </div>
          )}

          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onOpenPairing();
            }}
            aria-label="Conectar controle no celular"
            className="h-10 px-3 rounded-lg border border-slate-700/80 text-xs font-medium text-slate-100 flex items-center gap-2 hover:border-sky-400 transition-colors cursor-pointer whitespace-nowrap"
            style={{ backgroundColor: 'rgba(8, 13, 24, 0.82)' }}
          >
            <Smartphone className={`w-4 h-4 ${controllerConnected ? 'text-emerald-400' : 'text-sky-400'}`} aria-hidden="true" />
            <span className="hidden sm:inline">{controllerConnected ? 'Celular Ativo' : 'Celular'}</span>
          </button>

          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onCycleCamera();
            }}
            aria-label="Alternar câmera (C)"
            title="Alternar Câmera [C]"
            className="h-10 px-3 rounded-lg border border-slate-700/80 text-xs font-medium text-slate-100 flex items-center gap-1.5 hover:border-amber-400 transition-colors cursor-pointer whitespace-nowrap"
            style={{ backgroundColor: 'rgba(8, 13, 24, 0.82)' }}
          >
            <Camera className="w-4 h-4 text-amber-400" aria-hidden="true" />
            <span className="hidden md:inline">{CAMERA_LABELS[telemetry.cameraMode]}</span>
          </button>

          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onToggleMute();
            }}
            aria-label={muted ? 'Ativar som (M)' : 'Silenciar som (M)'}
            title="Som [M]"
            className="w-10 h-10 rounded-lg border border-slate-700/80 text-slate-100 flex items-center justify-center hover:border-slate-500 transition-colors cursor-pointer"
            style={{ backgroundColor: 'rgba(8, 13, 24, 0.82)' }}
          >
            {muted ? <VolumeX className="w-4 h-4 text-slate-400" /> : <Volume2 className="w-4 h-4 text-slate-100" />}
          </button>

          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onReset();
            }}
            aria-label="Reiniciar voo (R)"
            title="Reiniciar [R]"
            className="w-10 h-10 rounded-lg border border-slate-700/80 text-slate-100 flex items-center justify-center hover:border-slate-500 transition-colors cursor-pointer"
            style={{ backgroundColor: 'rgba(8, 13, 24, 0.82)' }}
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onTogglePause();
            }}
            aria-label="Pausar simulador (P)"
            title="Pausar [P]"
            className="w-10 h-10 rounded-lg border border-slate-700/80 text-slate-100 flex items-center justify-center hover:border-amber-400 transition-colors cursor-pointer"
            style={{ backgroundColor: 'rgba(8, 13, 24, 0.82)' }}
          >
            <Pause className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Center Reticle & Artificial Horizon (Crisp Dual-Stroke, Zero Pointer Events) */}
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none opacity-80">
        <svg viewBox="0 0 140 140" className="w-28 h-28" aria-hidden="true">
          <g transform={`translate(70, 70) rotate(${(-rollRad * 180) / Math.PI}) translate(0, ${pitchOffset})`}>
            <line x1="-38" y1="0" x2="-14" y2="0" stroke="rgba(6,10,18,0.6)" strokeWidth="3" strokeLinecap="round" />
            <line x1="14" y1="0" x2="38" y2="0" stroke="rgba(6,10,18,0.6)" strokeWidth="3" strokeLinecap="round" />
            <line x1="-38" y1="0" x2="-14" y2="0" stroke="rgba(248,250,252,0.8)" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="14" y1="0" x2="38" y2="0" stroke="rgba(248,250,252,0.8)" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="-18" y1="-16" x2="18" y2="-16" stroke="rgba(248,250,252,0.4)" strokeWidth="1.2" strokeDasharray="3 3" />
            <line x1="-18" y1="16" x2="18" y2="16" stroke="rgba(248,250,252,0.4)" strokeWidth="1.2" strokeDasharray="3 3" />
          </g>
          {/* Fixed aircraft center pip */}
          <path d="M 58 70 L 66 70 L 70 74 L 74 70 L 82 70" fill="none" stroke="rgba(6,10,18,0.75)" strokeWidth="3.5" strokeLinecap="round" />
          <path d="M 58 70 L 66 70 L 70 74 L 74 70 L 82 70" fill="none" stroke="#f59e0b" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </div>

      {/* Bottom Telemetry Strip + Live Stick Visualizer */}
      <div className="flex items-end justify-between gap-4">
        {/* Left Stick + Right Stick Visualizers (teaches beginners how inputs translate!) */}
        <div
          className="hidden sm:flex items-center gap-3 rounded-lg px-3 py-2 border border-slate-700/80"
          style={{ backgroundColor: 'rgba(8, 13, 24, 0.82)' }}
        >
          <StickMiniPreview x={sticks.yaw} y={sticks.throttle} label="THR / YAW" />
          <StickMiniPreview x={sticks.roll} y={sticks.pitch} label="PIT / ROL" />
        </div>

        {/* Center-Right Telemetry Bar */}
        <div
          className="ml-auto flex items-center gap-5 md:gap-7 rounded-lg px-4 py-2.5 border border-slate-700/80 tabular-nums"
          style={{ backgroundColor: 'rgba(8, 13, 24, 0.82)' }}
        >
          <div>
            <div className="text-[10px] font-medium text-slate-400">ALTITUDE</div>
            <div className="font-mono text-xl font-bold text-white leading-tight">
              {altMeters}<span className="text-xs font-normal text-slate-400 ml-0.5">m</span>
            </div>
          </div>

          <div>
            <div className="text-[10px] font-medium text-slate-400">VELOCIDADE</div>
            <div className="font-mono text-xl font-bold text-white leading-tight">
              {speedKmh}<span className="text-xs font-normal text-slate-400 ml-0.5">km/h</span>
            </div>
          </div>

          <div>
            <div className="text-[10px] font-medium text-slate-400">BATERIA</div>
            <div
              className={`font-mono text-xl font-bold leading-tight ${
                batPct <= 20 ? 'text-rose-400' : 'text-emerald-400'
              }`}
            >
              {batPct}<span className="text-xs font-normal text-slate-400 ml-0.5">%</span>
            </div>
          </div>

          <div className="hidden md:block">
            <div className="text-[10px] font-medium text-slate-400">PROA</div>
            <div className="font-mono text-xl font-bold text-slate-200 leading-tight">
              {Math.round(telemetry.headingDeg)}°
            </div>
          </div>

          {telemetry.windSpeed > 0.1 && (
            <div className="hidden md:block">
              <div className="text-[10px] font-medium text-slate-400">VENTO</div>
              <div className="font-mono text-xl font-bold text-sky-300 leading-tight">
                {Math.round(telemetry.windSpeed * 3.6)}<span className="text-xs font-normal text-slate-400 ml-0.5">km/h</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
