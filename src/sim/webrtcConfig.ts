export const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
  iceCandidatePoolSize: 2,
};

export const RTC_STICK_CHANNEL_OPTIONS: RTCDataChannelInit = {
  ordered: false,
  maxRetransmits: 0,
};

export type SignalingMessage =
  | {
      type: 'rtc:offer';
      targetId?: string;
      fromId?: string;
      sdp: RTCSessionDescriptionInit;
    }
  | {
      type: 'rtc:answer';
      targetId?: string;
      fromId?: string;
      sdp: RTCSessionDescriptionInit;
    }
  | {
      type: 'rtc:ice';
      targetId?: string;
      fromId?: string;
      candidate: RTCIceCandidateInit;
    };
