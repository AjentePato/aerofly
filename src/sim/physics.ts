import { buildWorldRocks, buildWorldStructures, buildWorldTrees, type BoxCollider, type RockPlacement, type TreeCollider } from './structures';
import type {
  DronePhysicsState,
  DroneTelemetry,
  FlightMode,
  PhysicsConfig,
  StickInput,
  Vec3,
} from './types';

export const WORLD_RADIUS = 360;
export const DRONE_SKID_HEIGHT = 0.22;

export const LAKE_AREA = {
  x: 148,
  z: -32,
  waterRadius: 54,
  waterLevelY: -1.6,
};

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

export const WIND_TURBINES: ReadonlyArray<{ x: number; z: number; yaw: number; mastHeight: number }> = [
  { x: 195, z: -125, yaw: -Math.PI * 0.35, mastHeight: 28 },
  { x: 215, z: 45, yaw: -Math.PI * 0.35, mastHeight: 28 },
  { x: -45, z: -210, yaw: -Math.PI * 0.35, mastHeight: 28 },
  { x: 85, z: -225, yaw: -Math.PI * 0.35, mastHeight: 28 },
];

/**
 * Deterministic open-world terrain elevation at (x, z).
 * Central airfield (r < 48m) is graded flat at y = 0 for safe takeoff/landing.
 * Structure pads are smoothly leveled so doorways & tunnels sit flush.
 * Lake basin in NE quadrant dips below water level (-1.6m).
 * Outer perimeter (r > 320m) rises smoothly into natural mountain ridges.
 */
export function groundHeightAt(x: number, z: number): number {
  const r = Math.hypot(x, z);

  // Rolling broad hills beyond the expanded central airfield
  const hillMask = smoothstep(46, 86, r);
  const hills =
    (Math.sin(x * 0.024) * Math.cos(z * 0.022) * 5.2 +
      Math.sin((x + z) * 0.014) * 3.2 +
      Math.cos(x * 0.052 - z * 0.044) * 1.4) *
    hillMask;

  // Expanded Lake depression in the NE valley (centered around x=148, z=-32)
  const lakeDist = Math.hypot(x - LAKE_AREA.x, z - LAKE_AREA.z);
  const lakeDip = (1 - smoothstep(26, 64, lakeDist)) * -4.6;
  const lakeClear = smoothstep(42, 66, lakeDist);

  // Smooth plateau masks around training pads & pass-through architectural zones
  // Inner flat radii exceed each structure's diagonal half-extent + terrain vertex spacing (~8m)
  const padClear = smoothstep(10, 18, Math.hypot(x - ELEVATED_PAD.x, z - ELEVATED_PAD.z));
  const hangarClear = smoothstep(27, 40, Math.hypot(x - 96, z - 68));
  const containerClear = smoothstep(25, 38, Math.hypot(x - 138, z - 105));
  const silosClear = smoothstep(18, 28, Math.hypot(x - 82, z - 125));
  const ruinsClear = smoothstep(26, 39, Math.hypot(x + 145, z - 122));
  const aqueductClear = smoothstep(40, 54, Math.hypot(x + 95, z - 78));
  const house1Clear = smoothstep(18, 28, Math.hypot(x + 82, z + 48));
  const house2Clear = smoothstep(16, 26, Math.hypot(x + 112, z + 68));
  const house3Clear = smoothstep(16, 26, Math.hypot(x + 135, z + 45));
  const barn1Clear = smoothstep(18, 28, Math.hypot(x + 96, z + 102));
  const barn2Clear = smoothstep(18, 28, Math.hypot(x + 55, z - 118));
  const bunkerClear = smoothstep(20, 32, Math.hypot(x - 24, z + 175));

  const zoneMask =
    lakeClear *
    padClear *
    hangarClear *
    containerClear *
    silosClear *
    ruinsClear *
    aqueductClear *
    house1Clear *
    house2Clear *
    house3Clear *
    barn1Clear *
    barn2Clear *
    bunkerClear;

  // Natural mountain perimeter ridge beyond r = 320m
  const ridgeMask = smoothstep(315, 425, r);
  const angle = Math.atan2(z, x);
  const ridgeNoise = 1 + 0.28 * Math.sin(angle * 7) + 0.16 * Math.cos(angle * 13);
  const mountain = ridgeMask * 44 * ridgeNoise;

  return Math.max(-4.0, hills * zoneMask + lakeDip + mountain);
}

