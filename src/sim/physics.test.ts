import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeBodyUpVector,
  createInitialDroneState,
  groundHeightAt,
  stepDronePhysics,
  surfaceHeightAt,
} from './physics';
import { createInitialMissionProgress, evaluateMissionStep } from './missions';
import { computeFloatingStickOrigin, computeFloatingStickValue } from './floatingStick';
import type { PhysicsConfig, StickInput } from './types';

const neutralInput: StickInput = { throttle: 0, yaw: 0, pitch: 0, roll: 0 };
const normalConfig: PhysicsConfig = { flightMode: 'normal', windEnabled: false, windTimeSec: 0 };

test('initial drone spawns safely on flat main helipad facing north (-Z)', () => {
  const state = createInitialDroneState();
  assert.equal(state.onGround, true);
  assert.equal(state.crashed, false);
  assert.equal(state.yaw, 0);
  assert.ok(state.position.y > 0.2 && state.position.y < 0.6);
  assert.equal(groundHeightAt(0, 0), 0);
  assert.ok(surfaceHeightAt(0, 0, 1) > 0);
});

test('drone survives first 2 seconds with zero input without crashing', () => {
  let state = createInitialDroneState();
  for (let i = 0; i < 120; i++) {
    state = stepDronePhysics(state, neutralInput, normalConfig, 1 / 60);
  }
  assert.equal(state.crashed, false);
  assert.equal(state.onGround, true);
  assert.ok(Math.abs(state.position.x) < 0.01);
  assert.ok(Math.abs(state.position.z) < 0.01);
});

test('positive throttle climbs and forward pitch moves toward -Z', () => {
  let state = createInitialDroneState();
  const climbInput: StickInput = { throttle: 0.85, yaw: 0, pitch: 0, roll: 0 };
  for (let i = 0; i < 90; i++) {
    state = stepDronePhysics(state, climbInput, normalConfig, 1 / 60);
  }
  assert.equal(state.onGround, false);
  assert.ok(state.position.y > 3.5, `Expected climb > 3.5m, got ${state.position.y}`);

  const forwardInput: StickInput = { throttle: 0, yaw: 0, pitch: 0.8, roll: 0 };
  const startZ = state.position.z;
  for (let i = 0; i < 90; i++) {
    state = stepDronePhysics(state, forwardInput, normalConfig, 1 / 60);
  }
  assert.ok(state.position.z < startZ - 2.0, `Expected forward (-Z) travel, got ${state.position.z}`);
});

test('acro mode rotates continuously without auto-leveling', () => {
  let state = createInitialDroneState();
  state.position.y = 20;
  state.onGround = false;

  const acroConfig: PhysicsConfig = { flightMode: 'acro', windEnabled: false, windTimeSec: 0 };
  const pitchCmd: StickInput = { throttle: 0.1, yaw: 0, pitch: 0.6, roll: 0 };
  for (let i = 0; i < 20; i++) {
    state = stepDronePhysics(state, pitchCmd, acroConfig, 1 / 60);
  }
  const tiltedPitch = state.pitch;
  assert.ok(Math.abs(tiltedPitch) > 0.3, 'Expected significant pitch tilt in Acro mode');

  // Release stick: Acro holds attitude instead of snapping back to 0
  for (let i = 0; i < 15; i++) {
    state = stepDronePhysics(state, neutralInput, acroConfig, 1 / 60);
  }
  assert.ok(Math.abs(state.pitch) > 0.25, 'Acro should not auto-level when stick is centered');
});

test('body up vector tilts forward (-Z) when pitch is negative', () => {
  const up = computeBodyUpVector(0, -0.5, 0);
  assert.ok(up.z < -0.4, `Expected negative Z thrust component, got ${up.z}`);
  assert.ok(up.y > 0.8, `Expected positive Y thrust component, got ${up.y}`);
});

test('hover_takeoff mission completes after holding inside target zone for 3s', () => {
  let progress = createInitialMissionProgress('hover_takeoff');
  const hoveringDrone = createInitialDroneState();
  hoveringDrone.onGround = false;
  hoveringDrone.position = { x: 0.5, y: 6.5, z: -0.5 };

  for (let i = 0; i < 190; i++) {
    const res = evaluateMissionStep(progress, hoveringDrone, 1 / 60);
    progress = res.progress;
  }
  assert.equal(progress.completed, true);
  assert.ok(progress.score >= 500);
});

test('gate_circuit mission advances sequentially through gates', () => {
  let progress = createInitialMissionProgress('gate_circuit');
  const drone = createInitialDroneState();
  drone.onGround = false;
  drone.position = { x: 0, y: 5.5, z: -22 };

  const res = evaluateMissionStep(progress, drone, 1 / 60);
  assert.equal(res.event, 'gate_passed');
  assert.equal(res.progress.gatesCleared, 1);
  assert.equal(res.progress.activeGateIndex, 1);
});

test('floating joystick centers exactly where user touches with zero initial drift', () => {
  const origin = computeFloatingStickOrigin(142, 218, { x: 0, y: 0 }, 72, false);
  const initialVal = computeFloatingStickValue(142, 218, origin, 72);
  assert.equal(initialVal.x, 0);
  assert.equal(initialVal.y, 0);

  const movedUp = computeFloatingStickValue(142, 218 - 36, origin, 72);
  assert.equal(movedUp.x, 0);
  assert.ok(Math.abs(movedUp.y - 0.5) < 1e-6);

  const clampedDiag = computeFloatingStickValue(142 + 200, 218 - 200, origin, 72);
  assert.ok(Math.abs(Math.hypot(clampedDiag.x, clampedDiag.y) - 1) < 1e-6);
});

test('floating joystick preserves sticky throttle smoothly on re-touch', () => {
  const origin = computeFloatingStickOrigin(100, 200, { x: 0, y: 0.5 }, 80, true);
  const initialVal = computeFloatingStickValue(100, 200, origin, 80);
  assert.equal(initialVal.x, 0);
  assert.ok(Math.abs(initialVal.y - 0.5) < 1e-6);
});
