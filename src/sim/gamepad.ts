/**
 * Leitura e mapeamento puro da Gamepad API para controles padrão Xbox / XInput
 * (incluindo PS4 DualShock 4 emulado como Xbox via DS4Windows, cabo ou Bluetooth).
 * Utiliza exclusivamente os dois sticks analógicos em configuração Modo 2 de RC real.
 */
import type { StickInput } from './types';

export const STICK_DEADZONE = 0.08;

export interface GamepadLike {
  id?: string;
  connected?: boolean;
  mapping?: string;
  axes?: readonly number[];
}

export interface GamepadStatus {
  connected: boolean;
  label: string;
}

export interface GamepadSample {
  status: GamepadStatus;
  sticks: StickInput;
}

const NEUTRAL_STICKS: StickInput = { throttle: 0, yaw: 0, pitch: 0, roll: 0 };

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
 * Lê o estado atual do controle físico via Gamepad API do navegador de forma segura.
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