const BUILT_WORLD_STRUCTURES = buildWorldStructures(groundHeightAt);
const SOLID_STRUCTURE_BOXES: BoxCollider[] = BUILT_WORLD_STRUCTURES.parts.filter((p) => p.solid);
const WORLD_TREES: TreeCollider[] = buildWorldTrees(
  groundHeightAt,
  LAKE_AREA,
  ELEVATED_PAD,
  RADIO_TOWER,
  BUILT_WORLD_STRUCTURES.anchors,
  BUILT_WORLD_STRUCTURES.parts
);
const WORLD_ROCKS: RockPlacement[] = buildWorldRocks(
  groundHeightAt,
  BUILT_WORLD_STRUCTURES.parts,
  BUILT_WORLD_STRUCTURES.anchors,
  LAKE_AREA,
  ELEVATED_PAD,
  RADIO_TOWER,
  WIND_TURBINES
);

export function getSolidStructureBoxes(): readonly BoxCollider[] {
  return SOLID_STRUCTURE_BOXES;
}

export function getWorldTrees(): readonly TreeCollider[] {
  return WORLD_TREES;
}

export function getWorldRocks(): readonly RockPlacement[] {
  return WORLD_ROCKS;
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

    // Smooth yaw inertia & damping so Q/E turns accelerate and settle fluidly
    const targetYawRate = next.onGround && throttleIn <= -0.85 ? 0 : -yawIn * maxYawRate;
    const yawLambda = isNormal ? 11.5 : 14.0;
    next.angVel.y += (targetYawRate - next.angVel.y) * (1 - Math.exp(-yawLambda * dt));
    next.yaw += next.angVel.y * dt;

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

  // Wind turbines: tapered mast + nacelle + 3 live spinning rotor blades
  const rotorAngle = config.turbineAngle ?? 0;
  for (let t = 0; t < WIND_TURBINES.length; t++) {
    const wt = WIND_TURBINES[t];
    const dx = next.position.x - wt.x;
    const dz = next.position.z - wt.z;
    if (Math.abs(dx) > 15 || Math.abs(dz) > 15) continue;

    const baseY = groundHeightAt(wt.x, wt.z);
    const ly = next.position.y - baseY;
    if (ly < -0.5 || ly > wt.mastHeight + 13) continue;

    const c = Math.cos(wt.yaw);
    const s = Math.sin(wt.yaw);
    const lx = dx * c - dz * s;
    const lz = dx * s + dz * c;

    // 1. Mast cylinder (y = 0..28m, radius tapers 0.96 -> 0.48)
    if (ly >= -0.3 && ly <= wt.mastHeight + 0.5) {
      const mastR = 0.96 - clamp(ly / wt.mastHeight, 0, 1) * 0.48;
      const horizD = Math.hypot(lx, lz);
      if (horizD < mastR + 0.38) {
        const impactSpeed = Math.hypot(next.velocity.x, next.velocity.z);
        if (impactSpeed > 8.5) {
          next.crashed = true;
          next.motorPower = 0;
        } else {
          const inv = 1 / Math.max(horizD, 0.01);
          const nLocalX = lx * inv;
          const nLocalZ = lz * inv;
          const push = mastR + 0.42 - horizD;
          const nWorldX = nLocalX * c + nLocalZ * s;
          const nWorldZ = -nLocalX * s + nLocalZ * c;
          next.position.x += nWorldX * push;
          next.position.z += nWorldZ * push;
          next.velocity.x *= -0.35;
          next.velocity.z *= -0.35;
        }
      }
    }

    // 2. Nacelle box (local center (0, 28.2, 0.5), hx=0.8, hy=0.8, hz=1.8)
    const nacDx = lx;
    const nacDy = ly - 28.2;
    const nacDz = lz - 0.5;
    const clX = clamp(nacDx, -0.8, 0.8);
    const clY = clamp(nacDy, -0.8, 0.8);
    const clZ = clamp(nacDz, -1.8, 1.8);
    const nDistSq = (nacDx - clX) ** 2 + (nacDy - clY) ** 2 + (nacDz - clZ) ** 2;
    if (nDistSq < 0.36 * 0.36) {
      const impactSpeed = Math.hypot(next.velocity.x, next.velocity.y, next.velocity.z);
      if (impactSpeed > 8.5) {
        next.crashed = true;
        next.motorPower = 0;
      } else {
        const dist = Math.max(Math.sqrt(nDistSq), 0.01);
        const pen = 0.38 - dist;
        const nlx = (nacDx - clX) / dist;
        const nly = (nacDy - clY) / dist;
        const nlz = (nacDz - clZ) / dist;
        next.position.x += (nlx * c + nlz * s) * pen;
        next.position.y += nly * pen;
        next.position.z += (-nlx * s + nlz * c) * pen;
        next.velocity.x *= -0.35;
        next.velocity.y *= -0.35;
        next.velocity.z *= -0.35;
      }
    }

    // 3. Spinning 3 rotor blades at rotor hub (0, 28.2, 2.4)
    const relZ = lz - 2.4;
    const relY = ly - 28.2;
    if (Math.abs(relZ) < 0.58 && lx * lx + relY * relY < 12.2 * 12.2) {
      for (let b = 0; b < 3; b++) {
        const phi = rotorAngle + (b * Math.PI * 2) / 3;
        const bx = -Math.sin(phi);
        const by = Math.cos(phi);
        const proj = clamp(lx * bx + relY * by, 0.5, 11.65);
        const dist = Math.hypot(lx - bx * proj, relY - by * proj, relZ);
        if (dist < 0.62) {
          // Moving blade strike causes crash!
          next.crashed = true;
          next.motorPower = 0;
          break;
        }
      }
    }
  }

  // Pine trees: real collisions against wooden trunks & conical pine foliage
  const droneRadius = 0.36;
  for (let i = 0; i < WORLD_TREES.length; i++) {
    const tree = WORLD_TREES[i];
    const dx = next.position.x - tree.x;
    const dz = next.position.z - tree.z;
    if (Math.abs(dx) > 3.2 || Math.abs(dz) > 3.2) continue;

    const ly = next.position.y - tree.baseY;
    const maxTreeH = 8.0 * tree.scale + 0.5;
    if (ly < -0.4 || ly > maxTreeH) continue;

    const horizD = Math.hypot(dx, dz);

    // 1. Trunk cylinder (local y in [0, 2.8*scale], radius tapers 0.38 -> 0.24)
    const trunkTop = 2.8 * tree.scale;
    if (ly >= -0.3 && ly <= trunkTop + 0.2) {
      const t = clamp(ly / trunkTop, 0, 1);
      const trunkR = (0.38 - 0.14 * t) * tree.scale;
      if (horizD < trunkR + droneRadius) {
        const intoTrunk =
          horizD > 1e-4 ? -(next.velocity.x * (dx / horizD) + next.velocity.z * (dz / horizD)) : 0;
        if (intoTrunk > 7.5 || Math.hypot(next.velocity.x, next.velocity.z) > 8.5) {
          next.crashed = true;
          next.motorPower = 0;
        } else {
          const inv = 1 / Math.max(horizD, 0.01);
          const nx = dx * inv;
          const nz = dz * inv;
          const push = trunkR + droneRadius + 0.03 - horizD;
          next.position.x += nx * push;
          next.position.z += nz * push;
          if (intoTrunk > 0) {
            const bounce = 1.35 * intoTrunk;
            next.velocity.x += nx * bounce;
            next.velocity.z += nz * bounce;
          }
        }
      }
    }

    // 2. Foliage cone (bottom y0 = 2.2*scale, radius R0 = 2.1*scale -> apex y1 = 8.0*scale, radius 0)
    const y0 = 2.2 * tree.scale;
    const y1 = 8.0 * tree.scale;
    const R0 = 2.1 * tree.scale;
    const coneH = y1 - y0;
    if (ly >= y0 - droneRadius && ly <= y1 + droneRadius && horizD <= R0 + droneRadius) {
      // Closest point on 2D revolved cone cross-section (bottom segment + sloped side segment)
      const botR = clamp(horizD, 0, R0);
      const botDistSq = (horizD - botR) ** 2 + (ly - y0) ** 2;

      const sideT = clamp(((horizD - R0) * -R0 + (ly - y0) * coneH) / (R0 * R0 + coneH * coneH), 0, 1);
      const sideR = R0 * (1 - sideT);
      const sideY = y0 + coneH * sideT;
      const sideDistSq = (horizD - sideR) ** 2 + (ly - sideY) ** 2;

      const insideCone = ly >= y0 && ly <= y1 && horizD <= R0 * ((y1 - ly) / coneH);

      let nHoriz = 0;
      let nY = 0;
      let pen = 0;

      if (insideCone) {
        // Push out through nearest cone boundary (sloped side or flat underside)
        const distBot = ly - y0;
        const invSide = 1 / Math.hypot(coneH, R0);
        const distSide = ((y1 - ly) * R0 - horizD * coneH) * invSide;
        if (distBot < distSide) {
          nHoriz = 0;
          nY = -1;
          pen = distBot + droneRadius;
        } else {
          nHoriz = coneH * invSide;
          nY = R0 * invSide;
          pen = distSide + droneRadius;
        }
      } else {
        const useBottom = botDistSq <= sideDistSq;
        const minDistSq = useBottom ? botDistSq : sideDistSq;
        if (minDistSq < droneRadius * droneRadius) {
          const dist = Math.sqrt(minDistSq);
          pen = droneRadius - dist;
          if (dist > 1e-5) {
            const cr = useBottom ? botR : sideR;
            const cy = useBottom ? y0 : sideY;
            nHoriz = (horizD - cr) / dist;
            nY = (ly - cy) / dist;
          } else {
            nHoriz = useBottom ? 0 : coneH / Math.hypot(coneH, R0);
            nY = useBottom ? -1 : R0 / Math.hypot(coneH, R0);
          }
        }
      }

      if (pen > 0) {
        const hInv = horizD > 1e-4 ? 1 / horizD : 0;
        const nWorldX = hInv > 0 ? nHoriz * dx * hInv : 0;
        const nWorldZ = hInv > 0 ? nHoriz * dz * hInv : 0;
        const nWorldY = nY;

        next.position.x += nWorldX * pen;
        next.position.y += nWorldY * pen;
        next.position.z += nWorldZ * pen;

        const intoFoliage = -(
          next.velocity.x * nWorldX +
          next.velocity.y * nWorldY +
          next.velocity.z * nWorldZ
        );
        if (intoFoliage > 7.5) {
          next.crashed = true;
          next.motorPower = 0;
        } else if (intoFoliage > 0) {
          const bounce = 1.28 * intoFoliage;
          next.velocity.x += nWorldX * bounce;
          next.velocity.y += nWorldY * bounce;
          next.velocity.z += nWorldZ * bounce;
        }
      }
    }
  }

  // Structural architectural collisions (walls, pillars, arches, roofs, bridge deck)
  let landedOnStructure = false;
  for (let i = 0; i < SOLID_STRUCTURE_BOXES.length; i++) {
    const b = SOLID_STRUCTURE_BOXES[i];
    // Fast bounding-sphere reject before rotation math
    const dx = next.position.x - b.cx;
    const dy = next.position.y - b.cy;
    const dz = next.position.z - b.cz;
    const maxR = b.hx + b.hz + b.hy + 1.0;
    if (Math.abs(dx) > maxR || Math.abs(dy) > b.hy + 1.0 || Math.abs(dz) > maxR) continue;

    // Transform into box local coordinates (inverse Y rotation)
    const c = Math.cos(b.yaw);
    const s = Math.sin(b.yaw);
    const lx = dx * c - dz * s;
    const lz = dx * s + dz * c;

    const clampedX = clamp(lx, -b.hx, b.hx);
    const clampedY = clamp(dy, -b.hy, b.hy);
    const clampedZ = clamp(lz, -b.hz, b.hz);

    const diffX = lx - clampedX;
    const diffY = dy - clampedY;
    const diffZ = lz - clampedZ;
    const distSq = diffX * diffX + diffY * diffY + diffZ * diffZ;

    if (distSq >= droneRadius * droneRadius) continue;

    // Resolve penetration (handle both outside closest-point and deep interior overlap)
    let nLocalX = 0;
    let nLocalY = 0;
    let nLocalZ = 0;
    let pen = 0;

    if (distSq > 1e-8) {
      const dist = Math.sqrt(distSq);
      pen = droneRadius - dist;
      nLocalX = diffX / dist;
      nLocalY = diffY / dist;
      nLocalZ = diffZ / dist;
    } else {
      // Center is inside box: push out along nearest face
      const px = b.hx - Math.abs(lx);
      const py = b.hy - Math.abs(dy);
      const pz = b.hz - Math.abs(lz);
      if (py <= px && py <= pz) {
        nLocalY = dy >= 0 ? 1 : -1;
        pen = py + droneRadius;
      } else if (px <= pz) {
        nLocalX = lx >= 0 ? 1 : -1;
        pen = px + droneRadius;
      } else {
        nLocalZ = lz >= 0 ? 1 : -1;
        pen = pz + droneRadius;
      }
    }

    // Top-surface landing (roof, bridge deck, container top)
    if (nLocalY > 0.72 && next.velocity.y <= 0.8) {
      const vertImpact = -next.velocity.y;
      const totalTilt = Math.hypot(next.pitch, next.roll);
      if (vertImpact > 8.0 || totalTilt > 1.25) {
        next.crashed = true;
        next.motorPower = 0;
      } else {
        next.position.y = b.cy + b.hy + DRONE_SKID_HEIGHT;
        next.velocity.y = Math.max(0, next.velocity.y);
        const skidFriction = Math.exp(-10 * dt);
        next.velocity.x *= skidFriction;
        next.velocity.z *= skidFriction;
        next.pitch *= Math.exp(-8 * dt);
        next.roll *= Math.exp(-8 * dt);
        next.angVel.x = 0;
        next.angVel.z = 0;
        landedOnStructure = true;
      }
      continue;
    }

    // Rotate local normal back to world space
    const nWorldX = nLocalX * c + nLocalZ * s;
    const nWorldY = nLocalY;
    const nWorldZ = -nLocalX * s + nLocalZ * c;

    next.position.x += nWorldX * pen;
    next.position.y += nWorldY * pen;
    next.position.z += nWorldZ * pen;

    const intoWallSpeed = -(
      next.velocity.x * nWorldX +
      next.velocity.y * nWorldY +
      next.velocity.z * nWorldZ
    );
    if (intoWallSpeed > 8.5) {
      next.crashed = true;
      next.motorPower = 0;
    } else if (intoWallSpeed > 0) {
      const bounce = 1.35 * intoWallSpeed;
      next.velocity.x += nWorldX * bounce;
      next.velocity.y += nWorldY * bounce;
      next.velocity.z += nWorldZ * bounce;
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
    next.onGround = landedOnStructure;
  }

  // Water landing check (expanded NE lake)
  const lakeDist = Math.hypot(next.position.x - LAKE_AREA.x, next.position.z - LAKE_AREA.z);
  if (lakeDist < LAKE_AREA.waterRadius - 6 && next.position.y <= LAKE_AREA.waterLevelY + 0.15) {
    next.crashed = true;
    next.position.y = LAKE_AREA.waterLevelY + 0.15;
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
