import { useEffect, useState } from 'react';
import { Gamepad2, Palette, Play, Smartphone, Sparkles, Target, Wind } from 'lucide-react';
import { MISSIONS } from '../sim/missions';
import { GAME_VERSION } from '../sim/changelog';
import { getDroneSkinOption } from '../sim/droneSkins';
import { DroneSkinSelector } from './DroneSkinSelector';
import type { DroneSkinId, FlightMode, MissionId } from '../sim/types';

interface TitleOverlayProps {
  selectedMission: MissionId;
  flightMode: FlightMode;
  droneSkin: DroneSkinId;
  windEnabled: boolean;
  touchSticksEnabled?: boolean;
  controllerConnected: boolean;
  gamepadConnected: boolean;
  gamepadLabel?: string;
  modalOpen?: boolean;
  onSelectMission: (id: MissionId) => void;
  onSelectFlightMode: (mode: FlightMode) => void;
  onSelectDroneSkin: (skin: DroneSkinId) => void;
  onShowcaseChange?: (active: boolean) => void;
  onToggleWind: () => void;
  onStartFlight: () => void;
  onOpenPairing: () => void;
  onOpenChangelog: () => void;
}

const MODE_OPTIONS: Array<{ id: FlightMode; label: string; desc: string }> = [
  { id: 'normal', label: 'Estabilizado (GPS)', desc: 'Auto-nível + trava altitude (Iniciante)' },
  { id: 'sport', label: 'Sport', desc: 'Inclinação 45° + resposta ágil' },
];

