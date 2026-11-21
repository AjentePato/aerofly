import { useCallback, useEffect, useRef, useState } from 'react';
import { DroneCanvas } from './components/DroneCanvas';
import { TitleOverlay } from './components/TitleOverlay';
import { FlightHUD } from './components/FlightHUD';
import { OutcomeModal, PauseModal } from './components/Modals';
import { PairingModal } from './components/PairingModal';
import { MobileController } from './components/MobileController';
import { MISSIONS, createInitialMissionProgress, getMissionById } from './sim/missions';
import type {
  CameraMode,
  DronePhysicsState,
  DroneTelemetry,
  FlightMode,
  GamePhase,
  MissionId,
  MissionProgress,
  StickInput,
} from './sim/types';

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 4; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

const DEFAULT_TELEMETRY: DroneTelemetry = {
  altitude: 0,
  agl: 0,
  speed: 0,
  verticalSpeed: 0,
  headingDeg: 0,
  pitchDeg: 0,
  rollDeg: 0,
  batteryPct: 100,
  armed: true,
  onGround: true,
  crashed: false,
  flightMode: 'normal',
  cameraMode: 'chase',
  windSpeed: 0,
  motorPower: 0,
};

export default function App() {
  const searchParams = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
  const controllerParam = searchParams.get('controller');
  const mobileParam = searchParams.get('mobile');
  const autostartParam = searchParams.get('autostart');

  const [isMobileView, setIsMobileView] = useState(
    Boolean(controllerParam !== null || mobileParam === '1')
  );

  const [roomCode] = useState(() => {
    const saved = typeof window !== 'undefined' ? window.sessionStorage.getItem('aero_room') : null;
    if (saved) return saved;
    const code = generateRoomCode();
    if (typeof window !== 'undefined') window.sessionStorage.setItem('aero_room', code);
    return code;
  });

  const [phase, setPhase] = useState<GamePhase>(autostartParam === '1' ? 'playing' : 'title');
  const [missionId, setMissionId] = useState<MissionId>('hover_takeoff');
  const [flightMode, setFlightMode] = useState<FlightMode>('normal');
  const [cameraMode, setCameraMode] = useState<CameraMode>('chase');
  const [windEnabled, setWindEnabled] = useState(false);
  const [muted, setMuted] = useState(false);
  const [resetNonce, setResetNonce] = useState(0);
  const [showPairing, setShowPairing] = useState(false);

  const [controllerCount, setControllerCount] = useState(0);
  const [serverAvailable, setServerAvailable] = useState<boolean | null>(null);
  const [remotePreview, setRemotePreview] = useState<StickInput>({ throttle: 0, yaw: 0, pitch: 0, roll: 0 });
  const remoteStickRef = useRef<StickInput>({ throttle: 0, yaw: 0, pitch: 0, roll: 0 });
  const remoteActiveRef = useRef(false);

  const [telemetry, setTelemetry] = useState<DroneTelemetry>(DEFAULT_TELEMETRY);
  const [progress, setProgress] = useState<MissionProgress>(() => createInitialMissionProgress('hover_takeoff'));
  const [activeSticks, setActiveSticks] = useState<StickInput>({ throttle: 0, yaw: 0, pitch: 0, roll: 0 });
  const [outcomeSnapshot, setOutcomeSnapshot] = useState<{
    progress: MissionProgress;
    state: DronePhysicsState;
  } | null>(null);
  const [bestScores, setBestScores] = useState<Record<string, number>>(() => {
    try {
      const raw = localStorage.getItem('aerotrainer_scores');
      return raw ? (JSON.parse(raw) as Record<string, number>) : {};
    } catch {
      return {};
    }
  });

  // Sync game state machine to document.body.dataset.state
  useEffect(() => {
    document.body.dataset.state = phase;
  }, [phase]);

  // Actions
  const cycleCamera = useCallback(() => {
    setCameraMode((prev) => (prev === 'chase' ? 'fpv' : prev === 'fpv' ? 'los' : 'chase'));
  }, []);

  const cycleFlightMode = useCallback(() => {
    setFlightMode((prev) => (prev === 'normal' ? 'sport' : prev === 'sport' ? 'acro' : 'normal'));
  }, []);

  const handleStartFlight = useCallback(() => {
    setOutcomeSnapshot(null);
    setResetNonce((n) => n + 1);
    setPhase('playing');
  }, []);

  const handleReset = useCallback(() => {
    setOutcomeSnapshot(null);
    setResetNonce((n) => n + 1);
    setPhase('playing');
  }, []);

  const handleTogglePause = useCallback(() => {
    setPhase((p) => (p === 'playing' ? 'paused' : p === 'paused' ? 'playing' : p));
  }, []);

  // PC Simulator WebSocket Client for receiving phone virtual controller commands
  const latestTelemetryRef = useRef(telemetry);
  latestTelemetryRef.current = telemetry;

  useEffect(() => {
    if (isMobileView || typeof window === 'undefined' || !window.location.protocol.startsWith('http')) {
      setServerAvailable(false);
      return;
    }

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    let ws: WebSocket | null = null;
    let reconnectTimer = 0;
    let telemTimer = 0;
    let alive = true;

    const connect = () => {
      if (!alive) return;
      try {
        ws = new WebSocket(`${proto}//${window.location.host}/ws`);
      } catch {
        setServerAvailable(false);
        return;
      }

      ws.onopen = () => {
        setServerAvailable(true);
        ws?.send(JSON.stringify({ type: 'register', role: 'sim', room: roomCode }));
      };

      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data as string) as {
            type: string;
            controllerCount?: number;
            throttle?: number;
            yaw?: number;
            pitch?: number;
            roll?: number;
            action?: string;
          };

          if (msg.type === 'room:status') {
            const count = msg.controllerCount ?? 0;
            setControllerCount(count);
            remoteActiveRef.current = count > 0;
            if (count === 0) {
              remoteStickRef.current = { throttle: 0, yaw: 0, pitch: 0, roll: 0 };
            }
          } else if (msg.type === 'stick') {
            const nextStick: StickInput = {
              throttle: Number(msg.throttle ?? 0),
              yaw: Number(msg.yaw ?? 0),
              pitch: Number(msg.pitch ?? 0),
              roll: Number(msg.roll ?? 0),
            };
            remoteStickRef.current = nextStick;
            remoteActiveRef.current = true;
            setRemotePreview(nextStick);
          } else if (msg.type === 'action') {
            if (msg.action === 'cycle_camera') cycleCamera();
            else if (msg.action === 'cycle_mode') cycleFlightMode();
            else if (msg.action === 'reset') handleReset();
          }
        } catch {
          // Ignore malformed WS message
        }
      };

      ws.onclose = () => {
        if (alive) {
          reconnectTimer = window.setTimeout(connect, 2200);
        }
      };
    };

    // Check if the Node/WebSocket backend is active before opening WebSocket
    // (avoids console errors on static hosts like GitHub Pages)
    fetch('./api/health')
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data: { ok?: boolean }) => {
        if (!alive) return;
        if (data?.ok) {
          setServerAvailable(true);
          connect();
          telemTimer = window.setInterval(() => {
            if (ws && ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'telemetry', telemetry: latestTelemetryRef.current }));
            }
          }, 150);
        } else {
          setServerAvailable(false);
        }
      })
      .catch(() => {
        if (alive) setServerAvailable(false);
      });

    return () => {
      alive = false;
      clearTimeout(reconnectTimer);
      clearInterval(telemTimer);
      ws?.close();
    };
  }, [isMobileView, roomCode, cycleCamera, cycleFlightMode, handleReset]);

  const handleSelectMission = useCallback((id: MissionId) => {
    setMissionId(id);
    const def = getMissionById(id);
    setFlightMode(def.recommendedMode);
    setProgress(createInitialMissionProgress(id));
    setOutcomeSnapshot(null);
    setResetNonce((n) => n + 1);
  }, []);

  const handleMissionComplete = useCallback((prog: MissionProgress, state: DronePhysicsState) => {
    setOutcomeSnapshot({ progress: prog, state });
    setPhase('gameover');
    setBestScores((prev) => {
      const updated = {
        ...prev,
        [prog.missionId]: Math.max(prev[prog.missionId] ?? 0, prog.score),
      };
      try {
        localStorage.setItem('aerotrainer_scores', JSON.stringify(updated));
      } catch {
        // Ignore storage restrictions
      }
      return updated;
    });
  }, []);

  const handleCrash = useCallback((prog: MissionProgress, state: DronePhysicsState) => {
    setOutcomeSnapshot({ progress: prog, state });
    setPhase('gameover');
  }, []);

  const handleHudUpdate = useCallback(
    (nextTelem: DroneTelemetry, nextProg: MissionProgress, sticks: StickInput) => {
      setTelemetry(nextTelem);
      setProgress(nextProg);
      setActiveSticks(sticks);
    },
    []
  );

  if (isMobileView) {
    return (
      <MobileController
        initialRoom={controllerParam ?? ''}
        onExitToSimulator={() => {
          window.history.replaceState({}, '', window.location.pathname);
          setIsMobileView(false);
        }}
      />
    );
  }

  const currentIdx = MISSIONS.findIndex((m) => m.id === missionId);
  const hasNextMission = currentIdx >= 0 && currentIdx < MISSIONS.length - 1;

  return (
    <main className="relative w-full h-full overflow-hidden">
      <DroneCanvas
        phase={phase}
        missionId={missionId}
        flightMode={flightMode}
        cameraMode={cameraMode}
        windEnabled={windEnabled}
        muted={muted}
        remoteStickRef={remoteStickRef}
        remoteActiveRef={remoteActiveRef}
        resetNonce={resetNonce}
        onHudUpdate={handleHudUpdate}
        onMissionComplete={handleMissionComplete}
        onCrash={handleCrash}
        onTogglePause={handleTogglePause}
        onCycleCamera={cycleCamera}
        onSelectFlightMode={setFlightMode}
        onToggleMute={() => setMuted((m) => !m)}
        onTriggerReset={handleReset}
      />

      {phase === 'title' && (
        <TitleOverlay
          selectedMission={missionId}
          flightMode={flightMode}
          windEnabled={windEnabled}
          controllerConnected={controllerCount > 0}
          onSelectMission={handleSelectMission}
          onSelectFlightMode={setFlightMode}
          onToggleWind={() => setWindEnabled((w) => !w)}
          onStartFlight={handleStartFlight}
          onOpenPairing={() => setShowPairing(true)}
        />
      )}

      {phase === 'playing' && (
        <FlightHUD
          telemetry={telemetry}
          progress={progress}
          sticks={activeSticks}
          muted={muted}
          controllerConnected={controllerCount > 0}
          onCycleCamera={cycleCamera}
          onToggleMute={() => setMuted((m) => !m)}
          onTogglePause={handleTogglePause}
          onReset={handleReset}
          onOpenPairing={() => setShowPairing(true)}
          onSelectFlightMode={setFlightMode}
        />
      )}

      {phase === 'paused' && (
        <PauseModal
          missionId={missionId}
          flightMode={flightMode}
          cameraMode={cameraMode}
          windEnabled={windEnabled}
          controllerConnected={controllerCount > 0}
          onResume={() => setPhase('playing')}
          onRestart={handleReset}
          onReturnTitle={() => {
            setOutcomeSnapshot(null);
            setPhase('title');
          }}
          onSelectMission={handleSelectMission}
          onSelectFlightMode={setFlightMode}
          onSelectCameraMode={setCameraMode}
          onToggleWind={() => setWindEnabled((w) => !w)}
          onOpenPairing={() => setShowPairing(true)}
        />
      )}

      {phase === 'gameover' && outcomeSnapshot && (
        <OutcomeModal
          progress={outcomeSnapshot.progress}
          snapshot={outcomeSnapshot.state}
          bestScore={bestScores[outcomeSnapshot.progress.missionId] ?? outcomeSnapshot.progress.score}
          hasNextMission={hasNextMission}
          onRetry={handleReset}
          onNextMission={() => {
            if (hasNextMission) {
              const nextMission = MISSIONS[currentIdx + 1];
              handleSelectMission(nextMission.id);
              setPhase('playing');
            }
          }}
          onReturnTitle={() => {
            setOutcomeSnapshot(null);
            setPhase('title');
          }}
        />
      )}

      {showPairing && (
        <PairingModal
          roomCode={roomCode}
          controllerCount={controllerCount}
          serverAvailable={serverAvailable !== false}
          remoteSticks={remotePreview}
          onClose={() => setShowPairing(false)}
        />
      )}
    </main>
  );
}
