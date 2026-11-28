/**
 * Leitura e mapeamento puro da Gamepad API para controles padrão Xbox / XInput
 * (incluindo PS4 DualShock 4 emulado como Xbox via DS4Windows, cabo ou Bluetooth).
 * Suporta sticks analógicos em Modo 2 de RC real, botões para menus/atalhos em voo
 * e feedback tátil (vibração) via dual-rumble.
 */
import type { StickInput } from './types';

export const STICK_DEADZONE = 0.08;
export const NAV_STICK_THRESHOLD = 0.52;
const RUMBLE_STORAGE_KEY = 'aerotrainer_gamepad_rumble';

/** Índices W3C 'standard' gamepad (Xbox XInput / PS4 via DS4Windows) */
export const GAMEPAD_BUTTONS = {
  A: 0, // Xbox A / PS4 Cruz (✕)
  B: 1, // Xbox B / PS4 Círculo (○)
  X: 2, // Xbox X / PS4 Quadrado (□)
  Y: 3, // Xbox Y / PS4 Triângulo (△)
  LB: 4, // Xbox LB / PS4 L1
  RB: 5, // Xbox RB / PS4 R1
  LT: 6, // Xbox LT / PS4 L2
  RT: 7, // Xbox RT / PS4 R2
  BACK: 8, // Xbox View/Back / PS4 Share
  START: 9, // Xbox Menu/Start / PS4 Options
  LS: 10,
  RS: 11,
  DPAD_UP: 12,
  DPAD_DOWN: 13,
  DPAD_LEFT: 14,
  DPAD_RIGHT: 15,
} as const;

export interface GamepadButtonLike {
  pressed?: boolean;
  value?: number;
}

export interface GamepadVibrationActuatorLike {
  playEffect?: (
    type: 'dual-rumble',
    params?: {
      startDelay?: number;
      duration?: number;
      weakMagnitude?: number;
      strongMagnitude?: number;
    }
  ) => Promise<unknown> | unknown;
  pulse?: (value: number, duration: number) => Promise<unknown> | unknown;
}

export interface GamepadLike {
  id?: string;
  connected?: boolean;
  mapping?: string;
  axes?: readonly number[];
  buttons?: ReadonlyArray<GamepadButtonLike | undefined>;
  vibrationActuator?: GamepadVibrationActuatorLike | null;
  hapticActuators?: ReadonlyArray<GamepadVibrationActuatorLike | undefined>;
}

export interface GamepadStatus {
  connected: boolean;
  label: string;
}

export interface GamepadSample {
  status: GamepadStatus;
  sticks: StickInput;
}

export interface GamepadButtonsSnapshot {
  connected: boolean;
  label: string;
  a: boolean;
  b: boolean;
  x: boolean;
  y: boolean;
  lb: boolean;
  rb: boolean;
  back: boolean;
  start: boolean;
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  rightStickY: number;
}

export type RumblePreset =
  | 'nav'
  | 'click'
  | 'tab'
  | 'arming'
  | 'armed'
  | 'gate'
  | 'bump'
  | 'crash'
  | 'victory'
  | 'test';

export interface RumbleEffectParams {
  durationMs: number;
  weakMagnitude: number;
  strongMagnitude: number;
}

const NEUTRAL_STICKS: StickInput = { throttle: 0, yaw: 0, pitch: 0, roll: 0 };

const EMPTY_BUTTONS: GamepadButtonsSnapshot = {
  connected: false,
  label: '',
  a: false,
  b: false,
  x: false,
  y: false,
  lb: false,
  rb: false,
  back: false,
  start: false,
  up: false,
  down: false,
  left: false,
  right: false,
  rightStickY: 0,
};

/**
 * Aplica zona morta simétrica e reescala suavemente o valor restante para [-1, 1],
 * eliminando drift de analógicos Xbox/DS4 sem perda súbita na borda da zona morta.
 */
export function rescaleStickAxis(raw: number, deadzone = STICK_DEADZONE): number {
  if (!Number.isFinite(raw)) return 0;
  const clamped = Math.max(-1, Math.min(1, raw));
  const abs = Math.abs(clamped);
  const dz = Math.max(0, Math.min(0.45, deadzone));
  if (abs <= dz) return 0;
  const scaled = (abs - dz) / (1 - dz);
  const result = Math.sign(clamped) * Math.min(1, scaled);
  return result === 0 ? 0 : result;
}

/**
 * Converte exclusivamente os 4 eixos dos dois sticks analógicos (padrão W3C/XInput)
 * para comandos RC Modo 2:
 * - Stick Esquerdo: Y invertido -> Aceleração (throttle), X -> Guinada (yaw)
 * - Stick Direito: Y invertido -> Arfagem (pitch), X -> Rolagem (roll)
 */
