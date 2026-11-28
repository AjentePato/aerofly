import { useEffect } from 'react';
import {
  Gamepad2,
  Gauge,
  Monitor,
  Palette,
  Play,
  Settings,
  Smartphone,
  Sparkles,
  Target,
  Touchpad,
  Vibrate,
  Volume2,
  VolumeX,
  Wind,
} from 'lucide-react';
import { MISSIONS } from '../sim/missions';
import { GAME_VERSION } from '../sim/changelog';
import { getDroneSkinOption } from '../sim/droneSkins';
import { GRAPHICS_MODE_OPTIONS, getGraphicsModeOption } from '../sim/graphicsMode';
import { DroneSkinSelector } from './DroneSkinSelector';
import type { GamepadActionFeedback } from '../hooks/useGamepadUI';
import type { DroneSkinId, FlightMode, GraphicsMode, MissionId, SpeedUnit } from '../sim/types';

export type TitleTabId = 'missions' | 'texture' | 'settings';

interface TitleOverlayProps {
  selectedMission: MissionId;
  flightMode: FlightMode;
  droneSkin: DroneSkinId;
  speedUnit: SpeedUnit;
  graphicsMode: GraphicsMode;
  windEnabled: boolean;
  muted: boolean;
  rumbleEnabled?: boolean;
  touchSticksEnabled?: boolean;
  controllerConnected: boolean;
  gamepadConnected: boolean;
  gamepadLabel?: string;
  gamepadFeedback?: GamepadActionFeedback | null;
  activeTab: TitleTabId;
  modalOpen?: boolean;
  onChangeTab: (tab: TitleTabId) => void;
  onSelectMission: (id: MissionId) => void;
  onSelectFlightMode: (mode: FlightMode) => void;
  onSelectDroneSkin: (skin: DroneSkinId) => void;
  onSelectSpeedUnit: (unit: SpeedUnit) => void;
  onSelectGraphicsMode: (mode: GraphicsMode) => void;
  onShowcaseChange?: (active: boolean) => void;
  onToggleWind: () => void;
  onToggleMute: () => void;
  onToggleRumble?: () => void;
  onTestRumble?: () => void;
  onToggleTouchSticks: () => void;
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
  speedUnit,
  graphicsMode,
  windEnabled,
  muted,
  rumbleEnabled = true,
  touchSticksEnabled = false,
  controllerConnected,
  gamepadConnected,
  gamepadLabel,
  gamepadFeedback,
  activeTab,
  modalOpen = false,
  onChangeTab,
  onSelectMission,
  onSelectFlightMode,
  onSelectDroneSkin,
  onSelectSpeedUnit,
  onSelectGraphicsMode,
  onShowcaseChange,
  onToggleWind,
  onToggleMute,
  onToggleRumble,
  onTestRumble,
  onToggleTouchSticks,
  onStartFlight,
  onOpenPairing,
  onOpenChangelog,
}: TitleOverlayProps) {
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
    <div
      data-gamepad-root="title"
      className="fixed inset-0 z-20 flex flex-col justify-between gap-2 p-3 sm:p-5 lg:p-7 pointer-events-none"
    >
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
        <div
          data-gamepad-scroll="true"
          className="w-full max-w-[460px] max-h-full overflow-y-auto pr-1 flex flex-col gap-2 sm:gap-2.5 pointer-events-auto"
        >
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

        {/* Primary Menu Tabs: Missões | Textura | Configurações */}
        <div
          className="grid grid-cols-3 gap-1 p-1 rounded-lg bg-slate-900/90 border border-slate-700/80"
          role="tablist"
          aria-label="Seções do menu inicial"
        >
          <button
            type="button"
            role="tab"
            id="title-tab-missions"
            aria-selected={activeTab === 'missions'}
            aria-controls="title-panel-missions"
            onClick={() => onChangeTab('missions')}
            className={`px-2 py-1.5 rounded-md text-[11px] sm:text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'missions'
                ? 'bg-amber-500 text-slate-950'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
            }`}
          >
            <Target className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>Missões</span>
          </button>

          <button
            type="button"
            role="tab"
            id="title-tab-texture"
            aria-selected={activeTab === 'texture'}
            aria-controls="title-panel-texture"
            onClick={() => onChangeTab('texture')}
            className={`px-2 py-1.5 rounded-md text-[11px] sm:text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'texture'
                ? 'bg-amber-500 text-slate-950'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
            }`}
          >
            <Palette className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>Textura</span>
          </button>

          <button
            type="button"
            role="tab"
            id="title-tab-settings"
            aria-selected={activeTab === 'settings'}
            aria-controls="title-panel-settings"
            onClick={() => onChangeTab('settings')}
            className={`px-2 py-1.5 rounded-md text-[11px] sm:text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'settings'
                ? 'bg-amber-500 text-slate-950'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
            }`}
          >
            <Settings className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>Configurações</span>
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
        ) : activeTab === 'texture' ? (
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
        ) : (
          <div
            id="title-panel-settings"
            role="tabpanel"
            aria-labelledby="title-tab-settings"
            className="flex flex-col gap-2.5"
          >
            <div className="rounded-lg border border-slate-700/80 bg-slate-900/85 p-3 flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                  <Monitor className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
                  Gráficos do Jogo
                </span>
                <span className="text-[11px] font-mono text-slate-400">
                  {graphicsMode === 'low_poly' ? 'Clássico Leve' : 'Alta Qualidade'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="Qualidade gráfica">
                {GRAPHICS_MODE_OPTIONS.map((opt) => {
                  const active = graphicsMode === opt.id;
                  const testId = opt.id === 'low_poly' ? 'title-graphics-low-poly' : 'title-graphics-realistic';
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

            <div className="rounded-lg border border-slate-700/80 bg-slate-900/85 p-3 flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                  <Gauge className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
                  Unidade de Velocidade
                </span>
                <span className="text-[11px] font-mono text-slate-400">
                  {speedUnit === 'kmh' ? 'Quilômetros/hora' : 'Metros/segundo'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="Unidade de velocidade">
                <button
                  type="button"
                  data-testid="title-speed-unit-kmh"
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
                  data-testid="title-speed-unit-ms"
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
              data-testid="title-toggle-touch-sticks"
              onClick={onToggleTouchSticks}
              className={`w-full px-3.5 py-2.5 rounded-lg border text-xs font-medium flex items-center justify-between cursor-pointer ${
                touchSticksEnabled
                  ? 'bg-amber-500/15 border-amber-400 text-amber-200'
                  : 'bg-slate-900/85 border-slate-700 text-slate-300 hover:border-slate-500'
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
              onClick={onToggleWind}
              className={`w-full px-3.5 py-2.5 rounded-lg border text-xs font-medium flex items-center justify-between cursor-pointer ${
                windEnabled
                  ? 'bg-sky-500/15 border-sky-400 text-sky-200'
                  : 'bg-slate-900/85 border-slate-700 text-slate-300 hover:border-slate-500'
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
              className={`w-full px-3.5 py-2.5 rounded-lg border text-xs font-medium flex items-center justify-between cursor-pointer ${
                !muted
                  ? 'bg-slate-900/85 border-slate-700 text-slate-200 hover:border-slate-500'
                  : 'bg-slate-900/85 border-slate-700 text-slate-400 hover:border-slate-500'
              }`}
            >
              <span className="flex items-center gap-2">
                {muted ? <VolumeX className="w-4 h-4" aria-hidden="true" /> : <Volume2 className="w-4 h-4 text-emerald-400" aria-hidden="true" />}
                Som do Simulador
              </span>
              <span className="font-mono">{muted ? 'MUDO' : 'ATIVADO'}</span>
            </button>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                data-testid="title-toggle-rumble"
                onClick={onToggleRumble}
                className={`flex-1 px-3.5 py-2.5 rounded-lg border text-xs font-medium flex items-center justify-between cursor-pointer ${
                  rumbleEnabled
                    ? 'bg-emerald-500/15 border-emerald-500/60 text-emerald-200'
                    : 'bg-slate-900/85 border-slate-700 text-slate-400 hover:border-slate-500'
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
                data-testid="title-test-rumble"
                onClick={onTestRumble}
                disabled={!rumbleEnabled}
                title="Enviar pulso de vibração para o controle conectado"
                className="px-3 py-2.5 rounded-lg border border-slate-700 bg-slate-900/85 hover:border-amber-400 disabled:opacity-45 disabled:cursor-not-allowed text-xs font-semibold text-amber-300 cursor-pointer whitespace-nowrap"
              >
                Testar
              </button>
            </div>
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

        {/* Physical Xbox / DS4 Gamepad status indicator (full menu + flight + haptics) */}
        <div
          data-testid="title-gamepad-status"
          className={`flex items-center justify-between gap-2 text-[11px] px-3 py-1.5 rounded-lg border transition-colors ${
            gamepadConnected
              ? 'bg-emerald-950/85 border-emerald-500/50 text-emerald-100'
              : 'bg-slate-950/80 border-slate-800 text-slate-300'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <Gamepad2
              className={`w-3.5 h-3.5 shrink-0 ${gamepadConnected ? 'text-emerald-400' : 'text-slate-400'}`}
              aria-hidden="true"
            />
            <span className="truncate">
              {gamepadConnected
                ? `${gamepadLabel || 'Controle Xbox / DS4'} · D-Pad/A/B Menus · Sticks Voo`
                : 'Controle Xbox / PS4 (DS4): conecte e aperte um botão ou mova um stick'}
            </span>
          </div>
          {gamepadFeedback && (
            <span
              data-testid="gamepad-feedback-pill"
              className="shrink-0 px-2 py-0.5 rounded bg-amber-500/20 border border-amber-400/50 text-[10px] font-mono text-amber-200"
            >
              {gamepadFeedback.label}
            </span>
          )}
        </div>
        </div>
      </div>

      {/* Bottom Bar: Flat control hints on left + "Novidades!" changelog button on bottom-right */}
      <div className="relative z-10 shrink-0 flex flex-wrap items-end justify-between gap-2 sm:gap-3">
        <div
          className="text-[11px] sm:text-xs text-slate-200 flex flex-wrap items-center gap-x-2 sm:gap-x-2.5 gap-y-1"
          style={{ textShadow: '0 1px 3px rgba(0, 0, 0, 0.95)' }}
        >
          {gamepadConnected ? (
            <>
              <span>D-Pad/Stick Navegar</span>
              <span aria-hidden="true">·</span>
              <span>A / ✕ Selecionar</span>
              <span aria-hidden="true">·</span>
              <span>LB / RB Abas</span>
              <span aria-hidden="true">·</span>
              <span>Y / △ Iniciar Voo</span>
              <span aria-hidden="true">·</span>
              <span>X / □ Vento</span>
              <span aria-hidden="true">·</span>
              <span>B / ○ Voltar</span>
            </>
          ) : touchSticksEnabled ? (
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
              <span>Xbox/PS4 Completo</span>
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
