import type {
  DronePhysicsState,
  DroneTelemetry,
  FlightMode,
  PhysicsConfig,
  StickInput,
  Vec3,
} from './types';

export const WORLD_RADIUS = 148;
export const DRONE_SKID_HEIGHT = 0.22;

export interface LandingPlatform {
  x: number;
  z: number;
  topY: number;
  radius: number;
}

export const ELEVATED_PAD: LandingPlatform = {
  x: 42,
  z: -48,
  topY: 4.0,
  radius: 4.2,
};

export const MAIN_HELIPAD: LandingPlatform = {
  x: 0,
  z: 0,
  topY: 0.14,
  radius: 4.5,
};

export const RADIO_TOWER = {
  x: -28,
  z: -62,
  radius: 2.2,
  height: 28,
};

/**
 * Deterministic open-world terrain elevation at (x, z).
 * Central airfield (r < 34m) is graded flat at y = 0 for safe takeoff/landing.
 * Lake basin in NE quadrant dips below water level (-1.6m).
 * Outer perimeter (r > 125m) rises smoothly into natural coastal mountains.
 */
export function groundHeightAt(x: number, z: number): number {
  const r = Math.hypot(x, z);

  // Rolling gentle hills beyond the flat airfield
  const hillMask = smoothstep(32, 62, r);
  const hills =
    (Math.sin(x * 0.038) * Math.cos(z * 0.034) * 3.8 +
      Math.sin((x + z) * 0.022) * 2.4 +
      Math.cos(x * 0.075 - z * 0.06) * 1.1) *
    hillMask;

  // Lake depression in the East/Northeast valley (centered around x=66, z=-10)
  const lakeDist = Math.hypot(x - 66, z + 10);
  const lakeDip = (1 - smoothstep(14, 34, lakeDist)) * -4.2;

  // Elevated pad mound blend
  const padDist = Math.hypot(x - ELEVATED_PAD.x, z - ELEVATED_PAD.z);
  const padClear = smoothstep(7, 14, padDist);

  // Natural mountain perimeter ridge beyond r = 122m
  const ridgeMask = smoothstep(118, 165, r);
  const ridgeNoise = 1 + 0.25 * Math.sin(Math.atan2(z, x) * 7) + 0.15 * Math.cos(Math.atan2(z, x) * 13);
  const mountain = ridgeMask * 26 * ridgeNoise;

  return Math.max(-3.6, (hills + lakeDip) * padClear + mountain);
}

/**
 * Returns the highest solid landing surface at (x, z) including the main helipad
 * and elevated concrete training platform.
 */
