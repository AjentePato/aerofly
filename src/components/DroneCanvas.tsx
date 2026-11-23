import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { createDroneMesh } from '../sim/droneMesh';
import { buildTrainingWorld } from '../sim/worldBuilder';
import {
  createInitialDroneState,
  extractTelemetry,
  groundHeightAt,
  stepDronePhysics,
  surfaceHeightAt,
} from '../sim/physics';
import { createInitialMissionProgress, evaluateMissionStep, getMissionById } from '../sim/missions';
import { DroneAudioEngine } from '../sim/audio';
import { readBrowserGamepad, type GamepadStatus } from '../sim/gamepad';
import {
  createIdleCrashTumble,
  initCrashTumble,
  stepCrashTumble,
  type CrashTumbleState,
} from '../sim/crashAnimation';
import { createCrashEffects } from '../sim/crashEffects';
import { resolvePostArmStickGate, stepArmingState } from '../sim/arming';
import { computeAdaptiveVerticalFov } from '../sim/touchControls';
import type {
  CameraMode,
  DronePhysicsState,
  DroneSkinId,
  DroneTelemetry,
  FlightMode,
  GamePhase,
  MissionId,
  MissionProgress,
  StickInput,
} from '../sim/types';

export interface SimBridgeProps {
  phase: GamePhase;
  missionId: MissionId;
  flightMode: FlightMode;
  cameraMode: CameraMode;
  droneSkin: DroneSkinId;
  showcaseDrone?: boolean;
  windEnabled: boolean;
  muted: boolean;
  remoteStickRef: React.MutableRefObject<StickInput>;
  remoteActiveRef: React.MutableRefObject<boolean>;
  touchStickRef: React.MutableRefObject<StickInput>;
  touchActiveRef: React.MutableRefObject<boolean>;
  virtualArmHoldRef?: React.MutableRefObject<boolean>;
  resetNonce: number;
  onHudUpdate: (telemetry: DroneTelemetry, progress: MissionProgress, activeSticks: StickInput) => void;
  onMissionComplete: (progress: MissionProgress, state: DronePhysicsState) => void;
  onCrash: (progress: MissionProgress, state: DronePhysicsState) => void;
  onTogglePause: () => void;
  onToggleHud: () => void;
  onCycleCamera: () => void;
  onSelectFlightMode: (mode: FlightMode) => void;
  onToggleMute: () => void;
  onTriggerReset: () => void;
  onGamepadStatusChange?: (status: GamepadStatus) => void;
}

// Pre-allocated math helpers outside the 60Hz loop (zero GC)
const _camTargetPos = new THREE.Vector3();
const _camDesiredPos = new THREE.Vector3();
const _camRightDir = new THREE.Vector3();
const _forwardDir = new THREE.Vector3();
const _euler = new THREE.Euler(0, 0, 0, 'YXZ');
const _fpvWorldPos = new THREE.Vector3();
const _fpvWorldQuat = new THREE.Quaternion();
const _fpvTiltEuler = new THREE.Euler(0, 0, 0, 'YXZ');
const _fpvTiltQuat = new THREE.Quaternion();
const _camRayOrigin = new THREE.Vector3();
const _camRayDir = new THREE.Vector3();
const _camRaycaster = new THREE.Raycaster();
const _nearbyColliders: THREE.Object3D[] = [];