export function mapStandardGamepadToSticks(
  axes: readonly number[] | undefined,
  deadzone = STICK_DEADZONE
): StickInput {
  if (!axes || axes.length === 0) {
    return { ...NEUTRAL_STICKS };
  }

  const leftX = axes[0] ?? 0;
  const leftY = axes[1] ?? 0;
  const rightX = axes[2] ?? 0;
  const rightY = axes[3] ?? 0;

  return {
    throttle: rescaleStickAxis(-leftY, deadzone),
    yaw: rescaleStickAxis(leftX, deadzone),
    pitch: rescaleStickAxis(-rightY, deadzone),
    roll: rescaleStickAxis(rightX, deadzone),
  };
}

function isButtonPressed(buttons: ReadonlyArray<GamepadButtonLike | undefined> | undefined, idx: number): boolean {
  const btn = buttons?.[idx];
  if (!btn) return false;
  return Boolean(btn.pressed) || (typeof btn.value === 'number' && btn.value > 0.5);
}

/**
 * Extrai estado lógico dos botões e direção (D-Pad + analógico esquerdo) de um controle padrão.
 */
export function mapGamepadToButtonsSnapshot(gp: GamepadLike | null | undefined): GamepadButtonsSnapshot {
  if (!gp || gp.connected === false) {
    return { ...EMPTY_BUTTONS };
  }

  const buttons = gp.buttons;
  const axes = gp.axes ?? [];
  const leftX = axes[0] ?? 0;
  const leftY = axes[1] ?? 0;
  const rightY = rescaleStickAxis(axes[3] ?? 0, 0.22);

  return {
    connected: true,
    label: formatGamepadLabel(gp.id),
    a: isButtonPressed(buttons, GAMEPAD_BUTTONS.A),
    b: isButtonPressed(buttons, GAMEPAD_BUTTONS.B),
    x: isButtonPressed(buttons, GAMEPAD_BUTTONS.X),
    y: isButtonPressed(buttons, GAMEPAD_BUTTONS.Y),
    lb: isButtonPressed(buttons, GAMEPAD_BUTTONS.LB),
    rb: isButtonPressed(buttons, GAMEPAD_BUTTONS.RB),
    back: isButtonPressed(buttons, GAMEPAD_BUTTONS.BACK),
    start: isButtonPressed(buttons, GAMEPAD_BUTTONS.START),
    up: isButtonPressed(buttons, GAMEPAD_BUTTONS.DPAD_UP) || leftY < -NAV_STICK_THRESHOLD,
    down: isButtonPressed(buttons, GAMEPAD_BUTTONS.DPAD_DOWN) || leftY > NAV_STICK_THRESHOLD,
    left: isButtonPressed(buttons, GAMEPAD_BUTTONS.DPAD_LEFT) || leftX < -NAV_STICK_THRESHOLD,
    right: isButtonPressed(buttons, GAMEPAD_BUTTONS.DPAD_RIGHT) || leftX > NAV_STICK_THRESHOLD,
    rightStickY: rightY,
  };
}

/**
 * Seleciona o controle principal conectado com ao menos 4 eixos (dois sticks),
 * priorizando dispositivos com mapeamento 'standard' (Xbox / DS4Windows / XInput).
 */
export function pickPrimaryGamepad(
  gamepads: ArrayLike<GamepadLike | null | undefined> | null | undefined
): GamepadLike | null {
  if (!gamepads) return null;

  let fallback: GamepadLike | null = null;
  for (let i = 0; i < gamepads.length; i++) {
    const gp = gamepads[i];
    if (!gp || gp.connected === false) continue;
    if (!gp.axes || gp.axes.length < 4) continue;
    if (gp.mapping === 'standard') return gp;
    if (!fallback) fallback = gp;
  }

  return fallback;
}

/**
 * Formata um nome amigável e curto para exibição na interface a partir do ID do navegador.
 */
export function formatGamepadLabel(id: string | undefined): string {
  if (!id || !id.trim()) return 'Controle Xbox / DS4';
  const cleaned = id
    .replace(/\(.*?Vendor:.*?\)/gi, '')
    .replace(/\(.*?STANDARD GAMEPAD.*?\)/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return 'Controle Xbox / DS4';
  return cleaned.length > 34 ? `${cleaned.slice(0, 31).trim()}...` : cleaned;
}

/**
 * Lê os sticks analógicos do controle físico via Gamepad API.
 */
export function readBrowserGamepad(deadzone = STICK_DEADZONE): GamepadSample {
  if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') {
    return {
      status: { connected: false, label: '' },
      sticks: { ...NEUTRAL_STICKS },
    };
  }

  try {
    const gp = pickPrimaryGamepad(navigator.getGamepads());
    if (!gp) {
      return {
        status: { connected: false, label: '' },
        sticks: { ...NEUTRAL_STICKS },
      };
    }

    return {
      status: {
        connected: true,
        label: formatGamepadLabel(gp.id),
      },
      sticks: mapStandardGamepadToSticks(gp.axes, deadzone),
    };
  } catch {
    return {
      status: { connected: false, label: '' },
      sticks: { ...NEUTRAL_STICKS },
    };
  }
}

