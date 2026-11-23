import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, RotateCcw, Wifi, WifiOff, ArrowLeft, Zap } from 'lucide-react';
import {
  computeFloatingStickOrigin,
  computeFloatingStickValue,
  type FloatingOrigin,
  type StickVec,
} from '../sim/floatingStick';
import {
  STICK_PACKET_BYTES,
  encodeBinaryStickInto,
  pickRelayTransport,
  sticksChangedSignificantly,
} from '../sim/stickProtocol';
import { RTC_CONFIG } from '../sim/webrtcConfig';
import type { DroneTelemetry, StickInput } from '../sim/types';

interface MobileControllerProps {
  initialRoom: string;
  onExitToSimulator?: () => void;
}

const STICK_RADIUS_PX = 68;
const MIN_SEND_INTERVAL_MS = 12; // ~83Hz max rate; 0 packets when idle

function FloatingTouchZone({
  label,
  subLabel,
  side,
  onStickSample,
}: {
  label: string;
  subLabel: string;
  side: 'left' | 'right';
  onStickSample: (pos: StickVec, immediate: boolean) => void;
}) {
  const zoneRef = useRef<HTMLDivElement | null>(null);
  const knobRef = useRef<HTMLDivElement | null>(null);
  const readoutRef = useRef<HTMLDivElement | null>(null);
  const rectRef = useRef<DOMRect | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  const originRef = useRef<FloatingOrigin | null>(null);
  const valueRef = useRef<StickVec>({ x: 0, y: 0 });
  const lastReadoutMsRef = useRef(0);
  const readoutTimerRef = useRef(0);
  const [activeOrigin, setActiveOrigin] = useState<FloatingOrigin | null>(null);

  const syncVisuals = (pos: StickVec, forceReadout: boolean) => {
    if (knobRef.current) {
      const dx = pos.x * STICK_RADIUS_PX;
      const dy = -pos.y * STICK_RADIUS_PX;
      knobRef.current.style.transform = `translate3d(calc(-50% + ${dx}px), calc(-50% + ${dy}px), 0)`;
    }
    const now = performance.now();
    const writeReadout = (v: StickVec) => {
      if (readoutRef.current) {
        readoutRef.current.textContent = `${subLabel} · ${Math.round(v.x * 100)}% / ${Math.round(v.y * 100)}%`;
      }
    };
    if (forceReadout || now - lastReadoutMsRef.current >= 65) {
      if (readoutTimerRef.current) {
        clearTimeout(readoutTimerRef.current);
        readoutTimerRef.current = 0;
      }
      lastReadoutMsRef.current = now;
      writeReadout(pos);
    } else if (!readoutTimerRef.current) {
      const wait = Math.max(8, 65 - (now - lastReadoutMsRef.current));
      readoutTimerRef.current = window.setTimeout(() => {
        readoutTimerRef.current = 0;
        lastReadoutMsRef.current = performance.now();
        writeReadout(valueRef.current);
      }, wait);
    }
  };

  // Sync newly mounted knob position right after activeOrigin flips on pointerdown
  useEffect(() => {
    if (activeOrigin) {
      syncVisuals(valueRef.current, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOrigin]);

  const toLocalCoords = (clientX: number, clientY: number) => {
    const rect = rectRef.current ?? zoneRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
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
    rectRef.current = e.currentTarget.getBoundingClientRect();

    const local = toLocalCoords(e.clientX, e.clientY);
    const origin = computeFloatingStickOrigin(local.x, local.y);
    originRef.current = origin;
    setActiveOrigin(origin);

    const nextVal = computeFloatingStickValue(local.x, local.y, origin, STICK_RADIUS_PX);
    valueRef.current = nextVal;
    syncVisuals(nextVal, true);
    onStickSample(nextVal, true);

    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(6);
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
    valueRef.current = nextVal;
    syncVisuals(nextVal, false);
    onStickSample(nextVal, false);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (pointerIdRef.current !== e.pointerId) return;
    pointerIdRef.current = null;
    originRef.current = null;
    rectRef.current = null;
    setActiveOrigin(null);

    const releaseVal: StickVec = { x: 0, y: 0 };
    valueRef.current = releaseVal;
    syncVisuals(releaseVal, true);
    onStickSample(releaseVal, true);
  };

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

          {/* Moving thumb knob — updated via direct transform3d without React re-renders */}
          <div
            ref={knobRef}
            className="absolute left-1/2 top-1/2 w-12 h-12 rounded-full bg-amber-500 border-4 border-slate-950 shadow-lg flex items-center justify-center will-change-transform"
            style={{
              transform: 'translate3d(-50%, -50%, 0)',
            }}
          >
            <div className="w-3.5 h-3.5 rounded-full bg-amber-200/80" />
          </div>
        </div>
      )}

      {/* Bottom Axis Label & Live Value */}
      <div className="pointer-events-none text-center px-2">
        <div className="text-xs font-display font-bold text-slate-200">{label}</div>
        <div ref={readoutRef} className="text-[11px] font-mono text-slate-400 tabular-nums">
          {subLabel} · 0% / 0%
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
  const [p2pConnected, setP2pConnected] = useState(false);
  const [telemetry, setTelemetry] = useState<DroneTelemetry | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const sticksRef = useRef<StickInput>({ throttle: 0, yaw: 0, pitch: 0, roll: 0 });
  const lastSentRef = useRef<StickInput>({ throttle: 0, yaw: 0, pitch: 0, roll: 0 });
  const lastSendMsRef = useRef(0);
  const trailingTimerRef = useRef<number>(0);
  const txBufRef = useRef<Uint8Array<ArrayBuffer>>(
    new Uint8Array(new ArrayBuffer(STICK_PACKET_BYTES))
  );

  const flushTransmit = useCallback((force: boolean) => {
    const dc = dcRef.current;
    const ws = wsRef.current;
    const transport = pickRelayTransport(dc?.readyState, ws?.readyState);
    if (transport === 'none') return;

    const current = sticksRef.current;
    if (!force && !sticksChangedSignificantly(current, lastSentRef.current)) {
      return;
    }

    const now = performance.now();
    if (!force && now - lastSendMsRef.current < MIN_SEND_INTERVAL_MS) {
      if (!trailingTimerRef.current) {
        const wait = Math.max(2, MIN_SEND_INTERVAL_MS - (now - lastSendMsRef.current));
        trailingTimerRef.current = window.setTimeout(() => {
          trailingTimerRef.current = 0;
          flushTransmit(true);
        }, wait);
      }
      return;
    }

    if (trailingTimerRef.current) {
      clearTimeout(trailingTimerRef.current);
      trailingTimerRef.current = 0;
    }

    // Backpressure guard: drop stale intermediate frames instead of queueing TCP lag
    if (transport === 'webrtc') {
      if (!dc || dc.bufferedAmount > 512) return;
      const packet = encodeBinaryStickInto(current, txBufRef.current);
      dc.send(packet);
    } else {
      if (!ws || ws.bufferedAmount > 512) return;
      const packet = encodeBinaryStickInto(current, txBufRef.current);
      ws.send(packet);
    }

    lastSentRef.current = { ...current };
    lastSendMsRef.current = now;
  }, []);

  const handleLeftStickSample = useCallback(
    (pos: StickVec, immediate: boolean) => {
      sticksRef.current.throttle = pos.y;
      sticksRef.current.yaw = pos.x;
      flushTransmit(immediate);
    },
    [flushTransmit]
  );

  const handleRightStickSample = useCallback(
    (pos: StickVec, immediate: boolean) => {
      sticksRef.current.pitch = pos.y;
      sticksRef.current.roll = pos.x;
      flushTransmit(immediate);
    },
    [flushTransmit]
  );

  useEffect(() => {
    if (!activeRoom) return;

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${window.location.host}/ws`);
    ws.binaryType = 'arraybuffer';
    wsRef.current = ws;

    let pc: RTCPeerConnection | null = null;
    const pendingIce: RTCIceCandidateInit[] = [];
    let remoteDescSet = false;
    let alive = true;

    const cleanupPeer = () => {
      if (dcRef.current) {
        try {
          dcRef.current.close();
        } catch {
          // Ignore close error
        }
        dcRef.current = null;
      }
      if (pc) {
        try {
          pc.close();
        } catch {
          // Ignore close error
        }
        pc = null;
      }
      remoteDescSet = false;
      pendingIce.length = 0;
      if (alive) setP2pConnected(false);
    };

    ws.onopen = () => {
      setWsConnected(true);
      ws.send(JSON.stringify({ type: 'register', role: 'controller', room: activeRoom }));
      flushTransmit(true);
    };

    ws.onmessage = async (evt) => {
      if (typeof evt.data !== 'string') return;
      try {
        const msg = JSON.parse(evt.data) as {
          type: string;
          fromId?: string;
          simConnected?: boolean;
          telemetry?: DroneTelemetry;
          sdp?: RTCSessionDescriptionInit;
          candidate?: RTCIceCandidateInit;
        };

        if (msg.type === 'room:status') {
          const online = Boolean(msg.simConnected);
          setSimOnline(online);
          if (!online) {
            cleanupPeer();
          } else {
            flushTransmit(true);
          }
        } else if (msg.type === 'telemetry' && msg.telemetry) {
          setTelemetry(msg.telemetry);
        } else if (msg.type === 'rtc:offer' && msg.sdp && typeof RTCPeerConnection !== 'undefined') {
          cleanupPeer();
          try {
            pc = new RTCPeerConnection(RTC_CONFIG);

            pc.ondatachannel = (dcEvent) => {
              const ch = dcEvent.channel;
              ch.binaryType = 'arraybuffer';
              dcRef.current = ch;
              ch.onopen = () => {
                if (!alive) return;
                setP2pConnected(true);
                flushTransmit(true);
              };
              ch.onclose = () => {
                if (dcRef.current === ch) dcRef.current = null;
                if (alive) setP2pConnected(false);
              };
              ch.onerror = () => {
                if (dcRef.current === ch) dcRef.current = null;
                if (alive) setP2pConnected(false);
              };
            };

            pc.onicecandidate = (iceEvent) => {
              if (iceEvent.candidate && ws.readyState === WebSocket.OPEN) {
                ws.send(
                  JSON.stringify({
                    type: 'rtc:ice',
                    targetId: msg.fromId,
                    candidate: iceEvent.candidate.toJSON(),
                  })
                );
              }
            };

            pc.onconnectionstatechange = () => {
              if (pc && (pc.connectionState === 'failed' || pc.connectionState === 'closed')) {
                cleanupPeer();
              }
            };

            await pc.setRemoteDescription(msg.sdp);
            remoteDescSet = true;
            for (const cand of pendingIce) {
              await pc.addIceCandidate(cand);
            }
            pendingIce.length = 0;

            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            if (alive && ws.readyState === WebSocket.OPEN && pc.localDescription) {
              ws.send(
                JSON.stringify({
                  type: 'rtc:answer',
                  targetId: msg.fromId,
                  sdp: pc.localDescription.toJSON(),
                })
              );
            }
          } catch {
            cleanupPeer();
          }
        } else if (msg.type === 'rtc:ice' && msg.candidate && pc) {
          if (remoteDescSet) {
            await pc.addIceCandidate(msg.candidate);
          } else {
            pendingIce.push(msg.candidate);
          }
        }
      } catch {
        // Ignore malformed packets
      }
    };

    ws.onclose = () => {
      cleanupPeer();
      if (alive) {
        setWsConnected(false);
        setSimOnline(false);
      }
    };

    // Low-overhead keepalive ONLY if sticks are actively held away from center and idle > 260ms
    const keepaliveTimer = window.setInterval(() => {
      const s = sticksRef.current;
      const nonZero = s.throttle !== 0 || s.yaw !== 0 || s.pitch !== 0 || s.roll !== 0;
      if (nonZero && performance.now() - lastSendMsRef.current >= 260) {
        flushTransmit(true);
      }
    }, 280);

    return () => {
      alive = false;
      clearInterval(keepaliveTimer);
      if (trailingTimerRef.current) {
        clearTimeout(trailingTimerRef.current);
        trailingTimerRef.current = 0;
      }
      cleanupPeer();
      ws.close();
      wsRef.current = null;
    };
  }, [activeRoom, flushTransmit]);

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
              <span className="text-xs font-mono flex items-center gap-1.5">
                {wsConnected && simOnline ? (
                  <>
                    <span className="text-emerald-400 flex items-center gap-1">
                      <Wifi className="w-3.5 h-3.5" /> PC Conectado
                    </span>
                    <span
                      className={`inline-flex items-center gap-0.5 text-[10px] font-semibold ${
                        p2pConnected ? 'text-emerald-300' : 'text-sky-300'
                      }`}
                    >
                      <Zap className="w-3 h-3" />
                      {p2pConnected ? 'Direta' : 'Rede'}
                    </span>
                  </>
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
      <div className="flex-1 min-h-0 grid grid-cols-2 mt-2 rounded-xl border border-slate-800/80 bg-slate-900/35 overflow-hidden">
        <FloatingTouchZone
          side="left"
          label="Stick Esquerdo"
          subLabel="Acelerador / Yaw"
          onStickSample={handleLeftStickSample}
        />

        <FloatingTouchZone
          side="right"
          label="Stick Direito"
          subLabel="Pitch / Roll"
          onStickSample={handleRightStickSample}
        />
      </div>
    </div>
  );
}
