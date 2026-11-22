import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WIND_TURBINES,
  WORLD_RADIUS,
  computeBodyUpVector,
  createInitialDroneState,
  getWorldTrees,
  groundHeightAt,
  stepDronePhysics,
  surfaceHeightAt,
} from './physics';
import { STRUCTURE_SLAB_ELEVATION, buildWorldStructures } from './structures';
import { MISSIONS, getMissionById, createInitialMissionProgress, evaluateMissionStep } from './missions';
import { computeFloatingStickOrigin, computeFloatingStickValue } from './floatingStick';
import {
  STICK_DEADZONE,
  formatGamepadLabel,
  mapStandardGamepadToSticks,
  pickPrimaryGamepad,
  rescaleStickAxis,
} from './gamepad';
import { CRASH_ANIMATION_DURATION_SEC, initCrashTumble, stepCrashTumble } from './crashAnimation';
import {
  CHANGELOG_ENTRIES,
  GAME_VERSION,
  filterChangelogEntries,
  isPatchVersion,
  isValidVersionFormat,
} from './changelog';
import {
  STICK_PACKET_BYTES,
  decodeBinaryStick,
  encodeBinaryStick,
  pickRelayTransport,
  sticksChangedSignificantly,
} from './stickProtocol';
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

test('expanded world supports wide-open flight beyond 250m', () => {
  assert.ok(WORLD_RADIUS >= 350);
  let drone = createInitialDroneState();
  drone.onGround = false;
  drone.position = { x: 240, y: 25, z: -200 };
  drone = stepDronePhysics(drone, neutralInput, normalConfig, 1 / 60);
  assert.equal(drone.crashed, false);
  assert.ok(drone.position.x > 235);
});

test('structure_slalom openings are genuinely unobstructed for precision flight', () => {
  const slalom = getMissionById('structure_slalom');
  assert.equal(slalom.gates.length, 8);
  for (const g of slalom.gates) {
    // Fly straight through each gate along its yaw axis for 14m (-7m to +7m)
    const dirX = -Math.sin(g.yaw);
    const dirZ = -Math.cos(g.yaw);
    let drone = createInitialDroneState();
    drone.onGround = false;
    drone.yaw = g.yaw;
    drone.position = { x: g.x - dirX * 7, y: g.y, z: g.z - dirZ * 7 };
    drone.velocity = { x: dirX * 7, y: 0, z: dirZ * 7 };

    for (let i = 0; i < 120; i++) {
      drone = stepDronePhysics(drone, { throttle: 0, yaw: 0, pitch: 0.25, roll: 0 }, normalConfig, 1 / 60);
      assert.equal(drone.crashed, false, `Unexpected collision passing through gate (${g.x}, ${g.y}, ${g.z})`);
    }
  }
});

test('abandoned house brick wall crashes at high speed and bounces gently at low speed', () => {
  // Two-story house at (-82, -48), yaw 0.35; front left brick pier sits at local (-4.5, 1.7, 4.8)
  const yaw = 0.35;
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const lx = -4.5;
  const lz = 4.8;
  const wallX = -82 + lx * c + lz * s;
  const wallZ = -48 - lx * s + lz * c;
  const baseY = groundHeightAt(-82, -48) + STRUCTURE_SLAB_ELEVATION;

  // High speed slam (14 m/s from 1.2m outside the wall) -> crashes
  let fastDrone = createInitialDroneState();
  fastDrone.onGround = false;
  fastDrone.position = { x: wallX + s * 1.2, y: baseY + 1.7, z: wallZ + c * 1.2 };
  fastDrone.velocity = { x: -s * 14, y: 0, z: -c * 14 };

  for (let i = 0; i < 20; i++) {
    fastDrone = stepDronePhysics(fastDrone, neutralInput, normalConfig, 1 / 60);
    if (fastDrone.crashed) break;
  }
  assert.equal(fastDrone.crashed, true, 'Expected high-speed wall impact to crash');

  // Gentle bump (3 m/s from 1.0m outside the wall) -> rebounds without crashing
  let slowDrone = createInitialDroneState();
  slowDrone.onGround = false;
  slowDrone.position = { x: wallX + s * 1.0, y: baseY + 1.7, z: wallZ + c * 1.0 };
  slowDrone.velocity = { x: -s * 3, y: 0, z: -c * 3 };

  for (let i = 0; i < 30; i++) {
    slowDrone = stepDronePhysics(slowDrone, neutralInput, normalConfig, 1 / 60);
  }
  assert.equal(slowDrone.crashed, false, 'Expected gentle wall bump to bounce instead of crashing');
});

