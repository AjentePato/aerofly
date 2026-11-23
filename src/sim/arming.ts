import type { StickInput } from './types';

export const ARM_HOLD_DURATION_SEC = 0.8;
export const CSC_STICK_THRESHOLD = 0.32;
export const STICK_NEUTRAL_THRESHOLD = 0.2;
export const ARM_RELEASE_DECAY_RATE = 1.8;

export const NEUTRAL_STICKS: StickInput = { throttle: 0, yaw: 0, pitch: 0, roll: 0 };

export interface ArmingStepResult {
  armed: boolean;
  armingProgress: number;
  justArmed: boolean;
  holding: boolean;
}

export interface PostArmStickGateResult {
  awaitingStickRelease: boolean;
  flightSticks: StickInput;
}

/**
 * Detects the Mode-2 Combination Stick Command (CSC) for motor arming from controller/mobile sticks:
 * both sticks pulled down and inward (Left stick down-right: throttle <= -0.32 & yaw >= 0.32;
 * Right stick down-left: pitch <= -0.32 & roll <= -0.32), with generous margin for imprecise analog sticks.
 */
export function isCscArmGesture(sticks: StickInput): boolean {
  return (
    sticks.throttle <= -CSC_STICK_THRESHOLD &&
    sticks.yaw >= CSC_STICK_THRESHOLD &&
    sticks.pitch <= -CSC_STICK_THRESHOLD &&
    sticks.roll <= -CSC_STICK_THRESHOLD
  );
}

/**
 * Returns true when all 4 stick axes have returned near center/neutral.
 */
export function areSticksNeutral(sticks: StickInput): boolean {
  return (
    Math.abs(sticks.throttle) <= STICK_NEUTRAL_THRESHOLD &&
    Math.abs(sticks.yaw) <= STICK_NEUTRAL_THRESHOLD &&
    Math.abs(sticks.pitch) <= STICK_NEUTRAL_THRESHOLD &&
    Math.abs(sticks.roll) <= STICK_NEUTRAL_THRESHOLD
  );
}

/**
 * Prevents unintended motion right after arming: if the sticks were held to arm,
 * zeros out flight commands until the user returns all sticks to neutral first.
 */
export function resolvePostArmStickGate(
  prevAwaitingRelease: boolean,
  armed: boolean,
  justArmed: boolean,
  sticks: StickInput
): PostArmStickGateResult {
  if (!armed) {
    return {
      awaitingStickRelease: false,
      flightSticks: NEUTRAL_STICKS,
    };
  }

  let locked = prevAwaitingRelease;
  if (justArmed && !areSticksNeutral(sticks)) {
    locked = true;
  }

  if (locked) {
    if (areSticksNeutral(sticks)) {
      return {
        awaitingStickRelease: false,
        flightSticks: sticks,
      };
    }
    return {
      awaitingStickRelease: true,
      flightSticks: NEUTRAL_STICKS,
    };
  }

  return {
    awaitingStickRelease: false,
    flightSticks: sticks,
  };
}

/**
 * Advances motor arming progress while disarmed.
 * Requires holding KeyV on keyboard OR holding the inward-down stick gesture on a controller.
 */
export function stepArmingState(
  prevProgress: number,
  armed: boolean,
  crashed: boolean,
  holdKeyV: boolean,
  controllerSticks: StickInput,
  dt: number
): ArmingStepResult {
  if (crashed) {
    return {
      armed: false,
      armingProgress: 0,
      justArmed: false,
      holding: false,
    };
  }

  if (armed) {
    return {
      armed: true,
      armingProgress: 0,
      justArmed: false,
      holding: false,
    };
  }

  const safeDt = Math.max(0, Math.min(dt, 0.5));
  const clampedPrev = Math.max(0, Math.min(1, prevProgress));
  const holding = holdKeyV || isCscArmGesture(controllerSticks);

  if (!holding) {
    const decayed = Math.max(0, clampedPrev - safeDt * ARM_RELEASE_DECAY_RATE);
    return {
      armed: false,
      armingProgress: decayed,
      justArmed: false,
      holding: false,
    };
  }

  const nextProgress = Math.min(1, clampedPrev + safeDt / ARM_HOLD_DURATION_SEC);
  if (nextProgress >= 1) {
    return {
      armed: true,
      armingProgress: 0,
      justArmed: true,
      holding: true,
    };
  }

  return {
    armed: false,
    armingProgress: nextProgress,
    justArmed: false,
    holding: true,
  };
}