export function surfaceHeightAt(x: number, z: number, currentY?: number): number {
  let h = groundHeightAt(x, z);
  const mainDist = Math.hypot(x - MAIN_HELIPAD.x, z - MAIN_HELIPAD.z);
  if (mainDist <= MAIN_HELIPAD.radius) {
    h = Math.max(h, MAIN_HELIPAD.topY);
  }
  const elevDist = Math.hypot(x - ELEVATED_PAD.x, z - ELEVATED_PAD.z);
  if (elevDist <= ELEVATED_PAD.radius && (currentY === undefined || currentY >= ELEVATED_PAD.topY - 0.5)) {
    h = Math.max(h, ELEVATED_PAD.topY);
  }
  return h;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function applyDeadzoneAndExpo(value: number, deadzone = 0.06, expo = 0.35): number {
  const clamped = clamp(value, -1, 1);
  const abs = Math.abs(clamped);
  if (abs <= deadzone) return 0;
  const norm = (abs - deadzone) / (1 - deadzone);
  const curved = (1 - expo) * norm + expo * norm * norm * norm;
  return Math.sign(clamped) * curved;
}

export function createInitialDroneState(): DronePhysicsState {
  const startY = surfaceHeightAt(0, 0, 1) + DRONE_SKID_HEIGHT;
  return {
    position: { x: 0, y: startY, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    yaw: 0, // Facing -Z (north toward training gates & radio tower)
    pitch: 0,
    roll: 0,
    angVel: { x: 0, y: 0, z: 0 },
    motorPower: 0,
    armed: true,
    onGround: true,
    crashed: false,
    batteryPct: 100,
    flightTimeSec: 0,
    maxAltitudeReached: 0,
    maxSpeedReached: 0,
  };
}

export function getWindVector(timeSec: number, enabled: boolean): Vec3 {
  if (!enabled) return { x: 0, y: 0, z: 0 };
  const gust = 2.4 + Math.sin(timeSec * 0.45) * 1.1 + Math.cos(timeSec * 1.1) * 0.5;
  const angle = 0.7 + Math.sin(timeSec * 0.12) * 0.35;
  return {
    x: Math.cos(angle) * gust,
    y: 0,
    z: Math.sin(angle) * gust,
  };
}

/**
 * Advances quadcopter rigid-body aerodynamics by dt seconds.
 * Coordinate system: Three.js right-handed (+Y up, -Z forward at yaw=0, +X right).
 * Pitch forward = negative rotation around local X (-pitch), nose tilts down toward -Z.
 * Roll right = negative rotation around local Z (-roll), right wing dips toward +X.
 */
export function stepDronePhysics(
  prev: DronePhysicsState,
  rawInput: StickInput,
  config: PhysicsConfig,
  rawDt: number
): DronePhysicsState {
  const dt = Math.min(Math.max(rawDt, 0.0001), 0.05);
  const next: DronePhysicsState = {
    ...prev,
    position: { ...prev.position },
    velocity: { ...prev.velocity },
    angVel: { ...prev.angVel },
  };

  if (next.crashed) {
    next.motorPower = 0;
    return next;
  }

  const throttleIn = clamp(rawInput.throttle, -1, 1);
  const yawIn = applyDeadzoneAndExpo(rawInput.yaw, 0.05, 0.3);
  const pitchIn = applyDeadzoneAndExpo(rawInput.pitch, 0.05, 0.35);
  const rollIn = applyDeadzoneAndExpo(rawInput.roll, 0.05, 0.35);

  const batteryEmpty = next.batteryPct <= 0.1;
  const effectiveArmed = next.armed && !batteryEmpty;

  const gravity = 9.81;
  const wind = getWindVector(config.windTimeSec, config.windEnabled);
  const floorY = surfaceHeightAt(next.position.x, next.position.z, next.position.y);
  const agl = Math.max(0, next.position.y - DRONE_SKID_HEIGHT - floorY);

  if (!effectiveArmed) {
    next.motorPower = Math.max(0, next.motorPower - dt * 4);
    next.velocity.y -= gravity * dt;
    next.velocity.x *= Math.exp(-1.5 * dt);
    next.velocity.z *= Math.exp(-1.5 * dt);
  } else if (config.flightMode === 'acro') {
    // ACRO / FPV RATE MODE: Sticks control angular rates; no auto-leveling!
    const maxPitchRate = 4.2; // rad/s (~240 deg/s)
    const maxRollRate = 4.8;
    const maxYawRate = 3.6;

    const targetRateX = -pitchIn * maxPitchRate;
    const targetRateZ = -rollIn * maxRollRate;
    const targetRateY = -yawIn * maxYawRate;

    const rateResponse = 1 - Math.exp(-14 * dt);
    next.angVel.x += (targetRateX - next.angVel.x) * rateResponse;
    next.angVel.y += (targetRateY - next.angVel.y) * rateResponse;
    next.angVel.z += (targetRateZ - next.angVel.z) * rateResponse;

    if (!next.onGround || throttleIn > -0.85) {
      next.yaw += next.angVel.y * dt;
      next.pitch = clamp(next.pitch + next.angVel.x * dt, -Math.PI * 0.95, Math.PI * 0.95);
      next.roll = clamp(next.roll + next.angVel.z * dt, -Math.PI * 0.95, Math.PI * 0.95);
    }

    // Throttle maps -1..+1 -> 0..1 thrust (hover ~0.46)
    const targetThrustNorm = clamp((throttleIn + 1) * 0.5, 0, 1);
    next.motorPower += (targetThrustNorm - next.motorPower) * (1 - Math.exp(-16 * dt));

    // Max thrust-to-weight ratio ~2.2g for crisp FPV climbs
    const groundEffect = 1 + 0.14 * Math.exp(-agl * 1.8);
    const thrustAccel = next.motorPower * 21.5 * groundEffect;

    const upVec = computeBodyUpVector(next.yaw, next.pitch, next.roll);
    const ax = upVec.x * thrustAccel;
    const ay = upVec.y * thrustAccel - gravity;
    const az = upVec.z * thrustAccel;

    // Quadratic-style air drag relative to wind
    const relVx = next.velocity.x - wind.x;
    const relVy = next.velocity.y - wind.y;
    const relVz = next.velocity.z - wind.z;
    const drag = 0.28;

    next.velocity.x += (ax - relVx * drag) * dt;
    next.velocity.y += (ay - relVy * drag * 0.85) * dt;
    next.velocity.z += (az - relVz * drag) * dt;
  } else {
    // NORMAL (GPS Stabilized) or SPORT (Angle Mode)
    const isNormal = config.flightMode === 'normal';
    const maxTiltRad = isNormal ? 0.48 : 0.78; // ~27.5 deg vs ~44.7 deg
    const maxYawRate = isNormal ? 2.1 : 3.2; // rad/s
    const maxClimb = isNormal ? 6.5 : 10.5;
    const maxDescend = isNormal ? 4.5 : 7.0;

    const targetPitch = -pitchIn * maxTiltRad;
    const targetRoll = -rollIn * maxTiltRad;
    const tiltLambda = isNormal ? 9.5 : 12.5;
    const tiltAlpha = 1 - Math.exp(-tiltLambda * dt);

    next.pitch += (targetPitch - next.pitch) * tiltAlpha;
    next.roll += (targetRoll - next.roll) * tiltAlpha;
    next.yaw += -yawIn * maxYawRate * dt;

    // Vertical velocity target with altitude hold around deadzone
    const thrDead = applyDeadzoneAndExpo(throttleIn, 0.08, 0.2);
    let desiredVy = 0;
    if (thrDead > 0) desiredVy = thrDead * maxClimb;
    else if (thrDead < 0) desiredVy = thrDead * maxDescend;

    // If on ground and throttle <= 0, stay seated cleanly
    if (next.onGround && thrDead <= 0.02) {
      next.motorPower += (0.12 - next.motorPower) * (1 - Math.exp(-10 * dt));
      next.velocity.y = Math.min(0, next.velocity.y);
      next.pitch *= Math.exp(-10 * dt);
      next.roll *= Math.exp(-10 * dt);
    } else {
      const vyLambda = isNormal ? 5.2 : 3.6;
      const vyError = desiredVy - next.velocity.y;
      const upVec = computeBodyUpVector(next.yaw, next.pitch, next.roll);

      // Desired vertical acceleration + tilt-compensated thrust
      const tiltFactor = Math.max(0.45, upVec.y);
      const requiredAy = gravity + vyError * vyLambda;
      // Keep a minimum idle thrust in air so lateral attitude remains responsive while braking a climb
      const thrustAccel = clamp(requiredAy / tiltFactor, 3.2, isNormal ? 18.5 : 23.0);
      next.motorPower += (clamp(thrustAccel / 20.0, 0.14, 1) - next.motorPower) * (1 - Math.exp(-14 * dt));

      const horizScale = isNormal ? 1.75 : 1.85;
      const ax = upVec.x * thrustAccel * horizScale;
      const az = upVec.z * thrustAccel * horizScale;

      // GPS position-hold damping when right stick is centered in Normal mode
      const rightStickMag = Math.hypot(pitchIn, rollIn);
      const gpsHoldDrag = isNormal && rightStickMag < 0.05 ? 2.4 : isNormal ? 0.85 : 0.5;
      // GPS counteracts wind drift in Normal mode
      const windInfluence = isNormal ? 0.12 : 0.75;
      const effWindX = wind.x * windInfluence;
      const effWindZ = wind.z * windInfluence;

      next.velocity.x += (ax - (next.velocity.x - effWindX) * gpsHoldDrag) * dt;
      next.velocity.z += (az - (next.velocity.z - effWindZ) * gpsHoldDrag) * dt;
      next.velocity.y += (upVec.y * thrustAccel - gravity - next.velocity.y * 0.25) * dt;
    }
  }

  // Integrate position
  next.position.x += next.velocity.x * dt;
  next.position.y += next.velocity.y * dt;
  next.position.z += next.velocity.z * dt;

  // World boundary soft containment (natural ridge boundary)
  const radialDist = Math.hypot(next.position.x, next.position.z);
  if (radialDist > WORLD_RADIUS) {
    const scale = WORLD_RADIUS / radialDist;
    next.position.x *= scale;
    next.position.z *= scale;
    const nx = next.position.x / WORLD_RADIUS;
    const nz = next.position.z / WORLD_RADIUS;
    const outward = next.velocity.x * nx + next.velocity.z * nz;
    if (outward > 0) {
      next.velocity.x -= outward * nx * 1.4;
      next.velocity.z -= outward * nz * 1.4;
    }
  }

  // Radio tower cylindrical obstacle collision
  const towerDist = Math.hypot(next.position.x - RADIO_TOWER.x, next.position.z - RADIO_TOWER.z);
  if (towerDist < RADIO_TOWER.radius + 0.5 && next.position.y < RADIO_TOWER.height) {
    const impactSpeed = Math.hypot(next.velocity.x, next.velocity.z);
    if (impactSpeed > 8.5) {
      next.crashed = true;
    } else {
      const nx = (next.position.x - RADIO_TOWER.x) / Math.max(towerDist, 0.01);
      const nz = (next.position.z - RADIO_TOWER.z) / Math.max(towerDist, 0.01);
      next.position.x = RADIO_TOWER.x + nx * (RADIO_TOWER.radius + 0.55);
      next.position.z = RADIO_TOWER.z + nz * (RADIO_TOWER.radius + 0.55);
      next.velocity.x *= -0.35;
      next.velocity.z *= -0.35;
    }
  }

  // Ground / Platform contact resolution
  const newFloorY = surfaceHeightAt(next.position.x, next.position.z, prev.position.y);
  const minDroneY = newFloorY + DRONE_SKID_HEIGHT;

  if (next.position.y <= minDroneY) {
    const verticalImpact = -next.velocity.y;
    const totalTilt = Math.hypot(next.pitch, next.roll);

    if (verticalImpact > 7.8 || totalTilt > 1.25) {
      next.crashed = true;
      next.position.y = minDroneY;
      next.velocity.x *= 0.2;
      next.velocity.y = 0;
      next.velocity.z *= 0.2;
      next.motorPower = 0;
    } else {
      next.position.y = minDroneY;
      next.velocity.y = Math.max(0, next.velocity.y);
      // Skid friction
      const skidFriction = Math.exp(-10 * dt);
      next.velocity.x *= skidFriction;
      next.velocity.z *= skidFriction;
      next.onGround = true;
      // Gently level skids on ground
      next.pitch *= Math.exp(-8 * dt);
      next.roll *= Math.exp(-8 * dt);
      next.angVel.x = 0;
      next.angVel.z = 0;
    }
  } else {
    next.onGround = false;
  }

  // Water landing check (NE lake)
  const lakeDist = Math.hypot(next.position.x - 66, next.position.z + 10);
  if (lakeDist < 24 && next.position.y <= -1.45) {
    next.crashed = true;
    next.position.y = -1.45;
    next.velocity = { x: 0, y: 0, z: 0 };
    next.motorPower = 0;
  }

  // Battery & flight stats
  if (!next.onGround) {
    next.flightTimeSec += dt;
  }
  const powerDraw = effectiveArmed ? 0.04 + next.motorPower * next.motorPower * 0.28 : 0;
  next.batteryPct = Math.max(0, next.batteryPct - powerDraw * dt);

  const speed = Math.hypot(next.velocity.x, next.velocity.y, next.velocity.z);
  const curAlt = Math.max(0, next.position.y - DRONE_SKID_HEIGHT);
  if (curAlt > next.maxAltitudeReached) next.maxAltitudeReached = curAlt;
  if (speed > next.maxSpeedReached) next.maxSpeedReached = speed;

  return next;
}

/**
 * Computes the drone's local +Y up vector in world coordinates from YXZ Euler angles
 * (yaw around Y, then pitch around local X, then roll around local Z).
 */
export function computeBodyUpVector(yaw: number, pitch: number, roll: number): Vec3 {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cx = Math.cos(pitch);
  const sx = Math.sin(pitch);
  const cz = Math.cos(roll);
  const sz = Math.sin(roll);

  // Local up (0, 1, 0) rotated by R_z(roll) -> (-sz, cz, 0)
  // Then R_x(pitch) -> (-sz, cz*cx, cz*sx)
  // Wait: standard R_x(p) * (x, y, z) = (x, y*cx - z*sx, y*sx + z*cx)
  const lx = -sz;
  const ly = cz * cx;
  const lz = cz * sx;

  // Then R_y(yaw) * (lx, ly, lz) = (lx*cy + lz*sy, ly, -lx*sy + lz*cy)
  return {
    x: lx * cy + lz * sy,
    y: ly,
    z: -lx * sy + lz * cy,
  };
}

export function extractTelemetry(
  state: DronePhysicsState,
  flightMode: FlightMode,
  cameraMode: DroneTelemetry['cameraMode'],
  config: PhysicsConfig
): DroneTelemetry {
  const floorY = surfaceHeightAt(state.position.x, state.position.z, state.position.y);
  const agl = Math.max(0, state.position.y - DRONE_SKID_HEIGHT - floorY);
  const speed = Math.hypot(state.velocity.x, state.velocity.y, state.velocity.z);
  const wind = getWindVector(config.windTimeSec, config.windEnabled);
  const windSpeed = Math.hypot(wind.x, wind.z);

  // Heading in degrees 0..359 (0 = North / -Z)
  let headingDeg = ((-state.yaw * 180) / Math.PI) % 360;
  if (headingDeg < 0) headingDeg += 360;

  return {
    altitude: Math.max(0, state.position.y - DRONE_SKID_HEIGHT),
    agl,
    speed,
    verticalSpeed: state.velocity.y,
    headingDeg,
    pitchDeg: (-state.pitch * 180) / Math.PI,
    rollDeg: (-state.roll * 180) / Math.PI,
    batteryPct: state.batteryPct,
    armed: state.armed,
    onGround: state.onGround,
    crashed: state.crashed,
    flightMode,
    cameraMode,
    windSpeed,
    motorPower: state.motorPower,
  };
}