test('no two boxes in buildWorldStructures overlap in 3D volume (zero Z-fighting seams)', () => {
  const { parts } = buildWorldStructures(groundHeightAt);
  for (let i = 0; i < parts.length; i++) {
    for (let j = i + 1; j < parts.length; j++) {
      const a = parts[i];
      const b = parts[j];
      if (Math.abs(a.yaw - b.yaw) > 1e-4) continue;
      // Compare in shared local space
      const c = Math.cos(a.yaw);
      const s = Math.sin(a.yaw);
      const dx = b.cx - a.cx;
      const dy = b.cy - a.cy;
      const dz = b.cz - a.cz;
      const lx = Math.abs(dx * c - dz * s);
      const lz = Math.abs(dx * s + dz * c);
      const ly = Math.abs(dy);

      const ox = a.hx + b.hx - lx;
      const oy = a.hy + b.hy - ly;
      const oz = a.hz + b.hz - lz;
      assert.ok(
        !(ox > 0.005 && oy > 0.005 && oz > 0.005),
        `Overlapping structure boxes detected at yaw=${a.yaw}: (${a.cx.toFixed(2)},${a.cy.toFixed(2)},${a.cz.toFixed(2)}) [${a.material}] vs (${b.cx.toFixed(2)},${b.cy.toFixed(2)},${b.cz.toFixed(2)}) [${b.material}] overlap=(${ox.toFixed(3)},${oy.toFixed(3)},${oz.toFixed(3)})`
      );
    }
  }
});

test('wind turbine mast and spinning blades have real hitboxes', () => {
  const wt = WIND_TURBINES[3]; // (85, -225)
  const baseY = groundHeightAt(wt.x, wt.z);

  // 1. Slam into mast at mid-height
  let mastDrone = createInitialDroneState();
  mastDrone.onGround = false;
  mastDrone.position = { x: wt.x + 1.8, y: baseY + 14, z: wt.z };
  mastDrone.velocity = { x: -12, y: 0, z: 0 };
  for (let i = 0; i < 20; i++) {
    mastDrone = stepDronePhysics(mastDrone, neutralInput, normalConfig, 1 / 60);
    if (mastDrone.crashed) break;
  }
  assert.equal(mastDrone.crashed, true, 'Expected wind turbine mast impact to crash');

  // 2. Contact spinning blade #0 (pointing straight up +Y at rotorAngle=0) 6m above hub
  const c = Math.cos(wt.yaw);
  const s = Math.sin(wt.yaw);
  // Hub is at local (0, 28.2, 2.4); blade #0 at 6m up is local (0, 34.2, 2.4)
  const worldBladeX = wt.x + 2.4 * s;
  const worldBladeZ = wt.z + 2.4 * c;
  let bladeDrone = createInitialDroneState();
  bladeDrone.onGround = false;
  bladeDrone.position = { x: worldBladeX, y: baseY + 34.2, z: worldBladeZ };
  bladeDrone = stepDronePhysics(bladeDrone, neutralInput, { ...normalConfig, turbineAngle: 0 }, 1 / 60);
  assert.equal(bladeDrone.crashed, true, 'Expected contact with spinning turbine blade to crash');
});

test('every structure floor slab clears local terrain cleanly to prevent floor Z-fighting', () => {
  const { parts } = buildWorldStructures(groundHeightAt);
  // Check every non-shadow-casting foundation/floor slab across its center + 4 corners
  const slabs = parts.filter((p) => !p.castShadow);
  assert.ok(slabs.length >= 10, 'Expected foundation/floor slabs to audit');
  for (const slab of slabs) {
    const topY = slab.cy + slab.hy;
    const c = Math.cos(slab.yaw);
    const s = Math.sin(slab.yaw);
    for (const sx of [-1, 0, 1]) {
      for (const sz of [-1, 0, 1]) {
        const lx = sx * slab.hx;
        const lz = sz * slab.hz;
        const wx = slab.cx + lx * c + lz * s;
        const wz = slab.cz - lx * s + lz * c;
        const gy = groundHeightAt(wx, wz);
        assert.ok(
          topY - gy >= 0.25,
          `Floor slab (${slab.cx.toFixed(1)},${slab.cz.toFixed(1)}) topY=${topY.toFixed(2)} too close to groundY=${gy.toFixed(2)} at (${wx.toFixed(1)},${wz.toFixed(1)})`
        );
      }
    }
  }
});

