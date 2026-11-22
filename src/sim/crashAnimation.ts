/**
 * Simulação física pura da animação pós-colisão do drone:
 * rebote no ponto de impacto, queda com giro descontrolado (tumble),
 * quique no solo/superfície e temporizador antes da tela de resultado.
 */
import { WORLD_RADIUS, surfaceHeightAt } from './physics';
import type { DronePhysicsState, Vec3 } from './types';

export const CRASH_ANIMATION_DURATION_SEC = 1.25;

export interface CrashTumbleState {
  active: boolean;
  elapsedSec: number;
  durationSec: number;
  impactPos: Vec3;
  angVel: Vec3;
  bouncedGround: boolean;
  brokenProps: [boolean, boolean, boolean, boolean];
  modalTriggered: boolean;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/**
 * Cria um estado inativo padrão de animação de colisão.
 */
export function createIdleCrashTumble(): CrashTumbleState {
  return {
    active: false,
    elapsedSec: 0,
    durationSec: CRASH_ANIMATION_DURATION_SEC,
    impactPos: { x: 0, y: 0, z: 0 },
    angVel: { x: 0, y: 0, z: 0 },
    bouncedGround: false,
    brokenProps: [false, false, false, false],
    modalTriggered: false,
  };
}

/**
 * Inicializa os parâmetros de giro e rebote ao detectar uma colisão fatal.
 */
export function initCrashTumble(
  drone: DronePhysicsState,
  durationSec = CRASH_ANIMATION_DURATION_SEC
): { drone: DronePhysicsState; tumble: CrashTumbleState } {
  const floorY = surfaceHeightAt(drone.position.x, drone.position.z, drone.position.y);
  const agl = Math.max(0, drone.position.y - floorY - 0.25);
  const vx = drone.velocity.x;
  const vy = drone.velocity.y;
  const vz = drone.velocity.z;
  const speed = Math.hypot(vx, vy, vz);

  // Rebound away from impact direction; pop upward if hitting ground so tumble is clearly visible
  const isNearGround = agl < 0.55;
  const nextVy = isNearGround
    ? clamp(Math.abs(vy) * 0.28 + 2.6, 2.2, 4.8)
    : clamp(vy * 0.25 + 1.8, -2.5, 4.2);

  const reboundScale = isNearGround ? 0.52 : -0.36;
  const spinDir = (vx + vz) >= 0 ? 1 : -1;
  const spinMag = clamp(0.75 + speed * 0.08, 0.8, 1.55);

  const brokenProps: [boolean, boolean, boolean, boolean] = [
    true,
    speed > 6.5 || !isNearGround,
    vx >= 0,
    vz >= 0 || speed > 9,
  ];
  // Guarantee at least 2 broken props for visible crash damage
  if (!brokenProps[2] && !brokenProps[3]) {
    brokenProps[2] = true;
  }

  return {
    drone: {
      ...drone,
      armed: false,
      motorPower: 0,
      onGround: false,
      velocity: {
        x: vx * reboundScale + spinDir * 0.9,
        y: nextVy,
        z: vz * reboundScale - spinDir * 0.7,
      },
    },
    tumble: {
      active: true,
      elapsedSec: 0,
      durationSec,
      impactPos: { ...drone.position },
      angVel: {
        x: (9.2 + (vz >= 0 ? 1.8 : -1.8)) * spinMag,
        y: 6.4 * spinDir * spinMag,
        z: (-10.8 + (vx >= 0 ? 2.1 : -2.1)) * spinMag,
      },
      bouncedGround: false,
      brokenProps,
      modalTriggered: false,
    },
  };
}

/**
 * Avança um passo da queda e giro descontrolado após a colisão.
 */
export function stepCrashTumble(
  drone: DronePhysicsState,
  tumble: CrashTumbleState,
  dt: number
): { drone: DronePhysicsState; tumble: CrashTumbleState; groundImpactSpeed: number; finished: boolean } {
  if (!tumble.active) {
    return { drone, tumble, groundImpactSpeed: 0, finished: false };
  }

  const safeDt = clamp(dt, 0.001, 0.05);
  const nextDrone: DronePhysicsState = {
    ...drone,
    position: { ...drone.position },
    velocity: { ...drone.velocity },
    angVel: { ...drone.angVel },
    armed: false,
    motorPower: 0,
  };
  const nextTumble: CrashTumbleState = {
    ...tumble,
    impactPos: { ...tumble.impactPos },
    angVel: { ...tumble.angVel },
    brokenProps: [...tumble.brokenProps] as [boolean, boolean, boolean, boolean],
  };

  nextTumble.elapsedSec += safeDt;

  // Gravity & light air drag
  const airDrag = Math.exp(-0.65 * safeDt);
  nextDrone.velocity.x *= airDrag;
  nextDrone.velocity.z *= airDrag;
  nextDrone.velocity.y -= 15.2 * safeDt;

  nextDrone.position.x += nextDrone.velocity.x * safeDt;
  nextDrone.position.y += nextDrone.velocity.y * safeDt;
  nextDrone.position.z += nextDrone.velocity.z * safeDt;

  // Tumbling rotations
  nextDrone.pitch += nextTumble.angVel.x * safeDt;
  nextDrone.yaw += nextTumble.angVel.y * safeDt;
  nextDrone.roll += nextTumble.angVel.z * safeDt;

  // Soft world boundary containment
  const radial = Math.hypot(nextDrone.position.x, nextDrone.position.z);
  if (radial > WORLD_RADIUS) {
    const scale = WORLD_RADIUS / radial;
    nextDrone.position.x *= scale;
    nextDrone.position.z *= scale;
    nextDrone.velocity.x *= -0.35;
    nextDrone.velocity.z *= -0.35;
  }

  // Ground/surface bounce & sliding friction
  const floorY = surfaceHeightAt(nextDrone.position.x, nextDrone.position.z, drone.position.y);
  const restY = floorY + 0.16;
  let groundImpactSpeed = 0;

  if (nextDrone.position.y <= restY) {
    nextDrone.position.y = restY;
    if (nextDrone.velocity.y < -1.1) {
      groundImpactSpeed = -nextDrone.velocity.y;
      nextDrone.velocity.y = Math.abs(nextDrone.velocity.y) * 0.32;
      nextDrone.velocity.x *= 0.68;
      nextDrone.velocity.z *= 0.68;
      nextTumble.angVel.x *= 0.58;
      nextTumble.angVel.y *= 0.58;
      nextTumble.angVel.z *= 0.58;
      nextTumble.bouncedGround = true;
    } else {
      nextDrone.velocity.y = 0;
      nextDrone.onGround = true;
      const skid = Math.exp(-7.5 * safeDt);
      nextDrone.velocity.x *= skid;
      nextDrone.velocity.z *= skid;
      const rotDamp = Math.exp(-6.5 * safeDt);
      nextTumble.angVel.x *= rotDamp;
      nextTumble.angVel.y *= rotDamp;
      nextTumble.angVel.z *= rotDamp;
    }
  } else {
    nextDrone.onGround = false;
  }

  const finished = nextTumble.elapsedSec >= nextTumble.durationSec && !nextTumble.modalTriggered;
  return { drone: nextDrone, tumble: nextTumble, groundImpactSpeed, finished };
}
