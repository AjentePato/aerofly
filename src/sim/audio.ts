export class DroneAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private osc1: OscillatorNode | null = null;
  private osc2: OscillatorNode | null = null;
  private motorGain: GainNode | null = null;
  private noiseGain: GainNode | null = null;
  private noiseFilter: BiquadFilterNode | null = null;
  private muted = false;
  private initialized = false;

  public init(): void {
    if (this.initialized) {
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return;
    }
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;

      const ctx = new AudioCtx();
      const master = ctx.createGain();
      master.gain.value = this.muted ? 0 : 0.28;
      master.connect(ctx.destination);

      // Dual detuned triangle/sawtooth oscillators for brushless quadcopter harmonic hum
      const motorGain = ctx.createGain();
      motorGain.gain.value = 0;

      const motorFilter = ctx.createBiquadFilter();
      motorFilter.type = 'lowpass';
      motorFilter.frequency.value = 480;

      const osc1 = ctx.createOscillator();
      osc1.type = 'sawtooth';
      osc1.frequency.value = 110;

      const osc2 = ctx.createOscillator();
      osc2.type = 'triangle';
      osc2.frequency.value = 166;

      osc1.connect(motorFilter);
      osc2.connect(motorFilter);
      motorFilter.connect(motorGain);
      motorGain.connect(master);

      osc1.start();
      osc2.start();

      // Filtered prop-wash airflow noise
      const bufferSize = ctx.sampleRate * 1.5;
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      const noiseSrc = ctx.createBufferSource();
      noiseSrc.buffer = noiseBuffer;
      noiseSrc.loop = true;

      const noiseFilter = ctx.createBiquadFilter();
      noiseFilter.type = 'bandpass';
      noiseFilter.frequency.value = 600;
      noiseFilter.Q.value = 0.8;

      const noiseGain = ctx.createGain();
      noiseGain.gain.value = 0;

      noiseSrc.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(master);
      noiseSrc.start();

      this.ctx = ctx;
      this.masterGain = master;
      this.osc1 = osc1;
      this.osc2 = osc2;
      this.motorGain = motorGain;
      this.noiseGain = noiseGain;
      this.noiseFilter = noiseFilter;
      this.initialized = true;
    } catch {
      // AudioContext unavailable in headless/restricted environment
    }
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(muted ? 0 : 0.28, this.ctx.currentTime, 0.04);
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public updateMotors(motorPower: number, active: boolean, speed: number): void {
    if (!this.initialized || !this.ctx || !this.osc1 || !this.osc2 || !this.motorGain || !this.noiseGain || !this.noiseFilter) {
      return;
    }
    const now = this.ctx.currentTime;
    if (!active || this.muted) {
      this.motorGain.gain.setTargetAtTime(0, now, 0.06);
      this.noiseGain.gain.setTargetAtTime(0, now, 0.06);
      return;
    }

    const p = Math.max(0, Math.min(1, motorPower));
    const baseFreq = 95 + p * 230 + Math.min(speed * 2.2, 45);
    this.osc1.frequency.setTargetAtTime(baseFreq, now, 0.05);
    this.osc2.frequency.setTargetAtTime(baseFreq * 1.51, now, 0.05);

    this.motorGain.gain.setTargetAtTime(0.03 + p * 0.11, now, 0.05);
    this.noiseFilter.frequency.setTargetAtTime(420 + p * 1200, now, 0.06);
    this.noiseGain.gain.setTargetAtTime(0.02 + p * 0.14, now, 0.06);
  }

  public playGateChime(): void {
    this.playTone(587.33, 880, 0.18, 'sine', 0.18);
  }

  public playSuccessFanfare(): void {
    if (!this.initialized || !this.ctx || !this.masterGain || this.muted) return;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, idx) => {
      this.playToneAt(freq, this.ctx!.currentTime + idx * 0.09, 0.22, 'triangle', 0.18);
    });
  }

  public playCrashThud(): void {
    this.playTone(145, 36, 0.34, 'sawtooth', 0.28);
    if (!this.initialized || !this.ctx || !this.masterGain || this.muted) return;
    // Short filtered metallic/carbon crunch burst
    const now = this.ctx.currentTime;
    const len = Math.floor(this.ctx.sampleRate * 0.22);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      ch[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * 0.055));
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 950;
    bp.Q.value = 0.7;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.32, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.21);
    src.connect(bp);
    bp.connect(gain);
    gain.connect(this.masterGain);
    src.start(now);
  }

  public playSecondaryBounce(intensity = 0.5): void {
    const vol = Math.max(0.05, Math.min(0.22, intensity * 0.18));
    this.playTone(95, 38, 0.14, 'triangle', vol);
  }

  public playClick(): void {
    this.playTone(720, 520, 0.05, 'sine', 0.08);
  }

  private playTone(startFreq: number, endFreq: number, duration: number, type: OscillatorType, volume: number): void {
    if (!this.initialized || !this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + duration);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  private playToneAt(freq: number, startTime: number, duration: number, type: OscillatorType, volume: number): void {
    if (!this.ctx || !this.masterGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, startTime);
    gain.gain.setValueAtTime(volume, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.02);
  }

  public dispose(): void {
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
      this.initialized = false;
    }
  }
}
