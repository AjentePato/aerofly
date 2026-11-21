import { useEffect, useRef, useState } from 'react';
import { Camera, Compass, RotateCcw, Wifi, WifiOff, ArrowLeft } from 'lucide-react';
import {
  computeFloatingStickOrigin,
  computeFloatingStickValue,
  type FloatingOrigin,
  type StickVec,
} from '../sim/floatingStick';
import type { DroneTelemetry } from '../sim/types';

interface MobileControllerProps {
  initialRoom: string;
  onExitToSimulator?: () => void;
}

const STICK_RADIUS_PX = 68;

function FloatingTouchZone({
  label,
  subLabel,
  value,
  stickyY,
  side,
  onChange,
}: {
  label: string;
  subLabel: string;
  value: StickVec;
  stickyY?: boolean;
  side: 'left' | 'right';
  onChange: (pos: StickVec) => void;
}) {
  const zoneRef = useRef<HTMLDivElement | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  const originRef = useRef<FloatingOrigin | null>(null);
  const [activeOrigin, setActiveOrigin] = useState<FloatingOrigin | null>(null);

  const toLocalCoords = (clientX: number, clientY: number) => {
    const el = zoneRef.current;
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (pointerIdRef.current !== null) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointerIdRef.current = e.pointerId;

    const local = toLocalCoords(e.clientX, e.clientY);
    const origin = computeFloatingStickOrigin(
      local.x,
      local.y,
      value,
      STICK_RADIUS_PX,
      Boolean(stickyY)
    );
    originRef.current = origin;
    setActiveOrigin(origin);

    const nextVal = computeFloatingStickValue(local.x, local.y, origin, STICK_RADIUS_PX);
    onChange(nextVal);

    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(8);
      } catch {
        // Ignore unsupported vibrate
      }
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (pointerIdRef.current !== e.pointerId || !originRef.current) return;
    const local = toLocalCoords(e.clientX, e.clientY);
    const nextVal = computeFloatingStickValue(
      local.x,
      local.y,
      originRef.current,
      STICK_RADIUS_PX
    );
    onChange(nextVal);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (pointerIdRef.current !== e.pointerId) return;
    pointerIdRef.current = null;
    originRef.current = null;
    setActiveOrigin(null);
    onChange({
      x: 0,
      y: stickyY ? value.y : 0,
    });
  };

  const knobOffsetX = value.x * STICK_RADIUS_PX;
  const knobOffsetY = -value.y * STICK_RADIUS_PX;

  return (
    <div
      ref={zoneRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      role="application"
      aria-label={label}
      data-testid={side === 'left' ? 'left-stick-zone' : 'right-stick-zone'}
      style={{ touchAction: 'none' }}
      className={`relative w-full h-full flex flex-col items-center justify-end pb-4 select-none cursor-crosshair overflow-hidden ${
        side === 'left' ? 'border-r border-slate-800/80' : ''
      }`}
    >
      {/* Quiet center hint when stick is inactive */}
      {!activeOrigin && (
        <div className="pointer-events-none my-auto flex flex-col items-center gap-1.5 px-3 text-center">
          <div className="w-10 h-10 rounded-full border border-dashed border-slate-700/90 flex items-center justify-center">
            <div className="w-2 h-2 rounded-full bg-slate-600" />
          </div>
          <span className="text-xs font-medium text-slate-400">
            Toque em qualquer ponto
          </span>
        </div>
      )}

      {/* Floating Dynamic Virtual Stick — appears centered exactly where user touched */}
      {activeOrigin && (
        <div
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-amber-400/60 bg-slate-900/75"
          style={{
            left: `${activeOrigin.x}px`,
            top: `${activeOrigin.y}px`,
            width: `${STICK_RADIUS_PX * 2}px`,
            height: `${STICK_RADIUS_PX * 2}px`,
          }}
        >
          {/* Center crosshairs */}
          <div className="absolute inset-x-3 top-1/2 h-px bg-slate-600/60" />
          <div className="absolute inset-y-3 left-1/2 w-px bg-slate-600/60" />
          <div className="absolute inset-5 rounded-full border border-slate-700/60" />

          {/* Moving thumb knob */}
          <div
            className="absolute left-1/2 top-1/2 w-12 h-12 rounded-full bg-amber-500 border-4 border-slate-950 shadow-lg flex items-center justify-center"
            style={{
              transform: `translate(calc(-50% + ${knobOffsetX}px), calc(-50% + ${knobOffsetY}px))`,
            }}
          >
            <div className="w-3.5 h-3.5 rounded-full bg-amber-200/80" />
          </div>
        </div>
      )}

      {/* Bottom Axis Label & Live Value */}
      <div className="pointer-events-none text-center px-2">
        <div className="text-xs font-display font-bold text-slate-200">{label}</div>
        <div className="text-[11px] font-mono text-slate-400 tabular-nums">
          {subLabel} · {Math.round(value.x * 100)}% / {Math.round(value.y * 100)}%
        </div>
      </div>
    </div>
  );
}

