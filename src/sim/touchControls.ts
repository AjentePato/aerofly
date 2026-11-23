export interface TouchEnvironmentProbe {
  hasTouch: boolean;
  coarsePointer: boolean;
  viewportWidth: number;
}

/**
 * Determines whether on-screen virtual joysticks should start enabled by default.
 * Automatically activates on touch-capable devices, coarse-pointer screens, or compact mobile widths.
 */
export function shouldEnableTouchSticksByDefault(env: TouchEnvironmentProbe): boolean {
  if (env.coarsePointer || env.hasTouch) return true;
  if (env.viewportWidth > 0 && env.viewportWidth <= 920) return true;
  return false;
}

/**
 * Probes the current browser environment safely (returns false on SSR).
 */
export function detectTouchSticksDefault(): boolean {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  const touchParam = params.get('touch');
  if (touchParam === '1') return true;
  if (touchParam === '0') return false;

  const hasTouch =
    'ontouchstart' in window ||
    (typeof navigator !== 'undefined' && (navigator.maxTouchPoints ?? 0) > 0);
  const coarsePointer =
    typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
  const viewportWidth = window.innerWidth || 1440;

  return shouldEnableTouchSticksByDefault({
    hasTouch,
    coarsePointer,
    viewportWidth,
  });
}

/**
 * Picks an ergonomic virtual joystick radius for the current viewport height,
 * keeping comfortable travel even on short landscape phone screens.
 */
export function clampFloatingStickRadius(viewportHeight: number): number {
  if (viewportHeight > 0 && viewportHeight <= 480) return 54;
  return 68;
}

/**
 * Computes a portrait-compensated vertical FOV (degrees) so mobile portrait screens
 * retain comfortable horizontal visibility of gates and terrain without altering landscape/desktop FOV.
 */
export function computeAdaptiveVerticalFov(baseFovDeg: number, aspect: number): number {
  if (!Number.isFinite(aspect) || aspect <= 0 || aspect >= 1) {
    return baseFovDeg;
  }
  // Gently widen vertical FOV as aspect narrows below 1.0, capped safely against fisheye distortion
  const boost = (1 - aspect) * 42;
  return Math.min(98, baseFovDeg + boost);
}
