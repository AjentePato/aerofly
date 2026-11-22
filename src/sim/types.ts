export type FlightMode = 'normal' | 'sport';

export type CameraMode = 'chase' | 'fpv';

export type GamePhase = 'title' | 'playing' | 'paused' | 'gameover';

export type MissionId =
  | 'hover_takeoff'
  | 'gate_circuit'
  | 'nose_in_orbit'
  | 'precision_landing'
  | 'structure_slalom'
  | 'free_flight';

export interface StickInput {
  /** Left stick Y: -1 (descend / zero thrust) to +1 (climb / max thrust) */
  throttle: number;
  /** Left stick X: -1 (yaw left) to +1 (yaw right) */
  yaw: number;
  /** Right stick Y: -1 (pitch backward) to +1 (pitch forward) */
  pitch: number;
  /** Right stick X: -1 (roll left) to +1 (roll right) */
  roll: number;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface DronePhysicsState {
  position: Vec3;
  velocity: Vec3;
  /** Euler angles in radians: pitch (X), yaw (Y), roll (Z) in YXZ intrinsic order */
  yaw: number;
  pitch: number;
  roll: number;
  /** Body angular velocities in rad/s */
  angVel: Vec3;
  /** Current normalized motor throttle output 0..1 */
  motorPower: number;
  armed: boolean;
  onGround: boolean;
  crashed: boolean;
  batteryPct: number;
  flightTimeSec: number;
  maxAltitudeReached: number;
  maxSpeedReached: number;
}

export interface PhysicsConfig {
  flightMode: FlightMode;
  windEnabled: boolean;
  windTimeSec: number;
  turbineAngle?: number;
}

export interface DroneTelemetry {
  altitude: number;
  agl: number;
  speed: number;
  verticalSpeed: number;
  headingDeg: number;
  pitchDeg: number;
  rollDeg: number;
  batteryPct: number;
  armed: boolean;
  onGround: boolean;
  crashed: boolean;
  flightMode: FlightMode;
  cameraMode: CameraMode;
  windSpeed: number;
  motorPower: number;
}

export interface GatePoint {
  x: number;
  y: number;
  z: number;
  radius: number;
  yaw: number;
  noPylons?: boolean;
}

export interface MissionDefinition {
  id: MissionId;
  code: string;
  title: string;
  subtitle: string;
  goalHint: string;
  recommendedMode: FlightMode;
  gates: GatePoint[];
  targetLandingPad?: { x: number; y: number; z: number; radius: number };
  hoverTarget?: { x: number; minY: number; maxY: number; z: number; radius: number; holdSec: number };
}

export interface MissionProgress {
  missionId: MissionId;
  activeGateIndex: number;
  gatesCleared: number;
  totalGates: number;
  hoverTimerSec: number;
  hoverRequiredSec: number;
  elapsedSec: number;
  completed: boolean;
  failed: boolean;
  failReason: string;
  score: number;
  ringsCollected: number;
  nextTargetDistM?: number;
}