test('no structure-mounted ring torus clips through bars, walls, or floors', () => {
  const { parts } = buildWorldStructures(groundHeightAt);
  for (const missionId of ['structure_slalom', 'free_flight'] as const) {
    const mission = getMissionById(missionId);
    for (const g of mission.gates) {
      if (!g.noPylons) continue;
      const ringRadius = g.radius * 0.68;
      const tubeMargin = 0.14;
      const gc = Math.cos(g.yaw);
      const gs = Math.sin(g.yaw);

      for (let k = 0; k < 24; k++) {
        const theta = (k * Math.PI * 2) / 24;
        const rlx = Math.cos(theta) * ringRadius;
        const rly = Math.sin(theta) * ringRadius;
        const px = g.x + rlx * gc;
        const py = g.y + rly;
        const pz = g.z - rlx * gs;

        for (const box of parts) {
          const dx = px - box.cx;
          const dy = py - box.cy;
          const dz = pz - box.cz;
          const bc = Math.cos(box.yaw);
          const bs = Math.sin(box.yaw);
          const blx = dx * bc - dz * bs;
          const blz = dx * bs + dz * bc;
          const penX = box.hx + tubeMargin - Math.abs(blx);
          const penY = box.hy + tubeMargin - Math.abs(dy);
          const penZ = box.hz + tubeMargin - Math.abs(blz);
          assert.ok(
            !(penX > 0 && penY > 0 && penZ > 0),
            `Gate torus in ${missionId} at (${g.x},${g.y.toFixed(2)},${g.z}) intersects [${box.material}] at (${box.cx.toFixed(1)},${box.cy.toFixed(1)},${box.cz.toFixed(1)})`
          );
        }
      }
    }
  }
});

test('Q/E yaw turning accelerates smoothly and eases out when released', () => {
  let drone = createInitialDroneState();
  drone.onGround = false;
  drone.position = { x: 0, y: 12, z: 0 };

  // Frame 1 with yaw right held: angVel.y ramps smoothly instead of jumping straight to max
  drone = stepDronePhysics(drone, { throttle: 0, yaw: 1, pitch: 0, roll: 0 }, normalConfig, 1 / 60);
  const firstFrameRate = Math.abs(drone.angVel.y);
  assert.ok(firstFrameRate > 0.05 && firstFrameRate < 1.0, `Expected smooth ramp on frame 1, got ${firstFrameRate}`);

  for (let i = 0; i < 30; i++) {
    drone = stepDronePhysics(drone, { throttle: 0, yaw: 1, pitch: 0, roll: 0 }, normalConfig, 1 / 60);
  }
  const steadyRate = Math.abs(drone.angVel.y);
  assert.ok(steadyRate > 1.8, `Expected full yaw rate after ramp, got ${steadyRate}`);

  // Release Q/E: rotational inertia decays smoothly rather than snapping to 0 in one frame
  drone = stepDronePhysics(drone, neutralInput, normalConfig, 1 / 60);
  assert.ok(Math.abs(drone.angVel.y) > 0.5 && Math.abs(drone.angVel.y) < steadyRate);
});

test('all pine trees have real trunk and foliage cone collisions and keep gates clear', () => {
  const trees = getWorldTrees();
  assert.ok(trees.length > 50, 'Expected generated world trees');
  const t = trees[0];

  // 1. High-speed slam into tree trunk crashes
  let trunkSlam = createInitialDroneState();
  trunkSlam.onGround = false;
  trunkSlam.position = { x: t.x + 1.2, y: t.baseY + 1.2 * t.scale, z: t.z };
  trunkSlam.velocity = { x: -12, y: 0, z: 0 };
  for (let i = 0; i < 20; i++) {
    trunkSlam = stepDronePhysics(trunkSlam, neutralInput, normalConfig, 1 / 60);
    if (trunkSlam.crashed) break;
  }
  assert.equal(trunkSlam.crashed, true, 'Expected high-speed tree trunk impact to crash');

  // 2. High-speed fly into pine cone foliage crashes
  let foliageSlam = createInitialDroneState();
  foliageSlam.onGround = false;
  foliageSlam.position = { x: t.x + 2.5 * t.scale, y: t.baseY + 3.5 * t.scale, z: t.z };
  foliageSlam.velocity = { x: -12, y: 0, z: 0 };
  for (let i = 0; i < 20; i++) {
    foliageSlam = stepDronePhysics(foliageSlam, neutralInput, normalConfig, 1 / 60);
    if (foliageSlam.crashed) break;
  }
  assert.equal(foliageSlam.crashed, true, 'Expected high-speed pine foliage impact to crash');

  // 3. Low-speed touch against pine foliage bounces cleanly without crashing
  let foliageTouch = createInitialDroneState();
  foliageTouch.onGround = false;
  foliageTouch.position = { x: t.x + 2.0 * t.scale, y: t.baseY + 3.5 * t.scale, z: t.z };
  foliageTouch.velocity = { x: -3, y: 0, z: 0 };
  for (let i = 0; i < 25; i++) {
    foliageTouch = stepDronePhysics(foliageTouch, neutralInput, normalConfig, 1 / 60);
  }
  assert.equal(foliageTouch.crashed, false, 'Expected gentle foliage brush to bounce without crashing');
  assert.ok(foliageTouch.position.x > t.x + 1.5 * t.scale, 'Expected foliage collision to push drone out');

  // 4. Verify no mission gate intersects any tree cone or trunk
  for (const mission of MISSIONS) {
    for (const g of mission.gates) {
      for (const tree of trees) {
        const horizD = Math.hypot(g.x - tree.x, g.z - tree.z);
        const topY = tree.baseY + 8.0 * tree.scale;
        if (g.y <= topY + 1.0 && horizD < 2.1 * tree.scale + 1.5) {
          assert.fail(`Tree at (${tree.x.toFixed(1)},${tree.z.toFixed(1)}) blocks gate in ${mission.id}`);
        }
      }
    }
  }
});

