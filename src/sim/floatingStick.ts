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
 * The exact touch point becomes (0, 0) so initial input is always neutral.
 */
export function computeFloatingStickOrigin(
  touchX: number,
  touchY: number
): FloatingOrigin {
  return {
    x: touchX,
    y: touchY,
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
