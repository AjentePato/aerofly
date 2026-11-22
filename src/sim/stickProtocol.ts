import type { StickInput } from './types';

export const STICK_PACKET_HEADER = 0x01;
export const STICK_PACKET_BYTES = 9;

export type StickTransportMode = 'webrtc' | 'ws' | 'none';

function clampAxis(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(-1, Math.min(1, v));
}

/**
 * Escreve um pacote binário compacto de 9 bytes (Int16LE * 4 + cabeçalho 0x01)
 * dentro de um buffer pré-alocado para transmissão sem alocação de memória.
 */
export function encodeBinaryStickInto(
  stick: StickInput,
  outBuffer: Uint8Array<ArrayBuffer> = new Uint8Array(new ArrayBuffer(STICK_PACKET_BYTES))
): Uint8Array<ArrayBuffer> {
  const view = new DataView(outBuffer.buffer, outBuffer.byteOffset, outBuffer.byteLength);
  view.setUint8(0, STICK_PACKET_HEADER);
  view.setInt16(1, Math.round(clampAxis(stick.throttle) * 32767), true);
  view.setInt16(3, Math.round(clampAxis(stick.yaw) * 32767), true);
  view.setInt16(5, Math.round(clampAxis(stick.pitch) * 32767), true);
  view.setInt16(7, Math.round(clampAxis(stick.roll) * 32767), true);
  return outBuffer;
}

export function encodeBinaryStick(stick: StickInput): Uint8Array<ArrayBuffer> {
  return encodeBinaryStickInto(stick, new Uint8Array(new ArrayBuffer(STICK_PACKET_BYTES)));
}

/**
 * Decodifica um pacote binário de 9 bytes recebido via WebRTC DataChannel ou WebSocket.
 * Retorna null se o pacote for inválido ou tiver outro cabeçalho.
 */
export function decodeBinaryStick(data: ArrayBuffer | ArrayBufferView): StickInput | null {
  const view =
    data instanceof ArrayBuffer
      ? new DataView(data)
      : new DataView(data.buffer, data.byteOffset, data.byteLength);

  if (view.byteLength !== STICK_PACKET_BYTES) return null;
  if (view.getUint8(0) !== STICK_PACKET_HEADER) return null;

  return {
    throttle: clampAxis(view.getInt16(1, true) / 32767),
    yaw: clampAxis(view.getInt16(3, true) / 32767),
    pitch: clampAxis(view.getInt16(5, true) / 32767),
    roll: clampAxis(view.getInt16(7, true) / 32767),
  };
}

/**
 * Verifica se houve variação relevante entre duas leituras de stick.
 * Garante envio imediato quando qualquer eixo retorna exatamente a 0 (soltar o dedo)
 * ou sai de 0, evitando pacotes perdidos no retorno ao centro.
 */
export function sticksChangedSignificantly(
  next: StickInput,
  prev: StickInput,
  epsilon = 0.0025
): boolean {
  const axes: Array<keyof StickInput> = ['throttle', 'yaw', 'pitch', 'roll'];
  for (const k of axes) {
    const a = next[k];
    const b = prev[k];
    if ((a === 0) !== (b === 0)) return true;
    if (Math.abs(a - b) >= epsilon) return true;
  }
  return false;
}

/**
 * Prioriza DataChannel WebRTC direto (UDP sem ordenação/retransmissão) quando aberto,
 * mantendo WebSocket binário como fallback transparente.
 */
export function pickRelayTransport(
  dcState?: RTCDataChannelState | null,
  wsReadyState?: number | null
): StickTransportMode {
  if (dcState === 'open') return 'webrtc';
  if (wsReadyState === 1) return 'ws';
  return 'none';
}
