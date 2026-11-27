import type { SpeedUnit } from './types';

export const DEFAULT_SPEED_UNIT: SpeedUnit = 'kmh';
const SPEED_UNIT_STORAGE_KEY = 'aerotrainer_speed_unit';

export function isValidSpeedUnit(value: unknown): value is SpeedUnit {
  return value === 'kmh' || value === 'ms';
}

export function loadSavedSpeedUnit(): SpeedUnit {
  if (typeof window === 'undefined') return DEFAULT_SPEED_UNIT;
  try {
    const saved = window.localStorage.getItem(SPEED_UNIT_STORAGE_KEY);
    return isValidSpeedUnit(saved) ? saved : DEFAULT_SPEED_UNIT;
  } catch {
    return DEFAULT_SPEED_UNIT;
  }
}

export function saveSpeedUnit(unit: SpeedUnit): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SPEED_UNIT_STORAGE_KEY, unit);
  } catch {
    // Ignore storage quota / privacy mode errors
  }
}

export interface FormattedSpeed {
  value: string;
  unitLabel: string;
}

/**
 * Converts a scalar speed in meters per second (m/s) into the chosen display unit.
 * Uses integer rounding for km/h and 1 decimal place for m/s to avoid coarse 3.6 km/h steps.
 */
export function formatSpeed(speedMetersPerSec: number, unit: SpeedUnit): FormattedSpeed {
  const safeSpeed = Number.isFinite(speedMetersPerSec) ? Math.max(0, speedMetersPerSec) : 0;
  if (unit === 'ms') {
    const rounded = safeSpeed < 0.05 ? 0 : safeSpeed;
    return {
      value: rounded.toFixed(1),
      unitLabel: 'm/s',
    };
  }
  return {
    value: String(Math.round(safeSpeed * 3.6)),
    unitLabel: 'km/h',
  };
}
