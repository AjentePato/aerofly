import { ELEVATED_PAD } from './physics';
import type { DronePhysicsState, GatePoint, MissionDefinition, MissionId, MissionProgress } from './types';

export const MISSIONS: MissionDefinition[] = [
  {
    id: 'hover_takeoff',
    code: '01',
    title: 'Decolagem e Pairar',
    subtitle: 'Controle de aceleração e estabilidade',
    goalHint: 'Suba acima do heliponto e mantenha o drone dentro da zona de 5m a 10m por 3 segundos.',
    recommendedMode: 'normal',
    gates: [],
    hoverTarget: {
      x: 0,
      minY: 4.5,
      maxY: 10.5,
      z: 0,
      radius: 4.5,
      holdSec: 3.0,
    },
  },
  {
    id: 'gate_circuit',
    code: '02',
    title: 'Circuito de Portões',
    subtitle: 'Coordenação de Pitch, Roll e Yaw',
    goalHint: 'Atravesse os 6 portões aéreos em sequência pela pista de treinamento.',
    recommendedMode: 'normal',
    gates: [
      { x: 0, y: 5.5, z: -22, radius: 4.0, yaw: 0 },
      { x: 14, y: 7.0, z: -42, radius: 4.0, yaw: -0.55 },
      { x: 32, y: 8.5, z: -60, radius: 4.0, yaw: -0.35 },
      { x: 18, y: 9.0, z: -82, radius: 4.2, yaw: 1.2 },
      { x: -8, y: 7.5, z: -72, radius: 4.0, yaw: 2.35 },
      { x: -12, y: 5.5, z: -42, radius: 4.0, yaw: 3.0 },
    ],
  },
  {
    id: 'nose_in_orbit',
    code: '03',
    title: 'Órbita na Torre',
    subtitle: 'Orientação espacial e vôo lateral',
    goalHint: 'Contorne a torre de rádio pelos 4 pontos de controle mantendo o controle direcional.',
    recommendedMode: 'normal',
    gates: [
      { x: -16, y: 10, z: -62, radius: 4.0, yaw: 0 },
      { x: -28, y: 11, z: -74, radius: 4.0, yaw: Math.PI * 0.5 },
      { x: -40, y: 11, z: -62, radius: 4.0, yaw: Math.PI },
      { x: -28, y: 10, z: -50, radius: 4.0, yaw: -Math.PI * 0.5 },
    ],
  },
  {
    id: 'precision_landing',
    code: '04',
    title: 'Pouso de Precisão',
    subtitle: 'Aproximação suave e descida controlada',
    goalHint: 'Voe até a plataforma elevada ao nordeste e pouse suavemente sobre o alvo H.',
    recommendedMode: 'normal',
    gates: [
      { x: 18, y: 7.5, z: -22, radius: 4.2, yaw: -0.65 },
      { x: 34, y: 8.0, z: -38, radius: 4.2, yaw: -0.65 },
    ],
    targetLandingPad: {
      x: ELEVATED_PAD.x,
      y: ELEVATED_PAD.topY,
      z: ELEVATED_PAD.z,
      radius: 3.2,
    },
  },
  {
    id: 'free_flight',
    code: '05',
    title: 'Voo Livre · Mundo Aberto',
    subtitle: 'Exploração sem restrições pelo vale',
    goalHint: 'Explore livremente o campo aéreo, torre, lago e turbinas eólicas. Colete os anéis dourados pelo mapa.',
    recommendedMode: 'sport',
    gates: [
      { x: 0, y: 6.5, z: -26, radius: 4.2, yaw: 0 },
      { x: 56, y: 9.0, z: -12, radius: 4.4, yaw: 0.7 },
      { x: 64, y: 11.0, z: -56, radius: 4.4, yaw: 1.5 },
      { x: -26, y: 15.0, z: -76, radius: 4.4, yaw: 2.6 },
      { x: -58, y: 10.0, z: -22, radius: 4.4, yaw: 3.1 },
      { x: -42, y: 8.5, z: 32, radius: 4.4, yaw: -1.1 },
      { x: 26, y: 10.0, z: 46, radius: 4.4, yaw: -0.4 },
      { x: 76, y: 16.0, z: 34, radius: 4.5, yaw: 0.3 },
    ],
  },
];

export function getMissionById(id: MissionId): MissionDefinition {
  return MISSIONS.find((m) => m.id === id) ?? MISSIONS[0];
}

export function createInitialMissionProgress(missionId: MissionId): MissionProgress {
  const mission = getMissionById(missionId);
  return {
    missionId,
    activeGateIndex: 0,
    gatesCleared: 0,
    totalGates: mission.gates.length,
    hoverTimerSec: 0,
    hoverRequiredSec: mission.hoverTarget?.holdSec ?? 0,
    elapsedSec: 0,
    completed: false,
    failed: false,
    failReason: '',
    score: 0,
    ringsCollected: 0,
  };
}

