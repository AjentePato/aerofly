import { useCallback, useEffect, useRef, useState } from 'react';
import { DroneCanvas } from './components/DroneCanvas';
import { CanvasErrorBoundary } from './components/CanvasErrorBoundary';
import { TitleOverlay } from './components/TitleOverlay';
import { FlightHUD } from './components/FlightHUD';
import { OutcomeModal, PauseModal } from './components/Modals';
import { PairingModal } from './components/PairingModal';
import { ChangelogModal } from './components/ChangelogModal';
import { MobileController } from './components/MobileController';
import { VirtualTouchSticks } from './components/VirtualTouchSticks';
import { MISSIONS, createInitialMissionProgress, getMissionById } from './sim/missions';
import { readBrowserGamepad, type GamepadStatus } from './sim/gamepad';
import { decodeBinaryStick } from './sim/stickProtocol';
import { RTC_CONFIG, RTC_STICK_CHANNEL_OPTIONS } from './sim/webrtcConfig';
import { loadSavedDroneSkin, saveDroneSkin } from './sim/droneSkins';
import { loadSavedSpeedUnit, saveSpeedUnit } from './sim/speedUnit';
import { loadSavedGraphicsMode, saveGraphicsMode } from './sim/graphicsMode';
import { detectTouchSticksDefault } from './sim/touchControls';
import type {
  CameraMode,
  DronePhysicsState,
  DroneSkinId,
  DroneTelemetry,
  FlightMode,
  GamePhase,
  GraphicsMode,
  MissionId,
  MissionProgress,
  SpeedUnit,
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
  armed: false,
  armingProgress: 0,
  awaitingStickRelease: false,
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
  const [droneSkin, setDroneSkin] = useState<DroneSkinId>(() => loadSavedDroneSkin());
  const [speedUnit, setSpeedUnit] = useState<SpeedUnit>(() => loadSavedSpeedUnit());
  const [graphicsMode, setGraphicsMode] = useState<GraphicsMode>(() => loadSavedGraphicsMode());
  const [showcaseDrone, setShowcaseDrone] = useState(false);
  const [windEnabled, setWindEnabled] = useState(false);
  const [muted, setMuted] = useState(false);
  const [touchSticksEnabled, setTouchSticksEnabled] = useState<boolean>(() => detectTouchSticksDefault());
  const [hudHidden, setHudHidden] = useState(false);
  const [resetNonce, setResetNonce] = useState(0);
  const [showPairing, setShowPairing] = useState(false);
  const [showChangelog, setShowChangelog] = useState(false);

  const [controllerCount, setControllerCount] = useState(0);
  const [p2pConnected, setP2pConnected] = useState(false);
  const [gamepadStatus, setGamepadStatus] = useState<GamepadStatus>(() => readBrowserGamepad().status);
  const [serverAvailable, setServerAvailable] = useState<boolean | null>(null);
  const [remotePreview, setRemotePreview] = useState<StickInput>({ throttle: 0, yaw: 0, pitch: 0, roll: 0 });
  const remoteStickRef = useRef<StickInput>({ throttle: 0, yaw: 0, pitch: 0, roll: 0 });
  const remoteActiveRef = useRef(false);
  const touchStickRef = useRef<StickInput>({ throttle: 0, yaw: 0, pitch: 0, roll: 0 });
  const touchActiveRef = useRef(false);
  const virtualArmHoldRef = useRef(false);

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

  // Sync game state machine & HUD visibility to document.body.dataset
  useEffect(() => {
    document.body.dataset.state = phase;
  }, [phase]);

  useEffect(() => {
    document.body.dataset.hudHidden = hudHidden ? 'true' : 'false';
    const touchActive = phase === 'playing' && touchSticksEnabled;
    touchActiveRef.current = touchActive;
    if (!touchActive) {
      touchStickRef.current.throttle = 0;
      touchStickRef.current.yaw = 0;
      touchStickRef.current.pitch = 0;
      touchStickRef.current.roll = 0;
      virtualArmHoldRef.current = false;
    }
  }, [phase, touchSticksEnabled, hudHidden]);

  // Actions
  const cycleCamera = useCallback(() => {
    setCameraMode((prev) => (prev === 'chase' ? 'fpv' : 'chase'));
  }, []);

  const cycleFlightMode = useCallback(() => {
    setFlightMode((prev) => (prev === 'normal' ? 'sport' : 'normal'));
  }, []);

  const handleSelectDroneSkin = useCallback((skin: DroneSkinId) => {
    setDroneSkin(skin);
    saveDroneSkin(skin);
  }, []);

  const handleSelectSpeedUnit = useCallback((unit: SpeedUnit) => {
    setSpeedUnit(unit);
    saveSpeedUnit(unit);
  }, []);

  const handleSelectGraphicsMode = useCallback((mode: GraphicsMode) => {
    setGraphicsMode(mode);
    saveGraphicsMode(mode);
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

  const handleToggleHud = useCallback(() => {
    setHudHidden((prev) => !prev);
  }, []);

  const handleVirtualArmHoldChange = useCallback((holding: boolean) => {
    virtualArmHoldRef.current = holding;
  }, []);

  // Refs so incoming WS/WebRTC events never force effect teardown or trigger 50Hz React renders
  const latestTelemetryRef = useRef(telemetry);
  latestTelemetryRef.current = telemetry;
  const showPairingRef = useRef(showPairing);
  showPairingRef.current = showPairing;
  const controllerCountRef = useRef(controllerCount);
  controllerCountRef.current = controllerCount;
  const cycleCameraRef = useRef(cycleCamera);
  cycleCameraRef.current = cycleCamera;
  const cycleFlightModeRef = useRef(cycleFlightMode);
  cycleFlightModeRef.current = cycleFlightMode;
  const handleResetRef = useRef(handleReset);
  handleResetRef.current = handleReset;

  useEffect(() => {
    if (isMobileView || typeof window === 'undefined' || !window.location.protocol.startsWith('http')) {
      setServerAvailable(false);
      return;
    }

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    let ws: WebSocket | null = null;
    let reconnectTimer = 0;
    let telemTimer = 0;
    let lastPreviewEmit = 0;
    let alive = true;

    interface PeerEntry {
      pc: RTCPeerConnection;
      dc: RTCDataChannel | null;
      pendingIce: RTCIceCandidateInit[];
      remoteDescSet: boolean;
    }
    const peers = new Map<string, PeerEntry>();

    const recomputeP2pState = () => {
      if (!alive) return;
      let anyOpen = false;
      for (const entry of peers.values()) {
        if (entry.dc && entry.dc.readyState === 'open') {
          anyOpen = true;
          break;
        }
      }
      setP2pConnected(anyOpen);
    };

    const closePeer = (id: string) => {
      const entry = peers.get(id);
      if (!entry) return;
      try {
        entry.dc?.close();
      } catch {
        // Ignore cleanup errors
      }
      try {
        entry.pc.close();
      } catch {
        // Ignore cleanup errors
      }
      peers.delete(id);
      recomputeP2pState();
    };

    const closeAllPeers = () => {
      for (const id of Array.from(peers.keys())) {
        closePeer(id);
      }
    };

    const applyIncomingStick = (nextStick: StickInput) => {
      remoteStickRef.current = nextStick;
      remoteActiveRef.current = true;
      if (showPairingRef.current) {
        const now = performance.now();
        if (
          now - lastPreviewEmit >= 65 ||
          (nextStick.throttle === 0 && nextStick.yaw === 0 && nextStick.pitch === 0 && nextStick.roll === 0)
        ) {
          lastPreviewEmit = now;
          setRemotePreview(nextStick);
        }
      }
    };

    const handleBinaryPayload = (raw: unknown) => {
      if (raw instanceof ArrayBuffer) {
        const decoded = decodeBinaryStick(raw);
        if (decoded) applyIncomingStick(decoded);
      } else if (ArrayBuffer.isView(raw)) {
        const decoded = decodeBinaryStick(raw);
        if (decoded) applyIncomingStick(decoded);
      } else if (raw instanceof Blob) {
        raw
          .arrayBuffer()
          .then((buf) => {
            if (!alive) return;
            const decoded = decodeBinaryStick(buf);
            if (decoded) applyIncomingStick(decoded);
          })
          .catch(() => {});
      }
    };

    const startPeerOffer = async (targetId: string) => {
      if (typeof RTCPeerConnection === 'undefined' || peers.has(targetId)) return;
      try {
        const pc = new RTCPeerConnection(RTC_CONFIG);
        const dc = pc.createDataChannel('sticks', RTC_STICK_CHANNEL_OPTIONS);
        dc.binaryType = 'arraybuffer';

        const entry: PeerEntry = { pc, dc, pendingIce: [], remoteDescSet: false };
        peers.set(targetId, entry);

        dc.onopen = () => recomputeP2pState();
        dc.onclose = () => recomputeP2pState();
        dc.onerror = () => recomputeP2pState();
        dc.onmessage = (evt) => {
          if (typeof evt.data === 'string') {
            try {
              const parsed = JSON.parse(evt.data) as {
                type?: string;
                throttle?: number;
                yaw?: number;
                pitch?: number;
                roll?: number;
              };
              if (parsed.type === 'stick') {
                applyIncomingStick({
                  throttle: Number(parsed.throttle ?? 0),
                  yaw: Number(parsed.yaw ?? 0),
                  pitch: Number(parsed.pitch ?? 0),
                  roll: Number(parsed.roll ?? 0),
                });
              }
            } catch {
              // Ignore malformed JSON on DC
            }
          } else {
            handleBinaryPayload(evt.data);
          }
        };

        pc.onicecandidate = (evt) => {
          if (evt.candidate && ws && ws.readyState === WebSocket.OPEN) {
            ws.send(
              JSON.stringify({
                type: 'rtc:ice',
                targetId,
                candidate: evt.candidate.toJSON(),
              })
            );
          }
        };

        pc.onconnectionstatechange = () => {
          if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
            closePeer(targetId);
          }
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        if (alive && ws && ws.readyState === WebSocket.OPEN && pc.localDescription) {
          ws.send(
            JSON.stringify({
              type: 'rtc:offer',
              targetId,
              sdp: pc.localDescription.toJSON(),
            })
          );
        }
      } catch {
        closePeer(targetId);
      }
    };

    const connect = () => {
      if (!alive) return;
      try {
        ws = new WebSocket(`${proto}//${window.location.host}/ws`);
        ws.binaryType = 'arraybuffer';
      } catch {
        setServerAvailable(false);
        return;
      }

      ws.onopen = () => {
        setServerAvailable(true);
        ws?.send(JSON.stringify({ type: 'register', role: 'sim', room: roomCode }));
      };

      ws.onmessage = async (evt) => {
        // Fast path: 9-byte binary stick packet
        if (typeof evt.data !== 'string') {
          handleBinaryPayload(evt.data);
          return;
        }

        try {
          const msg = JSON.parse(evt.data) as {
            type: string;
            fromId?: string;
            controllerCount?: number;
            controllerIds?: string[];
            throttle?: number;
            yaw?: number;
            pitch?: number;
            roll?: number;
            action?: string;
            sdp?: RTCSessionDescriptionInit;
            candidate?: RTCIceCandidateInit;
          };

          if (msg.type === 'room:status') {
            const count = msg.controllerCount ?? 0;
            setControllerCount(count);
            remoteActiveRef.current = count > 0;
            if (count === 0) {
              remoteStickRef.current = { throttle: 0, yaw: 0, pitch: 0, roll: 0 };
              if (showPairingRef.current) {
                setRemotePreview(remoteStickRef.current);
              }
            }

            // Reconcile WebRTC peer connections for active controllers
            const activeIds = new Set(msg.controllerIds ?? []);
            for (const existingId of Array.from(peers.keys())) {
              if (!activeIds.has(existingId)) closePeer(existingId);
            }
            for (const id of activeIds) {
              if (!peers.has(id)) void startPeerOffer(id);
            }
          } else if (msg.type === 'stick') {
            applyIncomingStick({
              throttle: Number(msg.throttle ?? 0),
              yaw: Number(msg.yaw ?? 0),
              pitch: Number(msg.pitch ?? 0),
              roll: Number(msg.roll ?? 0),
            });
          } else if (msg.type === 'action') {
            if (msg.action === 'cycle_camera') cycleCameraRef.current();
            else if (msg.action === 'cycle_mode') cycleFlightModeRef.current();
            else if (msg.action === 'reset') handleResetRef.current();
          } else if (msg.type === 'rtc:answer' && msg.fromId && msg.sdp) {
            const entry = peers.get(msg.fromId);
            if (entry) {
              await entry.pc.setRemoteDescription(msg.sdp);
              entry.remoteDescSet = true;
              for (const cand of entry.pendingIce) {
                await entry.pc.addIceCandidate(cand);
              }
              entry.pendingIce.length = 0;
            }
          } else if (msg.type === 'rtc:ice' && msg.fromId && msg.candidate) {
            const entry = peers.get(msg.fromId);
            if (entry) {
              if (entry.remoteDescSet) {
                await entry.pc.addIceCandidate(msg.candidate);
              } else {
                entry.pendingIce.push(msg.candidate);
              }
            }
          }
        } catch {
          // Ignore malformed WS or SDP/ICE message
        }
      };

      ws.onclose = () => {
        closeAllPeers();
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
            if (
              controllerCountRef.current > 0 &&
              ws &&
              ws.readyState === WebSocket.OPEN &&
              ws.bufferedAmount < 2048
            ) {
              ws.send(JSON.stringify({ type: 'telemetry', telemetry: latestTelemetryRef.current }));
            }
          }, 200);
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
      closeAllPeers();
      ws?.close();
    };
  }, [isMobileView, roomCode]);

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
      <CanvasErrorBoundary>
        <DroneCanvas
          phase={phase}
          missionId={missionId}
          flightMode={flightMode}
          cameraMode={cameraMode}
          droneSkin={droneSkin}
          speedUnit={speedUnit}
          graphicsMode={graphicsMode}
          showcaseDrone={phase === 'title' && showcaseDrone}
          windEnabled={windEnabled}
          muted={muted}
          remoteStickRef={remoteStickRef}
          remoteActiveRef={remoteActiveRef}
          touchStickRef={touchStickRef}
          touchActiveRef={touchActiveRef}
          virtualArmHoldRef={virtualArmHoldRef}
          resetNonce={resetNonce}
          onHudUpdate={handleHudUpdate}
          onMissionComplete={handleMissionComplete}
          onCrash={handleCrash}
          onTogglePause={handleTogglePause}
          onToggleHud={handleToggleHud}
          onCycleCamera={cycleCamera}
          onSelectFlightMode={setFlightMode}
          onToggleMute={() => setMuted((m) => !m)}
          onTriggerReset={handleReset}
          onGamepadStatusChange={setGamepadStatus}
        />
      </CanvasErrorBoundary>

      {phase === 'title' && (
        <TitleOverlay
          selectedMission={missionId}
          flightMode={flightMode}
          droneSkin={droneSkin}
          speedUnit={speedUnit}
          graphicsMode={graphicsMode}
          windEnabled={windEnabled}
          muted={muted}
          touchSticksEnabled={touchSticksEnabled}
          controllerConnected={controllerCount > 0}
          gamepadConnected={gamepadStatus.connected}
          gamepadLabel={gamepadStatus.label}
          modalOpen={showPairing || showChangelog}
          onSelectMission={handleSelectMission}
          onSelectFlightMode={setFlightMode}
          onSelectDroneSkin={handleSelectDroneSkin}
          onSelectSpeedUnit={handleSelectSpeedUnit}
          onSelectGraphicsMode={handleSelectGraphicsMode}
          onShowcaseChange={setShowcaseDrone}
          onToggleWind={() => setWindEnabled((w) => !w)}
          onToggleMute={() => setMuted((m) => !m)}
          onToggleTouchSticks={() => setTouchSticksEnabled((v) => !v)}
          onStartFlight={handleStartFlight}
          onOpenPairing={() => setShowPairing(true)}
          onOpenChangelog={() => setShowChangelog(true)}
        />
      )}

      {phase === 'playing' && touchSticksEnabled && (
        <VirtualTouchSticks touchStickRef={touchStickRef} invisible={hudHidden} />
      )}

      {phase === 'playing' && (
        <FlightHUD
          telemetry={telemetry}
          progress={progress}
          sticks={activeSticks}
          muted={muted}
          hudHidden={hudHidden}
          touchSticksEnabled={touchSticksEnabled}
          speedUnit={speedUnit}
          controllerConnected={controllerCount > 0}
          gamepadConnected={gamepadStatus.connected}
          gamepadLabel={gamepadStatus.label}
          onCycleCamera={cycleCamera}
          onToggleMute={() => setMuted((m) => !m)}
          onTogglePause={handleTogglePause}
          onToggleHud={handleToggleHud}
          onReset={handleReset}
          onOpenPairing={() => setShowPairing(true)}
          onSelectFlightMode={setFlightMode}
          onVirtualArmHoldChange={handleVirtualArmHoldChange}
        />
      )}

      {phase === 'paused' && (
        <PauseModal
          missionId={missionId}
          flightMode={flightMode}
          cameraMode={cameraMode}
          droneSkin={droneSkin}
          speedUnit={speedUnit}
          graphicsMode={graphicsMode}
          windEnabled={windEnabled}
          muted={muted}
          touchSticksEnabled={touchSticksEnabled}
          hudHidden={hudHidden}
          controllerConnected={controllerCount > 0}
          gamepadConnected={gamepadStatus.connected}
          gamepadLabel={gamepadStatus.label}
          onResume={() => setPhase('playing')}
          onRestart={handleReset}
          onReturnTitle={() => {
            setOutcomeSnapshot(null);
            setPhase('title');
          }}
          onSelectMission={handleSelectMission}
          onSelectFlightMode={setFlightMode}
          onSelectCameraMode={setCameraMode}
          onSelectDroneSkin={handleSelectDroneSkin}
          onSelectSpeedUnit={handleSelectSpeedUnit}
          onSelectGraphicsMode={handleSelectGraphicsMode}
          onToggleWind={() => setWindEnabled((w) => !w)}
          onToggleMute={() => setMuted((m) => !m)}
          onToggleTouchSticks={() => setTouchSticksEnabled((v) => !v)}
          onToggleHud={handleToggleHud}
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
          p2pConnected={p2pConnected}
          serverAvailable={serverAvailable !== false}
          remoteSticks={remotePreview}
          onClose={() => setShowPairing(false)}
        />
      )}

      {showChangelog && <ChangelogModal onClose={() => setShowChangelog(false)} />}
    </main>
  );
}
