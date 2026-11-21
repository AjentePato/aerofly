import { useEffect } from 'react';
import { Smartphone, Play, Wind } from 'lucide-react';
import { MISSIONS } from '../sim/missions';
import type { FlightMode, MissionId } from '../sim/types';

interface TitleOverlayProps {
  selectedMission: MissionId;
  flightMode: FlightMode;
  windEnabled: boolean;
  controllerConnected: boolean;
  onSelectMission: (id: MissionId) => void;
  onSelectFlightMode: (mode: FlightMode) => void;
  onToggleWind: () => void;
  onStartFlight: () => void;
  onOpenPairing: () => void;
}

const MODE_OPTIONS: Array<{ id: FlightMode; label: string; desc: string }> = [
  { id: 'normal', label: 'Estabilizado (GPS)', desc: 'Auto-nível + trava altitude (Iniciante)' },
  { id: 'sport', label: 'Sport', desc: 'Inclinação 45° + resposta ágil' },
  { id: 'acro', label: 'Acro FPV', desc: 'Manual sem auto-nível (Avançado)' },
];

export function TitleOverlay({
  selectedMission,
  flightMode,
  windEnabled,
  controllerConnected,
  onSelectMission,
  onSelectFlightMode,
  onToggleWind,
  onStartFlight,
  onOpenPairing,
}: TitleOverlayProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Enter' || e.code === 'Space') {
        if (document.activeElement?.tagName === 'BUTTON') return;
        e.preventDefault();
        onStartFlight();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onStartFlight]);

  return (
    <div className="fixed inset-0 z-20 flex flex-col justify-between p-6 md:p-10 pointer-events-none">
      {/* Subtle left scrim for guaranteed WCAG AA contrast over sunlit 3D world */}
      <div
        className="fixed inset-y-0 left-0 w-full md:w-[560px] pointer-events-none"
        style={{
          background:
            'linear-gradient(90deg, rgba(6,10,18,0.88) 0%, rgba(6,10,18,0.68) 68%, rgba(6,10,18,0) 100%)',
        }}
      />

      {/* Main Left-Third Lockup */}
      <div className="relative z-10 max-w-[460px] max-h-[calc(100vh-72px)] overflow-y-auto pr-1 flex flex-col gap-4 my-auto pointer-events-auto">
        {/* Custom Inline SVG Quadcopter Title Emblem */}
        <div className="flex items-center gap-3.5">
          <svg
            viewBox="0 0 48 48"
            className="w-11 h-11 shrink-0 text-amber-400"
            fill="none"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="7.5" stroke="currentColor" strokeWidth="2.2" strokeDasharray="4 2.5" />
            <circle cx="36" cy="12" r="7.5" stroke="currentColor" strokeWidth="2.2" strokeDasharray="4 2.5" />
            <circle cx="12" cy="36" r="7.5" stroke="currentColor" strokeWidth="2.2" strokeDasharray="4 2.5" />
            <circle cx="36" cy="36" r="7.5" stroke="currentColor" strokeWidth="2.2" strokeDasharray="4 2.5" />
            <path d="M12 12 L36 36 M36 12 L12 36" stroke="#e2e8f0" strokeWidth="2.6" strokeLinecap="round" />
            <rect x="19" y="17" width="10" height="14" rx="3" fill="#0f172a" stroke="#f8fafc" strokeWidth="2" />
            <circle cx="24" cy="20" r="1.8" fill="#38bdf8" />
          </svg>
          <div>
            <h1 className="font-display text-3xl md:text-4xl font-bold tracking-tight text-white leading-none">
              AeroTrainer 3D
            </h1>
            <p className="text-sm text-slate-300 mt-1">
              Simulador de Voo & Treinamento de Drone
            </p>
          </div>
        </div>

        <p className="text-sm leading-relaxed text-slate-200 max-w-md">
          Pratique decolagem, orientação espacial e curvas coordenadas antes de pilotar um drone real. Use o teclado no PC ou pareie seu celular como rádio controle.
        </p>

        {/* Mission Selector */}
        <div>
          <span className="block text-xs font-medium text-slate-300 mb-2">
            Escolha a Missão de Treinamento
          </span>
          <div className="flex flex-col gap-1.5" role="radiogroup" aria-label="Missões de treinamento">
            {MISSIONS.map((m) => {
              const active = selectedMission === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onSelectMission(m.id)}
                  className={`w-full text-left px-3.5 py-2.5 rounded-lg border transition-colors flex items-center justify-between gap-3 ${
                    active
                      ? 'bg-amber-500/20 border-amber-400 text-white'
                      : 'bg-slate-900/80 border-slate-700/80 text-slate-300 hover:border-slate-500 hover:text-white'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="text-sm font-semibold truncate">
                      {m.code}. {m.title}
                    </div>
                    <div className="text-xs text-slate-400 truncate">{m.subtitle}</div>
                  </div>
                  <span className="text-xs font-mono text-amber-300 shrink-0 whitespace-nowrap">
                    {m.recommendedMode === 'normal' ? 'GPS' : 'SPORT'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Flight Mode & Wind Compact Controls */}
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-slate-300">Modo de Voo</span>
            <button
              type="button"
              onClick={onToggleWind}
              className={`px-2.5 py-1 rounded-md text-xs font-medium border flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                windEnabled
                  ? 'bg-sky-500/20 border-sky-400 text-sky-200'
                  : 'bg-slate-900/80 border-slate-700 text-slate-300 hover:border-slate-500'
              }`}
            >
              <Wind className="w-3.5 h-3.5" aria-hidden="true" />
              {windEnabled ? 'Vento Ligado' : 'Sem Vento'}
            </button>
          </div>
          <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="Modo de voo">
            {MODE_OPTIONS.map((opt) => {
              const active = flightMode === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  title={opt.desc}
                  onClick={() => onSelectFlightMode(opt.id)}
                  className={`px-2.5 py-2 rounded-lg border text-xs font-semibold transition-colors whitespace-nowrap ${
                    active
                      ? 'bg-slate-100 text-slate-950 border-white'
                      : 'bg-slate-900/85 text-slate-300 border-slate-700 hover:border-slate-500'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-slate-400">
            {MODE_OPTIONS.find((o) => o.id === flightMode)?.desc}
          </p>
        </div>

        {/* Primary & Mobile Controller Actions (<= 2 main buttons) */}
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button
            type="button"
            data-start="true"
            onClick={(e) => {
              e.currentTarget.blur();
              onStartFlight();
            }}
            className="px-6 py-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-bold text-sm tracking-wide flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Play className="w-4 h-4 fill-current" aria-hidden="true" />
            Iniciar Voo
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.currentTarget.blur();
              onOpenPairing();
            }}
            className="px-4 py-3 rounded-lg bg-slate-900/90 hover:bg-slate-800 border border-slate-600 text-slate-100 text-sm font-medium flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Smartphone className="w-4 h-4 text-sky-400" aria-hidden="true" />
            {controllerConnected ? 'Celular Conectado' : 'Conectar Celular'}
          </button>
        </div>
      </div>

      {/* Flat borderless bottom control hint line */}
      <div className="relative z-10 text-xs text-slate-300/90 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span>Espaço / Shift Subir e Descer</span>
        <span aria-hidden="true">·</span>
        <span>Q / E Girar (Yaw)</span>
        <span aria-hidden="true">·</span>
        <span>W A S D ou Setas Mover</span>
        <span aria-hidden="true">·</span>
        <span>C Câmera</span>
        <span aria-hidden="true">·</span>
        <span>P Pausar</span>
      </div>
    </div>
  );
}