test('Xbox/DS4 gamepad stick deadzone and smooth Mode-2 axis mapping', () => {
  assert.equal(rescaleStickAxis(0.05), 0);
  assert.equal(rescaleStickAxis(-0.07), 0);
  assert.equal(rescaleStickAxis(Number.NaN), 0);
  assert.equal(rescaleStickAxis(1), 1);
  assert.equal(rescaleStickAxis(-1), -1);

  // Value slightly past deadzone rescales smoothly starting near 0 without jump
  const justPast = rescaleStickAxis(STICK_DEADZONE + 0.02);
  assert.ok(justPast > 0 && justPast < 0.05, `Expected smooth start after deadzone, got ${justPast}`);

  // Neutral sticks with minor DS4/Xbox center drift map to exact 0
  const drifted = mapStandardGamepadToSticks([0.04, -0.05, -0.03, 0.06]);
  assert.deepEqual(drifted, { throttle: 0, yaw: 0, pitch: 0, roll: 0 });

  // Mode 2 sticks: Left Up (-Y) -> +throttle, Left Right (+X) -> +yaw,
  // Right Up (-Y) -> +pitch forward, Right Left (-X) -> -roll left
  const active = mapStandardGamepadToSticks([1, -1, -1, -1]);
  assert.deepEqual(active, { throttle: 1, yaw: 1, pitch: 1, roll: -1 });

  // Drives drone physics cleanly (climb + pitch forward) using only sticks
  let drone = createInitialDroneState();
  const stickCmd = mapStandardGamepadToSticks([0, -0.85, 0, -0.6]);
  for (let i = 0; i < 60; i++) {
    drone = stepDronePhysics(drone, stickCmd, normalConfig, 1 / 60);
  }
  assert.ok(drone.position.y > 1.5, `Expected drone to climb with left stick up, got y=${drone.position.y}`);
  assert.ok(drone.position.z < -0.5, `Expected drone to pitch/fly north with right stick up, got z=${drone.position.z}`);
});

test('pickPrimaryGamepad prioritizes connected standard controllers and supports Bluetooth fallback', () => {
  const disconnected = { id: 'Xbox 360 Controller', connected: false, mapping: 'standard', axes: [0, 0, 0, 0] };
  const btRaw = { id: 'Wireless Controller (Vendor: 054c Product: 09cc)', connected: true, mapping: '', axes: [0, 0, 0, 0] };
  const xinput = {
    id: 'Xbox 360 Controller (XInput STANDARD GAMEPAD)',
    connected: true,
    mapping: 'standard',
    axes: [0, 0, 0, 0],
  };

  assert.equal(pickPrimaryGamepad([null, disconnected]), null);
  assert.equal(pickPrimaryGamepad([disconnected, btRaw]), btRaw);
  assert.equal(pickPrimaryGamepad([btRaw, xinput]), xinput);
  assert.equal(formatGamepadLabel(xinput.id), 'Xbox 360 Controller');
  assert.equal(formatGamepadLabel(btRaw.id), 'Wireless Controller');
});