export interface MissionStepResult {
  progress: MissionProgress;
  event: 'none' | 'gate_passed' | 'completed' | 'crashed';
}

export function evaluateMissionStep(
  prev: MissionProgress,
  drone: DronePhysicsState,
  dt: number
): MissionStepResult {
  if (prev.completed || prev.failed) {
    return { progress: prev, event: 'none' };
  }

  const mission = getMissionById(prev.missionId);
  const next: MissionProgress = {
    ...prev,
    elapsedSec: prev.elapsedSec + dt,
  };

  if (drone.crashed) {
    next.failed = true;
    next.failReason = 'Colisão ou impacto forte detectado.';
    return { progress: next, event: 'crashed' };
  }

  if (drone.batteryPct <= 0.1 && !drone.onGround) {
    next.failed = true;
    next.failReason = 'Bateria esgotada em voo.';
    return { progress: next, event: 'crashed' };
  }

  // Mission 1: Hover inside target cylinder
  if (mission.hoverTarget) {
    const ht = mission.hoverTarget;
    const horizDist = Math.hypot(drone.position.x - ht.x, drone.position.z - ht.z);
    const inZone =
      horizDist <= ht.radius && drone.position.y >= ht.minY && drone.position.y <= ht.maxY && !drone.onGround;

    if (inZone) {
      next.hoverTimerSec = Math.min(ht.holdSec, next.hoverTimerSec + dt);
      if (next.hoverTimerSec >= ht.holdSec) {
        next.completed = true;
        next.score = Math.max(500, Math.round(1500 - next.elapsedSec * 15));
        return { progress: next, event: 'completed' };
      }
    } else {
      next.hoverTimerSec = Math.max(0, next.hoverTimerSec - dt * 0.4);
    }
    return { progress: next, event: 'none' };
  }

  // Sequential Gate Checking
  if (mission.id === 'free_flight') {
    // In free flight, rings can be collected in any order once per run
    for (let i = 0; i < mission.gates.length; i++) {
      const bitMask = 1 << i;
      if ((next.ringsCollected & bitMask) !== 0) continue;
      const g = mission.gates[i];
      if (isInsideGate(drone, g)) {
        next.ringsCollected |= bitMask;
        next.gatesCleared += 1;
        next.score += 250;
        return { progress: next, event: 'gate_passed' };
      }
    }
    return { progress: next, event: 'none' };
  }

  if (next.activeGateIndex < mission.gates.length) {
    const gate = mission.gates[next.activeGateIndex];
    if (isInsideGate(drone, gate)) {
      next.gatesCleared += 1;
      next.activeGateIndex += 1;
      next.score += 300;

      if (next.activeGateIndex >= mission.gates.length && !mission.targetLandingPad) {
        next.completed = true;
        next.score += Math.max(200, Math.round(1200 - next.elapsedSec * 12));
        return { progress: next, event: 'completed' };
      }
      return { progress: next, event: 'gate_passed' };
    }
  }

  // Precision landing check after clearing approach gates
  if (mission.targetLandingPad && next.activeGateIndex >= mission.gates.length) {
    const pad = mission.targetLandingPad;
    const horizDist = Math.hypot(drone.position.x - pad.x, drone.position.z - pad.z);
    const speed = Math.hypot(drone.velocity.x, drone.velocity.y, drone.velocity.z);
    if (drone.onGround && horizDist <= pad.radius && Math.abs(drone.position.y - pad.y) < 1.2 && speed < 0.8) {
      next.completed = true;
      const accuracyBonus = Math.round((1 - horizDist / pad.radius) * 500);
      next.score += 600 + accuracyBonus + Math.max(100, Math.round(900 - next.elapsedSec * 10));
      return { progress: next, event: 'completed' };
    }
  }

  // Compute distance to next objective
  if (next.activeGateIndex < mission.gates.length) {
    const g = mission.gates[next.activeGateIndex];
    next.nextTargetDistM = Math.round(
      Math.hypot(drone.position.x - g.x, drone.position.y - g.y, drone.position.z - g.z)
    );
  } else if (mission.targetLandingPad && next.activeGateIndex >= mission.gates.length) {
    const p = mission.targetLandingPad;
    next.nextTargetDistM = Math.round(
      Math.hypot(drone.position.x - p.x, drone.position.y - p.y, drone.position.z - p.z)
    );
  } else {
    next.nextTargetDistM = undefined;
  }

  return { progress: next, event: 'none' };
}

function isInsideGate(drone: DronePhysicsState, gate: GatePoint): boolean {
  const dx = drone.position.x - gate.x;
  const dy = drone.position.y - gate.y;
  const dz = drone.position.z - gate.z;
  return dx * dx + dy * dy + dz * dz <= gate.radius * gate.radius;
}
