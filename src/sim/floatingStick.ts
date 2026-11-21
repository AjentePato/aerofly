export interface StickVec {
  x: number;
  y: number;
}

export interface FloatingOrigin {
  x: number;
  y: number;
}

/**
 * Computes the virtual joystick center when a finger touches down at (touchX, touchY).
 * In auto-centering mode, the exact touch point becomes (0, 0) so initial input is always neutral.
 * In stickyY mode (e.g. Acro throttle), the Y origin is shifted so the current throttle value
 * is preserved seamlessly at the finger's initial Y position without a sudden jump.
 */
export function computeFloatingStickOrigin(
  touchX: number,
  touchY: number,
  currentValue: StickVec,
  maxRadius: number,
  stickyY: boolean
): FloatingOrigin {
  return {
    x: touchX,
    y: stickyY ? touchY + currentValue.y * maxRadius : touchY,
  };
}

/**
 * Computes normalized [-1, 1] stick axes from a pointer position relative to the floating origin,
 * clamping circular magnitude to 1.0.
 */
export function computeFloatingStickValue(
  pointerX: number,
  pointerY: number,
  origin: FloatingOrigin,
  maxRadius: number
): StickVec {
  if (maxRadius <= 0) return { x: 0, y: 0 };
  let dx = (pointerX - origin.x) / maxRadius;
  let dy = (origin.y - pointerY) / maxRadius; // Up on screen is +1
  const mag = Math.hypot(dx, dy);
  if (mag > 1) {
    dx /= mag;
    dy /= mag;
  }
  return {
    x: Math.max(-1, Math.min(1, dx)),
    y: Math.max(-1, Math.min(1, dy)),
  };
}