export function MobileController({ initialRoom, onExitToSimulator }: MobileControllerProps) {
  const [roomInput, setRoomInput] = useState(initialRoom.toUpperCase());
  const [activeRoom, setActiveRoom] = useState(initialRoom.toUpperCase());
  const [wsConnected, setWsConnected] = useState(false);
  const [simOnline, setSimOnline] = useState(false);
  const [leftStick, setLeftStick] = useState<StickVec>({ x: 0, y: 0 });
  const [rightStick, setRightStick] = useState<StickVec>({ x: 0, y: 0 });
  const [stickyThrottle, setStickyThrottle] = useState(false);
  const [gyroEnabled, setGyroEnabled] = useState(false);
  const [telemetry, setTelemetry] = useState<DroneTelemetry | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const sticksRef = useRef({ left: leftStick, right: rightStick });
  sticksRef.current = { left: leftStick, right: rightStick };

  useEffect(() => {
    if (!activeRoom) return;

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${window.location.host}/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      setWsConnected(true);
      ws.send(JSON.stringify({ type: 'register', role: 'controller', room: activeRoom }));
    };

    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data as string) as {
          type: string;
          simConnected?: boolean;
          telemetry?: DroneTelemetry;
        };
        if (msg.type === 'room:status') {
          setSimOnline(Boolean(msg.simConnected));
        } else if (msg.type === 'telemetry' && msg.telemetry) {
          setTelemetry(msg.telemetry);
        }
      } catch {
        // Ignore malformed packets
      }
    };

    ws.onclose = () => {
      setWsConnected(false);
      setSimOnline(false);
    };

    const timer = window.setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        const { left, right } = sticksRef.current;
        ws.send(
          JSON.stringify({
            type: 'stick',
            throttle: left.y,
            yaw: left.x,
            pitch: right.y,
            roll: right.x,
          })
        );
      }
    }, 20);

    return () => {
      clearInterval(timer);
      ws.close();
      wsRef.current = null;
    };
  }, [activeRoom]);

  useEffect(() => {
    if (!gyroEnabled) return;
    const onOrient = (e: DeviceOrientationEvent) => {
      if (e.beta === null || e.gamma === null) return;
      const roll = Math.max(-1, Math.min(1, e.gamma / 30));
      const pitch = Math.max(-1, Math.min(1, (35 - e.beta) / 30));
      setRightStick({ x: roll, y: pitch });
    };
    window.addEventListener('deviceorientation', onOrient);
    return () => window.removeEventListener('deviceorientation', onOrient);
  }, [gyroEnabled]);

  const sendAction = (action: string) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'action', action }));
    }
  };

  if (!activeRoom) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (roomInput.trim()) setActiveRoom(roomInput.trim().toUpperCase());
          }}
          className="w-full max-w-sm rounded-xl bg-slate-900 border border-slate-800 p-6 flex flex-col gap-4"
        >
          <h1 className="font-display text-2xl font-bold text-white">Conectar ao PC</h1>
          <p className="text-xs text-slate-400">
            Digite o código de 4 letras exibido na janela &ldquo;Conectar Celular&rdquo; do simulador no computador.
          </p>
          <div>
            <label htmlFor="room-code-input" className="block text-xs font-medium text-slate-300 mb-1.5">
              Código da Sala
            </label>
            <input
              id="room-code-input"
              type="text"
              maxLength={8}
              value={roomInput}
              onChange={(e) => setRoomInput(e.target.value.toUpperCase())}
              placeholder="Ex: A7K2"
              className="w-full px-4 py-3 rounded-lg bg-slate-950 border border-slate-700 font-mono text-xl tracking-widest text-center text-amber-400 uppercase"
            />
          </div>
          <button
            type="submit"
            className="w-full py-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-bold text-sm cursor-pointer"
          >
            Parear Rádio Controle
          </button>
          {onExitToSimulator && (
            <button
              type="button"
              onClick={onExitToSimulator}
              className="w-full py-2.5 rounded-lg bg-slate-800 text-slate-300 text-xs font-medium cursor-pointer"
            >
              Voltar ao Simulador 3D
            </button>
          )}
        </form>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 bg-slate-950 text-slate-100 flex flex-col justify-between p-2.5 sm:p-4 select-none overflow-hidden"
      style={{ touchAction: 'none' }}
    >
      {/* Top Transmitter Status Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-900 border border-slate-800 px-3 py-2 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          {onExitToSimulator && (
            <button
              type="button"
              onClick={onExitToSimulator}
              aria-label="Voltar ao simulador"
              className="min-w-[40px] min-h-[40px] rounded-lg bg-slate-800 flex items-center justify-center text-slate-200 cursor-pointer shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2 whitespace-nowrap">
              <span className="font-display font-bold text-sm text-white">TX · {activeRoom}</span>
              <span className="text-xs font-mono flex items-center gap-1">
                {wsConnected && simOnline ? (
                  <span className="text-emerald-400 flex items-center gap-1">
                    <Wifi className="w-3.5 h-3.5" /> PC Conectado
                  </span>
                ) : (
                  <span className="text-amber-400 flex items-center gap-1">
                    <WifiOff className="w-3.5 h-3.5" /> Aguardando PC
                  </span>
                )}
              </span>
            </div>
            {telemetry && (
              <div className="text-[11px] font-mono text-slate-400 tabular-nums mt-0.5 whitespace-nowrap truncate">
                ALT {Math.round(telemetry.agl)}m · VEL {Math.round(telemetry.speed * 3.6)}km/h · BAT {Math.round(telemetry.batteryPct)}%
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0 ml-auto">
          <button
            type="button"
            onClick={() => sendAction('cycle_mode')}
            className="min-h-[40px] px-3 rounded-lg bg-slate-800 border border-slate-700 text-xs font-semibold text-amber-300 cursor-pointer whitespace-nowrap"
          >
            {telemetry ? telemetry.flightMode.toUpperCase() : 'MODO'}
          </button>

          <button
            type="button"
            onClick={() => sendAction('cycle_camera')}
            aria-label="Alternar câmera no PC"
            className="min-w-[40px] min-h-[40px] rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-sky-300 cursor-pointer"
          >
            <Camera className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => sendAction('reset')}
            aria-label="Reiniciar drone no PC"
            className="min-w-[40px] min-h-[40px] rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-200 cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Split 50/50 Left & Right Floating Touch Arena */}
      <div className="flex-1 min-h-0 grid grid-cols-2 my-2 rounded-xl border border-slate-800/80 bg-slate-900/35 overflow-hidden">
        <FloatingTouchZone
          side="left"
          label="Stick Esquerdo"
          subLabel="Acelerador / Yaw"
          value={leftStick}
          stickyY={stickyThrottle}
          onChange={setLeftStick}
        />

        <FloatingTouchZone
          side="right"
          label="Stick Direito"
          subLabel="Pitch / Roll"
          value={rightStick}
          onChange={setRightStick}
        />
      </div>

      {/* Bottom Ergonomic Option Strip */}
      <div className="flex flex-wrap items-center justify-center gap-2 shrink-0">
        <button
          type="button"
          onClick={() => setStickyThrottle((v) => !v)}
          className={`min-h-[40px] px-3.5 rounded-lg border text-xs font-medium cursor-pointer whitespace-nowrap ${
            stickyThrottle
              ? 'bg-amber-500/20 border-amber-400 text-amber-200'
              : 'bg-slate-900 border-slate-700 text-slate-300'
          }`}
        >
          {stickyThrottle ? 'Acelerador Fixo (Acro)' : 'Acelerador Auto-Centro (GPS)'}
        </button>

        <button
          type="button"
          onClick={() => setGyroEnabled((v) => !v)}
          className={`min-h-[40px] px-3.5 rounded-lg border text-xs font-medium flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
            gyroEnabled
              ? 'bg-sky-500/20 border-sky-400 text-sky-200'
              : 'bg-slate-900 border-slate-700 text-slate-300'
          }`}
        >
          <Compass className="w-4 h-4" />
          {gyroEnabled ? 'Giroscópio Ligado' : 'Giroscópio'}
        </button>
      </div>
    </div>
  );
}