export function TitleOverlay({
  selectedMission,
  flightMode,
  droneSkin,
  windEnabled,
  touchSticksEnabled = false,
  controllerConnected,
  gamepadConnected,
  gamepadLabel,
  modalOpen = false,
  onSelectMission,
  onSelectFlightMode,
  onSelectDroneSkin,
  onShowcaseChange,
  onToggleWind,
  onStartFlight,
  onOpenPairing,
  onOpenChangelog,
}: TitleOverlayProps) {
  const [activeTab, setActiveTab] = useState<'missions' | 'texture'>('missions');

  useEffect(() => {
    onShowcaseChange?.(activeTab === 'texture');
    return () => {
      onShowcaseChange?.(false);
    };
  }, [activeTab, onShowcaseChange]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (modalOpen) return;
      if (e.code === 'Enter' || e.code === 'Space') {
        if (document.activeElement?.tagName === 'BUTTON') return;
        e.preventDefault();
        onStartFlight();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modalOpen, onStartFlight]);

  const activeSkinOption = getDroneSkinOption(droneSkin);

  return (
    <div className="fixed inset-0 z-20 flex flex-col justify-between gap-2 p-3 sm:p-5 lg:p-7 pointer-events-none">
      {/* Subtle left scrim for guaranteed WCAG AA contrast over sunlit 3D world */}
      <div
        className="fixed inset-y-0 left-0 w-full md:w-[540px] pointer-events-none"
        style={{
          background:
            'linear-gradient(90deg, rgba(6,10,18,0.88) 0%, rgba(6,10,18,0.68) 68%, rgba(6,10,18,0) 100%)',
        }}
      />

      {/* Subtle bottom scrim so flat control hints stay crisp over bright concrete helipad */}
      <div
        className="fixed inset-x-0 bottom-0 h-24 pointer-events-none"
        style={{
          background:
            'linear-gradient(0deg, rgba(6,10,18,0.84) 0%, rgba(6,10,18,0.45) 55%, rgba(6,10,18,0) 100%)',
        }}
      />

      {/* Main Left-Third Lockup (flex-1 min-h-0 ensures zero overlap with bottom bar on short landscape phones) */}
      <div className="relative z-10 flex-1 min-h-0 flex items-center">
        <div className="w-full max-w-[460px] max-h-full overflow-y-auto pr-1 flex flex-col gap-2 sm:gap-2.5 pointer-events-auto">
        {/* Custom Inline SVG Quadcopter Title Emblem */}
        <div className="flex items-center gap-3">
          <svg
            viewBox="0 0 48 48"
            className="w-9 h-9 sm:w-10 sm:h-10 shrink-0 text-amber-400"
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
            <div className="flex items-baseline gap-2">
              <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-white leading-none">
                AeroTrainer 3D
              </h1>
              <span
                data-testid="game-version-label"
                className="text-xs font-mono font-medium text-slate-400 tracking-wide"
              >
                {GAME_VERSION}
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-300 mt-0.5">
              Simulador de Voo & Treinamento de Drone
            </p>
          </div>
        </div>

        <p className="text-xs leading-snug text-slate-200 max-w-md">
          Pratique decolagem, orientação e curvas antes de voar um drone real — direto na tela do celular, teclado, controle Xbox/PS4 ou pareando outro aparelho.
        </p>

        {/* Primary Menu Tabs: Missões & Voo | Textura do Drone */}
        <div
          className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-slate-900/90 border border-slate-700/80"
          role="tablist"
          aria-label="Seções do menu inicial"
        >
          <button
            type="button"
            role="tab"
            id="title-tab-missions"
            aria-selected={activeTab === 'missions'}
            aria-controls="title-panel-missions"
            onClick={() => setActiveTab('missions')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'missions'
                ? 'bg-amber-500 text-slate-950'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
            }`}
          >
            <Target className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>Missões & Voo</span>
          </button>

          <button
            type="button"
            role="tab"
            id="title-tab-texture"
            aria-selected={activeTab === 'texture'}
            aria-controls="title-panel-texture"
            onClick={() => setActiveTab('texture')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'texture'
                ? 'bg-amber-500 text-slate-950'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
            }`}
          >
            <Palette className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>Textura do Drone</span>
            <span
              className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                activeTab === 'texture'
                  ? 'bg-slate-950/20 text-slate-950'
                  : 'bg-slate-800 text-amber-300'
              }`}
            >
              {droneSkin === 'dji_lito_1'
                ? 'Moderno'
                : droneSkin === 'fpv_freestyle'
                  ? 'FPV'
                  : 'Padrão'}
            </span>
          </button>
        </div>

        {activeTab === 'missions' ? (
          <div
            id="title-panel-missions"
            role="tabpanel"
            aria-labelledby="title-tab-missions"
            className="flex flex-col gap-2.5"
          >
            {/* Mission Selector */}
            <div>
              <span className="block text-xs font-medium text-slate-300 mb-1">
                Escolha a Missão de Treinamento
              </span>
              <div className="flex flex-col gap-1" role="radiogroup" aria-label="Missões de treinamento">
                {MISSIONS.map((m) => {
                  const active = selectedMission === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => onSelectMission(m.id)}
                      className={`w-full text-left px-3 py-1.5 rounded-lg border transition-colors flex items-center justify-between gap-2.5 cursor-pointer ${
                        active
                          ? 'bg-amber-500/20 border-amber-400 text-white'
                          : 'bg-slate-900/80 border-slate-700/80 text-slate-300 hover:border-slate-500 hover:text-white'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="text-xs sm:text-sm font-semibold leading-tight truncate">
                          {m.code}. {m.title}
                        </div>
                        <div className="text-[11px] text-slate-400 leading-tight truncate">{m.subtitle}</div>
                      </div>
                      <span className="text-[11px] font-mono text-amber-300 shrink-0 whitespace-nowrap">
                        {m.recommendedMode === 'normal' ? 'GPS' : 'SPORT'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Flight Mode & Wind Compact Controls */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-slate-300">Modo de Voo</span>
                <button
                  type="button"
                  onClick={onToggleWind}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium border flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    windEnabled
                      ? 'bg-sky-500/20 border-sky-400 text-sky-200'
                      : 'bg-slate-900/80 border-slate-700 text-slate-300 hover:border-slate-500'
                  }`}
                >
                  <Wind className="w-3.5 h-3.5" aria-hidden="true" />
                  {windEnabled ? 'Vento Ligado' : 'Sem Vento'}
                </button>
              </div>
              <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="Modo de voo">
                {MODE_OPTIONS.map((opt) => {
                  const active = flightMode === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      title={opt.desc}
                      onClick={() => onSelectFlightMode(opt.id)}
                      className={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
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
              <p className="text-[11px] text-slate-400 leading-tight">
                {MODE_OPTIONS.find((o) => o.id === flightMode)?.desc}
              </p>
            </div>
          </div>
        ) : (
          <div
            id="title-panel-texture"
            role="tabpanel"
            aria-labelledby="title-tab-texture"
            className="flex flex-col gap-2.5"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-slate-300">
                Escolha o Visual do Drone
              </span>
              <span className="text-[11px] font-mono text-amber-300">
                Atual: {activeSkinOption.name}
              </span>
            </div>

            <DroneSkinSelector
              selectedSkin={droneSkin}
              onSelectSkin={onSelectDroneSkin}
              compact
            />

            <p className="text-xs text-slate-400 leading-snug">
              A prévia 3D ao lado atualiza na hora para você conferir os detalhes antes de decolar.
            </p>
          </div>
        )}

        {/* Primary & Mobile Controller Actions (<= 2 main buttons) */}
        <div className="flex flex-wrap items-center gap-2.5 pt-0.5">
          <button
            type="button"
            data-start="true"
            onClick={(e) => {
              e.currentTarget.blur();
              onStartFlight();
            }}
            className="px-5 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-bold text-sm tracking-wide flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
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
            className="px-3.5 py-2.5 rounded-lg bg-slate-900/90 hover:bg-slate-800 border border-slate-600 text-slate-100 text-sm font-medium flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Smartphone className="w-4 h-4 text-sky-400" aria-hidden="true" />
            {controllerConnected ? 'Celular Conectado' : 'Conectar Celular'}
          </button>
        </div>

        {/* Physical Xbox / DS4 Gamepad status indicator (sticks only, cable or Bluetooth) */}
        <div
          data-testid="title-gamepad-status"
          className={`flex items-center gap-2 text-[11px] px-3 py-1.5 rounded-lg border ${
            gamepadConnected
              ? 'bg-emerald-950/85 border-emerald-500/50 text-emerald-100'
              : 'bg-slate-950/80 border-slate-800 text-slate-300'
          }`}
        >
          <Gamepad2
            className={`w-3.5 h-3.5 shrink-0 ${gamepadConnected ? 'text-emerald-400' : 'text-slate-400'}`}
            aria-hidden="true"
          />
          <span className="truncate">
            {gamepadConnected
              ? `Controle Conectado (${gamepadLabel || 'Xbox / DS4'}) · Apenas Sticks`
              : 'Controle Xbox / PS4 (DS4) USB ou Bluetooth: mova um stick para ativar'}
          </span>
        </div>
        </div>
      </div>

      {/* Bottom Bar: Flat control hints on left + "Novidades!" changelog button on bottom-right */}
      <div className="relative z-10 shrink-0 flex flex-wrap items-end justify-between gap-2 sm:gap-3">
        <div
          className="text-[11px] sm:text-xs text-slate-200 flex flex-wrap items-center gap-x-2 sm:gap-x-2.5 gap-y-1"
          style={{ textShadow: '0 1px 3px rgba(0, 0, 0, 0.95)' }}
        >
          {touchSticksEnabled ? (
            <>
              <span>Toque na tela para voar</span>
              <span aria-hidden="true">·</span>
              <span>2 sticks p/ baixo e dentro: Ligar</span>
              <span aria-hidden="true">·</span>
              <span>Olho: Ocultar HUD (controles ativos)</span>
            </>
          ) : (
            <>
              <span>V Ligar Drone</span>
              <span aria-hidden="true">·</span>
              <span>Espaço / Shift Subir e Descer</span>
              <span aria-hidden="true">·</span>
              <span>Q / E Girar</span>
              <span aria-hidden="true">·</span>
              <span>W A S D / Setas Mover</span>
              <span aria-hidden="true">·</span>
              <span>Sticks Xbox/DS4</span>
              <span aria-hidden="true">·</span>
              <span>C Câmera</span>
              <span aria-hidden="true">·</span>
              <span>H Ocultar HUD</span>
              <span aria-hidden="true">·</span>
              <span>P Pausar</span>
            </>
          )}
        </div>

        <button
          type="button"
          data-testid="changelog-open-btn"
          onClick={(e) => {
            e.currentTarget.blur();
            onOpenChangelog();
          }}
          className="pointer-events-auto ml-auto shrink-0 px-3.5 py-2 rounded-lg bg-slate-900/90 hover:bg-slate-800 border border-slate-600 hover:border-amber-400 text-slate-100 text-xs font-semibold flex items-center gap-2 transition-colors shadow-lg cursor-pointer whitespace-nowrap"
        >
          <Sparkles className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
          <span>Novidades!</span>
        </button>
      </div>
    </div>
  );
}