test('crash animation tumbles mid-air drone, breaks propellers, bounces on ground, and completes cleanly', () => {
  const crashedState = createInitialDroneState();
  crashedState.onGround = false;
  crashedState.crashed = true;
  crashedState.position = { x: 0, y: 12, z: -20 };
  crashedState.velocity = { x: 2, y: -1, z: -11 };

  const started = initCrashTumble(crashedState);
  let drone = started.drone;
  let tumble = started.tumble;

  assert.equal(tumble.active, true);
  assert.equal(drone.armed, false);
  assert.equal(drone.motorPower, 0);
  assert.ok(tumble.brokenProps.filter(Boolean).length >= 2, 'Expected at least 2 broken propellers');

  const initialPitch = drone.pitch;
  const initialRoll = drone.roll;
  let finished = false;
  let minGroundY = Number.POSITIVE_INFINITY;

  // Step 1.3s at 60Hz
  for (let i = 0; i < 80; i++) {
    const res = stepCrashTumble(drone, tumble, 1 / 60);
    drone = res.drone;
    tumble = res.tumble;
    minGroundY = Math.min(minGroundY, drone.position.y);
    if (res.finished) finished = true;
  }

  assert.ok(tumble.elapsedSec >= CRASH_ANIMATION_DURATION_SEC);
  assert.equal(finished, true, 'Expected crash tumble sequence to finish after duration');
  assert.ok(
    Math.abs(drone.pitch - initialPitch) > 1.0 && Math.abs(drone.roll - initialRoll) > 1.0,
    'Expected visible tumble rotation across pitch and roll'
  );
  const floorY = surfaceHeightAt(drone.position.x, drone.position.z, drone.position.y);
  assert.ok(drone.position.y >= floorY + 0.14, 'Expected crashed drone never to sink below terrain');
});

test('changelog follows V1.X / V1.X.Y versioning rules and filters cleanly', () => {
  assert.equal(GAME_VERSION, CHANGELOG_ENTRIES[0].version);
  assert.ok(CHANGELOG_ENTRIES.length >= 6);

  const seen = new Set<string>();
  for (const entry of CHANGELOG_ENTRIES) {
    assert.ok(isValidVersionFormat(entry.version), `Invalid version string: ${entry.version}`);
    assert.equal(seen.has(entry.version), false, `Duplicate version: ${entry.version}`);
    seen.add(entry.version);
    assert.ok(entry.changes.length >= 2, `Expected detailed changes in ${entry.version}`);
    if (entry.kind === 'fix') {
      assert.equal(isPatchVersion(entry.version), true, `Fix release ${entry.version} must use V1.X.Y format`);
    } else {
      assert.equal(isPatchVersion(entry.version), false, `Feature/major release ${entry.version} must use V1.X format`);
    }
  }

  const fixes = filterChangelogEntries(CHANGELOG_ENTRIES, 'fixes');
  const features = filterChangelogEntries(CHANGELOG_ENTRIES, 'features');
  assert.ok(fixes.length >= 3);
  assert.ok(features.length >= 4);
  assert.equal(fixes.length + features.length, CHANGELOG_ENTRIES.length);
});

test('9-byte binary stick protocol round-trips accurately and rejects invalid packets', () => {
  const sample: StickInput = { throttle: 0.735, yaw: -0.42, pitch: 1, roll: -1 };
  const packet = encodeBinaryStick(sample);
  assert.equal(packet.byteLength, STICK_PACKET_BYTES);

  const decoded = decodeBinaryStick(packet);
  assert.ok(decoded !== null);
  assert.ok(Math.abs(decoded.throttle - sample.throttle) < 0.0001);
  assert.ok(Math.abs(decoded.yaw - sample.yaw) < 0.0001);
  assert.equal(decoded.pitch, 1);
  assert.equal(decoded.roll, -1);

  // Neutral zero round-trip
  const zeroDecoded = decodeBinaryStick(encodeBinaryStick(neutralInput));
  assert.deepEqual(zeroDecoded, neutralInput);

  // Reject wrong size or header
  assert.equal(decodeBinaryStick(new Uint8Array(4)), null);
  const badHeader = encodeBinaryStick(neutralInput);
  badHeader[0] = 0xff;
  assert.equal(decodeBinaryStick(badHeader), null);
});

test('stick change detector always triggers on zero-release and prefers WebRTC P2P when open', () => {
  const base: StickInput = { throttle: 0.5, yaw: 0.001, pitch: 0, roll: 0 };
  // Tiny sub-epsilon change is ignored
  assert.equal(sticksChangedSignificantly({ throttle: 0.5005, yaw: 0.0012, pitch: 0, roll: 0 }, base), false);
  // Exact return to zero always fires immediately (even from small values!)
  assert.equal(sticksChangedSignificantly({ throttle: 0.5, yaw: 0, pitch: 0, roll: 0 }, base), true);

  assert.equal(pickRelayTransport('open', 1), 'webrtc');
  assert.equal(pickRelayTransport('connecting', 1), 'ws');
  assert.equal(pickRelayTransport(null, 1), 'ws');
  assert.equal(pickRelayTransport('closed', 3), 'none');
});