/**
 * Lê botões e direcional do controle físico para navegação de menus e atalhos de voo.
 */
export function readBrowserGamepadButtons(): GamepadButtonsSnapshot {
  if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') {
    return { ...EMPTY_BUTTONS };
  }
  try {
    const gp = pickPrimaryGamepad(navigator.getGamepads());
    return mapGamepadToButtonsSnapshot(gp);
  } catch {
    return { ...EMPTY_BUTTONS };
  }
}

/**
 * Calcula parâmetros de vibração (dual-rumble) adequados para cada evento do jogo.
 */
export function computeRumbleParams(preset: RumblePreset, intensityScale = 1): RumbleEffectParams {
  const s = Math.max(0.15, Math.min(1.5, Number.isFinite(intensityScale) ? intensityScale : 1));
  const clamp = (v: number) => Math.max(0, Math.min(1, v * s));

  switch (preset) {
    case 'nav':
      return { durationMs: 28, weakMagnitude: clamp(0.18), strongMagnitude: clamp(0.05) };
    case 'click':
      return { durationMs: 55, weakMagnitude: clamp(0.36), strongMagnitude: clamp(0.16) };
    case 'tab':
      return { durationMs: 42, weakMagnitude: clamp(0.28), strongMagnitude: clamp(0.12) };
    case 'arming':
      return { durationMs: 95, weakMagnitude: clamp(0.22), strongMagnitude: clamp(0.18) };
    case 'armed':
      return { durationMs: 180, weakMagnitude: clamp(0.55), strongMagnitude: clamp(0.45) };
    case 'gate':
      return { durationMs: 120, weakMagnitude: clamp(0.62), strongMagnitude: clamp(0.28) };
    case 'bump':
      return { durationMs: 145, weakMagnitude: clamp(0.42), strongMagnitude: clamp(0.62) };
    case 'crash':
      return { durationMs: 420, weakMagnitude: clamp(0.88), strongMagnitude: clamp(0.95) };
    case 'victory':
      return { durationMs: 280, weakMagnitude: clamp(0.7), strongMagnitude: clamp(0.42) };
    case 'test':
      return { durationMs: 260, weakMagnitude: clamp(0.68), strongMagnitude: clamp(0.72) };
  }
}

export function loadSavedRumbleEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const saved = window.localStorage.getItem(RUMBLE_STORAGE_KEY);
    if (saved === '0' || saved === 'false') return false;
    return true;
  } catch {
    return true;
  }
}

export function saveRumbleEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(RUMBLE_STORAGE_KEY, enabled ? '1' : '0');
  } catch {
    // Ignore storage quota / privacy mode errors
  }
}

/**
 * Dispara vibração tátil no controle conectado (suporta vibrationActuator e hapticActuators).
 */
export function triggerGamepadRumble(
  preset: RumblePreset,
  enabled = true,
  intensityScale = 1
): boolean {
  if (!enabled) return false;
  if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') {
    return false;
  }

  try {
    const gp = pickPrimaryGamepad(navigator.getGamepads());
    if (!gp) return false;

    const params = computeRumbleParams(preset, intensityScale);
    const actuator = gp.vibrationActuator;
    if (actuator && typeof actuator.playEffect === 'function') {
      const res = actuator.playEffect('dual-rumble', {
        startDelay: 0,
        duration: params.durationMs,
        weakMagnitude: params.weakMagnitude,
        strongMagnitude: params.strongMagnitude,
      });
      if (res && typeof (res as Promise<unknown>).catch === 'function') {
        (res as Promise<unknown>).catch(() => {});
      }
      return true;
    }

    const pulseActuator = gp.hapticActuators?.[0];
    if (pulseActuator && typeof pulseActuator.pulse === 'function') {
      const strength = Math.max(params.weakMagnitude, params.strongMagnitude);
      const res = pulseActuator.pulse(strength, params.durationMs);
      if (res && typeof (res as Promise<unknown>).catch === 'function') {
        (res as Promise<unknown>).catch(() => {});
      }
      return true;
    }
  } catch {
    // Ignore unsupported browser actuator errors
  }

  return false;
}