export function DroneCanvas(props: SimBridgeProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = (() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: isSoftwareGl,
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 1.5));
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);

    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      62,
      (container.clientWidth || window.innerWidth) / (container.clientHeight || window.innerHeight),
      0.25,
      1800
    );

    const maxAniso = isSoftwareGl ? 1 : Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const world = buildTrainingWorld(scene, renderer, isSoftwareGl);
    let activeDroneSkin: DroneSkinId = propsRef.current.droneSkin;
    let droneRig = createDroneMesh(activeDroneSkin, maxAniso);
    scene.add(droneRig.root);
    scene.add(droneRig.contactShadow);

    const crashEffects = createCrashEffects(scene);
    const audio = new DroneAudioEngine();

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // Simulation state held inside effect (never triggers React re-renders per frame)
    let droneState = createInitialDroneState();
    let armingProgress = 0;
    let awaitingStickRelease = false;
    let missionProgress = createInitialMissionProgress(propsRef.current.missionId);
    let crashTumble: CrashTumbleState = createIdleCrashTumble();
    let crashMissionSnapshot: MissionProgress | null = null;
    let crashVisualYawAnchor = 0;
    let crashStartWallMs = 0;
    let lastMissionId = propsRef.current.missionId;
    let lastResetNonce = propsRef.current.resetNonce;
    let lastPhase = propsRef.current.phase;
    let elapsed = 0;
    let lastHudEmitTime = 0;
    let prevTimestamp = performance.now();
    let camShakeTrauma = 0;
    let propAngle = 0;
    let turbineAngle = 0;
    let visualChaseYaw = 0;
    let visualYawBank = 0;

    // Initialize camera behind spawn helipad facing the radio tower & gates
    _camDesiredPos.set(0, 2.8, 5.2);
    camera.position.copy(_camDesiredPos);
    camera.lookAt(0, 1.2, -12);

    // Unified Keyboard Input Hub
    const keys = new Set<string>();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const code = e.code;

      if (propsRef.current.phase === 'playing') {
        if (code === 'KeyP' || code === 'Escape') {
          e.preventDefault();
          propsRef.current.onTogglePause();
          return;
        }
        if (code === 'KeyC') {
          e.preventDefault();
          propsRef.current.onCycleCamera();
          return;
        }
        if (code === 'KeyM') {
          e.preventDefault();
          propsRef.current.onToggleMute();
          return;
        }
        if (code === 'KeyR') {
          e.preventDefault();
          propsRef.current.onTriggerReset();
          return;
        }
        if (code === 'KeyH') {
          e.preventDefault();
          propsRef.current.onToggleHud();
          return;
        }
        if (code === 'Digit1') propsRef.current.onSelectFlightMode('normal');
        if (code === 'Digit2') propsRef.current.onSelectFlightMode('sport');
      } else if (propsRef.current.phase === 'paused' && (code === 'KeyP' || code === 'Escape')) {
        e.preventDefault();
        propsRef.current.onTogglePause();
        return;
      }

      if (propsRef.current.phase !== 'playing') return;
      audio.init();
      keys.add(code);
    };

    const onKeyUp = (e: KeyboardEvent) => {
      keys.delete(e.code);
    };

    const clearKeys = () => {
      keys.clear();
    };

    const onPointerDown = () => {
      audio.init();
    };

    let lastGpConnected = false;
    let lastGpLabel = '';
    const emitGamepadIfChanged = (status: GamepadStatus) => {
      if (status.connected !== lastGpConnected || status.label !== lastGpLabel) {
        lastGpConnected = status.connected;
        lastGpLabel = status.label;
        propsRef.current.onGamepadStatusChange?.(status);
      }
    };
    const onGamepadChange = () => {
      emitGamepadIfChanged(readBrowserGamepad().status);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', clearKeys);
    window.addEventListener('pointerdown', onPointerDown, { passive: true });
    window.addEventListener('gamepadconnected', onGamepadChange);
    window.addEventListener('gamepaddisconnected', onGamepadChange);
    onGamepadChange();
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) clearKeys();
    });

    const onResize = () => {
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      if (w <= 0 || h <= 0) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    const resizeObserver =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(onResize) : null;
    resizeObserver?.observe(container);

    const onContextLost = (e: Event) => {
      e.preventDefault();
    };
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);

    function sampleControllerSticks(gpSticks?: StickInput): StickInput {
      let throttle = 0;
      let yaw = 0;
      let pitch = 0;
      let roll = 0;

      const r = propsRef.current.remoteStickRef.current;
      if (propsRef.current.remoteActiveRef.current) {
        if (Math.abs(r.throttle) > 0.02) throttle += r.throttle;
        if (Math.abs(r.yaw) > 0.02) yaw += r.yaw;
        if (Math.abs(r.pitch) > 0.02) pitch += r.pitch;
        if (Math.abs(r.roll) > 0.02) roll += r.roll;
      }

      const t = propsRef.current.touchStickRef.current;
      if (propsRef.current.touchActiveRef.current) {
        if (Math.abs(t.throttle) > 0.02) throttle += t.throttle;
        if (Math.abs(t.yaw) > 0.02) yaw += t.yaw;
        if (Math.abs(t.pitch) > 0.02) pitch += t.pitch;
        if (Math.abs(t.roll) > 0.02) roll += t.roll;
      }

      if (gpSticks) {
        throttle += gpSticks.throttle;
        yaw += gpSticks.yaw;
        pitch += gpSticks.pitch;
        roll += gpSticks.roll;
      }

      return {
        throttle: Math.max(-1, Math.min(1, throttle)),
        yaw: Math.max(-1, Math.min(1, yaw)),
        pitch: Math.max(-1, Math.min(1, pitch)),
        roll: Math.max(-1, Math.min(1, roll)),
      };
    }

    function sampleCombinedSticks(gpSticks?: StickInput): StickInput {
      let throttle = 0;
      let yaw = 0;
      let pitch = 0;
      let roll = 0;

      // Mode 2 Keyboard Mapping:
      // WASD = Pitch/Roll (Right stick) OR Arrow keys
      // Space/Shift = Throttle Up/Down, Q/E = Yaw Left/Right
      // Also support I/K/J/L for pure Mode-2 Left/Right stick users
      if (keys.has('Space') || keys.has('KeyI')) throttle += 1;
      if (keys.has('ShiftLeft') || keys.has('ShiftRight') || keys.has('KeyK')) throttle -= 1;
      if (keys.has('KeyQ') || keys.has('KeyJ')) yaw -= 1;
      if (keys.has('KeyE') || keys.has('KeyL')) yaw += 1;

      if (keys.has('KeyW') || keys.has('ArrowUp')) pitch += 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) pitch -= 1;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) roll -= 1;
      if (keys.has('KeyD') || keys.has('ArrowRight')) roll += 1;

      // Merge remote mobile virtual controller sticks seamlessly
      const r = propsRef.current.remoteStickRef.current;
      if (propsRef.current.remoteActiveRef.current) {
        if (Math.abs(r.throttle) > 0.02) throttle += r.throttle;
        if (Math.abs(r.yaw) > 0.02) yaw += r.yaw;
        if (Math.abs(r.pitch) > 0.02) pitch += r.pitch;
        if (Math.abs(r.roll) > 0.02) roll += r.roll;
      }

      // Merge on-screen virtual touch joysticks (mobile/touch gameplay)
      const t = propsRef.current.touchStickRef.current;
      if (propsRef.current.touchActiveRef.current) {
        if (Math.abs(t.throttle) > 0.02) throttle += t.throttle;
        if (Math.abs(t.yaw) > 0.02) yaw += t.yaw;
        if (Math.abs(t.pitch) > 0.02) pitch += t.pitch;
        if (Math.abs(t.roll) > 0.02) roll += t.roll;
      }

      // Merge physical Xbox / DS4 gamepad sticks strictly (Mode 2 analog sticks only)
      if (gpSticks) {
        throttle += gpSticks.throttle;
        yaw += gpSticks.yaw;
        pitch += gpSticks.pitch;
        roll += gpSticks.roll;
      }

      return {
        throttle: Math.max(-1, Math.min(1, throttle)),
        yaw: Math.max(-1, Math.min(1, yaw)),
        pitch: Math.max(-1, Math.min(1, pitch)),
        roll: Math.max(-1, Math.min(1, roll)),
      };
    }

    let frameId = 0;
    let disposed = false;

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) return;
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function resetSimulation(missionId: MissionId) {
      droneState = createInitialDroneState();
      armingProgress = 0;
      awaitingStickRelease = false;
      missionProgress = createInitialMissionProgress(missionId);
      crashTumble = createIdleCrashTumble();
      crashMissionSnapshot = null;
      crashVisualYawAnchor = 0;
      crashStartWallMs = 0;
      crashEffects.reset();
      droneRig.propellers.forEach((p) => {
        p.visible = true;
      });
      droneRig.frontLedMat.emissive.setHex(0xf59e0b);
      droneRig.frontLedMat.emissiveIntensity = 1.2;
      droneRig.rearLedMat.emissive.setHex(0xf59e0b);
      droneRig.rearLedMat.emissiveIntensity = 1.2;
      lastHudEmitTime = 0;
      camShakeTrauma = 0;
      visualChaseYaw = droneState.yaw;
      visualYawBank = 0;
    }

    function tick(now = performance.now()) {
      if (disposed) return;
      const rawDt = (now - prevTimestamp) / 1000;
      prevTimestamp = now;
      const dt = Math.min(Math.max(rawDt, 0.001), 0.05);
      elapsed += dt;

      const cur = propsRef.current;
      audio.setMuted(cur.muted);

      // Clear held keys when leaving active flight
      if (cur.phase !== 'playing' && lastPhase === 'playing') {
        clearKeys();
      }

      // Handle mission change or explicit reset
      if (cur.missionId !== lastMissionId || cur.resetNonce !== lastResetNonce) {
        lastMissionId = cur.missionId;
        lastResetNonce = cur.resetNonce;
        resetSimulation(cur.missionId);
      }

      // When transitioning from title -> playing, ensure clean spawn & audio init
      if (cur.phase === 'playing' && lastPhase === 'title') {
        audio.init();
        resetSimulation(cur.missionId);
      }
      lastPhase = cur.phase;

      // Ambient world motion (wind turbines, windsock, tower beacon)
      turbineAngle -= dt * (cur.windEnabled ? 1.8 : 0.85);
      for (const rotor of world.turbineRotors) {
        rotor.rotation.z = turbineAngle;
      }
      world.windsockSwivel.rotation.y = Math.sin(elapsed * 1.9) * (cur.windEnabled ? 0.34 : 0.14);
      world.windsockCone.rotation.z =
        (cur.windEnabled ? -0.1 : -0.52) +
        Math.sin(elapsed * 4.4) * (cur.windEnabled ? 0.045 : 0.022);
      world.towerBeaconMat.emissiveIntensity = 1.5 + Math.max(0, Math.sin(elapsed * 3.2)) * 2.5;

      const missionDef = getMissionById(cur.missionId);
      const gpSample = readBrowserGamepad();
      emitGamepadIfChanged(gpSample.status);
      let activeSticks: StickInput = { throttle: 0, yaw: 0, pitch: 0, roll: 0 };

      // Live swap drone model/texture without resetting flight or tearing down WebGL
      if (cur.droneSkin !== activeDroneSkin) {
        const prevPos = droneRig.root.position.clone();
        const prevQuat = droneRig.root.quaternion.clone();
        const prevVis = droneRig.root.visible;
        const prevPropVis = droneRig.propellers.map((p) => p.visible);
        scene.remove(droneRig.root);
        scene.remove(droneRig.contactShadow);
        droneRig.dispose();

        activeDroneSkin = cur.droneSkin;
        droneRig = createDroneMesh(activeDroneSkin, maxAniso);
        droneRig.root.position.copy(prevPos);
        droneRig.root.quaternion.copy(prevQuat);
        droneRig.root.visible = prevVis;
        droneRig.propellers.forEach((p, idx) => {
          p.visible = prevPropVis[idx] ?? true;
        });
        if (crashTumble.active) {
          droneRig.frontLedMat.emissive.setHex(0xef4444);
          droneRig.rearLedMat.emissive.setHex(0xef4444);
        } else if (!droneState.armed && cur.phase === 'playing') {
          droneRig.frontLedMat.emissive.setHex(0xf59e0b);
          droneRig.rearLedMat.emissive.setHex(0xf59e0b);
        }
        scene.add(droneRig.root);
        scene.add(droneRig.contactShadow);
      }

      if (cur.phase === 'title') {
        // Title screen: Live orbital camera tour around the sunlit airfield & hovering drone
        droneRig.frontLedMat.emissive.setHex(0x38bdf8);
        droneRig.frontLedMat.emissiveIntensity = 2.2;
        droneRig.rearLedMat.emissive.setHex(0xef4444);
        droneRig.rearLedMat.emissiveIntensity = 2.2;
        const tourAngle = elapsed * (cur.showcaseDrone ? 0.36 : 0.18);
        const hoverY = 3.2 + Math.sin(elapsed * 1.6) * (cur.showcaseDrone ? 0.08 : 0.22);
        droneRig.root.visible = true;
        droneRig.root.position.set(0, hoverY, 0);
        droneRig.root.rotation.set(
          cur.showcaseDrone ? 0.03 * Math.sin(elapsed) : 0.05 * Math.sin(elapsed),
          cur.showcaseDrone ? tourAngle * 0.55 : tourAngle * 0.4,
          cur.showcaseDrone ? 0.025 * Math.cos(elapsed) : 0.04 * Math.cos(elapsed)
        );
        droneRig.contactShadow.position.set(0, surfaceHeightAt(0, 0, 1) + 0.02, 0);
        droneRig.contactShadow.scale.setScalar(0.65);

        propAngle += dt * (cur.showcaseDrone ? 18 : 42);
        droneRig.propellers.forEach((p, idx) => {
          p.rotation.y = propAngle * (idx % 2 === 0 ? 1 : -1);
          droneRig.propBlurDiscs[idx].visible = !cur.showcaseDrone;
        });

        if (cur.showcaseDrone) {
          // Close-up studio showcase starting from signature front-3/4 hero angle on right-hand viewport
          const showcaseAngle = Math.PI * 0.78 + elapsed * 0.34;
          const orbitRadius = 1.56;
          _camDesiredPos.set(
            Math.sin(showcaseAngle) * orbitRadius,
            hoverY + 0.25,
            Math.cos(showcaseAngle) * orbitRadius
          );
          camera.position.lerp(_camDesiredPos, 1 - Math.exp(-6.5 * dt));

          _forwardDir.set(-Math.sin(showcaseAngle), 0, -Math.cos(showcaseAngle));
          _camRightDir.set(Math.cos(showcaseAngle), 0, -Math.sin(showcaseAngle));
          _camTargetPos.set(0, hoverY - 0.04, 0).addScaledVector(_camRightDir, -0.28);
          camera.lookAt(_camTargetPos);
          const showcaseFov = computeAdaptiveVerticalFov(44, camera.aspect);
          if (Math.abs(camera.fov - showcaseFov) > 0.1) {
            camera.fov += (showcaseFov - camera.fov) * (1 - Math.exp(-6.5 * dt));
            camera.updateProjectionMatrix();
          }
        } else {
          _camDesiredPos.set(Math.sin(tourAngle) * 9.5, 5.2 + Math.sin(elapsed * 0.4) * 0.8, Math.cos(tourAngle) * 9.5);
          camera.position.lerp(_camDesiredPos, 1 - Math.exp(-4.5 * dt));
          camera.lookAt(0, 2.8, -10);
          const titleFov = computeAdaptiveVerticalFov(58, camera.aspect);
          if (Math.abs(camera.fov - titleFov) > 0.1) {
            camera.fov += (titleFov - camera.fov) * (1 - Math.exp(-4.5 * dt));
            camera.updateProjectionMatrix();
          }
        }
        audio.updateMotors(0, false, 0);
      } else if (cur.phase === 'playing') {
        if (!crashTumble.active) {
          activeSticks = sampleCombinedSticks(gpSample.sticks);
          const controllerSticks = sampleControllerSticks(gpSample.sticks);
          const armDt = Math.min(Math.max(rawDt, 0.001), 0.5);
          const armRes = stepArmingState(
            armingProgress,
            droneState.armed,
            droneState.crashed,
            keys.has('KeyV') || Boolean(cur.virtualArmHoldRef?.current),
            controllerSticks,
            armDt
          );
          armingProgress = armRes.armingProgress;
          if (armRes.justArmed) {
            droneState.armed = true;
            audio.playArmChime();
            lastHudEmitTime = 0;
          }

          const prevGateLocked = awaitingStickRelease;
          const gate = resolvePostArmStickGate(
            awaitingStickRelease,
            droneState.armed,
            armRes.justArmed,
            activeSticks
          );
          awaitingStickRelease = gate.awaitingStickRelease;
          if (prevGateLocked && !awaitingStickRelease) {
            lastHudEmitTime = 0;
          }
          const flightSticks = gate.flightSticks;

          if (!droneState.armed) {
            const ledHex = armingProgress > 0.5 ? 0x34d399 : 0xf59e0b;
            const ledPulse =
              armingProgress > 0
                ? 1.5 + Math.sin(elapsed * 22) * 1.1
                : 0.55 + (0.5 + 0.5 * Math.sin(elapsed * 3.8)) * 1.1;
            droneRig.frontLedMat.emissive.setHex(ledHex);
            droneRig.rearLedMat.emissive.setHex(ledHex);
            droneRig.frontLedMat.emissiveIntensity = ledPulse;
            droneRig.rearLedMat.emissiveIntensity = ledPulse;
          } else {
            droneRig.frontLedMat.emissive.setHex(0x38bdf8);
            droneRig.frontLedMat.emissiveIntensity = 2.2;
            droneRig.rearLedMat.emissive.setHex(0xef4444);
            droneRig.rearLedMat.emissiveIntensity = 2.2;
          }

          droneState = stepDronePhysics(
            droneState,
            flightSticks,
            { flightMode: cur.flightMode, windEnabled: cur.windEnabled, windTimeSec: elapsed, turbineAngle },
            dt
          );

          const stepRes = evaluateMissionStep(missionProgress, droneState, dt);
          missionProgress = stepRes.progress;

          if (stepRes.event === 'gate_passed') {
            audio.playGateChime();
            camShakeTrauma = Math.min(1, camShakeTrauma + 0.18);
          } else if (stepRes.event === 'completed') {
            audio.playSuccessFanfare();
            cur.onMissionComplete(missionProgress, droneState);
          } else if (stepRes.event === 'crashed') {
            const started = initCrashTumble(droneState);
            droneState = started.drone;
            crashTumble = started.tumble;
            crashMissionSnapshot = missionProgress;
            crashVisualYawAnchor = visualChaseYaw;
            crashStartWallMs = now;
            crashEffects.trigger(crashTumble.impactPos, droneState.velocity, crashTumble.brokenProps);
            audio.updateMotors(0, false, 0);
            audio.playCrashThud();
            camShakeTrauma = 1.0;

            droneRig.propellers.forEach((p, idx) => {
              p.visible = !crashTumble.brokenProps[idx];
            });
            droneRig.propBlurDiscs.forEach((d) => {
              d.visible = false;
            });
            droneRig.frontLedMat.emissive.setHex(0xef4444);
            droneRig.rearLedMat.emissive.setHex(0xef4444);
          }
        } else {
          const tumbleStep = stepCrashTumble(droneState, crashTumble, dt);
          droneState = tumbleStep.drone;
          crashTumble = tumbleStep.tumble;
          if (tumbleStep.groundImpactSpeed > 1.2) {
            audio.playSecondaryBounce(Math.min(1, tumbleStep.groundImpactSpeed / 6));
            camShakeTrauma = Math.min(1, camShakeTrauma + 0.35);
          }

          const blinkOn = Math.floor(crashTumble.elapsedSec * 14) % 2 === 0;
          droneRig.frontLedMat.emissiveIntensity = blinkOn ? 3.5 : 0.12;
          droneRig.rearLedMat.emissiveIntensity = blinkOn ? 3.5 : 0.12;

          if ((tumbleStep.finished || now - crashStartWallMs >= 1500) && crashMissionSnapshot) {
            crashTumble.modalTriggered = true;
            crashTumble.active = false;
            cur.onCrash(crashMissionSnapshot, droneState);
          }
        }

        crashEffects.update(dt);

        // Smooth coordinated yaw-bank visual lean + gimbal pan lead when turning (Q/E)
        const targetYawBank =
          crashTumble.active || droneState.onGround
            ? 0
            : Math.max(-0.22, Math.min(0.22, droneState.angVel.y * 0.085));
        visualYawBank += (targetYawBank - visualYawBank) * (1 - Math.exp(-10 * dt));
        if (!crashTumble.active) {
          visualChaseYaw += (droneState.yaw - visualChaseYaw) * (1 - Math.exp(-7.5 * dt));
        }

        // Apply drone transform (coordinated visual bank makes turns visibly fluid)
        droneRig.root.position.set(droneState.position.x, droneState.position.y, droneState.position.z);
        _euler.set(droneState.pitch, droneState.yaw, droneState.roll + visualYawBank, 'YXZ');
        droneRig.root.quaternion.setFromEuler(_euler);

        // Gimbal stabilization counter-tilt (or crooked/hanging after crash impact)
        const yawLead = droneState.onGround || crashTumble.active ? 0 : Math.max(-0.16, Math.min(0.16, droneState.angVel.y * 0.06));
        if (crashTumble.active) {
          droneRig.gimbalHead.rotation.set(-0.26, 0.18, 0.24);
        } else {
          droneRig.gimbalHead.rotation.x = cur.cameraMode === 'fpv' ? 0.12 : -droneState.pitch * 0.75;
          droneRig.gimbalHead.rotation.y = cur.cameraMode === 'fpv' ? yawLead * 0.5 : yawLead;
          droneRig.gimbalHead.rotation.z = cur.cameraMode === 'fpv' ? 0 : -(droneState.roll + visualYawBank * 0.45) * 0.75;
        }

        // Spin propellers proportional to motorPower (disarmed/stopped during crash)
        const rpmScale = droneState.armed && !crashTumble.active ? 14 + droneState.motorPower * 65 : 0;
        propAngle += dt * rpmScale;
        const showBlur = droneState.armed && !crashTumble.active && droneState.motorPower > 0.1;
        droneRig.propellers.forEach((p, idx) => {
          const dir = (p.userData.spinDir as number) || 1;
          p.rotation.y = propAngle * dir;
          droneRig.propBlurDiscs[idx].visible = showBlur && p.visible;
        });

        // Contact shadow tracking ground below drone
        const floorY = surfaceHeightAt(droneState.position.x, droneState.position.z, droneState.position.y);
        const agl = Math.max(0, droneState.position.y - floorY);
        droneRig.contactShadow.position.set(droneState.position.x, floorY + 0.025, droneState.position.z);
        const shadowScale = Math.max(0.35, 1.15 - agl * 0.06);
        droneRig.contactShadow.scale.setScalar(shadowScale);
        (droneRig.contactShadow.material as THREE.MeshBasicMaterial).opacity = Math.max(0.08, 0.72 - agl * 0.055);

        // Audio synthesis
        const speed = Math.hypot(droneState.velocity.x, droneState.velocity.y, droneState.velocity.z);
        audio.updateMotors(droneState.motorPower, droneState.armed && !droneState.crashed, speed);

        // Camera Modes: Chase, FPV
        if (cur.cameraMode === 'fpv') {
          droneRig.root.updateMatrixWorld(true);
          droneRig.fpvMount.getWorldPosition(_fpvWorldPos);
          droneRig.root.getWorldQuaternion(_fpvWorldQuat);

          // FPV camera uptilt: level (-0.02 rad) when stationary/hovering, compensating upward as nose dips forward
          const forwardDip = Math.max(0, -droneState.pitch);
          const fpvUptilt = -0.02 + forwardDip * 0.88;
          _fpvTiltEuler.set(fpvUptilt, yawLead * 0.35, 0, 'YXZ');
          _fpvTiltQuat.setFromEuler(_fpvTiltEuler);

          camera.position.copy(_fpvWorldPos);
          camera.quaternion.copy(_fpvWorldQuat).multiply(_fpvTiltQuat);
          const targetFov = computeAdaptiveVerticalFov(86 + Math.min(12, speed * 0.45), camera.aspect);
          if (Math.abs(camera.fov - targetFov) > 0.1) {
            camera.fov += (targetFov - camera.fov) * (1 - Math.exp(-8 * dt));
            camera.updateProjectionMatrix();
          }
          droneRig.root.visible = false;
        } else {
          // Chase Cam: anchors heading and pulls back slightly during crash tumble so impact is clearly visible
          droneRig.root.visible = true;
          const chaseHeading = crashTumble.active ? crashVisualYawAnchor : visualChaseYaw;
          _forwardDir.set(-Math.sin(chaseHeading), 0, -Math.cos(chaseHeading));
          _camDesiredPos
            .set(droneState.position.x, droneState.position.y, droneState.position.z)
            .addScaledVector(_forwardDir, crashTumble.active ? -5.4 : -4.4);
          _camDesiredPos.y += crashTumble.active ? 2.05 : 1.65;

          // Prevent camera from clipping below terrain
          const camGround = groundHeightAt(_camDesiredPos.x, _camDesiredPos.z);
          if (_camDesiredPos.y < camGround + 0.85) {
            _camDesiredPos.y = camGround + 0.85;
          }

          // Pull Chase Cam forward before clipping through nearby building/hangar/ruin walls
          _camRayOrigin.set(droneState.position.x, droneState.position.y + 0.25, droneState.position.z);
          _camRayDir.subVectors(_camDesiredPos, _camRayOrigin);
          const camDist = _camRayDir.length();
          if (camDist > 0.2 && world.environmentColliders.length > 0) {
            _nearbyColliders.length = 0;
            for (let i = 0; i < world.environmentColliders.length; i++) {
              const col = world.environmentColliders[i];
              const maxR = ((col.userData.cullRadius as number) || 8) + camDist + 1.0;
              if (col.position.distanceToSquared(_camRayOrigin) <= maxR * maxR) {
                _nearbyColliders.push(col);
              }
            }
            if (_nearbyColliders.length > 0) {
              _camRayDir.divideScalar(camDist);
              _camRaycaster.set(_camRayOrigin, _camRayDir);
              _camRaycaster.far = camDist;
              const hits = _camRaycaster.intersectObjects(_nearbyColliders, false);
              if (hits.length > 0) {
                const safeDist = Math.max(0.9, hits[0].distance - 0.35);
                _camDesiredPos.copy(_camRayOrigin).addScaledVector(_camRayDir, safeDist);
              }
            }
          }

          camera.position.lerp(_camDesiredPos, 1 - Math.exp(-8.5 * dt));
          if (crashTumble.active) {
            _camTargetPos.set(droneState.position.x, droneState.position.y + 0.25, droneState.position.z);
          } else {
            _camTargetPos
              .set(droneState.position.x, droneState.position.y + 0.45, droneState.position.z)
              .addScaledVector(_forwardDir, 4.2);
          }
          camera.lookAt(_camTargetPos);

          const targetFov = computeAdaptiveVerticalFov(62 + Math.min(10, speed * 0.4), camera.aspect);
          if (Math.abs(camera.fov - targetFov) > 0.1) {
            camera.fov += (targetFov - camera.fov) * (1 - Math.exp(-6 * dt));
            camera.updateProjectionMatrix();
          }
        }

        // Keep directional shadow frustum anchored around the active sector (quantized to 4m to avoid shimmer)
        if (!isSoftwareGl) {
          const sx = Math.round(droneState.position.x / 4) * 4;
          const sz = Math.round(droneState.position.z / 4) * 4;
          world.sunLight.target.position.set(sx, 0, sz);
          world.sunLight.position.copy(world.sunDirection).multiplyScalar(140).add(world.sunLight.target.position);
        }

        // Decaying trauma shake on impact/gate
        if (camShakeTrauma > 0.005) {
          const shake = camShakeTrauma * camShakeTrauma * 0.18;
          camera.position.x += (Math.random() - 0.5) * shake;
          camera.position.y += (Math.random() - 0.5) * shake;
          camShakeTrauma = Math.max(0, camShakeTrauma - dt * 2.2);
        }
      } else {
        // Paused or GameOver: silence motors smoothly and keep particles settling
        audio.updateMotors(0, false, 0);
        if (cur.phase === 'gameover') {
          crashEffects.update(dt);
        }
      }

      world.updateMissionVisuals(missionDef, missionProgress, elapsed);

      // Throttled HUD updates (~10Hz normal, ~20Hz while charging arming bar)
      const hudIntervalMs = armingProgress > 0 ? 45 : 95;
      if (now - lastHudEmitTime >= hudIntervalMs) {
        lastHudEmitTime = now;
        const telemetry = extractTelemetry(
          droneState,
          cur.flightMode,
          cur.cameraMode,
          {
            flightMode: cur.flightMode,
            windEnabled: cur.windEnabled,
            windTimeSec: elapsed,
          },
          armingProgress,
          awaitingStickRelease
        );
        cur.onHudUpdate(telemetry, missionProgress, activeSticks);
      }

      renderer.render(scene, camera);

      if (isSoftwareGl) {
        afterDraw(() => tick(performance.now()));
      } else {
        frameId = requestAnimationFrame(tick);
      }
    }

    frameId = requestAnimationFrame(tick);

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', clearKeys);
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('gamepadconnected', onGamepadChange);
      window.removeEventListener('gamepaddisconnected', onGamepadChange);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
      resizeObserver?.disconnect();
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      audio.dispose();
      crashEffects.dispose();
      droneRig.dispose();
      world.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return <div ref={mountRef} className="fixed inset-0 w-full h-full overflow-hidden" data-testid="drone-canvas-container" />;
}
